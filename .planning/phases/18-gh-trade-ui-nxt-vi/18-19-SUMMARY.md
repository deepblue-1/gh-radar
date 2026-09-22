---
phase: 18-gh-trade-ui-nxt-vi
plan: 19
subsystem: trading-order
status: complete
tags: [gap-closure, TRADE-07, relay, order-matching, WR-03]
gap_closure: true
requires:
  - 18-14
provides:
  - "PendingOrder.kind (N/M/C) — 요청 종류 원문, 대기 등록 시 handle 의 kind 그대로"
  - "narrowPending 요청 종류 하드 필터 — 통보 종류 C→취소 · M→정정 · E→신규 대기만, requestKind New/Modify/Cancel 도 하드 필터 (둘 다 화이트리스트)"
  - "축 전멸 warn 로그 필드 afterCancelNotice · kindAxisApplied · noticeTypeKind · requestKind (종류 기호만, 원문 없음)"
  - "ws-order.test.ts describe 「WR-03 — 취소·정정 대기의 요청 종류」 (a)~(e) + ws 케이스 ㊷ (f)"
affects:
  - 18-REVIEW WR-03 종결 근거
  - 18-VERIFICATION TRADE-07 advisory 「리뷰 인용만」 → 재현·수정 완료
tech-stack:
  added: []
  patterns:
    - "요청 종류는 kind 가 정본, isCancel 은 「원주문 참조 여부」 — 이름·의미 무변경"
    - "통보가 실어 온 강한 축만 하드 필터 (GC-CR-01) — 통보 종류·requestKind 매핑은 화이트리스트, 빈 값·모르는 값은 축 미적용"
key-files:
  created: []
  modified:
    - relay/src/ws/order-handler.ts
    - relay/tests/ws-order.test.ts
key-decisions:
  - "WR-03 은 실재한다 — 수정 전 코드로 재현 6건 전부 RED. ws 경로에서는 취소확인이 정정 요청(rid-m)을 cancelled 로 정산하는 교차 오정산이 실측됐다"
  - "요청 종류 축은 하드 필터: 통보 종류 C→kind C · M→kind M · E→kind N, requestKind New/Modify/Cancel→N/M/C. 접수(A)·거부(R)·빈 값·모르는 값은 축 미적용 (A 는 정정·취소 접수에도 오므로)"
  - "통보 종류와 requestKind 가 서로 다른 종류를 말하면 후보 0건 → 정산하지 않음 (모순 통보로 정산 금지, GC-CR-01)"
  - "알고 받아들인 경계: 원주문번호를 실어 온 체결(E)은 이제 정정·취소 대기를 정산하지 않는다 — 대기는 첫 통보(A/M/C)로 정산되므로 체결이 첫 통보인 정정은 timeout 으로 남는다"
requirements-completed: [TRADE-07]
metrics:
  duration: "약 12분"
  completed: 2026-09-22
  tasks: 2
  files: 2
actuals:
  tokens: 5000
  tasks: 2
  commits: 2
plan_head_before: b0d68c5e569a52b5a3ef75cbe795b88ae9e14784
coverage:
  - deliverable: "WR-03 수정 전 재현 판정 (a)~(f)"
    human_judgment: false
    verification:
      - kind: test
        ref: "relay/tests/ws-order.test.ts#WR-03 — 취소·정정 대기의 요청 종류 (commit 1746209 에서 6 failed 실측)"
        status: pass
  - deliverable: "PendingOrder.kind + narrowPending 요청 종류 하드 필터"
    human_judgment: false
    verification:
      - kind: test
        ref: "pnpm --filter @gh-radar/relay run test (516 passed) · typecheck · typecheck:tests"
        status: pass
---

# Phase 18 Plan 19: WR-03 취소·정정 대기 요청 종류 축 Summary

**같은 원주문의 취소·정정 대기가 서로의 통보로 정산되던 결함(WR-03)을 수정 전 코드로 6/6 재현한 뒤, `PendingOrder.kind` 와 통보 종류·`requestKind` 하드 필터로 닫았다. 취소확인은 취소 대기만, 정정확인은 정정 대기만, 체결은 신규 대기만 정산한다.**

## Performance

- **Duration:** 약 12분
- **Started:** 2026-09-22T07:07Z (epoch 1790060836)
- **Completed:** 2026-09-22
- **Tasks:** 2
- **Files modified:** 2

## WR-03 재현 판정 — 수정 전 코드 (commit 1746209 시점, `order-handler.ts` 무변경)

실행: `cd relay && npx vitest run tests/ws-order.test.ts` → `Tests  6 failed | 52 passed (58)`

| 케이스 | 조건 | 기대 | 수정 전 실제 | 판정 |
|--------|------|------|--------------|------|
| (a) | 취소(10·70,000)+정정(10·70,000) · 통보 C(X·10·70,000) | 취소 대기 | `null` — 좁히지 못함 → 둘 다 timeout | **RED (재현됨)** |
| (b) | (a) 두 대기 · 통보 M(X·10·70,000) | 정정 대기 | `null` — 둘 다 timeout | **RED (재현됨)** |
| (c) | 취소(10·70,000)+정정(10·71,000) · 통보 C(X·10·71,000) | 취소 대기 | **정정 대기** — 교차 오정산 | **RED (재현됨)** |
| (d) | 정정 대기 1건 · 통보 E(원주문번호 "" · requestKind "") | `null` | **정정 대기** — 원주문 체결이 정정 요청을 정산 | **RED (재현됨)** |
| (e) | 취소+정정 · 통보 A(X · requestKind "Cancel" / "Modify") | 취소 / 정정 | `null` — requestKind 미사용 | **RED (재현됨)** |
| (f) ws ㊷ | `order.cancel`(10·70,000) 후 `order.modify`(10·71,000) · C 통보(10·71,000) | rid-c `cancelled` | **rid-m `cancelled`** | **RED (재현됨)** |

(f) 원문 출력:

```
AssertionError: expected { t: 'order.result', …(5) } to match object { rid: 'rid-c', …(2) }
  {
    "orderNo": "0000012399",
-   "rid": "rid-c",
+   "rid": "rid-m",
    "status": "cancelled",
  }
```

**결론: WR-03 은 실재한다.** 실 ws 경로에서 살아 있는 정정 주문이 「취소됨」으로 브라우저에 가고 감사 행도 정정 행에 `cancelled` 가 붙는다. 리뷰가 적지 않은 변형 (d)(원주문 체결이 정정 대기 1건을 정산)도 재현됐다. → Task 2 실행.

## Accomplishments

- `PendingOrder.kind: OrderType` 추가, 대기 등록에서 `handle` 의 `kind` 를 그대로 싣는다. `isCancel` 은 이름·의미 무변경(주석에 「요청 종류는 `kind` 가 정본」 명시).
- `narrowPending` 하드 필터 단계에 요청 종류 축: `REQUEST_KIND_BY_NOTICE_TYPE`(C→C · M→M · E→N) · `REQUEST_KIND_BY_WIRE`(New→N · Modify→M · Cancel→C). 둘 다 화이트리스트라 빈 값(구 서버)·모르는 값은 축을 건너뛴다. 결과 0건이면 기존 전용 warn 경로로 간다.
- warn 로그에 `afterCancelNotice` · `kindAxisApplied` · `noticeTypeKind` · `requestKind`(종류 기호만) 추가 — 원인 축이 셋 중 무엇인지 로그로 갈린다. 주문번호·계좌 원문 없음(㉝ green).
- 수정 후: WR-03 6케이스 전부 green, relay 전량 20 files / 516 passed (18-17 완료 시점 510 + 신규 6), `typecheck` · `typecheck:tests` 통과.

## Task Commits

1. **Task 1: WR-03 재현 테스트 (RED)** — `1746209` (test)
2. **Task 2: PendingOrder.kind + 하드 필터 (GREEN)** — `96ab51c` (fix)

## Files Created/Modified

- `relay/src/ws/order-handler.ts` — `PendingOrder.kind`, 대기 등록 `kind`, 요청 종류 매핑 2종, `narrowPending` 하드 필터, warn 로그 필드
- `relay/tests/ws-order.test.ts` — WR-03 (a)~(e) describe, ws ㊷ (f), `mkPending` 기본 `kind: "N"`, 기존 취소 픽스처 `kind: "C"`

## Decisions Made

frontmatter `key-decisions` 참조. 핵심: 접수("A")는 정정·취소 접수에도 오므로 통보 종류 축에서 빠진다 — 그 경우는 원주문번호 축과 `requestKind` 가 가른다.

## Deviations from Plan

### 기존 케이스 픽스처 1건 조정 (기대값 무수정)

- **Found during:** Task 2
- **케이스:** 「②-1 매매구분 축은 취소·정정·거부 통보에 적용되지 않는다 (Pitfall 8)」의 정정확인 단언
- **Issue:** 이 단언은 **취소 대기 픽스처**(`isCancel:true` — 당시엔 취소·정정 구분이 없었다)에 정정확인("M")을 보내 그 대기가 정산되기를 기대했다. 픽스처에 `kind: "C"` 를 명시하자 새 축이 이를 막았다 — 그런데 「정정확인이 취소 대기를 정산」은 바로 WR-03 이 금지하는 교차 정산(truth #2)이지 정상 정산이 아니다. 실제 relay 에서 정정확인의 짝은 언제나 `kind: "M"` 대기다.
- **Fix:** 그 단언만 정정 대기 픽스처(`kind: "M"`)로 세웠다. 기대값의 의미(「매수 신규 대기가 아니라 원주문 참조 대기가 정산된다 — `sideTrusted:false` 라 ②-1 축 미적용」)와 `toBe(<그 대기>)` 형태는 그대로다. 이 케이스의 목적(Pitfall 8, 매매구분 축 미적용)도 그대로 시험된다.
- **판단:** 플랜의 「바꿔야 green 이 되는 기존 케이스 = 새 축이 정상 정산을 막는 신호」에 해당하지 않는다고 판단 — 막힌 것은 정상 정산이 아니라 교차 정산이다. ws 수준 정정 케이스 ㉟(실제 핸들러 경로, 정정확인 → 정정 대기)는 무수정 green.
- **Commit:** 96ab51c

### 기타

- prettier 를 한 번 돌렸다가 저장소가 prettier 포맷이 아니어서 대량 재포맷이 생겨 즉시 되돌리고(커밋 전) 수기 편집으로 다시 적용했다. 커밋된 diff 에 영향 없음.

**Total deviations:** 1 (테스트 픽스처 kind 정합, 기대값 무수정). **Impact:** 없음 — 실 정산 경로의 정상 케이스(㉟ · ⑳ · ㉜ · ㊵ 등 ws 케이스) 전부 무수정 green.

## Issues Encountered

- 알고 받아들인 경계(key-decisions): 원주문번호를 실어 오는 체결("E")이 첫 통보인 정정은 이제 정산되지 않고 timeout 으로 남는다. 대기는 첫 통보로 정산되고 정정·취소는 접수(A) 또는 확인(M/C)이 먼저 오므로 현실 경로에서는 드물다고 보지만, 실계좌에서 정정 timeout 이 관측되면 warn 로그의 `noticeTypeKind: "N"` 으로 이 경로인지 바로 갈린다.

## User Setup Required

None.

## Next Phase Readiness

WR-03 종결. relay 배포는 이 플랜 범위 밖(오케스트레이터 지시 — push·배포 없음).

## Self-Check: PASSED

- FOUND: relay/src/ws/order-handler.ts (`kind: OrderType` 필드 · 등록 `kind,` · 매핑 2종)
- FOUND: relay/tests/ws-order.test.ts (`grep -c WR-03` = 14, (a)~(f) 6케이스)
- FOUND: 1746209, 96ab51c
- `git rev-list --count b0d68c5..HEAD` = 2
