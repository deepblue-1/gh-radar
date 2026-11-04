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
 *   ④ 키마다 순차로 fetchLiveDay(needMs = 그 키 fire_base 최대 + LIVE_NEED_AFTER_MS · 키 데드라인 LIVE_KEY_DEADLINE_MS) →
 *      done 이면 decompressFrames → gridLaunchOf(object_path = 'live:<as-of ISO UTC ms>') · deferred 는 warn · failed 는 error.
 *   ⑤ LIVE_SET_BATCH 행마다 · 끝에 `launch_queue_set`(20261104710000 가드 — live 는 KST 오늘만 · live 위에 단조 · 격자 값을 못 덮음).
 *      보낸 − 쓴 = set_skipped(격자 값 · 더 새 live 에 막힘 · 조각 사라짐 · 마이그레이션 전이면 전부).
 *   ⑥ 요약 info 한 줄(keys · computed · written · set_skipped · deferred · failed · launch_failed · fills_empty · ms).
 *
 * 표식: object_path = 'live:' + new Date(asOfMs).toISOString() — 고정 폭이라 문자열 비교 = 시각 비교. 밤 nightly 가 그날 격자 경로로
 *   덮는다(launch_queue_pending 은 격자가 생기면 live 행을 경로 불일치로 다시 고른다).
 *
 * 종료 코드: 키 failed(503 · 5xx · 네트워크 · blocked · 해제 실패) · set RPC 오류 · inputs RPC 오류 · tickgw 401 = 1.
 *   deferred(timeout · queued · incomplete) · 계산 실패 launch_failed(gridLaunchOf 가 error 로그) · set_skipped = 0(로그만).
 * `tick_convert_runs` 에 기록하지 않는다 — 격자 변환이 아니다(모드 CHECK 변경 회피 · 로그만). `deps.store` 를 쓰지 않는다.
 */
import { parseTickTime } from "@gh-radar/shared";
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
  /** 미룬 키 수(timeout · queued · incomplete) — 다음 run 이 잇는다. */
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
    try {
      for (const key of keys.values()) {
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
