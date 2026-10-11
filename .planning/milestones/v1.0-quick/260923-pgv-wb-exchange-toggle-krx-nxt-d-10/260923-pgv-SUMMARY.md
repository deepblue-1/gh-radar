---
phase: quick-260923-pgv
plan: 01
subsystem: webapp/trading-workbench
tags: [trading, workbench, exchange-toggle, krx, nxt, d-10]
status: complete
requires: [quick-260923-p3k (withCardOpen), quick-260923-pgu (알림 배선)]
provides:
  - 등록 후에도 활성인 카드 헤더 KRX|NXT 세그먼트 (EXCHANGE_SEGMENT_TITLE)
  - 작업대 changeExchange 충돌→더티 확인→적용 3단 + workbench-exchange-confirm 다이얼로그
  - 카드 ✕ 결과 모름 판정의 KRX·NXT 두 키 확장 + 「잠긴 거래소: …」 표시
affects: [card-header, strategy-card, trading-workbench, e2e GC3]
key-files:
  modified:
    - webapp/src/components/trading/card/card-header.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/__tests__/card-header.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx
    - webapp/src/components/trading/__tests__/stock-info-modal.test.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
decisions:
  - 거래소 토글은 전략 이동이 아니라 카드가 보는 키의 거래소 축 전환이다 — 등록 여부와 무관하게 활성 (D-10 잠금 절 · 이연 항목 대체)
  - 충돌 판정이 더티 판정보다 먼저다 — 충돌이면 이 카드 값이 사라지지 않으니 묻지 않는다
  - 카드 ✕ 결과 모름 판정은 카드 계좌·ISIN 의 KRX·NXT 두 키를 OR 한다 — 잠금 자체(요청의 키 · 앱 수명)는 그대로
metrics:
  completed: 2026-09-23
  duration: 약 12분
plan_head_before: a532eff
actuals:
  tokens: 11315
  tasks: 2
  commits: 3
---

# Quick 260923-pgv: 작업대 거래소 토글 — 등록 후 잠금 해제 Summary

등록된 전략 카드에서도 헤더 KRX|NXT 세그먼트가 활성이고, 누르면 카드가 보는 전략 키의 거래소 축만 바뀐다(원래 거래소 전략은 서버에 그대로 · relay 전송 0). 미전송 더티 값이 있으면 확인 다이얼로그를 거치고, 바꾼 키를 다른 카드가 쓰면 그 카드를 펼친다. 카드 ✕ 의 「결과 모름」 판정은 두 거래소 키를 모두 본다.

## D-10 대체 기록

**Phase 18 D-10 의 「등록 뒤 거래소 잠김」 절과 이연 항목 「등록된 상따 전략의 거래소 변경(삭제+재등록)」 을 이 quick 이 대체한다** (사용자 결정 2026-09-23). 18-CONTEXT.md 는 역사 기록이라 편집하지 않았다. 대체 방식은 삭제+재등록이 아니라 **키 전환**이다. 전략을 옮기지 않고, 카드가 `ISIN:계좌:NXT` 키를 보게 할 뿐이다.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 | 285f3b3 | 카드 헤더 거래소 세그먼트 등록 후 잠금 해제 — 전환 설명 title · 잠금 prop 제거 |
| 2 | 1883e28 | 작업대 거래소 전환: 충돌→더티 확인→적용 3단 · 확인 다이얼로그 · ✕ 두 키 판정 · 자동 카드 미재생성 잠금 테스트 |
| 2 | 86a2fa2 | e2e GC3 등록 카드 세그먼트 활성 + 충돌 이동 단언 |

push 하지 않았다. `.planning/**` 는 커밋하지 않았다.

## 구현 요약

- **card-header.tsx**: `EXCHANGE_LOCKED_TITLE`·`exchangeLocked` prop 을 없앴다. `export const EXCHANGE_SEGMENT_TITLE = "거래소 전환 — 이 종목의 KRX·NXT 전략을 오가며 봐요"` 를 그룹 `title` 에 항상 건다. 항목의 `aria-disabled`/`title` 도 지웠다. 머리 주석 ② 는 새로 썼다.
- **strategy-card.tsx**: `exchangeLocked={server !== null}` 배선을 지우고 `exchange` JSDoc 을 갱신했다. 키·구독·폼 remount 는 기존 미등록 카드 경로를 그대로 쓴다(새 코드 0).
- **trading-workbench.tsx**:
  - 더티 블록(⑦)을 `changeExchange` 위로 올리고 `cardDirtyRef` 를 추가했다.
  - `applyExchange` 는 업데이터 안에서 다시 계산한다.
  - `changeExchange` 판정 순서: 같은 거래소면 무시 → 키 충돌(`withCardOpen`+스크롤) → 더티(`setExchangeAsk`) → 즉시 적용.
  - `EXCHANGE_SWITCH_TITLE`·`exchangeSwitchBody` 를 추가했다. `workbench-exchange-confirm` 다이얼로그는 ✕ 다이얼로그와 같은 문법이고, 닫히는 동안 `exchangeCopyRef` 로 문구를 고정한다.
  - 머리 주석 ②·⑧ 과 `WorkbenchCard.id` JSDoc 을 갱신했다.
- **자동 카드 미재생성(설계 항목 4)**: 작업대 자동 카드 로직은 **코드 변경 0**이다. 실측 결과 `seenKeys` 멤버십 ref 가 전환으로 비워진 KRX 키를 다시 `fresh` 로 만들지 않았다. 리마운트는 lyt `restoreSavedCards` 의 `seen` 이 막았다. T3·T4 가 이 동작을 잠근다.

## Deviations from Plan

### 오케스트레이터 승인 이탈

**1. [승인 이탈 · T-pgv-04 관찰 → 수정 승격] 카드 ✕ 결과 모름 판정을 KRX·NXT 두 키로 확장**
- **문제**: 거래소 전환이 자유로워지면서 빈틈이 생겼다. KRX 키에 잠금이 있는 카드를 NXT 로 바꾼 뒤 ✕ 를 누르면, 현재 키(NXT)만 보는 판정이라 경고 없이 닫혔다.
- **수정**:
  - `lockedExchangesOf(locks, card)` 가 카드 계좌·ISIN 의 KRX·NXT 두 키를 OR 로 본다. 계좌가 비었으면 `[]` 이다.
  - `closeAsk` 가 `lockedExchanges` 를 들고, unknown 다이얼로그에 `closeLockedExchangesLine` 한 줄을 붙인다(「잠긴 거래소: KRX」 / 「잠긴 거래소: KRX · NXT」 · `data-slot="close-locked-exchanges"`).
  - `DialogContent` 에 `data-locked-exchanges` 속성을 달았다.
  - 잠금 자체(RelayProvider 의 요청 키 · 앱 수명)와 `relay.orderLocks` 는 그대로다.
- **테스트**:
  - 신규 ⑦-e: NXT 로 바꾼 뒤 ✕ 를 누르면 「잠긴 거래소: KRX」 unknown 이 뜬다. 잠금 Map 은 동일하고 송신은 0이다.
  - 신규 ⑦-f: 두 키가 다 잠기면 「KRX · NXT」 이다.
- **기존 계약 변경(명시)**: quick-260922-uhw 가 잠근 두 케이스를 새 계약으로 뒤집었다.
  - ⑦ 「같은 ISIN 다른 거래소(NXT) 잠금은 이 카드 ✕ 에 영향 없다」: KRX 카드가 이제 unknown(잠긴 거래소 NXT + 등록 전략 문장)이다. 다른 계좌 키 잠금은 여전히 섞이지 않는다(`data-locked-exchanges="NXT"` 로 확인).
  - ⑦-b 「NXT 키만 잠기면 KRX 미등록 카드는 즉시 닫힌다」: 이제 「잠긴 거래소: NXT」 unknown 다이얼로그를 거쳐 닫힌다.
  - 옆 카드(같은 종목 NXT 카드)가 그 잠금을 보여 주고 있어도 KRX 카드 ✕ 가 경고한다. 오케스트레이터 지시(단순 OR)를 따른 결과다.
- **파일**: trading-workbench.tsx, trading-workbench.test.tsx (커밋 1883e28)

### 자동 수정

**2. [Rule 1 - 정리] strategy-card.tsx 구조분해의 미사용 `server` 제거**
- 플랜은 「`server` 는 다른 곳에서 계속 쓴다(구조분해 유지)」 고 적었지만, `StrategyCardImpl` 안에서는 `exchangeLocked` 가 유일한 사용처였다. 미사용 변수를 남기지 않으려고 구조분해에서 뺐다. 훅 내부의 `server` 는 그대로다. (285f3b3)

**3. [강화] e2e GC3 — 충돌 클릭 전에 NXT 카드를 먼저 접는다**
- 플랜 원문대로면 사이드바 클릭으로 NXT 카드가 이미 펼쳐져 있다. 그러면 「충돌 → NXT 카드 펼침」 단언이 클릭 전에도 참이라 아무것도 증명하지 못한다. 그래서 NXT 카드를 접은 뒤 KRX 카드의 NXT 라디오를 누르도록 바꿨고, 확인 다이얼로그가 없다는 단언(`toHaveCount(0)`)을 하나 더했다. 케이스 끝 상태(카드 2장 · NXT 펼침)는 이전과 같다. (86a2fa2)

### 참고

- RED 단계에서 새로 쓴 테스트 일부는 구현 전부터 초록이었다. 기존 경로가 이미 하던 동작을 잠그는 테스트라서다.
  - strategy-card 「거래소 prop 변경 → 새 키」 케이스
  - 작업대 T1·T3·T4·T5·T6
  - 헤더 「등록 카드도 활성」 케이스 (기본 props 에 잠금 prop 이 없어서)
- 실제로 실패하다 초록이 된 RED 는 다음과 같다.
  - 헤더 title 상수, strategy-card 의 `aria-disabled` 단언
  - 작업대 T2 · ⑦ · ⑦-b · ⑦-e · ⑦-f

## 게이트 결과 (원문)

| 명령 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/webapp run typecheck` | `tsc --noEmit && tsc -p tsconfig.e2e.json` 오류 0 |
| `pnpm --filter @gh-radar/webapp run test` | `Test Files  97 passed (97)` · `Tests  1643 passed \| 1 skipped (1644)` — skip 1 은 기존 `watchlist-api.test.ts` 의 `describe.skipIf(!SUPABASE_E2E_URL)` |
| `cd webapp && pnpm exec playwright test trading-workbench` | `39 passed (1.6m)` · fail 0 |
| 파일 단위 vitest (Task 1: card-header · strategy-card · stock-info-modal) | `Test Files  3 passed (3)` · `Tests  44 passed (44)` |
| 파일 단위 vitest (Task 2: trading-workbench.test.tsx) | `Tests  106 passed (106)` |
| `grep -rn 'exchangeLocked\|EXCHANGE_LOCKED_TITLE' webapp/src webapp/e2e` | 0건 |
| `git diff --quiet a532eff -- relay packages/shared pnpm-lock.yaml server` | diff 0 |
| eslint (변경 tsx 5개 + 작업대 테스트) | 경고·오류 0 |

수동 확인 한 줄: 등록 KRX 카드에서 NXT 를 누르면 카드 `data-key` 만 NXT 로 바뀌고 relay 로는 아무것도 보내지 않는다. 전략 삭제·재등록이 없으니 사이드바 KRX 항목은 그대로 남는다. `send` 0회는 카드 테스트와 작업대 T1 이 단언한다. 사이드바 항목 존치를 실브라우저에서 따로 단언하지는 않았다.

## 관찰 (범위 밖 · 미수정)

- `webapp/.git` 에 **중첩 git 저장소**가 있다(2026-09-23 18:05 생성 · 이 실행 전). `webapp/` 에서 `git` 을 치면 루트가 아니라 이 중첩 저장소를 읽는다. 그곳에는 `globals.css`·`layout.tsx` 등 8파일이 변경 상태다. 루트 저장소 커밋에는 영향이 없다(루트 `git status` 기준 이 quick 의 파일만 stage). 이 quick 은 건드리지 않았다. 다른 세션의 산물인지 사용자 확인이 필요하다.

## Known Stubs

없음.

## Threat Flags

없음. 새 네트워크·인증 표면이 없고, relay 송신도 0이다.

## Self-Check: PASSED

- 수정 파일 8개 존재, 커밋 285f3b3 · 1883e28 · 86a2fa2 존재(`git log`).
- `git rev-list --count a532eff..HEAD` = 3.
