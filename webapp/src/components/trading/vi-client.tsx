'use client';

/**
 * ViClient — VI 변동성완화 종합주문 본문 (`/trading/vi`, TRADE-02 · UI-SPEC B1~B9).
 *
 * ① 무엇을 조립하는가
 *   상태줄(B1) → [설정 카드 + 시작/중지 바(B2·B3) | 미체결 → 잔고 세로 스택(B7·B8)]
 *   → VI 주문내역(B5, **전폭 최하단**). 레이아웃 정본은 채택 목업
 *   `16-vi-trigger-mockup.html` 이고 ≥1280 은 `420px | 556px`(R3)다.
 *   ★ 모바일 세로 순서는 다르다 — 상태줄 → 설정·시작/중지 → **VI 주문내역** → 미체결 →
 *     잔고. 좁은 화면에서는 「지금 뭐가 잡혔나」가 잔고보다 먼저다. 순서 차이는 `order`
 *     유틸로만 만들고 DOM 을 두 벌로 만들지 않는다.
 *
 * ② ★ 남의 거부를 내 거부로 그리지 않는다 (Pitfall 9)
 *   `ServerMessage(54)` 는 상따 거부도 같은 채널로 온다. VI 몫 판정은
 *   `isViServerMessage`(`lib/vi-alert.ts`) 한 곳이고, 그 함수는 상따 판정
 *   (`isLimitChaserServerMessage`, 16-13)을 **재사용**한다 — 규칙을 여기 다시 쓰지 않는다.
 *
 * ③ ★ 「보냈다」와 「반영됐다」는 다른 사건이다 (Pitfall 8 · T-16-07)
 *   서버는 거부를 응답 코드로 주지 않는다. **61 에코가 오지 않는 것이 곧 거부**이므로
 *   3초 안에 에코가 없으면 상태줄에 「미반영」을 세운다.
 *   ★ **자동 재전송 경로를 만들지 않는다**(T-16-10). 이 화면의 재전송은 사람이 누르지
 *     않은 두 번째 **무인 자동매수 등록**이다.
 *
 * ④ ★ 15:40 서버 자동 비활성화는 **드롭될 수 있다** (Pitfall 19)
 *   서버는 장 마감에 전략을 내리고 `run=false` 에코를 Broadcast 하는데, 그 프레임을 놓치면
 *   화면이 「가동 중」으로 남는다. 그래서 시각으로도 판정해 상태줄에 **「장 마감」**을 함께
 *   세운다. 주기 재조회는 만들지 않는다(D-13) — 표시를 하나 더 두는 쪽이 싸다.
 *
 * ⑤ ★ 빈 61(미등록)은 입력을 지우지 않는다 (WinForms CR-01)
 *   판정은 `viTrigger` **3상태**(`undefined` 미조회 / `null` 미등록 / 객체)이고 뭉개지 않는다.
 *   뭉개면 「미조회」와 「미등록」이 같아져, 연결 중에 사용자가 친 값이 지워진다.
 *
 * ⑥ ★ 거래소 필터·「전체 취소」는 **이 화면이 소유한다**
 *   `AccountPanel` 은 3표면 공용이라 표면별 필터·확인 문구를 넣지 않는다(16-10 규율).
 *   여기서 걸러 낸 `account` 를 넘기고, 헤더 자리(`unfilledHeaderActions`)만 빌린다.
 *
 * ⑦ ★ 마감알림 타이머는 화면이 소유한다
 *   `scheduleViAlert` 는 순수 함수라 시각만 계산한다. 주문 1건당 `setTimeout` 하나를 걸고
 *   같은 주문에 두 번 걸지 않는다 — 73 델타는 같은 주문을 여러 번 실어 오므로, 무조건
 *   걸면 한 종목이 여러 번 울린다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RELAY_STATE_LABELS } from '@gh-radar/shared';
import type { RelayAccountState, RelayUnfilled, RelayViSetMsg } from '@gh-radar/shared';

import { AccountPanel } from '@/components/orderbook/account-panel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DmaGate, useDmaGateReason } from '@/components/trading/dma-gate';
import { ViOrderList } from '@/components/trading/vi-order-list';
import { VI_ACK_TIMEOUT_MS, ViSettingsCard } from '@/components/trading/vi-settings-card';
import { useRelayContext } from '@/lib/relay-provider';
import { isViServerMessage, notifyViEnd, readViAlertEnabled, scheduleViAlert } from '@/lib/vi-alert';
import { viOrderKey, type RelayServerMessageEntry, type RelayStatus } from '@/lib/use-relay-socket';
import { cn } from '@/lib/utils';

/** 에코 배너 자동 소멸(ms) — UI-SPEC A3 「6초 배너」와 같은 값이다. */
export const VI_ECHO_BANNER_MS = 6_000;

/** 장 마감(서버 전략 자동 비활성화) 시각 — 15:40 (④). */
export const MARKET_CLOSE_HOUR = 15;
export const MARKET_CLOSE_MINUTE = 40;

/** 거래소 필터 3종. `ALL` 은 필터를 걸지 않는다. */
type ExchangeFilter = 'ALL' | 'KRX' | 'NXT';
const EXCHANGE_FILTERS: readonly { value: ExchangeFilter; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'KRX', label: 'KRX' },
  { value: 'NXT', label: 'NXT' },
];

/** 점멸 도트를 쓰는 진행 상태 — `me-client`·`limit-chaser-client` 와 같은 집합이다. */
const PROGRESS_STATES: ReadonlySet<RelayStatus> = new Set<RelayStatus>([
  'idle',
  'connecting',
  'logging_in',
  'declaring',
]);

/**
 * `HH:MM:SS` — **로케일 포맷터를 쓰지 않는다**(16-13 실측).
 * `toLocaleTimeString("ko-KR", { hour12: false })` 는 Chromium 에서 `0시 57분 16초` 를
 * 돌려주고, 상태줄의 시각은 `.mono` 고정폭 계약이라 한글 조사가 섞이면 매 초 폭이 달라진다.
 */
export function clockNow(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/** 장 마감(15:40) 이후인가 (**순수 함수**, ④). */
export function isAfterMarketClose(now: Date = new Date()): boolean {
  return (
    now.getHours() > MARKET_CLOSE_HOUR ||
    (now.getHours() === MARKET_CLOSE_HOUR && now.getMinutes() >= MARKET_CLOSE_MINUTE)
  );
}

export function ViClient() {
  const gateReason = useDmaGateReason();
  // 게이트는 본문을 **대체**한다(B9). 아래 본문의 훅이 돌지 않도록 컴포넌트를 가른다.
  if (gateReason !== null) {
    return <DmaGate reason={gateReason} surface="VI 자동매수" />;
  }
  return <ViSurface />;
}

function ViSurface() {
  const relay = useRelayContext();
  const { accounts, accountStates, viTrigger, viOrders, messages, status, statusLabel, sendOrder } =
    relay;

  /* ── 계좌 축 ──────────────────────────────────────────────────────── */

  /**
   * 표시 계좌 — 설정의 계좌를 따라간다. VI 는 세션당 1건이라 「그 전략의 계좌」가 곧
   * 이 화면의 계좌다. 아직 모르면 첫 계좌를 쓴다.
   */
  const accountNo = viTrigger?.accountNo ?? accounts[0]?.accountNo ?? '';
  const accountState = accountNo === '' ? null : (accountStates.get(accountNo) ?? null);

  /* ── 거래소 필터 + 전체 취소 (⑥) ─────────────────────────────────── */

  const [exchangeFilter, setExchangeFilter] = useState<ExchangeFilter>('ALL');

  const filteredUnfilled = useMemo<RelayUnfilled[]>(() => {
    const rows = accountState?.unf ?? [];
    return exchangeFilter === 'ALL' ? [...rows] : rows.filter((r) => r.exchange === exchangeFilter);
  }, [accountState, exchangeFilter]);

  /**
   * 패널에 넘길 계좌 상태. 필터는 **넘기는 행을 줄이는 것**으로만 구현한다 —
   * 패널 안에 필터를 넣으면 3표면이 같은 코드를 공유하는 이점이 사라진다.
   */
  const panelAccount = useMemo<RelayAccountState | null>(() => {
    if (accountState === null) return null;
    if (exchangeFilter === 'ALL') return accountState;
    return { ...accountState, unf: filteredUnfilled };
  }, [accountState, exchangeFilter, filteredUnfilled]);

  const cancellable = useMemo(
    () => filteredUnfilled.filter((r) => r.unfilledQty > 0),
    [filteredUnfilled],
  );

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const cancelAll = useCallback(async () => {
    setBulkOpen(false);
    setBulkBusy(true);
    try {
      /*
        한 건씩 보낸다. `sendOrder` 는 **어떤 경로에서도 reject 하지 않으므로**(16-10)
        `catch` 를 만들지 않는다 — 결과를 모르는 취소에 「실패」를 쓰면 사용자가 재주문한다.
        결과 표시는 패널의 취소 배너와 미체결 목록 자체가 맡는다.
      */
      for (const row of cancellable) {
        await sendOrder({
          kind: 'cancel',
          isin: row.isin,
          exchange: row.exchange,
          accountNo,
          qty: row.unfilledQty,
          price: row.price,
          orgOrderNo: row.orderNo,
        });
      }
    } finally {
      setBulkBusy(false);
    }
  }, [accountNo, cancellable, sendOrder]);

  /* ── 전송 ↔ 에코 상관 (③) ───────────────────────────────────────── */

  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<number | null>(null);
  const [appliedAt, setAppliedAt] = useState<string | null>(null);
  const [unacked, setUnacked] = useState(false);
  const ackTimer = useRef<number | null>(null);
  const [dirtyCount, setDirtyCount] = useState(0);
  /** 마지막으로 보낸 요청. 에코가 오면 비운다. **재전송에 쓰지 않는다.** */
  const pendingRef = useRef<RelayViSetMsg | null>(null);
  /** 에코가 덮은 더티 수 — 배너 문구의 유일한 근거다. 소비 즉시 0 으로 되돌린다. */
  const overwrittenRef = useRef(0);
  /** 스냅샷을 한 번이라도 받았는가. 첫 스냅샷을 「다른 단말」로 읽지 않기 위한 값이다. */
  const seenSnapshotRef = useRef(false);
  const prevTriggerRef = useRef<typeof viTrigger>(undefined);

  const handleSent = useCallback((msg: RelayViSetMsg) => {
    pendingRef.current = msg;
    setUnacked(false);
    if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
    // ★ 여기서 하는 일은 **표시**뿐이다. 타이머가 끝나도 아무것도 다시 보내지 않는다.
    ackTimer.current = window.setTimeout(() => setUnacked(true), VI_ACK_TIMEOUT_MS);
  }, []);

  const handleServerEcho = useCallback((info: { overwrittenDirty: number }) => {
    overwrittenRef.current = info.overwrittenDirty;
  }, []);

  useEffect(() => {
    if (viTrigger === prevTriggerRef.current) return;
    prevTriggerRef.current = viTrigger;
    if (viTrigger === undefined) return; // 미조회는 사건이 아니다(⑤)

    const sent = pendingRef.current;
    pendingRef.current = null;
    if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
    setUnacked(false);
    setAppliedAt(clockNow());

    const hadSnapshot = seenSnapshotRef.current;
    seenSnapshotRef.current = true;

    // 다른 단말 변경 — 내가 보낸 적이 없고, 첫 스냅샷도 아닐 때만이다(D-11).
    const overwritten = overwrittenRef.current;
    overwrittenRef.current = 0;
    if (sent === null && hadSnapshot) {
      const text =
        overwritten > 0
          ? `다른 단말에서 변경돼 수정하던 값 ${overwritten}개가 서버 값으로 바뀌었어요`
          : '다른 단말에서 변경됐어요 · 서버 값으로 맞췄어요';
      setBanner(text);
      if (bannerTimer.current !== null) window.clearTimeout(bannerTimer.current);
      bannerTimer.current = window.setTimeout(() => setBanner(null), VI_ECHO_BANNER_MS);
    }
  }, [viTrigger]);

  useEffect(
    () => () => {
      if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
      if (bannerTimer.current !== null) window.clearTimeout(bannerTimer.current);
    },
    [],
  );

  /* ── ServerMessage(54) — VI 몫만 (②) ────────────────────────────── */

  const lastMsgRef = useRef<RelayServerMessageEntry | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    const seen = lastMsgRef.current;
    const idx = seen === null ? -1 : messages.indexOf(seen);
    // 못 찾으면(상한을 넘겨 밀려났다) 지금 목록 전체가 새것이다.
    const fresh = idx < 0 ? messages : messages.slice(0, idx);
    lastMsgRef.current = messages[0];
    for (const msg of [...fresh].reverse()) {
      if (!isViServerMessage(msg)) continue; // 상따 몫·relay 자기 거부는 여기서 안 그린다
      if (msg.lv === 'ERROR') setLastError(msg.m);
    }
  }, [messages]);

  /* ── 장 마감 표시 (④) ────────────────────────────────────────────── */

  const [marketClosed, setMarketClosed] = useState(false);
  useEffect(() => {
    const tick = () => setMarketClosed(isAfterMarketClose());
    tick();
    // 분 단위면 충분하다 — 초 단위 타이머를 하나 더 돌릴 이유가 없다.
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  /* ── 마감알림 스케줄 (⑦) ────────────────────────────────────────── */

  const [alertEnabled, setAlertEnabled] = useState(false);
  useEffect(() => setAlertEnabled(readViAlertEnabled()), []);
  useViEndAlerts(viOrders, alertEnabled);

  /* ── 파생 표시값 ─────────────────────────────────────────────────── */

  const run = viTrigger?.run === true;
  const sessionReady = status === 'ready';
  const label = statusLabel === '' ? RELAY_STATE_LABELS.connecting : statusLabel;

  return (
    <div data-slot="vi-page" className="flex min-w-0 flex-col gap-[var(--s-2)]">
      <div className="flex flex-wrap items-baseline gap-[var(--s-2)]">
        <h1 className="m-0 text-[length:var(--t-h3)] leading-[var(--lh-tight)] font-semibold text-[var(--fg)]">
          VI 변동성완화 종합주문
        </h1>
        <p className="m-0 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          VI 발동 종목을 상승률 조건으로 자동 매수
        </p>
      </div>

      {/* ── B1 상태줄 ── */}
      <div
        data-slot="vi-status-bar"
        data-status={status}
        aria-live="polite"
        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-caption)] text-[var(--muted-fg)]"
      >
        <span className="inline-flex items-center gap-1.5">
          <Dot tone={sessionReady ? 'ok' : 'off'} pulse={PROGRESS_STATES.has(status)} />
          {/* 연결 문구는 계약 한 곳(`RELAY_STATE_LABELS`)에서만 온다(D-36). */}
          DMA <b className="font-semibold text-[var(--fg)]">{label}</b>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Dot tone={run ? 'run' : 'hollow'} />
          VI <b className="font-semibold text-[var(--fg)]">{run ? '가동' : '중지'}</b>
        </span>
        <span>
          오늘 VI 주문 <b className="font-semibold text-[var(--fg)]">{viOrders.length}건</b>
        </span>
        {/* ④ Broadcast 를 놓쳐도 「가동 중」으로 오해하지 않게 한다. */}
        {marketClosed && (
          <span data-slot="vi-market-closed" className="font-semibold text-[var(--fg)]">
            장 마감
          </span>
        )}
        {unacked && (
          <span data-slot="vi-unacked" className="font-semibold text-[var(--destructive)]">
            미반영 · 서버 응답을 기다리고 있어요
          </span>
        )}
        {lastError !== null && (
          <span role="alert" data-slot="vi-server-error" className="min-w-0 text-[var(--destructive)]">
            {lastError}
          </span>
        )}
        <span className="mono ml-auto">{appliedAt ?? '—'}</span>
      </div>

      {/* ── 에코 배너 (6초) ── */}
      {banner !== null && (
        <p
          role="status"
          data-slot="vi-echo-banner"
          className="m-0 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-caption)] text-[var(--fg)]"
        >
          {banner}
        </p>
      )}

      {/*
        본문 — ≥1280 은 `420px | 556px` 2열이고 VI 주문내역이 그 아래 전폭이다(R3).
        모바일 세로 순서는 `order` 로만 만든다(①). 그리드 자식 전부 `min-w-0` — 빠지면
        `overflow-hidden` 아래에서 스크롤이 아니라 **조용한 잘림**이 된다.
      */}
      <div
        data-slot="vi-body-grid"
        className="grid min-w-0 grid-cols-1 items-start gap-[var(--s-2)] min-[1280px]:grid-cols-[420px_minmax(0,1fr)] min-[1280px]:gap-[var(--s-4)] [&>*]:min-w-0"
      >
        <div className="order-1 flex min-w-0 flex-col">
          <ViSettingsCard
            accounts={accounts}
            server={viTrigger}
            disabled={!sessionReady}
            todayOrderCount={viOrders.length}
            unfilledCount={filteredUnfilled.length}
            appliedAt={appliedAt}
            onSent={handleSent}
            onServerEcho={handleServerEcho}
            onDirtyCountChange={setDirtyCount}
            onAlertToggle={setAlertEnabled}
          />
        </div>

        {/* 미체결 → 잔고 **세로 스택**(R3). `stack` 없이는 ≥1280 에서 556px 이 둘로 쪼개진다. */}
        <section
          data-slot="vi-accounts"
          className="order-3 min-w-0 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] min-[1280px]:order-2"
        >
          <AccountPanel
            selectedAccountNo={accountNo}
            accountName={accounts.find((a) => a.accountNo === accountNo)?.name}
            account={panelAccount}
            originTag="VI"
            status={status}
            stack
            unfilledHeaderActions={
              <>
                <div
                  role="group"
                  aria-label="거래소 필터"
                  data-slot="vi-exchange-filter"
                  className="flex h-7 flex-none overflow-hidden rounded-[var(--r)] border border-[var(--border)]"
                >
                  {EXCHANGE_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      aria-pressed={exchangeFilter === f.value}
                      onClick={() => setExchangeFilter(f.value)}
                      className={cn(
                        'px-2.5 text-[length:var(--t-caption)] font-semibold',
                        exchangeFilter === f.value
                          ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                          : 'bg-[var(--bg)] text-[var(--muted-fg)]',
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {/* 채움 금지 — `--destructive` 는 `--up`(매수)과 같은 색이다(C5). */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-slot="vi-cancel-all"
                  disabled={!sessionReady || bulkBusy || cancellable.length === 0}
                  onClick={() => setBulkOpen(true)}
                  className="h-7 flex-none border-[var(--destructive)] px-2.5 text-[length:var(--t-caption)] text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)]"
                >
                  전체 취소
                </Button>
              </>
            }
          />
        </section>

        {/* ── B5 VI 주문내역 — 데스크톱은 전폭 최하단, 모바일은 미체결보다 위 ── */}
        <ViOrderList
          items={viOrders}
          disabled={!sessionReady}
          className="order-2 min-[1280px]:order-3 min-[1280px]:col-span-2"
        />
      </div>

      <BulkCancelDialog
        open={bulkOpen}
        count={cancellable.length}
        onOpenChange={setBulkOpen}
        onConfirm={cancelAll}
      />

      {/*
        더티 액션 바는 `ViSettingsCard` 가 소유한다. 여기서는 그 개수를 **이탈 경고**에만 쓴다.
        (경고 문구·경로는 상따와 같은 규율이다 — UI-SPEC D6 이 앱 다이얼로그를 4개로 못박아
        이탈 경고는 브라우저 `confirm` 이다.)
      */}
      <LeaveWarning dirty={dirtyCount > 0} />
    </div>
  );
}

/* ───────────────────────────── 조각 ───────────────────────────── */

/** 상태 도트. **형태(채움/속빔)가 색과 함께 상태를 말한다**(WCAG 1.4.1). */
function Dot({ tone, pulse = false }: { tone: 'ok' | 'run' | 'hollow' | 'off'; pulse?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-tone={tone}
      className={cn(
        'block size-[7px] shrink-0 rounded-full',
        tone === 'ok' && 'bg-[oklch(0.72_0.19_150)]',
        tone === 'run' && 'bg-[var(--up)] shadow-[0_0_0_3px_color-mix(in_oklch,var(--up)_25%,transparent)]',
        tone === 'hollow' && 'border-[1.5px] border-[var(--muted-fg)] bg-transparent',
        tone === 'off' && 'bg-[var(--flat)]',
        pulse && 'animate-pulse motion-reduce:animate-none',
      )}
    />
  );
}

/**
 * 미체결 전체 취소 확인 (UI-SPEC §되돌릴 수 없는 액션 4).
 * 기본 포커스는 **닫기**다 — Enter 연타로 미체결이 전부 날아가면 안 된다.
 */
function BulkCancelDialog({
  open,
  count,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const dismissRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-sm"
        data-testid="vi-cancel-all-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          dismissRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>미체결 주문을 전부 취소할까요?</DialogTitle>
          <DialogDescription>{count}건이 한 번에 취소돼요.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" autoFocus ref={dismissRef} onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onConfirm}
            className="border-[var(--destructive)] bg-transparent text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)]"
          >
            ✕ 전체 취소
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 이탈 경고 문구 — UI-SPEC §CTA verbatim. 상따와 **같은 말**을 쓴다. */
const LEAVE_WARNING = '수정하지 않은 값이 있어요. 이 페이지를 벗어나면 사라져요.';

/**
 * 더티일 때**만** 이탈을 확인한다. 더티 0 에도 걸어 두면 「저장할 게 없는데 나갈 때마다
 * 물어보는 화면」이 되고, 사용자는 곧 경고를 읽지 않게 된다.
 */
function LeaveWarning({ dirty }: { dirty: boolean }) {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = LEAVE_WARNING;
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank') return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      if (window.confirm(LEAVE_WARNING)) return; // 나가겠다고 했다
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    // capture 단계에서 잡아야 Next `<Link>` 의 핸들러보다 먼저 막을 수 있다.
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);
  return null;
}

/**
 * VI 마감 알림 타이머 (⑦).
 *
 * 주문 1건당 타이머 하나. 73 델타는 **같은 주문을 여러 번** 실어 오므로 키로 중복을 막지
 * 않으면 한 종목이 여러 번 울린다. 스위치가 꺼져 있으면 타이머 자체를 걸지 않는다 —
 * 걸어 두고 발화 시점에 판단하면, 끄고 나서도 이미 걸린 알림이 울린다.
 */
function useViEndAlerts(items: readonly { viEndTime: string; isin: string; name?: string; orderNo: string; accountNo: string; triggerPrice: number }[], enabled: boolean): void {
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    const map = timers.current;
    if (!enabled) return;
    for (const item of items) {
      const key = viOrderKey(item as Parameters<typeof viOrderKey>[0]);
      if (map.has(key)) continue;
      const { at } = scheduleViAlert(item);
      const delay = at.getTime() - Date.now();
      if (delay <= 0) continue; // 이미 지난 알림은 만들지 않는다(뒤늦은 알림은 소음이다)
      const label = item.name !== undefined && item.name !== '' ? item.name : item.isin;
      map.set(
        key,
        window.setTimeout(() => {
          map.delete(key);
          notifyViEnd(label);
        }, delay),
      );
    }
  }, [items, enabled]);

  // 언마운트 시 전부 정리 — 화면을 떠난 뒤 울리는 알림은 사용자가 원인을 찾을 수 없다.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const id of map.values()) window.clearTimeout(id);
      map.clear();
    };
  }, []);
}
