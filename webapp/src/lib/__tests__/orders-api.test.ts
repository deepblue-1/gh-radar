import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { DmaOrderRow, RelayOrderMsg } from '@gh-radar/shared';

/**
 * quick-260910-jce Task 1 — orders-api 단위 테스트 (RELAY-02 / D-24).
 *
 * 세 계층을 잠근다:
 * 1. `fetchTodayOrders` — Bearer 부착 + **쿼리 문자열 없는** `/api/orders` + bare array 반환.
 *    `date` 를 브라우저가 조립하면 KST 계산이 두 벌이 되고 한쪽만 고쳐진다(서버가 정본).
 * 2. `mergeTodayOrders` — 복원 스냅샷 × 라이브 프레임 병합. **행을 만들지 않고 덮어쓰기만** 한다.
 * 3. `orderDisplayStatus` — 라이브 통보가 이기되 **체결수량을 지어내지 않는다**.
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
  fetchTodayOrders,
  mergeTodayOrders,
  orderDisplayStatus,
  type TodayOrderRow,
} from '../orders-api';

beforeEach(() => {
  apiFetchMock.mockReset();
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok-abc' } } });
});

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

function row(over: Partial<DmaOrderRow> = {}): DmaOrderRow {
  return {
    id: 'id-1',
    accountNo: '1234567801',
    isin: 'KR7005930003',
    stockCode: '005930',
    exchange: 'KRX',
    market: 'K',
    side: 'B',
    orderType: 'N',
    orgOrderNo: null,
    qty: 10,
    price: 70_000,
    orderNo: '0000135742',
    status: 'accepted',
    resultCode: 0,
    noticeType: 'A',
    message: null,
    filledQty: 0,
    origin: 'manual',
    createdAt: '2026-09-10T00:10:00.000Z',
    updatedAt: '2026-09-10T00:10:00.000Z',
    ...over,
  };
}

function frame(over: Partial<RelayOrderMsg> = {}): RelayOrderMsg {
  return {
    t: 'order',
    no: '0000135742',
    nt: 'A',
    rc: 0,
    msg: '',
    org: '',
    p: 70_000,
    q: 10,
    x: 'KRX',
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
// mergeTodayOrders
// ===========================================================================

describe('mergeTodayOrders', () => {
  it('같은 orderNo 의 복원 행과 라이브 프레임은 결과 행 1개로 접힌다', () => {
    const { rows, unmatchedOrderNos } = mergeTodayOrders([row()], [frame({ nt: 'E' })]);

    expect(rows).toHaveLength(1);
    expect(rows[0].live?.nt).toBe('E');
    expect(unmatchedOrderNos).toEqual([]);
  });

  it('같은 no 가 라이브에 여러 번 있으면 index 0(가장 최신) 프레임이 붙는다', () => {
    // use-relay-socket 은 `[frame, ...state.orders]` 로 **앞에 붙인다** — 앞이 최신이다.
    const live = [frame({ nt: 'C' }), frame({ nt: 'E' }), frame({ nt: 'A' })];

    const { rows } = mergeTodayOrders([row()], live);

    expect(rows).toHaveLength(1);
    expect(rows[0].live?.nt).toBe('C');
  });

  it('orderNo 가 null 인 복원 행은 어떤 프레임과도 합쳐지지 않는다', () => {
    const rejected = row({ id: 'id-x', orderNo: null, status: 'rejected' });

    const { rows } = mergeTodayOrders([rejected], [frame()]);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('id-x');
    expect(rows[0].live).toBeNull();
  });

  it('복원 목록에 없는 라이브 no 는 행을 만들지 않고 unmatched 로 보고된다', () => {
    const { rows, unmatchedOrderNos } = mergeTodayOrders(
      [row()],
      [frame({ no: '0000199999' }), frame()],
    );

    // 라이브 프레임에는 side·isin·accountNo 가 없다 — 행을 합성하면 매매구분 칸이 빈다.
    expect(rows).toHaveLength(1);
    expect(unmatchedOrderNos).toEqual(['0000199999']);
  });

  it('같은 unmatched no 가 여러 프레임에 있어도 한 번만 보고된다', () => {
    const { unmatchedOrderNos } = mergeTodayOrders(
      [],
      [frame({ no: '0000199999', nt: 'E' }), frame({ no: '0000199999', nt: 'A' })],
    );

    expect(unmatchedOrderNos).toEqual(['0000199999']);
  });

  it('정렬은 복원 순서(created_at DESC)를 그대로 보존한다', () => {
    const restored = [
      row({ id: 'a', orderNo: '0000000003' }),
      row({ id: 'b', orderNo: '0000000002' }),
      row({ id: 'c', orderNo: '0000000001' }),
    ];

    const { rows } = mergeTodayOrders(restored, [frame({ no: '0000000001' })]);

    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

// ===========================================================================
// orderDisplayStatus
// ===========================================================================

/** merge 를 거치지 않고 직접 조립한 표시 입력. */
function view(base: Partial<DmaOrderRow>, live: RelayOrderMsg | null): TodayOrderRow {
  return { ...row(base), live };
}

describe('orderDisplayStatus', () => {
  it('라이브 nt A/C/R 은 복원 status 를 이긴다', () => {
    expect(orderDisplayStatus(view({ status: 'requested' }, frame({ nt: 'A' }))).label).toBe('접수');
    expect(orderDisplayStatus(view({ status: 'accepted' }, frame({ nt: 'C' }))).label).toBe('취소');
    expect(orderDisplayStatus(view({ status: 'accepted' }, frame({ nt: 'R' }))).label).toBe('거부');
  });

  it('라이브 nt E 는 체결로 표시하되 전량/부분을 주장하지 않는다', () => {
    const shown = orderDisplayStatus(view({ status: 'accepted' }, frame({ nt: 'E' })));

    expect(shown.label).toBe('체결');
    // 프레임에 체결수량이 없다 — "전량"·"부분" 어느 쪽도 지어내지 않는다.
    expect(shown.label).not.toContain('전량');
    expect(shown.label).not.toContain('부분');
  });

  it('라이브가 없으면 복원 행의 status 를 그대로 쓴다', () => {
    expect(orderDisplayStatus(view({ status: 'partially_filled' }, null)).label).toBe('부분체결');
    expect(orderDisplayStatus(view({ status: 'cancelled' }, null)).label).toBe('취소');
    // timeout 은 "실패"가 아니라 "결과를 모름"이다 (Pitfall 9).
    expect(orderDisplayStatus(view({ status: 'timeout' }, null)).label).not.toContain('실패');
  });

  it('모르는 nt 는 라이브가 없는 것과 같게 다뤄 복원 status 로 수렴한다', () => {
    expect(orderDisplayStatus(view({ status: 'accepted' }, frame({ nt: 'Z' }))).label).toBe('접수');
  });
});
