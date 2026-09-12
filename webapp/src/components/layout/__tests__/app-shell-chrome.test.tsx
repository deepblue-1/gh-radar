import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * 260911-w5h — **전역 크롬 계약 2건**.
 *
 * ① 앱 기본 테마가 **라이트**다. `localStorage` 에 선택이 없는 새 방문자가 밝은 화면을 본다.
 *    이미 고른 사용자의 선택은 next-themes 가 저장값을 우선하므로 그대로 유지된다 —
 *    그 사실은 next-themes 의 계약이라 여기서 다시 증명하지 않고, 이 파일은 **우리가 넘기는
 *    기본값**만 잠근다.
 * ② 모바일(<lg) 본문 여백이 **8px**, 데스크톱(≥lg)이 **24px** 이다. 390px 에서 24px×2 는
 *    본문 폭의 12% 였다.
 *
 * ★ 이 두 계약은 **한 묶음으로 깨진다**: `main` 의 패딩을 줄이면 그 패딩을 가로지르도록
 *   만들어진 `stock-detail-tabs` 의 sticky 탭 바(`-mx-*`)가 함께 갈려야 한다. 그쪽 단언은
 *   `stock/__tests__/stock-detail-client.test.tsx` 가 같은 커밋에서 잠근다.
 */

// next-themes 를 스텁해 **우리가 넘긴 props** 를 그대로 들여다본다.
// (실제 테마 적용은 next-themes 소관이고, 우리 계약은 기본값 하나다.)
const themeProps = vi.fn();
vi.mock('next-themes', () => ({
  ThemeProvider: (props: Record<string, unknown>) => {
    themeProps(props);
    return <>{props.children as React.ReactNode}</>;
  },
  // `hideSidebar` 셸은 헤더 우측에 `ThemeToggle` 을 되살린다 — 그 훅도 함께 스텁한다.
  useTheme: () => ({ resolvedTheme: 'light', theme: 'light', setTheme: vi.fn() }),
}));

// GlobalSearch 가 `useRouter` 를 쓴다 — jsdom 에 app router 가 없다.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { ThemeProvider } from '@/components/providers/theme-provider';
import { AppShell } from '@/components/layout/app-shell';

describe('① 앱 기본 테마는 라이트다 (260911-w5h)', () => {
  it('`defaultTheme="light"` 로 next-themes 를 부른다', () => {
    render(
      <ThemeProvider>
        <div>본문</div>
      </ThemeProvider>,
    );

    expect(themeProps).toHaveBeenCalled();
    const props = themeProps.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(props.defaultTheme).toBe('light');
    // 나머지 계약은 그대로다 — system 은 여전히 제외다(2 상태만 지원).
    expect(props.enableSystem).toBe(false);
    expect(props.attribute).toBe('class');
    expect(props.disableTransitionOnChange).toBe(true);
  });
});

/*
  ★ quick-260912-u58 ⑤ — 이 describe 는 **지우지 않고 다시 썼다.** 제목부터 「모바일 8px ·
    데스크톱 24px」이라 **2단** 계약을 말했는데, 사용자가 실측 3안 중 **3단 램프**를 골랐다:
    **8px / 768↑ 16px / 1024↑ 24px**.
    근거(재논의 대상 아님 — 브라우저 실폭 스윕 300~1220): 상따 본문이 안 잘리는 하한은
    컨테이너 **344px** 이고, 여백 8px 기준 뷰포트 360px 폰이 정확히 344 라 **폰 구간 여유가
    0** 이다 — 폰에서는 못 늘린다. 768 이상에서 16px 로 키워도 컨테이너가 ≥700 이라 컴팩트
    밴드가 유지된다.

  ★ **헤더의 같은 램프를 같은 describe 에서 함께 잠근다.** 두 값이 갈라지는 것이 이 항목이
    고치는 결함 그 자체다 — 옛 상태는 `main` 이 `p-2 lg:p-6`, `header` 가 맨몸 `px-6` 이라
    폰에서 헤더 24 / 본문 8 로 16px 어긋나 있었다. 한쪽만 단언하면 그 어긋남이 다시 난다.

  ★ 여백이 실제로 몇 px 인지는 **jsdom 이 모른다**(레이아웃이 없다). 여기서 잠그는 것은
    클래스 계약이고, 계산된 스타일로 재는 일은 `e2e/specs/home.spec.ts` 의 셸 불변식
    케이스가 뷰포트 390·768·1024 에서 한다 — 그 둘이 짝이다.
*/
describe('② 본문·헤더 여백이 8 / 768↑ 16 / 1024↑ 24 한 램프다 (quick-260912-u58 ⑤)', () => {
  it('`main` 이 `p-2 md:p-4 lg:p-6` 을 갖는다', () => {
    render(
      <AppShell hideSidebar>
        <div>본문</div>
      </AppShell>,
    );

    const main = screen.getByRole('main');
    expect(main.className).toContain('p-2');
    expect(main.className).toContain('md:p-4');
    expect(main.className).toContain('lg:p-6');
    // 맨몸 `p-6`·`p-4` 가 남아 있으면 폰에서도 그 값이 그대로 걸린다.
    expect(main.className).not.toMatch(/(^|\s)p-6(\s|$)/);
    expect(main.className).not.toMatch(/(^|\s)p-4(\s|$)/);
  });

  it('★ `header` 가 **같은 램프**를 갖는다 — 두 값이 갈라지는 것이 이 항목의 결함이다', () => {
    render(
      <AppShell hideSidebar>
        <div>본문</div>
      </AppShell>,
    );

    const header = screen.getByRole('banner');
    expect(header.className).toContain('px-2');
    expect(header.className).toContain('md:px-4');
    expect(header.className).toContain('lg:px-6');
    // 맨몸 `px-6`(옛 값)이 남으면 폰에서 헤더만 24px 이라 본문과 16px 어긋난다.
    expect(header.className).not.toMatch(/(^|\s)px-6(\s|$)/);
    // 세로·높이는 이번 변경 대상이 아니다 — `h-14` 는 그대로다.
    expect(header.className).toContain('h-14');
  });
});
