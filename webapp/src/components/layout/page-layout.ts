/**
 * quick-260926-o2u — 페이지 레이아웃 공용 문법(토스 문법 · 검색 페이지가 기준).
 *
 * 적용 범위: 홈 · My page · 상승률 상위 · 테마 · 관심종목 · 검색. 트레이딩(`/trading*`) ·
 * 종목상세(`/stocks/*`) · 테마 상세 · 채팅은 쓰지 않는다.
 *
 * 이 모듈에는 클라이언트 지시문을 달지 않는다 — 서버 컴포넌트(`app/page.tsx` · `app/scanner/page.tsx`)가
 * import 해서 실제 문자열을 받아야 한다. 클라이언트 모듈의 비컴포넌트 export 는 서버에서
 * client reference 로 바뀌어 className 이 깨진다.
 */

/** 본문 루트 — 900 폭 가운데 정렬(D3). 앱 셸 `<main>` 은 건드리지 않고 페이지 루트에서만 폭을 제한한다. */
export const PAGE_WRAP = 'mx-auto flex w-full max-w-[900px] flex-col gap-4';

/** 카드 면 — 목록을 한 장에 묶는 흰(라이트)/raised(다크) 면. */
export const CARD = 'rounded-[16px] bg-[var(--card)]';

/** 섹션 제목(h2) — 15px/600 muted(D4). */
export const SECTION_TITLE = 'text-[15px] font-semibold text-[var(--muted-fg)]';

/** 섹션 제목 옆 개수 — 알약 대신 13px/600 faint 평문(D4). */
export const SECTION_COUNT = 'text-[13px] font-semibold tabular-nums text-[var(--faint)]';

/** 카드 한 장 안 행 사이 hairline — 형제 행에만 위 테두리. */
export const ROW_DIVIDER = '[&+&]:border-t [&+&]:border-[var(--border-subtle)]';
