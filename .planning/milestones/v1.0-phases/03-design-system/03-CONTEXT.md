# Phase 3: Design System — Context

**Gathered:** 2026-04-13
**Status:** Ready for UI spec (`/gsd-ui-phase 3`) → then planning

<domain>
## Phase Boundary

모든 프론트엔드 UI가 공통으로 사용할 **디자인 토큰, 테마, 컴포넌트, 레이아웃, HTML 카탈로그**를 정의한다. Phase 4 Next.js 앱이 `import`만 하면 즉시 쓸 수 있는 상태로 만든다.

**포함:**
- `webapp/` 에 Next.js 15 App Router 최소 스캐폴드 설치 (Phase 4는 라우트/배포/기본 페이지에 집중)
- Tailwind v4 + shadcn/ui CLI 초기화, 디자인 토큰(CSS 변수) 정의
- Light/Dark 테마 인프라 (`next-themes` + class-based + `defaultTheme="system"`)
- 한국 시장 관례 기반 금융 세만틱 컬러 토큰 (`--color-up` = 빨강, `--color-down` = 파랑)
- Pretendard Variable self-host + tabular-nums 숫자 표시 규약
- 9개 공통 컴포넌트 (Button, Card, Table, Badge, Input, Skeleton, Slider, Separator, Tooltip)
- 레이아웃 템플릿 2종: `AppShell` (상단 헤더 + 좌측 사이드바), `CenterShell` (헤더 + 중앙 정렬)
- 카탈로그 라우트 `webapp/src/app/design/page.tsx` — 토큰/컴포넌트/레이아웃 Light↔Dark 시각화

**제외:**
- Vercel 배포 (Phase 4)
- 실제 기능 페이지 (Scanner Phase 5, 검색/상세 Phase 6+)
- 데이터 연동 (Phase 5부터)
- 애니메이션/모션 라이브러리 도입 (v2)
- 국제화(i18n) (현재 한국어 단일)

</domain>

<decisions>
## Implementation Decisions

### 런타임 & 배치 구조
- **D-01:** **Node 22 (LTS)** 로 전환. Phase 1·2의 Node 20 결정을 뒤집는다. `package.json` `"engines": {"node": ">=22"}`, `.nvmrc` = `22`, Dockerfile `node:22-alpine`. server 컨테이너는 다음 재배포 시 반영.
- **D-02:** 디자인 시스템은 **`webapp/` 내부에 직접 배치** (`packages/ui` 분리하지 않음). 이유: shadcn/ui CLI의 기본 워크플로와 정합, 단일 앱 구조에서 추상화 오버헤드 회피.
- **D-03:** **Phase 3에서 webapp에 Next.js 15 App Router 최소 스캐폴드를 설치**한다. Phase 4는 Vercel 배포 + 네비게이션 적용 + 실제 기본 페이지에 집중하도록 경계를 재정의. 스캐폴드 범위:
  - `webapp/src/app/layout.tsx` (루트 레이아웃, ThemeProvider 래핑, Pretendard 폰트 로드)
  - `webapp/src/app/page.tsx` (임시 placeholder — Phase 4에서 교체)
  - `webapp/src/app/design/page.tsx` (카탈로그)
  - `webapp/src/components/ui/` (shadcn 컴포넌트)
  - `webapp/src/styles/globals.css` (Tailwind v4 + `@theme` 토큰)
- **D-04:** **shadcn/ui CLI 초기화** 사용: `pnpm dlx shadcn@latest init` 1회 실행, 컴포넌트는 `pnpm dlx shadcn@latest add <name>` 으로 개별 추가. 공식 저장소에서 최신 Tailwind v4 호환 버전 사용.

### 토큰 시스템
- **D-05:** 디자인 토큰은 **Tailwind v4 `@theme` 디렉티브 + CSS 변수 인라인** 방식. `webapp/src/styles/globals.css` 단일 파일에 `@theme { --color-*, --font-*, --spacing-*, --radius-* }` 정의. `tailwind.config.ts` 최소화.
- **D-06:** `:root` 에 Light 토큰, `.dark` 클래스에 Dark 토큰 override. 하드코딩된 컬러값 금지 (DSGN-01 요구).
- **D-07:** **토큰 카테고리:**
  - **컬러:** `--color-background`, `--color-foreground`, `--color-muted`, `--color-muted-foreground`, `--color-border`, `--color-input`, `--color-ring`, `--color-primary`, `--color-primary-foreground`, `--color-destructive`, `--color-destructive-foreground`, 금융 세만틱 `--color-up`, `--color-down`, `--color-flat`
  - **타이포:** `--font-sans` (Pretendard Variable 스택), `--font-mono` (시스템 모노), `--font-size-xs~4xl`, `--line-height-*`
  - **스페이싱:** Tailwind v4 기본 spacing scale 사용 (커스텀 없음)
  - **반경:** `--radius-sm/md/lg` (shadcn 관례)

### 금융 세만틱 컬러 (한국 시장 관례)
- **D-08:** **상승 = 빨강(`--color-up`), 하락 = 파랑(`--color-down`), 보합 = 회색(`--color-flat`)** — 한국 주식 시장 관례. 서구의 녹/적 관례를 **사용하지 않는다**.
- **D-09:** Light/Dark 각각 채도·명도 조정된 2세트 제공. 대비 WCAG AA(4.5:1) 충족 필수. 배경 위 텍스트뿐 아니라 배지/셀 배경 variant도 함께 토큰으로 제공.
- **D-10:** 사용 예시:
  - 등락률 양수 텍스트: `text-[--color-up]` (빨강)
  - 상승 배지 배경: `bg-[--color-up]/10 text-[--color-up]`
  - 보합(±0%): `text-[--color-flat]`

### 타이포그래피
- **D-11:** 한글 기본 폰트는 **Pretendard Variable self-host** (`webapp/public/fonts/PretendardVariable.woff2`). Google Fonts CDN 의존 제거. 서브셋: KS X 1001 + Latin.
- **D-12:** 폰트 스택: `'Pretendard Variable', -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif`
- **D-13:** `next/font/local` 로 로드하여 FOIT/FOUT 최소화, `font-display: swap`.
- **D-14:** 숫자 표시 규약: 가격·등락률·거래량은 **`tabular-nums` + 우측 정렬** 필수. 전용 `<Number>` 컴포넌트 제공 — 값/부호/단위/컬러(자동 up/down/flat 매칭) 추상화.

### 테마 전환
- **D-15:** **`next-themes`** 도입, class-based 다크모드 (`<html class="dark">`). `ThemeProvider` 는 루트 레이아웃에 배치.
- **D-16:** `defaultTheme="system"` — 시스템 설정 따르되, 사용자가 토글하면 `localStorage`에 기억. 3상태 토글(Light/Dark/System) 컴포넌트 제공.
- **D-17:** SSR hydration mismatch 회피를 위해 `suppressHydrationWarning` 를 `<html>` 에 적용 (next-themes 권장 패턴).
- **D-18:** Tailwind v4 `darkMode` 설정은 v4 기본 방식(`@custom-variant dark (&:where(.dark, .dark *))`) 사용.

### 컴포넌트 라이브러리
- **D-19:** **초기 9개 컴포넌트**를 shadcn/ui CLI로 추가 (DSGN-03 필수 5개 + Phase 5·6이 즉시 필요로 할 4개):
  1. Button, 2. Card, 3. Table, 4. Badge, 5. Input (DSGN-03 명시)
  6. Skeleton (로딩 상태)
  7. Slider (Phase 5 상한가 임계값 10~29%, 기본 25%)
  8. Separator, 9. Tooltip (범용 사용)
- **D-20:** 컴포넌트는 shadcn 기본 코드를 유지하되 **필요한 variant만 추가**. 과도한 커스텀 금지. Badge 에 `variant="up"|"down"|"flat"` 추가 (금융 세만틱).
- **D-21:** 컴포넌트 파일 위치: `webapp/src/components/ui/<name>.tsx`. 유틸(`cn`)은 `webapp/src/lib/utils.ts`.

### 레이아웃 템플릿
- **D-22:** **2종 템플릿** 제공:
  - **`AppShell`** — 상단 고정 헤더(로고 + 네비 + 테마 토글) + 좌측 사이드바(접이식) + 메인 콘텐츠. 스캐너/대시보드 계열에서 사용.
  - **`CenterShell`** — 상단 고정 헤더 + 중앙 정렬 콘텐츠 영역(max-w-4xl). 종목 상세 페이지 계열에서 사용.
- **D-23:** **반응형:** 모바일(`<lg` = 1024px 미만)에서 사이드바는 Drawer 패턴으로 전환. Tooltip 은 터치 디바이스에서 long-press 활성.
- **D-24:** 레이아웃 컴포넌트 위치: `webapp/src/components/layout/`.

### 반응형 & 접근성
- **D-25:** **Tailwind 기본 브레이크포인트만 사용** (sm:640 md:768 lg:1024 xl:1280 2xl:1536). 커스텀 `xs` 추가하지 않음. 0~639px 구간(모든 iPhone 포함)은 접두사 없는 모바일 우선 기본 스타일로 처리.
- **D-26:** **WCAG 2.1 AA 준수**: 컬러 대비 4.5:1(본문), 3:1(UI 컴포넌트·큰 글자). 포커스 링 항상 visible(`:focus-visible` 사용, `--color-ring` 토큰). 세만틱 HTML(`<nav>`, `<main>`, `<button>`) 및 ARIA Radix 기본값 신뢰.
- **D-27:** 키보드 네비게이션: 모든 인터랙션 요소 Tab 이동 가능, Enter/Space 로 활성화, Esc 로 모달/드로어 닫기. shadcn/Radix 가 기본 처리.

### 카탈로그
- **D-28:** 카탈로그는 **Next.js 라우트 `/design`** (`webapp/src/app/design/page.tsx`). Storybook/Ladle 도입하지 않음 — Next.js 앱 내부 라우트가 최소 인프라로 충분.
- **D-29:** 카탈로그 구성 섹션:
  1. 컬러 토큰 팔레트 (의미 토큰 + 금융 세만틱, Light/Dark 동시 표시)
  2. 타이포 스케일 (size × weight 매트릭스, 한글·영문·숫자 샘플)
  3. 스페이싱 가이드 (Tailwind scale 시각화)
  4. 컴포넌트 9종: 각 상태(default/hover/focus/disabled) 및 variant
  5. 레이아웃 템플릿 2종 (AppShell, CenterShell) iframe 미리보기
  6. Light↔Dark 토글 — 모든 섹션에 실시간 반영
- **D-30:** 개발 시 접근: `pnpm --filter @gh-radar/webapp dev` → `http://localhost:3000/design`. 프로덕션 배포 시에도 포함 (Phase 4 이후에도 상시 접근 가능).

### 시각 디자인 스펙 (UI-SPEC.md 위임)
- **D-31:** 구체 컬러 hex/OKLCH 값, 타입 스케일, 컴포넌트 시각 스펙, 레이아웃 치수는 **`/gsd-ui-phase 3`** 에서 생성되는 UI-SPEC.md 로 위임. 본 CONTEXT.md 는 아키텍처·정책 수준만 잠근다. 다운스트림 planner/executor 는 UI-SPEC.md 와 본 CONTEXT.md 를 **함께** 소비한다.

### Claude's Discretion (planner 재량)
- Pretendard Variable 서브셋의 정확한 unicode-range 분할 전략
- shadcn 컴포넌트의 Tailwind v4 호환 방식 (공식 릴리즈 vs 커스텀 패치)
- `<Number>` 컴포넌트의 prop API 설계 (`value`, `format`, `showSign`, `withColor` 등 조합)
- CSS 변수 네이밍 (shadcn 관례 `--background` vs OKLCH 컬러 스페이스 적용 여부) — UI-SPEC.md 결과에 따름
- ThemeProvider 의 `disableTransitionOnChange` 등 세부 옵션
- 카탈로그 페이지의 단일 스크롤 vs 섹션 탭 UX
- 각 컴포넌트 파일의 PropTypes/variant API 세부 시그니처

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 루트
- `CLAUDE.md` — Next.js 15 + React 19 + Tailwind v4 + shadcn/ui 스택 결정
- `.planning/ROADMAP.md` — Phase 3 Goal 및 Success Criteria #1~#5
- `.planning/REQUIREMENTS.md` — DSGN-01~05
- `.planning/STATE.md` — 현재 프로젝트 상태

### Phase 1·2 산출물 (승계)
- `.planning/phases/01-data-foundation/01-CONTEXT.md` — D-01 pnpm workspaces, 디렉토리 레이아웃
- `.planning/phases/02-backend-api/02-CONTEXT.md` — D-02 Node 런타임(Phase 3에서 22로 갱신), D-04 shared 타입 패턴
- `packages/shared/src/stock.ts` — `Stock`, `Market` 타입 (카탈로그 예시/향후 `<Number>` 컴포넌트 테스트에 활용)

### Phase 3 후속 산출물 (예정)
- `.planning/phases/03-design-system/03-UI-SPEC.md` — `/gsd-ui-phase 3` 로 생성. 구체 시각 디자인 계약.
- `.planning/phases/03-design-system/03-PLAN.md` — `/gsd-plan-phase 3` 로 생성.

### 외부 문서
- Next.js 15 App Router: https://nextjs.org/docs/app
- Tailwind v4 `@theme` 디렉티브: https://tailwindcss.com/docs/theme
- Tailwind v4 다크모드: https://tailwindcss.com/docs/dark-mode
- shadcn/ui CLI: https://ui.shadcn.com/docs/cli
- shadcn/ui Tailwind v4 가이드: https://ui.shadcn.com/docs/tailwind-v4
- next-themes: https://github.com/pacocoursey/next-themes
- Pretendard: https://github.com/orioncactus/pretendard
- next/font (로컬 폰트): https://nextjs.org/docs/app/api-reference/components/font
- WCAG 2.1 AA: https://www.w3.org/WAI/WCAG21/quickref/?currentsidebar=%23col_customize&levels=aaa
- Radix UI (shadcn 기반): https://www.radix-ui.com/primitives

</canonical_refs>

<specifics>
## Specific Ideas

- 금융 배지 예시 사용처: Scanner 테이블의 등락률 셀, 종목 상세 페이지 헤더
- `<Number value={0.0325} format="percent" showSign withColor />` → `+3.25%` (빨강)
- Pretendard Variable woff2 파일은 `webapp/public/fonts/` 에 직접 커밋
- 카탈로그 URL 경로 고정: `/design` (다른 기능 라우트와 충돌 없음)
- Slider 컴포넌트는 Phase 5 SCAN-02 (10~29% 임계값) 계약을 염두에 둔 min/max/step props 설계
- 테마 토글 컴포넌트 위치: `webapp/src/components/layout/theme-toggle.tsx`
- `cn()` 유틸: `clsx` + `tailwind-merge` 조합 (shadcn 관례)
- Light/Dark 컬러는 OKLCH 스페이스 사용 고려 (Tailwind v4 기본, UI-SPEC.md 에서 최종 결정)

</specifics>

<deferred>
## Deferred Ideas

- **Storybook 또는 Ladle** 본격 도입 — 팀 확장 시
- **애니메이션/모션 라이브러리** (Framer Motion, motion.dev) — 트레이더 UI 정적 선호, v2
- **i18n** — 영어/중국어 확장 시 (v2+)
- **`packages/ui` 분리** — 다른 앱(예: 관리자 대시보드)이 생기면 재고
- **디자인 토큰 DSL**(Style Dictionary 등) — 다중 플랫폼(iOS/Android) 배포 시
- **OKLCH 컬러 스페이스** 전면 전환 — 브라우저 지원 안정화 확인 후
- **Phase 5에서 필요할 추가 컴포넌트** (Dialog, Select, Combobox, Popover, Dropdown Menu, Toast) — 해당 Phase 에서 `shadcn add` 로 증분 추가
- **HSL ↔ OKLCH 마이그레이션 툴링** — 토큰 일괄 변환 필요 시

</deferred>

---

*Phase: 03-design-system*
*Context gathered: 2026-04-13 via /gsd-discuss-phase*
*Node 런타임 결정(D-01): Phase 2 D-02 를 뒤집음 — 후속 재배포 시 반영*
*시각 디자인 스펙은 `/gsd-ui-phase 3` 산출물 UI-SPEC.md 에 위임 (D-31)*
