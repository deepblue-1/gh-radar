---
phase: 35-launch-gate
plan: 19
subsystem: webapp
tags: [webapp, admin-launch, launch-plan, gh-trade-43, shared, regression]
status: complete

requires:
  - phase: 35-17
    provides: "relay GET/PUT /internal/admin/launch-plan · interpretAdminResult op 8·9"
  - phase: 35-16
    provides: "정식 노트 대조표(조각 수 상한 · 16:00 · 09:00:30 범위) · kind 18 학습값 칸 폐지(ⓔ)"
  - phase: 35-10
    provides: "kind 18 next_offset_us = cond_threshold 직접 · 학습 8칸 journal 행 null"
provides:
  - "LaunchHeadCardQ16.learnLabel · learnLineOf 세 갈래(「학습 → 다음 오프셋」 / 「다음 발사 계획 첫 조각」)"
  - "launch-orders-tab 16:00 CardRow 라벨 = model.learnLabel"
  - "LAUNCH_PLAN_LIMITS JSDoc — 정식 노트와 일치 확인(값 무변경)"
  - "범위 7 전체 회귀 결과(로컬 green)"
  - "fix 노트 대조: LAUNCH_PLAN_LIMITS.maxSpanUs(q16 500) · validateLaunchPlanDraft 폭 위반(kind span)"
  - "LAUNCH_PLAN_UNKNOWN_OP_MESSAGE — 저장 결과 「서버 미지원」 은 code 1 「알 수 없는 명령입니다」 일 때만"
affects: [35-18]

actuals:
  tokens: 7530
  tasks: 3
  commits: 7
plan_head_before: 935db8db81b7aa312532f36e53326784b6efb751
plan_head_after: 9f51eb456cb6d77d58160190887789d450120ee0

tech-stack:
  added: []
  patterns:
    - "학습 시절 머리와 Phase 43 뒤 머리는 학습값(correction_before · after · step) non-null 여부로 가른다 — next_offset_us 만으로는 가르지 않는다"

key-files:
  created:
    - .planning/phases/35-launch-gate/35-19-SUMMARY.md
  modified:
    - webapp/src/lib/launch-format.ts
    - webapp/src/components/admin/launch-orders-tab.tsx
    - webapp/src/lib/__tests__/launch-format.test.ts
    - webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx
    - packages/shared/src/launch-plan.ts
    - packages/shared/src/__tests__/launch-plan.test.ts
    - packages/shared/src/admin.ts
    - webapp/src/lib/launch-plan-view.ts
    - webapp/src/lib/__tests__/launch-plan-view.test.ts
    - webapp/src/components/admin/launch-plan-editor.tsx
    - webapp/src/components/admin/__tests__/launch-plan-editor.test.tsx

key-decisions:
  - "35-19: 16:00 학습 줄 판정 = correction_before · correction_after · step_us 중 하나라도 non-null 이면 옛 라벨 · 옛 문형, 아니면 「다음 발사 계획 첫 조각」 + next_offset_us(없으면 —)"
  - "35-19: D-34 LAUNCH_PLAN_LIMITS 는 정식 노트(119/120 서버 설정값)와 일치 — 값 · 테스트 무변경, JSDoc 만 갱신"
  - "35-19(fix 노트): 저장 결과 「서버 미지원」 은 code 1 + 「알 수 없는 명령입니다」 바이트 일치일 때만 — 새 서버의 code 1 입력 거부는 「KB120 실패: <원문>」"
  - "35-19(fix 노트): Q16 시각 목록 폭(마지막 − 첫) ≤ 500µs 클라 검증 — 순서 검사 뒤 · badIdx = 마지막 칸 · N 은 null(해당 없음)"

requirements-completed: []

duration: 15min
completed: 2026-10-28
---

# Phase 35 Plan 19: 노트 대조 마무리 + 범위 7 전체 회귀 Summary

**학습값이 빈 16:00 머리(Phase 43 뒤 kind 18)를 주문 내역 카드가 「다음 발사 계획 첫 조각 · −350µs」 로 보인다. 학습값이 있는 옛 머리(학습 시절 · 백필)는 기존 「학습 → 다음 오프셋」 줄 그대로다. `LAUNCH_PLAN_LIMITS` 는 정식 노트와 같아서 값은 두고 JSDoc 만 고쳤다. 범위 7 코드 전체(shared · relay · server · webapp · e2e · pgTAP)가 로컬에서 한 번에 green 이다. push · 배포는 하지 않았다(D-35).**

## Performance

- **Duration:** 약 15분 (본 플랜 5분 + fix 노트 후속 10분)
- **Completed:** 2026-10-28
- **Tasks:** 2 (tracer 1 · auto 1) + fix 노트 후속 1
- **Files modified:** 11

## D-32 문형 표 (16:00 머리 카드 학습 줄 · 세 갈래)

| 머리 | learnLabel | learn |
|---|---|---|
| 학습값(correction_before · after · step) 하나라도 non-null — 학습 시절 · 백필 | 학습 → 다음 오프셋 | `−146 → −151 · 다음 −337µs (step 5)` (옛 문형 그대로) |
| 학습값 전부 null · next_offset_us 있음 — Phase 43 뒤 journal | 다음 발사 계획 첫 조각 | `−350µs` |
| 전부 null · 또는 머리 없음 | 다음 발사 계획 첫 조각 | `—` |

- 문구 리터럴은 `webapp/src/lib/launch-format.ts` 한 곳(`LEARN_LABEL` · `PLAN_FIRST_LABEL`)에만 있다. 탭은 `model.learnLabel` 을 그대로 쓴다.
- 09:00:30 카드(「재전송」 · 「다음 오프셋 고정 −245µs」)는 바꾸지 않았다. RTL 이 n0930 카드에 새 라벨이 없음을 단언한다.
- 판정은 학습값 칸 non-null 여부로 한다. next_offset_us 는 두 시절 모두에 있으므로 판정 기준이 아니다.

## D-34 판정 — 노트와 일치

| 항목 | 노트 ⓒ(119/120 서버 설정값) | `LAUNCH_PLAN_LIMITS` | 판정 |
|---|---|---|---|
| Q16 조각 수 | 1 ~ `max_pieces` = 10 | minPieces 1 · maxPieces 10 | 같음 |
| Q16 시각 범위 | 클램프 −3000~1000µs | minUs −3000 · maxUs 1000 | 같음 |
| N 길이 | 1 | minPieces 1 · maxPieces 1 | 같음 |
| N 시각 범위 | ±2000µs | minUs −2000 · maxUs 2000 | 같음 |

값과 테스트(shared `launch-plan.test.ts` · 편집 칸 RTL · E2E P35-P5)는 바꾸지 않았다. JSDoc 의 「잠정」 을 「정식 노트 `docs/inbox/from-gh-trade/261028-launch-plan-contract.md` 와 일치 확인」 으로 바꾸고 노트 숫자를 적었다. 범위가 그대로라서 편집 칸 폭 104px 를 다시 잴 필요는 없다(35-15 메모).

## 범위 7 전체 회귀 (Task 2 verify · 순차 · 이 세션 단독)

| 단계 | 결과 |
|---|---|
| shared build | 통과 |
| shared vitest `--maxWorkers=2` | **24 files · 724 passed** · failed 0 (기준선과 같다) |
| relay vitest `--maxWorkers=2` | **60 files · 1704 passed** · failed 0 (기준선과 같다) |
| relay typecheck · typecheck:tests | 통과 |
| server vitest `--maxWorkers=2` | **43 files · 608 passed** · failed 0 (기준선과 같다) |
| server typecheck | 통과 |
| webapp typecheck (`tsc --noEmit && tsc -p tsconfig.e2e.json` 2단계) | 통과 |
| webapp vitest `--maxWorkers=2` | **189 files · 4885 passed · 1 skipped** · failed 0 (기준선 4881 → +4: launch-format 3 · launch-orders-tab 1) |
| playwright `e2e/specs/admin-launch.spec.ts --workers=1` | **19 passed** (P35-L1~L6 · M1~M5 · P1~P6 포함) |
| pgTAP `launch_plan_changes.test.sql` (로컬 docker · 마이그레이션 86개 재생) | **1..26 · ok 26 · not ok 0 · RESULT: PASS** (exit 0, 미실행 아님) |

미실행 항목 없음. 범위 밖 실패 없음.

## fix 노트 대조 (코디네이터 후속 · `docs/inbox/from-gh-trade/261028-launch-plan-fix.md` · gh-trade f5113297 · 와이어 무변경)

| fix 노트 항목 | 판정 | 코드 |
|---|---|---|
| ① op 8 code 1 거부 문구 8번째 「시각 목록 폭 상한 밖(마지막 − 첫 ≤ 500µs)」 | **반영** — shared `LAUNCH_PLAN_LIMITS.q16.maxSpanUs = 500`(n0930 `null`) · `validateLaunchPlanDraft` 가 순서 검사 **뒤**에 폭을 검사한다. 위반이면 `kind: "span"` · `badIdx` = 마지막 칸 · 문구 「조각 시각은 첫 조각과 마지막 조각 차이가 500µs 이하여야 해요 — 지금 nµs」. 첫 위반 하나만 돌려주는 규칙은 그대로 | `f2db92c3` |
| ①' 기존 버그: code 1 이면 전부 「서버 미지원 · … — 서버 업데이트 뒤 다시 저장」 | **수정** — 새 서버는 범위 · 순서 · 조각 수 · 폭 거부도 code 1 + 고정 문구로 보낸다. 그래서 「서버 미지원」 은 code 1 이면서 message 가 `LAUNCH_PLAN_UNKNOWN_OP_MESSAGE`(「알 수 없는 명령입니다」, 바이트 대조 상수 하나)일 때만 쓴다. 그 밖의 code 1 은 「KB120 실패: <원문>」 이다. message 가 없는 code 1 은 「KB120 실패: 실패」. JSDoc 표 · editor 주석 · shared `interpretAdminResult` 주석도 갱신했다 | `9f51eb45` |
| ② op 8 code 10 「발사 계획 저장 경로 없음 — 서버 plan_file 설정을 확인하세요」 | 코드 변경 없음 — 기존 failed 분기가 이미 「KYOBO119 실패: <원문>」 을 낸다. 단위 테스트 1건으로 확인했다 | 테스트만 |
| ③ kind 17 `planned_us` 클램프 뒤 값 | 무관 — `planned_us` 는 launch_pieces 매핑에 없다(웹 · 지도 미사용) | 없음 |
| ④ kind 17 `result_code` · `rc=` 첫 발 번호 기준 | 무변경 — 매핑(rc 원문 → text) 그대로이고 값의 뜻만 맞아졌다 | 없음 |
| ⑤ 계획 파일 손상 시 op 9 초깃값 · `plan_rev` 1 | 무관 — 웹은 plan_rev 를 비교하지 않는다(표시 · 이력 기록만) | 없음 |

- e2e P35-P4 ② 서버 거부 케이스는 message 가 「알 수 없는 명령입니다」 라서 기대값(「서버 미지원 · 알 수 없는 명령입니다 — 서버 업데이트 뒤 다시 저장」)이 그대로 맞다. 그래서 고치지 않았다.
- 기존 shared 테스트 「경계값 −3000 · 1000 은 ok」 의 `["-3000", "1000"]` 은 폭이 4000 이라 이제 폭 위반이다. 그래서 한 칸씩(`["-3000"]` · `["1000"]`)과 폭 500 안의 두 칸(`["-3000","-2500"]` · `["500","1000"]`)으로 나눴다. `["-3000","1000"]` 은 폭 위반 단언으로 옮겼다. 상수 단언 it 제목의 「잠정」 도 「정식 노트 값」 으로 바꿨다.
- 노트 파일은 건드리지 않았다(35-18 에서 닫음).

### fix 노트 반영 뒤 회귀

| 단계 | 결과 |
|---|---|
| shared vitest | **24 files · 726 passed** (724 → +2: 폭 위반 · 폭 순서) |
| webapp typecheck · relay typecheck · server typecheck | 통과 |
| webapp vitest | **189 files · 4889 passed · 1 skipped** (4885 → +4: view 2 · editor 2) |
| playwright admin-launch `--workers=1` | **19 passed** |

RED `13423f8c`: shared 2 failed · webapp 3 failed(폭 위반 2 · code 1 일반 실패 1). code 10 확인 테스트와 「폭은 순서 뒤」 테스트는 RED 에서도 통과했다(기존 동작 잠금).

## Task Commits

1. **Task 1 (tracer): 16:00 머리 카드 다음 발사 계획 첫 조각** — RED `083ee5da` (test) → GREEN `9751265c` (feat)
2. **Task 2: D-34 노트 대조** — `2777a821` (docs · JSDoc 만 · 행동 변화 없음이라 RED 없음) + 범위 7 전체 회귀(커밋 없음)

3. **fix 노트 대조(코디네이터 후속)** — RED `13423f8c` (test) → GREEN `f2db92c3` (feat · 폭 검증) · `9f51eb45` (fix · 서버 미지원 판정)

**이 플랜의 마지막 코드 커밋(35-18 Task 3 done_commit 후보): `9f51eb45`** — 정식 노트 `261028-launch-plan-contract.md` 와 fix 노트 `261028-launch-plan-fix.md` 둘 다 이 해시로 닫으면 된다.

## TDD Gate Compliance

- RED `083ee5da`: 6 failed / 34 passed. launch-format 5건은 `learnLabel` 이 없어서 실패했고, launch-orders-tab 1건은 카드에 「다음 발사 계획 첫 조각」 이 없어서 실패했다. 기존 「카드 4장 … 학습 → 다음 오프셋」 케이스는 RED 에서도 통과했다(회귀 잠금).
- GREEN `9751265c`: 2 files · 40 passed · webapp typecheck exit 0.
- Tracer 게이트: GREEN 뒤 `<verify>` 를 다시 돌려 통과한 것을 확인하고 Task 2 로 넘어갔다.

## Deviations from Plan

### 설계 메모 (계획 범위 안의 선택)

- **함수 이름:** 계획의 「`learnText` 세 갈래」 를 라벨과 값을 함께 돌려주는 `learnLineOf(h) → { learnLabel, learn }` 로 바꿨다. 판정을 한 곳에서 해서 라벨과 값이 서로 다른 갈래를 타지 않게 하려는 것이다. 겉으로 보이는 결과(모델 필드 `learnLabel` · `learn`)는 계획과 같다.
- **커밋 타입:** Task 2 커밋은 JSDoc 만 고쳐서 `docs(35-19)` 로 했다.
- **shared 테스트 제목:** Task 2 에서는 계획대로 테스트를 두었다. 그 뒤 fix 노트 후속에서 상수 단언에 `maxSpanUs` 가 붙으면서 it 제목의 「잠정」 을 「정식 노트 값」 으로 바꿨다.
- **범위 추가(코디네이터 지시):** fix 노트 반영 2건(폭 검증 · 서버 미지원 판정 버그)을 35-19 범위(D-34 노트 대조)로 처리했다 — 위 「fix 노트 대조」 절.

None — 자동 수정(Rule 1~3) 없음.

## Known Stubs

None.

## 35-18(배포 · 라이브 UAT)이 알아야 할 것

- push 안 함(D-35). 이 플랜 커밋(코드 6 · 문서 2)은 로컬 master 에만 있다.
- 웹 변경은 주문 내역 16:00 카드 줄 · 편집 칸 폭 검증 · 저장 결과 줄 판정이다. shared 는 `LAUNCH_PLAN_LIMITS` 필드 추가(웹만 사용)와 주석뿐이다. DB · relay · server 동작 변경은 없다. 배포 순서 D-30(gh-trade 43 → DB → relay → server → webapp push)은 그대로다.
- 라이브 UAT: Phase 43 서버 첫 16:00 뒤 그날 주문 내역 16:00 카드에 「다음 발사 계획 첫 조각 · <계획 첫 조각>µs」 가 보이는지 본다. 값은 kind 18 next_offset_us, 곧 그 시점 op 9 의 Q16/<시장> 첫 값이다. 그 전 날짜(백필 · 학습 시절)는 「학습 → 다음 오프셋」 이 보여야 한다.
- 노트 `docs/inbox/from-gh-trade/261028-launch-plan-contract.md` · `261028-launch-plan-fix.md` 는 둘 다 `status: open` 그대로다(메인 세션의 미추적 파일 — 손대지 않았다). 닫을 때 done_commit 은 `9f51eb45`(위)를 쓴다.
- 라이브 스모크 추가: 폭 501µs 계획은 웹이 저장 전에 막는다(서버까지 가지 않음). 구 서버(Phase 43 전)에 저장하면 「서버 미지원」 이 보이고, 새 서버의 거부는 「KB120 실패: <서버 원문>」 이다.

## Self-Check: PASSED

- FOUND: webapp/src/lib/launch-format.ts (「다음 발사 계획 첫 조각」 · `learnLabel`) · webapp/src/components/admin/launch-orders-tab.tsx (`model.learnLabel`) · packages/shared/src/launch-plan.ts (「정식 노트」 · `export const LAUNCH_PLAN_LIMITS`)
- FOUND commits (HEAD 조상): 083ee5da · 9751265c · 2777a821 · 13423f8c · f2db92c3 · 9f51eb45
- FOUND: packages/shared/src/launch-plan.ts (`maxSpanUs: 500` · `kind: "span"`) · webapp/src/lib/launch-plan-view.ts (`LAUNCH_PLAN_UNKNOWN_OP_MESSAGE`)
