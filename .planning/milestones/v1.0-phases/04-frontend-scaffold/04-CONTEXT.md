# Phase 4: Frontend Scaffold — Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3에서 구축된 `webapp/` Next.js 15 App Router 스캐폴드 + 디자인 시스템 위에, **Vercel 배포를 확정**하고 **실제 사용자가 접근하는 기본 페이지(`/` → `/scanner`)와 AppShell 기반 글로벌 레이아웃**을 적용한다. Phase 2 Cloud Run API와의 연결도 smoke 수준에서 검증한다.

**포함:**
- `webapp/src/app/page.tsx` Phase 3 placeholder 교체 → `/scanner` 로 서버 사이드 redirect
- `webapp/src/app/scanner/page.tsx` 신규 — Phase 5 실구현 전까지의 placeholder 페이지 (AppShell + Skeleton/안내 + `/api/health` 결과 표시)
- AppShell `hideSidebar` prop 추가 (Phase 3 컴포넌트 소스 수정) → v1은 헤더 전용 모드 기본
- 헤더 구성 확정: 로고(Link `/scanner`) | Search 자리 placeholder 공간 | ThemeToggle
- `webapp/src/lib/api.ts` — fetch wrapper + `ApiError` envelope 파싱 + 타입 공유
- `NEXT_PUBLIC_API_BASE_URL` 환경변수 규약
- 글로벌 에러 경계: 루트 `error.tsx` + `not-found.tsx`
- 기본 메타데이터: title/description/theme-color(Light/Dark dynamic) + `public/favicon.ico`
- Vercel 프로젝트 연결 + Production/Preview 배포 활성 + 환경변수 입력
- 배포 URL 확보 후 수동 smoke(`/`, `/scanner`, `/design`)

**제외:**
- Scanner 실제 데이터 렌더링 (Phase 5)
- `/stocks/[code]` 상세 라우트 + Search 자동완성 (Phase 6)
- SWR/React Query 도입 (Phase 5에서 결정)
- 커스텀 도메인 (v2 검증 후)
- OG 이미지 / manifest.json / loading.tsx (v2)
- Vercel Analytics / Sentry (v2)
- Playwright E2E (v2)
- robots.txt / sitemap.xml (SEO 성숙 단계)

</domain>

<decisions>
## Implementation Decisions

### 홈 & 라우트 구조
- **D-01:** `/` (루트)는 **App Router 서버 사이드 `redirect('/scanner')`** 로 구현. Client 리다이렉트 금지 (SEO + hydration 비용). v1 핵심이 Scanner이므로 사이트 오픈 즉시 핵심 기능 진입.
- **D-02:** Phase 4에서 신규 추가되는 라우트는 **`/scanner` 단 하나**. `webapp/src/app/scanner/page.tsx` 에 placeholder 페이지. Phase 5 구현 시 본 파일을 실 Scanner UI로 교체 (URL 유지).
- **D-03:** Phase 3의 `/design` 카탈로그 라우트는 **상시 유지**. 프로덕션에서도 접근 가능. 프로토타이핑/회귀 검증 용도.
- **D-04:** `/stocks/[code]` · Search 관련 라우트는 Phase 6에서 도입. Phase 4에서 스텁 만들지 않음 — Phase 6 설계가 Phase 4 placeholder 에 묶이는 위험 회피 (YAGNI).

### 글로벌 레이아웃 & 네비게이션
- **D-05:** **Phase 3 AppShell 컴포넌트에 `hideSidebar?: boolean` prop 추가** (기본 `false`). v1 전 페이지는 `hideSidebar`로 헤더만 표시. v2 개인화(관심종목/알림) 도입 시 제거. CenterShell도 v1에서는 미사용 (Phase 6 상세 페이지에서 도입 예정이므로 Phase 4 수정 불필요).
- **D-06:** 헤더 구성 (`app-header.tsx` 수정):
  - **좌측**: 로고 `gh-radar` — Next/Link → `/scanner` 이동
  - **중앙**: Search 자동완성 **자리 예약용 placeholder 영역** (disabled input bar 또는 `<div>` 공간). Phase 6 SRCH-02에서 실 자동완성으로 교체. 공간 확보 목적 = Phase 6 도입 시 헤더 레이아웃 jitter 방지
  - **우측**: ThemeToggle (Phase 3 컴포넌트 그대로)
  - 반응형: `<lg` 모바일에서는 Search placeholder 숨김 (Phase 3 D-23 드로어 패턴 불필요)
- **D-07:** `/scanner` placeholder 페이지 내용: AppShell(`hideSidebar`) + 제목 "Scanner" + 간단 안내 텍스트("실시간 스캐너는 Phase 5에서 활성화됩니다") + Skeleton 몇 개 + API 연결 상태 배지(D-12). 금융 컬러 토큰 사용 예시 포함 (시각 검증).
- **D-08:** `webapp/src/app/layout.tsx` 는 Phase 3 구조 유지. ThemeProvider 래핑 변경 없음. `suppressHydrationWarning`, Pretendard 폰트 로드 유지.

### API 클라이언트
- **D-09:** 환경변수 **`NEXT_PUBLIC_API_BASE_URL`** — Phase 2 Cloud Run 서비스 URL(`https://gh-radar-server-xxxx.asia-northeast3.run.app`). `NEXT_PUBLIC_` 접두사로 클라이언트 번들에도 노출 허용 (공개 API, Phase 2 D-17).
- **D-10:** **`webapp/src/lib/api.ts`** — 얇은 fetch wrapper:
  - `apiFetch<T>(path: string, init?: RequestInit): Promise<T>`
  - 에러 응답을 Phase 2 envelope(`{error:{code,message}}`)로 파싱 → 커스텀 `ApiClientError` throw (code/message/status 필드 포함)
  - `AbortController` 기반 타임아웃(기본 8초) 지원
  - 서버 컴포넌트 / 클라이언트 컴포넌트 양쪽에서 사용 가능 (Node fetch + Web Fetch 호환)
- **D-11:** 도메인 타입은 **`@gh-radar/shared` workspace import** (Phase 2 D-04 계승). `Stock`, `Market`, 에러 envelope 타입. webapp `package.json` 에 이미 `"@gh-radar/shared": "workspace:*"` 등재됨.
- **D-12:** `/scanner` placeholder 페이지는 **서버 컴포넌트에서 `apiFetch('/api/health')`** 를 호출해 결과를 배지로 표시:
  - 성공(`{status:'ok',...}`) → "API 연결: OK" (금융 up 컬러 배지)
  - 실패 → "API 연결: FAIL" (금융 down 컬러 배지) + 에러 메시지
  - 배포 후 운영 연결 확인용 smoke. Vercel + Cloud Run 통합 검증의 1차 방어선.
  - `export const revalidate = 30` 으로 30초 ISR (과도 호출 방지).
- **D-13:** SWR / React Query / TanStack Query 도입은 **Phase 5 범위**. Phase 4에서는 순수 `apiFetch` 로 충분. 미리 도입 시 미사용 의존성.

### 환경변수 & 비밀 관리
- **D-14:** 환경변수 계약:

  | Name | Scope | Where |
  |---|---|---|
  | `NEXT_PUBLIC_API_BASE_URL` | Production + Preview + Development | Vercel Env + `webapp/.env.local`(gitignored) |

  - 로컬 개발: `webapp/.env.local.example` 커밋 (실값 없이 키만). `.env.local` 은 `.gitignore`.
  - Vercel Dashboard: Production/Preview 양쪽에 동일 Cloud Run URL (단일 환경).
- **D-15:** 시크릿은 **없음** — v1 API는 공개(Phase 2 D-17), 인증 토큰 불필요. Analytics/Sentry 추가 시 그때 비밀값 관리 논의.

### 에러 경계 & 메타데이터
- **D-16:** 루트 `webapp/src/app/error.tsx` — 전역 에러 바운더리. CenterShell 레이아웃 + 에러 메시지 + "다시 시도" 버튼(`reset()`). 프로덕션 빌드에서 스택트레이스 노출 금지.
- **D-17:** 루트 `webapp/src/app/not-found.tsx` — 404 전역 fallback. CenterShell + "페이지를 찾을 수 없어요" + `/scanner` 복귀 링크.
- **D-18:** `loading.tsx` 는 Phase 4 범위 외 — 데이터 로딩이 실제로 발생하는 Phase 5·6에서 도입. Phase 4 placeholder는 정적.
- **D-19:** `webapp/src/app/layout.tsx` `metadata` / `viewport`:
  - `title: 'gh-radar'`, `description: '한국 주식 실시간 상한가 근접 스캐너'`
  - `viewport` 는 `generateViewport` export 로 분리 (Next.js 15 규약)
  - `themeColor: [{ media:'(prefers-color-scheme: dark)', color:'#0a0a0a' }, { media:'(prefers-color-scheme: light)', color:'#ffffff' }]` — 실 hex는 UI-SPEC.md 기준으로 planner 재량
  - `public/favicon.ico` 기본 아이콘 (심플 레이더 아이콘, Phase 3 로고와 정합). SVG 우선, ICO 폴백
- **D-20:** OG image / `manifest.json` / Apple touch icon 은 v2 (공유·SEO 중요도 낮음, 핵심 아님).

### Vercel 배포
- **D-21:** **Vercel Project 설정**:
  - Root Directory: **`webapp`** (monorepo 하위 앱)
  - Framework Preset: Next.js (자동)
  - Install Command: **`pnpm install --frozen-lockfile`** (workspace 자동 인식, Vercel이 pnpm 감지)
  - Build Command: **`pnpm build`** (Next.js 기본)
  - Output Directory: `.next` (기본)
  - Node.js 버전: **22.x** (Phase 3 D-01 Node 22 통일)
- **D-22:** **빌드 영향 파일 경계**: `webapp/**` + `packages/shared/**` 변경 시에만 빌드 트리거. Vercel "Ignored Build Step" 에 `git diff HEAD^ HEAD --quiet webapp/ packages/shared/ pnpm-lock.yaml` 설정 (비용/시간 절감).
- **D-23:** **Production 도메인**: **`gh-radar.vercel.app`** (Vercel 기본). 커스텀 도메인은 v2 검증 후. 이름 선점 확인은 Vercel 생성 시점에 대응 (불가 시 `gh-radar-app.vercel.app` 등 대안).
- **D-24:** **Preview 배포**: 활성화. `master` 외 모든 브랜치 push → 독립 URL 자동 생성 (`gh-radar-git-<branch>-<scope>.vercel.app`). PR 코멘트에 URL 자동 추가. Phase 2 D-18 CORS 정규식(`/^https:\/\/gh-radar-.*\.vercel\.app$/`)이 이 패턴을 이미 커버 → 추가 CORS 갱신 불필요.
- **D-25:** **Production 배포 조건**: `master` 브랜치 머지 시에만. 직접 push 금지 원칙은 레포 정책이지만 Phase 4에서는 Git 운영 룰 문서화하지 않음(기존 커밋 규칙 준수).
- **D-26:** **배포 후 smoke 체크리스트** (수동, Phase 4 검증 기준):
  1. `gh-radar.vercel.app` 접근 → `/scanner` 리다이렉트 작동
  2. `/scanner` 에 AppShell 헤더 + "API 연결: OK" 배지 표시
  3. ThemeToggle 클릭 → Light↔Dark 전환 작동 (Success Criteria #4)
  4. `/design` 카탈로그 접근 가능 (Phase 3 산출물 보존 확인)
  5. 존재하지 않는 경로 접근 시 `not-found.tsx` 표시
  6. 모바일 뷰포트(<lg) 레이아웃 깨지지 않음

### 테스트 전략
- **D-27:** Phase 4는 **배포 smoke 중심**. 단위/통합 테스트는 유틸(`apiFetch` 에러 파싱)만 최소 범위. E2E(Playwright)는 v2.
- **D-28:** `pnpm --filter @gh-radar/webapp typecheck`, `build` 가 CI 성공 기준 (로컬·Vercel 양쪽).

### Claude's Discretion (planner 재량)
- `apiFetch` 세부 시그니처 (제네릭 위치, headers 병합 방식, 기본 타임아웃 정확값)
- `error.tsx` / `not-found.tsx` 의 구체 카피 문안 및 CenterShell 사용 여부
- Scanner placeholder 페이지의 Skeleton 개수/배치
- `ApiClientError` 클래스 계층 (단일 vs `NotFound/Timeout/Network` 세분화)
- `theme-color` 실 hex (UI-SPEC.md 팔레트 기반)
- Favicon 디자인 (심플 모노크롬 레이더 픽토그램 권장)
- Next.js `next.config.ts` 세부값 (`output: 'standalone'` 여부, `experimental` 플래그)
- `.env.local.example` 에 포함할 안내 주석
- Vercel "Ignored Build Step" 스크립트 정확 문법
- `apiFetch` 의 `next.revalidate` / `cache` 기본값 선택

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 루트
- `CLAUDE.md` — 스택 결정 (Next.js 15 + Vercel), 배포 환경 제약
- `.planning/ROADMAP.md` §Phase 4 — Goal + Success Criteria #1~#4
- `.planning/REQUIREMENTS.md` — INFR-04 (Next.js + Vercel)
- `.planning/STATE.md` — Phase 3 완료 상태, Node 22 결정

### Phase 2 산출물 (API 계약·CORS 승계)
- `.planning/phases/02-backend-api/02-CONTEXT.md` — D-04 @gh-radar/shared 타입, D-06~D-16 엔드포인트/응답/에러 envelope, D-17~D-20 CORS·rate limit, D-22 X-Request-Id
- `server/src/**` — 실제 구현 확인용 (API 계약 재검증)

### Phase 3 산출물 (웹앱 스캐폴드·디자인 시스템 승계)
- `.planning/phases/03-design-system/03-CONTEXT.md` — D-01 Node 22, D-22~D-24 AppShell/CenterShell, D-15~D-18 next-themes, D-08~D-10 금융 컬러
- `.planning/phases/03-design-system/03-UI-SPEC.md` — 구체 컬러·치수 (theme-color hex 등)
- `webapp/src/app/layout.tsx` — 루트 레이아웃 (수정 최소)
- `webapp/src/app/page.tsx` — Phase 3 placeholder (교체 대상)
- `webapp/src/app/design/page.tsx` — 카탈로그 (유지)
- `webapp/src/components/layout/app-shell.tsx` — `hideSidebar` prop 추가 대상
- `webapp/src/components/layout/app-header.tsx` — Search placeholder 자리 추가 대상
- `webapp/src/components/layout/theme-toggle.tsx` — 재사용
- `webapp/src/components/providers/theme-provider.tsx` — 재사용
- `webapp/src/lib/utils.ts`, `webapp/src/lib/fonts.ts` — 재사용
- `packages/shared/src/stock.ts` — Stock/Market 타입
- `packages/shared/src/` (Phase 2 추가분) — ApiError/ApiSuccess envelope 타입

### 외부 문서
- Next.js 15 App Router redirect: https://nextjs.org/docs/app/api-reference/functions/redirect
- Next.js 15 metadata: https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- Next.js 15 error.js: https://nextjs.org/docs/app/api-reference/file-conventions/error
- Next.js 15 not-found.js: https://nextjs.org/docs/app/api-reference/file-conventions/not-found
- Vercel monorepo (pnpm workspaces): https://vercel.com/docs/monorepos/pnpm
- Vercel Environment Variables: https://vercel.com/docs/projects/environment-variables
- Vercel Preview Deployments: https://vercel.com/docs/deployments/preview-deployments
- Vercel Ignored Build Step: https://vercel.com/docs/projects/overview#ignored-build-step

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (변경 없이 사용)
- `webapp/src/components/providers/theme-provider.tsx` — next-themes 래퍼
- `webapp/src/components/layout/theme-toggle.tsx` — 3상태 토글
- `webapp/src/components/layout/center-shell.tsx` — 에러/404 페이지에 사용
- `webapp/src/components/ui/{button,card,badge,skeleton,input,separator}.tsx` — placeholder UI + error boundary
- `webapp/src/lib/utils.ts` (`cn`), `webapp/src/lib/fonts.ts` — Pretendard/GeistMono
- `webapp/src/styles/globals.css` — `@theme` 토큰 (금융 컬러 포함)
- `@gh-radar/shared` 패키지 — Stock/Market + 추가 envelope 타입

### 수정 대상
- `webapp/src/components/layout/app-shell.tsx` — `hideSidebar?: boolean` prop 추가
- `webapp/src/components/layout/app-header.tsx` — Search placeholder 자리 추가 (중앙 영역)
- `webapp/src/app/page.tsx` — Phase 3 안내 페이지 → `redirect('/scanner')` 로 교체

### 신규 파일
- `webapp/src/app/scanner/page.tsx` — Scanner placeholder (AppShell, API health 배지)
- `webapp/src/app/error.tsx` — 전역 에러 경계
- `webapp/src/app/not-found.tsx` — 전역 404
- `webapp/src/lib/api.ts` — `apiFetch` + `ApiClientError`
- `webapp/.env.local.example` — 환경변수 키 안내
- `webapp/public/favicon.ico` (또는 `webapp/src/app/icon.svg` Next 규약)

### Integration Points
- Phase 2 Cloud Run URL → `NEXT_PUBLIC_API_BASE_URL` (Vercel Env + 로컬 `.env.local`)
- Vercel Dashboard ↔ GitHub repo (`master` = Production, 기타 = Preview)
- Phase 2 CORS 정규식 ↔ Vercel 도메인 패턴 (이미 정합, 추가 작업 없음)

</code_context>

<specifics>
## Specific Ideas

- `/` 리다이렉트 구현: `webapp/src/app/page.tsx` 에 `import { redirect } from 'next/navigation'; export default function Page() { redirect('/scanner'); }` (서버 컴포넌트 기본)
- AppShell `hideSidebar` prop 시그니처 제안: `<AppShell hideSidebar>...</AppShell>` (불리언 prop, 기본 false로 기존 Phase 3 카탈로그와 호환)
- 헤더 Search placeholder는 **실제 `<Input>` + `disabled` + placeholder 텍스트 "종목 검색 (Phase 6)"** 권장 — 공간 확보 + 시각적으로 "곧 열림" 신호
- Scanner placeholder 페이지의 API 연결 배지: Phase 3 Badge 컴포넌트 `variant="up"` / `variant="down"` 재사용 (금융 세만틱)
- `apiFetch` URL 조합: `new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL).toString()` (상대/절대 경로 양쪽 허용)
- `ApiClientError`: `{ code: string; message: string; status: number; requestId?: string }` — Phase 2 `X-Request-Id` 응답 헤더도 캡처
- Vercel `gh-radar` 이름 선점된 경우 fallback: `gh-radar-kr`, `gh-radar-app`
- 커밋 규칙(전역 CLAUDE.md): 커밋 메시지 한글, 사용자 확인 후 진행, push까지, Co-Authored-By 제거
- Phase 4 완료 후 STATE.md `current_focus` → "Phase 5 - Scanner UI" 로 업데이트

</specifics>

<deferred>
## Deferred Ideas

- **커스텀 도메인** (예: `ghradar.kr`) — v1 사용자 피드백 이후
- **OG image / manifest.json / Apple touch icons** — SNS 공유·PWA 설치 수요 생기면
- **SWR / React Query 도입** — Phase 5 첫 데이터 페치 설계 시점 결정
- **Vercel Analytics / Speed Insights** — 트래픽 유의미해진 후
- **Sentry 또는 유사 에러 추적** — 에러 볼륨 보이는 단계
- **Playwright E2E** — CI 확장 단계 (배포 후 핵심 경로 자동 검증)
- **robots.txt / sitemap.xml / 메타 robots** — SEO 전략 착수 시
- **`loading.tsx` 글로벌 fallback** — Phase 5·6 데이터 로딩 도입 시 각 세그먼트별로
- **i18n (영어·중국어)** — 해외 확장 시 (Phase 3 deferred 계승)
- **v2 사이드바 재활성화** (관심종목, 알림 등 개인화) — 인증 도입 이후
- **Vercel Edge Middleware** — 지역 라우팅/A-B 테스트 수요 시
- **Next.js output: 'standalone'** — 자체 호스팅 전환 시 고려 (현재는 Vercel 종속)

</deferred>

---

*Phase: 04-frontend-scaffold*
*Context gathered: 2026-04-14 via /gsd-discuss-phase*
*의존: Phase 2 API 계약(CORS/envelope) + Phase 3 디자인 시스템/AppShell 승계*
