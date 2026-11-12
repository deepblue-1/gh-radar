'use client';

/**
 * 일 이동평균용 앞 거래일 종가 훅 (Phase 42 D-11 · Q2 · Q5 · RESEARCH Pattern 6 · Pitfall 3).
 *
 * - 일 칩이 하나라도 있으면(켜짐 무관) 부르는 쪽이 `enabled` 를 켠다 → (코드, 날짜)마다 **한 번만** `PREV_CLOSES_N`(239)개를 받는다.
 *   칩을 더하거나 켜고 꺼도 다시 받지 않는다(늘 최대 기간 몫을 받아 둔다).
 * - 상태: `enabled` false → `'idle'`(받아 둔 배열이 있으면 그 배열 — 다시 켤 때 요청 0) · 코드 없음(종목 마스터 없음) → `'nocode'`(요청 0) ·
 *   받는 중 → `'loading'` · 성공 → 배열(오름차순) · 실패 → `'error'`(다시 시도하지 않는다 — 화면을 다시 열면 다시).
 * - 코드 · 날짜가 바뀌거나 언마운트되면 앞 요청을 취소(abort)하고, 늦게 온 취소된 응답은 버린다(StrictMode 이중 effect 도 같은 정리).
 */

import { useEffect, useRef, useState } from 'react';

import { PREV_CLOSES_N, type PrevClosesState } from './candle-ma';
import { fetchPrevCloses } from './daily-closes';

/** 훅이 돌려주는 상태(= `PrevClosesState`). */
export type PrevCloses = PrevClosesState;

interface Entry {
  key: string;
  value: PrevClosesState;
}

export function usePrevCloses(
  code: string | null | undefined,
  ymd: string,
  enabled: boolean,
): PrevClosesState {
  const key = code ? `${code}|${ymd}` : null;
  const [entry, setEntry] = useState<Entry | null>(null);
  /** 끝난 결과(배열 · error)만 — effect 가 「이미 받음」 을 판단하는 기준(렌더 상태와 별개로 즉시 갱신). */
  const doneRef = useRef<Entry | null>(null);

  useEffect(() => {
    if (!enabled || !code || key === null) return;
    if (doneRef.current?.key === key) return; // 받아 둔 배열 · 실패 — 다시 받지 않는다
    const ac = new AbortController();
    setEntry({ key, value: 'loading' });
    fetchPrevCloses(code, ymd, PREV_CLOSES_N, ac.signal).then(
      (closes) => {
        if (ac.signal.aborted) return;
        const done: Entry = { key, value: closes };
        doneRef.current = done;
        setEntry(done);
      },
      () => {
        if (ac.signal.aborted) return; // 취소는 실패가 아니다
        const done: Entry = { key, value: 'error' };
        doneRef.current = done;
        setEntry(done);
      },
    );
    return () => ac.abort();
  }, [enabled, code, ymd, key]);

  if (!enabled) {
    return entry !== null && entry.key === key && Array.isArray(entry.value) ? entry.value : 'idle';
  }
  if (key === null) return 'nocode';
  if (entry !== null && entry.key === key) return entry.value;
  return 'loading';
}
