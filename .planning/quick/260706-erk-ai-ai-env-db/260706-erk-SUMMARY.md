---
phase: quick-260706-erk
plan: 01
subsystem: infra
tags: [theme-sync, anthropic, claude, supabase, migration, cleanup]

# Dependency graph
requires:
  - phase: 10-theme-classification
    provides: theme-sync 워커 + themes/theme_stocks 테이블 + ThemeStockSource 타입
provides:
  - AI 보강 제거된 순수 스크랩 theme-sync 워커 (네이버+알파스퀘어 병합/UPSERT)
  - 'ai' 값 없는 ThemeStockSource 공유 타입 + 테마 프론트
  - source='ai' 데이터 정리 마이그레이션
affects: [theme-sync, themes-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: ["theme-sync = 순수 스크랩(Claude 호출 0) 워커로 단순화"]

key-files:
  created:
    - supabase/migrations/20260706120000_remove_ai_theme_source.sql
  modified:
    - workers/theme-sync/src/index.ts
    - workers/theme-sync/src/config.ts
    - workers/theme-sync/src/logger.ts
    - workers/theme-sync/package.json
    - scripts/deploy-theme-sync.sh
    - packages/shared/src/theme.ts
    - webapp/src/components/theme/theme-source-badge.tsx
    - webapp/src/components/theme/themes-client.tsx
    - webapp/src/components/theme/theme-detail-client.tsx

key-decisions:
  - "theme-sync 미사용이 된 p-limit 도 @anthropic-ai/sdk 와 함께 제거(AI 모듈 전용 의존성)"
  - "theme-detail-client 의 source==='ai' aiCodes 계산 제거 — 스캐너 aiCodes prop 은 optional 유지"
  - "AiPickBadge/scanner/info-stock-card 는 플랜 지침대로 무변경(테마 전용 아님)"

patterns-established: []

requirements-completed: [quick-260706-erk]

# Metrics
duration: ~30min
completed: 2026-07-06
---

# Quick 260706-erk: theme-sync AI 보강 전면 제거 Summary

**theme-sync 를 Claude 호출 없는 순수 스크랩(네이버+알파스퀘어) 병합/UPSERT 워커로 단순화하고, 코드·배포·공유타입·프론트·DB 전 계층에서 'ai' source 흔적 제거**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-07-06T01:22Z
- **Completed:** 2026-07-06T01:53Z
- **Tasks:** 3
- **Files modified:** 22 (7 삭제 포함)

## Accomplishments
- theme-sync `src/ai/` 디렉터리 전체(7파일) + `ai.test.ts` 삭제, enrichWithAi 파이프라인 제거
- config/logger 에서 anthropic/classify/discover 설정·redact 제거, `@anthropic-ai/sdk` + 미사용 `p-limit` 의존성 제거
- 배포 스크립트에서 ANTHROPIC secret + CLASSIFY env 바인딩 제거 (Secret 자체는 존치)
- ThemeStockSource union 에서 'ai' 제거 → 프론트 뱃지/푸터/detail 정리
- source='ai' 데이터 정리 마이그레이션 작성
- theme-sync 48 tests + shared/webapp/server typecheck 전부 green

## Task Commits

1. **Task 1: theme-sync AI 코드/설정/의존성/배포 제거** - `184dbe1` (feat)
2. **Task 2: 공유 타입 + webapp 테마 프론트 'ai' 제거** - `22b37bc` (feat)
3. **Task 3: AI 출처 데이터 정리 마이그레이션** - `6533fa2` (feat)

## Files Created/Modified
- `supabase/migrations/20260706120000_remove_ai_theme_source.sql` - 'ai' 매핑/테마 정리(3단계 DELETE/UPDATE)
- `workers/theme-sync/src/index.ts` - enrichWithAi 호출 + ai* 집계/summary 필드 제거
- `workers/theme-sync/src/config.ts` - anthropicApiKey/classify*/discover* 필드 제거
- `workers/theme-sync/src/logger.ts` - anthropicApiKey redact 경로 제거
- `workers/theme-sync/package.json` - @anthropic-ai/sdk + p-limit 제거
- `scripts/deploy-theme-sync.sh` - ANTHROPIC secret / CLASSIFY env 제거
- `packages/shared/src/theme.ts` - ThemeStockSource + THEME_STOCK_SOURCES 에서 'ai' 제거
- `webapp/src/components/theme/theme-source-badge.tsx` - ai 라벨/도트/accent 분기 제거
- `webapp/src/components/theme/themes-client.tsx` - 출처 푸터 'AI 보강(Claude)' 제거
- `webapp/src/components/theme/theme-detail-client.tsx` - source==='ai' aiCodes 계산 제거
- `workers/theme-sync/tests/{scrape,pipeline}.test.ts` - config 픽스처 정리 + AI 발굴 검증 케이스 삭제
- `webapp/src/components/theme/__tests__/themes-client.test.tsx` - 푸터 카피 기대값 갱신

## Decisions Made
- p-limit 은 삭제된 AI 모듈(discoverThemes/correctMembership)에서만 쓰였으므로 @anthropic-ai/sdk 와 함께 제거(theme-sync 나머지 코드 미사용 확인).
- theme-detail-client 의 `aiCodes`(source==='ai')는 유일한 feeder 였으므로 제거. 스캐너 컴포넌트의 `aiCodes` prop 은 optional 이라 전달 생략만으로 처리(컴포넌트 시그니처 무변경).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] theme-detail-client.tsx 의 잔여 source==='ai' 비교 제거**
- **Found during:** Task 2 (webapp typecheck)
- **Issue:** 플랜 파일 목록에 없던 `theme-detail-client.tsx` 가 `m.source === 'ai'` 로 aiCodes 를 계산 → 공유 타입 변경 후 TS2367(overlap 없음) 컴파일 에러
- **Fix:** aiCodes useMemo 제거 + ScannerTable/ScannerCardList 에 aiCodes prop 전달 생략(둘 다 optional)
- **Files modified:** webapp/src/components/theme/theme-detail-client.tsx
- **Verification:** webapp typecheck green
- **Committed in:** `22b37bc` (Task 2 commit)

**2. [Rule 1 - Bug] themes-client.test.tsx 푸터 카피 기대값 갱신**
- **Found during:** Task 2 (webapp 테마 테스트)
- **Issue:** 테스트가 옛 푸터 'AI 보강(Claude)' 정규식을 단언 → 푸터 변경으로 실패
- **Fix:** 기대 정규식을 새 푸터('출처: 네이버 금융 테마 · 알파스퀘어 · 일 1회 16:00 KST 갱신')로 교체
- **Files modified:** webapp/src/components/theme/__tests__/themes-client.test.tsx
- **Verification:** theme 테스트 21/21 green
- **Committed in:** `22b37bc` (Task 2 commit)

**3. [Rule 3 - Blocking] 미사용 p-limit 의존성 제거**
- **Found during:** Task 1 (package.json 정리)
- **Issue:** p-limit 은 삭제된 AI 모듈 전용이라 잔존 시 dead dependency
- **Fix:** package.json 에서 p-limit 제거 + lockfile 갱신
- **Files modified:** workers/theme-sync/package.json, pnpm-lock.yaml
- **Verification:** theme-sync typecheck + 48 tests green
- **Committed in:** `184dbe1` (Task 1 commit)

**4. [문서] SCHEMA.md 에 theme 테이블 문서 부재 — 변경 불필요**
- **Found during:** Task 3
- **Issue:** 플랜은 SCHEMA.md 의 theme_stocks.source/themes.sources 설명에서 'ai' 허용값 제거를 지시했으나, SCHEMA.md 는 themes/theme_stocks 테이블을 애초에 문서화하지 않음(stocks/news/discussions/summaries/kis_tokens/watchlists 만 기재)
- **Fix:** 제거할 'ai' 텍스트가 없어 SCHEMA.md 무변경
- **Files modified:** 없음

---

**Total deviations:** 4 (blocking 2, bug 1, 문서 1)
**Impact on plan:** 모두 타입 변경 전파에 따른 필수 수정 또는 플랜 전제 정정. scope creep 없음.

## Issues Encountered
- 최초 worktree 격리 인지 전 shared checkout 에 git rm 을 실행 → 즉시 `git restore`/`checkout` 으로 복구 후 worktree 에서 재수행. shared checkout 최종 상태 clean.

## Known Stubs
- **AiPickBadge (`webapp/src/components/ui/ai-pick-badge.tsx`) — 휴면(dormant).** 유일한 데이터 feeder 였던 theme-detail 의 source==='ai' 가 제거되어 현재 `aiCodes` 를 채우는 소비자가 없음(스캐너 페이지도 미전달). 플랜이 "스캐너/종목상세 전용이므로 유지(무변경)"를 명시해 컴포넌트+테스트+scanner/info-stock-card 의 optional prop 은 그대로 보존. UI 를 깨지 않으며(prop 미전달 시 렌더 없음), 향후 스캐너 AI-pick 재도입 시 재사용 가능. 테마 폐기 목표에는 영향 없음.

## Production Migration — 별도 단계 필요
- **로컬 적용:** 로컬 Supabase 컨테이너 미기동(`supabase status` = no container) + `supabase db push` 는 linked(프로덕션) 프로젝트를 대상으로 하므로 본 실행에서 적용하지 않음(프로덕션 적용은 플랜 범위 밖).
- **적용 명령(운영자 실행):** `supabase db push` (또는 마이그레이션 SQL 을 프로덕션 Supabase 에 직접 적용).
- **적용 전/후 검증 쿼리:**
  - `SELECT count(*) FROM theme_stocks WHERE source = 'ai';` → 적용 후 **0**
  - `SELECT count(*) FROM themes WHERE 'ai' = ANY(sources);` → 적용 후 **0**
- **배포 주의:** theme-sync 재배포 시 `deploy-theme-sync.sh` 가 더 이상 ANTHROPIC secret/CLASSIFY env 를 설정하지 않음. Secret `gh-radar-anthropic-api-key` 는 home-sync/discussion 이 사용하므로 **삭제 금지**(theme-sync Job 에서 바인딩만 제거됨 — 재배포로 반영).

## Next Phase Readiness
- 코드/타입/프론트 계층 정리 완료, 전 워크스페이스 typecheck/test green.
- 남은 운영 액션: (1) 마이그레이션 프로덕션 적용, (2) theme-sync Cloud Run Job 재배포로 secret/env 바인딩 갱신.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260706120000_remove_ai_theme_source.sql
- FOUND: .planning/quick/260706-erk-ai-ai-env-db/260706-erk-SUMMARY.md
- FOUND commits: 184dbe1, 22b37bc, 6533fa2
- REMOVED: workers/theme-sync/src/ai/

---
*Phase: quick-260706-erk*
*Completed: 2026-07-06*
