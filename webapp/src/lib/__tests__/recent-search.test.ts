import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RECENT_SEARCH_KEY,
  RECENT_SEARCH_MAX,
  clearRecentSearches,
  pushRecentSearch,
  readRecentSearches,
  removeRecentSearch,
} from '../recent-search';

/**
 * Phase 21 Plan 08 Task 1 — `/search` 최근 검색 (D-07a).
 *
 * 잠그는 명제:
 *  ① 키 `gh-radar:recent-search` · 최대 10
 *  ② 깨진 JSON · 배열 아님 · code/name 이 문자열이 아닌 원소는 버린다(T-21-32)
 *  ③ push = 최신 앞 · 같은 코드 중복 없음 · 11개째에 가장 오래된 것이 빠진다
 *  ④ 저장소가 throw 해도 throw 하지 않는다(저장 실패가 화면을 막지 않는다)
 */

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('recent-search', () => {
  it('키와 최대 개수가 D-07a 값이다', () => {
    expect(RECENT_SEARCH_KEY).toBe('gh-radar:recent-search');
    expect(RECENT_SEARCH_MAX).toBe(10);
  });

  it('빈 저장소는 빈 배열이다', () => {
    expect(readRecentSearches()).toEqual([]);
  });

  it('깨진 JSON · 배열 아님 → 빈 배열', () => {
    window.localStorage.setItem(RECENT_SEARCH_KEY, '{not json');
    expect(readRecentSearches()).toEqual([]);
    window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify({ code: '005930' }));
    expect(readRecentSearches()).toEqual([]);
  });

  it('code/name 이 문자열이 아닌 원소는 버린다', () => {
    window.localStorage.setItem(
      RECENT_SEARCH_KEY,
      JSON.stringify([
        { code: '005930', name: '삼성전자', market: 'KOSPI', at: 2 },
        { code: 5930, name: '숫자코드', at: 1 },
        { code: '000660' },
        null,
        'str',
        { code: '035420', name: 'NAVER', market: 3, at: 'x' },
      ]),
    );
    const list = readRecentSearches();
    expect(list.map((i) => i.code)).toEqual(['005930', '035420']);
    // 잘못된 market·at 은 필드만 걸러진다
    expect(list[1]).toEqual({ code: '035420', name: 'NAVER', at: 0 });
  });

  it('push → 첫 원소가 그 종목, at 은 Date.now()', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const list = pushRecentSearch({ code: '005930', name: '삼성전자', market: 'KOSPI' });
    expect(list[0]).toEqual({ code: '005930', name: '삼성전자', market: 'KOSPI', at: 1_700_000_000_000 });
    expect(readRecentSearches()).toEqual(list);
  });

  it('같은 코드를 다시 push → 중복 없이 맨 앞으로', () => {
    pushRecentSearch({ code: '005930', name: '삼성전자' });
    pushRecentSearch({ code: '000660', name: 'SK하이닉스' });
    const list = pushRecentSearch({ code: '005930', name: '삼성전자' });
    expect(list.map((i) => i.code)).toEqual(['005930', '000660']);
  });

  it('11개 push → 10개만, 가장 오래된 것이 빠진다', () => {
    for (let i = 0; i < 11; i += 1) {
      pushRecentSearch({ code: String(i).padStart(6, '0'), name: `종목${i}` });
    }
    const list = readRecentSearches();
    expect(list).toHaveLength(RECENT_SEARCH_MAX);
    expect(list[0]!.code).toBe('000010');
    expect(list.some((i) => i.code === '000000')).toBe(false);
  });

  it('remove → 그 항목만 제거 · clear → 키 삭제', () => {
    pushRecentSearch({ code: '005930', name: '삼성전자' });
    pushRecentSearch({ code: '000660', name: 'SK하이닉스' });
    const after = removeRecentSearch('005930');
    expect(after.map((i) => i.code)).toEqual(['000660']);
    expect(readRecentSearches().map((i) => i.code)).toEqual(['000660']);
    clearRecentSearches();
    expect(window.localStorage.getItem(RECENT_SEARCH_KEY)).toBeNull();
    expect(readRecentSearches()).toEqual([]);
  });

  it('setItem 이 throw 해도 push 는 throw 하지 않고 메모리 결과를 돌려준다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    let list: ReturnType<typeof pushRecentSearch> = [];
    expect(() => {
      list = pushRecentSearch({ code: '005930', name: '삼성전자' });
    }).not.toThrow();
    expect(list.map((i) => i.code)).toEqual(['005930']);
  });

  it('getItem · removeItem 이 throw 해도 읽기·삭제가 throw 하지 않는다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readRecentSearches()).toEqual([]);
    expect(() => removeRecentSearch('005930')).not.toThrow();
    expect(() => clearRecentSearches()).not.toThrow();
  });
});
