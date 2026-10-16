import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

/**
 * Phase 32 D-15 · UI-SPEC S9 — /me 설정 탭 「이 기기」 카드 · 돌파 알림음 스위치.
 *
 * 옛 작업대 상단 줄 `ToneToggle` 단위 테스트(workbench-status-bar.test.tsx 「돌파 알림음 (D-17)」)의 의도를 그대로
 * 옮겼다 — 「켜는 클릭 안에서 resume」 · 「차단이면 끄지 않고 활성화만」(이제 활성화는 별도 「클릭해 활성화」 버튼 몫이고
 * 스위치 상태 · 저장값은 그 버튼이 바꾸지 않는다). 저장 키는 그대로 `gh-radar:breakout-tone` — 작업대 재생
 * (`readTonePref`)이 같은 값을 읽는다.
 */

const toneState = { blocked: false };
vi.mock('@/lib/alert-tone', () => ({
  isTonePlaybackBlocked: vi.fn(() => toneState.blocked),
  resumeToneContext: vi.fn(async () => {}),
  playBreakoutTone: vi.fn(() => false),
}));

import { resumeToneContext } from '@/lib/alert-tone';
import { BREAKOUT_TONE_KEY, readTonePref } from '@/lib/breakout-list';
import { DeviceSettingsCard } from '../device-settings-card';

const CAPTION = '이 브라우저(기기)에만 저장돼요. 계좌와 무관해요.';
const toneSwitch = () => screen.getByRole('switch', { name: '돌파 알림음' });
const activateBtn = () => screen.queryByRole('button', { name: '클릭해 활성화' });

beforeEach(() => {
  window.localStorage.clear();
  toneState.blocked = false;
  vi.mocked(resumeToneContext).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('DeviceSettingsCard — 「이 기기」 돌파 알림음 (D-15 · S9)', () => {
  it('카드 · 제목 「이 기기」 · 캡션 · 스위치 접근 이름 「돌파 알림음」 · aria-describedby = 캡션', () => {
    render(<DeviceSettingsCard />);
    const card = document.querySelector('[data-slot="me-device-card"]') as HTMLElement;
    expect(card).not.toBeNull();
    expect(screen.getByRole('heading', { name: '이 기기' })).toBeTruthy();
    const caption = screen.getByText(CAPTION);
    const sw = toneSwitch();
    expect(sw.getAttribute('data-slot')).toBe('me-device-tone');
    expect(caption.id).not.toBe('');
    expect(sw.getAttribute('aria-describedby')).toBe(caption.id);
    expect(card.contains(sw)).toBe(true);
  });

  it('저장값 없음 → 꺼짐 · 「클릭해 활성화」 없음 · localStorage 에 "on" 이 있으면 마운트 뒤 켜짐', () => {
    const { unmount } = render(<DeviceSettingsCard />);
    expect(toneSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(activateBtn()).toBeNull();
    unmount();

    window.localStorage.setItem(BREAKOUT_TONE_KEY, 'on');
    render(<DeviceSettingsCard />);
    expect(toneSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(activateBtn()).toBeNull();
  });

  it('꺼짐에서 클릭 → 저장 "on" · 켜짐 · resumeToneContext 1회(그 클릭 안에서)', async () => {
    render(<DeviceSettingsCard />);
    await act(async () => {
      fireEvent.click(toneSwitch());
    });
    expect(resumeToneContext).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(BREAKOUT_TONE_KEY)).toBe('on');
    expect(readTonePref()).toBe('on');
    expect(toneSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  it('켜짐 ∧ 정상에서 클릭 → 저장 "off" · 꺼짐 · resume 없음', async () => {
    window.localStorage.setItem(BREAKOUT_TONE_KEY, 'on');
    render(<DeviceSettingsCard />);
    await act(async () => {
      fireEvent.click(toneSwitch());
    });
    expect(window.localStorage.getItem(BREAKOUT_TONE_KEY)).toBe('off');
    expect(toneSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(resumeToneContext).not.toHaveBeenCalled();
  });

  it('켜짐 ∧ 차단 → 스위치 왼쪽 「클릭해 활성화」 · 누르면 resumeToneContext 만(스위치 · 저장값 불변)', async () => {
    window.localStorage.setItem(BREAKOUT_TONE_KEY, 'on');
    toneState.blocked = true;
    render(<DeviceSettingsCard />);
    const btn = activateBtn();
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('data-slot')).toBe('me-device-tone-activate');
    expect(btn!.getAttribute('type')).toBe('button');
    // 스위치 왼쪽 — 문서 순서상 앞.
    expect(btn!.compareDocumentPosition(toneSwitch()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await act(async () => {
      fireEvent.click(btn!);
    });
    expect(resumeToneContext).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(BREAKOUT_TONE_KEY)).toBe('on');
    expect(toneSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  it('차단이 풀리면(resume 성공) 「클릭해 활성화」 가 사라진다 · 꺼짐 ∧ 차단이면 처음부터 없다', async () => {
    window.localStorage.setItem(BREAKOUT_TONE_KEY, 'on');
    toneState.blocked = true;
    const { unmount } = render(<DeviceSettingsCard />);
    vi.mocked(resumeToneContext).mockImplementationOnce(async () => {
      toneState.blocked = false;
    });
    await act(async () => {
      fireEvent.click(activateBtn()!);
    });
    expect(activateBtn()).toBeNull();
    unmount();

    window.localStorage.setItem(BREAKOUT_TONE_KEY, 'off');
    toneState.blocked = true;
    render(<DeviceSettingsCard />);
    expect(activateBtn()).toBeNull();
  });

  it('localStorage 가 던지면 꺼짐 유지 · 오류 표시 없음', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    render(<DeviceSettingsCard />);
    expect(toneSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.body.textContent).not.toMatch(/오류|실패/);
  });
});
