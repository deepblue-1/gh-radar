---
phase: 35-launch-gate
plan: 14
subsystem: ui
tags: [webapp, admin, launch-plan, svg-chart, rtl, playwright, vitest]

requires:
  - phase: 35-launch-gate
    provides: "35-12 shared launch-plan 계약(LaunchPlanResponse · LaunchPlanServer · LaunchPlanChangeRow · launchPlanEntryOf) · 35-13 server GET /api/admin/launch/plan · 35-08 경계 지도 탭(LaunchMapView · LaunchGateChart · mapNextOffsetOf)"
provides:
  - "fetchLaunchPlan() — GET /api/admin/launch/plan · 404 → { kind: 'absent' } · 그 밖 오류 throw"
  - "launch-plan-view.ts — LaunchPlanState · PanelPlan · panelPlanOf · planLineText · fallbackLineText · changeAtText · lastChangeText · changeValuesText · changeOutcomeView · LAUNCH_PLAN_HISTORY_MAX"
  - "LaunchPlanBar — 「다음 발사 계획」 줄 · 마지막 변경 · 「변경 이력 n」 접힘"
  - "LaunchGateChart props planLines(조각마다 점선 · data-idx) · children(머리 아래 슬롯) — 기존 next 대체"
  - "launchAxisOf(values, marks: readonly number[], fire) — 계획 조각 전부 축 후보"
  - "LaunchMapView prop plan(기본 absent) · 지도 탭 진입 1회 계획 조회"
  - "e2e launchPlanFixture() · mockLaunchApi 옵션 plan · planGets() · spec P35-P1 · P35-P2"
affects: [35-15, 35-19]

actuals:
  tokens: 19800
  tasks: 3
  commits: 4
plan_head_before: 8c02a9b7565058bcdcddca9f51863fc78839806f
plan_head_after: 9d0f1de95cac934a51eb4b09455e1de60f10c999

tech-stack:
  added: []
  patterns:
    - "계획 상태 4가지(loading · absent · error · ready)를 패널 모델 한 벌(panelPlanOf)로 접는다 — 차트 · 줄 · KPI 가 같은 lines 를 읽는다"
    - "404 = 배포 전 신호(D-35) — 계획 기능 전체를 숨기고 35-08 화면 그대로"

key-files:
  created:
    - webapp/src/lib/launch-plan-view.ts
    - webapp/src/components/admin/launch-plan-bar.tsx
    - webapp/src/lib/__tests__/launch-plan-view.test.ts
    - webapp/src/components/admin/__tests__/launch-plan-bar.test.tsx
  modified:
    - webapp/src/lib/launch-api.ts
    - webapp/src/lib/launch-map.ts
    - webapp/src/components/admin/launch-gate-chart.tsx
    - webapp/src/components/admin/launch-map-tab.tsx
    - webapp/src/lib/__tests__/launch-map.test.ts
    - webapp/src/components/admin/__tests__/launch-gate-chart.test.tsx
    - webapp/src/components/admin/__tests__/launch-map-tab.test.tsx
    - webapp/e2e/fixtures/launch.ts
    - webapp/e2e/specs/admin-launch.spec.ts

key-decisions:
  - "계획 줄 값 색은 목업 .pstrip b 를 따라 --primary 700(점선과 같은 색). 계획 문구는 --fg 였지만 목업이 정본이다"
  - "범례 문구(ready)는 목업 그대로 — 16:00 「다음 발사 계획(조각마다 점선)」 · 09:00:30 「다음 발사 계획(시각)」"
  - "마지막 변경(launch-plan-last)은 source server 일 때만 보인다 — 대신 값일 땐 지금 서버 값을 모르므로 숨기고, 「변경 이력」 접힘은 이력이 있으면 server · fallback 둘 다 보인다(실패 원인 추적)"
  - "「변경 이력 n」 의 n = 그 조합의 이력 전체 수(server p_limit 20 안), 표는 최근 10행(LAUNCH_PLAN_HISTORY_MAX)"
  - "축 밖 계획 값은 축 밖인 첫 값 하나만 「◂/▸ 다음 …µs」 글로 — 점선 title 은 1개면 「다음 첫 조각 …」, 여럿이면 「다음 발사 계획 n번 …」"
  - "changes 정렬 = at 내림차순 · 같은 at 이면 id 내림차순"

patterns-established:
  - "패널 머리 아래 슬롯 = LaunchGateChart children — 35-15 「계획 고치기」 편집기도 이 슬롯(LaunchPlanBar 안/옆)에 들어간다"

requirements-completed: []

coverage:
  - id: D1
    description: "(D-24 · D-25) 서버 계획 ok → 패널 줄 「3조각 −350 · −345 · −325µs」 · 조각마다 점선 · KPI 첫 조각"
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/launch-map-tab.test.tsx#다음 발사 계획(서버 ok)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin-launch.spec.ts#P35-P1"
        status: pass
    human_judgment: false
  - id: D2
    description: "(D-25 · Pitfall S11) 서버 실패 · 조회 실패 → 머리 값 대신 값 · 「서버 연결 안 됨 · 마지막 발사 값」 · 조회 중 스켈레톤"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/launch-plan-view.test.ts#panelPlanOf · launch-plan-bar.test.tsx"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin-launch.spec.ts#P35-P2 ①"
        status: pass
    human_judgment: false
  - id: D3
    description: "(D-35) /plan 404 → 계획 기능 숨김 · 35-08 그대로"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin-launch.spec.ts#P35-P2 ② · P35-M1~M5"
        status: pass
    human_judgment: false
  - id: D4
    description: "(D-29) 마지막 변경 · 「변경 이력」 접힘 10행 · 결과 알약"
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/launch-plan-bar.test.tsx"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin-launch.spec.ts#P35-P1"
        status: pass
    human_judgment: false
  - id: D5
    description: "(Pitfall S8) launchAxisOf(values, marks, fire) — 계획 조각 전부 core 후보 · 먼 값은 축을 늘리지 않음"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/launch-map.test.ts#launchAxisOf"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-10-28
status: complete
---

# Phase 35 Plan 14: 발사 계획 읽기(지도 패널 줄 · 조각마다 점선 · 대신 값 · 변경 이력) Summary

**지도 탭에 들어오면 `GET /api/admin/launch/plan`을 지도 요청과 병렬로 한 번 부른다. 서버 계획이 ok인 패널에는 조각마다 `--primary` 점선과 「다음 발사 계획 3조각 −350 · −345 · −325µs」 줄이 보이고, 서버나 조회가 실패하면 최신 머리 값 하나로 대신 그린다. 404(배포 전)면 계획 기능을 통째로 숨겨 35-08 화면 그대로다. 로컬 커밋까지만 했고 push하지 않았다(D-35).**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-10-28 00:29 KST
- **Completed:** 2026-10-28 00:39 KST
- **Tasks:** 3 (tracer 1 · TDD 1(RED/GREEN) · auto 1)
- **Files:** 신설 4 · 수정 9

## 상태 표 (패널 하나 기준)

| 계획 상태 | 언제 | 점선(lines) | 줄 | 마지막 변경 | 변경 이력 | KPI 「다음 첫 조각」 | 범례 |
|---|---|---|---|---|---|---|---|
| **server** | ready이고 그 서버가 ok이며 (fire, market) 칸이 있음 | 계획 조각 전부(data-idx 0..n−1) | 「3조각 −350 · −345 · −325µs」 / 09:00:30 「−245µs」 · `--primary` | 있으면 「· 22:41 · 이메일」(오늘이 아니면 「10/27 22:41」) | 이력이 있으면 「변경 이력 n」 접힘 | 첫 조각 | 「다음 발사 계획(조각마다 점선)」 / 「(시각)」 |
| **fallback** | ready인데 서버가 ok가 아님(offline · failed · timeout · skipped) 또는 칸 없음 / error(5xx · 네트워크) | 머리 next_offset_us 1개(null이면 없음) | 「서버 연결 안 됨 · 마지막 발사 값 −337µs」 `data-tone="warn"` | 숨김 | ready일 때만 있을 수 있음(이력이 있으면 접힘) | 머리 값 | ready면 계획 문구, error면 35-08 문구 |
| **loading** | 조회 중 | 머리 값 1개 | 스켈레톤(`aria-busy`) | — | — | 머리 값 | 35-08 문구 |
| **absent** | `/plan` 404(배포 전 · D-35) | 머리 값 1개(35-08 그대로) | **없음**(LaunchPlanBar null) | — | — | 머리 값 | 「다음 발사의 첫 조각」 |

## 바꾼 prop: `LaunchGateChart next` → `planLines`

- 소스 호출부 1곳(`launch-map-tab.tsx` · `planLines={p.plan.lines}` + children `<LaunchPlanBar>`)과 테스트 호출부 8곳(`launch-gate-chart.test.tsx`의 `next={x}` → `planLines={[x]}`, `next={null}` → `planLines={[]}`)을 바꿨다.
- `launchAxisOf(values, next, fire)` → `(values, marks, fire)`: 소스 1곳(차트 · planLines 전체)과 테스트 13곳(`launch-map.test.ts` 12 · `launch-gate-chart.test.tsx` 1)을 바꿨다.

## Task Commits

1. **Task 1 (tracer): fetchLaunchPlan → 패널 줄 · 조각마다 점선** — `5dbf1854`
2. **Task 2: 대신 값 · 조회 중 · 마지막 변경 · 변경 이력 · 축 일반화** — RED `d3480824` · GREEN `ab363ff6`
3. **Task 3: 범례 · 상태별 RTL · E2E P35-P1 · P35-P2** — `9d0f1de9`

push 안 함(D-35). 원격 DB · Cloud Run · relay · Vercel 배포도 하지 않았다.

## 검증 결과

| 명령 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/shared build` | 통과 |
| Task 1: `vitest run launch-map-tab.test.tsx launch-gate-chart.test.tsx --maxWorkers=2` | 2 files · 31 passed |
| Task 2 RED: `vitest run launch-plan-view · launch-map · launch-plan-bar · launch-gate-chart` | 11 failed · 75 passed(미구현 함수 · 바 상태), 이어 축 강화 케이스 1 failed |
| Task 2 GREEN: 같은 4파일 | 4 files · 87 passed |
| Task 3: `vitest run launch-map-tab.test.tsx --maxWorkers=2` | 20 passed |
| `playwright test e2e/specs/admin-launch.spec.ts --workers=1` | **15 passed**(setup 1 · L1~L6 · M1~M5 · P35-P1 · P35-P2 ① ②) · failed 0 · flaky 0 |
| `pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2` (전체 회귀) | 188 files · 4855 passed · 1 skipped · failed 0 |
| `tsc --noEmit`(webapp) | 통과 |
| `tsc -p tsconfig.e2e.json` | webapp 오류 0. relay 2줄은 남의 미커밋 `relay/src/generated/**` 때문이다(아래 Deferred) |

tracer 게이트는 Task 1 커밋 뒤 `<verify>`를 다시 돌려 통과한 다음 Task 2로 넘어갔다(대화형 · end-of-phase · 자동 검증만).

## TDD Gate Compliance

Task 2(`tdd="true"`): RED 커밋 `test(35-14) … (RED)` `d3480824`가 GREEN 커밋 `feat(35-14) … (GREEN)` `ab363ff6`보다 먼저 있다. RED는 실패를 확인한 뒤 커밋했다. 처음 실행에서는 launch-plan-view 6건과 launch-plan-bar 5건이 실패했다. launch-map 축 케이스는 옛 구현에서도 우연히 통과했는데, JS가 `[-337] - m`을 숫자로 강제 변환하기 때문이다. 그래서 「첫 mark가 아닌 조각도 축을 넓힌다(marks [−340, −345, −300])」 케이스를 더해 실패를 확인한 뒤 커밋했다.

## Decisions Made

frontmatter `key-decisions`를 참조. **35-15가 따라야 할 인터페이스:**

- **상태 소유:** 계획 상태는 `LaunchMapTab` 안의 `useState<LaunchPlanState>`이고, 탭 진입 effect에서 한 번만 부른다(의존성 `[]`). PUT 저장 뒤에는 응답의 `plan`(재조회 값)으로 `ready.resp.servers[gateway]`를 바꾸고, `change !== null`일 때만 `resp.changes` 앞에 붙인다. `change === null`이면 이력을 낙관적으로 갱신하지 않는다. 다시 GET하지 않는다.
- **패널 모델:** `panelPlanOf(state, heads, gateway, market, fire)`가 정본이다. 편집기의 「지금 값」은 `plan.entry?.offsets_us`(server)이고, 「계획 고치기」 비활성은 `plan.source !== 'server'`로 판단한다. `source`가 server가 아니면 서버 status가 ok가 아니다(35-13 계약 `status !== "ok"`와 같다). 미리보기 점선은 `planLines`에 그대로 넘기면 축이 조각 전부를 담는다.
- **슬롯:** `LaunchGateChart`의 `children` = 패널 머리 아래이고, 지금은 `<LaunchPlanBar fire plan />` 하나다. 목업 `.pstrip`의 `<span class="sp">` + 「계획 고치기」 버튼은 LaunchPlanBar 첫 줄(flex-wrap) 끝에 붙이면 된다. LaunchPlanBar의 첫 줄 div가 그 자리다.
- **data-slot:** `launch-plan-bar`(data-source) · `launch-plan-line`(fallback은 data-tone warn) · `launch-plan-last` · `launch-plan-history-fold`(details) · `launch-plan-history`(table) · `launch-plan-outcome`(data-tone · title) · `launch-next[data-idx]`.
- **e2e:** `mockLaunchApi(page, { plan })`. plan이 없으면 GET `/plan`은 404다. PUT `/plan/...`은 아직 목이 없어 404이고, 35-15가 `MockLaunchApiOptions`에 `planPut`(등)을 더한다. `planGets()`는 GET만 센다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 계획 behavior의 lastChangeText 「같은 날」 예시가 KST로 다른 날이었다**
- **Found during:** Task 2 GREEN
- **Issue:** behavior에는 「row at 2026-10-27T13:41Z · now 2026-10-27T15:00Z → 「22:41 · a@b.c」」라고 적혀 있다. 그런데 15:00Z는 KST 10/28 00:00이라, 같은 문서의 규칙(Asia/Seoul 날짜가 같으면 시각만)대로 하면 「10/27 22:41」이 나온다.
- **Fix:** 규칙을 정본으로 삼았다. 같은 날 예시는 14:50Z(KST 23:50)로 바꾸고, 15:00Z는 다른 날 케이스로 함께 고정했다. KST 자정을 넘기는 경계 케이스도 하나 더했다.
- **Files modified:** webapp/src/lib/__tests__/launch-plan-view.test.ts
- **Commit:** ab363ff6

**2. [목업 정본] 줄 값 색 · 09:00:30 범례 문구**
- 계획에는 「값 `--fg`」, 범례 ready는 「다음 발사 계획(조각마다 점선)」 하나로 적혀 있었다. 채택 목업(`.pstrip b { color: var(--primary) }` · 범례 `isQ ? '조각마다 점선' : '시각'`)이 화면 정본이라 목업을 따랐다.

**3. [범위 소폭 확장] 테스트 추가**
- 계획에 적힌 케이스 말고도 차트 children 슬롯 1건, 지도 탭 ready 범례와 loading 각 1건, 바의 「fallback에도 이력 접힘」 1건을 더했다.

## Issues Encountered

- `webapp typecheck`의 e2e tsconfig 단계가 `relay/tests/helpers/frames.ts` 2줄(TS2554)로 실패한다. 다른 세션이 메인 트리에 미커밋으로 둔 `relay/src/generated/**`(StockDMA.fbs 갱신) 때문이고 이 플랜과 무관하다. 그 파일은 건드리지 않았고(규칙) `deferred-items.md`에 적었다. webapp 파일 오류는 0이다.
- 시각 확인: P35-P1 1280 스크린샷에서 줄 · 점선 · 축이 겹치거나 잘린 곳은 없었다. 390 폭은 기존 M3(가로 넘침 0)가 통과했다. 줄은 flex-wrap이고 이력 표는 자기 래퍼 안에서만 가로 스크롤한다.

## Known Stubs

None. 계획 줄과 점선 값은 서버 계획(GET /plan) 또는 최신 머리 값에서만 온다. e2e 계획 값은 합성 픽스처라고 머리 주석에 밝혔다.

## Next Phase Readiness

- 35-15(편집 · 미리보기 · 저장)는 이 플랜의 `LaunchPlanState` · `panelPlanOf` · `LaunchPlanBar` 슬롯 · `/plan` 목 · P35-P1 위에 바로 선다.
- 배포는 노트 뒤(D-35)다. 이 커밋이 다른 세션의 push로 먼저 나가더라도, server가 `/plan`을 모르면(404) 화면은 35-08 그대로다.

## Self-Check: PASSED

- FOUND: webapp/src/lib/launch-plan-view.ts · webapp/src/components/admin/launch-plan-bar.tsx · webapp/src/lib/__tests__/launch-plan-view.test.ts · webapp/src/components/admin/__tests__/launch-plan-bar.test.tsx
- FOUND commits: 5dbf1854 · d3480824 · ab363ff6 · 9d0f1de9
