"use client";

/**
 * Phase 15 Plan 12 → **Phase 16 Plan 09 에서 전역 연결 계층으로 승격** (RELAY-01, D-11/D-22/D-23/D-33/D-36/D-37/D-41).
 *
 * 이 파일은 이제 **연결 1개**만 소유한다(`useRelayConnection`). 종목 축(`isin`/`exchange`)은
 * 여기서 사라졌고, 구독은 참조계수로 관리되며 소비자 경계는 `lib/relay-provider.tsx` 의
 * `useRelaySubscription` 이다.
 *
 * 왜 승격했나(D-22): 사이드바 전략 목록·My page 가 **종목 구독 없이도** 상따·VI 상태를 봐야
 * 한다. 섹션 단위 훅이면 호가주문 탭을 열어야만 전략이 보인다. 또한 화면마다 소켓을 새로 열면
 * DMA 세션이 매번 재수립돼 `SESSION_GRACE_MS` 5분 유예가 무의미해진다(RESEARCH A9).
 *
 * 규율 (전부 이유가 있다):
 *  1. **토큰은 wss 첫 메시지 본문 전용** (D-11). 업그레이드 URL·쿼리스트링에 절대 싣지
 *     않는다 — Caddy 액세스 로그와 브라우저 히스토리에 그대로 남기 때문이다(T-15-04).
 *  2. **구독은 인증 확인 이후** — relay 는 인증 전 `sub`/`unsub` 을 close(4400) 으로
 *     끊는다. relay 가 인증 직후 상태 프레임을 1회 즉시 내려주므로(15-04 연결수명 5)
 *     그 프레임을 인증 ACK 로 삼는다. 인증 전에 들어온 구독 요청은 참조계수에만 쌓아 두고
 *     ACK 시점에 한꺼번에 흘려보낸다(`flushSubscriptions`).
 *  3. **구독 해제를 빠뜨리지 않는다** — relay 는 키별 참조계수로 업스트림 구독을 관리한다.
 *     해제를 빠뜨리면 참조계수가 샌다. 브라우저도 같은 규율을 재현한다: `Map<key, count>` 의
 *     **0→1 에서만 `sub`**, **1→0 에서만 `unsub`**. 소비자가 여럿이어도 와이어는 1벌이다.
 *     카운트는 level 별 `{full, price}` 이고 와이어 level 은 그 합성(full 우선)이다 — 실효
 *     level 이 바뀌면 같은 키로 `sub` 을 다시 보낸다(quick-260923-ge2).
 *  4. **재접속은 유한하다** — 1s→2s→4s→8s… 상한 30s, 시도 상한 10회. 소진하면
 *     `manual_required`. close 4401(인증 실패)은 재시도해도 결과가 같으므로 즉시 확정.
 *     무한 재시도는 우리 스스로에게 거는 DoS 다(T-15-10, D-16).
 *     단, **화면 복귀·망 복구는 새 조건**이라 예산을 새로 주고 남은 백오프를 버린다 — 트리거가
 *     사람·망 사건이라 폭주가 되지 않는다(debug mobile-bg-resume-gaps 3).
 *  5. **재접속 중 데이터를 지우지 않는다** — `isStale` 만 세우고 마지막 값을 유지한다.
 *     빈 화면으로 되돌리면 사용자가 문맥을 잃는다(UI-SPEC §재접속·거래소 전환).
 *  6. **주문도 이 소켓으로 보낸다** (D-02 — Phase 15 D-08 을 대체). `POST /api/orders` REST
 *     경로는 없어진다. 요청/응답 상관은 브라우저가 만든 `rid` 이고, 첫 접수/거부는
 *     `{t:"order.result"}` 1건으로 온다. 이후 체결·취소확인은 `{t:"order"}` 푸시다.
 *  7. **시세·체결은 키별 맵에 담는다** — 전역 연결에는 여러 종목이 섞이므로 「내 키에
 *     해당하는 것만 고르기」는 **소비자 책임**이다(T-16-02). 승격 전의 `wantedKeyRef` 지연
 *     프레임 필터가 `useRelaySubscription` 으로 옮겨진 이유다.
 *  8. **시세·체결(q/tape)은 `RELAY_MARKET_BATCH_MS` 모아 한 번에 적용한다** (quick-260923-elb).
 *     컨텍스트가 1개라 상태가 프레임마다 바뀌면 `/trading` 트리 전체가 **어느 종목의 틱이든**
 *     다시 그려진다 — 돌파 40종목이 붙으면 프레임 600/s 가 커밋 140/s 로 번져 팬리스 노트북
 *     한 코어를 채웠다(debug `trading-cpu-260923`). 배치는 커밋 수에 상한(≈10/s)을 건다.
 *     주문·통보·계좌·전략·VI·메시지·상태 프레임은 **지연하지 않는다** — 도착하면 대기 중인
 *     시세·체결을 먼저 떼어 **같은 dispatch** 로 함께 적용해 도착 순서를 보존한다.
 *     `order.result` 는 원래 dispatch 밖(rid 상관 Promise)이라 영향이 없다.
 *  9. **복귀하면 소켓을 의심한다** (debug mobile-bg-resume-gaps 2). 오래 숨겼다 돌아오거나
 *     (`RELAY_RESUME_MIN_HIDDEN_MS`) 망이 붙거나 bfcache 에서 살아나면, OPEN 소켓이라도 새
 *     프레임이 건너오는지 `RELAY_RESUME_PROBE_MS` 동안 지켜보고 안 오면 새로 연다. relay 는
 *     pong 없는 소켓을 terminate 하지만 그 FIN 이 이쪽에 닿는다는 보장이 없다(망 전환).
 *
 * 파싱 실패 프레임은 throw 하지 않고 **스킵**한다 — `chat-sse.ts` 파서 선례(T-15-41).
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { resolveRelayWsUrl } from "@/lib/relay-url";
import { compareJournalNewestFirst } from "@/lib/orders-api";
import { indexUnfilled, type OrderIndexEntry } from "@/lib/trading-alerts";
import {
  isMarketCloseReleaseNotice,
  limitChaserGateDisarmed,
  marketCloseReleaseKeysOf,
} from "@/lib/limit-chaser";
import {
  RELAY_STATE_LABELS,
  RELAY_WS_CLOSE,
  type JournalOrderRow,
  type RelayAccount,
  type RelayAccountState,
  type RelayExchange,
  type RelayHolding,
  type RelayInbound,
  type RelayJournalStateMsg,
  type RelayLimitChaser,
  type RelayOrderCancelMsg,
  type RelayOrderModifyMsg,
  type RelayOrderMsg,
  type RelayOrderNewMsg,
  type RelayOrderResultMsg,
  type RelayOutbound,
  type RelayQuote,
  type RelayServerMsg,
  type RelaySessionState,
  type RelaySubLevel,
  type RelayTape,
  type RelayStrategiesDisabledMsg,
  type RelayQueuedWindowMsg,
  type RelayRateCrossItem,
  type RelayTapeEntry,
  type RelayUnfilled,
  type RelayViNoticeMsg,
  type RelayViOrderItem,
  type RelayViTrigger,
} from "@gh-radar/shared";

// ============================================================
// 상수 — 상한은 한 곳에만 둔다(두 곳에 복제하면 어긋난다)
// ============================================================

/** 체결 테이프 링버퍼 상한. relay 캐시와 동일(UI-SPEC §체결 테이프 스크롤). */
const MAX_TAPE = 200;
/**
 * 시세·체결(q/tape) 프레임 배치 창 (quick-260923-elb 1a · 파일 상단 규율 8).
 *
 * ★ 100 인 이유: 진단 어블레이션에서 최악 시나리오(3카드 + 돌파 40 · 도착 분산)의 메인스레드가
 *   배치 없음 98.8% · 16ms 49.9% · **100ms 20.2%** 였다. 게이트웨이가 시세를 100ms 틱
 *   (`TickOnce`)으로, relay 가 체결을 200ms(`TAPE_BATCH_MS`)로 이미 묶어 보내므로 표시 지연은
 *   게이트웨이 1틱 이하다.
 * ★ rAF 가 아니라 타이머인 이유: 백그라운드 탭에서 rAF 는 **멈춘다** — 탭을 오가면 시세가
 *   통째로 굳는다. 타이머는 느려질 뿐 멈추지 않는다(아래 `RELAY_MARKET_BUFFER_MAX` 참조).
 * ★ 합치는 것은 q/tape **뿐**이다. 주문·통보·VI·상따 같은 거래 신호는 지연 0 이다.
 */
export const RELAY_MARKET_BATCH_MS = 100;
/**
 * 시세·체결 대기 버퍼 상한. 이 수에 닿으면 창을 기다리지 않고 즉시 적용한다.
 *
 * 숨은 탭의 타이머는 ≥1s 로 늦춰지는데, 최악 600프레임/s 라도 대기 메모리를 묶어 두기 위한
 * 안전판이다(T-elb-03). 정상 창(100ms)에서는 닿지 않는다.
 */
export const RELAY_MARKET_BUFFER_MAX = 1000;
/** ServerMessage 누적 상한. 상태 바는 이 중 최근 3건만 렌더한다(C3). */
const MAX_MESSAGES = 20;
/** 주문 통보 누적 상한. */
const MAX_ORDERS = 50;
/**
 * 저널 행 보관 상한 (Phase 19 D-03 · T-19-26).
 *
 * 주문 1건 = 1행(같은 주문의 갱신은 같은 `id` 에 덮인다)이라 하루치도 수백 행이다. 상한은
 * 세션이 여러 날 이어지거나 relay 가 비정상으로 쏟아낼 때의 **메모리 방어**일 뿐이다 —
 * 넘으면 `createdAt` 이 가장 오래된 쪽부터 버린다(화면은 REST 복원이 오늘 전량을 다시 준다).
 */
export const MAX_JOURNAL_ROWS = 2000;
/** VI 발동 통지 누적 상한. 표시·이력용이라 오래된 건은 버린다. */
const MAX_VI_NOTICES = 50;
/**
 * 전부 정지(`strategies.disable`) 뒤 65 를 기다리는 상한(ms) — **상태 카드와 소켓 훅의 유일한 값**
 * (quick-260926-nr2 에서 `strategy-status-card.tsx` 로컬 상수를 이리로 옮겼다).
 *
 * 상태 카드: 넘기면 버튼을 다시 연다. 서버가 60/61 에코를 **먼저** 보내므로 이 시점의 목록은
 * 이미 정확하다 — 다시 눌러도 같은 일(전부 끄기)이 한 번 더 나갈 뿐이라 위험하지 않다. 영원히
 * 잠그는 쪽이 나쁘다.
 * 소켓 훅: 이 브라우저의 전부 정지 in-flight 창(에코 원인 귀속)의 **백스톱** 경계다. 「65 유실」을
 * 선언하는 시각이 두 곳에서 같아야 하므로 같은 상수를 쓴다.
 */
export const STRATEGIES_DISABLE_ACK_TIMEOUT_MS = 8_000;
/**
 * 등락률 돌파 above 집합 상한 (17-03).
 *
 * ⚠️ **서버 above 집합보다 작게 잡지 않는다.** 이 값이 서버 집합 크기 아래면 78 전량
 *    교체가 조용히 잘려 「돌파했는데 목록에 없다」가 된다. 서버는 임계−2%p 이탈 시
 *    원소를 빼므로 집합이 무한히 자라지 않는다 — 200 은 그 위의 여유다.
 */
const MAX_RATE_CROSS = 200;
/**
 * 재접속 시도 상한 (D-16). 소진 시 `manual_required`.
 * 상태 바가 `재접속 중 k/10` 을 그릴 때도 이 값을 쓴다 — 상한을 두 곳에 복제하면 어긋난다.
 */
export const RELAY_MAX_RECONNECT_ATTEMPTS = 10;
/**
 * 복귀 탐침을 거는 최소 숨김 시간 = relay 하트비트 1주기 (debug mobile-bg-resume-gaps 2).
 *
 * relay 는 30초마다 ping 을 보내고 **다음 주기까지** pong 이 없으면 소켓을 terminate 한다
 * (`relay/src/ws/fanout.ts` `HEARTBEAT_INTERVAL_MS` · `#sweep`). 그러니 이보다 짧게 숨겼다면
 * relay 가 이 소켓을 정리했을 수 없다 — 탭을 잠깐 오갈 때마다 탐침하지 않는다.
 * relay 값을 바꾸면 이 값도 같이 본다.
 */
export const RELAY_RESUME_MIN_HIDDEN_MS = 30_000;
/**
 * 복귀 탐침 창. 이 안에 (아래 settle 이후) 프레임이 하나도 안 오면 **죽은 OPEN 소켓**으로 보고
 * 새로 연다. 장중 구독이 하나라도 있으면 시세가 100ms 틱으로 흐르므로 살아 있는 소켓은 곧바로
 * 판별된다. 조용한 소켓(장외·구독 0)을 다시 여는 것은 무해하다 — 유예 5분 안이라 relay 가
 * 같은 DMA 세션을 재사용하고, 인증 직후 스냅샷이 다시 온다.
 */
export const RELAY_RESUME_PROBE_MS = 5_000;
/**
 * 복귀 직후 이 시간 안에 도착한 프레임은 탐침 판정에 **세지 않는다.**
 *
 * 얼어 있는 동안 브라우저 네트워크 계층에 쌓였던 프레임이 복귀 순간 한꺼번에 배달된다. 그
 * 뒤 망이 바뀌어 TCP 가 죽었다면(Wi-Fi → LTE) 그 프레임들은 「살아 있다」의 증거가 아니다.
 * 복귀 뒤에 **새로** 건너온 프레임만 경로가 살아 있음을 증명한다.
 */
export const RELAY_RESUME_PROBE_SETTLE_MS = 2_000;
/** 지수 백오프 시작 지연. */
const BACKOFF_BASE_MS = 1_000;
/** 연결 effect 밖(비활성·언마운트 뒤)의 `probeNow` — 아무것도 하지 않는다. */
const NOOP_PROBE = () => {};
/** 지수 백오프 상한. */
const BACKOFF_MAX_MS = 30_000;
/** 정상 종료 close 코드. */
const NORMAL_CLOSE_CODE = 1000;
/**
 * 주문 상관 응답 대기 **백스톱**. relay 는 첫 `OrderResp(51)` 을 5초까지 기다린 뒤
 * `status:"timeout"` 을 반드시 돌려주므로(D-02) 정상 경로에서는 이 타이머가 발화하지 않는다.
 * 소켓이 조용히 죽어 relay 의 응답 자체가 오지 않는 경우에만 쓰인다 — 없으면 Promise 가
 * 영원히 매달려 주문 버튼이 잠긴 채로 남는다.
 */
const ORDER_RESULT_BACKSTOP_MS = 10_000;
/**
 * `WebSocket.OPEN`. 전역 `WebSocket` 의 정적 상수를 참조하지 않는 이유는 테스트가
 * 전역을 fake 클래스로 대체하기 때문이다 — 숫자 리터럴이 계약이다(RFC6455).
 */
const WS_READY_OPEN = 1;

/**
 * 구독 제어 프레임(`sub`/`unsub`) 송신 속도 — 초당 6건 · 버스트 6 (quick-260923-kq1).
 *
 * relay 는 연결당 인바운드를 **초당 10건 · 버스트 10** 토큰 버킷으로 막고, 넘친 프레임은
 * **조용히 버린다**(`fanout.ts` `INBOUND_RATE_LIMIT_PER_SEC` · 응답 없음). 재접속·새로고침 때
 * 돌파 칩(≤40)과 카드 구독을 한 번에 흘리면 앞 10건만 살고 나머지 카드 구독이 사라져 호가·체결이
 * 영영 비었다(2026-09-23 13:39 relay 로그 「인바운드 상한 초과」). 그래서 구독 제어는 이 버킷으로
 * 나눠 보내고, 남는 초당 4건은 전략·주문 프레임 몫으로 비워 둔다 — 구독 폭주가 주문을 밀어내면 안 된다.
 * 값을 올릴 때는 relay 상한과 **합계**로 따져라.
 */
const SUB_FRAME_RATE_PER_SEC = 6;
const SUB_FRAME_BURST = 6;

/**
 * 백오프 지연 계산. attempt 는 1-based.
 * 상태 바의 `(다음 n초)` 안내도 이 함수를 통과시킨다(단일 정본).
 */
export function relayBackoffDelayMs(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
}

/**
 * 시세·체결·구독 키 (D-33 — 시세 키는 `isin + exchange`).
 *
 * 전역 맵의 키이자 구독 참조계수의 키다 — 두 축이 어긋나면 「구독은 했는데 값을 못 찾는」
 * 상태가 생기므로 **한 함수만** 쓴다.
 */
export function relayQuoteKey(isin: string, exchange: RelayExchange): string {
  return `${isin}|${exchange}`;
}

/** 키당 level 별 구독 참조계수 (quick-260923-ge2). */
type SubRefEntry = { isin: string; ex: RelayExchange; full: number; price: number };

/** 와이어 실효 level — full 소비자가 하나라도 있으면 full. */
function effectiveSubLevel(entry: SubRefEntry): RelaySubLevel {
  return entry.full > 0 ? "full" : "price";
}

/** `sub` 프레임. `lv` 는 price 일 때만 싣는다 — full 은 종전 모양 그대로(옛 relay 호환). */
function subFrameOf(entry: SubRefEntry): RelayInbound {
  return effectiveSubLevel(entry) === "price"
    ? { t: "sub", isin: entry.isin, ex: entry.ex, lv: "price" }
    : { t: "sub", isin: entry.isin, ex: entry.ex };
}

// ============================================================
// 공개 타입
// ============================================================

/** 아직 연결을 시작하지 않은 상태(`idle`)를 더한 훅 표면 상태. */
export type RelayStatus = RelaySessionState | "idle";

/**
 * ServerMessage + **수신 시각**.
 *
 * `RelayServerMsg`(54) 에는 시각 필드가 없는데 UI-SPEC C3 는 알림을 `시각·레벨·본문`
 * 으로 렌더하라고 못박았다. 서버가 주지 않는 값이므로 **브라우저 수신 시각**을
 * 여기서 한 번만 찍는다 — 렌더 때마다 만들면 값이 계속 흔들린다.
 * `RelayServerMsg` 의 상위집합이라 계약 소비자 쪽 타입은 그대로 성립한다.
 */
export type RelayServerMessageEntry = RelayServerMsg & {
  /** `HH:MM:SS` (로컬 시각). */
  receivedAt: string;
};

/**
 * 알림 수신 시각 스탬프. 24시간제 `HH:MM:SS`.
 *
 * **msg 프레임에서만 호출한다** — 매 프레임 호출이 포화 프로파일 단독 2.7% 였다
 * (quick-260923-elb). 다른 프레임은 이 값을 쓰지 않는다.
 */
function clockStamp(now: Date): string {
  return now.toLocaleTimeString("ko-KR", { hour12: false });
}

/**
 * 거래소별 VI 전략 3상태 (17-06 / D-06).
 *
 * `Partial` 이 **키 부재 = 아직 모름**을 표현한다. `null` 은 「조회했고 미등록」이라
 * 뜻이 다르므로 둘을 같은 값으로 접으면 안 된다(빈 61 이 사용자 입력을 지우는 CR-01).
 */
export type RelayViTriggers = Partial<Record<RelayExchange, RelayViTrigger | null>>;

/**
 * VI 전략이 존재할 수 있는 거래소 전수. relay 의 `VI_PREFETCH_EXCHANGES`(17-05) 와 같은
 * 집합이고, 순회 순서도 표시 순서(KRX → NXT)와 같다.
 */
export const VI_EXCHANGES: readonly RelayExchange[] = ["KRX", "NXT"];

/**
 * 두 거래소 중 **하나라도** 가동 중인가 (D-18 합집합 판정).
 *
 * ★ 판정을 한 함수로 모으는 이유: 사이드바·My page·전략 현황 세 화면이 같은 질문에
 *   각자 답하면 언젠가 한 곳만 고쳐지고, 그때 사용자는 「사이드바는 가동인데 My page 는
 *   중지」를 본다. 어느 쪽이 맞는지 화면만 보고는 알 수 없다.
 *
 * ★ 모르는 거래소(키 부재)는 **가동이 아니다.** 모름을 가동으로 읽으면 연결 직후 잠깐
 *   「가동」이 떴다가 사라지고, 그 깜빡임은 실제 등록과 구분되지 않는다.
 */
export function viAnyRunning(triggers: RelayViTriggers): boolean {
  for (const exchange of VI_EXCHANGES) {
    if (triggers[exchange]?.run === true) return true;
  }
  return false;
}

/**
 * **종목 축이 없는** 전역 상태 표면. 사이드바·My page 처럼 구독 없이 전략만 보는 화면이
 * 그대로 소비한다. 종목별 시세·체결은 `quotes`/`tapes` 맵에서 **키로 골라** 쓴다.
 */
/**
 * 상따 60 에코가 **발주가 아니라 비활성화의 결과**인 원인 (quick-260926-nr2).
 *  - `"killSwitch"`  : **이 브라우저**가 보낸 전부 정지(`strategies.disable`)의 에코
 *  - `"marketClose"` : 서버 15:40 KRX 자동 해제(`Server::DisableKrxLimitChasers`)의 에코
 */
export type LimitChaserDisableCause = "killSwitch" | "marketClose";

/** 귀속 1건 — 그 원인으로 온 **에코 객체 그대로**와 원인. 소비자는 객체 동일성으로 대조한다. */
export type LimitChaserDisableEcho = { echo: RelayLimitChaser; cause: LimitChaserDisableCause };

/** 빈 귀속 맵 — 모듈 상수 하나(참조가 같으면 소비자 이펙트가 재실행되지 않는다). */
const EMPTY_DISABLE_ECHOES: ReadonlyMap<string, LimitChaserDisableEcho> = new Map();
/** 빈 15:40 대기 키 집합 — 모듈 상수 하나. */
const EMPTY_KEYS: ReadonlySet<string> = new Set();

export interface RelayConnectionState {
  /** 세션 상태. 배지·주문 버튼 활성 여부의 정본. */
  status: RelayStatus;
  /** `RELAY_STATE_LABELS[status]`. `idle` 은 빈 문자열. */
  statusLabel: string;
  /** 서버가 보낸 보조 문구(`{t:"state"}.msg`). 없으면 빈 문자열. */
  statusMessage: string;
  /** 재접속 시도 회차 (1-based, 미재접속 시 0). */
  attempt: number;
  /** 허용 계좌 목록. **빈 배열인 `ready` 는 정상**이다(mock 로그인 — shared 주의 참조). */
  accounts: RelayAccount[];
  /** `isin|exchange` → 호가 10단. 여러 종목이 섞여 있으므로 **키로 골라 쓴다**(T-16-02). */
  quotes: ReadonlyMap<string, RelayQuote>;
  /** `isin|exchange` → 체결 테이프. **최신이 index 0**, 키당 상한 200. */
  tapes: ReadonlyMap<string, RelayTapeEntry[]>;
  /**
   * **계좌번호 → 병합된 계좌 상태** (16-15). 잔고·미체결 병합 결과이며, 델타는
   * upsert + 0행/`rm` 제거 후 스냅샷 형태로 정규화된다.
   *
   * relay 는 인증 직후 캐시된 계좌 상태를 **계좌마다 한 프레임씩** 내려보낸다
   * (`fanout.ts` — `hub.getAccountStates(userId)` 전량). My page 는 계좌별 미체결·잔고를
   * 세로로 반복하므로(D-21) 계좌마다 자기 상태가 필요하다.
   *
   * ★ **계좌축 소비자는 이것만 쓴다.** 「마지막 수신 계좌」 단일 값(`account`)은
   *   16-23 에서 계약에서 **제거됐다** — 그 값을 계좌 축에 쓰면 머리와 행이 서로 다른
   *   계좌가 되고, 그 행의 `✕ 취소` 가 A 계좌로 B 의 주문번호를 보낸다(CR-01).
   *   필드를 남겨 두면 다음 소비자가 같은 실수를 반복하므로 표면 자체를 없앴다.
   *
   * ⚠️ 병합은 **계좌별로** 한다. 이전 구현은 `prev.a !== next.a` 를 전량 교체로 처리해서
   *    계좌 B 의 델타가 계좌 A 의 스냅샷을 통째로 밀어냈다.
   */
  accountStates: ReadonlyMap<string, RelayAccountState>;
  /**
   * **주문번호 → 그 주문의 종목·계좌 사실** — add-only 색인 (quick-260923-pgu).
   *
   * `RelayOrderMsg` 에는 종목·계좌·방향·이름이 없다(Pitfall 8). 작업대 이벤트 알림은 주문번호로
   * 이 색인을 조인한다. 원천은 **원시 `acct` 프레임의 `unf` 행**이고, `mergeAccount` 가 `unfilledQty
   * === 0` 행을 버리기 **전에** 채운다 — 한 델타 안에서 접수+전량 체결된 주문(상따 매수에 흔하다)은
   * `accountStates` 에 한 번도 남지 않기 때문이다. 삭제·덮어쓰기 없음(먼저 본 값이 정본) · 새 행이
   * 없는 프레임은 참조를 유지한다. 비우는 것은 `reset`(로그아웃 · 비활성화)뿐 — `accountStates` ·
   * `orders` 와 같은 규칙이다(재접속 스냅샷은 그대로 두고 추가만 한다).
   *
   * ⚠️ 표시·카드 매칭 전용이다. 미체결 목록·취소 대상의 원천은 여전히 `accountStates` 하나다.
   */
  orderIndex: ReadonlyMap<string, OrderIndexEntry>;
  /**
   * 주문 통보 누적(최신 우선).
   *
   * ⚠️ Phase 19 D-03 이후 **토스트·전략 로그 전용**이다. 「오늘 주문」 카드는 이것을 병합하지
   *    않는다 — 카드의 원천은 REST 복원과 아래 `journalRows` 둘뿐이다.
   */
  orders: RelayOrderMsg[];
  /**
   * 관찰자 기록기가 민 저널 행 (`{t:"journal.rows"}` · Phase 19 D-03).
   *
   * relay 가 **이 사용자가 접근할 수 있는 계좌**의 행만 보낸다(19-05 · T-19-02). 같은 `id` 는
   * `lastSeq` 가 큰 쪽이 이긴다(같거나 작은 행은 버린다 — T-19-27 표시 역전 방지). 정렬은
   * `createdAt` 내림차순, 상한 `MAX_JOURNAL_ROWS`. 비우는 것은 `reset`(로그아웃)뿐이다(T-19-16).
   * 날짜를 거르지 않는다 — 「오늘」 판정은 소비자(`mergeJournalRows`)가 한다.
   */
  journalRows: JournalOrderRow[];
  /**
   * 기록 연결 상태의 최신 프레임 (`{t:"journal.state"}` · Phase 19 D-04). 아직 못 받았으면 null.
   * 카드는 `delayed → live` 전이에서 한 번 다시 조회해 끊긴 사이 채워진 행을 가져온다.
   */
  journalState: RelayJournalStateMsg | null;
  /** ServerMessage 누적(최신 우선, 상한 20). 각 항목에 수신 시각이 붙어 있다. */
  messages: RelayServerMessageEntry[];
  /** 재접속 중이라 표시값이 마지막 수신값임을 뜻한다(UI 는 `opacity:.55` 감쇠). */
  isStale: boolean;
  /** 등록된 상따 전략 전수 (D-12 스냅샷 + 60 에코). `crud:"D"` 는 담기지 않는다. */
  limitChasers: RelayLimitChaser[];
  /**
   * 마지막으로 도착한 **60 에코 1건 그대로** — `crud:"D"` 를 포함한다.
   *
   * ★ `limitChasers` 와 답하는 질문이 다르다. 저쪽은 「지금 무엇이 등록돼 있는가」이고
   *   이쪽은 **「서버가 방금 답했는가」**다. 한 값으로 두 질문에 답하게 하면 안 된다:
   *   `limitChasers` 는 계약상 `crud:"D"` 를 떨어뜨리므로, **등록된 적 없는 전략에 대한
   *   철거 에코**는 저 목록을 한 글자도 바꾸지 못한다. 그때 「응답 유무」를 저 목록의
   *   변화로 읽으면 서버가 분명히 답했는데도 화면이 영원히 「모른다」를 말한다
   *   (debug `lc-unacked-stuck-new-route` — 2026-09-21 프로덕션 장중 차단 사고).
   *
   * ⚠️ 64 스냅샷(`lc.snap`)은 **여기에 담지 않는다.** 스냅샷은 재접속 복원이지 내 요청에
   *    대한 답이 아니다 — 담으면 재접속만으로 「미반영」이 거둬져 거짓 안심이 된다.
   * ⚠️ 이 값으로 **목록을 만들지 않는다.** 등록 여부의 정본은 위 `limitChasers` 하나다.
   */
  lastLimitChaserEcho: RelayLimitChaser | null;
  /**
   * 「이 60 에코는 발주가 아니라 **비활성화의 결과**다」 — 전략 키 → 그 에코 객체 + 원인
   * (quick-260926-nr2).
   *
   * 에코의 `buyEnabled` 는 무장 상태라 true→false 는 보통 「발주로 게이트가 소진됐다」로 읽힌다
   * (Pitfall 10). 그런데 이 브라우저의 전부 정지와 서버 15:40 KRX 해제도 같은 모양의 에코를 낸다 —
   * 그 둘만 여기서 원인을 붙인다. 귀속 경계:
   *  - 전부 정지: `send({t:"strategies.disable"})` 성공 ~ 65 수신 / 연결 수명 종료 /
   *    `STRATEGIES_DISABLE_ACK_TIMEOUT_MS` 백스톱. 65 는 서버 핸들러의 마지막 프레임이라 키별
   *    에코가 모두 그 앞에 온다.
   *  - 15:40: `isMarketCloseReleaseNotice` 통지 시점의 KRX 무장 키(`marketCloseReleaseKeysOf`) 각각의
   *    **첫 에코**가 게이트를 끄면 귀속. 통지가 에코보다 먼저 온다.
   *
   * ★ 소비자는 **에코 객체 동일성**(`entry.echo === server`)으로 대조한다 — 나중 lc.snap 객체나 다음
   *   에코는 절대 맞지 않는다. 그 키의 다음 에코가 귀속 없이 오면 항목이 빠지고, `lc.snap` 은 맵을 비운다.
   * ⚠️ 다른 단말(같은 사용자의 다른 탭·기기 포함)의 전부 정지는 여기 **표현되지 않는다** — 그 탭에는
   *    에코가 65 보다 먼저 오므로 원인을 알 시점이 없다(Pitfall 10 의 알려진 한계).
   */
  limitChaserDisableEchoes: ReadonlyMap<string, LimitChaserDisableEcho>;
  /**
   * VI 전략 설정 — **거래소별 3상태**다 (17-06 / D-06).
   *
   * 서버가 VI 전략을 **거래소마다 1건**으로 관리하므로 relay 도 캐시·프레임을 거래소별로
   * 내려준다(17-05). 3상태의 뜻은 거래소마다 **독립**이다:
   *  - 키 부재(`undefined`) : 그 거래소는 아직 스냅샷을 못 받았다(연결 전·인증 전)
   *  - `null`               : 그 거래소를 조회했고 **미등록**이다(서버가 빈 응답을 보냈다)
   *  - 객체                 : 그 거래소에 등록돼 있다
   *
   * ⚠️ 단수 필드(`viTrigger`)를 **별칭으로도 남기지 않는다.** 남기면 「어느 거래소의 값인지
   *    모르는 소비처」가 조용히 살아남고, KRX-only 세션에서 뒤에 온 NXT 프레임이 방금 읽은
   *    KRX 설정을 덮는다(17-05 가 스냅샷을 2프레임으로 넓히며 남긴 결함).
   */
  viTriggers: RelayViTriggers;
  /**
   * VI 주문 추적 목록 (72 스냅샷 / 73 델타 병합 결과).
   *
   * 정렬은 `deadline110Ms` **내림차순**(최신 발동이 맨 앞 — 사용자 결정 2026-09-23 ·
   * quick-260923-dmb) · 동률이면 주문번호 있는 행 먼저(주문번호 ↓) · 시각 모름(≤0)은 맨 뒤 —
   * 리듀서 `sortViOrdersNewestFirst` 한 곳이 72·73 두 갈래 모두에 건다. `deadline110Ms` 는
   * 발동마다 고정이라 73 갱신은 자리를 지키고 새 발동만 맨 앞으로 들어온다. 표시 컴포넌트
   * (VI 칩 줄 · 작업대 VI 표)는 이 순서를 그대로 쓰고 다시 정렬하지 않는다.
   */
  viOrders: RelayViOrderItem[];
  /** VI 발동 통지 누적(최신 우선, 상한 50). */
  viNotices: RelayViNoticeMsg[];
  /**
   * 전략 일괄 비활성화의 **완료 신호**(65). 마지막 1건만 보관한다.
   * ⚠️ 여기 담긴 숫자로 목록 상태를 만들지 않는다 — 행 갱신은 이미 60/61 에코가 끝냈다.
   */
  strategiesDisabled: RelayStrategiesDisabledMsg | null;
  /**
   * 등락률 돌파 above 집합 (76 upsert / 78 전량 교체). **relay 가 보관한 서버 집합 그대로**다.
   *
   * ⚠️ 하루 1회 알림 규칙과 임계−2%p 이탈 삭제는 **이 목록에 반영돼 있지 않다** — 그 표시
   *    규칙은 화면(Phase 18)의 몫이고, relay 는 서버 집합을 가공하지 않는다 (D-03).
   *
   * 정렬은 `exchangeTime` **내림차순**(최신 돌파가 맨 위 — 사용자 결정 2026-09-22) · 동률이면
   * `isin` 오름차순 — relay `sortRateCrossNewestFirst` 와 같은 축이다. 표시 컴포넌트는 이 순서를
   * 그대로 쓰고 다시 정렬하지 않는다 (D-14).
   *
   * **종목당 1원소**다(키 = isin) — 서버 상태가 ISIN 당 1개이고(gh-trade quick-260923-cfo 결정 A)
   * 원소의 `exchange` 는 발화 거래소(KRX/NXT)다 (quick-260926-rcc).
   */
  rateCrossItems: RelayRateCrossItem[];
  /**
   * 78(전량 교체)을 적용한 횟수 (Phase 18 D-17 · 18-08).
   *
   * `rateCrossItems` 배열만으로는 76(upsert)과 78(스냅샷)을 가를 수 없다 — 둘 다 새 배열이다.
   * 그런데 화면 규칙은 둘을 다르게 다룬다: 78 로 들어온 종목은 **무음·무강조**, 76 은 알림음 +
   * 30초 강조. 돌파 스트립은 이 값이 바뀐 렌더의 새 종목을 스냅샷 유래(`silent`)로 기록한다.
   * 연결 전·리셋 후 0 이다. 값 자체에 의미는 없고 **바뀌었는가**만 읽는다.
   */
  rateCrossSnapSeq: number;
  /**
   * **이번 `ready` 구간에서** 받은 확정 64 스냅샷(`lc.snap`) 수 (Phase 18 D-02 · WR-07 · 18-22 ·
   * 18-26 GC-IN-02). 0 = 아직 못 받았다.
   *
   * `limitChasers` 배열만으로는 「64 를 받았는가」를 알 수 없다 — 60 에코로 채워진 목록도, 옛
   * 연결에서 남은 목록도 같은 배열이다. relay 는 게이트웨이 64 를 받은 뒤에만 `lc.snap` 을
   * 내리므로(18-26) **받은 스냅샷은 빈 배열도 확정**(「등록 전략 없음」)이다. 작업대는 이 값
   * 하나로 포커스 요청(사이드바 · `?focus=`)의 보류를 판정한다(`knowsRegistered = snapSeq > 0`).
   *
   * 세션이 `ready` 로 **전환**될 때(새 연결의 인증 ACK 포함) 0 으로 돌아간다 — relay 는 세션이
   * ready 가 될 때마다 24 를 다시 보내 새 64 가 오므로, 그 전의 미스를 옛 연결의 목록으로 버리지
   * 않고 보류한다. `ready → ready` 반복 프레임은 건드리지 않는다. 리셋 후에도 0 이다.
   *
   * ⚠️ `status` 로 추론하지 않는다 — 인증 ACK(state) 가 `lc.snap` 보다 먼저 오므로
   *    `ready` 인데 스냅샷은 아직인 구간이 있다(relay `fanout.ts` 인증 직후 순서).
   */
  limitChaserSnapSeq: number;
  /**
   * 예약·장전·시간외종가 발주 창 상태 — **2상태**다.
   *  - `undefined` : 서버가 77 을 아직 한 번도 안 줬다(연결 전·인증 전)
   *  - 객체        : 서버가 말한 마지막 창 상태
   *
   * ⚠️ 여섯 값 전부 **표시 힌트**다. 벽시계로 창을 다시 판정하지 않는다 — fbs 주석과
   *    `docs/features/queued-order.md` 의 시각이 엇갈리므로 `open` 플래그만 믿는다.
   */
  queuedWindow: RelayQueuedWindowMsg | undefined;
  /**
   * NXT 거래가능 ISIN 집합 — **2상태**(quick-260923-pq2).
   *  - `null` : relay 가 `nxt.snap` 을 아직 안 줬다(연결 전 · 구 relay · relay 가 57 을 못 받음)
   *             → 화면은 KRX|NXT 둘 다 그린다
   *  - Set    : 확정 집합(빈 Set 도 확정)
   * 프레임마다 **통째 교체**다. 원천은 게이트웨이 57 `nxt_tradable` 하나다.
   */
  nxtTradable: ReadonlySet<string> | null;
  /**
   * 송신구. 구독 제어(`sub`/`unsub`)와 **전략 설정**(`lc.set`/`vi.set`/`vi.confirm`/
   * `strategies.disable`)이 여기로 나간다. 주문은 상관 응답이 필요하므로 `sendOrder` 를 쓴다.
   *
   * ★ 소켓이 열려 있지 않으면 `console.error` 를 남기고 `false` 를 돌려준다. 호출부는
   *   반환값으로 「보내지 **않았음**」을 알 수 있다 — 조용한 드롭은 PC-7 위반이다.
   *   전략 4종의 유일한 출구이고 그중 하나가 킬 스위치다(T-16-19).
   */
  send: (msg: RelayInbound) => boolean;
  /** 수동 재연결. 백오프 카운터를 0 으로 되돌리고 새 소켓을 연다. */
  reconnect: () => void;
  /**
   * 「지금 다시 확인」 — 당겨서 새로고침(Phase 21 D-16)의 트레이딩·마이 재조회.
   *
   * 복귀 경로(규율 9)의 `onResume(true)` 와 같다. 소켓이 죽었으면(백오프 대기·예산 소진) 즉시 새로
   * 연다 — 인증 직후 스냅샷이 다시 온다. 인증된 OPEN 이면 `RELAY_RESUME_PROBE_MS` 동안 새 프레임을
   * 지켜보고 안 오면 새로 연다. 살아 있으면 서버 푸시가 곧 최신이라 추가 요청이 없다. 연결 시도 중·
   * 탐침 중이면 무동작이다. relay 인바운드에 「스냅샷 재요청」 프레임이 없어 relay 는 무변경이다
   * (21-RESEARCH Pitfall 11). 사람 제스처만 호출하므로 재시도 폭주가 아니다(T-15-10 · T-21-13).
   * 참조는 안정이다 — 등록 훅이 렌더마다 재등록하지 않는다.
   */
  probeNow: () => void;
  /**
   * 구독 참조계수 +1. 0→1 에서만 와이어에 `sub` 이 나간다.
   *
   * `level` (quick-260923-ge2) — 기본 `"full"` 이라 기존 호출부는 무변경이다. 키당 `{full, price}`
   * 두 카운트를 세고 실효 level = full ≥1 ? full : price 다. 실효 level 이 바뀌면 같은 키로
   * `sub` 을 다시 보낸다 — relay 가 같은 소켓 재구독을 level 갱신으로 처리한다(fanout 규칙 7).
   * `lv` 는 price 일 때만 싣는다 — full 프레임은 종전과 같은 모양이라 옛 relay 에도 안전하다.
   */
  subscribe: (isin: string, exchange: RelayExchange, level?: RelaySubLevel) => void;
  /**
   * 구독 참조계수 -1 (그 level 의 카운트). 합계 1→0 에서만 와이어에 `unsub` 이 나가고,
   * 실효 level 이 full→price 로 바뀌면 `lv:"price"` 로 `sub` 을 다시 보낸다.
   * 잡지 않은 level 의 해제는 무시한다.
   */
  unsubscribe: (isin: string, exchange: RelayExchange, level?: RelaySubLevel) => void;
  /**
   * 주문 송신 + `rid` 상관 응답 대기 (D-02).
   *
   * **reject 하지 않는다** — 모든 실패가 `RelayOrderResultMsg` 로 표면화된다.
   *  - 소켓 미연결 : `status:"rejected"` (보내지 **않았음**이 확실하다)
   *  - 응답 미도달 : `status:"timeout"` (**결과를 모름** — 주문이 이미 나갔을 수 있다)
   * 둘을 같은 값으로 뭉개면 UI 가 "재주문해도 안전한가"를 판단할 수 없다(Pitfall 9).
   */
  sendOrder: (msg: RelayOrderNewMsg | RelayOrderModifyMsg | RelayOrderCancelMsg) => Promise<RelayOrderResultMsg>;
}

/**
 * 소비자(종목 구독) 표면. **Phase 15 의 `useRelaySocket` 반환 계약과 같은 모양**이다 —
 * 그래서 `stock-orderbook-section.tsx` 는 훅 호출 한 줄만 바뀌었다.
 */
export interface RelaySocketState {
  status: RelayStatus;
  statusLabel: string;
  statusMessage: string;
  attempt: number;
  accounts: RelayAccount[];
  /** **자기 구독 키**의 호가 10단. 아직 스냅샷 전이면 null. 다른 종목 값은 절대 오지 않는다. */
  quote: RelayQuote | null;
  /** **자기 구독 키**의 체결 테이프. 최신이 index 0. */
  tape: RelayTapeEntry[];
  /**
   * **계좌번호 → 병합된 계좌 상태.** 계좌 축 소비자는 이것만 쓴다 (16-23).
   *
   * 「마지막 수신 계좌」 단일 값(`account`)은 계약에서 **제거됐다** — 그 값을 계좌 축에
   * 쓰면 머리는 A 인데 행은 B 가 되고, 그 행의 `✕ 취소` 가 A 계좌로 B 의 주문번호를
   * 보낸다(CR-01). 어느 계좌를 골랐는지는 **소비자만** 안다.
   */
  accountStates: ReadonlyMap<string, RelayAccountState>;
  orders: RelayOrderMsg[];
  messages: RelayServerMessageEntry[];
  isStale: boolean;
  /**
   * 송신구. `RelayConnectionState.send` 와 같다(D-02 이후 전략·주문도 이 경로다).
   * 보내지 못하면 `false` 다 — 반환값을 버리면 드롭이 화면에서 사라진다.
   */
  send: (msg: RelayInbound) => boolean;
  reconnect: () => void;
}

export interface UseRelayConnectionOptions {
  /** false 면 연결하지 않고, true→false 전환 시 기존 연결을 정리한다. */
  enabled: boolean;
}

// ============================================================
// reducer
// ============================================================

interface RelayData {
  status: RelayStatus;
  statusMessage: string;
  attempt: number;
  accounts: RelayAccount[];
  quotes: Map<string, RelayQuote>;
  tapes: Map<string, RelayTapeEntry[]>;
  accountStates: Map<string, RelayAccountState>;
  orderIndex: ReadonlyMap<string, OrderIndexEntry>;
  orders: RelayOrderMsg[];
  journalRows: JournalOrderRow[];
  journalState: RelayJournalStateMsg | null;
  messages: RelayServerMessageEntry[];
  isStale: boolean;
  limitChasers: RelayLimitChaser[];
  lastLimitChaserEcho: RelayLimitChaser | null;
  /** 위 `RelayConnectionState.limitChaserDisableEchoes` 문서 참조. */
  limitChaserDisableEchoes: ReadonlyMap<string, LimitChaserDisableEcho>;
  /**
   * 내부 전용(반환하지 않는다) — 이 브라우저의 전부 정지가 in-flight 인가. 65 · 연결 수명 ·
   * 백스톱 타이머가 닫는다.
   */
  killSwitchInFlight: boolean;
  /** 내부 전용 — 15:40 해제 통지 뒤 아직 첫 에코가 오지 않은 KRX 키. 키별 첫 에코가 소비한다. */
  marketCloseReleaseKeys: ReadonlySet<string>;
  viTriggers: RelayViTriggers;
  viOrders: RelayViOrderItem[];
  viNotices: RelayViNoticeMsg[];
  strategiesDisabled: RelayStrategiesDisabledMsg | null;
  rateCrossItems: RelayRateCrossItem[];
  rateCrossSnapSeq: number;
  limitChaserSnapSeq: number;
  queuedWindow: RelayQueuedWindowMsg | undefined;
  nxtTradable: ReadonlySet<string> | null;
}

const INITIAL_DATA: RelayData = {
  status: "idle",
  statusMessage: "",
  attempt: 0,
  accounts: [],
  quotes: new Map(),
  tapes: new Map(),
  accountStates: new Map(),
  orderIndex: new Map(),
  orders: [],
  // 로그아웃(reset) 이 이 두 값으로 되돌린다 — 다음 사용자가 이전 사용자의 주문 행을 보지 않는다(T-19-16).
  journalRows: [],
  journalState: null,
  messages: [],
  isStale: false,
  limitChasers: [],
  // 「아직 아무 답도 못 받았다」 — 이 값은 **응답 유무**만 말하고 목록을 만들지 않는다.
  lastLimitChaserEcho: null,
  limitChaserDisableEchoes: EMPTY_DISABLE_ECHOES,
  killSwitchInFlight: false,
  marketCloseReleaseKeys: EMPTY_KEYS,
  // 미조회(키 부재) 와 미등록(null) 은 다른 화면이다 — 초기값은 **두 거래소 모두 미조회**다.
  viTriggers: {},
  viOrders: [],
  viNotices: [],
  strategiesDisabled: null,
  rateCrossItems: [],
  rateCrossSnapSeq: 0,
  // 64 스냅샷을 아직 못 받았다 — 빈 `limitChasers` 는 「전략 없음」 이 아니라 「모름」 이다.
  limitChaserSnapSeq: 0,
  // 미수신(undefined) 과 「닫힘」(open:false) 은 다른 화면이다 — 초기값은 미수신이다.
  queuedWindow: undefined,
  // 아직 모른다 — 빈 Set 으로 위장하면 모든 종목의 NXT 가 사라진다(quick-260923-pq2).
  nxtTradable: null,
};

/** 배치 대상 프레임 — 시세·체결 두 종류뿐이다 (파일 상단 규율 8). */
type RelayMarketFrame = RelayQuote | RelayTape;

function isMarketFrame(frame: RelayOutbound): frame is RelayMarketFrame {
  return frame.t === "q" || frame.t === "tape";
}

type RelayAction =
  /** 브라우저가 스스로 만든 상태(연결 시도·백오프·게이트). 서버 프레임이 아니다. */
  | { type: "local-status"; status: RelayStatus; message?: string; attempt?: number }
  /**
   * 서버 프레임 적용의 **유일한 경로** (quick-260923-elb 1a).
   *
   * `market`(대기 중이던 시세·체결 · 도착 순)을 먼저 적용하고, 그 결과에 `frame`(비시장 프레임
   * 1건 · 없으면 null)을 적용한다 — 비시장 프레임이 도착하면 그 앞에 쌓인 시세가 같은 커밋에서
   * 먼저 반영돼 도착 순서가 보존된다. `at` 은 `frame.t === "msg"` 일 때만 뜻이 있다(수신 시각
   * `HH:MM:SS`). 나머지는 빈 문자열이다.
   */
  | {
      type: "frames";
      market: readonly RelayMarketFrame[];
      frame: RelayOutbound | null;
      at: string;
    }
  /** 소켓 단절/복구에 따른 신선도 표식. */
  | { type: "stale"; value: boolean }
  /** 세션 종료(로그아웃·비활성화). 이전 사용자의 계좌·전략을 메모리에 남기지 않는다. */
  | { type: "reset" }
  /** 이 브라우저가 `strategies.disable` 을 소켓에 실었다 — 전부 정지 in-flight 창을 연다. */
  | { type: "strategies-disable-sent" }
  /** 65 를 `STRATEGIES_DISABLE_ACK_TIMEOUT_MS` 안에 못 받았다 — 창을 닫는다(백스톱). */
  | { type: "strategies-disable-expired" };

/**
 * 연결 수명 경계에서 덮어쓸 값 — 요청 도중 끊긴 연결의 에코는 새 연결에 `lc.snap` 으로 돌아오므로
 * 귀속 창을 닫는다(quick-260926-nr2). 빈 집합은 모듈 상수라 이미 닫혀 있으면 참조가 그대로다.
 */
const CLOSED_DISABLE_WINDOWS: Pick<RelayData, "killSwitchInFlight" | "marketCloseReleaseKeys"> = {
  killSwitchInFlight: false,
  marketCloseReleaseKeys: EMPTY_KEYS,
};

function relayReducer(state: RelayData, action: RelayAction): RelayData {
  switch (action.type) {
    case "local-status":
      return {
        ...state,
        status: action.status,
        statusMessage: action.message ?? "",
        attempt: action.attempt ?? 0,
        // 브라우저가 만든 상태(연결 시도·백오프·게이트)는 곧 연결 수명 경계다(quick-260926-nr2).
        ...CLOSED_DISABLE_WINDOWS,
      };

    case "strategies-disable-sent":
      return state.killSwitchInFlight ? state : { ...state, killSwitchInFlight: true };

    case "strategies-disable-expired":
      return state.killSwitchInFlight ? { ...state, killSwitchInFlight: false } : state;

    case "stale":
      return state.isStale === action.value ? state : { ...state, isStale: action.value };

    case "reset":
      // 로그아웃(D-23)·비활성화에서 계좌·전략·시세를 통째로 버린다. 남겨 두면 다음 로그인
      // 사용자가 **이전 사용자의 잔고와 전략 목록**을 잠깐이라도 보게 된다(T-16-04).
      return INITIAL_DATA;

    case "frames": {
      const next = applyMarketFrames(state, action.market);
      return action.frame == null ? next : applyFrame(next, action.frame, action.at);
    }

    default:
      return state;
  }
}

function applyFrame(state: RelayData, frame: RelayOutbound, at: string): RelayData {
  switch (frame.t) {
    case "state":
      return {
        ...state,
        status: frame.s,
        statusMessage: frame.msg ?? "",
        attempt: frame.attempt ?? 0,
        // 계좌 목록은 프레임이 실어 보낼 때만 갱신한다(생략 = 변경 없음).
        accounts: frame.accounts ?? state.accounts,
        isStale: frame.s === "ready" ? false : state.isStale,
        // 확정 스냅샷 기준점 (18-26 / GC-IN-02 ③) — ready 로 **들어설 때만** 0. 새 연결의 인증
        // ACK 도 직전 `local-status` 가 connecting/reconnecting 이라 전환이다. relay 가 이 전환
        // 뒤에 새 64 를 반드시 한 번 더 내리므로, 그때까지는 옛 목록 기준으로 판정하지 않는다.
        limitChaserSnapSeq:
          frame.s === "ready" && state.status !== "ready" ? 0 : state.limitChaserSnapSeq,
        // ready 가 아닌 상태 프레임 = 세션 수명 경계 — 귀속 창을 닫는다(quick-260926-nr2).
        ...(frame.s === "ready" ? {} : CLOSED_DISABLE_WINDOWS),
      };

    case "acct": {
      /*
        ★ 병합 기준은 **그 계좌의 이전 상태**다. 계좌를 가리지 않는 단일 값을 기준으로
          삼으면 계좌 B 의 델타가 계좌 A 의 상태와 `prev.a !== next.a` 로 만나 전량 교체로
          처리되고, 그 순간 A 의 잔고·미체결이 통째로 사라진다.
        단일 「마지막 수신 계좌」 필드는 16-23 에서 제거했다. 병합은 계좌별로만 한다.
      */
      const merged = mergeAccount(state.accountStates.get(frame.a) ?? null, frame);
      const accountStates = new Map(state.accountStates);
      accountStates.set(frame.a, merged);
      // 주문번호 색인은 **원시 프레임**에서 — 병합이 버리는 0 행(전량 체결)도 싣는다(quick-260923-pgu).
      const orderIndex = indexUnfilled(state.orderIndex, frame.a, frame.unf);
      return { ...state, accountStates, orderIndex };
    }

    case "order":
      // D-03: 토스트·전략 로그 전용. 「오늘 주문」 카드 병합에는 쓰이지 않는다(`journalRows` 가 원천).
      return { ...state, orders: [frame, ...state.orders].slice(0, MAX_ORDERS) };

    case "journal.rows": {
      // 변화가 없으면 같은 state 참조를 돌린다 — 소비자 memo(카드 병합)가 헛돌지 않게.
      const journalRows = upsertJournalRows(state.journalRows, frame.rows);
      return journalRows === state.journalRows ? state : { ...state, journalRows };
    }

    case "journal.state":
      // 최신 1건 보관. 전이 판정(delayed → live 재조회)은 소비자(카드)가 한다 — D-04 (a).
      return { ...state, journalState: frame };

    case "msg":
      return {
        ...state,
        messages: [{ ...frame, receivedAt: at }, ...state.messages].slice(0, MAX_MESSAGES),
        /*
          ★ 15:40 KRX 해제 통지 — 통지가 에코보다 먼저 온다(`DisableKrxLimitChasers` 는 통지를 동기로,
            에코는 다음 300ms 플러시 틱에). 지금 KRX 에서 무장된 키가 곧 해제 에코를 받을 키다.
            판정 근거는 `limit-chaser.ts` 한 곳이 소유한다.
        */
        ...(isMarketCloseReleaseNotice(frame)
          ? { marketCloseReleaseKeys: marketCloseReleaseKeysOf(state.limitChasers) }
          : {}),
      };

    case "lc":
      // 60 에코 단건. `crud:"D"` 가 「삭제됨」의 정본이다 — 스위치 조합으로 판정하지
      // 않는다(Pitfall 7). upsert 는 **자리를 지킨다**: 뒤로 밀면 에코가 올 때마다
      // 사이드바 목록 순서가 튄다.
      //
      // ★ `lastLimitChaserEcho` 는 **crud 를 가리지 않고** 매 에코마다 갱신한다 — 그것이
      //   「서버가 답했다」의 유일한 증거이기 때문이다. `crud:"D"` 를 여기서도 떨어뜨리면
      //   미등록 키 철거 에코가 소켓 계약 어디에도 남지 않는다
      //   (debug `lc-unacked-stuck-new-route`).
      return {
        ...state,
        limitChasers: upsertLimitChaser(state.limitChasers, frame.item),
        lastLimitChaserEcho: frame.item,
        ...attributeDisableEcho(state, frame.item),
      };

    case "lc.snap":
      // 64 전량 교체. `D` 행은 목록에 담지 않아 60 경로와 뜻을 맞춘다 —
      // `limitChasers` 는 언제나 「등록된 전략」이다.
      // 빈 배열도 1회로 센다 — relay 는 64 를 받은 뒤에만 이 프레임을 내리므로(18-26) 「전략
      // 없음」 도 확정 정보다(작업대 포커스 보류 판정 · WR-07 · GC-IN-02).
      return {
        ...state,
        limitChasers: frame.items.filter((item) => item.crud !== "D"),
        limitChaserSnapSeq: state.limitChaserSnapSeq + 1,
        // ★ 스냅샷은 복원이지 원인이 아니고 객체 정체성이 전부 새것이다 — 귀속을 비운다(nr2).
        limitChaserDisableEchoes: EMPTY_DISABLE_ECHOES,
        marketCloseReleaseKeys: EMPTY_KEYS,
      };

    case "vi": {
      // `cfg: null` 은 **미등록**이다(무응답이 아니다). 키를 지우지 않는다 —
      // 지우면 「조회했는데 없음」이 「아직 모름」으로 퇴행한다.
      //
      // ★ 병합은 **거래소별**이다 (17-06 / D-06). 한 거래소의 프레임이 다른 거래소 값을
      //   건드리지 않는다: 17-05 이후 인증 스냅샷은 KRX·NXT 2프레임으로 오는데, 단수
      //   필드에 덮어쓰면 KRX 에만 등록된 세션에서 뒤에 온 NXT 프레임이 방금 읽은 설정을
      //   지운다.
      // ★ 거래소를 모르는 프레임(계약 밖 · 구 relay)은 **아무 거래소에도 귀속시키지
      //   않는다.** 기본값 KRX 로 접으면 NXT 의 사실이 KRX 자리에 앉을 수 있고, 화면은
      //   그것이 지어낸 값임을 말할 방법이 없다.
      if (!VI_EXCHANGES.includes(frame.x)) return state;
      return { ...state, viTriggers: { ...state.viTriggers, [frame.x]: frame.cfg } };
    }

    case "vi.list":
      // 72 교체 · 73 병합 **두 갈래 모두** 최신순 정렬을 지난다 — 정렬은 이 한 곳뿐이다
      // (quick-260923-dmb). 72 의 원순서는 게이트웨이 생성 순(오래된 것 먼저)이다.
      return {
        ...state,
        viOrders: sortViOrdersNewestFirst(
          frame.snap ? frame.items : mergeViOrders(state.viOrders, frame.items),
        ),
      };

    case "vi.notice":
      return { ...state, viNotices: [frame, ...state.viNotices].slice(0, MAX_VI_NOTICES) };

    case "rate.cross":
      // **상태 보관만** 한다 — 돌파감지 UI 는 Phase 18 이다. 키는 isin 이다 — 서버 상태가
      // ISIN 당 1개(gh-trade quick-260923-cfo 결정 A), 뒤에 온 76 이 거래소째 덮는다 · relay
      // `rateCrossKey` 와 같은 축.
      return { ...state, rateCrossItems: upsertRateCross(state.rateCrossItems, frame.item) };

    case "rate.cross.snap":
      // **전량 교체**다. 병합하면 서버가 이미 뺀 종목(임계−2%p 이탈)이 영원히 남는다.
      // 빈 배열도 그대로 적용한다 — 「돌파 없음」은 확정 정보다.
      return {
        ...state,
        rateCrossItems: sortRateCross(frame.items).slice(0, MAX_RATE_CROSS),
        // 76 과 가르는 유일한 신호 — 화면은 이 렌더의 새 종목을 무음·무강조로 기록한다(D-17).
        rateCrossSnapSeq: state.rateCrossSnapSeq + 1,
      };

    case "queued.window":
      // 최신 1건 보관. 상태 보관만 하고 UI 는 만들지 않는다(Phase 18).
      return { ...state, queuedWindow: frame };

    case "nxt.snap":
      // 전량 교체 · 재접속에서는 지우지 않는다 — relay 가 재인증마다 다시 내린다
      // (`rateCrossItems` 와 같은 규율). `reset` 만 `INITIAL_DATA` 로 되돌린다(quick-260923-pq2).
      return { ...state, nxtTradable: new Set(frame.isins) };

    case "strategies.disabled":
      // **완료 신호로만** 보관한다. 이 프레임이 온 시점에는 60/61 에코가 이미 모든 행을
      // 갱신해 뒀다 — 여기 담긴 숫자로 목록을 만들면 에코와 두 벌이 갈린다.
      // 65 는 전부 정지 핸들러의 마지막 프레임이다 — 이 브라우저의 in-flight 창을 닫는다(nr2).
      return { ...state, strategiesDisabled: frame, killSwitchInFlight: false };

    default:
      // 알 수 없는 `t` 는 무시한다 — 서버가 앞서 나가도 브라우저가 터지지 않는다(T-15-41).
      // `order.result` 는 상태가 아니라 `rid` 상관 Promise 로 흘러가므로 여기 오지 않는다.
      // q/tape 도 여기 오지 않는다 — 시세·체결 적용은 `applyMarketFrames` 한 곳뿐이다.
      return state;
  }
}

/**
 * 60 에코 1건의 **비활성화 원인 귀속** (quick-260926-nr2) — `"lc"` 갈래 전용.
 *
 * - 이 브라우저의 전부 정지가 in-flight 면 `"killSwitch"`.
 * - 아니면 15:40 대기 키이고 직전 항목 → 이 에코가 게이트를 껐으면 `"marketClose"`
 *   (직전 항목이 없으면 원인 없음).
 * - 그 키는 원인과 무관하게 15:40 대기에서 뺀다 — **첫 에코가 소비**한다.
 * 변화가 없으면 **같은 참조**를 돌린다 — 카드 N개의 재렌더 예산(T-18-29).
 */
function attributeDisableEcho(
  state: RelayData,
  item: RelayLimitChaser,
): Pick<RelayData, "limitChaserDisableEchoes" | "marketCloseReleaseKeys"> {
  const key = item.key;
  const waiting = state.marketCloseReleaseKeys.has(key);
  let cause: LimitChaserDisableCause | null = null;
  if (state.killSwitchInFlight) {
    cause = "killSwitch";
  } else if (waiting) {
    const prev = state.limitChasers.find((c) => c.key === key);
    if (prev !== undefined && limitChaserGateDisarmed(prev, item)) cause = "marketClose";
  }

  let marketCloseReleaseKeys = state.marketCloseReleaseKeys;
  if (waiting) {
    const next = new Set(marketCloseReleaseKeys);
    next.delete(key);
    marketCloseReleaseKeys = next;
  }

  let limitChaserDisableEchoes = state.limitChaserDisableEchoes;
  if (cause !== null) {
    const next = new Map(limitChaserDisableEchoes);
    next.set(key, { echo: item, cause });
    limitChaserDisableEchoes = next;
  } else if (limitChaserDisableEchoes.has(key)) {
    const next = new Map(limitChaserDisableEchoes);
    next.delete(key);
    limitChaserDisableEchoes = next;
  }
  return { limitChaserDisableEchoes, marketCloseReleaseKeys };
}

/**
 * `journal.rows` 1프레임을 보관 목록에 합친다 (Phase 19 D-03).
 *
 * ★ `id` 기준 upsert — 기존 행의 `lastSeq` 가 새 행 이상이면 **기존을 지킨다**(늦게 도착한 옛
 *   행이 새 상태를 덮는 표시 역전 방지 · T-19-27). 한 프레임 안의 같은 id 도 같은 규칙이다.
 * ★ 아무 행도 바뀌지 않으면 **입력 배열 참조를 그대로** 돌린다.
 * ★ 정렬 축은 카드 병합(`mergeJournalRows`)과 같은 비교 함수 하나다 — 두 벌이면 갈라진다.
 */
export function upsertJournalRows(
  prev: readonly JournalOrderRow[],
  incoming: readonly JournalOrderRow[],
): JournalOrderRow[] {
  let byId: Map<string, JournalOrderRow> | null = null;
  for (const row of incoming) {
    const map: Map<string, JournalOrderRow> = byId ?? new Map(prev.map((r) => [r.id, r]));
    const cur = map.get(row.id);
    if (cur !== undefined && cur.lastSeq >= row.lastSeq) continue;
    map.set(row.id, row);
    byId = map;
  }
  if (byId === null) return prev as JournalOrderRow[];
  return [...byId.values()].sort(compareJournalNewestFirst).slice(0, MAX_JOURNAL_ROWS);
}

/**
 * 대기 중이던 시세·체결을 **도착 순서대로** 적용한다 (quick-260923-elb 1a).
 *
 * ★ 같은 종목의 여러 q 를 버퍼에서 미리 뭉개지 않는다. 대신 **한 액션 안의 순차 병합**으로
 *   적용하므로 결과가 1건씩 dispatch 한 것과 정확히 같다 — snap 뒤 delta 는 필드 병합, 마지막
 *   값이 이기고, 체결은 도착 순으로 앞에 붙고 키당 200 상한이다. 달라지는 것은 커밋 수뿐이다.
 * ★ Map 복사는 액션당 **최대 1번**(copy-on-write). 첫 q 에서 quotes 를, 첫 tape 에서 tapes 를
 *   복사하고 같은 배치의 나머지는 그 작업용 Map 위에서 병합한다. 빈 배열이면 state 그대로다.
 */
function applyMarketFrames(state: RelayData, market: readonly RelayMarketFrame[]): RelayData {
  if (market.length === 0) return state;

  let quotes: Map<string, RelayQuote> | null = null;
  let tapes: Map<string, RelayTapeEntry[]> | null = null;
  let isStale = state.isStale;

  for (const frame of market) {
    const key = relayQuoteKey(frame.i, frame.x);
    if (frame.t === "q") {
      quotes ??= new Map(state.quotes);
      const prev = quotes.get(key) ?? null;
      // snap=true 는 전량 교체, false 는 같은 키 병합 (D-33).
      // 키가 슬롯 동일성을 보장하므로 승격 전의 `sameSlot` 비교는 필요 없다.
      quotes.set(key, frame.snap || prev == null ? frame : { ...prev, ...frame });
      if (frame.snap) isStale = false;
    } else {
      tapes ??= new Map(state.tapes);
      // 와이어는 시간 오름차순 배치 → 최신이 index 0 이 되도록 뒤집어 prepend 한다.
      const batch = [...frame.e].reverse();
      const prev = tapes.get(key) ?? [];
      tapes.set(key, (frame.snap ? batch : [...batch, ...prev]).slice(0, MAX_TAPE));
    }
  }

  return {
    ...state,
    quotes: quotes ?? state.quotes,
    tapes: tapes ?? state.tapes,
    isStale,
  };
}

/**
 * 등락률 돌파 above 집합 upsert — 키는 isin 이다 (17-03 / D-03 · quick-260926-rcc).
 *
 * 서버 상태가 ISIN 당 1개(gh-trade quick-260923-cfo 결정 A)이므로 뒤에 온 76 이 거래소째 덮는다
 * — relay `rateCrossKey` 와 같은 축이다. 거래소를 비교하면 KRX 행 뒤 NXT 재돌파가 두 원소가 된다.
 *
 * 정렬은 **`exchangeTime` 내림차순(최신 돌파가 맨 위 — 사용자 결정 2026-09-22) · 동률이면
 * `isin` 오름차순**으로 relay `sortRateCrossNewestFirst` 와 같은 축을 쓴다. `exchangeTime` 은
 * above 구간을 연 시각이라 구간 안 갱신은 자리를 지키고, 재돌파(새 구간)만 맨 위로 오른다. 자리 보존(상따 `upsertLimitChaser`)과 다른 이유: 상따 목록은 사용자가 만든
 * 순서가 뜻을 갖지만 above 집합은 **서버가 정한 순서**가 뜻을 갖고, 78 전량 교체가 그
 * 순서로 오므로 76 upsert 만 자리 보존을 하면 두 경로의 순서가 갈린다.
 *
 * `slice` 상한은 **정렬 뒤**에 건다 — 자르고 정렬하면 남길 원소를 먼저 버린다. 내림차순이라
 * 상한을 넘으면 **가장 오래된** 돌파가 잘려 나간다(최신 유지).
 */
function upsertRateCross(
  list: RelayRateCrossItem[],
  item: RelayRateCrossItem,
): RelayRateCrossItem[] {
  const rest = list.filter((c) => c.isin !== item.isin);
  return sortRateCross([...rest, item]).slice(0, MAX_RATE_CROSS);
}

/**
 * above 집합 정렬 축 — `exchangeTime` ↓ · 동률이면 `isin` ↑ (최신 돌파가 맨 위).
 * relay `sortRateCrossNewestFirst`(`relay/src/hub/subscription-hub.ts`)와 같은 축이다.
 */
function sortRateCross(list: RelayRateCrossItem[]): RelayRateCrossItem[] {
  return [...list].sort((a, b) =>
    a.exchangeTime === b.exchangeTime
      ? a.isin.localeCompare(b.isin)
      : b.exchangeTime.localeCompare(a.exchangeTime),
  );
}

/** 상따 목록 upsert — **자리 보존**. 없으면 뒤에 붙이고, `crud:"D"` 면 지운다. */
function upsertLimitChaser(
  list: RelayLimitChaser[],
  item: RelayLimitChaser,
): RelayLimitChaser[] {
  if (item.crud === "D") return list.filter((c) => c.key !== item.key);
  const idx = list.findIndex((c) => c.key === item.key);
  if (idx < 0) return [...list, item];
  const next = list.slice();
  next[idx] = item;
  return next;
}

/**
 * VI 주문 추적 행의 병합 키.
 *
 * relay `subscription-hub.ts` 의 `viOrderKey`/`viPendingKey` 와 **같은 규칙**이어야 한다 —
 * 갈리면 새 탭(72 스냅샷)과 기존 탭(73 델타 누적)이 다른 목록을 본다.
 *
 * **접수 전(Pending)은 `orderNo` 가 `""`** 라 주문번호로 키를 만들 수 없다. 그대로 `""` 를
 * 키로 쓰면 서로 다른 종목의 접수 전 항목이 한 줄로 겹쳐 사라진다. 같은 종목·계좌·**거래소**의
 * 한 VI 발동은 1건이므로 `@ISIN:계좌:발동가:거래소` 가 유일하다. `@` 는 주문번호와 섞이지 않게
 * 하는 표식이다.
 *
 * ★ **거래소는 접수 전 키에만 더한다** (17-06 / D-06, 17-05 규율 승계). 주문번호는 이미
 *   유일하므로 거기에 축을 더하면 접수 전 → 접수 전이에서 자리표시 행을 걷어내는 경로가
 *   두 벌로 갈린다 — 「유일하지 않은 키에만 축을 더한다」.
 *
 * ★ **내보낸다** (16-14). VI 주문내역이 React key·낙관 반영 키로 같은 규칙을 써야 한다 —
 *   화면이 `orderNo` 를 그냥 키로 쓰면 접수 전 행끼리 `""` 로 겹쳐 **서로 다른 종목이 한 줄로
 *   합쳐진다.** 규칙을 화면에 다시 적으면 이 병합기와 갈리는 순간 같은 목록이 두 모양이 된다.
 */
export function viOrderKey(item: RelayViOrderItem): string {
  return item.orderNo !== "" ? item.orderNo : viPendingKey(item);
}

/**
 * 접수 전 항목의 자리표시 키. 주문번호가 붙는 순간 이 키를 지우고 주문번호 키로 옮긴다.
 *
 * ⚠️ relay `hub/subscription-hub.ts` 의 `viPendingKey` 와 **한 글자도 다르면 안 된다**(앞의
 *    `userId|` 접두만 relay 몫이다). 갈리면 새 탭(72 스냅샷 재생)과 기존 탭(73 델타 누적)이
 *    서로 다른 목록을 본다 — 17-05 가 relay 쪽에 거래소를 더했으므로 여기도 같이 더한다.
 */
function viPendingKey(item: RelayViOrderItem): string {
  return `@${item.isin}:${item.accountNo}:${item.triggerPrice}:${item.exchange}`;
}

/**
 * 73 델타 병합 — 키 upsert. `snap` 은 호출부에서 전량 교체로 처리한다.
 *
 * **자리는 신경 쓰지 않는다 — 순서는 호출부 정렬(`sortViOrdersNewestFirst`)이 정한다.**
 * Map 은 새 키를 끝에 붙이고, 접수 전→접수 전이도 자리표시 키를 지운 뒤 다시 넣으므로
 * 이 함수의 출력 순서에는 뜻이 없다.
 */
function mergeViOrders(
  prev: RelayViOrderItem[],
  incoming: RelayViOrderItem[],
): RelayViOrderItem[] {
  const merged = new Map<string, RelayViOrderItem>(prev.map((item) => [viOrderKey(item), item]));
  for (const item of incoming) {
    const key = viOrderKey(item);
    // 접수되며 주문번호가 붙었으면 자리표시 행을 걷어낸다 — 안 그러면 같은 주문이 두 줄이다.
    const pending = viPendingKey(item);
    if (key !== pending) merged.delete(pending);
    merged.set(key, item);
  }
  return [...merged.values()];
}

/**
 * VI 주문 추적 목록 정렬 — **최신 발동이 맨 앞** (quick-260923-dmb · 사용자 결정 2026-09-23).
 *
 * 근본 원인: 최신순 정렬을 하는 층이 하나도 없었다.
 *  (a) 게이트웨이 72 스냅샷은 `VIOrderWatch::Snapshot` 이 `m_items` 를 **생성 순**으로 담는다 —
 *      오래된 것이 먼저다.
 *  (b) relay `#onViOrderList` 는 72·73 을 **받은 그대로** 팬아웃하고, 캐시 Map 도 삽입 순이다.
 *  (c) 여기 `mergeViOrders` 는 Map upsert 라 새 키(와 접수 전→접수 재삽입)가 **끝에** 붙는다.
 *  결과 화면은 「오래된 것 먼저 + 새로 온 것은 끝」이었다.
 *
 * 왜 relay 가 아니라 여기인가: 73 은 **바뀐 행만** 싣고 오므로 전체 순서는 목록을 병합하는
 * 쪽만 안다. 72 교체와 73 병합이 모두 리듀서 `case "vi.list"` 하나를 지나므로 그 한 곳에서
 * 정렬한다. 돌파 목록의 `sortRateCross` 와 짝이다.
 *
 * 키 = `deadline110Ms`: 와이어에 수신 시각 필드가 없다. gh-trade 는 이 값을 발동(접수 전 생성)
 * 시점에 VI 해제 예정시각에서 **한 번** 계산하고 미루지 않으므로(연장 시에도 그대로) 행마다
 * 고정이다 → 73 갱신은 자리를 지킨다. 화면 시각 `acceptedClock` 도 같은 필드에서 역산하므로
 * 정렬 결과와 사용자가 보는 시각이 어긋나지 않는다.
 *
 * 비교 규칙:
 *  (1) `deadline110Ms` ↓. 0 이하는 「시각 모름」 — 시각을 아는 모든 행 뒤다(모르는 행을 맨 위에
 *      두면 최신이라고 거짓말하게 된다).
 *  (2) 동률이면 주문번호 있는 행 먼저 · 둘 다 있으면 주문번호 ↓(늦게 접수된 것 앞) · 접수 전
 *      (주문번호 `""`) 행은 뒤 — (1)과 같은 「모르는 값은 최신이라 주장하지 않는다」 원칙.
 *  (3) 그래도 같으면 `viOrderKey` ↓ — 병합 뒤 키는 유일하므로 전순서가 완성된다.
 *  문자열 비교는 **코드 단위**(`<`/`>`)다 — `localeCompare` 금지(로케일 비의존).
 *
 * 입력 배열은 바꾸지 않는다(복사 후 정렬) — 72 `frame.items` 를 제자리에서 뒤집지 않는다.
 */
function sortViOrdersNewestFirst(list: readonly RelayViOrderItem[]): RelayViOrderItem[] {
  const desc = (a: string, b: string): number => (a > b ? -1 : a < b ? 1 : 0);
  return [...list].sort((a, b) => {
    const aKnown = a.deadline110Ms > 0;
    const bKnown = b.deadline110Ms > 0;
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if (aKnown && a.deadline110Ms !== b.deadline110Ms) return b.deadline110Ms - a.deadline110Ms;
    const aHasNo = a.orderNo !== "";
    const bHasNo = b.orderNo !== "";
    if (aHasNo !== bHasNo) return aHasNo ? -1 : 1;
    if (aHasNo && a.orderNo !== b.orderNo) return desc(a.orderNo, b.orderNo);
    return desc(viOrderKey(a), viOrderKey(b));
  });
}

/**
 * 계좌 상태 병합. `snap` 이면 전량 교체, 아니면 키 upsert + 0행/`rm` 제거 후
 * **스냅샷 형태로 정규화**한다(소비자가 델타를 다시 해석하지 않게).
 *
 * **서버가 0/0 원소를 지우므로 델타의 0 행이 곧 삭제 신호다** (gh-trade quick-260906-e8b).
 * 전량 매도된 잔고는 `{qty:0, sellableQty:0, avgPrice:0}` 톰스톤 행으로 온다 — 잔고에는
 * `rm` 같은 삭제 표식이 없다(그 배열은 미체결 전용). 미체결은 `rm` 이 정규 경로지만
 * `unfilledQty === 0` 행도 삭제로 읽는다. 스냅샷에서 0 행을 거르는 것은 구버전
 * 게이트웨이 호환이다(배포 이전 바이너리는 스냅샷에 0 잔고를 섞어 보낸다).
 *
 * relay 캐시(`subscription-hub.ts` 의 `#mergeAccountState`)와 **한 글자도 다르면 안 된다** —
 * 갈리면 새 탭(캐시 재생)과 기존 탭(델타 누적)이 다른 잔고를 본다.
 */
function mergeAccount(
  prev: RelayAccountState | null,
  next: RelayAccountState,
): RelayAccountState {
  if (next.snap || prev == null || prev.a !== next.a) {
    return {
      ...next,
      snap: true,
      hold: next.hold.filter((h) => h.qty !== 0),
      unf: next.unf.filter((u) => u.unfilledQty !== 0),
      rm: [],
    };
  }

  const holdings = new Map<string, RelayHolding>(prev.hold.map((h) => [h.isin, h]));
  for (const h of next.hold) {
    if (h.qty === 0) holdings.delete(h.isin);
    else holdings.set(h.isin, h);
  }

  const unfilled = new Map<string, RelayUnfilled>(prev.unf.map((u) => [u.orderNo, u]));
  for (const u of next.unf) {
    if (u.unfilledQty === 0) unfilled.delete(u.orderNo);
    else unfilled.set(u.orderNo, u);
  }
  // 삭제 표식은 upsert **뒤에** 적용한다 — 같은 델타가 한 주문을 갱신하면서 동시에
  // 지우라고 말하면 최종 상태는 "없음"이어야 한다.
  for (const orderNo of next.rm) unfilled.delete(orderNo);

  return {
    ...next,
    snap: true,
    hold: [...holdings.values()],
    unf: [...unfilled.values()],
    rm: [],
  };
}

// ============================================================
// 주문 상관 응답 — 실패도 결과 프레임으로 표면화한다
// ============================================================

/**
 * 브라우저가 만든 합성 결과. `resultCode: -1` 은 「서버가 준 코드가 아님」의 표식이다.
 *
 * `relay-provider.tsx` 도 이 함수를 쓴다 — 요청이 소켓에 닿기 **전에** 형식 검사로 걸리는
 * 경로가 그쪽에 있고, 거기서 모양을 따로 만들면 두 벌이 갈린다(`resultCode` 관례가 특히).
 */
export function localOrderResult(
  rid: string,
  status: RelayOrderResultMsg["status"],
  message: string,
): RelayOrderResultMsg {
  return { t: "order.result", rid, orderNo: "", resultCode: -1, message, status };
}

interface PendingOrder {
  resolve: (result: RelayOrderResultMsg) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ============================================================
// 연결 훅 — 앱 전체에 **1개**만 존재한다 (RelayProvider 가 소유)
// ============================================================

export function useRelayConnection({
  enabled,
}: UseRelayConnectionOptions): RelayConnectionState {
  const [data, dispatch] = useReducer(relayReducer, INITIAL_DATA);

  /** 현재 살아 있는 소켓. 구독 제어와 `send` 가 공유한다. */
  const socketRef = useRef<WebSocket | null>(null);
  /** 전부 정지 in-flight 창의 백스톱 타이머(quick-260926-nr2). 연결 수명 정리가 지운다. */
  const killSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 인증 ACK(첫 상태 프레임) 수신 여부. 소켓마다 초기화된다. */
  const authAckedRef = useRef(false);
  /**
   * 구독 참조계수 — level 별 `{full, price}` (relay `SubscriptionHub#refs` 동형 · quick-260923-ge2).
   * 합계 0→1 에서만 `sub`, 1→0 에서만 `unsub`. 실효 level 이 바뀌면 `sub` 재송신.
   */
  const subRefsRef = useRef<Map<string, SubRefEntry>>(new Map());
  /** **와이어에 실제로 걸려 있는** 구독과 그 level. 소켓이 바뀌면 비워지고 재접속 시 다시 채워진다. */
  const wireSubsRef = useRef<
    Map<string, { isin: string; ex: RelayExchange; lv: RelaySubLevel }>
  >(new Map());
  /**
   * 와이어에서 내려야 하는데 아직 `unsub` 을 못 보낸 키와 그 와이어 level (구독 제어 버킷 대기).
   * 보내기 전에 다시 구독되면 `wireSubs` 로 되돌린다 — relay 는 아직 그 구독을 들고 있다.
   */
  const pendingUnsubsRef = useRef<
    Map<string, { isin: string; ex: RelayExchange; lv: RelaySubLevel }>
  >(new Map());
  /** 구독 제어 토큰 버킷 (`SUB_FRAME_RATE_PER_SEC`). 소켓마다 가득 찬 상태로 시작한다. */
  const subTokensRef = useRef(SUB_FRAME_BURST);
  const subRefilledAtRef = useRef(0);
  /** 토큰이 모자라 남은 구독 제어를 다시 흘릴 타이머. */
  const subFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** `rid` → 대기 중인 주문 Promise. */
  const pendingOrdersRef = useRef<Map<string, PendingOrder>>(new Map());
  /**
   * 최신 상태의 거울. `flushSubscriptions` 는 ref 기반 명령형 함수라 리렌더에 묶이지
   * 않는데, `unauthorized` 판정에는 최신 상태가 필요하다.
   */
  const statusRef = useRef<RelayStatus>("idle");
  statusRef.current = data.status;

  /** 인증 ACK 를 구독 effect 로 전파하는 epoch. 재접속마다 증가한다. */
  const [authEpoch, setAuthEpoch] = useState(0);
  /** `reconnect()` 가 증가시키는 nonce — 연결 effect 를 강제로 다시 돌린다. */
  const [reconnectNonce, setReconnectNonce] = useState(0);
  /** 현재 연결 effect 의 `onResume(true)` — 공개 `probeNow` 가 부른다(D-16). effect 밖이면 no-op. */
  const probeNowRef = useRef<() => void>(NOOP_PROBE);

  /**
   * 참조계수 ≥1 인데 아직 와이어에 없는 키를 전부 `sub` 한다.
   *
   * 인증 전 구독 요청의 지연 반영과 **재접속 후 재구독**이 같은 한 함수를 탄다 —
   * 두 경로를 따로 만들면 한쪽만 고쳐져 조용히 갈린다. `wireSubs` 가 중복 송신을 막으므로
   * 참조계수가 2든 5든 와이어에는 `sub` 이 **1번만** 나간다.
   *
   * level 변경 재송신도 이 한 함수를 탄다(quick-260923-ge2) — 0→1 · 재접속 · 승격/강등 세 경로를
   * 따로 두면 한쪽만 고쳐진다. 와이어 level 과 실효 level 이 다를 때만 다시 보낸다.
   */
  const flushSubscriptions = useCallback(() => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WS_READY_OPEN) return;
    // 인증 ACK 전 구독은 relay 가 close(4400) 로 끊는다.
    if (!authAckedRef.current) return;
    // 권한 없음은 relay 가 구독을 무시하는 상태다 — 보내지 않는다.
    if (statusRef.current === "unauthorized") return;

    // 보낼 것 — 우선순위: full(카드·호가 탭) → 해제 → price(돌파 칩). 버킷이 모자라면 칩이 늦는다.
    const fullSubs: SubRefEntry[] = [];
    const priceSubs: SubRefEntry[] = [];
    for (const [key, entry] of subRefsRef.current) {
      if (entry.full + entry.price < 1) continue;
      const lv = effectiveSubLevel(entry);
      const wire = wireSubsRef.current.get(key);
      if (wire !== undefined && wire.lv === lv) continue;
      (lv === "full" ? fullSubs : priceSubs).push(entry);
    }
    const unsubs = [...pendingUnsubsRef.current];
    if (fullSubs.length + priceSubs.length + unsubs.length === 0) return;

    const now = Date.now();
    subTokensRef.current = Math.min(
      SUB_FRAME_BURST,
      subTokensRef.current + ((now - subRefilledAtRef.current) * SUB_FRAME_RATE_PER_SEC) / 1000,
    );
    subRefilledAtRef.current = now;

    const take = (): boolean => {
      if (subTokensRef.current < 1) return false;
      subTokensRef.current -= 1;
      return true;
    };
    const sendSub = (entry: SubRefEntry): boolean => {
      if (!take()) return false;
      ws.send(JSON.stringify(subFrameOf(entry)));
      wireSubsRef.current.set(relayQuoteKey(entry.isin, entry.ex), {
        isin: entry.isin,
        ex: entry.ex,
        lv: effectiveSubLevel(entry),
      });
      return true;
    };

    let drained = fullSubs.every(sendSub);
    if (drained) {
      drained = unsubs.every(([key, wire]) => {
        if (!take()) return false;
        ws.send(JSON.stringify({ t: "unsub", isin: wire.isin, ex: wire.ex }));
        pendingUnsubsRef.current.delete(key);
        return true;
      });
    }
    if (drained) drained = priceSubs.every(sendSub);

    if (!drained && subFlushTimerRef.current === null) {
      const waitMs = Math.ceil(((1 - subTokensRef.current) * 1000) / SUB_FRAME_RATE_PER_SEC);
      subFlushTimerRef.current = setTimeout(() => {
        subFlushTimerRef.current = null;
        flushSubscriptionsRef.current();
      }, Math.max(waitMs, 1));
    }
  }, []);
  /** 타이머가 최신 `flushSubscriptions` 를 부르게 하는 거울 (useCallback 의존성 0 이라 사실상 고정). */
  const flushSubscriptionsRef = useRef(flushSubscriptions);
  flushSubscriptionsRef.current = flushSubscriptions;

  /** 소켓이 바뀔 때 구독 제어 대기열·버킷을 초기화한다 — 새 소켓에는 relay 쪽 구독이 없다. */
  const resetSubPacing = useCallback(() => {
    pendingUnsubsRef.current.clear();
    subTokensRef.current = SUB_FRAME_BURST;
    subRefilledAtRef.current = Date.now();
    if (subFlushTimerRef.current !== null) {
      clearTimeout(subFlushTimerRef.current);
      subFlushTimerRef.current = null;
    }
  }, []);

  /** 대기 중인 주문을 전부 「결과 모름」으로 닫는다(소켓 단절·정리). */
  const abandonPendingOrders = useCallback((message: string) => {
    for (const [rid, pending] of pendingOrdersRef.current) {
      clearTimeout(pending.timer);
      pending.resolve(localOrderResult(rid, "timeout", message));
    }
    pendingOrdersRef.current.clear();
  }, []);

  // ---------------------------------------------------------
  // 연결 수명 — 종목에 의존하지 않는다. 앱이 열려 있는 동안 1연결이다(D-22).
  // ---------------------------------------------------------
  useEffect(() => {
    if (!enabled) {
      // D-23 — 비로그인/로그아웃. 상태를 idle 로 되돌리고 세션 데이터를 버린다.
      dispatch({ type: "reset" });
      return;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    /**
     * 이 브라우저가 **자기** 재접속 예산을 다 썼다(규율 4 → `manual_required`).
     * relay 가 상태 프레임으로 보낸 `manual_required`(게이트웨이 회선)와 가르려고 따로 든다 —
     * 복귀 시 자동 재개는 이쪽만 한다(아래 `onResume`).
     */
    let exhausted = false;

    /*
      복귀 탐침 (debug mobile-bg-resume-gaps 2).
      모바일에서 앱을 내리면 OS 가 페이지를 얼리고 relay ping 에 pong 이 안 나가 relay 가 소켓을
      terminate 한다(`pong 미수신 — 연결 정리`). 그 사이 망이 바뀌었으면 FIN 이 닿지 않아 이쪽
      소켓은 **OPEN 인 채 죽어 있다** — onclose 가 영원히 안 오므로 재접속도 stale 표식도 없다.
      relay 계약에 에코되는 인바운드가 없어 능동적으로 물을 수 없으니, 복귀 뒤 새 프레임이
      건너오는지 **지켜보고**(passive) 안 오면 새로 연다.
    */
    let hiddenAt: number | null = document.visibilityState === "hidden" ? Date.now() : null;
    let probeTimer: ReturnType<typeof setTimeout> | null = null;
    /** 이 시각 이후에 도착한 프레임만 탐침 판정에 센다 (`RELAY_RESUME_PROBE_SETTLE_MS`). */
    let probeFrom = 0;
    let probeAlive = false;

    /*
      시세·체결 대기 버퍼 (파일 상단 규율 8 · quick-260923-elb 1a).
      ref 가 아니라 **effect 범위**에 두는 이유: 버퍼 수명을 연결 수명과 같게 하려는 것이다.
      재연결(nonce)·비활성화로 effect 가 다시 돌면 새 버퍼가 생기고, 옛 버퍼는 정리에서 비워진다.
    */
    let marketQueue: RelayMarketFrame[] = [];
    let marketTimer: ReturnType<typeof setTimeout> | null = null;

    /** 대기 중인 시세·체결을 떼어 낸다. 타이머도 함께 지운다. */
    const takeMarket = (): RelayMarketFrame[] => {
      if (marketTimer != null) {
        clearTimeout(marketTimer);
        marketTimer = null;
      }
      const taken = marketQueue;
      marketQueue = [];
      return taken;
    };

    /** 대기분만 적용한다(창 만료 · 상한 도달 · close · 정리). 비어 있으면 아무것도 하지 않는다. */
    const flushMarket = () => {
      const market = takeMarket();
      if (market.length > 0) dispatch({ type: "frames", market, frame: null, at: "" });
    };

    /**
     * `open()` 이 던지는 모든 예외를 상태로 바꾼다.
     *
     * Phase 15 Plan 13 발견: Supabase 환경변수 오설정 등으로 `createClient()` 가 던지면
     * `void open()` 이 **unhandled rejection** 이 되고, 화면은 `시세 서버 연결 중…` 에서
     * 영원히 멈춘 채 사용자에게 아무 이유도 알리지 않는다. 연결 실패는 조용히 삼키는
     * 대신 `failed` 로 표면화한다(상태 바가 문구를 그린다).
     */
    const openSafely = () => {
      void open().catch((err: unknown) => {
        if (disposed) return;
        dispatch({
          type: "local-status",
          status: "failed",
          message: err instanceof Error ? err.message : "시세 서버에 연결하지 못했어요.",
        });
      });
    };

    /**
     * 일시 장애 뒤 백오프 재시도 1회를 건다 — 소진하면 `manual_required` 로 멈춘다(규율 4).
     *
     * 소켓 close 와 **세션 조회 실패**(토큰 갱신이 망에 막힘) 두 갈래가 같은 예산·같은 백오프를
     * 탄다. 두 곳에 따로 두면 한쪽 상한만 고쳐져 조용히 갈린다.
     */
    const scheduleRetry = () => {
      // 데이터를 지우지 않는다 — isStale 만 세운다(UI-SPEC 깜빡임 금지).
      dispatch({ type: "stale", value: true });

      attempt += 1;
      if (attempt > RELAY_MAX_RECONNECT_ATTEMPTS) {
        exhausted = true;
        dispatch({
          type: "local-status",
          status: "manual_required",
          attempt: RELAY_MAX_RECONNECT_ATTEMPTS,
        });
        return;
      }
      dispatch({ type: "local-status", status: "reconnecting", attempt });
      retryTimer = setTimeout(() => {
        retryTimer = null;
        openSafely();
      }, relayBackoffDelayMs(attempt));
    };

    const open = async () => {
      if (disposed) return;

      dispatch({
        type: "local-status",
        status: attempt === 0 ? "connecting" : "reconnecting",
        attempt,
      });

      // 토큰 취득 경로는 chat-sse.ts 와 동일하다 — 클라이언트가 토큰을 보관·조작하지
      // 않고 Supabase SDK 가 갱신까지 관리한다.
      const {
        data: { session },
        error: sessionError,
      } = await createClient().auth.getSession();
      if (disposed) return;

      if (!session) {
        if (sessionError) {
          /*
            ★ 「로그인 안 됨」이 아니라 **세션을 확인하지 못했다**다 (debug mobile-bg-resume-gaps 3b).
              auth-js 는 만료 토큰 갱신이 망에 막히면 세션을 스토리지에 둔 채 `{session:null, error}`
              를 돌려준다. 모바일에서 1시간 넘게 내렸다 돌아와 망이 붙기 전에 여기 오면, 로그인
              상태인데 「권한 없음」에 고착됐다. 일시 장애이므로 같은 예산의 백오프를 탄다 —
              정말 로그아웃이면 auth-js 가 SIGNED_OUT 을 내 `enabled` 가 먼저 내려간다.
          */
          scheduleRetry();
          return;
        }
        // 로그인 게이트. 재시도해도 결과가 같으므로 백오프에 들어가지 않는다.
        dispatch({ type: "local-status", status: "unauthorized" });
        return;
      }

      let url: string;
      try {
        url = resolveRelayWsUrl();
      } catch (err) {
        dispatch({
          type: "local-status",
          status: "failed",
          message: err instanceof Error ? err.message : "wss 주소 설정이 잘못됐어요.",
        });
        return;
      }

      const ws = new WebSocket(url);
      socket = ws;
      socketRef.current = ws;
      authAckedRef.current = false;
      wireSubsRef.current.clear();
      resetSubPacing();

      ws.onopen = () => {
        // D-11 — 업그레이드 후 **첫 메시지**가 인증이다. 5초 안에 못 보내면 relay 가
        // close(4401) 한다. 토큰을 URL·쿼리스트링에 싣지 않는 이유는 파일 상단 참조.
        ws.send(JSON.stringify({ t: "auth", token: session.access_token }));
      };

      ws.onmessage = (event: MessageEvent) => {
        // 복귀 탐침 중이면 settle 이후 도착분만 「경로가 살아 있다」로 센다. 탐침 밖에서는 시계를
        // 읽지 않는다 — 이 콜백은 초당 수백 번 돈다(quick-260923-elb).
        if (probeTimer !== null && !probeAlive && Date.now() >= probeFrom) probeAlive = true;

        const frame = parseFrame(event.data);
        if (frame == null) return; // 깨진 프레임은 throw 하지 않고 스킵

        if (frame.t === "state") {
          if (frame.s === "ready") {
            // 정상 세션에 도달했으니 백오프 카운터를 되돌린다. `ready` 외의 상태에서
            // 리셋하면 "붙자마자 끊기는" 서버를 상대로 무한 재시도가 된다.
            attempt = 0;
          }
          if (!authAckedRef.current) {
            authAckedRef.current = true;
            setAuthEpoch((v) => v + 1);
          }
        }

        if (frame.t === "order.result") {
          // rid 상관 1회성 응답 — 상태에 쌓지 않고 대기 중인 Promise 로 흘린다.
          const pending = pendingOrdersRef.current.get(frame.rid);
          if (pending) {
            pendingOrdersRef.current.delete(frame.rid);
            clearTimeout(pending.timer);
            pending.resolve(frame);
          }
          return;
        }

        if (isMarketFrame(frame)) {
          marketQueue.push(frame);
          if (marketQueue.length >= RELAY_MARKET_BUFFER_MAX) {
            flushMarket();
          } else if (marketTimer == null) {
            marketTimer = setTimeout(flushMarket, RELAY_MARKET_BATCH_MS);
          }
          return;
        }

        // 비시장 프레임(알 수 없는 `t` 포함)은 지연하지 않는다 — 대기 시세를 먼저, 같은 dispatch 로.
        dispatch({
          type: "frames",
          market: takeMarket(),
          frame,
          at: frame.t === "msg" ? clockStamp(new Date()) : "",
        });
      };

      ws.onerror = () => {
        // close 가 뒤따르므로 여기서는 상태를 바꾸지 않는다(중복 전이 방지).
      };

      ws.onclose = (event: CloseEvent) => {
        // 닫힌 소켓의 마지막 틱까지 반영한 뒤 stale 을 세운다 — 규율 5 「마지막 값 유지」.
        flushMarket();
        // 탐침 대상이 사라졌다 — 판정은 아래 재시도 경로가 대신한다.
        stopProbe();
        if (socketRef.current === ws) socketRef.current = null;
        authAckedRef.current = false;
        wireSubsRef.current.clear();
        resetSubPacing();
        abandonPendingOrders(
          "연결이 끊겨 주문 결과를 받지 못했어요. 미체결 목록을 확인해 주세요.",
        );
        if (disposed) return;

        // 재시도해도 결과가 같은 close 코드는 즉시 확정한다 — 자기유발 DoS 방지(T-15-10).
        if (event.code === RELAY_WS_CLOSE.AUTH_TIMEOUT) {
          // 4401 = 인증 타임아웃/토큰 검증 실패.
          dispatch({ type: "local-status", status: "unauthorized" });
          return;
        }
        if (event.code === RELAY_WS_CLOSE.BAD_MESSAGE) {
          // 4400 = 프로토콜 위반. 브라우저 버그이므로 재시도가 무의미하다.
          dispatch({ type: "local-status", status: "failed" });
          return;
        }

        scheduleRetry();
      };
    };

    // ---------------------------------------------------------
    // 복귀 — 모바일 백그라운드·탭 복귀·망 복구 (debug mobile-bg-resume-gaps 2·3)
    // ---------------------------------------------------------

    /**
     * 처음부터 다시 연다. **수동 재연결 버튼과 같은 경로**(nonce)다 — effect 정리가 옛 소켓·
     * 타이머·대기 주문을 한 번에 걷고, 새 실행이 예산 0 에서 시작한다. 옛 값은 지우지 않고
     * 「마지막 값」 표식만 세운다(규율 5) — 새 인증 ACK(`ready`)가 걷는다.
     */
    const restart = () => {
      if (disposed) return;
      dispatch({ type: "stale", value: true });
      setReconnectNonce((v) => v + 1);
    };

    const stopProbe = () => {
      if (probeTimer !== null) {
        clearTimeout(probeTimer);
        probeTimer = null;
      }
    };

    /** 지금 소켓이 살아 있는지 `RELAY_RESUME_PROBE_MS` 동안 지켜본다. 이미 지켜보는 중이면 무동작. */
    const startProbe = () => {
      const ws = socket;
      // 연결 시도 중(인증 전 포함)이면 그 결과를 기다린다 — relay 의 5초 authTimer 가 판정한다.
      if (ws === null || ws.readyState !== WS_READY_OPEN || !authAckedRef.current) return;
      if (probeTimer !== null) return;
      probeFrom = Date.now() + RELAY_RESUME_PROBE_SETTLE_MS;
      probeAlive = false;
      probeTimer = setTimeout(() => {
        probeTimer = null;
        if (disposed || socket !== ws) return;
        if (!probeAlive) restart();
      }, RELAY_RESUME_PROBE_MS);
    };

    /**
     * @param probe OPEN 소켓까지 의심할 만한 복귀인가 — 오래 숨김·망 복구·bfcache 복원.
     *
     * ★ 예산 소진(`exhausted`)과 백오프 대기(`retryTimer`)는 복귀가 **곧바로** 푼다. 사용자가
     *   화면으로 돌아왔거나 망이 붙었다는 것은 새 정보이고, 백오프는 「같은 조건에서 두드리지
     *   않기」 위한 것이지 「새 조건을 무시하기」 위한 것이 아니다. 트리거가 사람·망 사건이라
     *   재시도 폭주(T-15-10)가 되지 않는다.
     */
    const onResume = (probe: boolean) => {
      if (disposed) return;
      if (exhausted || retryTimer !== null) {
        restart();
        return;
      }
      if (probe) startProbe();
    };
    // D-16 — 당겨서 새로고침이 「OPEN 소켓까지 의심하는 복귀」와 같은 경로를 탄다.
    probeNowRef.current = () => onResume(true);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const hiddenFor = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      onResume(hiddenFor >= RELAY_RESUME_MIN_HIDDEN_MS);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) onResume(true);
    };
    // 망이 바뀌었으면 옛 TCP 는 숨김 시간과 무관하게 죽었을 수 있다.
    const onOnline = () => onResume(true);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);

    openSafely();

    return () => {
      probeNowRef.current = NOOP_PROBE;
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      stopProbe();
      // 대기 시세를 버리지 않고 배치 타이머를 남기지 않는다. 비활성화면 다음 실행의 reset 이 비운다.
      flushMarket();
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (killSwitchTimerRef.current !== null) {
        clearTimeout(killSwitchTimerRef.current);
        killSwitchTimerRef.current = null;
      }

      const ws = socket;
      socket = null;
      if (socketRef.current === ws) socketRef.current = null;

      if (ws) {
        // 리스너부터 떼어 close 핸들러가 백오프를 다시 걸지 않게 한다.
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;

        if (ws.readyState === WS_READY_OPEN) {
          // 참조계수 누수 방지 — 언마운트(탭 이탈 포함)에서도 반드시 해제한다.
          for (const entry of wireSubsRef.current.values()) {
            ws.send(JSON.stringify({ t: "unsub", isin: entry.isin, ex: entry.ex }));
          }
          ws.close(NORMAL_CLOSE_CODE);
        } else {
          ws.close();
        }
      }

      authAckedRef.current = false;
      wireSubsRef.current.clear();
      resetSubPacing();
      abandonPendingOrders(
        "연결이 정리돼 주문 결과를 받지 못했어요. 미체결 목록을 확인해 주세요.",
      );
    };
  }, [enabled, reconnectNonce, abandonPendingOrders, resetSubPacing]);

  // ---------------------------------------------------------
  // 구독 반영 — 인증 ACK(재접속 포함)와 권한 상태 변화에서 밀린 구독을 흘려보낸다
  // ---------------------------------------------------------
  useEffect(() => {
    flushSubscriptions();
  }, [authEpoch, data.status, flushSubscriptions]);

  const subscribe = useCallback(
    (isin: string, exchange: RelayExchange, level: RelaySubLevel = "full") => {
      if (!isin) return;
      const key = relayQuoteKey(isin, exchange);
      let entry = subRefsRef.current.get(key);
      if (!entry) {
        entry = { isin, ex: exchange, full: 0, price: 0 };
        subRefsRef.current.set(key, entry);
      }
      entry[level] += 1;
      // 해제를 아직 못 보낸 키면 relay 는 그 구독을 들고 있다 — 와이어로 되돌리고 level 만 맞춘다.
      const pendingUnsub = pendingUnsubsRef.current.get(key);
      if (pendingUnsub !== undefined) {
        pendingUnsubsRef.current.delete(key);
        wireSubsRef.current.set(key, pendingUnsub);
      }
      // 0→1 과 실효 level 변경에서만 와이어가 움직인다 — `flushSubscriptions` 가 wireSubs 로
      // 중복을 막는다.
      flushSubscriptions();
    },
    [flushSubscriptions],
  );

  const unsubscribe = useCallback(
    (isin: string, exchange: RelayExchange, level: RelaySubLevel = "full") => {
      if (!isin) return;
      const key = relayQuoteKey(isin, exchange);
      const entry = subRefsRef.current.get(key);
      // 잡지 않은 level 의 해제는 무시한다 — relay hub 「참조계수 없는 해제 — 무시」 와 동형.
      if (!entry || entry[level] <= 0) return;
      entry[level] -= 1;
      if (entry.full + entry.price > 0) {
        // 아직 다른 소비자가 보고 있다 — full→price 강등이면 `lv:"price"` 로 재송신, 아니면 무동작.
        flushSubscriptions();
        return;
      }

      subRefsRef.current.delete(key);
      const wire = wireSubsRef.current.get(key);
      if (!wire) return;
      wireSubsRef.current.delete(key);

      const ws = socketRef.current;
      if (!ws || ws.readyState !== WS_READY_OPEN) return;
      // 구독 제어 버킷을 탄다 — 버킷이 비면 다음 흘림에서 나간다.
      pendingUnsubsRef.current.set(key, wire);
      flushSubscriptions();
    },
    [flushSubscriptions],
  );

  const send = useCallback((msg: RelayInbound): boolean => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WS_READY_OPEN) {
      /*
        ★ 조용히 삼키지 않는다 (PC-7 「무로그 fail-safe 금지」 / T-16-19).
          로그에는 **메시지 종류만** 싣는다 — `lc.set.cfg`·`vi.set.accountNo` 에 계좌번호가
          들어 있고 이 로그가 나가는 곳은 브라우저 콘솔이다(T-16-18).
      */
      console.error(`[relay] 소켓 미연결 — 전송하지 않음 (t=${msg.t})`);
      return false;
    }
    ws.send(JSON.stringify(msg));
    if (msg.t === "strategies.disable") {
      /*
        ★ 전부 정지 in-flight 창 (quick-260926-nr2) — 소켓에 실린 뒤에만 연다(미연결 false 갈래는
          아무것도 dispatch 하지 않는다). 65 는 서버 핸들러(`ProcessDisableStrategies`)의 **마지막**
          프레임이고 키별 에코가 그 앞에 같은 연결로 온다. 살아 있는 소켓에서 65 가 끝내 안 오는
          경우는 relay 가 게이트웨이 전에 거부했거나(그러면 전부 정지 에코도 없다) 프레임 유실뿐이고,
          그 판정 시각은 상태 카드가 「65 유실」을 선언하는 시각과 같아야 하므로 같은 상수를 쓴다.
          벽시계 창이 아니라 65·연결 수명이 1차 경계이고 이 타이머는 백스톱이다.
          콘솔 로그를 더하지 않는다(T-16-18).
      */
      dispatch({ type: "strategies-disable-sent" });
      if (killSwitchTimerRef.current !== null) clearTimeout(killSwitchTimerRef.current);
      killSwitchTimerRef.current = setTimeout(() => {
        killSwitchTimerRef.current = null;
        dispatch({ type: "strategies-disable-expired" });
      }, STRATEGIES_DISABLE_ACK_TIMEOUT_MS);
    }
    return true;
  }, []);

  const sendOrder = useCallback(
    (msg: RelayOrderNewMsg | RelayOrderModifyMsg | RelayOrderCancelMsg): Promise<RelayOrderResultMsg> =>
      new Promise<RelayOrderResultMsg>((resolve) => {
        const ws = socketRef.current;
        if (!ws || ws.readyState !== WS_READY_OPEN) {
          // 보내지 **않았음**이 확실하다 — 재주문해도 이중 발주가 아니다.
          resolve(
            localOrderResult(
              msg.rid,
              "rejected",
              "시세 서버에 연결돼 있지 않아 주문을 보내지 못했어요.",
            ),
          );
          return;
        }

        const timer = setTimeout(() => {
          pendingOrdersRef.current.delete(msg.rid);
          // **결과를 모른다** — 주문이 이미 나갔을 수 있으므로 재주문을 유도하지 않는다.
          resolve(
            localOrderResult(
              msg.rid,
              "timeout",
              "주문 결과를 받지 못했어요. 미체결 목록을 확인해 주세요.",
            ),
          );
        }, ORDER_RESULT_BACKSTOP_MS);

        pendingOrdersRef.current.set(msg.rid, { resolve, timer });
        ws.send(JSON.stringify(msg));
      }),
    [],
  );

  const reconnect = useCallback(() => {
    setReconnectNonce((v) => v + 1);
  }, []);

  const probeNow = useCallback(() => probeNowRef.current(), []);

  const statusLabel = data.status === "idle" ? "" : RELAY_STATE_LABELS[data.status];

  return useMemo<RelayConnectionState>(
    () => ({
      status: data.status,
      statusLabel,
      statusMessage: data.statusMessage,
      attempt: data.attempt,
      accounts: data.accounts,
      quotes: data.quotes,
      tapes: data.tapes,
      accountStates: data.accountStates,
      orderIndex: data.orderIndex,
      orders: data.orders,
      journalRows: data.journalRows,
      journalState: data.journalState,
      messages: data.messages,
      isStale: data.isStale,
      limitChasers: data.limitChasers,
      lastLimitChaserEcho: data.lastLimitChaserEcho,
      limitChaserDisableEchoes: data.limitChaserDisableEchoes,
      viTriggers: data.viTriggers,
      viOrders: data.viOrders,
      viNotices: data.viNotices,
      strategiesDisabled: data.strategiesDisabled,
      rateCrossItems: data.rateCrossItems,
      rateCrossSnapSeq: data.rateCrossSnapSeq,
      limitChaserSnapSeq: data.limitChaserSnapSeq,
      queuedWindow: data.queuedWindow,
      nxtTradable: data.nxtTradable,
      send,
      reconnect,
      probeNow,
      subscribe,
      unsubscribe,
      sendOrder,
    }),
    [data, statusLabel, send, reconnect, probeNow, subscribe, unsubscribe, sendOrder],
  );
}

/** JSON 프레임 파싱. 실패·비객체·`t` 없음은 전부 null(스킵). */
function parseFrame(raw: unknown): RelayOutbound | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 깨진 프레임은 throw 하지 않고 스킵한다 (chat-sse.ts 파서 선례, T-15-41).
    return null;
  }
  if (parsed == null || typeof parsed !== "object") return null;
  if (typeof (parsed as { t?: unknown }).t !== "string") return null;
  return parsed as RelayOutbound;
}
