---
phase: 17-gh-trade-led
plan: 07
subsystem: ui
tags: [react, tailwind, wcag, radix-tooltip, limit-chaser, latch-led, tdd]

# Dependency graph
requires:
  - phase: 17-gh-trade-led
    provides: "17-01 의 shared 계약 — `RelayLimitChaser.cancelEntryLatched`·`buyEntryLatched`(S→C 전용 원값)와 `buyWatchSide`"
provides:
  - "CSS 토큰 `--led-latent`(주황 · 잠복) · `--led-armed`(초록 · 래치 ON) — `:root` / `.dark` 양쪽"
  - "`latchLedStateOf(kind, server)` — 서버 에코 스냅샷 1건 → LED 색·클릭 가능·라벨·툴팁 순수 판정 (C# `LimitChaserForm` 동형)"
  - "`LatchLed` 컴포넌트 — 채택안 A 칩. 클릭 가능=`<button aria-pressed>` · 클릭 불가=비상호작용 `<span>`(탭 순서 밖이되 툴팁은 뜬다)"
  - "`LATCH_LED_NAMES` — 매수/매도/취소 이름의 단일 정의 지점"
  - "C# 원문 툴팁 7종 리터럴(매수 3 · 매도 2 · 취소 2)"
  - "규칙 표 19케이스 — 두 상습 오독(매도잔량 기준 매수 · 취소 잔량추적)을 테스트로 봉인"
affects: [17-11, 17-12, phase-18]

# Actuals (#2632) — estimateTokens 스케일(chars/4, 실현 diff 기준)
actuals:
  tokens: 6885
  tasks: 3
  commits: 3
plan_head_before: 7839b6138c03868c010d3b2dee981323fa098622

tech-stack:
  added: []
  patterns:
    - "「서버 에코 → 표시 상태」는 순수 함수 하나가 소유 — 색 판정과 클릭 가능 판정이 **같은 식**을 쓴다"
    - "클릭 불가 상태는 `disabled` 버튼이 아니라 비상호작용 요소 — 탭 순서를 비우면서 툴팁(왜 안 눌리는지)은 살린다"
    - "색 토큰은 CSS 클래스로만 소비 — 토큰 값을 JS 로 읽어 주입하지 않는다(oklch 거부 소비처 회피)"
    - "판정 함수가 읽지 말아야 할 필드는 **테스트가 소스를 읽어** 봉인한다(주석에조차 안 남긴다)"

key-files:
  created:
    - webapp/src/components/trading/latch-led.tsx
    - webapp/src/components/trading/__tests__/latch-led.test.tsx
  modified:
    - webapp/src/styles/globals.css

key-decisions:
  - "매도·취소 툴팁은 목업 문구가 아니라 **C# 정본 원문**을 이식했다 — 목업의 sell/cancel 문구는 계획 단계의 근사치였고 `LimitChaserForm.cs:4283/4284/4380/4381` 과 달랐다"
  - "클릭 불가 LED 는 `<button disabled>` 가 아니라 `<span>` — `disabled` 버튼은 포인터 이벤트를 받지 않아 「매도잔량 기준」 툴팁이 영영 뜨지 못한다"
  - "`server === null` 의 라벨은 목업의 `—` 가 아니라 `OFF` — 계획서 반환 타입이 라벨을 3종으로 제한했고, C# 도 전략 없음과 무장 OFF 를 같은 회색으로 그린다"
  - "RED 커밋에 타입·서명만 있는 스켈레톤 모듈을 함께 넣었다 — 새 모듈의 RED 가 「모듈 없음」 로드 실패로 떨어지면 #3770 기준 INVALID_RED 다"
  - "`cancelQtyTrackEnabled` 는 판정 함수 본문에서 **주석으로도** 언급하지 않는다 — 봉인 게이트가 본문 grep 0 이기 때문이고, 설명은 파일 상단 ⚠️ 블록이 소유한다"

patterns-established:
  - "Pattern 1: 색 밖의 텍스트 경로는 `aria-label` 이 아니라 **보이는 라벨 + sr-only 조사**로 만든다 — 접근성 이름이 화면 텍스트에서 파생되면 둘이 갈릴 수 없다"
  - "Pattern 2: 긴 한국어 툴팁은 `TooltipContent` 의 기본 `whitespace-nowrap` 을 `whitespace-normal` 로 덮는다 — 잘린 툴팁을 남기지 않는다"

requirements-completed: [TRADE-05]

coverage:
  - id: D1
    description: "LED 색 토큰 `--led-latent`/`--led-armed` 가 라이트·다크 둘 다 정의되고, §2.2b 밴드 경계 정본은 손대지 않았다"
    requirement: TRADE-05
    verification:
      - kind: other
        ref: "grep -c -- '--led-latent' webapp/src/styles/globals.css (=3, :root/.dark/주석) · '--led-armed' (=3)"
        status: pass
      - kind: other
        ref: "diff <(grep -nE '700px|830px|992px' globals.css) 작업전 스냅샷 → 차이 0"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/webapp run build (exit 0, Compiled successfully)"
        status: pass
    human_judgment: false
  - id: D2
    description: "`latchLedStateOf` 가 C# 정본 규칙과 동형이다 — 매수 5 · 매도 3 · 취소 4 · 전략 없음 1 케이스"
    requirement: TRADE-05
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/latch-led.test.tsx#①②-1~3 ③-1~4 ④-1~5"
        status: pass
    human_judgment: false
  - id: D3
    description: "두 상습 오독이 테스트로 봉인됐다 — 매도잔량 기준 매수 LED 는 초록·클릭 불가(T-17-23), 취소 무장은 `cancelQtyTrackEnabled` 를 읽지 않는다(T-17-24)"
    requirement: TRADE-05
    verification:
      - kind: unit
        ref: "latch-led.test.tsx#③-1 ★Pitfall 5 · ③-4 판정 함수 본문 grep 0 · ④-2 ★Pitfall 4 · ④-3"
        status: pass
    human_judgment: false
  - id: D4
    description: "LED 가 색만으로 상태를 말하지 않는다 — 보이는 라벨 OFF/대기/감시 + sr-only 조사, 클릭 가능만 `aria-pressed`(T-17-25)"
    requirement: TRADE-05
    verification:
      - kind: unit
        ref: "latch-led.test.tsx#⑥-1 ⑥-2 ⑥-3"
        status: pass
    human_judgment: false
  - id: D5
    description: "클릭이 `onArm(kind)` 을 정확히 한 번 부르고, 클릭 불가 LED 는 부르지 않는다 (17-11 의 `lc.arm` 결선 지점)"
    requirement: TRADE-05
    verification:
      - kind: unit
        ref: "latch-led.test.tsx#⑦-1 ⑦-2"
        status: pass
    human_judgment: false
  - id: D6
    description: "채택안(A 칩 · OFF/대기/감시)이 실제 화면에서 목업대로 보인다"
    verification: []
    human_judgment: true
    rationale: "이 plan 의 범위는 컴포넌트까지이고 상따 상태줄 결선은 17-11 이다 — 화면에 붙기 전에는 렌더 결과를 사람이 볼 수 없다. D-22 가 약속한 dev 서버 스크린샷 확인은 17-11 에서 수행한다."

# Metrics
duration: 8min
completed: 2026-09-18
status: complete
---

# Phase 17 Plan 07: 상따 래치 LED 3종 Summary

**C# `LimitChaserForm` 규칙과 동형인 순수 판정 함수 `latchLedStateOf` + 채택안 A 칩 `LatchLed` 컴포넌트 + 라이트/다크 LED 색 토큰 2종, 19케이스로 봉인**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-18T02:01:31Z
- **Completed:** 2026-09-18T02:09:33Z
- **Tasks:** 3
- **Files modified:** 3 (신규 2 · 수정 1)

## Accomplishments

- **LED 3종의 판정이 C# 정본과 같은 순수 함수 하나가 됐다.** 색 판정과 클릭 가능 판정이 **같은 식**을 쓴다(C# D-09) — 두 식이 갈리면 「눌리는데 회색」 같은 상태가 생기고 사용자는 어느 쪽을 믿어야 할지 알 수 없다.
- **두 상습 오독을 테스트가 막는다.** ① 매도잔량 기준(`buyWatchSide "0"`)에서 매수 LED 는 `buyEntryLatched` 값과 **무관하게** 초록·클릭 불가(④-2·④-3). ② 취소 무장 판정이 `cancelQtyTrackEnabled` 를 읽지 않는다 — 단언이 아니라 **소스를 읽어 본문 grep 0 을 검사**한다(③-4). 이 둘이 깨지면 화면이 「감시 중」이라 말하는데 서버는 판정을 시작하지 않았거나, 그 반대다.
- **색 밖의 텍스트 경로를 구조로 보장했다.** `aria-label` 을 따로 쓰지 않고 **보이는 라벨 + sr-only 조사(「래치」)** 로 접근성 이름을 화면 텍스트에서 파생시켰다 — 둘이 갈릴 수 없는 배치다(WCAG 1.4.1 · T-17-25).
- **툴팁 문구를 목업이 아니라 C# 소스에서 다시 가져왔다.** 매도·취소 문구가 목업과 정본에서 서로 달랐다 — 같은 문장이 WinForms 창과 웹에 동시에 뜨므로 정본이 이긴다.
- **LED 색 토큰이 라이트/다크 둘 다 있고, §2.2b 밴드 정본은 한 글자도 안 바뀌었다.**

## 채택안 (Task 1 — 목업 게이트는 **계획 단계에서 통과**)

2026-09-18 사용자 검토 완료. 답: *"A칩으로 하고 래치 OFF 면 대기, 래치 ON이면 감시로 문구를 변경해줘"* (커밋 `7a2e99d` — `docs(17): 상따 래치 LED 목업 검토 반영`). 실행 중 다시 묻지 않는다(D-22).

- **변형: A 칩** — LED 도트 + 이름(`매수`/`매도`/`취소`) + 상태 라벨을 테두리 있는 작은 칩(`rounded-full` · `border`)으로. 클릭 가능이면 `cursor-pointer` + hover 시 테두리 진해짐, 클릭 불가는 **점선 테두리**.
- **상태 라벨 문구:** 무장 아님 = `OFF` · 래치 OFF(잠복) = **`대기`** · 래치 ON = **`감시`**. 매수 LED 가 매도잔량 기준이면 `감시` + `<small>(매도잔량 기준)</small>`, 매수 무장 OFF 이고 `hadOrder` 면 `OFF` + `<small>(발주됨)</small>`.
- **색 토큰 4값:** `--led-latent` 라이트 `oklch(0.74 0.17 62)` / 다크 `oklch(0.80 0.16 70)`, `--led-armed` 라이트 `oklch(0.68 0.19 150)` / 다크 `oklch(0.76 0.18 150)`. 회색은 기존 `--flat`(도트 테두리 대체는 `--muted-fg`) · `--muted-fg`(라벨).
- **배치:** 상태줄 안 DMA 칩 다음, 매수·매도·취소 순. 폰 밴드에서 두 줄로 접히는 것을 사용자가 목업에서 확인했다. (배치 결선은 17-11.)
- 목업 파일 `17-latch-led-mockup.html` 은 **수정하지 않았다**(채택안 정본). 이 태스크의 webapp 소스 변경 0건.

## 툴팁 Portal 실측 (계획 ⑤ 의 기록 의무)

`webapp/src/components/ui/tooltip.tsx` 의 `TooltipContent` 는 **`TooltipPrimitive.Portal` 로 감싸여 있다** — Radix Portal 이 맞다. 따라서 상따 본문의 layout containment(§2.2b)에 잘리지 않으므로 `title` 속성으로 낮추지 않고 shadcn Tooltip 을 그대로 쓴다.

다만 그 기본 클래스에 `whitespace-nowrap` 이 있어 긴 한국어 원문(최장 76자)이 `max-w-xs` 안에서 한 줄로 삐져나간다. `className="max-w-xs whitespace-normal"` 로 덮었다(`cn`/tailwind-merge 가 충돌을 해소). T-17-26 의 조건은 「잘린 상태로 남기지 않음」이고 그것을 만족한다.

## Task Commits

1. **Task 1: 목업 채택안 확인 · SUMMARY 기록** — 소스 변경 0건. 산출물이 이 SUMMARY 자체라 **아래 metadata 커밋이 이 태스크의 커밋**이다.
2. **Task 2: LED 색 토큰 라이트/다크** — `ff025c8` (feat)
3. **Task 3 (TDD): 판정 함수 + 칩 컴포넌트 + 규칙 표**
   - RED — `6693edb` (test)
   - GREEN — `2f8b8a9` (feat)
   - REFACTOR — 없음 (구현이 이미 최소이고 분기 중복이 없다)

**Plan metadata:** 이 SUMMARY 커밋.

`commits: 3` 은 서술이 아니라 `git rev-list --count 7839b613..HEAD` 로 **측정**한 값이다(SUMMARY 커밋 직전 기준).

## Files Created/Modified

- `webapp/src/components/trading/latch-led.tsx` (신규 251줄) — `latchLedStateOf` 순수 판정 · `LatchLed` 칩 컴포넌트 · `LATCH_LED_NAMES` · C# 원문 툴팁 7종
- `webapp/src/components/trading/__tests__/latch-led.test.tsx` (신규 365줄) — 19케이스(매도 3 · 취소 4 · 매수 5 · 툴팁 리터럴 1 · 접근성 3 · 클릭 2 · 전략 없음 1)
- `webapp/src/styles/globals.css` (+16줄) — `:root` / `.dark` 에 `--led-latent`·`--led-armed` + 의미·재사용 경고 주석

## Decisions Made

1. **매도·취소 툴팁은 C# 정본 원문이다.** 목업의 sell/cancel 문구(「다음 호가부터 잔량 항 판정」·「비교가격 쌓임을 다시 관측해야」 등)는 계획 단계에서 매수판을 본떠 지은 근사치였다. 실제 `LimitChaserForm.cs` 는 매도 `(다음 호가부터 매도 판정)` / `(다시 잠복 — 벽을 다시 관측해야 판정 시작)`, 취소 `(다음 호가부터 취소 판정 — 조건이 이미 맞으면 바로 취소된다)` / `(다시 잠복 — 벽을 다시 관측해야 취소 판정 시작)` 이다. 같은 문장이 두 표면에 동시에 뜨므로 정본이 이긴다.
2. **클릭 불가 LED 는 `<span>` 이다.** 계획서 ④는 「비상호작용 요소로 그리거나 `disabled` 를 준다」 둘 다 허용했지만, `disabled` 버튼은 포인터 이벤트를 받지 않아 **매도잔량 기준 매수 LED 의 「왜 안 눌리는지」 툴팁이 영영 뜨지 않는다**. 그 툴팁은 C# 이 그 갈래에만 따로 넣은 문장이라 없애면 안 된다. `<span>` 은 탭 순서 밖이면서 hover 를 받는다.
3. **`server === null` 의 라벨은 `OFF`.** 목업은 `—` 였으나 계획서의 반환 타입이 `label` 을 `"OFF"|"대기"|"감시"` 3종으로 제한했다. C# 도 전략 없음을 무장 OFF 와 **같은 회색 + 빈 툴팁**으로 그린다(`UpdateSellLatchLabel` :4253-4259 주석 — 「서버진실 표시 3함수의 null 계약이 세 벌로 갈리면 한쪽만 조용히 어긋난다」).
4. **`cancelQtyTrackEnabled` 는 판정 함수 본문에서 주석으로도 언급하지 않는다.** 봉인 게이트가 본문 `grep -c` = 0 이라 설명을 그 자리에 쓰면 게이트가 깨진다. 설명은 파일 상단 ⚠️ 블록이 소유하고, 함수 안 주석은 거기를 가리키기만 한다.
5. **RED 커밋에 스켈레톤을 함께 넣었다.** 새 모듈의 테스트를 먼저 커밋하면 RED 가 「모듈을 찾을 수 없음」 로드 실패가 되는데, #3770 은 그것을 INVALID_RED 로 분류한다. 타입·서명만 있고 중립값을 돌려주는 스켈레톤을 두어 **대상 테스트가 계획된 behavior 에 대한 단언으로 실패**하게 했다.
6. **`hadOrder` 를 `LatchLedServer` 에 얹었다.** 와이어 필드가 아니라 화면이 주문 통보(51)로 아는 사실이다 — `strategyBadgesOf(item: RelayLimitChaser & { hadOrder?: boolean })` 가 이미 세운 관례를 그대로 따랐다(두 벌로 갈리지 않게).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 긴 한국어 툴팁이 `whitespace-nowrap` 으로 잘릴 수 있었다**
- **Found during:** Task 3 (툴팁 구현)
- **Issue:** `TooltipContent` 기본 클래스에 `w-fit max-w-xs whitespace-nowrap` 이 함께 있다. 최장 76자 한국어 원문은 `max-w-xs`(320px) 안에서 줄바꿈되지 못하고 삐져나간다. T-17-26 의 수용 조건이 「잘린 상태로 남기지 않음」이라 그대로 두면 위반이다.
- **Fix:** LED 의 `TooltipContent` 에만 `className="max-w-xs whitespace-normal"` 을 넘겨 덮었다. `cn`(tailwind-merge)이 `nowrap` ↔ `normal` 충돌을 해소한다. **공용 `tooltip.tsx` 는 손대지 않았다** — 다른 소비처의 짧은 툴팁 한 줄 표시를 바꾸지 않기 위해서다.
- **Files modified:** `webapp/src/components/trading/latch-led.tsx`
- **Verification:** `pnpm --filter @gh-radar/webapp run build` exit 0 · webapp 885 passed
- **Committed in:** `2f8b8a9`

**2. [Rule 2 - Missing Critical] 클릭 불가 LED 를 `disabled` 버튼으로 두면 툴팁이 사라진다**
- **Found during:** Task 3 (접근성 설계)
- **Issue:** 계획서가 허용한 두 갈래 중 `disabled` 를 고르면, 무장인데 눌리지 않는 유일한 경우(매도잔량 기준 매수)에 대해 C# 이 따로 마련한 설명 툴팁이 뜨지 않는다 — `disabled` 요소는 포인터 이벤트를 받지 않는다. 사용자는 「왜 안 눌리지」를 알 방법이 없어진다.
- **Fix:** 클릭 불가 갈래를 비상호작용 `<span>` 으로 그렸다(탭 순서 밖 + hover 수신). 테스트 ⑥-2 가 「버튼이 아니고 `aria-pressed` 도 없다」를 잠근다.
- **Files modified:** `webapp/src/components/trading/latch-led.tsx`, `__tests__/latch-led.test.tsx`
- **Verification:** ⑥-2 · ⑦-2 green
- **Committed in:** `6693edb`(테스트) · `2f8b8a9`(구현)

### 계획서와의 편차 (버그 아님 — 기록)

**3. [정본 우선] 매도·취소 툴팁을 목업 문구가 아니라 C# 원문으로 이식했다**
- 위 「Decisions Made 1」. 계획 ②는 「17-RESEARCH §2 의 C# 원문을 리터럴로」라 했고 §2 는 매수 3종만 원문을 싣고 매도·취소는 「동형 문구」라고만 적었다. 그래서 `gh-trade/client/Forms/Trading/LimitChaserForm.cs` 를 직접 읽어 4문장을 가져왔다. acceptance 가 요구한 **§2 원문 3종(매수)** 은 그대로 리터럴로 있고 테스트 ⑤ 가 확인한다.

**4. [태스크 형태] Task 1 은 독립 커밋이 없다**
- 산출물이 이 SUMMARY 자체라 커밋할 별도 파일이 없다. webapp 소스 변경 0건이라는 acceptance 는 `git diff --stat` 로 확인됐고, verify(`grep -c "A 칩"` · `grep -c "대기"`)는 이 파일이 쓰인 **뒤에** 실행해 아래 Self-Check 에 기록했다.

**5. [범위] 상따 화면에 아직 붙이지 않았다 (계획대로)**
- `limit-chaser-client.tsx` 상태줄 결선과 `lc.arm` 클릭 전송은 **17-11**, relay 의 `lc.arm` 요청 경로는 **17-04** 다. 이 plan 은 컴포넌트·토큰까지이며 그 두 파일을 한 줄도 건드리지 않았다.

**6. [범위] `strategy-badge.tsx` diff 0줄 (D-23)**
- `grep -cE "cancelEntryLatched|buyEntryLatched|LatchLed|latchLedStateOf" webapp/src/components/trading/strategy-badge.tsx` = **0**. 래치 3종의 표면은 LED 이고 배지에 섞지 않았다.

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing-critical) + 4 범위·정본 기록
**Impact on plan:** 범위를 넓히지 않았다. 두 auto-fix 는 계획서가 명시한 수용 조건(T-17-26 「잘린 툴팁을 남기지 않는다」 · 매도잔량 기준 툴팁)을 실제로 성립시키기 위한 것이다.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 3 | ✓ `6693edb` | ✓ `2f8b8a9` | — (변경 없음) | Pass |

**RED 증거 (#3770 실질 요건)**

| 항목 | 값 |
|---|---|
| command | `npx vitest --run src/components/trading/__tests__/latch-led.test.tsx` (cwd `webapp/`) |
| exit | `1` |
| 발견 테스트 | **19** (0건 발견 아님 — 모듈은 정상 로드됐다) |
| 집계 | **14 실패 / 5 통과** |
| 실패 형태 | **단언 실패 10** (`AssertionError: expected { tone: 'off', … } to deeply equal { tone: 'latent', … }` 등) + **렌더 미구현 4** (`LED 를 찾지 못했다: buy` — 컴포넌트가 `null` 을 돌려주던 단계) |
| 대표 대상 테스트 | `④-2 ★Pitfall 4 — buyWatchSide "0" ∧ buyEntryLatched=true → 초록이되 클릭 불가` · `③-2 cancelQtyEnabled ∧ !cancelEntryLatched → 주황 대기` · `⑤ 툴팁 원문 3종이 파일 안에 리터럴로 있다` |

**의도된 RED 단계 통과 5건** — `①`(전략 없음) · `②-1`(매도 무장 OFF) · `③-1`(★Pitfall 5 회색) · `③-4`(본문 grep 봉인) · `④-3`(side "0" 래치 무관). 이들은 새 동작이 아니라 **깨지지 말아야 할 성질**을 굳히는 회귀 그물이고, 중립 스켈레톤이 마침 만족시킨 갈래다. 과장하지 않고 그대로 적는다 — 이 5건은 RED 가 증명한 것이 아니라 GREEN 이후에도 계속 참이어야 하는 불변식이다.

**⚠ `gsd_run check tdd-red-evidence` 는 이 저장소에서 구조적으로 쓸 수 없다** (17-01·17-02 가 보고한 도구 갭 그대로). `parseNodeTestSummary` 가 `node --test` 의 `# tests/# pass/# fail` 푸터로만 집계를 읽는데 vitest 는 그 푸터를 내지 않아 어떤 입력이든 `INVALID_RED (zero_tests_discovered)` 가 된다. 푸터를 손으로 지어내는 것은 게이트가 검사하려던 증거의 위조라 하지 않았고, 대신 위 표로 실질 증거를 남긴다.

## Verification

| 게이트 | 결과 |
|---|---|
| `npx vitest --run …/latch-led.test.tsx` | **19 passed / 19** (exit 0) |
| `pnpm --filter @gh-radar/webapp run test` | **885 passed · 1 skipped / 71 파일** (baseline 866 / 70 → **+19 / +1**) |
| `pnpm --filter @gh-radar/relay run test` | **419 passed / 17 파일** (baseline 동일 — 회귀 0) |
| `pnpm typecheck` (루트 전 워크스페이스) | exit 0 · `error TS` 0건 |
| `pnpm --filter @gh-radar/webapp run build` | exit 0 · `✓ Compiled successfully` · `Failed to compile` 0건 |
| `grep -c -- '--led-latent' / '--led-armed'` | 각 **3** (`:root` · `.dark` · 주석) — 요구치 2 이상 |
| §2.2b 밴드 경계 | `700px`/`830px`/`992px` 4줄 **내용 diff 0** |
| `strategy-badge.tsx` 래치 심볼 | **0건** (D-23) |
| `latchLedStateOf` 본문 `cancelQtyTrackEnabled` | **0건** (T-17-24) |

게이트 전에 `pnpm --filter @gh-radar/shared build` 를 먼저 돌려 낡은 `dist` 함정(16-41 발견)을 회피했다.

## Issues Encountered

- **③-4 봉인 게이트가 GREEN 첫 실행에서 실패했다.** 취소 분기 주석에 `cancelQtyTrackEnabled` 를 설명으로 적었는데, 게이트는 「본문에 그 이름이 없을 것」이라 주석도 걸린다. 주석을 파일 상단 ⚠️ 블록으로 옮기고 함수 안에서는 그쪽을 가리키게 고쳤다 — 게이트를 느슨하게 만들지 않고 설명을 옮긴 쪽을 택했다. 수정 후 19/19 green.
- 그 밖의 문제 없음. baseline(relay 419 · webapp 866 · shared 108) 대비 회귀 0.

## Known Stubs

없음 — 가짜 데이터나 하드코딩된 빈 값이 없다. `latchLedStateOf` 가 읽는 값은 전부 서버 에코 스냅샷의 실제 필드다.

**다만 이 컴포넌트는 아직 어느 화면에도 마운트돼 있지 않다.** 이것은 stub 이 아니라 계획된 범위 분할이다(D-22 · 계획 `<objective>`): 상따 상태줄 결선과 `lc.arm` 전송은 **17-11**, relay 요청 경로는 **17-04**. 사용자가 이 LED 를 실제로 보는 것은 17-11 이후다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **17-11(상따 화면 결선)이 쓸 것이 전부 준비됐다.** `<LatchLed kind="buy|sell|cancel" server={lc} onArm={…} />` 3개를 상태줄 DMA 칩 다음에 매수·매도·취소 순으로 놓고, `onArm` 을 `{t:"lc.arm", key, latch:kind}` 전송에 이으면 된다. 기존 매수/매도 도트 세그먼트는 LED 가 대체한다.
- **17-11 이 반드시 할 것 2가지.** ① `hadOrder` 를 상따 화면이 이미 알고 있는 주문 통보 이력에서 넘겨줘야 「(발주됨)」 문구가 산다 — 안 넘기면 그냥 `OFF` 로 보인다. ② **D-22 가 약속한 dev 서버 스크린샷 확인**(폰 밴드 2줄 접힘 포함)은 화면에 붙은 뒤라야 가능하므로 17-11 의 몫이다.
- **`onArm` 이 도달할 relay 경로(`lc.arm`)는 17-04 가 만든다.** 17-11 이 17-04 보다 먼저 실행되면 클릭이 조용히 드롭된다 — 의존 순서를 지킬 것.
- 블로커 없음.

---
*Phase: 17-gh-trade-led*
*Completed: 2026-09-18*

## Self-Check: PASSED

- 생성 파일 3개 전부 디스크에 존재 (`latch-led.tsx` · `__tests__/latch-led.test.tsx` · 이 SUMMARY)
- 커밋 3개 전부 git 에 존재: `ff025c8`(feat 토큰) · `6693edb`(test RED) · `2f8b8a9`(feat GREEN)
- Task 1 verify 재실행(SUMMARY 작성 후): `grep -c "A 칩"` = **7** · `grep -c "대기"` = **7** — 둘 다 0 아님 → PASS
- 플랜 `<verification>` 3항 전부 green (위 Verification 표)
