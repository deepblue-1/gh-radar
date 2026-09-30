/**
 * Phase 26 Plan 10 — quote 연결 구독 요청 페이서 (RESEARCH Pattern 7 · Pitfall 3).
 *
 * 왜 필요한가:
 *   서버(gh-trade)는 연결마다 송신 큐 상한을 둔다 — `constexpr size_t kSendQueueMaxFrames = 1024;` ·
 *   `constexpr size_t kSendQueueMaxBytes  = 4u * 1024 * 1024;`(Gateway.h:72-73). Notice 가 넘치면 「송신 큐 가득참 …
 *   연결을 끊는다 (D-02)」. 28 의 응답 58(`ReplyQuote`)과 32 의 응답 69(`ReplyTape`, 기본 200건 ≈ 10KB 대)가 Notice 다.
 *   publisher 명령 큐(`kMaxPendingCommands = 8192`)도 넘치면 명령을 버린다(28/29/32 가 각 1건).
 *   공유 연결 하나가 사용자 전원의 키(최대 2000)를 지므로, 재접속 뒤 합집합을 for 루프로 한꺼번에 쏘면 수십 MB 응답이
 *   4MB 를 넘겨 연결이 끊기고 → 재접속 → 같은 burst → **끊김 루프**가 된다. 사용자 세션이 나눠 지던 재구독을 연결 하나가
 *   몰아서 지는 것이 공유 연결 구조가 만든 새 실패 모드다.
 *
 * 창 방식:
 *   - 한 번에 최대 `PACER_WINDOW` 키만 요청(28 → 29(level) → (FULL) 32)을 내보낸다(in-flight).
 *   - 그 키가 기다리는 응답 — FULL 은 69(가장 큰 Notice), PRICE 는 58 — 이 오거나 `PACER_TIMEOUT_MS` 가 지나면 슬롯을
 *     풀고 대기열 앞에서 다음 키를 보낸다. 타임아웃은 막힘 방지일 뿐 실패가 아니다(`stats().timeouts` 로 센다).
 *   - 평시 0→1 도 같은 경로다 — 창이 비어 있으면 즉시 나가므로 평시 지연은 0 이고, 코드 경로는 하나다.
 *   - 대기 중(아직 안 보낸) 키: 재요청은 그 항목 level 만 바꾸고(순서 유지), 해제는 항목을 지우고 아무 프레임도 내지 않고,
 *     강등은 항목 level 만 price 로 바꾼다 — 서버는 그 키를 끝내 모르거나 최종 level 한 벌만 본다.
 *   - in-flight 키의 재요청(PRICE→FULL 승격)은 **같은 슬롯에서 곧바로** 다시 보낸다 — 창을 더 점유하지 않고, 기다리는
 *     응답을 새 level 기준으로 바꾼다.
 *
 * 창 밖(즉시) — 응답이 없는 29:
 *   해제 29(false) · 강등 29(level=1) 는 서버가 응답하지 않으므로(Notice 를 만들지 않는다) 창을 점유하지 않고 즉시 나간다.
 *   in-flight 키의 해제면 슬롯도 푼다(그 키의 58/69 를 더 기다릴 이유가 없다).
 *
 * 순서 가정 (RESEARCH A10 · ASSUMED — 단일 명령 큐 구조로 추론): 서버 publisher 는 같은 연결의 명령을 FIFO 로 처리한다.
 * 그래서 이미 보낸 키에 대한 29 는 즉시 보내도 그 키의 앞선 28/29/32 뒤에 처리되고, 대기열은 FIFO 로 꺼낸다.
 *
 * 수치 (RESEARCH A5 · ASSUMED): 창 32 키 · 타임아웃 3초 · 69 ≈ 10KB 대 → 창 하나의 응답 ≈ 32 × (58 + 69) ≪ 4MB · 64 프레임
 * ≪ 1024. 너무 크면 끊김 루프, 너무 작으면 복구가 느리다. hub 가 재구독 시작 · 완료 로그(키 수 · 소요 ms · 타임아웃 수)를
 * 남기므로 실측으로 조정한다.
 *
 * 하지 않는 것:
 *   - 참조계수를 모른다. 무엇을 어떤 level 로 구독할지는 hub 가 정하고, 페이서는 「언제 보낼지」 만 정한다.
 *   - 연결 준비 여부를 스스로 판단하지 않는다 — `isReady()` 가 거짓이면 펌프를 멈추고, 재접속 뒤에는 hub 가 `reset()` 후
 *     합집합을 다시 넣는다(끊긴 연결의 in-flight 는 응답이 오지 않는다).
 */
import type { RelayExchange, RelaySubLevel } from "@gh-radar/shared";

import { logger } from "../logger.js";
import {
  MAX_TAPE_ENTRY_COUNT,
  QUOTE_LEVEL,
  buildGetQuoteReq,
  buildGetTradeTapeReq,
  buildSubscribeQuoteReq,
} from "../dma/envelope.js";
import { MSG } from "../dma/msg-type.js";

/** in-flight 창 크기(키) = 32 (RESEARCH A5 · ASSUMED — 재구독 로그로 조정). */
export const PACER_WINDOW = 32;

/** 응답이 오지 않은 in-flight 키의 슬롯을 푸는 시간(ms) = 3초 (RESEARCH A5 · ASSUMED). */
export const PACER_TIMEOUT_MS = 3_000;

/** 창 밖 제어(응답 없는 29)의 종류. */
export type PacerControlKind = "unsubscribe" | "demote";

export interface SubscribePacerDeps {
  /** 요청을 보내도 되는가(quote 연결 Ready). 거짓이면 펌프가 멈추고 항목은 대기열에 남는다. */
  isReady(): boolean;
  /** 게이트웨이 요청 프레임 송신. */
  send(payload: Uint8Array): boolean;
  /** 창 크기 — 생략 = `PACER_WINDOW`. */
  window?: number;
  /** 타임아웃(ms) — 생략 = `PACER_TIMEOUT_MS`. */
  timeoutMs?: number;
  /** `GetTradeTapeReq(32)` 요청 건수 — 생략 = 파서 상한(`MAX_TAPE_ENTRY_COUNT`). hub 는 `TAPE_REQUEST_COUNT` 를 넘긴다. */
  tapeCount?: number;
  /** 대기열과 창이 모두 비는 순간(응답 · 타임아웃 · 대기 해제로) 1회 — hub 의 재구독 완료 로그 트리거. */
  onIdle?: () => void;
}

export interface SubscribePacerStats {
  /** 아직 보내지 않은 키 수. */
  queued: number;
  /** 요청을 보냈고 응답을 기다리는 키 수(≤ 창). */
  inFlight: number;
  /** 응답 없이 타임아웃으로 슬롯을 푼 누적 수(`reset` 으로 지우지 않는다). */
  timeouts: number;
}

type PacerItem = { key: string; isin: string; exchange: RelayExchange; level: RelaySubLevel };

type InFlight = {
  item: PacerItem;
  /** 이 키 슬롯을 푸는 응답 번호 — FULL = 69(TradeTapeResp) · PRICE = 58(GetQuoteResp). */
  expect: number;
  timer: NodeJS.Timeout | null;
};

export class SubscribePacer {
  readonly #deps: SubscribePacerDeps;
  readonly #window: number;
  readonly #timeoutMs: number;
  readonly #tapeCount: number;
  /** 대기열 — Map 삽입 순서가 FIFO 다. level 갱신은 자리를 바꾸지 않는다. */
  readonly #queue = new Map<string, PacerItem>();
  readonly #inFlight = new Map<string, InFlight>();
  #timeouts = 0;

  constructor(deps: SubscribePacerDeps) {
    this.#deps = deps;
    this.#window = deps.window ?? PACER_WINDOW;
    this.#timeoutMs = deps.timeoutMs ?? PACER_TIMEOUT_MS;
    this.#tapeCount = deps.tapeCount ?? MAX_TAPE_ENTRY_COUNT;
  }

  /**
   * 키 하나의 구독 요청(0→1 · 승격 · 재구독)을 넣는다.
   *   · 대기 중 → 그 항목 level 만 바꾼다(자리 유지).
   *   · in-flight · 준비됨 → 같은 슬롯에서 곧바로 다시 보낸다(승격).
   *   · 그 밖 → 대기열 뒤에 붙이고 펌프한다(창이 비어 있으면 즉시 나간다).
   */
  subscribe(key: string, isin: string, exchange: RelayExchange, level: RelaySubLevel): void {
    const queued = this.#queue.get(key);
    if (queued !== undefined) {
      queued.level = level;
      return;
    }
    const flying = this.#inFlight.get(key);
    if (flying !== undefined) {
      if (this.#deps.isReady()) {
        this.#dispatch({ key, isin, exchange, level });
        return;
      }
      // 준비되지 않은 연결의 in-flight 는 응답이 오지 않는다 — 슬롯을 비우고 대기열로 돌린다(대기 · in-flight 이중 상태 방지).
      this.#dropInFlight(flying);
    }
    this.#queue.set(key, { key, isin, exchange, level });
    this.#pump();
  }

  /**
   * 응답 없는 29(해제 · 강등). 대기 중 키면 프레임 없이 항목만 고치고(해제 = 삭제 · 강등 = level price), 그 밖이면 즉시
   * `payload` 를 보낸다 — 창을 점유하지 않는다. in-flight 키의 해제면 슬롯도 푼다.
   */
  control(key: string, payload: Uint8Array, kind: PacerControlKind): void {
    const queued = this.#queue.get(key);
    if (queued !== undefined) {
      if (kind === "demote") {
        queued.level = "price";
        return;
      }
      this.#queue.delete(key);
      this.#checkIdle();
      return;
    }
    this.#deps.send(payload);
    if (kind !== "unsubscribe") return;
    const flying = this.#inFlight.get(key);
    if (flying === undefined) return;
    this.#dropInFlight(flying);
    this.#pump();
    this.#checkIdle();
  }

  /** quote 연결 응답(58 · 69). in-flight 키가 기다리던 번호면 슬롯을 풀고 다음 키를 보낸다. 그 밖은 무시한다. */
  onResponse(key: string, msgType: number): void {
    const flying = this.#inFlight.get(key);
    if (flying === undefined || flying.expect !== msgType) return;
    this.#dropInFlight(flying);
    this.#pump();
    this.#checkIdle();
  }

  /** 대기열 · in-flight · 타이머를 비운다(quote 재접속 · closeAll). 타임아웃 누적 수는 남긴다. */
  reset(): void {
    for (const flying of this.#inFlight.values()) {
      if (flying.timer !== null) clearTimeout(flying.timer);
      flying.timer = null;
    }
    this.#inFlight.clear();
    this.#queue.clear();
  }

  stats(): SubscribePacerStats {
    return { queued: this.#queue.size, inFlight: this.#inFlight.size, timeouts: this.#timeouts };
  }

  /** 준비됐고 창에 자리가 있는 동안 대기열 앞에서 꺼내 보낸다. */
  #pump(): void {
    while (this.#queue.size > 0 && this.#inFlight.size < this.#window && this.#deps.isReady()) {
      const next = this.#queue.values().next().value as PacerItem;
      this.#queue.delete(next.key);
      this.#dispatch(next);
    }
  }

  /**
   * 28 → 29(level) → (FULL) 32 — 순서가 계약이다(D-33 · quick-260923-ge2). 같은 키가 이미 in-flight 면 그 슬롯을 대체한다.
   */
  #dispatch(item: PacerItem): void {
    const prev = this.#inFlight.get(item.key);
    if (prev !== undefined && prev.timer !== null) clearTimeout(prev.timer);

    const { isin, exchange, level } = item;
    this.#deps.send(buildGetQuoteReq(isin, exchange));
    this.#deps.send(
      buildSubscribeQuoteReq(isin, exchange, true, level === "price" ? QUOTE_LEVEL.PRICE : QUOTE_LEVEL.FULL),
    );
    if (level !== "price") this.#deps.send(buildGetTradeTapeReq(isin, exchange, this.#tapeCount));

    const flying: InFlight = {
      item,
      expect: level === "price" ? MSG.GetQuoteResp : MSG.TradeTapeResp,
      timer: null,
    };
    flying.timer = setTimeout(() => {
      flying.timer = null;
      if (this.#inFlight.get(item.key) !== flying) return; // 이미 응답 · 해제 · 재송신 — 옛 타이머는 침묵
      this.#inFlight.delete(item.key);
      this.#timeouts += 1;
      logger.debug(
        { isin, exchange, level, timeoutMs: this.#timeoutMs, timeouts: this.#timeouts },
        "[PACER] 응답 없이 타임아웃 — 슬롯 해제 후 다음 키",
      );
      this.#pump();
      this.#checkIdle();
    }, this.#timeoutMs);
    flying.timer.unref?.();
    this.#inFlight.set(item.key, flying);
  }

  #dropInFlight(flying: InFlight): void {
    if (flying.timer !== null) clearTimeout(flying.timer);
    flying.timer = null;
    this.#inFlight.delete(flying.item.key);
  }

  #checkIdle(): void {
    if (this.#queue.size === 0 && this.#inFlight.size === 0) this.#deps.onIdle?.();
  }
}
