import { concatBytes } from "@gh-radar/shared";

import { logger } from "../logger.js";
import type { TickgwClient } from "./tickgw-client.js";

/**
 * Phase 39 (D-08 ① · D-12) — tickgw 당일 바이트를 서버 안에서 받는 상태표 서버판.
 *
 * 워커 `workers/tick-convert/src/tickgw-live.ts` `fetchLiveDay` 의 축약판이다. 진단 전문가의 시세 도구(`diagnosis-market.ts`)가
 * 한 진단 실행 안에서 같은 (isin, ex) 를 여러 번 부를 때 처음부터 다시 받지 않도록 **실행 단위 메모**(epoch · offsetEnd ·
 * 누적 압축 바이트)를 이어 쓴다. 프로세스 전역 캐시는 두지 않는다(512Mi · RESEARCH Pitfall 3).
 *
 * 상태표(tickgw 내부 계약 — 37-09 · 워커 머리 주석과 같다):
 *   200 → 본문을 쌓고 offset = Offset-End · epoch = Epoch
 *         More=true → 대기 없이 곧바로 이어 받기
 *         loading   → LIVE_POLL_MS 뒤 이어 받기(요청 자체가 리스 갱신)
 *         queued    → LIVE_POLL_MS 뒤 다시 · 처음 queued 뒤 LIVE_QUEUED_WAIT_MS 를 넘으면 QUEUED(활성 키 8개 경쟁 · Pitfall 4)
 *         delayed   → LIVE_DELAYED_MS 뒤 다시(캐시 full · 백오프)
 *         blocked   → BLOCKED
 *         ready     → ok(지금까지 받은 바이트 — 진단은 하루치 완결을 기다리지 않는다).
 *                     `X-Tick-Complete: false`(08:00 부터 끊김 없이 이어지지 않음 = 구멍 있는 하루)면 `incomplete: true` 를
 *                     싣는다 — 워커는 이 경우를 deferred incomplete 로 다룬다. 진단은 바이트는 쓰되 「일부 누락」 을 알린다.
 *   409 → 본문 JSON 의 epoch 로 offset 0 · 쌓은 본문 버림 · 곧바로 다시(연속 LIVE_MAX_CONFLICTS 회를 넘으면 CONFLICT)
 *   status 0 → UNREACHABLE(tickgw 에 닿지 못함) · 401 → logger.error 1회 + AUTH(공유 비밀 불일치) · 그 밖 → BAD_RESPONSE
 *   마감(clock() > deadlineAt) → queued 중이었으면 QUEUED · 아니면 TIMEOUT
 *
 * 로그 위생: 응답 본문 · 헤더 값을 로그에 남기지 않는다(tickgw-client 규칙 — 상태 코드만).
 */

/** 한 (isin, ex) 의 당일 누적 — 압축 바이트(이어붙인 zstd 프레임) 그대로. */
export type LiveFetchMemoEntry = {
  /** 마지막 응답의 `X-Tick-Epoch` — 첫 요청 전엔 없음. */
  epoch?: string;
  /** 마지막 응답의 `X-Tick-Offset-End` — 다음 요청의 offset. */
  offsetEnd: number;
  /** 지금까지 받은 압축 바이트(프레임 이어붙임). */
  bytes: Uint8Array;
};

export type LiveUnavailableReason = "UNREACHABLE" | "AUTH" | "QUEUED" | "BLOCKED" | "CONFLICT" | "TIMEOUT" | "BAD_RESPONSE";

export type LiveFetchResult =
  /** `incomplete` = tickgw 가 `X-Tick-Complete: false` 를 줬다(당일 수집 구멍 — 기록 없음 ≠ 체결 없음). */
  | { kind: "ok"; entry: LiveFetchMemoEntry; incomplete: boolean }
  | { kind: "unavailable"; reason: LiveUnavailableReason };

export type LiveFetchOptions = {
  /** clock() 이 이 값(epoch ms)을 넘으면 그만 받는다. */
  deadlineAt: number;
  /** 이전 호출이 남긴 메모 — 있으면 그 offsetEnd 부터 증분만 받는다. */
  memo?: LiveFetchMemoEntry;
  sleep: (ms: number) => Promise<void>;
  clock: () => number;
};

/** loading · queued 재요청 간격 — 워커 · 웹과 같은 값. */
export const LIVE_POLL_MS = 2000;
/** delayed(백오프) 재요청 간격. */
export const LIVE_DELAYED_MS = 5000;
/** queued 가 처음 보인 뒤 이만큼 지나도 활성이 못 되면 QUEUED. */
export const LIVE_QUEUED_WAIT_MS = 20_000;
/** 409 연속 상한. */
export const LIVE_MAX_CONFLICTS = 3;

const NAT_RE = /^(0|[1-9]\d{0,14})$/;

function epochOf409(body: Buffer | null): string | null {
  if (!body) return null;
  try {
    const v = JSON.parse(body.toString("utf8")) as { epoch?: unknown };
    return typeof v?.epoch === "string" && v.epoch.length > 0 && v.epoch.length <= 64 ? v.epoch : null;
  } catch {
    return null;
  }
}

/** tickgw 당일 바이트 받기 — 위 상태표. throw 하지 않는다(tickgw-client 가 네트워크 오류를 status 0 으로 준다). */
export async function fetchLiveBytes(
  tickgw: TickgwClient,
  key: { isin: string; ex: "KRX" | "NXT" },
  o: LiveFetchOptions,
): Promise<LiveFetchResult> {
  let parts: Uint8Array[] = o.memo && o.memo.bytes.length > 0 ? [o.memo.bytes] : [];
  let offset = o.memo?.offsetEnd ?? 0;
  let epoch = o.memo?.epoch;
  let queuedSince: number | null = null;
  let conflicts = 0;
  const unavailable = (reason: LiveUnavailableReason): LiveFetchResult => ({ kind: "unavailable", reason });

  for (;;) {
    if (o.clock() > o.deadlineAt) return unavailable(queuedSince !== null ? "QUEUED" : "TIMEOUT");
    const r = await tickgw.live({ isin: key.isin, ex: key.ex, epoch, offset });
    if (r.status === 0) return unavailable("UNREACHABLE");
    if (r.status === 401) {
      logger.error({ tickgw: { status: 401 } }, "[tickgw] 공유 비밀 불일치 — TICKGW_SECRET 확인");
      return unavailable("AUTH");
    }
    if (r.status === 409) {
      const e = epochOf409(r.body);
      if (e === null) return unavailable("BAD_RESPONSE");
      conflicts += 1;
      if (conflicts > LIVE_MAX_CONFLICTS) return unavailable("CONFLICT");
      epoch = e;
      offset = 0;
      parts = [];
      continue;
    }
    const endH = r.headers.offsetEnd;
    if (r.status !== 200 || !r.body || !r.headers.epoch || endH === undefined || !NAT_RE.test(endH)) {
      return unavailable("BAD_RESPONSE");
    }
    conflicts = 0;
    if (r.body.length > 0) parts.push(new Uint8Array(r.body)); // 사본 — Buffer 풀 공유 메모리에 기대지 않는다
    offset = Number(endH);
    epoch = r.headers.epoch;
    if (r.headers.more === "true") continue;

    const state = r.headers.state ?? "";
    if (state !== "queued") queuedSince = null;
    switch (state) {
      case "loading":
        await o.sleep(LIVE_POLL_MS);
        continue;
      case "queued": {
        const now = o.clock();
        if (queuedSince === null) queuedSince = now;
        if (now - queuedSince > LIVE_QUEUED_WAIT_MS) return unavailable("QUEUED");
        await o.sleep(LIVE_POLL_MS);
        continue;
      }
      case "delayed":
        await o.sleep(LIVE_DELAYED_MS);
        continue;
      case "blocked":
        return unavailable("BLOCKED");
      case "ready":
        return {
          kind: "ok",
          incomplete: r.headers.complete === "false",
          entry: { epoch, offsetEnd: offset, bytes: parts.length === 1 ? parts[0]! : concatBytes(parts) },
        };
      default:
        return unavailable("BAD_RESPONSE");
    }
  }
}
