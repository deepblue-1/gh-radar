'use client';

/**
 * ViTriggerStrip — `/trading` 작업대의 **VI 발동 스트립 + 「더보기」 표** (UI-SPEC §레이아웃 계약
 * 4·5 · E3, TRADE-08 · D-06). 정본은 채택 목업 `18-workbench-mockup.html` 의 `.vi-strip` · `.vi-tw`.
 * 이 둘이 옛 `/trading/vi` 의 VI 주문내역 화면을 **대체**한다.
 *
 * ① 접힌 줄 — 「VI {N}」 + 「미확인 {M}」 필 + 칩 가로 스크롤 한 줄 + 「더보기」.
 *   칩 = 종목명 · 발동가 · 전일대비 · 시각(HH:MM) · 상태 배지. 미확인(`Accepted ∧ !confirmed`)
 *   칩은 `--new-bg`/`--new-bd` 이고 **배지 텍스트**가 같은 사실을 말한다(색만으로 말하지 않는다).
 *
 * ② 펼친 표 — 헤더줄(「VI 발동 주문」 + 요약 + 「접기 ▴」) + 기존 `ViOrderList` 의 작업대 모양.
 *   ★ 확인 체크는 **표에서만** 있다. 칩은 훑어보는 표면이라 체크를 두면 스크롤 중 오클릭이
 *     곧 119초 자동취소 면제(되돌릴 수 없다)가 된다.
 *   ★ 확인 활성 판정·전송·낙관 반영·110초 타이머는 **`ViOrderList` 가 그대로 가진다** —
 *     `isConfirmable` 을 이 파일에서 다시 쓰지 않는다. 표시와 전송 가드가 같은 함수를 부르지
 *     않으면 「비활성인데 눌리면 나가는 확인」이 뚫린다.
 *
 * ③ ★ 순서는 relay 가 준 배열 그대로다 — 이 파일에는 정렬도 역순도 없다. 「최신 위」는 서버
 *   병합기(72 스냅샷 / 73 델타)의 몫이고, 같은 시각 두 행의 상대 순서도 그대로 둔다.
 *
 * ④ 「더보기/접기」 상태는 컴포넌트 로컬이다 — localStorage 키를 새로 만들지 않는다(D-15 는 4개뿐).
 *
 * ⑤ 73 스냅샷 전에도 빈 상태를 그린다 — 별도 fetch 가 없으므로 스피너·스켈레톤이 없다.
 */

import { useId, useState } from 'react';
import type { RelayViOrderItem } from '@gh-radar/shared';

import {
  VI_ORDER_EMPTY_TEXT,
  ViOrderList,
  acceptedClock,
  changeRateOf,
  isUnconfirmedViOrder,
  stateFaceOf,
} from '@/components/trading/vi-order-list';
import { viOrderKey } from '@/lib/use-relay-socket';
import { cn } from '@/lib/utils';

const NUM = new Intl.NumberFormat('ko-KR');

/** 칩 영역·표의 빈 문구 — UI-SPEC §VI 발동 스트립·표 원문. */
export const VI_STRIP_EMPTY_TEXT = VI_ORDER_EMPTY_TEXT;

export interface ViTriggerStripProps {
  /** `viOrders` — 72/73 병합 결과. **받은 순서 그대로** 그린다(③). */
  items: readonly RelayViOrderItem[];
  /** 세션이 준비되지 않았다 — 표의 확인 체크를 열지 않는다. */
  disabled?: boolean;
  /** 데드라인 기준 시각(ms). 테스트 전용 — 넘기면 표의 1초 타이머를 걸지 않는다. */
  nowMs?: number;
  className?: string;
}

export function ViTriggerStrip({ items, disabled = false, nowMs, className }: ViTriggerStripProps) {
  const [open, setOpen] = useState(false);
  const tableId = useId();
  const unconfirmed = items.filter(isUnconfirmedViOrder).length;

  return (
    <div data-slot="vi-trigger" className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {/* ── ① 접힌 줄 ── */}
      <section
        data-slot="vi-trigger-strip"
        aria-label="VI 발동"
        className="flex min-w-0 items-center gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2"
      >
        <div className="flex flex-none items-center gap-1.5 text-[12px] font-bold text-[var(--fg)]">
          <span data-testid="vi-strip-label">
            VI <small className="font-semibold text-[var(--muted-fg)]">{items.length}</small>
          </span>
          {unconfirmed > 0 && (
            <span
              data-slot="vi-unconfirmed-pill"
              className="inline-flex h-[18px] items-center rounded-full border border-[var(--new-bd)] bg-[var(--new-bg)] px-[7px] text-[10px] font-bold text-[var(--fg)]"
            >
              미확인 {unconfirmed}
            </span>
          )}
        </div>

        {/*
          ★ 칩은 버튼이 아니라(확인 체크는 표에만 — ②) 이 스크롤 줄 안에 포커스 받을 것이 없다.
            그러면 키보드만 쓰는 사용자는 넘친 칩에 영영 닿지 못한다(WCAG 2.1.1 · axe
            `scrollable-region-focusable`, 18-13 실측). 호가 사다리 스크롤 영역과 같은 해법 —
            영역 자체가 탭으로 닿고(←/→ 로 스크롤), 이름을 가진다.
        */}
        <div
          data-slot="vi-chips"
          role="group"
          aria-label="VI 발동 종목"
          tabIndex={0}
          className="flex min-w-0 flex-1 flex-nowrap gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]"
        >
          {items.length === 0 ? (
            <span className="self-center text-[12px] whitespace-nowrap text-[var(--muted-fg)]">
              {VI_STRIP_EMPTY_TEXT}
            </span>
          ) : (
            items.map((item) => <ViChip key={viOrderKey(item)} item={item} />)
          )}
        </div>

        <button
          type="button"
          data-slot="vi-strip-more"
          aria-expanded={open}
          aria-controls={tableId}
          onClick={() => setOpen((v) => !v)}
          className="h-[26px] flex-none rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] px-2.5 text-[11px] font-semibold whitespace-nowrap text-[var(--fg)]"
        >
          {open ? '접기' : '더보기'}
        </button>
      </section>

      {/* ── ② 펼친 표 ── */}
      {open && (
        <section
          id={tableId}
          data-slot="vi-trigger-table"
          aria-label="VI 발동 주문"
          className="min-w-0 overflow-hidden rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)]"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2 text-[13px] font-bold text-[var(--fg)]">
            <span className="whitespace-nowrap">VI 발동 주문</span>
            <span className="min-w-0 text-[12px] font-medium text-[var(--muted-fg)]">
              VI {items.length} · 미확인 {unconfirmed} · 양 거래소 한 목록 · 최신 위
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto h-[26px] flex-none rounded-[var(--r)] border border-transparent bg-transparent px-2.5 text-[11px] font-semibold whitespace-nowrap text-[var(--muted-fg)]"
            >
              접기 ▴
            </button>
          </div>
          <ViOrderList items={items} disabled={disabled} nowMs={nowMs} variant="workbench" />
        </section>
      )}
    </div>
  );
}

/** 칩 한 개 (목업 `.chip`). 확인 체크가 **없다**(②). 종목명만 줄어든다 — 나머지는 고정폭 어휘. */
function ViChip({ item }: { item: RelayViOrderItem }) {
  const label = item.name !== undefined && item.name !== '' ? item.name : item.isin;
  const face = stateFaceOf(item);
  const rate = changeRateOf(item.triggerPrice, item.basePrice);
  const clock = acceptedClock(item.deadline110Ms);
  const unconfirmed = isUnconfirmedViOrder(item);

  return (
    <span
      data-slot="vi-chip"
      data-exchange={item.exchange}
      data-unconfirmed={unconfirmed ? 'true' : undefined}
      title={`발동가 ${NUM.format(item.triggerPrice)} · 주문가 ${NUM.format(item.orderPrice)} × ${NUM.format(item.orderQty)}`}
      className={cn(
        'inline-flex h-[30px] flex-none items-center gap-1.5 rounded-full border py-0 pr-2.5 pl-2 text-[12px] whitespace-nowrap',
        unconfirmed
          ? 'border-[var(--new-bd)] bg-[var(--new-bg)]'
          : 'border-[var(--border)] bg-[var(--bg)]',
      )}
    >
      <b
        data-slot="vi-chip-name"
        title={label}
        className="max-w-[8rem] min-w-0 truncate font-semibold text-[var(--fg)]"
      >
        {label}
      </b>
      <span className="mono">{NUM.format(item.triggerPrice)}</span>
      {rate === null ? (
        <span className="mono text-[var(--muted-fg)]">—</span>
      ) : (
        <span
          className={cn(
            'mono font-bold',
            rate > 0 ? 'text-[var(--up)]' : rate < 0 ? 'text-[var(--down)]' : 'text-[var(--flat)]',
          )}
        >
          {rate > 0 ? '+' : ''}
          {rate.toFixed(1)}%
        </span>
      )}
      {clock !== null && (
        <span className="mono text-[11px] text-[var(--muted-fg)]">{clock.slice(0, 5)}</span>
      )}
      <span
        data-slot="vi-chip-state"
        className={cn(
          'inline-flex h-4 items-center rounded-[4px] border px-[5px] text-[9px] font-bold',
          face.className,
        )}
      >
        {face.label}
      </span>
    </span>
  );
}
