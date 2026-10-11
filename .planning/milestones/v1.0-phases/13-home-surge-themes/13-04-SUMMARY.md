---
phase: 13-home-surge-themes
plan: 04
subsystem: home-surge-themes
tags: [webapp, react, client, read-only, ui-spec, tokens, a11y, stale-but-visible]
requires:
  - "@gh-radar/shared HomeSnapshotResponse 계약 (13-01)"
  - "GET /api/home 읽기 라우트 { snapshot, index } (13-03)"
  - "13-UI-SPEC.md 승인 목업 (Toss 토큰, 4크기/2weight, RED --up)"
provides:
  - "webapp/src/lib/home-api.ts (fetchHome — apiFetch<HomeSnapshotResponse>)"
  - "webapp/src/hooks/use-home-query.ts (stale-but-visible, 폴링 없음, 파라미터 전환 재조회)"
  - "홈 컴포넌트 세트 (home-client 상태머신 + header/theme-card/solo-card/news-block/empty/skeleton)"
  - "/home-preview 시각 검증 프리뷰 (임시 — Plan 05 제거)"
affects:
  - 13-05 (홈 / 루트 마운트 + app-sidebar NAV) — HomeClient 소비, /home-preview + middleware 항목 제거
tech-stack:
  added: []
  patterns:
    - "읽기 전용 fetch 훅 (폴링 없음 + AbortController 파라미터 전환 재조회, useThemesQuery 변형)"
    - "stale-but-visible 에러 (이전 data 보존 + 고정 카피, T-13-09 / scanner-error 선례)"
    - "verbatim 뉴스 anchor (target=_blank rel=noopener noreferrer, T-13-11)"
    - "globals 토큰 전용 (4크기/2weight, RED --up 등락%, color-mix 토큰 조합, 하드코딩 색 0)"
key-files:
  created:
    - webapp/src/lib/home-api.ts
    - webapp/src/hooks/use-home-query.ts
    - webapp/src/components/home/news-block.tsx
    - webapp/src/components/home/theme-card.tsx
    - webapp/src/components/home/solo-card.tsx
    - webapp/src/components/home/home-header.tsx
    - webapp/src/components/home/home-empty.tsx
    - webapp/src/components/home/home-skeleton.tsx
    - webapp/src/components/home/home-client.tsx
    - webapp/src/app/home-preview/page.tsx
  modified:
    - webapp/src/lib/supabase/middleware.ts
decisions:
  - "useHomeQuery 는 폴링 없음 — 홈은 시점별(:30) 이력 조망 화면이라 사용자 탐색(date/slot 전환)이 fetch 트리거. AbortController 로 파라미터 빠른 전환 레이스 차단"
  - "슬롯 HH:MM 라벨 + 마감 판별은 Intl.DateTimeFormat timeZone=Asia/Seoul (KST 15:30 = '· 마감'). capturedAt(UTC ISO) → KST 변환"
  - "home-client isEmpty = snapshot null OR (themes[] 비어있음 AND singles[] 비어있음) — populated/empty 경계"
  - "/home-preview 프리뷰 라우트 + middleware PUBLIC_EXACT 항목은 임시 — home-client 가 라이브 /api/home 을 호출하므로 네트워크 무관 시각 검증을 위해 목데이터 프리뷰 채택. Plan 05 가 / 루트 마운트 시 둘 다 제거"
metrics:
  duration: ~25min (체크포인트 대기 제외)
  tasks: 3
  files: 11
  completed: 2026-07-02
---

# Phase 13 Plan 04: 홈 급등 테마 컴포넌트 세트 Summary

HOME-01 의 사용자 대면 가치를 구현: 13-UI-SPEC(승인 목업) 을 충실히 따르는 홈 화면 컴포넌트 세트 — fetch 레이어(home-api + useHomeQuery), 헤더(타이틀 + 날짜 네비 + 시점 pill 행), 테마 카드(mini-row 소속 종목 + 근거 뉴스 블록), 개별 급등 카드, 빈/스켈레톤/에러 상태, 그리고 loading/populated/empty/error 4-상태 머신(home-client). 모든 색은 globals 토큰만(RED --up 등락%, 4크기/2weight, 하드코딩 색 0), 뉴스 anchor 는 verbatim + rel=noopener(T-13-11), 에러는 stale-but-visible + 고정 카피(T-13-09). 시각 검증 체크포인트 승인(라이트+다크). 이 plan 은 컴포넌트만 생산 — Plan 05 가 `/` 루트에 마운트하고 사이드바를 교체한다.

## What Was Built

### Task 1 — fetch 레이어 + 카드 프레젠테이션 컴포넌트 (commit `a4f9883`)
- **lib/home-api.ts**: `fetchHome({ date?, capturedAt? }, signal?)` = `apiFetch<HomeSnapshotResponse>('/api/home?...')`. capturedAt 우선(date 무시), 무필터 시 최신. server 가 payload 를 verbatim 서빙(T-13-03) — 과거 슬롯 시세 오염 없음.
- **hooks/use-home-query.ts**: `useHomeQuery({ date?, capturedAt? })` — `{ data, isLoading, isRefreshing, error, refresh }`. useThemesQuery 의 stale-but-visible + mountedRef 계승하되 **폴링 없음**(이력 조망 화면). 각 load 가 자체 AbortController 로 이전 요청 취소(파라미터 빠른 전환 레이스). error.message 는 console.error 에만, UI 는 error state 만 노출(T-13-09).
- **components/home/news-block.tsx**: `NewsBlock({ news, showLabel })` — border-subtle 구분선 + (테마만) "근거 뉴스" label(caption 800) + 최대 2 anchor(--flat dot, 제목 14/400, 출처 12 muted + ↗). 전부 `target=_blank rel="noopener noreferrer"`(T-13-11). title/url/source verbatim.
- **components/home/theme-card.tsx**: `ThemeCard({ theme })` — 헤더(테마명 --t-h4 800 + 이유 muted 14/400 | 평균등락 --t-h4 800 mono --up + "평균 등락" cap), mini-row(grid 1fr auto, change% desc 정렬, top 4 + "+N개 종목 더"), NewsBlock showLabel. hover border --primary tint.
- **components/home/solo-card.tsx**: `SoloCard({ single })` — 헤더(종목명 14/800 + 코드 mono caption | change% --t-lg=18 mono 800 --up) + 이유(있으면) + NewsBlock showLabel=false.

### Task 2 — 헤더(날짜/시점 네비) + 빈/스켈레톤/에러 + home-client (commit `48632b4`)
- **components/home/home-header.tsx**: `HomeHeader` — 타이틀 "오늘의 급등 테마"(--t-h2 24/800) + 날짜 네비(prev/next 32×32 aria-label "이전 날짜"/"다음 날짜" + mono 날짜 14/800 + "오늘" reset pill; 최신 날짜서 next disabled, 과거 없으면 prev disabled) + 시점 pill 행(index 를 선택 날짜로 필터 + 오름차순; .on = --primary fill 800; 최신 슬롯 --up dot; HH:MM, 마감 "HH:MM · 마감"; overflow-x auto). 슬롯 라벨/마감 판별 = Intl.DateTimeFormat timeZone=Asia/Seoul.
- **components/home/home-empty.tsx**: dashed border(color-mix --primary 30%) + 원형 --accent Sparkles + heading(--t-h4 800) + body(muted 14/400 max-w 44ch) + "스캐너로 이동" Link → /scanner. role=status.
- **components/home/home-skeleton.tsx**: 헤더 골격(타이틀 + 네비 + 슬롯 7개) + 카드 골격 2개(skeleton-list stagger, prefers-reduced-motion 상속).
- **components/home/home-client.tsx** ('use client'): useHomeQuery + 4-상태 머신. loading → HomeSkeleton. error+no-data → 인라인 에러 카드("불러오지 못했습니다" / "잠시 후 다시 시도해 주세요." / "다시 불러오기"). populated → HomeHeader + "주도 테마"(count-badge) ThemeCard 매핑 + "개별 급등"(count-badge) SoloCard 매핑. empty(snapshot null OR themes+singles 모두 비어있음) → HomeEmpty. error+data → stale-but-visible + 하단 에러 카드 병기. 네비 state(selected {date, capturedAt}) → 날짜 전환 시 그 날짜 최신 슬롯 선택, 오늘 = 무필터 리셋. index 는 useMemo 안정 identity(lint 준수).

### Task 3 — [CHECKPOINT] 시각 검증 (승인) + 프리뷰 스캐폴드 (commits `de65fb4`, `3a298d6`)
- **app/home-preview/page.tsx** ('use client', 임시): home-client 가 라이브 /api/home 을 호출하므로, 네트워크 무관 시각 검증을 위해 홈 컴포넌트를 목데이터로 populated(주도 테마 2 + 개별 급등 1) + empty + skeleton 3변형 렌더. AppShell + max-w-5xl 로 실 레이아웃 재현.
- **lib/supabase/middleware.ts**: PUBLIC_EXACT 에 `/home-preview` 추가(로그인 없이 검증 접근). 임시 — Plan 05 제거.
- 로컬 dev(port 3100) 기동 → `/home-preview` 200 + HTML grep 검증(타이틀/테마카드/평균등락/overflow/근거뉴스/solo/empty/"15:30 · 마감"/rel=noopener 전량 렌더). **사용자 시각 검증 승인**(라이트+다크, UI-SPEC 대조 통과).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 시각 검증 라우트가 auth middleware 로 차단됨**
- **Found during:** Task 3 (프리뷰 라우트 probe 시 307 → /login)
- **Issue:** webapp middleware 는 `/`·`/login`·`/auth` 만 공개(PUBLIC_EXACT/PREFIXES). 신규 `/home-preview` 가 비로그인 시 /login 리다이렉트 → 프론트 시각 검증 불가.
- **Fix:** PUBLIC_EXACT 에 `/home-preview` 추가(임시). 홈이 마운트될 `/` 루트가 이미 공개라 정책 일관. Plan 05 가 라우트 + 화이트리스트 항목 함께 제거.
- **Files modified:** webapp/src/lib/supabase/middleware.ts
- **Commit:** `3a298d6`

**2. [Rule 1 - Lint] home-client index 파생값이 useCallback deps 를 매 렌더 변경**
- **Found during:** Task 2 (pnpm lint)
- **Issue:** `const index = data?.index ?? []` 가 매 렌더 새 배열 참조 → onSelectDate/onSelectSlot useCallback 이 매번 재생성(react-hooks/exhaustive-deps 경고).
- **Fix:** `index` 를 useMemo(deps=[data]) 로 감싸 data 불변 시 안정 identity 유지. 경고 0.
- **Files modified:** webapp/src/components/home/home-client.tsx
- **Commit:** `48632b4` (Task 2 에 포함)

## Verification

- `pnpm --filter webapp build` → exit 0 (전 태스크). /home-preview prerender 포함 11/11 static pages green.
- `pnpm --filter webapp lint` → home 컴포넌트 경고 0 (theme-detail-client 의 기존 unused-var 경고는 out-of-scope, 미변경).
- Task 1 acceptance grep 전량 PASS: api/home, apiFetch, var(--up) theme-card, rel=noopener, 하드코딩 색 무매치, "개 종목 더".
- Task 2 acceptance grep 전량 PASS: "오늘의 급등 테마", "이전 날짜"/"다음 날짜", "· 마감", "급등 종목이 없습니다", "스캐너로 이동", role=status, "다시 불러오기", useHomeQuery, "주도 테마"/"개별 급등".
- 라이브 `/home-preview` 200 + HTML 렌더 grep 9종 PASS (마감 슬롯 KST 변환 포함).
- 시각 체크포인트 승인 (라이트+다크, UI-SPEC 대조).

## Threat Model Coverage

- **T-13-11 (reverse tabnabbing) — mitigate**: news-block 모든 외부 anchor 에 `target="_blank" rel="noopener noreferrer"`. grep 검증 + 라이브 HTML 확인.
- **T-13-09 (error internals 노출) — mitigate**: home-client 에러 카드 고정 카피("불러오지 못했습니다" / "잠시 후 다시 시도해 주세요.")만 렌더, error.message 미노출. useHomeQuery 가 console.error 로 분리 로깅.

## Known Stubs

None — 컴포넌트/훅/fetch 레이어 모두 실 로직. 홈을 `/` 루트에 마운트하고 사이드바 NAV 를 교체하는 것은 계획상 Plan 05 범위(스텁 아님, 미래 plan).

## Temporary Scaffolding (Plan 05 removes)

- **webapp/src/app/home-preview/page.tsx** — 시각 검증 전용 목데이터 프리뷰. Plan 05 가 HomeClient 를 `/` 루트에 실 마운트하면 불필요.
- **webapp/src/lib/supabase/middleware.ts PUBLIC_EXACT 의 `/home-preview` 항목** — 프리뷰 공개 접근용. 위 라우트와 함께 제거.

두 항목 모두 이번 커밋 범위에 존재하며, Plan 05 실행 시 제거하도록 명시했다(코디네이터 지시대로 지금은 유지).

## Threat Flags

None — 신규 표면은 읽기 전용 클라이언트 fetch(/api/home, plan 03 이 Zod+RLS 로 이미 커버)와 임시 프리뷰 라우트(목데이터, 외부 입력 0). 신규 인증 경로/파일 접근/스키마 변경 없음. 뉴스 anchor 는 verbatim 렌더이나 T-13-11(rel=noopener) 로 이미 커버.

## Self-Check: PASSED
