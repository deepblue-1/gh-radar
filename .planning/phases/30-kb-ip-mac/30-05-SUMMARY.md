---
phase: 30-kb-ip-mac
plan: 05
subsystem: webapp-admin
tags: [webapp, admin, account-editor, order-ip-mac, validation, vitest]
status: complete

requires:
  - phase: 30-02
    provides: "shared validateOrderEndpointInput · normalizeOrderIp · normalizeOrderMac · summarizeOrderEndpoint"
  - phase: 30-04
    provides: "카드 편집 모드(editingKey · initial/draft · editSave · 결과 줄 · EDIT_ERROR_LINE · source 'edit')"
provides:
  - "KB 편집 모드 「주문자 IP」 · 「MAC 주소」 2열 칸(label htmlFor) · 도움말(admin-account-edit-help) · 검증 오류 줄(admin-account-edit-invalid)"
  - "교보 편집 모드 「교보 계좌는 주문자 IP · MAC 해당 없음」(admin-account-edit-na)"
  - "저장 활성 = 검증 통과 · (바뀜 또는 D-10 불일치) · 저장 중 아님"
  - "editSaveBodyOf — 원문(trim) orderEndpoint 싣기 규칙 · null = 「변경 없음」"
  - "읽기 카드 「변경 없음」 NOTE(admin-account-edit-result · data-tone note)"
affects: [30-06, webapp-account-editor]

actuals:
  tokens: 8700
  tasks: 2
  commits: 4
plan_head_before: 56f641b64ad15215ca103c5126e0055f57cfc7c9
plan_head_after: d56746a056438bc2a7251fceea7763631b77bd45

tech-stack:
  added: []
  patterns:
    - "저장 본문 조립을 순수 함수 하나(editSaveBodyOf)로 — 「보낼지 · 무엇을」 규칙과 「변경 없음」 판정이 한 곳"
    - "검증 규칙은 shared 한 벌, 웹은 오류 종류 → 문구 표(ORDER_ENDPOINT_ERROR_TEXT)만"

key-files:
  created:
    - .planning/phases/30-kb-ip-mac/30-05-SUMMARY.md
  modified:
    - webapp/src/components/admin/account-editor.tsx
    - webapp/src/components/admin/__tests__/account-editor.test.tsx

key-decisions:
  - "본문 조립은 editSaveBodyOf 순수 함수 — 정규화는 「바뀜 · 변경 없음」 비교에만, 보내는 값은 draft 원문 trim(D-07). 형식 오류 값은 정규화가 null 이라 원문으로 비교(호출자가 검증 오류면 저장을 막는다)"
  - "D-10 불일치 판정은 편집을 연 순간이 아니라 지금 props 의 summarizeOrderEndpoint 결과 — 계좌명만 바꿔도 불일치가 있으면 orderEndpoint 를 실어 등록 서버를 맞춘다(플랜 sendEndpoint 식 그대로)"
  - "「변경 없음」 은 읽기 카드의 IP/MAC 줄 · 불일치 줄 아래 NOTE 한 줄(data-slot admin-account-edit-result · data-tone note · role 없음) — 다음 「편집」 을 열 때만 지운다"
  - "IP · MAC 칸 각 셀을 min-w-0 래퍼로 감싸고 입력에 tabular-nums — 폰 390 2열에서 칸이 넘치지 않게(UI-SPEC Typography 「IP · MAC 값은 tabular-nums」)"

patterns-established:
  - "편집칸 테스트는 getByLabelText(「주문자 IP」 · 「MAC 주소」) — 라벨이 접근 이름"

requirements-completed: [IPMAC-02, IPMAC-03]

coverage:
  - id: D1
    description: "KB 편집 모드 IP · MAC 2열 칸 · 도움말 · 첫 오류 하나(IP → MAC → 짝 · 바뀌었을 때만 aria-invalid + 오류 줄) · 초깃값 = 87 정규화값 · 저장 활성 규칙 · D-10 불일치면 바꾸지 않아도 저장 활성 · 교보 「해당 없음」 · 저장 중 readOnly"
    requirement: IPMAC-02
    verification:
      - kind: component
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#P30 IP/MAC 편집칸 · 검증 (D-03 · D-04 · D-05 · D-10) (9 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "보내기 규칙 — orderEndpoint 는 원문 trim(정규화하지 않음) · account 에 IP/MAC 키 없음 · 같은 값(정규화 비교)이면 요청 0 · 「변경 없음」 · 두 칸 비움 = 빈 문자열 둘 · 계좌명만 바뀐 저장 · 교보는 orderEndpoint 없음 · D-10 맞추기 = 출처 값 그대로"
    requirement: IPMAC-02
    verification:
      - kind: component
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#P30 보내기 규칙 — 원문 · 변경 없음 · 비우기 · code 13 (D-06 · D-07 · IPMAC-03) (9 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "code 13 BAD_ORDER_ENDPOINT → 카드 결과 줄 gh-trade 문구 원문 · 편집 모드 · IP/MAC 입력값 유지"
    requirement: IPMAC-03
    verification:
      - kind: component
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#P30 보내기 규칙 — (IPMAC-03) code 13 원문"
        status: pass
      - kind: command
        ref: "pnpm --filter @gh-radar/webapp exec vitest run src/components/admin (176 passed) · pnpm --filter @gh-radar/webapp run typecheck (exit 0) · eslint 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "폰 390 시트 시각 — IP · MAC 2열 칸의 placeholder 1C:FD:08:7D:97:8E 가 잘리지 않고 도움말 줄이 감긴다(UI-SPEC E4 overflow backstop)"
    human_judgment: true
    rationale: "jsdom 컴포넌트 테스트는 레이아웃을 재지 않는다 — 30-06 Playwright 반응형 스펙 · 사람 확인 몫(클래스 계약은 grid-cols-2 gap-2 · min-w-0 셀 · NOTE break-keep)"

duration: 4 min
completed: 2026-10-11
---

# Phase 30 Plan 05: KB 주문자 IP/MAC 편집칸 · 검증 · 보내기 규칙 Summary

**KB 계좌 편집 모드에 「주문자 IP」 · 「MAC 주소」 2열 칸 · 도움말 · shared 검증 한 벌을 얹고, 입력 원문(trim)을 필요할 때만 orderEndpoint 로 싣는다. 같은 값이면 요청 없이 「변경 없음」, 등록 서버 간 불일치면 바꾸지 않아도 맞추기 저장, 교보는 「해당 없음」.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-11T06:39:25Z
- **Completed:** 2026-10-11T06:43:41Z
- **Tasks:** 2 (TDD — RED · GREEN 커밋 각 2)
- **Files modified:** 2

## Accomplishments

- **편집칸(IPMAC-02 · D-05):** KB 편집 블록 계좌명 칸 아래 `mt-2 grid grid-cols-2 gap-2` 두 칸 — `<label htmlFor>` 「주문자 IP」(placeholder `10.41.1.124` · `inputMode="decimal"`) · 「MAC 주소」(placeholder `1C:FD:08:7D:97:8E` · `autoCapitalize="characters"`), 둘 다 `autoComplete="off"` · `spellCheck={false}` · 저장 중 `readOnly`. 그 아래 `NOTE` 도움말 「같은 서버의 두 계좌가 … (ipconfig /all).」. 불일치 경고 줄은 도움말/오류 줄 아래에 남는다.
- **검증(D-04):** `validateOrderEndpointInput` 한 벌 — 첫 오류 하나만(IP → MAC → 짝, 짝 오류는 비어 있는 칸) 그 칸 `aria-invalid` + 도움말 자리 `EDIT_ERROR_LINE`(12px · role 없음). 오류 줄 · 빨간 테두리는 IP 또는 MAC 이 초깃값과 달라졌을 때만. 오류가 있으면 「저장」 비활성.
- **초깃값 · 저장 활성(D-10 · E4):** 초깃값 = 읽기 줄과 같은 출처(유효 주문 서버 87 정규화값) · 미설정 · 확인 전은 빈 칸. 「저장」 = 검증 통과 · (계좌명 trim 또는 IP/MAC 원문 trim 이 바뀜 · 또는 D-10 불일치) · 저장 중 아님.
- **보내기(D-06 · D-07):** `editSaveBodyOf` — IP/MAC 은 KB 이고 (정규화 비교로 바뀜 || 불일치) 일 때만 최상위 `orderEndpoint: { orderIp: draft.ip.trim(), orderMac: draft.mac.trim() }`. 계좌명만 바뀐 저장 · 교보는 싣지 않는다. 두 칸 비움 = `{ "", "" }`. 보낼 것이 없으면 요청 0 · 편집 닫힘 · 포커스 「편집」 · 읽기 카드에 `NOTE` 「변경 없음」(다음 「편집」 때 지움).
- **교보(D-03):** IP/MAC 칸 대신 `NOTE` 「교보 계좌는 주문자 IP · MAC 해당 없음」(`admin-account-edit-na`).
- **code 13(IPMAC-03):** 30-04 결과 줄 경로 그대로 — 「KB120 실패: {gh-trade 원문}」 · 편집 · IP/MAC 입력값 유지 · 다시 저장 가능.

## Task Commits

1. **Task 1: KB IP/MAC 입력칸 · 도움말 · 교보 「해당 없음」 · shared 검증 · 저장 활성 규칙**
   - `5593a413` test(30-05): RED 9건
   - `bf9bc084` feat(30-05): GREEN
2. **Task 2: 보내기 규칙 — 원문 orderEndpoint · 비우기 · 「변경 없음」 · code 13 원문**
   - `78d5d68d` test(30-05): RED 9건(5 실패 · 가드 4건은 처음부터 통과 — 계좌명만 · 계좌명+같은 값 · 교보 · code 13 경로)
   - `d56746a0` feat(30-05): GREEN

## Files Created/Modified

- `webapp/src/components/admin/account-editor.tsx` — 문구 키(ipLabel · macLabel · ipPlaceholder · macPlaceholder · ipmacHelp · kyoboIpmacNa · ipInvalid · macInvalid · pairInvalid · unchanged) · `ORDER_ENDPOINT_ERROR_TEXT` · `EditFields.ip/mac` · `editSaveBodyOf` · `AccountRow` 편집칸 · 검증 · 저장 활성 · `editNote` · JSDoc 30-05 단락
- `webapp/src/components/admin/__tests__/account-editor.test.tsx` — P30 describe 2개(18 tests)

## Decisions Made

frontmatter `key-decisions` 참조. 요지: 본문 조립은 순수 함수 하나 · D-10 불일치는 지금 props 기준(계좌명만 바꿔도 불일치면 맞춘다) · 「변경 없음」 은 읽기 카드 IP/MAC 줄 아래 · 2열 셀 min-w-0 + tabular-nums.

## Deviations from Plan

None - plan executed exactly as written.

- 참고(편차 아님): 플랜 Task 2 `<verify>` 둘째 줄 · 플랜 레벨 `<verification>` 의 webapp vitest 전체는 오케스트레이터 지시(동시 세션 메모리 — admin 컴포넌트 테스트 + typecheck 로 한정 · `--maxWorkers=2`)에 따라 `src/components/admin` 9파일 176건으로 돌렸다.
- 시각: 2열 칸 셀을 `min-w-0` 래퍼로 감싸 폰 폭에서 그리드 셀이 넘치지 않게 했다(손대는 표면 예방 — 결함 관측 아님).

## Issues Encountered

None.

## Known Stubs

없음.

## Next Phase Readiness

- 30-06 은 Playwright 로 폰 390 편집 블록(2열 칸 placeholder 잘림 없음 · 도움말 감김 · 40자 계좌명 · IP/MAC 줄)과 저장 왕복을 확인하면 된다. data-slot: `admin-account-edit` · `admin-account-edit-help` · `admin-account-edit-invalid` · `admin-account-edit-na` · `admin-account-edit-result`.

## Self-Check: PASSED

- FOUND: webapp/src/components/admin/account-editor.tsx · webapp/src/components/admin/__tests__/account-editor.test.tsx
- FOUND commits (HEAD 조상): 5593a413 · bf9bc084 · 78d5d68d · d56746a0
- 수용 기준: `validateOrderEndpointInput(` 1 · `grid grid-cols-2 gap-2` 2(편집 712 · 추가 폼) · edit-help 1 · edit-na 1 · 원문 trim orderEndpoint 1줄 · 「변경 없음」 테스트 `toHaveBeenCalledTimes(0)` · 원문 `toEqual({ orderIp: '10.41.1.124', orderMac: '1c:fd:08:7d:97:8e' })` · `-t "P30 IP/MAC 편집칸"` 9 passed · `-t "P30 보내기 규칙"` 9 passed · account-editor 70 passed · admin 176 passed · typecheck exit 0 · eslint 0
