'use client';

/**
 * OrderLogWindow — 주문로그 창 분리 페이지 본문 (Phase 25-10 · D-07 · 결정 5-A · UI-SPEC ③ · R13 · R15).
 *
 *   [주문로그  ‹  2026-09-29 (화)  ›  (오늘)]      ← 머리줄 `order-log-window-bar`
 *   [종목 ▾ 거래소 ▾ 구분 ▾  N건]                   ← 필터줄(창 분리 버튼 없음)
 *   [F-A 줄 …                                  ]   ← 목록 스크롤러 = 뷰포트 남은 높이
 *
 * ① 쿼리 = 화면 상태의 정본 URL — `parseOrderLogQuery` 화이트리스트(T-25-40). 형식 오류 · 미래 날짜 · 모르는 값이면
 *   마운트 때 **한 번** `router.replace` 로 정본 URL 을 다시 쓴다. 날짜 · 필터를 바꾸면 로컬 상태를 바꾸고 같은
 *   정본 문자열(`orderLogQueryString`)로 `router.replace` 한다 — 새로고침해도 같은 화면 · 히스토리는 쌓지 않는다.
 *   쿼리는 보기 선택일 뿐 권한이 아니다(서버가 `req.userId` 로 판정 · T-25-12).
 * ② 날짜 이동은 **달력 하루씩**(`shiftKstDate` — 주말 · 휴장일도 한 칸 · 하한 없음). 다음 날은 오늘이면 disabled.
 *   「오늘」 알약은 오늘을 보는 중이면 `aria-current="date"` 면 accent · 무동작, 과거일이면 테두리형 · 누르면 오늘로.
 *   머리줄 조각은 전부 `flex-none` 고정 폭이라 넘치지 않는다(E7 overflow) — 조회 중에도 버튼을 막지 않는다(E7 loading).
 * ③ 피드 = `useOrderLogFeed({ date })` — 날짜마다 조회 1회 · 오늘만 푸시 이어붙임 · 과거일은 푸시 무시.
 *   스크롤 고정 핀은 **오늘만**(과거일은 새 줄이 생기지 않는다). 범위 = `account` 쿼리의 주문 이벤트 + 시세 이벤트
 *   (계좌가 없으면 시세 이벤트만 — 결정 1-A).
 * ④ 폰 밴드 = 루트 폭 < `WB_PHONE_BAND_BELOW`(작업대와 같은 JS 상수 · 새 경계 숫자 없음 — UI-SPEC R5) · 루트가
 *   `@container/wb` 를 선언해 목록 안 `/wb` 쿼리가 작업대와 같이 걸린다(CLAUDE.md §2.2b).
 * ⑤ 문서 제목 `주문로그 · {YYYY-MM-DD}` · 앱 셸 · 사이드바 · 배지 없음(결정 5).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { kstDateIso } from '@gh-radar/shared';

import {
  ORDER_LOG_WINDOW_PATH,
  applyOrderLogFilters,
  inScope,
  kstWeekdayShort,
  orderLogQueryString,
  parseOrderLogQuery,
  shiftKstDate,
  stockOptions,
  type OrderLogFilters as OrderLogFilterValue,
  type OrderLogQuery,
} from '@/lib/order-log-feed';
import { WB_PHONE_BAND_BELOW } from '@/lib/trading-layout';
import { useOrderLogFeed } from '@/lib/use-order-log-feed';

import { OrderLogFilters } from './order-log-filters';
import { OrderLogList } from './order-log-list';
import { useOrderLogNameOf } from './order-log-panel';

const PAST_EMPTY_TITLE = '이 날은 주문로그가 없어요';
const PAST_EMPTY_BODY = '주말·휴장일이거나 주문·상한가 이벤트가 없던 날이에요';
const PAST_ERROR_TEXT = '이 날 주문로그를 불러오지 못했어요';

/** 24×24 날짜 화살표 — 다음 날 disabled 는 글자 `--faint` · 테두리 투명(목업 `.arr.off`). */
const ARROW_CLASS =
  'inline-flex size-6 flex-none items-center justify-center rounded-[var(--r-sm)] border border-[var(--border-subtle)] text-[var(--muted-fg)] ' +
  'hover:bg-[var(--muted)] disabled:border-transparent disabled:text-[var(--faint)] disabled:hover:bg-transparent';

function hrefOf(q: OrderLogQuery, today: string): string {
  const qs = orderLogQueryString(q, today);
  return qs === '' ? ORDER_LOG_WINDOW_PATH : `${ORDER_LOG_WINDOW_PATH}?${qs}`;
}

export function OrderLogWindow() {
  const router = useRouter();
  const params = useSearchParams();
  const today = kstDateIso();

  // ① 첫 렌더의 쿼리로 상태를 세운다 — 이후 URL 은 이 상태를 따라 쓰일 뿐 다시 읽지 않는다(replace 는 히스토리 없음).
  const [initial] = useState(() => parseOrderLogQuery(new URLSearchParams(params?.toString() ?? ''), today));
  const [query, setQuery] = useState<OrderLogQuery>(() => ({
    account: initial.account,
    date: initial.date,
    filters: initial.filters,
  }));

  const correctedRef = useRef(false);
  useEffect(() => {
    if (!initial.corrected || correctedRef.current) return;
    correctedRef.current = true;
    router.replace(hrefOf(initial, today), { scroll: false });
    // 마운트 1회 — 교정은 받은 쿼리에 대해서만 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback(
    (next: OrderLogQuery) => {
      setQuery(next);
      router.replace(hrefOf(next, kstDateIso()), { scroll: false });
    },
    [router],
  );

  const { date, filters, account } = query;
  const isToday = date === today;

  // ③ 피드 — 날짜마다 1회 조회 · 오늘만 푸시.
  const feed = useOrderLogFeed({ date });

  // ⑤ 문서 제목.
  useEffect(() => {
    document.title = `주문로그 · ${date}`;
  }, [date]);

  // ④ 폰 밴드 — 작업대와 같은 상수.
  const rootRef = useRef<HTMLElement>(null);
  const [phoneBand, setPhoneBand] = useState<boolean | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width === undefined || width === 0) return;
      setPhoneBand(width < WB_PHONE_BAND_BELOW);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scoped = useMemo(() => feed.rows.filter((r) => inScope(r, { accountNo: account })), [feed.rows, account]);
  const visible = useMemo(() => applyOrderLogFilters(scoped, filters), [scoped, filters]);
  const nameOf = useOrderLogNameOf(scoped);
  const options = useMemo(() => stockOptions(scoped, nameOf), [scoped, nameOf]);
  const filtered = filters.stock !== 'all' || filters.ex !== 'all' || filters.kind !== 'all';

  const goDate = (next: string) => update({ ...query, date: next });
  const setFilters = (next: OrderLogFilterValue) => update({ ...query, filters: next });

  return (
    <main
      ref={rootRef}
      data-slot="order-log-window"
      className="@container/wb flex h-dvh flex-col bg-[var(--bg)] text-[var(--fg)]"
    >
      <div
        data-slot="order-log-window-bar"
        className="flex flex-none items-center gap-2.5 border-b border-[var(--border-subtle)] px-3 py-2"
      >
        <h1 className="m-0 flex-none text-[14px] leading-[1.4] font-semibold">주문로그</h1>
        <div className="inline-flex flex-none items-center gap-0.5">
          <button
            type="button"
            data-slot="order-log-date-prev"
            aria-label="이전 날"
            onClick={() => goDate(shiftKstDate(date, -1))}
            className={ARROW_CLASS}
          >
            ‹
          </button>
          <span data-slot="order-log-date" className="mono flex-none px-1.5 text-[12px] font-semibold whitespace-nowrap">
            {date} ({kstWeekdayShort(date)})
          </span>
          <button
            type="button"
            data-slot="order-log-date-next"
            aria-label="다음 날"
            disabled={isToday}
            onClick={() => goDate(shiftKstDate(date, 1))}
            className={ARROW_CLASS}
          >
            ›
          </button>
          {isToday ? (
            <button
              type="button"
              data-slot="order-log-date-today"
              aria-current="date"
              className="ml-1 flex-none rounded-full border border-transparent bg-[var(--accent)] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-[var(--accent-fg)]"
            >
              오늘
            </button>
          ) : (
            <button
              type="button"
              data-slot="order-log-date-today"
              onClick={() => goDate(kstDateIso())}
              className="ml-1 flex-none rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-[var(--muted-fg)] hover:text-[var(--fg)]"
            >
              오늘
            </button>
          )}
        </div>
      </div>

      <div className="flex-none">
        <OrderLogFilters filters={filters} onChange={setFilters} stockOptions={options} count={visible.length} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <OrderLogList
          rows={visible}
          variant="window"
          nameOf={nameOf}
          newKeys={feed.newKeys}
          phoneBand={phoneBand}
          status={feed.status}
          onRetry={feed.retry}
          errorText={isToday ? undefined : PAST_ERROR_TEXT}
          emptyTitle={isToday ? undefined : PAST_EMPTY_TITLE}
          emptyBody={isToday ? undefined : PAST_EMPTY_BODY}
          filteredEmpty={filtered && scoped.length > 0}
          resetKey={`${date}|${JSON.stringify(filters)}`}
          showPin={isToday}
        />
      </div>
    </main>
  );
}
