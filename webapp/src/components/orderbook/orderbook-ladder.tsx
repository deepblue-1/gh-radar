'use client';

/**
 * OrderbookLadder — 호가 10단 사다리 (UI-SPEC C4, 확정 L2=A · L3=A).
 *
 * 무엇을 어디에: 호가주문 탭 섹션 그리드의 **중앙(두 번째) 컬럼**(≥900px 380px). 좁은
 * 폭에서는 체결 테이프 바로 아래 두 번째 블록이다(세로 순서 ② — 체결 → 호가 → 주문).
 *
 * 왜 `ui/table.tsx` 가 아니라 전용 `<table>` 인가: 중앙 가격 1열 + 좌우 잔량 + 잔량 바
 * 레이어 + roving tabindex 를 표 primitive 로 표현할 수 없다(UI-SPEC §신규 컴포넌트).
 *
 * ★ LOCKED 색 규칙 (UI-SPEC §Color 열거표 — 이 표에 없으면 쓰지 않는다):
 *   - 가격 열 텍스트 = **기준가(전일종가) 대비** `--up` / `--down` / `--flat`.
 *     급등 종목에서는 20단이 전부 `--up` 이 된다. 이것은 버그가 아니라 정상이며,
 *     **그래서 매도/매수 구분을 색에 의존하면 안 된다** — 구분은 열 위치(좌 매도잔량 /
 *     우 매수잔량) + 열 헤더 + 가격 셀의 `sr-only` 단계 라벨이 담당한다(WCAG 1.4.1).
 *     `매1`~`매10` / `수1`~`수10` 인라인 배지는 **의도적으로 없다** — 행 위치가 곧 단계라
 *     시각 사용자에게 중복 정보이고, 가격 축 좌측을 좁혀 가독성만 깎았다.
 *     스크린리더용 `sr-only` 단계 라벨은 그대로 남는다(제거 대상이 아니다).
 *   - 매도 행 배경 `--down-bg` 65% 틴트 / 매수 행 배경 `--up-bg` 65% 틴트 (국내 HTS 관례).
 *   - 잔량 바 = 매도 `--down` 16% / 매수 `--up` 16%. **숫자는 `--fg` 유지**(바만 틴트).
 *   - accent 토큰(값이 `--down` 과 동일한 파랑)은 **사다리 내부에 절대 쓰지 않는다** —
 *     매도 파랑으로 오독된다(UI-SPEC §토큰 충돌 경보). 포커스 링만 예외로 `--ring` 을 쓴다.
 *
 * ★ 갱신 피드백 규율 (UI-SPEC §실시간 갱신 시각 피드백, T-15-45):
 *   - 변경된 셀에 `background-color` 플래시 1회 ≤150ms. `transform` / 폭 애니메이션 금지.
 *   - **플래시를 큐잉하지 않는다** — 갱신이 겹치면 진행 중 타이머를 즉시 끊고 최신 것만 남긴다.
 *   - 잔량 바 폭은 인라인 style 로 **즉시** 반영한다(전환 효과 없음). 100ms 주기에서
 *     폭 애니메이션은 항상 뒤처진다.
 *   - `prefers-reduced-motion: reduce` → `motion-safe:` 로 플래시 배경 자체를 걸어
 *     감속 선호 사용자에게는 값만 교체된다(`motion-reduce:` 로 전환도 제거).
 *
 * ★ 클릭 타깃 = **행 전체**: 가격 셀만 누르게 두면 표 폭의 1/3 만 반응해서
 *   잔량 숫자를 누른 사용자에게는 "클릭이 안 되는 호가창" 이 된다. 핸들러는 `<tr>` 에 있고
 *   가격 0 인 빈 단계만 무시한다. 키보드 경로(roving tabindex + Enter) 는 그대로다.
 *
 * ★ `체결` 배지도, 스프레드 구분선 행도 없다 (2026-09-07 요청).
 *   현재가 행은 **가격 셀 좌측의 inset 바 하나로만** 표시한다 — 셀이 `text-center` 라
 *   오른쪽에 `체결` 글자를 붙이면 그 행만 가격이 좌측으로 밀려 **틱마다 좌우로 흔들렸다**.
 *   현재가 표시를 다시 넣는다면 반드시 **레이아웃 폭을 차지하지 않는 방식**(배경·테두리·
 *   absolute)이어야 한다. 스프레드/최우선호가는 사다리 상·하단에서 바로 읽힌다.
 *
 * ★ 빈·stale 상태: `quote === null` 이면 빈 상태 문구, 재접속 중(`isStale`)이면
 *   **마지막 값을 유지하고 `opacity:.55` 로 감쇠**한다. 비우지 않는다(문맥 상실 방지).
 *
 * ★ 밀도: 루트에 `data-density="compact"` 를 **명시**한다. globals.css 의 모바일 자동
 *   comfortable 규칙이 `[data-density]:not([data-density="compact"])` 이므로 명시가 곧 방어다.
 *
 * ★ 잔량 열 정렬: 채택 목업(`15-orderbook-mockup.html`)대로 매도잔량은 좌측 / 매수잔량은
 *   우측 정렬이고 바가 중앙 가격 축을 향해 자란다. 숫자·바가 가격 축 기준으로 대칭이라
 *   "어느 쪽에 벽이 있나"를 한 번에 읽는다. `.mono` 고정폭은 두 열 모두 유지한다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ★ Phase 16 — 변형 2종 (`variant`)
 *
 *   `"orderbook"`(기본) : 위에 적은 Phase 15 사다리. **한 글자도 바뀌지 않았다.**
 *   `"chaser"`          : 상따 전용(16-UI-SPEC A11/A11a) — 마커 슬롯 · 등락률 열 ·
 *                         데스크톱 최근 체결 10건 · 좁은 폭 2줄 행. 파일 하단에 있다.
 *
 *   왜 한 파일에 두 트리인가: 「호가 10단을 어떻게 그리는가」는 이 파일의 책임이고, 색·바
 *   정규화·기준가 대비 방향색 같은 **규칙이 공유**된다. 파일을 쪼개면 그 규칙이 두 벌이 되고
 *   한쪽만 고쳐진 채 두 화면이 다른 가격을 다른 색으로 그린다. 대신 **렌더 트리는 섞지
 *   않는다** — 상따 변형은 헤더·푸터·클릭·roving tabindex 가 전부 없어서, 조건문으로 엮으면
 *   어느 쪽을 고쳐도 다른 쪽이 흔들린다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';

import { deriveTapeSides, formatTapeTime } from '@/components/orderbook/trade-tape';
import { cn } from '@/lib/utils';
import type { RelayQuote, RelayTapeEntry } from '@gh-radar/shared';

/** 호가 단계 수 — 계약상 ap/aq/bp/bq 는 길이 10 고정. */
const LEVELS = 10;
/** 좁은 폭 기본 노출 단수(M1). `depth === 5` 일 때 이 단계를 넘는 행이 접힌다. */
const NARROW_STEPS = 5;
/** 셀 플래시 지속 시간 — UI-SPEC 상한 150ms 이내. */
const FLASH_MS = 140;
/** 잔량 바 최소 폭(%) — 0 이 아닌 잔량이 시각적으로 사라지지 않게 한다. */
const BAR_MIN_PCT = 3;
/** 플래시 배경 유틸 — 방향색이 아닌 중립 `--fg` 틴트다(색 의미 오염 방지). */
const FLASH_BG = 'motion-safe:bg-[color-mix(in_oklch,var(--fg)_14%,transparent)]';
/** 배경만 부드럽게 사라지게 한다. 폭·위치는 절대 전환 대상이 아니다. */
const FLASH_FADE =
  'motion-safe:transition-[background-color] motion-safe:duration-150 motion-reduce:transition-none';

const EMPTY_FLASH: ReadonlySet<string> = new Set<string>();

export interface OrderbookLadderProps {
  /** 훅의 `quote`. 스냅샷 전이면 null. */
  quote: RelayQuote | null;
  /**
   * 좁은 폭(<900px) 기본 노출 단수. `5` 면 6~10단이 접히고 `10단 전체 보기` 버튼이 뜬다.
   * **뷰포트 판정은 CSS 가 한다** — JS 는 폭을 측정하지 않는다(UI-SPEC §반응형).
   */
  depth: 5 | 10;
  /** 재접속 중(마지막 수신값 표시). true 면 `opacity:.55` 로 감쇠한다. */
  isStale: boolean;
  /** 기준가(전일 종가). 가격 열 방향색의 기준이다. */
  basePrice: number;
  /**
   * 가격 클릭·Enter 시 호출. **매매 구분을 바꾸지 않는다**(T-15-14).
   * `variant="chaser"` 에서는 **호출되지 않는다** — 상따 사다리의 가격은 클릭 대상이 아니다.
   */
  onPriceClick?: (price: number) => void;
  /**
   * 렌더 변형 (Phase 16 A11/A11a).
   *  - `"orderbook"`(기본) : Phase 15 호가주문 탭 사다리. 아래 3개 prop 을 무시한다.
   *  - `"chaser"`          : 상따 전용 — 마커 슬롯 · 등락률 · 최근 체결 열 · 모바일 2줄 행.
   */
  variant?: 'orderbook' | 'chaser';
  /**
   * 최근 체결(최신이 index 0). `variant="chaser"` **데스크톱**에서만 매수호가 왼쪽 열에
   * 10건이 매수 10단과 1:1 로 정렬돼 그려진다. 좁은 폭에는 렌더하지 않는다(A11a).
   */
  recentTrades?: RelayTapeEntry[];
  /** 상한가. 그 가격 행의 마커 슬롯에 「상」 아이콘이 들어간다. */
  upperLimit?: number;
  className?: string;
}

type LadderSide = 'ask' | 'bid';

interface LadderRow {
  /** 플래시·키보드 식별자. `a0` = 매도 1호가, `b3` = 매수 4호가. */
  key: string;
  side: LadderSide;
  /** 1~10 호가 단계. */
  step: number;
  price: number;
  qty: number;
  /** `NARROW_STEPS` 초과 — 좁은 폭에서 접히는 행. */
  far: boolean;
}

/** 기준가 대비 방향색. 보합(=기준가)과 기준가 부재는 `--flat`. */
function priceTone(price: number, basePrice: number): string {
  if (!basePrice || price === basePrice) return 'text-[var(--flat)]';
  return price > basePrice ? 'text-[var(--up)]' : 'text-[var(--down)]';
}

const KRW = new Intl.NumberFormat('ko-KR');

function fmt(n: number): string {
  return KRW.format(n);
}

/**
 * 잔량 바 폭(%) — **단계 최대값 정규화**(확정 L3=A).
 * 누적(단조 증가)이 아니라 같은 방향 10단 중 최대 잔량 대비 비율이다.
 * 트레이더가 찾는 것은 "어느 단계에 벽이 있나"라는 상대 비교이고, 누적은 벽을 묻는다.
 */
function barPct(qty: number, maxQty: number): number {
  if (qty <= 0 || maxQty <= 0) return 0;
  return Math.max(BAR_MIN_PCT, Math.round((qty / maxQty) * 100));
}

/**
 * 호가 → 행 20개 (매도 10호가→1호가, 매수 1호가→10호가 = **가격 내림차순 20행**).
 *
 * 두 변형이 **같은 함수**를 쓴다. 순서·단계 번호가 갈리면 한쪽 화면의 「매도 3호가」가
 * 다른 화면의 다른 행이 되고, 그 어긋남은 스크린샷으로만 발견된다.
 */
function buildLadderRows(quote: RelayQuote | null): LadderRow[] {
  if (!quote) return [];
  const out: LadderRow[] = [];
  // 매도는 10호가 → 1호가(가격 내림차순)로 위에서 아래로 쌓인다.
  for (let i = LEVELS - 1; i >= 0; i -= 1) {
    out.push({
      key: `a${i}`,
      side: 'ask',
      step: i + 1,
      price: quote.ap[i] ?? 0,
      qty: quote.aq[i] ?? 0,
      far: i + 1 > NARROW_STEPS,
    });
  }
  // 매수는 1호가 → 10호가(가격 내림차순).
  for (let i = 0; i < LEVELS; i += 1) {
    out.push({
      key: `b${i}`,
      side: 'bid',
      step: i + 1,
      price: quote.bp[i] ?? 0,
      qty: quote.bq[i] ?? 0,
      far: i + 1 > NARROW_STEPS,
    });
  }
  return out;
}

/**
 * 변형 분기 — `variant` 는 런타임에 바뀌지 않는다(표면마다 고정).
 * 두 트리를 한 컴포넌트에 섞지 않는 이유: 상따 변형은 헤더·푸터·클릭·roving tabindex 가
 * **전부 없고** 열 구성도 다르다. 조건문으로 엮으면 어느 쪽을 고쳐도 다른 쪽이 흔들린다.
 */
export function OrderbookLadder(props: OrderbookLadderProps) {
  if (props.variant === 'chaser') return <ChaserLadder {...props} />;
  return <StandardLadder {...props} />;
}

function StandardLadder({
  quote,
  depth,
  isStale,
  basePrice,
  onPriceClick,
  className,
}: OrderbookLadderProps) {
  // 좁은 폭 펼침. 데스크톱에서는 CSS 가 far 행을 애초에 숨기지 않으므로 무의미하다.
  const [expanded, setExpanded] = useState(false);
  // roving tabindex 의 현재 행 — 사다리 전체가 tab stop 1개다(UI-SPEC §키보드 접근성).
  const [activeIndex, setActiveIndex] = useState(0);
  const [flash, setFlash] = useState<ReadonlySet<string>>(EMPTY_FLASH);
  const prevQuoteRef = useRef<RelayQuote | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rows = useMemo<LadderRow[]>(() => buildLadderRows(quote), [quote]);

  const maxAsk = useMemo(() => (quote ? Math.max(0, ...quote.aq) : 0), [quote]);
  const maxBid = useMemo(() => (quote ? Math.max(0, ...quote.bq) : 0), [quote]);

  /**
   * 변경 셀 플래시. 첫 스냅샷은 플래시하지 않는다(전체가 "변경"으로 보여 무의미하다).
   * 큐잉 금지 — 진행 중이던 타이머를 끊고 최신 변경분만 남긴다.
   */
  useEffect(() => {
    if (!quote) {
      prevQuoteRef.current = null;
      return;
    }
    const prev = prevQuoteRef.current;
    prevQuoteRef.current = quote;
    if (!prev) return;

    const changed = new Set<string>();
    for (let i = 0; i < LEVELS; i += 1) {
      if (prev.ap[i] !== quote.ap[i]) changed.add(`a${i}:p`);
      if (prev.aq[i] !== quote.aq[i]) changed.add(`a${i}:q`);
      if (prev.bp[i] !== quote.bp[i]) changed.add(`b${i}:p`);
      if (prev.bq[i] !== quote.bq[i]) changed.add(`b${i}:q`);
    }
    if (changed.size === 0) return;

    if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
    setFlash(changed);
    flashTimerRef.current = setTimeout(() => {
      flashTimerRef.current = null;
      setFlash(EMPTY_FLASH);
    }, FLASH_MS);
  }, [quote]);

  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTableElement>) => {
      if (rows.length === 0) return;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
          return;
        case 'ArrowUp':
          event.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          return;
        case 'Home':
          event.preventDefault();
          setActiveIndex(0);
          return;
        case 'End':
          event.preventDefault();
          setActiveIndex(rows.length - 1);
          return;
        case 'Enter':
        case ' ': {
          const row = rows[activeIndex];
          if (!row || row.price <= 0) return;
          event.preventDefault();
          onPriceClick?.(row.price);
          return;
        }
        default:
      }
    },
    [rows, activeIndex, onPriceClick],
  );

  if (!quote) {
    return (
      <div
        data-density="compact"
        data-slot="orderbook-ladder"
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-5)] text-center',
          className,
        )}
      >
        <p className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          호가 정보가 없어요
        </p>
        <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          장 시작(09:00) 이후 실시간 호가가 표시돼요.
        </p>
      </div>
    );
  }

  const collapsed = depth === NARROW_STEPS && !expanded;

  const body: ReactNode[] = [];
  rows.forEach((row, index) => {
    const isAsk = row.side === 'ask';
    const isNow = quote.p > 0 && row.price === quote.p;
    const pct = barPct(row.qty, isAsk ? maxAsk : maxBid);
    const priceFlash = flash.has(`${row.key}:p`);
    const qtyFlash = flash.has(`${row.key}:q`);

    body.push(
      <tr
        key={row.key}
        id={`ladder-row-${row.key}`}
        data-side={row.side}
        data-active={index === activeIndex ? 'true' : undefined}
        onClick={() => {
          if (row.price <= 0) return;
          setActiveIndex(index);
          onPriceClick?.(row.price);
        }}
        className={cn(
          'cursor-pointer',
          '[&>*]:h-[var(--row-h)] [&>*]:overflow-hidden [&>*]:whitespace-nowrap [&>*]:align-middle [&>*]:text-[length:var(--t-caption)]',
          isAsk
            ? '[&>*]:bg-[color-mix(in_oklch,var(--down-bg)_65%,transparent)]'
            : '[&>*]:bg-[color-mix(in_oklch,var(--up-bg)_65%,transparent)]',
          // 행 전체 hover — `&:hover > *` 가 `& > *` 보다 우선하므로 방향 틴트를 덮는다.
          'hover:[&>*]:bg-[color-mix(in_oklch,var(--muted)_70%,transparent)]',
          collapsed && row.far && 'max-[899px]:hidden',
          index === activeIndex &&
            'outline outline-2 -outline-offset-2 outline-[var(--ring)]',
        )}
      >
        {/* 매도잔량 — 바는 우측(가격 축)에서 자라고 숫자는 좌측에 붙는다. */}
        <td
          className={cn(
            'relative overflow-hidden px-[var(--s-2)]',
            FLASH_FADE,
            isAsk && qtyFlash && FLASH_BG,
          )}
        >
          {isAsk && pct > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1 bottom-1 right-0 z-0 rounded-[2px] bg-[color-mix(in_oklch,var(--down)_16%,transparent)]"
              style={{ width: `${pct}%` }}
            />
          )}
          <span className="mono relative z-[1] block text-left text-[var(--fg)]">
            {isAsk && row.qty > 0 ? fmt(row.qty) : ''}
          </span>
        </td>

        {/* 가격 — 중앙 정렬(좌우 잔량 열과 축을 맞추는 유일한 예외). */}
        <th
          scope="row"
          className={cn(
            'mono px-[var(--s-2)] text-center text-[length:var(--t-sm)] font-semibold',
            FLASH_FADE,
            priceTone(row.price, basePrice),
            isNow && 'shadow-[inset_3px_0_0_var(--fg)]',
            priceFlash && FLASH_BG,
          )}
        >
          {/* 색 비의존(WCAG 1.4.1) — 스크린리더는 단계 라벨로 매도/매수를 안다. */}
          <span className="sr-only">
            {isAsk ? '매도' : '매수'} {row.step}호가{' '}
          </span>
          {row.price > 0 ? fmt(row.price) : '—'}
        </th>

        {/* 매수잔량 — 바는 좌측(가격 축)에서 자라고 숫자는 우측에 붙는다. */}
        <td
          className={cn(
            'relative overflow-hidden px-[var(--s-2)]',
            FLASH_FADE,
            !isAsk && qtyFlash && FLASH_BG,
          )}
        >
          {!isAsk && pct > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1 bottom-1 left-0 z-0 rounded-[2px] bg-[color-mix(in_oklch,var(--up)_16%,transparent)]"
              style={{ width: `${pct}%` }}
            />
          )}
          <span className="mono relative z-[1] block text-right text-[var(--fg)]">
            {!isAsk && row.qty > 0 ? fmt(row.qty) : ''}
          </span>
        </td>
      </tr>,
    );
  });

  return (
    <div
      data-density="compact"
      data-slot="orderbook-ladder"
      data-stale={isStale ? 'true' : undefined}
      className={cn('flex flex-col', isStale && 'opacity-[.55]', className)}
    >
      <table
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="호가 10단 (매도 10단계 · 매수 10단계)"
        aria-activedescendant={
          rows[activeIndex] ? `ladder-row-${rows[activeIndex].key}` : undefined
        }
        className="w-full table-fixed border-collapse"
      >
        {/*
          열 폭을 **비율로 고정**한다. 지정하지 않으면 3등분이라 14px 가격(`272,000`)이
          12px 잔량(`205,383`)과 같은 폭을 받아 좁은 폭에서 먼저 넘친다. 가격 축이 조금
          더 넓어야 사다리가 읽힌다. 셀은 전부 `whitespace-nowrap` — 폭이 모자라면
          줄바꿈으로 행 높이를 무너뜨리는 대신 셀 안에서 잘린다.
        */}
        <colgroup>
          <col className="w-[33%]" />
          <col className="w-[34%]" />
          <col className="w-[33%]" />
        </colgroup>
        <thead>
          <tr>
            <th
              scope="col"
              className="border-b border-[var(--border)] bg-[var(--muted)] px-[var(--s-2)] py-1.5 text-center text-[11px] font-semibold text-[var(--muted-fg)]"
            >
              매도잔량
            </th>
            <th
              scope="col"
              className="border-b border-[var(--border)] bg-[var(--muted)] px-[var(--s-2)] py-1.5 text-center text-[11px] font-semibold text-[var(--muted-fg)]"
            >
              가격
            </th>
            <th
              scope="col"
              className="border-b border-[var(--border)] bg-[var(--muted)] px-[var(--s-2)] py-1.5 text-center text-[11px] font-semibold text-[var(--muted-fg)]"
            >
              매수잔량
            </th>
          </tr>
        </thead>
        <tbody className="[&>tr+tr>*]:border-t [&>tr+tr>*]:border-[var(--border-subtle)]">
          {body}
        </tbody>
        <tfoot>
          <tr>
            <td className="mono h-7 border-t border-[var(--border)] bg-[var(--muted)] px-[var(--s-2)] text-center text-[11px] font-semibold">
              {fmt(quote.ta)}
            </td>
            <th
              scope="row"
              className="h-7 border-t border-[var(--border)] bg-[var(--muted)] px-[var(--s-2)] text-center text-[11px] font-semibold text-[var(--muted-fg)]"
            >
              총잔량
            </th>
            <td className="mono h-7 border-t border-[var(--border)] bg-[var(--muted)] px-[var(--s-2)] text-center text-[11px] font-semibold">
              {fmt(quote.tb)}
            </td>
          </tr>
        </tfoot>
      </table>

      {collapsed && (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
          className="hidden h-8 w-full border-t border-[var(--border)] bg-[var(--card)] text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)] hover:bg-[var(--muted)] max-[899px]:block"
        >
          10단 전체 보기
        </button>
      )}
    </div>
  );
}

/* ═════════════════════ 상따 변형 (Phase 16 A11 · A11a) ═════════════════════ */

/**
 * 마커 슬롯 한 변(px) — **모든 행에 존재하는 고정폭**이다(16-UI-SPEC §컴포넌트 고유 치수).
 *
 * ★ 이 값이 이 변형의 안전장치다. 마커(「상」 아이콘 · 최근 체결 도트)를 조건부로만 넣고
 *   슬롯을 비우지 않으면, 마커가 붙고 떨어질 때마다 가격이 좌우로 밀린다. 틱마다 흔들리는
 *   가격은 **사용자가 잘못된 가격을 읽게 만든다**(T-16-05 · `tasks/lessons.md` 등재 함정 —
 *   Phase 15 에서 `체결` 배지를 걷어낸 것과 같은 사고다).
 *   폭을 인라인 style 로 박는 이유는 그 규칙을 테스트가 **계산된 값으로** 단언할 수 있게
 *   하기 위해서다(클래스만이면 jsdom 에서 폭이 0 이라 아무것도 못 잡는다).
 */
const MARKER_SLOT_PX = 16;

/**
 * 등락률 열 최소폭(px). `-29.0` ~ `29.0` 을 오가도 가격 열이 밀리지 않는다.
 * 슬롯과 같은 이유로 인라인 style 이다.
 */
const PCT_MIN_WIDTH_PX = 40;

/** 데스크톱 최근 체결 렌더 건수 — 매수 10단과 1:1 이므로 10 고정이다. */
const RECENT_TRADE_ROWS = LEVELS;

/**
 * 기준가 대비 등락률 문자열 — **소수 1자리 · `%` 없음 · 양수 부호 없음**(A11).
 * 기준가가 없거나 0 이면 빈 문자열이다(0.0 을 지어내지 않는다).
 */
export function ladderPctText(price: number, basePrice: number): string {
  if (!(basePrice > 0) || !(price > 0)) return '';
  return (((price - basePrice) / basePrice) * 100).toFixed(1);
}

/** 마커 슬롯 1개. 마커가 없어도 **폭을 차지한다** — 그것이 이 조각의 존재 이유다. */
function MarkerSlot({ kind }: { kind: 'upper' | 'trade' | 'none' }) {
  return (
    <span
      data-slot="ladder-marker"
      data-marker={kind}
      className="flex flex-none items-center justify-center"
      style={{ width: MARKER_SLOT_PX, height: MARKER_SLOT_PX }}
    >
      {kind === 'upper' && (
        <span
          role="img"
          aria-label="상한가"
          className="block size-4 rounded-[3px] bg-[var(--up)] text-center text-[11px] leading-4 font-semibold text-[var(--destructive-fg)]"
        >
          상
        </span>
      )}
      {kind === 'trade' && (
        <span
          role="img"
          aria-label="최근 체결가"
          className="block size-[6px] rounded-full bg-[var(--fg)]"
        />
      )}
    </span>
  );
}

/**
 * 범례 1줄. 좁은 폭에는 최근 체결 열이 없으므로 마지막 항목(`체결 수량`)을 뺀다.
 * 색 비의존(WCAG 1.4.1) — 사다리의 색이 무엇을 뜻하는지 **텍스트로** 말하는 유일한 자리다.
 */
function LadderLegend({ withTrades }: { withTrades: boolean }) {
  return (
    <div
      data-slot="ladder-legend"
      className="mt-[var(--s-2)] flex flex-wrap items-center gap-1 text-[11px] text-[var(--muted-fg)]"
    >
      <span aria-hidden="true" className="block size-[6px] rounded-full bg-[var(--fg)]" />
      최근 체결가
      <span aria-hidden="true" className="opacity-50">
        ·
      </span>
      <span
        aria-hidden="true"
        className="block size-4 rounded-[3px] bg-[var(--up)] text-center text-[11px] leading-4 font-semibold text-[var(--destructive-fg)]"
      >
        상
      </span>
      상한가
      {withTrades && (
        <>
          <span aria-hidden="true" className="opacity-50">
            ·
          </span>
          체결 수량 <b className="font-semibold text-[var(--up)]">매수</b>/
          <b className="font-semibold text-[var(--down)]">매도</b>
        </>
      )}
    </div>
  );
}

/** 마커 종류 판정 — 상한가가 최근 체결가보다 우선한다(상한가는 이 화면의 최상위 정보다). */
function markerOf(
  price: number,
  upperLimit: number,
  lastTradePrice: number,
): 'upper' | 'trade' | 'none' {
  if (upperLimit > 0 && price === upperLimit) return 'upper';
  if (lastTradePrice > 0 && price === lastTradePrice) return 'trade';
  return 'none';
}

/**
 * 상따 사다리 — 매도 10단 / 「체결」 헤더 / 매수 10단.
 *
 * ★ 가격은 **클릭 대상이 아니다**(A11). 비교가격 자동 채움이 없어졌으므로 클릭 핸들러도
 *   roving tabindex 도 두지 않는다 — 눌러도 아무 일이 없는 커서는 「고장난 화면」이다.
 * ★ 데스크톱(≥1280)과 좁은 폭은 **다른 트리**다. 좁은 폭에는 최근 체결 열이 없고 행이
 *   2줄(가격 + 등락률)이며 400px 독립 스크롤 + 현재가 중앙 초기 스크롤을 갖는다(R7).
 *   숨김은 Tailwind `hidden`(=`display:none`)이라 **접근성 트리에서도 빠진다** — 같은
 *   사다리가 스크린리더에 두 번 읽히지 않는다.
 */
function ChaserLadder({
  quote,
  isStale,
  basePrice,
  recentTrades = [],
  upperLimit = 0,
  className,
}: OrderbookLadderProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentRowRef = useRef<HTMLLIElement | null>(null);
  /** 최초 마운트 1회만 중앙 정렬한다 — 갱신마다 되돌리면 사용자의 스크롤을 빼앗는다(R7). */
  const centeredRef = useRef(false);

  const rows = useMemo<LadderRow[]>(() => buildLadderRows(quote), [quote]);
  const maxAsk = useMemo(() => (quote ? Math.max(0, ...quote.aq) : 0), [quote]);
  const maxBid = useMemo(() => (quote ? Math.max(0, ...quote.bq) : 0), [quote]);

  /** 체결 방향 — `trade-tape.tsx` 의 판정을 그대로 쓴다(두 표면이 다른 방향을 말하지 않게). */
  const tradeSides = useMemo(
    () => deriveTapeSides(recentTrades, quote?.ap[0], quote?.bp[0]),
    [recentTrades, quote],
  );

  useEffect(() => {
    if (centeredRef.current) return;
    const box = scrollRef.current;
    const row = currentRowRef.current;
    if (box === null || row === null) return;
    centeredRef.current = true;
    box.scrollTop = Math.max(0, row.offsetTop - box.clientHeight / 2 + row.offsetHeight / 2);
  }, [rows]);

  if (quote === null) {
    return (
      <div
        data-density="compact"
        data-slot="orderbook-ladder"
        data-variant="chaser"
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-5)] text-center',
          className,
        )}
      >
        <p className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          호가 정보가 없어요
        </p>
        <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          장 시작(09:00) 이후 실시간 호가가 표시돼요.
        </p>
      </div>
    );
  }

  const lastTradePrice = recentTrades[0]?.p ?? quote.p;
  const asks = rows.filter((r) => r.side === 'ask');
  const bids = rows.filter((r) => r.side === 'bid');

  /** 가격 셀 — 마커 슬롯 · 가격 · 등락률. 세 조각의 폭 규칙이 곧 「흔들리지 않는 사다리」다. */
  const priceCell = (row: LadderRow) => (
    <th
      scope="row"
      data-slot="ladder-price-cell"
      className="h-6 overflow-hidden px-1 align-middle font-normal"
    >
      <div
        className={cn(
          'flex min-w-0 items-center gap-1 rounded-[4px]',
          quote.p > 0 && row.price === quote.p && 'outline outline-1 outline-[var(--fg)]',
        )}
      >
        <MarkerSlot kind={markerOf(row.price, upperLimit, lastTradePrice)} />
        {/* 색 비의존 — 스크린리더는 단계 라벨로 매도/매수를 안다(표준 변형과 같은 규약). */}
        <span className="sr-only">
          {row.side === 'ask' ? '매도' : '매수'} {row.step}호가{' '}
        </span>
        <span
          className={cn(
            'mono min-w-0 flex-1 truncate text-right text-[length:var(--t-caption)] font-semibold',
            priceTone(row.price, basePrice),
          )}
        >
          {row.price > 0 ? fmt(row.price) : '—'}
        </span>
        {/*
          10px 은 16-UI-SPEC T3 이 허용한 **정확히 2곳** 중 하나다(ⓑ 호가 등락률).
          다른 어떤 표면에도 10px 을 쓰지 않는다.
        */}
        <span
          data-slot="ladder-pct"
          className="mono flex-none text-right text-[10px] text-[var(--muted-fg)]"
          style={{ minWidth: PCT_MIN_WIDTH_PX }}
        >
          {ladderPctText(row.price, basePrice)}
        </span>
      </div>
    </th>
  );

  return (
    <div
      data-density="compact"
      data-slot="orderbook-ladder"
      data-variant="chaser"
      data-stale={isStale ? 'true' : undefined}
      className={cn('flex min-w-0 flex-col', isStale && 'opacity-[.55]', className)}
    >
      {/* ── 데스크톱(≥1280) — 434px 표 · 24px 행 · 최근 체결 10건 ── */}
      <div className="hidden min-[1280px]:block">
        <table
          aria-label="호가 10단 (매도 10단계 · 매수 10단계) 및 최근 체결 10건"
          className="mono w-full table-fixed border-collapse text-[length:var(--t-caption)]"
        >
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[32%]" />
            <col className="w-[34%]" />
          </colgroup>
          <tbody>
            {asks.map((row) => {
              const pct = barPct(row.qty, maxAsk);
              return (
                <tr key={row.key} data-side="ask" data-slot="ladder-row">
                  <td className="relative h-6 overflow-hidden px-1.5 py-0.5 align-middle">
                    {pct > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1 right-0 bottom-1 z-0 rounded-[2px] bg-[color-mix(in_oklch,var(--down)_16%,transparent)]"
                        style={{ width: `${pct}%` }}
                      />
                    )}
                    <span className="relative z-[1] block truncate text-right text-[var(--fg)]">
                      {row.qty > 0 ? fmt(row.qty) : ''}
                    </span>
                  </td>
                  {priceCell(row)}
                  <td className="h-6" />
                </tr>
              );
            })}

            {/* 「체결」 헤더 행 — 20px, 상단 hairline. 최근 체결 열의 시작을 알린다. */}
            <tr data-slot="ladder-fill-head">
              <td className="h-5 border-t border-[var(--border)] px-1.5 font-sans text-[11px] font-semibold text-[var(--muted-fg)]">
                체결
              </td>
              <td className="h-5 border-t border-[var(--border)]" />
              <td className="h-5 border-t border-[var(--border)]" />
            </tr>

            {bids.map((row, i) => {
              const pct = barPct(row.qty, maxBid);
              const trade = i < RECENT_TRADE_ROWS ? recentTrades[i] : undefined;
              const buySide = tradeSides[i] === 'B';
              return (
                <tr key={row.key} data-side="bid" data-slot="ladder-row">
                  {/* 최근 체결 1건 — 시각(10px) · 체결가(중립) · 체결량(방향색). */}
                  <td
                    data-slot="ladder-fill-cell"
                    className="h-6 overflow-hidden p-1 align-middle text-[11px] tracking-[-0.03em]"
                  >
                    {trade !== undefined && (
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="flex-none text-[10px] text-[var(--muted-fg)]">
                          {formatTapeTime(trade.t)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-right font-semibold text-[var(--fg)]">
                          {fmt(trade.p)}
                        </span>
                        <span
                          title={buySide ? '매수 체결' : '매도 체결'}
                          className={cn(
                            'flex-none text-right font-semibold',
                            buySide ? 'text-[var(--up)]' : 'text-[var(--down)]',
                          )}
                          style={{ minWidth: 36 }}
                        >
                          <span className="sr-only">{buySide ? '매수' : '매도'} </span>
                          {fmt(trade.q)}
                        </span>
                      </div>
                    )}
                  </td>
                  {priceCell(row)}
                  <td className="relative h-6 overflow-hidden px-1.5 py-0.5 align-middle">
                    {pct > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1 bottom-1 left-0 z-0 rounded-[2px] bg-[color-mix(in_oklch,var(--up)_16%,transparent)]"
                        style={{ width: `${pct}%` }}
                      />
                    )}
                    <span className="relative z-[1] block truncate text-left text-[var(--fg)]">
                      {row.qty > 0 ? fmt(row.qty) : ''}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <LadderLegend withTrades />
      </div>

      {/* ── 좁은 폭(<1280) — 32px 2줄 행 · 400px 독립 스크롤 · 현재가 중앙 초기 스크롤 ── */}
      <div className="min-[1280px]:hidden">
        <div
          ref={scrollRef}
          data-slot="ladder-scroll"
          className="relative h-[400px] overflow-x-hidden overflow-y-auto"
        >
          <ul
            aria-label="호가 10단 (매도 10단계 · 매수 10단계)"
            className="m-0 flex list-none flex-col p-0"
          >
            {rows.map((row) => {
              const isAsk = row.side === 'ask';
              const pct = barPct(row.qty, isAsk ? maxAsk : maxBid);
              const isNow = quote.p > 0 && row.price === quote.p;
              return (
                <li
                  key={row.key}
                  ref={isNow ? currentRowRef : undefined}
                  data-side={row.side}
                  data-slot="ladder-row-mobile"
                  className={cn(
                    'relative flex h-8 min-w-0 items-center gap-1 rounded-[4px] px-1',
                    isNow && 'outline outline-1 outline-[var(--fg)]',
                  )}
                >
                  {pct > 0 && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute top-0.5 right-0 bottom-0.5 z-0 rounded-[3px]',
                        isAsk
                          ? 'bg-[color-mix(in_oklch,var(--down)_16%,transparent)]'
                          : 'bg-[color-mix(in_oklch,var(--up)_16%,transparent)]',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  )}
                  <MarkerSlot kind={markerOf(row.price, upperLimit, lastTradePrice)} />
                  <span className="sr-only">
                    {isAsk ? '매도' : '매수'} {row.step}호가{' '}
                  </span>
                  <span className="relative z-[1] flex min-w-0 flex-col leading-[1.2]">
                    <b
                      className={cn(
                        'mono truncate text-[12px] font-semibold',
                        priceTone(row.price, basePrice),
                      )}
                    >
                      {row.price > 0 ? fmt(row.price) : '—'}
                    </b>
                    {/* 10px 예외 ⓑ — 데스크톱 등락률과 같은 자리다(T3). */}
                    <span
                      data-slot="ladder-pct"
                      className="mono text-[10px] text-[var(--muted-fg)]"
                      style={{ minWidth: PCT_MIN_WIDTH_PX }}
                    >
                      {ladderPctText(row.price, basePrice)}
                    </span>
                  </span>
                  <span className="mono relative z-[1] ml-auto flex-none text-right text-[11px] text-[var(--fg)]">
                    {row.qty > 0 ? fmt(row.qty) : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <LadderLegend withTrades={false} />
      </div>
    </div>
  );
}
