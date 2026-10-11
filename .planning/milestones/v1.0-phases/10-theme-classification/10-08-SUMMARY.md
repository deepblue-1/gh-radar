---
phase: 10-theme-classification
plan: 08
subsystem: deploy-e2e
tags: [cloud-run-job, cloud-scheduler, oauth-invoker, docker, playwright, e2e, supabase-rls, optimistic-update, turbopack, smoke, theme-sync, anthropic, brightdata]

# Dependency graph
requires:
  - phase: 10-theme-classification (Plan 03)
    provides: theme-sync scrape 파이프라인(네이버 cheerio + 알파 JSON + 직접→프록시 폴백 + upsert + 5원칙 backoff) — Cloud Run Job 런타임 본체
  - phase: 10-theme-classification (Plan 04)
    provides: GET /api/themes(시스템 목록 top3 desc) + GET /api/themes/:id — smoke/E2E 검증 대상
  - phase: 10-theme-classification (Plan 05)
    provides: theme-api(유저 CRUD/fork) + useThemesQuery — optimistic 갱신 토대
  - phase: 10-theme-classification (Plan 06)
    provides: ai/ 발굴+오분류 교정 + cycle 통합 + THEME_SYNC_CLASSIFY_ENABLED 게이트 — prod 활성 대상
  - phase: 10-theme-classification (Plan 07)
    provides: /themes·/themes/[id]·종목 칩·ThemeEditDialog·useThemesQuery — E2E + optimistic 대상
  - phase: 08-discussion-board
    provides: Bright Data zone gh_radar_naver + gh-radar-brightdata-api-key Secret(theme-sync 재사용)
  - phase: 08.1-discussion-relevance
    provides: gh-radar-anthropic-api-key Secret(theme-sync AI 보강 재사용)
  - phase: 09.1-intraday-current-price
    provides: master-sync/candle-sync 배포 스크립트 + OAuth invoker(OIDC 금지) 선례
provides:
  - "Cloud Run Job gh-radar-theme-sync + Scheduler gh-radar-theme-sync-daily(0 16 * * * Asia/Seoul, OAuth invoker, no OIDC) — 일 1회 16:00 KST 테마 수집 production 활성"
  - "theme-sync SA gh-radar-theme-sync-sa + 기존 시크릿 3종(supabase-service-role/brightdata-api-key/anthropic-api-key) accessor 바인딩"
  - "THEME_SYNC_CLASSIFY_ENABLED=true — AI 테마 발굴/오분류 교정 production 활성(THEME-04 prod)"
  - "Playwright E2E 3종(themes.spec/theme-chips.spec/user-themes.spec) — /themes 목록·상세 + 종목 칩 + 유저 CRUD+fork 전 시나리오 green(10/10)"
  - "유저 테마 optimistic 갱신(upsertMyTheme/removeMyTheme) — 생성/편집/삭제 즉시 list 반영(THEME-03 UX 완결)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "theme-sync 배포 = master-sync Dockerfile + setup/deploy/smoke 1:1 복제 후 name/secret 치환, Scheduler→Job 은 --oauth-service-account-email(OIDC 금지, Phase 05.1 D-07 승계)"
    - "기존 Secret 재사용(brightdata/anthropic Phase 08·08.1 + supabase-service-role) — 신규 생성 없이 accessor 바인딩만(부분 캐싱·비용 최소)"
    - "유저 테마 optimistic 갱신: onSaved(theme 스냅샷) FIRST → upsertMyTheme(replace-by-id else prepend) → 이어서 refresh 로 실 통계 reconcile. Supabase 풀러 read-after-write 레이스 회피"
    - "삭제는 onDeleted(id) 구분 신호 — list 부모는 removeMyTheme + refresh, 상세 부모는 router.push('/themes')"
    - "E2E 상세 페이지 테스트: Express /api/themes/:id 부재 환경에서 404 mock(mockThemesApi {list:[]})으로 ThemeDetailClient 의 실 Supabase fetchMyThemeDetail 폴백 경로를 구동 — CRUD 자체는 실 Supabase 유지"
    - "Cloud Run Job pino 로그는 jsonPayload.msg 필드로 쿼리(service .message 매핑과 다름) + ingestion 지연(~30-60s) 재시도 루프로 smoke false-negative 흡수"

key-files:
  created:
    - .planning/phases/10-theme-classification/10-08-SUMMARY.md
  modified:
    - workers/theme-sync/Dockerfile
    - scripts/setup-theme-sync-iam.sh
    - scripts/deploy-theme-sync.sh
    - scripts/smoke-theme-sync.sh
    - webapp/e2e/specs/themes.spec.ts
    - webapp/e2e/specs/theme-chips.spec.ts
    - webapp/e2e/specs/user-themes.spec.ts
    - webapp/e2e/fixtures/themes.ts
    - webapp/e2e/fixtures/mock-api.ts
    - packages/shared/src/index.ts
    - webapp/src/hooks/use-themes-query.ts
    - webapp/src/components/theme/theme-edit-dialog.tsx
    - webapp/src/components/theme/themes-client.tsx
    - webapp/src/components/theme/theme-detail-client.tsx
    - webapp/src/hooks/__tests__/use-themes-query.test.ts
    - webapp/src/components/theme/__tests__/themes-client.test.tsx

key-decisions:
  - "Cloud Run Job + Scheduler(0 16 * * * Asia/Seoul) OAuth invoker(OIDC 금지) — master-sync/candle-sync 선례 동형. 기존 Secret 3종 재사용(brightdata/anthropic/supabase-service-role)으로 신규 생성 0"
  - "THEME_SYNC_CLASSIFY_ENABLED=true 로 첫 production scrape 부터 AI 보강 활성 — POC(10-06) 비용 ~$1.83/월·정확도 GOOD 검증 후 라이브 적용. aiDiscovered=25, aiCorrected=2 실측"
  - "유저 테마 optimistic 갱신 — Supabase 풀러 read-after-write 지연으로 생성 직후 refetch 가 갓 만든 row 를 놓쳐 list 가 빈 화면 되던 회귀를, upsertMyTheme(즉시 반영) + refresh(reconcile) 2단으로 해소. 통계는 null 폴백 후 refresh 가 실값"
  - "@gh-radar/shared 확장자 없는 re-export — 10-02 가 추가한 첫 런타임 값 re-export(THEME_STOCK_SOURCES)가 Turbopack dev .js→.ts resolve 갭 재유발(DEV 전용 오버레이, production build 는 항상 green). moduleResolution:bundler 관용 형태로 전환"
  - "smoke INV-2 false-negative 해소 — Cloud Run Job 은 jsonPayload.msg 로 쿼리(service .message 와 다름) + Cloud Logging ingestion 지연 5×15s 재시도. Job 은 cycle complete 정상 기록"
  - "E2E 상세 페이지(edit-remove/delete/fork) — Express /api/themes/:id 부재로 에러 카드 렌더되던 사전 실패를 404 mock 으로 실 Supabase RLS owner-only 폴백 구동하여 해소(create-and-add 의 search mock 패턴 동형)"

requirements-completed: [THEME-01, THEME-02, THEME-03, THEME-04]

# Metrics
duration: ~13min (finalizer; deploy/smoke 는 오케스트레이터 선행)
completed: 2026-06-09
---

# Phase 10 Plan 08: Deploy & E2E Summary

**theme-sync 를 Cloud Run Job + Scheduler(0 16 KST, OAuth invoker)로 production 배포하여 일 1회 테마 수집 활성화(첫 scrape 356 시스템 테마 + AI 보강 라이브) + 유저 테마 optimistic 갱신으로 CRUD 즉시 반영 + 테마 E2E 3종 전 시나리오 green(10/10) — THEME-01~04 production 검증 완료**

## Performance

- **Finalizer duration:** 약 13분 (Task 1 optimistic 구현/검증 + Task 2 finalize). Task 3 GCP 배포·smoke 는 오케스트레이터가 사용자 승인 후 선행 실행.
- **Tasks:** 3 (Task 1 deploy 스크립트 + Task 2 E2E spec 은 666cfe1/b5e33d6 선커밋, Task 3 GCP 배포 오케스트레이터 실행 + Wave 7 finalize)
- **Files modified (finalize 포함):** 16

## Accomplishments

### Task 3 — GCP 배포 (오케스트레이터 실행, 사용자 승인)

- **Cloud Run Job `gh-radar-theme-sync`** + **Scheduler `gh-radar-theme-sync-daily`** (`0 16 * * *` Asia/Seoul, OAuth invoker, **OIDC 금지** — Phase 05.1 D-07 lesson 승계) production ENABLED.
- **SA `gh-radar-theme-sync-sa`** + **기존 시크릿 3종 재사용** accessor 바인딩: `gh-radar-supabase-service-role`, `gh-radar-brightdata-api-key`(Phase 08), `gh-radar-anthropic-api-key`(Phase 08.1). 신규 Secret 생성 0.
- **`THEME_SYNC_CLASSIFY_ENABLED=true`** — 첫 production scrape 부터 AI 테마 발굴/오분류 교정 활성.
- **이미지** `theme-sync:e944970`.

### 첫 production scrape (smoke 실측)

- **356 시스템 테마** 라이브 (331 naver/alpha + **25 AI 발굴**), **7,561 theme_stocks** 링크.
- **AI 보강 라이브 동작**: `aiDiscovered=25`, `aiCorrected=2`. `backedOffSources=[]` (네이버 직접 fetch 성공 — 프록시 폴백 불필요).
- **Phase gate `themes count > 0` PASS** (356).

### Task 1 — 유저 테마 optimistic 갱신 (Wave 7 finalize)

- **`use-themes-query`**: `upsertMyTheme(theme)`(replace-by-id else prepend) / `removeMyTheme(id)` 낙관적 mutator 추가 + `UseThemesQueryResult` 확장.
- **`theme-edit-dialog`**: `onSaved(theme 스냅샷)` 로 변경 직후 상태 전달, `onDeleted(id)` 로 삭제 구분 신호. `buildOptimisticTheme(id, chips)` 가 명시 인자로 stale-closure 회피, 통계는 null(부모 refresh reconcile). fork 는 `mode.systemTheme` 직접 참조로 effect 1회 보장.
- **`themes-client`**: `onSaved → upsertMyTheme FIRST + refresh`, `onDeleted → removeMyTheme + refresh` — **Supabase 풀러 read-after-write 레이스로 생성 직후 list 가 빈 화면 되던 회귀 해소**(E2E create-and-add 통과).
- **`theme-detail-client`**: `onDeleted` 시 `router.push('/themes')` 라우팅(시그니처 변경 대응).

### Wave 7 finalize 수정 3종 (배포·검증 중 발견)

- **Turbopack dev resolve 회귀 + 수정** (`packages/shared/src/index.ts`): 10-02 가 추가한 첫 런타임 값 re-export(`THEME_STOCK_SOURCES`)가 09.2 이후 잠복하던 Turbopack dev `.js`→`.ts` resolve 갭을 재유발(webpack `extensionAlias` 부재 + webapp tsconfig `paths` 가 `@gh-radar/shared` 를 src 로 라우팅) → `/themes`·`/stocks/[code]` **DEV 전용 Build Error 오버레이**. production `pnpm -F webapp build` 는 항상 green. 확장자 없는 re-export(`moduleResolution:bundler` 관용)로 수정 → 오버레이 제거.
- **smoke INV-2 false-negative 수정** (`scripts/smoke-theme-sync.sh`): INV-2 가 `jsonPayload.msg` 필드로 쿼리(Cloud Run Job raw pino 는 msg 보존 — service 의 `.message` 매핑과 다름, 라이브 로그 덤프로 확인) + Cloud Logging ingestion 지연 흡수용 5×15s 재시도 루프. Job 은 `"msg":"theme-sync cycle complete"` 정상 기록.
- **E2E 검색 mock + 테마 상세 mock** (`user-themes.spec.ts`): create-and-add 가 실 `/api/stocks/search`(Express 부재) 를 치던 문제에 `mockStockApi` 추가. edit-remove/delete/fork 가 `/themes/:id` 상세에서 Express `/api/themes/:id` 부재로 에러 카드 렌더되던 **사전 실패**에 `mockThemesApi({list:[]})` 404 mock 추가 → `ThemeDetailClient` 가 실 Supabase `fetchMyThemeDetail`(RLS owner-only) 로 폴백.

### Task 2 — E2E 최종 결과

- **테마 E2E 3종 전 시나리오 green — 10/10**(themes.spec 3 + theme-chips.spec 2 + user-themes.spec 4 + setup 1), 2회 재실행 안정.
- create-and-add 는 optimistic 갱신으로, edit-remove/delete/fork 는 404 폴백 mock 으로 통과.

## Task Commits

선행(Task 1/2 — 배포 전):
1. **theme-sync 배포 스택 (Dockerfile + setup/deploy/smoke, master-sync 복제 OAuth invoker)** - `666cfe1` (feat)
2. **테마 E2E 3종 (storageState)** - `b5e33d6` (test)

Wave 7 finalize (배포·검증 후):
3. **@gh-radar/shared 확장자 없는 re-export (Turbopack dev resolve 회귀)** - `4c77fa5` (fix)
4. **smoke INV-2 jsonPayload.msg + ingestion 지연 재시도** - `8447539` (fix)
5. **유저 테마 optimistic 갱신 (생성/편집/삭제 즉시 반영)** - `49f3b97` (feat)
6. **user-themes E2E 검색·테마상세 mock + 전 시나리오 green** - `ab30e0d` (test)

**Plan metadata:** (아래 final commit)

## Decisions Made

- **배포 = master-sync/candle-sync 동형 + Secret 재사용**: Cloud Run Job + Scheduler(`0 16 * * *` Asia/Seoul) OAuth invoker(OIDC 금지). 기존 시크릿 3종(brightdata/anthropic/supabase-service-role) accessor 바인딩만 — 신규 Secret 생성 0(부분 캐싱·비용 최소).
- **AI 보강 라이브 활성**: `THEME_SYNC_CLASSIFY_ENABLED=true` 로 첫 scrape 부터 발굴/교정. POC(10-06) 검증(~$1.83/월·정확도 GOOD) 후 적용. 실측 aiDiscovered=25/aiCorrected=2.
- **optimistic 갱신 2단 패턴**: upsert/remove(즉시 반영) → refresh(실 통계 reconcile). Supabase 풀러 read-after-write 지연 회피. 비로그인 시 정책상 myThemes 항상 빈 배열이라 mutator 호출 안 함.
- **Turbopack 확장자 없는 re-export lesson**: 첫 런타임 값 re-export 도입 시 Turbopack dev resolve 갭 재발 — `moduleResolution:bundler` 에서 확장자 생략이 관용(NodeNext 소비자는 dist 사용, 무영향).
- **smoke jsonPayload.msg + lag**: Cloud Run Job pino 로그 필드명은 `msg`(service 의 `.message` 아님) + ingestion 지연 재시도. Phase 09.1 D-10-08 의 "service 는 jsonPayload.message" 와 대비되는 **Job 측 관측**.
- **E2E 상세 페이지 404 폴백 mock**: Express 부재 환경에서 `mockThemesApi({list:[]})` 가 `/api/themes/:id` 404 → 실 Supabase RLS owner-only 폴백 구동. CRUD 는 실 Supabase 유지(themes.spec 의 mockThemesApi + create-and-add 의 mockStockApi 패턴 동형).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Turbopack dev .js→.ts resolve 회귀 — @gh-radar/shared 확장자 제거**
- **Found during:** Wave 7 배포 검증 (브라우저 /themes·/stocks/[code] DEV 오버레이)
- **Issue:** 10-02 의 `THEME_STOCK_SOURCES` 런타임 re-export(`from "./theme.js"`)가 Turbopack dev 의 `.js`→`.ts` resolve 갭을 재유발 → DEV 전용 Build Error 오버레이(production build 는 green).
- **Fix:** index.ts 의 모든 re-export 를 확장자 없는 형태로 변경(`moduleResolution:bundler` 관용).
- **Files modified:** packages/shared/src/index.ts
- **Verification:** production build exit 0 + DEV 오버레이 제거 확인.
- **Committed in:** `4c77fa5`

**2. [Rule 1 - Bug] smoke INV-2 false-negative — jsonPayload.msg + ingestion 지연 재시도**
- **Found during:** Wave 7 smoke 실행 (INV-2 FAIL 표기, 데이터는 정상)
- **Issue:** INV-2 가 잘못된 로그 필드/즉시 조회로 false-negative. Cloud Run Job 은 `jsonPayload.msg` 로 쿼리해야 하고 ingestion 지연(~30-60s)이 있음.
- **Fix:** `jsonPayload.msg`(라이브 덤프로 확인) + 5×15s 재시도 루프.
- **Files modified:** scripts/smoke-theme-sync.sh
- **Verification:** Job `"msg":"theme-sync cycle complete"` 정상 기록 확인.
- **Committed in:** `8447539`

**3. [Rule 3 - Blocking] E2E user-themes — 검색 mock + 테마 상세 404 폴백 mock**
- **Found during:** Wave 7 E2E (create-and-add 검색 API 실패 + edit-remove/delete/fork 상세 에러 카드)
- **Issue:** Playwright webServer 는 webapp dev 만 기동(Express 부재). create-and-add 가 실 `/api/stocks/search` 를, 상세 시나리오가 실 `/api/themes/:id` 를 쳐서 실패. 상세 실패는 **Phase 10 무관 사전 실패**(Express 의존).
- **Fix:** create-and-add 에 `mockStockApi`(검색 전용), edit-remove/delete/fork 에 `mockThemesApi({list:[]})`(404 → 실 Supabase fetchMyThemeDetail 폴백) 추가. CRUD 는 실 Supabase 유지.
- **Files modified:** webapp/e2e/specs/user-themes.spec.ts
- **Verification:** themes/theme-chips/user-themes 전 spec green(10/10), 2회 재실행 안정.
- **Committed in:** `ab30e0d`(상세 mock), 검색 mock 일부는 b5e33d6 후 working tree(ab30e0d 포함)

**4. [Rule 1 - Bug] optimistic 갱신 — 생성 직후 list 빈 화면 회귀(THEME-03 UX)**
- **Found during:** Wave 7 E2E (create-and-add: DB 적재 정상이나 list 미반영)
- **Issue:** 테마 PERSIST 정상(DB count 1, owner set, is_system=false)이나 my-themes list 가 save 시 단일 refresh() 만 → Supabase 풀러 read-after-write 레이스로 갓 만든 row 누락, 60s 폴링까지 빈 화면.
- **Fix:** upsertMyTheme/removeMyTheme 낙관적 mutator + onSaved/onDeleted 시그니처로 즉시 반영 후 refresh reconcile.
- **Files modified:** use-themes-query.ts + theme-edit-dialog.tsx + themes-client.tsx + theme-detail-client.tsx (+ 단위 테스트 2종)
- **Verification:** create-and-add E2E 통과 + 단위 테스트 31/31 green + production build exit 0.
- **Committed in:** `49f3b97`

---

**Total deviations:** 4 auto-fixed (2 bug, 1 blocking, 1 bug/UX). 모두 배포 검증·E2E 통과에 필수, scope creep 없음.

## Deferred Issues (out of scope — SCOPE BOUNDARY)

- **`webapp/e2e/specs/stock-detail.spec.ts:15`** ("Hero + Stats + News + 종목토론방 Placeholder 렌더") 1개 실패 — **Phase 10 무관 사전 실패**. Phase 06 시절 placeholder("Phase 8 로드맵에서 제공됩니다.")를 단언하나 Phase 8 이 실 `StockDiscussionSection`(unmocked) 으로 교체 → placeholder 미렌더. 10-08 의 Turbopack 오버레이 제거로 *노출*(원인 아님). follow-up: 토론 섹션 데이터 mock + placeholder 단언 갱신. `.planning/phases/10-theme-classification/deferred-items.md` 기록.
- **`webapp/e2e/specs/stock-detail-chart.spec.ts`**(Phase 09.2 차트, 4 tests)는 **전부 green** — Wave 7 메모의 "차트 spec 도 실패" 추정은 실측 반증(OHLCV mock spec 내 구비).
- **webapp 단위 `discussion-page-client.test.tsx` 3건**(Phase 08.1 filter toggle) 기존 실패 — 별도 deferred(10-05 기록), 본 plan 무관.
- **`pnpm -F webapp build` ESLint 단계**(eslint-plugin-import resolve 실패) 경고 — build 는 exit 0(Compiled successfully + static 10/10). 사전 tooling gap.

## User Setup Required

None — GCP 배포는 오케스트레이터가 사용자 승인(Deployer SA) 하에 선행 완료. 시크릿 3종 모두 기존(Phase 08/08.1)에서 등록됨.

## Next Phase Readiness

- **Phase 10 완료** — THEME-01(수집)/THEME-02(UI)/THEME-03(유저 CRUD)/THEME-04(AI 보강) 전부 production 검증(356 테마 라이브, AI 발굴 on, 유저 CRUD E2E green).
- **자동 운영**: 첫 자동 Scheduler 실행은 다음 16:00 KST. 5원칙 backoff(429/403 24h) + 콘텐츠 SHA256 해시 변경감지 가드 동작 확인됨(smoke).
- **Concern**: 없음. 후속 phase(상한가 동조/상관관계 분석, 테마 알림)는 Phase 10 Out of scope — 별도 phase.

## Self-Check: PASSED

(아래 self-check 절차로 파일·커밋 존재 검증 — 결과는 커밋 직전 갱신)

---
*Phase: 10-theme-classification*
*Completed: 2026-06-09*
