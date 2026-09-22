"use client";

/**
 * TradingWorkbench — `/trading` **단일 트레이딩 작업대** 셸 (D-01 · D-02 · D-04 · D-09 · D-13 ·
 * D-27 · D-28, TRADE-09). 정본은 채택 목업 `18-workbench-mockup.html`(마크업 `:727-756`).
 *
 * ① 위 → 아래 고정 순서 (UI-SPEC §레이아웃 계약 표 10행)
 *   제목줄(「트레이딩」 + 계좌 필) → 상태줄 → VI 설정 2줄 → VI 발동 스트립/표 → 돌파 스트립/표 →
 *   종목 추가 → 카드 격자 → 공용 패널. 블록은 앞선 플랜(18-05 ~ 18-10)이 만든 것을 **조립만** 한다.
 *
 * ② ★ 이 컴포넌트가 **카드 집합의 단일 소유자**다
 *   `{ isin, accountNo, exchange, open, name?, code? }` 목록 · 단 수 · 선택된 미체결 행 · 상태줄 계좌 ·
 *   팝업 상태를 여기 한 곳이 갖는다. 돌파 스트립·종목 추가란의 `onAddCard`/`onFocusCard`, 카드 헤더의
 *   ✕·캐럿·거래소 세그먼트가 전부 이 상태를 바꾼다. 카드는 ISIN 당 한 장이다(콜백·DOM id 가 ISIN 축).
 *   - 새 카드는 **거래소 KRX · 스위치 전부 OFF · 펼침**으로 시작한다(D-07). 서버에 아무것도 보내지
 *     않는다 — 등록은 사용자가 카드에서 스위치를 켤 때뿐이다.
 *   - 등록된 전략(64 스냅샷 · 60 에코)은 처음 보이는 키일 때 **접힌 카드**로 한 번 들어온다(카드
 *     집합 멤버십만 읽는다 — 값은 카드가 스스로 읽는다, ③). 그래서 64 스냅샷 전의 짧은 구간은 빈
 *     문구다(E6 loading).
 *
 * ③ ★ 에코를 **분배하지 않는다** (Pitfall 9 · T-18-52)
 *   `limitChasers` 배열을 카드에 prop 으로 내리지 않는다. 카드는 `useRelayContext()` 에서 직접 읽고
 *   자기 `key` 로 `find` 한다(`strategy-card.tsx` ②). 작업대가 가운데 서는 순간 상관의 두 번째 벌이
 *   생긴다. 여기서 `limitChasers` 를 보는 곳은 딱 둘 — 처음 보는 키의 카드 추가(멤버십)와 ✕ 시
 *   「등록된 전략인가」 판정 — 이고 둘 다 카드에 값을 건네지 않는다.
 *
 * ④ 재렌더 예산 (Pitfall 10 · T-18-56)
 *   `useIsinLabels()` Map 을 카드에 통째로 내리지 않는다 — `labels.get(isin)` 결과 **문자열**만 내린다.
 *   카드 콜백은 전부 `isin` 을 받는 안정 콜백이다(`strategy-card.tsx` ④).
 *
 * ⑤ 컨테이너 두 개 (D-28)
 *   이 루트가 `@container/wb`(페이지 본문 폭)이고, 카드 래퍼가 `@container/lc`(카드 폭)다.
 *   **뷰포트 분기를 신설하지 않는다** — 앱 셸·사이드바만 기존 뷰포트 브레이크포인트를 쓴다. 단 수
 *   세그먼트를 폰 밴드에서 DOM 에서 빼려면 `wb` 폭을 알아야 해서, 루트 폭을 `ResizeObserver` 로
 *   읽어 상태줄에 `phoneBand` 로 내린다(격자 열 수는 CSS 가 정한다). 경계 700 의 정본은
 *   `globals.css` §2.2b 다.
 *
 * ⑥ `?focus={전략키}` 는 **마운트 1회만** 소비한다 (D-02 · RESEARCH Pattern 6 · T-18-53)
 *   `parseStrategyKey` 로만 해석하고, 모양이 어긋나면 무시한다. 그 키가 **등록된 전략**으로 보이면
 *   (스냅샷 도착 후) 그 카드를 펼친다 — 카드를 새로 **등록**하지 않는다. 뒤로가기로 URL 이 바뀌어도
 *   로컬 상태가 정본이다.
 *   이미 이 화면 위에서 사이드바 전략을 누르면 URL 만 바뀌므로, 사이드바가 보내는 **포커스 요청
 *   이벤트**(`lib/trading-focus.ts`)를 따로 듣는다(18-12). 같은 해석(`parseStrategyKey` → 등록 키
 *   대조)을 거치고, 스냅샷 전이면 마운트 때와 같은 보류 슬롯에 넣는다.
 *
 * ⑦ 이탈 경고 · 게이트 · 팝업은 **페이지 1곳**
 *   - `useLeaveWarning` 은 카드 더티 수 + VI 2줄 더티 수의 합으로 한 번만 건다.
 *   - `DmaGate` 는 여기 한 곳에서만 감싼다(카드마다 감싸지 않는다). 게이트가 서면 격자·스트립이
 *     렌더되지 않는다(T-18-54). 연결 중에는 게이트를 세우지 않는다(`useDmaGateReason` 규율).
 *   - 종목정보 팝업(`StockInfoModal`)은 한 번에 하나 — 상태를 여기 둔다.
 *
 * ⑧ 카드 ✕ (UI-SPEC E7 error)
 *   등록 전 카드는 즉시 사라진다. **등록된 전략이 있는 카드**는 확인 다이얼로그를 거친다 — 카드를
 *   닫는 것은 서버 전략 삭제가 아니다(전략은 계속 동작하고 사이드바·My page 에 남는다). 작업대가
 *   `lc.set` 을 직접 보내는 두 번째 송신 경로를 만들지 않는다 — 전략을 끄는 경로는 카드의 스위치 하나다.
 */

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import type { RelayExchange, RelayLimitChaser, RelayUnfilled } from "@gh-radar/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CardBody } from "@/components/trading/card/card-body";
import { StockInfoModal } from "@/components/trading/card/stock-info-modal";
import {
  StrategyCard,
  type StrategyCardState,
} from "@/components/trading/card/strategy-card";
import { DmaGate, useDmaGateReason } from "@/components/trading/dma-gate";
import type { StrategyLogEntry } from "@/components/trading/strategy-log";
import { isUnconfirmedViOrder } from "@/components/trading/vi-order-list";
import { BreakoutStrip } from "@/components/trading/workbench/breakout-strip";
import { CardGrid } from "@/components/trading/workbench/card-grid";
import { SharedPanels } from "@/components/trading/workbench/shared-panels";
import { StockAddBar } from "@/components/trading/workbench/stock-add-bar";
import { ViSettingsRows } from "@/components/trading/workbench/vi-settings-rows";
import { ViTriggerStrip } from "@/components/trading/workbench/vi-trigger-strip";
import {
  AccountPill,
  WorkbenchStatusBar,
} from "@/components/trading/workbench/workbench-status-bar";
import { readColsPref, type TradingCols } from "@/lib/breakout-list";
import { useIsinLabels } from "@/lib/isin-labels";
import { parseStrategyKey, strategyKey } from "@/lib/limit-chaser";
import { useRelayContext } from "@/lib/relay-provider";
import { useTradingFocusRequest } from "@/lib/trading-focus";
import { useLeaveWarning } from "@/lib/use-leave-warning";
import { relayQuoteKey, type RelayStatus } from "@/lib/use-relay-socket";
import { useViEndAlerts } from "@/lib/use-vi-end-alerts";
import { useViServerError } from "@/lib/use-vi-server-error";
import { readViAlertEnabled } from "@/lib/vi-alert";
import type { RelayQueuedWindowMsg } from "@gh-radar/shared";

/** 페이지(`wb`) 폰 밴드 상한(미만) — `globals.css` §2.2b 의 첫 경계(본문 700)와 같은 값이다. */
const WB_PHONE_BAND_BELOW = 700;

/** 합친 전략 로그 보관 상한(브라우저 메모리). 카드 1장의 상한(100)과 같은 자릿수다. */
const MAX_MERGED_LOG = 200;

/** 자동 복구를 기대할 수 없는 상태 — 상태줄에 「다시 연결」을 준다(18-10 호가 탭과 같은 집합). */
const UNRECOVERABLE_STATES: ReadonlySet<string> = new Set([
  "failed",
  "manual_required",
  "session_rejected",
]);

/** 종목 추가 검색란 — ✕ 로 마지막 카드가 사라졌을 때 포커스를 받는다. */
const ADD_SEARCH_SELECTOR = '[data-slot="stock-add-bar"] input';

/** 카드 1장의 작업대 측 상태(②). 값(전략·시세)은 없다 — 카드가 스스로 읽는다(③). */
export interface WorkbenchCard {
  isin: string;
  /** 카드 키의 계좌 — 만들 때의 상태줄 계좌(또는 등록된 전략 키의 계좌)로 고정된다(Q-3). */
  accountNo: string;
  exchange: RelayExchange;
  open: boolean;
  /** 추가 시점에 알던 종목명·코드(돌파 항목·검색 결과). 없으면 라벨 역매핑을 쓴다. */
  name?: string;
  code?: string;
}

/**
 * 등록된 전략 1건의 카드를 펼친 카드 집합 (**순수 함수** · ⑥). 같은 ISIN 카드가 있으면 펼치고,
 * 없으면 그 전략의 키(계좌·거래소)로 펼친 카드를 붙인다. `?focus=` 마운트 소비와 사이드바 포커스
 * 요청이 같은 규칙을 쓴다.
 */
function withFocusedCard(prev: WorkbenchCard[], hit: RelayLimitChaser): WorkbenchCard[] {
  return prev.some((x) => x.isin === hit.isin)
    ? prev.map((x) => (x.isin === hit.isin ? { ...x, open: true } : x))
    : [
        ...prev,
        {
          isin: hit.isin,
          accountNo: hit.accountNo,
          exchange: hit.exchange,
          open: true,
          name: hit.name,
          code: hit.code,
        },
      ];
}

/** 지금 시각 `HH:MM:SS` — 로케일 포맷터를 쓰지 않는다(`strategy-card.tsx` `clockNow` 와 같은 이유). */
function clockNow(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export function TradingWorkbench() {
  const gateReason = useDmaGateReason();
  // 게이트는 페이지를 **대체**한다(⑦). 아래 본문의 훅이 돌지 않도록 컴포넌트를 가른다.
  if (gateReason !== null) {
    return <DmaGate reason={gateReason} surface="트레이딩" />;
  }
  return <WorkbenchSurface />;
}

function WorkbenchSurface() {
  const relay = useRelayContext();
  const {
    status,
    statusLabel,
    accounts,
    accountStates,
    limitChasers,
    viTriggers,
    viOrders,
    rateCrossItems,
    rateCrossSnapSeq,
    queuedWindow,
    quotes,
    messages,
    reconnect,
  } = relay;
  const labels = useIsinLabels();
  /*
    ④ — 라벨 Map 은 계좌 델타마다 새 인스턴스다. 콜백이 Map 을 의존성으로 잡으면 콜백이 매번 바뀌어
    카드 `memo` 가 죽는다. 콜백 안에서는 ref 로 최신 Map 을 읽는다.
  */
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  /* ── 상태줄 계좌 (Q-2 · Q-3) ─────────────────────────────────────── */
  const [accountNo, setAccountNo] = useState("");
  // 계좌가 도착하면 **미선택일 때만** 첫 계좌를 고른다. 이미 고른 계좌를 덮지 않는다.
  useEffect(() => {
    if (accountNo !== "" || accounts.length === 0) return;
    setAccountNo(accounts[0].accountNo);
  }, [accountNo, accounts]);

  /* ── 카드 집합 (②) ────────────────────────────────────────────────── */
  const [cards, setCards] = useState<WorkbenchCard[]>([]);

  // 계좌 도착 전에 만든 카드는 계좌가 비어 있다 — 계좌가 정해지면 그 카드들만 채운다.
  useEffect(() => {
    if (accountNo === "") return;
    setCards((prev) =>
      prev.some((c) => c.accountNo === "")
        ? prev.map((c) => (c.accountNo === "" ? { ...c, accountNo } : c))
        : prev,
    );
  }, [accountNo]);

  /** 펼친 뒤 화면에 들여올 카드(ISIN). 레이아웃 효과가 한 번 스크롤하고 비운다. */
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);

  /* ── ⑥ `?focus=` — 마운트 1회 소비 ───────────────────────────────── */
  const searchParams = useSearchParams();
  const pendingFocus = useRef<ReturnType<typeof parseStrategyKey> | undefined>(undefined);
  if (pendingFocus.current === undefined) {
    const raw = searchParams?.get("focus") ?? null;
    pendingFocus.current = raw === null ? null : parseStrategyKey(raw);
  }

  /* ── 등록된 전략 → 처음 보는 키만 카드로 (② · 멤버십만) ─────────── */
  const seenKeys = useRef(new Set<string>());
  useEffect(() => {
    const fresh = limitChasers.filter((c) => !seenKeys.current.has(c.key));
    for (const c of fresh) seenKeys.current.add(c.key);

    const f = pendingFocus.current;
    const focusHit =
      f === null || f === undefined
        ? undefined
        : limitChasers.find((c) => c.key === strategyKey(f.isin, f.accountNo, f.exchange));
    if (focusHit !== undefined) pendingFocus.current = null;

    if (fresh.length === 0 && focusHit === undefined) return;
    setCards((prev) => {
      let next = prev;
      for (const c of fresh) {
        if (next.some((x) => x.isin === c.isin)) continue;
        next = [
          ...next,
          {
            isin: c.isin,
            accountNo: c.accountNo,
            exchange: c.exchange,
            open: false,
            name: c.name,
            code: c.code,
          },
        ];
      }
      if (focusHit !== undefined) next = withFocusedCard(next, focusHit);
      return next;
    });
    if (focusHit !== undefined) setScrollTarget(focusHit.isin);
  }, [limitChasers]);

  /* ── ⑥ 사이드바 포커스 요청 — 이미 이 화면 위일 때 (18-12) ───────── */
  const limitChasersRef = useRef(limitChasers);
  limitChasersRef.current = limitChasers;
  useTradingFocusRequest((raw) => {
    const f = parseStrategyKey(raw);
    if (f === null) return;
    const hit = limitChasersRef.current.find(
      (c) => c.key === strategyKey(f.isin, f.accountNo, f.exchange),
    );
    if (hit === undefined) {
      // 스냅샷 전 — 마운트 때와 같은 보류 슬롯. 등록 전략이 보이는 순간 위 효과가 펼친다.
      pendingFocus.current = f;
      return;
    }
    setCards((prev) => withFocusedCard(prev, hit));
    setScrollTarget(hit.isin);
  });

  /* ── 펼치고 스크롤 ────────────────────────────────────────────────── */
  useLayoutEffect(() => {
    if (scrollTarget === null) return;
    const el = document.querySelector(
      `[data-slot="strategy-card"][data-key^="${scrollTarget}:"]`,
    );
    el?.scrollIntoView?.({ block: "nearest" });
    setScrollTarget(null);
  }, [scrollTarget]);

  const focusCard = useCallback((isin: string) => {
    setCards((prev) => prev.map((c) => (c.isin === isin ? { ...c, open: true } : c)));
    setScrollTarget(isin);
  }, []);

  const addCard = useCallback(
    (isin: string, name?: string, code?: string) => {
      setCards((prev) =>
        prev.some((c) => c.isin === isin)
          ? prev.map((c) => (c.isin === isin ? { ...c, open: true } : c))
          : [...prev, { isin, accountNo, exchange: "KRX", open: true, name, code }],
      );
      setScrollTarget(isin);
    },
    [accountNo],
  );

  const toggleCard = useCallback((isin: string) => {
    setCards((prev) => prev.map((c) => (c.isin === isin ? { ...c, open: !c.open } : c)));
  }, []);

  const changeExchange = useCallback((isin: string, exchange: RelayExchange) => {
    setCards((prev) => prev.map((c) => (c.isin === isin ? { ...c, exchange } : c)));
  }, []);

  /* ── 더티 합산 · 이탈 경고 (⑦) ────────────────────────────────────── */
  const [cardDirty, setCardDirty] = useState<Readonly<Record<string, number>>>({});
  const [viDirty, setViDirty] = useState(0);
  const reportDirty = useCallback((isin: string, count: number) => {
    setCardDirty((prev) => (prev[isin] === count ? prev : { ...prev, [isin]: count }));
  }, []);
  const cardDirtySum = cards.reduce((sum, c) => sum + (cardDirty[c.isin] ?? 0), 0);
  useLeaveWarning(cardDirtySum + viDirty > 0);

  /* ── 카드 제거 (⑧) ────────────────────────────────────────────────── */
  const removeCard = useCallback((isin: string) => {
    setCards((prev) => prev.filter((c) => c.isin !== isin));
    setCardDirty((prev) => {
      if (!(isin in prev)) return prev;
      const next = { ...prev };
      delete next[isin];
      return next;
    });
  }, []);

  const [closeAsk, setCloseAsk] = useState<string | null>(null);
  const registeredKeys = useMemo(() => new Set(limitChasers.map((c) => c.key)), [limitChasers]);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const registeredRef = useRef(registeredKeys);
  registeredRef.current = registeredKeys;

  const closeCard = useCallback(
    (isin: string) => {
      const card = cardsRef.current.find((c) => c.isin === isin);
      if (card === undefined) return;
      const key = strategyKey(card.isin, card.accountNo, card.exchange);
      if (card.accountNo !== "" && registeredRef.current.has(key)) {
        setCloseAsk(isin);
        return;
      }
      removeCard(isin);
    },
    [removeCard],
  );

  /* ── 공용 패널 · 미체결 선택 (D-13 · D-21) ────────────────────────── */
  const account = accountNo === "" ? null : (accountStates.get(accountNo) ?? null);
  const [selected, setSelected] = useState<RelayUnfilled | null>(null);
  // 계좌를 바꾸면 선택을 푼다 — 다른 계좌의 원주문번호로 정정·취소가 나가면 안 된다.
  useEffect(() => setSelected(null), [accountNo]);
  // 선택은 **살아 있는 행**으로만 산다(체결·취소로 사라지면 해제, 잔량이 바뀌면 새 행으로).
  const liveSelected = useMemo(() => {
    if (selected === null || account === null) return null;
    return account.unf.find((u) => u.orderNo === selected.orderNo) ?? null;
  }, [selected, account]);

  const selectUnfilled = useCallback(
    (row: RelayUnfilled | null) => {
      setSelected(row);
      if (row !== null && cardsRef.current.some((c) => c.isin === row.isin)) focusCard(row.isin);
    },
    [focusCard],
  );
  const clearSelection = useCallback(() => setSelected(null), []);

  const priceOf = useCallback(
    (isin: string) => {
      const exchange = cardsRef.current.find((c) => c.isin === isin)?.exchange ?? "KRX";
      const p = quotes.get(relayQuoteKey(isin, exchange))?.p;
      return p !== undefined && p > 0 ? p : undefined;
    },
    [quotes],
  );

  /* ── 전략 로그 합치기 (공용 패널 「전략 로그」) ───────────────────── */
  const [mergedLog, setMergedLog] = useState<StrategyLogEntry[]>([]);
  const seenLog = useRef(new WeakSet<StrategyLogEntry>());
  const logSeq = useRef(0);
  const reportLog = useCallback(
    (isin: string, log: readonly StrategyLogEntry[]) => {
      const fresh = log.filter((e) => !seenLog.current.has(e));
      if (fresh.length === 0) return;
      for (const e of fresh) seenLog.current.add(e);
      const card = cardsRef.current.find((c) => c.isin === isin);
      const who = card?.name ?? labelsRef.current.get(isin)?.name ?? isin;
      setMergedLog((prev) => {
        const add: StrategyLogEntry[] = [];
        // `log` 는 최신이 index 0 — 오래된 것부터 쌓아 최신이 맨 위에 오게 한다.
        for (let i = fresh.length - 1; i >= 0; i -= 1) {
          const e = fresh[i];
          const last = add[0] ?? prev.find((p) => p.who === who);
          /*
            ★ 카드는 펼침/접힘으로 스택 ↔ 격자를 옮기며 다시 마운트되고(D-09 재렌더), 그때 첫 에코
              문장(「전략이 등록됐어요 · …」)을 다시 쓴다. 같은 종목의 **직전 줄과 같은 문장**은 합친
              목록에 두 번 쌓지 않는다.
          */
          if (last !== undefined && last.who === who && last.text === e.text) continue;
          logSeq.current += 1;
          add.unshift({ ...e, id: `wb-log-${logSeq.current}`, who });
        }
        return add.length === 0 ? prev : [...add, ...prev].slice(0, MAX_MERGED_LOG);
      });
    },
    [],
  );

  /* ── 종목정보 팝업 (⑦) ────────────────────────────────────────────── */
  const [info, setInfo] = useState<{ code: string | null; name: string } | null>(null);
  const openInfo = useCallback(
    (isin: string) => {
      const card = cardsRef.current.find((c) => c.isin === isin);
      const label = labelsRef.current.get(isin);
      setInfo({
        code: card?.code ?? label?.code ?? null,
        name: card?.name ?? label?.name ?? isin,
      });
    },
    [],
  );

  /* ── 상태줄 입력 ──────────────────────────────────────────────────── */
  const [cols, setCols] = useState<TradingCols>(1);
  // 저장값은 마운트 후에 읽는다 — SSR HTML 과 첫 클라 렌더가 갈리면 하이드레이션이 깨진다.
  useEffect(() => setCols(readColsPref()), []);

  const [breakoutCounts, setBreakoutCounts] = useState({ total: 0, fresh: 0 });
  const viUnconfirmed = useMemo(() => viOrders.filter(isUnconfirmedViOrder).length, [viOrders]);

  // VI 몫 서버 거부 — 옛 VI 화면 상태줄 자리를 VI 두 줄 아래로 옮겼다(18-13 · T-16-07).
  const viServerError = useViServerError(messages);

  const [viAlertOn, setViAlertOn] = useState(false);
  useEffect(() => setViAlertOn(readViAlertEnabled()), []);
  useViEndAlerts(viOrders, viAlertOn);

  const appliedAt = useAppliedAt({ limitChasers, rateCrossItems, viOrders, viTriggers, queuedWindow });

  /* ── ⑤ `wb` 폭 → 폰 밴드 ─────────────────────────────────────────── */
  const rootRef = useRef<HTMLDivElement>(null);
  const [phoneBand, setPhoneBand] = useState<boolean | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width === undefined || width === 0) return;
      setPhoneBand(width < WB_PHONE_BAND_BELOW);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── 파생 ─────────────────────────────────────────────────────────── */
  const cardIsins = useMemo(() => new Set(cards.map((c) => c.isin)), [cards]);
  const accountName = accounts.find((a) => a.accountNo === accountNo)?.name;
  const closeCardInfo = closeAsk === null ? null : cards.find((c) => c.isin === closeAsk) ?? null;

  return (
    <div
      ref={rootRef}
      data-slot="trading-workbench"
      className="@container/wb flex min-w-0 flex-col gap-3"
    >
      {/* 1 · 제목줄 */}
      <div data-slot="workbench-title" className="flex min-w-0 flex-wrap items-center gap-2.5">
        <h1 className="m-0 text-[length:var(--t-h3)] leading-[var(--lh-tight)] font-bold text-[var(--fg)]">
          트레이딩
        </h1>
        <AccountPill accounts={accounts} accountNo={accountNo} onChange={setAccountNo} />
      </div>

      {/* 2 · 상태줄 */}
      <WorkbenchStatusBar
        status={status}
        statusLabel={statusLabel}
        breakoutCount={breakoutCounts.total}
        breakoutNewCount={breakoutCounts.fresh}
        viCount={viOrders.length}
        viUnconfirmedCount={viUnconfirmed}
        cardCount={cards.length}
        queuedWindow={queuedWindow}
        appliedAt={appliedAt}
        cols={cols}
        onColsChange={setCols}
        phoneBand={phoneBand}
        onViAlertChange={setViAlertOn}
        onReconnect={UNRECOVERABLE_STATES.has(status) ? reconnect : undefined}
      />

      {/* 3 · VI 설정 2줄 */}
      <ViSettingsRows
        viTriggers={viTriggers}
        accountNo={accountNo}
        accountName={accountName}
        disabled={status !== "ready"}
        viOrders={viOrders}
        onDirtyCountChange={setViDirty}
        serverError={viServerError}
      />

      {/* 4·5 · VI 발동 스트립 / 표 */}
      <ViTriggerStrip items={viOrders} disabled={status !== "ready"} />

      {/* 6·7 · 돌파 스트립 / 표 */}
      <BreakoutStrip
        items={rateCrossItems}
        snapSeq={rateCrossSnapSeq}
        cards={cardIsins}
        onAddCard={addCard}
        onFocusCard={focusCard}
        onCountsChange={setBreakoutCounts}
      />

      {/* 8 · 종목 추가 */}
      <StockAddBar cards={cardIsins} onAdd={addCard} onFocusCard={focusCard} />

      {/* 9 · 카드 격자 */}
      <CardGrid
        cards={cards}
        cols={cols}
        fallbackFocusSelector={ADD_SEARCH_SELECTOR}
        renderCard={(c) => (
          <WorkbenchCardItem
            card={c}
            name={c.name ?? labels.get(c.isin)?.name ?? ""}
            code={c.code ?? labels.get(c.isin)?.code ?? null}
            status={status}
            queuedWindow={queuedWindow}
            selectedUnfilled={
              liveSelected !== null &&
              liveSelected.isin === c.isin &&
              liveSelected.exchange === c.exchange &&
              c.accountNo === accountNo
                ? liveSelected
                : null
            }
            onClearSelection={clearSelection}
            onToggle={toggleCard}
            onClose={closeCard}
            onExchangeChange={changeExchange}
            onInfo={openInfo}
            onDirtyCountChange={reportDirty}
            onLogChange={reportLog}
          />
        )}
      />

      {/* 10 · 공용 패널 */}
      <SharedPanels
        accountNo={accountNo}
        account={account}
        status={status}
        logEntries={mergedLog}
        selectedOrderNo={liveSelected?.orderNo ?? null}
        onSelectUnfilled={selectUnfilled}
        dirtyBarVisible={cardDirtySum > 0}
        priceOf={priceOf}
        phoneBand={phoneBand}
      />

      <StockInfoModal
        code={info?.code ?? null}
        name={info?.name ?? ""}
        open={info !== null}
        onOpenChange={(open) => {
          if (!open) setInfo(null);
        }}
      />

      <Dialog
        open={closeCardInfo !== null}
        onOpenChange={(open) => {
          if (!open) setCloseAsk(null);
        }}
      >
        <DialogContent
          data-testid="workbench-close-confirm"
          onCloseAutoFocus={(e) => {
            // 카드를 닫았으면 ✕ 버튼이 사라졌다 — 포커스는 격자가 다음 카드 헤더로 옮긴다.
            if (closeCardInfo !== null && !cardIsins.has(closeCardInfo.isin)) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>등록된 전략이 있는 카드예요</DialogTitle>
            <DialogDescription>
              카드를 닫아도 서버의 상따 전략은 그대로 동작해요. 전략을 멈추려면 카드에서 매수·매도
              스위치를 끄세요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseAsk(null)}>
              취소
            </Button>
            <Button
              onClick={() => {
                if (closeCardInfo !== null) removeCard(closeCardInfo.isin);
                setCloseAsk(null);
              }}
            >
              카드 닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * 「반영 {HH:MM:SS}」 — 작업대가 서버 push(64/60 전략 · 76/78 돌파 · 72/73 VI 주문 · 61 VI 설정 ·
 * 77 창)를 **받은 시각**. 마운트 시점에 이미 있던 값은 반영으로 치지 않는다(첫 push 전 = 「반영 —」).
 * 상태줄은 벽시계를 읽지 않고 이 문자열을 그대로 쓴다(D-22).
 */
function useAppliedAt(sources: {
  limitChasers: unknown;
  rateCrossItems: unknown;
  viOrders: unknown;
  viTriggers: unknown;
  queuedWindow: RelayQueuedWindowMsg | undefined;
}): string | null {
  const [appliedAt, setAppliedAt] = useState<string | null>(null);
  const prev = useRef(sources);
  const { limitChasers, rateCrossItems, viOrders, viTriggers, queuedWindow } = sources;
  useEffect(() => {
    const p = prev.current;
    const changed =
      p.limitChasers !== limitChasers ||
      p.rateCrossItems !== rateCrossItems ||
      p.viOrders !== viOrders ||
      p.viTriggers !== viTriggers ||
      p.queuedWindow !== queuedWindow;
    prev.current = { limitChasers, rateCrossItems, viOrders, viTriggers, queuedWindow };
    if (changed) setAppliedAt(clockNow());
  }, [limitChasers, rateCrossItems, viOrders, viTriggers, queuedWindow]);
  return appliedAt;
}

interface WorkbenchCardItemProps {
  card: WorkbenchCard;
  name: string;
  code: string | null;
  status: RelayStatus;
  queuedWindow: RelayQueuedWindowMsg | undefined;
  selectedUnfilled: RelayUnfilled | null;
  onClearSelection: () => void;
  onToggle: (isin: string) => void;
  onClose: (isin: string) => void;
  onExchangeChange: (isin: string, exchange: RelayExchange) => void;
  onInfo: (isin: string) => void;
  onDirtyCountChange: (isin: string, count: number) => void;
  onLogChange: (isin: string, log: readonly StrategyLogEntry[]) => void;
}

/**
 * 카드 1장 = `StrategyCard` + `CardBody` 본문(18-10). 본문 렌더 함수를 카드마다 **안정적으로** 만들어
 * `StrategyCard` 의 `memo` 가 살게 한다(④). 전략 배열·라벨 Map 은 여기에도 없다 — 문자열과 이 카드의
 * 선택 행만 온다(③ · T-18-52).
 */
const WorkbenchCardItem = memo(function WorkbenchCardItem({
  card,
  name,
  code,
  status,
  queuedWindow,
  selectedUnfilled,
  onClearSelection,
  onToggle,
  onClose,
  onExchangeChange,
  onInfo,
  onDirtyCountChange,
  onLogChange,
}: WorkbenchCardItemProps) {
  const { isin, accountNo, exchange, open } = card;
  const body = useCallback(
    (state: StrategyCardState) => (
      <CardBody
        variant="card"
        card={state}
        isin={isin}
        accountNo={accountNo}
        exchange={exchange}
        name={name}
        code={code}
        status={status}
        queuedWindow={queuedWindow}
        selectedUnfilled={selectedUnfilled}
        onClearSelection={onClearSelection}
      />
    ),
    [isin, accountNo, exchange, name, code, status, queuedWindow, selectedUnfilled, onClearSelection],
  );

  return (
    <StrategyCard
      isin={isin}
      accountNo={accountNo}
      exchange={exchange}
      name={name}
      code={code}
      open={open}
      onToggle={onToggle}
      onClose={onClose}
      onExchangeChange={onExchangeChange}
      onInfo={onInfo}
      onDirtyCountChange={onDirtyCountChange}
      onLogChange={onLogChange}
      body={body}
    />
  );
});
