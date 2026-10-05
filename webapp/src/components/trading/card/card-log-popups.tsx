'use client';

/**
 * 카드 로그 팝업 — 종목 카드 탭 줄 오른쪽 「주문로그」 · 「전략로그」 버튼과 **한 종목 전용** 가운데 다이얼로그
 * (quick-260930-lq5 · 채택 목업 v2 변형 A ① · ②A · ③ · ④).
 *
 * ① 무엇 — 카드 탭 본문(정보 탭 3줄 고정 높이)에서는 로그가 3줄밖에 안 보이고 줄이 잘렸다. 버튼이 여는 팝업은
 *   그 카드의 종목 · 거래소 · 계좌 범위를 그대로 두고 표로 전부 읽히게 한다. 제목은 [알약] 종목명 거래소 뿐이다
 *   (코드 · 계좌 · 날짜 없음 · D2). 주문로그 버튼 배지 = 팝업이 닫혀 있는 동안 도착한 범위 안 새 줄 수(D1).
 *
 * ② 범위 · 데이터 — 새 조회 경로 0
 *   주문로그 = 작업대 공용 피드(`OrderLogFeedProvider` → strategy-card)를 `inScope`(카드 계좌 주문 + 그 종목 ·
 *   그 거래소 시세)로 자른 것. 전략로그 = 카드 훅의 로그 배열 그대로. 가려짐 판정 = 다이얼로그 닫힘.
 *
 * ③ 시간 흐름 · 스크롤 — 위 → 아래 = 오래된 줄 → 새 줄. 본문 스크롤러만 스크롤하고 머리는 고정이다.
 *   다이얼로그는 닫히면 언마운트되므로(`forceMount` 없음) 스크롤러(`useStickToBottom`)가 열 때마다 새로 붙어
 *   맨 아래(최신)에서 시작하고, 맨 아래였으면 새 줄을 따라간다. 새 줄(`newKeys` 3초)은 왼쪽 primary 선.
 *
 * ④ 폰 경계 640 = **뷰포트** (Tailwind `sm`) — 다이얼로그는 body 포털 오버레이라 카드 `@container/lc` 밖이다.
 *   D-28 「뷰포트 분기 신설 금지」 는 컨테이너 안쪽 규율이고, 오버레이 크기는 뷰포트가 정한다(stock-info-modal ⑤ 와
 *   같은 논리). 640 미만 = 전체 화면 + 표 대신 두 줄 행(D5), 이상 = 가운데 최대 880px · 높이 80dvh(D2).
 *   ★ 탭 줄 안의 트리거 버튼에는 뷰포트 · @container 클래스를 쓰지 않는다(카드 안 D-28).
 *
 * ⑤ 문장 조립 없음 — 행 조각은 `strategyEventParts(row,'log')` 출력(badge · tone · action · body · cum)을 칸에
 *   배치만 한다(Phase 25 D-09 — 문장 형식이 바뀌면 shared 한 곳만 고친다). 전략로그는 `entry.text` 그대로.
 *   서버 원문은 React 텍스트 노드로만 그린다(T-lq5-01). 28-09 — kind 15 잠김 줄은 조각 `lead`(「잠김 43초」)를 내용 칸 앞에
 *   `--up` 600 으로 두고, tone `feature` 는 배지 · 내용 모두 `--muted-fg`(UI-SPEC ②-2).
 *
 * ⑥ 창 분리 — 주문로그 머리 아이콘. 기존 창 분리 URL 에 계좌 · 종목(ISIN) · 거래소 · 구분(`sideFilterKind`)을 싣는다.
 *   앱 셸에서는 숨긴다 — `native:hidden`(첫 페인트) + 마운트 뒤 `isNativeApp()`(order-log-filters 와 같은 규칙 · T-lq5-04).
 */

import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ExternalLink, XIcon } from 'lucide-react';
import {
  formatKstMs,
  isMarketStrategyEvent,
  kstDateIso,
  strategyEventKey,
  strategyEventParts,
} from '@gh-radar/shared';
import type { RelayExchange, StrategyEventParts } from '@gh-radar/shared';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { StrategyLogEntry } from '@/components/trading/strategy-log';
import { isNativeApp } from '@/lib/native/native-detect';
import {
  ORDER_LOG_SIDE_FILTERS,
  ORDER_LOG_WINDOW_PATH,
  inScope,
  matchesSide,
  openOrderLogWindow,
  orderLogQueryString,
  orderLogSummary,
  orderNoTail,
  sideFilterKind,
  type OrderLogSideFilter,
} from '@/lib/order-log-feed';
import { useStickToBottom } from '@/lib/use-stick-to-bottom';
import { useUnseenOrderLogCount, type OrderLogFeed } from '@/lib/use-order-log-feed';
import { cn } from '@/lib/utils';

const NUM = new Intl.NumberFormat('ko-KR');

/* ── 공용 틀 ─────────────────────────────────────────────────────────── */

/** 트리거 — 목업 `.logbtn.sm`. 탭 알약이 아니라 outline 버튼이다(접힘 · 탭 재클릭 규칙과 무관). */
const TRIGGER_CLASS =
  'inline-flex h-[22px] flex-none items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--card)] px-[7px] text-[11px] font-semibold whitespace-nowrap text-[var(--fg-2)] hover:bg-[var(--muted)]';

/** 머리 아이콘 버튼(창 분리 · 닫기) — 32 상자 · 히트 44(after:-inset-1.5). */
const ICON_BTN_CLASS =
  "relative inline-flex size-8 flex-none items-center justify-center rounded-[8px] text-[var(--muted-fg)] hover:bg-[var(--muted)] hover:text-[var(--fg)] after:absolute after:-inset-1.5 after:content-['']";

/** 줄 배경 — 거부 · 오류 행(목업 `tr.err`). */
const ERR_BG = 'bg-[color-mix(in_oklab,var(--up-bg)_70%,transparent)]';
/** 새 줄 — 왼쪽 primary 선(목업 `.new td:first-child`). */
const NEW_EDGE = 'shadow-[inset_3px_0_0_var(--primary)]';

const TH_CLASS =
  'sticky top-0 z-[1] border-b border-[var(--border-subtle)] bg-[var(--popover)] px-2.5 py-2 text-left text-[12px] font-semibold whitespace-nowrap text-[var(--muted-fg)] first:pl-5 last:pr-5';
const TD_CLASS = 'border-b border-[var(--border-subtle)] px-2.5 py-2 align-top first:pl-5 last:pr-5';
/** 표 행 hover — 오류 행은 제 배경을 지킨다. */
const TD_HOVER = 'group-hover:bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]';
/** 내용 — 줄바꿈 · 잘림 없음 · mono 금지(한글 본문 · 260911-w5h). */
const BODY_TEXT = 'leading-[1.5] [word-break:keep-all] [overflow-wrap:anywhere]';

type LogKind = '주문로그' | '로그';

function LogTriggerButton({ kind, badge, ...rest }: { kind: LogKind; badge: number } & ComponentProps<'button'>) {
  return (
    <button
      // DialogTrigger(asChild)가 싣는 핸들러 · aria 는 받고, 식별 속성은 이 버튼 것이 이긴다.
      {...rest}
      type="button"
      data-slot="card-log-button"
      data-log={kind}
      aria-label={badge > 0 ? `${kind}, 새 로그 ${badge}건` : undefined}
      className={TRIGGER_CLASS}
    >
      {kind}
      {badge > 0 && (
        <span
          data-slot="card-log-badge"
          aria-hidden="true"
          className="mono inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[10px] font-bold text-[var(--primary-fg)]"
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/** 창 분리 아이콘 — 앱 셸에서는 숨긴다(⑥). */
function PopoutButton({ onClick }: { onClick: () => void }) {
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);
  if (native) return null;
  return (
    <button
      type="button"
      data-slot="card-log-popout"
      aria-label="주문로그 새 창으로 열기"
      title="창 분리"
      onClick={onClick}
      className={cn('native:hidden', ICON_BTN_CLASS)}
    >
      <ExternalLink aria-hidden="true" className="size-[17px]" />
    </button>
  );
}

interface LogDialogProps {
  kind: LogKind;
  stockName: string;
  exchange: RelayExchange;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badge: number;
  onPopout?: () => void;
  children: ReactNode;
}

/**
 * 버튼 + 다이얼로그 틀. `DialogTrigger` 로 감싸 닫으면 포커스가 버튼으로 돌아오고, 열면 초기 포커스는 닫기 버튼이다
 * (stock-info-modal 과 같은 방식).
 */
function LogDialog({ kind, stockName, exchange, open, onOpenChange, badge, onPopout, children }: LogDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <LogTriggerButton kind={kind} badge={badge} />
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        data-log={kind}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          closeRef.current?.focus();
        }}
        className={cn(
          // 폰(<640) — 전체 화면(D5).
          'inset-0 top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-[var(--popover)] p-0 text-[var(--fg)] ring-0 sm:max-w-none',
          // 뷰포트 ≥640 — 가운데 최대 880px · 높이 80dvh(D2). 오버레이라 뷰포트 기준이다(④).
          'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[80dvh] sm:w-[min(880px,calc(100%-48px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--r-md)] sm:border sm:border-[var(--border)] sm:shadow-xl',
        )}
      >
        <div className="flex flex-none items-center gap-2.5 px-4 pt-[calc(14px+var(--app-safe-top))] pb-2 sm:px-5 sm:pt-4 sm:pb-2.5">
          <DialogTitle className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[16px] leading-snug font-bold text-[var(--fg)] sm:text-[18px]">
            <span className="hidden self-center rounded-[6px] bg-[var(--muted)] px-2 py-0.5 text-[12px] leading-normal font-bold text-[var(--muted-fg)] sm:inline">
              {kind}
            </span>
            <span className="min-w-0 break-words">{stockName}</span>
            <span className="text-[12px] font-normal text-[var(--muted-fg)]">
              {exchange}
              <span className="sm:hidden"> · {kind}</span>
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">이 카드 종목의 오늘 {kind}를 시간순으로 봅니다.</DialogDescription>
          {onPopout !== undefined && <PopoutButton onClick={onPopout} />}
          <DialogClose asChild>
            <button ref={closeRef} type="button" data-slot="card-log-close" aria-label="닫기" className={ICON_BTN_CLASS}>
              <XIcon aria-hidden="true" className="size-[18px]" />
            </button>
          </DialogClose>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** 필터줄 — 세그먼트(목업 `.seg`) + 오른쪽 건수. 켜짐 면은 `--seg-on-*`(라이트 흰 면 + 그림자 · 다크 grey300). */
function LogSegments<T extends string>({
  label,
  options,
  value,
  onChange,
  count,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  count: number;
}) {
  return (
    <div className="flex flex-none items-center gap-2 border-b border-[var(--border-subtle)] px-4 pb-2.5 sm:px-5 sm:pb-3">
      <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-[8px] bg-[var(--muted)] p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className="rounded-[6px] px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap text-[var(--muted-fg)] aria-pressed:bg-[var(--seg-on-bg)] aria-pressed:text-[var(--seg-on-fg)] aria-pressed:shadow-[var(--seg-on-shadow)]"
          >
            {o.label}
          </button>
        ))}
      </div>
      <span data-slot="card-log-count" className="mono ml-auto text-[12px] text-[var(--muted-fg)]">
        {count}건
      </span>
    </div>
  );
}

/**
 * 본문 스크롤러 — 다이얼로그 안에서만 마운트된다(열 때마다 맨 아래 · ③). 필터를 바꾸면(`resetKey`) 맨 아래로.
 * `tabIndex=0` + 이름(axe scrollable-region-focusable).
 */
function LogScroller({
  label,
  count,
  resetKey,
  children,
}: {
  label: string;
  count: number;
  resetKey: string;
  children: ReactNode;
}) {
  const stick = useStickToBottom<HTMLDivElement>(count, { resetKey });
  return (
    <div
      ref={stick.ref}
      data-slot="card-log-body"
      tabIndex={0}
      aria-label={label}
      className="min-h-0 flex-1 overflow-y-auto pb-[var(--app-safe-bottom)] sm:pb-0"
    >
      {children}
    </div>
  );
}

/** 빈 박스 — OrderLogList 빈 상태와 같은 문법. */
function EmptyBox({ title }: { title: string }) {
  return (
    <div
      data-slot="card-log-empty"
      className="m-[var(--s-3)] rounded-[var(--r-md)] border border-dashed border-[var(--faint)] px-[var(--s-4)] py-[var(--s-5)] text-center"
    >
      <b className="block text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">{title}</b>
    </div>
  );
}

/* ── 주문로그 (D1 · D2 · D3 · D5) ──────────────────────────────────────── */

/** 구분 배지 색 축 — 새 토큰 0. */
const BADGE_TONE: Record<StrategyEventParts['tone'], string> = {
  buy: 'bg-[var(--up-bg)] text-[var(--up)]',
  sell: 'bg-[var(--down-bg)] text-[var(--down)]',
  market: 'bg-[var(--accent)] text-[var(--accent-fg)]',
  unknown: 'bg-[var(--muted)] text-[var(--muted-fg)]',
  feature: 'bg-[var(--muted)] text-[var(--muted-fg)]',
};

/** 내용 칸 글자색 — 거부 `--destructive` · kind 15 상한가 특징 `--muted-fg`(UI-SPEC ②-2) · 그 밖 `--fg-2`. */
function bodyTone(parts: StrategyEventParts, reject: boolean): string {
  if (reject) return 'text-[var(--destructive)]';
  return parts.tone === 'feature' ? 'text-[var(--muted-fg)]' : 'text-[var(--fg-2)]';
}

/** 내용 칸 — kind 15 잠김 줄의 lead(「잠김 43초」)만 `--up` 600 으로 앞에 두고 「 · 」 뒤 본문(조립기 조각 그대로). */
function LogBody({ parts }: { parts: StrategyEventParts }) {
  if (!parts.lead) return <>{parts.body}</>;
  return (
    <>
      <span data-slot="order-log-lead" className="font-semibold text-[var(--up)]">
        {parts.lead}
      </span>
      {parts.body !== '' && ' · '}
      {parts.body}
    </>
  );
}

function KindBadge({ parts }: { parts: StrategyEventParts }) {
  return (
    <span
      data-slot="card-log-kind"
      className={cn(
        'inline-flex h-5 flex-none items-center rounded-[5px] px-[7px] text-[11px] font-bold whitespace-nowrap',
        BADGE_TONE[parts.tone],
      )}
    >
      {parts.badge}
    </span>
  );
}

// OrderLogList 와 같은 문구(상태 · 빈 · 필터 빈).
const OL_ERROR_TEXT = '오늘 주문로그를 불러오지 못했어요';
const OL_EMPTY_TITLE = '이 종목의 주문로그가 없어요';
const FILTERED_EMPTY_TITLE = '조건에 맞는 로그가 없어요';
const OL_HEADERS = ['시각', '주문번호', '구분', '행위', '내용', '누적'] as const;

export interface CardOrderLogPopupProps {
  /** 작업대 공용 피드(②). */
  feed: OrderLogFeed;
  /** 카드 계좌 — 빈 문자열 = 계좌 없음(시세 이벤트만). */
  accountNo: string;
  isin: string;
  exchange: RelayExchange;
  stockName: string;
}

export function CardOrderLogPopup({ feed, accountNo, isin, exchange, stockName }: CardOrderLogPopupProps) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<OrderLogSideFilter>('all');
  const account = accountNo === '' ? null : accountNo;
  // D1 — 가려짐 = 팝업 닫힘. 열면 0.
  const unseen = useUnseenOrderLogCount(feed, { accountNo: account, isin, exchange }, open);

  const scoped = useMemo(
    () => (open ? feed.rows.filter((r) => inScope(r, { accountNo: account, isin, exchange })) : []),
    [open, feed.rows, account, isin, exchange],
  );
  const visible = useMemo(() => scoped.filter((r) => matchesSide(r, side)), [scoped, side]);
  const summary = useMemo(() => orderLogSummary(scoped), [scoped]);

  const onOpenChange = (next: boolean) => {
    if (next) setSide('all'); // 다시 열면 전체부터.
    setOpen(next);
  };

  const popout = () => {
    const today = kstDateIso();
    const query = orderLogQueryString(
      {
        account,
        date: feed.date || today,
        filters: { stock: isin, ex: exchange, kind: sideFilterKind(side) },
      },
      today,
    );
    openOrderLogWindow(query === '' ? ORDER_LOG_WINDOW_PATH : `${ORDER_LOG_WINDOW_PATH}?${query}`);
  };

  const lines = visible.map((row) => ({
    row,
    key: strategyEventKey(row),
    parts: strategyEventParts(row, 'log'),
    market: isMarketStrategyEvent(row.kind),
    reject: row.kind === 8,
    fresh: feed.newKeys.has(strategyEventKey(row)),
  }));

  return (
    <LogDialog
      kind="주문로그"
      stockName={stockName}
      exchange={exchange}
      open={open}
      onOpenChange={onOpenChange}
      badge={unseen}
      onPopout={popout}
    >
      <div
        data-slot="card-log-summary"
        className="flex flex-none flex-wrap gap-x-4 gap-y-1 px-4 pb-2.5 text-[12px] text-[var(--muted-fg)] sm:px-5 sm:pb-3"
      >
        <SummaryItem label="주문" value={NUM.format(summary.orders)} />
        <SummaryItem label="체결" value={NUM.format(summary.fills)} />
        <SummaryItem label="거부" value={NUM.format(summary.rejects)} danger />
        <SummaryItem label="취소" value={NUM.format(summary.cancels)} />
        <SummaryItem label="누적" value={summary.cum === null ? '—' : NUM.format(summary.cum)} />
      </div>
      <LogSegments label="구분" options={ORDER_LOG_SIDE_FILTERS} value={side} onChange={setSide} count={visible.length} />
      <LogScroller label="주문로그 목록" count={visible.length} resetKey={side}>
        {feed.status === 'error' && (
          <div role="status" data-slot="card-log-error" className="px-5 pt-2.5 pb-0.5 text-[12px] leading-[1.5] text-[var(--muted-fg)]">
            {OL_ERROR_TEXT}
            <button type="button" onClick={feed.retry} className="ml-1.5 font-semibold text-[var(--accent-fg)] hover:underline">
              다시 시도
            </button>
          </div>
        )}
        {feed.status === 'loading' && scoped.length === 0 && (
          <div data-slot="card-log-loading" className="px-5 pt-2.5 pb-2 text-[12px] leading-[1.5] text-[var(--faint)]">
            불러오는 중…
          </div>
        )}
        {scoped.length > 0 && visible.length === 0 && <EmptyBox title={FILTERED_EMPTY_TITLE} />}
        {feed.status === 'ready' && scoped.length === 0 && <EmptyBox title={OL_EMPTY_TITLE} />}
        {lines.length > 0 && (
          <>
            {/* 표(≥640). ui/table 은 overflow-x-auto 래퍼가 sticky 머리를 깨므로 쓰지 않는다. */}
            <table data-slot="card-log-table" className="hidden w-full border-separate border-spacing-0 text-[12.5px] sm:table">
              <thead>
                <tr>
                  {OL_HEADERS.map((h) => (
                    <th key={h} scope="col" className={cn(TH_CLASS, h === '누적' && 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map(({ row, key, parts, market, reject, fresh }) => {
                  const bg = reject ? ERR_BG : TD_HOVER;
                  return (
                    <tr
                      key={key}
                      data-slot="card-log-row"
                      data-kind={row.kind}
                      data-reject={reject ? '' : undefined}
                      data-new={fresh ? '' : undefined}
                      className="group"
                    >
                      <td className={cn(TD_CLASS, bg, 'mono whitespace-nowrap text-[var(--muted-fg)]', fresh && NEW_EDGE)}>
                        {formatKstMs(row.gwTimeMs)}
                      </td>
                      <td className={cn(TD_CLASS, bg, 'mono whitespace-nowrap text-[var(--muted-fg)]')}>
                        {market ? '' : orderNoTail(row.orderNo)}
                      </td>
                      <td className={cn(TD_CLASS, bg, 'whitespace-nowrap')}>
                        <KindBadge parts={parts} />
                      </td>
                      <td className={cn(TD_CLASS, bg, 'font-semibold whitespace-nowrap', reject && 'text-[var(--destructive)]')}>
                        {parts.action ?? ''}
                      </td>
                      <td className={cn(TD_CLASS, bg, BODY_TEXT, bodyTone(parts, reject))}>
                        <LogBody parts={parts} />
                      </td>
                      <td className={cn(TD_CLASS, bg, 'mono text-right whitespace-nowrap')}>{NUM.format(row.cumVolume)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* 폰(<640) 두 줄 행(D5) — 1줄 시각 · 배지 · 행위 · 번호 · 오른쪽 누적 / 2줄 내용 전체. */}
            <ol data-slot="card-log-phone-list" className="m-0 list-none p-0 text-[12.5px] sm:hidden">
              {lines.map(({ row, key, parts, market, reject, fresh }) => (
                <li
                  key={key}
                  data-slot="card-log-phone-row"
                  data-kind={row.kind}
                  data-reject={reject ? '' : undefined}
                  data-new={fresh ? '' : undefined}
                  className={cn('border-b border-[var(--border-subtle)] px-4 py-2.5', reject && ERR_BG, fresh && NEW_EDGE)}
                >
                  <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                    <span className="mono flex-none text-[var(--muted-fg)]">{formatKstMs(row.gwTimeMs).slice(0, 8)}</span>
                    <KindBadge parts={parts} />
                    {parts.action !== null && (
                      <span className={cn('flex-none font-semibold', reject && 'text-[var(--destructive)]')}>{parts.action}</span>
                    )}
                    {!market && <span className="mono flex-none text-[var(--muted-fg)]">{orderNoTail(row.orderNo)}</span>}
                    <span className="mono ml-auto flex-none pl-1 text-[var(--muted-fg)]">{parts.cum}</span>
                  </div>
                  {(parts.body !== '' || Boolean(parts.lead)) && (
                    <div className={cn('mt-1', BODY_TEXT, bodyTone(parts, reject))}>
                      <LogBody parts={parts} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </LogScroller>
    </LogDialog>
  );
}

/* ── 전략로그 (D1 · D4 · D5) ────────────────────────────────────────────── */

type StratFilter = 'all' | 'error';
const STRAT_FILTERS: ReadonlyArray<{ value: StratFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'error', label: '오류만' },
];
const STRAT_EMPTY_TITLE = '로그 없음'; // 기존 카드 탭 문구
const STRAT_HEADERS = ['시각', '내용'] as const;

export interface CardStrategyLogPopupProps {
  /** 카드 훅 로그 — **최신이 index 0**. */
  entries: readonly StrategyLogEntry[];
  stockName: string;
  exchange: RelayExchange;
}

export function CardStrategyLogPopup({ entries, stockName, exchange }: CardStrategyLogPopupProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<StratFilter>('all');
  // 카드 로그는 최신이 위(index 0)다 — 팝업은 위 → 아래 = 시간 흐름이라 뒤집어 그린다(D4 · ③).
  const visible = useMemo(() => {
    const asc = [...entries].reverse();
    return filter === 'error' ? asc.filter((e) => e.level === 'error') : asc;
  }, [entries, filter]);

  const onOpenChange = (next: boolean) => {
    if (next) setFilter('all'); // 다시 열면 전체부터.
    setOpen(next);
  };

  return (
    <LogDialog kind="로그" stockName={stockName} exchange={exchange} open={open} onOpenChange={onOpenChange} badge={0}>
      <LogSegments label="보기" options={STRAT_FILTERS} value={filter} onChange={setFilter} count={visible.length} />
      <LogScroller label="로그 목록" count={visible.length} resetKey={filter}>
        {entries.length === 0 && <EmptyBox title={STRAT_EMPTY_TITLE} />}
        {entries.length > 0 && visible.length === 0 && <EmptyBox title={FILTERED_EMPTY_TITLE} />}
        {visible.length > 0 && (
          <>
            <table data-slot="card-log-table" className="hidden w-full border-separate border-spacing-0 text-[12.5px] sm:table">
              <thead>
                <tr>
                  {STRAT_HEADERS.map((h) => (
                    <th key={h} scope="col" className={TH_CLASS}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => {
                  const error = entry.level === 'error';
                  const bg = error ? ERR_BG : TD_HOVER;
                  return (
                    <tr key={entry.id} data-slot="card-log-row" data-level={entry.level ?? 'info'} className="group">
                      <td className={cn(TD_CLASS, bg, 'mono w-[90px] whitespace-nowrap text-[var(--muted-fg)]')}>{entry.at}</td>
                      <td className={cn(TD_CLASS, bg, BODY_TEXT, error ? 'text-[var(--destructive)]' : 'text-[var(--fg-2)]')}>
                        {entry.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* 폰(<640) 두 줄 행(D5) — 1줄 시각 / 2줄 내용. */}
            <ol data-slot="card-log-phone-list" className="m-0 list-none p-0 text-[12.5px] sm:hidden">
              {visible.map((entry) => {
                const error = entry.level === 'error';
                return (
                  <li
                    key={entry.id}
                    data-slot="card-log-phone-row"
                    data-level={entry.level ?? 'info'}
                    className={cn('border-b border-[var(--border-subtle)] px-4 py-2.5', error && ERR_BG)}
                  >
                    <div className="mono text-[var(--muted-fg)]">{entry.at}</div>
                    <div className={cn('mt-1', BODY_TEXT, error ? 'text-[var(--destructive)]' : 'text-[var(--fg-2)]')}>
                      {entry.text}
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </LogScroller>
    </LogDialog>
  );
}

function SummaryItem({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <span className="whitespace-nowrap">
      {label}
      <b className={cn('mono ml-1 font-semibold', danger ? 'text-[var(--destructive)]' : 'text-[var(--fg)]')}>{value}</b>
    </span>
  );
}
