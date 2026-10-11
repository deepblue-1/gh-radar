---
phase: 29-dma-multi-server-admin
plan: 17
subsystem: webapp
tags: [nextjs, admin, sheet, immediate-save, playwright, vitest, radix-dialog]
status: complete

requires:
  - phase: 29-13
    provides: "Admin API 라우트 표 — PATCH 역할 · PUT/DELETE 계좌 · 비밀번호 · 다시 반영 · DELETE 사용자({ deleted, results? })"
  - phase: 29-15
    provides: "admin-api.ts 14함수 · UsersClient(selected) · AdminSheet 골격 · ReflectChip · mockAdminApi(onRequest · requests)"
provides:
  - "UserSheet — 역할 · DMA id · 비밀번호 · 계좌 · 하단 사용자 삭제/다시 반영(저장 버튼 없음)"
  - "useFieldSave<T> — 필드당 1건 비행 · 마지막 값 대기 · 플래시 ADMIN_FIELD_FLASH_MS(700) · 실패 한 줄 · results 보관"
  - "RoleSegment · ADMIN_SEGMENT_ROOT/ITEM · ADMIN_FLASH_CLASS"
  - "AccountEditor — 계좌 줄 · 증권사 서버 토글 · 계좌 추가 · 제거(마지막은 onRemoveLast) · 해당 없음 · 서버에만 있음 줄 · BUSY 줄"
  - "chipOfResult · RESULT_CHIP · ResultChips · BusyLines · busyLineText — 응답 결과 → 칩 한 벌(29-18 · 29-19 재사용 가능)"
  - "PasswordChange — 입력 + 확인 · 전송 즉시 비움 · 서버별 칩"
  - "ReflectChip text 덮어쓰기 prop"
  - "AdminSheet 우측 패널 실제 440px · 다크 카드 면"
  - "e2e P29-A3(1080 · 390)"
affects: [29-18, 29-19, 29-26]

actuals:
  tokens: 26500
  tasks: 3
  commits: 3
plan_head_before: adf4164f1ca20a48bd517270a8e2c189832a5e43
plan_head_after: 5414cffc66591c29f9f0e0fcaf5e50d1ac6ae348

tech-stack:
  added: []
  patterns:
    - "Admin 편집 = 필드마다 useFieldSave 1개 — 저장 버튼 없음 · 토스트 없음 · 결과는 그 자리 칩/한 줄"
    - "응답 결과 칩은 시트가 열린 동안 개요 칩보다 앞선다(응답이 87 스냅샷보다 새 소식) — 계좌 단위 결과는 그 계좌만, 다시 반영 결과는 그 서버의 미반영 계좌만"
    - "위험 작업 확인 = 시트 안에 둔 Dialog(role=alertdialog) — Radix 중첩 레이어라 시트가 같이 닫히지 않는다"

key-files:
  created:
    - webapp/src/components/admin/use-field-save.ts
    - webapp/src/components/admin/role-segment.tsx
    - webapp/src/components/admin/user-sheet.tsx
    - webapp/src/components/admin/account-editor.tsx
    - webapp/src/components/admin/password-change.tsx
    - webapp/src/components/admin/__tests__/user-sheet.test.tsx
    - webapp/src/components/admin/__tests__/account-editor.test.tsx
  modified:
    - webapp/src/components/admin/users-client.tsx
    - webapp/src/components/admin/user-row.tsx
    - webapp/src/components/admin/reflect-chip.tsx
    - webapp/src/components/admin/admin-sheet.tsx
    - webapp/e2e/specs/admin.spec.ts

key-decisions:
  - "필드 저장 실패 시 대기 값은 보내지 않고 접는다(limit-chaser-defaults 「대기 건은 실패로 접는다」 동형) — 표시는 서버 값으로 돌아간다"
  - "useFieldSave 의 value 는 성공 뒤에도 마지막 저장값을 들고 있다 — 계좌 PUT 의 서버 일부 실패도 의도는 저장된 것(D-05)이라 토글은 켜진 채"
  - "다시 반영 결과의 실패는 이미 반영된(ok) 계좌 칩을 실패로 칠하지 않는다 — shared pendingTone 과 같은 판정"
  - "결과 → 칩: ok 반영됨 · failed 실패 · BUSY(message title) · timeout 응답 없음(err) · offline 서버 연결 안 됨(warn) · skipped 미반영(warn)"
  - "서버 토글 알약은 목업 .sv 그대로 키 + 상태 낱말 칩(「KB121 [실패 · BUSY]」) — 키를 두 번 쓰지 않으려고 ReflectChip 에 text 덮어쓰기를 더했다"
  - "「계좌는 서버 1대 이상」 은 계좌마다 되풀이하지 않고 영역 아래 한 번 + 잠긴 토글 title"
  - "비밀번호는 「변경」 누르는 즉시 두 칸을 비우고 useFieldSave(retainValue:false) 로 값을 상태에 남기지 않는다(D-06)"
  - "계좌 추가 기본 서버 선택은 없음 — 의도하지 않은 서버 등록을 막는다(서버 0 이면 「추가」 비활성)"

requirements-completed: [ADMIN-09]

coverage:
  - id: D1
    description: "트레이서 — 행 → 편집 시트(제목 이메일 · 역할 칩) · 서버에만 있음 행은 열리지 않음 · 역할 세그먼트 즉시 PATCH 1건 · 비행 중 막지 않음 · 마지막 값 1건만 대기 · 플래시 700ms → idle · 재조회 1회 · 재조회의 같은 사용자로 시트 갱신 · SELF_LOCKOUT 되돌림 + 한 줄 · 저장 버튼 없음"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/user-sheet.test.tsx#UsersClient → UserSheet 열기 · UserSheet — 역할 즉시 저장 (D-15)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P29-A3 (1080 · 390)"
        status: pass
    human_judgment: false
  - id: D2
    description: "계좌 · 등록 서버 — 증권사 서버만 토글 · 교보 해당 없음 · 87 전용 흐린 줄 · 토글 = PUT 1건 · 결과 칩(BUSY title + 한 줄) · timeout/offline 낱말 · 실패 되돌림 · 마지막 서버 잠금 · 제거(DELETE 1건 / 마지막 = 사용자 삭제로) · 계좌 추가(KB 만 지점 · 트레이더 · 13자 오류 · 서버 0 비활성 · 정규화 계좌번호 · 다음 priority)"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx (10건)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P29-A3 편집 시트 — 필드별 즉시 저장 · 결과 칩 (1080 우측 패널)"
        status: pass
    human_judgment: false
  - id: D3
    description: "비밀번호 변경 · 다시 반영 · 사용자 삭제 — 다르면 비활성 · 같으면 POST 1건 · 즉시 비움 · 서버별 칩 · 다시 반영 POST 1건 → 계좌 칩 갱신 · 삭제 확인 1회 · deleted true 닫힘 · false 시트 유지 + 칩 · 마지막 계좌 제거 확인 → 사용자 DELETE · 취소 → 요청 없음 · DMA 없음 → 다시 반영 비활성"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/user-sheet.test.tsx#비밀번호 변경 · 다시 반영 · 사용자 삭제 · 마지막 계좌"
        status: pass
    human_judgment: false
  - id: D4
    description: "편집 시트의 시각 정합(목업 A editor() 대비 — 다크/라이트 · 390/1080)"
    verification:
      - kind: automated_ui
        ref: "playwright:shots/29-17/admin-user-sheet-1080.png · admin-user-sheet-390.png · admin-user-sheet-forms-light-{390,1080}.png"
        status: pass
    human_judgment: true
    rationale: "목업 대비 최종 시각 판정은 사람 몫 — 잘림(leavesOverflowing)만 자동으로 잠갔다"

duration: 18min
completed: 2026-10-07
---

# Phase 29 Plan 17: /admin/users 편집 시트 — 필드별 즉시 저장 · 결과 칩 인라인 Summary

**사용자 행을 누르면 편집 시트가 열린다(폰은 바텀시트, 데스크톱은 우측 440px). 역할 · 등록 서버 토글 · 계좌 추가/제거 · 비밀번호 · 다시 반영이 각각 누르는 즉시 요청 1건이 되고, 서버별 결과가 그 자리 칩과 BUSY 원문 한 줄로 보인다. 「저장」 버튼은 없다. 사용자 삭제와 마지막 계좌 제거만 확인을 한 번 거친다.**

## Performance

- **Duration:** 약 18분
- **Started:** 2026-10-06T18:06:51Z
- **Completed:** 2026-10-06T18:24:00Z
- **Tasks:** 3 (트레이서 1 · TDD 1 · e2e 1)
- **Files:** 신규 7 · 수정 5

## Accomplishments

- **트레이서(Task 1):** `useFieldSave` 는 필드당 1건만 비행시키고 마지막 값만 대기열에 둔다. 플래시는 700ms 이고, 실패하면 한 줄을 보이고 대기 값을 접는다. `RoleSegment` 와 `UserSheet` 골격(역할 · DMA id · 하단 2버튼)을 만들었고, `UsersClient` 에서 행을 누르면 시트가 열린다. 쓰기가 성공하면 목록을 다시 읽고, 시트는 재조회 결과에서 같은 이메일의 사용자로 다시 그린다. 트레이서 `<verify>` 를 다시 돌려 green 을 확인한 뒤 확장했다.
- **계좌 · 서버 · 비밀번호 · 삭제(Task 2):** `AccountEditor` 는 그 증권사 서버만 토글로 보인다. 토글 1회는 `PUT` 1건이다. 교보 계좌는 「지점 해당 없음 · 트레이더 해당 없음」 으로 보이고, 87 에만 있는 계좌는 흐린 줄로 보기만 한다. 「+ 계좌 추가」 의 지점 · 트레이더 칸은 KB 일 때만 나온다. 「제거」 는 `DELETE` 1건이고, 마지막 계좌면 확인 뒤 사용자 삭제로 간다. `PasswordChange` 는 두 칸이 같을 때만 보내고, 누르는 즉시 칸을 비운다. 「다시 반영」 의 결과는 계좌 칩을 갱신한다. 「사용자 삭제」 는 확인을 한 번 거친다. 응답이 `deleted: false` 면 시트를 닫지 않고 서버별 칩과 BUSY 줄을 보인다.
- **e2e(Task 3):** `P29-A3` 를 1080 우측 패널과 390 바텀시트에서 돌렸다. 역할 PATCH · 토글 PUT · 다시 반영 POST 가 각각 1건이다. 「KB121 실패 · BUSY」 칩의 title 과 안내 줄에 서버 원문이 그대로 보인다. 재조회 뒤에도 토글은 켜져 있다. 시트 안 잘림은 없다. `admin.spec` 6건(A1 ×2 · A2 · A3 ×2) 모두 green 이다.

## 결과 → 칩 매핑 표

| 응답 `outcome` | 칩 톤 | 알약 안 낱말(계좌 줄) | 「키 · 상태」(비밀번호 · 삭제 결과) | title | BUSY 한 줄 |
|---|---|---|---|---|---|
| `ok` | ok | 반영됨 | `KB120` | — | — |
| `failed` | err | 실패 · BUSY | `KB121 · 실패 · BUSY` | 서버 message 원문 | 「KB121 실패 · BUSY: <원문> — 정리 뒤 「다시 반영」」(삭제는 「정리 뒤 다시 삭제」) |
| `timeout` | err | 응답 없음 | `KB121 · 응답 없음` | message 있으면 원문 | message 있을 때만 |
| `offline` | warn | 서버 연결 안 됨 | `KB121 · 서버 연결 안 됨` | — | — |
| `skipped` | warn | 미반영 | `KB121 · 미반영` | — | — |

적용 범위는 이렇다. 계좌 PUT · 계좌 DELETE · 계좌 추가의 결과는 그 계좌의 서버 칩에 그대로 들어간다. 「다시 반영」 결과는 그 서버에 등록된 계좌 전부에 닿는다. 단, 실패는 이미 반영된(ok) 계좌를 실패로 바꾸지 않는다(shared `pendingTone` 과 같은 판정). 결과 칩은 시트가 열려 있는 동안 개요 칩보다 앞선다.

## Task Commits

1. **Task 1: 트레이서 — 행 → 시트 → 역할 즉시 저장 · 플래시 · 재조회** — `7a18049e` (feat)
2. **Task 2: 계좌 · 등록 서버 · 비밀번호 · 다시 반영 · 사용자 삭제 — 결과 칩 · BUSY 원문** — `a3e09d6c` (feat)
3. **Task 3: e2e P29-A3 + AdminSheet 폭 · 다크 면 결함 수정** — `5414cffc` (test)

TDD 관측(Task 2): `account-editor.test.tsx` 10건과 `user-sheet.test.tsx` 확장 7건을 먼저 썼다. 그 상태에서 시트 7건이 목표 단언(alertdialog 없음 · 요청 0회 · 문장 없음)에서 실패했고, `../account-editor` 모듈은 아직 없었다. 이를 확인한 뒤 구현했다. 플랜 지시(「한 커밋」)와 29-15 선례대로 RED/GREEN 은 한 커밋으로 묶었다.

## 스크린샷 (커밋 안 함 — `shots/` 는 추적 제외)

- `.planning/phases/29-dma-multi-server-admin/shots/29-17/admin-user-sheet-1080.png` — 데스크톱 우측 패널(다크). KB121 BUSY 칩과 안내 줄이 보인다.
- `.planning/phases/29-dma-multi-server-admin/shots/29-17/admin-user-sheet-390.png` — 폰 바텀시트(다크). 역할 admin 저장 직후다.
- `.planning/phases/29-dma-multi-server-admin/shots/29-17/admin-user-sheet-forms-light-{390,1080}.png` — 비밀번호 폼과 계좌 추가 폼을 연 상태(라이트).

## Decisions Made

결정은 frontmatter `key-decisions` 에 있다. 요지는 세 가지다.

- **의도와 반영을 갈라 보인다.** 서버 일부가 실패해도 토글은 켜진 채로 둔다. 실패는 칩과 한 줄로만 말한다.
- **결과 칩이 개요보다 앞선다.** 결과 칩은 시트가 열려 있는 동안만 산다.
- **확인은 위험 작업 두 개에만 건다.** 대상은 사용자 삭제와 마지막 계좌 제거다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 시각 결함] AdminSheet 우측 패널이 440 이 아니라 384px**
- **Found during:** Task 3 (e2e 실측)
- **Issue:** 기본 `SheetContent` 의 `data-[side=right]:w-3/4 · sm:max-w-sm` 는 속성 선택자라 맨 `w-full · sm:max-w-[440px]` 보다 명시도가 높다. tailwind-merge 는 변형 접두가 달라 둘 다 남긴다. 29-15 단위 테스트는 클래스 문자열만 봤기 때문에 이 결함을 놓쳤다.
- **Fix:** 같은 접두를 달았다(`data-[side=right]:w-full data-[side=right]:sm:max-w-[440px]`). 이제 e2e 가 폭 440과 오른쪽 끝 1080을 잰다.
- **Files modified:** `webapp/src/components/admin/admin-sheet.tsx`
- **Commit:** 5414cffc

**2. [Rule 1 - 시각 결함] 다크에서 시트 안 muted 면이 사라짐**
- **Found during:** Task 3 (스크린샷)
- **Issue:** 다크의 `--popover` 와 `--muted` 가 같은 색(#2d2d2d)이다. 그래서 시트 안 버튼(제거 · 비밀번호 변경 · 다시 반영) · 세그먼트 · 증권사 배지 · 입력의 면이 보이지 않았다.
- **Fix:** AdminSheet 를 다크에서만 `--card` 면으로 한 단 낮췄다. 목업 `.sheet` 보다 `.btn` 이 밝은 대비와 같다. 라이트는 그대로다.
- **Files modified:** `webapp/src/components/admin/admin-sheet.tsx`
- **Commit:** 5414cffc

**3. [Rule 3 - 막힘] files_modified 밖 파일 2개**
- **Found during:** Task 1 · Task 2
- **Issue:** 시트 머리 역할 칩이 목록 행과 같은 톤을 써야 했다. 그런데 `ROLE_CHIP_CLASS` 가 export 되어 있지 않았다. 서버 토글 알약은 목업 `.sv` 처럼 키 옆에 상태 낱말만 써야 하고, 「응답 없음」 · 「서버 연결 안 됨」 처럼 `REFLECT_LABEL` 밖 낱말도 필요했다.
- **Fix:** `user-row.tsx` 에서 `ROLE_CHIP_CLASS` 를 export 했다. `reflect-chip.tsx` 에는 `text` 덮어쓰기 prop 을 더했다(기본 동작은 그대로라 29-15 테스트가 green 이다).
- **Commits:** 7a18049e · a3e09d6c

**4. [UX 정리] 「계좌는 서버 1대 이상」 안내의 자리**
- **Found during:** Task 3 (스크린샷)
- **Issue:** 서버가 1대인 계좌마다 안내 문장이 붙었다. 교보 계좌처럼 서버 1대가 흔한 경우에는 매 줄이 반복됐다.
- **Fix:** 잠긴 토글에는 `title` 을 달았다. 안내 문장은 계좌 영역 아래 목업 note 자리에 한 번만 둔다(「계좌는 서버 1대 이상 — 마지막 서버는 끌 수 없다. 마지막 계좌 제거는 유저 삭제로 이어진다.」). 단위 테스트도 이에 맞췄다.
- **Commit:** 5414cffc

### 해석

- **목업의 하단 「저장」** 은 그리지 않았다. 플랜 prohibition(D-15)에 따른 것이고, 단위와 e2e 가 부재를 단언한다.
- **증권사 표기**는 목업 배지 그대로 `KB` · `KYOBO` 다. 계좌 추가 세그먼트도 같은 표기를 쓴다.
- **삭제 확인 문구:** 사용자 삭제는 「사용자를 삭제할까요?」, 마지막 계좌는 「마지막 계좌를 지우면 사용자가 삭제돼요」 다. 둘 다 본문은 「<이메일> — 되돌릴 수 없어요.」 이고, 버튼은 「취소」 · 「삭제」 다.

---

**Total deviations:** 4건(시각 결함 2 · 막힘 1 · UX 정리 1) + 해석 3
**Impact on plan:** 산출물 · 계약 · 이름은 플랜 Artifacts 표 그대로다. AdminSheet 결함 2건은 29-18 · 29-19 시트에도 그대로 이득이 된다.

## Issues Encountered

None.

## Deferred (deferred-items.md 에 기록)

- `chat-sheet.tsx` 도 같은 접두 문법이라 384px 결함이 있을 가능성이 크다. 실측한 뒤 별도 quick 으로 처리한다.
- 데스크톱 Admin 시트는 공용 `SheetOverlay`(흐림 · 바깥 클릭 닫힘) 때문에 왼쪽 목록이 흐려진다. 목업 A 데스크톱 `.panel` 에는 스크림이 없다. 비모달로 바꾸는 것은 AdminSheet 골격(29-15)의 결정이라 이 플랜에서 바꾸지 않았다.

## Known Stubs

None. DMA 연결이 없는 trader/admin 의 연결 폼은 플랜이 29-19 에 배정한 자리다. 이 시트는 그 경우 「DMA 연결 없음」 까지 그리고, 「다시 반영」 은 비활성이다.

## User Setup Required

None. 스키마 푸시는 해당 없다. webapp 배포(push)는 29-26 몫이다.

## Next Phase Readiness

- **29-18 (서버 화면):** `AdminSheet`(실제 440px · 다크 면) · `useFieldSave` · `RoleSegment` 의 `ADMIN_SEGMENT_*` · `ResultChips` · `chipOfResult` 를 그대로 쓸 수 있다.
- **29-19 (생성 시트 · DMA 연결):** 연결 폼은 `UserSheet` 의 「DMA 연결 없음」 자리(`data-slot="admin-field-dma"`)에 넣는다. 생성 응답의 `results` 는 `ResultChips` 로 보인다. `UsersClientProps.onCreate` 자리는 비어 있다.

## Verification

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` — 통과(tsc + e2e tsc)
- `vitest run src/components/admin/__tests__` — 4 files · 41 passed(act 경고 0)
- `pnpm --filter @gh-radar/webapp run test` — 156 files · 3660 passed · 1 skipped
- `playwright test e2e/specs/admin.spec.ts` — 6 passed(P29-A1 ×2 · A2 · A3 ×2)
- eslint `src/components/admin` · `e2e/specs/admin.spec.ts` — 0
- 인수 기준: useFieldSave 1 · FLASH 700 1 · admin-user-sheet slot 1 · 테스트 「저장」 5 · 「해당 없음」 2 · 서버에만 있음/REFLECT_LABEL 5 · new-password 2 · account-editor 테스트 title 3+ · P29-A3 grep ≥1
- 스키마 푸시: 해당 없음. 보안검사: `security_enforcement: false` 로 생략. spec-less probe: 건너뜀(29-01 과 같음).

## Self-Check: PASSED

- FOUND: use-field-save.ts · role-segment.tsx · user-sheet.tsx · account-editor.tsx · password-change.tsx · __tests__/user-sheet.test.tsx · __tests__/account-editor.test.tsx · e2e/specs/admin.spec.ts
- FOUND commits(HEAD 조상): 7a18049e · a3e09d6c · 5414cffc

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-07*
