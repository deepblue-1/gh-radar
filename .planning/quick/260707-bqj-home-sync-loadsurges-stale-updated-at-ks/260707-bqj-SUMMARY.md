---
phase: quick-260707-bqj
plan: 01
subsystem: infra
tags: [home-sync, supabase, cloud-run, freshness-filter, kst]

# Dependency graph
requires:
  - phase: 13-home-surge-themes
    provides: loadSurges / home-sync Cloud Run Job / home_theme_snapshots
provides:
  - loadSurges updated_at 신선도 필터 (오늘 KST 자정 이후 갱신 급등만 선정)
  - kstMidnightIso 순수 헬퍼 (now 주입 가능)
  - 재배포된 gh-radar-home-sync Cloud Run Job (stale 오염 제거)
affects: [home-sync, home-surge-themes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "column 기준 gte mockImplementation — 이중 gte 체이닝(change_rate + updated_at) mock 대응"

key-files:
  created: []
  modified:
    - workers/home-sync/src/pipeline/loadSurges.ts
    - workers/home-sync/src/pipeline/loadSurges.test.ts
    - workers/home-sync/src/index.ts
    - workers/home-sync/src/index.test.ts

key-decisions:
  - "신선도 컷오프 = 오늘 KST 자정(00:00 KST). idx_stock_quotes_updated_at 인덱스 재사용, 추가 부하 무시 가능."
  - "computeSlot 과 동일한 now 를 loadSurges 로 전달해 슬롯 계산과 신선도 컷오프가 같은 시각 기준."
  - "freshnessCutoff 는 retry 루프 밖 1회 계산(사이클 내 고정)."

patterns-established:
  - "이중 gte mock: change_rate gte → chain(this), updated_at gte → Promise.resolve (setQuotes 헬퍼)."

requirements-completed: [QUICK-260707-bqj]

# Metrics
duration: ~25min
completed: 2026-07-07
---

# Quick 260707-bqj: home-sync loadSurges 신선도 필터 Summary

**loadSurges 급등 선정에 `updated_at >= 오늘 KST 자정` 필터를 추가해, stale cleanup 없는 stock_quotes 의 어제 상한가·거래정지 잔존 시세(+177% 227100 등)가 "오늘의 급등"으로 홈 테마에 오염되던 버그를 제거하고 프로덕션 Cloud Run Job 을 재배포·검증했다.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-06T23:27Z (2026-07-07 08:27 KST)
- **Completed:** 2026-07-06T23:43Z (2026-07-07 08:43 KST)
- **Tasks:** 2/2
- **Files modified:** 4 (code)

## Accomplishments

- `loadSurges` 급등 쿼리에 `.gte("updated_at", kstMidnightIso(now))` 추가 — 오늘 KST 자정 이후 갱신된 급등만 선정.
- `kstMidnightIso(now)` 순수 헬퍼 추가 (index.ts computeSlot 의 KST→UTC 변환 패턴 재사용, now 주입 가능).
- `index.ts` 가 computeSlot 과 동일한 `now` 를 loadSurges 로 전달 (슬롯·신선도 컷오프 동일 기준).
- `gh-radar-home-sync` Cloud Run Job 재배포(image `home-sync:f2ff298`) + smoke 6/6 PASS.
- **라이브 오염 제거 확정 (핵심 증거):** 재배포 후 08:40 KST 스냅샷 = `stock_count=2, theme_count=0`(가온칩스 399720 +20.72%, 위메이드맥스 101730 +15.16%) — 재배포 직전 08:20/08:30 슬롯 `stock_count=38~40` 대비 stale 제거. 거래정지 잔재 227100 미포함.

## Task Commits

1. **Task 1: loadSurges 에 updated_at 신선도 필터 추가 (TDD)** - `f2ff298` (fix)
   - RED/GREEN 을 단일 commit 으로 통합 — 신선도 필터 소스 + 이중 gte mock 갱신 + 자정 경계/필터 테스트를 함께 커밋.
2. **Task 2: home-sync Cloud Run Job 재배포 + 라이브 스모크 검증** - 코드 변경 없음(배포만), 별도 commit 없음.

_docs 아티팩트(SUMMARY/STATE/PLAN)는 오케스트레이터가 머지 후 커밋._

## Files Modified

- `workers/home-sync/src/pipeline/loadSurges.ts` - `KST_OFFSET_MS` + `kstMidnightIso` export 헬퍼 추가, `LoadSurgesOptions.now?` 추가, 급등 쿼리에 `.gte("updated_at", freshnessCutoff)` 이중 gte.
- `workers/home-sync/src/pipeline/loadSurges.test.ts` - `setQuotes` 이중 gte mock 헬퍼로 전 테스트 갱신 + `kstMidnightIso` 단위 테스트(3) + 신선도 필터/자정 경계 테스트(2) 추가.
- `workers/home-sync/src/index.ts` - `loadSurges(supabase, cfg, { ...deps.loadSurgesOptions, now })` 로 now 전달.
- `workers/home-sync/src/index.test.ts` - stock_quotes mock 2곳(seedSurgeSupabase / seedEmptySupabase)을 이중 gte mockImplementation 으로 교체.

## Verification

- `pnpm -C workers/home-sync vitest run` — **63 tests green** (loadSurges 12 + index 16 + 기타 회귀 전부).
- `pnpm -C workers/home-sync typecheck` — exit 0.
- `pnpm -C workers/home-sync build` — exit 0.
- `scripts/smoke-home-sync.sh` — **6/6 PASS** (INV-1 execute exit 0 / INV-2 cycle complete / INV-3 no fail·401 / INV-4 snapshot ≥1 / INV-5 scheduler ENABLED / INV-6 OAuth invoker).

### 라이브 stale 오염 0 증거 (2026-07-07 08:40 KST 프리마켓)

| 지표 | 값 | 해석 |
|------|----|------|
| `stock_quotes` change_rate≥15 (신선도 무시) | **38** | stale 포함 (재배포 전 스냅샷의 오염 원천) |
| change_rate≥15 AND updated_at≥오늘 KST 자정 | **1~2** (프리마켓 변동) | 신선 급등만 (필터 정상 동작) |
| 227100 (거래정지 잔재) | change_rate=**177.78**, updated_at=**2026-06-23** | 14일 stale — 필터로 제외 확인 |
| 재배포 후 08:40 스냅샷 | stock_count=**2**, theme_count=**0** | 가온칩스/위메이드맥스만, 227100 등 stale 미포함 |
| 재배포 직전 08:20/08:30 스냅샷 | stock_count=**40/38** | stale 오염(어제 상한가·거래정지 잔재 포함) |

프리마켓 시간대라 급등 종목 자체가 적어 신선 급등이 1~2건으로 관측됨(스냅샷 순간 2건, 이후 라이브 조회 순간 101730 이 15% 미만으로 내려가 1건). deployment_notes 의 예상("급등 6건 수준으로 줄거나 threshold 미달 시 빈 결과가 정상")과 일치. 장중 갱신이 늘면 신선 급등도 자연 증가.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] index.test.ts 이중 gte mock 회귀 수정**
- **Found during:** Task 1 (full suite 실행 시)
- **Issue:** `loadSurges` 에 두 번째 `.gte("updated_at")` 추가로, index.test.ts 의 `stock_quotes.gte.mockResolvedValue(...)` 단일 gte mock 이 첫 gte(change_rate)까지 Promise 로 만들어 체이닝을 깨뜨림 → index.test.ts 5건 FAIL.
- **Fix:** seedSurgeSupabase / seedEmptySupabase 두 mock 헬퍼를 column 기준 `gte.mockImplementation`(change_rate→chain, updated_at→resolve)으로 교체. 플랜 Task 1 <files> 에 index.test.ts 는 없었으나 신선도 필터의 직접 파급이라 동일 커밋에 포함.
- **Files modified:** workers/home-sync/src/index.test.ts
- **Commit:** f2ff298

## Notes / Follow-up

- **이미지 SHA 추적:** 배포 이미지 태그 = `f2ff298`(워크트리 브랜치 HEAD, APP_VERSION 도 동일). 오케스트레이터 머지 후 master SHA 가 달라지면 라벨 추적성만 어긋남(배포 코드 자체는 정확). 머지 커밋이 f2ff298 을 보존하면 그대로 추적 가능. 필요 시 머지 후 master 기준 재배포 옵션 있음(기능적으로는 불필요).
- **환경 준비:** 워크트리에 node_modules/`@gh-radar/shared` dist 미존재 → `pnpm install --prefer-offline`(store 캐시, 5s) + `packages/shared` build 후 테스트 실행. 이는 워크트리 격리 환경의 1회성 준비이며 소스 변경 아님.

## Self-Check: PASSED

- 4개 수정 파일 + SUMMARY.md 모두 디스크 존재 확인.
- 커밋 f2ff298 존재 확인.
- `.gte("updated_at", freshnessCutoff)` 소스 반영 확인 (loadSurges.ts:115).
