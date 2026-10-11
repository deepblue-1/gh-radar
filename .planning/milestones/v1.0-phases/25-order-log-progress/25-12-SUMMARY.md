---
phase: 25-order-log-progress
plan: 12
subsystem: 배포 · relay · server · webapp
tags: [deploy, relay, cloud-run, vercel, flatbuffers, schema-sync, gate, merge]
status: complete

requires:
  - phase: 25-11
    provides: "원격 스키마 적용 확인 · 세 RPC anon 401"
provides:
  - "Phase 25 프로덕션 배포 — relay:6289e430 · server gh-radar-server-00053-cmm · webapp 6289e430 (2026-09-29 ~23:30~23:35 KST)"
  - "배포 준비 게이트 기록(생성물 대조 · build/test · pgTAP 3 · e2e) · 병합 뒤 재게이트 기록"
  - "롤백 대상 기록(relay 4c143596 · server gh-radar-server-00052-88h) · 롤백 방법"
  - "첫 거래일 UAT 체크리스트(2026-09-30 장중 · gh-trade 첫 실동작 알림 대기)"
affects: [quick-260929-vzy, gh-trade-phase-25]

# Actuals (#2632 · #3968) — commits 는 측정값. plan_head_before = 25-11 마감 커밋.
# rev-list --count b954f108..25ba301d = 28 (SUMMARY 작성 시점 · 이 마감 docs 커밋 2건 전) 의 내역:
#   이 플랜 1 (병합 커밋 6289e430 — 메인 세션 Task 3) + 병합으로 들어온 origin/master 20
#   + 동시 세션 quick-260929-vzy 7 (127c1028 · fb175921 · d261c8d0 · bf36a28f · eac3a60e · b8db4c3c · 25ba301d — 이 플랜 소관 아님 · 미배포)
# tokens 는 이 플랜이 실제로 쓴 파일(이 SUMMARY) chars/4 — 병합으로 들어온 master 변경은 제외.
actuals:
  tokens: 5404
  tasks: 3
  commits: 28
plan_head_before: b954f10872a56b7a7bbc2489e7004f7e7b1453d4

tech-stack:
  added: []
  patterns:
    - "배포 커밋 detached worktree 에서 relay 이미지 빌드(메인 트리 미커밋 · 동시 세션 커밋과 격리)"
    - "동시 세션 커밋이 브랜치 끝에 쌓여도 검증된 배포 커밋만 `git push origin <sha>:refs/heads/master` 로 밀기"

key-files:
  created:
    - .planning/phases/25-order-log-progress/25-12-SUMMARY.md
  modified: []

key-decisions:
  - "스키마 대조 · relay 이미지 빌드는 메인 작업 트리가 아니라 배포 커밋의 깨끗한 detached worktree 에서 — 메인 트리엔 동시 세션 미커밋 생성물이 있어 그대로 대면 「변경 예정 1」(실측)"
  - "병합 방식 = 병합 커밋(사용자 결정) — `git merge --no-ff -X ours origin/master` → 6289e430. master 20건 중 18건은 브랜치에 patch 동일본이 있어 충돌 hunk 는 브랜치 쪽, 5aa2dbbe 전체 반영 확인(`git apply --check -R` OK) · 97ec13d9 STATE 행은 손으로 보탬"
  - "gh-trade 실배포 1712001c 의 fbs blob(d0c2b383…)이 f08677d9 와 달랐지만 재생성하지 않고 5f49cfa5 생성물 그대로 relay 배포 — 차이는 SetLimitChaser 말미 선택 필드 post_buy_auto(vtable 132) 1개뿐이고 서버는 buy3_schema>=2 일 때만 읽으며 relay 는 1 을 보낸다(와이어 호환 · gh-trade 확인). 재생성은 quick-260929-vzy(127c1028) 몫"
  - "push 는 브랜치 끝이 아니라 배포·검증한 6289e430 만(`97ec13d9..6289e430` fast-forward) — 배포 중 동시 세션 vzy 커밋 7건이 위에 쌓였고 그것들은 미검증 · 미배포"
  - "DMA_HOST · DMA_KYOBO_HOST 미주입(실행 중 값 보존 로그 확인) · 비밀 값 · 주소 출력 없음"

patterns-established:
  - "배포 SUMMARY 는 새/직전 태그 · revision · smoke 수 · 라우트 상태 전후 · Vercel sha · 회신 시각을 한 표로"

requirements-completed: []

coverage:
  - id: D1
    description: "relay:6289e430 배포 — smoke-relay PASS 10 · FAIL 0 · SKIP 2 · healthz ok · journal.strategy 존재"
    verification:
      - kind: other
        ref: "bash scripts/smoke-relay.sh · GET /healthz (메인 세션 23:3x KST)"
        status: pass
    human_judgment: false
  - id: D2
    description: "server gh-radar-server-00053-cmm 배포 — smoke-server PASS 15 · 새 라우트 2 미인증 401(전 404)"
    verification:
      - kind: other
        ref: "deploy-server.sh 내장 smoke · curl /api/strategy-events · /api/orders/<uuid>/events"
        status: pass
    human_judgment: false
  - id: D3
    description: "webapp 6289e430 Vercel 프로덕션 Ready · alias 승격"
    verification:
      - kind: other
        ref: "Vercel deployment gh-radar-webapp-h63g4g7e0 meta.githubCommitSha 6289e430 · /trading/order-log 307"
        status: pass
    human_judgment: false
  - id: D4
    description: "첫 거래일 UAT — 실주문 이벤트가 주문로그 · 펼침 · 배지 · 83 진행률에 보임"
    verification: []
    human_judgment: true
    rationale: "장 마감 뒤 배포라 실이벤트 0 — 2026-09-30 장중 gh-trade 첫 실동작 알림 뒤 로그인 세션에서 사람이 대조해야 함"

duration: 약 56분 (22:52~23:48 KST · 메인 세션 배포 창 포함)
completed: 2026-09-29
---

# Phase 25 Plan 12: 배포 Summary

**Phase 25(주문로그 · 전략 이벤트 · 83 진행률)를 병합 커밋 6289e430 하나로 relay(relay:6289e430) → server(gh-radar-server-00053-cmm) → webapp(Vercel 6289e430) 순서로 2026-09-29 23:30~23:35 KST 에 프로덕션 배포했다 — relay smoke FAIL 0 · healthz 에 journal.strategy 가동 · 새 조회 라우트 404→401 · Vercel Ready. 실이벤트 대조(UAT)는 2026-09-30 장중 gh-trade 첫 실동작 알림 대기.**

## Performance

- **Duration:** 약 56분 (executor Task 2 착수 22:52 KST → 마감 23:48 KST, 메인 세션 병합 · 배포 창 포함)
- **Tasks:** 3/3 (Task 1 · 2 executor, Task 3 메인 세션 — 사용자 승인)
- **이 플랜 코드 커밋:** 병합 커밋 `6289e430` 1건(메인 세션) · 생성물 재생성 커밋 없음
- **Files modified (이 플랜 직접):** 1 (이 SUMMARY) — 병합으로 들어온 master 변경 제외

## Accomplishments

- gh-trade 재기동(23:14 KST · 1712001c) 뒤 같은 저녁 안에 relay · server · webapp 을 고정 순서로 배포, 각 칸 검증 통과 뒤에만 다음 칸 진행
- origin/master 20건을 병합 커밋으로 흡수(크롬 color-mix oklab 수정 5aa2dbbe 보존) · 병합 트리 재게이트 green
- 롤백 대상(relay 4c143596 · server 00052-88h)을 배포 전에 적어 두고, 배포 커밋만 fast-forward push — 동시 세션의 미검증 커밋 7건은 프로덕션에 나가지 않음
- gh-trade 기획 세션에 배포 완료 회신(23:4x KST)

## Task 1 — 외부 선행 이벤트 기록

출처: **gh-trade 기획 세션 예고(오케스트레이터 경유 · 2026-09-29 ~23:00 KST) + 오케스트레이터 · executor 의 gh-trade 저장소 읽기 전용 대조.** 사용자 붙여넣기 원문이 아니다.

| 항목 | 값 | 대조 |
|---|---|---|
| ① 서버 재기동 | 전송 서버 KB 120 · 교보 127, **9/29 23시 KST 전후**(20:00 이후 조건 충족) | **재기동 완료 알림은 아직 대기 중**(executor 실행 시각 22:52~23:02 KST). 참고: 23:0x 공개 `/healthz` 는 relay `4c143596` · `journal.state` live · `lastAppliedAgeSec` 23676(장 마감 뒤 주문 없음) — 이것만으로 새 서버 가동 여부는 판정 불가 |
| ② 실서버 배포 커밋 | **`e5671649`** (2026-09-29 22:43:55 +0900) 「fix(limitchaser): 후매수 발동 무장의 「기존 잔고」 판정…」 | = Phase 25 전체(fbs 5f49cfa5 · 39/81/82/83 · 저널 strategy_events) + gh-trade master `a9042eeb` 까지. **quick-260929-ucy(`dcaa78b1`, post_buy_auto)는 미포함**(merge-base 확인) |
| ③ 트리 경로 | `/Users/alex/repos/gh-trade/.claude/worktrees/phase-25-order-log-progress` (branch `worktree-phase-25-order-log-progress`, locked) | executor 재확인: HEAD `e5671649` · `server/` 에서 `git log -1 --format=%h` = `e5671649` · 추적 변경 0 (미추적 `.planning/milestone.lock` 1개뿐) |
| ④ fbs blob | `git rev-parse e5671649:server/src/protocol/StockDMA.fbs` = **`f08677d98b3feeafbe984362cdbe3fbb0858c49c`** | 기대값과 **일치** → 재생성 불필요 |
| ⑤ 이벤트 범위 · 83 | Phase 25 전체 — 전략 이벤트 전 종류 + 83 `QueueProgress` 발신 | gh-trade 서버 범위 변경(`de8a21cf`): kind 4/5/7 은 **LimitChaser origin 주문만**(수동 · VI 는 전략 이벤트 0), 83 은 수동 · VI 대기 포함(group 0). 추가 수정 2건(매도 거부가 매수 접수 대기를 빼던 결함 · 후매수 무장 레이스) — 와이어 영향 없음 |
| 재기동 영향 예고 | 저널 epoch 유지 · 전략 저널 head 0 부터 새로 열림 · relay 관찰자 자동 재접속 예상 | — |
| 25-11 원격 적용 | 25-11-SUMMARY 에 세 RPC anon **HTTP 401** 기록 있음 · migration list 48행 Local=Remote | 충족 |

**플랜 전제 정정:** 플랜 must_haves 는 「gh-trade 가 지금 내는 전략 이벤트는 BuyOrder(3) 1종 · 나머지 · 83 은 웨이브 2~4 뒤」 라고 적었지만, 실제 배포 커밋 e5671649 는 **Phase 25 전체**(전 종류 + 83)를 싣는다. 첫 거래일 UAT 는 BuyOrder 에 한정하지 않고 전 종류 · 83 진행률까지 볼 수 있다(아래 UAT 체크리스트에 반영). 단 kind 4/5/7 은 상따 origin 주문에서만 나온다.

**마감 정정(Task 3 뒤):** 재기동은 23:14 KST 에 완료됐고, 실제로 뜬 빌드는 e5671649 가 아니라 **`1712001c`**(= e5671649 + quick-260929-ucy) — fbs blob `d0c2b383…` 로 위 ④ 와 다르다. 처리는 아래 편차 2.

## Task 2 — 배포 준비 게이트 (배포하지 않음)

### ① 생성물 대조 — blob 일치 · 재생성 없음

깨끗한 detached worktree(아래 경로 · HEAD `b954f108` · `git status --porcelain` 0줄)에 대고 실행:

```
cd /Users/alex/repos/gh-trade/.claude/worktrees/phase-25-order-log-progress/server
RELAY=<wt-p25-deploy>/relay ./scripts/sync-relay-schema.sh --check
```

```
[3/5] 가드 2: flatc 버전 확인
      flatc version 25.12.19
[4/5] 생성: flatc --ts (임시 디렉토리)
      생성 58 개 (.ts, stock-dma/ 포함)
[5/5] 대조: 반영하면 무엇이 바뀌는지만 보고 (gh-radar 파일 무변경)
      생성 .ts        : 58 개
      신규/변경 예정  : 0 개
      삭제 예정       : 없음
      .fbs 사본       : 최신 (마커 7줄 제외 본문 동일)
sync-relay-schema.sh OK: 가드 3종 통과 — gh-radar 파일은 건드리지 않았다 (--check)
EXIT=0
```

게이트 판정(exit 0 · 「신규/변경 예정 +: 0 개」 · 「.fbs 사본 +: 최신」) **PASS**. 재생성 · 커밋 없음(플랜 `files_modified` 의 `relay/src/generated/StockDMA.fbs` 는 조건부였고 조건 불성립).

참고(정보용 · 판정 아님): 같은 `--check` 를 **메인 작업 트리**(`RELAY=/Users/alex/repos/gh-radar/relay`)에 대면 「신규/변경 예정 : 1 개 · .fbs 사본 : 갱신 예정」 — 다른 세션의 미커밋 post_buy_auto 생성물 탓이다. 메인 트리로 relay 이미지를 빌드하면 안 되는 실측 근거.

### ② build · typecheck · 테스트 (메인 트리 · 플랜 체인 그대로)

`pnpm --filter @gh-radar/shared build && … relay typecheck && typecheck:tests && webapp typecheck && server typecheck && relay test && webapp test && server vitest && shared vitest` — **EXIT 0 · `error TS` 0건**

| 패키지 | Test Files | Tests |
|---|---|---|
| relay | 30 passed | **721 passed** |
| webapp | 136 passed | **3031 passed · 1 skipped** |
| server | 32 passed | **275 passed** |
| shared | 14 passed | **237 passed** |

메인 트리에는 다른 세션의 미커밋 생성물 2개(trailing optional 필드 추가)가 있으므로, **깨끗한 worktree 에서도** relay 를 따로 돌렸다: `pnpm install --frozen-lockfile --offline`(5.3s · 성공) → shared build · relay typecheck · typecheck:tests · relay test — **EXIT 0 · 30 files · 721 passed** · 실행 뒤 worktree `git status --porcelain` 0줄.

### pgTAP 3파일 (`scripts/verify-dma-orders-price-check.sh --test`)

| 파일 | 계획 | 결과 |
|---|---|---|
| `supabase/tests/dma_strategy_apply.test.sql` | 1..30 | RESULT: PASS |
| `supabase/tests/dma_strategy_read.test.sql` | 1..24 | RESULT: PASS |
| `supabase/tests/dma_journal_apply.test.sql` | 1..79 | RESULT: PASS |

합계 `ok` 133 · `not ok` 0 · EXIT 0.

### Playwright (dev 포트 3100 · webServer 자동 기동 · `.next` 캐시 문제 없음)

| 실행 | 결과 |
|---|---|
| `order-log` · `me` · `unfilled-progress` · `a11y` | **46 passed (1.9m)** · EXIT 0 (setup 포함) |
| `trading-workbench` `--grep-invert "5\. 격자\|P20-3 최악값\|종목 추가란 글꼴"` | **63 passed (2.6m)** · EXIT 0 (setup 포함) |

제외한 3건은 **기존 실패**(deferred-items.md 25-07 기록 — 카드 머리 종목명 넘침 2 · 종목 추가 입력 글꼴 1, 25-07 변경을 되돌린 기준선에서도 동일 실패)로 게이트 실패로 세지 않는다. 이번 실행에서 재실행하지 않았으므로 상태 변화 여부는 미확인.

### ③ 작업 트리 · 병합 상태

`git status --porcelain --untracked-files=no` (메인 트리):

```
 M .planning/state.json
 M relay/src/generated/StockDMA.fbs
 M relay/src/generated/stock-dma/set-limit-chaser.ts
```

→ **알려진 예외.** 뒤의 두 생성물은 다른 세션(gh-trade-dd · quick-260929-ucy · post_buy_auto 재생성) 소유의 미커밋 변경이고, `state.json` 도 이 플랜 소관 아님. executor 는 셋 다 건드리지 않았다. relay 이미지는 committed HEAD 의 detached worktree 에서 빌드하므로 **배포에 실리지 않는다**. (플랜 acceptance 「0줄」 은 메인 트리 기준으로는 미충족 — 배포 트리 기준으로 충족.)

미추적: `.planning/milestone.lock` · `.planning/quick/260928-cs1-toast-top-right/shots/` · `.planning/research/.cache/` — 손대지 않음.

브랜치 `gsd/phase-24-limitchaser-buy3` · origin 대비 ahead 82(원격 브랜치 미push 분).

**master 병합 필요: 예** — `git rev-list --left-right --count origin/master...HEAD` = **20 115** (fetch 뒤 · merge-base `832af127`).

`git log --format='%h %an %s' HEAD..origin/master` (master 에만 있는 20건 · 전부 deepblue-1):

| 커밋 | 제목 | 브랜치에 patch 동일본? (`git cherry`) |
|---|---|---|
| `97ec13d9` | docs: STATE — 크롬 color-mix 분홍 끼 fast 기록 | **없음** |
| `5aa2dbbe` | fix: 크롬에서 무채색이 분홍으로 뜨는 문제 — color-mix 를 oklch → oklab 으로 일괄 전환 (webapp 37파일) | **없음** |
| `bb93f9e6` · `d9f4f101` · `cd64222d` · `cf1df002` · `2b902f81` · `66ec97af` | quick-260929-c8e (relay 관찰자 다중 업스트림 · deploy-relay.sh KYOBO env) | 있음 |
| `31cc5cc1` · `8a210166` | 오늘 주문 종목명 폴백 | 있음 |
| `46b09a99` · `a3231159` · `d13fcbaa` · `90d9dea3` | VI 설정 · 상따 카드 다른 단말 고지 제거 | 있음 |
| `0b8a35e4` | quick-260928-ei9 교보 .127 개통 마감 | 있음 |
| `72ec85d0` · `defe2ea3` · `ee80cddd` · `70cd9f0d` | quick-260929-akj R3-WR-01/02 | 있음 |
| `352fc2b8` | docs(24) R3 재리뷰 | 있음 |

→ 실질 미반영은 **`5aa2dbbe`(webapp 색) · `97ec13d9`(docs)** 2건. relay · server 소스에는 master 쪽 미반영 변경이 없다. `git merge-tree --write-tree HEAD origin/master` 시험 결과 충돌은 **`.planning/STATE.md` 1파일**뿐(나머지 자동 병합). 병합하지 않고 `HEAD:master` 를 밀면 non-fast-forward 라 거부되고, 강제하면 5aa2dbbe 크롬 색 수정이 프로덕션에서 되돌려진다 — **병합 방식(병합 커밋 · 리베이스 · `/gsd-ship`)은 메인 세션이 사용자와 정한다.** executor 는 병합하지 않았다.

`git log origin/master..HEAD` 115건 중 Phase 25(`(25-NN)` · `(phase-25)`) 77건. **이 phase 밖이면서 master 에 patch 동일본이 없는(= 이번 push 로 처음 프로덕션에 나가는) 커밋:**

| 커밋 | 내용 | 배포 영향 |
|---|---|---|
| `8c785483` · `0dbfc860` · `a5f6ff4d` | quick-260929-sar KYOBO 관찰자 끊김 알림 — deploy-relay.sh 모니터링 동기화 · 문서 | relay 배포 스크립트 동작(이미 라이브 반영됨 — `--alert-only`) |
| `5e5fbdfe` · **`9cfc746f`** · `76764b87` · **`5cfacb83`** · `f3eab932` · `aeba8847` · `48d014c9` | quick-260929-sas 게이트웨이 인지 가시성 | **relay 코드 `9cfc746f` · `5cfacb83` 가 이번 relay 배포에 동반된다**(sas 가 의도적으로 Phase 25 배포에 실음 · 마이그레이션 20260929190000 은 원격 적용 완료) |
| `307cc4dd` · `0061d51f` · `866d66e2` | quick-260929-htw 24 R3-G1 자동 체크 서버 에코 대조 | **webapp 에 나감** |
| `d07ad591` · `c8daa53f` · `ef5c6967` | quick-260929-k7u 24 R5 후속 자동 체크 사유 | **webapp 에 나감** |
| `06418f9d` · `13662017` · `b6a9f486` | docs(24) 재검증 · 재리뷰 | 없음 |

(나머지 비-Phase-25 커밋 — `b2e6d5c3` · akj 4 · `fb7c9b0f` · 카드/VI 4 · c8e 6 · 종목명 2 · `952dfe86` · `111a8a87` — 은 master 커밋의 cherry-pick 이라 이미 프로덕션에 있다. `4c143596` 은 현재 라이브 relay 태그이며 HEAD 의 조상.)

### 라이브 현황 — 배포 전 (읽기 전용 조회 · executor 23:0x KST)

| 대상 | 현재 |
|---|---|
| relay 공개 `/healthz` | `status:"ok"` · `dma:true` · `version:"4c143596"` · `stalledCount:0` · `journal.state:"live"` · `journalGateways.KYOBO.alerting:false` · **`journal.strategy` 없음**(Phase 25 이전 이미지 — 배포 뒤 생겨야 함) |
| server Cloud Run | revision **`gh-radar-server-00052-88h`** · image `server:43d4d0c` (2026-09-25) · `GET /api/strategy-events` 현재 **404**(배포 뒤 401 이어야 함) |
| relay 이미지 변경분 `4c143596..HEAD` (relay/ · shared/) | Phase 25 8건(25-01 · 25-02 · 25-06) + sas 4건(`5e5fbdfe` · `9cfc746f` · `76764b87` · `5cfacb83`) |
| server 이미지 변경분 `43d4d0c..HEAD` (server/ · shared/) | 4건 — 전부 25-03(두 조회 라우트 · shared 타임라인 계약) |

### 배포 트리 (detached worktree — 메인 세션 재사용용)

`/private/tmp/claude-501/-Users-alex-repos-gh-radar/8e295819-e60c-4bea-b43d-3ebcb7751a44/scratchpad/wt-p25-deploy` — detached `b954f108` · `node_modules` 설치 · `packages/shared` 빌드됨 · `git status --porcelain` 0줄. (`.dockerignore` 가 node_modules · .env 를 빌드 컨텍스트에서 뺀다.) master 병합으로 배포 커밋이 바뀌면 `git -C <wt> checkout --detach <병합 커밋>` 뒤 위 `--check` · relay test 를 다시 돌린다. 배포가 끝나면 `git worktree remove <wt>` 로 정리.

(Task 3 에서 메인 세션이 이 worktree 를 병합 커밋 6289e430 으로 옮겨 relay 이미지를 빌드했다 — 변경 0 · relay typecheck + 721 통과.)

## Task 3 — 배포 기록 (메인 세션 실행 · 사용자 승인)

사용자 결정(AskUserQuestion): 병합 방식 = **병합 커밋** · 배포 = **Claude 가 지금 실행**. executor 는 배포 · push · 원격 쓰기를 하나도 실행하지 않았다(아래 값은 메인 세션 결과 전달분).

### 배포 기록 표

| 단계 | 결과 |
|---|---|
| 0. gh-trade 서버 | 실배포 **`1712001c`** = e5671649 + quick-260929-ucy · 23:14 KST 재기동(KB 120 / 교보 127) · client 1712001 23:15 · fbs blob `d0c2b38364c449fa381dc64c4da0bb97292051ab`(f08677d9 대비 SetLimitChaser 말미 `post_buy_auto: bool` vtable 132 + 주석만 차이) |
| 1. 병합 | `git merge --no-ff -X ours origin/master` → **`6289e430`**(amend 로 97ec13d9 의 STATE 행 38 손 반영). dry run 충돌 16파일 · master 20건 중 18건 브랜치에 patch 동일본(`git cherry`) → 충돌 hunk 는 브랜치 쪽. **5aa2dbbe 전체 반영 확인**(`git show 5aa2dbbe \| git apply --check -R` OK) |
| 2. 병합 뒤 게이트(6289e430) | build + typecheck(shared · relay · relay tests · webapp · server) exit 0 · vitest relay **721** · webapp **3031**(+1 skip) · server **275** · shared **237** 전부 통과 · Playwright order-log + me + unfilled-progress + a11y **46 passed** · trading-workbench(기존 실패 3건 제외) **63 passed**. 배포 worktree 를 6289e430 으로 이동 — 변경 0 · relay typecheck + 721 통과 |
| 3. 스키마 대조 | 배포 worktree 대상 `sync-relay-schema.sh --check`(gh-trade phase-25 worktree · 현재 c55e0e34) → 「변경 예정 1 · .fbs 갱신 예정」 — 정확히 post_buy_auto 1필드. **재생성하지 않고 5f49cfa5 생성물 그대로 배포**(편차 1 참고) |
| 4. 롤백 대상(배포 전 기록) | relay **`4c143596`** · server **`gh-radar-server-00052-88h`**(image server:43d4d0c) |
| 5. relay 배포 | detached worktree @6289e430 에서 `deploy-relay.sh`(SUPABASE_URL · NOTIFICATION_CHANNEL_ID 는 라이브 값 · **DMA_HOST / DMA_KYOBO_HOST 미주입**) → 로그 두 항목 모두 「실행 중 컨테이너 보존 · 이번 배포로 바뀌지 않는다」 · 「바뀝니다」 경고 없음. 새 이미지 **`relay:6289e430`** · KYOBO 감시 켜짐 · ~23:30 KST |
| 6. relay smoke · healthz | `smoke-relay.sh` **PASS 10 · FAIL 0 · SKIP 2**(INV-9 SMOKE_AUTH_TOKEN 미설정 — 정상 · INV-10 로컬 셸에서 Supabase 자격 미해석 — 로컬 env 한정). `/healthz`: `status:"ok"` · `version:"6289e430"` · `dma:true` · `vpn:true` · `stalledCount:0` · `journal.state:"live"` · **`journal.strategy`** `{lastSeq:null, headSeq:0, lagSeq:null, dbError:false, queueDepth:0}` · `journalGateways.KYOBO.alerting:false` |
| 7. server 배포 | 1차 시도: 스크립트 env 가드에서 중단(로컬 추출 버그로 SUPABASE_URL 빈 값 — **아무것도 배포되지 않음**). 2차: 라이브 SUPABASE_URL · CORS_ALLOWED_ORIGINS 로 `deploy-server.sh` → smoke **PASS 15 · FAIL 0 · SKIP 0** · 새 revision **`gh-radar-server-00053-cmm`** |
| 7'. 새 라우트 | `/api/strategy-events` · `/api/orders/00000000-0000-4000-8000-000000000000/events` → smoke 의 rate-limit 테스트 직후 429, 이어서 **401 / 401**(배포 전 404) — 라우트 생존 |
| 8. push | 배포 중 동시 세션이 6289e430 위에 127c1028 · fb175921(quick-260929-vzy · relay buy3_schema 2 포함)을 커밋 → **배포 커밋만** `git push origin 6289e430:refs/heads/master` → `97ec13d9..6289e430` fast-forward. vzy 커밋은 push · 배포 안 됨 |
| 9. Vercel | 프로덕션 배포 `gh-radar-webapp-h63g4g7e0` · 23:35:09 KST 생성 · **Ready** · `meta.githubCommitSha` 6289e430 · alias `gh-radar-webapp.vercel.app` 가 이 배포를 가리킴 · `/trading/order-log` → 307(인증 리다이렉트 · 라우트 존재) |
| 10. 운영 웹 확인(로그인 세션) | **미수행** — 로그인 필요 · 사용자 항목(아래) |
| 11. 새로고침 안내 | 메인 세션 최종 보고에서 사용자에게(열린 탭 + 앱 WebView) |
| 12. gh-trade 회신 | 23:4x KST gh-trade 기획 세션(phase25 기획서)에 전송 — relay 6289e430 · server 00053-cmm · webapp 6289e430 · 23:35 KST · 전략 스트림 live · post_buy_auto 는 아직 보내지 않음 명시 |

### 이 배포에 함께 실린 Phase 25 밖 변경

- relay: quick-260929-sas `9cfc746f` · `5cfacb83`(게이트웨이 인지 가시성)
- webapp: quick-260929-htw `307cc4dd` · `0061d51f` · quick-260929-k7u `d07ad591` · `c8daa53f` · master `5aa2dbbe`(크롬 color-mix oklab)
- **실리지 않은 것:** quick-260929-vzy 7커밋(127c1028 · fb175921 · d261c8d0 · bf36a28f · eac3a60e · b8db4c3c · 25ba301d) — 브랜치에만 있음 · 별도 검증 · 배포 필요

### 롤백 방법 (실행하지 않음 — 필요 시)

- relay: `GCP_PROJECT_ID=gh-radar SUPABASE_URL=<라이브 값> bash scripts/deploy-relay.sh --rollback 4c143596` → `bash scripts/smoke-relay.sh`. 단 4c143596 은 strategy 스트림이 없는 Phase 25 이전 이미지 — 웹의 주문로그 · 진행률은 비게 된다(옛 relay 는 80 말미를 무시 · 주문 저널은 정상).
- server: `gcloud run services update-traffic gh-radar-server --region=asia-northeast3 --to-revisions=gh-radar-server-00052-88h=100`(deploy-server.sh 에는 롤백 모드 없음).
- webapp: Vercel 대시보드에서 직전 프로덕션 배포로 promote(또는 revert 커밋 push).

## 첫 거래일 UAT 체크리스트 — 상태: 다음 거래일 — gh-trade 첫 실동작 알림 대기

장 마감 뒤 배포라 실이벤트 0(healthz `journal.strategy.headSeq 0`). 첫 거래일 **2026-09-30 장중**, gh-trade 가 첫 실이벤트를 알려 오면 로그인 세션에서 대조한다. 1712001c 가 Phase 25 전체를 싣으므로 한 번에 본다(kind 4/5/7 은 상따 origin 주문만).

| # | 항목 | 상태 |
|---|---|---|
| (a) | 상따 매수 1건 → 주문로그 탭 BuyOrder 줄(조건 · 근거 · 상한가 매수잔량 · 접수 +ms)이 게이트웨이 로그의 전송 시각 · 조건값과 일치 | 대기 |
| (b) | 그 주문 행 펼침이 통보 접수 · 체결 조각과 전략 줄을 같은 ms 규칙으로 보여 줌 | 대기 |
| (c) | 공용 패널 배지 · 카드 배지 · 창 분리 오늘 이어붙임 | 대기 |
| (d) | 대기 · 첫 체결 · 취소 · 매도 · 상한가 노출/진입 줄(상따 origin) | 대기 |
| (e) | 83 진행률 막대 갱신(수동 · VI 대기 포함 · group 0) · 단일가/VI 구간 정지 | 대기 |
| (f) | 수동 · VI 주문은 전략 이벤트 0 이 정상(서버 범위 `de8a21cf`) | 대기 |
| (g) | healthz `journal.strategy.lastSeq` 가 null → 값으로 · `lagSeq` 0 근처 · `dbError:false` | 대기 |

## 사용자 항목

1. **운영 웹 확인(로그인 세션):** 작업대 공용 패널 「주문로그」 탭 · 카드 「주문로그」/「전략로그」 탭 · `/trading/order-log` 창 · 마이페이지 오늘 주문 행 ▶ 펼침 · DevTools WS 에 인증 직후 `unf.progress` snap 1프레임(이벤트가 생기면 `journal.events`).
2. **새로고침:** 열린 브라우저 탭 · 앱 WebView 를 새로고침해야 6289e430 번들을 받는다.
3. **UAT:** 위 체크리스트 — 2026-09-30 장중 gh-trade 알림 뒤.
4. **정리(선택):** 배포 worktree `/private/tmp/claude-501/-Users-alex-repos-gh-radar/8e295819-e60c-4bea-b43d-3ebcb7751a44/scratchpad/wt-p25-deploy`(detached 6289e430) 는 롤백 · 재배포 대비로 남아 있다 — 필요 없으면 `git worktree remove`.
5. **vzy 후속:** quick-260929-vzy(post_buy_auto · buy3_schema 2 · 생성물 재생성 127c1028)는 이 배포에 없다 — 그 quick 에서 별도 게이트 · relay 배포 · push.

## Deviations from Plan

1. **[Rule 3 - Blocking · Task 2] 스키마 대조 대상을 메인 트리 → 깨끗한 detached worktree 로** — 메인 트리의 동시 세션 미커밋 생성물 때문에 플랜 명령 그대로는 「변경 예정 1」(실측). 플랜 원칙(「메인 체크아웃 작업 트리 그대로 relay 이미지를 빌드하지 않는다」)에 맞춰 committed 트리로 대조 · relay 테스트. 커밋 없음.
2. **[결정 · Task 3] fbs blob 불일치인데 재생성하지 않음** — 플랜 규칙은 「배포된 gh-trade 커밋 blob 이 f08677d9 와 다르면 스크립트로 재생성 · 커밋 · 전체 재테스트」. 실배포 1712001c 의 blob d0c2b383 은 SetLimitChaser **말미 선택 필드 `post_buy_auto: bool`(vtable 132) 추가만** 다르다. FlatBuffers 말미 필드 추가는 옛 생성 코드로 보내는 쪽에 안전(필드 부재 = 기본값)하고, gh-trade 서버는 `buy3_schema >= 2` 일 때만 읽으며 이 relay 는 1 을 보낸다 — **와이어 호환 · gh-trade 확인**. 재생성은 그 필드를 실제로 쓰는 quick-260929-vzy 의 몫(127c1028 로 이미 브랜치에 커밋 · 미배포)이라, Phase 25 배포에 섞으면 미검증 기능이 딸려 나간다. 따라서 5f49cfa5 생성물 그대로 배포. 영향: 없음(post_buy_auto 는 이 배포에서 항상 미전송).
3. **[정보 · Task 3] server 1차 배포 시도 중단** — 로컬 env 추출 버그로 SUPABASE_URL 이 빈 값이라 `deploy-server.sh` env 가드에서 멈춤. 아무것도 배포되지 않았고, 라이브 값으로 2차 시도가 통과.
4. **[결정 · Task 3] 브랜치 끝이 아니라 6289e430 만 push** — 배포 중 동시 세션이 vzy 커밋을 쌓아 브랜치 끝 ≠ 배포 커밋. 검증 · 배포한 커밋만 `6289e430:refs/heads/master` 로 fast-forward. 로컬 브랜치 `gsd/phase-24-limitchaser-buy3` 는 origin 대비 여전히 ahead(원격 브랜치 미push).
5. **[정보 · Task 3] smoke-relay INV-10 SKIP** — 로컬 셸에서 Supabase URL · 서비스롤 자격이 해석되지 않아 건너뜀(로컬 env 한정 · 원격 상태 문제 아님). INV-9 SKIP 은 정상(SMOKE_AUTH_TOKEN 미저장이 정상).
6. **[정보 · Task 2] 작업 트리 0줄 acceptance** — 메인 트리 기준 미충족(남의 미커밋), 배포 트리 기준 충족. 남의 파일은 건드리지 않았다.
7. **[정보 · Task 2/3] trading-workbench 기존 실패 3건 제외 실행** — deferred-items.md 25-07 기록 3건을 `--grep-invert` 로 뺐다(병합 뒤 재게이트에서도 동일).
8. **[정보 · Task 1] 플랜 전제(BuyOrder 1종) 정정** — 실배포본은 Phase 25 전체(전 종류 + 83). UAT 체크리스트 확장.

**Total deviations:** 8 (Rule 3 1 · 결정 2 · 정보 5). **Impact:** 배포 순서 · 게이트 · 롤백 기록은 플랜대로. blob 결정은 와이어 호환 근거와 gh-trade 확인이 있고, post_buy_auto 는 vzy 에서 자기 게이트로 나간다.

## Issues Encountered

- 병합 dry run 충돌 16파일 — 18/20 이 patch 동일본이라 `-X ours` 로 해소하고 5aa2dbbe 역적용 검사로 누락 없음 확인, 97ec13d9 는 손 반영.
- server 1차 시도 env 가드 중단(편차 3).
- 동시 세션 커밋 경합(편차 4) — 메모리 「동시 세션 커밋 경합」 규칙대로 push 직전 재확인 · 배포 커밋만 push.

## Self-Check: PASSED

- 커밋 존재(로컬 git): `6289e430` · `b954f108` · `5aa2dbbe` · `97ec13d9` · `9cfc746f` · `5cfacb83` · `307cc4dd` · `0061d51f` · `d07ad591` · `c8daa53f` · `4c143596` · vzy 7건 — 전부 FOUND
- `origin/master` = `6289e430`(push 반영 확인) · vzy `127c1028` 은 origin/master 조상 아님(미push 확인)
- gh-trade `1712001c` 존재 · `1712001c:server/src/protocol/StockDMA.fbs` blob = `d0c2b38364c449fa381dc64c4da0bb97292051ab`(전달값과 일치)
- 배포 worktree HEAD `6289e430` · `git status --porcelain` 0줄
- 이 SUMMARY 에 비밀 값 · IP 주소 없음(grep 확인)
- executor(이 마감 포함)는 배포 · smoke · push · Secret 쓰기 · VM 접속을 실행하지 않았다 — Task 3 값은 메인 세션 결과 전달분
