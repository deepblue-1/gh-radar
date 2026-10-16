import { describe, expect, it } from 'vitest';

import {
  accountChipLabelOf,
  accountFullLabelOf,
  accountLabelOf,
  accountShortLabelOf,
} from '../account-label';

/**
 * Phase 32 D-12 · S11 — 계좌 라벨 한 벌. 작업대 셀렉트 · /me 칩 · 토스트 · 사이드바가 같은 글자를 읽는다.
 * 빈 칸은 구분자 꼬리 없이 생략하고(S11 loading), 함수는 자르지 않는다(S11 overflow — CSS 몫).
 */
describe('P32 계좌 라벨 한 벌 (D-12 · S11)', () => {
  it('전체 라벨 = 「번호 · 상품명 · 서버키」', () => {
    expect(accountFullLabelOf({ accountNo: '1234-5678', name: '김알렉스', serverKey: 'KB120' })).toBe(
      '1234-5678 · 김알렉스 · KB120',
    );
  });

  it('전체 라벨 — 상품명 없음은 「번호 · 서버키」(꼬리 없음)', () => {
    expect(accountFullLabelOf({ accountNo: '8765-4321', serverKey: 'KYOBO119' })).toBe('8765-4321 · KYOBO119');
  });

  it('전체 라벨 — 상품명 · 서버키 둘 다 없으면 번호만', () => {
    expect(accountFullLabelOf({ accountNo: '5555-0001' })).toBe('5555-0001');
  });

  it('전체 라벨 — 빈 문자열 상품명 · 서버키도 생략', () => {
    expect(accountFullLabelOf({ accountNo: '5555-0001', name: '', serverKey: '' })).toBe('5555-0001');
    expect(accountFullLabelOf({ accountNo: '5555-0001', name: '', serverKey: 'KB121' })).toBe('5555-0001 · KB121');
  });

  it('전체 라벨 — 최악값 길이도 자르지 않는다(S11 long-text)', () => {
    const label = accountFullLabelOf({
      accountNo: '123456789012',
      name: '가'.repeat(15),
      serverKey: 'KYOBO127',
    });
    expect(label).toBe(`123456789012 · ${'가'.repeat(15)} · KYOBO127`);
  });

  it('칩 라벨 = 「상품명 번호 서버키」', () => {
    expect(accountChipLabelOf({ accountNo: '1234-5678', name: '김알렉스', serverKey: 'KB120' })).toBe(
      '김알렉스 1234-5678 KB120',
    );
  });

  it('칩 라벨 — 서버키 없음은 「상품명 번호」', () => {
    expect(accountChipLabelOf({ accountNo: '1234-5678', name: '위탁종합' })).toBe('위탁종합 1234-5678');
  });

  it('칩 라벨 — 상품명 없음은 「번호 서버키」 · 둘 다 없으면 번호만', () => {
    expect(accountChipLabelOf({ accountNo: '8765-4321', name: '', serverKey: 'KYOBO119' })).toBe('8765-4321 KYOBO119');
    expect(accountChipLabelOf({ accountNo: '5555-0001', name: '' })).toBe('5555-0001');
  });

  it('짧은 라벨 — 상품명이 있고 겹치지 않으면 상품명', () => {
    const a = { accountNo: 'A', name: '위탁종합', serverKey: 'KB120' };
    const b = { accountNo: 'B', name: '위탁CMA', serverKey: 'KB120' };
    expect(accountShortLabelOf(a, [a, b])).toEqual({ text: '위탁종합', isNumber: false });
  });

  it('짧은 라벨 — 상품명 빈칸이면 번호', () => {
    const a = { accountNo: 'A', name: '' };
    expect(accountShortLabelOf(a, [a])).toEqual({ text: 'A', isNumber: true });
    expect(accountShortLabelOf({ accountNo: 'A' }, [])).toEqual({ text: 'A', isNumber: true });
  });

  it('짧은 라벨 — 같은 상품명 · 같은 서버키 형제가 있으면 번호', () => {
    const a = { accountNo: 'A', name: '위탁종합', serverKey: 'KB120' };
    const b = { accountNo: 'B', name: '위탁종합', serverKey: 'KB120' };
    expect(accountShortLabelOf(a, [a, b])).toEqual({ text: 'A', isNumber: true });
    expect(accountShortLabelOf(b, [a, b])).toEqual({ text: 'B', isNumber: true });
  });

  it('짧은 라벨 — 같은 상품명이어도 서버키가 다르면 상품명', () => {
    const a = { accountNo: 'A', name: '위탁종합', serverKey: 'KB120' };
    const b = { accountNo: 'B', name: '위탁종합', serverKey: 'KYOBO119' };
    expect(accountShortLabelOf(a, [a, b])).toEqual({ text: '위탁종합', isNumber: false });
  });

  it('기존 accountLabelOf(h76 계약)는 바뀌지 않는다', () => {
    expect(accountLabelOf('1234567801', '위탁종합')).toBe('1234567801 · 위탁종합');
    expect(accountLabelOf('1234567801', '')).toBe('1234567801');
    expect(accountLabelOf('1234567801')).toBe('1234567801');
  });
});
