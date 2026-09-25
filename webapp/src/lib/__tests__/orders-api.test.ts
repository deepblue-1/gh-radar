import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { JournalOrderRow } from '@gh-radar/shared';

/**
 * orders-api 단위 테스트 (RELAY-02 / D-24 → Phase 19 D-03).
 *
 * 세 계층을 잠근다:
 * 1. `fetchTodayOrders` — Bearer 부착 + **쿼리 문자열 없는** `/api/orders` + bare array 반환.
 *    `date` 를 브라우저가 조립하면 KST 계산이 두 벌이 되고 한쪽만 고쳐진다(서버가 정본).
 * 2. `mergeJournalRows` — REST 복원 × `journal.rows` 푸시 병합. 같은 `id` 는 `lastSeq` 가 큰
 *    쪽이 이기고(T-19-27), 오늘이 아닌 푸시 행은 받지 않으며, 푸시 행은 행을 **만든다**.
 * 3. `orderDisplayStatus` — DB 투영의 `status` 하나가 표시를 정한다(6종 라벨·톤 표).
 *
 * mock 하네스는 `chat-sse.test.ts`(supabase getSession) + `theme-api.test.ts`(vi.mock('../api'))
 * 를 그대로 따른다 — 새 하네스를 발명하지 않는다.
 */

// --- supabase 세션 mock (access_token 취득) -----------------------------------
const getSessionMock = vi.fn(async () => ({
  data: { session: { access_token: 'tok-abc' } as { access_token: string } | null },
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: () => getSessionMock() } }),
}));

// --- apiFetch mock — ApiClientError 는 **실물**을 그대로 쓴다 -------------------
const apiFetchMock = vi.fn();
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

import { ApiClientError } from '../api';
import {
  compareJournalNewestFirst,
  fetchTodayOrders,
  mergeJournalRows,
  orderDisplayStatus,
} from '../orders-api';

beforeEach(() => {
  apiFetchMock.mockReset();
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok-abc' } } });
});

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

const TODAY = '2026-09-25';

function row(over: Partial<JournalOrderRow> = {}): JournalOrderRow {
  return {
    id: 'id-1',
    tradeDate: TODAY,
    accountNo: '1234567801',
    isin: 'KR7005930003',
    stockCode: '005930',
    exchange: 'KRX',
    board: null,
    side: 'B',
    orderType: 'N',
    orgOrderNo: null,
    qty: 10,
    price: 70_000,
    orderNo: '0000135742',
    filledQty: 0,
    modifiedQty: 0,
    status: 'accepted',
    resultCode: 0,
    noticeType: 'A',
    message: null,
    origin: 'manual',
    requester: null,
    requestKind: null,
    lastSeq: 1,
    createdAt: '2026-09-25T00:10:00.000Z',
    updatedAt: '2026-09-25T00:10:00.000Z',
    ...over,
  };
}

// ===========================================================================
// fetchTodayOrders
// ===========================================================================

describe('fetchTodayOrders', () => {
  it('세션이 있으면 쿼리 문자열 없는 /api/orders 를 Bearer 로 호출한다', async () => {
    apiFetchMock.mockResolvedValue([]);

    await fetchTodayOrders();

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(path).toBe('/api/orders');
    // ★ `date` 를 브라우저가 붙이지 않는다 — KST 계산의 정본은 서버다.
    expect(path).not.toContain('?');
    expect(init.headers.Authorization).toBe('Bearer tok-abc');
  });

  it('세션이 없으면 서버 왕복 0회로 UNAUTHENTICATED 를 던진다', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    await expect(fetchTodayOrders()).rejects.toBeInstanceOf(ApiClientError);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('응답 bare array 를 언랩하지 않고 그대로 돌려준다', async () => {
    const payload = [row(), row({ id: 'id-2', orderNo: '0000135743' })];
    apiFetchMock.mockResolvedValue(payload);

    await expect(fetchTodayOrders()).resolves.toEqual(payload);
  });
});

// ===========================================================================
// mergeJournalRows (Phase 19 D-03)
// ===========================================================================

describe('mergeJournalRows', () => {
  it('같은 id 는 lastSeq 가 큰 쪽이 이긴다 — 복원 3 · 푸시 5 → 푸시', () => {
    const merged = mergeJournalRows(
      [row({ id: 'x', lastSeq: 3, status: 'accepted' })],
      [row({ id: 'x', lastSeq: 5, status: 'filled' })],
      TODAY,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.lastSeq).toBe(5);
    expect(merged[0]?.status).toBe('filled');
  });

  it('푸시가 더 옛것이면(복원 5 · 푸시 3) 복원이 남는다 — 표시 역전 금지 (T-19-27)', () => {
    const merged = mergeJournalRows(
      [row({ id: 'x', lastSeq: 5, status: 'filled' })],
      [row({ id: 'x', lastSeq: 3, status: 'accepted' })],
      TODAY,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe('filled');
  });

  it('lastSeq 가 같으면 복원을 유지한다(같은 사실 — 교체할 이유가 없다)', () => {
    const restored = row({ id: 'x', lastSeq: 4 });
    const merged = mergeJournalRows([restored], [row({ id: 'x', lastSeq: 4 })], TODAY);
    expect(merged[0]).toBe(restored);
  });

  it('복원에 없는 오늘 푸시 행은 행을 **만든다** — 푸시 행은 완전한 행이다', () => {
    const merged = mergeJournalRows([], [row({ id: 'y', side: 'S' })], TODAY);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('y');
    expect(merged[0]?.side).toBe('S');
  });

  it('오늘이 아닌 푸시 행은 받지 않는다 — 자정을 넘긴 탭이 어제 행을 섞지 않게', () => {
    const merged = mergeJournalRows(
      [row({ id: 'a' })],
      [row({ id: 'old', tradeDate: '2026-09-24' }), row({ id: 'a', lastSeq: 9, tradeDate: '2026-09-24' })],
      TODAY,
    );

    expect(merged.map((r) => r.id)).toEqual(['a']);
    // 어제 날짜로 온 같은 id 도 오늘 행을 덮지 않는다.
    expect(merged[0]?.lastSeq).toBe(1);
  });

  it('정렬은 createdAt 내림차순 — 동률은 lastSeq 내림차순', () => {
    const merged = mergeJournalRows(
      [
        row({ id: 'old', createdAt: '2026-09-25T00:00:00.000Z' }),
        row({ id: 'tieLow', createdAt: '2026-09-25T00:05:00.000Z', lastSeq: 2 }),
      ],
      [
        row({ id: 'new', createdAt: '2026-09-25T00:09:00.000Z' }),
        row({ id: 'tieHigh', createdAt: '2026-09-25T00:05:00.000Z', lastSeq: 7 }),
      ],
      TODAY,
    );

    expect(merged.map((r) => r.id)).toEqual(['new', 'tieHigh', 'tieLow', 'old']);
  });

  it('정렬은 시각 **값**으로 한다 — `Z` 와 `+00:00` 표기가 섞여도 순서가 갈리지 않는다', () => {
    const a = row({ id: 'a', createdAt: '2026-09-25T00:10:00.000+00:00' });
    const b = row({ id: 'b', createdAt: '2026-09-25T00:09:59.000Z' });
    expect([b, a].sort(compareJournalNewestFirst).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('입력 배열을 바꾸지 않는다(순수 함수)', () => {
    const restored = [row({ id: 'a' })];
    const pushed = [row({ id: 'a', lastSeq: 2 })];
    mergeJournalRows(restored, pushed, TODAY);
    expect(restored[0]?.lastSeq).toBe(1);
    expect(pushed).toHaveLength(1);
  });
});

// ===========================================================================
// orderDisplayStatus — DB 투영 status 하나 (Phase 19 D-03)
// ===========================================================================

describe('orderDisplayStatus', () => {
  it('status 6종을 라벨·톤 표 그대로 옮긴다', () => {
    expect(orderDisplayStatus(row({ status: 'accepted' }))).toEqual({ label: '접수', tone: 'normal' });
    expect(orderDisplayStatus(row({ status: 'partially_filled' }))).toEqual({
      label: '부분체결',
      tone: 'normal',
    });
    expect(orderDisplayStatus(row({ status: 'filled' }))).toEqual({ label: '체결', tone: 'normal' });
    expect(orderDisplayStatus(row({ status: 'cancelled' }))).toEqual({ label: '취소', tone: 'muted' });
    expect(orderDisplayStatus(row({ status: 'rejected' }))).toEqual({ label: '거부', tone: 'danger' });
    expect(orderDisplayStatus(row({ status: 'modified' }))).toEqual({ label: '정정', tone: 'muted' });
  });

  it('모르는 status 는 지어내지 않고 원문을 muted 로 보인다', () => {
    const unknown = row({ status: 'mystery' as unknown as JournalOrderRow['status'] });
    expect(orderDisplayStatus(unknown)).toEqual({ label: 'mystery', tone: 'muted' });
  });

  it('통보 원문(noticeType)은 표시 상태를 바꾸지 않는다 — status 하나가 정본', () => {
    // 옛 라이브 join 은 통보 1자로 상태를 덮었다. 이제 진행 단계는 DB 투영이 이미 단조다.
    expect(orderDisplayStatus(row({ status: 'filled', noticeType: 'A' })).label).toBe('체결');
    expect(orderDisplayStatus(row({ status: 'accepted', noticeType: 'C' })).label).toBe('접수');
  });
});
