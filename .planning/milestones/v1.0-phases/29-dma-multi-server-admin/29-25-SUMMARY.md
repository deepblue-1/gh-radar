---
phase: 29-dma-multi-server-admin
plan: 25
subsystem: infra
tags: [deploy, big-bang, relay, registry-cutover, gateway-key-rename, visibility-v2, dma-users-migration, d-05, d-12]
status: complete

requires:
  - phase: 29-24
    provides: "deploy-relay.sh 레지스트리 모드 · 전환 잠금(--registry-cutover 1회) · --rollback 두 호스트 명시 · migrate-dma-users.ts(dry-run 기본) · smoke INV-5c"
  - phase: 29-09
    provides: "supabase/deploy-window/29/01_gateway_key_rename.sql · 02_dma_visibility_v2.sql · supabase/rollback/29-gateway-key-rename-revert.sql"
  - phase: 29-07
    provides: "원격 DB 에 Phase 29 additive 마이그레이션 4개 적용 · app_users admin 3 / trader 2"
provides:
  - "원격 DB 게이트웨이 키 개명(KB→KB120 · KYOBO→KYOBO119) · 가시성 v2 적용 — 20261007200000 · 20261007200100 Local=Remote"
  - "dma_users 2행 이관(AAD = dma_user_id) · app_users 연결 3 · 라운드트립 일치"
  - "운영 relay e2a12c34 — DMA_REGISTRY_SOURCE=db 레지스트리 모드 · brokers KB120/KYOBO119 · adminConns 2 ready(rev 1) · KYOBO 감시 $.brokers.KYOBO.alerting"
  - "87 계좌 의도 입양 KB120 2 · KYOBO119 2(멱등 확인)"
  - "롤백 명령(역개명 SQL → --rollback c7b5b2c9 · 두 호스트 명시)"
affects: [29-26]

requirements-completed: [ADMIN-01, ADMIN-03, ADMIN-12]

key-decisions:
  - "go(사용자 「지금 하자」 2026-10-07 05:4x KST) — 플랜의 20:00 KST 이후 대신 장 시작 전 창(08:00 전 · 증권사 세션 07:00 전)에 실행"
  - "relay 배포는 detached worktree @e2a12c34 에서 — 메인 트리 미커밋 파일(tasks/lessons.md 등)이 이미지·태그에 섞이지 않게"
  - "gh-trade dc8fb50a(op 2 마지막 사용자 → code 12) 재배포 전까지 Admin 에서 서버의 마지막 사용자 삭제 금지"

actuals:
  tokens: 9000
  tasks: 3
  commits: 1
plan_head_before: 0b02524bfebd2e08c13e803ed5a7a3473e1daa7a
plan_head_after: e2a12c347e3967a4e0dd535210ecff7ef7329a59

duration: 50min
completed: 2026-10-07
---

# Phase 29 Plan 25: 빅뱅 배포 ① — 준비 게이트 · go/no-go · 배포 창 Summary

> **창 열기 전제(Task 1 판정):** gh-trade KB120 · KYOBO119 가 Phase 29 바이너리 `84824b07` 로 가동 중이다(원문 인용 아래) — **「창 열지 말 것」 조건 아님.**
> 단 **gh-trade 29-08 수정(dc8fb50a · op 2 마지막 사용자 → code 12)은 아직 두 서버에 재배포되지 않았다** — 재배포 전까지 Admin 에서 **서버의 마지막 사용자를 삭제하지 않는다.**

**준비 게이트 전량 green(단위 5,885 · pgTAP 458 · e2e 149 · self-test 8) 뒤 사용자가 go 를 골라 장 시작 전 창(05:49~06:02 KST)에서 옛 relay 정지 → 키 개명 · 가시성 v2 push → 비밀번호 이관(dma_users 2 · 충돌 0) → 새 relay `e2a12c34` 레지스트리 전환(adminConns 2 ready) → 87 입양(2 + 2)까지 끝냈다. 롤백은 쓰지 않았다. server · uptime · webapp(push)은 29-26.**

## 준비 게이트 (Task 1 — 2026-10-07 05:1x KST · HEAD `0b02524b`)

| # | 게이트 | 결과 |
|---|--------|------|
| 1 | `shared build` · typecheck 4종(relay · relay tests · webapp · server) | exit 0 · `error TS` 0 |
| 1 | vitest — shared | **18 파일 · 434 통과** |
| 1 | vitest — relay | **52 파일 · 1263 통과** |
| 1 | vitest — webapp | **160 파일 · 3725 통과 · 1 skipped**(기존 skip) |
| 1 | vitest — server | **39 파일 · 463 통과** |
| 2 | pgTAP `app_access` | 30/30 PASS |
| 2 | pgTAP `dma_registry_intent` | 83/83 PASS |
| 2 | pgTAP `dma_admin_intent` | 69/69 PASS |
| 2 | pgTAP `dma_admin_reflect` | 72/72 PASS |
| 2 | pgTAP `dma_gateway_identities` | 42/42 PASS |
| 2 | pgTAP `dma_journal_apply` | 89/89 PASS |
| 2 | pgTAP `dma_strategy_read` | 28/28 PASS |
| 2 | pgTAP `dma_strategy_limit_feature` | 24/24 PASS |
| 2 | 키 개명 왕복(픽스처 → 01 개명 → 02 가시성 v2 → 역개명) `gateway_key_rename_revert` | 21/21 PASS (마이그레이션 63개 재생) |
| 3 | Playwright e2e 8 spec(admin · admin-servers · access-gate · trading-workbench · order-log · sidebar-tree · me · auth-guards) | **149 passed (6.1m) · failed 0 · flaky 0** · NextFontGoogleFontFileReplacer 반복 없음(.next 정리 불요) |
| 4 | `deploy-relay.sh --self-test` | **self-test OK 8 cases**(kyobo_presence 4 · registry_cutover_gate 4) |
| 4 | `bash -n scripts/deploy-server.sh` | exit 0 |

pgTAP 합계 **437 + 왕복 21 = 458 단언 전부 ok.**

### 저장소 상태 (배포 커밋 기준)

- `git status --porcelain --untracked-files=no` → **1줄: ` M tasks/lessons.md`** — 다른 세션의 미커밋 변경(이 플랜 · Phase 29 와 무관). 수용 기준 「0줄」 은 이 파일을 제외하면 충족. **창의 3단계 커밋은 두 마이그레이션 경로만 `git add` 하므로 영향 없음 — `tasks/lessons.md` 는 스테이징하지 않는다.**
- `git rev-list --left-right --count origin/master...HEAD` → **`0	91`** (origin 뒤처짐 0 · 앞섬 91)
- `git log --format='%h %an %s' origin/master..HEAD` → **91 커밋 · 작성자 전부 `deepblue-1`**. 29-xx · phase-29 이외 커밋은 `e244de52 docs(inbox): gh-trade 261007 op 2 마지막 사용자 거부 노트 처리 완료` 와 executor worktree 병합 커밋 4개(`5d580551` · `011199bf` · `c97df832` · `d049c816`)뿐 — 남의 미배포 기능 커밋 없음.
- 현재 운영 relay(공개 healthz, 읽기만 · 05:18 KST): `version = c7b5b2c9` · `status ok` · `journal live` · `brokers` 없음 · `adminConns` 없음 → **레거시 env 모드 이미지**(`c7b5b2c9` 는 HEAD 조상 · quick-261006-pdw). 창 1단계에서 다시 읽어 **이전 태그로 기록**한다(그 사이 다른 세션 배포 가능성).

## gh-trade 29-07 서버 배포 상태 (원문 인용)

출처: gh-trade `origin/master`(39774781 — 로컬 `master` 는 origin 보다 37 커밋 뒤라 원격 추적 ref 로 읽음, fetch 하지 않음) `.planning/phases/29-admin-users-toml-gh-radar/29-07-SUMMARY.md` · 커밋 `2b38c36a`.

> 커밋 `2b38c36a` 제목: 「docs(29-07): KB120·KYOBO119 재기동·확인 완료 — 84824b07 가동(23:37·23:39 KST), users 3명·관찰자 정원 6·admin USERS count=3」

> provides: 「KB120·KYOBO119 가 84824b07(Phase 29)로 가동 중 — users.toml 3명 로드 · 관찰자 정원 6 · admin 로그인(role 2)·87 USERS 성공」

> 「KB120·KYOBO119 에 Phase 29 바이너리 `84824b07` 을 보냈다. … 23:37·23:39 KST 에 두 서버를 재기동했다. 두 호스트 모두 아래를 확인했다. … 관찰자 정원이 6 으로 잡혔다. 점검 도구가 admin 으로 로그인했고(role 2) 87 응답이 `USERS rev=1 count=3` 이다.」

> | kb-prod-120 | Tue 2026-10-06 23:37:26 KST | active / running |
> | kyobo-prod-119 | Tue 2026-10-06 23:39:11 KST | active / running |

- `84824b07` 은 gh-trade `origin/master` 조상(병합됨). 오케스트레이터 전달 사실(2026-10-06 ~23:40 KST 보고)과 일치.
- **KB121 · KYOBO127 은 범위 밖** — 레지스트리 시드 `enabled=false`(20261006200100 ①). 둘 없이 빅뱅 진행 가능.
- gh-trade `STATE.md`(origin/master) 의 Status 줄은 아직 「29-07 KB120·KYOBO119 배포 진행」 문구다 — STATE 갱신 지연일 뿐이고 정본은 위 29-07 SUMMARY(status complete) · 커밋 `2b38c36a` 다.

### gh-trade 29-08(dc8fb50a) — 재배포 여부

- `dc8fb50a`(op 2 마지막 사용자 → code 12) 는 **`worktree-phase-29-admin-users` 브랜치에만 있고 `origin/master` 에 없다.**
- 같은 브랜치 `29-UAT.md`(33531ebb) 1번 항목:
  > 「29-08 을 master 에 병합하고 KB120·KYOBO119 에 재배포한다 (재기동은 20:00 KST 이후)」 … 「재배포 전까지 운영 수칙: Admin 화면에서 서버의 마지막 사용자를 삭제하지 않는다(가동본 84824b07 에는 CR-01 이 그대로다).」 — `result: [pending]`
- **판정: 미재배포.** 창 · 창 이후 Admin 사용에서 **서버의 마지막 사용자 삭제 금지**(지우면 사용자 0명 users.toml → 다음 재기동에서 서버 기동 거부). 와이어 무변경이라 빅뱅 순서에는 영향 없음(인박스 261007 노트 「배포 순서 제약」).

## fbs blob 대조

| ref | `server/src/protocol/StockDMA.fbs` blob |
|-----|------|
| 기대(인박스 261006-admin-users-role2-44-86-87 · relay 사본) | `03fc8cbedcd8542e9febf2416fa8bd595aa5d9fd` |
| gh-trade **로컬** `master`(7977ed27 — origin 보다 37 뒤) | `d1eb96484d7b4565189ebaad78a9d206ebf20058` — **다름(로컬 ref 가 낡음)** |
| gh-trade `origin/master`(39774781) · 가동본 `84824b07` | `03fc8cbedcd8542e9febf2416fa8bd595aa5d9fd` — **같음** |
| gh-trade `dc8fb50a` · `worktree-phase-29-admin-users`(33531ebb) | `5a2ae08271b2e32cc4ce14af656d05c3a1bc1613` — `AdminCommandResp.code` 12 주석 한 줄만 다름(`//` 주석 · 생성 .ts/.cs 무변경) |

- 플랜이 지정한 명령 `git -C /Users/alex/repos/gh-trade rev-parse master:server/src/protocol/StockDMA.fbs` 의 문자 그대로 결과는 `d1eb9648…`(≠ 기대) → 플랜 규칙상 **「미병합 또는 변경 — sync --check 필요」** 로 기록한다. **원인은 로컬 `master` 가 origin 보다 37 커밋 뒤인 것**이고, 원격 추적 `origin/master` 와 가동본 `84824b07` 은 기대 blob 과 같다 → **가동 서버와 relay 사본의 와이어는 일치(재동기화 불필요로 판단 가능 — 메인 세션 판단).**
- 29-08 의 주석 한 줄 차이(5a2ae082)는 인박스 261007 노트에 따라 재동기화 **선택**이다(`sync-relay-schema.sh --check` → 신규/변경 0 · .fbs 사본만 갱신 예정). 빅뱅 창에는 필요 없다.
- 메인 세션이 원하면 확인(읽기만): `RELAY=/Users/alex/repos/gh-radar/relay /Users/alex/repos/gh-trade/server/scripts/sync-relay-schema.sh --check` (gh-trade 로컬 checkout 기준이므로 gh-trade 쪽 `git pull` 여부는 gh-trade 세션 몫).

## 배포 전 확인 (오케스트레이터 전달 사실 · Task 1 대조)

1. **gh-trade 서버** — 2026-10-06 ~23:40 KST 보고: `84824b07` KB120(23:37) · KYOBO119(23:39) 가동 · users.toml 3명씩 · 관찰자 정원 6 · admin 로그인 role 2 OK · 87 `USERS rev=1 count=3` · gh-trade master push 완료. → **위 원문 인용으로 확인됨.** KB121 · KYOBO127 은 범위 밖(시드 `enabled=false`).
2. **gh-trade dc8fb50a 미배포** → 위 판정대로 **미재배포 · 서버의 마지막 사용자 삭제 금지.**
3. **알려진 한계(29-20 · 29-21):** 교보 계좌만 가진 사용자는 hub 주 세션이 KB 세션(거부됨)이라 VI · 84 · 76/78 · 77 이 비어 보인다(계좌 · 상따 · 주문 · 83 은 정상). KB 세션만 지운 사용자도 같다. → 창 7단계 뒤 **교보 전용 DMA 유저 수(계수만 · id 출력 금지)** 를 확인한다(아래 7b). 0 이 아니면 그 사용자에게 알려진 한계로 안내하고 29-26 · 후속으로 넘긴다.
4. **원격 DB** — Phase 29 additive 4개(`20261006200000` ~ `20261006200300`) 이미 적용(29-07) · `app_users` admin 3(alex · ezmesya · e2e) / trader 2. 로컬 최신 마이그레이션도 `20261006200300` 이라 창 버전 `20261007200000` · `20261007200100` 이 그보다 크다(창 직전 `supabase migration list --linked` 로 원격 최신 재확인).
5. **29-12 역할 게이트**는 master push(29-26) 때 켜진다 — 그때부터 미허용(pending) 계정은 `/pending` 으로 간다. 29-25 창은 push 하지 않으므로 이 창에서는 webapp 변화 없음.
6. Playwright webServer 가 `NextFontGoogleFontFileReplacer` 반복으로 타임아웃 나면 `rm -rf webapp/.next` 후 재실행 — 이번 게이트 실행에서는 발생하지 않았다(149 passed).

## Task 3 명령 — 메인 세션 런북 (20:00 KST 이후 · 순서 고정 · 앞 단계 실패면 멈추고 롤백 판단)

공통 env(값 비출력): `export GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json CLOUDSDK_CORE_PROJECT=gh-radar` · 매 단계 전 `git status -sb`(동시 세션 — 남의 로컬 커밋이 끼면 멈춤). 배포 명령은 허용 규칙 접두사 그대로(`yes |` · 출력 파이프 금지).

1. **시각 · 이전 태그 기록**
   ```bash
   date                                   # 20:00 KST 이후여야 함
   cd /Users/alex/repos/gh-radar && git status -sb
   curl -s https://dma.jx1.io/healthz | jq -r .version     # → 이전 태그(05:18 KST 기준 c7b5b2c9) — SUMMARY 에 기록
   ```
2. **옛 relay 정지**(관찰만 중단 — 서버 상태 무변경 · 커서가 다음 부팅에 이어 받음)
   ```bash
   gcloud compute ssh radar-gw --zone asia-northeast3-a --tunnel-through-iap --command 'sudo docker stop gh-radar-relay'
   curl -s -o /dev/null -w '%{http_code}\n' https://dma.jx1.io/healthz   # 200 이 아니어야 함
   ```
3. **배포 창 SQL 투입 · 경로 지정 커밋(push 하지 않음)**
   ```bash
   supabase migration list --linked        # 원격 최신이 20261006200300 인지(더 큰 버전이 있으면 아래 버전을 그보다 크게)
   cp supabase/deploy-window/29/01_gateway_key_rename.sql supabase/migrations/20261007200000_gateway_key_rename.sql
   cp supabase/deploy-window/29/02_dma_visibility_v2.sql  supabase/migrations/20261007200100_dma_visibility_v2.sql
   git add supabase/migrations/20261007200000_gateway_key_rename.sql supabase/migrations/20261007200100_dma_visibility_v2.sql
   git commit -m "chore(29-25): 배포 창 — 키 개명 · 가시성 v2 마이그레이션 투입"
   ```
   (`tasks/lessons.md` 등 다른 변경은 스테이징하지 않는다. relay 이미지 태그는 이 커밋의 short SHA 가 된다.)
4. **[BLOCKING] 스키마 push · 검증**
   ```bash
   supabase db push --linked --yes
   supabase migration list --linked        # 20261007200000 · 20261007200100 이 Remote 열에 있어야 함
   # 커서 키 — 서비스롤 키는 변수에만(출력 금지 · SR 변수 주입은 사용자 `!` 실행 규칙 따름)
   curl -s "$SUPABASE_URL/rest/v1/dma_journal_cursor?select=gateway" -H "apikey: $SR" -H "Authorization: Bearer $SR" | jq -c '[.[].gateway] | unique'
   # 기대: ["KB120","KYOBO119"] — "KB" · "KYOBO" 가 있으면 멈춤(Pitfall 1 — 옛 relay 가 커서를 다시 만든 것)
   ```
   - `lock_timeout 5s` 로 실패하면 옛 relay 가 아직 쓰고 있다는 신호 → 2단계 재확인.
5. **비밀번호 이관(D-19)**
   ```bash
   pnpm --filter @gh-radar/relay exec tsx ../scripts/migrate-dma-users.ts           # dry-run (쓰지 않음)
   ```
   - 기대: `충돌 — 이관 안 함: 0` · `dma_users 새 행` = 옛 `dma_credentials` 의 고유 DMA id 수 · `app_users 연결` = 자격증명 주인 이메일 수(기존 행 dma_user_id NULL 일 때만). 정확한 기대 계수는 원격 계수 조회가 Secret 을 요하므로 Task 1 에서 미측정 — 메인 세션이 dry-run 직전 계수만 확인: `curl -s -o /dev/null -D - "$SUPABASE_URL/rest/v1/dma_credentials?select=user_id" -H "apikey: $SR" -H "Authorization: Bearer $SR" -H 'Prefer: count=exact' -H 'Range: 0-0' | grep -i content-range`.
   - 충돌 0 이면:
   ```bash
   pnpm --filter @gh-radar/relay exec tsx ../scripts/migrate-dma-users.ts --apply   # 재조회 라운드트립 포함 · 실패 시 exit 1
   ```
   - `PASSWORD_MISMATCH` · `DECRYPT` · `ROUNDTRIP` 충돌(skipped)이 있으면 마스킹 id(`tr***(5)`) 그대로 SUMMARY 에 남기고 사용자 판단 — 이관 안 된 사용자는 unauthorized 로 남고 Admin 에서 다시 연결 가능. `IDENTITY_MISMATCH` · `LINK_MISMATCH` · `EMAIL_MISSING` 은 경고(이관함).
6. **새 relay(전환 1회)**
   ```bash
   GCP_PROJECT_ID=gh-radar SUPABASE_URL=<운영 URL> NOTIFICATION_CHANNEL_ID=<지난 relay 배포와 같은 채널> bash scripts/deploy-relay.sh --registry-cutover
   ```
   - 2단계에서 옛 relay 가 정지돼 실행 중 값 조회가 비므로 전환 잠금은 이 플래그로만 열린다(self-test 「값 없음 + --registry-cutover → allow」). 플래그 없이 돌리면 빌드 전에 거부되는 것이 정상.
   ```bash
   curl -s https://dma.jx1.io/healthz | jq '{status, version, journal: .journal.state, brokers, adminConns, journalGateways}'
   curl -s https://dma.jx1.io/healthz | jq -e '.brokers.KB.server == "KB120" and .brokers.KYOBO.server == "KYOBO119" and .adminConns.KB120.state == "ready" and .adminConns.KYOBO119.state == "ready"'
   bash scripts/smoke-relay.sh
   ```
   - healthz 기대: `version` = 3단계 커밋 short SHA · `brokers.KB.server = "KB120"` · `brokers.KYOBO.server = "KYOBO119"` · `adminConns.KB120.state = "ready"` · `adminConns.KYOBO119.state = "ready"`(usersRev 1).
   - smoke 기대: ~~PASS 13 · FAIL 0 · SKIP 1~~ (초안 오산 — 아래 Deviations) → 정정: Supabase env 없이 돌리면 **PASS 11 · FAIL 0 · SKIP 2**(INV-9 토큰 없음 · INV-10 env 없음), INV-5c 는 PASS 여야 한다. INV-5c 가 SKIP 이면 새 이미지가 아니라는 뜻 → 멈춤.
   - 배포 스크립트 요약 줄의 실행 중 `DMA_REGISTRY_SOURCE=db` · KYOBO 감시 JSONPath `$.brokers.KYOBO.alerting` 재키잉 확인.
7. **입양(87 계좌 → 의도)** — 새 relay 가 87 을 반영(`dma_server_user_accounts`)한 뒤. 서비스롤 키는 변수에만:
   ```bash
   curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/dma_admin_adopt_server_accounts" -H "apikey: $SR" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' -d '{"p_server":"KB120"}'
   curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/dma_admin_adopt_server_accounts" -H "apikey: $SR" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' -d '{"p_server":"KYOBO119"}'
   ```
   - 반환 = 들여온 (계좌, 서버) 행 수. 두 번째 같은 호출은 0(멱등). 반영 전에 부르면 0 이 나온다 — 먼저 `admin_servers_raw` 로 스냅숏 존재 확인(29-07 smoke b 형식).
   - **7b. 교보 전용 DMA 유저 수(계수만):**
   ```bash
   curl -s "$SUPABASE_URL/rest/v1/dma_user_accounts?select=dma_user_id,broker" -H "apikey: $SR" -H "Authorization: Bearer $SR" | jq '[group_by(.dma_user_id)[] | select(all(.[]; .broker == "KYOBO"))] | length'
   ```
   0 이 아니면 알려진 한계(VI · 84 · 76/78 · 77 비어 보임) 안내 대상 수로 기록.
8. 막히면 → 아래 **롤백**.

결과 보고 항목: 1 이전 태그 · 3 커밋 해시 · 4 migration list · 커서 키 · 5 dry-run/apply 계수 · 충돌 수 · 6 healthz 발췌 · smoke PASS/FAIL/SKIP · 7 입양 계수 · 7b 교보 전용 수.

## 롤백 (새 relay 를 옛 이미지로 — README §레지스트리 배포 · 전환 잠금 · 롤백)

순서 고정 — 옛 relay 는 `KB` · `KYOBO` 커서를 읽으므로 역개명 없이 올리면 커서 없는 since 0 재생이 된다.

1. 새 relay 정지:
   ```bash
   gcloud compute ssh radar-gw --zone=asia-northeast3-a --tunnel-through-iap --command "sudo docker stop gh-radar-relay"
   ```
2. 역개명 + 옛 가시성 뷰 + `dma_credentials` 기본값 `'KB'`: `supabase/rollback/29-gateway-key-rename-revert.sql` 을 **Supabase SQL 편집기(서비스롤)** 에서 실행(마이그레이션 아님 — `supabase/migrations/` 로 옮기지 않는다). KB120 과 KB 커서가 둘 다 있으면 PK 충돌로 전체 실패(부분 적용 없음) — 어느 행을 살릴지 먼저 판단. 이 SQL 의 왕복은 Task 1 pgTAP(21/21)로 증명됨.
   - 3단계 마이그레이션 두 버전은 원격 `supabase_migrations.schema_migrations` 에 남는다 — 재전환 때는 새 버전 번호로 다시 투입하거나 `supabase migration repair --status reverted 20261007200000 20261007200100 --linked` 로 표시를 되돌린 뒤 재 push(메인 세션 판단).
3. 옛 이미지 재배포 — 두 호스트 **명시 필수**(주소 정본: README §현재 운영 상태 「`DMA_HOST` 실측 분류」 · §교보 SecuwaySSL 「도달 대상」 · 레지스트리 시드와 같음):
   ```bash
   GCP_PROJECT_ID=gh-radar SUPABASE_URL=<운영 URL> NOTIFICATION_CHANNEL_ID=<채널> DMA_HOST=10.41.1.120 DMA_KYOBO_HOST=10.16.207.119 bash scripts/deploy-relay.sh --rollback <1단계에서 기록한 이전 태그 — 05:18 KST 기준 c7b5b2c9>
   ```
   (`DMA_KYOBO_PORT` 미설정 = 9100 · `DMA_REGISTRY_SOURCE` 미주입 · 롤백은 전환 잠금 대상 아님.)
4. 확인:
   ```bash
   curl -s https://dma.jx1.io/healthz | jq '{version, journal: .journal.state, kyobo: .journalGateways.KYOBO.state}'   # 옛 버전 · brokers 없음
   bash scripts/smoke-relay.sh             # INV-5c 는 옛 이미지라 SKIP 이 정상 → Supabase env 없이 돌리면 기대 PASS 10 · FAIL 0 · SKIP 3(INV-5c · INV-9 · INV-10)
   ```
5. 비밀번호 이관(5단계)을 이미 `--apply` 했어도 옛 relay 는 `dma_credentials` 를 읽으므로 그대로 둔다(`dma_users` 행은 무해 — 역이관 불요). 의도 입양(7단계) 행도 옛 relay 무영향.
6. server(Cloud Run) 이전 리비전 · webapp revert 는 29-26 런북 순서(이 창은 push 하지 않으므로 webapp 은 그대로).
7. **되돌릴 수 없는 것(D-12 one-way):** 배포 뒤 Admin 이 서버 `users.toml` 에 쓴 변경.

## Task 1 실행 경계 기록

- 실행한 것: 자동 검증 4종 · gh-trade **읽기만**(`rev-parse` · `git show <ref>:<path>` · `git log` — fetch · checkout 없음) · 공개 healthz GET 1회 · `deploy-relay.sh --self-test`(오프라인).
- 실행하지 않은 것: `docker stop` · `supabase db push` · `supabase migration list --linked` · `deploy-relay.sh`(self-test 외) · `migrate-dma-users.ts`(dry-run 포함) · Secret 읽기 · `git push` · 커밋.

## Task 2 결정

- **선택: `go`** — 사용자가 AskUserQuestion 에 「지금 하자」 로 답함(2026-10-07 05:4x KST).
- 창 시각: 플랜의 「20:00 KST 이후」 대신 **장 시작 전**(08:00 KST 전 · 증권사 세션 07:00 전)에 실행 — Deviations 1.

## Task 3 창 실행 기록 (메인 세션 실행 · 결과 전달받아 기록)

| 단계 | 시각(KST) | 결과 |
|------|-----------|------|
| 1 시각 · 태그 | 05:49:38 | `master` ahead 91 · ` M tasks/lessons.md`(다른 세션) · **이전 relay 태그 `c7b5b2c9`**(healthz journal live · KYOBO live) |
| 준비 dry-run(개명 전) | — | 충돌 0 · 옛 자격증명 3행(DMA id 2) → `dma_users` 새 2 · `app_users` 연결 3 · 새 trader 0 |
| 3 SQL 커밋 | 05:50 | **`e2a12c34`** 「chore(29-25): 배포 창 — 키 개명 · 가시성 v2 마이그레이션 투입」 — `supabase/migrations/20261007200000_gateway_key_rename.sql` · `20261007200100_dma_visibility_v2.sql`. push 안 함 |
| 2 옛 relay 정지 | 06:00:31 | 메인 세션 명령이 자동 모드 분류기에 막혀 **사용자가 `! gcloud compute ssh radar-gw … 'sudo docker stop gh-radar-relay'` 로 직접 실행** → healthz **502** 확인 |
| 4 push | ~06:01 | `supabase db push --linked --yes` → 두 파일 Applying · Finished · `migration list` 에 `20261007200000` · `20261007200100` **Local = Remote** |
| 4 키 검증 | — | `dma_journal_cursor.gateway` = **`["KB120","KYOBO119"]`**(`KB` · `KYOBO` 없음 — Pitfall 1 통과) · `dma_gateway_identities` = `["KYOBO119"]` · `dma_credentials` = `["KB120"]` |
| 5 이관 | — | dry-run(개명 뒤) 동일 · 충돌 0 → `--apply`: 「결과: dma_users 2행 · app_users 3건 · 쓰기 실패 0 · 검증 실패 0 · ✓ 이관 완료 — 라운드트립 · 연결 재조회 일치」 |
| 6 새 relay | 06:01:22 | detached worktree `@e2a12c34` 에서 `bash scripts/deploy-relay.sh --registry-cutover`(GCP_PROJECT_ID · 운영 SUPABASE_URL · 기존 NOTIFICATION_CHANNEL_ID) **exit 0** → `relay:e2a12c34` · env 모양 registry · KYOBO 비밀 포함 · 주문 서버 KB=KB120 · KYOBO=KYOBO119 · uptime check · 알림 정책 · KYOBO 감시(`$.brokers.KYOBO.alerting`) 갱신 |
| 6 healthz | +20s | `version e2a12c34` · journal live · `journalGateways.KYOBO119` live · `brokers.KB.server=KB120` · `brokers.KYOBO.server=KYOBO119`(alerting false 둘) · `adminConns.KB120` ready rev 1 · `adminConns.KYOBO119` ready rev 1 · quote ready · 플랜 `jq -e` **true** |
| 6 smoke | — | **PASS 11 · FAIL 0 · SKIP 2** — INV-1~8 전부 PASS(신설 **INV-5c PASS**) · INV-9 SKIP(토큰 없음) · INV-10 SKIP(메인 세션이 Supabase env 미주입) |
| 7 입양 | — | `dma_admin_adopt_server_accounts` KB120 → **2** · KYOBO119 → **2** · 두 번째 호출 **0 · 0**(멱등) · `dma_server_snapshots` KB120 rev 1 · KYOBO119 rev 1 · `dma_users` 2행 |
| 7b 교보 전용 | — | **0명** → 29-20 · 29-21 hub primary 한계는 현재 운영 사용자에 해당 없음 |
| 롤백 | — | 사용 안 함 |

- **executor 재확인(읽기 전용 · 06:05 KST):** 플랜 Task 3 verify `curl -s https://dma.jx1.io/healthz | jq -e '.brokers.KB.server == "KB120" and .brokers.KYOBO.server == "KYOBO119" and .adminConns.KB120.state == "ready" and .adminConns.KYOBO119.state == "ready"'` → **`true`** · `status ok` · `version e2a12c34` · journal live.
- 관찰 공백: 옛 relay 정지(06:00:31) ~ 새 relay 기동(06:01:22 배포 시작 · +20s healthz) — 장 시작 전이라 주문 · 세션 영향 없음, 커서가 이어 받는다(journal live).
- 운영 보존: 교보119 · KB120 서버 상태(미체결 · 잔고 · 전략)는 건드리지 않았다. Admin 변경 명령은 아직 쓰지 않았다.

## Deviations from Plan

1. **창 시각 — 20:00 KST 이후 → 장 시작 전(05:49~06:02 KST).** 사용자 go(「지금 하자」). 장 시작 08:00 · 증권사 세션 07:00 전이라 「장 마감 뒤」 와 같은 무거래 조건이다. 메모리 project_market_hours_0800_2000 의 취지(장중 정지 금지)는 지켰다.
2. **옛 relay 정지는 사용자가 직접 실행.** 메인 세션의 `gcloud compute ssh … docker stop` 이 자동 모드 분류기에 막혀 사용자가 `!` 로 같은 명령을 돌렸다. 결과(502)는 메인 세션이 확인.
3. **smoke 기대값 정정.** Task 1 초안의 「PASS 13 · FAIL 0 · SKIP 1」 은 smoke 항목 총수(13)를 PASS 로 잘못 센 값이다. 메인 세션이 Supabase env 를 넣지 않아 INV-10 도 SKIP → 실측 **PASS 11 · SKIP 2 · FAIL 0** 이 정상. 롤백 기대도 같은 조건이면 PASS 10 · SKIP 3(INV-5c 추가 SKIP).
4. **relay 배포를 detached worktree @e2a12c34 에서** — 메인 트리의 다른 세션 미커밋 파일이 이미지에 섞이지 않게(메모리 feedback_concurrent_session_commit_race).

- **fbs blob 명령의 ref** — 플랜 명령(`master:`)은 gh-trade 로컬 `master` 가 origin 보다 37 커밋 뒤라 낡은 blob 을 낸다. 플랜 규칙대로 「미병합 또는 변경 — sync --check 필요」 로 적되, `origin/master` · 가동본 `84824b07` blob 을 함께 기록해 메인 세션 판단 근거로 남겼다(gh-trade 는 읽기만 — fetch · pull 하지 않음).
- **수용 기준 `git status --porcelain --untracked-files=no` 0줄** — 다른 세션의 ` M tasks/lessons.md` 1줄 때문에 문자 그대로는 미충족. 이 플랜 · Phase 29 변경 아님 · 창 커밋은 경로 지정이라 영향 없음.

## Self-Check: PASSED

- 파일: `supabase/migrations/20261007200000_gateway_key_rename.sql` · `20261007200100_dma_visibility_v2.sql`(deploy-window 원본과 바이트 동일 — `cmp`) · 이 SUMMARY 존재
- 커밋: `e2a12c34` HEAD 조상 · `git rev-list --count 0b02524b..e2a12c34` = 1
- 운영: 공개 healthz `jq -e` 판정 true(06:05 KST 재확인)
