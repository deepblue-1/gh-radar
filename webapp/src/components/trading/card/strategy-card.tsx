"use client";

/**
 * StrategyCard — 작업대의 **전략 카드 1장** (D-09 ~ D-12 · D-27 · D-28 · TRADE-09).
 *
 * 옛 상따 화면의 `LimitChaserSurface`(18-13 삭제) 가 이미 「한 전략」 단위였다.
 * 이 파일은 그 몸통을 **컴포넌트로 승격**한 것이다 — relay 구독 · 전송↔에코 상관 · 자기 키
 * `find` · 전략 로그 · 더티 연결이 전부 `useStrategyCardState` 한 훅으로 옮겨 왔고, 옛 화면도
 * 18-12 에서 사라지기 전까지 **같은 훅**을 쓴다(정의 1벌).
 *
 * ① ★ `@container/lc` 선언은 **이동**이다 — 복제가 아니다 (D-28)
 *   §2.2b 4밴드(카드 폭 685 · 830 · 992)를 재는 컨테이너가 페이지 본문에서 **카드 래퍼**로
 *   왔다. `limit-chaser-form.tsx` · `orderbook-ladder.tsx` · `quote-grid-10.tsx` 의
 *   `@min-[Npx]/lc:` 유틸리티는 **한 글자도 바뀌지 않은 채** 가장 가까운 `lc` 조상인 카드의
 *   폭을 잰다. 새 컨테이너 이름을 만들지 않는다 — §2.2b 소비처가 둘이 되면 갈라진다.
 *   밴드 표와 경계 셋의 실측 근거는 `webapp/src/styles/globals.css` §2.2b 가 정본이다.
 *   ★ 이 래퍼가 빠지거나 이름(`lc`)이 어긋나면 안쪽 모든 밴드 분기가 **에러 없이** 조용히
 *     폰 밴드로 떨어진다(잘못된 배치이지 실패가 아니라 눈에 띄지 않는다).
 *   ★ 컨테이너는 layout containment 를 걸어 `position:fixed` 자손의 **컨테이닝 블록**이
 *     된다 — 그래서 폼의 더티 액션 바는 `document.body` 로 포털된다(`limit-chaser-form`).
 *   ★ 카드 안에 뷰포트 브레이크포인트를 섞지 않는다 — §2.2b 가 기록한 255px 역전이 되살아난다.
 *
 * ② ★ 카드는 서버 에코를 **자기 `key`(ISIN:계좌:거래소)로만** 읽는다 (D-27 · T-18-25)
 *   `limitChasers.find(c => c.key === key)` 와 `lastLimitChaserEcho.key === key` 가 카드
 *   인스턴스마다 돈다. 작업대가 에코를 받아 카드에 **분배하지 않는다** — 분배 로직이 상관의
 *   두 번째 벌이 되고, 그 순간 「다른 카드의 에코로 내 더티가 지워지는」 경로가 생긴다.
 *   `pendingRef`·`unacked`·`ackTimer` 도 전부 인스턴스별이다.
 *
 * ③ ★ 카드는 자기 `isin`/`exchange` 로만 구독한다 (T-18-26 · T-15-40 / T-16-02 승계)
 *   `useRelaySubscription` 이 자기 키의 시세만 돌려주고, 언마운트·키 변경 때 그 키를 해제한다.
 *
 * ④ ★ 재렌더 예산 (T-18-29)
 *   카드는 `useIsinLabels()` 의 Map 을 구독하지 않는다 — 계좌 델타가 100ms 마다 오면 Map 이
 *   매번 새로 만들어져 카드 N개가 전부 재렌더된다. 부모가 `labels.get(isin)` 결과 **문자열**만
 *   `name`/`code` 로 내리고, 카드는 `memo` 라 문자열이 같으면 다시 그리지 않는다. 콜백 prop 은
 *   `cardId`(작업대 카드 정체성 · WR-05) 를 인자로 받으므로 부모가 카드마다 새 클로저를 만들 필요가
 *   없다.
 *   계좌 상태 슬라이스(이 카드 종목·거래소의 미체결·잔고 · quick-260923-onn)는 이 컴포넌트가 1회
 *   파생한다 — 카드는 이미 relay 컨텍스트 소비자라 재렌더 예산이 늘지 않는다(T-18-29). 접힌 헤더
 *   요약 칩과 카드 탭이 같은 슬라이스를 읽는다(두 진실 금지).
 *
 * ⑤ 본문(좌 호가 | 우 옵션 4그룹)은 18-10 `card-body.tsx` 가 채운다
 *   여기서는 헤더 + 카드 탭(`CardTabs` — 「정보 | 미체결 | 잔고 | 로그」, 2026-09-23 목업 ②A)까지만
 *   조립한다. 본문 상단은 **정보 탭이 10칸을 그린다**(종전 `QuoteGrid10` 자리).
 *   미체결 탭의 행 선택은 작업대 공용 패널과 **같은 선택 상태·같은 콜백**이다 — 카드가 자체 선택
 *   상태를 갖지 않는다(D-21).
 *   그 아래 본문 자리는 `body` 렌더 prop 이다 — 카드 상태(서버 전략 · 시세 · 전송/에코 콜백)를 **카드 밖으로 끌어올리지 않고** 본문에 건넨다.
 *   접힌 카드는 헤더만 **보인다** — 한 번 펼친 본문은 숨김(`hidden`)으로 남아 더티 값·「결과
 *   모름」 잠금·에코 상관을 지킨다(WR-02). 한 번도 펼친 적 없는 카드는 본문을 만들지 않는다.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { serverMsgBadge } from "@gh-radar/shared";
import type {
  RelayExchange,
  RelayLimitChaser,
  RelayLimitChaserInput,
  RelayOrderResultMsg,
  RelayQuote,
  RelayTapeEntry,
  RelayUnfilled,
} from "@gh-radar/shared";

import { cardAccountSliceOf } from "@/components/trading/card/card-account-slice";
import { CardHeader } from "@/components/trading/card/card-header";
import { DirtyBarHostContext } from "@/components/trading/dirty-action-bar";
import { LC_ORPHAN_WAIT_MS } from "@/components/trading/lc/use-lc-field-commit";
import { CardTabs, type CardOrderLogInput, type CardTabRequest } from "@/components/trading/card/card-tabs";
import { useOrderLogFeedContext } from "@/components/trading/order-log/order-log-feed-context";
import type { AccountRowOrigin } from "@/components/orderbook/account-panel";
import {
  latchLedStateOf,
  type ArmableLatchKind,
  type LatchLedServer,
} from "@/components/trading/latch-led";
import { strategyBadgesOf } from "@/components/trading/strategy-badge";
import {
  echoAnswersSent,
  isRuntimeOnlyEcho,
  marketCloseDisabledLogLine,
  serverMessageLogLine,
  strategiesDisabledLogLine,
  strategyLogLine,
  type StrategyLogEntry,
  type StrategySubmitCause,
} from "@/components/trading/strategy-log";
import {
  isLimitChaserArmRejection,
  isLimitChaserServerMessage,
  isLimitChaserSetRejection,
  strategyKey,
} from "@/lib/limit-chaser";
import { exchangeChoicesOf } from "@/lib/exchange-choices";
import { useRelayContext, useRelaySubscription } from "@/lib/relay-provider";
import type { RelayServerMessageEntry } from "@/lib/use-relay-socket";
import { cn } from "@/lib/utils";

/**
 * 전송 후 「미반영」 판정까지의 대기(ms).
 * WinForms `RespTimeoutMs=3000` 과 **같은 값**이다 — 두 클라이언트가 다른 시각에 다른 말을
 * 하면 사용자가 어느 쪽을 믿을지 알 수 없다.
 */
export const ACK_TIMEOUT_MS = 3_000;
/** 로그 보관 상한(브라우저 메모리). 새로고침하면 어차피 사라진다. */
const MAX_LOG = 100;

/**
 * `@container/lc` — §2.2b 4밴드를 재는 컨테이너 선언(①). **이 파일이 유일한 출처**다.
 *
 * 종목상세 호가 탭(`stock-orderbook-section.tsx`)은 카드가 아니라 탭 본문 래퍼가 이 선언을 달아야
 * 하므로 이 상수를 import 해 쓴다 — 문자열을 그 파일에 다시 적지 않는다. (옛 상따 화면도 그랬다 · 18-13 삭제)
 * ★ 문자열 리터럴 그대로 둔다 — Tailwind 가 소스를 스캔해 이 클래스를 만든다.
 */
export const LC_CONTAINER_CLASS = "@container/lc";

/**
 * 지금 시각 `HH:MM:SS` — **로케일 포맷터를 쓰지 않는다.**
 *
 * ★ `toLocaleTimeString('ko-KR', { hour12: false })` 는 브라우저에 따라 `0시 57분 16초`
 *   를 돌려준다(Chromium 실측). UI-SPEC 은 상태줄의 `반영 HH:MM:SS` 와 로그 시각을
 *   **`.mono` 고정폭 숫자**로 못박았는데, 한글 조사가 섞이면 폭이 매 초 달라져 로그가
 *   좌우로 흔들리고 상태줄의 다른 항목까지 밀린다. 자리수를 우리가 직접 채운다.
 */
function clockNow(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export interface StrategyStatus {
  /** 매수 그룹 헤더 문구 (A4a). 빈 문자열이면 헤더에 상태 문구가 없다. */
  buyText: string;
  /** 매도 그룹 헤더 문구 (A7a). */
  sellText: string;
}

const EMPTY_STATUS: StrategyStatus = {
  buyText: "",
  sellText: "",
};

/**
 * 에코 → **폼 그룹 헤더 문구** (**순수 함수**).
 *
 * ★ 배지 **종류 판정**은 `strategyBadgesOf`(16-11) 한 곳이고 여기서는 그 결과를 문구로
 *   옮기기만 한다. 판정을 다시 쓰면 사이드바·My page·상태줄이 같은 전략을 다르게 읽는다.
 * ★ `hadOrder` 가 false 면 「발주됨」을 만들지 않는다 — 한 번도 발주된 적 없는 전략을
 *   「발주 완료」로 쓰면 사용자가 나가지도 않은 주문을 찾아 미체결을 뒤진다(Pitfall 10).
 * ★ 17-11 에서 **상태줄 값 4종(`buyLabel`·`sellLabel`·`buyTone`·`sellTone`)을 걷어냈다.**
 *   상태줄의 무장 표기는 이제 래치 LED 가 소유한다(D-22). 남겨 두면 같은 무장을 말하는
 *   두 번째 표기 경로가 열린 채로 남고, 그 둘은 언젠가 갈린다.
 * ★ 18-06 에서 카드와 함께 이 파일로 왔다 — 카드와 옛 화면이 **같은 함수**를 부른다.
 */
export function strategyStatusOf(
  item: RelayLimitChaser | null,
  hadOrder: boolean,
): StrategyStatus {
  if (item === null) return EMPTY_STATUS;
  const kinds = new Set(
    strategyBadgesOf({ ...item, hadOrder }).map((b) => b.kind),
  );
  return {
    buyText: kinds.has("buyOn")
      ? "무장"
      : kinds.has("fired")
        ? "발주 완료 · 무장 해제"
        : "",
    sellText: kinds.has("sellWatch")
      ? "감시 중"
      : kinds.has("sellWait")
        ? "대기 (지지벽 미관측)"
        : "",
  };
}

export interface UseStrategyCardStateOptions {
  /** 12자 ISIN. 비어 있으면 구독도 키도 없다. */
  isin: string;
  /** 위(작업대 상태줄 · 옛 화면 계좌 칩)에서 내려받은 계좌. 비어 있으면 키가 없다. */
  accountNo: string;
  exchange: RelayExchange;
}

/** 카드 1장의 상태 — 본문(`body` 렌더 prop)과 옛 화면이 읽는 계약이다. */
export interface StrategyCardState {
  /** `strategyKey(isin, accountNo, exchange)`. 둘 중 하나라도 비면 `""`. */
  key: string;
  /** 자기 키의 서버 전략(없으면 `null`) — `limitChasers.find(c => c.key === key)`. */
  server: RelayLimitChaser | null;
  quote: RelayQuote | null;
  tape: RelayTapeEntry[];
  isStale: boolean;
  log: StrategyLogEntry[];
  /** 3초 안에 답이 없었다 — **표시만** 한다. 재전송 경로가 없다(T-16-10). */
  unacked: boolean;
  /** 서버가 이 전략에 답한 횟수 — 폼의 전송 잠금을 푸는 신호(값 자체에는 뜻이 없다). */
  answerSeq: number;
  /**
   * 이 전략의 `lc.set` 거부 통지(`isLimitChaserSetRejection`)를 접수한 횟수 — 값 자체에는 뜻이 없다. 거부 통지는
   * `answerSeq` 도 함께 올린다. 부분 거부는 ERROR 뒤 같은 제출의 에코가 오므로 폼 훅이 이 신호로 in-flight 판정을
   * 에코까지 유예한다(24-REVIEW-R3 R3-WR-01 · `LC_REJECT_ECHO_GRACE_MS`).
   */
  rejectSeq: number;
  appliedAt: string | null;
  /** 최신 상따 몫 거부 1건 — 원문과 출처를 따로(배지 판정은 렌더 자리에서 한 번). */
  lastError: { text: string; src: string } | null;
  /** 삭제 에코를 받으면 올라간다 — 폼 remount 키에 넣는다(⑤ 삭제). */
  resetSeq: number;
  /** 시딩에 쓴 실시간 상한가(0 = 아직). 폼 remount 키에 넣는다. */
  liveSeed: number;
  badges: StrategyStatus;
  /** LED 3칩의 유일한 판정 입력 — 서버 에코 하나(발주 이력은 받지 않는다). */
  ledServer: LatchLedServer;
  dirtyCount: number;
  setDirtyCount: (n: number) => void;
  handleArm: (kind: ArmableLatchKind) => void;
  /**
   * 보낸 직후 통지 — `cfg` 는 그 에코의 로그 귀속(D-01/D-02 동반)에, `meta.cause` 는 사람 손이 아닌
   * 제출의 사유(D-02 후반 `'serverFold'` — 24-06 폼이 넘긴다)에 쓴다. 둘은 같은 수명이다.
   */
  handleSent: (cfg: RelayLimitChaserInput, meta?: { cause?: StrategySubmitCause }) => void;
  /**
   * 클라 합성 로그 한 줄 — 제출이 없어 에코가 말해 줄 수 없는 사건(D-16 상한가 차단 · 24-07 D-06)만 쓴다.
   * ★ `queueMicrotask` 로 한 박자 늦게 쌓는다 — 자식(폼) 이펙트가 부모(이 훅) 이펙트보다 먼저 돌아서, 같은 렌더의
   *   에코 전이 줄보다 먼저 쌓이면 사건 순서가 뒤집혀 보인다(최신이 위). 한 박자 늦추면 늘 그 전이 줄 **뒤**다.
   */
  pushClientLog: (text: string, level?: "info" | "error") => void;
}

/**
 * 카드 1장의 상태 훅 — 옛 `LimitChaserSurface` 의 몸통을 그대로 옮겼다.
 *
 * ★ 이 훅의 모든 판정은 **자기 `key`** 로만 한다(파일 상단 ②). 인스턴스가 N개여도 서로의
 *   refs·타이머·배너를 공유하지 않는다.
 */
export function useStrategyCardState({
  isin,
  accountNo,
  exchange,
}: UseStrategyCardStateOptions): StrategyCardState {
  const {
    limitChasers,
    lastLimitChaserEcho,
    limitChaserDisableEchoes,
    messages,
    send,
    strategiesDisabled,
  } = useRelayContext();

  const subscription = useRelaySubscription({
    isin,
    exchange,
    enabled: isin.length > 0,
  });
  const { quote, tape, isStale } = subscription;

  const key =
    isin === "" || accountNo === ""
      ? ""
      : strategyKey(isin, accountNo, exchange);
  const server = useMemo(
    () =>
      key === "" ? null : (limitChasers.find((c) => c.key === key) ?? null),
    [limitChasers, key],
  );

  /* ── 전략 로그 (브라우저 메모리) ───────────────────────────────────────── */

  const [log, setLog] = useState<StrategyLogEntry[]>([]);
  const logSeq = useRef(0);
  const pushLog = useCallback(
    (text: string, level: "info" | "error" = "info") => {
      logSeq.current += 1;
      const entry: StrategyLogEntry = {
        id: `log-${logSeq.current}`,
        at: clockNow(),
        text,
        level,
      };
      setLog((prev) => [entry, ...prev].slice(0, MAX_LOG));
    },
    [],
  );

  const pushClientLog = useCallback(
    (text: string, level: "info" | "error" = "info") => {
      queueMicrotask(() => pushLog(text, level));
    },
    [pushLog],
  );

  /* ── 전송 ↔ 에코 상관 (③) ─────────────────────────────────────────────── */

  /**
   * 마지막으로 보낸 요청. **재전송에 쓰지 않는다.**
   * 수명의 끝: 내 요청 변화를 싣은 에코 소비(`echoAnswersSent`) · 결과 모름 창 만료 · 삭제 · 키 변경.
   * 거부 통지는 끝이 아니다 — 부분 거부는 ERROR 뒤 같은 제출의 에코가 오고, 다른 탭의 거부도 팬아웃된다(GC-WR-01).
   */
  const pendingRef = useRef<RelayLimitChaserInput | null>(null);
  /**
   * 마지막으로 보낸 요청의 **사유**(D-02 후반 `'serverFold'` · 없으면 `null` = 사람 손).
   * ★ `pendingRef` 와 **같은 수명**이다 — 보낼 때 함께 세우고, 내 요청 변화를 싣은 에코 소비 · 결과 모름 창
   *   만료 · 삭제 · 키 변경 때 함께 비우며, 런타임 에코 · 내 요청 변화를 싣지 않은 에코는 둘 다 소비하지 않는다.
   *   따로 살면 앞 제출의 사유가 뒤 에코에 붙는다(WR-05). 거부 통지로는 비우지 않는다(GC-WR-01).
   */
  const pendingCauseRef = useRef<StrategySubmitCause | null>(null);
  const [unacked, setUnacked] = useState(false);
  const ackTimer = useRef<number | null>(null);
  /**
   * 보낸 제출의 귀속(`pendingRef` · `pendingCauseRef`)을 **결과 모름 창이 닫힐 때** 비우는 타이머(WR-05).
   * 창 = 카드 `ACK_TIMEOUT_MS` + 훅 `LC_ORPHAN_WAIT_MS` — 훅 고아 장벽과 같은 수평선이다(훅은 이 뒤 대기
   * 건을 실패로 접는다). `lc.arm` 경로는 `pendingRef` 를 세우지 않으므로 이 타이머도 걸지 않는다.
   */
  const pendingExpiryTimer = useRef<number | null>(null);
  /**
   * 서버가 이 전략에 답한 **횟수**. 숫자 자체에는 뜻이 없고 「바뀌었다」만 쓴다.
   *
   * 폼의 전송 잠금(`submitting` → 「수정」 버튼이 `반영 중…`)을 푸는 신호다. 폼은 그 잠금을
   * `server` prop 의 변화로만 풀 수 있는데, **답이 왔는데도 `server` 가 그대로인 경우**가
   * 둘 있다: (a) 미등록 키의 철거 에코(`crud:"D"` — 목록이 그대로다) (b) 거부(60 에코 자체가
   * 없다). 그때 폼의 1차 CTA 가 영구히 잠긴다 — 상태줄 「미반영」과 **같은 뿌리**의 결함이라
   * 같은 신호로 함께 푼다 (debug `lc-unacked-stuck-new-route`).
   */
  const [answerSeq, setAnswerSeq] = useState(0);
  /** lc.set 거부 통지 접수 횟수 — `StrategyCardState.rejectSeq`(R3-WR-01). */
  const [rejectSeq, setRejectSeq] = useState(0);
  const [appliedAt, setAppliedAt] = useState<string | null>(null);
  const [dirtyCount, setDirtyCount] = useState(0);
  /** 삭제 에코를 받으면 올린다 — 폼을 remount 해 빈 상태로 되돌리는 유일한 장치(⑤). */
  const [resetSeq, setResetSeq] = useState(0);
  /*
    ★ 옛 `fired`(「직전에 매수 발주가 나갔는가」) 상태는 걷었다 — Phase 24 마스터는 발주로 접히지 않는다.
      발주 사실은 서버 사유 줄(`[상따] … 매수 N주 @…`)이 말한다(Pitfall 11 · 플래너 결정). 마스터 OFF 에코의
      원인은 사람(다른 단말 · WinForms 자동 끔) · 15:40 · 전부 정지뿐이라 「발주」 추론이 늘 틀렸다.
  */
  /**
   * 시딩에 쓴 **실시간** 상한가. 0 이면 아직 실시간 값으로 시딩한 적이 없다.
   *
   * ★ 왜 필요한가: 종목을 고른 직후에는 REST 상세의 상한가밖에 없고, 실시간 호가(`quote.ul`)
   *   는 구독 왕복 뒤에 온다. 그대로 두면 **폼의 가격 5칸은 REST 값, 위 칩은 실시간 값**이라
   *   같은 화면이 상한가를 두 숫자로 말한다. 그 상태로 스위치를 켜면 사용자가 본 적 없는
   *   가격으로 등록된다.
   * ★ 한 번만 올린다. 상한가는 세션 내내 고정이므로 이 재시딩은 종목당 1회이고, 그
   *   시점은 사용자가 값을 고치기 전(선택 직후 수백 ms)이다. 서버 전략이 이미 있으면
   *   **아예 올리지 않는다** — 그때는 시딩 자체가 없고 remount 는 편집을 지우는 일만 한다.
   */
  const [liveSeed, setLiveSeed] = useState(0);

  /**
   * `lc.arm` 이 소켓에 실렸고 아직 답(그 키의 60 에코 또는 인식된 거부 통지)이 없다
   * (quick-260926-nr2). 게이트웨이가 arm 거부에 전략 키를 싣지 않으므로 거부 통지와의 상관은 이
   * in-flight 창으로 한다. **`pendingRef` 와 따로 둔다** — arm 은 lc.set 이 아니고, 로그 귀속(`sent`)이
   * 그것을 내 제출로 읽으면 안 된다.
   */
  const armInFlightRef = useRef(false);

  /** 3초 「미반영」 대기를 (다시) 건다 — lc.set 과 lc.arm 이 같은 타이머를 쓴다. */
  const startAckWait = useCallback(() => {
    setUnacked(false);
    if (ackTimer.current != null) window.clearTimeout(ackTimer.current);
    // ★ 여기서 하는 일은 **표시**뿐이다. 타이머가 끝나도 아무것도 다시 보내지 않는다.
    ackTimer.current = window.setTimeout(
      () => setUnacked(true),
      ACK_TIMEOUT_MS,
    );
  }, []);

  const handleSent = useCallback(
    (cfg: RelayLimitChaserInput, meta?: { cause?: StrategySubmitCause }) => {
      pendingRef.current = cfg;
      pendingCauseRef.current = meta?.cause ?? null;
      startAckWait();
      /*
        ★ 무응답의 끝 = 훅 고아 장벽과 같은 결과 모름 수평선(WR-05). 3초에 비우면 늦게 닿은 내 에코가
          다른 단말로 읽힌다 — 비우기만 하고 보내지 않는다(T-16-10).
        ★ 동일성 가드 — 그 사이 새 제출이 있었으면(`pendingRef` 가 다른 cfg) 건드리지 않는다.
      */
      if (pendingExpiryTimer.current != null) window.clearTimeout(pendingExpiryTimer.current);
      pendingExpiryTimer.current = window.setTimeout(() => {
        pendingExpiryTimer.current = null;
        if (pendingRef.current === cfg) {
          pendingRef.current = null;
          pendingCauseRef.current = null;
        }
      }, ACK_TIMEOUT_MS + LC_ORPHAN_WAIT_MS);
    },
    [startAckWait],
  );

  /**
   * 「서버가 답했다」를 접수한다 — **이 카드에서 「모른다」를 거두는 유일한 함수**다.
   *
   * ★ 타이머를 **반드시 끈다.** 플래그만 내리면 이미 걸려 있던 3초 타이머가 그대로 발화해
   *   답을 받은 뒤에 「미반영」이 다시 선다 — 답이 3초 안에 오는 정상 경로가 곧 그 경우다.
   * ★ 되보내지 않는다(T-16-10). 여기는 「모른다」를 거두는 자리이지 「다시 시도한다」를
   *   말하는 자리가 아니다.
   */
  const acceptAnswer = useCallback(() => {
    if (ackTimer.current != null) window.clearTimeout(ackTimer.current);
    ackTimer.current = null;
    setUnacked(false);
    setAnswerSeq((n) => n + 1);
  }, []);

  /** 직전 에코 — 전이 문장의 기준선이다. 전략 키가 바뀌면 되돌린다. */
  const prevServerRef = useRef<RelayLimitChaser | null>(null);
  useEffect(() => {
    prevServerRef.current = null;
    pendingRef.current = null;
    pendingCauseRef.current = null;
    if (pendingExpiryTimer.current != null) window.clearTimeout(pendingExpiryTimer.current);
    pendingExpiryTimer.current = null;
    armInFlightRef.current = false;
    setUnacked(false);
    setAppliedAt(null);
    setLiveSeed(0);
  }, [key]);

  /**
   * ③-b **「서버가 답했다」의 정본은 60 에코 스트림이다** — 파생 목록이 아니다
   * (debug `lc-unacked-stuck-new-route`, 2026-09-21 프로덕션 장중 차단 사고).
   *
   * 아래 에코 이펙트는 `limitChasers` 에서 뽑은 `server` **객체의 변화**를 본다. 그 파생은
   * 「지금 무엇이 등록돼 있는가」의 정본이라 계약상 `crud:"D"` 를 떨어뜨린다. 그래서
   * **등록된 적 없는 전략에 대한 철거 에코**는 `server` 를 `null → null` 로 두고,
   * `Object.is(null, null)` 때문에 아래 이펙트는 **재실행조차 되지 않는다.**
   *
   * 그 상태는 `/limit-chaser/new` 의 기본값이고(전략을 켰다 끄면 되돌아온다), 그때 상태줄이
   * 「미반영 · 서버 응답을 기다리고 있어요」에 영구히 걸렸다 — 서버(`Gateway.cpp` 가 `crud='D'`
   * 에도 반드시 에코를 낸다)도 relay(`subscription-hub.ts` 가 `crud` 와 무관하게 팬아웃한다)도
   * 제 몫을 했는데 브라우저만 그 답을 버린 것이다.
   *
   * ★ 그래서 **답의 유무를 묻는 곳과 등록 여부를 묻는 곳을 가른다.** 이 이펙트는 목록을
   *   보지 않고 에코 스트림만 본다.
   * ★ 키가 같은 에코만 받는다 — 남의 전략에 대한 답으로 내 「모른다」를 거둘 수 없다.
   *   카드가 N개인 작업대에서 이 한 줄이 카드 간 격리의 핵심이다(T-18-25).
   * ★ **폼도 로그도 건드리지 않는다.** 삭제 후처리(`setResetSeq` 로 폼 remount · 삭제 로그)는
   *   아래 이펙트가 `prev !== null` 일 때만 하는 일이고 그대로 둔다 — 지울 전략이 애초에
   *   없었던 철거에 폼을 비우면 사용자가 방금 입력한 값을 우리가 지우는 것이 된다.
   */
  useEffect(() => {
    if (key === "" || lastLimitChaserEcho === null) return;
    if (lastLimitChaserEcho.key !== key) return;
    // 그 키의 에코는 내 lc.arm 에 대한 답이기도 하다(성공·멱등 = 즉답 60 에코).
    armInFlightRef.current = false;
    acceptAnswer();
  }, [lastLimitChaserEcho, key, acceptAnswer]);

  useEffect(() => {
    const prev = prevServerRef.current;

    // 삭제 — 목록에서 빠졌다(전역 스냅샷이 `crud:"D"` 를 제거한다).
    if (server === null) {
      if (prev !== null) {
        prevServerRef.current = null;
        pendingRef.current = null;
        pendingCauseRef.current = null;
        acceptAnswer();
        setResetSeq((n) => n + 1);
        pushLog(
          strategyLogLine(prev, { ...prev, crud: "D" }) ?? "전략이 삭제됐어요",
        );
      }
      return;
    }

    if (prev === server) return;

    /*
      ★ 내용상 새로 말할 것이 없는 에코 — 무동작 (quick-260926-nr2). 판정은 `isRuntimeOnlyEcho`
        한 곳이다(같은 내용의 새 객체 · 체결/래칫 카운터만 · relay 파생 name/code 만 다름).
        (i) 내용이 같으면 누구에게 귀속할 전이가 없다 — 로그·배너·appliedAt 을 건드리지 않는다.
        (ii) **`pendingRef`(와 `pendingCauseRef`)를 소비하지 않는다.** gh-trade 는 lc.set/lc.arm 에 즉답
             에코를 주고 `MarkEchoDirty` 가 300ms 플러시 동일 사본을 또 민다 — 여기서 소비하면 사본이 내
             진짜 에코보다 먼저 온 순간 내 변경이 「다른 단말」로 읽히고 동반 · 서버 접힘 문장이 사라진다.
             Phase 24 런타임 에코(후매수 단계 · 잔여 · 발동잔량 · 추가매수 포기)도 같다(D-13).
        (iii) 남는 비용: 정규화로 prev 와 같은 답이면 귀속은 결과 모름 창 만료까지 남는다 — 그 사이 무관
             에코는 `echoAnswersSent` 가 거르므로 배너를 삼키지 않는다(GC-WR-01). (ii) 의 오귀속보다 싸다.
        (iv) 게이트/래치 런타임 푸시가 내 에코보다 먼저 와도 내 요청 변화를 싣지 않으면 pendingRef 를
             소비하지 않는다(`echoAnswersSent` — GC-WR-01). 내가 요청한 게이트 값과 우연히 같은 푸시만 남는
             경합이다.
        `acceptAnswer` 도 부르지 않는다 — 응답 채널은 위 키 일치 `lastLimitChaserEcho` 이펙트다
        (같은 내용의 lc.snap 을 답으로 세면 재접속만으로 미반영이 거둬진다 — use-relay-socket
        `lastLimitChaserEcho` 문서와 같은 규율).
    */
    if (prev !== null && isRuntimeOnlyEcho(prev, server)) {
      prevServerRef.current = server;
      return;
    }
    prevServerRef.current = server;

    const sent = pendingRef.current;
    const sentCause = pendingCauseRef.current;
    /*
      ★ 귀속 = 이 에코가 내 요청 변화를 싣는가(`echoAnswersSent`) 하나 — 거부 여부 · 문구를 보지 않는다(GC-WR-01).
        부분 거부는 ERROR 뒤 같은 제출의 에코가 요청 일부를 눕힌 채 오고, 다른 탭의 거부 통지는 이 탭에도 팬아웃된다 —
        거부 통지로 귀속을 끊으면 내 진짜 에코가 「다른 단말」로 읽힌다.
      ★ 귀속 두 칸은 **`mine` 일 때만** 비운다. 내 요청 변화를 싣지 않은 에코(다른 단말 · 서버)는 귀속을 받지도
        소비하지도 않는다 — 내 진짜 에코가 뒤에 올 수 있다. 그 귀속의 끝은 결과 모름 창 만료(`handleSent` 타이머)다.
    */
    const mine = sent !== null && echoAnswersSent(prev, sent, server);
    if (mine) {
      pendingRef.current = null;
      pendingCauseRef.current = null;
    }
    acceptAnswer();
    setAppliedAt(clockNow());

    /*
      로그 귀속 — 이 에코가 답한 **내 제출(`sent`)과 그 사유(`sentCause`)**를 넘긴다(Phase 24 ⑨).
        · D-01 / D-02 전반: 마스터와 그룹을 함께 실어 보낸 제출의 에코 → 동반 문장 한 줄
        · D-02 후반: 폼이 서버 접힘 뒤 스스로 보낸 마스터 OFF(`cause 'serverFold'`) → 서버 접힘 문장 한 줄
        · 보내지 않은 에코(`!mine` — 다른 단말 · WinForms 가 먼저 보낸 자동 끔 · 내 요청 변화를 싣지 않은 에코) → 종전 전이 문장
      ★ Phase 24 — 마스터는 발주로 접히지 않는다. 마스터 OFF 에코를 「발주」로 읽지 않고 헤더 「발주 완료」도
        세우지 않는다 — 발주 사실은 서버 사유 줄이 말한다(Pitfall 11 · 플래너 결정).
      15:40 · 전부 정지 원인은 relay 귀속 맵(`limitChaserDisableEchoes`)을 **에코 객체 동일성**으로만
      받는다 — 맵 항목이 지금 이 에코가 아니면(나중 lc.snap · 다음 에코) 원인이 아니다.
      ★ 이 경로는 아무것도 보내지 않는다(T-24-23) — 에코 경로의 유일한 제출(D-02 후반)은 24-06 폼 몫이다.
    */
    const disable = key === "" ? undefined : limitChaserDisableEchoes.get(key);
    const cause = disable !== undefined && disable.echo === server ? disable.cause : null;
    /*
      ★ 15:40 · 전부 정지가 원인인 에코는 내 제출의 답이 아니다 — 옛 hadOrder 규율 복원(WR-05). 원인 문장만
        남기고 보낸 cfg · 사유는 넘기지 않는다(「클라가 지어낸 사유를 쓰지 않는다」).
    */
    const attributed = cause !== null || !mine ? null : sent;
    const line = strategyLogLine(prev, server, {
      sent: attributed,
      sentCause: attributed === null ? null : sentCause,
    });
    if (line !== null) pushLog(line);
    // 15:40 해제는 원인 1줄을 더 남긴다 — 사용자가 끄지 않은 해제의 이유를 로그가 말한다.
    if (cause === "marketClose") pushLog(marketCloseDisabledLogLine());
    // `limitChaserDisableEchoes` 로 재실행돼도 위 동일성 조기 반환이 무해하게 만든다.
  }, [server, key, limitChaserDisableEchoes, pushLog, acceptAnswer]);

  useEffect(
    () => () => {
      if (ackTimer.current != null) window.clearTimeout(ackTimer.current);
      if (pendingExpiryTimer.current != null) window.clearTimeout(pendingExpiryTimer.current);
    },
    [],
  );

  /* ── ServerMessage(54) — 상따 몫만 (④) ────────────────────────────────── */

  const lastMsgRef = useRef<RelayServerMessageEntry | null>(null);
  /**
   * 최신 거부 1건 — **원문과 출처를 따로** 들고 있는다(17-11 / D-17).
   *
   * 배지 판정은 렌더 자리에서 `serverMsgBadge(src)` 한 번만 한다. 여기서 이미 배지가 붙은
   * 문장을 넣어 두면 로그 줄과 상태줄이 **같은 배지를 두 번** 말하게 된다
   * (옛 VI 화면이 세운 같은 모양이다).
   */
  const [lastError, setLastError] = useState<{ text: string; src: string } | null>(
    null,
  );
  useEffect(() => {
    if (messages.length === 0) return;
    const seen = lastMsgRef.current;
    const idx = seen === null ? -1 : messages.indexOf(seen);
    // 못 찾으면(상한 20 을 넘겨 밀려났다) 지금 목록 전체가 새것이다.
    const fresh = idx < 0 ? messages : messages.slice(0, idx);
    lastMsgRef.current = messages[0];
    for (const msg of [...fresh].reverse()) {
      /*
        ★ 내 lc.arm 의 거부 답인가 (quick-260926-nr2) — arm in-flight 창 안에서만 묻는다. 현 gh-trade
          는 36/37 거부를 src "System"(i/a/kind 빈 값) WARN 으로 보내 아래 표시 몫 판정에 걸리지
          않는다. 판정은 `isLimitChaserArmRejection` 한 곳이다.
      */
      const armAnswer =
        armInFlightRef.current && isLimitChaserArmRejection(msg, isin, accountNo);
      // VI 몫·무관한 System 통지는 여기서 그리지 않는다(표시 몫 불변).
      if (!armAnswer && !isLimitChaserServerMessage(msg)) continue;
      const { text, level } = serverMessageLogLine(msg);
      pushLog(text, level);
      if (armAnswer) {
        // 거부도 답이다 — 「미반영」을 거둔다. 재전송하지 않는다(T-16-10 · T-17-40).
        armInFlightRef.current = false;
        acceptAnswer();
      }
      /*
        ★ 상태줄에도 남긴다 — 로그만 있으면 스크롤 밖에서 조용히 지나간다(T-16-07).
        ★ arm 거절은 WARN 이어도 카드 경보에 세운다 — 사용자 클릭에 대한 거절은 **클릭한 자리**에
          보여야 한다(PC-7 무로그 fail-safe 금지).
      */
      if (level !== "error" && !armAnswer) continue;
      setLastError({ text: msg.m, src: msg.src });
      /*
        ★ **거부도 답이다.** 서버가 사유를 말한 순간 「모른다」는 거짓이 되므로 「미반영」을
          함께 거둔다 — 안 거두면 상태줄 한 줄이 「응답을 기다리고 있어요」와 「이래서
          거부됐습니다」를 **동시에** 말한다(debug `lc-unacked-stuck-new-route`).
          전면 거부(거래소 화이트리스트 밖 · NXT 미거래 — `Gateway.cpp` 가 에코 앞에서 return 한다)에는
          60 에코가 없어 이 통지가 그 요청에 대한 **유일한** 답이다. 부분 거부는 뒤에 같은 제출의 에코가
          온다(아래 GC-WR-01).
        ★ 판정은 `isLimitChaserSetRejection` **한 곳**이다. 위 표시 몫 판정
          (`isLimitChaserServerMessage`)보다 좁다 — 근거는 그 함수 주석에 있다. 여기서
          `src` 를 직접 비교하지 않는 이유는 이 파일의 다른 판정들과 같다.
        ★ 사유 문구를 **다시 쓰지 않는다.** 화면에 서는 것은 `msg.m` 원문 그대로다.
        ★ 거부 통지는 귀속(`pendingRef` · `pendingCauseRef`)의 끝이 **아니다**(GC-WR-01 · WR-05 재개).
          부분 거부(매도 · 취소 · 추가 · 후매수 검증 실패)는 그 항만 눕히고 ERROR 를 먼저 보낸 뒤 같은 제출의
          에코가 오고, ServerMessage 는 사용자의 모든 탭으로 팬아웃된다 — 여기서 비우면 내 진짜 에코가 「다른
          단말」로 읽히고 동반 · 서버 접힘 문장이 사라진다. 귀속의 끝은 에코 소비 · 결과 모름 창 만료 두
          수평선이고, 거부된 제출의 사유가 무관한 에코에 붙는 것(WR-05)은 에코 이펙트의 `echoAnswersSent`
          판정이 막는다. 여기서는 「모른다」만 거두고 다시 보내지 않는다(T-16-10).
        ★ 거부 신호(`rejectSeq`)도 함께 올린다(24-REVIEW-R3 R3-WR-01) — 폼 훅이 이 답을 「결과 확정」이 아니라 「곧 같은
          제출의 에코가 올 수 있음」으로 읽고 판정을 에코까지 유예한다(전면 거부면 유예 끝에 실패).
      */
      if (isLimitChaserSetRejection(msg, isin, accountNo)) {
        acceptAnswer();
        setRejectSeq((n) => n + 1);
      }
    }
  }, [messages, pushLog, isin, accountNo, acceptAnswer]);

  /* ── 15:40 서버 자동 비활성화(65) ─────────────────────────────────────── */

  const lastDisabledRef = useRef(strategiesDisabled);
  useEffect(() => {
    if (
      strategiesDisabled === null ||
      strategiesDisabled === lastDisabledRef.current
    ) {
      lastDisabledRef.current = strategiesDisabled;
      return;
    }
    lastDisabledRef.current = strategiesDisabled;
    pushLog(strategiesDisabledLogLine());
  }, [strategiesDisabled, pushLog]);

  // 실시간 상한가가 처음 도착하면 그 값으로 **한 번만** 다시 시딩한다(위 `liveSeed` 주석).
  useEffect(() => {
    if (server !== null || liveSeed !== 0) return;
    const live = quote?.ul ?? 0;
    if (live > 0) setLiveSeed(live);
  }, [server, quote, liveSeed]);
  // 발주 이력 입력은 늘 false — 마스터 전이로 「발주 완료」를 세우지 않는다(Pitfall 11). 함수 모양은 My page 와 공유.
  const badges = strategyStatusOf(server, false);

  /*
    ── 래치 LED 3종 (17-11 / D-19~D-22) ──────────────────────────────────────

    ★ LED 가 읽는 것은 **마지막 서버 에코 스냅샷 하나**다 (D-20). 폼 더티값도, 이미 칠해진
      색도 되읽지 않는다 — 판정 규칙 자체는 `latchLedStateOf`(17-07) 가 소유하고 이 카드는
      그 함수에 무엇을 넘길지만 정한다.
    ★ LED 칩은 발주 이력(`fired`)을 받지 않는다 — 「(발주됨)」 보조 문구는 헤더 한 줄을 지키려
      2026-09-23 에 뺐다. 발주 뒤 매수 칩은 그냥 `OFF` 다.
  */
  const ledServer: LatchLedServer = server;

  /**
   * LED 클릭 → `{t:"lc.arm"}` 1건 (D-20).
   *
   * ★ **확인 다이얼로그가 없다** — 스위치 즉시 전송(D-05)과 같은 규율이다.
   * ★ **낙관적 색 변경을 하지 않는다.** 색의 근거는 60 에코뿐이라, 여기서 미리 칠하면
   *   「켜졌다」는 거짓이 만들어진다(T-17-38).
   * ★ `clickable` 을 **판정 함수에 다시 물어본 뒤에만** 보낸다. `LatchLed` 가 클릭 불가
   *   갈래를 비상호작용 `<span>` 으로 그리지만, 전송 여부를 표시 컴포넌트의 렌더 결과에
   *   맡기면 표시를 바꾸는 순간 전송 조건이 따라 바뀐다(T-17-37).
   * ★ **재전송 경로를 만들지 않는다.** `send` 가 false 를 돌려줘도 다시 보내지 않는다 —
   *   사용자가 누르지 않은 두 번째 요청이 곧 두 번째 발주다(T-17-40 · T-16-10).
   * ★ 전략 키는 relay 파서가 넣어 준 `server.key` 가 정본이다 — 화면에서 조립하지 않는다.
   */
  const handleArm = useCallback(
    (kind: ArmableLatchKind) => {
      if (ledServer === null) return;
      if (!latchLedStateOf(kind, ledServer).clickable) return;
      /*
        ★ 3초 표시만, 재전송 없음 (quick-260926-nr2). 소켓에 실렸을 때만(`send` true) 답을 추적한다 —
          그 키의 60 에코 또는 인식된 거부 통지가 오면 거두고, 3초 안에 없으면 「미반영」만 세운다.
          `send` 가 false 면 추적도 재전송도 없다(T-16-10 · T-17-40). `pendingRef` 는 건드리지 않는다.
      */
      if (send({ t: "lc.arm", key: ledServer.key, latch: kind })) {
        armInFlightRef.current = true;
        startAckWait();
      }
    },
    [ledServer, send, startAckWait],
  );

  return {
    key,
    server,
    quote,
    tape,
    isStale,
    log,
    unacked,
    answerSeq,
    rejectSeq,
    appliedAt,
    lastError,
    resetSeq,
    liveSeed,
    badges,
    ledServer,
    dirtyCount,
    setDirtyCount,
    handleArm,
    handleSent,
    pushClientLog,
  };
}

export interface StrategyCardProps {
  /**
   * 카드 정체성(18-REVIEW WR-05) — 작업대가 만든 식별자. 콜백 첫 인자와 DOM id 접두가 이 값이다.
   * 같은 종목 카드가 둘(전략 키가 다른 등록 전략 둘)일 수 있어 ISIN 은 정체성이 아니다. 구독·에코
   * 필터는 여전히 `isin`/전략 키다(③).
   */
  cardId: string;
  isin: string;
  /** 위(작업대 상태줄)에서 내려받은 계좌. */
  accountNo: string;
  /**
   * 카드의 거래소 — 작업대 카드 집합이 소유한다. 등록 여부와 무관하게 헤더 세그먼트로 바뀐다
   * (quick-260923-pgv) — 바뀌면 이 카드의 키·구독·폼(remount 키에 포함)이 새 거래소를 본다.
   */
  exchange: RelayExchange;
  /**
   * 표시 종목명 — 부모가 `labels.get(isin)?.name` 을 **문자열로** 내린다(④).
   * 빈 문자열이면 ISIN 을 그린다.
   */
  name: string;
  /** 6자 단축코드. 모르면 `null`(ⓘ 비활성 · D-30). */
  code: string | null;
  open: boolean;
  /** 콜백은 전부 `cardId` 를 받는다 — 부모가 카드마다 새 클로저를 만들지 않게(④). */
  onToggle: (cardId: string) => void;
  onClose: (cardId: string) => void;
  onExchangeChange: (cardId: string, exchange: RelayExchange) => void;
  onInfo?: (cardId: string) => void;
  /** 더티 필드 수 보고 — 작업대가 합산해 이탈 경고를 **한 곳에서** 건다(카드마다 걸지 않는다). */
  onDirtyCountChange?: (cardId: string, count: number) => void;
  /**
   * 이 카드의 전략 로그 보고(18-11) — 작업대 공용 패널 「전략 로그」 탭이 전 종목 로그를 한 목록으로
   * 합친다. 로그 **판정·생성**은 여전히 카드 훅 한 곳이고, 작업대는 받은 줄을 합쳐 보여주기만 한다.
   */
  onLogChange?: (cardId: string, log: readonly StrategyLogEntry[]) => void;
  /**
   * 본문 자리(⑤) — 18-10 `card-body.tsx` 가 채운다. 한 번이라도 펼친 뒤로 불린다(접히면 숨김 유지 ·
   * WR-02). 한 번도 펼친 적 없는 카드에서는 불리지 않는다.
   */
  body?: (card: StrategyCardState) => ReactNode;
  /**
   * 카드 「미체결」 탭의 선택 행 원주문번호 — 작업대 공용 패널과 **같은 선택 상태·같은 콜백**이다.
   * 카드가 자체 선택 상태를 갖지 않는다(D-21 · quick-260923-onn).
   */
  selectedOrderNo?: string | null;
  /** 작업대 `selectUnfilled`. 없으면 카드 탭에 행 선택 UI 가 없다(취소는 된다). */
  onSelectUnfilled?: (row: RelayUnfilled | null) => void;
  /** 잔고 탭 현재가(작업대 `priceOf`). */
  priceOf?: (isin: string) => number | undefined;
  /** 미체결 출처 배지 — 작업대가 공용 패널에 넘기는 값과 같다(오늘은 미배선). */
  originOf?: (row: RelayUnfilled) => AccountRowOrigin | undefined;
  onCancelSubmitted?: (res: RelayOrderResultMsg) => void;
  /**
   * 이벤트 알림 표시(quick-260923-pgu · 목업 ③A) — 작업대가 소유하는 `alertedCardIds` 에서 온다.
   * 카드는 `data-alert` 로 내보낼 뿐이고 헤더 펄스·빨간 점·링은 CSS(`globals.css` §3.8)다.
   */
  alerted?: boolean;
  /** 알림 클릭의 탭 요청 — 카드 탭으로 그대로 넘긴다(`CardTabs` ⑦). */
  requestedTab?: CardTabRequest;
}

/** DOM id 에 쓸 수 있는 조각만 남긴다(카드 id 는 영숫자·하이픈이라 사실상 그대로다). */
function domSafe(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

const NATIVE_TABBAR_PROBE_SLOT = "native-tabbar-probe";

/**
 * 앱 네이티브 탭바 몫(px) — 브라우저(`html.native-app` 없음)는 0.
 * ★ `--native-tabbar-offset` 은 `calc(var(--native-tabbar-gap) + 60px + 8px)` 이라 `getPropertyValue` 로는 px 를
 *   못 읽는다(계산 전 토큰 문자열이 온다). 그래서 문서에 **한 번만** 까는 숨은 프로브(`position:fixed` ·
 *   `bottom: var(--native-tabbar-offset, 0px)` · 높이 0 · `visibility:hidden`)의 computed `bottom` 을 읽는다 —
 *   `bottom` 은 계산값이 px 로 풀린다(안전영역 · `max()` 포함). 새 모듈 없이 이 파일 안에 둔다.
 */
function nativeTabbarOffsetPx(): number {
  let probe = document.querySelector<HTMLElement>(`[data-slot="${NATIVE_TABBAR_PROBE_SLOT}"]`);
  if (probe === null) {
    probe = document.createElement("div");
    probe.setAttribute("data-slot", NATIVE_TABBAR_PROBE_SLOT);
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;left:0;bottom:var(--native-tabbar-offset, 0px);width:0;height:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
  }
  return parseFloat(getComputedStyle(probe).bottom) || 0;
}

/**
 * 카드 하단 더티 바를 화면 아래에 붙인다(목업 B 의 sticky 흉내 · 2026-09-23). 바 자리는 카드 마지막 자식이라
 * 제자리 = 카드 끝이다. 카드 끝이 화면 아래(폰은 공용 패널 위 `--wb-bottom-inset`)보다 밑에 있고 카드 머리가
 * 그 위에 보이는 동안만 그 차이만큼 위로 올린다(`translateY`) — 카드를 지나가면 제자리로 돌아가 함께 사라진다.
 * 카드는 `overflow: clip` 이라 올린 바가 카드 밖으로 나가지 않는다.
 * ★ 앱은 탭바 몫까지 비킨다(G-21-R3-2 · D-25a) — 화면 아래 = `innerHeight − --wb-bottom-inset − 탭바 몫`.
 *   앱은 공용 패널을 숨기므로(inset 0) 탭바 몫이 빠지면 바가 네이티브 탭바 밑으로 들어간다(기존 결함).
 *   프로브는 카드가 서면 먼저 깐다 — 바가 뜨는 첫 프레임에 DOM 을 만들지 않고, e2e 가 px 해석을 잴 수 있다.
 */
function usePinnedToViewportBottom(host: HTMLElement | null, active: boolean): void {
  useEffect(() => {
    if (host === null) return;
    nativeTabbarOffsetPx();
    if (!active) return;
    const card = host.parentElement;
    if (card === null) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const inset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--wb-bottom-inset")) || 0;
      const limit = window.innerHeight - inset - nativeTabbarOffsetPx();
      const r = card.getBoundingClientRect();
      const lift = r.bottom > limit && r.top + host.offsetHeight < limit ? limit - r.bottom : 0;
      host.style.transform = lift === 0 ? "" : `translateY(${lift}px)`;
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(place);
    };
    place();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    ro?.observe(card);
    ro?.observe(document.documentElement);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
      host.style.transform = "";
    };
  }, [host, active]);
}

function StrategyCardImpl({
  cardId,
  isin,
  accountNo,
  exchange,
  name,
  code,
  open,
  onToggle,
  onClose,
  onExchangeChange,
  onInfo,
  onDirtyCountChange,
  onLogChange,
  body,
  selectedOrderNo,
  onSelectUnfilled,
  priceOf,
  originOf,
  onCancelSubmitted,
  alerted = false,
  requestedTab,
}: StrategyCardProps) {
  const card = useStrategyCardState({ isin, accountNo, exchange });
  const [dirtyHost, setDirtyHost] = useState<HTMLDivElement | null>(null);
  usePinnedToViewportBottom(dirtyHost, card.dirtyCount > 0);
  const { key, quote, ledServer, handleArm, dirtyCount, log } = card;

  /*
    ④ 카드 계좌 슬라이스(quick-260923-onn) — 이 카드 계좌 상태를 이 종목·거래소로 1회 자른다.
    접힌 헤더 요약 칩 숫자와 카드 탭(배지·본문)이 **같은 이 값**을 읽는다. 새 조회 경로 0(T-16-02).
  */
  const { accountStates, status, nxtTradable } = useRelayContext();
  const accountState = accountNo === "" ? null : (accountStates.get(accountNo) ?? null);
  // NXT 미거래 종목은 헤더 세그먼트가 「KRX」 라벨 하나(quick-260923-pq2). 순수 함수가 상수 참조를
  // 돌려주므로 memo 가 필요 없다. 모르면(`null`) 둘 다.
  const exchangeChoices = exchangeChoicesOf(isin, exchange, nxtTradable);
  const slice = useMemo(
    () => cardAccountSliceOf(accountState, isin, exchange),
    [accountState, isin, exchange],
  );

  useEffect(() => {
    onDirtyCountChange?.(cardId, dirtyCount);
  }, [onDirtyCountChange, cardId, dirtyCount]);

  useEffect(() => {
    onLogChange?.(cardId, log);
  }, [onLogChange, cardId, log]);

  /*
    한 번이라도 펼친 적 있는가(WR-02) — 렌더 중 파생 갱신. `open` 이 참이 되면 참이 되고 다시 거짓이
    되지 않는다. 등록 전략이 접힌 채 N장 들어와도 펼치기 전까지 본문 비용이 없다.
  */
  const [everOpened, setEverOpened] = useState(open);
  if (open && !everOpened) setEverOpened(true);

  const idBase = `strategy-card-${domSafe(cardId)}`;
  const toggleId = `${idBase}-toggle`;
  const bodyId = `${idBase}-body`;
  const displayName = name === "" ? isin : name;
  /*
    카드 탭 「주문로그」(Phase 25-10 · D-06) — 작업대 공용 피드 하나를 이 카드 종목 · 거래소로 좁혀 읽는다(카드마다
    조회하지 않는다). Provider 밖(작업대 밖 렌더)이면 null → 탭 자체가 없다. 카드는 이미 relay 컨텍스트 소비자라
    푸시마다 재렌더되는 것은 기존과 같다(T-18-29 예산 불변).
  */
  const orderLogCtx = useOrderLogFeedContext();
  const orderLog = useMemo<CardOrderLogInput | undefined>(
    () =>
      orderLogCtx === null
        ? undefined
        : {
            feed: orderLogCtx,
            isin,
            exchange,
            stockName: displayName,
            phoneBand: orderLogCtx.phoneBand,
          },
    [orderLogCtx, isin, exchange, displayName],
  );

  /*
    UI-SPEC Q-3 — 같은 종목 카드가 둘일 때 어느 전략인지 종목명 `title` 이 말한다. 보이는 요소는
    더하지 않는다(거래소는 이미 세그먼트로 보인다). 계좌가 아직 없으면 계좌 조각을 뺀다.
  */
  const nameTitle =
    accountNo === ""
      ? `${displayName} · ${exchange}`
      : `${displayName} · 계좌 ${accountNo} · ${exchange}`;

  const handleToggle = useCallback(() => onToggle(cardId), [onToggle, cardId]);
  const handleClose = useCallback(() => onClose(cardId), [onClose, cardId]);
  const handleExchange = useCallback(
    (ex: RelayExchange) => onExchangeChange(cardId, ex),
    [onExchangeChange, cardId],
  );
  const handleInfo = useCallback(() => onInfo?.(cardId), [onInfo, cardId]);

  return (
    <article
      data-slot="strategy-card"
      data-key={key}
      data-open={open ? "true" : "false"}
      data-alert={alerted ? "true" : "false"}
      aria-label={displayName}
      /* ① — 컨테이너 선언은 `LC_CONTAINER_CLASS`(이 파일 상단) 한 곳이다. */
      className={cn(
        LC_CONTAINER_CLASS,
        // 토스 B(260924-vj1) — 무테 카드 면: 테두리는 색만 투명(1px 기하 유지 — `lc` 폭 불변),
        // 열림 그림자 없음(B `--card-shadow-open: none`). 더티 테두리 채널은 아래 그대로다.
        "min-w-0 overflow-clip rounded-[var(--r-lg)] border border-transparent bg-[var(--card)]",
        // 앱 헤더가 `sticky top-0 h-14`(56px)라 `block:start` 스크롤(공용 패널 행 → 카드, quick-260925-ptw)이
        // 카드 머리를 헤더 밑에 묻지 않게 64px 여유를 둔다.
        // Phase 21 D-25 — 풀블리드 앱에서는 헤더가 56 + 상태바라 상단 안전영역만큼 더 띄운다(크롬 0).
        "scroll-mt-[calc(4rem+var(--app-safe-top))]",
        // 미반영 값이 있으면 카드 테두리가 파랗다 — 바가 어느 카드 것인지 모양으로 말한다(목업 B).
        card.dirtyCount > 0 && "border-[color-mix(in_oklch,var(--primary)_55%,var(--border))]",
      )}
    >
      <CardHeader
        name={displayName}
        nameTitle={nameTitle}
        code={code}
        exchange={exchange}
        exchangeChoices={exchangeChoices}
        onExchangeChange={handleExchange}
        price={quote === null ? null : quote.p}
        changeRate={quote === null ? null : quote.cr}
        ledServer={ledServer}
        onArm={handleArm}
        open={open}
        onToggle={handleToggle}
        toggleId={toggleId}
        controlsId={bodyId}
        onInfo={onInfo === undefined ? undefined : handleInfo}
        onClose={handleClose}
        unfilledCount={slice.unfilled.length}
        holdingQty={slice.holding?.qty ?? null}
      />
      {/*
        ★ 접힌 카드는 헤더만 **보인다**(D-11) — 한 번 펼친 본문은 숨김으로 남아 더티 값·「결과 모름」
          잠금·에코 상관을 지킨다(WR-02). 한 번도 펼친 적 없는 카드는 본문을 만들지 않는다. 영역
          요소 자체는 늘 남겨 헤더 토글의 `aria-controls` 가 가리킬 곳을 잃지 않게 한다(`hidden`).
        ★ 더티 바는 카드 맨 아래 sticky 자리(`card-dirty-host`)에 붙는다(2026-09-23 · 목업 B). 접힌 더티
          카드도 헤더 아래에 바가 남는 것은 **의도**다 — 미반영 값이 접기로 사라지지 않는다(D-12).
      */}
      <DirtyBarHostContext.Provider value={dirtyHost}>
      <div id={bodyId} data-slot="strategy-card-body" hidden={!open}>
        {everOpened && (
          <>
            <CardTabs
              quote={quote}
              accountNo={accountNo}
              account={slice.account}
              log={log}
              status={status}
              selectedOrderNo={selectedOrderNo ?? null}
              onSelectUnfilled={onSelectUnfilled}
              priceOf={priceOf}
              originOf={originOf}
              onCancelSubmitted={onCancelSubmitted}
              requestedTab={requestedTab}
              orderLog={orderLog}
              cardOpen={open}
            />
            <CardNotices card={card} />
            {body?.(card)}
          </>
        )}
      </div>
      </DirtyBarHostContext.Provider>
      {/*
        카드 하단 더티 바 자리 — 카드가 화면보다 길면 카드가 보이는 동안 화면 아래(폰은 공용 패널 위 ·
        `--wb-bottom-inset` · 앱은 네이티브 탭바 위)에 붙어 따라오고, 카드를 지나가면 함께 사라진다(`usePinnedToViewportBottom`).
        ★ CSS sticky 를 쓰지 않는다 — 앱 셸 `main` 이 `overflow-auto` 스크롤 컨테이너(높이 무제한이라 스크롤은
          창이 한다)라 sticky 가 영영 붙지 않는다(shared-panels ⑤-b 와 같은 함정). 비면 자리도 없다(`empty:hidden`).
      */}
      <div
        ref={setDirtyHost}
        data-slot="card-dirty-host"
        className="relative z-10 empty:hidden"
      />
    </article>
  );
}

/**
 * 카드 인라인 고지 — 토스트 없이 인라인으로만 말한다(D-27 · UI-SPEC 접근성).
 *
 * ★ 이 카드 **자기** 상태만 그린다 — 다른 카드의 미반영·거부가 여기 설 수 없다(②).
 * ★ 문구는 옛 상따 화면의 원문 그대로다(「미반영 · 서버 응답을 기다리고 있어요」 등).
 * ★ 서버 거부(`lastError`)는 `role="alert"` 다 — 상태가 아니라 경보다(T-16-07 · 옛 상태줄 계약 승계).
 *   18-13 에서 되살렸다: 훅은 계산하고 있었지만 카드가 그리지 않아, 거부가 기본으로 닫힌 공용 패널
 *   「전략 로그」 탭에만 조용히 쌓였다(로그만 있으면 스크롤 밖에서 지나간다). 출처 배지는
 *   `serverMsgBadge` **하나**로 판정하는 텍스트 접두다 — 색만으로 가르면 WCAG 1.4.1 위반이다.
 */
function CardNotices({ card }: { card: StrategyCardState }) {
  const { unacked, lastError } = card;
  if (!unacked && lastError === null) return null;
  return (
    <div className="flex flex-col gap-1 border-t border-[var(--border-subtle)] px-2.5 py-1.5 text-[length:var(--t-caption)]">
      {lastError !== null && (
        <p
          role="alert"
          data-slot="card-server-error"
          className="m-0 min-w-0 break-keep text-[var(--destructive)]"
        >
          <span data-slot="card-server-error-src" className="font-semibold">
            {serverMsgBadge(lastError.src)}
          </span>{" "}
          {lastError.text}
        </p>
      )}
      {unacked && (
        <p
          role="status"
          data-slot="card-unacked"
          className="m-0 font-semibold text-[var(--destructive)]"
        >
          미반영 · 서버 응답을 기다리고 있어요
        </p>
      )}
    </div>
  );
}

/**
 * ④ `memo` — 부모가 넘기는 것은 문자열·불리언·`cardId` 를 받는 안정 콜백뿐이라 얕은 비교로
 * 충분하다. 라벨 Map 이 새 인스턴스가 돼도 `name`/`code` 문자열이 같으면 다시 그리지 않는다.
 * (relay 컨텍스트가 바뀌면 훅이 구독하므로 그때는 당연히 다시 그린다.)
 */
export const StrategyCard = memo(StrategyCardImpl);
