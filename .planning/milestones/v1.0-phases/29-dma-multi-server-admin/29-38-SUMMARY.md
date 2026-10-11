---
phase: 29-dma-multi-server-admin
plan: 38
subsystem: ui
tags: [admin, webapp, order-server, g-1, radix-toggle-group, playwright, express]

requires:
  - phase: 29-37
    provides: "Express PUT /api/admin/dma-users/:dma/accounts/:broker/:accountNo/order-server · 개요 계좌 뷰 orderServer · defaultOrderServer · AdminOrderServerResponse"
  - phase: 29-30
    provides: "채택 admin-control: A — mockup-g1-account-order-server.html 변형 A(서버 칩 줄 아래 「주문 서버」 세그먼트)"
  - phase: 29-43
    provides: "relay servers/status 의 AdminServerLiveStatus.staleAccounts"
  - phase: 29-31
    provides: "폰 36px 터치 타깃 · server-in-use-note 한 줄 양식"
provides:
  - "webapp setAccountOrderServer(dmaUserId, broker, accountNo, serverKey | null) — PUT …/order-server · RELAY_TIMEOUT_MS"
  - "편집 시트 계좌 줄 「주문 서버」 세그먼트(data-slot=admin-order-server) — 기본 · <기본 키> + active 등록 서버 · 1대면 글자만 · 꺼진 칸 잠금 · 꺼진 지정 경고 줄(admin-order-server-off)"
  - "계좌 영역 안내에 gh-trade-84 ②(가) 뒤 문장(ACCOUNT_EDITOR_TEXT.orderServerNote)"
  - "/admin/servers 증권사 단위 이름 「기본 주문 서버」(섹션 안내 · 역할 칩 · 라디오 접근 이름 · 사용 중 한 줄 · Express SERVER_IN_USE)"
  - "/admin/servers 하단 안내 둘째 문장 = 옛 서버 활성 전략 끄고 즉시 재접속(D-10 문장 제거)"
  - "서버 카드 staleAccounts >= 1 경고 한 줄(data-slot=server-stale-note)"
  - "e2e 목 PUT …/order-server · 개요 orderServer/defaultOrderServer · 목 KB121 staleAccounts 2 · 시나리오 P29-G1(390 · 1080)"
affects: [29-39, 29-40, admin-users-ui, admin-servers-ui]

actuals:
  tokens: 7650
  tasks: 3
  commits: 5
plan_head_before: c4f7048cd5489fd524d737b44aa6b82522d3dba4
plan_head_after: b7986478112681d3a58750c8d3bd72b6fa27d2fc

tech-stack:
  added: []
  patterns:
    - "Radix 단일 토글의 \"\"(선택 해제) 를 피하려고 「기본」 칸 값을 별도 센티넬(__default__)로 두고 null 로 매핑"
    - "useFieldSave<string | null> — null 이 유효 값이라 `value !== undefined` 로 의도 값 판정"

key-files:
  created:
    - .planning/phases/29-dma-multi-server-admin/.red/29-38-task1-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-38-task3-red.json
  modified:
    - webapp/src/lib/admin-api.ts
    - webapp/src/lib/__tests__/admin-api.test.ts
    - webapp/src/components/admin/account-editor.tsx
    - webapp/src/components/admin/__tests__/account-editor.test.tsx
    - webapp/e2e/fixtures/admin.ts
    - webapp/e2e/specs/admin.spec.ts
    - webapp/src/components/admin/servers-client.tsx
    - webapp/src/components/admin/server-card.tsx
    - webapp/src/components/admin/__tests__/servers-client.test.tsx
    - webapp/src/components/admin/__tests__/server-card.test.tsx
    - webapp/e2e/specs/admin-servers.spec.ts
    - server/src/routes/admin-servers.ts
    - server/tests/routes/admin-servers.test.ts

key-decisions:
  - "주문 서버 칸은 개요의 active 등록 서버(서버 값)로 그린다 — 칩 토글의 비행 중 의도는 쓰지 않는다(등록 전 서버를 고르면 409 · 미등록 서버 선택 금지)"
  - "칸 순서 = 레지스트리 순(개요 servers) · 레지스트리에 없는 등록 키는 뒤에 · 꺼짐 판정도 개요 servers.enabled"
  - "꺼진 지정 경고 줄과 1대 글자는 저장된 값(개요 orderServer) 기준 — 누른 값(비행 중)으로 경고를 띄우지 않는다"
  - "계좌 영역 안내 문장은 목업 A 문장 대신 gh-trade-84 ②(가) 뒤 문장 — 목업 대비 유일한 문구 이탈"
  - "staleAccounts 한 줄은 사용 중 한 줄과 같은 양식(오른쪽 정렬 12px)에 경고색(--led-latent) · 꺼진 서버에도 보인다"
  - "Express 는 relay 상태 객체를 그대로 통과(fetchLiveStatus 무변경) — staleAccounts 통과는 테스트로 잠갔다"

patterns-established:
  - "증권사 단위 = 「기본 주문 서버」, 계좌 단위 = 「주문 서버」 — 접근 이름도 「<키> 기본 주문 서버」 / 「<증권사> <계좌번호> 주문 서버」"

requirements-completed: [ADMIN-06, ADMIN-09, ADMIN-10]

coverage:
  - id: D1
    description: "setAccountOrderServer — PUT /api/admin/dma-users/:dma/accounts/:broker/:accountNo/order-server { serverKey | null } · 경로 인코딩 · RELAY_TIMEOUT_MS"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/admin-api.test.ts#admin-api — 계좌 주문 서버 지정 (29-38 G-1 ⑦)"
        status: pass
    human_judgment: false
  - id: D2
    description: "계좌 줄 「주문 서버」 세그먼트(채택 A) — 칸 순서 · 즉시 저장 1건 · null · 연타 마지막 값 · 409 오류 줄 · 재조회 정본 · 1대 글자만 · 꺼진 칸 잠금 · 꺼진 지정 경고 줄 · removing/87 전용 제외 · (가) 안내 문장"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#AccountEditor — 계좌 주문 서버(29-38 채택 A)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P29-G1 계좌 주문 서버 고르기 — PUT 1건 · 재조회 값 · 터치 타깃 (390) · (1080)"
        status: pass
    human_judgment: false
  - id: D3
    description: "/admin/servers 「기본 주문 서버」 이름 · 하단 안내 끄고 즉시 재접속 · Express SERVER_IN_USE 문구"
    requirement: ADMIN-10
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/servers-client.test.tsx · server-card.test.tsx"
        status: pass
      - kind: integration
        ref: "server/tests/routes/admin-servers.test.ts#{ enabled: false } 가 주문 서버면 RPC 'server in use' → 409 SERVER_IN_USE · 재적재 0"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin-servers.spec.ts#P29-S1 기본 주문 서버 즉시 전환 (390) · (1080)"
        status: pass
    human_judgment: false
  - id: D4
    description: "서버 카드 staleAccounts >= 1 경고 한 줄 · 0/없음/상태 없음은 없음 · 꺼진 서버에도 · Express 통과"
    requirement: ADMIN-10
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/server-card.test.tsx#ServerCard — 옛 주문 서버에 남은 전략 한 줄 (29-38 · staleAccounts)"
        status: pass
      - kind: integration
        ref: "server/tests/routes/admin-servers.test.ts#(29-38) relay 상태의 staleAccounts … 그대로 통과시킨다"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin-servers.spec.ts#P29-S1 (390 · 1080) server-stale-note 단언"
        status: pass
    human_judgment: false
  - id: D5
    description: "운영 Admin 화면에서 계좌 주문 서버를 바꾸면 relay 가 옛 서버 전략을 끄고 그 사용자 세션이 새 서버로 즉시 재수립 — 화면 · 실 relay · gh-trade 서버 2대 결합"
    verification: []
    human_judgment: true
    rationale: "실 relay · 실 Supabase RPC · gh-trade 서버 2대가 필요한 다중 프로세스 동작 — 이 플랜은 목 API 까지만 본다. 배포 뒤 UAT(29-37 D5 와 함께)."
  - id: D6
    description: "세그먼트 · 경고 줄 · 서버 카드 한 줄의 시각 모양이 채택 목업 A 와 맞는가(라이트/다크 · 폰/데스크톱)"
    verification:
      - kind: automated_ui
        ref: "playwright:admin-order-server-390.png · admin-order-server-1080.png · admin-servers-390.png · admin-servers-1080.png"
        status: pass
    human_judgment: true
    rationale: "스크린샷은 다크 테마만 찍었고 모양 동일성은 사람 눈 판정 — 꺼진 서버 경고색 상황은 단위 테스트(클래스)로만 본다."

duration: 13min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 38: Admin 계좌 주문 서버 세그먼트 · /admin/servers 기본 주문 서버 문구 Summary

**편집 시트 계좌 줄에 채택 A 「주문 서버」 세그먼트(기본 · <키> + active 등록 서버, 즉시 PUT 1건 · 꺼진 칸 잠금 · 꺼진 지정 경고 줄)와 gh-trade-84 ②(가) 안내 문장을 넣고, /admin/servers 를 「기본 주문 서버」 · 끄고 즉시 재접속 문구 · staleAccounts 경고 한 줄로 바꿨다**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-10T16:23:05Z
- **Completed:** 2026-10-10T16:36:25Z
- **Tasks:** 3
- **Files modified:** 13 (코드 · 테스트) + RED 증거 2

## Accomplishments
- Admin 이 시트의 계좌 줄에서 등록 서버 중 하나를 주문 서버로 바로 고른다. 「기본 · KB120」 칸은 지정을 지운다(`serverKey: null`).
- 꺼진 서버 칸은 취소선이고 누를 수 없다. 꺼진 서버가 지정돼 있으면 그 칸이 켜진 채 경고색이고, 카드 아래에 「KB121 꺼짐 — 기본 KB120 으로」 한 줄이 붙는다.
- 계좌 영역 안내가 relay 가 옛 서버의 활성 전략을 끈다는 것과, 되돌릴 때 클라(OCX) 대사가 필요하다는 것을 말한다.
- /admin/servers 의 증권사 단위 컨트롤 이름은 「기본 주문 서버」로 바뀌어 계좌 줄 「주문 서버」와 이름이 갈린다. D-10 「새 로그인부터」 문장은 없어졌다.
- relay 가 끄지 못한 전략이 남은 서버는 카드에 경고 한 줄로 보인다(`staleAccounts`).

## Task Commits

1. **Task 1: 트레이서 — 채택 A 세그먼트 → setAccountOrderServer → 플래시 · 오류 줄 · 재조회 정본 · 꺼짐 표시 · (가) 안내**
   - RED `1f9a711b` (test) · GREEN `eb797b5c` (feat)
2. **Task 2: e2e P29-G1 — 390 · 1080 계좌 줄 주문 서버 고르기 · PUT 1건 · 터치 타깃** — `a685526f` (test)
3. **Task 3: /admin/servers 문구 · 서버 거부 문구 · 서버 카드 끄기 미확인 한 줄**
   - RED `d58109f6` (test) · GREEN `b7986478` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

이 플랜이 진행되는 동안 다른 세션(quick-261011-0yb)이 master 에 커밋 5건을 끼워 넣었다. 위 5건만 이 플랜의 것이다.

## 구현한 채택 모양(A)과 목업 대비 차이

- **모양:** 29-30 「채택」 admin-control A 그대로다. 서버 칩 줄 아래 한 줄은 `주문 서버 [기본 · KB120][KB120][KB121]` 이다. 역할 세그먼트(`ADMIN_SEGMENT_ROOT` · `ADMIN_SEGMENT_ITEM`) 스타일에 칸 글자 12.5px · 좌우 10px 을 얹었다. 등록 서버가 1대면 「주문 서버 **KYOBO119**(기본)」 글자만 나온다. 꺼진 칸은 취소선에 `--faint`, 꺼진 지정 칸은 켜진 채 `--led-latent` 이다. 경고 줄은 카드 안 맨 아래에 있다(목업 `.wline` 자리).
- **목업 대비 차이 1건(필수 기록):** 계좌 영역 안내 문장을 바꿨다. 목업 A 의 「주문 서버를 바꾸면 그 계좌의 새 주문 · 전략은 바로 새 서버로 가요 — 옛 서버의 미체결 · 전략은 그 서버에서 정리하세요」 는 gh-trade-84 답 이전 문장이다. 지금 문장은 「주문 서버를 바꾸면 relay 가 옛 서버에 남은 그 계좌의 활성 전략(상따 · VI · 자동매도)을 끄고 새 서버로 바로 재접속해요 — 옛 서버의 미체결은 그 서버(클라)에서 정리하고, 옛 서버로 되돌릴 때는 클라(OCX) 대사로 잔고를 맞추세요.」 이다. 사유: gh-trade-84 ②(가)에 따라 전략은 relay 가 끈다. 또 「되돌아오면 클라 대사로 맞추라」 는 안내가 추가로 필요했다.
- **그 밖의 차이:** 없음. 폰 칸 높이 36px · 데스크톱 28px 은 29-31 기준이다. 목업 A 의 칸 높이는 데스크톱 기준이라 차이로 세지 않는다.

## TDD Gate Compliance

| Task | RED | GREEN | RED 증거 (junit → `check tdd-red-evidence`) |
|---|---|---|---|
| 1 | `1f9a711b` | `eb797b5c` | `RED_EVIDENCE_OK`. 대상 「서버 칩 줄 아래 「주문 서버」 세그먼트 …」 가 첫 단언 `expect(seg).not.toBeNull()` 에서 AssertionError 로 실패했다. 원인은 세그먼트 부재다. 새 12건은 전부 실패했고(admin-api 2건은 RED 골격의 not implemented 거부), 기존 21건은 green 이었다. 로드 · 픽스처 오류는 없다. |
| 2 | `a685526f` (test 단독) | — | 해당 없음. 이 Task 는 Task 1 에서 이미 구현된 동작을 실제 브라우저로 잠그는 e2e 다. 구현 뒤에 쓰므로 RED 단계가 성립하지 않는다(계획 커밋 예시도 `test(29-38)` 단일). |
| 3 | `d58109f6` | `b7986478` | `RED_EVIDENCE_OK`. 대상 「staleAccounts 2 → 경고색 한 줄 …」 이 첫 단언(줄 존재)에서 실패했다. 문구 단언 10건은 옛 문구를 만나 실패했고, server 쪽은 SERVER_IN_USE message 1건이 실패했다. staleAccounts 통과 잠금 테스트는 기존 동작이라 RED 전부터 green 이었다. |

Task 3 은 문구 · 카드 구현을 테스트보다 먼저 써 버렸다. 그래서 구현 두 파일을 세션 임시 경로로 빼고 그 두 파일만 `git checkout --` 로 되돌린 뒤, 실패 테스트를 돌려 커밋하고 구현을 다시 가져와 GREEN 으로 커밋했다. stash 는 쓰지 않았다.

## Files Created/Modified
- `webapp/src/lib/admin-api.ts`: `setAccountOrderServer` 추가.
- `webapp/src/components/admin/account-editor.tsx`: `OrderServerControl`(세그먼트 · 1대 글자 · 경고 줄), `AccountRow` 의 `order` useFieldSave · `registry` prop, `ACCOUNT_EDITOR_TEXT.orderServer*`, 안내 문장.
- `webapp/src/components/admin/servers-client.tsx`: `groupNote` · `note` 둘째 문장 · 머리 주석.
- `webapp/src/components/admin/server-card.tsx`: `orderRadio` · `orderChip` · `inUse` = 「기본 주문 서버 …」, `staleNote(n)` · `server-stale-note` 한 줄.
- `server/src/routes/admin-servers.ts`: SERVER_IN_USE message, 머리 · 라우트 주석을 G-1 로 바꿨다. `fetchLiveStatus` 는 이미 통과형이라 바꾸지 않았다.
- 테스트: `admin-api.test.ts` · `account-editor.test.tsx` · `servers-client.test.tsx` · `server-card.test.tsx` · `server/tests/routes/admin-servers.test.ts` · `e2e/fixtures/admin.ts` · `e2e/specs/admin.spec.ts` · `e2e/specs/admin-servers.spec.ts`.

## Decisions Made
- 칸은 개요의 active 등록 서버(서버 값)로 그린다. 칩 토글의 비행 중 의도는 쓰지 않는다(미등록 서버 선택 금지).
- 칸 순서는 레지스트리 순이고, 꺼짐 판정은 개요 `servers[].enabled` 다. 경고 줄 · 1대 글자는 저장된 값(개요 `orderServer`) 기준이다.
- `staleAccounts` 한 줄은 사용 중 한 줄과 같은 양식에 경고색이다. 꺼진 서버 카드에도 보인다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] e2e 역할 이름 부분 일치**
- **Found during:** Task 2
- **Issue:** Playwright `getByRole('radio', { name: 'KB120' })` 가 「기본 · KB120」 까지 잡아 strict mode 위반이 났다.
- **Fix:** 칸 지목을 전부 `exact: true` 로 바꿨다.
- **Files modified:** webapp/e2e/specs/admin.spec.ts
- **Committed in:** a685526f

**2. [TDD 순서 복구] Task 3 구현을 테스트보다 먼저 씀**
- **Found during:** Task 3
- **Issue:** 문구 · 카드 구현을 RED 테스트 전에 작성했다.
- **Fix:** 위 「TDD Gate Compliance」 의 방법으로 RED → GREEN 순서를 복구했다. 내 두 파일만 경로 지정으로 되돌렸고 stash 는 쓰지 않았다.
- **Committed in:** d58109f6 (RED) · b7986478 (GREEN)

---

**Total deviations:** 2 (blocking 1 · 절차 복구 1)
**Impact on plan:** 범위 변화 없음.

## Issues Encountered
- 동시 세션(quick-261011-0yb)이 같은 tree 에서 커밋했다. 그 세션의 파일은 스테이징 · 수정하지 않았고, 매 커밋 전 `git status` 를 확인하고 경로를 지정해 스테이징했다. 그 세션의 WIP 가 있는 상태에서도 webapp typecheck 는 green 이었다.
- Playwright webServer 가 `NextFontGoogleFontFileReplacer` 로그를 반복해 냈지만 테스트는 전부 통과했다(`.next` 삭제 불필요).
- 시각 확인: 390 · 1080 스크린샷을 봤다(시트 계좌 줄 · /admin/servers). 섹션 머리 줄 · 역할 칩 「기본 주문 서버」 · stale 한 줄 · 하단 안내에 잘림이나 겹침은 없었다. `leavesOverflowing` 단언도 green 이다.

## Known Stubs
없음.

## Next Phase Readiness
- G-1 Admin 화면 쪽(d)이 끝났다. 29-39(작업대 계좌 필 꼬리표 + 칩)가 남았다.
- ADMIN-06 · ADMIN-10 의 요구문 정정(「증권사별 주문 서버」 → 계좌별 · 「주문/시세 라디오」 → 「기본 주문 서버」)은 29-40 몫이다.
- 배포 뒤 UAT: 실 relay 와 결합된 계좌 지정 → 옛 서버 전략 끄기 → 즉시 재수립(coverage D5).

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*

## Self-Check: PASSED
