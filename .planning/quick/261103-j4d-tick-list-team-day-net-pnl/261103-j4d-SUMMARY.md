---
phase: quick-261103-j4d
plan: 01
subsystem: ticks (shared · tick-convert · supabase · webapp)
tags: [tick-viewer, team-pnl, tick-convert, backfill, supabase-rpc, ui-list]
status: complete
requires:
  - shared ticks 판정 · 손익 프리미티브(37-03 · 37-14)
  - tick_grids · tick_day_for_user(20261102200000)
  - limitup_accum_flow.pos_net_krw
provides:
  - shared teamDaySummaryOf · teamTradesOf · krxOrderDraftsOf · nxtOrderDraftsOf
  - tick_grids 팀 3칸 + tick_grid_team_pending · tick_grid_team_set
  - tick-convert backfill-team 모드
  - 틱뷰어 목록 팀 3열 · 폰 한 줄 · 정렬 4종
affects:
  - webapp/src/lib/ticks/tick-session.ts (주문 초안을 shared 에서 import)
  - tick-convert nightly · request · promote (upsert 행에 팀 3키)
tech-stack:
  added: []
  patterns:
    - 웹 · 워커가 같은 shared 순수 함수로 같은 숫자(목록 = 상세 끝 틱)
    - 계산 실패 격리 — 그 행 팀 값만 null + 에러 로그, 변환은 계속
    - null = 미계산(백필 표식) · 0 = 팀 체결 없음 (team_fills)
key-files:
  created:
    - packages/shared/src/ticks/team-day.ts
    - packages/shared/src/__tests__/ticks-team-day.test.ts
    - supabase/migrations/20261103230000_tick_grid_team_day.sql
    - supabase/tests/tick_grid_team_day.test.sql
    - workers/tick-convert/src/team-day.ts
    - workers/tick-convert/src/modes/backfill-team.ts
    - workers/tick-convert/tests/team-day.test.ts
    - workers/tick-convert/tests/backfill-team.test.ts
    - workers/tick-convert/tests/bench-team-day.ts
  modified:
    - packages/shared/src/ticks/index.ts
    - packages/shared/src/tick-api.ts
    - webapp/src/lib/ticks/tick-session.ts
    - webapp/src/lib/ticks/team-model.ts
    - webapp/src/lib/ticks/tick-format.ts
    - webapp/src/components/ticks/tick-entry.tsx
    - webapp/src/components/ticks/tick-team-panel.tsx
    - workers/tick-convert/src/{index,config,meta,store}.ts
    - workers/tick-convert/src/modes/{nightly,request,promote}.ts
    - supabase/tests/tick_viewer.test.sql
    - webapp/e2e/fixtures/ticks.ts · webapp/e2e/specs/ticks-viewer.spec.ts
decisions:
  - "팀 체결 없음 vs 0 구분은 team_fills 칸 하나로 — null 미계산(백필 대상) · 0 팀 체결 없음 · n>0 일 때만 net · pnl 값(CHECK tick_grids_team_chk)"
  - "끝 틱 = 거래소순 마지막 A3 · 자르기 시각 = 모든 A3 체결(못 읽으면 수신) 시각 최댓값 — 웹 runMaxNs[끝 A3] 와 같은 값"
  - "tick_grid_team_set 은 같은 object_path ∧ team_fills IS NULL 행만 갱신 — 그 사이 격자가 바뀌었거나 이미 값이 있으면 안 덮는다 · updated_at 불변"
  - "목록 0/모름 색은 --muted-fg(상세 패널의 --flat 과 별개 — 스케치 023 B · 플랜 결정 6)"
metrics:
  duration: "약 14분 (14:05~14:19 KST)"
  completed: 2026-11-03
estimate:
  tokens: 240000
  tasks: 3
actuals:
  tokens: 36000
  tasks: 3
  commits: 3
plan_head_before: 9b662c10fef8d874e892a5a598b070f92d8b58e0
plan_head_after: 5d1ebc870c292b59bc3906508d5b27825cd56fee
commits: 3
---

# Quick 261103-j4d: 틱뷰어 목록 팀 당일순매수 · 누적순매수 · 당일손익 Summary

**밤 격자 변환 때 shared `teamDaySummaryOf`(상세 「팀 거래정보」 끝 틱과 같은 함수)로 팀 당일 순매수 · 손익을 `tick_grids` 에 저장하고, 목록 RPC 가 매집감지 누적 순매수를 LEFT JOIN 해 진입 목록에 데스크톱 3열 · 폰 한 줄 · 순매수순/손익순 정렬로 보인다.**

## 커밋

| Task | 내용 | 커밋 |
|------|------|------|
| 1 | shared 팀 하루 요약 + 웹 주문 초안 이관 + 상세 끝 틱 KPI 일치 잠금(4 픽스처) | c1790223 |
| 2 | DB 팀 3칸 · 목록 RPC 누적 JOIN · 워커 3모드 저장 · backfill-team · 벤치 | db53642f |
| 3 | 목록 UI 3열 · 폰 한 줄 · 정렬 4종 · 단위 · e2e | 5d1ebc87 |

## 검증 결과

- shared: build · typecheck · vitest(team-day · pnl · orders-krx · orders-nxt 골든) 52 통과 / 2 skip(선택 픽스처 기존 skip)
- webapp: typecheck(본 + e2e) · vitest `src/lib/ticks src/components/ticks` 23파일 247 통과
- 일치 잠금: 천일 10/14 KRX · 컷 KRX · 컷 NXT · 빅텍 G4 — `teamDaySummaryOf` = `teamKpiAt(끝 틱)` 의 fills · dayNetVal · dayNetQty · lastPx · pnl(toEqual). 천일 total_val 31,782,350 · end_qty 3,406
- tick-convert: typecheck · vitest 10파일 127 통과(새 team-day 5 · backfill-team 9 · entry/config/request 확장)
- pgTAP: `tick_grid_team_day.test.sql` 27/27 PASS · `tick_viewer.test.sql` 109/109 PASS · REVOKE EXECUTE 8줄(함수 4 × 2)
- server typecheck 통과
- e2e `ticks-viewer.spec.ts` 19/19 통과(새 「진입 — 팀 열 · 정렬 · 폰 한 줄」 포함 · 1280/700/390 가로 넘침 0 · 카드 안 표 폭 ≤ 카드 폭)

## 메모리 실측 (결정 4 · 상한 NXT 64만 계산 ≤ 30초 · RSS 증가 ≤ 1.5GiB)

`pnpm --filter @gh-radar/tick-convert exec /usr/bin/time -l node --import tsx tests/bench-team-day.ts --ex <EX> --records 640000 [--no-compute]` (맥 · Node 24)

| 거래소 | 레코드 | 원시 바이트 | 계산 ms | fills | 최대 RSS 기준선(--no-compute) | 최대 RSS 계산 | 증가분 |
|--------|--------|-------------|---------|-------|-----------------------------|---------------|--------|
| NXT | 642,544 | 316,555,008 | 1,264 | 502 | 405 MiB (424,968,192B) | 886 MiB (929,218,560B) | **+481 MiB** |
| KRX | 647,460 | 324,971,136 | 502 | 25,168 | 414 MiB (434,192,384B) | 615 MiB (645,414,912B) | **+201 MiB** |

상한 안(NXT 1.3초 ≪ 30초 · +481MiB ≪ 1.5GiB). 비교: 10/30 nightly 스테이징 최대 1.95GB · Job 메모리 8Gi — 키 하나씩 순차 계산이라 동시 증가분은 한 키 몫(≤ 약 0.5GiB)만 더해진다. 합성 격자는 컷 13시 픽스처를 이어 붙인 것(값 의미 없음 · 규모만).

## 팀 체결 없음 / 0 구분 (team_fills)

- `team_fills` null = 미계산(옛 행 · 계산 실패) — `tick_grid_team_pending` 이 백필 대상으로 고른다(재실행 안전).
- `team_fills` 0 = 팀 체결 없음 — net · pnl 은 null → 화면 「—」(상세 패널도 k = 0 이면 「—」).
- `team_fills` > 0 = net · pnl 값 — 화면 「0」 은 팀이 거래했고 값이 정확히 0 일 때만.
- CHECK `tick_grids_team_chk` 가 세 경우 밖(0 인데 값 · n>0 인데 null · 음수)을 막는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tick_viewer.test.sql 기존 실패(listing_shares) 보정**
- **Found during:** Task 2 (pgTAP 검증)
- **Issue:** 커밋 4f15fb68 의 `20261103210000_tick_open_listing_shares.sql` 이 `tick_open_for_user.stock` 에 `listing_shares` 를 더했는데 test 16 기대값을 고치지 않아 이 플랜과 무관하게 실패(검증 명령이 이 파일 통과를 요구)
- **Fix:** 기대 jsonb 에 `"listing_shares": null` 추가(플랜 범위 파일 · 단언 수 불변 109)
- **Files modified:** supabase/tests/tick_viewer.test.sql
- **Commit:** db53642f

**2. [Rule 2 - 검증 보강] e2e 에 카드 안 표 폭 검사 추가**
- **Found during:** Task 3
- **Issue:** 진입 카드는 `overflow-hidden` 이라 표가 넘쳐도 문서 가로 스크롤 검사로는 안 잡힌다(열이 조용히 잘림)
- **Fix:** `expectEntryTableFits` — 700 · 390 에서 표 scrollWidth ≤ 카드 clientWidth 단언(통과 — 고칠 결함 없음)
- **Commit:** 5d1ebc87

### 작은 판단

- 워커 `gridTeamOf` 의 느림 로그는 레코드 수 대신 바이트 수를 싣는다(해제 바이트 길이는 이미 있고 레코드 수는 다시 세야 함).
- request 테스트 한 파일에서 `vi.mock('@gh-radar/shared')` 토글로 계산 throw 를 주입(nightly · promote 는 실제 값 일치 단언).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: rpc | supabase/migrations/20261103230000_tick_grid_team_day.sql | 새 RPC 2개(tick_grid_team_pending · tick_grid_team_set) — service_role 전용 · anon/authenticated REVOKE · SECURITY INVOKER (pgTAP 잠금) |

## 메인 세션 배포 체크리스트 (executor 는 하지 않음 — 결정 7 순서)

1. 마이그레이션 — `supabase db push --linked --yes`. 옆 세션(Phase 38)이 더 늦은 타임스탬프 마이그레이션을 먼저 올려 out-of-order 로 거부되면, 파일을 더 늦은 타임스탬프로 이름만 바꾸고 pgTAP 를 다시 돌린 뒤 push.
2. tick-convert 재배포 — `bash scripts/deploy-tick-convert.sh`(nightly/request Job · promote Job 같은 이미지 · env 는 라이브 Cloud Run 에서 추출 — 메모리 「워커 배포 스크립트 env」).
3. 백필 — 23:30 · 01:30 nightly 창을 피해서. 먼저 `gcloud run jobs execute gh-radar-tick-convert --region asia-northeast3 --args=backfill-team,--dry-run --wait` → 로그에서 키별 값 · 요약 줄 확인 → `--args=backfill-team` 본 실행 → 요약 `team_failed=0 failed=0 deferred=0` · 다시 dry-run 하면 `pending=0`.
4. 웹 push(= Vercel 프로덕션 배포).
5. 확인 — `/analytics/ticks` 과거 날짜 목록에서 아무 종목 하나를 열어 「팀 거래정보」 를 끝 틱으로 옮겼을 때 당일 순매수 · (실현+미실현) 이 목록 값과 같은지 · 매집감지 등록 종목은 누적순매수가 매집감지 보고서 순매수와 같은지.

참고: 웹은 배포 순서와 무관하게 안전하다 — 옛 RPC 응답(키 없음) · 오늘 목록은 「—」.

## Self-Check: PASSED

- 파일 존재: team-day.ts(shared · 워커) · 마이그레이션 · pgTAP · backfill-team.ts · bench-team-day.ts · 테스트 2종 — 모두 FOUND
- 커밋: c1790223 · db53642f · 5d1ebc87 — `git merge-base --is-ancestor` FOUND
- 커밋에 `.planning/*` · milestone.lock 없음(`git show --stat HEAD~2..HEAD`)
