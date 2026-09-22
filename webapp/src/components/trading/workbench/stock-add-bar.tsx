"use client";

/**
 * 종목 검색 + 작업대 종목 추가란 (Phase 18 D-08 · UI-SPEC §레이아웃 계약 8 · E5, TRADE-06).
 *
 * ① ★ 승격이지 재구현이 아니다
 *   `StockSearchField` · `isPickable` 은 옛 상따 화면(18-13 삭제) 안에 비공개로 있던 Phase 16 종목검색
 *   (quick 60 — 첫 항목 자동 활성화 · ↓/Enter 키보드 왕복)을 **그대로 옮긴 것**이다. 상따 화면과 작업대가
 *   같은 정의 1벌을 쓴다 — 두 벌이 되면 「고를 수 없는 종목」 규율이 한쪽에서만 고쳐진다(T-18-41).
 *
 * ② 작업대 종목 추가란 = 검색 입력 + 「추가」 버튼**뿐**이다
 *   **거래소 토글이 없다**(D-08) — 새 카드는 KRX 로 시작하고, 등록 전에 카드 헤더 세그먼트에서 바꾼다.
 *   이미 카드가 있는 종목을 고르면 새 카드를 만들지 않고 `onFocusCard` 로 그 카드를 펼친다(돌파 스트립과
 *   같은 규칙).
 *
 * ③ 검색 중·0건·실패는 Phase 16 컴포넌트의 기존 처리 그대로다 — 새 로딩 표면·새 문구가 없다.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { StockDetailResponse } from "@gh-radar/shared";

import { searchStocks } from "@/lib/stock-api";
import { cn } from "@/lib/utils";

/** 검색 디바운스(ms). 타이핑마다 왕복하지 않는다. */
const SEARCH_DELAY_MS = 250;

/** 화면이 다루는 종목 1건. 검색 결과 또는 편집 키에서 만든다. */
export interface SelectedStock {
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
export function isPickable(
  row: StockDetailResponse,
): row is StockDetailResponse & { isin: string } {
  return row.isin !== null && ORDERABLE_MARKETS.includes(row.market);
}

/**
 * 종목 검색 — 종목명 **자리에** in-place 로 뜬다 (quick-260912-mvo Q-05).
 *
 * `onCancel` 은 「고르지 않고 닫는다」다. 이미 고른 종목(`picked`)은 **건드리지 않으므로**
 * 취소해도 종목이 바뀌지 않는다 — 그것이 이 프롭의 존재 이유다.
 * 18-08 — `onCancel` 을 넘기지 않는 상시 입력(작업대 종목 추가란)은 Esc·바깥 blur 에서 **질의를
 * 비운다**(= 결과 목록을 닫는다). 상따 화면은 지금처럼 필드 자체를 닫는 콜백을 넘긴다.
 */
export function StockSearchField({
  focusOnOpen,
  onPick,
  onCancel,
  placeholder = "종목명 또는 코드로 검색",
  ariaLabel = "종목 검색",
  trailing,
}: {
  /** 열릴 때 입력에 포커스를 줄지 — 호출부 주석 참조(눌러서 연 경우에만 true). */
  focusOnOpen: boolean;
  onPick: (stock: SelectedStock) => void;
  onCancel?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  /**
   * 입력 오른쪽 자리(작업대 「추가」 버튼). **래퍼 안**에 그린다 — 밖에 두면 버튼을 누르는 순간
   * 래퍼 `onBlur` 가 「밖으로 나갔다」로 읽어 질의를 비우고, 클릭이 고를 행을 잃는다.
   * `commit` 은 Enter 와 **같은** 경로(활성 행 `pick`)다 — 판정을 두 벌 만들지 않는다.
   */
  trailing?: (ctx: { canCommit: boolean; commit: () => void }) => ReactNode;
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

  /** 취소 — 콜백이 없으면 질의를 비워 목록을 닫는다(위 주석). */
  const cancel = () => {
    if (onCancel) onCancel();
    else setQuery("");
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
          cancel();
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
        if (!e.currentTarget.contains(e.relatedTarget)) cancel();
      }}
    >
      {/* `trailing` 이 없으면 `contents` 라 상따 화면의 배치는 그대로다. */}
      <div className={trailing ? "flex min-w-0 items-center gap-2" : "contents"}>
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={ariaLabel}
        placeholder={placeholder}
        /*
          ★ quick-260912-u58 ① — **`aria-activedescendant` 콤보박스**다. 실제 DOM 포커스는
            입력에 **남는다**. 로밍 tabindex 로 포커스를 항목에 옮기면 래퍼 `onBlur` 의
            「밖으로 나가면 취소」 계약과 싸운다 — 항목으로 옮기는 순간 blur 가 나고, 그
            판정이 조금이라도 어긋나면 고르기 직전에 목록이 사라진다.
          ★ 목록이 **없을 때는 `aria-controls` 를 걸지 않는다.** `<ul>` 은 질의가 비면 아예
            렌더되지 않으므로, 상수 id 를 늘 걸어 두면 존재하지 않는 요소를 가리켜 axe
            `aria-valid-attr-value`(critical)에 걸린다 — 옛 상따 새 전략 화면(지금은 `/trading`
            작업대)은 a11y 스캔 대상이었고 **검색이 열린 채로** 진입했다. `aria-activedescendant` 도
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
          ★ 글꼴은 기본 16px · 마우스 기기(`pointer-fine:`)만 14px 다 (quick-260922-tqr) — iOS
            Safari 포커스 확대 방지. 폭 브레이크포인트가 아니라 포인터로 가르는 이유(iPhone 가로 폭)는
            `components/ui/command.tsx` CommandInput 주석. 16px 도 `h-9` 안에 들어가 위 한 쌍은 그대로다.
        */
        data-focus-ring="seamless"
        className="h-9 w-full min-w-0 rounded-[var(--r-md)] border border-[var(--input)] bg-[var(--bg)] px-2.5 text-[length:var(--t-base)] pointer-fine:text-[length:var(--t-sm)] text-[var(--fg)] focus-visible:border-[var(--ring)]"
      />
      {trailing?.({
        canCommit: activeRow !== null,
        commit: () => {
          if (activeRow) pick(activeRow);
        },
      })}
      </div>
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


/** 종목 추가란 placeholder — UI-SPEC §레이아웃 계약 8 원문. */
export const STOCK_ADD_PLACEHOLDER = "종목 추가 — 종목명 또는 코드";

export interface StockAddBarProps {
  /** 카드가 있는 종목(ISIN). 그 종목을 고르면 `onAdd` 대신 `onFocusCard` 가 불린다. */
  cards: ReadonlySet<string>;
  /** 카드가 없는 종목을 골랐다 — 작업대가 카드를 만든다(KRX · 스위치 전부 OFF). */
  onAdd: (isin: string, name: string, code: string) => void;
  /** 카드가 이미 있는 종목을 골랐다 — 작업대가 그 카드를 펼치고 스크롤한다. */
  onFocusCard: (isin: string) => void;
  className?: string;
}

/**
 * 작업대 종목 추가란 (목업 `.addbar` `:748-751`). 돌파 스트립 바로 아래 · 카드 격자 위에 놓인다.
 *
 * 입력은 상시 마운트이고 포커스를 스스로 가져가지 않는다 — 페이지를 여는 순간 폰 키보드를 띄우지
 * 않는다(quick-260912-ok2 ② 와 같은 규율). 「추가」는 **활성 항목이 있을 때만** 누를 수 있다 —
 * 공란·검색 중·고를 수 있는 결과 0건에서 눌러도 아무 일이 없는 버튼을 두지 않는다.
 */
export function StockAddBar({ cards, onAdd, onFocusCard, className }: StockAddBarProps) {
  const take = (s: SelectedStock) => {
    if (cards.has(s.isin)) {
      onFocusCard(s.isin);
      return;
    }
    onAdd(s.isin, s.name, s.code);
  };

  return (
    <div data-slot="stock-add-bar" className={cn("flex min-w-0 items-center", className)}>
      <StockSearchField
        focusOnOpen={false}
        onPick={take}
        placeholder={STOCK_ADD_PLACEHOLDER}
        ariaLabel="종목 추가 검색"
        trailing={({ canCommit, commit }) => (
          <button
            type="button"
            data-slot="stock-add-submit"
            disabled={!canCommit}
            onClick={commit}
            className="h-9 flex-none rounded-[var(--r)] border border-transparent bg-[var(--primary)] px-3.5 text-[13px] font-semibold whitespace-nowrap text-[var(--primary-fg)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            추가
          </button>
        )}
      />
    </div>
  );
}
