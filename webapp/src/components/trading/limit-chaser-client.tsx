"use client";

/**
 * LimitChaserClient — 옛 상따 전략 화면 본문 (TRADE-01). 18-12 부터 그 라우트는 `/trading` 으로
 * 리다이렉트만 하므로 이 컴포넌트를 렌더하는 화면이 없다 — 파일 삭제는 18-13 몫이다.
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

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { RELAY_STATE_LABELS, serverMsgBadge } from "@gh-radar/shared";
import type { RelayExchange } from "@gh-radar/shared";

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
import {
  StockSearchField,
  type SelectedStock,
} from "@/components/trading/workbench/stock-add-bar";
import { useIsinLabels } from "@/lib/isin-labels";
import { useLeaveWarning } from "@/lib/use-leave-warning";
import { parseStrategyKey } from "@/lib/limit-chaser";
import { useRelayContext } from "@/lib/relay-provider";
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

const KRW = new Intl.NumberFormat("ko-KR");

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

  /* ── 이탈 경고 (조작 규율 7) — 정의는 `lib/use-leave-warning.ts`(18-11 이동) ── */
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
