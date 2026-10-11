---
phase: 26-shared-quote-feed
plan: 05
subsystem: testing
tags: [e2e, playwright, relay, quote-feed, fixture, d-17]

requires:
  - phase: 26-02
    provides: "스텁 게이트웨이 quote 모드 — respondQuoteLogin · waitForQuoteConnection · role 1 로그인 분리 기록"
  - phase: 26-04
    provides: "RelayConfig.dmaQuoteObserverSecret(D-17 · quote 키만으로 quote 연결) · 부팅 결선 quoteFeed.start()"
provides:
  - "e2e 픽스처가 relay env 에 DMA_QUOTE_OBSERVER_SECRET(E2E_QUOTE_SECRET · test-only)을 항상 넣고, 부팅 전 respondQuoteLogin({ success: true })"
  - "LocalRelay.userSocket() — LoginReq(1) 를 보낸 사용자 세션 소켓만(게이트웨이 첫 소켓 지름길 제거)"
  - "LocalRelay.quoteSocket() — role 1 로그인 소켓(waitForQuoteConnection)"
  - "spec 8곳 소켓 선택 명시 — 사용자 세션 프레임 7곳 userSocket · 체결 주입 1곳 quoteSocket"
affects: [26-06, 26-11, 26-12, 26-15, webapp e2e]

actuals:
  tokens: 4174
  tasks: 1
  commits: 1
plan_head_before: 50a6810972e6cf8631158b916e41c62495a77a56

tech-stack:
  added: []
  patterns:
    - "e2e 주입 소켓은 역할로 고른다 — 사용자 세션 프레임은 userSocket(), 시세 프레임은 quoteSocket(). 게이트웨이 「첫 소켓」 가정은 금지"
    - "스텁 자동 응답(28/32)은 요청이 온 소켓으로 돌아가므로 quote 연결 도입 뒤에도 무변경"

key-files:
  created:
    - .planning/phases/26-shared-quote-feed/deferred-items.md
  modified:
    - webapp/e2e/fixtures/relay.ts
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/e2e/specs/me.spec.ts
    - webapp/e2e/specs/sidebar-tree.spec.ts

key-decisions:
  - "e2e quote 연결은 기본 켬, 저널 관찰자는 observer: true 에서만 — D-17 로 quote 키만 넣어 두 연결을 가른다"
  - "userSocket() 오류 문구를 「DMA 사용자 세션 연결」로, quoteSocket() 오류 문구는 env 키와 respondQuoteLogin 을 가리키게 — 실패 시 어느 연결이 안 섰는지 바로 읽힌다"
  - "e2e 실패 3건(헤더 종목명 말줄임 2 · 터치 16px 1)은 제품 코드 결함이라 고치지 않고 deferred-items.md 에 재현 절차와 함께 기록"

patterns-established:
  - "LocalRelay 주입 API 는 역할별 소켓 헬퍼를 거친다 — spec 이 gateway.waitForConnection 을 직접 부르지 않는다"

requirements-completed: []

coverage:
  - id: D1
    description: "e2e 로컬 relay 가 quote 비밀만으로 quote 연결을 열고(저널 관찰자 꺼짐 그대로) 작업대 · 종목상세 · 마이페이지 · 주문로그 · 잔량진행률 화면에 호가 · 체결이 다시 뜬다"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#G-21-R3-10 이전 — 인증 → 구독 → 카드 호가 10단 · 체결 테이프 최신순"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/stock-detail-tabs.spec.ts (13) · me.spec.ts (18) · order-log.spec.ts (10) · unfilled-progress.spec.ts (6) · sidebar-tree.spec.ts (7)"
        status: pass
    human_judgment: false
  - id: D2
    description: "사용자 세션 프레임(61 · 76/78 · 77)은 userSocket(), 체결 주입은 quoteSocket() 으로 명시 분리 · 83 은 사용자 세션 그대로"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#17. 카드 와이드 밴드(832·880·960) 체결가·체결량 잘림 0 (quoteSocket 경로)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#GC1 돌파 목록은 가장 최신 돌파가 맨 위 · G-21-R3-10 이전 — 시간외종가 G2 창 (userSocket 경로)"
        status: pass
      - kind: other
        ref: "grep: DMA_QUOTE_OBSERVER_SECRET: E2E_QUOTE_SECRET = 1 · respondQuoteLogin 3 · quoteSocket 4 · userSocket 10 · spec gateway.waitForConnection( = 0 · relay.userSocket() 8 · relay.quoteSocket() 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "trading-workbench 3건 실패 — 카드 헤더 종목명 말줄임(5. 격자 · P20-3) · 터치 종목 추가란 16px. 제품 코드 결함으로 이 플랜 범위 밖"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#5. 격자 1/2/3단 × 폰/와이드 · P20-3 최악값 × 본문 344 · 터치 기기 · iPhone 가로 폭 844 에서 종목 추가 입력이 16px 다"
        status: fail
    human_judgment: true
    rationale: "헤더 폰 밴드 배치(이름 말줄임 허용 vs 가격 둘째 줄)는 UI 결정이다. 터치 16px 는 09-25 커밋 회귀로 보이며 별도 수정이 필요하다. deferred-items.md 참조"

duration: 14min
completed: 2026-09-30
status: complete
---

# Phase 26 Plan 05: e2e 픽스처 quote 연결 경로 — 사용자/quote 소켓 선택 Summary

**e2e 로컬 relay 에 테스트 전용 `DMA_QUOTE_OBSERVER_SECRET` 를 항상 넣었다. 스텁이 role 1 로그인에 79와 빈 78로 답하게 해서 26-03 뒤 0 이던 시세가 브라우저 화면에 다시 뜬다. 주입 소켓도 역할별로 갈랐다. 사용자 세션 프레임은 `userSocket()`, 체결은 `quoteSocket()` 으로 보낸다. 6 spec 120개 가운데 117개가 통과했다. 실패 3건은 모두 quote 경로와 무관한 제품 코드 결함이다. 헤더 종목명 말줄임 2건은 시세가 돌아오면서 다시 드러났고, 터치 16px 1건은 09-25 커밋 회귀다.**

## Performance

- **Duration:** 약 14분 (e2e 4회 실행 포함)
- **Started:** 2026-09-30T13:38:17Z
- **Completed:** 2026-09-30T13:52:44Z
- **Tasks:** 1
- **Files modified:** 4 (+ deferred-items.md 신규)

## Accomplishments

- `withLocalRelay()` 이 quote 연결을 기본으로 켠다. `DMA_OBSERVER_SECRET` 은 여전히 `observer ? … : ''` 라서 저널 관찰자는 `observer: true` spec 에서만 뜬다(D-17 prohibition 유지).
- 내부 `gatewaySocket()` 의 「비관찰자면 게이트웨이 첫 소켓」 지름길을 없앴다. quote 연결이 부팅 직후 먼저 붙으므로 그 가정이 깨졌기 때문이다. 이제 `userSocket()` 은 언제나 `LoginReq(1)` 를 보낸 살아 있는 소켓을 고른다. 대기 상한, 오류 문구, relay 로그 첨부는 종전 규율을 따른다.
- `onFrame` 의 28/32 자동 응답은 바꾸지 않았다. 요청이 quote 소켓에서 오므로 응답도 quote 소켓으로 간다(Pitfall 8). `pushQueueProgress`(83)는 사용자 세션 ② 경로 그대로다(T-25-24 · T-26-10).

## 바꾼 spec 줄 (파일:줄 → 선택)

| 파일:줄 (변경 전 기준) | 프레임 | 선택 |
|---|---|---|
| `me.spec.ts:669` | 61 VI 에코 | `relay.userSocket()` |
| `sidebar-tree.spec.ts:238` | 61 VI 에코(거래소별) | `relay.userSocket()` |
| `trading-workbench.spec.ts:279` (`pushViEcho`) | 61 VI 에코 | `relay.userSocket()` |
| `trading-workbench.spec.ts:386` (`pushBreakout`) | 78 돌파 스냅샷 | `relay.userSocket()` |
| `trading-workbench.spec.ts:579` (GC1) | 78 · 76 돌파 | `relay.userSocket()` |
| `trading-workbench.spec.ts:1826` (17) | 71/69 체결 `pushTape` | `relay.quoteSocket()` |
| `trading-workbench.spec.ts:3895` (P20-3) | 77 예약창 | `relay.userSocket()` |
| `trading-workbench.spec.ts:4077` (G2) | 77 G2 창 | `relay.userSocket()` |

같은 `sock` 을 이어 쓰는 줄(:243 · :248 · :603 · :3920 · :4143)은 그대로 두었다. 주석 두 곳(:384 `pushBreakout` 설명 · :572 GC1 설명)은 새 선택에 맞춰 문구를 고쳤다. 단언과 흐름은 바꾸지 않았다.

## e2e 결과 요약

`pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck`: 통과(`error TS` 0).

| spec | 통과 | 실패 | 비고 |
|---|---|---|---|
| `stock-detail-tabs` | 13 | 0 | |
| `me` | 18 | 0 | :669 userSocket 경로 포함 |
| `sidebar-tree` | 7 | 0 | :238 userSocket 경로 포함 |
| `unfilled-progress` | 6 | 0 | 83 사용자 세션 경로 |
| `order-log` | 10 | 0 | `observer: true` — 저널 관찰자 + quote 공존 |
| `trading-workbench` | 63 | 3 | 아래 3건 · 나머지 63 은 통과 |

- serial 모드라 실패 뒤 테스트가 건너뛰어졌다. 그래서 실패 케이스를 `--grep-invert` 로 빼고 다시 돌려 66개를 모두 한 번 이상 실행했다(1차 전체 → 2차 「5.」 제외 → 3차 「5.」 · 「P20-3」 제외 → 4차 남은 5개).
- quote 경로 증거는 두 가지다. 17(quoteSocket 체결 주입)과 「인증 → 구독 → 카드 호가 10단 · 체결 테이프」가 통과했다. 또 거의 모든 카드 케이스가 `openFocusedCard` 에서 상한가 시딩(= 28 자동 응답이 quote 소켓으로 왕복)을 기다린다.
- P20-3 은 344 카드 헤더 단언에서 먼저 실패한다. 그래서 그 안의 :3895(77 userSocket) 줄은 이번 실행에서 닿지 않았다. 같은 77 userSocket 경로는 G2 케이스(:4077)가 통과로 증명한다.

## Task Commits

1. **Task 1: e2e 가 quote 연결로 시세를 받는다 — 픽스처 quote 비밀 · role 1 자동 응답 · 사용자/quote 소켓 선택 · spec 8곳** - `2e2a2286` (test)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `webapp/e2e/fixtures/relay.ts`
  - 머리 주석 ⑧과 `E2E_QUOTE_SECRET` 추가
  - env `DMA_QUOTE_OBSERVER_SECRET` 과 부팅 전 `respondQuoteLogin` 추가
  - `userSocket` · `quoteSocket` 을 타입과 반환 객체에 추가하고 내부 주입 경로를 `userSocket` 으로 교체
- `webapp/e2e/specs/trading-workbench.spec.ts` — 6곳 소켓 선택 · 주석 2곳
- `webapp/e2e/specs/me.spec.ts` — 1곳
- `webapp/e2e/specs/sidebar-tree.spec.ts` — 1곳
- `.planning/phases/26-shared-quote-feed/deferred-items.md` — 범위 밖 실패 2종 기록

## Decisions Made

- `quoteSocket()` 실패 문구가 `DMA_QUOTE_OBSERVER_SECRET` 과 `respondQuoteLogin` 을 가리킨다. quote 연결이 안 서는 원인은 거의 이 둘 중 하나다.
- `userSocket()` 은 관찰자 여부와 상관없이 같은 폴링 선택을 쓴다. 분기가 사라져서 observer · 비observer spec 이 같은 경로를 탄다.

## Deviations from Plan

### 미충족 acceptance

**1. 「Playwright 6 spec 요약에 failed 0」 미충족 — 제품 코드 결함 3건 (플랜 지시대로 고치지 않고 기록)**
- **Found during:** Task 1 ③ e2e
- **① 카드 헤더 종목명 말줄임 (2건: `5. 격자 1/2/3단 × 폰/와이드` 뷰포트 360 · `P20-3 최악값 × 본문 344`)**
  - 폰 카드(342~344px)에서 헤더 l1 에 ▶ · 이름 · ⓘ · KRX|NXT · 현재가 · 등락률이 한 줄로 서면 이름 칸이 24~26px 모자라 `삼성전자` 가 말줄임되고, `scrollOverflowing` 이 이를 잘림으로 잡는다.
  - 임시 진단 spec(커밋 안 함 · 실행 뒤 삭제)으로 원인을 확인했다. 시세 on 이면 가격 칸 `98,100+0.10%` 103px 에 nameOver 26, 시세 off 면 `——` 32px 에 nameOver 0 이다.
  - 26-03 뒤 e2e 는 시세가 0 이라 가려져 있었다. 26-03 이전(`e6f11bfa`)과 지금 사이에 `webapp/src` 커밋은 0건이다. 시세가 뜨던 26-03 이전 상태와 같은 조건이라 **Phase 26 회귀가 아니다**.
  - 다른 세션의 미커밋 `card-header.tsx` · `strategy-card.tsx` 변경은 포커스 링 속성(`data-focus-ring`) · 테두리색뿐이라 폭에 영향이 없다.
- **② 터치 종목 추가란 16px (1건)**
  - `stock-add-bar.tsx` 입력 글꼴이 14px 하나다. `3e78d9f1`(09-25)이 quick-260922-tqr 의 터치 16px 분기를 덮은 것으로 보인다. relay 경로와 무관하다.
- **Fix:** 없음. 재현 절차와 함께 `deferred-items.md` 에 기록했다.
- **Files modified:** 없음(제품 코드 미수정)

### 실행 환경 메모

- **기본 브랜치 커밋:** gsd-tools `git.base-branch --is-protected master` 는 `true` 였다. 하지만 오케스트레이터가 master 순차 실행(ISOLATION=none)을 지시했고 26-01~04 도 master 에 커밋했으므로 그대로 master 에 커밋했다. push 는 하지 않았다.
- **커밋 메시지:** 사용자 CLAUDE.md 에 따라 `Co-Authored-By` 를 넣지 않았다.

---

**Total deviations:** 자동 수정 0 · 미충족 acceptance 1(제품 코드 결함 3건 기록)
**Impact on plan:** quote 경로 복구와 소켓 분리라는 목표는 달성했다. 남은 실패는 이 플랜이 만들지 않았고 고칠 범위도 아니다.

## Issues Encountered

- baseline 비교용 worktree(`e6f11bfa`)를 만들려 했으나, webapp e2e 자격증명 파일 복사가 비밀 파일 가드에 막혔다. 대신 위 임시 진단 spec(시세 on/off 대조)과 `e6f11bfa..HEAD -- webapp/src` 커밋 0건으로 판정했다. worktree 는 생성되지 않았다.

## Known Stubs

없음.

## Threat Flags

없음. T-26-05(`…-test-only` 리터럴 · 127.0.0.1 스텁만)와 T-26-10(83 사용자 세션 소켓 유지)은 계획대로 적용했다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 26-06 이후 플랜은 e2e 에서 시세가 흐르는 상태를 전제로 쓸 수 있다.
- 헤더 폰 밴드 배치(deferred ①)는 사용자 UI 결정이 필요하다. 터치 16px(deferred ②)는 별도 quick 으로 고칠 수 있다.

---
*Phase: 26-shared-quote-feed*
*Completed: 2026-09-30*

## Self-Check: PASSED

- FOUND: webapp/e2e/fixtures/relay.ts · deferred-items.md · 26-05-SUMMARY.md
- FOUND: 2e2a2286
