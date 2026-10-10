import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

/**
 * Phase 29 (29-15) — `AdminSheet` 반응형 시트 골격 (D-14 · 목업 A).
 *
 * 폰(뷰포트 640 미만)은 바텀시트(높이 92dvh 상한), 데스크톱은 우측 패널 440px — 앱 셸 레벨이라 뷰포트
 * 기준이다(컨테이너 쿼리 아님 · CLAUDE.md Conventions). matchMedia 를 두 값으로 목한다.
 */

import { AdminSheet } from '../admin-sheet';

function mockViewport(desktop: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) =>
      ({
        matches: q === '(min-width: 640px)' ? desktop : false,
        media: q,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

const content = () => document.querySelector('[data-slot="sheet-content"]') as HTMLElement;
const overlays = () => document.querySelectorAll('[data-slot="sheet-overlay"]');

/** Radix DismissableLayer 는 바깥 pointerdown 리스너를 다음 틱에 단다 — 한 틱 기다린 뒤 누른다. */
async function nextTick() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** 목록 자리(시트 바깥)의 행 버튼 + 시트. */
function renderWithList(onOpenChange: (open: boolean) => void) {
  return render(
    <>
      <button type="button">목록 행 B</button>
      <AdminSheet open onOpenChange={onOpenChange} title="kim.trader@example.invalid">
        <p>본문</p>
      </AdminSheet>
    </>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AdminSheet', () => {
  it('데스크톱(≥640) → 우측 패널 · 폭 440 · 제목이 접근 이름 · 닫기 버튼', () => {
    mockViewport(true);
    const onOpenChange = vi.fn();
    render(
      <AdminSheet open onOpenChange={onOpenChange} title="kim.trader@example.invalid">
        <p>본문</p>
      </AdminSheet>,
    );
    expect(content()).toHaveAttribute('data-side', 'right');
    expect(content().className).toContain('sm:max-w-[440px]');
    expect(content()).toHaveAttribute('data-admin-sheet', '');
    expect(screen.getByRole('dialog', { name: 'kim.trader@example.invalid' })).toBeInTheDocument();
    expect(screen.getByText('본문')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('폰(<640) → 바텀시트 · 높이 92dvh 상한 · 본문 스크롤', () => {
    mockViewport(false);
    render(
      <AdminSheet open onOpenChange={() => {}} title="서버 KB121">
        <p>본문</p>
      </AdminSheet>,
    );
    expect(content()).toHaveAttribute('data-side', 'bottom');
    expect(content().className).toContain('max-h-[92dvh]');
    const body = content().querySelector('[data-slot="admin-sheet-body"]') as HTMLElement;
    expect(body.className).toContain('overflow-y-auto');
  });

  it('footer 는 본문 밖 고정 영역 — 없으면 그리지 않는다', () => {
    mockViewport(true);
    const { rerender } = render(
      <AdminSheet open onOpenChange={() => {}} title="t" footer={<button type="button">다시 반영</button>}>
        <p>본문</p>
      </AdminSheet>,
    );
    const footer = content().querySelector('[data-slot="admin-sheet-footer"]') as HTMLElement;
    expect(footer).not.toBeNull();
    expect(footer).toContainElement(screen.getByRole('button', { name: '다시 반영' }));
    expect(content().querySelector('[data-slot="admin-sheet-body"]')).not.toContainElement(footer);

    rerender(
      <AdminSheet open onOpenChange={() => {}} title="t">
        <p>본문</p>
      </AdminSheet>,
    );
    expect(content().querySelector('[data-slot="admin-sheet-footer"]')).toBeNull();
  });

  it('open=false → 렌더하지 않는다', () => {
    mockViewport(true);
    render(
      <AdminSheet open={false} onOpenChange={() => {}} title="t">
        <p>본문</p>
      </AdminSheet>,
    );
    expect(content()).toBeNull();
  });

  // UI-REVIEW-2 · 목업 A `.panel` · D-14 「목록은 남는다」 — 데스크톱은 비모달 패널: 스크림 없음 · 바깥 상호작용으로 닫히지 않는다.
  it('데스크톱(≥640) → 비모달 패널 · 오버레이 0개 · 목록(바깥) pointerdown · focus 로 닫히지 않는다 · Esc 는 닫는다', async () => {
    mockViewport(true);
    const onOpenChange = vi.fn();
    renderWithList(onOpenChange);
    await nextTick();

    expect(overlays()).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: 'kim.trader@example.invalid' })).toBeInTheDocument();

    const outside = screen.getByRole('button', { name: '목록 행 B' });
    fireEvent.pointerDown(outside);
    fireEvent.focusIn(outside);
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(content(), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('폰(<640) → 모달 바텀시트 · 오버레이 1개 · 바깥 pointerdown 이 닫는다(종전)', async () => {
    mockViewport(false);
    const onOpenChange = vi.fn();
    renderWithList(onOpenChange);
    await nextTick();

    expect(overlays()).toHaveLength(1);
    fireEvent.pointerDown(overlays()[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
