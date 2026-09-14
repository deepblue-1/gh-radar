/**
 * CopyTextButton 상태 머신 테스트 (quick-260914-jtj, D-03·D-04).
 *
 * jsdom 은 navigator.clipboard 가 없다 → 테스트마다 defineProperty 로 주입/제거.
 * user-event 미사용: setup() 이 자체 clipboard stub 으로 바꿔 mock 을 우회한다.
 */
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import { CopyTextButton } from '../copy-text-button';

function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

afterEach(() => {
  delete (navigator as unknown as { clipboard?: unknown }).clipboard;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CopyTextButton', () => {
  it('성공(label 변형): getText lazy 호출 → writeText + 복사됨 + status 안내', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const getText = vi.fn(() => 'hello');

    render(
      <CopyTextButton getText={getText} ariaLabel="주도 테마 전체 복사" label="전체 복사" />,
    );
    expect(getText).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '주도 테마 전체 복사' }));

    expect(await screen.findByText('복사됨')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(screen.getByRole('status')).toHaveTextContent('클립보드에 복사했습니다');
  });

  it('1800ms 후 idle 로 복귀한다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubClipboard(vi.fn().mockResolvedValue(undefined));

    render(
      <CopyTextButton getText={() => 'hello'} ariaLabel="주도 테마 전체 복사" label="전체 복사" />,
    );
    fireEvent.click(screen.getByRole('button', { name: '주도 테마 전체 복사' }));
    expect(await screen.findByText('복사됨')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });

    expect(screen.getByText('전체 복사')).toBeInTheDocument();
    expect(screen.queryByText('복사됨')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('writeText 거부 → 복사 실패 + status 안내 + console.error (조용히 삼키지 않음)', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <CopyTextButton getText={() => 'hello'} ariaLabel="주도 테마 전체 복사" label="전체 복사" />,
    );
    fireEvent.click(screen.getByRole('button', { name: '주도 테마 전체 복사' }));

    expect(await screen.findByText('복사 실패')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('클립보드 복사에 실패했습니다');
    expect(errorSpy).toHaveBeenCalled();
    // 복사 텍스트는 로그에 남기지 않는다 (T-jtj-03).
    expect(JSON.stringify(errorSpy.mock.calls.map((c) => c.map(String)))).not.toContain(
      'hello',
    );
  });

  it('clipboard API 없음 → 예외 없이 복사 실패', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(navigator.clipboard).toBeUndefined();

    render(
      <CopyTextButton getText={() => 'hello'} ariaLabel="주도 테마 전체 복사" label="전체 복사" />,
    );
    fireEvent.click(screen.getByRole('button', { name: '주도 테마 전체 복사' }));

    expect(await screen.findByText('복사 실패')).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('아이콘 변형: 접근성 이름 = ariaLabel, idle 텍스트 없음, 성공 시 말풍선 복사됨', async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));

    render(<CopyTextButton getText={() => 'hello'} ariaLabel="원전 요약 복사" />);
    const button = screen.getByRole('button', { name: '원전 요약 복사' });
    expect(button).toHaveTextContent('');
    expect(screen.queryByText('복사됨')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(await screen.findByText('복사됨')).toBeInTheDocument();
  });

  it('unmount 시 대기 중인 복귀 타이머를 정리한다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubClipboard(vi.fn().mockResolvedValue(undefined));

    const { unmount } = render(
      <CopyTextButton getText={() => 'hello'} ariaLabel="원전 요약 복사" />,
    );
    const baseline = vi.getTimerCount();

    fireEvent.click(screen.getByRole('button', { name: '원전 요약 복사' }));
    expect(await screen.findByText('복사됨')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBeGreaterThan(baseline);

    unmount();
    expect(vi.getTimerCount()).toBe(baseline);
  });
});
