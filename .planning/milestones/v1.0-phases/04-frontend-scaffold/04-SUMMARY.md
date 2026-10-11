---
phase: 04
plan: 04
subsystem: webapp
tags: [nextjs, vercel, app-router, api-client, error-boundary]
requires:
  - Phase 2 `/api/health` + CORS + X-Request-Id
  - Phase 3 AppShell / CenterShell / ThemeToggle / Badge / Input / Skeleton / Button
provides:
  - webapp `/scanner` placeholder 라우트 + API 연결 배지
  - `/` → `/scanner` 서버 리다이렉트
  - `apiFetch` + `ApiClientError` (envelope·타임아웃·RequestId 캡처)
  - 전역 `error.tsx` / `not-found.tsx`
  - metadata / viewport(theme-color) / icon.svg
  - `.env.local.example` 템플릿
affects:
  - webapp 기본 진입 경로 (`/`, `/scanner`, `/design`)
  - 전 페이지 헤더 상단 구성 (로고 Link + Search placeholder)
tech_stack:
  added: [] # 신규 의존성 없음 — 기존 스택 재활용
  patterns:
    - "App Router 서버 리다이렉트 (`next/navigation` redirect)"
    - "Phase 2 envelope 파싱 + AbortController 타임아웃"
    - "ISR (`revalidate = 30`) + `cache: 'force-cache'`"
key_files:
  created:
    - webapp/src/app/scanner/page.tsx
    - webapp/src/app/error.tsx
    - webapp/src/app/not-found.tsx
    - webapp/src/app/icon.svg
    - webapp/src/lib/api.ts
    - webapp/.env.local.example
  modified:
    - webapp/src/components/layout/app-shell.tsx
    - webapp/src/components/layout/app-header.tsx
    - webapp/src/app/layout.tsx
    - webapp/src/app/page.tsx
decisions:
  - "D-05 AppShell hideSidebar prop 추가 (기본 false — /design 회귀 없음)"
  - "D-06 헤더 중앙에 disabled Input placeholder (lg 이상) — Phase 6 도입 시 jitter 방지"
  - "D-12 /scanner 에서 apiFetch('/api/health') ISR 30s → up/down 배지"
  - "D-19 theme-color: light #ffffff / dark #0a0a0a (globals.css --bg 토큰 근사)"
metrics:
  completed: 2026-04-14
  duration: "~45분"
  tasks: 7
  files_created: 6
  files_modified: 4
---

# Phase 4 Plan 04: Frontend Scaffold Summary

Phase 3 디자인 시스템 위에 실제 사용자 진입 경로(`/ → /scanner`), 전역 에러 경계, Phase 2 Cloud Run 과 통신하는 얇은 `apiFetch` 클라이언트, 메타데이터/파비콘, Vercel 배포용 환경변수 스캐폴딩을 확정했다. SWR/React Query 는 YAGNI 원칙에 따라 Phase 5 로 연기.

## What Was Built

1. **AppShell `hideSidebar` 모드** — Phase 3 `AppShell` 에 `hideSidebar?: boolean` 추가. `true` 면 사이드바 영역/Drawer 를 렌더하지 않음. 기본 `false` 로 `/design` 카탈로그와의 호환성 보존.
2. **헤더 구성 확정** — 좌측 로고가 `next/link` → `/scanner`, 중앙은 `nav` 미지정 시 `disabled` Input placeholder("종목 검색 (Phase 6)", `>=lg` 한정), 우측 `ThemeToggle` 유지.
3. **`apiFetch` 클라이언트** — `src/lib/api.ts` 신규. Phase 2 envelope 파싱, `X-Request-Id` 캡처, 8s 기본 타임아웃(`AbortController`), 외부 signal 연결, `NEXT_PUBLIC_API_BASE_URL` 미설정 시 `http://localhost:8080` + `console.warn`. `ApiClientError({ code, message, status, requestId, cause })` 로 실패 통합.
4. **라우트**
   - `/` 서버 리다이렉트 → `/scanner`
   - `/scanner` 서버 컴포넌트: AppShell(`hideSidebar`) + 제목/안내 카피 + `apiFetch('/api/health')` 결과를 up/down Badge 로 표시 + 금융 컬러 배지 데모 + Skeleton 4행 미리보기. `revalidate = 30` 으로 ISR.
5. **전역 경계**
   - `error.tsx`: `'use client'` + CenterShell + reset 버튼. 개발 빌드에만 `error.message` 노출, 프로덕션은 `digest` 만.
   - `not-found.tsx`: CenterShell + "404" + `/scanner` 복귀 링크.
6. **메타데이터 & 파비콘** — `layout.tsx` 에 `metadata.description` 확장 + `viewport.themeColor` light/dark 분리(`#ffffff`/`#0a0a0a`). `app/icon.svg` 신규 — 모노크롬 레이더 픽토그램 (Next.js 15 file convention).
7. **환경변수** — `webapp/.env.local.example` 템플릿 추가. `.gitignore` 의 `.env*.local` 규칙 확인 완료(추가 변경 불필요).

## Commits (master 브랜치)

| # | SHA | 메시지 |
|---|---|---|
| 1 | `07bc665` | feat(webapp): AppShell에 hideSidebar prop 추가 |
| 2 | `dfafe6a` | feat(webapp): 헤더 로고 Link + Phase 6 검색 placeholder |
| 3 | `2a310bc` | feat(webapp): apiFetch 클라이언트 및 ApiClientError 추가 |
| 4 | `5c5cd22` | feat(webapp): / → /scanner 리다이렉트 및 Scanner placeholder |
| 5 | `23f3a48` | feat(webapp): error.tsx / not-found.tsx 전역 경계 추가 |
| 6 | `0d9bb1e` | feat(webapp): layout metadata/viewport 확장 + icon.svg 추가 |
| 7 | `460bf13` | chore(webapp): .env.local.example 추가 |

## Verification

- **`pnpm --filter @gh-radar/webapp typecheck`** — PASS (0 errors)
- **`pnpm --filter @gh-radar/webapp build`** — PASS
  - `✓ Compiled successfully in 3.2s`
  - `✓ Generating static pages (7/7)` — `/`, `/_not-found`, `/design`, `/icon.svg`, `/scanner`
  - `/scanner`: `3.28 kB`, First Load `189 kB`, `Revalidate 30s`
  - 빌드 로그에 `[gh-radar] NEXT_PUBLIC_API_BASE_URL 미설정 — … fallback` 노출 (의도된 경고, `.env.local` 미존재 환경이므로 정상)
  - ESLint 경고(`Cannot find package '@eslint/eslintrc'`) 는 Phase 3 이월 이슈 → `deferred-items.md` 기록, 빌드 성공에는 영향 없음
- **로컬 브라우저 smoke** — PENDING (사용자 수행 필요):
  - `/` → `/scanner` 리다이렉트
  - `/scanner` 헤더(로고 Link / 검색 placeholder / ThemeToggle) + "API 연결: OK" 배지
  - Light/Dark/System 3상태 전환
  - `/design` 회귀 없음
  - `/does-not-exist` → `not-found.tsx`
  - Phase 2 서버 중지 후 새로고침 → `API 연결: FAIL (TIMEOUT|NETWORK_ERROR)` 배지 (앱 크래시 X)

## Decisions Made (planner 재량 확정)

- `ApiClientError` 단일 클래스로 통합. 코드 네임스페이스(`TIMEOUT`/`NETWORK_ERROR`/`HTTP_<status>`/envelope code) 로 분류 — `NotFound/Timeout/Network` 서브클래스화는 YAGNI.
- `apiFetch` 기본 cache 는 `'no-store'`. 호출부에서 `cache: 'force-cache' + next.revalidate` override 로 ISR.
- `error.tsx` / `not-found.tsx` 모두 `CenterShell` 사용 (헤더 유지로 "돌아갈 곳" 제공).
- Scanner placeholder Skeleton 4행 — 테이블 첫 화면 시각 대응, 과도한 공간 소모 방지.
- `theme-color` dark hex 는 globals.css `--bg: oklch(0.08 0 0)` 의 sRGB 근사 `#0a0a0a` 사용. 추후 UI-SPEC 정밀 hex 확정 시 교체.
- `icon.svg` 는 외곽 라운드 사각형 + 2중 원 + 스윕 라인 조합의 미니멀 레이더 픽토그램.

## Deviations from Plan

Rules 1~3 자동 처리 없음. 계획대로 실행.

다만 Scanner 페이지 구현 중 **사소한 Next.js 캐시 세만틱 조정**이 있었음(deviation 미만):

- 초기 버전: `apiFetch` 호출 시 `cache: undefined as unknown as RequestCache` 로 기본값(`'no-store'`)을 우회하려 했으나, 타입 해킹이 우아하지 않아 `cache: 'force-cache' + next: { revalidate: 30 }` 명시적 조합으로 정리. ISR 동작은 동일.

## Known Stubs

- `/scanner` 본문(스캐너 테이블)은 **의도된 placeholder** — Phase 5 에서 실데이터 연결 (`apiFetch('/api/scanner')` + 상태 관리) 예정. CONTEXT D-02/D-07 에 따라 URL 유지 + 본 파일 교체 방식.
- 헤더 중앙 검색 Input 은 `disabled` placeholder — Phase 6 SRCH-02 에서 실 자동완성으로 교체.

## Deferred (Phase 4 범위 밖, 이관)

- **수동 Vercel 배포 절차** (PLAN.md §7): Vercel Dashboard 접근 권한이 필요해 사용자가 수행.
  1. Vercel → New Project → `deepblue-1/gh-radar` import, Root Directory `webapp`, Node 22.x
  2. Install `pnpm install --frozen-lockfile`, Build `pnpm build`
  3. Env: `NEXT_PUBLIC_API_BASE_URL` = `https://gh-radar-server-1023658565518.asia-northeast3.run.app` (Production + Preview)
  4. Ignored Build Step: `git diff --quiet HEAD^ HEAD -- webapp/ packages/shared/ pnpm-lock.yaml`
  5. Production 도메인: `gh-radar.vercel.app` 선점 확인 (실패 시 `gh-radar-app.vercel.app` 폴백)
  6. D-26 smoke 체크리스트 6항목 수동 검증
- **ESLint config 정비** — `@eslint/eslintrc` 경고 (Phase 3 이월). `deferred-items.md` 에 기록.
- **theme-color 정밀 hex 확정** — `03-UI-SPEC.md` 의 `--bg` 다크 토큰(oklch 0.08) 과 Vercel 브랜드 가이드 대비 후 차후 plan 에서 미세 조정 가능.

## Threat Flags

없음. 신규 네트워크 surface 없음 (기존 `/api/health` 호출). 인증/트러스트 경계 변경 없음.

## Follow-up

- Phase 5 착수 시 `/scanner` 파일을 실 Scanner UI 로 교체 (URL 유지). SWR/React Query 도입 여부 Phase 5 초기 결정.
- `apiFetch` 유닛 테스트(envelope 파싱·타임아웃) 는 Phase 5 데이터 연결 착수 전 별도 chore 로 추가 가능.

## Self-Check: PASSED

- 파일 존재 확인:
  - `webapp/src/app/scanner/page.tsx` ✅
  - `webapp/src/app/error.tsx` ✅
  - `webapp/src/app/not-found.tsx` ✅
  - `webapp/src/app/icon.svg` ✅
  - `webapp/src/lib/api.ts` ✅
  - `webapp/.env.local.example` ✅
  - `webapp/src/components/layout/app-shell.tsx` (hideSidebar) ✅
  - `webapp/src/components/layout/app-header.tsx` (로고 Link + placeholder) ✅
  - `webapp/src/app/layout.tsx` (viewport.themeColor) ✅
  - `webapp/src/app/page.tsx` (redirect) ✅
- 커밋 존재 확인:
  - `07bc665` ✅
  - `dfafe6a` ✅
  - `2a310bc` ✅
  - `5c5cd22` ✅
  - `23f3a48` ✅
  - `0d9bb1e` ✅
  - `460bf13` ✅
- 빌드/타입체크 검증 완료. 브라우저 smoke + Vercel 배포 단계는 사용자 수동 작업으로 전환.
