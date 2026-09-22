"use client";

/**
 * LimitChaserClient — 상따 전략 화면 본문 (`/trading/limit-chaser/{new,[key]}`, TRADE-01).
 *
 * ① 무엇을 조립하는가 (16-UI-SPEC A1~A14 · 260911-w5h)
 *   제목 줄(「상따」 + 계좌 칩) → 헤더 카드(거래소 콤보 | 종목명 버튼 = 검색 트리거 |
 *   현재가·등락률, 그 아래 종목정보 10칸) → 상태줄 → (에코 배너) →
 *   [호가 10단 | 매수·매도 폼] → 미체결/잔고 → 전략 로그.
 *   ★ **반응형 판정은 뷰포트가 아니라 본문 폭이다** (260912-k2x). 이 페이지 루트가
 *     `@container/lc` 컨테이너이고, 본문은 **700 · 830 · 992** 세 경계로 갈리는 4밴드를
 *     산다. 밴드 표와 경계 셋의 실측 근거는 **`webapp/src/styles/globals.css` §2.2b 가
 *     정본**이다 — 여기에 복사하지 마라. 표가 둘이 되면 반드시 갈라진다.
 *     앱 셸·사이드바·`account-panel` 은 여전히 뷰포트 브레이크포인트를 쓴다.
 *   ★ 헤더 종목정보 **10칸**은 폰 2열 5행 · 컴팩트/와이드 5열 2행 · 데스크톱 한 줄이다.
 *     배치 분기는 CSS 뿐이고 **같은 10칸이 클래스만 갈아입는다**(순서 차이도 `order`
 *     하나로만 낸다) — 배열도 JSX 도 한 벌이라 폭에 따라 다른 숫자가 나올 자리가 없다.
 *     폭을 JS 로 재는 훅·조건부 렌더를 두지 않는다.
 *   ★ 오더북 카드에 **제목행이 없다** — 거래소는 헤더 콤보가, 「호가 10단」이라는 접근성
 *     이름은 사다리의 `aria-label` 이 잇는다.
 *   ★ **가격 칩 행은 없다** (260912-gyz). 헤더 카드는 종목정보 10칸에서 끝난다 — 기준가·
 *     상한·하한을 그 10칸이 **직접** 말하기 때문이다(260912-k2x 에서 「기준」 칸이 들어와,
 *     칩이 말하던 마지막 값까지 10칸 안으로 왔다). 호가단위는 폼이 사용자에게 요구하지 않는
 *     값이라, 칩 행은 같은 카드에서 같은 말을 두 번 하던 행이었다.
 *   ★ 제목은 **신규·편집 모두 「상따」**다. 종목·거래소를 제목에 넣으면 바로 아래 헤더 카드와
 *     같은 말을 두 번 하게 되고, 전략키 mono 부제는 사용자가 읽을 일이 없는 내부 식별자였다.
 *
 * ② ★ 서버값이 언제나 이긴다 (D-11)
 *   폼은 에코가 오면 더티 필드까지 덮는다. 이 파일의 일은 그 사건을 **사용자가 놓치지 않게**
 *   하는 것이다 — 6초 인라인 배너(`role="status"`) + 전략 로그 1줄 영구 기록. 토스트
 *   라이브러리를 쓰지 않는다(D3): 알림 채널은 상태줄과 로그 둘뿐이다.
 *
 * ③ ★ 「보냈다」와 「반영됐다」는 다른 사건이다 (Pitfall 8 · T-16-07)
 *   서버는 거부를 응답 코드로 주지 않는다. **에코가 오지 않는 것이 곧 거부**이고, 부분 거부는
 *   눕혀진 값으로 온다. 그래서 3초 안에 에코가 없으면 상태줄에 「미반영」을 세운다.
 *   ★ **자동 재전송 경로를 만들지 않는다**(T-16-10). 재전송은 사용자가 누르지 않은 두 번째
 *     등록이고, 그 두 번째가 곧 중복 발주다. 다시 보내는 것은 사람이 「수정」을 누를 때뿐이다.
 *
 * ④ ★ 남의 거부를 내 거부로 그리지 않는다 (Pitfall 9)
 *   `ServerMessage(54)` 는 VI 거부도 같은 채널로 온다. 상따 몫 판정은
 *   `isLimitChaserServerMessage`(`lib/limit-chaser.ts`) **한 곳**이다. VI 통지를 여기서
 *   그리면 사용자가 멀쩡한 상따 전략을 껐다 켠다 — 그 재등록이 두 번째 발주다.
 *
 * ⑤ ★ 삭제는 스위치가 아니라 에코가 판정한다 (D-08 · Pitfall 7)
 *   두 스위치를 끄면 서버가 `crud:"D"` 로 정규화하고, 전역 스냅샷에서 그 전략이 빠진다.
 *   그때 폼을 **remount** 해 빈 상태로 되돌린다 — 값만 지우면 폼의 더티 기준선이 남아
 *   「삭제됐는데 미반영 변경이 3개」 같은 상태가 만들어진다.
 *
 * ⑥ 상태 문구는 계약 한 곳에서 온다
 *   연결 상태는 `RELAY_STATE_LABELS`(D-36), 전략 상태는 `strategyBadgesOf`(16-11).
 *   화면마다 문구를 다시 지으면 호가주문 탭은 「실시간」, 여기는 다른 말이 된다.
 *
 * ⑦ 새로고침 버튼을 만들지 않는다 (D-13)
 *   전략 스냅샷은 wss 인증 직후 자동으로 온다(D-12). 조회 버튼을 두면 「눌러야 최신」이라는
 *   오해가 생기고, 실제로는 누르지 않아도 최신이다.
 *
 * ⑧ 종목명은 **이미 받은 프레임에서만** 얻는다 (T-16-02)
 *   `RelayLimitChaser` 에 종목명이 없다. relay 는 잔고·미체결·VI 주문에만 역매핑 이름을
 *   채워 주므로 그 셋을 훑고, 없으면 ISIN 을 그대로 보여준다. 이름 하나 때문에 별도 조회
 *   경로를 만들지 않는다(`app-sidebar` · `strategy-status-card` 와 같은 규약).
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown } from "lucide-react";
import { RELAY_STATE_LABELS, serverMsgBadge } from "@gh-radar/shared";
import type { RelayExchange, StockDetailResponse } from "@gh-radar/shared";

import { AccountPanel } from "@/components/orderbook/account-panel";
import { OrderbookLadder } from "@/components/orderbook/orderbook-ladder";
import { DmaGate, useDmaGateReason } from "@/components/trading/dma-gate";
import { LimitChaserForm } from "@/components/trading/limit-chaser-form";
import {
  LatchLed,
  type LatchLedKind,
  type LatchLedServer,
} from "@/components/trading/latch-led";
import { QuoteGrid10 } from "@/components/trading/card/quote-grid-10";
import {
  LC_CONTAINER_CLASS,
  useStrategyCardState,
} from "@/components/trading/card/strategy-card";
import { StrategyLog } from "@/components/trading/strategy-log";
import { useIsinLabels } from "@/lib/isin-labels";
import { parseStrategyKey } from "@/lib/limit-chaser";
import { useRelayContext } from "@/lib/relay-provider";
import { searchStocks } from "@/lib/stock-api";
import type { RelayStatus } from "@/lib/use-relay-socket";
import { cn } from "@/lib/utils";

/*
  18-06 — 아래 상수·순수 함수의 정의는 `card/strategy-card.tsx` 로 옮겨 갔다(정의 1벌).
  이 파일을 import 하던 소비처(테스트 포함)가 무수정으로 살도록 **다시 내보내기만** 한다.
*/
export {
  ACK_TIMEOUT_MS,
  ECHO_BANNER_MS,
  strategyStatusOf,
  type StrategyStatus,
} from "@/components/trading/card/strategy-card";

/** 검색 디바운스(ms). 타이핑마다 왕복하지 않는다. */
const SEARCH_DELAY_MS = 250;

/** 이탈 경고 문구 — UI-SPEC §CTA verbatim. `beforeunload` 와 라우터 가드가 **같은 말**을 쓴다. */
const LEAVE_WARNING =
  "수정하지 않은 값이 있어요. 이 페이지를 벗어나면 사라져요.";

const KRW = new Intl.NumberFormat("ko-KR");

/** 화면이 다루는 종목 1건. 검색 결과 또는 편집 키에서 만든다. */
interface SelectedStock {
  /** 12자 ISIN — DMA 구독·주문 키(D-28). 없으면 구독도 등록도 못 한다. */
  isin: string;
  /** 6자 단축코드. 표시 전용이다. */
  code: string;
  name: string;
  /*
    ★ `market` 이 **없다** (WR-03 / D-28). 검색 결과의 시장구분은 「고를 수 있는가」를 판정할
      때만 쓰고, 화면 상태로 남기지 않는다 — 남기면 언젠가 그 값이 와이어로 새어 나간다.
      전략 등록의 시장구분은 relay 가 `SymbolMap` 으로 ISIN 을 풀어 채운다.
  */
  /** REST 상세의 값. 실시간 호가(`quote.ul` 등)가 도착하면 그쪽이 이긴다. */
  upperLimit: number;
  lowerLimit: number;
  basePrice: number;
  price: number;
  changeRate: number;
}

export interface LimitChaserClientProps {
  /** 편집 대상 전략 키. 신규(빈 폼)면 넘기지 않는다. */
  strategyKey?: string;
}

export function LimitChaserClient({
  strategyKey: routeKey,
}: LimitChaserClientProps) {
  const gateReason = useDmaGateReason();
  // 게이트는 본문을 **대체**한다(A14). 아래 본문의 훅이 돌지 않도록 컴포넌트를 가른다.
  if (gateReason !== null) {
    return <DmaGate reason={gateReason} surface="상따 전략" />;
  }
  return <LimitChaserSurface routeKey={routeKey} />;
}

function LimitChaserSurface({ routeKey }: { routeKey?: string }) {
  const relay = useRelayContext();
  const { accounts, limitChasers, accountStates, status, statusLabel } = relay;

  const parsedKey = useMemo(
    () => (routeKey === undefined ? null : parseStrategyKey(routeKey)),
    [routeKey],
  );
  const isinLabels = useIsinLabels();

  const [picked, setPicked] = useState<SelectedStock | null>(null);
  const [exchange, setExchange] = useState<RelayExchange>(
    parsedKey?.exchange ?? "KRX",
  );
  /*
    헤더의 종목명 버튼을 누르면 그 자리가 검색창이 된다 — 한 번 고른 종목을 되돌릴 경로다.
    지역 state 하나로 충분하다: 검색은 화면 표시일 뿐이고, 고른 결과는 `picked` 가 받는다.
  */
  const [searching, setSearching] = useState(false);
  const [accountNo, setAccountNo] = useState<string>(
    parsedKey?.accountNo ?? "",
  );

  // 계좌가 도착하면 **미선택일 때만** 첫 계좌를 고른다. 이미 고른 계좌를 덮지 않는다.
  useEffect(() => {
    if (accountNo !== "" || accounts.length === 0) return;
    setAccountNo(accounts[0].accountNo);
  }, [accountNo, accounts]);

  /** 편집 진입은 키가 종목 축을 정한다 — 검색으로 고른 종목이 그 자리를 덮지 않는다. */
  const isin = parsedKey?.isin ?? picked?.isin ?? "";
  /*
    ★ 18-06 — 이 화면의 「한 전략」 몸통(구독 · 자기 키 `find` · 전송↔에코 상관 · 로그 ·
      ServerMessage · 자동 비활성화 · LED)은 전략 카드와 **같은 훅**이 소유한다
      (`card/strategy-card.tsx` `useStrategyCardState`). 규율 주석도 그 파일로 옮겨 갔다.
      이 화면은 18-12 에서 사라질 때까지 그 훅을 빌려 쓰는 **소비자**일 뿐이다 — 판정을
      여기서 다시 쓰지 않는다(정의 1벌).
  */
  const card = useStrategyCardState({ isin, accountNo, exchange });
  const {
    server,
    quote,
    tape,
    isStale,
    log,
    unacked,
    answerSeq,
    appliedAt,
    banner,
    lastError,
    resetSeq,
    liveSeed,
    badges,
    ledServer,
    dirtyCount,
    setDirtyCount,
    handleArm,
    handleSent,
    handleServerEcho,
  } = card;

  /* ── 이탈 경고 (조작 규율 7) ──────────────────────────────────────────── */
  useLeaveWarning(dirtyCount > 0);

  /* ── 파생 표시값 ──────────────────────────────────────────────────────── */

  const displayName =
    picked?.name ?? (isin === "" ? "" : (isinLabels.get(isin)?.name ?? isin));
  /*
    단축코드는 **아는 경우에만** 쓴다. 편집 진입처럼 `picked` 가 없으면 역매핑 라벨을 보고,
    그것도 없으면 조각 자체를 렌더하지 않는다 — ISIN 을 코드 자리에 넣으면 종목명 자리와
    같은 값을 두 번 쓰게 된다(파일 상단 ⑧ 과 같은 규율).
  */
  const stockCode =
    picked?.code ?? (isin === "" ? null : (isinLabels.get(isin)?.code ?? null));
  const accountState =
    accountNo === "" ? null : (accountStates.get(accountNo) ?? null);

  // 실시간 호가가 있으면 그쪽이 정본이다 — REST 상세는 스냅샷 전의 임시값이다.
  const upperLimit = quote?.ul ?? picked?.upperLimit ?? 0;
  const lowerLimit = quote?.ll ?? picked?.lowerLimit ?? 0;
  const basePrice = quote?.base ?? picked?.basePrice ?? 0;
  const currentPrice = quote?.p ?? picked?.price ?? 0;
  const changeRate = quote?.cr ?? picked?.changeRate ?? 0;
  // KRX 정규장 종가(`kc`)의 「하한 칸 대체」 규율은 `card/quote-grid-10.tsx` 가 소유한다.

  /** 스냅샷 도착 전 — 편집 진입인데 아직 그 전략을 못 받았다(UI-SPEC §동기화). */
  const awaitingSnapshot =
    parsedKey !== null &&
    server === null &&
    status !== "ready" &&
    limitChasers.length === 0;

  /*
    ★ `@container/lc` — 상따 본문 전체가 **자기 폭**을 재는 컨테이너다 (260912-k2x).
      18-06 부터 선언의 출처는 `card/strategy-card.tsx` 의 `LC_CONTAINER_CLASS` 한 곳이다 —
      작업대에서는 **카드 래퍼**가 이 선언을 달고, 이 옛 화면(18-12 에서 제거)만 페이지 루트가
      같은 상수를 빌려 단다. 문자열을 여기에 다시 적지 않는다.
      이 래퍼가 빠지거나 이름(`lc`)이 어긋나면 아래 모든 밴드 분기가 **에러 없이** 조용히
      폰 밴드로 떨어진다(잘못된 배치이지 실패가 아니라 눈에 띄지 않는다). 밴드 표와 경계
      셋의 실측 근거는 `globals.css` §2.2b 가 정본이다.
    ★ 컨테이너는 layout containment 를 걸어 `position:fixed` 자손의 **컨테이닝 블록**이
      된다 — 그래서 폼의 더티 액션 바는 `document.body` 로 포털된다(`limit-chaser-form`).
  */
  return (
    <div
      data-slot="limit-chaser-page"
      className={cn(LC_CONTAINER_CLASS, "flex min-w-0 flex-col gap-[var(--s-2)]")}
    >
      {/*
        제목 줄 — 제목은 **언제나 「상따」**이고 그 옆 칩에서 계좌를 고른다 (260911-w5h).
        옛 편집 제목(`{종목명} · {거래소}`)과 전략키 mono 부제는 걷었다 — 종목·거래소는
        바로 아래 헤더 카드가 더 많은 맥락과 함께 보여주므로 같은 말을 세 번 하고 있었다.
      */}
      <div className="flex min-w-0 flex-wrap items-center gap-[var(--s-2)]">
        <h1 className="m-0 flex-none text-[length:var(--t-h3)] leading-[var(--lh-tight)] font-semibold text-[var(--fg)]">
          상따
        </h1>
        {/*
          계좌 칩 — 옛 「계좌」 라벨 + `<select>` 행을 **그대로 옮긴** 것이다(새 컨트롤이 아니다).
          ★ 라벨 행이 사라졌으므로 `aria-label` 이 접근성 이름을 잇는다 — 없으면 axe
            `select-name`(critical)이 뜨고 라벨 기반 단언도 함께 죽는다.
          ★ `appearance-none` 을 쓰지 않는다 — 네이티브 캐럿이 공짜로 따라오고 모바일에서
            OS 기본 선택 UI 가 그대로 뜬다.
          ★ **계좌번호는 마스킹하지 않는다**(D2 · S-5). 앞자리가 같은 두 계좌를 구분할 수
            없게 되는 쪽이 더 위험하다.
        */}
        <select
          id="lc-account"
          aria-label="계좌"
          value={accountNo}
          onChange={(e) => setAccountNo(e.target.value)}
          disabled={accounts.length === 0 || parsedKey !== null}
          className="mono h-[26px] max-w-full min-w-0 rounded-full border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] text-[var(--fg)] disabled:opacity-50"
        >
          {accounts.length === 0 ? (
            <option value="">계좌 확인 중…</option>
          ) : (
            accounts.map((a) => (
              <option key={a.accountNo} value={a.accountNo}>
                {a.accountNo} · {a.name}
              </option>
            ))
          )}
        </select>
      </div>

      {/* ── A1 헤더 카드 — 거래소 | 종목명(검색 트리거) | 현재가 · 아래 종목정보 10칸 ── */}
      <section
        data-slot="lc-stock-card"
        className="min-w-0 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] p-0"
      >
        <div className="flex min-w-0 items-center gap-[var(--s-2)] px-2.5 py-2">
          {/*
            거래소 — 네이티브 1단 콤보. 방향 의미가 없어 중립이다.
            편집 진입은 거래소가 **키의 일부**라 바꾸면 다른 전략이 되므로 잠근다.
            ★ `appearance-none` 을 넣지 않는다 — 네이티브 캐럿과 OS 선택 UI 를 잃는다.
            ★ 데스크톱(≥992)에서만 **글자**를 키운다 (quick-260912-mvo Q-04). 넓은 화면에서
              10px 은 같은 줄의 20px 종목명 옆에서 읽히지 않았다. 좁은 폭의
              `text-[10px] px-1 py-0.5` 는 **그대로**다 — 폰 헤더는 이미 빡빡하다.
            ★ 종목명과 **같은 크기로 만들지 않는다.** 같은 줄에 선 보조 컨트롤로 읽혀야 한다.
            ★ quick-260912-ok2 ④ — **높이는 `h-9`(36px) 한 값이다.** 브라우저 실측이 이랬다:
              폰 390 · 컴팩트 716 에서 콤보 20 / 트리거 30 / 검색 입력 36, 와이드(컨테이너
              ≥992)에서 콤보 28 / 트리거 36 / 입력 36. 콤보가 **두 상태 어느 쪽과도** 높이가
              달랐고, 그래서 종목을 고르고 검색을 여는 동안 헤더 한 줄이 48.38 ↔ 52 로 튀었다
              (WINDOWS 8 의 「잔여 점프」가 이것이다).
              세 컨트롤을 한 값(36)에 모으면 ⓐ 콤보 = 트리거, ⓑ 콤보 = 입력, ⓒ 상태 전환에
              콤보 불변 — 세 요구가 **동시에** 성립한다. 둘만 맞추는 어떤 조합도 나머지 한
              상태에서 튄다.
              ★ `h-7`(28px) 데스크톱 override 를 **지웠다.** 남겨 두면 와이드에서만 콤보가
                8px 낮아져 같은 결함이 그 밴드에 되살아난다. 글자 크기(14px)는 그대로다 —
                직전 quick 이 키운 값이고 이번 목적은 높이 정렬이다.
              ★ `appearance-none` 을 넣지 않는 이유는 위와 같다 — 유닛이 렌더된 `className`
                으로 그 부재를 잠근다.
          */}
          <select
            aria-label="거래소"
            value={exchange}
            onChange={(e) => setExchange(e.target.value as RelayExchange)}
            disabled={parsedKey !== null}
            className="h-9 flex-none rounded-[var(--r)] border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5 text-[10px] font-bold text-[var(--muted-fg)] disabled:opacity-50 @min-[992px]/lc:px-1.5 @min-[992px]/lc:py-0 @min-[992px]/lc:text-[14px]"
          >
            {(["KRX", "NXT"] as const).map((ex) => (
              <option key={ex} value={ex}>
                {ex}
              </option>
            ))}
          </select>

          {isin === "" || searching ? (
            <StockSearchField
              /*
                ★ quick-260912-ok2 ② — **사용자가 종목명을 눌러 연 경우에만** 포커스한다.
                  `searching` 이 곧 그 신호다(첫 진입은 `isin === ''` 쪽으로 들어온다).
                  첫 진입에도 포커스를 주면 폰에서 페이지를 여는 순간 소프트 키보드가 올라와
                  헤더·호가가 화면 밖으로 밀린다 — 아직 타이핑하겠다고 말한 적 없는 사용자에게
                  키보드를 띄우는 것은 조작이지 편의가 아니다(T-ok2-06).
                  종목명을 **눌러서** 열었다면 다음 동작은 타이핑뿐이므로 그때는 포커스가 맞다.
              */
              focusOnOpen={searching}
              onPick={(s) => {
                setPicked(s);
                setSearching(false);
              }}
              onCancel={() => setSearching(false)}
            />
          ) : (
            <>
              {/*
                ★ **종목을 되돌릴 유일한 경로**다 (260911-w5h). 종전에는 `isin === ''` 일
                  때만 검색창이 떴고, 한 번 고르면 페이지를 새로 열지 않는 한 다른 종목으로
                  갈 방법이 없었다. 종목명 블록 전체가 그 트리거다.
                ★ `aria-label` 을 걸지 않는다 — 보이는 글자(종목명·코드)가 접근성 이름에
                  그대로 남아야 WCAG 2.5.3(label in name)을 만족한다. 「무엇이 되는가」는
                  `sr-only` 한 조각이 덧붙인다.
                ★ quick-260912-mvo Q-05 — **눌리는 컨트롤로 보이게 + 행을 먹지 않게.**
                  ⓐ 텍스트 캐럿(`▾`)을 lucide `ChevronDown` 으로 바꿨다. 글자 캐럿은 글꼴에
                    따라 위치·굵기가 흔들려 장식으로 읽혔다.
                  ⓑ ~~아이콘만으로는 약해서 **옅은 테두리**(`--border-subtle`)를 둘렀다.~~
                    ★ quick-260912-u58 ③ — **되돌렸다.** 사용자가 그 테두리를 「콤보박스
                      테두리」로 읽었고, 필요 없다고 명시했다(「테두리는 필요없고 종목명 옆에
                      세모 아이콘만 잘 보여줘」). 테두리가 하던 「눌리는 컨트롤이다」는 역할은
                      이제 **아이콘 자신**이 맡는다 — 색을 `--muted-fg`(회색 장식)에서 `--fg`
                      로 올리고 크기를 한 단 키웠다(14→16 / 데스크톱 16→18px, 브라우저 실측).
                      「눌린다」를 말하는 나머지 두 채널(`hover:bg-[var(--muted)]` · 전역
                      `*:focus-visible` 링)은 **그대로**다 — 테두리를 뺀 뒤 그 둘이 유일한
                      채널이라 하나라도 지우면 이 버튼은 그냥 글자가 된다(WCAG 2.4.7).
                  ⓒ `flex-1` 을 걷었다 — 트리거가 행의 빈 공간까지 먹어, 종목명에서 한참
                    떨어진 허공을 눌러도 검색이 열렸다. `min-w-0` 은 남겨 긴 종목명이
                    `truncate` 로 줄어들게 하고, 다른 폭 유틸리티는 새로 넣지 않는다
                    (flex 기본값이 「내용 폭, 필요하면 축소」다).
              */}
              {/*
                ★ quick-260912-ok2 ④ — 높이를 `h-9`(36px)로 못박아 거래소 콤보·검색 입력과
                  같은 줄에 **같은 키로** 선다. 폰에서 30px 이던 자연 높이가 36 이 되면서
                  헤더 한 줄의 48.38 ↔ 52 점프도 함께 사라진다(위 콤보 주석의 실측).
                ★ 바깥이 `items-center`, **안쪽 span 이 `items-baseline`** 이다. 고정 높이
                  flex 에서 `align-items:baseline` 은 베이스라인 묶음을 cross-start(위쪽)에
                  붙여 글자가 36px 상자 천장에 매달린다. 묶음을 span 으로 한 겹 싸면 종목명
                  16px · 코드 11px · 캐럿의 **베이스라인 관계는 그대로 두고** 묶음 전체만
                  세로 중앙에 온다. 둘을 한 요소에 겹쳐 쓸 수는 없다.
                ★ `min-w-0` 은 버튼 → span → `<b>` 세 겹 전부에 있어야 긴 종목명이
                  `truncate` 로 줄어든다. 한 겹만 빠져도 축소가 멈추고 행을 밀어낸다.
              */}
              <button
                type="button"
                data-slot="lc-stock-trigger"
                disabled={parsedKey !== null}
                onClick={() => setSearching(true)}
                className="flex h-9 min-w-0 items-center rounded-[var(--r)] px-1 text-left hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <b className="min-w-0 truncate text-[16px] font-semibold text-[var(--fg)] @min-[992px]/lc:text-[20px]">
                    {displayName}
                  </b>
                  {stockCode !== null && (
                    <span className="mono flex-none text-[11px] text-[var(--muted-fg)] @min-[992px]/lc:text-[12px]">
                      {stockCode}
                    </span>
                  )}
                  <span className="sr-only">종목 변경</span>
                  {/*
                    ★ 새 색 토큰을 만들지 않는다 — 이미 있는 `--fg` 로 올릴 뿐이다.
                      `--muted-fg`(lab 42) 로는 종목명(16/20px) 옆에서 14px 아이콘이
                      배경 잡티처럼 읽혔다(브라우저 실측 스크린샷).
                  */}
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 flex-none text-[var(--fg)] @min-[992px]/lc:size-4.5"
                  />
                </span>
              </button>
            </>
          )}

          {/*
            ★ quick-260912-mvo Q-05 (d) — 현재가는 **검색 중에도 남는다**(`isin !== ''` 이기만
              하면 렌더). 예전에는 종목명 트리거와 한 덩어리라 검색을 열면 현재가까지 통째로
              사라졌고, 그것이 이 화면에서 가장 큰 레이아웃 점프이자 「종목이 이미 바뀌었나」
              하는 오독의 원인이었다. 바꾸는 것은 왼쪽 자리 하나뿐이어야 한다.
          */}
          {isin !== "" && (
            <span
              className={cn(
                "ml-auto flex flex-none flex-col items-end leading-[1.2]",
                changeRate > 0
                  ? "text-[var(--up)]"
                  : changeRate < 0
                    ? "text-[var(--down)]"
                    : "text-[var(--flat)]",
              )}
            >
              <b className="mono text-[16px] font-bold @min-[992px]/lc:text-[22px]">
                {currentPrice > 0 ? KRW.format(currentPrice) : "—"}
              </b>
              <small className="mono text-[11px] font-semibold @min-[992px]/lc:text-[13px]">
                {changeRate.toFixed(2)}%
              </small>
            </span>
          )}
        </div>

        {/*
          종목정보 **10칸** — `card/quote-grid-10.tsx` 로 옮겨졌다(18-06). 라벨·색·밴드 배치의
          규율 주석은 그 파일에 있다. 가격 4값은 여기서 정한 값(실시간 우선, REST 폴백)을
          그대로 넘긴다 — 폴백 판단을 두 곳에서 하면 사다리·폼과 10칸이 다른 상한가를 말한다.
          ★ quick-260912-mvo Q-05 (d) — `!searching` 조건을 **걷었다.** 검색을 여는 순간
            종목정보 10칸이 통째로 사라져 「하단 내용이 바뀐다」로 읽혔다. 검색은 종목명
            **자리에서만** 일어나야 한다 — 아래 내용은 취소했을 때 돌아올 그 종목의 것이다.
        */}
        {isin !== "" && (
          <QuoteGrid10
            quote={quote}
            basePrice={basePrice}
            upperLimit={upperLimit}
            lowerLimit={lowerLimit}
            currentPrice={currentPrice}
          />
        )}
      </section>

      {/* ── A2 상태줄 ── */}
      <StatusBar
        status={status}
        statusLabel={statusLabel}
        ledServer={ledServer}
        onArm={handleArm}
        trackBaseline={
          server?.sellEntryLatched === true ? server.sellQtyTrackBaseline : null
        }
        unacked={unacked}
        error={lastError}
        appliedAt={appliedAt}
      />

      {/* ── A3 에코 배너 (6초) ── */}
      {banner !== null && (
        <p
          role="status"
          data-slot="lc-echo-banner"
          className="m-0 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-caption)] text-[var(--fg)]"
        >
          {banner}
        </p>
      )}

      {awaitingSnapshot && (
        <p
          aria-busy="true"
          data-slot="lc-snapshot-loading"
          className="m-0 rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-caption)] text-[var(--muted-fg)]"
        >
          전략 정보를 불러오는 중이에요…
        </p>
      )}

      {/*
        본문 그리드 — **본문 폭 4밴드**(260912-k2x). 표와 실측 근거의 정본은 `globals.css`
        §2.2b 이고, 여기에 복사하지 않는다.
          폰(~본문 699)      : 42% | 1fr, gap 8
          컴팩트(700~829)    : 260px | 1fr
          와이드(830~991)    : 400px | 1fr  ← 마커 슬롯 20px 이 만든 실측 하한이다
          데스크톱(992~)     : 460px | 1fr, gap 16
        ★ 옛 「1열로 강제」 분기는 **삭제됐다** — 그 분기는 사이드바가 뜨면서 본문이 좁아지는
          뷰포트 1024~1279 구간을 손으로 메우던 것이고, 본문 폭을 직접 재는 지금은 대응이 없다.
        ★ 그리드 자식 전부 `min-w-0` — 빠지면 `overflow-hidden` 아래에서 스크롤이 아니라
          **조용한 잘림**이 된다(`tasks/lessons.md` 등재 함정).
      */}
      <div
        data-slot="lc-body-grid"
        className="grid min-w-0 grid-cols-[42%_minmax(0,1fr)] items-start gap-[var(--s-2)] @min-[700px]/lc:grid-cols-[260px_minmax(0,1fr)] @min-[830px]/lc:grid-cols-[400px_minmax(0,1fr)] @min-[992px]/lc:grid-cols-[460px_minmax(0,1fr)] @min-[992px]/lc:gap-[var(--s-4)] [&>*]:min-w-0"
      >
        <section
          data-slot="lc-orderbook-card"
          className="flex min-w-0 flex-col rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] p-[var(--s-2)] @min-[992px]/lc:p-[var(--s-3)]"
        >
          {/*
            ★ 카드 제목행은 260912-k2x 에서 **행째 걷었다**(숨긴 것이 아니라 DOM 에 없다).
              거래소는 바로 위 헤더 카드의 콤보가 이미 말하고 있었고, 「호가 10단」이라는
              접근성 이름은 사다리 표·목록의 `aria-label` 이 그대로 잇는다 — 스크린리더가
              읽는 내용은 한 글자도 줄지 않았다. **카드 자체는 남는다.**
          */}
          <OrderbookLadder
            variant="chaser"
            quote={quote}
            depth={10}
            isStale={isStale}
            basePrice={basePrice}
            upperLimit={upperLimit}
            recentTrades={tape}
          />
        </section>

        {/* 폼 — 자기 안에서 ≥1280 을 매수 250 | 매도 250 으로 다시 나눈다(16-12). */}
        <LimitChaserForm
          key={`${isin}|${accountNo}|${exchange}|${resetSeq}|${liveSeed}`}
          isin={isin}
          accountNo={accountNo}
          exchange={exchange}
          server={server}
          upperLimit={upperLimit}
          disabled={isin === "" || accountNo === "" || status !== "ready"}
          buyStatusText={badges.buyText}
          sellStatusText={badges.sellText}
          onDirtyCountChange={setDirtyCount}
          serverAnswerSeq={answerSeq}
          onSent={handleSent}
          onServerEcho={handleServerEcho}
        />
      </div>

      {/* ── A12 미체결 / 잔고 (전폭) ── */}
      <AccountPanel
        selectedAccountNo={accountNo}
        accountName={accounts.find((a) => a.accountNo === accountNo)?.name}
        account={accountState}
        isin={isin === "" ? null : isin}
        name={displayName === "" ? undefined : displayName}
        currentPrice={currentPrice > 0 ? currentPrice : undefined}
        originTag="상따"
        status={status}
        className="rounded-[var(--r-lg)] border border-[var(--border)]"
      />

      {/* ── A13 전략 로그 (전폭) ── */}
      <StrategyLog entries={log} />
    </div>
  );
}

/* ───────────────────────────── 조각 ───────────────────────────── */

/**
 * 상태줄 (A2).
 *
 * ★ 무장 상태를 말하는 표기는 **래치 LED 3개뿐**이다 (D-22). 옛 매수/매도 도트 세그먼트
 *   (`Dot` + `ON`/`감시`/`대기`)는 걷어냈다 — LED 가 같은 사실을 더 정확하게(3단계 · 클릭
 *   가능 여부 · 매도잔량 기준 예외까지) 말하므로 둘을 함께 두면 같은 무장을 두 표기가 서로
 *   다르게 말하는 순간이 반드시 생기고, 그때 사용자는 어느 쪽을 믿을지 알 수 없다.
 *   `strategyStatusOf` 가 만드는 `buyText`/`sellText` 는 **폼 그룹 헤더 문구**로 계속 산다.
 * ★ 반응형은 §2.2b 4밴드 컨테이너 쿼리 안에서만 일어난다 — 이 줄은 이미 `flex-wrap` 이라
 *   폰 밴드에서 두 줄로 접힌다. 여기에 **뷰포트 브레이크포인트 유틸을 새로 만들지 않는다** —
 *   상따 본문의 폭 판정은 `@container/lc` 하나이고, 뷰포트 분기를 섞으면 사이드바가 열릴 때
 *   본문 폭과 뷰포트 폭이 어긋나 같은 화면이 두 밴드를 동시에 산다.
 */
function StatusBar({
  status,
  statusLabel,
  ledServer,
  onArm,
  trackBaseline,
  unacked,
  error,
  appliedAt,
}: {
  status: RelayStatus;
  statusLabel: string;
  /** 마지막 서버 에코 스냅샷(+ `hadOrder`). LED 3개의 **유일한** 판정 입력이다(D-20). */
  ledServer: LatchLedServer;
  onArm: (kind: LatchLedKind) => void;
  trackBaseline: number | null;
  unacked: boolean;
  /** 최신 거부 1건 — 원문과 출처를 따로 들고 있는다(배지 판정은 렌더 자리에서 한 번). */
  error: { text: string; src: string } | null;
  appliedAt: string | null;
}) {
  // ⑥ 연결 상태 문구는 계약 한 곳(`RELAY_STATE_LABELS`)에서만 온다(D-36).
  const label =
    statusLabel === "" ? RELAY_STATE_LABELS.connecting : statusLabel;

  return (
    <div
      data-slot="lc-status-bar"
      data-status={status}
      aria-live="polite"
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-caption)] text-[var(--muted-fg)]"
    >
      <span className="inline-flex items-center gap-1.5">
        <Dot
          tone={status === "ready" ? "ok" : "off"}
          pulse={PROGRESS_STATES.has(status)}
        />
        DMA <b className="font-semibold text-[var(--fg)]">{label}</b>
      </span>
      {/*
        래치 LED 3종 — 순서는 **매수 · 매도 · 취소**다 (D-22). 폼의 세로 축(매수 → 매도 →
        취소)과 같은 순서라 사용자가 두 영역을 오가며 자리를 다시 찾지 않는다.
        ★ 라벨을 짧게 둔다(`OFF`/`대기`/`감시`) — 폰 밴드에서 상태줄이 두 줄로 접히는 것까지
          목업으로 사용자가 확인한 형태다(D-21 채택안).
      */}
      {(["buy", "sell", "cancel"] as const).map((kind) => (
        <LatchLed key={kind} kind={kind} server={ledServer} onArm={onArm} />
      ))}
      {trackBaseline !== null && (
        <span>
          잔량추적 기준선{" "}
          <b className="mono font-semibold text-[var(--fg)]">
            {KRW.format(trackBaseline)}
          </b>
        </span>
      )}
      {/*
        ③ 3초 무응답. **다시 보내지 않는다** — 이 자리는 「모른다」를 말하는 곳이지
        「다시 시도한다」를 말하는 곳이 아니다.
      */}
      {unacked && (
        <span
          data-slot="lc-unacked"
          className="font-semibold text-[var(--destructive)]"
        >
          미반영 · 서버 응답을 기다리고 있어요
        </span>
      )}
      {error !== null && (
        <span
          role="alert"
          data-slot="lc-server-error"
          className="min-w-0 text-[var(--destructive)]"
        >
          {/*
            출처 배지 (17-11 / D-09 · D-17). 판정은 `serverMsgBadge` **하나**만 쓴다 —
            이 파일 안에서 `src` 를 직접 비교하면 서버 어휘가 늘 때마다 두 곳이 갈린다
            (`vi-client`·`relay-status-bar` 와 같은 규율).
            배지는 **텍스트 접두**다: 색만으로 출처를 가르면 WCAG 1.4.1 위반이고, 이 줄은
            이미 전부 `--destructive` 라 쓸 색도 없다.
          */}
          <span data-slot="lc-server-error-src" className="font-semibold">
            {serverMsgBadge(error.src)}
          </span>{" "}
          {error.text}
        </span>
      )}
      {appliedAt !== null && (
        <span className="mono ml-auto">반영 {appliedAt}</span>
      )}
    </div>
  );
}

/** 점멸 도트를 쓰는 진행 상태 — `relay-status-bar`·`me-client` 와 같은 집합이다. */
const PROGRESS_STATES: ReadonlySet<RelayStatus> = new Set<RelayStatus>([
  "idle",
  "connecting",
  "logging_in",
  "declaring",
]);

/**
 * 연결 상태 도트.
 *
 * ★ 17-11 에서 톤이 `ok`/`off` **둘로 줄었다.** 무장 3단계를 그리던 `up`/`down`/`hollow`
 *   는 래치 LED 가 가져갔다(D-22) — 쓰이지 않는 갈래를 남겨 두면 언젠가 두 번째 무장
 *   표기가 이 도트로 되살아난다. 접근성은 LED 쪽이 **보이는 라벨**로 잇는다(WCAG 1.4.1).
 */
function Dot({
  tone,
  pulse = false,
}: {
  tone: "ok" | "off";
  pulse?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      data-tone={tone}
      className={cn(
        "block size-[7px] shrink-0 rounded-full",
        tone === "ok" && "bg-[oklch(0.72_0.19_150)]",
        tone === "off" && "bg-[var(--flat)]",
        pulse && "animate-pulse motion-reduce:animate-none",
      )}
    />
  );
}

/**
 * 인라인 종목 검색.
 *
 * `components/search/global-search.tsx` 를 쓰지 않는 이유: 그쪽은 인자를 받지 않고 선택 시
 * **종목 상세로 라우팅**한다. 여기서 필요한 것은 「고른 종목을 이 화면에 남기는 것」이라
 * 라우팅이 끼면 사용자가 편집하던 폼을 잃는다.
 *
 * ★ `isin` 이 없는 종목은 고를 수 없다(ETP 등 — 게이트웨이 구독·주문 대상이 아니다, D-28).
 *   고를 수 있게 두면 「등록했는데 아무 일도 안 일어나는 전략」이 만들어진다.
 * ★ **시장구분을 알 수 없는 종목도 같은 취급**이다 (WR-03). 전략 등록의 시장은 relay 가
 *   `SymbolMap` 으로 푸는데, 그것이 못 푸는 종목을 고를 수 있게 두면 사용자가 폼을 다 채우고
 *   스위치를 켠 **뒤에야** 거부 프레임을 본다. 고를 수 없다는 사실을 목록에서 먼저 말한다.
 */
/**
 * 고를 수 있는 종목인가 — **판정 지점 하나**.
 *
 * `disabled` 와 `onClick` 가드가 같은 함수를 읽는다(`vi-order-list.tsx` 의 `isConfirmable` 과
 * 같은 규율이다). 두 곳에 따로 적으면 한쪽만 고쳐지고, 그때 뚫리는 것이 「비활성인데 눌리면
 * 선택되는」 행이다.
 *
 * ★ 타입은 `market: 'KOSPI' | 'KOSDAQ'` 이라고 말하지만 **런타임은 그렇지 않다** — KONEX·
 *   `null`·master-sync 의 미확인 sentinel 이 그대로 실려 온다. 그래서 문자열 목록으로 본다.
 */
const ORDERABLE_MARKETS: readonly string[] = ["KOSPI", "KOSDAQ"];
/*
  ★ 반환형이 **타입 서술자**다 (GC-IN-02) — 이 함수가 런타임에 확인하는 `row.isin !== null` 을
    타입에도 그대로 말한다. `boolean` 이면 TS 가 좁히지 못해 소비부가 `isin` 을 `string` 으로
    단언해 메우게 되고, 그 단언은 「검사와 타입이 갈라져도 컴파일러가 침묵한다」는 뜻이다 —
    나중에 이 함수에서 `isin` 검사를 빼도 아무 데서도 터지지 않는다.
*/
function isPickable(
  row: StockDetailResponse,
): row is StockDetailResponse & { isin: string } {
  return row.isin !== null && ORDERABLE_MARKETS.includes(row.market);
}

/**
 * 종목 검색 — 종목명 **자리에** in-place 로 뜬다 (quick-260912-mvo Q-05).
 *
 * `onCancel` 은 「고르지 않고 닫는다」다. 이미 고른 종목(`picked`)은 **건드리지 않으므로**
 * 취소해도 종목이 바뀌지 않는다 — 그것이 이 프롭의 존재 이유다.
 */
function StockSearchField({
  focusOnOpen,
  onPick,
  onCancel,
}: {
  /** 열릴 때 입력에 포커스를 줄지 — 호출부 주석 참조(눌러서 연 경우에만 true). */
  focusOnOpen: boolean;
  onPick: (stock: SelectedStock) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockDetailResponse[]>([]);
  const [loading, setLoading] = useState(false);
  /**
   * 활성 항목을 **인덱스가 아니라 종목코드**로 들고 있는다 (quick-260912-u58 ①).
   *
   * 인덱스로 두면 목록이 갱신될 때 같은 숫자가 **다른 종목**을 가리킨다 — 화면은 그대로인데
   * Enter 가 엉뚱한 종목을 고르는 상태다(실계좌 발주 설정이므로 조용한 오발주다).
   * 코드로 들고 있으면 그 종목이 새 목록에 없을 때 아래 `activeRow` 파생이 **스스로 null** 이
   * 된다 — 초기화를 잊는 경로가 아예 없다.
   *
   * ★ 결과가 도착하면 **새 목록의 첫 번째 고를 수 있는 행**이 활성으로 들어온다(헤더 ⌘K
   *   검색과 같은 감각 — 입력하고 Enter 한 번으로 고른다). 이전 T-u58-01 은 「첫 항목 자동
   *   선택 금지」였는데, 그 위험의 실체는 **활성이 화면과 갈라지는 것**이었다: 인덱스로 들고
   *   있으면 목록이 갱신될 때 같은 숫자가 다른 종목을 가리켰다. 코드로 들고 있고 활성 행에
   *   배경·`aria-selected`·`aria-activedescendant` 가 함께 따라붙는 지금은, Enter 가 고르는
   *   종목이 **사용자가 보고 있는 그 행**이다. 갱신 때마다 새 목록의 첫 행으로 다시 계산하는
   *   것이 그 계약을 지키는 지점이다(오래된 코드를 이어받지 않는다).
   */
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /*
    ARIA 결선용 id 뿌리. `useId()` 한 개 + 행의 `code`(이미 `key` 로 쓰는 값)로 만든다 —
    인덱스로 만들면 목록이 갱신될 때 **같은 id 가 다른 종목**을 가리키고, 그러면
    `aria-activedescendant` 가 가리키는 이름과 Enter 가 고르는 종목이 갈라진다.
  */
  const uid = useId();
  const listId = `${uid}-lc-search-list`;
  const optionId = (code: string) => `${uid}-lc-search-opt-${code}`;

  /**
   * 고를 수 있는 행만. ↓/↑ 가 지나가는 목록이자 Enter 가 고르는 후보다 — **판정 하나**를
   * `isPickable` 이 갖고, 세 곳이 그것을 공유한다(다르게 쓰면 Enter 가 먹통인 활성 행이 난다).
   */
  const pickables = useMemo(() => results.filter(isPickable), [results]);
  /*
    ★ 파생이다 — 별도 초기화 effect 를 두지 않는다. 목록이 갱신돼 그 코드가 사라지면 이 값이
      곧바로 null 이 되고, `aria-activedescendant` 도 함께 사라진다. (setResults 지점에서도
      명시적으로 비우지만, 그 호출을 하나 빠뜨려도 여기서 막힌다.)
  */
  const activeRow = pickables.find((r) => r.code === activeCode) ?? null;
  /** 결과 목록이 DOM 에 있는가 — `aria-expanded`·`aria-controls` 가 이 한 값을 말한다. */
  const hasList = query.trim() !== "";

  /*
    ★ quick-260912-ok2 ② — 이 effect 가 **래퍼의 `onKeyDown`(Esc)·`onBlur`(취소)를 처음으로
      살린다.** 그 두 핸들러는 포커스가 컨테이너 안에 있을 때만 실행되는데, 여기 오기 전까지
      검색을 열어도 `document.activeElement` 는 `body` 였다(브라우저 실측). 즉 Esc 도 blur
      취소도 **한 번도 동작한 적이 없는 죽은 코드**였고, jsdom 유닛은 입력에 직접 이벤트를
      쏘기 때문에 그 사실을 볼 수 없었다.
    ★ React 의 `autoFocus` 속성 대신 ref + effect 를 쓴다. `autoFocus` 는 **마운트 순간에만**
      동작하는 특례라, 나중에 누가 두 분기를 하나의 상시 마운트 입력으로 합치는 순간 조용히
      아무 일도 하지 않게 된다(에러가 아니라 기능 소실이다). 조건을 effect 로 적어 두면 그
      리팩터링에서도 계속 동작하고, 「어느 상태에서 포커스가 가는가」가 코드에 그대로 남는다.
    ★ `preventScroll` 은 쓰지 않는다 — 입력은 이미 화면 안에 있고, 끄면 폰에서 키보드가
      올라올 때 입력이 가려진 채로 남을 수 있다.
  */
  useEffect(() => {
    if (!focusOnOpen) return;
    inputRef.current?.focus();
  }, [focusOnOpen]);

  useEffect(() => {
    const q = query.trim();
    if (q === "") {
      setResults([]);
      setActiveCode(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchStocks(q, controller.signal)
        .then((rows) => {
          if (controller.signal.aborted) return;
          setResults(rows);
          /*
            새 목록의 **첫 번째 고를 수 있는 행**을 활성으로 세운다 — 이전 질의의 코드를
            이어받지 않으므로 「다른 종목을 가리킨 채로 Enter 를 받는」 상태는 여전히 없다.
            고를 수 있는 행이 없으면 null 이다(Enter 는 조용하다).
          */
          setActiveCode(rows.find(isPickable)?.code ?? null);
          setLoading(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResults([]);
          setActiveCode(null);
          setLoading(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  /*
    ★ 활성 항목이 `max-h-60` 목록 밖으로 나가면 따라간다. `block: 'nearest'` 라 이미 보이는
      항목에는 아무 일도 하지 않는다 — 페이지 전체가 튀지 않는다.
      (jsdom 에는 이 API 가 없다. `webapp/tests/setup.ts` 가 이미 폴리필을 갖고 있다.)
  */
  useEffect(() => {
    if (!activeRow) return;
    document
      .getElementById(optionId(activeRow.code))
      ?.scrollIntoView({ block: "nearest" });
    // `optionId` 는 `uid` 만 닫는 순수 함수라 의존성에서 뺀다 — 매 렌더 새 함수라 넣으면 매번 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRow?.code, uid]);

  /**
   * ↓/↑ 이동 — **고를 수 있는 행만** 지난다.
   *
   * 끝에서는 **멈춘다(순환하지 않는다)**. 순환을 고르면 긴 목록에서 ↓ 를 눌러 끝에 닿았을 때
   * 화면이 소리 없이 맨 위로 튀어, 사용자가 「내가 어디를 보고 있는지」를 잃는다. 멈추면
   * 끝에 닿았다는 사실이 그대로 드러난다.
   */
  const moveActive = (delta: 1 | -1) => {
    if (pickables.length === 0) return;
    const cur = pickables.findIndex((r) => r.code === activeCode);
    const next =
      cur === -1
        ? delta === 1
          ? 0
          : pickables.length - 1
        : Math.min(pickables.length - 1, Math.max(0, cur + delta));
    setActiveCode(pickables[next]!.code);
  };

  /** 행 하나를 골라 위로 올린다 — 클릭 경로와 Enter 경로가 **같은 함수**를 지난다. */
  const pick = (row: StockDetailResponse & { isin: string }) => {
    onPick({
      isin: row.isin,
      code: row.code,
      name: row.name,
      // `market` 을 싣지 않는다 (WR-03 / D-28) — 추측이 발주 설정이 되지 않게.
      upperLimit: row.upperLimit,
      lowerLimit: row.lowerLimit,
      // 기준가 = 현재가 − 전일대비. 실시간 호가가 오면 `quote.base` 가 이긴다.
      basePrice: row.price - row.changeAmount,
      price: row.price,
      changeRate: row.changeRate,
    });
    setQuery("");
    setActiveCode(null);
  };

  return (
    <div
      className="relative min-w-0 flex-1"
      /*
        ★ Esc 로 취소한다. 전파는 멈추되 **기본 동작은 막지 않는다** — `type="search"` 의
          네이티브 「지우기」가 같은 키를 쓰고, 그것까지 뺏으면 입력만 남고 닫히지도 않는다.
      */
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
      /*
        ★ 컨테이너 **밖**으로 포커스가 나갈 때만 닫는다. 안쪽(입력 ↔ 결과 버튼) 이동은 닫지
          않는다 — 닫히면 항목을 영영 못 고른다(T-mvo-03).
        ★ `relatedTarget` 포함 판정만으로는 부족하다. 일부 브라우저는 버튼 mousedown 에서
          포커스를 옮기지 않아 `relatedTarget` 이 `null` 로 온다 — 그 경우 「밖으로 나갔다」로
          오판해 클릭이 완성되기 전에 목록이 사라진다. 그래서 결과 `<ul>` 의 mousedown 기본
          동작을 함께 막아 포커스가 입력에서 **떠나지 않게** 한다(click 은 그대로 발생한다).
          **두 장치가 함께여야** 이 실패가 닫힌다.
      */
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onCancel();
      }}
    >
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="종목 검색"
        placeholder="종목명 또는 코드로 검색"
        /*
          ★ quick-260912-u58 ① — **`aria-activedescendant` 콤보박스**다. 실제 DOM 포커스는
            입력에 **남는다**. 로밍 tabindex 로 포커스를 항목에 옮기면 래퍼 `onBlur` 의
            「밖으로 나가면 취소」 계약과 싸운다 — 항목으로 옮기는 순간 blur 가 나고, 그
            판정이 조금이라도 어긋나면 고르기 직전에 목록이 사라진다.
          ★ 목록이 **없을 때는 `aria-controls` 를 걸지 않는다.** `<ul>` 은 질의가 비면 아예
            렌더되지 않으므로, 상수 id 를 늘 걸어 두면 존재하지 않는 요소를 가리켜 axe
            `aria-valid-attr-value`(critical)에 걸린다 — `/trading/limit-chaser/new` 는 a11y
            스캔 대상이고 그 화면은 **검색이 열린 채로** 진입한다. `aria-activedescendant` 도
            같은 이유로 활성 항목이 있을 때만 건다.
          ★ `role="combobox"` 를 거는 순간 `getByRole('searchbox')` 가 죽는다 —
            `trading-limit-chaser.spec.ts` 의 조회 3곳을 **같은 커밋에서** 함께 고쳤다.
          ★ `jsx-a11y/role-has-required-aria-props` 를 이 한 줄에서만 끈다 — 그 규칙은 ARIA
            **1.1** 판이라 combobox 에 `aria-controls` 를 **항상** 요구한다. ARIA 1.2 는
            `aria-expanded="false"` 일 때 `aria-controls` 를 요구하지 않고, axe(1.2 판)도
            그렇다. 여기서 규칙을 따르면 목록이 없을 때 **존재하지 않는 id** 를 가리켜
            `aria-valid-attr-value`(critical)로 바뀐다 — warning 하나를 끄려고 critical 하나를
            만드는 거래다. 열린 상태의 결선은 `a11y.spec.ts` 가 실제 브라우저에서 잰다.
        */
        // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
        role="combobox"
        aria-expanded={hasList}
        aria-autocomplete="list"
        {...(hasList ? { "aria-controls": listId } : {})}
        {...(activeRow
          ? { "aria-activedescendant": optionId(activeRow.code) }
          : {})}
        /*
          ★ ↓/↑/Enter 는 **래퍼가 아니라 입력**에 건다. Esc 가 래퍼에 있는 이유는 포커스가
            결과 버튼(Tab 으로 닿는다) 안에 있을 때도 닫혀야 하기 때문인데, 이 셋은 정반대다 —
            포커스가 결과 버튼 위에 있을 때 Enter 는 이미 그 버튼의 네이티브 클릭이다. 래퍼에
            걸면 같은 Enter 한 번이 버튼 클릭 + 활성항목 선택으로 **두 번** 고르게 된다.
            콤보박스 키보드는 콤보박스(=입력)의 것이다.
        */
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            // 캐럿이 입력 양끝으로 튀는 네이티브 동작을 막는다 — 목록 이동이 이 키의 뜻이다.
            e.preventDefault();
            moveActive(e.key === "ArrowDown" ? 1 : -1);
            return;
          }
          if (e.key === "Enter") {
            /*
              ★ 활성 항목이 없어도 `preventDefault` 는 한다 — `type="search"` 의 Enter 가
                조상 폼 제출로 새는 경로를 여기서 끊는다. 고를 수 있는 행이 하나도 없으면
                `activeRow` 가 null 이라 `onPick` 은 불리지 않는다(조용하다).
              ★ 결과가 오면 첫 행이 이미 활성이므로 보통은 여기서 바로 골라진다 — 그 활성은
                배경·`aria-selected` 로 화면에 보이는 그 행이다(위 `activeCode` 주석).
            */
            e.preventDefault();
            if (activeRow) pick(activeRow);
          }
        }}
        /*
          ★ quick-260912-mvo Q-02 — 포커스는 **테두리색 한 겹**이다. 이 입력은 래퍼가 아니라
            자기 자신이 테두리(`border-[var(--input)]`)를 가지므로 `focus-within:` 이 아니라
            `focus-visible:` 이다. seamless 로 전역 링을 걷었으니 이 테두리 유틸리티를 지우면
            포커스가 아무 표시 없이 사라진다(WCAG 2.4.7).
          ★ 높이 `h-9` 는 아래 결과 목록의 `top-10` 과 **한 쌍**이다. 한쪽만 고치면 목록이
            입력에서 떠서, 마우스가 그 틈을 지나는 순간 닫힌 것처럼 보인다.
        */
        data-focus-ring="seamless"
        className="h-9 w-full min-w-0 rounded-[var(--r-md)] border border-[var(--input)] bg-[var(--bg)] px-2.5 text-[length:var(--t-sm)] text-[var(--fg)] focus-visible:border-[var(--ring)]"
      />
      {hasList && (
        <ul
          id={listId}
          role="listbox"
          data-slot="lc-search-results"
          aria-label="종목 검색 결과"
          /* 위 `onBlur` 주석 참조 — 클릭 도중 포커스가 입력에서 떠나지 않게 하는 절반이다. */
          onMouseDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-10 z-20 m-0 max-h-60 list-none overflow-y-auto rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg"
        >
          {results.length === 0 ? (
            /*
              ★ 안내 문구는 **옵션이 아니다.** `role="presentation"` 으로 낮춰 listbox 가
                옵션 아닌 자식을 소유하지 않게 한다 — 그대로 두면 axe 가 이 `<li>` 를 owned
                child 로 보고 `aria-required-children` 을 낸다. 문구 자체는 텍스트 노드라
                role 을 갖지 않으므로 listbox 는 「옵션 0개」로 읽힌다(= 사실 그대로다).
            */
            <li
              role="presentation"
              className="px-2 py-1.5 text-[length:var(--t-caption)] text-[var(--muted-fg)]"
            >
              {loading ? "검색 중이에요…" : "검색 결과가 없어요"}
            </li>
          ) : (
            results.map((row) => {
              const pickable = isPickable(row);
              const active = activeRow?.code === row.code;
              return (
                /*
                ★ `role="option"` 은 `<li>` 가 아니라 **버튼**이 갖는다. `<li role="option">`
                  안에 `<button>` 을 두면 axe `nested-interactive`(wcag2a · serious)에 걸리고,
                  마우스 클릭 경로를 유지하려면 버튼이 남아야 한다. `<li>` 는
                  `role="presentation"` 으로 낮춰 listbox 가 **옵션만** 소유하게 한다.
              */
                <li key={row.code} role="presentation">
                  <button
                    type="button"
                    id={optionId(row.code)}
                    role="option"
                    aria-selected={active}
                    {...(pickable ? {} : { "aria-disabled": true })}
                    data-slot="lc-search-option"
                    disabled={!pickable}
                    onClick={() => {
                      // 서술자가 여기서 `row.isin` 을 `string` 으로 좁힌다 — 단언이 필요 없다.
                      if (!isPickable(row)) return;
                      pick(row);
                    }}
                    /*
                    ★ 활성 표시는 **호버와 같은 배경**이다 — 새 색 토큰을 만들지 않는다.
                      기계가 읽는 계약은 `aria-activedescendant` ↔ 이 버튼의 `id` 이고,
                      이 배경은 사람이 읽는 같은 사실의 다른 채널이다.
                  */
                    className={cn(
                      "flex w-full min-w-0 items-center gap-[var(--s-2)] rounded-[var(--r)] px-2 py-1.5 text-left hover:bg-[var(--muted)] disabled:opacity-45",
                      active && "bg-[var(--muted)]",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
                      {row.name}
                    </span>
                    <span className="mono flex-none text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                      {row.code}
                    </span>
                    {!isPickable(row) && (
                      <span
                        data-slot="lc-search-unorderable"
                        className="flex-none text-[11px] text-[var(--muted-fg)]"
                      >
                        주문 불가
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * 이탈 경고 — 더티일 때**만** 건다 (조작 규율 7).
 *
 * ★ 확인 창을 **브라우저 것**으로 쓴다. UI-SPEC D6 이 앱 다이얼로그를 4개로 못박았고
 *   (VI 시작 · VI 중지 · 전체 비활성화 · 미체결 취소), 이탈 경고는 그 목록에 없다.
 *   `beforeunload`(새로고침·탭 닫기)와 라우터 가드(링크 클릭)가 **같은 문구**를 쓴다.
 * ★ 더티가 0 이면 리스너를 아예 걸지 않는다 — 항상 걸어 두고 안에서 분기하면 「저장할 게
 *   없는데 나갈 때마다 물어보는 화면」이 되고, 사용자는 곧 경고를 읽지 않게 된다.
 */
function useLeaveWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = LEAVE_WARNING;
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank")
        return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      if (window.confirm(LEAVE_WARNING)) return; // 나가겠다고 했다
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    // capture 단계에서 잡아야 Next `<Link>` 의 핸들러보다 먼저 막을 수 있다.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}
