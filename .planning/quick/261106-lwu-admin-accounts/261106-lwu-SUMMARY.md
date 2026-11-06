---
phase: quick-261106-lwu
plan: 01
subsystem: admin (DB · server · webapp)
status: complete
tags: [admin, dma, accounts, supabase, rpc, express, nextjs]
requires: []
provides:
  - "dma_accounts 계좌 마스터 표 · 멱등 백필 · 연결 행 → 마스터 트리거 · FK RESTRICT · RPC 4종"
  - "Express /api/admin/accounts (GET · POST · PUT 팬아웃 · DELETE) · 연결 경로 3개 마스터 검사"
  - "webapp /admin/accounts 화면 · 사용자 시트/사용자 만들기 계좌 피커(A)"
affects: [admin-users, relay-intent (값 열은 그대로 · relay 코드 무변경)]
tech-stack:
  added: []
  patterns:
    - "경로 한정 관문 라우터(adminAccountsRouter.use('/accounts', …)) 를 adminRouter 앞에 마운트"
    - "팬아웃 실패는 항목 error 로 접고 200 유지(D-08)"
    - "피커 제외 판정은 부모 predicate(순환 import 방지)"
key-files:
  created:
    - supabase/migrations/20261106300000_dma_accounts_master.sql
    - supabase/tests/fixtures/261106_pre_accounts_master.sql
    - supabase/tests/dma_accounts_master.test.sql
    - server/src/routes/admin-accounts.ts
    - server/tests/routes/admin-accounts.test.ts
    - webapp/src/app/admin/accounts/page.tsx
    - webapp/src/components/admin/accounts-client.tsx
    - webapp/src/components/admin/account-master-sheet.tsx
    - webapp/src/components/admin/account-picker.tsx
    - webapp/src/components/admin/__tests__/accounts-client.test.tsx
    - webapp/src/components/admin/__tests__/account-master-sheet.test.tsx
    - webapp/src/components/admin/__tests__/account-picker.test.tsx
  modified:
    - packages/shared/src/admin.ts
    - server/src/schemas/admin.ts
    - server/src/routes/admin.ts
    - server/src/app.ts
    - server/tests/routes/admin-dma.test.ts
    - webapp/src/lib/admin-api.ts
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/src/components/admin/account-editor.tsx
    - webapp/src/components/admin/dma-connect-fields.tsx
    - webapp/src/components/admin/user-sheet.tsx
    - webapp/src/components/admin/user-create-sheet.tsx
    - webapp/src/components/admin/users-client.tsx
    - webapp/src/components/admin/__tests__/account-editor.test.tsx
    - webapp/src/components/admin/__tests__/dma-connect-fields.test.tsx
    - webapp/src/components/admin/__tests__/user-sheet.test.tsx
    - webapp/src/components/admin/__tests__/user-create-sheet.test.tsx
    - webapp/src/components/admin/__tests__/users-client.test.tsx
decisions:
  - "계좌 마스터(dma_accounts)를 add-alongside 로 도입 — dma_user_accounts 값 열은 relay planner 용으로 유지, 마스터 저장 RPC 가 연결 행을 같은 트랜잭션에서 갱신"
  - "연결 경로 3개는 마스터에 없으면 409 ACCOUNT_NOT_REGISTERED, 있으면 계좌명·지점·트레이더를 마스터 값으로 덮고 계좌번호는 정규화값으로 relay 에 넘긴다"
  - "dma_admin_update_account 는 마스터를 FOR NO KEY UPDATE 로 잠근다(연결 INSERT 의 FK KEY SHARE 와 충돌하지 않게) · delete 는 FOR UPDATE"
metrics:
  duration: "약 25분(에이전트 실행 구간)"
  completed: 2026-11-06
  tasks_completed: 3
  tasks_total: 4
actuals:
  tokens: 50600
  tasks: 3
  commits: 4
plan_head_before: 06333ecea2e93b154920d04d5ef4d366e1964f21
plan_head_after: 32725b8893c92325e37a01a7a725c4f89edfbd40
---

# Phase quick-261106-lwu Plan 01: 어드민 계좌 메뉴 · 사용자별 계좌 연결 Summary

계좌를 (증권사, 계좌번호) 독립 마스터 `dma_accounts` 로 올리고(멱등 백필 · 트리거 · FK · RPC 4종), `/admin/accounts` 에서 등록 · 수정(연결 사용자 전원 relay 팬아웃 + 결과 칩) · 연결 0명일 때만 삭제하게 했으며, 사용자 시트 · 사용자 만들기는 계좌를 직접 입력하지 않고 등록 계좌 피커(방식 A)로 연결만 한다. 사이드바는 「… 분석 · My page · Admin(사용자 · 계좌 · 서버 · 발사 · 매매손익)」.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 | 45a4c090 | 계좌 마스터 표·백필·RPC + /api/admin/accounts · 연결 시 마스터 검사 |
| 2 | 26337b4c | 어드민 「계좌」 화면(목록·등록·수정 팬아웃·삭제) + 사이드바 My page↔Admin 순서 |
| 3 | 32725b88 | 사용자 시트·사용자 만들기 계좌 고르기(A) · 카드 「연결 해제」 · 계좌명 편집은 「계좌」 메뉴로 |
| 4 | — | **미실행 — 배포 체크포인트(오케스트레이터 몫)** |

`commits: 4` 는 `git rev-list --count 06333ece..HEAD` 측정값이다. 그 안에 다른 세션 커밋 `0d122f53 fix(quick-261106-ldl)`(workers/intraday-sync 1줄)이 끼어 있다 — 이 플랜의 커밋은 위 3개다.

## 검증

- pgTAP 새 파일(픽스처 → 마이그레이션 2회 적용 → 테스트): `1..52` 전부 ok · RESULT PASS
- 기존 dma pgTAP 6개(dma_registry_intent · dma_admin_intent · dma_admin_create_guard · dma_admin_reflect · dma_account_order_server · dma_pnl_daily) 전체 재생(새 마이그레이션 포함) 전부 PASS — 트리거 · FK 가 기존 픽스처 · adopt RPC 를 깨지 않음
- server: `vitest run tests/routes/admin-accounts.test.ts admin-dma.test.ts admin.test.ts admin-servers.test.ts` 213/213 · `tests/routes` 전체 557/558(1건 = admin-dma 「relay 409 인데 본문 모양 위반 → 502」 5000ms 타임아웃 — 단독 재실행 통과 · 동시 세션 부하로 인한 시간 초과, 이번 변경과 무관) · server typecheck 통과
- webapp: `vitest run src/components/admin src/components/layout` 22 파일 486/486 · webapp typecheck(tsc + e2e tsconfig) 통과 · eslint(변경 경로) 경고 0
- relay 무변경: `git diff --stat 06333ece..HEAD -- relay/` 출력 없음
- Playwright e2e 추가 · 실행 안 함(지시대로)

## Task 4 — 메인 세션이 할 일(미실행 · 이 순서)

1. `git status -sb` 로 다른 세션 미커밋 변경 확인. `scripts/deploy-server.sh` 는 작업 트리로 docker build 하므로 HEAD(32725b88 이후) 의 깨끗한 worktree 에서 배포. 배포 전 라이브 server 이미지(APP_VERSION)가 내 HEAD 의 조상인지 확인.
2. `supabase db push --linked --yes` — `20261106300000_dma_accounts_master.sql` 1개 적용(표 · 백필 · 트리거 · FK · RPC `admin_accounts_raw` / `dma_admin_create_account` / `dma_admin_update_account` / `dma_admin_delete_account`). 옛 server 는 새 DB 에서도 그대로 동작(트리거가 새 연결 행을 마스터에 넣는다).
3. server 배포(`scripts/deploy-server.sh` — 라이브 Cloud Run env 에서 GCP_PROJECT_ID · SUPABASE_URL · CORS_ALLOWED_ORIGINS 추출). 변경: 새 라우터 `server/src/routes/admin-accounts.ts`(app.ts 마운트) · `server/src/routes/admin.ts` 연결 경로 3개 마스터 검사 · `server/src/schemas/admin.ts`. relay 는 변경 없음 → 배포 없음.
4. `git push`(webapp Vercel 배포) — 2 · 3 이 끝난 뒤에만. 웹이 먼저 나가면 `/api/admin/accounts` 404 · 피커 「계좌 목록을 불러오지 못했어요」.

검증: GET /api/admin/accounts(어드민) 개수 = `dma_user_accounts` 의 서로 다른 (broker, account_no) 수 · 각 계좌 「쓰는 사용자」 가 사용자 시트와 일치 · /admin/accounts · 사용자 시트 「+ 계좌 연결」 육안 · 사이드바 My page 가 Admin 위.

## Deviations from Plan

### Auto-fixed / 조정

**1. [Rule 1 - 기존 단언 1건 의미 보정] admin-dma.test.ts 「계좌 put … 교보 branch/trader 빈 값」**
- 정합 규칙대로 relay 에 마스터 키(정규화 계좌번호)를 넘기므로 relay 바디의 `accountNo` 가 `"00777"` → `"777"` 로 바뀐다(relay 도 같은 정규화를 해 의미는 같음). 기대값 한 줄만 고침 · 주석 남김. 커밋 45a4c090.

**2. admin.test.ts 는 손대지 않음** — plan files 에 있었지만 이 파일의 테스트는 연결 경로를 타지 않아 `dma_accounts` 픽스처 없이 39/39 통과.

**3. 계좌 마스터 시트의 저장/삭제는 `useFieldSave` 대신 로컬 busy 상태** — `useFieldSave` 의 onSuccess 응답 타입이 `AdminCommandResponse` 라 팬아웃 응답(`AdminAccountSaveResponse`)을 싣지 못한다. 단일 요청 · 비행 중 버튼 잠금만 필요해 단순 상태로 충분.

**4. `BROKER_BADGE` · `BROKER_LABEL`(KB/교보) 를 account-picker.tsx 로 옮김** — account-editor → account-picker → (account-editor) 순환을 만들지 않으려고 정의를 피커에 두고 account-editor · account-master-sheet 가 import. Task 2 커밋에서 잠시 account-editor 의 `BROKER_BADGE` 를 export 했다가 Task 3 에서 피커로 옮겼다.

**5. 편집 모드 교보 분기(「교보 계좌는 주문자 IP · MAC 해당 없음」)는 코드에 남김** — 교보 카드는 이제 「편집」 이 없어 도달하지 않지만 방어 분기로 둔다(제거하면 KYOBO 편집 진입 시 빈 폼).

**6. account-editor.test.tsx 의 계좌명 편집 기반 테스트를 IP/MAC 기반으로 재작성** — 계좌명 칸 제거(D-09)로 「계좌명만 바꿔 저장」 류 7건은 「안 바꾸면 저장 비활성」 단언으로 바꾸거나 삭제(같은 의미의 D-06 「변경 없음」 테스트가 이미 있음). 서버 토글 · 주문 서버 · IP/MAC · 예수금 · 수수료 테스트는 저장을 일으키는 입력만 IP/MAC 으로 바꿨고 단언은 그대로.

## Known Stubs

없음.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-endpoint | server/src/routes/admin-accounts.ts | 어드민 전용 4경로 — `requireAuth` → `requireAdmin` 경로 한정 관문 · DB 는 service_role RPC(REVOKE anon/authenticated) · 감사 줄에 계좌번호 없음(증권사만) · DMA id 마스킹 |
| threat_flag: new-table | supabase/migrations/20261106300000_dma_accounts_master.sql | `dma_accounts` RLS on · 정책 없음 · anon/authenticated 권한 0(pgTAP 단언) |

## Self-Check: PASSED

- 생성 파일 12개 존재 확인 · 커밋 45a4c090 · 26337b4c · 32725b88 이 HEAD 조상.
