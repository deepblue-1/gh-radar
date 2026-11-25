---
phase: quick-261125-c2i
plan: 01
status: complete
subsystem: admin-launch
tags: [launch, g2, admin, relay, server, webapp, supabase]
requires:
  - 20261125090000_launch_project_g2.sql (발사 저널 profile 4 → 'G2' 투영 · 운영 적용됨)
provides:
  - 어드민 발사 화면 08:30(G2) 발사 기준 — 세그먼트 · 계획 한 값 편집 · 「이 서버는 08:30 발사를 모름」 · 지도 · 주문 내역
affects:
  - packages/shared (LaunchFire · LaunchPlanProfile 확장 · 뒤탐침 타입 좁힘)
  - relay admin launch-plan / admin-api
  - server admin-launch
  - webapp /admin/launch
tech-stack:
  added: []
  patterns:
    - "fire · profile 목록 한 벌(LAUNCH_FIRE_KEYS · LAUNCH_PLAN_PROFILES) 을 zod enum · 화이트리스트가 그대로 쓴다"
    - "뒤탐침 축은 좁은 타입(LAUNCH_TAIL_PROBE_PROFILES · LAUNCH_TAIL_PROBE_FIRES) 으로 TS 가 강제"
key-files:
  created:
    - supabase/migrations/20261125110000_launch_g2_admin.sql
    - supabase/tests/launch_g2_admin.test.sql
  modified:
    - packages/shared/src/launch.ts
    - packages/shared/src/launch-plan.ts
    - packages/shared/src/__tests__/launch.test.ts
    - packages/shared/src/__tests__/launch-plan.test.ts
    - relay/src/admin/types.ts
    - relay/src/admin/launch-plan.ts
    - relay/src/admin/admin-api.ts
    - relay/tests/admin-launch-plan.test.ts
    - relay/tests/admin-api.test.ts
    - server/src/schemas/admin-launch.ts
    - server/src/services/admin-launch.ts
    - server/src/routes/admin-launch.ts
    - server/tests/routes/admin-launch.test.ts
    - webapp/src/lib/launch-format.ts
    - webapp/src/lib/launch-map.ts
    - webapp/src/lib/launch-plan-view.ts
    - webapp/src/lib/launch-api.ts
    - webapp/src/components/admin/launch-client.tsx
    - webapp/src/components/admin/launch-map-tab.tsx
    - webapp/src/components/admin/launch-plan-bar.tsx
    - webapp/src/components/admin/launch-orders-tab.tsx
    - webapp/src/components/admin/launch-tail-probe-bar.tsx
    - webapp/src/lib/__tests__/launch-format.test.ts
    - webapp/src/lib/__tests__/launch-map.test.ts
    - webapp/src/lib/__tests__/launch-plan-view.test.ts
    - webapp/src/components/admin/__tests__/launch-plan-bar.test.tsx
    - webapp/src/components/admin/__tests__/launch-map-tab.test.tsx
    - webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx
    - webapp/e2e/fixtures/launch.ts (files_modified 밖 — 컴파일 수리)
decisions:
  - "AXIS_CAP.g0830 = 20000µs — 한도 −3000 ~ +20000 · 첫 운영일 전이라 경계 군집 폭을 모름 · 밖은 기존 ◂/▸"
  - "주문 내역 08:30 은 Q16 꼴 재사용(예약 · 조각 · 라운드 열 · 접수 시각 · 카드 경계 · 학습 줄 · badLabel 101)"
  - "발사 기준 세그먼트 08:30 칸은 끝에 추가(16:00 · 09:00:30 순서 유지)"
  - "pieceKeyLabelOf 도 G2 를 예약 꼴(Q… · jN · RN)로 — 예약 열 머리와 셀 꼴을 맞춤(계획에 없던 한 줄)"
metrics:
  duration: 16m
  completed: 2026-11-25
estimate:
  tokens: 180000
actuals:
  tokens: 32000
  tasks: 3
  commits: 3
plan_head_before: 6a3df7375ade2127628897698528e153bae0391e
plan_head_after: b0e578df100506b6a325913b1cacc49085bc669c
---

# Phase quick-261125-c2i Plan 01: 어드민 발사 08:30 G2 칸 Summary

08:30 G2(장개시전 시간외종가 예약 발사)를 어드민 발사 경계 지도 · 주문 내역에 붙였다 — shared `LAUNCH_FIRE_KEYS`/`LAUNCH_PLAN_PROFILES` 한 벌 확장 · `launch_plan_changes` CHECK + `launch_map_for_admin('g0830')`(KRX 08:30:00 정확 일치) · relay/server 가 G2 계획(op 8)을 그 시장 하나로 통과 · 94 에 G2 행 없는 서버는 「이 서버는 08:30 발사를 모름」 · 뒤탐침은 shared 타입 · relay zod · server zod · DB CHECK 네 겹 모두 Q16 | N 그대로.

## 커밋

| 작업 | 해시 | 내용 |
|---|---|---|
| 1 | `c523d2cb` | feat(launch): 08:30 G2 발사 기준 — shared 계약 · 이력 CHECK · 지도 g0830 |
| 2 | `0015444a` | feat(launch): relay · server 08:30 G2 계획 통과 — 뒤탐침은 Q16\|N 유지 |
| 3 | `b0e578df` | feat(webapp): 어드민 발사 08:30 G2 칸 — 세그먼트 · 한 값 편집 · 「모름」 · 뒤탐침 숨김 |

`BASE = 6a3df737` (작업 1 시작 전). `git log 6a3df737..HEAD` = 위 3커밋뿐(옆 세션 커밋 없음).

## 마이그레이션

- 실제 파일 이름: `supabase/migrations/20261125110000_launch_g2_admin.sql` (만들기 직전 최신이 `20261125100000` — 더 늦은 파일 없음 · 플랜 이름 그대로)
- ① `launch_plan_changes_fire_check` DROP(IF EXISTS 없음) → `fire IN ('q16','n0930','g0830')` · COMMENT 갱신
- ② `launch_map_for_admin` 재정의 — `g0830` 분기(KRX `[08:30:00, 08:30:00.000001)`) · RAISE 문구 `q16 | n0930 | g0830` · COMMENT · 권한 3줄 재진술 · NOTIFY pgrst
- 원격 적용 안 함(`supabase db push` 는 메인 세션 몫)

## 검증 결과

### pgTAP (`bash scripts/verify-dma-orders-price-check.sh --test …` · 파일마다 153 마이그레이션 재생)

| 파일 | 결과 |
|---|---|
| `launch_g2_admin.test.sql` (새) | 12/12 PASS |
| `launch_plan_changes.test.sql` | 26/26 PASS |
| `launch_tail_probe_changes.test.sql` | 27/27 PASS |
| `launch_gate.test.sql` | 62/62 PASS |
| `launch_project_g2.test.sql` | 14/14 PASS |

### vitest (`--maxWorkers=2`)

| 패키지 | 범위 | 결과 |
|---|---|---|
| shared | 전체 | 52 파일 · 1484 통과 · 2 skip |
| relay | admin-launch-plan · admin-api · launch-backfill | 3 파일 · 155 통과 |
| server | routes/admin-launch | 1 파일 · 102 통과 |
| webapp | lib/__tests__/launch* · components/admin/__tests__/launch* | 12 파일 · 386 통과 |

### typecheck

| 명령 | 결과 |
|---|---|
| shared `typecheck` | 통과(`@ts-expect-error` 두 줄이 실제로 오류를 잡음 — 쓰이지 않으면 tsc 가 실패) |
| relay `typecheck`(src) | 통과 |
| relay `typecheck:tests` | **미통과 — 기존 오류 2건**: `tests/admin-api.test.ts(1823)` (GET 묶음의 launchPlan 대역에 setTailProbe 없음) · `tests/admin-dispatcher.test.ts(179)`. BASE `6a3df737` 를 임시 worktree 로 꺼내 같은 2건(+ 이번에 고친 1918 · 1957)이 이미 있음을 확인 — 이 작업이 만든 것이 아니고 범위 밖이라 고치지 않았다. 내 새 테스트(W5)가 쓰는 `fakeLaunchPlan` 헬퍼만 타입을 채웠다(아래). |
| server `typecheck` | 통과 |
| webapp `typecheck`(앱 + e2e tsconfig) | 통과 |

### 범위 밖 무변경

`git diff --quiet 6a3df737 -- supabase/migrations/20261107200000_launch_tail_probe_changes.sql supabase/tests/launch_project_g2.test.sql workers/tick-convert relay/src/dma/envelope.ts relay/src/tools/launch-backfill.ts` → exit 0. envelope · backfill 컴파일 수리 필요 없었음.

### 실행하지 않은 것

- **Playwright e2e 미실행**(제약). 발사 기준 세그먼트가 세 칸이 되어 폭이 약 60px 늘었다. 주문 내역 `P35-L3`(390 · `expectSegNextTo(page, 'limitup-date-nav')` — 날짜 알약과 세그먼트 같은 줄 단언)이 390 에서 줄바꿈으로 깨질 수 있다(추정: 날짜 알약 ≈172 + 간격 10 + 세그먼트 ≈210 > 본문 폭). 컨트롤 줄은 `flex-wrap` 이라 화면이 깨지지는 않는다(플랜이 허용한 동작). 메인 세션이 Playwright 1회로 판정 — 깨지면 단언 완화 또는 세그먼트 px 축소를 결정. 지도 탭 390 단언(뷰포트 안)은 영향 없음으로 본다.
- 원격 DB 적용 · relay · server 배포 · push 없음.

## 고친 기존 테스트(이유)

- shared `launch.test.ts` 「LAUNCH_FIRES · LAUNCH_RANGE_DAYS」 — `LAUNCH_FIRES` 전체 `toEqual` 이라 g0830 키가 반드시 들어간다(한 줄 추가).
- shared `launch-plan.test.ts` 「D-34 정식 노트 값」 — `LAUNCH_PLAN_LIMITS` 전체 `toEqual` 이라 g0830 행 추가.
- webapp `launch-orders-tab.test.tsx` 「세그먼트 글자는 짧게」 — 버튼 배열 전체를 고정하던 단언에 08:30 칸 추가(앞 두 칸 그대로).
- relay `admin-api.test.ts` 35-17 묶음 `fakeLaunchPlan` 헬퍼 — `setTailProbe: vi.fn(), tailProbeSettable: false` 를 채움(quick-261107-l7w 뒤 주입 타입 Pick 을 못 채우던 기존 tsc 오류 · 새 W5 가 같은 헬퍼를 써서 같은 오류가 늘어나지 않게). 동작 무변경.

## Deviations from Plan

1. **[Rule 3 - Blocking] e2e 픽스처 컴파일 수리** — `webapp/e2e/fixtures/launch.ts` 의 `launchTailProbeSaveOk` · `saveTailProbe` 옵션 fire 를 `LaunchTailProbeFire` 로(뒤탐침 change 행 fire 가 좁아져 e2e tsconfig 가 실패). 작업 3 커밋에 포함.
2. **[계획 재량 보강] `pieceKeyLabelOf` 가 G2 도 예약 꼴** — 08:30 표 열 머리가 「예약 · 조각 · 라운드」 인데 셀이 「Q… · idx0」 이면 머리와 어긋나 Q16 과 같게 「Q083000001 · j0 · R0」. `launch-format.ts` 한 줄 · 테스트 1건.
3. **TDD 순서** — relay · server 는 테스트 먼저 RED(G2 바디 400 · g0830 400 · 6행 entries) 확인 후 구현. shared 일부(`launch.ts`)와 webapp 은 구현을 먼저 적고 테스트를 뒤에 더했다(webapp 은 typecheck 오류 목록을 체크리스트로 따라감) — 새 단언은 모두 통과하지만 RED 를 따로 관측하지 않았다.
4. **main 브랜치 커밋** — 실행자 프로토콜의 「보호 브랜치 커밋 금지」 가드 대신 오케스트레이터 지시(순차 · 메인 작업 트리 · 이 프로젝트 `branching_strategy: none` · master 작업 관례)를 따랐다. push 없음.

## Known Stubs

없음. (08:30 스위치가 꺼진 동안 모든 서버가 「이 서버는 08:30 발사를 모름」 인 것은 설계 그대로다.)

## 참고 — 손대지 않은 것

- `LAUNCH_PLAN_APPLY_NOTE`(「발사 1초 전(15:59:59 · 09:00:29) 이후에 저장하면 …」) 는 08:30 을 말하지 않는다. G2 의 저장 마감 규칙이 인박스에 없어 문구를 바꾸지 않았다.
- 지도 빈 상태 문구 「첫 적재는 16:00:01」 은 fire 와 무관한 기존 문구 그대로.

## 배포(이 플랜 밖)

메인 세션이 사용자 확인 뒤 DB(`supabase db push --linked --yes`) → relay(deploy-relay) → server(deploy-server.sh) → git push(webapp) 순서로. relay 가 먼저 나가지 않으면 구 relay 가 94 의 G2 행을 버려 모든 08:30 패널이 「모름」 으로 보인다.

## Self-Check: PASSED

- 파일: `supabase/migrations/20261125110000_launch_g2_admin.sql` · `supabase/tests/launch_g2_admin.test.sql` 존재
- 커밋: `c523d2cb` · `0015444a` · `b0e578df` 모두 HEAD 조상

## 오케스트레이터 후속 (8bc8eabf)

- Playwright `admin-launch.spec.ts` 를 `--workers=1` 로 돌려 2건 실패 확인:
  - P35-L3: 세그먼트 세 칸이 390 에서 날짜 알약 옆 한 줄을 넘김(실측 컨트롤 줄 374 · 알약 162 · 세그먼트 210). 버튼 `px-3 → px-2.5` 로 198px — 한 줄 복귀.
  - P35-P5: 11-09 교보 N 공통 칸(cad36b55 · K → Q 두 번 저장) 이후 갱신 안 된 낡은 단언(BASE 에서도 실패). 두 PUT 단언 + 목이 N 두 칸을 함께 바꾸게.
- e2e 픽스처 계획 저장 목의 `fire === 'q16' ? 'Q16' : 'N'` 삼항 → `launchPlanProfileOf`.
- 결과: admin-launch e2e 32/32 · webapp typecheck(앱 + e2e) 0 오류 · 어드민 컴포넌트 vitest 472/472.
