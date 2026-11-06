---
phase: quick-261106-ntl
plan: 01
status: complete
subsystem: admin (server admin-accounts · webapp 계좌 시트 · 사용자 카드 · 사이드바)
tags: [admin, accounts, fanout, budget, fee, ipmac, sidebar]
requires: [261106-lwu (계좌 마스터 · admin_accounts_raw · 계좌 저장 팬아웃)]
provides:
  - "PUT /api/admin/accounts/:broker/:accountNo/budget · /fee — 연결 사용자마다 relay op 6/7 팬아웃"
  - "PUT /api/admin/accounts/:broker/:accountNo 의 선택 orderEndpoint(KB) — 연결 사용자마다 계좌 PUT 에"
  - "webapp account-linked-summary(사용자·서버 집계 순수 함수)"
  - "account-editor export AccountCostFields · ORDER_ENDPOINT_ERROR_TEXT"
affects: [webapp/e2e/specs/admin.spec.ts (옛 UI 단언 — 미수정)]
tech-stack:
  added: []
  patterns: ["shared summarize* 를 사용자마다 적용 → 사용자 간 정본 · 불일치 집계", "팬아웃 응답을 「<DMA id> · <서버>」 결과로 접어 기존 칩 상태기계 재사용"]
key-files:
  created:
    - webapp/src/components/admin/account-linked-summary.ts
    - webapp/src/components/admin/__tests__/account-linked-summary.test.ts
  modified:
    - packages/shared/src/admin.ts
    - server/src/schemas/admin.ts
    - server/src/routes/admin-accounts.ts
    - server/tests/routes/admin-accounts.test.ts
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/src/components/admin/account-editor.tsx
    - webapp/src/components/admin/user-sheet.tsx
    - webapp/src/components/admin/users-client.tsx
    - webapp/src/components/admin/__tests__/account-editor.test.tsx
    - webapp/src/components/admin/__tests__/users-client.test.tsx
    - webapp/src/lib/admin-api.ts
    - webapp/src/components/admin/account-master-sheet.tsx
    - webapp/src/components/admin/__tests__/account-master-sheet.test.tsx
    - webapp/src/components/admin/accounts-client.tsx
    - webapp/src/components/admin/__tests__/accounts-client.test.tsx
decisions:
  - "팬아웃 대상 = 기존 RPC admin_accounts_raw 1회로 active 등록 서버가 있는 사용자(새 RPC · 마이그레이션 없음)"
  - "계좌 시트 표시값은 webapp 이 GET /api/admin/users 를 계좌 목록과 병렬로 읽어 사용자마다 집계(Express 조회 경로 추가 없음 · 실패는 null → 확인 전)"
  - "카드 불일치 줄은 남기고 꼬리만 「「계좌」 메뉴에서 저장하면 모두 같아져요」 로(정보 손실 없이 행동 위치만 이동)"
  - "Express per-user …/dma-users/:dma/accounts/:b/:n/budget|fee 는 배포 창 호환으로 남김(웹은 더 부르지 않음)"
  - "D-18 공유 계좌 안내는 편집 모드 전용이라 함께 제거(계좌 시트의 사용자·서버 불일치 줄이 대체)"
metrics:
  duration: "약 19분"
  completed: 2026-11-06
actuals:
  tokens: 62437
  tasks: 3
  commits: 3
plan_head_before: e08825c818395525fd3036cd1599613e647ef7af
plan_head_after: 32bca9e54b6453a52710cf47d26d146c295ab359
---

# Phase quick-261106-ntl Plan 01: 계좌 메뉴 예수금 · 수수료 · 매도세 · 주문자 IP/MAC 팬아웃 + 사이드바 Admin 순서 Summary

계좌 수정 시트에서 예수금 · 수수료 · 매도세(칸마다 즉시 저장 · op 6/7)와 KB 주문자 IP/MAC(기존 「저장」)을 그 계좌를 쓰는 DMA 사용자 전원의 active 등록 서버로 팬아웃하고, 사용자 카드는 읽기 전용(「편집」 제거)으로, 사이드바 Admin 하위는 매매손익 · 계좌 · 사용자 · 서버 · 발사로 바꿨다. relay · DB 변경 없음.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 | dc9e42f5 | Express PUT …/budget · …/fee 팬아웃 경로 + 계좌 저장 orderEndpoint(KB · 교보 400) · fanoutOne 일반화 · shared 타입 · 사이드바 순서/제목 링크 /admin/pnl |
| 2 | 03b0f2d4 | 카드 읽기 줄(AccountCostLine · settingsHint) · 「편집」/편집 모드/D-18 제거 · AccountCostRow → export AccountCostFields(주입형) |
| 3 | 32bca9e5 | account-linked-summary · 계좌 시트 「예수금 · 수수료」 그룹 · KB IP/MAC 칸 · AccountsClient 개요 병렬 로드 · admin-api 계좌 단위 함수 |

## 검증 결과

- server: `vitest run tests/routes` 26 파일 · 580 통과 · `tsc --noEmit` 통과. (admin-accounts 첫 실행에서 기존 GET 테스트 1건이 supertest `ECONNRESET` 으로 한 번 실패 → 재실행 3회 모두 159/159 통과 — 플래키, 이번 변경과 무관)
- webapp: `vitest run src/components/admin src/components/layout` 23 파일 · 471 통과 · `typecheck`(tsc + e2e tsconfig) 통과 · 변경 파일 eslint `--max-warnings 0` 통과.
- 게이트: Task 2 제거 식별자 게이트 GATE_OK(0줄) · Task 3 per-user 비용 함수 게이트 GATE_OK(0).
- `git diff e08825c8..HEAD -- relay/ supabase/` 출력 없음(relay · DB 무변경).

## Deviations from Plan

### Auto-fixed / 조정

**1. [Rule 2 - 정합] D-18 공유 계좌 안내 문구 · 편집 전용 텍스트 키 제거**
- 계획대로 webapp/src 전체 grep 참조 0 확인 뒤 `edit` · `save` · `editCancel` · `editSave` · `editLocked` · `kyoboIpmacNa` · `sharedAccountNote` 를 지웠다(`save` 는 계좌 시트가 자기 `ACCOUNT_MASTER_SHEET_TEXT.save` 를 쓴다).

**2. [Rule 1 - 정리] OrderServerControl 의 `disabled` prop 제거**
- 카드 편집 저장 비행 중 잠금 전용이었고 편집 모드가 사라져 호출자가 없어졌다(동작 변화 없음).

**3. [조정] P36 「(D-04) 비용 저장 결과는 서버 알약 반영 칩을 바꾸지 않는다」 테스트**
- 단일 사용자 하네스에는 서버 알약이 없어 「BusyLines 로 새지 않는다」 단언으로 축소했다(카드에는 이제 비용 칸 자체가 없다).

**4. [조정] 계좌 시트 IP/MAC 성공 뒤 초깃값**
- 계획 「성공 뒤 초깃값 = 보낸 칸 값(trim)」 — IP/MAC 을 싣지 않은 저장(계좌명만 · 정규화로 같은 다른 표기)에서도 초깃값을 칸 값(trim)으로 맞춰 「저장」 이 다시 꺼지게 했다(정규화로 서버 값과 같으므로 의미 동일).

**5. [메모] 커밋 브랜치**
- GSD 기본 가드는 master 를 보호 브랜치로 보지만, 오케스트레이터 지시(`<sequential_execution>` · 「Branch must be master」)와 이 저장소 작업 관례(master 직접 커밋)를 따라 master 에 커밋했다. 커밋 메시지는 한글 · Co-Authored-By 없음(사용자 CLAUDE.md).

그 밖은 계획대로.

## Known Stubs

없음.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-endpoint | server/src/routes/admin-accounts.ts | PUT /api/admin/accounts/:broker/:accountNo/budget · /fee — 기존 `/accounts` 경로 관문(requireAuth + requireAdmin) 아래 · 바디 strict zod · 감사 줄에 계좌번호 없음. relay 쓰기를 사용자 수만큼 일으킨다(관리자 수동 조작 · 사용자 트래픽 비례 아님). |
| threat_flag: pii-in-body | server/src/routes/admin-accounts.ts | 계좌 저장 바디 orderEndpoint(사용자 PC IP/MAC) — 감사 줄엔 "set"/"clear" 만, 값은 싣지 않음. |

## 후속 (Task 4 · 메인 세션)

1. **배포 순서 = server → git push.** 옛 server 는 저장 바디의 `orderEndpoint` 를 zod strip 으로 조용히 버리고 「반영됨」 을 보이며, `…/budget` · `…/fee` 는 404 다.
   - 깨끗한 detached worktree(HEAD 32bca9e5)에서 `scripts/deploy-server.sh` · 라이브 Cloud Run env 에서 GCP_PROJECT_ID · SUPABASE_URL · CORS_ALLOWED_ORIGINS · TICKGW_URL 등 추출 · 배포 전 라이브 APP_VERSION 이 HEAD 의 조상인지 확인.
   - 그 뒤 `git push`(Vercel webapp 배포). relay 배포 · `supabase db push` 없음.
2. 육안: /admin/accounts 연결 계좌 시트 「예수금 · 수수료」 값 · 칩 「<DMA id> · <서버>」 · KB IP/MAC 칸 · 같은 값 재입력 Enter 「변경 없음」 · 연결 없음 계좌 잠김 · 사용자 시트 카드 「편집」 없음 · 읽기 줄 「설정은 「계좌」 메뉴에서」 · 사이드바 Admin 하위 순서.
3. **Playwright `webapp/e2e/specs/admin.spec.ts` 는 261106-lwu 때부터 옛 UI(카드 「편집」 · IP/MAC 카드 편집 · D-18 안내 · 「제거」)를 단언한다** — 이번 작업에서도 지시대로 손대지 않았고 실행하지 않았다. 다음 e2e 정비 때 계좌 시트 기준으로 다시 써야 한다.

## Self-Check: PASSED

- 파일: account-linked-summary.ts · account-linked-summary.test.ts 존재 확인.
- 커밋: dc9e42f5 · 03b0f2d4 · 32bca9e5 모두 HEAD 조상.
