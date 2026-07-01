---
phase: 13-home-surge-themes
plan: 01
subsystem: home-surge-themes
tags: [migration, shared-types, worker-scaffold, rls, anthropic]
requires: []
provides:
  - home_theme_snapshots (JSONB-blob 스냅샷 테이블, RLS TO anon,authenticated)
  - "@gh-radar/shared Home* 타입 계약 (HomeSnapshotResponse 등 8종)"
  - "workers/home-sync 워크스페이스 스캐폴드 (anthropic+supabase reduced)"
  - HOME-01 requirement 등록
affects:
  - 13-02 (home-sync 파이프라인) — 테이블 + config + anthropic/parseJson 클론에 빌드
  - 13-03 (server /api/home) — HomeSnapshotResponse 계약에 빌드
  - 13-04/05/06 (webapp) — Home* 타입에 빌드
tech-stack:
  added: []
  patterns:
    - "JSONB-blob-per-row 스냅샷 (payload jsonb, Claude 출력 1:1)"
    - "시점별 append + PK (trade_date, captured_at)"
    - "hash-skip 복제 append (content_hash / is_carried)"
    - "theme-sync reusable 인프라 클론 (anthropic 싱글톤 + parseJson 펜스 가드 verbatim)"
key-files:
  created:
    - supabase/migrations/20260701123000_home_theme_snapshots.sql
    - packages/shared/src/home.ts
    - workers/home-sync/package.json
    - workers/home-sync/tsconfig.json
    - workers/home-sync/vitest.config.ts
    - workers/home-sync/Dockerfile
    - workers/home-sync/src/config.ts
    - workers/home-sync/src/logger.ts
    - workers/home-sync/src/services/supabase.ts
    - workers/home-sync/src/ai/anthropic.ts
    - workers/home-sync/src/ai/parseJson.ts
    - workers/home-sync/src/ai/parseJson.test.ts
  modified:
    - packages/shared/src/index.ts
    - .planning/REQUIREMENTS.md
    - pnpm-lock.yaml
decisions:
  - "config.ts JSDoc 의 */scrape* 시퀀스가 블록 주석 조기 종료 유발 → 리워딩 (Rule 1 버그)"
  - "home-sync config 은 anthropic+supabase+급등 튜닝만 (theme-sync 스크랩/프록시 전면 제거)"
  - "home_theme_snapshots 는 plain table (RPC 없음) → REVOKE 불요, RLS SELECT + service_role write"
metrics:
  duration: ~5min
  tasks: 3
  files: 15
  completed: 2026-07-01
---

# Phase 13 Plan 01: Wave 0 Foundation (home_theme_snapshots + shared types + home-sync scaffold) Summary

Wave 0 홈 급등 테마 phase 의 3대 계약을 확정: HOME-01 요구사항 등록, `home_theme_snapshots` JSONB-blob 스냅샷 테이블(프로덕션 적용 완료 · RLS `TO anon, authenticated`), `@gh-radar/shared` camelCase Home* 타입 8종, theme-sync 재사용 인프라를 클론한 buildable `workers/home-sync` 스켈레톤. 모든 downstream plan(워커 파이프라인/서버 라우트/웹앱)이 고정 인터페이스에 대해 빌드한다.

## What Was Built

### Task 1 — HOME-01 + 마이그레이션 + 공유 타입 (commit `6c439b8`)
- **REQUIREMENTS.md**: `### Home` 섹션 + HOME-01 등록(앱 루트 홈 급등 테마 AI 분석), Traceability `| HOME-01 | Phase 13 | Pending |`, 커버리지 35→36.
- **supabase/migrations/20260701123000_home_theme_snapshots.sql**: RESEARCH §Pattern 1 DDL — PK `(trade_date, captured_at)`, 9 컬럼(`content_hash` hash-skip / `is_carried` 복제 append / `payload jsonb` blob), 2 인덱스(captured_at DESC, (trade_date DESC, captured_at DESC)), RLS `TO anon, authenticated USING (true)` (feedback_supabase_rls_authenticated 준수). RPC 없는 plain table → REVOKE 불요.
- **packages/shared/src/home.ts**: `HomeNewsRef` / `HomeSurgeStock` / `HomeSurgeTheme` / `HomeSurgeSingle` / `HomeSnapshotPayload` / `HomeThemeSnapshot` / `HomeSnapshotIndexEntry` / `HomeSnapshotResponse`. index.ts 확장자 없는 re-export.

### Task 2 — workers/home-sync 스캐폴드 (commit `47e4ba1`)
- theme-sync 재사용 인프라(config/logger/supabase/anthropic/parseJson) 클론 후 스크랩/프록시 전면 제거.
- **config.ts (reduced)**: `HomeSyncConfig` = supabase* + anthropicApiKey + classifyModel(default `claude-haiku-4-5`) + surgeThreshold(20) + newsPerStock(5) + surgeMax(80) + appVersion + logLevel. brightdata/alpha/naver/scrape 계열 전부 제거.
- **anthropic.ts / parseJson.ts**: verbatim 클론(싱글톤 `getAnthropicClient`, Haiku 펜스 가드 `extractJsonObject`).
- **logger.ts**: redact paths = anthropic/supabase service-role/authorization/token (brightdata 제거).
- **Dockerfile**: pnpm workspace multi-stage(home-sync 타겟), VPC/network 없음(§Pattern 5 — Supabase+Anthropic 만 호출).
- **parseJson.test.ts**: 펜스 스트립 + null 케이스 2 테스트 green (Wave 0 non-empty vitest 연속성).

### Task 3 — [BLOCKING] 프로덕션 db push + RLS 라이브 검증 (승인 후 완료)
- `supabase db push` exit 0 (Applying migration 20260701123000... Finished).
- service_role REST GET `home_theme_snapshots` → 200 (테이블 존재).
- anon REST GET → **200** (RLS `read_home_theme_snapshots` 활성, 401/default-deny 아님 = RLS 정상).
- `captured_at` PK + `is_carried` 컬럼 select → 200.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] config.ts JSDoc 블록 주석 조기 종료**
- **Found during:** Task 2 (첫 build)
- **Issue:** JSDoc 주석 내 `naver*/scrape*` 문자열의 `*/` 시퀀스가 `/** */` 블록 주석을 조기 종료 → 이후 텍스트가 코드로 파싱되어 tsc 파싱 에러 20+건("Unterminated regular expression literal", "Octal literals not allowed").
- **Fix:** 주석을 `프록시 / 스크랩 소스 / 페이지네이션 계열 설정을 모두 제거` 로 리워딩(`*/` 시퀀스 제거). 부수 효과로 `brightdata` 리터럴도 사라져 "config 에 scrape 설정 없음" acceptance 도 함께 충족.
- **Files modified:** workers/home-sync/src/config.ts
- **Commit:** `47e4ba1`

## Verification

- `pnpm --filter @gh-radar/shared build` → exit 0.
- `pnpm --filter @gh-radar/home-sync build` → exit 0.
- `pnpm --filter @gh-radar/home-sync test` → 2/2 green.
- 프로덕션 마이그레이션 적용 + anon/service_role GET 200 (Task 3, 승인 후 검증).
- REQUIREMENTS.md HOME-01 등록 + Traceability row.

## Known Stubs

None — 이 plan 은 스키마/타입/스캐폴드 계약만 확정하며, 파이프라인 로직은 Plan 02 이후. payload 를 실제로 채우는 워커 로직은 계획상 Plan 02 범위(스텁 아님, 미래 plan).

## Self-Check: PASSED

- FOUND: supabase/migrations/20260701123000_home_theme_snapshots.sql
- FOUND: packages/shared/src/home.ts
- FOUND: workers/home-sync/src/config.ts
- FOUND: workers/home-sync/src/ai/anthropic.ts
- FOUND: workers/home-sync/src/ai/parseJson.ts
- FOUND: commit 6c439b8
- FOUND: commit 47e4ba1
