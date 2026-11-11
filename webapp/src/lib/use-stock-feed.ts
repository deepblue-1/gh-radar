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
 *   코드 집합이 바뀌면 진행 중 요청을 끊고 바로 1번 부른다. effect 의존은 정렬 · 결합한 코드 문자열이라 같은 집합의
 *   새 배열로는 다시 돌지 않는다.
 *
 * ③ 새 글 첫 발견 — 코드별 첫 응답은 기준선이다(이미 있던 글은 새 글이 아니다). 그 뒤 응답에 처음 보인 id 만
 *   `firstSeen` 에 그 시각을 적는다. `STOCK_FEED_NEW_MS`(돌파 강조와 같은 30초)가 지난 기록은 다음 응답 때 지운다.
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
/** 한 요청의 코드 수 — 서버 상한. */
export const STOCK_FEED_CHUNK = NEWS_BY_STOCK_MAX_CODES;

export interface StockFeedPolling {
  /** 코드 → 묶음(받은 그대로). 아직 응답이 없는 코드는 키가 없다. */
  entries: ReadonlyMap<string, StockFeedEntry>;
  /** 글 id → 처음 본 시각(epoch ms) — 기준선 뒤에 새로 보인 글만. */
  firstSeen: ReadonlyMap<string, number>;
}

export interface StockFeedPollingOpts {
  intervalMs?: number;
  days?: number;
  limit?: number;
}

const SIG_SEP = ',';
const EMPTY: StockFeedPolling = { entries: new Map(), firstSeen: new Map() };

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

  useEffect(() => {
    if (sig === '') return;
    const list = sig.split(SIG_SEP);
    const codeSet = new Set(list);
    // 빠진 코드의 기준선은 버린다 — 다시 들어오면 그 첫 응답이 다시 기준선이다.
    for (const c of [...seenRef.current.keys()]) if (!codeSet.has(c)) seenRef.current.delete(c);

    let disposed = false;
    let controller: AbortController | null = null;

    const apply = (got: readonly StockFeedEntry[]) => {
      const now = Date.now();
      const seen = seenRef.current;
      let firstSeen = firstSeenRef.current;
      let next: Map<string, number> | null = null;
      const writable = () => (next ??= new Map(firstSeen));
      for (const [id, t] of firstSeen) if (now - t >= STOCK_FEED_NEW_MS) writable().delete(id);
      for (const e of got) {
        const ids = e.items.map((it) => it.id);
        const before = seen.get(e.code);
        if (before !== undefined) {
          for (const id of ids) {
            if (!before.has(id) && !(next ?? firstSeen).has(id)) writable().set(id, now);
          }
        }
        seen.set(e.code, new Set(ids));
      }
      if (next !== null) firstSeen = firstSeenRef.current = next;
      setState((prev) => {
        const entries = new Map<string, StockFeedEntry>();
        for (const [c, e] of prev.entries) if (codeSet.has(c)) entries.set(c, e);
        for (const e of got) entries.set(e.code, e);
        return { entries, firstSeen };
      });
    };

    const run = async () => {
      if (document.visibilityState === 'hidden') return;
      controller?.abort();
      const ctrl = new AbortController();
      controller = ctrl;
      const got: StockFeedEntry[] = [];
      for (let i = 0; i < list.length; i += STOCK_FEED_CHUNK) {
        try {
          const res = await fetchNewsByStock(list.slice(i, i + STOCK_FEED_CHUNK), { days, limit }, ctrl.signal);
          got.push(...res.stocks);
        } catch {
          // 끊긴 요청은 조용히 끝낸다. 그 밖의 실패는 이 묶음만 건너뛴다 — 마지막 entries 유지 · 다음 주기에 다시(②).
          if (ctrl.signal.aborted) return;
        }
        if (ctrl.signal.aborted) return;
      }
      if (disposed || got.length === 0) return;
      apply(got);
    };

    let timer = setInterval(run, intervalMs);
    void run();
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      clearInterval(timer);
      timer = setInterval(run, intervalMs);
      void run();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sig, intervalMs, days, limit]);

  return state;
}
