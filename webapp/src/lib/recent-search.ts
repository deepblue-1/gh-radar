/**
 * `/search` 최근 검색 — 기기별 기억 (Phase 21 D-07a).
 *
 * ① 키 `gh-radar:recent-search` — 접두 `gh-radar:` 는 D-21 브랜드 변경(GH Trade)에도 유지한다.
 *    기존 로컬 설정 키(`gh-radar:breakout-tone` 등)와 같은 네임스페이스라 기기 기억이 끊기지 않는다.
 * ② 최대 10개 · 최신이 앞 · 같은 코드는 한 번만(다시 고르면 맨 앞으로 옮긴다).
 * ③ 종목 코드·이름·시장만 싣는다 — 개인정보·토큰 없음(T-21-19).
 * ④ SSR · 저장소 차단 안전 — 읽기·쓰기 전부 `typeof window` 가드 + try/catch 로 안전 기본값에
 *    수렴하고 throw 하지 않는다. **저장 실패가 화면 동작을 막지 않는다**(breakout-list 관례).
 * ⑤ 조작된 값 방어(T-21-32) — 파싱 후 `code`/`name` 이 문자열인 원소만 남기고, 선택 필드도
 *    타입이 맞을 때만 옮긴다. 렌더는 React 문자열 이스케이프, 이동은 `/stocks/${code}` 템플릿.
 *    종목 코드는 6자리 대문자·숫자만(`RECENT_CODE_RE` · 읽기와 쓰기 둘 다) — `/stocks/${code}` 템플릿에
 *    `../me` · `x?y` 같은 경로 조작 문자가 들어가면 안 된다(IN-07). 최근 검색은 검색 결과(6자리)만
 *    저장하므로 좁혀도 잃는 항목이 없다.
 */

export const RECENT_SEARCH_KEY = 'gh-radar:recent-search';
export const RECENT_SEARCH_MAX = 10;
/** 종목 코드 형식 — 6자리 대문자·숫자(`005930` · `0000J0`). */
export const RECENT_CODE_RE = /^[0-9A-Z]{6}$/;

export interface RecentSearchItem {
  code: string;
  name: string;
  market?: string;
  at: number;
}

function sanitize(raw: unknown): RecentSearchItem | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.code !== 'string' || typeof r.name !== 'string') return null;
  if (!RECENT_CODE_RE.test(r.code)) return null;
  const item: RecentSearchItem = {
    code: r.code,
    name: r.name,
    at: typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : 0,
  };
  if (typeof r.market === 'string') item.market = r.market;
  return item;
}

function write(list: RecentSearchItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(list));
  } catch {
    // 저장 실패가 화면 동작을 막지 않는다.
  }
}

/** 최근 검색 읽기. 저장소가 막혔거나 JSON 이 깨졌으면 빈 배열이다. */
export function readRecentSearches(): RecentSearchItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCH_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RecentSearchItem[] = [];
    const seen = new Set<string>();
    for (const el of parsed) {
      const item = sanitize(el);
      if (item === null || seen.has(item.code)) continue;
      seen.add(item.code);
      out.push(item);
      if (out.length >= RECENT_SEARCH_MAX) break;
    }
    return out;
  } catch {
    // 저장소 차단·깨진 JSON 은 「기억 없음」이다.
    return [];
  }
}

/**
 * 맨 앞에 넣고(같은 코드는 옮김) 10개로 자른 목록을 저장·반환한다. 저장 실패여도 메모리 결과를 돌려준다.
 * 종목 코드 형식이 아니면 쓰지 않고 기존 목록을 돌려준다(IN-07 · throw 없음).
 */
export function pushRecentSearch(item: Omit<RecentSearchItem, 'at'>): RecentSearchItem[] {
  if (!RECENT_CODE_RE.test(item.code)) return readRecentSearches();
  const entry: RecentSearchItem = { code: item.code, name: item.name, at: Date.now() };
  if (typeof item.market === 'string') entry.market = item.market;
  const next = [entry, ...readRecentSearches().filter((i) => i.code !== item.code)].slice(
    0,
    RECENT_SEARCH_MAX,
  );
  write(next);
  return next;
}

/** 그 코드 한 건만 지운 목록을 저장·반환한다. */
export function removeRecentSearch(code: string): RecentSearchItem[] {
  const next = readRecentSearches().filter((i) => i.code !== code);
  write(next);
  return next;
}

/** 전체 삭제 — 키를 지운다. */
export function clearRecentSearches(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RECENT_SEARCH_KEY);
  } catch {
    // 저장 실패가 화면 동작을 막지 않는다.
  }
}
