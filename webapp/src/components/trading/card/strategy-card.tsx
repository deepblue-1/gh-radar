"use client";

/**
 * StrategyCard — 작업대의 **전략 카드 1장** (D-09 ~ D-12 · D-27 · D-28 · TRADE-09).
 *
 * 옛 상따 화면의 `LimitChaserSurface`(`limit-chaser-client.tsx`) 가 이미 「한 전략」 단위였다.
 * 이 파일은 그 몸통을 **컴포넌트로 승격**한 것이다 — relay 구독 · 전송↔에코 상관 · 자기 키
 * `find` · 전략 로그 · 더티 연결이 전부 `useStrategyCardState` 한 훅으로 옮겨 왔고, 옛 화면도
 * 18-12 에서 사라지기 전까지 **같은 훅**을 쓴다(정의 1벌).
 *
 * ① ★ `@container/lc` 선언은 **이동**이다 — 복제가 아니다 (D-28)
 *   §2.2b 4밴드(카드 폭 700 · 830 · 992)를 재는 컨테이너가 페이지 본문에서 **카드 래퍼**로
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
 *   `pendingRef`·`unacked`·`ackTimer`·`overwrittenRef` 도 전부 인스턴스별이다.
 *
 * ③ ★ 카드는 자기 `isin`/`exchange` 로만 구독한다 (T-18-26 · T-15-40 / T-16-02 승계)
 *   `useRelaySubscription` 이 자기 키의 시세만 돌려주고, 언마운트·키 변경 때 그 키를 해제한다.
 *
 * ④ ★ 재렌더 예산 (T-18-29)
 *   카드는 `useIsinLabels()` 의 Map 을 구독하지 않는다 — 계좌 델타가 100ms 마다 오면 Map 이
 *   매번 새로 만들어져 카드 N개가 전부 재렌더된다. 부모가 `labels.get(isin)` 결과 **문자열**만
 *   `name`/`code` 로 내리고, 카드는 `memo` 라 문자열이 같으면 다시 그리지 않는다. 콜백 prop 은
 *   `isin` 을 인자로 받으므로 부모가 카드마다 새 클로저를 만들 필요가 없다.
 *
 * ⑤ 본문(좌 호가 | 우 옵션 4그룹)은 18-10 `card-body.tsx` 가 채운다
 *   여기서는 헤더 + 종목정보 10칸까지만 조립하고, 본문 자리는 `body` 렌더 prop 이다 — 카드
 *   상태(서버 전략 · 시세 · 전송/에코 콜백)를 **카드 밖으로 끌어올리지 않고** 본문에 건넨다.
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
import type {
  RelayExchange,
  RelayLimitChaser,
  RelayLimitChaserInput,
  RelayQuote,
  RelayTapeEntry,
} from "@gh-radar/shared";

import { CardHeader } from "@/components/trading/card/card-header";
import { QuoteGrid10 } from "@/components/trading/card/quote-grid-10";
import {
  latchLedStateOf,
  type LatchLedKind,
  type LatchLedServer,
} from "@/components/trading/latch-led";
import { strategyBadgesOf } from "@/components/trading/strategy-badge";
import {
  serverMessageLogLine,
  strategiesDisabledLogLine,
  strategyLogLine,
  type StrategyLogEntry,
} from "@/components/trading/strategy-log";
import {
  isLimitChaserServerMessage,
  isLimitChaserSetRejection,
  strategyKey,
} from "@/lib/limit-chaser";
import { useRelayContext, useRelaySubscription } from "@/lib/relay-provider";
import type { RelayServerMessageEntry } from "@/lib/use-relay-socket";
import { cn } from "@/lib/utils";

/**
 * 에코 배너 자동 소멸(ms) — UI-SPEC A3 「6초 배너」.
 * 상수로 **내보내는** 이유: 테스트가 6000 을 다시 적으면 값을 바꿔도 테스트가 통과한다.
 */
export const ECHO_BANNER_MS = 6_000;
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
 * 18-12 까지 살아 있는 옛 `/trading/limit-chaser/*` 화면은 카드가 아니라 페이지 루트가 이
 * 선언을 달아야 하므로 이 상수를 import 해 쓴다 — 문자열을 그 파일에 다시 적지 않는다.
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
  /** 6초 에코 배너 문구(「다른 단말에서 변경됨」). */
  banner: string | null;
  appliedAt: string | null;
  /** 최신 상따 몫 거부 1건 — 원문과 출처를 따로(배지 판정은 렌더 자리에서 한 번). */
  lastError: { text: string; src: string } | null;
  /** 삭제 에코를 받으면 올라간다 — 폼 remount 키에 넣는다(⑤ 삭제). */
  resetSeq: number;
  /** 시딩에 쓴 실시간 상한가(0 = 아직). 폼 remount 키에 넣는다. */
  liveSeed: number;
  /** 「직전에 매수 발주가 나갔는가」 — 와이어 필드가 아니라 이 카드가 아는 사실. */
  fired: boolean;
  badges: StrategyStatus;
  /** LED 3칩의 유일한 판정 입력 — 서버 에코 + `hadOrder`. */
  ledServer: LatchLedServer;
  dirtyCount: number;
  setDirtyCount: (n: number) => void;
  handleArm: (kind: LatchLedKind) => void;
  handleSent: (cfg: RelayLimitChaserInput) => void;
  handleServerEcho: (info: { overwrittenDirty: number }) => void;
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

  /* ── 전송 ↔ 에코 상관 (③) ─────────────────────────────────────────────── */

  /** 마지막으로 보낸 요청. 에코가 오면 비운다. **재전송에 쓰지 않는다.** */
  const pendingRef = useRef<RelayLimitChaserInput | null>(null);
  const [unacked, setUnacked] = useState(false);
  const ackTimer = useRef<number | null>(null);
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
  /** 폼이 알려 준 「이번 에코가 덮은 더티 필드 수」. 소비 즉시 0 으로 되돌린다. */
  const overwrittenRef = useRef(0);
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<number | null>(null);
  const [appliedAt, setAppliedAt] = useState<string | null>(null);
  const [dirtyCount, setDirtyCount] = useState(0);
  /** 삭제 에코를 받으면 올린다 — 폼을 remount 해 빈 상태로 되돌리는 유일한 장치(⑤). */
  const [resetSeq, setResetSeq] = useState(0);
  /**
   * 「직전에 매수 발주가 나갔는가」 — 와이어 필드가 아니라 **이 카드가 아는 사실**이다.
   * 무장이 풀렸는데 우리가 끈 게 아니면 게이트가 발주로 소진된 것이다(Pitfall 10).
   * 이 값이 없으면 `strategyBadgesOf` 가 「발주됨」을 만들지 않는다 — 그게 맞다.
   */
  const [fired, setFired] = useState(false);
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

  const handleSent = useCallback((cfg: RelayLimitChaserInput) => {
    pendingRef.current = cfg;
    setUnacked(false);
    if (ackTimer.current != null) window.clearTimeout(ackTimer.current);
    // ★ 여기서 하는 일은 **표시**뿐이다. 타이머가 끝나도 아무것도 다시 보내지 않는다.
    ackTimer.current = window.setTimeout(
      () => setUnacked(true),
      ACK_TIMEOUT_MS,
    );
  }, []);

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

  const handleServerEcho = useCallback((info: { overwrittenDirty: number }) => {
    overwrittenRef.current = info.overwrittenDirty;
  }, []);

  /** 직전 에코 — 전이 문장의 기준선이다. 전략 키가 바뀌면 되돌린다. */
  const prevServerRef = useRef<RelayLimitChaser | null>(null);
  useEffect(() => {
    prevServerRef.current = null;
    pendingRef.current = null;
    setUnacked(false);
    setBanner(null);
    setAppliedAt(null);
    setFired(false);
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
    acceptAnswer();
  }, [lastLimitChaserEcho, key, acceptAnswer]);

  useEffect(() => {
    const prev = prevServerRef.current;

    // 삭제 — 목록에서 빠졌다(전역 스냅샷이 `crud:"D"` 를 제거한다).
    if (server === null) {
      if (prev !== null) {
        prevServerRef.current = null;
        pendingRef.current = null;
        acceptAnswer();
        setResetSeq((n) => n + 1);
        pushLog(
          strategyLogLine(prev, { ...prev, crud: "D" }) ?? "전략이 삭제됐어요",
        );
      }
      return;
    }

    if (prev === server) return;
    prevServerRef.current = server;

    const sent = pendingRef.current;
    pendingRef.current = null;
    acceptAnswer();
    setAppliedAt(clockNow());

    /*
      무장 해제의 **이유**는 에코만으로 알 수 없다(Pitfall 10). 우리가 방금 끈 것이면
      그 요청에 `buyEnabled:false` 가 실려 있다 — 그 경우에만 「사용자가 껐다」이고,
      나머지(내가 켰는데 꺼져서 왔다 / 아예 안 보냈다)는 **발주로 게이트가 소진된 것**이다.
    */
    const hadOrder = sent === null ? true : sent.buyEnabled === true;
    const line = strategyLogLine(prev, server, { hadOrder });
    if (line !== null) pushLog(line);

    // 발주 래치 — 무장이 서면 되돌리고, 우리가 끈 게 아닌 해제만 「발주됨」으로 남긴다.
    if (server.buyEnabled) setFired(false);
    else if (prev?.buyEnabled === true && hadOrder) setFired(true);

    // 다른 단말 변경 — 내가 보낸 적이 없고, 처음 보는 전략도 아닐 때만이다.
    // 첫 스냅샷(prev === null)을 「다른 단말」이라고 하면 페이지를 열 때마다 배너가 뜬다.
    const overwritten = overwrittenRef.current;
    overwrittenRef.current = 0;
    if (sent === null && prev !== null) {
      const text =
        overwritten > 0
          ? `다른 단말에서 변경돼 수정하던 값 ${overwritten}개가 서버 값으로 바뀌었어요`
          : "다른 단말에서 변경됐어요 · 서버 값으로 맞췄어요";
      setBanner(text);
      pushLog(text);
      if (bannerTimer.current != null) window.clearTimeout(bannerTimer.current);
      bannerTimer.current = window.setTimeout(
        () => setBanner(null),
        ECHO_BANNER_MS,
      );
    }
  }, [server, pushLog, acceptAnswer]);

  useEffect(
    () => () => {
      if (ackTimer.current != null) window.clearTimeout(ackTimer.current);
      if (bannerTimer.current != null) window.clearTimeout(bannerTimer.current);
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
   * (`vi-client` 가 세운 같은 모양이다).
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
      if (!isLimitChaserServerMessage(msg)) continue; // VI 몫은 여기서 그리지 않는다
      const { text, level } = serverMessageLogLine(msg);
      pushLog(text, level);
      // ★ 상태줄에도 남긴다 — 로그만 있으면 스크롤 밖에서 조용히 지나간다(T-16-07).
      if (level !== "error") continue;
      setLastError({ text: msg.m, src: msg.src });
      /*
        ★ **거부도 답이다.** 서버가 사유를 말한 순간 「모른다」는 거짓이 되므로 「미반영」을
          함께 거둔다 — 안 거두면 상태줄 한 줄이 「응답을 기다리고 있어요」와 「이래서
          거부됐습니다」를 **동시에** 말한다(debug `lc-unacked-stuck-new-route`).
          거부에는 60 에코가 없다(`Gateway.cpp` 의 거부 갈래는 에코 앞에서 return 한다) —
          이 통지가 그 요청에 대한 **유일한** 답이다.
        ★ 판정은 `isLimitChaserSetRejection` **한 곳**이다. 위 표시 몫 판정
          (`isLimitChaserServerMessage`)보다 좁다 — 근거는 그 함수 주석에 있다. 여기서
          `src` 를 직접 비교하지 않는 이유는 이 파일의 다른 판정들과 같다.
        ★ 사유 문구를 **다시 쓰지 않는다.** 화면에 서는 것은 `msg.m` 원문 그대로다.
      */
      if (isLimitChaserSetRejection(msg, isin, accountNo)) acceptAnswer();
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
  const badges = strategyStatusOf(server, fired);

  /*
    ── 래치 LED 3종 (17-11 / D-19~D-22) ──────────────────────────────────────

    ★ LED 가 읽는 것은 **마지막 서버 에코 스냅샷 하나**다 (D-20). 폼 더티값도, 이미 칠해진
      색도 되읽지 않는다 — 판정 규칙 자체는 `latchLedStateOf`(17-07) 가 소유하고 이 카드는
      그 함수에 무엇을 넘길지만 정한다.
    ★ `hadOrder` 는 **와이어 필드가 아니라 이 카드가 아는 사실**이다(Pitfall 10 · 위 `fired`).
      넘기지 않으면 「(발주됨)」 문구가 영영 뜨지 않고 그냥 `OFF` 로 보인다(17-07 인계 ①).
  */
  const ledServer = useMemo<LatchLedServer>(
    () => (server === null ? null : { ...server, hadOrder: fired }),
    [server, fired],
  );

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
    (kind: LatchLedKind) => {
      if (ledServer === null) return;
      if (!latchLedStateOf(kind, ledServer).clickable) return;
      send({ t: "lc.arm", key: ledServer.key, latch: kind });
    },
    [ledServer, send],
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
    banner,
    appliedAt,
    lastError,
    resetSeq,
    liveSeed,
    fired,
    badges,
    ledServer,
    dirtyCount,
    setDirtyCount,
    handleArm,
    handleSent,
    handleServerEcho,
  };
}

export interface StrategyCardProps {
  isin: string;
  /** 위(작업대 상태줄)에서 내려받은 계좌. */
  accountNo: string;
  /** 카드의 거래소 — 작업대 카드 집합이 소유한다(등록 전에만 바뀐다). */
  exchange: RelayExchange;
  /**
   * 표시 종목명 — 부모가 `labels.get(isin)?.name` 을 **문자열로** 내린다(④).
   * 빈 문자열이면 ISIN 을 그린다.
   */
  name: string;
  /** 6자 단축코드. 모르면 `null`(ⓘ 비활성 · D-30). */
  code: string | null;
  open: boolean;
  /** 콜백은 전부 `isin` 을 받는다 — 부모가 카드마다 새 클로저를 만들지 않게(④). */
  onToggle: (isin: string) => void;
  onClose: (isin: string) => void;
  onExchangeChange: (isin: string, exchange: RelayExchange) => void;
  onInfo?: (isin: string) => void;
  /** 더티 필드 수 보고 — 작업대가 합산해 이탈 경고를 **한 곳에서** 건다(카드마다 걸지 않는다). */
  onDirtyCountChange?: (isin: string, count: number) => void;
  /**
   * 이 카드의 전략 로그 보고(18-11) — 작업대 공용 패널 「전략 로그」 탭이 전 종목 로그를 한 목록으로
   * 합친다. 로그 **판정·생성**은 여전히 카드 훅 한 곳이고, 작업대는 받은 줄을 합쳐 보여주기만 한다.
   */
  onLogChange?: (isin: string, log: readonly StrategyLogEntry[]) => void;
  /** 본문 자리(⑤) — 18-10 `card-body.tsx` 가 채운다. `open` 일 때만 불린다. */
  body?: (card: StrategyCardState) => ReactNode;
}

/** DOM id 에 쓸 수 있는 조각만 남긴다(ISIN 은 영숫자라 사실상 그대로다). */
function domSafe(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

function StrategyCardImpl({
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
}: StrategyCardProps) {
  const card = useStrategyCardState({ isin, accountNo, exchange });
  const { key, server, quote, ledServer, handleArm, dirtyCount, log } = card;

  useEffect(() => {
    onDirtyCountChange?.(isin, dirtyCount);
  }, [onDirtyCountChange, isin, dirtyCount]);

  useEffect(() => {
    onLogChange?.(isin, log);
  }, [onLogChange, isin, log]);

  const idBase = `strategy-card-${domSafe(isin)}`;
  const toggleId = `${idBase}-toggle`;
  const bodyId = `${idBase}-body`;
  const displayName = name === "" ? isin : name;

  const handleToggle = useCallback(() => onToggle(isin), [onToggle, isin]);
  const handleClose = useCallback(() => onClose(isin), [onClose, isin]);
  const handleExchange = useCallback(
    (ex: RelayExchange) => onExchangeChange(isin, ex),
    [onExchangeChange, isin],
  );
  const handleInfo = useCallback(() => onInfo?.(isin), [onInfo, isin]);

  return (
    <article
      data-slot="strategy-card"
      data-key={key}
      data-open={open ? "true" : "false"}
      aria-label={displayName}
      /* ① — 컨테이너 선언은 `LC_CONTAINER_CLASS`(이 파일 상단) 한 곳이다. */
      className={cn(
        LC_CONTAINER_CLASS,
        "min-w-0 overflow-clip rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)]",
        open &&
          "shadow-[inset_0_1px_0_var(--border-subtle),0_1px_2px_oklch(0_0_0/0.04),0_8px_24px_oklch(0_0_0/0.04)]",
      )}
    >
      <CardHeader
        name={displayName}
        code={code}
        exchange={exchange}
        onExchangeChange={handleExchange}
        /* D-10 — 등록됨(서버 전략 있음) = 거래소 잠김. 거래소는 키의 일부다(T-18-27). */
        exchangeLocked={server !== null}
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
      />
      {/*
        ★ 접힌 카드는 **헤더만** 그린다 — 10칸도 본문도 DOM 에 없다(D-11). 영역 요소 자체는
          남겨 헤더 토글의 `aria-controls` 가 가리킬 곳을 잃지 않게 한다(`hidden`).
      */}
      <div id={bodyId} data-slot="strategy-card-body" hidden={!open}>
        {open && (
          <>
            <QuoteGrid10 quote={quote} />
            <CardNotices card={card} />
            {body?.(card)}
          </>
        )}
      </div>
    </article>
  );
}

/**
 * 카드 인라인 고지 — 토스트 없이 `role="status"` 로만 말한다(D-27 · UI-SPEC 접근성).
 *
 * ★ 이 카드 **자기** 상태만 그린다 — 다른 카드의 배너·미반영이 여기 설 수 없다(②).
 * ★ 문구는 옛 상따 화면의 원문 그대로다(「미반영 · 서버 응답을 기다리고 있어요」 등).
 */
function CardNotices({ card }: { card: StrategyCardState }) {
  const { banner, unacked } = card;
  if (banner === null && !unacked) return null;
  return (
    <div className="flex flex-col gap-1 border-t border-[var(--border-subtle)] px-2.5 py-1.5 text-[length:var(--t-caption)]">
      {banner !== null && (
        <p role="status" data-slot="card-echo-banner" className="m-0 text-[var(--fg)]">
          {banner}
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
 * ④ `memo` — 부모가 넘기는 것은 문자열·불리언·`isin` 을 받는 안정 콜백뿐이라 얕은 비교로
 * 충분하다. 라벨 Map 이 새 인스턴스가 돼도 `name`/`code` 문자열이 같으면 다시 그리지 않는다.
 * (relay 컨텍스트가 바뀌면 훅이 구독하므로 그때는 당연히 다시 그린다.)
 */
export const StrategyCard = memo(StrategyCardImpl);
