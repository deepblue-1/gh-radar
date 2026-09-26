---
phase: quick-260926-s5v
plan: 01
subsystem: webapp/trading (돌파감지 스트립 · 작업대 · 이벤트 알림)
status: complete
tags: [breakout, rate-cross, nxt, gh-trade-parity, toast]
requires: [quick-260926-rcc]
provides:
  - openBreakoutCard (돌파 행 → 발화 거래소 카드 생성/재사용·전환)
  - sameCrossInterval (above 구간 동일성 단일 정의)
  - BreakoutStrip onRowsAdded (새 비무음 행 신호)
  - useTradingAlerts notifyBreakouts
affects: [trading-workbench, breakout-strip, use-trading-alerts, trading-alerts, breakout-list]
tech-stack:
  added: []
  patterns: [커밋된 이탈 삭제 키 집합을 상태로 미러해 구독 후보에서 제외, 스트립 새 행 신호 → 토스트]
key-files:
  created: []
  modified:
    - webapp/src/components/trading/workbench/breakout-strip.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/lib/breakout-list.ts
    - webapp/src/lib/use-trading-alerts.ts
    - webapp/src/lib/trading-alerts.ts
    - webapp/src/components/trading/__tests__/breakout-strip.test.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/src/lib/__tests__/breakout-list.test.ts
    - webapp/src/lib/__tests__/use-trading-alerts.test.tsx
    - webapp/src/lib/__tests__/trading-alerts.test.ts
decisions:
  - "돌파 행 경로만 발화 거래소로 카드를 연다 — 요청 거래소는 exchangeChoicesOf(isin, KRX, nxtTradable) 로 거르고(미거래 확정이면 무시 → KRX), 기존 카드는 발화 거래소 키 카드를 펼치거나 changeExchange 로 전환한다(충돌·더티 규칙 재사용)"
  - "이탈로 지운 행은 (돌파시각, 발화 거래소)가 바뀐 새 구간 원소가 올 때만 새 행으로 되살린다 — 재접속 78 의 relay 캐시 재전송(같은 구간)은 되살리지 않는다"
  - "돌파 토스트는 스트립의 새 비무음 행 신호(onRowsAdded)로만 — 알림음은 종목당 하루 1회 그대로"
metrics:
  duration: "약 25분"
  completed: 2026-09-26
actuals:
  tokens: 11951
  tasks: 3
  commits: 4
plan_head_before: 30b612b410588e8d4a07c191e7577d31bcc5584a
---

# Quick 260926-s5v: 돌파 행 → 발화 거래소 카드 · 이탈 뒤 재돌파 = 새 행 Summary

돌파 행을 누르면 카드가 행의 발화 거래소(NXT 미거래 확정이면 KRX)로 열린다. 이미 있는 카드는 발화 거래소 키 카드를 펼치거나, 기존 거래소 전환 규칙(충돌·더티 확인)으로 맞춘다. 이탈로 지운 행은 지워진 동안 구독이 풀린다. 새 above 구간이 오면 새 행(신규 강조 · 새 돌파시각 · 유예 재시작 · 무음)으로 다시 오르고, 「돌파 목록에 추가됐어요」 토스트도 같은 축으로 다시 뜬다. gh-trade 클라 동작과 같게 맞췄다.

## 커밋

| Task | 커밋 | 내용 | 파일 |
|------|------|------|------|
| 1 (tracer) | `0c882544` | 돌파 행 → 카드를 발화 거래소로 · 기존 카드 전환 · NXT 미거래 요청 무시 | breakout-strip.tsx · trading-workbench.tsx · 두 테스트 |
| 2 | `a551023c` | sameCrossInterval · 새 구간 재돌파 = 새 행 · 지운 동안 구독 해제 · onRowsAdded | breakout-list.ts(+test) · breakout-strip.tsx(+test) |
| 3 | `d28ac2d1` | 돌파 토스트를 스트립 새 행 신호로(notifyBreakouts) · newRateCrossAlerts 제거 | use-trading-alerts.ts · trading-alerts.ts · trading-workbench.tsx · 세 테스트 |

- 모든 커밋은 `git commit --only -- <명시 경로>` 로 만들었다. 커밋마다 `git show --stat HEAD` 로 그 태스크 파일만 담긴 것을 확인했다. Co-Authored-By 없음.
- `actuals.commits: 4` 는 `git rev-list --count 30b612b4..HEAD` 로 잰 값이다. 이 안에 다른 세션의 커밋 `b0418d9d feat(21-32)` 1건이 끼어 있다(Task 2 와 Task 3 사이). 이 plan 의 커밋은 3건이다.

## gh-trade 대응 (mirror 한 동작 · file:line)

| gh-trade | gh-radar |
|----------|----------|
| `client/Forms/Trading/RateCrossListForm.cs:517-533` `Grid_CellDoubleClick` → `OpenLimitChaserForm(code, null, row.CrossExchange)`(:532) | `breakout-strip.tsx` `activate` 가 `onAddCard(isin, name, code, row.exchange)` / `onFocusCard(isin, row.exchange)` 를 부른다 |
| `client/Services/FormManager.cs:126-135` 같은 종목 창 재사용 + `existing.SelectExchange`(:133) | `trading-workbench.tsx` `openBreakoutCard` R3 — 발화 거래소 키 카드가 있으면 펼치고(펼친 것 우선), 없으면 `isinFocusCardOf` 카드를 펼친 뒤 `changeExchange` |
| `client/Services/FormManager.cs:141-148` 새 창 + 거래소 보관 | `openBreakoutCard` R2 — 새 카드 `exchange: want ?? "KRX"` |
| `client/Services/FormManager.cs:96-101` 거래소 모르는 호출부 = KRX | `addCard` · `pickHolding` · StockAddBar 는 손대지 않았다(KRX) |
| `client/Forms/Trading/LimitChaserForm.cs:664-686` `ApplySeededExchange` — 같은 거래소면 무동작(:671), 비활성 라디오 요청은 무시(:676-681) | R1 `exchangeChoicesOf(isin, "KRX", nxtTradable)` 에 없으면 `want = null` → 새 카드는 KRX, 기존 카드는 펼치기만 |
| `client/Services/DMA/RateCrossWatchList.cs:1026-1034` `RemoveRow` + `ReleaseRow`(:1052-1061) | 구독 후보에서 이탈로 지운 행(같은 구간)과 ✕ 지운 종목을 뺀다 → `useBreakoutQuotes` 가 그 피드를 해제한다 |
| `RateCrossWatchList.cs:652` 새 76 → `AddNewRow`(:741-764 — 새 돌파시각 · Armed false · Highlighted · 맨 위) | `advanceTracked` 가 되살린 키의 옛 meta·firstTime 을 버리고 새로 등재한다(addedAt·feedSince 지금 · armed false · 76 이면 30초 강조) |
| `RateCrossWatchList.cs:639·672·675` 소리는 그날 첫 돌파만 · 재돌파 무음 | 알림음 effect(④)는 바꾸지 않았다 — 「오늘 울린 종목」(ISIN)이 이미 막는다 |
| `RateCrossWatchList.cs:662` `RaiseRowAdded` → `RateCrossListForm.cs:406-422` `OnRowAdded` | `BreakoutStrip onRowsAdded` → `useTradingAlerts.notifyBreakouts` → 「돌파 목록에 추가됐어요」 토스트 |
| `RateCrossWatchList.cs:723-732` 보이는 행 76 = 자리유지 갱신 · RowAdded 없음 | 보이는 행 재알림·발화 거래소 전환은 새 행 신호가 없다(S-A2) |
| `RateCrossWatchList.cs:785-846` 78 의 없던 종목 = 무음·무강조 · RowAdded 없음(:824) | 78(snapSeq 증가)의 새 구간 원소는 무음·무강조 새 행이고 토스트가 없다(S-R4) |
| `docs/features/rate-cross-alert.md:64-66` 서버 구간 식별자 crossTime·crossExchange | `breakout-list.ts` `sameCrossInterval(a, b)` |

## 유지한 의도적 차이

- **D-07** — 칩·행에 거래소 문자열이 없다. 스트립 코드 줄의 `'KRX'`/`'NXT'` 리터럴은 0건이다(grep 확인).
- **D-18** — 깜박임 없이 30초 연노랑 + 「신규」 배지를 쓴다. ✕ 로 지운 종목은 그날 재돌파에도 나오지 않고 토스트도 없다(S-A3).
- **D-17** — 알림음은 토글 기본 꺼짐이고 /trading 화면 기준이다. 하루 1회 규칙은 같다.
- **D-14** — relay 정렬을 그대로 쓰고 78 은 전량 교체다. 보이는 행의 재알림 76 이 relay 정렬상 맨 위로 가는 것은 범위 밖이다.
- **quick-260914-hxa** — 카드가 있는 종목은 행을 숨기지 않고 「거래중」 표식만 단다.
- **quick-260923-pgv** — 돌파 경로 전환도 미전송 더티 확인 다이얼로그를 탄다(W4). gh-trade `SelectExchange` 는 라디오만 바꾼다.
- **토스트 클릭 경로(`openAlert` · `cardForAlert`)** — 카드가 있으면 전환하지 않는다. 이번 범위 밖이다.

## 갱신한 기존 테스트와 이유

- `breakout-strip.test.tsx` 「칩 클릭은 onAddCard…」 · 「이미 카드가 있는 종목은 onFocusCard…」 · 「이름 없는 행 (D-30)」 — 콜백 시그니처에 거래소 인자가 붙었다(넷째 인자 / 둘째 인자 `'KRX'`).
- `use-trading-alerts.test.tsx` — 훅 입력에서 `rateCrossItems`·`rateCrossSnapSeq` 가 빠졌다. `Input`/`base()` 를 고쳤고, 마운트 무알림 케이스의 제목과 인자에서 rateCross 를 뺐다. 「돌파 76/78」 케이스는 H1·H2 로 바꿨다.
- `trading-alerts.test.ts` — `newRateCrossAlerts` describe 를 지웠다. 함수가 없어졌기 때문이다. 그 B7 의미(거래소만 바뀐 76 은 새 알림이 아님)는 스트립 축의 S-A2 가 지킨다.

## 신규 테스트

- 스트립: NXT 행 → `onAddCard(…, 'NXT')`(칩 · 「추가」) · 카드 있는 NXT 행 → `onFocusCard(isin, 'NXT')`.
- 작업대 describe 「돌파 행 → 카드 거래소 (quick-260926-s5v)」 W1~W6 — NXT 카드 생성 · nxtTradable 빈 집합이면 KRX, 집합에 있으면 NXT · KRX 카드 → NXT 전환(같은 id) · 더티 확인 다이얼로그 · KRX·NXT 두 카드 중 NXT 펼침과 스크롤 · NXT 카드 → KRX 전환.
- breakout-list: `sameCrossInterval` 3건(L1).
- 스트립 describe 「이탈 뒤 재돌파 = 새 행 (quick-260926-s5v)」 S-R1~S-R5 · S-A1~S-A3.
- 훅: H1 · H2. 작업대 이벤트 알림 describe 에 W-T1(첫 채움 0 · 76 새 종목 1 · 78 새 종목 0).

## 검증 결과

- Task 1: 대상 2파일 161/161 통과 · typecheck 통과 · 스트립 거래소 리터럴 0.
- Task 2: breakout-list · breakout-strip · use-breakout-quotes 100/100 통과. 작업대까지 포함한 4파일은 223/223 · typecheck 통과 · 리터럴 0.
- Task 3: 대상 4파일 215/215 통과 · typecheck(`tsc --noEmit && tsc -p tsconfig.e2e.json`) 통과.
- **최종 전량** `pnpm --filter @gh-radar/webapp run test`: Test Files 125 passed · Tests 2434 passed · 1 skipped. 건너뛴 1건은 이 plan 이전부터 있던 것이다. 이 plan 밖 파일의 실패는 없다.
- **Playwright `trading-workbench` 미실행 — 포트 점유.** `lsof -iTCP:3100` 에 node(pid 97752)가 LISTEN 중이었다. 프로세스는 건드리지 않았다. 8090 은 비어 있었다.
- TDD 기록: Task 1·2 는 RED(각 11건 · 9건 실패)를 먼저 확인한 뒤 구현했다. Task 3 은 테스트와 구현을 한 단계에서 작성했고 RED 를 따로 돌리지 않았다. H1·H2 는 `notifyBreakouts` 가 없으면 실패하는 테스트다. W-T1 은 동작 보존 테스트라 구현 전에도 통과한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 구독 후보의 「커밋된 이탈 삭제」를 ref 대신 상태로 미러**
- **발견 시점:** Task 2
- **문제:** 계획은 구독 후보를 `committedRef.current.removed`(ref)로 거르게 되어 있었다. 그런데 행 삭제는 렌더 N 에서 계산되어 레이아웃 effect 에서 커밋된다. 그 뒤 다른 렌더(강조 tick · 가격 · 입력)가 오지 않으면 구독 후보가 다시 계산되지 않고, 그래서 구독이 풀리지 않는다. 무음 행은 tick 이 없어서 실제로 이런 일이 생길 수 있다.
- **수정:** `committedRemoved` 상태를 두었다. 레이아웃 effect 가 **키 집합이 바뀐 커밋에서만** 이 상태를 갱신한다. 비교는 직전 커밋 ref 로 먼저 해서, 가격 스텝(≤5Hz)마다 업데이트를 예약하지 않는다. 후보 useMemo 는 이 상태와 `dismissed` 에 의존한다.
- **파일:** `webapp/src/components/trading/workbench/breakout-strip.tsx`
- **커밋:** `a551023c`

**2. [계획 보완] 스트립 어댑터 이름**
- 계획의 「안정 어댑터 둘」은 `addBreakoutCard` · `focusBreakoutCard` 라는 이름으로 만들었다. 동작은 계획과 같다.

## 다른 세션 파일 관련 기록

- 실행 중 다른 세션이 `webapp/src/components/trading/me-client.tsx` · `strategy-status-card.tsx` · `.planning/state.json` · `tasks/lessons.md` 를 수정하고 있었고, `b0418d9d` 를 커밋했다. 이 파일들은 건드리지 않았고 스테이징하지도 않았다.
- 이 plan 의 대상 파일에는 다른 세션의 미커밋 hunk 가 없었다(커밋 전 `git diff --stat` 로 확인). 섞인 커밋은 없다.

## 배포 순서

s5v 는 webapp 전용이다. relay · server · gh-trade 는 바꾸지 않았다. 앞선 rcc 커밋들이 아직 push 되지 않았으므로 rcc 배포 순서(relay 먼저 → `/healthz` 검증 → push)를 그대로 따른다. push 가 곧 webapp 프로덕션 배포다. **이번 실행에서는 push 와 배포를 하지 않았다**(`git status -sb`: master…origin/master ahead 50).

## Known Stubs

없음.

## Threat Flags

없음. 새 네트워크 표면이 없고 서버 송신도 0 이다. 카드 생성과 전환은 클라 상태다.

## Self-Check: PASSED

- 커밋 `0c882544` · `a551023c` · `d28ac2d1` 이 존재한다(`git log` 확인).
- 수정 파일 10개가 존재하고 각 태스크 커밋에 들어 있다.
