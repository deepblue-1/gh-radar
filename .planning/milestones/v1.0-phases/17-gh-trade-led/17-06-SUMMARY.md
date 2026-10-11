---
phase: 17-gh-trade-led
plan: 06
subsystem: ui
tags: [react, webapp, relay, vi-trigger, exchange, reducer, tdd, a11y]

# Dependency graph
requires:
  - phase: 17-gh-trade-led
    provides: "17-01 의 `RelayViTriggerMsg.x` · `RelayViSetMsg.exchange?` · `RelayViNoticeMsg.exchange` 계약과 `serverMsgBadge` 순수함수"
  - phase: 17-gh-trade-led
    provides: "17-05 의 거래소별 `{t:\"vi\", x, cfg}` 스냅샷 2프레임 · relay `viPendingKey` 에 포함된 거래소 · `RelayViSetSchema.exchange` 수용"
  - phase: 17-gh-trade-led
    provides: "17-08 의 「서버 진실을 재계산하지 않는다」 웹 표면 선례와 상태 바 `serverMsgBadge` 적용 형태"
provides:
  - "`RelayData.viTriggers` — 거래소별 VI 3상태(키 부재 미조회 / `null` 미등록 / 객체 등록). 단수 `viTrigger` 는 별칭도 남기지 않고 제거"
  - "`viAnyRunning(triggers)` · `VI_EXCHANGES` (`webapp/src/lib/use-relay-socket.ts`) — 가동 판정의 **유일 지점**"
  - "`viSummaryText(triggers)` — 가동 중인 거래소마다 그 거래소의 금액·상승률을 말한다"
  - "`VI_EDIT_EXCHANGE` (`vi-settings-card.tsx`) — 이 화면이 편집하는 거래소의 단일 출처. Phase 18 은 이 상수를 상태로 바꾸면 된다"
  - "갱신된 `VI_SETTINGS_CAPTION` — 거래소별 1건 · KRX 편집 · NXT 는 다음 단계"
  - "`vi.set` 이 `exchange` 를 명시해 나간다 (수정·시작·중지 세 경로 모두)"
  - "VI 주문 목록 거래소 열(표) · 카드 보조 텍스트 · 접수 전 행 대체 키에 거래소 포함"
  - "VI 상태줄 `vi-last-notice` — `viNotices` 의 **첫 소비처**(종목 · 거래소 · 발동가)"
  - "VI 화면 서버 메시지 출처 배지 + `isViServerMessage` 가 `VITrigger` 어휘를 받는다"
affects: [17-11, 17-12, phase-18]

# Actuals (#2632) — estimateTokens 스케일(chars/4, 실현 diff 기준)
actuals:
  tokens: 18026
  tasks: 3
  commits: 6
plan_head_before: 4a1bdc4263c4b9f34527aba0e877780f72cc33ab

tech-stack:
  added: []
  patterns:
    - "축이 늘어난 상태는 **하위호환 별칭을 남기지 않고** 필드를 바꾼다 — 별칭을 남기면 「어느 축의 값인지 모르는 소비처」가 typecheck 를 통과한 채 살아남는다"
    - "여러 화면이 같은 질문에 답해야 하면 **판정 함수 하나**를 만들고 인라인 비교를 0건으로 만든다(grep 게이트로 잠근다)"
    - "합집합 배지를 도입하면 **그 옆의 요약도 함께 축을 늘려야** 한다 — 배지는 두 축, 요약은 한 축이면 화면이 스스로 모순된다"
    - "상관 키는 **유일하지 않은 키에만** 축을 더한다(17-05 승계): 접수 전 행 대체 키에는 거래소를 더하고, 주문번호 키와 낙관 확인 Map 키는 그대로 둔다"
    - "표시 자리가 「연구에서 확정되지 않음」이면 grep 으로 실측하고, **없으면 없다고 기록한 뒤** 최소 표면을 만든다 — 있는 척 고치지 않는다"

key-files:
  created:
    - webapp/src/components/trading/__tests__/vi-client.test.tsx
  modified:
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/vi-alert.ts
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/components/trading/strategy-status-card.tsx
    - webapp/src/components/trading/vi-client.tsx
    - webapp/src/components/trading/vi-settings-card.tsx
    - webapp/src/components/trading/vi-order-list.tsx
    - webapp/e2e/specs/trading-vi.spec.ts

key-decisions:
  - "가동 배지는 `viAnyRunning` 한 함수로만 판정한다 — 사이드바·My page·전략 현황에 인라인 `?.run === true` 0건"
  - "`viSummaryText` 를 거래소별로 바꿨다 — 합집합 배지 옆에서 한쪽 값만 말하면 NXT 가동 중에 KRX 숫자가 뜬다"
  - "거래소를 모르는 `vi` 프레임은 KRX 로 접지 않고 **무시**한다 — 기본값을 지어내면 NXT 의 사실이 KRX 자리에 앉는다"
  - "`VI_EDIT_EXCHANGE` 상수 하나가 캡션·`vi.set`·요약 행을 함께 지배한다"
  - "`isViServerMessage` 에 `VITrigger` 만 더하고 `LimitChaser` 는 더하지 않았다 — Pitfall 9 는 그대로다"
  - "`vi.notice` 표시 자리는 **존재하지 않았다**(grep 실측 소비처 0곳). 상태줄에 최신 1건 줄을 새로 만들었다"

patterns-established:
  - "필드 rename 으로 소비처를 강제 노출: 별칭 없이 바꾸고 `pnpm typecheck` 가 지목하게 둔다"
  - "grep 게이트로 판정 단일화를 잠근다: `viAnyRunning` 호출 ≥1 · `serverMsgBadge` 호출 ≥1 · `src ===` 직접 비교 0건"

requirements-completed: [TRADE-04]

coverage:
  - id: D1
    description: "브라우저가 KRX·NXT VI 전략을 각각 3상태(미조회/미등록/등록)로 알고, 한 거래소의 프레임이 다른 거래소 값을 지우지 않는다"
    requirement: "TRADE-04"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-provider.test.tsx#⑥-b vi 는 미조회/미등록/등록 3상태를 **거래소마다** 구분한다 (17-06 / D-06)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-provider.test.tsx#⑥-b2 거래소를 모르는 vi 프레임은 **아무 거래소에도 귀속시키지 않는다**"
        status: pass
    human_judgment: false
  - id: D2
    description: "사이드바·My page·전략 현황의 VI 가동 배지가 KRX·NXT 합집합으로 판정된다"
    requirement: "TRADE-04"
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx#N7 — VI 항목 배지는 KRX·NXT **합집합**이다 (17-06 / D-18)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-status-card.test.tsx#viSummaryText — 거래소별 요약 · 단위 환산"
        status: pass
      - kind: other
        ref: "grep -rc viAnyRunning app-sidebar.tsx me-client.tsx strategy-status-card.tsx → 3/3/3, 인라인 `?.run === true` 0건"
        status: pass
    human_judgment: false
  - id: D3
    description: "VI 설정 카드 캡션이 거래소별 1건·KRX 편집·NXT 다음 단계를 사실대로 말하고 `vi.set` 이 `exchange` 를 싣는다"
    requirement: "TRADE-04"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/vi-settings-card.test.tsx#계좌·금액·상승률·마감알림 4행과 헤더 캡션이 있다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/vi-settings-card.test.tsx#★ 수정·시작·중지 세 경로가 모두 `exchange` 를 싣는다"
        status: pass
    human_judgment: false
  - id: D4
    description: "VI 주문 목록에 거래소 열이 있고 행 키가 ISIN+거래소라 양쪽 발동이 두 행으로 보인다"
    requirement: "TRADE-04"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/vi-order-list.test.tsx#★ 거래소 축 (17-06 / D-06)"
        status: pass
    human_judgment: false
  - id: D5
    description: "VI 화면 서버 메시지에 `[VI]`/`[서버]` 출처 배지가 붙고, 상따 몫은 여전히 그리지 않는다"
    requirement: "TRADE-04"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/vi-client.test.tsx#② 서버 메시지 출처 배지 (D-09 · D-17)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/vi-alert.test.ts#★ `VITrigger` 런타임 사유 줄도 VI 몫이다 (17-06 / D-09)"
        status: pass
    human_judgment: false
  - id: D6
    description: "`vi.notice` 발동 통보가 화면에 거래소와 함께 나타난다 (새 표면)"
    requirement: "TRADE-04"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/vi-client.test.tsx#① `vi.notice` 발동 통보 — 거래소를 함께 말한다 (D-06)"
        status: pass
    human_judgment: true
    rationale: "표시 자리가 이 plan 에서 **새로 만들어졌다**(그전에는 소비처 0곳). 상태줄에 항목 하나가 더 붙는 배치가 폰 폭에서 읽히는지는 jsdom 이 증명할 수 없다 — 실브라우저 확인 필요"
  - id: D7
    description: "e2e `trading-vi.spec.ts` 가 거래소 열 추가 뒤에도 통과한다 (셀렉터·열 인덱스 갱신 포함)"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-vi.spec.ts (열 인덱스 8→9, 거래소 열 index 3 단언 추가)"
        status: unknown
    human_judgment: true
    rationale: "Playwright 미실행 — `tsconfig.e2e.json` 타입 통과로만 확인했다. WINDOWS #14 로 등록"

# Metrics
duration: 15 min
completed: 2026-09-20
status: complete
---

# Phase 17 Plan 06: VI 화면 거래소 축 Summary

**relay 가 거래소별로 내려주기 시작한 VI 전략을 웹이 거래소별 3상태로 받고, 가동 배지는 합집합 한 함수로, 설정 카드는 무엇을 편집하는지 사실대로, 주문 목록은 거래소를 열로 말하게 했다**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-20T08:53:17Z
- **Completed:** 2026-09-20T09:08:30Z
- **Tasks:** 3 (전부 TDD — RED/GREEN 6커밋)
- **Files modified:** 17 (소스 9 · 테스트 7 · e2e 1, 그중 1건 신규)

## Accomplishments

- **17-05 가 남긴 결함을 닫았다 (WINDOWS #13 → fixed).** relay 는 인증 스냅샷을 KRX·NXT **2프레임**으로 보내는데 리듀서는 `frame.x` 를 무시하고 단수 필드를 덮어썼다. KRX-only 세션에서 **뒤에 온 NXT 프레임이 방금 읽은 KRX 설정을 지우는** 경로였다. `viTriggers`(거래소별 3상태)로 바꾸고, 단수 필드는 **별칭조차 남기지 않아** `pnpm typecheck` 가 소비처 6곳을 전부 지목하게 했다.
- **가동 판정을 한 함수로 모았다.** `viAnyRunning(triggers)` 가 사이드바·My page·전략 현황 셋의 유일한 답이다. 세 파일에 인라인 `?.run === true` 는 **0건**이고, grep 게이트가 그 사실을 잠근다(T-17-21).
- **설정 카드가 거짓말을 멈췄다.** 「세션당 1건 · KRX」는 서버가 전략을 거래소별 1건으로 관리하게 된 순간 **두 군데가 동시에 틀린** 문장이었다. 새 캡션은 거래소별 1건 · KRX 편집 · NXT 는 다음 단계 세 사실을 모두 말하고, `vi.set` 은 `exchange` 를 명시해 나간다(T-17-20).
- **양쪽 발동이 겹치지 않는다.** 접수 전 행 대체 키에 거래소를 더해 relay `viPendingKey`(17-05)와 규칙을 맞췄다 — 갈린 채로 두면 새 탭(72 스냅샷)과 기존 탭(73 델타 누적)이 **다른 목록**을 본다(T-17-22). 표에는 거래소 열이, 폰 카드에는 시각 옆 보조 텍스트가 붙었다.
- **`viNotices` 가 처음으로 화면에 나왔다.** grep 실측 결과 소비처가 **0곳**이었다 — 발동 통보는 상태만 쌓이고 아무도 읽지 않았다. 상태줄에 최신 1건(종목 · **거래소** · 발동가)을 세웠다.
- **`VITrigger` 어휘의 소비처를 만들었다.** 17-01 이 `src` 에 더한 값이지만 `isViServerMessage` 가 받지 않아 **VI 런타임 사유 줄이 한 글자도 그려지지 않았다.** 이제 받고, `serverMsgBadge` 로 `[VI]` 접두를 단다.

## Task Commits

1. **Task 1 (tracer · TDD): 리듀서 거래소별 + 소비처 6곳** — RED `3676481` (test) → GREEN `41c8a14` (feat)
2. **Task 2 (TDD): 설정 카드 캡션·`vi.set` 거래소** — RED `bbfa3df` (test) → GREEN `bc9ec17` (fix)
3. **Task 3 (TDD): 주문 목록 거래소 열·행 키 + 통보·메시지 표기** — RED `576c763` (test) → GREEN `ef2b4f0` (feat)

## TDD Gate Compliance

세 태스크 모두 `tdd="true"` 이고 RED → GREEN 순서를 지켰다. REFACTOR 커밋은 없다 — GREEN 구현이 이미 단일 지점(`viAnyRunning` · `VI_EDIT_EXCHANGE` · `serverMsgBadge`)으로 수렴해 정리할 중복이 남지 않았다.

**RED 증거 (기계 판정 불가 — 저장소 사정).** `gsd-tools check tdd-red-evidence` 는 vitest 출력을 읽지 못하고(`node --test` TAP 푸터만 파싱) 항상 `INVALID_RED (zero_tests_discovered)` 를 낸다. TAP 푸터를 손으로 지어내지 않고, 이 phase 의 앞선 plan 들과 같은 형식으로 원문을 남긴다.

| 태스크 | 명령 | 종료코드 | 실패한 대상 테스트 | 실패 형태 | 합계 |
|---|---|---|---|---|---|
| 1 | `pnpm --filter @gh-radar/webapp test` | 1 | `⑥-b vi 는 … 거래소마다 구분한다` · `N7 — VI 항목 배지는 KRX·NXT **합집합**이다` | 단언 실패 (`Expected: unregistered / Received: unfetched`, `Expected: 가동 / Received: VI중지`) | 2 failed / 898 passed / 1 skipped |
| 2 | `pnpm --filter @gh-radar/webapp test` | 1 | 캡션 3건 · `★ 수정·시작·중지 세 경로가 모두 exchange 를 싣는다` | 단언 실패 (`Unable to find an element with the text: 거래소별 1건 …`, `expected { t:'vi.set', …(4) } to deeply equal …(5)`) | 3 failed / 900 passed / 1 skipped |
| 3 | `pnpm --filter @gh-radar/webapp exec vitest --run vi-client vi-order-list` | 1 | `★ 거래소 축` 3건 + `vi-client` 5건 | 단언 실패 (`expected '@KR…:41250' not to be '@KR…:41250'`, `expected [Array(9)] to deeply equal [Array(10)]`, `expected null not to be null`) | 8 failed / 6 passed |

**정직 기록 — RED 에서 이미 초록이던 케이스 2건.** `⑥-b2`(거래소를 모르는 프레임 무시)와 `LimitChaser` 비표시 케이스는 RED 시점에도 통과했다. 둘은 **새 동작이 아니라 회귀 잠금**이라 그렇다 — 전자는 당시 `viTriggers` 자체가 없어 공허하게 참이었고, 후자는 Pitfall 9 가 이미 지키던 계약이다. 「실패를 봤다」고 쓰지 않는다.

## Files Created/Modified

- `webapp/src/lib/use-relay-socket.ts` — `RelayViTriggers` 타입 · `VI_EXCHANGES` · `viAnyRunning` 신설, `case "vi"` 거래소별 병합, `viPendingKey` 에 거래소 추가
- `webapp/src/lib/relay-provider.tsx` — Provider 밖 폴백을 `EMPTY_VI_TRIGGERS` 고정 참조로
- `webapp/src/lib/vi-alert.ts` — `isViServerMessage` 가 `VITrigger` 를 VI 몫으로 받는다
- `webapp/src/components/layout/app-sidebar.tsx` · `me-client.tsx` · `strategy-status-card.tsx` — 가동 판정을 `viAnyRunning` 으로, 요약을 거래소별로
- `webapp/src/components/trading/vi-client.tsx` — KRX 값만 소비 · `vi-last-notice` 줄 신설 · 서버 오류에 출처 배지
- `webapp/src/components/trading/vi-settings-card.tsx` — `VI_EDIT_EXCHANGE` · 새 캡션 · `vi.set` 거래소 · 상단 주석 정정
- `webapp/src/components/trading/vi-order-list.tsx` — 거래소 열(표) · 카드 보조 텍스트
- `webapp/e2e/specs/trading-vi.spec.ts` — 캡션 단언 · 거래소 열 단언 · 110초 열 인덱스 8→9
- `webapp/src/components/trading/__tests__/vi-client.test.tsx` — **신규**. 발동 통보 거래소 4케이스 + 출처 배지 4케이스

## 측정 기록 — `vi.notice` 표시 자리 (acceptance criteria)

계획은 이 자리를 「grep 으로 실측한다」고 남겨 두었다(17-RESEARCH §3-3 이 〔추측〕 표기). 실측 명령과 결과:

```
grep -rn "viNotices" webapp/src webapp/e2e
→ relay-provider.tsx:204 (폴백 초기값) · use-relay-socket.ts:211,317,338,460,1008 (타입·초기값·리듀서·노출)
   relay-provider.test.tsx:269 (개수만 세는 대역)
```

**렌더 소비처는 0곳이었다.** `vi-client.tsx` 는 `viNotices` 를 구조분해조차 하지 않았고, `useViEndAlerts` 가 쓰는 것은 `viOrders`(72/73)이지 통보가 아니다. 그래서 거래소를 「더할」 자리가 없었고, 상태줄에 `data-slot="vi-last-notice"` 줄을 **새로 만들었다**(아래 deviation 3).

## Decisions Made

- **합집합 배지 옆의 요약도 축을 늘렸다.** `viSummaryText(cfg, run)` → `viSummaryText(triggers)`. 배지는 두 거래소를 보는데 요약이 KRX 만 보면, NXT 단독 가동에서 화면이 **주문이 나가지 않을 숫자**를 보여 준다. 출력은 `KRX 1,000만원 · 22.0% 이상` 형태이고 둘 다 가동이면 ` / ` 로 잇는다.
- **거래소를 모르는 `vi` 프레임은 무시한다.** 기본값 KRX 로 접는 선택지는 버렸다 — NXT 의 사실이 KRX 자리에 앉아도 화면은 그것이 지어낸 값임을 말할 방법이 없다.
- **`vi-client` 는 KRX 값만 본다.** Phase 17 범위가 「KRX 편집 유지 + NXT 가시화」이므로(D-18) 폼·계좌 축·에코 상관은 전부 KRX 기준이다. 섞으면 KRX 폼에 NXT 금액이 뜨고 「수정」이 그 값을 KRX 로 등록한다.
- **낙관 확인 Map 의 키는 건드리지 않았다.** 접수 전 행은 확인이 비활성이라 그 Map 에 들어오지 않고, 키 축을 바꾸면 `vi.confirm` 이 싣는 주문번호와 Map 키가 갈린다(17-05 의 「이미 유일한 키에 축을 더하지 않는다」 승계).
- **폰 카드에는 열을 더하지 않았다.** 9열 표도 390px 에서 잘려 카드로 내린 표면이다(R6). 거래소는 시각 옆 보조 텍스트로 낮췄고, 신축 항목은 여전히 종목명 하나뿐이라(C7) 잘림 예산을 건드리지 않는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `isViServerMessage` 가 `VITrigger` 어휘를 받지 않았다**
- **Found during:** Task 3 (서버 메시지 배지)
- **Issue:** 17-01 이 `src` 어휘에 `"VITrigger"` 를 더했지만 VI 화면의 몫 판정(`lib/vi-alert.ts`)은 `SetVITrigger` 와 종목 없는 `Account` 만 받았다. 즉 서버가 VI **런타임 사유**를 보내도 VI 화면은 한 글자도 그리지 않았고, 배지만 붙여서는 `[VI]` 가 영원히 나타날 수 없었다.
- **Fix:** `src === "VITrigger"` 를 VI 몫으로 추가. 대응하는 `"LimitChaser"` 는 **더하지 않았다** — 그것을 받는 순간 Pitfall 9(남의 거부를 내 거부로 그리지 않는다)가 정확히 되살아난다.
- **Files modified:** `webapp/src/lib/vi-alert.ts`, `webapp/src/lib/__tests__/vi-alert.test.ts`
- **Verification:** vi-alert 단위 2케이스 + vi-client 렌더 4케이스 green
- **Committed in:** `ef2b4f0`

**2. [Rule 1 - Bug] webapp `viPendingKey` 가 relay 와 갈려 있었다**
- **Found during:** Task 3 (행 키)
- **Issue:** 17-05 가 relay `viPendingKey` 에 `:${exchange}` 를 더했는데 webapp 쪽은 그대로였다. 두 규칙이 갈리면 72 스냅샷(relay 가 거래소로 가른 2건)과 73 델타 누적(브라우저가 1건으로 접은 결과)이 **다른 목록**이 되고, 같은 종목의 양쪽 발동 중 하나가 화면에서 사라진다(그 주문도 110초 뒤 서버가 취소한다 — 사용자는 이유를 알 수 없다).
- **Fix:** webapp `viPendingKey` 에 거래소 추가 + 두 파일이 같은 규칙임을 양쪽 주석에 못박았다. 계획은 이 수정을 Task 3 의 `vi-order-list.tsx` 로 적었지만 실제 자리는 `use-relay-socket.ts`(Task 1 의 `<files>`)였다 — 목록 컴포넌트는 `viOrderKey` 를 **가져다 쓸 뿐** 규칙을 갖고 있지 않다(그 설계가 옳고, 그래서 한 곳만 고치면 된다).
- **Files modified:** `webapp/src/lib/use-relay-socket.ts`
- **Verification:** `viOrderKey` 유일성 2케이스 + 2행 렌더 케이스 green
- **Committed in:** `ef2b4f0`

**3. [Rule 3 - Blocking] `vi.notice` 표시 자리가 존재하지 않았다**
- **Found during:** Task 3 ③
- **Issue:** 계획은 「`vi.notice` 표시에 거래소를 더한다」였으나 grep 실측 결과 **렌더 소비처가 0곳**이었다(위 §측정 기록). 더할 자리가 없으니 D-06 의 「`vi.notice` 에 거래소 표시」를 만족시킬 방법이 없었다.
- **Fix:** VI 상태줄에 `data-slot="vi-last-notice"` 한 줄을 만들었다 — 최신 1건의 종목명(없으면 ISIN) · **거래소** · 발동가. 목록은 만들지 않았다(주문내역 표가 이미 전수를 그린다).
- **Files modified:** `webapp/src/components/trading/vi-client.tsx`, `webapp/src/components/trading/__tests__/vi-client.test.tsx`
- **Verification:** 4케이스 green (거래소 표기 · 최신 1건 · 통보 없으면 줄 자체 없음 · 이름 없으면 ISIN)
- **Committed in:** `ef2b4f0`
- **남은 판단:** 이 배치가 폰 폭에서 읽히는지는 jsdom 으로 증명할 수 없다 → coverage D6 을 `human_judgment: true` 로 남겼다.

**4. [Rule 2 - Missing Critical] `viSummaryText` 를 거래소별로 바꿨다**
- **Found during:** Task 1 ④
- **Issue:** 계획은 세 소비처가 `viAnyRunning` 만 부르게 하라고 했는데, 전략 현황 행은 배지 **옆에** 요약 문구도 그린다. 배지만 합집합으로 바꾸면 NXT 단독 가동 시 「가동」 옆에 KRX 금액이 붙는다 — 그 숫자로는 주문이 나가지 않는다.
- **Fix:** `viSummaryText(triggers)` 로 시그니처를 바꿔 **가동 중인 거래소마다** 그 거래소의 값을 말하게 했다.
- **Files modified:** `webapp/src/components/trading/strategy-status-card.tsx`, 같은 파일의 테스트
- **Verification:** 단위 4케이스(단독·양쪽·NXT 단독·전부 중지) green
- **Committed in:** `41c8a14`

**5. [Rule 2 - Missing Critical] 거래소를 모르는 `vi` 프레임 가드**
- **Found during:** Task 1 ②
- **Issue:** `RelayViTriggerMsg.x` 는 타입상 필수지만 브라우저는 인바운드 프레임을 런타임 검증하지 않는다(`parseFrame` 은 `t` 만 본다). `x` 가 없는 프레임이 오면 `viTriggers[undefined]` 라는 가짜 키가 생겨 실제 설정을 조용히 가린다.
- **Fix:** `VI_EXCHANGES.includes(frame.x)` 가 아니면 상태를 그대로 돌려준다. **기본값 KRX 로 접지 않는다** — 귀속 근거 없는 값을 지어내지 않는다는 17-05 규율과 같은 선택이다.
- **Files modified:** `webapp/src/lib/use-relay-socket.ts`
- **Verification:** `⑥-b2` 케이스 green
- **Committed in:** `41c8a14`

### 계획과 실측이 어긋난 것 (수정하지 않고 기록)

**6. Task 3 `<behavior>` 의 「`src === "LimitChaser"` → 앞에 `[상따]`」는 VI 화면에서 성립할 수 없다**
- `[상따]` 가 VI 화면에 뜨려면 `isViServerMessage` 가 `LimitChaser` 를 받아야 하는데, 그것은 **16-13/T-16-10 이 의도적으로 잠근 계약(Pitfall 9)을 되돌리는 일**이다: VI 화면이 상따 거부를 그리면 사용자는 멀쩡한 VI 를 껐다 켜고, 그 재등록이 두 번째 무인 발주다.
- `[상따]` 배지가 실제로 보여야 하는 표면은 **메시지 전량을 그리는 상태 바**이고, 그 자리는 17-08 이 이미 적용해 두었다(`relay-status-bar.tsx:254`).
- 그래서 이 plan 은 VI 화면에 `[VI]`/`[서버]` 두 배지만 띄우고, `LimitChaser` 를 **그리지 않는다는 사실 자체**를 회귀 테스트로 잠갔다(`vi-client.test.tsx` — 「`LimitChaser` 사유 줄은 VI 화면이 **그리지 않는다**」).

**7. 파일 경계를 넘은 수정 2건 (트리를 항상 초록으로 두기 위해)**
- Task 2 의 캡션 변경이 `webapp/e2e/specs/trading-vi.spec.ts` 의 캡션 단언을 깨뜨리므로 그 한 줄을 Task 2 커밋에 함께 넣었다(계획상 e2e 는 Task 3 의 파일).
- Task 1 의 `viSummaryText` 변경이 `strategy-status-card.test.tsx` 를 깨뜨리므로 같은 커밋에서 갱신했다(계획상 그 테스트 파일은 목록에 없다).

---

**Total deviations:** 5 auto-fixed (3 missing-critical · 1 bug · 1 blocking) + 2 기록만
**Impact on plan:** 다섯 건 모두 「고치지 않으면 화면이 거짓말을 하는」 자리다. 범위 확대는 `vi-last-notice` 줄 하나뿐이고, 그것도 D-06 이 요구한 표시를 만족시키는 최소 표면이다.

## Issues Encountered

- **`gsd-tools check tdd-red-evidence` 를 쓸 수 없다.** vitest 출력을 파싱하지 못해 항상 `INVALID_RED (zero_tests_discovered)` 를 낸다. TAP 푸터를 지어내지 않고 §TDD Gate Compliance 에 원문 근거를 남겼다 — 이 phase 앞선 plan 들과 같은 처리다.
- **Playwright 를 돌리지 못했다.** e2e 는 dev 서버(PORT=3100) + relay 스텁이 필요하다. 거래소 열 추가로 `td` 인덱스가 밀린 자리를 갱신했고 `tsconfig.e2e.json` 타입은 통과하지만 **실행 검증은 없다** → WINDOWS #14 로 등록했다.

## Broken Windows 처리

- **#13 → fixed.** 「17-05 가 vi 스냅샷을 2프레임으로 넓혔으나 webapp 리듀서가 x 를 무시하고 마지막 프레임으로 덮는다」 — 이 plan 이 닫았다.
- **#14 신규(open).** e2e `trading-vi.spec.ts` 미실행.

## 게이트

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` (루트 전체) | exit 0 · `error TS` 0건 |
| `pnpm --filter @gh-radar/relay run typecheck` · `typecheck:tests` | exit 0 |
| `pnpm --filter @gh-radar/webapp test` | **918 passed** · 1 skipped · 72 파일 (기준선 899/71 → **+19 / +1**) |
| `pnpm --filter @gh-radar/relay run test` | 467 passed · 19 파일 (기준선 동일 — relay 무수정) |
| `pnpm --filter @gh-radar/shared run test` | 108 passed (기준선 동일) |
| `grep -rc viAnyRunning` 세 소비처 | 3 / 3 / 3 (0건 없음) |
| 세 소비처 인라인 `?.run === true` | **0건** |
| `grep -c VI_EDIT_EXCHANGE vi-settings-card.tsx` | 5 (≥2) |
| `grep -c serverMsgBadge vi-client.tsx` / `grep -c "src ===" vi-client.tsx` | 3 / **0** |

게이트 전에 `pnpm --filter @gh-radar/shared build` 를 먼저 돌려 낡은 `dist` 함정(16-41)을 회피했다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **17-11(상따 래치 LED 마운트)과 17-12 가 쓸 수 있는 것:** `viAnyRunning`·`VI_EXCHANGES`·`RelayViTriggers` 가 `@/lib/use-relay-socket` 에서 나간다. VI 가동 판정을 새로 만들지 말고 이 함수를 부를 것.
- **Phase 18(NXT 설정 카드):** `VI_EDIT_EXCHANGE` 상수 하나를 상태로 바꾸면 캡션·`vi.set`·요약 행이 함께 따라온다. `vi-client.tsx:127` 의 `viTriggers.KRX` 도 그때 같이 상태로 열어야 한다(지금은 주석으로 그 사실을 못박아 두었다).
- **미해결:** e2e 미실행(WINDOWS #14) · `vi-last-notice` 줄의 폰 폭 가독성 실브라우저 미확인(coverage D6).
- **`latch-led.tsx` 는 이 plan 이 손대지 않았다** — 여전히 마운트되지 않은 채이고 17-11 몫이다.

---
*Phase: 17-gh-trade-led*
*Completed: 2026-09-20*

## Self-Check: PASSED

- 생성 파일 존재 확인: `webapp/src/components/trading/__tests__/vi-client.test.tsx` · 수정 파일 3종 · SUMMARY 본문 — 전부 디스크에 있다.
- 커밋 해시 6건(`3676481` `41c8a14` `bbfa3df` `bc9ec17` `576c763` `ef2b4f0`) 전부 `git log --all` 에서 조회된다.
- 태스크별 `<acceptance_criteria>` 전 항목 재실행 결과 PASS(위 §게이트 표).
