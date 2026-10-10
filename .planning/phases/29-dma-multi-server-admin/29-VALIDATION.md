---
phase: "29"
slug: "dma-multi-server-admin"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-06"
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest(relay ^4 · server ^4 · webapp ^2 · shared) · Playwright ^1.59 · pgTAP(로컬 일회용 컨테이너 `public.ecr.aws/supabase/postgres:17.6.1.104`) |
| **Config file** | `relay/vitest.config.*` · `server/vitest.config.*` · `webapp/vitest.config.*` · `webapp/playwright.config.ts`(workers 1 · relay 8090 · dev 3100) · `scripts/verify-dma-orders-price-check.sh`(29-09 가 `--with` 추가) |
| **Quick run command** | `pnpm --filter @gh-radar/<relay\|webapp\|shared\|server> exec vitest run <file> --reporter=verbose` · pgTAP `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/<file>.sql [--with <sql>]` (typecheck 전 `pnpm --filter @gh-radar/shared build`) |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/shared exec vitest run && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test && pnpm --filter @gh-radar/server exec vitest run` + Phase 29 pgTAP 전량 + Playwright `admin` · `admin-servers` · `access-gate` · `trading-workbench` · `me` · `sidebar-tree` · `auth-guards` |
| **Estimated runtime** | 단일 파일 ~5-30초 · relay 전체 ~90초 · webapp 전체 ~60초 · pgTAP 파일당 ~30초(컨테이너 기동) · Playwright 묶음 ~3-5분 |

---

## Sampling Rate

- **After every task commit:** 그 태스크 `<verify>` 의 automated 명령(단일 파일 vitest · pgTAP 1~2 · 해당 e2e `-g`)
- **After every plan wave:** Full suite command(위) + 그 wave 의 pgTAP
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~120초(태스크 단위 · Playwright 태스크 제외)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Task | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|------|-----------|-------------------|-------------|--------|
| 29-01-T1 | 01 | 1 | ADMIN-01, ADMIN-02, ADMIN-03 | — | 트레이서 — `app_users` · `my_app_access()` · `is_theme_admin(… | tracer | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/app_access.test.sql` | ✅ (태스크가 만든다) | ✅ green |
| 29-01-T2 | 01 | 1 | ADMIN-01, ADMIN-02, ADMIN-03 | — | D-05 문 확인 — DB 의도 표를 정본으로 삼는다(one-way) | decision | — (사람 확인 — resume 데이터) | — | ✅ (manual, 완료) |
| 29-01-T3 | 01 | 1 | ADMIN-01, ADMIN-02, ADMIN-03 | — | 서버 레지스트리 `dma_servers` · DMA 의도 표 · 접근 맵 RPC · 레지스트리 RPC … | auto | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_registry_intent.test.sql` | ✅ (태스크가 만든다) | ✅ green |
| 29-02-T1 | 02 | 1 | ADMIN-04, ADMIN-05 | — | 트레이서 — sync 실행 · 수기 사본 3곳 · 44 조립 / 86 · 87 파싱 · role 2 가… | tracer | `cd /Users/alex/repos/gh-trade/.claude/worktrees/phase-29-admin-users/server && out="$(RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-s…` | ✅ (태스크가 만든다) | ✅ green |
| 29-02-T2 | 02 | 1 | ADMIN-04, ADMIN-05 | — | 스텁 게이트웨이 admin 모드 — role 2 로그인 · 44 기록 · 86/87 응답 · 다중 인스턴스 | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run tests/fa…` | ✅ (태스크가 만든다) | ✅ green |
| 29-03-T1 | 03 | 1 | ADMIN-04 | — | 트레이서 — `DMA_REGISTRY_SOURCE` 게이트 · 증권사별 비밀 · `ServerRegis… | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green (pipelines ⑥ 공유 — 29-08-T1 참조) |
| 29-03-T2 | 03 | 1 | ADMIN-04 | — | `index.ts` 레지스트리 결선 — 세션 = KB 주문 서버 · quote = 시세 주 서버 · 라… | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green |
| 29-04-T1 | 04 | 1 | ADMIN-05, ADMIN-09, ADMIN-10 | — | 트레이서 — `normalizeAccountNo` · `diffServerAccounts` · plan… | tracer | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/admin.test.ts --reporter=verbose && pnpm --filter @gh-radar/shared build && pnpm --fil…` | ✅ (태스크가 만든다) | ✅ green |
| 29-04-T2 | 04 | 1 | ADMIN-05, ADMIN-09, ADMIN-10 | — | planner 규칙 전부 — op 3 갱신 · removing op 4 · 마지막 계좌 op 2 · s… | auto | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/admin.test.ts --reporter=verbose && pnpm --filter @gh-radar/shared build && pnpm --fil…` | ✅ (태스크가 만든다) | ✅ green |
| 29-04-T3 | 04 | 1 | ADMIN-05, ADMIN-09, ADMIN-10 | — | 개요 파생 전부 — 계좌별 칩 · err(BUSY message) · 서버에만 있음 · 승인 대기 · … | auto | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/admin.test.ts src/__tests__/admin-overview.test.ts --reporter=verbose && pnpm --filter…` | ✅ (태스크가 만든다) | ✅ green |
| 29-05-T1 | 05 | 2 | ADMIN-03, ADMIN-05, ADMIN-09, ADMIN-10 | — | 트레이서 — 유저 생성 RPC → 87 적재 RPC → `admin_users_raw()` (pgTAP) | tracer | `for t in dma_admin_intent dma_admin_reflect; do bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/$t.test.sql \| tail -1 \| grep -q…` | ✅ (태스크가 만든다) | ✅ green |
| 29-05-T2 | 05 | 2 | ADMIN-03, ADMIN-05, ADMIN-09, ADMIN-10 | — | 나머지 변경 RPC · 최근 결과 표 · `admin_servers_raw` · 입양 RPC · 회귀 | auto | `for t in dma_admin_intent dma_admin_reflect; do bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/$t.test.sql \| tail -1 \| grep -q…` | ✅ (태스크가 만든다) | ✅ green |
| 29-06-T1 | 06 | 2 | ADMIN-03, ADMIN-11 | — | 트레이서 — `AppAccess` 접근 맵 → `dma_users` 복호(AAD dma_user_id)… | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green |
| 29-06-T2 | 06 | 2 | ADMIN-03, ADMIN-11 | — | D-04 즉시 반영 — 재적재 diff → `revokeUser` · 모든 파이프라인 푸시 신원 = A… | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green |
| 29-06-T3 | 06 | 2 | ADMIN-03, ADMIN-11 | — | e2e · 단위 스텁을 새 원천으로 — `seedDmaCredential` 이 접근 맵 + `dma_u… | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay run test` | ✅ (태스크가 만든다) | ✅ green |
| 29-07-T1 | 07 | 3 | ADMIN-01, ADMIN-02, ADMIN-03 | — | push 준비 게이트(원격 접촉 없음) — pgTAP 전량 · 디렉터리 점검 · e2e 전용 시드 스크립트 확장 · 메인 세션 명령 정리 | auto | `for t in app_access dma_registry_intent dma_admin_intent dma_admin_reflect dma_gateway_identities dma_journal_apply dma_strategy_read; do bash scri…` | ✅ (태스크가 만든다) | ✅ green (2번째 검사 = push 전 시점 게이트 · 29-25 뒤 해당 없음) |
| 29-07-T2 | 07 | 3 | ADMIN-01, ADMIN-02, ADMIN-03 | — | [BLOCKING] 메인 세션 — `supabase db push --linked --yes`(addi… | human-action | — (사람 확인 — resume 데이터) | — | ✅ (manual, 완료) |
| 29-08-T1 | 08 | 3 | ADMIN-04, ADMIN-05 | — | 트레이서 — enabled 서버 → admin 연결 role 2 → 79 → op 5 → 87 → 서버… | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green (pipelines ⑥ 부하 flaky 수정 2aa40ceb) |
| 29-08-T2 | 08 | 3 | ADMIN-04, ADMIN-05 | — | 명령 상관 · 서버당 1건 비행 · 타임아웃/offline · 86→87 짝 · 요청 없는 87 · 거… | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green |
| 29-09-T1 | 09 | 3 | ADMIN-01, ADMIN-03 | — | 트레이서 — 러너 `--with` · 옛 키 픽스처 → 개명 SQL → 저널 이어 적용 (pgTAP) | tracer | `bash scripts/verify-dma-orders-price-check.sh --until 20261006200300 --with supabase/tests/fixtures/29_pre_rename.sql --with supabase/migrations/20261007200000_gateway_key_rename.sql …(29-26 뒤 경로 · 정본 = 테스트 머리 주석)` | ✅ (태스크가 만든다) | ✅ green |
| 29-09-T2 | 09 | 3 | ADMIN-01, ADMIN-03 | — | 가시성 뷰 v2 · 롤백 역개명 SQL · 개명 ↔ 역개명 왕복 · v2 가시성 매트릭스 (pgTAP) | auto | `bash scripts/verify-dma-orders-price-check.sh --until 20261006200300 --with supabase/tests/fixtures/29_pre_rename.sql --with supabase/migrations/20261007200000_gateway_key_rename.sql …(29-26 뒤 경로 · 정본 = 테스트 머리 주석)` | ✅ (태스크가 만든다) | ✅ green |
| 29-10-T1 | 10 | 3 | ADMIN-02, ADMIN-08 | — | 트레이서 — `requireAdmin` → `GET /api/admin/users` → RPC `adm… | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/middle…` | ✅ (태스크가 만든다) | ✅ green |
| 29-10-T2 | 10 | 3 | ADMIN-02, ADMIN-08 | — | 허용/역할 쓰기 · 자기 보호 · relay 클라이언트 복원 · 즉시 반영 통보 · 로그 redact | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes…` | ✅ (태스크가 만든다) | ✅ green |
| 29-11-T1 | 11 | 4 | ADMIN-05, ADMIN-08, ADMIN-11 | — | 트레이서 — `POST /internal/admin/dma-users` → 암호화 → 의도 RPC → … | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green |
| 29-11-T2 | 11 | 4 | ADMIN-05, ADMIN-08, ADMIN-11 | — | 나머지 변경 경로 — 비밀번호(+dual-write) · 계좌 put/remove(removing → … | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run tests/ad…` | ✅ (태스크가 만든다) | ✅ green |
| 29-11-T3 | 11 | 4 | ADMIN-05, ADMIN-08, ADMIN-11 | — | 운영 보조 라우트 — 레지스트리 · 접근 맵 재적재 · 서버 상태 · 감사 로그 · relay 전체 회귀 | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green |
| 29-12-T1 | 12 | 4 | ADMIN-02 | — | 트레이서 — `decideAccess` · middleware `my_app_access` 1회 · `… | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/supa…` | ✅ (태스크가 만든다) | ✅ green |
| 29-12-T2 | 12 | 4 | ADMIN-02 | — | 판정 표 전부 · OAuth 콜백 주석 | auto | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/supabase/__tests__/access-gate.test.ts --reporter=verbose && pnpm --filter @gh-radar/webapp …` | ✅ (태스크가 만든다) | ✅ green |
| 29-13-T1 | 13 | 5 | ADMIN-08, ADMIN-09, ADMIN-10 | — | 트레이서 — `POST /api/admin/users` (dma 포함) → app_users → rel… | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes…` | ✅ (태스크가 만든다) | ✅ green |
| 29-13-T2 | 13 | 5 | ADMIN-08, ADMIN-09, ADMIN-10 | — | 나머지 DMA 프록시 · 유저 삭제(공유 판정) · `/api/admin/servers/*` | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes…` | ✅ (태스크가 만든다) | ✅ green |
| 29-14-T1 | 14 | 5 | ADMIN-05 | — | 트레이서 — 87 → `JournalAccess.replace` + `dma_admin_apply_sn… | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green |
| 29-14-T2 | 14 | 5 | ADMIN-05 | — | 세대 가드 · DB 재시도(최신만) · 빈 스냅샷 · 재접속 전량 교체 · rev 1 복귀 | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run tests/ad…` | ✅ (태스크가 만든다) | ✅ green (admin-snapshot-sink A2 부하 flaky 수정 5ff341e8) |
| 29-15-T1 | 15 | 5 | ADMIN-09, ADMIN-10 | — | 트레이서 — `admin-api` · `UsersClient` 목록 · `ReflectChip` · `… | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__te…` | ✅ (태스크가 만든다) | ✅ green |
| 29-15-T2 | 15 | 5 | ADMIN-09, ADMIN-10 | — | 승인 대기 섹션 · 사이드바 Admin 그룹 · `AdminSheet` 골격 · dma-gate 문구 … | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/componen…` | ✅ (태스크가 만든다) | ✅ green |
| 29-16-T1 | 16 | 6 | ADMIN-06 | — | 트레이서 — `(userId, serverKey)` 키 · `resolveTarget(broker)` … | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green |
| 29-16-T2 | 16 | 6 | ADMIN-06 | — | 조회 API · 전략 명령 세션 선택 · 비밀 교체 · DMA 유저 단위 종료 · D-10 재사용 · … | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run tests/se…` | ✅ (태스크가 만든다) | ✅ green |
| 29-17-T1 | 17 | 6 | ADMIN-09 | — | 트레이서 — 행 탭 → 시트 → 역할 세그먼트 즉시 저장(PATCH 1건) → 플래시 · 재조회 | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/componen…` | ✅ (태스크가 만든다) | ✅ green |
| 29-17-T2 | 17 | 6 | ADMIN-09 | — | 계좌 · 등록 서버 편집 · 비밀번호 변경 · 다시 반영 · 사용자 삭제(확인 1회) · BUSY 줄 | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/componen…` | ✅ (태스크가 만든다) | ✅ green |
| 29-17-T3 | 17 | 6 | ADMIN-09 | — | e2e P29-A3 — 폰(390) 바텀시트 · 데스크톱(1080) 우측 패널 · 필드별 요청 · BU… | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec playwright test e2e/spe…` | ✅ (태스크가 만든다) | ✅ green |
| 29-18-T1 | 18 | 7 | ADMIN-10 | — | 트레이서 — 서버 카드 목록 · 「주문 서버」 라디오 즉시 전환 · e2e P29-S1 | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/componen…` | ✅ (태스크가 만든다) | ✅ green |
| 29-18-T2 | 18 | 7 | ADMIN-10 | — | 「시세 주 서버」 전환(전환 중 · 실패 복귀) · 사용 토글(확인 · 사용 중 거부) · 편집/추가 … | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/componen…` | ✅ (태스크가 만든다) | ✅ green |
| 29-19-T1 | 19 | 7 | ADMIN-09 | — | 트레이서 — 「+ 사용자」 → trader + DMA 그룹 → POST 1건 → 편집 시트 결과 칩 ·… | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/componen…` | ✅ (태스크가 만든다) | ✅ green |
| 29-19-T2 | 19 | 7 | ADMIN-09 | — | viewer 경로 · 증권사별 필드 · 서버 체크 규칙 · 검증 · DMA 연결 없는 사용자 연결 폼 … | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/componen…` | ✅ (태스크가 만든다) | ✅ green |
| 29-20-T1 | 20 | 7 | ADMIN-06 | — | 트레이서 — 증권사별 acquire · hub 세션 소유 키 · 병합 상태 프레임 · 교보 계좌 주문 라우팅 | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green |
| 29-20-T2 | 20 | 7 | ADMIN-06 | — | D-18 캐시 규칙 하나씩 — 병합(66/67 · 64 · 83) · primary 전용(60/61 ·… | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run tests/hu…` | ✅ (태스크가 만든다) | ✅ green |
| 29-21-T1 | 21 | 8 | ADMIN-06 | — | 트레이서 — 87 새 계좌 → Ready 세션 mode 1 선언 → allowedAccounts → 브… | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green |
| 29-21-T2 | 21 | 8 | ADMIN-06 | — | 계좌 제외 축소 · 새 증권사 세션 acquire · DeleteUser 세션 종료(unauthoriz… | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run tests/ad…` | ✅ (태스크가 만든다) | ✅ green |
| 29-22-T1 | 22 | 9 | ADMIN-06 | — | 트레이서 — 레지스트리 주문 서버 변경 → `order.server` 프레임 → 웹 스토어 → 상태줄 배지 | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green |
| 29-22-T2 | 22 | 9 | ADMIN-06 | — | 인증 직후 스냅샷 · 배지 지우기(`next: null`) · `journal.state` · heal… | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run tests/or…` | ✅ (태스크가 만든다) | ✅ green |
| 29-23-T1 | 23 | 10 | ADMIN-07 | — | 트레이서 — `QuoteSwitch` 안정 래퍼 · break-then-make · hub 재구독 1회… | tracer | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green |
| 29-23-T2 | 23 | 10 | ADMIN-07 | — | 실패 복귀 · 단일 비행 · 레지스트리 불일치 보정 · 같은 서버 무동작 | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run tests/qu…` | ✅ (태스크가 만든다) | ✅ green |
| 29-24-T1 | 24 | 11 | ADMIN-08, ADMIN-12 | — | 트레이서 — `deploy-relay.sh` 레지스트리 모드 · 전환 잠금 · 호스트 env 제거 · 롤백 명시 주입… | tracer | `bash -n scripts/deploy-relay.sh && bash -n scripts/smoke-relay.sh && bash scripts/deploy-relay.sh --self-test` | ✅ (태스크가 만든다) | ✅ green |
| 29-24-T2 | 24 | 11 | ADMIN-08, ADMIN-12 | — | `deploy-server.sh` — relay 결선 복원(env · secret 바인딩 · serve… | auto | `bash -n scripts/deploy-server.sh && grep -q 'RELAY_ORDER_SECRET=gh-radar-relay-order-secret:latest' scripts/deploy-server.sh && grep -q 'RELAY_INTE…` | ✅ (태스크가 만든다) | ✅ green |
| 29-24-T3 | 24 | 11 | ADMIN-08, ADMIN-12 | — | D-19 재암호화 이관 도구 — 순수 계획(충돌 판정) · 스크립트(dry-run 기본) · 옛 등록 … | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green |
| 29-25-T1 | 25 | 12 | ADMIN-01, ADMIN-03, ADMIN-12 | — | 배포 준비 게이트(배포하지 않음) — 전체 단위 · pgTAP 전량 · e2e · gh-trade 상태… | auto | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --…` | ✅ (태스크가 만든다) | ✅ green |
| 29-25-T2 | 25 | 12 | ADMIN-01, ADMIN-03, ADMIN-12 | — | one-way 문 — 빅뱅 배포 go/no-go (D-05 운영 적용 · D-12) | decision | — (사람 확인 — resume 데이터) | — | ✅ (manual, 완료) |
| 29-25-T3 | 25 | 12 | ADMIN-01, ADMIN-03, ADMIN-12 | — | [BLOCKING] 메인 세션 — 배포 창 ①: 태그 기록 → 옛 relay 정지 → 개명 · v2 p… | human-action | `curl -s https://dma.jx1.io/healthz \| jq -e '.brokers.KB.server == "KB120" and .brokers.KYOBO.server == "KYOBO119" and .adminConns.KB120.state == "r…` | — | ✅ (manual, 완료) |
| 29-26-T1 | 26 | 13 | ADMIN-08, ADMIN-12 | — | 메인 세션 — server 배포 → uptime 재키잉 → `git push`(webapp) → 운영 확인 | human-action | `test "$(git rev-parse HEAD)" = "$(git rev-parse origin/master)" && curl -s https://dma.jx1.io/healthz \| jq -e '.status != null and .brokers.KYOBO !…` | — | ✅ (manual, 완료 — HEAD 일치 검사는 시점 확인용) |
| 29-26-T2 | 26 | 13 | ADMIN-08, ADMIN-12 | — | 배포 뒤 pgTAP 경로 정리 — 배포 창 사본 제거 · `--until` 실행 명령 · 전량 PASS… | auto | `R="$(ls supabase/migrations \| grep '_gateway_key_rename.sql$')" && V="$(ls supabase/migrations \| grep '_dma_visibility_v2.sql$')" && PRE="$(ls supa…` (dma_gateway_identities 는 `--until 20261006200300` — 29-26 편차 1) | ✅ (태스크가 만든다) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `supabase/tests/app_access.test.sql` · `dma_registry_intent.test.sql` — ADMIN-01/02/03 (29-01 T1 · T3 가 만든다)
- [x] `supabase/tests/dma_admin_intent.test.sql` · `dma_admin_reflect.test.sql` — ADMIN-03/05/09/10 (29-05)
- [x] `scripts/verify-dma-orders-price-check.sh --with` · `supabase/tests/fixtures/29_pre_rename.sql` · `gateway_key_rename.test.sql` · `gateway_key_rename_revert.test.sql` · `dma_visibility_v2.test.sql` — ADMIN-01/03 (29-09)
- [x] `relay/tests/helpers/fake-gateway.ts` admin 모드(role 2 · 44/86/87 · `defaultAdminHandler`) · `relay/tests/helpers/frames.ts` 86/87 빌더 — ADMIN-04/05 (29-02 — 생성물 동기화 뒤)
- [x] `relay/tests/helpers/supabase-stub.ts` 접근 맵 · `dma_users` 경로 · `webapp/e2e/fixtures/relay.ts` 새 원천 시드 — ADMIN-11 (29-06)
- [x] `relay/tests/config-registry.test.ts` · `registry.test.ts` · `pipelines.test.ts` — ADMIN-04 (29-03)
- [x] `relay/tests/admin-planner.test.ts` · `packages/shared/src/__tests__/admin.test.ts` · `admin-overview.test.ts` — ADMIN-05 (29-04)
- [x] `relay/tests/admin-conn.test.ts` · `admin-api.test.ts` · `admin-dispatcher.test.ts` · `admin-snapshot-sink.test.ts` · `admin-session-sync.test.ts` — ADMIN-04/05/06 (29-08 · 29-11 · 29-14 · 29-21)
- [x] `relay/tests/app-access.test.ts` · `fanout-access.test.ts` — ADMIN-11 (29-06)
- [x] `relay/tests/session-routing.test.ts` · `fanout-multi-session.test.ts` · `hub-multi-session.test.ts` · `order-server-notice.test.ts` · `quote-switch.test.ts` · `dma-users-migrate.test.ts` — ADMIN-06/07/12 (29-16 · 29-20 · 29-22 · 29-23 · 29-24)
- [x] `server/tests/middleware/require-admin.test.ts` · `routes/admin.test.ts` · `routes/admin-dma.test.ts` · `routes/admin-servers.test.ts` · `services/relay-admin-client.test.ts` — ADMIN-08 (29-10 · 29-13)
- [x] `webapp/src/lib/supabase/__tests__/access-gate.test.ts` · `webapp/e2e/specs/access-gate.spec.ts` — ADMIN-02 (29-12 · 원격 시드 29-07 전제)
- [x] `webapp/e2e/fixtures/admin.ts`(`mockAdminApi` · 픽스처) · `webapp/e2e/specs/admin.spec.ts` · `admin-servers.spec.ts` · `webapp/src/components/admin/__tests__/*` — ADMIN-09/10 (29-15 · 29-17 · 29-18 · 29-19)
- [x] e2e 테스트 계정 admin 시드 — D-20 개정: e2e 전용 경로뿐(운영 마이그레이션에 테스트 신원 없음 — 29-01 pgTAP 집합 단언 · 29-07 Task 1 SQL grep). 29-07 Task 1 이 `webapp/scripts/seed-test-user.ts` 에 `app_users` admin upsert 를 더하고 29-07 Task 2 에서 사용자가 실행 · 29-07 원격 적용 + e2e 전용 시드가 게이트(29-12) 커밋보다 먼저

*새 패키지 설치 없음 — 기존 vitest · Playwright · pgTAP 러너를 확장한다. 각 테스트 파일은 그것을 쓰는 태스크가 RED 먼저 만든다.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| D-05 one-way 문 확인 | ADMIN-03 | 사용자 결정(REVERSIBILITY_GATES) | 29-01 Task 2 — `db-intent` 선택 |
| 원격 additive push · RPC smoke · e2e 전용 시드 | ADMIN-01/02/03 | 운영 DB 쓰기는 메인 세션 몫 · 시드는 비밀 파일을 쓰므로 사용자 `!` 실행 | 29-07 Task 2 instructions 1~7(6 = e2e 전용 시드 · smoke f) |
| 빅뱅 go/no-go(D-05 운영 · D-12) | ADMIN-12 | one-way 운영 문 | 29-25 Task 2 |
| 배포 창 ①(옛 relay 정지 · 개명 push · 이관 · 새 relay · 입양) | ADMIN-01/03/12 | VM · DB · Secret 접근 · 20:00 이후 | 29-25 Task 3 instructions 1~8(뒤에 public healthz 자동 확인) |
| 배포 ②(server · uptime 재키잉 · git push · 운영 화면 확인) | ADMIN-08/12 | Cloud Run · Vercel 배포 · 실계정 화면 | 29-26 Task 1 instructions 1~6(뒤에 push · healthz · webapp 200 자동 확인) |
| gh-trade 서버 새 바이너리(role 2 · 정원 6) 배포 | ADMIN-04 | gh-trade 소관(29-07 체크포인트) | 29-25 Task 1 이 gh-trade STATE.md 원문으로 기록 |
| KB121 · KYOBO127 활성화(사용 켬) | ADMIN-01 | 네트워크 수동 · 127 커서 시드 | infra/relay/README.md 절차(29-24) — phase 밖 운영 |

*위 항목 외 모든 태스크는 automated 명령을 가진다(체크포인트 뒤 공개 healthz 확인 포함).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 29s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-10

## Validation Audit 2026-10-10

| Metric | Count |
|---|---|
| Gaps found | 1 |
| Resolved | 1 |
| Escalated | 0 |
| Extra flaky fixed | 1 |
| Extra flaky not reproduced | 1 |

- 갭: `relay/tests/pipelines.test.ts` ⑥ 저널 로그인 도착 전 단언(부하 flaky) → 조건 대기(2aa40ceb).
- 추가 수정: `relay/tests/admin-snapshot-sink.test.ts` A2 — 늦은 sync 가 기준선에 섞임 → 첫 sync 대기 뒤 기준선(5ff341e8).
- 미재현: `relay/tests/journal-boot.test.ts` 「전략 이벤트 적용 결선 (Phase 25)」 — 단독 21/21 · CPU 부하 8/8 통과, 코드 변경 없음(용의점: SIGTERM 종료 5초 = 테스트 대기 5초 동률).
- 단위 회귀: shared 435 · server 472 · webapp 3766(+1 skip) · relay 1263 · pgTAP 17파일 867(29-26).
