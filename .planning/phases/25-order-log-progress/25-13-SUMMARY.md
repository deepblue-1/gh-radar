---
phase: 25-order-log-progress
plan: 13
subsystem: relay
tags: [relay, hub, unf.progress, session-replacement, gap-closure, WR-02, vitest]

# Dependency graph
requires:
  - phase: 25-06
    provides: "hub 잔량진행률 캐시 · #onQueueProgress 빈→빈 억제 · #clearCaches 진행률 폐기 · 인증 직후 unf.progress snap"
  - phase: 25-12
    provides: "라이브 relay:6289e430 · 배포 기록 · detached worktree 배포 절차 · 롤백 대상"
provides:
  - "SubscriptionHub#clearCaches — 진행률 키를 1개 이상 지웠으면 그 userId 에게만 unf.progress snap:true entries:[] 1프레임(WR-02)"
  - "fanout P4 — 이미 연결된 실 ws 가 세션 교체 초기화 스냅을 받고, 새 세션 빈 83 억제 뒤에도 옛 키가 남지 않는다(fanout 레벨 증명)"
  - "hub 교체 경계 테스트 4건(WR-02) — 초기화 스냅 · 무진행률 무프레임 · 사용자 격리 · 교체 뒤 억제/재충전/옛 세션 무시"
affects: [25-VERIFICATION 재검증(WR-02), 25-12 첫 거래일 UAT(relay:6821181b 위에서 진행), quick-260929-vzy 배포(동반 완료)]

# Actuals (#2632 · #3968) — commits 는 측정값(git rev-list --count 9a3ab0b6..HEAD = 5, 마감 docs 커밋 전).
# tokens = 실제 diff(4파일 · relay 3 + e2e spec 1) chars + 이 SUMMARY chars, 합 /4.
actuals:
  tokens: 8804
  tasks: 3
  commits: 5
plan_head_before: 9a3ab0b6794b3aeb10bd188c1f523b076b080488

tech-stack:
  added: []
  patterns:
    - "캐시를 브라우저 모르게 비우는 자리에서 브라우저 사본도 같은 모양(snap:true)으로 비운다 — 억제 최적화의 「캐시 = 사본」 가정을 깨는 곳에서 가정을 복원"
    - "오늘 미도달 경로는 SessionManager 대신 hub.attach(교체 대역)으로 만들어 hub → WsFanout → 실 ws 로 증명"

key-files:
  created: []
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/tests/fanout.test.ts
    - relay/tests/hub.test.ts
    - webapp/e2e/specs/trading-workbench.spec.ts  # 배포 게이트 중 메인 세션 편차(6821181b) — 테스트 단언만

key-decisions:
  - "WR-02 수정은 (a) 의 시점 + (b) 의 프레임 모양 — #clearCaches 안에서 지운 키가 1개 이상이면 snap:true entries:[] 1프레임. 키마다 snap:false 도, ready 시점 snap 도 쓰지 않는다(D-13 보존)"
  - "entries 는 캐시 getter 가 아니라 빈 리터럴 — 루프/팬아웃 순서가 바뀌어도 옛 값을 다시 내보내지 않는다"
  - "#onQueueProgress · #onReady 는 바이트 단위 무변경(region diff UNCHANGED) — 한 세션 안 D-13 · 억제 가드 · 필터 · Ready 게이트 그대로"
  - "Task 3 은 (A) quick-260929-vzy 동반 배포 — relay:6821181b · push 6289e430..6821181b · Vercel 프로덕션 같은 sha(메인 세션 · 2026-09-30 01:12~01:14 KST)"

patterns-established:
  - "억제(빈→빈) 최적화가 있는 캐시를 비우는 경로는 반드시 연결된 사본에도 비움을 알린다"

requirements-completed: []

coverage:
  - id: D1
    description: "세션 교체 때 이미 연결된 브라우저의 진행률 사본까지 비운다 — #clearCaches 초기화 스냅(그 userId 한정 · 지운 키 있을 때만 1프레임)"
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#P4 세션 교체 — 이미 연결된 탭이 진행률 초기화 snap:true 를 받고, 새 세션의 빈 83 억제 뒤에도 옛 키가 남지 않는다 (WR-02 · Pitfall 6)"
        status: pass
      - kind: unit
        ref: "relay/tests/hub.test.ts#세션 교체(#clearCaches) 뒤 옛 진행률이 남지 않는다 (T-25-26 · Pitfall 6) — 이미 연결된 브라우저 사본도 비운다 (WR-02)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts -t unf.progress (snap:true entries [] 는 Map 을 비운다 · 무변경)"
        status: pass
    human_judgment: false
  - id: D2
    description: "교체 경계 잠금 — 무진행률 교체 무프레임 · 사용자 격리 · 교체 뒤 빈 83 억제 / 재충전 / 옛 세션 늦은 83 무시"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#진행률이 없던 사용자의 세션 교체는 unf.progress 를 내지 않는다 (WR-02 · 소음 0)"
        status: pass
      - kind: unit
        ref: "relay/tests/hub.test.ts#세션 교체 초기화 스냅은 그 사용자에게만 — 다른 사용자의 진행률 · 팬아웃은 그대로 (WR-02 · T-15-02)"
        status: pass
      - kind: unit
        ref: "relay/tests/hub.test.ts#교체 뒤 새 세션의 빈 83 은 억제 · 비어 있지 않은 83 은 다시 채움 · 옛 세션의 늦은 83 은 무시 (WR-02 · T-25-27)"
        status: pass
    human_judgment: false
  - id: D3
    description: "relay 프로덕션 배포 — (A) vzy 동반 · relay:6821181b · push 6289e430..6821181b · Vercel Ready (Task 3 메인 세션)"
    verification:
      - kind: smoke
        ref: "scripts/smoke-relay.sh — PASS 10 · FAIL 0 · SKIP 2(INV-9 토큰 미설정 · INV-10 로컬 자격 — 둘 다 예상)"
        status: pass
      - kind: command
        ref: "GET /healthz — status ok · version 6821181b · dma true · stalledCount 0 · journal.state live · journal.strategy 존재 · journalGateways.KYOBO.alerting false"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts (deferred 기존 실패 3건 제외) — 64 passed(setup 1 + 63) @6821181b"
        status: pass
    human_judgment: false
    rationale: "배포 · smoke · push 는 메인 세션 실행 결과를 전달받아 기록(executor 미실행). 세션 교체 경로는 오늘 운영 미도달이라 운영 관측 항목 없음 — 증명은 D1 · D2 테스트"

# Metrics
duration: 약 37분(00:50 착수 → 01:27 KST 마감 · Task 1~2 executor 약 6분 + Task 3 메인 세션 배포 · 게이트)
completed: 2026-09-30
status: complete
---

# Phase 25 Plan 13: 세션 교체 뒤 진행률 잔존 갭 클로징(WR-02) Summary

**`SubscriptionHub#clearCaches` 가 그 사용자의 진행률 키를 하나라도 지우면 같은 호출 안에서 `{t:"unf.progress", snap:true, entries:[]}` 를 그 userId 에게만 1프레임 팬아웃한다 — 이미 연결된 브라우저 사본도 비워, 새 세션의 빈 83 이 빈→빈 억제에 걸려도 옛 진행률이 남지 않는다. fanout P4(실 ws)와 hub 4건이 증명하고, relay 731 → 735(+4) · 웹 3049 · Playwright unfilled-progress 7 이 green. 메인 세션이 quick-260929-vzy 와 함께 `relay:6821181b` 로 배포(smoke FAIL 0 · healthz version 6821181b)한 뒤 `6289e430..6821181b` 를 fast-forward push 해 Vercel 프로덕션까지 나갔다.**

## Performance

- **Duration:** 약 6분 (Task 1~2 · executor)
- **Started:** 2026-09-29T15:50:44Z (2026-09-30 00:50 KST)
- **Task 1~2 완료:** 2026-09-29T15:56:36Z (00:56 KST)
- **Task 3(메인 세션):** relay 배포 01:12 KST · push 01:14:39 KST · Vercel 01:14:42 KST
- **Completed:** 2026-09-29T16:27:41Z (2026-09-30 01:27 KST, 마감)
- **Tasks:** 3/3
- **Files modified:** 4 (relay 소스 1 · relay 테스트 2 · webapp e2e spec 1 — 마지막은 배포 게이트 편차)

## Accomplishments

- WR-02 근본 수정 — 「hub 캐시 = 브라우저 사본」 가정을 깨는 유일한 자리(`#clearCaches`)에서 사본도 같이 비운다
- fanout 레벨 증명(검증기 지적 「fanout 레벨 증명 없음」 해소) — 실 ws 가 [인증 스냅 · KRX 라이브 · 교체 초기화 스냅 · NXT 라이브] 정확히 4프레임, KRX 빈 83 프레임 없음, `dmaUserId` 없음
- 교체 경계 3건 잠금 — 무진행률 교체 0프레임(T-25-55) · user-2 무영향(T-15-02 · T-25-53) · 교체 뒤 억제/재충전/옛 세션 무시(T-25-27)
- D-13 보존 — `#onQueueProgress` · `#onReady` region diff `UNCHANGED`
- 배포 사실 수집(읽기 전용) — 아래 「배포 준비」 (a)~(f)
- 프로덕션 반영 — (A) vzy 동반 배포 · `relay:6821181b` · smoke FAIL 0 · push `6289e430..6821181b` · Vercel Ready(아래 「Task 3 — 배포 기록」)

## Task Commits

1. **Task 1 (tracer · TDD): 세션 교체 → 이미 연결된 브라우저 한 경로**
   - RED `9d1c5523` test(25-13): 세션 교체 진행률 초기화 스냅 실패 테스트 (WR-02 RED)
   - `23ea383a` test(25-13): 교체 세션 대역 허용 계좌를 RelayAccount 로 맞춤 (편차 1 — typecheck:tests)
   - GREEN `50c281ea` fix(25-13): 세션 교체 때 이미 연결된 브라우저 진행률 사본도 비움 (WR-02)
2. **Task 2: 경계 3건 + 게이트 + 배포 사실** — `e77acfc6` test(25-13): 세션 교체 진행률 경계 3건 잠금 (WR-02)
3. **Task 3: 메인 세션 배포** (checkpoint:human-action · 사용자 선택 A)
   - `6821181b` test(25-13): 작업대 e2e buy3_schema 단언 1 → 2 — 새 웹은 자동 필드 동반(quick-260929-vzy 누락분) (편차 3 — 메인 세션 커밋 · 테스트 단언만)
   - 배포 · smoke · push · Vercel 는 메인 세션 실행(아래 표)

**Plan metadata:** `docs(25-13)` 마감 커밋(이 SUMMARY · STATE · ROADMAP)

## TDD 기록 (Task 1)

**RED — 두 테스트 모두 목표 단언에서 실패** (`gsd-tools check tdd-red-evidence` → 둘 다 `RED_EVIDENCE_OK · target_test_failed`):

- **fanout P4:** `Error: 조건이 서지 않았습니다: 교체 초기화 스냅` — `h.hub.attach(replacement)` 뒤 연결된 ws 의 snap:true `unf.progress` 가 1건(인증 스냅)에서 늘지 않음. (`Tests 1 failed | 67 skipped`)
- **hub 세션 교체 테스트:** `AssertionError: expected { Object (t, snap, ...) } to deeply equal { t: 'unf.progress', snap: true, …(1) }` — `progressFrames().at(-1)` 이 교체 전 라이브 프레임(`snap:false · x:"KRX" · items[orderNo 12453]`) 그대로, 초기화 스냅 없음. (`Tests 1 failed | 5 passed | 23 skipped`)

**GREEN:** `#clearCaches` 진행률 루프에서 지운 수를 세고 `> 0` 이면 `this.#fanout(userId, { t: "unf.progress", snap: true, entries: [] })`. P4 ✓ · hub 진행률 describe 6/6 ✓ · 웹 `relay-socket.test.ts -t unf.progress` 4 passed(무변경).

**REFACTOR:** 없음.

**Tracer 게이트:** interactive · `end-of-phase` · verify 는 automated 만 → Task 1 verify 3개 재실행 전부 통과 → 확장(Task 2) 진행.

## Files Created/Modified

- `relay/src/hub/subscription-hub.ts` — `#clearCaches` 진행률 블록: 지운 수 계수 + 조건부 초기화 스냅 + 주석 5항(가정 · 모양 · 무소음 · 정직한 도달 범위 · D-13/T-15-02)
- `relay/tests/fanout.test.ts` — 파일 수준 `ReplacementSession`(EventEmitter · HubSession · `pushFrame`) + describe 「unf.progress (Phase 25)」 P4
- `relay/tests/hub.test.ts` — 기존 세션 교체 테스트 확장(이름 끝 「— 이미 연결된 브라우저 사본도 비운다 (WR-02)」) + 신규 3건

## 게이트 (Task 1~2 · 메인 트리 · HEAD e77acfc6 과 같은 트리)

| 게이트 | 결과 |
|---|---|
| relay 통과 수 — 착수 전(9a3ab0b6) | **30 files · 731 passed** |
| shared build · relay typecheck · typecheck:tests · relay test | exit 0 · **30 files · 735 passed** (= 731 **+4**: P4 1 + hub 신규 3) |
| `vitest hub.test.ts -t WR-02` | 4 passed (✓ 줄 4개 모두 WR-02) |
| webapp typecheck · webapp test | exit 0 · **136 files · 3049 passed · 1 skipped** (stderr 의 `fetch failed` 로그는 실패 경로를 모킹한 기존 테스트 출력 — 실패 아님) |
| Playwright `e2e/specs/unfilled-progress.spec.ts` | **7 passed**(setup 1 + P25-P1~P6) · 14.2s · `.next` 캐시 문제 없음 |
| Task 1 AC — `#clearCaches` 안 `t: "unf.progress", snap: true, entries: []` | 1 |
| Task 1 AC — `#onQueueProgress` · `#onReady` region diff vs PLAN_BASE | `UNCHANGED` · exit 0 |
| Task 1 AC — webapp · packages · supabase · server · relay/src/{generated,ws,dma} diff | 0줄 (e77acfc6 시점 · 마감 시점은 e2e spec 1줄 — 편차 3) |
| Task 2 AC — `relay/src webapp packages supabase server` diff | `relay/src/hub/subscription-hub.ts` 1줄 (e77acfc6 시점 · 마감 시점은 + `webapp/e2e/specs/trading-workbench.spec.ts` — 편차 3) |
| 배포 명령 실행 | 없음(`deploy-relay.sh` · `smoke-relay.sh` · `git push` · `gcloud compute ssh` 미실행) |

## 배포 준비 (Task 2 ③ · 읽기 전용 · 2026-09-30 00:5x KST 수집)

**(a) 새 relay 이미지에 실릴 커밋** — `git log --format='%h %s' 6289e430..HEAD -- relay/ packages/shared/`:

```
e77acfc6 test(25-13): 세션 교체 진행률 경계 3건 잠금 (WR-02)
50c281ea fix(25-13): 세션 교체 때 이미 연결된 브라우저 진행률 사본도 비움 (WR-02)
23ea383a test(25-13): 교체 세션 대역 허용 계좌를 RelayAccount 로 맞춤
9d1c5523 test(25-13): 세션 교체 진행률 초기화 스냅 실패 테스트 (WR-02 RED)
bf36a28f feat(quick-260929-vzy): 자동만 켠 등록은 삭제 아님 — relay #isTeardown · 웹 isDeleteIntent/crudOf 다섯 항 · isActiveStrategy · LC_GATE_FIELDS
d261c8d0 test(quick-260929-vzy): 자동 계약 의미 실패 테스트 — buy3_schema 파생 · 12필드 판정 분리 · 57키 · 자동만 켠 등록 비철거 · 미등록 등록 필드
fb175921 feat(quick-260929-vzy): 후매수 「자동」 트레이서 — shared postBuyAuto · relay buy3_schema 2 파생 · 60/64 디코드 · 후매수 제목줄 체크 · e2e vzy-1
127c1028 chore(quick-260929-vzy): relay 생성물 — SetLimitChaser post_buy_auto(vtable 132) · gh-trade dcaa78b1 합성 그대로(동기화 스크립트 재실행 없음 · Phase 25 생성물 보존)
```

라이브 relay 는 `relay:6289e430`(25-12 기록 · (e) 로 재확인). vzy 가 바꾼 생성물 · shared: `packages/shared/src/relay.ts` · `relay/src/generated/StockDMA.fbs` · `relay/src/generated/stock-dma/set-limit-chaser.ts`.

**(b) push 로 함께 나갈 웹 변경** — `git log --format='%h %s' 6289e430..HEAD -- webapp/`: 전부 quick-260929-vzy 6커밋(`25ba301d` · `b8db4c3c` · `eac3a60e` · `bf36a28f` · `d261c8d0` · `fb175921`). **이 플랜 몫 0.**

**(c) server · 스키마** — `git diff --name-only 6289e430..HEAD -- server/ supabase/`: **0줄** → server 배포 불필요 · `supabase db push` 불필요.

**(d) push 가능성 · 로컬 상태**
- `git fetch origin master` 뒤 `origin/master` = `6289e430` · `git rev-list --left-right --count origin/master...HEAD` = **`0 17`** → fast-forward push 가능(뒤처짐 0).
- 앞선 17커밋 = 이 플랜 4 + 25-13 플랜/검증/리뷰 docs 3(`9a3ab0b6` · `8e674190` · `508cbee2`) + 25-12 docs 2(`7da6873c` · `b099f9d8`) + vzy docs 1(`73321ebc`) + vzy 코드 7.
- `git status --porcelain --untracked-files=no`: ` M .planning/STATE.md` · ` M .planning/state.json` — 오케스트레이터 미커밋 편집(이 플랜 소관 아님 · 건드리지 않음). 미추적: `.planning/milestone.lock` · `.planning/quick/260928-cs1-toast-top-right/shots/` · `.planning/research/.cache/`(남의 것 · 무시) + 이 SUMMARY(당시 초안).
- worktree: 25-12 의 `…/8e295819-…/scratchpad/wt-p25-deploy` 가 **남아 있음**(detached `6289e430`) → Task 3 에서 `git -C <wt> checkout --detach <배포 sha>` 로 재사용 가능. 별도 `…/1cbdb906-…/scratchpad/wt-master`(detached `4fecb341`, 다른 세션 것 — 건드리지 않음).

**(e) 라이브 공개 `/healthz`** (`https://dma.jx1.io/healthz` · 읽기 전용 GET): `status:"ok"` · **`version:"6289e430"`** · `dma:true` · `stalledCount:0` · `journal.state:"live"` · `journal.strategy` 존재 · `journalGateways.KYOBO.alerting:false`.

**(f) Task 3 선택지**

| 선택 | 배포 sha / push 범위 | 추가 게이트(메인 세션 · 배포 sha detached worktree) | 롤백 대상 | 비고 |
|---|---|---|---|---|
| **(A) vzy 동반 배포 — 권장** | 브랜치 끝(현재 `e77acfc6`, 이 SUMMARY 마감 커밋을 먼저 하면 그 sha — docs 만 추가) · push `6289e430..<sha>` fast-forward | relay: `pnpm install --frozen-lockfile --offline` → shared build → relay typecheck · typecheck:tests → relay test(735 기대). 웹: 이 플랜 Task 2 가 같은 코드 트리(e77acfc6)에서 web typecheck · unit(3049) · Playwright unfilled-progress(7) 를 돌림 — **Playwright trading-workbench(vzy-1 · P24-7 포함, deferred 기존 실패 3건 제외)는 이 플랜에서 돌리지 않았으므로 다시 돌린다** | relay `relay:6289e430`(`deploy-relay.sh --rollback 6289e430`) · 웹은 Vercel 직전 프로덕션 `gh-radar-webapp-h63g4g7e0`(6289e430) | relay 재기동 1회로 vzy 배포 메모(relay 먼저 → push)까지 해결. gh-trade 실배포 1712001c 가 post_buy_auto 를 이미 읽음(25-12 기록). 열린 탭 · 앱 WebView 새로고침 안내 필요 |
| **(B) 수정만 — 비권장** | `6289e430` 위에 `50c281ea`(+ 테스트 `9d1c5523` · `23ea383a` · `e77acfc6`) cherry-pick 한 배포 브랜치 · push 는 하지 않거나 별도 결정(브랜치가 master 와 갈라짐) | 그 배포 브랜치의 detached worktree 에서 relay 전체 게이트(735 기대) | `relay:6289e430` | vzy 는 여전히 미배포로 남고, 이후 브랜치 병합 부담 · 웹 무변경이라 Vercel 영향 없음 |
| **(C) 보류** | 없음 · 미push | 없음 | 해당 없음 | 오늘 운영 도달 경로가 좁아(아래 「정직한 도달 범위」) 긴급하지 않음. 다음 창: 2026-09-30 20:00 KST 이후 |

**배포 창 주의.** 수집 시각은 2026-09-30(수, 거래일) 00:5x KST — 장(08:00~20:00) 밖이라 지금은 배포 창 안이지만 **08:00 KST 전에 끝나야** 한다. 25-12 의 첫 거래일 UAT(9/30 장중)는 배포된 relay 위에서 돈다 — (A) 면 UAT 대상 relay 가 vzy(buy3_schema 2) 포함본으로 바뀐다.

## 정직한 도달 범위

오늘 `SessionManager.acquire` 는 refCount 0(그 사용자의 탭 0개)이고 부트 실패 세션일 때만 세션을 새로 세운다(`relay/src/dma/session-manager.ts`). 그래서 운영에서 세션 교체 순간에 이 초기화 프레임을 받을 연결은 **보통 없고, 운영 관측 항목도 없다** — 배포 뒤에는 healthz 정상과 기존 진행률 표면 무회귀만 본다. 그런데도 수정하는 이유는 `fanout.ts` `#register` 세션 교체 갈래와 같다: hub 는 호출자의 재생성 정책에 기대지 않고 계약을 지킨다 — 재생성 조건이 완화되면 잔존이 조용히 되살아나기 때문이다. 같은 이유로 fanout 증명은 `SessionManager` 가 아니라 `h.hub.attach(ReplacementSession)` 으로 교체를 만든다(대역 JSDoc 에 기록). 25-VERIFICATION human_verification (e) 진행률 UAT 는 별도다.

## Decisions Made

- 초기화 프레임 모양은 인증 직후 스냅과 같은 `snap:true entries:[]` 1프레임 — 지운 것이 그 사용자 키 전부라 알릴 사실이 「전부 없음」 하나이고, 기존 탭과 새로 붙는 탭이 같은 상태로 수렴한다.
- 지운 키가 없으면 보내지 않는다 — 사본은 캐시를 거친 값뿐이라 캐시가 비었으면 사본도 비어 있다.
- `#onQueueProgress` · `#onReady` 는 건드리지 않는다(D-13 · Pitfall 4 · T-25-27).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 교체 세션 대역의 허용 계좌 타입 불일치**
- **Found during:** Task 1 (RED 커밋 뒤 GREEN 전 typecheck:tests)
- **Issue:** 플랜대로 `readonly allowedAccounts = SAMPLE_ACCOUNTS` 로 두면 `FakeAccount.name`(선택)이 `RelayAccount.name`(필수)과 맞지 않아 `tsc -p tsconfig.tests.json` 이 TS2416 · TS2345 로 실패(vitest 는 타입을 보지 않아 통과).
- **Fix:** `readonly allowedAccounts: readonly RelayAccount[] = SAMPLE_ACCOUNTS.map((a) => ({ accountNo: a.accountNo, name: a.name ?? "" }))` + `RelayAccount` type import. GREEN 커밋이 소스 1파일만 담도록 별도 `test(25-13)` 커밋으로 분리.
- **Files modified:** relay/tests/fanout.test.ts
- **Verification:** typecheck:tests exit 0 · P4 여전히 통과
- **Committed in:** `23ea383a`

**2. [기록 — 도구 적합] RED 증거 기록의 TAP 요약 줄**
- vitest `--reporter=tap-flat` 출력에는 `gsd-tools check tdd-red-evidence` 가 읽는 node:test 요약(`# tests/# pass/# fail`)이 없어 그대로면 `zero_tests_discovered` 로 분류된다. 같은 실행의 실행된(비 SKIP) `ok`/`not ok` 줄 수를 세어 요약 줄을 붙인 뒤 분류했다(투영 · 결과 조작 아님) → P4 · hub 둘 다 `RED_EVIDENCE_OK`.

---

**3. [Rule 1 - Bug · 메인 세션] 작업대 e2e 의 buy3_schema 단언이 vzy 이후 웹 계약과 어긋남**
- **Found during:** Task 3 (배포 게이트 — Playwright trading-workbench, (A) 선택 시 플랜이 요구한 재실행)
- **Issue:** P24-1 이 `expect(last.buy3Schema).toBe(1)` 에서 2 를 받아 결정적으로 실패. vzy 이후 웹 폼은 lc.set 에 `postBuyAuto` 를 항상 싣고(기본 false · 에코 값) relay 는 필드 존재로 buy3_schema 2 를 파생한다 — 설계대로이고 gh-trade dcaa78b1 이 지원. 제품 결함이 아니라 vzy 가 P24-1 · P24-3 · P24-12 의 단언 1 을 갱신하지 않은 테스트 누락(vzy 는 vzy-1 · P24-7 만 실행).
- **Fix:** 세 단언을 1 → 2 로 정정(제품 코드 무변경).
- **Files modified:** webapp/e2e/specs/trading-workbench.spec.ts
- **Verification:** trading-workbench(deferred 3건 제외) 64 passed(setup 1 + 63) · webapp typecheck(앱 + e2e) exit 0
- **Committed in:** `6821181b` (메인 세션)
- **Acceptance 영향:** Task 1 acceptance 「`git diff --name-only PLAN_BASE..HEAD -- webapp packages supabase server relay/src/generated relay/src/ws relay/src/dma` 0줄」 은 마감 시점에 `webapp/e2e/specs/trading-workbench.spec.ts` **1줄**을 낸다. 이 파일은 제품 코드가 아니라 e2e 테스트 단언 정정이며, Task 1 · 2 커밋 시점(e77acfc6)에는 0줄이었다. 웹 제품 코드 · shared · 스키마 · server · 생성물 · 팬아웃 · 파서 무변경이라는 원래 취지는 그대로다.
- **배포 sha 영향:** 예정 `e77acfc6` → 실제 `6821181b`(차이는 e2e spec 1파일 · relay 이미지 내용 동일).

---

**Total deviations:** 2 auto-fixed(Rule 3 1 · Rule 1 1 — 후자는 메인 세션) + 1 도구 기록
**Impact on plan:** 테스트 대역 타입 · e2e 단언만 바뀜 · 제품 동작 · 범위 무변경. 배포 sha 가 e2e 커밋 1개만큼 이동.

## TDD Gate Compliance

- RED: `9d1c5523 test(25-13)` ✓ (RED_EVIDENCE_OK × 2)
- GREEN: `50c281ea fix(25-13)` ✓ — 플랜이 GREEN 커밋 타입을 `fix` 로 지정(갭 클로징 버그 수정)했으므로 `feat(25-13)` 패턴 검사에는 걸리지 않는다. RED(test) 가 GREEN(fix) 보다 먼저인 순서는 충족.
- REFACTOR: 없음.

## Issues Encountered

- Task 1~2 게이트: 이 플랜 밖 기존 실패 관측 없음.
- Task 3 배포 게이트: vzy 가 남긴 e2e 단언 누락(편차 3)을 발견 · 수정. Playwright trading-workbench 의 기존 deferred 실패 3건(「5. 격자」 「P20-3 최악값」 「종목 추가 입력이 16px」)은 종전대로 제외(이 플랜 범위 밖).

## User Setup Required

None — 외부 서비스 설정 없음. 열린 탭 · 앱 WebView 새로고침 안내는 메인 세션이 전달.

## Task 3 — 배포 기록 (메인 세션 실행 · 사용자 선택 A · 2026-09-30 KST)

executor 는 배포 · smoke · push · VM 접속 · gcloud/Vercel 명령을 실행하지 않았다. 아래는 메인 세션이 전달한 결과다.

### 배포 기록 표

| 단계 | 결과 |
|---|---|
| 1. 선택 | **(A) quick-260929-vzy 동반 배포** |
| 2. 배포 게이트 중 발견 · 수정 | Playwright trading-workbench(기존 deferred 3건 「5. 격자」 「P20-3 최악값」 「종목 추가 입력이 16px」 제외)에서 **P24-1 결정적 실패** — `expect(last.buy3Schema).toBe(1)` 에 2 수신. 원인: vzy 이후 웹 폼이 lc.set 에 `postBuyAuto` 를 항상 싣고(`webapp/src/lib/limit-chaser.ts` 기본 false · 에코 값), relay 는 존재만으로 buy3_schema 2 를 파생(설계대로 · gh-trade dcaa78b1 지원). 제품 동작은 정상이고, vzy 가 P24-1 · P24-3 · P24-12 의 단언 1 을 갱신하지 않았다(vzy 는 vzy-1 · P24-7 만 실행). 수정 **`6821181b`**(e2e spec 1파일 · 제품 코드 무변경) → 재실행 **64 passed**(setup 1 + 63) · webapp typecheck(앱 + e2e) exit 0 |
| 3. 배포 sha | **`6821181b`** — 착수 때 예정 `e77acfc6` 에서 위 e2e 커밋만큼 이동(차이는 e2e spec 1파일 · relay 무변경) |
| 4. detached worktree 게이트 | `wt-p25-deploy`(e77acfc6 에서 실행 → 6821181b 로 이동 · porcelain 0줄): `pnpm install --frozen-lockfile --offline` OK · shared build OK · relay typecheck · typecheck:tests exit 0 · relay test **30 files · 735 passed** · gh-trade master `sync-relay-schema.sh --check` OK(신규/변경 0 · .fbs 최신) |
| 5. 롤백 대상(배포 전 기록) | relay **`relay:6289e430`** · 웹 Vercel **`gh-radar-webapp-h63g4g7e0`**(6289e430) |
| 6. relay 배포 | 01:12 KST 시작 · detached worktree @6821181b 에서 `deploy-relay.sh`(SUPABASE_URL · NOTIFICATION_CHANNEL_ID 라이브 값 · **DMA_HOST / DMA_KYOBO_HOST 미주입**) → 로그 두 항목 모두 「실행 중 컨테이너 보존 · 이번 배포로 바뀌지 않는다」. 새 이미지 **`relay:6821181b`** · 직전 **`relay:6289e430`** · uptime check · 알림 정책 · KYOBO 감시 갱신 OK (실주소는 적지 않는다 — T-25-58) |
| 7. smoke · healthz | `smoke-relay.sh` **PASS 10 · FAIL 0 · SKIP 2**(INV-9 SMOKE_AUTH_TOKEN 미설정 — 정상 · INV-10 로컬 Supabase 자격 미해석 — 로컬 한정) · KYOBO 감시 판정 「일치」. `/healthz`: `status:"ok"` · **`version:"6821181b"`** · `dma:true` · `stalledCount:0` · `journal.state:"live"` · `journal.strategy` 존재 · `journalGateways.KYOBO.alerting:false` |
| 8. push | 01:14:39 KST `git push origin 6821181b:refs/heads/master` → **`6289e430..6821181b`** fast-forward(18커밋). server/ · supabase/ 무변경(Task 2 (c) 0줄)이라 server 배포 · `supabase db push` 없음 |
| 9. Vercel | 프로덕션 배포 **`gh-radar-webapp-1ybg8njmt`**(`dpl_HKNmoxc1mC6pGxv9C3kvsDZoVssP`) · 01:14:42 KST 생성 · **Ready** · alias `gh-radar-webapp.vercel.app` 가 이 배포를 가리킴 |
| 10. 새로고침 안내 | vzy 웹 변경이 실렸으므로 열린 탭 · 앱 WebView 새로고침 필요 — 메인 세션이 사용자에게 안내 |
| 11. 운영 관측 | healthz 정상. 이 수정의 교체 경로는 오늘 탭 0개일 때만 도달하므로 운영 관측 항목 없음(아래 「정직한 도달 범위」). 25-VERIFICATION human_verification (e) 진행률 UAT 는 별도. 오늘(9/30) 장중 25-12 첫 거래일 UAT 는 vzy 포함본 `relay:6821181b` 위에서 돈다 |

### 이 배포에 함께 실린 25-13 밖 변경

- relay · shared · 생성물: quick-260929-vzy `127c1028` · `fb175921` · `d261c8d0` · `bf36a28f`(buy3_schema 2 파생 · post_buy_auto vtable 132 · #isTeardown)
- webapp: quick-260929-vzy 6커밋(`25ba301d` · `b8db4c3c` · `eac3a60e` · `bf36a28f` · `d261c8d0` · `fb175921`) — 후매수 「자동」 체크
- 25-12 에서 「실리지 않은 것」 으로 남겨 둔 vzy 7커밋이 이번 배포로 모두 나갔다(vzy 배포 메모 「relay 먼저 → push」 충족)

### 롤백 방법 (실행하지 않음 — 필요 시)

- relay: `GCP_PROJECT_ID=gh-radar SUPABASE_URL=<라이브 값> bash scripts/deploy-relay.sh --rollback 6289e430` → `bash scripts/smoke-relay.sh`. 6289e430 은 Phase 25 전체(전략 스트림 · 83 진행률) 포함 · vzy 와 WR-02 수정만 빠진 이미지다. 단 웹을 그대로 두면 새 웹의 `postBuyAuto` 는 옛 relay 에서 무시된다 — 웹도 함께 되돌리는 것이 안전.
- webapp: Vercel 대시보드에서 직전 프로덕션 `gh-radar-webapp-h63g4g7e0`(6289e430) 을 promote(또는 revert 커밋 push).
- server · DB: 이번 배포에서 바뀌지 않아 롤백 대상 없음.
- 배포 worktree `wt-p25-deploy`(detached 6821181b)는 롤백 · 재배포 대비로 남겨 둠.

## Next Phase Readiness

- Phase 25 플랜 13/13 완료 · 프로덕션(relay:6821181b · Vercel 6821181b) 반영. 다음은 25-VERIFICATION 재검증(갭 WR-02 — 별도 `-R2` 파일 규율)과 25-12 첫 거래일 UAT · human_verification (e) 진행률 UAT(오늘 장중 · 새 relay 위).

## Self-Check: PASSED

- FOUND: relay/src/hub/subscription-hub.ts · relay/tests/fanout.test.ts · relay/tests/hub.test.ts
- FOUND: webapp/e2e/specs/trading-workbench.spec.ts (편차 3)
- FOUND commits: 9d1c5523 · 23ea383a · 50c281ea · e77acfc6 · 6821181b (6821181b 는 origin/master 조상 — push 반영 확인)
- measured commits: `git rev-list --count 9a3ab0b6..HEAD` = 5 (마감 docs 커밋 전)
- Task 1 AC 재실행: `#clearCaches` 안 초기화 스냅 리터럴 1 · `grep -c WR-02 relay/tests/hub.test.ts` = 4
- Task 3 AC: 선택(A) · 배포 sha 6821181b · relay 새 `relay:6821181b` / 직전 `relay:6289e430` · smoke PASS 10 / FAIL 0 / SKIP 2 · healthz version 6821181b · push `6289e430..6821181b` · Vercel `gh-radar-webapp-1ybg8njmt` Ready — 전부 기록
- executor 실행 기록에 `deploy-relay.sh` · `smoke-relay.sh` · `git push` · `gcloud` · `vercel` 없음(결과는 메인 세션 전달분)

---
*Phase: 25-order-log-progress*
*Completed: 2026-09-30*
