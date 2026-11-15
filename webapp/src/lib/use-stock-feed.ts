/**
 * 작업대 뉴스·공시 폴링 (Phase 41 D-04 · D-17 · D-18).
 *
 * ① 묶음 조회 하나 — 작업대가 보는 종목(돌파 목록 ∪ 카드)의 코드를 모아 `GET /api/news/by-stock` 을
 *   `STOCK_FEED_POLL_MS` 마다 부른다. 코드가 `STOCK_FEED_CHUNK`(서버 상한 100)를 넘으면 나눠서 **차례로** 부르고,
 *   응답을 코드별 Map 으로 합쳐 상태를 한 번에 바꾼다. 서버가 등록 · 5초 캐시 · 합치기를 하므로 웹은 한투를 부르지
 *   않는다(D-05 · SC-4). 호출 수는 탭당 10초 1번(100코드 묶음)이고 사용자 클릭과 무관하다.
 *
 * ② 숨김 정지 · 실패 유지 — 화면이 숨으면 그 주기를 건너뛰고, 다시 보이면 바로 1번 부른 뒤 주기를 다시 잡는다.
 *   실패한 묶음은 건너뛴다(그 코드들은 마지막 entries 그대로) — 화면에서 글이 사라지지 않는다. 다음 주기가 다시 시도한다.
 *   직전 회차가 아직 돌면 그 주기는 건너뛴다 — 진행 중 요청을 끊지 않는다(WR-60).
 *   실패는 원인을 `console.warn`(1분 간격)으로 남기고, 연속 `STOCK_FEED_FAIL_AFTER` 회차 실패한 코드는 `failed` 로
 *   내보낸다 — 첫 응답 전 코드가 「불러오는 중」 에 끝없이 머물지 않게(IN-61).
 *   코드 집합이 바뀌어도 주기를 다시 잡지 않고 진행 중 요청도 끊지 않는다(WR-61). 새 코드가 들어왔을 때만 변경을
 *   `STOCK_FEED_CHANGE_DEBOUNCE_MS` 동안 모아 한 회차로 부르고(직전 회차 시작에서 주기의 절반 안이면 그만큼 미룸),
 *   그 회차 뒤 주기의 절반 안에 온 주기 tick 은 건너뛴다 — 돌파 진입 · 이탈이 몰리는 장 시작에도 회차는 주기의 절반에
 *   1번을 넘지 않는다. 빠지기만 했으면 부르지 않는다. 코드 집합 키는 정렬 · 결합한 문자열이라 같은 집합의 새 배열로는
 *   아무 일도 없다.
 *
 * ③ 새 글 첫 발견 — 코드별 첫 응답은 기준선이다(이미 있던 글은 새 글이 아니다). 그 뒤 응답에 처음 보인 id 만
 *   `firstSeen` 에 그 시각을 적는다. `STOCK_FEED_NEW_MS`(돌파 강조와 같은 30초)가 지난 기록은 다음 응답 때 지운다.
 *   단 수집 전(`collectedAt: null`) 응답은 기준선이 아니고, 작성 시각이 `STOCK_FEED_FRESH_PUBLISHED_MS` 보다 오래된 글은
 *   처음 보여도 새 글이 아니다 — 첫 종목별 수집 · 보충 수집이 메운 지난 글을 방금 뜬 재료로 칠하지 않는다(CR-60).
 *   `firstSeen` 은 바뀐 게 없으면 신원이 그대로다 — 강조 시계(`StockFeedProvider`)가 쓸데없이 다시 돌지 않게.
 *   강조 끝내기는 이 훅이 아니라 문맥의 1초 타이머 하나가 `isFeedItemNew` 로 다시 판정한다(돌파 강조 규칙 ⑤).
 *
 * ④ 받은 대로 — 거르기 · 합치기 · 정렬은 서버가 한 번 했다(D-14). 이 훅은 줄을 바꾸지 않는다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  NEWS_BY_STOCK_MAX_CODES,
  SHORT_CODE_RE,
  STOCK_FEED_DEFAULT_DAYS,
  STOCK_FEED_DEFAULT_LIMIT,
  type StockFeedEntry,
} from '@gh-radar/shared';

import { fetchNewsByStock } from '@/lib/news-by-stock-api';

/** 폴링 간격 — D-01(클라 5 ~ 10초) · 서버 캐시 5초. */
export const STOCK_FEED_POLL_MS = 10_000;
/** 새 글 강조 지속 — 돌파 신규 강조(`HIGHLIGHT_MS`)와 같다. */
export const STOCK_FEED_NEW_MS = 30_000;
/** 코드 집합 변경을 모으는 시간 — 돌파 진입 · 이탈이 몇 초 간격으로 이어질 때 변경마다 부르지 않게(WR-61). */
export const STOCK_FEED_CHANGE_DEBOUNCE_MS = 1_500;
/** 연속으로 이만큼 회차 실패한 코드는 `failed` 에 넣는다 — 화면이 「불러오는 중」 대신 실패를 말한다(IN-61). */
export const STOCK_FEED_FAIL_AFTER = 3;
/** 실패 경고 로그 간격 — 탭 하나가 10초마다 같은 경고를 쌓지 않게(IN-61). */
export const STOCK_FEED_WARN_EVERY_MS = 60_000;
/** 한 요청의 코드 수 — 서버 상한. */
export const STOCK_FEED_CHUNK = NEWS_BY_STOCK_MAX_CODES;

export interface StockFeedPolling {
  /** 코드 → 묶음(받은 그대로). 아직 응답이 없는 코드는 키가 없다. */
  entries: ReadonlyMap<string, StockFeedEntry>;
  /** 글 id → 처음 본 시각(epoch ms) — 기준선 뒤에 새로 보인 글만. */
  firstSeen: ReadonlyMap<string, number>;
  /**
   * 연속 `STOCK_FEED_FAIL_AFTER` 회차 조회에 실패한 코드(IN-61) — 그 코드가 응답에 다시 오면 빠진다.
   * 마지막 entries 가 있는 코드는 화면이 그 값을 계속 보여 준다(②). 첫 응답 전인 코드만 실패 문구를 쓴다.
   */
  failed: ReadonlySet<string>;
}

export interface StockFeedPollingOpts {
  intervalMs?: number;
  days?: number;
  limit?: number;
}

const SIG_SEP = ',';
const EMPTY: StockFeedPolling = { entries: new Map(), firstSeen: new Map(), failed: new Set() };

/** 같은 원소인가 — 바뀐 게 없으면 `failed` 신원을 지켜 쓸데없는 재렌더를 막는다. */
function sameMembers(a: ReadonlySet<string>, b: readonly string[]): boolean {
  return a.size === b.length && b.every((c) => a.has(c));
}

/** 실패 원인을 로그에 남길 필드만 — `ApiClientError`(status · code) 또는 그 밖의 오류 메시지. */
function failureFields(err: unknown): { status?: unknown; code?: unknown; message?: unknown } {
  if (typeof err !== 'object' || err === null) return { message: String(err) };
  const e = err as { status?: unknown; code?: unknown; message?: unknown };
  return { status: e.status, code: e.code, message: e.message };
}

/** 배지 유무 — 공시 · 뉴스가 하나라도 있는가. entry 가 없으면 둘 다 거짓. */
export function feedBadgesOf(entry: StockFeedEntry | undefined): { disclosure: boolean; news: boolean } {
  let disclosure = false;
  let news = false;
  for (const it of entry?.items ?? []) {
    if (it.kind === 'disclosure') disclosure = true;
    else news = true;
    if (disclosure && news) break;
  }
  return { disclosure, news };
}

/**
 * 새 글로 칠할 수 있는 작성 시각의 최대 나이 — 이보다 오래된 글은 처음 보여도 새 글이 아니다(CR-60).
 * 네이버 수집 주기(장중 3분 · 순환 9분)와 색인 지연을 넉넉히 덮고, 종목별 보충 수집이 메운 며칠 전 글은 거른다.
 */
export const STOCK_FEED_FRESH_PUBLISHED_MS = 30 * 60_000;

/** 작성 시각이 `STOCK_FEED_FRESH_PUBLISHED_MS` 안인가. 시각을 못 읽으면 거짓(강조하지 않는 쪽). */
export function isFreshlyPublished(publishedAt: string, now: number): boolean {
  const t = Date.parse(publishedAt);
  return Number.isFinite(t) && now - t < STOCK_FEED_FRESH_PUBLISHED_MS;
}

/** 새 글인가 — 처음 본 뒤 `STOCK_FEED_NEW_MS` 가 안 지났다. */
export function isFeedItemNew(id: string, firstSeen: ReadonlyMap<string, number>, now: number): boolean {
  const t = firstSeen.get(id);
  return t !== undefined && now - t < STOCK_FEED_NEW_MS;
}

export function useStockFeedPolling(
  codes: readonly string[],
  opts: StockFeedPollingOpts = {},
): StockFeedPolling {
  const {
    intervalMs = STOCK_FEED_POLL_MS,
    days = STOCK_FEED_DEFAULT_DAYS,
    limit = STOCK_FEED_DEFAULT_LIMIT,
  } = opts;
  // 안정 키 — 형식 통과 · 중복 제거 · 정렬(①).
  const sig = useMemo(
    () => [...new Set(codes.filter((c) => SHORT_CODE_RE.test(c)))].sort().join(SIG_SEP),
    [codes],
  );
  const [state, setState] = useState<StockFeedPolling>(EMPTY);
  /** 코드 → 마지막 응답의 글 id — 키가 있으면 그 코드의 기준선을 잡았다(③). */
  const seenRef = useRef(new Map<string, Set<string>>());
  const firstSeenRef = useRef<ReadonlyMap<string, number>>(EMPTY.firstSeen);
  /** 코드 → 연속 실패 회차 수 — 응답이 오면 지운다(IN-61). */
  const failCountRef = useRef(new Map<string, number>());
  /** 지금 볼 코드 — 주기 effect 는 이것을 읽는다(코드 집합이 바뀌어도 주기를 다시 잡지 않는다 · WR-61). */
  const listRef = useRef<readonly string[]>([]);
  /** 코드 집합이 바뀌었다고 주기 effect 에 알린다 — 주기 effect 가 살아 있을 때만 있다. */
  const codesChangedRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const list = sig === '' ? [] : sig.split(SIG_SEP);
    listRef.current = list;
    const codeSet = new Set(list);
    // 빠진 코드의 기준선 · entries 는 바로 버린다 — 다시 들어오면 그 첫 응답이 다시 기준선이다. 코드가 0개가 된
    // 때도 같다(IN-60 — relay 재연결 스냅샷으로 잠깐 비었다 돌아오면 옛 기준선으로 비어 있던 동안의 글을 칠했다).
    for (const c of [...seenRef.current.keys()]) if (!codeSet.has(c)) seenRef.current.delete(c);
    for (const c of [...failCountRef.current.keys()]) if (!codeSet.has(c)) failCountRef.current.delete(c);
    setState((prev) => {
      const entriesKept = [...prev.entries.keys()].every((c) => codeSet.has(c));
      const failedKept = [...prev.failed].every((c) => codeSet.has(c));
      if (entriesKept && failedKept) return prev;
      const entries = new Map<string, StockFeedEntry>();
      for (const [c, e] of prev.entries) if (codeSet.has(c)) entries.set(c, e);
      const failed = failedKept ? prev.failed : new Set([...prev.failed].filter((c) => codeSet.has(c)));
      return { entries, firstSeen: prev.firstSeen, failed };
    });
    codesChangedRef.current?.();
  }, [sig]);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;
    /** 회차 진행 중 — 주기 tick · 다시 보임은 겹쳐 부르지 않는다(WR-60). */
    let inFlight = false;
    /** 마지막 회차 시작 시각 — 회차 사이 최소 간격(`minGap`)을 지킨다(WR-61). */
    let lastStart = Number.NEGATIVE_INFINITY;
    /** 마지막 회차가 부른 코드 — 새로 들어온 코드가 있는지 가른다(WR-61). */
    let requested = new Set<string>();
    /** 코드 집합 변경으로 잡아 둔 회차 — 여러 변경을 하나로 모은다(WR-61). */
    let changeTimer: ReturnType<typeof setTimeout> | null = null;
    /** 진행 중 회차가 끝나면 바뀐 코드 집합으로 한 번 더 돈다(WR-61). */
    let changedWhileInFlight = false;
    const minGap = intervalMs / 2;
    let lastWarnAt = Number.NEGATIVE_INFINITY;

    /** 묶음 실패 — 원인을 남긴다(무로그 fail-safe 금지 · IN-61). 같은 탭이 10초마다 쌓지 않게 간격을 둔다. */
    const warnFailure = (err: unknown, codeCount: number) => {
      const now = Date.now();
      if (now - lastWarnAt < STOCK_FEED_WARN_EVERY_MS) return;
      lastWarnAt = now;
      console.warn('[gh-radar] 뉴스·공시 묶음 조회 실패 — 마지막 값 유지 · 다음 주기에 다시', {
        ...failureFields(err),
        codes: codeCount,
      });
    };

    const apply = (got: readonly StockFeedEntry[], failedCodes: readonly string[]) => {
      const now = Date.now();
      const codeSet = new Set(listRef.current);
      // 연속 실패 수 — 응답이 온 코드는 지우고 실패한 묶음의 코드는 1 올린다(IN-61).
      const failCount = failCountRef.current;
      for (const e of got) failCount.delete(e.code);
      for (const c of failedCodes) if (codeSet.has(c)) failCount.set(c, (failCount.get(c) ?? 0) + 1);
      const failedNow = [...failCount].filter(([, n]) => n >= STOCK_FEED_FAIL_AFTER).map(([c]) => c);
      const failedOf = (prev: ReadonlySet<string>) => (sameMembers(prev, failedNow) ? prev : new Set(failedNow));
      if (got.length === 0) {
        setState((prev) => {
          const failed = failedOf(prev.failed);
          return failed === prev.failed ? prev : { ...prev, failed };
        });
        return;
      }
      const seen = seenRef.current;
      let firstSeen = firstSeenRef.current;
      let next: Map<string, number> | null = null;
      const writable = () => (next ??= new Map(firstSeen));
      for (const [id, t] of firstSeen) if (now - t >= STOCK_FEED_NEW_MS) writable().delete(id);
      for (const e of got) {
        // 응답을 기다리는 사이 빠진 코드는 버린다 — 기준선도 남기지 않는다.
        if (!codeSet.has(e.code)) continue;
        // 수집 전(`collectedAt: null`) 응답은 기준선이 아니다 — 첫 종목별 수집(D-06)이 메운 3일 치 기존 글이
        // 한꺼번에 새 글로 강조된다(CR-60). 기준선은 수집한 뒤 첫 응답에서 잡는다.
        if (e.collectedAt === null) {
          seen.delete(e.code);
          continue;
        }
        const before = seen.get(e.code);
        if (before !== undefined) {
          for (const it of e.items) {
            if (before.has(it.id) || (next ?? firstSeen).has(it.id)) continue;
            // 종목별 보충 수집이 뒤늦게 메운 옛 글은 처음 보여도 새 글이 아니다(CR-60).
            if (!isFreshlyPublished(it.publishedAt, now)) continue;
            writable().set(it.id, now);
          }
        }
        seen.set(e.code, new Set(e.items.map((it) => it.id)));
      }
      if (next !== null) firstSeen = firstSeenRef.current = next;
      setState((prev) => {
        const entries = new Map<string, StockFeedEntry>();
        for (const [c, e] of prev.entries) if (codeSet.has(c)) entries.set(c, e);
        for (const e of got) if (codeSet.has(e.code)) entries.set(e.code, e);
        return { entries, firstSeen, failed: failedOf(prev.failed) };
      });
    };

    const run = async () => {
      if (changeTimer !== null) {
        clearTimeout(changeTimer);
        changeTimer = null;
      }
      if (document.visibilityState === 'hidden') return;
      // 직전 회차가 아직 돌면 이번 주기는 건너뛴다 — 끊고 다시 부르면 회차가 주기보다 길 때 응답이 영영 반영되지
      // 않는다(WR-60). 묶음마다 `apiFetch` 8초 타임아웃이 있어 회차는 반드시 끝난다.
      if (inFlight) return;
      const list = listRef.current;
      if (list.length === 0) return;
      const ctrl = new AbortController();
      controller = ctrl;
      inFlight = true;
      lastStart = Date.now();
      requested = new Set(list);
      try {
        const got: StockFeedEntry[] = [];
        const failedCodes: string[] = [];
        for (let i = 0; i < list.length; i += STOCK_FEED_CHUNK) {
          const chunk = list.slice(i, i + STOCK_FEED_CHUNK);
          try {
            const res = await fetchNewsByStock(chunk, { days, limit }, ctrl.signal);
            got.push(...res.stocks);
          } catch (err) {
            // 끊긴 요청은 조용히 끝낸다. 그 밖의 실패는 이 묶음만 건너뛴다 — 마지막 entries 유지 · 다음 주기에 다시(②).
            // 원인은 로그로 남기고 연속 실패를 센다(IN-61).
            if (ctrl.signal.aborted) return;
            failedCodes.push(...chunk);
            warnFailure(err, chunk.length);
          }
          if (ctrl.signal.aborted) return;
        }
        if (disposed) return;
        apply(got, failedCodes);
      } finally {
        inFlight = false;
        if (changedWhileInFlight && !disposed) {
          changedWhileInFlight = false;
          onCodesChanged();
        }
      }
    };

    /**
     * 코드 집합이 바뀌었다(WR-61). 빠지기만 했으면 부르지 않는다(다음 응답이 entries 를 정리한다).
     * 새 코드가 있으면 진행 중 요청을 끊지 않고, 변경을 `STOCK_FEED_CHANGE_DEBOUNCE_MS` 동안 모아 한 회차로 부른다 —
     * 직전 회차 시작에서 `minGap` 안이면 그만큼 미룬다. 아직 한 번도 부르지 않았으면(첫 코드) 바로 부른다.
     */
    const onCodesChanged = () => {
      // 빠진 코드는 「부른 적 없음」으로 돌린다 — 빠졌다 다시 들어오면 새 코드처럼 곧 부른다(IN-60).
      const current = new Set(listRef.current);
      for (const c of requested) if (!current.has(c)) requested.delete(c);
      if (!listRef.current.some((c) => !requested.has(c))) return;
      if (inFlight) {
        changedWhileInFlight = true;
        return;
      }
      if (changeTimer !== null) return;
      const delay =
        lastStart === Number.NEGATIVE_INFINITY
          ? 0
          : Math.max(STOCK_FEED_CHANGE_DEBOUNCE_MS, lastStart + minGap - Date.now());
      changeTimer = setTimeout(() => void run(), delay);
    };
    codesChangedRef.current = onCodesChanged;

    // 주기 — 코드 집합 변경으로 회차가 막 돌았으면(minGap 안) 이번 주기는 건너뛴다.
    const onTick = () => {
      if (Date.now() - lastStart < minGap) return;
      void run();
    };
    let timer = setInterval(onTick, intervalMs);
    void run();
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      clearInterval(timer);
      timer = setInterval(onTick, intervalMs);
      onTick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      codesChangedRef.current = null;
      controller?.abort();
      clearInterval(timer);
      if (changeTimer !== null) clearTimeout(changeTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, days, limit]);

  return state;
}
