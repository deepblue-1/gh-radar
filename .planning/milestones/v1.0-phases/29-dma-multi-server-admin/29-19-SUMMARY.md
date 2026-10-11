---
phase: 29-dma-multi-server-admin
plan: 19
subsystem: webapp
tags: [nextjs, admin, sheet, dma, form-validation, playwright, vitest, radix]
status: complete

requires:
  - phase: 29-13
    provides: "POST /api/admin/users { email, role, dma? } → { ok, relayNotified, results? } · POST /users/:email/dma(404 · 400 viewer · 409 DMA_LINKED) · relay 409 DMA_USER_EXISTS 원문 전달 · zod 규칙(DMA id 8바이트 · KB 5/6 · 서버 증권사 일치)"
  - phase: 29-15
    provides: "admin-api.ts(upsertAdminUser · connectAdminDma — 무수정) · UsersClient · AdminSheet 골격 · mockAdminApi(onRequest · requests)"
  - phase: 29-17
    provides: "UserSheet(「DMA 연결 없음」 자리 data-slot=admin-field-dma) · AccountEditor serverResults · ResultChips · chipOfResult · ADMIN_SEGMENT_* · AdminSheet 440px · 다크 면"
provides:
  - "UserCreateSheet({ servers, onCreated, onFailed?, onClose }) — gmail · 역할 · trader/admin 이면 DMA 그룹 · 버튼 1개 · POST /users 1건"
  - "DmaConnectFields({ servers, value, onChange, errors?, disabled?, showTitle?, idPrefix? }) — 목업 A dmaGroup() · KB 만 지점/트레이더 · 그 증권사 서버만 · 꺼진 서버 비활성"
  - "DmaConnectValue · EMPTY_DMA_CONNECT · validateDmaConnect(value, servers) · toDmaInput · dmaConnectFailure · clearChangedErrors"
  - "UserSheet initialResults prop(생성 응답 → 계좌 칩 초기값) · DMA 없는 trader/admin 의 「DMA 연결」 폼(connectAdminDma 1건)"
  - "UsersClient 「+ 사용자」 활성(목록 읽은 뒤) → 생성 시트 → 재조회 → 그 이메일 편집 시트"
  - "e2e P29-A4(1080) · P29-A5(390) · settled(page) 스크린샷 전 전환 대기"
affects: [29-26]

actuals:
  tokens: 15920
  tasks: 2
  commits: 2
plan_head_before: 5970d47092c3380a4f428edfa9ec20156ea85c01
plan_head_after: fa563e3841fbd00f7674b29ac5c541f6c9607874

tech-stack:
  added: []
  patterns:
    - "생성 결과는 생성 시트가 보이지 않는다 — 부모가 재조회 뒤 그 사용자의 편집 시트를 열고 결과를 「다시 반영」 결과와 같은 길(serverResults)로 계좌 칩에 얹는다"
    - "폼 검증 = 순수 함수 하나(validateDmaConnect) — 버튼 활성(valid)과 칸 아래 한 줄(errors · 채운 칸의 형식 오류만)을 같은 판정에서 꺼낸다 · server zod 와 같은 규칙"
    - "서버 응답 오류는 칸 오류(DMA_USER_EXISTS → DMA id) 또는 하단 한 줄로 갈린다(dmaConnectFailure) — 바깥 칸 오류는 그 칸을 고치면 사라진다(clearChangedErrors)"
    - "e2e 스크린샷 전 document.getAnimations() running 0 대기 — 반쯤 칠해진 세그먼트 · 체크 칸을 결함으로 오독하지 않게"

key-files:
  created:
    - webapp/src/components/admin/user-create-sheet.tsx
    - webapp/src/components/admin/dma-connect-fields.tsx
    - webapp/src/components/admin/__tests__/user-create-sheet.test.tsx
    - webapp/src/components/admin/__tests__/dma-connect-fields.test.tsx
  modified:
    - webapp/src/components/admin/user-sheet.tsx
    - webapp/src/components/admin/users-client.tsx
    - webapp/src/components/admin/__tests__/users-client.test.tsx
    - webapp/e2e/specs/admin.spec.ts

key-decisions:
  - "생성 시트 기본 역할은 trader(목업 A 기본 선택) · 등록 서버 기본 체크는 없음(29-17 계좌 추가와 같은 결정 — 의도하지 않은 서버 등록 방지)"
  - "등록 서버 체크는 고른 증권사의 서버만 보인다(다른 증권사 서버는 숨김 — 목업의 흐린 .sv.off 대신 플랜 behavior 를 따름) · 사용 꺼진 서버는 보이되 비활성 · 증권사를 바꾸면 체크를 푼다"
  - "생성 실패 시 입력(비밀번호 포함)은 남긴다 — DMA id 충돌 뒤 다시 치지 않게. 성공하면 시트가 내려가 상태가 사라진다. 편집 시트 연결 폼은 성공 즉시 비운다(D-06)"
  - "생성 실패(onFailed)도 목록을 다시 읽는다 — relay 409 · 502 는 서버가 허용 행을 upsert 한 뒤라 목록에 「DMA 연결 없음」 행이 생길 수 있다(29-13 결정)"
  - "이메일은 trim 만 해서 보내고(소문자는 서버), 편집 시트 선택 키는 소문자로 잡는다"
  - "DMA 연결 폼은 편집 시트의 역할 표시값(shownRole) 기준 — viewer 에서 trader 로 올리는 즉시 그룹이 펼쳐진다(목업 「나중에 trader 로 올리면 편집 시트에서 DMA 를 연결한다」)"
  - "증권사 세그먼트 표기는 목업 그대로 KB · 교보(편집 시트 배지는 29-17 의 KB · KYOBO 그대로)"

patterns-established:
  - "DMA 입력 폼 한 벌(DmaConnectFields)을 생성 시트와 편집 시트가 같이 쓴다 — 제출 · 버튼은 부모 몫"

requirements-completed: [ADMIN-09]

coverage:
  - id: D1
    description: "트레이서 — 「+ 사용자」 → 생성 시트(trader 기본 · DMA 그룹) → 전부 채워야 버튼 활성 · 문구 「사용자 + DMA 유저 만들기 · 서버 N대에 반영」 → POST /users 1건(trim 이메일 · 정규화 계좌번호 · 레지스트리 순 서버 · name '' · priority 0) → 생성 시트 닫힘 · 재조회 · 승인 대기에서 빠짐 · 그 이메일 편집 시트 · KB120 반영됨 · KB121 실패 · BUSY(원문 title + 한 줄) · 제출 중 비활성 · 502 면 시트 유지 + 한 줄"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/user-create-sheet.test.tsx#UserCreateSheet — trader + DMA + 첫 계좌 한 번에 (D-16 트레이서) · UsersClient 「+ 사용자」 → 생성 → 편집 시트 결과 칩"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P29-A4 생성 시트 — trader + DMA + 첫 계좌 한 번에 → 편집 시트 결과 칩 (1080)"
        status: pass
    human_judgment: false
  - id: D2
    description: "viewer 경로 · 증권사별 필드 · 서버 체크 규칙 · 검증 — viewer 는 그룹 없음 + D-21 안내 + 「사용자 만들기」 + 바디 dma 없음 · 교보면 지점/트레이더 칸 없음 · 그 증권사 서버만 · KYOBO127 꺼짐 비활성 · 증권사 바꾸면 체크 해제 · KB 두 서버 동시 · validateDmaConnect 표(9바이트 · 공백 · 불일치 · 13자 · 지점 4 · 트레이더 5 · 서버 0 · 증권사 불일치 · 꺼진 서버) · 409 DMA_USER_EXISTS → DMA id 칸 아래"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/dma-connect-fields.test.tsx (22건)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/user-create-sheet.test.tsx#UserCreateSheet — viewer · 409 (D-16 · D-21)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P29-A5 (390 — 교보 전환 · viewer 생성 POST 바디)"
        status: pass
    human_judgment: false
  - id: D3
    description: "편집 시트 DMA 연결 — DMA 없는 trader/admin 에 「DMA 연결」 그룹 + 「DMA 유저 + 첫 계좌 만들기 · 서버 N대에 반영」 → POST /users/:email/dma 1건 → 결과 칩 · 재조회 → 계좌 줄(교보 「해당 없음」) · 비밀번호 비움 · 409 는 DMA id 칸 · viewer 는 그룹 없음"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/user-create-sheet.test.tsx#UserSheet — DMA 연결 없는 trader/admin 의 「DMA 연결」 (D-16)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P29-A5 viewer 생성 → trader 로 올림 → 편집 시트 DMA 연결 · 생성 시트 바텀시트 (390)"
        status: pass
    human_judgment: false
  - id: D4
    description: "생성 시트 · 연결 폼의 시각 정합(목업 A createSheet() · dmaGroup() 대비 — 390 바텀시트 · 1080 우측 패널)"
    verification:
      - kind: automated_ui
        ref: "playwright:shots/29-19/admin-user-create-{1080,390}.png · admin-user-create-viewer-390.png · admin-user-created-sheet-1080.png · admin-user-connected-390.png"
        status: pass
    human_judgment: true
    rationale: "목업 대비 최종 시각 판정은 사람 몫 — 잘림(leavesOverflowing) · 시트 폭/높이만 자동으로 잠갔다"

duration: 11min
completed: 2026-10-07
---

# Phase 29 Plan 19: 「+ 사용자」 생성 시트 · DMA 연결 폼 Summary

**시트 하나에서 gmail · 역할을 고르고, trader/admin 이면 DMA id · 비밀번호 · 첫 계좌 · 등록 서버까지 채워 버튼 한 번(`POST /api/admin/users` 1건)으로 사용자 · DMA 유저 · 첫 계좌를 만든다. 결과는 곧바로 열리는 그 사용자의 편집 시트에 서버별 칩(KB121 BUSY 원문 포함)으로 보인다. viewer 로 만든 사용자는 나중에 trader 로 올리면 편집 시트의 같은 폼으로 DMA 를 연결한다.**

## Performance

- **Duration:** 약 11분
- **Started:** 2026-10-06T18:41:01Z
- **Completed:** 2026-10-06T18:52Z
- **Tasks:** 2 (트레이서 1 · TDD 1)
- **Files:** 신규 4 · 수정 4

## Accomplishments

- **트레이서(Task 1):** `DmaConnectFields` · `validateDmaConnect` · `toDmaInput` · `UserCreateSheet` 를 만들고 `UsersClient` 의 「+ 사용자」 를 생성 시트로 이었다. 성공하면 재조회한 뒤 그 이메일의 편집 시트를 열고, 생성 응답을 `UserSheet.initialResults` 로 계좌 칩에 얹는다. `P29-A4` green 뒤 tracer `<verify>` 를 다시 돌려 확인했다(⚡ Tracer verified end-to-end — expanding).
- **확장(Task 2):** viewer 경로(D-21 안내 · 「사용자 만들기」 · dma 없는 바디), 409 `DMA_USER_EXISTS` → DMA id 칸 아래 한 줄(그 칸을 고치면 사라짐)을 더했다. DMA 없는 trader/admin 의 편집 시트에는 「DMA 연결」 폼을 넣었다(`connectAdminDma` 1건 → 결과 칩 → 재조회가 계좌 줄을 그린다). 증권사별 칸 · 서버 체크 규칙은 단위 표로 잠갔다.
- `admin-api.ts` 는 고치지 않았다(29-15 계약 그대로).

## Task Commits

1. **Task 1: 트레이서 — 「+ 사용자」 → trader + DMA 그룹 → POST 1건 → 편집 시트 결과 칩 · e2e P29-A4** — `e37f231d` (feat)
2. **Task 2: viewer 경로 · 증권사별 필드 · 서버 체크 규칙 · 검증 · DMA 연결 없는 사용자 연결 폼 · e2e P29-A5** — `fa563e38` (feat)

TDD 관측(Task 2): `dma-connect-fields.test.tsx`(신규)와 `user-create-sheet.test.tsx` 확장을 먼저 썼다. 그 상태에서 5건이 목표 단언에서 실패했다. `dmaConnectFailure` 미존재, viewer 안내 문장 없음, 409 가 칸이 아닌 하단으로 감, 편집 시트 연결 폼 없음(2건)이다. 이를 확인한 뒤 구현했다. `validateDmaConnect` 표는 Task 1 구현이 이미 통과시켰다. 플랜 지시(「한 커밋」)와 29-15 · 29-17 선례대로 RED/GREEN 은 한 커밋으로 묶었다.

## 스크린샷 (커밋 안 함 — `shots/` 는 추적 제외)

- `.planning/phases/29-dma-multi-server-admin/shots/29-19/admin-user-create-1080.png` — 우측 패널 생성 시트(trader · KB · 두 서버 체크 · 「서버 2대에 반영」).
- `.planning/phases/29-dma-multi-server-admin/shots/29-19/admin-user-created-sheet-1080.png` — 생성 직후 편집 시트(KB120 반영됨 · KB121 실패 · BUSY · 한 줄).
- `.planning/phases/29-dma-multi-server-admin/shots/29-19/admin-user-create-390.png` — 폰 바텀시트(교보 — 지점/트레이더 칸 없음 · KYOBO 서버만).
- `.planning/phases/29-dma-multi-server-admin/shots/29-19/admin-user-create-viewer-390.png` — viewer 안내 · 「사용자 만들기」.
- `.planning/phases/29-dma-multi-server-admin/shots/29-19/admin-user-connected-390.png` — trader 로 올려 연결한 뒤 편집 시트(교보 계좌 「해당 없음」 · KYOBO119 반영됨).

## Decisions Made

결정은 frontmatter `key-decisions` 에 있다. 요지는 세 가지다.

- **결과 표시는 편집 시트 몫이다.** 생성 시트는 성공하면 내려가고, 결과 칩은 「다시 반영」 과 같은 길로 계좌 칩에 얹힌다.
- **검증 판정은 하나다.** 버튼 활성과 칸 아래 한 줄을 같은 순수 함수에서 꺼낸다. 규칙은 server zod 와 같다.
- **서버 체크에는 기본값이 없다.** 고른 증권사의 서버만 보인다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 막힘] files_modified 밖 테스트 1개**
- **Found during:** Task 1
- **Issue:** `users-client.test.tsx` 가 「+ 사용자」 는 29-19 전까지 비활성이라고 단언하고 있었다.
- **Fix:** 목록을 읽은 뒤 활성으로 단언을 바꿨다. 로딩 중 비활성은 `user-create-sheet.test.tsx` 가 잠근다. `UsersClientProps.onCreate` 자리는 지웠다. 생성 시트를 `UsersClient` 가 직접 소유한다(호출처 `app/admin/users/page.tsx` 는 prop 을 넘기지 않아 무수정).
- **Commit:** e37f231d

**2. [Rule 1 - 측정 결함] e2e 스크린샷이 CSS 전환 도중에 찍힘**
- **Found during:** Task 1 · Task 2 (스크린샷 확인)
- **Issue:** 방금 누른 체크 칸 · 세그먼트가 반쯤 칠해진 채 찍혔다. 처음에는 시각 결함으로 보였다. 실측해 보니 클릭 직후 `aria-checked` 는 맞았고, 배경만 `rgba(…,0.19)` 로 전환 중이었다. 1초 뒤에는 정상이었다. 편집 시트 샷 하나는 슬라이드 인 도중이기도 했다.
- **Fix:** `settled(page)`(running 애니메이션 0 대기)를 스크린샷 5곳 앞에 두고, 편집 시트 슬라이드 끝(오른쪽 끝 1080)을 기다리게 했다. 컴포넌트 결함이 아니라 코드는 바꾸지 않았다.
- **Commit:** e37f231d · fa563e38

### 해석

- **viewer 안내 문장:** 목업의 「분석」 을 D-21 에 따라 「테마」 로 바꿨다(플랜 지시).
- **지점 · 트레이더 칸:** 목업에는 없지만 D-23 ③ 에 따라 KB 를 고를 때만 보인다.
- **등록 서버 표시:** 목업은 다른 증권사 서버를 흐리게(`.sv.off`) 보였다. 플랜 behavior 「KB 서버 체크 숨김」 에 따라 그 증권사 서버만 그린다. 안내 문장 「증권사에 맞는 서버만 고를 수 있다」 는 그대로 뒀다.
- **편집 시트 연결 버튼 문구:** 목업 B 3단계 버튼 그대로 「DMA 유저 + 첫 계좌 만들기 · 서버 N대에 반영」 이다. 시트를 2단계로 나누지는 않았다(prohibition 준수). 생성은 목업 A 한 시트다.

---

**Total deviations:** 2건(막힘 1 · 측정 결함 1) + 해석 4
**Impact on plan:** 산출물 · 이름 · 계약은 플랜 Artifacts 표 그대로다. 다만 `UserCreateSheet` 에 `onFailed` 를, `DmaConnectFields` 에 `disabled · showTitle · idPrefix` 를 선택 prop 으로 더했다.

## Issues Encountered

None.

## Known Stubs

None. `showTitle` prop 은 현재 두 호출처 모두 기본값(true)을 쓴다. 그룹 머리 「DMA 연결 · 필수」 를 감출 자리가 생기면 쓸 수 있게 남겨 뒀다(스텁 아님).

## User Setup Required

None. 스키마 푸시는 해당 없다. webapp 배포(push)는 29-26 몫이다.

## Next Phase Readiness

- 29-26(배포 · 실 relay 결선): 생성 · 연결 경로가 실 Express → relay 를 지날 때 결과 배열 해석은 29-17 칩 규칙을 그대로 쓴다. 실 relay 의 `DMA_USER_EXISTS` 코드 문자열은 29-13 이 원문 그대로 전달한다.

## Verification

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck`: 통과(tsc + e2e tsc)
- `vitest run src/components/admin/__tests__`: 8 files · 97 passed
- `pnpm --filter @gh-radar/webapp run test`: 160 files · 3716 passed · 1 skipped
- `playwright test e2e/specs/admin.spec.ts`: 8 passed(setup · A1 ×2 · A2 · A3 ×2 · A4 · A5)
- eslint `src/components/admin` · `e2e/specs/admin.spec.ts`: 0
- 인수 기준: UserCreateSheet 1 · DmaConnectFields export 1 · 「사용자 + DMA 유저 만들기」 2 · P29-A4 2 · 「스캐너 · 뉴스 · 테마만」 1 · user-sheet DmaConnectFields 3 · connectAdminDma 2 · P29-A5 1(전부 ≥1)
- 스키마 푸시는 해당 없다. 보안검사는 `security_enforcement: false` 로 생략했다. spec-less probe 는 건너뛰었다(29-01 과 같음).

## Self-Check: PASSED

- FOUND: user-create-sheet.tsx · dma-connect-fields.tsx · __tests__/user-create-sheet.test.tsx · __tests__/dma-connect-fields.test.tsx · user-sheet.tsx · users-client.tsx · e2e/specs/admin.spec.ts
- FOUND commits(HEAD 조상): e37f231d · fa563e38

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-07*
