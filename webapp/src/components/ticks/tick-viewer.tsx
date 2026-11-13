'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { fmtTickTime, type TickOpenResponse } from '@gh-radar/shared';

import { buildMsgRows, ownLineRec, type MsgRowsModel } from '@/lib/ticks/msg-rows';
import {
  buildOwnModel,
  ownSelKeyOf,
  resolveOwnSel,
  type OwnModel,
  type OwnOrderView,
  type OwnSel,
  type OwnSelKey,
} from '@/lib/ticks/own-model';
import { fmtQty } from '@/lib/ticks/tick-format';
import type { TickSession } from '@/lib/ticks/tick-session';
import type { TickUrlState } from '@/lib/ticks/tick-url';
import { useChartKind } from '@/lib/ticks/use-candle-prefs';
import type { ChartViewSnap } from '@/lib/ticks/use-view-sync';
import { useTickCursor, type TickCursor } from '@/lib/ticks/use-tick-cursor';
import { useOwnNav, type OwnNavState } from '@/lib/ticks/use-own-nav';
import { useTickOwn } from '@/lib/ticks/use-tick-own';
import { cn } from '@/lib/utils';

import { TickBook, type TickBookUnit } from './tick-book';
import { CandleChart } from './candle-chart';
import { ChartKindSwitch, type ChartKind } from './chart-kind-switch';
import { TickAmountCard } from './tick-amount-card';
import { TickChart } from './tick-chart';
import { TickMsgList } from './tick-msg-list';
import { TickOrderCard, ownOrdersAt } from './tick-order-card';
import { TickOwnTab } from './tick-own-section';
import { TickSlider } from './tick-slider';
import { TickTeamPanel } from './tick-team-panel';

/**
 * 틱 뷰어 본문 (Phase 37 D-00 · 스케치 019 D 「종합 A+B」).
 *
 * ① 배치(위 → 아래): **매집감지 3판 차트**(37-14 · 클릭 = 그 시각 첫 틱 · 원 클릭 = 그 주문 마지막 조각) → **슬라이더 카드** → **HTS 행**(호가 10단 | 전문 목록 · 37-13 |
 *   이 주문 · 거래대금 · 팀 · 37-13/14). 커서(`useTickCursor`)가 이 화면의 정본이고, 현재 틱 시각 · seq 는 `onTick` 으로
 *   머리에 올린다.
 * ② HTS 칸은 `HTS_PANES` 배열 한 곳에서 그린다 — 뒤 플랜이 원소(전문 · 버스트 · 팀)를 더하면 데스크톱 행과 폰 세그먼트가
 *   같이 늘어난다. 데스크톱(> 640px) = 칸을 가로로 나란히 · 폰(≤ 640px) = 「호가 | 전문 | 버스트 · 팀」 세그먼트로 하나씩.
 *   세그먼트 상태는 이 컴포넌트가 든다. 판정은 CSS(뷰포트 640px)라 JS 가 폭을 재지 않는다.
 *   데스크톱 줄은 줄바꿈(flex-wrap)이다 — 호가 300 고정 · 전문 기본 480(남는 폭을 먼저 가져간다) · 오른쪽 열 기본 330.
 *   본문 폭이 모자라면(사이드바 펼친 1280 등) 오른쪽 열이 아래 줄로 내려가 전체 폭을 쓰고, 그때 카드는 두 열로 놓인다.
 *   줄 높이 = 전문 목록 고정 높이 640(오른쪽 열은 최대 640 · 넘치면 그 안에서 스크롤).
 * ③ 당일(`live` · 37-19 · D-06 · D-18): 슬라이더 「끝으로」(`showEnd`) · `t` 없으면 끝 틱에서 연다 · 커서가 끝이면 증분 세션을
 *   따라간다(`useTickCursor` ⑤) · 끝 여부를 `onAtEnd` 로 올린다 · 증분은 머리 「최신 받기」 버튼으로만(2026-11-03 — 자동 갱신 없음).
 *   과거 틱을 보는 동안 받은 레코드가 있으면 전문 목록 끝에 「새 틱 n건 · 끝으로」 배지. 배지 · 「끝으로」 = 커서 끝 + `onGoEnd`
 *   (새 틱 수 0 · 요청 없음).
 * ④ 우리 주문 · 체결(Phase 38 · D-14 · D-15): 열 때 `useTickOwn(urlState, ownRefreshKey)` 가 `GET /api/ticks/own` 을 한 번 부르고
 *   (자동 타이머 없음 · 당일이면 페이지가 「최신 받기」 때마다 `ownRefreshKey` 를 올려 1회 더 — 38-08), 응답을 세션과 따로 `buildOwnModel(session, own)` 으로 짝짓는다(shared `matchOwnFills` · 세션 안에
 *   넣지 않는다). 모델은 `PaneCtx.own` 으로 칸에 내려가 전문 목록이 우리 체결 A3 행에 민트 칩을 그린다. 조회가 실패하면
 *   우리 층만 없고 뷰어는 지금과 같다(다시 받다 실패하면 직전 층 + 오른쪽 열 「직전 값」 한 줄 — R2 WR-03). 당일(`live`)이면 짝이 아직 바뀔 수 있는 막 들어온 체결은 대기로 둔다(38-04 · Pitfall 4 ·
 *   장 끝 뒤 받은 세션은 `live.asOfMs` 로 대기 없음 · 장중에는 tickgw as-of `live.serverAsOfMs` 로 한산한 종목도 풀린다 — `buildOwnModel` ⑥).
 *   주문 줄 · 짝 없음 줄 클릭 = `ownPick`(줄 + 기준 rec) + 커서 이동 · 선택 표시는 커서가 그 rec 일 때만(파생 — ←/→ 로
 *   커서가 바뀌면 풀린다 · URL 은 rec 기준 그대로).
 * ⑤ 근거 · 되돌아가기(38-06 · D-07 · D-10): 전문 목록 항목(`buildMsgRows`)을 여기서 한 번 만들어 목록(`rows` prop)과 주문 줄
 *   찾기(`ownLineRec`)가 같이 쓴다. 카드 「보기 ›」(근거 · 직전 체결 · 표 근거 칸)는 커서를 옮기고 그 주문을 기억해 side 칸 맨 위에
 *   「‹ 주문 #… 로」 알약(`ownBack`)을 남긴다 — 한 단계 · 누르면 그 주문 줄(없으면 첫 짝 체결)로 가고 사라짐 · 다른 「보기 ›」 가
 *   덮어씀 · 종목 · 날짜 · 거래소가 바뀌면 사라짐(파생).
 * ⑥ 차트 우리 점(38-07 · D-08): `TickChart own` — ◆ 클릭 = 그 체결 A3 행 · ○ 클릭 = 근거 행 + 같은 알약 · ◇ 클릭 = 그 짝 없음
 *   줄 선택(`rows.ownPosOfFill` → `ownLineRec`).
 * ⑦ 우리 체결 탐색(38-08 · D-09): `useOwnNav`(rows + own → 탐색 대상 · k/n · ‹ › · 키 `[` `]`)의 상태를 `onOwn` 으로 페이지에
 *   올려 제목 줄 알약이 그린다(`onTick` 과 같은 꼴 · 상태 객체는 k · n · 주문 수가 바뀔 때만 새것 · 떠나면 null).
 */

export interface TickViewerProps {
  session: TickSession;
  urlState: Omit<TickUrlState, 't' | 'k'>;
  /** 열기 시점의 URL `t` — 열린 뒤 URL 이 바뀌어도 다시 읽지 않는다. */
  initialT: string | null;
  /** 열기 시점의 URL `k`(같은 ms 안 수신순 순번 · WR-65). */
  initialK?: number | null;
  onTick?: (label: { time: string; seq: number | null }) => void;
  /** 열기 응답 `accum`(차트 누적 선 · 팀 패널 누적 — D-09). */
  accum?: TickOpenResponse['accum'];
  /** 당일 화면 — 누적 선 없음(D-09). */
  isToday?: boolean;
  /** 종목 상장주식수(열기 응답 `stock.listing_shares`) — 차트 · 거래대금 카드의 시총 대비. */
  listingShares?: number | null;
  /** 당일 바이트 경로(37-19) — 없으면 과거 격자. */
  live?: TickViewerLive;
  /** 우리 체결 탐색 상태(38-08 · D-09) — 제목 줄 알약용. 뷰어가 사라지면 null. */
  onOwn?: (s: OwnNavState | null) => void;
  /** 우리 체결 다시 받기 키(38-08 · 당일 「최신 받기」) — 바뀔 때마다 `/api/ticks/own` 1회. 과거 격자는 넘기지 않는다(= 0 · 열 때 1회). */
  ownRefreshKey?: number;
  /** 종목 코드(열기 응답 `stock.code` · Phase 42 D-11) — 봉 차트 일 이동평균 종가 요청. 없으면 null(요청 없음). */
  stockCode?: string | null;
}

export interface TickViewerLive {
  /** 커서가 끝이 아닐 때 붙은 레코드 수. */
  newCount: number;
  /** 「끝으로」 · 배지 — 새 틱 수를 비운다(요청 없음 · 커서는 뷰어가 끝으로 옮긴다). */
  onGoEnd: () => void;
  /** 커서가 끝 틱인지 바뀔 때마다. */
  onAtEnd: (atEnd: boolean) => void;
  /** 마지막 성공 응답 시각(브라우저 epoch ms · tickgw 상태 ready 일 때만) — 장 끝 뒤 받은 세션이면 우리 체결 대기 없음(R2 WR-02). */
  asOfMs?: number | null;
  /** tickgw as-of(`X-Tick-As-Of-Ms` · 서버 epoch ms · 상태 ready 일 때만) — 장중 우리 체결 대기 cutoff 를 앞당긴다(quick-261104-6lh). */
  serverAsOfMs?: number | null;
}

/** HTS 칸 렌더 문맥 — 칸마다 같은 세션 · 커서를 본다. */
interface PaneCtx {
  session: TickSession;
  cursor: TickCursor;
  unit: TickBookUnit;
  setUnit: (u: TickBookUnit) => void;
  accum: TickOpenResponse['accum'];
  isToday: boolean;
  listingShares: number | null;
  /** 당일 과거 틱 배지(전문 목록 끝) — 끝이면 null. */
  badge: ReactNode;
  /** 우리 체결 모델(Phase 38) — 조회 전 · 실패면 null. */
  own: OwnModel | null;
  /** 다시 받기가 실패해 직전 우리 층을 보이는 중(R2 WR-03 — `useTickOwn` status 'error' ∧ own 있음). */
  ownStale: boolean;
  /** 고른 우리 줄(주문 줄 · 짝 없음 줄) — 커서가 그 줄의 기준 전문일 때만(파생). */
  ownSel: OwnSel | null;
  onOwnSelect: (sel: OwnSel, rec: number) => void;
  /** 전문 행으로 커서 이동 + 고른 우리 줄 풀기 — 카드 · 「우리 주문」 표의 이동(R1 IN-02 · `[` `]` 의 navJump 와 같다). */
  jumpRec: (rec: number) => void;
  /** 전문 목록 항목 모델 — 뷰어가 한 번 만들어 목록 · 되돌아가기가 같이 쓴다(38-06). */
  rows: MsgRowsModel;
  /** 그 주문 줄 선택(없으면 첫 짝 체결 · 짝 없음 줄). */
  onOwnOrder: (orderId: number) => void;
  /** 카드 「보기 ›」 로 떠날 때 되돌아갈 주문 기억(D-10). */
  onOwnBack: (orderId: number) => void;
  /** 되돌아가기 알약의 주문 · 없으면 null. */
  ownBackOrder: OwnOrderView | null;
  onOwnBackGo: () => void;
}

interface HtsPane {
  id: string;
  /** 폰 세그먼트 라벨. */
  label: string;
  /** 데스크톱 폭 클래스(행 안 flex 항목). */
  desktop: string;
  render: (c: PaneCtx) => ReactNode;
}

type SideTab = 'this' | 'own';

/**
 * 오른쪽 열(「버스트 · 팀」) — 되돌아가기 알약 · 이 주문 · 거래대금 · 팀 거래정보(37-14).
 * 우리 층(own)이 있으면 맨 위에 「이 주문 · 팀 | 우리 주문 n」 탭(스케치 026 A · 2026-11-03 UAT): 둘째 탭 = 그날 「우리 주문」 표가
 * 열 전체를 쓴다(거르기 칩). 행 클릭 · 근거 · 키 `[` `]` 로 커서가 움직여도 탭은 그대로(목록 자리 유지). 「◆ 우리 주문 #…」 섹션은
 * 첫 탭 이 주문 카드 안. 탭 막대는 데스크톱 열 스크롤 안에서 위에 붙는다(열이 스크롤 컨테이너 · 폰은 페이지 스크롤이라 붙지 않음).
 * own 이 없으면 탭 없이 37 그대로. 다시 받기가 실패해 직전 own 을 보이는 중이면 탭 아래 한 줄 「우리 체결을 받지 못했어요 · 직전 값」.
 */
function TickSidePane({
  session,
  cursor,
  accum,
  isToday,
  listingShares,
  own,
  ownStale,
  ownSel,
  jumpRec,
  onOwnOrder,
  onOwnBack,
  ownBackOrder,
  onOwnBackGo,
}: PaneCtx) {
  const [tab, setTab] = useState<SideTab>('this');
  const shown: SideTab = own === null ? 'this' : tab;
  const tabBtn = (key: SideTab, label: ReactNode) => (
    <button
      type="button"
      role="tab"
      data-slot="tick-side-tab"
      data-tab={key}
      aria-selected={shown === key}
      onClick={() => setTab(key)}
      className={cn(
        '-mb-px inline-flex h-8 items-center border-b-2 px-2.5 text-[12px] whitespace-nowrap transition-colors',
        shown === key
          ? key === 'own'
            ? 'border-[var(--mine)] font-bold text-[var(--mine-fg)]'
            : 'border-[var(--fg)] font-bold text-[var(--fg)]'
          : 'border-transparent text-[var(--muted-fg)] hover:text-[var(--fg)]',
      )}
    >
      {label}
    </button>
  );
  return (
    <div
      data-slot="tick-side"
      className="grid content-start gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))] max-[640px]:grid-cols-1"
    >
      {ownBackOrder !== null && (
        // 되돌아가기 알약(D-10) — 탭 위 · 한 단계. 격자 한 칸을 차지하지 않게 전체 폭 줄에 왼쪽 정렬.
        <button
          type="button"
          data-slot="tick-own-back"
          data-order={ownBackOrder.id}
          onClick={onOwnBackGo}
          className="col-span-full inline-flex h-6 items-center justify-self-start rounded-full bg-[var(--mine-bg)] px-2.5 text-[11.5px] font-semibold whitespace-nowrap text-[var(--mine-fg)]"
        >
          {`‹ 주문 #${ownBackOrder.orderNo !== '' ? ownBackOrder.orderNo : '—'} 로`}
        </button>
      )}
      {own !== null && (
        <div
          role="tablist"
          aria-label="오른쪽 열"
          data-slot="tick-side-tabs"
          className="sticky top-0 z-[2] col-span-full flex gap-0.5 border-b border-[var(--border-subtle)] bg-[var(--bg)]"
        >
          {tabBtn('this', '이 주문 · 팀')}
          {tabBtn(
            'own',
            <>
              우리 주문
              <span className="ml-1 rounded-full bg-[var(--mine-bg)] px-1.5 text-[10.5px] font-bold text-[var(--mine-fg)] tabular-nums">
                {fmtQty(own.orders.length)}
              </span>
            </>,
          )}
        </div>
      )}
      {own !== null && ownStale && (
        // 다시 받기 실패 — 직전 우리 층이 지금 세션보다 낡았을 수 있다(R2 WR-03 · 자동 재시도 없음 · 다시 누를 때까지)
        <p
          data-slot="tick-own-stale"
          role="status"
          className="col-span-full m-0 text-[length:var(--t-caption)] font-medium text-[var(--destructive)]"
        >
          우리 체결을 받지 못했어요 · 직전 값
        </p>
      )}
      {shown === 'own' && own !== null ? (
        <TickOwnTab
          className="col-span-full"
          own={own}
          selected={ownOrdersAt(own, cursor.rec, ownSel)}
          onJump={jumpRec}
          onOrder={onOwnOrder}
          onBack={onOwnBack}
        />
      ) : (
        <>
          <TickOrderCard
            session={session}
            cursorRec={cursor.rec}
            onJump={jumpRec}
            own={own}
            ownSel={ownSel}
            onOwnJump={jumpRec}
            onOwnBack={onOwnBack}
            onOwnOrder={onOwnOrder}
          />
          <TickAmountCard session={session} cursorRec={cursor.rec} listingShares={listingShares} />
          <TickTeamPanel session={session} cursorRec={cursor.rec} accum={accum} isToday={isToday} />
        </>
      )}
    </div>
  );
}

/** HTS 칸 — 37-13(전문 · 버스트) · 37-14(팀)가 원소를 더한다. */
const HTS_PANES: readonly HtsPane[] = [
  {
    id: 'book',
    label: '호가',
    // 360 = 바깥 「증감」 열 두 개(2026-11-04 · 목업 B) 몫으로 300 에서 넓혔다.
    desktop: 'min-[641px]:w-[360px] min-[641px]:flex-none',
    render: ({ session, cursor, unit, setUnit }) => (
      <TickBook session={session} rec={cursor.rec} unit={unit} onUnit={setUnit} className="h-full" />
    ),
  },
  {
    // 전문 목록 — 남는 폭을 먼저 가져간다(flex-grow 999). 높이는 고정(창 가상화 · 호가 10단과 같은 줄 높이).
    id: 'msg',
    label: '전문',
    desktop: 'min-[641px]:flex-[999_1_480px]',
    render: ({ session, cursor, badge, own, ownSel, onOwnSelect, rows }) => (
      <div className="relative">
        <TickMsgList
          session={session}
          cursorRec={cursor.rec}
          onSelect={cursor.jumpToRec}
          mode={cursor.mode}
          onMode={cursor.setMode}
          own={own}
          ownSel={ownSel}
          onOwnSelect={onOwnSelect}
          rows={rows}
          className="h-[640px] max-[640px]:h-[min(640px,calc(100dvh-240px))] max-[640px]:min-h-[360px]"
        />
        {badge}
      </div>
    ),
  },
  {
    // 오른쪽 열 — 이 주문 · 거래대금 · 팀 거래정보(37-14). 한 줄이면 330 폭에 세로로 · 아래 줄로 내려가면 두 열.
    id: 'side',
    label: '버스트 · 팀',
    desktop: 'min-[641px]:flex-[1_1_330px] min-[641px]:max-h-[640px] min-[641px]:overflow-auto',
    render: (c) => <TickSidePane {...c} />,
  },
];

export function TickViewer({
  session,
  urlState,
  initialT,
  initialK = null,
  onTick,
  accum = null,
  isToday = false,
  listingShares = null,
  live,
  onOwn,
  ownRefreshKey = 0,
  stockCode = null,
}: TickViewerProps) {
  const cursor = useTickCursor(session, { initialT, initialK, urlState, live: live !== undefined });
  const { rec, atEnd } = cursor;
  // 호가 잔량 단위 — 기본 금액(2026-11-03 사용자 요청) · 「주 | 금액」 토글은 그대로
  const [unit, setUnit] = useState<TickBookUnit>('amount');
  const [pane, setPane] = useState<string>(HTS_PANES[0]!.id);
  // 차트 종류(Phase 42 D-02 · D-05) — 브라우저 기억(`gh-radar:tick-chart-kind`) · 기억 없음 · 서버 렌더 = 선 차트
  const [chartKind, setChartKind] = useChartKind();
  // 마지막 보기 창(D-24 · UI-SPEC S1) — 렌더 없는 ref(휠마다 뷰어가 다시 그려지지 않게) · 저장소에 남기지 않는다.
  // 종목 · 날짜 · 거래소가 바뀌면 뷰어가 key 로 다시 마운트돼 처음 창으로 돌아간다.
  const lastViewRef = useRef<ChartViewSnap | null>(null);
  const onViewChange = useCallback((v: ChartViewSnap) => {
    lastViewRef.current = v;
  }, []);
  // 전환 순간의 창 — 새로 마운트되는 차트의 처음 창(ref 는 이벤트 처리기에서만 읽는다)
  const [switchView, setSwitchView] = useState<ChartViewSnap | null>(null);
  // 전환 직전 초점이 스위치에 있었으면(키보드 · 스크린리더) 새 차트의 켜진 스위치 버튼으로 초점을 돌려준다 — 두 차트는 함께
  // 마운트하지 않아(D-04) 누른 버튼이 사라지면 초점이 <body> 로 떨어진다. 터치 · Safari 마우스처럼 초점이 없던 누름은 그대로.
  const bodyRef = useRef<HTMLDivElement>(null);
  const refocusKindRef = useRef(false);
  const onKindChange = useCallback(
    (k: ChartKind) => {
      if (k === chartKind) return;
      const active = typeof document === 'undefined' ? null : document.activeElement;
      refocusKindRef.current = active?.closest?.('[data-slot="chart-kind-switch"]') != null;
      setSwitchView(lastViewRef.current);
      setChartKind(k);
    },
    [chartKind, setChartKind],
  );
  useEffect(() => {
    if (!refocusKindRef.current) return;
    // 새 차트의 첫 폭 측정 재렌더(폰 제목 줄 배치)가 끝난 뒤 — 다음 프레임에 켜진 버튼을 찾는다
    const id = requestAnimationFrame(() => {
      refocusKindRef.current = false;
      bodyRef.current
        ?.querySelector<HTMLButtonElement>('[data-slot="chart-kind-switch"] button[aria-pressed="true"]')
        ?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [chartKind]);
  const own = useTickOwn(urlState, ownRefreshKey);
  const isLive = live !== undefined;
  const liveAsOfMs = live?.asOfMs ?? null;
  const liveServerAsOfMs = live?.serverAsOfMs ?? null;
  const ownModel = useMemo(
    () =>
      own.own
        ? buildOwnModel(session, own.own, { live: isLive, asOfMs: liveAsOfMs, serverAsOfMs: liveServerAsOfMs })
        : null,
    [session, own.own, isLive, liveAsOfMs, liveServerAsOfMs],
  );
  // 우리 줄 선택 — 줄 클릭 때 (줄, 기준 rec) 을 기억하고, 커서가 그 rec 일 때만 선택으로 본다(파생 · 효과 없음).
  // 줄은 안정 키(주문 gateway|order_no · 체결 gateway|journal_epoch|seq · 없으면 gateway|order_no|gw 시각|seq)로 기억하고 렌더 때 지금 모델 id 로 푼다 — 「최신 받기」 로
  // own 이 바뀌어 id 가 밀려도 다른 주문을 가리키지 않는다(되돌아가기 알약 `ownBack` 과 같은 까닭 · WR-04).
  const [ownPick, setOwnPick] = useState<{ sel: OwnSelKey; rec: number } | null>(null);

  // 전문 목록 항목 — 한 번 만들어 목록과 주문 줄 찾기(카드 · 알약)가 같이 쓴다(38-06).
  const rows = useMemo(() => buildMsgRows(session, cursor.mode, ownModel), [session, cursor.mode, ownModel]);

  // 기준 rec 도 지금 항목으로 다시 구한다 — 다시 받아 그 줄 자리가 옮겨졌으면(예: 보조 주문 행만 있던 주문에 이벤트가 붙음)
  // 커서는 옛 기준 rec 인데 목록 강조 · `[` `]` 현재 자리는 새 자리를 가리키므로 선택을 푼다(R2 IN-03).
  const ownSel = useMemo(() => {
    if (ownPick === null || ownPick.rec !== rec || ownModel === null) return null;
    const sel = resolveOwnSel(ownModel, ownPick.sel);
    if (sel === null) return null;
    const pos = (sel.kind === 'order' ? rows.ownPosOfOrder[sel.id] : rows.ownPosOfFill[sel.id]) ?? -1;
    return pos >= 0 && ownLineRec(rows, pos) === rec ? sel : null;
  }, [ownPick, rec, ownModel, rows]);
  const jumpToRec = cursor.jumpToRec;
  const onOwnSelect = useCallback(
    (sel: OwnSel, at: number) => {
      const k = ownModel !== null ? ownSelKeyOf(ownModel, sel) : null;
      setOwnPick(k !== null ? { sel: k, rec: at } : null);
      jumpToRec(at);
    },
    [ownModel, jumpToRec],
  );

  // 전문 행으로 갈 때는 고른 줄을 푼다 — 짝 없음 줄의 기준 전문이 바로 그 행이면 줄 선택이 남아 A3 행 대신 줄이 보인다
  // (`[` `]` · 카드 「보기 ›」 · 「우리 주문」 표 · 첫 짝 체결 폴백이 같이 쓴다 — R1 IN-02).
  const navJump = useCallback(
    (r: number) => {
      setOwnPick(null);
      jumpToRec(r);
    },
    [jumpToRec],
  );

  // 그 주문 줄 선택 — 주문 줄 → 없으면 첫 짝 체결 A3 → 없으면 첫 짝 없음 줄.
  const onOwnOrder = useCallback(
    (id: number) => {
      const o = ownModel?.orders[id];
      if (!ownModel || !o) return;
      const pos = rows.ownPosOfOrder[id] ?? -1;
      const at = pos >= 0 ? ownLineRec(rows, pos) : -1;
      if (at >= 0) {
        onOwnSelect({ kind: 'order', id }, at);
        return;
      }
      for (const fid of o.fills) {
        const f = ownModel.fills[fid]!;
        if (f.rec >= 0) {
          navJump(f.rec);
          return;
        }
      }
      for (const fid of o.fills) {
        const p = rows.ownPosOfFill[fid] ?? -1;
        const r = p >= 0 ? ownLineRec(rows, p) : -1;
        if (r >= 0) {
          onOwnSelect({ kind: 'fill', id: fid }, r);
          return;
        }
      }
    },
    [ownModel, rows, onOwnSelect, navJump],
  );

  // 되돌아가기 알약(D-10) — 주문 묶기 키로 기억(증분으로 주문 id 가 밀려도 같은 주문) · 종목 · 날짜 · 거래소가 바뀌면 파생으로 사라진다.
  const ownScope = `${urlState.isin ?? ''}|${urlState.d ?? ''}|${urlState.ex}`;
  const [ownBack, setOwnBack] = useState<{ key: string; scope: string } | null>(null);
  const ownBackOrder =
    ownBack !== null && ownBack.scope === ownScope && ownModel !== null
      ? (ownModel.orders.find((o) => o.key === ownBack.key) ?? null)
      : null;
  const onOwnBack = useCallback(
    (id: number) => {
      const o = ownModel?.orders[id];
      if (o) setOwnBack({ key: o.key, scope: ownScope });
    },
    [ownModel, ownScope],
  );
  const onOwnBackGo = useCallback(() => {
    if (ownBackOrder !== null) onOwnOrder(ownBackOrder.id);
    setOwnBack(null);
  }, [ownBackOrder, onOwnOrder]);

  // 차트 우리 점(38-07 · D-08 · D-10) — ◆ = 그 A3 행 · ○ = 근거 행 + 되돌아가기 알약 · ◇ = 그 짝 없음 줄 선택.
  const onChartOwnJump = useCallback(
    (at: number, back?: number) => {
      if (back !== undefined) onOwnBack(back);
      jumpToRec(at);
    },
    [onOwnBack, jumpToRec],
  );
  const onChartOwnFillLine = useCallback(
    (fid: number) => {
      const p = rows.ownPosOfFill[fid] ?? -1;
      const at = p >= 0 ? ownLineRec(rows, p) : -1;
      if (at >= 0) onOwnSelect({ kind: 'fill', id: fid }, at);
    },
    [rows, onOwnSelect],
  );

  // 우리 체결 탐색(38-08 · D-09) — 제목 줄 알약 · 키 [ ]. 상태는 원시값이 바뀔 때만 새 객체라 올려도 갱신이 돌지 않는다.
  // A3 대상으로 갈 때는 고른 줄을 푼다(navJump) — 짝 없음 줄의 기준 전문이 바로 다음 대상 행이면 현재 자리가 줄에 묶인다.
  const ownNav = useOwnNav({ rows, own: ownModel, cursorRec: rec, ownSel, jumpToRec: navJump, pickLine: onOwnSelect });
  useEffect(() => {
    if (!onOwn) return;
    onOwn(ownNav);
    return () => onOwn(null);
  }, [onOwn, ownNav]);

  const time = rec >= 0 ? fmtTickTime(session.index.recvNs[rec]!) : '';
  const seq = rec >= 0 && session.index.seq[rec]! >= 0 ? session.index.seq[rec]! : null;

  useEffect(() => {
    onTick?.({ time, seq });
  }, [onTick, time, seq]);

  const onAtEnd = live?.onAtEnd;
  useEffect(() => {
    onAtEnd?.(atEnd);
  }, [onAtEnd, atEnd]);

  const onGoEnd = live?.onGoEnd;
  const cursorGoEnd = cursor.goEnd;
  const goEnd = useCallback(() => {
    cursorGoEnd();
    onGoEnd?.();
  }, [cursorGoEnd, onGoEnd]);

  // 과거 틱을 보는 동안 「최신 받기」로 붙은 레코드가 있으면 배지(누르면 끝 틱으로 · 요청 없음)
  const badge =
    live !== undefined && !atEnd && live.newCount > 0 ? (
      <button
        type="button"
        data-slot="tick-live-badge"
        onClick={goEnd}
        className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[var(--up)] px-3 py-1 text-[11.5px] font-semibold whitespace-nowrap text-white shadow-md"
      >
        {`새 틱 ${fmtQty(live.newCount)}건 · 끝으로`}
      </button>
    ) : null;

  const ctx: PaneCtx = {
    session,
    cursor,
    unit,
    setUnit,
    accum,
    isToday,
    listingShares,
    badge,
    own: ownModel,
    ownStale: own.status === 'error' && own.own !== null,
    ownSel,
    onOwnSelect,
    jumpRec: navJump,
    rows,
    onOwnOrder,
    onOwnBack,
    ownBackOrder,
    onOwnBackGo,
  };

  const onChartSeekMs = (ms: number) => cursor.seekNs(BigInt(Math.round(ms)) * 1_000_000n);
  const kindAddon = (phone: boolean) => <ChartKindSwitch value={chartKind} onChange={onKindChange} phone={phone} />;

  return (
    <div ref={bodyRef} data-slot="tick-viewer-body" className="flex flex-col gap-3">
      {/* 두 차트는 조건부로 번갈아 그린다 — 함께 마운트해 하나를 숨기지 않는다(D-04 · 숨은 쪽 폭 측정 · 제스처 이중) */}
      {chartKind === 'candle' ? (
        <CandleChart
          session={session}
          accum={accum}
          isToday={isToday}
          listingShares={listingShares}
          cursorRec={rec}
          onSeekMs={onChartSeekMs}
          onJumpRec={cursor.jumpToRec}
          own={ownModel}
          onOwnJump={onChartOwnJump}
          onOwnFillLine={onChartOwnFillLine}
          titleAddon={kindAddon}
          stockCode={stockCode}
          initialView={switchView ?? undefined}
          onViewChange={onViewChange}
        />
      ) : (
        <TickChart
          session={session}
          accum={accum}
          isToday={isToday}
          listingShares={listingShares}
          cursorRec={rec}
          onSeekMs={onChartSeekMs}
          onJumpRec={cursor.jumpToRec}
          own={ownModel}
          onOwnJump={onChartOwnJump}
          onOwnFillLine={onChartOwnFillLine}
          titleAddon={kindAddon}
          initialView={switchView ?? undefined}
          onViewChange={onViewChange}
        />
      )}

      <TickSlider
        session={session}
        rec={rec}
        onSeekNs={cursor.seekNs}
        onStep={cursor.step}
        playing={cursor.playing}
        onPlay={cursor.togglePlay}
        speed={cursor.speed}
        onSpeed={cursor.setSpeed}
        onJump={cursor.jumpTo}
        showEnd={live !== undefined}
        onEnd={goEnd}
      />

      <div role="group" aria-label="보기" className="min-[641px]:hidden">
        <div className="flex w-full rounded-full bg-[var(--muted)] p-0.5">
          {HTS_PANES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === pane}
              onClick={() => setPane(p.id)}
              className={cn(
                'flex-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold',
                p.id === pane ? 'bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)]' : 'text-[var(--fg-2)]',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div data-slot="tick-hts" className="flex min-w-0 flex-wrap gap-2.5 max-[640px]:flex-col max-[640px]:flex-nowrap">
        {HTS_PANES.map((p) => (
          <div
            key={p.id}
            data-slot="tick-pane"
            data-pane={p.id}
            className={cn('min-w-0', p.desktop, p.id !== pane && 'max-[640px]:hidden')}
          >
            {p.render(ctx)}
          </div>
        ))}
      </div>
    </div>
  );
}
