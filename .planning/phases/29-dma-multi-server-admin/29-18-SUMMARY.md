---
phase: 29-dma-multi-server-admin
plan: 18
subsystem: webapp
tags: [nextjs, admin, servers, radio, switch, sheet, playwright, vitest]
status: complete

requires:
  - phase: 29-13
    provides: "GET/POST /api/admin/servers · PATCH /servers/:key(SERVER_IN_USE) · PUT order-server(SERVER_DISABLED) · PUT quote-primary(relay 409/404 그대로)"
  - phase: 29-15
    provides: "admin-api.ts(fetchAdminServers · setOrderServer · setQuotePrimary · patchAdminServer · upsertAdminServer) · AdminSheet · ADMIN_CHIP_BASE/TONE · mockAdminApi · ADMIN_SERVERS_FIXTURE"
  - phase: 29-17
    provides: "useFieldSave · ADMIN_SEGMENT_ROOT/ITEM · AdminSheet 실제 440px · 다크 카드 면 · 확인 다이얼로그(alertdialog) 결"
provides:
  - "/admin/servers 페이지 · ServersClient(증권사 그룹 · 시세 주 서버 필드 · 시트 상태)"
  - "ServerCard — 역할 칩 · 상태 칩(serverStatusChips) · 주문/시세 네이티브 라디오 · 사용 토글 + 끄기 확인"
  - "ServerSheet({ mode: 'edit' | 'create', server?, onSaved, onClose }) — 편집(host · port 폼 1건) · 추가(키 · 증권사 · 검증)"
  - "e2e P29-S1(390 · 1080) · P29-S2(시세 실패 복귀 · 토글 확인 1080 · 시트 390/1080)"
affects: [29-22, 29-23, 29-26]

actuals:
  tokens: 20700
  tasks: 2
  commits: 2
plan_head_before: b9db525272ab713fdeb74eafd9d289a0d8e5af29
plan_head_after: 198be27cac79d5d3f27443b7241f0678380b915a

tech-stack:
  added: []
  patterns:
    - "카드에 흩어진 배타 선택 = 네이티브 radio 의 name 범위(주문 = order-<증권사> · 시세 = quote) — ARIA radiogroup 을 카드 경계 밖으로 만들지 않는다"
    - "카드 탭 = 편집인 카드 안 확인 다이얼로그는 카드 div 밖 형제로 — 포털이어도 React 이벤트는 트리를 따라 올라가 카드 onClick 이 된다"
    - "겹치면 안 되는 전환(시세 주 서버)은 useFieldSave 대기열 대신 비행 중 라디오 잠금"

key-files:
  created:
    - webapp/src/app/admin/servers/page.tsx
    - webapp/src/components/admin/servers-client.tsx
    - webapp/src/components/admin/server-card.tsx
    - webapp/src/components/admin/server-sheet.tsx
    - webapp/src/components/admin/__tests__/servers-client.test.tsx
    - webapp/src/components/admin/__tests__/server-sheet.test.tsx
    - webapp/e2e/specs/admin-servers.spec.ts
  modified:
    - .planning/phases/29-dma-multi-server-admin/deferred-items.md

key-decisions:
  - "상태 칩 낱말: conn ok 연결 · down 연결 끊김(err) · off 연결 꺼짐(dim) / journal 저널 · 저널 끊김 · 저널 꺼짐 / admin admin · admin 재접속 중(warn) · admin 끊김 · admin 꺼짐 / status null 은 「상태 모름」 한 칩 — 모르는 것을 「끊김」 으로 그리지 않는다"
  - "시세 주 서버 전환은 대기열 없이 비행 중 모든 시세 라디오를 잠근다 — relay break-then-make 가 겹치면 안 된다. 주문 서버는 useFieldSave 대기열 그대로(마지막 값 1건)"
  - "주문/시세 서버 판정은 서버 값과 누른 의도 둘 다 — 비행 중인 라디오 대상 서버의 토글도 잠근다. 라디오는 서버가 켜졌다고 확인한 뒤에만(켜기 비행 중 고르면 SERVER_DISABLED)"
  - "끄기 확인 = 유저 1명 이상일 때만 · 제목 「<키> 사용을 끌까요?」 · 본문 「운영 중 서버에 유저 N명 — 끄면 저널 · admin 연결을 내린다」 · 「취소」/「끄기」. 켜기 · 유저 0 끄기는 확인 없음"
  - "편집 시트는 필드별이 아니라 폼 단위 제출 — host · port 는 relay 가 붙는 한 쌍이라 반쯤 고친 주소가 즉시 재적재되면 안 된다. 바뀐 것 없으면 「저장」 비활성"
  - "추가 시트는 enabled 를 보내지 않는다(DB 기본 꺼짐) · 키 입력은 대문자로 정규화 · 검증은 키 형식 · 접두=증권사 · port 1~65535 · host 공백만(그 밖 형식은 서버 400 문구를 한 줄로)"
  - "오류 문구는 서버 · relay message 원문 그대로(rawErrorText) — 토스트 없음"

requirements-completed: [ADMIN-10]

coverage:
  - id: D1
    description: "트레이서 — /admin/servers 가 KB → 교보 섹션 · 섹션 문장 · sort 순 카드 · 역할 칩 · 상태 칩(상태 모름 · 연결 끊김 · 저널 꺼짐 · admin 재접속 중 · 유저 N) · 주문 라디오(증권사 안 배타 · 꺼진 서버 비활성)를 그리고, 주문 라디오 1번 = PUT order-server 1건 → 재조회 → 칩 이동 · 실패 되돌림 + 카드 한 줄 · 폰 1열/데스크톱 2열"
    requirement: ADMIN-10
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/servers-client.test.tsx#ServersClient — 증권사 그룹 카드 (6건)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin-servers.spec.ts#P29-S1 (390 · 1080)"
        status: pass
    human_judgment: false
  - id: D2
    description: "시세 주 서버 전환 — PUT quote-primary 1건 · 응답 전 그 카드 「전환 중」 · 시세 라디오 전부 잠금 · 성공 → 재조회 칩 이동 · 409 → 원래 라디오 + 카드 한 줄(relay message 원문)"
    requirement: ADMIN-10
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/servers-client.test.tsx#ServersClient — 시세 주 서버 전환 (D-11)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin-servers.spec.ts#P29-S2 시세 주 서버 전환 실패 복귀 · 사용 토글 확인 (1080)"
        status: pass
    human_judgment: false
  - id: D3
    description: "사용 토글 — 주문/시세 서버 비활성 · 유저 0 끄기/켜기 확인 없이 PATCH 1건 · 유저 N 끄기 확인 다이얼로그(취소 0건 · 확인 1건) · 다이얼로그 조작이 편집 시트로 새지 않음 · SERVER_IN_USE 원복 + 한 줄 · 끈 서버 라디오 비활성"
    requirement: ADMIN-10
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/servers-client.test.tsx#ServersClient — 사용 토글 (D-17)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin-servers.spec.ts#P29-S2 시세 주 서버 전환 실패 복귀 · 사용 토글 확인 (1080)"
        status: pass
    human_judgment: false
  - id: D4
    description: "편집/추가 시트 — 카드 탭 → 편집(키 · 증권사 읽기 전용 · host · port 「저장」 PATCH { host, port } 1건) · 「+ 서버」 → 추가(키 · 증권사 세그먼트 · 검증 칸 오류 + 비활성 · POST 1건 · 새 카드 꺼짐 · 상태 모름) · 409 SERVER_EXISTS 한 줄"
    requirement: ADMIN-10
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/server-sheet.test.tsx (7건) · servers-client.test.tsx#편집 · 추가 시트 진입"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin-servers.spec.ts#P29-S2 서버 편집 · 추가 시트 (390 · 1080)"
        status: pass
    human_judgment: false
  - id: D5
    description: "목업 A 대비 시각 정합(다크 · 390/1080 · 카드 · 칩 · 라디오 · 시트 · 확인 다이얼로그)"
    verification:
      - kind: automated_ui
        ref: "playwright:shots/29-18/admin-servers-{390,1080}.png · admin-servers-switching-1080.png · admin-servers-quote-failed-1080.png · admin-servers-off-confirm-1080.png · admin-server-sheet-{edit,create-invalid}-{390,1080}.png"
        status: pass
    human_judgment: true
    rationale: "목업 대비 최종 시각 판정은 사람 몫 — 잘림(leavesOverflowing)과 열 수만 자동으로 잠갔다"
  - id: D6
    description: "실 relay 와의 왕복 — 주문 서버 바뀜 배지(29-22) · 시세 break-then-make(29-23) · 운영 server 결선(29-26)"
    verification: []
    human_judgment: true
    rationale: "이 플랜은 화면과 Express 계약만 목으로 증명했다 — relay 실행은 29-22 · 29-23, 배포는 29-26"

duration: 10min
completed: 2026-10-07
---

# Phase 29 Plan 18: /admin/servers — 증권사 그룹 카드 · 주문/시세 라디오 · 사용 토글 · 편집/추가 시트 Summary

**`/admin/servers` 가 목업 A 대로 섰다. 「KB」 · 「교보」 섹션 아래 서버 카드에서 주문 서버(증권사 안 1대)는 라디오 한 번에 바뀌고, 시세 주 서버(전체 1대)는 「전환 중」 을 거쳐 바뀌거나 relay 409 면 원래 서버로 되돌아가며 카드 안에 relay 문구가 남는다. 사용 토글은 주문/시세 서버를 끌 수 없게 잠그고, 유저가 있는 서버는 끄기 전에 한 번 묻는다. 카드를 누르면 host · port 편집 시트, 「+ 서버」 는 꺼진 채로 만드는 추가 시트다.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-10-06T18:26:52Z
- **Completed:** 2026-10-06T18:36:34Z
- **Tasks:** 2
- **Files modified:** 7 (+ deferred-items.md)

## Accomplishments

- **ServerCard.** 머리 줄에 키 · 역할 칩(주문 서버 = primary · 시세 주 서버 = led-armed) · 「전환 중」 · 사용 토글을 둔다. 그 아래로 `host:port`, 상태 칩(연결 · 저널 · admin · 유저 N, relay 미응답이면 「상태 모름」 한 칩), 라디오 2종, 오류 한 줄이 이어진다. 라디오는 네이티브 `radio` 이고 `name` 이 배타 범위다(`order-KB` · `order-KYOBO` · `quote`).
- **ServersClient.** 주문 서버는 증권사마다 `useFieldSave` 1개로 처리한다(대기열 · 플래시). 시세 주 서버는 전체에 1개이고 비행 중에는 잠근다. 실패 한 줄은 누른 카드에 붙는다. 시트는 재조회 결과에서 같은 키의 서버를 다시 받는다.
- **ServerSheet.** 편집은 키 · 증권사를 읽기 전용으로 두고 host · port 만 폼 1건으로 저장한다. 추가는 증권사 세그먼트 · 키(대문자 정규화) · host · port 를 받고, 검증을 통과하지 못하면 칸 오류를 보이고 버튼을 잠근다. 새 서버는 사용 꺼짐으로 생긴다.
- **e2e.** P29-S1(390 1열 · 1080 2열 · PUT 1건 · 칩 이동 · 잘림 0)과 P29-S2(시세 409 를 손으로 풀어 「전환 중」 → 복귀 · 끄기 확인 취소 0건/확인 1건 · 편집/추가 시트 390/1080)를 둔다.

## Task Commits

1. **Task 1: 트레이서 — 서버 카드 목록 · 「주문 서버」 라디오 즉시 전환 · e2e P29-S1** — `bb88228b` (feat)
2. **Task 2: 시세 주 서버 전환 · 사용 토글 · 편집/추가 시트 · e2e P29-S2** — `198be27c` (feat)

트레이서 게이트: auto 모드가 꺼져 있고 HUMAN_VERIFY_MODE 는 end-of-phase 이며 `<verify>` 는 automated 뿐이다. 그래서 Task 1 의 `<verify>`(typecheck · 단위 6 · P29-S1 ×2)를 다시 돌려 통과를 확인한 뒤 Task 2 로 넘어갔다.

TDD 관측(Task 2): `servers-client.test.tsx` 확장 9건과 `server-sheet.test.tsx` 7건을 먼저 썼다. 그 상태에서 9건은 목표 단언에서 실패했다(setQuotePrimary 0회 · alertdialog 없음 · 토글 활성 기대 불일치 · 시트 없음). `../server-sheet` 모듈은 아직 없었다. 이를 확인한 뒤 구현했다. 플랜 지시(「한 커밋」)와 29-15 · 29-17 선례대로 RED/GREEN 은 한 커밋으로 묶었다.

## Files Created/Modified

- `webapp/src/app/admin/servers/page.tsx` — AppShell + ServersClient
- `webapp/src/components/admin/servers-client.tsx` — 헤더 · 증권사 섹션 · 주문/시세 필드 · 시트 상태 · 하단 안내 · `rawErrorText` · `SERVER_BROKER_LABEL`
- `webapp/src/components/admin/server-card.tsx` — `ServerCard` · `serverStatusChips` · `SERVER_CHIP_TONE` · 사용 토글 + 끄기 확인
- `webapp/src/components/admin/server-sheet.tsx` — `ServerSheet` 편집 · 추가
- `webapp/src/components/admin/__tests__/servers-client.test.tsx` — 15건
- `webapp/src/components/admin/__tests__/server-sheet.test.tsx` — 7건
- `webapp/e2e/specs/admin-servers.spec.ts` — P29-S1 ×2 · P29-S2 ×3
- `.planning/phases/29-dma-multi-server-admin/deferred-items.md` — 목 quote-primary 범위 결함 기록

## 스크린샷 (커밋 안 함 — `shots/` 는 추적 제외)

- `.planning/phases/29-dma-multi-server-admin/shots/29-18/admin-servers-390.png` · `admin-servers-1080.png` — 카드 목록(폰 1열 · 데스크톱 2열)
- `.planning/phases/29-dma-multi-server-admin/shots/29-18/admin-servers-switching-1080.png` — KYOBO119 「전환 중」 · 시세 라디오 잠김
- `.planning/phases/29-dma-multi-server-admin/shots/29-18/admin-servers-quote-failed-1080.png` — 409 되돌림 + 카드 한 줄
- `.planning/phases/29-dma-multi-server-admin/shots/29-18/admin-servers-off-confirm-1080.png` — 끄기 확인 다이얼로그
- `.planning/phases/29-dma-multi-server-admin/shots/29-18/admin-server-sheet-edit-{390,1080}.png` · `admin-server-sheet-create-invalid-{390,1080}.png` — 편집 시트, 그리고 추가 시트의 칸 오류

## Decisions Made

결정은 frontmatter `key-decisions` 에 있다. 요지는 세 가지다.

- **전환은 겹치지 않는다.** 시세 주 서버는 비행 중 잠그고, 주문 서버는 마지막 값 1건만 대기한다.
- **모르는 상태를 「끊김」 으로 그리지 않는다.** relay 가 응답하지 않으면 「상태 모름」 한 칩만 보인다.
- **주소 · 포트는 한 쌍이다.** 서버 시트만 폼 단위로 제출하고, 사용자 시트(29-17)는 필드별 즉시 저장 그대로다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 시각 결함] e2e 스크린샷이 시트 · 다이얼로그 열림 애니메이션 중간을 찍음**
- **Found during:** Task 2 (스크린샷 확인)
- **Issue:** 편집 시트 1080 은 패널이 반쯤 들어온 상태로, 끄기 확인은 흐린 채로 찍혔다. 화면 결함이 아니라 증거 결함이다.
- **Fix:** spec 에 `settled(locator)`(`getAnimations({ subtree: true })` 의 `finished` 대기)를 넣고 시트 · 다이얼로그 스크린샷 앞에서 부른다.
- **Files modified:** `webapp/e2e/specs/admin-servers.spec.ts`
- **Commit:** 198be27c

### 해석

- **「+ 서버」 는 Task 1 에서 비활성 자리였다.** Task 2 에서 추가 시트로 이었다. 조회가 끝나기 전에는 비활성이다.
- **추가 시트의 안내 한 줄**(「새 서버는 사용 꺼짐으로 추가된다 — 카드에서 켠다.」)은 목업에 시트가 없어서 더했다. D-17 「새 서버는 사용 꺼짐으로 생성」 을 화면에서 알리는 문장이다. 페이지 본문(목업 A)에는 목업 밖 요소가 없다.
- **e2e P29-S2 는 3건이다.** 플랜 문구(시세 실패 복귀 · 끄기 확인) 1건에 더해, 편집/추가 시트를 390 · 1080 에서 각각 1건씩 돌렸다. 이름에 모두 `P29-S2` 가 들어 있다.

---

**Total deviations:** 1건(증거 결함 1) + 해석 3
**Impact on plan:** 산출물 · 계약 · 이름은 플랜 Artifacts 표 그대로다. 픽스처 파일은 고치지 않았다.

## Issues Encountered

None.

## Deferred (deferred-items.md 에 기록)

- e2e 목 `mockAdminApi` 의 `quote-primary` 가 증권사 안에서만 `isQuotePrimary` 를 바꾼다. 시세 주 서버는 전체에 1대여야 한다. P29-S2 는 실패 경로만 써서 영향이 없다. 성공 경로 e2e 를 넣을 때 고친다.

## Known Stubs

None.

## User Setup Required

None. 스키마 푸시는 해당 없다. relay 실행(29-22 주문 서버 바뀜 배지 · 29-23 시세 전환)과 배포(29-26)는 뒤 플랜이 맡는다. 29-23 전에 운영에서 시세 라디오를 누르면 relay 404 가 그대로 카드 한 줄이 된다.

## Next Phase Readiness

- **29-22 · 29-23:** 화면은 `PUT order-server` 응답 `{ ok, relayNotified }` 와 `PUT quote-primary` 응답 `{ ok: true }` 를 받는다. 실패는 `{ error: { code, message } }` 의 message 를 그대로 보인다. relay 의 409 message 는 사용자가 읽을 한국어 문장이어야 한다(예: 「새 서버 로그인 실패 — KB120 으로 되돌림」).
- **29-26:** `/admin/servers` 는 push 로 함께 배포된다.

## Verification

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` — 통과(tsc + e2e tsc)
- `vitest run servers-client.test.tsx server-sheet.test.tsx` — 2 files · 22 passed(act 경고 0)
- `pnpm --filter @gh-radar/webapp run test` — 158 files · 3682 passed · 1 skipped
- `playwright test e2e/specs/admin-servers.spec.ts` — 5 passed(+ setup)
- eslint `src/components/admin` · `src/app/admin` · `e2e/specs/admin-servers.spec.ts` — 0
- 인수 기준: `data-slot="admin-servers"` 1 · 「주문 서버는 증권사 안에서 1대」 1 · setOrderServer 2 · 실서버 IP(10.41. · 10.16.207) 0 · `export function ServerSheet` 1 · setQuotePrimary 2 · P29-S2 3
- 스키마 푸시: 해당 없음. 보안검사: `security_enforcement: false` 로 생략. spec-less probe: 건너뜀(29-01 과 같음).

## Self-Check: PASSED

- FOUND: page.tsx · servers-client.tsx · server-card.tsx · server-sheet.tsx · __tests__/servers-client.test.tsx · __tests__/server-sheet.test.tsx · e2e/specs/admin-servers.spec.ts
- FOUND commits(HEAD 조상): bb88228b · 198be27c

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-07*
