---
phase: 24-limitchaser-buy3
plan: 20
subsystem: webapp 상따 설정 폼 (D-02 전반 · 후반 마스터 동반)
tags: [gap-closure, GC-WR-03, GC-IN-01, GC-IN-02, limit-chaser-form, tdd]
status: complete
requires: ["24-19"]
provides:
  - "commitGroupSwitch 끄는 방향 두 단계 동반 — 누른 순간 formRef 로 마지막(pressedLast)일 때만 (base) => 동반 함수, 함수는 판정 시점 서버 동기값으로 여전히 마스터 ON ∧ 다른 두 그룹 OFF 일 때만 { buyEnabled: false }"
  - "isServerFoldEdge — 직전 · 이번 에코 중 하나라도 isLegacyBuySchema 면 false(buy3 → 구서버 전환 에코 배제)"
  - "D-02 후반 주석 · UI-SPEC 부록 — 구서버 문장 정정 · 남는 한계에 모든 인스턴스 숨음 N건(지터 이월) · D-02 전반 두 단계 판정"
  - "폼 GC-WR-03 describe 4 케이스 · ⑰-b GC-IN-01 describe 2 케이스"
affects: [webapp 상따 설정 폼 그룹 스위치 · D-02 후반 자동 마스터 OFF]
tech-stack:
  added: []
  patterns:
    - "사람 핸들러 동반 = 누른 순간 화면 판정(게이트) + 판정 시점 서버 값 재판정(함수) 두 단계 — 켜는 방향 WR-03 과 같은 꺼낼 때 계산"
key-files:
  created:
    - .planning/phases/24-limitchaser-buy3/24-20-SUMMARY.md
  modified:
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md
decisions:
  - "GC-WR-03: D-02 전반 마스터 동반은 누른 순간 화면(낙관 표시 포함)에서 마지막 ∧ 판정 시점(즉시 · 꺼내는 순간) 서버 값에서도 마지막일 때만 — 누른 순간 마지막이 아니었으면 꺼내는 순간 마지막이 돼도 싣지 않는다(D-02 = 사람이 본 마지막)"
  - "GC-IN-01: isServerFoldEdge 는 구서버 에코(직전 · 이번)를 하강 전이로 읽지 않는다 — relay 세션 ready 소실(파일 밖 보장)에 기대지 않는다"
  - "GC-IN-02: 유예 지터는 넣지 않고 남는 한계 문구만 넓힌다(모든 인스턴스 숨음 → N건) — 운영 서버 D-34 에서는 백스톱에 닿지 않음 · 테스트 결정성 · 24-24 사용자 확인"
metrics:
  duration: "6 min (2026-09-28 09:01Z ~ 09:08Z)"
  completed: "2026-09-28"
  tasks: 2
  files: 3
actuals:
  tokens: 4700
  tasks: 2
  commits: 2
plan_head_before: fb8f45c09b0c16d763a1dbd9aca3f8ca6d932813
commits: 2
requirements-completed: []
coverage:
  - id: D1
    description: "값 확정 in-flight 중 대기에 선 「선매수 끄기」(화면상 마지막)는 그사이 다른 단말이 후매수를 켠 에코가 오면 마스터 OFF 를 싣지 않는다 · 후매수 ON 유지 · 마스터 ON 표시"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#GC-WR-03 — 마지막 그룹 끄기의 마스터 동반은 꺼내는 순간 다시 판정한다 (24-VERIFICATION-R2 갭 3)"
        status: pass
    human_judgment: false
  - id: D2
    description: "꺼내는 순간에도 마지막이면 마스터 OFF 를 싣고 · 누른 순간 마지막이 아니었으면 싣지 않고 · 즉시 경로(⑰) 결과는 종전과 같다"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#GC-WR-03 (여전히 마지막 · 누른 순간 마지막 아님 · 대기 중 낙관 표시)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#⑰ 그룹 스위치 D-01 · D-02 전반"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g \"P24-4|P24-3\""
        status: pass
    human_judgment: false
  - id: D3
    description: "buy3 → 구서버 전환 에코는 하강 전이가 아니다 — 자동 마스터 OFF 전송 0 · 매수주문 ON 그대로"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#GC-IN-01 — buy3 → 구서버 전환 에코는 하강 전이가 아니다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#⑰-b D-02 후반 · D-19 (기존 케이스 전부)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-02 후반 남는 한계(모든 인스턴스 숨음 N건 · 지터 이월) 문구 — 폼 주석 · UI-SPEC 부록"
    verification: []
    human_judgment: true
    rationale: "문서 · 주석 문구의 적정성은 24-24 체크포인트에서 사용자가 확인하는 항목이다(지터 미도입 결정 포함)"
---

# Phase 24 Plan 20: GC-WR-03 D-02 전반 두 단계 동반 · GC-IN-01 구서버 전환 배제 Summary

**마지막 그룹 끄기의 마스터 동반을 누른 순간 화면(게이트)과 판정 시점 서버 값(함수) 두 단계로 판정해 대기 중 다른 단말이 켠 후매수를 사람 손 없이 해제하지 않고, buy3 → 구서버 전환 에코가 D-02 후반 자동 마스터 OFF 를 구서버에 보내지 않는다.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-09-28T09:01:59Z
- **Completed:** 2026-09-28T09:08:14Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `commitGroupSwitch` 끄는 방향 — `pressedLast = f.buyEnabled && BUY_GROUP_GATES.every((g) => g === gate || !f[g])`(f = `formRef.current`)가 참일 때만 `commitField(gate, false, 'toggle', (base) => …)`. 함수는 `base.buyEnabled && BUY_GROUP_GATES.every((g) => g === gate || !base[g])` 이면 `{ buyEnabled: false }`, 아니면 `{}`. 거짓이면 동반 없이 끈다. 훅이 확정 순간 · 꺼내는 순간 · no-op · failQueue 판정마다 `base` 로 다시 부르므로(24-14) 꺼낼 때 동반이 빠지면 `reshow` 가 마스터 낙관 OFF 를 서버 값(ON)으로 되돌린다(24-19 기준). 켜는 방향 · 사전 검증 · D-16 · 자동 체크는 손대지 않았다.
- `isServerFoldEdge` — `isLegacyBuySchema(prev)` · `isLegacyBuySchema(next)` 중 하나라도 참이면 false. JSDoc 에 이유(구서버 마스터 OFF = 실제 매수 감시 해제 · 파일 밖 보장에 기대지 않음).
- D-02 후반 주석 — 가드 ⑤ 아래 「구서버 에코는 그룹이 늘 OFF 라 하강 전이가 생기지 않는다」(전환 에코에서 거짓) → 「전환 에코를 포함해 `isServerFoldEdge` 가 먼저 거른다(GC-IN-01)」. 남는 한계에 「모든 탭 · 앱이 숨으면 같은 유예 뒤 N건 · 지터 미도입(GC-IN-02)」.
- UI-SPEC 「D-02 후반 보강(WR-06 · 24-15)」 끝에 「갭 클로징 2라운드 보강(24-REVIEW-R2 · 24-20)」 세 줄(GC-IN-02 · GC-IN-01 · GC-WR-03). 상호작용 계약 행은 무변.

## RED 기록

- Task 1 ①: GC-WR-03 「다른 단말 후매수 ON」 케이스가 `limit-chaser-form.test.tsx:2504` 에서 실패 — 둘째 cfg `buyEnabled: false`(기대 true · `postBuyEnabled: true` 인데 마스터 OFF 가 실림). 「대기 중 낙관 표시」 케이스도 꺼낸 뒤 매수주문 스위치가 `aria-checked="false"` 로 남아 실패. (2 failed | 2 passed — 「여전히 마지막」 · 「누른 순간 마지막 아님」은 수정 전후 모두 통과하는 가드)
- Task 2 ①: GC-IN-01 함수 케이스 `expected true to be false`(buy3 → 구서버 전환이 하강 전이로 판정), 폼 케이스 `expected [ {…} ] to have a length of +0 but got 1`(구서버에 자동 마스터 OFF 1건 전송). (2 failed)

## Task Commits

1. **Task 1 (tracer): 끄는 방향 두 단계 동반 함수 + GC-WR-03 회귀 4 케이스** — `ddafbe04` (fix)
2. **Task 2: GC-IN-01 isServerFoldEdge 구서버 배제 · GC-IN-02 남는 한계 문구 · UI-SPEC 부록 · ⑰-b 회귀** — `7c343fe2` (fix)

Tracer 게이트: `HUMAN_VERIFY_MODE=end-of-phase` · `<verify>` 자동 전용 → Task 1 verify 통과(282/282) 뒤 확장.

## Files Created/Modified

- `webapp/src/components/trading/limit-chaser-form.tsx` — `commitGroupSwitch` 끄는 방향 · JSDoc · `isServerFoldEdge` 구서버 배제 · D-02 후반 주석 두 곳
- `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx` — describe 「GC-WR-03 — 마지막 그룹 끄기의 마스터 동반은 꺼내는 순간 다시 판정한다 (24-VERIFICATION-R2 갭 3)」 4 케이스 · ⑰-b 안 describe 「GC-IN-01 — buy3 → 구서버 전환 에코는 하강 전이가 아니다」 2 케이스 · `isServerFoldEdge` import
- `.planning/phases/24-limitchaser-buy3/24-UI-SPEC.md` — D-02 후반 보강 소절 세 줄

## Verification

- `vitest --run limit-chaser-form.test.tsx use-lc-field-commit.test.tsx` — 2 files · 282 passed (Task 1)
- `vitest --run src/components/trading src/lib` — 77 files · 2181 passed · 1 skipped
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` — error TS 0
- `playwright test e2e/specs/trading-workbench.spec.ts -g "P24-4|P24-3"` — 4 passed(setup · P24-3 · P24-4 · P24-12 — `-g` 가 「P24-3」 로 P24-12 도 잡았다 · 1.2m)
- 수용 기준: 끄는 방향 `commitField(gate, false, 'toggle', (base)` 1 · 정적 `'toggle', { buyEnabled: false })` 0 · GC-WR-03 describe 1 · `isServerFoldEdge` 안 `isLegacyBuySchema(` 2 · 틀린 주석 0 · 폼 `GC-IN-01` 4 · `GC-IN-02` 1 · GC-IN-01 describe 1 · UI-SPEC 소절 ID 줄 3

## Decisions Made

- `isServerFoldEdge` 구서버 배제는 두 줄의 조기 반환(`if (isLegacyBuySchema(prev)) return false;` · `next`)으로 썼다 — 한 식으로 합치면 한 줄이 되어 수용 기준 grep(줄 수 ≥ 2)과 어긋나고, 조기 반환이 읽기에도 분명하다.
- 대기 경로에서 누른 순간 화면은 마지막이지만 그 시점 서버 값에는 아직 다른 그룹이 켜져 있는 경우(예: 추가매수 끄기 in-flight 뒤 선매수 끄기 대기)는 마스터 낙관 OFF 가 누를 때가 아니라 꺼내 보낼 때 선다 — 함수가 꺼낼 때 `{ buyEnabled: false }` 를 돌려주고 `sendNow` 가 `applyToggle` 로 표시한다. 나가는 cfg 는 종전과 같다(표시 시점만 서버 값에 맞춰졌다).

## Deviations from Plan

None - plan executed exactly as written.

(참고: RED 케이스의 in-flight 값 확정은 플랜 예시 「선매수 매도잔량」 대신 GC-WR-02 테스트와 같은 한방 틱 수(`lc-sweep-tick`) 인라인 확정을 썼다 — 필드 종류와 무관하게 「앞 확정 in-flight → 끄기 대기」 조건을 만든다. 즉시 경로 회귀는 플랜대로 기존 ⑰ 케이스로 확인했고, GC-WR-03 describe 에는 「꺼내는 순간에도 마지막이면 싣는다」 양성 케이스를 하나 더했다.)

## Issues Encountered

None

## Known Stubs

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 갭 클로징 2라운드 다음 플랜(24-21~) 준비됨. GC-IN-02 지터 미도입 · 문구는 24-24 체크포인트 사용자 확인 항목.
- 관찰(범위 밖 · 기존 동작): 사람이 「마지막 아님」으로 선매수를 끈 뒤 다른 단말이 후매수를 꺼 세 그룹이 모두 OFF 가 되면, 그 에코는 `isServerFoldEdge` 로 D-02 후반 자동 마스터 OFF 를 탄다(하강 전이 판정이 원인 주체를 구분하지 않는다) — 운영 서버 D-34 에서는 닿지 않는 백스톱이다.
- 배포 없음(커밋만) — webapp push 는 relay 배포 순서를 따른다.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/limit-chaser-form.tsx · limit-chaser-form.test.tsx · 24-UI-SPEC.md
- FOUND: ddafbe04 · 7c343fe2 (`git rev-list --count fb8f45c0..HEAD` = 2)

---
*Phase: 24-limitchaser-buy3*
*Completed: 2026-09-28*
