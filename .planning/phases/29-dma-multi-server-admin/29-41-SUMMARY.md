---
phase: 29-dma-multi-server-admin
plan: 41
subsystem: infra
tags: [deploy, gap-closure, regression, go-no-go, gh-trade-84, g-1, schema-push, runbook]
status: complete

requires:
  - phase: 29-27 ~ 29-40 · 29-42 · 29-43 · 29-44
    provides: "갭 클로징 코드 · 마이그레이션 2개(20261010200000 · 20261010200100) · gh-trade-84 ②(가)(나) 반영 테스트"
provides:
  - "갭 클로징 전량 회귀 기록(한 세션 · 순차) — 단위 4패키지 · pgTAP 10 · Playwright 전체 · deploy-relay self-test"
  - "gh-trade-84 ②(가)(나) 검증 근거 표 — 파일 · 케이스 이름 · 결과"
  - "go 결정(2026-10-11 ~03:30 KST) · 배포 창 결과 — 원격 마이그레이션 2개 · relay 5d4ea4a5 · server gh-radar-server-00060-gjj · push f45d11ce..5d4ea4a5 · Vercel Ready"
  - "롤백 기준값 — relay aecf0868(레지스트리 시대 · 커밋 체크아웃 정상 배포) · server gh-radar-server-00059-5cr"
affects: [29-verification, ADMIN-03, ADMIN-06, ADMIN-12]

actuals:
  tokens: 11500    # chars/4 over 이 SUMMARY(유일한 변경 파일 · 코드 변경 0)
  tasks: 3         # Task 1 executor · Task 2 사용자 go · Task 3 메인 세션 배포
  commits: 0       # MEASURED at SUMMARY write: git rev-list --count 5d4ea4a5..HEAD = 0 — 코드 커밋 없음(docs-only). 이 SUMMARY 커밋 · STATE 메타 커밋은 이 뒤
plan_head_before: 5d4ea4a5d285f1bf79d52fd84425cfa88692689e
plan_head_after: 5d4ea4a5d285f1bf79d52fd84425cfa88692689e   # SUMMARY 작성 시점 HEAD == origin/master(push 뒤)

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Task 1: 회귀는 한 세션 · 순차(verify 1 → 2 → 3 → 4) · vitest --maxWorkers=2 · playwright --workers=1"
  - "Task 1 런북: 롤백은 `deploy-relay.sh --rollback` 이 아니라 이전 태그 커밋 detached worktree 정상 배포 — 이전 태그가 레지스트리 시대 이미지라서(README §레지스트리 배포 · 전환 잠금 · 롤백 182-183행)"
  - "Task 2: go — 2026-10-11 ~03:30 KST 사용자 결정. (가)(나) 근거 표 전부 green · 빠진 항목 0. 51 OrderResp 계좌 필터 공백(29-35 D7)과 Phase 29 밖 커밋(quick-261011-0yb · julmaesu) 동반 push 를 사용자가 수용"
  - "Task 3: 지정 0 은 SQL 대신 relay healthz `accountOrderServers == null`(새 relay 가 지정 RPC 를 적재하고 비면 키 생략) + 새 열 기본값 false 로 확인 — CLI v2.75 에 `db query` 없음"
  - "Task 3: (가) 실서버 실증(지정 변경 → 옛 서버 끄기 → 재접속 → 66)은 KB121 또는 KYOBO127 을 켠 뒤로 미룸 — 이 창에는 두 번째 서버가 없다"

requirements-completed: [ADMIN-12, ADMIN-06, ADMIN-03]

coverage:
  - id: D1
    description: "갭 클로징 전량 회귀(한 세션 · 순차) — 단위 6179 통과 · pgTAP 10파일 477 단언 · Playwright 전체 · deploy-relay self-test"
    requirement: ADMIN-12
    verification:
      - kind: unit
        ref: "pnpm --filter shared|relay|server|webapp exec vitest run --maxWorkers=2 — 448 · 1403 · 496 · 3832(+1 skip) · 실패 0"
        status: pass
      - kind: integration
        ref: "scripts/verify-dma-orders-price-check.sh × 10 (dma_admin_create_guard 19 · dma_account_order_server 48 포함) → PGTAP_OK"
        status: pass
      - kind: e2e
        ref: "playwright test --workers=1 (전체) — 284 pass · 1 fail(trading-workbench.spec.ts:4403 P20-3 최악값 · Phase 29 밖 KNOWN-PRE-EXISTING) · 9 skip · 10 not run"
        status: fail
      - kind: e2e
        ref: "playwright test trading-workbench.spec.ts --workers=1 --grep-invert \"P20-3 최악값\" — 75 pass"
        status: pass
      - kind: other
        ref: "bash scripts/deploy-relay.sh --self-test — OK 8 cases"
        status: pass
    human_judgment: false
  - id: D2
    description: "gh-trade-84 ②(가) 5파일 · (나) 3케이스 검증 근거 — 전부 존재 · green (go 조건)"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "relay/tests/strategy-sweeper.test.ts · order-server-resync.test.ts · effective-owner-tracker.test.ts · hub-multi-session.test.ts#(나) 3 — --reporter=verbose 4파일 71 통과"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx (38) · webapp/src/components/admin/__tests__/server-card.test.tsx (8)"
        status: pass
    human_judgment: false
  - id: D3
    description: "[BLOCKING] Schema Push — 20261010200000 · 20261010200100 원격 적용(Local = Remote) · relay 보다 먼저"
    requirement: ADMIN-03
    verification:
      - kind: other
        ref: "supabase db push --linked --yes → supabase migration list --linked (2026-10-11 03:3x KST) — 두 버전 Local = Remote"
        status: pass
      - kind: other
        ref: "지정 행 0 — relay healthz accountOrderServers == null (SQL count 미실행 · 간접 확인)"
        status: pass
    human_judgment: false
  - id: D4
    description: "운영 고아 점검(supabase/ops/29-orphan-dma-users.sql) 결과 기록"
    requirement: ADMIN-03
    verification: []
    human_judgment: true
    rationale: "실행되지 않음 — 대시보드 SQL 편집기가 필요해 사용자에게 요청했으나 결과 보고 없음. 사람이 대시보드에서 실행해 0행 여부를 확인해야 한다"
  - id: D5
    description: "relay 5d4ea4a5 배포 — KB120 · KYOBO119 운영 보존(journal live · adminConns ready · accountOrderServers 키 없음)"
    requirement: ADMIN-12
    verification:
      - kind: other
        ref: "curl -s https://dma.jx1.io/healthz | jq -e '…KB120 … KYOBO119 … ready … .accountOrderServers == null' → true (03:3x KST 메인 세션 · 07:26 KST executor 재확인)"
        status: pass
      - kind: other
        ref: "bash scripts/smoke-relay.sh — PASS 11 · FAIL 0 · SKIP 2(INV-9 토큰 없음 · INV-10 서비스 키 없음)"
        status: pass
    human_judgment: false
  - id: D6
    description: "server gh-radar-server-00060-gjj 배포(100% 트래픽) — RELAY_ADMIN_TIMEOUT_MS 미설정(15s 기본) · 미인증 Admin 401"
    requirement: ADMIN-12
    verification:
      - kind: other
        ref: "scripts/deploy-server.sh → smoke-server PASS 15 · FAIL 0 (INV-12a · INV-12b · INV-8 포함)"
        status: pass
      - kind: other
        ref: "curl GET /api/admin/users 미인증 → 401 (03:39:19 KST · 직전 429 2회는 smoke 레이트리밋 탐침 여파)"
        status: pass
    human_judgment: false
  - id: D7
    description: "git push f45d11ce..5d4ea4a5(125 커밋) = webapp 프로덕션 — Vercel Ready · /login 200"
    requirement: ADMIN-12
    verification:
      - kind: other
        ref: "Vercel production deployment 03:40:12 KST ● Ready · alias https://gh-radar-webapp.vercel.app · /login 200"
        status: pass
    human_judgment: false
  - id: D8
    description: "운영 확인 — /admin/users(비모달 시트 · 주문 서버 세그먼트 · (가) 안내) · /admin/servers(기본 주문 서버 · 안내 · 끄지 못한 전략 줄 없음) · /trading(서버 꼬리표 · 칩 · 경고 줄 없음)"
    requirement: ADMIN-06
    verification:
      - kind: manual_procedural
        ref: "사용자 「잘돼」 (2026-10-11 ~03:55 KST) — 런북 6단계 목록 일괄 확인"
        status: pass
    human_judgment: true
    rationale: "시각 · 문구 · 터치 타깃 확인은 사람 판단. 사용자 답이 항목별이 아닌 일괄 「잘돼」 라 재검증에서 항목 단위 확인이 필요하면 다시 본다"
  - id: D9
    description: "29-VERIFICATION human_verification 1 — /pending 승인 대기 화면(미승인 계정 · 스캐너/뉴스/종목 경로 · 폰 390 · 데스크톱 · 승인 뒤 홈)"
    verification:
      - kind: manual_procedural
        ref: "사용자 「잘돼」 (2026-10-11 ~03:55 KST) — 런북 6단계 /pending 포함 일괄 확인"
        status: pass
    human_judgment: true
    rationale: "사용자 확인이 일괄 한마디라 폰 390 · 데스크톱 · 「승인 뒤 다음 이동 → 홈」 이 각각 따로 보고되지 않았다 — 재검증에서 이 항목을 닫을 때 사람이 항목별로 확인할지 판단"
  - id: D10
    description: "(가) 실서버 실증 — 계좌 지정 변경 → 옛 서버 활성 전략 끄기 → 1012 재접속 → 25 → 66 재동기 · 두 서버 동시 세션"
    requirement: ADMIN-06
    verification: []
    human_judgment: true
    rationale: "deferred — 지금 운영에는 고를 수 있는 두 번째 서버(KB121 · KYOBO127)가 꺼져 있어 실증 불가. 두 번째 서버를 켠 뒤 별도 운영 확인"

duration: 52min   # 활동 시간 — Task 1 20분 · Task 3 배포 창 03:33~03:55 KST 22분 · 마무리 10분 (벽시계 02:29~07:30 KST · 사람 대기 포함)
completed: 2026-10-11
---

# Phase 29 Plan 41: 갭 클로징 전량 회귀 · go/no-go((가)(나) 반영 확인) · 배포 창 Summary

**갭 클로징 전량 회귀(단위 6179 · pgTAP 477 단언 · e2e 284+75 · self-test 8 — 유일한 실패는 Phase 29 밖 기존 P20-3)와 gh-trade-84 ②(가) 5파일 · (나) 3케이스 근거가 전부 green 이라 사용자가 go 를 골랐고, 메인 세션이 마이그레이션 2개 원격 적용 → relay `5d4ea4a5`(KB120 · KYOBO119 보존 · `accountOrderServers` 키 없음 · smoke 11/0/2) → server `gh-radar-server-00060-gjj`(smoke 15/0 · Admin 401) → push `f45d11ce..5d4ea4a5`(Vercel Ready)를 순서대로 마쳤다 — 롤백 없음, 고아 점검은 미실행, (가) 실서버 실증은 두 번째 서버를 켠 뒤로 남는다**

## Performance

- **Started:** 2026-10-10T17:29:37Z (2026-10-11 02:29 KST) — Task 1
- **Task 1 completed:** 2026-10-10T17:49:20Z (02:49 KST)
- **Task 2 (go):** 2026-10-11 ~03:30 KST
- **Task 3 window:** 03:33 ~ 03:55 KST(운영 확인 「잘돼」 까지)
- **Finalized:** 2026-10-11 07:30 KST(healthz 재확인 07:26 KST)
- **Tasks:** 3/3
- **Files modified:** 0 코드 · 이 SUMMARY 1개(플랜 메타)

## Task 1 — 전량 회귀 (한 세션 · 순차)

실행 전 `ps aux | grep -E 'vitest|playwright'` = 0 (다른 세션 테스트 없음). HEAD `5d4ea4a5`(디스패치 시점과 같음).

### verify 1 — shared · relay

| 단계 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/shared build` | exit 0 |
| shared vitest `--maxWorkers=2` | **18 파일 · 448 통과** · 실패 0 · skip 0 |
| relay `typecheck` · `typecheck:tests` | exit 0 · `error TS` 0 |
| relay vitest `--maxWorkers=2` | **57 파일 · 1403 통과** · 실패 0 · skip 0 |

### verify 2 — server · webapp

| 단계 | 결과 |
|---|---|
| server `typecheck` | exit 0 |
| server vitest `--maxWorkers=2` | **39 파일 · 496 통과** · 실패 0 · skip 0 |
| webapp `typecheck`(tsc + e2e tsconfig) | exit 0 · `error TS` 0 |
| webapp vitest `--maxWorkers=2 --passWithNoTests` | **164 파일 · 3832 통과 · 1 skipped**(기존 skip — 29-25 와 같은 1건) · 실패 0 |

단위 합계: **278 파일 · 6179 통과 · 1 skipped · 실패 0.**

### verify 3 — pgTAP (`scripts/verify-dma-orders-price-check.sh`, 컨테이너 한 번에 하나)

| 파일 | 결과 |
|---|---|
| app_access | 30/30 PASS |
| dma_registry_intent | 83/83 PASS |
| dma_admin_intent | 69/69 PASS |
| dma_admin_reflect | 72/72 PASS |
| dma_journal_apply | 89/89 PASS |
| dma_strategy_read | 28/28 PASS |
| dma_visibility_v2 | 19/19 PASS |
| **dma_admin_create_guard** (신규 · 29-27 CR-01) | **19/19 PASS** |
| **dma_account_order_server** (신규 · 29-29 G-1) | **48/48 PASS** |
| gateway_key_rename(`--until 20261006200300 --with fixtures/29_pre_rename.sql --with migrations/20261007200000_gateway_key_rename.sql`) | 20/20 PASS |

pgTAP 합계 **10 파일 · 477 단언 · not ok 0** · 플랜 명령 원문 그대로 `PGTAP_OK` 출력.

### verify 4 — Playwright 전체 · deploy-relay self-test

| 단계 | 결과 |
|---|---|
| `shared build` → `playwright test --workers=1 --reporter=list`(전체 · 10.6분) | **284 passed · 1 failed · 9 skipped · 10 did not run** (총 304) · `NextFontGoogleFontFileReplacer` 타임아웃 없음(`.next` 정리 불요) |
| 실패 1건 | `trading-workbench.spec.ts:4403` **P20-3 최악값** — 「344 카드 · 수동 pane — 내용이 상자를 넘친 요소 `{ span, " · 위탁종합", over 17 }`」 → **KNOWN-PRE-EXISTING**(아래) |
| did not run 10건 | 같은 파일이 serial 모드라 P20-3 뒤 10건(280~289)이 돌지 않음 — 아래 재실행으로 덮음 |
| skipped 9건 | env 게이트 `test.skip(!HAS_SERVICE_KEY)` — `user-themes.spec.ts` 4 · `watchlist.spec.ts` 5(SUPABASE_SERVICE_ROLE_KEY 없음 · 종전과 같음) |
| `trading-workbench.spec.ts --workers=1 --grep-invert "P20-3 최악값"` 재실행(4.2분) | **75 passed** · 실패 0 — P20-3 뒤에 못 돈 10건 포함(29-39 · quick-261011-0yb 재실행 수치와 같다) |
| `bash scripts/deploy-relay.sh --self-test` | **self-test OK 8 cases**(kyobo_presence 4 · registry_cutover_gate 4) · FAIL 줄 없음 — 플랜 명령은 `&&` 라 Playwright 실패 뒤 안 돌아서 따로 실행 |

**Phase 29 이름 있는 케이스(전부 ✓):**
- `admin.spec.ts` **P29-A3b** 데스크톱 비모달 — 오버레이 없음 · 행 사이 이동 (1080) — 29-31 이 워크트리에서 못 돌린 것
- `admin.spec.ts` **P29-A3c** 터치 타깃 — 계좌 버튼 · 역할 세그먼트 높이 (390) · (1080) — 29-31
- `admin-servers.spec.ts` **P29-S1** 기본 주문 서버 즉시 전환 — 증권사 그룹 카드 · PUT 1건 · 칩 이동 (390) · (1080) — 29-31 · 29-38
- `admin.spec.ts` **P29-G1** 계좌 주문 서버 고르기 — PUT 1건 · 재조회 값 · 터치 타깃 (390) · (1080) — 29-38
- `access-gate.spec.ts` P29-G1 승인된 사용자는 /pending 에서 홈으로 (이름이 같은 다른 케이스 — 29-12 역할 게이트)

**P20-3 = KNOWN-PRE-EXISTING (Phase 29 범위 밖 · 고치지 않음):** 수동주문 pane 「주문계좌」 행의 상품명 span 이 344 카드에서 17px 넘친다. master 에서 Phase 29 와 무관하게 실패한다 — 다른 세션이 `.planning/quick/261011-0yb-gh-trade-261010-addbuy-auto-extra-buy-au/261011-0yb-SUMMARY.md` 87-91행에 기록(`rm -rf webapp/.next` 뒤에도 같은 실패 재현)했고 29-39 executor 도 재현했다(29-39-SUMMARY Issues). 이번 실행의 실패 메시지 · 수치(`over 17`)가 그 기록과 같다. 그 밖의 실패 0.

### verify 밖 확인 (읽기 전용)

- `supabase migration list --linked`(읽기 전용 · 02:3x KST): 원격 최신 `20261007200100` · **`20261010200000` · `20261010200100` 은 Local 만**(Remote 빈칸) — Task 3 2단계 push 대상이 정확히 이 둘이다.
- 공개 healthz(02:3x KST): `status ok` · **`version aecf0868`** · journal live · `brokers.KB.server = KB120` · `brokers.KYOBO.server = KYOBO119`(alerting false 둘) · `adminConns.KB120` · `KYOBO119` ready(usersRev 1) · `accountOrderServers` 없음(옛 이미지라 필드 자체가 없음).

## gh-trade-84 ②(가)(나) 검증 근거 표

근거: `grep -n "it(\|test(" <파일>` 로 케이스 이름을 뽑고, relay 3파일 + hub (나) 는 `--reporter=verbose` 로 따로 한 번 더 돌려 케이스별 ✓ 를 확인했다(4 파일 71 통과). webapp 2파일은 verify 2 전체 회귀의 파일 단위 ✓(workbench-status-bar 38 · server-card 8). **빠진 파일 · 케이스 0 · red 0 — 「근거 없음」 행 없음.**

### (가) 옛 서버에 남은 그 계좌의 활성 전략을 끈다 (gh-trade-84 ② 추가 확정 — 필수)

| 파일 (플랜) | 케이스 (실제 이름 요지) | 결과 |
|---|---|---|
| `relay/tests/strategy-sweeper.test.ts` (29-43) | ① 트레이서 — A 켜진 상따 2건 14(키별) · VI(KRX) 11 run:false · 두 거래소 재조회 0 → ok · B 무영향 | green |
| 〃 | ② **NXT 에만 켜진 VI** → 11 × 1(NXT) · ③ **두 거래소(KRX · NXT)** → 11 × 2 · ④ B 계좌 VI → 11 0건 | green |
| 〃 | ⑤ autoSellState 3 · 5스위치 false 도 14 대상 · ⑥ 세션 없던 사용자 LoginReq 1 · release 1 · ⑦ 0건 멱등 · ⑧ 두 계좌 · ⑨ 로그 마스킹 | green |
| 〃 | **재조회 확인** — ① · ⑦ · ⑮(14 를 받아도 안 내리는 서버 → remaining 2) | green |
| 〃 | **미확인 다섯 갈래** — ⑩ no-session · ⑪ not-ready · ⑫ ⑬ timeout(65 미수신 · 21(NXT) 무응답) · ⑮ remaining · ⑯ send-failed · ⑰ 전체 시한 20초 · ⑱ warn 1줄 · ⑭ 21 한 번에 하나 | green |
| 〃 | isActiveLimitChaser · StaleStrategyRegister 2건 | green |
| `relay/tests/order-server-resync.test.ts` (29-36) | ① 트레이서 — **끄기(24 · 21 · 21 · 14 · 재조회)가 dropUser · 1012 보다 먼저** · 재접속 → ready → **25 → 66** → A 주문 KB121 에만 | green |
| 〃 | ② 끄기 미확인(**timeout → staleStrategies** { KB120, 1 }) · ③ 소유자 없음 전이 · ④ **연달아 두 번 직렬**(앞 sweep 진행 중 세션 생존) | green |
| 〃 | ⑤ **자격증명 없음 → no-session**(null · not_ready · throw 3갈래, it.each) · ⑥ 기본 주문 서버 변경 · ⑦ 서명 같음 → 0 · ⑧ serverKey · movedFrom | green |
| 〃 (29-44) | ⑨ **연결 0 사용자 임시 세션** 트레이서 · ⑩ ⑪ ⑫ 연결 0 fail closed · ⑬ **로그인 백스톱** · ⑭ **60초 재시도** · ⑮ **되돌아오면 해제** · ⑯ 동시 1회 · ⑰ close 뒤 타이머 없음 | green |
| `relay/tests/effective-owner-tracker.test.ts` (29-44) | **트래커 diff** — 첫 refresh 0 · 지정 변경 move 1 · 재호출 0 / **소유자 없음 전이**(to undefined 도 move) / 기본 서버 변경 / 사라짐 · 새로 보임 move 아님 / ready 전 기준선 없음 / snapshotOf (6 케이스) | green |
| `webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx` (29-39) | 「끄기 미확인 경고 (29-39 · gh-trade-84 ②(가))」 4 케이스(문구 · 고른 계좌 기준 role status 닫기 없음 · count null · 다음 프레임에 없으면 사라짐) · 「되돌아옴 「클라 대사」 안내 (② 추가)」 3 케이스 · 필드 없는 계좌 줄 수 종전 · AccountPill 서버 꼬리표 3 · 옛 배지 없음 | green (파일 38) |
| `webapp/src/components/admin/__tests__/server-card.test.tsx` (29-38) | 「옛 주문 서버에 남은 전략 한 줄 (29-38 · staleAccounts)」 — staleAccounts 2 → 경고 한 줄 · 0/없음/상태 없음 → 없음 · 꺼진 서버에도 | green (파일 8) |

### (나) 83 item 단위 · 상태 키에 서버 · 64 서버별 합침

| 파일 | 케이스 (이름에 「(나)」) | 결과 |
|---|---|---|
| `relay/tests/hub-multi-session.test.ts` (29-35) | (나) 83 item 단위 — 섞인 83 에서 소유 항목만 (프레임을 버리지 않고 항목을 거른다) | green |
| 〃 | (나) 빈 83 — 다른 서버 몫 항목 유지 · unf.progress 합집합 | green |
| 〃 | (나) 64 서버별 합침 — 한 서버 교체가 다른 서버 몫을 지우지 않음 · lc.snap 합집합 | green |

**판정: (가) 5파일 · (나) 3케이스 전부 있음 · 전부 green.**

## Task 2 에 함께 올릴 알려진 사항 (go/no-go 판단 재료 — 근거 표의 결함은 아님)

1. **51 주문 통보는 계좌로 거를 수 없다 (29-35 coverage D7).** `OrderResp` 에 계좌 칸이 없어 relay 는 비소유 서버 세션의 51 을 그대로 통과시킨다. 원천 차단은 (가) 옛 서버 전략 끄기(29-43 · 29-36 · 29-44)다 — 끄기 전 구간 · 끄기 미확인 구간에는 옛 서버 체결 통보 토스트가 보일 수 있다. 근본 수정은 gh-trade 에 `OrderResp.account_no` 추가 요청인데, gh-trade-84 ④ 「와이어 변경 불필요」 와 부딪힌다 — 사용자 판단. 지금 운영은 지정 0 · 두 번째 서버(KB121 · KYOBO127) 꺼짐이라 이 공백이 실제로 생길 경로가 없다.
2. **server `RELAY_ADMIN_TIMEOUT_MS` (29-32) — 해소 확인.** 라이브 Cloud Run env 이름 목록(읽기 전용 describe · 이름만 · 02:4x KST)에 `RELAY_ADMIN_TIMEOUT_MS` 가 **없다**(19개 = `deploy-server.sh` 필수 19종과 같다). 새 server 는 코드 기본값 15s(`server/src/config.ts:113`)를 쓴다. `deploy-server.sh` 는 `--set-env-vars` 전량 치환이고 그 목록에도 이 키가 없어, 배포 뒤에도 생기지 않는다. 런북 4단계에서 배포 뒤 이름 목록을 한 번 더 본다. (`deploy-server.sh` 196행 주석 「미설정 = 12000ms」 는 29-32 이전 값이 남은 낡은 주석 — 동작 영향 없음, 이 플랜은 고치지 않음.)
3. **pino-http 접근 로그가 요청 URL 원문을 남긴다 (29-37 · deferred-items.md 32행).** Admin 라우트 경로의 계좌번호 · DMA id 가 server 로그에 실린다. 이 갭 클로징 이전부터 있던 모양이고 감사 줄은 마스킹된다. 이번 배포로 새로 생기는 노출은 29-37 의 `…/accounts/:broker/:accountNo/order-server` 경로 하나가 더해지는 것.
4. **29-40:** ADMIN-01~12 는 플랜 금지 조항대로 REQUIREMENTS 에 Pending 으로 등록됐다(재검증이 판정). `relay/src/quote/feed.ts:19` 주석의 관찰자 정원이 아직 4(deferred — 동작 영향 없음).
5. **부팅 결선 · 실 relay 재수립은 배포 뒤 사람 확인만 가능 (29-44 D9 · 29-37 D5 · 29-38 D5 · 29-39 D6).** index 결선(트래커 · 지정 첫 적재 뒤 기준선 · resync · 재시도 부팅)은 단위 테스트가 없고, 실서버 지정 → 끄기 → 재수립 → 66 실증은 두 번째 서버(KB121 또는 KYOBO127)가 켜진 뒤로 남는다. 이 창의 운영 확인은 「지정 0 · 경고 0 · healthz `accountOrderServers` 키 없음」 까지다.
6. **범위 밖 열린 인박스 `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md` (status open).** AdminAccount `order_ip`/`order_mac` · 86 code 13 — 스키마 생성물은 `relay/src/generated` 에 동기화됨(`d88ed4da`), relay 코덱 · Admin 계좌 편집 입력칸은 Phase 29 에서 구현하지 않았다. 후속 작업이며 블로커 아님. 참고: 노트에 따르면 op 3 에서 두 필드를 비워 보내면 서버가 「미설정」 으로 되돌린다 — gh-trade 가 서버에 order_ip/mac 을 직접 넣어 둔 계좌가 생기면, 코덱 반영 전의 relay(옛 · 새 모두)가 그 계좌에 op 3(계좌 설정 · 다시 반영)을 보낼 때 값이 지워진다. 이번 배포가 만드는 새 위험은 아니다(운영 relay `aecf0868` 도 같다).
7. **push 범위에 Phase 29 밖 커밋이 섞여 있다.** `origin/master..HEAD` = **125 커밋**(작성자 전부 `deepblue-1`). Phase 29 밖: quick-261011-0yb(추가매수 ☐자동 — relay `buy3_schema 5` · vtable 156 · 웹 폼) 커밋 5 + 인박스 처리(julmaesu 「추가매수」→「줄매수」 문구 · 261010-addbuy-auto · trade-inbox) + executor worktree 병합 커밋. 따라서 **relay 이미지(HEAD 빌드)와 push(webapp 프로덕션)에 이 변경도 함께 나간다.** quick-261011-0yb SUMMARY 의 배포 순서는 「gh-trade 서버 → relay → push」 이지만 「구서버는 vtable 156 을 무시할 뿐 깨지지 않는다」 — 즉 gh-trade 서버가 아직이어도 안전하고 ☐자동만 서버 배포 뒤 동작한다.
8. **시각:** Task 1 종료 **2026-10-11(일) 02:49 KST.** 10-10(토) 20:00 KST 이후이고, 오늘은 일요일이라 장이 없다 — 플랜의 「20:00 KST 이후」 조건을 이미 충족하는 무거래 창이다. 다음 장은 10-12(월) 08:00 KST(증권사 세션 07:00)이므로 그 전까지 아무 때나 창을 열 수 있다.

## Task 2 — go/no-go 결정

| 항목 | 값 |
|---|---|
| 선택 | **go — 지금 배포** |
| 결정 시각 | **2026-10-11(일) ~03:30 KST** (AskUserQuestion · 사용자 직접 선택) |
| (가)(나) 근거 표 판정 | **전부 green · 빠진 항목 0 · 「근거 없음」 행 0** — (가) 5파일 · (나) 3케이스 |
| 시각 조건 | 10-10(토) 20:00 KST 이후 · 일요일 무거래 창 · 다음 장 10-12(월) 08:00 KST — 충족 |
| 사용자가 수용한 알려진 사항 | ① 51 `OrderResp` 계좌 필터 공백(29-35 D7 — 위 알려진 사항 1) ② push 범위에 Phase 29 밖 커밋 동반(quick-261011-0yb · julmaesu 문구 · 인박스 — 위 알려진 사항 7) |

go 이므로 Task 3 을 실행했다.

## Task 3 — 배포 창 결과 (메인 세션 실행 · 2026-10-11 KST)

| 단계 | 결과 |
|---|---|
| **0. 시각 · 트리** | 03:33 `date`. 트리는 오케스트레이터 ` M .planning/state.json` + 이 SUMMARY 초안(untracked)만. `origin/master..HEAD` = **125 커밋**(Task 1 과 같음). detached 배포 worktree `/private/tmp/gh-radar-deploy-2941` @ `5d4ea4a5` · 더러운 파일 0 |
| **1. 이전 relay 태그** | **`aecf0868`** (journal live · KB120/KYOBO119 · adminConns ready) — 롤백 대상 |
| **2. Schema Push** | `supabase db push --linked --yes`(메인 repo · `supabase/` 깨끗) → `20261010200000_dma_admin_create_dma_linked.sql` · `20261010200100_dma_account_order_server.sql` 적용. `supabase migration list --linked`: **두 버전 Local = Remote** |
| 2. 지정 행 수 | SQL count 는 **미실행**(CLI v2.75 에 `db query` 없음). **0 을 간접 확인** — 새 relay healthz `accountOrderServers == null`(relay 는 지정 RPC `dma_account_order_servers()` 를 적재하고, 비면 최상위 키를 생략 — 29-43) + 새 열 `is_order` 기본값 false |
| 2. 고아 점검 | **미실행** — `supabase/ops/29-orphan-dma-users.sql` 은 대시보드 SQL 편집기가 필요해 사용자에게 요청했으나 결과가 보고되지 않았다 → 아래 「남은 것」 |
| **3. relay** | 배포 worktree 에서 `bash scripts/deploy-relay.sh`(GCP_PROJECT_ID=gh-radar · SUPABASE_URL 라이브 server env · NOTIFICATION_CHANNEL_ID=`projects/gh-radar/notificationChannels/14409521670382124894`) **exit 0** → 이미지 **`relay:5d4ea4a5`** on radar-gw · `DMA_REGISTRY_SOURCE=db` · 주문 서버 KB=KB120 · KYOBO=KYOBO119 · uptime check + alert policy + KYOBO 감시 갱신 |
| 3. healthz | `status ok` · **`version 5d4ea4a5`** · journal live · KYOBO119 journal live · brokers KB120 / KYOBO119 alerting false · adminConns **KB120 ready · KYOBO119 ready** · **`accountOrderServers` null(키 없음)**. 런북 `jq -e` → **true** |
| 3. smoke | `bash scripts/smoke-relay.sh` → **PASS 11 · FAIL 0 · SKIP 2**(INV-9 토큰 없음 · INV-10 서비스 키 없음) — 기대와 같음 |
| **4. server** | 배포 전: 트래픽 100% `gh-radar-server-00059-5cr` · env 이름 19개 · `RELAY_ADMIN_TIMEOUT_MS` 없음. `bash scripts/deploy-server.sh`(SUPABASE_URL · CORS_ALLOWED_ORIGINS · RELAY_INTERNAL_URL=`http://10.10.0.5:8091` — 라이브 env) **exit 0**. smoke-server **PASS 15 · FAIL 0**(INV-12a RELAY_INTERNAL_URL 결선 · INV-12b ORDER_TIMEOUT_MS 잔존 없음 · INV-8 rate limit 포함) |
| 4. revision | 새 리비전 **`gh-radar-server-00060-gjj`** 100% 트래픽. `RELAY_ADMIN_TIMEOUT_MS` 개수 **0** → 15s 기본값 |
| 4. 미인증 Admin | `GET /api/admin/users`: smoke 레이트리밋 탐침 직후 429 × 2(런북이 예상한 것 · 29-26 선례) → **401** (03:39:19 KST) |
| **5. push** | 사용자 확인(AskUserQuestion) 뒤 `git push`: **`f45d11ce..5d4ea4a5 master -> master`**(125 커밋 · 전부 deepblue-1). Vercel production 03:40:12 KST 생성 · **● Ready**(빌드 2분) · alias `https://gh-radar-webapp.vercel.app` → `gh-radar-webapp-ilk8pckjr-…` · `/login` **200** |
| **6. 운영 확인** | 사용자 **「잘돼」** (2026-10-11 ~03:55 KST) — 런북 6단계 목록(/admin/users · /admin/servers · /trading · /pending) 일괄 확인. 항목별(폰 390 · 데스크톱 · 승인 뒤 홈 각각) 보고는 없었다 |
| 6. (가) 실증 | **deferred** — 두 번째 서버(KB121 · KYOBO127)가 없어 이 창에서 하지 않음(플랜 지시대로) |
| **7. 롤백** | **없음** |

### executor 재확인 (플랜 Task 3 `<verify>` · 읽기 전용 · 2026-10-11 07:26:32 KST)

```
$ curl -s https://dma.jx1.io/healthz | jq -e '.brokers.KB.server == "KB120" and .brokers.KYOBO.server == "KYOBO119" and .adminConns.KB120.state == "ready" and .adminConns.KYOBO119.state == "ready" and .accountOrderServers == null'
true          (exit 0)
발췌: {"status":"ok","version":"5d4ea4a5","journal":"live","kb":"KB120","kyobo":"KYOBO119","adm":{"KB120":"ready","KYOBO119":"ready"},"aos":null}
```

배포 뒤 약 3시간 50분이 지나도 relay `5d4ea4a5` 가 KB120 · KYOBO119 를 그대로 붙들고 있고 지정 0(키 없음)이다.

### 남은 것 (이 플랜에서 닫지 못함 — 숨기지 않음)

1. **고아 점검 미실행** — `supabase/ops/29-orphan-dma-users.sql`(읽기 전용 SELECT 1개)을 대시보드 SQL 편집기에서 한 번 돌려 0행인지 본다. 행이 있으면 행 수 · 마스킹 DMA id 만 기록하고 정리는 사용자 결정(coverage D4).
2. **지정 행 0 의 SQL 확인 없음** — healthz 로 간접 확인했다. 직접 숫자가 필요하면 런북 2단계의 SELECT 2개를 같은 SQL 편집기에서.
3. **(가) 실서버 실증 deferred** — KB121 또는 KYOBO127 을 켠 뒤: 계좌 지정 변경 → 옛 서버 활성 전략 끄기(24 · 21 · 14 · 재조회) → 1012 → 재접속 → 25 → 66, 두 서버 동시 세션(coverage D10). 부팅 결선(트래커 · 기준선 · resync · 재시도)의 실 relay 확인도 이때.
4. **/pending 항목별 확인** — 사용자 「잘돼」 는 일괄 확인이다. 29-VERIFICATION human_verification 1 을 이것으로 닫을지, 폰 390 · 데스크톱 · 승인 뒤 홈을 따로 볼지는 재검증 판단(coverage D9).
5. 배포 worktree `/private/tmp/gh-radar-deploy-2941` 는 메인 세션이 만든 것 — 정리(`git worktree remove`)는 메인 세션 몫(executor 는 손대지 않음).

## Task 3 런북 — 메인 세션 (실제 값 · 순서 고정 · 앞 단계 실패면 멈춤) — 위 결과대로 실행됨

공통: `export GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json CLOUDSDK_CORE_PROJECT=gh-radar`. 배포 명령은 허용 규칙 접두사 그대로(`yes |` · 출력 파이프 금지). 서비스롤 키 · Secret 은 변수로만(출력 금지 · 값 주입은 사용자 `!` 실행 규칙).

**0. 시각 · 트리**
```bash
date                                              # 20:00 KST 이후, 또는 07:00 KST 전(무거래 창)
cd /Users/alex/repos/gh-radar && git status -sb
git status --porcelain --untracked-files=no       # Task 1 시점: " M .planning/state.json" 1줄(오케스트레이터) + 이 SUMMARY 초안(untracked)
git log --format='%h %an %s' origin/master..HEAD | wc -l   # Task 1 시점 125 — 늘었으면 새 커밋을 먼저 본다
```
- relay · server 이미지는 **작업 트리**를 빌드 컨텍스트로 쓴다(`docker build … -f relay/Dockerfile .` · `-f server/Dockerfile`). 다른 세션의 미커밋 relay/server/packages 변경이 섞이지 않게 **detached worktree 에서 배포**한다(29-25 선례):
```bash
git worktree add --detach /private/tmp/gh-radar-deploy-2941 HEAD && cd /private/tmp/gh-radar-deploy-2941
```

**1. 이전 relay 태그 기록**
```bash
curl -s https://dma.jx1.io/healthz | jq -r .version      # Task 1 시점(02:3x KST) = aecf0868 → 롤백 대상
```

**2. [BLOCKING] Schema Push → 확인 → 지정 0 → 고아 점검** (relay 보다 먼저 — 새 relay 는 `dma_account_order_servers()` 가 없으면 인증을 열지 않는다)
```bash
supabase db push --linked --yes
supabase migration list --linked                  # 20261010200000 · 20261010200100 이 Local = Remote 여야 함
```
- 지정 행 0 확인 — CLI v2.75 에는 `supabase db query` 가 없다(확인함). 둘 중 하나:
  - Supabase 대시보드 SQL 편집기:
    ```sql
    SELECT count(*) AS designated FROM public.dma_account_servers WHERE is_order;   -- 기대 0
    SELECT count(*) AS rpc_rows   FROM public.dma_account_order_servers();          -- 기대 0
    ```
  - 또는 REST(서비스롤 키는 `$SR` 변수에만): `curl -s -o /dev/null -D - "$SUPABASE_URL/rest/v1/dma_account_servers?select=dma_user_id&is_order=eq.true" -H "apikey: $SR" -H "Authorization: Bearer $SR" -H 'Prefer: count=exact' -H 'Range: 0-0' | grep -i content-range` → `*/0`
- 고아 점검: `supabase/ops/29-orphan-dma-users.sql` 전체를 대시보드 SQL 편집기에 붙여 실행(읽기 전용 SELECT 1개). 0행이면 끝, 행이 있으면 행 수 · 마스킹 DMA id(`앞 2글자***(길이)`)만 기록하고 정리 여부는 사용자 결정(지우지 않는다).

**3. relay** (전환 잠금: 실행 중 값이 `DMA_REGISTRY_SOURCE=db` 라 `--registry-cutover` 없이 열린다)
```bash
GCP_PROJECT_ID=gh-radar SUPABASE_URL=<운영 URL> NOTIFICATION_CHANNEL_ID=<지난 relay 배포와 같은 채널> bash scripts/deploy-relay.sh
curl -s https://dma.jx1.io/healthz | jq '{status, version, journal: .journal.state, brokers, adminConns, accountOrderServers}'
curl -s https://dma.jx1.io/healthz | jq -e '.brokers.KB.server == "KB120" and .brokers.KYOBO.server == "KYOBO119" and .adminConns.KB120.state == "ready" and .adminConns.KYOBO119.state == "ready" and .accountOrderServers == null'
bash scripts/smoke-relay.sh
```
- 기대: `version` = 배포 커밋 short SHA(Task 1 시점 HEAD `5d4ea4a5`, 그 뒤 커밋이 있으면 그 SHA) · journal live · `brokers.KB.server = KB120` · `brokers.KYOBO.server = KYOBO119` · adminConns 둘 ready · **`accountOrderServers` = null(키 없음)** — `{}` 가 보이면 29-43 회귀, 키가 있으면 2단계 지정 0 과 어긋남 → 멈춤.
- smoke 기대(Supabase env 없이): **PASS 11 · FAIL 0 · SKIP 2**(INV-9 토큰 없음 · INV-10 env 없음) — `smoke-relay.sh` 는 29-25 뒤 바뀌지 않았다(`git log e2a12c34..HEAD -- scripts/smoke-relay.sh` 0건). INV-5c 는 PASS 여야 한다.
- 배포 스크립트 요약 줄: 실행 중 `DMA_REGISTRY_SOURCE=db` · KYOBO 감시 JSONPath `$.brokers.KYOBO.alerting`.

**4. server** (라이브 env 에서 값 추출 — 값은 변수로만)
```bash
gcloud run services describe gh-radar-server --region=asia-northeast3 --format='value(spec.template.spec.containers[0].env[].name)' | tr ';' '\n'   # 배포 전 이름 목록 — Task 1 시점 19개 · RELAY_ADMIN_TIMEOUT_MS 없음
gcloud run revisions list --service=gh-radar-server --region=asia-northeast3 --limit=3    # 이전 리비전 기록(Task 1 시점 트래픽 100% = gh-radar-server-00059-5cr)
# SUPABASE_URL · CORS_ALLOWED_ORIGINS · RELAY_INTERNAL_URL 값은 같은 describe 의 env[] 에서 읽어 변수로(RELAY_INTERNAL_URL 기대 = http://10.10.0.5:8091 — infra/relay/README.md 202행 · 29-26)
GCP_PROJECT_ID=gh-radar SUPABASE_URL=<라이브> CORS_ALLOWED_ORIGINS=<라이브> RELAY_INTERNAL_URL=<라이브> bash scripts/deploy-server.sh
URL=$(gcloud run services describe gh-radar-server --region=asia-northeast3 --format='value(status.url)')
curl -s -o /dev/null -w '%{http_code}\n' "$URL/api/admin/users"     # 기대 401 (smoke 레이트리밋 탐침 직후면 429 1회 가능 → 재조회 — 29-26 선례)
gcloud run services describe gh-radar-server --region=asia-northeast3 --format='value(spec.template.spec.containers[0].env[].name)' | tr ';' '\n' | grep -c '^RELAY_ADMIN_TIMEOUT_MS$'   # 기대 0 → 15s 기본값
```
- 기대: 스크립트의 「env 항목 N개 (필수 19종 대조)」 통과 · 「relay 결선: RELAY_INTERNAL_URL 설정됨 · RELAY_ORDER_SECRET 바인딩」 · smoke-server 통과 · 새 리비전 이름 기록 · 401.

**5. push (= webapp 프로덕션)**
```bash
cd /Users/alex/repos/gh-radar && git status -sb                       # 남의 로컬 커밋 · 미커밋 재확인
git log --format='%h %an %s' origin/master..HEAD                      # 범위를 사용자에게 보이고 확인(Task 1 시점 125 커밋 · Phase 29 밖 포함 — 위 알려진 사항 7)
git push
```
- Vercel 프로덕션 배포 완료(커밋 해시 일치) · `https://gh-radar-webapp.vercel.app/login` 200.
- 이 SUMMARY 는 이때 아직 커밋 전이다 — 플랜 끝 커밋은 Task 3 결과를 옮긴 뒤(다음 push 때 원격으로).

**6. 운영 확인 (사용자)** — 플랜 Task 3 instructions 6 그대로: /admin/users(비모달 시트 · 계좌 줄 「주문 서버」 세그먼트 「기본 · KB120」 또는 「주문 서버 KB120(기본)」 글자 · (가) 안내 문장 · 폰 390 터치 타깃) · /admin/servers(「기본 주문 서버」 · 「활성 전략을 끄고 바로 새 서버로 재접속」 안내 · 「끌 수 없어요」 한 줄 · 「끄지 못한 전략」 한 줄 없음) · /trading(계좌 필 서버 키 꼬리표 · 서버 칩 · 옛 「재접속하면 적용」 배지 없음 · 경고/안내 줄 없음 · 주문 · 상따 정상) · **/pending**(app_users 에 없는 Google 계정 → 스캐너 · 뉴스 · 종목 경로 모두 /pending · 안내 한 줄 + 이메일 + 로그아웃 1개 · 폰 390 · 데스크톱 · Admin 승인 뒤 다음 이동 → 홈 — 29-VERIFICATION human_verification 1 종결 근거). (가) 실증은 두 번째 서버를 켠 뒤 별도.

**7. 롤백 (막히면)**
- **relay:** 이전 태그 `aecf0868` 은 **레지스트리 시대 이미지**라 `deploy-relay.sh --rollback` 으로는 되돌릴 수 없다 — `--rollback` 은 레거시 env 모드 전용이고 `DMA_REGISTRY_SOURCE=db` 를 넣지 않아 레지스트리 시대 이미지는 production 기동을 거부한다(`infra/relay/README.md` 182-183행 · `relay/src/config.ts` 213행). 정본 절차 = 그 커밋을 체크아웃해 정상 배포:
  ```bash
  git worktree add --detach /private/tmp/gh-radar-rollback-relay aecf0868 && cd /private/tmp/gh-radar-rollback-relay
  GCP_PROJECT_ID=gh-radar SUPABASE_URL=<운영 URL> NOTIFICATION_CHANNEL_ID=<채널> bash scripts/deploy-relay.sh
  curl -s https://dma.jx1.io/healthz | jq '{version, journal: .journal.state, brokers, adminConns}'   # version aecf0868
  ```
  (`aecf0868` 은 HEAD 조상 커밋 — 확인함. 1단계에서 읽은 태그가 다르면 그 태그로.)
- **마이그레이션 두 개는 그대로 둔다** — additive 다. `20261010200000` 은 `dma_admin_create_dma_user` 본문만 CREATE OR REPLACE(CR-01 가드), `20261010200100` 은 `dma_account_servers.is_order` 열 · CHECK · 부분 유니크 · 새 RPC 2개 · 기존 RPC 4개 재정의(시그니처 무변경 · 의도 행에 `isOrder` 키 추가). 옛 relay(`aecf0868`)는 새 RPC · 열을 쓰지 않고, 지정 0 이라 동작이 같다. (`isOrder` · `isOrderServer` 키 추가가 옛 relay/server 의 jsonb 소비에 무해한지는 29-29 가 기존 회귀 무수정 통과로 보였다.)
- **server:** 이전 리비전으로 트래픽 — `gcloud run services update-traffic gh-radar-server --region=asia-northeast3 --to-revisions=<이전 리비전>=100`(Task 1 시점 트래픽 100% = **`gh-radar-server-00059-5cr`**(2026-10-09 00:06Z) — 4단계 직전 `gcloud run revisions list --service=gh-radar-server --region=asia-northeast3 --limit=3` 으로 다시 확인해 기록).
- **push 전이면 push 하지 않는다.** push 뒤 webapp 되돌림은 revert 커밋 push.

## 저장소 상태 (Task 1 시점)

- `git status --porcelain --untracked-files=no` → **1줄: ` M .planning/state.json`** — 오케스트레이터가 디스패치 때 바꾼 파일(이 플랜 변경 아님 · 손대지 않음). 이 SUMMARY 초안은 untracked 라 이 명령에는 안 보인다(`git status --short` 에는 `?? .planning/phases/29-dma-multi-server-admin/29-41-SUMMARY.md`). 수용 기준 「0줄」 은 문자 그대로는 미충족 — 사유는 위 두 파일뿐.
- `git rev-list --left-right --count origin/master...HEAD` → `0	125`(뒤처짐 0 · 앞섬 125) · 작성자 전부 `deepblue-1`.
- `git log --format='%h %s' origin/master..HEAD` 중 Phase 29 밖: `36b0e2c3` · `9f78489a`(julmaesu 문구) · `cea0f14a` · `0e3f992e` · `18cf2ed5` · `cd5c3b4a` · `39b0d7c7` · `799d928f`(quick-261011-0yb) · `d88ed4da`(order_ip/mac 인박스 접수 · 생성물) · `3d76221e` · `3a0870ee`(trade 인박스) · 병합 커밋 4(`d693a6b2` · `42f38aba` · `4b648fe9` · `13558666`) · `fe10f208`(phase-29 추적 docs). 나머지는 29-xx.

## 저장소 상태 (마무리 시점 · 2026-10-11 07:26 KST)

- HEAD `5d4ea4a5` == `origin/master`(push 뒤 앞섬 0). `git status --porcelain --untracked-files=no` → ` M .planning/state.json`(오케스트레이터) 1줄뿐.

## 실행 경계 기록

- **Task 1 executor 가 실행한 것:** verify 1~4(순차) · relay evidence 4파일 verbose 재실행 · `supabase migration list --linked`(읽기 전용) · 공개 healthz GET · `deploy-relay.sh --self-test`(오프라인) · 저장소 읽기.
- **Task 1 executor 가 실행하지 않은 것:** `supabase db push` · 원격 SQL · `deploy-relay.sh`(self-test 외) · `deploy-server.sh` · gcloud 쓰기 · Secret 읽기 · `git push` · 커밋.
- **Task 3 은 메인 세션이 실행**(db push · deploy-relay · deploy-server · git push — 서브에이전트 금지 규칙대로).
- **마무리 executor(이어받기)가 실행한 것:** 공개 healthz `jq -e` 1회(읽기 전용) · `requirements.ready-ids` · SUMMARY/STATE/ROADMAP/REQUIREMENTS 편집 · 경로 지정 커밋. 배포 · push · db push 없음.

## Deviations from Plan

**1. [실행 방식] verify 4 의 self-test 를 따로 실행.** 플랜 명령은 `playwright … && bash scripts/deploy-relay.sh --self-test` 라 Playwright 가 P20-3(기존 실패)로 exit 1 이면 self-test 가 돌지 않는다. 오케스트레이터 지시대로 P20-3 을 KNOWN-PRE-EXISTING 으로 기록하고 `trading-workbench.spec.ts --grep-invert "P20-3 최악값"` 을 다시 돌린 뒤 self-test 를 단독 실행했다.

**2. [런북 정정] 롤백 명령.** 플랜 action ③ · Task 3 7단계의 「이전 relay 태그로 `deploy-relay.sh --rollback <태그>`」 는 이번 이전 태그(`aecf0868`)에 맞지 않는다 — `--rollback` 은 레거시 env 모드 이미지 전용이고, 레지스트리 시대 이미지는 `DMA_REGISTRY_SOURCE=db` 없이 production 기동을 거부한다(`infra/relay/README.md` 182-183 · `relay/src/config.ts` 213). 런북 7단계에 정본 절차(그 커밋 detached worktree 에서 정상 배포)를 적었다. 코드 · 스크립트는 바꾸지 않았다.

**3. [런북 정정] 지정 0 · 고아 점검 실행 수단.** 플랜은 `supabase db query` 를 예로 들지만 설치된 CLI v2.75.0 에는 그 하위 명령이 없다(`supabase db --help` 확인). 대시보드 SQL 편집기 또는 REST `Prefer: count=exact` 로 적었다.

**4. [수용 기준] `git status --porcelain --untracked-files=no` 0줄** — 문자 그대로는 미충족(1줄 ` M .planning/state.json` — 오케스트레이터 변경). 이 SUMMARY 초안은 플랜 지시대로 미커밋 untracked. 이 플랜이 만든 다른 변경은 없다.

**5. [Task 3 수용 기준 미충족] 지정 행 0 을 원격 `SELECT count(*)` 가 아니라 healthz 로 간접 확인.** 메인 세션은 대시보드 SQL 을 돌리지 않았다. 새 relay 가 지정 RPC 를 적재하고 healthz 에 `accountOrderServers` 키를 내지 않은 것(비면 생략 — 29-43) + 새 열 기본값 false 를 근거로 0 으로 판정. 직접 숫자는 남은 것 2.

**6. [Task 3 수용 기준 미충족] 고아 점검 결과 없음.** `29-orphan-dma-users.sql` 은 대시보드 필요 — 사용자에게 요청했으나 보고 없음. 「미실행」 으로 기록(coverage D4 · human_judgment). 이 플랜은 어떤 행도 지우지 않았다.

**7. [Task 3 수용 기준 부분] /pending 운영 확인이 항목별이 아니라 일괄 「잘돼」.** 폰 390 · 데스크톱 · 「승인 뒤 다음 이동 → 홈」 을 각각 받지 못했다 — 그대로 기록하고 재검증 판단에 넘긴다(coverage D9).

**8. [런북 정정 · 실행됨] 스키마 push 는 메인 repo, relay/server 배포는 detached worktree 에서.** 런북 0단계대로 — 다른 세션 미커밋 변경이 이미지에 섞이지 않게.

**Total deviations:** 8 (실행 방식 1 · 런북 정정 3 · 수용 기준 기록/미충족 4) — 코드 · 테스트 수정 0, 회귀 수정 커밋 0, 롤백 0.

## Issues Encountered

- 회귀 중 실패는 P20-3 1건뿐이고 Phase 29 밖 기존 결함이라 고치지 않았다(플랜 ① 「그 플랜 범위에서 원인을 찾아 고친다」 대상이 아님). 다른 실패 없음.
- 동시 세션: 실행 내내 HEAD `5d4ea4a5` 그대로(다른 세션 커밋 없음) · 시작 전 다른 vitest/playwright 프로세스 0.
- `deploy-server.sh` 196행 주석 「`RELAY_ADMIN_TIMEOUT_MS` 미설정 = 12000ms」 는 29-32 이후 낡은 주석(실제 기본 15000) — 동작 영향 없음, 이 플랜은 코드 · 스크립트를 고치지 않는다(후속 정리 후보).
- `gsd-tools windows append` 는 쓰지 않았다(새 스텁 · skip · 미실행 verify 없음 — P20-3 은 기존 결함으로 quick-261011-0yb 에 이미 기록).

## Next Phase Readiness

- **29 갭 클로징 44/44 플랜 완료 · 운영 반영 끝.** 다음은 재검증(`/gsd-verify-work 29` 또는 verifier) — 이 SUMMARY 의 coverage D4 · D8 · D9 · D10 이 사람 확인으로 라우팅된다.
- REQUIREMENTS: `requirements.ready-ids` 게이트는 ADMIN-12 · ADMIN-06 · ADMIN-03 을 3/3 ready 로 냈으나 `requirements.mark-complete` 가 **쓰지 않았다**(not_found) — Traceability 상태 칸이 맨 `Pending` 이 아니라 「Pending — 29 갭 클로징(29-27~29-44) 재검증 대기」 라 행 갱신이 거부되고, 체크박스도 표와 어긋나지 않게 함께 그대로 둔다(#2788). 29-40 이 등록한 「재검증이 판정」 규칙과 같은 결론이라 손으로 고치지 않았다 — **ADMIN-01~12 전부 Pending 유지, Complete 판정은 재검증 몫.** frontmatter `requirements-completed` 는 이 플랜 requirements 를 그대로 옮긴 것(템플릿 규칙 · 29-40 선례).
- 후속 후보(블로커 아님): `deploy-server.sh` 196행 낡은 주석(12000ms → 15000ms) · `relay/src/quote/feed.ts:19` 관찰자 정원 주석 4 → 6 · 인박스 `261010-kb-order-ip-mac.md`(order_ip/mac 코덱 · Admin 입력칸) · 51 `OrderResp.account_no` 요청 여부(gh-trade-84 ④ 와 충돌 — 사용자 판단).

## Self-Check: PASSED

- 파일: 마이그레이션 2개 · `supabase/ops/29-orphan-dma-users.sql` · (가)(나) 근거 테스트 6파일 — 전부 FOUND.
- 커밋: 롤백 태그 `aecf0868` · 배포 커밋 `5d4ea4a5` · push 기준 `f45d11ce` — 전부 HEAD 조상(FOUND).
- 실측: `git rev-list --count 5d4ea4a5..HEAD` = 0(SUMMARY 작성 시점 · docs-only — 코드 변경 없음이 정상) · healthz `jq -e` true(07:26 KST) · `uat classify-coverage` 10건 파싱 오류 없음.
- 미충족을 PASS 로 덮지 않음: 고아 점검 미실행 · 지정 0 간접 확인 · /pending 일괄 확인 · (가) 실증 deferred — Deviations 5~7 · coverage D4 · D9 · D10 에 그대로.
