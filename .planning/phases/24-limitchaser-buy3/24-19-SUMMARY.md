---
phase: 24-limitchaser-buy3
plan: 19
subsystem: webapp 상따 필드 확정 훅 (토글 실패 · 폐기 되돌림)
tags: [gap-closure, GC-WR-02, GC-IN-05, WR-04, use-lc-field-commit, tdd]
status: complete
requires: ["24-16"]
provides:
  - "revertToggle 되돌림 기준 = 지금 서버 동기값(baseNow()) · 미등록(서버 없음)이면 확정 직전 폼 값 — 모든 토글 되돌림(in-flight 실패 · 대기 접기 · 꺼낼 때 막힘 · 끊김)의 한 자리"
  - "reshow 의 빠지는 동반 키도 같은 기준(서버 있으면 서버 값)"
  - "failQueue — 주 필드가 이미 서버 값이면 주 필드는 성공(markSuccess · 말풍선 없음) · 동반은 서버 값으로 표시"
  - "GC-IN-05 — commit 의 미등록 로컬 반영 주석이 「LC_GATE_FIELDS 밖」을 말한다"
  - "훅 GC-WR-02 회귀 5 케이스 + WR-04 케이스 기대 갱신 · 폼 GC-WR-02 describe 1 케이스"
affects: [webapp 상따 설정 폼 스위치 · 체크 표시 무결성]
tech-stack:
  added: []
  patterns:
    - "되돌림 기준 = 전송 조립과 같은 식(baseNow = formFromServer(server, formRef.current)) — 보인 값 = 서버에 선 값이 실패 · 폐기 뒤에도 선다"
key-files:
  created:
    - .planning/phases/24-limitchaser-buy3/24-19-SUMMARY.md
  modified:
    - webapp/src/components/trading/lc/use-lc-field-commit.ts
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
decisions:
  - "GC-WR-02: 토글 되돌림 기준은 서버가 있으면 지금 서버 동기값(baseNow()), 없으면(미등록 · ⑥) 확정 직전 폼 값 — revertToggle 한 자리 · reshow 빠지는 키도 같은 기준"
  - "GC-WR-02: failQueue 에서 주 필드만 서버 값이면 주 필드는 성공 · 동반은 서버 값으로 조용히 보인다(동반 스위치에 실패 말풍선을 따로 붙이지 않음 — 24-24 사용자 확인 결정 기록 그대로). 대기 건 전체를 성공으로 접는 것(WR-04 금지)과 다르다"
metrics:
  duration: "7 min (2026-09-28 08:51Z ~ 08:58Z)"
  completed: "2026-09-28"
  tasks: 2
  files: 3
actuals:
  tokens: 5500
  tasks: 2
  commits: 2
plan_head_before: 7f6b935e9128f7dc3e5ea79bacd6262cc159364c
commits: 2
requirements-completed: []
coverage:
  - id: D1
    description: "대기 건을 앞 확정 실패로 접을 때 주 필드가 이미 서버 값이면 주 필드는 성공 · 동반은 서버 값(선매수 OFF · 마스터 ON · 말풍선 0 · 전송 1)"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#GC-WR-02 — 대기 건을 실패로 접어도 폼 토글은 서버 값이다 (24-VERIFICATION-R2 갭 2)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#GC-WR-02 — 주 필드가 이미 서버에 섰다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#WR-04 — … → GC-WR-02: 주 필드는 성공"
        status: pass
    human_judgment: false
  - id: D2
    description: "주 필드가 서버에 서지 않았으면 종전대로 실패(rejected) · 되돌림 표시는 서버 값"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#GC-WR-02 — 주 필드가 서버에 서지 않았다"
        status: pass
    human_judgment: false
  - id: D3
    description: "in-flight 실패 · 꺼낼 때 막힘 되돌림도 서버 동기값 · 미등록은 확정 직전 폼 값"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#GC-WR-02 — in-flight 실패 되돌림도 서버 동기값이다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#GC-WR-02 — 꺼낼 때 무장 가드로 막힌 대기 토글의 되돌림은 그 순간 서버 값이다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#GC-WR-02 — 미등록(서버 없음) 등록 토글이 거부되면 되돌림은 종전대로 확정 직전 폼 값이다"
        status: pass
    human_judgment: false
  - id: D4
    description: "토글 되돌림이 보이는 e2e 회귀(P24-4 D-02 전반/후반 · P24-10 구서버 끄기) 무변"
    verification:
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g \"P24-4|P24-10\""
        status: pass
    human_judgment: false
---

# Phase 24 Plan 19: GC-WR-02 토글 되돌림 = 서버 동기값 Summary

**실패 · 폐기 뒤 토글 되돌림 기준을 누른 순간 폼 값에서 지금 서버 동기값(baseNow())으로 옮기고, 대기 건의 주 필드가 이미 서버에 섰으면 거짓 실패 대신 성공으로 접는다 — 서버가 접은 선매수가 ON 으로 되살아나거나 「반영하지 못했어요」가 붙지 않는다.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-09-28T08:51:29Z
- **Completed:** 2026-09-28T08:58:21Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `revertToggle(p)` — 서버가 있으면 `baseNow()` 의 주 필드 값과 `p.shownCompanions` 키 값(`pickValues`)을 `showToggle` 로 보이고, 서버가 없으면 종전대로 `p.prevValue` · `p.prevCompanions`. 불리언 필터는 `showToggle` 이 그대로 건다(IN-05). 호출부(`sendNow` 범위 밖 · 구서버 · 무장 막힘 · 끊김, `drain` 끊김, `failQueue`, `failInflight`)는 바뀌지 않고 이 한 자리를 지난다.
- `reshow` — 동반 재계산으로 빠지는 키의 되돌림 값도 서버가 있으면 서버 동기값(두 되돌림 자리가 같은 규칙).
- `failQueue` — `sameAsServer(주 필드 + 동반)` 참이면 종전대로 성공, 아니면 `server != null && sameAsServer(server, q.field, q.value)`(주 필드만)일 때 `markSuccess(q.field)`, 그 밖은 `setFailure`. 두 갈래 모두 토글이면 `revertToggle(q)`(= 서버 값 표시).
- 머리 ⑩ · ⑪ 되돌림 문장 · `Pending.prevValue`/`prevCompanions` JSDoc 을 새 규칙으로 고침. GC-IN-05: commit 의 「⑥ 미등록 전략 — 게이트 4종 밖」 → 「LC_GATE_FIELDS 밖」(삭제 판정 4종을 말하는 ⑥ 머리 · `lcLegacyBlockOf` JSDoc 은 맞는 표현이라 그대로).
- 재전송 없음(T-16-10) · 성공 판정(① 주 필드만) · 직렬화 · 고아 장벽 · 늦은 에코 규칙은 무변 — 실패 · 폐기 뒤 **무엇을 보여 주는가**만 바뀌었다.

## RED 기록 (Task 1 ①)

- RED: 폼 GC-WR-02 케이스가 `limit-chaser-form.test.tsx:2464` 에서 실패 — 앞 건 거부 뒤 선매수 스위치가 누른 순간 값 **ON**(`aria-checked="true"`)으로 되살아났다. 훅 3 케이스도 실패 — 주 필드 선 대기 건에 `failures.preBuyEnabled = { reason: 'rejected', … }` 가 붙었고(기존 WR-04 케이스 갱신분 포함), in-flight 실패 뒤 `sellEnabled` 가 서버 값(ON)이 아니라 누른 순간 값(OFF)으로 돌아갔다. (4 failed | 272 passed)
- Task 2 케이스는 Task 1 코드로 통과해야 하는 회귀라 RED 단계가 없다. 대신 수정 전 훅(`7f6b935e`)으로 되돌려 돌려 보면 「꺼낼 때 막힘」 케이스가 실패한다(누른 순간 마스터 OFF 로 되돌림). 「주 필드 안 섬」 · 「미등록」 케이스는 수정 전후 모두 통과하는 가드다(미등록 케이스는 서버 없이 `baseNow()` = 낙관 표시된 폼 값으로 되돌리는 실수를 막는다).

## Task Commits

1. **Task 1 (tracer): 되돌림 기준 = 서버 동기값 · failQueue 주 필드 선 경우 성공 + 훅 · 폼 GC-WR-02 회귀** — `7c282617` (fix)
2. **Task 2: 꺼낼 때 막힘 · 미등록 되돌림 회귀 + GC-IN-05 주석** — `8b1521dd` (test)

Tracer 게이트: `HUMAN_VERIFY_MODE=end-of-phase` · `<verify>` 자동 전용 → Task 1 verify 재실행 통과(276/276) 뒤 확장.

## Files Created/Modified

- `webapp/src/components/trading/lc/use-lc-field-commit.ts` — `revertToggle` · `reshow` 서버 동기값 기준 · `failQueue` 주 필드 선 갈래 · 머리 ⑩ ⑪ · GC-IN-05 주석
- `webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx` — GC-WR-02 5 케이스(주 필드 섬 · 안 섬 · in-flight 실패 동반 서버 값 · 꺼낼 때 막힘 · 미등록) · WR-04 케이스 기대 갱신
- `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx` — describe 「GC-WR-02 — 대기 건을 실패로 접어도 폼 토글은 서버 값이다 (24-VERIFICATION-R2 갭 2)」

## Verification

- `vitest --run use-lc-field-commit.test.tsx limit-chaser-form.test.tsx` — 2 files · 276 passed (Task 1), 훅 88 passed (Task 2 추가 뒤)
- `vitest --run src/components/trading src/lib` — 77 files · 2175 passed · 1 skipped
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` — error TS 0
- `playwright test e2e/specs/trading-workbench.spec.ts -g "P24-4|P24-10"` — 3 passed (setup 포함 · 21.3s)
- 수용 기준: failQueue `sameAsServer(server, q.field, q.value)` 1 · revertToggle `baseNow()` 1 · 훅 `GC-WR-02` 9 · 폼 describe 1 · 훅 테스트 `GC-WR-02` 7 · `게이트 4종 밖` 0 · `LC_GATE_FIELDS 밖` 1

## Decisions Made

- 되돌림 기준 헬퍼를 따로 두지 않고 `revertToggle` · `reshow` 두 자리가 `server != null ? baseNow() : …` 를 읽는다(플랜 수용 기준 `revertToggle` 안 `baseNow()` · key_link 패턴과 맞춤 — 기준 식은 전송 조립과 같은 `baseNow()` 하나).
- 주 필드 선 · 동반 안 선 경우 동반 스위치에 실패 말풍선을 따로 붙이지 않는다 — 플랜 결정 기록(24-24 사용자 확인) 그대로. 자동 동반은 사람이 직접 누른 값이 아니고 화면 값이 서버와 같다.

## Deviations from Plan

None - plan executed exactly as written.

(참고: Task 2 「꺼낼 때 막힘」 케이스는 플랜 예시의 `sellEnabled` 단독 대신 「선매수 켬 + 마스터 동반」으로 조건을 만들었다 — 불리언 주 필드 단독은 서버가 이미 그 값이면 꺼낼 때 no-op 성공이 되어 막힘 조건이 서지 않는다. 플랜이 허용한 테스트 전용 `armBlockOf` 를 썼고, 누른 순간 값(마스터 OFF)과 서버 값(ON)이 다른 조건으로 확인한다.)

## Issues Encountered

None

## Known Stubs

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 갭 클로징 2라운드 다음 플랜(24-20~) 준비됨. GC-WR-03(D-02 전반 끄는 방향 동반을 함수로)은 이 플랜 범위 밖 — 별도 플랜 소관.
- 배포 없음(커밋만) — webapp push 는 relay 배포 순서를 따른다.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/lc/use-lc-field-commit.ts · use-lc-field-commit.test.tsx · limit-chaser-form.test.tsx
- FOUND: 7c282617 · 8b1521dd (`git rev-list --count 7f6b935e..HEAD` = 2)

---
*Phase: 24-limitchaser-buy3*
*Completed: 2026-09-28*
