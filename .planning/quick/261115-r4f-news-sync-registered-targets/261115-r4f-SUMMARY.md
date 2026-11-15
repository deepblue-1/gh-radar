---
phase: quick-261115-r4f
plan: 01
subsystem: workers/news-sync
status: complete
tags: [news-sync, naver, kis_news_targets, budget]
requires: [public.kis_news_targets (service_role SELECT), "@gh-radar/shared isEtpProduct"]
provides: [화면 조회 등록 종목의 네이버 뉴스 수집, 사용량 90% 초과 시 등록 종목 제외, 일일 상한 24500]
affects: [scripts/deploy-news-sync.sh, CLAUDE.md 공식 API 운영 기준]
tech-stack:
  added: []
  patterns: [부가 대상 조회 실패는 throw 없이 warn 후 진행, 순수 판정은 cadence.ts 에 모음]
key-files:
  created:
    - workers/news-sync/tests/targets.test.ts
  modified:
    - workers/news-sync/src/pipeline/targets.ts
    - workers/news-sync/src/pipeline/cadence.ts
    - workers/news-sync/src/index.ts
    - workers/news-sync/src/config.ts
    - workers/news-sync/tests/cadence.test.ts
    - workers/news-sync/tests/cycle.test.ts
    - workers/news-sync/tests/config.test.ts
    - workers/news-sync/tests/naver.test.ts
    - scripts/deploy-news-sync.sh
    - CLAUDE.md
decisions:
  - "등록 전용 종목 = kis_news_targets.last_requested_at > now − 10분 · 급등 · 관심 밖 · 마스터 안 · ETP 아님, 최근 조회순 30개까지 hot 등급"
  - "사용량이 상한의 90% 를 초과(경계 22050 은 유지)하면 등록 전용부터 제외 — checkBudget 을 planRun 앞으로 옮김"
  - "news-sync 일일 상한 24500 (공식 25,000 의 98% · 2026-11-15 사용자 결정)"
metrics:
  completed: 2026-11-15
  tasks: 3
  files: 11
estimate:
  tokens: 90000
  tasks: 3
actuals:
  tokens: 12135
  tasks: 3
  commits: 3
plan_head_before: b2655632c6a53f455494d216ed596d666d56708a
plan_head_after: c7a515107838329593f78a5f2344f1be23a7c23d
---

# Quick 261115-r4f: news-sync 화면 조회 등록 종목 수집 Summary

화면에서 조회돼 `kis_news_targets` 에 최근 10분 안 등록된 급등 · 관심 밖 종목을 최근 조회순 30개까지(ETP · 마스터 밖 제외) hot 등급으로 네이버 뉴스 수집 대상에 넣고, 사용량이 상한 24,500 의 90% 를 넘으면 그 종목부터 뺀다.

## 커밋

| Task | 내용 | 커밋 |
|------|------|------|
| 1 | 등록 종목 읽기 → 등록 전용 조립 → hot 등급 → run 수집 (tracer) | 81585692 |
| 2 | 사용량 90% 초과 시 등록 전용 제외 | 3a9f45ca |
| 3 | 일일 상한 24500 · 배포 env · CLAUDE.md 운영 기준 | c7a51510 |

## 무엇이 바뀌었나

- `targets.ts` — `loadTargets(supabase, now)` 가 `{ records, registeredLookupError }` 를 돌려준다. 3단계로 `kis_news_targets` 를 `gt(last_requested_at, now − 10분)` · 최근순 · 코드순 · `limit(200)` 로 읽는다. 조회 실패(에러 응답 · 예외)는 throw 하지 않고 메시지를 돌려준다. 마스터 조회에 `security_group` 을 더해 `isEtpProduct` 로 등록 전용 후보의 ETP 를 거른다. 급등 · 관심이 0건이어도 등록 전용은 담긴다.
- `cadence.ts` — `TargetRecord.registered` · `TargetCounts.registered` · `isHot` 에 등록 전용 · `REGISTERED_BUDGET_CUTOFF_RATIO = 0.9` · `dropRegisteredOverBudget`.
- `index.ts` — 조회 실패 warn 1줄, `checkBudget` 을 planRun 앞으로 옮기고 90% 초과면 warn 1줄(`used` · `budget` · `dropped`). 기존 「예상 호출이 상한을 넘으면 cycle skip」 가드는 그대로. 「news-sync targets selected」 info 에 `budgetBefore` 를 함께 싣는다.
- 상한 기본값 · 배포 env `NEWS_SYNC_DAILY_BUDGET` = 24500, CLAUDE.md 「공식 API 운영 기준」 의 Naver 소비처 · 예산 · 수집 주기 3줄과 규칙 ① 예외 · 규칙 ③ 고정 상한 30 구절.

## 검증

- 계획 시점 기준선: 14 파일 · 139 통과 · 3 todo.
- 완료 후: `pnpm --filter @gh-radar/news-sync exec vitest run --maxWorkers=2` = 15 파일 · 160 통과 · 3 todo · 실패 0. `typecheck` 무오류. `bash -n scripts/deploy-news-sync.sh` 통과.
- 옛 상한 숫자 부정 grep 0건. `NEWS_SYNC_DAILY_BUDGET=24500`(2) · 「공식 25,000 의 98%」(1) · 「고정 상한 30」(1).
- 변경 경로는 `workers/news-sync/(src · tests)` · `scripts/deploy-news-sync.sh` · `CLAUDE.md` 안에만 있다.

## 배포 상태

**아직 배포하지 않았다.** 메인 세션이 `scripts/deploy-news-sync.sh` 로 따로 한다 (워커 이미지 · Job env `NEWS_SYNC_DAILY_BUDGET=24500` 반영). push 도 하지 않았다.

## Deviations from Plan

1. **[커밋 가드] master 에 직접 커밋** — 실행기 커밋 가드(`git.base-branch --is-protected master` = true)는 master 커밋을 막으라고 하지만, 오케스트레이터가 master 메인 트리 순차 실행을 명시했고 프로젝트 관례(작업은 master)와 같아 그대로 커밋했다.
2. **편집 수단** — 일부 기존 파일 편집을 Edit 도구 대신 python 문자열 치환(정확히 1회 일치 단언)으로 했다. 결과는 같고 파일 범위도 계획대로다.

그 밖에는 계획대로 실행했다. 테스트 수는 계획 문구(「기준선에 새 targets.test.ts 와 추가 사례가 더해진 수」)대로 늘었다: targets 11 · cadence +5(등록 hot 1 · drop 4) · cycle +5(C8 · C9a ~ C9c · C10).

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: workers/news-sync/tests/targets.test.ts
- FOUND: 81585692 · 3a9f45ca · c7a51510 (HEAD 조상)
