---
phase: quick-260720-kyh
plan: 01
subsystem: workers/home-sync
tags: [home-sync, clustering, sticky-prior, invariant, prompt]
requires: [home_theme_snapshots, themes, theme_stocks, stock_quotes, news_articles]
provides: [sticky-prior-prompt, membership-invariant, countStocks-unique]
affects: [home-sync worker, home 화면 신뢰도]
tech-stack:
  added: []
  patterns: [sticky-prior 프롬프트 섹션, 순수 후처리 invariant, unique Set 집계]
key-files:
  created: []
  modified:
    - workers/home-sync/src/ai/prompt.ts
    - workers/home-sync/src/ai/prompt.test.ts
    - workers/home-sync/src/ai/clusterSurges.ts
    - workers/home-sync/src/ai/clusterSurges.test.ts
    - workers/home-sync/src/index.ts
    - workers/home-sync/src/index.test.ts
decisions:
  - "enforceMembershipInvariant 시그니처에 surgeByCode(ReadonlyMap) 추가 — sub-2 강등 시 code/name/changeRate 재구성 필요. ReadonlyMap 으로 Map<string,Surge> 를 covariant 하게 수용(TS 불변성 회피)."
  - "테마간 중복 evidence 2+ 는 복수 소속 유지(사용자 결정), 0~1 은 우선순위(evidence>stocks.length>먼저)로 1개 축소."
  - "countStocks 를 unique Set 집계로 교체 — evidence 복수 소속 잔존 시 과대 카운트 방지. server/webapp verbatim 통과라 표시 영향 없음."
  - "invariant 는 clusterSurges return 직전 최종 themes/singles 에 적용 + 강등 single 추가되므로 singles 재정렬."
metrics:
  duration: ~15min
  completed: 2026-07-20
  tasks: 2 (auto) + 1 (checkpoint 대기)
  files: 6
  commits: 2
---

# Quick Task 260720-kyh: home-sync 클러스터링 안정화 3종 Summary

home-sync 5분 슬롯 재클러스터링의 테마 명멸(고려산업 [사료]→[애국테마]→single 요동)과 종목 중복 소속(테마+single / 테마간)을 sticky prior 프롬프트 + can→should 힌트 강화 + 중복 소속 invariant + countStocks unique 4개 변경으로 해소한다.

## What Was Built

### Task 1 — 프롬프트 3종 (prompt.ts) · commit 1c3b08f
- `formatClusterMessage` 에 3번째 인자 `prevThemes: HomeSurgeTheme[] = []` 추가. 현재 급등집합(surges code)에 존재하는 멤버만 렌더(이탈 종목 제외), 이름은 현재 surges name 사용, 남은 멤버 0 테마 라인 skip. 하나라도 라인이 있을 때만 `\n\n직전 테마 구성 (5분 전):\n{lines}` append. 빈 배열/전멤버 이탈이면 미출력(하위호환), indexedNews 계약 불변.
- `CLUSTER_SYSTEM_PROMPT` 규칙 강화:
  - sticky rule — "직전 테마 구성이 주어지면 기본값으로 유지 … 테마명도 직전 이름 재사용(명멸 방지)".
  - can→should — "묶을 수 있다" → "각 종목의 뉴스가 서로 다른 재료를 명확히 제시하지 않는 한, 그 테마로 묶어라". 뉴스 우선 규칙에 "명확한 다른 재료일 때만 힌트를 이긴다(무정보·[라운드업] 제외)" 조건 명시.
  - 복수 소속 원칙 — "한 종목은 원칙적으로 하나에. 서로 다른 재료가 각각 뉴스로 확인될 때만 복수 테마 소속 허용".
  - 기존 "동일 테마 소속 동반 급등"·"뉴스를 우선한다"·"참고 테마 분류" 문구는 보존(기존 테스트 회귀 0).

### Task 2 — invariant + 배선 + unique (clusterSurges.ts / index.ts) · commit ae6797c
- `enforceMembershipInvariant(themes, singles, surgeNames, surgeByCode)` 순수 export:
  - (a) 테마간 중복: 2+ 테마 소속 code 는 비라운드업 뉴스 제목에 종목명 verbatim 등장(hasEvidence)으로 판정 — evidence 2+ 면 그 테마들에만 유지(복수 허용), 0~1 이면 evidence>stocks.length>먼저 우선순위로 1개 축소.
  - (b) invariant 후 stocks.length < 2 테마 제거 + 그 멤버 중 살아있는 테마에 없는 code 는 single 강등(surgeByCode 재구성, reason=null, news=[]).
  - (c) 살아있는 테마 멤버 code 는 singles 에서 제거(테마+single 동시 방지).
  - 입력 배열/원소 원본 미변경(명시 복제).
- `clusterSurges` 4번째 인자 `prevThemes` → `formatClusterMessage` passthrough + return 직전 invariant 적용 후 singles 재정렬.
- `index.ts`: `countStocks` unique Set 집계로 교체 + export. 4b(hash-miss) 분기에서 `prevRow.payload.themes ?? []` 를 cluster 로 전달(추가 쿼리 없음). `HomeSyncDeps.cluster` 시그니처에 `prevThemes` 인자 추가.

## Verification

- `workers/home-sync` vitest 전체 **115/115 통과** (baseline 97 + 신규 18). typecheck exit 0.
- prompt.test.ts: sticky prior 섹션 렌더/생략/이탈 멤버 제외/현재 이름 사용/indexedNews 불변 + 시스템 프롬프트 sticky/should/복수소속 문구.
- clusterSurges.test.ts: enforceMembershipInvariant 12:05 실사례(218150 2테마+single → 근거 테마만 유지·single 제거·sub-2 강등)·evidence 2+ 복수 유지·테마+single 제거·순수성 + clusterSurges prevThemes passthrough + invariant 통합.
- index.test.ts: countStocks unique(테마간/테마+single 중복 1회 집계) + 4b prevThemes 전달(있음/없음).

## Deviations from Plan

None - plan 대로 실행. enforceMembershipInvariant 시그니처는 plan 의 "구현 편의에 맞게, 순수/테스트가능하게" 재량에 따라 surgeByCode(ReadonlyMap) 인자를 추가함(sub-2 강등 재구성에 필요).

## Known Stubs

None.

## Checkpoint Pending

Task 3 (`checkpoint:human-verify` — 프로덕션 배포 + smoke)는 worktree 안에서 실행하지 않음. 오케스트레이터가 merge 후 아래를 실행:
1. `cd workers/home-sync && pnpm build`
2. `bash scripts/deploy-home-sync.sh`
3. `bash scripts/smoke-home-sync.sh` (전 항목 PASS)
4. 즉시 1회 실행 후 최신 스냅샷 검증 — themeCount/stockCount 정상, 한 종목 테마+single 동시 등장 0, stock_count 가 unique 집계와 일치.

## Self-Check: PASSED

- 수정 파일 6개 전부 존재 확인.
- 커밋 1c3b08f, ae6797c 존재 확인.
