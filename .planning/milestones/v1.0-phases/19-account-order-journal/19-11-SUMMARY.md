---
phase: 19-account-order-journal
plan: 11
subsystem: deploy
tags: [deploy, supabase, db-push, rls, secret-manager, iam, gh-trade, gateway, observer, D-05, D-09, D-10, D-14, T-19-01, T-19-03, T-19-11, T-19-39, T-19-40]
status: complete

requires:
  - phase: 19-account-order-journal
    provides: "19-03 마이그레이션 20260924200000_dma_journal_tables · 20260924200100_dma_journal_rpcs"
  - phase: 19-account-order-journal
    provides: "19-08 pgTAP dma_journal_apply · dma_journal_schema"
  - phase: 19-account-order-journal
    provides: "19-10 setup-relay-iam.sh Secret 4종 루프 · deploy-relay.sh 관찰자 비밀 · infra/relay/README.md 관찰자 비밀 주입 절"
provides:
  - "원격 DB: 새 계좌 기준 테이블 4(dma_journal_events · dma_account_orders · dma_account_access · dma_journal_cursor) · 인덱스 5 · 함수 7 — RLS 활성 · 정책 0 · 권한 service_role 뿐"
  - "GCP Secret gh-radar-dma-observer-secret(ENABLED 버전 1, 2026-09-25T07:23:52Z) + gh-radar-relay-sa secretAccessor"
  - "120 게이트웨이: gh-trade 0a50367a(Phase 23 관찰자 계약) 배포·재기동 · config/observer.toml(600) · 저널 epoch 20260925-f337f3e7405b92de6546a147932cd879"
affects: [19-12, 19-13]

actuals:
  tokens: 6000
  tasks: 3
  commits: 0
plan_head_before: 8d13f6a7ae86897ccb0c24e414683ffe199ce3b5

tech-stack:
  added: []
  patterns:
    - "원격 반영 순서(18-29 계승): migration list → 전 덤프(저장소 밖) → dry-run → push --yes → migration list → 후 덤프 diff"
    - "설정 스크립트의 라이브 VM 단계는 실행 전 저장소 자산과 읽기 전용 대조 — 같으면 no-op 임을 확인한 뒤 실행"
    - "비밀 값은 사람이 한 번 생성 → 비출력 파이프로 두 곳 → 해시 앞 12자 세 곳 대조, Claude 는 버전 존재만 확인"

key-files:
  created: []
  modified: []

key-decisions:
  - "20:00 KST 이후 조건을 사용자가 면제 — 2026-09-25 추석 연휴 휴장으로 장중 위험 없음(Task 2 15:59~16:04 · 게이트웨이 재기동 16:24:45 KST)"
  - "플랜 문구 '함수 6' 은 셈 오류 — 실제 7(status_rank · next_status · origin · project · apply · sync_access · orders_for_user), 전부 service_role 전용"

requirements-completed: [D-05, D-09, D-10, D-14]

duration: 약 30분 (15:59 ~ 16:30 KST)
completed: 2026-09-25
---

# Phase 19 Plan 11: 전환 배포 창 ① — 원격 DB 반영 · 관찰자 비밀 · gh-trade 게이트웨이 Summary

**D-14 순서의 앞 두 단계를 마쳤다. 원격 DB 에 계좌 기준 테이블 4 · 함수 7 을 반영했다. 반영 뒤 덤프로 네 테이블의 RLS 활성 · 정책 0 · 권한 service_role 뿐 · `dma_orders` 변화 0 을 확인했다. 관찰자 비밀은 Secret Manager 에 ENABLED 버전 1 이 있고, 120 파일과 해시가 일치한다. gh-trade 0a50367a 게이트웨이가 관찰자 설정을 읽고 새 저널 epoch 로 기동했다. 19-12 는 relay 배포부터 이어서 한다.**

## 승인과 진입 조건 (Task 1)

- **승인:** 사용자가 2026-09-25 16:00 KST 쯤 orchestrator 세션에서 「proceed」를 선택했다.
- **gh-radar 전량 게이트 green:**
  - 빌드·타입체크: shared build · relay typecheck / typecheck:tests · webapp typecheck
  - 테스트: relay 28 files / 628 · webapp 98 files / 1707 passed (1 skipped) · server 31 files / 261
  - pgTAP: dma_journal_apply 79/79 · dma_journal_schema 93/93
  - `sync-relay-schema --check` 신규/변경 0 (blob 46323080 = gh-trade origin/master 0a50367a)
- **G2:**
  - gh-trade Phase 23 cloud-verify ctest 17/17 + VM E2E 통과
  - observer.toml 절차 합의(`~/gh-trade-server/config/observer.toml`, `[observer] secret`, 600)
  - Phase 23 외 동반 변경은 주석 1줄
- **롤백 태그:** 라이브 relay `6b85c1e` (https://dma.jx1.io/healthz)

## Task 2: 원격 DB push · 덤프 권한 확인 · 비밀 껍데기·IAM

**① `supabase migration list --linked` (전).** Local/Remote 가 어긋난 행은 두 개뿐이다. 원격 전용 행은 0.
```
   20260923120000 | 20260923120000 | 2026-09-23 12:00:00
   20260924200000 |                | 2026-09-24 20:00:00
   20260924200100 |                | 2026-09-24 20:01:00
```
전 덤프: `supabase db dump --linked -s public -f <scratchpad>/19-before.sql` (2035줄, 저장소 밖).

**`supabase db push --dry-run`**
```
Initialising login role...
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
Would push these migrations:
 • 20260924200000_dma_journal_tables.sql
 • 20260924200100_dma_journal_rpcs.sql
Finished supabase db push.
```

**② `supabase db push --yes` (종료 0)**
```
Initialising login role...
Connecting to remote database...
Do you want to push these migrations to the remote database?
 • 20260924200000_dma_journal_tables.sql
 • 20260924200100_dma_journal_rpcs.sql

 [Y/n] y
Applying migration 20260924200000_dma_journal_tables.sql...
Applying migration 20260924200100_dma_journal_rpcs.sql...
Finished supabase db push.
```

**③ `supabase migration list --linked` (후, 끝부분).** 어긋난 행은 0.
```
   20260923120000 | 20260923120000 | 2026-09-23 12:00:00
   20260924200000 | 20260924200000 | 2026-09-24 20:00:00
   20260924200100 | 20260924200100 | 2026-09-24 20:01:00
```
플랜 자동 검증 `grep -cE "20260924200100 +\| +20260924200100"` → `1` (20260924200000 도 `1`).

**전후 덤프 diff** (`19-before.sql` 2035줄 ↔ `19-after.sql` 2751줄): 지운 줄 0, 더한 줄 716.

| 확인 항목 | 결과 |
|---|---|
| 새 테이블 | 4 — `dma_account_access` · `dma_account_orders` · `dma_journal_cursor` · `dma_journal_events` |
| 인덱스 | 5 — `idx_dma_account_access_account` · `idx_dma_account_orders_account_day` · `idx_dma_journal_events_account_day` · `uq_dma_account_orders_order_no` · `uq_dma_account_orders_reject` |
| 함수 | 7 — `dma_journal_status_rank` · `next_status` · `origin` · `project` · `apply` · `sync_access` · `orders_for_user` |
| diff 안의 `dma_orders` 줄 | 0 (덤프 전 31 = 후 31) |
| 새 테이블 대상 `CREATE POLICY` | 0 (전체 정책 수 전 34 = 후 34) |
| diff 안의 `"anon"` · `"authenticated"` | 0 · 0 |
| diff 안의 GRANT | 11줄, 대상은 모두 `TO "service_role"` |
| 새 객체 말고 바뀐 것 | 0 |

RLS 원문 (후 덤프):
```
2320:ALTER TABLE "public"."dma_account_access" ENABLE ROW LEVEL SECURITY;
2323:ALTER TABLE "public"."dma_account_orders" ENABLE ROW LEVEL SECURITY;
2329:ALTER TABLE "public"."dma_journal_cursor" ENABLE ROW LEVEL SECURITY;
2332:ALTER TABLE "public"."dma_journal_events" ENABLE ROW LEVEL SECURITY;
```
권한 원문 (후 덤프):
```
2462:REVOKE ALL ON FUNCTION "public"."dma_journal_apply"("p_gateway" "text", "p_epoch" "text", "p_events" "jsonb") FROM PUBLIC;
2463:GRANT ALL ON FUNCTION "public"."dma_journal_apply"("p_gateway" "text", "p_epoch" "text", "p_events" "jsonb") TO "service_role";
2467/2468  dma_journal_next_status("p_cur" "text", "p_next" "text")               REVOKE … FROM PUBLIC / GRANT ALL … TO "service_role"
2472/2473  dma_journal_orders_for_user("p_user_id" "uuid", "p_trade_date" "date")  같은 형태
2477/2478  dma_journal_origin("p_raw" "text")                                      같은 형태
2482/2483  dma_journal_project("p_gateway" "text", "p_epoch" "text", "p_ev" "jsonb") 같은 형태
2487/2488  dma_journal_status_rank("p_status" "text")                              같은 형태
2492/2493  dma_journal_sync_access("p_gateway" "text", "p_rows" "jsonb")          같은 형태
2597:GRANT ALL ON TABLE "public"."dma_account_access" TO "service_role";
2601:GRANT ALL ON TABLE "public"."dma_account_orders" TO "service_role";
2609:GRANT ALL ON TABLE "public"."dma_journal_cursor" TO "service_role";
2613:GRANT ALL ON TABLE "public"."dma_journal_events" TO "service_role";
```
마이그레이션은 테이블에 `SELECT, INSERT, UPDATE, DELETE` 를 줬는데 덤프에는 `GRANT ALL` 로 나온다. Supabase 기본 권한(default privileges)이 service_role 에 ALL 을 주기 때문이고, 기존 `dma_orders` 의 `GRANT ALL … TO "service_role"` 와 같은 모양이다.

**④ `GCP_PROJECT_ID=gh-radar bash scripts/setup-relay-iam.sh`** (인증: deployer SA)
- **dry-run** (종료 0, 「GCP 상태 변경 0건」): 새로 만드는 것은 `gcloud secrets create gh-radar-dma-observer-secret` 하나다. 그 밖에 멱등 단계로 `services enable` 과 radar-gw `add-metadata` 가 있었다.
- **라이브 VM 대조:** 실행 전에 radar-gw 메타데이터 8종(startup-script · kbvpn-* 4 · caddyfile · wg-probe 2)을 저장소 자산과 읽기 전용으로 대조했다. 모두 SAME 이었다.
- **실제 실행 (종료 0):**
```
▶ creating empty secret: gh-radar-dma-observer-secret (값은 별도 주입 필요)
Created secret [gh-radar-dma-observer-secret].
Updated IAM policy for secret [gh-radar-dma-observer-secret].
✓ secretAccessor bound: gh-radar-dma-observer-secret → gh-radar-relay-sa
▶ VM 메타데이터 갱신 (저장소 자산 → 인스턴스)...
No change requested; skipping update for [radar-gw].
✅ setup-relay-iam.sh 완료
```
  나머지 Secret 3종 · supabase-service-role · 프로젝트 역할 3종은 이미 있던 상태라 멱등 재바인딩이었다.
- **`gcloud secrets describe gh-radar-dma-observer-secret --project=gh-radar --format='value(name)'`** → `projects/1023658565518/secrets/gh-radar-dma-observer-secret`
  - 이 시점 버전 0
  - IAM: `roles/secretmanager.secretAccessor` → `serviceAccount:gh-radar-relay-sa@gh-radar.iam.gserviceaccount.com`

## Task 3: 관찰자 비밀 주입 · gh-trade 게이트웨이 배포·재기동 (사람)

- **비밀 주입:** 사용자가 주입 스크립트를 `!` 로 직접 실행했다(scratchpad `inject-observer-secret.sh`, 대상 kb120 · SSH 키 인증).
  - 로컬 · Secret Manager · 120 파일의 해시 앞 12자가 **세 곳 일치**했다.
  - Claude 가 실행하려던 시도는 권한 분류기가 막았다. Claude 는 값을 생성·출력·읽기 하지 않았다.
- **Claude 확인:** `gcloud secrets versions list gh-radar-dma-observer-secret --filter='state=ENABLED' --format='value(name,createTime)' --project=gh-radar` → `1	2026-09-25T07:23:52` (1줄, 값은 읽지 않음).
- **게이트웨이 배포 (gh-trade 세션 보고):**
  - 배포 커밋 `0a50367a` (origin/master), .fbs blob `46323080`
  - 원격 `bin/stock-dma-server.version` = `0a50367a`
  - 2026-09-25 16:24:45 KST 에 한 번 재기동, active
- **동반 배포:** `b524b603` 이후 Phase 23 전부(관찰자 로그인 · 주문 저널 · 리뷰 수정 14건 · EX-01) + `Gateway.h` 주석 1줄.
- **기동 로그 (실패 줄 0):**
  - `[Config] 관찰자 설정 로드: config/observer.toml`
  - `[Journal] 새 epoch 생성: 20260925-f337f3e7405b92de6546a147932cd879` (첫 기동, 기록 없음)
  - `[Server] 주문 저널 열림 … head=0 oldest=0`
  - `Initialized successfully`
- **파일 권한:** observer.toml 600 · log/journal 700 · epoch/seq.state 600.
- **observer_probe:** `LOGIN success=1 broker=KB epoch=20260925-f337f3e7405b92de6546a147932cd879 head=0 oldest=0 resync=0 accounts=3`
- **저널 상태:** 휴장이라 KB FEP 에 연결되지 않아 저널이 비어 있다. 첫 레코드는 다음 거래일(2026-09-28) 에 생긴다.

## Deviations from Plan

**1. [사용자 승인 예외] 20:00 KST 이후 조건 면제**
- **해당:** Task 2 precondition · Task 3 재기동 지시 (D-14 · T-19-40)
- **내용:** 2026-09-25 는 추석 연휴 휴장이라 장중 위험이 없다. 사용자가 20:00 조건을 면제했다.
- **실제 시각:** Task 2 는 15:59~16:04 KST, 게이트웨이 재기동은 16:24:45 KST 에 했다.

**2. [기록 정정] 함수 수 6 → 7**
- 플랜 must_haves · 산출물 표는 "함수 6" 이라고 적었다.
- 마이그레이션 원문과 원격 덤프는 모두 7개다.
- 7개 전부 anon · authenticated GRANT 0 이고 service_role 전용이라 T-19-01 은 충족한다.

**3. [안전 확인 추가] setup-relay-iam.sh 의 라이브 VM 메타데이터 단계를 실행 전 대조**
- 이 단계는 플랜이 말한 범위(껍데기 + 접근권)를 넘어설 수 있었다.
- 저장소 자산과 같다는 것을 읽기 전용으로 확인한 뒤 실행했고, 결과는 "No change requested" 였다.

## 롤백 경로 (19-12 가 이어받음)

- relay: 이전 태그 `6b85c1e`
- server: 이전 revision
- webapp: 이전 배포 승격
- gh-trade: 백업 바이너리
- DB: 추가 전용이라 롤백 불요

## Self-Check: PASSED

- 원격 `migration list --linked` 에 `20260924200000 | 20260924200000` · `20260924200100 | 20260924200100` — FOUND
- 후 덤프 네 테이블 `ENABLE ROW LEVEL SECURITY` 4줄 · 새 테이블 대상 정책 0 · anon/authenticated GRANT 0 — CONFIRMED
- `gcloud secrets describe gh-radar-dma-observer-secret` — FOUND · ENABLED 버전 1 (2026-09-25T07:23:52) — FOUND
- 저장소 코드 변경 0 · 태스크 커밋 0 (배포·검증 plan, 문서 커밋만) — CONFIRMED
