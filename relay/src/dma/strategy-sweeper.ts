/**
 * Phase 29-43 — G-1 (가) 옛 주문 서버에 남은 그 계좌의 활성 전략 끄기 (프로토콜 모듈).
 *
 * 근거 — gh-trade-84 답 ② 추가 확정(2026-10-10 저녁 · 사용자 확인 · 29-29-SUMMARY §후속):
 *   A 서버로 낸 주문의 체결 통보는 B 서버로 가지 않는다. 주문 서버를 바꾼 순간부터 옛 서버의 잔고 · 미체결은 낡고, 옛 서버의
 *   상따 · VI · 자동매도는 그 낡은 잔고로 **실주문을 낼 수 있다.** 그래서 주문 서버를 바꿀 때 옛 서버에 남은 그 계좌의 활성
 *   전략을 **꺼야 한다 — 경고로는 부족하다.** 이 모듈은 그 끄기 한 번(「읽기 → 끄기 → 다시 읽어 0 확인」)만 한다. 언제 부르는지
 *   (지정 변경 → 끄기 → 새 서버 재수립 → 25→66 재동기)는 29-36, 연결 없는 사용자 · 백스톱 · 재시도는 29-44 가 결선한다.
 *
 * 와이어 무변경(gh-trade-84 ④) — relay 가 이미 쓰는 프레임만 쓴다:
 *   - 24 `GetLimitChaserListReq` → 64 전량 · 21 `GetVITriggerReq(거래소)` → 61 (조회 · 재조회)
 *   - 14 `DisableStrategiesReq(그 키)` → 60 에코 · 65 집계. **삭제가 아니라 발주 게이트만 내린다**(등록 유지) — 키 1건 = 그 상따
 *     (자동매도 포함 — 서버 `Deactivate()` 가 자동매도 상태도 꺼짐으로 내린다).
 *   - 11 `SetVITriggerReq({ 같은 값, run: false })` → 61 에코. 14 를 빈 키로 보내면 VI 도 꺼지지만 **빈 키 14 는 금지다** — 그
 *     세션의 상따 **전부**가 꺼져 같은 서버에 남는 다른 계좌의 전략까지 죽는다. 그래서 VI 는 계좌를 보고 11 로 따로 끈다.
 *
 * 미체결은 건드리지 않는다 — 2 `DirectOrderReq`(취소 포함)를 이 모듈은 만들지 않는다. 옛 서버의 미체결 정리는 사용자 몫이다
 * (gh-trade-84 ② 추가: 「옛 서버의 미체결은 그 서버에서 정리」).
 *
 * VI 는 거래소별이다 — 서버는 VI 전략을 세션당 **거래소별(KRX · NXT) 1건**으로 관리하고 21 의 key 로 슬롯을 고른다
 * (`buildGetVITriggerReq` 주석 · 빈 키는 KRX 로 접힌다). 그래서 조회 · 재조회 모두 `SWEEP_VI_EXCHANGES` 를 전부 돈다. 빈 61(미등록)
 * 에는 거래소가 실리지 않고, 이 모듈은 hub 의 `#pendingViGets` FIFO 를 거치지 않으므로(세션 프레임을 직접 듣는다 — 옛 서버가
 * primary 가 아니면 hub 캐시에 61 이 없다) **짝을 스스로 맞춘다**: 미해결 21 은 늘 하나(21(KRX) → 61 → 21(NXT) → 61), 빈 61 은
 * 지금 기다리는 거래소의 미등록, 본문 있는 61 은 `cfg.exchange` 가 그 거래소일 때만 답이다(다른 거래소 본문은 떠돌이 에코 —
 * 무시하고 계속 기다린다). 같은 세션을 hub 도 듣고 있으면 이 모듈의 빈 61 에 hub 가 「귀속 불가」 warn 을 남길 수 있다 — 서버
 * 상태는 하나라 값은 같고, 어긋나면 재조회가 fail closed 로 잡는다.
 *
 * 활성(켜진) 판정 — `isActiveLimitChaser` = webapp `isActiveStrategy` 의 5스위치(매수 · 매도 · 취소잔량 · 후매수 자동 · 자동매도)
 * OR `autoSellState !== 0`. 끄기 판정은 「서버가 지금 발주할 수 있는가」 라 서버 `LimitChaser::IsActive()`(gh-trade
 * `server/src/trade/strategy/LimitChaser.h` — `IsBuyArmed || IsSellArmed || IsCancelArmed || IsPostBuyAutoArmed ||
 * IsAutoSellActive`, `IsAutoSellActive = m_asState != Off`)를 비추는 것이 정본이다. `autoSellEnabled` 만으로는 자동매도 런타임 상태
 * (1 대기 · 2 감시 · 3 매도중 · 4 완료)를 포괄하지 못한다. webapp 쪽은 카드 표시 규칙이라 다르다(5스위치 부분이 갈리면 webapp 이
 * 정본). 14 뒤 서버 `Deactivate()` 가 자동매도 상태를 Off 로 내리므로 재조회에서 `autoSellState` 0 이 된다.
 *
 * 세션 — `SessionManager.acquireOn(userId, target, creds)` 로 (유저, 서버) 세션을 쥐고(있으면 참조계수 +1 · 없으면 새 로그인 —
 * gh-trade-84 ③ 「같은 서버 재로그인은 같은 세션 재부착」 이라 옛 서버 전략이 그 세션에 그대로 보인다) 끝나면 `release` 한다.
 * `DmaSession.send` 는 Ready 전 송신을 거부하므로 Ready 를 기다린 뒤 보낸다.
 *
 * 로그 — 수 · 서버 키 · 소요 ms 만. DMA id · 계좌번호 · 전략 키(계좌번호가 들어 있다)는 싣지 않는다(D-19 · T-16-09).
 */
import type { RelayExchange, RelayLimitChaser, RelayViTrigger } from "@gh-radar/shared";

import { logger } from "../logger.js";
import type { TransportFrameEvent } from "./dma-client.js";
import {
  buildDisableStrategiesReq,
  buildGetLimitChaserListReq,
  buildGetVITriggerReq,
  buildSetVITriggerReq,
  parseDisableStrategiesResp,
  parseLimitChaserList,
  parseViTrigger,
} from "./envelope.js";
import { MSG } from "./msg-type.js";
import type { DmaSession } from "./session.js";
import type { DmaCredentials, SessionTarget } from "./session-manager.js";

/** 한 단계(Ready · 64 · 거래소별 61 · 65 · 에코)를 기다리는 시한. */
export const SWEEP_STEP_TIMEOUT_MS = 5_000;
/** `sweep` 한 번 전체 시한. */
export const SWEEP_TOTAL_TIMEOUT_MS = 20_000;
/**
 * VI 조회 · 재조회 거래소 — hub `VI_PREFETCH_EXCHANGES` 와 **같은 목록**이다(import 하지 않고 두 벌 — 짝 표시). 한쪽에 거래소가
 * 늘면 다른 쪽도 늘린다.
 */
export const SWEEP_VI_EXCHANGES: readonly RelayExchange[] = ["KRX", "NXT"];

/** 끌 대상 — 그 사용자의 그 서버 세션에서 `accountNos` 계좌의 전략만. */
export type StrategySweepTarget = {
  userId: string;
  serverKey: string;
  broker: string;
  accountNos: readonly string[];
};

export type StrategySweepFailReason = "no-session" | "not-ready" | "timeout" | "send-failed" | "remaining";

export type StrategySweepResult =
  | {
      ok: true;
      /** 14 를 보내 65 를 받은 상따 수. */
      disabledLimitChasers: number;
      /** 11 을 보내 run:false 에코를 받은 **거래소 수**(0~2). */
      viDisabled: number;
      /** 이 호출이 새 세션을 열었는가(로그인 1회). */
      sessionCreated: boolean;
    }
  | {
      ok: false;
      reason: StrategySweepFailReason;
      /** 마지막으로 읽은 대상 계좌의 켜진 수(상따 + run VI 거래소). 조회를 마치지 못했으면 null. */
      remaining: number | null;
      disabledLimitChasers: number;
      viDisabled: number;
    };

/** `SessionManager` 의 이 모듈이 쓰는 면 — 테스트가 갈아 끼울 수 있게 구조 타입으로 둔다. */
export type SweeperSessions = {
  acquireOn(userId: string, target: SessionTarget, creds: DmaCredentials): DmaSession | null;
  release(userId: string, serverKey: string): void;
  sessionsOf(userId: string): DmaSession[];
};

export type StrategySweeperOptions = {
  sessions: SweeperSessions;
  /** 레지스트리 서버 키 → 연결 대상. 없으면 `no-session`. */
  targetOf: (serverKey: string) => SessionTarget | undefined;
  stepTimeoutMs?: number;
  totalTimeoutMs?: number;
  /** 소요 ms 로그용 시계. */
  now?: () => number;
};

/**
 * 서버가 지금 발주할 수 있는 상따인가 — 5스위치 OR 자동매도 런타임 상태(서버 `LimitChaser::IsActive()` 동형 · 머리 주석).
 */
export function isActiveLimitChaser(item: RelayLimitChaser): boolean {
  return (
    item.buyEnabled ||
    item.sellEnabled ||
    item.cancelQtyEnabled ||
    item.postBuyAuto ||
    item.autoSellEnabled ||
    item.autoSellState !== 0
  );
}

/** 이름 붙은 실패 — `sweep` 이 결과로 접는다. */
class SweepFailure extends Error {
  constructor(readonly reason: StrategySweepFailReason) {
    super(reason);
  }
}

type FrameWaiter = {
  pick: (e: TransportFrameEvent) => boolean;
  resolve: () => void;
  reject: (err: SweepFailure) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** 세션 프레임을 직접 듣는 대기 창구 — 기다림마다 단계 시한을 건다. */
class FrameTap {
  readonly #session: DmaSession;
  readonly #stepMs: number;
  readonly #waiters = new Set<FrameWaiter>();
  readonly #onFrame = (e: TransportFrameEvent): void => {
    for (const w of [...this.#waiters]) {
      if (!w.pick(e)) continue;
      this.#settle(w);
      w.resolve();
    }
  };

  constructor(session: DmaSession, stepMs: number) {
    this.#session = session;
    this.#stepMs = stepMs;
    session.on("frame", this.#onFrame);
  }

  /** `pick` 이 true 인 첫 프레임을 기다린다. 등록은 송신 **전에** 한다(응답이 송신 직후 와도 놓치지 않는다). */
  wait(pick: (e: TransportFrameEvent) => boolean): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const w: FrameWaiter = {
        pick,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.#settle(w);
          reject(new SweepFailure("timeout"));
        }, this.#stepMs),
      };
      this.#waiters.add(w);
    });
  }

  /** Ready 를 기다린다(이미 Ready 면 즉시). */
  ready(): Promise<void> {
    if (this.#session.isReady) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const done = (): void => {
        clearTimeout(timer);
        this.#session.off("ready", done);
        resolve();
      };
      const timer = setTimeout(() => {
        this.#session.off("ready", done);
        reject(new SweepFailure("timeout"));
      }, this.#stepMs);
      this.#session.on("ready", done);
    });
  }

  dispose(): void {
    this.#session.off("frame", this.#onFrame);
    for (const w of this.#waiters) clearTimeout(w.timer);
    this.#waiters.clear();
  }

  #settle(w: FrameWaiter): void {
    clearTimeout(w.timer);
    this.#waiters.delete(w);
  }
}

/** 한 번 읽은 대상 계좌의 켜진 전략. */
type ActiveRead = {
  chasers: RelayLimitChaser[];
  vis: RelayViTrigger[];
};

export class StrategySweeper {
  readonly #sessions: SweeperSessions;
  readonly #targetOf: (serverKey: string) => SessionTarget | undefined;
  readonly #stepMs: number;
  readonly #now: () => number;

  constructor(opts: StrategySweeperOptions) {
    this.#sessions = opts.sessions;
    this.#targetOf = opts.targetOf;
    this.#stepMs = opts.stepTimeoutMs ?? SWEEP_STEP_TIMEOUT_MS;
    this.#now = opts.now ?? Date.now;
  }

  /**
   * 그 서버 세션에서 `accountNos` 계좌의 켜진 전략(상따 · 두 거래소 VI)을 끄고 다시 읽어 0 임을 확인한다.
   * 확인되지 않은 모든 경우는 이름 붙은 실패다 — 조용히 성공으로 접지 않는다.
   */
  async sweep(target: StrategySweepTarget, creds: DmaCredentials): Promise<StrategySweepResult> {
    const startedAt = this.#now();
    const accounts = new Set(target.accountNos);
    let disabledLimitChasers = 0;
    let viDisabled = 0;
    let lastRemaining: number | null = null;

    const conn = this.#targetOf(target.serverKey);
    if (conn === undefined || conn.broker !== target.broker) {
      return this.#fail(target, "no-session", null, 0, 0);
    }
    const sessionCreated = !this.#sessions.sessionsOf(target.userId).some((s) => s.serverKey === target.serverKey);
    const session = this.#sessions.acquireOn(target.userId, conn, creds);
    if (session === null) return this.#fail(target, "no-session", null, 0, 0);

    const tap = new FrameTap(session, this.#stepMs);
    try {
      await tap.ready();

      const before = await this.#readActive(session, tap, accounts);
      lastRemaining = before.chasers.length + before.vis.length;

      for (const item of before.chasers) {
        const done = tap.wait(
          (e) => e.msgType === MSG.DisableStrategiesResp && parseDisableStrategiesResp(e.env) !== null,
        );
        session.send(buildDisableStrategiesReq(item.key));
        await done;
        disabledLimitChasers += 1;
      }

      for (const cfg of before.vis) {
        const echoed = tap.wait((e) => {
          if (e.msgType !== MSG.SetVITriggerResp) return false;
          const echo = parseViTrigger(e.env)?.cfg ?? null;
          return echo !== null && echo.exchange === cfg.exchange && echo.accountNo === cfg.accountNo && !echo.run;
        });
        session.send(
          buildSetVITriggerReq({
            accountNo: cfg.accountNo,
            exchange: cfg.exchange,
            orderAmountKrw: cfg.orderAmountKrw,
            checkRate: cfg.checkRate,
            run: false,
          }),
        );
        await echoed;
        viDisabled += 1;
      }

      const after = await this.#readActive(session, tap, accounts);
      lastRemaining = after.chasers.length + after.vis.length;
      if (lastRemaining !== 0) {
        return this.#fail(target, "remaining", lastRemaining, disabledLimitChasers, viDisabled);
      }

      logger.info(
        {
          serverKey: target.serverKey,
          accounts: accounts.size,
          disabledLimitChasers,
          viDisabled,
          sessionCreated,
          ms: this.#now() - startedAt,
        },
        "[DMA] 옛 서버 계좌 전략 끄기 완료 — 재조회 0 확인",
      );
      return { ok: true, disabledLimitChasers, viDisabled, sessionCreated };
    } catch (err) {
      if (err instanceof SweepFailure) {
        return this.#fail(target, err.reason, lastRemaining, disabledLimitChasers, viDisabled);
      }
      throw err;
    } finally {
      tap.dispose();
      this.#sessions.release(target.userId, target.serverKey);
    }
  }

  /** 24 → 64, 그리고 거래소마다 21 → 61 (한 번에 하나) — 대상 계좌의 켜진 상따와 run VI. */
  async #readActive(session: DmaSession, tap: FrameTap, accounts: ReadonlySet<string>): Promise<ActiveRead> {
    const got: { list: RelayLimitChaser[] } = { list: [] };
    const listed = tap.wait((e) => {
      if (e.msgType !== MSG.GetLimitChaserListResp) return false;
      const list = parseLimitChaserList(e.env);
      if (list === null) return false; // 파손 — 계속 기다린다(시한이 fail closed).
      got.list = list;
      return true;
    });
    session.send(buildGetLimitChaserListReq());
    await listed;
    const chasers = got.list.filter((c) => accounts.has(c.accountNo) && isActiveLimitChaser(c));

    const vis: RelayViTrigger[] = [];
    for (const ex of SWEEP_VI_EXCHANGES) {
      const slot: { cfg: RelayViTrigger | null } = { cfg: null };
      const answered = tap.wait((e) => {
        if (e.msgType !== MSG.SetVITriggerResp) return false;
        const parsed = parseViTrigger(e.env);
        if (parsed === null) return false; // 파손 — 계속 기다린다(시한이 fail closed).
        if (parsed.cfg === null) return true; // 빈 61 = 지금 기다리는 거래소 미등록(미해결 21 은 늘 하나).
        if (parsed.cfg.exchange !== ex) return false; // 다른 거래소 본문 = 떠돌이 에코.
        slot.cfg = parsed.cfg;
        return true;
      });
      session.send(buildGetVITriggerReq(ex));
      await answered;
      const cfg = slot.cfg;
      if (cfg !== null && accounts.has(cfg.accountNo) && cfg.run) vis.push(cfg);
    }
    return { chasers, vis };
  }

  #fail(
    target: StrategySweepTarget,
    reason: StrategySweepFailReason,
    remaining: number | null,
    disabledLimitChasers: number,
    viDisabled: number,
  ): StrategySweepResult {
    logger.warn(
      { serverKey: target.serverKey, reason, remaining },
      "[DMA] 옛 서버 계좌 전략 끄기 미확인",
    );
    return { ok: false, reason, remaining, disabledLimitChasers, viDisabled };
  }
}
