---
phase: 35-launch-gate
plan: 15
subsystem: ui
tags: [webapp, admin, launch-plan, editor, svg-chart, rtl, playwright, vitest]

requires:
  - phase: 35-launch-gate
    provides: "35-12 shared validateLaunchPlanDraft · LAUNCH_PLAN_LIMITS · launchPlanVerdictRows · LaunchPlanSaveResponse · 35-13 server PUT /api/admin/launch/plan/:gateway/:fire/:market · 35-14 LaunchPlanState · panelPlanOf · LaunchPlanBar · planLines"
provides:
  - "saveLaunchPlan(gateway, fire, market, offsets) — PUT · RELAY_TIMEOUT_MS · 합치기 없음"
  - "launch-plan-view: LaunchPlanEdit · planEditOf · planEditWithDraft · sameOffsets · planStateWithSave · saveResultViewOf · verdictCellText · LAUNCH_PLAN_APPLY_NOTE"
  - "LaunchPlanEditor — 스테퍼 · 조각 칸 · 검증 표시 · 되돌리기 · 저장 · 결과 칩/줄 · P2 표"
  - "LaunchPlanBar props editing · onToggle · children(「계획 고치기/닫기」 launch-plan-edit-toggle)"
  - "LaunchGateChart prop draftLines(바꿀 계획 실선 · 번호)"
  - "LaunchMapView props editing · onEdit · onDraft · onSave · saving · lastSave"
  - "e2e mockLaunchApi 옵션 savePlan · launchPlanSaveOk · planPuts() · spec P35-P3 ~ P35-P6"
affects: [35-16, 35-17, 35-18, 35-19]

actuals:
  tokens: 22500
  tasks: 3
  commits: 4
plan_head_before: 3d73dd15b320887b8bf2c221946cd7b1533b0b10
plan_head_after: 258a059d9ee686f3d68a0cb0ca6694f2daf22514

tech-stack:
  added: []
  patterns:
    - "편집 상태는 지도 탭 한 곳(LaunchPlanEdit) — draft = 입력 원문 문자열 · valid = 마지막 유효 값(S9). 미리보기 선 · 표는 valid 만 읽는다"
    - "저장 결과 · 저장 중은 칸 키(gateway|market|fire)로 묶는다 — 응답 전에 다른 패널을 열어도 엉뚱한 칸에 결과가 뜨지 않는다"
    - "저장 응답 → planStateWithSave 순수 함수로 계획 상태만 갱신(Pitfall S6 · 재조회 없음)"

key-files:
  created:
    - webapp/src/components/admin/launch-plan-editor.tsx
    - webapp/src/components/admin/__tests__/launch-plan-editor.test.tsx
  modified:
    - webapp/src/lib/launch-api.ts
    - webapp/src/lib/launch-plan-view.ts
    - webapp/src/components/admin/launch-plan-bar.tsx
    - webapp/src/components/admin/launch-gate-chart.tsx
    - webapp/src/components/admin/launch-map-tab.tsx
    - webapp/src/lib/__tests__/launch-plan-view.test.ts
    - webapp/src/components/admin/__tests__/launch-gate-chart.test.tsx
    - webapp/e2e/fixtures/launch.ts
    - webapp/e2e/specs/admin-launch.spec.ts

key-decisions:
  - "편집 칸 자리 = LaunchPlanBar 첫 줄 바로 아래(「변경 이력」 접힘 위) — 목업 .pstrip → .ecard 인접"
  - "「계획 고치기」 는 source server 이고 entry 가 있을 때만 켜진다. 대신 값 · 조회 중이면 disabled + title 「서버 계획을 읽지 못해 고칠 수 없어요」"
  - "세그먼트 전환은 onFire 래퍼로 편집을 닫고, 편집의 fire 가 지금 fire 와 다르면 닫힌 것으로 본다(URL 뒤로 가기 대비 · effect 없음)"
  - "입력이 바뀌면 결과 줄을 지운다(account-editor 결) · ok 저장 뒤엔 draft 를 응답 plan 값으로 바꿔 저장 · 되돌리기가 비활성이 된다"
  - "실패여도 응답 plan(relay 재조회 값)이 있으면 그 서버 계획을 바꾸고, change 가 있으면(실패 시도 포함) 이력 맨 앞에 넣는다"
  - "결과 문형 빈 message 대체: failed → 「실패」 · code 1 → 「서버 미지원」 단독 · skipped → 「꺼진 서버」(35-14 이력 알약과 같은 낱말)"
  - "offline 칩 title 에는 서버 message 원문을 싣고, 줄은 계획 원문대로 「미반영: 서버 연결 안 됨」 고정"
  - "바꿀 실선 굵기 2 · 번호 위치 = 행 아래(리본 캡션 위) — 목업 draftFor() 가 정본(계획 action 의 1.5 · 「리본 아래」 대신). 번호에 --card 테두리(paint-order)로 격자 · 캡션 위에서 읽히게"
  - "축 밖 바꿀 값이 계획 글(launch-next-off)과 같은 쪽이면 그 글 뒤 tspan 으로 이어 붙인다(겹침 방지) · 다른 쪽이면 따로"
  - "조각 칸 폭 104px — 계획의 ~88px 로는 −3000(5글자)이 잘렸다(390 실측 48px < 49px)"

patterns-established:
  - "편집기 컴포넌트는 상태를 쥐지 않는다(draft · onDraft · result 주입) — RTL 은 작은 Harness 가 useState 로 감싼다"

requirements-completed: []

coverage:
  - id: D1
    description: "(D-24 · D-25) 「계획 고치기/닫기」 · 한 번에 한 패널 · 세그먼트 바꾸면 닫힘 · 대신 값/조회 중 비활성"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin-launch.spec.ts#P35-P3 · P35-P6"
        status: pass
    human_judgment: false
  - id: D2
    description: "(D-26) 스테퍼 1~10(+ 는 마지막 값 복사) · 칸 µs 입력 원문 · 09:00:30 한 칸 · 되돌리기"
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/launch-plan-editor.test.tsx#16:00 스테퍼 · 09:00:30 한 칸 · 되돌리기"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin-launch.spec.ts#P35-P5 · P35-P6"
        status: pass
    human_judgment: false
  - id: D3
    description: "(D-26 · D-34) 위반 칸만 aria-invalid · role=alert 원문 · 저장 비활성 · 입력값 유지 · 변경 없음 비활성"
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/launch-plan-editor.test.tsx#검증 표시"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin-launch.spec.ts#P35-P4 ① · P35-P5"
        status: pass
    human_judgment: false
  - id: D4
    description: "(D-28 · S9) 바꿀 실선 · 번호 · 범례 · P2 표(지난 N일에 쐈다면) · 오류 동안 마지막 유효 값"
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/launch-gate-chart.test.tsx#바꿀 계획 draftLines · launch-plan-editor.test.tsx#미리보기 P2"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin-launch.spec.ts#P35-P4 ① · P35-P5"
        status: pass
    human_judgment: false
  - id: D5
    description: "(D-27) 결과 문형 6갈래(outcome · code 로만) · 칩 · 줄"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/launch-plan-view.test.ts#편집 · 저장(35-15)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin-launch.spec.ts#P35-P3 · P35-P4 ② ③ · P35-P5"
        status: pass
    human_judgment: false
  - id: D6
    description: "(D-27 · S6) 저장 뒤 응답 plan 으로 줄 · 점선 · 이력 갱신 · 지도/계획 재요청 0 · 공용 적용 안내"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin-launch.spec.ts#P35-P3 · P35-P4"
        status: pass
    human_judgment: false

duration: 21min
completed: 2026-10-28
status: complete
---

# Phase 35 Plan 15: 발사 계획 고치기(편집 칸 A · 미리보기 P2 · 저장 · 결과) Summary

**패널 「다음 발사 계획」 줄 끝의 「계획 고치기」를 누르면 그 패널 안에 편집 칸이 열린다. 16:00은 조각 수 스테퍼와 칸마다 µs, 09:00:30은 발사 시각 한 칸이다. 검증은 shared `validateLaunchPlanDraft` 한 벌이다. 고치는 동안 같은 패널에 `--launch-gate` 실선(번호 = 조각)과 「지난 N일에 쐈다면」 P2 표가 겹친다. 「저장」은 PUT 1건이고, 응답의 plan과 change로 줄 · 점선 · 이력을 그 자리에서 바꾼다. 로컬 커밋까지만 했고 push하지 않았다(D-35).**

## Performance

- **Duration:** 약 21분
- **Started:** 2026-10-28 00:43 KST
- **Completed:** 2026-10-28 01:04 KST
- **Tasks:** 3 (tracer 1 · TDD 1(RED/GREEN) · auto 1)
- **Files:** 신설 2 · 수정 9

## 편집 상태 모양

`LaunchMapTab`이 갖는 상태 세 개:

| 상태 | 모양 | 규칙 |
|---|---|---|
| `edit` | `LaunchPlanEdit { gateway, market, fire, draft: string[], valid: number[] } \| null` | 한 번에 한 패널. `draft` = 입력 원문, `valid` = 마지막 유효 값(검증 ok일 때만 갱신 · S9). `edit.fire !== fire`면 닫힌 것으로 본다 |
| `saving` | 칸 키 `"KB120\|Q\|q16"` \| null | 저장 중인 칸만 「저장 중…」. 한 번에 저장 1건 |
| `lastSave` | `{ key, save: { result: AdminServerResult, at: Date } } \| null` | 그 칸 편집이 열려 있을 때만 보인다. 입력 변경 · 열기 · 닫기 · 세그먼트 전환 때 지운다 |

- **저장:** `saveLaunchPlan(gateway, fire, market, edit.valid)` → `planStateWithSave(state, gateway, resp)`가 plan이 있으면 그 서버를 바꾸고, change가 있으면 이력 맨 앞에 넣는다. ok이고 응답 plan에 그 칸이 있으면 `edit`을 그 값으로 다시 채운다(변경 없음 → 저장 비활성). throw하면 `{ server: gateway, outcome: 'offline' }`가 된다. GET `/map`과 `/plan`은 다시 부르지 않는다.
- **차트:** 편집 중인 패널만 `draftLines = edit.valid`를 받는다(서버 값과 다를 때만). 범례 「바꿀 계획(저장 전 · 번호 = 조각)」은 편집 중일 때만 보이고, 공용 적용 안내 `launch-apply-note`는 계획이 ready일 때만 보인다.

## 결과 문형 표 (`saveResultViewOf` · 분기 = outcome · code)

| outcome | 칩(ReflectChip) | 칩 title | 결과 줄 |
|---|---|---|---|
| ok | 「KB120」 ok | — | 「저장됨 · 22:41 · 다음 16:00 발사부터」 / 「… 다음 09:00:30 발사부터」 (HH:MM = 저장 시각 KST) |
| failed · code 1 | 「KB120 · 실패」 err | 「서버 미지원 · <message>」 | 「KB120 실패: 서버 미지원 · <message> — 서버 업데이트 뒤 다시 저장」 |
| failed(그 밖) | 「KB120 · 실패」 err | message | 「KB120 실패: <message · 없으면 실패>」 |
| timeout | 「KB120 · 응답 없음」 err | — | 「KB120 실패: 응답 없음」 |
| offline · 요청 실패 | 「KB120 · 서버 연결 안 됨」 warn | message(있으면) | 「KB120 미반영: 서버 연결 안 됨」 |
| skipped | 「KB120 · 미반영」 warn | message | 「KB120 미반영: <message · 없으면 꺼진 서버>」 |

줄의 role: ok는 `status`, 그 밖은 `alert`.

## E2E (admin-launch.spec.ts · 「어드민 발사 · 발사 계획(고치기)」)

| ID | 폭 | 내용 |
|---|---|---|
| P35-P3 | 1280 | KB 코스닥 「계획 고치기」 → 2번 −340 → 저장 → PUT 1건 `/plan/KB120/q16/Q` 바디 `{ offsets_us: [-350,-340,-325] }` → 칩 「KB120」 · 「저장됨 · HH:MM · 다음 16:00 발사부터」 → 줄 「3조각 −350 · −340 · −325µs」 · 점선 2번 title · 「변경 이력 3」 · 저장 비활성 · maps/planGets 재요청 0 |
| P35-P4 | 1280 | 적용 안내 원문 · 범례 「바꿀 계획」(편집 중만) · ① −340 → 실선 3 → −360: alert 순서 문구 · aria-invalid · 저장 비활성 · 실선과 P2 표가 −340 그대로 ② savePlan failed code 1 → 칩 · title · 줄 · 입력 유지 · 서버 줄 그대로 · 이력 3 ③ 502 → 「KB120 미반영: 서버 연결 안 됨」 · PUT 2건 |
| P35-P5 | 1280 | `fire=n0930` KYOBO119 코스피 — 칸 1 · 스테퍼 없음 · 2500 → 범위 문구 → −190 → P2 1행(−200 / −190 · 지난 1일) → 저장 → 바디 `[-190]` · 「다음 09:00:30 발사부터」 · 줄 「−190µs」 |
| P35-P6 | 390 | 편집 칸 + 조각 7개 → 문서 · main 가로 넘침 0 · 칸이 편집 칸 폭 안에서 여러 줄 · −3000 글자 폭 ≤ 칸 폭 · P2 래퍼만 가로 스크롤 · 다른 패널을 열면 앞 편집이 닫힘 · 09:00:30 세그먼트로 바꾸면 편집이 닫힘 |

## Task Commits

1. **Task 1 (tracer): 저장 한 경로** — `5f71463a`
2. **Task 2: 편집 칸 완성 · 결과 문형** — RED `25a669a3` · GREEN `d0762ab6`
3. **Task 3: P2 · 바꿀 실선 · 적용 안내 · E2E P35-P4~P6** — `258a059d`

push 안 함(D-35). 원격 DB · Cloud Run · relay · Vercel 배포도 하지 않았다.

## 검증 결과

| 명령 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/shared build` | 통과 |
| Task 1: `playwright test admin-launch.spec.ts --workers=1 -g "P35-P3"` | 2 passed(setup + P3) |
| Task 2 RED: `vitest run launch-plan-view.test.ts launch-plan-editor.test.tsx` | 11 failed · 22 passed(미구현 분기 · 스테퍼 · alert · 되돌리기 · 09:00:30) |
| Task 2 GREEN: 같은 2파일 | 33 passed |
| Task 3: `vitest run launch-gate-chart.test.tsx` | 21 passed(바꿀 계획 4건 추가) |
| `pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2` (전체 회귀) | **189 files · 4881 passed · 1 skipped · failed 0** |
| `playwright test admin-launch.spec.ts sidebar-tree.spec.ts --workers=1` (회귀 게이트) | **30 passed · failed 0**(P35-P1~P6 · M1~M5 · L1~L6 · sidebar-tree 12 · setup) |
| `tsc --noEmit`(webapp) · eslint(바꾼 파일) | 통과 · 경고 0 |
| `tsc -p tsconfig.e2e.json` | webapp 오류 0. relay 2줄(`relay/tests/helpers/frames.ts` 490 · 1618 TS2554)은 남의 미커밋 `relay/src/generated/**` 때문이다(deferred-items.md에 이미 기록됨) |

회귀 게이트는 세 번째 실행에서 통과했다. 앞의 두 번은 이렇게 실패했다.

- **1회차:** 도중에 dev 서버가 내려가 8건이 `ERR_CONNECTION_REFUSED`로 실패했다. 다시 띄워 재실행했다.
- **2회차:** 2건이 실패했다. 하나는 P35-P6의 −3000 잘림으로, 내 버그였다. 아래 Deviations 3에서 고쳤다. 다른 하나는 sidebar-tree 1b(VI 줄 · 로컬 relay)다. 이 테스트는 단독 실행과 sidebar-tree 전체 실행(12 passed)에서 모두 통과했다. 두 spec을 이어 돌릴 때 `/trading` 첫 컴파일 시간이 15초 대기를 넘긴 것으로 보이고, 이 플랜이 건드린 파일과는 무관하다.

tracer 게이트: Task 1 커밋 뒤 `<verify>`(P35-P3)를 다시 돌려 통과한 다음 Task 2로 넘어갔다(대화형 · end-of-phase · 자동 검증만).

## TDD Gate Compliance

Task 2(`tdd="true"`): RED 커밋 `test(35-15) … (RED)` `25a669a3`이 GREEN 커밋 `feat(35-15) … (GREEN)` `d0762ab6`보다 먼저 있다. RED는 11건 실패를 확인한 뒤 커밋했다. Task 1의 `saveResultViewOf`는 ok 분기와 단순 실패 문구만 있어서, code 1 · timeout · offline · skipped 문형이 실패했다. 편집 칸에는 스테퍼 · alert · 되돌리기 · 발사 시각 라벨이 없어서 그 테스트들도 실패했다. RED 테스트 가운데 `planEditWithDraft` · `planStateWithSave`는 Task 1에서 이미 구현돼 있어 RED 단계에서도 통과했다(계약 고정용).

## Deviations from Plan

### Auto-fixed Issues

**1. [목업 정본] 바꿀 실선 굵기 · 번호 위치**
- 계획 action은 「strokeWidth 1.5 · 리본 아래 번호」였다. 채택 목업 `draftFor()`는 굵기 2이고 번호를 행 아래(`T + days·RH + 14`)에 둔다. 리본 아래에는 x 눈금 글이 있어 겹친다. 목업을 따랐고, 번호에 `--card` 테두리(paint-order stroke)를 줘 리본 캡션 위에서도 읽히게 했다.
- **Commit:** 258a059d

**2. [Rule 2 - 정합] 저장 결과 · 저장 중을 칸 키로 묶음**
- **Issue:** 결과를 전역 하나로 두면, 응답이 오기 전에 다른 패널을 열었을 때 그 패널 편집 칸에 앞 칸의 결과가 뜬다.
- **Fix:** `lastSave` · `saving`에 `gateway|market|fire` 키를 붙이고, 열린 칸 키와 같을 때만 넘긴다.
- **Files modified:** webapp/src/components/admin/launch-map-tab.tsx
- **Commit:** 5f71463a

**3. [Rule 1 - 시각 결함] 조각 칸 폭 88px → 104px**
- **Issue:** 계획의 「칸 고정폭 ~88px」(그리고 처음 바꾼 100px)로는 범위 끝값 −3000(5글자)이 입력 안에서 잘렸다. P35-P6의 글자 폭 실측에서 49px > 48px로 드러났다.
- **Fix:** 104px로 넓히고, P35-P6에 「−3000 글자 폭 ≤ 칸 폭」 단언을 더했다. input의 scrollWidth는 캐럿 자리 1px 때문에 늘 넘쳐서, canvas measureText로 잰다.
- **Commit:** 258a059d

**4. [Rule 2 - 겹침 방지] 축 밖 바꿀 값 글**
- 계획 값(`launch-next-off`)과 바꿀 값이 같은 쪽 축 밖에 있으면(09:00:30에서 흔하다 — 데이터 −20,1xx · 계획 −200) 두 글이 같은 자리에 겹친다. 이럴 때는 바꿀 글을 계획 글 뒤에 tspan으로 이어 붙인다(「▸ 다음 −200µs · 바꿀 1번 −190µs」).
- **Commit:** 258a059d

**5. [범위 소폭 확장] 순수 함수 · 테스트 추가**
- 상태 갱신을 테스트할 수 있게 `planEditOf` · `planEditWithDraft` · `sameOffsets` · `planStateWithSave`를 `launch-plan-view.ts`에 두었다(계획 파일 범위 안). e2e 기본 저장 응답 `launchPlanSaveOk`를 export했다. P35-P2 ②에 「배포 전엔 적용 안내도 없다」 단언 1줄을 더했다.

## Issues Encountered

- 회귀 게이트 첫 실행 도중 dev 서버(3100)가 내려갔다(ERR_CONNECTION_REFUSED). 재실행으로 해결했다. NextFont 반복 증상은 아니어서 `.next`는 지우지 않았다.
- sidebar-tree 1b는 두 spec을 이어 돌릴 때 한 번 실패했다. 위 검증 결과 참고(무관 · 재실행에서 통과).
- 시각 확인: 1280 순서 오류 · code 1 · 09:00:30 스크린샷과 390 편집 칸 스크린샷에서 겹침이나 잘림은 위 3번 말고는 없었다. 390에서 「조각 시각」 라벨이 칸 위 줄로 감기는 것은 flex-wrap의 의도된 모습이다.

## Known Stubs

None. 편집 칸 값은 서버 계획(GET /plan)에서만 오고, 결과는 PUT 응답에서만 온다. e2e 저장 응답은 합성(`launchPlanSaveOk`)이라고 픽스처 머리 주석 ⑧에 밝혔다.

## 35-16 ~ 35-19(노트 뒤)가 알아야 할 것

- **웹은 이대로 실서버에 붙는다.** relay(35-16 · 35-17)가 `/internal/admin/launch-plan` GET · PUT을 구현하고 server와 relay가 배포되면 `/plan`이 404가 아니게 되고, 이 편집 기능이 저절로 드러난다. 그 전까지는 숨겨져 있다(35-14 absent).
- **code 1 분기:** 구 서버(44 명령 미지원)는 `failed · code 1`로 와야 「서버 미지원 … 서버 업데이트 뒤 다시 저장」이 뜬다. relay가 gh-trade의 「알 수 없는 명령」을 다른 code로 싣거나 다른 outcome으로 접으면 일반 실패 문구로 떨어진다.
- **한도:** 검증 한도는 shared `LAUNCH_PLAN_LIMITS` 한 곳에서만 읽는다(q16 −3000~1000 · 1~10조각 · n0930 −2000~2000 · 1칸 — 잠정). 35-19가 정식 노트와 대조해 그 한 곳만 고치면 편집 칸 · 문구 · 스테퍼가 따라온다. 범위가 넓어져 6글자(예: −10000)가 되면 칸 폭 104px를 다시 재야 한다(P35-P6 단언이 잡는다).
- **inputMode numeric:** 계획 · 목업대로 `inputMode="numeric"`이다. iOS 숫자 키패드에는 「−」가 없다. 기존 음수 값을 고치는 데는 문제없지만, 폰에서 양수를 음수로 바꾸기는 어렵다. 실사용에서 걸리면 `inputMode="text"`(+ `pattern`)로 바꾸는 것을 검토할 것.
- **e2e:** `mockLaunchApi(page, { plan, savePlan })` · `planPuts()`(바디 포함 · `LaunchRequestRecord.body`). PUT 기본 응답은 `launchPlanSaveOk`(그 칸만 바꾼 ok plan + ok 이력 1행)다.

## Self-Check: PASSED

- FOUND: webapp/src/components/admin/launch-plan-editor.tsx · webapp/src/components/admin/__tests__/launch-plan-editor.test.tsx
- FOUND commits: 5f71463a · 25a669a3 · d0762ab6 · 258a059d
