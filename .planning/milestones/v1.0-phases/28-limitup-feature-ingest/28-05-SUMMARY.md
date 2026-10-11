---
phase: 28-limitup-feature-ingest
plan: 05
subsystem: relay · webapp (작업대 상따 카드 85 수명)
tags: [relay, websocket, limit-feature, msgtype-85, snapshot, react, reducer, playwright]
status: complete

requires:
  - phase: 28-limitup-feature-ingest
    provides: "28-01 hub #limitFeatures 키 캐시 · getLimitFeature · FULL 전용 limit.feature 팬아웃 · 웹 limitFeatures 스토어 · 카드 level full 게이트"
provides:
  - "relay #sendLimitFeatureSnapshot — 새 키 full 구독 · price→full 승격 직후 q → tape → 85 스냅샷(price 소켓 제외)"
  - "웹 리듀서 액션 limit-feature.drop — 탭 안 full 소비자 0(접기 강등 · 해제)이면 그 키의 85 삭제"
  - "e2e P28-1b — 접었다 펼친 카드가 새 게이트웨이 85 없이 스냅샷으로 즉시 복원"
affects: [28-07, 28-09, 28-11, 28-14]

plan_head_before: 1f66340d5cf9a4ae7111ed4a5ece25a85315d89e
actuals:
  tokens: 5100    # chars/4 over the added diff lines (20,452 chars · 7 files · +397/-5)
  tasks: 2
  commits: 2      # MEASURED rev-list 1f66340d..HEAD

tech-stack:
  added: []
  patterns:
    - "FULL 전용 캐시 스냅샷은 tape 스냅샷 바로 뒤 같은 블록에서 — 새 키 full · 승격 두 자리 모두 q → tape → 85"
    - "탭 스토어의 FULL 전용 값은 full 참조계수 0 시점에 지운다 — level 게이트(표시)와 스토어 드롭(데이터) 이중 보장"

key-files:
  created: []
  modified:
    - relay/src/ws/fanout.ts
    - relay/tests/fanout.test.ts
    - relay/tests/hub.test.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts

key-decisions:
  - "85 스냅샷은 hub 캐시 프레임을 그대로 보낸다(snap 표식 없음) — 85 는 키별 통째 교체라 스냅샷과 증분이 구분될 필요가 없다"
  - "드롭은 unsubscribe 의 `entry[level] -= 1` 직후 한 줄 — 강등 · 완전 해제 두 경로를 한 조건(level full && full 0)으로 덮는다"
  - "P28-1b 는 플랜의 43초 복원에 더해 「접힌 동안 온 50초가 펼칠 때 스냅샷으로」 를 단언한다 — 얼린 스토어 값이 아니라 relay 캐시 최신값임을 증명"

patterns-established:
  - "e2e 음성 대조: 스냅샷 호출을 잠시 지우면 P28-1b 가 「상한가」(접미 없음)로 실패하는지 확인한 뒤 되돌린다"

requirements-completed: [D-05, D-23]

coverage:
  - id: D1
    description: "새 키 full 구독 · price→full 승격 직후 hub 캐시 85 를 q → tape → 85 순서로 1프레임 — price 소켓 · 강등 · 캐시 없음 · 해제 뒤 늦은 85 는 0"
    requirement: D-23
    verification:
      - kind: unit
        ref: "relay/tests/fanout.test.ts#Phase 28 85 스냅샷 (D-23) LS1~LS6"
        status: pass
      - kind: unit
        ref: "relay/tests/hub.test.ts#linger 0 해제 → 늦은 85 → 재구독: 캐시는 되살아나지 않는다 — 재구독 스냅샷 원천 없음 (28-05 D-23)"
        status: pass
    human_judgment: false
  - id: D2
    description: "웹 얼린 값 방지 — full 소비자 0 이면 limitFeatures 에서 키 삭제, 다른 full 소비자가 있으면 유지, price · 다른 키 해제 무관"
    requirement: D-05
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#Phase 28 limit-feature.drop D1~D5"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-card.test.tsx#Phase 28 접힌 카드의 85 (2건)"
        status: pass
    human_judgment: false
  - id: D3
    description: "접었다 펼친 카드 — 새 85 없이 「상한가 · 잠김 43초」 복원 · 접힌 동안 헤더 「잠김」 없음 · 접힌 동안 온 50초가 펼칠 때 스냅샷으로"
    requirement: D-23
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P28-1b 접었다 펼친 카드 — 스냅샷 즉시 · 얼린 값 없음"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-10-05
---

# Phase 28 Plan 05: 85 스냅샷 · 얼린 값 방지 Summary

**relay 는 새 키 FULL 구독 · price→full 승격 직후 hub 캐시의 마지막 85 를 q → tape → 85 순서로 즉시 내려 조용한 키도 펼치는 즉시 채우고, 웹은 탭 안 full 소비자가 0 이 되는 순간 스토어 키를 지워 접은 카드에 옛 「잠김 43초」 가 남지 않는다(Playwright P28-1b green · 스냅샷을 빼면 실패하는 음성 대조 확인)**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-10-05T09:02:09Z
- **Completed:** 2026-10-05T09:12:16Z
- **Tasks:** 2/2
- **Files modified:** 7 (신규 0 · 수정 7)

## Accomplishments

- relay `#sendLimitFeatureSnapshot(conn, isin, ex)` — `getLimitFeature` 가 있으면 `#send` 1프레임. 새 키 분기의 `if (lv === "full")` 를 블록으로 바꿔 tape 다음에 부르고, 승격 블록도 tape 다음에 부른다(주석 「q → tape → 85」). price 소켓 · 강등은 부르지 않는다.
- 웹 `RelayAction` 에 `{ type: "limit-feature.drop"; key }` · 리듀서는 키가 없으면 같은 state(참조 불변), 있으면 Map 복사 후 delete. `unsubscribe` 에서 `level === "full" && entry.full === 0` 이면 dispatch — 접기(price 먼저 잡고 full 놓기)와 완전 해제 모두.
- e2e P28-1b — 85(43초) → 접기(트리거 접미 0 · 헤더 「잠김」 없음) → 펼치기(새 85 없이 「상한가 · 잠김 43초」) → 다시 접고 50초 85 → 접힌 동안 접미 0 → 펼치기 「상한가 · 잠김 50초」.

## Task Commits

1. **Task 1: relay 85 스냅샷** — `33e4b408` (feat)
2. **Task 2: 웹 얼린 값 방지 · e2e P28-1b** — `a8e30281` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## 스냅샷 순서 테스트

| 테스트 | 단언 |
|---|---|
| LS1 캐시된 키를 새 소켓이 full 로 sub | q → tape → limit.feature 1프레임 · 값 = hub 캐시 |
| LS2 같은 키를 새 소켓이 price 로 sub | q 만 · limit.feature 0 · tape 0 |
| LS3 price → full 승격 | q → tape → limit.feature 1프레임 · 마지막 값(44초) |
| LS4 full → price 강등 | 스냅샷 없음 · 이후 85 증분 0 |
| LS5 캐시 없는 키 full sub | limit.feature 0 |
| LS6 해제 · linger 만료 뒤 늦은 85 → 재구독 | limit.feature 0 · 캐시 없음 |
| hub 「linger 0 해제 → 늦은 85 → 재구독」 | getLimitFeature undefined · 다음 85 에 채워짐 |

## TDD

- **Task 1 RED:** LS1 · LS3 · LS4 가 `조건이 서지 않았습니다: B 85 스냅샷 / 승격 85 스냅샷 / B full 85 스냅샷` 로 실패(대상 동작 대기에서 실패한 유효 RED). LS2 · LS5 · LS6 · hub 는 음성 단언이라 구현 전에도 통과.
- **Task 1 GREEN:** 스냅샷 메서드 + 두 호출 → 14 passed(`-t "Phase 28"`).
- **Task 2 RED:** D1 · D2 · D4 · D5 가 `expected true to be false` / `expected {…} to be undefined` 로 실패(유효 RED). D3(유지)는 구현 전에도 통과.
- **Task 2 GREEN:** 액션 · 리듀서 case · dispatch 한 줄 → 137 passed.
- strategy-card 의 접힘 테스트 2건은 28-01 의 level 게이트가 이미 만족해 처음부터 통과 — 28-01 SUMMARY D5 가 「단위 테스트로 직접 잡지 않았다」 고 남긴 공백을 닫는 회귀 잠금이다.
- REFACTOR 없음. 플랜이 태스크당 한 커밋을 지정해 RED 를 별도 `test(...)` 커밋으로 남기지 않았다(plan `type: execute`).

## Decisions Made

- 스냅샷은 hub 캐시 프레임 그대로 — `limit.feature` 는 키별 통째 교체라 웹 `applyMarketFrames` 가 스냅샷 · 증분을 구분할 필요가 없다.
- 드롭 뒤 이미 날아오던 85 가 한 번 더 스토어에 들어올 수 있음을 주석으로 남겼다 — 접힌 카드는 level 게이트로 쓰지 않고, 다시 펼치면 승격 스냅샷이 즉시 덮는다.

## Deviations from Plan

### 플랜보다 강한 검증 (범위 확장 아님)

**1. P28-1b 에 「접힌 동안 온 85 가 펼칠 때 스냅샷으로」 단계 추가**
- **이유:** 43초 복원만으로는 「스토어에 남은 값」 과 「relay 스냅샷」 을 e2e 가 구분하지 못한다. 접힌 동안 50초를 밀고 펼칠 때 50초가 서면 브라우저가 가질 수 없던 값이므로 relay 캐시 스냅샷임이 증명된다.
- **추가 확인:** 승격 스냅샷 호출을 잠시 지우고 P28-1b 를 돌리면 `Expected "상한가 · 잠김 43초" / Received "상한가"` 로 실패 → 되돌림(커밋 무변경).
- **Commit:** `a8e30281`

---

**Total deviations:** 0 auto-fixed · 검증 강화 1
**Impact on plan:** 없음.

## Issues Encountered

- pre-commit 의 보호 브랜치 단언(master)은 28-01 과 같은 이유(프로젝트 규칙 「작업은 master 에서」 · 디스패치 「branch master · normal commits」)로 적용하지 않았다.
- 배포 없음 — relay 변경은 28-14/15 메인 세션 배포 대상.

## Verification

- relay: shared build → `typecheck` · `typecheck:tests` 0 오류 → `-t "Phase 28"` 14 passed → 전체 **36 files · 1007 passed**.
- webapp: `typecheck`(e2e tsconfig 포함) 0 오류 · 대상 2파일 159 passed · 전체 단위 **141 files · 3348 passed · 1 skipped**.
- e2e: `-g "P28-1"` **P28-1 · P28-1b passed**(setup 포함 3 passed) · `trading-workbench.spec.ts` 전체 **75 passed**.
- 음성 대조: 승격 스냅샷 제거 시 P28-1b 실패 확인 후 복원.
- Supabase 무접촉(스키마 푸시 해당 없음).

## Known Stubs

없음 — 이 플랜이 만든 스텁은 없다(28-01 의 `limitFeatureCells` 칸 4~9 · `isStale` 은 28-07 몫 그대로).

## User Setup Required

None - 외부 서비스 설정 없음.

## Next Phase Readiness

- 28-07 은 카드 탭 9칸 · 접속 끊김 표기(`isStale`)를 채운다. 스냅샷 · 드롭 수명은 이 플랜으로 닫혔다.
- 실 85 는 gh-trade 서버 Phase 27 배포 뒤에만 온다 — 장중 「조용한 키 펼치기 즉시 채움」 실데이터 확인은 28-14/15 배포 뒤 수동 항목.

---
*Phase: 28-limitup-feature-ingest*
*Completed: 2026-10-05*

## Self-Check: PASSED
