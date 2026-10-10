/**
 * Phase 15 Plan 03 — RELAY-01. DMA 세션 상태기계 (운용 준비 판정).
 *
 * gh-trade `client/Services/DMA/Session.cs` 이식. `DmaClient` 가 "TCP 가 붙었는가"를
 * 다룬다면 여기는 **"주문·시세를 받을 준비가 됐는가"**를 다룬다. 두 질문은 다르다 —
 * TCP 는 붙었는데 로그인이 거부되면 화면에 실시간을 띄우면 안 된다.
 *
 * 결정 근거:
 *   D-13  세션은 gh-radar 사용자 1명당 1개다. 시세·체결·계좌·주문이 전부 이 세션을 탄다.
 *   D-14  부트 시퀀스는 `LoginReq(1)` → `LoginResp(50)` → 계좌 선언 → Ready 다.
 *         계좌 단계는 `LoginResp.accounts` **전량**을 `UpdateAccountNoReq(3)` 추가 모드로
 *         연속 선언하고 `UpdateAccountNoResp(55)` 목록과 대조하는 것이다. 조회 왕복은
 *         없다 (17 D-11). 계좌 0건은 정상 부트가 아니라 세션 실패다 (17 D-12).
 *   D-16  서버가 로그인을 **명시 거부**하면 재접속 루프를 멈춘다(`failNoRetry`). 재시도해도
 *         결과가 같고, 백오프마다 같은 거부를 되풀이하면 KB 계정이 잠긴다 (T-15-10).
 *         전송 재접속에는 상한이 없다 (2026-09-06 D-16 완화) — 30초 간격으로 계속 시도한다.
 *         `manual_required` 는 relay 가 더 이상 만들지 않는다. 브라우저가 자기 wss 루프의
 *         상한을 소진했을 때만 쓰는 상태로 남는다.
 *   D-19  평문 비밀번호는 **이 객체의 private 필드에만** 산다. 로그·상태 프레임·에러
 *         메시지·직렬화 어디에도 싣지 않는다 (T-15-19). `toJSON`/`toString`/`inspect` 를
 *         전부 덮어 실수로 객체째 덤프해도 새지 않게 한다.
 *   D-36  연결 상태는 **상태 프레임 하나로만** 표현한다. 여기서 내보내는 `RelayStateMsg`
 *         가 그대로 wss 프레임이 되어, 브라우저가 상태 분기를 중복 구현하지 않는다.
 *   D-38  기준 구현은 C# 세션. 상태 enum 은 **처음부터 전부 선언**하고 나중에 추가하지
 *         않는다 — 상태가 늘어나면 브라우저·서버·relay 세 곳이 동시에 어긋난다.
 *
 * Pitfall 4 (재접속 후 재구독 누락) 대응:
 *   TCP 가 올라오는 경로(최초 부트·자동 재접속·수동 재접속)가 **전부 같은 부트 워커**
 *   (`#onTransportUp`)를 탄다. 그리고 `ready` 이벤트가 **재구독의 유일한 트리거**다.
 *   15-04 의 SubscriptionHub 는 이 이벤트만 구독한다 — 경로를 두 벌 만들지 않는다.
 *
 * Phase 29-21 — Ready 중 계좌 자가 선언 (RESEARCH Pitfall 10 해소 · CONTEXT 「계좌 추가 후 87 → 보고 3(mode 1) 자가 선언」):
 *   Admin 이 연결 중인 사용자에게 계좌를 더하면 그 서버 87 이 오고(`AdminSessionSync`), 이 세션은 **재로그인 없이**
 *   `declareAccounts` 로 새 계좌만 `UpdateAccountNoReq(3)` mode "1" 로 선언한다. 종전엔 `declaring` 밖의
 *   `UpdateAccountNoResp(55)` 를 「예상 밖」 으로 버렸다 — 이제 **대기 중 선언이 있는 Ready 세션**만 그 응답을 대조해
 *   허용 목록에 더하고 `accounts` 이벤트(현재 상태 프레임)를 낸다. 대기 중 선언이 없으면 종전처럼 버린다.
 *   선언 1건당 응답 1건이 오므로 보낸 수만큼 응답을 받고도 목록에 없는 계좌는 서버 거부로 보고 버린다(warn · 마스킹).
 *   응답이 아예 안 오면 `ACCOUNT_RESP_TIMEOUT_MS` 뒤 같은 판정이다. 어느 쪽이든 **세션은 그대로다**(부트 선언과 달리
 *   실패로 가지 않는다 — 이미 Ready 이고 기존 계좌 주문은 유효하다). Ready 가 아니면 선언하지 않는다 — 다음 로그인의
 *   `LoginResp.accounts` 가 users.toml 을 반영한다. 반대로 87 에서 빠진 계좌는 `removeAllowedAccounts` 로 허용 목록에서
 *   즉시 뺀다(fail closed — 서버 통보를 기다리지 않는다).
 *
 * 하지 않는 것:
 *   - 구독 집합을 소유하지 않는다. 그것은 SubscriptionHub(15-04)의 정본이다.
 *   - 주문을 하지 않는다. 15-17 이후 plan 소관이다. 여기서 확정한 계좌 목록이
 *     그 plan 의 `account_no ∈ 세션 계좌 목록` 대조 원천이 된다 (T-15-01).
 *   - 와이어 형식을 해석하지 않는다. 계좌 벡터 상한·형식 가드는 `envelope.ts` 소관이다.
 *   - 소켓을 직접 만지지 않는다. 재접속 정책은 `DmaClient` 가 소유한다.
 */
import { EventEmitter } from "node:events";
import { inspect } from "node:util";

import type { RelayAccount, RelaySessionState, RelayStateMsg } from "@gh-radar/shared";

import { logger } from "../logger.js";
import type { DmaClient, TransportFrameEvent } from "./dma-client.js";
import {
  buildLoginReq,
  buildUpdateAccountNoReq,
  maskAccountNo,
  parseLoginResp,
  parseUpdateAccountNoResp,
} from "./envelope.js";
import { MSG } from "./msg-type.js";

// ============================================================
// 상수 정본 (C# Session.cs L60-61)
// ============================================================

/** `LoginResp(50)` 대기 상한(ms). 초과하면 실패로 확정한다 (D-08 동형). */
export const LOGIN_RESP_TIMEOUT_MS = 5000;

/**
 * 계좌 선언 응답(`UpdateAccountNoResp(55)`) 대조 대기 상한(ms).
 *
 * 선언은 건별로 기다리지 않고 전량을 연속 송신한 뒤 **한 번만** 이 타이머를 건다.
 * 건별 대기로 만들면 계좌 N개에 최악 5N초가 걸려 부트가 사실상 멎는다 (C# A2).
 */
export const ACCOUNT_RESP_TIMEOUT_MS = 5000;

/**
 * 계좌 0건 실패 문구. **이 문구가 그대로 브라우저 상태 프레임에 실린다** (17 D-12).
 *
 * relay 가 고칠 수 있는 문제가 아니라 gh-trade `users.toml` 에 계좌가 등록되지 않은
 * 상태이므로, 사용자가 무엇을 해야 하는지 알 수 있게 원인을 그대로 말한다.
 */
export const NO_ACCOUNTS_MESSAGE = "서버에 등록된 계좌가 없습니다";

// 재접속 상한·백오프는 `dma-client.ts` 가 단일 정본이다 — 여기 복제하지 않는다 (IN-01).

/**
 * 세션 상태 전체 목록. `idle` 은 `start()` 이전의 내부 초기값이고 밖으로 나가지 않는다.
 * 나머지 9종은 `@gh-radar/shared` 의 `RelaySessionState` 와 **같은 집합**이다.
 *
 * `unauthorized` 는 이 객체가 스스로 들어가는 상태가 아니다 — `dma_credentials` 미등록은
 * 세션을 만들기 **전에** wss 계층(15-04)이 판정한다. 그래도 여기 선언해 두는 이유는
 * "상태를 나중에 추가하지 않는다"는 규율 때문이다 (D-38).
 */
export type DmaSessionState = "idle" | RelaySessionState;

/** 종료 상태 — 여기 들어가면 자동으로 빠져나오지 않는다. */
const TERMINAL_STATES: ReadonlySet<DmaSessionState> = new Set<DmaSessionState>([
  "failed",
  "session_rejected",
  "unauthorized",
]);

export type DmaSessionCreds = {
  /** gh-radar 사용자 id. 로그 키이고 세션 맵의 키다 (D-13). */
  userId: string;
  /** DMA 게이트웨이 로그인 id. **로그에 남기지 않는다.** */
  dmaUserId: string;
  /** 평문 비밀번호. 이 객체 밖으로 나가면 안 된다 (D-19). */
  password: string;
  /** `LoginReq.broker`. "KB" · "KYOBO". */
  broker: string;
  /**
   * 레지스트리 서버 키(Phase 29-16 — 세션 = (유저, 서버)). 로그 문맥 · 세션 맵 키의 한 축이다.
   * 레지스트리 없는 단위 테스트는 broker 와 같은 값("KB")을 쓴다.
   */
  serverKey?: string;
  /**
   * 이 세션이 그 계좌를 **소유**하는가 (Phase 29-33 G-1 — 계좌별 주문 서버). 계좌의 유효 주문 서버가 이 세션 서버일 때만
   * true 여야 한다(SessionManager.acquireOn 이 `ownerOf` 로 만든다). 주면 `allowedAccounts`(주문 · 전략 · 83 · 상태 프레임의
   * 대조 원천)가 소유분만이고, 원본은 `declaredAccounts` 다. 호출마다 다시 묻는다 — 지정 · 레지스트리가 바뀌면 재로그인 없이
   * 소유 뷰가 따라간다. 생략 = 종전(원본 전부).
   */
  owns?: (accountNo: string) => boolean;
};

/** Ready 진입 알림 — **재구독의 유일한 트리거**다 (Pitfall 4). */
export type SessionReadyEvent = { generation: number; accounts: RelayAccount[] };

export interface DmaSession {
  on(event: "state", listener: (frame: RelayStateMsg) => void): this;
  on(event: "ready", listener: (e: SessionReadyEvent) => void): this;
  on(event: "frame", listener: (e: TransportFrameEvent) => void): this;
  /**
   * 상태는 그대로인 채 허용 계좌 목록만 바뀌었다 (Phase 29-21 — Ready 중 선언 · 87 축소). 페이로드는 **지금 상태 프레임**
   * (마지막 상태 문구 포함)이라 wss 가 그대로 병합 상태 프레임 재송신에 쓴다.
   */
  on(event: "accounts", listener: (frame: RelayStateMsg) => void): this;
  emit(event: "state", frame: RelayStateMsg): boolean;
  emit(event: "ready", e: SessionReadyEvent): boolean;
  emit(event: "frame", e: TransportFrameEvent): boolean;
  emit(event: "accounts", frame: RelayStateMsg): boolean;
}

/**
 * 사용자 1명의 DMA 세션. 전송은 주입받은 `DmaClient` 가 담당한다.
 */
export class DmaSession extends EventEmitter {
  readonly #userId: string;
  readonly #dmaUserId: string;
  /**
   * 평문 비밀번호 (D-19 / T-15-19). 게터를 만들지 않는다.
   * `readonly` 가 아닌 이유는 `setPassword`(Phase 29-16 · D-08) 하나 — 비밀 교체가 다음 로그인부터 먹게 한다.
   */
  #password: string;
  readonly #broker: string;
  readonly #serverKey: string;
  readonly #client: DmaClient;
  /** 소유 술어 (29-33 G-1). null = 원본 전부(종전). */
  readonly #owns: ((accountNo: string) => boolean) | null;

  #state: DmaSessionState = "idle";
  /**
   * 최초 부트 구간 여부. true 면 실패가 `failed`(사용자에게 즉시 실패)로 확정되고,
   * false(=한 번이라도 Ready 였음)면 자동 재접속으로 넘긴다 (C# `_bootPhase`).
   */
  #bootPhase = true;
  #hasBeenReady = false;
  /**
   * 서버가 허용하고 **선언까지 대조된** 계좌 목록(원본). `ready` 에서는 비지 않는다.
   * 15-17 의 주문 계좌 검증은 이 목록의 소유 뷰(`allowedAccounts` — 29-33)를 원천으로 삼는다 (T-15-01).
   */
  #accounts: RelayAccount[] = [];
  /** 이번 부트에서 선언한 계좌번호 전체. 서버 목록의 "여분" 판정 기준이다 (17 D-13). */
  #bootDeclared: ReadonlySet<string> = new Set<string>();
  /** 아직 서버 목록에서 확인되지 않은 계좌번호. 비면 대조 성공이다. */
  #pendingAccounts = new Set<string>();
  /** 로그인 응답 원문. 대조를 통과한 뒤 `ready` 상태 문구로 쓴다. */
  #loginMessage = "";
  #loginTimer: NodeJS.Timeout | null = null;
  #accountTimer: NodeJS.Timeout | null = null;
  /**
   * Ready 중 선언(29-21)의 대기 계좌 — 계좌번호 → 87 이 준 이름. 응답 목록에서 확인되면 허용 목록에 더하고 지운다.
   * 비어 있지 않을 때만 Ready 중 `UpdateAccountNoResp` 를 처리한다(비면 종전처럼 「예상 밖」).
   */
  #pendingDeclare = new Map<string, RelayAccount>();
  /** 아직 오지 않은 Ready 중 선언 응답 수 — 선언 1건당 응답 1건. 0 이 되면 남은 대기 계좌는 서버 거부다. */
  #declareRespLeft = 0;
  #declareTimer: NodeJS.Timeout | null = null;
  /** 마지막 상태 전이의 화면 문구 · 회차 — `accounts` 이벤트 프레임이 상태 문구를 잃지 않게(29-21). */
  #stateMsg: string | undefined;
  #stateAttempt: number | undefined;

  constructor(creds: DmaSessionCreds, client: DmaClient) {
    super();
    this.#userId = creds.userId;
    this.#dmaUserId = creds.dmaUserId;
    this.#password = creds.password;
    this.#broker = creds.broker;
    this.#serverKey = creds.serverKey ?? creds.broker;
    this.#owns = creds.owns ?? null;
    this.#client = client;

    // TCP 가 올라오는 모든 경로가 이 한 워커를 탄다 (Pitfall 4).
    client.on("up", (e) => this.#onTransportUp(e.generation));
    client.on("down", (e) => this.#onTransportDown(e.reason));
    client.on("frame", (e) => this.#onFrame(e));
    client.on("reconnecting", (e) => this.#onReconnecting(e.attempt, e.reason));
  }

  // ----------------------------------------------------------
  // 관찰용
  // ----------------------------------------------------------

  get userId(): string {
    return this.#userId;
  }

  get state(): DmaSessionState {
    return this.#state;
  }

  /** 레지스트리 서버 키 (Phase 29-16). 세션 맵 키 `${userId}|${serverKey}` 의 한 축 · 로그 문맥. */
  get serverKey(): string {
    return this.#serverKey;
  }

  /**
   * `LoginReq.broker` (Phase 29-16). 세션 키는 (유저, 서버)이고(G-1 · 29-42) 같은 증권사 세션이 여럿일 수 있다(29-35) — 이 값은
   * primary 판정(선호 서버 → 첫 KB → 첫 세션)과 소유 술어(`ownerOf(dma, broker, acct)`)의 증권사 축이다.
   */
  get broker(): string {
    return this.#broker;
  }

  /**
   * 이 세션이 그 DMA id 로 로그인하는가 (Phase 29-16). DMA id 를 게터로 내보내지 않고 **비교만** 연다 —
   * 꺼낼 수 있으면 언젠가 로그 인자에 실린다(D-19 규율 · 이전 phase 결정 「로그에 dmaUserId 금지」).
   */
  isDmaUser(dmaUserId: string): boolean {
    return this.#dmaUserId === dmaUserId;
  }

  /** 주문 라우트가 "지금 주문을 받을 수 있는가"를 묻는 단 하나의 질문이다 (D-15). */
  get isReady(): boolean {
    return this.#state === "ready";
  }

  /**
   * 이 세션이 **한 번이라도** `ready` 에 도달한 적이 있는가.
   *
   * `/healthz` 가 「게이트웨이가 애초에 없는 환경」과 「게이트웨이가 죽은 환경」을 가르는
   * 근거다 — 전자는 정상, 후자는 장애다. `#hasBeenReady` 는 **래치**이며 `false` 로
   * 되돌리는 경로를 만들지 않는다. 되돌리는 순간 그 구분이 사라지고, 진짜 게이트웨이
   * 장애 탐지가 함께 죽는다 (16-21 / T-16-26).
   */
  get hasBeenReady(): boolean {
    return this.#hasBeenReady;
  }

  /**
   * 대조를 통과한 계좌 중 **이 세션이 소유한** 계좌의 복사본 (Phase 29-33 G-1 — 소유 술어가 없으면 원본 전부 · 종전).
   * 주문 · 전략 계좌 대조 · `forAccount` 라우팅 · hub 83/66/64 필터 · 상태 프레임이 전부 이 뷰를 본다 — 같은 계좌가 두 서버
   * users.toml 에 모두 있어도 그 계좌는 유효 주문 서버 세션 하나에서만 보이고 오간다(gh-trade-84 (나) 의 거름 원천).
   * 이름이 `accounts` 가 아닌 이유는 생성 코드의 계좌 접근자와 이름이 겹쳐 D-25 게이트 검사(grep)를 흐리기 때문이다.
   */
  get allowedAccounts(): RelayAccount[] {
    const owns = this.#owns;
    return owns === null ? [...this.#accounts] : this.#accounts.filter((a) => owns(a.accountNo));
  }

  /**
   * 서버가 허용하고 선언까지 대조된 계좌 **원본** 의 복사본 (Phase 29-33). 소유 여부와 무관하다 — 87 반영 · 진단용이다.
   * 주문 · 83 · 계좌 프레임을 이 목록으로 거르지 않는다(거름 원천은 `allowedAccounts` 하나).
   */
  get declaredAccounts(): RelayAccount[] {
    return [...this.#accounts];
  }

  /** 현재 상태를 그대로 wss 로 보낼 수 있는 프레임으로 만든다 (D-36). */
  stateFrame(msg?: string, attempt?: number): RelayStateMsg {
    const s: RelaySessionState = this.#state === "idle" ? "connecting" : this.#state;
    const frame: RelayStateMsg = { t: "state", s, accounts: this.allowedAccounts };
    if (msg !== undefined) frame.msg = msg;
    if (attempt !== undefined) frame.attempt = attempt;
    return frame;
  }

  // ----------------------------------------------------------
  // 비밀 노출 방지 (D-19 / T-15-19)
  // ----------------------------------------------------------

  /**
   * 직렬화 표현. `#password` 도 `#dmaUserId` 도 담지 않는다.
   * pino 의 redact 는 2차 방어일 뿐이고, 애초에 나갈 수 없게 하는 것이 1차다.
   */
  toJSON(): { userId: string; state: DmaSessionState; accountCount: number } {
    return { userId: this.#userId, state: this.#state, accountCount: this.#accounts.length };
  }

  toString(): string {
    return `DmaSession(${this.#userId}, ${this.#state})`;
  }

  /** `console.log(session)` / `util.inspect` 로도 비밀이 새지 않게 막는다. */
  [inspect.custom](): string {
    return this.toString();
  }

  // ----------------------------------------------------------
  // 수명 관리
  // ----------------------------------------------------------

  /** 세션 시작. wss 첫 인증 연결이 왔을 때 SessionManager 가 부른다 (D-15). */
  start(): void {
    if (this.#state !== "idle") {
      logger.warn({ userId: this.#userId, state: this.#state }, "[DMA] 이미 시작된 세션");
      return;
    }
    this.#bootPhase = true;
    this.#setState("connecting", "게이트웨이 연결 중");
    this.#client.connect();
  }

  /**
   * 재접속 상한 소진(`manual_required`) 이후의 복구 수단. 그 상태에서만 동작한다 —
   * `session_rejected`(로그인 거부)는 자격증명을 고치기 전에는 결과가 같으므로 제외한다.
   */
  manualReconnect(): boolean {
    if (this.#state !== "manual_required") {
      logger.warn(
        { userId: this.#userId, state: this.#state },
        "[DMA] 수동 재접속은 manual_required 에서만 가능",
      );
      return false;
    }
    this.#setState("connecting", "수동 재접속");
    this.#client.manualReconnect();
    return true;
  }

  /**
   * 게이트웨이 요청 프레임 1건 송신 (구독 · 주문 등 상위 계층이 만든 페이로드).
   *
   * **Ready 가 아니면 보내지 않는다.** 로그인 전에 구독 요청을 밀어 넣으면 그 요청은
   * 조용히 사라지고 "구독했는데 시세가 없다"로 오진하게 된다. Ready 전에 쌓인 구독은
   * `ready` 이벤트에서 SubscriptionHub 가 **전량 재구독**으로 복원하므로
   * (Pitfall 4 — 재구독 경로는 하나뿐이다) 여기서 큐잉하지 않는다.
   *
   * 전송 계층 실패(연결 없음·송신 예외)는 `DmaClient.send` 가 사유와 함께 로그를 남긴다.
   */
  send(payload: Uint8Array): boolean {
    if (!this.isReady) {
      logger.warn(
        { userId: this.#userId, state: this.#state, bytes: payload.length },
        "[DMA] Ready 이전 송신 요청 — 보내지 않는다 (ready 에서 재구독된다)",
      );
      return false;
    }
    return this.#client.send(payload);
  }

  /**
   * Ready 중 계좌 자가 선언 (Phase 29-21 · RESEARCH Pitfall 10). 87 에 새로 나타난 그 DMA 유저 계좌를 **재로그인 없이**
   * `UpdateAccountNoReq(3)` mode "1" 로 선언하고, 응답(55) 목록에 들어 있으면 허용 목록에 더한 뒤 `accounts` 이벤트를 낸다.
   *
   * - **Ready 일 때만** — 아니면 아무것도 하지 않는다(다음 로그인의 `LoginResp.accounts` 가 users.toml 을 반영한다).
   * - 이미 허용됐거나 이미 선언 대기 중인 계좌는 다시 보내지 않는다(같은 87 이 두 번 와도 선언 1회).
   * - 응답 목록에 없는 계좌(서버 거부) · 응답 무소식은 허용 목록에 넣지 않고 warn(계좌번호 마스킹)만 — 세션은 그대로다.
   *
   * @param accounts 87 이 준 계좌(이름 포함 — 브라우저 계좌 선택 표시). 계좌번호는 서버 정규화값 그대로(Pitfall 7).
   * @returns 실제로 송신한 선언 수
   */
  declareAccounts(accounts: readonly RelayAccount[]): number {
    if (!this.isReady) return 0;
    const allowed = new Set(this.#accounts.map((a) => a.accountNo));
    const fresh: RelayAccount[] = [];
    for (const a of accounts) {
      if (a.accountNo === "" || allowed.has(a.accountNo) || this.#pendingDeclare.has(a.accountNo)) continue;
      if (fresh.some((x) => x.accountNo === a.accountNo)) continue;
      fresh.push({ accountNo: a.accountNo, name: a.name });
    }
    if (fresh.length === 0) return 0;

    const gen = this.#client.generation;
    let sent = 0;
    for (const a of fresh) {
      if (!this.#client.send(buildUpdateAccountNoReq("1", a.accountNo))) {
        // 전송 계층이 사유를 남겼다. 회선이 끊기면 재로그인 선언이 87 을 반영한다 — 여기서 실패로 몰지 않는다.
        logger.warn(
          { userId: this.#userId, serverKey: this.#serverKey, account: maskAccountNo(a.accountNo) },
          "[DMA] Ready 중 계좌 선언 송신 실패 — 다음 로그인 선언이 반영한다",
        );
        continue;
      }
      this.#pendingDeclare.set(a.accountNo, a);
      this.#declareRespLeft += 1;
      sent += 1;
    }
    if (sent === 0) return 0;
    logger.info(
      { userId: this.#userId, serverKey: this.#serverKey, count: sent, accounts: fresh.map((a) => maskAccountNo(a.accountNo)) },
      "[DMA] Ready 중 계좌 자가 선언 (87 반영 · 재로그인 없음)",
    );

    // 대조 상한 — 선언 묶음마다 다시 건다(늦게 온 묶음이 앞 묶음 타이머에 잘리지 않게).
    this.#clearDeclareTimer();
    this.#declareTimer = setTimeout(() => {
      this.#declareTimer = null;
      if (gen !== this.#client.generation) return; // 구세대 — 단절 경로가 이미 대기를 비웠다
      this.#settleDeclare("응답 없음");
    }, ACCOUNT_RESP_TIMEOUT_MS);
    return sent;
  }

  /**
   * 87 에서 빠진 계좌를 허용 목록에서 즉시 뺀다 (Phase 29-21 — fail closed). 주문 · 상따 계좌 대조(`allowedAccounts`)가
   * 곧바로 「허용 계좌 아님」 으로 거부한다. 게이트웨이에는 아무것도 보내지 않는다(서버 users.toml 이 이미 뺐다).
   * 바뀐 것이 있으면 `accounts` 이벤트를 낸다. 대기 중 선언에서도 뺀다(늦은 응답이 되살리지 않게).
   *
   * @returns 실제로 뺀 계좌 수
   */
  removeAllowedAccounts(accountNos: readonly string[]): number {
    const drop = new Set(accountNos);
    for (const no of drop) this.#pendingDeclare.delete(no);
    const before = this.#accounts.length;
    this.#accounts = this.#accounts.filter((a) => !drop.has(a.accountNo));
    const removed = before - this.#accounts.length;
    if (removed === 0) return 0;
    logger.warn(
      { userId: this.#userId, serverKey: this.#serverKey, removed, remaining: this.#accounts.length },
      "[DMA] 87 에서 빠진 계좌 — 허용 목록에서 즉시 제외 (fail closed)",
    );
    this.#emitAccounts();
    return removed;
  }

  /**
   * 세션 비밀 교체 (Phase 29-16 · D-08 · RESEARCH Pitfall 8). **열린 세션은 끊지 않는다** — 게이트웨이 로그인은 이미
   * 끝났고 새 비밀은 다음 `LoginReq`(회선 재접속 · 재로그인)부터 쓴다. 바꾸지 않으면 Admin 이 비번을 바꾼 뒤 첫 회선
   * 끊김에서 옛 비밀로 재로그인해 거부(→ `session_rejected` 고착)가 된다. 로그에는 userId · serverKey 만 싣는다.
   */
  setPassword(password: string): void {
    this.#password = password;
    logger.info(
      { userId: this.#userId, serverKey: this.#serverKey, state: this.#state },
      "[DMA] 세션 비밀 교체 — 다음 로그인부터 적용 (열린 세션 유지)",
    );
  }

  /**
   * 세션을 **재접속 루프 없이** 종료 상태로 끝낸다 (Phase 29-16 · CONTEXT 「DeleteUser → unauthorized · 재접속 루프 없음」).
   *
   * `unauthorized` 는 D-38 규율(상태를 나중에 추가하지 않는다)로 처음부터 선언만 되어 있던 상태다 — 이 메서드가 세션이
   * 스스로 그 상태에 들어가는 **첫 경로**다. 종료 상태(`TERMINAL_STATES`)라 이후 전송 이벤트가 상태를 옮기지 못하고,
   * SessionManager 의 `NO_RETRY_STATES` 에 들어 있어 같은 사용자가 다시 와도 재로그인하지 않는다(KB 계정 잠금 방지 · D-16 과 같은 이유).
   * 상태 프레임(`unauthorized` + 문구)은 붙어 있는 탭에 그대로 간다 — 브라우저는 「권한 없음」 배지를 그린다.
   * 허용 계좌는 비운다(29-21) — 같은 사용자의 다른 증권사 세션이 남아 있으면 wss 병합 프레임은 남은 세션 기준이다.
   */
  terminate(state: "unauthorized", message: string): void {
    if (this.#state === state) return;
    this.#clearTimers();
    // 허용 계좌도 비운다(29-21 · fail closed) — 지워진 유저 세션이 `forAccount` 라우팅 · 병합 상태 프레임 계좌 합집합에 남지 않게.
    this.#accounts = [];
    // 루프를 먼저 끊고 연결을 정리한다(`#failNoRetry` 와 같은 순서) — 반대면 destroy 가 부른 down 이 재접속을 예약한다.
    this.#client.stopReconnect(message);
    this.#client.destroy();
    logger.warn(
      { userId: this.#userId, serverKey: this.#serverKey, prev: this.#state, next: state },
      "[DMA] 세션 강제 종료 (재접속 없음)",
    );
    this.#setState(state, message);
  }

  /** 세션 종료. 유예 만료·프로세스 종료 시 SessionManager 가 부른다. */
  close(): void {
    this.#clearTimers();
    this.#client.destroy();
    logger.info({ userId: this.#userId, lastState: this.#state }, "[DMA] 세션 종료");
  }

  // ----------------------------------------------------------
  // 부트 시퀀스 (단일 경로)
  // ----------------------------------------------------------

  #onTransportUp(gen: number): void {
    // 워커 진입 직후. 구세대(구부트·종료 후)는 아무것도 보고하지 않는다.
    if (gen !== this.#client.generation) return;
    if (TERMINAL_STATES.has(this.#state)) return;

    // ① 로그인 요청
    if (!this.#trySetState(gen, "logging_in", "DMA 로그인 중")) return;
    if (!this.#client.send(buildLoginReq(this.#dmaUserId, this.#password, this.#broker))) {
      this.#fail("LoginReq 송신 실패");
      return;
    }

    // ② 응답을 5초 기다린다. 게이트웨이가 붙었는데 응답이 없는 상태를 무한정 두면
    //    화면이 "로그인 중"에서 영원히 멎는다.
    this.#clearLoginTimer();
    this.#loginTimer = setTimeout(() => {
      this.#loginTimer = null;
      if (gen !== this.#client.generation) return; // 구세대 타이머 — 보고하지 않는다
      this.#fail(`LoginResp 타임아웃 (${LOGIN_RESP_TIMEOUT_MS / 1000}초)`);
    }, LOGIN_RESP_TIMEOUT_MS);
  }

  #onFrame(e: TransportFrameEvent): void {
    // 시세·체결·주문 프레임은 해석하지 않고 그대로 흘린다 — 소비자(15-04 Hub)가 읽는다.
    this.emit("frame", e);

    // 구세대 프레임은 부트 판정에 쓰지 않는다. (흘려보내는 것은 위에서 이미 했다 —
    // Hub 가 자기 세대 검사를 따로 하므로 여기서 가로채지 않는다.)
    if (e.generation !== this.#client.generation) return;
    if (e.msgType === MSG.LoginResp) {
      this.#onLoginResp(e);
      return;
    }
    if (e.msgType === MSG.UpdateAccountNoResp) {
      this.#onAccountListResp(e);
    }
  }

  #onLoginResp(e: TransportFrameEvent): void {
    if (this.#state !== "logging_in") {
      logger.warn(
        { userId: this.#userId, state: this.#state },
        "[DMA] 예상 밖 시점의 LoginResp — 무시",
      );
      return;
    }

    this.#clearLoginTimer();
    const resp = parseLoginResp(e.env);
    if (resp === null) {
      // 파서가 사유·카운터를 이미 남겼다. 여기서는 세션 판정만 한다.
      this.#fail("LoginResp 파싱 실패");
      return;
    }
    if (!resp.success) {
      // 서버가 명시적으로 거부했다. 재시도해도 결과가 같다 (D-16 / 17 D-17).
      this.#failNoRetry(`로그인 거부: ${resp.message}`);
      return;
    }
    this.#onLoginAccepted(e.generation, resp.message, resp.accounts);
  }

  /**
   * ③ 계좌 선언 단계 (C# `Session.cs` L690-812 ②).
   *
   * 선언 대상은 **`LoginResp.accounts` 전량**이다. 클라이언트가 목록을 따로 들고 있지
   * 않으므로 C# 의 "선언 목록 ⊆ 허용 목록" 사전 검사는 여기서 항등이라 생략한다 —
   * 대신 서버 응답 목록과의 사후 대조가 그 자리를 대신한다.
   */
  #onLoginAccepted(gen: number, message: string, accounts: RelayAccount[]): void {
    // ③-a 계좌 0건은 **정상 부트가 아니다** (17 D-12). users.toml 에 계좌가 없다는 뜻이라
    //     재접속해도 결과가 같고, 백오프마다 같은 로그인을 되풀이할 이유가 없다 (T-15-10).
    //     로그인 자체는 성공했으므로 전송 실패가 아니라 세션 거부로 확정한다.
    if (accounts.length === 0) {
      this.#failNoRetry(NO_ACCOUNTS_MESSAGE);
      return;
    }

    this.#loginMessage = message;
    this.#accounts = accounts;
    const declared = accounts.map((a) => a.accountNo);
    this.#bootDeclared = new Set(declared);
    this.#pendingAccounts = new Set(declared);

    if (!this.#trySetState(gen, "declaring", `계좌 ${accounts.length}건 선언 중`)) return;

    // ③-b **건별 대기 없이 연속 송신**한다 (C# A2). 응답은 매번 현재 등록 목록 전체를
    //     담아 오므로 하나씩 기다릴 이유가 없고, 기다리면 계좌 N개에 최악 5N초가 걸린다.
    for (const accountNo of declared) {
      if (!this.#client.send(buildUpdateAccountNoReq("1", accountNo))) {
        this.#fail(
          `계좌 선언 송신 실패: ${accountNo}`,
          `계좌 선언 송신 실패: ${maskAccountNo(accountNo)}`,
        );
        return;
      }
    }

    // ③-c 대조 상한. 타이머는 **전량 송신 후 한 번만** 건다.
    this.#clearAccountTimer();
    this.#accountTimer = setTimeout(() => {
      this.#accountTimer = null;
      if (gen !== this.#client.generation) return; // 구세대 타이머 — 보고하지 않는다
      this.#failAccountMismatch();
    }, ACCOUNT_RESP_TIMEOUT_MS);
  }

  /**
   * `UpdateAccountNoResp(55)` 수신 — 서버의 **현재 등록 목록 전체**다.
   *
   * 선언 1건마다 한 번씩 오고 매번 그 시점의 전체 목록을 담으므로, "마지막 응답"이 아니라
   * 받은 목록의 **누적**으로 대조한다. 마지막 응답만 보면 서버가 응답을 재정렬하거나
   * 한 건을 흘렸을 때 정상 부트가 조용히 실패한다.
   */
  #onAccountListResp(e: TransportFrameEvent): void {
    // Phase 29-21 — Ready 중 선언의 응답(대기 중 선언이 있을 때만). 없으면 아래 종전 「예상 밖」 갈래다.
    if (this.#state === "ready" && this.#pendingDeclare.size > 0) {
      this.#onDeclareResp(e);
      return;
    }
    if (this.#state !== "declaring") {
      logger.warn(
        { userId: this.#userId, state: this.#state },
        "[DMA] 예상 밖 시점의 UpdateAccountNoResp — 무시",
      );
      return;
    }

    const serverList = parseUpdateAccountNoResp(e.env);

    // 우리가 선언하지 않았는데 서버 목록에 있는 계좌 — **warn 만 하고 진행한다** (17 D-13).
    // 게이트웨이는 user_id+broker 로 세션을 합류시키므로(D-17) 같은 user_id 를 쓰는 다른
    // 클라이언트가 남긴 계좌일 수 있다. 우리 세션의 주문 대상은 어디까지나 선언 목록이다.
    const extra = serverList.filter((a) => !this.#bootDeclared.has(a));
    if (extra.length > 0) {
      logger.warn(
        { userId: this.#userId, extra: extra.map(maskAccountNo) },
        "[DMA] 선언하지 않은 계좌가 서버 목록에 있다 — 무시하고 진행",
      );
    }

    for (const accountNo of serverList) this.#pendingAccounts.delete(accountNo);
    if (this.#pendingAccounts.size > 0) return; // 아직 남았다 — 다음 응답을 기다린다

    this.#clearAccountTimer();
    this.#onAccountsMatched(e.generation);
  }

  /**
   * Ready 중 선언 응답 1건 (29-21). 응답은 그 시점 서버 등록 목록 전체다 — 대기 계좌 중 목록에 든 것을 허용 목록에 더한다.
   * 보낸 선언 수만큼 응답이 다 왔는데도 남은 대기 계좌는 서버 거부다(`#settleDeclare`).
   */
  #onDeclareResp(e: TransportFrameEvent): void {
    const serverList = new Set(parseUpdateAccountNoResp(e.env));
    const added: RelayAccount[] = [];
    for (const [no, account] of [...this.#pendingDeclare]) {
      if (!serverList.has(no)) continue;
      this.#pendingDeclare.delete(no);
      if (!this.#accounts.some((a) => a.accountNo === no)) {
        this.#accounts = [...this.#accounts, account];
        added.push(account);
      }
    }
    this.#declareRespLeft = Math.max(0, this.#declareRespLeft - 1);
    if (added.length > 0) {
      logger.info(
        { userId: this.#userId, serverKey: this.#serverKey, added: added.map((a) => maskAccountNo(a.accountNo)), total: this.#accounts.length },
        "[DMA] Ready 중 계좌 선언 확인 — 허용 목록 갱신",
      );
      this.#emitAccounts();
    }
    if (this.#pendingDeclare.size === 0) {
      this.#clearDeclareTimer();
      this.#declareRespLeft = 0;
      return;
    }
    if (this.#declareRespLeft === 0) this.#settleDeclare("서버 목록에 없음");
  }

  /** 남은 대기 선언을 거부로 확정한다 — 허용 목록에 넣지 않고 warn 1(마스킹)만. 세션 상태는 그대로다. */
  #settleDeclare(reason: string): void {
    this.#clearDeclareTimer();
    this.#declareRespLeft = 0;
    if (this.#pendingDeclare.size === 0) return;
    const rejected = [...this.#pendingDeclare.keys()].map(maskAccountNo);
    this.#pendingDeclare.clear();
    logger.warn(
      { userId: this.#userId, serverKey: this.#serverKey, rejected, reason },
      "[DMA] Ready 중 계좌 선언 미확인 — 허용 목록에 넣지 않는다 (세션 유지)",
    );
  }

  /** 상태는 그대로 · 허용 계좌만 바뀌었다 — 마지막 상태 문구를 실은 지금 프레임으로 알린다(29-21). */
  #emitAccounts(): void {
    if (this.#state === "idle") return;
    this.emit("accounts", this.stateFrame(this.#stateMsg, this.#stateAttempt));
  }

  /** ④ 운용 준비 완료. **"성공"의 기준은 TCP 접속이 아니라 여기다.** */
  #onAccountsMatched(gen: number): void {
    this.#client.resetReconnectAttempts();
    const msg = this.#loginMessage === "" ? `계좌 ${this.#accounts.length}건 선언 완료` : this.#loginMessage;
    if (!this.#trySetState(gen, "ready", msg)) return;
    this.#hasBeenReady = true;
    this.#bootPhase = false;
    // 재구독의 유일한 트리거 (Pitfall 4). 재접속 경로도 같은 자리를 지난다 —
    // 재로그인 → 계좌 재선언 → 재구독이 한 벌이다.
    this.emit("ready", { generation: gen, accounts: this.allowedAccounts });
  }

  /**
   * 5초 안에 선언 전량이 서버 목록에서 확인되지 않았다.
   *
   * 누락 계좌번호를 **화면에는 전체로, 로그에는 마스킹본으로** 싣는다 (UI-SPEC D2).
   * 어느 계좌가 걸렸는지 모르면 users.toml 을 고칠 수가 없다.
   */
  #failAccountMismatch(): void {
    const missing = [...this.#pendingAccounts];
    const seconds = ACCOUNT_RESP_TIMEOUT_MS / 1000;
    this.#fail(
      `계좌 선언 미확인 (${seconds}초): ${missing.join(", ")}`,
      `계좌 선언 미확인 (${seconds}초): ${missing.map(maskAccountNo).join(", ")}`,
    );
  }

  // ----------------------------------------------------------
  // 전송 이벤트 대응
  // ----------------------------------------------------------

  #onTransportDown(reason: string): void {
    // 응답 대기 타이머를 먼저 끈다 — 끄지 않으면 5초 뒤에 구세대 실패가 늦게 보고된다.
    // 로그인 대기와 계좌 대조 대기 **둘 다** 끈다.
    this.#clearTimers();
    logger.info(
      { userId: this.#userId, state: this.#state, reason, hasBeenReady: this.#hasBeenReady },
      "[DMA] 세션 전송 단절",
    );
    // 상태 전이는 하지 않는다. 이어지는 reconnecting 이벤트가 상태를 옮긴다
    // (자동 재접속이 꺼진 경우에는 이미 종료 상태이므로 옮길 것이 없다).
  }

  #onReconnecting(attempt: number, reason: string): void {
    if (TERMINAL_STATES.has(this.#state)) return;
    this.#setState("reconnecting", reason, attempt);
  }

  // ----------------------------------------------------------
  // 실패 경로
  // ----------------------------------------------------------

  /**
   * 실패 처리. **부트 구간이면 `failed` 로 확정**하고, 운용 중이면 전송만 끊어
   * 자동 재접속(백오프 유지)에 넘긴다 (C# `Fail`).
   *
   * @param reason    **화면(상태 프레임)** 에 실을 사유. 계좌번호는 전체로 쓴다.
   * @param logReason **로그**에 남길 사유. 계좌번호는 마스킹본으로 쓴다 (UI-SPEC D2 /
   *                  T-15-15). 생략하면 `reason` 과 같다 — 계좌번호가 없는 사유는
   *                  두 벌로 만들 이유가 없다.
   */
  #fail(reason: string, logReason: string = reason): void {
    if (TERMINAL_STATES.has(this.#state)) return;
    this.#clearTimers();

    if (this.#bootPhase) {
      logger.error({ userId: this.#userId, reason: logReason }, "[DMA] 운용 준비 실패");
      // 발화보다 먼저 끊는다 — 실패를 알리는 동안 재접속이 진행되면 표시와 동작이 어긋난다.
      this.#client.destroy();
      this.#setState("failed", reason, undefined, logReason);
      return;
    }

    // 운용 중 실패는 상태를 옮기지 않는다. 전송을 다시 세우면 같은 부트 워커가 재로그인을
    // 되풀이하고, 이어지는 down→reconnecting 이벤트가 상태를 옮긴다.
    // **백오프 카운터를 리셋하지 않는다** — 리셋하면 지연이 1초로 되돌아가 두드리게 된다.
    logger.warn({ userId: this.#userId, reason: logReason }, "[DMA] 세션 재수립 실패 — 재접속에 넘김");
    this.#client.dropTransport(logReason);
  }

  /**
   * 재시도해도 결과가 같은 실패. 자동 재접속 루프를 끊고 `session_rejected` 로 확정한다.
   *
   * 부트 여부와 무관하게 여기로 온다 — 운용 중 거부(서버를 다른 브로커로 재기동 등)를
   * 재접속에 넘기면 백오프마다 같은 거부를 되풀이해 KB 계정이 잠긴다 (T-15-10, D-16).
   */
  #failNoRetry(reason: string): void {
    if (TERMINAL_STATES.has(this.#state)) return;
    this.#clearTimers();
    logger.error({ userId: this.#userId, reason }, "[DMA] 운용 중단 (재시도 없음)");
    // 루프를 먼저 끊고 연결을 정리한다. 순서가 바뀌면 destroy 가 부른 down 이 재접속을 예약한다.
    this.#client.stopReconnect(reason);
    this.#client.destroy();
    this.#setState("session_rejected", reason);
  }

  // ----------------------------------------------------------
  // 상태 전이
  // ----------------------------------------------------------

  /** 세대에 묶인 상태 전이. 구세대 워커는 상태를 옮기지 못한다 (C# `TrySetState`). */
  #trySetState(gen: number, next: DmaSessionState, msg?: string, attempt?: number): boolean {
    if (gen !== this.#client.generation) return false;
    if (TERMINAL_STATES.has(this.#state)) return false;
    this.#setState(next, msg, attempt);
    return true;
  }

  /**
   * @param msg    상태 프레임(화면)에 실을 문구. 계좌번호는 전체다 (UI-SPEC D2).
   * @param logMsg 로그에 남길 문구. 계좌번호는 마스킹본이다 (T-15-15). 기본값이 `msg` 인
   *               것은 계좌번호가 없는 문구가 대부분이기 때문이고, **계좌번호를 담은
   *               문구는 반드시 이 인자를 함께 넘겨야 한다**.
   */
  #setState(
    next: DmaSessionState,
    msg?: string,
    attempt?: number,
    logMsg: string | undefined = msg,
  ): void {
    const prev = this.#state;
    if (prev === next && next !== "reconnecting") return; // reconnecting 은 회차가 바뀐다
    this.#state = next;
    this.#stateMsg = msg;
    this.#stateAttempt = attempt;

    // 로그 인자에 password·dmaUserId 를 넣지 않는다 (D-19). 계좌번호도 원문을 넣지 않는다.
    logger.info(
      { userId: this.#userId, prev, next, msg: logMsg, attempt },
      "[DMA] 세션 상태 전이",
    );

    // `idle` 은 내부 초기값이라 밖으로 내보내지 않는다.
    if (next === "idle") return;
    this.emit("state", this.stateFrame(msg, attempt));
  }

  #clearLoginTimer(): void {
    if (this.#loginTimer === null) return;
    clearTimeout(this.#loginTimer);
    this.#loginTimer = null;
  }

  #clearAccountTimer(): void {
    if (this.#accountTimer === null) return;
    clearTimeout(this.#accountTimer);
    this.#accountTimer = null;
  }

  #clearDeclareTimer(): void {
    if (this.#declareTimer === null) return;
    clearTimeout(this.#declareTimer);
    this.#declareTimer = null;
  }

  /**
   * 부트 대기 타이머 전량 정리. 단절·실패·종료 경로가 전부 이것을 쓴다 — 한쪽만 끄면
   * 남은 타이머가 5초 뒤에 **구세대 실패**를 늦게 보고한다.
   * Ready 중 선언(29-21) 대기도 함께 비운다 — 다음 로그인의 `LoginResp.accounts` 전량 선언이 그 계좌를 반영한다.
   */
  #clearTimers(): void {
    this.#clearLoginTimer();
    this.#clearAccountTimer();
    this.#clearDeclareTimer();
    this.#pendingDeclare.clear();
    this.#declareRespLeft = 0;
  }
}
