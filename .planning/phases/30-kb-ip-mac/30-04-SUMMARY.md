---
phase: 30-kb-ip-mac
plan: 04
subsystem: webapp-admin
tags: [webapp, admin, account-editor, order-ip-mac, account-name-edit, vitest]
status: complete

requires:
  - phase: 30-02
    provides: "shared summarizeOrderEndpoint · OrderEndpointSummary · AdminAccountView.orderEndpoints"
  - phase: 30-03
    provides: "Express GET /users 가 relay 87 IP/MAC 을 병합해 orderEndpoints 를 채운다(relay 실패 = null = 확인 전)"
provides:
  - "KB 계좌 카드 IP/MAC 읽기 줄(admin-account-ipmac) — 설정됨 · 미설정(서버 NIC 값) · 확인 전"
  - "등록 서버 간 87 값 불일치 경고 줄(admin-account-ipmac-mismatch) — 서버마다 한 줄"
  - "빈 계좌명 제목줄 「이름 없음」(--faint · 87 전용 줄 제외)"
  - "「편집」 → 카드 편집 모드(admin-account-edit) · 계좌명 저장 PUT 1건 · 한 카드 잠금(editingKey) · 포커스 복귀"
  - "편집 저장 결과 줄(admin-account-edit-result) — 서버 message 원문 · HTTP 오류 · 입력 변경/취소로 지움"
  - "ChipView.source 'edit' — 편집 저장 실패를 BusyLines 에 두 번 띄우지 않는다"
  - "토글 PUT 이름 = editSave.value 새 이름 ?? 개요 이름(Pitfall 4)"
affects: [30-05, 30-06, webapp-account-editor]

actuals:
  tokens: 12500
  tasks: 3
  commits: 6
plan_head_before: ee7975166f42f8dfaeaa5b491652ac8045ea1764
plan_head_after: 62b1f6ac3f1b102435738f1eed161b76d0bfaf4f

tech-stack:
  added: []
  patterns:
    - "부모가 편집 중인 카드 키 하나를 쥔다(editingKey) · 사라진 키는 렌더 중 null 로 되돌린다(props 변화로 state 조정)"
    - "편집 초깃값 · 초안은 「편집」 클릭 순간 상태로 고정 — 재조회 props 가 덮지 않는다"
    - "결과 덮개 칩에 출처 표시(source) — 표시 위치가 다른 같은 실패를 한 번만 보인다"

key-files:
  created:
    - .planning/phases/30-kb-ip-mac/30-04-SUMMARY.md
  modified:
    - webapp/src/components/admin/account-editor.tsx
    - webapp/src/components/admin/__tests__/account-editor.test.tsx

key-decisions:
  - "편집 저장 결과 줄의 err 문구 = 서버 message 원문, 비어 있으면 칩 낱말(timeout 「응답 없음」 · failed 「실패 · BUSY」) — timeout 이 message 를 실어 오면 원문이 우선(IPMAC-03 원문 원칙 · 플랜 공식 message ?? label)"
  - "warn(offline · skipped) 결과 줄 사유가 없으면 「서버 연결 안 됨」(UI-SPEC §4 문구 그대로 · skipped 도 같은 대체)"
  - "편집 저장 훅은 retainValue 기본(true) + releaseOn: account — 서버 일부 실패(HTTP 성공)에도 새 이름을 재조회 전까지 쥐어 토글이 옛 이름을 싣지 않는다. HTTP 실패면 value 가 풀려 개요 이름으로 돌아간다"
  - "편집 중 「취소」 는 저장 중이면 무시(버튼도 disabled) — 비행 중 편집을 닫아 결과가 갈 곳을 잃지 않게"
  - "교보 편집 블록의 「해당 없음」 NOTE · IP/MAC 칸 · 검증 · 「변경 없음」 은 30-05 몫 — 이 플랜은 계좌명 슬라이스만"

patterns-established:
  - "카드 편집 CTA 접근 이름 = 「{증권사} {계좌번호} 편집 / 편집 취소 / 편집 저장」 — 테스트는 접근 이름으로 찾는다"

requirements-completed: [IPMAC-05, IPMAC-03, IPMAC-02]

coverage:
  - id: D1
    description: "KB 읽기 카드가 87 정규화 IP/MAC(설정됨 · 미설정 · 확인 전)을 그리고 교보에는 줄이 없으며, 등록 서버 간 불일치를 서버마다 경고 한 줄로, 빈 계좌명을 「이름 없음」 으로 보인다"
    requirement: IPMAC-02
    verification:
      - kind: component
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#P30 읽기 카드 — IP/MAC 줄 · 불일치 · 이름 없음 (D-09 · D-10) (6 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "「편집」 → 그 카드만 편집 모드 · 계좌명 저장 PUT 1건(orderEndpoint 키 없음 · servers 그대로) · trim 비교 · 빈 이름 허용 · maxLength 40 · 저장 중 readOnly · 취소 · 재조회 중 입력 유지 · 편집 중 토글 즉시 저장 · 한 카드 잠금 · 포커스 복귀 · D-08 추가 폼 그대로"
    requirement: IPMAC-05
    verification:
      - kind: component
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#P30 편집 모드 — 계좌명 저장 (D-01 · D-02 · IPMAC-05) (11 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "편집 저장의 서버별 실패가 카드 결과 줄에 서버 문구 원문으로 한 번만(BusyLines 0건) · timeout/offline/skipped/HTTP 오류 줄 · 입력 변경/취소로 지움 · 이름 저장 직후 토글이 새 이름을 싣는다"
    requirement: IPMAC-03
    verification:
      - kind: component
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#P30 저장 결과 — 서버 문구 원문 · 중복 없음 (D-06 · IPMAC-03) (8 tests)"
        status: pass
      - kind: command
        ref: "pnpm --filter @gh-radar/webapp exec vitest run src/components/admin (158 passed) · pnpm --filter @gh-radar/webapp run typecheck (exit 0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "폰 390 시트 시각(40자 계좌명 truncate · IP/MAC 줄 감김 · 편집 블록 겹침 없음) — UI-SPEC backstop 항목"
    human_judgment: true
    rationale: "jsdom 컴포넌트 테스트는 레이아웃을 재지 않는다 — 30-06 Playwright 반응형 스펙 · 사람 확인 몫(클래스 계약은 shrink-0 · min-w-0 truncate · break-keep 으로 맞춤)"

duration: 6 min
completed: 2026-10-11
---

# Phase 30 Plan 04: 계좌 카드 IP/MAC 읽기 + 계좌명 편집 수직 슬라이스 Summary

**KB 계좌 카드에 87 정규화 주문자 IP/MAC 줄 · 등록 서버 간 불일치 경고 · 「이름 없음」 을 그리고, 「편집」 → 카드 편집 모드 → 계좌명 PUT 1건 → 칩 · 서버 문구 원문 결과 줄까지 한 경로를 끝냈다(shared summarizeOrderEndpoint 결과만 그림).**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-11T06:28:20Z
- **Completed:** 2026-10-11T06:34:37Z
- **Tasks:** 3 (TDD — RED · GREEN 커밋 각 3)
- **Files modified:** 2

## Accomplishments

- **읽기 카드(D-09 · D-10):** KB 계좌만 지점 · 트레이더 줄 바로 아래 `admin-account-ipmac` 한 줄 — 설정됨 「주문자 IP **010041001124** · MAC **1CFD087D978E**」(값 600 · --fg-2 · 재정규화 없음) · 미설정 「… 미설정(서버 NIC 값)」 · 87 미확인 「… 확인 전」(둘 다 --faint). 다른 등록 서버 값이 다르면 서버마다 `WARN_LINE` 「{서버} 값이 달라요(IP … · MAC …) — 편집에서 저장하면 등록 서버가 모두 같아져요」(미설정이면 「(미설정)」). 빈 계좌명은 제목줄 계좌명 자리에 --faint 「이름 없음」(87 전용 흐린 줄은 그대로).
- **편집 모드(D-01 · D-02 · IPMAC-05):** 「제거」 왼쪽 「편집」(secondary · ACCOUNT_BUTTON · 접근 이름 「KB 12345678901 편집」). 누르면 그 카드만 `data-editing` · --primary 테두리 · 계좌명 칸 autoFocus(maxLength 40 · placeholder 「계좌명(선택)」) · 제목줄 계좌명과 「편집」 · 읽기 IP/MAC 줄 숨김 · 불일치 경고는 편집 블록 안에 유지. 「저장」 = `PUT /accounts { account(새 이름 trim · 나머지 개요 값), servers(active 그대로) }` 1건 — orderEndpoint 없음. trim 비교로 바뀐 게 없으면 비활성 · 저장 중 readOnly · 「취소」「저장」 비활성. 전부 ok 면 닫히고 칩 「반영됨」 · 카드 flash · 재조회 · 포커스 「편집」. 다른 카드 「편집」 은 「다른 계좌 편집 중」 으로 잠기고, 편집 카드가 목록에서 사라지면 풀린다.
- **저장 결과(D-06 · IPMAC-03):** 동작 줄 아래 `admin-account-edit-result` — failed · timeout 은 `EDIT_ERROR_LINE`(12px) + role=alert 「{서버} 실패: {서버 message 원문}」, offline · skipped 는 `WARN_LINE` 「{서버} 미반영: {사유 | 서버 연결 안 됨}」, HTTP 오류는 「저장하지 못했어요 · {message}」(카드 하단 계좌 오류 줄에는 넣지 않음). 실패에도 편집 · 입력 유지, 입력 변경 · 취소 · 다시 열기로 지움. 편집 저장 칩은 `source: "edit"` 로 영역 하단 BusyLines 에서 빠진다(칩 · title 은 그대로).
- **토글 경합(Pitfall 4):** 토글 PUT 계좌 이름 = `editSave.value?.account.name ?? account.name` — 이름 저장 성공 직후 · 재조회 전 토글이 옛 이름으로 되돌리지 않는다.

## Task Commits

1. **Task 1: 읽기 카드 — IP/MAC 줄 · 불일치 · 이름 없음**
   - `744402c2` test(30-04): RED 6건
   - `2bce243d` feat(30-04): GREEN
2. **Task 2: 「편집」 → 편집 모드 · 계좌명 저장 · 한 카드 잠금 · 포커스**
   - `c2eca1f2` test(30-04): RED 10건(+ D-08 가드 1건은 처음부터 통과)
   - `c3b44a96` feat(30-04): GREEN
3. **Task 3: 저장 결과 줄 · HTTP 오류 · BusyLines 중복 · 토글 경합**
   - `90566b24` test(30-04): RED 8건
   - `62b1f6ac` feat(30-04): GREEN

## Files Created/Modified

- `webapp/src/components/admin/account-editor.tsx` — 문구 키(편집 · 저장 · 편집 취소/저장 · 다른 계좌 편집 중 · 계좌명 · 이름 없음 · 주문자 IP · MAC · 미설정 · 확인 전 · ipmacMismatch · editFailedLine) · `IPMAC_LINE` · `EDIT_ERROR_LINE` · `OrderEndpointLine` · `OrderEndpointMismatchLines` · `AccountTitle` noNamePlaceholder/hideName · `AccountRow` 편집 상태 · `editResultLines` · `ChipView.source` · `AccountEditor.editingKey` · JSDoc Phase 30 단락
- `webapp/src/components/admin/__tests__/account-editor.test.tsx` — P30 describe 3개(25 tests)

## Decisions Made

frontmatter `key-decisions` 참조. 요지: 결과 줄 err 문구는 서버 message 원문 우선(없으면 칩 낱말) · warn 사유 없으면 「서버 연결 안 됨」 · 편집 저장 훅이 새 이름을 재조회 전까지 쥐어 토글 경합을 막는다 · 저장 중 「취소」 무시 · 교보 NOTE · IP/MAC 칸은 30-05.

## Deviations from Plan

None - plan executed exactly as written.

- 참고(편차 아님): 수용 기준 `grep -n 'source?: "edit"'` 「1줄」 은 실제 4줄(`ChipView` 필드 · `applyAccountResults` 인자 · `AccountRowProps.onResults` · `AccountEditor.onResults`) — 플랜 (d) 가 요구한 시그니처 확장 그대로라 존재 확인으로 판정했다. `data-slot="admin-account-edit-result"` 는 「1줄 이상」 = 3줄(HTTP 오류 · err · warn).
- 플랜 레벨 `<verification>` 의 webapp vitest 전체는 오케스트레이터 지시(동시 세션 메모리 — admin 컴포넌트 테스트 + typecheck 로 한정)에 따라 `src/components/admin` 9파일 158건으로 돌렸다.

## Issues Encountered

None.

## Known Stubs

없음. 교보 편집 블록의 「교보 계좌는 주문자 IP · MAC 해당 없음」 NOTE · KB IP/MAC 입력칸 · 검증 · 「변경 없음」 · D-10 맞추기 저장 활성은 플랜 범위상 30-05 몫(이 플랜의 objective 「IP/MAC 입력칸 · 검증은 30-05」).

## Next Phase Readiness

- 30-05 는 `EditFields` 에 `ip` · `mac` 을 더하고(초깃값 = summary 표시값), 편집 블록 계좌명 칸 아래 2열 그리드 · 도움말/오류 줄(`EDIT_ERROR_LINE`) · 교보 NOTE · 「변경 없음」 · D-10 불일치면 「저장」 활성을 얹으면 된다. 결과 줄 · 잠금 · 포커스 · 토글 경합 처리는 그대로 재사용.
- 폰 390 레이아웃 backstop(40자 계좌명 · IP/MAC 줄 · 편집 블록)은 30-06 Playwright 몫.

## Self-Check: PASSED

- FOUND: webapp/src/components/admin/account-editor.tsx · webapp/src/components/admin/__tests__/account-editor.test.tsx
- FOUND commits (HEAD 조상): 744402c2 · 2bce243d · c2eca1f2 · c3b44a96 · 90566b24 · 62b1f6ac
- 수용 기준: ipmac data-slot 1/1 · summarizeOrderEndpoint( 1 · admin-account-edit 1 · editingKey 6 · releaseOn: account 2 · EDIT_ERROR_LINE 1 · edit-result 3 · source "edit" 있음 · `-t P30` 25 passed · admin 158 passed · typecheck exit 0 · eslint 0
