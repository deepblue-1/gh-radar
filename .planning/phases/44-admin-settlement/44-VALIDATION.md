---
phase: "44"
slug: "admin-settlement"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-20"
---

# Phase 44 — 검증 전략

> 실행 중 되먹임 표본을 위한 phase 별 검증 계약. 출처: `44-RESEARCH.md` 「## Validation Architecture」.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest(shared · server · webapp) · pgTAP(로컬 컨테이너) · Playwright |
| **Config file** | `server/vitest.config.ts` · `webapp/vitest.config.ts` · shared 는 vitest 기본 · `webapp/playwright.config.ts`(baseURL `http://localhost:3100`) |
| **Quick run command** | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/settlement.test.ts --maxWorkers=2` |
| **Full suite command** | `pnpm --filter @gh-radar/shared exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/server exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2` + `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/settlement.test.sql` + `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin-settlement.spec.ts --workers=1` |
| **Estimated runtime** | 빠른 실행 약 10초 · 전체 약 5 ~ 8분 |

동시 세션 메모리 고갈 방지: vitest 는 항상 `--maxWorkers=2`, Playwright 는 `--workers=1`. 전체 회귀는 한 세션만 돌린다.

---

## Sampling Rate

- **After every task commit:** 그 태스크가 닿은 패키지의 vitest 파일 하나(`--maxWorkers=2`). shared 를 고쳤으면 server · webapp 검증 전에 `pnpm --filter @gh-radar/shared build`(shared 는 `dist` 로만 연결된다).
- **After every plan wave:** shared · server · webapp vitest 전체(`--maxWorkers=2`) + pgTAP 1건.
- **Before `/gsd-verify-work`:** 위 + Playwright `--workers=1` + `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` 가 녹색.
- **Max feedback latency:** 120초(태스크 단위 빠른 실행 기준)

---

## Per-Task Verification Map

Task ID · Plan · Wave 는 플래너가 PLAN.md 를 쓴 뒤 채운다. 이 phase 는 REQUIREMENTS.md 에 매핑된 REQ-ID 가 없어 로드맵 확정 규칙과 CONTEXT 결정(D-NN)을 요구사항 칸에 적는다. 보안 위협 모델은 이 프로젝트에서 하지 않는다(Threat Ref 「—」).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 44-01-T1 · 44-02-T1 | 44-01 · 44-02 | 1 · 2 | 규칙 1 · 2 · 4 · 6 / D-01 · D-06 — 검산 픽스처 전 항목(계좌 수익 · 묶음 · 원금 · 사람별 몫 · 명의 대 몫 · 계좌이체 합 · 뺄 계좌 · 미설정) | — | N/A | unit(shared) | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/settlement.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 44-02-T1 | 44-02 | 2 | D-09 — 4 : 3 : 3 끝전(100,000,005원) · 바로 출금 만원 미만 버림 · 정산 뒤 사람별 몫 | — | N/A | unit(shared) | 위와 같음 | ✅ | ✅ green |
| 44-01-T1 | 44-01 | 1 | D-08 — 억 · 만 표기 경계(0 · 9,999 · 음수 · 1억 · 9,999만 · 10억 1만) · 날짜 · 읽은 시각 | — | N/A | unit(shared) | 위와 같음 | ✅ | ✅ green |
| 44-02-T2 | 44-02 | 2 | D-13 — 장중 판정(평일 `08:00` ~ `20:00` KST 경계 · 주말 · UTC 자정 근처) | — | N/A | unit(shared) | 위와 같음 | ✅ | ✅ green |
| 44-01-T1 · 44-06-T1 | 44-01 · 44-06 | 1 · 3 | D-03 — 예수금 선택이 계좌 메뉴와 같은 값(live 우선 · 87 폴백 · 첫 known 사용자 · 서버 간 다름) | — | N/A | unit(shared + webapp 대조) | shared 위 + `pnpm --filter @gh-radar/webapp exec vitest run src/components/admin/__tests__/account-linked-summary.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 44-01-T1 | 44-01 | 1 | D-04 · D-25 — 조회: relay 성공 → 읽은 값 기록 · relay 실패 → 마지막 값 + 읽은 시각 · 없음/0 → 미설정 · 읽은 값 기록 RPC 실패해도 200(경고 로그) | — | N/A | integration(server) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-settlement.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 44-01-T2 | 44-01 | 1 | D-01 · D-24(최소) · UI E1 — 트레이서 화면 끝: 검산 응답 → 「정산 전 수익」 계좌 표 숫자 · 불러오기 · 오류 · 403 · 미설정 「—」 | — | N/A | component(webapp) | `pnpm --filter @gh-radar/webapp exec vitest run src/components/settlement/__tests__/settlement-client.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 44-01-T1 · 44-05-T1 · 44-08-T1 | 44-01 · 44-05 · 44-08 | 1 · 3 · 4 | D-18 — 비관리자 403 · RPC 0회 · relay 0회 | — | 관리자만 접근 | integration(server) | 위와 같음 | ✅ | ✅ green |
| 44-05-T1 · 44-05-T2 | 44-05 | 3 | D-10 · D-26 — 예수금 반영: 성공 · 한 서버 실패 · timeout(목표값 보존) · 1원 미만 미송신 · 대상 0 · 빈 fan-out(결과 0건 → 미반영 · Pitfall 8) · 계좌 옮김 한쪽 실패 · 다시 반영 때 지금 = 목표 → 미송신 · 저장 · 지우기 RPC 일반 오류 → relay 쓰기 0 · pend 기록 0(POST · PUT · DELETE 각각) | — | N/A | integration(server) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-settlement-ledger.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 44-05-T2 · 44-08-T2 · 44-10-T2 · 44-11-T2 | 44-05 · 44-08 · 44-10 · 44-11 | 3 · 4 · 5 · 6 | D-30 — 거래 지우기 · 정산 취소에서 되돌릴 수 없으면 미리 409 `REVERT_UNREADABLE`(문장 글자 그대로 · RPC 0 · relay 쓰기 0) · 지운/취소한 뒤 보내기만 실패 → `unreverted` + 「…예수금은 되돌리지 못했어요 — 계좌 메뉴에서 맞춰 주세요」 · 화면은 창 유지 · 문장 접두 없이 · 확정 잠금 · 닫을 때 다시 불러오기 | — | N/A | integration(server) + component(webapp) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-settlement-ledger.test.ts tests/routes/admin-settlement-settle.test.ts --maxWorkers=2` + `pnpm --filter @gh-radar/webapp exec vitest run src/components/settlement --maxWorkers=2` | ✅ | ✅ green |
| 44-03-T2 · 44-08-T1 · 44-08-T2 | 44-03 · 44-08 | 2 · 4 | D-16 · D-17 — 확정: 서버 계산 · 반영 전 값 스냅샷 · 동시 확정 409 · 쥬니 손실/미설정 409 · 최신만 취소 · 확정 · 취소 RPC 일반 오류 → relay 쓰기 0 | — | N/A | integration(server) + pgTAP | server 위 + `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/settlement.test.sql` | ✅ | ✅ green |
| 44-01-T3 · 44-03-T1 · 44-03-T2 · 44-04-T2 | 44-01 · 44-03 · 44-04 | 1 · 2 · 8 | D-14 · D-19 · D-21 — 시드 9건 정확히 1벌 · 종류별 모양 · 미래 날짜 거부 · 바로 출금 줄 직접 고치기/지우기 거부 · 이력 보존 · 권한(RLS on · service_role 전용) · `admin_settlement_raw` 다섯 목록 항목 키 집합 = shared `SettlementRaw`(`jsonb_object_keys` 집합 단언) · 마이그레이션 네 파일 버전 순서(스키마 < 거래 RPC < 정산 RPC < 시드 · 앞 파일 고치지 않음) | — | anon · authenticated 권한 없음 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/settlement.test.sql` + `… --test supabase/tests/settlement_seed.test.sql` | ✅ | ✅ green |
| 44-01-T3 · 44-13-T1 | 44-01 · 44-13 | 1 · 9 | D-02 — 정산 shared · server · 마이그레이션 · webapp 정산 파일의 주석 아닌 줄에 체결 실현손익 · 어드민 매매손익 데이터 이름 없음(파일 존재 확인 포함) | — | N/A | 정적 검사 | 44-01 T3 · 44-13 T1 의 `<automated>` 안 D-02 구간 | ✅ | ✅ green |
| 44-06-T2 | 44-06 | 3 | D-18 · 사이드바 — Admin 하위 「정산」 자리 · `/admin/settlement` 활성 | — | N/A | unit(webapp) | `pnpm --filter @gh-radar/webapp exec vitest run src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 44-06-T1/T2 · 44-07-T1/T2 · 44-09-T1/T2 · 44-10-T1/T2 · 44-11-T1/T2 | 44-06 · 44-07 · 44-09 · 44-10 · 44-11 | 3 ~ 6 | D-22 ~ D-27 — 카드 · 표 · 시트 · 펼침 · 확인 · 반영 상자의 문구와 상태(UI-SPEC 문구 정본) | — | N/A | component(webapp) | `pnpm --filter @gh-radar/webapp exec vitest run src/components/settlement --maxWorkers=2` | ✅ | ✅ green |
| 44-12-T1 · 44-12-T2 | 44-12 | 7 | 화면 전체 · 폭 — 첫 화면 숫자(검산 숫자) · 360 / 390 / 1024 / 1440 가로 넘침 0 · 정산 확정 흐름 | — | N/A | E2E | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin-settlement.spec.ts --workers=1` | ✅ | ✅ green |
| 44-13-T1 · 44-13-T2 | 44-13 | 9 | 배포 게이트 — RPC 이름 대조(모은 개수 7 이상) · 커밋한 마이그레이션 불변(MIGRATION-UNCHANGED — 네 파일 각각 처음 더한 커밋 뒤 변경 0 · 미커밋 0 · 구분 표지) · phase 커밋 범위(플랜마다 커밋 · 제목 범위 44 전부 relay 무변경) · SCHEMA-PUSHED(네 버전) · REMOTE-SCHEMA-OK(원격 스키마에 함수 · 표 실물 + 네 파일 최종본 구분 표지 · 빈 덤프 실패) · SERVER-LIVE(`/api/health` version = 이번 빌드 · 옛 revision 이면 실패) | — | N/A | 배포 확인(메인 세션) | 44-13 T1 · T2 의 `<automated>` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/shared/src/__tests__/settlement.test.ts` — 검산 픽스처(원 단위) · 4 : 3 : 3 끝전 · 표기 · 장중 판정
- [x] `server/tests/routes/admin-settlement.test.ts` — supabase rpc 핸들러 · 가짜 relay(`accountCosts` · `setAccountBudget` 응답 조작)
- [x] `supabase/tests/settlement.test.sql` — 표 · RPC · 권한(44-01 · 44-03)
- [x] `supabase/tests/settlement_seed.test.sql` — 시드 함수 · 없는 계좌 거부 · 멱등(44-04)
- [x] `webapp/src/components/settlement/__tests__/*.test.tsx` — 화면 조각
- [x] `webapp/e2e/specs/admin-settlement.spec.ts` — 첫 화면 숫자 · 폭 · 확정 흐름

테스트 도구 설치는 필요 없다(vitest · pgTAP 러너 · Playwright 모두 이미 있음).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 거래 저장 → 계좌 메뉴 예수금이 실제로 바뀜 · 「다시 반영」 | D-10 · D-26 | 운영 매매 서버가 있어야 한다 | 배포 날 메인 세션: 정산 화면에서 소액 거래를 「예수금에도 반영」 켠 채 저장 → 계좌 메뉴 값 확인 → 거래 지우기(반영 되돌림) → 값 복귀 확인 |
| 계좌 4개의 증권사 · 계좌번호 대응과 지금 예수금 | D-14 · D-25 | 운영 DB · relay 값은 사용자 확인이 필요 | 시드 전에 사용자가 계좌 메뉴의 4계좌 번호를 알려 준다 → 배포 뒤 정산 화면 숫자를 CONTEXT 검산 숫자와 대조(예수금이 11-19 잔액과 다르면 그 차이만큼 다름) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-21 (validate-phase 감사 — 아래 Validation Audit)

## Validation Audit 2026-11-21

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

실행 근거(2026-11-21): vitest shared 75 · server 94 · webapp 253(18 파일) 녹색 · pgTAP `settlement.test.sql` 192 · `settlement_seed.test.sql` 27 PASS · Playwright `admin-settlement.spec.ts` 9 passed · D-02 정적 검사(정산 파일 22개 주석 아닌 줄) OK. 44-13 배포 행은 1회성 배포 확인이라 `44-13-SUMMARY.md` 의 증거로 녹색 처리.
