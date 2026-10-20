---
phase: 34-accum
plan: 04
status: complete
subsystem: ui
tags: [nextjs, react, kpi, list, accordion, a11y, tdd, tracer]

requires:
  - phase: 34-13
    provides: "AccumDayGrid 7열 템플릿 · sortAccumRows · stateLabelOf · fmtPx · 웹 픽스처 로더(accumListRows · accumReportFixture)"
  - phase: 34-03
    provides: "shared dist 직렬화(웨이브 분리 — 코드 의존 없음)"
provides:
  - "webapp lib: accumKpisOf · AccumKpis · endReasonLabelOf · reasonLineOf · isDimRow · accumTagOf · AccumTag · isCarry · isTodayReg · regCellOf · metaLineOf · AccumMetaItem · accumRowDescriptionOf · ACCUM_DROP_TITLE"
  - "AccumKpiStrip(data-slot=accum-kpis) — KPI 4칸 · 보조 글자 · 4번째 칸 부호 색"
  - "AccumDayGrid 행 완성 — 소제목 + 캡션 · xl 열 머리(accum-list-head) · 배지 묶음(accum-badges · accum-state · accum-carry · accum-cycle) · 사유 줄(accum-reason) · 흐림(data-dim) · 태그(accum-tag · accum-high) · 금액(accum-pos · accum-avg · accum-day) · 등록·종료(accum-reg · accum-meta-reg) · sr 설명(accum-row-desc-{isin})"
  - "test-fixtures: accumSyntheticListRows() 합성 7행(KR790000AC01~07) · AC_* ISIN 상수 · accumKstMs"
affects: [34-06, 34-07, 34-08, 34-10]

actuals:
  tokens: 13900
  tasks: 2
  commits: 4
plan_head_before: 54480b026a6ec0bfd95558bef739387be08b8182
plan_head_after: cb6dc49df233d5dba5ad0fea9cf30aa9e8d26a46

tech-stack:
  added: []
  patterns:
    - "목록 행 변환은 전부 lib 순수 함수(태그 · 사유 · 등록 칸 · 메타 · sr 설명) — 컴포넌트는 결과 글자만 배치"
    - "폰 메타 묶음이 xl 에서 contents 로 풀려 금액 칸이 된다 · 등록 항목만 폰(xl:hidden)/xl(hidden xl:flex) 두 벌(글자 모양이 달라서)"
    - "흐림 = cn 의 twMerge 로 열림 때 opacity-100 이 opacity-60 을 대체"

key-files:
  created:
    - webapp/src/components/analytics/accum-kpi-strip.tsx
    - webapp/src/lib/__tests__/accum-report.test.ts
    - .planning/phases/34-accum/tdd-evidence/34-04-T1-red.json
    - .planning/phases/34-accum/tdd-evidence/34-04-T2-red.json
  modified:
    - webapp/src/lib/accum-report.ts
    - webapp/src/components/analytics/accum-day-grid.tsx
    - webapp/src/components/analytics/accum-report.tsx
    - webapp/src/test-fixtures/accum-export.ts
    - webapp/src/components/analytics/__tests__/accum-report.test.tsx

key-decisions:
  - "카드 소제목(h2 id=accum-list-title)과 캡션을 AccumDayGrid 안으로 옮겼다 — 열 머리와 한 곳에 두려고. section 의 aria-labelledby 는 accum-report.tsx 에 그대로 둔다"
  - "합성 행의 등록 시각(reg_time_ms)은 등록 거래일(since_date) 기준 KST ms 로 넣었다. 종료 시각은 그날(20261014) 기준이다. 34-06 차트의 등록선 판정(오늘 등록 사이클만)이 실제 모양과 맞는다"
  - "상한가인데 last_rate 가 null 이면 태그는 「상한가」 하나만 쓴다. 상한가가 아니고 last_rate 가 null 이면 kind none 「—」 이고, 고가 보조줄은 high_rate 가 있으면 남긴다"
  - "등록·종료 칸 2줄: end_reason 0 이고 이월이 아니면(since 결측 포함) 「장 마감까지」. 종료 시각이 null 이면 단어만 쓴다(「청산」)"
  - "metaLineOf 금액 tone 은 'none' 으로 값 없음(--faint)을 표현한다. 등록 항목은 tone 이 없다(--fg-2)"

patterns-established:
  - "합성 목록 행 픽스처: 실측 한 행 위에 평평한 열만 덮어쓰고, KR79 합성 대역 ISIN 과 머리 주석 「합성 — 실측 아님」 을 단다"

requirements-completed: []

coverage:
  - id: D-09
    description: "KPI 4칸: 등록(이월) · 장 마감 보유(매집중 · 매도중) · 종료(청산 · 탈락 · 만료) · 팀 순매수 합(등록 후 · null 제외 · 부호 색 · 합 없음 0.0억 --fg-2) · rows [] 이면 띠 없음"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/accum-report.test.ts#accumKpisOf (4건)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/analytics/__tests__/accum-report.test.tsx#(k1)(k2)(k3)"
        status: pass
  - id: D-08
    description: "정렬 매집중 → 매도중 → 종료 · pos 큰 순 · 소제목 캡션 · xl 열 머리 2줄 · 등록·종료 칸 · 폰 메타 · 접근 이름 · sr 설명"
    verification:
      - kind: unit
        ref: "accum-report.test.tsx#(r1)(r6)(r8)(r9) · accum-report.test.ts#regCellOf · metaLineOf · accumRowDescriptionOf"
        status: pass
  - id: D-10
    description: "하루 순매수 칸은 값만 · 0 = 「0.0억」 --fg-2"
    verification:
      - kind: unit
        ref: "accum-report.test.tsx#(r6)"
        status: pass
  - id: D-11
    description: "배지 묶음 순서 · 사유 줄(사유 2 title) · 흐림은 탈락 · 만료만(청산은 정상 농도) · 열림 때 1"
    verification:
      - kind: unit
        ref: "accum-report.test.tsx#(r2)(r3)(r4) · accum-report.test.ts#종료 사유 · 흐림"
        status: pass
  - id: D-12
    description: "결과 태그 limit 「상한가 +29.8%」 · rate 「+22.1%」 + 「고가 +29.3%」 · U+2212 · last_rate null 「—」"
    verification:
      - kind: unit
        ref: "accum-report.test.tsx#(r5)(r7) · accum-report.test.ts#accumTagOf"
        status: pass
  - id: D-13
    description: "fmtEok · fmtRate · kstHm · fmtYmdShort 재사용(재구현 없음) · 「10/09 등록」 앞 0 유지"
    verification:
      - kind: unit
        ref: "accum-report.test.ts#regCellOf(「10/06 등록」)"
        status: pass

duration: 7min
completed: 2026-10-20
---

# Phase 34 Plan 04: 매집감지 목록 완성 (KPI 4칸 · 행 칸) Summary

**`/analytics/accum` 목록을 완성했다. 머리 아래에 KPI 4칸(등록 · 장 마감 보유 · 종료 · 팀 순매수 합)을 세웠고, 행에는 배지 묶음(상태 → 이월 D+n → 사이클 n), 종료 사유 줄, 흐림, 결과 태그와 고가 보조줄, 팀/하루 순매수, 등록·종료 칸, 폰 3줄 메타, xl 열 머리, sr 설명을 채웠다. 변환은 모두 `lib/accum-report.ts` 순수 함수이고, 합성 7행과 실측 6행으로 골든을 잠갔다.**

## Performance

- **Duration:** 약 7분 (13:33Z 시작 → 13:40Z 마지막 커밋)
- **Completed:** 2026-10-20
- **Tasks:** 2 (Task 1 tracer · Task 2 auto). 둘 다 RED → GREEN 커밋을 한 쌍씩 남겼다.
- **Files:** 신규 4 (컴포넌트 1 · 테스트 1 · RED 증거 2) · 수정 5

## Accomplishments

- **KPI 4칸 (Task 1, 트레이서)**
  - `accumKpisOf` 는 UI-SPEC A2 표 그대로 센다. 합은 null 을 빼고 종료 행을 포함한다. 수가 하나도 없으면 합은 null 이다.
  - `AccumKpiStrip` 은 teamflow 띠를 복제했고 치수는 그대로 두었다.
    - `dd` 는 `flex flex-wrap items-baseline gap-x-2` 이고 truncate 를 걸지 않는다. 그래서 보조 글자가 좁은 칸에서 값 아래로 내려간다.
    - 보조 글자는 0 이어도 지우지 않는다(「이월 0」).
    - 4번째 칸 값만 `TONE_TEXT[toneOf]` 로 칠한다. 합이 없으면 「0.0억」 을 `--fg-2` 로 쓴다.
  - 페이지에서는 ready 이고 행이 있을 때만, 머리 다음 · 목록 카드 앞에 마운트한다.
- **목록 행 (Task 2)**
  - **lib 함수:** `endReasonLabelOf` · `reasonLineOf` · `isDimRow` · `accumTagOf` · `isCarry` · `isTodayReg` · `regCellOf` · `metaLineOf` · `accumRowDescriptionOf` · `ACCUM_DROP_TITLE`.
    - 포매터는 `fmtEok` · `fmtRate` · `kstHm` · `fmtYmdShort` 를 import 해서 쓴다. 새로 만들지 않았다.
  - **행 구성:** 7열 템플릿은 그대로다.
    - 소제목과 캡션 아래에 xl 열 머리를 둔다(`aria-hidden` · `items-end` · 「(등록 후)」 · 「(등록 전 포함)」 2줄).
    - 행 버튼에는 `data-dim` · `aria-describedby` 와 sr 전용 설명 span 을 붙였다.
    - 결과 칸은 「고가」 보조줄을 xl 에서만 보인다. 팀 순매수 칸에는 「평단 · 등록가」 줄을 붙였다(truncate + title).
    - 하루 순매수 칸은 값만 쓴다. 등록·종료 칸은 2줄이다.
    - 폰 메타는 「팀 순매수 · 하루 · 등록 → 종료」 다.
- **합성 픽스처:** `accumSyntheticListRows()` 는 실측 천일고속 행 위에 평평한 열만 덮어쓴 7행이다.
  - 상태 조합: 매집중 · 매도중 · 이월 사이클 2 · 청산 · 이월 탈락 · 이월 만료 · 결측.
  - ISIN 은 KR79 합성 대역(`KR790000AC01`~`07`)이고, 머리 주석에 「합성 — 실측 아님」 을 적었다.

## Task Commits

1. **Task 1 RED:** `0870a980` test(34-04): KPI 4칸 골든 · 합성 목록 행
2. **Task 1 GREEN:** `e1aaa2cd` feat(34-04): 매집감지 KPI 4칸
3. **Task 2 RED:** `25b1e457` test(34-04): 목록 행 변환 골든 · 합성 상태 조합 RTL
4. **Task 2 GREEN:** `cb6dc49d` feat(34-04): 매집감지 목록 행 완성(배지 · 사유 · 흐림 · 태그 · 폰 3줄)

REFACTOR 커밋은 없다. 정리할 것이 없었다.

## TDD Gate Compliance

- **Task 1 RED:** target `(k1) 실측 6행 → 라벨 4개 …` 가 첫 단언 `accum-kpis 존재` 에서 AssertionError(`expected null to be truthy`)로 실패했다. 분류기 판정은 `RED_EVIDENCE_OK` 다(`tdd-evidence/34-04-T1-red.json`).
  - 의미 판정: 로드 · 문법 · 픽스처 오류는 없었다. 같은 파일의 다른 테스트는 SKIP 으로 수집됐다. KPI 띠가 아직 없어서 실패한 것이므로 의도한 RED 다.
- **Task 2 RED:** target `(r2) 흐림 …` 이 첫 단언 `data-dim === "true"` 에서 AssertionError(`expected null to be 'true'`)로 실패했다. 판정은 `RED_EVIDENCE_OK` 다(`tdd-evidence/34-04-T2-red.json`).
  - 의미 판정: 합성 7행이 렌더되어 행 버튼까지는 찾았고, 흐림이 아직 없어서 실패했다. 같은 RED 묶음의 (r1) 정렬은 34-13 `sortAccumRows` 로 이미 green 인 잠금 테스트다.
- **GREEN:** 두 태스크 모두 feat 커밋에서 대상 테스트를 포함한 전부가 통과했다.
- **트레이서 게이트(Task 1):** 대화형 모드이고 `<verify>` 가 자동 검증뿐이라 verify 한 줄을 다시 돌렸다. exit 0 · 22/22 를 확인한 뒤 Task 2 로 넘어갔다.

## Verification

- **Task 2 verify(플랜 verification)** 를 한 줄로 돌렸고 exit 0 이다.
  - 순서: shared build → webapp typecheck(tsc + e2e tsconfig) → vitest `accum-report.test.ts` · `accum-report.test.tsx` · `teamflow-report.test.tsx`.
  - 결과 **66/66**: lib 21 · accum RTL 27 · teamflow RTL 18(회귀 green).
- **수용 grep:**
  - `accum-day-grid.tsx` 에 7열 템플릿 · `data-dim` · `aria-describedby` · 「하루 순매수」 · 「(등록 전 포함)」 · 캡션 문구가 있다.
  - `lib/accum-report.ts` 에 `ACCUM_DROP_TITLE`(문구 포함) · `export function accumKpisOf` · `accumTagOf` · `regCellOf` · `accumRowDescriptionOf` 가 있다.
  - `accum-kpi-strip.tsx` 에 `accum-kpis` 가 있고, `accum-report.tsx` 에 `<AccumKpiStrip` 이 있다.
- **eslint:** 변경 파일 7개에서 error 0 이다. warning 1건(`accum-export.ts` `_payload`)은 34-13 때부터 있던 것이다.
- **ROADMAP SC 3:** 목록 = 종목 행(상태 매집중/매도중/종료 · 이월 D+n · 사유 청산/이월 탈락(복원 안 됨)/이월 만료 · pos KPI · day_net_krw)이 RTL (k1)~(k3) · (r1)~(r9) 로 관측된다.

## Decisions Made

- 카드 소제목(`h2#accum-list-title`)과 캡션을 `AccumDayGrid` 로 옮겼다. 열 머리와 한 곳에서 그리기 위해서다. `section aria-labelledby` 는 페이지에 그대로 있다.
- 합성 행의 등록 시각은 등록 거래일(`since_date`) 기준 KST ms 다. 종료 시각만 그날(20261014) 기준이다. 34-06 차트의 등록선 판정과 실제 모양이 맞도록 했다.
- 상한가인데 `last_rate` 가 null 이면 태그는 「상한가」 하나다. 미도달인데 `last_rate` 가 null 이면 kind `none` 「—」 이고, `high_rate` 가 있으면 고가 보조줄은 남긴다.
- 등록·종료 칸 2줄은 `end_reason` 0 이고 이월이 아니면(since 결측 포함) 「장 마감까지」 다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 테스트 버그] RTL (r7) 결측 행 코드 단언**
- **Found during:** Task 2 GREEN
- **Issue:** RED 때 쓴 단언 `getByText('AC0007')` 은 요소가 하나라고 가정했다. 그런데 계약대로라면 name null 이면 이름 자리가 코드이고, market null 이면 둘째 줄도 코드뿐이다. 그래서 같은 글자가 두 번 나온다(34-13 의 NAMELESS 행과 같은 규칙).
- **Fix:** `getAllByText('AC0007')` 길이 2 로 단언을 고쳤다. 구현은 바꾸지 않았다.
- **Files modified:** `webapp/src/components/analytics/__tests__/accum-report.test.tsx`
- **Commit:** `cb6dc49d`

**2. [범위 · 사소] Task 2 에서 `accum-report.tsx` 도 수정**
- Task 2 의 `<files>` 목록에는 없지만 플랜의 `files_modified` 안에 있는 파일이다.
- 소제목 h2 를 `AccumDayGrid` 로 옮기면서 페이지 쪽 h2 블록을 지웠다. 이유는 수용 기준 「캡션 문구가 `accum-day-grid.tsx` 에 있다」 를 맞추는 것이었다.

그 밖에는 계획대로 실행했다.

## Issues Encountered

없음. 위 (r7) 단언 보정 하나뿐이었다.

## Known Stubs

없음. 34-13 이 남긴 목록 확장 자리(결과 · 금액 · 등록·종료 칸 · 배지 · 사유 · 열 머리 · sr 설명 · 흐림)와 KPI 자리를 이 플랜이 모두 채웠다. 상세(A5~A9) 자리는 34-06~08 몫이다.

## Next Phase Readiness

- 34-06~08 상세는 `isCarry` · `isTodayReg` · `endReasonLabelOf` · `ACCUM_DROP_TITLE` 을 재사용할 수 있다. 합성 픽스처의 이월 · 사이클 2 행(`AC_CARRY`)과 종료 행(`AC_LIQ` · `AC_DROP` · `AC_EXPIRE`)도 같이 쓸 수 있다.
- 34-10 폭 백스톱이 볼 data-slot: `accum-badges` · `accum-reason` · `accum-avg` · `accum-reg` · `accum-meta-reg`.
- 원격 DB 적용 · push · 배포는 하지 않았다(34-11).

## Self-Check: PASSED
- FOUND: accum-kpi-strip.tsx · lib/__tests__/accum-report.test.ts · tdd-evidence 34-04-T1/T2-red.json · 수정 5 파일
- FOUND: 0870a980 · e1aaa2cd · 25b1e457 · cb6dc49d (HEAD 조상)

---
*Phase: 34-accum*
*Completed: 2026-10-20*
