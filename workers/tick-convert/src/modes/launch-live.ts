/**
 * launch-live 모드(quick 261104-n7i) — `launch-live`(인자 없음).
 *
 * 목적: 발사 조각 대기열 값(launch_piece_queue)을 밤 nightly 까지 기다리지 않고 **당일 발사 직후** 계산해 둔다(D-1 · D-2).
 *   원본 = radar-gw tickgw `/internal/ticks/live` 당일 바이트(D-3 · tickgw-live.ts) · 계산 = shared `launchQueueOf` 한 벌
 *   (워커 래퍼 gridLaunchOf · nightly · backfill-launch 와 같은 함수) · 웹 · server 는 읽기만.
 * 시각(D-1 · Scheduler · scripts/deploy-tick-convert.sh): 평일 16:01 · 16:03 · 16:10 KST(16:00 Q16) · 09:01 · 09:03 KST
 *   (09:00:27/29 A · 09:00:30 N). 사용자 트리거 없음 — 호출량은 사용자 수와 독립.
 *
 * 순서:
 *   ① date = KST 오늘 · `launch_queue_inputs(date)`(RPC 오류 = throw → 종료 1)
 *   ② 창 필터 — fire_base(KST) 가 [now − LIVE_WINDOW_MS, now − LIVE_MIN_AGE_MS] 인 조각만(16:xx run 은 Q16 만 · 09:0x 는 N/A 만
 *      자연히 걸린다). fire_base 를 못 읽는 조각 · KRX/NXT 가 아닌 조각은 warn 후 제외.
 *   ③ (isin, fire_exchange) 로 묶는다(입력 순서). 키 0 이면 tickgw 호출 없이 info 요약(휴장일 · 창 밖).
 *   ④ 키마다 순차로 — 리스 인식 게이트(아래) · run 예산 확인 뒤 fetchLiveDay(needMs = 그 키 fire_base 최대 + LIVE_NEED_AFTER_MS ·
 *      키 데드라인 LIVE_KEY_DEADLINE_MS) → done 이면 decompressFrames → gridLaunchOf(object_path = 'live:<as-of ISO UTC ms>') ·
 *      deferred 는 warn · failed 는 error.
 *   ⑤ LIVE_SET_BATCH 행마다 · 끝에 `launch_queue_set`(20261104710000 가드 — live 는 KST 오늘만 · live 위에 단조 · 격자 값을 못 덮음).
 *      보낸 − 쓴 = set_skipped(격자 값 · 더 새 live 에 막힘 · 조각 사라짐 · 마이그레이션 전이면 전부).
 *   ⑥ 요약 info 한 줄(keys · computed · written · set_skipped · deferred · failed · launch_failed · fills_empty · ms).
 *
 * 운영 규율(tickgw 를 틱뷰어 사용자와 나눠 쓴다 — RESEARCH §2):
 *   - 리스 인식 게이트: tickgw 활성 키는 MAX_KEYS 8(처음 touch 순)이고 요청마다 리스 30초다. 끝낸 키도 마지막 요청 뒤 30초 동안
 *     우리 리스로 남는다 → 「lastReqAt + LIVE_LEASE_GUARD_MS(31초) > 지금」 인 우리 키가 LIVE_KEY_SLOTS(4) 이상이면 가장 이른 만료까지
 *     기다린 뒤 새 키를 연다. 사용자 몫으로 늘 ≥ 4 슬롯이 남는다. 받기는 순차다(119 호출 동시성이 전역 1 이라 동시 받기로 총시간이
 *     줄지 않는다 · 메모리 · 시험이 단순 · 31초 리스 창이 시간을 지배하는 점은 같다).
 *   - run 예산: 시작 뒤 LIVE_RUN_BUDGET_MS(100초)가 지나면 새 키를 열지 않는다 — 남은 키는 deferred(budget · warn 한 줄) · 다음 run 이 잇는다.
 *     Job task-timeout 300s 산식: 예산 100초(게이트 대기 포함) + 마지막 키 데드라인 90초 + 진행 중 요청 타임아웃 30초 + 해제 · 계산 · set
 *     (키당 ~1초) ≈ 230초 < 300초. 겹친 실행(16:01 이 16:03 까지)도 tickgw 키당 폴러 하나 · DB 단조 가드라 안전.
 *   - 첫 로딩 실측(37-17 · 08:00 부터): 한 시간치는 키당 대개 1초 안팎 · 대형주 하루치 수 초~수십 초(VPN ~1MB/s) — 키 데드라인 90초.
 *   - fills_empty: 창 안 조각 중 profile N · A(LAUNCH_RUN_PROFILES) 이고 fills 가 빈 조각 수 — 요약에만(미체결도 0 이라 경고 아님 ·
 *     relay 저널 지연이면 「미체결」 로 잘못 계산된다 · 09:03 · nightly 가 고친다 — RESEARCH §3).
 *
 * 표식: object_path = 'live:' + new Date(asOfMs).toISOString() — 고정 폭이라 문자열 비교 = 시각 비교. 밤 nightly 가 그날 격자 경로로
 *   덮는다(launch_queue_pending 은 격자가 생기면 live 행을 경로 불일치로 다시 고른다).
 *
 * 종료 코드: 키 failed(503 · 5xx · 네트워크 · blocked · 해제 실패) · set RPC 오류 · inputs RPC 오류 · tickgw 401 = 1.
 *   deferred(timeout · queued · incomplete) · 계산 실패 launch_failed(gridLaunchOf 가 error 로그) · set_skipped = 0(로그만).
 * `tick_convert_runs` 에 기록하지 않는다 — 격자 변환이 아니다(모드 CHECK 변경 회피 · 로그만). `deps.store` 를 쓰지 않는다.
 */
import { LAUNCH_RUN_PROFILES, parseTickTime } from "@gh-radar/shared";
import { requireTickgw } from "../config";
import { logger } from "../logger";
import { kstYmdDaysAgo } from "../archive";
import { createMeta, type LaunchInputRow, type LaunchSetRow } from "../meta";
import { gridLaunchOf } from "../launch-queue";
import { createTickgwLiveClient, fetchLiveDay, type TickgwLiveClient } from "../tickgw-live";
import type { TickgwEx } from "../tickgw-export";
import { decompressFrames } from "./promote";
import { UsageError, type JobDeps } from "./request";

/** 창 — fire_base 가 지금 − 45분 이후인 조각만(16:10 run 이 16:00 을 · 09:03 run 이 09:00:27 을 잡는다). */
export const LIVE_WINDOW_MS = 45 * 60_000;
/** 창 — fire_base 가 지금 − 20초 이전인 조각만(막 발사한 조각은 다음 run). */
export const LIVE_MIN_AGE_MS = 20_000;
/** as-of 여유 — 그 키 fire_base 최대 + 20초까지 받은 하루여야 계산(16:00 B6 증가 · 09:00 런은 기준 뒤 1초 창이면 된다). */
export const LIVE_NEED_AFTER_MS = 20_000;
/** 키 하나 받기 데드라인. */
export const LIVE_KEY_DEADLINE_MS = 90_000;
/** set 한 번에 넘기는 행 수. */
export const LIVE_SET_BATCH = 50;
/** 우리가 동시에 쥐는 tickgw 리스 키 상한(MAX_KEYS 8 의 절반 — 틱뷰어 사용자 몫 ≥ 4). */
export const LIVE_KEY_SLOTS = 4;
/** 우리 리스가 살아 있다고 보는 시간 — tickgw 리스 30초 + 1초 여유(마지막 요청 시각 기준). */
export const LIVE_LEASE_GUARD_MS = 31_000;
/** run 시작 뒤 이 시간이 지나면 새 키를 열지 않는다(남은 키 deferred). */
export const LIVE_RUN_BUDGET_MS = 100_000;

export type LaunchLiveArgs = Record<string, never>;

/** 인자를 받지 않는다(tickgw 는 KST 오늘만 · `--date` 없음) — 하나라도 있으면 UsageError(종료 2). */
export function parseLaunchLiveArgs(args: readonly string[]): LaunchLiveArgs {
  if (args.length > 0) {
    throw new UsageError(`launch-live: 인자를 받지 않는다(tickgw 는 KST 오늘만) — 받은 값 ${args.join(" ")}`);
  }
  return {};
}

/** launch-live 의존성 — tickgw live 클라이언트는 테스트가 바꿔 넣을 수 있다(없으면 config 의 TICKGW_URL · TICKGW_SECRET). */
export type LaunchLiveDeps = JobDeps & { tickgwLive?: TickgwLiveClient };

export type LaunchLiveOutcome = {
  mode: "launch-live";
  date: string;
  /** 창 안 (isin, fire_exchange) 키 수. */
  keys: number;
  /** 계산까지 마친 키 수. */
  computed: number;
  /** set 이 실제로 쓴 행 수. */
  written: number;
  /** set 에 보냈지만 쓰이지 않은 행 수(가드에 막힘 · 로그만). */
  setSkipped: number;
  /** 미룬 키 수(timeout · queued · incomplete · budget) — 다음 run 이 잇는다. */
  deferred: number;
  /** tickgw · 해제 · set 실패(키 수 · set 은 보낸 행 수) — 0 이 아니면 종료 1. */
  failed: number;
  /** 계산 실패 키 수(gridLaunchOf 가 error 로그 · 실패 아님). */
  launchFailed: number;
  /** 창 안 조각 중 profile N · A 이고 fills 가 빈 조각 수(저널 지연 판별 지표 · 경고 아님). */
  fillsEmpty: number;
  durationMs: number;
  /** 계산한 행(시험 검증용 · 같은 값을 set 에 넘겼다). */
  rows: LaunchSetRow[];
};

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** fire_base(KST HH:MM:SS) + 날짜 → epoch ms · 못 읽으면 null. */
function fireMsOf(p: LaunchInputRow, date: string): number | null {
  const ns = parseTickTime(p.fire_base, date);
  return ns === null ? null : Number(ns / 1_000_000n);
}

export async function runLaunchLive(deps: LaunchLiveDeps, _args: LaunchLiveArgs): Promise<LaunchLiveOutcome> {
  const clock = deps.clock ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const t0 = clock();
  const meta = createMeta(deps.sb);
  const date = kstYmdDaysAgo(deps.now, 0);
  const out: LaunchLiveOutcome = {
    mode: "launch-live",
    date,
    keys: 0,
    computed: 0,
    written: 0,
    setSkipped: 0,
    deferred: 0,
    failed: 0,
    launchFailed: 0,
    fillsEmpty: 0,
    durationMs: 0,
    rows: [],
  };

  // ① 입력 — RPC 오류는 그대로 throw(종료 1)
  const inputs = await meta.launchInputs(date);

  // ② 창 필터
  const nowMs = deps.now.getTime();
  const lo = nowMs - LIVE_WINDOW_MS;
  const hi = nowMs - LIVE_MIN_AGE_MS;
  type Key = { isin: string; ex: TickgwEx; pieces: LaunchInputRow[]; maxFireMs: number };
  const keys = new Map<string, Key>();
  for (const p of inputs) {
    const ms = fireMsOf(p, date);
    if (ms === null) {
      logger.warn({ date, piece: p }, "tick-convert launch-live: fire_base 를 못 읽는 조각 — 제외");
      continue;
    }
    if (ms < lo || ms > hi) continue;
    if (p.fire_exchange !== "KRX" && p.fire_exchange !== "NXT") {
      logger.warn({ date, piece: p }, "tick-convert launch-live: fire_exchange 가 KRX/NXT 가 아닌 조각 — 제외");
      continue;
    }
    if ((LAUNCH_RUN_PROFILES as readonly string[]).includes(p.profile) && p.fills.length === 0) out.fillsEmpty += 1;
    // ③ (isin, fire_exchange) 묶기 — 입력 순서 유지
    const k = `${p.isin}|${p.fire_exchange}`;
    const cur = keys.get(k);
    if (cur) {
      cur.pieces.push(p);
      cur.maxFireMs = Math.max(cur.maxFireMs, ms);
    } else {
      keys.set(k, { isin: p.isin, ex: p.fire_exchange, pieces: [p], maxFireMs: ms });
    }
  }
  out.keys = keys.size;

  let batch: LaunchSetRow[] = [];
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const rows = batch;
    batch = [];
    try {
      const n = await meta.launchSet(rows);
      out.written += n;
      out.setSkipped += rows.length - n;
    } catch (err) {
      logger.error({ date, rows: rows.length, err }, "tick-convert launch-live set failed");
      out.failed += rows.length;
    }
  };

  if (keys.size > 0) {
    const client = deps.tickgwLive ?? createTickgwLiveClient(requireTickgw(deps.config, "launch-live"));
    const list = [...keys.values()];
    /** 끝낸 키의 마지막 요청 시각 — 리스 인식 게이트 입력. */
    const leases: number[] = [];
    const overBudget = (i: number): boolean => {
      if (clock() - t0 <= LIVE_RUN_BUDGET_MS) return false;
      const left = list.slice(i);
      out.deferred += left.length;
      logger.warn(
        { date, deferred: left.length, budgetMs: LIVE_RUN_BUDGET_MS, keys: left.map((k) => `${k.ex}/${k.isin}`) },
        `[tick-convert] mode=launch-live run 예산 초과 — 남은 ${left.length}키는 다음 run 이 잇는다`,
      );
      return true;
    };
    /** 살아 있는 우리 리스가 LIVE_KEY_SLOTS 이상이면 가장 이른 만료까지 기다린다. */
    const gate = async (): Promise<void> => {
      for (;;) {
        const now = clock();
        const live = leases.filter((t) => t + LIVE_LEASE_GUARD_MS > now);
        if (live.length < LIVE_KEY_SLOTS) return;
        await sleep(Math.max(1, Math.min(...live) + LIVE_LEASE_GUARD_MS - now));
      }
    };
    try {
      for (let i = 0; i < list.length; i++) {
        if (overBudget(i)) break;
        await gate();
        if (overBudget(i)) break;
        const key = list[i]!;
        const log = { date, isin: key.isin, ex: key.ex, pieces: key.pieces.length };
        // ④ 받기
        const r = await fetchLiveDay(client, {
          isin: key.isin,
          ex: key.ex,
          needMs: key.maxFireMs + LIVE_NEED_AFTER_MS,
          deadlineMs: clock() + LIVE_KEY_DEADLINE_MS,
          clock,
          sleep,
        });
        leases.push(r.lastReqAt);
        if (r.kind === "deferred") {
          out.deferred += 1;
          logger.warn(
            { ...log, reason: r.reason, state: r.state, asOfMs: r.asOfMs, bytes: r.bytes, requests: r.requests },
            `tick-convert launch-live: 키 미룸(${r.reason}) — 다음 run 이 잇는다`,
          );
          continue;
        }
        if (r.kind === "failed") {
          out.failed += 1;
          logger.error({ ...log, reason: r.reason, bytes: r.bytes, requests: r.requests }, "tick-convert launch-live: 키 받기 실패");
          continue;
        }
        let buf: Uint8Array;
        try {
          buf = decompressFrames(r.raw);
        } catch (err) {
          out.failed += 1;
          logger.error({ ...log, bytes: r.bytes, err }, "tick-convert launch-live: 해제 실패");
          continue;
        }
        const objectPath = `live:${new Date(r.asOfMs).toISOString()}`;
        const lq = gridLaunchOf(buf, key.ex, date, key.pieces, { date, isin: key.isin, mode: "launch-live", objectPath });
        if (!lq.ok) {
          out.launchFailed += 1;
          continue;
        }
        out.computed += 1;
        out.rows.push(...lq.rows);
        batch.push(...lq.rows);
        if (batch.length >= LIVE_SET_BATCH) await flush();
      }
    } catch (err) {
      // tickgw 401(TickgwAuthError) 등 run 실패 — 이미 계산한 행은 남기고 올린다
      await flush();
      logger.error({ date, err }, "tick-convert launch-live: run 실패(tickgw 401 등)");
      throw err;
    }
    await flush();
  }

  out.durationMs = Math.max(0, Math.round(clock() - t0));
  logger.info(
    { result: { ...out, rows: undefined } },
    `[tick-convert] mode=launch-live date=${date} keys=${out.keys} computed=${out.computed} written=${out.written} ` +
      `set_skipped=${out.setSkipped} deferred=${out.deferred} failed=${out.failed} launch_failed=${out.launchFailed} ` +
      `fills_empty=${out.fillsEmpty} ms=${out.durationMs}`,
  );
  if (out.setSkipped > 0) {
    logger.warn(
      { date, setSkipped: out.setSkipped },
      "tick-convert launch-live: set 이 일부 행을 쓰지 않았다 — live 가 격자 값 · 더 새 live 에 막혔거나 조각이 사라짐 · 마이그레이션 20261104710000 전이면 전부 버려진다",
    );
  }
  return out;
}
