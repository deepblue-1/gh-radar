---
phase: 03-design-system
plan: 03
title: Phase 3 Design System — Implementation Plan
status: ready
created: 2026-04-13
type: execute
wave: 1
depends_on: []
autonomous: false
requirements: [DSGN-01, DSGN-02, DSGN-03, DSGN-04, DSGN-05]
files_modified:
  - webapp/package.json
  - webapp/tsconfig.json
  - webapp/next.config.ts
  - webapp/postcss.config.mjs
  - webapp/eslint.config.mjs
  - webapp/next-env.d.ts
  - webapp/.gitignore
  - webapp/components.json
  - webapp/public/fonts/PretendardVariable.woff2
  - webapp/src/app/layout.tsx
  - webapp/src/app/page.tsx
  - webapp/src/app/design/page.tsx
  - webapp/src/app/design/_sections/colors.tsx
  - webapp/src/app/design/_sections/typography.tsx
  - webapp/src/app/design/_sections/spacing.tsx
  - webapp/src/app/design/_sections/components.tsx
  - webapp/src/app/design/_sections/layouts.tsx
  - webapp/src/app/design/_sections/numbers.tsx
  - webapp/src/styles/globals.css
  - webapp/src/lib/utils.ts
  - webapp/src/lib/fonts.ts
  - webapp/src/components/providers/theme-provider.tsx
  - webapp/src/components/providers/density-provider.tsx
  - webapp/src/components/layout/app-shell.tsx
  - webapp/src/components/layout/center-shell.tsx
  - webapp/src/components/layout/app-header.tsx
  - webapp/src/components/layout/theme-toggle.tsx
  - webapp/src/components/ui/button.tsx
  - webapp/src/components/ui/card.tsx
  - webapp/src/components/ui/table.tsx
  - webapp/src/components/ui/badge.tsx
  - webapp/src/components/ui/input.tsx
  - webapp/src/components/ui/skeleton.tsx
  - webapp/src/components/ui/slider.tsx
  - webapp/src/components/ui/separator.tsx
  - webapp/src/components/ui/tooltip.tsx
  - webapp/src/components/ui/sheet.tsx
  - webapp/src/components/ui/number.tsx
must_haves:
  truths:
    - "`http://localhost:3000/design` 을 열면 토큰·컴포넌트·레이아웃이 한 페이지로 렌더된다"
    - "우측 상단 ThemeToggle 로 Light/Dark/System 3 상태가 전환되고 모든 섹션이 즉시 반영된다"
    - "9종 shadcn 컴포넌트(Button/Card/Table/Badge/Input/Skeleton/Slider/Separator/Tooltip)가 default/hover/focus/disabled/variant 상태로 렌더된다"
    - "AppShell 과 CenterShell 레이아웃 미리보기가 카탈로그에서 정상 렌더되며, 375px 뷰포트에서 AppShell 은 Drawer 로 전환된다"
    - "`<Number>` 컴포넌트가 price/percent/volume/marketCap/plain 5가지 포맷으로 `ko-KR` 규칙에 맞게 렌더되고 `showSign`/`withColor` 가 동작한다"
    - "Pretendard Variable 은 self-host 로드되어 Google Fonts CDN 네트워크 호출이 0건이다"
    - "`pnpm -r run typecheck` + `pnpm -r run build` 가 통과한다"
    - "`webapp/src` 에서 하드코딩 hex(`#[0-9a-fA-F]{3,8}`) 가 `globals.css` 외에는 검출되지 않는다"
  artifacts:
    - path: webapp/src/styles/globals.css
      provides: "Tailwind v4 + UI-SPEC §9 토큰 전부 (Light/Dark OKLCH, spacing/radius/타이포/density, Double-Ring focus, .mono, [data-density])"
    - path: webapp/src/app/layout.tsx
      provides: "Root layout: `<html lang=\"ko\" suppressHydrationWarning>`, Pretendard/Geist Mono variable 바인딩, ThemeProvider, globals.css import"
    - path: webapp/src/components/providers/theme-provider.tsx
      provides: "next-themes wrapper with attribute='class', defaultTheme='system', enableSystem, disableTransitionOnChange"
    - path: webapp/src/components/providers/density-provider.tsx
      provides: "Density context (compact|default|comfortable) → [data-density] attribute 주입"
    - path: webapp/src/components/ui/number.tsx
      provides: "<Number> 컴포넌트 — format 5종 × showSign/withColor/precision, Intl.NumberFormat('ko-KR'), tabular-nums + .mono"
    - path: webapp/src/components/ui/slider.tsx
      provides: "SCAN-02 계약(min=10, max=29, step=1, defaultValue=25) 의 Slider 컴포넌트, `.slider-val` Geist Mono"
    - path: webapp/src/components/layout/app-shell.tsx
      provides: "56px sticky header + 240/64px sidebar + 24px padding main, <lg 에서 Sheet Drawer 전환"
    - path: webapp/src/app/design/page.tsx
      provides: "카탈로그 라우트 — 7 섹션(Intro/Color/Type/Spacing/Components/Layouts/Number)"
  key_links:
    - from: webapp/src/app/layout.tsx
      to: webapp/src/styles/globals.css
      via: "import '@/styles/globals.css'"
      pattern: "import.*globals\\.css"
    - from: webapp/src/app/layout.tsx
      to: webapp/src/lib/fonts.ts
      via: "next/font local(Pretendard) + google(Geist Mono) variable 바인딩"
      pattern: "pretendard|geistMono|className=.*variable"
    - from: webapp/src/components/ui/*.tsx
      to: webapp/src/styles/globals.css
      via: "bg-[--bg], text-[--fg], border-[--border] 등 CSS 변수 참조 (하드코딩 hex 금지)"
      pattern: "var\\(--|\\[--"
    - from: webapp/src/app/design/page.tsx
      to: "webapp/src/components/ui/* + webapp/src/components/layout/*"
      via: "9 컴포넌트 + 2 레이아웃 + <Number> 카탈로그 렌더"
      pattern: "from ['\\\"]@/components"
---

# Phase 3 Design System — Implementation Plan

## Goal

(ROADMAP Phase 3 Goal 인용)

> **모든 프론트엔드 UI가 공통으로 사용할 디자인 토큰, 컴포넌트, 레이아웃 템플릿이 정의되어 있다.**

## Success Criteria

(ROADMAP Phase 3 Success Criteria 1~5 인용)

1. CSS 변수로 컬러 팔레트, 타이포그래피, 스페이싱 토큰이 정의되어 있어 하드코딩된 색상값이 없다
2. 버튼 클릭 또는 시스템 설정에 따라 Light/Dark 테마가 전환되며 모든 컴포넌트에 반영된다
3. Button, Card, Table, Badge, Input 등 공통 컴포넌트가 shadcn/ui 기반으로 커스터마이징되어 있다
4. 네비게이션, 사이드바, 콘텐츠 영역을 포함한 페이지 레이아웃 템플릿이 존재한다
5. HTML 카탈로그 문서를 브라우저로 열면 모든 토큰, 컴포넌트, 레이아웃을 시각적으로 확인할 수 있다

## Wave Dependency Graph

```
                              ┌───────────────────────────────────────┐
  Wave 1 (Foundation)         │  1.1 Next.js 15 App Router 스캐폴드    │
  ────────────────────        │  1.2 디자인 토큰 CSS (globals.css)     │  ← 병렬
  Wave 내부 병렬 가능         │  1.3 Pretendard + Geist Mono 폰트      │
  (파일 경계 분리)            └───────────┬───────────────────────────┘
                                          │ Wave 1 완료 필수
                                          ▼
                              ┌───────────────────────────────────────┐
  Wave 2 (Components)         │  2.1 ThemeProvider + ThemeToggle       │
  ────────────────────        │  2.2 DensityProvider                   │  ← 병렬
  Wave 내부 병렬 가능         │  2.3 shadcn init + 9 컴포넌트 + variant│
  (파일 경계 분리)            └───────────┬───────────────────────────┘
                                          │ Wave 1~2 완료 필수
                                          ▼
                              ┌───────────────────────────────────────┐
  Wave 3 (Layouts + Catalog)  │  3.1 <Number> + AppShell/CenterShell   │
  ────────────────────        │  3.2 /design 카탈로그 + 수동 검증      │  ← 순차(3.1 → 3.2)
                              └───────────────────────────────────────┘

Wave 1 내부 병렬 허용 이유:
  1.1 = webapp 루트 config 파일 (package.json, next.config.ts, tsconfig.json, eslint.config.mjs)
  1.2 = webapp/src/styles/globals.css + webapp/src/lib/utils.ts (신규 경로)
  1.3 = webapp/public/fonts/*, webapp/src/lib/fonts.ts (신규 경로)
  → 유일한 공유 파일은 webapp/src/app/layout.tsx 이며 1.1 이 최초 생성한 후
     1.2·1.3 은 각자 고유 라인만 append. 실제 실행 시 1.1 → (1.2 + 1.3) 순차로 다뤄도 무방.

Wave 2 내부 병렬 허용 이유:
  2.1 = webapp/src/components/providers/theme-provider.tsx + layout/theme-toggle.tsx
  2.2 = webapp/src/components/providers/density-provider.tsx
  2.3 = webapp/components.json + webapp/src/components/ui/*.tsx (9종)
  → layout.tsx 는 2.1 에서만 수정 (Provider 주입).

Wave 3 은 3.1 산출물(<Number>, AppShell, CenterShell)을 3.2 카탈로그가 import 하므로 순차.
```



## Wave 1 — Foundation

### Plan 1.1 — webapp Next.js 15 App Router 스캐폴드

**Purpose**
`webapp/` 워크스페이스에 Next.js 15 App Router 최소 골격을 설치한다. CONTEXT.md D-03 가 정의한 "Phase 3 에서 webapp 에 스캐폴드 설치, Phase 4 는 배포·라우트에 집중" 경계를 실행한다. 루트 `package.json` `engines.node >=22` 와 `.nvmrc=22` 는 이미 존재(D-01 충족)하므로 재설정하지 않는다.

**Tasks**

- [ ] `webapp/package.json` 확장: name `@gh-radar/webapp` 유지, `scripts` 에 `dev`/`build`/`start`/`lint`/`typecheck` 추가 (CONTEXT.md D-03, CLAUDE.md 스택)
- [ ] `dependencies`: `next@^15`, `react@^19`, `react-dom@^19`
- [ ] `devDependencies`: `typescript@^5`, `@types/node@^22`, `@types/react@^19`, `@types/react-dom@^19`, `tailwindcss@^4`, `@tailwindcss/postcss@^4`, `eslint@^9`, `eslint-config-next@^15`
- [ ] `webapp/next.config.ts` — 기본 NextConfig (React Strict Mode on, experimental 미사용), `output: 'standalone'` 은 Phase 4 에서 결정하므로 제외
- [ ] `webapp/postcss.config.mjs` — `{ plugins: { '@tailwindcss/postcss': {} } }` (Tailwind v4 PostCSS 플러그인)
- [ ] `webapp/tsconfig.json` — `extends: "../tsconfig.base.json"` 유지하면서 Next.js 필수 옵션(`jsx: "preserve"`, `plugins: [{ name: "next" }]`, `paths: { "@/*": ["./src/*"] }`, `include: ["next-env.d.ts", "src/**/*", ".next/types/**/*.ts"]`, `exclude: ["node_modules"]`) 병합
- [ ] `webapp/next-env.d.ts` — Next 표준 (커밋 포함)
- [ ] `webapp/.gitignore` — `.next/`, `node_modules/`, `next-env.d.ts` 는 유지하되 워크스페이스 gitignore 와 조율
- [ ] `webapp/eslint.config.mjs` — `eslint-config-next` flat config
- [ ] `webapp/src/app/layout.tsx` — `<html lang="ko" suppressHydrationWarning>` (CONTEXT.md D-17), `<body>` 에 children 렌더, Metadata 기본값 (title `gh-radar`, description 임시)
- [ ] `webapp/src/app/page.tsx` — Phase 4 에서 교체될 임시 placeholder (`<main>` + 안내 문구 + `<Link href="/design">`)

**Files**

```
webapp/package.json          (modify)
webapp/next.config.ts        (create)
webapp/postcss.config.mjs    (create)
webapp/tsconfig.json         (modify)
webapp/eslint.config.mjs     (create)
webapp/next-env.d.ts         (create)
webapp/.gitignore            (create)
webapp/src/app/layout.tsx    (create — Wave 1.2/1.3 에서 globals.css, 폰트 주입)
webapp/src/app/page.tsx      (create)
```

**Deps**
- 런타임: `next@^15`, `react@^19`, `react-dom@^19`
- 스타일: `tailwindcss@^4`, `@tailwindcss/postcss@^4`
- 타입: `typescript@^5`, `@types/node@^22`, `@types/react@^19`, `@types/react-dom@^19`
- 린트: `eslint@^9`, `eslint-config-next@^15`

**Verification**

```bash
pnpm install
pnpm --filter @gh-radar/webapp run dev   # localhost:3000 이 200 으로 렌더
pnpm -r run typecheck                    # pass
pnpm -r run build                        # webapp .next/ 빌드 성공
```

**Requirements Covered**
선행 인프라. 직접 매핑 없음 (DSGN-01~05 모두의 전제 조건).



### Plan 1.2 — 디자인 토큰 CSS (`globals.css`)

**Purpose**
UI-SPEC §9 Tokens Reference 완성본을 `webapp/src/styles/globals.css` 에 그대로 이식하고, `@import 'tailwindcss'` + `@custom-variant dark` 로 Tailwind v4 다크모드를 활성화한다. `cn()` 유틸은 `webapp/src/lib/utils.ts` 에 배치한다. 본 Plan 이후 모든 컴포넌트는 `var(--token)` 만 참조하며 하드코딩 hex 를 새로 도입하지 않는다.

**Tasks**

- [ ] `webapp/src/styles/globals.css` 생성 — 상단에 `@import 'tailwindcss';` + `@custom-variant dark (&:where(.dark, .dark *));` (CONTEXT.md D-18)
- [ ] UI-SPEC §9 의 `:root` 블록 전체 이식 (컬러/금융 세만틱 `--up`/`--down`/`--flat`/`--up-bg`/`--down-bg` 포함, spacing `--s-1`~`--s-10`, radius `--r-sm/r/md/lg`, 타이포 `--t-caption`~`--t-h1` + `--lh-*`, density `--row-h`/`--cell-pad-x`/`--cell-pad-y`, `--font-sans`/`--font-mono`)
- [ ] UI-SPEC §9 의 `.dark` 블록 전체 이식 (Light 의 모든 토큰 override)
- [ ] §8.5.5 Double-Ring Focus — 전역 `*:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; box-shadow: 0 0 0 4px color-mix(in oklch, var(--ring) 30%, transparent); }` (UI-SPEC §8.5.5 규격)
- [ ] §2.2 `.mono` 유틸 — `font-family: var(--font-mono); font-variant-numeric: tabular-nums slashed-zero;`
- [ ] §8.5.1 `[data-density]` 스코프 — `[data-density="compact"] { --row-h: 32px; --cell-pad-y: 6px; }` / `[data-density="comfortable"] { --row-h: 44px; --cell-pad-y: 12px; }`
- [ ] §8.5.2 `html[lang="ko"]` mixed-script baseline 보정 규약 (UI-SPEC §8.5.2 그대로)
- [ ] `body { font-family: var(--font-sans); background: var(--bg); color: var(--fg); font-size: var(--t-base); line-height: var(--lh-normal); font-variant-numeric: tabular-nums; }` 전역 베이스라인 (UI-SPEC §2.3)
- [ ] `webapp/src/lib/utils.ts` — `export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }` (CONTEXT.md specifics, shadcn 관례)
- [ ] `webapp/src/app/layout.tsx` 수정 — 최상단에 `import '@/styles/globals.css';`

**Files**

```
webapp/src/styles/globals.css   (create)
webapp/src/lib/utils.ts         (create)
webapp/src/app/layout.tsx       (modify — globals.css import 추가)
```

**Deps**
- `clsx`, `tailwind-merge`

**Verification**

```bash
# UI-SPEC §9 토큰이 1:1 매치되는지
rg -n '^\s*--(bg|fg|muted|border|ring|primary|up|down|flat|up-bg|down-bg|row-h|font-sans|font-mono)' \
  webapp/src/styles/globals.css | wc -l
# → 최소 2 * 13 = 26 이상 (Light + Dark 블록)

# 하드코딩 hex 는 globals.css 안에서만 허용 (§9 원본 스펙에 #FFFFFF 등 포함)
rg -n '#[0-9a-fA-F]{3,8}' webapp/src --glob '!**/globals.css'
# → 0 건

pnpm -r run typecheck   # pass
```

**Requirements Covered**
- **DSGN-01** — 컬러/타이포/스페이싱 토큰 전부 CSS 변수 정의
- **DSGN-02** — `.dark` 클래스 기반 Light/Dark override 인프라



### Plan 1.3 — Pretendard Variable + Geist Mono 폰트

**Purpose**
CONTEXT.md D-11~D-13 에 따라 Pretendard Variable 을 self-host 로드하고, UI-SPEC §2.2 의 Geist Mono(숫자 전용) 를 `next/font/google` 로 주입한다. Google Fonts CDN 직접 호출은 금지(self-host 는 woff2 커밋, Geist Mono 는 next/font 프록시로 허용).

**Tasks**

- [ ] `webapp/public/fonts/PretendardVariable.woff2` — Pretendard 공식 릴리스 Variable woff2 1개 파일을 리포지토리에 직접 커밋 (CONTEXT.md specifics)
- [ ] `webapp/src/lib/fonts.ts` 생성
  - `import localFont from 'next/font/local'` → `pretendard = localFont({ src: '../../public/fonts/PretendardVariable.woff2', display: 'swap', variable: '--font-sans-loaded', weight: '45 920' })` (Variable 폰트 weight range)
  - `import { Geist_Mono } from 'next/font/google'` → `geistMono = Geist_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono-loaded', weight: ['400', '500', '600'] })`
- [ ] `webapp/src/app/layout.tsx` 수정
  - `import { pretendard, geistMono } from '@/lib/fonts'`
  - `<html lang="ko" suppressHydrationWarning className={`${pretendard.variable} ${geistMono.variable}`}>` (두 variable 바인딩)
- [ ] `webapp/src/styles/globals.css` 수정 — `--font-sans` 와 `--font-mono` 정의 맨 앞에 `var(--font-sans-loaded, ...)` / `var(--font-mono-loaded, ...)` 체이닝하여 `next/font` variable 이 우선 적용, fallback 스택은 UI-SPEC §9 그대로 유지

**Files**

```
webapp/public/fonts/PretendardVariable.woff2   (create — binary)
webapp/src/lib/fonts.ts                         (create)
webapp/src/app/layout.tsx                       (modify)
webapp/src/styles/globals.css                   (modify — --font-sans/mono 체이닝만)
```

**Deps**
- 없음 (`next/font` 는 `next` 에 내장)

**Verification**

```bash
pnpm --filter @gh-radar/webapp run dev
# 브라우저 DevTools → Network 탭:
#   - PretendardVariable.woff2 가 /_next/static/media/ 로부터 로드 (self-host)
#   - fonts.googleapis.com / fonts.gstatic.com 직접 호출 0 건
#   - Geist Mono 는 next/font 프록시 경로로 로드 (허용)
# 카탈로그(Wave 3.2) 에서 한글 ‘코스피’, 영문 ‘KOSPI’, 숫자 ‘3,504,200’ 모두 의도된 폰트로 렌더
```

**Requirements Covered**
- **DSGN-01** — 타이포 토큰 중 폰트 자산 self-host 인프라



## Wave 2 — Components (Wave 1 완료 전제)

### Plan 2.1 — Theme 인프라 + ThemeToggle

**Purpose**
CONTEXT.md D-15/D-16/D-17 에 따라 `next-themes` 를 도입하고, 3 상태 ThemeToggle(Light/Dark/System) 을 구현한다. SSR hydration 경고 방지를 위해 `<html suppressHydrationWarning>` 는 Plan 1.1 에서 이미 적용되었다.

**Tasks**

- [ ] `webapp/src/components/providers/theme-provider.tsx` — `'use client'` + `next-themes` 의 `ThemeProvider` 래퍼
  - props: `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange` (CONTEXT.md D-15, D-16, Claude's Discretion)
- [ ] `webapp/src/components/layout/theme-toggle.tsx` — `'use client'` + `useTheme()` 훅
  - 3 상태 순환 버튼(Sun/Moon/Monitor 아이콘, `lucide-react`), 현재 theme 에 해당하는 아이콘 표시
  - 44×44px 이상 hit target (UI-SPEC §4.3 / D-26), `aria-label` 동적 변경
- [ ] `webapp/src/app/layout.tsx` 수정 — `<body>` 내부를 `<ThemeProvider>` 로 감싸고 children 위치에 `{children}` 주입

**Files**

```
webapp/src/components/providers/theme-provider.tsx  (create)
webapp/src/components/layout/theme-toggle.tsx        (create)
webapp/src/app/layout.tsx                            (modify)
```

**Deps**
- `next-themes`, `lucide-react`

**Verification**

```bash
pnpm --filter @gh-radar/webapp run dev
# 1. 최초 로딩 시 hydration mismatch 경고 없음 (console clean)
# 2. ThemeToggle 클릭 → <html class="dark"> 즉시 토글, localStorage.theme 저장
# 3. System 상태에서 OS 다크모드 전환 → 앱 즉시 반영
pnpm -r run typecheck   # pass
```

**Requirements Covered**
- **DSGN-02** — Light/Dark 테마 전환 동작



### Plan 2.2 — DensityProvider

**Purpose**
UI-SPEC §8.5.1 compound pattern 을 구현한다. `DensityProvider` 는 `[data-density]` 속성을 최외곽 `<div>` 에 주입하고, 하위 트리는 `globals.css` 의 `[data-density="compact|comfortable"]` 스코프 규칙을 통해 `--row-h` 등을 자동으로 재계산한다.

**Tasks**

- [ ] `webapp/src/components/providers/density-provider.tsx` — **파일 최상단 `'use client'` 선언 필수** (`createContext`/`useContext` 사용). 서버 컴포넌트(예: `/design` 카탈로그)에서 `<DensityProvider value="compact">` 로 감싸면 이 파일이 client 경계를 담당한다.
  - `type Density = 'compact' | 'default' | 'comfortable'`
  - `const DensityContext = createContext<Density>('default')`
  - `function DensityProvider({ value = 'default', children }: { value?: Density; children: ReactNode })` → `<div data-density={value}><DensityContext.Provider value={value}>{children}</DensityContext.Provider></div>`
  - `export function useDensity(): Density` 훅
  - JSDoc 예시: "Compact row-h 32px 테이블을 원하면 `<DensityProvider value=\"compact\">` 로 감쌀 것"

**Files**

```
webapp/src/components/providers/density-provider.tsx   (create)
```

**Deps**
- 없음 (React 내장)

**Verification**

```bash
# 타입 체크만 우선. 시각 검증은 Wave 3.2 카탈로그에서 Before/After 샘플로 증명.
pnpm -r run typecheck   # pass
```

**Requirements Covered**
- **DSGN-03** — 컴포넌트 밀도 조정 기반 (Table 3 변형의 전제)



### Plan 2.3 — shadcn 초기화 + 9종 컴포넌트 + 금융 variant

**Purpose**
CONTEXT.md D-04/D-19/D-20 에 따라 shadcn CLI 로 9 컴포넌트를 설치한 뒤, UI-SPEC §3(Component Specs) + §8.5(Upgrades) + §5(`<Number>` 는 Plan 3.1 에서) 계약에 맞게 정렬한다. **원칙: CLI 생성 → UI-SPEC 정렬 2-step**. 하드코딩 hex 는 절대 도입하지 않고 `var(--token)` 만 사용한다.

**Tasks**

- [ ] **Step 1 — shadcn init (1회)**
  - `cd webapp && pnpm dlx shadcn@latest init`
  - prompts: style `new-york`, baseColor `neutral` (OKLCH 토큰과 충돌 회피 — Claude's Discretion), CSS variables `yes`, import alias `@/*`, `@/components`, `@/lib/utils`
  - `webapp/components.json` 생성 확인
- [ ] **Step 2 — 컴포넌트 추가**
  - `pnpm dlx shadcn@latest add button card table badge input skeleton slider separator tooltip sheet`
  - (sheet 는 AppShell Drawer Plan 3.1 에서 필요하므로 함께 추가)
- [ ] **Step 3 — 각 컴포넌트를 UI-SPEC 에 정렬** (`webapp/src/components/ui/*.tsx`)
  - **button.tsx** (§3.1) — 3 size (`sm`/`default`/`lg`, row-h 32/36/40) × 5 variant (`default`(primary)/`secondary`/`outline`/`ghost`/`destructive`). CVA variants 에서 `bg-[--primary]`, `text-[--primary-fg]` 등 토큰 클래스만 사용. `:focus-visible` 는 globals.css 전역 규칙에 위임.
  - **card.tsx** (§3.2 + §8.5.4) — `border-radius: var(--r-lg)` (12px). **box-shadow 는 UI-SPEC §8.5.4 원본값 그대로 이식**: Light `inset 0 1px 0 var(--border-subtle), 0 1px 2px oklch(0 0 0 / 0.04), 0 8px 24px oklch(0 0 0 / 0.04)`; Dark `inset 0 1px 0 oklch(1 0 0 / 0.04), 0 1px 2px oklch(0 0 0 / 0.4), 0 8px 24px oklch(0 0 0 / 0.3)`. `card-plain` variant 추가 — shadow 제거, border 만 유지.
  - **table.tsx** (§3.3 + §8.5.3) — `row-h: var(--row-h, 36px)`, `cell pad: var(--cell-pad-y) var(--cell-pad-x)`, `tbody tr + tr > td { border-top: 1px solid var(--border-subtle); }` (hairline), thead `bg: var(--muted)`. `.num` className 헬퍼 — `text-align: right; font-variant-numeric: tabular-nums;` 유틸.
  - **badge.tsx** (§3.4) — 기본 variant 유지 + 금융 세만틱 추가: `up` (`bg-[--up-bg] text-[--up]`), `down` (`bg-[--down-bg] text-[--down]`), `flat` (`bg-[--muted] text-[--flat]`). CVA `variant` union 에 3종 추가.
  - **input.tsx** (§3.5) — size (`sm`/`default`), border `var(--input)`, focus globals 전역 규칙 사용, error state (`data-[invalid=true]:border-[--destructive]`), disabled opacity 0.5.
  - **skeleton.tsx** (§3.6) — shimmer `@keyframes skeleton-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }` + `background: linear-gradient(90deg, var(--muted), color-mix(in oklch, var(--muted) 60%, var(--bg)), var(--muted)); background-size: 200% 100%; animation: skeleton-shimmer 1.6s linear infinite;`. `@media (prefers-reduced-motion: reduce)` 에서 `animation: none; opacity: 0.7;`. 리스트 컨테이너에 `> :nth-child(1) { animation-delay: 0s } > :nth-child(2) { animation-delay: 0.1s } ...` stagger.
  - **slider.tsx** (§3.7) — shadcn 기본에 Phase 5 SCAN-02 계약 주석 추가: `// Phase 5 SCAN-02: min=10, max=29, step=1, defaultValue=[25]`. `.slider-val` className 으로 값 표시 시 `font-family: var(--font-mono); font-variant-numeric: tabular-nums;` — UI-SPEC §3.7. **thumb `:focus-visible` 는 globals.css §8.5.5 Double-Ring 전역 규칙이 자동 적용되므로 컴포넌트 로컬 outline 규칙을 추가하지 말 것** (UI-SPEC §3.7 원 규격 `outline-offset: 2px` 는 §8.5.5 로 override 됨).
  - **separator.tsx** (§3.8) — `background: var(--border);`, orientation horizontal/vertical 그대로.
  - **tooltip.tsx** (§3.9) — `bg-[--popover] text-[--popover-fg] border-[--border]`, `box-shadow: 0 4px 12px oklch(0 0 0 / 0.08)` (UI-SPEC §3.9).
  - **sheet.tsx** — AppShell Drawer 용. scrim `bg-[oklch(0_0_0/0.55)] backdrop-blur-[4px]`, 220ms ease-out 진입, 160ms ease-in 이탈 (UI-SPEC §4.1). ESC 와 scrim 클릭으로 닫힘 (Radix 기본).

**Files**

```
webapp/components.json                     (create — shadcn init)
webapp/src/components/ui/button.tsx        (create & align)
webapp/src/components/ui/card.tsx          (create & align)
webapp/src/components/ui/table.tsx         (create & align)
webapp/src/components/ui/badge.tsx         (create & align + up/down/flat variant)
webapp/src/components/ui/input.tsx         (create & align)
webapp/src/components/ui/skeleton.tsx      (create & align)
webapp/src/components/ui/slider.tsx        (create & align)
webapp/src/components/ui/separator.tsx     (create & align)
webapp/src/components/ui/tooltip.tsx       (create & align)
webapp/src/components/ui/sheet.tsx         (create & align)
```

**Deps** (shadcn CLI 가 자동 설치)
- `@radix-ui/react-slot`, `@radix-ui/react-slider`, `@radix-ui/react-separator`, `@radix-ui/react-tooltip`, `@radix-ui/react-dialog` (sheet 기반)
- `class-variance-authority`, `tailwindcss-animate`, `lucide-react` (이미 Plan 2.1)

**Verification**

```bash
pnpm -r run typecheck
# → pass (10 컴포넌트 모두 type-safe)

# 하드코딩 hex 금지 원칙 검증
rg -n '#[0-9a-fA-F]{3,8}' webapp/src/components/ui
# → 0 건 (전부 var(--token))

pnpm -r run build
# → webapp 빌드 성공, shadcn 컴포넌트가 tree-shaken
```

**Requirements Covered**
- **DSGN-03** — Button/Card/Table/Badge/Input + Skeleton/Slider/Separator/Tooltip/Sheet (9 + 1) 컴포넌트 라이브러리



## Wave 3 — Layouts + Catalog (Wave 1~2 완료 전제)

### Plan 3.1 — `<Number>` 컴포넌트 + 레이아웃 템플릿

**Purpose**
UI-SPEC §5 `<Number>` 계약과 §4 레이아웃 템플릿(AppShell, CenterShell) 을 구현한다. 모든 숫자 렌더링 진입점은 `<Number>` 로 통일되며, 레이아웃은 Phase 4(스캐폴드)가 `import` 만 하면 그대로 채택할 수 있는 최종 계약이다.

**Tasks**

- [ ] **`<Number>` 컴포넌트** (`webapp/src/components/ui/number.tsx`, UI-SPEC §5)
  - props: `value: number`, `format?: 'price' | 'percent' | 'volume' | 'marketCap' | 'plain'` (기본 `'plain'`), `showSign?: boolean`, `withColor?: boolean`, `precision?: number`, `className?: string`, `as?: 'span' | 'td'` (기본 `'span'`)
  - 포맷 규칙 (locale `ko-KR` 고정, UI-SPEC §5.2):
    - `price`: `Intl.NumberFormat('ko-KR').format(value)` (천 단위 구분)
    - `percent`: `value * 100` 변환 후 `.toFixed(precision ?? 2)` + `%` (예: `0.0325` → `3.25%`)
    - `volume`: 백만/억 단위 절삭 (`>= 1e8` → `x.y 억`, `>= 1e4` → `x.y 만`)
    - `marketCap`: `>= 1e12` → `x.y 조원`, `>= 1e8` → `x.y 억원`
    - `plain`: `Intl.NumberFormat('ko-KR').format(value, { maximumFractionDigits: precision ?? 0 })`
  - `showSign=true` 이면 양수에 `+` prefix (0 은 부호 없음)
  - `withColor=true` 이면 `value > 0` → `text-[--up]`, `< 0` → `text-[--down]`, `=== 0` → `text-[--flat]`
  - 기본 스타일: `font-variant-numeric: tabular-nums; className="mono"` (UI-SPEC §5.3) — `.mono` 는 globals.css 유틸
  - JSDoc 에 4 사용 예시 (UI-SPEC §5.4 인용)
- [ ] **공통 헤더** (`webapp/src/components/layout/app-header.tsx`)
  - 56px 높이 sticky top-0, `bg-[--bg]/80 backdrop-blur-md border-b-[--border]`
  - 좌측 slot: 로고(`gh-radar` 텍스트 h3) + 햄버거 버튼(`<lg` 만 표시, 44×44, `aria-label="사이드바 열기"`)
  - 중앙 slot: nav children prop
  - 우측 slot: `<ThemeToggle />` 고정
- [ ] **AppShell** (`webapp/src/components/layout/app-shell.tsx`, UI-SPEC §4.1)
  - Desktop(`>=lg`): 56px top header + 240px left sidebar (collapsed 64px) + 24px padding main
  - Mobile(`<lg`): sidebar → `<Sheet>` Drawer (우측 햄버거 트리거), scrim `oklch(0 0 0 / 0.55) + backdrop-blur(4px)`, 220ms ease-out 진입 / 160ms ease-in 이탈 (UI-SPEC §4.1, §8.5)
  - ESC, scrim 클릭, 내부 nav 링크 클릭 시 자동 닫힘 (Radix Sheet 기본 + onNavigate 훅)
  - props: `sidebar?: ReactNode`, `nav?: ReactNode`, `children: ReactNode`
- [ ] **CenterShell** (`webapp/src/components/layout/center-shell.tsx`, UI-SPEC §4.2)
  - Header 재사용 + `<main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">{children}</main>`
  - `<sm`(640 미만)에서 `px-4` 로 여백 축소

**Files**

```
webapp/src/components/ui/number.tsx              (create)
webapp/src/components/layout/app-header.tsx      (create)
webapp/src/components/layout/app-shell.tsx       (create)
webapp/src/components/layout/center-shell.tsx    (create)
```

**Deps**
- 없음 (Plan 2.3 의 sheet/button/tooltip 의존)

**Verification**

```bash
pnpm -r run typecheck   # pass

# <Number> 기능 회귀는 카탈로그(Plan 3.2) 에서 시각 확인:
#   <Number value={3.504e14} format="marketCap" />                  → "350.4 조원"
#   <Number value={-0.012} format="percent" showSign withColor />   → "-1.20%" 파랑
#   <Number value={58320} format="price" />                          → "58,320"
#   <Number value={12345678} format="volume" />                      → "1,234.6 만" (또는 "1.23 억" 정책대로)

# 375px 뷰포트:
#   AppShell → 햄버거 44×44 이상, 클릭 시 Sheet Drawer 열림, ESC 로 닫힘
```

**Requirements Covered**
- **DSGN-04** — AppShell(네비/사이드바/콘텐츠) + CenterShell(헤더/중앙) 2 종 템플릿



### Plan 3.2 — `/design` 카탈로그 + 수동 검증

**Purpose**
UI-SPEC §6 카탈로그 구성(D-29 반영)을 `webapp/src/app/design/page.tsx` 로 구현한다. 카탈로그는 7 섹션으로 구성되며, 섹션별 파일을 `_sections/` 아래에 분리한다. 본 Plan 의 Verification 은 9 항 수동 체크리스트로 Phase 3 전체 Success Criteria 를 시각적으로 회수한다.

**Tasks**

- [ ] **라우트 진입** (`webapp/src/app/design/page.tsx`)
  - `CenterShell` 로 래핑 (긴 단일 스크롤) + 우측 상단 `<ThemeToggle />` 고정
  - 섹션 목록: `<ColorsSection />`, `<TypographySection />`, `<SpacingSection />`, `<ComponentsSection />`, `<LayoutsSection />`, `<NumbersSection />` + 최상단 Intro (목차 + BBAA preset 요약)
  - 각 섹션 사이 `<Separator />` + `<h2>` 앵커(`id`) 로 스크롤 네비
- [ ] **Colors 섹션** (`_sections/colors.tsx`, D-29 #1)
  - Light/Dark dual-grid: 각 토큰마다 swatch + 토큰명 + OKLCH + Hex 근사
  - 금융 세만틱 `--up`/`--down`/`--flat`/`--up-bg`/`--down-bg` 별도 하이라이트 박스
  - WCAG 대비 표 (UI-SPEC §7.1 인용) — 런타임 계산 없이 UI-SPEC 표 그대로 텍스트 노출
- [ ] **Typography 섹션** (`_sections/typography.tsx`, D-29 #2)
  - size × weight 매트릭스 (`--t-caption`~`--t-h1` × 400/500/600/700)
  - 한글("코스피 급등 종목") / 영문("KOSPI Leading Gainers") / 숫자("3,504,200") 샘플
  - `.mono` 유틸 적용 행 1개로 Geist Mono 대비 시연
- [ ] **Spacing 섹션** (`_sections/spacing.tsx`, D-29 #3)
  - `--s-1`~`--s-10` 토큰을 가로 막대 너비로 시각화
  - Radius `--r-sm/r/md/lg` 박스 샘플
- [ ] **Components 섹션** (`_sections/components.tsx`, D-29 #4)
  - 9(+1) 컴포넌트 × variant × default/hover/focus/disabled 상태 매트릭스
  - Button 5 variant × 3 size, Card 기본/`card-plain`, Table 10행 샘플(가격/등락률/거래량, `<Number>` 사용), Badge `up`/`down`/`flat` 및 기본 variant, Input 정상/error/disabled, Skeleton stagger 3행, Slider min=10/max=29/step=1/defaultValue=25 라이브 데모 + `.slider-val` 표시, Separator horizontal/vertical, Tooltip 호버 샘플, Sheet 트리거 버튼
  - **Density Before/After 샘플**: `<DensityProvider value="compact">`, `"default"`, `"comfortable"` 로 각각 감싼 Table 3개 병치 (UI-SPEC §8.5.1)
- [ ] **Layouts 섹션** (`_sections/layouts.tsx`, D-29 #5)
  - AppShell / CenterShell 인라인 mini preview (iframe 대신 축소 mock — CONTEXT.md Claude's Discretion) — `max-h-[420px] overflow-hidden border rounded-lg` 로 미니어처
  - 375px / 768px / 1280px 브레이크포인트에서의 행동을 텍스트로 설명
- [ ] **Number 섹션** (`_sections/numbers.tsx`, D-29 + UI-SPEC §5.4)
  - format 5종(`price`/`percent`/`volume`/`marketCap`/`plain`) × `showSign`/`withColor` 조합 표 (최소 12 샘플)
  - `packages/shared/src/stock.ts` 의 `Stock` 타입에서 mock 데이터 3건 구성 (예: 삼성전자/카카오/네이버) — 실제 price/percent/volume 값으로 렌더

**Files**

```
webapp/src/app/design/page.tsx                       (create)
webapp/src/app/design/_sections/colors.tsx           (create)
webapp/src/app/design/_sections/typography.tsx       (create)
webapp/src/app/design/_sections/spacing.tsx          (create)
webapp/src/app/design/_sections/components.tsx       (create)
webapp/src/app/design/_sections/layouts.tsx          (create)
webapp/src/app/design/_sections/numbers.tsx          (create)
```

**Deps**
- 없음 (Plan 2.3 + 3.1 산출물 import)

**Verification (수동 체크리스트 — checkpoint:human-verify)**

1. `pnpm --filter @gh-radar/webapp run dev` → `http://localhost:3000/design` 가 렌더된다
2. 우측 상단 ThemeToggle 클릭 → Light/Dark/System 3 상태가 모두 동작하고 **모든 섹션이 즉시 반영**되며 FOUC/hydration 경고가 없다
3. Components 섹션의 9(+1) 컴포넌트 × variant × default/hover/focus/disabled 상태가 빠짐없이 렌더된다
4. Keyboard `Tab` 순회 → Double-Ring Focus(2px outline + 3px offset + 4px halo, UI-SPEC §8.5.5) 가 모든 인터랙티브 요소에서 visible 하다
5. DevTools Network → Pretendard Variable 은 `/fonts/` self-host 로 로드, `fonts.googleapis.com` 직접 호출이 0 건이다 (Geist Mono 는 `next/font` 프록시 경로 허용)
6. 뷰포트 375px → AppShell mini preview 가 Drawer 로 전환, Table row-h 가 `--row-h` 정의에 따라 자동 확장된다
7. DevTools → Rendering → `prefers-reduced-motion: reduce` 강제 → Skeleton shimmer 가 정지하고 opacity 0.7 static 으로 표시된다
8. `pnpm -r run typecheck && pnpm -r run build` 가 모두 통과한다
9. `rg -n '#[0-9a-fA-F]{3,8}' webapp/src --glob '!**/globals.css'` → 0 건 (하드코딩 hex 는 토큰 정의 파일 외에 없음)

**사용자 승인 시그널**: 위 9 항 전부 PASS 를 육안으로 확인 후 "approved" 로 응답.

**Requirements Covered**
- **DSGN-05** — HTML 카탈로그 (Next.js 라우트 `/design`) 로 토큰·컴포넌트·레이아웃 시각화
- **DSGN-01~04 회수 검증** — 9 항 체크리스트가 Phase 3 Success Criteria #1~#5 를 그대로 증명



## Requirements Coverage Matrix

| 요구사항 | 내용 | Primary Plan | Supporting Plans | 검증 위치 |
|---|---|---|---|---|
| **DSGN-01** | 디자인 토큰 (CSS 변수, 하드코딩 최소) | Plan 1.2 | Plan 1.3 (폰트 토큰) | Plan 1.2 rg 검증 + Plan 3.2 체크 #9 |
| **DSGN-02** | Light/Dark 테마 전환 | Plan 2.1 | Plan 1.2 (`.dark` override) | Plan 2.1 hydration + Plan 3.2 체크 #2 |
| **DSGN-03** | 공통 컴포넌트 (shadcn 기반) | Plan 2.3 | Plan 2.2 (DensityProvider), Plan 3.1 (Number) | Plan 2.3 build + Plan 3.2 체크 #3 |
| **DSGN-04** | 레이아웃 템플릿 | Plan 3.1 | Plan 2.3 (sheet), Plan 2.1 (ThemeToggle) | Plan 3.2 체크 #6 |
| **DSGN-05** | HTML 카탈로그 | Plan 3.2 | Plan 3.1 (Number 샘플), Plan 2.2 (Density Before/After) | Plan 3.2 9 항 수동 체크 전체 |

**커버리지 확인:** DSGN-01 ~ DSGN-05 모두 최소 1 개 Primary Plan + 1 개 이상 Supporting Plan 에 매핑됨 (미매핑 요구 0 건).



## Upstream Docs

다운스트림 executor 는 본 PLAN.md 와 함께 다음 문서를 필수 입력으로 소비한다.

- `../../ROADMAP.md` — Phase 3 Goal / Success Criteria #1~#5
- `../../REQUIREMENTS.md` — DSGN-01 ~ DSGN-05 정의
- `./03-CONTEXT.md` — 아키텍처/정책 결정 D-01 ~ D-31 (잠긴 계약)
- `./03-UI-SPEC.md` — 시각 계약 §1(토큰) / §2(타이포) / §3(컴포넌트) / §4(레이아웃) / §5(`<Number>`) / §6(카탈로그) / §7(접근성) / §8(카피) / §8.5(Upgrades) / §9(Tokens Reference 완성본)
- `./03-UI-PREVIEW.html` — 사용자 확정(2026-04-13) 시각 레퍼런스
- `../../../CLAUDE.md` — Next.js 15 + React 19 + Tailwind v4 + shadcn/ui 스택 결정
- `../02-backend-api/02-CONTEXT.md` — Node 런타임 히스토리 (Phase 3 D-01 에서 Node 22 로 갱신)
- `../../../packages/shared/src/stock.ts` — `Stock`, `Market` 타입 (카탈로그 Number 섹션 mock 데이터)



*PLAN 작성: 2026-04-13 via /gsd-plan-phase 3*
*Plans: 6 (Wave 1 × 3 + Wave 2 × 3 + Wave 3 × 2, 마지막 두 Plan 은 순차)*
*Autonomous: false (Plan 3.2 에 checkpoint:human-verify 9 항 포함)*
