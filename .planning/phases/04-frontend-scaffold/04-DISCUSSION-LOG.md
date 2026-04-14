# Phase 4: Frontend Scaffold — Discussion Log

> **감사 추적용 기록.** 계획/연구/실행 에이전트 입력으로 사용하지 말 것.
> 결정은 CONTEXT.md에 있으며, 본 문서는 논의된 대안을 보존한다.

**Date:** 2026-04-14
**Phase:** 04-frontend-scaffold
**Areas discussed:** 홈 페이지 & 라우트 구조, 네비게이션 구성(AppShell), API 클라이언트 셋업, Vercel 배포 & 환경변수

---

## 영역 선택

| Option | Description | Selected |
|---|---|---|
| 홈 페이지 & 라우트 구조 | `/` 처리 + placeholder 라우트 전략 | ✓ |
| 네비게이션 구성 (AppShell) | 헤더/사이드바 메뉴, 로고/테마토글 배치 | ✓ |
| API 클라이언트 셋업 | Cloud Run URL 주입, fetch wrapper, SWR/Query 시점 | ✓ |
| Vercel 배포 & 환경변수 | monorepo 빌드, preview 정책, 도메인, CORS 연계 | ✓ |
| (미선택) 메타데이터 & SEO | title/OG/favicon/manifest — Vercel 영역에 묶어 처리 | — |
| (미선택) 에러·로딩 UX 셋업 | error.tsx/not-found.tsx/loading.tsx — Vercel 영역에 묶어 처리 | — |

**사용자 선택:** 네 개 모두 선택. 메타/에러 경계는 4번 영역에 묶어 함께 논의.

---

## 홈 페이지 & 라우트 구조

### Q1. `/` (루트) 페이지를 무엇으로?

| Option | Description | Selected |
|---|---|---|
| `/` → `/scanner` 리다이렉트 | 서버 사이드 redirect, URL 의미론 명확 | ✓ (추천안 위임) |
| `/` 스캐너 직방 | 리다이렉트 없이 루트에서 바로 스캐너 | |
| 리서치/루트 대시보드 | 루트에 스캐너 미니 + 검색바 | |

**사용자 선택:** "어떻게 하면 좋을지 의견줘" → Claude 추천안(리다이렉트) 제시 → 사용자 승인
**근거:** v1 핵심이 Scanner(Core Value). URL 안정성(Phase 5 교체 시 URL 유지). 네비게이션 jitter 방지.

### Q2. Phase 4에서 미리 만들 라우트는?

| Option | Description | Selected |
|---|---|---|
| `/scanner`만 스텁으로 추가 | YAGNI, 홈 리다이렉트 유효화 최소 수준 | ✓ (추천안 위임) |
| Phase 5·6 핵심 라우트 전부 스텁 | `/scanner` + `/stocks/[code]` 등 | |
| 스텁 없이 `/` + `/design`만 | `/` 자체가 스캐너 안내 페이지 | |

**사용자 선택:** "의견을 줘 추천하는게 뭔지" → Claude 추천안(`/scanner` 단일 스텁) 제시 → 사용자 승인
**근거:** Phase 4 목표는 배포 검증. Phase 6 설계가 Phase 4 스텁에 묶이는 위험 회피.

### Q3. 추천안(`/` → `/scanner` + `/scanner` 스텁)으로 확정?

| Option | Description | Selected |
|---|---|---|
| 좋아, 추천안으로 | 승인 | ✓ |
| 조정 필요 | 대시보드 또는 다른 라우트 추가/제거 | |

**사용자 선택:** 좋아, 추천안으로

---

## 네비게이션 구성 (AppShell)

**Claude 분석:** v1 메뉴는 Scanner 중심이라 사이드바가 빈약해짐. Phase 3 AppShell 수정 vs 신규 레이아웃 도입 트레이드오프 제시.

### Q1. AppShell 사이드바 처리는 어떻게?

| Option | Description | Selected |
|---|---|---|
| AppShell에 `hideSidebar` prop 추가 | Phase 3 컴포넌트 수정, v2에서 재활성 | ✓ |
| 새 `HeaderShell` 레이아웃 도입 | Phase 3 그대로, 레이아웃 3종으로 확장 | |
| AppShell 그대로 + 사이드바에 Scanner 링크 하나 | UI 빈약/모바일 공간 낭비 | |

**근거:** 아키텍처 일관성 + 최소 추상화. v2 전환 코스트 낮음.

### Q2. 헤더 Search 자리는?

| Option | Description | Selected |
|---|---|---|
| Phase 4는 빈 공간/placeholder 예약 | disabled input bar, Phase 6에서 교체 | ✓ |
| Search 자리 없이 로고+토글만 | Phase 6에서 레이아웃 재구성 필요 | |

**근거:** Phase 6 도입 시 헤더 레이아웃 jitter 방지. 사용자 시그널("곧 검색 가능").

---

## API 클라이언트 셋업

### Q1. Phase 4에서 어디까지?

| Option | Description | Selected |
|---|---|---|
| fetch wrapper + 타입 + /health smoke | 얇은 wrapper, 서버 컴포넌트에서 health 호출 | ✓ |
| 환경변수만, smoke는 Phase 5 | 스코프 최소화 | |
| SWR까지 미리 도입 | 미사용 의존성 | |

**근거:** 배포 smoke의 1차 방어선 확보 (CORS/환경변수 오타 조기 발견).

### Q2. Cloud Run URL 연결 검증 방식?

| Option | Description | Selected |
|---|---|---|
| 서버 컴포넌트에서 /health 호출 | /scanner placeholder에 "API 연결: OK/FAIL" 배지 | ✓ |
| 호출 없이 빌드만 검증 | Phase 5로 미룸 | |

**근거:** 배포 후 실제 연결 상태가 시각적으로 보여 재발 방지.

---

## Vercel 배포 & 환경변수

### Q1. Vercel 설정 추천안(Root=webapp, pnpm, Preview 자동, 기본 도메인) 그대로?

| Option | Description | Selected |
|---|---|---|
| 좋아, 추천안으로 | 최소 설정 | (Q2 후 확정) |
| 조정 필요 | 커스텀 도메인/Preview 정책 변경 | |

**사용자 질문:** "프리뷰가 무슨 역할이야? pr마다 자동 생성이 뭐야? master에 머지하면 배포되는거야?" → Claude가 Production/Preview/Development 3종 설명. Phase 2 CORS 정규식이 이미 Preview 패턴 커버함을 재확인.

### Q2. Preview 정책 추천(모든 브랜치 push 자동 Preview + master 머지 Production) 그대로?

| Option | Description | Selected |
|---|---|---|
| 좋아, 추천안으로 | 일반적 Vercel 기본 워크플로와 정합 | ✓ |
| Production만, Preview 끄기 | 빌드 절감 but 검증 지연 | |
| 수동 배포만 | CI/CD 훅 없음 | |

**근거:** PR에서 실제 배포 URL 즉시 접근 가능 → 머지 전 Cloud Run 연결까지 검증.

### Q3. 메타/에러 경계 범위?

| Option | Description | Selected |
|---|---|---|
| 기본 metadata + error.tsx + not-found.tsx | 글로벌 fallback 확보, loading은 Phase 5+ | ✓ |
| metadata만, 경계는 Phase 5+ | 스코프 최소 but 글로벌 에러 미방어 | |
| 풀셋 (metadata + error + not-found + loading + OG + manifest) | 과투자 | |

**근거:** 글로벌 에러/404 방어는 배포 전 최소선. loading은 실 데이터 로딩 Phase(5·6)에서 세그먼트별 도입.

---

## Claude's Discretion (CONTEXT.md 참조)

- `apiFetch` 구체 시그니처, 타임아웃 기본값, 헤더 병합 방식
- `error.tsx` / `not-found.tsx` 카피 및 CenterShell 사용 여부
- Scanner placeholder Skeleton 개수/배치
- `ApiClientError` 클래스 계층 세분화
- `theme-color` 실 hex (UI-SPEC.md 참조)
- Favicon 디자인
- `next.config.ts` 세부 (`output: 'standalone'`, experimental)
- `.env.local.example` 안내 주석
- Vercel "Ignored Build Step" 정확 문법
- `apiFetch` `next.revalidate` / `cache` 기본값

## Deferred Ideas (CONTEXT.md 참조)

- 커스텀 도메인, OG/manifest, SWR/React Query, Analytics/Sentry, Playwright E2E, robots/sitemap, loading.tsx, i18n, v2 사이드바 재활성, Edge Middleware, standalone 빌드.
