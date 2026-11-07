---
phase: quick-261107-moq
plan: 01
subsystem: admin (DB · relay · server · webapp)
tags: [admin, dma, server-only, relay, pgtap]
status: complete
requires: []
provides:
  - "RPC dma_admin_adopt_server_only_account(p_dma_user_id, p_broker, p_account_no, p_remove)"
  - "relay POST /internal/admin/dma-users/:dma/accounts/:broker/:accountNo/server-only { action: link | remove }"
  - "Express POST /api/admin/dma-users/:dma/accounts/:broker/:accountNo/server-only"
  - "webapp serverOnlyAccount() · ServerOnlyAccountRow 설명 줄 + 연결/서버에서 빼기 확인 상자 · josaEulReul"
affects: [admin 사용자 시트 계좌 영역]
tech-stack:
  added: []
  patterns: ["한 RPC 의 p_remove 로 active/removing 갈래", "remove 는 기존 reconcile → planner op 4/op 2 → settle 재사용"]
key-files:
  created:
    - supabase/migrations/20261107300000_dma_admin_adopt_server_only_account.sql
    - supabase/tests/dma_admin_server_only_account.test.sql
  modified:
    - relay/src/admin/intent-store.ts
    - relay/src/admin/admin-api.ts
    - relay/tests/helpers/admin-db-fake.ts
    - relay/tests/admin-api.test.ts
    - server/src/schemas/admin.ts
    - server/src/services/relay-admin-client.ts
    - server/src/routes/admin.ts
    - server/tests/routes/admin-dma.test.ts
    - webapp/src/lib/admin-api.ts
    - webapp/src/lib/__tests__/admin-api.test.ts
    - webapp/src/components/admin/account-editor.tsx
    - webapp/src/components/admin/__tests__/account-editor.test.tsx
decisions:
  - "NOT_SERVER_ONLY · NO_DMA_USER 는 기존 규약대로 relay 409(INTENT_MESSAGE 에 화면용 한국어 한 문장)"
  - "remove 에만 지정 재적재(계좌 제거 라우트와 같은 꼬리) · link 는 재적재 없음(지정 무변경)"
  - "완료 줄은 결과가 1건 이상이고 전부 ok 일 때만 — 상태는 AccountEditor 가 쥐어 카드가 재조회로 사라져도 남는다 · 새 확인 상자를 열면 지운다"
  - "빼기 확인 · 완료 줄의 dma 뒤 조사(는 · 가)는 목업 B 그대로 고정(DMA id 는 영문이 대부분)"
metrics:
  completed: 2026-11-07
  tasks: 2
actuals:
  tokens: 21100
  tasks: 2
  commits: 2
plan_head_before: 4be2a91a
plan_head_after: 55b69d6ac0ca6a05fc84f6cbe920547131aeae8c
---

# Quick 261107-moq: 어드민 「서버에만 있음」 계좌 — 이 사용자에 연결 · 서버에서 빼기 Summary

87 에만 있는 계좌 카드에서 확인 상자를 한 번 거치면 그 계좌를 사용자 의도로 들이거나(op 없음), 그 서버에서 뺄 수 있다(op 4/op 2 → settle). 둘 다 새 RPC 하나(`dma_admin_adopt_server_only_account`)로 처리하고 relay planner · dispatcher · shared 는 바꾸지 않았다.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 (tracer) | `e0ea76e8` | feat(quick-261107-moq): 서버에만 있음 계좌 「이 사용자에 연결」 — RPC · relay link · Express 프록시 · 웹 확인 상자 |
| 2 | `55b69d6a` | feat(quick-261107-moq): 서버에만 있음 계좌 「서버에서 빼기」 — relay remove(reconcile · 지정 재적재) · 빨강 확인 · 완료 줄 |

마이그레이션 파일명: `supabase/migrations/20261107300000_dma_admin_adopt_server_only_account.sql`(실행 시점 최신 = 20261107200000 → 계획한 타임스탬프 그대로).

## 검증 (전부 이 worktree 에서 실행)

- pgTAP `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_admin_server_only_account.test.sql` → 24/24 ok · RESULT: PASS (마이그레이션 119개 재생 · 일회용 로컬 컨테이너)
- relay `vitest run tests/admin-api.test.ts tests/admin-planner.test.ts tests/admin-dispatcher.test.ts --maxWorkers=2` → 209/209 (새 M1~M7 7건 포함) · `typecheck` 통과
- server `vitest run tests/routes/admin-dma.test.ts --maxWorkers=2` → 122/122 · `typecheck` 통과
- webapp `vitest run src/lib/__tests__/admin-api.test.ts src/components/admin/__tests__/account-editor.test.tsx src/components/admin/__tests__/user-sheet.test.tsx --maxWorkers=2` → 110/110 · `typecheck`(tsc + e2e tsconfig) 통과 · eslint(수정한 파일) 0
- D-06 경계: `git log 4be2a91a..HEAD -- relay/src/admin/planner.ts relay/src/admin/dispatcher.ts packages/shared/src supabase/migrations/20261006200300_dma_admin_reflect.sql webapp/src/components/admin/user-sheet.tsx` → 0건
- e2e 는 돌리지 않았다(계획대로, D-06)

## 배포 순서 (메인 세션 몫)

1. DB 마이그레이션 `20261107300000_dma_admin_adopt_server_only_account.sql` 원격 적용
2. relay 배포 (새 라우트 · `NOT_SERVER_ONLY` 매핑)
3. server(Express) 배포 — `deploy-server.sh` (git push 로는 반영되지 않는다)
4. push(webapp)

순서를 거꾸로 하면: 웹이 먼저 나가면 Express 404, Express 가 먼저 나가면 relay 404 → 502 `RELAY_FAILED`. DB 보다 relay 가 먼저 나가면 RPC 가 없어 500.

## 운영 확인 방법

- 어드민 사용자 시트에서 112 같은 흐린 점선 「서버에만 있음」 계좌 카드를 연다. 칩 아래 「<서버> 서버 설정에만 있고 …」 설명 한 줄과 [이 사용자에 연결] [서버에서 빼기] 버튼이 보이는지 확인한다.
- 연결: 파랑 확인 상자에서 「연결」 → 재조회 뒤 그 계좌가 일반 계좌 카드(서버 체크 · 연결 해제)로 바뀐다. 서버로 가는 op 는 없다.
- 빼기: 장 마감 뒤 빨강 확인 상자에서 「서버에서 빼기」 → 카드가 사라지고 「✓ <서버> 에서 <계좌명>을 뺐어요 …」 한 줄이 남는다. relay 로그에는 그 서버로 간 op 4(그 유저의 그 서버 계좌가 그것뿐이면 op 2)와 `[admin-audit]` 1줄(action remove)이 남는다.
- BUSY 로 거절되면 그 계좌는 removing 등록 카드로 돌아오고 「실패 · BUSY」 칩과 BUSY 줄이 보인다. 정리한 뒤 「다시 반영」 을 누르면 된다.

## Deviations from Plan

### 그 밖의 조정

**1. [Rule 3 - 테스트 픽스처] 실패 rerender 픽스처의 tone 을 `'err'` 로 바꿈**
- 계획 원문은 `tone: 'failed'` 였지만 shared `ReflectTone` 은 `"ok" | "warn" | "err" | "only"` 다. 실패 칩 톤인 `'err'` 로 맞췄다. 동작이나 단언 의미는 그대로다.

**2. TDD 순서 (Task 2 relay 쪽)**
- 웹 3건은 RED(4건 실패 확인) → 구현 → GREEN 순서로 진행했다. relay remove 는 구현(z.enum 확장 · reconcile 갈래)을 먼저 넣고 M4~M7 테스트를 바로 붙였기 때문에 RED 를 따로 관찰하지 않았다. 확장 전 스키마였다면 M4~M6 은 400 으로 실패했을 경로다.

**3. pgTAP 픽스처 호출을 DO 블록으로 묶음**
- `dma_admin_create_dma_user` · `dma_admin_apply_snapshot` 반환값 줄이 TAP 출력에 섞이지 않도록 `DO $fx$ … PERFORM …` 으로 감쌌다. 단언 수는 24 그대로다.

**4. 연결 성공 뒤 확인 상자를 닫음(setMode idle)**
- 재조회가 오기 전 잠깐 버튼 줄로 돌아간다. 재조회가 오면 연결은 일반 카드로, 빼기는 카드가 사라지는 것으로 바뀐다.

그 밖에는 계획대로 실행했다.

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261107300000_dma_admin_adopt_server_only_account.sql
- FOUND: supabase/tests/dma_admin_server_only_account.test.sql
- FOUND: e0ea76e8 · 55b69d6a (HEAD 조상)
