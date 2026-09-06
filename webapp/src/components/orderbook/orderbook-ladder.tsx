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
 * ★ 빈·stale 상태: `quote === null` 이면 빈 상태 문구, 재접속 중(`isStale`)이면
 *   **마지막 값을 유지하고 `opacity:.55` 로 감쇠**한다. 비우지 않는다(문맥 상실 방지).
 *
 * ★ 밀도: 루트에 `data-density="compact"` 를 **명시**한다. globals.css 의 모바일 자동
 *   comfortable 규칙이 `[data-density]:not([data-density="compact"])` 이므로 명시가 곧 방어다.
 *
 * ★ 잔량 열 정렬: 채택 목업(`15-orderbook-mockup.html`)대로 매도잔량은 좌측 / 매수잔량은
 *   우측 정렬이고 바가 중앙 가격 축을 향해 자란다. 숫자·바가 가격 축 기준으로 대칭이라
 *   "어느 쪽에 벽이 있나"를 한 번에 읽는다. `.mono` 고정폭은 두 열 모두 유지한다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { RelayQuote } from '@gh-radar/shared';

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
  /** 가격 클릭·Enter 시 호출. **매매 구분을 바꾸지 않는다**(T-15-14). */
  onPriceClick: (price: number) => void;
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

export function OrderbookLadder({
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

  const rows = useMemo<LadderRow[]>(() => {
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
  }, [quote]);

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
          onPriceClick(row.price);
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
  const bestAsk = quote.ap[0] ?? 0;
  const bestBid = quote.bp[0] ?? 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadPct = bestBid > 0 ? (spread / bestBid) * 100 : 0;

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
          onPriceClick(row.price);
        }}
        className={cn(
          'cursor-pointer',
          '[&>*]:h-[var(--row-h)] [&>*]:align-middle [&>*]:text-[length:var(--t-caption)]',
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
          {isNow && (
            <span className="ml-1 align-[1px] text-[11px] font-semibold text-[var(--muted-fg)]">
              체결
            </span>
          )}
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

    // 매도 1호가 바로 다음에 스프레드 구분선 — 현재가 행과 함께 1차 시각 앵커를 이룬다.
    if (row.key === 'a0') {
      body.push(
        <tr key="spread" data-slot="orderbook-spread">
          <td
            colSpan={3}
            className="h-[26px] border-y border-[var(--border)] bg-[var(--card)] text-center text-[11px] text-[var(--muted-fg)]"
          >
            스프레드 {fmt(spread)}원 · {spreadPct.toFixed(2)}% | 매도1 {fmt(bestAsk)} · 매수1{' '}
            {fmt(bestBid)}
          </td>
        </tr>,
      );
    }
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
