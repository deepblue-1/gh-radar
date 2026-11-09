import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MessageAssistant, linkifyTickPaths } from '../message-assistant';
import { MessageUser } from '../message-user';
import { ChatThread } from '../chat-thread';
import { AgentProgress } from '../agent-progress';
import { MiniStockCard } from '../mini-stock-card';
import { Citation } from '../citation';

/**
 * Phase 14 Plan 09 — 챗 메시지 렌더 유닛테스트.
 * Task 1: MessageAssistant(마크다운 표/헤딩/리스트/강조) · MessageUser · ChatThread.
 * remark-gfm 표 렌더 검증이 핵심(D-09).
 * 면책 문구는 사용자 결정(2026-07-02, 14-11 checkpoint)으로 제거 — 관련 assert 삭제.
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

  it('Test 2 — 헤딩/리스트/강조 렌더', () => {
    const md = '### 오늘 주도 테마\n\n- 반도체 장비\n- 이차전지\n\n**핵심**은 수급입니다.';
    const { container } = render(<MessageAssistant content={md} />);
    expect(container.querySelector('h3')).toBeInTheDocument();
    expect(container.querySelectorAll('li').length).toBe(2);
    expect(container.querySelector('strong')).toBeInTheDocument();
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

describe('AgentProgress (Task 2)', () => {
  it('Test 1 — 상태 map → done✓/active●/wait○ + SPECIALIST_LABELS 한글 라벨', () => {
    render(
      <AgentProgress
        status={{ quote: 'done', theme: 'active', news: 'wait' }}
      />,
    );
    // SPECIALIST_LABELS 한글 라벨
    expect(screen.getByText(/시세·수급 전문가/)).toBeInTheDocument();
    // active 스텝은 "{전문가} 분석 중…" copywriting
    expect(screen.getByText(/테마 전문가 분석 중…/)).toBeInTheDocument();
    expect(screen.getByText(/뉴스·심리 전문가/)).toBeInTheDocument();
    // 상태별 마커
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('●')).toBeInTheDocument();
  });
});

describe('Phase 39 주문 진단 (D-03 · D-04)', () => {
  it('AgentProgress diagnosis active → 「주문 진단 전문가 분석 중…」 · 다른 전문가와 함께면 맨 끝', () => {
    const { container } = render(
      <AgentProgress status={{ diagnosis: 'active', quote: 'done', websearch: 'done' }} />,
    );
    expect(screen.getByText('주문 진단 전문가 분석 중…')).toBeInTheDocument();
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(items).toHaveLength(3);
    expect(items[items.length - 1]).toContain('주문 진단 전문가');
  });

  it('진단문 「틱 보기」 /analytics/ticks? 링크 → 같은 탭(target 없음) · href 그대로', () => {
    const href = '/analytics/ticks?isin=KR7282720005&d=20261105&t=13:10:30.385';
    render(<MessageAssistant content={`근거: [틱 보기 ›](${href})`} />);
    const link = screen.getByRole('link', { name: '틱 보기 ›' });
    expect(link).toHaveAttribute('href', href);
    expect(link.getAttribute('target')).toBeNull();
  });

  it('맨 경로 「틱 보기: /analytics/ticks?…」 도 같은 탭 링크로 바뀐다(39 UAT) · 이미 링크인 주소는 그대로', () => {
    const href = '/analytics/ticks?isin=KR718064K016&d=20261106&t=12:08:43.124';
    render(<MessageAssistant content={`틱 보기: ${href}\n\n또 [틱 보기 ›](${href})`} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('틱 보기');
    for (const l of links) {
      expect(l).toHaveAttribute('href', href);
      expect(l.getAttribute('target')).toBeNull();
    }
    expect(screen.queryByText(/\/analytics\/ticks/)).toBeNull();
  });

  it('linkifyTickPaths — 주소는 백틱·**·|·한글 조사·끝 마침표 앞에서 멈추고, 코드 펜스·인라인 코드·<…> 링크 안은 건드리지 않는다(WR-02)', () => {
    const p = '/analytics/ticks?isin=KR7101360006&d=20261106&ex=NXT&t=12:23:12.254';
    const link = `[틱 보기](${p})`;
    expect(linkifyTickPaths(`**${p}**`)).toBe(`**${link}**`);
    expect(linkifyTickPaths(`| 12:23 | ${p}|`)).toBe(`| 12:23 | ${link}|`);
    expect(linkifyTickPaths(`${p}에서 확인`)).toBe(`${link}에서 확인`);
    expect(linkifyTickPaths(`근거 ${p}.`)).toBe(`근거 ${link}.`);
    expect(linkifyTickPaths(`(${p})`)).toBe(`(${link})`);
    // 인라인 코드 · 꺾쇠 목적지 링크 · 이미 있는 링크는 그대로
    expect(linkifyTickPaths(`\`${p}\``)).toBe(`\`${p}\``);
    expect(linkifyTickPaths(`[틱](<${p}>)`)).toBe(`[틱](<${p}>)`);
    expect(linkifyTickPaths(`[틱](${p}) 그리고 ${p}`)).toBe(`[틱](${p}) 그리고 ${link}`);
    // 펜스 코드 블록 안(서버 기록 원문)은 원문 그대로 · 펜스 뒤 본문은 링크
    const fenced = `\`\`\`server-log\n틱 보기: ${p}\n\`\`\`\n\n틱 보기: ${p}`;
    expect(linkifyTickPaths(fenced)).toBe(`\`\`\`server-log\n틱 보기: ${p}\n\`\`\`\n\n${link}`);
    // 닫히지 않은 펜스(스트리밍 중)는 끝까지 코드
    expect(linkifyTickPaths(`~~~\n${p}`)).toBe(`~~~\n${p}`);
  });

  it('```server-log 블록 안 틱 주소는 원문 글자 그대로 남는다(링크로 바뀌지 않음)', () => {
    const p = '/analytics/ticks?isin=KR718064K016&d=20261106&t=12:08:43.124';
    const { container } = render(<MessageAssistant content={`\`\`\`server-log\n틱 보기: ${p}\n\`\`\``} />);
    expect(container.querySelector('details pre')!.textContent).toBe(`틱 보기: ${p}`);
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('```server-log 블록은 「서버 기록 원문」 접힘(details)으로 · 원문 글자 그대로 · 다른 코드 블록은 그대로 <pre>', () => {
    const raw = '사유="B6Sell1 잔량(매수1호가==감시가 && 잔량<=임계)" · 임계 10566 · 실측 10298';
    const { container } = render(
      <MessageAssistant content={`**결론**\n\n\`\`\`server-log\n${raw}\n\`\`\`\n\n\`\`\`\nplain\n\`\`\``} />,
    );
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details!.hasAttribute('open')).toBe(false);
    expect(details!.querySelector('summary')).toHaveTextContent('서버 기록 원문');
    expect(details!.querySelector('pre')!.textContent).toBe(raw);
    expect(container.querySelectorAll('details')).toHaveLength(1);
    expect([...container.querySelectorAll('pre')].some((p) => p.textContent?.includes('plain') && !p.closest('details'))).toBe(true);
  });

  it('그 밖 내부 경로는 링크 없이 글자만 · 외부 https 는 새 탭 + noreferrer(현행)', () => {
    render(<MessageAssistant content={'[x](/admin/users) 그리고 [y](https://example.com)'} />);
    expect(screen.queryByRole('link', { name: 'x' })).toBeNull();
    expect(screen.getByText('x').closest('a')).toBeNull();
    const ext = screen.getByRole('link', { name: 'y' });
    expect(ext).toHaveAttribute('href', 'https://example.com');
    expect(ext).toHaveAttribute('target', '_blank');
    expect(ext).toHaveAttribute('rel', 'noreferrer');
  });

  it('상대 경로(trading/… · ./… · ?… · ../…)도 링크 없이 글자만 — 내부 화면 우회 차단(WR-03)', () => {
    const { container } = render(
      <MessageAssistant
        content={'[a](trading/limit-chaser) [b](./trading/x) [c](?account=1) [d](../admin) [e](javascript:alert(1))'}
      />,
    );
    expect(container.querySelectorAll('a')).toHaveLength(0);
    for (const t of ['a', 'b', 'c', 'd']) expect(screen.getByText(t).closest('a')).toBeNull();
  });
});

describe('MiniStockCard (Task 2)', () => {
  it('Test 2 — 상승(changeRate>0) → --up 배지(국내 빨강) + 링크 /stocks/{code}', () => {
    render(
      <MiniStockCard
        code="042700"
        name="한미반도체"
        price={98400}
        changeRate={29.9}
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/stocks/042700');
    expect(screen.getByText('한미반도체')).toBeInTheDocument();
    expect(screen.getByText('042700')).toBeInTheDocument();
    // 국내색상: 상승 = --up
    const badge = screen.getByText(/\+29\.9/);
    expect(badge.className).toContain('--up');
  });

  it('Test 3 — 하락(changeRate<0) → --down 배지(파랑)', () => {
    render(
      <MiniStockCard
        code="005930"
        name="삼성전자"
        price={71000}
        changeRate={-3.2}
      />,
    );
    const badge = screen.getByText(/-3\.2/);
    expect(badge.className).toContain('--down');
  });
});

describe('Citation (Task 2)', () => {
  it('Test 4 — 뉴스(news) 제목+출처+URL verbatim + 웹(web) citations 렌더', () => {
    const { rerender } = render(
      <Citation
        title="한미반도체, HBM 장비 수주 확대"
        source="이데일리"
        url="https://finance.naver.com/news/123"
        kind="news"
      />,
    );
    const newsLink = screen.getByRole('link');
    // URL verbatim(D-08)
    expect(newsLink).toHaveAttribute(
      'href',
      'https://finance.naver.com/news/123',
    );
    expect(
      screen.getByText('한미반도체, HBM 장비 수주 확대'),
    ).toBeInTheDocument();
    expect(screen.getByText(/이데일리/)).toBeInTheDocument();

    rerender(
      <Citation
        title="美 반도체 수출규제 완화 기대감"
        url="https://example.com/web"
        kind="web"
      />,
    );
    expect(
      screen.getByText('美 반도체 수출규제 완화 기대감'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://example.com/web',
    );
  });
});
