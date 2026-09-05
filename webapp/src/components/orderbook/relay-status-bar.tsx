'use client';

/**
 * RelayStatusBar — 호가창 섹션 상단 **전폭 상태 바** (UI-SPEC 확정 L6, C2 + C3).
 *
 * 무엇을 어디에: 호가주문 탭 섹션 헤더 바로 아래, 사다리/주문 패널보다 **위**.
 * 주문 가능 여부는 사다리를 보기 전에 알아야 하므로 배지 · 안내 문구 · ServerMessage
 * 누적을 한 자리에 모은다.
 *
 * ★ LOCKED 색 규칙 (UI-SPEC §Color 금지 목록):
 *   - 연결 상태 배지·상태 문구에는 **방향색(상승·하락 시맨틱 토큰)을 쓰지 않는다.**
 *     사다리의 의미색과 충돌해 "빨간 배지 = 상승"으로 오독되기 때문이다.
 *     허용 토큰은 `--muted` / `--muted-fg` / `--fg` / `--destructive` 뿐이다.
 *   - `--destructive` 는 시맨틱 상승색과 **같은 oklch 값**이지만, 상태 표면에는
 *     사다리가 없으므로 혼동 대상이 아니다(충돌은 주문/취소 버튼에서만 문제된다).
 *
 * ★ LOCKED 문구: 본문·보조 문구는 UI-SPEC §Copywriting Contract verbatim 이다.
 *   라벨은 `@gh-radar/shared` 의 `RELAY_STATE_LABELS` 단일 정본을 쓴다 — 브라우저가
 *   상태 → 문구 switch 를 중복 구현하지 않는다(D-36).
 *
 * 토스트를 쓰지 않는다. 저장소에 토스트 라이브러리가 없고, D-36 이 `ServerMessage` 를
 * "상태 영역 누적"으로 이미 고정했다. 알림 채널은 이 바 하나뿐이다.
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { RELAY_STATE_LABELS } from '@gh-radar/shared';
import type { RelayAccount, RelayExchange } from '@gh-radar/shared';
import {
  RELAY_MAX_RECONNECT_ATTEMPTS,
  relayBackoffDelayMs,
  type RelayServerMessageEntry,
  type RelayStatus,
} from '@/lib/use-relay-socket';

/** 알림 영역에 노출하는 최근 건수 (UI-SPEC C3). */
const VISIBLE_MESSAGES = 3;

/** 배지 톤 — 전부 중립/`--destructive` 계열. 방향색은 이 표면에 존재하지 않는다. */
type Tone = 'progress' | 'ready' | 'warn' | 'fail' | 'none';

const TONE_CLASS: Record<Tone, string> = {
  progress: 'bg-transparent border-[var(--border)] text-[var(--muted-fg)]',
  ready: 'bg-[var(--muted)] border-[var(--border)] text-[var(--fg)]',
  warn: 'bg-transparent border-[var(--destructive)] text-[var(--destructive)]',
  fail: 'border-transparent bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)] text-[var(--destructive)]',
  none: 'border-transparent bg-[var(--muted)] text-[var(--muted-fg)]',
};

interface StatusCopy {
  tone: Tone;
  /** 배지 라벨. `ready`/`reconnecting` 은 계좌 수·시도 회차를 덧붙인다. */
  label: string;
  /** 본문 문구. */
  body: string;
  /** 보조 문구. 빈 문자열이면 렌더하지 않는다. */
  sub: string;
}

/**
 * 상태 → 문구 표. UI-SPEC §Copywriting "연결 상태 배지 6종 + 게이트 2종" verbatim.
 * `manual_required` 는 `failed` 톤을 재사용하고 문구만 바꾼다.
 * `idle` 은 아직 연결을 시작하지 않은 초기 로딩(C2 `불러오는 중…`)이다.
 */
const STATUS_COPY: Record<RelayStatus, StatusCopy> = {
  idle: {
    tone: 'progress',
    label: '불러오는 중…',
    body: '호가를 불러오는 중이에요…',
    sub: '',
  },
  connecting: {
    tone: 'progress',
    label: RELAY_STATE_LABELS.connecting,
    body: '증권사 시세 서버에 연결하는 중이에요…',
    sub: '잠시만 기다려 주세요.',
  },
  logging_in: {
    tone: 'progress',
    label: RELAY_STATE_LABELS.logging_in,
    body: '증권사에 로그인하는 중이에요…',
    sub: '보통 2~3초 걸려요.',
  },
  declaring: {
    tone: 'progress',
    label: RELAY_STATE_LABELS.declaring,
    body: '계좌 정보를 확인하는 중이에요…',
    sub: '계좌 목록을 받으면 주문할 수 있어요.',
  },
  ready: {
    tone: 'ready',
    label: RELAY_STATE_LABELS.ready,
    body: '호가·체결·잔고가 실시간으로 갱신되고 있어요.',
    sub: '',
  },
  reconnecting: {
    tone: 'warn',
    label: RELAY_STATE_LABELS.reconnecting,
    body: '연결이 끊겨 다시 연결하는 중이에요',
    sub: '표시된 호가는 마지막으로 받은 값이에요.',
  },
  failed: {
    tone: 'fail',
    label: RELAY_STATE_LABELS.failed,
    body: '증권사 회선(VPN)이 끊겼어요',
    sub: '복구되면 자동으로 다시 연결돼요. 계속되면 관리자에게 문의해 주세요.',
  },
  manual_required: {
    tone: 'fail',
    label: RELAY_STATE_LABELS.manual_required,
    body: '다시 연결하지 못했어요',
    sub: '페이지를 새로고침하면 다시 시도해요.',
  },
  session_rejected: {
    tone: 'fail',
    label: RELAY_STATE_LABELS.session_rejected,
    body: '증권사 로그인이 거부돼 재접속을 중단했어요',
    sub: '계정 상태를 확인한 뒤 페이지를 새로고침해 주세요.',
  },
  unauthorized: {
    tone: 'none',
    label: RELAY_STATE_LABELS.unauthorized,
    body: '실시간 호가·주문 권한이 없어요',
    sub: '관리자에게 계정 연결을 문의해 주세요.',
  },
};

/** 점멸 도트를 쓰는 진행 상태들. */
const BLINKING: ReadonlySet<RelayStatus> = new Set<RelayStatus>([
  'idle',
  'connecting',
  'logging_in',
  'declaring',
]);

/** ServerMessage 레벨 원문 → 한글 칩 라벨. 알 수 없는 값은 그대로 노출한다. */
const LEVEL_LABEL: Record<string, string> = {
  INFO: '안내',
  WARN: '경고',
  ERROR: '오류',
};

export interface RelayStatusBarProps {
  /** 훅의 `status`. 배지·문구의 유일한 입력이다. */
  status: RelayStatus;
  /** 서버가 실어 보낸 보조 문구(`{t:"state"}.msg`). 있으면 보조 줄을 대체한다. */
  statusMessage?: string;
  /** 재접속 시도 회차 (1-based). `reconnecting` 에서만 의미가 있다. */
  attempt?: number;
  /** 허용 계좌 목록. `ready` 배지의 `계좌 N개` 원천이다. */
  accounts?: RelayAccount[];
  /** ServerMessage 누적(최신 우선). 최근 3건만 렌더한다. */
  messages?: RelayServerMessageEntry[];
  /** `ready` 보조 문구의 `마지막 체결 HH:MM:SS` — 없으면 생략한다. */
  lastTradeAt?: string;
  /** `ready` 보조 문구의 거래소 — 없으면 생략한다. */
  exchange?: RelayExchange;
  className?: string;
}

export function RelayStatusBar({
  status,
  statusMessage,
  attempt = 0,
  accounts = [],
  messages = [],
  lastTradeAt,
  exchange,
  className,
}: RelayStatusBarProps) {
  const copy = STATUS_COPY[status] ?? STATUS_COPY.idle;
  const recent = messages.slice(0, VISIBLE_MESSAGES);

  const badgeLabel = buildBadgeLabel(status, copy.label, accounts.length, attempt);
  const body = buildBody(status, copy.body, attempt);
  const sub = buildSub(status, copy.sub, statusMessage, lastTradeAt, exchange);

  return (
    <div
      data-slot="relay-status-bar"
      data-status={status}
      className={cn('border-b border-[var(--border)] bg-[var(--muted)]', className)}
    >
      {/* 상태 줄 — UI-SPEC §접근성 라벨 "상태 바 aria-live=polite" */}
      <div
        aria-live="polite"
        className="flex flex-wrap items-center gap-[var(--s-2)] px-[var(--s-4)] py-[var(--s-2)]"
      >
        <Badge
          variant="outline"
          data-tone={copy.tone}
          className={cn('h-6 gap-1.5 px-2.5 text-[length:var(--t-caption)]', TONE_CLASS[copy.tone])}
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-[7px] shrink-0 rounded-full bg-current',
              // prefers-reduced-motion 에서 점멸을 끈다(globals.css 전역 규칙 + 로컬 가드).
              BLINKING.has(status) && 'animate-pulse motion-reduce:animate-none',
            )}
          />
          {badgeLabel}
        </Badge>

        <p className="text-[length:var(--t-sm)] text-[var(--fg)]">
          {body}
          {sub ? (
            <span className="block text-[length:var(--t-caption)] text-[var(--muted-fg)]">
              {sub}
            </span>
          ) : null}
        </p>
      </div>

      {/* ServerMessage 누적 (C3). 토스트 대신 이 영역이 알림의 유일한 채널이다. */}
      <div
        aria-live="polite"
        data-slot="relay-alerts"
        className="flex flex-col gap-1 border-t border-[var(--border-subtle)] px-[var(--s-4)] pt-1.5 pb-[var(--s-2)]"
      >
        {recent.length === 0 ? (
          <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">알림이 없어요</p>
        ) : (
          recent.map((msg, index) => (
            <p
              key={`${msg.receivedAt}-${index}`}
              data-slot="relay-alert-row"
              className="flex items-baseline gap-[var(--s-2)] text-[length:var(--t-caption)]"
            >
              <span className="mono shrink-0 text-[var(--muted-fg)]">{msg.receivedAt}</span>
              <span
                className={cn(
                  'shrink-0 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--card)] px-[5px] font-semibold',
                  msg.lv === 'ERROR' && 'border-[var(--destructive)] text-[var(--destructive)]',
                )}
              >
                {LEVEL_LABEL[msg.lv] ?? msg.lv}
              </span>
              <span className="text-[var(--fg)]">{msg.m}</span>
            </p>
          ))
        )}
      </div>
    </div>
  );
}

/** `실시간 · 계좌 N개` / `재접속 중 k/10` 처럼 라벨에 수치를 덧붙인다. */
function buildBadgeLabel(
  status: RelayStatus,
  label: string,
  accountCount: number,
  attempt: number,
): string {
  if (status === 'ready') return `${label} · 계좌 ${accountCount}개`;
  if (status === 'reconnecting') {
    return `${label} ${attempt}/${RELAY_MAX_RECONNECT_ATTEMPTS}`;
  }
  return label;
}

/** `reconnecting` 본문에 `· k/10회 (다음 n초)` 를 덧붙인다. */
function buildBody(status: RelayStatus, body: string, attempt: number): string {
  if (status !== 'reconnecting') return body;
  const seconds = Math.round(relayBackoffDelayMs(Math.max(attempt, 1)) / 1000);
  return `${body} · ${attempt}/${RELAY_MAX_RECONNECT_ATTEMPTS}회 (다음 ${seconds}초)`;
}

/**
 * 보조 문구. 서버 보조 문구(`{t:"state"}.msg`)가 있으면 그것을 우선한다 —
 * 게이트웨이 거부 사유처럼 정적 표에 없는 정보가 사용자에게 더 유용하다.
 */
function buildSub(
  status: RelayStatus,
  sub: string,
  statusMessage: string | undefined,
  lastTradeAt: string | undefined,
  exchange: RelayExchange | undefined,
): string {
  if (statusMessage && statusMessage.length > 0) return statusMessage;
  if (status === 'ready') {
    if (lastTradeAt && exchange) return `마지막 체결 ${lastTradeAt} · ${exchange}`;
    if (exchange) return exchange;
    return sub;
  }
  return sub;
}
