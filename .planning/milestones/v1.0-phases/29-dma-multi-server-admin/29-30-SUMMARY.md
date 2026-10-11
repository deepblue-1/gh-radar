---
phase: 29-dma-multi-server-admin
plan: 30
subsystem: ui
tags: [mockup, admin, workbench, order-server, g-1, decision]

requires:
  - phase: 29-dma-multi-server-admin (29-26)
    provides: "Admin 편집 시트 계좌 줄(account-editor.tsx) · 작업대 상태줄(workbench-status-bar.tsx) 현행 구현"
  - phase: 29-dma-multi-server-admin (29-29)
    provides: "G-1 운영 규칙 — 유효 주문 서버 = 지정 ?? 증권사 기본값 · 지정 변경 즉시 적용 · 「재접속하면 적용」 배지 폐지"
provides:
  - "G-1 Admin 계좌 줄 주문 서버 컨트롤 채택안: admin-control A(칩 줄 아래 「주문 서버」 세그먼트)"
  - "G-1 작업대 계좌별 주문 서버 표시 채택안: workbench-display A(계좌 필 옵션 꼬리표 + 고른 계좌 서버 칩)"
  - "채택 목업 2장 — 29-38 · 29-39 구현의 정본"
affects: [29-38, 29-39]

actuals:
  tokens: 8075
  tasks: 3
  commits: 1
plan_head_before: f45d11cebad2244f836fed94978572243caced3f
plan_head_after: 2ab513c3f3b8cfc37c4ad879105517dddeec71ee

tech-stack:
  added: []
  patterns:
    - "standalone HTML 목업(외부 의존 없음) — 변형 토글 data-variant · 폭 · 테마 · 상황 토글"

key-files:
  created:
    - .planning/phases/29-dma-multi-server-admin/reference/mockup-g1-account-order-server.html
    - .planning/phases/29-dma-multi-server-admin/reference/mockup-g1-workbench-order-server.html
  modified: []

key-decisions:
  - "admin-control: A — Admin 계좌 줄 주문 서버는 서버 칩 줄 아래 「주문 서버」 세그먼트(기본 · KB120 + 등록 서버), 등록 서버 1대면 글자만 (사용자 채택 2026-10-10, 수정 요청 없음)"
  - "workbench-display: A — 작업대 계좌 필 옵션 끝 서버 키 꼬리표 + 필 옆 고른 계좌 서버 키 칩 (사용자 채택 2026-10-10, 수정 요청 없음)"

patterns-established:
  - "목업 커밋은 사용자 채택 뒤에만(검토 게이트)"

requirements-completed: [ADMIN-06, ADMIN-09]

coverage:
  - id: D1
    description: "Admin 계좌 줄 주문 서버 컨트롤 모양 결정 — A(세그먼트) 채택, 목업 커밋"
    requirement: ADMIN-09
    verification: []
    human_judgment: true
    rationale: "UI 모양 결정은 사용자 선택 자체가 산출물 — 구현(29-38) 전 사용자 결정으로 고정"
  - id: D2
    description: "작업대 계좌별 주문 서버 표시 모양 결정 — A(계좌 필 꼬리표 + 서버 칩) 채택, 목업 커밋"
    requirement: ADMIN-06
    verification: []
    human_judgment: true
    rationale: "UI 모양 결정은 사용자 선택 자체가 산출물 — 구현(29-39) 전 사용자 결정으로 고정"

duration: 3h 55m (사용자 결정 대기 포함 · 실행 작업 약 20분)
completed: 2026-10-10
status: complete
---

# Phase 29 Plan 30: G-1 주문 서버 화면 모양 결정 (목업 먼저) Summary

**Admin 계좌 줄은 서버 칩 아래 「주문 서버」 세그먼트(A), 작업대는 계좌 필 옵션 꼬리표 + 고른 계좌 서버 칩(A)으로 사용자가 채택 — 두 목업을 채택 뒤 커밋**

## Performance

- **Duration:** 3h 55m 벽시계(사용자 결정 대기 포함). 실제 실행은 약 20분
- **Started:** 2026-10-10T07:56:49Z
- **Completed:** 2026-10-10T11:51:47Z
- **Tasks:** 3 (Task 1 목업 · Task 2/3 사용자 결정)
- **Files modified:** 2 (생성)

## 채택

```
admin-control: A
workbench-display: A
```

- **admin-control: A** — 「A 세그먼트」. 수정 요청 없음. (사용자 답, 오케스트레이터 다이얼로그, 2026-10-10)
- **workbench-display: A** — 「A 계좌 필 꼬리표」. 수정 요청 없음. (사용자 답, 오케스트레이터 다이얼로그, 2026-10-10)
- 두 결정은 각각 별도 질문으로 받았다(①을 정한 뒤 ②. 두 번째 목업은 Task 3 질문 직전에 열었다).

### 채택안 A 의 그림 (29-38 · 29-39 정본)

**① Admin 계좌 줄 — `mockup-g1-account-order-server.html` 변형 A**
- 서버 체크 칩 줄 아래 한 줄 `주문 서버 [기본 · KB120][KB120][KB121]`. 세그먼트 칸은 「기본 · <증권사 기본 주문 서버>」 + 그 계좌의 등록 서버 순서다. 세그먼트 스타일은 역할 세그먼트(`.seg`)이고, 칸 글자는 12.5px · 4px 10px 로 서버 칩 크기에 맞췄다.
- 등록 서버가 1대인 계좌는 세그먼트가 없고 「주문 서버 **KB120**(기본)」 글자만 나온다.
- 꺼진 서버 칸은 취소선 · 흐린 글자이고 누를 수 없다. 꺼진 서버가 지정돼 있으면 그 칸이 켜진 채 경고색으로 보이고, 계좌 카드 아래에 경고색 한 줄 「KB121 꺼짐 — 기본 KB120 으로」가 붙는다.
- 하단 `admin-accounts-note` 에 문장 하나를 덧붙인다: 「주문 서버를 바꾸면 그 계좌의 새 주문 · 전략은 바로 새 서버로 가요 — 옛 서버의 미체결 · 전략은 그 서버에서 정리하세요」.
- 「기본」 칸은 증권사 단위 「기본 주문 서버」(`/admin/servers`, 29-38 Task 3 에서 이름 변경)를 따른다. 계좌 줄 컨트롤 이름은 「주문 서버」다.

**② 작업대 — `mockup-g1-workbench-order-server.html` 변형 A**
- 계좌 필(`AccountPill` 네이티브 select)의 옵션 글자는 `accountLabelOf(번호, 이름) + " · " + 서버키`이다(예: 「1234-56 · 홍길동 · KB120」).
- 필 바로 옆에 고른 계좌의 서버 키 작은 칩(mono 10px bold · h18 · r5 · `--muted` 바탕 · `--fg-2` 글자 · title 「이 계좌의 주문 서버」)이 붙는다.
- 옛 「주문 서버가 … 로 바뀜 — 재접속하면 적용」 배지는 없어진다(G-1 즉시 적용).

### 렌더 확인에서 나온 것 (구현자 참고)

모든 변형 · 폭 · 테마 · 상황 조합 36장을 헤드리스로 렌더해 봤다(JS 오류 0).

- **29-39 구현자 주의 — A 는 닫힌 필에서 서버 키가 두 번 보인다.** 네이티브 select 는 닫혀 있을 때 고른 옵션 글자를 그대로 보여 준다. 그래서 「1234-56 · 홍길동 · KB120」 꼬리표와 옆의 「KB120」 칩이 같이 보인다. 사용자는 수정 요청 없이 A 를 채택했으므로 목업대로 구현하되, 이 중복을 알고 구현할 것.
- **A 폰 폭:** select 폭은 가장 긴 옵션이 정한다. 계좌명이 길면 서버 칩이 제목줄 다음 줄로 넘어간다(목업은 짧은 가짜 계좌명으로 한 줄에 맞췄다). 실제 계좌명 길이로 확인할 것. `AccountPill` 은 `max-w-full` 이다.
- **B(미채택) 폰:** 라디오 점이 칩 폭을 늘려 KB 첫 계좌의 KB121 칩이 다음 줄로 넘어갔다. 「줄이 늘지 않음」이라는 장점은 폰에서 성립하지 않았다.
- **C(미채택) 폰:** 제목줄 select 때문에 계좌번호 · 계좌명이 말줄임(「123-45-67…」)으로 잘렸다.
- **라이트 테마:** 계좌 필 바탕 `--muted`(#f2f4f6)와 작업대 `<main>` 바탕 `--surface`(#f2f4f6)가 같은 색이라 필 경계가 거의 안 보인다. 실제 앱도 같으므로 목업은 그대로 옮겼다. 이번 결정 범위 밖이다.

## Accomplishments
- G-1 의 새 UI 두 곳을 A/B/C 목업으로 만들었다. 둘 다 standalone 이고, 폰 390 · 데스크톱(440 패널 / 1080) · 라이트/다크 · 상황 토글을 넣었다.
- 사용자가 두 표면 모두 A 를 채택했다. 29-38 · 29-39 의 구현 모양이 고정됐다.
- 목업은 채택 뒤에만 커밋했다(검토 게이트 준수).

## Task Commits

1. **Task 1: G-1 목업 2장** — 작성 시점에는 커밋하지 않았다(계획대로 채택 대기).
2. **Task 2: Admin 계좌 줄 결정** — 사용자 A
3. **Task 3: 작업대 표시 결정 · 채택 뒤 목업 커밋** — `2ab513c3` (docs)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified
- `.planning/phases/29-dma-multi-server-admin/reference/mockup-g1-account-order-server.html` — Admin 편집 시트 「계좌 · 등록 서버」 영역의 주문 서버 컨트롤 변형 A/B/C. 계좌는 KB 2(2대 등록 / 1대 등록) + 교보 1이고, 「KB121 꺼짐」 상황 토글이 있다.
- `.planning/phases/29-dma-multi-server-admin/reference/mockup-g1-workbench-order-server.html` — 작업대 제목줄 + 상태줄의 계좌별 주문 서버 표시 변형 A/B/C. 계좌는 KB 1234-56 → KB120 · KB 7890-12 → KB121 · 교보 → KYOBO119 이고, 「갈림 / 한 서버」 상황 토글이 있다.

## Decisions Made
- `admin-control: A`, `workbench-display: A` — 위 「채택」 절 참고.
- 꺼진 서버 지정 상태는 세 계좌 중 한 계좌에서만 보여야 하고, 정상 지정 상태도 같은 화면에 보여야 했다. 이 둘을 같은 화면에 그리면 앞뒤가 맞지 않아 목업 위쪽 바에 「상황: KB121 켜짐/꺼짐」 토글을 두었다. 토글은 화면 요소가 아니다.

## Deviations from Plan

**1. [Rule 3 - Blocking] 커밋을 2개로 나눔(플랜 Output 「커밋 1개」)**
- **Issue:** SUMMARY 의 `commits:` 는 원장에서 측정한 값이어야 한다. SUMMARY 를 목업과 한 커밋에 넣으면 자기 커밋 해시와 개수를 기록할 수 없다.
- **Fix:** 목업 2장은 `2ab513c3` 로 먼저 커밋하고, SUMMARY 는 별도 docs 커밋으로 넣었다. 둘 다 채택 뒤이고 경로 지정이며 push 는 없다.

**2. [Rule 1 - Visual] 작업대 목업 A 폰에서 서버 칩 줄바꿈 → 가짜 계좌명 단축**
- **Found during:** Task 1 렌더 확인
- **Fix:** 계좌명을 「홍길동 / 단기 / 교보」로 줄였다. 폰 `<main>` 패딩도 app-shell 의 `p-2`(8px)에 맞췄다. 실제 계좌명이 길 때의 줄바꿈 위험은 위 「렌더 확인」 절에 적었다.

**Total deviations:** 2 (Rule 3 1 · Rule 1 1)
**Impact on plan:** 결정과 산출물에는 영향이 없다.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 29-38(Admin 계좌 줄 세그먼트) · 29-39(작업대 계좌 필 꼬리표 + 칩)이 이 SUMMARY 「채택」 절을 정본으로 구현할 수 있다.
- 29-39 는 닫힌 필에서 서버 키가 두 번 보인다는 점을 알고 구현할 것(위 「렌더 확인」 절).

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-10*

## Self-Check: PASSED
- FOUND: mockup-g1-account-order-server.html · mockup-g1-workbench-order-server.html
- FOUND: 2ab513c3 (HEAD 의 조상)
