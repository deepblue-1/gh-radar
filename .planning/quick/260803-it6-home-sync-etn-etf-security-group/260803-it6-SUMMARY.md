---
phase: quick-260803-it6
plan: 01
subsystem: workers/home-sync
tags: [home-sync, surge-filter, etp-exclusion, data-quality]
status: checkpoint-pending
requires:
  - stocks.security_group (KRX SECUGRP_NM, 20260415120000_split_stocks_master_quotes_movers.sql)
provides:
  - isExcludedProduct (ETN/ETF/레버리지·인버스 순수 판별 함수)
  - loadSurges 파이프라인 필터→정렬→slice 순서
affects:
  - 홈 급등 스냅샷(home_theme_snapshots) 구성 종목 집합
tech-stack:
  added: []
  patterns:
    - "이중 필터 (구조화 컬럼 + 이름 패턴 fallback) — 마스터 오적재 대비"
    - "필터를 cap/slice 이전에 배치해 슬롯 손실 방지"
key-files:
  created: []
  modified:
    - workers/home-sync/src/pipeline/loadSurges.ts
    - workers/home-sync/src/pipeline/loadSurges.test.ts
decisions:
  - "EXCLUDED_SECURITY_GROUPS 는 ETF/ETN 만 (실측 ELW 0건, 승인 설계) — 프로젝트 SQL 선례는 ELW 포함"
  - "이름 패턴에 KODEX/TIGER 브랜드명 미포함 — 일반 기업명 오탐 회피, group 필터가 커버"
  - "'스팩' 은 범위 밖 — 회귀 가드 테스트로 통과 보존"
metrics:
  duration: ~12min
  tasks_completed: 1
  tasks_total: 2
  tests: "115 → 129 (신규 14, 회귀 0)"
  completed: 2026-08-03
---

# Quick 260803-it6: home-sync ETN/ETF 제외 Summary

홈 급등 스캔에서 ETN/ETF/레버리지·인버스 상품을 `security_group` + 종목명 패턴 이중 필터로 제외하고, 필터를 `surgeMax` slice 이전으로 옮겨 제외된 슬롯을 후순위 일반 종목이 채우도록 파이프라인을 재배치했다.

## 배경

2026-07-20 실사례로 홈에 "인버스ETN" 테마가 KODEX/TIGER 인버스 ETF + 각사 인버스 ETN 12개로 노출됐다. 지수 하락 연동 파생상품이 "오늘의 급등 테마"로 잡히면 트레이더에게 신호 가치가 없다.

## 구현 내용

### Task 1 — isExcludedProduct 이중 필터 + slice 이전 배치 (완료)

**커밋:** `5c2aadd`

`workers/home-sync/src/pipeline/loadSurges.ts`:

- `EXCLUDED_SECURITY_GROUPS = new Set(["ETF", "ETN"])` + `EXCLUDED_NAME_PATTERN = /ETN|ETF|인버스|레버리지/i` 상수 추가.
- `export function isExcludedProduct(name, securityGroup)` — 순수 함수. group 을 `trim().toUpperCase()` 정규화 후 매칭, 미매칭 시 이름 패턴 fallback, 둘 다 없으면 `false`(마스터 미해석 코드 통과).
- 파이프라인 순서 재배치:
  - 기존: `quotes → sort → slice(surgeMax) → 마스터 해석 → 뉴스`
  - 변경: `quotes(통과분 전체) → 마스터 해석(security_group 포함) → 제외 필터 → sort → slice(surgeMax) → 뉴스`
- `stocks` select 를 `"code,name,market,security_group"` 으로 확장, `groupByCode` 맵 신설.
- 뉴스 로드 블록(3, 3b)과 최종 return 은 무변경 — `codes` 를 그대로 사용.
- 파일 상단 JSDoc 흐름 설명을 새 순서로 갱신하고 "필터가 slice 보다 먼저여야 하는 이유"를 명시.

**이름 패턴 fallback 이 필수인 이유:** `570127` "한투 인버스2X코스피200선물 ETN" 이 `security_group='주권'` / `security_type='보통주'` 로 오적재된 실사례가 있다. group 필터 단독으로는 새어 나온다.

### 테스트 (14건 신규)

`isExcludedProduct` 단위 7건 + `loadSurges` 통합 7건:

- ETF group 제외 / 소문자 `etn` 정규화 / 오분류 570127 이름 fallback / 인버스·레버리지 / 스팩 통과 / null-null 통과.
- **slice 전 필터 순서 (핵심):** `surgeMax=2`, 등락률 1·2위가 ETF·오분류 ETN, 3·4위가 일반 종목 → 결과가 3·4위 2건. slice 가 먼저였다면 0건이 된다.
- `stocks` select 인자에 `security_group` 포함 assert.
- 마스터 미해석 코드는 이름=코드로 통과 (기존 동작 보존).

## 검증

| 항목 | 결과 |
|------|------|
| `vitest run` (home-sync 전체) | 129/129 PASS (baseline 115 + 신규 14, 회귀 0) |
| `tsc --noEmit` | exit 0 |
| `stocks.security_group` 컬럼 실재 확인 | `20260415120000_split_stocks_master_quotes_movers.sql:92` — `text NOT NULL DEFAULT '주권'` |

컬럼 실재는 마이그레이션에서 직접 확인했다. 잘못된 컬럼명이면 PostgREST 가 프로덕션에서 400 을 반환하므로 배포 전 확인이 필요했다.

## Deviations from Plan

계획대로 실행. 아래 2건은 계획 범위 내 판단.

1. **TDD 커밋을 RED/GREEN 분리 대신 단일 커밋으로 통합** — 사용자 CLAUDE.md 의 "마지막 커밋과 현재 working tree 의 전체 차이를 한번에 커밋" 규칙 우선 적용. RED 단계는 실제로 먼저 실행해 12건 실패(`isExcludedProduct is not a function`)를 확인한 뒤 구현했다.
2. **stale 주석 1줄 수정 (계획 미기재)** — 기존 `// 1) 급등 종목 ... — desc 정렬 + surgeMax cap.` 주석이 재배치 후 사실과 달라져 "통과분 전체 / 정렬·cap 은 2b 에서" 로 갱신.

### 환경 이슈 (코드 무관)

fresh worktree 에서 `pnpm install` 이 `pnpm-workspace.yaml` 에 `allowBuilds` placeholder 블록을 자동 추가하고 `ERR_PNPM_IGNORED_BUILDS` 로 exit 1 했다(pnpm 11.15 동작). `pnpm run` 의 deps-status 체크가 이 install 을 재실행해 스크립트 경로가 막혀, `node_modules/.bin/` 바이너리(`tsup`/`vitest`/`tsc`)를 직접 호출해 우회했다. **`pnpm-workspace.yaml` 변경분은 커밋 전 `git checkout` 으로 되돌렸다** — 커밋에는 의도한 2개 파일만 포함.

## 후속 권고 (비차단)

- **ELW 미포함 갭:** 이번 제외 집합은 승인 설계대로 ETF/ETN 만이다(실측 ELW 0건). 다만 프로젝트의 기존 SQL 선례 4곳(`comovement_tables`, `surge_upper_cap`, `cosurge_pair_score_v2`, `cosurge_recent_pairs`)은 모두 `NOT IN ('ETF','ETN','ELW')` 로 ELW 를 함께 배제한다. 향후 stocks 마스터에 ELW 가 적재되면 홈 급등에만 새어 들어온다. 상수에 `"ELW"` 한 줄 추가로 해소 가능.
- **스팩:** 범위 밖 결정으로 계속 통과한다(회귀 가드 테스트 존재). MEMORY `reference_spac_classification` 기준 별도 판단 필요.

## Task 2 — 배포 + smoke (CHECKPOINT, 미실행)

worktree 격리 제약으로 실행하지 않았다. 오케스트레이터가 merge 후 진행:

1. `cd workers/home-sync && pnpm build`
2. `bash scripts/deploy-home-sync.sh` (env: `GCP_PROJECT_ID` + `SUPABASE_URL` 필수)
3. `bash scripts/smoke-home-sync.sh` — INV-1~6 PASS
4. Job 1회 실행 후 최신 `home_theme_snapshots` payload 확인 — ETF/ETN/인버스/레버리지 종목명 0건, "인버스ETN" 류 테마 소멸, `stock_count` 0 붕괴 없음
5. 프로덕션 홈 https://gh-radar-webapp.vercel.app/ 육안 확인

## Self-Check: PASSED

- `workers/home-sync/src/pipeline/loadSurges.ts` — FOUND (수정됨, `isExcludedProduct` export 포함)
- `workers/home-sync/src/pipeline/loadSurges.test.ts` — FOUND (`570127` fixture 포함)
- 커밋 `5c2aadd` — FOUND (2 files changed, 335 insertions, 16 deletions)
- 테스트 129/129 + typecheck exit 0 실행 확인
