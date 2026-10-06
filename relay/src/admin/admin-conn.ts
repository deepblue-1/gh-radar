/**
 * Phase 29 Plan 08 — ADMIN-04/05. 서버별 admin 관리 연결 (`AdminConn`).
 *
 * 게이트웨이에 **관찰자 로그인 role 2(admin)** 로 붙는 연결 하나. gh-trade 관문(D-02 · 92cdfbff)은 이 연결을 어떤 Session 에도
 * 붙이지 않고 4(LivePing) · 44(AdminCommandReq) 만 처리한다 — 80 · 76/78 · 사용자 요청은 드롭된다. 그래서 relay 도 이 연결로는
 * 로그인(5) · 핑(4) · 44 외에 아무것도 보내지 않는다. 받는 것은 79 · 86 · 87 뿐이고, 그 밖 프레임은 debug 로 버린다.
 *
 * 흐름:
 *   start() → connect → "up" → 관찰자 로그인 1건(role 2 · client `ADMIN_CLIENT_NAME`) → 79 판단 → ready
 *   → **접속마다 op 5 ListUsers 1건** → 87 → 서버별 스냅샷 캐시 + "snapshot" 이벤트
 *
 * 결정 근거:
 *   D-23 ①      admin 연결은 **서버당 1개**다(journal 1 + admin 1 · quote 는 주 서버 1 → 서버 정원 6 안). `ServerPipelines` 가
 *               저널 관찰자와 같은 수명으로 하나만 만든다. 이 클래스 안에서도 전송은 하나뿐이다.
 *   D-07        86/87 은 이 클래스 밖으로 `command()` 의 결과 · "snapshot" 이벤트로만 나간다. 사용자 세션 · 브라우저(wss)로
 *               흘리지 않는다 — Admin 경로는 Express HTTP 뿐이다(29-11 fan-out · 29-14 적재가 소비자).
 *   users_rev   서버 메모리 카운터라 **재기동 시 1 로 돌아간다** — 신선도 근거가 아니다. 그래서 접속(연결 세대)마다 op 5 로 전체를
 *               다시 받고, 세대가 바뀌면 캐시 스냅샷을 버린다(새 세대의 87 이 올 때까지 `currentSnapshot()` = null).
 *               rev 비교는 **같은 세대 안에서만** 한다(29-08 Task 2 — 86 의 rev 가 직전과 다르면 바로 뒤 87 을 기다린다).
 *   Pattern 2   저널 관찰자(`journal/observer.ts`)에 role 분기를 넣지 않는다 — `quote/feed.ts` 의 상태기계 뼈대(상태 · 로그인 타이머 ·
 *               generation · `#halt` · 거부 유한 재시도)를 파생 복사하고 role · client 상수만 바꾼다(Phase 26 선례).
 *   WR-03 동형  79 거부 → `rejected` + `ADMIN_REJECTED_RETRY_MS`(5분) × `ADMIN_REJECTED_RETRY_MAX`(12) 유한 재시도. 공유 비밀이라
 *               계정 잠금 위험이 없고, 서버 정원(6)은 배포 겹침 · 옛 half-open 연결로 일시적으로 찰 수 있다.
 *   Pitfall 2   role 을 모르는 구 서버가 다른 역할로 수락하면(79 success · role ≠ 2) `role_mismatch` 로 영구 정지 — 44 를 보내도
 *               드롭될 뿐이다.
 *   Pitfall 12  79 의 broker 가 레지스트리 행의 증권사와 다르면(비어 있지 않고 "MOCK" 이 아닐 때) 주소 오설정이다 — 다른 증권사
 *               서버의 users.toml 을 고치지 않도록 `rejected` 로 영구 정지한다(재시도 없음 · 저널 관찰자 29-03 동형).
 *   LivePing    `DmaClient` 의 30초 핑을 그대로 쓴다 — 게이트웨이 유휴 스윕(90초)에 걸리지 않는다.
 *
 * 명령 상관 (`command()` · 29-08 Task 2):
 *   - **서버당 1건 비행.** 내부 FIFO 대기열에서 한 번에 하나만 44 로 내보낸다. 앞 명령이 86(+87) · 타임아웃 · offline 으로
 *     끝나야 다음 44 가 나간다 — 87 에 request_id 가 없어 「86 직후 같은 연결 순서」로만 짝지을 수 있기 때문이다.
 *   - `request_id` 는 연결 세대와 무관한 ulong 단조 카운터(BigInt)다. 접속 때의 op 5 도 같은 카운터를 쓴다. 86 의 request_id 가
 *     비행 중 항목과 다르면(늦게 온 86 · 타임아웃 뒤) **warn 후 버린다** — 누구의 Promise 도 풀지 않는다.
 *   - 86 응답 상한 `ADMIN_COMMAND_TIMEOUT_MS`(5초) → `{ kind: "timeout" }`. ready 가 아니거나 연결이 끊기면 비행 · 대기열 전부
 *     `{ kind: "offline" }`. 실패는 그 서버에만 머문다(다른 서버 · 저널 관찰자 · 사용자 세션과 아무것도 공유하지 않는다).
 *   - **87 대기 규칙:** 86 이 ok 이고 users_rev 가 **같은 세대의 직전 rev** 와 다르면(= 실제 변경) 바로 뒤 87 을
 *     `ADMIN_SNAPSHOT_WAIT_MS`(1초) 까지 기다려 `{ result, snapshot }` 으로 푼다. 무변경(code 0 · rev 같음) · 실패(ok false)는
 *     87 이 오지 않으므로 기다리지 않는다. 상한을 넘기면 op 5 를 한 번 더 보내 캐시를 맞추고 결과는 snapshot 없이 푼다.
 *     87 을 기다리는 중 연결이 끊기면 변경은 이미 반영됐으므로 offline 이 아니라 snapshot 없는 result 로 푼다(재접속 op 5 가 맞춘다).
 *   - op 5 를 `command()` 로 부르면 86 이 없으므로 87 을 응답으로 보고 `{ result(합성 · code 0 · 그 87 의 rev), snapshot }` 으로 푼다.
 *   - 요청 없는 87(다른 admin 클라의 변경 뒤 등)도 캐시를 갈아 끼우고 "snapshot" 이벤트를 낸다.
 *   - 감사 로그는 86 마다 1줄(serverKey · op · requestId · code · rev). dmaUserId · 계좌 · 비밀번호는 싣지 않는다 — 누가 시켰는지는
 *     29-11 이 남긴다.
 *   T-19-03     비밀은 로그인 페이로드 조립(`buildObserverLoginReq`)에만 넘긴다. 비밀 · 계좌번호 · dmaUserId 는 어떤 로그 인자에도
 *               싣지 않는다 — 로그 문맥은 serverKey · state · 계수뿐이다(호스트도 싣지 않는다 — T-26-07 동형).
 *
 * 상태 (초기값 `disabled` = 아직 시작하지 않음 또는 비밀 없음):
 *   disabled → (start · 비밀 있음) connecting → (up) logging_in → (79 ok · role 2 · broker 일치) ready → op 5 송신
 *   logging_in → (79 거부) rejected ■ · (79 ok · role≠2) role_mismatch ■ · (broker 불일치) rejected ■(재시도 없음)
 *               · (응답 타임아웃) connecting
 *   ready/logging_in → (down) connecting → … (세대가 바뀌므로 스냅샷 무효 · 재접속 ready 에서 op 5 를 다시 보낸다)
 *   rejected → (ADMIN_REJECTED_RETRY_MS · 최대 ADMIN_REJECTED_RETRY_MAX 회) connecting → …
 *   ■ = 정지(재접속 루프 끊김 · 이후 up 에도 로그인하지 않는다)
 */
import { EventEmitter } from "node:events";

import { DmaClient, type TransportDownEvent, type TransportFrameEvent, type TransportUpEvent } from "../dma/dma-client.js";
import {
  buildAdminCommandReq,
  buildObserverLoginReq,
  parseAdminCommandResp,
  parseAdminUsersSnapshot,
  parseObserverLoginResp,
} from "../dma/envelope.js";
import { MSG } from "../dma/msg-type.js";
import { LOGIN_RESP_TIMEOUT_MS } from "../dma/session.js";
import { logger } from "../logger.js";
import type { ObserverLoginResult, ObserverTransport } from "../journal/types.js";
import { ADMIN_CODE, ADMIN_CODE_NAME, ADMIN_OP, ADMIN_ROLE, type AdminCommandInput, type AdminCommandResult, type AdminUsersSnapshot } from "./types.js";

/** admin 관찰자 로그인의 `client` 값 — 게이트웨이 로그 `client='…'` 에서 저널(`gh-radar-relay`) · quote 연결과 가른다. */
export const ADMIN_CLIENT_NAME = "gh-radar-relay/admin";

/** 관찰자 로그인 거부(`rejected`) 뒤 재시도 간격(ms) = 5분 — quote 연결(WR-03)과 같은 눈금. */
export const ADMIN_REJECTED_RETRY_MS = 5 * 60_000;

/** 거부 뒤 재시도 상한 = 12회(5분 × 12 = 1시간). 다 쓰면 재시작 전 복구 없음으로 굳는다. */
export const ADMIN_REJECTED_RETRY_MAX = 12;

/** 44 → 86 응답 대기 상한(ms). 넘기면 그 명령만 `timeout` 이고 다음 명령으로 넘어간다. */
export const ADMIN_COMMAND_TIMEOUT_MS = 5_000;

/** 변경 86 뒤 87 대기 상한(ms). 서버는 86 바로 뒤에 87 을 쓰므로 정상이면 수 ms 안에 온다. */
export const ADMIN_SNAPSHOT_WAIT_MS = 1_000;

/** 79 broker 대조에서 통과시키는 로컬 mock 게이트웨이 값 (Phase 29 Pitfall 12 — 저널 관찰자와 같다). */
const MOCK_BROKER = "MOCK";

export type AdminConnState = "disabled" | "connecting" | "logging_in" | "ready" | "rejected" | "role_mismatch";

export type AdminConnDeps = {
  /** 레지스트리 키(예: KB120). 로그 문맥 · 이벤트 · healthz 의 서버 식별자다. */
  serverKey: string;
  /** 레지스트리 행의 증권사 — 79 broker 대조 원천(Pitfall 12). */
  broker: string;
  /** 그 증권사 관찰자 비밀(새 Secret 없음 — `secretOf(broker)`). 없거나 빈 문자열이면 disabled · 소켓 0. 로그 인자 금지. */
  secret: string | undefined;
  host: string;
  port: number;
  /** 주입하지 않으면 `new DmaClient({host, port})` 를 **하나** 만든다(저널 관찰자 · 사용자 세션과 독립된 소켓). */
  transport?: ObserverTransport;
  /** 로그인 응답 대기 상한(ms). 기본 `LOGIN_RESP_TIMEOUT_MS`(session.ts 정본). */
  loginTimeoutMs?: number;
  /** 거부 뒤 재시도 간격(ms). 기본 `ADMIN_REJECTED_RETRY_MS`. 테스트가 짧게 주입한다. */
  rejectedRetryMs?: number;
  /** 86 응답 대기 상한(ms). 기본 `ADMIN_COMMAND_TIMEOUT_MS`. */
  commandTimeoutMs?: number;
  /** 변경 86 뒤 87 대기 상한(ms). 기본 `ADMIN_SNAPSHOT_WAIT_MS`. */
  snapshotWaitMs?: number;
};

/** `command()` 결과. */
export type AdminCommandOutcome =
  | { kind: "result"; result: AdminCommandResult; snapshot?: AdminUsersSnapshot }
  | { kind: "timeout" }
  | { kind: "offline" };

/** healthz 본문 `adminConns.<서버 키>` — 상태와 rev 뿐(식별자 없음). */
export type AdminConnHealth = { state: AdminConnState; usersRev: string | null };

/** "snapshot" 이벤트 페이로드 — 87 을 받을 때마다(요청한 것이든 아니든) 1회. 29-14 가 DB 표에 적재한다. */
export type AdminSnapshotEvent = { serverKey: string; snapshot: AdminUsersSnapshot };

export interface AdminConn {
  on(event: "state", listener: (state: AdminConnState) => void): this;
  on(event: "snapshot", listener: (e: AdminSnapshotEvent) => void): this;
  off(event: "state", listener: (state: AdminConnState) => void): this;
  off(event: "snapshot", listener: (e: AdminSnapshotEvent) => void): this;
  emit(event: "state", state: AdminConnState): boolean;
  emit(event: "snapshot", e: AdminSnapshotEvent): boolean;
}

/** 캐시 스냅샷 — 받은 연결 세대에 묶인다. 세대가 바뀌면 무효다(users_rev 는 재기동 시 1 로 돌아가므로). */
type CachedSnapshot = { generation: number; value: AdminUsersSnapshot; receivedAtMs: number };

type CommandInput = Omit<AdminCommandInput, "requestId">;

/** 대기열 항목. */
type QueuedCommand = { input: CommandInput; resolve: (outcome: AdminCommandOutcome) => void };

/** 비행 중 항목 — 86 을 기다리거나(`resp`), 변경 86 뒤 87 을 기다린다(`snapshot` · op 5 는 처음부터 `snapshot`). */
type InFlightCommand = QueuedCommand & {
  requestId: bigint;
  awaiting: "resp" | "snapshot";
  timer: NodeJS.Timeout | null;
  /** 87 을 기다리는 동안 들고 있는 86. op 5 는 없다. */
  result: AdminCommandResult | null;
};

export class AdminConn extends EventEmitter {
  readonly #deps: AdminConnDeps;
  readonly #loginTimeoutMs: number;
  readonly #rejectedRetryMs: number;
  readonly #commandTimeoutMs: number;
  readonly #snapshotWaitMs: number;
  #transport: ObserverTransport | null;

  #state: AdminConnState = "disabled";
  #started = false;
  #stopped = false;
  #loginTimer: NodeJS.Timeout | null = null;
  /** 거부 뒤 재시도 타이머. stop · 재시도 발화에서 지운다. */
  #rejectedRetryTimer: NodeJS.Timeout | null = null;
  /** 연속 거부 횟수 — ready 에서 0 으로 되돌린다. */
  #rejectedCount = 0;
  /** broker 불일치 정지 — 거부와 같은 `rejected` 지만 재시도하지 않는다. */
  #brokerMismatch = false;

  /** 44 `request_id` — 연결 세대와 무관하게 단조 증가(ulong · bigint). 게이트웨이 로그에서 요청을 한 줄로 가른다. */
  #nextRequestId = 1n;
  #snapshot: CachedSnapshot | null = null;
  /** 같은 세대에서 마지막으로 본 users_rev(86 · 87). 세대가 바뀌면 비교하지 않는다. */
  #rev: { generation: number; value: bigint } | null = null;
  readonly #queue: QueuedCommand[] = [];
  #inFlight: InFlightCommand | null = null;

  readonly #onUp = (e: TransportUpEvent): void => this.#handleUp(e);
  readonly #onDown = (e: TransportDownEvent): void => this.#handleDown(e);
  readonly #onFrame = (e: TransportFrameEvent): void => {
    if (this.#stopped) return;
    this.#handleFrame(e);
  };

  constructor(deps: AdminConnDeps) {
    super();
    this.#deps = deps;
    this.#loginTimeoutMs = deps.loginTimeoutMs ?? LOGIN_RESP_TIMEOUT_MS;
    this.#rejectedRetryMs = deps.rejectedRetryMs ?? ADMIN_REJECTED_RETRY_MS;
    this.#commandTimeoutMs = deps.commandTimeoutMs ?? ADMIN_COMMAND_TIMEOUT_MS;
    this.#snapshotWaitMs = deps.snapshotWaitMs ?? ADMIN_SNAPSHOT_WAIT_MS;
    this.#transport = deps.transport ?? null;
  }

  get serverKey(): string {
    return this.#deps.serverKey;
  }

  get state(): AdminConnState {
    return this.#state;
  }

  /** 비밀이 있었는가(부팅 로그 · enabled 표기용 — 값 자체는 없다). */
  get enabled(): boolean {
    return this.#hasSecret();
  }

  get isReady(): boolean {
    return this.#state === "ready" && !this.#stopped;
  }

  /**
   * 이 연결 세대에서 받은 users.toml 전체 스냅샷. ready 이고 **같은 세대**의 87 이 있을 때만 값이다 — 재접속 뒤 새 87 이 오기
   * 전에는 null(planner 는 이때 `no-snapshot` 으로 보내지 않는다).
   */
  currentSnapshot(): AdminUsersSnapshot | null {
    const snap = this.#snapshot;
    if (snap === null || !this.isReady || this.#transport === null) return null;
    if (snap.generation !== this.#transport.generation) return null;
    return snap.value;
  }

  /**
   * 관리 명령 1건(44). 서버당 1건 비행 — 앞 명령이 끝나야 나간다. 결과는 throw 하지 않고 세 갈래로만 온다:
   * `result`(86 · 변경이면 87 동반) · `timeout`(86 미도착) · `offline`(ready 아님 · 끊김 · 정지).
   */
  command(input: CommandInput): Promise<AdminCommandOutcome> {
    if (!this.isReady || this.#transport === null) return Promise.resolve({ kind: "offline" });
    return new Promise<AdminCommandOutcome>((resolve) => {
      this.#queue.push({ input, resolve });
      this.#pump();
    });
  }

  /** healthz 본문 `adminConns.<서버 키>` — 상태 · 이 세대의 users_rev(문자열 · 모르면 null). 식별자 없음. */
  health(): AdminConnHealth {
    const rev = this.isReady ? this.#currentRev() : null;
    return { state: this.#state, usersRev: rev === null ? null : rev.toString() };
  }

  // ----------------------------------------------------------
  // 수명
  // ----------------------------------------------------------

  start(): void {
    if (this.#started) {
      logger.warn({ serverKey: this.#deps.serverKey, state: this.#state }, "[ADMIN] admin 연결 start 중복 — 무시");
      return;
    }
    this.#started = true;
    if (!this.#hasSecret()) {
      this.#setState("disabled");
      logger.info({ serverKey: this.#deps.serverKey }, "[ADMIN] 관찰자 비밀 미설정 — admin 연결 비활성(연결을 열지 않는다)");
      return;
    }
    const transport = this.#transport ?? new DmaClient({ host: this.#deps.host, port: this.#deps.port });
    this.#transport = transport;
    transport.on("up", this.#onUp);
    transport.on("down", this.#onDown);
    // 수신 콜백은 동기다 — 여기서 아무것도 기다리지 않는다(19 D-32 동형).
    transport.on("frame", this.#onFrame);
    this.#setState("connecting");
    transport.connect();
  }

  /** 종료. 타이머 · 리스너를 떼고 전송을 닫는다. 이후 어떤 이벤트도 상태를 바꾸지 않는다. 여러 번 불러도 된다. */
  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#clearLoginTimer();
    this.#clearRejectedRetry();
    this.#snapshot = null;
    this.#failAll("정지");
    const transport = this.#transport;
    if (transport !== null && this.#started) {
      transport.off("up", this.#onUp);
      transport.off("down", this.#onDown);
      transport.off("frame", this.#onFrame);
      transport.destroy();
    }
    logger.info({ serverKey: this.#deps.serverKey, lastState: this.#state }, "[ADMIN] admin 연결 종료");
  }

  // ----------------------------------------------------------
  // 전송 이벤트
  // ----------------------------------------------------------

  #handleUp(e: TransportUpEvent): void {
    const transport = this.#transport;
    if (transport === null || this.#stopped) return;
    if (e.generation !== transport.generation) return; // 구세대
    if (this.#isHalted()) {
      logger.warn({ serverKey: this.#deps.serverKey, state: this.#state }, "[ADMIN] 정지된 admin 연결에 전송 up — 로그인하지 않는다");
      return;
    }
    const secret = this.#deps.secret;
    if (secret === undefined || secret === "") return;

    const payload = buildObserverLoginReq({
      secret,
      sinceSeq: 0,
      epoch: "",
      client: ADMIN_CLIENT_NAME,
      strategySinceSeq: 0,
      role: ADMIN_ROLE,
    });
    this.#setState("logging_in");
    if (!transport.send(payload)) {
      this.#dropTransport("admin 로그인 송신 실패");
      return;
    }
    logger.info({ serverKey: this.#deps.serverKey, role: ADMIN_ROLE, client: ADMIN_CLIENT_NAME }, "[ADMIN] admin 관찰자 로그인 요청");
    this.#armLoginTimer(e.generation);
  }

  #handleDown(e: TransportDownEvent): void {
    this.#clearLoginTimer();
    // 세대가 바뀌었다 — 캐시 스냅샷은 더 이상 이 서버의 현재 상태라고 말할 수 없다.
    this.#snapshot = null;
    this.#failAll("연결 끊김");
    if (this.#stopped || this.#isHalted() || this.#state === "disabled") return;
    logger.warn({ serverKey: this.#deps.serverKey, reason: e.reason }, "[ADMIN] admin 연결 끊김 — DmaClient 가 재접속한다");
    this.#setState("connecting");
  }

  /** 동기다 — await 금지. */
  #handleFrame(e: TransportFrameEvent): void {
    const transport = this.#transport;
    if (transport === null) return;
    if (e.generation !== transport.generation) return; // 구세대 프레임
    if (this.#isHalted()) return;
    if (e.msgType === MSG.ObserverLoginResp) {
      const result = parseObserverLoginResp(e.env);
      if (result === null) {
        logger.warn({ serverKey: this.#deps.serverKey, msgType: e.msgType }, "[ADMIN] admin 로그인 응답 파손 — 무시(응답 타임아웃이 연결을 다시 세운다)");
        return;
      }
      this.#onLogin(result);
      return;
    }
    if (this.#state !== "ready") {
      logger.debug({ serverKey: this.#deps.serverKey, msgType: e.msgType, state: this.#state }, "[ADMIN] ready 전 프레임 — 버린다");
      return;
    }
    if (e.msgType === MSG.AdminCommandResp) {
      const result = parseAdminCommandResp(e.env);
      if (result === null) {
        logger.warn({ serverKey: this.#deps.serverKey, msgType: e.msgType }, "[ADMIN] 86 파손 — 버린다(비행 중 명령은 타임아웃으로 끝난다)");
        return;
      }
      this.#onCommandResp(result, e.generation);
      return;
    }
    if (e.msgType === MSG.AdminUsersSnapshot) {
      const snapshot = parseAdminUsersSnapshot(e.env);
      if (snapshot === null) {
        logger.warn({ serverKey: this.#deps.serverKey, msgType: e.msgType }, "[ADMIN] 87 파손 — 버린다");
        return;
      }
      this.#onSnapshot(snapshot, e.generation);
      return;
    }
    // 86 외 · 87 외 — 관문(D-02)상 오지 않아야 할 프레임(76/78/80 등). 이 연결의 소비자에게 흘리지 않는다.
    logger.debug({ serverKey: this.#deps.serverKey, msgType: e.msgType }, "[ADMIN] admin 연결의 관리 밖 프레임 — 버린다");
  }

  #onLogin(result: ObserverLoginResult): void {
    const serverKey = this.#deps.serverKey;
    if (this.#state !== "logging_in") {
      logger.warn({ serverKey, state: this.#state }, "[ADMIN] 예상 밖 시점의 admin 로그인 응답 — 무시");
      return;
    }
    this.#clearLoginTimer();
    if (!result.success) {
      this.#rejectedCount += 1;
      const attempt = this.#rejectedCount;
      const willRetry = attempt <= ADMIN_REJECTED_RETRY_MAX;
      this.#halt("rejected", "admin 로그인 거부", () =>
        logger.error(
          {
            serverKey,
            gatewayMessage: result.message,
            attempt,
            maxRetries: ADMIN_REJECTED_RETRY_MAX,
            ...(willRetry ? { retryInMs: this.#rejectedRetryMs } : {}),
          },
          willRetry
            ? "[ADMIN] admin 로그인 거부 — 재접속 루프 중단 · 긴 간격 재시도 예약(정원 초과 · 구 서버일 수 있다)"
            : "[ADMIN] admin 로그인 거부 — 재시도 상한 소진 · 재접속 중단(relay 재시작 전 복구 없음)",
        ),
      );
      if (willRetry) this.#armRejectedRetry();
      return;
    }
    if (result.role !== ADMIN_ROLE) {
      this.#halt("role_mismatch", "admin 역할 불일치", () =>
        logger.error(
          { serverKey, role: result.role, expectedRole: ADMIN_ROLE },
          "[ADMIN] admin role_mismatch — 게이트웨이가 admin 역할을 모른다(구 서버) · 재접속 중단",
        ),
      );
      return;
    }
    const expected = this.#deps.broker;
    if (result.broker !== "" && result.broker !== MOCK_BROKER && result.broker !== expected) {
      // 다른 증권사 서버의 users.toml 을 고치지 않는다 — 재접속해도 같은 서버라 결과가 같다(재시도 없음).
      this.#brokerMismatch = true;
      this.#halt("rejected", "admin 로그인 증권사 대조 실패", () =>
        logger.error(
          { serverKey, expectedBroker: expected, receivedBroker: result.broker },
          "[ADMIN] admin 로그인 증권사 대조 실패 — 레지스트리 주소 오설정 의심 · 재접속 중단",
        ),
      );
      return;
    }
    this.#transport?.resetReconnectAttempts();
    this.#rejectedCount = 0;
    this.#setState("ready");
    logger.info({ serverKey }, "[ADMIN] admin 로그인 성공 — ready · users.toml 전체 대조(op 5)");
    // users_rev 는 재기동 시 1 로 돌아간다 — 접속마다 전체를 다시 받는다.
    this.#requestSnapshot();
  }

  /** 87 수신 — 이 세대의 캐시를 통째 교체하고 이벤트를 낸다. 87 을 기다리던 명령이 있으면 그 짝으로 푼다. */
  #onSnapshot(snapshot: AdminUsersSnapshot, generation: number): void {
    this.#snapshot = { generation, value: snapshot, receivedAtMs: Date.now() };
    this.#rev = { generation, value: snapshot.usersRev };
    logger.info(
      { serverKey: this.#deps.serverKey, usersRev: snapshot.usersRev.toString(), userCount: snapshot.users.length },
      "[ADMIN] users.toml 스냅샷 수신(87)",
    );
    this.emit("snapshot", { serverKey: this.#deps.serverKey, snapshot });

    const f = this.#inFlight;
    if (f === null || f.awaiting !== "snapshot") return;
    // op 5 는 86 이 없다 — 87 을 응답으로 보고 결과를 합성한다(code 0 · 그 87 의 rev).
    const result = f.result ?? { requestId: f.requestId, ok: true, code: ADMIN_CODE.Ok, message: "", usersRev: snapshot.usersRev };
    this.#finish(f, { kind: "result", result, snapshot });
  }

  /** 86 수신 — 비행 중 항목과 request_id 로 짝짓는다. 다르면(늦은 86) 버린다. */
  #onCommandResp(result: AdminCommandResult, generation: number): void {
    const serverKey = this.#deps.serverKey;
    const f = this.#inFlight;
    if (f === null || f.awaiting !== "resp" || f.requestId !== result.requestId) {
      logger.warn(
        {
          serverKey,
          requestId: result.requestId.toString(),
          inFlightRequestId: f === null ? null : f.requestId.toString(),
          code: result.code,
        },
        "[ADMIN] 짝 없는 86(타임아웃 뒤 늦은 응답 등) — 버린다",
      );
      return;
    }
    if (f.timer !== null) clearTimeout(f.timer);
    f.timer = null;
    const prevRev = this.#currentRev();
    this.#rev = { generation, value: result.usersRev };
    // 감사 로그 1줄 — op · code · rev 만(dmaUserId · 계좌 · 비밀번호 없음 · 누가 시켰는지는 29-11).
    logger.info(
      {
        serverKey,
        op: f.input.op,
        requestId: result.requestId.toString(),
        ok: result.ok,
        code: result.code,
        codeName: ADMIN_CODE_NAME[result.code] ?? "UNKNOWN",
        usersRev: result.usersRev.toString(),
      },
      "[ADMIN] 명령 결과(86)",
    );
    const changed = result.ok && (prevRev === null || prevRev !== result.usersRev);
    if (!changed) {
      // 무변경 · 실패 — 서버는 87 을 쓰지 않는다. 기다리지 않는다.
      this.#finish(f, { kind: "result", result });
      return;
    }
    // 실제 변경 — 서버는 86 바로 뒤에 87 을 쓴다. 상한 안에 오면 그 짝으로 푼다(#onSnapshot).
    f.awaiting = "snapshot";
    f.result = result;
    f.timer = setTimeout(() => {
      if (this.#inFlight !== f) return;
      logger.warn(
        { serverKey, requestId: result.requestId.toString(), waitMs: this.#snapshotWaitMs },
        "[ADMIN] 변경 86 뒤 87 미도착 — op 5 로 스냅샷을 다시 맞춘다",
      );
      this.#inFlight = null;
      f.timer = null;
      this.#requestSnapshot();
      f.resolve({ kind: "result", result });
      this.#pump();
    }, this.#snapshotWaitMs);
    f.timer.unref?.();
  }

  /** 대기열에서 다음 명령을 내보낸다(비행 중이면 아무것도 하지 않는다). */
  #pump(): void {
    while (this.#inFlight === null && this.#queue.length > 0) {
      const next = this.#queue.shift() as QueuedCommand;
      const transport = this.#transport;
      if (!this.isReady || transport === null) {
        next.resolve({ kind: "offline" });
        continue;
      }
      const requestId = this.#allocRequestId();
      const payload = buildAdminCommandReq({ ...next.input, requestId });
      if (!transport.send(payload)) {
        // 사유(연결 없음 · 송신 예외)는 DmaClient 가 남겼다. 이어지는 down 이 나머지를 offline 으로 푼다.
        logger.warn({ serverKey: this.#deps.serverKey, op: next.input.op }, "[ADMIN] 44 송신 실패 — offline");
        next.resolve({ kind: "offline" });
        continue;
      }
      const f: InFlightCommand = {
        ...next,
        requestId,
        awaiting: next.input.op === ADMIN_OP.ListUsers ? "snapshot" : "resp",
        timer: null,
        result: null,
      };
      f.timer = setTimeout(() => {
        if (this.#inFlight !== f) return;
        logger.warn(
          { serverKey: this.#deps.serverKey, op: f.input.op, requestId: requestId.toString(), timeoutMs: this.#commandTimeoutMs },
          "[ADMIN] 명령 응답 타임아웃 — 이 서버만 timeout · 다음 명령으로",
        );
        this.#inFlight = null;
        f.timer = null;
        f.resolve({ kind: "timeout" });
        this.#pump();
      }, this.#commandTimeoutMs);
      f.timer.unref?.();
      this.#inFlight = f;
    }
  }

  #finish(f: InFlightCommand, outcome: AdminCommandOutcome): void {
    if (f.timer !== null) clearTimeout(f.timer);
    f.timer = null;
    if (this.#inFlight === f) this.#inFlight = null;
    f.resolve(outcome);
    this.#pump();
  }

  /**
   * 연결이 끊기거나 정지할 때 — 비행 · 대기열 전부 offline. 단 87 을 기다리던 명령은 86 으로 변경이 이미 반영됐으므로
   * snapshot 없는 result 로 푼다(재접속 op 5 가 캐시를 맞춘다).
   */
  #failAll(reason: string): void {
    const f = this.#inFlight;
    const queued = this.#queue.splice(0);
    if (f === null && queued.length === 0) return;
    this.#inFlight = null;
    if (f !== null) {
      if (f.timer !== null) clearTimeout(f.timer);
      f.timer = null;
      f.resolve(f.awaiting === "snapshot" && f.result !== null ? { kind: "result", result: f.result } : { kind: "offline" });
    }
    for (const q of queued) q.resolve({ kind: "offline" });
    logger.warn(
      { serverKey: this.#deps.serverKey, reason, inFlight: f === null ? 0 : 1, queued: queued.length },
      "[ADMIN] 연결 끊김 · 정지 — 비행 · 대기 명령을 offline 으로 푼다",
    );
  }

  /** 이 세대에서 마지막으로 본 users_rev. 세대가 다르면 null(재기동 뒤 1 로 돌아간 rev 와 비교하지 않는다). */
  #currentRev(): bigint | null {
    const rev = this.#rev;
    if (rev === null || this.#transport === null || rev.generation !== this.#transport.generation) return null;
    return rev.value;
  }

  /** op 5 ListUsers 1건 — 87 만 돌아온다(request_id 는 87 에 없다 · 같은 연결 순서로 받는다). */
  #requestSnapshot(): boolean {
    const transport = this.#transport;
    if (transport === null || !this.isReady) return false;
    const payload = buildAdminCommandReq({ requestId: this.#allocRequestId(), op: ADMIN_OP.ListUsers, userId: "" });
    if (!transport.send(payload)) {
      logger.warn({ serverKey: this.#deps.serverKey }, "[ADMIN] op 5 송신 실패 — 재접속 뒤 다시 보낸다");
      return false;
    }
    return true;
  }

  #allocRequestId(): bigint {
    const id = this.#nextRequestId;
    this.#nextRequestId += 1n;
    return id;
  }

  // ----------------------------------------------------------
  // 내부
  // ----------------------------------------------------------

  /** 정지(거부 · 역할 불일치). 루프를 먼저 끊고 전송을 닫는다 — 순서가 바뀌면 닫힘이 부른 down 이 재접속을 예약한다. */
  #halt(next: "rejected" | "role_mismatch", reason: string, log: () => void): void {
    log();
    this.#snapshot = null;
    this.#failAll(reason);
    const transport = this.#transport;
    transport?.stopReconnect(reason);
    transport?.destroy();
    this.#setState(next);
  }

  #armRejectedRetry(): void {
    this.#clearRejectedRetry();
    this.#rejectedRetryTimer = setTimeout(() => {
      this.#rejectedRetryTimer = null;
      if (this.#stopped || this.#state !== "rejected" || this.#brokerMismatch || this.#transport === null) return;
      logger.warn(
        { serverKey: this.#deps.serverKey, attempt: this.#rejectedCount + 1, maxRetries: ADMIN_REJECTED_RETRY_MAX },
        "[ADMIN] admin 로그인 거부 뒤 재시도 — 다시 연결한다",
      );
      this.#setState("connecting");
      this.#transport.connect();
    }, this.#rejectedRetryMs);
    this.#rejectedRetryTimer.unref?.();
  }

  #clearRejectedRetry(): void {
    if (this.#rejectedRetryTimer === null) return;
    clearTimeout(this.#rejectedRetryTimer);
    this.#rejectedRetryTimer = null;
  }

  #isHalted(): boolean {
    return this.#state === "rejected" || this.#state === "role_mismatch";
  }

  /** 현재 전송을 끊는다. 백오프 카운터는 두고 DmaClient 가 재접속한다. */
  #dropTransport(reason: string): void {
    this.#clearLoginTimer();
    this.#snapshot = null;
    this.#failAll(reason);
    this.#transport?.dropTransport(reason);
    this.#setState("connecting");
  }

  #hasSecret(): boolean {
    const v = this.#deps.secret;
    return v !== undefined && v !== "";
  }

  #armLoginTimer(gen: number): void {
    this.#clearLoginTimer();
    this.#loginTimer = setTimeout(() => {
      this.#loginTimer = null;
      if (this.#stopped || this.#transport === null || gen !== this.#transport.generation) return;
      if (this.#state !== "logging_in") return;
      logger.warn({ serverKey: this.#deps.serverKey, timeoutMs: this.#loginTimeoutMs }, "[ADMIN] admin 로그인 응답 타임아웃 — 연결 재수립");
      this.#dropTransport("admin 로그인 응답 시간 초과");
    }, this.#loginTimeoutMs);
    this.#loginTimer.unref?.();
  }

  #clearLoginTimer(): void {
    if (this.#loginTimer === null) return;
    clearTimeout(this.#loginTimer);
    this.#loginTimer = null;
  }

  #setState(next: AdminConnState): void {
    if (this.#state === next) return;
    const from = this.#state;
    this.#state = next;
    logger.info({ serverKey: this.#deps.serverKey, from, to: next }, "[ADMIN] admin 연결 상태 전이");
    this.emit("state", next);
  }
}
