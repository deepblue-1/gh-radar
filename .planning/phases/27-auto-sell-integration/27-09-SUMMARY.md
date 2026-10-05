---
phase: 27-auto-sell-integration
plan: 09
subsystem: 배포 · relay · webapp · 인박스
tags: [deploy, relay, auto-sell, user-settings, gate, schema-sync, healthz, vercel, rollback, inbox]
# 초안 — Task 1(준비 게이트 green) 만 끝났다. Task 2(메인 세션 배포 · checkpoint:human-action · blocking-human) 대기,
# Task 3(인박스 done_commit) 은 Task 2 의 배포 코드 커밋 해시가 있어야 한다.
status: in-progress

requires:
  - phase: 27-01
    provides: "자동매도 와이어 트레이서 — 생성물 2404509b · schema 4 · 84 수신 · 「자동」 LED"
  - phase: 27-02
    provides: "relay 41 · 42 · 43 중계 · Ready 마다 43 · 인증 직후 user.settings 재생"
  - phase: 27-03
    provides: "shared 조립기 kind 11~14 · group 9"
  - phase: 27-04
    provides: "상따 카드 자동매도 그룹"
  - phase: 27-05
    provides: "바로시작 · 중지(41)"
  - phase: 27-06
    provides: "/me 상따 기본설정(42/84)"
  - phase: 27-07
    provides: "새 전략 폼 84 시딩"
  - phase: 27-08
    provides: "주문로그 「자동매도」 칩"
provides:
  - "배포 준비 게이트 green @ 86fa3c33 — 생성물 최신(0 개) · build/typecheck 5종 · 단위 relay 985 · webapp 3325 · shared 300 · server 6 · e2e 7 spec 142 passed"
  - "Task 2 절차 · 롤백 명령(직전 태그 후보 af16e058) · /healthz 기대 본문 · 84 로그 확인 명령 · Vercel 판단"
  - "KB 120 가동본 bc36fb85 ⊇ 63aa0899 ⊇ 23d7721a(Phase 28 와이어) 확인"
affects: [27-verification, gh-trade-phase-28]

# Actuals (#2632 · #3968) — commits 는 측정값(rev-list plan_head_before..HEAD, 이 초안 docs 커밋 전).
# 준비 게이트는 코드 변경 없음(재생성 0) — docs 전용이라 0 이 정상. tokens = 이 SUMMARY chars/4.
actuals:
  tokens: 4680
  tasks: 1
  commits: 0
plan_head_before: 86fa3c33eacd3a62bbb208fa60c29c1d1d267c5a

tech-stack:
  added: []
  patterns:
    - "배포 전 공개 /healthz 읽기 전용 조회로 가동 relay 버전(=롤백 태그 후보)을 교차 확인(26-15 선례)"

key-files:
  created:
    - .planning/phases/27-auto-sell-integration/27-09-SUMMARY.md
  modified: []

key-decisions:
  - "생성물 --check 신규/변경 0 개 · .fbs 최신 — relay/src/generated 재생성 없음(gh-trade master fbs blob 68679e9a)"
  - "롤백 태그 후보 af16e058(16:2x KST 공개 healthz version) — 메인 세션이 배포 직전 docker inspect 로 확정"
  - "밀릴 37건 중 2건(aef4d0d1 · c659caff)은 동시 Phase 28 세션의 docs 커밋 — 27 커밋 사이에 끼어 있어 분리 불가, 코드 무영향이라 함께 push 하는 것이 현실적"
  - "Vercel: 팁은 docs 지만 ignoreCommand(scripts/vercel-ignore-build.sh)가 직전 배포 SHA..팁 범위의 webapp/ · packages/shared/ 변경을 보므로 빌드가 돌아야 한다 — 프로덕션에 그 커밋이 안 서면 수동 배포"

requirements-completed: []

coverage:
  - id: D1
    description: "배포 준비 게이트 — 생성물 최신 · build/typecheck · 단위 4 패키지 · e2e 7 spec green @ 86fa3c33"
    verification:
      - kind: other
        ref: "gh-trade/server ./scripts/sync-relay-schema.sh --check (신규/변경 예정 0 개 · .fbs 최신)"
        status: pass
      - kind: unit
        ref: "relay 985 · webapp 3325(1 skipped) · shared 300 · server strategy-events 6"
        status: pass
      - kind: e2e
        ref: "playwright 7 spec(제외 없음) → 142 passed · 0 failed · 0 flaky"
        status: pass
    human_judgment: false
  - id: D2
    description: "Task 2 프로덕션 배포(relay → smoke · healthz · 84 로그 → push → Vercel) · 첫 거래일 관찰"
    verification:
      - kind: manual
        ref: "메인 세션 배포 — 대기"
        status: pending
    human_judgment: true
    rationale: "배포 · VM 접속 · push 는 메인 세션이 사용자 확인 뒤 한다(서브에이전트 배포 분류기 차단)"
  - id: D3
    description: "Task 3 인박스 261004-auto-sell-wire.md status: done · done_commit"
    verification:
      - kind: other
        ref: "Task 2 배포 코드 커밋 해시 대기"
        status: pending
    human_judgment: false

duration: 10min
completed: (진행 중 — Task 1 2026-10-05)
---

# Phase 27 Plan 09: 배포 — 준비 게이트 · 프로덕션 배포 · 인박스 마감 Summary (초안)

**HEAD `86fa3c33` 에서 생성물(0 변경) · build/typecheck · 단위(relay 985 · webapp 3325 · shared 300 · server 6) · e2e 7 spec(142 passed, 제외 없음)이 모두 green 이다. KB 120 가동본 `bc36fb85` 은 Phase 28 와이어(`63aa0899` · `23d7721a`)를 포함한다. 가동 relay 는 `af16e058`(롤백 후보)이다. 배포 · push 는 하지 않았다 — 메인 세션이 20:00 KST 이후 아래 절차로 한다.**

## Performance

- **Duration:** 10 min (Task 1 게이트)
- **Started:** 2026-10-05T07:24:19Z (16:24 KST)
- **Task 1 completed:** 2026-10-05T07:34:34Z (16:34 KST)
- **Tasks:** 1 / 3 (Task 2 체크포인트 대기)
- **Files modified:** 1 (이 SUMMARY)

## Task 1 — 배포 준비 게이트 (배포하지 않음)

기준 커밋: **`86fa3c33`**(HEAD — 게이트 중 움직이지 않았다). 실행: 2026-10-05 16:24~16:34 KST.

### ① 생성물 대조 — 최신 (재생성 없음)

`cd /Users/alex/repos/gh-trade/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check` → **exit 0**. gh-trade HEAD `6766a064` · `master:server/src/protocol/StockDMA.fbs` blob `68679e9a`(27-01 이 반영한 2404509b 와 같은 blob).

```
      flatc version 25.12.19
      생성 .ts        : 63 개
      신규/변경 예정  : 0 개
      삭제 예정       : 없음
      .fbs 사본       : 최신 (마커 7줄 제외 본문 동일)
sync-relay-schema.sh OK: 가드 3종 통과 — gh-radar 파일은 건드리지 않았다 (--check)
```

→ `relay/src/generated/**` 무변경 · 재생성 커밋 없음(`files_modified` 의 `StockDMA.fbs` 무변경). 와이어 변경 판단 불필요.

### ② 빌드 · 단위 · e2e

| 게이트 | 결과 |
|---|---|
| `shared build && relay typecheck && relay typecheck:tests && webapp typecheck && server typecheck` | exit 0 · `error TS` 0 |
| relay `vitest` | **36 files / 985 passed** |
| webapp `vitest` | **141 files / 3325 passed · 1 skipped** |
| shared `vitest run` | **14 files / 300 passed** |
| server `vitest run tests/routes/strategy-events.test.ts` | **1 file / 6 passed** |
| verify ② 체인 전체 | **exit 0** · 요약 줄 failed 0 |
| e2e 7 spec(`trading-workbench` · `me` · `order-log` · `stock-detail-tabs` · `sidebar-tree` · `unfilled-progress` · `a11y` — **제외 없음**) | **142 passed · 0 failed · 0 flaky · exit 0** (5.6m, workers 1) |

- e2e 첫 실행은 webServer 기동 120초 타임아웃(`fonts.gstatic.com` 연결 타임아웃 · Turbopack `@vercel/turbopack-next/internal/font/google/font` 해석 실패)이었다. 테스트 실패가 아니라 기동 실패다. 메모리 「Playwright webServer 타임아웃 = .next 캐시」 대로 `rm -rf webapp/.next` 후 재실행해 위 결과를 얻었다.
- 26-15 때 deferred 였던 3건(「5. 격자 1/2/3단」 · 「P20-3 최악값」 · 「16px 다」)도 이번에는 제외 없이 통과했다(e7c95ce7 quick 정리 뒤).

### ③ 작업 트리 · 밀릴 커밋

- `git status --porcelain --untracked-files=no` → **1줄: ` M .planning/phases/28-limitup-feature-ingest/28-CONTEXT.md`** — 동시에 Phase 28 을 계획 중인 **다른 세션의 수정**이다(이 phase 소유 아님 · 건드리지 않았다). **Phase 27 소유 추적 파일의 미커밋 변경은 0줄**이다. 미추적은 남의 파일(`.planning/milestone.lock` · `28-01~15-PLAN.md` · `28-PATTERNS/RESEARCH/VALIDATION.md` · `*/shots/` 3 · `.planning/research/.cache/`)이며 건드리지 않았다.
- `git rev-list --left-right --count origin/master...HEAD` → **`0	37`**(이 SUMMARY 커밋 전. 커밋 뒤 `0 38`). origin/master 팁 `465e7372`(docs(27): 플랜 9개).
- 작성자: 37건 전부 `deepblue-1`. 이 중 **35건이 Phase 27**(27-01~27-08 feat · test · docs), **2건이 동시 Phase 28 세션의 docs 커밋**이다:
  - `aef4d0d1` docs(28): Phase 28 상한가 특징 연동 컨텍스트 — `.planning/phases/28-limitup-feature-ingest/**` 5파일 + `docs/inbox/from-gh-trade/261005-limitup-feature-85.md`
  - `c659caff` docs(28): UI 디자인 계약 — `28-CONTEXT.md` · `28-UI-SPEC.md`
  - 둘 다 docs 전용(코드 0)이고 27 커밋 **사이에** 끼어 있다(`aef4d0d1` 은 27-01 `478541c9` 와 `daf68f89` 사이, `c659caff` 는 27-03 `27f624f1` 과 `5a720f9d` 사이). 「내 커밋만 worktree 에서 배포」 하려면 히스토리를 다시 써야 하므로 비현실적이다 → **함께 push 하는 것을 권한다**(코드 무영향 · relay 이미지 내용 무영향). 판단은 메인 세션 · 사용자 몫.
- 코드 경로 변경 파일(37건 합): `webapp/` 45 · `relay/` 26 · `packages/` 10.

```
86fa3c33 deepblue-1 docs(27-07): 상태·로드맵 진행 갱신 — 27-07 완료(8/9)
e2c0a98b deepblue-1 docs(27-07): 새 전략 폼 84 시딩 플랜 완료 요약
1992be4f deepblue-1 feat(27-07): 새 전략 폼 84 시딩 — 초기 · 재시딩(손대지 않은 칸) + e2e P27-4
48e29a4c deepblue-1 feat(27-07): seedFromUserSettings — 84 → 새 폼 9칸 · lc 범위 밖 칸별 상수 폴백
1f429389 deepblue-1 docs(27-06): 상태·로드맵 진행 갱신 — 27-06 완료(7/9)
237854b4 deepblue-1 docs(27-06): /me 상따 기본설정(42/84) 플랜 완료 요약
01f17a02 deepblue-1 feat(27-06): 상따 기본설정 즉시 저장 — 42 1건 비행 큐 · 84 플래시 · 거부 원문 + e2e P27-M1
4530d1f9 deepblue-1 feat(27-06): /me 상따 기본설정 섹션 — 84 3상태 칩 · 안내 · 4묶음 11행 표시
c4d0f193 deepblue-1 feat(27-06): 84 사용자 설정 스토어 3상태 · 키패드 단위 「초」
e54fc655 deepblue-1 docs(27-05): 상태·로드맵 진행 갱신 — 27-05 완료(6/9)
cb16c71b deepblue-1 docs(27-05): 자동매도 바로시작 · 중지(41) 플랜 완료 요약
6a572f21 deepblue-1 feat(27-05): 자동매도 바로시작 · 중지 버튼 행 — D-07 게이트 · pend 칩 · 그룹 확정 잠금 + e2e P27-3
692dfc88 deepblue-1 feat(27-05): 카드 41 상태 기계 — 기대 전이 해제 · 전용 3초 · 54 거부 귀속
da474fa5 deepblue-1 feat(27-05): 자동매도 41 판정 · 버튼 규칙 · 기대 전이 · 54 표시 몫(AutoSell/AutoSellCommand)
a53ce14e deepblue-1 docs(27-08): 상태·로드맵 진행 갱신 — 27-08 완료(5/9)
0ff5cdbe deepblue-1 docs(27-08): 주문로그 「자동매도」 구분 칩 플랜 완료 요약
ac45ac48 deepblue-1 test(27-08): e2e P27-O1 주문로그 「자동매도」 칩 종단 · 칩 줄 한 줄
77b125d1 deepblue-1 feat(27-08): 주문로그 · 카드 팝업 「자동매도」 구분 칩 · 창 분리 쿼리 kind=auto
56d11073 deepblue-1 docs(27-04): 상태·로드맵 진행 갱신 — 27-04 완료(4/9)
6e3ebf72 deepblue-1 docs(27-04): 상따 카드 자동매도 그룹 플랜 완료 요약
4fdf4a83 deepblue-1 feat(27-04): 자동매도 카드 렌더 — ChoiceRow(폰 시트 · 데스크톱 세그먼트) · 누적/기준 행 · 칩 · footer 자리 · 폼 배선 + e2e P27-2
3a467ab2 deepblue-1 feat(27-04): 자동매도 그룹 스펙 — choice 행 · 누적/기준 · 요약 · 조건 범위 · 등록 게이트 · 상태 낱말
f55d0f89 deepblue-1 docs(27-03): 상태·로드맵 진행 갱신 — 27-03 완료(3/9)
264d76f2 deepblue-1 docs(27-03): 자동매도 문장 조립기 플랜 완료 요약
5a720f9d deepblue-1 feat(27-03): 조립기 kind 11~14 · group 9 주기/동시호가 회차 본문 · 토큰 우선 판정 + 자동매도 골든
c659caff deepblue-1 docs(28): UI 디자인 계약 — …                      ← 동시 Phase 28 세션 (docs 전용)
27f624f1 deepblue-1 feat(27-03): 자동매도 라벨 · 토큰 판정 · group 9 매도 색 · 54 배지 [상따]
f072d363 deepblue-1 docs(27-02): 상태·로드맵 진행 갱신 — 27-02 완료(2/9)
4dced648 deepblue-1 docs(27-02): relay 41 · 42 · 43 중계와 84 재생 플랜 완료 요약
ccfb13c9 deepblue-1 feat(27-02): relay autosell.cmd · user.settings.set 중계 + #onReady 43 + 인증 직후 user.settings 재생
9b8092e2 deepblue-1 feat(27-02): 자동매도 41 · 사용자 설정 42/43 조립기 + 인바운드 계약 · USER_SETTINGS_RANGES
32132806 deepblue-1 docs(27-01): 상태·로드맵 진행 갱신 — 27-01 완료(1/9)
893f92a6 deepblue-1 docs(27-01): 자동매도 와이어 트레이서 플랜 완료 요약
8f59064d deepblue-1 test(27-01): 자동매도 트레이서 경계 잠금 — schema 1~4 · 84 Ready 게이트 · 85 강등 · 자동만 등록 · LED 5상태
daf68f89 deepblue-1 feat(27-01): 자동매도 브라우저 끝 — 카드 헤더 「자동」 LED · 자동만 켠 등록 = 등록(isDeleteIntent ↔ #isTeardown) · P27-1
aef4d0d1 deepblue-1 docs(28): Phase 28 상한가 특징 연동 컨텍스트 — …          ← 동시 Phase 28 세션 (docs 전용)
478541c9 deepblue-1 feat(27-01): gh-trade 2404509b 자동매도 와이어 트레이서 — 생성물 12 + 수기 사본 3곳 · schema 4 · 에코 8필드 · 84 수신 · 웹 폼 4필드
```

**가동 상태(읽기 전용 확인 · 16:2x KST).**
- 공개 `/healthz`(GET 1회): `version:"af16e058"`(2026-10-04 09:22 docs 커밋 — origin/master 조상) · `status:"ok"` · `vpn:true` · `dma:true` · `sessionCount:1` · `stalledCount:0` · `journal.state:"live"` · `quote:{state:"ready",keyCount:9,reconnects:3,subLimitRejects:0}` · `journalGateways.KYOBO.state:"connecting"`(127 ACL 미갱신 대기 — 메모리, 이번 배포와 무관한 기존 상태). `af16e058..origin/master` 에 relay · shared 변경 0 → **가동 relay 는 Phase 27 이전 빌드이고, Phase 27 relay 코드는 전부 밀릴 37건 안에 있다.** 배포 순서(relay 먼저 → push)와 맞다.
- **KB 120 가동본:** gh-trade STATE `stopped_at` = 「KB 120 bc36fb85 배포·재기동 2026-10-05 02:51(27 서버 85·kind 15)」. `git -C /Users/alex/repos/gh-trade merge-base --is-ancestor 63aa0899 bc36fb85` → 포함 · `23d7721a` 도 포함. 즉 **120 은 41/42/43/84 · schema 4 를 지금 처리 · 송신한다**(Task 2 단계 0 충족 근거). 또 120 은 85(LimitFeature)도 보낸다 — 새 relay 는 85 를 `OUT_OF_SCOPE` **debug** 드롭(27-01)하므로 warn 이 쌓이지 않아야 한다.

### ④ Task 2 절차 (메인 세션 · 사용자 확인 뒤 · 서브에이전트는 실행하지 않음)

**순서 고정: gh-trade 서버(가동 확인 — 위 ③) → relay → 검증 → `git status -sb` → push.** 앞 칸이 막히면 뒤 칸을 하지 않는다. relay 컨테이너 교체는 **20:00 KST 이후**에만 한다(이 게이트 완료 16:34 KST — 장중).

0. 인증: `export GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json CLOUDSDK_CORE_PROJECT=gh-radar`. 스크립트 가드 때문에 `gcloud config configurations list` 의 활성 config 가 `gh-radar` 이고 project 도 `gh-radar` 여야 한다.
1. `cd /Users/alex/repos/gh-radar && git status -sb`. `ahead 38`(이 SUMMARY 커밋 포함)이어야 한다. Phase 27 추적 파일의 미커밋 변경이 없어야 한다(동시 Phase 28 세션의 `28-CONTEXT.md` 수정 · 미추적 플랜은 남의 것 — 배포 대상 아님). **38 건 뒤에 Phase 28 세션 커밋이 더 쌓였으면:** 그 커밋이 docs 전용인지 `git show --stat` 로 보고, 코드가 있으면 `git worktree add --detach /tmp/gh-radar-deploy-27 <이 SUMMARY 커밋>` 에서 배포하고 `git push origin <sha>:refs/heads/master` 로 그 커밋까지만 민다(25-12 · 메모리 「동시 세션 커밋 경합」).
   - 이미지 태그는 `git rev-parse --short HEAD` 다(`deploy-relay.sh:352`). 이 SUMMARY 커밋(docs)이 HEAD 면 그 해시가 새 태그다 — 코드는 `86fa3c33` 과 같다.
2. **직전 태그 기록**(롤백 대상 · 읽기만 · **이 executor 는 실행하지 않았다**):
   ```bash
   gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --project=gh-radar \
     --command="sudo docker inspect gh-radar-relay --format '{{.Config.Image}}'"
   # 기대: asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/relay:af16e058  (16:2x 공개 healthz version 과 대조 — 다르면 docker inspect 값이 정본)
   ```
   같은 SSH 에서 `sudo docker inspect gh-radar-relay --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^SUPABASE_URL='` 로 SUPABASE_URL 만 뽑는다(비밀 아닌 URL · 다른 env 출력 금지). 또는 라이브 Cloud Run server env 에서 같은 값을 읽는다.
3. 배포(**`DMA_HOST` · `DMA_KYOBO_HOST` 주입 금지** — 실행 중 값 보존 · Secret Manager 무변경):
   ```bash
   GCP_PROJECT_ID=gh-radar SUPABASE_URL=<2에서 읽은 값> NOTIFICATION_CHANNEL_ID=<채널> \
     bash scripts/deploy-relay.sh
   ```
   - `NOTIFICATION_CHANNEL_ID` 는 없어도 된다(알림 정책 단계만 실패 · 배포 완료).
   - 출력 확인: `DMA_HOST 출처: 실행 중 컨테이너 보존` · `DMA_HOST: 10.41.1.120 : 9100` · `✅ Deployed @ …/relay:<새 태그>`. 새 태그를 기록한다.
4. `bash scripts/smoke-relay.sh` → 기준 **PASS 12 · FAIL 0 · SKIP 1**(INV-9 SKIP 은 `SMOKE_AUTH_TOKEN` 미설정이라 정상 · INV-4 SKIP 도 장 밖 VPN 미기동이면 정상).
5. 공개 `/healthz`: `curl -s https://dma.jx1.io/healthz | jq '{status,version,vpn,dma,stalledCount,journal:.journal.state,quote}'` — 아래 「/healthz 기대 본문」.
6. **84 로그 확인**(사용자 로그인 뒤 — 웹 탭 하나를 새로고침해 relay 세션이 Ready 가 되게 한다):
   ```bash
   gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --project=gh-radar \
     --command="sudo docker logs --since 15m gh-radar-relay 2>&1 | grep -E '프레임 드롭' | grep -E '\"msgTypeHint\":(84|85)' | tail -10"
   # 기대: 84 줄 0 (새 relay 는 84 를 명시 case 로 받는다 — 옛 relay 의 "reason":"unknown-msg-type","msgTypeHint":84 warn 소멸)
   #       85 는 level 30 warn 이 아니라 debug(20) — LOG_LEVEL info 면 아예 안 찍힌다
   ```
   - 교차 확인(브라우저 DevTools WS): 인증 직후 `{t:"user.settings", …}` 프레임 1개(84 캐시가 있을 때) · `/me` 「상따 기본설정」 칩이 「불러오는 중」에 머물지 않음. Ready 뒤 relay 가 43 을 보내고 120 이 84 로 답한다.
7. **4~6 중 하나라도 아니면 push 하지 않고** 롤백:
   ```bash
   GCP_PROJECT_ID=gh-radar SUPABASE_URL=<같은 값> bash scripts/deploy-relay.sh --rollback af16e058   # 2 에서 확인한 직전 태그
   bash scripts/smoke-relay.sh
   ```
   롤백 뒤 `/healthz` `version:"af16e058"`. rollback 은 KB 정책을 적용하지 않는다 — KYOBO 감시 판정이 불가로 나오면 `--alert-only` 로 맞춘다. 인박스 노트는 `open` 으로 둔다.
8. 통과하면 `git status -sb` 재확인 → `git push origin master`(= webapp 프로덕션 배포).
9. **Vercel 판단:** 밀릴 범위의 팁은 docs 커밋이다(`git log -1 --format=%s origin/master..HEAD` = 이 SUMMARY 의 docs 커밋). 하지만 `webapp/vercel.json` 의 `ignoreCommand` 는 `scripts/vercel-ignore-build.sh` 로, **팁 한 커밋이 아니라 직전 배포 SHA(`VERCEL_GIT_PREVIOUS_SHA`)..팁** 범위의 `webapp/ · packages/shared/ · pnpm-lock.yaml` 변경을 본다 — 이번 범위에 `webapp/` 45 · `packages/` 10 파일 변경이 있으므로 **빌드가 돌아야 정상**이다(SHA 해석 실패도 빌드 쪽). 확인: `vercel ls gh-radar-webapp --prod | head -3`(또는 대시보드)에서 push 한 팁 커밋의 Production 배포가 Ready 인지 본다. **Ignored/Canceled 이거나 1~2분 안에 안 서면** 저장소 루트에서 `vercel pull --yes --environment=production && vercel build --prod && vercel deploy --prebuilt --prod`.
10. 운영 웹 확인: `/me` 「상따 기본설정」 칩이 「서버 저장값」 또는 「서버 저장값 없음 · 내장 기본값」 · 상따 카드 매도 탭 「자동매도」 카드 · 헤더 LED 4칩 · 주문로그 「자동매도」 칩. **열린 탭 · 앱 WebView 새로고침 안내**(Pitfall 12 — 옛 탭은 schema ≤3 으로 보내 게이트 전부 OFF 철거가 자동매도만 켠 등록을 지울 수 있다). **배포한 코드 커밋 해시(8자)를 붙인다** — Task 3 `done_commit` 값이다(코드 = `86fa3c33` 이하, 실제로는 push 한 팁 또는 relay 태그 커밋 중 사용자가 정한 값).
11. 첫 거래일 관찰(실계좌 버튼을 시험으로 누르지 않는다): (a) WinForms 자동매도 켠 종목의 웹 카드 칩 · LED = WinForms LED 색(대기·완료 주황 · 감시·매도중 초록) (b) 주문로그 「자동매도」 칩에 120 저널 kind 6 g9 · 11~14 줄이 문장으로(원문 숫자 없음) (c) 54 자동매도 사유 줄이 `[상따]` 배지로 카드 로그에 (d) `/me` 값 = WinForms 기본설정창 값.

### `/healthz` 기대 본문 (배포 직후 · 장 밖)

식별자(`accountNo` · `userId` · `account_no` · `user_id`) · 호스트 · 비밀이 없어야 한다(smoke `health_probe` 정규식 매치 0). 키 집합은 지금과 같다(`dma` · `everReadyCount` · `journal` · `journalGateways` · `quote` · `sessionCount` · `stalledCount` · `status` · `version` · `vpn`) — Phase 27 은 healthz 를 바꾸지 않았다.

```json
{"status":"ok","vpn":true,"dma":true,"version":"<새 태그>","sessionCount":1,"everReadyCount":1,"stalledCount":0,
 "journal":{"state":"live", …},
 "journalGateways":{"KYOBO":{"state":"connecting" 또는 "live", …}},
 "quote":{"state":"ready","keyCount":0,"lingerCount":0,"lastFrameAgeSec":null,"reconnects":0,"subLimitRejects":0,"disconnectedSec":null}}
```

- 통과: `status:"ok"` · `version` = 새 태그 · `journal.state:"live"` · `quote.state:"ready"` · `quote.reconnects:0`(재기동 직후).
- `keyCount` · `lastFrameAgeSec` · `sessionCount` 는 접속 사용자 수에 따라 변한다 — 판정 대상 아님. KYOBO `connecting` 은 기존 상태(127 ACL 대기) — 판정 대상 아님.
- **실패 신호:** HTTP 503 · `status` ≠ `"ok"` · `quote.state` 가 `role_mismatch`/`rejected` · 장 밖에서 `journal` 이 1분 넘게 `live` 가 아님 → push 금지 · 7번 롤백.

## Task Commits

1. **Task 1: 배포 준비 게이트** — 코드 커밋 없음(생성물 최신 · 재생성 0). 이 SUMMARY 초안 docs 커밋만 있다.
2. **Task 2: 메인 세션 배포** — 대기(checkpoint:human-action · blocking-human).
3. **Task 3: 인박스 마감** — 대기(Task 2 의 배포 코드 커밋 해시 필요).

## Decisions Made

- 생성물은 최신이다(`--check` 0 개). 재생성 · 와이어 변경 판단 불필요.
- 롤백 태그 후보는 공개 `/healthz` `version` 으로 먼저 잡았다(`af16e058`). 확정은 메인 세션의 `docker inspect`.
- 동시 Phase 28 세션의 docs 커밋 2건은 27 커밋 사이에 끼어 있어 분리할 수 없다 — 코드 무영향이므로 함께 push 를 권한다.

## Deviations from Plan

**1. [Rule 2 - 정보 보강] 공개 `/healthz` 읽기 전용 조회 · gh-trade 가동본 조상 확인 추가 (26-15 선례)**
- **Found during:** Task 1 ③
- **내용:** 롤백 태그 후보와 가동 relay 가 Phase 27 이전 빌드인지 확인하려고 `curl -s https://dma.jx1.io/healthz` GET 1회. 단계 0(KB 120 가동본) 근거로 gh-trade STATE `stopped_at` 읽기 + `merge-base --is-ancestor` 2회(로컬 git). 배포 · smoke · VM 접속 · gcloud · push 는 실행하지 않았다.
- **결과:** `af16e058` · KB 120 `bc36fb85` ⊇ `63aa0899` ⊇ `23d7721a`. 절차 2 · 7 에 반영.

**2. [Rule 3 - 차단 해소] e2e webServer 기동 타임아웃 → `.next` 삭제 후 재실행**
- 첫 실행이 `fonts.gstatic.com` 연결 타임아웃으로 webServer 120초 타임아웃(테스트 0건 실행). `rm -rf webapp/.next` 후 재실행 142 passed. 코드 무변경.

**3. [기록] 작업 트리 기준 해석**
- 플랜 기준 「`git status --porcelain --untracked-files=no` 0줄」 은 1줄이다 — 동시 Phase 28 세션이 수정 중인 `28-CONTEXT.md`. 오케스트레이터 지시대로 이 phase 소유 파일 기준으로 판정했다(Phase 27 소유 0줄). 그 파일은 건드리지 않았다.

**Total deviations:** 1 보강 · 1 차단 해소 · 1 기록. **Impact:** 코드 무변경.

## Issues Encountered

없음(위 e2e 기동 타임아웃은 알려진 캐시 · 네트워크 문제로 재실행에서 해소).

## Acceptance (Task 1)

| 기준 | 결과 |
|---|---|
| 세 automated 명령 종료 코드 0 | ① exit 0 · ② exit 0 · ③ exit 0(재실행 — 제외 없음 142 passed) |
| `git status --porcelain --untracked-files=no` 0줄 | Phase 27 소유 0줄 · 남의 `28-CONTEXT.md` 1줄(동시 세션 — 미접촉) |
| SUMMARY 에 생성물 · origin 목록/left-right · 절차 · 롤백 명령 · healthz 기대 본문 · Vercel 판단 | 있음 |
| `deploy-relay.sh` · `smoke-relay.sh` · `git push` · `gcloud compute ssh` 미실행 | 미실행(명령은 절차 문서로만 적었다) |

## Next

메인 세션이 20:00 KST 이후 Task 2 절차로 배포 → 결과와 배포 코드 커밋 해시를 붙이면 continuation executor 가 Task 3(인박스 `261004-auto-sell-wire.md` done) · 이 SUMMARY 마감 · STATE/ROADMAP 갱신을 한다.

---
*Phase: 27-auto-sell-integration*
*Task 1 completed: 2026-10-05 (초안)*

## Self-Check: PASSED

- 파일: `27-09-SUMMARY.md` 있음
- 참조 커밋: `86fa3c33` · `465e7372` · `aef4d0d1` · `c659caff` · `af16e058` (gh-radar) · `bc36fb85` · `63aa0899` · `23d7721a` (gh-trade) 모두 있음
- `relay/src/generated/**` 무변경 · Phase 27 추적 미커밋 0
