---
phase: 35-launch-gate
plan: 03
subsystem: shared · relay tools · scripts
tags: [launch-gate, shared, backfill, tdd, supabase-rpc]
status: complete

requires:
  - phase: 35-launch-gate
    provides: "35-02 열 계약(launch_pieces · launch_heads 열 이름) · launch_backfill_apply · launch_map_for_admin 시그니처(같은 wave — 계약 문서로 맞춤)"
provides:
  - "shared launch.ts — 조각·머리 행 타입 · LAUNCH_ORDER · LAUNCH_FIRES · LAUNCH_RANGE_DAYS · launchDaysOf · launchHeadOf · launchPanelStatsOf · launchRibbonAt · launchFireBaseOf · launchFireOf · isLaunchAccept/Reject"
  - "D-10 정답지 — 첨부 pieces.json 196행 픽스처 + 4패널 날짜별 33행 · 패널 집계 · 리본 표본 핀 테스트"
  - "relay/src/tools/launch-backfill.ts — 첨부 JSON · gh-trade ndjson 파싱 · 계획(머리 = launchHeadOf) · launch_backfill_apply 500행 청크 · --status · --reproject"
  - "scripts/launch-backfill.ts CLI + 비출력 래퍼 scripts/launch-backfill.sh"
affects: [35-05, 35-06, 35-07, 35-08, 35-09, 35-10, 35-11]

actuals:
  tokens: 28000
  tasks: 3
  commits: 5
plan_head_before: 5f706d1731570265298e410c311f7cc61954daa9
plan_head_after: e9acfdc75860691b2c0495c2b3bb2566405ed531

tech-stack:
  added: []
  patterns:
    - "경계 계산 한 벌(shared) — 웹 지도와 백필 머리 계산이 같은 launchDaysOf/launchHeadOf · SQL 두 번째 구현 없음"
    - "백필 쓰기는 RPC(launch_backfill_apply)뿐 — 조건부 upsert 규칙은 DB 한 곳"

key-files:
  created:
    - packages/shared/src/launch.ts
    - packages/shared/src/__tests__/launch.test.ts
    - packages/shared/src/__fixtures__/launch-pieces-1012-1026.json
    - relay/src/tools/launch-backfill.ts
    - relay/tests/launch-backfill.test.ts
    - scripts/launch-backfill.ts
    - scripts/launch-backfill.sh
  modified:
    - packages/shared/src/index.ts

key-decisions:
  - "LaunchHeadInput(백필 머리 입력) 타입을 shared 에 추가 — LaunchPieceInput 과 같은 규칙(원문 추적 열 제외 · trade_date YYYY-MM-DD)"
  - "백필 머리의 retries · abandoned · fire_at_us · 학습 열 · next_offset_us 는 null — launchHeadOf 9값만 채움(D-08 · 셀 수 있는 값만)"
  - "ndjson market 은 K · Q(코스피 · 코스닥 별칭 허용) 밖이면 줄 거부 — 지도에 안 보이는 패널로 조용히 쌓이지 않게 사유와 함께 보고"
  - "RPC 오류 출력은 code 만, 우리 RAISE(launch_ 로 시작)만 메시지 — 행 값(계좌 등) 누출 방지"

requirements-completed: []

coverage:
  - id: D1
    description: "shared 경계 계산이 첨부 group() 출력(4패널 33행 · 패널 집계 · 리본 표본)과 같다"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/launch.test.ts"
        status: pass
  - id: D2
    description: "백필 도구 — 첨부 196 → 머리 33 → RPC 2회 · ndjson 4줄/거부 2 · 청크 3+1 · status · reproject dry/apply"
    verification:
      - kind: unit
        ref: "relay/tests/launch-backfill.test.ts"
        status: pass
  - id: D3
    description: "CLI dry-run 이 env 없이 합계 줄을 찍는다"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/relay exec tsx ../scripts/launch-backfill.ts --file ../docs/inbox/from-gh-trade/261027-launch-gate-admin-attach/pieces.json"
        status: pass

duration: 10min
completed: 2026-10-27
---

# Phase 35 Plan 03: 발사 경계 계산 한 벌 + 백필 경로 Summary

**첨부 `group()` 을 shared 순수 함수로 옮겨 첨부 196행 정답지(4패널 33행 · 집계 · 리본)로 핀을 박았고, 같은 함수로 머리를 계산하는 relay 백필 도구와 CLI(dry-run · --apply · --status · --reproject)를 만들었다.**

## Performance

- Duration: 약 10분 (2026-10-27T11:40Z → 11:50Z)
- Tasks: 3/3
- Files: 신규 7 · 수정 1

## shared export 목록 (`@gh-radar/shared`)

- 타입: `LaunchFire` · `LaunchRange` · `LaunchMarket` · `LaunchPieceRow` · `LaunchHeadRow` · `LaunchMapPiece` · `LaunchOrdersResponse` · `LaunchMapResponse` · `LaunchPieceInput` · `LaunchHeadInput` · `LaunchCalcPiece` · `LaunchDayKind` · `LaunchDay<P>` · `LaunchHeadCalc` · `LaunchPanelStats` · `LaunchRibbonCell`
- 상수: `LAUNCH_RANGE_DAYS` · `LAUNCH_FIRES` · `LAUNCH_ORDER`
- 함수: `isLaunchAccept` · `isLaunchReject` · `launchDaysOf` · `launchHeadOf` · `launchPanelStatsOf` · `launchRibbonAt` · `launchFireBaseOf` · `launchFireOf`

## CLI 사용법

```
bash scripts/launch-backfill.sh --file <pieces.json|.ndjson>                         # dry-run(기본 · 쓰지 않음)
bash scripts/launch-backfill.sh --file <경로> [--date YYYYMMDD …] --apply            # launch_backfill_apply 적재
bash scripts/launch-backfill.sh --status                                             # 원격 날짜 · 조각 · 머리 수(읽기 전용)
bash scripts/launch-backfill.sh --reproject [--from YYYYMMDD] [--to YYYYMMDD] [--apply]   # kind 17·18 재해석
```
실행 전 `pnpm --filter @gh-radar/shared build`(tsx 가 shared dist 를 읽는다). 원격 실행은 메인 세션 몫(35-09 · 35-11).

## dry-run 합계 줄 원문

```
합계: 조각 196 · 머리 33 · 날짜 11 · 중복 0 · 거부 0
```

## Task Commits

1. Task 1 (tracer) shared — `d2ddaaf6` feat(35-03): shared 발사 경계 계산(group 이식) · 백필 머리 계산 (트레이서 shared)
2. Task 1 (tracer) relay · CLI — `c1dc50af` feat(35-03): 발사 백필 도구 · CLI dry-run (트레이서 relay)
3. Task 2 RED — `dd94e88b` test(35-03): 발사 경계 정답지 4패널 · 리본 · 발사 기준 (RED)
4. Task 2 GREEN — `d3517c5e` feat(35-03): 패널 집계 · 리본 · 발사 기준 함수 (GREEN)
5. Task 3 — `e9acfdc7` feat(35-03): 발사 백필 ndjson 입력 · --status · --reproject · 비출력 래퍼

Tracer 게이트: Task 1 verify(shared · relay · CLI 합계 줄)를 끝까지 다시 돌려 통과한 뒤 확장했다.

## TDD Gate Compliance (Task 2)

- RED: `launch.test.ts` 에 4패널 날짜별 33행 · 패널 집계 · 리본 표본 · 515/모르는 결과 · 발사 기준 · isMarketStrategyEvent(17/18) 단언 추가. 실행 `vitest --reporter=tap-flat` exit 1 · 28 중 12 실패. `gsd_run check tdd-red-evidence` → `RED_EVIDENCE_OK`(target `launchPanelStatsOf — 4패널 집계 > KB120|Q`). semanticAssessment: 실패 12건 전부 아직 export 되지 않은 `launchPanelStatsOf` · `launchRibbonAt` · `launchFireBaseOf` · `launchFireOf` 호출의 TypeError(계획한 이유) — 구문 · 로드 · 픽스처 오류 없음. 통과 16건은 Task 1 에서 이미 구현된 launchDaysOf · launchHeadOf 의 핀(정답지 33행 등)이다.
- GREEN: 네 함수 추가 → 28/28 통과 (`d3517c5e`).
- REFACTOR: 필요 없음.

## Deviations from Plan

None — 계획대로. 다만 아래 보완:
- `LaunchHeadInput` 타입을 shared 에 추가(계획의 형 계약에는 없지만 백필 머리 입력 모양을 relay 와 공유하려고).
- `applyLaunchBackfill` 반환에 `calls`(RPC 호출 수) 포함 · RPC 오류 문구는 code 만(우리 RAISE 만 메시지).

## Deferred Issues

- `pnpm --filter @gh-radar/relay run typecheck:tests` 가 **이 플랜과 무관한 기존 오류 1건**으로 exit 2: `relay/tests/helpers/frames.ts(490,30): TS2554 Expected 8 arguments, but got 7` — 기준 커밋 `b7b25391`(StockDMA 스키마 동기화 · budget_krw 추가)로 `AccountState.createAccountState` 인자가 늘어난 탓. 이 플랜 파일에는 tsc 오류 0(오류 목록이 이 1줄뿐). 범위 밖이라 고치지 않았다 — Phase 36(account-budget) 쪽에서 헬퍼를 갱신해야 한다. 병렬 worktree 충돌을 피하려고 `deferred-items.md` · `WINDOWS.md` 대신 여기에 적는다.

## 금지 사항 확인

- relay 런타임 경로(journal · ws · dma · registry · index.ts · generated) 변경 0 — `git diff --stat 5f706d17 HEAD` 의 relay 경로는 `relay/src/tools/launch-backfill.ts` · `relay/tests/launch-backfill.test.ts` 뿐.
- 표 직접 upsert 없음 — 쓰기는 `sb.rpc('launch_backfill_apply')` · `sb.rpc('launch_reproject')` 뿐(`--apply` 때만).
- `--apply` · `--status` · `--reproject` 원격 실행 0 · env 파일 읽기/출력 0 — dry-run · `--help` · env 비운 상태의 오류 경로 · 단위 테스트까지만.

## Known Stubs

없음.

## Self-Check: PASSED

- 파일 8개 존재 · 커밋 5개(d2ddaaf6 · c1dc50af · dd94e88b · d3517c5e · e9acfdc7) HEAD 조상 확인.
