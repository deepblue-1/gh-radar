'use client';

/**
 * LimitChaserClient — 상따 전략 화면 본문 (`/trading/limit-chaser/{new,[key]}`, TRADE-01).
 *
 * ① 무엇을 조립하는가 (16-UI-SPEC A1~A14)
 *   종목·거래소·계좌 카드 → 상태줄 → (에코 배너) → [호가 10단 | 매수·매도 폼] → 미체결/잔고
 *   → 전략 로그. 레이아웃 정본은 채택 목업 `16-limit-chaser-mockup.html` 이다
 *   (≥1280 `.lc3` 460 | 매수 250 | 매도 250 · <1024 `.lc2` 42% | 1fr · 1024~1279 1열, R1/R2/R7).
 *
 * ② ★ 서버값이 언제나 이긴다 (D-11)
 *   폼은 에코가 오면 더티 필드까지 덮는다. 이 파일의 일은 그 사건을 **사용자가 놓치지 않게**
 *   하는 것이다 — 6초 인라인 배너(`role="status"`) + 전략 로그 1줄 영구 기록. 토스트
 *   라이브러리를 쓰지 않는다(D3): 알림 채널은 상태줄과 로그 둘뿐이다.
 *
 * ③ ★ 「보냈다」와 「반영됐다」는 다른 사건이다 (Pitfall 8 · T-16-07)
 *   서버는 거부를 응답 코드로 주지 않는다. **에코가 오지 않는 것이 곧 거부**이고, 부분 거부는
 *   눕혀진 값으로 온다. 그래서 3초 안에 에코가 없으면 상태줄에 「미반영」을 세운다.
 *   ★ **자동 재전송 경로를 만들지 않는다**(T-16-10). 재전송은 사용자가 누르지 않은 두 번째
 *     등록이고, 그 두 번째가 곧 중복 발주다. 다시 보내는 것은 사람이 「수정」을 누를 때뿐이다.
 *
 * ④ ★ 남의 거부를 내 거부로 그리지 않는다 (Pitfall 9)
 *   `ServerMessage(54)` 는 VI 거부도 같은 채널로 온다. 상따 몫 판정은
 *   `isLimitChaserServerMessage`(`lib/limit-chaser.ts`) **한 곳**이다. VI 통지를 여기서
 *   그리면 사용자가 멀쩡한 상따 전략을 껐다 켠다 — 그 재등록이 두 번째 발주다.
 *
 * ⑤ ★ 삭제는 스위치가 아니라 에코가 판정한다 (D-08 · Pitfall 7)
 *   두 스위치를 끄면 서버가 `crud:"D"` 로 정규화하고, 전역 스냅샷에서 그 전략이 빠진다.
 *   그때 폼을 **remount** 해 빈 상태로 되돌린다 — 값만 지우면 폼의 더티 기준선이 남아
 *   「삭제됐는데 미반영 변경이 3개」 같은 상태가 만들어진다.
 *
 * ⑥ 상태 문구는 계약 한 곳에서 온다
 *   연결 상태는 `RELAY_STATE_LABELS`(D-36), 전략 상태는 `strategyBadgesOf`(16-11).
 *   화면마다 문구를 다시 지으면 호가주문 탭은 「실시간」, 여기는 다른 말이 된다.
 *
 * ⑦ 새로고침 버튼을 만들지 않는다 (D-13)
 *   전략 스냅샷은 wss 인증 직후 자동으로 온다(D-12). 조회 버튼을 두면 「눌러야 최신」이라는
 *   오해가 생기고, 실제로는 누르지 않아도 최신이다.
 *
 * ⑧ 종목명은 **이미 받은 프레임에서만** 얻는다 (T-16-02)
 *   `RelayLimitChaser` 에 종목명이 없다. relay 는 잔고·미체결·VI 주문에만 역매핑 이름을
 *   채워 주므로 그 셋을 훑고, 없으면 ISIN 을 그대로 보여준다. 이름 하나 때문에 별도 조회
 *   경로를 만들지 않는다(`app-sidebar` · `strategy-status-card` 와 같은 규약).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RELAY_STATE_LABELS } from '@gh-radar/shared';
import type {
  OrderMarket,
  RelayExchange,
  RelayLimitChaser,
  RelayLimitChaserInput,
  StockDetailResponse,
} from '@gh-radar/shared';

import { AccountPanel } from '@/components/orderbook/account-panel';
import { OrderbookLadder } from '@/components/orderbook/orderbook-ladder';
import { deriveTickSize } from '@/components/orderbook/order-panel';
import { DmaGate, useDmaGateReason } from '@/components/trading/dma-gate';
import { LimitChaserForm } from '@/components/trading/limit-chaser-form';
import { strategyBadgesOf } from '@/components/trading/strategy-badge';
import {
  StrategyLog,
  serverMessageLogLine,
  strategiesDisabledLogLine,
  strategyLogLine,
  type StrategyLogEntry,
} from '@/components/trading/strategy-log';
import { isLimitChaserServerMessage, strategyKey } from '@/lib/limit-chaser';
import { useRelayContext, useRelaySubscription } from '@/lib/relay-provider';
import { searchStocks } from '@/lib/stock-api';
import type { RelayServerMessageEntry, RelayStatus } from '@/lib/use-relay-socket';
import { cn } from '@/lib/utils';

/**
 * 에코 배너 자동 소멸(ms) — UI-SPEC A3 「6초 배너」.
 * 상수로 **내보내는** 이유: 테스트가 6000 을 다시 적으면 값을 바꿔도 테스트가 통과한다.
 */
export const ECHO_BANNER_MS = 6_000;
/**
 * 전송 후 「미반영」 판정까지의 대기(ms).
 * WinForms `RespTimeoutMs=3000` 과 **같은 값**이다 — 두 클라이언트가 다른 시각에 다른 말을
 * 하면 사용자가 어느 쪽을 믿을지 알 수 없다.
 */
export const ACK_TIMEOUT_MS = 3_000;
/** 검색 디바운스(ms). 타이핑마다 왕복하지 않는다. */
const SEARCH_DELAY_MS = 250;
/** 로그 보관 상한(브라우저 메모리). 새로고침하면 어차피 사라진다. */
const MAX_LOG = 100;

/** 이탈 경고 문구 — UI-SPEC §CTA verbatim. `beforeunload` 와 라우터 가드가 **같은 말**을 쓴다. */
const LEAVE_WARNING = '수정하지 않은 값이 있어요. 이 페이지를 벗어나면 사라져요.';

const KRW = new Intl.NumberFormat('ko-KR');

/**
 * 지금 시각 `HH:MM:SS` — **로케일 포맷터를 쓰지 않는다.**
 *
 * ★ `toLocaleTimeString('ko-KR', { hour12: false })` 는 브라우저에 따라 `0시 57분 16초`
 *   를 돌려준다(Chromium 실측). UI-SPEC 은 상태줄의 `반영 HH:MM:SS` 와 로그 시각을
 *   **`.mono` 고정폭 숫자**로 못박았는데, 한글 조사가 섞이면 폭이 매 초 달라져 로그가
 *   좌우로 흔들리고 상태줄의 다른 항목까지 밀린다. 자리수를 우리가 직접 채운다.
 */
function clockNow(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/** 화면이 다루는 종목 1건. 검색 결과 또는 편집 키에서 만든다. */
interface SelectedStock {
  /** 12자 ISIN — DMA 구독·주문 키(D-28). 없으면 구독도 등록도 못 한다. */
  isin: string;
  /** 6자 단축코드. 표시 전용이다. */
  code: string;
  name: string;
  market: OrderMarket;
  /** REST 상세의 값. 실시간 호가(`quote.ul` 등)가 도착하면 그쪽이 이긴다. */
  upperLimit: number;
  lowerLimit: number;
  basePrice: number;
  price: number;
  changeRate: number;
}

/**
 * 전략 키 `{ISIN}:{accountNo}:{exchange}` 분해.
 *
 * 모양이 어긋나면 **null 이다** — 반쪽만 채우면 화면이 「다른 계좌의 전략」을 편집하게 된다.
 * 거래소는 화이트리스트 2종뿐이라 그 밖의 값은 키가 깨진 것으로 본다.
 */
export function parseStrategyKey(
  key: string,
): { isin: string; accountNo: string; exchange: RelayExchange } | null {
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  const [isin, accountNo, exchange] = parts;
  if (isin === '' || accountNo === '') return null;
  if (exchange !== 'KRX' && exchange !== 'NXT') return null;
  return { isin, accountNo, exchange };
}

export interface LimitChaserClientProps {
  /** 편집 대상 전략 키. 신규(빈 폼)면 넘기지 않는다. */
  strategyKey?: string;
}

export function LimitChaserClient({ strategyKey: routeKey }: LimitChaserClientProps) {
  const gateReason = useDmaGateReason();
  // 게이트는 본문을 **대체**한다(A14). 아래 본문의 훅이 돌지 않도록 컴포넌트를 가른다.
  if (gateReason !== null) {
    return <DmaGate reason={gateReason} surface="상따 전략" />;
  }
  return <LimitChaserSurface routeKey={routeKey} />;
}

function LimitChaserSurface({ routeKey }: { routeKey?: string }) {
  const relay = useRelayContext();
  const { accounts, limitChasers, accountStates, messages, status, statusLabel, strategiesDisabled } =
    relay;

  const parsedKey = useMemo(() => (routeKey === undefined ? null : parseStrategyKey(routeKey)), [routeKey]);
  const isinNames = useIsinNames();

  const [picked, setPicked] = useState<SelectedStock | null>(null);
  const [exchange, setExchange] = useState<RelayExchange>(parsedKey?.exchange ?? 'KRX');
  const [accountNo, setAccountNo] = useState<string>(parsedKey?.accountNo ?? '');

  // 계좌가 도착하면 **미선택일 때만** 첫 계좌를 고른다. 이미 고른 계좌를 덮지 않는다.
  useEffect(() => {
    if (accountNo !== '' || accounts.length === 0) return;
    setAccountNo(accounts[0].accountNo);
  }, [accountNo, accounts]);

  /** 편집 진입은 키가 종목 축을 정한다 — 검색으로 고른 종목이 그 자리를 덮지 않는다. */
  const isin = parsedKey?.isin ?? picked?.isin ?? '';
  const subscription = useRelaySubscription({ isin, exchange, enabled: isin.length > 0 });
  const { quote, tape, isStale } = subscription;

  const key = isin === '' || accountNo === '' ? '' : strategyKey(isin, accountNo, exchange);
  const server = useMemo(
    () => (key === '' ? null : (limitChasers.find((c) => c.key === key) ?? null)),
    [limitChasers, key],
  );

  /* ── 전략 로그 (브라우저 메모리) ───────────────────────────────────────── */

  const [log, setLog] = useState<StrategyLogEntry[]>([]);
  const logSeq = useRef(0);
  const pushLog = useCallback((text: string, level: 'info' | 'error' = 'info') => {
    logSeq.current += 1;
    const entry: StrategyLogEntry = {
      id: `log-${logSeq.current}`,
      at: clockNow(),
      text,
      level,
    };
    setLog((prev) => [entry, ...prev].slice(0, MAX_LOG));
  }, []);

  /* ── 전송 ↔ 에코 상관 (③) ─────────────────────────────────────────────── */

  /** 마지막으로 보낸 요청. 에코가 오면 비운다. **재전송에 쓰지 않는다.** */
  const pendingRef = useRef<RelayLimitChaserInput | null>(null);
  const [unacked, setUnacked] = useState(false);
  const ackTimer = useRef<number | null>(null);
  /** 폼이 알려 준 「이번 에코가 덮은 더티 필드 수」. 소비 즉시 0 으로 되돌린다. */
  const overwrittenRef = useRef(0);
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<number | null>(null);
  const [appliedAt, setAppliedAt] = useState<string | null>(null);
  const [dirtyCount, setDirtyCount] = useState(0);
  /** 삭제 에코를 받으면 올린다 — 폼을 remount 해 빈 상태로 되돌리는 유일한 장치(⑤). */
  const [resetSeq, setResetSeq] = useState(0);
  /**
   * 「직전에 매수 발주가 나갔는가」 — 와이어 필드가 아니라 **이 화면이 아는 사실**이다.
   * 무장이 풀렸는데 우리가 끈 게 아니면 게이트가 발주로 소진된 것이다(Pitfall 10).
   * 이 값이 없으면 `strategyBadgesOf` 가 「발주됨」을 만들지 않는다 — 그게 맞다.
   */
  const [fired, setFired] = useState(false);
  /**
   * 시딩에 쓴 **실시간** 상한가. 0 이면 아직 실시간 값으로 시딩한 적이 없다.
   *
   * ★ 왜 필요한가: 종목을 고른 직후에는 REST 상세의 상한가밖에 없고, 실시간 호가(`quote.ul`)
   *   는 구독 왕복 뒤에 온다. 그대로 두면 **폼의 가격 5칸은 REST 값, 위 칩은 실시간 값**이라
   *   같은 화면이 상한가를 두 숫자로 말한다. 그 상태로 스위치를 켜면 사용자가 본 적 없는
   *   가격으로 등록된다.
   * ★ 한 번만 올린다. 상한가는 세션 내내 고정이므로 이 재시딩은 종목당 1회이고, 그
   *   시점은 사용자가 값을 고치기 전(선택 직후 수백 ms)이다. 서버 전략이 이미 있으면
   *   **아예 올리지 않는다** — 그때는 시딩 자체가 없고 remount 는 편집을 지우는 일만 한다.
   */
  const [liveSeed, setLiveSeed] = useState(0);

  const handleSent = useCallback((cfg: RelayLimitChaserInput) => {
    pendingRef.current = cfg;
    setUnacked(false);
    if (ackTimer.current != null) window.clearTimeout(ackTimer.current);
    // ★ 여기서 하는 일은 **표시**뿐이다. 타이머가 끝나도 아무것도 다시 보내지 않는다.
    ackTimer.current = window.setTimeout(() => setUnacked(true), ACK_TIMEOUT_MS);
  }, []);

  const handleServerEcho = useCallback((info: { overwrittenDirty: number }) => {
    overwrittenRef.current = info.overwrittenDirty;
  }, []);

  /** 직전 에코 — 전이 문장의 기준선이다. 전략 키가 바뀌면 되돌린다. */
  const prevServerRef = useRef<RelayLimitChaser | null>(null);
  useEffect(() => {
    prevServerRef.current = null;
    pendingRef.current = null;
    setUnacked(false);
    setBanner(null);
    setAppliedAt(null);
    setFired(false);
    setLiveSeed(0);
  }, [key]);

  useEffect(() => {
    const prev = prevServerRef.current;

    // 삭제 — 목록에서 빠졌다(전역 스냅샷이 `crud:"D"` 를 제거한다).
    if (server === null) {
      if (prev !== null) {
        prevServerRef.current = null;
        pendingRef.current = null;
        setUnacked(false);
        setResetSeq((n) => n + 1);
        pushLog(strategyLogLine(prev, { ...prev, crud: 'D' }) ?? '전략이 삭제됐어요');
      }
      return;
    }

    if (prev === server) return;
    prevServerRef.current = server;

    const sent = pendingRef.current;
    pendingRef.current = null;
    if (ackTimer.current != null) window.clearTimeout(ackTimer.current);
    setUnacked(false);
    setAppliedAt(clockNow());

    /*
      무장 해제의 **이유**는 에코만으로 알 수 없다(Pitfall 10). 우리가 방금 끈 것이면
      그 요청에 `buyEnabled:false` 가 실려 있다 — 그 경우에만 「사용자가 껐다」이고,
      나머지(내가 켰는데 꺼져서 왔다 / 아예 안 보냈다)는 **발주로 게이트가 소진된 것**이다.
    */
    const hadOrder = sent === null ? true : sent.buyEnabled === true;
    const line = strategyLogLine(prev, server, { hadOrder });
    if (line !== null) pushLog(line);

    // 발주 래치 — 무장이 서면 되돌리고, 우리가 끈 게 아닌 해제만 「발주됨」으로 남긴다.
    if (server.buyEnabled) setFired(false);
    else if (prev?.buyEnabled === true && hadOrder) setFired(true);

    // 다른 단말 변경 — 내가 보낸 적이 없고, 처음 보는 전략도 아닐 때만이다.
    // 첫 스냅샷(prev === null)을 「다른 단말」이라고 하면 페이지를 열 때마다 배너가 뜬다.
    const overwritten = overwrittenRef.current;
    overwrittenRef.current = 0;
    if (sent === null && prev !== null) {
      const text =
        overwritten > 0
          ? `다른 단말에서 변경돼 수정하던 값 ${overwritten}개가 서버 값으로 바뀌었어요`
          : '다른 단말에서 변경됐어요 · 서버 값으로 맞췄어요';
      setBanner(text);
      pushLog(text);
      if (bannerTimer.current != null) window.clearTimeout(bannerTimer.current);
      bannerTimer.current = window.setTimeout(() => setBanner(null), ECHO_BANNER_MS);
    }
  }, [server, pushLog]);

  useEffect(
    () => () => {
      if (ackTimer.current != null) window.clearTimeout(ackTimer.current);
      if (bannerTimer.current != null) window.clearTimeout(bannerTimer.current);
    },
    [],
  );

  /* ── ServerMessage(54) — 상따 몫만 (④) ────────────────────────────────── */

  const lastMsgRef = useRef<RelayServerMessageEntry | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    const seen = lastMsgRef.current;
    const idx = seen === null ? -1 : messages.indexOf(seen);
    // 못 찾으면(상한 20 을 넘겨 밀려났다) 지금 목록 전체가 새것이다.
    const fresh = idx < 0 ? messages : messages.slice(0, idx);
    lastMsgRef.current = messages[0];
    for (const msg of [...fresh].reverse()) {
      if (!isLimitChaserServerMessage(msg)) continue; // VI 몫은 여기서 그리지 않는다
      const { text, level } = serverMessageLogLine(msg);
      pushLog(text, level);
      // ★ 상태줄에도 남긴다 — 로그만 있으면 스크롤 밖에서 조용히 지나간다(T-16-07).
      if (level === 'error') setLastError(text);
    }
  }, [messages, pushLog]);

  /* ── 15:40 서버 자동 비활성화(65) ─────────────────────────────────────── */

  const lastDisabledRef = useRef(strategiesDisabled);
  useEffect(() => {
    if (strategiesDisabled === null || strategiesDisabled === lastDisabledRef.current) {
      lastDisabledRef.current = strategiesDisabled;
      return;
    }
    lastDisabledRef.current = strategiesDisabled;
    pushLog(strategiesDisabledLogLine());
  }, [strategiesDisabled, pushLog]);

  /* ── 이탈 경고 (조작 규율 7) ──────────────────────────────────────────── */
  useLeaveWarning(dirtyCount > 0);

  /* ── 파생 표시값 ──────────────────────────────────────────────────────── */

  const displayName = picked?.name ?? (isin === '' ? '' : (isinNames.get(isin) ?? isin));
  const accountState = accountNo === '' ? null : (accountStates.get(accountNo) ?? null);
  const sellableQty =
    accountState?.hold.find((h) => h.isin === isin)?.sellableQty ?? 0;

  // 실시간 호가가 있으면 그쪽이 정본이다 — REST 상세는 스냅샷 전의 임시값이다.
  const upperLimit = quote?.ul ?? picked?.upperLimit ?? 0;
  const lowerLimit = quote?.ll ?? picked?.lowerLimit ?? 0;
  const basePrice = quote?.base ?? picked?.basePrice ?? 0;
  const currentPrice = quote?.p ?? picked?.price ?? 0;
  const changeRate = quote?.cr ?? picked?.changeRate ?? 0;

  // 실시간 상한가가 처음 도착하면 그 값으로 **한 번만** 다시 시딩한다(위 `liveSeed` 주석).
  useEffect(() => {
    if (server !== null || liveSeed !== 0) return;
    const live = quote?.ul ?? 0;
    if (live > 0) setLiveSeed(live);
  }, [server, quote, liveSeed]);
  const tickSize = deriveTickSize(quote?.ap, quote?.bp, currentPrice > 0 ? currentPrice : basePrice);

  const badges = strategyStatusOf(server, fired);
  const market: OrderMarket = picked?.market ?? server?.market ?? 'K';

  /** 스냅샷 도착 전 — 편집 진입인데 아직 그 전략을 못 받았다(UI-SPEC §동기화). */
  const awaitingSnapshot =
    parsedKey !== null && server === null && status !== 'ready' && limitChasers.length === 0;

  return (
    <div data-slot="limit-chaser-page" className="flex min-w-0 flex-col gap-[var(--s-2)]">
      {/* 제목 — 신규는 「상따」, 편집은 `{종목명} · {거래소}` + 전략키(mono). */}
      <div className="flex flex-wrap items-baseline gap-[var(--s-2)]">
        <h1 className="m-0 text-[length:var(--t-h3)] leading-[var(--lh-tight)] font-semibold text-[var(--fg)]">
          {parsedKey === null ? '상따' : `${displayName} · ${parsedKey.exchange}`}
        </h1>
        <p className={cn('m-0 text-[length:var(--t-caption)] text-[var(--muted-fg)]', parsedKey !== null && 'mono')}>
          {parsedKey === null
            ? '종목을 고르면 아래 값이 상한가 기준으로 채워져요'
            : (routeKey ?? '')}
        </p>
      </div>

      {/* ── A1 종목 · 거래소 · 계좌 ── */}
      <section
        data-slot="lc-stock-card"
        className="flex min-w-0 flex-col gap-[var(--s-2)] rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] p-[var(--s-3)]"
      >
        <div className="flex min-w-0 items-center gap-[var(--s-2)]">
          {isin === '' ? (
            <StockSearchField onPick={setPicked} />
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-[var(--s-2)] rounded-[var(--r-md)] border border-[var(--input)] bg-[var(--bg)] px-2.5 py-2">
              <b className="min-w-0 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
                {displayName}
              </b>
              {picked !== null && (
                <span className="mono flex-none text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                  {picked.code}
                </span>
              )}
              <span
                className={cn(
                  'mono ml-auto flex-none text-right text-[length:var(--t-sm)] font-semibold',
                  changeRate > 0
                    ? 'text-[var(--up)]'
                    : changeRate < 0
                      ? 'text-[var(--down)]'
                      : 'text-[var(--flat)]',
                )}
              >
                {currentPrice > 0 ? KRW.format(currentPrice) : '—'}{' '}
                <small className="font-normal">{changeRate.toFixed(2)}%</small>
              </span>
            </div>
          )}

          {/* 거래소 — 방향 의미가 없어 중립 accent 다(§Accent 2). */}
          <div
            role="group"
            aria-label="거래소 선택"
            className="flex h-10 flex-none overflow-hidden rounded-[var(--r-md)] border border-[var(--border)]"
          >
            {(['KRX', 'NXT'] as const).map((ex) => (
              <button
                key={ex}
                type="button"
                aria-pressed={exchange === ex}
                // 편집 진입은 거래소가 키의 일부다 — 바꾸면 다른 전략이 되므로 잠근다.
                disabled={parsedKey !== null}
                onClick={() => setExchange(ex)}
                className={cn(
                  'min-w-[52px] px-3 text-[length:var(--t-sm)] font-semibold disabled:opacity-50',
                  exchange === ex
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                    : 'bg-[var(--bg)] text-[var(--muted-fg)]',
                )}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* 계좌 — 네이티브 `<select>`(Phase 15 결정 승계). **계좌번호는 전체 표시**한다(D2). */}
        <div className="flex min-w-0 items-center gap-[var(--s-2)]">
          <label
            htmlFor="lc-account"
            className="flex-none text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]"
          >
            계좌
          </label>
          <select
            id="lc-account"
            value={accountNo}
            onChange={(e) => setAccountNo(e.target.value)}
            disabled={accounts.length === 0 || parsedKey !== null}
            className="mono h-10 min-w-0 flex-1 rounded-[var(--r-md)] border border-[var(--input)] bg-[var(--bg)] px-2.5 text-[length:var(--t-sm)] text-[var(--fg)] disabled:opacity-50"
          >
            {accounts.length === 0 ? (
              <option value="">계좌 확인 중…</option>
            ) : (
              accounts.map((a) => (
                <option key={a.accountNo} value={a.accountNo}>
                  {a.accountNo} · {a.name}
                </option>
              ))
            )}
          </select>
        </div>

        {/* 가격 칩 — 종목이 정해졌을 때만 그린다(신규 빈 폼에는 칩 행 자체가 없다, A1). */}
        {isin !== '' && (
          <div
            data-slot="lc-price-chips"
            className="flex flex-wrap gap-1.5 text-[length:var(--t-caption)]"
          >
            <PriceChip label="상한가" value={upperLimit} tone="up" />
            <PriceChip label="기준가" value={basePrice} />
            <PriceChip label="하한가" value={lowerLimit} tone="down" />
            <PriceChip label="호가단위" value={tickSize} />
          </div>
        )}
      </section>

      {/* ── A2 상태줄 ── */}
      <StatusBar
        status={status}
        statusLabel={statusLabel}
        badges={badges}
        trackBaseline={server?.sellEntryLatched === true ? server.sellQtyTrackBaseline : null}
        unacked={unacked}
        error={lastError}
        appliedAt={appliedAt}
      />

      {/* ── A3 에코 배너 (6초) ── */}
      {banner !== null && (
        <p
          role="status"
          data-slot="lc-echo-banner"
          className="m-0 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-caption)] text-[var(--fg)]"
        >
          {banner}
        </p>
      )}

      {awaitingSnapshot && (
        <p
          aria-busy="true"
          data-slot="lc-snapshot-loading"
          className="m-0 rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-caption)] text-[var(--muted-fg)]"
        >
          전략 정보를 불러오는 중이에요…
        </p>
      )}

      {/*
        본문 그리드 — 정본은 목업이다.
          <1024   : `.lc2` 42% | 1fr, gap 8 (R7 — 모바일 2열은 390px 부터)
          1024~1279: 1열 (R1 — 콘텐츠 735px 로는 2축이 잘린다)
          ≥1280   : `.lc3` 460 | 나머지, gap 16. 오른쪽 칸을 폼이 다시 250|250 으로 나눈다.
        ★ 그리드 자식 전부 `min-w-0` — 빠지면 `overflow-hidden` 아래에서 스크롤이 아니라
          **조용한 잘림**이 된다(`tasks/lessons.md` 등재 함정).
      */}
      <div
        data-slot="lc-body-grid"
        className="grid min-w-0 grid-cols-[42%_minmax(0,1fr)] items-start gap-[var(--s-2)] min-[1024px]:grid-cols-1 min-[1280px]:grid-cols-[460px_minmax(0,1fr)] min-[1280px]:gap-[var(--s-4)] [&>*]:min-w-0"
      >
        <section
          data-slot="lc-orderbook-card"
          className="flex min-w-0 flex-col rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] p-[var(--s-2)] min-[1280px]:p-[var(--s-3)]"
        >
          <h3 className="m-0 mb-[var(--s-1)] flex flex-wrap items-center gap-[var(--s-2)] text-[length:var(--t-sm)] font-semibold text-[var(--fg)] min-[1280px]:mb-[var(--s-2)]">
            호가 10단
            <span className="ml-auto text-[length:var(--t-caption)] font-normal text-[var(--muted-fg)]">
              <span className="min-[1280px]:hidden">{exchange}</span>
              <span className="hidden min-[1280px]:inline">{exchange} · 실시간(DMA)</span>
            </span>
          </h3>
          <OrderbookLadder
            variant="chaser"
            quote={quote}
            depth={10}
            isStale={isStale}
            basePrice={basePrice}
            upperLimit={upperLimit}
            recentTrades={tape}
          />
        </section>

        {/* 폼 — 자기 안에서 ≥1280 을 매수 250 | 매도 250 으로 다시 나눈다(16-12). */}
        <LimitChaserForm
          key={`${isin}|${accountNo}|${exchange}|${resetSeq}|${liveSeed}`}
          isin={isin}
          accountNo={accountNo}
          market={market}
          exchange={exchange}
          server={server}
          upperLimit={upperLimit}
          sellableQty={sellableQty}
          disabled={isin === '' || accountNo === '' || status !== 'ready'}
          buyStatusText={badges.buyText}
          sellStatusText={badges.sellText}
          onDirtyCountChange={setDirtyCount}
          onSent={handleSent}
          onServerEcho={handleServerEcho}
        />
      </div>

      {/* ── A12 미체결 / 잔고 (전폭) ── */}
      <AccountPanel
        selectedAccountNo={accountNo}
        accountName={accounts.find((a) => a.accountNo === accountNo)?.name}
        account={accountState}
        isin={isin === '' ? null : isin}
        name={displayName === '' ? undefined : displayName}
        currentPrice={currentPrice > 0 ? currentPrice : undefined}
        originTag="상따"
        status={status}
        className="rounded-[var(--r-lg)] border border-[var(--border)]"
      />

      {/* ── A13 전략 로그 (전폭) ── */}
      <StrategyLog entries={log} />
    </div>
  );
}

/* ───────────────────────────── 조각 ───────────────────────────── */

/** 가격 칩 1개. 방향색은 상한가·하한가에만 붙는다(§Color 열거표). */
function PriceChip({ label, value, tone }: { label: string; value: number; tone?: 'up' | 'down' }) {
  return (
    <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--muted-fg)]">
      {label}{' '}
      <b
        className={cn(
          'mono font-semibold',
          tone === 'up'
            ? 'text-[var(--up)]'
            : tone === 'down'
              ? 'text-[var(--down)]'
              : 'text-[var(--fg)]',
        )}
      >
        {value > 0 ? KRW.format(value) : '—'}
      </b>
    </span>
  );
}

export interface StrategyStatus {
  /** 매수 그룹 헤더 문구 (A4a). 빈 문자열이면 헤더에 상태 문구가 없다. */
  buyText: string;
  /** 매도 그룹 헤더 문구 (A7a). */
  sellText: string;
  /** 상태줄 값 — `ON`/`OFF`, `감시`/`대기`/`OFF`. */
  buyLabel: string;
  sellLabel: string;
  buyTone: 'on' | 'off';
  sellTone: 'watch' | 'wait' | 'off';
}

const EMPTY_STATUS: StrategyStatus = {
  buyText: '',
  sellText: '',
  buyLabel: 'OFF',
  sellLabel: 'OFF',
  buyTone: 'off',
  sellTone: 'off',
};

/**
 * 에코 → 상태줄·그룹 헤더 문구 (**순수 함수**).
 *
 * ★ 배지 **종류 판정**은 `strategyBadgesOf`(16-11) 한 곳이고 여기서는 그 결과를 문구로
 *   옮기기만 한다. 판정을 다시 쓰면 사이드바·My page·상태줄이 같은 전략을 다르게 읽는다.
 * ★ `hadOrder` 가 false 면 「발주됨」을 만들지 않는다 — 한 번도 발주된 적 없는 전략을
 *   「발주 완료」로 쓰면 사용자가 나가지도 않은 주문을 찾아 미체결을 뒤진다(Pitfall 10).
 */
export function strategyStatusOf(item: RelayLimitChaser | null, hadOrder: boolean): StrategyStatus {
  if (item === null) return EMPTY_STATUS;
  const kinds = new Set(strategyBadgesOf({ ...item, hadOrder }).map((b) => b.kind));
  return {
    buyText: kinds.has('buyOn') ? '무장' : kinds.has('fired') ? '발주 완료 · 무장 해제' : '',
    sellText: kinds.has('sellWatch') ? '감시 중' : kinds.has('sellWait') ? '대기 (지지벽 미관측)' : '',
    buyLabel: kinds.has('buyOn') ? 'ON' : 'OFF',
    sellLabel: kinds.has('sellWatch') ? '감시' : kinds.has('sellWait') ? '대기' : 'OFF',
    buyTone: kinds.has('buyOn') ? 'on' : 'off',
    sellTone: kinds.has('sellWatch') ? 'watch' : kinds.has('sellWait') ? 'wait' : 'off',
  };
}

function StatusBar({
  status,
  statusLabel,
  badges: s,
  trackBaseline,
  unacked,
  error,
  appliedAt,
}: {
  status: RelayStatus;
  statusLabel: string;
  badges: StrategyStatus;
  trackBaseline: number | null;
  unacked: boolean;
  error: string | null;
  appliedAt: string | null;
}) {
  // ⑥ 연결 상태 문구는 계약 한 곳(`RELAY_STATE_LABELS`)에서만 온다(D-36).
  const label = statusLabel === '' ? RELAY_STATE_LABELS.connecting : statusLabel;

  return (
    <div
      data-slot="lc-status-bar"
      data-status={status}
      aria-live="polite"
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-caption)] text-[var(--muted-fg)]"
    >
      <span className="inline-flex items-center gap-1.5">
        <Dot tone={status === 'ready' ? 'ok' : 'off'} pulse={PROGRESS_STATES.has(status)} />
        DMA <b className="font-semibold text-[var(--fg)]">{label}</b>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Dot tone={s.buyTone === 'on' ? 'up' : 'off'} />
        매수 <b className="font-semibold text-[var(--fg)]">{s.buyLabel}</b>
        {s.buyText === '발주 완료 · 무장 해제' && <small>(발주됨)</small>}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Dot tone={s.sellTone === 'watch' ? 'down' : s.sellTone === 'wait' ? 'hollow' : 'off'} />
        매도 <b className="font-semibold text-[var(--fg)]">{s.sellLabel}</b>
      </span>
      {trackBaseline !== null && (
        <span>
          잔량추적 기준선 <b className="mono font-semibold text-[var(--fg)]">{KRW.format(trackBaseline)}</b>
        </span>
      )}
      {/*
        ③ 3초 무응답. **다시 보내지 않는다** — 이 자리는 「모른다」를 말하는 곳이지
        「다시 시도한다」를 말하는 곳이 아니다.
      */}
      {unacked && (
        <span data-slot="lc-unacked" className="font-semibold text-[var(--destructive)]">
          미반영 · 서버 응답을 기다리고 있어요
        </span>
      )}
      {error !== null && (
        <span role="alert" data-slot="lc-server-error" className="min-w-0 text-[var(--destructive)]">
          {error}
        </span>
      )}
      {appliedAt !== null && <span className="mono ml-auto">반영 {appliedAt}</span>}
    </div>
  );
}

/** 점멸 도트를 쓰는 진행 상태 — `relay-status-bar`·`me-client` 와 같은 집합이다. */
const PROGRESS_STATES: ReadonlySet<RelayStatus> = new Set<RelayStatus>([
  'idle',
  'connecting',
  'logging_in',
  'declaring',
]);

/** 상태 도트. **형태(채움/속빔)가 색과 함께 상태를 말한다**(WCAG 1.4.1). */
function Dot({ tone, pulse = false }: { tone: 'ok' | 'up' | 'down' | 'hollow' | 'off'; pulse?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-tone={tone}
      className={cn(
        'block size-[7px] shrink-0 rounded-full',
        tone === 'ok' && 'bg-[oklch(0.72_0.19_150)]',
        tone === 'up' && 'bg-[var(--up)]',
        tone === 'down' && 'bg-[var(--down)]',
        tone === 'hollow' && 'border-[1.5px] border-[var(--muted-fg)] bg-transparent',
        tone === 'off' && 'bg-[var(--flat)]',
        pulse && 'animate-pulse motion-reduce:animate-none',
      )}
    />
  );
}

/**
 * 인라인 종목 검색.
 *
 * `components/search/global-search.tsx` 를 쓰지 않는 이유: 그쪽은 인자를 받지 않고 선택 시
 * **종목 상세로 라우팅**한다. 여기서 필요한 것은 「고른 종목을 이 화면에 남기는 것」이라
 * 라우팅이 끼면 사용자가 편집하던 폼을 잃는다.
 *
 * ★ `isin` 이 없는 종목은 고를 수 없다(ETP 등 — 게이트웨이 구독·주문 대상이 아니다, D-28).
 *   고를 수 있게 두면 「등록했는데 아무 일도 안 일어나는 전략」이 만들어진다.
 */
function StockSearchField({ onPick }: { onPick: (stock: SelectedStock) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockDetailResponse[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q === '') {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchStocks(q, controller.signal)
        .then((rows) => {
          if (controller.signal.aborted) return;
          setResults(rows);
          setLoading(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResults([]);
          setLoading(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="relative min-w-0 flex-1">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="종목 검색"
        placeholder="종목명 또는 코드로 검색"
        className="h-10 w-full min-w-0 rounded-[var(--r-md)] border border-[var(--input)] bg-[var(--bg)] px-2.5 text-[length:var(--t-sm)] text-[var(--fg)]"
      />
      {query.trim() !== '' && (
        <ul
          data-slot="lc-search-results"
          aria-label="종목 검색 결과"
          className="absolute inset-x-0 top-11 z-20 m-0 max-h-60 list-none overflow-y-auto rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-2 py-1.5 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
              {loading ? '검색 중이에요…' : '검색 결과가 없어요'}
            </li>
          ) : (
            results.map((row) => (
              <li key={row.code}>
                <button
                  type="button"
                  data-slot="lc-search-option"
                  disabled={row.isin === null}
                  onClick={() => {
                    if (row.isin === null) return;
                    onPick({
                      isin: row.isin,
                      code: row.code,
                      name: row.name,
                      market: row.market === 'KOSDAQ' ? 'Q' : 'K',
                      upperLimit: row.upperLimit,
                      lowerLimit: row.lowerLimit,
                      // 기준가 = 현재가 − 전일대비. 실시간 호가가 오면 `quote.base` 가 이긴다.
                      basePrice: row.price - row.changeAmount,
                      price: row.price,
                      changeRate: row.changeRate,
                    });
                    setQuery('');
                  }}
                  className="flex w-full min-w-0 items-center gap-[var(--s-2)] rounded-[var(--r)] px-2 py-1.5 text-left hover:bg-[var(--muted)] disabled:opacity-45"
                >
                  <span className="min-w-0 flex-1 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
                    {row.name}
                  </span>
                  <span className="mono flex-none text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                    {row.code}
                  </span>
                  {row.isin === null && (
                    <span className="flex-none text-[11px] text-[var(--muted-fg)]">주문 불가</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * ISIN → 종목명 역매핑 (⑧). **이미 받은 프레임에서만** 만든다.
 * `app-sidebar.tsx` 의 `useIsinNames()` · `strategy-status-card.tsx` 의 `useIsinLabels()` 와
 * 같은 규약이다 — 이름 하나 때문에 별도 조회 경로를 만들지 않는다(T-16-02).
 */
function useIsinNames(): ReadonlyMap<string, string> {
  const { accountStates, viOrders } = useRelayContext();
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const state of accountStates.values()) {
      for (const row of state.hold) if (row.name != null && row.name !== '') names.set(row.isin, row.name);
      for (const row of state.unf) if (row.name != null && row.name !== '') names.set(row.isin, row.name);
    }
    for (const row of viOrders) if (row.name != null && row.name !== '') names.set(row.isin, row.name);
    return names;
  }, [accountStates, viOrders]);
}

/**
 * 이탈 경고 — 더티일 때**만** 건다 (조작 규율 7).
 *
 * ★ 확인 창을 **브라우저 것**으로 쓴다. UI-SPEC D6 이 앱 다이얼로그를 4개로 못박았고
 *   (VI 시작 · VI 중지 · 전체 비활성화 · 미체결 취소), 이탈 경고는 그 목록에 없다.
 *   `beforeunload`(새로고침·탭 닫기)와 라우터 가드(링크 클릭)가 **같은 문구**를 쓴다.
 * ★ 더티가 0 이면 리스너를 아예 걸지 않는다 — 항상 걸어 두고 안에서 분기하면 「저장할 게
 *   없는데 나갈 때마다 물어보는 화면」이 되고, 사용자는 곧 경고를 읽지 않게 된다.
 */
function useLeaveWarning(dirty: boolean): void {
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
}
