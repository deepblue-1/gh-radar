---
phase: quick-260923-pgv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/trading/card/card-header.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/__tests__/card-header.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card.test.tsx
  - webapp/src/components/trading/__tests__/stock-info-modal.test.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
  - webapp/e2e/specs/trading-workbench.spec.ts
autonomous: true
requirements: [PGV-A, PGV-B, PGV-C]

estimate:
  tokens: 55000
  raw_tokens: 55000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "등록된 카드(서버 전략 있음)에서도 헤더 KRX|NXT 세그먼트가 활성이고, 누르면 `onExchangeChange(cardId, 거래소)` 가 불린다 — D-10 의 「등록 뒤 잠김」 절과 이연 항목(삭제+재등록)을 이 quick 이 뒤집는다 (설계 항목 1 · PGV-A)"
    - "토글은 전략 이동이 아니다 — 카드가 보는 키(`ISIN:계좌:거래소`)의 거래소 축만 바뀐다. 새 키에 서버 전략이 있으면 그 옵션·LED·로그, 없으면 미설정(빈) 폼. 원래 거래소의 전략은 서버에 그대로 남고 relay 로 아무것도 보내지 않는다(`send` 0회). 다시 누르면 돌아온다 (설계 항목 1 · PGV-A)"
    - "카드에 미전송 더티 값(`dirtyCount > 0`)이 있으면 전환 전에 확인 다이얼로그 「{종목명} 의 수정 중인 값 {N}개가 사라져요. {현재} → {새} 로 바꿀까요?」 — 「바꾸기」면 전환, 「취소」면 키·값 유지. 더티 0 이면 즉시 전환 (설계 항목 2 · PGV-B)"
    - "키 충돌 규칙 유지 — 바꾼 뒤의 키를 다른 카드가 쓰면 이 카드는 그대로 두고 그 카드를 펼쳐(`withCardOpen`) 스크롤한다. 충돌 판정이 더티 판정보다 먼저다(이 카드 값이 사라지지 않으니 물을 것이 없다) (설계 항목 3 · PGV-B)"
    - "등록 전략 자동 카드는 전환으로 비워진 키(예: KRX)를 다시 만들지 않는다 — 실측(2026-09-23 · 임시 vitest 4케이스 초록): `seenKeys` 는 멤버십 ref 라 한 번 본 키는 다시 `fresh` 가 되지 않고, 언마운트→마운트도 lyt `seen` 복원이 막는다. 배치 기억 없는 첫 방문은 등록 전략마다 카드가 생기는 기존 동작 그대로. 코드 변경 0 · 잠그는 테스트만 (설계 항목 4 · PGV-B)"
    - "세그먼트 `title` 은 잠금 사유 대신 한 줄 전환 설명 「거래소 전환 — 이 종목의 KRX·NXT 전략을 오가며 봐요」 (설계 항목 5 · PGV-A)"
    - "「결과 모름」 잠금(계좌|ISIN|거래소 키)은 거래소별이라 전환에 영향 없음 — `relay.orderLocks` 판정 코드 변경 0 (설계 항목 6)"
    - "게이트: `pnpm --filter @gh-radar/webapp run typecheck` 0 · `run test` 전량 초록 · Playwright `trading-workbench` spec 0 fail · relay/shared/lockfile diff 0 (PGV-C)"
  artifacts:
    - path: "webapp/src/components/trading/card/card-header.tsx"
      provides: "잠금 prop 없는 `CardHeaderProps` · `export const EXCHANGE_SEGMENT_TITLE` · 항상 활성인 세그먼트"
      contains: "export const EXCHANGE_SEGMENT_TITLE"
    - path: "webapp/src/components/trading/workbench/trading-workbench.tsx"
      provides: "`changeExchange` 충돌→더티→적용 3단 경로 · `exchangeAsk` 상태 + `workbench-exchange-confirm` 다이얼로그 · `export const EXCHANGE_SWITCH_TITLE` · `export function exchangeSwitchBody`"
      contains: "workbench-exchange-confirm"
    - path: "webapp/src/components/trading/__tests__/trading-workbench.test.tsx"
      provides: "describe 「거래소 전환 — 등록 후 잠금 해제 (quick-260923-pgv)」 6케이스(즉시 전환 · 더티 확인/취소 · 자동 카드 미재생성 · 리마운트 · 충돌 이동 · 왕복)"
      contains: "quick-260923-pgv"
    - path: "webapp/e2e/specs/trading-workbench.spec.ts"
      provides: "GC3 에 등록 카드 세그먼트 활성 + 충돌 이동 실브라우저 단언"
      contains: "quick-260923-pgv"
  key_links:
    - from: "card-header.tsx `ToggleGroup onValueChange`"
      to: "strategy-card.tsx `handleExchange` → workbench `changeExchange(id, exchange)`"
      via: "`onExchangeChange` prop — 등록 여부와 무관하게 항상 연결(잠금 분기 제거)"
    - from: "workbench `changeExchange`"
      to: "`setCards(prev => prev.map(c => c.id === id ? { ...c, exchange } : c))` (= `applyExchange`)"
      via: "충돌 없음 ∧ `cardDirtyRef.current[id] === 0` 이면 직접, 더티면 `exchangeAsk` 다이얼로그 「바꾸기」 뒤"
    - from: "카드 `exchange` prop 변경"
      to: "`useStrategyCardState` 키 재계산 · `useRelaySubscription` 재구독 · `LimitChaserForm` remount(키에 `exchange` 포함 · card-body.tsx) → `onDirtyCountChange(0)`"
      via: "기존 미등록 카드 경로 그대로 — 새 코드 없음"
---

<objective>
작업대 카드 헤더의 KRX|NXT 세그먼트를 **등록 후에도 활성**으로 바꾼다(D-10 「등록 뒤 잠김」 절 + 이연 항목 「등록된 전략의 거래소 변경(삭제+재등록)」 을 뒤집음 — 사용자 결정 2026-09-23). 토글은 전략 이동이 아니라 **카드가 보는 키의 거래소 축 전환**이다: KRX 등록 카드에서 NXT 를 누르면 카드가 `ISIN:계좌:NXT` 키를 보고 — 그 키의 서버 전략이 있으면 그 옵션, 없으면 미설정 폼. KRX 전략은 서버에 그대로(삭제·재등록 없음 · relay 전송 0). 미전송 더티 값이 있으면 전환 전에 확인한다.

Purpose: 한 종목 카드 하나에서 거래소를 오가며 양쪽 전략을 본다. 코드상 **미등록 카드가 이미 하는 동작**(`useStrategyCardState` 키별 상태 · `LimitChaserForm` remount 키에 `exchange` 포함)이라 핵심 변경은 잠금 해제 + 더티 보호 + 문구다.

Output: `card-header.tsx` 잠금 prop·상수 제거 + 새 `title` 상수 · `strategy-card.tsx` 잠금 배선 제거 · 작업대 `changeExchange` 충돌→더티→적용 3단 + 확인 다이얼로그(✕ 다이얼로그와 같은 `Dialog` 문법) · vitest(헤더 · 카드 · 작업대 6케이스) · e2e GC3 단언 2줄. relay/서버/사이드바/카드 탭/알림/NXT 미거래 종목 숨김은 **손대지 않는다**. 18-CONTEXT.md 는 역사 기록이라 편집하지 않고 SUMMARY 에 「D-10 잠금 절 · 이연 항목을 quick-260923-pgv 가 대체」 를 적는다.

**실측 결과(설계 항목 4).** 등록 KRX 카드를 NXT 로 바꾼 뒤 (a) 같은 등록 목록이 새 배열·snapSeq 증가로 다시 와도, (b) 다른 종목 전략이 추가돼 `fresh` 가 생겨도, (c) 언마운트→마운트(배치 기억 있음)에도 KRX 키 카드는 **다시 생기지 않는다**. `seenKeys` 가 멤버십 ref 라 한 번 본 키는 다시 `fresh` 가 되지 않고, 리마운트는 lyt `restoreSavedCards` 의 `closed = saved.seen` 이 막는다. 배치 기억 없는 첫 방문은 등록 전략마다 카드가 생기는 기존 동작 유지(lyt 규칙과 충돌 없음). → 작업대 자동 카드 로직 **변경 없음**, 잠그는 테스트만 추가한다.

**MUTABLE-SCOPE — 순차 실행 전제:** quick-260923-p3k(카드 순서 · `withCardOpen` 도입) → quick-260923-pgu(알림) 뒤에 돈다. 아래는 줄 번호가 아니라 **함수·상수 이름**으로 지점을 가리킨다. 실행 전 `git status -sb` 로 working tree 가 깨끗한지(p3k · pgu 커밋 완료) 확인하고, 아니면 멈춘다. `withCardOpen` 이 없으면(p3k 미반영) 충돌 분기는 기존 `setCards` 식을 그대로 둔다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

**앵커 지도 (플래너가 읽었다 — 파일 전체를 다시 읽지 말고 이름으로 Grep 해 그 구간만 연다).**

webapp/src/components/trading/card/card-header.tsx (333줄)
- 머리 주석 **②** 「거래소 세그먼트는 등록 전 카드에서만 바꿀 수 있다 (D-10 · T-18-27)」 — 통째로 다시 쓴다.
- `export const EXCHANGE_LOCKED_TITLE` (잠김 사유) → 삭제하고 그 자리에 `export const EXCHANGE_SEGMENT_TITLE`.
- `interface CardHeaderProps` 의 잠금 boolean prop(JSDoc 「서버 전략이 있다(= 등록됨) → 세그먼트 잠김」) 과 `CardHeader({ … })` 구조분해의 같은 이름 → 삭제.
- 세그먼트 JSX: 주석 「★ 잠김 `title` 은 그룹과 항목 양쪽에 건다 …」 · `ToggleGroup` 의 `disabled` · `aria-disabled` · 조건부 `title` · `ToggleGroupItem` 의 `aria-disabled` · 조건부 `title` → 아래 Task 1.
- `stop` · `toggle` · LED · ⓘ · ✕ · 접힘 요약 칩은 손대지 않는다.

webapp/src/components/trading/card/strategy-card.tsx (820줄)
- `StrategyCardProps.exchange` JSDoc 「(등록 전에만 바뀐다)」 → 문구 갱신.
- `StrategyCardImpl` 의 `<CardHeader …>` 호출: 주석 「D-10 — 등록됨(서버 전략 있음) = 거래소 잠김 …」 + 그 아래 `server !== null` 을 넘기는 prop 한 줄 → 삭제. `server` 는 `ledServer` 등 다른 곳에서 계속 쓴다(구조분해 유지).
- `useStrategyCardState`: 키 변경 효과(`useEffect(..., [key])` — `prevServerRef`·`pendingRef`·`unacked`·`banner`·`appliedAt`·`fired`·`liveSeed` 리셋) **그대로**. `dirtyCount` 는 폼 remount(card-body.tsx `LimitChaserForm key={…|${exchange}|…}`) 가 `onDirtyCountChange` 마운트 효과로 0 을 보고해 내려간다 — 새 코드 없음.

webapp/src/components/trading/workbench/trading-workbench.tsx (1177줄 · p3k 반영 후 기준)
- 머리 주석: 「등록 전 카드는 거래소 토글로 키가 바뀌므로」(②) · `WorkbenchCard.id` JSDoc 「(등록 전 카드는 키가 바뀐다)」 → 「등록 여부와 무관하게」 로.
- `function keyOf(c)` · `export function withCardOpen(prev, id, open)`(p3k) · `cardsRef`.
- `const changeExchange = useCallback((id, exchange) => …, [])` — 주석 「거래소 토글(등록 전 카드만 — 등록 카드는 세그먼트가 잠긴다, D-10)」 + 충돌 분기(`clash` → `withCardOpen` + `setScrollTarget({ key: nextKey })`) + 두 번째 `setCards`(exchange 교체). **이 콜백 바로 아래**에 「더티 합산 · 이탈 경고 (⑦)」 블록: `const [cardDirty, setCardDirty] = useState<Readonly<Record<string, number>>>({})` · `reportDirty`.
- ✕ 다이얼로그 문법(재사용 원본): `const [closeAsk, setCloseAsk] = useState<{ id; reason } | null>(null)` · `registeredRef`/`orderLocksRef` 의 「최신 값을 ref 로(안정 콜백)」 패턴 · `closeCardInfo` · `closeCopyRef`(닫히는 애니메이션 동안 문구 고정) · JSX `<Dialog open={closeCardInfo !== null} onOpenChange={…}><DialogContent data-testid="workbench-close-confirm" …><DialogHeader><DialogTitle/><DialogDescription/></DialogHeader><DialogFooter><Button variant="outline">취소</Button><Button>카드 닫기</Button></DialogFooter></DialogContent></Dialog>` · 문구 상수 `CLOSE_REGISTERED_TITLE` 등은 파일 상단 `const`(테스트가 읽는 것은 `export`).
- `renderCard` 의 이름 파생식 `c.name ?? labels.get(c.isin)?.name ?? ""` — 다이얼로그 문구의 종목명도 같은 식(빈 문자열이면 ISIN).
- 등록 전략 자동 카드 효과(`seenKeys` · `fresh` · `knowsRegistered`) · `restoreSavedCards` · `closeCard` · `orderLocks` 판정 — **수정 없음**.

webapp/src/components/trading/__tests__/card-header.test.tsx — 상단 import 가 잠김 상수를 가져오고, 머리 주석 첫 항목이 「등록된 카드의 거래소 세그먼트는 세 경로로 잠긴다」, `renderHeader` 기본 props 에 잠금 false, 케이스 「등록 전(서버 전략 없음) 카드 — 거래소 세그먼트가 활성이고 …」 와 「등록된 카드 — 세그먼트가 disabled + aria-disabled="true" + 잠김 사유 title 로 잠긴다」. 헬퍼 `exchangeGroup()` · `exchangeButtons()` · `echo()`.

webapp/src/components/trading/__tests__/strategy-card.test.tsx — 케이스 「limitChasers 에 다른 키 전략이 여럿 있어도 자기 key 의 것만 읽는다」 끝의 두 줄(주석 「등록된 카드라 거래소가 잠긴다」 + `aria-disabled` 단언). 헬퍼 `keyOf(isin, exchange, account)` · `echo(isin, over)` · `relay(over)`(`send` 목) · `baseProps` · `probeBody`(`data-testid="probe-{key}"` · `[data-part="server-key"]` = 서버 전략 키 또는 `'none'`) · `cardOf(isin)` · `subscribe`/`unsubscribe` 목.

webapp/src/components/trading/__tests__/stock-info-modal.test.tsx — 헬퍼 `function Card({ code, name })` 의 `<CardHeader …>` 에 잠금 prop `{false}` 한 줄.

webapp/src/components/trading/__tests__/trading-workbench.test.tsx (1940줄 · p3k 반영 후 기준) — `StubCard`(`data-key` · `data-open` · 버튼 「{label} 카드 닫기」 · 「{label} 더티」 = `onDirtyCountChange(cardId, 2)` · 「{label} NXT」 = `onExchangeChange(cardId, 'NXT')`; label 은 `name` 없으면 ISIN). 헬퍼 `ACCOUNT` · `cardsInDom()` · `slot()` · `toggleOf()` · `lc(isin, over)`(이름은 `lc(S, { name: '삼성전자' } as Partial<RelayLimitChaser>)` 식으로) · `relay(over)`(`limitChaserSnapSeq` 도 `as Partial<RelayShape>` 로) · `mockRelay` · `cardProps`(카드 id → props) · `propsOf(isin)` · `beforeEach` 가 `localStorage.clear()`. 기존 거래소 케이스 2개(「등록 전 카드의 거래소 토글이 다른 카드의 키와 같아지면 …」 · 「충돌이 없으면 등록 전 카드의 거래소 토글은 그대로 키를 바꾼다 …」)는 **그대로 초록**이어야 한다.

webapp/e2e/specs/trading-workbench.spec.ts (1891줄+) — 케이스 `'GC3 같은 종목의 KRX·NXT 두 전략 = 카드 두 장 …'`: `relay.pushLimitChaserEcho({ buyEnabled: true, exchange: 'KRX' | 'NXT' })` 두 건 → 카드 2장 → 사이드바 NXT 항목 클릭 → NXT 카드 `data-open="true"` · KRX `false` → `title` 단언으로 끝. 헬퍼 `cards(page)` · `cardByKey(page, key)` · `STRATEGY_KEY`(KRX) · `nxtKey`. 세그먼트 셀렉터는 기존 케이스 원문 `card.locator('[data-slot="card-exchange-segment"]').getByRole('radio', { name: 'KRX' })`. 거래소 잠금을 단언하는 e2e 는 **없다**(수정 대상 0).

게이트 명령 근거(이전 quick 이 통과시킨 원문): `pnpm --filter @gh-radar/webapp run typecheck` · `pnpm --filter @gh-radar/webapp run test`(config `test_command` 의 webapp 몫) · `cd webapp && pnpm exec playwright test trading-workbench`(260923-onn SUMMARY · relay 는 spec 픽스처가 8090 에 스스로 띄운다 · dev 서버 3100 은 `webServer` 가 재사용/기동). 파일 단위 vitest 는 이 플랜 계획 중 실행해 통과한 원문 `pnpm --filter @gh-radar/webapp exec vitest run <파일>`.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 헤더 세그먼트 잠금 해제 + 전환 설명 title + 카드/헤더 vitest 갱신</name>
  <files>webapp/src/components/trading/card/card-header.tsx, webapp/src/components/trading/card/strategy-card.tsx, webapp/src/components/trading/__tests__/card-header.test.tsx, webapp/src/components/trading/__tests__/strategy-card.test.tsx, webapp/src/components/trading/__tests__/stock-info-modal.test.tsx</files>
  <read_first>webapp/src/components/trading/card/card-header.tsx (머리 주석 ② · 상수 · `CardHeaderProps` · 세그먼트 `ToggleGroup` JSX 구간만), webapp/src/components/trading/card/strategy-card.tsx (`StrategyCardProps.exchange` JSDoc · `StrategyCardImpl` 의 `<CardHeader` 호출 구간만), webapp/src/components/trading/__tests__/card-header.test.tsx:1-125, webapp/src/components/trading/__tests__/strategy-card.test.tsx:28-130 (헬퍼) · 케이스 「limitChasers 에 다른 키 전략이 여럿 있어도 …」, webapp/src/components/trading/__tests__/stock-info-modal.test.tsx:108-125</read_first>
  <behavior>
    - card-header.test.tsx (import 를 `EXCHANGE_SEGMENT_TITLE` 로 바꾸고, 머리 주석 첫 항목을 「거래소 세그먼트는 등록 여부와 무관하게 활성이다 — 토글은 카드가 보는 키의 거래소 축 전환(quick-260923-pgv · D-10 잠금 절 대체). 그룹 `title` 은 전환 설명 한 줄」 로):
      - 「거래소 세그먼트는 언제나 활성 — 고르면 onExchangeChange 로 알리고 그룹 title 은 전환 설명이다」: `renderHeader()` 기본(ledServer null) → KRX/NXT 라디오 둘 다 `not.toBeDisabled()` · 그룹 `not.toHaveAttribute('aria-disabled')` · 그룹 `toHaveAttribute('title', EXCHANGE_SEGMENT_TITLE)` · `EXCHANGE_SEGMENT_TITLE` 이 `'거래소 전환 — 이 종목의 KRX·NXT 전략을 오가며 봐요'` · KRX `aria-checked="true"` · NXT 클릭 → `onExchangeChange('NXT')`.
      - 「등록된 카드(ledServer 있음)에서도 세그먼트가 활성이다 (quick-260923-pgv)」: `renderHeader({ ledServer: echo() })` → 라디오 둘 다 `not.toBeDisabled()` · 항목에 `aria-disabled` 없음 · NXT 클릭 → `onExchangeChange('NXT')` 1회. 옛 「등록된 카드 — … 잠긴다」 케이스는 이것으로 **대체**(삭제).
    - strategy-card.test.tsx:
      - 케이스 「limitChasers 에 다른 키 전략이 여럿 있어도 자기 key 의 것만 읽는다」 끝의 잠김 단언 → 「등록된 카드도 거래소 세그먼트는 활성이다(quick-260923-pgv)」 주석 + 그룹 `not.toHaveAttribute('aria-disabled')`.
      - 새 케이스 「거래소 prop 이 바뀌면 카드는 새 키를 본다 — NXT 전략 없으면 미설정, 있으면 그 전략 · relay 전송 0 (quick-260923-pgv)」: `relay({ limitChasers: [echo(ISIN_A)] })` 로 `<StrategyCard {...baseProps} isin={ISIN_A} exchange="KRX" body={probeBody} />` → `probe-${keyOf(ISIN_A)}` 의 `server-key` = `keyOf(ISIN_A)`. `rerender` 로 `exchange="NXT"`(같은 relay 값) → `cardOf(ISIN_A)` 대신 `document.querySelector('[data-slot="strategy-card"]')` 의 `data-key` = `keyOf(ISIN_A, 'NXT')` · `probe-${keyOf(ISIN_A, 'NXT')}` 의 `server-key` = `'none'` · `unsubscribe` 가 `(ISIN_A, 'KRX')`, `subscribe` 가 `(ISIN_A, 'NXT')` 로 불림 · 헤더 종목명 `title` 이 `… · NXT` 로 끝남. 다시 `rerender` 로 relay 값을 `limitChasers: [echo(ISIN_A), echo(ISIN_A, { exchange: 'NXT' })]` 로 → `server-key` = `keyOf(ISIN_A, 'NXT')`. `rerender` 로 `exchange="KRX"` 되돌림 → `server-key` = `keyOf(ISIN_A)`. 전 과정 `send` `not.toHaveBeenCalled()`(전략 삭제·재등록 없음). `body` 는 `open` 이 참(`baseProps` 기본)일 때만 그려지므로 `baseProps.open` 이 거짓이면 `open` 을 넘긴다.
    - stock-info-modal.test.tsx: 잠금 prop 줄 삭제만 — 케이스 변경 없음(초록 유지).
  </behavior>
  <action>
<!-- planner-discipline-allow: exchangeLocked -->
<!-- planner-discipline-allow: EXCHANGE_LOCKED_TITLE -->
1. **RED** — 위 `<behavior>` 의 card-header.test.tsx 두 케이스와 strategy-card.test.tsx 새 케이스를 먼저 쓰고 파일 단위 vitest 로 실패를 본다(`EXCHANGE_SEGMENT_TITLE` 미존재 = 컴파일 실패도 RED 다).
2. `card-header.tsx`:
   - 머리 주석 ② 를 다시 쓴다: 「② ★ 거래소 세그먼트는 **등록 여부와 무관하게 활성**이다 (quick-260923-pgv · D-10 잠금 절 대체). 토글은 전략 이동이 아니라 카드가 보는 키(`ISIN:계좌:거래소`)의 거래소 축 전환이다 — 새 키의 서버 전략이 있으면 그것을, 없으면 미설정 폼을 보인다. 원래 거래소의 전략은 서버에 그대로 남는다. 더티 값 보호(확인 다이얼로그)와 키 충돌(같은 키 카드로 이동)은 작업대 `changeExchange` 의 몫이다 — 헤더는 고른 값을 알리기만 한다. 그룹 `title` 은 전환 설명 한 줄이다.」
   - `EXCHANGE_LOCKED_TITLE` 상수(및 JSDoc)를 지우고 같은 자리에 `export const EXCHANGE_SEGMENT_TITLE = "거래소 전환 — 이 종목의 KRX·NXT 전략을 오가며 봐요";` + JSDoc 「세그먼트 그룹 `title` — 잠금 사유가 아니라 전환 설명(quick-260923-pgv). 테스트가 같은 상수를 읽는다.」
   - `CardHeaderProps` 의 `exchangeLocked` prop(JSDoc 포함)과 `CardHeader` 구조분해의 `exchangeLocked` 를 지운다.
   - 세그먼트 JSX: 주석의 「★ 잠김 `title` 은 그룹과 항목 양쪽에 건다 — 비활성 항목은 포인터 이벤트를 받지 않아 …」 문단을 「★ `title` 은 그룹에만 건다 — 항목은 활성이라 호버가 항목에서 그룹으로 버블링해 같은 설명을 보인다(항목마다 다시 적지 않는다).」 로 바꾼다. `ToggleGroup` 에서 `disabled={…}` · `aria-disabled={…}` 를 지우고 `title={EXCHANGE_SEGMENT_TITLE}` 로 무조건 건다. `ToggleGroupItem` 에서 `aria-disabled={…}` · `title={…}` 두 줄을 지운다. 「빈 값(`""`)은 무시한다」 문단과 `onValueChange` 가드는 그대로.
3. `strategy-card.tsx`: `StrategyCardProps.exchange` JSDoc 을 「카드의 거래소 — 작업대 카드 집합이 소유한다. 등록 여부와 무관하게 헤더 세그먼트로 바뀐다(quick-260923-pgv) — 바뀌면 이 카드의 키·구독·폼(remount 키에 포함)이 새 거래소를 본다.」 로. `<CardHeader …>` 호출에서 「D-10 — 등록됨 … 잠김」 주석과 `exchangeLocked={server !== null}` 줄을 지운다.
4. `stock-info-modal.test.tsx` `Card` 헬퍼의 `exchangeLocked={false}` 줄을 지운다.
5. **GREEN** — 파일 단위 vitest 3개 초록 + typecheck. 저장소 전체에서 `exchangeLocked` · `EXCHANGE_LOCKED_TITLE` 이 0건인지 확인한다(다른 소비처 없음 — 플래너 grep 확인: stock-info-modal 테스트 1건뿐).
6. 커밋(한글 · `feat(quick-260923-pgv): 카드 헤더 거래소 세그먼트 등록 후 잠금 해제 — 전환 설명 title · 잠금 prop 제거` · 이 5파일만 지정 · Co-Authored-By 금지 · `git add -A` 금지 · `.planning` 미커밋 · push 금지).
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/card-header.test.tsx src/components/trading/__tests__/strategy-card.test.tsx src/components/trading/__tests__/stock-info-modal.test.tsx && ! grep -rq 'exchangeLocked' webapp/src webapp/e2e && ! grep -rq 'EXCHANGE_LOCKED_TITLE' webapp/src webapp/e2e && test "$(grep -c 'export const EXCHANGE_SEGMENT_TITLE' webapp/src/components/trading/card/card-header.tsx)" -eq 1 && test "$(grep -c 'quick-260923-pgv' webapp/src/components/trading/__tests__/strategy-card.test.tsx)" -ge 1</automated>
  </verify>
  <done>헤더 세그먼트가 `ledServer` 유무와 무관하게 활성이고 그룹 `title` 이 `EXCHANGE_SEGMENT_TITLE` 이다. 잠금 prop·잠김 상수가 저장소에서 0건. 카드 테스트가 「거래소 prop 변경 → 새 키(서버 전략 있음/없음) 반영 · 구독 교체 · `send` 0회 · 왕복」 을 잠근다. 세 테스트 파일 초록 · typecheck 0 · 코드 커밋 1건.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 작업대 더티 전환 확인 다이얼로그 + 자동 카드 미재생성·충돌·왕복 vitest + e2e GC3 + 전체 게이트</name>
  <files>webapp/src/components/trading/workbench/trading-workbench.tsx, webapp/src/components/trading/__tests__/trading-workbench.test.tsx, webapp/e2e/specs/trading-workbench.spec.ts</files>
  <read_first>webapp/src/components/trading/workbench/trading-workbench.tsx (머리 주석 ② · `WorkbenchCard` · `changeExchange` · 「더티 합산 · 이탈 경고 (⑦)」 블록 · `closeAsk`~`closeCard` · `closeCopyRef` · 끝의 `<Dialog …workbench-close-confirm>` 구간만 Grep 으로), webapp/src/components/trading/__tests__/trading-workbench.test.tsx:60-260 (스텁·헬퍼) · describe 「등록된 전략과 ?focus=」 안의 거래소 토글 케이스 2개 · describe 「배치 기억 (quick-260923-lyt)」 L1, webapp/e2e/specs/trading-workbench.spec.ts 케이스 GC3 본문</read_first>
  <behavior>
    새 describe 「TradingWorkbench — 거래소 전환: 등록 후 잠금 해제 (quick-260923-pgv)」 · `S = 'KR7005930003'` · `byKey()` = `{ data-key: data-open }` 객체 · `nxt = () => screen.getByRole('button', { name: /NXT$/ })` · 등록 카드는 `relay({ limitChasers: [lc(S, { name: '삼성전자' } as Partial<RelayLimitChaser>)], limitChaserSnapSeq: 1 } as Partial<RelayShape>)`:
    - T1 「더티 0 — 등록 KRX 카드의 NXT 토글은 즉시 키를 바꾸고 카드 id 는 그대로 · 다이얼로그 없음」: 렌더 → `byKey()` = `{ S:ACCOUNT:KRX: 'false' }` → `nxt()` 클릭 → `{ S:ACCOUNT:NXT: 'false' }` · `cardsInDom()` 1장 · `propsOf(S).cardId` 불변 · `screen.queryByTestId('workbench-exchange-confirm')` null.
    - T2 「더티 >0 — 확인 다이얼로그: 취소면 유지, 바꾸기면 전환」: 렌더 → 「삼성전자 더티」 클릭(2) → `nxt()` 클릭 → `getByTestId('workbench-exchange-confirm')` 보임 · 제목 `EXCHANGE_SWITCH_TITLE` · 본문 `exchangeSwitchBody('삼성전자', 2, 'KRX', 'NXT')` = `'삼성전자 의 수정 중인 값 2개가 사라져요. KRX → NXT 로 바꿀까요?'` · 키는 아직 KRX → 「취소」 클릭 → 다이얼로그 사라짐(`waitFor`) · 키 KRX → 다시 `nxt()` → 「바꾸기」 클릭 → 키 NXT · 다이얼로그 사라짐.
    - T3 「자동 카드 — 전환으로 비워진 KRX 키를 다시 만들지 않는다(실측 2026-09-23)」: 렌더 → `nxt()` → `{ NXT: 'false' }` → `mockRelay` 를 같은 목록 새 배열·`limitChaserSnapSeq: 2` 로 `rerender` → 카드 1장 NXT → 목록에 `lc('KR7086520004')` 를 더한 새 배열·snapSeq 3 으로 `rerender` → `{ S:…:NXT: 'false', KR7086520004:…:KRX: 'false' }`(S 의 KRX 카드 없음).
    - T4 「언마운트 → 마운트(배치 기억) — NXT 로 바꾼 카드가 그대로 복원되고 KRX 키 카드는 생기지 않는다」: 렌더 → `nxt()` → `unmount()` → 같은 relay 값으로 다시 렌더 → `{ S:…:NXT: 'false' }` 1장.
    - T5 「충돌 — 같은 키 카드가 있으면 이 카드는 그대로, 그 카드를 펼친다 · 더티가 있어도 다이얼로그 없음」: `limitChasers: [lc(S, {name}), lc(S, { exchange: 'NXT', name })]` 2장 접힘 → KRX 카드의 「삼성전자 더티」 클릭(첫 번째 — `within(cardsInDom()[0])`) → 그 카드의 `nxt()` (`within` 으로 KRX 카드 것) 클릭 → `{ KRX: 'false', NXT: 'true' }` · 2장 · `queryByTestId('workbench-exchange-confirm')` null.
    - T6 「왕복 — NXT 로 갔다가 KRX 로 돌아오면 같은 카드 id 가 KRX 키를 본다」: 렌더 → `nxt()` → `act(() => (cardProps.get(id).onExchangeChange)(id, 'KRX'))` → `{ S:…:KRX: 'false' }` · 같은 id.
    - 기존 케이스 「등록 전 카드의 거래소 토글이 다른 카드의 키와 같아지면 …」 · 「충돌이 없으면 등록 전 카드의 거래소 토글은 그대로 키를 바꾼다 …」 · lyt L1 은 **무수정 초록**.
  </behavior>
  <action>
1. **RED** — 위 6케이스를 먼저 쓴다(import 블록에 `EXCHANGE_SWITCH_TITLE, exchangeSwitchBody` 를 `'../workbench/trading-workbench'` 에서 더한다 — 미존재 = RED). 실행 원문: `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/trading-workbench.test.tsx`.
2. `trading-workbench.tsx` 문구 상수 — 파일 상단 `CLOSE_*` 상수 옆에 `export const EXCHANGE_SWITCH_TITLE = "수정 중인 값이 사라져요";` 와 `export function exchangeSwitchBody(name: string, count: number, from: RelayExchange, to: RelayExchange): string` (반환 `${name} 의 수정 중인 값 ${count}개가 사라져요. ${from} → ${to} 로 바꿀까요?`). JSDoc 「거래소 전환 확인(quick-260923-pgv · 설계 항목 2) — 전환은 폼 remount 라 미전송 더티 값이 사라진다. 테스트가 같은 상수·함수를 읽는다.」
3. `changeExchange` 를 **충돌 → 더티 → 적용** 3단으로 바꾼다. 「더티 합산 · 이탈 경고 (⑦)」 블록(`cardDirty` · `reportDirty`)을 `changeExchange` **위로** 올리고(선언 순서 — 콜백이 ref 를 읽는다), `cardDirty` 바로 아래에 `registeredRef` 와 같은 패턴으로 `const cardDirtyRef = useRef(cardDirty); cardDirtyRef.current = cardDirty;` 를 둔다. 기존 두 번째 `setCards`(exchange 교체 · `prev.some(c => c.id !== id && keyOf(c) === nextKey) ? prev : prev.map(...)`)를 `const applyExchange = useCallback((id, exchange) => …, [])` 로 빼되 `nextKey` 는 업데이터 안에서 `prev.find(c => c.id === id)` 로 다시 계산한다(없으면 `prev`). `changeExchange`(deps `[applyExchange]`): 카드 없음 → return · `card.exchange === exchange` → return(방어) · 충돌(`clash`) → 기존대로 `withCardOpen(prev, clash.id, true)` + `setScrollTarget({ key: nextKey })` 후 return · `(cardDirtyRef.current[id] ?? 0) > 0` → `setExchangeAsk({ id, exchange })` 후 return · 아니면 `applyExchange(id, exchange)`. 주석을 「거래소 토글(등록 여부 무관 · quick-260923-pgv · 설계 항목 1~3) — 전략 이동이 아니라 이 카드가 보는 키의 거래소 축 전환이다. ① 바꾼 뒤의 키를 다른 카드가 이미 쓰면 이 카드는 그대로 두고 그 카드를 펼쳐 스크롤한다(T-18-94 — 두 카드 한 키 금지). 충돌이 먼저다: 이 카드 값이 사라지지 않으니 물을 것이 없다. ② 미전송 더티 값이 있으면 확인 뒤(폼 remount 로 값이 사라진다). ③ 더티 0 이면 즉시.」 로 바꾼다.
4. 확인 다이얼로그 — ✕ 다이얼로그(`closeAsk` · `closeCopyRef` · `<Dialog …workbench-close-confirm>`)와 **같은 문법**으로: `const [exchangeAsk, setExchangeAsk] = useState<{ id: string; exchange: RelayExchange } | null>(null)` · 렌더에서 `exchangeAskCard = exchangeAsk === null ? null : cards.find(c => c.id === exchangeAsk.id) ?? null` · 문구 입력(종목명 = `renderCard` 와 같은 식 `card.name ?? labels.get(card.isin)?.name ?? ""` 이 빈 문자열이면 ISIN · 개수 = `cardDirty[id] ?? 0` · from = `card.exchange` · to = `exchangeAsk.exchange`)을 `exchangeCopyRef` 에 붙들어 닫히는 애니메이션 동안 문구가 비지 않게 한다. JSX 는 ✕ 다이얼로그 **바로 뒤**에 `<Dialog open={exchangeAskCard !== null} onOpenChange={(open) => { if (!open) setExchangeAsk(null); }}><DialogContent data-testid="workbench-exchange-confirm"><DialogHeader><DialogTitle>{EXCHANGE_SWITCH_TITLE}</DialogTitle><DialogDescription>{exchangeSwitchBody(…)}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setExchangeAsk(null)}>취소</Button><Button onClick={() => { if (exchangeAskCard !== null) applyExchange(exchangeAskCard.id, exchangeAsk.exchange); setExchangeAsk(null); }}>바꾸기</Button></DialogFooter></DialogContent></Dialog>`. `onCloseAutoFocus` 는 두지 않는다(카드 헤더가 남아 포커스가 세그먼트로 돌아간다).
5. 주석 갱신: 머리 주석 ② 의 「등록 전 카드는 거래소 토글로 키가 바뀌므로」 와 `WorkbenchCard.id` JSDoc 의 「(등록 전 카드는 키가 바뀐다)」 를 「등록 여부와 무관하게 거래소 토글로 키가 바뀌므로(quick-260923-pgv)」 로. 머리 주석 ② 끝에 한 문단: 「★ 거래소 전환과 자동 카드(quick-260923-pgv) — 등록 KRX 카드를 NXT 로 바꾸면 KRX 키 카드가 사라지지만 `seenKeys` 가 멤버십 ref 라 그 키는 다시 `fresh` 가 되지 않고, 리마운트는 lyt `restoreSavedCards` 의 `seen` 이 막는다 — 한 종목 카드 하나에서 거래소를 오간다. 배치 기억 없는 첫 방문은 등록 전략마다 카드가 생기는 기존 동작 그대로다.」 등록 전략 자동 카드 효과 · `restoreSavedCards` · `closeCard` · `orderLocks` 판정은 **코드 변경 0**(설계 항목 4 · 6).
6. **GREEN** — 작업대 테스트 파일 초록 + typecheck.
7. e2e `trading-workbench.spec.ts` GC3: 마지막 `title` 단언 **뒤**에 주석 `// quick-260923-pgv — 등록 카드도 세그먼트가 활성 · 충돌(NXT 카드 있음)이면 이 카드는 그대로, 그 카드가 펼쳐진다.` 와 3단언: `const krxNxtRadio = cardByKey(page, STRATEGY_KEY).locator('[data-slot="card-exchange-segment"]').getByRole('radio', { name: 'NXT' });` → `await expect(krxNxtRadio).toBeEnabled();` → `await krxNxtRadio.click();` → `await expect(cardByKey(page, STRATEGY_KEY)).toHaveCount(1);`(KRX 카드 키 불변) · `await expect(cardByKey(page, nxtKey)).toHaveAttribute('data-open', 'true');` · `await expect(cards(page)).toHaveCount(2);`. 케이스 끝 상태(카드 2장 · NXT 펼침)는 이전과 같다.
8. 전체 게이트: `pnpm --filter @gh-radar/webapp run typecheck`(e2e tsconfig 포함) · `pnpm --filter @gh-radar/webapp run test` 전량 · `cd webapp && pnpm exec playwright test trading-workbench`(0 fail). Playwright 가 환경(relay 8090 픽스처 · dev 3100) 문제로 돌지 못하면 원인 로그를 SUMMARY 에 적고 멈춘다 — 통과로 적지 않는다.
9. 커밋 2건(한글 · Co-Authored-By 금지 · `git add -A` 금지 · 파일 지정 · `.planning` 미커밋 · push 금지): `feat(quick-260923-pgv): 작업대 거래소 전환 — 충돌→더티 확인→적용 3단 · 확인 다이얼로그 · 자동 카드 미재생성 잠금 테스트`(tsx + test) · `test(quick-260923-pgv): e2e GC3 등록 카드 세그먼트 활성 + 충돌 이동 단언`(spec). SUMMARY 에 「D-10 잠금 절 · 이연 항목 「등록된 상따 전략의 거래소 변경」 을 이 quick 이 대체(18-CONTEXT.md 는 역사 기록으로 미편집)」 와 실측 결과(설계 항목 4)를 적는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test && test "$(grep -c 'workbench-exchange-confirm' webapp/src/components/trading/workbench/trading-workbench.tsx)" -ge 1 && test "$(grep -c 'export function exchangeSwitchBody' webapp/src/components/trading/workbench/trading-workbench.tsx)" -eq 1 && test "$(grep -c 'export const EXCHANGE_SWITCH_TITLE' webapp/src/components/trading/workbench/trading-workbench.tsx)" -eq 1 && test "$(grep -c 'quick-260923-pgv' webapp/src/components/trading/__tests__/trading-workbench.test.tsx)" -ge 1 && test "$(grep -c 'quick-260923-pgv' webapp/e2e/specs/trading-workbench.spec.ts)" -ge 1 && git diff --quiet HEAD -- relay packages/shared pnpm-lock.yaml && cd webapp && pnpm exec playwright test trading-workbench</automated>
  </verify>
  <done>`changeExchange` 가 충돌→더티→적용 순으로 판정하고, 더티면 `workbench-exchange-confirm` 다이얼로그(「취소」 유지 · 「바꾸기」 전환)가 선다. 작업대 6케이스(즉시 · 확인/취소 · 자동 카드 미재생성 · 리마운트 · 충돌 · 왕복)와 기존 거래소·lyt 케이스가 초록. e2e GC3 가 실브라우저에서 등록 카드 세그먼트 활성 + 충돌 이동을 잠근다. typecheck 0 · webapp vitest 전량 초록 · Playwright `trading-workbench` 0 fail · relay/shared/lockfile diff 0. 코드 커밋 2건, push 없음.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 사용자 입력(폼 더티 값) → 카드 상태 | 미전송 값은 브라우저 메모리에만 있다 — 전환 remount 가 지운다 |
| 카드 집합(작업대) → 전략 키 | 두 카드가 한 키를 보면 에코 상관·더티 판정이 갈라진다(T-18-94) |
| 브라우저 → relay | 이 quick 은 relay 로 아무것도 보내지 않아야 한다(전략 삭제·재등록 금지) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-pgv-01 | Tampering(사용자 입력 유실) | `changeExchange` → `LimitChaserForm` remount | high | mitigate | 더티 >0 이면 `workbench-exchange-confirm` 확인 뒤에만 `applyExchange` · 취소면 키·값 유지(T2) · 더티 0 은 즉시(T1) |
| T-pgv-02 | Repudiation/Integrity(두 카드 한 키) | `changeExchange` 충돌 분기 | high | mitigate | 충돌 판정을 더티 판정보다 먼저 · `withCardOpen` 으로 기존 카드 펼침 · 이 카드 불변(T5 · e2e GC3) |
| T-pgv-03 | Information(토글을 전략 이동으로 오인) | 카드 헤더 세그먼트 · relay 전송 | medium | mitigate | 그룹 `title` 전환 설명 · 종목명 `title`/`data-key` 가 새 거래소를 말함 · 카드 테스트가 `send` 0회를 잠금(전략 삭제·재등록 없음) |
| T-pgv-04 | Elevation(잠금 우회 — 결과 모름 키) | `relay.orderLocks` · `closeCard` | low | accept | 잠금은 거래소별 키(quick-260922-uhw)라 전환이 잠금을 건드리지 않음 · 판정 코드 변경 0(설계 항목 6). 전환 뒤 ✕ 는 현재 키로만 잠금을 보는 기존 계약 그대로 — 변경 범위 밖(SUMMARY 에 관찰만 기록) |
| T-pgv-SC | Tampering | npm 설치 | low | accept | 이 quick 은 패키지 설치 0 — `git diff --quiet HEAD -- pnpm-lock.yaml` 게이트 |
</threat_model>

<verification>
- Task 1: 헤더·카드·종목정보 테스트 3파일 초록 · typecheck 0 · 잠금 prop/상수 저장소 0건 · `EXCHANGE_SEGMENT_TITLE` export 1건.
- Task 2: webapp vitest 전량 초록(작업대 새 6케이스 + 기존 거래소 2케이스 + lyt L1 무수정) · typecheck 0 · Playwright `trading-workbench` 0 fail · relay/shared/lockfile diff 0.
- 수동(집행자가 SUMMARY 에 한 줄): 등록 KRX 카드에서 NXT 를 누르면 사이드바 KRX 항목이 그대로 남고(전략 미삭제) 카드 `data-key` 가 NXT 로 바뀐다.
</verification>

<success_criteria>
- 등록된 카드에서 KRX|NXT 세그먼트가 활성이고 클릭이 `onExchangeChange` 를 부른다(설계 항목 1 · 5).
- 더티 0 즉시 전환 / 더티 >0 다이얼로그 → 확인 전환 · 취소 유지(설계 항목 2).
- 전환 뒤 카드가 새 키의 서버 전략(있음/없음)을 반영하고 relay 전송 0(설계 항목 1).
- 등록 전략 자동 카드가 전환으로 비워진 키를 다시 만들지 않음 — 실측 근거 + 잠금 테스트(설계 항목 4).
- 키 충돌 이동 유지(설계 항목 3) · 결과 모름 잠금 코드 변경 0(설계 항목 6).
- 기존 잠금 단언이 새 계약으로 갱신되고 게이트 3종 초록(PGV-C).
</success_criteria>

<output>
Create `.planning/quick/260923-pgv-wb-exchange-toggle-krx-nxt-d-10/260923-pgv-SUMMARY.md` when done (`.planning` 은 커밋하지 않는다).
</output>
