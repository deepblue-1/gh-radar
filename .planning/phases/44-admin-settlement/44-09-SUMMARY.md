---
phase: 44-admin-settlement
plan: 09
subsystem: ui
tags: [webapp, settlement, radix, toggle-group, vitest, tdd]

requires:
  - phase: 44-01
    provides: shared settlement 상수 · 타입 · 포매터 · 날짜 라벨 · settlement-client(트레이서)
  - phase: 44-02
    provides: shared nameVs · hgSum · hgOf · sortLedgerRows · pendAccKeys · personSummary
  - phase: 44-06
    provides: AccountTable · PersonDot · settlement-client ctx(useMemo)
  - phase: 44-07
    provides: settlement-format(accLabel · personName · ledgerKindLabel · ledgerFlowParts)
provides:
  - webapp NameVsCard(④) — 명의 합 · 계좌 보조 줄 · 몫 보조 줄 · 「0 이 되려면」 상자
  - webapp TransferCard(⑤) — 현중 ↔ 근형 계좌이체 누적(법인 용역 따로) · 「이체 내역 보기」
  - webapp ActivityCard(⑥) — 세그먼트 「정산 기록 · 계좌 거래 · 현중 ↔ 근형 이체」 · 빈 목록 · 묶음별 최근 정산 판정
  - webapp LedgerRow · SettleRow — 펼침 줄(적은 · 고친 사람 · 예수금 줄 · 다시 반영 · 확정한 순간의 계좌)
  - webapp pendLines(사유별 미반영 문장) · settleDateLabel · 펼침 줄 공용 클래스(ACTIVITY_*) · MetaRow · WhoMeta · RowChevron
  - admin-api SETTLEMENT_WRITE_TIMEOUT_MS(40,000) · retrySettlementLedger(id)
affects: [44-10, 44-11, 44-12, 44-13]

actuals:
  tokens: 20600
  tasks: 2
  commits: 4
plan_head_before: 51e4e2f19fb9aa8884cac4849e2f17d5d8d6310e
plan_head_after: 717995db102bddcdc66e51845e079475b8a498fb

tech-stack:
  added: []
  patterns:
    - "펼침 줄 = 항목 래퍼(hairline · first:border-t-0) 안에 줄 버튼과 펼침 상자를 형제로 — 상자 안 「다시 반영」 · 「고치기」 도 버튼이라 줄 버튼 안에 넣지 않는다"
    - "좁은 두 줄 / 넓은 한 줄 그리드는 grid-template-areas 대신 칸 위치 클래스(col-start · row-start · row-span)를 컨테이너 쿼리로 바꿔 끼운다"
    - "펼침 · 다시 반영 진행 · 오류 상태는 settlement-client 가 id 로 쥔다 — 목록을 다시 불러와도 펼친 줄과 오류 줄이 그대로"

key-files:
  created:
    - webapp/src/components/settlement/name-vs-card.tsx
    - webapp/src/components/settlement/transfer-card.tsx
    - webapp/src/components/settlement/activity-card.tsx
    - webapp/src/components/settlement/ledger-row.tsx
    - webapp/src/components/settlement/settle-row.tsx
    - webapp/src/components/settlement/__tests__/name-vs-transfer.test.tsx
    - webapp/src/components/settlement/__tests__/activity-card.test.tsx
  modified:
    - webapp/src/components/settlement/settlement-client.tsx
    - webapp/src/lib/admin-api.ts

key-decisions:
  - "④ 사람 몫 = personSummary().stakeKrw(지금 몫 전체 · 목업 n.ps[p].stake) — 44-06 의 사람 카드 큰 숫자(totalKrw) 미결 질문과 무관해 person-cards.tsx 는 손대지 않았다"
  - "법인 용역 꼬리표 판정은 row.via === corp_service(목업 t.via) — 명의가 안 바뀌는 법인 용역 줄도 꼬리표가 붙는다"
  - "다시 반영 오류 문장 — 응답 message 가 없으면 「다시 반영하지 못했어요」 만(끝에 「 · 」 를 남기지 않음)"
  - "가장 최근 정산인데 취소 핸들러가 없으면(44-11 전) 단추도 안내도 그리지 않는다 — 누를 수 없는 단추를 두지 않는다"
  - "바로 출금 줄의 정산이 목록에 없으면(이론상) 안내 문장은 날짜 없이 「정산 때 만든 줄이에요 — …」"

patterns-established:
  - "data-slot: settlement-name-vs · settlement-transfer · settlement-tr2-row · settlement-tr2-sub · settlement-name-zero(-dir · -amt) · settlement-activity · settlement-activity-list · settlement-activity-empty · settlement-ledger-item(data-id) · settlement-ledger-row · settlement-ledger-sub · settlement-ledger-tag · settlement-ledger-flow · settlement-ledger-amt · settlement-ledger-memo · settlement-ledger-actions · settlement-meta · settlement-retry-error · settlement-settle-item(data-id) · settlement-settle-row · settlement-settle-sub · settlement-settle-person · settlement-settle-actions · settlement-row-date"

requirements-completed: []

coverage:
  - id: D1
    description: "「명의 대 몫」(④) — 검산 명의 합 · 계좌 보조 줄 · 몫 보조 줄 · x > 0 / x < 0 / 0 문장 · 미설정 「—」 · 「교보 정근형 미설정」 · 계산 불가 문장 · 증여 문구 없음"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/settlement/__tests__/name-vs-transfer.test.tsx#NameVsCard (4 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "「현중 ↔ 근형 계좌이체」(⑤) — 1건 4억 · 4건 7억 · 차액 두 방향 · 법인 용역(있을 때만) · 0 건 · 미설정에서도 같은 숫자 · 「이체 내역 보기」 → 세그먼트 hg"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/settlement/__tests__/name-vs-transfer.test.tsx#TransferCard (5 tests)"
        status: pass
      - kind: automated_ui
        ref: "webapp/src/components/settlement/__tests__/activity-card.test.tsx#⑤ 「이체 내역 보기」 → 활동 카드 세그먼트가 「현중 ↔ 근형 이체」 로"
        status: pass
    human_judgment: false
  - id: D3
    description: "활동 카드(⑥) — 기본 「계좌 거래」 · 보기 그룹 · 줄 순서 · 꼬리표 조합 · 펼침 메타 · 고치기 · 지우기(핸들러 있을 때만) · 바로 출금 줄 안내 · 정산 기록 줄 · 사람 줄 · 확정한 순간의 계좌 · 옛 정산 안내 · 정산 취소 자리 · 이체 세그먼트 · 빈 목록 · ② ~ ⑥ 순서"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/settlement/__tests__/activity-card.test.tsx (16 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "예수금 미반영(D-26) — 사유별 문장(below_one 따로) · err 꼬리표 · 「다시 반영」 1회 · aria-busy · disabled · 다시 불러오기 · pend 남음 · 실패 오류 줄"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/settlement/__tests__/activity-card.test.tsx#예수금 미반영 · 다시 반영(D-26) (6 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "(UI E4 · E5 · E6 overflow backstop) 폰 360 에서 ④ 보조 줄 · 「…원이면 맞음」 · ⑤ 법인 용역 라벨 · 차액 값이 줄바꿈만 하고 잘리지 않음 / 본문 768 에서 꼬리표 3 ~ 4개 + 메모가 꼬리표 칸 안에서 줄바꿈 · 좁은 줄 흐름 두 줄까지 · 세그먼트 세 칸 한 줄(넘치면 트랙 가로 스크롤)"
    verification: []
    human_judgment: true
    rationale: "시각 배치 — jsdom 은 레이아웃을 재지 않는다. 44-12 e2e · UAT 에서 768 · 360 확인"

duration: 11min
completed: 2026-11-20
status: complete
---

# Phase 44 Plan 09: 명의 대 몫 · 현중 ↔ 근형 계좌이체 · 활동 카드 Summary

**정산 화면 아래쪽 절반 — shared `nameVs` 로 「누구 → 누구 5,950만원이면 맞음」 을 보이는 「명의 대 몫」 카드, shared `hgSum` 으로 실제 오간 이체(법인 용역 따로)를 보이는 계좌이체 카드, 「정산 기록 · 계좌 거래 · 현중 ↔ 근형 이체」 세그먼트와 펼침 줄(적은 · 고친 사람 · 예수금 반영 상태 · 사유별 미반영 + 「다시 반영」 · 확정한 순간의 계좌)을 가진 활동 카드를 세웠다.**

## Performance

- **Duration:** 약 11분(구현 구간 · 문서 읽기 제외)
- **Started:** 2026-11-20T01:48:55Z
- **Completed:** 2026-11-20T01:59:52Z
- **Tasks:** 2 (NAME-VS-OK · ACTIVITY-OK 도달)
- **Files modified:** 9 (새 파일 7 · 고친 파일 2)

## Accomplishments

- ④ `NameVsCard` — 「김현중 명의 계좌 10억 5,600만」 · 「교보 김현중 6억 8,400만 · KB 김현중 3억 7,200만」 · 「그중 김현중 몫 9억 2,450만 · 심쥬니 몫 7,200만」 / 정근형 묶음(위 hairline) · 「0 이 되려면」 상자(방향 문장 14 + 금액 18/600 「…원이면 맞음」 · 「명의와 몫이 맞습니다」 · 계산 불가 문장).
- ⑤ `TransferCard` — 두 방향 「N건」 + 금액 · 「차액」(위 hairline · 「정근형이 3억 더 보냄」 / 「0」) · 「법인 용역으로 옮긴 돈 1건 · 개인 이체 아님」(있을 때만) · 링크 버튼 「이체 내역 보기」.
- ⑥ `ActivityCard` — Radix ToggleGroup(`ADMIN_SEGMENT_*` · 「보기」 · 트랙 가로 스크롤) · 정산 기록 / 계좌 거래 / 이체 목록 · 빈 목록 문구.
- `LedgerRow` — 좁음 두 줄 · 넓음 한 줄 그리드 · 꼬리표(종류 중립 · 법인 용역 ok · 「근형 → 현중」 warn · 「11/19 정산」 중립 · 「예수금 미반영」 err · 메모) · 금액 무색 · `ChevronDown` 회전 · 펼침 메타 · 예수금 줄 · 다시 반영 · 오류 줄 · 단추 줄.
- `SettleRow` — 「11/19 · 현중 · 근형 · 14:32 예수금으로 확정 · 메모 · +10억 4,900만」 · 사람 줄 · `AccountTable mode="past" compact` · 적은 사람 · 정산 취소 자리 / 옛 정산 안내.
- `admin-api` — `SETTLEMENT_WRITE_TIMEOUT_MS = 40_000` · `retrySettlementLedger(id)` = `POST /api/admin/settlement/ledger/:id/retry`.
- `settlement-client` — ③ 아래 ④ · ⑤(본문 ≥ 768 2열) → ⑥ · 세그먼트 · 펼침(Set) · 다시 반영 상태 · 끝나면 `reload()`.

## Task Commits

1. **Task 1: 명의 대 몫 · 계좌이체 카드** — RED `72182958` (test) → GREEN `82ca32c1` (feat)
2. **Task 2: 활동 카드 · 펼침 줄 · 다시 반영** — RED `13392e57` (test) → GREEN `717995db` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## 컴포넌트 props (44-10 · 44-11 이 넘길 핸들러 자리)

```ts
// webapp/src/components/settlement/name-vs-card.tsx
NameVsCard({ ctx: SettlementCtx })
Tr2Row({ label, children, line? })   // ⑤ 도 쓴다
Tr2Sub({ children })
// webapp/src/components/settlement/transfer-card.tsx
TransferCard({ ledger: readonly SettlementLedgerRow[]; onShowTransfers: () => void })
// webapp/src/components/settlement/activity-card.tsx
type ActivitySegment = "settle" | "ledger" | "hg";
ActivityCard({
  ctx, nowIso, segment, onSegment,
  openSettle: ReadonlySet<number>, openLedger: ReadonlySet<number>,
  onToggleSettle(id), onToggleLedger(id),
  ledgerHandlers: {
    onEdit?: (row: SettlementLedgerRow) => void;    // ← 44-10 「고치기」(⑦ 고치기 모드)
    onDelete?: (row: SettlementLedgerRow) => void;  // ← 44-10 「지우기」(⑨)
    onRetry?: (id: number) => void;                 // settlement-client 가 이미 단다
    retryingId: number | null;
    retryErrors: Readonly<Record<number, string>>;
  },
  onCancelSettle?: (settle: SettlementSettleRow) => void,  // ← 44-11 「정산 취소」(⑨)
})
// webapp/src/components/settlement/ledger-row.tsx
LedgerRow({ row, settle, open, onToggle, nowIso, onEdit?, onDelete?, onRetry?, retrying, retryError })
pendLines(pend): string[]          // 사유별 미반영 문장
settleDateLabel(settle, nowIso)    // 정산 확정일 「M/D」(KST)
// webapp/src/components/settlement/settle-row.tsx
SettleRow({ settle, outsWho, isLatest, open, onToggle, nowIso, onCancel? })
```

- **44-10 이 할 일:** `settlement-client.tsx` 의 `ActivityCard` `ledgerHandlers` 에 `onEdit` · `onDelete` 를 더하면 펼친 줄에 「고치기」 · 「지우기」 가 생긴다(바로 출금 줄은 핸들러가 있어도 단추 대신 안내 문장). ⑦ 저장 뒤 「정산 기록」 에 있었으면 `setActivitySegment("ledger")`(UI-SPEC ⑥ 흐름 규칙).
- **44-11 이 할 일:** `onCancelSettle` 을 넘기면 묶음별 가장 최근 정산 펼침에 「정산 취소」 가 생긴다. ⑧ 확정 성공 뒤 `setActivitySegment("settle")` + `setOpenSettle(new Set([새 id]))`(새 정산 줄만 펼친 채).
- 둘 다 쓰기 요청 타임아웃은 `SETTLEMENT_WRITE_TIMEOUT_MS` 를 쓰면 된다.

## 문구 확인표

| 자리 | 화면 문구 | 테스트 |
|---|---|---|
| ④ 제목 | 「명의 대 몫」 · 「누구 이름 계좌에 누구 돈이 있나」 | name-vs 검산 |
| ④ 줄 | 「김현중 명의 계좌 10억 5,600만」 · 「교보 김현중 6억 8,400만 · KB 김현중 3억 7,200만」 · 「그중 김현중 몫 9억 2,450만 · 심쥬니 몫 7,200만」 · 「정근형 명의 계좌 8억 6,500만」 · 「KB 정근형 8억 4,500만 · 교보 정근형 2,000만」 · 「정근형 몫은 9억 2,450만」 | name-vs 검산 |
| ④ 상자 | 「김현중 명의 계좌에 정근형 몫이 들어 있습니다」 + 「김현중 → 정근형 5,950만원이면 맞음」 / 「정근형 명의 계좌에 김현중 몫이 들어 있습니다」 + 「정근형 → 김현중 3,050만원이면 맞음」 / 「명의와 몫이 맞습니다」 | name-vs 검산 · x < 0 · x = 0 |
| ④ 미설정 | 합 「—」 · 「교보 정근형 미설정」 · 「정근형 몫은 —」 · 「예수금이 설정되지 않은 계좌가 있어 맞출 금액을 계산할 수 없어요」 | name-vs 미설정 |
| ⑤ 제목 | 「현중 ↔ 근형 계좌이체」 · 「실제로 오간 돈 · 소명용」 | transfer 검산 |
| ⑤ 줄 | 「김현중 → 정근형 1건 4억」 · 「정근형 → 김현중 4건 7억」 · 「차액 정근형이 3억 더 보냄」 · 「법인 용역으로 옮긴 돈 1건 · 개인 이체 아님 3억」 / 0 건 「0건 0」 · 「차액 0」 | transfer 검산 · 0 건 · 김현중 쪽 |
| ⑤ 링크 | 「이체 내역 보기」 | transfer · activity ⑤ 링크 |
| ⑥ 세그먼트 | 「정산 기록」 · 「계좌 거래」 · 「현중 ↔ 근형 이체」(그룹 「보기」) | activity 기본 |
| ⑥ 거래 꼬리표 | 「계좌 옮김」 · 「법인 용역 · 개인 이체 아님」(ok) · 「근형 → 현중」 · 「현중 → 근형」(warn) · 「11/19 정산」 · 「예수금 미반영」(err) | activity 꼬리표 · 바로 출금 · 미반영 |
| ⑥ 거래 펼침 | 「적은 사람 배포 때 미리 넣은 내역」 / 「적은 사람 hyunjoong@example.com · 11/19 14:32」 · 「고친 사람 … · 11/20 10:00」 · 「예수금 그대로 둠 / 반영함」 | activity 펼침 · 적은 사람 |
| ⑥ 미반영 | 「교보 김현중 미반영 — 매매 서버에 보내지 못했어요」 · 「… 미반영 — 예수금이 0 이하가 되어 보내지 않았어요」 + 「다시 반영」 / 「다시 반영하지 못했어요 · <message>」 | activity D-26 6건 |
| ⑥ 바로 출금 줄 | 「11/19 정산 때 만든 줄이에요 — 그 정산을 취소하면 함께 사라져요」 | activity 바로 출금 |
| ⑥ 단추 | 「고치기」 · 「지우기」(핸들러 있을 때만) · 「정산 취소」(가장 최근 · 핸들러 있을 때만) | activity 적은 사람 · 취소 핸들러 |
| ⑥ 정산 줄 | 「11/19 · 현중 · 근형 · 14:32 예수금으로 확정 · 11월 정산 · +10억 4,900만」 · 「김현중 50% 그날 출금 5억 2,450만」 · 「정근형 50% 계좌에 남겨 둠 5억 2,450만」 · 「확정한 순간의 계좌」 · 「예수금 읽은 시각 11/19 14:32」 · 「더 최근 정산부터 차례로 취소할 수 있어요」 | activity 정산 2건 |
| ⑥ 빈 목록 | 「아직 정산한 적이 없습니다」 · 「거래가 없습니다」 | activity 0 건 |

## Decisions Made

- 위 frontmatter `key-decisions` 5건.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 테스트 오류] 카드 제목 단언의 띄어쓰기**
- **Found during:** Task 1 GREEN
- **Issue:** 처음 쓴 테스트가 제목 `h2` 의 textContent 를 「명의 대 몫 누구 이름 …」 로 기대했지만, 제목 · 부제는 `gap` 으로 띄운 두 덩이라 textContent 에 띄어쓰기가 없다(③ 카드와 같은 구조).
- **Fix:** 테스트 도우미 `heading()` 이 두 덩이를 「제목|부제」 로 비교하게 고쳤다. 컴포넌트는 그대로.
- **Files modified:** webapp/src/components/settlement/__tests__/name-vs-transfer.test.tsx
- **Committed in:** 82ca32c1

**2. [Rule 3 - 막힘] RED 증거 TAP 해석 실패 — 역할 조회 실패 메시지가 여러 줄**
- **Found during:** Task 1 RED
- **Issue:** 「이체 내역 보기」 테스트의 `getByRole` 실패 메시지(「There are no accessible roles …」)가 여러 줄이라 TAP 보고가 `invalid_record`(Non-TAP data · Malformed TAP).
- **Fix:** 그 테스트 첫 단언을 한 줄 문자열 비교로(버튼 글자 확인) 두고 역할 조회는 그 뒤에 → `RED_EVIDENCE_OK`. 단언 뜻은 같다. Task 2 테스트는 처음부터 모든 첫 단언을 한 줄 비교로 썼다.
- **Committed in:** 72182958

**3. [판단] 다시 반영 오류 문장 끝 「 · 」**
- 플랜 action 은 `"다시 반영하지 못했어요 · " + (message ?? "")` 라 message 가 없으면 「 · 」 가 끝에 남는다. message 가 있을 때만 「 · <message>」 를 붙였다(UI-SPEC 문구 꼴 「…하지 못했어요 · <message>」 유지).

**4. [환경] 하네스가 복합 git 명령을 거절** — 장부 기록 · 스테이징 · 커밋을 단순 명령으로 나눠 실행(내용 불변).

---

**Total deviations:** 4 (테스트 오류 1 · 막힘 1 · 판단 1 · 환경 1)
**Impact on plan:** 범위 확대 없음. 파일은 플랜 files_modified 9개뿐 · `person-cards.tsx` · `settlement-client.test.tsx` · 44-08 파일 손대지 않음.

## TDD Gate Compliance

- Task 1: `test(44-09)` 72182958 → `feat(44-09)` 82ca32c1 — RED 증거 `RED_EVIDENCE_OK`(tap-flat · 9건 모두 실패). 대상 「NameVsCard > 검산 → 명의 합 · 계좌 보조 줄 · 몫 보조 줄 · 「김현중 → 정근형 5,950만원이면 맞음」」 이 `expected '' to be '김현중 명의 계좌|10억 5,600만 / …'` 로 실패. 의미 판정: 두 카드를 null 을 그리는 자리 파일로 함께 커밋해 import 는 풀리고, 대상이 실제로 실행되어 계획한 「명의 줄 없음」 단언으로 떨어졌다 — 수집 · import · 문법 · 픽스처 오류 없음.
- Task 2: `test(44-09)` 13392e57 → `feat(44-09)` 717995db — RED 증거 `RED_EVIDENCE_OK`(16건 모두 실패). 대상 「ActivityCard > 꼬리표 — 8/10 …」 이 `expected '' to be '계좌 옮김,법인 용역 · 개인 이체 아님'` 로 실패. 의미 판정: `ActivityCard` 자리 파일(null) · `pendLines` 자리(빈 배열)로 대상이 실행되어 「꼬리표 없음」 단언으로 떨어졌다. 다른 테스트의 null 접근 TypeError 는 대상이 아니다.
- RED 증거 기록은 무시되는 `node_modules/.gsd-red/44-09-t1.json` · `44-09-t2.json` 에 두고 커밋하지 않았다(44-02 · 44-06 · 44-07 과 같음).
- REFACTOR 커밋 없음.

## Issues Encountered

- 없음. 서버 쪽 `POST /api/admin/settlement/ledger/:id/retry` 는 같은 웨이브 44-08 몫이라 이 worktree 에는 없다 — 화면은 응답 계약(`SettlementWriteResponse` 의 `pend` · `message`)만 따랐고, 44-13 통합 때 실제 응답으로 한 번 확인하면 된다.

## Known Stubs

- 없음. 「고치기」 · 「지우기」 · 「정산 취소」 단추는 핸들러가 없으면 그리지 않는 설계(플랜 objective — 누를 수 없는 단추를 두지 않는다)로 44-10 · 44-11 이 핸들러를 넘기면 나타난다. 자리 표시 문구 · 빈 데이터 없음.

## 사람 눈 확인으로 넘기는 것 (44-12 e2e · UAT)

- E4 overflow — 폰 360 에서 「그중 김현중 몫 9억 2,450만 · 심쥬니 몫 7,200만」 · 「김현중 → 정근형 5,950만원이면 맞음」 이 줄바꿈만 하고 잘리지 않는지 · 값 칸 한 줄.
- E5 overflow — 폰 360 에서 「법인 용역으로 옮긴 돈 1건 · 개인 이체 아님」 라벨과 「정근형이 3억 더 보냄」 값.
- E6 overflow — 본문 768 에서 꼬리표 3 ~ 4개 + 메모가 꼬리표 칸 안에서 줄바꿈하고 금액 칸을 밀지 않는지 · 좁은 줄 흐름 「KB 정근형 → 교보 김현중」 두 줄까지 · 세그먼트 세 칸이 폰 360 에서 한 줄(넘치면 가로 스크롤).
- 펼친 줄 hover · 열림 면(`--muted` 60%) · 셰브론 회전 · 펼침 상자 위 작은 버튼 면(`--card` + 테두리) · 다크 테마 · 터치 기기에서 줄 버튼 포커스 링 없음.

## User Setup Required

None — 외부 서비스 설정 없음.

## Next Phase Readiness

- 44-10 · 44-11 은 위 「컴포넌트 props」 의 핸들러 자리만 채우면 된다. `settlement-client` 에 세그먼트 · 펼침 상태 setter 가 이미 있다.

## Verification

- `pnpm --filter @gh-radar/shared build && … vitest run name-vs-transfer.test.tsx settlement-client.test.tsx --maxWorkers=2 && … typecheck` → 15 통과 · 오류 0 → NAME-VS-OK
- `… vitest run src/components/settlement --maxWorkers=2 && … typecheck` → 7 파일 · 76 통과 · 실패 0 → ACTIVITY-OK(마지막 주석 손질 뒤 다시 돌려 확인)
- eslint(바꾼 9 파일) 경고 0
- 인수 기준: T1 9항목 · T2 15항목 전부 통과 · 금지 3건(변경 이력 · 증여 문구 · 새 포커스 링 클래스) 글자 0

## Self-Check: PASSED

- 새 파일 7개 · 고친 파일 2개 있음 · 커밋 4개(`72182958` · `82ca32c1` · `13392e57` · `717995db`) 이 브랜치 HEAD 의 조상 · STATE.md · ROADMAP.md 손대지 않음 · `pnpm-lock.yaml` 변경 없음.

---
*Phase: 44-admin-settlement*
*Completed: 2026-11-20*
