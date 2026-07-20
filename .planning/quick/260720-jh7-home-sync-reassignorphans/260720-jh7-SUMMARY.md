---
phase: quick-260720-jh7
plan: 01
subsystem: workers/home-sync
tags: [home-sync, ai-clustering, roundup-guard, reassignOrphans]
requires:
  - workers/home-sync/src/pipeline/loadSurges.ts (Surge/NewsRow 계약)
  - "@gh-radar/shared HomeNewsRef"
provides:
  - isRoundupNews 데이터 기반 라운드업 판정 헬퍼
  - "프롬프트 라운드업 규칙 + [라운드업] 라벨"
  - reassignOrphans 라운드업 news 제외 병합 신호
affects:
  - workers/home-sync (clusterSurges 파이프라인)
tech-stack:
  added: []
  patterns:
    - "순수 함수 헬퍼(roundup.ts)로 순환의존 회피 — prompt.ts·clusterSurges.ts 양쪽 import"
    - "데이터 기반 휴리스틱(급등 종목명 distinct 3+ verbatim) — 키워드 리스트 배제"
key-files:
  created:
    - workers/home-sync/src/ai/roundup.ts
    - workers/home-sync/src/ai/roundup.test.ts
  modified:
    - workers/home-sync/src/ai/prompt.ts
    - workers/home-sync/src/ai/prompt.test.ts
    - workers/home-sync/src/ai/clusterSurges.ts
    - workers/home-sync/src/ai/clusterSurges.test.ts
decisions:
  - "라운드업 판정 = 전체 distinct 3개 이상(총합 기준, 소속 종목 제외 안 함) — 실사례 4개로 여유 판정, 개별 특징주 오판 위험 낮음"
  - "reassignOrphans 시그니처 불변 — surgeByCode 에 이미 모든 급등 종목명 존재"
  - "라운드업 제외는 news 제목 동반 나열 신호에만 적용 — reason 매칭은 유지"
metrics:
  tasks_completed: 2
  tasks_total: 3
  files_created: 2
  files_modified: 4
  tests: "97 passed (82 baseline + 15 신규, 회귀 0)"
  completed: 2026-07-20
---

# Quick 260720-jh7: home-sync 라운드업 가드 Summary

home-sync 라운드업(시황/거래상위/마감) 기사가 급등 종목명을 여러 개 나열할 때 발생하는 두 오염(Claude 오클러스터 + reassignOrphans 오흡수)을 데이터 기반 휴리스틱(`isRoundupNews`)으로 가드했다.

## 배경

2026-07-20 실사례: "[서울데이터랩] 코스피 거래상위 고려산업·형지·흥아해운·SK이터닉스…" 라운드업 기사가 여러 급등 종목을 나열 → reassignOrphans 가 "라운드업 제목에 종목명 등장"을 정밀 병합 신호로 오해해 고려산업이 엉뚱한 테마로 오흡수되고 사료 테마 힌트(고려산업+미래생명자원)가 무력화됨.

## 완료된 작업 (Task 1-2)

### Task 1 — isRoundupNews 헬퍼 (commit 6695b0d)
- `workers/home-sync/src/ai/roundup.ts` 신설: 순수 함수, 프로젝트 특정 import 없음(순환의존 회피).
- 판정: `news.title + " " + (description ?? "")` 에 급등 종목명(surgeNames)이 verbatim 부분문자열로 **distinct minDistinct(기본 3)개 이상** 등장하면 true.
- distinct dedup(중복 부풀림 방지), 빈 name 스킵, HomeNewsRef(description 없음) 안전 처리.
- 키워드 리스트("시황"/"거래상위") 미사용 — 순수 데이터 휴리스틱.
- 10 테스트: 경계(2 false/3 true) + 실사례 fixture + description 합산 + distinct dedup + 빈 names.

### Task 2 — 프롬프트 규칙/라벨 + reassignOrphans 제외 (commit 14fa9e9)
- **prompt.ts:**
  - `CLUSTER_SYSTEM_PROMPT` 에 라운드업 규칙 추가(뉴스 라인 `[라운드업]` 표기 기사는 테마 묶음 근거로 삼지 말 것, JSON 계약 불변).
  - `formatClusterMessage`: `surgeNames` 계산 후 각 news 에 `isRoundupNews` 판정 → 라운드업이면 라인에 `[라운드업] ` prefix. **indexedNews(verbatim)는 미포함 — 계약 불변.**
- **clusterSurges.ts:**
  - `reassignOrphans` 시그니처 **변경 없음**. 함수 시작부 `surgeNames = [...surgeByCode.values()].map(v => v.name)` 1회 계산.
  - 후보 테마 `inNews` 조건을 `!isRoundupNews(n, surgeNames) && n.title.includes(name)` 으로 변경. `inReason` 매칭은 유지.
- **테스트:** 고려산업 오흡수 방지 fixture(라운드업 제목 3+ 나열 → 병합 안 함, singles 유지) + 금호건설 정상 병합 회귀(2 distinct < 3 → 라운드업 아님 → 병합 유지) + 프롬프트 규칙/라벨 + indexedNews 불변.

## 검증

- `cd workers/home-sync && npx vitest run` → **97 passed (8 files)**. 기존 82 + 신규 15, 회귀 0.
- `npx tsc --noEmit` → exit 0.
- worktree fresh: `pnpm install` + `packages/shared` 빌드(`npx tsup`) 선행.

## Deviations from Plan

None - plan executed exactly as written (Task 1-2). Task 3(배포+smoke)은 orchestrator 위임.

## Task 3 — 배포 + smoke (orchestrator 실행 대기)

checkpoint:human-verify(blocking). worktree 안에서 배포하지 않음. orchestrator 가 merge 후:
1. home-sync 이미지 빌드 + Cloud Run Job `gh-radar-home-sync` 재배포.
2. Job 수동 execute → 로그에서 `[라운드업]` 라벨 출력 + 고려산업류 오흡수 없음 확인.
3. smoke-home-sync 재실행 → PASS.
4. (선택) 급등 슬롯이면 `/api/home` 에서 사료 테마 힌트 무력화 안 됐는지 스팟체크.

주의(lessons): 주기/기대값 하드코딩 smoke 스크립트가 이번 변경과 무관해도 실패 표기되는지 확인.

## Self-Check: PASSED

- FOUND: workers/home-sync/src/ai/roundup.ts
- FOUND: workers/home-sync/src/ai/roundup.test.ts
- FOUND: workers/home-sync/src/ai/prompt.ts
- FOUND: workers/home-sync/src/ai/clusterSurges.ts
- FOUND commit: 6695b0d
- FOUND commit: 14fa9e9
