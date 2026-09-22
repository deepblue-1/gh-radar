import { describe, expect, it } from 'vitest';

/**
 * Phase 16 Plan 14 Task 1 — VI 공용 순수 유틸 (TRADE-02).
 *
 * 여기서 잠그는 것은 **한 곳이 틀리면 금액·몫이 통째로 어긋나는** 계약이다:
 *   - 만원↔원 변환 (한 자리 틀리면 1만 배 주문)
 *   - `ServerMessage` VI 몫 판정이 상따 판정을 **재사용**하고 relay 자기 거부를 먹지 않는다
 *
 * 브라우저 알림 부분(해제 시각 파싱 · 알림 시각 · 로컬 설정 · 권한/통지)은 기능째 제거돼
 * 그 테스트도 함께 지웠다 (quick-260922-tqr).
 */

import { isViServerMessage, krwToManwon, manwonToKrw } from '../vi-alert';

describe('금액 단위 변환 — 만원 ↔ 원', () => {
  it('만원 → 원은 정확히 10,000 배다', () => {
    expect(manwonToKrw(1_000)).toBe(10_000_000);
    expect(manwonToKrw(0)).toBe(0);
    expect(manwonToKrw(1)).toBe(10_000);
  });

  it('원 → 만원은 내림이다 — 올리면 재전송 때 금액이 늘어난다', () => {
    expect(krwToManwon(10_000_000)).toBe(1_000);
    expect(krwToManwon(19_999)).toBe(1);
    expect(krwToManwon(9_999)).toBe(0);
  });

  it('왕복해도 만원 단위 값은 보존된다', () => {
    for (const manwon of [0, 1, 22, 1_000, 12_345]) {
      expect(krwToManwon(manwonToKrw(manwon))).toBe(manwon);
    }
  });
});

describe('isViServerMessage — 통지 몫 판정 (Pitfall 9)', () => {
  const msg = (src: string, i: string) => ({ src, i });

  it('`SetVITrigger` 는 VI 몫이다', () => {
    expect(isViServerMessage(msg('SetVITrigger', ''))).toBe(true);
    expect(isViServerMessage(msg('SetVITrigger', 'KR7005930003'))).toBe(true);
  });

  it('★ `VITrigger` 런타임 사유 줄도 VI 몫이다 (17-06 / D-09)', () => {
    /*
      17-01 이 `src` 어휘에 더한 값이다. 여기 없으면 서버가 VI 런타임 사유를 보내도
      **VI 화면이 한 글자도 그리지 않는다** — 어휘만 늘고 소비처가 없는 상태였다.
    */
    expect(isViServerMessage(msg('VITrigger', ''))).toBe(true);
    expect(isViServerMessage(msg('VITrigger', 'KR7005930003'))).toBe(true);
  });

  it('★ 대응하는 상따 값 `LimitChaser` 는 **여전히** VI 몫이 아니다 (Pitfall 9)', () => {
    // 배지 어휘가 늘었다고 남의 거부를 끌어오면 사용자는 멀쩡한 VI 를 껐다 켠다.
    expect(isViServerMessage(msg('LimitChaser', ''))).toBe(false);
  });

  it('종목 없는 `Account` 통지는 VI 몫이다', () => {
    expect(isViServerMessage(msg('Account', ''))).toBe(true);
  });

  it('종목 붙은 `Account` 통지는 상따 몫이라 VI 가 먹지 않는다', () => {
    expect(isViServerMessage(msg('Account', 'KR7005930003'))).toBe(false);
  });

  it('`SetLimitChaser` 는 VI 몫이 아니다', () => {
    expect(isViServerMessage(msg('SetLimitChaser', ''))).toBe(false);
  });

  it('★ relay 자기 거부(`Relay`)를 VI 통지로 읽지 않는다', () => {
    // 이걸 먹으면 상따 요청의 형식 오류가 「내 자동매수가 거부됐다」로 그려진다.
    expect(isViServerMessage(msg('Relay', ''))).toBe(false);
    expect(isViServerMessage(msg('System', ''))).toBe(false);
  });
});
