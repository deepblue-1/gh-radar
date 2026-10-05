/**
 * Phase 15 Plan 04 — RELAY-01. 종목 구독 참조계수 + 스냅샷 캐시 + Ready 재구독.
 *
 * gh-radar 에 선례가 없는 모듈이라 15-RESEARCH §Pattern 5 가 설계 정본이다.
 * "누가 무엇을 보고 있는가"를 아는 **유일한 객체**이며, 브라우저 소켓 수(탭 · 사용자)와
 * 게이트웨이 구독 수를 분리한다 — 사용자 5명이 탭 3개씩 같은 종목을 봐도 KB 방향 구독은 1개다.
 *
 * 결정 근거:
 *   Phase 26 D-12  시세 키는 **전역 `isin|ex`**(`marketKey`)이고 업스트림 송신자는 **quote 연결 하나**
 *         (`attachFeed` 로 결선한 `HubQuoteFeed` — 관찰자 로그인 role 1)다. 참조계수 · 스냅샷 · 체결 캐시가
 *         사용자 간에 공유되고, 사용자 DMA 세션은 종목을 구독하지 않는다(D-08 — 주문 · 계좌 · 전략 · 77 · 78 · 76 ·
 *         83 만 남는다). 옛 D-13 「키에 userId 를 포함한다」 는 이 빅뱅에서 내렸다 — 사용자별 3단 키
 *         (`progressKey`)는 83 잔량진행률 캐시에만 남는다(계좌 필터가 사용자 단위라서). 전역 키에서 A 의 해제가
 *         B 의 구독을 끊지 않는 근거는 키가 아니라 **참조계수**다(합계 1→0 에서만 29(false)).
 *   D-33  0→1 전이에서 `GetQuoteReq(28)` → `SubscribeQuoteReq(29, true)` →
 *         `GetTradeTapeReq(32)`. 1→0 에서 `SubscribeQuoteReq(29, false)`.
 *         체결 테이프는 **별도 구독이 없다**(시세 구독 편승) — 해제 프레임도 없다.
 *   level (quick-260923-ge2) — `SubscribeQuoteReq.level` 은 FULL(0, 59+71+75) / PRICE(1, 59 만).
 *         참조계수는 키당 `{full, price}` 두 칸이고 업스트림 level = full ≥1 ? FULL : PRICE 다.
 *           · 0→1 PRICE            = 28 → 29(level=1). 32 없음(71 이 오지 않는다).
 *           · 0→1 FULL             = 28 → 29(level=0) → 32 (종전 D-33 그대로).
 *           · PRICE→FULL 승격      = 28 → 29(level=0) → 32 를 **다시** 보낸다 — 서버는 구독 직후
 *                                    스냅샷이 없고 같은 키 재구독을 level 덮어쓰기로 처리한다.
 *           · FULL→PRICE 강등      = 29(level=1) 1건.
 *           · 마지막 소비자 이탈   = 29(subscribe=false) 1건 (level 무관 해제).
 *           · `resubscribeAll`     = 키마다 실효 level 로 되건다.
 *         모르는 level 은 FULL 로 접는다 — 더 가벼운 경로로 열화시키지 않는다(서버 규칙과 동형).
 *         75 거래원도 FULL 전용이다. 출처: gh-trade 회신 `tasks/gh-trade-price-only-quote-subscription-reply.md`
 *         (quick-260923-exo) · fbs `SubscribeQuoteReq` 주석.
 *   Phase 26 D-05  FULL 로 업스트림 구독된 키를 PRICE 소켓(돌파 칩)이 볼 때 relay 는 **서버 PRICE 규칙을 복제**한다 —
 *         가격 섹션(A3 체결 · R8 VI · A6 종가)이 바뀐 59 만 통과시키고, 호가(B6)만 바뀐 틱은 price 소켓에 0건이다.
 *         키당 최소 간격 `PRICE_MIN_INTERVAL_MS`(100ms · 서버 상수 복제)이고, 억제된 갱신은 버리지 않고 마지막 PRICE 송신
 *         +100ms 에 **그 시점 최신 상태** 59 한 프레임으로 나간다(유실 없이 지연만). relay 는 서버 dirty 비트를 받지 못하므로
 *         직전 캐시와 가격 섹션 필드를 비교해(`samePriceSection`) 복제한다 — 체결 시각 칸은 B6 도 덮어써 서명에서 뺀다.
 *         알려진 차이(서버보다 엄격): VI 상태만 바뀐 R8(참조가 불변)은 와이어상 가격 칸이 같아 relay 는 통과시키지 않는다 —
 *         PRICE 소비자 필드 근거는 26-07-SUMMARY 「D-05 편차」.
 *   Phase 26 D-06  판정은 **hub 키 단위 1회**다 — 키마다 게이트 1개(`lastPriceSentMs` · `pending` · 타이머 1개)를 두고 결과를
 *         `"market"` 이벤트의 `price` 플래그로 싣는다. fanout 은 소켓 level 로만 거르므로 비용이 소켓 수와 무관하다.
 *         업스트림 실효 level 이 PRICE 인 키는 서버가 이미 걸렀으므로 판정 없이 전부 통과한다.
 *   Phase 26 D-07  PRICE 소켓이 받는 59 본문은 FULL 과 **같은 `RelayQuote` 프레임**이다 — 플래그는 이벤트 메타데이터일 뿐
 *         와이어가 아니다(축약 타입 · shared 타입 · 웹 파서 변경 0). 71 tape 는 full 소켓에만 간다.
 *   D-35  시세는 **추가 코얼레싱을 하지 않는다**(업스트림 100ms 를 그대로 통과).
 *         체결 테이프만 200ms 배치로 묶는다. 배치 타이머는 키마다가 아니라
 *         **전역 1개**다(Phase 26 — 키가 전역이 되면서 사용자 단위 타이머가 전역 1개로 접혔다) —
 *         종목 10개를 보면 타이머 10개가 도는 구조를 만들지 않는다.
 *   D-36  `ServerMessage(54)` 는 해석하지 않고 그대로 흘린다.
 *   D-23  계좌 상태(잔고·미체결)는 **종목 구독과 무관**하다. 세션 `ready` 마다
 *         `GetAccountStateReq(25)`{account_no:""} 를 1회 보내 전 계좌 스냅샷(66)을 받고,
 *         이후 델타(67)를 반영한다. 참조계수 경로에 얹지 않는 이유가 이것이다 —
 *         아무 종목도 구독하지 않은 사용자도 자기 잔고는 봐야 한다.
 *   D-37  브라우저 재접속·다중 탭·**다른 사용자**에서 **스냅샷 캐시가 즉시 응답**한다(캐시는 전역이다).
 *         Phase 26 부터 전역 캐시는 **linger(D-10) 만료에서 해제한다** — 캐시 크기 ≤ 업스트림 키 수(live + linger).
 *         키가 전역이라 영구 보존하면 한 번이라도 본 종목 수만큼 무한히 자란다.
 *   Phase 26 D-10  **1→0 은 짧은 linger 뒤 해제**한다. 마지막 소비자가 떠난 키는 `LINGER_MS`(15초) 동안 업스트림
 *         구독 · 캐시를 유지하다 29(false) + 캐시 · PRICE 게이트 삭제로 푼다(`#releaseKey`). 탭 전환 · 새로고침으로
 *         그 안에 돌아오면 28 · 29 · 32 재요청 없이 캐시로 그린다 — 단 linger 당시 업스트림 level 과 새 실효 level 이
 *         다르면 승격(28→29(0)→32) · 강등(29(1)) 규칙 그대로다. linger 키는 업스트림 키 수에 포함된다(26-09 2000 가드).
 *         quote 연결 재접속(`ready`)에서는 linger 키를 되걸지 않고 즉시 정리한다(새 연결엔 구독이 없고 소비자도 없다).
 *         LRU 축출 · 기존 구독 강제 해제는 없다 — 소비자 0 키를 푸는 것은 linger 만료와 D-11 의 자리 만들기 둘이다.
 *   Phase 26 D-11 · D-15  **구독 한도.** 업스트림 키(live + linger)가 `QUOTE_SUB_LIMIT`(2000)에 이르면 새 키는 업스트림
 *         송신 **전에** 거부한다 — 서버는 초과 구독을 끊지 않고 조용히 무시하므로(RESEARCH Pitfall 5) 가드가 없으면
 *         「구독했는데 시세가 안 온다」 로만 보인다. 자리를 만들 때는 가장 오래 linger 한 키부터 29(false) 로 풀고, linger
 *         키가 없으면 거부한다(기존 live 구독 축출 없음). 한 사용자(모든 탭 합산)가 참조하는 서로 다른 키는
 *         `USER_SUB_LIMIT`(200)까지다 — 사용자 세션의 서버 한도(세션당 200)가 사라진 빈자리를 메워, 한 탭의 버그가
 *         전원의 새 구독을 막지 못하게 한다. 거부 = 상태 무변경 · `subLimitRejects` +1 · warn 1건 · `subscribe` 반환값
 *         (`"limit-user"` / `"limit-global"`) — fanout 이 그 소켓에만 `{t:"sub.limit"}` 을 보낸다.
 *   Phase 26 Pattern 10 · Pitfall 6  **83 재송신 넛지** (26-11 · d43 회귀 방지).
 *         서버는 83(잔량진행률)을 두 경로로 낸다 — 「① 그 종목·거래소 시세 구독 연결 (FULL ∪ PRICE)」 과 「② 항목 계좌를 선언한
 *         세션」(gh-trade MarketPublisher.cpp:771-779). relay 는 quote 연결의 83(①)을 무시하고(남의 계좌 포함 · T-25-24) 사용자
 *         세션의 83(②)만 계좌 필터 뒤 캐시한다 — 사용자 경로는 그대로다. 83 은 키가 dirty 일 때만 나가므로 조용한 키(체결 없는
 *         상한가)는 29 가 성립할 때 서버가 부르는 `m_queueTracker.RequestResend(key)`(:1487 신규 · :1507 level 덮어쓰기)로만 다시
 *         나온다. 사용자 세션이 더는 29 를 보내지 않으므로, 넛지 없이 가면 A 가 보고 있는 조용한 종목을 B 가 열었을 때 B 의
 *         대기 주문 진행률이 다음 체결까지 빈다(quick-260930-d43 이 고친 증상).
 *         넛지 = quote 연결로 **같은 실효 level 의 29(subscribe=true) 1건**(28 · 32 없음 · 서버 level 덮어쓰기 → RequestResend →
 *         다음 틱 83 이 그 사용자의 계좌 세션 ②에 닿는다). 보내는 때는 둘이다.
 *           · 어떤 사용자가 **이 DMA 세션에서 처음** 참조하는 키가 이미 업스트림(live 또는 linger)일 때 — 단 같은 호출이
 *             이미 29 를 보내는 승격 · 강등이면 그 29 가 같은 효과라 넛지하지 않는다.
 *           · 사용자 세션이 Ready 로 (재)진입할 때 그 사용자가 쥔(참조 > 0) 키마다 — 계좌 선언 전의 넛지는 ②에 닿지 않을 수 있다.
 *         같은 사용자의 복귀(탭 전환 · 새로고침 · linger 안 복귀)는 넛지 0 이다(D-10 — 28 · 29 · 32 재요청 없이 캐시로 그린다).
 *         그래서 사용자별 참조(`#userRefs`)는 참조 0 이 돼도 항목을 남기는 **「본 키」 기억**이다. 본 키는 그 키가 업스트림에서
 *         완전히 풀리거나(`#releaseKey`) 그 사용자의 DMA 세션이 교체될 때(`#clearCaches` — 83 캐시도 같이 비므로) 지운다.
 *         넛지는 응답이 없는 29 라 페이서 창을 점유하지 않고, 그 키 구독이 아직 대기열에 있으면 합쳐진다(`"nudge"`).
 *         quote 연결이 Ready 가 아니면 보내지 않는다 — ready 의 합집합 재구독 29 가 같은 효과다.
 *   D-12  전략(상따 전수 · VI 설정 · VI 주문 추적)도 **세션 단위 캐시**를 여기 둔다.
 *         사용자당 DMA 세션이 1개이므로 「그 사용자의 전략이 지금 무엇인가」를 아는 객체도
 *         하나여야 한다. 캐시가 있어야 새 탭이 붙자마자 **종목 구독 없이** 전략을 본다 —
 *         계좌 캐시(D-23/D-37)와 같은 이유이고 같은 4점 세트(맵 · 프리페치 · case · 폐기)다.
 *   D-13  전략 재조회는 **재접속(`ready`) 시에만** 일어난다. 주기 타이머·수동 새로고침
 *         진입점을 만들지 않는다 — 사용자 조작에 대한 60/61 에코는 Notice(유실 없음)라
 *         재조회로 메울 것이 없고, 폴링은 게이트웨이 왕복을 사용자 수에 비례시킨다.
 *   Pitfall 4  시세 재구독 트리거는 **quote 연결의 `ready` 하나뿐**이다(전역 참조계수 합집합을 실효 level 로).
 *              사용자 세션 `ready` 는 시세를 건드리지 않는다 — 계좌 · 전략 · 83 재동기화 · 종목마스터만 한다
 *              (D-03 폴백 없음 · D-08). 재구독 경로를 두 벌 만들면 "재접속 후 새로고침해야 시세가 나온다"
 *              증상이 생기고, 사용자 세션으로 시세를 되걸면 per-user 경로가 폴백으로 되살아난다.
 *   T-15-02  **사용자 데이터**(계좌 · 주문 · 전략 · 83 · 54 · 77 · 76/78)는 `{userId, msg}` 로만 나간다(`"fanout"`).
 *            전역 브로드캐스트 경로를 사용자 데이터에 **만들지 않는 것**이 타인 체결·잔고 유출의 구조적 방어다.
 *            공개 시세(q · tape)는 `"market"` **한 경로**로 나가고, 그 페이로드 타입을 `RelayQuote | RelayTape` 로
 *            좁혀 사용자 데이터가 이 경로를 탈 수 없게 컴파일 단계에서 막는다(Phase 26 T-26-01 재정의).
 *   S-5      구독 실패·이중 해제·세션 부재는 전부 사유와 함께 로그를 남긴다.
 *
 * quote 연결(`HubQuoteFeed`)로 오는 프레임 — `#onFeedFrame` 의 명시 case 표 (PC-12 · Phase 26):
 *   58/59 GetQuoteResp · QuoteUpdate   → 전역 스냅샷 캐시 + `"market"` (q)
 *   69/71 TradeTapeResp · TradeTapePush → 전역 링버퍼 + 전역 200ms 배치 + `"market"` (tape · full 소켓만)
 *   79    ObserverLoginResp            → 무시 (feed 가 스스로 소비한다)
 *   76/78 RateCrossAlert · Snapshot    → 무시 (돌파 원천은 사용자 세션 그대로 — RESEARCH Open Q2 RESOLVED 무시안)
 *   83    QueueProgress                → 무시 (사용자 세션 ② 경로가 계좌 필터 뒤 캐시 — Pattern 10 ① · T-25-24)
 *   54/77/80 ServerMessage · QueuedWindowState · JournalBatch → warn (quote 연결에 오지 않는 프레임)
 *   그 밖                              → `default:` — `unhandledFrameCount` 계수 (PC-12 게이트 공유)
 * 반대로 **사용자 세션**으로 58/59/69/71 이 오면 구독이 없으니 이상 신호다 — 명시 case warn 뒤 버린다.
 *
 * 캐시에 담는 형태는 **이미 Number 로 좁혀진 wire JSON**(`RelayQuote`/`RelayTapeEntry`)이다.
 * 게이트웨이의 64비트 정수 변환은 `envelope.ts` 파서가 한 번만 하고, 여기서는 매 push 마다
 * 재변환하지 않는다 (D-34).
 *
 * 하지 않는 것:
 *   - 소켓을 모른다. 어떤 소켓에 보낼지는 `ws/fanout.ts` 가 `userId`(사용자 데이터) · 키 구독자 색인(시세)으로 정한다.
 *   - 세션 · quote 연결을 만들거나 닫지 않는다. 그것은 `SessionManager` · 부팅(`index.ts`) 소관이다.
 *   - 구독 요청을 한꺼번에 쏘지 않는다 — 구독 요청은 in-flight 창 큐(`SubscribePacer` · 창 32 키 · 응답(FULL=69 · PRICE=58)
 *     또는 3초)를 거친다(Phase 26 Pitfall 3 — 재접속 합집합 재구독 burst 가 서버 Notice 큐 1024 프레임 / 4MB 를 넘기면
 *     quote 연결이 끊겨 재접속 → 같은 burst 루프가 된다). 응답이 없는 29(해제 · 강등)는 창 밖으로 즉시 나간다.
 *     quote 연결 Ready 이전 구독은 참조계수에만 남고 quote 연결 `ready` 가 `reset` 뒤 합집합으로 복원한다.
 */
import { EventEmitter } from "node:events";

import type {
  RelayAccount,
  RelayAccountState,
  RelayExchange,
  RelayLimitChaser,
  RelayOrderMsg,
  RelayOutbound,
  RelayQueueProgressItem,
  RelayQueuedWindowMsg,
  RelayQuote,
  RelayRateCrossItem,
  RelaySubLevel,
  RelayTape,
  RelayTapeEntry,
  RelayUnfProgressEntry,
  RelayUserSettingsMsg,
  RelayViNoticeMsg,
  RelayViOrderItem,
  RelayViTrigger,
} from "@gh-radar/shared";

import { logger } from "../logger.js";
import type { TransportFrameEvent } from "../dma/dma-client.js";
import type { SessionReadyEvent } from "../dma/session.js";
import {
  MAX_TAPE_ENTRY_COUNT,
  QUOTE_LEVEL,
  buildGetAccountStateReq,
  buildGetLimitChaserListReq,
  buildGetUserSettingsReq,
  buildGetVIOrderListReq,
  buildGetVITriggerReq,
  buildSubscribeQuoteReq,
  maskAccountNo,
  parseAccountState,
  parseDisableStrategiesResp,
  parseLimitChaserEcho,
  parseLimitChaserList,
  parseOrderResp,
  parseQueueProgress,
  parseQueuedWindowState,
  parseQuoteState,
  parseRateCrossAlert,
  parseRateCrossSnapshot,
  parseServerMessage,
  parseSymbolMasterFrame,
  parseTradeTape,
  parseUserSettings,
  parseViOrderList,
  parseViOrderNotice,
  parseViTrigger,
  type ParsedOrderResp,
  type ParsedSymbolMasterFrame,
  type QueueProgressFrame,
} from "../dma/envelope.js";
import { MSG } from "../dma/msg-type.js";
import type { SymbolLookup } from "../store/symbols.js";
import { SubscribePacer } from "./subscribe-pacer.js";

// ============================================================
// 상수 정본
// ============================================================

/**
 * 체결 테이프 배치 주기(ms) = 200 (D-35).
 * 시세(호가)는 여기를 타지 않는다 — 업스트림 코얼레싱을 그대로 통과시킨다.
 */
export const TAPE_BATCH_MS = 200;

/**
 * 체결 테이프 링버퍼 상한(건). 파서 상한(`MAX_TAPE_ENTRY_COUNT` = 200건)과 **같은 값**을
 * 참조한다 — 두 곳에 수치를 따로 적으면 한쪽만 고쳐진다 (IN-01).
 * 브라우저 훅(`use-relay-socket.ts` 의 `MAX_TAPE`)도 같은 값이다.
 */
export const TAPE_RING_SIZE = MAX_TAPE_ENTRY_COUNT;

/** `GetTradeTapeReq(32)` 로 요청하는 초기 체결 건수. 링버퍼 상한과 같다. */
export const TAPE_REQUEST_COUNT = TAPE_RING_SIZE;

/**
 * PRICE 소켓 키당 최소 송신 간격(ms) = 100 (Phase 26 D-05).
 *
 * gh-trade `server/src/market/publish/MarketPublisher.h:159` `kPriceLevelMinIntervalMs = 100` 의 복제다 —
 * quick-260923-hp5 에서 200→100 으로 내려 퍼블리셔 코얼레싱 틱 1개와 같아졌다. 회신 문서
 * (`tasks/gh-trade-price-only-quote-subscription-reply.md`)의 「200ms」 는 hp5 이전 값이라 낡았다.
 */
export const PRICE_MIN_INTERVAL_MS = 100;

/**
 * 마지막 소비자가 떠난 키의 구독 · 캐시 유지 시간(ms) = 15초 (Phase 26 D-10 · RESEARCH A3).
 *
 * D-10 재량(10~30초) 중 15초다 — 새로고침 왕복(2~3초 · session-manager.ts D-15 근거)과 탭 전환을 흡수하면서,
 * 소비자 없는 키가 전역 2000 슬롯(D-11)을 점유하는 시간은 짧게 둔다. 운영값은 `QUOTE_LINGER_MS`(config)로 덮을 수 있고
 * e2e 는 0(즉시 해제 — 테스트 간 전역 캐시 격리)을 쓴다.
 */
export const LINGER_MS = 15_000;

/**
 * quote 연결 하나의 업스트림 구독 키(`isin|ex` · live + linger) 상한 = 2000 (Phase 26 D-11).
 *
 * gh-trade `inline constexpr size_t kMaxObserverSubsPerConn = 2000;`(MarketPublisher.h:94) 복제다. 서버 ApplySubscribe 는
 * 초과분을 `++m_subLimitRejectCount; return;` 로 **무음 무시**한다(RESEARCH Pitfall 5) — 그래서 relay 가 송신 전에 막는다.
 * 서버의 「그 연결이 구독 중인 키」 = relay `#refs` 의 키 전부(linger 포함)라 같은 집합을 센다.
 */
export const QUOTE_SUB_LIMIT = 2000;

/**
 * 한 사용자(모든 탭 합산)가 참조하는 서로 다른 `isin|ex` 키 상한 = 200 (Phase 26 D-15).
 *
 * 종전 사용자 세션의 서버 상한 `inline constexpr size_t kMaxSubsPerConn = 200;`(MarketPublisher.h:88)과 같은 수다.
 * 사용자 세션이 종목을 구독하지 않게 되면서(D-08) 사라진 세션당 200 을 relay 가 메운다 — 없으면 한 사용자(버그 탭 ·
 * 악성 탭)가 전역 2000 을 다 채워 다른 사용자가 새 종목을 못 연다(RESEARCH Security 「한 사용자가 2000 키 독점」).
 */
export const USER_SUB_LIMIT = 200;

/**
 * `subscribe` 판정 결과 (D-11 · D-15). `"ok"` 가 아니면 참조계수 · 업스트림 모두 무변경이다.
 *   · `"limit-user"`   — 그 사용자에게 새 키인데 사용자 키 수가 `USER_SUB_LIMIT` 에 닿았다.
 *   · `"limit-global"` — 업스트림에 없는 새 키인데 업스트림 키(live + linger)가 `QUOTE_SUB_LIMIT` 에 닿았고 풀 linger 키도 없다.
 */
export type HubSubscribeResult = "ok" | "limit-user" | "limit-global";

/**
 * 두 시세의 **가격 섹션**이 같은가 (Phase 26 D-05 — 서버 `kDirtyPriceMask` 의 relay 복제).
 *
 * 서버는 섹션별 dirty 비트(`kDirtyPriceMask = kDirtyTrade | kDirtyVI | kDirtyClose` · 호가 제외)로 판정하지만
 * 와이어의 59 는 비트 없이 전체 상태를 싣는다 — 그래서 직전 캐시와 가격 섹션 필드를 비교한다.
 *
 * | 섹션 (서버 dirty)   | 서명 포함 필드                 | 비고 |
 * |---------------------|--------------------------------|------|
 * | A3 체결 (Trade=2)   | `p o h l c cs cr v va`         | 체결마다 `v`(누적거래량)가 오르므로 체결 틱은 반드시 다르다 |
 * | R8 VI (VI=4)        | `viu vid`                      | VI 상태 · 종류는 와이어에 없다 → 상태만 바뀐 R8 은 못 본다(D-05 편차) |
 * | A6 종가 (Close=8)   | `kc`                           | |
 * | 버스트 상한가       | `bul`                          | 서버가 체결 섹션(kDirtyTrade)으로 표시 — QuoteStore ResetAllBurstLimit (quick-261003-rc4) |
 * | B6 호가 (Book=1)    | — (`ap aq bp bq ta tb` 제외)   | 호가만 바뀐 틱은 PRICE 소켓에 가지 않는다 |
 * | 체결 시각           | — (`et` 제외)                  | B6 호가 갱신도 이 칸을 덮어쓴다 — 넣으면 호가 틱이 샌다(RESEARCH Pitfall 4) |
 * | 마스터 정적         | — (`ul ll base ls` 제외)       | 가격 섹션 갱신과 무관 |
 *
 * 문자열 조립 대신 필드 13개를 직접 비교한다 — 초당 수백 프레임 경로다.
 */
export function samePriceSection(a: RelayQuote, b: RelayQuote): boolean {
  return (
    a.p === b.p &&
    a.o === b.o &&
    a.h === b.h &&
    a.l === b.l &&
    a.c === b.c &&
    a.cs === b.cs &&
    a.cr === b.cr &&
    a.v === b.v &&
    a.va === b.va &&
    a.viu === b.viu &&
    a.vid === b.vid &&
    a.kc === b.kc &&
    a.bul === b.bul
  );
}

// ============================================================
// 계약
// ============================================================

/**
 * Hub 가 세션에 요구하는 최소 표면. `DmaSession` 이 그대로 만족한다.
 *
 * 구체 클래스가 아니라 이 인터페이스에 의존하는 이유는 테스트가 소켓 없이 프레임을
 * 주입할 수 있어야 하기 때문이다 — 세션 상태기계 자체는 15-03 이 이미 증명했다.
 */
export interface HubSession {
  /** gh-radar 사용자 id. 팬아웃 대상 선택의 유일한 기준이다 (T-15-02). */
  readonly userId: string;
  /** 운용 준비 여부. false 면 계좌 · 전략 요청을 보내지 않는다(종목 구독은 Phase 26 부터 quote 연결 몫). */
  readonly isReady: boolean;
  /**
   * 세션 허용 계좌 (Phase 25-06). `DmaSession.allowedAccounts` 가 구조적으로 만족한다 — 게이트웨이 응답과
   * 대조된 목록이 유일한 근거다(T-16-01 동형).
   *
   * 잔량진행률(83)은 Broadcast 라 시세만 구독한 세션에도 **남의 계좌 항목**이 실린다(gh-trade D-19).
   * hub 는 이 목록으로 항목을 거른 뒤에만 캐시 · 팬아웃한다. **없으면 진행률 항목을 전부 거른다**
   * (fail-closed · T-19-02 동형 · T-25-24).
   */
  readonly allowedAccounts?: readonly RelayAccount[];
  /** 게이트웨이 요청 프레임 송신. */
  send(payload: Uint8Array): boolean;
  on(event: "frame", listener: (e: TransportFrameEvent) => void): unknown;
  on(event: "ready", listener: (e: SessionReadyEvent) => void): unknown;
}

/**
 * 게이트웨이 종목마스터 보조 원천(quick-260923-cqj)이 hub 에 요구하는 표면.
 * `GatewaySymbolMaster` 가 구조적으로 만족한다 — 테스트는 스텁을 넣을 수 있다.
 */
export interface HubSymbolMasterFeed {
  /** 세션 Ready. relay 전체 1일 1회 게이팅은 피드가 쥔다(사용자별 재조회가 아니다). */
  onSessionReady(session: HubSession): void;
  /** 57 한 프레임(파싱 실패는 `null`)과 그 프레임이 온 세션의 userId. */
  onFrame(userId: string, frame: ParsedSymbolMasterFrame | null): void;
}

/**
 * Hub 가 **시세 업스트림 송신자**(quote 연결)에 요구하는 표면 (Phase 26 D-12).
 *
 * `HubSession` 에서 `userId` · `allowedAccounts` 를 뺀 것이다 — quote 연결은 사용자가 아니고 계좌를 선언하지 않는다.
 * `QuoteFeed`(relay/src/quote/feed.ts)가 구조적으로 만족하고, 테스트는 소켓 없이 바이트를 되읽는 가짜를 넣는다.
 */
export interface HubQuoteFeed {
  /** 로그인(79 role 1)까지 끝나 요청(28/29/32)을 보내도 되는가. false 면 참조계수만 기록한다. */
  readonly isReady: boolean;
  /** 게이트웨이 요청 프레임 송신. */
  send(payload: Uint8Array): boolean;
  on(event: "frame", listener: (e: TransportFrameEvent) => void): unknown;
  /** (재)로그인 완료 — 전역 참조계수 합집합 재구독의 **유일한** 트리거다 (Pitfall 4 재정의). */
  on(event: "ready", listener: () => void): unknown;
}

/** 팬아웃 1건. **대상은 언제나 특정 userId 하나**다 (T-15-02) — 사용자 데이터 전용 경로다. */
export type HubFanoutEvent = { userId: string; msg: RelayOutbound };

/**
 * 공개 시세 1건 (Phase 26 D-06 · D-12). **대상은 사용자가 아니라 키**(`isin|ex`)다 — fanout 이 키 구독자 색인으로
 * 그 키를 잡은 소켓에만 보내고, 소켓 level 로만 거른다.
 *
 * 페이로드를 `RelayQuote | RelayTape` 로 **좁혀** 선언한다 — 계좌 · 주문 · 전략 · 83 같은 사용자 데이터는 타입상
 * 이 경로에 실을 수 없다(T-15-02 를 「사용자 데이터 격리」 로 재정의 · T-26-01). 넓히지 말 것.
 */
export type HubMarketEvent = {
  /** `${isin}|${ex}` — fanout `keyOf` 와 같은 형식. */
  key: string;
  msg: RelayQuote | RelayTape;
  /** full 소켓에 보낼지. */
  full: boolean;
  /**
   * price 소켓에 보낼지 (D-06 — 키 단위 1회 판정 결과). tape 는 언제나 false(71 은 price 소켓에 가지 않는다).
   * q 는 서버 PRICE 규칙 복제 판정기(D-05 · `#priceFlag`)가 정한다 — 58 · 업스트림 PRICE 키는 참, FULL 업스트림 키는
   * 가격 섹션이 바뀌고 100ms 간격이 찼을 때만 참. 지연 방출은 `{ full: false, price: true }` 로 따로 온다.
   */
  price: boolean;
};

/**
 * 주문 통보 1건 (`OrderResp(51)`), **파싱된 원문 그대로**.
 *
 * 브라우저로 나가는 `{t:"order"}` 팬아웃과 **별도**로 낸다. 팬아웃은 계약 타입(`RelayOrderMsg`)
 * 이라 상관에 필요한 값(`sideTrusted` 등)이 빠져 있기 때문이다. 이 이벤트는 order-handler 의
 * rid 즉시응답 상관 전용이고, `{t:"order"}` 팬아웃은 브라우저 토스트·전략 로그 표면 전용이다
 * (Phase 19 D-01·D-03 — 기록은 관찰자 기록기 단독). 팬아웃이 먼저이고 이 이벤트가 나중이다.
 */
export type HubOrderEvent = { userId: string; notice: ParsedOrderResp };

/** `/healthz` 용 요약. 식별자(userId·ISIN)를 담지 않는다. */
export type HubStats = {
  sessionCount: number;
  /**
   * **live** 시세 키 수 — 소비자(참조계수 합계 ≥1)가 있는 전역 `isin|ex` 키. linger 키는 빼고 센다
   * (`#refs.size - #lingering.size`). 업스트림 구독 키 수 = `subscriptionCount + lingerCount`.
   */
  subscriptionCount: number;
  /** linger 중인 키 수 (D-10) — 소비자 0 이지만 업스트림 구독 · 캐시를 아직 유지하는 키. */
  lingerCount: number;
  cachedQuoteCount: number;
  /** 캐시된 계좌 상태 **개수**. 계좌번호는 담지 않는다. */
  cachedAccountCount: number;
  /** 캐시된 상따 전략 **개수**. ISIN·계좌번호는 담지 않는다 (D-12). */
  cachedLimitChaserCount: number;
  /** VI 전략을 **조회한 적이 있는** 사용자 수. 미등록(`null`)도 1로 센다. */
  cachedViTriggerCount: number;
  /** 캐시된 VI 주문 추적 **개수**. */
  cachedViOrderCount: number;
  /** 캐시된 등락률 돌파 above 원소 **개수**. ISIN 은 담지 않는다 (17-03). */
  cachedRateCrossCount: number;
  /**
   * `#onFrame` 의 `default:` 도달 누적 수 (T-17-10).
   * **운영에서도 0 이어야 한다** — 0 이 아니면 받아 줄 case 없는 번호가 유입되고 있다.
   */
  unhandledFrameCount: number;
  /**
   * 구독 한도 거부 누적 수 (D-11 전역 · D-15 사용자 합산). healthz quote 필드의 원천(26-12).
   * 서버 `m_subLimitRejectCount` 와 달리 relay 는 송신 **전에** 거부하므로 서버 쪽 계수는 0 으로 남아야 한다.
   */
  subLimitRejects: number;
};

export interface SubscriptionHub {
  on(event: "fanout", listener: (e: HubFanoutEvent) => void): this;
  on(event: "market", listener: (e: HubMarketEvent) => void): this;
  on(event: "order", listener: (e: HubOrderEvent) => void): this;
  emit(event: "fanout", e: HubFanoutEvent): boolean;
  emit(event: "market", e: HubMarketEvent): boolean;
  emit(event: "order", e: HubOrderEvent): boolean;
}

/** 플러시 대기 중인 체결 배치 1건. */
type PendingTape = {
  isin: string;
  exchange: RelayExchange;
  /** true 면 전량 교체(69 스냅샷)로 나간다. */
  snap: boolean;
  entries: RelayTapeEntry[];
};

/** 키당 level 별 참조계수 (quick-260923-ge2). */
type SubRefs = { full: number; price: number };

/**
 * 키당 PRICE 게이트 (Phase 26 D-05 · D-06) — 서버 `subs.priceSentTick` · `subs.pricePending` 의 relay 복제.
 * FULL 업스트림 키에 price 소비자가 있을 때만 존재한다. 타이머는 키당 최대 1개다(T-26-11).
 */
type PriceGate = {
  /** 마지막으로 price 소켓에 통과시킨 시각(`Date.now()`). */
  lastPriceSentMs: number;
  /** 가격 섹션 갱신이 억제된 채 남아 있는가 — 다음 허용 시점에 최신 상태로 나간다. */
  pending: boolean;
  timer: NodeJS.Timeout | null;
};

/**
 * linger 표식 (Phase 26 D-10) — 소비자 0 이 된 키가 업스트림 구독 · 캐시를 유지하는 동안의 상태. 키당 타이머 1개(T-26-12).
 */
type Linger = {
  /** 만료 타이머 — `#releaseKey(key, "linger 만료")`. */
  timer: NodeJS.Timeout | null;
  /** linger 에 들어간 시각(`Date.now()`) — 26-09 가드가 가장 오래된 linger 키부터 풀 때 쓴다. */
  since: number;
  /** linger 당시 업스트림 실효 level — 복귀 시 승격 · 강등 판정 기준. */
  level: RelaySubLevel;
};

/**
 * 사용자 한 명의 「본 키」 기억 (D-15 · Phase 26 Pattern 10 · 26-11). 참조 0 도 항목으로 남아 「이 DMA 세션에서 본 키」 를 뜻한다.
 */
type UserKeys = {
  /** `marketKey` → 그 사용자의 탭 · level 합산 참조 수(0 = 본 키 · 지금은 쥐지 않음). */
  held: Map<string, number>;
  /** 참조 > 0 인 키 수 — `USER_SUB_LIMIT` 판정 대상. */
  active: number;
};

function totalRefs(refs: SubRefs): number {
  return refs.full + refs.price;
}

/** 업스트림 실효 level — FULL 소비자가 하나라도 있으면 FULL. */
function effectiveLevel(refs: SubRefs): RelaySubLevel {
  return refs.full > 0 ? "full" : "price";
}

/**
 * 시세 구독 키 (Phase 26 D-12). **전역**이다 — fanout `keyOf` 와 같은 `${isin}|${exchange}` 형식.
 * 참조계수(`#refs`) · 스냅샷(`#quotes`) · 체결 링버퍼(`#tapes`) · 테이프 배치(`#pendingTapes`)가 이 키를 쓴다.
 * 이력: Phase 15 D-13 의 3단 키(userId 포함)는 이 빅뱅에서 내렸다 — 사용자별 3단 키는 `progressKey` 하나다.
 */
function marketKey(isin: string, exchange: RelayExchange): string {
  return `${isin}|${exchange}`;
}

/**
 * 잔량진행률(83) 캐시 키 (25-06) — `${userId}|${isin}|${exchange}` 3단 형식. **83 `#queueProgress` 전용**이다.
 * 사용자별인 이유는 항목이 그 사용자 세션의 허용 계좌로 걸러진 부분집합이기 때문이다(T-25-24) — 공유하면 남의 계좌가 샌다.
 */
function progressKey(userId: string, isin: string, exchange: RelayExchange): string {
  return `${userId}|${isin}|${exchange}`;
}

/** 키 접두어. 특정 사용자의 키만 훑을 때 쓴다. */
function userPrefix(userId: string): string {
  return `${userId}|`;
}

/**
 * 상따 캐시 키. **`item.key` 를 그대로 쓴다** — 재조립하지 않는다.
 *
 * 전략 키(`ISIN:계좌:거래소`)의 조립 지점은 `envelope.ts` 의 `strategyKey()` 하나뿐이다.
 * 여기서 다시 만들면 12자 절단·거래소 정규화 중 한쪽만 반영돼 키가 갈리고, 갈린 키는
 * 「에코가 영원히 매칭되지 않는다」라는 조용한 실패가 된다.
 */
function lcKey(userId: string, item: RelayLimitChaser): string {
  return `${userId}|${item.key}`;
}

/**
 * 등락률 돌파 above 집합 캐시 키 (17-03 · quick-260926-rcc).
 *
 * 키는 **ISIN 하나**다 — 거래소를 넣지 않는다. gh-trade quick-260923-cfo 결정 A 로 서버 상태가
 * ISIN 당 1개이고, 76 의 exchange 는 발화 체결의 거래소 · 78 원소의 exchange 는 above 구간을
 * 연 거래소(KRX 접속매매 세션이 닫힌 시간의 NXT 접속매매도 판정하므로 NXT 일 수 있다)다.
 * 그래서 **뒤에 온 76 이 거래소째 덮는다**. 거래소를 키에 두면 KRX 행 뒤 NXT 재돌파가 다음
 * 78 까지 두 원소로 남는다. 브라우저 리듀서 `upsertRateCross` · 스트립 `breakoutKey` 가 같은 축이다.
 * 앞에 `userId` 를 붙이는 것은 `progressKey` 와 같은 규율이다 (T-17-08).
 */
function rateCrossKey(userId: string, isin: string): string {
  return `${userId}|${isin}`;
}

/**
 * 등락률 돌파 목록 정렬 — **`exchangeTime` 내림차순 · 동률이면 `isin` 오름차순** (사본 정렬).
 *
 * 사용자 결정 2026-09-22 — 최신 돌파가 맨 위. 서버 78 원순서(오름차순)와 무관하게 relay 가
 * 내리는 순서는 이 헬퍼 한 곳이 정한다 (인증 직후 스냅샷 `getRateCrossItems` · 78 팬아웃).
 * 웹 리듀서 `sortRateCross`(webapp `use-relay-socket.ts`)가 같은 축이다 — 한쪽만 바꾸면 76/78
 * 경로의 순서가 갈린다 (D-14).
 *
 * `exchangeTime` 은 above 구간을 **연** 시각이라, 같은 구간 안의 76 갱신은 자리를 지키고
 * 이탈 후 재돌파(새 구간)만 맨 위로 오른다. 캐시(`#rateCrossItems`)는 정렬하지 않는다.
 */
function sortRateCrossNewestFirst(items: readonly RelayRateCrossItem[]): RelayRateCrossItem[] {
  return [...items].sort((a, b) =>
    a.exchangeTime === b.exchangeTime
      ? a.isin.localeCompare(b.isin)
      : b.exchangeTime.localeCompare(a.exchangeTime),
  );
}

/**
 * VI 주문 캐시 키. 정본은 `orderNo` 지만 **접수 전에는 그 값이 `""`** 라 키가 되지 못한다
 * (파서가 `""` 를 보존하는 이유 — 빈 주문번호로는 확인 체크를 열 수 없다).
 *
 * 그 한 경우에만 `viPendingKey` 복합키로 대신한다.
 *
 * ⚠️ **주문번호가 있는 행의 키에는 거래소를 덧붙이지 않는다** (17-05 / T-17-18). 주문번호는
 *    이미 유일하고, 여기에 거래소를 더하면 72 스냅샷과 73 델타가 서로 다른 거래소 표기를
 *    실어 올 때 키가 갈려 **같은 주문이 두 줄로** 남는다. 거래소가 필요한 곳은 주문번호가
 *    아직 없는 대체 키뿐이다.
 */
function viOrderKey(userId: string, item: RelayViOrderItem): string {
  if (item.orderNo !== "") return `${userId}|${item.orderNo}`;
  return viPendingKey(userId, item);
}

/**
 * 접수 전 항목의 자리표시 키. 주문번호가 붙는 순간 이 키를 **지우고** 주문번호 키로 옮긴다 —
 * 지우지 않으면 같은 주문이 「접수 전」과 「접수됨」 두 줄로 남는다.
 *
 * **거래소가 키의 일부다** (17-05 / D-06). R8 해제·연장 전문 매칭이 ISIN+거래소라 같은 종목이
 * KRX·NXT 양쪽에서 발동할 수 있고, 그 두 발동은 ISIN·계좌·발동가가 모두 같을 수 있다.
 * 거래소를 빼면 두 행이 한 줄로 겹쳐 **한쪽 주문이 화면에서 사라진다**.
 */
function viPendingKey(userId: string, item: RelayViOrderItem): string {
  return `${userId}|@${item.isin}:${item.accountNo}:${item.triggerPrice}:${item.exchange}`;
}

/**
 * VI 전략 캐시 키 (17-05 / D-06). 서버가 **거래소별 1건**으로 관리하므로 캐시도 거래소별이다.
 *
 * `userId` 만으로 키를 잡으면 NXT 응답이 KRX 행을 덮어 「KRX 에 등록했는데 NXT 설정이 보인다」가
 * 된다. 앞에 `userId` 를 붙이는 규율은 `progressKey` 와 같다 (T-16-02).
 */
function viTriggerKey(userId: string, exchange: RelayExchange): string {
  return `${userId}|${exchange}`;
}

/**
 * Ready 프리페치가 VI 전략을 조회하는 거래소 (17-05 / D-06).
 *
 * **순서가 곧 FIFO 귀속 순서**다 — 빈 61 에는 거래소가 없어 요청 순서가 유일한 근거이므로,
 * 여기 순서와 `#pendingViGets` 에 넣는 순서가 어긋나면 두 칸이 통째로 바뀐다.
 */
const VI_PREFETCH_EXCHANGES: readonly RelayExchange[] = ["KRX", "NXT"];

/**
 * 이름 없는(`undefined`·`""`) 행에만 종목명(과 선택적으로 단축코드)을 채운다 (`refreshNames` 전용).
 *
 * 기존 보강(`#enrichNames` 등)을 재사용하지 않는 이유: 그쪽은 이미 이름이 있는 행도 덮어쓰고
 * 미해석 로그를 남긴다. 여기서는 「이번에 새로 풀린 행」만 골라야 재방송 대상이 정확하다.
 * 바뀌지 않으면 **같은 참조**를 돌려준다 — 호출부가 참조 비교로 변경을 판정한다.
 */
function fillMissingName<T extends { isin: string; name?: string; code?: string }>(
  symbols: SymbolLookup,
  row: T,
  withCode: boolean,
): T {
  if (row.name !== undefined && row.name !== "") return row;
  const info = symbols.lookup(row.isin);
  if (info === undefined) return row;
  return withCode ? { ...row, name: info.name, code: info.code } : { ...row, name: info.name };
}

/**
 * 구독 참조계수 + 스냅샷 캐시의 단일 정본.
 *
 * 사용법: 부팅에서 `attachFeed(quoteFeed)` 1회 · 세션을 얻은 직후 `attach(session)` → 브라우저 `sub`/`unsub` 마다
 * `subscribe`/`unsubscribe` → 시세는 `"market"`(키 단위 · fanout 키 구독자 색인), 사용자 데이터는 `"fanout"`
 * (그 userId 의 소켓 집합에만).
 */
export class SubscriptionHub extends EventEmitter {
  /** userId → 세션. 세션이 교체되면 여기가 정본이고 옛 리스너는 침묵한다. */
  readonly #sessions = new Map<string, HubSession>();
  /**
   * 시세 업스트림 송신자 (Phase 26 D-12) — quote 연결 하나. 없으면(부팅 결선 전 · 비밀 없음) 참조계수만 기록한다.
   * 교체되면 여기가 정본이고 옛 feed 의 리스너는 정본 대조로 침묵한다(세션 규율 동형).
   */
  #feed: HubQuoteFeed | null = null;
  /**
   * quote 연결 구독 요청 페이서 (Phase 26 Pitfall 3 · 26-10) — 28/29/32 는 in-flight 창을 거치고, 응답 없는 29 는 창 밖이다.
   * 송신 대상은 언제나 현재 `#feed` 다. quote `ready`(합집합 재구독) · feed 교체 · `closeAll` 에서 `reset` 한다.
   */
  readonly #pacer: SubscribePacer;
  /** 진행 중인 합집합 재구독(시작 시각 · 키 수 · 시작 시점 타임아웃 누적) — 완료 · 중단 로그용. 없으면 null. */
  #resubscribeRun: { keys: number; startedAt: number; timeoutsAtStart: number } | null = null;
  /**
   * `marketKey` (`${isin}|${exchange}` · 전역) → level 별 참조계수 (quick-260923-ge2 · Phase 26 D-12).
   * linger 키(D-10)도 합계 0 인 항목으로 **남는다** — 업스트림 구독 키 집합 = `#refs` 의 키 전부(live + linger).
   */
  readonly #refs = new Map<string, SubRefs>();
  /** `marketKey` → linger 표식 (D-10). 이 맵의 키는 모두 `#refs` 에 합계 0 으로 있다. */
  readonly #lingering = new Map<string, Linger>();
  /** linger 유지 시간(ms). 0 이하면 1→0 즉시 해제(26-03 동작 — e2e 격리용). */
  readonly #lingerMs: number;
  /**
   * 사용자별 「본 키」 기억 (D-15 · Pattern 10) — userId → 그 사용자가 **이 DMA 세션에서 본 키**와 현재 참조 수. 참조가 0 이
   * 돼도 항목을 남긴다(같은 사용자의 복귀는 넛지 0 · D-10). `USER_SUB_LIMIT` 은 참조 > 0 인 키 수(`active`)로만 판정한다.
   * 본 키는 `#releaseKey`(업스트림 완전 해제)와 `#clearCaches`(세션 교체)에서 지우고, 빈 사용자 항목도 지운다.
   */
  readonly #userRefs = new Map<string, UserKeys>();
  /** 전역 업스트림 키 상한 (D-11). 생성자 `limits.global` 로 테스트 주입. */
  readonly #globalLimit: number;
  /** 사용자당 키 상한 (D-15). 생성자 `limits.user` 로 테스트 주입. */
  readonly #userLimit: number;
  /** 구독 한도 거부 누적 수 (`stats().subLimitRejects`). */
  #subLimitRejects = 0;
  /** 전역 스냅샷 캐시(`marketKey`) — 이미 Number 로 좁혀진 wire JSON 이다 (D-34/D-37). linger 만료 · 재접속 정리에서 지운다. */
  readonly #quotes = new Map<string, RelayQuote>();
  /**
   * `marketKey` → PRICE 게이트 (D-05 · D-06). FULL 업스트림 + price 소비자가 있는 키만 둔다 — price 이탈 · FULL→PRICE
   * 강등 · 1→0 · `closeAll` 에서 타이머와 같이 지운다(`#dropPriceGate`).
   */
  readonly #priceGates = new Map<string, PriceGate>();
  /** 전역 체결 링버퍼(`marketKey` · 키당 최근 `TAPE_RING_SIZE` 건). `#releaseKey` 에서 지운다. */
  readonly #tapes = new Map<string, RelayTapeEntry[]>();
  /** `marketKey` → 플러시 대기 배치 (전역). */
  readonly #pendingTapes = new Map<string, PendingTape>();
  /** 전역 배치 타이머 **1개** (키 · 사용자 단위로 만들지 않는다 — D-35). */
  #tapeFlushTimer: NodeJS.Timeout | null = null;
  /**
   * `${userId}|${accountNo}` → **누적 반영된 전량 스냅샷** (D-23/D-37).
   *
   * 델타(67)를 받아도 여기에는 항상 `snap:true` 인 전량 뷰를 둔다 — 새 탭이 붙었을 때
   * 그대로 1프레임으로 내려보낼 수 있어야 하기 때문이다. 와이어로 나가는 델타는
   * 가공하지 않고 원본 그대로 흘린다(브라우저가 같은 병합을 한다).
   */
  readonly #accountStates = new Map<string, RelayAccountState>();
  /**
   * `${userId}|${item.key}` → 상따 전략 1건 (D-12).
   *
   * **정본은 게이트웨이**이고 여기는 그 뷰다 — 60 에코와 64 목록이 같은 바이트라
   * 두 경로가 같은 맵을 채운다. `crud === "D"` 는 삭제이므로 여기서 지운다(Pitfall 7:
   * 「삭제됨」은 스위치가 아니라 이 값으로 판정한다).
   *
   * 이 캐시가 여기 있어야 새 탭이 붙자마자 **종목 구독 없이** 목록을 그린다.
   */
  readonly #limitChasers = new Map<string, RelayLimitChaser>();
  /**
   * `userId` 집합 — **게이트웨이 64(목록 전량)를 이 세션에서 받았는가** (18-26 / GC-IN-02).
   *
   * `#viTriggers` 의 3상태와 같은 규율이다. 캐시가 비어 있다는 것만으로는 「등록 전략 없음」
   * (64 가 빈 목록으로 왔다)과 「아직 모름」(콜드 세션 · 세션 교체 직후 64 전)을 가를 수
   * 없다. 둘을 뭉개면 인증 경로가 빈 캐시를 `lc.snap []` 으로 내려 「모름」을 「없음」으로
   * 말하고, 브라우저는 그 거짓 확정 위에서 포커스 보류를 판정한다.
   *
   * **60 에코는 기록하지 않는다** — 에코는 1건만 말할 뿐 목록 전체를 말하지 않는다. 모르면
   * `lc.snap` 을 지어내지 않고, 곧 오는 64 팬아웃이 그 연결의 첫 `lc.snap` 이 된다.
   * 세션 교체(`#clearCaches`)·`closeAll` 이 캐시와 **같이** 지운다.
   */
  readonly #limitChaserKnown = new Set<string>();
  /**
   * `${userId}|${exchange}` → VI 전략 (17-05 / D-06).
   *
   * 서버는 VI 전략을 **세션당 거래소별 1건**(KRX 1 + NXT 1)으로 관리한다. 한 칸으로 두면
   * 나중에 온 거래소의 답이 앞 칸을 덮어, KRX 에 등록한 사용자가 NXT 의 「미등록」을 본다.
   *
   * **`null` 을 명시로 저장한다.** 「조회했더니 미등록」(`null`)과 「아직 조회한 적 없음」
   * (키 부재 = `getViTrigger` 가 `undefined`)은 다른 상태다. 둘을 뭉개면 인증 직후
   * 팬아웃이 「미등록」을 지어내 보내고, 브라우저가 사용자가 입력한 금액을 지운다.
   * **거래소마다 독립으로** 이 3상태를 판정한다.
   */
  readonly #viTriggers = new Map<string, RelayViTrigger | null>();
  /**
   * `userId` → **보낸 21 요청의 거래소 FIFO** (17-05 / D-06 / Pitfall 3 — C# `_pendingViGets`).
   *
   * 미등록 응답(빈 61)에는 본문이 없어 **거래소가 실리지 않는다**. 요청 순서가 그 응답을
   * 귀속할 유일한 근거다. 규약 4개(C# `Client.cs:2187-2214`, `:3038`):
   *   (a) 본문 없음 → head 를 **꺼내** 귀속한다. 큐가 비면 귀속 실패 — 캐시를 고치지 않는다.
   *   (b) 본문 있고 거래소 == head → 내 요청의 답이므로 head 를 버린다.
   *   (c) 본문 있고 거래소 != head → 팬아웃 에코(Set/Disable/푸시)다 — 큐를 건드리지 않는다.
   *   (d) 세션 교체·재로그인 → **비운다**. 남기면 다음 세션의 빈 응답이 옛 거래소로 귀속된다.
   *
   * ⚠️ 상따 `lc.arm`·`lc.set` 은 이 큐에 넣지 않는다 — 그 응답은 본문에 키가 있는 60 에코라
   *    귀속이 필요 없고, 넣으면 head 를 아무도 꺼내지 않아 다음 빈 61 이 옛 값으로 귀속된다.
   */
  readonly #pendingViGets = new Map<string, RelayExchange[]>();
  /**
   * `${userId}|${orderNo}` (접수 전은 `viPendingKey`) → VI 주문 추적 1건.
   *
   * 72 는 전량 교체, 73 은 항목 upsert 다 — 계좌 상태의 `snap` 규약과 동형이다.
   * `confirm_locked` 되돌림 같은 단건 변경도 73 한 경로로 온다.
   */
  readonly #viOrders = new Map<string, RelayViOrderItem>();
  /**
   * `${userId}|${isin}:${exchange}` → 등락률 돌파 above 집합 1원소 (17-03 / D-03).
   *
   * 키에 거래소가 들어가는 이유는 **같은 종목이 양쪽 거래소에서 돌파하면 원소가 둘**이기
   * 때문이다. 키 앞의 `userId` 는 `#quotes`/`#limitChasers` 와 같은 규율 — 사용자 간
   * above 집합 교차를 구조적으로 막는다 (T-17-08).
   *
   * ⚠️ **서버 above 집합을 그대로 보관한다.** 하루 1회 알림 규칙과 임계−2%p 이탈 삭제는
   *    클라(Phase 18) 몫이다 — relay 가 집합을 가공하면 서버 재무장 폭과 갈린다 (D-03).
   */
  readonly #rateCrossItems = new Map<string, RelayRateCrossItem>();
  /**
   * `userId` → 예약·장전·시간외종가 발주 창 상태 **최신 1건** (17-03 / D-03).
   *
   * 키 부재(= `getQueuedWindow` 가 `undefined`)는 「77 을 아직 못 받았다」이고 `open:false`
   * 와 **다른 상태**다. `#viTriggers` 의 3상태 규율과 같은 이유로 뭉개지 않는다.
   */
  readonly #queuedWindows = new Map<string, RelayQueuedWindowMsg>();
  /**
   * `userId` → 사용자 설정 **최신 1건** (84 `UserSettingsResp` · 27-01).
   *
   * 키 부재(= `getUserSettings` 가 `undefined`)는 「84 를 아직 못 받았다」이고 `present:false`(서버 저장값 없음 ·
   * 내장 기본값)와 **다른 상태**다. 지어낸 기본값을 넣지 않는다 — 넣으면 인증 직후 재생이 거짓 「저장값 없음」을
   * 그린다(`#queuedWindows` 와 같은 3상태 규율).
   */
  readonly #userSettings = new Map<string, RelayUserSettingsMsg>();
  /**
   * `${userId}|${isin}|${exchange}` (`progressKey`) → 그 종목 · 거래소의 **허용 계좌** 대기 주문 진행률 전량 (25-06).
   *
   * 83 은 (isin, exchange) 단위 **전량 교체**다 — 병합하지 않는다. 빈 값은 키째 지운다(「그 종목 · 거래소
   * 대기 주문 전부 사라짐」 G1 ⓕ). 항목은 세션 허용 계좌로 거르고 주문자(`dmaUserId`)를 뺀 공개 칸만
   * 담는다(T-25-24 · T-25-25). 값은 서버 원본 그대로다 — relay 는 진행률을 계산하지 않는다.
   */
  readonly #queueProgress = new Map<string, RelayQueueProgressItem[]>();
  /**
   * 잔량진행률 캐시가 **브라우저 사본과 어긋났을 수 있는** 사용자 (R2-WR-01).
   *
   * Ready 이전(같은 세션 재접속 · 계좌 선언 중)에 온 83 은 캐시만 바꾸고 팬아웃하지 않는다. 그 순간부터
   * 「hub 캐시 = 연결된 브라우저 사본」 이 깨지므로 표시해 두고, `#onReady` 가 현재 캐시로 snap:true 를
   * 한 번 보내 맞춘 뒤 지운다. 세션 교체(`#clearCaches`)도 이 표시를 보고 초기화 스냅을 낸다.
   */
  readonly #progressUnsynced = new Set<string>();
  /**
   * `#onFrame` 의 `default:` 도달 누적 수 (17-03 / T-17-10).
   *
   * 「조용히 떨어지는 프레임 0」을 **측정 가능한 값**으로 만든다. `envelope.ts` 의 드롭
   * 카운터와 나누는 이유: 저쪽은 「화이트리스트 밖이라 파서 전에 버렸다」이고 이쪽은
   * 「화이트리스트는 통과했는데 받아 줄 case 가 없다」 — 후자만이 PC-12 위반이다.
   */
  #unhandledFrames = 0;
  /**
   * ISIN → 종목명·단축코드. 게이트웨이가 이름을 주지 않으므로 여기서 채운다.
   * 없으면(주입 안 함/미스) 필드를 비워 두고 UI 가 ISIN 원문으로 폴백한다.
   */
  readonly #symbols: SymbolLookup | undefined;
  /** 게이트웨이 종목마스터 보조 원천(27/57). 없으면 57 은 명시 case 에서 버려진다. */
  readonly #symbolMaster: HubSymbolMasterFeed | undefined;

  /**
   * @param opts.lingerMs 1→0 뒤 구독 · 캐시 유지 시간(ms · D-10). 생략 = `LINGER_MS`(15초) · 0 이하 = 즉시 해제.
   * @param opts.limits 구독 한도(D-11 · D-15) — 생략 = `QUOTE_SUB_LIMIT`(2000) · `USER_SUB_LIMIT`(200). 테스트 주입용.
   */
  constructor(opts?: {
    symbols?: SymbolLookup;
    symbolMaster?: HubSymbolMasterFeed;
    lingerMs?: number;
    limits?: { global?: number; user?: number };
  }) {
    super();
    this.#symbols = opts?.symbols;
    this.#symbolMaster = opts?.symbolMaster;
    this.#lingerMs = opts?.lingerMs ?? LINGER_MS;
    this.#globalLimit = opts?.limits?.global ?? QUOTE_SUB_LIMIT;
    this.#userLimit = opts?.limits?.user ?? USER_SUB_LIMIT;
    this.#pacer = new SubscribePacer({
      isReady: () => this.#feed?.isReady === true,
      send: (payload) => this.#feed?.send(payload) ?? false,
      tapeCount: TAPE_REQUEST_COUNT,
      onIdle: () => this.#onPacerIdle(),
    });
  }

  // ----------------------------------------------------------
  // 세션 결선
  // ----------------------------------------------------------

  /**
   * 세션을 Hub 에 연결한다. **멱등**이다 — 같은 세션으로 여러 번 불러도 리스너는 1벌이다
   * (탭이 늘 때마다 `attach` 가 호출되므로 이 성질이 필수다).
   *
   * 세션 **객체가 바뀐 경우**(회선 실패 후 재생성)에는 옛 캐시를 버린다. 옛 세션의
   * 업스트림 구독은 그 TCP 와 함께 사라졌고, 참조계수는 "브라우저가 여전히 보고 있다"는
   * 사실이므로 남긴다 — 새 세션의 `ready` 가 전량 재구독으로 복원한다 (Pitfall 4).
   */
  attach(session: HubSession): void {
    const userId = session.userId;
    const prev = this.#sessions.get(userId);
    if (prev === session) return;

    if (prev !== undefined) {
      // 시세 구독 · 캐시는 전역이라 사용자 세션 교체와 무관하다 (Phase 26 D-08) — 사용자 캐시만 버린다.
      logger.info({ userId }, "[HUB] 세션 교체 — 사용자 캐시 폐기 (계좌 · 전략은 ready 에서 재요청)");
      this.#clearCaches(userId);
    }

    this.#sessions.set(userId, session);
    // 옛 세션의 리스너는 떼지 않고 **정본 대조로 침묵시킨다** (15-03 generation 규율 동형).
    session.on("frame", (e) => this.#onFrame(userId, session, e));
    session.on("ready", () => this.#onReady(userId, session));
    logger.info({ userId }, "[HUB] 세션 결선");
  }

  /**
   * 시세 업스트림 송신자(quote 연결)를 결선한다 (Phase 26 D-12). 부팅에서 1회 부른다.
   *
   * - 같은 객체 재호출은 no-op (리스너 1벌).
   * - 다른 객체면 warn 후 교체한다 — 옛 feed 의 리스너는 떼지 않고 `#feed` 정본 대조로 침묵시킨다(`attach` 규율 동형).
   * - `"ready"` → 인자 없는 `resubscribeAll()` — 전역 참조계수 합집합 재구독의 **유일한** 트리거다(Pitfall 4 재정의).
   * - 결선 시점에 이미 Ready 이고 보유 키가 있으면(교체 결선) 그 자리에서 한 번 재구독한다 — 이미 지나간 `ready` 를
   *   기다리면 새 feed 에는 구독이 영영 걸리지 않는다.
   */
  attachFeed(feed: HubQuoteFeed): void {
    if (this.#feed === feed) return;
    if (this.#feed !== null) {
      logger.warn({ subscriptions: this.#refs.size }, "[HUB] quote 연결 교체 — 옛 연결 리스너는 침묵");
      // 옛 연결로 보낸 in-flight 는 응답이 오지 않는다 — 창 · 대기열을 비우고 새 연결 ready 의 합집합 재구독에 맡긴다.
      this.#pacer.reset();
    }
    this.#feed = feed;
    feed.on("frame", (e) => this.#onFeedFrame(feed, e));
    feed.on("ready", () => {
      if (this.#feed !== feed) return;
      this.resubscribeAll();
    });
    logger.info({ ready: feed.isReady, subscriptions: this.#refs.size }, "[HUB] quote 연결 결선");
    if (feed.isReady && this.#refs.size > 0) this.resubscribeAll();
  }

  // ⚠️ `detach(userId)` 가 여기 있었다 — **삭제됐다** (R2-IN-02). 호출자가 `relay/src` ·
  //    `relay/tests` 어디에도 없었고, 세션 상태를 파괴하는 공개 메서드가 남아 있으면
  //    「정리하려면 이것을 부르면 된다」는 오해를 만든다. 실제로는 **부르면 안 됐다** —
  //    `#sessions` 에서 지우기만 하고 `attach` 가 건 `session.on("frame"/"ready")` 는
  //    떼지 않아, 그 세션이 살아 있는 한 리스너가 계속 쌓인다.
  //    프로세스 종료 경로의 정본은 `closeAll()` 이고, 소켓 1개가 닫히는 경로는
  //    `unsubscribe` 를 그 소켓이 잡고 있던 키마다 부르는 것이다.

  // ----------------------------------------------------------
  // 구독 참조계수 (D-33)
  // ----------------------------------------------------------

  /**
   * 참조계수 +1 (level 별 · **전역 키**). **0→1** 과 **PRICE→FULL 승격**에서만 quote 연결로 구독 프레임이 나간다.
   * `level` 생략은 FULL — 기존 호출부는 종전과 같다. 두 사용자가 같은 키를 잡으면 업스트림 구독은 한 벌이다(Phase 26 D-12).
   *
   * 참조계수를 바꾸기 **전에** 구독 한도를 판정한다(D-11 · D-15) — 판정 순서:
   *   ① 그 사용자에게 새 키이고 사용자 키 수 ≥ 사용자 한도 → `"limit-user"`.
   *   ② 업스트림에 없는 새 키(`#refs` 항목 없음 — linger 키는 항목이 있다)이고 `#refs.size`(live + linger) ≥ 전역 한도 →
   *      linger 키가 있으면 `since` 가 가장 오래된 키를 29(false) 로 풀고 진행, 없으면 `"limit-global"`.
   * 거부는 상태 무변경 · `subLimitRejects` +1 · warn 1건이다. 수용이면 사용자 참조를 올리고 종전 흐름 뒤 `"ok"`.
   */
  subscribe(
    userId: string,
    isin: string,
    exchange: RelayExchange,
    level: RelaySubLevel = "full",
  ): HubSubscribeResult {
    const key = marketKey(isin, exchange);
    const seen = this.#userRefs.get(userId)?.held.get(key);
    const userHeld = seen ?? 0;
    if (userHeld === 0 && (this.#userRefs.get(userId)?.active ?? 0) >= this.#userLimit) {
      return this.#rejectSubscribe(userId, isin, exchange, "user", this.#userLimit);
    }
    let refs = this.#refs.get(key);
    // 83 넛지 조건(Pattern 10) — 이 사용자의 첫 참조인데 키는 이미 업스트림(live · linger)에 있다.
    const nudge = seen === undefined && refs !== undefined;
    if (refs === undefined && this.#refs.size >= this.#globalLimit) {
      const oldest = this.#oldestLingerKey();
      if (oldest === undefined) {
        return this.#rejectSubscribe(userId, isin, exchange, "global", this.#globalLimit);
      }
      // 서버는 같은 연결의 명령을 FIFO 로 처리한다 — 29(false) 가 새 키 28/29 보다 먼저 나가면 서버 상한과 어긋나지 않는다.
      this.#releaseKey(oldest, "구독 한도 — linger 먼저 해제 (D-11)");
    }

    // 사용자 항목은 한도 판정(자리 만들기의 `#releaseKey` 가 본 키를 지울 수 있다) **뒤에** 다시 읽는다.
    let user = this.#userRefs.get(userId);
    if (user === undefined) {
      user = { held: new Map(), active: 0 };
      this.#userRefs.set(userId, user);
    }
    user.held.set(key, userHeld + 1);
    if (userHeld === 0) user.active += 1;

    if (refs === undefined) {
      refs = { full: 0, price: 0 };
      this.#refs.set(key, refs);
    }

    const linger = this.#lingering.get(key);
    if (linger !== undefined) {
      // linger 중 복귀 (D-10) — 업스트림 구독 · 캐시가 살아 있다. 타이머를 끄고 level 차이만 반영한다.
      this.#clearLinger(key, linger);
      refs[level] += 1;
      this.#resumeFromLinger(userId, isin, exchange, linger, refs);
      // 승격 · 강등은 그 29 가 넛지 몫을 한다 — level 이 같을 때만 따로 넛지한다.
      if (nudge && effectiveLevel(refs) === linger.level) this.#nudge(key, userId, "linger 중 새 사용자 첫 참조");
      return "ok";
    }

    const prevTotal = totalRefs(refs);
    const prevLevel = prevTotal > 0 ? effectiveLevel(refs) : undefined;
    refs[level] += 1;
    const nextLevel = effectiveLevel(refs);

    if (prevTotal === 0) {
      this.#sendSubscribe(isin, exchange, nextLevel);
      return "ok";
    }
    if (prevLevel === "price" && nextLevel === "full") {
      logger.info(
        { userId, isin, exchange, level: nextLevel, refs: { ...refs } },
        "[HUB] PRICE→FULL 승격 — 스냅샷+구독+체결 재송신",
      );
      this.#sendSubscribe(isin, exchange, "full");
      return "ok";
    }
    logger.info(
      { userId, isin, exchange, level: nextLevel, refs: { ...refs }, refCount: totalRefs(refs) },
      "[HUB] 이미 구독 중 — 게이트웨이로 다시 보내지 않는다 (탭 · 사용자 공유)",
    );
    if (nudge) this.#nudge(key, userId, "새 사용자 첫 참조");
    return "ok";
  }

  /**
   * 83 재송신 넛지 (Pattern 10 · Pitfall 6) — quote 연결로 그 키의 **실효 level** 29(subscribe=true) 1건. 서버는 이를 level
   * 덮어쓰기로 받아 `RequestResend` 를 부르고, 다음 틱 83 이 계좌를 선언한 사용자 세션(②)에 닿는다. 응답이 없는 29 라 페이서
   * 창을 점유하지 않고, 그 키 구독이 아직 대기 중이면 합쳐진다(`"nudge"` — 곧 나갈 구독 29 가 같은 효과).
   * quote 연결이 Ready 가 아니면 보내지 않는다 — ready 의 합집합 재구독 29 가 같은 효과다.
   */
  #nudge(key: string, userId: string, reason: string): void {
    const feed = this.#feed;
    if (feed === null || !feed.isReady) return;
    const refs = this.#refs.get(key);
    const parts = this.#splitMarketKey(key);
    if (refs === undefined || parts === null) return;
    const level = effectiveLevel(refs);
    this.#pacer.control(
      key,
      buildSubscribeQuoteReq(
        parts.isin,
        parts.exchange,
        true,
        level === "price" ? QUOTE_LEVEL.PRICE : QUOTE_LEVEL.FULL,
      ),
      "nudge",
    );
    logger.debug({ userId, isin: parts.isin, exchange: parts.exchange, level, reason }, "[HUB] 83 재송신 넛지 — 같은 level 29");
  }

  /** 구독 한도 거부 (D-11 · D-15) — 상태를 바꾸지 않고 계수 · warn 만 남긴다. */
  #rejectSubscribe(
    userId: string,
    isin: string,
    exchange: RelayExchange,
    scope: "user" | "global",
    limit: number,
  ): HubSubscribeResult {
    this.#subLimitRejects += 1;
    logger.warn({ userId, isin, exchange, scope, limit }, "[HUB] 구독 한도 — 새 키 거부 (D-11 · D-15)");
    return scope === "user" ? "limit-user" : "limit-global";
  }

  /** `since` 가 가장 오래된 linger 키 (D-11 자리 만들기). 없으면 undefined. 한도에 닿았을 때만 부르므로 선형 탐색이다. */
  #oldestLingerKey(): string | undefined {
    let oldestKey: string | undefined;
    let oldestSince = Number.POSITIVE_INFINITY;
    for (const [key, linger] of this.#lingering) {
      if (linger.since < oldestSince) {
        oldestSince = linger.since;
        oldestKey = key;
      }
    }
    return oldestKey;
  }

  /**
   * linger 중 복귀의 프레임 (D-10). 참조계수를 올린 **뒤** 부른다. linger 당시 업스트림 level 과 새 실효 level 을 비교한다.
   *   · 같다        → 프레임 0 — 캐시로 그린다.
   *   · PRICE→FULL  → 승격 28 → 29(level=0) → 32 (0→1 · 승격과 같은 `#sendSubscribe`).
   *   · FULL→PRICE  → 강등 29(level=1) 1건.
   * quote 연결이 Ready 가 아니면 기록만 한다 — ready 의 합집합 재구독이 실효 level 로 되건다.
   */
  #resumeFromLinger(
    userId: string,
    isin: string,
    exchange: RelayExchange,
    linger: Linger,
    refs: SubRefs,
  ): void {
    const nextLevel = effectiveLevel(refs);
    const lingeredMs = Date.now() - linger.since;
    if (nextLevel === linger.level) {
      logger.info(
        { userId, isin, exchange, level: nextLevel, lingeredMs },
        "[HUB] linger 중 재구독 — 캐시로 그린다 (게이트웨이 재요청 0)",
      );
      return;
    }
    if (nextLevel === "full") {
      logger.info(
        { userId, isin, exchange, from: linger.level, level: nextLevel, lingeredMs },
        "[HUB] linger 중 재구독 — PRICE→FULL 승격 (스냅샷+구독+체결 재송신)",
      );
      this.#sendSubscribe(isin, exchange, "full");
      return;
    }
    const feed = this.#feed;
    if (feed === null || !feed.isReady) {
      logger.info(
        { userId, isin, exchange, from: linger.level, level: nextLevel, hasFeed: feed !== null },
        "[HUB] linger 중 재구독 — FULL→PRICE 강등, quote 연결이 준비되지 않아 기록만",
      );
      return;
    }
    // 응답 없는 29 — 창 밖 즉시(아직 대기 중인 키면 대기 항목 level 만 바뀐다 · 26-10).
    this.#pacer.control(
      marketKey(isin, exchange),
      buildSubscribeQuoteReq(isin, exchange, true, QUOTE_LEVEL.PRICE),
      "demote",
    );
    logger.info(
      { userId, isin, exchange, from: linger.level, level: nextLevel, lingeredMs },
      "[HUB] linger 중 재구독 — FULL→PRICE 강등 29(level=1)",
    );
  }

  /**
   * 참조계수 -1 (level 별 · 전역 키). **합계 1→0** 에서 linger(D-10)를 걸고 — 만료 시 `subscribe:false` + 캐시 삭제 —,
   * **FULL→PRICE 강등**에서 29(level=1) 1건이 quote 연결로 나간다. 잡지 않은 level 의 해제는 무시한다.
   * `lingerMs` 가 0 이하면 1→0 에서 바로 해제한다(`#releaseKey`).
   */
  unsubscribe(
    userId: string,
    isin: string,
    exchange: RelayExchange,
    level: RelaySubLevel = "full",
  ): void {
    const key = marketKey(isin, exchange);
    const refs = this.#refs.get(key);
    if (refs === undefined || refs[level] <= 0) {
      // 조용히 넘기지 않는다 — 참조계수 누수·이중 해제는 여기서만 보인다 (S-5).
      logger.warn({ userId, isin, exchange, level }, "[HUB] 참조계수 없는 해제 — 무시");
      return;
    }

    const prevLevel = effectiveLevel(refs);
    refs[level] -= 1;
    this.#releaseUserRef(userId, key);
    // PRICE 게이트는 「FULL 업스트림 + price 소비자」 인 키에만 뜻이 있다 — price 이탈 · FULL→PRICE 강등 · 1→0 이면
    // 예약된 지연 방출과 함께 지운다(D-05 · T-26-11). feed 준비 여부와 무관하게 여기서 정리한다.
    if (refs.price === 0 || effectiveLevel(refs) === "price") this.#dropPriceGate(key);
    const total = totalRefs(refs);
    if (total > 0) {
      const nextLevel = effectiveLevel(refs);
      if (nextLevel === prevLevel) {
        logger.info(
          { userId, isin, exchange, level: nextLevel, refs: { ...refs }, refCount: total },
          "[HUB] 탭 1개 해제 — 구독 유지",
        );
        return;
      }
      // FULL→PRICE 강등 — 서버는 같은 키 재구독을 level 덮어쓰기로 처리한다.
      const feed = this.#feed;
      if (feed === null || !feed.isReady) {
        logger.info(
          { userId, isin, exchange, level: nextLevel, hasFeed: feed !== null },
          "[HUB] FULL→PRICE 강등 — quote 연결이 준비되지 않아 기록만 (quote ready 가 실효 level 로 복원)",
        );
        return;
      }
      // 응답 없는 29 — 창 밖 즉시(아직 대기 중인 키면 대기 항목 level 만 바뀐다 · 26-10).
      this.#pacer.control(key, buildSubscribeQuoteReq(isin, exchange, true, QUOTE_LEVEL.PRICE), "demote");
      logger.info(
        { userId, isin, exchange, level: nextLevel, refs: { ...refs } },
        "[HUB] FULL→PRICE 강등 — 29(level=1)",
      );
      return;
    }

    if (this.#lingerMs <= 0) {
      this.#releaseKey(key, "마지막 구독 해제 (linger 0)");
      return;
    }
    // linger (D-10) — `#refs` 항목(0/0)을 남긴 채 업스트림 구독 · 캐시를 유지한다. 만료가 `#releaseKey` 를 부른다.
    const linger: Linger = { timer: null, since: Date.now(), level: prevLevel };
    linger.timer = setTimeout(() => {
      linger.timer = null;
      if (this.#lingering.get(key) !== linger) return; // 이미 복귀 · 정리됨 — 옛 타이머는 침묵
      this.#releaseKey(key, "linger 만료");
    }, this.#lingerMs);
    this.#lingering.set(key, linger);
    logger.info(
      { userId, isin, exchange, level: prevLevel, lingerMs: this.#lingerMs },
      "[HUB] 마지막 구독 해제 — linger 시작 (구독 · 캐시 유지)",
    );
  }

  /**
   * 키 하나를 **완전히** 푼다 (D-10 — linger 만료 · `lingerMs` 0 의 1→0 · quote 재접속의 linger 정리가 공유하는 한 자리).
   * 참조계수 · linger 표식(타이머 포함) · 전역 캐시(스냅샷 · 링버퍼 · 대기 배치) · PRICE 게이트(타이머 포함)를 지운다.
   * `sendUnsubscribe` 가 참이고 quote 연결이 Ready 면 29(false) 1건을 보낸다 — 재접속 정리는 새 연결에 구독이 없으니 거짓.
   * 캐시가 남지 않으므로 전역 캐시 크기 ≤ 업스트림 키 수(live + linger)다(T-26-12).
   */
  #releaseKey(key: string, reason: string, sendUnsubscribe = true): void {
    const linger = this.#lingering.get(key);
    if (linger !== undefined) this.#clearLinger(key, linger);
    this.#refs.delete(key);
    // 본 키 기억도 지운다 (Pattern 10) — 다음에 이 키를 여는 사용자는 새 업스트림 구독(28 · 29 · 32)이나 첫 참조 넛지를 받는다.
    for (const [userId, user] of this.#userRefs) {
      const held = user.held.get(key);
      if (held === undefined) continue;
      if (held > 0) user.active -= 1; // 풀리는 키는 참조 0 이어야 한다 — 방어적으로만 맞춘다.
      user.held.delete(key);
      if (user.held.size === 0) this.#userRefs.delete(userId);
    }
    this.#quotes.delete(key);
    this.#tapes.delete(key);
    this.#pendingTapes.delete(key);
    this.#dropPriceGate(key);

    const parts = this.#splitMarketKey(key);
    if (parts === null) return;
    const { isin, exchange } = parts;
    if (!sendUnsubscribe) {
      logger.info({ isin, exchange, reason }, "[HUB] 키 해제 — 업스트림 구독이 없어 해제 프레임 생략");
      return;
    }
    const feed = this.#feed;
    if (feed === null || !feed.isReady) {
      logger.info(
        { isin, exchange, reason, hasFeed: feed !== null },
        "[HUB] 키 해제 — quote 연결이 준비되지 않아 해제 프레임 생략",
      );
      return;
    }
    // 응답 없는 29(false) — 창 밖 즉시, in-flight 키면 슬롯도 푼다. 아직 대기 중(미송신)이면 프레임 없이 대기열에서 뺀다(26-10).
    this.#pacer.control(key, buildSubscribeQuoteReq(isin, exchange, false), "unsubscribe");
    logger.info({ isin, exchange, reason }, "[HUB] 키 해제 — 업스트림 구독 해제 29(false)");
  }

  /**
   * 사용자 참조 -1 (D-15). 0 이 돼도 항목은 **본 키로 남긴다**(Pattern 10 — 같은 사용자의 복귀는 넛지 0) — 사용자 한도 계수
   * (`active`)만 줄인다. 본 키 정리는 `#releaseKey` · `#clearCaches` 몫이다.
   */
  #releaseUserRef(userId: string, key: string): void {
    const user = this.#userRefs.get(userId);
    const held = user?.held.get(key);
    if (user === undefined || held === undefined || held <= 0) {
      // 전역 참조계수는 있는데 이 사용자 몫이 없다 — 회계 불일치 신호(S-5). 전역 해제는 그대로 진행한다.
      logger.warn({ userId, key }, "[HUB] 사용자 참조 없는 해제 — 사용자 계수만 건너뜀");
      return;
    }
    user.held.set(key, held - 1);
    if (held === 1) user.active -= 1;
  }

  /** linger 표식과 만료 타이머를 지운다(복귀 · 해제 공용). */
  #clearLinger(key: string, linger: Linger): void {
    if (linger.timer !== null) clearTimeout(linger.timer);
    linger.timer = null;
    this.#lingering.delete(key);
  }

  // ⚠️ `releaseAll(userId)` 가 여기 있었다 — **삭제됐다** (R2-IN-02). `detach` 와 같은
  //    이유다: 호출자 0건인데 그 사용자의 구독·캐시를 통째로 버리는 공개 메서드였다.
  //    다른 탭이 여전히 보고 있어도 구독이 끊기므로 부르는 순간이 곧 사고다.
  //    소켓 1개가 닫히는 정상 경로는 `unsubscribe` 를 그 소켓이 잡고 있던 키마다 부르는
  //    것이고, 사용자 단위 정리가 정말 필요해지면 그때 「무엇을 보존하는가」를 정해
  //    다시 만든다 — 쓰이지 않는 채로 미리 놓아두지 않는다.

  /**
   * quote 연결 `ready` 에서 **Hub 가 소유한 전역 키 집합**(모든 사용자 참조계수의 합집합)을 순회해 전량
   * 재구독한다 (Pitfall 4 재정의 · 확정-재접속). 브라우저 상태에 의존하지 않는 것이 핵심이다 — 브라우저는
   * 아무것도 다시 보내지 않는다. 호출 원천은 quote 연결 `ready` 하나다 — 사용자 세션 `ready` 는 부르지 않는다
   * (D-03 · D-08).
   *
   * **페이싱 (Pitfall 3 · 26-10)** — 합집합을 for 루프로 한꺼번에 쏘지 않는다. 먼저 페이서를 `reset` 한다(끊긴 연결의 in-flight 는
   * 응답이 오지 않고, 대기열은 아래에서 실효 level 로 다시 채운다). 각 키는 창(32 키)을 거쳐 응답(FULL=69 · PRICE=58) 또는
   * 3초마다 다음 키가 나간다. 시작 · 완료(대기열과 창이 빌 때) 로그 1줄씩 — `{ keys, elapsedMs, timeouts }` 로 A5 가정(창 ·
   * 타임아웃 값)을 실측 조정한다. 끝나기 전에 다시 끊겼다 붙으면 중단 로그 1줄 뒤 처음부터 다시 한다.
   */
  resubscribeAll(): void {
    const interrupted = this.#resubscribeRun;
    if (interrupted !== null) {
      const s = this.#pacer.stats();
      logger.info(
        {
          keys: interrupted.keys,
          elapsedMs: Date.now() - interrupted.startedAt,
          timeouts: s.timeouts - interrupted.timeoutsAtStart,
          queued: s.queued,
          inFlight: s.inFlight,
        },
        "[HUB] 합집합 재구독 중단 — quote 연결 재접속으로 처음부터 다시",
      );
      this.#resubscribeRun = null;
    }
    this.#pacer.reset();
    // linger 키(D-10)는 되걸지 않고 정리한다 — 새 연결에는 구독이 없고 소비자도 없다(29(false) 도 보낼 것이 없다).
    const lingered = [...this.#lingering.keys()];
    for (const key of lingered) this.#releaseKey(key, "quote 연결 재접속 — linger 키 정리", false);

    const live: Array<{ isin: string; exchange: RelayExchange; level: RelaySubLevel }> = [];
    for (const [key, refs] of this.#refs.entries()) {
      const parts = this.#splitMarketKey(key);
      if (parts === null) continue;
      // 키마다 **실효 level** 로 되건다 (quick-260923-ge2).
      live.push({ ...parts, level: effectiveLevel(refs) });
    }
    this.#resubscribeRun = { keys: live.length, startedAt: Date.now(), timeoutsAtStart: this.#pacer.stats().timeouts };
    logger.info(
      { keys: live.length, lingerReleased: lingered.length },
      "[HUB] quote 연결 Ready — 합집합 재구독 시작 (live 키만 · in-flight 창 페이싱)",
    );
    for (const k of live) this.#sendSubscribe(k.isin, k.exchange, k.level);
    // 완료 시점은 페이서 onIdle 이 정한다 — 응답이 끝내 오지 않아도 타임아웃으로 닫히게 추적을 건다(키 0 이면 즉시 완료).
    this.#pacer.trackUntilIdle();
  }

  /** 페이서의 대기열과 창이 비었다 — 진행 중인 합집합 재구독이 있으면 완료 로그 1줄 (26-10). 평시 구독은 로그하지 않는다. */
  #onPacerIdle(): void {
    const run = this.#resubscribeRun;
    if (run === null) return;
    this.#resubscribeRun = null;
    logger.info(
      {
        keys: run.keys,
        elapsedMs: Date.now() - run.startedAt,
        timeouts: this.#pacer.stats().timeouts - run.timeoutsAtStart,
      },
      "[HUB] 합집합 재구독 완료",
    );
  }

  /**
   * 전 계좌 상태 스냅샷을 1회 요청한다 (D-23). `account_no` 를 **빈 문자열**로 보내면
   * 계좌당 1프레임으로 66 이 돌아온다 — 계좌를 하나씩 도는 왕복을 만들지 않는다.
   *
   * 트리거는 `ready` **하나뿐**이다(재구독과 같은 자리 — Pitfall 4). 브라우저가 탭을
   * 열 때마다 다시 요청하지 않는 이유는 캐시가 즉시 응답하기 때문이고, 그 편이
   * 게이트웨이 왕복을 사용자 수에 비례시키지 않는다.
   */
  requestAccountState(userId: string): void {
    const session = this.#sessions.get(userId);
    if (session === undefined || !session.isReady) {
      logger.warn(
        { userId, hasSession: session !== undefined },
        "[HUB] 계좌 상태 요청 생략 — 세션이 준비되지 않았다",
      );
      return;
    }
    session.send(buildGetAccountStateReq(""));
    logger.info({ userId }, "[HUB] Ready — 전 계좌 상태 스냅샷 요청");
  }

  /**
   * 전략 스냅샷 3종을 요청한다 (D-12) — 24(상따 목록) · 21(VI 설정) · 34(VI 주문 목록) — 그리고 43(사용자 설정 ·
   * Phase 27)을 끝에 덧붙인다.
   *
   * **21 만 2회다** (17-05 / D-06): VI 전략은 서버가 거래소별 1건으로 관리하므로 KRX·NXT
   * 각각을 조회해야 한다. 24·34 는 거래소 축이 없어 1회 그대로다.
   *
   * 보낸 거래소를 **보낸 순서대로** `#pendingViGets` 에 넣는다 — 거래소를 담지 않는 빈 61 을
   * 귀속할 유일한 근거다. 넣기 전에 옛 큐를 비운다: 새 Ready 는 새 연결이고, 옛 요청의
   * 응답은 영영 오지 않는다 (규칙 (d)).
   *
   * 순서는 계약이 아니지만 목록 → 설정 → 추적 순으로 두면 로그가 화면 구성 순서와 같이 읽힌다.
   *
   * **트리거는 `ready` 하나뿐이다** (`requestAccountState` 와 같은 자리 — Pitfall 4).
   * D-13 에 따라 주기 재조회 타이머도, 브라우저가 부를 수 있는 수동 재조회 진입점도
   * 만들지 않는다 — 사용자 조작에 대한 60/61 에코는 Notice 라 유실되지 않으므로 메울 것이
   * 없고, 폴링은 게이트웨이 왕복을 탭 수에 비례시킨다.
   */
  requestStrategySnapshot(userId: string): void {
    const session = this.#sessions.get(userId);
    if (session === undefined || !session.isReady) {
      logger.warn(
        { userId, hasSession: session !== undefined },
        "[HUB] 전략 스냅샷 요청 생략 — 세션이 준비되지 않았다",
      );
      return;
    }
    session.send(buildGetLimitChaserListReq());

    // 옛 큐는 여기서 끝난다 — 이 Ready 이전에 보낸 21 의 응답은 이제 오지 않는다.
    const queue: RelayExchange[] = [];
    this.#pendingViGets.set(userId, queue);
    for (const exchange of VI_PREFETCH_EXCHANGES) {
      // 보내지 못한 요청은 큐에 넣지 않는다 — 넣으면 오지 않을 응답이 head 를 영원히 막고,
      // 그 뒤의 빈 61 이 한 칸씩 밀려 엉뚱한 거래소로 귀속된다 (C# `SendGetVITrigger` 동형).
      if (session.send(buildGetVITriggerReq(exchange))) queue.push(exchange);
    }

    session.send(buildGetVIOrderListReq());
    // 43 사용자 설정 (Phase 27 · Pitfall 4) — 84 는 로그인 직후(계좌 선언 전 = Ready 전)에 와서 캐시만 되고
    // 팬아웃되지 않는다. 같은 세션에 이미 붙어 있던 탭(재접속)은 이 43 의 84 로 갱신된다. 응답 귀속이 필요 없다
    // (84 는 사용자 단위 1건) — FIFO 없음.
    session.send(buildGetUserSettingsReq());
    logger.info(
      { userId, viExchanges: [...queue] },
      "[HUB] Ready — 전략 스냅샷 요청 (21 은 거래소별 2회 · 43 사용자 설정)",
    );
  }

  // ----------------------------------------------------------
  // 캐시 조회 (D-37)
  // ----------------------------------------------------------

  /**
   * 그 사용자의 계좌 상태 전량(누적 반영된 스냅샷) 복사본.
   *
   * 새 wss 연결이 붙었을 때 게이트웨이 왕복 없이 즉시 잔고·미체결을 그리는 데 쓴다.
   * 반환 프레임은 전부 `snap:true` 다 — 받는 쪽이 전량 교체로 처리해야 한다.
   */
  getAccountStates(userId: string): RelayAccountState[] {
    const prefix = userPrefix(userId);
    const out: RelayAccountState[] = [];
    for (const [key, state] of this.#accountStates) {
      if (key.startsWith(prefix)) out.push(state);
    }
    return out;
  }

  /**
   * 그 사용자의 상따 전략 전량 복사본 (D-12).
   *
   * 새 wss 연결이 붙었을 때 `{t:"lc.snap"}` 1프레임으로 목록을 복원하는 데 쓴다 —
   * 게이트웨이 왕복도, 종목 구독도 필요 없다.
   */
  getLimitChasers(userId: string): RelayLimitChaser[] {
    const prefix = userPrefix(userId);
    const out: RelayLimitChaser[] = [];
    for (const [key, item] of this.#limitChasers) {
      if (key.startsWith(prefix)) out.push(item);
    }
    return out;
  }

  /**
   * 이 세션에서 게이트웨이 64(상따 목록 전량)를 받았는가 (18-26 / GC-IN-02).
   *
   * `true` 면 `getLimitChasers` 가 **확정 목록**이다(빈 배열 = 등록 전략 없음). `false` 면
   * 캐시는 「모름」이고 — 60 에코로 몇 건 들어 있어도 전체가 아니다 — 인증 경로는
   * `lc.snap` 을 보내지 않는다. `getViTrigger` 의 `undefined` 와 같은 자리다.
   */
  hasLimitChaserList(userId: string): boolean {
    return this.#limitChaserKnown.has(userId);
  }

  /**
   * 그 사용자의 **그 거래소** VI 전략 (17-05 / D-06).
   *
   * **반환값 3종을 구분해야 한다**: `RelayViTrigger` = 등록됨, `null` = 조회 결과 미등록,
   * `undefined` = **아직 모른다**(그 거래소의 61 을 한 번도 못 받았다). `undefined` 일 때는
   * 프레임을 내리지 않는다 — 지어낸 「미등록」을 보내면 브라우저가 사용자가 입력 중인 금액을
   * 지운다. 판정은 **거래소마다 독립**이다(KRX 는 알고 NXT 는 모르는 상태가 정상이다).
   */
  getViTrigger(userId: string, exchange: RelayExchange): RelayViTrigger | null | undefined {
    return this.#viTriggers.get(viTriggerKey(userId, exchange));
  }

  /** 그 사용자의 VI 주문 추적 전량 복사본. `{t:"vi.list", snap:true}` 재생에 쓴다. */
  getViOrders(userId: string): RelayViOrderItem[] {
    const prefix = userPrefix(userId);
    const out: RelayViOrderItem[] = [];
    for (const [key, item] of this.#viOrders) {
      if (key.startsWith(prefix)) out.push(item);
    }
    return out;
  }

  /**
   * 그 사용자의 등락률 돌파 above 집합 복사본 (17-03 / D-03).
   *
   * 정렬은 `sortRateCrossNewestFirst`(**`exchangeTime` 내림차순 · 동률이면 `isin` 오름차순**)다 —
   * 사용자 결정 2026-09-22 — 최신 돌파가 맨 위. 서버 78 원순서(오름차순)와 무관하게 relay 가
   * 내리는 순서는 이 헬퍼 한 곳이 정한다(78 팬아웃도 같은 헬퍼).
   */
  getRateCrossItems(userId: string): RelayRateCrossItem[] {
    const prefix = userPrefix(userId);
    const out: RelayRateCrossItem[] = [];
    for (const [key, item] of this.#rateCrossItems) {
      // 인증 직후 스냅샷(`fanout.ts`)이 이 반환값을 그대로 내린다 — 76/78 팬아웃과 같은 보강을
      // **사본에만** 얹는다(D-30). 캐시는 서버 원본 그대로다.
      if (key.startsWith(prefix)) out.push(this.#enrichRateCross(item));
    }
    return sortRateCrossNewestFirst(out);
  }

  /**
   * 그 사용자의 예약·장전·시간외종가 발주 창 상태 (17-03 / D-03).
   *
   * **`undefined` 는 「77 을 아직 못 받았다」**이고 `getViTrigger` 의 3상태 규율과 같은
   * 이유로 뭉개지 않는다 — 지어낸 창 상태를 내리면 브라우저가 거짓 라벨을 그린다.
   */
  getQueuedWindow(userId: string): RelayQueuedWindowMsg | undefined {
    return this.#queuedWindows.get(userId);
  }

  /**
   * 그 사용자의 사용자 설정 (84 · 27-01).
   *
   * **`undefined` 는 「84 를 아직 못 받았다」**이다 — `getQueuedWindow` 와 같은 3상태 규율. 모르면 내리지 않는다.
   */
  getUserSettings(userId: string): RelayUserSettingsMsg | undefined {
    return this.#userSettings.get(userId);
  }

  /**
   * 그 사용자에게 보이는 잔량진행률 전량 (25-06) — 인증 직후 `unf.progress` snap:true 의 원천.
   *
   * 캐시에는 비어 있지 않은 키만 있다(빈 값은 키째 지운다). 반환은 사본이다 — 소비자가 배열을 고쳐도
   * 캐시가 바뀌지 않는다. `[]` 는 「보이는 대기 주문 없음」이고 인증 경로는 그것도 1프레임으로 내린다.
   */
  getQueueProgressEntries(userId: string): RelayUnfProgressEntry[] {
    const prefix = userPrefix(userId);
    const out: RelayUnfProgressEntry[] = [];
    for (const [key, items] of this.#queueProgress) {
      if (!key.startsWith(prefix) || items.length === 0) continue;
      const parsed = this.#splitProgressKey(key);
      if (parsed === null) continue;
      out.push({ i: parsed.isin, x: parsed.exchange, items: [...items] });
    }
    return out;
  }

  /**
   * 마지막 호가 스냅샷(전역 캐시 — Phase 26 D-12). 있으면 브라우저에 즉시 내려 깜빡임을 없앤다.
   * 사용자 간에 공유된다 — 다른 사용자가 먼저 연 종목도 새 탭은 게이트웨이 왕복 없이 즉시 그린다.
   */
  getSnapshot(isin: string, exchange: RelayExchange): RelayQuote | undefined {
    return this.#quotes.get(marketKey(isin, exchange));
  }

  /** 최근 체결 링버퍼(전역)의 복사본 — 아직 플러시 안 된 대기분까지 포함한 원본 그대로(진단 · 테스트용). */
  getTape(isin: string, exchange: RelayExchange): RelayTapeEntry[] | undefined {
    const ring = this.#tapes.get(marketKey(isin, exchange));
    return ring === undefined ? undefined : [...ring];
  }

  /**
   * 새 탭 · price→full 승격 직후 tape 스냅샷(`snap:true`)으로 줄 링버퍼 — **이미 플러시된 부분만**이다(26-REVIEW WR-02).
   *
   * `#onTape` 는 증분(71)을 링버퍼에 먼저 넣고 같은 항목을 `#pendingTapes` 에도 넣어 200ms 뒤 증분으로 내보낸다. 그 창
   * 안에 새 소켓이 붙어 링버퍼 전체를 스냅샷으로 받으면, 곧이어 같은 대기분이 `snap:false` 로 **그 소켓에도** 가서 같은
   * 체결이 두 줄이 된다(웹 `applyMarketFrames` 는 중복을 거르지 않고 앞에 붙인다). 그래서 대기 증분을 뺀 앞부분만 준다 —
   * 빠진 꼬리는 곧 나갈 플러시가 채운다. 대기분이 스냅샷(69 전량 교체)이면 곧 나갈 `snap:true` 가 전량을 주므로 undefined.
   * 대기분이 링버퍼보다 길면(상한 절단) 링버퍼 전체가 대기분이라 빈 배열이다.
   */
  getFlushedTape(isin: string, exchange: RelayExchange): RelayTapeEntry[] | undefined {
    const key = marketKey(isin, exchange);
    const ring = this.#tapes.get(key);
    if (ring === undefined) return undefined;
    const pending = this.#pendingTapes.get(key);
    if (pending === undefined) return [...ring];
    if (pending.snap) return undefined;
    return ring.slice(0, Math.max(0, ring.length - pending.entries.length));
  }

  /**
   * 보조 종목마스터 교체 뒤 **이름 없던 캐시 행**을 풀어 영향받은 사용자에게만 다시 내린다
   * (quick-260923-cqj D-08). `GatewaySymbolMaster` 의 `"updated"` 가 부른다(`index.ts`).
   *
   * 왜 필요한가: 상장 첫날 아침 첫 Ready 에서 relay 는 66(계좌)·64(상따)·72(VI)와 27 을 한꺼번에
   * 요청하고, 27 은 publisher 명령 큐를 거쳐 약 10프레임으로 오므로 66/64 가 마스터 조립보다
   * **먼저** 도착한다. 그때 캐시된 행은 이름 없이 팬아웃되고, 거래가 없는 잔고 행은 델타도 오지
   * 않아 계속 ISIN 으로 남는다. 다음 푸시를 기다리는 것으로는 부족하다.
   *
   * 새 프레임 계약은 만들지 않는다 — 브라우저가 이미 부작용 없이 처리하는 기존 모양만 쓴다:
   *   - 계좌: 캐시의 `snap:true` 전량 뷰(66 재수신과 같다).
   *   - 상따: `lc.snap` — **64 를 이미 받은 사용자에게만**(18-26 — 「모름」을 「없음」으로 말하지
   *     않는다). ⚠️ 합성 `{t:"lc"}` 단건은 보내지 않는다 — webapp 리듀서가 그 프레임마다
   *     `lastLimitChaserEcho`(「서버가 답했다」의 유일한 증거)를 갱신하기 때문이다.
   *   - VI 주문: `vi.list` `snap:false` 로 바뀐 항목만(73 과 같다).
   *
   * 대상이 아닌 것: 등락률 돌파(76/78)는 팬아웃 시점과 getter 에서 이미 보강하고, VI 발동
   * 통보(56)·시세는 일회성이라 캐시가 없다.
   *
   * 멱등이다 — 이름 있는 행은 건드리지 않으므로 곧바로 다시 불러도 팬아웃 0건이고, 평소
   * (Supabase 가 이미 다 풀었을 때)에는 재방송도 로그도 없다.
   */
  refreshNames(): void {
    const symbols = this.#symbols;
    if (symbols === undefined) return;
    const userOf = (key: string): string => key.slice(0, key.indexOf("|"));

    // (a) 계좌 — 잔고·미체결 행에 name+code (`#enrichNames` 와 같은 필드 구성).
    let accounts = 0;
    for (const [key, state] of this.#accountStates) {
      let changed = false;
      const fill = <T extends { isin: string; name?: string; code?: string }>(row: T): T => {
        const next = fillMissingName(symbols, row, true);
        if (next !== row) changed = true;
        return next;
      };
      const hold = state.hold.map(fill);
      const unf = state.unf.map(fill);
      if (!changed) continue;
      const next: RelayAccountState = { ...state, hold, unf };
      this.#accountStates.set(key, next);
      this.#fanout(userOf(key), next);
      accounts += 1;
    }

    // (b) 상따 — name+code (`#enrichLimitChaser` 와 같다). 바뀐 사용자만 lc.snap.
    const lcUsers = new Set<string>();
    for (const [key, item] of this.#limitChasers) {
      const next = fillMissingName(symbols, item, true);
      if (next === item) continue;
      this.#limitChasers.set(key, next);
      lcUsers.add(userOf(key));
    }
    let limitChaserUsers = 0;
    for (const userId of lcUsers) {
      // 합성 `lc` 단건 금지 — webapp lastLimitChaserEcho 가 서버 응답 증거라서.
      if (!this.hasLimitChaserList(userId)) continue;
      this.#fanout(userId, { t: "lc.snap", items: this.getLimitChasers(userId) });
      limitChaserUsers += 1;
    }

    // (c) VI 주문 — name 만 (`#enrichViOrder` 와 같다). 바뀐 항목만 snap:false.
    const viByUser = new Map<string, RelayViOrderItem[]>();
    for (const [key, item] of this.#viOrders) {
      const next = fillMissingName(symbols, item, false);
      if (next === item) continue;
      this.#viOrders.set(key, next);
      const userId = userOf(key);
      const list = viByUser.get(userId) ?? [];
      list.push(next);
      viByUser.set(userId, list);
    }
    let viOrders = 0;
    for (const [userId, items] of viByUser) {
      this.#fanout(userId, { t: "vi.list", snap: false, items });
      viOrders += items.length;
    }

    if (accounts + limitChaserUsers + viOrders > 0) {
      logger.info(
        { accounts, limitChaserUsers, viOrders },
        "[HUB] 보조 종목마스터 반영 — 이름 없던 캐시 행 재방송",
      );
    }
  }

  /**
   * `#onFrame` 의 `default:` 에 떨어진 프레임 누적 수 (T-17-10).
   *
   * **0 이 아니면 화이트리스트와 명시 `case` 가 갈렸다는 뜻이다** — 넓힌 번호를 받아 줄
   * case 가 없어 프레임이 조용히 사라지고 있다. 회귀 테스트가 이 값을 읽는다.
   */
  unhandledFrameCount(): number {
    return this.#unhandledFrames;
  }

  /** 현재 전역 참조계수 — 모든 사용자 · 탭 · level 합계(진단·테스트용). */
  refCount(isin: string, exchange: RelayExchange): number {
    const refs = this.#refs.get(marketKey(isin, exchange));
    return refs === undefined ? 0 : totalRefs(refs);
  }

  /** 업스트림 실효 level(진단·테스트용). 구독이 없으면 undefined (quick-260923-ge2). */
  subscriptionLevel(isin: string, exchange: RelayExchange): RelaySubLevel | undefined {
    const refs = this.#refs.get(marketKey(isin, exchange));
    return refs === undefined || totalRefs(refs) === 0 ? undefined : effectiveLevel(refs);
  }

  /** 키가 linger 중인가(D-10 · 진단 · 테스트용) — 소비자 0 이지만 업스트림 구독 · 캐시를 유지하는 중. */
  isLingering(isin: string, exchange: RelayExchange): boolean {
    return this.#lingering.has(marketKey(isin, exchange));
  }

  /** `/healthz` 요약. 식별자를 담지 않는다. */
  stats(): HubStats {
    return {
      sessionCount: this.#sessions.size,
      subscriptionCount: this.#refs.size - this.#lingering.size,
      lingerCount: this.#lingering.size,
      cachedQuoteCount: this.#quotes.size,
      cachedAccountCount: this.#accountStates.size,
      cachedLimitChaserCount: this.#limitChasers.size,
      cachedViTriggerCount: this.#viTriggers.size,
      cachedViOrderCount: this.#viOrders.size,
      cachedRateCrossCount: this.#rateCrossItems.size,
      unhandledFrameCount: this.#unhandledFrames,
      subLimitRejects: this.#subLimitRejects,
    };
  }

  /** 프로세스 종료용 — 대기 중인 배치 타이머를 전부 끄고 상태를 비운다. */
  closeAll(): void {
    if (this.#tapeFlushTimer !== null) clearTimeout(this.#tapeFlushTimer);
    this.#tapeFlushTimer = null;
    this.#pendingTapes.clear();
    for (const gate of this.#priceGates.values()) {
      if (gate.timer !== null) clearTimeout(gate.timer);
    }
    this.#priceGates.clear();
    for (const linger of this.#lingering.values()) {
      if (linger.timer !== null) clearTimeout(linger.timer);
    }
    this.#lingering.clear();
    this.#userRefs.clear();
    // 페이서 대기열 · in-flight 타이머 (26-10) — 뒤늦은 타이머가 아무것도 보내지 않게.
    this.#pacer.reset();
    this.#resubscribeRun = null;
    // 옛 feed 의 늦은 프레임 · ready 는 정본 대조(`#feed`)로 침묵한다.
    this.#feed = null;
    this.#sessions.clear();
    this.#refs.clear();
    this.#quotes.clear();
    this.#tapes.clear();
    this.#accountStates.clear();
    this.#limitChasers.clear();
    this.#limitChaserKnown.clear();
    this.#viTriggers.clear();
    this.#pendingViGets.clear();
    this.#viOrders.clear();
    this.#rateCrossItems.clear();
    this.#queuedWindows.clear();
    this.#userSettings.clear();
    this.#queueProgress.clear();
    this.#progressUnsynced.clear();
  }

  // ----------------------------------------------------------
  // 내부 — 프레임 수신
  // ----------------------------------------------------------

  #onFrame(userId: string, session: HubSession, e: TransportFrameEvent): void {
    // 세션이 교체됐다면 옛 리스너는 아무것도 보고하지 않는다 (15-03 generation 규율 동형).
    if (this.#sessions.get(userId) !== session) return;

    switch (e.msgType) {
      case MSG.GetQuoteResp:
      case MSG.QuoteUpdate:
      case MSG.TradeTapeResp:
      case MSG.TradeTapePush:
        // Phase 26 D-08 — 사용자 세션은 종목을 구독하지 않는다. 시세는 quote 연결(`#onFeedFrame`)로만 온다.
        // 여기로 오면 게이트웨이 라우팅 이상(또는 구독이 새는 회귀)이라 warn 을 남기고 버린다 — 캐시에 넣으면
        // 사용자 세션이 시세 원천으로 되살아난다(D-03 폴백 없음). `default:` 에 맡기지 않는 명시 case 다(PC-12).
        logger.warn({ userId, msgType: e.msgType }, "[HUB] 사용자 세션에 시세 프레임 — 구독이 없으니 이상 신호, 무시");
        return;
      case MSG.OrderResp: {
        const notice = parseOrderResp(e.env);
        if (notice !== null) this.#onOrderNotice(userId, notice);
        return;
      }
      case MSG.OrderConfirm:
      case MSG.TradeExecution: {
        // **서버에 이 두 테이블을 만드는 경로가 없다.** 체결도 51 의 `notice_type:"E"` 로
        // 온다 (fbs L221-228 / `Server.cpp` L307). 온다면 그 자체가 이상 신호이므로
        // 기록만 남기고 흘리지 않는다 — 가격·수량이 없는 프레임을 `{t:"order"}` 로
        // 지어내면 화면에 "0주 @0" 이 뜨고, 그것을 보고 "안 나갔다"로 읽으면
        // 이미 접수된 주문을 다시 낸다.
        logger.warn({ userId, msgType: e.msgType }, "[HUB] 생성 경로 없는 주문 프레임 — 무시");
        return;
      }
      case MSG.GetAccountStateResp:
      case MSG.AccountStateDelta: {
        const state = parseAccountState(e.env, e.msgType === MSG.GetAccountStateResp);
        if (state !== null) this.#onAccountState(userId, state);
        return;
      }
      case MSG.ServerMessage: {
        // 해석하지 않고 그대로 흘린다 (D-36). 배치하지 않는다 — 드물고 즉시성이 중요하다.
        //
        // 전략(상따/VI) 거부도 이 프레임으로 온다. 그 주인 판정 —
        // `src === "Account" ∧ i === ""` 만 VI 몫(Pitfall 9) — 은 **브라우저의 한 함수**가
        // 한다. relay 는 `lv`/`src`/`i` 를 온전히 전달하기만 하면 되고, 계약
        // (`RelayServerMsg`)에 셋 다 이미 실려 있다. 여기서 미리 갈라 놓으면 판정이 두 벌이 된다.
        const msg = parseServerMessage(e.env);
        if (msg !== null) this.#fanout(userId, msg);
        return;
      }
      case MSG.SetLimitChaserResp: {
        const item = parseLimitChaserEcho(e.env);
        if (item !== null) this.#onLimitChaserEcho(userId, item);
        return;
      }
      case MSG.GetLimitChaserListResp: {
        // `[]` 는 정상이다(등록 0건) — `null` 만 파싱 실패다.
        const items = parseLimitChaserList(e.env);
        if (items !== null) this.#onLimitChaserList(userId, items);
        return;
      }
      case MSG.SetVITriggerResp: {
        // `null` 은 파싱 실패, `{ok:true, cfg:null}` 은 **미등록**이다 — 뭉개지 않는다.
        const parsed = parseViTrigger(e.env);
        if (parsed !== null) this.#onViTrigger(userId, parsed.cfg);
        return;
      }
      case MSG.GetVIOrderListResp:
      case MSG.VIOrderListPush: {
        // 72/73 은 슬롯 하나를 공유하고 스냅샷 구분은 msg_type 이 정본이다 (D-33).
        const list = parseViOrderList(e.env, e.msgType === MSG.GetVIOrderListResp);
        if (list !== null) this.#onViOrderList(userId, list.snap, list.items);
        return;
      }
      case MSG.DisableStrategiesResp: {
        // **완료 신호일 뿐이다 — 여기서 캐시를 고치지 않는다.** 서버가 키별 60/61 에코를
        // 먼저 보낸 뒤 이 집계를 보내므로 도착 시점에는 이미 캐시가 갱신돼 있다. 이 숫자로
        // 상태를 만들면 에코와 두 벌이 갈리고, 65 가 유실되면 화면이 되살아난다.
        const resp = parseDisableStrategiesResp(e.env);
        if (resp !== null) {
          this.#fanout(userId, {
            t: "strategies.disabled",
            count: resp.count,
            viDisabled: resp.viDisabled,
          });
        }
        return;
      }
      case MSG.RateCrossAlert: {
        // 화이트리스트를 넓힌 것과 **같은 커밋**에 있는 명시 case 다 (PC-12 — Pitfall 1).
        // 76 은 요청 짝이 없는 Broadcast 라 **로그인 전 연결에도** 온다.
        const item = parseRateCrossAlert(e.env);
        if (item !== null) this.#onRateCrossAlert(userId, session, item);
        return;
      }
      case MSG.RateCrossSnapshot: {
        // `[]` 는 정상이다(돌파 없음) — `null` 만 파싱 실패다. 둘을 뭉개면 「돌파 없음」이라는
        // 확정 정보가 사라지고 브라우저가 옛 집합을 계속 그린다.
        const items = parseRateCrossSnapshot(e.env);
        if (items !== null) this.#onRateCrossSnapshot(userId, session, items);
        return;
      }
      case MSG.QueuedWindowState: {
        const state = parseQueuedWindowState(e.env);
        if (state !== null) this.#onQueuedWindow(userId, session, state);
        return;
      }
      case MSG.UserSettingsResp: {
        // 화이트리스트와 **같은 커밋**의 명시 case 다(PC-12 · 27-01). 84 는 LoginResp → 77 → 84 순으로 계좌 선언 전
        // (Ready 전)에 온다 — 캐시는 늘, 팬아웃은 Ready 뒤(RESEARCH Pitfall 4).
        const settings = parseUserSettings(e.env);
        if (settings !== null) this.#onUserSettings(userId, session, settings);
        return;
      }
      case MSG.QueueProgress: {
        // 화이트리스트와 **같은 커밋**의 명시 case 다(PC-12 · 25-06). 83 은 Broadcast 라 시세만 구독한
        // 세션에도 **남의 계좌 항목**을 싣는다(gh-trade D-19) — 계좌 필터는 아래 핸들러가 캐시 전에 한다.
        const frame = parseQueueProgress(e.env);
        if (frame !== null) this.#onQueueProgress(userId, session, frame);
        return;
      }
      case MSG.VIOrderNotice: {
        // 「주문이 이미 나갔다」는 알림이다. 캐시에 넣지 않는다 — 추적 목록의 정본은 72/73 이고,
        // 이 통보에는 주문번호·상태가 없어 같은 행을 만들 수 없다.
        const notice = parseViOrderNotice(e.env);
        if (notice !== null) this.#fanout(userId, this.#enrichViNotice(notice));
        return;
      }
      case MSG.SymbolMasterResp:
        // 브라우저로 흘리지 않는다 — 공개 마스터이고 relay 이름 해석의 보조 원천이다(D-07).
        // 화이트리스트와 **같은 커밋**의 명시 case 다(PC-12). 피드가 주입되지 않아도 여기서
        // 끝나므로 `default:` 계수는 오르지 않는다. 요청 세션 판정은 피드가 userId 로 한다.
        this.#symbolMaster?.onFrame(userId, parseSymbolMasterFrame(e.env));
        return;
      case MSG.LoginResp:
      case MSG.UpdateAccountNoResp:
        // **세션(`DmaSession`)이 처리하는 프레임이다.** Hub 는 아무것도 하지 않는 것이 맞다 —
        // 그러나 그 사실을 `default:` 에 맡기지 않고 명시 case 로 적는다. 그래야 아래 계수기가
        // 「아무도 안 받은 프레임」만 세고, 그 값이 곧 PC-12 위반 여부가 된다 (T-17-10).
        return;
      case MSG.ObserverLoginResp:
      case MSG.JournalBatch:
        // **관찰자 연결 전용 프레임이다**(19-09 — 화이트리스트와 같은 커밋의 명시 case · PC-12).
        // 게이트웨이는 둘을 요청 연결(관찰자 소켓)에만 Notice 로 보내므로 사용자 세션에 올 일이 없다.
        // 오면 게이트웨이 라우팅 이상이라 warn 을 남기고 버린다 — `default:` 에 맡기면 계수기가
        // 이 의도된 무시를 함께 세어 진짜 PC-12 위반을 가린다(17-03).
        logger.warn({ userId, msgType: e.msgType }, "[HUB] 사용자 세션에 관찰자 전용 프레임 — 무시");
        return;
      default:
        // 16-04 가 화이트리스트를 19종으로, 17-03 이 22종으로 넓힌 뒤에도 **여기로 조용히
        // 떨어지는 프레임은 0**이다 (PC-12 — 넓힌 만큼 명시 case 로 받는 것이 조건이었다).
        //
        // ★ 그 「0」이 주석이 아니라 **실행되는 게이트**가 되도록 도달 횟수를 센다 (T-17-10).
        //   화이트리스트만 넓히고 명시 case 를 빠뜨리면 이 값이 0 을 넘고, 회귀 테스트가
        //   그 순간 깨진다. 로그는 debug 그대로라 프로덕션 볼륨은 늘지 않는다.
        this.#unhandledFrames += 1;
        logger.debug(
          { userId, msgType: e.msgType, unhandledFrameCount: this.#unhandledFrames },
          "[HUB] 명시 case 없는 프레임 — default 도달 (PC-12 게이트)",
        );
        return;
    }
  }

  /**
   * 등락률 돌파 알림 1건 (76) — above 집합 **upsert** 다.
   *
   * ⚠️ **캐시가 먼저이고 팬아웃이 나중이다.** 76 은 요청 짝 없는 Broadcast 라 로그인 전
   *    연결에도 오고, 그때 세션은 아직 Ready 가 아니다. Ready 이전 프레임을 버리면 인증
   *    직후 스냅샷이 그 사이에 열린 돌파를 모른 채로 나가고, 반대로 팬아웃하면 소유자
   *    판정이 끝나기 전의 프레임을 브라우저에 흘리게 된다 (T-17-07). 그래서 **보관은
   *    언제나, 전달은 Ready 뒤에만** 한다.
   *
   * ⚠️ 하루 1회 알림 규칙과 임계−2%p 이탈 삭제는 **여기서 하지 않는다** — 서버 above 집합을
   *    그대로 보관하는 것이 계약이고, 표시 규칙은 Phase 18 클라 몫이다 (D-03).
   */
  #onRateCrossAlert(userId: string, session: HubSession, item: RelayRateCrossItem): void {
    this.#rateCrossItems.set(rateCrossKey(userId, item.isin), item);
    if (!session.isReady) {
      logger.debug(
        { userId, isin: item.isin, exchange: item.exchange },
        "[HUB] Ready 이전 돌파 알림 — 캐시만 (인증 직후 스냅샷이 내려보낸다)",
      );
      return;
    }
    // 보강은 **팬아웃 페이로드에만** 얹는다(D-30). 캐시(`#rateCrossItems`)에는 위에서 서버 원본을
    // 넣었다 — 「서버 집합을 그대로 보관」 규율(D-03/D-14)을 보강이 바꾸지 않는다.
    this.#fanout(userId, { t: "rate.cross", item: this.#enrichRateCross(item) });
  }

  /**
   * 등락률 돌파 above 집합 전량 (78) — **전량 교체**다.
   *
   * 그 사용자의 원소를 전부 지우고 새로 넣는다. 병합(upsert)으로 처리하면 서버가 이미
   * 뺀 종목이 캐시에 영원히 남는다 — 76 upsert 로 들어왔다가 임계−2%p 아래로 이탈한
   * 종목이 정확히 그것이다. **빈 벡터도 그대로 적용한다**: 「돌파 없음」은 확정 정보이고,
   * 무시하면 로그인 전에 쌓인 옛 집합이 새 세션까지 따라온다.
   */
  #onRateCrossSnapshot(userId: string, session: HubSession, items: RelayRateCrossItem[]): void {
    const prefix = userPrefix(userId);
    for (const key of [...this.#rateCrossItems.keys()]) {
      if (key.startsWith(prefix)) this.#rateCrossItems.delete(key);
    }
    for (const item of items) {
      this.#rateCrossItems.set(rateCrossKey(userId, item.isin), item);
    }
    logger.info({ userId, count: items.length }, "[HUB] 돌파 집합 스냅샷 수신 — 전량 교체");
    if (!session.isReady) return;
    // 전량 교체는 위에서 서버 원본으로 끝났다. 보강은 팬아웃 사본에만 (D-30 / D-27).
    // 순서는 사용자 결정 2026-09-22 — 최신 돌파가 맨 위(`sortRateCrossNewestFirst`).
    //
    // 페이로드는 원 배열이 아니라 **캐시 getter 에서** 만든다(quick-260926-rcc). 인증 직후
    // 스냅샷(`fanout.ts`)과 78 팬아웃이 한 원천이면 서버가 같은 ISIN 을 두 번 보내는 계약
    // 위반에도 브라우저는 ISIN 당 1원소(뒤 원소가 이긴다)를 받고 두 경로가 갈리지 않는다.
    this.#fanout(userId, { t: "rate.cross.snap", items: this.getRateCrossItems(userId) });
  }

  /**
   * 돌파 항목에 종목명·단축코드를 채운다 (Phase 18 D-30 — 게이트웨이는 주지 않는다).
   *
   * `#enrichViOrder` 와 같은 규율이다 — 맵에 없으면 **필드를 비워 둔 원본 객체를 그대로** 돌려준다.
   * ISIN 을 이름 자리에 넣으면 UI 가 "이름이 없다"와 "이름이 ISIN 이다"를 구분하지 못한다.
   * 원본을 변형하지 않고 사본을 만든다 — 캐시에 든 서버 원본이 보강으로 오염되지 않게.
   */
  #enrichRateCross(item: RelayRateCrossItem): RelayRateCrossItem {
    const info = this.#symbols?.lookup(item.isin);
    return info === undefined ? item : { ...item, name: info.name, code: info.code };
  }

  /**
   * 예약·장전·시간외종가 발주 창 상태 (77) — **최신 1건만** 보관한다.
   *
   * 서버가 로그인 직후 1프레임 + 창 마스크 전이마다 보내므로, 여기 남는 값은 언제나
   * 「서버가 마지막으로 말한 창 상태」다. 키 부재(`getQueuedWindow` 가 `undefined`)는
   * 「아직 못 받았다」이고 `open:false` 와 다른 상태다 — 뭉개면 인증 직후 팬아웃이
   * 지어낸 「닫힘」을 보내고 브라우저가 거짓 라벨을 그린다 (`getViTrigger` 와 같은 규율).
   */
  #onQueuedWindow(userId: string, session: HubSession, state: RelayQueuedWindowMsg): void {
    this.#queuedWindows.set(userId, state);
    if (!session.isReady) return;
    this.#fanout(userId, state);
  }

  /**
   * 사용자 설정 (84 · 27-01) — **최신 1건만** 보관한다(77 동형).
   *
   * 84 는 로그인 직후 77 뒤 1프레임 · 43 응답 · 42 성공 뒤 같은 사용자 전 세션 브로드캐스트로 온다. 로그인 직후
   * 84 는 Ready 전이라 **캐시만** 하고(인증한 탭은 fanout 의 인증 재생이 캐시를 내린다), Ready 세션의 84 만
   * 팬아웃한다 — Ready 게이트로 버리면 탭이 영영 「불러오는 중」이 된다(RESEARCH Pitfall 4).
   */
  #onUserSettings(userId: string, session: HubSession, settings: RelayUserSettingsMsg): void {
    this.#userSettings.set(userId, settings);
    if (!session.isReady) return;
    this.#fanout(userId, settings);
  }

  /**
   * 잔량진행률 (83) — (isin, exchange) 키 **전량 교체** (25-06 · 77 패턴).
   *
   * 1. **계좌 필터가 먼저다.** 세션 허용 계좌 Set 에 없는 항목은 버리고, 주문자(`dmaUserId`)를 뺀 공개
   *    칸만 남긴다(T-25-24 · T-25-25). 허용 목록이 없으면 전부 거른다(fail-closed).
   * 2. 이전 값이 없거나 비었고 새 값도 비면 **아무것도 하지 않는다** — 83 은 종목마다 1초 스로틀로
   *    오므로 빈→빈 팬아웃은 순수 소음이다(T-25-27). 비어 있지 않던 키가 비면 한 번 보낸다(삭제 신호 —
   *    계좌 분기가 이전 스냅샷 계좌에도 빈 스냅샷을 보내는 이유가 이것이다).
   * 3. 캐시는 Ready 와 무관하게 갱신하고, 팬아웃은 Ready 세션에만 한다 — 인증 직후 스냅이 그 사이 값을
   *    내린다(76/77 규율).
   *
   * 같은 세션이 계좌 선언과 시세 구독을 함께 하면 같은 83 이 두 번 올 수 있다 — 전량 교체라 결과가
   * 같다(멱등). 중복 제거는 하지 않는다.
   */
  #onQueueProgress(userId: string, session: HubSession, frame: QueueProgressFrame): void {
    const allowed = new Set((session.allowedAccounts ?? []).map((a) => a.accountNo));
    const items: RelayQueueProgressItem[] = [];
    for (const it of frame.items) {
      if (!allowed.has(it.accountNo)) continue;
      items.push({
        accountNo: it.accountNo,
        orderNo: it.orderNo,
        exchange: it.exchange,
        isin: it.isin,
        group: it.group,
        expectedCum: it.expectedCum,
        currentCum: it.currentCum,
        remainingVolume: it.remainingVolume,
        progressBp: it.progressBp,
        firstFilled: it.firstFilled,
      });
    }
    const key = progressKey(userId, frame.isin, frame.exchange);
    const prev = this.#queueProgress.get(key);
    if ((prev === undefined || prev.length === 0) && items.length === 0) return;
    if (items.length === 0) this.#queueProgress.delete(key);
    else this.#queueProgress.set(key, items);
    if (!session.isReady) {
      // 캐시만 바뀌었다 — 사본과 어긋났음을 표시하고, Ready 가 캐시 그대로 재동기화한다(R2-WR-01).
      this.#progressUnsynced.add(userId);
      return;
    }
    this.#fanout(userId, { t: "unf.progress", snap: false, i: frame.isin, x: frame.exchange, items: [...items] });
  }

  /**
   * quote 연결 수신 (Phase 26 D-12) — `#onFeedFrame` 명시 case 표는 파일 헤더에 있다.
   *
   * 정본 feed 가 아니면(교체된 옛 연결의 늦은 프레임) 아무것도 하지 않는다. 사용자 데이터 프레임이 여기 올 일은 없고,
   * 와도 `"fanout"`/`"market"` 어느 쪽으로도 흘리지 않는다 — 사용자 경로는 그 사용자 세션(`#onFrame`) 하나다.
   */
  #onFeedFrame(feed: HubQuoteFeed, e: TransportFrameEvent): void {
    if (this.#feed !== feed) return;

    switch (e.msgType) {
      case MSG.GetQuoteResp:
      case MSG.QuoteUpdate: {
        const quote = parseQuoteState(e.env, e.msgType === MSG.GetQuoteResp);
        // null 이면 파서가 이미 사유·카운터를 남겼다 — 여기서 다시 로그하지 않는다(그 키 슬롯은 페이서 타임아웃이 푼다).
        if (quote === null) return;
        this.#onQuote(quote);
        // 58 = 28 의 응답 — PRICE 키는 이것으로 창 슬롯이 풀린다(26-10). 59 푸시는 창과 무관하다.
        if (e.msgType === MSG.GetQuoteResp) this.#pacer.onResponse(marketKey(quote.i, quote.x), e.msgType);
        return;
      }
      case MSG.TradeTapeResp:
      case MSG.TradeTapePush: {
        const tape = parseTradeTape(e.env, e.msgType === MSG.TradeTapeResp);
        if (tape === null) return;
        this.#onTape(tape);
        // 69 = 32 의 응답(가장 큰 Notice) — FULL 키는 이것으로 창 슬롯이 풀린다(26-10). 71 푸시는 창과 무관하다.
        if (e.msgType === MSG.TradeTapeResp) this.#pacer.onResponse(marketKey(tape.i, tape.x), e.msgType);
        return;
      }
      case MSG.ObserverLoginResp:
        // feed 가 스스로 소비한다(26-02) — ready 뒤 재수신은 이상하지만 해석할 것이 없다.
        return;
      case MSG.RateCrossAlert:
      case MSG.RateCrossSnapshot:
        // 돌파 원천은 사용자 세션 그대로다(D-08) — quote 쪽 76/78 을 합치면 서버 트래픽은 그대로인 채 N+1 원천
        // 중복 제거만 늘어난다(RESEARCH Open Q2 RESOLVED 무시안 · Pattern 2).
        logger.debug({ msgType: e.msgType }, "[HUB] quote 연결 76/78 — 무시 (돌파는 사용자 세션 원천)");
        return;
      case MSG.QueueProgress:
        // 83 은 사용자 세션 ② 경로(계좌 선언)로도 오고, 그쪽이 계좌 필터 **뒤** 캐시한다(T-25-24). quote 쪽 83(①)을
        // 사용자별로 다시 뿌리면 같은 스냅샷이 두 원천에서 겹치고, 필터 실수 한 번에 남의 계좌가 샌다(Pattern 10 ①).
        logger.debug({ msgType: e.msgType }, "[HUB] quote 연결 83 — 무시 (사용자 세션 경로가 계좌 필터 후 캐시)");
        return;
      case MSG.ServerMessage:
      case MSG.QueuedWindowState:
      case MSG.JournalBatch:
      case MSG.UserSettingsResp:
        // 서버 규약상 quote 역할에는 오지 않는다(54 두 역할 모두 미수신 · 77 사용자 세션 · 80 journal 역할 ·
        // 84 는 `ProcessLoginReq` 경로에서만 송신 — 27-01).
        logger.warn({ msgType: e.msgType }, "[HUB] quote 연결에 오지 않는 프레임 — 무시");
        return;
      default:
        // `#onFrame` 과 **같은 계수기**를 쓴다 — PC-12 게이트는 연결 종류와 무관하게 「받아 줄 case 없는 번호」 0 이다.
        this.#unhandledFrames += 1;
        logger.debug(
          { msgType: e.msgType, unhandledFrameCount: this.#unhandledFrames },
          "[HUB] quote 연결 — 명시 case 없는 프레임 (PC-12 게이트)",
        );
        return;
    }
  }

  /**
   * 시세는 **배치하지 않는다** — 업스트림 100ms 코얼레싱을 그대로 통과시킨다 (D-35).
   *
   * 참조계수 없는 키의 늦은 프레임(linger 만료 · 해제 29(false) 뒤 in-flight)은 **캐시하지 않고 버린다** — 넣으면
   * `#releaseKey` 가 지운 캐시가 되살아나 다음 구독자가 낡은 값을 즉시 받는다. linger 중인 키(D-10)는 `#refs` 에 남아
   * 있으므로 캐시를 갱신한다 — 서버는 아직 구독 중이고, 복귀하는 소비자는 최신 캐시를 받아야 한다.
   */
  #onQuote(quote: RelayQuote): void {
    const key = marketKey(quote.i, quote.x);
    const refs = this.#refs.get(key);
    if (refs === undefined) {
      logger.debug({ isin: quote.i, exchange: quote.x }, "[HUB] 구독 없는 키의 시세 — 버림 (해제 뒤 늦은 프레임)");
      return;
    }
    const prev = this.#quotes.get(key);
    this.#quotes.set(key, quote);
    // price 플래그 = PRICE 소켓에 보낼지(D-06 — 키 단위 1회). fanout 은 소켓 level 로만 거른다.
    const price = this.#priceFlag(key, refs, prev, quote);
    this.emit("market", { key, msg: quote, full: true, price });
  }

  /**
   * 서버 PRICE 규칙 복제 판정 (D-05 · D-06 — gh-trade `MarketPublisher.cpp` ~1919 동형). 캐시를 새 값으로 바꾼 **뒤**
   * 부른다 — 지연 방출은 캐시의 최신 상태를 싣는다.
   *
   *   58(snap)              → 참. 스냅샷이 최신 상태를 실었으니 pending · 타이머를 비우고 송신 시각을 찍는다.
   *   price 참조 0          → 거짓(보낼 price 소켓이 없다). 게이트 정리.
   *   업스트림 실효 PRICE   → 참 — 서버가 이미 걸렀다(판정 생략).
   *   그 밖(FULL 업스트림)  → 가격 섹션이 바뀌었거나 pending 이면, 마지막 PRICE 송신 뒤 100ms 이상이면 참,
   *                           아니면 거짓 + pending + 타이머 1개(`lastPriceSentMs + 100` · 이미 있으면 그대로).
   */
  #priceFlag(key: string, refs: SubRefs, prev: RelayQuote | undefined, quote: RelayQuote): boolean {
    if (quote.snap) {
      this.#dropPriceGate(key);
      if (refs.price > 0 && refs.full > 0) {
        this.#priceGates.set(key, { lastPriceSentMs: Date.now(), pending: false, timer: null });
      }
      return true;
    }
    if (refs.price === 0) {
      this.#dropPriceGate(key);
      return false;
    }
    if (refs.full === 0) {
      this.#dropPriceGate(key);
      return true;
    }

    let gate = this.#priceGates.get(key);
    if (gate === undefined) {
      // 스냅샷 없이 판정이 시작된 키(예: 승격 직후 58 보다 먼저 온 59) — 첫 가격 갱신은 바로 통과한다.
      gate = { lastPriceSentMs: Number.NEGATIVE_INFINITY, pending: false, timer: null };
      this.#priceGates.set(key, gate);
    }
    const changed = prev === undefined || !samePriceSection(prev, quote);
    if (!changed && !gate.pending) return false;

    const now = Date.now();
    if (now - gate.lastPriceSentMs >= PRICE_MIN_INTERVAL_MS) {
      gate.lastPriceSentMs = now;
      gate.pending = false;
      if (gate.timer !== null) clearTimeout(gate.timer);
      gate.timer = null;
      return true;
    }
    gate.pending = true;
    if (gate.timer === null) {
      const delay = Math.max(0, gate.lastPriceSentMs + PRICE_MIN_INTERVAL_MS - now);
      gate.timer = setTimeout(() => this.#flushPrice(key), delay);
    }
    return false;
  }

  /**
   * 지연 방출 (D-05 — 「유실 없이 지연만」). 키가 아직 FULL 업스트림 + price 소비자이고 pending 이면 **캐시의 최신 q**
   * 한 프레임을 price 소켓에만 보낸다 — full 소켓은 이미 받았으므로 `full: false`. 본문은 캐시 그대로다(D-07).
   */
  #flushPrice(key: string): void {
    const gate = this.#priceGates.get(key);
    if (gate === undefined) return;
    gate.timer = null;
    const refs = this.#refs.get(key);
    const msg = this.#quotes.get(key);
    if (!gate.pending || refs === undefined || refs.price === 0 || refs.full === 0 || msg === undefined) {
      gate.pending = false;
      return;
    }
    gate.lastPriceSentMs = Date.now();
    gate.pending = false;
    this.emit("market", { key, msg, full: false, price: true });
  }

  /** 키의 PRICE 게이트와 예약된 지연 방출을 지운다. */
  #dropPriceGate(key: string): void {
    const gate = this.#priceGates.get(key);
    if (gate === undefined) return;
    if (gate.timer !== null) clearTimeout(gate.timer);
    this.#priceGates.delete(key);
  }

  /**
   * 주문 통보 (51) — 접수·체결·취소확인·거부가 전부 이 하나로 온다.
   *
   * **그 주문자에게만** 간다 (T-15-02). 전역 브로드캐스트 경로가 없다는 것이 타인 체결
   * 유출의 구조적 방어이고, 여기서 `#fanout` 말고 다른 전송 수단을 쓰지 않는 것이 그 규율이다.
   *
   * 와이어 계약(`RelayOrderMsg`)에 `side` 를 싣지 않는 것은 의도다 — 취소·정정 통보의
   * 매매구분은 믿을 수 없으므로(Pitfall 8) 애초에 내려보내지 않고, UI 는 `nt` 로
   * "취소"/"정정" 을 고른다. `sideTrusted` 는 relay 내부 소비자(order-handler 의 rid 즉시응답
   * 상관)를 위한 값이라 `"order"` 이벤트에만 실린다.
   */
  #onOrderNotice(userId: string, notice: ParsedOrderResp): void {
    const msg: RelayOrderMsg = {
      t: "order",
      no: notice.orderNo,
      nt: notice.noticeType,
      rc: notice.resultCode,
      msg: notice.message,
      org: notice.orgOrderNo,
      p: notice.price,
      q: notice.quantity,
      x: notice.exchange,
      // 구 서버는 세 필드를 비워 보낸다. 빈 값은 **키째 생략**한다 — 브라우저 계약이 셋을
      // optional 로 둔 이유이고, 빈 문자열을 실어 보내면 "서버가 `""` 라고 말했다"와
      // "서버가 말하지 않았다"가 구분되지 않는다 (D-08).
      ...(notice.board === "" ? {} : { bd: notice.board }),
      ...(notice.requestKind === "" ? {} : { rk: notice.requestKind }),
      ...(notice.requester === "" ? {} : { rq: notice.requester }),
    };
    // 화면이 먼저다 — 브라우저 `{t:"order"}` 토스트·전략 로그 표면 (Phase 19 D-03).
    this.#fanout(userId, msg);
    // **감사 사본** (D-24 · Open Q7 유지). relay 사용자 세션 경로는 DB 에 쓰지 않으므로
    // (Phase 19 D-01) 이 한 줄이 relay 쪽에서 브로커 주문번호와 대조할 수 있는 흔적이다.
    // 계좌번호·비밀번호·DMA user_id 는 싣지 않는다 (D-19 승계). 51 통보에 계좌번호 필드는
    // 애초에 없고, 여기 `userId` 는 Supabase 사용자 식별자다.
    logger.info(
      {
        userId,
        orderNo: notice.orderNo,
        noticeType: notice.noticeType,
        resultCode: notice.resultCode,
        origin: notice.originKind,
      },
      "[HUB] 주문 통보 수신(감사 사본)",
    );
    this.emit("order", { userId, notice });
  }

  /**
   * 계좌 상태 (66 스냅샷 / 67 델타). **배치하지 않는다** — 잔고·미체결은 초당 수십 건이
   * 오는 값이 아니고, 체결 직후의 잔량 변화는 즉시 보여야 취소 판단이 가능하다.
   *
   * 와이어로는 **받은 그대로**(스냅샷은 snap:true, 델타는 snap:false) 흘리고, 캐시에만
   * 병합된 전량 뷰를 둔다. 이 비대칭이 의도된 설계다 — 브라우저가 이미 같은 병합 규약
   * (`snap:false` = 키 upsert + 0행/`rm` 제거)을 구현하므로, 델타를 여기서 전량으로 부풀려
   * 보내면 프레임이 커지기만 하고 얻는 것이 없다. 삭제(0 행)를 여기서 걸러 버리지 않는
   * 것도 같은 이유다 — 그 신호가 사라지면 브라우저가 사라진 종목을 계속 그린다.
   */
  #onAccountState(userId: string, rawState: RelayAccountState): void {
    // 이름 보강은 **캐시와 와이어 이전**에 한 번만 한다. 캐시만 채우면 라이브 프레임에
    // 이름이 없고, 와이어만 채우면 재접속 캐시 재생에 이름이 없다 — 둘이 갈리면
    // "새로고침하면 이름이 사라진다" 가 된다.
    const state = this.#enrichNames(rawState);
    const key = `${userId}|${state.a}`;
    this.#accountStates.set(key, this.#mergeAccountState(key, state));
    logger.info(
      {
        userId,
        accountNo: maskAccountNo(state.a),
        snap: state.snap,
        holdings: state.hold.length,
        unfilled: state.unf.length,
        removed: state.rm.length,
      },
      "[HUB] 계좌 상태 수신",
    );
    this.#fanout(userId, state);
  }

  /**
   * 상따 설정 에코 (60) — 반영의 **유일한 증거**다.
   *
   * `crud === "D"` 는 삭제이고 캐시에서 지운다 (Pitfall 7: 매수·매도 스위치 두 개만 보고
   * 판정하면 서버 진실과 갈린다 — 취소 게이트가 켜져 있으면 둘 다 꺼도 전략이 남는다).
   *
   * **삭제도 프레임으로 내린다.** 캐시에서만 지우고 침묵하면 이미 열려 있는 탭의 목록에
   * 사라진 전략이 그대로 남고, 사용자가 그것을 보고 「아직 살아 있다」로 읽는다.
   */
  #onLimitChaserEcho(userId: string, raw: RelayLimitChaser): void {
    // 보강은 **캐시에 넣기 전**이다. 캐시가 곧 `getLimitChasers` → `lc.snap`(재접속 복원)
    // 의 원천이므로, 여기서 붙이지 않으면 「지금 화면」과 「새로 연 탭」의 이름이 갈린다.
    //
    // 삭제(`crud:"D"`) 프레임에도 붙인다 — 캐시에서는 지우지만 프레임은 그대로 내리므로
    // (아래 규율), 이름이 있어야 UI 가 「무엇이 사라졌는지」를 말할 수 있다. 붙이는 비용은
    // 맵 조회 1회이고 분기를 하나 줄인다(`#enrichNames` 의 톰스톤 행과 같은 판단).
    const item = this.#enrichLimitChaser(raw);
    const key = lcKey(userId, item);
    if (item.crud === "D") this.#limitChasers.delete(key);
    else this.#limitChasers.set(key, item);
    logger.info(
      { userId, crud: item.crud, cached: this.#limitChasers.size },
      "[HUB] 상따 에코 수신",
    );
    this.#fanout(userId, { t: "lc", item });
  }

  /**
   * 상따 전략 1건에 종목명·단축코드를 채운다 (게이트웨이는 주지 않는다 — 갭 4).
   *
   * `#enrichViOrder`·`#enrichNames` 와 **같은 규율**이다: 맵에 없으면 **필드를 비워 둔다**.
   * ISIN 을 이름 자리에 넣으면 UI 가 "이름이 없다"와 "이름이 ISIN 이다"를 구분하지 못한다.
   *
   * 미해석 건수 로그는 **남기지 않는다.** `#enrichNames` 가 건수를 세는 이유는 잔고·미체결이
   * 계좌당 수십 행이라 「전량 미스 = 맵이 비었다」를 그 비율로만 알 수 있기 때문인데, 상따는
   * 한 프레임에 1건(60)이거나 소수(64)라 같은 판정을 못 한다. 맵 적재 실패는 이미 잔고 경로의
   * `[SYM]` 로그가 말하므로, 여기서 종목당 한 줄씩 더 쌓는 것은 신호가 아니라 소음이다.
   */
  #enrichLimitChaser(item: RelayLimitChaser): RelayLimitChaser {
    const info = this.#symbols?.lookup(item.isin);
    return info === undefined ? item : { ...item, name: info.name, code: info.code };
  }

  /**
   * 상따 전량 스냅샷 (64) — **전량 교체**다.
   *
   * 그 사용자의 엔트리를 전부 지우고 새로 넣는다. 병합(upsert)으로 처리하면 게이트웨이에서
   * 사라진 전략이 캐시에 영원히 남는다 — 다른 클라이언트(WinForms)가 지운 전략이 그것이다.
   */
  #onLimitChaserList(userId: string, raw: RelayLimitChaser[]): void {
    // 전량 교체 규율은 그대로다 — 보강만 앞에 얹는다. 캐시와 팬아웃이 **같은 배열**을
    // 쓰므로 두 경로의 이름이 갈릴 수 없다.
    const items = raw.map((item) => this.#enrichLimitChaser(item));
    const prefix = userPrefix(userId);
    for (const key of [...this.#limitChasers.keys()]) {
      if (key.startsWith(prefix)) this.#limitChasers.delete(key);
    }
    for (const item of items) this.#limitChasers.set(lcKey(userId, item), item);
    // 「받았음」 은 캐시 교체와 **같은 자리**에서, 팬아웃 **전에** 기록한다 — 팬아웃 도중
    // 인증하는 연결이 「모름」 을 보고 스냅샷을 빠뜨리는 틈을 두지 않는다 (18-26).
    this.#limitChaserKnown.add(userId);
    logger.info({ userId, count: items.length }, "[HUB] 상따 목록 스냅샷 수신 — 전량 교체");
    this.#fanout(userId, { t: "lc.snap", items });
  }

  /**
   * VI 전략 에코 (61). `cfg === null` 은 **미등록**이며 그 사실도 캐시에 명시로 남긴다 —
   * 「조회했더니 없다」와 「아직 조회한 적 없다」를 구분하기 위해서다.
   *
   * **귀속(어느 거래소의 답인가)이 이 함수의 핵심이다** (17-05 / D-06 / Pitfall 3).
   * 등록본은 **본문의 `cfg.exchange` 가 정본**이고(서버 `BuildVITriggerEcho` 가 반드시 싣는다),
   * 미등록은 본문 자체가 없어 `#pendingViGets` FIFO 의 head 로만 귀속된다. FIFO 가 비어
   * 귀속할 수 없으면 **캐시를 고치지 않는다** — 지어낸 거래소로 귀속하면 사용자가 입력 중인
   * 금액이 엉뚱한 칸에서 지워진다 (T-17-16). 서버 진실을 relay 가 재계산하지 않는 규율이다.
   *
   * ⚠️ 15:40 서버 자동 비활성화의 `run=false` 는 Broadcast 라 유실될 수 있다 (Pitfall 19).
   *    D-13 이 주기 재조회를 금지하므로 여기서 메우지 않는다 — 브라우저가 장 마감 표시로
   *    오해를 막는다.
   */
  #onViTrigger(userId: string, cfg: RelayViTrigger | null): void {
    const queue = this.#pendingViGets.get(userId);
    let exchange: RelayExchange;

    if (cfg === null) {
      // (a) 본문 없음 → head 를 꺼내 귀속한다.
      const head = queue?.shift();
      if (head === undefined) {
        // 귀속 실패. 어느 칸의 답인지 모르는 「미등록」은 **아무 칸에도 쓰지 않는다** —
        // 팬아웃도 하지 않는다(거래소 없는 `vi` 프레임은 계약에 없다).
        logger.warn(
          { userId },
          "[HUB] 거래소를 담지 않은 빈 61 인데 요청 FIFO 가 비었다 — 귀속 불가, 캐시 무변경",
        );
        return;
      }
      exchange = head;
    } else {
      exchange = cfg.exchange;
      // (b) 본문의 거래소 == head → 내 21 의 답이므로 head 를 버린다.
      // (c) 다르면 팬아웃 에코(Set/Disable/푸시)다 — 큐를 건드리지 않는다. 꺼내면 뒤이어 올
      //     빈 61 이 한 칸 밀려 엉뚱한 거래소로 귀속된다.
      if (queue !== undefined && queue[0] === exchange) queue.shift();
    }

    this.#viTriggers.set(viTriggerKey(userId, exchange), cfg);
    logger.info(
      { userId, exchange, registered: cfg !== null, run: cfg?.run ?? false },
      "[HUB] VI 전략 수신",
    );
    // 프레임은 **거래소별**이다 (D-06). `cfg === null`(미등록)일 때도 `x` 가 실린다 —
    // 어느 거래소가 미등록인지 말해야 브라우저가 두 칸을 구분한다.
    this.#fanout(userId, { t: "vi", x: exchange, cfg });
  }

  /**
   * VI 주문 추적 (72 스냅샷 / 73 증분).
   *
   * 스냅샷은 전량 교체, 증분은 **항목별 upsert** 다 — 계좌 상태의 `snap` 규약과 동형이고,
   * `confirm_locked` 되돌림 같은 단건 변경도 73 한 경로로 온다. 73 을 교체로 처리하면
   * 단건 푸시가 나머지 행을 통째로 지운다.
   *
   * 와이어로는 **받은 그대로**(snap 값 유지) 흘리고 캐시에만 병합된 뷰를 둔다.
   */
  #onViOrderList(userId: string, snap: boolean, rawItems: RelayViOrderItem[]): void {
    const items = rawItems.map((item) => this.#enrichViOrder(item));
    if (snap) {
      const prefix = userPrefix(userId);
      for (const key of [...this.#viOrders.keys()]) {
        if (key.startsWith(prefix)) this.#viOrders.delete(key);
      }
    }
    for (const item of items) {
      const key = viOrderKey(userId, item);
      // 접수되며 주문번호가 붙었으면 자리표시 행을 걷어낸다 — 안 그러면 같은 주문이 두 줄이다.
      const pending = viPendingKey(userId, item);
      if (key !== pending) this.#viOrders.delete(pending);
      this.#viOrders.set(key, item);
    }
    logger.info(
      { userId, snap, received: items.length, cached: this.#viOrders.size },
      "[HUB] VI 주문 목록 수신",
    );
    this.#fanout(userId, { t: "vi.list", snap, items });
  }

  /**
   * VI 주문 행에 종목명을 채운다. `#enrichNames`(계좌 계열)와 같은 규율이다 —
   * 맵에 없으면 **필드를 비워 둔다**. ISIN 을 이름 자리에 넣으면 UI 가 "이름이 없다"와
   * "이름이 ISIN 이다"를 구분하지 못한다.
   */
  #enrichViOrder(item: RelayViOrderItem): RelayViOrderItem {
    const info = this.#symbols?.lookup(item.isin);
    return info === undefined ? item : { ...item, name: info.name };
  }

  /** VI 발동 통보(56)의 종목명 보강. 파서는 이 값을 모른다(게이트웨이가 주지 않는다). */
  #enrichViNotice(notice: RelayViNoticeMsg): RelayViNoticeMsg {
    const info = this.#symbols?.lookup(notice.isin);
    return info === undefined ? notice : { ...notice, name: info.name };
  }

  /**
   * 잔고·미체결 행에 종목명·단축코드를 채운다 (게이트웨이는 주지 않는다).
   *
   * 맵에 없는 ISIN 은 **필드를 비워 둔다** — 빈 문자열이나 ISIN 을 이름 자리에 넣지
   * 않는다. UI 가 "이름이 없다"와 "이름이 ISIN 이다"를 구분할 수 있어야, 취소 버튼을
   * 열지 말지(단축코드가 있어야 취소가 나간다)를 스스로 판단한다.
   *
   * 델타(`snap:false`)에도 똑같이 건다. 델타로만 등장하는 종목이 있기 때문이다.
   * 0 수량 톰스톤 행에도 굳이 이름을 붙이는데, 그 행은 삭제 신호로만 쓰이고 사라지므로
   * 해가 없고 분기를 하나 줄인다.
   */
  #enrichNames(state: RelayAccountState): RelayAccountState {
    const symbols = this.#symbols;
    if (symbols === undefined) return state;

    let hit = 0;
    const decorate = <T extends { isin: string }>(row: T): T => {
      const info = symbols.lookup(row.isin);
      if (info === undefined) return row;
      hit += 1;
      return { ...row, name: info.name, code: info.code };
    };

    const hold = state.hold.map(decorate);
    const unf = state.unf.map(decorate);
    const total = state.hold.length + state.unf.length;
    if (hit < total) {
      // 미스는 정상일 수 있다(신규 상장 직후 등). 다만 전량 미스는 맵이 비었다는 뜻이라
      // 원인을 찾을 수 있게 남긴다 — ISIN 은 식별자가 아니므로 건수만 센다.
      logger.info({ resolved: hit, total }, "[SYM] 일부 ISIN 을 종목명으로 풀지 못했다");
    }
    return { ...state, hold, unf };
  }

  /**
   * 캐시 병합 — **기계적**이다. 스냅샷은 전량 교체, 델타는 키 upsert + 0행/`rm` 제거.
   *
   * **서버가 0/0 원소를 지우므로 델타의 0 행이 곧 삭제 신호다** (gh-trade quick-260906-e8b).
   * `AccountManager` 는 보유수량 0·매도가능수량 0 인 잔고를 맵에서 제거하고, 그 사실을
   * `HoldingState{stock_qty:0, sellable_qty:0, avg_price:0}` **톰스톤 행**으로 알린다 —
   * 잔고에는 `removed_order_nos` 같은 삭제 표식이 없다(그 벡터는 미체결 전용이다).
   * 미체결도 같은 규칙을 함께 쓴다: `rm` 이 정규 경로지만 `unfilled_qty == 0` 행도 삭제로 읽는다.
   *
   * 스냅샷에서 0 행을 **거르는** 것은 구버전 게이트웨이 호환이다 — quick-260906-e8b 배포
   * 이전 바이너리는 스냅샷(66)에 0 잔고를 섞어 보낸다.
   *
   * 브라우저(`use-relay-socket.ts` 의 `mergeAccount`)가 **한 글자도 다르지 않은** 규칙을
   * 적용한다. 한쪽만 고치면 새 탭과 기존 탭이 다른 화면을 본다.
   */
  #mergeAccountState(key: string, next: RelayAccountState): RelayAccountState {
    if (next.snap) {
      return {
        ...next,
        snap: true,
        hold: next.hold.filter((h) => h.qty !== 0),
        unf: next.unf.filter((u) => u.unfilledQty !== 0),
        rm: [],
      };
    }

    const prev = this.#accountStates.get(key);
    const holdings = new Map((prev?.hold ?? []).map((h) => [h.isin, h]));
    for (const h of next.hold) {
      if (h.qty === 0) holdings.delete(h.isin);
      else holdings.set(h.isin, h);
    }

    const unfilled = new Map((prev?.unf ?? []).map((u) => [u.orderNo, u]));
    for (const u of next.unf) {
      if (u.unfilledQty === 0) unfilled.delete(u.orderNo);
      else unfilled.set(u.orderNo, u);
    }
    // 삭제 표식은 upsert **뒤에** 적용한다. 같은 프레임이 한 주문을 갱신하면서 동시에
    // 지우라고 말하는 경우, 최종 상태는 "없음"이어야 한다.
    for (const orderNo of next.rm) unfilled.delete(orderNo);

    return {
      t: "acct",
      a: next.a,
      snap: true,
      hold: [...holdings.values()],
      unf: [...unfilled.values()],
      rm: [],
      st: next.st,
    };
  }

  /**
   * 체결은 전역 링버퍼에 쌓고 전역 200ms 배치로 내보낸다 (D-35). 참조계수 없는 키는 `#onQuote` 와 같은 이유로 버린다.
   * 배치 플러시는 키마다 `"market"` tape 1건 — full 소켓 전용(`price: false` · 71 은 price 소켓에 가지 않는다).
   */
  #onTape(tape: RelayTape): void {
    const key = marketKey(tape.i, tape.x);
    if (!this.#refs.has(key)) {
      logger.debug({ isin: tape.i, exchange: tape.x }, "[HUB] 구독 없는 키의 체결 — 버림 (해제 뒤 늦은 프레임)");
      return;
    }

    // 스냅샷(69)은 전량 교체, 증분(71)은 뒤에 이어붙임 — 계약 그대로다.
    const ring = tape.snap ? [] : (this.#tapes.get(key) ?? []);
    ring.push(...tape.e);
    if (ring.length > TAPE_RING_SIZE) ring.splice(0, ring.length - TAPE_RING_SIZE);
    this.#tapes.set(key, ring);

    const current = this.#pendingTapes.get(key);
    if (current === undefined || tape.snap) {
      // 스냅샷은 앞서 쌓인 증분을 무효화한다 — 전량 교체로 승격한다.
      this.#pendingTapes.set(key, { isin: tape.i, exchange: tape.x, snap: tape.snap, entries: [...tape.e] });
    } else {
      current.entries.push(...tape.e);
    }

    this.#armFlush();
  }

  #armFlush(): void {
    if (this.#tapeFlushTimer !== null) return; // 전역 타이머 1개 (D-35)
    this.#tapeFlushTimer = setTimeout(() => {
      this.#tapeFlushTimer = null;
      this.#flush();
    }, TAPE_BATCH_MS);
  }

  #flush(): void {
    if (this.#pendingTapes.size === 0) return;
    for (const [key, pending] of this.#pendingTapes) {
      if (pending.entries.length === 0) continue;
      this.emit("market", {
        key,
        msg: { t: "tape", i: pending.isin, x: pending.exchange, snap: pending.snap, e: pending.entries },
        full: true,
        price: false,
      });
    }
    this.#pendingTapes.clear();
  }

  // ----------------------------------------------------------
  // 내부 — 송신·정리
  // ----------------------------------------------------------

  /**
   * 0→1 전이(와 PRICE→FULL 승격·quote ready 재구독)의 프레임 (D-33 · quick-260923-ge2) — **quote 연결로** 보낸다
   * (Phase 26 D-12 — 사용자 세션으로는 보내지 않는다 · D-03 폴백 없음).
   * FULL 3프레임 = 스냅샷 28 → 구독 29(level=0) → 체결 테이프 32.
   * PRICE 2프레임 = 스냅샷 28 → 구독 29(level=1) — 71 이 오지 않으므로 69 스냅샷도 요청하지 않는다.
   * 순서가 계약이다. 프레임은 직접 보내지 않고 **페이서**(`#pacer.subscribe`)에 넣는다(Pitfall 3 · 26-10) — 창이 비어
   * 있으면 즉시, 차 있으면 앞선 키의 응답(FULL=69 · PRICE=58) 또는 3초 뒤에 나간다. 대기 중 재요청은 level 만 바꾼다.
   */
  #sendSubscribe(isin: string, exchange: RelayExchange, level: RelaySubLevel): void {
    const feed = this.#feed;
    if (feed === null) {
      logger.warn({ isin, exchange, level }, "[HUB] quote 연결 없이 구독 — 참조계수만 기록");
      return;
    }
    if (!feed.isReady) {
      logger.info(
        { isin, exchange, level },
        "[HUB] quote 연결 Ready 이전 — 참조계수만 기록 (ready 에서 전량 재구독)",
      );
      return;
    }
    this.#pacer.subscribe(marketKey(isin, exchange), isin, exchange, level);
    logger.info(
      { isin, exchange, level },
      level === "full"
        ? "[HUB] 신규 구독 — 스냅샷+구독(FULL)+체결 요청을 페이서에 넣음"
        : "[HUB] 신규 구독 — 스냅샷+구독(PRICE) 요청을 페이서에 넣음 (체결 테이프 없음)",
    );
  }

  #onReady(userId: string, session: HubSession): void {
    if (this.#sessions.get(userId) !== session) return;
    // 계좌 재요청·전략 재요청은 **같은 트리거 한 자리**에서만 일어난다 (Pitfall 4).
    // 경로를 두 벌 만들면 "재접속 후 잔고만 안 나온다"·"재접속 후 전략만 안 나온다"가 생긴다.
    // D-13: 이 줄들 말고 사용자별 재조회를 거는 곳은 없다 — 주기 타이머도, 브라우저가 부를 수
    // 있는 수동 새로고침 진입점도 만들지 않는다.
    // 시세 재구독은 여기서 하지 않는다 — **quote 연결 ready 하나다**(Phase 26 D-03 · D-08 · Pitfall 4 재정의).
    // 사용자 세션으로 종목을 되걸면 per-user 경로가 폴백으로 되살아난다.
    this.requestAccountState(userId);
    this.requestStrategySnapshot(userId);
    // 잔량진행률 재동기화 (R2-WR-01) — 게이트웨이 재요청이 **아니다**(83 은 재요청 경로가 없다). Ready 이전
    // 구간(같은 세션 재접속 · 계좌 선언 중)의 83 은 캐시만 바꾸고 팬아웃하지 않았으므로, 그런 83 이 있었을
    // 때만 이미 연결된 탭의 사본을 **현재 캐시 그대로** 맞춘다. 값은 캐시 그대로라 한 세션 안의 D-13
    // 「마지막 값 유지」 를 깨지 않는다 — Ready 이전에 캐시에서 일어난 삭제 · 갱신만 사본에 반영된다.
    if (this.#progressUnsynced.delete(userId)) {
      this.#fanout(userId, { t: "unf.progress", snap: true, entries: this.getQueueProgressEntries(userId) });
    }
    // 4번째 줄은 사용자별 재조회가 **아니다** — 게이트웨이 종목마스터(27)의 relay 전체 1일 1회
    // 요청이고, 게이팅(이번 master-day 에 성공했는가·진행 중인가)은 피드가 쥔다(quick-260923-cqj D-02).
    this.#symbolMaster?.onSessionReady(session);
    // 83 재송신 넛지 (Pattern 10) — 계좌를 (재)선언한 뒤라야 서버 83 이 이 세션(②)에 닿는다. 그 사용자가 쥔(참조 > 0) 키마다
    // 같은 level 29 1건. 본 키(참조 0)는 보지 않는 종목이라 넛지하지 않는다. 시세 재구독이 **아니다**(28 · 32 없음 · D-08).
    const user = this.#userRefs.get(userId);
    if (user !== undefined) {
      for (const [key, held] of user.held) {
        if (held > 0) this.#nudge(key, userId, "사용자 세션 Ready");
      }
    }
  }

  /** **대상은 언제나 userId 하나**다. 전역 브로드캐스트 경로를 만들지 않는다 (T-15-02). */
  #fanout(userId: string, msg: RelayOutbound): void {
    this.emit("fanout", { userId, msg });
  }

  #clearCaches(userId: string): void {
    const prefix = userPrefix(userId);
    // 본 키 기억(Pattern 10) 중 참조 0 인 것을 지운다 — 새 세션은 83 캐시가 비어 있으니 그 키로 돌아오면 다시 넛지해야 한다.
    // 참조 > 0 은 탭이 아직 쥐고 있으므로 남긴다(새 세션의 `ready` 가 그 키들을 넛지한다).
    const user = this.#userRefs.get(userId);
    if (user !== undefined) {
      for (const [key, held] of user.held) if (held === 0) user.held.delete(key);
      if (user.held.size === 0) this.#userRefs.delete(userId);
    }
    // 시세 캐시(`#quotes` · `#tapes`)는 전역이라 여기서 건드리지 않는다 (Phase 26 D-12) — 사용자 세션 교체와 무관하다.
    for (const key of [...this.#accountStates.keys()]) {
      if (key.startsWith(prefix)) this.#accountStates.delete(key);
    }
    // 전략 3맵도 **반드시** 여기서 버린다 (D-12). 빠뜨리면 재로그인·세션 교체 후에도 옛
    // 전략이 캐시에 남아, 인증 직후 스냅샷 팬아웃이 이미 사라진 전략을 화면에 그린다.
    for (const key of [...this.#limitChasers.keys()]) {
      if (key.startsWith(prefix)) this.#limitChasers.delete(key);
    }
    // 「64 받았음」 도 같이 지운다 (18-26) — 남기면 새 세션의 64 가 오기 전 인증한 연결이
    // 방금 비운 캐시를 확정 목록(`lc.snap []`)으로 받는다. 이 사용자 것만 지운다(T-18-110).
    this.#limitChaserKnown.delete(userId);
    // VI 설정은 **거래소별**이라 두 칸을 다 지운다 (17-05 / D-06) — 지우면 `getViTrigger` 가
    // 다시 `undefined`(모름)가 되고, 새 세션의 61 이 도착할 때까지 아무 프레임도 내리지 않는다.
    for (const key of [...this.#viTriggers.keys()]) {
      if (key.startsWith(prefix)) this.#viTriggers.delete(key);
    }
    // 21 요청 FIFO 도 **반드시** 비운다 (규칙 (d) — C# `Client.cs:3038` 동형). 끊기면 아직
    // 답을 못 받은 조회는 영영 오지 않는다. 남겨 두면 다음 세션의 빈 61 이 옛 거래소로
    // 귀속돼 엉뚱한 칸이 「미등록」으로 내려간다.
    this.#pendingViGets.delete(userId);
    for (const key of [...this.#viOrders.keys()]) {
      if (key.startsWith(prefix)) this.#viOrders.delete(key);
    }
    // above 집합도 버린다. 서버가 재로그인마다 78 전량을 다시 주므로 옛 집합을 남길 이유가
    // 없고, 남기면 이미 이탈한 종목이 새 세션의 첫 스냅샷에 섞인다.
    for (const key of [...this.#rateCrossItems.keys()]) {
      if (key.startsWith(prefix)) this.#rateCrossItems.delete(key);
    }
    // 예약창도 버린다 — 키가 userId 자체이므로 지우면 `getQueuedWindow` 가 다시
    // `undefined`(모름)가 되고, 새 세션의 77 이 올 때까지 아무 프레임도 내리지 않는다.
    this.#queuedWindows.delete(userId);
    // 사용자 설정도 버린다(27-01) — 77 과 같은 이유. 새 세션의 84 가 다시 채울 때까지 「모름」으로 둔다.
    this.#userSettings.delete(userId);
    // 잔량진행률도 버린다 — 77 · 78 이 여기 있는 것과 같은 이유다(RESEARCH Pitfall 6 · T-25-26). 남기면
    // 세션 교체 뒤 인증 직후 스냅이 이미 사라진 대기 주문의 진행률을 그린다. 새 세션의 83 이 다시 채운다.
    //
    // **이미 연결된 브라우저 사본도 여기서 같이 비운다 (25-13 · WR-02).**
    // 1. 빈→빈 억제(`#onQueueProgress`)는 「hub 캐시 = 연결된 브라우저 사본」 가정 위에 서 있다. 캐시를
    //    브라우저 모르게 바꾸는 곳은 둘이다 — 여기(세션 교체)와 `#onQueueProgress` 의 Ready 이전 구간(같은
    //    세션 재접속 · 계좌 선언 중, R2-WR-01). 후자는 `#progressUnsynced` 로 표시되고 `#onReady` 가 캐시
    //    그대로 재동기화한다. 사본을 남기면 새 세션의 빈 83 이 `prev === undefined` 억제에 걸려, 삭제가
    //    끝내 브라우저에 가지 않는다.
    // 2. 키마다 snap:false 를 보내지 않고 snap:true 1프레임을 보낸다. 지운 것이 그 사용자 키 **전부**이고,
    //    인증 직후 스냅(`fanout.ts`)과 같은 모양이라 기존 탭과 지금 새로 붙는 탭이 같은 상태로 수렴한다.
    //    `entries` 는 캐시 getter 가 아니라 빈 리터럴이다 — 순서가 바뀌어도 옛 값을 다시 내보내지 않는다.
    // 3. 하나도 안 지웠고 어긋남 표시(`#progressUnsynced`)도 없으면 보내지 않는다. 사본은 캐시를 거쳐
    //    팬아웃된 값뿐이라, 이 둘이 모두 없으면 사본도 비어 있다(교체 소음 0 · T-25-55). 표시가 있으면 캐시가
    //    비었어도 사본에는 Ready 이전에 캐시에서 지워진 옛 값이 남아 있을 수 있어 보낸다(R2-WR-01).
    // 4. ⚠️ 정직하게 적는다 — 오늘 `SessionManager.acquire` 는 탭 0개(refCount 0) · 부트 실패 세션일 때만
    //    세션을 새로 세우므로, 이 프레임을 받을 연결은 보통 없다. `fanout.ts` `#register` 세션 교체 갈래와
    //    같은 이유로 계약을 지킨다 — 재생성 조건이 완화되면 잔존이 조용히 되살아난다.
    // 5. D-13 「마지막 값 유지」 는 한 세션 안의 규칙이다. 그래서 세션 안의 재동기화(`#onReady`)는 비우지
    //    않고 캐시 값을 그대로 다시 보낸다. 대상은 `#fanout` 규율대로 이 userId 하나다(T-15-02).
    let clearedProgress = 0;
    for (const key of [...this.#queueProgress.keys()]) {
      if (!key.startsWith(prefix)) continue;
      this.#queueProgress.delete(key);
      clearedProgress += 1;
    }
    const unsynced = this.#progressUnsynced.delete(userId);
    if (clearedProgress > 0 || unsynced) this.#fanout(userId, { t: "unf.progress", snap: true, entries: [] });
  }

  /**
   * 83 진행률 키(`progressKey` 3단)를 되돌려 읽는다. userId(Supabase uuid)·ISIN(12자 영숫자)·거래소 어디에도
   * `|` 가 들어갈 수 없으므로 분해가 모호하지 않다.
   */
  #splitProgressKey(key: string): { isin: string; exchange: RelayExchange } | null {
    const parts = key.split("|");
    if (parts.length !== 3) {
      logger.warn({ segments: parts.length }, "[HUB] 진행률 키 분해 실패 — 무시");
      return null;
    }
    return this.#exchangeOf(parts[1] ?? "", parts[2] ?? "");
  }

  /** 시세 키(`marketKey` 2단)를 되돌려 읽는다. */
  #splitMarketKey(key: string): { isin: string; exchange: RelayExchange } | null {
    const parts = key.split("|");
    if (parts.length !== 2) {
      logger.warn({ segments: parts.length }, "[HUB] 시세 키 분해 실패 — 무시");
      return null;
    }
    return this.#exchangeOf(parts[0] ?? "", parts[1] ?? "");
  }

  #exchangeOf(isin: string, exchange: string): { isin: string; exchange: RelayExchange } | null {
    if (exchange !== "KRX" && exchange !== "NXT") {
      logger.warn({ exchange }, "[HUB] 알 수 없는 거래소 키 — 무시");
      return null;
    }
    return { isin, exchange };
  }
}
