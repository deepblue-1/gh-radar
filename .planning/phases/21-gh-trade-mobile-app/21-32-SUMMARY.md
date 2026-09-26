---
phase: 21-gh-trade-mobile-app
plan: 32
subsystem: ui
tags: [mobile, capacitor, native-app, trading, me, strategy-log, css, react-context, gap-closure]

requires:
  - phase: 21-25
    provides: "D-25a 결정 + 스케치 008 ① B 채택 · 잃는 동작 범위 밖 동의"
  - phase: 21-27
    provides: "layout.tsx viewport.themeColor 정리(같은 파일 · 이 플랜은 RelayProvider 안쪽에 공급자만 추가)"
provides:
  - "앱(html.native-app) /trading 하단 공용 패널 · spacer display:none (폰 · iPad) — 브라우저 불변"
  - "카드 더티 바 탭바 비킴 — 숨은 프로브(native-tabbar-probe) computed bottom px 로 innerHeight − inset − 탭바 몫"
  - "lib/strategy-log-feed.tsx — diffLimitChasers(순수) · StrategyLogFeedProvider(앱 전역) · useStrategyLogFeed"
  - "/me 전략 현황 카드 「현황 | 로그」 알약 세그먼트(기본 현황) · 로그 본문 data-slot=me-strategy-log"
affects: [21-36 UAT 3차 재검증, /me, /trading 앱 모드, 전략 로그]

actuals:
  tokens: 7934
  tasks: 3
  commits: 5
plan_head_before: efefe3905f82171fae07f14e1a6c1b0f77184d60

tech-stack:
  added: []
  patterns:
    - "calc() CSS 변수의 px 해석 = 숨은 fixed 프로브의 computed bottom 을 읽는다(getPropertyValue 는 토큰 문자열)"
    - "전역 파생 로그 공급자 — relay 컨텍스트 diff + WeakSet 새 항목 + 같은 키 직전 문장 억제 + 사용자 경계에서 비움"

key-files:
  created:
    - webapp/src/lib/strategy-log-feed.tsx
    - webapp/src/lib/__tests__/strategy-log-feed.test.tsx
  modified:
    - webapp/src/styles/globals.css
    - webapp/src/components/trading/workbench/shared-panels.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/src/app/layout.tsx
    - webapp/src/components/trading/strategy-status-card.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/components/trading/__tests__/me-client.test.tsx
    - webapp/src/components/trading/__tests__/strategy-status-card.test.tsx

key-decisions:
  - "D-25a ① 채택안 B 만 구현 — 전략 현황 카드 머리 「현황 | 로그」 알약 세그먼트(기본 현황 · 선택 기억 안 함). A/C 코드 없음"
  - "상따·VI 요약(상따 N · VI …)은 목업 B 대로 머리 줄에서 현황 본문 첫 줄로 내림"
  - "로그 본문 높이 상한 320px(목업에 값 없음 · 200줄 상한이 카드를 끝없이 늘리지 않게) — Claude 재량"
  - "로그 공급자는 사용자(userId)가 바뀌면 비운다(T-16-04) · 통지는 작업대와 같은 상따 몫(isLimitChaserServerMessage)만"
  - "카드 더티 바는 Phase 20 D-04 이후 렌더되는 곳이 없어 탭바 비킴은 잠재 결함 수정 — 식은 단위 테스트, 프로브 px 해석은 e2e 로 증명"

patterns-established:
  - "앱 전용 하단 요소 숨김은 html.native-app CSS(첫 페인트 전 클래스) — JS isNativeApp 분기(SSR false) 쓰지 않음"
  - "전 종목 로그 문장은 strategy-log.tsx 순수 함수만 — 이 화면이 모르는 맥락(hadOrder)은 넘기지 않음"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "앱(html.native-app) 390 · 1024 에서 /trading 공용 패널 · spacer 가 보이지 않고 --wb-bottom-inset 이 0 · 브라우저 390 · 1280 은 패널이 보인다"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#G-21-R3-2 앱 공용 패널 숨김"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#7. 폰 밴드 — 인라인 편집 행을 하단 고정 공용 패널 위로 (브라우저 회귀)"
        status: pass
    human_judgment: true
    rationale: "실기(iOS/Android WebView)에서 탭바와 겹침이 사라졌는지 · iPad 가로 등은 21-36 UAT 3차 재검증 몫"
  - id: D2
    description: "카드 더티 바가 앱에서 탭바 몫(--native-tabbar-offset, 안전영역 0 에서 82px)만큼 위에 선다 — 식 innerHeight − inset − 탭바 몫"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-card.test.tsx#앱 — 화면 아래 = innerHeight − 탭바 몫(82) 에 바를 붙인다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-card.test.tsx#브라우저 — 탭바 몫 0 이면 종전 식(innerHeight − inset) 그대로"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#G-21-R3-2 (프로브 computed bottom 앱 82px · 브라우저 0px)"
        status: pass
    human_judgment: false
  - id: D3
    description: "앱 전역 전략 로그 공급자 — 작업대와 같은 문장 · 새 항목만 · 전부 정지 1줄 · 최신 index 0 · 200줄 · 서버 호출 0"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/strategy-log-feed.test.tsx (9 tests)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-log.test.tsx (37 tests · 문장 함수 회귀)"
        status: pass
    human_judgment: false
  - id: D4
    description: "/me 전략 현황 카드 「현황 | 로그」 — 기본 현황 · 로그에 시각 · 종목명 · 문장 · 빈 문구 · DMA 게이트 분기엔 없음"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/me-client.test.tsx#MeClient — 전 종목 전략 로그 (3 tests)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-status-card.test.tsx#「현황 | 로그」 전환 (2 tests)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts (11 passed · 요약 줄 이동 회귀 없음)"
        status: pass
    human_judgment: true
    rationale: "앱 마이 탭에서 로그 흐름이 실제 사용에 충분한지(시각 · 밀도 · 320 상한)는 21-36 UAT 사람 확인"

duration: 19min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 32: 앱 /trading 하단 공용 패널 숨김 · /me 전략 로그 Summary

**앱(html.native-app)은 /trading 하단 공용 패널·spacer 를 CSS 로 숨기고 카드 더티 바는 프로브로 읽은 탭바 몫(82px)만큼 비키며, 전 종목 전략 로그는 relay 파생 전역 공급자 + /me 전략 현황 카드 「현황 | 로그」(스케치 008 ① B)로 옮겼다**

## Performance

- **Duration:** 19 min
- **Started:** 2026-09-26T11:21:31Z
- **Completed:** 2026-09-26T11:40:21Z
- **Tasks:** 3
- **Files modified:** 12 (생성 2 · 수정 10)

## Accomplishments

- **CSS 규칙 (G-21-R3-2):** `globals.css` §21 의 앱 전용 `[data-slot="shared-panels"] { bottom: var(--native-tabbar-offset) }` 와 `[data-pinned] { padding-bottom: 0 }` 두 규칙을 `html.native-app [data-slot="shared-panels"], html.native-app [data-slot="shared-panels-spacer"] { display: none; }` 한 규칙으로 교체. 652 대상 목록 주석에 「브라우저 전용 · 앱에서는 숨김(D-25a)」. 브라우저 규칙(`[data-pinned="true"] { padding-bottom: var(--app-safe-bottom) }`)은 그대로.
- **`--wb-bottom-inset`:** 숨긴 패널은 `offsetHeight` 0 이라 `usePanelHeight` 가 0 을 재므로 앱 분기 보정 불필요 — e2e 가 앱 390 에서 `''`/`0px` 을 단언(shared-panels ⑤-c 주석).
- **더티 바 수치:** `strategy-card.tsx` `nativeTabbarOffsetPx()` — 문서에 한 번만 까는 `div[data-slot="native-tabbar-probe"]`(`position:fixed; left:0; bottom:var(--native-tabbar-offset, 0px); width:0; height:0; visibility:hidden; pointer-events:none`)의 computed `bottom` 을 `parseFloat`. `limit = innerHeight − --wb-bottom-inset − 탭바 몫`. 안전영역 0 에서 앱 = 14 + 60 + 8 = **82px**, 브라우저 = **0px**(e2e 실측). 단위 테스트: 카드 끝 1500 · innerHeight 844 → 앱 `translateY(-738px)` / 브라우저 `translateY(-656px)`.
- **공급자 계약 (`lib/strategy-log-feed.tsx`):**
  - `diffLimitChasers(prev: ReadonlyMap<string, RelayLimitChaser>, next: readonly RelayLimitChaser[]) → { key, isin, exchange, name?, text }[]` — 처음 보는 키 `strategyLogLine(null, next)` · 같은 키는 `isRuntimeOnlyEcho` 면 0줄 아니면 `strategyLogLine(prev, next)`(**hadOrder 미전달** → 「발주」라고 쓰지 않음) · prev 에만 있는 키 = 삭제 줄.
  - `StrategyLogFeedProvider` — `useRelayContext()` 의 `limitChasers`(직전 Map diff) · `messages`(WeakSet 새 항목 · `isLimitChaserServerMessage` 상따 몫만 · `serverMessageLogLine`) · `strategiesDisabled`(null→값 · 새 값마다 `strategiesDisabledLogLine()`). 엔트리 `{ id: feed-log-N, at: 로컬 HH:MM:SS(clockNow — 로케일 포맷터 안 씀), level, who }`, who = `exchangeLabeledName(name || isinLabel || isin, exchange)`(통지는 `label || msg.i`). 같은 키 직전 줄과 같은 문장 억제 · 최신 index 0 · `MAX_FEED_LOG = 200` · `useAuth` userId 가 바뀌면 비움. 서버 호출 0 (`fetch(` 0건).
  - `useStrategyLogFeed()` — Provider 밖이면 빈 배열.
  - `layout.tsx`: `<RelayProvider>` 바로 안쪽 · `<ChatProvider>` 바깥에 `<StrategyLogFeedProvider>` — 앱 시작부터 쌓임.
- **/me 로그 배치:** 전략 현황 카드 안 「현황 | 로그」 전환(아래 대조표).

### 채택안 구현 대조 (스케치 008 ① **B** · D-25a)

| 항목 | README Winner / index.html | 구현 |
|---|---|---|
| 배치 | 전략 현황 카드 머리 오른쪽 알약 세그먼트 「현황 \| 로그」 | `strategy-status-card.tsx` 머리 `TabsList aria-label="전략 현황 보기"` `ml-auto` |
| 기본 | 현황 | `useState<StatusView>("status")` · 선택 기억 안 함 |
| 트랙 | `.seg` padding 2 · radius 999 · `--muted` · gap 2 | `rounded-full bg-[var(--muted)] p-0.5 gap-0.5` |
| 버튼 | 26 높이 · 0 12px · 12px/600 · 비선택 `--muted-fg` · 선택 `--seg-on-bg/fg/shadow` | `h-[26px] px-3 text-[12px] font-semibold` · `data-[state=active]:bg/text/shadow --seg-on-*` |
| 요약 줄 | 머리에서 빠져 현황 본문 첫 줄 · 12px muted · margin -4 0 4 8 | `strategy-status-summary` `mono text-[12px] -mt-1 mb-1 px-2` |
| 로그 문법 | 11px · 줄 gap 2 · 시각 tnum muted · who 600 · 거부 빨강 | `StrategyLog variant="embed"`(11px · leading 1.7 · gap 0.5 · mono 시각 · who semibold · error `--destructive`) — 작업대 공용 패널과 한 벌 |
| 로그 좌우 | 카드 패딩 안 목록 padding 0 | `-mx-3` 로 embed 목록의 s-3(12) 좌우 패딩을 카드 패딩(12)과 상쇄 |
| 로그 높이 | 값 없음(예시 5줄) | `max-h-[320px] overflow-y-auto`(재량 — 200줄 상한 대비) |
| /me 순서 | D-20 무변경 · 세로 길이 불변 | 카드 하나 안 전환 — 새 칸 없음(me-client 주석 ①) |
| 잃는 동작 ②③ | 범위 밖 동의(21-25 답) | 구현 안 함 · 주석 기록 |

시각 확인: 390 폭 다크 · 라이트에서 현황/로그 두 상태 카드 스크린샷 확인(시각 열 정렬 · 긴 종목명 「한국제7호…· NXT」 줄바꿈 · 잘림 없음).

## Task Commits

1. **Task 1: 트레이서 — 앱 공용 패널·spacer 숨김 · 더티 바 탭바 비킴 · e2e** — `724cef5c` (feat)
2. **Task 2: 전 종목 전략 로그 공급자** — `dbe44d53` (test · RED) → `6a4457be` (feat · GREEN)
3. **Task 3: /me 「현황 | 로그」 (채택안 B)** — `30b612b4` (test · RED) → `b0418d9d` (feat · GREEN)

_계획 범위(efefe390..HEAD) rev-list 는 7 — 그중 `0c882544` · `a551023c` 는 다른 세션의 quick-260926-s5v 커밋이라 이 플랜 커밋 수(5)에서 뺐다._

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | RED 증거 |
|---|---|---|---|---|
| 2 공급자 | `dbe44d53` — 7 실패(단언) / 2 통과(0줄 · Provider 밖) | `6a4457be` 9/9 | 없음 | `tdd-red-evidence` RED_EVIDENCE_OK (target: 「처음 보는 전략 = 등록 줄 1개」) |
| 3 /me | `30b612b4` — 4 실패(탭/요약 없음) | `b0418d9d` 31/31 | 없음 | RED_EVIDENCE_OK (target: 「기본은 「현황」 — 「로그」를 누르면 …」) |

Task 2 RED 는 인터페이스만 있는 빈 스텁(`[]` 반환 · children 통과)을 함께 커밋했다 — 모듈 부재 로드 실패(INVALID_RED)가 아니라 단언 실패로 RED 를 세우기 위해서다. vitest TAP 출력에 node 식 `# tests/# pass/# fail` 요약이 없어 같은 실행의 ok/not ok 수로 요약 줄을 덧붙여 검증기에 넣었다.

## Files Created/Modified

- `webapp/src/styles/globals.css` — §21 앱 공용 패널 · spacer `display:none`(D-25a) · 대상 목록 주석
- `webapp/src/components/trading/workbench/shared-panels.tsx` — 머리 주석 ⑤-c(앱 숨김 · inset 0 근거 · /me 로그)
- `webapp/src/components/trading/card/strategy-card.tsx` — `nativeTabbarOffsetPx()` 프로브 · `usePinnedToViewportBottom` limit 에 탭바 몫
- `webapp/src/components/trading/__tests__/strategy-card.test.tsx` — 프로브 1개 · 앱 82 / 브라우저 0 식 3 tests
- `webapp/e2e/specs/trading-workbench.spec.ts` — 「G-21-R3-2 앱 공용 패널 숨김」 1 test(+ `installNativeApp` import)
- `webapp/src/lib/strategy-log-feed.tsx` — 신규 공급자 · diff · 훅
- `webapp/src/lib/__tests__/strategy-log-feed.test.tsx` — 신규 9 tests
- `webapp/src/app/layout.tsx` — RelayProvider 안쪽 공급자
- `webapp/src/components/trading/strategy-status-card.tsx` — 「현황 | 로그」 Tabs · 요약 줄 이동 · 로그 본문 · 머리 주석 ⑧
- `webapp/src/components/trading/me-client.tsx` — 머리 주석 ①(D-25a · 새 칸 아님 · 잃는 동작 범위 밖)
- `webapp/src/components/trading/__tests__/me-client.test.tsx` — MeClient 렌더 3 tests(훅 스텁)
- `webapp/src/components/trading/__tests__/strategy-status-card.test.tsx` — 전환 2 tests

## Decisions Made

- 채택안 **B 한 가지만** 구현(A/C 없음). 잃는 동작 ②③ 은 21-25 답(「동의 · 범위 밖」)대로 구현하지 않았다 — 이견 없음.
- 로그 본문 높이 상한 320px — 목업에 값이 없어 정했다(11px × 1.7 ≈ 16줄).
- 공급자는 사용자 경계(userId 변경)에서 비운다 — 다음 사용자가 이전 사용자의 전략 흐름을 보지 않게(T-16-04).
- 통지는 작업대 카드와 같은 상따 몫(`isLimitChaserServerMessage`)만 쌓는다 — VI 몫은 VI 줄 몫. arm 거절(src System)은 카드의 in-flight 맥락이 있어야 판정되므로 이 공급자에는 없다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 더티 카드를 UI 로 만들 수 없어 e2e 바 위치 단언을 식 단위 테스트 + 프로브 e2e 로 대체**
- **Found during:** Task 1 (e2e 작성)
- **Issue:** 플랜 e2e 는 「앱 390 에서 카드 하나를 더티로 만들고 `card-dirty-host` 아래끝 ≤ innerHeight − 82」 였으나, `<DirtyActionBar>` 는 Phase 20 D-04(값은 행 확정 = 즉시 전송) 이후 **어디서도 렌더되지 않고** `card.setDirtyCount` 호출자도 없다(`limit-chaser-form.tsx` ③ 「더티 수를 보내지 않으므로 늘 0」). 즉 카드 더티 바는 현재 화면에 뜨지 않으며 탭바 비킴은 잠재 결함 수정이다.
- **Fix:** 프로브 수정은 계획대로 넣고, (a) `strategy-card.test.tsx` 가 body 렌더 prop 으로 `setDirtyCount(1)` 을 걸어 식을 잠금(앱 −738 · 브라우저 −656 — 옛 식이면 앱 케이스 실패), (b) e2e 는 그 식의 입력인 프로브 computed bottom 을 실브라우저에서 단언(앱 82px · 브라우저 0px). 프로브는 카드가 서면 먼저 깐다(바 첫 프레임에 DOM 을 만들지 않고 e2e 가 관측 가능).
- **Files modified:** strategy-card.tsx · strategy-card.test.tsx · trading-workbench.spec.ts
- **Verification:** vitest 17/17 · e2e 3 passed
- **Committed in:** `724cef5c`

**2. [Rule 1 - Bug] Task 2 테스트 기대 문장 교정**
- **Found during:** Task 2 GREEN
- **Issue:** 테스트가 `src:"SetLimitChaser"` 통지의 배지를 `[상따]` 로 가정 — 실제 `serverMsgBadge` 는 `[서버] … (SetLimitChaser)`.
- **Fix:** 기대값을 `serverMessageLogLine(m).text` 로 계산(배지 어휘를 테스트에 다시 적지 않음 · 「작업대와 같은 문장」 계약을 더 직접 잠금).
- **Committed in:** `6a4457be`

**3. [Rule 2 - Missing Critical] 공급자 사용자 경계 비움 · 상따 몫 필터**
- **Found during:** Task 2
- **Issue:** 공급자가 앱 전역이라 로그아웃 → 다른 계정 로그인 시 이전 사용자의 전략 로그가 남는다(T-16-04). 또 `messages` 는 VI · System 통지를 모두 담는다.
- **Fix:** `useAuth` userId 변경 시 엔트리 · 직전 Map · WeakSet · 직전 문장을 비움. 통지는 `isLimitChaserServerMessage` 로 작업대와 같은 몫만. `LimitChaserDiffLine` 에 선택 필드 `name` 추가(삭제 줄도 종목명 유지).
- **Committed in:** `6a4457be`

---

**Total deviations:** 3 auto-fixed (1 blocking · 1 bug · 1 missing critical)
**Impact on plan:** 계약·범위 불변. 1번은 검증 수단만 바뀌었고(실측 대상이 현재 화면에 없음) 식과 입력을 각각 자동 검증한다.

## Issues Encountered

- **다른 세션 동시 작업:** quick-260926-s5v 가 같은 시간대에 master 에 커밋(`0c882544` · `a551023c`)하고 `breakout-strip` · `breakout-list` 를 고쳤다. 전체 vitest 1차 실행에서 그 세션의 진행 중 테스트 9건이 실패했다가 그 세션 커밋 뒤 재실행에서 **125 files · 2435 passed · 1 skipped** 전부 통과. 그 파일들은 건드리지 않았다.
- **me.spec 일시 실패:** 전략 현황 카드 수정 직후 `me.spec` 3번이 두 번 실패(시드 무시 · 계좌 대기 타임아웃) — 옛 카드로 되돌려 통과, 새 카드로 돌려 단독 통과, 전체 재실행 **11 passed**. dev 서버 HMR 재컴파일 타이밍으로 판단(코드 변경 없이 해소).

## Known Stubs

없음 — 로그 본문은 실제 relay 파생 공급자에 연결됨. (Task 2 RED 커밋의 빈 스텁은 GREEN 커밋에서 실구현으로 대체됨.)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 21-33(작업대 `?code=` 소비 · 카드 주문유형) 진행 가능. push · 배포는 하지 않았다(21-36).
- 21-36 UAT 3차 사람 확인: 앱 /trading 하단(패널 없음 · 탭바와 겹침 없음) · /me 「로그」 흐름(실제 에코 · 통지가 쌓이는지 · 320 상한 체감).

## Self-Check: PASSED

- FOUND: webapp/src/lib/strategy-log-feed.tsx · webapp/src/lib/__tests__/strategy-log-feed.test.tsx · strategy-status-card.tsx · globals.css
- FOUND commits: 724cef5c · dbe44d53 · 6a4457be · 30b612b4 · b0418d9d
- Acceptance: globals.css spacer 규칙 1 · D-25a 2 · 앱 핀 패딩 규칙 0 · native-tabbar-probe 1 · e2e G-21-R3-2 1 · diffLimitChasers 1 · useStrategyLogFeed export 1 · layout StrategyLogFeedProvider 4 · fetch( 0 · me-strategy-log 1 · useStrategyLogFeed(me+card) 3 · me-client D-25a 1
- Verify: e2e `-g "G-21-R3-2|공용 패널"` 3 passed · vitest shared-panels/strategy-card/strategy-card-flow 81 · strategy-log-feed/strategy-log 46 · me-client/strategy-status-card 31 · typecheck 0 error

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*
