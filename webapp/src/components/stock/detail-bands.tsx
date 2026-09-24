import { Children, type ReactNode } from 'react';

/**
 * DetailBands — 토스 B 종목상세 섹션 띠 (quick-260924-vj1 · sketch 001 `.v-b .detail-stack > .card`).
 *
 * 자식 섹션마다 `<div data-detail-band>` 풀폭 평면 블록으로 감싸고, 블록 사이 flex gap 12px 이
 * 바깥 `--band` 색으로 비쳐 띠가 된다(다크 #101013 greyBackground · 라이트 #f2f4f6 — TDS 공식값).
 *
 * ★ 가로 bleed `-mx-2 md:-mx-4 lg:-mx-6` 와 띠 안 패딩 `px-2 md:px-4 lg:px-6` 은 AppShell `main` 의
 *   패딩 램프(`p-2 md:p-4 lg:p-6`)와 **같은 값**이다 — 한쪽만 고치면 좌우로 삐져나간다.
 * ★ 폭을 명시하지 않는다 — `w-full` 을 주면 음수 마진이 폭을 늘리지 못한다.
 * ★ 섹션 루트 평면화 · 빈 섹션 숨김 · 띠 안 `--card` → `--muted` 재정의는 globals.css 「종목상세 B 띠」.
 *   섹션이 null 을 렌더하면 띠가 `:empty` 로 숨고, flex gap 은 display:none 항목에 생기지 않는다.
 */
export function DetailBands({ children }: { children: ReactNode }) {
  return (
    <div
      data-detail-bands
      className="-mx-2 flex flex-col gap-3 bg-[var(--band)] md:-mx-4 lg:-mx-6"
    >
      {Children.map(children, (child) =>
        child === null || child === undefined || typeof child === 'boolean' ? null : (
          <div
            data-detail-band
            className="bg-[var(--bg)] px-2 py-6 md:px-4 lg:px-6 lg:py-7"
          >
            {child}
          </div>
        ),
      )}
    </div>
  );
}
