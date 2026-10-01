---
phase: 26-shared-quote-feed
plan: 15
subsystem: 배포 · relay · webapp
tags: [deploy, relay, quote-feed, gate, schema-sync, healthz, vercel, rollback]
# Task 1(해소) · Task 2(준비 게이트 green) · Task 3(배포 · 리뷰 수정 재배포 · 첫 거래일 UAT) 완료 — 2026-10-01 마감.
status: complete

requires:
  - phase: 26-14
    provides: "배지 2축(시세 · 주문 필) webapp 구현 — push 대기 커밋"
  - phase: 26-12
    provides: "/healthz quote 7키 · 503 축(장중 60초 · 거부 즉시)"
provides:
  - "Task 1 증거 — KB 120 가동 빌드 c1af966a(2026-09-30 20:38:49 KST 기동) ⊃ ed2e0240"
  - "배포 준비 게이트 green @ 47fc9934 — 생성물 최신 · build/typecheck · 단위 relay 881 · webapp 3140 · shared 249 · e2e 7 spec 131 passed"
  - "Task 3 절차 · 롤백 명령(직전 태그 후보 81f51ca7) · /healthz 기대 본문"
  - "프로덕션 relay f07f5fbd → 1b65d813(리뷰 수정 WR-01~05 포함) · webapp push · 첫 거래일 UAT (a)~(e) pass"
affects: [26-verification, gh-trade-phase-26]

# Actuals (#2632 · #3968) — commits 는 측정값(rev-list plan_head_before..HEAD, 이 초안 docs 커밋 전).
# 준비 게이트는 코드 변경 없음(재생성 0) — docs 전용이라 0 이 정상. tokens = 이 SUMMARY chars/4.
actuals:
  tokens: 4077
  tasks: 2
  commits: 0
plan_head_before: 47fc99341f210df68187bc4ee222364036cb22db

tech-stack:
  added: []
  patterns:
    - "배포 전 공개 /healthz 읽기 전용 조회로 가동 relay 버전(=롤백 태그 후보)을 교차 확인"

key-files:
  created:
    - .planning/phases/26-shared-quote-feed/26-15-SUMMARY.md
  modified: []

key-decisions:
  - "생성물 --check 0 개 · .fbs 최신 — relay/src/generated 재생성 없음(gh-trade HEAD 4f852bd6 기준)"
  - "롤백 태그 후보 81f51ca7(공개 healthz version) — 메인 세션이 배포 직전 docker inspect 로 확정"
  - "e2e 게이트는 알려진 deferred 3건 제외 실행으로 판정 · 원본 실행 실패는 그 3건의 serial 연쇄뿐"

requirements-completed: []

coverage:
  - id: D1
    description: "Task 1 — KB 120 가동본 c1af966a 가 ed2e0240 포함(merge-base --is-ancestor 「포함」)"
    verification:
      - kind: other
        ref: "git -C /Users/alex/repos/gh-trade merge-base --is-ancestor ed2e0240 c1af966a && echo 포함"
        status: pass
    human_judgment: true
    rationale: "가동 빌드 해시(c1af966a)는 gh-trade 세션의 SSH 읽기 결과 전언이다 — 저장소에서 자동 재현할 수 없다"
  - id: D2
    description: "배포 준비 게이트 — 생성물 최신 · build/typecheck · 단위 3 패키지 · e2e 7 spec green @ 47fc9934"
    verification:
      - kind: other
        ref: "gh-trade/server ./scripts/sync-relay-schema.sh --check (신규/변경 예정 0 개 · .fbs 최신)"
        status: pass
      - kind: unit
        ref: "pnpm relay test 881 · webapp test 3140(1 skipped) · shared vitest 249"
        status: pass
      - kind: e2e
        ref: "playwright 7 spec --grep-invert '5\\. 격자 1/2/3단|P20-3 최악값|16px 다' → 131 passed"
        status: pass
    human_judgment: false
  - id: D3
    description: "Task 3 프로덕션 배포(relay → smoke · healthz · 서버 로그 → push → Vercel) · 첫 거래일 UAT"
    verification:
      - kind: other
        ref: "deploy-relay.sh f07f5fbd · smoke-relay.sh PASS 12 · FAIL 0 · SKIP 1 · 공개 /healthz quote ready"
        status: pass
      - kind: other
        ref: "공개 /healthz 2026-10-01 12:00 KST — version 1b65d813 · quote ready · keyCount 5 · reconnects 0 · subLimitRejects 0"
        status: pass
      - kind: manual
        ref: "첫 거래일 장중 UAT (a)~(e) · 운영 화면 2축 필 · 리뷰 수정 WR-01·03·04 실측 — 사용자 pass(2026-10-01)"
        status: pass
    human_judgment: true
    rationale: "장중 체감 · 두 사용자 화면 대조 · 로그인 화면 육안 확인은 사용자 판정이다"

duration: 16min
completed: 2026-10-01
---

# Phase 26 Plan 15: 배포 — 준비 게이트 · 프로덕션 배포 · 첫 거래일 UAT Summary

**KB 120 가동본 `c1af966a` 가 `ed2e0240` 을 포함함을 확인했다. HEAD `47fc9934` 에서 생성물(0 변경) · build · 단위(relay 881 · webapp 3140 · shared 249) · e2e 7 spec(131 passed)이 모두 green 이다. 메인 세션이 이 절차로 relay(`f07f5fbd` → 리뷰 수정 뒤 `1b65d813`)와 webapp 을 배포했고, 2026-10-01 첫 거래일 UAT (a)~(e) 를 사용자가 pass 로 판정했다.**

## Performance

- **Duration:** 16 min (Task 2 게이트)
- **Started:** 2026-09-30T22:36:23Z (2026-10-01 07:36 KST)
- **Completed:** 2026-09-30T22:52:28Z (2026-10-01 07:52 KST)
- **Tasks:** 3 / 3
- **Files modified:** 1 (이 SUMMARY)

## Task 1 — gh-trade 120 가동본 ed2e0240 포함 확인 (RESEARCH A11 · 해소됨)

2026-10-01 00:5x KST, 오케스트레이터가 처리했다. 사용자가 확인을 맡겼고, gh-trade 세션 「릴레이서버 시세 팬아웃 지원」 이 SSH 로 **읽기만** 해서 확인했다. 재시작 · 배포는 하지 않았다.

| 항목 | 증거 |
|---|---|
| KB 120 가동 빌드 | **`c1af966a`**. `bin/stock-dma-server.version` = `c1af966a`(파일 시각 2026-09-30 20:38:30), 바이너리 mtime 20:38:21. 직전 빌드는 `backup/stock-dma-server.fd3ac5ae.20260930-203829` 로 백업돼 있다 |
| 가동 프로세스 = 그 바이너리 | `systemctl` active since 2026-09-30 20:38:49 KST(MainPID 61376). 바이너리 교체 뒤에 기동했다 |
| 기동 로그 | 20:38:50 저널 관찰자(10.41.1.124 `gh-radar-relay`, since=3400, resync=false)가 다시 붙었다. quote 로그인은 아직 없다(현 relay `81f51ca7` 은 quote 연결이 없는 구버전이라 정상) |
| ed2e0240 포함 | `git -C /Users/alex/repos/gh-trade merge-base --is-ancestor ed2e0240 c1af966a && echo 포함` → **포함**. 오케스트레이터가 확인했고, 이 executor 가 2026-10-01 07:36 KST 에 다시 돌려 같은 결과를 얻었다 |
| gh-trade STATE 행 | 260930-kg3 의 「120·127 미배포」 는 커밋 시점에 적힌 낡은 기록이다. 가동본은 위 증거가 정본이다 |
| 127(교보) | 다시 확인하지 않았다. quote 대상이 아니다(Deferred) |
| 배포 창 | **2026-10-01 00:50 KST 이후**(장 시간 08:00~20:00 밖). 이 게이트가 끝난 뒤 메인 세션이 배포한다. ⚠ 게이트 완료 시각이 07:4x KST 라서 **08:00 장 시작이 가깝다.** 08:00 전에 relay 교체와 검증을 끝낼 수 없으면 오늘 20:00 KST 이후로 미룬다 |

오케스트레이터가 HEAD `47fc9934` 에서 먼저 돌린 게이트: shared build + relay typecheck + typecheck:tests + webapp typecheck 종료 0 · relay 35 files / 881 passed · webapp 140 files / 3140 passed(1 skipped) · shared 14 files / 249 passed.

## Task 2 — 배포 준비 게이트 (배포하지 않음)

기준 커밋: **`47fc9934`**(HEAD — 오케스트레이터 게이트 뒤로 움직이지 않았다). 실행: 2026-10-01 07:36 KST~.

### ① 생성물 대조 — 최신 (재생성 없음)

`cd /Users/alex/repos/gh-trade/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check` → **exit 0**. gh-trade HEAD 는 `4f852bd6` 였다.

```
      flatc version 25.12.19
      생성 .ts        : 58 개
      신규/변경 예정  : 0 개
      삭제 예정       : 없음
      .fbs 사본       : 최신 (마커 7줄 제외 본문 동일)
sync-relay-schema.sh OK: 가드 3종 통과 — gh-radar 파일은 건드리지 않았다 (--check)
```

→ `relay/src/generated/**` 는 바꾸지 않았고 재생성 커밋도 없다(`files_modified` 의 `StockDMA.fbs` 무변경).

### ② 빌드 · 단위 · e2e

| 게이트 | 결과 |
|---|---|
| `shared build && relay typecheck && relay typecheck:tests && webapp typecheck` | exit 0 · `error TS` 0 |
| relay `vitest` | **35 files / 881 passed** |
| webapp `vitest` | **140 files / 3140 passed · 1 skipped** |
| shared `vitest run` | **14 files / 249 passed** |
| e2e 7 spec(알려진 3건 제외 `--grep-invert '5\. 격자 1/2/3단\|P20-3 최악값\|16px 다'`) | **131 passed · 0 failed · 0 flaky · exit 0** (5.0m, workers 1) |
| e2e 7 spec 원본 전체 실행(제외 없음 — 참고) | exit 1 · **74 passed · 1 failed · 59 did not run** (2.9m). 실패는 알려진 「5. 격자 1/2/3단」 뿐이다(`뷰포트 360 → 카드 342px` · `<b>삼성전자</b> over 26` — deferred 26-05 와 같은 값). `trading-workbench.spec` 이 serial 이라 그 뒤 59건이 돌지 않았다. 그 59건은 위 제외 실행에서 통과했다(P20-3 · 16px 두 건은 제외 대상이라 원본 실행에서는 도달하지 않았다). **그 밖의 실패는 0건이다** |

단위 로그의 `[DMA] 송신 실패` · `dma_journal_apply 실패` · `[StockComovementSection] fetch failed` 는 실패 경로를 일부러 태우는 테스트의 출력이다. 요약 줄에 failed 가 없다.

알려진 제외 3건은 `deferred-items.md`(26-05)에 있다. 카드 헤더 종목명 말줄임 2건과 터치 16px 1건이다. 모두 제품 CSS 결함이고 relay · 소켓 경로와 무관하며 Phase 26 회귀가 아니다.

### ③ 작업 트리 · 밀릴 커밋

- `git status --porcelain --untracked-files=no` → **0줄**. 미추적은 남의 파일 5개(`.planning/milestone.lock` · `*/shots/` 3 · `.planning/research/.cache/`)이며 건드리지 않았다.
- `git rev-list --left-right --count origin/master...HEAD` → **`0	31`**(이 SUMMARY 커밋 전 기준. SUMMARY 커밋 뒤에는 `0 32`).
- `origin/master..HEAD` 31건은 **전부 deepblue-1 의 Phase 26 커밋**(26-09 docs 2 · 26-10 · 26-11 · 26-12 · 26-13 · 26-14)이다. **남의 커밋은 섞여 있지 않다.** origin/master 팁은 `af7139ae`(feat(mobile) …)이다.

```
47fc9934 docs(26-14): 배지 2축 구현 플랜 완료 — STATE · ROADMAP 갱신
21e495e6 docs(26-14): 배지 2축 구현 플랜 SUMMARY — 안 B · 시세/주문 필 · 끊김 e2e
dde91ad8 feat(26-14): My page 시세 필 · 주문 연결 문구 · 끊김 e2e (D-01 · D-04)
701ebef8 test(26-14): My page 상태줄 시세 필 · 주문 연결 문구 실패 테스트 (D-01 · D-04)
403ea305 feat(26-14): 작업대 상태줄 시세 · 주문 2축 — quotePillOf (D-01 · D-04)
db434497 test(26-14): 배지 2축 판정 quotePillOf · orderPillOf 실패 테스트 (D-01 · D-04)
1cc95a3f docs(26-13): 배지 2축 목업 채택 플랜 완료 — STATE · ROADMAP 갱신
4450d872 docs(26-13): 배지 2축 목업 채택 플랜 SUMMARY — 안 B · 26-14 정본 목록
f5e1bfce docs(26-13): 배지 2축 목업 채택안 박제 — 안 B
30c4d4d3 docs(26-12): quote 상태 3소비처 결선 플랜 완료 — STATE · ROADMAP 갱신
e752be53 docs(26-12): quote 상태 3소비처 결선 플랜 SUMMARY
8c606070 feat(26-12): webapp quoteState · subLimit 보관 (D-01 · D-04)
8cb202de test(26-12): webapp quoteState · subLimit 실패 테스트 — 최신 1건 · isStale 불변 · reset (D-01 · D-04)
cf4c6b24 feat(26-12): quote.state 프레임 — 인증 스냅샷 · 전이 푸시 (D-01)
ebfe6d51 test(26-12): quote.state 프레임 실패 테스트 — 인증 스냅샷 · 3초 전이 푸시 · 미등록 0 (D-01)
d50d5b83 feat(26-12): /healthz quote 축 — 장중 60초 · 거부 즉시 503 (D-02 · D-16)
16f7de93 test(26-12): /healthz quote 판정 실패 테스트 — 장중 60초 · 거부 즉시 503 · 본문 7키 (D-02 · D-16)
ac4ceedd docs(26-11): 83 재송신 넛지 · QuoteStatus 플랜 완료 — STATE · ROADMAP 갱신
f0efabb0 docs(26-11): 83 재송신 넛지 · QuoteStatus 플랜 SUMMARY
a7c06e97 feat(26-11): QuoteStatus — quote.state 프레임 · healthz 원천 · 장중 60초 알림 (D-02 · D-16)
be1296cc test(26-11): QuoteStatus 실패 테스트 — quote.state 3초 디바운스 · healthz 7키 · 장중 60초 알림 (D-02 · D-16)
480a2567 feat(26-11): 83 재송신 넛지 — 첫 참조 · 세션 Ready 에 같은 level 29 (Pattern 10)
409652fa test(26-11): 83 재송신 넛지 실패 테스트 — 첫 참조 · 세션 Ready · 본 키 기억 (Pattern 10)
71688cf0 docs(26-10): 재구독 페이싱 플랜 완료 — STATE · ROADMAP 갱신
717dd2ae docs(26-10): 재구독 페이싱 플랜 SUMMARY
9fd1be7f feat(26-10): 재구독 in-flight 창 페이싱 결선 — 서버 Notice 큐 끊김 루프 차단 (Pitfall 3)
ab72c00e test(26-10): 재구독 페이싱 hub 결선 실패 테스트 — 창 32 · 응답/타임아웃 · 실 TCP 창 상한 (Pitfall 3)
e9cf577d feat(26-10): SubscribePacer — in-flight 창 · 응답/타임아웃 · 대기 병합
1671c6d9 test(26-10): SubscribePacer 실패 테스트 — in-flight 창 · 응답/타임아웃 · 대기 병합 (Pitfall 3)
0866b590 docs(26-09): 공유 연결 구독 한도 플랜 완료 — STATE · ROADMAP 갱신
de50fe53 docs(26-09): 공유 연결 구독 한도 플랜 SUMMARY
```

**참고 — 이미 origin 에 있는 Phase 26 relay 코드.** 26-01~26-09(feat `7adee5b2` 까지)의 relay 커밋은 origin/master 에 이미 올라가 있다. 하지만 **relay 컨테이너는 아직 Phase 26 이전 빌드다.** 07:4x KST 에 공개 `/healthz` 를 읽기만 해서 확인했다: `version:"81f51ca7"`(2026-09-30 11:36 quick-260930-fi4) · `status:"ok"` · `vpn:true` · `dma:true` · `sessionCount:1` · `stalledCount:0` · `journal.state:"live"` · `journalGateways.KYOBO.state:"live"` · **`quote` 키 없음**.

origin 에 올라간 Phase 26 몫은 relay · e2e 뿐이고 `webapp/src` 변경은 0건이다. 그래서 webapp 프로덕션은 아직 Phase 26 코드를 싣지 않았다. 배지 2축 · `quoteState` 스토어는 밀릴 31건 안에 있다. 이 상태는 배포 순서(relay 먼저 → push)와 맞다.

### ④ Task 3 절차 (메인 세션 · 사용자 확인 뒤 · 서브에이전트는 실행하지 않음)

**순서는 고정이다: gh-trade 서버(완료 — Task 1) → relay → 검증 → `git status -sb` → push.** 앞 칸이 막히면 뒤 칸을 하지 않는다. relay 컨테이너 교체는 장 밖(08:00 전 또는 20:00 KST 이후)에만 한다.

0. 인증: `export GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json CLOUDSDK_CORE_PROJECT=gh-radar`. 스크립트 가드 때문에 `gcloud config configurations list` 의 활성 config 가 `gh-radar` 이고 project 도 `gh-radar` 여야 한다.
1. `cd /Users/alex/repos/gh-radar && git status -sb`. `ahead 32`(이 SUMMARY 포함)이어야 하고, 추적 파일의 미커밋 변경 · 남의 로컬 커밋이 없어야 한다. 남의 커밋이 끝에 쌓였으면 `git worktree add --detach <검증 커밋>` 에서 배포하고 `git push origin <sha>:refs/heads/master` 로 그 커밋만 민다(25-12 선례).
   - 이미지 태그는 `git rev-parse --short HEAD` 다(deploy-relay.sh:352). 그래서 이 SUMMARY 커밋 해시가 새 태그가 된다. docs 뿐이라 코드는 `47fc9934` 와 같다.
2. **직전 태그 기록**(롤백 대상 · 실행만 하고 바꾸지 않음):
   ```bash
   gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --project=gh-radar \
     --command="sudo docker inspect gh-radar-relay --format '{{.Config.Image}}'"
   # 기대: asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/relay:81f51ca7  (07:4x 공개 healthz version 과 대조)
   ```
   같은 SSH 에서 `sudo docker inspect gh-radar-relay --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^SUPABASE_URL='` 로 SUPABASE_URL 을 뽑는다. 비밀이 아닌 URL 이다. 다른 env 는 출력하지 않는다.
   또는 라이브 Cloud Run server env 에서 같은 값을 읽는다.
3. 배포(**`DMA_HOST` · `DMA_KYOBO_HOST` 주입 금지** — 실행 중 값 보존 · Secret Manager 무변경 · D-17 폴백으로 quote 는 `DMA_OBSERVER_SECRET` 을 쓴다):
   ```bash
   GCP_PROJECT_ID=gh-radar SUPABASE_URL=<2에서 읽은 값> NOTIFICATION_CHANNEL_ID=<채널> \
     bash scripts/deploy-relay.sh
   ```
   - `NOTIFICATION_CHANNEL_ID` 는 선택이다. 없으면 알림 정책 단계만 건너뛴다(배포는 완료).
   - 출력 확인: `DMA_HOST 출처: 실행 중 컨테이너 보존` · `DMA_HOST: 10.41.1.120 : 9100 ← 실제 컨테이너 값` · `KYOBO: … 관찰자 전용` · `✅ Deployed @ …/relay:<새 태그>`. 새 태그를 기록한다.
   - 기동 확인 `curl -sf /healthz` 는 quote 60초 유예 덕에 통과한다(장 밖이면 not-live 여도 200). 단, `rejected` · `role_mismatch` 면 즉시 503 이라 스크립트가 exit 1 로 멈춘다. 그때는 7번으로 간다.
4. `bash scripts/smoke-relay.sh` → 기준 **PASS 12 · FAIL 0 · SKIP 1**(INV-9 SKIP 은 `SMOKE_AUTH_TOKEN` 미설정이라 정상).
5. 공개 `/healthz`: `curl -s https://dma.jx1.io/healthz | jq '{status,version,vpn,dma,stalledCount,journal:.journal.state,quote}'` — 기대 본문은 아래 「/healthz 기대 본문」.
6. gh-trade 120 서버 로그(읽기 전용 · gh-trade 세션 경로): `[Gateway] 관찰자 로그인(quote — 시세 전용) conn=… ip=… client='gh-radar-relay/quote'` 1줄. 저널 관찰자 로그인 줄(`gh-radar-relay`)도 그대로 있어야 한다. relay 쪽 교차 확인:
   ```bash
   gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --project=gh-radar \
     --command="sudo docker logs --since 10m gh-radar-relay 2>&1 | grep -E '\[QUOTE\]|\[HUB\] (quote 연결 Ready — )?합집합 재구독' | tail -20"
   # 기대: [QUOTE] 시세 관찰자 로그인 성공 — ready
   ```
   관찰자 정원: KB 120 에 relay 는 journal 1 + quote 1 = 2 연결이다. 교체 겹침까지 쳐도 4 이내다(`kMaxObservers = 4` 합산).
7. **4~6 중 하나라도 아니면 push 하지 않고** 롤백한다. 서버는 그대로 둔다(role 없는 구 relay 는 journal 로 붙는다 · D-12):
   ```bash
   GCP_PROJECT_ID=gh-radar SUPABASE_URL=<같은 값> bash scripts/deploy-relay.sh --rollback 81f51ca7   # 2 에서 확인한 직전 태그
   bash scripts/smoke-relay.sh
   ```
   rollback 은 KB 정책을 적용하지 않는다. KYOBO 감시 판정이 불가로 나오면 `--alert-only` 로 맞춘다. 롤백 뒤에는 `/healthz` 의 `quote` 키가 다시 없어지고 `version:"81f51ca7"` 이어야 한다.
8. 통과하면 `git status -sb` 를 다시 확인한 뒤 `git push origin master` 한다(= webapp 프로덕션 배포).
   - **Vercel:** 팁이 docs 커밋(이 SUMMARY)이면 ignoreCommand 가 빌드를 건너뛴다. 프로덕션 배포가 그 커밋으로 안 서면 저장소 루트에서 `vercel pull --yes --environment=production && vercel build --prod && vercel deploy --prebuilt --prod` 를 돌린다.
9. 운영 웹 확인: `/trading` 상태줄 「시세」 · 「주문」 두 필(안 B) · My page 상태줄 · 작업대 카드 호가 표시. DevTools WS 에서 인증 직후 `{t:"quote.state", s:"live"}` 1프레임을 확인한다(장 밖이면 호가 스냅샷만). 열린 탭 · 앱 WebView 새로고침을 안내한다.
10. 첫 거래일 장중 UAT (a)~(e)는 PLAN Task 3 에 있다. 결과는 이 SUMMARY 에 적는다.

### `/healthz` 기대 본문 (배포 직후 · 장 밖)

`quote` 는 **7키 고정**이다. 식별자(`accountNo` · `userId` · `account_no` · `user_id`) · 호스트 · 비밀이 없어야 한다(smoke `health_probe` 정규식 매치 0).

```json
{"status":"ok","vpn":true,"dma":true,"version":"<새 태그>","sessionCount":1,"everReadyCount":1,"stalledCount":0,
 "journal":{"state":"live", …},
 "journalGateways":{"KYOBO":{"state":"live", …}},
 "quote":{"state":"ready","keyCount":0,"lingerCount":0,"lastFrameAgeSec":null,"reconnects":0,"subLimitRejects":0,"disconnectedSec":null}}
```

- 통과: `status:"ok"` · `quote.state:"ready"` · `quote.reconnects:0` · `journal.state:"live"` · `version` = 새 태그.
- `keyCount` 는 구독 사용자 수에 따라 0 이상이다. `lastFrameAgeSec` 는 장 밖이고 구독이 없으면 null 이거나 크다. 둘 다 판정 대상이 아니다.
- **실패 신호:** HTTP 503. 또는 `quote.state` 가 `role_mismatch`(구 서버 — Task 1 증거와 모순, 즉시 롤백) · `rejected`(관찰자 비밀 불일치 — 롤백 뒤 비밀 대조)다. 장 밖에서 `connecting`/`logging_in` 이 1분 넘게 이어지는 것도 터널 · 서버 도달 문제다(push 금지).

## 배포 기록 — Task 3

사용자 지시(「릴레이서버 배포해」)로 **08:05 KST 장중**에 relay 를 교체했다. 계획의 「20:00 이후」 창과 다르며, 사용자 결정이다. 코드 리뷰(26-REVIEW.md: critical 0 · warning 5) 뒤 배포했다.

| 항목 | 결과 |
|---|---|
| 직전 태그(롤백 대상) | `relay:81f51ca7` |
| 새 태그 | `relay:f07f5fbd` (코드 = `47fc9934`, 뒤는 docs 커밋) |
| DMA_HOST | 실행 중 컨테이너 보존 (10.41.1.120:9100) · 미주입 |
| smoke | PASS 12 · FAIL 0 · SKIP 1 (INV-9) |
| `/healthz` | `status:"ok"` · `journal:"live"` · `quote:{state:"ready",keyCount:0,lingerCount:0,reconnects:0,subLimitRejects:0,disconnectedSec:null}` · 식별자 없음 |
| relay 로그 | 08:06:16 `[QUOTE] 시세 관찰자 로그인 성공 — ready` (role 1 · client gh-radar-relay/quote) · 합집합 재구독 keys 0 |
| 120 서버 로그 (gh-trade 세션 읽기 전용 확인) | 08:06:16.572 `[Gateway] 관찰자 로그인(quote — 시세 전용) conn=14 … client='gh-radar-relay/quote'` · 08:06:16.872 저널 관찰자 이어받기 since=3413 resync=false · 관찰자 quote 1 + journal 1 = 2 (상한 4) · 상한 경고·거부·요청 무처리 경고 0 |
| push | 08:31 KST `af7139ae..0380796e` (Phase 26 커밋 34건만 · 남의 커밋 없음 · 사용자 지시 「배포해서 확인해보자」) |
| Vercel | `gh-radar-webapp-bv4jva3e1` Ready (빌드 1m) · 별칭 gh-radar-webapp.vercel.app · 서빙 번들에 `quote.state` 처리 포함 확인 |
| 배포 뒤 relay `/healthz` | 08:47 `quote:{state:"ready",keyCount:4,lastFrameAgeSec:0,reconnects:0,subLimitRejects:0}` · sessionCount 3 — 브라우저 구독이 quote 연결로 흐름 |
| 리뷰 수정 재배포 | 26-REVIEW-FIX.md WR-01~05(`96810716`~`b8b51e77`) 뒤 relay `1b65d813` 교체 · push 완료. 12:00 KST 공개 `/healthz`: `version:"1b65d813"` · `status:"ok"` · `quote:{state:"ready",keyCount:5,lastFrameAgeSec:0,reconnects:0,subLimitRejects:0}` · journal live |
| 운영 화면 육안 확인 | **pass**(사용자 확인 2026-10-01) — 상태줄 「● 시세」·「● 주문」 두 필 |
| 첫 거래일 UAT (a)~(e) | **pass**(사용자 판정 2026-10-01) — 아래 표 |
| 리뷰 수정 실측 확인 | **pass**(사용자 확인 2026-10-01) — WR-01 수신 정체 임계값 · WR-03 로그인 거부 유한 재시도 · WR-04 한도 거부 키 30초 재구독 |

### 첫 거래일 UAT (2026-10-01 장중)

| 항목 | 결과 |
|---|---|
| (a) 두 사용자가 같은 종목 → `quote.keyCount` 가 종목 수만큼만 · 두 화면 호가 동일 | pass |
| (b) 돌파 칩(PRICE 소켓)이 호가만 바뀌는 틱에 깜빡이지 않음 | pass |
| (c) 상한가 대기 주문 잔량진행률 막대가 종목을 새로 열 때 비지 않음(Pattern 10 넛지) | pass |
| (d) `quote.subLimitRejects` 0 · `quote.reconnects` 0 유지 | pass |
| (e) 주문 응답이 체감상 늦어지지 않음(D-13 — 수치 기준선 없음) | pass |

## Task Commits

1. **Task 1: gh-trade 120 가동본 확인** — 체크포인트(오케스트레이터 해소 · 커밋 없음)
2. **Task 2: 배포 준비 게이트** — 코드 커밋 없음(생성물 최신 · 재생성 0). 이 SUMMARY 초안 docs 커밋만 있다
3. **Task 3: 메인 세션 배포** — 코드 커밋 없음. 배포 기록 docs `0380796e` · `6f8f21f6` · 이 마감 커밋

## Decisions Made

- 생성물은 최신이다(`--check` 0 개). 그래서 재생성 · 와이어 변경 판단이 필요 없다.
- 롤백 태그 후보는 공개 `/healthz` `version` 으로 먼저 잡았다(`81f51ca7`). 확정은 메인 세션의 `docker inspect` 로 한다. 두 값이 다르면 docker inspect 값이 정본이다.

## Deviations from Plan

**1. [Rule 2 - 정보 보강] 공개 `/healthz` 읽기 전용 조회 추가**
- **Found during:** Task 2 ③
- **내용:** 가동 relay 버전(롤백 태그 후보)과 origin 에 이미 올라간 Phase 26 relay 커밋의 관계를 확인하려고 `curl -s https://dma.jx1.io/healthz` GET 1회를 했다. 배포 · smoke · VM 접속 · gcloud 는 실행하지 않았다.
- **결과:** `81f51ca7` · `quote` 키 없음. 절차 2 · 7 에 반영했다.

**2. [기록] 배포 창과 장 시작 근접**
- Task 1 의 배포 창은 「00:50 KST 이후」 다. 그런데 이 게이트는 07:52 KST 에 끝났다. 08:00 장 시작 전에 relay 교체 · 검증을 끝낼 수 없으면 20:00 KST 이후로 미뤄야 한다(PLAN 「20:00 KST 이후」 · 장 시간 08:00~20:00). 판단은 메인 세션 · 사용자 몫이다.

**Total deviations:** 1 보강 · 1 기록. **Impact:** 코드 무변경.

## Issues Encountered

없음. e2e 원본 실행의 실패 1건(+serial 연쇄 59 미실행)은 deferred 26-05 의 알려진 항목이다.

## Acceptance (Task 2)

| 기준 | 결과 |
|---|---|
| 세 automated 명령 종료 코드 0 | ① exit 0 · ② exit 0 · ③ 제외 실행 exit 0(원본 실행은 알려진 deferred 로 exit 1 — 위 표) |
| `git status --porcelain --untracked-files=no` 0줄 | 0줄 |
| SUMMARY 에 생성물 · origin 목록/left-right · 절차 · 롤백 명령 · healthz 기대 본문 | 있음 |
| `deploy-relay.sh` · `smoke-relay.sh` · `git push` · `gcloud compute ssh` 미실행 | 미실행(명령은 절차 문서로만 적었다) |

## Next

Phase 26 검증(VERIFICATION) · 완료 표시. deferred-items 2건은 사용자 결정으로 수정하지 않는다(2026-10-01).

---
*Phase: 26-shared-quote-feed*
*Completed: 2026-10-01*

## Self-Check: PASSED

- 파일: `26-15-SUMMARY.md` 있음
- 참조 커밋: `47fc9934` · `af7139ae` · `7adee5b2` · `81f51ca7` (gh-radar) · `c1af966a` (gh-trade) 모두 있음
- `relay/src/generated/**` 무변경 · 추적 미커밋 0
