---
phase: 44-admin-settlement
plan: 06
subsystem: admin-settlement
tags: [webapp, settlement, nextjs, vitest, tdd, sidebar]

requires:
  - phase: 44-01
    provides: shared settlement.ts 상수 · 타입 · poolAccountRows · poolOk · cumProfit · 포매터 · settlementReadLabel · settlementBudgetOf / webapp settlement-client · open-pools-card(최소)
  - phase: 44-02
    provides: shared openProfit · distributable · shareOf · settledSum · personSummary · SettlementCtx
provides:
  - webapp AccountTable — 계좌별 예수금 · 넣은 돈 · 수익 공용 표(③ · ⑧ 44-11 · 정산 기록 펼침 44-09)
  - webapp OpenPoolsCard 완성 — 정산 전 수익 · 누적 줄 · 미설정 · 못 읽음 · 서버 간 다름 · D-28 · l3 · PersonDot export
  - webapp PersonCards — 세 사람 카드(②)
  - CSS 토큰 --person-h · --person-g · --person-j(라이트 · 다크)
  - 사이드바 NAV_ADMIN_SETTLEMENT(/admin/settlement · 매매손익 다음)
affects: [44-09, 44-10, 44-11, 44-12, 44-13]

actuals:
  tokens: 11700
  tasks: 2
  commits: 4
plan_head_before: 4ed20388fd3b6f1a6e9fa343148cc364e3bcb06d
plan_head_after: 8efbc56ccd398caa9e221c93851fa5f1d0586c3f

tech-stack:
  added: []
  patterns:
    - "정산 화면 카드는 SettlementCtx 하나를 받아 shared 계산 함수만 부른다 — settlement-client 가 응답에서 useMemo 로 한 번 만든다"
    - "계좌 표 전체 폭 줄(누적 · 못 읽음 · 다름 · 읽은 시각)은 행 래퍼(display: contents) 밖 col-span-full — 행 래퍼 안은 칸 4개뿐"
    - "TAP RED 증거가 깨지지 않게 대상 단언은 한 줄 메시지(문자열 비교 · configure getElementError)"

key-files:
  created:
    - webapp/src/components/settlement/account-table.tsx
    - webapp/src/components/settlement/person-cards.tsx
    - webapp/src/components/settlement/__tests__/open-pools-card.test.tsx
    - webapp/src/components/settlement/__tests__/person-cards.test.tsx
  modified:
    - webapp/src/components/settlement/open-pools-card.tsx
    - webapp/src/components/settlement/settlement-client.tsx
    - webapp/src/styles/globals.css
    - webapp/src/components/admin/__tests__/account-linked-summary.test.ts
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx

key-decisions:
  - "사람 카드 큰 숫자 「내 수익 몫 · 아직 계좌에 두고 있는 돈」 = personSummary().totalKrw(남겨 둔 돈 + 정산 전 몫) — 채택 목업 `fm(x.total)` 을 따랐다. 플랜 behavior 의 큰 숫자 「9억 2,450만 · 9억 2,450만 · 7,200만」 은 sketch README 가 「지금 몫 전체」 로 적은 값(stakeKrw)이라 그 값은 「지금 몫 전체」 줄에서 단언한다. 검산 큰 숫자는 5억 2,450만 · 5억 2,450만 · 0"
  - "AccountTable readLine 은 줄 원문 그대로 받는다(부르는 쪽이 「예수금 읽은 시각 …」 을 만든다) · labels 는 계좌 이름 바꿔 쓰기용 선택 prop"
  - "누적 줄 조건은 poolOk && settledSum > 0(목업 `ok && prev`) — 부르는 쪽(OpenPoolsCard)이 판정하고 AccountTable 은 cum 이 있으면 그린다"
  - "못 읽음 줄은 settlementReadLabel(readAt, now) 글자가 같은 계좌끼리 한 줄 — 시각이 다르면 줄이 여럿"

patterns-established:
  - "data-slot 이름: settlement-acc-cum · settlement-acc-stale · settlement-acc-mismatch · settlement-acc-read · settlement-pool-l3 · settlement-budget-basis · person-dot · settlement-person(data-person) · settlement-person-big · settlement-person-kv · settlement-person-name"

requirements-completed: []

coverage:
  - id: D1
    description: "「정산 전 수익」 카드 — 부제 · D-28 한 줄 · 넣은 돈 풀이 · 정산 전 수익(누적 − 정산) · 누적 줄 · 미설정 · 못 읽음 · 서버 간 다름 · l3 몫 / 손실 이월 · 지난 정산 표(past)"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/settlement/__tests__/open-pools-card.test.tsx (6 tests)"
        status: pass
      - kind: automated_ui
        ref: "webapp/src/components/settlement/__tests__/settlement-client.test.tsx (6 tests · 44-01 회귀)"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-03 대조 — 정산 예수금 판정(settlementBudgetOf) = 계좌 메뉴 판정(summarizeLinkedCosts) 4 경우"
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/account-linked-summary.test.ts#D-03 — 정산 예수금 판정은 계좌 메뉴와 같다 (4 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "세 사람 카드 — 순서 · 큰 숫자 · kv 줄 조건 · 보조 줄 · 손실(1억 이하 · 넘음) · 미설정 「—」 · 남겨 둔 돈 음수 라벨"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/settlement/__tests__/person-cards.test.tsx (4 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "사이드바 Admin 하위 「매매손익 · 정산 · 계좌 · 사용자 · 서버 · 러쉬 주문」 · /admin/settlement 활성"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx (94 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "UI E2 · E3 overflow backstop — 본문 768 · 900 · 폰 360 · 390 에서 큰 숫자 · kv 값 · 4열 표 최악 줄이 잘리지 않고 한 줄"
    verification: []
    human_judgment: true
    rationale: "시각 배치 — 컴포넌트 테스트(jsdom)는 레이아웃을 재지 않는다. 44-12 e2e 와 사람 눈 확인 몫"
  - id: D6
    description: "사람 카드 큰 숫자가 「내 수익 몫」(totalKrw)인지 「지금 몫 전체」(stakeKrw)인지 — 목업을 따른 판단의 사용자 확인"
    verification: []
    human_judgment: true
    rationale: "플랜 behavior 글자와 채택 목업 코드가 갈렸다(아래 Deviations 1). UAT 에서 확인"

duration: 8min
completed: 2026-11-20
status: complete
---

# Phase 44 Plan 06: 「정산 전 수익」 완성 · 세 사람 카드 · 사이드바 「정산」 Summary

**정산 화면 위쪽 절반 — 공용 계좌 표 `AccountTable`(누적 · 못 읽음 · 서버 간 다름 · 읽은 시각 줄)로 「정산 전 수익」 카드를 완성하고(정산 전 수익 = 누적 − 이미 정산한 수익 · D-28 한 줄 · l3 몫 / 손실 이월 / 미설정 안내), shared `personSummary` 로 그린 세 사람 카드와 사이드바 「정산」 을 더했다. 정산 예수금 판정이 계좌 메뉴 판정과 같다는 것(D-03)은 4 경우 대조 테스트로 잠갔다.**

## Performance

- **Duration:** 약 8분(구현 구간 · 문서 읽기 제외)
- **Started:** 2026-11-20T01:25:02Z
- **Completed:** 2026-11-20T01:32:53Z
- **Tasks:** 2 (OPEN-POOLS-OK · PERSON-CARDS-OK 도달)
- **Files modified:** 10 (새 파일 4 · 고친 파일 6)

## Accomplishments

- `AccountTable` — ③ · ⑧(44-11) · 정산 기록 펼침(44-09)이 함께 쓸 4열 표. 미설정 「미설정」(warn) · 수익 「—」 · 넣은 돈 음수 그대로 + `title` 풀이 · 누적 줄 · 못 읽음 줄(같은 읽은 시각끼리 한 줄 · past 면 「…으로 확정했어요」) · 서버 간 다름 줄 · 읽은 시각 줄.
- `OpenPoolsCard` 완성 — 묶음 값 = 정산 전 수익 · D-28 「예수금은 현금 + 보유 종목 매입금액 기준이에요(평가금액 아님)」 · l3(미설정 안내 + 「계좌 메뉴에서 설정」 → `/admin/accounts` / 쥬니 「원금 4억까지 … 남음 — 회복한 뒤부터 나눕니다」 / 사람 점 + 이름 + 몫) · `PersonDot` export.
- `PersonCards` — 김현중 → 정근형 → 심쥬니 · 큰 숫자 24/600 무색 + 「원」 · kv 줄 조건(남겨 둔 돈 음수 라벨 · 원금 보조 줄은 두 묶음 소속자만 · 손실 줄은 손실이 있을 때만) · 미설정 묶음에 몫이 있으면 「—」.
- 사이드바 「정산」(매매손익 바로 다음 · 모바일 탭바 제외) · 사람 점 토큰 3개(라이트 · 다크).

## Task Commits

1. **Task 1: 「정산 전 수익」 완성 + D-03 대조** — RED `3e0892e5` (test) → GREEN `2cc26585` (feat)
2. **Task 2: 세 사람 카드 · 본문 연결 · 사이드바** — RED `75796bb2` (test) → GREEN `8efbc56c` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## 컴포넌트 props (뒤 플랜용)

```ts
// webapp/src/components/settlement/account-table.tsx
AccountTable({
  rows: SettlementSnapshotAccount[];               // poolAccountRows(...) 또는 정산 snapshot.accounts
  labels?: Partial<Record<SettlementAccKey, string>>;
  cum: { cumKrw: number; prevKrw: number } | null; // 누적 줄 — 부르는 쪽이 판정(③ · ⑧ 은 poolOk && prev > 0 · 펼침은 prev 만)
  mode: "now" | "past";                            // 못 읽음 줄 끝 「이에요」 / 「으로 확정했어요」
  readLine?: string;                               // 줄 원문 그대로(예 「예수금 읽은 시각 11/19 14:32」)
  mismatch?: SettlementAccKey[];                   // 서버 간 다름 계좌
  nowIso: string;                                  // 읽은 시각 라벨 기준(응답 now)
  compact?: boolean;                               // 시트 · 확인 안 — 칸 사이 늘 8
})
// webapp/src/components/settlement/open-pools-card.tsx
OpenPoolsCard({ view: SettlementView })
PersonDot({ person: SettlementPerson; className?: string })  // 8×8 · aria-hidden · data-slot="person-dot"
// webapp/src/components/settlement/person-cards.tsx
PersonCards({ ctx: SettlementCtx })
```

## 문구 확인표

| 자리 | 화면 문구 | 테스트 |
|---|---|---|
| ③ 부제 | 「수익 = 예수금 − 넣은 돈 · 예수금 읽은 시각 오늘 14:32」 | open-pools ① |
| ③ D-28 | 「예수금은 현금 + 보유 종목 매입금액 기준이에요(평가금액 아님)」 | open-pools ① |
| ③ 넣은 돈 풀이 | `title` 「들어온 돈 8억 − 나간 돈 10억 2,000만」 | open-pools ① |
| ③ l3 몫 | 「김현중 +5억 2,450만 · 정근형 +5억 2,450만」 | open-pools ① · ② |
| ③ l3 손실 이월 | 「원금 4억까지 2,800만 남음 — 회복한 뒤부터 나눕니다」 | open-pools ① |
| ③ 누적 줄 | 「누적 수익 +10억 4,900만 · 이미 정산한 수익 1억」 | open-pools ② |
| ③ 미설정 | 「미설정」 · 「—」 · 「예수금이 설정되지 않은 계좌가 있어요」 + 「계좌 메뉴에서 설정」 | open-pools ③ |
| ③ 못 읽음 | 「교보 김현중 · 교보 정근형 — 매매 서버에서 못 읽어 어제 19:58 에 읽은 값이에요」 | open-pools ④ |
| ③ 서버 간 다름 | 「KB 정근형 — 서버마다 예수금이 달라 주문 서버 값으로 계산했어요」 | open-pools ⑤ |
| 펼침 표 | 「… 에 읽은 값으로 확정했어요」 · 「예수금 읽은 시각 11/19 14:32」 | open-pools ⑥ |
| ② 라벨 | 「내 수익 몫 아직 계좌에 두고 있는 돈」 | person-cards 검산 |
| ② kv | 「정산한 수익 중 남겨 둔 돈」 / 「정산한 몫보다 먼저 가져간 돈」 · 「정산 전 수익 중 내 몫」 · 「넣어 둔 원금」 · 「쥬니 묶음 손실 원금보장 · 1억까지 혼자」 / 「… 1억 넘는 부분」 · 「지금 몫 전체」 | person-cards 4건 |
| ⑪ 사이드바 | 「매매손익 · 정산 · 계좌 · 사용자 · 서버 · 러쉬 주문」 | app-sidebar |

## D-03 대조 4 경우 결과

같은 `AdminAccountCostsRaw` · 같은 연결(kimtr KB120 · KB121 / leetr KB120 · 주문 서버 KB120)을 계좌 메뉴 모양(`LinkedAccount`)과 정산 모양(`SettlementRawAccount`)으로 만들어 넣었다 — 4 경우 모두 예수금 · 출처 서버 · 다름 여부가 같다(통과).

| 경우 | 입력 | 예수금 | 출처 서버 | 다름 |
|---|---|---|---|---|
| ① 67 live 우선 | KB120 87 8억 · live 9억 / KB121 87 9억 | 9억(live) | KB120 | 없음 |
| ② 87 폴백 | live 없음 · 87 8억 | 8억(snapshot) | KB120 | 없음 |
| ③ 첫 사용자 모름 | kimtr(KB121 행 없음) · leetr KB120 5억 | 5억 | KB120(계좌 메뉴 「leetr · KB120」) | 없음 |
| ④ 서버 간 다름 | kimtr KB120 9억 · KB121 7억 | 9억 | KB120 | 양쪽 모두 있음 |

## Decisions Made

- 위 frontmatter `key-decisions` 4건.

## Deviations from Plan

### Auto-fixed Issues

**1. [판단 · 목업 정본] 사람 카드 큰 숫자 = `totalKrw`(내 수익 몫), 플랜 behavior 의 「9억 2,450만 · 9억 2,450만 · 7,200만」 이 아님**
- **Found during:** Task 2 RED 작성 전
- **Issue:** 플랜 T2 behavior 와 UI-SPEC ② 문구 정본 표(큰 숫자 「9억 2,450만」)는 큰 숫자를 「9억 2,450만」 · 「9억 2,450만」 · 「7,200만」 으로 적었지만, 그 값은 shared `personSummary().stakeKrw`(지금 몫 전체)다. 이 실행은 사용자가 「좋아」 로 채택한 목업의 실제 렌더(`fm(x.total)`)를 따랐다. 채택 목업 `personCards` 는 큰 숫자를 `fm(x.total)`(남겨 둔 돈 + 정산 전 몫)로 그리고, sketch-033 README 3차도 「지금 몫 전체 9억 2,450만 · 9억 2,450만 · 7,200만」 이라 적는다. 라벨 「내 수익 몫 · 아직 계좌에 두고 있는 돈」 도 원금이 빠진 수익 몫을 뜻한다.
- **Fix:** 큰 숫자 = `formatEokManMinus(totalKrw)` → 검산 5억 2,450만 · 5억 2,450만 · 0. 9억 2,450만 · 9억 2,450만 · 7,200만 은 「지금 몫 전체」 줄에서 단언한다. 테스트 머리 주석에 두 값의 뜻을 적었다.
- **확인 필요:** UAT 에서 사용자가 「큰 숫자는 지금 몫 전체여야 한다」 고 하면 `person-cards.tsx` 한 줄(`x.totalKrw` → `x.stakeKrw`)과 테스트 기대값만 바꾸면 된다.
- **Files modified:** webapp/src/components/settlement/person-cards.tsx · __tests__/person-cards.test.tsx
- **Committed in:** 75796bb2 · 8efbc56c

**2. [Rule 3 - 막힘] RED 증거 TAP 해석 실패 — 배열 diff 가 여러 줄**
- **Found during:** Task 2 RED
- **Issue:** 대상 첫 단언 `expect(order).toEqual(['H','G','J'])` 의 여러 줄 diff 가 TAP YAML 을 깨 `invalid_record`(Non-TAP data · Malformed TAP).
- **Fix:** `expect(order.join(',')).toBe('H,G,J')` 로 한 줄 메시지 → `RED_EVIDENCE_OK`. 단언 뜻은 같다.
- **Committed in:** 75796bb2

**3. [환경] 하네스가 복합 git 명령 · heredoc 을 거절**
- 커밋 장부 기록 · 테스트 덧붙이기를 단순 명령 · Edit 도구로 나눠 실행(내용 불변).

---

**Total deviations:** 3 (판단 1 · 막힘 1 · 환경 1)
**Impact on plan:** 범위 확대 없음. 파일은 플랜 files_modified 10개뿐 · `account-linked-summary.ts` 본문 무변경(`git diff --stat` 빈 출력).

## TDD Gate Compliance

- Task 1: `test(44-06)` 3e0892e5 → `feat(44-06)` 2cc26585 — RED 증거 `RED_EVIDENCE_OK`(tap-flat). 대상 「① 검산 응답 → 부제 · D-28 안내 · 넣은 돈 풀이 · l3 몫 줄 · 쥬니 손실 이월」 이 `expected '' to be '예수금은 현금 + 보유 종목 매입금액 기준이에요(평가금액 아님)'` 로 실패. 의미 판정: 대상이 실제로 실행되어 계획한 D-28 줄 없음으로 떨어졌다(RED 커밋에 null 을 그리는 `AccountTable` 자리 파일 — 불러오기 실패가 아니라 단언 실패로 RED). D-03 대조 4건은 기존 함수의 특성 테스트라 RED 때부터 통과(대상 아님).
- Task 2: `test(44-06)` 75796bb2 → `feat(44-06)` 8efbc56c — RED 증거 `RED_EVIDENCE_OK`. 대상 「검산 응답 → 순서 · 큰 숫자(내 수익 몫) · …」 이 `expected '' to be 'H,G,J'` 로 실패(카드 없음 · null 자리 파일). 사이드바 새 단언 4건도 RED 때 실패를 확인했다.
- REFACTOR 커밋 없음.

## Issues Encountered

- 없음.

## Known Stubs

- 없음. 44-01 의 Known Stub(최소 카드)은 이 플랜이 채웠다. 머리 두 버튼(「거래 기록」 · 「정산하기」)은 원래대로 44-10 · 44-11 몫.

## 사람 눈 확인으로 넘기는 것 (44-12 e2e · UAT)

- UI E2 overflow — 본문 768 ~ 800 에서 kv 라벨만 두 줄 · 값 한 줄 · 큰 숫자 최악값 「−10억 6,500만원」 한 줄 · 본문 768 · 900 · 폰 360 · 390 에서 잘림 없음.
- UI E3 overflow — 폰 360 카드(320) · 시트(328)에서 4열 표 최악 줄 「KB 정근형 · 8억 4,500만 · −2억 2,000만 · +10억 6,500만」 가로 스크롤 없이 한 줄 · 이름 칸 `truncate` 평소 미동작.
- 사람 점 색(라이트 · 다크) · 「계좌 메뉴에서 설정」 링크 hover 밑줄 · 터치 기기 포커스 링 없음.
- 큰 숫자 필드 판단(Deviations 1).

## User Setup Required

None — 외부 서비스 설정 없음.

## Next Phase Readiness

- 44-09(정산 기록 펼침)는 `AccountTable rows={settle.snapshot.accounts} cum={prev > 0 ? { cumKrw, prevKrw } : null} mode="past" readLine={`예수금 읽은 시각 ${settlementReadLabel(settle.readAt, now)}`} compact` 꼴로 쓰면 된다.
- 44-11(정산하기 시트)은 `mode="now"` · `compact` · `readLine` · `mismatch` 를 쓴다. 사람 점은 `PersonDot`.
- settlement-client 는 `ctx`(useMemo)를 이미 만든다 — 뒤 카드(④ · ⑤ · ⑥)는 같은 ctx 를 받으면 된다.

## Verification

- `pnpm --filter @gh-radar/shared build && … vitest run open-pools-card · settlement-client · account-linked-summary && typecheck` → 31 통과 · OPEN-POOLS-OK
- `… vitest run src/components/settlement` 16 통과 · `… app-sidebar.test.tsx` 94 통과 · typecheck 오류 0 → PERSON-CARDS-OK
- 마무리 때 두 `<automated>` 명령 사슬을 파이프 없이 그대로 다시 돌려 PERSON-CARDS-OK · OPEN-POOLS-OK 를 찍었다.
- 플랜 검증: `vitest run src/components/settlement src/components/admin src/components/layout --maxWorkers=2` — 28 파일 · 585 통과 · 실패 0
- 인수 기준: T1 9항목 · T2 8항목 전부 통과(`--person-h` 2 · `NAV_ADMIN_SETTLEMENT` 4 · `"정산"` 2 · `formatEok(`/`formatManwonFloor` 0 · 새 `focus-visible:ring` 0)

## Self-Check: PASSED

- 새 파일 4개 있음 · 커밋 4개(`3e0892e5` · `2cc26585` · `75796bb2` · `8efbc56c`) 이 브랜치에 있음 · STATE.md · ROADMAP.md · `account-linked-summary.ts` 손대지 않음 · `pnpm-lock.yaml` 변경 없음.

---
*Phase: 44-admin-settlement*
*Completed: 2026-11-20*
