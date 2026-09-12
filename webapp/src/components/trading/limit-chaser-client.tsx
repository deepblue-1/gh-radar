'use client';

/**
 * LimitChaserClient — 상따 전략 화면 본문 (`/trading/limit-chaser/{new,[key]}`, TRADE-01).
 *
 * ① 무엇을 조립하는가 (16-UI-SPEC A1~A14 · 260911-w5h)
 *   제목 줄(「상따」 + 계좌 칩) → 헤더 카드(거래소 콤보 | 종목명 버튼 = 검색 트리거 |
 *   현재가·등락률, 그 아래 종목정보 8칸) → 상태줄 → (에코 배너) →
 *   [호가 10단 | 매수·매도 폼] → 미체결/잔고 → 전략 로그. 레이아웃 정본은 채택 목업
 *   `16-limit-chaser-mockup.html` + 모바일 확정 목업 `260911-chaser-mockup-7.html` 이다
 *   (≥1280 `.lc3` 460 | 매수 250 | 매도 250 · <1024 `.lc2` 42% | 1fr · 1024~1279 1열, R1/R2/R7).
 *   ★ **가격 칩 행은 없다** (260912-gyz). 헤더 카드는 종목정보 8칸에서 끝난다 — 상한·하한은
 *     8칸이 이미 말하고, 기준가는 그 8칸의 방향색 기준으로 살아 있으며, 호가단위는 폼이
 *     사용자에게 요구하지 않는 값이라 같은 카드에서 같은 말을 두 번 하던 행이었다.
 *   ★ 제목은 **신규·편집 모두 「상따」**다. 종목·거래소를 제목에 넣으면 바로 아래 헤더 카드와
 *     같은 말을 두 번 하게 되고, 전략키 mono 부제는 사용자가 읽을 일이 없는 내부 식별자였다.
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
  RelayExchange,
  RelayLimitChaser,
  RelayLimitChaserInput,
  StockDetailResponse,
} from '@gh-radar/shared';

import { AccountPanel } from '@/components/orderbook/account-panel';
import { OrderbookLadder } from '@/components/orderbook/orderbook-ladder';
import { DmaGate, useDmaGateReason } from '@/components/trading/dma-gate';
import { LimitChaserForm } from '@/components/trading/limit-chaser-form';
import { strategyBadgesOf } from '@/components/trading/strategy-badge';
import { formatMarketCap, formatOnePercentShares } from '@/lib/quote-format';
import {
  StrategyLog,
  serverMessageLogLine,
  strategiesDisabledLogLine,
  strategyLogLine,
  type StrategyLogEntry,
} from '@/components/trading/strategy-log';
import { useIsinLabels } from '@/lib/isin-labels';
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
  /*
    ★ `market` 이 **없다** (WR-03 / D-28). 검색 결과의 시장구분은 「고를 수 있는가」를 판정할
      때만 쓰고, 화면 상태로 남기지 않는다 — 남기면 언젠가 그 값이 와이어로 새어 나간다.
      전략 등록의 시장구분은 relay 가 `SymbolMap` 으로 ISIN 을 풀어 채운다.
  */
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
  const isinLabels = useIsinLabels();

  const [picked, setPicked] = useState<SelectedStock | null>(null);
  const [exchange, setExchange] = useState<RelayExchange>(parsedKey?.exchange ?? 'KRX');
  /*
    헤더의 종목명 버튼을 누르면 그 자리가 검색창이 된다 — 한 번 고른 종목을 되돌릴 경로다.
    지역 state 하나로 충분하다: 검색은 화면 표시일 뿐이고, 고른 결과는 `picked` 가 받는다.
  */
  const [searching, setSearching] = useState(false);
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

  const displayName = picked?.name ?? (isin === '' ? '' : (isinLabels.get(isin)?.name ?? isin));
  /*
    단축코드는 **아는 경우에만** 쓴다. 편집 진입처럼 `picked` 가 없으면 역매핑 라벨을 보고,
    그것도 없으면 조각 자체를 렌더하지 않는다 — ISIN 을 코드 자리에 넣으면 종목명 자리와
    같은 값을 두 번 쓰게 된다(파일 상단 ⑧ 과 같은 규율).
  */
  const stockCode = picked?.code ?? (isin === '' ? null : (isinLabels.get(isin)?.code ?? null));
  const accountState = accountNo === '' ? null : (accountStates.get(accountNo) ?? null);

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
  const badges = strategyStatusOf(server, fired);

  /** 스냅샷 도착 전 — 편집 진입인데 아직 그 전략을 못 받았다(UI-SPEC §동기화). */
  const awaitingSnapshot =
    parsedKey !== null && server === null && status !== 'ready' && limitChasers.length === 0;

  return (
    <div data-slot="limit-chaser-page" className="flex min-w-0 flex-col gap-[var(--s-2)]">
      {/*
        제목 줄 — 제목은 **언제나 「상따」**이고 그 옆 칩에서 계좌를 고른다 (260911-w5h).
        옛 편집 제목(`{종목명} · {거래소}`)과 전략키 mono 부제는 걷었다 — 종목·거래소는
        바로 아래 헤더 카드가 더 많은 맥락과 함께 보여주므로 같은 말을 세 번 하고 있었다.
      */}
      <div className="flex min-w-0 flex-wrap items-center gap-[var(--s-2)]">
        <h1 className="m-0 flex-none text-[length:var(--t-h3)] leading-[var(--lh-tight)] font-semibold text-[var(--fg)]">
          상따
        </h1>
        {/*
          계좌 칩 — 옛 「계좌」 라벨 + `<select>` 행을 **그대로 옮긴** 것이다(새 컨트롤이 아니다).
          ★ 라벨 행이 사라졌으므로 `aria-label` 이 접근성 이름을 잇는다 — 없으면 axe
            `select-name`(critical)이 뜨고 라벨 기반 단언도 함께 죽는다.
          ★ `appearance-none` 을 쓰지 않는다 — 네이티브 캐럿이 공짜로 따라오고 모바일에서
            OS 기본 선택 UI 가 그대로 뜬다.
          ★ **계좌번호는 마스킹하지 않는다**(D2 · S-5). 앞자리가 같은 두 계좌를 구분할 수
            없게 되는 쪽이 더 위험하다.
        */}
        <select
          id="lc-account"
          aria-label="계좌"
          value={accountNo}
          onChange={(e) => setAccountNo(e.target.value)}
          disabled={accounts.length === 0 || parsedKey !== null}
          className="mono h-[26px] max-w-full min-w-0 rounded-full border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] text-[var(--fg)] disabled:opacity-50"
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

      {/* ── A1 헤더 카드 — 거래소 | 종목명(검색 트리거) | 현재가 · 아래 종목정보 8칸 ── */}
      <section
        data-slot="lc-stock-card"
        className="min-w-0 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] p-0"
      >
        <div className="flex min-w-0 items-center gap-[var(--s-2)] px-2.5 py-2">
          {/*
            거래소 — 네이티브 1단 콤보. 방향 의미가 없어 중립이다.
            편집 진입은 거래소가 **키의 일부**라 바꾸면 다른 전략이 되므로 잠근다.
          */}
          <select
            aria-label="거래소"
            value={exchange}
            onChange={(e) => setExchange(e.target.value as RelayExchange)}
            disabled={parsedKey !== null}
            className="flex-none rounded-[var(--r)] border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5 text-[10px] font-bold text-[var(--muted-fg)] disabled:opacity-50"
          >
            {(['KRX', 'NXT'] as const).map((ex) => (
              <option key={ex} value={ex}>
                {ex}
              </option>
            ))}
          </select>

          {isin === '' || searching ? (
            <StockSearchField
              onPick={(s) => {
                setPicked(s);
                setSearching(false);
              }}
            />
          ) : (
            <>
              {/*
                ★ **종목을 되돌릴 유일한 경로**다 (260911-w5h). 종전에는 `isin === ''` 일
                  때만 검색창이 떴고, 한 번 고르면 페이지를 새로 열지 않는 한 다른 종목으로
                  갈 방법이 없었다. 종목명 블록 전체가 그 트리거다.
                ★ `aria-label` 을 걸지 않는다 — 보이는 글자(종목명·코드)가 접근성 이름에
                  그대로 남아야 WCAG 2.5.3(label in name)을 만족한다. 「무엇이 되는가」는
                  `sr-only` 한 조각이 덧붙인다.
              */}
              <button
                type="button"
                data-slot="lc-stock-trigger"
                disabled={parsedKey !== null}
                onClick={() => setSearching(true)}
                className="flex min-w-0 flex-1 items-baseline gap-1.5 rounded-[var(--r)] px-1 py-0.5 text-left hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <b className="min-w-0 truncate text-[16px] font-semibold text-[var(--fg)]">
                  {displayName}
                </b>
                {stockCode !== null && (
                  <span className="mono flex-none text-[11px] text-[var(--muted-fg)]">
                    {stockCode}
                  </span>
                )}
                <span className="sr-only">종목 변경</span>
                <span aria-hidden="true" className="flex-none text-[10px] text-[var(--muted-fg)]">
                  ▾
                </span>
              </button>

              <span
                className={cn(
                  'ml-auto flex flex-none flex-col items-end leading-[1.2]',
                  changeRate > 0
                    ? 'text-[var(--up)]'
                    : changeRate < 0
                      ? 'text-[var(--down)]'
                      : 'text-[var(--flat)]',
                )}
              >
                <b className="mono text-[16px] font-bold">
                  {currentPrice > 0 ? KRW.format(currentPrice) : '—'}
                </b>
                <small className="mono text-[11px] font-semibold">
                  {changeRate.toFixed(2)}%
                </small>
              </span>
            </>
          )}
        </div>

        {/*
          종목정보 8칸 — 2열 4행, 셀 사이 구분선 없이 여백만(목업 6 「안 B」).
          ★ 값의 원천은 **이미 구독으로 오는 `RelayQuote` 프레임 하나뿐**이다. 이 그리드를
            위해 만든 새 API·새 조회 경로가 0개다(파일 상단 ⑧ 과 같은 규율).
          ★ 값이 0 이거나 아직 안 왔으면 `—` 다 — 0 을 그리면 그 숫자로 매도 판단이 이뤄진다.
        */}
        {isin !== '' && !searching && (
          <div
            data-slot="lc-quote-grid"
            className="grid grid-cols-2 border-t border-[var(--border-subtle)] py-1"
          >
            <QuoteCell label="시가" value={priceText(quote?.o ?? 0)} tone={priceTone(quote?.o ?? 0, basePrice)} />
            <QuoteCell label="고가" value={priceText(quote?.h ?? 0)} tone={priceTone(quote?.h ?? 0, basePrice)} />
            <QuoteCell label="저가" value={priceText(quote?.l ?? 0)} tone={priceTone(quote?.l ?? 0, basePrice)} />
            {/* 상승VI 는 발동가라 언제나 위쪽 사건이다 — 기준가 대비가 아니라 항상 `--up`. */}
            <QuoteCell label="상승VI" value={priceText(quote?.viu ?? 0)} tone="text-[var(--up)]" />
            <QuoteCell label="상한" value={priceText(upperLimit)} tone="text-[var(--up)]" />
            <QuoteCell label="하한" value={priceText(lowerLimit)} tone="text-[var(--down)]" />
            <QuoteCell label="시총" value={formatMarketCap(currentPrice, quote?.ls ?? 0)} />
            <QuoteCell label="발행1%" value={formatOnePercentShares(quote?.ls ?? 0)} />
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
          exchange={exchange}
          server={server}
          upperLimit={upperLimit}
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

/**
 * 헤더 종목정보 한 칸. 라벨 왼쪽 · 값 오른쪽 mono, 셀 사이 구분선 없이 여백만.
 * 색은 호출부가 정한다 — 이 칸은 포맷과 배치만 안다(`limit-up-format.ts` 와 같은 분리).
 */
function QuoteCell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 px-2.5 py-[3px] text-[11px]">
      <span className="min-w-[34px] flex-none text-[var(--muted-fg)]">{label}</span>
      <span className={cn('mono ml-auto font-semibold whitespace-nowrap', tone ?? 'text-[var(--fg)]')}>
        {value}
      </span>
    </div>
  );
}

/** 가격 한 칸 — **0 은 「모른다」**이므로 대시다. 0 을 그리면 그 숫자로 판단이 이뤄진다. */
function priceText(value: number): string {
  return value > 0 ? KRW.format(value) : '—';
}

/**
 * 기준가 대비 방향색.
 *
 * ★ `orderbook-ladder.tsx` 의 `priceTone` 과 **동형**이다. 그쪽에서 import 하지 않는 이유는
 *   의존 방향이다 — 페이지 컨테이너가 사다리 컴포넌트의 색 유틸을 끌어오면 화면 조립자가
 *   자기 자식에게 의존하게 된다. 규칙이 갈라지면 두 곳을 함께 고쳐라(판정식은 세 줄이다).
 */
function priceTone(value: number, base: number): string {
  if (value <= 0 || base <= 0 || value === base) return 'text-[var(--flat)]';
  return value > base ? 'text-[var(--up)]' : 'text-[var(--down)]';
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
 * ★ **시장구분을 알 수 없는 종목도 같은 취급**이다 (WR-03). 전략 등록의 시장은 relay 가
 *   `SymbolMap` 으로 푸는데, 그것이 못 푸는 종목을 고를 수 있게 두면 사용자가 폼을 다 채우고
 *   스위치를 켠 **뒤에야** 거부 프레임을 본다. 고를 수 없다는 사실을 목록에서 먼저 말한다.
 */
/**
 * 고를 수 있는 종목인가 — **판정 지점 하나**.
 *
 * `disabled` 와 `onClick` 가드가 같은 함수를 읽는다(`vi-order-list.tsx` 의 `isConfirmable` 과
 * 같은 규율이다). 두 곳에 따로 적으면 한쪽만 고쳐지고, 그때 뚫리는 것이 「비활성인데 눌리면
 * 선택되는」 행이다.
 *
 * ★ 타입은 `market: 'KOSPI' | 'KOSDAQ'` 이라고 말하지만 **런타임은 그렇지 않다** — KONEX·
 *   `null`·master-sync 의 미확인 sentinel 이 그대로 실려 온다. 그래서 문자열 목록으로 본다.
 */
const ORDERABLE_MARKETS: readonly string[] = ['KOSPI', 'KOSDAQ'];
/*
  ★ 반환형이 **타입 서술자**다 (GC-IN-02) — 이 함수가 런타임에 확인하는 `row.isin !== null` 을
    타입에도 그대로 말한다. `boolean` 이면 TS 가 좁히지 못해 소비부가 `isin` 을 `string` 으로
    단언해 메우게 되고, 그 단언은 「검사와 타입이 갈라져도 컴파일러가 침묵한다」는 뜻이다 —
    나중에 이 함수에서 `isin` 검사를 빼도 아무 데서도 터지지 않는다.
*/
function isPickable(row: StockDetailResponse): row is StockDetailResponse & { isin: string } {
  return row.isin !== null && ORDERABLE_MARKETS.includes(row.market);
}

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
                  disabled={!isPickable(row)}
                  onClick={() => {
                    // 서술자가 여기서 `row.isin` 을 `string` 으로 좁힌다 — 단언이 필요 없다.
                    if (!isPickable(row)) return;
                    onPick({
                      isin: row.isin,
                      code: row.code,
                      name: row.name,
                      // `market` 을 싣지 않는다 (WR-03 / D-28) — 추측이 발주 설정이 되지 않게.
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
                  {!isPickable(row) && (
                    <span
                      data-slot="lc-search-unorderable"
                      className="flex-none text-[11px] text-[var(--muted-fg)]"
                    >
                      주문 불가
                    </span>
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
