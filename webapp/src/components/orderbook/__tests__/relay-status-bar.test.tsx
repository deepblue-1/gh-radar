import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

/**
 * Phase 15 Plan 12 Task 3 — 연결 상태 바 · 스켈레톤 단위 테스트.
 *
 * 증명 대상:
 *  - D-36  배지 라벨이 `RELAY_STATE_LABELS` 단일 정본과 일치 (8상태 + idle)
 *  - UI-SPEC §Copywriting  `계좌 N개` · `재접속 중 k/10` 수치 반영
 *  - UI-SPEC C3  알림 최근 3건 · 빈 상태 `알림이 없어요`
 *  - T-15-43  상태 표면에 **방향색(상승·하락 시맨틱 토큰)이 한 글자도 없음**
 *  - UI-SPEC §접근성  상태 바 `aria-live="polite"`, 스켈레톤 `aria-busy="true"`
 */

import { RELAY_STATE_LABELS } from '@gh-radar/shared';
import type { RelaySessionState } from '@gh-radar/shared';
import { RelayStatusBar } from '../relay-status-bar';
import { OrderbookSkeleton } from '../orderbook-skeleton';
import type { RelayServerMessageEntry } from '@/lib/use-relay-socket';

function msg(
  overrides: Partial<RelayServerMessageEntry> & { m: string; receivedAt: string },
): RelayServerMessageEntry {
  return {
    t: 'msg',
    lv: 'INFO',
    i: '',
    a: '',
    src: 'System',
    kind: '',
    ...overrides,
  };
}

const ALL_STATES: RelaySessionState[] = [
  'connecting',
  'logging_in',
  'declaring',
  'ready',
  'reconnecting',
  'manual_required',
  'failed',
  'session_rejected',
  'unauthorized',
];

describe('RelayStatusBar', () => {
  it('① 모든 세션 상태의 배지 라벨이 RELAY_STATE_LABELS 와 일치한다 (D-36)', () => {
    for (const status of ALL_STATES) {
      const { unmount, container } = render(
        <RelayStatusBar status={status} attempt={3} accounts={[]} messages={[]} />,
      );
      const badge = container.querySelector('[data-slot="badge"]');
      expect(badge, `${status} 배지가 없다`).not.toBeNull();
      // ready/reconnecting 은 수치를 덧붙이므로 정본 라벨을 **포함**해야 한다.
      expect(badge?.textContent, `${status} 라벨 불일치`).toContain(RELAY_STATE_LABELS[status]);
      unmount();
    }
  });

  it('② ready 배지에 계좌 수가 반영된다', () => {
    render(
      <RelayStatusBar
        status="ready"
        accounts={[
          { accountNo: '12345678-01', name: '위탁종합' },
          { accountNo: '12345678-02', name: 'CMA' },
        ]}
        messages={[]}
      />,
    );

    expect(screen.getByText(/실시간 · 계좌 2개/)).toBeInTheDocument();
    expect(screen.getByText('호가·체결·잔고가 실시간으로 갱신되고 있어요.')).toBeInTheDocument();
  });

  it('③ reconnecting 은 배지와 본문에 k/10 과 다음 재시도 초를 표시한다', () => {
    const { container } = render(
      <RelayStatusBar status="reconnecting" attempt={3} accounts={[]} messages={[]} />,
    );

    expect(container.querySelector('[data-slot="badge"]')?.textContent).toContain('재접속 중 3/10');
    // 백오프 3회차 = 4초 (1s→2s→4s)
    expect(
      screen.getByText(/연결이 끊겨 다시 연결하는 중이에요 · 3\/10회 \(다음 4초\)/),
    ).toBeInTheDocument();
    expect(screen.getByText('표시된 호가는 마지막으로 받은 값이에요.')).toBeInTheDocument();
  });

  it('④ ServerMessage 는 최근 3건만 렌더한다 (C3)', () => {
    const { container } = render(
      <RelayStatusBar
        status="ready"
        accounts={[]}
        messages={[
          msg({ m: '알림 5', receivedAt: '13:42:05' }),
          msg({ m: '알림 4', receivedAt: '13:41:02', lv: 'WARN' }),
          msg({ m: '알림 3', receivedAt: '13:39:55', lv: 'ERROR' }),
          msg({ m: '알림 2', receivedAt: '13:20:07' }),
          msg({ m: '알림 1', receivedAt: '13:10:00' }),
        ]}
      />,
    );

    const rows = container.querySelectorAll('[data-slot="relay-alert-row"]');
    expect(rows).toHaveLength(3);
    expect(screen.getByText('알림 5')).toBeInTheDocument();
    expect(screen.getByText('알림 3')).toBeInTheDocument();
    expect(screen.queryByText('알림 2')).toBeNull();
    // 레벨 칩은 한글 라벨로 옮긴다
    expect(screen.getByText('경고')).toBeInTheDocument();
    expect(screen.getByText('오류')).toBeInTheDocument();
    // 시각도 함께 노출된다
    expect(screen.getByText('13:42:05')).toBeInTheDocument();
  });

  it('⑤ 알림이 0건이면 빈 상태 한 줄을 보여준다', () => {
    const { container } = render(<RelayStatusBar status="ready" accounts={[]} messages={[]} />);

    expect(screen.getByText('알림이 없어요')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="relay-alert-row"]')).toHaveLength(0);
  });

  it('⑥ 상태 바 DOM 어디에도 방향색 토큰이 없다 (UI-SPEC 금지 목록)', () => {
    for (const status of ALL_STATES) {
      const { unmount, container } = render(
        <RelayStatusBar
          status={status}
          attempt={7}
          accounts={[{ accountNo: '12345678-01', name: '위탁종합' }]}
          messages={[msg({ m: '테스트 알림', receivedAt: '13:00:00', lv: 'ERROR' })]}
        />,
      );

      const html = container.innerHTML;
      // 사다리 의미색과 충돌하므로 상태 표면에서는 전면 금지다.
      expect(/--up\b/.test(html), `${status} 에 상승 방향색이 있다`).toBe(false);
      expect(/--down\b/.test(html), `${status} 에 하락 방향색이 있다`).toBe(false);
      unmount();
    }
  });

  it('⑦ 상태 줄과 알림 영역 모두 aria-live="polite" 다', () => {
    const { container } = render(<RelayStatusBar status="connecting" messages={[]} />);

    const liveRegions = container.querySelectorAll('[aria-live="polite"]');
    expect(liveRegions.length).toBe(2);
    // 중첩 live region 은 이중 안내를 만든다 — 형제여야 한다.
    expect(liveRegions[0]?.contains(liveRegions[1] as Node)).toBe(false);
  });

  it('⑧ 서버 보조 문구가 있으면 정적 보조 문구를 대체한다', () => {
    render(
      <RelayStatusBar status="session_rejected" statusMessage="비밀번호 오류 3회" messages={[]} />,
    );

    expect(screen.getByText('비밀번호 오류 3회')).toBeInTheDocument();
    expect(screen.queryByText('계정 상태를 확인한 뒤 페이지를 새로고침해 주세요.')).toBeNull();
  });

  /*
    17-08 Task 3 — 서버 메시지 출처 배지 (D-09 · D-17).

    ★ 판정은 `@gh-radar/shared` 의 `serverMsgBadge` **하나**만 쓴다. 상태 바 안에서 `src` 를
      직접 비교하면 어휘가 늘어날 때마다 두 곳이 갈린다 — 그래서 컴포넌트에 `src ===` 가
      0건이어야 하고, 이 테스트는 그 계약의 **행동 쪽**을 잠근다.
    ★ 배지는 **텍스트**다. 색만으로 출처를 가르면 WCAG 1.4.1 위반이고, 애초에 이 표면은
      방향색 전면 금지라 쓸 색도 없다.
  */
  it('⑫ 서버 메시지 줄에 출처 배지가 붙는다 — LimitChaser `[상따]` · VITrigger `[VI]` (D-17)', () => {
    const { container } = render(
      <RelayStatusBar
        status="ready"
        accounts={[]}
        messages={[
          msg({ m: '상따 사유 줄', receivedAt: '13:42:05', src: 'LimitChaser' }),
          msg({ m: 'VI 사유 줄', receivedAt: '13:42:04', src: 'VITrigger' }),
          msg({ m: '계좌 안내', receivedAt: '13:42:03', src: 'Account' }),
        ]}
      />,
    );

    const rows = Array.from(container.querySelectorAll('[data-slot="relay-alert-row"]'));
    expect(rows).toHaveLength(3);
    // 색이 아니라 **문자열**로 찾힌다.
    expect(within(rows[0] as HTMLElement).getByText('[상따]')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('[VI]')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('[서버]')).toBeInTheDocument();
  });

  it('⑬ `Account` · 빈 값 · 미상 출처는 전부 `[서버]` 로 떨어진다 (모르는 출처는 모른다고 말한다)', () => {
    const { container } = render(
      <RelayStatusBar
        status="ready"
        accounts={[]}
        messages={[
          msg({ m: '빈 출처', receivedAt: '13:00:03', src: '' }),
          // 서버가 어휘를 늘려도 부분일치로 `[상따]` 가 되면 안 된다.
          msg({ m: '미상 출처', receivedAt: '13:00:02', src: 'SetLimitChaserResp' }),
          msg({ m: '시스템', receivedAt: '13:00:01', src: 'System' }),
        ]}
      />,
    );

    const badges = Array.from(container.querySelectorAll('[data-slot="relay-alert-row"]')).map(
      (row) => within(row as HTMLElement).getByTestId('relay-alert-src').textContent,
    );
    expect(badges).toEqual(['[서버]', '[서버]', '[서버]']);
  });

  it('⑭ 메시지가 20건 쌓여도 상태 바는 최근 3건만 그린다 (기존 상한 유지 · Pitfall 12)', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      msg({
        m: `상따 사유 ${20 - i}`,
        receivedAt: `13:4${i % 10}:0${i % 10}`,
        src: 'LimitChaser',
      }),
    );
    const { container } = render(
      <RelayStatusBar status="ready" accounts={[]} messages={many} />,
    );

    expect(container.querySelectorAll('[data-slot="relay-alert-row"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-testid="relay-alert-src"]')).toHaveLength(3);
    expect(screen.getByText('상따 사유 20')).toBeInTheDocument();
    expect(screen.queryByText('상따 사유 17')).toBeNull();
  });

  it('⑪ unauthorized 본문은 연결 상태를 말하고 게이트 제목 문구를 반복하지 않는다 (이관 10)', () => {
    render(<RelayStatusBar status="unauthorized" messages={[]} />);

    // 상태 바는 "지금 연결이 어떤 상태인가" 만 말한다.
    expect(screen.getByText('실시간 연결을 시작하지 않았어요')).toBeInTheDocument();
    // 권한 없음의 이유를 설명하는 제목은 게이트 카드(stock-orderbook-section) 전용이다.
    expect(screen.queryByText('실시간 호가·주문 권한이 없어요')).toBeNull();
  });
});

describe('OrderbookSkeleton', () => {
  it('⑨ aria-busy 와 compact 밀도를 명시한다 (C14)', () => {
    const { container } = render(<OrderbookSkeleton />);

    const root = container.querySelector('[data-slot="orderbook-skeleton"]');
    expect(root?.getAttribute('aria-busy')).toBe('true');
    // 모바일 자동 comfortable 규칙을 피하려면 compact 명시가 필요하다
    expect(container.querySelectorAll('[data-density="compact"]').length).toBe(2);
    // 사다리 20행 + 헤더 1 / 테이프 8행 + 헤더 1 / 폼 5행 + 계좌 + 제출
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(37);
  });

  it('⑩ 스켈레톤에도 방향색 토큰이 없다 (로딩 표면은 전부 중립)', () => {
    const { container } = render(<OrderbookSkeleton />);
    expect(/--up\b/.test(container.innerHTML)).toBe(false);
    expect(/--down\b/.test(container.innerHTML)).toBe(false);
  });
});
