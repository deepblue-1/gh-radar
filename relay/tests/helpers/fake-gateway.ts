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
 * 하지 않는 것: 게이트웨이의 업무 로직을 흉내 내지 않는다. 구독 상태·계좌 원장·전략
 *              원장은 없고, 테스트가 지시한 프레임만 그대로 내보낸다.
 *
 * Phase 16 추가 — 전략(상따/VI) 표면. 위 규율의 **유일한 예외**가 조회 3종
 * (`GetLimitChaserListReq(24)` · `GetVITriggerReq(21)` · `GetVIOrderListReq(34)`) 의
 * 자동 응답이다. 이것은 업무 로직이 아니라 **「무응답 금지」 규약의 재현**이다 — 실서버는
 * 등록된 전략이 0건이어도 반드시 답하고(길이 0 벡터 / 빈 테이블), 스텁이 침묵하면
 * relay 가 답을 기다리며 멎어 테스트가 엉뚱한 곳을 가리킨다. 응답 **내용**은 여전히
 * 테스트가 `respondXxx` 로 심은 값 그대로이고, 요청 페이로드는 보지 않는다.
 * 명령 4종(10·11·14·33)은 자동 응답 없이 `strategyRequests()` 에 기록만 한다.
 *
 * Phase 27 — 명령 2종(41 자동매도 바로시작/중지 · 42 사용자 설정 저장)도 기록만 한다(답은 60 에코 · 84 브로드캐스트 ·
 * 54 — 타이밍은 테스트가 정한다). 43 사용자 설정 조회는 `seedUserSettings` 로 켰을 때만 그 연결에 84 1프레임을
 * 답한다 — **기본 null = 무응답**이다. 늘 답하면 기존 통합 테스트의 「인증 직후 프레임 목록」 단언이 새
 * `user.settings` 프레임으로 흔들린다(RESEARCH Pitfall 10). 로그인 직후 84 자동 송신도 하지 않는다(77 과 같은 규율 —
 * `sendUserSettings` 수동).
 *
 * Phase 19-09 추가 — 관찰자 모드. `ObserverLoginReq(5)` 는 `observerLoginRequests()` 에 기록하고,
 * `respondObserverLogin` 으로 켰을 때만 그 연결에 `ObserverLoginResp(79)` 를 자동 송신한다(기본 꺼짐 —
 * 일반 로그인 자동 응답과 분리). 저널 배치(80)는 테스트가 `pushJournalBatch` 로 직접 민다.
 *
 * Phase 26 — quote 모드: ed2e0240 서버 규약 흉내(79 role 에코 → 성공이면 78 1회) · role 1 로그인은 quote 목록에만.
 * `ObserverLoginReq(5)` 의 role 이 1 이면 `quoteLoginRequests()` · quote 소켓에만 기록하고, `respondQuoteLogin` 으로 켰을
 * 때만 그 연결에 79(기본 role 1 · epoch "" · 계좌 빈 벡터 — 거부면 role 0) 를 쓰고, 성공이면 빈 78 `RateCrossSnapshot` 을
 * 이어 쓴다. role 0 은 종전 관찰자 경로 그대로라 `observerLoginRequests()` · `waitForObserverConnection` 은 저널 연결만
 * 본다 — 저널 테스트 · e2e 관찰자 모드가 quote 연결을 저널 연결로 오인하지 않는다.
 *
 * Phase 29 — admin 모드: gh-trade 92cdfbff 관문(D-02) 흉내 · role 2 로그인은 admin 목록에만. `ObserverLoginReq(5)` 의 role 이
 * 2 면 `adminLoginRequests()` · admin 소켓에만 기록하고, `respondAdminLogin` 으로 켰을 때만 그 연결에 79(기본 role 2 · epoch "" ·
 * 계좌 빈 벡터 — 거부면 role 0) **1프레임만** 쓴다(78/80 없음). `AdminCommandReq(44)` 는 `adminCommandRequests()` 에 기록하고,
 * `onAdminCommand(handler)` 로 handler 를 심었을 때만 그 결과를 같은 연결에 86 → 87 순서로 쓴다 — **기본 무응답**(타임아웃 시나리오).
 * `defaultAdminHandler(state)` 는 메모리 users 표로 op 1~5 를 흉내 낸다(op 5 = 87 만 · 실제 변경 = 86(rev+1) 뒤 87 · 무변경 = 86
 * code 0 · rev 불변 · 87 없음 · 실패 = 86 만). 이것은 **조회 3종 자동 응답과 같은 예외**다 — 29-08 · 29-11 · 29-14 통합 테스트가
 * 서버 2대 fan-out · BUSY · 무변경 멱등을 매번 손으로 조립하지 않게 한다. `startFakeGateway()` 를 두 번 부르면 독립 인스턴스 2개다.
 */
import net from "node:net";
import * as flatbuffers from "flatbuffers";

import { Envelope } from "../../src/generated/stock-dma/envelope.js";
import { frame, FrameReader } from "../../src/dma/codec.js";
import { MSG } from "../../src/dma/msg-type.js";
import type { AdminAccount } from "../../src/admin/types.js";
import {
  STRATEGY_MSG,
  buildAdminCommandRespFrame,
  buildAdminUsersSnapshotFrame,
  buildBareEnvelope,
  buildJournalBatchFrame,
  buildLimitChaserListRespFrame,
  buildLimitFeatureFrame,
  buildObserverLoginRespFrame,
  buildLoginRespFrame,
  buildOrderRespFrame,
  buildQueuedWindowStateFrame,
  buildQuoteStateFrame,
  buildRateCrossAlertFrame,
  buildRateCrossSnapshotFrame,
  buildSetLimitChaserRespFrame,
  buildSetVITriggerRespFrame,
  buildTradeTapeFrame,
  buildUpdateAccountNoRespFrame,
  buildUserSettingsFrame,
  buildViOrderListFrame,
  type FakeAccount,
  type FakeAdminAccountInput,
  type FakeAdminCommandRespInput,
  type FakeAdminUsersSnapshotInput,
  type FakeJournalBatchInput,
  type FakeLimitChaserInput,
  type FakeLimitFeatureInput,
  type FakeObserverLoginRespInput,
  type FakeLoginRespInput,
  type FakeOrderRespInput,
  type FakeQueuedWindowInput,
  type FakeQuoteInput,
  type FakeRateCrossInput,
  type FakeTapeInput,
  type FakeUserSettingsInput,
  type FakeViOrderItemInput,
  type FakeViTriggerInput,
} from "./frames.js";

/** 스키마에 없는 `msg_type`. 수신 화이트리스트 드롭 경로를 태우는 데 쓴다. */
const UNKNOWN_MSG_TYPE = 99;

/**
 * 전략 **명령** 계열 — 게이트웨이가 자동 응답하지 **않고** 기록만 하는 요청.
 *
 * 조회 3종(21·24·34)과 갈라 두는 이유: 조회는 실서버가 반드시 답하므로(무응답 금지)
 * 스텁도 자동 응답해야 relay 가 멎지 않는다. 반면 명령 4종의 결과는 **에코**(60/61) 나
 * 푸시(73) 로 오고 그 타이밍은 테스트가 정해야 한다. 둘을 섞어 자동 응답하면
 * "요청을 보냈다"와 "서버가 받아들였다"가 구분되지 않아 거부 경로를 시험할 수 없다.
 */
const STRATEGY_COMMAND_MSG_TYPES: ReadonlySet<number> = new Set<number>([
  STRATEGY_MSG.SetLimitChaserReq,
  STRATEGY_MSG.SetVITriggerReq,
  STRATEGY_MSG.DisableStrategiesReq,
  STRATEGY_MSG.ConfirmVIOrderReq,
  // Phase 27 — 41 의 답은 60 에코 · 54, 42 의 답은 84 브로드캐스트 · 54 다. 위와 같은 이유로 기록만 한다.
  MSG.AutoSellCommandReq,
  MSG.SetUserSettingsReq,
]);

/** 수신한 전략 명령 1건. `payload` 는 Envelope 페이로드 **사본**이다. */
export type StrategyRequest = { msgType: number; payload: Buffer };

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
  /**
   * `ObserverLoginReq(5)` 수신 시 `ObserverLoginResp(79)` 자동 응답 내용 (19-09). **기본은 자동 응답 없음** —
   * 일반 `LoginReq` 자동 응답과 분리한다(관찰자 모드를 쓰는 테스트만 켠다). `respondObserverLogin` 으로도 켠다.
   */
  observerLoginResp?: FakeObserverLoginRespInput;
  /**
   * role 1(quote) `ObserverLoginReq(5)` 자동 응답 내용 (Phase 26). **기본은 자동 응답 없음** — 관찰자 모드와 같은 규율.
   * 지정한 필드 위에 `{ role: 1, accounts: [], epoch: "" }` 기본을 깐다(거부이고 role 미지정이면 role 0 — 서버 규약).
   */
  quoteLoginResp?: FakeObserverLoginRespInput;
  /**
   * role 2(admin) `ObserverLoginReq(5)` 자동 응답 내용 (Phase 29). **기본은 자동 응답 없음** — quote 모드와 같은 규율.
   * 지정한 필드 위에 `{ role: 2, accounts: [], epoch: "" }` 기본을 깐다(거부이고 role 미지정이면 role 0 — 서버 규약).
   */
  adminLoginResp?: FakeObserverLoginRespInput;
};

/** `AdminCommandReq(44)` 1건의 내용 (게이트웨이 흉내 — 요청 대역 직접 파싱). 평문 비밀번호는 테스트 단언용으로만 보관한다. */
export type AdminCommandRequest = {
  requestId: bigint;
  op: number;
  userId: string;
  password: string;
  /** 슬롯 부재 = `null`. */
  account: AdminAccount | null;
};

/** admin handler 결과 — 86 입력(생략 = 86 없음 · op 5) + 선택 87 입력. 둘 다 있으면 86 → 87 순서로 쓴다. */
export type FakeAdminReply = {
  resp?: FakeAdminCommandRespInput;
  snapshot?: FakeAdminUsersSnapshotInput;
};

/** 44 1건 → 응답. `null` = 무응답(타임아웃 시나리오). */
export type FakeAdminHandler = (req: AdminCommandRequest) => FakeAdminReply | null;

/**
 * `defaultAdminHandler` 의 메모리 users 표. 테스트가 직접 들고 있다가 단언에 쓴다(handler 가 제자리 갱신한다).
 * `users` 순서 = 87 유저 순서(파일 순 흉내), 계좌는 87 에서 priority 오름차순으로 낸다.
 */
export type FakeAdminState = {
  usersRev: bigint;
  users: Map<string, FakeAdminAccountInput[]>;
  /** BUSY(9) 로 판정할 계좌번호 — 서버는 계좌 상태(미체결 · 상따 · VI · 예약)로만 판정한다(D-10~D-15). */
  busyAccounts: Set<string>;
};

/** `ObserverLoginReq(5)` 1건의 내용 (게이트웨이 흉내 — 요청 대역 직접 파싱). */
export type ObserverLoginRequest = {
  secret: string;
  sinceSeq: number;
  epoch: string;
  client: string;
  /** 전략 스트림 since (Phase 25 · 슬롯 12). 구 relay 는 0 으로 읽힌다. */
  strategySinceSeq: number;
  /** 관찰자 역할 (Phase 26 · 슬롯 14). 0 = journal · 1 = quote · 2 = admin(Phase 29). 구 relay 는 0 으로 읽힌다. */
  role: number;
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

  // --- 전략 (Phase 16) ---

  /**
   * `GetLimitChaserListReq(24)` 자동 응답(64)의 **목록 내용**을 지정한다.
   * 마지막 지정값을 유지한다. 지정 전 기본값은 **0건**(등록된 전략 없음)이다.
   */
  respondLimitChaserList(items: FakeLimitChaserInput[]): void;
  /**
   * `GetVITriggerReq(21)` 자동 응답(61)의 **내용**을 지정한다.
   * `null` 이면 테이블 없는 빈 61 = **미등록**. 지정 전 기본값도 미등록이다.
   */
  respondViTrigger(cfg: FakeViTriggerInput | null): void;
  /**
   * `GetVIOrderListReq(34)` 자동 응답(72 스냅샷)의 **목록 내용**을 지정한다.
   * 지정 전 기본값은 0건이다.
   */
  respondViOrderList(items: FakeViOrderItemInput[]): void;
  /** 상따 Set 에코 주입 (60). 등록 성공·부분 거부(눕혀진 값) 를 테스트가 직접 만든다. */
  pushLimitChaserEcho(sock: net.Socket, cfg?: FakeLimitChaserInput): void;
  /** VI 주문 목록 주입 (`snap`=true → 72 전량 교체 / false → 73 항목 upsert). */
  pushViOrderList(sock: net.Socket, items: FakeViOrderItemInput[], snap: boolean): void;
  /** 주문 통보 주입 (51). 상따·VI 발주의 접수/체결/거부가 전부 이 하나로 온다. */
  pushOrderResp(sock: net.Socket, input?: FakeOrderRespInput): void;

  // --- 신규 푸시 3종 (17-03) ---

  /**
   * 등락률 돌파 알림 주입 (76). 서버는 이것을 **로그인 전 연결에도** Broadcast 한다.
   *
   * 프레임 조립은 `frames.ts` 빌더에 맡긴다 — 게이트웨이 쪽에서 따로 조립하면 프레임이
   * 두 벌이 되고, 스키마가 바뀔 때 한쪽만 고쳐진다.
   */
  sendRateCrossAlert(sock: net.Socket, input?: FakeRateCrossInput): void;
  /** 등락률 돌파 above 집합 전량 주입 (78). **빈 벡터도 정상 입력**이다. */
  sendRateCrossSnapshot(sock: net.Socket, items?: FakeRateCrossInput[]): void;
  /** 예약·장전·시간외종가 발주 창 상태 주입 (77). */
  sendQueuedWindowState(sock: net.Socket, input?: FakeQueuedWindowInput): void;
  /** 사용자 설정 주입 (84 · Phase 27). 로그인 직후 84 · 42 뒤 브로드캐스트를 테스트가 직접 재현한다. */
  sendUserSettings(sock: net.Socket, input?: FakeUserSettingsInput): void;
  /**
   * 상한가 특징 주입 (85 · Phase 28). 서버는 그 키를 FULL 구독한 연결에만 보낸다 — 테스트는 quote 관찰자 연결
   * (`waitForQuoteConnection`)로 민다. 기본 = 잠김 시나리오(lock 1 · 43초째 · 대기 17.3억).
   */
  sendLimitFeature(sock: net.Socket, input?: FakeLimitFeatureInput): void;
  /**
   * `GetUserSettingsReq(43)` 자동 응답(84)의 내용을 심는다 (Phase 27). **기본 null = 무응답** — 켜면 43 을 보낸
   * 그 연결에 84 1프레임을 쓴다. `null` 로 다시 끈다(Pitfall 10 — 기존 프레임 개수 단언 보호).
   */
  seedUserSettings(input: FakeUserSettingsInput | null): void;
  /**
   * 지금까지 수신한 전략 **명령** 프레임(10·11·14·33 · 41·42) 전량 (송신 순서 그대로).
   *
   * 페이로드를 그대로 넘기므로 테스트가 필요한 필드만 직접 파싱한다 — 게이트웨이가
   * 요청을 해석해 주면 그 해석이 곧 프로덕션 파서의 정답지가 되어 검증이 순환한다.
   */
  strategyRequests(): StrategyRequest[];

  // --- 관찰자 모드 (Phase 19-09) ---

  /**
   * 관찰자 로그인 자동 응답을 켜고 내용을 지정한다. 이후 `ObserverLoginReq(5)` 가 오면 **그 연결에만**
   * `ObserverLoginResp(79)` 를 보낸다(게이트웨이 규약 — 요청 연결에만 Notice). `null` 이면 끈다(무응답 재현).
   */
  respondObserverLogin(resp: FakeObserverLoginRespInput | null): void;
  /** 저널 배치 주입 (80). */
  pushJournalBatch(sock: net.Socket, input: FakeJournalBatchInput): void;
  /** 지금까지 수신한 `ObserverLoginReq(5)` 전량 (송신 순서 그대로). */
  observerLoginRequests(): ObserverLoginRequest[];
  /**
   * 관찰자 로그인을 보낸 **살아 있는** 연결을 돌려준다. 없으면 다음 `ObserverLoginReq` 가 온 연결을 기다린다 —
   * `hardClose` 로 끊긴 연결은 건너뛰므로 재접속 뒤 호출하면 새 연결이 나온다.
   */
  waitForObserverConnection(timeoutMs?: number): Promise<net.Socket>;

  // --- quote 모드 (Phase 26) ---

  /**
   * quote(role 1) 관찰자 로그인 자동 응답을 켜고 내용을 지정한다. 이후 role 1 `ObserverLoginReq(5)` 가 오면 **그 연결에만**
   * 79 를 쓰고, 성공 응답이면 빈 78 을 이어 쓴다(서버 규약 — 확정-로그인). `null` 이면 끈다(무응답 재현).
   */
  respondQuoteLogin(resp: FakeObserverLoginRespInput | null): void;
  /** 지금까지 수신한 role 1 `ObserverLoginReq(5)` 전량 (송신 순서 그대로). role 0 은 `observerLoginRequests()` 에만 있다. */
  quoteLoginRequests(): ObserverLoginRequest[];
  /**
   * quote 로그인을 보낸 **살아 있는** 연결을 돌려준다. 없으면 다음 role 1 로그인이 온 연결을 기다린다 —
   * `hardClose` 로 끊긴 연결은 건너뛰므로 재접속 뒤 호출하면 새 연결이 나온다.
   */
  waitForQuoteConnection(timeoutMs?: number): Promise<net.Socket>;

  // --- admin 모드 (Phase 29) ---

  /**
   * admin(role 2) 관찰자 로그인 자동 응답을 켜고 내용을 지정한다. 이후 role 2 `ObserverLoginReq(5)` 가 오면 **그 연결에만**
   * 79 1프레임을 쓴다(78/80 없음 — gh-trade D-02). `null` 이면 끈다(무응답 재현).
   */
  respondAdminLogin(resp: FakeObserverLoginRespInput | null): void;
  /** 지금까지 수신한 role 2 `ObserverLoginReq(5)` 전량 (송신 순서 그대로). */
  adminLoginRequests(): ObserverLoginRequest[];
  /**
   * admin 로그인을 보낸 **살아 있는** 연결을 돌려준다. 없으면 다음 role 2 로그인이 온 연결을 기다린다 —
   * `hardClose` 로 끊긴 연결은 건너뛰므로 재접속 뒤 호출하면 새 연결이 나온다.
   */
  waitForAdminConnection(timeoutMs?: number): Promise<net.Socket>;
  /** 지금까지 수신한 `AdminCommandReq(44)` 전량 (송신 순서 그대로). */
  adminCommandRequests(): AdminCommandRequest[];
  /** 44 handler 를 심는다. 결과를 그 연결에 86 → 87 순서로 쓴다. `null` = 무응답(기본). */
  onAdminCommand(handler: FakeAdminHandler | null): void;
  /** 86 수동 송신 — 지연 · 순서 뒤집기 · 엉뚱한 requestId 를 테스트가 직접 만든다. */
  respondAdminCommand(sock: net.Socket, input: FakeAdminCommandRespInput): void;
  /** 87 수동 송신 — 요청 없이 민다(다른 admin 연결의 변경 뒤 87 흉내). */
  pushAdminSnapshot(sock: net.Socket, input: FakeAdminUsersSnapshotInput): void;

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

/**
 * 관찰자 로그인 요청(5)의 내용을 꺼낸다 (19-09). `readQuoteRequestKey` 와 같은 이유로 여기 있다 —
 * 생성 코드 해석을 스텁 한 벌에 모은다. `since_seq` 는 ulong 이라 number 로 좁힌다(테스트 값은 안전 정수).
 *
 * @returns 5 이고 요청 테이블이 있으면 내용, 그 외 `null`
 */
export function readObserverLoginRequest(msgType: number, payload: Buffer): ObserverLoginRequest | null {
  if (msgType !== MSG.ObserverLoginReq) return null;
  const req = rootEnvelope(payload)?.observerLoginReq();
  if (req === null || req === undefined) return null;
  return {
    secret: req.secret() ?? "",
    sinceSeq: Number(req.sinceSeq()),
    epoch: req.journalEpoch() ?? "",
    client: req.client() ?? "",
    strategySinceSeq: Number(req.strategySinceSeq()),
    role: req.role(),
  };
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

/** 구독 요청(29) 내용 — `buildSubscribeQuoteReq(isin, exchange, subscribe, level)` 의 되읽기. */
export type SubscribeRequest = { isin: string; exchange: string; subscribe: boolean; level: number };

/**
 * 구독 요청 프레임(29 `SubscribeQuoteReq`)의 내용을 꺼낸다 (Phase 26 — 26-03 트레이서 · 26-06 이 쓴다).
 * **여기에 두는 이유는 `readQuoteRequestKey` 와 같다** — 생성 코드 해석을 스텁 한 벌에 모은다.
 *
 * @returns 29 이고 요청 테이블이 있으면 `{isin, exchange, subscribe, level}`, 그 외 `null`
 */
export function readSubscribeRequest(msgType: number, payload: Buffer): SubscribeRequest | null {
  if (msgType !== MSG.SubscribeQuoteReq) return null;
  const req = rootEnvelope(payload)?.subscribeQuoteReq();
  if (req === null || req === undefined) return null;
  return { isin: req.isin() ?? "", exchange: req.exchange() ?? "", subscribe: req.subscribe(), level: req.level() };
}

/** `SetVITriggerReq(11)` 요청 내용 — VI 전략 설정 전송분. */
export type ViSetRequest = {
  accountNo: string;
  /** **원 단위**. 화면은 만원으로 입력받아 ×10,000 해서 보낸다. */
  orderAmountKrw: number;
  /** 정수 %. */
  checkRate: number;
  /** 상한가 고정("U") — relay 가 채운다. */
  priceType: string;
  run: boolean;
  /**
   * 발주 거래소 (17-05 / D-06). **와이어 원문 그대로** 돌려준다 — 여기서 `"KRX"` 로
   * 정규화하면 「조립기가 슬롯을 비웠다」와 「`"KRX"` 를 실었다」가 구분되지 않아,
   * 조립기 기본값 금지(T-17-17)를 시험할 수 없다.
   */
  exchange: string;
};

/**
 * VI 설정 요청(11) 내용을 꺼낸다 (16-14 E2E 가 쓴다).
 *
 * **여기에 두는 이유는 `readQuoteRequestKey` 와 같다** — `flatbuffers` 와 생성 코드는
 * relay 패키지 의존성이라 webapp 쪽 파일이 직접 import 할 수 없다.
 *
 * ★ 왜 필요한가: 「값만 수정했을 때 `run` 이 유지되는가」는 **페이로드를 보지 않으면
 *   확인할 수 없다.** 스텁 게이트웨이는 11 에 자동 응답하지 않으므로 화면 상태로는
 *   구분되지 않고, msg_type 만 세면 「보냈다」까지밖에 못 본다.
 *
 * @returns 11 요청이면 내용, 그 외 msg_type 이면 `null`
 */
export function readViSetRequest(msgType: number, payload: Buffer): ViSetRequest | null {
  if (msgType !== STRATEGY_MSG.SetVITriggerReq) return null;
  const req = rootEnvelope(payload)?.setViTrigger();
  if (req === null || req === undefined) return null;
  return {
    accountNo: req.accountNo() ?? "",
    // 와이어는 64비트지만 금액은 안전 정수 범위다 — 비교 편의를 위해 number 로 좁힌다.
    orderAmountKrw: Number(req.orderAmountKrw()),
    checkRate: req.checkRate(),
    priceType: req.priceType() ?? "",
    run: req.run(),
    exchange: req.exchange() ?? "",
  };
}

/**
 * `SetLimitChaserReq(10)` 요청 내용 — 상따 설정 전송분(Phase 24 트레이서 · e2e · 통합 공용).
 *
 * `buyWatchSide` 는 **와이어 원문**이다 — 슬롯이 없으면 `null`(relay 가 싣지 않았다는 증거).
 * `readViSetRequest.exchange` 와 같은 이유로 정규화하지 않는다. 슬롯 24 는 gh-trade a3610261 로
 * 봉인돼 생성 접근자가 없으므로 vtable 슬롯 24 를 원시로 읽는다.
 */
export interface SetLimitChaserRequest {
  isin: string;
  accountNo: string;
  exchange: string;
  crud: string;
  buyEnabled: boolean;
  buyOrderPrice: number;
  buyOrderQty: number;
  /** 선매수 주문금액(만원) — 새 폼 84 시딩(Phase 27 · 27-07 P27-4)이 첫 등록 cfg 에 실렸는가를 바이트로 본다. */
  buyOrderAmount: number;
  buyWatchPrice: number;
  /** relay 파생값 — 1(자동 미적재 · `LC_FIXED_BUY3_SCHEMA`) · 2(자동 적재 · `LC_POST_BUY_AUTO_BUY3_SCHEMA`) ·
   *  3(자동 + 버스트 시 해제 적재 · `LC_BURST_RELEASE_BUY3_SCHEMA` · quick-261003-rc4) ·
   *  4(+ 자동매도 요청 4필드 적재 · `LC_AUTO_SELL_BUY3_SCHEMA` · Phase 27). */
  buy3Schema: number;
  /** 슬롯 부재 = `null`. buy3 요청은 이 슬롯이 없어야 한다. */
  buyWatchSide: string | null;
  preBuyEnabled: boolean;
  extraBuyEnabled: boolean;
  extraBuyMinQty: number;
  extraBuyMaxQty: number;
  extraBuyOrderAmount: number;
  extraBuyOrderQty: number;
  postBuyEnabled: boolean;
  postBuyReboundPct: number;
  postBuyFloorQty: number;
  postBuyReentry: number;
  postBuyOrderAmount: number;
  postBuyOrderQty: number;
  /** 후매수 ☐자동(quick-260929-vzy) — 슬롯 부재(buy3_schema 1 · 또는 false 기본값) = false. */
  postBuyAuto: boolean;
  /** 추가매수 ☐버스트 시 해제(quick-261003-rc4 · vtable 138) — 슬롯 부재(buy3_schema 1/2 · 또는 false 기본값) = false. */
  extraBuyBurstRelease: boolean;
  /** ☐자동매도(Phase 27 · vtable 140) — 슬롯 부재(buy3_schema ≤ 3 · 또는 false 기본값) = false. */
  autoSellEnabled: boolean;
  /** 자동매도 시작조건(vtable 142) — 슬롯 부재 = 0. */
  autoSellStartCond: number;
  /** 자동매도 비율 %(vtable 144) — 슬롯 부재 = 0. */
  autoSellRatioPct: number;
  /** 자동매도 방법(vtable 146) — 슬롯 부재 = 0. */
  autoSellMethod: number;
  /**
   * 자동매도 요청 4필드(140 · 142 · 144 · 146) 중 vtable 슬롯이 **있는** 오프셋. schema ≤ 3 요청은 빈 배열이어야
   * 한다(기본값 false/0 도 버퍼에 안 쓰이므로 schema 4 에서도 값이 0 인 칸은 빠진다 — 접근자 값과 함께 본다).
   */
  autoSellReqSlots: number[];
  /**
   * 자동매도 **에코 전용** 4필드(`auto_sell_state` 148 · `auto_sell_sold_qty` 150 · `auto_sell_basis` 152 ·
   * `auto_sell_basis_price` 154) 슬롯이 넷 다 **없는가**. 요청은 늘 true 여야 한다(T-24-01 — 서버 전용 값 미적재).
   */
  autoSellEchoSlotsEmpty: boolean;
  /**
   * 매도 · 취소 게이트 · 체크(Phase 24 24-08 — D-06 자동 체크 · D-02 후반 서버 접힘 자동 끔의 실브라우저 단언).
   * 선매수를 켜는 한 번의 10 에 동반으로 실리는지, 자동 끔 제출이 매도 게이트를 그대로 싣는지를 본다.
   */
  sellEnabled: boolean;
  sellTradeQtyEnabled: boolean;
  sellQtyTrackEnabled: boolean;
  sellOrderPrice: number;
  sellWatchPrice: number;
  cancelQtyEnabled: boolean;
  cancelTradeEnabled: boolean;
  cancelQtyTrackEnabled: boolean;
  /**
   * S→C 전용 6필드(`extra_buy_abandoned` 112 · `post_buy_trigger_qty` 126 ·
   * `post_buy_reentry_left` 128 · `post_buy_phase` 130 · `extra_buy_abandon_qty` 134 ·
   * `post_buy_unlock_qty` 136) 중 vtable 슬롯이 **있는** 오프셋.
   * 요청은 빈 배열이어야 한다.
   */
  serverOnlySlots: number[];
}

/** S→C 전용 6필드의 vtable 오프셋(생성 코드 `__offset(bb_pos, N)` 의 N). `post_buy_unlock_qty` 136 은 quick-261002-fim. */
const LC_SERVER_ONLY_VTABLE_SLOTS = [112, 126, 128, 130, 134, 136] as const;

/** 자동매도 요청 4필드(양방향)의 vtable 오프셋 — Phase 27 · gh-trade 2404509b. */
const LC_AUTO_SELL_REQ_VTABLE_SLOTS = [140, 142, 144, 146] as const;

/** 자동매도 에코 전용 4필드의 vtable 오프셋 — 요청에 있으면 안 된다. */
const LC_AUTO_SELL_ECHO_VTABLE_SLOTS = [148, 150, 152, 154] as const;

/** 봉인된 `buy_watch_side` 의 vtable 오프셋 — gh-trade a3610261 이후 생성 접근자가 없다. */
const BUY_WATCH_SIDE_SEALED_VT = 24;

/** 접근자가 사라진 봉인 문자열 슬롯을 원시로 읽는다 — 슬롯 부재면 `null`. */
function readSealedStringSlot(
  bb: flatbuffers.ByteBuffer,
  bbPos: number,
  vt: number,
): string | null {
  const offset = bb.__offset(bbPos, vt);
  return offset === 0 ? null : (bb.__string(bbPos + offset) as string);
}

/**
 * 상따 설정 요청(10) 내용을 꺼낸다. `readViSetRequest` 와 같은 이유로 여기 있다.
 *
 * ★ 슬롯 **부재**는 접근자 값으로 증명할 수 없다 — 기본값(0/false)을 실어도 FlatBuffers 는
 *   버퍼에 쓰지 않고, 접근자는 부재든 0 이든 같은 값을 돌려준다(RESEARCH Pitfall 2).
 *   그래서 vtable 을 직접 본다: `bb.__offset(bb_pos, vt) !== 0` 이면 슬롯이 있다.
 *
 * @returns 10 요청이면 내용, 그 외 msg_type 이면 `null`
 */
export function readSetLimitChaserRequest(
  msgType: number,
  payload: Buffer,
): SetLimitChaserRequest | null {
  if (msgType !== STRATEGY_MSG.SetLimitChaserReq) return null;
  const req = rootEnvelope(payload)?.setLimitChaser();
  if (req === null || req === undefined || req.bb === null) return null;
  const bb = req.bb;
  return {
    isin: req.isin() ?? "",
    accountNo: req.accountNo() ?? "",
    exchange: req.exchange() ?? "",
    crud: req.crud() ?? "",
    buyEnabled: req.buyEnabled(),
    buyOrderPrice: req.buyOrderPrice(),
    buyOrderQty: req.buyOrderQty(),
    buyOrderAmount: req.buyOrderAmount(),
    buyWatchPrice: req.buyWatchPrice(),
    buy3Schema: req.buy3Schema(),
    buyWatchSide: readSealedStringSlot(bb, req.bb_pos, BUY_WATCH_SIDE_SEALED_VT),
    preBuyEnabled: req.preBuyEnabled(),
    extraBuyEnabled: req.extraBuyEnabled(),
    extraBuyMinQty: req.extraBuyMinQty(),
    extraBuyMaxQty: req.extraBuyMaxQty(),
    extraBuyOrderAmount: req.extraBuyOrderAmount(),
    extraBuyOrderQty: req.extraBuyOrderQty(),
    postBuyEnabled: req.postBuyEnabled(),
    postBuyReboundPct: req.postBuyReboundPct(),
    postBuyFloorQty: req.postBuyFloorQty(),
    postBuyReentry: req.postBuyReentry(),
    postBuyOrderAmount: req.postBuyOrderAmount(),
    postBuyOrderQty: req.postBuyOrderQty(),
    postBuyAuto: req.postBuyAuto(),
    extraBuyBurstRelease: req.extraBuyBurstRelease(),
    autoSellEnabled: req.autoSellEnabled(),
    autoSellStartCond: req.autoSellStartCond(),
    autoSellRatioPct: req.autoSellRatioPct(),
    autoSellMethod: req.autoSellMethod(),
    autoSellReqSlots: LC_AUTO_SELL_REQ_VTABLE_SLOTS.filter((vt) => bb.__offset(req.bb_pos, vt) !== 0),
    autoSellEchoSlotsEmpty: LC_AUTO_SELL_ECHO_VTABLE_SLOTS.every((vt) => bb.__offset(req.bb_pos, vt) === 0),
    sellEnabled: req.sellEnabled(),
    sellTradeQtyEnabled: req.sellTradeQtyEnabled(),
    sellQtyTrackEnabled: req.sellQtyTrackEnabled(),
    sellOrderPrice: req.sellOrderPrice(),
    sellWatchPrice: req.sellWatchPrice(),
    cancelQtyEnabled: req.cancelQtyEnabled(),
    cancelTradeEnabled: req.cancelTradeEnabled(),
    cancelQtyTrackEnabled: req.cancelQtyTrackEnabled(),
    serverOnlySlots: LC_SERVER_ONLY_VTABLE_SLOTS.filter((vt) => bb.__offset(req.bb_pos, vt) !== 0),
  };
}

/** `ConfirmVIOrderReq(33)` 요청 내용 — VI 주문 확인 체크 전송분. */
export type ViConfirmRequest = { orderNo: string; confirmed: boolean };

/**
 * VI 확인 요청(33) 내용을 꺼낸다 (16-14 E2E). 위 `readViSetRequest` 와 같은 이유로 여기 있다.
 * 확인 체크는 서버가 **응답하지 않고** 73 으로만 정정하므로, 「무엇을 보냈는가」는
 * 이 페이로드가 유일한 증거다.
 */
export function readViConfirmRequest(msgType: number, payload: Buffer): ViConfirmRequest | null {
  if (msgType !== STRATEGY_MSG.ConfirmVIOrderReq) return null;
  const req = rootEnvelope(payload)?.confirmViOrderReq();
  if (req === null || req === undefined) return null;
  return { orderNo: req.orderNo() ?? "", confirmed: req.confirmed() };
}

/**
 * 래치 점등 요청 2종 — 본문은 둘 다 `get_strategy_req{key}` 슬롯을 재사용한다 (17 D-04).
 * 38(구 매수 진입 래치)은 Phase 24 에서 봉인 — relay 가 조립할 수 없다.
 */
const ARM_LATCH_MSG_TYPES: ReadonlySet<number> = new Set<number>([
  MSG.ArmSellLatchReq,
  MSG.ArmCancelLatchReq,
]);

/**
 * 래치 점등 요청(36/37)의 전략 키를 꺼낸다 (17-04 / D-24).
 *
 * **여기에 두는 이유는 `readViSetRequest` 와 같다** — `flatbuffers` 와 생성 코드는 relay
 * 패키지 의존성이라 다른 패키지의 파일이 직접 import 할 수 없고, 프레임 해석이 두 벌이 되면
 * 스키마가 바뀔 때 한쪽만 고쳐진다.
 *
 * ★ 왜 필요한가: 둘은 **본문 슬롯을 공유**하므로 msg_type 만 세면 「보냈다」까지밖에 못 본다.
 *   `buildBareRequest` 로 보낸 빈 요청도 msg_type 은 똑같이 36 이고, 그것을 받은 서버는
 *   「등록된 상따 전략이 없습니다」로 거부한다 (Pitfall 2). 키가 실렸는지는 페이로드를
 *   보지 않으면 확인할 수 없다.
 *
 * @returns 36/37 이고 요청 테이블이 있으면 그 `key`(빈 문자열일 수 있다), 그 외 `null`
 */
export function readArmLatchRequest(msgType: number, payload: Buffer): string | null {
  if (!ARM_LATCH_MSG_TYPES.has(msgType)) return null;
  const req = rootEnvelope(payload)?.getStrategyReq();
  if (req === null || req === undefined) return null;
  return req.key() ?? "";
}

/**
 * VI 전략 조회 요청(21)의 **거래소**를 꺼낸다 (17-05 / D-06 / D-24).
 *
 * 21 은 `get_strategy_req.key` 슬롯을 **거래소 문자열로 재사용**한다 (`StockDMA.fbs:642-648`
 * · `Gateway::ProcessGetVITrigger`). 그래서 `readArmLatchRequest` 와 같은 이유로 여기가
 * 필요하다 — msg_type 만 세면 「21 을 두 번 보냈다」까지밖에 못 보고, **두 요청이 서로 다른
 * 거래소를 가리키는지**는 페이로드를 디코드해야 안다. 같은 거래소를 두 번 보내면
 * NXT 슬롯은 영원히 조회되지 않는데 카운터는 2 로 정상처럼 보인다.
 *
 * @returns 21 이고 요청 테이블이 있으면 그 `key`(빈 문자열 = 서버가 KRX 로 접는다),
 *          테이블이 없으면(`buildBareRequest` 회귀) `""` 가 아니라 `null` 이다.
 */
export function readGetVITriggerExchange(msgType: number, payload: Buffer): string | null {
  if (msgType !== STRATEGY_MSG.GetVITriggerReq) return null;
  const req = rootEnvelope(payload)?.getStrategyReq();
  if (req === null || req === undefined) return null;
  return req.key() ?? "";
}

/** `AutoSellCommandReq(41)` 요청 내용 — 자동매도 바로시작(action 1) / 중지(2) 전송분 (Phase 27). */
export type AutoSellCommandRequest = {
  isin: string;
  accountNo: string;
  exchange: string;
  action: number;
};

/**
 * 자동매도 명령(41) 내용을 꺼낸다 (Phase 27). `readArmLatchRequest` 와 같은 이유로 여기 있다 — msg_type 만 세면
 * 「보냈다」까지밖에 못 보고, 어느 계좌 · 어느 동작이 실렸는지는 페이로드가 유일한 증거다. `exchange` 는 와이어
 * 원문이다(정규화하지 않는다).
 *
 * @returns 41 이고 요청 테이블이 있으면 내용, 그 외 `null`
 */
export function readAutoSellCommandRequest(payload: Buffer): AutoSellCommandRequest | null {
  const env = rootEnvelope(payload);
  if (env === null || env.msgType() !== MSG.AutoSellCommandReq) return null;
  const req = env.autoSellCommandReq();
  if (req === null) return null;
  return {
    isin: req.isin() ?? "",
    accountNo: req.accountNo() ?? "",
    exchange: req.exchange() ?? "",
    action: req.action(),
  };
}

/** `UserSettings.present` 의 vtable 오프셋 — 84 전용 필드(fbs 12번째 · 4 + 2×11). */
const USER_SETTINGS_PRESENT_VT = 26;

/**
 * `SetUserSettingsReq(42)` 요청 내용 — 11값 + `present` 슬롯 부재 증거 (Phase 27).
 *
 * `presentSlotEmpty` 는 접근자 값이 아니라 **vtable** 로 본다 — `false` 를 실어도 FlatBuffers 는 버퍼에 쓰지 않으므로
 * 접근자로는 「싣지 않았다」를 증명할 수 없다(`readSetLimitChaserRequest` 의 슬롯 판정과 같은 이유).
 */
export type SetUserSettingsRequest = {
  preBuyAmount: number;
  addBuyAmount: number;
  postBuyAmount: number;
  postBuyMaxCount: number;
  postBuyFloorQty: number;
  postBuyReboundPct: number;
  sellQtyTrackRatio: number;
  autoSellPeriodSec: number;
  auctionSellRatioPct: number;
  autoSellRatioDefaultPct: number;
  autoSellMethodDefault: number;
  presentSlotEmpty: boolean;
};

/**
 * 사용자 설정 저장(42) 내용을 꺼낸다 (Phase 27). 42 는 84 와 Envelope 슬롯 88 을 공유하므로 msg_type 으로 가른다.
 *
 * @returns 42 이고 요청 테이블이 있으면 내용, 그 외 `null`
 */
export function readSetUserSettingsRequest(payload: Buffer): SetUserSettingsRequest | null {
  const env = rootEnvelope(payload);
  if (env === null || env.msgType() !== MSG.SetUserSettingsReq) return null;
  const u = env.userSettings();
  if (u === null || u.bb === null) return null;
  return {
    preBuyAmount: u.preBuyAmount(),
    addBuyAmount: u.addBuyAmount(),
    postBuyAmount: u.postBuyAmount(),
    postBuyMaxCount: u.postBuyMaxCount(),
    postBuyFloorQty: u.postBuyFloorQty(),
    postBuyReboundPct: u.postBuyReboundPct(),
    sellQtyTrackRatio: u.sellQtyTrackRatio(),
    autoSellPeriodSec: u.autoSellPeriodSec(),
    auctionSellRatioPct: u.auctionSellRatioPct(),
    autoSellRatioDefaultPct: u.autoSellRatioDefaultPct(),
    autoSellMethodDefault: u.autoSellMethodDefault(),
    presentSlotEmpty: u.bb.__offset(u.bb_pos, USER_SETTINGS_PRESENT_VT) === 0,
  };
}

/** quote 관찰자 역할 (ed2e0240). 스텁은 relay 의 `QUOTE_ROLE` 을 import 하지 않는다 — 서버 규약 쪽 값이다. */
const QUOTE_OBSERVER_ROLE = 1;

/**
 * quote 로그인 79 의 내용 — 서버 규약 기본(role 1 · epoch "" · 계좌 빈 벡터) 위에 테스트 지정값을 얹는다.
 * 거부(`success === false`)이고 role 을 지정하지 않았으면 role 0 이다(서버 거부 응답 규약).
 */
function quoteLoginRespInput(resp: FakeObserverLoginRespInput): FakeObserverLoginRespInput {
  const role = resp.role ?? (resp.success === false ? 0 : QUOTE_OBSERVER_ROLE);
  return { accounts: [], epoch: "", ...resp, role };
}

/** admin 관찰자 역할 (gh-trade 92cdfbff). 스텁은 relay 의 `ADMIN_ROLE` 을 import 하지 않는다 — 서버 규약 쪽 값이다. */
const ADMIN_OBSERVER_ROLE = 2;

/** admin 로그인 79 의 내용 — `quoteLoginRespInput` 과 같은 규율(role 2 · epoch "" · 계좌 빈 벡터 · 거부면 role 0). */
function adminLoginRespInput(resp: FakeObserverLoginRespInput): FakeObserverLoginRespInput {
  const role = resp.role ?? (resp.success === false ? 0 : ADMIN_OBSERVER_ROLE);
  return { accounts: [], epoch: "", ...resp, role };
}

/**
 * admin 명령 요청(44) 내용을 꺼낸다 (Phase 29). `readObserverLoginRequest` 와 같은 이유로 여기 있다 — 생성 코드 해석을
 * 스텁 한 벌에 모은다. `request_id` 는 ulong 이라 bigint 그대로 둔다.
 *
 * @returns 44 이고 요청 테이블이 있으면 내용, 그 외 `null`
 */
export function readAdminCommandRequest(msgType: number, payload: Buffer): AdminCommandRequest | null {
  if (msgType !== MSG.AdminCommandReq) return null;
  const req = rootEnvelope(payload)?.adminCommandReq();
  if (req === null || req === undefined) return null;
  const a = req.account();
  return {
    requestId: req.requestId(),
    op: req.op(),
    userId: req.userId() ?? "",
    password: req.password() ?? "",
    account:
      a === null
        ? null
        : {
            accountNo: a.accountNo() ?? "",
            name: a.name() ?? "",
            branchNo: a.branchNo() ?? "",
            traderId: a.traderId() ?? "",
            priority: a.priority(),
          },
  };
}

/** 스텁 code 값 — relay `ADMIN_CODE` 를 import 하지 않는다(서버 규약 쪽 값 · `ADMIN_OBSERVER_ROLE` 과 같은 이유). */
const FAKE_ADMIN_CODE = {
  Ok: 0,
  BadOp: 1,
  BadUserId: 2,
  BadPassword: 3,
  NoSuchUser: 4,
  BadAccountNo: 5,
  AccountConflict: 7,
  NoSuchAccount: 8,
  Busy: 9,
  LastAccount: 12,
} as const;

/** 87 입력 — 유저는 Map 순서(파일 순 흉내), 계좌는 priority 오름차순(안정 정렬). */
function adminSnapshotOf(state: FakeAdminState): FakeAdminUsersSnapshotInput {
  return {
    usersRev: state.usersRev,
    users: [...state.users].map(([userId, accounts]) => ({
      userId,
      accounts: [...accounts].sort((x, y) => (x.priority ?? 0) - (y.priority ?? 0)).map((a) => ({ ...a })),
    })),
  };
}

/** 계좌 입력 → 5필드 완성본 (비교용). */
function fullAccount(a: FakeAdminAccountInput): Required<FakeAdminAccountInput> {
  return {
    accountNo: a.accountNo ?? "",
    name: a.name ?? "",
    branchNo: a.branchNo ?? "",
    traderId: a.traderId ?? "",
    priority: a.priority ?? 0,
  };
}

/**
 * 메모리 users 표로 op 1~5 를 흉내 내는 기본 handler (Phase 29 · gh-trade D-05~D-15 요약).
 *
 * - op 5 → 87 만.
 * - 실제 변경 → `state.usersRev += 1` → 86(ok · 새 rev) 뒤 87. 무변경 → 86 code 0 · rev 불변 · 87 없음(D-09).
 * - 실패 → 86(ok false · code · 한국어 message)만 — rev 불변 · 87 없음.
 * - op 1 신규 = 비밀번호 + 첫 계좌 필수 · 기존 = 비밀번호만(빈 값 = 유지 → 무변경). 비밀번호는 표에 저장하지 않는다
 *   (87 에 없다) — 기존 유저의 비어 있지 않은 비밀번호는 늘 「변경」으로 친다.
 * - op 4 → 없는 계좌 8 · 마지막 계좌 12 · `busyAccounts` 9. op 2 → 그 유저 계좌 중 하나라도 `busyAccounts` 면 9.
 * - op 3 → 다른 유저 소유 계좌 7 · 같은 값 무변경 · branch/trader 변경이 BUSY 계좌면 9.
 *
 * `state` 를 제자리 갱신한다 — 테스트가 같은 객체로 rev · 표를 단언한다. 서버 2대는 state 2개로 만든다.
 */
export function defaultAdminHandler(state: FakeAdminState): FakeAdminHandler {
  const fail = (req: AdminCommandRequest, code: number, message: string): FakeAdminReply => ({
    resp: { requestId: req.requestId, ok: false, code, message, usersRev: state.usersRev },
  });
  const unchanged = (req: AdminCommandRequest): FakeAdminReply => ({
    resp: { requestId: req.requestId, ok: true, code: FAKE_ADMIN_CODE.Ok, message: "", usersRev: state.usersRev },
  });
  const changed = (req: AdminCommandRequest): FakeAdminReply => {
    state.usersRev += 1n;
    return {
      resp: { requestId: req.requestId, ok: true, code: FAKE_ADMIN_CODE.Ok, message: "", usersRev: state.usersRev },
      snapshot: adminSnapshotOf(state),
    };
  };
  const ownerOf = (accountNo: string): string | null => {
    for (const [userId, accounts] of state.users) {
      if (accounts.some((a) => a.accountNo === accountNo)) return userId;
    }
    return null;
  };
  const busyMessage = "미체결 1건 등록 — 먼저 정리";

  return (req) => {
    if (req.op === 5) return { snapshot: adminSnapshotOf(state) };
    if (req.op < 1 || req.op > 5) return fail(req, FAKE_ADMIN_CODE.BadOp, "알 수 없는 명령입니다");
    if (req.userId === "") return fail(req, FAKE_ADMIN_CODE.BadUserId, "사용자 ID 가 비어 있습니다");
    const accounts = state.users.get(req.userId);

    switch (req.op) {
      case 1: {
        if (accounts !== undefined) return req.password === "" ? unchanged(req) : changed(req);
        if (req.password === "") return fail(req, FAKE_ADMIN_CODE.BadPassword, "신규 사용자는 비밀번호가 필요합니다");
        if (req.account === null || req.account.accountNo === "") {
          return fail(req, FAKE_ADMIN_CODE.BadAccountNo, "신규 사용자는 첫 계좌가 필요합니다");
        }
        if (ownerOf(req.account.accountNo) !== null) {
          return fail(req, FAKE_ADMIN_CODE.AccountConflict, "다른 사용자에게 등록된 계좌입니다");
        }
        state.users.set(req.userId, [{ ...req.account }]);
        return changed(req);
      }
      case 2: {
        if (accounts === undefined) return fail(req, FAKE_ADMIN_CODE.NoSuchUser, "없는 사용자입니다");
        if (accounts.some((a) => state.busyAccounts.has(a.accountNo ?? ""))) {
          return fail(req, FAKE_ADMIN_CODE.Busy, busyMessage);
        }
        state.users.delete(req.userId);
        return changed(req);
      }
      case 3: {
        if (accounts === undefined) return fail(req, FAKE_ADMIN_CODE.NoSuchUser, "없는 사용자입니다");
        if (req.account === null || req.account.accountNo === "") {
          return fail(req, FAKE_ADMIN_CODE.BadAccountNo, "계좌번호가 비어 있습니다");
        }
        const next = req.account;
        const owner = ownerOf(next.accountNo);
        if (owner !== null && owner !== req.userId) {
          return fail(req, FAKE_ADMIN_CODE.AccountConflict, "다른 사용자에게 등록된 계좌입니다");
        }
        const i = accounts.findIndex((a) => a.accountNo === next.accountNo);
        if (i < 0) {
          accounts.push({ ...next });
          return changed(req);
        }
        const prev = fullAccount(accounts[i]!);
        if (JSON.stringify(prev) === JSON.stringify(fullAccount(next))) return unchanged(req);
        const routeChanged = prev.branchNo !== next.branchNo || prev.traderId !== next.traderId;
        if (routeChanged && state.busyAccounts.has(next.accountNo)) return fail(req, FAKE_ADMIN_CODE.Busy, busyMessage);
        accounts[i] = { ...next };
        return changed(req);
      }
      case 4: {
        if (accounts === undefined) return fail(req, FAKE_ADMIN_CODE.NoSuchUser, "없는 사용자입니다");
        const accountNo = req.account?.accountNo ?? "";
        if (accountNo === "") return fail(req, FAKE_ADMIN_CODE.BadAccountNo, "계좌번호가 비어 있습니다");
        const i = accounts.findIndex((a) => a.accountNo === accountNo);
        if (i < 0) return fail(req, FAKE_ADMIN_CODE.NoSuchAccount, "없는 계좌입니다");
        if (accounts.length === 1) return fail(req, FAKE_ADMIN_CODE.LastAccount, "마지막 계좌는 지울 수 없습니다");
        if (state.busyAccounts.has(accountNo)) return fail(req, FAKE_ADMIN_CODE.Busy, busyMessage);
        accounts.splice(i, 1);
        return changed(req);
      }
      default:
        return fail(req, FAKE_ADMIN_CODE.BadOp, "알 수 없는 명령입니다");
    }
  };
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

  /*
    전략 조회 3종의 자동 응답 내용.

    기본값을 "응답하지 않음" 이 아니라 **빈 응답**으로 두는 것은 의도다. 실서버는 등록된
    전략이 없어도 반드시 답한다(무응답 금지 — 24 는 길이 0 벡터, 21 은 빈 테이블).
    스텁이 침묵하면 시드를 깜빡한 테스트가 "relay 가 멎었다"로 나타나 원인이 가려진다.
  */
  let limitChasers: FakeLimitChaserInput[] = [];
  let viTrigger: FakeViTriggerInput | null = null;
  let viOrders: FakeViOrderItemInput[] = [];
  const strategyReqs: StrategyRequest[] = [];
  /** 43 자동 응답 내용 (Phase 27). **기본 null = 무응답** — 조회 3종의 「늘 답한다」와 다르다(Pitfall 10). */
  let userSettingsSeed: FakeUserSettingsInput | null = null;

  // 관찰자 모드 (19-09) — 자동 응답은 기본 꺼짐.
  let observerLoginResp: FakeObserverLoginRespInput | null = opts.observerLoginResp ?? null;
  const observerLogins: ObserverLoginRequest[] = [];
  const observerSockets: net.Socket[] = [];
  const pendingObserverConnections: Array<(sock: net.Socket) => void> = [];

  // quote 모드 (Phase 26) — 자동 응답은 기본 꺼짐. role 1 로그인은 여기에만 기록한다.
  let quoteLoginResp: FakeObserverLoginRespInput | null = opts.quoteLoginResp ?? null;
  const quoteLogins: ObserverLoginRequest[] = [];
  const quoteSockets: net.Socket[] = [];
  const pendingQuoteConnections: Array<(sock: net.Socket) => void> = [];

  // admin 모드 (Phase 29) — 로그인 · 44 자동 응답은 기본 꺼짐. role 2 로그인은 여기에만 기록한다.
  let adminLoginResp: FakeObserverLoginRespInput | null = opts.adminLoginResp ?? null;
  const adminLogins: ObserverLoginRequest[] = [];
  const adminSockets: net.Socket[] = [];
  const pendingAdminConnections: Array<(sock: net.Socket) => void> = [];
  const adminCommands: AdminCommandRequest[] = [];
  let adminHandler: FakeAdminHandler | null = null;

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
        const observerReq = msgType === MSG.ObserverLoginReq ? readObserverLoginRequest(msgType, payload) : null;
        if (observerReq !== null && observerReq.role === QUOTE_OBSERVER_ROLE) {
          // quote(role 1) — quote 목록에만 기록한다. 서버 규약: 79(role 에코) → 성공이면 78 1회.
          quoteLogins.push(observerReq);
          if (!quoteSockets.includes(sock)) quoteSockets.push(sock);
          if (quoteLoginResp !== null) {
            const resp = quoteLoginRespInput(quoteLoginResp);
            sock.write(frame(buildObserverLoginRespFrame(resp)));
            if (resp.success !== false) sock.write(frame(buildRateCrossSnapshotFrame([])));
          }
          const waiter = pendingQuoteConnections.shift();
          if (waiter) waiter(sock);
        } else if (observerReq !== null && observerReq.role === ADMIN_OBSERVER_ROLE) {
          // admin(role 2) — admin 목록에만 기록한다. 서버 규약(D-02): 79 1프레임만 · 78/80 없음.
          adminLogins.push(observerReq);
          if (!adminSockets.includes(sock)) adminSockets.push(sock);
          if (adminLoginResp !== null) {
            sock.write(frame(buildObserverLoginRespFrame(adminLoginRespInput(adminLoginResp))));
          }
          const waiter = pendingAdminConnections.shift();
          if (waiter) waiter(sock);
        } else if (msgType === MSG.ObserverLoginReq) {
          if (observerReq !== null) observerLogins.push(observerReq);
          if (!observerSockets.includes(sock)) observerSockets.push(sock);
          if (observerLoginResp !== null) sock.write(frame(buildObserverLoginRespFrame(observerLoginResp)));
          const waiter = pendingObserverConnections.shift();
          if (waiter) waiter(sock);
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
        // 전략 조회 3종은 늘 답한다 (무응답 금지 규약). 업무 로직은 흉내 내지 않는다 —
        // 요청 내용을 보지 않고 테스트가 미리 심어 둔 목록을 그대로 돌려줄 뿐이다.
        if (msgType === STRATEGY_MSG.GetLimitChaserListReq) {
          sock.write(frame(buildLimitChaserListRespFrame(limitChasers)));
        }
        if (msgType === STRATEGY_MSG.GetVITriggerReq) {
          sock.write(frame(buildSetVITriggerRespFrame(viTrigger)));
        }
        if (msgType === STRATEGY_MSG.GetVIOrderListReq) {
          sock.write(frame(buildViOrderListFrame(viOrders, true)));
        }
        if (msgType === MSG.GetUserSettingsReq && userSettingsSeed !== null) {
          sock.write(frame(buildUserSettingsFrame(userSettingsSeed)));
        }
        // 명령 4종은 **받아 기록만** 한다. payload 는 FrameReader 내부 버퍼의 뷰라
        // 사본을 뜬다 — 뷰를 그대로 쥐면 큰 누적 버퍼가 통째로 살아남는다.
        if (STRATEGY_COMMAND_MSG_TYPES.has(msgType)) {
          strategyReqs.push({ msgType, payload: Buffer.from(payload) });
        }
        // admin 명령(44) — 기록하고, handler 가 있으면 그 결과를 같은 연결에 86 → 87 순서로 쓴다(없으면 무응답).
        if (msgType === MSG.AdminCommandReq) {
          const adminReq = readAdminCommandRequest(msgType, payload);
          if (adminReq !== null) {
            adminCommands.push(adminReq);
            const reply = adminHandler?.(adminReq) ?? null;
            if (reply !== null) {
              if (reply.resp !== undefined) sock.write(frame(buildAdminCommandRespFrame(reply.resp)));
              if (reply.snapshot !== undefined) sock.write(frame(buildAdminUsersSnapshotFrame(reply.snapshot)));
            }
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

    respondLimitChaserList(items) {
      limitChasers = [...items];
    },

    respondViTrigger(cfg) {
      viTrigger = cfg;
    },

    respondViOrderList(items) {
      viOrders = [...items];
    },

    pushLimitChaserEcho(sock, cfg) {
      sock.write(frame(buildSetLimitChaserRespFrame(cfg)));
    },

    pushViOrderList(sock, items, snap) {
      sock.write(frame(buildViOrderListFrame(items, snap)));
    },

    pushOrderResp(sock, input) {
      sock.write(frame(buildOrderRespFrame(input)));
    },

    sendRateCrossAlert(sock, input) {
      sock.write(frame(buildRateCrossAlertFrame(input)));
    },

    sendRateCrossSnapshot(sock, items) {
      sock.write(frame(buildRateCrossSnapshotFrame(items)));
    },

    sendQueuedWindowState(sock, input) {
      sock.write(frame(buildQueuedWindowStateFrame(input)));
    },

    sendUserSettings(sock, input) {
      sock.write(frame(buildUserSettingsFrame(input)));
    },

    sendLimitFeature(sock, input) {
      sock.write(frame(buildLimitFeatureFrame(input)));
    },

    seedUserSettings(input) {
      userSettingsSeed = input === null ? null : { ...input };
    },

    strategyRequests() {
      return [...strategyReqs];
    },

    respondObserverLogin(resp) {
      observerLoginResp = resp;
    },

    pushJournalBatch(sock, input) {
      sock.write(frame(buildJournalBatchFrame(input)));
    },

    observerLoginRequests() {
      return observerLogins.map((r) => ({ ...r }));
    },

    waitForObserverConnection(timeoutMs = 1000) {
      const live = observerSockets.find((s) => !s.destroyed);
      if (live !== undefined) return Promise.resolve(live);
      return new Promise<net.Socket>((resolve, reject) => {
        const timer = setTimeout(() => {
          const i = pendingObserverConnections.indexOf(onObserver);
          if (i >= 0) pendingObserverConnections.splice(i, 1);
          reject(new Error(`가짜 게이트웨이 관찰자 연결 대기 시간 초과 (${timeoutMs}ms)`));
        }, timeoutMs);
        function onObserver(sock: net.Socket): void {
          clearTimeout(timer);
          resolve(sock);
        }
        pendingObserverConnections.push(onObserver);
      });
    },

    respondQuoteLogin(resp) {
      quoteLoginResp = resp;
    },

    quoteLoginRequests() {
      return quoteLogins.map((r) => ({ ...r }));
    },

    waitForQuoteConnection(timeoutMs = 1000) {
      const live = quoteSockets.find((s) => !s.destroyed);
      if (live !== undefined) return Promise.resolve(live);
      return new Promise<net.Socket>((resolve, reject) => {
        const timer = setTimeout(() => {
          const i = pendingQuoteConnections.indexOf(onQuote);
          if (i >= 0) pendingQuoteConnections.splice(i, 1);
          reject(new Error(`가짜 게이트웨이 quote 연결 대기 시간 초과 (${timeoutMs}ms)`));
        }, timeoutMs);
        function onQuote(sock: net.Socket): void {
          clearTimeout(timer);
          resolve(sock);
        }
        pendingQuoteConnections.push(onQuote);
      });
    },

    respondAdminLogin(resp) {
      adminLoginResp = resp;
    },

    adminLoginRequests() {
      return adminLogins.map((r) => ({ ...r }));
    },

    waitForAdminConnection(timeoutMs = 1000) {
      const live = adminSockets.find((s) => !s.destroyed);
      if (live !== undefined) return Promise.resolve(live);
      return new Promise<net.Socket>((resolve, reject) => {
        const timer = setTimeout(() => {
          const i = pendingAdminConnections.indexOf(onAdmin);
          if (i >= 0) pendingAdminConnections.splice(i, 1);
          reject(new Error(`가짜 게이트웨이 admin 연결 대기 시간 초과 (${timeoutMs}ms)`));
        }, timeoutMs);
        function onAdmin(sock: net.Socket): void {
          clearTimeout(timer);
          resolve(sock);
        }
        pendingAdminConnections.push(onAdmin);
      });
    },

    adminCommandRequests() {
      return adminCommands.map((r) => ({ ...r, account: r.account === null ? null : { ...r.account } }));
    },

    onAdminCommand(handler) {
      adminHandler = handler;
    },

    respondAdminCommand(sock, input) {
      sock.write(frame(buildAdminCommandRespFrame(input)));
    },

    pushAdminSnapshot(sock, input) {
      sock.write(frame(buildAdminUsersSnapshotFrame(input)));
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
