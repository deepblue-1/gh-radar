---
phase: quick-261102-epl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - relay/src/generated/StockDMA.fbs
  - relay/src/generated/stock-dma/quote-state.ts
  - relay/src/generated/stock-dma/user-settings.ts
  - packages/shared/src/relay.ts
  - relay/src/dma/envelope.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/ws/protocol.ts
  - relay/src/ws/fanout.ts
  - relay/tests/helpers/frames.ts
  - relay/tests/helpers/fake-gateway.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/tests/hub.test.ts
  - relay/tests/protocol.test.ts
  - relay/tests/ws-autosell.test.ts
  - relay/tests/fanout.test.ts
  - relay/tests/fanout-multi-session.test.ts
  - relay/tests/hub-multi-session.test.ts
  - webapp/src/lib/user-settings-server.ts
  - webapp/src/lib/__tests__/user-settings-server.test.ts
  - webapp/src/components/orderbook/orderbook-ladder.tsx
  - webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx
  - webapp/src/components/orderbook/__tests__/orderbook-ladder.test.tsx
  - webapp/src/components/trading/card/card-body.tsx
  - webapp/src/components/trading/__tests__/card-body.test.tsx
  - webapp/src/components/trading/__tests__/quote-grid-10.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
  - webapp/src/lib/__tests__/relay-provider.test.tsx
  - webapp/src/lib/__tests__/relay-socket.test.ts
  - webapp/src/components/me/limit-chaser-defaults.tsx
  - webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx
  - webapp/e2e/specs/me.spec.ts
  - docs/inbox/from-gh-trade/261101-burst-ratio-pct.md
autonomous: true
requirements: [EPL-1-quote-brp, EPL-2-ladder-mark, EPL-3-usersettings-84-42, EPL-4-me-burst-row, EPL-5-ladder-threshold, EPL-6-inbox-close]

estimate:
  tokens: 150000
  raw_tokens: 150000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "게이트웨이 59 의 burst_ratio_pct 가 relay `RelayQuote.brp` 로 거래소별 그대로 브라우저에 온다(필드 부재 = 0) · 비율만 바뀐 59 도 PRICE 소켓에 간다(samePriceSection 이 brp 를 비교한다)"
    - "상따 호가 사다리(세 트리 각각): brp > 0 ∧ brp ≥ 기준 → 빨간(--up) 「버스트 NN%」 · 0 < brp < 기준 → 회색(--muted-fg) 「NN%」 · brp 0/부재 ∧ bul === true → 종전 「버스트」 · 그 밖엔 표식 없음 — 레이아웃 폭 0 · pointer-events-none 그대로"
    - "사다리 기준 = 그 카드 계좌 서버의 84 burstRatioPct(1~100) · 0 · 범위 밖 · 84 미수신이면 70"
    - "84 의 burst_ratio_pct 가 브라우저 user.settings.burstRatioPct 로 온다(84 슬롯 부재 = 구 서버 = 0)"
    - "게이트웨이가 받는 42 에 burst_ratio_pct 슬롯은 1~100 값일 때만 선다 — 브라우저 s 에 burstRatioPct 가 없으면 슬롯 부재(서버 저장값 유지) · relay zod 는 0 · 101 · 소수 · 문자열을 거부 · /me 는 84 가 1~100 일 때만 싣고 0/부재면 키 자체를 싣지 않는다 (0 을 실어 보내는 경로 없음)"
    - "/me 상따 기본설정에 「버스트 상한가」 카드(행 「판정 비율」 단위 %)가 오른쪽 열 매도 다음 · 자동매도 앞에 있다(폰 1열 순서 매수 금액 → 선매수 → 후매수 → 매도 → 버스트 상한가 → 자동매도) · 84 가 0/부재면 「70%」 를 보이고 · 확정한 1~100 은 42 1건으로 나가며 범위 밖은 「1~100% 사이여야 해요」 · 전송 0"
    - "인박스 노트 261101-burst-ratio-pct 가 status done · done_commit(마지막 코드 커밋) · 「gh-radar 처리」 절(판정 비율 칸 둠 · 42 는 1~100 만, 0 은 부재)로 닫혀 경로 지정 커밋돼 있다"
  artifacts:
    - path: "packages/shared/src/relay.ts"
      provides: "RelayQuote.brp(JSDoc) · RelayUserSettingsValues.burstRatioPct?(optional) · UserSettingsNumericKey 가 optional 숫자 키도 포함 · USER_SETTINGS_RANGES.burstRatioPct 1~100"
      contains: "burstRatioPct"
    - path: "relay/src/dma/envelope.ts"
      provides: "parseQuote brp · parseUserSettings burstRatioPct(부재 0) · buildSetUserSettingsReq 값 있을 때만 addBurstRatioPct"
      contains: "addBurstRatioPct"
    - path: "relay/src/hub/subscription-hub.ts"
      provides: "samePriceSection 의 brp 동등 비교"
      contains: "a.brp === b.brp"
    - path: "relay/src/ws/protocol.ts"
      provides: "RelayUserSettingsSetSchema.burstRatioPct optional(1~100)"
      contains: "burstRatioPct"
    - path: "webapp/src/lib/user-settings-server.ts"
      provides: "BURST_RATIO_DEFAULT_PCT 70 · burstRatioPctOf(1~100 아니면 undefined) · burstRatioThresholdOf(아니면 70)"
      contains: "burstRatioThresholdOf"
    - path: "webapp/src/components/orderbook/orderbook-ladder.tsx"
      provides: "burstMarkOf 4갈래 규칙 · BurstMark 빨강/회색 · burstThresholdPct prop"
      contains: "burstMarkOf"
    - path: "webapp/src/components/me/limit-chaser-defaults.tsx"
      provides: "「버스트 상한가」 묶음 · 「판정 비율」 행 · 열 [매도, 버스트 상한가, 자동매도] · 표시값 70 폴백 · 42 조립 1~100 만"
      contains: "me-lc-burst-ratio-pct"
  key_links:
    - from: "relay/src/dma/envelope.ts parseQuote"
      to: "relay/src/hub/subscription-hub.ts samePriceSection"
      via: "brp 가 가격 섹션 서명에 들어간다 — 빠지면 비율만 바뀐 59 가 중복으로 드롭된다"
      pattern: "a.brp === b.brp"
    - from: "webapp/src/components/me/limit-chaser-defaults.tsx userSettingsValuesOf"
      to: "relay/src/dma/envelope.ts buildSetUserSettingsReq"
      via: "s.burstRatioPct 는 84 가 1~100 일 때만 존재 → zod optional → 정의돼 있을 때만 addBurstRatioPct"
      pattern: "burstRatioPctOf"
    - from: "webapp/src/components/trading/card/card-body.tsx"
      to: "webapp/src/components/orderbook/orderbook-ladder.tsx burstThresholdPct"
      via: "useRelayContext → userSettingsForAccount(카드 계좌 서버 84) → burstRatioThresholdOf"
      pattern: "burstThresholdPct"
---

<objective>
gh-trade 인계 261101(quick-261101-t7c — StockDMA.fbs 말미 append `QuoteState.burst_ratio_pct` · `UserSettings.burst_ratio_pct`)를 gh-radar 에 반영한다.

① [tracer] 59 `brp` 한 경로: 게이트웨이 59 → relay 디코드 · hub 가격 섹션 비교 → 브라우저 상따 호가 사다리 「버스트 NN%」/회색 「NN%」(WinForms OrderBookPanel 동형) → ② 84/42 `burstRatioPct` 계약: shared 타입 · 범위 · relay 파서 · 조립기 · zod · /me 42 조립(1~100 만, 0/부재는 미적재) → ③ /me 「버스트 상한가 · 판정 비율」 칸 + 사다리 기준을 카드 계좌 서버 84 로 배선 + 인박스 노트 닫기.

Purpose: 웹 상따 카드가 WinForms 호가창과 같은 기준으로 버스트 비율 판정을 보여 주고, 웹 /me 에서 그 기준(서버 저장 · 사용자별)을 고칠 수 있게 한다. 42 에 0 이 실려 서버가 요청 전체를 거부하는 경로를 구조적으로 막는다.
Output: 위 files_modified · 코드 커밋 3개 + 인박스 docs 커밋 1개(한글).

범위 상한: 위 ①②③ 과 그 테스트만. 다른 리팩터 · 정리 · e2e 확장 금지. STATE.md · SUMMARY 커밋 · 배포(relay 배포 · push)는 오케스트레이터/메인 세션 몫.
</objective>

## 결정 번호(오케스트레이터 「확정된 결정」 1~9 — 재논의 금지)

D-01 relay 59 `brp` + hub 동등 비교 + shared JSDoc · D-02 84 파서(부재 0) · D-03 42 조립(undefined 면 슬롯 없음 · 0 경로 금지) · D-04 `USER_SETTINGS_RANGES.burstRatioPct` 1~100 · `RelayUserSettingsValues.burstRatioPct` optional · D-05 웹 42 송신(84 가 1~100 일 때만 · 0 이면 부재 · 확정값 1~100) · D-06 /me 「버스트 상한가 · 판정 비율」 칸(오른쪽 열 매도 다음 · 0 이면 70 표시 · 기존 SettingRow) · D-07 사다리 표시 4갈래 + 기준 배선 + `RelayQuote` 리터럴 `brp: 0` · D-08 범위 밖(lc 폼 ☐버스트 취소 · 54 'B' 문구 · kind 10·85 · DB · 네이티브) · D-09 인박스 노트 닫기.

## 소스 커버리지 감사

| 출처 | 항목 | 담당 |
|------|------|------|
| GOAL | 버스트 비율 판정 웹 반영(gh-trade quick-261101-t7c) | Task 1~3 |
| INBOX | 생성물 재동기화(이미 됨 — 작업 트리 미커밋 3파일) | Task 1(커밋만) |
| INBOX | 59 `burst_ratio_pct` 표시 「버스트 NN%」 · 회색 「NN%」 · 구 서버 「버스트」 | Task 1 (D-01 · D-07) |
| INBOX | 84 `burst_ratio_pct`(늘 실림 · 부재 = 0 → 내장 70) | Task 2 (D-02) · Task 3 (D-06 표시) |
| INBOX | 42 부재 = 저장값 유지 · 0 은 범위 밖 거부 → 부재로 둔다 | Task 2 (D-03 · D-04 · D-05) |
| INBOX 질문 | 판정 비율 칸을 둘지 · 42 에 0 을 채우는 경로 | Task 3 (D-06 칸) · Task 3 인박스 답 (D-09) |
| CONTEXT | D-01 ~ D-07 · D-09 | 아래 태스크 action 에 번호로 인용 |
| 제외 | D-08 범위 밖 항목 · STATE/SUMMARY 커밋 · 배포 | 오케스트레이터 / 별건 |

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@docs/inbox/from-gh-trade/261101-burst-ratio-pct.md

계약 정본(grep 으로 그 행만): `../gh-trade/server/docs/protocol.md` 54행(42) · 224행(84) · 251행(QuoteState.burst_ratio_pct 표시 규칙). WinForms 원본: `../gh-trade/client/Controls/OrderBookPanel.cs` 137~142 · 931~938 · 1050~1075.

선례(읽고 그대로 따른다): `.planning/quick/261012-u04-gh-trade-261012/261012-u04-PLAN.md`(선매수 2필드 — optional 42 슬롯 규율 · /me 행 추가 · 테스트 헬퍼 모양) · quick-261003-rc4(`bul` · `BurstMark` — envelope.test Q1 · hub.test P2/Q3 · orderbook-ladder-chaser.test Q4~Q6).

생성 API(이미 동기화됨 · 손편집 금지): `QuoteState.burstRatioPct(): number`(기본 0) · `QuoteState.addBurstRatioPct` · `UserSettings.burstRatioPct(): number | null` · `UserSettings.addBurstRatioPct(b, n)`. `createQuoteState` · `createUserSettings` 위치 인자 시그니처에 새 인자가 붙었다 — 헬퍼는 이름 있는 `add*` 빌더만 쓰므로 영향 없음(쓰는 곳이 생기면 안 된다).

실행 규율(전 태스크 공통 — 그대로 지킨다):
- worktree 격리 없음 · 메인 트리 순차 실행. 다른 세션이 동시에 작업 중이다 — **`git add -A` · `git add .` 금지, 경로 지정 add 만**. 커밋 직전 `git status -sb` 재확인. `.planning/phases/36-account-budget/.gitkeep` 은 남의 것이라 건드리지도 스테이징하지도 않는다. `.planning/quick/261102-epl-*` 와 `.planning/STATE.md` 는 스테이징하지 않는다(오케스트레이터 몫).
- 커밋 메시지는 한글 · **Co-Authored-By 줄 넣지 않음**(사용자 전역 규칙이 우선). push · 배포 금지(메인 세션이 relay 먼저 → push 순서로 한다).
- shared 는 dist 로 소비된다 — shared 를 고친 뒤 relay/webapp 검사 전에 `pnpm --filter @gh-radar/shared build`.
- 메모리 고갈 방지: vitest 는 `--maxWorkers=2`, playwright 는 `--workers=1` + `-g` 로 지정 테스트만. 변경 관련 파일 먼저 → 마지막에 패키지별(shared · relay · webapp) 전체 vitest 1회. playwright webServer 타임아웃이 NextFontGoogleFontFileReplacer 반복이면 `rm -rf webapp/.next` 후 재실행.
- 생성물 `relay/src/generated/**` 손편집 금지.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: [tracer] 59 brp 한 경로 — QuoteState.burst_ratio_pct 디코드 → hub 가격 섹션 비교 → 상따 호가 사다리 「버스트 NN%」/회색 「NN%」</name>
  <files>relay/src/generated/StockDMA.fbs, relay/src/generated/stock-dma/quote-state.ts, relay/src/generated/stock-dma/user-settings.ts, packages/shared/src/relay.ts, relay/src/dma/envelope.ts, relay/src/hub/subscription-hub.ts, relay/tests/helpers/frames.ts, relay/src/dma/__tests__/envelope.test.ts, relay/tests/hub.test.ts, webapp/src/lib/user-settings-server.ts, webapp/src/components/orderbook/orderbook-ladder.tsx, webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx, webapp/src/components/orderbook/__tests__/orderbook-ladder.test.tsx, webapp/src/components/trading/card/card-body.tsx, webapp/src/components/trading/__tests__/card-body.test.tsx, webapp/src/components/trading/__tests__/quote-grid-10.test.tsx, webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx, webapp/src/lib/__tests__/relay-provider.test.tsx, webapp/src/lib/__tests__/relay-socket.test.ts</files>
  <read_first>
    - docs/inbox/from-gh-trade/261101-burst-ratio-pct.md (계약 정본)
    - ../gh-trade/client/Controls/OrderBookPanel.cs 137~142 · 1050~1075 (표시 4갈래 원본 — 비율 판정이 bul 보다 먼저)
    - packages/shared/src/relay.ts 1080~1092 (`bul` JSDoc — 그 바로 뒤에 `brp`)
    - relay/src/dma/envelope.ts 636~647 (parseQuote 의 `bul:` 줄)
    - relay/src/hub/subscription-hub.ts 340~374 (samePriceSection 표 · 비교)
    - relay/tests/helpers/frames.ts 100~156 (FakeQuoteInput · buildQuoteStateFrame)
    - relay/src/dma/__tests__/envelope.test.ts 603~616 (Q1) · relay/tests/hub.test.ts 1625~1690 (push59 · P2 · Q3)
    - webapp/src/components/orderbook/orderbook-ladder.tsx 60~75 (상단 「버스트 표식」 단락) · 120~165 (Props) · 636~660 (BurstMark) · 700~720 · 795~806 (burst 판정) · 945~960 · 1125~1180 (세 트리 렌더 자리)
    - webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx 40~70 (makeQuote · renderChaser) · 755~815 (Q4~Q6)
    - webapp/src/components/trading/card/card-body.tsx 70~108 (EMPTY_LADDER_QUOTE) · 340~360 (OrderbookLadder 호출)
  </read_first>
  <precondition>`grep -q burstRatioPct relay/src/generated/stock-dma/quote-state.ts && grep -q burstRatioPct relay/src/generated/stock-dma/user-settings.ts` 가 참이고 `git status -sb` 에 그 세 생성 파일이 수정(M)으로 보인다 — 아니면 멈추고 보고한다(재동기화는 오케스트레이터가 이미 했다 · 손으로 만들지 않는다).</precondition>
  <behavior>
    - envelope: buildQuoteStateFrame({ burstRatioPct: 85 }) → parseQuote 결과 brp 85 (typeof number); 필드 미지정(구 서버 모양) → brp 0; NXT 85 / KRX 0 프레임이 섞이지 않는다(거래소별 — bul 과 같다).
    - hub P2: samePriceSection(q, { ...q, brp: 85 }) false · 같은 brp 끼리 true · 기존 bul 단언 그대로.
    - hub Q3b: push59({ burstRatioPct: 40 }) 뒤 push59({ burstRatioPct: 85 })(다른 칸 동일) → PRICE 소켓에 두 번째 q 프레임이 가고 brp 85 가 실린다.
    - ladder burstMarkOf(순수 함수): (brp 85, 기준 70) → 빨강 「버스트 85%」 · sr 「버스트 상한가 85%」; (70, 70) → 빨강(≥); (40, 70) → 회색 「40%」 · sr 「버스트 비율 40%」; (85, 90) → 회색 「85%」; (brp 40 ∧ bul true) → 회색 「40%」(비율이 먼저 — WinForms 순서); (brp 0 ∧ bul true) → 빨강 「버스트」 · sr 「버스트 상한가」; (brp 키 없음 ∧ bul true — 옛 relay 프레임) → 「버스트」; (0 ∧ bul false) → null.
    - ladder 렌더: brp 85 → 세 트리에 표식 하나씩 · 보이는 글자 「버스트 85%」 · `--up` 클래스; brp 40 → 「40%」 · `--muted-fg` 클래스 · `--up` 없음; burstThresholdPct 미지정이면 기준 70; 기존 Q4(bul true → 「버스트」/「버스트 상한가」) · Q5(표식 0개) · Q6(클릭 통과) 그대로 통과 · absolute · pointer-events-none · 행 수 · 마커 불변.
  </behavior>
  <action>
**1) shared (`packages/shared/src/relay.ts`, D-01).** `RelayQuote` 의 `bul` 바로 뒤에 `brp: number` 를 추가한다. JSDoc: `QuoteState.burst_ratio_pct`(ubyte · gh-trade quick-261101-t7c) — 서버 버스트 **비율 판정** %(1~100, 상한 매도벽이 사라진 순간 유효 버스트 상한가 수량 ÷ 상한가 매수체결 전체) · 0 = 판정 없음 · 구 서버(부재) · 엄격 잠김(bul true)이면 100 · **거래소별**(bul 과 같음 · 이 프레임 x 값) · 58/59 매 프레임 · 사용자 기준(84 `burstRatioPct`, 기본 70) 비교는 소비자 몫 · 웹은 `typeof === 'number'` 로만 읽는다(키 없는 옛 relay 프레임 안전).

**2) relay envelope (D-01).** `parseQuote` 의 `bul:` 줄 다음에 `brp: q.burstRatioPct()` — 주석 「버스트 비율 판정 % · 서버 권위값 · 거래소별 · 부재(구 서버) = 0 (quick-261101-t7c)」. 계산 · 클램프 없음.

**3) relay hub (D-01 ⚠️).** `samePriceSection` 비교에 `a.brp === b.brp` 를 `a.bul === b.bul` 옆에 추가한다 — 빠지면 비율만 바뀐 59 가 PRICE 소켓에서 중복으로 드롭된다. 위 표의 「버스트 상한가」 행에 `brp`(비율 판정 · kDirtyTrade · quick-261101-t7c)를 더하고 「필드 13개」 문구를 14개로 고친다.

**4) relay 테스트 헬퍼 · 테스트.** `frames.ts` FakeQuoteInput 에 `burstRatioPct?: number`(JSDoc · 기본 0 = 구 서버 · 판정 없음)를 더하고 buildQuoteStateFrame 이 `QuoteState.addBurstRatioPct(b, input.burstRatioPct ?? 0)` 를 `addBurstUpperLimit` 다음에 쓴다. behavior 대로 envelope.test(Q1 옆 Q2) · hub.test(P2 단언 추가 · P2 의 RelayQuote 리터럴에 `brp: 0` · Q3 옆 Q3b) 케이스를 더한다. `pnpm --filter @gh-radar/relay run typecheck:tests` 가 요구하는 다른 RelayQuote 타입 리터럴에도 `brp: 0` 만 더한다.

**5) webapp 기준 상수 (`webapp/src/lib/user-settings-server.ts`).** `BURST_RATIO_DEFAULT_PCT = 70` 을 export 한다(WinForms 「부재 = 0 → 내장 70」 · gh-trade protocol 224행 내장 기본값). 이 파일이 84 출입구라 /me(Task 3)와 사다리가 같은 상수를 읽는다 — 다른 파일에 70 을 다시 적지 않는다. 84 해석 함수는 Task 2 에서 더한다.

**6) webapp 사다리 (`orderbook-ladder.tsx`, D-07).**
- 순수 함수 `burstMarkOf(quote, thresholdPct)` 를 export 한다 — 입력은 quote 의 `brp` · `bul` 만. brp 는 `typeof quote.brp === 'number' ? quote.brp : 0` 으로 읽는다. 결과는 표식 없음(null) 또는 { tone: 빨강 | 회색, text, srText }. 규칙은 WinForms OrderBookPanel 1050~1075 순서 그대로: brp > 0 ∧ brp ≥ 기준 → 빨강 「버스트 NN%」 · sr 「버스트 상한가 NN%」 / brp > 0 → 회색 「NN%」 · sr 「버스트 비율 NN%」 / brp 0 ∧ `bul === true` → 빨강 「버스트」 · sr 「버스트 상한가」(구 서버 · 종전 문구 그대로) / 그 밖 null.
- `OrderbookLadderProps` 에 `burstThresholdPct?: number` — JSDoc: `variant="chaser"` 전용 · 그 카드 계좌 서버의 84 `burstRatioPct`(호출자가 정규화해 1~100) · 미지정 = `BURST_RATIO_DEFAULT_PCT`. ChaserLadder 가 받는다(StandardLadder 는 무시).
- 803행 `burst` 불리언을 `burstMarkOf(quote, burstThresholdPct ?? BURST_RATIO_DEFAULT_PCT)` 결과로 바꾸고, 세 트리의 `{burst && <BurstMark …/>}` 3곳이 그 결과를 넘긴다(트리마다 판정을 다시 적지 않는다 — 한 값 공유).
- `BurstMark` 는 `{ heightClass, mark }` 를 받는다. 바깥 div(`data-slot="ladder-burst"` · absolute · inset-x-0 · top-0 · z-[2] · pointer-events-none · heightClass)와 알약 모양 · 크기 · 바탕은 그대로. 빨강은 기존 `--up` 테두리 · 글자 그대로, 회색은 같은 자리에 `--muted-fg` 테두리 · 글자(새 색 토큰 금지). 알약에 `data-tone` 을 달아 테스트가 클래스 대신 볼 수 있게 한다. 보이는 글자는 aria-hidden span, 스크린리더 문구는 sr-only span(mark.srText).
- 상단 주석 「★ 「버스트」 표식」 단락과 BurstMark 문서 주석을 새 규칙으로 고친다: 4갈래 · 기준의 출처(카드 계좌 서버 84 · 0/미수신 70) · WinForms OrderBookPanel 동형(gh-trade quick-261101-t7c) · 레이아웃 폭 0 · pointer-events-none · 기본 `"orderbook"` 변형에는 없다는 기존 문장은 유지.

**7) webapp 리터럴 · 테스트 (D-07).** `card-body.tsx` 의 `EMPTY_LADDER_QUOTE` 에 `bul: false` 다음 `brp: 0`. `pnpm --filter @gh-radar/webapp run typecheck` 가 요구하는 테스트 픽스처의 RelayQuote 리터럴(orderbook-ladder · orderbook-ladder-chaser · quote-grid-10 · card-body · strategy-card-flow · relay-provider · relay-socket 테스트 — `grep -rn "bul:" webapp/src` 로 찾는다)에 `brp: 0` 만 더한다. orderbook-ladder-chaser.test 에 behavior 의 burstMarkOf 표 케이스와 렌더 케이스를 rc4 describe 옆 새 describe(quick-261102-epl)로 추가한다. 기존 Q4~Q6 기대는 바꾸지 않는다 — 깨지면 원인부터 본다.

**8) 커밋 1.** `git status -sb` 확인 후 경로 지정 add(생성물 3파일 포함 — 이 커밋이 재동기화 생성물의 첫 커밋이다). 메시지: `feat(relay,webapp): 버스트 비율 판정 59 brp — QuoteState.burst_ratio_pct 디코드 · 가격 섹션 동등 비교 · 상따 호가 사다리 「버스트 NN%」/회색 「NN%」 (gh-trade quick-261101-t7c · WinForms 동형 · 생성물 재동기화 포함)`.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared run typecheck && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts tests/hub.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx src/components/orderbook/__tests__/orderbook-ladder.test.tsx src/components/trading/__tests__/card-body.test.tsx --maxWorkers=2</automated>
  </verify>
  <done>59 의 burst_ratio_pct 가 게이트웨이 프레임 → relay parseQuote → hub PRICE 팬아웃(비율만 바뀐 프레임 포함)까지 brp 로 가고, 상따 사다리가 그 값을 기준 70(기본)으로 4갈래 표시한다. 세 패키지 타입체크 · 지정 테스트 통과 · 커밋 1개(생성물 3파일 포함).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 84/42 burstRatioPct 계약 — shared 타입 · 범위 · relay 파서 · 조립기 · zod · /me 42 조립(1~100 만 · 0/부재는 미적재)</name>
  <files>packages/shared/src/relay.ts, relay/src/dma/envelope.ts, relay/src/ws/protocol.ts, relay/src/ws/fanout.ts, relay/tests/helpers/frames.ts, relay/tests/helpers/fake-gateway.ts, relay/src/dma/__tests__/envelope.test.ts, relay/tests/protocol.test.ts, relay/tests/ws-autosell.test.ts, relay/tests/fanout.test.ts, relay/tests/fanout-multi-session.test.ts, relay/tests/hub.test.ts, relay/tests/hub-multi-session.test.ts, webapp/src/lib/user-settings-server.ts, webapp/src/lib/__tests__/user-settings-server.test.ts, webapp/src/components/me/limit-chaser-defaults.tsx, webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx, webapp/e2e/specs/me.spec.ts</files>
  <read_first>
    - ../gh-trade/server/docs/protocol.md 54행 · 224행 (42 optional 규약 · 0 은 범위 밖 거부 · 84 늘 실림 · 부재 = 0 → 클라 내장 70)
    - packages/shared/src/relay.ts 800~822 (RelayUserSettingsSetMsg) · 1530~1630 (RelayUserSettingsValues · UserSettingsNumericKey · RelayUserSettingsMsg · USER_SETTINGS_RANGES)
    - relay/src/dma/envelope.ts 793~826 (parseUserSettings) · 2148~2195 (buildSetUserSettingsReq — 선매수 2필드 조건부 슬롯 선례)
    - relay/src/ws/protocol.ts 420~470 (userSettingInt · RelayUserSettingsSetSchema)
    - relay/src/ws/fanout.ts 2140~2195 (user.settings.set 갈래 — 구 탭 postBuyFloorAmount 되싣기)
    - relay/tests/helpers/frames.ts 1295~1345 · relay/tests/helpers/fake-gateway.ts 895~940
    - webapp/src/components/me/limit-chaser-defaults.tsx 255~305 (userSettingsValuesIssue · usableUserSettingsOf · userSettingsValuesOf) · 412~425 (dispatchOne)
    - webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx 200~260 (u04 42 조립 케이스 모양)
    - webapp/e2e/specs/me.spec.ts 1708~1735 (LC84 · USER_SETTINGS_BUILTIN)
  </read_first>
  <behavior>
    - envelope parseUserSettings: 84 에 burstRatioPct 85 → 85; 슬롯 부재(헬퍼 기본 · 구 서버 모양) → 0 (키는 늘 존재).
    - envelope buildSetUserSettingsReq: burstRatioPct 85 → 읽어 낸 42 getter 85; 키 없음 → getter null(슬롯 부재 = 서버 저장값 유지); 기존 선매수 2필드 단언 그대로.
    - envelope ⑤ 범위 정본: USER_SETTINGS_RANGES 키 = RelayUserSettingsValues 의 숫자 키(이제 burstRatioPct 포함) · burstRatioPct { min 1, max 100 }.
    - protocol zod: burstRatioPct 1 · 70 · 100 통과; 0 · 101 · 1.5 · "70" · null 거부; 키 없는 기존 14값 통과하고 결과 s 에 burstRatioPct 키 없음.
    - ws-autosell: 브라우저 user.settings.set(…, burstRatioPct 85) → 게이트웨이 42 디코드 85; 키 없는 set → null; 게이트웨이 84(burstRatioPct 85) → 브라우저 user.settings.burstRatioPct 85; 슬롯 없는 84 → 0. 구 탭(후매수 최소 없음) 84 캐시 되싣기 갈래도 burstRatioPct 를 지어내지 않는다(키 없으면 null).
    - fanout · fanout-multi-session · hub · hub-multi-session: 84 파싱 결과 toEqual 기대에 burstRatioPct 0, 42 디코드 toEqual 기대에 burstRatioPct null 을 더하는 갱신만.
    - webapp user-settings-server: burstRatioPctOf — 85 → 85 · 1 → 1 · 100 → 100 · 0 · 101 · 1.5 · 키 부재 · 84 undefined → undefined; burstRatioThresholdOf — 같은 입력에서 값 또는 70.
    - webapp /me 42 조립: 84 burstRatioPct 85 에서 매도 주기 3→5 확정 → send 1 · s.burstRatioPct 85; 84 burstRatioPct 0 또는 키 부재 → s 에 burstRatioPct 키 없음(`not.toHaveProperty`); 기존 42 케이스 기대 불변.
  </behavior>
  <action>
**1) shared (`packages/shared/src/relay.ts`, D-04).**
- `RelayUserSettingsValues` 말미에 `burstRatioPct?: number` — JSDoc: 버스트 판정 비율 %(fbs vtable 34 · `= null` · gh-trade quick-261101-t7c) · 1~100 · 기본 70 · 호가창 「버스트 NN%」 · 서버 상따 ☐버스트 취소의 기준 · **선택**인 이유: 42 부재 = 서버 저장값 유지이고 0 은 서버가 범위 밖으로 요청 전체를 거부한다 — 모르는 값은 0 이 아니라 부재로 보낸다. 타입 주석의 값 개수 표현(「14값」 등)을 사실대로 고친다.
- `UserSettingsNumericKey` 파생을 고친다 — 지금 식은 optional 키(`number | undefined`)를 숫자 키에서 빠뜨린다. `-?` 매핑 + `NonNullable` 로 optional 숫자 키도 포함되게 하되 손 목록은 여전히 금지. 그 결과 `UserSettingsBoolKey`(webapp — `Exclude<…>`)가 `preBuyAutoAddBuy` 하나로 남는지 tsc 로 확인된다.
- `USER_SETTINGS_RANGES` 에 `burstRatioPct: { min: 1, max: 100 }` 를 더하고 주석의 칸 수를 고친다(satisfies 의 초과 속성 검사가 파생 누락을 잡는다).
- `RelayUserSettingsMsg` 주석에 burstRatioPct 부재의 뜻을 한 단락: 새 relay 는 늘 싣고 84 슬롯 부재(구 서버) = 0 · 키 부재는 이 동기화 이전 relay 뿐 · 웹은 0/부재/범위 밖을 「모름」 으로 읽어 **표시는 내장 70 · 42 에는 싣지 않는다**(「불러오는 중」 으로 두지 않는다). `RelayUserSettingsSetMsg` 주석(804행 근처)에 같은 42 규칙 한 줄.

**2) relay envelope (D-02 · D-03).** `parseUserSettings` 에 `burstRatioPct: u.burstRatioPct() ?? 0` — 주석 「vtable 34 · 구 서버(부재) = 0 → 웹 내장 70」 · 함수 문서 주석 갱신. `buildSetUserSettingsReq` 는 `s.burstRatioPct !== undefined` 일 때만 `UserSettings.addBurstRatioPct(b, toWireUByte(s.burstRatioPct, "burstRatioPct"))` — 선매수 2필드 블록 다음. 문서 주석에 「burstRatioPct 도 값이 있을 때만 슬롯 · 0 은 zod(1~100)가 먼저 막는다 — 서버는 0 을 범위 밖으로 요청 전체 거부」 를 적는다. 인자 타입이 tsc 로 통과하면 그대로 둔다(Values 에서 이미 optional).

**3) relay zod (`protocol.ts`, D-04).** 스키마에 `burstRatioPct: userSettingInt("burstRatioPct").optional()`. 주석: 선매수 2필드와 같은 optional 규율 — 부재는 슬롯 부재로 나가 서버가 저장값을 유지한다 · 84 캐시로 되싣지 않는다 · 0 은 범위 밖이라 close(4400)(웹이 같은 범위로 먼저 막고, 애초에 0 을 싣지 않는다).

**4) relay fanout.** user.settings.set 갈래 로직은 바꾸지 않는다(`{ ...msg.s, postBuyFloorAmount }` 가 burstRatioPct 를 그대로 통과 · 부재면 부재). 갈래 주석에 「burstRatioPct 도 통과 · 부재 = 서버 저장값 유지 · 캐시로 채우지 않는다」 한 줄. tsc 가 요구하는 타입 조정만.

**5) relay 테스트 헬퍼.** `frames.ts` FakeUserSettingsInput 에 `burstRatioPct?: number`(주어졌을 때만 `addBurstRatioPct` — 기본은 구 서버 모양 · 슬롯 부재). `fake-gateway.ts` SetUserSettingsRequest 에 `burstRatioPct: number | null`(null = 슬롯 부재) · readSetUserSettingsRequest 에 `u.burstRatioPct()`.

**6) relay 테스트.** behavior 대로 envelope.test · protocol.test · ws-autosell.test 케이스 추가, fanout · fanout-multi-session · hub · hub-multi-session 은 toEqual 기대 갱신만.

**7) webapp 84 해석 (`user-settings-server.ts`).** Task 1 상수 옆에 `burstRatioPctOf(us)`(84 의 burstRatioPct 가 정수이고 `USER_SETTINGS_RANGES.burstRatioPct` 안이면 그 값 · 아니면 undefined)와 `burstRatioThresholdOf(us)`(그 값 ?? `BURST_RATIO_DEFAULT_PCT`)를 export 한다. 입력 타입은 burstRatioPct 만 고른 Pick | undefined. 파일 상단 주석에 이 두 함수의 역할(/me 표시 · 42 조립 · 사다리 기준의 단일 해석 지점) 한 줄. user-settings-server.test.ts 에 behavior 케이스.

**8) webapp /me 42 조립 (`limit-chaser-defaults.tsx`, D-05).** `userSettingsValuesOf` 가 `burstRatioPctOf(s)` 가 정의돼 있을 때만 burstRatioPct 키를 싣는다(조건부 스프레드 — undefined 값을 가진 키도 만들지 않는다). 이것으로 모든 42 가 「84 가 1~100 이면 그 값 · 0/부재/범위 밖이면 부재」 가 된다(84 캐시 + 바뀐 1칸 조립 그대로). `userSettingsValuesIssue` 는 값이 undefined 인 숫자 칸을 건너뛴다(부재 = 보내지 않는 칸). 함수 주석 · 파일 상단 ⑤ 조립 bullet 에 「burstRatioPct 는 84 가 1~100 일 때만 싣는다 · 0(구 서버 · 모름)은 부재 — 서버는 0 을 범위 밖으로 42 전체를 거부한다(gh-trade quick-261101-t7c)」 를 적는다. 이 태스크는 /me 행 · UI 를 바꾸지 않는다(Task 3) — tsc 가 요구하는 최소 수정만.

**9) webapp 테스트.** limit-chaser-defaults.test 에 behavior 의 /me 42 두 케이스(84 픽스처에 burstRatioPct 85 / 0 · 부재 변형). `webapp/e2e/specs/me.spec.ts` 의 `USER_SETTINGS_BUILTIN` 에 `burstRatioPct: null` 을 더하고 그 위 주석에 「픽스처 84 는 버스트 슬롯 없음(구 서버 모양) → relay 0 → 웹 42 는 싣지 않는다(부재 = 저장값 유지 · 0 을 보내지 않는다 · quick-261102-epl)」 한 줄 — e2e 실행은 Task 3 에서 한 번.

**10) 커밋 2.** 경로 지정 add. 메시지: `feat(relay,shared,webapp): 버스트 판정 비율 84/42 — UserSettings.burst_ratio_pct 디코드(부재 0) · 값 있을 때만 42 슬롯 · zod 1~100 · /me 42 는 84 가 1~100 일 때만 싣고 0 은 부재`.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared run typecheck && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts tests/protocol.test.ts tests/ws-autosell.test.ts tests/fanout.test.ts tests/fanout-multi-session.test.ts tests/hub.test.ts tests/hub-multi-session.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/user-settings-server.test.ts src/components/me/__tests__/limit-chaser-defaults.test.tsx src/lib/__tests__/limit-chaser.test.ts --maxWorkers=2</automated>
  </verify>
  <done>84 burst_ratio_pct 가 브라우저까지(부재 = 0) 오고, 42 는 burstRatioPct 가 1~100 일 때만 게이트웨이에 슬롯이 서며 0 · 범위 밖은 zod 가 막는다. /me 의 어떤 행 확정이든 84 가 0/부재면 42 에 버스트 키가 없다. 세 패키지 타입체크 · 지정 테스트 통과 · 커밋 1개.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: /me 「버스트 상한가 · 판정 비율」 칸 + 사다리 기준을 카드 계좌 서버 84 로 배선 + 전체 회귀 + 인박스 노트 닫기</name>
  <files>webapp/src/components/me/limit-chaser-defaults.tsx, webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx, webapp/e2e/specs/me.spec.ts, webapp/src/components/trading/card/card-body.tsx, webapp/src/components/trading/__tests__/card-body.test.tsx, docs/inbox/from-gh-trade/261101-burst-ratio-pct.md</files>
  <read_first>
    - webapp/src/components/me/limit-chaser-defaults.tsx 1~190 (상단 주석 ②⑤⑥ · 묶음 타입 · USER_SETTINGS_COLUMNS · 행 표) · 625~660 (values 메모 · numericRows) · 740~900 (열 · 카드 · 행 렌더 · 시트 initialValue/serverValue)
    - webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx 70~130 (10행 흐림 · 묶음/행 순서) · 448~510 (S1-1 · S1-3b) · 616~660 (u04 카드 케이스 모양)
    - webapp/e2e/specs/me.spec.ts 1735~1790 (P27-M1 데스크톱 배치) · 2024~2050 (폰 390 배치)
    - webapp/src/components/trading/card/card-body.tsx 1~45 (상단 주석 ⑤ — 「예외 하나」) · 180~215 (props · accountNo) · 340~360
    - webapp/src/components/trading/__tests__/card-body.test.tsx 19~40 (useRelayContext 스텁)
    - webapp/src/lib/user-settings-server.ts (userSettingsForAccount · Task 1·2 의 상수 · 함수)
    - docs/inbox/from-gh-trade/261101-limitchaser-sor.md 「## gh-radar 처리」 절 (닫기 형식 선례)
  </read_first>
  <behavior>
    - /me 묶음 카드 6장 · role=group 이름 순서 매수 금액 · 선매수 · 후매수 · 매도 · 버스트 상한가 · 자동매도 · 카드별 행 3 · 2 · 2 · 1 · 1 · 4 (총 13행).
    - 열 래퍼 2개: 왼쪽 매수 금액 · 선매수 · 후매수 / 오른쪽 매도 · 버스트 상한가 · 자동매도.
    - 「판정 비율」 행: 84 burstRatioPct 85 → 「85%」; 84 0 · 키 부재 → 「70%」(편집 가능 · 불러오는 중 아님); 84 미수신 → 기존 3상태(흐림 · 비활성).
    - 인라인 90 Enter → send 1 · s.burstRatioPct 90 · 나머지는 84 캐시; 101 · 0 → 「1~100% 사이여야 해요」 · send 0; 84 85 에서 85 재확정 → no-op(send 0); 84 0 에서 70 확정 → send 1 · s.burstRatioPct 70(42 비교는 표시값이 아니라 조립값 기준 — 구 서버면 84 가 그 값을 싣지 않아 3초 실패가 정직한 결과); 84(90) 도착 → 그 행 플래시.
    - 인라인 Tab: 매도 잔량추적 → 판정 비율 → 매도 주기 순.
    - e2e P27-M1 데스크톱 900: 카드 6장 · 0~2 번 같은 x 위→아래 · 3~5 번 x 가 더 크고 위→아래 · 매도 카드 top ≈ 매수 금액 카드 top · 카드 잎 잘림 0 · (픽스처 84 슬롯 없음) 「판정 비율」 값 「70%」 · 매도 주기 확정 42 가 USER_SETTINGS_BUILTIN(burstRatioPct null) + 주기 5. 폰 390: 6장 같은 x · y 증가 · nth(3) 매도 · nth(4) 버스트 상한가.
    - card-body: 카드 계좌(accountNo)의 서버 84 burstRatioPct 90 · quote brp 85 → 사다리 회색 「85%」; 그 서버 84 없음(또는 0) · brp 85 → 빨강 「버스트 85%」(기준 70); 다른 서버(primary) 84 값으로 대신 쓰지 않는다.
  </behavior>
  <action>
**A) /me 행 · 묶음 (`limit-chaser-defaults.tsx`, D-06).**
- `UserSettingsGroup` 에 「버스트 상한가」 를 더하고 `USER_SETTINGS_COLUMNS` 오른쪽 열을 매도 · 버스트 상한가 · 자동매도로 바꾼다(WinForms 동형 — 매도 다음 · 자동매도 앞). `USER_SETTINGS_GROUPS` 는 파생 그대로.
- `USER_SETTINGS_ROWS` 의 「매도 잔량추적」 행 바로 다음(= DOM · 열 순서 — 인라인 Tab 순서가 이 표를 따른다)에 kind `value` 행: key `burstRatioPct` · label 「판정 비율」 · unit `%` · group 「버스트 상한가」 · id `me-lc-burst-ratio-pct`. 새 입력 컴포넌트 없이 기존 `SettingRow` · `InlineValueEditor` · 키패드 시트 기계를 그대로 탄다.
- **표시값 한 곳.** 저장 기계가 읽는 `values`(Task 2 — 42 조립 · no-op · 성공 · 플래시 비교 · burstRatioPct 는 1~100 일 때만 존재)와 별개로, 화면 표시 전용 메모 `shown` 을 하나 둔다 — `values` 에 burstRatioPct 를 `burstRatioThresholdOf(userSettings)` 로 채운 값. 행 값 · 체크 상태 · 인라인 initialValue · 시트 initialValue/serverValue 는 `shown` 을 읽고, 저장 기계는 지금처럼 `values` 를 읽는다(84 가 0 일 때 표시 70 · 42 부재가 동시에 성립하는 유일한 방법 — 70 을 조립값에 넣으면 D-05 가 깨진다). 범위 검사(`userSettingsRangeIssue`)는 shared 범위(1~100)를 그대로 쓴다 — 0 입력도 막힌다.
- **주석.** 상단 ② 에 「burstRatioPct 0 · 부재(구 서버 · 모름) = 표시는 내장 70 · 42 에는 싣지 않는다 — WinForms 「부재 = 0 → 내장 70」 · 「불러오는 중」 이 아니다」, ⑤ 는 Task 2 문장 유지, ⑥ 의 열 구성을 오른쪽 매도 · 버스트 상한가 · 자동매도로 · 폰 순서 문장 갱신. 「12행 표」 주석 → 13행 · 「버스트 상한가」 1행 설명(판정 비율 · 1~100 · 상따 ☐버스트 취소와 호가창 「버스트 NN%」 의 기준 · 저장 즉시 그 사용자 모든 세션에 반영). `userSettingsValuesIssue` 주석의 칸 수 갱신.

**B) /me 테스트 · e2e.** behavior 대로 기존 「묶음 5개 · 12행」 · S1-1(카드 5장 · 3·2·2·1·4) · S1-3b(열 래퍼) · 「84 미수신 10행 흐림」(이름의 행 수가 틀렸으면 사실대로) 테스트를 새 사실로 고치고, 「버스트 상한가」 describe(quick-261102-epl)에 표시 · 확정 · 범위 · no-op · 플래시 · Tab 케이스를 더한다. e2e `me.spec.ts` 는 P27-M1 데스크톱 · 폰 배치 단언만 behavior 대로 고친다(카드 5 → 6 · 오른쪽 열 3장 · 잎 잘림 루프 6회 · nth 라벨) + 데스크톱에 「판정 비율」 「70%」 단언 1줄. 다른 e2e 는 건드리지 않는다.

**C) 사다리 기준 배선 (`card-body.tsx`, D-07).** CardBody 가 `useRelayContext()` 의 `userSettingsByServer` · `accounts` 를 읽어 `userSettingsForAccount(userSettingsByServer, accountNo, accounts)` → `burstRatioThresholdOf(…)` 를 `OrderbookLadder` 의 `burstThresholdPct` 로 넘긴다. 판단: `userSettingsForServer`(/me 용 — `""` 칸 구 relay 관용)가 아니라 같은 파일의 `userSettingsForAccount`(카드 계좌 서버 · 다른 서버 값으로 대신 채우지 않음 — Pitfall 14)를 쓴다 — 기준은 그 계좌의 서버가 ☐버스트 취소에 쓰는 값이어야 하고, `""` 칸을 내리는 구 relay 는 brp 자체를 싣지 않으므로 관용이 필요 없다. 상단 주석 ⑤ 「예외 하나」 를 「예외 둘」 로 — 버스트 기준(카드 계좌 서버 84 · 읽기 전용 조회 · 0/미수신 70). card-body.test 의 useRelayContext 스텁에 `userSettingsByServer` · `accounts` 를 테스트별로 바꿀 수 있는 hoisted 값을 더하고 behavior 의 세 케이스를 추가한다(기존 케이스는 빈 값 = 기준 70 으로 그대로 통과).

**D) 커밋 3.** 경로 지정 add. 메시지: `feat(webapp): /me 상따 기본설정 「버스트 상한가 · 판정 비율」 칸(1~100 · 구 서버 70 표시) · 호가 사다리 기준을 카드 계좌 서버 84 로 (gh-trade quick-261101-t7c)`.

**E) 전체 회귀 1회.** `pnpm --filter @gh-radar/shared build` 뒤 `pnpm --filter @gh-radar/shared exec vitest run --maxWorkers=2` · `pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2` · `pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2` 를 순서대로(동시 실행 금지). 실패가 이번 변경 때문이면 고치고 별도 `fix(…)` 커밋(한글 · 경로 지정)으로 남긴다. 이번 변경과 무관한 기존 실패는 고치지 않고 SUMMARY 에 파일 · 테스트 이름을 적는다.

**F) 인박스 노트 닫기 (D-09).** `docs/inbox/from-gh-trade/261101-burst-ratio-pct.md` 프런트매터 `status: done` · `done_commit:` = 마지막 코드 커밋 해시(E 에서 fix 커밋이 생겼으면 그것, 아니면 커밋 3) 8자. 본문 끝에 `## gh-radar 처리 (261102 · quick-261102-epl)` 절 — 선례(261101-limitchaser-sor.md) 모양: 「커밋:」 목록(해시 · 한 줄 요약), 「질문 답:」 1. **예, 판정 비율 칸을 뒀다** — /me 상따 기본설정 「버스트 상한가 · 판정 비율」(1~100 · 오른쪽 열 매도 다음 · 84 가 0 이면 내장 70 표시) 2. **42 에 0 을 채우는 경로는 없다** — 웹은 84 값이 1~100 일 때만 burst_ratio_pct 를 싣고 0(구 서버 · 모름)이면 부재로 보낸다(서버 저장값 유지) · 사용자가 확정하면 1~100 만 · relay zod 도 1~100 밖이면 소켓을 닫아 막는다, 「표시:」 호가 사다리 4갈래(WinForms OrderBookPanel 동형 · 기준 = 그 카드 계좌 서버 84), 「배포:」 relay 먼저 → webapp(push) 는 메인 세션이 한다. 커밋 직전 `git status -sb` 확인 후 `git add docs/inbox/from-gh-trade/261101-burst-ratio-pct.md` 만. 메시지: `docs(inbox): 261101 버스트 비율 판정 인계 처리 완료`.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec eslint src/components/me/limit-chaser-defaults.tsx src/components/trading/card/card-body.tsx src/components/orderbook/orderbook-ladder.tsx src/lib/user-settings-server.ts && pnpm --filter @gh-radar/webapp exec vitest run src/components/me/__tests__/limit-chaser-defaults.test.tsx src/components/trading/__tests__/card-body.test.tsx src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx src/lib/__tests__/user-settings-server.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/me.spec.ts -g "P27-M1|P31-5" --workers=1 && grep -q "^status: done" docs/inbox/from-gh-trade/261101-burst-ratio-pct.md && grep -qE "^done_commit: [0-9a-f]{7,}" docs/inbox/from-gh-trade/261101-burst-ratio-pct.md && grep -q "## gh-radar 처리" docs/inbox/from-gh-trade/261101-burst-ratio-pct.md</automated>
  </verify>
  <done>/me 에 「버스트 상한가」 카드가 오른쪽 열 매도 다음에 서고(폰 6장 순서), 「판정 비율」 이 84 값(0 이면 70)을 보이며 1~100 확정만 42 로 나간다. 상따 사다리 기준이 카드 계좌 서버 84 를 따른다. 지정 테스트 · e2e P27-M1/P31-5 · 패키지별 전체 vitest 1회 통과(무관 기존 실패는 SUMMARY 기록), 인박스 노트가 done 으로 닫혀 경로 지정 커밋됐다. 코드 커밋 3개(+ 필요 시 fix) + docs 커밋 1개.</done>
</task>

</tasks>

<verification>
- Task 1~3 의 `<automated>` 가 각각 통과(태스크 순서대로 — Task 2 는 Task 1 의 shared · 상수, Task 3 은 Task 2 의 해석 함수에 의존).
- 마지막에 `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/webapp run typecheck` 로 세 패키지 동시 정합 확인.
- `git log --oneline -5` 에 코드 커밋 3개(+ fix) · `docs(inbox)` 커밋 1개 · 어느 커밋에도 Co-Authored-By 줄 없음 · `git status -sb` 에 이 플랜이 만든 미커밋 변경 없음(`.planning/quick/261102-epl-*` · STATE.md · 남의 `.planning/phases/36-account-budget/.gitkeep` 는 남아 있어도 정상).
- 배포 · push 하지 않았다.
</verification>

<success_criteria>
- 59 의 버스트 비율이 relay 를 지나(비율만 바뀐 프레임도 드롭되지 않고) 웹 상따 사다리에 WinForms 와 같은 4갈래로 보인다.
- 84/42 burstRatioPct 가 relay 를 왕복하고, 42 에 0 이 실리는 경로가 웹 · relay 어디에도 없다(웹 미적재 + zod 1~100).
- /me 에서 판정 비율을 보고 고칠 수 있고(구 서버면 70 표시), 사다리 기준이 그 값을 따른다.
- 지정 테스트 · 타입체크 · eslint · e2e P27-M1/P31-5 · 패키지별 전체 vitest 1회 통과, 인박스 노트가 닫혔다.
</success_criteria>

<output>
Create `.planning/quick/261102-epl-relay-burst-ratio-pct-nn-me-gh-trade-t7c/261102-epl-SUMMARY.md` when done — 커밋 해시 전부 · 전체 회귀 결과(무관 기존 실패가 있으면 목록) · 「배포는 메인 세션: relay 먼저 → push」 메모 포함. SUMMARY · STATE.md 커밋은 오케스트레이터 몫이라 스테이징하지 않는다.
</output>
