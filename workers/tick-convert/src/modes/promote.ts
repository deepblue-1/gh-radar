/**
 * promote 모드(D-07 · D-04) — `promote [--date YYYYMMDD]` · 장 마감 뒤 tickgw 당일 캐시 → 그날 격자(승격본).
 *
 * **승격본 = 장 마감 하루치 전체 또는 없음** — 두 겹으로 지킨다:
 *   ① tickgw(37-09)는 20:01 마감 마무리 폴링이 끝난 closed 키만 export 한다.
 *   ② 이 모드가 다시 확인한다 — 응답 date = 요청 date(아니면 run 실패 · 종료 1) · 키마다
 *      `closed_through_ns` ≥ 그날 20:00:00 KST ∧ 풀어 본 첫 레코드 recv ≥ 그날 08:00:00 KST ∧ 풀어 본 레코드 수 = export
 *      `records` ∧ 잘린 꼬리 없음. 하나라도 아니면 그 키는 업로드 · upsert 하지 않고 `incomplete` 로 센다 — 잘린 하루가
 *      promoted 로 남아 `grid_ready` 로 요청 변환을 막는 일이 없다.
 *   (closed_through 뒤 레코드가 조금 더 있어도 된다 — 계약은 「그 시각까지는 빠짐없음」 이다.)
 *
 * 한 키: export/bytes(이어붙인 zstd 프레임) → `splitZstdFrames` 로 나눠 프레임마다 풀기(Node zstd 는 첫 프레임만 푼다 · 37-02)
 *   → 레코드 수 · A3 · 첫/끝 recv · DayRateTracker(A3 ∧ G1) → 재확인 → `buildGridFile`(level TICK_ZSTD_LEVEL · 한 프레임)
 *   → 팀 값(team-day.ts gridTeamOf · quick 261103-j4d — 계산 실패는 그 행 팀 값만 null)
 *   → 업로드 `grid/<D>/<EX>/<isin>.promoted.ticks.zst` → `tick_grid_upsert('promoted', [row])`(sources ['promoted']).
 *   upsert 반환 0 = 그 키에 nightly · request 격자가 있다(RPC 모드 규칙 — promoted 는 promoted 위에만) → `skipped`.
 *   밤 변환본이 나중에 승격본을 덮는다. 모드별 객체 경로라 다른 모드 객체를 지우지 않는다.
 *
 * 실행 두 번(Scheduler 20:10 · 20:40): 20:10 에 아직 unclosed 였던 키는 20:40 이 잡는다. 이미 승격된 키를 다시 올리는 것은
 * 같은 바이트 덮어쓰기(promoted → promoted · 멱등)다. 20:40 에도 unclosed 인 키는 승격하지 않는다(요약 로그 `unclosed=`).
 *
 * 실패 격리: 키 하나의 실패(바이트 · 해제 · 업로드 · 메타)는 다른 키를 막지 않는다 · 실패가 하나라도 있으면 종료 1.
 * export 목록이 실패하면(401 · DATE_MISMATCH · 응답 date 불일치 · 바깥 모양) 그 run 전체가 실패(throw → 종료 1)다.
 * 목록 안 **키 하나의 모양 위반**은 그 키만 failed(CR-30 — 키 하나가 그날 승격 전체를 죽이지 않는다).
 * 레코드 0건 closed 키(`first_recv_ns: null` · NXT 비상장 · 거래정지)는 바이트를 당기지 않고 incomplete 로 센다.
 *
 * 격자 크기 상한(WR-30 · nightly · request 와 같은 규칙): 다시 압축한 격자가 `GRID_MAX_BYTES`(버킷 50MB)를 넘으면 올리지 않고
 * `tooLarge` 로 센다(실패 아님 · 종료 0 · 알림 없음). export `bytes`(119 원본 프레임 합)가 상한의 `PREFETCH_FACTOR` 배를 넘으면
 * 바이트를 당기기 전에 건너뛴다(2Gi Job 안에서 큰 키 원시를 펼치지 않는다).
 */
import zlib from "node:zlib";
import {
  A3_LAYOUT,
  DayRateTracker,
  TICK_FMT,
  concatBytes,
  dayStartNs,
  decodeFields,
  iterRecords,
  layoutOf,
  splitZstdFrames,
  tagOf,
} from "@gh-radar/shared";
import { requireTickgw } from "../config";
import { logger } from "../logger";
import { kstYmdDaysAgo } from "../archive";
import { buildGridFile } from "../grid-file";
import { GRID_MAX_BYTES, gridObjectPath, type Exchange } from "../store";
import { createMeta, type GridRow } from "../meta";
import { gridTeamOf } from "../team-day";
import { createTickgwExportClient, type TickgwExportClient, type TickgwExportKey } from "../tickgw-export";
import { UsageError, validYmd, type JobDeps } from "./request";

export type PromoteArgs = { date?: string };

/** promote 의존성 — tickgw 클라이언트는 테스트가 바꿔 넣을 수 있다(없으면 config 의 TICKGW_URL · TICKGW_SECRET 로 만든다). */
export type PromoteDeps = JobDeps & { tickgw?: TickgwExportClient };

/** 키 하나의 결과. */
export type KeyStatus = "written" | "skipped" | "incomplete" | "tooLarge" | "failed";

export type PromoteKeyResult = {
  isin: string;
  ex: Exchange;
  status: KeyStatus;
  reason: string | null;
  bytesRead: number;
  /** 팀 값 계산 실패(그 행 팀 값만 null · 실패 아님 · quick 261103-j4d). */
  teamFailed: boolean;
  teamMs: number;
};

export type PromoteOutcome = {
  mode: "promote";
  date: string;
  keys: number;
  written: number;
  skipped: number;
  incomplete: number;
  /** 격자가 `GRID_MAX_BYTES` 를 넘어 올리지 않은 키 수(실패 아님 · WR-30). */
  tooLarge: number;
  unclosed: number;
  /** 실패 키 + 실행 기록 실패 — 0 이 아니면 종료 1. */
  failed: number;
  bytesRead: number;
  /** 팀 값 계산 실패 키 수 · 소요 합(ms) — 실패로 세지 않는다(quick 261103-j4d). */
  teamFailed: number;
  teamMs: number;
  durationMs: number;
  results: PromoteKeyResult[];
};

const EXCHANGES: readonly Exchange[] = ["KRX", "NXT"];

/**
 * 받기 전 사전 판정 배수 — export `bytes`(119 원본 zstd 프레임 합 · 낮은 레벨)가 `GRID_MAX_BYTES` × 이 값을 넘으면
 * 바이트를 당기지 않고 tooLarge. 격자는 같은 원시를 더 높은 레벨 한 프레임으로 다시 압축하므로 원본 합보다 커지기 어렵다 —
 * 1.2배(≈ 60MiB)는 그 재압축 이득을 감안한 여유다. 이 사이 키는 받아서 다시 압축한 실제 크기로 판정한다.
 * 문턱은 반드시 tickgw 키 상한(`TICKGW_KEY_LIMIT_BYTES`)보다 작아야 한다 — export 에 실리는 키는 언제나 그 상한 이하라
 * (넘으면 tickgw 가 too_large → complete=false → closed 아님), 예전 2배(100MiB)는 발동할 수 없었다(R2-IN-02).
 * 잘못 거른 키는 승격만 빠지고 그날 밤 nightly 가 같은 상한 규칙으로 다시 만든다.
 */
export const PREFETCH_FACTOR = 1.2;

/** tickgw 기본 캐시 상한(TICKGW_CACHE_BYTES 100663296 · 키 하나도 이 이하) — PREFETCH 문턱이 이보다 작은지 시험이 본다. */
export const TICKGW_KEY_LIMIT_BYTES = 100_663_296;

/** `[--date YYYYMMDD]` — 모르는 플래그 · 빠진 값 · 형식 오류 → UsageError(종료 2). */
export function parsePromoteArgs(args: readonly string[]): PromoteArgs {
  const out: PromoteArgs = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const val = args[i + 1];
    if (flag !== "--date") throw new UsageError(`promote: 모르는 인자 ${flag}`);
    if (val === undefined || val.startsWith("--")) throw new UsageError(`promote: ${flag} 값이 없다`);
    if (!validYmd(val)) throw new UsageError(`promote: --date YYYYMMDD 가 필요하다 (받은 값 ${val})`);
    out.date = val;
  }
  return out;
}

/** 그날 20:00:00 KST(장 마감 · 마무리 폴링 하한) epoch ns — tickgw `kstDayStartNs(date, "2000")` 와 같은 값. */
export function closeNs(date: string): bigint {
  return dayStartNs(date, "2000");
}

function toNum(v: unknown): number {
  return typeof v === "bigint" ? Number(v) : Number(v);
}

/** 이어붙인 zstd 프레임 전부를 푼다(프레임마다 · 37-02 함정). */
export function decompressFrames(buf: Uint8Array): Uint8Array {
  const frames = splitZstdFrames(buf);
  if (frames.length === 1) return new Uint8Array(zlib.zstdDecompressSync(frames[0]!));
  return concatBytes(frames.map((f) => new Uint8Array(zlib.zstdDecompressSync(f))));
}

type Scanned = {
  records: number;
  firstNs: bigint | null;
  /** 마지막 온전한 레코드 끝 — 버퍼 길이와 다르면 잘린 꼬리. */
  end: number;
  rate: DayRateTracker;
};

/** 레코드 수 · 첫 recv · 잘린 꼬리 · 등락률(A3 ∧ G1). */
function scanRecords(raw: Uint8Array, ex: Exchange): Scanned {
  const label = ex.toLowerCase();
  const rate = new DayRateTracker();
  let records = 0;
  let firstNs: bigint | null = null;
  let end = 0;
  for (const r of iterRecords(raw)) {
    records += 1;
    if (firstNs === null) firstNs = r.recvNs;
    end = r.off + r.len;
    const payload = raw.subarray(r.off, r.off + r.len);
    if (tagOf(payload) === "A3" && layoutOf(payload) === A3_LAYOUT) {
      const row = decodeFields(A3_LAYOUT, payload, r.recvNs, label);
      if (row.board_id === "G1") rate.add(String(row.price_change_type), toNum(row.price_change), toNum(row.trade_price));
    }
  }
  return { records, firstNs, end, rate };
}

/** 키 하나 — 재확인 · 해제 · 재압축 · 업로드 · 메타. throw 는 호출자가 그 키의 failed 로 센다. */
async function promoteKey(
  deps: PromoteDeps,
  client: TickgwExportClient,
  meta: ReturnType<typeof createMeta>,
  date: string,
  key: TickgwExportKey,
  out: PromoteKeyResult,
): Promise<void> {
  // 레코드 0건 closed 키(CR-30) — 올릴 하루치가 없다 · 바이트도 당기지 않는다
  if (key.records === 0 || key.first_recv_ns === null) {
    out.status = "incomplete";
    out.reason = "레코드 0(export)";
    return;
  }
  // 완결 재확인 1 — 마감 마무리가 그날 20:00:00 KST 까지 닿았는가(받기 전에 — 잘린 키는 바이트도 당기지 않는다)
  if (BigInt(key.closed_through_ns) < closeNs(date)) {
    out.status = "incomplete";
    out.reason = `closed_through_ns ${key.closed_through_ns} < 20:00 KST`;
    return;
  }
  // 크기 사전 판정(WR-30) — 분명히 상한을 넘을 키는 바이트도 당기지 않는다
  if (key.bytes > GRID_MAX_BYTES * PREFETCH_FACTOR) {
    out.status = "tooLarge";
    out.reason = `TOO_LARGE export ${key.bytes}B > ${GRID_MAX_BYTES * PREFETCH_FACTOR}B(받기 전)`;
    return;
  }

  const buf = await client.bytes(date, key.isin, key.ex);
  out.bytesRead = buf.length;
  const raw = decompressFrames(buf);
  const s = scanRecords(raw, key.ex);

  // 완결 재확인 2 — 그날 08:00 부터 · export 가 말한 레코드 수 그대로 · 잘린 꼬리 없음
  const why: string[] = [];
  if (s.records === 0 || s.firstNs === null) why.push("레코드 0");
  else if (s.firstNs < dayStartNs(date)) why.push(`첫 recv ${s.firstNs} < 08:00 KST`);
  if (s.records !== key.records) why.push(`레코드 ${s.records} ≠ export records ${key.records}`);
  if (s.end !== raw.length) why.push(`잘린 꼬리 ${raw.length - s.end}B`);
  if (why.length > 0) {
    out.status = "incomplete";
    out.reason = why.join("; ");
    return;
  }

  const g = buildGridFile(raw, deps.config.zstdLevel);
  if (g.bytes.length > GRID_MAX_BYTES) {
    // nightly · request 와 같은 규칙 — 버킷이 거부할 업로드를 하지 않는다(실패 아님 · 밤 변환도 같은 키를 건너뛴다)
    out.status = "tooLarge";
    out.reason = `TOO_LARGE ${g.bytes.length}B > ${GRID_MAX_BYTES}B`;
    return;
  }
  const tm = gridTeamOf(raw, key.ex, { date, isin: key.isin, mode: "promoted" });
  out.teamMs = tm.ms;
  out.teamFailed = !tm.ok;
  const path = gridObjectPath(date, key.ex, key.isin, "promoted");
  await deps.store.upload(path, g.bytes);
  const row: GridRow = {
    date,
    exchange: key.ex,
    isin: key.isin,
    sources: ["promoted"],
    object_path: path,
    bytes: g.bytes.length,
    records: g.records,
    a3_count: g.a3Count,
    first_recv_ms: g.firstRecvMs,
    last_recv_ms: g.lastRecvMs,
    base_px: s.rate.base(),
    high_rate: s.rate.highRate(),
    last_rate: s.rate.lastRate(),
    fmt: TICK_FMT,
    ...tm.team,
  };
  const n = await meta.upsertGrids("promoted", [row]);
  if (n === 0) {
    out.status = "skipped";
    out.reason = "nightly/request 격자가 있다(모드 규칙)";
  } else {
    out.status = "written";
  }
}

export async function runPromote(deps: PromoteDeps, args: PromoteArgs = {}): Promise<PromoteOutcome> {
  const clock = deps.clock ?? Date.now;
  const t0 = clock();
  const date = args.date ?? kstYmdDaysAgo(deps.now, 0);
  const client = deps.tickgw ?? createTickgwExportClient(requireTickgw(deps.config));
  const meta = createMeta(deps.sb);

  // 목록 — 실패(401 · DATE_MISMATCH · 모양)는 run 실패
  const list = await client.list(date);
  if (list.date !== date) {
    // 캐시 날짜와 Job 날짜가 어긋난 승격 금지 — 다른 날의 하루를 이 날짜 격자로 올리지 않는다
    throw new Error(`promote: export date ${list.date} ≠ 요청 date ${date} — 승격하지 않는다`);
  }

  const out: PromoteOutcome = {
    mode: "promote",
    date,
    keys: list.keys.length + list.rejected.length,
    written: 0,
    skipped: 0,
    incomplete: 0,
    tooLarge: 0,
    unclosed: list.unclosed,
    failed: 0,
    bytesRead: 0,
    teamFailed: 0,
    teamMs: 0,
    durationMs: 0,
    results: [],
  };

  // 키 단위 모양 위반(CR-30) — 그 키만 failed · 나머지는 그대로 승격한다
  for (const rj of list.rejected) {
    logger.error({ date, ex: rj.ex, isin: rj.isin, reason: rj.reason }, "tick-convert promote: export 키 모양 위반 — 그 키만 실패");
    out.failed += 1;
    if (rj.ex === null) continue; // 거래소를 모르면 거래소별 실행 기록에는 못 싣는다(failed 수 · 로그에만)
    out.results.push({
      isin: rj.isin ?? "?",
      ex: rj.ex,
      status: "failed",
      reason: rj.reason,
      bytesRead: 0,
      teamFailed: false,
      teamMs: 0,
    });
  }

  for (const key of list.keys) {
    const r: PromoteKeyResult = {
      isin: key.isin,
      ex: key.ex,
      status: "failed",
      reason: null,
      bytesRead: 0,
      teamFailed: false,
      teamMs: 0,
    };
    try {
      await promoteKey(deps, client, meta, date, key, r);
    } catch (err) {
      r.status = "failed";
      r.reason = err instanceof Error ? err.message : String(err);
      logger.error({ date, ex: key.ex, isin: key.isin, err }, "tick-convert promote key failed — 그 키만 실패");
    }
    if (r.status === "incomplete") {
      logger.warn({ date, ex: key.ex, isin: key.isin, reason: r.reason }, "tick-convert promote: 하루치 전체가 아니다 — 승격 안 함");
    }
    if (r.status === "tooLarge") {
      logger.warn({ date, ex: key.ex, isin: key.isin, reason: r.reason, max: GRID_MAX_BYTES }, "tick-convert promote grid too large — 건너뜀(실패 아님)");
    }
    out.results.push(r);
    out.bytesRead += r.bytesRead;
    out.teamMs += r.teamMs;
    if (r.teamFailed) out.teamFailed += 1;
    out[r.status] += 1; // KeyStatus 이름 = 결과 카운터 이름
  }

  out.durationMs = Math.max(0, Math.round(clock() - t0));

  // 거래소별 실행 기록(mode promoted) — 기록 실패도 실패로 센다(알림 정책이 잡게)
  for (const ex of EXCHANGES) {
    const rs = out.results.filter((r) => r.ex === ex);
    const cnt = (st: KeyStatus) => rs.filter((r) => r.status === st).length;
    const notes: string[] = [];
    if (cnt("failed") > 0) notes.push(`failed ${cnt("failed")}`);
    if (cnt("incomplete") > 0) notes.push(`incomplete ${cnt("incomplete")}`);
    if (cnt("tooLarge") > 0) notes.push(`too_large ${cnt("tooLarge")}`);
    if (cnt("skipped") > 0) notes.push(`skipped ${cnt("skipped")}`);
    try {
      await meta.runRecord({
        date,
        exchange: ex,
        mode: "promoted",
        ok: cnt("failed") === 0,
        targets: rs.length,
        written: cnt("written"),
        bytes_read: rs.reduce((a, r) => a + r.bytesRead, 0),
        duration_ms: out.durationMs,
        error: notes.length > 0 ? notes.join("; ") : null,
      });
    } catch (err) {
      logger.error({ date, ex, err }, "tick-convert promote run record failed");
      out.failed += 1;
    }
  }

  logger.info(
    { result: { ...out, results: undefined } },
    `[tick-convert] mode=promote date=${date} keys=${out.keys} written=${out.written} skipped=${out.skipped} ` +
      `incomplete=${out.incomplete} unclosed=${out.unclosed} failed=${out.failed} too_large=${out.tooLarge} bytes_read=${out.bytesRead} ` +
      `team_failed=${out.teamFailed} team_ms=${out.teamMs} ms=${out.durationMs}`,
  );
  return out;
}
