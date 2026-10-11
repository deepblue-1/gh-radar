---
phase: 19-account-order-journal
plan: 12
subsystem: deploy
tags: [deploy, relay, server, vercel, observer, journal, cutover, D-01, D-03, D-05, D-06, D-11, D-13, D-14, T-19-03, T-19-07, T-19-18, T-19-41, T-19-42]
status: complete

requires:
  - phase: 19-account-order-journal
    provides: "19-11 원격 DB 테이블 4 · 함수 7 · 관찰자 비밀 ENABLED 1 · gh-trade 0a50367a 게이트웨이 epoch 20260925-f337f3e7405b92de6546a147932cd879 · 롤백 태그 6b85c1e"
  - phase: 19-account-order-journal
    provides: "19-10 relay 관찰자 부팅 결선 · deploy-relay.sh 비밀 4종 · healthz journal 8키"
provides:
  - "프로덕션 relay 43d4d0c — 부팅 즉시 관찰자 로그인 · journal.state live · dma_account_access KB 3행"
  - "프로덕션 server gh-radar-server-00051-8gr (APP_VERSION 43d4d0c · GET /api/orders RPC 전환)"
  - "origin/master = 43d4d0c · Vercel 프로덕션 배포 Ready (alias trade.jx1.io)"
affects: [19-13]

actuals:
  tokens: 9000
  tasks: 3
  commits: 0
plan_head_before: 43d4d0c

tech-stack:
  added: []
  patterns:
    - "배포는 배포 커밋의 detached worktree 에서 — relay · server 둘 다(메인 작업 트리의 미추적 파일이 이미지에 섞이지 않게)"
    - "배포 전 기준선(DB 행 수 · dma_orders 최신 updated_at)을 먼저 찍고 배포 후 같은 쿼리로 대조"

key-files:
  created: []
  modified: []

key-decisions:
  - "20:00 KST 이후 조건을 사용자가 면제 — 2026-09-25 추석 연휴 휴장(relay 16:32 KST 배포)"
  - "매핑 행 수 대조는 게이트웨이 로그인 응답 accounts=3(게이트웨이가 users.toml 로 만든 값) = dma_account_access 3행 일치로 갈음"
  - "Task 2 사용자 결정 proceed — server 배포 후 push"
  - "알림 정책 documentation 크기 초과(10834 > 10240 바이트)는 이번 plan 에서 고치지 않고 후속 과제로"

requirements-completed: [D-01, D-03, D-05, D-06, D-11, D-13, D-14]

duration: 약 35분 (16:30 ~ 17:05 KST)
completed: 2026-09-25
---

# Phase 19 Plan 12: 전환 배포 창 ② — relay · server · webapp 배포 Summary

**D-14 순서의 나머지를 한 창에서 마쳤다. relay `43d4d0c` 는 부팅 즉시 게이트웨이에 관찰자로 로그인해 `journal.state` live 가 됐다. 계좌 매핑 3행도 기록했다. 사용자가 go(proceed)를 결정한 뒤 server 를 `gh-radar-server-00051-8gr` 로 배포했고, `git push`(`46e8bea..43d4d0c`)로 webapp 을 Vercel 프로덕션에 올렸다. 휴장이라 저널 레코드가 0건이다. 그래서 커서 행 · 이벤트 적재 · `dma_orders` 동결 실증은 첫 거래일(9/28) 19-13 으로 넘긴다.**

## Task 1: relay 배포 · 관찰자 프로덕션 검증

**배포 전 확인**
- `git status -sb` = `## master...origin/master [ahead 57]`
- `git log origin/master..HEAD --format='%an'` → 57 × deepblue-1. 다른 세션 커밋 없음.
- 라이브 relay 는 `6b85c1e` (롤백 태그).

**배포 전 기준선 (07:30Z, PostgREST · 서비스롤 키는 셸 변수로만)**

| 테이블 | 값 |
|---|---|
| `dma_journal_cursor` | `[]` |
| `dma_account_access` | 0 |
| `dma_journal_events` | 0 |
| `dma_account_orders` | 0 |
| `dma_orders` 최신 `updated_at` | `2026-09-23T10:51:35.03+00:00` |

**배포.** detached worktree(`<scratchpad>/relay-deploy` @ `43d4d0c`)에서 실행했다. DMA_HOST 는 주입하지 않았다.
```
GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://ivdbzxgaapbmrxreyuht.supabase.co NOTIFICATION_CHANNEL_ID=14409521670382124894 bash scripts/deploy-relay.sh
```
로그 핵심 줄 (DMA_HOST 값은 사내 주소라 가림):
```
✓ guard: config=gh-radar project=gh-radar
  현재 컨테이너 DMA_HOST=<가림> — 이번 배포로 바뀌지 않는다
✓ variables: mode=deploy SHA=43d4d0c TARGET=asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/relay:43d4d0c
  DMA_HOST 출처: 실행 중 컨테이너 보존 (배포 전 컨테이너 값=<가림>)
✓ Secret 4종 존재 + ENABLED 버전 + relay SA 접근권
✓ radar-gw 대상 방화벽 4규칙 (포트 80 규칙 없음)
✓ pushed: .../relay:43d4d0c
  [vm] 비밀 4종 획득 (값은 기록하지 않음)
  [vm] 컨테이너 기동: gh-radar-relay
  [vm] /healthz 200: {... "version":"43d4d0c", ... "journal":{"state":"live", ...}}
  [vm] free -m: total=969 used=462 available=507
  [vm] docker stats: 53.42MiB / 384MiB cpu=6.22%
✓ VM 배포 완료
✓ uptime check ready: gh-radar-relay-healthz → https://dma.jx1.io/healthz
ERROR: (gcloud.alpha.monitoring.policies.update) INVALID_ARGUMENT: Field alert_policy.documentation.content ... exceeds a maximum size of 10240 bytes with a value of 10834
```
컨테이너는 07:32:15Z 에 기동했고 restarts 는 0 이다. 스크립트는 알림 정책 단계에서 exit 1 로 끝났다(아래 편차 3).

**DMA_HOST: 보존됨.** 스크립트는 「실행 중 컨테이너 보존」으로 판정했다. 배포 뒤 `docker inspect` 로 되읽은 값도 배포 전 실게이트웨이 값과 같다. 되읽은 env 중 비밀이 아닌 것만 적는다: `NODE_ENV=production` · `APP_VERSION=43d4d0c` · `SUPABASE_URL=https://ivdbzxgaapbmrxreyuht.supabase.co` · `DMA_BROKER=KB` · 이미지 `relay:43d4d0c`.

**healthz 원문** (공개. 07:33:09Z 와 07:37:38Z 두 번 같고, 오케스트레이터가 Task 3 뒤에 다시 봤을 때도 같다)
```
{"status":"ok","vpn":true,"dma":true,"version":"43d4d0c","sessionCount":1,"everReadyCount":1,"stalledCount":0,"journal":{"state":"live","lastSeq":null,"headSeq":0,"lagSeq":null,"disconnectedSec":null,"lastAppliedAgeSec":null,"seqRegressions":0,"lastSeqRegressionAgeSec":null}}
```
- 플랜 자동 검증 두 개는 모두 exit 0 이다. 출력은 `journal.state=live` 와 `no-identifier-keys`.
- 첫 확인부터 live 여서 재확인할 필요가 없었다.

**relay 로그 `[JOURNAL]`/`[journal]`** (`docker logs --since 15m`, 계좌 원문 없음)
```
07:32:16.564Z INFO [journal] 커서 없음 — 처음부터 받는다
07:32:16.572Z INFO [JOURNAL] 관찰자 상태 전이 {"gateway":"KB","from":"connecting","to":"logging_in"}
07:32:16.573Z INFO [JOURNAL] 관찰자 로그인 요청 {"gateway":"KB","sinceSeq":0,"epoch":""}
07:32:16.638Z INFO [journal] 계좌 매핑 교체 {"rows":3,"users":3}
07:32:16.640Z INFO [journal] epoch 시작 {"to":"20260925-f337f3e7405b92de6546a147932cd879"}
07:32:16.640Z INFO [JOURNAL] 관찰자 로그인 성공 {"gateway":"KB","epoch":"20260925-f337f3e7405b92de6546a147932cd879","headSeq":0,"oldestSeq":0,"resync":false,"accounts":3}
07:32:16.641Z INFO [JOURNAL] 관찰자 상태 전이 {"gateway":"KB","from":"logging_in","to":"live"}
```
epoch 는 19-11 에 기록한 게이트웨이 epoch 와 같다. resync · seq 역행 · error 는 없었다.

**배포 후 DB (07:35Z)**

| 항목 | 값 | 판정 |
|---|---|---|
| `dma_journal_cursor?gateway=eq.KB` | `[]` | 예상한 상태 — 커서는 `dma_journal_apply` 가 이벤트를 적용할 때만 upsert 되는데, head=0 이라 적용이 없었다. **커서 1행 확인은 19-13 으로 넘긴다** |
| `dma_account_access?gateway=eq.KB` | **3행** (dma_user_id 3종 · account_no 2종 · synced_at 07:32:16Z) | 게이트웨이 로그인 응답 `accounts=3`(게이트웨이가 users.toml 로 만든 값)과 같다. users.toml 대조는 이것으로 갈음했다(사용자 결정) |
| `dma_journal_events` | 0 | 휴장이라 레코드 0 |
| `apply_error` 가 not null 인 행 | **0** | 통과 |
| `dma_account_orders` | 0 | 예상한 상태 |
| `dma_orders` 최신 `updated_at` | `2026-09-23T10:51:35.03+00:00` (배포 전과 같음) | 배포 시각보다 이전이므로 동결은 시작됐다. 휴장이라 쓰기가 없는 게 당연해서 실증은 19-13 |

**smoke-relay**
- 기본 실행: PASS 10 · FAIL 0 · SKIP 2.
- Supabase env 를 넣어 다시 실행: **PASS 11 · FAIL 0 · SKIP 2**.
  - PASS: INV-1~8 · INV-10a.
  - SKIP: INV-9 (`SMOKE_AUTH_TOKEN` 미설정) · INV-10b (anon 키 미해석).

**worktree:** `git worktree remove` 로 지웠고, `git worktree list` 에 relay-deploy 는 없다.

## Task 2: 사용자 결정

- 결정은 **proceed** 다. 사용자가 오케스트레이터 세션에서 직접 골랐다.
- 매핑 3행은 게이트웨이 `accounts=3` 과 일치하는 것으로 대조를 갈음했다.

## Task 3: server 배포 → push → Vercel 확인 · 공유 계정 대조

**server**
- executor 의 첫 시도는 분류기가 거부했다(편차 2). 사용자가 「니가 배포해」로 명시 지시한 뒤 오케스트레이터가 실행했다.
- detached worktree(`<scratchpad>/server-deploy` @ `43d4d0c`)에서 `GCP_PROJECT_ID=gh-radar SUPABASE_URL=<라이브> CORS_ALLOWED_ORIGINS=<라이브> bash scripts/deploy-server.sh` → **exit 0**.
- 배포 전 확인: 라이브 env 이름(일반 10 + 비밀 7)이 스크립트의 `--set-env-vars` 10 · `--update-secrets` 7 과 정확히 같다. 전량 치환으로 빠지는 env 는 없다.
- 새 revision `gh-radar-server-00051-8gr` 이 트래픽 100% 를 받는다. **롤백 대상은 이전 `gh-radar-server-00050-c8r`**(APP_VERSION c9fcb35).
- 스크립트 로그: 「✓ env 항목 17개 (필수 17종 대조)」.
- 배포 뒤 describe: `APP_VERSION=43d4d0c` · `DISCUSSION_CLASSIFY_ENABLED=false` · CORS 값 배포 전과 같음.
- 스모크: **PASS 15 · FAIL 0 · SKIP 0**.

  | INV | 확인 내용 |
  |---|---|
  | 1 | health |
  | 2~5 | scanner / stocks |
  | 6 · 7 | CORS |
  | 8 | rate limit 429 |
  | 9 | X-Request-Id |
  | 10 | `POST /api/orders` 404 |
  | 11 | **`GET /api/orders` 미인증 401** |
  | 12a~d | env 잔존 점검 |
- worktree 는 지웠다.

**push**
- 직전 확인: `git status -sb` = ahead 57. 전부 deepblue-1 이고 다른 세션 커밋은 없다.
- `git push origin master` → `46e8bea..43d4d0c  master -> master`.
- 미추적·수정 파일(`.planning/state.json` · `milestone.lock` · `sketches/` · `tasks/gh-trade-observer-journal-g1-reply.md`)은 커밋하지 않았다.

**Vercel**
- ignoreCommand `scripts/vercel-ignore-build.sh` 가 직전 배포 이후 변경을 감지해 Production 빌드를 실행했다.
- 배포 `https://gh-radar-webapp-crzcx7bu3-alexs-projects-eabbefc0.vercel.app` ● **Ready** (1m). Aliases `https://trade.jx1.io`.
- `trade.jx1.io` 는 HTTP 307(로그인 리다이렉트)로, 정상이다.

**공유 계정 대조 (D-06 · D-03)**
- `dma_credentials` 3행을 `dma_user_id` 로 묶으면 2묶음이고, 그중 공유 묶음은 1개(사용자 2명)다.
- 각 사용자에게 `rpc/dma_journal_orders_for_user(p_trade_date=2026-09-25)` 를 불렀다. 사용자 id 는 앞 4자만 적는다.

| 묶음 | 크기 | 사용자 | 행 수 | id 집합 |
|---|---|---|---|---|
| 0 | 1 | 1993… | 0 | [] |
| 1 | 2 | 95e9… | 0 | [] |
| 1 | 2 | b1e2… | 0 | [] |

- 공유 묶음 안에서 id 집합이 같다. 둘 다 빈 집합이라 자명하게 같을 뿐이다 — **실데이터 대조는 19-13**.

**사용자 확인 항목 (미완)**
- 로그인한 브라우저(폰 · 데스크톱)에서 `/me` 「오늘 주문」 카드가 계좌별 묶음(B′)으로 뜨는지 확인한다. 휴장이라 빈 상태 문구가 정상이다.
- 오류 문구와 기록 지연 배지가 없는지 확인한다.
- 공유 계정 사용자들에게 같은 행이 보이는지 확인한다.
- 실데이터 확인은 첫 거래일(9/28) 19-13 에서 한다.

## Deviations from Plan

1. **[사용자 승인] precondition 「KST 20:00 이후」 면제** — 추석 연휴 휴장. relay 는 16:32 KST, server · push 는 그 뒤 17시 전후에 했다.
2. **[권한] executor 의 server 배포가 분류기 `[Production Deploy]` 에 거부됨.** 우회하지 않고 멈춰 보고했다. 사용자가 「니가 배포해」로 명시 지시한 뒤 오케스트레이터가 실행했다(두 번째 시도는 분류기를 통과했다). push 와 Vercel 확인도 오케스트레이터가 했다.
3. **[후속 과제] `deploy-relay.sh` 가 exit 1 로 끝남 — 알림 정책 documentation 크기 초과.**
   - 원인: 19-10 커밋 `f3cdb11` 이 `ops/alert-relay-down.yaml` 에 8번(관찰자) 항목 24줄을 추가해, documentation.content 가 10834바이트로 GCP 상한 10240바이트를 넘었다.
   - 이 단계는 컨테이너 교체와 uptime check 갱신 **뒤**에 돌아서 배포 자체는 완료됐다.
   - 라이브 정책 `gh-radar-relay-down` 은 이전 문서 그대로 유효하다. 이번 phase 에 바뀐 건 문서 줄뿐이라 조건은 같고, 그래서 smoke INV-8 도 PASS 다.
   - 부수 영향: exit 1 때문에 스크립트 마지막 요약(DMA_HOST 되읽기)이 출력되지 않았다. 수동 `docker inspect` 로 대신 확인했다.
   - **다음 relay 배포(deploy 모드)마다 재발한다.** rollback 모드는 이 단계 전에 끝나므로 영향이 없다.
   - 고치는 방향: documentation 을 10240바이트 아래로 줄이고, 8번 상세는 `docs/relay-operations.md` 링크로 옮긴다.
   - 이번 plan 은 저장소 변경이 없는 plan 이라 고치지 않았다.
4. **[이월] 첫 거래일에만 증명되는 항목은 19-13 으로 넘김** — 커서 1행 · 이벤트 적재와 `apply_error` 0 · `dma_orders` 동결 · 공유 계정 id 집합 실데이터 대조.

## Deferred Issues

- 알림 정책 documentation 크기 초과(편차 3). 다음 relay 배포 전에 quick 으로 고칠 것을 권한다.
- 19-13 실측 항목(편차 4).

## Self-Check: PASSED
