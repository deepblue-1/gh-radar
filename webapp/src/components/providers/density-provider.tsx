'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * 컴포넌트 밀도(density) 토큰.
 *
 * - `compact`     — row-h 32px, 고밀도 데이터 테이블(상한가 스캐너 등)
 * - `default`     — row-h 40px, 일반 UI
 * - `comfortable` — row-h 48px, 여백 넉넉한 카드/모달
 *
 * `globals.css` 의 `[data-density="compact"]` / `[data-density="comfortable"]`
 * 스코프 규칙이 `--row-h` 등을 자동 재계산한다.
 */
export type Density = 'compact' | 'default' | 'comfortable';

const DensityContext = createContext<Density>('default');

/**
 * UI-SPEC §8.5.1 compound pattern.
 *
 * 최외곽 `<div>` 에 `data-density` 속성을 주입하여 하위 트리의 CSS 토큰
 * (`--row-h` 등) 을 스코프 단위로 재계산한다. `createContext`/`useContext`
 * 를 사용하므로 이 파일은 반드시 client 경계에 존재해야 한다 (`'use client'`).
 *
 * 서버 컴포넌트(예: `/design` 카탈로그 페이지)에서도 이 프로바이더로 감싸면
 * 본 파일이 client boundary 를 담당한다.
 *
 * @example
 * ```tsx
 * // Compact row-h 32px 테이블을 원하면 <DensityProvider value="compact"> 로 감쌀 것
 * <DensityProvider value="compact">
 *   <StockTable rows={rows} />
 * </DensityProvider>
 * ```
 */
export function DensityProvider({
  value = 'default',
  children,
}: {
  value?: Density;
  children: ReactNode;
}) {
  return (
    <div data-density={value}>
      <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
    </div>
  );
}

/**
 * 현재 density 값을 읽는 훅.
 *
 * @example
 * ```tsx
 * const density = useDensity();
 * const rowHeight = density === 'compact' ? 32 : density === 'comfortable' ? 48 : 40;
 * ```
 */
export function useDensity(): Density {
  return useContext(DensityContext);
}
