---
phase: 17-gh-trade-led
plan: 11
subsystem: ui
tags: [react, limit-chaser, latch-led, strategy-log, server-message, container-query, tdd]

# Dependency graph
requires:
  - phase: 17-gh-trade-led
    provides: "17-07 의 `latchLedStateOf`·`LatchLed` 칩·`LATCH_LED_NAMES`·LED 색 토큰 2종"
  - phase: 17-gh-trade-led
    provides: "17-04 의 relay `lc.arm` 결선 — `{t:\"lc.arm\", key, latch}` → 36/37/38 Envelope"
  - phase: 17-gh-trade-led
    provides: "17-01 의 `RelayLcArmMsg` 인바운드 계약 · `serverMsgBadge` · `RelayQuote.kc` · `src` 어휘 2종"
  - phase: 17-gh-trade-led
    provides: "17-06 의 `serverMsgBadge` 적용 형태(배지 span)와 Pitfall 9 재확인 — `LimitChaser` 는 VI 몫이 아니다"
  - phase: 17-gh-trade-led
    provides: "17-08 의 `kc > 0 → '종가'` 선례(`stock-orderbook-section`)와 벽시계 판정 금지 규율"
provides:
  - "상따 상태줄 래치 LED 3개(매수·매도·취소) — 17-07 컴포넌트가 처음으로 화면에 붙었다"
  - "LED 클릭 → `send({t:\"lc.arm\", key, latch})` 1건 · 확인 다이얼로그 없음 · 낙관적 색 변경 없음 · 재전송 없음"
  - "무장 표기 단일화 — 옛 매수/매도 도트 세그먼트 제거, `StrategyStatus` 에서 상태줄 값 4종 삭제"
  - "`StrategyTransition` 16종 — `buyLatched`/`buyUnlatched`/`cancelLatched`/`cancelUnlatched` 추가"
  - "`valuesChanged` skip 집합에 `cancelEntryLatched`·`buyEntryLatched` — 래치 변화가 「서버 반영 완료」로 오인되지 않는다"
  - "첫 스냅샷 규율을 매수·매도·취소 **세 축에서 동일**하게 정렬 (취소 축의 선재 비대칭 해소)"
  - "`serverMessageLogLine` 출처 배지 접두 + 배지가 출처를 말하면 원문 `src` 생략"
  - "`isLimitChaserServerMessage` 가 `src === \"LimitChaser\"` 런타임 사유 줄을 받는다 (VI 판정 무변경)"
  - "상따 헤더 10칸 — `하한` 칸이 `kc > 0` 이면 `종가`(기준가 대비 방향색)"
affects: [17-12, phase-18]

# Actuals (#2632) — estimateTokens 스케일(chars/4, 실현 diff 기준)
actuals:
  tokens: 13465
  tasks: 3
  commits: 5
plan_head_before: f6602beeebaa145115afb2c813edb9f7c6615629

tech-stack:
  added: []
  patterns:
    - "같은 사실을 말하는 표기는 **하나**다 — 새 표면을 붙이면 옛 표면과 그 표면을 먹이던 파생값까지 같은 커밋에서 걷는다"
    - "전송 조건을 **표시 컴포넌트의 렌더 결과에 맡기지 않는다** — 판정 함수에 다시 물어본 뒤에만 보낸다"
    - "출처 배지는 `serverMsgBadge` 반환값으로 분기한다 — `src` 문자열을 소비처에서 다시 비교하지 않는다(어휘가 늘어도 고칠 줄이 없다)"
    - "닫힌 집합인 두 표(문구·순서)는 **테스트가 원소 집합의 동형을 직접 단언**한다 — 개수 세기보다 강하다"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/components/trading/strategy-log.tsx
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
    - webapp/src/components/trading/__tests__/strategy-log.test.tsx
    - webapp/e2e/specs/trading-limit-chaser.spec.ts

key-decisions:
  - "중복 정리 방침 = **LED 가 옛 칩을 대체**한다(둘 다 유지하지 않았다). 상태줄의 매수/매도 도트 세그먼트를 지우고, 그 세그먼트만 먹이던 `StrategyStatus.buyLabel`·`sellLabel`·`buyTone`·`sellTone` 4필드와 `Dot` 의 `up`/`down`/`hollow` 톤까지 같은 커밋에서 걷었다 — 값이 남아 있으면 두 번째 무장 표기가 언젠가 되살아난다"
  - "`isLimitChaserServerMessage` 에 `src === \"LimitChaser\"` 를 더했다 — 그것이 없으면 D-17 의 `[상따]` 배지가 이 화면에서 **영원히 뜨지 않는다**(17-06 이 VI 쪽에서 같은 결손을 `VITrigger` 로 닫으며 남겨 둔 몫)"
  - "첫 스냅샷(`prev === null`) 규율은 계획 `<behavior>` 의 추정이 아니라 **실측한 매도 규율**을 따랐다 — 래치가 켜져 있으면 래치 문장, 아니면 무장 문장. 그 결과 취소 축의 선재 비대칭(첫 스냅샷에서 `cancelArmed` 를 아예 만들지 않던 것)이 함께 닫혔다"
  - "`serverMessageLogLine` 이 배지를 접두로 붙이고, 배지가 출처를 이름으로 말하면(`[상따]`·`[VI]`) 원문 `src` 괄호를 생략한다 — 판정 입력은 **배지 반환값**이지 `src` 문자열이 아니다"
  - "상태줄 `lastError` 를 `{text, src}` 로 바꿔 배지를 렌더 자리에서 한 번만 붙인다(`vi-client` 와 같은 모양) — 로그 줄과 상태줄이 같은 배지를 두 번 말하지 않는다"
  - "`하한` → `종가` 갈래의 색은 하한가 고정색(`--down`)이 아니라 **기준가 대비 방향색**이다 — 고정색을 그대로 쓰면 기준가보다 오른 종가가 빨갛게 보인다"

patterns-established:
  - "Pattern 1: 새 표면을 붙일 때 **옛 표면을 먹이던 파생 필드까지** 같은 커밋에서 지운다 — 남은 필드는 다음 화면이 되살릴 씨앗이다"
  - "Pattern 2: 무반응 조건의 회귀 잠금은 「눌러도 `send` 가 불리지 않는다」를 **조건마다 따로** 단언한다 — 한 케이스로 뭉치면 갈래 하나가 열려도 초록이다"

requirements-completed: [TRADE-04, TRADE-05]

coverage:
  - id: D1
    description: "상따 상태줄에 래치 LED 3개가 매수·매도·취소 순서로 있고, 무장 표기가 이 하나뿐이다 (D-22)"
    requirement: TRADE-05
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx#⑲-1 LED 3개 존재·순서"
        status: pass
      - kind: unit
        ref: "limit-chaser-client.test.tsx#⑲-2 옛 매수/매도 도트 세그먼트 부재 (`ON` 문자열 0)"
        status: pass
      - kind: unit
        ref: "limit-chaser-client.test.tsx#② strategyStatusOf 가 buyLabel/sellLabel/buyTone/sellTone 을 갖지 않는다"
        status: pass
    human_judgment: false
  - id: D2
    description: "클릭 가능한 LED 클릭 → `{t:\"lc.arm\", key, latch}` 1건이 나가고 확인 다이얼로그가 뜨지 않는다 (D-20)"
    requirement: TRADE-05
    verification:
      - kind: unit
        ref: "limit-chaser-client.test.tsx#⑲-4 매도 → latch:'sell' · dialog 0"
        status: pass
      - kind: unit
        ref: "limit-chaser-client.test.tsx#⑲-5 취소 → latch:'cancel' · 매수(side '1') → latch:'buy'"
        status: pass
      - kind: other
        ref: "grep -c 'lc.arm' webapp/src/components/trading/limit-chaser-client.tsx → 2 (요구치 >0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "★ 무반응 조건에서 아무것도 나가지 않고, `send` 실패에 재시도가 없다 (T-17-37 · T-17-40)"
    requirement: TRADE-05
    verification:
      - kind: unit
        ref: "limit-chaser-client.test.tsx#⑲-3 전략 없음 → 세 LED 회색·span·send 0"
        status: pass
      - kind: unit
        ref: "limit-chaser-client.test.tsx#⑲-6 회색 LED 3개 클릭 → send 0"
        status: pass
      - kind: unit
        ref: "limit-chaser-client.test.tsx#⑲-7 buyWatchSide '0' 매수 LED → 초록이되 send 0 (BL-01)"
        status: pass
      - kind: unit
        ref: "limit-chaser-client.test.tsx#⑲-8 연타 3회 = 3건 · send=false 뒤 30초 경과에도 1건"
        status: pass
    human_judgment: false
  - id: D4
    description: "`hadOrder` 가 LED 로 전달돼 발주로 소진된 무장이 「(발주됨)」으로 보인다 (17-07 인계 ①)"
    requirement: TRADE-05
    verification:
      - kind: unit
        ref: "limit-chaser-client.test.tsx#⑲-9 보낸 적 없는 무장 해제 → tone off + '(발주됨)'"
        status: pass
    human_judgment: false
  - id: D5
    description: "전략 로그가 취소·매수 래치 전이 4종을 말하고, 두 표가 16종 닫힌 집합으로 동형이다 (D-23)"
    requirement: TRADE-05
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-log.test.tsx#⑰-1 ⑰-2 래치 ON/해제 4문장"
        status: pass
      - kind: unit
        ref: "strategy-log.test.tsx#⑰-6 TRANSITION_ORDER 16 · TRANSITION_TEXT 16 · 두 집합 동일"
        status: pass
      - kind: unit
        ref: "strategy-log.test.tsx#⑰-7 한 줄 순서가 매수 → 매도 → 취소 축"
        status: pass
    human_judgment: false
  - id: D6
    description: "★ 래치 필드 변경이 「서버 반영 완료」로 오인되지 않는다 (T-17-39)"
    requirement: TRADE-05
    verification:
      - kind: unit
        ref: "strategy-log.test.tsx#⑰-3 래치 두 필드만 바뀐 에코 → 「서버 반영 완료」 없음"
        status: pass
      - kind: unit
        ref: "strategy-log.test.tsx#⑰-4 값이 함께 바뀌면 붙는다 — skip 이 값 축을 먹지 않는다"
        status: pass
    human_judgment: false
  - id: D7
    description: "상따 화면 서버 메시지에 `[상따]`/`[VI]`/`[서버]` 배지가 붙고, `LimitChaser` 사유 줄이 실제로 그려진다 (D-17)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "strategy-log.test.tsx#⑱-1 ⑱-2 배지 접두 + 원문 src 중복 제거"
        status: pass
      - kind: unit
        ref: "strategy-log.test.tsx#⑬b LimitChaser 는 상따 몫 · isViServerMessage 는 여전히 false (Pitfall 9)"
        status: pass
      - kind: unit
        ref: "limit-chaser-client.test.tsx#⑳-1 ⑳-2 상태줄 배지 span · 로그 줄 접두"
        status: pass
      - kind: other
        ref: "grep -c serverMsgBadge limit-chaser-client.tsx → 4 · grep -c 'src ===' → 0"
        status: pass
    human_judgment: false
  - id: D8
    description: "상따 헤더 `하한` 칸이 `kc > 0` 이면 `종가` 이고 밴드 배치는 그대로다 (D-11 개정)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "limit-chaser-client.test.tsx#⑳-a kc=0 → 라벨 '하한'·81,200·--down"
        status: pass
      - kind: unit
        ref: "limit-chaser-client.test.tsx#⑳-b kc=118,500 → 라벨 '종가'·--up·order-[7] 유지"
        status: pass
      - kind: unit
        ref: "limit-chaser-client.test.tsx#⑳-c 기준가 아래 → --down · 같으면 --flat"
        status: pass
      - kind: other
        ref: "git diff --stat webapp/src/styles/globals.css → 0줄 · 밴드 리터럴 4줄 보존"
        status: pass
    human_judgment: false
  - id: D9
    description: "D-22 가 약속한 dev 서버 화면 확인 — 상태줄 LED 3칩이 실제로 목업대로 보이고 폰 밴드에서 두 줄로 접히며 잘림이 없다"
    verification: []
    human_judgment: true
    rationale: "jsdom 에는 레이아웃이 없어 폭·접힘·잘림을 유닛으로 증명할 수 없고, 상태줄에 칩 3개가 더해지면서 폰 밴드의 가로 예산이 실제로 줄었다. Playwright 도 이 phase 에서 실행되지 않았다(WINDOWS 15·16). 사람이 dev 서버(PORT=3100)에서 한 번 봐야 한다."

# Metrics
duration: 14min
completed: 2026-09-20
status: complete
---

# Phase 17 Plan 11: 상따 래치 LED 결선 · 로그 전이 4종 · 헤더 종가 Summary

**17-07 의 LED 칩이 처음으로 화면에 붙어 클릭 한 번이 `lc.arm` 1건으로 나가고, 옛 매수/매도 도트 세그먼트는 그 자리에서 사라졌다 — 무장 상태를 말하는 표기가 하나가 됐다**

## Performance

- **Duration:** 14 min
- **Started:** 2026-09-20T09:57:02Z
- **Completed:** 2026-09-20T10:11:35Z
- **Tasks:** 3
- **Files modified:** 6 (신규 0 · 수정 6)

## Accomplishments

- **TRADE-05 가 사용자에게 도달했다.** 17-07 이 만든 `LatchLed` 는 어느 화면에도 붙어 있지 않았고, 17-04 가 뚫은 `lc.arm` 경로는 호출부가 없었다. 이 plan 이 그 둘을 이어 **상따 화면에서 래치를 눈으로 보고 클릭으로 토글**할 수 있게 했다.
- **무장 표기를 하나로 줄였다.** LED 를 얹으면서 옛 매수/매도 도트 세그먼트를 지웠고, 그 세그먼트만 먹이던 `StrategyStatus` 상태줄 값 4종과 `Dot` 의 무장 톤 3종까지 같은 커밋에서 걷었다. 두 표기가 같은 무장을 서로 다르게 말할 자리를 **구조에서** 없앴다.
- **무반응 조건 4갈래를 각각 따로 잠갔다.** 전략 없음 · 회색 LED · 매도잔량 기준 매수 · `send` 실패 재시도 — 한 케이스로 뭉치면 갈래 하나가 열려도 초록이다. 이 화면의 클릭은 실계좌 발주 판정을 시작시킨다.
- **래치 변화가 「서버 반영 완료」로 둔갑하지 않는다.** `valuesChanged` skip 집합에 두 필드를 더했다 — 빠져 있으면 사용자가 **자기가 하지도 않은 수정이 반영됐다**고 읽는다.
- **`[상따]` 배지를 실제로 살렸다.** 17-01 이 `src` 어휘에 더한 `"LimitChaser"` 는 받아 주는 판정이 없어 **한 글자도 그려지지 않고 있었다.** `lc.arm` 실패 사유가 사용자에게 도달하는 유일한 경로가 그것이라 이 plan 없이는 LED 를 눌러도 거부 이유를 볼 방법이 없었다.
- **헤더 `하한` 칸이 종가에 자리를 내줬다** (사용자 결정 2026-09-18). 칸 수 10 · `order` 배치 번호 · 나머지 9칸 · `globals.css` 전부 무변경이다.

## Task 1 — 중복 정리 방침 (계획 ① 의 기록 의무)

**「칩 제거 / LED 가 칩을 대체 / 둘 다 유지하되 역할 분담」 중 「LED 가 칩을 대체」를 택했다.** D-22 가 「기존 매수/매도 도트 세그먼트는 LED 가 대체한다」고 이미 못박은 그대로다. 실제로 지운 것:

| 지운 것 | 자리 | 이유 |
|---|---|---|
| 매수 세그먼트(`Dot` + `매수` + `ON`/`OFF` + `(발주됨)`) | `StatusBar` | LED 가 같은 사실을 3단계 · 클릭 가능 여부 · 매도잔량 기준 예외까지 말한다 |
| 매도 세그먼트(`Dot` + `매도` + `감시`/`대기`/`OFF`) | `StatusBar` | 위와 같다 |
| `StrategyStatus.buyLabel`·`sellLabel`·`buyTone`·`sellTone` | `strategyStatusOf` 반환 | **그 두 세그먼트만** 먹이던 파생값이다. 남기면 다음 화면이 두 번째 무장 표기를 되살린다 |
| `Dot` 의 `up`/`down`/`hollow` 톤 | `Dot` 유니온 | 같은 이유. 남은 톤은 DMA 연결이 쓰는 `ok`/`off` 둘뿐이다 |

**남긴 것:** `strategyStatusOf` 자체와 `buyText`/`sellText` — 이 둘은 상태줄이 아니라 **폼 그룹 헤더 문구**(A4a · A7a)라 LED 와 겹치지 않는다. 잔량추적 기준선 · 미반영 · 서버 거부 · 반영 시각 세그먼트도 그대로다.

## Task 2 — 서버 메시지 표시 자리 실측 경로 (계획 ⑤ 의 기록 의무)

grep 으로 잰 결과 이 화면의 서버 메시지 소비 지점은 **한 곳**이고, 거기서 두 표면으로 갈라진다:

```
webapp/src/components/trading/limit-chaser-client.tsx:~430  (「ServerMessage(54) — 상따 몫만 (④)」 useEffect)
  messages → isLimitChaserServerMessage(msg) 로 거른 뒤
    ├─ serverMessageLogLine(msg) → pushLog(text, level)      … 전략 로그 (배지는 이 함수가 접두)
    └─ level === 'error' → setLastError({ text: msg.m, src }) … 상태줄 (배지는 렌더 자리에서 span)
```

17-RESEARCH §3-3 이 〔추측〕으로 둔 지점이 이 `useEffect` 가 맞다. 배지는 **두 표면이 각각 한 번씩** 붙이고, 같은 줄에 두 번 나오지 않는다.

## Task Commits

1. **Task 1 (tracer · TDD): 상태줄 LED 3개 + 클릭 → `lc.arm`**
   - RED — `8d2378d` (test)
   - GREEN — `f77e2fa` (feat)
   - REFACTOR — 없음 (구현이 이미 최소이고 분기 중복이 없다)
2. **Task 2 (TDD): 래치 전이 4종 + skip 2필드 + 출처 배지**
   - RED — `7778ab1` (test)
   - GREEN — `ce0ff8d` (feat)
   - REFACTOR — 없음
3. **Task 3: 헤더 `하한` → `종가`** — `be2fcc1` (feat)

**Plan metadata:** 이 SUMMARY 커밋.

`commits: 5` 는 서술이 아니라 `git rev-list --count f6602be..HEAD` 로 **측정**한 값이다(SUMMARY 커밋 직전 기준). 다섯 커밋 전부 이 실행자의 것이고, 다른 세션이 끼어든 커밋은 없다.

## Files Created/Modified

- `webapp/src/components/trading/limit-chaser-client.tsx` (+194/-72 상당) — LED 3개 배치 · `handleArm` · `ledServer`(+`hadOrder`) · 상태줄 배지 span · `하한`↔`종가` 갈래 · `StrategyStatus`/`Dot` 축소
- `webapp/src/components/trading/strategy-log.tsx` (+70) — 전이 16종 · 두 표 공개 · skip 2필드 · 첫 스냅샷 3축 정렬 · `serverMessageLogLine` 배지 접두
- `webapp/src/lib/limit-chaser.ts` (+11) — `isLimitChaserServerMessage` 가 `LimitChaser` 어휘를 받는다
- `webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx` (+265) — ⑲ 9케이스 · ⑳ 2케이스 · ⑳-a~c 3케이스 · ② 재작성
- `webapp/src/components/trading/__tests__/strategy-log.test.tsx` (+138) — ⑬b · ⑰ 7케이스 · ⑱ 2케이스 · ⑩ 갱신
- `webapp/e2e/specs/trading-limit-chaser.spec.ts` (+44) — 케이스 3b 신설 · 케이스 3 의 「매수 ON」 단언을 LED `data-tone` 단언으로 교체

## Decisions Made

1. **중복 정리는 「대체」다** — 위 Task 1 표. 파생 필드까지 지운 것이 핵심이다.
2. **`isLimitChaserServerMessage` 에 `"LimitChaser"` 를 더했다.** 아래 Deviations 1 참조. `isViServerMessage` 는 이 함수를 재사용하지만 `"LimitChaser"` 가 `src === "Account"` 갈래를 타지 않으므로 VI 판정은 무변경이고, 그 사실을 테스트 ⑬b 가 잠근다.
3. **첫 스냅샷 규율은 실측한 매도 규율을 따랐다.** 계획 `<behavior>` 는 「첫 스냅샷에서 래치 문장을 지어 붙이지 않는다」고 썼지만, 계획 `<action>` ④ 는 「기존 `sellEntryLatched` 가 하는 것과 **똑같이** 맞춘다(실측해서)」고 지시했다. 실측 결과 매도는 **붙인다**(`if (next.sellEntryLatched) hit.add('sellLatched')`). 지시가 더 구체적이고 이유(축마다 다르게 보고되는 것을 막는다)가 명시돼 있어 실측 쪽을 따랐다.
4. **배지 판정 입력은 `serverMsgBadge` 의 반환값이다.** 원문 `src` 괄호를 생략할지 정할 때도 `badge !== serverMsgBadge('')` 로 묻는다 — `src` 문자열을 다시 비교하지 않으므로 서버 어휘가 늘어도 이 줄은 고칠 것이 없다.
5. **상태줄 `lastError` 를 `{text, src}` 로 바꿨다** (`vi-client` 와 같은 모양). 로그 줄은 `serverMessageLogLine` 이 배지를 붙인 문장을 쓰고, 상태줄은 원문 + 렌더 자리 배지를 쓴다 — 한 줄에 배지가 두 번 나오는 경로가 없다.
6. **종가 칸의 색은 기준가 대비 방향색이다.** 하한가의 `--down` 고정색을 그대로 물려주면 기준가보다 오른 종가가 빨갛게 보인다. 다른 9칸과 같은 `priceTone` 을 쓴다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `isLimitChaserServerMessage` 가 `"LimitChaser"` 어휘를 받지 않았다**
- **Found during:** Task 2 (서버 메시지 배지)
- **Issue:** 계획 `<behavior>` 는 「`src === "LimitChaser"` 서버 메시지 → 로그 줄 앞에 `[상따]`」를 요구하는데, 이 화면의 메시지 필터가 그 어휘를 **거르고 있었다**(`SetLimitChaser` 와 종목 붙은 `Account` 만 통과). 그대로 두면 배지 코드를 넣어도 `[상따]` 는 영원히 뜨지 않는다. 더 중요한 것은 그것이 **`lc.arm` 실패 사유가 사용자에게 도달하는 유일한 경로**라는 점이다 — 서버는 36/37/38 거부를 응답 코드로 주지 않고 이 통지 한 줄로만 말한다(D-04 · D-20). Task 1 이 붙인 LED 를 눌러 거부당해도 화면이 아무 말도 하지 않는 상태였다.
- **Fix:** `src === "LimitChaser"` 를 상따 몫으로 추가. **대응하는 `"VITrigger"` 는 더하지 않았다** — 그것이 Pitfall 9 그 자체다.
- **Files modified:** `webapp/src/lib/limit-chaser.ts`, `__tests__/strategy-log.test.tsx`
- **Verification:** ⑬b green (`isViServerMessage('LimitChaser')` 이 여전히 false 임을 함께 단언) · ⑳-1 green
- **Committed in:** `ce0ff8d`

**2. [Rule 1 - Bug] 첫 스냅샷에서 취소 축만 무장 문장을 만들지 않았다**
- **Found during:** Task 2 (`prev === null` 갈래 실측)
- **Issue:** `prev === null` 갈래가 매수(`buyArmed`)·매도(`sellArmed`)는 만들면서 **취소는 아무것도 만들지 않았다.** 자동취소만 켜 둔 전략을 열면 등록 줄이 「전략이 등록됐어요」 하나뿐이라, 사용자는 취소 게이트가 꺼진 줄 안다. 계획 ④ 가 요구한 「세 축 같은 규율」을 만족시키려면 이 비대칭부터 닫아야 했다.
- **Fix:** 첫 스냅샷 갈래를 세 축 모두 「래치 켜져 있으면 래치 문장, 아니면 무장 문장」으로 정렬했다.
- **Files modified:** `webapp/src/components/trading/strategy-log.tsx`, `__tests__/strategy-log.test.tsx`
- **Verification:** ⑰-5 green (세 축 + 래치 꺼진 취소 축 4단언)
- **Committed in:** `ce0ff8d`

### 계획서와의 편차 (버그 아님 — 기록)

**3. [계획 vs 실측] Task 2 `<behavior>` 의 첫 스냅샷 기대가 실측과 반대였다**
- 위 Decisions 3. `<action>` ④ 의 「실측해서 같은 규율을 쓴다」를 따랐고, 그 선택의 근거·결과를 ⑰-5 가 문서 대신 단언으로 들고 있다.

**4. [게이트 함정] Task 3 의 `grep -c "order-\["` 는 `border-[` 를 함께 센다**
- 계획 verify 는 「작업 전 값과 같을 것」인데, **`border-[1.5px]` 같은 문자열이 `order-[` 를 부분일치로 포함**한다. 실제 값:
  | 시점 | 원시 `order-\[` | 배치 번호만(`[^b]order-\[`) |
  |---|---|---|
  | 작업 전(`f6602be`) | 23 | **20** |
  | Task 1 후 | 22 | **20** |
  | 최종 | 22 | **20** |
  원시 카운트가 23 → 22 로 준 이유는 **Task 1 이 `Dot` 의 `hollow` 톤(`border-[1.5px] …`) 한 줄을 지웠기 때문**이고 배치 번호와 무관하다. **밴드 배치 번호는 20 으로 전·후 동일**하다. 게이트가 재는 명제(「배치가 안 바뀌었다」)는 충족했고, 게이트 식이 그 명제를 정확히 재지 못한다는 사실을 여기 남긴다.
- 같은 이유로 Task 1 의 「추가된 줄에 뷰포트 접두사 grep 0」도 **주석에 쓴 `sm:`/`md:`/`lg:` 리터럴**에 한 번 걸렸다. 주석 문구를 「뷰포트 브레이크포인트 유틸」로 바꿔 0 을 만들었다 — 게이트를 느슨하게 만들지 않고 문구를 옮긴 쪽을 택했다(17-07 이 같은 상황에서 한 선택).

**5. [범위] `strategy-badge.tsx` diff 0줄 (D-23)**
- `grep -cE "cancelEntryLatched|buyEntryLatched|LatchLed|latchLedStateOf" webapp/src/components/trading/strategy-badge.tsx` = **0** · `git diff --stat` 비어 있음. 래치 3종의 표면은 LED 이고 배지에 섞지 않았다.

**6. [범위] `globals.css` diff 0줄**
- 토큰은 17-07 소유다. `700px`/`830px`/`992px` 리터럴 4줄 그대로.

**7. [범위] e2e 케이스 3 의 단언을 바꿨다 (계획 파일 목록 밖 아님 — 같은 파일이다)**
- 케이스 3 이 `statusBar` 에서 `매수 ON` 을 기다리고 있었는데 그 문구가 **DOM 에서 사라졌다**. 단언을 지우지 않고 같은 명제를 LED 로 다시 썼다: 스텁 게이트웨이의 기본 `buyWatchSide` 가 `"0"` 이므로 매수 LED 는 `data-tone="armed"` 다(BL-01). 그 갈래의 실제 색을 e2e 가 처음으로 재게 됐다.

---

**Total deviations:** 2 auto-fixed (1 missing-critical, 1 bug) + 5 범위·게이트 기록
**Impact on plan:** 범위를 넓히지 않았다. 두 auto-fix 는 계획이 요구한 behavior(`[상따]` 배지 · 세 축 같은 규율)를 **실제로 성립시키기 위한** 것이고, 둘 다 계획이 이미 지시한 명제 안에 있다.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 1 | ✓ `8d2378d` | ✓ `f77e2fa` | — (변경 없음) | Pass |
| 2 | ✓ `7778ab1` | ✓ `ce0ff8d` | — (변경 없음) | Pass |
| 3 | 해당 없음 (`tdd` 속성 없음) | `be2fcc1` | — | N/A |

**RED 증거 (#3770 실질 요건)**

| 항목 | Task 1 | Task 2 |
|---|---|---|
| command | `npx vitest --run src/components/trading/__tests__/limit-chaser-client.test.tsx` (cwd `webapp/`) | `npx vitest --run …/strategy-log.test.tsx …/limit-chaser-client.test.tsx` |
| exit | `1` | `1` |
| 발견 테스트 | **60** (모듈 정상 로드) | **88** (두 파일 정상 로드) |
| 집계 | **8 실패 / 52 통과** | **13 실패 / 75 통과** |
| 실패 형태 | 전부 **단언 실패** — `expected null not to be null`(LED 미존재) · `expected '…매수 ON…' not to contain 'ON'` · `expected +0 to be 1`(send 미호출) | 전부 **단언 실패** — `expected '서버 반영 완료' to be '취소 진입 래치 ON — 취소 판정 시작'` · `expected '서버 통지 (VITrigger) — VI 발동' to be '[VI] 서버 통지 — VI 발동'` · `expected false to be true`(LimitChaser 필터) |
| 대표 대상 테스트 | `⑲-4 매도 LED 클릭 → {t:"lc.arm", …} 1건` · `⑲-7 매도잔량 기준 매수 LED → send 미호출` | `⑰-3 래치 두 필드만 바뀐 에코는 「서버 반영 완료」를 내지 않는다` · `⑱-1 [상따] 접두` |

**의도된 RED 단계 통과 — Task 1 의 `⑲-6` 1건.** 「회색 LED 3개를 눌러도 `send` 미호출」은 RED 시점에 **LED 가 하나도 없어 루프가 아예 돌지 않아** 공허하게 통과했다. 「실패를 봤다」고 쓰지 않는다 — 이 케이스가 실제로 무는 것은 GREEN 이후이고, 그때부터 회귀 그물이 된다. Task 2 에는 그런 케이스가 없다(13 실패 = 새 단언 13건 전부).

**⚠ `gsd-tools check tdd-red-evidence` 는 이 저장소에서 구조적으로 쓸 수 없다** (17-01·17-02·17-07 이 보고한 도구 갭 그대로). `parseNodeTestSummary` 가 `node --test` 의 `# tests/# pass/# fail` 푸터로만 집계를 읽는데 vitest 는 그 푸터를 내지 않아 어떤 입력이든 `INVALID_RED (zero_tests_discovered)` 다. 푸터를 손으로 지어내는 것은 게이트가 검사하려던 증거의 위조라 하지 않았고, 대신 위 표로 실질 증거를 남긴다.

## Verification

| 게이트 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/webapp run test` | **998 passed · 1 skipped / 73 파일** (baseline 974 / 73 → **+24**) |
| `pnpm --filter @gh-radar/relay run test` | **467 passed / 19 파일** (baseline 동일 — 회귀 0) |
| `pnpm --filter @gh-radar/shared run test` | **108 passed / 9 파일** (baseline 동일) |
| `pnpm typecheck` (루트 전 워크스페이스) | exit 0 · `error TS` 0건 |
| `relay typecheck` · `relay typecheck:tests` | 둘 다 exit 0 |
| `pnpm --filter @gh-radar/webapp run build` | exit 0 · `✓ Compiled successfully` |
| `grep -c 'lc.arm' limit-chaser-client.tsx` | **2** (요구치 >0) |
| `grep -cE '700px\|830px\|992px' globals.css` | **4** (요구치 ≥3) · `git diff --stat globals.css` **비어 있음** |
| `grep -c '…Latched\|…Unlatched' strategy-log.tsx` | **18** (요구치 ≥8) |
| `grep -cE '…' strategy-badge.tsx` (D-23) | **0** · diff 0줄 |
| `grep -c serverMsgBadge limit-chaser-client.tsx` / `grep -c 'src ===' ` | **4 / 0** |
| 배치 번호(`[^b]order-\[`) 전/후 | **20 / 20** (원시 `order-\[` 23 → 22 는 `border-[1.5px]` 부분일치 — 위 편차 4) |
| 추가된 줄의 뷰포트 접두사 | **0** |

게이트 전에 `pnpm --filter @gh-radar/shared build` 를 먼저 돌려 낡은 `dist` 함정(16-41 발견)을 회피했다.

## Issues Encountered

- **⑳-1 의 로그 줄 단언이 처음에 틀렸다(테스트 쪽 버그).** `strategy-log-row` 는 `시각 span + 문장 span` 두 조각이라 `textContent.startsWith('[상따]')` 가 성립할 수 없다. 배지는 **문장 span 의 맨 앞**에 있다 — 조회구를 그쪽으로 좁혀 고쳤다. 구현은 손대지 않았다.
- 그 밖의 문제 없음. baseline(relay 467 · webapp 974 · shared 108) 대비 회귀 0.

## Known Stubs

없음 — 가짜 데이터·하드코딩된 빈 값이 없다. LED 가 읽는 값은 전부 서버 에코 스냅샷의 실제 필드이고, `hadOrder` 는 이 화면이 주문 통보로 아는 사실(`fired`)이다.

**다만 사람이 한 번 봐야 하는 것이 하나 남았다** — 아래 「Next Phase Readiness」의 D-22 항목. 이것은 stub 이 아니라 **기계가 증명할 수 없는 종류의 사실**이다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **17-12 가 쓸 것이 준비됐다.** LED 클릭 → `send({t:"lc.arm"})` 까지는 유닛이 증명했고, **그 프레임이 mock 게이트웨이에 36/37/38 로 실제 도달하는 왕복**은 17-12 의 몫이다(계획 ⑥ 이 명시적으로 그쪽으로 넘겼다). 조회구는 `[data-slot="latch-led"][data-kind="buy|sell|cancel"]` 다.
- **★ D-22 dev 서버 확인이 남았다 (사람 몫).** 상태줄에 칩 3개가 더해지면서 폰 밴드의 가로 예산이 실제로 줄었다. `dev.sh` 기준 **PORT=3100** 에서 `/trading/limit-chaser/{키}` 를 열어 ① 칩 3개가 목업(A 칩 · OFF/대기/감시)대로 보이는지 ② 폰 밴드에서 두 줄로 접히되 **잘리지 않는지** ③ 클릭 불가 칩의 점선 테두리와 툴팁이 뜨는지를 한 번 봐야 한다. jsdom 에는 레이아웃이 없어 유닛으로는 증명 불가다(WINDOWS 16).
- **Playwright 는 이 plan 에서도 실행하지 않았다** — 새 케이스 3b 와 바뀐 케이스 3 은 `tsconfig.e2e.json` 타입 통과로만 확인했다(WINDOWS 15, 이 phase 의 #14 와 같은 성격).
- **배포는 아직이다.** 이 plan 은 webapp 만 바꿨다(relay·server·shared 소스 0줄). D-26 순서대로 20:00 KST 이후 사용자 확인 뒤에 Vercel 배포하면 된다.
- 블로커 없음.

---
*Phase: 17-gh-trade-led*
*Completed: 2026-09-20*
