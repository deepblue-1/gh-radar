---
phase: quick-261104-n9h
plan: 01
subsystem: ticks (틱뷰어 진입 목록 · DB RPC · shared)
status: complete
tags: [ticks, tick-viewer, accum-signal, kind16, container-query, pgtap, e2e]
requires:
  - dma_accum_signals_for_user_json (20261024230000)
  - stock_quotes.ohlc_updated_at (20261103090000)
  - tick_grids 팀 3칸 · tick_day_for_user (20261103230000)
provides:
  - tick_today_for_user open_rate + kind 16 팀 칸 7키
  - tick_day_for_user open_rate (KRX 일봉)
  - shared estimateTeamDayPnl · TeamDayEstimateInput
  - 틱뷰어 목록 9열(시가 · 고가) · 오늘 팀 값 · ≈ 추정 손익 · 카드 폭 컨테이너 쿼리
affects:
  - webapp /analytics/ticks 진입 목록(과거 · 오늘)
tech-stack:
  added: []
  patterns:
    - "Tailwind v4 이름 있는 컨테이너 쿼리 @container/tlist · @min-[800px]/tlist:*"
    - "SQL 재사용: jsonb_array_elements(dma_accum_signals_for_user_json(...)) → DISTINCT ON isin"
key-files:
  created:
    - supabase/migrations/20261104700000_tick_list_today_team_open.sql
    - supabase/tests/tick_list_today_team.test.sql
    - packages/shared/src/ticks/team-day-estimate.ts
    - packages/shared/src/__tests__/ticks-team-day-estimate.test.ts
  modified:
    - supabase/tests/tick_viewer.test.sql
    - supabase/tests/tick_grid_team_day.test.sql
    - packages/shared/src/tick-api.ts
    - packages/shared/src/ticks/index.ts
    - webapp/src/components/ticks/tick-entry.tsx
    - webapp/src/components/ticks/__tests__/tick-entry.test.tsx
    - webapp/e2e/fixtures/ticks.ts
    - webapp/e2e/specs/ticks-viewer.spec.ts
decisions:
  - "과거 시가 기준가 = tick_grids.base_px 우선 · 없으면 일봉 close − change_amount 폴백(같은 행 high_rate · last_rate 와 같은 분모)"
  - "오늘 kind 16 팀 칸은 state(qty) ∈ {1,2,3} ∧ isin <> '' 행만 — accumSignalOf 「표시할 수 없는 행」 규칙과 같게"
  - "시가 · 고가 열은 뷰포트가 아니라 카드 폭 컨테이너 쿼리(@container/tlist) 문턱 800px 로 숨김 — 미만은 등락률 칸 보조 두 줄"
metrics:
  duration: "약 15분(901초)"
  completed: 2026-11-04
actuals:
  tokens: 15000
  tasks: 3
  commits: 7
plan_head_before: a3e6837783f875249e15e412948195e1f70727b1
plan_head_after: 9da0dafb6089d815ddaecfcea74bc145e66f50b3
---

# Phase quick-261104-n9h Plan 01: 틱뷰어 목록 오늘 팀 칸 · 시가 · 고가 열 Summary

틱뷰어 오늘 목록에 매집감지 kind 16 isin 별 최신 행에서 뽑은 당일순매수 · 누적순매수와 「≈」 추정 당일손익(shared `estimateTeamDayPnl`)을 보이게 했다. 목록에는 기준가 대비 시가 · 고가 % 열을 더했고, 등락률은 종가/현재가 기준으로 바꿨다. 카드 폭 800px 미만에서는 시가 · 고가가 등락률 칸 아래 두 줄로 내려간다.

## 커밋

| Task | 커밋 | 제목 |
|------|------|------|
| 1 (tracer) | d644dc02 | feat(ticks): 오늘 목록 매집감지 팀 칸 · 시가 등락률 RPC + 오늘 행 당일순매수 · 누적순매수 |
| 2 (RED) | 87307d0c | test(ticks): 추정 당일손익 estimateTeamDayPnl 기대값(RED) |
| 2 (GREEN) | 988434d0 | feat(ticks): 오늘 목록 추정 당일손익(≈) — 매집감지 당일 축 순서 무시 근사 |
| 3 | 9da0dafb | feat(ticks): 틱뷰어 목록 시가 · 고가 열 + 등락률 종가/현재가 기준 · 좁은 폭 보조 줄 |

`actuals.commits: 7` 은 실측값(`git rev-list --count a3e68377..HEAD`)이다. 이 중 4개가 이 플랜 커밋이고, 나머지 3개(ac1fede1 · 91b49a0a · 0abea638)는 같은 트리에서 동시에 돌던 세션(261104-n7i · 인박스)의 커밋이 사이에 끼어든 것이다. 이 플랜의 4개 커밋은 workers · server · relay 를 건드리지 않는다(`git show --name-only` 로 확인).

## 검증

| 항목 | 명령 | 결과 |
|------|------|------|
| pgTAP 새 파일 | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_list_today_team.test.sql` | 21/21 PASS |
| pgTAP 기존 | `… --test supabase/tests/tick_viewer.test.sql` | 138/138 PASS |
| pgTAP 기존 | `… --test supabase/tests/tick_grid_team_day.test.sql` | 27/27 PASS |
| REVOKE 줄 수 | 주석 제외 `grep -c 'REVOKE EXECUTE'` | 4 |
| shared | `pnpm --filter @gh-radar/shared build` · `run typecheck` · `vitest run src/__tests__/ticks-team-day-estimate.test.ts --maxWorkers=2` | 통과 · 9/9 |
| webapp 타입 | `pnpm --filter @gh-radar/webapp run typecheck`(앱 + e2e tsconfig) | 통과 |
| webapp 단위 | `vitest run src/lib/ticks src/components/ticks --maxWorkers=2` | 26 파일 · 443/443 |
| e2e | `playwright test e2e/specs/ticks-viewer.spec.ts --workers=1` | 28 passed(setup 포함) |
| 잔재 식 | `grep -c 'high_rate ?? r.rate' tick-entry.tsx` | 0 |

pgTAP 은 로컬 docker(일회용 컨테이너 · 원격 접촉 0)로 실제로 돌렸다. 전체 회귀는 돌리지 않았다(제약대로 관련 파일만).

## 폭 측정

방법: 임시 Playwright 스펙(커밋하지 않고 지움)으로 1280 에서 오늘 · 과거 픽스처 표에 잠시 `width:max-content` 를 걸어 폭을 읽었다. 시가 · 고가 열이 보이는 상태다.

| 측정 | 과거(10/16 격자) | 오늘(clock 10/16 13:50) |
|------|------------------|-------------------------|
| 1280 max-content(시가 · 고가 열 보임) | 725px | 758px |
| 문턱 T = max(725, 758) + 40 을 10px 단위로 올림 | **800px** | |
| 1280 카드 폭 | 992px(≥ T → 열 보임) | 992px |

다섯 폭의 카드 폭과 표 폭(사다리 ① 적용 뒤 최종):

| 뷰포트 | 카드 폭 | 시가 · 고가 | 과거 max-content | 오늘 max-content | 문서 가로 넘침 | 표 ≤ 카드 |
|--------|---------|-------------|------------------|------------------|----------------|-----------|
| 1280 | 992 | 열 | 725 | 758 | 0 | 예 |
| 1024 | 736 | 보조 줄(사이드바 때문에 카드가 700 뷰포트와 비슷) | 558 | 592 | 0 | 예 |
| 700 | 684 | 보조 줄 | 558 | 592 | 0 | 예 |
| 640 | 624 | 보조 줄 | 558 | 592 | 0 | 예 |
| 390 | 374 | 보조 줄(팀 3열 · 출처는 기존 sm 규칙으로 숨김) | 335 | 328 | 0 | 예 |

(d) 사다리 적용: **① 적용 · ② 미적용.** 처음 측정 때 오늘 640 은 max-content 632 > 카드 624 였다. 문서 넘침은 0 이었지만 마지막 `›` 칸(w-6 = 24px)이 16px 로 눌렸다. 그래서 문턱 미만에서 숫자 칸(등락률 · 팀 3)과 출처 칸, 그 머리 칸 좌우 패딩을 px-3 → px-2 로 줄였다(`PADX = 'px-2 @min-[800px]/tlist:px-3'`). 그 뒤 오늘 640 은 592 ≤ 624 로 눌리는 칸이 없다. 문턱 이상(1280)은 px-3 그대로라 T 측정값은 바뀌지 않는다. 문턱 미만에서는 보조 두 줄 때문에 행 높이가 40 → 49px 로 는다(폰은 종목 칸이 이미 세 줄이라 같다).

## 계획자 다듬기 3건(그대로 반영)

1. **과거 시가 기준가는 `g.base_px` 를 먼저 쓴다.** `coalesce(nullif(g.base_px, 0), o.close − o.change_amount)` 다. 같은 행의 high_rate · last_rate 가 base_px 분모라 세 % 의 기준이 같아야 시가 ≤ 고가 관계가 화면에서 깨지지 않는다. 권리락 날엔 전일 종가 ≠ 기준가이기도 하다. pgTAP D 절에서 base_px 우선(3.0 · 일봉 기준가였다면 5.1)과 폴백(−5.0)을 둘 다 잠갔다.
2. **kind 16 은 state(qty) ∉ {1,2,3} 행을 뺀다**(isin '' 도 뺀다). accumSignalOf 의 「표시할 수 없는 행」 규칙과 같다. pgTAP B 절에서 qty 0 만 있는 종목 C 는 행은 남고(sources accum) 7키가 전부 null 임을 확인했다.
3. **시가 · 고가 열은 카드 폭 컨테이너 쿼리로 숨긴다.** section 에 `@container/tlist` 를 걸고 `hidden @min-[800px]/tlist:table-cell` 을 쓴다. 보조 줄은 `@min-[800px]/tlist:hidden` 이다. 사이드바가 lg 에서 생겨 뷰포트 폭과 카드 폭이 단조롭지 않기 때문이다. 실측으로도 1024 뷰포트 카드가 736px 로 700 뷰포트 카드(684px)와 거의 같았다. 팀 3열 · 출처 열의 sm: 뷰포트 규칙은 그대로 뒀다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 시각 결함] 오늘 목록 640 에서 › 칸이 눌림 → 사다리 ① 적용**
- **Found during:** Task 3 폭 측정
- **Issue:** 오늘 픽스처 640 에서 표 max-content 632 > 카드 624. 문서 넘침은 0 이었지만 마지막 `›` 칸이 24 → 16px 로 눌렸다.
- **Fix:** 문턱 미만에서 숫자 · 출처 칸과 그 머리 칸 패딩을 px-2 로 줄였다(문턱 이상은 px-3 으로 되돌림). 계획의 (d) ① 그대로다.
- **Files modified:** webapp/src/components/ticks/tick-entry.tsx
- **Commit:** 9da0dafb

### 실행 환경 메모(코드 변경 없음)

- **기본 브랜치 커밋 가드:** `gsd-tools query git.base-branch --is-protected master` 가 `true` 를 돌려줬다. 하지만 오케스트레이터 제약이 「master 에서 · 커밋 직전 브랜치 master 확인」 이고 프로젝트 관례도 master 직접 커밋이라, 매 커밋 직전 `git rev-parse --abbrev-ref HEAD` = master 를 확인하고 master 에 커밋했다.
- **동시 세션이 Task 1 · 2 커밋을 push 함:** 실행 중에 옆 세션이 `git push` 해서 origin/master = 91b49a0a 가 됐고, d644dc02 · 87307d0c · 988434d0 가 그 조상으로 함께 올라갔다(push = webapp 프로덕션 배포). 9da0dafb(Task 3)는 아직 push 되지 않았다. 마이그레이션 20261104700000 은 원격에 적용하지 않았다. 웹은 키가 없는 옛 RPC 응답을 「—」 로 그리도록 짜여 있어서(Task 1 · 2 단위 테스트로 잠김), DB 보다 먼저 배포돼도 깨지지 않는다.
- **임시 측정 스펙** `webapp/e2e/specs/zz-tmp-n9h-measure.spec.ts` 는 측정 뒤 지웠다(커밋 안 함).

## Known Stubs

없음.

## 메인 세션 체크리스트

executor 는 커밋까지만 했다. 메인 세션이 순서대로 진행한다.
1. `supabase db push --linked --yes` — 20261104700000 적용. 웹은 키 없음을 「—」 로 다루므로 순서상 안전하지만 관례대로 DB 먼저. (Task 1 · 2 웹은 이미 옆 세션 push 로 배포됐다 — 위 메모.)
2. server 재배포는 필요 없다(RPC pass-through).
3. `git push` — webapp 프로덕션 배포(push 자체가 배포). 9da0dafb 가 남아 있다.
4. 장중 확인: 오늘 목록 매집감지 종목의 당일순매수가 매집감지 화면 「당일」 값과 같고 손익이 「≈」 인지. 시가 · 고가 칸(hot set 종목) · 과거 목록 KRX 시가 값 · NXT 「—」 도 본다.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261104700000_tick_list_today_team_open.sql
- FOUND: supabase/tests/tick_list_today_team.test.sql
- FOUND: packages/shared/src/ticks/team-day-estimate.ts
- FOUND: packages/shared/src/__tests__/ticks-team-day-estimate.test.ts
- FOUND commits: d644dc02 · 87307d0c · 988434d0 · 9da0dafb(모두 HEAD 의 조상)
