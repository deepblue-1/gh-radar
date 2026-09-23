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
 *   돌파 감지는 서버 정본상 KRX A3 에서만 발화한다 — 칩·행에 거래소 태그가 없다. 시세 구독
 *   거래소 상수도 `use-breakout-quotes.ts` 가 갖는다(이 파일에는 거래소 문자열이 없다).
 *
 * ③ ★ 이탈 삭제는 `shouldRemoveBreakout` 한 함수로만 판정한다 (D-16)
 *   현재가를 모르는 행(구독 실패·`MAX_BREAKOUT_SUBS` 초과)은 판정하지 않는다 — 76 의 마지막
 *   가격·등락률을 그대로 보이고 지우지 않는다(T-18-37). 한 번 지운 행은 서버가 그 종목에 대해
 *   **새 프레임**(76 재돌파·78 스냅샷 — 항목 객체가 바뀐다)을 보낼 때까지 지운 채로 둔다 —
 *   시세가 임계 근처에서 흔들릴 때 행이 나타났다 사라지는 깜빡임을 막는다.
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
 *   칩·표의 현재가·등락률과 이탈 판정은 `useBreakoutQuotes` 의 `prices`(≤5Hz 스로틀)만 읽는다.
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
import type { RelayRateCrossItem } from '@gh-radar/shared';

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
  shouldRemoveBreakout,
  trackBreakoutMeta,
  type BreakoutMeta,
  type BreakoutRow,
} from '@/lib/breakout-list';
import { readPanelsPref, writePanelsPref } from '@/lib/trading-layout';
import { useBreakoutQuotes } from '@/lib/use-breakout-quotes';
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
  /** 카드가 없는 종목을 눌렀다 — 작업대가 카드를 만든다(KRX · 스위치 전부 OFF). */
  onAddCard: (isin: string, name?: string, code?: string) => void;
  /** 카드가 이미 있는 종목을 눌렀다 — 작업대가 그 카드를 펼치고 스크롤한다. */
  onFocusCard: (isin: string) => void;
  /** 행 ✕ 로 지웠다. 「지운 종목」 기록은 이 컴포넌트가 이미 했다 — 알림용 콜백이다. */
  onDismiss?: (isin: string) => void;
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
  /** 이탈로 지운 키 → 지울 때의 항목 객체. 객체가 바뀌면(= 서버의 새 프레임) 되살린다(③). */
  removed: ReadonlyMap<string, RelayRateCrossItem>;
}

/**
 * 클라 기록 한 걸음 — **마지막으로 커밋된 기록 + 현재 입력**의 순수 함수 (⑧ · quick-260923-elb 2a).
 *
 * 본문은 옛 「렌더 중 상태 갱신」 블록 그대로다: 첫 채움·78 은 무음(④), 첫 등재 체결시각 유지,
 * 이탈 삭제는 `shouldRemoveBreakout` 한 함수로만(③), 지운 행은 서버의 새 프레임(항목 객체 교체)이
 * 올 때까지 지운 채로 둔다.
 */
function advanceTracked(
  prev: Tracked,
  input: {
    items: readonly RelayRateCrossItem[];
    snapSeq: number;
    now: number;
    priceOf: (isin: string) => number | undefined;
    wallNow: number;
  },
): Tracked {
  const { items, snapSeq, now, priceOf, wallNow } = input;
  // 첫 채움(마운트 시 이미 있던 목록)과 78 스냅샷은 무음·무강조다(④).
  const silent = prev.items === null || prev.seq !== snapSeq;
  const meta = trackBreakoutMeta(prev.meta, items, { now: wallNow, silent, priceOf });

  const firstTime = new Map<string, string>();
  const removed = new Map<string, RelayRateCrossItem>();
  for (const it of items) {
    const key = breakoutKey(it);
    firstTime.set(key, prev.firstTime.get(key) ?? it.exchangeTime);
    const gone = prev.removed.get(key);
    if (gone === it) {
      removed.set(key, it);
      continue;
    }
    const m = meta.get(key);
    if (m !== undefined && shouldRemoveBreakout({ ...it, ...m }, priceOf(it.isin), wallNow)) {
      removed.set(key, it);
    }
  }
  return { items, seq: snapSeq, now, meta, firstTime, removed };
}

export function BreakoutStrip({
  items,
  snapSeq,
  cards,
  onAddCard,
  onFocusCard,
  onDismiss,
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

  // 구독 후보 = 지금 보이는 종목(최근 돌파 우선은 훅이 정한다). 카드 종목은 카드가 구독한다.
  // 아직 기록 없는 키는 「가장 최근」(MAX_SAFE_INTEGER) — 추적 단계가 처음 보는 키에 현재 벽시계를
  // 찍으므로 옛 수렴 상태와 같은 구독 순위다. 동률은 `pickWithinBudget` 의 ISIN 순서가 가른다.
  const committedMeta = committedRef.current.meta;
  const candidates = useMemo(
    () =>
      items.map((it) => ({
        isin: it.isin,
        addedAt: committedMeta.get(breakoutKey(it))?.addedAt ?? Number.MAX_SAFE_INTEGER,
      })),
    [items, committedMeta],
  );
  const { prices } = useBreakoutQuotes(candidates, { excludeIsins: cards });
  const priceOf = useCallback((isin: string) => prices.get(isin), [prices]);

  const tracked = useMemo(
    () =>
      advanceTracked(committedRef.current, { items, snapSeq, now, priceOf, wallNow: Date.now() }),
    [items, snapSeq, now, priceOf],
  );
  useLayoutEffect(() => {
    committedRef.current = tracked;
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

  /* ── ⑤ 목록 전체 1초 tick — 강조 행이 있을 때만 ──────────────────── */
  const ticking = rows.some((r) => isHighlighted(r, now));
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), BREAKOUT_TICK_MS);
    return () => window.clearInterval(id);
  }, [ticking]);

  const activate = useCallback(
    (row: BreakoutRow) => {
      if (cards.has(row.isin)) {
        onFocusCard(row.isin);
        return;
      }
      onAddCard(row.isin, row.name, row.code);
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
          price: priceOf(row.isin),
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
        'min-w-0 overflow-hidden rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)]',
        className,
      )}
    >
      {/* ── 스트립 줄 ── */}
      <section
        data-slot="breakout-strip"
        aria-label="돌파감지"
        className="flex min-w-0 items-center gap-2 px-2.5 py-2"
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
          className="h-[26px] flex-none rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] px-2.5 text-[11px] font-semibold whitespace-nowrap text-[var(--fg)]"
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
          className="min-w-0 border-t border-[var(--border)]"
        >
          <BreakoutTable views={views} onActivate={activate} onDismiss={dismiss} />
        </section>
      )}
    </div>
  );
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
          ? 'cursor-default border-dashed border-[var(--border)] bg-[var(--bg)] text-[var(--muted-fg)]'
          : v.highlighted
            ? 'border-[var(--new-bd)] bg-[var(--new-bg)]'
            : 'border-[var(--border)] bg-[var(--bg)]',
      )}
    >
      <b
        data-slot="breakout-chip-name"
        className={cn('max-w-[8rem] min-w-0 truncate font-semibold', !v.named && 'mono font-medium')}
      >
        {v.label}
      </b>
      <span className={cn('mono font-bold', rateClass(v.rate))}>{signedRate(v.rate)}</span>
      <span className="mono text-[11px] text-[var(--muted-fg)]">{v.clock.slice(0, 5)}</span>
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
 * <830 에서 기준가를 숨기고, <700 에서 종목 셀 아래 보조 줄 「{HH:MM:SS} 돌파」를 세운다.
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
    'h-auto bg-[var(--muted)] px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap text-[var(--muted-fg)] @min-[700px]/wb:px-2.5';
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
                  <span className="flex min-w-0 items-baseline gap-1">
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
                      <span data-slot="breakout-row-code" className="mono flex-none text-[11px] text-[var(--muted-fg)]">
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
                    {v.clock} 돌파
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
                            : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)]',
                        )}
                      >
                        거래 추가
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
