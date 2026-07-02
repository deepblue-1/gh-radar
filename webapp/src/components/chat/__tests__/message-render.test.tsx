import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MessageAssistant } from '../message-assistant';
import { MessageUser } from '../message-user';
import { ChatThread } from '../chat-thread';

/**
 * Phase 14 Plan 09 — 챗 메시지 렌더 유닛테스트.
 * Task 1: MessageAssistant(마크다운 표/헤딩/리스트/강조 + 축약 면책) · MessageUser · ChatThread.
 * remark-gfm 표 렌더 검증이 핵심(D-09).
 */
describe('MessageAssistant (Task 1)', () => {
  it('Test 1 — 마크다운 표가 <table> 로 렌더 (remark-gfm)', () => {
    const md = '| 종목 | 등락 |\n| --- | --- |\n| 삼성전자 | +5% |';
    const { container } = render(<MessageAssistant content={md} />);
    expect(container.querySelector('table')).toBeInTheDocument();
    expect(container.querySelector('thead')).toBeInTheDocument();
    expect(screen.getByText('종목')).toBeInTheDocument();
    expect(screen.getByText('삼성전자')).toBeInTheDocument();
  });

  it('Test 2 — 헤딩/리스트/강조 렌더 + 답변 말미 축약 면책', () => {
    const md = '### 오늘 주도 테마\n\n- 반도체 장비\n- 이차전지\n\n**핵심**은 수급입니다.';
    const { container } = render(<MessageAssistant content={md} />);
    expect(container.querySelector('h3')).toBeInTheDocument();
    expect(container.querySelectorAll('li').length).toBe(2);
    expect(container.querySelector('strong')).toBeInTheDocument();
    // 축약 면책 문구(UI-SPEC Disclaimer 축약형)
    expect(screen.getByText(/투자자문이 아닙니다/)).toBeInTheDocument();
  });
});

describe('MessageUser (Task 1)', () => {
  it('Test 3 — 우측 정렬 버블 + content 텍스트 표시', () => {
    const { container } = render(<MessageUser content="지금 장중 속보 있어?" />);
    expect(screen.getByText('지금 장중 속보 있어?')).toBeInTheDocument();
    // 우측 정렬 래퍼
    expect((container.firstChild as HTMLElement).className).toContain(
      'justify-end',
    );
  });
});

describe('ChatThread (Task 1)', () => {
  it('Test 4 — user/assistant 순서 렌더 + 스트리밍 중 streamingText', () => {
    render(
      <ChatThread
        messages={[
          { id: '1', role: 'user', content: '오늘 주도 테마는?' },
          { id: '2', role: 'assistant', content: '반도체 장비입니다.' },
        ]}
        streamingText="실시간 검색 중"
        isStreaming
      />,
    );
    expect(screen.getByText('오늘 주도 테마는?')).toBeInTheDocument();
    expect(screen.getByText('반도체 장비입니다.')).toBeInTheDocument();
    // 스트리밍 중 마지막 assistant 에 streamingText 노출
    expect(screen.getByText('실시간 검색 중')).toBeInTheDocument();
  });
});
