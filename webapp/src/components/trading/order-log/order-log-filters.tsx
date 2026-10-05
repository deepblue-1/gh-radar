'use client';

/**
 * OrderLogFilters — 주문로그 필터줄 (Phase 25-07 · UI-SPEC ②-1 · 채택 목업 `.filters` `.sel` `.sel.on`).
 *
 * 순서: 종목 → 거래소 → 구분 → 「상한가 특징」 체크 → N건 → (여백) → 창 분리 ↗. 계좌 칩은 없다(결정 1-A — 범위는 상태줄 계좌).
 *
 * - 「상한가 특징」 체크(Phase 28 D-07 · UI-SPEC ②-1) = `OrderLogLimitFeatureCheck` — 세 표면(공용 패널 · 카드 주문로그
 *   팝업 · 창 분리)이 같은 컴포넌트다. 네이티브 체크박스 · 기본 꺼짐 · 켜짐이면 Accent 자리 1 · 화살표 없음. 값은 피드
 *   (`OrderLogFeed.showLimitFeature`)가 들고 pref 로 기억한다 — 이 컴포넌트는 그리기만 한다.
 *
 * - 칩 = `<label>` 로 감싼 **네이티브 `<select>`**(R12 — shadcn Select 미설치 · 새 컴포넌트 0). 모바일 네이티브 피커 ·
 *   키보드 · 스크린리더가 공짜다. 이름은 select 의 `aria-label`(「종목」「거래소」「구분」) — label 안 텍스트에 선택값이
 *   섞여 이름이 흔들리지 않게.
 * - 「전체」 가 아닌 칩만 `data-on`(테두리 `--primary` · 면 `--accent` · 글자 `--accent-fg` — Accent 전용 자리 9).
 * - 필터줄은 `flex-wrap` — 좁으면 칩이 다음 줄로 내려가고 잘리지 않는다. 칩 라벨은 nowrap.
 * - 창 분리 버튼은 앱 셸에서 숨긴다 — `native:hidden`(CSS · 첫 페인트) + `isNativeApp()`(JS) 이중 안전.
 *   공용 패널 자체도 앱에서 숨지만(21 D-25a) 창 분리 창이 앱 WebView 에 열리면 안 된다.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { isNativeApp } from '@/lib/native/native-detect';
import {
  ORDER_LOG_EXCHANGE_FILTERS,
  ORDER_LOG_KIND_FILTERS,
  type OrderLogExchangeFilter,
  type OrderLogFilters as OrderLogFilterValue,
  type OrderLogKindFilter,
} from '@/lib/order-log-feed';
import { cn } from '@/lib/utils';

export interface OrderLogFiltersProps {
  filters: OrderLogFilterValue;
  onChange: (next: OrderLogFilterValue) => void;
  /** 그날 범위 안 종목(가나다순) — 「전체」 는 이 컴포넌트가 앞에 붙인다. */
  stockOptions: ReadonlyArray<{ value: string; label: string }>;
  /** 필터 뒤 줄 수. */
  count: number;
  /** 창 분리 — 없으면 버튼 없음(창 분리 페이지 자신). */
  onPopout?: () => void;
  /** 「상한가 특징」 체크(Phase 28 D-07) — 피드 `showLimitFeature`. */
  showLimitFeature: boolean;
  onShowLimitFeatureChange: (next: boolean) => void;
}

/**
 * 「상한가 특징」 체크 칩 (Phase 28 D-07 · UI-SPEC ②-1 · 접근성 계약) — `<label>` 안 네이티브 체크박스라 이름이
 * 「상한가 특징」 이고 Space 로 토글된다. 칩 외형은 `Chip` 과 같은 높이(EX-3 `py-0.5`) · 11px · nowrap · 화살표 없음.
 * 켜짐 = Accent 자리 1(테두리 `--primary` · 면 `--accent` · 글자 `--accent-fg`) · 체크 색 `accent-color: var(--primary)`(R-10).
 */
export function OrderLogLimitFeatureCheck({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      data-slot="order-log-check-limit-feature"
      data-on={checked ? '' : undefined}
      className={cn(
        'inline-flex flex-none cursor-pointer items-center gap-1 rounded-[var(--r-sm)] border px-2 py-0.5 text-[11px] leading-[1.5] font-normal whitespace-nowrap',
        checked
          ? 'border-[var(--primary)] bg-[var(--accent)] text-[var(--accent-fg)]'
          : 'border-[var(--border-subtle)] bg-transparent text-[var(--fg)]',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="m-0 size-3 flex-none cursor-pointer accent-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
      />
      상한가 특징
    </label>
  );
}

function Chip({ name, on, children }: { name: string; on: boolean; children: ReactNode }) {
  return (
    <label
      data-slot="order-log-chip"
      data-on={on ? '' : undefined}
      className={cn(
        'relative inline-flex flex-none cursor-pointer items-center gap-1 rounded-[var(--r-sm)] border px-2 py-0.5 whitespace-nowrap',
        on
          ? 'border-[var(--primary)] bg-[var(--accent)] text-[var(--accent-fg)]'
          : 'border-[var(--border-subtle)] bg-transparent text-[var(--fg)]',
      )}
    >
      <span aria-hidden="true">{name}</span>
      {children}
      <span aria-hidden="true" className="text-[9px] text-[var(--faint)]">
        ▾
      </span>
    </label>
  );
}

/** select 는 칩 글자와 같은 모양으로 — 기본 테두리 · 화살표를 지우고 글꼴을 물려받는다. */
const SELECT_CLASS =
  'cursor-pointer appearance-none border-0 bg-transparent p-0 [font:inherit] text-inherit';

export function OrderLogFilters({
  filters,
  onChange,
  stockOptions,
  count,
  onPopout,
  showLimitFeature,
  onShowLimitFeatureChange,
}: OrderLogFiltersProps) {
  // 앱 셸 판정은 마운트 뒤에 — SSR(false)과 첫 클라이언트 렌더를 맞춘다. 첫 페인트는 `native:hidden` 이 가린다.
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);
  const showPopout = onPopout !== undefined && !native;
  return (
    <div
      data-slot="order-log-filters"
      className="flex min-w-0 flex-wrap items-center gap-1.5 border-b border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] leading-[1.5] text-[var(--muted-fg)]"
    >
      <Chip name="종목" on={filters.stock !== 'all'}>
        <select
          aria-label="종목"
          value={filters.stock}
          onChange={(e) => onChange({ ...filters, stock: e.target.value })}
          className={cn(SELECT_CLASS, 'max-w-[12em] truncate')}
        >
          <option value="all">전체</option>
          {stockOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Chip>
      <Chip name="거래소" on={filters.ex !== 'all'}>
        <select
          aria-label="거래소"
          value={filters.ex}
          onChange={(e) => onChange({ ...filters, ex: e.target.value as OrderLogExchangeFilter })}
          className={SELECT_CLASS}
        >
          {ORDER_LOG_EXCHANGE_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Chip>
      <Chip name="구분" on={filters.kind !== 'all'}>
        <select
          aria-label="구분"
          value={filters.kind}
          onChange={(e) => onChange({ ...filters, kind: e.target.value as OrderLogKindFilter })}
          className={SELECT_CLASS}
        >
          {ORDER_LOG_KIND_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Chip>
      <OrderLogLimitFeatureCheck checked={showLimitFeature} onChange={onShowLimitFeatureChange} />
      <span data-slot="order-log-count" className="mono flex-none text-[var(--faint)]">
        {count}건
      </span>
      {showPopout && (
        <button
          type="button"
          data-slot="order-log-popout"
          aria-label="주문로그 새 창으로 열기"
          onClick={onPopout}
          className="native:hidden ml-auto inline-flex flex-none items-center whitespace-nowrap text-[var(--muted-fg)] hover:text-[var(--fg)]"
        >
          창 분리 ↗
        </button>
      )}
    </div>
  );
}
