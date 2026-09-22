import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useViServerError } from '../use-vi-server-error';
import type { RelayServerMessageEntry } from '../use-relay-socket';

/**
 * 작업대의 VI 몫 서버 거부 1건 (18-13 이관 — 옛 `vi-client.test.tsx` ② · e2e `trading-vi` 10).
 *
 * 옛 VI 화면은 상태줄에 VI 몫 거부를 `role="alert"` 로 세웠다. 18-11 작업대는 그 자리를 만들지 않아
 * VI 설정 거부(예: 「VI 주문금액이 0 입니다」)가 화면 어디에도 서지 않았다 — 18-05 가 「서버 메시지 원문
 * 표시는 작업대 몫」으로 넘긴 것이 빠진 채였다. 판정은 `isViServerMessage` **하나**다(Pitfall 9).
 */

const ACCOUNT = '37728502101';

function msg(
  src: string,
  m: string,
  over: { i?: string; lv?: string } = {},
): RelayServerMessageEntry {
  return {
    t: 'msg',
    lv: over.lv ?? 'ERROR',
    i: over.i ?? '',
    a: ACCOUNT,
    src,
    kind: '',
    m,
    receivedAt: '13:42:05',
  } as RelayServerMessageEntry;
}

/** relay 는 최신을 index 0 에 둔다. */
function run(messages: RelayServerMessageEntry[]) {
  return renderHook(({ list }) => useViServerError(list), { initialProps: { list: messages } });
}

describe('useViServerError — VI 몫 ERROR 만 (Pitfall 9)', () => {
  it('`VITrigger` · `SetVITrigger` · 종목 없는 `Account` ERROR 는 원문과 출처를 따로 돌려준다', () => {
    expect(run([msg('VITrigger', '상승률 조건 미달로 건너뜀')]).result.current).toEqual({
      text: '상승률 조건 미달로 건너뜀',
      src: 'VITrigger',
    });
    expect(run([msg('SetVITrigger', 'VI 주문금액이 0 입니다')]).result.current?.src).toBe('SetVITrigger');
    expect(run([msg('Account', 'VI 주문금액이 0 입니다')]).result.current?.src).toBe('Account');
  });

  it('상따 몫(`LimitChaser` · 종목 붙은 `Account`)과 relay 자기 거부는 먹지 않는다', () => {
    expect(run([msg('LimitChaser', '상따 매수 조건 미달')]).result.current).toBeNull();
    expect(run([msg('Account', '주문 가능 금액이 부족합니다', { i: 'KR7005930003' })]).result.current).toBeNull();
    expect(run([msg('Relay', '요청 형식이 올바르지 않습니다')]).result.current).toBeNull();
  });

  it('ERROR 가 아닌 VI 통지는 경보가 아니다', () => {
    expect(run([msg('VITrigger', '가동을 시작했어요', { lv: 'INFO' })]).result.current).toBeNull();
  });

  it('새 VI 거부가 오면 최신 1건으로 바뀌고, 뒤이어 온 남의 통지는 그것을 지우지 않는다', () => {
    const first = msg('SetVITrigger', '첫 거부');
    const view = run([first]);
    expect(view.result.current?.text).toBe('첫 거부');

    const second = msg('Account', '두 번째 거부');
    view.rerender({ list: [second, first] });
    expect(view.result.current?.text).toBe('두 번째 거부');

    view.rerender({ list: [msg('LimitChaser', '상따 몫'), second, first] });
    expect(view.result.current?.text).toBe('두 번째 거부');
  });
});
