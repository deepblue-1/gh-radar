---
phase: 29-dma-multi-server-admin
plan: 53
subsystem: infra
tags: [deploy, gap-closure, round-3, regression, go-no-go, gc-01, gc-02, n-01, runbook, review-disposition]
status: complete

requires:
  - phase: 29-45 ~ 29-52 · 29-54 · 29-55
    provides: "3라운드 갭 클로징 코드 · 테스트 — GC-01~15 · N-01 (DB · server 소스 변경 0)"
provides:
  - "3라운드 전량 회귀 기록(한 세션 · 순차) — shared 464 · relay 1491 · server 496 · webapp 3839(+1 skip) · Playwright 294 pass / 0 fail / 9 skip · deploy-relay self-test 8"
  - "GC-01~15 · N-01 근거 표 — 플랜 · 테스트 파일 · 케이스 이름 · green (「근거 없음」 0 · red 0)"
  - "29-REVIEW-R2-DISPOSITION.md 15행 fixed + N-01 행 fixed(29-54) · open 0 · total 16"
  - "인박스 261010-kb-order-ip-mac.md 진행 줄(29-47 · status open 유지)"
  - "Task 3 런북(실제 값) · 롤백(5d4ea4a5 detached worktree 정상 배포) · 두 번째 서버 켜기 전 결정 목록"
  - "go 결정(2026-10-11 11:33 KST 무렵 · 일요일 무장 창) · relay 5d4ea4a5 → 183ea9c8 배포 · healthz 보존(KB120 · KYOBO119 · adminConns ready · journal live · accountOrderServers 없음) · smoke PASS 11 / FAIL 0 / SKIP 2 · push 5d4ea4a5..183ea9c8(71커밋) · Vercel Ready · 운영 확인 · 고아 점검 · /pending 통과(사용자 보고) · 롤백 없음"
affects: [29-verification-r3, ADMIN-12, ADMIN-06, ADMIN-05, ADMIN-03]

actuals:
  tokens: 9600     # chars/4 — 이 SUMMARY + 처분 표 diff + 인박스 한 줄(코드 변경 0)
  tasks: 3         # Task 1(auto) · Task 2(결정 — 사용자) · Task 3(배포 — 메인 세션)
  commits: 4       # MEASURED: git rev-list --count ad90ff10..HEAD = 4 (SUMMARY 작성 시점). 이 플랜 커밋은 3(9d78a24a · 4b719a5c · 183ea9c8) — 나머지 1은 다른 세션의 46d4ff80(relay WireGuard 피어 · 이 플랜 밖). 이 SUMMARY 완료 커밋은 그 뒤
plan_head_before: ad90ff107613e7f623e5f2307f9e0130dc09021e
plan_head_after: 46d4ff800c389c0815ed5cb640e716e00245f3bd   # SUMMARY 작성 시점 HEAD(다른 세션 커밋 46d4ff80 이 183ea9c8 위에 있음)

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/29-dma-multi-server-admin/29-53-SUMMARY.md
  modified:
    - .planning/phases/29-dma-multi-server-admin/29-REVIEW-R2-DISPOSITION.md
    - docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md

key-decisions:
  - "Task 1: DB · server 소스 변경 0 확인(d1c30b07..HEAD 와 배포본 5d4ea4a5..HEAD 둘 다) — 런북에 schema push · pgTAP · server 배포 단계 없음. shared 변경(29-46 · 29-47)이 운영 server(00060, 옛 shared 번들)에 안 들어가도 동작 같음(아래 알려진 사항 3)"
  - "Task 1 런북: 롤백은 `deploy-relay.sh --rollback` 이 아니라 이전 태그 5d4ea4a5 detached worktree 정상 배포 — 29-41 정정과 같은 이유(레지스트리 시대 이미지 · README 182-183행)"
  - "Task 1: 배포는 detached worktree 에서 — 실행 중 다른 세션이 infra/relay/startup.sh · infra/relay/README.md · docs/dma-tunnel-guide.md 를 미커밋 수정 중이라 작업 트리를 빌드 컨텍스트로 쓰면 섞인다"
  - "Task 2: go — 지금(일요일 무장 창). 플랜 precondition 「20:00 KST 이후」 를 29-41 선례처럼 「무거래 창」 으로 읽어 사용자가 일요일 낮 실행을 정했다(근거 표 16행 전부 green · 「근거 없음」 0)"
  - "Task 3: gh-trade 알림 미송신 — 사용자 결정. 관련 작업(웹 IP/MAC 입력칸 · 인박스 질문 3개)은 마일스톤 마무리 뒤 재개 · 인박스 261010-kb-order-ip-mac status open 유지"

requirements-completed: [ADMIN-12, ADMIN-06, ADMIN-05, ADMIN-03]   # 플랜 requirements 를 그대로 옮김(템플릿 규칙 · 29-41 선례). REQUIREMENTS.md 상태 전환은 재검증 몫 — 아래 「요구사항 추적」

coverage:
  - id: D1
    description: "3라운드 전량 회귀(한 세션 · 순차) — 단위 4패키지 · Playwright 전체(P20-3 필터) · deploy-relay self-test · DB/server 변경 0 · N-01 회귀 존재"
    requirement: ADMIN-12
    verification:
      - kind: unit
        ref: "verify 1 — NO_DB_SERVER_CHANGE · N01_TESTS_PRESENT · shared vitest 19 파일 464 · relay typecheck · typecheck:tests · relay vitest 57 파일 1491 · 실패 0"
        status: pass
      - kind: unit
        ref: "verify 2 — server typecheck · vitest 39 파일 496 · webapp typecheck · vitest 164 파일 3839 + 1 skip · 실패 0"
        status: pass
      - kind: e2e
        ref: "verify 3 — playwright test --workers=1 --grep-invert \"P20-3 최악값\" — 294 passed · 0 failed · 9 skipped · did not run 0 (9.7분)"
        status: pass
      - kind: other
        ref: "bash scripts/deploy-relay.sh --self-test — self-test OK 8 cases"
        status: pass
    human_judgment: false
  - id: D2
    description: "GC-01~15 · N-01 근거 표 — 16행 전부 플랜 · 파일 · 케이스 존재 · 전량 회귀 안에서 green"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "아래 「GC · N-01 근거 표」 — grep 으로 케이스 이름 확인 + verify 1 · 2 전량 회귀 파일 단위 green"
        status: pass
    human_judgment: false
  - id: D3
    description: "처분 표 15행 fixed + N-01 행 fixed(29-54) · open 0 · total 16 · 인박스 status open + 29-47 진행 줄"
    verification:
      - kind: other
        ref: "verify 4 — DOCS_OK"
        status: pass
    human_judgment: false
  - id: D4
    description: "relay 배포(5d4ea4a5 → 183ea9c8) · 운영 상태 보존(KB120 · KYOBO119 기본 주문 서버 · adminConns ready · accountOrderServers 없음) · smoke · push(webapp 프로덕션)"
    requirement: ADMIN-12
    verification:
      - kind: other
        ref: "Task 3 verify — curl -s https://dma.jx1.io/healthz | jq -e '…KB120 … KYOBO119 … ready … accountOrderServers == null' → true (이어받기 executor · 2026-10-11 12:10 KST · version 183ea9c8 · journal live)"
        status: pass
      - kind: other
        ref: "bash scripts/smoke-relay.sh (메인 세션) — PASS 11 · FAIL 0 · SKIP 2(INV-9 토큰 없음 · INV-10 서비스 키 없음)"
        status: pass
      - kind: other
        ref: "git push origin master 5d4ea4a5..183ea9c8 (메인 세션) · Vercel 프로덕션 gyzqjcxad(githubCommitSha 183ea9c8) Ready · alias 빌드 3zyzab2f2(46d4ff80 · 183ea9c8 포함) Ready · /login 200"
        status: pass
    human_judgment: false
  - id: D5
    description: "go/no-go 결정(Task 2) · 운영 확인(/admin/users · /admin/servers · /trading) · 사람 확인(고아 점검 · /pending 폰 · 데스크톱 · 승인 뒤 홈) · gh-trade 알림 여부"
    requirement: ADMIN-06
    verification:
      - kind: manual
        ref: "Task 2 사용자 답 「go — 지금 (일요일 무장)」 · Task 3 5~6 사용자 보고 「1~3 통과」(고아 점검 행 수 미보고)"
        status: pass
    human_judgment: true
    rationale: "Task 2 는 blocking-human 결정, 운영 확인 · 고아 점검 · /pending 은 사용자가 화면 · 대시보드에서 본 결과 보고 — 테스트가 단언하지 않는다. gh-trade 알림은 사용자 결정으로 미송신"

duration: 56min   # 벽시계 02:15:30Z ~ 03:11Z — Task 1 14분 · go 결정 · 메인 세션 배포 창(11:34~11:37 KST 전후) · 사용자 운영 확인 대기 · 마무리 포함
completed: 2026-10-11
---

# Phase 29 Plan 53: 갭 클로징 3라운드 전량 회귀 · GC/N-01 근거 표 · 처분 기록 · go/no-go · 배포 창 Summary

**3라운드 전량 회귀가 한 세션 순차로 전부 green 이다 — shared 464 · relay 1491 · server 496 · webapp 3839(+1 skip) · Playwright 294/0/9 · self-test 8. DB · server 소스 변경 0 (pgTAP · server 배포 생략 근거). GC-01~15 · N-01 근거 16행이 전부 파일 · 케이스로 있고 green 이다(「근거 없음」 0 · red 0). 사용자가 `go`(일요일 무장 창)를 정했고, 메인 세션이 relay 를 `5d4ea4a5` → `183ea9c8` 로 배포(healthz 보존 · smoke PASS 11/FAIL 0/SKIP 2)한 뒤 `5d4ea4a5..183ea9c8`(71커밋)을 push 해 webapp 프로덕션이 Ready 다. 운영 확인 · 고아 점검 · /pending 은 사용자 보고로 통과, 롤백 없음. 두 번째 서버 켜기 전 결정(51 OrderResp · (가) 실증)은 미결로 남는다.**

## Performance

- **Started:** 2026-10-11T02:15:30Z (11:15 KST, 일요일)
- **Task 1 completed:** 2026-10-11T02:29Z (11:29 KST)
- **Task 2 결정:** 11:33 KST 무렵 · **Task 3 배포 창:** 11:34 KST 시작 · relay 약 3분 · push · Vercel Ready 2분
- **Completed:** 2026-10-11T03:11Z (12:11 KST — 이어받기 executor 마무리)
- **Tasks:** 3/3
- **Files modified:** 2 (처분 표 · 인박스) + 이 SUMMARY

## Task 1 — 전량 회귀 (한 세션 · 순차)

실행 전 `ps aux | grep -E 'vitest|playwright'` = 0. 실행 중 다른 세션의 테스트 프로세스 없음. HEAD `ad90ff10`(디스패치 시점과 같음).

### verify 1 — diff · N-01 존재 · shared · relay

| 단계 | 결과 |
|---|---|
| `git diff --quiet d1c30b07 HEAD -- supabase/migrations server/src` | **`NO_DB_SERVER_CHANGE`** |
| 참고: 배포본 기준 `git diff --quiet 5d4ea4a5 HEAD -- supabase/migrations server/src` | 무변경 (같은 결론. `supabase/` 전체로는 `supabase/ops/29-orphan-dma-users.sql` 주석 3줄만 — GC-15) |
| `grep -c 'N-01'` fanout-multi-session · hub-multi-session ≥ 1 | **`N01_TESTS_PRESENT`** |
| shared build · vitest `--maxWorkers=2` | **19 파일 · 464 통과** · 실패 0 · skip 0 |
| relay `typecheck` · `typecheck:tests` | exit 0 · `error TS` 0 |
| relay vitest `--maxWorkers=2` | **57 파일 · 1491 통과** · 실패 0 · skip 0 (31초) |

### verify 2 — server · webapp

| 단계 | 결과 |
|---|---|
| server `typecheck` | exit 0 |
| server vitest `--maxWorkers=2` | **39 파일 · 496 통과** · 실패 0 |
| webapp `typecheck` (tsc + e2e tsconfig) | exit 0 · `error TS` 0 |
| webapp vitest `--maxWorkers=2 --passWithNoTests` | **164 파일 · 3839 통과 · 1 skipped**(기존 skip — 29-41 과 같은 1건) · 실패 0 (91초) |

단위 합계: **279 파일 · 6290 통과 · 1 skipped · 실패 0.**

### verify 3 — Playwright 전체(P20-3 필터) · deploy-relay self-test

| 단계 | 결과 |
|---|---|
| `shared build` → `playwright test --workers=1 --reporter=list --grep-invert "P20-3 최악값"` | **294 passed · 0 failed · 9 skipped · did not run 0** (9.7분) · `NextFontGoogleFontFileReplacer` 타임아웃 없음(`.next` 정리 불요) |
| skipped 9건 | env 게이트 `test.skip(!HAS_SERVICE_KEY)` — `user-themes.spec.ts` 4 · `watchlist.spec.ts` 5 (29-41 과 같음) |
| Phase 29 이름 있는 케이스 | `access-gate` P29-G1 · G2 · `admin-servers` P29-S1 (390 · 1080) · P29-S2 ×3 · `admin` P29-A1 ×2 · A2 · A3 ×2 · A3b · A3c ×2 · G1 ×2 · A4 · A5 — 전부 ✓ |
| `bash scripts/deploy-relay.sh --self-test` | **self-test OK 8 cases**(kyobo_presence 4 · registry_cutover_gate 4) · FAIL 줄 없음 |

29-41 의 전체 304 에서 P20-3 1건을 필터로 뺀 303 = 294 + 9. 필터라서 같은 serial 파일의 뒤 케이스(29-41 에서 did not run 10)도 이번에는 한 번에 돌았다.

### P20-3 단독 실행 (기록용 · 비게이트)

`pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts --workers=1 --reporter=list --grep "P20-3 최악값"` → **1 failed**(setup 1 passed) — `trading-workbench.spec.ts:4403` 「344 카드 · 수동 pane — 내용이 상자를 넘친 요소」 `{ tag: span, text: " · 위탁종합", over: 17 }`. 29-41 기록 · quick-261011-0yb 기록과 같은 메시지 · 같은 수치 → **KNOWN-PRE-EXISTING**(Phase 29 밖). go 판정에 쓰지 않는다.

### verify 4 — 처분 표 · 인박스

`DOCS_OK` — GC 15행 `fixed` · Source 29-45~29-55 · N-01 1행 `fixed | 29-54` · open 행 0 · `open: 0` · `total: 16` · 인박스 `status: open` · `29-47` 줄 있음. 커밋 `9d78a24a`(경로 지정 2파일).

### verify 밖 확인 (읽기 전용)

- 공개 healthz (2026-10-11 11:16 KST): `status ok` · **`version 5d4ea4a5`** · journal live · `brokers.KB.server = KB120` · `brokers.KYOBO.server = KYOBO119` · `adminConns` KB120 · KYOBO119 ready · `accountOrderServers` null(키 없음). → **이전 relay 태그 = `5d4ea4a5`**(29-41 배포본 그대로).
- `5d4ea4a5` 는 HEAD 조상(확인). `scripts/smoke-relay.sh` · `scripts/deploy-relay.sh` 는 `5d4ea4a5..HEAD` 에 변경 0 → smoke 기대값 29-41 과 같다.

## GC · N-01 근거 표

근거: 각 테스트 파일에서 `grep -nE "(it|test|describe)\("` 로 케이스 이름을 뽑아 확인했고, 결과는 verify 1 · 2 전량 회귀의 파일 단위 green 이다(파일 하나라도 실패하면 전량 회귀가 실패로 끝난다 — 실패 0). **16행 전부 근거 있음 · red 0 — 「근거 없음」 행 없음.**

| ID | Sev | 플랜 | 테스트 파일 | 케이스 (실제 이름 요지) | 결과 |
|---|---|---|---|---|---|
| **GC-01** | critical | 29-45 | `relay/tests/order-server-resync.test.ts` | **⑱ GC-01 회귀** — 로그인 백스톱이 KB121 세션에서 [B, C] sweep 을 쥔 채 B 지정 변경 → sweep 끝날 때까지 dropUser 0 → 풀면 dropUser 1 · 1012 → 재접속 KB121 새 세션 **`refCountOf(U1, "KB121")` = 1 (Ready 직후 · 6분 뒤)** · 같은 객체 생존 · B 주문 KB121 DirectOrderReq 1 | green |
| 〃 | | 29-45 | `relay/tests/session-manager.test.ts` | **releaseSession (29-45 GC-01)** — dropUser 뒤 새 엔트리를 옛 객체 반납이 깎지 않음 · refCountOf 불변 · 6분 뒤 생존 · 같은 객체 반납은 종전 유예 · 엔트리 없음 false | green |
| 〃 | | 29-45 | `relay/tests/strategy-sweeper.test.ts` | GC-01 (29-45) — 반납은 얻은 세션 객체로: send-failed · 예외 갈래도 releaseSession 1회 · 키 반납 0 | green |
| **GC-02** | critical | 29-47 | `relay/src/dma/__tests__/envelope.test.ts` | **44 op 3 — account 의 orderIp/orderMac 을 싣는다 · 바이트를 생성 리더로 다시 읽으면 두 값(GC-02 트레이서)** · 87 → order_ip/order_mac 은 비어 있지 않은 값만 키로 · 44 — 두 값이 없는 계좌는 빈 문자열을 명시적으로 | green |
| 〃 | | 29-47 | `relay/tests/admin-planner.test.ts` | describe **「planServerOps — 주문자 IP/MAC 되싣기 (GC-02 · 29-47)」** 7건 — 87 A1 IP/MAC 되싣기 · 비정규 계좌번호 정규화 키 · 87 에 없는 계좌 빈 문자열 · op 1 첫 계좌 · 의도 쌍 우선 · 한쪽만 섞지 않음 · IP/MAC 만 다르면 op 0 | green |
| 〃 | | 29-47 | `relay/tests/admin-dispatcher.test.ts` | **D14 GC-02(29-47) — 87 의 주문자 IP/MAC 을 op 3 command 에 되싣는다 · 서버 값이 남는다** · D15 86 code 13 BAD_ORDER_ENDPOINT → failed · message 원문 · 로그 이름표 | green |
| 〃 | | 29-47 | `packages/shared/src/__tests__/admin.test.ts` | diffServerAccounts — 주문자 IP/MAC 은 의도 값이 있을 때만 비교 (GC-02 · 29-47) · interpretAdminResult code 13 → failed | green |
| **GC-03** | warning | 29-49 | `relay/tests/strategy-sweeper.test.ts` | GC-03 · GC-04 (29-49) 트레이서 — 실 hub 결선: sweep 중 strategies.disabled 0 · 빈 61 vi 0 · 대여 아닌 65 종전 팬아웃 · GC-03 (29-49) lend 1 · 반납 1 · 반납이 releaseSession 보다 먼저(5갈래) | green |
| **GC-04** | warning | 29-45 · 29-49 | `relay/tests/order-server-resync.test.ts` · `strategy-sweeper.test.ts` · `hub-multi-session.test.ts` | **⑲ GC-04** 같은 세션 두 sweep 직렬(두 번째 첫 24 가 첫 sweep 마지막 21 뒤) · GC-04 (29-45) 14 확인 = 그 키 60 에코 짝 ×2 · hub describe 「sweep 대여 (29-49 · GC-03 · GC-04)」 — 배수 뒤 해결 · 5초 상한 · Ready 앞 대여 · 결선 안 된 세션 무동작 · primary 아닌 세션 대여 · 두 번째 대여 · 교체/분리/closeAll 정리 | green |
| **GC-05** | warning | 29-51 | `relay/tests/fanout-multi-session.test.ts` · `hub-multi-session.test.ts` | GC-05 (29-51) 트레이서 — vi.set(A) 계좌 소유 KB121 · 61 에코 → 브라우저 vi KRX = A · 가드(KB120 B 끄기 먼저) · 가드 없음(run:false · 같은 세션) · vi.confirm 소유 세션 · hub describe 「VI 계좌 소유 세션 원천 (GC-05 · 29-51)」 9건(Ready 프리페치 · 소유 뷰 밖 61 · 병합 3상태 · 켜진 우선 · 둘 다 켜짐 primary+warn · viRunningElsewhere · 72/73 · 56 · KB121 분리) | green |
| 〃 D-18 개정 | | 29-51 | (29-51-SUMMARY 「D-18 개정 기록」) | **VI 서버 축만 계좌 소유로 넓힘 · 증권사 축은 KB 그대로 · 교보 VI 무변경** — 근거(무수정 green): fanout-multi-session 29-20 「① 두 증권사 계좌 사용자 — … 교보는 24 만(21 · 34 · 43 은 KB)」 · hub 「GC-05 Ready 프리페치 — … 교보 세션은 24 만 · 교보 61 은 원천 아님」. 84 · 76/78 · 77 · 43 은 primary 원천 그대로 | green |
| **GC-06** | warning | 29-46 · 29-55 | `packages/shared/src/__tests__/order-server.test.ts` · `relay/tests/account-order-servers.test.ts` · `journal-push.test.ts` · `effective-owner-tracker.test.ts` · `order-server-resync.test.ts` · `webapp/src/components/admin/__tests__/account-editor.test.tsx` | resolveEffectiveOrderServer — 유효 주문 서버 규칙 한 벌 (29-46 GC-06) · createOrderServerRouting — 기본 서버에 없는 계좌는 유일 등록 서버 · 운영 모양 보존(지정 0 · 기본 서버에만 등록) · 29-46 GC-06 loaded · 트래커 「KB120 → KB121 … (GC-06 — 유일 등록 서버 유지)」 · resync ⑥ (GC-06) · Admin **GC-06 ×3 + 운영 보존 1**(1대 비기본 「(기본)」 없음 · 2대 기본 미등록 기본 칸 잠금 + 경고 · 지정 있으면 경고 없음 · 기본 등록 계좌 잠금 없음) | green |
| **GC-07** | warning | 29-50 | `relay/tests/pipelines.test.ts` · `journal-push.test.ts` | ⑧ (29-50 GC-07) 주소 변경 재생성 → 79 전부터 옛 매핑(잠정) · serversFor 전후 같음 · 새 79 교체 · ⑧-b 끄기 · 행 제거 벌은 잠정 아님 · 29-50 GC-07 seedProvisional | green |
| **GC-08** | warning | 29-50 | `relay/tests/effective-owner-tracker.test.ts` | GC-08 X → (없음) → Y (from KB121) · X → (없음) → X (move 0) · 기억 정리 | green |
| **GC-09** | warning | 29-52 | `relay/tests/order-server-resync.test.ts` · `strategy-sweeper.test.ts` | GC-09 해소 불가 4사유 지우기 + info · transient 는 남고 attempts +1 · backoff 60 · 120 · 240 · 480 · 상한 attempts 12(2시간 재시도 0 · 경고 유지 · 백스톱 1회) · ⑭(120초 갱신) · sweeper GC-09 discard · staleRetryDelayMs 표 · knowsServer | green |
| **GC-10** | warning | 29-48 | `relay/tests/admin-api.test.ts` | describe 「재적재 대기 상한 (29-48 GC-10)」 — G1 무응답 재적재 마감 안 200 · G2 빠른 재적재 종전 순서 · G3 DELETE user 두 대기 · G4 PUT order-server · G5 재적재 거부 · M1 마감 describe 무수정 | green |
| **GC-11** | info | 29-52 | `relay/src/ws/fanout.ts` (주석) | `grep -c '다시 켠 전략 수렴'` = 0 · `grep -c GC-11` = 2 (이번 실행에서 재확인) | green |
| **GC-12** | info | 29-52 | `relay/tests/order-server-resync.test.ts` · `webapp/…/workbench-status-bar.test.tsx` | GC-12 — 여러 옛 서버 미확인 → 상태 프레임 { KB120, 3, otherServers [KB122] } · count null · 키 없음 · 작업대 GC-12 ×3(문구 상수 · 「외 1개 서버」 · 종전 문구) | green |
| **GC-13** | info | 29-55 | `relay/tests/order-api.test.ts` | GC-13 ×3 — 꺼진 서버 지정 { …, alerting: false, disabled: true } · 끄지 못한 전략만 · 미주입 종전 · 비면 최상위 키 없음 | green |
| **GC-14** | info | 29-45 | `relay/tests/order-server-resync.test.ts` · `strategy-sweeper.test.ts` | **⑳ GC-14** 지정 해제(되돌아옴) → KB120 14 · 11 0 · skippedAccounts [A] · 확인 기록 없음 · sweeper GC-14 (29-45) ×3 | green |
| **GC-15** | info | 29-48 | `supabase/ops/29-orphan-dma-users.sql` (주석) | 머리 실행 수단 = 대시보드 SQL 편집기 · REST `Prefer: count=exact` · `db query` 0회(이번 실행에서 재확인) | green |
| **N-01** | warning | 29-54 | `relay/tests/fanout-multi-session.test.ts` | **N-01 (29-54) 트레이서 — 전부 정지(빈 키)는 KB120 · KB121 두 세션에 빈 키 14 각 1 · 브라우저 strategies.disabled 정확히 1건 { count 2 }** · **운영 보존 — KB120 + KYOBO119 사용자의 전부 정지는 오늘과 같다**(KB 14 = 1 · 교보 14 = 0 · { count 1 }) · **부분 실패** — KB121 65 없음 → 1건 + msg ERROR(KB121) · KB121 미준비 → 같은 ERROR | green |
| 〃 | | 29-54 | `relay/tests/hub-multi-session.test.ts` · `strategy-sweeper.test.ts` | describe **「전부 정지 집계 (29-54 · N-01)」** 8건 — 두 65 뒤 1건 · 시한 · 답 0 · **대여 중 sweeper 65 집계 0 (두 순서)** · user 꼬리표 65 팬아웃 1 · 결선 안 된 세션 · 분리/교체/closeAll · 30초 꼬리표 버림 · sweeper N-01 noteDisableSent | green |
| 〃 운영 확인 | | 29-54 | (29-54-SUMMARY 「운영 확인 기록」) | **교보 범위는 오늘 그대로** — 대상은 primary 와 같은 증권사 세션뿐. KB · 교보 둘 다 가진 사용자의 교보 세션에는 오늘도 14 가 닿지 않는다(교보만 가진 사용자는 종전대로 KYOBO119 primary) — 위 「운영 보존」 케이스가 근거 | green |

**판정: GC-01~15 · N-01 16행 전부 근거 있음 · 전부 green.**

## Task 2 에 함께 올린 알려진 사항 (go/no-go 판단 재료 — 근거 표의 결함은 아님)

1. **시각.** Task 1 종료 **2026-10-11(일) 11:29 KST.** 플랜 precondition 은 「지금 시각이 20:00 KST 이후」 다. 오늘은 일요일이라 장이 없고 다음 장은 10-12(월) 08:00 KST(증권사 세션 07:00) — 29-41 은 같은 일요일 02:49 를 「10-10(토) 20:00 이후 · 무거래 창」 으로 읽어 진행했다. **지금(일요일 낮) 열지 · 오늘 20:00 이후에 열지는 사용자 결정**(플랜 문구 그대로면 20:00 이후).
2. **push 범위.** `origin/master..HEAD` = **69 커밋**(이 SUMMARY 커밋 전 · 작성자 전부 `deepblue-1`). 29-41 docs 2(`371fc8ba` · `9c64948e`) · UI 감사 docs(`d1c30b07`) · 3라운드 플랜(`fb41305b`) · 29-45~29-55 실행 커밋 · 이 플랜 `9d78a24a`. **Phase 29 밖 1건: `4970c3ae` relay: StockDMA 스키마 재생성**(상따 금액 8필드 vtable 158~172 · UserSettings 28 — gh-trade **미병합 브랜치** `feature/limitchaser-amount-unit` 983bd924 기준 · `relay/src/generated/` 3파일만). 생성물 밖 relay · shared · webapp 코드가 새 필드를 쓰지 않는다(grep 0) → relay 는 그 필드를 싣지 않아 동작이 오늘과 같다. 다만 **relay 이미지에 미병합 브랜치 기준 생성물이 들어간다** — gh-trade 병합 뒤 마커가 바뀌면 재동기화 필요(인박스 `261011-limitchaser-amount-unit.md` · untracked · status open — 다른 세션 소관).
3. **server 는 재배포하지 않는다 — shared 변경 영향 확인.** server 소스 변경 0 이지만 server 이미지는 shared 를 번들한다. 이번 라운드 shared 변경(29-46 `order-server.ts` 신규 · 29-47 `admin.ts` `sameValues` 의 IP/MAC 조건 비교 · 29-52 `relay.ts` 타입) 중 server 가 쓰는 것은 `deriveAdminUsersOverview → sameValues` 뿐이다. 새 비교는 「의도에 orderIp/orderMac 이 있을 때만」 인데 DB 의도는 두 필드를 갖지 않으므로 옛 server(00060)의 4필드 비교와 결과가 같다(29-47 `admin-overview.test.ts` 무수정 green). 운영 server 를 그대로 두어도 Admin 개요 반영 판정은 같다.
4. **지금 운영에서 실제로 달라지는 것**(플랜 Task 2 context): GC-07(서버 주소 편집 시 사용자 끊김 없음) · GC-10(Admin 응답 마감 · 502 없음) · GC-02(gh-trade 가 KB 서버에 IP/MAC 을 넣어도 웹 계좌 편집이 보존) · webapp GC-06(Admin 계좌 줄 진짜 주문 서버) · GC-12(「외 N개 서버」). 나머지 GC-01 · 03 · 04 · 05 · 08 · 09 · 14 · N-01 은 지정 0 · 두 번째 서버 꺼짐이라 잠복(각 플랜 「운영 보존」 케이스 green — 「전부 정지」 는 대상 1개라 오늘 경로 그대로, 교보에는 오늘처럼 닿지 않는다).
5. **동시 세션 미커밋 변경.** 이 실행 중 다른 세션이 `infra/relay/startup.sh`(+16/−7) · `infra/relay/README.md` · `docs/dma-tunnel-guide.md` 를 수정 중이다(미커밋 · 이 플랜 변경 아님 · 손대지 않음). relay 배포는 **detached worktree 에서** 해야 그 변경이 이미지 · VM 시작 스크립트에 섞이지 않는다(런북 0단계). 그 세션이 커밋하면 push 범위가 늘어나므로 push 직전 범위를 다시 본다.
6. **51 OrderResp 계좌 필터 공백 · (가) 실서버 실증** — 아래 「두 번째 서버 켜기 전 결정」. 이번 배포 go 의 조건은 아니다.

## 두 번째 서버(KB121 · KYOBO127) 켜기 전 결정 — 미결 · 사용자 결정

이번 배포 go 의 조건이 아니었다(지정 0 · 두 번째 서버 꺼짐이라 잠복). 배포 뒤에도 그대로 남는다 — 켜기 **전에** 정한다.

1. **51 OrderResp 계좌 필터 공백 (29-35 D7 · 29-VERIFICATION-R2 human 5)** — `OrderResp` 에 계좌 칸이 없어 비소유 서버 세션의 51 을 relay 가 거를 수 없다. 끄기 전 · 끄기 미확인 구간에 옛 서버 체결 통보 토스트가 보일 수 있다. 감수할지, gh-trade 에 `OrderResp.account_no` 를 요청할지(gh-trade-84 ④ 「와이어 변경 불필요」 와 충돌) — **미결 — 사용자 결정.**
2. **(가) 실서버 실증 (29-VERIFICATION-R2 human 1)** — 두 번째 서버를 무거래 창에 켜고 테스트 계좌 하나의 주문 서버를 바꿔 옛 서버 전략 끄기 → 1012 → 재접속 → 25 → 66 · 두 계좌 연달아 변경 시 탭 세션 5분 뒤 생존을 relay 로그 · 작업대 상태줄로 본다. 부팅 결선(트래커 기준선 · resync · 60초 재시도)은 통합 테스트가 없다 — **미결 — 사용자 결정.**
3. (참고 · 목록만) 라이트 테마 경고 문구 대비(UI-REVIEW-R2 Fix 1 · 29-VERIFICATION-R2 human 6) — 「끄지 못했어요」 · 꺼진 지정 경고가 라이트 `#ff9f1a` 11~12px. 이번 라운드 범위 밖 · 게이트 아님.

(N-01 「전부 정지」 다중 세션은 29-54 가 고쳐 이 목록에 없다 — 처분 표 N-01 행 fixed.)

## Task 3 런북 — 메인 세션 (실제 값 · 순서 고정 · 앞 단계 실패면 멈춤)

> Task 1 이 작성한 런북 원문이다(기록 보존). 실제 실행 결과는 아래 「Task 3 — 배포 창 결과」. 배포 worktree 는 런북의 `/private/tmp/gh-radar-deploy-2953` 대신 세션 scratchpad 의 `relay-deploy`(detached @`183ea9c8`)였다.

공통: `export GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json CLOUDSDK_CORE_PROJECT=gh-radar`. 배포 명령은 허용 규칙 접두사 그대로(`yes |` · 출력 파이프 금지). Secret · 서비스 키는 변수로만(출력 금지).

**0. 시각 · 트리 · 배포 worktree**
```bash
date                                                       # 20:00 KST 이후(또는 사용자가 Task 2 에서 정한 무거래 창)
cd /Users/alex/repos/gh-radar && git status -sb
git status --porcelain --untracked-files=no                # Task 1 시점: " M .planning/state.json"(오케스트레이터) + 다른 세션 미커밋 3파일(알려진 사항 5)
git log --format='%h %an %s' origin/master..HEAD | wc -l   # SUMMARY 초안 커밋 뒤 70 — 늘었으면 새 커밋을 먼저 본다
git worktree add --detach /private/tmp/gh-radar-deploy-2953 HEAD && cd /private/tmp/gh-radar-deploy-2953
```

**1. 이전 relay 태그 기록**
```bash
curl -s https://dma.jx1.io/healthz | jq -r .version        # Task 1 시점(11:16 KST) = 5d4ea4a5 → 롤백 대상
```

**2. DB · server 단계 없음** — `NO_DB_SERVER_CHANGE`(d1c30b07 · 5d4ea4a5 기준 둘 다). schema push · pgTAP · `deploy-server.sh` 를 하지 않는다(server 는 `gh-radar-server-00060-gjj` 그대로 — 알려진 사항 3).

**3. relay** (배포 worktree 에서 · 실행 중 `DMA_REGISTRY_SOURCE=db` 라 `--registry-cutover` 없이 열린다)
```bash
GCP_PROJECT_ID=gh-radar SUPABASE_URL=<운영 URL — 라이브 server env> NOTIFICATION_CHANNEL_ID=projects/gh-radar/notificationChannels/14409521670382124894 bash scripts/deploy-relay.sh
curl -s https://dma.jx1.io/healthz | jq '{status, version, journal: .journal.state, brokers, adminConns, accountOrderServers}'
curl -s https://dma.jx1.io/healthz | jq -e '.brokers.KB.server == "KB120" and .brokers.KYOBO.server == "KYOBO119" and .adminConns.KB120.state == "ready" and .adminConns.KYOBO119.state == "ready" and .accountOrderServers == null'
bash scripts/smoke-relay.sh
```
- 기대: `version` = 배포 커밋 short SHA(이 SUMMARY 커밋 해시 · 그 뒤 커밋이 있으면 그 SHA) · journal live · `brokers.KB.server = KB120` · `brokers.KYOBO.server = KYOBO119` · adminConns 둘 ready · **`accountOrderServers` 키 없음**(지정 0 · 끄지 못한 계좌 0 — GC-13 의 `disabled` 항목도 비면 키 생략) → `jq -e` true.
- smoke 기대: **PASS 11 · FAIL 0 · SKIP 2**(INV-9 토큰 없음 · INV-10 서비스 키 없음) — 29-41 과 같음(`smoke-relay.sh` 변경 0).
- 막히면 8단계 롤백 · push 하지 않는다.

**4. push (= webapp 프로덕션)**
```bash
cd /Users/alex/repos/gh-radar && git status -sb                       # 남의 로컬 커밋 · 미커밋 재확인
git log --format='%h %an %s' origin/master..HEAD                      # 범위를 사용자에게 보이고 확인(Phase 29 밖 4970c3ae 포함 — 알려진 사항 2)
git push
```
- Vercel production Ready(커밋 해시 일치) · `https://gh-radar-webapp.vercel.app/login` 200. webapp 변경은 Admin 계좌 줄 주문 서버(GC-06 · 29-55) · 작업대 「외 N개 서버」(GC-12) 둘.

**5. 운영 확인 (사용자)** — /admin/users: 계좌 줄 「주문 서버」 가 「기본 · KB120」 세그먼트 또는 「주문 서버 KB120(기본)」(지정 0 · 등록 1대 = 기본 서버) · 경고 줄 없음. /admin/servers: 「끄지 못한 전략」 줄 없음. /trading: 상태줄 정상(계좌 필 서버 꼬리표 · 서버 칩 · 경고 · 안내 줄 없음) · 상따 · VI 카드 · 주문 정상(VI 카드 두 거래소 값이 배포 전과 같다).

**6. 사람 확인 (29-VERIFICATION-R2 human 2 · 3)**
- ① 고아 점검: `supabase/ops/29-orphan-dma-users.sql` 전체를 Supabase 대시보드 SQL 편집기에서 실행(읽기 전용 SELECT 1개) → 행 수 · 마스킹 DMA id(`앞 2글자***(길이)`). 행이 있으면 정리는 사용자 결정 — 지우지 않는다.
- ② /pending: app_users 에 없는 Google 계정으로 로그인 → 스캐너 · 뉴스 · 종목 경로 모두 /pending · 안내 한 줄 + 이메일 + 로그아웃 1개 — **폰(390) · 데스크톱 · Admin 승인 뒤 다음 이동에서 홈, 세 결과를 각각.**

**7. gh-trade 알림 (보조 — 인박스 노트가 정본)**: 「relay 가 87 의 order_ip/order_mac 을 op 3 에 되실어 보존(배포됨) — KB 서버에 값을 설정해도 웹 계좌 편집이 지우지 않음 · 웹 입력칸은 후속」. 보내지 않았으면 「미송신」.

**8. 롤백 (막히면)**
- **relay:** 이전 태그 `5d4ea4a5` 는 레지스트리 시대 이미지라 `deploy-relay.sh --rollback` 으로 되돌릴 수 없다(`--rollback` 은 레거시 env 모드 전용 — `infra/relay/README.md` 182-183행). 정본 = 그 커밋 detached worktree 에서 정상 배포:
  ```bash
  git worktree add --detach /private/tmp/gh-radar-rollback-relay 5d4ea4a5 && cd /private/tmp/gh-radar-rollback-relay
  GCP_PROJECT_ID=gh-radar SUPABASE_URL=<운영 URL> NOTIFICATION_CHANNEL_ID=projects/gh-radar/notificationChannels/14409521670382124894 bash scripts/deploy-relay.sh
  curl -s https://dma.jx1.io/healthz | jq '{version, journal: .journal.state, brokers, adminConns}'   # version 5d4ea4a5
  ```
  (`5d4ea4a5` 는 HEAD 조상 — 확인함. 1단계에서 읽은 태그가 다르면 그 태그로.)
- **DB 변경 없음 · server 변경 없음** — 되돌릴 것 없다.
- **push 전이면 push 하지 않는다.** push 뒤 webapp 되돌림은 revert 커밋 push.

## 저장소 상태 (Task 1 시점 · 11:29 KST)

- `git status --porcelain --untracked-files=no` → ` M .planning/state.json`(오케스트레이터) · ` M docs/dma-tunnel-guide.md` · ` M infra/relay/README.md` · ` M infra/relay/startup.sh`(다른 세션 — 알려진 사항 5). 이 플랜 변경은 `9d78a24a` 로 커밋됨.
- `git log --format='%h %s' origin/master..HEAD` → **69 커밋**(`9d78a24a` 포함 · 이 SUMMARY 커밋 전) — Phase 29 밖은 `4970c3ae` 1건.

## 실행 경계 기록

- **Task 1 executor 가 실행한 것:** verify 1~4(순차 · 한 번에 하나) · P20-3 단독 실행(기록용) · 케이스 이름 grep · 공개 healthz GET(읽기 전용) · `deploy-relay.sh --self-test`(오프라인) · 처분 표 · 인박스 편집 · 경로 지정 커밋 `9d78a24a`.
- **Task 1 executor 가 실행하지 않은 것:** `deploy-relay.sh`(self-test 외) · `deploy-server.sh` · `git push` · gcloud 쓰기 · Secret 읽기 · `supabase db push` · 원격 SQL · STATE/ROADMAP 완료 갱신(플랜 미완료).
- **메인 세션이 실행한 것(Task 3):** detached worktree 생성 · `deploy-relay.sh`(정상 배포 1회) · healthz 확인 · `smoke-relay.sh` · `git push origin master` · Vercel 상태 확인 · worktree 제거. `deploy-server.sh` · `supabase db push` · 롤백 없음.
- **이어받기 executor 가 실행한 것:** 공개 healthz `jq -e` 1회(읽기 전용) · `requirements.ready-ids` · SUMMARY/STATE/ROADMAP 편집 · 경로 지정 커밋. 배포 · push · db push 없음.

## Task 2 — go/no-go 결정

| 항목 | 값 |
|---|---|
| 선택 | **`go` — 지금 (일요일 무장 창)** |
| 근거 표 판정 | GC-01~15 · N-01 **16행 전부 green · 「근거 없음」 0 · red 0** |
| 결정 시각 | 2026-10-11(일) **11:33 KST 무렵**(사용자 AskUserQuestion 답) |
| 시각 해석 | 플랜 precondition 「20:00 KST 이후」 는 장 마감 뒤 무거래 창을 뜻한다. 오늘은 일요일이라 장이 없고 다음 장은 10-12(월) 08:00 KST — 29-41 선례와 같이 **사용자가 일요일 낮을 무거래 창으로 정했다**(알려진 사항 1). |

`go` 이므로 Task 3 을 실행했다.

## Task 3 — 배포 창 결과

메인 세션 실행 · 결과 원문은 메인 세션 기록(scratchpad `29-53-task3-results.md`) — 아래는 그 값을 옮긴 것이다.

| 단계 | 결과 |
|---|---|
| **0. 시각 · 트리 · 배포 worktree** | 11:34 KST · master ahead 71(작성자 전부 `deepblue-1`) · 다른 세션 미커밋 3~4파일(`infra/relay/*` · `docs/dma-tunnel-guide.md`) → **detached worktree(scratchpad `relay-deploy` @`183ea9c8`)에서 배포**. 끝난 뒤 worktree remove |
| **1. 이전 relay 태그** | **`5d4ea4a5`** — healthz status ok · journal live · KB=KB120 · KYOBO=KYOBO119 |
| **2. DB · server** | 단계 없음(`NO_DB_SERVER_CHANGE`) — server `gh-radar-server-00060-gjj` 그대로 |
| **3. relay** | `GCP_PROJECT_ID=gh-radar SUPABASE_URL=… NOTIFICATION_CHANNEL_ID=… bash scripts/deploy-relay.sh` → **`relay:183ea9c8` 배포 완료(약 3분)** · 레지스트리 모드 `DMA_REGISTRY_SOURCE=db` · 컨테이너 70.8MiB/384MiB |
| 3. healthz 발췌 | `{"status":"ok","version":"183ea9c8","journal":"live","accountOrderServers":null}` · `brokers` KB=**KB120** · KYOBO=**KYOBO119** · `adminConns` KB120 · KYOBO119 **ready** · `journal.mapping.provisional=false`(KB rows 3 · KYOBO119 rows 2) |
| 3. `jq -e` 보존 확인 | **true** |
| 3. smoke | `bash scripts/smoke-relay.sh` → **PASS 11 · FAIL 0 · SKIP 2**(INV-9 토큰 없음 · INV-10 서비스 키 없음) — 런북 기대값과 같음 |
| **4. push** | `git push origin master` **`5d4ea4a5..183ea9c8`(71커밋 · Phase 29 밖 `4970c3ae` 포함)** → Vercel 프로덕션 **`gyzqjcxad`(githubCommitSha=`183ea9c8`) Ready 2분** |
| 4. 뒤이은 다른 세션 push | 11:37 다른 세션이 `46d4ff80` 「fix(relay): WireGuard 등록 피어 전원에 KB 120·121 · 교보 112·119·127 개방」 을 `183ea9c8` 위에 push → 프로덕션 alias(`trade.jx1.io`)는 그 커밋 빌드 **`3zyzab2f2` Ready** — `183ea9c8` 포함(ancestor 확인) · `/login` 200. `46d4ff80` 은 `infra/relay/startup.sh` · WireGuard 템플릿 · README · `scripts/setup-relay-iam.sh` · 문서만 바꾼다(relay 이미지 소스 · webapp 소스 변경 0) — 이 플랜 밖, VM 반영은 그 세션 소관 |
| **5. 운영 확인 (사용자)** | **통과** — /admin/users 주문 서버 「기본 · KB120」 · 경고 없음 · /admin/servers 「끄지 못한 전략」 줄 없음 · /trading 상태줄 · 상따 · VI · 주문 정상(사용자 보고 2026-10-11) |
| **6-① 고아 점검** | **통과(행 수 미보고)** — `supabase/ops/29-orphan-dma-users.sql` 실행 통과(사용자 보고 「1~3 통과」). 행 수는 개별 보고되지 않았다 — 「정리 대상 0」 으로 간주하지 않는다 |
| **6-② /pending** | **통과** — 폰 · 데스크톱 · Admin 승인 뒤 다음 이동에서 홈, 세 결과 모두 통과(사용자 보고 「1~3 통과」) |
| **7. gh-trade 알림** | **미송신** — 사용자 결정: 관련 작업(웹 IP/MAC 입력칸 · 인박스 질문 3개)은 마일스톤 마무리 뒤 다시 진행하므로 보류. 인박스 `261010-kb-order-ip-mac.md` **status open 유지** |
| **8. 롤백** | **하지 않음** |

**이어받기 executor 재확인 (Task 3 automated verify · 읽기 전용):** 2026-10-11 **12:10 KST** `curl -s https://dma.jx1.io/healthz | jq -e '.brokers.KB.server == "KB120" and .brokers.KYOBO.server == "KYOBO119" and .adminConns.KB120.state == "ready" and .adminConns.KYOBO119.state == "ready" and .accountOrderServers == null'` → **`true` (exit 0)**. 발췌 `{"status":"ok","version":"183ea9c8","journal":"live","kb":"KB120","ky":"KYOBO119","a120":"ready","a119":"ready","aos":null}` — 배포 약 35분 뒤에도 교보119 · KB120 운영 보존.

**배포 뒤 운영에서 달라진 것:** GC-07(서버 주소 편집 시 사용자 끊김 없음) · GC-10(Admin 응답 마감 · 502 없음) · GC-02(gh-trade 가 KB 서버에 IP/MAC 을 넣어도 웹 계좌 편집이 보존 — gh-trade 에는 아직 알리지 않음) · webapp GC-06(Admin 계좌 줄 진짜 주문 서버) · GC-12(「외 N개 서버」). GC-01 · 03 · 04 · 05 · 08 · 09 · 14 · N-01 은 지정 0 · 두 번째 서버 꺼짐이라 잠복.

## 요구사항 추적

`requirements.ready-ids` 게이트는 ADMIN-12 · ADMIN-06 · ADMIN-05 · ADMIN-03 을 **4/4 ready** 로 냈다. 그러나 이 플랜 context 의 플래그 가정(「자동 해소 아님 — REQUIREMENTS 상태 전환은 재검증 몫」)과 29-40 이 등록한 규칙(Traceability 「Pending — 29 갭 클로징(29-27~29-44) 재검증 대기」)에 따라 **REQUIREMENTS.md 는 손대지 않는다 — ADMIN-01~12 Pending 유지, Complete 판정은 재검증(R3) 몫.** frontmatter `requirements-completed` 는 플랜 requirements 를 그대로 옮긴 것(템플릿 규칙 · 29-41 선례 — 29-41 에서는 `mark-complete` 가 같은 상태 칸 때문에 not_found 로 쓰지 않았다).

## Deviations from Plan

**1. [기록] 플랜 메모 「29-REVIEW-R2-DISPOSITION.md 는 git 미추적」 은 실행 시점에 이미 추적 파일이었다.** 경로 지정 커밋으로 갱신만 했다(동작 차이 없음).

**2. [런북 정정] 롤백 명령.** 플랜 action ⑥ 의 `bash scripts/deploy-relay.sh --rollback <태그>` 는 이번 이전 태그 `5d4ea4a5`(레지스트리 시대 이미지)에 맞지 않는다 — 29-41 Deviation 2 와 같은 이유. 런북 8단계에 detached worktree 정상 배포를 적었다. 코드 · 스크립트는 바꾸지 않았다.

**3. [기록 · 사용자 결정] 배포 시각.** Task 3 precondition 「20:00 KST 이후」 대신 2026-10-11(일) 11:34 KST 에 배포 창을 열었다 — 사용자가 Task 2 에서 「go — 지금 (일요일 무장)」 을 골랐다(장 없음 · 다음 장 10-12 08:00). 29-41 선례와 같은 무거래 창 해석. executor 판단이 아니라 사용자 결정이다.

**4. [기록] 배포 worktree 경로.** 런북 0단계 `/private/tmp/gh-radar-deploy-2953` 대신 세션 scratchpad `relay-deploy`(detached @`183ea9c8`)에서 배포했다. 목적(다른 세션 미커밋 변경을 빌드 컨텍스트에서 분리)은 같다.

**5. [기록 · 사용자 결정] gh-trade 알림 미송신.** 런북 7단계는 보조 알림이다(인박스 노트가 정본). 사용자가 관련 작업(웹 IP/MAC 입력칸 · 인박스 질문 3개)을 마일스톤 마무리 뒤로 미뤄 보내지 않았다 — 인박스 `status: open` 그대로.

**6. [기록] REQUIREMENTS.md 미갱신.** `requirements.ready-ids` 4/4 ready 였으나 플랜 context 플래그 가정 · 29-40 규칙대로 상태 전환을 재검증에 남겼다(위 「요구사항 추적」).

**Total deviations:** 6 (기록 4 · 런북 정정 1 · 사용자 결정 기록 포함) — 코드 · 테스트 수정 0, 회귀 수정 커밋 0.

## Issues Encountered

- 회귀 실패 0(게이트 범위). P20-3 단독 실행 실패는 KNOWN-PRE-EXISTING(Phase 29 밖) — 기록만.
- 다른 세션의 미커밋 변경 3파일이 실행 중 나타났다(알려진 사항 5) — 손대지 않음 · 스테이징하지 않음. 그 세션은 배포 직후 `46d4ff80` 으로 커밋 · push 했다(relay 이미지 · webapp 소스 변경 없음 — 이 플랜 밖).
- 고아 점검 행 수가 보고되지 않았다 — 「통과」 로만 기록(정리 대상 0 으로 간주하지 않음). 재검증이 수치를 원하면 같은 SQL 을 다시 돌려 행 수를 받는다.
- relay 이미지에 gh-trade 미병합 브랜치 기준 생성물(`4970c3ae`)이 들어갔다(알려진 사항 2) — 동작 영향 없음. gh-trade 병합 뒤 마커가 바뀌면 재동기화(인박스 `261011-limitchaser-amount-unit.md` · 다른 세션 소관).

## Next Phase Readiness

- Phase 29 의 55개 플랜이 전부 SUMMARY 를 가졌다 — 다음은 **재검증(R3)**. 처분 표 `29-REVIEW-R2-DISPOSITION.md`(16행 fixed · N-01 행 포함)로 추적하고, ADMIN-01~12 의 Complete 판정도 재검증 몫이다.
- G-1 첫 실사용(두 번째 서버 KB121 · KYOBO127 켜기 · 계좌 지정 변경)은 위 「켜기 전 결정」 2건(51 OrderResp · (가) 실서버 실증)을 사용자가 닫은 뒤.
- 마일스톤 마무리 뒤 재개: 인박스 order-ip-mac 웹 IP/MAC 입력칸(항목 4) · 인박스 질문 3개 · gh-trade 알림.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11 (Task 1 executor 11:29 KST · 배포 창 메인 세션 11:34 KST · 마무리 이어받기 executor 12:11 KST)*

## Self-Check: PASSED

- 파일: 29-53-SUMMARY.md · 29-REVIEW-R2-DISPOSITION.md · 261010-kb-order-ip-mac.md — FOUND.
- 커밋: `9d78a24a`(Task 1) · `4b719a5c`(SUMMARY 초안) · `183ea9c8`(초안 자기 점검 · 배포 커밋) · 롤백 태그 `5d4ea4a5` — 전부 HEAD 조상.
- Task 3 automated verify: 공개 healthz `jq -e` → true(12:10 KST · version `183ea9c8`).
- Task 2 수용 기준: 선택 `go` · 근거 표 판정(16행 green) · 결정 시각 있음. Task 3 수용 기준: 이전/새 태그 · healthz 발췌 · smoke 수 · push 해시 · 운영 확인 · 고아 점검(행 수 미보고 그대로) · /pending 세 결과 · gh-trade 알림 여부 · 롤백 없음 — 전부 있음. 「켜기 전 결정」 에 51 OrderResp · (가) 실증이 「미결 — 사용자 결정」 · N-01 없음.
