'use client';

/**
 * BreakoutStrip — `/trading` 작업대의 **돌파감지 스트립 + 「더보기」 7열 표** (UI-SPEC §레이아웃
 * 계약 6·7 · E4, TRADE-06 · D-07 / D-14 ~ D-18). 정본은 채택 목업 `18-workbench-mockup.html` 의
 * `.rc-strip` · `.rc-tw`(마크업 `:745-746` · 렌더 `:859-884` · CSS `:282-300`, `:330-358`).
 * `vi-trigger-strip.tsx` 와 **같은 문법**이다 — 한 테두리 패널(목업 `260923-bjb-mockup.html` `.panel`)
 * 안에 스트립 줄(라벨 「돌파」 · 칩 · 「더보기/접기」) → 펼친 표. 토글은 스트립 줄 버튼 하나이고,
 * 펼친 영역에 머리줄이 없다. 행이 없으면 펼친 영역을 그리지 않는다(스트립 줄의 빈 문구가 말한다).
 * 개수는 칩이 말한다 — 라벨·상태줄에 숫자를 두 번 적지 않는다.
 *
 * ① ★ 서버 집합을 재해석하지 않는다 (D-14)
 *   76 upsert · 78 전량 교체 · 정렬 · 상한 200 은 relay 리듀서가 이미 했다. 이 파일에는 정렬도
 *   역순도 상한 재적용도 없다 — 받은 배열 순서 그대로 그린다. 하는 일은 `breakout-list.ts`(18-04)
 *   가 **클라 몫**으로 규정한 셋뿐이다: 하루 1회 알림 · 임계−2%p 이탈 삭제 · 사용자가 지운 종목.
 *   카드를 자동으로 열지 않는다 — 카드 추가는 언제나 사용자의 클릭에서만 나온다(T-18-36).
 *
 * ② ★ 거래소를 표시하지 않는다 (D-07)
 *   gh-trade 돌파감지 창도 거래소 열을 두지 않는다(quick-260923-cfo 최소 변경) — 칩·행에 거래소
 *   태그가 없다. 시세 구독 거래소는 행의 `exchange`(발화 거래소 — NXT 일 수 있다)를 그대로 훅에
 *   넘긴다(quick-260926-rcc). 이 파일 코드에는 거래소 리터럴이 없다.
 *   카드는 행 거래소로 연다 — 표시는 안 한다(`onAddCard`/`onFocusCard` 에 `row.exchange` · quick-260926-s5v).
 *
 * ③ ★ 이탈 삭제는 `shouldRemoveBreakout` 한 함수로만 판정한다 (D-16)
 *   현재가를 모르는 행(구독 실패·`MAX_BREAKOUT_SUBS` 초과)은 판정하지 않는다 — 76 의 마지막
 *   가격·등락률을 그대로 보이고 지우지 않는다(T-18-37). 한 번 지운 행은 같은 종목의 **새 above
 *   구간**(돌파시각·발화 거래소가 바뀐 원소 — 76 재돌파 또는 새 구간의 78 원소 · `sameCrossInterval`)이
 *   올 때까지 지운 채로 둔다 — 시세가 임계 근처에서 흔들릴 때 행이 나타났다 사라지는 깜빡임을 막는다.
 *   새 구간이 오면 새 행으로 다시 오른다 — 첫 등재·강조·무장/유예·첫 돌파시각을 새로 시작하고,
 *   「오늘 울린 종목」은 그대로라 소리는 없다. 같은 구간의 재전송(재접속 78 캐시 원소)은 되살리지
 *   않는다 (gh-trade `RateCrossWatchList.cs:652·741-764` · 재돌파 무음 :672 · quick-260926-s5v).
 *   지운 동안은 그 피드 구독도 푼다(gh-trade `ReleaseRow` :1052-1061).
 *
 * ④ ★ 알림음 — 기록이 먼저, 재생이 나중 (D-17)
 *   새 행이 「오늘 울린 종목」에 없으면 `addSounded` 를 **먼저** 부르고 그 다음 `playBreakoutTone`.
 *   재생을 먼저 하면 재생 실패 시 기록이 남지 않아 하루 종일 중복 알림이 난다. 78 스냅샷으로 들어온
 *   행(`silent`)은 무음·무강조이면서 집합에는 기록된다. 76 과 78 은 `snapSeq`(= 리듀서가 78 을
 *   적용한 횟수)가 바뀌었는가로 가른다 — 배열만으로는 둘을 구분할 수 없다.
 *
 * ⑤ ★ 강조 타이머는 목록 전체에 1개 (D-18 · T-18-40)
 *   30초 `--new-bg` + 「신규」 배지는 1초 tick 타이머 **하나**가 `isHighlighted` 를 다시 판정해
 *   끝낸다. 강조 행이 하나도 없으면 타이머를 멈춘다. 행마다 `setTimeout` 을 걸지 않는다(최대 200행).
 *   깜박임이 없다 — 강조는 켜져 있다가 한 번 꺼질 뿐이다.
 *
 * ⑥ 이름이 없는 행 (D-30 · T-18-38)
 *   relay 가 `name`/`code` 를 못 채운 행은 ISIN 을 **ISIN 모양 그대로**(고정폭 · 코드 자리 없음)
 *   보인다 — 이름 자리에 ISIN 을 넣어 「이름이 있다」고 위장하지 않는다. `onAddCard` 에도 이름·코드를
 *   싣지 않으므로 그 카드의 종목정보 팝업은 비활성이다.
 *
 * ⑦ 78 스냅샷 전에도 빈 상태를 그린다 — 목록은 relay push 전용이라 로드 경로가 없고, 따라서
 *   스피너·스켈레톤도 없다. relay 끊김은 상태줄 DMA 필이 말한다.
 *
 * ⑧ 가격 5Hz · 렌더 중 상태 갱신 없음 (quick-260923-elb 2a)
 *   칩·표의 현재가·등락률과 이탈 판정은 `useBreakoutQuotes` 의 `prices`(≤5Hz 스로틀)만 읽고,
 *   가격은 행 피드(ISIN, 발화 거래소) 기준이다 — 다른 거래소 값이 섞이지 않는다.
 *   클라 기록(첫 등재 · 무장 · 첫 돌파시각 · 이탈 삭제)은 `advanceTracked` 순수 함수가 「마지막으로
 *   커밋된 기록 + 현재 입력」으로 **렌더 안에서** 계산하고, 커밋 뒤 레이아웃 effect 가 기록 ref 를
 *   옮긴다 — 렌더 중 setState 가 없다. 칩·표는 `memo` 라서 가격이 멈춘 커밋에서는 재조정을 건너뛴다.
 */

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RelayExchange, RelayRateCrossItem } from '@gh-radar/shared';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { playBreakoutTone } from '@/lib/alert-tone';
import {
  addDismissed,
  addSounded,
  breakoutKey,
  breakoutRowsFrom,
  isHighlighted,
  newBreakoutsToAnnounce,
  readDismissedSet,
  readSoundedSet,
  sameCrossInterval,
  shouldRemoveBreakout,
  trackBreakoutMeta,
  type BreakoutMeta,
  type BreakoutRow,
} from '@/lib/breakout-list';
import { readPanelsPref, writePanelsPref } from '@/lib/trading-layout';
import { breakoutFeedKey, useBreakoutQuotes } from '@/lib/use-breakout-quotes';
import { cn } from '@/lib/utils';

const NUM = new Intl.NumberFormat('ko-KR');

/** 빈 상태 — UI-SPEC §돌파감지 스트립·표 원문. */
export const BREAKOUT_EMPTY_TEXT = '아직 임계 20% 를 넘은 종목이 없어요';

/** 수동 삭제 ✕ `aria-label` — UI-SPEC 원문. 이름이 없으면 ISIN 이 그 자리에 들어간다(⑥). */
export function breakoutDismissLabel(label: string): string {
  return `${label} 돌파 목록에서 지우기 (이 기기만 · 오늘)`;
}

/** 강조 만료 판정 tick(ms) — 목록 전체에 1개(⑤). */
export const BREAKOUT_TICK_MS = 1_000;

export interface BreakoutStripProps {
  /** `rateCrossItems` — relay 리듀서 결과. **받은 순서 그대로** 그린다(①). */
  items: readonly RelayRateCrossItem[];
  /** `rateCrossSnapSeq` — 78 을 적용한 횟수. 바뀐 렌더의 새 종목은 무음·무강조다(④). */
  snapSeq: number;
  /** 카드가 있는 종목(ISIN). 그 행은 「거래중」 표식이다. */
  cards: ReadonlySet<string>;
  /**
   * 카드가 스스로 구독한 피드 키(`breakoutFeedKey` — ISIN 과 거래소). 돌파 훅 구독 예산에서만 뺀다.
   * 「거래중」 표식·카드 포커스는 `cards`(ISIN) 그대로다 (quick-260926-rcc).
   */
  cardFeeds: ReadonlySet<string>;
  /**
   * 카드가 없는 종목을 눌렀다 — 작업대가 **행의 발화 거래소**로 카드를 만든다(스위치 전부 OFF).
   * gh-trade `OpenLimitChaserForm(code, null, row.CrossExchange)` 와 같다 (quick-260926-s5v).
   */
  onAddCard: (
    isin: string,
    name: string | undefined,
    code: string | undefined,
    exchange: RelayExchange,
  ) => void;
  /**
   * 카드가 이미 있는 종목을 눌렀다 — 작업대가 그 카드를 펼치고 **발화 거래소로 맞춘다**(스크롤 포함).
   * gh-trade 재사용 창 `SelectExchange` 와 같다 (quick-260926-s5v).
   */
  onFocusCard: (isin: string, exchange: RelayExchange) => void;
  /** 행 ✕ 로 지웠다. 「지운 종목」 기록은 이 컴포넌트가 이미 했다 — 알림용 콜백이다. */
  onDismiss?: (isin: string) => void;
  /**
   * 목록에 **새로 오른 비무음 행**(76 새 종목 · 이탈 뒤 새 구간 재돌파) — 커밋 뒤 한 번씩. 첫 채움 · 78 ·
   * 자리유지 재알림 · 발화 거래소 전환 · ✕ 지운 종목은 해당 없음. gh-trade `RowAdded`
   * (`RateCrossWatchList.cs:662` → `RateCrossListForm.cs:406-422`)와 같은 축이다(작업대가 토스트로 낸다).
   */
  onRowsAdded?: (rows: readonly RelayRateCrossItem[]) => void;
  className?: string;
}

/** 렌더 사이에 붙들고 있는 클라 기록. relay 항목에는 없는 값이다. */
interface Tracked {
  items: readonly RelayRateCrossItem[] | null;
  seq: number;
  now: number;
  meta: ReadonlyMap<string, BreakoutMeta>;
  /** 첫 등재 체결시각 — 76 이 다시 와도 돌파시각은 첫 값을 유지한다. */
  firstTime: ReadonlyMap<string, string>;
  /**
   * 이탈로 지운 키 → 그 구간의 최신 항목. 같은 구간(`sameCrossInterval`)이면 계속 지운 채이고,
   * 새 구간 원소가 오면 새 행으로 되살린다(③ · quick-260926-s5v).
   */
  removed: ReadonlyMap<string, RelayRateCrossItem>;
}

/**
 * 클라 기록 한 걸음 — **마지막으로 커밋된 기록 + 현재 입력**의 순수 함수 (⑧ · quick-260923-elb 2a).
 *
 * 첫 채움·78 은 무음(④), 첫 등재 체결시각 유지, 이탈 삭제는 `shouldRemoveBreakout` 한 함수로만(③).
 * 지운 행은 같은 구간이면 지운 채로 두고, **새 구간** 원소가 오면 옛 기록(meta · firstTime)을 버리고
 * 새로 등재한다 — gh-trade `RemoveRow` → 새 76 `AddNewRow`(`RateCrossWatchList.cs:741-764`)와 같다.
 * 새 기록이라 `addedAt`·`feedSince` 가 지금, `armed` false(유예 재시작), `silent` 는 이 스텝 판정
 * (76 → 강조 · 78 → 무음·무강조)이다 (quick-260926-s5v).
 */
function advanceTracked(
  prev: Tracked,
  input: {
    items: readonly RelayRateCrossItem[];
    snapSeq: number;
    now: number;
    priceOf: (item: Pick<RelayRateCrossItem, 'isin' | 'exchange'>) => number | undefined;
    wallNow: number;
  },
): Tracked {
  const { items, snapSeq, now, priceOf, wallNow } = input;
  // 첫 채움(마운트 시 이미 있던 목록)과 78 스냅샷은 무음·무강조다(④).
  const silent = prev.items === null || prev.seq !== snapSeq;

  // 되살릴 키 — 지운 행에 새 above 구간 원소가 왔다(③). 옛 기록을 버려 새로 등재되게 한다.
  const revived = new Set<string>();
  for (const it of items) {
    const key = breakoutKey(it);
    const gone = prev.removed.get(key);
    if (gone !== undefined && !sameCrossInterval(gone, it)) revived.add(key);
  }
  let baseMeta = prev.meta;
  if (revived.size > 0) {
    const pruned = new Map(prev.meta);
    for (const key of revived) pruned.delete(key);
    baseMeta = pruned;
  }
  const meta = trackBreakoutMeta(baseMeta, items, { now: wallNow, silent, priceOf });

  const firstTime = new Map<string, string>();
  const removed = new Map<string, RelayRateCrossItem>();
  for (const it of items) {
    const key = breakoutKey(it);
    firstTime.set(
      key,
      revived.has(key) ? it.exchangeTime : (prev.firstTime.get(key) ?? it.exchangeTime),
    );
    // 같은 구간이면 계속 지운 채 — 최신 객체를 저장한다. 되살린 키는 새 기록의 유예 덕분에 이 스텝에
    // 다시 지워지지 않는다.
    if (prev.removed.has(key) && !revived.has(key)) {
      removed.set(key, it);
      continue;
    }
    const m = meta.get(key);
    if (m !== undefined && shouldRemoveBreakout({ ...it, ...m }, priceOf(it), wallNow)) {
      removed.set(key, it);
    }
  }
  return { items, seq: snapSeq, now, meta, firstTime, removed };
}

export function BreakoutStrip({
  items,
  snapSeq,
  cards,
  cardFeeds,
  onAddCard,
  onFocusCard,
  onDismiss,
  onRowsAdded,
  className,
}: BreakoutStripProps) {
  const [open, setOpen] = useState(false);
  // 펼침은 기억한다(quick-260923-lyt) — 마운트 후에 읽는다(하이드레이션).
  useEffect(() => {
    const saved = readPanelsPref().breakout;
    if (saved !== undefined) setOpen(saved);
  }, []);
  const tableId = useId();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => readDismissedSet());
  /** 강조 판정 기준 시각 — tick 타이머 1개가 올린다(⑤). */
  const [now, setNow] = useState(() => Date.now());

  /*
    ★ 마지막으로 **커밋된** 클라 기록 (⑧). 초기값은 옛 useState 초기값과 같다.
    ★ 렌더 중 상태 갱신을 쓰지 않는 이유: 가격 서명이 바뀔 때마다 본문을 두 번 돌렸다(실측
      BreakoutStrip 279 렌더/s = 커밋 × 2 — debug `trading-cpu-260923`).
    ★ 일반 effect 로 미루지 않는 이유: 그러면 새 76 행이 한 프레임 무음·무강조로 그려졌다가 바뀐다
      (원래 작성자가 렌더 단계 패턴을 쓴 이유). 그래서 한 걸음은 렌더 안에서 계산하고(`useMemo`),
      커밋 뒤 레이아웃 effect 가 기록만 옮긴다.
    ★ 렌더 중 ref 읽기가 안전한 근거: 한 걸음은 「마지막 커밋 기록 + 현재 입력」의 순수 함수이고,
      버려진 렌더(동시성·StrictMode 이중 호출)는 ref 를 쓰지 않는다 — 커밋된 렌더만 기록을 옮긴다.
  */
  const [initialTracked] = useState<Tracked>(() => ({
    items: null,
    seq: snapSeq,
    now,
    meta: new Map(),
    firstTime: new Map(),
    removed: new Map(),
  }));
  const committedRef = useRef<Tracked>(initialTracked);
  /*
    커밋된 이탈 삭제 집합 — 구독 후보 거르기 전용 상태다. 기록 ref 만 읽으면 삭제를 커밋한 뒤 다음
    렌더가 올 때까지(강조 tick · 가격 · 입력) 구독이 풀리지 않는다. 그래서 커밋 뒤 레이아웃 effect 가
    키 집합이 바뀐 때만 이 상태를 올려 한 번 더 그린다(같으면 부르지 않는다 — 추가 렌더 없음).
  */
  const [committedRemoved, setCommittedRemoved] = useState<ReadonlyMap<string, RelayRateCrossItem>>(
    initialTracked.removed,
  );

  /*
    구독 후보 = 화면에 보이는 행 — ✕ 로 지운 종목과 이탈로 지운 행은 구독을 푼다(gh-trade `ReleaseRow`
    `RateCrossWatchList.cs:1052-1061`). 다시 걸면 relay 가 스냅샷(28)을 먼저 보내고
    (`relay/src/hub/subscription-hub.ts:1583-1620`) 되살린 행은 3초 유예가 새로 흐르므로 전역 시세 맵의
    낡은 값으로 곧바로 지워지지 않는다. 카드 종목은 카드가 구독한다(최근 돌파 우선은 훅이 정한다).
    아직 기록 없는 키와 되살린 키는 「가장 최근」(MAX_SAFE_INTEGER) — 추적 단계가 처음 보는 키에 현재
    벽시계를 찍으므로 옛 수렴 상태와 같은 구독 순위다. 동률은 `pickWithinBudget` 의 ISIN 순서가 가른다.
    되살린 행(지운 채인데 새 구간 원소)은 입력이 바뀐 이 렌더에서 바로 후보가 된다.
  */
  const committedMeta = committedRef.current.meta;
  const candidates = useMemo(() => {
    const out: { isin: string; exchange: RelayRateCrossItem['exchange']; addedAt: number }[] = [];
    for (const it of items) {
      if (dismissed.has(it.isin)) continue;
      const key = breakoutKey(it);
      const gone = committedRemoved.get(key);
      if (gone !== undefined && sameCrossInterval(gone, it)) continue; // 아직 지운 채
      out.push({
        isin: it.isin,
        exchange: it.exchange,
        addedAt:
          gone !== undefined
            ? Number.MAX_SAFE_INTEGER
            : (committedMeta.get(key)?.addedAt ?? Number.MAX_SAFE_INTEGER),
      });
    }
    return out;
  }, [items, committedMeta, dismissed, committedRemoved]);
  const { prices } = useBreakoutQuotes(candidates, { excludeFeeds: cardFeeds });
  // 행 피드 가격만 읽는다 — 다른 거래소 값이 표시·무장·이탈에 섞이지 않는다.
  const priceOf = useCallback(
    (it: Pick<RelayRateCrossItem, 'isin' | 'exchange'>) => prices.get(breakoutFeedKey(it)),
    [prices],
  );

  const tracked = useMemo(
    () =>
      advanceTracked(committedRef.current, { items, snapSeq, now, priceOf, wallNow: Date.now() }),
    [items, snapSeq, now, priceOf],
  );
  useLayoutEffect(() => {
    const prevRemoved = committedRef.current.removed;
    committedRef.current = tracked;
    // 키 집합이 바뀐 커밋에서만 올린다 — 가격 스텝(≤5Hz)마다 업데이트를 예약하지 않는다.
    if (!sameKeys(prevRemoved, tracked.removed)) setCommittedRemoved(tracked.removed);
  }, [tracked]);

  const rows = useMemo(
    () =>
      breakoutRowsFrom(items, {
        dismissed,
        cards,
        meta: tracked.meta,
        removed: new Set(tracked.removed.keys()),
      }),
    [items, dismissed, cards, tracked.meta, tracked.removed],
  );

  /* ── ④ 하루 1회 알림 — 기록 먼저, 재생 나중 ──────────────────────── */
  const soundedRef = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (soundedRef.current === null) soundedRef.current = readSoundedSet();
    const { record, sound } = newBreakoutsToAnnounce(rows, soundedRef.current);
    if (record.length === 0) return;
    soundedRef.current = addSounded(record); // ① 집합에 먼저 쓴다
    if (sound.length > 0) playBreakoutTone(); // ② 그 다음 재생(토글·차단은 모듈이 판정)
  }, [rows]);

  /*
    ── 새 행 신호 — gh-trade `RaiseRowAdded`(:662) → `OnRowAdded`(RateCrossListForm.cs:406-422) ──
    직전 커밋의 보이는 행 키에 없던 **비무음** 행만 모아 한 번 부른다. 첫 실행은 집합만 기록한다
    (마운트 첫 채움 · StrictMode 재실행 안전). 알림음(④)과 별개다 — 하루 1회는 「오늘 울린 종목」이 지킨다.
  */
  const onRowsAddedRef = useRef(onRowsAdded);
  onRowsAddedRef.current = onRowsAdded;
  const visibleKeysRef = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    const prevKeys = visibleKeysRef.current;
    visibleKeysRef.current = new Set(rows.map((r) => r.key));
    if (prevKeys === null) return;
    const added = rows.filter((r) => !r.silent && !prevKeys.has(r.key));
    if (added.length > 0) onRowsAddedRef.current?.(added);
  }, [rows]);

  /* ── ⑤ 목록 전체 1초 tick — 강조 행이 있을 때만 ──────────────────── */
  const ticking = rows.some((r) => isHighlighted(r, now));
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), BREAKOUT_TICK_MS);
    return () => window.clearInterval(id);
  }, [ticking]);

  const activate = useCallback(
    (row: BreakoutRow) => {
      // 행의 발화 거래소를 그대로 넘긴다 — 판정(NXT 미거래 무시 · 전환 규칙)은 작업대 몫이다.
      if (cards.has(row.isin)) {
        onFocusCard(row.isin, row.exchange);
        return;
      }
      onAddCard(row.isin, row.name, row.code, row.exchange);
    },
    [cards, onFocusCard, onAddCard],
  );

  const dismiss = useCallback(
    (row: BreakoutRow) => {
      setDismissed(addDismissed([row.isin]));
      onDismiss?.(row.isin);
    },
    [onDismiss],
  );

  const firstTime = tracked.firstTime;
  const views = useMemo(
    () =>
      rows.map((row) =>
        viewOf(row, {
          price: priceOf(row),
          at: firstTime.get(row.key) ?? row.exchangeTime,
          serverTime: row.serverTime,
          // 「거래중」 행은 신규로 칠하지 않는다 — 목업의 행 상태는 신규 | 거래중 | 기본 중 하나다.
          highlighted: isHighlighted(row, now) && !row.trading,
        }),
      ),
    [rows, priceOf, firstTime, now],
  );
  const showTable = open && views.length > 0;

  return (
    <div
      data-slot="breakout"
      className={cn(
        // 토스 B `.strip`(260924-vj1) — 무테 카드 면(테두리 색만 투명 · 1px 기하 유지).
        'min-w-0 overflow-hidden rounded-[var(--r-md)] border border-transparent bg-[var(--card)]',
        className,
      )}
    >
      {/* ── 스트립 줄 ── */}
      <section
        data-slot="breakout-strip"
        aria-label="돌파감지"
        className="flex min-w-0 items-center gap-2 px-2.5 py-2.5"
      >
        <div className="flex flex-none items-center gap-1.5 text-[12px] font-bold text-[var(--fg)]">
          <span data-testid="breakout-strip-label">돌파</span>
        </div>

        <div
          data-slot="breakout-chips"
          className="flex min-w-0 flex-1 flex-nowrap gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]"
        >
          {views.length === 0 ? (
            <span
              data-slot="breakout-empty"
              className="self-center text-[12px] whitespace-nowrap text-[var(--muted-fg)]"
            >
              {BREAKOUT_EMPTY_TEXT}
            </span>
          ) : (
            views.map((v) => <BreakoutChip key={v.row.key} view={v} onActivate={activate} />)
          )}
        </div>

        <button
          type="button"
          data-slot="breakout-more"
          aria-expanded={open}
          // 가리킬 표가 있을 때만 — 없는 id 를 가리키지 않는다(axe aria-valid-attr-value).
          aria-controls={showTable ? tableId : undefined}
          onClick={() => {
            const next = !open;
            setOpen(next);
            writePanelsPref({ breakout: next });
          }}
          className="h-[26px] flex-none rounded-[var(--r)] border border-transparent bg-[var(--muted)] px-2.5 text-[11px] font-semibold whitespace-nowrap text-[var(--fg)] hover:bg-[var(--raised-2)]"
        >
          {open ? '접기' : '더보기'}
        </button>
      </section>

      {/* ── 펼친 표 — 행이 있을 때만 ── */}
      {showTable && (
        <section
          id={tableId}
          data-slot="breakout-table"
          aria-label="돌파감지 목록"
          className="min-w-0 border-t border-[var(--border-subtle)]"
        >
          <BreakoutTable views={views} onActivate={activate} onDismiss={dismiss} />
        </section>
      )}
    </div>
  );
}

/** 두 맵의 키 집합이 같은가 — 커밋된 이탈 삭제 상태의 베일아웃 판정. */
function sameKeys(a: ReadonlyMap<string, unknown>, b: ReadonlyMap<string, unknown>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a.keys()) if (!b.has(k)) return false;
  return true;
}

/* ── 표시 파생 ───────────────────────────────────────────────────────── */

interface RowView {
  row: BreakoutRow;
  /** 이름이 있으면 이름, 없으면 ISIN(⑥). */
  label: string;
  /** relay 가 이름을 채웠는가. */
  named: boolean;
  /** 표시 현재가 — 구독 시세, 모르면 76 의 마지막 가격. */
  price: number;
  /** 표시 등락률(%) — 구독 시세로 계산, 모르면 76 의 등락률. */
  rate: number;
  /** 돌파시각 `HH:MM:SS` (첫 등재값). */
  clock: string;
  highlighted: boolean;
}

function viewOf(
  row: BreakoutRow,
  o: { price: number | undefined; at: string; serverTime: string; highlighted: boolean },
): RowView {
  const named = row.name !== undefined && row.name !== '';
  const price = o.price ?? row.lastPrice;
  const rate =
    o.price !== undefined && row.basePrice > 0
      ? ((o.price - row.basePrice) * 100) / row.basePrice
      : row.changeRate;
  return {
    row,
    label: named ? (row.name as string) : row.isin,
    named,
    price,
    rate,
    clock: clockOf(o.at, o.serverTime),
    highlighted: o.highlighted,
  };
}

/** 거래소 체결시각 12자 원문 `HHMMSSuuuuuu` → `HH:MM:SS`. 형식이 어긋나면 서버 시각을 쓴다. */
function clockOf(exchangeTime: string, serverTime: string): string {
  if (/^\d{6}/.test(exchangeTime)) {
    return `${exchangeTime.slice(0, 2)}:${exchangeTime.slice(2, 4)}:${exchangeTime.slice(4, 6)}`;
  }
  return serverTime;
}

function pct(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function signedRate(r: number): string {
  return `${r > 0 ? '+' : ''}${r.toFixed(2)}%`;
}

function rateClass(r: number): string {
  return r > 0 ? 'text-[var(--up)]' : r < 0 ? 'text-[var(--down)]' : 'text-[var(--flat)]';
}

/** 칩 `title` — UI-SPEC 원문 「{종목명} {코드} · 임계 {N}% · 기준가 {가격} · 돌파 {HH:MM:SS}」. */
function chipTitle(v: RowView): string {
  const head = v.named && v.row.code ? `${v.label} ${v.row.code}` : v.label;
  return `${head} · 임계 ${pct(v.row.thresholdPct)}% · 기준가 ${NUM.format(v.row.basePrice)} · 돌파 ${v.clock}`;
}

/* ── 칩 (목업 `.chip`) ───────────────────────────────────────────────── */

const BreakoutChip = memo(function BreakoutChip({
  view: v,
  onActivate,
}: {
  view: RowView;
  onActivate: (row: BreakoutRow) => void;
}) {
  const trading = v.row.trading;
  return (
    <button
      type="button"
      data-slot="breakout-chip"
      data-new={v.highlighted ? 'true' : undefined}
      data-trading={trading ? 'true' : undefined}
      title={chipTitle(v)}
      onClick={() => onActivate(v.row)}
      className={cn(
        'inline-flex h-[30px] max-w-[16rem] flex-none items-center gap-1.5 rounded-full border py-0 pr-2.5 pl-2 text-[12px] whitespace-nowrap',
        trading
          ? 'cursor-default border-dashed border-[var(--faint)] bg-transparent text-[var(--muted-fg)]'
          : v.highlighted
            ? 'border-[var(--new-bd)] bg-[var(--new-bg)]'
            : 'border-transparent bg-[var(--muted)]',
      )}
    >
      <b
        data-slot="breakout-chip-name"
        className={cn('max-w-[8rem] min-w-0 truncate font-semibold', !v.named && 'mono font-medium')}
      >
        {v.label}
      </b>
      <span className={cn('mono font-bold', rateClass(v.rate))}>{signedRate(v.rate)}</span>
      {/* 폰 밴드(본문 <700)에서는 시각을 빼 칩을 줄인다 — 펼친 표에 있다(2026-09-23). */}
      <span className="mono hidden text-[11px] text-[var(--muted-fg)] @min-[700px]/wb:inline">
        {v.clock.slice(0, 5)}
      </span>
      {v.highlighted && (
        <span data-slot="breakout-new-badge" className="text-[10px] font-bold text-[var(--fg)]">
          신규
        </span>
      )}
      {trading && (
        <span data-slot="breakout-chip-trading" className="text-[10px] text-[var(--muted-fg)]">
          거래중
        </span>
      )}
    </button>
  );
});

/* ── 표 (목업 `table.rc`) ────────────────────────────────────────────── */

/**
 * 7열 — 종목 · 현재가 · 등락률 · 임계 · 기준가 · 돌파시각 · 액션.
 * 작업대 페이지 컨테이너(`@container/wb`) 폭으로 접는다(목업 정본): 본문 <700 에서 임계·돌파시각을,
 * <830 에서 기준가를 숨기고, <700 에서 종목 셀 아래 보조 줄 「{HH:MM:SS}」를 세우고 코드를 숨긴다.
 * 경계 수치는 globals.css §2.2b 정본이다.
 */
const BreakoutTable = memo(function BreakoutTable({
  views,
  onActivate,
  onDismiss,
}: {
  views: readonly RowView[];
  onActivate: (row: BreakoutRow) => void;
  onDismiss: (row: BreakoutRow) => void;
}) {
  const colNarrow = 'hidden @min-[700px]/wb:table-cell';
  const colBase = 'hidden @min-[830px]/wb:table-cell';
  const th =
    'h-auto bg-transparent px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap text-[var(--muted-fg)] @min-[700px]/wb:px-2.5';
  const td = 'h-9 px-2 py-0 whitespace-nowrap @min-[700px]/wb:px-2.5';

  return (
    <Table data-slot="breakout-rows" className="text-[12px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col" className={th}>종목</TableHead>
          <TableHead scope="col" className={cn(th, 'text-right')}>현재가</TableHead>
          <TableHead scope="col" className={cn(th, 'text-right')}>등락률</TableHead>
          <TableHead scope="col" data-col="thr" className={cn(th, colNarrow, 'text-right')}>임계</TableHead>
          <TableHead scope="col" data-col="base" className={cn(th, colBase, 'text-right')}>기준가</TableHead>
          <TableHead scope="col" data-col="at" className={cn(th, colNarrow)}>돌파시각</TableHead>
          <TableHead scope="col" className={th}>
            <span className="sr-only">액션</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {views.map((v) => {
          const trading = v.row.trading;
          return (
              <TableRow
                key={v.row.key}
                data-slot="breakout-row"
                data-new={v.highlighted ? 'true' : undefined}
                data-trading={trading ? 'true' : undefined}
                onClick={() => onActivate(v.row)}
                className={cn(
                  trading ? 'cursor-default text-[var(--muted-fg)]' : 'cursor-pointer',
                  v.highlighted && 'bg-[var(--new-bg)] hover:bg-[var(--new-bg)]',
                )}
              >
                <TableCell className={cn(td, 'max-w-[200px]')}>
                  {/* 폰 밴드는 이름 폭을 7rem 으로 묶어 표가 좌우로 넘치지 않게 한다(말줄임 · 2026-09-23). */}
                  <span className="flex max-w-[7rem] min-w-0 items-baseline gap-1 @min-[700px]/wb:max-w-none">
                    <span
                      data-slot="breakout-row-name"
                      data-unnamed={v.named ? undefined : 'true'}
                      title={v.label}
                      className={cn(
                        'min-w-0 truncate font-semibold text-[var(--fg)]',
                        !v.named && 'mono font-medium',
                      )}
                    >
                      {v.label}
                    </span>
                    {v.named && v.row.code && (
                      <span data-slot="breakout-row-code" className="mono hidden flex-none text-[11px] text-[var(--muted-fg)] @min-[700px]/wb:inline">
                        {v.row.code}
                      </span>
                    )}
                    {v.highlighted && (
                      <span
                        data-slot="breakout-new-badge"
                        className="inline-flex h-4 flex-none items-center rounded-[4px] border border-[var(--new-bd)] px-[5px] text-[9px] font-bold text-[var(--fg)]"
                      >
                        신규
                      </span>
                    )}
                  </span>
                  {/* 폰 밴드 보조 줄 — 숨긴 돌파시각 열의 사실을 여기서 말한다. */}
                  <span
                    data-slot="breakout-row-subline"
                    className="mono block truncate text-[10px] text-[var(--muted-fg)] @min-[700px]/wb:hidden"
                  >
                    {v.clock}
                  </span>
                </TableCell>
                <TableCell className={cn(td, 'mono text-right', rateClass(v.rate))}>{NUM.format(v.price)}</TableCell>
                <TableCell className={cn(td, 'mono text-right font-bold', rateClass(v.rate))}>
                  {signedRate(v.rate)}
                </TableCell>
                <TableCell className={cn(td, colNarrow, 'mono text-right')}>{pct(v.row.thresholdPct)}%</TableCell>
                <TableCell className={cn(td, colBase, 'mono text-right')}>{NUM.format(v.row.basePrice)}</TableCell>
                <TableCell className={cn(td, colNarrow, 'mono')}>{v.clock}</TableCell>
                <TableCell className={cn(td, 'text-right')}>
                  <span className="inline-flex items-center justify-end gap-1">
                    {trading ? (
                      <span
                        data-slot="breakout-trading"
                        className="text-[11px] whitespace-nowrap text-[var(--muted-fg)] before:mr-1 before:text-[9px] before:text-[var(--led-armed)] before:content-['●']"
                      >
                        거래중
                      </span>
                    ) : (
                      <button
                        type="button"
                        data-slot="breakout-add"
                        onClick={(e) => {
                          e.stopPropagation();
                          onActivate(v.row);
                        }}
                        className={cn(
                          'h-[26px] rounded-[var(--r)] border px-2.5 text-[11px] font-semibold whitespace-nowrap',
                          v.highlighted
                            ? 'border-transparent bg-[var(--primary)] text-[var(--primary-fg)]'
                            : 'border-transparent bg-[var(--muted)] text-[var(--fg)]',
                        )}
                      >
                        추가
                      </button>
                    )}
                    <button
                      type="button"
                      data-slot="breakout-dismiss"
                      aria-label={breakoutDismissLabel(v.label)}
                      title="이 기기에서 오늘 하루 숨겨요"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDismiss(v.row);
                      }}
                      className="inline-flex size-[26px] items-center justify-center rounded-[var(--r)] text-[12px] text-[var(--muted-fg)] hover:bg-[var(--muted)] hover:text-[var(--fg)]"
                    >
                      ✕
                    </button>
                  </span>
                </TableCell>
              </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
});
