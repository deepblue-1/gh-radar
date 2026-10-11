---
phase: 24-limitchaser-buy3
plan: 04
subsystem: webapp-ui
tags: [react, tailwind, container-query, a11y, playwright, vitest, limit-chaser]
status: complete

requires:
  - phase: 24-limitchaser-buy3
    provides: "24-01 buy3 와이어 · 신필드 폼 값 · 에코 런타임 4필드(postBuyPhase 등) · 24-03 감시대상 행 제거"
provides:
  - "매수 탭 = 「매수주문」 공통 카드 + 접이식 선매수 · 추가매수 · 후매수 카드(기본 접힘 · 요약 줄)"
  - "표시 순수 함수 lcValueTextOf · lcSummaryOf · lcRowA11yNameOf · lcRowDimOf (lc-fields.ts)"
  - "SettingGroup fold · precheckText(슬롯만 — 24-06 이 채움) · GroupSummary · GroupNote · groupStatusClassOf"
  - "cardGroupStatusOf(server) — UI-SPEC §11 상태 문구 표 + D-15 꼬리"
  - "D-09 라벨 개명(주문가격 · 비교가격 · 매수잔량) · 시트 제목 · 접근성 이름 접두"
  - "e2e 헬퍼 expandLcGroup · showLc"
affects: [24-05, 24-06, 24-07, 24-08, 24-09]

actuals:
  tokens: 56800
  tasks: 3
  commits: 6
plan_head_before: 8c27d1028ad18b708ce1d3f4500ddb0366f4f172

tech-stack:
  added: []
  patterns:
    - "접힘 = 폼 인스턴스 useState(slot 키) + CSS hidden(언마운트 없음) — 에코 · 탭 · 밴드에 풀리지 않음"
    - "흐림은 행마다 한 번(lcRowDimOf) — SettingGroup dimRows={false} 로 컨테이너 흐림을 끔"
    - "표시 문자열 한 함수(lcValueTextOf) → 행 · 요약 · 시트 「지금」 · 접근성 이름"

key-files:
  created:
    - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
  modified:
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/lc/number-pad-sheet.tsx
    - webapp/src/lib/numpad.ts
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/e2e/specs/a11y.spec.ts

key-decisions:
  - "폰 밴드(<700) 값 쉐브런을 상따 설정 전체에서 숨김(L3) — 본문 344 「최소 잔량 177,000,000주 ›」 4px 넘침을 UI-SPEC E1 처방대로 해소"
  - "시트 「지금 ○○」는 lcValueTextOf(field, form, null) — 에코 런타임을 빼 설정값(「지금 3회」)을 보인다(D-11)"
  - "선매수 금액 0 도 「—」(추가 · 후매수와 같은 규칙) — 서버가 모르는 D-04a 는 기존 amountRequired 경로 그대로"
  - "자동 펼침은 값 행 실패 전부 + 체크 행 거부 · 무응답만 — 그룹 스위치(행 아님) · 에코로는 펼치지 않는다"
  - "매도 쪽 시트 「감시 중」 안내는 기존 상태 문구 판정을 startsWith('감시 중') 으로 — D-15 꼬리가 붙어도 유지"

patterns-established:
  - "e2e: 행을 누르기 전 showLc(page, id) — 접힌 카드를 멱등으로 펼친다(값 읽기 lcValue 는 불필요)"

requirements-completed: []

coverage:
  - id: D1
    description: "매수 카드 4장 순서 · 세 그룹 카드 기본 접힘(hidden, DOM 유지) · 요약 줄 · 접기 버튼은 lc.set 0 · 에코/탭 전환 뒤 유지"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#⑮"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/setting-group.test.tsx#⑨"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-10 의미어 · D-03 「—」 · D-11 「3회 · 남은 2회」 · 소진 안내 · 발동잔량 행 · 요약 항목(R5)"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/lc-fields.test.ts"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#⑯"
        status: pass
    human_judgment: false
  - id: D3
    description: "그룹 상태 문구 표(UI-SPEC §11) · D-15 꼬리 · 상태 색 첫 단어 기준"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-body.test.tsx#②"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-09 라벨 · 시트 제목 · 접근성 이름 접두 · 인라인 Tab 카드 경계(R4) · e2e/a11y 정렬"
    verification:
      - kind: e2e
        ref: "playwright trading-workbench.spec.ts + a11y.spec.ts (grep-invert 기존 실패 3건) — 59 passed"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/inline-navigation.test.tsx#R4"
        status: pass
    human_judgment: false
  - id: D5
    description: "접힌 카드 · 흐림 · 한방 두 행(R6)의 시각 확인"
    verification: []
    human_judgment: true
    rationale: "R6(한방 두 행)은 스케치 009 D 와 눈에 보이게 다르다 — 24-08 사람 시각 확인 대상"

duration: 36min
completed: 2026-09-28
---

# Phase 24 Plan 04: 매수 카드 4장 구조 — 접기 · 요약 · 라벨 · 상태 표시 Summary

**「매수주문」 공통 카드 아래 기본 접힌 선매수 · 추가매수 · 후매수 카드(요약 줄 · 의미어 · 「3회 · 남은 2회」 · 발동잔량 · 소진 안내)를 세우고, D-09 라벨 개명 · 행 단위 흐림 · UI-SPEC §11 상태 문구 표를 표시 순수 함수 한 곳(lc-fields.ts)으로 묶었다.**

## Performance

- **Duration:** 36 min
- **Started:** 2026-09-27T17:47:20Z
- **Completed:** 2026-09-27T18:24:00Z
- **Tasks:** 3/3
- **Files modified:** 17 (신설 1)

## Accomplishments

- 행 조각 확장(`setting-group.tsx`): 제목줄 접기 버튼(`aria-expanded` · `aria-controls` · 스위치는 형제) · 요약 줄 · 사전 검증 줄 슬롯 · 상태 색(`groupStatusClassOf`) · `valueText`/`ariaName` · 행 단위 흐림(한 겹) · 발동잔량 강조/sr-only · 소진 안내. 「회」 단위는 상따에서 0 허용(`maxPieces` 있을 때만 조각 수 규칙).
- 카드 4장 스펙 + 표시 순수 함수(`lcValueTextOf` · `lcSummaryOf` · `lcRowA11yNameOf` · `lcRowDimOf`) · `lcRangeIssue` 「후매수 ON 이면 반등 1~100」(relay zod 동형).
- 폼: `groupStatus` prop 하나 · 접힘 `useState`(R1) · 접힌 카드 안 행 실패 자동 펼침(T-24-19) · 시트 제목/「지금 무제한」 · 게이트 에코 기반 「감시 중」 안내.
- `cardGroupStatusOf(server)`: 매수주문 꺼짐/보유중/켜짐 · 켠 매수 없음/감시 중 · 선 · 추가(포기) · 후매수(소진/보유중) · 매도/취소 「 · 후매수 발동」 꼬리. 「발주 완료 · 무장 해제」 은퇴.
- e2e/a11y: `expandLcGroup` · `showLc` · 스위치 6개 · 새 라벨 · 접힘/펼침 각각 axe.

## Task Commits

1. **Task 1: 행 조각 확장** — `c0e4a0e2` (test RED) → `4469f936` (feat GREEN)
2. **Task 2: 카드 4장 스펙 · 표시 함수 · 폼 조립 · 상태 문구 표** — `6d8e40d9` (test RED) → `9d8aa1c2` (feat GREEN)
3. **Task 3: 인라인 Tab(R4) · e2e · a11y 정렬** — `7e7cf073` (fix — L3 쉐브런) · `64463a2f` (test)

## 검증 결과 (정확한 명령)

- `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/lc/__tests__/setting-group.test.tsx src/lib/__tests__/numpad.test.ts src/components/trading/__tests__/manual-order-form.test.tsx` → 3 files · 233 passed (Task 1)
- `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/lc src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/card-body.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx` → 10 files · 451 passed (lc-fields.test.ts 42 포함, Task 2)
- `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/lc/__tests__/inline-navigation.test.tsx` → 20 passed (Task 3)
- `pnpm --filter @gh-radar/webapp exec vitest --run` (전체) → 125 files · 2556 passed · 1 skipped
- `pnpm --filter @gh-radar/webapp run typecheck` → error TS 0
- `pnpm exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/a11y.spec.ts --grep-invert "5\. 격자|P20-3 최악값|iPhone 가로 폭 844"` → **59 passed** (L3 수정 뒤 재실행도 59 passed)
- 기존 실패 3건(deferred-items) 단독 실행: 「5. 격자」 360 헤더 `<b>삼성전자</b>` 넘침 그대로 · P20-3 은 344 헤더 `<b>삼성전자</b>` 24px 넘침(기존) — 이번 변경 전 첫 실행에서는 **새 행 넘침(「최소 잔량 177,000,000주 ›」 3~4px)** 도 함께 잡혀 L3 로 고쳤다.
- **새 매수 행 실브라우저 폭 측정(24-03 이월):** P20-3 을 헤더 `<b>` 넘침 한 건만 걸러낸 임시 사본으로 돌려 **통과**(사본은 삭제). 행 최소 여유 344 +0.4(기존 기준선 행) · 700 +8.7 · 830 +3.7 · 992 +50.7 px(모두 「최소 잔량 177,000,000주」) · 모든 행 44px · 편집 전후 44px.
- **폰 한 화면 예산(UI-SPEC E1 backstop, 참고 측정):** 390×844 · 기본값 · 세 카드 접힘 — 「주문 진입」 탭 줄 ~ 후매수 카드 끝 562px(≤ 660). 카드 높이 매수주문 128 · 선매수 119 · 추가매수 96 · 후매수 141 · 접기 버튼 32.

## Acceptance 기록

- 변경 전 `grep -nE "(^|[\"' ])(sm|md|lg|xl|2xl):|@media|truncate|text-ellipsis" setting-group.tsx | wc -l` = **0**, 변경 후 0 · `limit-chaser-form.tsx` 뷰포트 브레이크포인트 변경 전 0 → 후 0
- `Collapsible` 0 · `data-slot="lc-group-fold|summary|precheck"` 각 1 · `groupStatusClassOf` export 1
- lc-fields: `slot: 'pre-buy'|'extra-buy'|'post-buy'` 각 1 · 옛 slot 0 · 옛 라벨 0 · `lcValueTextOf`/`lcSummaryOf` export 1
- card-body: `groupStatus={` 1 · 「켜짐 · 켠 매수 없음」 2 · 「 · 후매수 발동」 1 · 코드(주석 외) 「발주 완료 · 무장 해제」 0
- e2e: `async function expandLcGroup` 1 · a11y `'선매수 켜기'` 1 · `'한방체결 켜기'` 두 파일 0 · `호가변경 적용` 0 · `한방 건수 적용` 4

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 시각 결함] 폰 밴드 새 행 폭 넘침 — L3 쉐브런 숨김**
- **Found during:** Task 3 (P20-3 실브라우저)
- **Issue:** 본문 344 에서 「최소 잔량 177,000,000주 ›」(추가매수 최소 · 최대)가 행 안쪽 끝을 3~4px 넘었다(잘림)
- **Fix:** UI-SPEC E1 overflow 처방 그대로 `ValueWithChevron` 쉐브런을 `hidden @min-[700px]/lc:inline` — 상따 설정 전체 한 규칙(새 경계 숫자 0 · 말줄임 0 · 글자 크기 불변)
- **Files modified:** webapp/src/components/trading/lc/setting-group.tsx (+ setting-group.test ⑥ 클래스 단언)
- **Commit:** 7e7cf073

**2. [Rule 2 - 계약 완성] NumberPadSheet `serverValueText` prop**
- **Found during:** Task 2
- **Issue:** 시트 「지금 ○○」가 숫자만 그려 「지금 무제한」(D-10 · must-have)을 말할 수 없었다(파일 목록 밖)
- **Fix:** 선택 prop 하나 — 주면 표시 글자만 바꾸고 「다른 단말」 비교는 숫자 그대로
- **Files modified:** webapp/src/components/trading/lc/number-pad-sheet.tsx
- **Commit:** 9d8aa1c2

**3. [Rule 1 - 테스트 의도] 목록 밖 테스트 기대값 갱신**
- `lc-tracer.test`(「호가변경」→ 선매수 「한방」 · 체크 값 행이라 44px 상자 · 실패 링은 `lc-check-row`) · `use-lc-field-commit.test`(범위 문구 접두 「한방 · …」) · `strategy-card-flow.test`(「발주 완료 · 무장 해제」 은퇴 → 매수주문 「꺼짐」) · `inline-navigation.test` ①④(공통 카드 · 선매수 Tab 순서 — Task 2 verify 가 lc 디렉터리 전체라 Task 2 에서 먼저 갱신)
- **Commits:** 6d8e40d9 · 9d8aa1c2

**4. [해석] 체크 행 자동 펼침 · 매도 쪽 「감시 중」 안내**
- 자동 펼침은 값 행 실패 전부 + 체크 행의 거부 · 무응답(말풍선이 뜨는 경우) — 숨은 체크의 말풍선도 앵커가 숨으면 안 보이므로 같은 원칙을 적용. 매도 쪽 시트 안내는 D-15 꼬리 때문에 `=== '감시 중'` → `startsWith('감시 중')`.

**Total deviations:** 3 auto-fixed(Rule 1 ×2 · Rule 2 ×1) + 해석 1. **Impact:** 아키텍처 변경 없음 · 범위 확장 없음.

## 뒤 플랜이 닫아야 할 것

- **24-05(로그):** 전략 로그 전이 문구는 이 플랜 밖 — `strategy-card-flow` 는 여전히 「매수 발주 — 무장 해제」(`buyFired`) 로그를 기대한다(UI-SPEC 로그 매핑이 삭제 대상으로 지목).
- **24-06(스위치 규칙):** `GATE_KEYS`/`GATE_LABEL`/`ARM_BLOCKED_TEXT` 는 그대로라 「켤 수 없는 이유」 패널이 아직 「매수주문 · 한방체결 · …」 · 「매수가격」 옛 문구를 쓴다. 선 · 추가 · 후매수 스위치 `gateDisabled` 는 세션 미준비만 · 한 필드 확정(`commitToggle`) — D-01/D-02 동반 · 그룹별 무장 가드 · `precheckText`(슬롯만 있음, 폼이 아직 넘기지 않음) · D-16 은 24-06. 한방 체크 ON 의 「선매수 한방 · …」 문구도 24-06.
- **24-07:** 선매수 자동 체크.
- **24-08(사람 시각 확인):** R6 한방 두 행 · 접힌 카드 · 흐림 · L3(폰 밴드 쉐브런 숨김)를 사용자에게 보인다. 폰 한 화면 562px 참고 측정.
- **deferred:** 기존 e2e 실패 3건(5. 격자 · P20-3 헤더 `<b>` 넘침 · iPhone 844 16px) 그대로 — P20-3 은 헤더 넘침만 고쳐지면 새 행 측정까지 통과함을 임시 사본으로 확인했다.

## Known Stubs

없음. `SettingGroup.precheckText` 는 조각 슬롯이고 폼이 아직 값을 넘기지 않는다 — 24-06 이 사전 검증을 채우는 계획된 경계다(화면에 빈 값이 흐르지 않음).

## TDD Gate Compliance

- Task 1: `test(24-04)` c0e4a0e2 — RED 29 failed / 144 (`check tdd-red-evidence` → RED_EVIDENCE_OK, target 「버튼 클릭 → onToggle 1회 …」) → `feat(24-04)` 4469f936 green
- Task 2: `test(24-04)` 6d8e40d9 — RED 113 failed / 409 (RED_EVIDENCE_OK, target card-body 「D-15 — 후매수 발동 …」) → `feat(24-04)` 9d8aa1c2 green
- Task 3: `type="auto"` — 테스트 · e2e 정렬(제품 코드는 L3 결함 수정만)

## Threat Flags

없음 — 새 네트워크 표면 · 인증 경로 없음. T-24-16(상태 문구 = 에코 하나 · 순수 함수 표 테스트) · T-24-17(`lcRangeIssue` 반등 조건 · 최대 0~255 · 추가매수 0~uint32 · 시트 입력 1~100) · T-24-18(텍스트 노드만 · 판정 한 곳) · T-24-19(접힌 카드 자동 펼침) 이행.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/lc/__tests__/lc-fields.test.ts · setting-group.tsx · lc-fields.ts · limit-chaser-form.tsx · card-body.tsx · number-pad-sheet.tsx
- FOUND commits: c0e4a0e2 · 4469f936 · 6d8e40d9 · 9d8aa1c2 · 7e7cf073 · 64463a2f
