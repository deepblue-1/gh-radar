---
phase: quick-260720-in0
plan: 01
subsystem: workers/home-sync
tags: [home-sync, clustering, theme-hints, anti-hallucination]
requires:
  - themes/theme_stocks (theme-sync 산출물, 이미 적재)
  - loadSurges Surge[] 계약
provides:
  - loadThemeHints (급등 2+ 공유 네이버 테마 → Map<themeName, string[]>)
  - formatClusterMessage 참고 테마 분류 섹션
affects:
  - home-sync 클러스터링 프롬프트 (입력 토큰 소폭 증가, 호출 횟수 불변)
tech-stack:
  added: []
  patterns:
    - QUOTE_CHUNK 청크 IN (loadSurges 계승)
    - 별도 인자 힌트 전달 (Surge 타입 불변)
key-files:
  created:
    - workers/home-sync/src/pipeline/loadThemeHints.ts
    - workers/home-sync/src/pipeline/loadThemeHints.test.ts
  modified:
    - workers/home-sync/src/ai/prompt.ts
    - workers/home-sync/src/ai/prompt.test.ts
    - workers/home-sync/src/ai/clusterSurges.ts
    - workers/home-sync/src/ai/clusterSurges.test.ts
    - workers/home-sync/src/index.ts
    - workers/home-sync/src/index.test.ts
decisions:
  - loadThemeHints 를 4b(hash-miss) 분기에서만 호출 — carry/skip 시 불필요한 Supabase 쿼리 회피
  - content hash 는 불변 (테마 멤버십은 일 배치라 사실상 정적, approved-plan §3)
metrics:
  duration: ~15min
  tasks: 2 (+ 1 checkpoint)
  files: 8
  completed: 2026-07-20
---

# Phase quick-260720-in0 Plan 01: home-sync 테마 멤버십 힌트 Summary

home-sync 클러스터링에 급등 종목 2+ 가 공유하는 네이버 테마 멤버십을 "참고 테마 분류" 힌트로 얹어, 뉴스 텍스트 신호가 없어도 곡물사료류 동반 급등을 하나의 테마로 묶는다 (anti-hallucination 유지, 추가 크롤링/API 0).

## What Was Built

### Task 1 — 테마 힌트 로더 `loadThemeHints` (commit c5e9d7c)
- 신규 `workers/home-sync/src/pipeline/loadThemeHints.ts`.
- `theme_stocks`(effective_to IS NULL 활성 멤버십, code 청크 IN) → `Map<theme_id, Set<stock_code>>` 누적 (청크 경계 넘어 합산).
- **2+ 공유 필터**: 급등 종목 1개만 속한 테마(정치인 테마 등) 제외.
- `themes`(id 청크 IN, hidden=false) name 해석 → `Map<themeName, string[]>` (code 오름차순, 결정적 출력, 동일 name 병합).
- 빈 codes → Supabase 호출 0. theme_stocks 0행 → 빈 Map (themes 조회 skip). Supabase error → throw.
- 테스트 7종 (2+ 필터·청크 경계 합산·effective_to·hidden·빈 입력·0행·error).

### Task 2 — 프롬프트 참고 섹션 + 배선 (commit 420d1ae)
- `prompt.ts`:
  - `formatClusterMessage(surges, themeHints = new Map())` — themeHints.size>0 이면 유저 메시지 끝에 "참고 테마 분류 (네이버, 2개 이상 급등 종목이 공유하는 것만):" 섹션 append. 종목명은 surges 에서 해석, 미해석 시 코드만. 빈 Map → 미출력(기존 message 동일, 하위호환). indexedNews 계약 불변.
  - `CLUSTER_SYSTEM_PROMPT` 규칙 2줄 추가: (a) 뉴스 부족해도 참고 테마 2+ 묶기 허용 + reason='동일 테마 소속 동반 급등' + newsRefs 실제 인덱스만, (b) 참고 분류가 뉴스 서사와 충돌하면 뉴스 우선.
  - `CLUSTER_FEW_SHOT` 에 곡물사료 예시 1개 추가 (뉴스 없는 2종목 + 참고 분류 → 사료 테마, newsRefs=[]).
- `clusterSurges.ts`: `clusterSurges(surges, cfg, themeHints = new Map())` → `formatClusterMessage(surges, themeHints)` 전달. 나머지 파이프라인 불변.
- `index.ts`: `HomeSyncDeps.cluster` 시그니처에 themeHints 추가. 4b(hash-miss) 분기에서 `loadThemeHints(supabase, surges.map(s => s.code))` 호출 → `cluster(surges, cfg, themeHints)` 전달. carry/skip/transient-empty 분기는 불변 (loadThemeHints 미호출 → Supabase 절약).
- 테스트: prompt(참고 섹션 포맷·종목명 미해석 방어·빈 Map 하위호환·indexedNews 불변·규칙·few-shot), clusterSurges(전달 경로·기본값 하위호환), index(surges>0 loadThemeHints 호출 + cluster 3번째 인자, surges=0 미호출).

## Verification

- `workers/home-sync` vitest: **82/82 통과** (65 baseline 회귀 0 + 17 신규).
- `tsc --noEmit`: exit 0.
- content hash·Claude 호출 횟수 불변 (입력 토큰만 참고 섹션 라인 수만큼 소폭 증가).

주의: 워크트리가 fresh 라 실행 전 `pnpm install` + `packages/shared` tsup 빌드 선행. pnpm 의 pre-run deps 체크가 ignored build scripts 로 exit 1 이라 `node_modules/.bin/vitest run` / `tsc --noEmit` 직접 실행으로 검증.

## Deviations from Plan

None — 승인 설계(approved-plan.md)를 그대로 분해 실행. 배포/스모크(Task 3)는 오케스트레이터가 병합 후 사용자 GCP 인증으로 실행.

참고: PLAN 의 checkpoint 문구는 스케줄을 `*/5 9-15` 로 적었으나 실제 배포/스모크 기대값은 `*/5 8-15 * * 1-5`(프리마켓 8시대 포함, smoke INV-5 하드코딩)이다. 이번 변경은 스케줄을 건드리지 않으므로 smoke 기대값 수정 불필요.

## Known Stubs

None.

## Threat Flags

None — 신규 네트워크 엔드포인트/인증 경로/스키마 변경 없음. 기존 적재 테이블(themes/theme_stocks) 읽기 2회 추가뿐.

## Self-Check

- 생성 파일 존재 확인: loadThemeHints.ts / .test.ts (worktree).
- 커밋 확인: c5e9d7c (Task 1), 420d1ae (Task 2).
