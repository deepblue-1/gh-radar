'use client';

/**
 * ViTriggerStrip — `/trading` 작업대의 **VI 패널** (UI-SPEC §레이아웃 계약 3~5 · E2 · E3, TRADE-08 ·
 * D-05 · D-06). 정본은 채택 목업 `18-workbench-mockup.html` 의 `.vi-strip` · `.vi-tw` 와 상단 정리
 * 목업 `260923-bjb-mockup.html` 의 `.panel` 이다. 옛 `/trading/vi` 의 VI 주문내역 화면을 **대체**한다.
 *
 * ① 한 테두리 패널 — 위에서부터 스트립 줄 → 경보(`alert` 슬롯) → 펼침 본문(설정 → 발동 표).
 *   스트립 줄 = 「VI」 + 「미확인 {M}」 필 + 칩 가로 스크롤 한 줄 + 「더보기/접기」.
 *   칩 = 종목명 · 발동가 · 전일대비 · 시각(HH:MM) · 상태 배지. 미확인(`Accepted ∧ !confirmed`)
 *   칩은 `--new-bg`/`--new-bd` 이고 **배지 텍스트**가 같은 사실을 말한다(색만으로 말하지 않는다).
 *   ★ 「미확인 {M}」 필은 남긴다 — 놓치면 119초 자동취소다. 전체 개수는 칩이 이미 말한다.
 *
 * ② 펼침 본문 — 토글은 스트립 줄 버튼 **하나**다(펼친 영역에 머리줄·접기 버튼이 없다).
 *   ⓐ `settings` 슬롯(VI 설정 줄) — 접힘은 언마운트가 아니라 `hidden` 이다. 고치던 입력값과
 *     상위 이탈 경고가 쓰는 더티 합이 접었다 펴도 그대로 남는다.
 *   ⓑ 발동 표 — 주문이 있을 때만 그린다(없으면 스트립 줄의 빈 문구가 이미 말한다). 기존
 *     `ViOrderList` 의 작업대 모양 그대로다.
 *   ★ 확인 체크는 **표에서만** 있다. 칩은 훑어보는 표면이라 체크를 두면 스크롤 중 오클릭이
 *     곧 119초 자동취소 면제(되돌릴 수 없다)가 된다.
 *   ★ 확인 활성 판정·전송·낙관 반영·110초 타이머는 **`ViOrderList` 가 그대로 가진다** —
 *     `isConfirmable` 을 이 파일에서 다시 쓰지 않는다. 표시와 전송 가드가 같은 함수를 부르지
 *     않으면 「비활성인데 눌리면 나가는 확인」이 뚫린다.
 *
 * ③ `alert` 슬롯(VI 몫 서버 거부)은 펼침 여부와 무관하게 스트립 줄 바로 아래에 선다 — 안전
 *   신호가 접힌 패널 속에 숨지 않는다.
 *
 * ④ ★ 순서는 받은 배열 그대로다 — 이 파일에는 정렬도 역순도 없다. 받은 배열이 **이미 최신순**
 *   이다(최신 발동이 칩 맨 왼쪽 · 표 맨 위). 그 정렬은 `use-relay-socket` 리듀서의
 *   `sortViOrdersNewestFirst` 한 곳(72 교체 · 73 병합 두 갈래)이 정한다(quick-260923-dmb).
 *   여기서 다시 정렬하면 칩과 표가 두 규칙으로 갈릴 수 있다.
 *
 * ⑤ 「더보기/접기」 상태는 기억한다 — `gh-radar:trading-panels` 의 `vi` (quick-260923-lyt · 사용자 요청으로
 *   D-15 「키 4개뿐」 을 넘었다). 다른 메뉴에 갔다 와도 펼친 채다.
 *   73 스냅샷 전에도 빈 상태를 그린다 — 별도 fetch 가 없으므로 스피너·스켈레톤이 없다.
 */

import { useEffect, useId, useState, type ReactNode } from 'react';
import type { RelayViOrderItem } from '@gh-radar/shared';

import {
  VI_ORDER_EMPTY_TEXT,
  ViOrderList,
  acceptedClock,
  changeRateOf,
  isUnconfirmedViOrder,
  stateFaceOf,
} from '@/components/trading/vi-order-list';
import { readPanelsPref, writePanelsPref } from '@/lib/trading-layout';
import { viOrderKey } from '@/lib/use-relay-socket';
import { cn } from '@/lib/utils';

const NUM = new Intl.NumberFormat('ko-KR');

/** 칩 영역의 빈 문구 — UI-SPEC §VI 발동 스트립·표 원문. */
export const VI_STRIP_EMPTY_TEXT = VI_ORDER_EMPTY_TEXT;

export interface ViTriggerStripProps {
  /** `viOrders` — 리듀서가 최신순으로 정렬한 배열. **받은 순서 그대로** 그린다(④). */
  items: readonly RelayViOrderItem[];
  /** 세션이 준비되지 않았다 — 표의 확인 체크를 열지 않는다. */
  disabled?: boolean;
  /** 데드라인 기준 시각(ms). 테스트 전용 — 넘기면 표의 1초 타이머를 걸지 않는다. */
  nowMs?: number;
  /** 펼침 본문 맨 위의 VI 설정 블록(②ⓐ). 접혀도 마운트를 유지한다(`hidden`). */
  settings?: ReactNode;
  /** 스트립 줄 바로 아래 경보(③). 펼침 여부와 무관하게 보인다 — 널이면 흔적이 없다. */
  alert?: ReactNode;
  className?: string;
}

export function ViTriggerStrip({
  items,
  disabled = false,
  nowMs,
  settings,
  alert,
  className,
}: ViTriggerStripProps) {
  const [open, setOpen] = useState(false);
  // 펼침은 기억한다(quick-260923-lyt) — 마운트 후에 읽는다(하이드레이션).
  useEffect(() => {
    const saved = readPanelsPref().vi;
    if (saved !== undefined) setOpen(saved);
  }, []);
  const bodyId = useId();
  const unconfirmed = items.filter(isUnconfirmedViOrder).length;

  return (
    <div
      data-slot="vi-trigger"
      className={cn(
        // 토스 B `.strip`(260924-vj1) — 무테 카드 면(테두리 색만 투명 · 1px 기하 유지).
        'min-w-0 overflow-hidden rounded-[var(--r-md)] border border-transparent bg-[var(--card)]',
        className,
      )}
    >
      {/* ── ① 스트립 줄 ── */}
      <section
        data-slot="vi-trigger-strip"
        aria-label="VI 발동"
        className="flex min-w-0 items-center gap-2 px-2.5 py-2.5"
      >
        <div className="flex flex-none items-center gap-1.5 text-[12px] font-bold text-[var(--fg)]">
          <span data-testid="vi-strip-label">VI</span>
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
          aria-controls={bodyId}
          onClick={() => {
            const next = !open;
            setOpen(next);
            writePanelsPref({ vi: next });
          }}
          className="h-[26px] flex-none rounded-[var(--r)] border border-transparent bg-[var(--muted)] px-2.5 text-[11px] font-semibold whitespace-nowrap text-[var(--fg)] hover:bg-[var(--raised-2)]"
        >
          {open ? '접기' : '더보기'}
        </button>
      </section>

      {/* ── ③ 경보 — 접혀도 보인다 ── */}
      {alert}

      {/* ── ② 펼침 본문 — `hidden` 이 이기도록 display 유틸을 붙이지 않는다 ── */}
      <div id={bodyId} data-slot="vi-trigger-body" hidden={!open}>
        {settings != null && (
          <div data-slot="vi-trigger-settings" className="border-t border-[var(--border-subtle)] px-2.5 py-2">
            {settings}
          </div>
        )}
        {open && items.length > 0 && (
          <section
            data-slot="vi-trigger-table"
            aria-label="VI 발동 주문"
            className="min-w-0 border-t border-[var(--border-subtle)]"
          >
            <ViOrderList items={items} disabled={disabled} nowMs={nowMs} variant="workbench" />
          </section>
        )}
      </div>
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
          : 'border-transparent bg-[var(--muted)]',
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
