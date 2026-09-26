'use client';

/**
 * 전 종목 전략 로그 공급자 (Phase 21 D-25a · G-21-R3-2).
 *
 * ① 왜 있는가
 *   앱(`html.native-app`)은 /trading 하단 공용 패널(미체결 · 잔고 · 전략 로그)을 숨긴다 — 네이티브 탭바와
 *   겹쳐 쌓였다. 그 패널의 「전략 로그」 탭이 유일하게 보여 주던 **전 종목 전략 흐름**을 /me 전략 현황
 *   카드 「현황 | 로그」(스케치 008 ① B)가 대신 보여 준다. 작업대의 합친 로그는 **카드가 서 있어야**
 *   쌓이므로(카드마다 자기 전략의 에코를 본다) /me 에서는 쓸 수 없다. 그래서 relay 컨텍스트에서 직접
 *   파생하는 공급자를 앱 전역(`app/layout.tsx` RelayProvider 바로 안쪽)에 둔다 — 앱 시작부터 쌓인다.
 *
 * ② ★ 서버가 말한 것만 쌓는다 (strategy-log.tsx ① · T-21-88)
 *   문장은 작업대와 **같은 순수 함수**(`strategyLogLine` · `serverMessageLogLine` ·
 *   `strategiesDisabledLogLine`)가 짓고, 「새로 말할 것이 없는 에코」 판정도 `isRuntimeOnlyEcho` 하나다.
 *   이 화면이 모르는 맥락은 넘기지 않는다 — 발주 여부(`hadOrder`)는 카드의 보냄 기록이 있어야 알 수 있어
 *   여기서는 무장 해제를 「발주」라고 쓰지 않는다(거짓말하지 않는다). 카드 귀속 줄(다른 단말 배너 ·
 *   15:40 원인 줄 · arm 거절)도 같은 이유로 없다. 통지(54)는 작업대 카드와 같은 **상따 몫**
 *   (`isLimitChaserServerMessage`)만 — VI 몫은 VI 줄이 말한다.
 *
 * ③ 브라우저 메모리 전용이다 — 새로고침하면(앱을 새로 열면) 빈다. 서버 호출 · 새 API · 새 스키마 ·
 *   새 저장소 없음(작업대 로그와 같은 성질 · T-16-02). 사용자가 바뀌면(로그아웃 · 다른 계정) 비운다 —
 *   다음 사용자가 이전 사용자의 전략 흐름을 보지 않는다(T-16-04).
 *
 * ④ 같은 전략 키의 직전 줄과 같은 문장은 다시 쌓지 않는다(작업대 합치기와 같은 방어 — 재접속 스냅샷).
 *   최신이 index 0 · 최대 200 줄(작업대 `MAX_MERGED_LOG` 과 같은 값).
 */

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { RelayExchange, RelayLimitChaser } from '@gh-radar/shared';

import {
  isRuntimeOnlyEcho,
  serverMessageLogLine,
  strategiesDisabledLogLine,
  strategyLogLine,
  type StrategyLogEntry,
} from '@/components/trading/strategy-log';
import { useAuth } from '@/lib/auth-context';
import { useIsinLabels } from '@/lib/isin-labels';
import { exchangeLabeledName, isLimitChaserServerMessage } from '@/lib/limit-chaser';
import { useRelayContext } from '@/lib/relay-provider';

/** 쌓는 상한 — 작업대 합친 로그(`MAX_MERGED_LOG`)와 같은 값. */
export const MAX_FEED_LOG = 200;

export interface LimitChaserDiffLine {
  key: string;
  isin: string;
  exchange: RelayExchange;
  /** 서버가 채운 종목명(있으면) — 삭제 줄은 직전 객체의 이름이다. */
  name?: string;
  text: string;
}

/**
 * 직전 전략 Map ↔ 지금 목록 → 로그 줄 (**순수 함수**).
 *
 * - 처음 보는 키 = `strategyLogLine(null, next)`(등록 줄).
 * - 같은 키 = 내용상 새로 말할 것이 없으면(`isRuntimeOnlyEcho` — 같은 객체 · 카운터 · 파생 표시값만) 0줄,
 *   아니면 `strategyLogLine(prev, next)` — `hadOrder` 는 넘기지 않는다(파일 상단 ②).
 * - 직전에만 있는 키 = 삭제 줄(목록은 `crud:"D"` 를 담지 않는다 — 빠진 것이 곧 삭제다).
 */
export function diffLimitChasers(
  prev: ReadonlyMap<string, RelayLimitChaser>,
  next: readonly RelayLimitChaser[],
): LimitChaserDiffLine[] {
  const out: LimitChaserDiffLine[] = [];
  const nextKeys = new Set<string>();
  for (const item of next) {
    nextKeys.add(item.key);
    const before = prev.get(item.key) ?? null;
    if (before !== null && isRuntimeOnlyEcho(before, item)) continue;
    const text = strategyLogLine(before, item);
    if (text === null) continue;
    out.push({ key: item.key, isin: item.isin, exchange: item.exchange, name: item.name, text });
  }
  for (const [key, before] of prev) {
    if (nextKeys.has(key)) continue;
    const text = strategyLogLine(before, { ...before, crud: 'D' }) ?? '전략이 삭제됐어요';
    out.push({ key, isin: before.isin, exchange: before.exchange, name: before.name, text });
  }
  return out;
}

/**
 * 지금 시각 `HH:MM:SS` — 로케일 포맷터를 쓰지 않는다(카드 `clockNow` 와 같은 이유: Chromium 은
 * `ko-KR` 에서 「0시 57분 16초」를 돌려줘 고정폭 시각 열이 흔들린다). 통지의 `receivedAt` 도 그 포맷터라
 * 쓰지 않는다 — 공급자는 앱 시작부터 떠 있어 수신 시각과 같다.
 */
function clockNow(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

const EMPTY_FEED: readonly StrategyLogEntry[] = [];
const StrategyLogFeedContext = createContext<readonly StrategyLogEntry[]>(EMPTY_FEED);

type PendingLine = Omit<StrategyLogEntry, 'id' | 'at'> & { key?: string };

export function StrategyLogFeedProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { limitChasers, messages, strategiesDisabled } = useRelayContext();
  const labels = useIsinLabels();
  const labelsRef = useRef(labels);
  useLayoutEffect(() => {
    labelsRef.current = labels;
  }, [labels]);

  const [entries, setEntries] = useState<readonly StrategyLogEntry[]>(EMPTY_FEED);
  const prevChasers = useRef<ReadonlyMap<string, RelayLimitChaser>>(new Map());
  const seenMessages = useRef(new WeakSet<object>());
  const lastText = useRef(new Map<string, string>());
  const lastDisabled = useRef(strategiesDisabled);
  const seq = useRef(0);

  /** 최신순(index 0 = 최신) 줄들을 앞에 쌓는다. 같은 키 직전 줄과 같은 문장은 거른다(④). */
  const push = (lines: readonly PendingLine[]) => {
    const at = clockNow();
    const add: StrategyLogEntry[] = [];
    // 오래된 것부터 직전 문장을 판정해야 같은 배치 안 중복도 걸러진다.
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const { key, ...line } = lines[i];
      if (key !== undefined) {
        if (lastText.current.get(key) === line.text) continue;
        lastText.current.set(key, line.text);
      }
      seq.current += 1;
      add.unshift({ ...line, id: `feed-log-${seq.current}`, at });
    }
    if (add.length === 0) return;
    setEntries((prev) => [...add, ...prev].slice(0, MAX_FEED_LOG));
  };

  // 사용자 경계 — 바뀌면 비운다(③). 아래 파생 이펙트보다 먼저 선언해 같은 커밋에서 먼저 돈다.
  const userRef = useRef(userId);
  useEffect(() => {
    if (userRef.current === userId) return;
    userRef.current = userId;
    prevChasers.current = new Map();
    seenMessages.current = new WeakSet();
    lastText.current.clear();
    lastDisabled.current = null;
    setEntries(EMPTY_FEED);
  }, [userId]);

  // 전략 전이(60 에코 · 64 스냅샷) — 직전 Map 과 diff.
  useEffect(() => {
    const lines = diffLimitChasers(prevChasers.current, limitChasers);
    prevChasers.current = new Map(limitChasers.map((item) => [item.key, item]));
    if (lines.length === 0) return;
    push(
      lines.map((l) => ({
        key: l.key,
        text: l.text,
        level: 'info' as const,
        // 빈 문자열 이름은 「모른다」다(isin-labels ⓐ) — 라벨 → ISIN 원문 순으로 떨어진다.
        who: exchangeLabeledName(l.name || labelsRef.current.get(l.isin)?.name || l.isin, l.exchange),
      })),
    );
  }, [limitChasers]);

  // 서버 통지(54) — 새 항목만(WeakSet) · 상따 몫만(②). `messages` 는 최신이 index 0 이다.
  useEffect(() => {
    const fresh = messages.filter((m) => !seenMessages.current.has(m));
    for (const m of fresh) seenMessages.current.add(m);
    const lines = fresh.filter(isLimitChaserServerMessage).map((m) => {
      const { text, level } = serverMessageLogLine(m);
      const who = m.i === '' ? undefined : labelsRef.current.get(m.i)?.name || m.i;
      return { text, level, who };
    });
    if (lines.length > 0) push(lines);
  }, [messages]);

  // 전부 정지 집계 응답(65) — null → 값(또는 새 값)마다 1줄.
  useEffect(() => {
    if (strategiesDisabled === null || strategiesDisabled === lastDisabled.current) {
      lastDisabled.current = strategiesDisabled;
      return;
    }
    lastDisabled.current = strategiesDisabled;
    push([{ text: strategiesDisabledLogLine(), level: 'info' }]);
  }, [strategiesDisabled]);

  return <StrategyLogFeedContext value={entries}>{children}</StrategyLogFeedContext>;
}

/** 전 종목 전략 로그(최신이 index 0). Provider 밖이면 빈 배열이다. */
export function useStrategyLogFeed(): readonly StrategyLogEntry[] {
  return useContext(StrategyLogFeedContext);
}
