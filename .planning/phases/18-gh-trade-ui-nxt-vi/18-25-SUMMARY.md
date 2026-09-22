---
phase: 18-gh-trade-ui-nxt-vi
plan: 25
subsystem: relay
tags: [relay, order-matching, narrowPending, request-kind, gap-closure, tdd]
status: complete
gap_closure: true

requires:
  - phase: 18-gh-trade-ui-nxt-vi (18-19 · 18-23)
    provides: "narrowPending 요청 종류 축(WR-03) · PendingOrder.kind · 통보 requestKind 파싱"
provides:
  - "narrowPending 요청 종류 축 = wire requestKind 정본 + 통보 종류별 허용 집합 맵(ANSWERABLE_KINDS_BY_NOTICE_TYPE)"
  - "축 전멸 warn 신규 필드 kindAxis · kindConflict"
  - "PendingOrder.refersOrg (isCancel 개명)"
  - "회귀 ㊸ · narrowPending WR-03 (f)(g)(h)(i)"
affects: [18-32 (relay 배포 순서 기록), 웹앱 정정 폼 「결과 모름」 잠금]

actuals:
  tokens: 8015
  tasks: 2
  commits: 3
plan_head_before: d6f9627a95993f2c858402479bb84f27e1277aa5

tech-stack:
  added: []
  patterns:
    - "요청 종류 축은 정본 한 값(wire 우선 → 비었을 때만 통보 종류 휴리스틱) + 통보 종류별 허용 집합으로 모순 판정 — AND 두 축을 쓰지 않는다"

key-files:
  created: []
  modified:
    - relay/src/ws/order-handler.ts
    - relay/tests/ws-order.test.ts
    - relay/src/dma/envelope.ts
    - relay/src/order/notice-status.ts

key-decisions:
  - "wire requestKind(화이트리스트)가 요청 종류의 정본이다 — 통보 종류 → 요청 종류(E→신규)는 wire 가 비었을 때(구 서버)만 쓰는 휴리스틱으로 강등 (GC-WR-01)"
  - "통보 종류별 답일 수 있는 요청 종류 집합 C→{C} · M→{M} · E→{N,M}; 그 밖의 wire 값은 모순으로 0건 정산 (C+Modify · M+Cancel · E+Cancel)"
  - "원주문 참조 플래그 isCancel → refersOrg 개명, 로그 필드 이름(cancelNoticeApplied 등)은 운영 판독 규칙 때문에 유지"

patterns-established:
  - "모순 판정은 허용 집합 맵 하나만 읽는다 — 통보 종류마다 리터럴을 흩지 않는다"

requirements-completed: [TRADE-07]

duration: 8min
completed: 2026-09-22
---

# Phase 18 Plan 25: relay 통보 요청 종류 축 wire 정본화 Summary

**정정된 주문의 체결 통보(E + 원주문번호 + `requestKind:"Modify"`)가 정정확인보다 먼저 와도 정정 대기를 정산하도록 `narrowPending` 요청 종류 축을 「wire 정본 + 통보 종류별 허용 집합」으로 교체했고, 모순 통보(C+Modify · M+Cancel · E+Cancel)는 여전히 0건이다. 원주문 참조 플래그는 `refersOrg` 로 개명.**

## Performance

- **Duration:** 약 8분
- **Completed:** 2026-09-22
- **Tasks:** 2 (tracer 1 + auto 1)
- **Files modified:** 4

## Accomplishments

- GC-WR-01 해결: 18-19 가 AND 로 건 「통보 종류(E→N) ∧ wire requestKind」 규칙을 「축 = wire 값(화이트리스트) → 없으면 통보 종류 휴리스틱」 + 「wire 값이 통보 종류의 허용 집합 밖이면 모순 → 0건」으로 교체.
- 축 전멸 warn 에 `kindAxis`(최종 축 기호) · `kindConflict`(모순 여부) 추가. 기존 필드(`cancelNoticeApplied` · `noticeTypeKind` · `requestKind` · `kindAxisApplied` 등) 이름은 그대로, 주문번호·계좌 원문 없음(T-16-45).
- GC-IN-01 relay 몫: `PendingOrder.isCancel` → `refersOrg`, 지역 변수 `isCancelNotice` → `refersOrgNotice`, 「이름은 Phase 16 의 것을 유지한다」 자기 고백 문단 삭제. 본문 주석 두 곳의 `const side = isCancel ? …` 인용을 실제 코드(`msg.t === "order.cancel" ? "S" : msg.side`)로 정정.
- `envelope.ts` 머리 주석: 정정은 Phase 18 D-21 로 열렸고 시장가·IOC/FOK 만 봉쇄라고 분리. `notice-status.ts` `"M"` 주석: 자기 정정 또는 세션 합류한 다른 단말 정정의 결과.

## RED/GREEN 표 (수정 전 코드 = 9a5857a 테스트 + d6f9627 구현)

| 케이스 | 입력 | 기대 | 수정 전 | 수정 후 |
|--------|------|------|---------|---------|
| ㊸ (ws) | 정정 10@71000 송신 → E(org X, Modify, orderNo Y, 4주) 첫 통보 | order.result rid-m `partially_filled` · orderNo Y · 정정 행 갱신 `partially_filled`/filledQty 4 | **RED** — `조건이 서지 않았습니다: 정정 체결 order.result` (통보는 「대기·행 어디에도 붙지 않는 수동 통보」로 떨어짐) | GREEN |
| (f) | [정정 대기] + E(org X, Modify) | 정정 대기 | **RED** — `expected null to be { rid: 'modify', … }` | GREEN |
| (g) | [취소, 정정] + C(org X, Modify) | null (모순) | GREEN (회귀 가드) | GREEN |
| (h) | [취소] + E(org X, Cancel) | null (모순) | GREEN (회귀 가드) | GREEN |
| (i) | [신규, 정정] + A(org "", New) | 신규 대기 | GREEN (회귀 가드) | GREEN |

수정 전 전체: `Tests 2 failed | 519 passed (521)` → 수정 후 `Tests 521 passed (521)`. 기존 WR-03 (a)~(e) · ㊷ · ㉟ · (d)(E + 빈 requestKind → null) 무수정 green.

## Task Commits

1. **Task 1 RED: 회귀 ㊸ · (f)~(i)** - `9a5857a` (test)
2. **Task 1 GREEN: 요청 종류 축 wire 정본화** - `b39b049` (fix)
3. **Task 2: refersOrg 개명 · 옛 주석 3곳 정정** - `8a7afd9` (refactor)

## TDD Gate Compliance

- RED `9a5857a` (test) — ㊸ · (f) 실패 확인 후 커밋.
- GREEN `b39b049` (fix) — 521/521.
- REFACTOR `8a7afd9` — 개명·주석만, 521/521 유지.
- Tracer 게이트: GREEN 직후 `<verify>`(relay 전량 + typecheck + typecheck:tests) 재실행 통과 후 Task 2 로 확장.

## Verification

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay test` → 20 files / 521 passed (18-23 기준선 516 + 18-24 이후 누적 ≥ 516, 이번 신규 5)
- `pnpm --filter @gh-radar/relay run typecheck` · `typecheck:tests` → `error TS` 0
- `grep -rn "isCancel\b" relay/src relay/tests | grep -v isCancelNotice | wc -l` → 0
- `grep -n "Map<string, ReadonlySet" relay/src/ws/order-handler.ts` → 1줄
- `grep -n "v1 이 만들지 않지만" relay/src/order/notice-status.ts` → 없음
- Task 1 RED 커밋의 테스트 diff: `81 insertions, 0 deletions` (기존 `it(` 본문 삭제 0). Task 2 의 테스트 변경은 플랜이 요구한 픽스처·인자 개명(`isCancel` → `refersOrg`)뿐.

## Deviations from Plan

None - 플랜대로 실행. (참고: `pnpm --filter @gh-radar/relay test -- ws-order` 는 vitest 에 필터가 전달되지 않아 전량을 돌린다 — 판정에는 영향 없음.)

## Threat Model 대응

- T-18-106: ㊸ 이 E(Modify) 첫 통보의 정정 정산을 고정.
- T-18-107: (g)(h) 가 C+Modify · E+Cancel 모순 0건을 고정. 원주문번호 · 취소성 통보 하드 필터 무변경(refine 으로 약화하지 않음).
- T-18-108: 새 warn 필드는 종류 기호·불리언뿐.
- relay 배포 안 함(18-32 가 순서 기록).

## Next Phase Readiness

- relay 코드 변경은 배포 대기 — 18-32 최종 게이트에서 배포 순서와 함께 사람이 실행.

## Self-Check: PASSED

- FOUND: relay/src/ws/order-handler.ts · relay/tests/ws-order.test.ts · relay/src/dma/envelope.ts · relay/src/order/notice-status.ts
- FOUND commits: 9a5857a · b39b049 · 8a7afd9
