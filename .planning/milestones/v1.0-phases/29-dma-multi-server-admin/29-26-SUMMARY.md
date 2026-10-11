---
phase: 29-dma-multi-server-admin
plan: 26
subsystem: infra
tags: [deploy, big-bang, server, uptime-rekey, webapp-push, pgtap, deploy-window-cleanup, d-12]
status: complete

requires:
  - phase: 29-25
    provides: "원격 DB 키 개명 · 가시성 v2 (migrations 20261007200000 · 20261007200100) · relay 레지스트리 모드 e2a12c34 · 87 입양"
provides:
  - "server Cloud Run 리비전 gh-radar-server-00058-kqw — RELAY_INTERNAL_URL=http://10.10.0.5:8091 · RELAY_ORDER_SECRET(secretRef) · 미인증 /api/admin/users 401"
  - "KYOBO uptime 감시 재키잉 — JSONPath $.brokers.KYOBO.alerting (deploy-relay.sh --alert-only)"
  - "webapp 프로덕션 — 923eec8f push · Vercel ready"
  - "운영 확인 — /admin/users 실데이터 · 칩 반영됨 · /admin/servers KB120·KYOBO119 연결 · 121/127 꺼짐 · /trading 정상"
  - "배포 뒤 pgTAP 실행 경로 — supabase/deploy-window/29 제거 · --until 20261006200300 · 전 17파일 867 단언 PASS"
affects: [29-gap-closure]

tech-stack:
  added: []
  patterns:
    - "배포 창 SQL 이 migrations 로 들어간 뒤 옛 의미 회귀는 --until <개명 직전 버전> 으로 끊고 같은 migrations 파일을 --with 로 순서대로 건다"

key-files:
  created: []
  modified:
    - supabase/tests/gateway_key_rename.test.sql
    - supabase/tests/gateway_key_rename_revert.test.sql
    - supabase/tests/dma_visibility_v2.test.sql
    - supabase/tests/dma_gateway_identities.test.sql
    - supabase/tests/dma_journal_apply.test.sql
    - supabase/tests/fixtures/29_pre_rename.sql
    - scripts/verify-dma-orders-price-check.sh
    - infra/relay/README.md
    - scripts/smoke-server.sh
  deleted:
    - supabase/deploy-window/29/01_gateway_key_rename.sql
    - supabase/deploy-window/29/02_dma_visibility_v2.sql

key-decisions:
  - "옛 뷰 회귀(dma_gateway_identities)의 --until 은 플랜의 「v2 직전 버전」(20261007200000 = 개명) 이 아니라 「개명 직전 버전」 20261006200300 — 개명이 dma_credentials.gateway 기본값을 'KB120' 으로 바꿔 20261007200000 까지 재생하면 9건 not ok"
  - "dma_journal_apply 는 --until 로 끊지 않고 픽스처를 v2 레지스트리로 재기반(1b66a044 Phase 28 선례와 같은 방식) — 저널 투영 단언은 현행 의미로 계속 잠가야 하므로"
  - "주문 서버 계좌별 지정(KB120/KB121) 은 Phase 29 갭 클로징으로 따로 — 이 플랜에서 구현하지 않음"
  - "교보 trader id 변경 불필요 — 교보 주문 전문(146B)에 지점·트레이더 칸이 없고 주문자 식별은 서버 단위 FEP 로그온 USER ID"

requirements-completed: [ADMIN-08, ADMIN-12]

actuals:
  tokens: 10800
  tasks: 2
  commits: 1
plan_head_before: e303c4eb0e91bd4e08e60417061180ef20f35d19
plan_head_after: 536ea9ec

duration: 25min
completed: 2026-10-10
---

# Phase 29 Plan 26: 빅뱅 배포 ② — server · 감시 재키잉 · webapp push · 운영 확인 · 배포 뒤 pgTAP 경로 정리 Summary

**메인 세션이 server 리비전 `gh-radar-server-00058-kqw`(relay 내부 결선) → KYOBO 감시 재키잉(`$.brokers.KYOBO.alerting`) → `923eec8f` push(Vercel 프로덕션)까지 올리고 사용자가 운영 화면을 확인했다. executor 는 배포 창 사본을 지우고 pgTAP 실행 경로를 `--until 20261006200300` 형태로 고쳐 전 17파일 867 단언 PASS 를 확인했다.**

## Task 1 — 배포 · 운영 확인 (메인 세션 · checkpoint:human-action)

| # | 단계 | 결과 |
|---|------|------|
| 1 | 29-25 뒤 healthz | ok — relay `e2a12c34` · brokers KB120/KYOBO119 · adminConns ready |
| 2 | server 배포 | Cloud Run 리비전 **`gh-radar-server-00058-kqw`** · env `RELAY_INTERNAL_URL=http://10.10.0.5:8091` · `RELAY_ORDER_SECRET`(secretRef) · 미인증 `GET /api/admin/users` → **401**(smoke 레이트리밋 탐침이 남긴 일시 429 1회 뒤 재조회 401) |
| 3 | 감시 재키잉 | `deploy-relay.sh --alert-only` → **KYOBO 감시 켜짐 · JSONPath `$.brokers.KYOBO.alerting`** |
| 4 | webapp push | **`923eec8f`** push → Vercel 프로덕션 ready · `https://gh-radar-webapp.vercel.app/login` · trade.jx1.io 로그인 200 |
| 5 | 운영 확인 | 사용자 확인(2026-10-10 「다 잘 되는데」) — 아래 표 |

### 운영 확인 (UAT 최소)

| 화면 | 결과 |
|------|------|
| `/admin/users` | 실데이터로 열림 · 기존 사용자 계좌 칩 「반영됨」 · 사용자가 Admin UI 로 ezmesya@gmail.com ↔ DMA id `ezmesya` 연결 |
| `/admin/servers` | KB120 · KYOBO119 연결 · KB121 · KYOBO127 사용 꺼짐 |
| `/trading` | 작업대 종전처럼 정상 |
| `/pending`(미허용 계정 「승인 대기」) | **이 체크포인트에서 미확인 — UAT 항목으로 남김** |

### executor 재개 시 읽기 전용 재확인 (2026-10-10 11:3x KST)

- `git merge-base --is-ancestor 923eec8f origin/master` → 포함(플랜의 `HEAD == origin/master` 는 동시 세션의 미푸시 Phase 28 커밋 때문에 의미 없어 이것으로 대체 — 오케스트레이터 지시).
- `https://dma.jx1.io/healthz` → `status: ok` · brokers `KB` · `KYOBO` 존재 · `version: aecf0868`(29-25 의 e2a12c34 뒤 다른 세션의 relay 재배포 — 버스트 해제 라벨 인박스 처리) · KYOBO `alerting: false`.
- `https://gh-radar-webapp.vercel.app/login` → 200.

### Task 1 중 메인 세션 수정 (Rule 1)

- **[Rule 1 - Bug] smoke-server INV-12a · INV-12c 가 Phase 16 옛 규칙으로 `RELAY_INTERNAL_URL` · `RELAY_ORDER_SECRET` 의 「부재」를 단언** → server 배포 smoke EXIT=1. 「존재」 단언으로 고치고 라이브 env 이름과 대조 → `923eec8f`(`fix(29-26): smoke-server INV-12a·12c 를 Phase 29 relay 결선 있음으로 정정`). 이 커밋이 4단계의 push 대상.

### 후속 (이 플랜에서 구현하지 않음)

- (a) **주문 서버를 계좌별로 지정**(KB120/KB121 중 계좌마다) — 사용자 결정: Phase 29 갭 클로징으로 추가.
- (b) **교보 trader id** — 확인 결과 교보 주문 전문(146B)에는 지점 · 트레이더 칸이 없고, 주문자 식별은 서버 단위 FEP 로그온 USER ID(gh-trade `server/src/broker/kyobo/KyoboProtocol.h` · go-trader `pkg/order/kyobo` 동일) → 변경 불필요.

## Task 2 — 배포 뒤 pgTAP 경로 정리

- `git rm supabase/deploy-window/29/01_gateway_key_rename.sql · 02_dma_visibility_v2.sql` — 정본은 `supabase/migrations/20261007200000_gateway_key_rename.sql` · `20261007200100_dma_visibility_v2.sql`(두 벌 금지). `supabase/deploy-window/` 디렉터리 자체가 사라짐.
- 네 테스트 머리 주석 실행 명령을 배포 뒤 형태로(본문 무수정). 개명 직전 additive 버전 = `20261006200300`(`dma_admin_reflect`).

### 새 실행 명령 표

| 테스트 | 실행 명령 | 결과 |
|--------|-----------|------|
| `gateway_key_rename` | `--until 20261006200300 --with supabase/tests/fixtures/29_pre_rename.sql --with supabase/migrations/20261007200000_gateway_key_rename.sql` | 20/20 PASS |
| `gateway_key_rename_revert` | `--until 20261006200300 --with …/29_pre_rename.sql --with …/20261007200000_gateway_key_rename.sql --with …/20261007200100_dma_visibility_v2.sql --with supabase/rollback/29-gateway-key-rename-revert.sql` | 21/21 PASS |
| `dma_visibility_v2` | 옵션 없음(전 재생) | 19/19 PASS |
| `dma_gateway_identities` | `--until 20261006200300` | 42/42 PASS |

(모두 `bash scripts/verify-dma-orders-price-check.sh … --test supabase/tests/<이름>.test.sql`.)

### 전 pgTAP (전 재생 · 위 4개 제외)

| 파일 | 결과 |
|------|------|
| app_access | 30/30 PASS |
| dma_admin_intent | 69/69 PASS |
| dma_admin_reflect | 72/72 PASS |
| dma_journal_apply | 89/89 PASS(재기반 뒤 — 아래 편차 2) |
| dma_journal_schema | 96/96 PASS |
| dma_orders_modified | 15/15 PASS |
| dma_orders_price_check | 12/12 PASS |
| dma_registry_intent | 83/83 PASS |
| dma_strategy_apply | 30/30 PASS |
| dma_strategy_limit_feature | 24/24 PASS |
| dma_strategy_read | 28/28 PASS |
| limitup_load | 163/163 PASS |
| limitup_report | 54/54 PASS |

**합계: 17파일 · 867 단언 · not ok 0.** 플랜 verify 2(app_access … dma_strategy_read 6종) 원문 그대로 종료 코드 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 옛 뷰 회귀의 `--until` 버전이 플랜 처방과 다르다**
- **Found during:** Task 2
- **Issue:** 플랜은 `dma_gateway_identities` 를 「v2 직전 버전」(= 개명 20261007200000)까지 재생하라 했고 verify 1 도 그렇게 계산한다. 그러나 이 테스트는 옛 키 의미(`dma_credentials.gateway` 기본값 `'KB'` · KB/KYOBO 신원)를 잠그므로 개명까지 재생하면 not ok 9건(기본값 KB120 · 가시성 매트릭스).
- **Fix:** `--until 20261006200300`(개명 직전)으로 머리 명령을 적음 → 42/42 PASS. 개명 · v2 뒤 의미는 `gateway_key_rename` · `dma_visibility_v2` 가 잠근다. 플랜 verify 1 은 이 값으로 바꿔 실행.
- **Files modified:** supabase/tests/dma_gateway_identities.test.sql
- **Commit:** 536ea9ec

**2. [Rule 1 - Bug] `dma_journal_apply` 가 v2 가 migrations 로 들어온 뒤 12건 실패**
- **Found during:** Task 2(전 pgTAP)
- **Issue:** 픽스처가 옛 가시성(`dma_credentials` · 게이트웨이 `'KB'`)이라 v2(app_users × dma_servers 레지스트리) 아래에서 조회 RPC 가 0행 → 가시성 · 투영 조회 단언 12건 not ok. 29-25 전에는 v2 가 배포 창에 있어 전 재생에 안 들어가 가려져 있었다. 플랜 verify 2 가 이 파일의 PASS 를 요구.
- **Fix:** 1b66a044(Phase 28 픽스처 재기반)와 같은 방식 — `dma_users` + `app_users`(trader) 로 연결 · `'KB'` → `'KB120'` 43곳 · DMA id ≤ 8바이트 제약으로 `dma-shared` → `dma-shr`. `KB2` 는 레지스트리 밖 커서 · 투영 전용 키라 그대로(가시성 단언 없음). 단언 수 · 기대값 무수정 → 89/89 PASS.
- **Files modified:** supabase/tests/dma_journal_apply.test.sql
- **Commit:** 536ea9ec

**3. [Rule 1 - Bug] 지운 배포 창 경로를 가리키는 주석 3곳**
- **Found during:** Task 2
- **Issue:** 러너 사용 예(`scripts/verify-dma-orders-price-check.sh`) · 픽스처 머리(`29_pre_rename.sql`) · relay README 전환 절이 `supabase/deploy-window/29/` 를 가리켜 git rm 뒤 끊긴 경로.
- **Fix:** migrations 경로 · `--until` 형태로 갱신(주석만). 운영에 적용된 `supabase/migrations/20261007200000_gateway_key_rename.sql` 의 머리 주석(역사 서술)은 적용된 마이그레이션이라 손대지 않음.
- **Files modified:** scripts/verify-dma-orders-price-check.sh · supabase/tests/fixtures/29_pre_rename.sql · infra/relay/README.md
- **Commit:** 536ea9ec

**4. [Rule 1 - Bug] smoke-server INV-12a/12c** — Task 1 중 메인 세션이 수정(`923eec8f`) · 위 Task 1 절 참조.

### 실행 메모

- 동시 세션이 활성이라 경로 지정 `git add` 만 사용. ROADMAP · STATE · state.json 은 오케스트레이터 몫이라 건드리지 않음. 실행 중 다른 세션 커밋 `bb24767f`(docs(27)) 가 내 태스크 커밋 위에 올라와 `plan_head_after` 는 이 플랜의 마지막 태스크 커밋 `536ea9ec` 로 적음(`git rev-list --count e303c4eb..536ea9ec` = 1).
- 오케스트레이터 지시대로 master(주 트리 · 순차 디스패치)에 커밋. `git.base-branch --is-protected master` = true 지만 사용자 운영 규칙(작업은 master 에서)과 오케스트레이터 고정 설정에 따름.
- 배포 · push · db push · Secret 쓰기 없음.

## Known Stubs

없음.

## Next Phase Readiness

- Phase 29 운영 적용(DB → relay → server → webapp) 끝 · 저장소 pgTAP 이 운영 배치와 같다.
- 남은 것: `/pending` 미허용 계정 「승인 대기」 UAT · 주문 서버 계좌별 지정 갭 클로징 · gh-trade dc8fb50a 재배포 전 서버 마지막 사용자 삭제 금지(29-25 유지).
- 536ea9ec · 이 SUMMARY 커밋은 다음 사용자 push 때 원격으로(이 플랜은 push 하지 않음).

## Self-Check: PASSED

- 커밋 536ea9ec · 923eec8f HEAD 조상 확인 · supabase/deploy-window/29 부재 · 수정 테스트 파일 존재.
