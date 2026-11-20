---
phase: 44-admin-settlement
plan: 10
subsystem: ui
tags: [webapp, settlement, admin-sheet, radiogroup, vitest, tdd]

requires:
  - phase: 44-05
    provides: server 거래 쓰기 라우트 POST · PUT · DELETE(REVERT_UNREADABLE 409 · unreverted) · 오류 문장
  - phase: 44-07
    provides: ReflectBox · reflectPreviewLines · defaultReflectOn · SettleConfirm · deleteConfirmText · CONFIRM_TEXT
  - phase: 44-09
    provides: ActivityCard ledgerHandlers(onEdit · onDelete 자리) · SETTLEMENT_WRITE_TIMEOUT_MS · settlement-client 세그먼트 상태
provides:
  - webapp LedgerSheet(⑦ 거래 기록 · 거래 고치기) · LedgerDraft · ledgerDraftToBody · LEDGER_SHEET_TEXT
  - admin-api saveSettlementLedger(body, id?) · deleteSettlementLedger(id, reflect) · confirmSettlement(body) · cancelSettlement(id, reflect)
  - settlement-client 머리 「거래 기록」 · 줄 「고치기」 · 「지우기」(⑨ 확인 · D-30) 연결 · 패널 열림 · 저장 뒤 세그먼트 규칙
affects: [44-11, 44-12, 44-13]

actuals:
  tokens: 15300
  tasks: 2
  commits: 4
plan_head_before: dfda69a15e39a92b5f25b6e31aa994731e21b360
plan_head_after: d1b0461a63e921cee1e42758cccba0eef14b93a8

tech-stack:
  added: []
  patterns:
    - "시트 처음 값 맞추기 = 렌더 중 「이전 세션 키」 비교(new · edit:<id> · 닫힘 null) — 열 때마다 처음 값 · 닫히는 동안은 값 유지"
    - "부르는 쪽 열림 상태는 { open, row } — 닫을 때 open 만 내려 닫히는 애니메이션 동안 제목 · 문단이 바뀌지 않게"
    - "선택 알약 묶음 PillGroup — role radiogroup(aria-label = 칸 이름) · 방향키는 aria-disabled 알약을 건너뛰고 옮긴 알약을 고른다"

key-files:
  created:
    - webapp/src/components/settlement/ledger-sheet.tsx
    - webapp/src/components/settlement/__tests__/ledger-sheet.test.tsx
    - webapp/src/components/settlement/__tests__/settlement-client-ledger.test.tsx
  modified:
    - webapp/src/components/settlement/settlement-client.tsx
    - webapp/src/lib/admin-api.ts

key-decisions:
  - "「오늘」 은 응답 now(KST)로만 정한다 — 기본 날짜 · max · 미래 판정 · 스위치 날짜 규칙이 같은 기준(장중 줄만 실제 시계)"
  - "「저장」 활성 = 종류별 필요한 계좌 · 사람이 골라졌을 때 — 금액은 활성 조건이 아니라 저장 때 검증(빈 금액 오류 줄을 보일 수 있게)"
  - "같은 계좌 오류는 금액 칸에(UI-SPEC · 목업) — 보낸 · 받은 계좌 · 종류 알약을 바꾸면 그 오류만 지운다 · 빈 금액 오류는 금액을 고칠 때만 지운다"
  - "D-29 비우는 방식 — 종류 · 계좌를 바꾼 뒤 지금 고른 사람이 그 계좌 묶음에 없으면 who = null(저장 비활성으로 돌아감)"
  - "고치기 스위치는 반영했던 거래면 날짜를 바꿔도 켜짐(목업 618행) · 아니면 날짜 규칙"
  - "지우기 반영 값 = 상자가 있을 때만 스위치 값 · 없으면 늘 false · unreverted 인데 message 가 없으면 오류 줄 없이 잠금만"
  - "시트 자동 포커스 — AdminSheet 가 onOpenAutoFocus 를 넘기지 않아 고치지 않았다. Radix 기본이 머리 × 버튼으로 가 첫 입력칸에 키보드가 뜨지 않는다(아래 「금지 사항 점검」)"

patterns-established:
  - "data-slot: ledger-sheet · ledger-field-label · ledger-amount · ledger-date · ledger-memo · ledger-error-amount · ledger-error-date · ledger-save-error · ledger-cancel · ledger-save · settlement-ledger-create"

requirements-completed: []

coverage:
  - id: D1
    description: "⑦ 시트 — 처음 값 · 칸 순서(D-27) · 종류별 칸 · 이어받기 · 만원 금액(콤마 · 7자리 · 바디 원) · ledgerDraftToBody 칸 모양"
    verification:
      - kind: unit
        ref: "webapp/src/components/settlement/__tests__/ledger-sheet.test.tsx#처음 열기 · 칸 순서 · 금액 · ledgerDraftToBody (6 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-29 심쥬니 알약 막기 · 클릭 무시 · 방향키 건너뜀 · 막힌 조합이면 사람 비움 · 원금 회수는 뺀 계좌 기준"
    verification:
      - kind: unit
        ref: "webapp/src/components/settlement/__tests__/ledger-sheet.test.tsx#사람-묶음 막기(D-29) (3 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "검증 오류 줄 4개(aria-invalid · role alert · 그 칸을 고치면 사라짐) · 저장 중(두 버튼 비활성 · aria-busy · readOnly) · 저장 실패 줄"
    verification:
      - kind: unit
        ref: "webapp/src/components/settlement/__tests__/ledger-sheet.test.tsx#검증 오류 줄 · 저장 중 · 실패 (8 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "스위치 날짜 규칙(D-11) · 미리 보기(D-10) · 고치기 옛 값 되돌림 + 새 값 한 벌(D-23) · reflect false 고치기 꺼짐"
    verification:
      - kind: unit
        ref: "webapp/src/components/settlement/__tests__/ledger-sheet.test.tsx#날짜 · 미리 보기 · 고치기 (7 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "본문 연결 — 머리 「거래 기록」 · 패널 열림 · 저장 POST/PUT · 닫힘 · 다시 불러오기 · 정산 기록 → 계좌 거래 · pend 남아도 닫힘 · 저장 실패 유지"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/settlement/__tests__/settlement-client-ledger.test.tsx#머리 · 저장 · 고치기 (4 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "⑨ 거래 지우기 — 문단 · 상자 · 미리 보기 두 줄 · DELETE(id, reflect) · 반영 안 한 줄 상자 없음 · D-30 unreverted 잠금 + 닫을 때 다시 불러오기 · REVERT_UNREADABLE 두 문장 그대로 · 스위치 끔 → 줄 사라짐 · 그 밖 「지우지 못했어요 · X」 · 바로 출금 줄 단추 없음"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/settlement/__tests__/settlement-client-ledger.test.tsx#지우기 · D-30 · 바로 출금 (8 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "(UI E7 long-text backstop) 메모 100자 · 금액 7자리 · 긴 저장 실패 문장이 폰 바텀시트 · 데스크톱 패널 폭 안에서 줄바꿈하고 하단 버튼을 가리지 않음 · 알약 묶음 줄바꿈 · 다크 면"
    verification: []
    human_judgment: true
    rationale: "시각 배치 — jsdom 은 레이아웃을 재지 않는다. 44-12 e2e · UAT 에서 360 · 데스크톱 패널로 확인"
  - id: D8
    description: "confirmSettlement · cancelSettlement 경로 · 바디(44-11 이 부른다)"
    verification: []
    human_judgment: true
    rationale: "이 플랜에서는 부르는 화면이 없어 테스트가 없다 — 44-11 정산 시트 · 취소 테스트가 잠근다"

duration: 9min
completed: 2026-11-20
status: complete
---

# Phase 44 Plan 10: 거래 기록 · 고치기 시트와 지우기 연결 Summary

**정해진 칸 순서(무슨 거래 → 계좌 · 사람 → 금액 → 날짜 → 메모 → 예수금 상자)로 네 종류 거래를 적고 고치는 시트(만원 금액 · 날짜 규칙 스위치 · 「옛 값 되돌림 + 새 값」 미리 보기 · 심쥬니 알약 막기 · 칸별 오류 줄)를 세우고, 머리 「거래 기록」 · 줄 「고치기」 · 「지우기」(D-30 되돌릴 수 없을 때 · 되돌리기만 실패) 를 정산 쓰기 API 4 함수로 끝까지 이었다.**

## Performance

- **Duration:** 약 9분(구현 구간 · 문서 읽기 제외)
- **Started:** 2026-11-20T02:12:31Z
- **Completed:** 2026-11-20T02:21:26Z
- **Tasks:** 2 (LEDGER-SHEET-OK · LEDGER-FLOW-OK 도달)
- **Files modified:** 5 (새 파일 3 · 고친 파일 2)

## Accomplishments

- ⑦ `LedgerSheet` — `AdminSheet` 제목 「거래 기록」 / 「거래 고치기」 · 알약 묶음(`role="radiogroup"`) · 금액 「만원」 · 네이티브 날짜(`max` 오늘) · 메모 100자 · ⑩ 상자 · 하단 「취소」 · 「저장」 반반과 그 위 실패 줄.
- `ledgerDraftToBody` — 만원 × 10,000 · 종류에 맞지 않는 칸 null(server zod · DB CHECK 와 같은 모양).
- `admin-api` 쓰기 4 함수 — 전부 `SETTLEMENT_WRITE_TIMEOUT_MS`(40초) · 반환 `SettlementWriteResponse`. 정산 확정 · 취소 함수도 여기 넣어 44-11 이 이 파일을 다시 고치지 않는다.
- `settlement-client` — 머리 「거래 기록」 · 패널 열림 · 저장 성공 뒤 닫힘 · 세그먼트 규칙 · 다시 불러오기 · 줄 「고치기」 · 「지우기」 확인 창과 D-30 두 갈래.

## Task Commits

1. **Task 1: 거래 기록 · 고치기 시트(⑦)** — RED `287b04fa` (test) → GREEN `1f531ecb` (feat)
2. **Task 2: 본문 연결 · 쓰기 API 4개** — RED `e975fe2e` (test) → GREEN `d1b0461a` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## 시트 상태 · 검증 규칙

| 상태 | 처음(새 거래) | 고치기 |
|---|---|---|
| 종류 | 「수익 출금」 | 옛 줄 |
| 계좌 · 사람 | 안 고름 | 옛 줄 |
| 경로 | 「계좌이체」 | 옛 줄(없으면 계좌이체) |
| 금액 | 빈 칸(placeholder 「0」) | 원 ÷ 10,000 |
| 날짜 | 오늘(응답 `now` 의 KST) | 옛 줄 |
| 스위치 | 날짜 규칙 — 날짜를 바꿀 때마다 다시(손으로 바꾼 뒤에도) | 반영했던 거래면 늘 켜짐 · 아니면 날짜 규칙 |
| 미리 보기 | 필요한 칸이 다 골라졌을 때만 `reflectEffect(초안)` | `effectDiff(appliedEffect(옛 줄), reflectEffect(초안))` 한 벌 |

- 「저장」 활성: 계좌 옮김 = 보낸 · 받은 계좌 / 출자 = 넣은 사람 · 받은 계좌 / 수익 출금 · 원금 회수 = 뺀 계좌 · 받는 사람.
- 「저장」 을 누를 때 검증: 금액 칸 — 0 · 빈 칸 「금액을 넣어 주세요」 → (아니면) 계좌 옮김 보낸 = 받은 「보낸 계좌와 받은 계좌가 같아요」 / 날짜 칸 — 빈 칸 「날짜를 골라 주세요」 · 오늘(KST) 뒤 「미래 날짜는 적을 수 없어요」. 오류가 있으면 그 칸 `aria-invalid` + 칸 바로 아래 `role="alert"` 줄 · `onSave` 0회.
- 오류 지우기: 금액 입력 → 금액 칸 오류 / 보낸 · 받은 계좌 · 종류 알약 → 「같은 계좌」 오류만 / 날짜 입력 → 날짜 칸 오류. 다시 「저장」 → 전부 다시 판정.
- 금액 입력: 숫자만 · 앞 0 정리 · 8자리째는 입력 자체를 무시(값 그대로) · 표시 `toLocaleString("ko-KR")`.
- 저장 중: 두 버튼 비활성 · 「저장」 `aria-busy` · 입력 `readOnly` · 알약 클릭 무시 · 스위치 잠금 · 바깥 닫힘 막음. 실패 → 하단 위 「저장하지 못했어요 · <message>」(message 가 없으면 앞 문장만).

## D-29 비우는 방식

- 사람 알약 막기는 출자(받은 계좌) · 원금 회수(뺀 계좌)에서 그 계좌가 골라졌을 때만 `personAllowedFor(kind, 계좌, 사람)` 로 판정(계좌가 없으면 판정하지 않음 · null 계좌로 부르지 않음). 막힌 알약 = `aria-disabled="true"` · `opacity-40` · 클릭 무시 · 방향키가 건너뜀.
- 종류 · 계좌 · 사람을 바꾼 뒤 지금 고른 사람이 막히면 `who = null` — 「저장」 이 비활성으로 돌아간다. 수익 출금 · 계좌 옮김은 막지 않는다.

## 쓰기 API 4 함수

| 함수 | 요청 | 비고 |
|---|---|---|
| `saveSettlementLedger(body, id?)` | id 없음 `POST /api/admin/settlement/ledger` · 있음 `PUT …/ledger/:id` | 바디 `SettlementLedgerBody` |
| `deleteSettlementLedger(id, reflect)` | `DELETE /api/admin/settlement/ledger/:id` 바디 `{ reflect }` | 409 `REVERT_UNREADABLE` · 200 `unreverted` + `message` |
| `confirmSettlement(body)` | `POST /api/admin/settlement/settles` | 바디 `SettlementSettleBody` · 44-11 |
| `cancelSettlement(id, reflect)` | `POST /api/admin/settlement/settles/:id/cancel` 바디 `{ reflect }` | 44-11 |

## D-30 화면 동작(거래 지우기)

| 경우 | 화면 |
|---|---|
| 반영했던 것이 있음(`appliedEffect(row)` 가 비지 않음) | ⑩ 상자 기본 켜짐 · 미리 보기 = `effectDiff(appliedEffect(row), {})` — 예 「KB 정근형 예수금 8억 4,500만 → 12억 4,500만 / 교보 김현중 예수금 6억 8,400만 → 2억 8,400만」 |
| 반영한 적 없음 | 상자 없음 · 늘 `reflect: false` 로 보냄 |
| 성공(`unreverted` 없음) | 창 닫힘 · 다시 불러옴 |
| 미리 막고 안내 — 409 `REVERT_UNREADABLE` | 창 유지 · 오류 줄 = server 문장 그대로(접두 없음) · 「지우기」 활성 · 스위치를 바꾸면 오류 줄 사라짐 → 끄고 누르면 `DELETE(id, false)` |
| 지운 뒤 보내기만 실패 — 200 `unreverted` | 창 유지 · 오류 줄 = `message` 그대로 · 「지우기」 잠금(`confirmDisabled`) · 아직 다시 불러오지 않음 → 「닫기」(또는 Esc · 바깥)로 닫을 때 다시 불러옴 |
| 그 밖 거부(404 · 409 `SETTLE_LINKED` · 네트워크) | 「지우지 못했어요 · <message>」 · 창 유지 · 「지우기」 활성 |

## Files Created/Modified

- `webapp/src/components/settlement/ledger-sheet.tsx` — LEDGER_SHEET_TEXT · LedgerDraft · ledgerDraftToBody · LedgerSheet · Field · PillGroup(새 파일)
- `webapp/src/components/settlement/__tests__/ledger-sheet.test.tsx` — 23건(새 파일)
- `webapp/src/components/settlement/__tests__/settlement-client-ledger.test.tsx` — 12건(새 파일)
- `webapp/src/components/settlement/settlement-client.tsx` — 머리 단추 · 시트 · 확인 창 상태 · 핸들러
- `webapp/src/lib/admin-api.ts` — 쓰기 4 함수 · 머리 주석 경로 목록

## Decisions Made

- 위 frontmatter `key-decisions` 7건.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 테스트 오류] `ledgerDraftToBody` 비교가 키 순서에 묶여 있었다**
- **Found during:** Task 1 GREEN
- **Issue:** RED 때 첫 단언을 한 줄로 두려고 `JSON.stringify` 비교를 썼는데, 바디 키 순서는 뜻이 없어 구현이 맞아도 떨어졌다.
- **Fix:** `toEqual` 로 바꿨다(값 비교는 같음). 구현은 그대로.
- **Files modified:** webapp/src/components/settlement/__tests__/ledger-sheet.test.tsx
- **Committed in:** 1f531ecb

**2. [작은 판단] 열림 상태 모양**
- 플랜 action 은 `ledgerSheet: { mode: "new" } | { mode: "edit"; row } | null` · `deleteTarget: {…} | null` 이다. 그대로 두면 닫는 순간 시트 제목이 「거래 기록」 으로 · 확인 문단이 비어 닫히는 애니메이션 동안 글자가 바뀐다. `{ open, row }` · `deleteTarget.open` 으로 두고 닫을 때 `open` 만 내렸다(동작 · 테스트 같음). 시트 모드는 `row` 가 있으면 `"edit"`.

**3. [환경] 하네스가 복합 git · `source` 명령을 거절** — 원장 기록 · 스테이징 · 커밋을 단순 명령으로 나눠 실행했다(내용 불변).

---

**Total deviations:** 3 (테스트 오류 1 · 작은 판단 1 · 환경 1)
**Impact on plan:** 범위 확대 없음. 파일은 플랜 files_modified 5개뿐 · `admin-sheet.tsx` · `person-cards.tsx` · 44-07/09 부품 손대지 않음.

## 금지 사항 점검

- 토스트 · `alert()` 창 — 0(바꾼 파일 grep).
- `focus-visible:ring-*` 새로 단 곳 — 0. 알약은 테두리 · 글자 · 굵기만.
- 시트 자동 포커스: `AdminSheet` 가 `onOpenAutoFocus` 를 받지 않아 플랜 action 의 「컨테이너로(`preventScroll`)」 는 이 플랜 파일만으로 할 수 없다. 고치지 않은 이유 — `admin-sheet.tsx` 는 계좌 · 사용자 · 서버 시트가 함께 쓰는 공용 골격이라 범위 밖. 지금 동작은 Radix 기본(첫 포커스 대상 = 머리 「닫기」 × 버튼)이라 **첫 입력칸으로는 가지 않고 폰 키보드도 뜨지 않는다**(금지 문장 「첫 입력칸으로 자동 포커스하지 않는다」 는 지켜짐). 터치 기기는 전역 규칙이 링을 그리지 않는다. 44-11 정산 시트도 같은 골격이라, 컨테이너 포커스가 꼭 필요하면 `AdminSheet` 에 선택 prop 하나를 더하는 작은 quick 이 맞다(UAT 에서 데스크톱 키보드로 열 때 × 에 링이 보이는지 확인).
- ⑨ 확인 창은 44-07 `SettleConfirm` 이 이미 컨테이너 포커스(`preventScroll`)를 한다.

## TDD Gate Compliance

- Task 1: `test(44-10)` 287b04fa → `feat(44-10)` 1f531ecb — RED 증거 `RED_EVIDENCE_OK`(tap-flat · 23건 모두 실패). 대상 「LedgerSheet — 처음 열기(E7 empty) > 제목 「거래 기록」 …」 이 `expected '' to be '거래 기록'` 로 실패. 의미 판정: `ledger-sheet.tsx` 를 null 을 그리는 타입 있는 자리 파일로 함께 커밋해 import 는 풀리고, 대상이 실제로 실행되어 계획한 「시트 제목 없음」 단언에서 떨어졌다 — 수집 · import · 문법 · 픽스처 오류 없음. 다른 테스트의 「element missing」 은 알약이 없어 도우미가 던진 한 줄 오류(대상 아님).
- Task 2: `test(44-10)` e975fe2e → `feat(44-10)` d1b0461a — RED 증거 `RED_EVIDENCE_OK`(12건 모두 실패). 대상 「머리 「거래 기록」 · 시트 열기 > 첫 불러오기 전 비활성 → …」 이 `expected '' to be '거래 기록'`(머리 단추 없음)으로 실패. 의미 판정 같음 — 나머지도 `ready()` 의 같은 단언에서 떨어졌다. 「바로 출금 줄 단추 없음」 은 44-09 동작을 잠그는 회귀 테스트라 GREEN 뒤 같은 단언으로 통과.
- RED 증거 기록은 무시되는 `node_modules/.gsd-red/44-10-t1.json` · `44-10-t2.json` 에 두고 커밋하지 않았다(44-02 · 44-07 · 44-09 와 같음).
- REFACTOR 커밋 없음.

## Issues Encountered

- 없음. server 쓰기 라우트(44-05 · 44-08)는 이 worktree 에 있고 화면은 그 응답 계약(`SettlementWriteResponse` · 오류 코드)만 따랐다 — 실제 relay 응답은 44-13 배포 날 확인.

## Known Stubs

- 없음.

## 사람 눈 확인으로 넘기는 것 (44-12 e2e · UAT)

- E7 long-text — 폰 바텀시트(360) · 데스크톱 패널(440)에서 메모 100자 · 금액 「9,999,999」 · 긴 server 오류 문장이 시트 폭 안에서 줄바꿈하고 하단 버튼을 가리지 않는지 · 「KB 정근형 · 교보 김현중 · 교보 정근형 · KB 김현중」 알약이 두 줄로 감기는지.
- 데스크톱에서 시트가 열리면 본문이 오른쪽 440 을 비우고(본문 폭 ≥ 784) 정산 본문이 좁은 배치로 바뀌는지.
- 키보드로 시트를 열 때 첫 포커스(× 버튼)에 링이 거슬리는지 — 위 「금지 사항 점검」.
- 다크 테마에서 알약 off(`--muted`) · on(테두리 `--fg`) 대비 · 막힌 심쥬니(40%) 가 「골라진 것처럼」 보이지 않는지.

## User Setup Required

None — 외부 서비스 설정 없음.

## Next Phase Readiness

- 44-11: `confirmSettlement` · `cancelSettlement` 가 이미 있다. 정산 시트를 열 때 `AdminPanelPage panelOpen` 에 정산 시트 열림을 `||` 로 더하면 된다(지금 `panelOpen={ledgerSheet.open}`). 정산 취소의 D-30 처리는 이 플랜 `onConfirmDelete` 와 같은 갈래(문장 그대로 · 잠금 · 닫을 때 다시 불러오기)를 쓰면 된다.

## Verification

- Task 1 `<automated>` — shared build · vitest(ledger-sheet · reflect-box) 44 통과 · webapp typecheck 오류 0 → LEDGER-SHEET-OK
- Task 2 `<automated>` — vitest `src/components/settlement` 9 파일 · 111 통과 · 실패 0 · typecheck 오류 0 → LEDGER-FLOW-OK
- eslint(바꾼 5 파일) 경고 0 · React 경고 0
- 인수 기준: T1 12항목(문구 4 · 어떻게 옮겼나 · 거래 고치기 · 저장하지 못했어요 · personAllowedFor · aria-disabled · radiogroup · defaultReflectOn · maxLength 100) · T2 9항목(export 4 · 타임아웃 8 ≥ 5 · LedgerSheet · deleteSettlementLedger · 「거래 기록」 · REVERT_UNREADABLE 3 · 테스트 「지워요」 4 ≥ 2 · 「맞춰 주세요」 2 ≥ 1) 전부 통과

---
*Phase: 44-admin-settlement*
*Completed: 2026-11-20*

## Self-Check: PASSED

- 새 파일 3개 · 고친 파일 2개 · SUMMARY 있음(FOUND 6)
- 커밋 `287b04fa` · `1f531ecb` · `e975fe2e` · `d1b0461a` 가 이 브랜치 HEAD 의 조상(`git log dfda69a1..HEAD` 로 확인) · 코드 커밋 수 4 = frontmatter `commits: 4`
- 바뀐 파일은 플랜 files_modified 5개 + 이 SUMMARY 뿐 · STATE.md · ROADMAP.md · `admin-sheet.tsx` · `pnpm-lock.yaml` 손대지 않음 · 작업 트리 깨끗함
