/**
 * 페이지 이동 사이에 마지막 응답을 기억하는 메모리 캐시 (stale-while-revalidate).
 *
 * 홈·상승률 상위·테마는 페이지를 옮길 때마다 컴포넌트가 새로 마운트되어 매번 스켈레톤부터
 * 다시 그렸다. 훅이 마운트될 때 이 캐시에 값이 있으면 그 값을 바로 그리고, 평소처럼
 * 백그라운드에서 다시 받아 교체한다. 탭 메모리에만 있고 새로고침하면 사라진다.
 *
 * 사용자별 데이터(내 테마)가 섞이지 않도록 로그인 사용자가 바뀌면 AuthProvider 가 비운다.
 */

/** 이보다 오래된 값은 보여주지 않는다 — 한참 뒤 돌아왔을 때 낡은 화면이 번쩍이지 않게. */
export const QUERY_CACHE_MAX_AGE_MS = 5 * 60_000;

const store = new Map<string, { data: unknown; at: number }>();

export function readQueryCache<T>(
  key: string,
  maxAgeMs: number = QUERY_CACHE_MAX_AGE_MS,
): T | undefined {
  const hit = store.get(key);
  if (!hit || Date.now() - hit.at > maxAgeMs) return undefined;
  return hit.data as T;
}

export function writeQueryCache<T>(key: string, data: T): void {
  store.set(key, { data, at: Date.now() });
}

export function clearQueryCache(): void {
  store.clear();
}
