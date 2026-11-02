'use client';

import type { ReactNode } from 'react';

import { CARD } from '@/components/layout/page-layout';
import type { NodataReason } from '@/lib/ticks/tick-url';
import { cn } from '@/lib/utils';

/**
 * 틱 전문 뷰어 상태 카드 (Phase 37 D-03 · D-16 · D-22 · 진입 목업 A `.state` · `.center` · `.prog`).
 *
 * - `converting` — 요청 변환 중(주황 `--vi` · 불확정 진행 바 · 취소). 끝나면 호출부 폴링이 카드를 걷고 연다.
 * - `live-loading` — 당일 08:00~지금 하루치 받는 중(빨강 `--up` · 진행 바 · 대기 k건 · 취소). 37-19 가 켠다.
 * - `nodata` — 휴장 · 미래 · 업로드 전(오늘 20:00 뒤 · 서버 `NOT_UPLOADED`) · 보관 밖(90일). 「최근 거래일로」 — 보관 밖만
 *   「이 종목만 변환(약 N분)」 을 함께(D-04 — GCS 원본은 영구라 다시 만들 수 있다). 업로드 전에는 재시도 버튼이 없다.
 * - `live-unavailable` — 「당일 자료 준비 중」(D-22 — 당일 경로가 아직 꺼져 있다 · today 응답 live=false).
 * - `error` — 「변환에 실패했어요」 · 한도 · 미설정 · 불러오기 실패 — 문구는 호출부가 준다.
 * 진행 바는 `tick-indeterminate` 유틸(globals.css) + `motion-reduce:animate-none` — 동작 줄이기면 멈춘다.
 */

export type TickStateCardProps =
  | { variant: 'converting'; subject?: string; etaMin: number; onCancel: () => void }
  | { variant: 'live-loading'; subject?: string; queued: number; progress: number | null; onCancel: () => void }
  | {
      variant: 'nodata';
      reason: NodataReason;
      /** 「10/31 (토)」 — 제목 앞머리. */
      dateLabel?: string;
      /** 최근 거래일(격자 있는 최근 날짜)로 — 날짜 이력이 없으면 null(버튼 없음). */
      onLatest: (() => void) | null;
      onConvert?: () => void;
      etaMin?: number;
    }
  | { variant: 'live-unavailable'; onLatest: (() => void) | null }
  | { variant: 'error'; message: string; onRetry?: () => void; onBack?: () => void };

const NODATA_BODY: Record<NodataReason, string> = {
  holiday: '거래일이 아니에요(주말 · KRX 휴장일).',
  future: '아직 자료가 쌓이지 않은 시간이에요 · 장은 평일 08:00 에 열려요.',
  'not-uploaded': '원본이 아직 올라오지 않았어요 · 매일 22:00 업로드 · 23:30 뒤 다시 열면 변환돼요',
  retention: '보관 기간(90일) 밖이에요 · 원본은 남아 있어 이 종목만 다시 변환할 수 있어요.',
};

const BTN = 'h-[30px] rounded-[9px] px-3 text-[12px] font-semibold whitespace-nowrap';
const BTN_SUB = cn(BTN, 'bg-[var(--muted)] text-[var(--fg)] hover:bg-[var(--raised-2)]');
const BTN_PRI = cn(BTN, 'bg-[var(--primary)] text-[var(--primary-fg)]');

function Progress({ tone, value }: { tone: 'vi' | 'up'; value: number | null }) {
  const fill = tone === 'vi' ? 'bg-[var(--vi)]' : 'bg-[var(--up)]';
  const pct = value === null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label="진행"
      aria-valuemin={pct === null ? undefined : 0}
      aria-valuemax={pct === null ? undefined : 100}
      aria-valuenow={pct ?? undefined}
      className="mx-4 mb-3.5 h-1 overflow-hidden rounded-[2px] bg-[var(--muted)]"
    >
      {pct === null ? (
        <i className={cn('block h-full w-[38%] rounded-[2px]', fill, 'tick-indeterminate motion-reduce:animate-none')} />
      ) : (
        <i className={cn('block h-full rounded-[2px]', fill)} style={{ width: `${pct}%` }} />
      )}
    </div>
  );
}

function RowCard({
  variant,
  tone,
  icon,
  title,
  body,
  onCancel,
  progress,
}: {
  variant: string;
  tone: 'vi' | 'up';
  icon: string;
  title: string;
  body: string;
  onCancel: () => void;
  progress: number | null;
}) {
  return (
    <section
      data-slot="tick-state"
      data-variant={variant}
      aria-live="polite"
      className={cn(CARD, 'overflow-hidden rounded-[14px]')}
    >
      <div className="flex flex-wrap items-center gap-3.5 px-4 py-3.5 sm:flex-nowrap">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-10 flex-none place-items-center rounded-[12px] text-[18px]',
            tone === 'vi' ? 'bg-[var(--vi-bg)] text-[var(--vi)]' : 'bg-[var(--up-bg)] text-[var(--up)]',
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <b className="text-[13.5px] font-bold break-keep text-[var(--fg)]">{title}</b>
          <p className="m-0 mt-0.5 text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]">{body}</p>
        </div>
        <div className="ml-[54px] flex gap-1.5 sm:ml-auto">
          <button type="button" onClick={onCancel} className={BTN_SUB}>
            취소
          </button>
        </div>
      </div>
      <Progress tone={tone} value={progress} />
    </section>
  );
}

function CenterCard({
  variant,
  title,
  body,
  alert,
  icon = '∅',
  children,
}: {
  variant: string;
  icon?: string;
  title: string;
  body?: string;
  alert?: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      data-slot="tick-state"
      data-variant={variant}
      role={alert ? 'alert' : undefined}
      className={cn(CARD, 'flex flex-col items-center gap-2.5 rounded-[14px] px-4 py-12 text-center')}
    >
      <span
        aria-hidden="true"
        className="grid size-11 place-items-center rounded-[14px] bg-[var(--muted)] text-[20px] text-[var(--muted-fg)]"
      >
        {icon}
      </span>
      <h2 className="m-0 text-[16px] font-bold break-keep text-[var(--fg)]">{title}</h2>
      {body !== undefined && (
        <p className="m-0 max-w-[420px] text-[12.5px] leading-[1.6] break-keep text-[var(--muted-fg)]">{body}</p>
      )}
      {children !== undefined && <div className="flex flex-wrap justify-center gap-1.5">{children}</div>}
    </section>
  );
}

export function TickStateCard(props: TickStateCardProps) {
  switch (props.variant) {
    case 'converting':
      return (
        <RowCard
          variant="converting"
          tone="vi"
          icon="⟳"
          title={props.subject ? `${props.subject} 변환 중` : '변환 중'}
          body={`원본(GCS)에서 이 종목만 꺼내 격자로 만들고 있어요 · 약 ${props.etaMin}분 · 끝나면 자동으로 열려요. 한 번 변환하면 90일 동안 바로 열려요.`}
          onCancel={props.onCancel}
          progress={null}
        />
      );
    case 'live-loading':
      return (
        <RowCard
          variant="live-loading"
          tone="up"
          icon="●"
          title={`${props.subject ? `${props.subject} · ` : ''}오늘 · 08:00~지금 하루치 받는 중`}
          body={`119 에서 전문을 가져오고 있어요 · 지금 대기 ${props.queued}건 · 받은 뒤에는 5초마다 새 틱만 이어 받아요(끝 틱을 보고 있을 때만).`}
          onCancel={props.onCancel}
          progress={props.progress}
        />
      );
    case 'nodata': {
      const head = props.dateLabel ? `${props.dateLabel} ` : '';
      const title = props.reason === 'not-uploaded' ? `${head}자료 없음 · 원본 업로드 전` : `${head}자료가 없어요`;
      return (
        <CenterCard variant="nodata" title={title} body={NODATA_BODY[props.reason]}>
          {props.onLatest !== null && (
            <button type="button" onClick={props.onLatest} className={BTN_SUB}>
              최근 거래일로
            </button>
          )}
          {props.onConvert !== undefined && (
            <button type="button" onClick={props.onConvert} className={BTN_PRI}>
              이 종목만 변환(약 {props.etaMin ?? 1}분)
            </button>
          )}
        </CenterCard>
      );
    }
    case 'live-unavailable':
      return (
        <CenterCard
          variant="live-unavailable"
          title="당일 자료 준비 중"
          body="119 당일 경로가 켜지면 여기서 바로 열려요 · 과거 날짜는 지금 볼 수 있어요"
        >
          {props.onLatest !== null && (
            <button type="button" onClick={props.onLatest} className={BTN_SUB}>
              최근 거래일로
            </button>
          )}
        </CenterCard>
      );
    case 'error':
      return (
        <CenterCard variant="error" icon="!" title={props.message} alert>
          {props.onBack !== undefined && (
            <button type="button" onClick={props.onBack} className={BTN_SUB}>
              목록으로
            </button>
          )}
          {props.onRetry !== undefined && (
            <button type="button" onClick={props.onRetry} className={BTN_PRI}>
              다시 시도
            </button>
          )}
        </CenterCard>
      );
  }
}
