---
phase: quick-261010-jix
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — 트레이서: WR-R3-01 늦은 relay 거부 창을 시간으로 묶음 + IN-R3-01 계약 주석
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/lib/__tests__/limit-chaser.test.ts
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
  # Task 2 — WR-R3-02 대기 중 41 을 「더는 의미 없음」 수평선에서 끝냄 + IN-R3-02 런타임 에코 음성 고정
  #   (strategy-card.tsx · strategy-card-flow.test.tsx — Task 1 과 같은 파일, 순차)
  # Task 3 — 처분 기록
  - .planning/phases/27-auto-sell-integration/27-REVIEW-R3-DISPOSITION.md
autonomous: true
requirements: [JIX-WR-R3-01, JIX-WR-R3-02, JIX-IN-R3-01, JIX-IN-R3-02]

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "41 무응답 타이머가 발화한 뒤 LC_ORPHAN_WAIT_MS 가 지나서 온 relay 거부(src Relay · i 빈 · a 빈 · kind 'autosell.cmd')는 이 카드의 전략 로그 · 상태줄(card-server-error)에 서지 않고 「미반영」도 거두지 않는다 (WR-R3-01)"
    - "같은 상황에서 태그 이전 relay 의 kind '' 거부도 그리지 않고 「미반영」을 유지한다 (WR-R3-01 · 옛 relay 폴백)"
    - "키를 싣는 41 거부(AutoSellCommand · Account, i · a 일치)는 늦은 창 내내(relay 수평선이 지난 뒤에도) 「미반영」을 거두고 원문을 상태줄에 세운다. 공용 unacked · answerSeq 는 건드리지 않는다 (WR-01 유지)"
    - "타이머 발화 직후(수평선 안) 온 relay 41 거부는 종전대로 원문 줄 · 상태줄 · 「미반영」 해제 — 기존 「WR-R2-01 — 3초 뒤 늦은 relay 41 거부」 테스트가 그대로 통과한다"
    - "바로시작을 보내고 3초 대기 중에 전략 삭제(server null)가 오면 대기가 끝나고(autoSellPending null), 3초가 지나도 「미반영」 · 「자동매도 바로시작 — 서버 응답 없음」 로그 줄이 서지 않는다 (WR-R3-02)"
    - "바로시작 대기 중에 자동매도 켜짐 → 꺼짐 에코가 오면 같은 결과다. 대기 중 stop 은 settleAutoSell 이 같은 커밋에서 먼저 풀어 그대로다 (WR-R3-02)"
    - "무응답 뒤 켜진 채인 런타임 에코(autoSellSoldQty 만 다름)로는 「미반영」이 거둬지지 않는다 (IN-R3-02 · WR-03 음성 규칙)"
    - "41 「미반영」을 내리는 곳은 여전히 clearAutoSellUnacked 하나이고(setAutoSellUnacked(false) 1곳 · setAutoSellUnacked(true) 1곳), 카드는 src 를 직접 비교하지 않는다"
    - "isAutoSellCommandRejection 계약 주석이 「대기 창 또는 무응답 뒤 결과 모름 수평선 안에서만 묻는다 · relay 출처는 시간으로 묶는다」를 말한다 (IN-R3-01)"
  artifacts:
    - path: "webapp/src/lib/limit-chaser.ts"
      provides: "isKeyedAutoSellRejection(msg) — 키를 싣는 41 거부 출처 판정 · isAutoSellCommandRejection 계약 주석 갱신"
      contains: "export function isKeyedAutoSellRejection"
    - path: "webapp/src/components/trading/card/strategy-card.tsx"
      provides: "autoSellLateRelayUntilRef(늦은 relay 거부 수평선) · 삭제 갈래 / 켜짐 → 꺼짐 전이의 대기 중 41 종료"
      contains: "autoSellLateRelayUntilRef"
    - path: "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx"
      provides: "WR-R3-01 ×2 · WR-R3-02 ×2 · IN-R3-02 ×1 회귀 테스트"
      contains: "WR-R3-02"
    - path: ".planning/phases/27-auto-sell-integration/27-REVIEW-R3-DISPOSITION.md"
      provides: "4건 fixed · open 0"
      contains: "open: 0"
  key_links:
    - from: "strategy-card.tsx onAutoSellCommand 41 타이머 콜백"
      to: "54 이펙트 lateAutoSellAnswer"
      via: "autoSellLateRelayUntilRef = Date.now() + LC_ORPHAN_WAIT_MS (세움) → isKeyedAutoSellRejection(msg) || Date.now() <= 수평선 (읽음)"
      pattern: "autoSellLateRelayUntilRef"
    - from: "strategy-card.tsx clearAutoSellUnacked"
      to: "autoSellLateRelayUntilRef"
      via: "단일 해제 지점에서 근거 ref · 수평선 · 표시 state 를 함께 내림"
      pattern: "autoSellLateRelayUntilRef.current = 0"
    - from: "strategy-card.tsx 삭제 갈래 · 켜짐 → 꺼짐 전이"
      to: "setAutoSellCmd(null) (41 타이머 clearTimeout)"
      via: "키 변경 리셋과 같은 짝 — setAutoSellCmd(null) + clearAutoSellUnacked()"
      pattern: "setAutoSellCmd\\(null\\)"
---

<objective>
Phase 27 3라운드 리뷰(27-REVIEW-R3.md)의 지적 4건을 닫는다. 대상은 Warning 2건, Info 2건이다.

1. WR-R3-01 — 3초 무응답 뒤 늦은 41 거부를 받는 창에 기한을 둔다. 키를 싣는 출처(AutoSellCommand · Account, i · a 일치)는 늦은 창 내내 받는다. 키가 없는 relay 거부(i "")는 무응답 뒤 `LC_ORPHAN_WAIT_MS` 안에서만 받는다. 송신부터 재면 `ACK_TIMEOUT_MS + LC_ORPHAN_WAIT_MS`이고, lc.set 결과 모름 수평선과 같은 모양이다. 이렇게 해서 다른 카드의 relay 거부가 이 카드에 빨갛게 서는 카드 간 표시 오염(WR-04 재발)을 막는다.
2. WR-R3-02 — 「41 이 더는 의미 없음」 수평선 두 곳(전략 삭제 · 자동매도 켜짐 → 꺼짐 전이)에서 **대기 중** 41 도 끝낸다. 그래야 살아 있는 3초 타이머가 뒤늦게 「미반영」을 다시 세우지 않는다.
3. IN-R3-01 — `isAutoSellCommandRejection` 계약 주석을 「대기 창 또는 무응답 뒤 결과 모름 수평선 안에서만 묻는다(relay 출처는 시간으로 묶음)」로 고친다.
4. IN-R3-02 — 무응답 뒤 켜진 채인 런타임 에코가 「미반영」을 거두지 않는다는 음성 테스트와, WR-R3-02 대기 중 경로 테스트 2건을 더한다.

Purpose: 2라운드 수정이 해제 조건을 「타이머가 이미 발화한 상태」 하나에만 붙여서 생긴 두 구멍을 막는다. 늦은 창의 **끝**과 대기 중 41의 **종료**가 그것이다. 리뷰가 확인한 불변식은 그대로 지킨다: WR-03 음성 규칙, WR-01(늦은 경로에서 `acceptAnswer` 미호출), `clearAutoSellUnacked` 단일 해제 지점.
Output: lib 판정 함수 1개와 계약 주석, 카드 훅 수정, 단위 테스트 1건, 흐름 테스트 5건, 처분 기록. 커밋은 경로를 명시해 만든다. push · 배포는 없다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/phases/27-auto-sell-integration/27-REVIEW-R3.md
@.planning/phases/27-auto-sell-integration/27-REVIEW-R3-DISPOSITION.md

<interfaces>
<!-- 플래너가 현재 코드(HEAD 29ede845)와 대조해 확인한 값이다. 리뷰 행 번호는 5bd05af1 이후 이 세 파일에 커밋이 없어 그대로 맞는다. -->

webapp/src/components/trading/card/strategy-card.tsx (`useStrategyCardState`):
- 102행 `import { LC_ORPHAN_WAIT_MS } from "@/components/trading/lc/use-lc-field-commit";` — 이미 import 돼 있다(값 7_000).
- 122-130행 `@/lib/limit-chaser` import 블록: `autoSellButtonsOf, isAutoSellCommandRejection, isAutoSellCommandSettled, …` — 새 판정 함수를 여기에 더한다.
- 138행 `ACK_TIMEOUT_MS`(3_000, `./constants`).
- 366-370 · 470-477행 — lc.set 결과 모름 수평선의 선례다. `pendingExpiryTimer`를 `window.setTimeout(…, ACK_TIMEOUT_MS + LC_ORPHAN_WAIT_MS)`로 건다.
- 417행 `autoSellCmdRef` · 428행 `autoSellTimedOutRef` · 430행 `autoSellCmdTimer`.
- 432-437행 `setAutoSellCmd(action | null)` — 41 타이머 clearTimeout과 ref · state를 함께 바꾼다.
- 444-447행 `clearAutoSellUnacked` — 41 「미반영」 **유일** 해제 지점이다(`autoSellTimedOutRef.current = null` + `setAutoSellUnacked(false)`).
- 499-511행 키 변경 리셋 — 이미 `setAutoSellCmd(null)` + `clearAutoSellUnacked()` 짝을 부른다(WR-R3-02가 따를 모양).
- 551-559행 `settleAutoSell` · 560-564행 `lastLimitChaserEcho` settle 이펙트 · 573-576행 `server` settle 이펙트. **셋 다 578행 전이 이펙트보다 먼저 선언돼 있다.** 그래서 같은 커밋에서 먼저 돈다.
- 582-595행 삭제 갈래(`server === null` ∧ `prev !== null`) — 589행 `clearAutoSellUnacked()`만 부른다.
- 600-610행 켜짐 → 꺼짐 전이 — `if (prev !== null && prev.autoSellEnabled && !server.autoSellEnabled) clearAutoSellUnacked();`
- 721-722행 `autoSellAnswer`(대기 창) · 729-733행 `lateAutoSellAnswer`(늦은 창) · 745-750행 `autoSellReply` 처리(`acceptAnswer` 미호출 — WR-01).
- 765-767행 주석: 「여기서 `src` 를 직접 비교하지 않는 이유는 이 파일의 다른 판정들과 같다」 — 카드는 src를 직접 비교하지 않는다(현재 0건).
- 858-879행 `onAutoSellCommand` — 866-876행 41 타이머 콜백이 `autoSellTimedOutRef.current = action` · `setAutoSellUnacked(true)` · error 로그 「자동매도 {바로시작|중지} — 서버 응답 없음」을 세운다. 콜백이 닫아 쥔 `server`는 송신 시점 값이다(useCallback 의존성).

webapp/src/lib/limit-chaser.ts:
- 769-782행 `isLimitChaserServerMessage` — AutoSellCommand · Account(i 비어 있지 않음)는 표시 몫이다. Relay는 아니다.
- 798-805행 `isServerMessageForStrategy`.
- 955행 `const AUTO_SELL_CMD_ORIGIN = 'autosell.cmd' …` · 957-982행 `isAutoSellCommandRejection` 계약 주석. 고칠 곳은 960-961행 창 전제 문장과 976-977행 「오판 방향은 종전과 같다 — … 일찍 거둬질 뿐」이다.
- 983-997행 `isAutoSellCommandRejection(msg, isin, accountNo)` 본문 — 바꾸지 않는다.
- 1023행 `isAutoSellCommandSettled(action, echo)`: start → `autoSellState === 3 && autoSellEnabled`, stop → `!autoSellEnabled`.

webapp/src/lib/__tests__/limit-chaser.test.ts: 1242 · 1250 · 1261행이 `isAutoSellCommandRejection` 테스트다. 도우미 `m({...})` · `ISIN` · `ACCOUNT`를 쓴다.

webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx:
- 49행 `LC_ORPHAN_WAIT_MS` · 41행 `ACK_TIMEOUT_MS` import가 이미 있다. 101-113행 `msg(over)`의 기본값은 `kind: ''` · `src: 'System'` · `lv: 'INFO'`다.
- 241-251행 `vi.useFakeTimers({ shouldAdvanceTime: true })`. vitest 2.1.9 기본 `toFake`에 `"Date"`가 들어 있다(node_modules vitest/dist/config.js `fakeTimersDefaults`). 그래서 `vi.advanceTimersByTime`이 `Date.now()`도 함께 움직인다.
- 230-231행 `unacked()`(card-unacked) · `serverError()`(card-server-error) · 203행 `logRows()`.
- 1836-2280행 `describe('Phase 27 41 in-flight')`: `texts` · `hasText` · `asCmds` · `press(action)` · `watching` · `REJECT_HOLD` 도우미를 쓴다. WR-R2 테스트는 2151-2279행이고, 새 테스트는 이 describe 끝(2279행 `});` 앞)에 붙인다.
- 부정 단언 전에는 기존 관례대로 `await act(async () => { vi.advanceTimersByTime(N); })`로 microtask 로그 큐를 비운다(2127-2129 · 2212-2214행).

테스트 실행 명령(플래너가 실측함 — vitest 2.1.9):
- `--maxWorkers=2`만 주면 tinypool `RangeError: options.minThreads and options.maxThreads must not conflict`로 **0건 실행**이 된다. 반드시 `--minWorkers=1 --maxWorkers=2`를 함께 준다.
- `cd webapp && npx vitest run src/lib/__tests__/limit-chaser.test.ts src/components/trading/__tests__/strategy-card-flow.test.tsx -t "isAutoSellCommandRejection|WR-R2" --minWorkers=1 --maxWorkers=2`: 10 passed, 2.1초(load 1.8).
- `cd webapp && npx tsc --noEmit -p .` → exit 0(기준선 깨끗함). `cd webapp && npx eslint <파일들>` → exit 0.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (트레이서): 늦은 relay 41 거부를 결과 모름 수평선으로 묶는다 — lib 판정 → 카드 54 이펙트 → 흐름 테스트 (WR-R3-01 · IN-R3-01)</name>
  <files>webapp/src/lib/limit-chaser.ts, webapp/src/lib/__tests__/limit-chaser.test.ts, webapp/src/components/trading/card/strategy-card.tsx, webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx</files>
  <read_first>
    - .planning/phases/27-auto-sell-integration/27-REVIEW-R3.md (WR-R3-01 · IN-R3-01 절)
    - webapp/src/components/trading/card/strategy-card.tsx 413-447행 · 466-477행 · 702-783행 · 858-879행
    - webapp/src/lib/limit-chaser.ts 954-998행
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx 2147-2217행(WR-R2-01 테스트 3건 — 새 테스트의 모양 선례)
  </read_first>
  <behavior>
    - lib: `isKeyedAutoSellRejection({ src: 'AutoSellCommand' })` 참 · `{ src: 'Account' }` 참 · `{ src: 'Relay' }` 거짓(kind와 무관) · `{ src: 'System' }` 거짓
    - 흐름 「WR-R3-01 — 무응답 뒤 relay 수평선이 지난 relay 41 거부(kind autosell.cmd · i · a 빈)는 이 카드에 서지 않는다 · 키를 싣는 거부는 여전히 받는다」: press start → `ACK_TIMEOUT_MS` 진행(「미반영」 섬) → `LC_ORPHAN_WAIT_MS + 1` 진행(await act) → `before = logRows().length` → `msg({ lv:'ERROR', src:'Relay', kind:'autosell.cmd', i:'', a:'', m: RELAY_REJECT })` 도착 → await act 50ms → 로그 줄 수 == before · `serverError()` null · `unacked()`에 「미반영」 · `lastCard.autoSellUnacked` true → 이어서 같은 relay 객체를 그대로 둔 채 앞에 `msg({ lv:'ERROR', src:'AutoSellCommand', i: ISIN, a: ACCOUNT, m: REJECT_HOLD })`를 더한 messages(최신이 앞) 도착 → `serverError()`에 REJECT_HOLD · `unacked()` null · `lastCard.autoSellUnacked` false · `lastCard.unacked` false(WR-01) · `asCmds()` 길이 1
    - 흐름 「WR-R3-01 — 무응답 뒤 relay 수평선이 지난 옛 relay(kind '') 거부도 그리지 않는다」: 같은 진행 뒤 `msg({ lv:'ERROR', src:'Relay', i:'', a:'', m: … })`(kind 기본 '') → 로그 줄 수 불변 · `serverError()` null · 「미반영」 유지
    - 기존 「WR-R2-01 — 3초 뒤 늦은 relay 41 거부(kind autosell.cmd · i 빈)」(발화 직후 = 수평선 안)는 수정 없이 계속 통과한다 — 수평선 안 양성 고정
  </behavior>
  <action>
    RED 먼저: 아래 테스트 3건(lib 1 · 흐름 2)을 쓰고 `<verify>` 명령으로 실패를 확인한다. lib 쪽은 export가 없어서, 흐름 쪽은 수평선이 지난 relay 줄이 지금 그려져서 실패한다. 실패를 확인하면 `test(quick-261010-jix): …` 한글 메시지로 커밋한다. 그다음 GREEN 구현으로 간다.

    (1) webapp/src/lib/limit-chaser.ts — `isAutoSellCommandRejection` 바로 아래에 `export function isKeyedAutoSellRejection(msg: { src: string }): boolean`을 더한다. src가 `'AutoSellCommand'` 또는 `'Account'`일 때만 참이다. 이 결정은 Claude 재량이다. 리뷰 예시는 카드에서 출처를 인라인 비교했다. 하지만 strategy-card.tsx는 src를 직접 비교하지 않는다는 규율을 주석으로 명시하고 있고(765-767행), 지금 직접 비교는 0건이다. 그래서 판정을 lib 한 곳에 둔다. JSDoc에는 다음 세 가지를 한국어로 적는다. 하나, `isAutoSellCommandRejection`이 참인 줄에만 묻는다. 둘, 참이면 i · a 일치로 이 전략에 묶인 거부다(서버 41 실패 · 41 계좌 가드). 이 출처는 이미 카드 표시 몫(`isLimitChaserServerMessage` ∧ `isServerMessageForStrategy`)이라, 늦은 창 내내 받아도 표시가 넓어지지 않고 「미반영」 해제만 더해진다. 셋, 거짓이면 키 없는 relay 거부이고, 상관의 근거가 시간 창뿐이다(27-REVIEW-R3 WR-R3-01). 함수 본문은 한 줄이다. `isAutoSellCommandRejection` 본문은 바꾸지 않는다.

    (2) IN-R3-01 — 같은 파일 `isAutoSellCommandRejection` 계약 주석을 고친다. 960-961행 문장(「호출자가 41 을 보내 놓은 … 창 안에서만 묻는다 — 54 에 거래소가 없어 …」)의 창 전제를 다음 뜻으로 바꾼다: 「호출자는 41 의 결과 모름 수평선 안에서만 묻는다 — 대기 창(3초) 또는 무응답 뒤 늦은 창이다. 늦은 창에서 relay 출처(`isKeyedAutoSellRejection` 거짓)는 키가 없으므로 시간으로 묶는다. 무응답 뒤 `LC_ORPHAN_WAIT_MS`, 송신부터 `ACK_TIMEOUT_MS + LC_ORPHAN_WAIT_MS`로, lc.set 결과 모름 수평선과 같은 모양이다.」 거래소(KRX · NXT)를 창이 가른다는 뒷부분은 그대로 둔다. 976-977행 「오판 방향은 종전과 같다 — … 일찍 거둬질 뿐 …」에는 조건을 붙인다. 이 말은 호출자가 창을 시간으로 묶을 때만 맞다. 묶지 않으면 다른 요청의 relay 거부 원문이 이 카드 로그 · 상태줄에 선다(WR-R3-01). 영어 「in-flight」 표기로 창 전제를 다시 쓰지 말고 「대기 창」 · 「결과 모름 수평선」 어휘를 쓴다.

    (3) webapp/src/components/trading/card/strategy-card.tsx:
      a. `@/lib/limit-chaser` import 블록(122-130행)에 `isKeyedAutoSellRejection`을 알파벳 순서로 더한다.
      b. 428행 `autoSellTimedOutRef` 바로 아래에 `const autoSellLateRelayUntilRef = useRef(0);`을 둔다. JSDoc에는 이렇게 적는다: 늦은 41 거부 중 relay 출처를 받는 마감 시각(epoch ms)이고, 0이면 닫힘이다. 세우는 곳은 41 타이머 콜백 하나, 내리는 곳은 `clearAutoSellUnacked` 하나다(WR-R3-01). Date.now 마감을 고른 이유도 적는다. 이 값은 54가 올 때만 읽는다. 그래서 lc.set 수평선(`pendingExpiryTimer`)처럼 타이머를 따로 걸 필요가 없고, 언마운트 · 키 변경 정리 대상도 늘지 않는다. 수평선 길이는 그 타이머와 같다.
      c. `clearAutoSellUnacked`(444-447행) 안에 `autoSellLateRelayUntilRef.current = 0;`을 더한다. 근거 ref · 수평선 · 표시 state를 한 곳에서 함께 내린다. 단일 해제 지점 불변식을 지키는 것이다. 438-443행 JSDoc에 「relay 수평선도 함께 닫는다」를 한 구절 더한다.
      d. 41 타이머 콜백(866-876행)에서 `autoSellTimedOutRef.current = action;` 다음 줄에 `autoSellLateRelayUntilRef.current = Date.now() + LC_ORPHAN_WAIT_MS;`을 둔다. 한 줄 주석으로 「relay 거부는 키가 없어 시간 창만 상관의 근거다 — 송신부터 ACK_TIMEOUT_MS + LC_ORPHAN_WAIT_MS(lc.set 결과 모름 수평선과 같은 모양)」를 단다.
      e. 54 이펙트의 `lateAutoSellAnswer`(729-732행)에 마지막 논리곱 `(isKeyedAutoSellRejection(msg) || Date.now() <= autoSellLateRelayUntilRef.current)`을 더한다. 대기 창 `autoSellAnswer`(721-722행)는 바꾸지 않는다. 그 위 주석 블록(723-728행)에도 덧붙인다. 키를 싣는 출처는 늦은 창 내내 받는다. relay 출처는 무응답 뒤 `LC_ORPHAN_WAIT_MS` 안에서만 받는다. 기한이 없으면 같은 탭 다른 카드의 relay 조립 · 송신 실패(i · a 빈), 그리고 옛 relay의 kind "" 폴백에서는 lc.set · lc.arm 등 모든 relay 거부가 이 카드 로그 · 상태줄에 빨갛게 선다(WR-04 카드 간 표시 격리 재발 — 27-REVIEW-R3 WR-R3-01). 745-750행 `autoSellReply` 처리는 그대로 둔다. 늦은 경로에서도 `acceptAnswer`를 부르지 않는다(WR-01).
      f. 파일 머리 ⑥ 주석(71-74행)의 늦은 거부 구절에 「relay 출처는 무응답 뒤 `LC_ORPHAN_WAIT_MS` 안에서만 — WR-R3-01」을 덧붙인다. 421-427행 `autoSellTimedOutRef` JSDoc의 늦은 거부 구절에도 같은 뜻을 짧게 단다. 주석은 기존 한국어 문체(★ · 괄호 출처 ID)와 밀도에 맞춘다.
      g. 카드에서 src를 직접 비교하는 식을 새로 만들지 않는다. 출처 구분은 (1)의 lib 판정으로만 한다.

    (4) 테스트:
      - webapp/src/lib/__tests__/limit-chaser.test.ts — import 목록에 `isKeyedAutoSellRejection`을 더한다. 1261행 블록 뒤에 `it('isKeyedAutoSellRejection — AutoSellCommand · Account 참 · Relay(kind 무관) · 그 밖 거짓 (WR-R3-01)', …)`을 둔다. 기존 `m({...})` 도우미를 쓴다.
      - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx — `describe('Phase 27 41 in-flight')` 끝에 주석 블록 하나(27-REVIEW-R3 WR-R3-01 요지 2줄)와 `it('WR-R3-01 — …')` 2건을 `<behavior>`대로 붙인다. 진행 뒤 `before`를 재기 전에는 `await act(async () => { vi.advanceTimersByTime(LC_ORPHAN_WAIT_MS + 1); })`로 비운다. 두 번째 messages 배열에는 첫 relay 객체를 **같은 참조**로 다시 넣는다(`[keyed, relayLate]`). 그래야 lastMsgRef 상관이 relay 줄을 다시 읽지 않는다. 기존 테스트는 고치지 않는다.

    GREEN을 확인하면 `fix(quick-261010-jix): …` 한글 메시지로 커밋한다. 커밋 규칙(RED · GREEN 공통)은 다음과 같다. 경로를 명시해 `git add`한다. `git add -A`와 `git add .`은 금지다. 다른 세션의 tasks/lessons.md · webapp/e2e/fixtures/relay.ts와 미추적 .planning 파일이 working tree에 있다. 커밋 직전에 `git status -sb`로 내 경로만 staged인지 다시 확인한다. Co-Authored-By 줄은 넣지 않는다(사용자 전역 규칙). push하지 않는다.
  </action>
  <verify>
    <automated>cd webapp && npx vitest run src/lib/__tests__/limit-chaser.test.ts src/components/trading/__tests__/strategy-card-flow.test.tsx -t "isKeyedAutoSellRejection|isAutoSellCommandRejection|WR-01|WR-R2|WR-R3" --minWorkers=1 --maxWorkers=2 && npx tsc --noEmit -p .</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export function isKeyedAutoSellRejection" webapp/src/lib/limit-chaser.ts` >= 1
    - `grep -c "autoSellLateRelayUntilRef" webapp/src/components/trading/card/strategy-card.tsx` >= 4 (선언 · 세움 · 읽음 · 내림)
    - `grep -A5 "const clearAutoSellUnacked = useCallback" webapp/src/components/trading/card/strategy-card.tsx | grep -c "autoSellLateRelayUntilRef"` >= 1 (수평선을 단일 해제 지점 안에서 내린다)
    - `grep -n "setAutoSellUnacked(false)" webapp/src/components/trading/card/strategy-card.tsx` 출력이 한 줄이고 그 줄이 `clearAutoSellUnacked` 본문 안이다. `grep -n "setAutoSellUnacked(true)"` 출력도 한 줄이고 41 타이머 콜백 안이다(단일 해제 · 단일 세움 지점 유지).
    - `grep -cE 'msg\.src (===|!==)' webapp/src/components/trading/card/strategy-card.tsx` == 0
    - `sed -n '/^const AUTO_SELL_CMD_ORIGIN/,/^export function isAutoSellCommandRejection/p' webapp/src/lib/limit-chaser.ts | grep -c "isKeyedAutoSellRejection"` >= 1 (계약 주석이 relay 시간 묶음을 말한다)
    - `sed -n '/^const AUTO_SELL_CMD_ORIGIN/,/^export function isAutoSellCommandRejection/p' webapp/src/lib/limit-chaser.ts | grep -c "in-flight 창 안에서만"` == 0
    - 흐름 테스트 `WR-R3-01` 2건과 기존 `WR-R2-01` 3건이 모두 통과한다.
  </acceptance_criteria>
  <done>수평선이 지난 relay 41 거부(kind autosell.cmd · '')는 이 카드에 서지 않고 「미반영」도 남는다. 키를 싣는 41 거부는 늦은 창 내내 「미반영」을 거두고 원문을 세운다. 수평선 안의 relay 거부는 종전대로 받는다. lib 계약 주석이 새 전제를 말한다. test · fix 커밋 2개.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 「41 이 더는 의미 없음」 수평선에서 대기 중 41 도 끝낸다 + 켜진 채 런타임 에코 음성 고정 (WR-R3-02 · IN-R3-02)</name>
  <files>webapp/src/components/trading/card/strategy-card.tsx, webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx</files>
  <read_first>
    - .planning/phases/27-auto-sell-integration/27-REVIEW-R3.md (WR-R3-02 · IN-R3-02 절과 「참고」 문단)
    - webapp/src/components/trading/card/strategy-card.tsx 497-512행(키 변경 리셋 — 따를 짝) · 543-611행 · 858-879행 (Task 1 뒤 행 번호는 몇 줄 밀린다 — 심볼로 찾는다)
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx 2219-2279행(WR-R2-02 테스트 3건)
  </read_first>
  <behavior>
    - 「WR-R3-02 — 바로시작 대기 3초 안에 전략 삭제(server null)가 오면 41 타이머도 끝난다 — 뒤늦은 「미반영」 · 「서버 응답 없음」 없음」: `setRelay({ limitChasers: [watching] })` → press start → `vi.advanceTimersByTime(1_000)` → 철거 에코 `echo({ ...watching, crud: 'D' })`(`limitChasers: []` · `lastLimitChaserEcho: del`) → `lastCard.server` null · `lastCard.autoSellPending` null → `await act(async () => { vi.advanceTimersByTime(ACK_TIMEOUT_MS + 1_000); })` → `unacked()` null · `lastCard.autoSellUnacked` false · `hasText('자동매도 바로시작 — 서버 응답 없음')` false · `asCmds()` 길이 1
    - 「WR-R3-02 — 바로시작 대기 3초 안에 자동매도 켜짐 → 꺼짐 에코가 오면 41 대기가 끝난다」: press start → 1_000 → `echo({ ...watching, autoSellEnabled: false })` → `autoSellPending` null → 같은 진행 → 같은 단언
    - 「IN-R3-02 — 무응답 뒤 켜진 채인 런타임 에코(autoSellSoldQty 만)는 「미반영」을 거두지 않는다(WR-03)」: press start → `ACK_TIMEOUT_MS` → 「미반영」 → `echo({ ...watching, autoSellSoldQty: 10 })`(limitChasers와 lastLimitChaserEcho 둘 다) → `unacked()`에 「미반영」 · `lastCard.autoSellUnacked` true. 지금 코드에서도 초록인 회귀 고정이다. RED 단계에서 이 1건만 통과하는 것은 정상이다.
    - 기존 「stop 의 기대 전이 = !enabled」 · WR-R2-02 3건 · WR-03은 그대로 통과한다
  </behavior>
  <action>
    RED 먼저: `<behavior>`의 테스트 3건을 `describe('Phase 27 41 in-flight')` 끝(Task 1 테스트 뒤)에 붙인다. 앞에 27-REVIEW-R3 WR-R3-02 · IN-R3-02 요지를 담은 주석 블록을 단다. 실행해서 WR-R3-02 2건이 실패하는지 확인한다(3초에 타이머가 「미반영」을 세운다). IN-R3-02 1건은 통과해야 한다. 확인하면 `test(quick-261010-jix): …`로 커밋한다.

    GREEN — webapp/src/components/trading/card/strategy-card.tsx:
      (1) 삭제 갈래(지금 582-595행, `server === null` ∧ `prev !== null`) — `clearAutoSellUnacked()` 앞에 `setAutoSellCmd(null)`을 부른다. 키 변경 리셋(506-507행)과 같은 짝이다. 588행 주석을 고쳐 이유를 적는다. 대기 중 41이 있으면 타이머까지 끈다. 안 끄면 3초 뒤 타이머가 지운 전략의 빈 카드에 「미반영」을 다시 세운다. 이 갈래는 `prev !== null`일 때만 돌아서 다시 거두지 못한다(WR-R3-02).
      (2) 켜짐 → 꺼짐 전이(지금 610행 한 줄 if) — 블록으로 바꾼다. 안에서 `autoSellCmdRef.current === "start"`이면 `setAutoSellCmd(null)`을 부르고, 이어서 `clearAutoSellUnacked()`를 부른다. stop을 조건에서 빼는 근거는 플래너가 코드로 확인했다. settle 이펙트 둘(`lastLimitChaserEcho` 560-564행 · `server` 573-576행)이 이 이펙트보다 먼저 선언돼 같은 커밋에서 먼저 돈다. 그리고 `isAutoSellCommandSettled('stop', echo)`는 `!echo.autoSellEnabled`라서 켜짐 → 꺼짐 에코에서 이미 참이다. 그래서 여기에 남을 수 있는 대기는 start뿐이다. start의 기대 전이(상태 3 ∧ enabled)는 이제 오지 않는다. 이 근거를 블록 안 한 줄 주석으로 남긴다.
      (3) 600-609행 주석 블록에 「대기 중 start 의 41 도 여기서 끝낸다(WR-R3-02)」를 더한다. 608행 「아래 런타임 전용 조기 반환보다 먼저」는 리뷰 「참고」대로 정확하게 고친다. `autoSellEnabled`는 `RUNTIME_ONLY_SKIP` 밖이라 켜짐 → 꺼짐 에코는 런타임 전용으로 판정되지 않는다. 그래도 이 판정이 그 집합 구성에 기대지 않도록 순서를 앞에 둔다. 동작 변경 없이 문구만 고친다.
      (4) 파일 머리 ⑥ 주석의 「41 이 더는 의미 없어질 때(전략 삭제 · 자동매도 켜짐 → 꺼짐 전이 — WR-R2-02)」 구절에 「대기 중이면 41 대기 · 타이머도 함께 끝낸다 — WR-R3-02」를 덧붙인다. `clearAutoSellUnacked` JSDoc의 「41 이 더는 의미 없다」 목록에도 같은 뜻을 한 구절 단다. 이 함수는 표시와 근거만 내리고, 대기 종료는 호출자가 `setAutoSellCmd(null)`로 짝지어 부른다.
      (5) 41 타이머 콜백(onAutoSellCommand)은 바꾸지 않는다. 콜백 안에서 `server`를 확인하는 방식은 쓰지 않는다. 콜백이 닫아 쥔 `server`는 송신 시점 값이라 그 사이의 삭제를 볼 수 없다. 수평선 쪽에서 타이머를 끄는 리뷰 방식이 맞다.
      (6) `clearAutoSellUnacked`가 단일 해제 지점이라는 점, WR-03(꺼진 채인 에코 · 켜진 채인 런타임 에코로는 거두지 않음), WR-01은 건드리지 않는다.

    GREEN을 확인하면 `fix(quick-261010-jix): …`로 커밋한다. 커밋 규칙은 Task 1과 같다: 경로 명시, `git status -sb` 재확인, Co-Authored-By 없음, push 없음.
  </action>
  <verify>
    <automated>cd webapp && npx vitest run src/components/trading/__tests__/strategy-card-flow.test.tsx -t "WR-0|WR-R2|WR-R3|IN-R3|기대 전이" --minWorkers=1 --maxWorkers=2 && npx tsc --noEmit -p .</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "setAutoSellCmd(null)" webapp/src/components/trading/card/strategy-card.tsx` 출력에 삭제 갈래 줄과 켜짐 → 꺼짐 전이 블록 줄이 새로 들어 있다. 기준선은 3줄(키 변경 리셋 · settleAutoSell · 대기 중 거부)이고, 수정 뒤에는 5줄이다.
    - `grep -c 'autoSellCmdRef.current === "start"' webapp/src/components/trading/card/strategy-card.tsx` >= 1 (기준선 0)
    - `grep -n "setAutoSellUnacked(false)"` · `grep -n "setAutoSellUnacked(true)"`(strategy-card.tsx)가 여전히 각 한 줄이다. 단일 해제 · 단일 세움 지점이 유지된다.
    - `grep -c "it('WR-R3-02" webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx` >= 2 · `grep -c "it('IN-R3-02" webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx` >= 1
    - 필터 실행에서 새 3건과 기존 WR-R2-02 3건 · WR-03 · 「stop 의 기대 전이」가 모두 통과한다.
  </acceptance_criteria>
  <done>대기 3초 안에 삭제가 오거나 켜짐 → 꺼짐 전이가 와도 41 타이머가 꺼진다. 뒤늦은 「미반영」과 「서버 응답 없음」 줄이 서지 않는다. 켜진 채인 런타임 에코로 「미반영」이 거둬지지 않는다는 음성 단언이 고정된다. test · fix 커밋 2개.</done>
</task>

<task type="auto">
  <name>Task 3: 회귀 확인 + 3라운드 처분 기록 갱신</name>
  <files>.planning/phases/27-auto-sell-integration/27-REVIEW-R3-DISPOSITION.md</files>
  <read_first>
    - .planning/phases/27-auto-sell-integration/27-REVIEW-R3-DISPOSITION.md
    - .planning/phases/27-auto-sell-integration/27-REVIEW-R2-DISPOSITION.md (fixed 행 Source 칸 형식: `<해시> — <근거 문서>`)
  </read_first>
  <action>
    (1) 회귀 확인 — 동시 세션이 이 Mac을 같이 쓴다. 전체 스위트는 돌리지 않는다. 먼저 `uptime`으로 부하를 기록한다. 그다음 `<verification>`의 대상 두 파일 전체 실행, tsc, eslint를 돌린다. 흐름 파일에서 vitest `Timeout._onTimeout` 타임아웃이 나면 한 번만 다시 돌린다. 그래도 나면 실패한 테스트 이름, 부하, 소요 시간을 SUMMARY에 정직하게 적는다. 3라운드 리뷰 때 과부하(load 47~95)에서 4건이 타임아웃됐던 이력이 있다. 새 실패가 이번 변경 때문이면 고치고 Task 1 · 2의 fix 커밋 뒤에 별도 `fix(quick-261010-jix): …` 커밋으로 남긴다.
    (2) 27-REVIEW-R3-DISPOSITION.md — 4행을 모두 `fixed`로 바꾼다. Source 칸은 R2 처분 기록 형식(`<해시> — <근거>`)을 따른다. 해시는 Task 1 · 2의 fix 커밋 단축 해시(`git log --oneline`에서 확인)다. WR-R3-01 · IN-R3-01은 Task 1 fix 해시 — quick-261010-jix다. WR-R3-01 칸에는 「relay 출처만 무응답 뒤 LC_ORPHAN_WAIT_MS 로 묶음 · 키 출처는 늦은 창 내내」를 짧게 단다. WR-R3-02 · IN-R3-02는 Task 2 fix 해시 — quick-261010-jix다. WR-R3-02 칸에는 「켜짐 → 꺼짐은 start 대기만 끊음 — stop 은 settleAutoSell 이 먼저 풂」을 단다. frontmatter `open: 4`는 `open: 0`, `updated`는 2026-10-10이다. 27-REVIEW-R3.md 본문은 고치지 않는다. 리뷰 산출물은 덮어쓰지 않는다.
    (3) `docs(quick-261010-jix): …` 한글 메시지로 이 파일만 경로를 지정해 커밋한다. Co-Authored-By는 없고 push도 하지 않는다.
  </action>
  <verify>
    <automated>[ "$(grep -cE '^\| (WR-R3-01|WR-R3-02|IN-R3-01|IN-R3-02) \| (warning|info) \| fixed \|' .planning/phases/27-auto-sell-integration/27-REVIEW-R3-DISPOSITION.md)" -ge 4 ] && grep -qx 'open: 0' .planning/phases/27-auto-sell-integration/27-REVIEW-R3-DISPOSITION.md</automated>
  </verify>
  <done>대상 두 파일 전체 · tsc · eslint 결과가 기록된다(타임아웃이 있었다면 재실행 결과와 함께). 처분 기록 4행이 fixed이고 open이 0이다. docs 커밋 1개.</done>
</task>

</tasks>

<verification>
모두 체크아웃 루트에서 시작한다. 실행 전에 `uptime`을 기록한다.
- `cd webapp && npx vitest run src/lib/__tests__/limit-chaser.test.ts src/components/trading/__tests__/strategy-card-flow.test.tsx --minWorkers=1 --maxWorkers=2` — 두 파일 전체가 통과해야 한다(흐름 파일 90 + 5건, lib 119 + 1건). `--minWorkers=1` 없이 `--maxWorkers=2`만 주면 vitest 2.1.9가 0건 실행으로 끝난다.
- `cd webapp && npx tsc --noEmit -p .` — exit 0
- `cd webapp && npx eslint src/components/trading/card/strategy-card.tsx src/lib/limit-chaser.ts src/lib/__tests__/limit-chaser.test.ts src/components/trading/__tests__/strategy-card-flow.test.tsx` — exit 0
- `git log --oneline -6`에 quick-261010-jix 커밋 5개(test · fix · test · fix · docs, 회귀 수정이 있었다면 +1)가 있어야 한다. `git show --stat <각 해시>`의 변경 파일이 files_modified 밖으로 나가지 않아야 한다. 특히 tasks/lessons.md · webapp/e2e/fixtures/relay.ts가 섞이면 안 된다.
- 전체 vitest · playwright 스위트는 돌리지 않는다(동시 세션 메모리 고갈 위험).
</verification>

<success_criteria>
- WR-R3-01 · WR-R3-02 · IN-R3-01 · IN-R3-02가 코드 · 테스트로 닫히고, 27-REVIEW-R3-DISPOSITION.md에서 4건 모두 fixed(open 4 → 0)다.
- 리뷰가 확인한 불변식이 유지된다: WR-03 음성 규칙(꺼진 채 · 켜진 채 런타임 에코로 해제 없음), WR-01(41 늦은 경로에서 `acceptAnswer` · `answerSeq` 미사용), `clearAutoSellUnacked` 단일 해제 지점, 카드에서 src 직접 비교 0건, 재전송 없음(T-16-10).
- 커밋은 경로 명시 5개(회귀 수정 시 6개)이고 Co-Authored-By는 없다. push · 배포 · migration도 없다.
</success_criteria>

<output>
`.planning/quick/261010-jix-phase-27-wr-r3-01-wr-r3-02-in-r3-01-in-r/261010-jix-SUMMARY.md`를 만든다.
SUMMARY에 꼭 적을 것:
- 커밋 해시(test · fix · test · fix · docs)
- 대상 두 파일 전체 실행 결과: 통과 수, 소요 시간, `uptime` 부하. 타임아웃이 있었다면 재실행 결과와 테스트 이름도 적는다.
- 리뷰 예시와 달라진 재량 결정 1건: 출처 구분을 카드 인라인 비교 대신 lib `isKeyedAutoSellRejection`으로 했다. 근거는 카드의 src 직접 비교 금지 규율이다.
- 배포 대기: webapp 변경은 push가 곧 프로덕션 배포다. push 여부는 오케스트레이터 · 사용자 몫이다.
</output>
