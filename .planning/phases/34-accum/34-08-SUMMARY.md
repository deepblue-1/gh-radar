---
phase: 34-accum
plan: 08
status: complete
subsystem: ui
tags: [nextjs, react, table, accum, tdd, tracer]

requires:
  - phase: 34-07
    provides: "AccumDetail 차트 블록(KPI 줄 · 범례 · 프리셋 · 차트 · 캡션) · 루트 gap-4"
  - phase: 34-06
    provides: "accumSyntheticDetail('multiCycle' · 'carry' · 'noPrice') 합성 상세 픽스처"
provides:
  - "webapp lib/accum-report.ts: cycleRowsOf · AccumCycleRowView · thresholdPartsOf · thresholdLineOf · ACCUM_RULE_LINES · ACCUM_RULE_SOURCE"
  - "AccumCycleTable(accum-cycle-table.tsx) — 사이클 9열 표(cycles >= 2 · data-slot accum-cycles)"
  - "AccumDetail 준비 본문 D-19 순서 완성 — 손익 줄(accum-pnl) · 판정 기준(accum-rules) · 상세 출처 칩(accum-detail-source)"
  - "teamflow-report pnlOf 인자 Pick<TeamflowPayload, 'pnl'> 로 확장(매집감지 payload 공용)"
affects: [34-09, 34-10, 34-12]

actuals:
  tokens: 6815
  tasks: 2
  commits: 4
plan_head_before: 6e93510fb96e93621cbfa0c6c1d750389355b3fb
plan_head_after: 2813d3ef887fbb632ba31a860a5b53c7d8cca701

tech-stack:
  added: []
  patterns:
    - "글자 안 일부만 다른 스타일(mono 수)이 필요한 고정 문장은 조각 배열(thresholdPartsOf)을 정본으로 두고 문자열(thresholdLineOf)은 조각을 이어 만든다 — 테스트 · 렌더가 한 출처"
    - "준비 상태 본문을 ReadyBody 로 분리 — 상세 셸(로딩 · 오류 · 게이트 · missing)과 D-19 블록 순서를 나눴다"

key-files:
  created:
    - webapp/src/components/analytics/accum-cycle-table.tsx
    - .planning/phases/34-accum/tdd-evidence/34-08-T1-red.json
    - .planning/phases/34-accum/tdd-evidence/34-08-T2-red.json
  modified:
    - webapp/src/lib/accum-report.ts
    - webapp/src/lib/__tests__/accum-report.test.ts
    - webapp/src/components/analytics/accum-detail.tsx
    - webapp/src/components/analytics/__tests__/accum-detail.test.tsx
    - webapp/src/lib/teamflow-report.ts

key-decisions:
  - "사이클 표 수량 칸 — 둘 다 null 이면 「—」 하나, 한쪽만 null 이면 「977 / —」"
  - "사이클 등록 칸 날짜 접두는 since_date 가 8자리 숫자이고 그날과 다를 때만 — 결측(null · \"\")은 접두 없이 HH:MM:SS"
  - "판정 기준 본문 1 의 null 항목은 「—」 만(뒤 「이상 · 이하」 없음) — 「한 가격 —」 · 「(현재 시총 —)」"
  - "상세 출처 칩은 머리 칩 클래스 + whitespace-nowrap + self-start(flex-col 루트에서 늘어나지 않게)"
  - "pnlOf 재사용 — 인자 타입만 Pick<TeamflowPayload, 'pnl'> 로 넓혀 같은 null 판정(total_val 숫자)을 공유"

patterns-established:
  - "RTL 블록 순서 단언 — data-slot 배열을 compareDocumentPosition FOLLOWING 으로 연쇄 확인 + 마지막 칩 뒤 요소 0"

requirements-completed: []

coverage:
  - id: D-20-cycle-table
    description: "사이클 표 — cycles >= 2 만 · 차트 블록 다음 · 토글 없음 · 9열 · # 나온 순서(cycle 값 중복) · 이월 「10/10 09:20:00」 · 장 마감까지 · 사유/상태 · 마지막 행 --team 띠 · 가로 스크롤 래퍼 · 1개면 없음"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/accum-report.test.ts#cycleRowsOf — 사이클 표 칸"
        status: pass
      - kind: unit
        ref: "webapp/src/components/analytics/__tests__/accum-detail.test.tsx#(t1) (t2)"
        status: pass
    human_judgment: false
  - id: D-21-pnl
    description: "팀 당일 손익 줄 — 합계 「+0.30억(+1.1%)」 부호 색 · 실현 · 평가 · 보유 · 출처 모를 매도 · 캡션 · 면 상자 없음 · pnl null 「팀 체결 없음」"
    verification:
      - kind: unit
        ref: "webapp/src/components/analytics/__tests__/accum-detail.test.tsx#(p1) (p2)"
        status: pass
    human_judgment: false
  - id: D-22-rules-source
    description: "판정 기준 기본 접힘 · 본문 5 고정 순서(본문 1 임계 · 수 mono) · 출처 줄 · 닫히면 언마운트 · 상세 끝 출처 칩 「KYOBO119 판정 기준 · 10/14 20:30 적재」"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/accum-report.test.ts#판정 기준 — thresholdLineOf · ACCUM_RULE_LINES"
        status: pass
      - kind: unit
        ref: "webapp/src/components/analytics/__tests__/accum-detail.test.tsx#(r1) (s1)"
        status: pass
    human_judgment: false
  - id: D-19-order-cache
    description: "D-19 문서 순서 kline → legend → presets → chart → cycles → pnl → rules → detail-source · KPI 줄에 임계 없음 · noPrice 에도 부속 유지 · 재펼침 요청 1회 · 판정 기준 다시 접힘"
    verification:
      - kind: unit
        ref: "webapp/src/components/analytics/__tests__/accum-detail.test.tsx#(s1) (s2) (s3)"
        status: pass
    human_judgment: false
  - id: VISUAL-WIDTH
    description: "폰 310 사이클 표 가로 스크롤 · 페이지 가로 스크롤 0 · 손익 항목 줄바꿈 · 판정 기준 본문 3 의 4~5줄 줄바꿈"
    verification: []
    human_judgment: true
    rationale: "jsdom 에는 레이아웃이 없다 — 34-10 폭 백스톱 · 34-12 라이브 UAT 몫"

duration: 6min
completed: 2026-10-20
---

# Phase 34 Plan 08: 매집감지 상세 부속(사이클 표 · 손익 줄 · 판정 기준 · 출처 칩) Summary

**펼친 상세를 D-19 순서로 마무리했다. 차트 블록 다음에 사이클이 2개 이상일 때만 9열 사이클 표가 기본 펼침으로 선다. 그 아래로 팀 당일 손익 줄, 「판정 기준」 접힘(이 종목 임계 + 고정 문장 4 + 출처 줄), 상세 끝 출처 칩 「KYOBO119 판정 기준 · MM/DD 20:30 적재」 가 이어진다.**

## Performance

- **Duration:** 약 6분 (14:14Z 시작 → 14:19Z 마지막 태스크 커밋)
- **Completed:** 2026-10-20
- **Tasks:** 2개 (Task 1 tracer · Task 2 auto). 태스크마다 RED → GREEN 커밋을 한 쌍씩 남겼다.
- **Files:** 신규 3개 (표 컴포넌트 1 · RED 증거 2), 수정 5개

## Accomplishments

- **사이클 표 (Task 1, 트레이서)**
  - `cycleRowsOf(row)` 는 `payload.cycles` 를 나온 순서대로 칸 글자로 바꾼다. payload null 이나 cycles 키 결측이면 빈 배열이다.
    - #: 배열 순서 1-based 다. `cycle` 값은 쓰지 않는다(CR-01). 차트 등록 라벨 「· k」 와 같은 번호다.
    - 등록: 「HH:MM:SS」 다. 사이클 since_date 가 그날과 다르면 「MM/DD HH:MM:SS」, reg null 이면 「—」 다.
    - 종료: 「HH:MM:SS」 또는 「장 마감까지」(`endIsOpen`) 다.
    - 상태: end_reason > 0 이면 사유(청산 / 이월 탈락(복원 안 됨) / 이월 만료), 아니면 매집중 / 매도중이다.
    - 값: 등록가 · 평단은 `fmtPx`, 순매수(부호 색) · 최고 순매수는 ±억 1자리, 수량은 「38,200 / 3,100」 이다.
  - `AccumCycleTable` 은 소제목 「사이클」 + 캡션 「{n}개 · 값은 각 사이클 종료 시점(살아 있으면 마지막)」 → 8px → `Table` 이다.
    - 12px 표다. 머리는 12/400 --muted-fg 이고 숫자 열은 오른쪽 정렬이다. 모든 칸이 `whitespace-nowrap` 이다.
    - 마지막 행 첫 칸에 `shadow-[inset_3px_0_0_var(--team)]` 띠가 있다. 「장 마감까지」 는 --muted-fg 다.
    - 폰에서는 `Table` 래퍼(`tbl-wrap overflow-x-auto`)가 가로 스크롤한다.
  - `AccumDetail` 의 준비 상태를 `ReadyBody` 로 분리했다. 차트 블록 다음에 `cycles.length >= 2` 일 때만 표를 넣는다. 토글은 없다.
- **손익 줄 · 판정 기준 · 출처 칩 (Task 2)**
  - **손익 줄(`accum-pnl`):** teamflow-pnl 과 같은 모양이다.
    - 소제목 「팀 당일 손익」 + `fmtPnl` 합계(`toneOf(total_val, 2)` 색)가 한 줄이다.
    - 항목 4개는 실현 · 평가(±억 2자리 · 부호 색) · 보유 「3,401주」 · 출처 모를 매도 「3,783주」 다. `flex flex-wrap gap-x-3 gap-y-0.5` 로 항목 단위로 줄바꿈한다.
    - 캡션은 `break-keep` 이다. 면 상자는 없다.
    - pnl null 이면 소제목 + 「팀 체결 없음」(12/400 --faint)만 있다.
  - **판정 기준(`accum-rules`):** `TeamflowToggle` tone muted 를 재사용했다. 기본 접힘이고 닫히면 본문이 언마운트된다.
    - 본문 1은 `thresholdPartsOf` 조각이다. 수 조각(「1.0억」 · 「30조각」 · 「5,000억」 · 「3,144억」)은 `mono whitespace-nowrap --fg-2` 다.
    - th_mcap_krw 0 은 「시총 상한 없음」, null 은 그 항목 「—」 다.
    - 본문 2~5 는 `ACCUM_RULE_LINES` 다. UI-SPEC A9 문장을 글자 그대로 옮겼다.
    - 8px 아래 출처 줄 「규칙 원문: gh-trade 매집감지(accum-signal) · 팀 매집 분석 §13」 이 온다. 링크는 없다.
  - **출처 칩(`accum-detail-source`):** 상세 맨 끝에 있다. 머리 칩과 같은 클래스에 `whitespace-nowrap` · `self-start` 를 더했다. 「20:30」 은 `ACCUM_LOAD_HM` 에서 온다.
  - 가격 자료가 없어도(`noPrice`) 사이클 표 · 손익 · 판정 기준 · 출처 칩은 그대로 남는다.

## Task Commits

1. **Task 1 RED:** `f7fd04db` test(34-08): 사이클 표 변환 · 조건부 RTL
2. **Task 1 GREEN:** `9d7a1690` feat(34-08): 매집감지 사이클 표(2개↑)
3. **Task 2 RED:** `d612053c` test(34-08): 손익 줄 · 판정 기준 · 출처 칩 · 상세 순서 테스트
4. **Task 2 GREEN:** `2813d3ef` feat(34-08): 매집감지 상세 손익 줄 · 판정 기준 · 출처 칩

REFACTOR 커밋은 없다. 정리할 것이 없었다.

## TDD Gate Compliance

- **Task 1 RED**
  - **대상:** `(t1) multiCycle(cycle 값 중복) → …` 가 첫 단언(`accum-cycles` 존재)에서 AssertionError(`expected null to be truthy`)로 실패했다.
  - **분류기 판정:** `RED_EVIDENCE_OK (target_test_failed)` (`tdd-evidence/34-08-T1-red.json`).
  - **의미 판정:** 목록 렌더 · 한선 행 펼침 · 차트 블록(c1~c7 · h1~h4 green)까지 통과했다. 사이클 표가 아직 없어서 실패했다.
  - **같은 묶음:** lib `cycleRowsOf` 5건은 골격(빈 배열)에서 단언 실패였다. (t2)(사이클 1 → 표 없음)는 잠금 테스트라 골격에서도 green 이다(의도).
- **Task 2 RED**
  - **대상:** `(p1) 천일고속(pnl 있음) → …` 가 첫 단언(`accum-pnl` 존재)에서 AssertionError 로 실패했다.
  - **분류기 판정:** `RED_EVIDENCE_OK (target_test_failed)` (`tdd-evidence/34-08-T2-red.json`).
  - **의미 판정:** 차트 블록과 Task 1 사이클 표 테스트는 green 이었다. 손익 줄이 아직 없어서 실패했다.
  - **같은 묶음:** lib 판정 기준 4건과 RTL (p2)(r1)(s1)(s2)는 단언 실패였다. (s3)은 판정 기준 토글 버튼이 없어 fireEvent 가 DOM 요소 없음으로 멈췄다. 원인은 기능 부재이고, GREEN 뒤에는 단언으로 돈다.
- **GREEN:** 두 태스크 모두 feat 커밋에서 대상 테스트를 포함한 전부가 통과했다.
- **트레이서 게이트(Task 1):** 대화형 · end-of-phase 모드이고 `<verify>` 가 자동 검증뿐이다. GREEN 커밋 뒤 verify 를 다시 돌려 exit 0 · 39/39 를 확인한 뒤 확장했다.

## Verification

- **Task 2 verify(플랜 verification)** 는 exit 0 이다.
  - 순서: shared build → webapp typecheck(`tsc --noEmit && tsc -p tsconfig.e2e.json`) → vitest.
  - vitest 대상: `accum-report.test.ts` · `accum-detail.test.tsx` · `accum-report.test.tsx` · `teamflow-detail.test.tsx`(pnlOf 인자 확장 회귀).
  - 결과는 **115/115** 다. lib 30 · 상세 RTL 19 · 목록 RTL 27 · teamflow 상세 39.
- 변경 파일 eslint 는 error 0 · warning 0 이다.
- **수용 grep:**
  - 표: `data-slot="accum-cycles"` · `shadow-[inset_3px_0_0_var(--team)]` · 「매수 / 매도 수량」 · 「최고 순매수」 · 「장 마감까지」 · `overflow-x-auto`
  - lib: `export function cycleRowsOf` · `export function thresholdLineOf` · `ACCUM_RULE_LINES` · 출처 줄 원문 · 본문 5 원문
  - 상세: `data-slot="accum-pnl"` · `data-slot="accum-rules"` · `data-slot="accum-detail-source"` · `TeamflowToggle` · 손익 캡션 원문 · `<AccumCycleTable`
  - 전부 확인했다.

## Decisions Made

- 수량 칸은 둘 다 null 이면 「—」 하나, 한쪽만 null 이면 「977 / —」 다.
- 사이클 등록 칸의 날짜 접두는 since_date 가 8자리 숫자이고 그날과 다를 때만 붙는다. 결측이면 접두 없이 HH:MM:SS 다.
- 판정 기준 본문 1 의 null 항목은 「—」 만 쓴다. 뒤의 「이상 · 이하」 는 붙이지 않는다.
- 본문 1 은 조각 배열(`thresholdPartsOf`)이 정본이다. 문자열(`thresholdLineOf`)은 조각을 이어 만든다. 렌더와 테스트가 같은 출처를 쓴다.
- 상세 출처 칩은 flex-col 루트에서 늘어나지 않게 `self-start` 를 붙였다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pnlOf` 인자 타입 확장 (teamflow-report.ts — files_modified 밖)**
- **Found during:** Task 2 GREEN
- **Issue:** `pnlOf(payload: TeamflowPayload)` 는 팀 매집 payload 전체 타입을 요구했다. 매집감지 payload(같은 13키 `pnl`)를 넘기면 타입이 맞지 않는다. 같은 null 판정을 새로 만들면 두 보고서 판정이 갈라질 수 있다.
- **Fix:** 인자를 `Pick<TeamflowPayload, 'pnl'> | null | undefined` 로 넓혔다. 함수는 원래 `pnl` 키만 읽어서 동작은 같다. teamflow-detail RTL 39건 회귀가 green 이다.
- **Files modified:** `webapp/src/lib/teamflow-report.ts`
- **Commit:** `2813d3ef`

**2. [Rule 3 - Blocking] RED 커밋에 골격 동봉 (34-02 · 34-06 · 34-07 선례)**
- 없는 함수를 import 하면 로드 실패가 되고, TDD 게이트는 이를 INVALID_RED 로 본다.
- 그래서 Task 1 RED 에 `cycleRowsOf`(빈 배열) 골격을, Task 2 RED 에 `thresholdPartsOf` · `thresholdLineOf` · `ACCUM_RULE_LINES` · `ACCUM_RULE_SOURCE` 골격을 함께 넣었다.

**3. [API 보강] `thresholdPartsOf` 추가**
- 플랜 산출물 목록은 `thresholdLineOf` 만 적었다. 그런데 A9 는 「본문 1 의 값은 mono --fg-2 · 수는 한 덩어리」 를 요구한다. 문자열 하나로는 수만 다르게 그릴 수 없다.
- 그래서 조각 배열 `thresholdPartsOf` 를 정본으로 두고, `thresholdLineOf` 는 조각을 잇게 했다.

그 밖에는 계획대로 실행했다.

## Issues Encountered

None

## Known Stubs

없음.

## Next Phase Readiness

- **34-09 E2E:** 상세 data-slot 을 `accum-cycles` · `accum-pnl` · `accum-rules` · `accum-detail-source` 로 고정했다. 판정 기준 토글은 `[data-slot="accum-rules"] button[aria-expanded]` 다.
- **34-10 폭 백스톱:**
  - 폰 310 에서 사이클 표가 가로 스크롤되고 페이지 가로 스크롤은 0 인지 본다.
  - 손익 항목 「출처 모를 매도 1,234,567주」 가 항목 단위로 줄바꿈되는지 본다.
  - 판정 기준 본문 3 이 4~5줄 `break-keep` 으로 줄바꿈되는지 본다.
- **34-12 라이브 UAT:** 실데이터 다중 사이클 종목에서 사이클 표 # 와 차트 등록 라벨 「· k」 가 같은지 확인한다.
- 원격 DB 적용 · push · 배포는 하지 않았다.

## Self-Check: PASSED
- FOUND: analytics/accum-cycle-table.tsx · analytics/accum-detail.tsx · lib/accum-report.ts · lib/teamflow-report.ts · tdd-evidence 34-08-T1/T2-red.json
- FOUND: f7fd04db · 9d7a1690 · d612053c · 2813d3ef (HEAD 조상)

---
*Phase: 34-accum*
*Completed: 2026-10-20*
