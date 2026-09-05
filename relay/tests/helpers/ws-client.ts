/**
 * Phase 15 Plan 02 — RELAY-01. relay wss 를 시험하는 브라우저측 클라이언트 헬퍼.
 *
 * 후속 wave(15-04 WsFanout 이후)의 테스트가 쓰는 도구다. 브라우저 계약
 * (`@gh-radar/shared` 의 `RelayInbound`/`RelayOutbound`)만 다루고, 검증에 필요한
 * 세 가지 관측점을 노출한다 — ① 다음 아웃바운드 메시지 ② close 코드(4400/4401)
 * ③ `bufferedAmount`(백프레셔).
 *
 * 결정 근거:
 *   D-11  인증은 업그레이드 후 **첫 메시지** `{t:"auth", token}` 다. 토큰을 URL 에
 *         싣지 않으므로 헬퍼도 쿼리스트링을 만들지 않는다.
 *   D-36  아웃바운드는 `t` 로 분기하는 discriminated union 하나뿐이다.
 *
 * 하지 않는 것:
 *   - 재접속을 흉내 내지 않는다. 재접속 정책 검증은 두 번 `connectWs` 하는 쪽이
 *     경계가 분명하다.
 *   - 메시지를 소비하지 않고 쌓아 두기만 한다 — 순서 단언이 테스트의 책임이다.
 */
import { WebSocket } from "ws";
import type { RelayExchange, RelayOutbound } from "@gh-radar/shared";

export type CloseInfo = { code: number; reason: string };

const DEFAULT_TIMEOUT_MS = 1000;

/** 테스트용 wss 클라이언트 1개. */
export class TestWs {
  readonly raw: WebSocket;

  #inbox: RelayOutbound[] = [];
  #waiters: Array<(msg: RelayOutbound) => void> = [];
  #closed: CloseInfo | null = null;
  #closeWaiters: Array<(info: CloseInfo) => void> = [];

  constructor(ws: WebSocket) {
    this.raw = ws;
    ws.on("message", (data) => {
      const parsed = JSON.parse(data.toString()) as RelayOutbound;
      const waiter = this.#waiters.shift();
      if (waiter) waiter(parsed);
      else this.#inbox.push(parsed);
    });
    ws.on("close", (code, reason) => {
      this.#closed = { code, reason: reason.toString() };
      for (const w of this.#closeWaiters) w(this.#closed);
      this.#closeWaiters = [];
    });
    // 서버가 close 프레임 없이 끊는 경우에도 테스트가 멈추지 않게 흡수한다.
    ws.on("error", () => undefined);
  }

  /** ws 송신 대기 바이트 (백프레셔 관측점). */
  get bufferedAmount(): number {
    return this.raw.bufferedAmount;
  }

  /** 이미 close 됐다면 그 정보, 아니면 null. */
  get closeInfo(): CloseInfo | null {
    return this.#closed;
  }

  /** 인증 메시지 (D-11 — 업그레이드 후 첫 메시지여야 한다). */
  sendAuth(token: string): void {
    this.sendRaw({ t: "auth", token });
  }

  /** 시세+체결 구독. 키는 `isin + ex` (D-33). */
  sendSub(isin: string, ex: RelayExchange): void {
    this.sendRaw({ t: "sub", isin, ex });
  }

  /** 구독 해제. */
  sendUnsub(isin: string, ex: RelayExchange): void {
    this.sendRaw({ t: "unsub", isin, ex });
  }

  /** 임의 페이로드 전송. 문자열은 그대로, 객체는 JSON 으로 보낸다(스키마 위반 시험용). */
  sendRaw(payload: unknown): void {
    this.raw.send(typeof payload === "string" ? payload : JSON.stringify(payload));
  }

  /** 다음 아웃바운드 메시지 1건을 기다린다. */
  nextMessage(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<RelayOutbound> {
    const buffered = this.#inbox.shift();
    if (buffered !== undefined) return Promise.resolve(buffered);

    return new Promise<RelayOutbound>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.#waiters.indexOf(onMessage);
        if (i >= 0) this.#waiters.splice(i, 1);
        reject(new Error(`wss 메시지 대기 시간 초과 (${timeoutMs}ms)`));
      }, timeoutMs);
      const onMessage = (msg: RelayOutbound): void => {
        clearTimeout(timer);
        resolve(msg);
      };
      this.#waiters.push(onMessage);
    });
  }

  /** close 코드를 기다린다 (4400 = 잘못된 메시지, 4401 = 인증 실패/시간 초과). */
  waitClose(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<CloseInfo> {
    if (this.#closed !== null) return Promise.resolve(this.#closed);

    return new Promise<CloseInfo>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.#closeWaiters.indexOf(onClose);
        if (i >= 0) this.#closeWaiters.splice(i, 1);
        reject(new Error(`wss close 대기 시간 초과 (${timeoutMs}ms)`));
      }, timeoutMs);
      const onClose = (info: CloseInfo): void => {
        clearTimeout(timer);
        resolve(info);
      };
      this.#closeWaiters.push(onClose);
    });
  }

  /** 연결을 닫고 실제로 닫힐 때까지 기다린다 — 소켓 누수로 vitest 가 멈추면 안 된다. */
  async close(): Promise<void> {
    if (this.#closed !== null) return;
    // 지역 변수로 받는다 — `this.raw.readyState` 를 직접 비교하면 TS 가 이후 상태를
    // 좁혀버려, await 뒤의 재확인이 "도달 불가"로 잘못 판정된다.
    const before: number = this.raw.readyState;
    if (before === WebSocket.CLOSED) return;

    const closed = this.waitClose(DEFAULT_TIMEOUT_MS).catch(() => undefined);
    this.raw.close();
    await closed;

    const after: number = this.raw.readyState;
    if (after !== WebSocket.CLOSED) this.raw.terminate();
  }
}

/** relay wss 에 접속한다. 기본 경로는 루트다. */
export function connectWs(
  port: number,
  path = "/",
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<TestWs> {
  return new Promise<TestWs>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`wss 접속 시간 초과 (${timeoutMs}ms)`));
    }, timeoutMs);

    ws.once("open", () => {
      clearTimeout(timer);
      resolve(new TestWs(ws));
    });
    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
