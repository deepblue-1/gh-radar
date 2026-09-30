import { describe, expect, it } from 'vitest';
import { RELAY_STATE_LABELS } from '@gh-radar/shared';
import type { RelayQuoteStateMsg, RelaySubLimitMsg } from '@gh-radar/shared';

import { orderPillOf, quotePillOf } from '@/lib/quote-state';

/**
 * Phase 26 Plan 14 Task 1 — 배지 2축 판정 (D-01 · D-04 · 26-13 채택안 안 B).
 *
 * 잠그는 것 (목업 `reference/quote-badge-mockup.html` 머리 「26-14 정본 목록」):
 *   - 시세 모름(`quoteState === null`) → 필 없음(null). 거짓 확정 금지.
 *   - live → 「● 시세」 — 보이는 상태어 없음 · 톤 ok.
 *   - down + since → 「● 시세 HH:MM:SS~ 멈춤」(KST) · 톤 down.
 *   - down + since 없음 · 파싱 불가 → 「● 시세 멈춤」 — 임의 문자열을 그대로 그리지 않는다(T-26-25).
 *   - 구독 한도는 칩이 아니라 시세 필 title 한 줄(scope user / global 구분). 없으면 title 없음.
 *   - 주문 필: ready → 「● 주문」(상태어 없음) · 그 밖은 RELAY_STATE_LABELS 문구 · 진행 상태만 점멸.
 */

const live: RelayQuoteStateMsg = { t: 'quote.state', s: 'live' };
const down = (since?: string): RelayQuoteStateMsg =>
  since === undefined ? { t: 'quote.state', s: 'down' } : { t: 'quote.state', s: 'down', since };
const limit = (scope: 'user' | 'global'): RelaySubLimitMsg => ({
  t: 'sub.limit',
  i: 'KR7123450002',
  x: 'KRX',
  scope,
});

describe('quotePillOf — 시세 필 판정', () => {
  it('quoteState 가 null(모름)이면 필이 없다 — 구독 한도가 있어도 마찬가지', () => {
    expect(quotePillOf(null, null)).toBeNull();
    expect(quotePillOf(null, limit('user'))).toBeNull();
  });

  it('live → 톤 ok · 접두 「시세」 · 보이는 상태어 없음 · 스크린리더에는 「실시간」', () => {
    const pill = quotePillOf(live, null);
    expect(pill).toEqual({
      tone: 'ok',
      label: '시세',
      detail: null,
      srDetail: RELAY_STATE_LABELS.ready,
      title: null,
    });
  });

  it('down + since → KST 「HH:MM:SS~ 멈춤」 · 톤 down', () => {
    const pill = quotePillOf(down('2026-09-30T00:41:52.000Z'), null);
    expect(pill?.tone).toBe('down');
    expect(pill?.label).toBe('시세');
    expect(pill?.detail).toBe('09:41:52~ 멈춤');
    expect(pill?.srDetail).toBeNull();
  });

  it.each([undefined, '', 'not-a-date', '2026-13-99T99:99:99Z'])(
    'down + since=%s(없음 · 파싱 불가) → 시각 없는 「멈춤」 — 「—」 로 위장하지 않는다',
    (since) => {
      const pill = quotePillOf(down(since), null);
      expect(pill?.tone).toBe('down');
      expect(pill?.detail).toBe('멈춤');
      expect(pill?.detail).not.toContain('—');
      if (since !== undefined && since !== '') expect(pill?.detail).not.toContain(since);
    },
  );

  it('구독 한도 scope user → title 에 채택 문구(종목명 · 코드 · 거래소)', () => {
    const pill = quotePillOf(live, limit('user'), { name: '○○바이오', code: '123450' });
    expect(pill?.title).toBe(
      '구독 한도 — 내 구독 종목이 200개에 닿아 ○○바이오(123450 · KRX) 시세를 받지 못했어요. 쓰지 않는 카드를 닫으면 다시 받을 수 있어요.',
    );
    // 칩은 없다 — 보이는 상태어는 그대로다.
    expect(pill?.detail).toBeNull();
  });

  it('구독 한도 scope global → 전체 2000종목 문구', () => {
    const pill = quotePillOf(down('2026-09-30T00:41:52.000Z'), limit('global'), {
      name: '○○바이오',
      code: '123450',
    });
    expect(pill?.title).toBe(
      '구독 한도 — 시세 공유 연결이 전체 2000종목에 닿아 ○○바이오(123450 · KRX) 시세를 받지 못했어요.',
    );
    expect(pill?.tone).toBe('down');
  });

  it('종목명을 모르면 이름 자리에 ISIN 원문 — 지어내지 않는다', () => {
    expect(quotePillOf(live, limit('user'))?.title).toContain('KR7123450002(KRX) 시세를');
    expect(quotePillOf(live, limit('user'), { name: '○○바이오' })?.title).toContain('○○바이오(KRX) 시세를');
  });
});

describe('orderPillOf — 주문 필 판정', () => {
  it('ready → 톤 ok · 접두 「주문」 · 보이는 상태어 없음 · 점멸 없음', () => {
    expect(orderPillOf('ready', RELAY_STATE_LABELS.ready)).toEqual({
      tone: 'ok',
      label: '주문',
      detail: null,
      srDetail: RELAY_STATE_LABELS.ready,
      pulse: false,
    });
  });

  it('idle 첫 페인트(빈 라벨) → 「서버 연결 중…」 상수 · 점멸', () => {
    const pill = orderPillOf('idle', '');
    expect(pill.tone).toBe('off');
    expect(pill.detail).toBe(RELAY_STATE_LABELS.connecting);
    expect(pill.pulse).toBe(true);
  });

  it('reconnecting → 받은 라벨 그대로 · 점멸 없음 / logging_in → 점멸', () => {
    expect(orderPillOf('reconnecting', '재접속 중')).toMatchObject({ tone: 'off', detail: '재접속 중', pulse: false });
    expect(orderPillOf('logging_in', RELAY_STATE_LABELS.logging_in)).toMatchObject({ tone: 'off', pulse: true });
  });
});
