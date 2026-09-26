import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import PrivacyPage, { metadata } from '../page';

/**
 * Phase 22 Plan 03 Task 2 — `/privacy`(D-11 · MOBILE-02c) 회귀면.
 *
 * 22-02 에서 승인된 `22-PRIVACY-DRAFT.md` 1~13절이 공개 페이지로 그대로 옮겨졌는지 잠근다.
 * 각 케이스는 **깨졌을 때 사용자가 겪는 일**과 1:1 이다.
 *  - 절이 빠지거나 순서가 바뀌면   → 법정 기재 사항 누락(개인정보 보호법 제30조) · 승인본과 불일치
 *  - 2절 항목표 행이 빠지면        → 실제로 처리하는 항목을 고지하지 않은 방침이 된다
 *  - 미정 표식·부록이 남으면       → 검토자용 메모가 스토어·테스터에게 그대로 노출된다
 *  - 제목(metadata)이 바뀌면       → 스토어 링크 미리보기·브라우저 탭 제목이 틀린다
 *
 * 시행일: 승인본은 22-07 이 push 하는 날로 채운다(22-02 인계). 지금은 자리표시
 * 「2026년 ○월 ○일」 을 그대로 옮기고 이 테스트도 자리표시를 단언한다 — 22-07 이
 * 날짜를 채우면 이 단언도 함께 바꾼다.
 */

// CenterShell 의 AppHeader 는 클라이언트 컴포넌트(테마 토글 · next/link)라 이 회귀면과 무관하다.
vi.mock('@/components/layout/app-header', () => ({ AppHeader: () => null }));

/** 22-02 PLAN interfaces 의 고정 절 제목(초안 `## n. …` 와 같은 문자열). */
const SECTION_TITLES = [
  '1. 개인정보의 처리 목적',
  '2. 처리하는 개인정보 항목',
  '3. 보유 및 이용 기간',
  '4. 제3자 제공',
  '5. 처리 위탁',
  '6. 국외 이전',
  '7. 정보주체의 권리와 행사 방법',
  '8. 파기 절차와 방법',
  '9. 안전성 확보 조치',
  '10. 쿠키와 기기 저장소',
  '11. 개인정보 보호책임자와 연락처',
  '12. 방침 변경 고지',
  '13. 시행일',
];

/** 22-02 인계 자리표시 — 22-07 이 push 날짜로 채운다. */
const EFFECTIVE_DATE_PLACEHOLDER = '2026년 ○월 ○일';

function section(n: number): HTMLElement {
  const el = document.getElementById(`section-${n}`);
  if (!el) throw new Error(`section-${n} 이 없다`);
  return el;
}

describe('/privacy', () => {
  it('level 1 제목 「개인정보처리방침」 이 하나 있다', () => {
    render(<PrivacyPage />);
    expect(screen.getAllByRole('heading', { level: 1, name: '개인정보처리방침' })).toHaveLength(1);
  });

  it('level 2 제목 13개가 승인본 절 제목과 같은 순서로 있다', () => {
    render(<PrivacyPage />);
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(SECTION_TITLES);
  });

  it.each(['Google 계정', '관심종목', 'AI 애널리스트 대화', 'DMA 계정 정보'])(
    '2절 항목표에 %j 행이 있다',
    (term) => {
      render(<PrivacyPage />);
      const table = within(section(2)).getByRole('table');
      const cells = within(table).getAllByRole('cell').map((c) => c.textContent ?? '');
      expect(cells.some((text) => text.includes(term))).toBe(true);
    },
  );

  it('13절에 시행일(22-07 인계 자리표시)이 있다', () => {
    render(<PrivacyPage />);
    expect(within(section(13)).getByText(new RegExp(EFFECTIVE_DATE_PLACEHOLDER))).toBeTruthy();
  });

  it('미정 표식 · 부록(검토자용) 문자열이 문서 어디에도 없다', () => {
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('확인 필요');
    expect(text).not.toContain('부록');
  });

  it('11절 연락처는 mailto 링크다', () => {
    render(<PrivacyPage />);
    const link = within(section(11)).getByRole('link', { name: 'alex@jx1.io' });
    expect(link.getAttribute('href')).toBe('mailto:alex@jx1.io');
  });

  it('metadata.title 은 「개인정보처리방침 · GH Trade」 다', () => {
    expect(metadata.title).toBe('개인정보처리방침 · GH Trade');
  });
});
