# Phase 4: Frontend Scaffold — Implementation Plan

## Context

Phase 3에서 구축된 Next.js 15 + Tailwind v4 디자인 시스템 위에 **실제 사용자가 접근하는 라우트**(`/` → `/scanner`)와 글로벌 UX 기반(AppShell 헤더 모드, API 클라이언트, 에러 경계, 메타데이터, Vercel 배포)을 얹는다. Phase 5 Scanner 실구현 직전에 **배포 파이프라인·API 연결·기본 레이아웃**을 확정해 향후 기능 구현이 순수하게 페이지 로직에만 집중되도록 한다.

입력:
- `.planning/phases/04-frontend-scaffold/04-CONTEXT.md` — 결정 D-01~D-28
- Phase 2 API(`/api/health` envelope, CORS 정규식, `X-Request-Id`)
- Phase 3 AppShell/CenterShell, next-themes, 금융 컬러 토큰

## Approach

### 1. AppShell `hideSidebar` 확장 (소스 수정)
- `webapp/src/components/layout/app-shell.tsx`
  - `AppShellProps`에 `hideSidebar?: boolean` (기본 `false`) 추가
  - `hideSidebar === true` 이면 사이드바 영역 + 모바일 Drawer 토글 버튼을 렌더하지 않고, 메인 컨테이너의 그리드/여백을 헤더 전용 레이아웃으로 단순화
  - Phase 3 `/design` 카탈로그 호출부는 기본값 유지로 regression 없음

### 2. Header Search Placeholder (D-06)
- `webapp/src/components/layout/app-header.tsx`
  - 좌측 로고: `next/link` → `/scanner`
  - 중앙: `<Input disabled placeholder="종목 검색 (Phase 6)">` — `max-w-sm`, `lg:` 이상에서만 표시(`hidden lg:flex`)
  - 우측: 기존 `ThemeToggle` 유지
  - `hideSidebar` 모드에서도 레이아웃 깨지지 않도록 flex 정렬 재확인

### 3. API 클라이언트 `webapp/src/lib/api.ts` (신규, D-09~D-12)
- `ApiClientError extends Error`: `{ code, message, status, requestId? }`
- `apiFetch<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T>`
  - Base URL: `process.env.NEXT_PUBLIC_API_BASE_URL` — 미설정 시 개발용 `http://localhost:8080` fallback + `console.warn`
  - `new URL(path, base).toString()` — 절대/상대 양쪽 허용
  - `AbortController` + 기본 8초 timeout
  - 응답 `!res.ok`: Phase 2 envelope `{error:{code,message}}` 파싱 시도 → `ApiClientError` throw (`X-Request-Id` 헤더 캡처)
  - JSON 파싱 실패 시 `code='NETWORK_ERROR'`로 wrap
  - 기본 `cache: 'no-store'` (호출부에서 `next: { revalidate }` override 가능)
- `@gh-radar/shared` 에서 `ApiError`/envelope 타입 import (없으면 `packages/shared/src/api.ts` 에 최소 타입 추가 후 re-export)

### 4. 라우트 구성
- `webapp/src/app/page.tsx` **교체**:
  ```ts
  import { redirect } from 'next/navigation';
  export default function Home() { redirect('/scanner'); }
  ```
- `webapp/src/app/scanner/page.tsx` **신규** (서버 컴포넌트):
  - `export const revalidate = 30`
  - `apiFetch<HealthResponse>('/api/health')` try/catch → 성공 시 `<Badge variant="up">API 연결: OK</Badge>`, 실패 시 `<Badge variant="down">API 연결: FAIL ({code})</Badge>`
  - `<AppShell hideSidebar>` 로 감싸고, 본문: 제목 "Scanner" + 안내 카피("실시간 스캐너는 Phase 5에서 활성화됩니다") + `Skeleton` 3~4개(테이블 행 미리보기) + 금융 컬러 데모 배지(up/down) 1줄
- `webapp/src/app/error.tsx` **신규** (클라이언트 컴포넌트, `"use client"`):
  - `CenterShell` + 제목("문제가 발생했어요") + 짧은 메시지 + `Button onClick={reset}>다시 시도</Button>`
  - 프로덕션에서는 `error.digest` 만 표시, stack 비노출
- `webapp/src/app/not-found.tsx` **신규**:
  - `CenterShell` + "페이지를 찾을 수 없어요" + `Link href="/scanner">스캐너로 돌아가기</Link>`

### 5. 메타데이터 & 파비콘 (D-19)
- `webapp/src/app/layout.tsx` 수정:
  - `export const metadata: Metadata = { title: 'gh-radar', description: '한국 주식 실시간 상한가 근접 스캐너' }`
  - `export const viewport: Viewport = { themeColor: [{ media:'(prefers-color-scheme: dark)', color: '#0a0a0a' }, { media:'(prefers-color-scheme: light)', color: '#ffffff' }] }` (UI-SPEC 대조 후 실 hex 확정)
  - 기존 `ThemeProvider`, Pretendard 폰트 로드, `suppressHydrationWarning` **변경 없음**
- `webapp/src/app/icon.svg` 신규 — 심플 모노크롬 레이더 픽토그램 (Next.js 15 파일 컨벤션; 별도 ICO 없이 자동 최적화)

### 6. 환경변수
- `webapp/.env.local.example` 신규:
  ```
  # Phase 2 Cloud Run 서비스 URL. Production/Preview/Development 모두 동일.
  NEXT_PUBLIC_API_BASE_URL=https://gh-radar-server-xxxx.asia-northeast3.run.app
  ```
- `webapp/.gitignore` 에 `.env.local` 이미 포함 여부 확인 (Next.js 기본 템플릿 포함 예상)

### 7. Vercel 프로젝트 연결 (D-21~D-26, 수동 단계)
PLAN.md 에 **체크리스트 형태의 수동 절차**로 기록 (코드 변경 아님):
1. Vercel Dashboard → New Project → GitHub repo `deepblue-1/gh-radar` import
2. Root Directory: `webapp`, Node.js: 22.x
3. Install: `pnpm install --frozen-lockfile`, Build: `pnpm build`
4. Environment Variables: `NEXT_PUBLIC_API_BASE_URL` (Production+Preview) = Phase 2 Cloud Run URL
5. **Ignored Build Step**: `git diff --quiet HEAD^ HEAD -- webapp/ packages/shared/ pnpm-lock.yaml`
6. Production 도메인: `gh-radar.vercel.app` (선점 시 `gh-radar-app.vercel.app` 폴백)
7. Preview 배포 활성 확인 (master 외 브랜치 자동)
8. 첫 배포 → smoke 체크리스트(D-26) 6항목 수동 검증

## Files

**Modify:**
- [webapp/src/components/layout/app-shell.tsx](webapp/src/components/layout/app-shell.tsx) — `hideSidebar` prop
- [webapp/src/components/layout/app-header.tsx](webapp/src/components/layout/app-header.tsx) — Search placeholder, 로고 Link
- [webapp/src/app/page.tsx](webapp/src/app/page.tsx) — `redirect('/scanner')` 로 교체
- [webapp/src/app/layout.tsx](webapp/src/app/layout.tsx) — metadata/viewport 추가

**Create:**
- [webapp/src/app/scanner/page.tsx](webapp/src/app/scanner/page.tsx)
- [webapp/src/app/error.tsx](webapp/src/app/error.tsx)
- [webapp/src/app/not-found.tsx](webapp/src/app/not-found.tsx)
- [webapp/src/app/icon.svg](webapp/src/app/icon.svg)
- [webapp/src/lib/api.ts](webapp/src/lib/api.ts)
- [webapp/.env.local.example](webapp/.env.local.example)
- (필요 시) [packages/shared/src/api.ts](packages/shared/src/api.ts) — envelope 타입

**Reuse (수정 없음):**
- `webapp/src/components/layout/{center-shell,theme-toggle}.tsx`
- `webapp/src/components/ui/{badge,button,input,skeleton}.tsx`
- `webapp/src/components/providers/theme-provider.tsx`
- `webapp/src/lib/{utils,fonts}.ts`, `webapp/src/styles/globals.css`

## Verification

### 로컬
1. `pnpm install`
2. `cp webapp/.env.local.example webapp/.env.local` → 로컬 값 채우기 (`http://localhost:8080` 또는 Cloud Run URL)
3. Phase 2 서버 기동(`./dev.sh` 또는 `pnpm --filter @gh-radar/server dev`) + `pnpm --filter @gh-radar/webapp dev`
4. 브라우저 체크:
   - `/` 접근 → 서버 302로 `/scanner` 이동
   - `/scanner` 에 헤더(로고/Search placeholder/ThemeToggle) + "API 연결: OK" 배지
   - ThemeToggle Light/Dark/System 3상태 전환 작동
   - `/design` 기존 카탈로그 정상 (regression 없음)
   - `/does-not-exist` → `not-found.tsx` 렌더
   - DevTools throttling/서버 중지 후 새로고침 → `/scanner` 가 "API 연결: FAIL" 배지 표시 (앱 크래시 X)
5. `pnpm --filter @gh-radar/webapp typecheck && pnpm --filter @gh-radar/webapp build` 통과

### 배포 (Vercel)
6. Vercel Production 배포 트리거 → 빌드 성공
7. `https://gh-radar.vercel.app` (또는 확정된 도메인)에서 D-26 smoke 6항목 수동 체크
8. PR(feature 브랜치) 올려 Preview URL 생성 + CORS 통과(`/api/health` 호출 성공) 확인

### Success Criteria 매핑 (ROADMAP Phase 4)
- #1 Vercel 배포 성공 + Production URL 접근 → 배포 단계
- #2 `/` → `/scanner` 서버 리다이렉트 → 로컬 + 배포 smoke
- #3 API 연결 배지(`/api/health`) → Scanner placeholder
- #4 Light/Dark 테마 전환 → smoke #3

## Notes

- 커밋 규칙(전역 CLAUDE.md): 한글 메시지, 사용자 확인 후 진행, push 포함, Co-Authored-By 금지
- 완료 후 `.planning/STATE.md` `current_focus` → "Phase 5 - Scanner UI"
- `theme-color` 실 hex 은 실행 시 `03-UI-SPEC.md` 참조하여 최종 확정
- SWR/React Query 도입은 Phase 5 (여기서 미리 도입 금지, YAGNI)
