---
phase: 29-dma-multi-server-admin
plan: 24
subsystem: infra
tags: [deploy, relay, registry, cutover-gate, uptime, cloud-run, d-09, d-12, d-19, migration, aes-gcm]
status: complete

requires:
  - phase: 29-03
    provides: "relay production 은 DMA_REGISTRY_SOURCE=db 없으면 기동 거부 · healthz brokers.<증권사> = { server, alerting } 고정 필드"
  - phase: 29-06
    provides: "dma_users(AAD = dma_user_id) 를 wss 인증 원천으로 — 배포 전 dma_users 가 채워져야 한다"
  - phase: 29-08
    provides: "healthz adminConns.<서버 키> = { state, usersRev }"
  - phase: 29-09
    provides: "supabase/deploy-window/29/ 개명 · 가시성 v2 SQL · supabase/rollback/29-gateway-key-rename-revert.sql"
  - phase: 29-10
    provides: "server config RELAY_INTERNAL_URL · RELAY_ORDER_SECRET · RELAY_ADMIN_TIMEOUT_MS · assertRelayUrl(10.10.0.0/26)"
  - phase: 29-13
    provides: "Express Admin 라우트 → relay 내부 HTTP 프록시"
provides:
  - "deploy-relay.sh 레지스트리 모드 — 정상 배포 env-file = DMA_REGISTRY_SOURCE=db · 호스트 5종 주입 · read_live_env 주소 보존 제거"
  - "registry_cutover_gate(live, flag) 전환 잠금(fail closed) · --registry-cutover(29-25 1회) · 빌드/push/VM/알림 전 exit 1"
  - "--rollback 명시 주입 — DMA_HOST · DMA_KYOBO_HOST(off 허용) 필수 · DMA_REGISTRY_SOURCE 미주입 · gcloud 전 오프라인 거부"
  - "kyobo_presence(body) → brokers | legacy | absent | unknown — KYOBO uptime JSONPath $.brokers.KYOBO.alerting(옛 이미지 $.journalGateways.KYOBO.alerting) · 체크 이름/수 무변경"
  - "deploy-relay.sh --self-test — KYOBO 4표본 + 전환 잠금 4표본 오프라인 단언"
  - "smoke-relay.sh INV-5c — healthz brokers · adminConns 존재 + 식별자 · IPv4 없음(옛 이미지 SKIP) · registry_health_verdict"
  - "deploy-server.sh relay 결선 복원 — RELAY_INTERNAL_URL env(필수 · 대역 모양 검사) · RELAY_ORDER_SECRET 바인딩 · server SA accessor · 배포 뒤 대조"
  - "planDmaUserMigration(input) → DmaUserMigrationPlan { upserts; links; conflicts; skipped } · maskDmaUserId · maskEmail"
  - "scripts/migrate-dma-users.ts — 기본 dry-run · --apply(dma_users ON CONFLICT DO NOTHING → app_users 연결/trader 생성 → 재조회 라운드트립)"
  - "infra/relay/README.md — 레지스트리 배포 · 전환 잠금 · 롤백 절 · 증권사별 비밀 · Admin 신원/서버 추가 · KYOBO127 커서 시드"
affects: [29-25, 29-26]

actuals:
  tokens: 34240
  tasks: 3
  commits: 4
plan_head_before: 37f39445a4b70750ded37a732313d4e4ab67dee9
plan_head_after: 0aceb23b0011170562d8f134c74e1ce6f88da870

tech-stack:
  added: []
  patterns:
    - "배포 스크립트 안의 순수 판정 함수 + --self-test(표본 · 기대값 · exit 1) — 운영 판정 로직을 gcloud 없이 증명"
    - "전환 잠금 fail closed — 실행 중 상태(db) 또는 명시 플래그만 allow, 조회 실패도 deny · 변경 단계 전에 판정"
    - "정상 배포 env 와 롤백 env 를 head 단계에서 갈라 정상 경로에 주소 줄이 아예 없게(RELAY_ENV_MODE · RB_* 롤백 전용 head)"
    - "이관은 순수 계획(평문은 reencrypt 스코프 밖으로 안 나감) + 얇은 실행 스크립트(계수 · 마스킹 · 오류 code 만 출력)"

key-files:
  created:
    - relay/src/store/dma-users-migrate.ts
    - relay/tests/dma-users-migrate.test.ts
    - scripts/migrate-dma-users.ts
  modified:
    - scripts/deploy-relay.sh
    - scripts/smoke-relay.sh
    - ops/alert-kyobo-observer-down.yaml
    - infra/relay/README.md
    - scripts/deploy-server.sh
    - scripts/dma-credentials.ts

key-decisions:
  - "29-24 커밋부터 29-25 배포 창 전까지 relay 정상 배포 금지 — registry_cutover_gate 가 빌드 전에 거부한다. 그 사이 재배포는 DMA_HOST · DMA_KYOBO_HOST 를 명시한 --rollback <현재 태그> 뿐"
  - "KYOBO uptime 은 고정 이름 brokers.KYOBO 를 먼저 보고 옛 이미지는 journalGateways.KYOBO 로 알아본다 — 키 개명(KYOBO→KYOBO119)에 체크가 조용히 지워지지 않는다 · 체크 수 KB 1 + KYOBO 1 유지"
  - "정상 배포는 KYOBO 증권사 비밀을 있으면 늘 싣는다(어느 교보 서버가 켜졌는지는 레지스트리가 안다) · 없으면 비치명 ⚠ 후 배포(교보 서버 관찰자 · admin disabled)"
  - "--rollback 은 레지스트리 이전 이미지 전용 — 레지스트리 시대 태그는 DMA_REGISTRY_SOURCE 없이 기동 거부하므로 이 경로로 되돌릴 수 없다(그 커밋 체크아웃 후 정상 배포)"
  - "IDENTITY_MISMATCH 는 경고(severity warning) — 자격증명 DMA id 는 그대로 이관하고 연결이 가리키던 id 는 옮기지 않는다(behavior 명세 우선 · truths 의 「건너뛴다」 와 갈림 — 아래 Deviations)"
  - "이관 링크는 app_users 의 기존 다른 DMA id 를 덮지 않는다(LINK_MISMATCH 경고) · 기존 행은 dma_user_id IS NULL 일 때만 채운다"
  - "RELAY_INTERNAL_URL 은 저장소에 박제하지 않고 배포자가 넘긴다 — 미설정 · 10.10.0.0/26 밖이면 빌드 전 exit 1(server assertRelayUrl 과 같은 모양)"

patterns-established:
  - "배포 스크립트 --self-test: 판정은 함수로 꺼내 표본 heredoc 으로 단언하고 mutation 으로 실패 검출을 확인"

requirements-completed: [ADMIN-08, ADMIN-12]

coverage:
  - id: D1
    description: "deploy-relay.sh 레지스트리 모드 · 전환 잠금 · 롤백 명시 주입 · KYOBO 감시 고정 필드 (--self-test 8표본)"
    requirement: ADMIN-12
    verification:
      - kind: other
        ref: "bash -n scripts/deploy-relay.sh && bash -n scripts/smoke-relay.sh && bash scripts/deploy-relay.sh --self-test"
        status: pass
      - kind: other
        ref: "env -u DMA_HOST -u DMA_KYOBO_HOST bash scripts/deploy-relay.sh --rollback abc (exit 1 · gcloud 전)"
        status: pass
    human_judgment: false
  - id: D2
    description: "운영 배포 창에서의 실제 동작(전환 잠금 deny → --registry-cutover allow · KYOBO 체크 재키잉 · smoke INV-5c) — 29-25 메인 세션 실행 대상"
    requirement: ADMIN-12
    verification: []
    human_judgment: true
    rationale: "executor 는 운영에 대고 배포 스크립트를 실행하지 않는다(prohibition) — 실측은 29-25 배포 창"
  - id: D3
    description: "deploy-server.sh relay 결선 복원(RELAY_INTERNAL_URL · RELAY_ORDER_SECRET · accessor · 배포 뒤 대조)"
    requirement: ADMIN-08
    verification:
      - kind: other
        ref: "bash -n scripts/deploy-server.sh && grep RELAY_ORDER_SECRET=gh-radar-relay-order-secret:latest · RELAY_INTERNAL_URL"
        status: pass
    human_judgment: true
    rationale: "Cloud Run 리비전 env · IAM 반영은 29-25 배포 때만 확인 가능"
  - id: D4
    description: "D-19 재암호화 이관 계획 planDmaUserMigration + migrate-dma-users.ts(dry-run 기본)"
    requirement: ADMIN-12
    verification:
      - kind: unit
        ref: "relay/tests/dma-users-migrate.test.ts (14 tests)"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/relay exec tsx ../scripts/migrate-dma-users.ts --help"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-10-07
---

# Phase 29 Plan 24: 빅뱅 배포 준비 — 배포 스크립트 · uptime 재키잉 · server 복원 · 비밀번호 이관 도구 Summary

> ⚠ **29-25 배포 창 전 relay 정상 배포 금지 — 스크립트 전환 잠금(`registry_cutover_gate`)이 거부한다 · 꼭 필요하면 두 호스트를 명시한 `DMA_HOST=… DMA_KYOBO_HOST=… bash scripts/deploy-relay.sh --rollback <현재 태그>`.** 전환은 29-25 런북의 `bash scripts/deploy-relay.sh --registry-cutover` 1회뿐이다(옛 relay 정지 · 키 개명 push · 비밀번호 이관 뒤).

**relay 배포가 `DMA_REGISTRY_SOURCE=db` 레지스트리 모드로 바뀌되 실행 중 relay 가 레지스트리 전이면 빌드 전에 스스로 거부하고(fail closed), KYOBO uptime 은 고정 필드 `$.brokers.KYOBO.alerting` 으로 키 개명에 흔들리지 않으며, server 배포는 Admin 용 relay 결선(env · secret · accessor)을 되찾았고, 옛 `dma_credentials` 를 DMA 유저당 암호문 1개(AAD = dma_user_id)로 옮기는 dry-run 기본 이관 도구가 충돌을 멈춰 세운다 — 아무것도 배포하지 않았다.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-10-06T19:56:42Z
- **Completed:** 2026-10-06T20:12:24Z
- **Tasks:** 3
- **Files modified:** 9 (생성 3 · 수정 6)

## Accomplishments

- `scripts/deploy-relay.sh` — 정상 배포 env-file 에 `DMA_REGISTRY_SOURCE=db` 만, 주소 5종 주입과 `read_live_env` 주소 보존 경로 제거. 전환 잠금 `registry_cutover_gate` · `--registry-cutover` · `--rollback` 두 호스트 필수 · `kyobo_presence` 판정 · `--self-test` · 기동 확인 `brokers.KB.server` 1줄 · 최종 요약이 실행 중 `DMA_REGISTRY_SOURCE` 와 healthz `brokers` 서버 키를 찍는다.
- `scripts/smoke-relay.sh` — INV-5c(brokers · adminConns 존재 · 값 키 허용 목록 · 식별자 · IPv4 없음 · 옛 이미지 SKIP), KYOBO 참고 줄이 `brokers.KYOBO` 먼저.
- `ops/alert-kyobo-observer-down.yaml` — 문서만 새 경로로(조건은 check_id 기반이라 무변경 · 4382B < 9500B 상한 규율).
- `scripts/deploy-server.sh` — `RELAY_INTERNAL_URL` 필수 env(값 미출력 · 10.10.0.0/26 모양 검사) · `RELAY_ORDER_SECRET=gh-radar-relay-order-secret:latest` · server SA accessor · 선행 존재 검사 · 배포 뒤 대조 2종 · 결선 요약 1줄 · Phase 29 머리 주석.
- `relay/src/store/dma-users-migrate.ts` + `scripts/migrate-dma-users.ts` — D-19 이관 계획/실행. `scripts/dma-credentials.ts` 머리에 레거시 표시.
- `infra/relay/README.md` — §레지스트리 배포 · 전환 잠금 · 롤백(신설) · §관찰자 비밀 증권사별 단락 · §다중 게이트웨이 관찰자 Phase 29 머리 · §신원 연결 Admin 경로 · §KYOBO 끊김 알림 판정 4갈래 · §끄기·롤백 · §DMA 서버 추가 절차 Admin 순서 + KYOBO127 커서 시드.

## Task Commits

1. **Task 1: 트레이서 — deploy-relay.sh 레지스트리 모드 · 전환 잠금 · 롤백 명시 주입 · KYOBO 감시 고정 필드 · --self-test · smoke · 알림 문서 · README** — `ec38e911` (chore)
2. **Task 2: deploy-server.sh relay 결선 복원** — `742db3b4` (chore)
3. **Task 3: D-19 재암호화 이관 도구** — RED `a08ac01a` (test) → GREEN `0aceb23b` (feat)

## 전환 잠금 · self-test 증거

`bash scripts/deploy-relay.sh --self-test` (네트워크 · gcloud 없음):

```
ok   kyobo_presence  새 본문(brokers.KYOBO) → brokers
ok   kyobo_presence  옛 본문(journalGateways.KYOBO) → legacy
ok   kyobo_presence  KYOBO 없음 → absent
ok   kyobo_presence  깨진 JSON → unknown:JSON 아님
ok   registry_cutover_gate  db + 플래그 없음 → allow:실행 중 relay 가 이미 레지스트리 모드(DMA_REGISTRY_SOURCE=db) — 전환 끝남
ok   registry_cutover_gate  값 없음 + 플래그 없음 → deny:실행 중 컨테이너에 DMA_REGISTRY_SOURCE 가 없다 — 레거시 env 모드이거나 VM/컨테이너 조회 실패
ok   registry_cutover_gate  env + 플래그 없음 → deny:실행 중 relay 가 레거시 env 모드(DMA_REGISTRY_SOURCE=env)
ok   registry_cutover_gate  값 없음 + --registry-cutover → allow:--registry-cutover — 29-25 배포 창의 1회 전환
self-test OK 8 cases
```

- mutation 확인: `env` 분기를 allow 로 바꾼 사본에서 `FAIL registry_cutover_gate env + 플래그 없음 → allow:x (기대 deny)` · `self-test FAIL (8 cases)` · exit 1.
- **정상 배포 판정 호출(`CUTOVER_VERDICT="$(registry_cutover_gate …)"`)은 521행, Section 4 `docker build` 는 682행** — Section 3(572행) 선행 리소스 검증보다도 앞이다.
- 오프라인 롤백 거부: `DMA_HOST` 미설정 → exit 1 · `DMA_HOST` 만 → `DMA_KYOBO_HOST` 요구 exit 1 · 둘 다 gcloud 가드 전.

`grep -n "DMA_KYOBO_HOST\|DMA_HOST=" scripts/deploy-relay.sh` 분류(정상 배포 env-file 에 호스트 없음):

| 줄 | 분류 |
|----|------|
| 24 · 57 | 머리 주석(사용법 · 롤백 env 문서) |
| 212 · 215 · 216 | `if [[ "$MODE" == rollback ]]` 오프라인 검사 블록 |
| 527 | 전환 잠금 deny 안내 문구(echo — 롤백 명령 예시, 주입 아님) |
| 549 · 553 · 557 | Section 2 `if [[ "$MODE" == rollback ]]` 분기 |
| 716 | `if [[ "$MODE" == rollback ]]` 안 롤백 전용 REMOTE_HEAD(`RB_*`) |
| 791 · 795 | 원격 env-file `RELAY_ENV_MODE` ≠ registry(= legacy-env · 롤백) 분기 |

## 이관 dry-run 예시 (테스트 데이터 — 임시 키 · 가짜 id)

자격증명 5행(u1 · u2 → trA01 같은 비밀번호 · u3 → trB02 + 신원 연결 KYOBO119 → kyD09 · u4 · u5 → trC03 다른 비밀번호), app_users 에 u1 · u2 만:

```
DMA 자격증명 이관 계획 (dry-run — 쓰지 않음)
  옛 자격증명 행:          5 (DMA id 3)
  dma_users 새 행:         2
  dma_users 이미 있음:     0 (덮지 않음)
  app_users 연결:          3 (새 trader 생성 1)
  app_users 이미 연결:     0
  충돌 — 이관 안 함:       1
  충돌 — 경고(이관함):     1
    + dma_users tr***(5)
    + dma_users tr***(5)
    → al*** ⇢ tr***(5)
    → br*** ⇢ tr***(5)
    → ch*** ⇢ tr***(5) (새 trader)
    ! tr***(5) PASSWORD_MISMATCH (이관 안 함)
    ! tr***(5) IDENTITY_MISMATCH (경고 — 이관함)
```

(위는 `planDmaUserMigration` 을 스크립트와 같은 출력 형식으로 돌린 것 — 원격 DB · Secret 에는 닿지 않았다.)

## Files Created/Modified

- `relay/src/store/dma-users-migrate.ts` — 순수 이관 계획 · 충돌 판정 · 마스킹
- `relay/tests/dma-users-migrate.test.ts` — behavior 14건(테스트 전용 32B 키)
- `scripts/migrate-dma-users.ts` — dry-run/--apply 실행기(relay 워크스페이스 tsx)
- `scripts/deploy-relay.sh` — 레지스트리 모드 · 전환 잠금 · 롤백 · KYOBO 판정 · self-test
- `scripts/smoke-relay.sh` — INV-5c · KYOBO 참고 줄
- `ops/alert-kyobo-observer-down.yaml` — 문서 경로 갱신
- `infra/relay/README.md` — 운영 절 갱신
- `scripts/deploy-server.sh` — relay 결선 복원
- `scripts/dma-credentials.ts` — 레거시 머리 주석(코드 무변경)

## Decisions Made

frontmatter `key-decisions` 참조. 요점: 전환 잠금은 조회 실패까지 deny(fail closed) · 롤백은 두 호스트 명시 필수 · KYOBO 판정은 brokers 먼저 · 이관 충돌 중 IDENTITY/LINK/EMAIL 은 경고(이관 진행) · PASSWORD/DECRYPT/ROUNDTRIP 은 그 DMA id 통째 제외.

## Deviations from Plan

### Auto-fixed / 해석

**1. [Rule 2 - 정합] IDENTITY_MISMATCH 를 「건너뜀」 이 아니라 「경고 + 이관」 으로 구현**
- **Found during:** Task 3
- **Issue:** must_haves truth 는 「`dma_gateway_identities` 가 다른 DMA id 를 가리키면 그 DMA id 를 건너뛰고 충돌로 보고」, behavior 명세는 「IDENTITY_MISMATCH · d2 는 그대로 이관(경고)」 로 갈린다.
- **Fix:** 테스트 가능한 behavior 명세를 따랐다. 충돌 항목에 `severity: "skipped" | "warning"` 을 더해 구분한다 — 비밀번호 불일치 · 복호 실패 · 라운드트립 실패는 skipped(이관 안 함), 신원 불일치는 warning(자격증명 id 이관 · 연결 id 는 안 옮김). dry-run 출력도 「이관 안 함 / 경고 — 이관함」 으로 나눠 29-25 사용자 판단에 쓴다.
- **Files:** relay/src/store/dma-users-migrate.ts · relay/tests/dma-users-migrate.test.ts
- **Commit:** 0aceb23b

**2. [Rule 2 - 안전] 이관 계획에 LINK_MISMATCH · EMAIL_MISSING · ROUNDTRIP_FAILED 추가**
- **Issue:** 계획 명세에 없던 경우 — app_users 가 이미 다른 DMA id 로 연결됨 · 자격증명 주인의 이메일을 모름 · 재암호화 재복호 불일치.
- **Fix:** 기존 연결을 덮지 않고 경고 · 링크만 빼고 경고 · 그 id 를 skipped. `--apply` 의 기존 행 갱신은 `dma_user_id IS NULL` 조건(동시 Admin 저장 보호).
- **Commit:** 0aceb23b

**3. [Rule 2 - 안전] deploy-server.sh 에 RELAY_INTERNAL_URL 모양 검사**
- **Issue:** server 는 production 에서 10.10.0.0/26 밖 주소면 부팅을 거부한다(`assertRelayUrl`) — 잘못된 값이면 빌드 · push 뒤 새 리비전이 죽는다.
- **Fix:** 빌드 전에 같은 모양(`http(s)://10.10.0.N[:포트]` · N ≤ 63 · 선행 0 거부)을 검사해 exit 1. 9개 표본으로 bash 에서 확인.
- **Commit:** 742db3b4

**4. [Rule 2 - 정합] 정상 배포의 KYOBO 비밀 처리**
- **Issue:** 주소를 모르게 된 정상 배포가 「호스트가 있을 때만 KYOBO 비밀을 싣는」 옛 조건을 쓸 수 없다(RESEARCH Runtime State Inventory — 「루프 정책 재검토」).
- **Fix:** 정상 배포는 KYOBO 증권사 비밀을 있으면 늘 싣고, 없으면 비치명 ⚠(레지스트리 교보 서버 관찰자 · admin disabled) 후 배포. 롤백은 종전처럼 교보 호스트가 있을 때만.
- **Commit:** ec38e911

**5. [TDD] Task 3 커밋을 RED/GREEN 둘로** — 플랜 output 은 「커밋 3개」 지만 `tdd="true"` 태스크라 tdd.md 커밋 계약(test → feat)을 따라 커밋 4개가 됐다.

**Total deviations:** 4 auto-fixed(Rule 2) + 1 커밋 수 차이. **Impact:** 범위 확대 없음 — 모두 배포 · 이관 안전을 위한 가드다.

## Issues Encountered

- Bash 도구 셸이 zsh 라 `BASH_REMATCH` 정규식 표본 시험이 처음엔 엉뚱한 ACCEPT 를 냈다 — 스크래치 스크립트를 `bash` 로 돌려 재확인(스크립트 자체는 `#!/usr/bin/env bash` 라 무관).

## Known Limitations

- `--rollback` 은 레지스트리 이전 이미지 전용이다. 29-25 뒤 레지스트리 시대 태그로 되돌리려면 그 커밋을 체크아웃해 정상 배포한다(README 에 명시).
- smoke INV-5c 는 `brokers` · `adminConns` 가 **둘 다 없으면** 옛 이미지로 보고 SKIP 한다 — 새 이미지인데 켜진 서버가 하나도 없는 극단 상태도 SKIP 으로 보인다.

## Next Phase Readiness

- 29-25 런북 재료: `bash scripts/deploy-relay.sh --registry-cutover` · `pnpm --filter @gh-radar/relay exec tsx ../scripts/migrate-dma-users.ts`(dry-run → `--apply`) · server 배포 `RELAY_INTERNAL_URL=<README §주문 경로 결선 행>` + `CORS_ALLOWED_ORIGINS`(라이브 env) · 롤백 = README §레지스트리 배포 · 전환 잠금 · 롤백.
- gh-trade op 2 마지막 사용자 패치(dc8fb50a) 미배포 — README §신원 연결에 「서버의 마지막 사용자 삭제 금지」 를 적었다.
- 운영 배포 · Secret 읽기 · 이관 `--apply` · push 는 하지 않았다.

## Self-Check: PASSED

- 파일 3종 존재(dma-users-migrate.ts · dma-users-migrate.test.ts · migrate-dma-users.ts) · 커밋 4개(ec38e911 · 742db3b4 · a08ac01a · 0aceb23b) HEAD 조상 확인
- 수용 기준 재실행: self-test 8 OK · grep 계수(--self-test 6 · kyobo_presence 10 · registry_cutover_gate 7 · README KYOBO127 8 · /admin/servers 5 · relay-order-secret 6 · Phase 29 11 · planDmaUserMigration 1 · MISMATCH 9 · 레거시 1) · relay 전체 테스트 52 파일 1263 통과
