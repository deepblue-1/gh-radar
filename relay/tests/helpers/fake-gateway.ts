/**
 * Phase 15 Plan 02 — RELAY-01. `node:net` 기반 가짜 DMA 게이트웨이 (테스트 전용).
 *
 * gh-trade mock 서버 빌드에 의존하지 않고 vitest 프로세스 안에서 완결되는 스텁이다
 * (D-40 의 fallback 경로). 실서버로는 재현하기 어려운 경계 조건 — 프레임 결합/분할,
 * 쓰레기 프레임, 예고 없는 강제 종료, 핑 수신 횟수 — 을 테스트가 **직접 지정**한다.
 *
 * 설계 규율:
 *   - 청크 경계는 테스트가 정한다. `sendRaw` 로 바이트를 원하는 지점에서 쪼갠다
 *     (webapp `chat-sse.test.ts` 의 `readerFromChunks` 사상).
 *   - `close()` 는 서버와 **모든 연결**을 정리한다. 하나라도 남으면 vitest 가 멈춘다.
 *   - 요청 프레임은 `tryParseEnvelope` 로 읽지 않는다. 그 함수는 **수신(응답) 대역**
 *     화이트리스트라 요청 계열(1·4·28·29·32)을 전부 드롭하기 때문이다.
 *
 * 하지 않는 것: 게이트웨이의 업무 로직을 흉내 내지 않는다. 구독 상태·계좌 원장은
 *              없고, 테스트가 지시한 프레임만 그대로 내보낸다.
 */
import net from "node:net";
import * as flatbuffers from "flatbuffers";

import { Envelope } from "../../src/generated/stock-dma/envelope.js";
import { frame, FrameReader } from "../../src/dma/codec.js";
import { MSG } from "../../src/dma/msg-type.js";
import {
  buildBareEnvelope,
  buildLoginRespFrame,
  buildQuoteStateFrame,
  buildTradeTapeFrame,
  buildUpdateAccountNoRespFrame,
  type FakeAccount,
  type FakeLoginRespInput,
  type FakeQuoteInput,
  type FakeTapeInput,
} from "./frames.js";

/** 스키마에 없는 `msg_type`. 수신 화이트리스트 드롭 경로를 태우는 데 쓴다. */
const UNKNOWN_MSG_TYPE = 99;

/** 수신 프레임 관찰자. `payload` 는 Envelope 페이로드(길이 헤더 제거본)다. */
export type FrameHandler = (msgType: number, payload: Buffer, sock: net.Socket) => void;

export type FakeGatewayOptions = {
  /** `LoginReq(1)` 수신 시 `LoginResp(50)` 자동 응답 여부. 기본 true. */
  autoLogin?: boolean;
  /** 자동 응답의 내용. 기본 `{ success: true }` (계좌는 `SAMPLE_ACCOUNTS`). */
  loginResp?: FakeLoginRespInput;
  /**
   * `UpdateAccountNoReq(3)` 수신 시 `UpdateAccountNoResp(55)` 자동 응답 여부. 기본 true.
   *
   * 기본 응답은 **그 연결에서 선언된 계좌의 누적 목록 전체**다 — 실서버 계약과 같다.
   * 끄면 "선언은 받았지만 응답이 없는 게이트웨이"(5초 대조 타임아웃)를 재현한다.
   */
  autoAccount?: boolean;
};

/** `UpdateAccountNoReq(3)` 1건의 관찰 기록. */
export type DeclaredAccount = { mode: string; accountNo: string };

/** 쓰레기 프레임 종류. */
export type GarbageKind =
  /** 화이트리스트 밖 msg_type (99) — 파서 드롭 경로. */
  | "unknown-msg-type"
  /** 8바이트 미만 페이로드 — 코덱 드롭 경로. */
  | "too-small"
  /** 정상 프레임을 끝에서 잘라낸 것 — Verifier 부재 대응 경로. */
  | "truncated";

export type FakeGateway = {
  /** listen 중인 임의 포트. */
  readonly port: number;
  /** 현재 살아 있는 연결들. */
  readonly sockets: net.Socket[];
  /** 수신 프레임 관찰자 등록 (복수 등록 가능). */
  onFrame(handler: FrameHandler): void;
  /** 로그인 자동 응답을 켜고 내용을 지정한다. */
  respondLogin(resp?: FakeLoginRespInput): void;
  /** 로그인 자동 응답을 켜고 허용 계좌 목록만 바꾼다 (`success: true`). */
  respondLoginWithAccounts(accounts: FakeAccount[], message?: string): void;
  /**
   * 계좌 선언 응답을 **고정 목록**으로 바꾼다. 누적 목록 대신 항상 이 값을 돌려준다 —
   * 대조 실패(누락)·여분 계좌 경로를 재현할 때 쓴다.
   */
  respondUpdateAccountNo(accountList: string[]): void;
  /** 계좌 선언 응답을 끈다 — 선언은 받되 답하지 않는다 (5초 대조 타임아웃 재현). */
  silenceAccountResp(): void;
  /** 지금까지 수신한 `UpdateAccountNoReq(3)` 전량 (송신 순서 그대로). */
  declaredAccounts(): DeclaredAccount[];
  /**
   * 로그인 자동 응답을 끈다 — 이후 `LoginReq` 는 받기만 하고 답하지 않는다.
   * "붙었지만 응답이 없는 게이트웨이"(운용 중 5초 타임아웃)를 재현할 때 쓴다.
   */
  silenceLogin(): void;
  /** 호가 프레임 주입 (58/59 — `snapshot` 이 가른다). */
  pushQuote(sock: net.Socket, input?: FakeQuoteInput): void;
  /** 체결 테이프 프레임 주입 (69/71). */
  pushTape(sock: net.Socket, input?: FakeTapeInput): void;
  /** 임의 바이트 주입 — 청크 경계를 테스트가 지정한다. 길이 프레이밍을 하지 않는다. */
  sendRaw(sock: net.Socket, bytes: Uint8Array): void;
  /** 정상 프레이밍으로 페이로드 1건 전송. */
  sendFrame(sock: net.Socket, payload: Uint8Array): void;
  /** 쓰레기 프레임 주입 (드롭 경로 검증). */
  sendGarbage(sock: net.Socket, kind?: GarbageKind): void;
  /** 예고 없는 강제 종료 (재접속 경로 검증). */
  hardClose(sock: net.Socket): void;
  /** 수신한 `LivePing(4)` 누적 횟수 (30초 핑 검증). */
  receivedPings(): number;
  /** 첫(또는 다음) 연결을 기다린다. */
  waitForConnection(timeoutMs?: number): Promise<net.Socket>;
  /** 서버와 모든 연결을 정리한다. */
  close(): Promise<void>;
};

/**
 * 페이로드에서 `msg_type` 만 읽는다. 요청 대역도 읽어야 하므로 화이트리스트를 쓰지 않는다.
 *
 * `tryParseEnvelope` 를 쓰지 않는 이유는 그 함수가 **수신(응답) 대역** 화이트리스트라
 * 요청 계열(1·3·4·28·29·32)을 전부 드롭하기 때문이다.
 */
function rootEnvelope(payload: Buffer): Envelope | null {
  try {
    const bb = new flatbuffers.ByteBuffer(
      new Uint8Array(payload.buffer, payload.byteOffset, payload.length),
    );
    return Envelope.getRootAsEnvelope(bb);
  } catch {
    return null;
  }
}

function readMsgType(payload: Buffer): number {
  return rootEnvelope(payload)?.msgType() ?? -1;
}

/** 요청 프레임에서 계좌 선언 내용을 꺼낸다 (게이트웨이 흉내 — 요청 대역 직접 파싱). */
function readDeclaredAccount(payload: Buffer): DeclaredAccount | null {
  const req = rootEnvelope(payload)?.updateAccountNoReq();
  if (req === null || req === undefined) return null;
  return { mode: req.mode() ?? "", accountNo: req.accountNo() ?? "" };
}

/** 시세 요청(28 호가 스냅샷 / 32 체결 스냅샷)의 구독 키. */
export type QuoteRequestKey = { isin: string; exchange: string };

/**
 * 시세 요청 프레임에서 구독 키를 꺼낸다 (15-14 E2E 픽스처가 쓴다).
 *
 * **여기에 두는 이유**: `flatbuffers` 와 생성 코드는 relay 패키지의 의존성이다. pnpm 은
 * 패키지별 `node_modules` 를 격리하므로 webapp 쪽 파일이 `flatbuffers` 를 직접 import
 * 하면 해석에 실패한다. 파싱을 이 파일 안에 두면 호출자는 프레임 해석을 몰라도 되고,
 * 스텁 게이트웨이도 한 벌로 유지된다(두 벌이면 스키마 변경 때 한쪽만 고쳐진다).
 *
 * @returns 28/32 요청이면 `{isin, exchange}`, 그 외 msg_type 이면 `null`
 */
export function readQuoteRequestKey(msgType: number, payload: Buffer): QuoteRequestKey | null {
  const env = rootEnvelope(payload);
  if (env === null) return null;
  if (msgType === MSG.GetQuoteReq) {
    const req = env.getQuoteReq();
    if (req === null || req === undefined) return null;
    return { isin: req.isin() ?? "", exchange: req.exchange() ?? "" };
  }
  if (msgType === MSG.GetTradeTapeReq) {
    const req = env.getTradeTapeReq();
    if (req === null || req === undefined) return null;
    return { isin: req.isin() ?? "", exchange: req.exchange() ?? "" };
  }
  return null;
}

export async function startFakeGateway(opts: FakeGatewayOptions = {}): Promise<FakeGateway> {
  const handlers: FrameHandler[] = [];
  const sockets: net.Socket[] = [];
  const pendingConnections: Array<(sock: net.Socket) => void> = [];
  let autoLogin = opts.autoLogin ?? true;
  let loginResp: FakeLoginRespInput = opts.loginResp ?? { success: true };
  let autoAccount = opts.autoAccount ?? true;
  /** null 이면 "선언 누적 목록을 돌려준다", 배열이면 그 값을 고정으로 돌려준다. */
  let fixedAccountList: string[] | null = null;
  const declared: DeclaredAccount[] = [];
  let pings = 0;

  const server = net.createServer((sock) => {
    sock.on("error", () => {
      // 강제 종료 테스트에서 ECONNRESET 이 정상적으로 발생한다 — 프로세스를 죽이지 않는다.
    });
    sockets.push(sock);
    sock.on("close", () => {
      const i = sockets.indexOf(sock);
      if (i >= 0) sockets.splice(i, 1);
    });

    // 이 연결에서 누적된 등록 계좌 목록. 서버는 선언 1건마다 **전체**를 돌려준다.
    const registered: string[] = [];

    const reader = new FrameReader();
    sock.on("data", (chunk: Buffer) => {
      const { frames } = reader.push(chunk);
      for (const payload of frames) {
        const msgType = readMsgType(payload);
        if (msgType === MSG.LivePing) pings += 1;
        if (msgType === MSG.LoginReq && autoLogin) {
          sock.write(frame(buildLoginRespFrame(loginResp)));
        }
        if (msgType === MSG.UpdateAccountNoReq) {
          const req = readDeclaredAccount(payload);
          if (req !== null) {
            declared.push(req);
            if (!registered.includes(req.accountNo)) registered.push(req.accountNo);
          }
          if (autoAccount) {
            sock.write(frame(buildUpdateAccountNoRespFrame(fixedAccountList ?? [...registered])));
          }
        }
        for (const h of handlers) h(msgType, payload, sock);
      }
    });

    const waiter = pendingConnections.shift();
    if (waiter) waiter(sock);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("가짜 게이트웨이 포트를 확인할 수 없습니다");
  }
  const port = address.port;

  return {
    port,
    sockets,

    onFrame(handler) {
      handlers.push(handler);
    },

    respondLogin(resp) {
      autoLogin = true;
      loginResp = resp ?? { success: true };
    },

    respondLoginWithAccounts(accounts, message) {
      autoLogin = true;
      loginResp = { success: true, accounts, ...(message === undefined ? {} : { message }) };
    },

    respondUpdateAccountNo(accountList) {
      autoAccount = true;
      fixedAccountList = [...accountList];
    },

    silenceAccountResp() {
      autoAccount = false;
    },

    declaredAccounts() {
      return [...declared];
    },

    silenceLogin() {
      autoLogin = false;
    },

    pushQuote(sock, input) {
      sock.write(frame(buildQuoteStateFrame(input)));
    },

    pushTape(sock, input) {
      sock.write(frame(buildTradeTapeFrame(input)));
    },

    sendRaw(sock, bytes) {
      sock.write(Buffer.from(bytes));
    },

    sendFrame(sock, payload) {
      sock.write(frame(payload));
    },

    sendGarbage(sock, kind = "unknown-msg-type") {
      if (kind === "too-small") {
        sock.write(frame(new Uint8Array([1, 2, 3, 4])));
        return;
      }
      if (kind === "truncated") {
        const full = buildQuoteStateFrame();
        sock.write(frame(full.subarray(0, full.length - 10)));
        return;
      }
      sock.write(frame(buildBareEnvelope(UNKNOWN_MSG_TYPE)));
    },

    hardClose(sock) {
      sock.destroy();
    },

    receivedPings() {
      return pings;
    },

    waitForConnection(timeoutMs = 1000) {
      const existing = sockets[0];
      if (existing !== undefined) return Promise.resolve(existing);
      return new Promise<net.Socket>((resolve, reject) => {
        const timer = setTimeout(() => {
          const i = pendingConnections.indexOf(onConnect);
          if (i >= 0) pendingConnections.splice(i, 1);
          reject(new Error(`가짜 게이트웨이 연결 대기 시간 초과 (${timeoutMs}ms)`));
        }, timeoutMs);
        function onConnect(sock: net.Socket): void {
          clearTimeout(timer);
          resolve(sock);
        }
        pendingConnections.push(onConnect);
      });
    },

    async close() {
      // 연결을 먼저 끊어야 server.close() 의 콜백이 돌아온다.
      for (const sock of [...sockets]) sock.destroy();
      sockets.length = 0;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}
