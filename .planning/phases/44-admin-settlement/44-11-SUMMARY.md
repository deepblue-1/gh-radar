---
phase: 44-admin-settlement
plan: 11
subsystem: ui
tags: [webapp, settlement, admin-sheet, settle, cancel, vitest, tdd]

requires:
  - phase: 44-02
    provides: shared settlePlan · poolAccountRows · addEffects · reflectEffect · appliedEffect · effectDiff · isSettlementMarketHours · 포매터
  - phase: 44-06
    provides: AccountTable(compact · readLine · mismatch) · PersonDot
  - phase: 44-07
    provides: ReflectBox · reflectPreviewLines · SettleConfirm · cancelConfirmText · CONFIRM_TEXT
  - phase: 44-08
    provides: server POST /settles · /settles/:id/cancel · 오류 코드(REVERT_UNREADABLE 409 · unreverted 200)
  - phase: 44-09
    provides: ActivityCard onCancelSettle 자리 · SettleRow isLatest · 정산 기록 세그먼트 · 펼침 Set
  - phase: 44-10
    provides: confirmSettlement · cancelSettlement · 머리 「거래 기록」 · 지우기 확인 상태 꼴
provides:
  - webapp SettleSheet(⑧ 정산하기 시트) · SETTLE_SHEET_TEXT
  - settlement-client 머리 「정산하기」 · 열 때 다시 읽기 · 확정 뒤 「정산 기록」 + 새 줄 펼침 · ⑨ 정산 취소(D-30 두 갈래)
affects: [44-12, 44-13]

actuals:
  tokens: 17700
  tasks: 2
  commits: 4
plan_head_before: bd688dca29d98b7243f2fe7e69c564d722cbaae1
plan_head_after: 3b5e88522e26ae602113efab9620c44e51c57172

tech-stack:
  added: []
  patterns:
    - "시트 처음 값 맞추기 = 렌더 중 「이전 open」 비교 — 열릴 때만 처음 값 · view 가 바뀌는 것으로는 돌리지 않는다(열린 채 다시 읽기 · 선택 유지)"
    - "정산 시트의 모든 숫자는 props view 에서 매 렌더 settlePlan 한 줄로 — 화면 상태는 pool · outs · reflect · memo 뿐"

key-files:
  created:
    - webapp/src/components/settlement/settle-sheet.tsx
    - webapp/src/components/settlement/__tests__/settle-sheet.test.tsx
    - webapp/src/components/settlement/__tests__/settlement-client-settle.test.tsx
  modified:
    - webapp/src/components/settlement/settlement-client.tsx

key-decisions:
  - "쥬니 정산 전 수익이 정확히 0 이면(shared block carry · carryKrw 0) 확정 불가 문단을 「나눌 수익이 없습니다.」 로 — 「원금 4억까지 0 남았습니다」 는 뜻이 없다"
  - "확정 바디 outs 는 사람이 고른 그대로(묶음 비율 순서로 정렬) · reflect 는 바로 출금을 하나라도 골랐을 때만 스위치 값, 아니면 false"
  - "뺄 계좌 줄 · 반영 상자는 plan.outs(금액이 0 이 아닌 바로 출금 줄)가 있을 때만 — 목업 outRows 와 같다"
  - "읽은 시각 줄 = 그 묶음 계좌 중 값을 가진 계좌의 가장 최근 readAt(응답 now 기준 라벨)"
  - "열 때 다시 읽기 = 부르는 쪽 reload() — 실패하면 seq 가드가 지금 값을 그대로 둔다(화면 오류 상자로 바꾸지 않음)"
  - "정산 취소 확인의 바로 출금 줄은 연 순간 view 에서 떼어 상태에 둔다 — 취소 뒤 다시 불러와도 닫히는 동안 문단이 바뀌지 않게"
  - "정산 묶음 알약은 시트 안 작은 radiogroup 으로 — ledger-sheet 의 PillGroup 은 내보내지 않는 함수라 그 파일(플랜 밖)을 고치지 않았다"

patterns-established:
  - "data-slot: settle-sheet · settle-profit-label · settle-profit · settle-profit-value · settle-profit-unit · settle-market · settle-split · settle-split-label · settle-split-row(data-person) · settle-out · settle-out-accounts · settle-memo · settle-blocked · settle-sheet-error · settle-sheet-cancel · settle-sheet-confirm · settlement-settle-create"

requirements-completed: []

coverage:
  - id: D1
    description: "⑧ 시트 처음 열기 — 묶음 알약 · 라벨 · 큰 숫자(방향색) + 「원」 · 계좌 표 3줄 · 읽은 시각 · 나누기 5 : 5 두 줄(점 · 비율 · 몫 · 알약) · 기간 줄 없음 · 확정 활성"
    verification:
      - kind: unit
        ref: "webapp/src/components/settlement/__tests__/settle-sheet.test.tsx#SettleSheet — 처음 열기(E8 populated)"
        status: pass
    human_judgment: false
  - id: D2
    description: "바로 출금 알약(aria-pressed) · 뺄 계좌 줄(한 사람 · 두 사람) · 반영 상자 기본 켜짐 · 미리 보기 계좌마다 한 줄 · 묶음을 바꾸면 선택 지움"
    verification:
      - kind: unit
        ref: "webapp/src/components/settlement/__tests__/settle-sheet.test.tsx#바로 출금 · 뺄 계좌 · 반영 상자 (2 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "확정 불가 문단 — 쥬니 이월(굵은 금액) · 미설정 · 나눌 수익 없음 · 쥬니 정확히 0 · 정산 확정 비활성 · 메모 · 나누기 없음"
    verification:
      - kind: unit
        ref: "webapp/src/components/settlement/__tests__/settle-sheet.test.tsx#확정할 수 없을 때 (4 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "장중 줄 — 평일 14:32 「체결 중이라 값이 움직이고 있어요」 · 상자 「체결과 겹치면 어긋날 수 있어요」 / 밤 20:40 없음"
    verification:
      - kind: unit
        ref: "webapp/src/components/settlement/__tests__/settle-sheet.test.tsx#장중 줄 (2 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "확정 바디 { pool, outs, memo, reflect, expectPrev } · 확정 중 두 버튼 비활성 · aria-busy · 실패 줄 · expectPrev = 그 묶음 최신 정산 id · 열린 채 view 가 바뀌면 값만 바뀌고 선택 유지 · 다시 열면 처음 값"
    verification:
      - kind: unit
        ref: "webapp/src/components/settlement/__tests__/settle-sheet.test.tsx#「정산 확정」 (5 tests) · 열 때 다시 읽기 (2 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "본문 연결 — 머리 순서 · 첫 불러오기 전 비활성 · 열 때 다시 읽기(새 값 반영 · 실패하면 그대로) · 확정 → 닫힘 · 「정산 기록」 · 새 줄 펼침 · 다시 불러오기 · 확정 실패 줄"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/settlement/__tests__/settlement-client-settle.test.tsx#머리 · 시트 열기 · 확정 (5 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "⑨ 정산 취소 — 문단 · 반영 상자 조건 · 미리 보기 · cancelSettlement(id, reflect) · D-30 unreverted 잠금 + 닫을 때 다시 불러오기 · REVERT_UNREADABLE 두 문장 그대로 · 스위치 끔 → 줄 사라짐 · 그 밖 「정산을 취소하지 못했어요 · X」 · 옛 정산 줄 안내"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/settlement/__tests__/settlement-client-settle.test.tsx#정산 취소 · D-30 (8 tests)"
        status: pass
    human_judgment: false
  - id: D8
    description: "(UI E1 · E8 overflow backstop) 폰 360 · 390 머리 한 줄에 「정산」 + 두 버튼 · 바텀시트(328)에서 계좌 표 최악 줄 · 나누기 줄 한 줄 · 뺄 계좌 줄 줄바꿈 · 다크 면 대비"
    verification: []
    human_judgment: true
    rationale: "시각 배치 — jsdom 은 레이아웃을 재지 않는다. 44-12 e2e · UAT 에서 360 · 390 · 데스크톱 패널로 확인"

duration: 21min
completed: 2026-11-20
status: complete
---

# Phase 44 Plan 11: 정산하기 시트 · 정산 취소 연결 Summary

**shared `settlePlan` 한 줄로 그리는 「정산하기」 시트(묶음 알약 · 정산 전 수익 큰 숫자 · 계좌 표 · 읽은 시각 · 장중 줄 · 나누기 · 바로 출금 · 뺄 계좌 · 반영 상자 · 확정 불가 문단)를 세우고, 머리 「정산하기」 · 열 때 다시 읽기 · 확정 뒤 「정산 기록」 새 줄 펼침 · 가장 최근 정산 「정산 취소」(D-30 두 갈래)를 본문에 끝까지 이었다.**

## Performance

- **Duration:** 약 21분(구현 구간 · 문서 읽기 제외)
- **Started:** 2026-11-20T02:20:00Z
- **Completed:** 2026-11-20T02:41:00Z
- **Tasks:** 2 (SETTLE-SHEET-OK · SETTLE-FLOW-OK 도달)
- **Files modified:** 4 (새 파일 3 · 고친 파일 1)

## Accomplishments

- ⑧ `SettleSheet` — `AdminSheet` 제목 「정산하기」 · 본문 순서 묶음 → 정산 전 수익(24/600 · 방향색 · 「원」 14 `--muted-fg`) + 계좌 표(compact) + 읽은 시각 + 장중 줄 → 나누기 상자 + 뺄 계좌 줄 → 반영 상자 → 메모 / 확정 불가면 문단 상자 하나. 하단 「취소」 · 「정산 확정」 반반 + 그 위 실패 줄.
- 계산은 `settlePlan(pool, ctx, outs)` 한 줄 — 몫 · 바로 출금 금액 · 뺄 계좌 · 확정 가능 여부가 server 확정과 같은 함수에서 나온다. 브라우저가 계산한 수익 · 몫은 server 로 보내지 않는다.
- `settlement-client` — 머리 「거래 기록」 · 「정산하기」, 패널 열림 = 두 시트 중 하나, 열 때 `reload()`, 확정 뒤 흐름, ⑨ 정산 취소 확인과 D-30 두 갈래.

## Task Commits

1. **Task 1: 「정산하기」 시트(⑧)** — RED `06b704f0` (test) → GREEN `15253a5a` (feat)
2. **Task 2: 본문 연결 · 정산 취소** — RED `7b21f415` (test) → GREEN `3b5e8852` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## 시트 상태

| 상태 | 처음(열 때마다) | 바뀌는 때 |
|---|---|---|
| 묶음 `pool` | `p1`(현중 · 근형) | 알약 · 방향키. 바꾸면 `outs = []` |
| 바로 출금 `outs` | 없음 | 알약 토글 · 묶음 비율 순서로 정렬해 둔다 |
| 반영 스위치 `reflect` | 켜짐(D-15) | 상자 스위치 |
| 메모 | 빈 칸 | 한 줄 · 100자 |
| 확정 중 `busy` · 실패 줄 `error` | 없음 | 확정 누름 · 실패 |

- `view` prop 이 열린 채 새 값으로 바뀌면(열 때 다시 읽기) 위 상태는 그대로 두고 큰 숫자 · 표 · 읽은 시각 · 몫 · 미리 보기만 바뀐다. 처음 값으로 돌리는 것은 닫혔다가 열릴 때뿐.
- 확정 중: 두 버튼 비활성 · 「정산 확정」 `aria-busy` · 묶음 알약 클릭 무시 · 바로 출금 알약 · 스위치 비활성 · 메모 `readOnly` · 바깥 닫힘 막음.

## 확정 바디

`onConfirm({ pool, outs, memo, reflect, expectPrev })` → 부르는 쪽이 `confirmSettlement(body)` → `POST /api/admin/settlement/settles`.

| 칸 | 값 |
|---|---|
| `pool` | 고른 묶음 |
| `outs` | 사람이 고른 바로 출금(예 `["H"]`) |
| `memo` | 메모 칸 그대로 |
| `reflect` | 바로 출금을 하나라도 골랐으면 스위치 값 · 아니면 `false` |
| `expectPrev` | `view.settles` 중 그 묶음 가장 큰 id · 없으면 `null` |

## 열 때 다시 읽기

- 「정산하기」 → `setSettleOpen(true)` + `reload()`. 시트는 지금 화면 값으로 바로 열리고, 응답이 오면 `state.view` 가 바뀌어 시트 값이 조용히 바뀐다(깜빡임 · 강조 없음).
- 다시 읽기가 실패하면 `reload` 의 seq 가드가 보이던 값을 그대로 둔다 — 시트는 마지막 값 + 못 읽음 줄로 확정할 수 있다(D-16). 403 이면 화면 전체가 「관리자만 사용할 수 있어요.」 로 바뀐다(기존 동작).

## 취소 흐름(⑨ · D-17 · D-23 · D-30)

| 경우 | 화면 |
|---|---|
| 묶음별 가장 최근 정산 펼침 | 「정산 취소」 단추(44-09 `isLatest`) → 확인 창 문단 `cancelConfirmText(settle, 바로 출금 줄 수, now)` |
| 옛 정산 펼침 | 단추 없음 · 「더 최근 정산부터 차례로 취소할 수 있어요」 |
| 바로 출금 줄이 반영했던 것이 있음(`addEffects(outRows.map(appliedEffect))` 가 비지 않음) | ⑩ 상자 기본 켜짐 · 미리 보기 `effectDiff(그 합, {})` — 예 「교보 김현중 예수금 1억 5,950만 → 6억 8,400만」 |
| 반영한 것이 없음(줄 없음 · reflect false) | 상자 없음 · 늘 `cancelSettlement(id, false)` |
| 성공(`unreverted` 없음) | 창 닫힘 · 다시 불러옴(정산 줄 · 바로 출금 줄이 함께 사라지고 수익이 정산 전 수익으로 돌아감) |
| 미리 막고 안내 — 409 `REVERT_UNREADABLE` | 창 유지 · 오류 줄 = server 문장 그대로(접두 없음) · 「정산 취소」 활성 · 스위치를 바꾸면 줄 사라짐 → 끄고 누르면 `cancelSettlement(id, false)` |
| 취소 뒤 보내기만 실패 — 200 `unreverted` | 창 유지 · 오류 줄 = `message` 그대로 · 「정산 취소」 잠금 · 아직 다시 불러오지 않음 → 「닫기」(Esc · 바깥)로 닫을 때 다시 불러옴 |
| 그 밖 거부(404 · 409 `NOT_LATEST` 등 · 네트워크) | 「정산을 취소하지 못했어요 · <message>」 · 창 유지 · 「정산 취소」 활성 |

## 문구 확인표(UI-SPEC 「문구 정본 — ⑧ · ⑨」)

| 자리 | 화면 글자 | 확인 |
|---|---|---|
| 시트 제목 | 「정산하기」 | 테스트 |
| 묶음 | 「정산 묶음」 · 「현중 · 근형」 · 「쥬니」 | 테스트 |
| 수익 라벨 | 「정산 전 수익 · 확정을 누른 순간의 예수금으로 정해요」 | 테스트 · grep |
| 큰 숫자 | 「+10억 4,900만」 + 「원」 / 「—」 | 테스트 |
| 읽은 시각 | 「예수금 읽은 시각 오늘 14:32」 | 테스트 |
| 장중 | 「체결 중이라 값이 움직이고 있어요」 | 테스트 · grep |
| 나누기 | 「나누기 5 : 5 · 지금 뺄 사람만 「바로 출금」」 · 「김현중」 「50%」 「+5억 2,450만」 「바로 출금」 | 테스트 |
| 뺄 계좌 | 「뺄 계좌 — 김현중 교보 김현중 · 정근형 KB 정근형 · 금액은 만원 미만을 버리고 적어요」 | 테스트 · grep |
| 메모 | 「메모」 | 코드 |
| 확정 불가 | 미설정 「예수금이 설정되지 않은 계좌가 있어요. 계좌 메뉴에서 설정한 뒤 정산할 수 있어요.」 / 이월 「원금 4억까지 **2,800만** 남았습니다. 회복한 뒤부터 4 : 3 : 3 로 나눕니다.」 / 「나눌 수익이 없습니다.」 | 테스트 · grep |
| 하단 | 「취소」 · 「정산 확정」 | 테스트 |
| 확정 실패 | 「정산을 확정하지 못했어요 · <message>」 | 테스트 · grep |
| 머리 | 「거래 기록」 · 「정산하기」 | 테스트 |
| ⑨ 정산 취소 | 「11/19 현중 · 근형 정산 **+10억 4,900만** 을 취소해요. 이 수익은 「정산 전 수익」 으로 돌아가요. 그날 「바로 출금」 1건도 함께 사라져요.」 · 「닫기」 · 「정산 취소」 · 「정산을 취소하지 못했어요 · <message>」 | 테스트 |
| D-30 문장 | server 문장 그대로(접두 없음) — 「… 예수금을 읽지 못해 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 취소해요」 · 「… 0 이하가 되어 …」 · 「… 예수금은 되돌리지 못했어요 — 계좌 메뉴에서 맞춰 주세요」 | 테스트 |

## Files Created/Modified

- `webapp/src/components/settlement/settle-sheet.tsx` — SETTLE_SHEET_TEXT · SettleSheet · PoolPills(새 파일)
- `webapp/src/components/settlement/__tests__/settle-sheet.test.tsx` — 16건(새 파일)
- `webapp/src/components/settlement/__tests__/settlement-client-settle.test.tsx` — 13건(새 파일)
- `webapp/src/components/settlement/settlement-client.tsx` — 머리 「정산하기」 · 시트 · 취소 확인 상태 · 핸들러

## Decisions Made

- 위 frontmatter `key-decisions` 7건. 가장 중요한 것: **쥬니 정산 전 수익이 정확히 0** 일 때 shared 가 `block: "carry"` · `carryKrw: 0` 을 돌려주는데, 시트는 이 경우 「원금 4억까지 0 남았습니다」 대신 「나눌 수익이 없습니다.」 를 보인다(`carryKrw > 0` 일 때만 이월 문장). 확정은 어느 쪽이든 비활성. 테스트 「쥬니 정산 전 수익이 정확히 0」 이 잠근다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 테스트 오류] 나누기 줄 textContent 비교**
- **Found during:** Task 1 GREEN
- **Issue:** RED 때 줄 전체 textContent 를 「김현중 50% +5억 2,450만 바로 출금」 으로 비교했는데, 칸 사이가 flex 간격이라 글자 사이 공백이 없다.
- **Fix:** 줄을 칸(왼쪽 · 몫 · 알약)으로 나눠 「김현중 50% | +5억 2,450만 | 바로 출금」 으로 비교. 구현은 그대로.
- **Committed in:** 15253a5a

**2. [Rule 1 - 테스트 오류] act 경고**
- **Found during:** Task 1 GREEN
- **Issue:** 동기 테스트 셋이 확정 뒤 `busy` 해제를 기다리지 않아 React act 경고가 났다.
- **Fix:** 셋을 async 로 · 확정 단추가 다시 활성이 될 때까지 기다림. 경고 0.
- **Committed in:** 15253a5a

**3. [Rule 3 - RED 증거] 배열 비교가 TAP 보고를 깨뜨림**
- **Found during:** Task 2 RED
- **Issue:** 머리 단추 순서를 배열 `toEqual` 로 비교하자 vitest tap-flat 이 여러 줄 diff 를 내 분류기가 `INVALID_RED(invalid_record)` 로 거부했다.
- **Fix:** 한 줄 문자열(「거래 기록 | 정산하기」) 비교로 바꿔 다시 실행 → `RED_EVIDENCE_OK`. 커밋한 RED 테스트는 고친 쪽.
- **Committed in:** 7b21f415

**4. [작은 판단] 정산 묶음 알약**
- 플랜은 알약 radiogroup 만 정했다. ledger-sheet 의 `PillGroup` 은 내보내지 않는 함수라 그 파일(플랜 `files_modified` 밖)을 고치지 않고 시트 안에 두 알약짜리 `PoolPills`(같은 모양 · 방향키)를 두었다.

---

**Total deviations:** 4 (테스트 오류 2 · RED 증거 1 · 작은 판단 1)
**Impact on plan:** 범위 확대 없음. 바뀐 파일은 플랜 files_modified 4개뿐 · `admin-api.ts` · `admin-sheet.tsx` · `person-cards.tsx` · 44-06 ~ 44-10 부품 손대지 않음.

## 금지 사항 점검

- 브라우저가 계산한 수익 · 몫을 server 로 보내지 않는다 — 확정 바디는 `{ pool, outs, memo, reflect, expectPrev }` 뿐(테스트가 `toEqual` 로 잠금).
- 원 단위 금액을 화면에 보이지 않는다 — 몫 · 큰 숫자 · 미리 보기 · 이월 금액 모두 shared 억 · 만 포매터(`formatEokManSigned` · `formatEokMan` · `formatEokManMinus`).
- 토스트 · `alert()` 창 — 0. `focus-visible:ring-*` 새로 단 곳 — 0.
- 시트 자동 포커스: `AdminSheet` 가 `onOpenAutoFocus` 를 받지 않아(44-10 과 같은 한계) 첫 포커스는 Radix 기본(머리 × 버튼)이다. 공용 골격은 고치지 않았다. ⑨ 정산 취소 확인은 `SettleConfirm` 이 이미 컨테이너 포커스(`preventScroll`)를 한다.
- person-cards 큰 숫자(`totalKrw` vs `stakeKrw`) 열린 질문 — 손대지 않았다.

## TDD Gate Compliance

- Task 1: `test(44-11)` 06b704f0 → `feat(44-11)` 15253a5a — RED 증거 `RED_EVIDENCE_OK`(tap-flat · 16건 모두 실패). 대상 「SettleSheet — 처음 열기(E8 populated) > 검산 응답 → …」 이 `expected '' to be '정산하기'` 로 실패. 의미 판정: `settle-sheet.tsx` 를 null 을 그리는 타입 있는 자리 파일로 함께 커밋해 import 는 풀리고, 대상이 실제로 실행되어 계획한 「시트 제목」 단언에서 떨어졌다 — 수집 · import · 문법 · 픽스처 오류 없음. 다른 테스트의 「element missing」 은 알약이 없어 도우미가 던진 한 줄 오류(대상 아님).
- Task 2: `test(44-11)` 7b21f415 → `feat(44-11)` 3b5e8852 — RED 증거 `RED_EVIDENCE_OK`(13건 모두 실패). 대상 「머리 「정산하기」(UI E1) > 순서 …」 이 「거래 기록 | 정산하기」 대신 「거래 기록」 으로 실패(머리 단추 없음). 의미 판정 같음 — 나머지는 `ready()` 의 같은 「정산하기」 단언에서 떨어졌다. 「옛 정산 줄」 은 44-09 동작을 잠그는 회귀 테스트라 GREEN 뒤 같은 단언으로 통과.
- RED 증거 기록은 무시되는 `node_modules/.gsd-red/44-11-t1.json` · `44-11-t2.json` 에 두고 커밋하지 않았다(44-02 · 44-07 · 44-09 · 44-10 과 같음).
- REFACTOR 커밋 없음.

## Issues Encountered

- 없음. server 정산 라우트(44-08)는 이 worktree 에 있고 화면은 그 응답 계약(`SettlementWriteResponse` · 오류 코드)만 따랐다 — 실제 relay 응답은 44-13 배포 날 확인.

## Known Stubs

- 없음.

## 사람 눈 확인으로 넘기는 것 (44-12 e2e · UAT)

- E1 overflow — 폰 360 · 390 에서 머리 한 줄에 「정산」 + 「거래 기록」 · 「정산하기」 가 잘리거나 겹치지 않는지.
- E8 overflow — 폰 바텀시트(328)에서 계좌 표 최악 줄 한 줄 · 나누기 줄(점 「김현중」 「50%」 「+5억 2,450만」 「바로 출금」) 한 줄 · 뺄 계좌 줄 줄바꿈 · 데스크톱 패널(400) 같은 확인.
- 다크 테마에서 「바로 출금」 켜짐(`--primary` 면 · `--primary-fg` 글자) · 꺼짐(`--border-subtle` 테두리) 대비 · 나누기 상자(`--muted`) 위 알약이 보이는지.
- 열 때 다시 읽기가 실제 relay 지연(최대 수 초)에서 값이 「조용히」 바뀌는지(깜빡임 없음).
- 키보드로 시트를 열 때 첫 포커스(× 버튼)에 링이 거슬리는지 — 위 「금지 사항 점검」.

## User Setup Required

None — 외부 서비스 설정 없음.

## Next Phase Readiness

- 44-12: 정산 확정 · 취소 화면 흐름이 다 섰다 — e2e 는 data-slot(`settlement-settle-create` · `settle-sheet-*` · `settle-out` · `settle-confirm`)으로 잡으면 된다. 위 사람 눈 확인 목록을 360 · 390 · 데스크톱으로.
- 44-13: 배포 뒤 실제 relay 로 확정(예수금 읽기 · 바로 출금 반영) · 취소(되돌림 · D-30 두 갈래) 응답을 한 번씩 확인.

## Verification

- Task 1 `<automated>` — shared build · vitest settle-sheet 16 통과 · webapp typecheck 오류 0 → SETTLE-SHEET-OK
- Task 2 `<automated>` — vitest `src/components/settlement` 11 파일 · 140 통과 · 실패 0 · typecheck 오류 0 → SETTLE-FLOW-OK
- eslint(바꾼 4 파일) 경고 0 · React act 경고 0
- 인수 기준: T1 9항목(문구 6 · settlePlan · aria-pressed · 확정 실패 문구) · T2 8항목(SettleSheet · confirmSettlement · cancelSettlement · 정산하기 · cancelConfirmText · 테스트 「스위치를 끄면 … 취소해요」 4 · 「되돌리지 못했어요 — 계좌 메뉴에서 맞춰 주세요」 2 · REVERT_UNREADABLE 4) 전부 통과

---
*Phase: 44-admin-settlement*
*Completed: 2026-11-20*

## Self-Check: PASSED

- 새 파일 3개 · 고친 파일 1개 · SUMMARY 있음(FOUND 5 — `git diff --name-only bd688dca..HEAD`)
- 커밋 `06b704f0` · `15253a5a` · `7b21f415` · `3b5e8852` 가 이 브랜치 HEAD 의 조상(`git log bd688dca..HEAD`) · 코드 커밋 수 4 = frontmatter `commits: 4`
- 바뀐 파일은 플랜 files_modified 4개 + 이 SUMMARY 뿐 · STATE.md · ROADMAP.md · `admin-api.ts` · `admin-sheet.tsx` · `pnpm-lock.yaml` 손대지 않음 · 작업 트리 깨끗함
