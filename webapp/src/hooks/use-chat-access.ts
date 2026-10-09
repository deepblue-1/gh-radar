'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { checkChatAccess } from '@/lib/chat-api';
import { readQueryCache, writeQueryCache } from '@/lib/query-cache';
import type { DmaGateReason } from '@/components/trading/dma-gate';

/**
 * AI 애널리스트 접근 판정 — server 접근 탐침 `GET /api/chat/access` 1회 (quick-261009-c43 D-02 · D-03).
 *
 * 반환 `access`:
 *   - `"pending"`         아직 모름(세션 판정 중 · `enabled=false` · 탐침 응답 전). 소비처는 아무것도 그리지 않는다.
 *   - `"ok"`              DMA 매핑 사용자 — 본문 · 진입 버튼을 그린다.
 *   - `"unmapped"`        server 403 `DMA_UNMAPPED` — `/chat` 은 DmaGate, 진입 버튼은 비렌더.
 *   - `"unauthenticated"` 로그인 없음 · 세션 만료(401).
 *   - `"error"`           그 밖 실패(500 · 네트워크). `/chat` 은 오류 상자 + `retry()`.
 *
 * ⚠️ **표시용이다 — 권한 장치가 아니다.** 실제 차단은 server `requireDmaMapped`(챗 라우트 전부 · D-01)가 한다.
 * 이 훅은 「왜 못 쓰는지」 를 말하고 진입 버튼을 숨겨 오진입을 줄일 뿐이다.
 *
 * relay 신호(`useDmaGateReason` 의 `unauthorized`)를 보지 않는 이유(D-02): AI 애널리스트는 relay 표면이 아니라
 * relay 가 내려가 있어도 써야 하고, 표시 판정이 server 차단과 **같은 원천**(`dma_visible_accounts`)을 봐야 둘이 갈리지 않는다.
 *
 * 기억(query-cache 키 `chat:access:{userId}` — 사용자 전환 시 AuthProvider 가 비운다):
 *   - `"ok"` 는 탭 수명 동안 믿는다 — 앱 AI 탭 재방문마다 본문이 비었다 서는 일을 막는다.
 *   - `"unmapped"` 는 기본 5분만 믿는다 — 관리자가 DMA 를 연결하면 5분 안에 풀린다.
 *   - 401 · 오류는 기억하지 않는다.
 * 같은 사용자 동시 탐침(종목상세 FAB + 히어로 버튼)은 모듈 수준 진행 중 Promise 하나로 합친다.
 * 결과는 조회한 userId 에 묶는다(`use-app-role.ts` 패턴) — 계정 전환 직후 이전 사용자 판정으로 그리지 않는다.
 *
 * 소비처: `/chat` 페이지 · 종목상세 FAB(`chat-fab.tsx`, 종목상세 경로에서만 enabled) · 앱 히어로 「AI 분석」.
 */

export type ChatAccess = 'pending' | 'ok' | 'error' | DmaGateReason;
type Settled = Exclude<ChatAccess, 'pending'>;
type Remembered = 'ok' | 'unmapped';

const cacheKey = (userId: string) => `chat:access:${userId}`;
const inflight = new Map<string, Promise<Settled>>();

function readRemembered(userId: string): Remembered | undefined {
  const any = readQueryCache<Remembered>(cacheKey(userId), Infinity);
  if (any === 'ok') return 'ok';
  return readQueryCache<Remembered>(cacheKey(userId)) === 'unmapped' ? 'unmapped' : undefined;
}

function probe(userId: string): Promise<Settled> {
  const running = inflight.get(userId);
  if (running) return running;
  const p = checkChatAccess()
    .then((): Settled => {
      writeQueryCache<Remembered>(cacheKey(userId), 'ok');
      return 'ok';
    })
    .catch((e: unknown): Settled => {
      if (e instanceof ApiClientError && e.status === 403) {
        writeQueryCache<Remembered>(cacheKey(userId), 'unmapped');
        return 'unmapped';
      }
      if (e instanceof ApiClientError && e.status === 401) return 'unauthenticated';
      return 'error';
    })
    .finally(() => {
      inflight.delete(userId);
    });
  inflight.set(userId, p);
  return p;
}

export function useChatAccess(enabled = true): {
  access: ChatAccess;
  retry: () => void;
  markUnmapped: () => void;
} {
  const { user, isLoading } = useAuth();
  const userId = user?.id ?? null;
  const [result, setResult] = useState<{ userId: string; access: Settled } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || isLoading || userId === null) return;
    if (readRemembered(userId) !== undefined) return;
    let cancelled = false;
    void probe(userId).then((access) => {
      if (!cancelled) setResult({ userId, access });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, isLoading, userId, attempt]);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);

  const markUnmapped = useCallback(() => {
    if (userId === null) return;
    writeQueryCache<Remembered>(cacheKey(userId), 'unmapped');
    setResult({ userId, access: 'unmapped' });
  }, [userId]);

  let access: ChatAccess;
  if (isLoading || !enabled) access = 'pending';
  else if (userId === null) access = 'unauthenticated';
  else if (result?.userId === userId) access = result.access;
  else access = readRemembered(userId) ?? 'pending';

  return { access, retry, markUnmapped };
}
