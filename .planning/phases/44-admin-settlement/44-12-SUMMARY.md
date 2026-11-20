---
phase: 44-admin-settlement
plan: 12
subsystem: testing
tags: [webapp, settlement, playwright, e2e, overflow]

requires:
  - phase: 44-06
    provides: 사람 카드 · 정산 전 수익 카드 · 계좌 표(data-slot)
  - phase: 44-09
    provides: 활동 카드 세그먼트 · 정산 줄 펼침
  - phase: 44-10
    provides: LedgerSheet(알약 radiogroup · aria-disabled) · saveSettlementLedger
  - phase: 44-11
    provides: SettleSheet(바로 출금 · 정산 확정) · 확정 뒤 「정산 기록」 새 줄 펼침
provides:
  - webapp/e2e/fixtures/settlement.ts — mockSettlementApi · SETTLEMENT_FIXTURE · SETTLEMENT_FIXTURE_AFTER_SETTLE · 요청 기록
  - webapp/e2e/specs/admin-settlement.spec.ts — P44-E1 · P44-E2(360 · 390 · 1024 · 1440) · P44-F1 · P44-F2 · P44-F3
affects: [44-13]

actuals:
  tokens: 4800
  tasks: 2
  commits: 2
plan_head_before: cbfaa41e06096114463869b9b32e50e77895be05
plan_head_after: 4f8ebf091f8a81e1ce9f824903ff222123dd8a11

tech-stack:
  added: []
  patterns:
    - "정산 e2e 목 = `**/api/admin/settlement**` 하나 · GET 은 지금 상태 · POST /settles 는 상태를 정산 뒤로 바꾼다(확정 뒤 다시 불러오기가 새 줄을 받는다)"
    - "display: contents 줄 래퍼는 잴 수 없다 — 계좌 표는 칸(span)을 직접 재고 카드 오른쪽 경계와도 비교한다"

key-files:
  created:
    - webapp/e2e/fixtures/settlement.ts
    - webapp/e2e/specs/admin-settlement.spec.ts
  modified: []

key-decisions:
  - "「9억 2,450만」 2회 · 「7,200만」 은 명의 대 몫 카드(④) 안에서 센다 — 사람 카드 큰 숫자(44-06 열린 질문 totalKrw vs stakeKrw)를 잠그지 않으려고. 사람 카드 큰 숫자는 잘림만 본다"
  - "정산 뒤 상태의 「확정한 순간의 계좌」 스냅샷은 shared poolAccountRows(첫 화면 계좌 · 시드)로 만든다 — 손으로 쓴 숫자가 갈리지 않게"
  - "장중 줄(「체결 중이라 …」)은 실제 시계를 읽으므로 단언하지 않는다"

patterns-established:
  - "테스트 이름 접두 P44- · 픽스처 값은 webapp settlement-client-settle.test.tsx · server admin-settlement.test.ts 의 검산 SEED 와 같은 값"

requirements-completed: []

coverage:
  - id: D1
    description: "진짜 미들웨어를 통과한 e2e 관리자 계정이 검산 응답으로 첫 화면에 +10억 4,900만 · −2,800만 · 9억 2,450만(2회) · 7,200만 · 「김현중 → 정근형 5,950만원이면 맞음」 · 「정근형이 3억 더 보냄」 · 예수금 기준 줄 · 「계좌 거래」 9줄 · 사이드바 「정산」 활성을 본다"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin-settlement.spec.ts#P44-E1"
        status: pass
    human_judgment: false
  - id: D2
    description: "뷰포트 360 · 390 · 1024 · 1440 에서 문서 · main 가로 넘침 0 · 큰 숫자 3개 · 계좌 표 KB 정근형 수익 칸 「+10억 6,500만」 · 「…원이면 맞음」 · 머리 두 버튼 비잘림 · 360 에서 두 버튼 겹침 없음"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin-settlement.spec.ts#P44-E2 (4 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "정산하기 → 김현중 바로 출금 → 정산 확정: POST /settles 바디 { pool p1, outs [H], memo '', reflect true, expectPrev null } · 시트 닫힘 · 「정산 기록」 · 새 줄 펼침 · 「확정한 순간의 계좌」 · 「그날 출금」"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin-settlement.spec.ts#P44-F1"
        status: pass
    human_judgment: false
  - id: D4
    description: "거래 기록 → 출자 · 김현중 · KB 김현중 · 1만원 → 저장: POST /ledger 바디 txDate 2026-11-20 · kind contribute · who H · toAcc kbH · amountKrw 10000 · reflect true · 시트 닫힘"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin-settlement.spec.ts#P44-F2"
        status: pass
    human_judgment: false
  - id: D5
    description: "출자 + KB 정근형 → 심쥬니 알약 aria-disabled=true · 김현중 · 정근형은 열림(D-29)"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin-settlement.spec.ts#P44-F3"
        status: pass
    human_judgment: false
  - id: D6
    description: "(백스톱 사람 눈 부분) 다크 테마 대비 · 시트 안 표 · 나누기 줄 · 뺄 계좌 줄 줄바꿈 · 메모 100자 · 긴 오류 문장 · 키보드 첫 포커스 링"
    verification: []
    human_judgment: true
    rationale: "e2e 는 넘침 · 잘림 수치만 잰다 — 색 대비 · 줄바꿈 모양 · 포커스 링은 44-13 · UAT 에서 사람이 본다"

duration: 4min
completed: 2026-11-20
status: complete
---

# Phase 44 Plan 12: 어드민 정산 e2e Summary

**`/admin/settlement` 를 진짜 미들웨어 · 실제 레이아웃으로 띄워 검산 숫자, 폭 4개(360 · 390 · 1024 · 1440)의 넘침 · 잘림 0, 정산 확정 · 거래 기록 요청 바디, 심쥬니 알약 막기를 Playwright 9건으로 잠갔다. 모두 첫 실행에 통과했다.**

## Performance

- **Duration:** 약 4분(문서 읽기 제외 · 구현 · 실행 구간)
- **Started:** 2026-11-20T02:53:08Z
- **Completed:** 2026-11-20T02:57:00Z
- **Tasks:** 2 (E2E-LAYOUT-OK · E2E-FLOW-OK 도달)
- **Files modified:** 2 (둘 다 새 파일)

## Accomplishments

- `mockSettlementApi` — 정산 경로 하나만 가로채는 목. 검산 응답(원 단위 · 합성 값)과 정산 뒤 상태 두 벌을 두고, `POST /settles` 를 받으면 정산 뒤 상태로 바꾼다. 요청은 `{ method, url, body }` 로 쌓는다. 운영 relay · DB · 실제 계좌번호는 쓰지 않는다.
- 첫 화면 검산 숫자 · 사이드바 활성 · 활동 카드 기본값(P44-E1)과 폭 4개 넘침 · 잘림(P44-E2 4건).
- 흐름 3건 — 정산 확정(P44-F1) · 거래 기록(P44-F2) · 사람-묶음 막기(P44-F3).

## Task Commits

1. **Task 1: 픽스처 + 첫 화면 검산 숫자 + 폭 4** — `958f1a03` (test)
2. **Task 2: 정산 확정 · 거래 기록 · 사람-묶음 막기 흐름** — `4f8ebf09` (test)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## 테스트 목록

| 이름 | 뷰포트 | 보는 것 | 결과 |
|---|---|---|---|
| P44-E1 | 1440 | 문서 제목 「정산 · Admin」 · 현중 · 근형 「+10억 4,900만」 · 쥬니 「−2,800만」 · 예수금 기준 줄 · 명의 대 몫 「그중 김현중 몫 9억 2,450만 · 심쥬니 몫 7,200만」 · 「정근형 몫은 9억 2,450만」(카드 안 2회) · 「김현중 → 정근형 5,950만원이면 맞음」 · 「정근형이 3억 더 보냄」 · 「계좌 거래」 선택 · 거래 줄 9개 · 사이드바 「정산」 `aria-current="page"` | 통과 |
| P44-E2 | 360 · 390 · 1024 · 1440 | 아래 「폭별 결과」 | 4건 통과 |
| P44-F1 | 1440 | 「정산하기」 → 열 때 GET 한 번 더 · 큰 숫자 「+10억 4,900만」 → 김현중 「바로 출금」 `aria-pressed` false → true · 「뺄 계좌 — 김현중 교보 김현중」 → 「정산 확정」 → 바디 `toEqual({ pool: "p1", outs: ["H"], memo: "", reflect: true, expectPrev: null })` · 시트 사라짐 · 「정산 기록」 `aria-checked` · 정산 줄 id 1 `aria-expanded="true"` · 「확정한 순간의 계좌」 · 「그날 출금」 | 통과 |
| P44-F2 | 390 | 「거래 기록」 → 「출자」 · 「김현중」 · 「KB 김현중」 · 금액 1 · 날짜 기본 2026-11-20 → 「저장」 → 바디 `toMatchObject({ txDate: "2026-11-20", kind: "contribute", who: "H", toAcc: "kbH", amountKrw: 10000, reflect: true })` · 시트 사라짐 | 통과 |
| P44-F3 | 1280(기본) | 「출자」 + 「KB 정근형」 → 「심쥬니」 `aria-disabled="true"` · 「김현중」 · 「정근형」 은 막히지 않음 | 통과 |

알약은 모두 칸 이름 radiogroup(「무슨 거래」 · 「넣은 사람」 · 「받은 계좌」) 안에서 찾는다 — 사람 카드 제목 · 계좌 이름 · 정산 시트 나누기 줄의 같은 글자와 섞이지 않게.

## 폭별 결과(P44-E2)

| 뷰포트 | 문서 · main 가로 넘침 | 큰 숫자 3개 | 계좌 표 KB 정근형 수익 칸 「+10억 6,500만」 | 「5,950만원이면 맞음」 | 머리 「거래 기록」 · 「정산하기」 |
|---|---|---|---|---|---|
| 360 | 0 · 0 | 비잘림 | 비잘림 · 카드 안 | 비잘림 | 비잘림 · 뷰포트 안 · 겹침 없음 |
| 390 | 0 · 0 | 비잘림 | 비잘림 · 카드 안 | 비잘림 | 비잘림 · 뷰포트 안 |
| 1024 | 0 · 0 | 비잘림 | 비잘림 · 카드 안 | 비잘림 | 비잘림 · 뷰포트 안 |
| 1440 | 0 · 0 | 비잘림 | 비잘림 · 카드 안 | 비잘림 | 비잘림 · 뷰포트 안 |

- 비잘림 = `scrollWidth <= clientWidth` 이고 `clientWidth > 0`(그려지지 않은 요소로 헛통과하지 않게).
- 계좌 표 줄 래퍼(`settlement-acc-row`)는 `display: contents` 라 폭이 0 이다 — 수익 칸(4번째 span)을 직접 재고, 칸 오른쪽이 「정산 전 수익」 카드 오른쪽 안인지도 본다.
- 사람 카드 큰 숫자는 값을 단언하지 않는다(44-06 열린 질문 · `totalKrw` vs `stakeKrw`) — 잘림만.

## `.next` 캐시 정리

- 하지 않았다. 두 번의 실행 모두 webServer 가 이 lane 에서 새로 떴고(3100 비어 있음 확인) `NextFontGoogleFontFileReplacer` 반복 · 타임아웃이 없었다. 실행 뒤 3100 은 다시 비었다(dev 서버 종료 확인).

## Files Created/Modified

- `webapp/e2e/fixtures/settlement.ts` — `SETTLEMENT_NOW` · `SETTLEMENT_SEED` · `SETTLEMENT_FIXTURE` · `SETTLEMENT_FIXTURE_AFTER_SETTLE` · `SETTLE_ID` · `mockSettlementApi`(새 파일)
- `webapp/e2e/specs/admin-settlement.spec.ts` — P44-E1 · P44-E2 × 4 · P44-F1 · P44-F2 · P44-F3(새 파일)

## Decisions Made

- 위 frontmatter `key-decisions` 3건.

## Deviations from Plan

### 작은 판단

**1. 「9억 2,450만」 2회를 세는 범위**
- 플랜 E1 은 「9억 2,450만」 2회만 적었다. 이 값은 명의 대 몫 카드(④)의 김현중 몫 · 정근형 몫이다(UI-SPEC E4 「그중 김현중 몫 9억 2,450만 · 심쥬니 몫 7,200만」). 화면 전체에서 세면 사람 카드의 값(44-06 열린 질문 — 큰 숫자를 `totalKrw` 로 둘지 `stakeKrw` 로 둘지)에 따라 개수가 바뀌므로, ④ 카드 안에서 2회를 세고 두 문장을 그대로 단언했다. 열린 질문의 답과 무관하게 참이다.

**2. 정산 뒤 상태 바로 출금 줄 id · 날짜**
- 플랜은 「p1 정산 1건 id 1 + 바로 출금 줄 · kyH 159,500,000」 만 정했다. 바로 출금 줄은 id 10 · 날짜 2026-11-20(응답 now 의 KST 오늘) · `settleId` 1 · `reflect` true 로 두었다.

---

**Total deviations:** 0 auto-fixed · 작은 판단 2
**Impact on plan:** 범위 확대 없음. 바뀐 파일은 플랜 files_modified 2개뿐 · 제품 코드 · STATE.md · ROADMAP.md 손대지 않음.

## Issues Encountered

- 없음. e2e 가 이전 플랜 코드의 제품 버그를 드러내지 않았다(`test.fixme` 0건).

## Known Stubs

- 없음.

## 사람 눈 확인으로 남는 것 (44-13 · UAT)

- 다크 테마 대비(바로 출금 켜짐 · 꺼짐 · 막힌 심쥬니 40%) · 시트 안 계좌 표 · 나누기 줄 한 줄 · 뺄 계좌 줄 줄바꿈 — e2e 는 본문만 쟀고 시트 안 폭은 재지 않았다.
- 메모 100자 · 금액 7자리 · 긴 server 오류 문장의 줄바꿈 · 키보드로 시트를 열 때 첫 포커스(× 버튼) 링.
- 실제 relay 로 확정 · 취소 · 거래 저장 응답(44-13 배포 뒤).

## User Setup Required

None — 외부 서비스 설정 없음. e2e 로그인은 기존 setup 프로젝트(e2e 계정 · 읽기만)를 그대로 썼다.

## Next Phase Readiness

- 44-13: 전체 회귀에 이 spec 이 들어간다(`--workers=1`). 배포 뒤 실제 relay 확인 · 사람 눈 확인 목록은 위 절.

## Verification

- Task 1 `<automated>` — shared build exit 0 · `playwright test e2e/specs/admin-settlement.spec.ts --workers=1 --grep "P44-E"` 6 passed(setup 포함) · 0 failed → E2E-LAYOUT-OK
- Task 2 `<automated>` — `playwright test e2e/specs/admin-settlement.spec.ts --workers=1` 9 passed(setup 포함) · 0 failed → E2E-FLOW-OK
- `pnpm --filter @gh-radar/webapp run typecheck`(앱 + e2e tsconfig) 오류 0 · eslint(새 2 파일) 경고 0
- 인수 기준: T1 — `mockSettlementApi` export 1 · 「P44-E」 2 · 뷰포트 숫자 줄 8 · 「5,950만원이면 맞음」 4 / T2 — 「P44-F」 3 · `expectPrev` 1 · `amountKrw` 2 · `aria-disabled` 4 — 전부 통과

---
*Phase: 44-admin-settlement*
*Completed: 2026-11-20*

## Self-Check: PASSED

- 새 파일 2개 · SUMMARY 있음
- 커밋 `958f1a03` · `4f8ebf09` 가 이 브랜치 HEAD 의 조상(`git rev-list --count cbfaa41e..HEAD` = 2 = frontmatter `commits: 2`)
- 바뀐 파일은 플랜 files_modified 2개 + 이 SUMMARY 뿐 · STATE.md · ROADMAP.md 손대지 않음 · dev 서버 종료(3100 비어 있음)
