---
phase: 17-gh-trade-led
plan: 12
subsystem: testing
tags: [verification, playwright, e2e, requirements, roadmap, deployment-gate, gh-trade]

# Dependency graph
requires:
  - phase: 17-gh-trade-led
    provides: "17-01~17-11 의 relay·webapp·shared 구현 전량과 각 plan 의 자동 게이트"
provides:
  - "전량 게이트 재실행 결과 — 루트 typecheck · relay 467 · webapp 998(+1 skip) · shared 108 · 재동기화 --check 차이 0"
  - "Playwright 전량 실행 — 135 passed · 9 skipped · 0 failed (이 phase 처음, WINDOWS #14·#15 해소)"
  - "D-22 dev 화면 확인 증거 — 상따 상태줄 LED 스크린샷 8장(폰·와이드 × 라이트·다크 × 상태줄·페이지)"
  - "server(Express) 배포 생략 판정 — 명령과 출력이 포함된 4중 근거 (16-46 선례 동형)"
  - "TRADE-04 · TRADE-05 의 과장 없는 Pending 판정 — 정의부·Traceability 일치"
  - "D-25 가 왜 수행 불가였는지의 정확한 원인과 재개 절차 (Xcode 라이선스 게이트 + 구형 바이너리 바이트 실사)"
  - "배포 계획 자료 5종 — git status · 커밋 76건 · 대상 판정 · KST 시각 · 배포 순서"
affects: [phase-18, deployment]

# Actuals (#2632) — estimateTokens 스케일(chars/4, 실현 diff 기준)
actuals:
  tokens: 6945
  tasks: 3
  commits: 3
plan_head_before: b6376b2136477f1cae7f59a6179858b93ba2db84

tech-stack:
  added: []
  patterns:
    - "관측하지 못한 것은 관측하지 못했다고 적는다 — 돌리면 거짓 양성이 되는 검증은 **일부러 돌리지 않는다**"
    - "바이너리 실사는 `strings` 가 아니라 바이트 카운트로 — Xcode 게이트에 걸린 `strings` 는 0 을 거짓으로 돌려준다"
    - "배포 생략 판정은 diff 한 줄이 아니라 4중 근거로 — 소스 diff · 계약 diff · 신규 심볼 소비처 · import 이름 교집합"

key-files:
  created:
    - .planning/phases/17-gh-trade-led/17-12-led-statusbar-phone-light.png
    - .planning/phases/17-gh-trade-led/17-12-led-statusbar-phone-dark.png
    - .planning/phases/17-gh-trade-led/17-12-led-statusbar-wide-light.png
    - .planning/phases/17-gh-trade-led/17-12-led-statusbar-wide-dark.png
    - .planning/phases/17-gh-trade-led/17-12-led-page-phone-light.png
    - .planning/phases/17-gh-trade-led/17-12-led-page-phone-dark.png
    - .planning/phases/17-gh-trade-led/17-12-led-page-wide-light.png
    - .planning/phases/17-gh-trade-led/17-12-led-page-wide-dark.png
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md

key-decisions:
  - "D-25 mock 게이트웨이 실기 검증을 **수행하지 못했고, 구형 바이너리로 흉내 내지도 않았다** — 그 바이너리에는 78·36·37·38 이 없어 「드롭 0」이 아무것도 오지 않아서 참이 되고 래치 왕복은 관측 자체가 불가능하다 (T-17-46)"
  - "TRADE-04 · TRADE-05 를 **Pending 유지** — 코드 층위는 전부 닫혔으나 실기 왕복과 배포가 0회다. Phase 16 의 TRADE-03 선례와 같은 기준"
  - "server(Express) 배포 **생략** — `server/` 소스 diff 0줄 · 신규 심볼 소비처 0건 · server 가 쓰는 shared 이름 20개와 이 phase 가 바꾼 7개의 교집합 0 (16-46 동형)"
  - "Playwright 를 이 phase 에서 처음 실행했다 — 11개 plan 이 타입 통과로만 확인하고 넘긴 것을 실브라우저로 닫았다"
  - "LED 스크린샷은 임시 캡처 스펙으로 찍고 그 스펙은 **지웠다** — 검증 단언이 아니라 증거 생성기이고, 가시성·순서·색 규칙은 이미 다른 층이 잠갔다"

patterns-established:
  - "Pattern 1: 「돌릴 수 없는 검증」과 「돌렸더니 실패한 검증」을 문서에서 절대 섞지 않는다 — 전자는 미관측이지 반증이 아니다"
  - "Pattern 2: 도구 자체가 게이트에 걸릴 수 있다 — 검증 도구의 출력이 0 이면 도구가 살아 있는지 먼저 의심한다"

requirements-completed: []

coverage:
  - id: D1
    description: "전량 게이트 5종이 green 이다 (D-24)"
    requirement: TRADE-04
    verification:
      - kind: other
        ref: "pnpm typecheck (루트, 13 workspace) → exit 0"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay test → 467 passed / 19 files"
        status: pass
      - kind: other
        ref: "relay typecheck · typecheck:tests → 출력 없음 exit 0"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/webapp test → 998 passed · 1 skipped / 73 files"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/shared test -- --run → 108 passed / 9 files"
        status: pass
      - kind: other
        ref: "RELAY=... ./scripts/sync-relay-schema.sh --check → 생성 44 · 신규/변경 예정 0 · 삭제 없음"
        status: pass
    human_judgment: false
  - id: D2
    description: "Playwright e2e 전량이 실브라우저에서 통과한다 — 이 phase 가 바꾼 e2e 단언 포함 (WINDOWS #14 · #15)"
    requirement: TRADE-04
    verification:
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp run test:e2e → 135 passed · 9 skipped · 0 failed (2.7m)"
        status: pass
      - kind: e2e
        ref: "trading-limit-chaser.spec.ts:321 #3b 상태줄 래치 LED 3개 순서·라벨 (17-11 / D-22)"
        status: pass
      - kind: e2e
        ref: "trading-vi.spec.ts #5 · #11 — 거래소 열 · 110초 열 인덱스 (17-06)"
        status: pass
    human_judgment: false
  - id: D3
    description: "상따 상태줄 LED 가 실브라우저에서 채택안대로 보이고 폰 밴드에서 두 줄로 접힌다 (D-22)"
    requirement: TRADE-05
    verification:
      - kind: automated_ui
        ref: "playwright:17-12-led-statusbar-phone-light.png (본문 374 · 상태줄 374x58 = 두 줄)"
        status: pass
      - kind: automated_ui
        ref: "playwright:17-12-led-statusbar-wide-light.png (본문 1112 · 상태줄 1112x36 = 한 줄)"
        status: pass
      - kind: automated_ui
        ref: "playwright:17-12-led-statusbar-{phone,wide}-dark.png · 17-12-led-page-*.png"
        status: pass
      - kind: e2e
        ref: "trading-limit-chaser.spec.ts 케이스 9·11·12·13 — 잘림 0 (뷰포트 360/390/716/768/1023, 컨테이너 832/880/960)"
        status: pass
    human_judgment: true
    rationale: "3칩 존재·순서·라벨·두 줄 접힘·잘림 0 은 측정과 단언으로 닫혔으나, 「채택안대로 보기 좋은가」는 사람만 판정한다. 스크린샷 8장을 checkpoint 에 첨부했다 — 사용자가 승인하면 WINDOWS #16 이 닫힌다."
  - id: D4
    description: "server(Express) 배포 생략 판정 — 근거 명령과 출력이 기록됐다"
    verification:
      - kind: other
        ref: "git diff --stat 7a2e99d..HEAD -- server/ → 빈 출력 (0 파일 · 0 줄)"
        status: pass
      - kind: other
        ref: "grep -rnE '<이 phase 신규 심볼 10종>' server/src → 0건"
        status: pass
      - kind: other
        ref: "server 가 shared 에서 import 하는 이름 20개 ∩ 이 phase 가 바꾼 export 7개 → 공집합"
        status: pass
    human_judgment: false
  - id: D5
    description: "TRADE-04 · TRADE-05 가 정의부와 Traceability 양쪽에서 같은 판정(Pending)으로, 과장 없이 기록됐다"
    verification:
      - kind: other
        ref: "grep -oE '^- \\[.\\] \\*\\*TRADE-0[45]\\*\\*' .planning/REQUIREMENTS.md → 둘 다 `[ ]`"
        status: pass
      - kind: other
        ref: "Traceability 표 TRADE-04 · TRADE-05 행 → 둘 다 **Pending** + 조항별 근거 + 미완 사유"
        status: pass
    human_judgment: false
  - id: D6
    description: "★ D-25 mock 게이트웨이 실기 검증 — 76/77/78 드롭 0 · 36/37/38 래치 왕복 · 새 표기 실관측"
    verification: []
    human_judgment: true
    rationale: "**수행하지 못했다.** gh-trade HEAD 재빌드가 Xcode 27.0 라이선스 미동의(`sudo xcodebuild -license` — 사람만 가능)로 막혔고, 실행 가능한 2026-09-13 빌드에는 78·36·37·38·`krx_close_price`·`request_kind` 가 없다. 띄우면 거짓 양성이 되므로 돌리지 않았다. 아래 §D-25 참조."

# Metrics
duration: 14 min
completed: 2026-09-20
status: halted
---

# Phase 17 Plan 12: 실기 검증·전량 게이트·문서 갱신·배포 게이트 Summary

**전량 게이트와 Playwright 135건을 실브라우저에서 green 으로 확인하고 상따 LED 화면을 스크린샷으로 박제했으나, mock 게이트웨이 실기 검증은 Xcode 라이선스 게이트로 수행 불가여서 TRADE-04·TRADE-05 를 Pending 으로 남기고 배포 승인 checkpoint 에서 정지했다**

## Performance

- **Duration:** 14 min
- **Started:** 2026-09-20T10:18:37Z (KST 19:18)
- **Completed:** 2026-09-20T10:32:02Z (KST 19:32)
- **Tasks:** 3 완료 / 1 정지(Task 4 checkpoint) / 1 미착수(Task 5 배포)
- **Files modified:** 11 (신규 8 PNG · 수정 3 문서)

## Accomplishments

- **전량 게이트 5종 green** — 루트 typecheck · relay **467/19파일** · webapp **998(+1 skip)/73파일** · shared **108/9파일** · 재동기화 `--check` 차이 **0**
- **Playwright 를 이 phase 에서 처음 실행 — 135 passed · 9 skipped · 0 failed.** 11개 plan 이 `tsconfig.e2e.json` 타입 통과로만 넘겼던 e2e 단언이 실브라우저에서 닫혔다 (WINDOWS #14 · #15)
- **D-22 dev 화면 확인 수행** — 실브라우저 스크린샷 8장 + 실측 폭. 폰 밴드 두 줄(58px), 와이드 한 줄(36px)
- **server 배포 생략을 4중 근거로 판정** — 16-46 선례 동형
- **TRADE-04 · TRADE-05 를 과장 없이 Pending** — 정의부·Traceability 일치, 조항별 근거와 미완 사유 분리 기록
- **D-25 를 흉내 내지 않았다** — 돌리면 거짓 양성이 되는 검증을 의도적으로 보류하고 원인·재개 절차를 남겼다

## Task Commits

1. **Task 1: 전량 게이트 + Playwright + LED 스크린샷** — `9db45b0` (test)
2. **Task 2: REQUIREMENTS · ROADMAP · STATE 갱신** — `3203da1` (docs)
3. **Task 3: 배포 대상 판정 + 배포 계획** — 소스 변경 없음. 판정과 자료는 이 SUMMARY 가 담는다
4. **Task 4: 배포 승인 checkpoint** — **정지(blocking-human)**. 사용자 결정 대기
5. **Task 5: 배포 실행** — **미착수**. Task 4 선행 조건 미충족

**Plan metadata:** 아래 `docs(17-12)` 커밋

## ① 전량 게이트 (D-24) — 실행 결과

| 게이트 | 명령 | 결과 |
|---|---|---|
| 루트 typecheck | `pnpm typecheck` | **exit 0** · 13 workspace 전부 Done · `error TS` 0건 |
| relay 테스트 | `pnpm --filter @gh-radar/relay test` | **467 passed / 19 files** (1.89s) |
| relay 타입 | `run typecheck` · `run typecheck:tests` | 출력 없음 · exit 0 |
| webapp 테스트 | `pnpm --filter @gh-radar/webapp test` | **998 passed · 1 skipped / 73 files** (16.5s) |
| webapp 타입 | `run typecheck` (`tsc --noEmit && tsc -p tsconfig.e2e.json`) | **exit 0** |
| shared 테스트 | `pnpm --filter @gh-radar/shared test -- --run` | **108 passed / 9 files** |
| 재동기화 | `RELAY=... ./scripts/sync-relay-schema.sh --check` | 생성 **44** · **신규/변경 예정 0** · 삭제 없음 · `.fbs` 사본 최신 |
| **e2e** | `pnpm --filter @gh-radar/webapp run test:e2e` | **135 passed · 9 skipped · 0 failed** (2.7m) |

Phase 16 기준선 대비: relay 397→**467**(+70) · webapp 680→**998**(+318) · e2e 126→**135**(+9). 회귀 **0**.

> ★ `packages/shared` 를 먼저 빌드하고 게이트를 돌렸다 — 낡은 `dist` 가 소비처 typecheck 를 통과시키는 함정(Phase 16 에서 실제로 데임)을 피하기 위해서다.

## ② D-25 mock 게이트웨이 실기 검증 — **수행하지 못했다**

**이 plan 의 핵심 미완 항목이다. 아래는 「실패」가 아니라 「수행 불가」의 기록이다.**

### 막힌 지점

```
$ ./scripts/build.sh --server-only Release      # gh-trade/server
BUILD_EXIT=69
You have not agreed to the Xcode license agreements.
Please run 'sudo xcodebuild -license' from within a Terminal window ...
```

Xcode 가 **27.0** 으로 올라갔는데 동의된 버전은 **26.3** 이다(`defaults read /Library/Preferences/com.apple.dt.Xcode IDEXcodeVersionForAgreedToGMLicense` → `26.3`). 그 결과 `xcrun` · `clang` · `strings` 와 Homebrew `g++-15`(macOS SDK 경유)가 **전부** 같은 메시지로 막힌다. 해제는 `sudo` 가 필요한 **사람의 행위**라 실행자가 할 수 없다.

### 그래서 구형 바이너리로 대신하지 않은 이유

실행 가능한 유일한 mac 빌드는 `server/build/stock-dma-server`(**2026-09-13** 자)다. gh-trade HEAD 는 `28a98ea0`(2026-09-20)이고, `.fbs` 는 `bcc011c4`(2026-09-17)까지 바뀌었다 — 즉 그 바이너리는 이 phase 가 대상으로 삼은 스키마보다 **나흘 이르다**.

바이트 실사 결과(파이썬 `bytes.count`):

| 심볼 | 구형 mac 빌드(09-13) | 이 plan 이 보려던 것 |
|---|---|---|
| `RateCrossAlert` (76) | 67 | 드롭 0 |
| `QueuedWindowState` (77) | 42 | 드롭 0 |
| `RateCrossSnapshot` (78) | **0** | 드롭 0 · 인증 스냅샷 |
| `ArmSellLatchReq` (36) | **0** | 래치 클릭 왕복 |
| `ArmCancelLatchReq` (37) | **0** | 래치 클릭 왕복 |
| `ArmBuyLatchReq` (38) | **0** | 래치 클릭 왕복 |
| `krx_close_price` | **0** | 호가·헤더 종가 표기 (D-11) |
| `request_kind` / `requester` | **0** | 주문통보 행위 단어 (D-08) |
| `pending_cancel_sent` / `pending_status` | **0** | 취소보관 회색 (D-07/D-14) |

띄웠다면 「**76/77/78 드롭 0**」은 78 이 아예 오지 않아서 참이 되고, 「**36/37/38 래치 왕복**」은 서버가 그 요청을 모르므로 관측 자체가 불가능하며, 새 표기 3종은 필드가 없어 전부 관측 불가다. **거짓 양성을 만드는 검증은 돌리지 않는 것이 맞다 (T-17-46 — 「관측 못 한 것을 관측한 것처럼 기록」).**

> ★ 도구 함정 하나를 같이 남긴다: 처음에 `strings` 로 실사했을 때 **모든 심볼이 0** 으로 나왔다. `strings` 자체가 Xcode 툴체인이라 라이선스 메시지를 뱉고 있었던 것이지 심볼이 없던 것이 아니다. 바이너리 실사는 `python3` 바이트 카운트로 해야 한다.

### 관측 5항목의 현재 상태 (정직 기록)

| # | 관측 항목 | 상태 | 대체 근거(있는 만큼만) |
|---|---|---|---|
| 1 | relay `unknown-msg-type` 드롭 0 (76/77/78 수신 중) | **mock 에서 관측 불가** | `rate-cross.test.ts` ④ 가 사유별 로거 스파이 + 대조군으로 드롭 0 을 단언(17-03). 실 게이트웨이 왕복은 아니다 |
| 2 | hub `default:` 계수기 0 | **mock 에서 관측 불가** | `unhandledFrameCount()` 게이트가 단위 층에서 0 을 단언(17-03) |
| 3 | 인증 직후 `rate.cross.snap` 1프레임 | **mock 에서 관측 불가** | 17-03 D2 가 Ready 전/후 팬아웃 규율까지 단언 |
| 4 | LED 클릭 → 36/37/38 → 60 에코 색 변경 · 무장 위반 시 서버 한글 WARN | **mock 에서 관측 불가** | relay↔게이트웨이 구간은 `ws-latch.test.ts` 19케이스가 `fake-gateway` 로 **페이로드 디코드까지** 단언(17-04). 브라우저→relay 구간은 `limit-chaser-client.test.tsx` ⑲-4~8. **종단 왕복만 미관측** |
| 5 | 미체결·주문통보·체결테이프·호가 새 표기 | **mock 에서 관측 불가** (구형 빌드에 필드 자체가 없음) | 17-02·17-08·17-09·17-10 의 단위·통합 테스트. 실서버 장중 관찰로 넘긴다 |

### 재개 절차

```bash
sudo xcodebuild -license                                   # ← 사람이 해야 한다
cd /Users/alex/repos/gh-trade/server && ./scripts/build.sh --server-only   # 실측 45s
./scripts/run-mac.sh                                       # 포트 9100
cd /Users/alex/repos/gh-radar && ./dev.sh --with-relay     # webapp:3100 · relay ws:8090
```

## ③ 배포 대상 판정 (Task 3)

### server(Express) → **배포 생략**

| 근거 | 명령 | 출력 |
|---|---|---|
| ① server 소스 diff | `git diff --stat 7a2e99d..HEAD -- server/` | **빈 출력** (0 파일 · 0 줄) |
| ② 계약 diff | `git diff --stat 7a2e99d..HEAD -- packages/shared/` | 4 파일 · +414 / −10 |
| ③ 신규 심볼 소비처 | `grep -rnE 'rate\.cross\|queued\.window\|lc\.arm\|sideDisplayText\|serverMsgBadge\|cancelEntryLatched\|buyEntryLatched\|krxClosePrice\|requestKind\|pendingCancelSent' server/src` | **0건** |
| ④ import 이름 교집합 | server 가 shared 에서 가져오는 20개 이름 ∩ 이 phase 가 바꾼 export 7개 | **공집합** (`DmaOrderRow` 도 이 phase 에서 무변경 확인) |

`server/` 가 0줄이므로 ②의 +414 줄은 server 런타임에 도달하지 않는다. **16-46 선례와 동형**이며 「배포 누락」이 아니다.

### 배포 대상 = **relay + webapp**

프로덕션 relay 는 `11072e4`(2026-09-10 배포)로 이 phase 의 **76 커밋 전부가 미반영**이다.

### 배포 계획 자료 5종

**ⓐ `git status --short` (pathspec 없음) — 이 SUMMARY 커밋 직전 기준**

```
?? .planning/milestone.lock
```

`.planning/milestone.lock` 은 **이 세션 이전부터 있던 untracked 파일**이고 이 plan 이 만들지 않았다 — 손대지 않았다.

**ⓑ 이 phase 의 커밋** — `7a2e99d..HEAD` **76건**. 마지막 3건: `3203da1`(docs 17-12) · `9db45b0`(test 17-12) · `b6376b2`(docs 17-11).
※ 이 중 `62a5673` · `ce97f40` 2건은 다른 세션(`quick-260920-pik`, netcut 측정기·STATE)이 같은 기간 master 에 올린 것이다 — 이 phase 의 산출물이 아니지만 같은 배포 범위에 함께 실린다.

**ⓒ 배포 대상** — relay ✅ · webapp ✅ · server ❌(위 4중 근거로 생략)

**ⓓ 현재 KST** — `2026-09-20 19:31` (일). **20:00 이전이라 D-26 의 시각 조건 미충족.**
현재 프로덕션 `/healthz` = `{"status":"ok","vpn":true,"dma":true,"version":"11072e4","sessionCount":1,"everReadyCount":1,"stalledCount":0}` — **`sessionCount: 1`, 즉 살아 있는 DMA 세션이 지금 있다. 배포는 그 세션을 끊는다.**

**ⓔ 배포 순서와 각 단계가 건드리는 것**

1. `GCP_PROJECT_ID=gh-radar SUPABASE_URL=… NOTIFICATION_CHANNEL_ID=… bash scripts/deploy-relay.sh`
   → AR 이미지 push → IAP SSH → VM `radar-gw` 에서 `docker run` 재기동. **살아 있는 DMA 세션이 끊긴다.** `DMA_HOST` 는 **주입하지 않는다** — 무주입 3단 우선순위가 실행 중 컨테이너 값(`10.41.1.120`)을 보존한다(Phase 16 갭 5 실증). 주입하면 프로덕션이 mock 으로 강등된다.
2. webapp Vercel 배포 → **push 만으로 배포됐다고 가정하지 않는다** (`ignoreCommand` 가 skip 한 전례). repo root 에서 `vercel pull → build → deploy --prebuilt` 수동 경로를 쓰고 **번들 청크에 `lc.arm`·LED 토큰명이 들어갔는지 대조**한다.
3. `bash scripts/smoke-relay.sh` → INV-1~10. **INV-9 는 `SMOKE_AUTH_TOKEN` 부재 시 SKIP 이 정상**(FAIL 아님) · INV-4 는 수동 VPN 유닛이라 SKIP 가능.
4. `curl -fsS https://dma.jx1.io/healthz` → 200 · `stalledCount: 0` · `everReadyCount` 증가 확인.

**되돌리기:** `bash scripts/deploy-relay.sh --rollback 11072e4`. 단 **그 사이에 나간 주문은 되돌릴 수 없다.**

## ④ 사용자 장중 관찰 체크리스트 (배포 후, D-25 잔여)

배포가 이뤄지면 다음 거래일 장중에 사용자가 직접 확인해야 하는 6항목:

1. **76 돌파 알림 수신** — relay 로그에 `unknown-msg-type` warn 0건인 채로 돌파 종목이 흐르는가
2. **LED 3종 색과 클릭 왕복** — 매수·매도·취소 칩이 서버 상태대로 회색/주황/초록이고, 클릭 시 색이 바뀌는가. 무장 전제를 어긴 클릭에서 서버 한글 WARN 이 화면에 그대로 뜨는가
3. **미체결 표식** — 예약 `매수Q` · 접수대기 `매수P` · 시간외종가 `매수/종가`(겹치면 누적), 취소보관 행이 회색이고 취소 버튼이 없는가
4. **주문통보** — 행위 단어(취소/정정/매수/매도) · 「수동」 메타 · 「시간외종가」 접두 · 자동주문 3초 창 묶기(`#첫~끝` `(N건)`)
5. **호가 종가 표기** — 종목상세 호가 종목정보와 상따 헤더 하한 칸이 `krx_close_price > 0` 일 때 `종가` 로 바뀌는가
6. **VI 거래소 열** — KRX·NXT 양쪽 발동이 두 행으로 서고 거래소 열이 맞는가

## Files Created/Modified

- `.planning/phases/17-gh-trade-led/17-12-led-statusbar-{phone,wide}-{light,dark}.png` — 상태줄만 크롭한 LED 증거 4장
- `.planning/phases/17-gh-trade-led/17-12-led-page-{phone,wide}-{light,dark}.png` — 맥락 포함 화면 상단 4장
- `.planning/REQUIREMENTS.md` — TRADE-04·TRADE-05 Traceability 판정 + Last updated 기록
- `.planning/ROADMAP.md` — 상단 목록 Phase 17 항목 · `### Phase 17` 절(Plans 12/12 · 잔여 2건) · 17-12 plan 줄
- `.planning/STATE.md` — 프론트매터 · Current Position(사용자 결정 2건 상단 배치) · Accumulated Context(재사용 사실 9건)

## Decisions Made

- **TRADE-04 · TRADE-05 는 Pending 유지.** 코드 층위는 17-01~17-11 이 전부 닫았고 1,573 유닛/통합 + 135 e2e 가 green 이지만, ① 실기 왕복 0회 ② 배포 0회다. Phase 16 이 TRADE-03 을 실관측 전까지 Pending 으로 유지한 것과 같은 기준이다. **자동 테스트 통과는 「미검증이 아님」을 말할 뿐 「실서버에서 동작함」을 말하지 않는다.**
- **`requirements.mark-complete` 를 의도적으로 실행하지 않았다.** 워크플로가 plan frontmatter 의 `requirements: [TRADE-04, TRADE-05]` 를 자동으로 Complete 로 올리지만, 위 판정과 정면으로 어긋나므로 건너뛰고 `requirements-completed: []` 로 남겼다.
- **D-25 를 부분 수행하지 않았다.** 「일부라도 보는 것이 낫다」가 아니라, 이 경우 부분 수행의 산출물이 **거짓 양성**이기 때문이다.
- **임시 캡처 스펙을 지웠다.** `webapp/e2e/specs/zz-17-12-led-shots.spec.ts` 로 스크린샷을 찍고 삭제했다 — Task 1 의 `<files>` 가 「소스 변경 없음」이고, 가시성·순서는 이미 `3b` 케이스가, 색 규칙 19케이스는 `latch-led.test.tsx` 가 잠갔다. 남기면 같은 사실을 세 층이 말하게 된다.

## Deviations from Plan

### 1. [Rule 3 - Blocking] Task 1 의 mock 게이트웨이 실기 검증을 수행할 수 없었다

- **Found during:** Task 1 (precondition 확인 직후)
- **Issue:** plan 의 precondition 은 「gh-trade 가 HEAD 체크아웃이고 `run-mac.sh` 가 실행 가능」이다. 파일 모드상 실행 가능하지만, 그것이 실행하는 `build/stock-dma-server` 는 **2026-09-13 자 구형 바이너리**이고 HEAD 재빌드는 **Xcode 27.0 라이선스 미동의**로 막혔다(`sudo` 필요 — 사람의 행위).
- **Fix:** 자동 해소 불가. plan 의 지시(「실행 불가면 중단하고 사유를 보고한다」)에 따라 **흉내 내지 않고** 원인·바이트 실사·재개 절차를 문서화했다. 나머지 태스크는 이 항목과 독립이므로 계속 진행했다.
- **Files modified:** 없음 (문서 기록만)
- **Verification:** `build.sh` exit 69 원문 · `defaults read … IDEXcodeVersionForAgreedToGMLicense` → `26.3` · 바이너리 바이트 카운트 표
- **Committed in:** `9db45b0` 커밋 메시지 + 이 SUMMARY §②

### 2. [Rule 2 - Missing Critical] Playwright 전량 실행을 plan 밖에서 수행했다

- **Found during:** Task 1
- **Issue:** plan 의 `<verify>` 5종에 **e2e 가 없다.** 그런데 WINDOWS #14·#15 가 「Playwright 미실행 — 타입 통과로만 확인」으로 열려 있었고, 이 phase 의 11개 plan 중 2개가 e2e 스펙을 **실제로 고쳤다.** 고친 단언을 한 번도 돌리지 않고 phase 를 닫으면 그 수정이 맞는지 아무도 모른다.
- **Fix:** `pnpm --filter @gh-radar/webapp run test:e2e` 전량 실행 → **135 passed · 9 skipped · 0 failed**. 고친 단언(`trading-limit-chaser` 3·3b · `trading-vi` 거래소 열)이 전부 포함돼 통과했다.
- **Files modified:** 없음 (실행만)
- **Verification:** 위 결과 + 개별 케이스 이름 확인
- **Committed in:** `9db45b0`

### 3. [Rule 2 - Missing Critical] LED 스크린샷을 임시 Playwright 스펙으로 찍었다

- **Found during:** Task 1 ④
- **Issue:** plan 은 「스크린샷 2장(라이트·다크)」만 요구했으나, D-22 의 실제 약속은 **폰 밴드 두 줄 접힘**까지다. 그리고 §2.2b 상 밴드는 뷰포트가 아니라 **본문 폭**이 정하므로 수동 캡처로는 밴드를 짚었다는 근거가 남지 않는다.
- **Fix:** 임시 스펙으로 4조합(폰·와이드 × 라이트·다크)을 찍고 **본문 폭을 함께 측정**해 로그로 남겼다(폰 374 / 와이드 1112). 캡처 후 스펙은 삭제했다.
- **Files modified:** PNG 8장 생성 · 임시 스펙은 생성 후 삭제
- **Verification:** `17-12-led-*.png` 8장 존재 · 상태줄 높이 58px(폰) vs 36px(와이드)
- **Committed in:** `9db45b0`

### 4. [기록] `git.allow_default_branch_commits` 미설정 — 가드가 오발한다

- **Found during:** Task 1 커밋 직전
- **Issue:** `gsd-tools query git.base-branch --is-protected master` 가 `true` 를 돌려준다. 그런데 이 프로젝트는 `.planning/config.json` 에서 `git.branching_strategy: "none"` 이라 **master 직접 커밋이 설계된 워크플로**이고, 이 phase 의 앞선 11개 plan 도 전부 master 에 커밋했다.
- **Fix:** 프로젝트 설정과 181개 plan 의 이력이 명백하므로 커밋을 진행했다. **설정 파일은 건드리지 않았다** — 실행자가 단독으로 바꿀 것이 아니다.
- **권고:** `.planning/config.json` 의 `git` 블록에 `"allow_default_branch_commits": true` 를 추가하면 가드 오발이 멎는다. 사용자 결정 사항.

---

**Total deviations:** 3 처리 + 1 기록 (1 blocking-미해소 · 2 missing-critical · 1 설정 권고)
**Impact on plan:** ①은 plan 의 핵심 목표 하나를 열어 둔 채로 남겼고 그것이 TRADE-04·TRADE-05 를 Pending 으로 묶는 직접 원인이다. ②③은 plan 이 요구하지 않았으나 WINDOWS 3건과 D-22 를 닫는 데 필요했다. 스코프 확장은 없다.

## Issues Encountered

- **Xcode 27.0 라이선스 미동의가 macOS 툴체인 전체를 막았다.** `clang`·`xcrun`·`strings`·Homebrew `g++-15` 가 모두 같은 메시지를 뱉는다. 특히 `strings` 가 **에러를 내면서 exit 하는 바람에 심볼 카운트가 전부 0 으로 보였고**, 하마터면 「구형 빌드에 RateCrossAlert 도 없다」는 틀린 결론을 낼 뻔했다. `python3` 바이트 카운트로 다시 재어 바로잡았다.
- **gh-trade HEAD 가 orchestrator 가 알려준 값과 달랐다.** 전달받은 값은 `ff511d4c`(2026-09-18)였으나 실제 HEAD 는 `28a98ea0`(2026-09-20)다 — `ff511d4c` 는 HEAD 의 조상이다. `.fbs` 최종 변경도 `d7b80618` 이 아니라 `bcc011c4`(2026-09-17)였다. **재동기화 `--check` 가 차이 0 이므로 relay 생성물은 여전히 최신**이라 결론은 바뀌지 않지만, 전달값을 그대로 적지 않고 실측값을 적는다.
- `.planning/STATE.md` 가 **796줄**로 GSD 권고(150줄)를 크게 넘는다. 이 plan 이 만든 것이 아니고 축약은 별도 작업이라 손대지 않았다 — 기록만 남긴다.

## Known Stubs

없음 — 이 plan 은 소스 코드를 만들지 않았다.

## User Setup Required

**사람만 할 수 있는 행위 2건이 남았다.**

1. **`sudo xcodebuild -license`** — D-25 실기 검증의 선행 조건. 동의 후 `cd /Users/alex/repos/gh-trade/server && ./scripts/build.sh --server-only` (45s).
2. **배포 승인 (D-26)** — `deploy-now` · `defer` · `relay-only` 중 택1. **20:00 KST 이후**에만.

## Next Phase Readiness

- **Phase 18 의 코드 전제는 전부 서 있다** — 76/77/78 이 브라우저 프레임까지 도달하고(UI 없음, 의도대로), `lc.arm` 왕복과 VI 거래소 축이 닫혔다. Phase 18 은 `VI_EDIT_EXCHANGE` 상수를 상태로 바꾸고 `rate.cross.snap`·`queued.window` 를 그리기만 하면 된다.
- **다만 Phase 18 을 미배포 위에 쌓는 셈이 된다.** 배포를 `defer` 하면 Phase 17·18 두 phase 분량이 한 번에 실서버로 나가고, 문제가 생겼을 때 어느 phase 의 것인지 가리기 어려워진다. 배포 결정 시 고려 사항.
- **열린 항목:** WINDOWS #9·#10·#11(Phase 16 승계) · #12(17-01 의 `lc.arm` 미결선 메모 — 17-04 가 실제로 결선했으므로 닫아도 된다) · #16(D-22 사용자 승인 대기) · **신규: D-25 미수행**.

---
*Phase: 17-gh-trade-led*
*Completed: 2026-09-20 (배포 승인 checkpoint 에서 정지)*

## Self-Check: PASSED

- 생성 파일 9종(SUMMARY + PNG 8장) 전부 디스크에 존재 (`[ -f ]`)
- 태스크 커밋 2건(`9db45b0` · `3203da1`) `git log --oneline --all` 에서 확인
- 임시 캡처 스펙(`webapp/e2e/specs/zz-17-12-led-shots.spec.ts`) 삭제 확인 — 저장소에 잔재 없음
- Task 1 acceptance: 자동 게이트 5종 전부 PASS · 관측 5항목은 각각 「mock 에서 관측 불가」로 사유와 함께 명시 · 스크린샷 2장 요구에 8장 · `--check` 차이 0
- Task 2 acceptance: `grep -c "TRADE-04\|TRADE-05" REQUIREMENTS.md` = **6** (≥4) · `grep -c "17-12-PLAN.md" ROADMAP.md` = **1** (≠0) · `grep -c "Phase 17" STATE.md` = **44** (≠0) · ROADMAP plan 줄 17-01~17-12 **12건** · 정의부 `[ ]` 와 Traceability Pending 일치 · 커밋은 main(master) 체크아웃에서 수행
- Task 3 acceptance: server 생략 근거 4종(명령+출력) 기록 · pathspec 없는 `git status --short` 전문 기록 · 커밋 76건 기록 · KST 19:31 기록 · **배포 스크립트 미실행**
- Task 4: 정지(blocking-human) · Task 5: 미착수
