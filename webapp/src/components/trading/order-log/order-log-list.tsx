'use client';

/**
 * OrderLogList — 상따 주문로그 목록 (Phase 25 · UI-SPEC ②-0 · 채택 목업 F-A `ul.lines`).
 *
 * 한 줄 = 전략 이벤트 1건. 문장 조립은 `@gh-radar/shared` 조립기 한 곳(D-09 — `strategyEventParts` ·
 * `orderLogLineText`)이고, 이 컴포넌트는 조각을 F-A 문법으로 배치만 한다:
 *
 *   [시각][주문번호][구분] 거래소 | 종목 | {행위 600} · 본문 | 누적 N
 *
 * - 정렬은 받은 순서 그대로다 — 피드(`mergeStrategyEvents`)가 이미 오름차순(새 로그는 아래)으로 둔다.
 * - 시세 이벤트(kind 1·2)는 주문번호 칸 자체가 없고, 주문번호가 빈 주문 이벤트는 `[—]`.
 * - 줄은 `nowrap` + 끝 말줄임, 전체 문장은 네이티브 `title`(R11 — 줄 전체 평문). Tooltip 을 쓰지 않는다
 *   (줄 수백 개에 포털 · 리스너가 줄 수만큼 생긴다).
 * - 색은 기존 토큰만(구분 칸 색 축: 매수 `--up` · 매도 `--down` · 시세 `--accent-fg` · 모름 `--muted-fg`).
 *
 * 25-07 확장:
 *  ① 스크롤러 `order-log-body` — **목록 자체**가 스크롤 주인이다(페이지 `main` 아님 · Pitfall 11). panel 172px ·
 *     card 본문 높이 전부 · window 뷰포트 남은 높이. `tabIndex=0` + 「주문로그 목록」(axe scrollable-region-focusable).
 *     **라이브 영역이 아니다** — 시세 이벤트가 잦아 줄마다 읽히면 소음이다.
 *  ② 상태 — 실패 줄(맨 위 · `role="status"` · 「다시 시도」) → 로딩 줄(줄 0 일 때만) → 빈 박스 → 목록 → 핀.
 *     푸시로 온 줄은 실패 줄 아래에 그대로 있다.
 *  ③ sticky 핀 — `useStickToBottom`(24px). 올려 보는 중 새 줄 N → 「새 로그 N · 맨 아래로 ↓」, 누르면 맨 아래 ·
 *     포커스 스크롤러. card 변형은 핀이 없다(결정 3-A — 3줄 중 1줄을 가린다). 핀은 스크롤러 **안** sticky 다
 *     (스크롤러가 overflow 주인이라 sticky 가 붙는다 — 페이지 `main` 과 무관).
 *  ④ 새 줄 강조 — `newKeys` 에 든 줄 `data-new` · primary 8% · radius 4px · 배경 전환 300ms(reduced-motion 즉시).
 *  ⑤ 폰 밴드 줄 펼침(결정 2-A) — `phoneBand === true` 에서만 줄 내용이 `aria-expanded` 버튼이다. 탭 = 그 줄만
 *     `white-space:normal` + 문장 조각 다음 줄(`basis-full`) · primary 6%(강조 8% 보다 우선). 펼침은 메모리이고
 *     `resetKey`(필터) 가 바뀌면 전부 접힌다. 판정 전(null)은 비폰 규칙(title).
 */
import { useState } from 'react';
import {
  formatKstMs,
  isMarketStrategyEvent,
  orderLogLineText,
  strategyEventKey,
  strategyEventParts,
} from '@gh-radar/shared';
import type { StrategyEventParts, StrategyEventRow } from '@gh-radar/shared';

import { useStickToBottom } from '@/lib/use-stick-to-bottom';
import type { OrderLogFeedStatus } from '@/lib/use-order-log-feed';
import { cn } from '@/lib/utils';

export type OrderLogListProps = {
  /** 표시할 이벤트 — 오름차순(피드 순서 그대로). */
  rows: readonly StrategyEventRow[];
  /** 표면 — 공용 패널 · 카드 탭 · 창 분리. */
  variant: 'panel' | 'card' | 'window';
  /** 종목 표시명(이름 → 코드 → ISIN 폴백은 호출자가 한다 — 새 조회 경로를 만들지 않는다). */
  nameOf: (row: StrategyEventRow) => string;
  /** 3초 강조 중인 푸시 줄 키. */
  newKeys?: ReadonlySet<string>;
  /** `wb` 폰 밴드 — true 면 줄 탭 펼침, false/null(판정 전)/생략이면 잘림 + title. */
  phoneBand?: boolean | null;
  /** 피드 상태 — 생략하면 ready. */
  status?: OrderLogFeedStatus;
  onRetry?: () => void;
  /** 실패 문구(창 분리 과거일은 「이 날 …」). */
  errorText?: string;
  emptyTitle?: string;
  /** 빈 박스 본문 — `null` 이면 본문 없음. */
  emptyBody?: string | null;
  /** 줄 0 이 필터 때문이다 → 제목만 「조건에 맞는 로그가 없어요」. */
  filteredEmpty?: boolean;
  /** 바뀌면 맨 아래로 · 핀 0 · 폰 펼침 전부 접힘(필터 · 날짜). */
  resetKey?: string;
  /** sticky 핀 — 기본 `variant !== "card"`. */
  showPin?: boolean;
};

/** 구분 칸 색 축 (UI-SPEC 「색 축」 — 새 토큰 0). */
const TONE_CLASS: Record<StrategyEventParts['tone'], string> = {
  buy: 'text-[var(--up)]',
  sell: 'text-[var(--down)]',
  market: 'text-[var(--accent-fg)]',
  unknown: 'text-[var(--muted-fg)]',
};

/** 스크롤러 높이 — panel 172px(목업 `.body` ≈ 9줄) · card 본문 전부 · window 뷰포트 남은 높이. */
const BODY_CLASS: Record<OrderLogListProps['variant'], string> = {
  panel: '',
  card: 'h-full',
  window: 'min-h-0 flex-1',
};

const DEFAULT_ERROR_TEXT = '오늘 주문로그를 불러오지 못했어요';
const DEFAULT_EMPTY_TITLE = '오늘 주문로그가 없어요';
const DEFAULT_EMPTY_BODY = '상따 주문과 상한가 노출·진입이 생기면 여기에 쌓여요';
const FILTERED_EMPTY_TITLE = '조건에 맞는 로그가 없어요';

const NO_KEYS: ReadonlySet<string> = new Set();

/** 한 줄의 배경 — 폰 펼침(6%)이 새 줄 강조(8%)보다 우선. */
function lineBg(open: boolean, fresh: boolean): string | false {
  if (open) return 'bg-[color-mix(in_srgb,var(--primary)_6%,transparent)]';
  if (fresh) return 'bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]';
  return false;
}

export function OrderLogList({
  rows,
  variant,
  nameOf,
  newKeys = NO_KEYS,
  phoneBand,
  status = 'ready',
  onRetry,
  errorText = DEFAULT_ERROR_TEXT,
  emptyTitle = DEFAULT_EMPTY_TITLE,
  emptyBody = DEFAULT_EMPTY_BODY,
  filteredEmpty = false,
  resetKey,
  showPin = variant !== 'card',
}: OrderLogListProps) {
  const stick = useStickToBottom<HTMLDivElement>(rows.length, { resetKey });
  const tappable = phoneBand === true;

  // 폰 밴드 펼침 — resetKey 가 바뀌면 이전 펼침은 버린다(렌더 중 파생 · 효과 없음).
  const [openState, setOpenState] = useState<{ resetKey: string | undefined; keys: ReadonlySet<string> }>(() => ({
    resetKey,
    keys: NO_KEYS,
  }));
  const openKeys = openState.resetKey === resetKey ? openState.keys : NO_KEYS;
  const toggleOpen = (key: string) => {
    setOpenState((prev) => {
      const base = prev.resetKey === resetKey ? prev.keys : NO_KEYS;
      const next = new Set(base);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { resetKey, keys: next };
    });
  };

  const empty = rows.length === 0;
  const pending = showPin ? stick.pending : 0;

  return (
    <div data-slot="order-log" data-surface={variant} className={cn('flex min-w-0 flex-col', variant !== 'panel' && 'h-full min-h-0')}>
      <div
        ref={stick.ref}
        data-slot="order-log-body"
        tabIndex={0}
        aria-label="주문로그 목록"
        aria-busy={status === 'loading' ? true : undefined}
        style={variant === 'panel' ? { maxHeight: 172 } : undefined}
        className={cn('relative min-w-0 overflow-y-auto', BODY_CLASS[variant])}
      >
        {status === 'error' && (
          <div
            data-slot="order-log-error"
            role="status"
            className="px-3 pt-2.5 pb-0.5 text-[11px] leading-[1.5] text-[var(--muted-fg)]"
          >
            {errorText}
            {onRetry !== undefined && (
              <button
                type="button"
                onClick={onRetry}
                className="ml-1.5 font-semibold text-[var(--accent-fg)] hover:underline"
              >
                다시 시도
              </button>
            )}
          </div>
        )}
        {status === 'loading' && empty && (
          <div data-slot="order-log-loading" className="px-3 pt-2.5 pb-2 text-[11px] leading-[1.5] text-[var(--faint)]">
            불러오는 중…
          </div>
        )}
        {status === 'ready' && empty && (
          <div
            data-slot="order-log-empty"
            className="m-[var(--s-3)] rounded-[var(--r-md)] border border-dashed border-[var(--faint)] px-[var(--s-4)] py-[var(--s-5)] text-center"
          >
            <b className="block text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
              {filteredEmpty ? FILTERED_EMPTY_TITLE : emptyTitle}
            </b>
            {!filteredEmpty && emptyBody !== null && (
              <p className="m-0 mt-1 text-[length:var(--t-caption)] text-[var(--muted-fg)]">{emptyBody}</p>
            )}
          </div>
        )}
        {!empty && (
          <ol
            data-slot="order-log-list"
            data-surface={variant}
            className="m-0 flex list-none flex-col gap-px px-2.5 py-1.5 text-[11px] leading-[1.7]"
          >
            {rows.map((row) => {
              const key = strategyEventKey(row);
              const parts = strategyEventParts(row, 'log');
              const name = nameOf(row);
              const market = isMarketStrategyEvent(row.kind);
              const middle = [row.exchange, name].filter((s) => s !== '').join(' | ');
              const hasSentence = parts.action !== null || parts.body !== '';
              const open = tappable && openKeys.has(key);
              const fresh = newKeys.has(key);
              const content = (
                <>
                  <span className="mono flex-none text-[var(--muted-fg)]">[{formatKstMs(row.gwTimeMs)}]</span>
                  {!market && (
                    <span className="mono flex-none text-[var(--muted-fg)]">
                      [{row.orderNo === '' ? '—' : row.orderNo}]
                    </span>
                  )}
                  <span data-slot="order-log-kind" className={cn('flex-none font-semibold', TONE_CLASS[parts.tone])}>
                    [{parts.badge}]
                  </span>{' '}
                  <span
                    data-slot="order-log-text"
                    className={cn(
                      'min-w-0 flex-auto',
                      open ? 'basis-full overflow-visible whitespace-normal' : 'overflow-hidden text-ellipsis',
                    )}
                  >
                    {middle}
                    {hasSentence && ' | '}
                    {parts.action !== null && <span className="font-semibold">{parts.action}</span>}
                    {parts.action !== null && parts.body !== '' && ' · '}
                    {parts.body}
                    <span className="text-[var(--muted-fg)]">
                      {' | '}
                      {parts.cum}
                    </span>
                  </span>
                </>
              );
              return (
                <li
                  key={key}
                  data-slot="order-log-line"
                  data-kind={row.kind}
                  data-group={row.group}
                  data-new={fresh ? '' : undefined}
                  data-open={open ? '' : undefined}
                  title={tappable ? undefined : orderLogLineText(row, name)}
                  className={cn(
                    'flex min-w-0 gap-1.5 overflow-hidden rounded-[4px] text-[var(--fg)] transition-[background-color] duration-300 motion-reduce:transition-none',
                    open ? 'flex-wrap whitespace-normal' : 'text-ellipsis whitespace-nowrap',
                    lineBg(open, fresh),
                  )}
                >
                  {tappable ? (
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => toggleOpen(key)}
                      className={cn(
                        'flex w-full min-w-0 gap-1.5 border-0 bg-transparent p-0 text-left [font:inherit] text-inherit',
                        open ? 'flex-wrap whitespace-normal' : 'overflow-hidden whitespace-nowrap',
                      )}
                    >
                      {content}
                    </button>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {pending > 0 && (
          <div className="pointer-events-none sticky bottom-0 flex justify-center p-1">
            <button
              type="button"
              data-slot="order-log-pin"
              onClick={() => {
                stick.scrollToBottom(true);
                stick.ref.current?.focus({ preventScroll: true });
              }}
              className="pointer-events-auto rounded-full bg-[var(--primary)] px-2.5 py-0.5 text-[10px] leading-[1.5] text-[var(--primary-fg)] shadow-[0_2px_8px_rgba(0,0,0,.25)]"
            >
              새 로그 {pending} · 맨 아래로 ↓
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
