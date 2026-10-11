---
phase: 18-gh-trade-ui-nxt-vi
plan: 22
subsystem: trading-workbench
status: complete
tags: [gap-closure, TRADE-09, webapp, workbench, WR-04, WR-07]
gap_closure: true
requires:
  - 18-21
  - 18-17
  - 18-14
provides:
  - "cardForUnfilled(cards, row, accountNo) — 미체결 행을 받을 카드 판정의 유일 지점(정확 일치 카드 id | 붙일 카드 모양)"
  - "작업대 selectUnfilled — 정확 일치 카드를 펼치거나, 없으면 행의 ISIN · 행의 거래소 · 상태줄 계좌로 펼친 카드를 붙인다(송신 0)"
  - "RelayConnectionState.limitChaserSnapSeq — lc.snap 적용 횟수(연결 전/리셋 0) · EMPTY_RELAY_VALUE 0"
  - "작업대 knowsRegistered(snapSeq, limitChasers) — 포커스 요청 보류를 버려도 되는가(스냅샷 받음 ∧ 목록 비어 있지 않음)"
  - "테스트: trading-workbench WR-04 4 + cardForUnfilled 3 + WR-07 describe 5 · relay-socket 리듀서 3 · e2e GC4"
affects:
  - 18-REVIEW WR-04 · WR-07 종결 근거
  - relay 인증 경로 lc.snap 규율 — deferred-items.md 에 근본 수정 제안(콜드 세션 빈 캐시)
tech-stack:
  added: []
  patterns:
    - "전달 조건은 좁게 두고 조건을 만족하는 수신자를 보장한다 — 느슨한 매칭 대신 카드를 붙인다"
    - "모호한 빈 스냅샷 — 빈 배열을 「없음」 확정으로 읽지 않는다(relay 콜드 세션)"
key-files:
  created:
    - .planning/phases/18-gh-trade-ui-nxt-vi/deferred-items.md
  modified:
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts
key-decisions:
  - "WR-04 는 주 갈래(카드 id 기반)로 닫았다 — 18-21 이 WR-05 를 재현·수정해 같은 ISIN 카드 둘이 가능하므로, 받을 카드가 없으면 상태줄 계좌로 붙인다. 선택 전달 조건(ISIN ∧ 거래소 ∧ 상태줄 계좌)은 바꾸지 않았다(T-18-96)"
  - "WR-07 은 실재했다(수정 전 코드로 확인 2케이스 RED) — 포커스 보류는 등록 목록을 알기 전에만 산다"
  - "빈 lc.snap 은 모호하게 다룬다 — relay 는 콜드 세션에서 게이트웨이 64 전에 빈 캐시를 먼저 내린다. 플랜의 「snapSeq > 0 이면 확정」 을 그대로 쓰면 콜드 세션 ?focus= 가 버려진다(e2e 케이스 1 이 잡음). 근본 수정은 relay 몫으로 deferred"
requirements-completed: [TRADE-09]
metrics:
  duration: "약 10분"
  completed: 2026-09-22
  tasks: 2
  files: 7
actuals:
  tokens: 7800
  tasks: 2
  commits: 2
plan_head_before: e611c3ab59fcfa0d5a7433f17303fe681d457d68
coverage:
  - deliverable: "미체결 선택 → 받을 카드 보장 (WR-04)"
    human_judgment: false
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/trading-workbench.test.tsx#WR-04 (4) · cardForUnfilled (3)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#GC4"
        status: pass
  - deliverable: "포커스 보류는 등록 목록을 알기 전에만 (WR-07)"
    human_judgment: false
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/trading-workbench.test.tsx#WR-07 (5) · relay-socket.test.ts#limitChaserSnapSeq (3)"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp run test:e2e -- sidebar-tree trading-workbench (39 passed)"
        status: pass
---

# Phase 18 Plan 22: 미체결 선택 카드 보장 · 포커스 보류 한정 (WR-04 · WR-07) Summary

공용 패널에서 미체결 행을 누르면 이제 그 주문을 정정·취소할 카드가 늘 화면에 있다. 받을 카드가 없으면 행의 종목·거래소와 상태줄 계좌로 카드를 붙이고 펼친다. 사이드바나 `?focus=` 로 들어온 포커스 요청은 등록 목록을 알기 전에만 보류된다. 그래서 오래된 키가 나중에 카드를 저절로 펼치는 일이 없다.

## Task 1 — WR-04: 미체결 선택은 받을 카드를 보장한다 (`ee69760`)

- `cardForUnfilled(cards, row, accountNo)`(export · 순수 함수): 판정의 유일 지점이다. 정확 일치 카드(같은 ISIN ∧ `c.exchange === row.exchange` ∧ `c.accountNo === 상태줄 계좌`)가 있으면 `{kind:"existing", id}` 를 돌려준다. 없으면 `{kind:"new", card}` 로 붙일 카드 모양(행의 ISIN · 행의 거래소 · 상태줄 계좌 · 펼침 · 행의 name/code)을 돌려준다.
- `selectUnfilled`: `null` 이면 선택만 푼다. 행이면 id 를 업데이터 밖에서 뽑고(18-21 규율), 업데이터 안에서 `cardForUnfilled` 로 펼치거나 붙인 뒤 그 전략 키로 스크롤한다. 서버에는 아무것도 보내지 않는다.
- `renderCard` 의 선택 전달 조건은 **바꾸지 않았다**.
- RED(수정 전 코드, 테스트만 먼저 추가): 새 7케이스가 모두 실패했다. 「정확 일치 카드가 있으면 그 카드가 펼쳐진다」 도 RED 였다. 옛 `focusCard(isin)` 는 같은 ISIN 의 **첫** 카드(KRX)를 펼쳐서, NXT 미체결인데 KRX 카드가 열렸다. 18-21 이 같은 ISIN 카드 둘을 가능하게 한 뒤 드러난 경로다.
- e2e **GC4**: 카드 0장에서 `E2E_LONG_NAME_ISIN` KRX 미체결을 누르면 그 키의 카드 1장이 `data-open="true"` 로 선다. 카드의 「수동주문」 을 열면 `manual-order-selchip` 이 그 주문번호를 말한다. `SetLimitChaserReq` 증가는 0 이다.

## Task 2 — WR-07: 확인 먼저 → 포커스 보류 한정 (`592f433`)

### 수정 전 재현 판정

수정 전 코드(HEAD `ee69760`, 작업대 무수정)에서 describe 「WR-07 — 스냅샷 이후의 포커스 미스는 보류하지 않는다」 를 돌렸다. 스냅샷 여부는 모킹 relay 의 `limitChaserSnapSeq: 1` 로 표현했다(수정 전 코드는 이 필드를 읽지 않는다).

| # | 케이스 | 수정 전 | 관측 | 수정 후 |
|---|--------|---------|------|---------|
| 1 | 스냅샷 이후(목록 `[A]`) 사이드바 요청 K(없음) → 나중에 K 등록 → 접힌 채 | **RED** | K 카드가 `data-open="true"` 로 들어옴(사용자 조작 없이 펼침) | GREEN |
| 2 | 스냅샷 이후 마운트 · `?focus=K`(없음) → 나중에 K 등록 → 접힌 채 | **RED** | K 카드가 펼쳐짐 | GREEN |

판정: **WR-07 실재.** 원인은 사이드바 요청 처리의 `pendingFocus.current = f`(무기한 보류)와 유입 효과가 보류를 버리지 않는 것이다.

### 구현

- `use-relay-socket.ts`: `RelayConnectionState`·`RelayData` 에 `limitChaserSnapSeq` 를 더했다(JSDoc 은 `rateCrossSnapSeq` 형식). 값은 `INITIAL_DATA` 0 에서 시작하고 `lc.snap` 마다 +1 되며, 빈 배열도 센다. 상태 매핑으로 그대로 전달한다. `relay-provider.tsx` 의 `EMPTY_RELAY_VALUE` 는 0 이다.
- `trading-workbench.tsx`: 새 함수 `knowsRegistered(snapSeq, limitChasers)`(= `snapSeq > 0 ∧ 목록 비어 있지 않음`)로 판정한다. 유입 효과는 찾으면 소비하고, 목록을 아는데 없으면 보류를 버린다(의존성에 `limitChaserSnapSeq` 추가). 사이드바 요청은 목록을 알면 보류하지 않는다. `?focus=` 마운트 1회 소비(D-02 · T-18-53)는 그대로다.
- 테스트: 작업대 쪽은 스냅샷 전 요청이 스냅샷에서 찾아지면 펼치는 케이스, 스냅샷에 없으면 보류를 버리는 케이스, 콜드 세션 케이스(빈 스냅샷 → 진짜 64 에 K 가 있으면 `?focus=K` 를 펼침)를 추가했다. 리듀서 쪽은 스냅샷마다 +1(빈 배열 포함, 인증 ACK 만으로는 0), `lc` 에코는 값을 바꾸지 않음, 리셋 후 0 의 3케이스다.

## 검증

- `vitest run`(webapp 전량): 92 files · **1383 passed** · 1 skipped
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck`: `error TS` 0
- `test:e2e -- trading-workbench`(Task 1 시점): **45 passed**(GC4 포함)
- `test:e2e -- sidebar-tree trading-workbench`(Task 2 최종): **39 passed**
- 기존 「행을 누르면 같은 종목·계좌·거래소 카드의 본문에만 …」, 「스냅샷 전에 온 요청은 등록 전략이 보이는 순간 펼친다」, 「?focus= … 뒤로가기 다시 덮지 않는다」 케이스: 무수정 green
- `grep -c limitChaserSnapSeq`: use-relay-socket 5 · relay-provider 1 · trading-workbench 6
- eslint(변경 파일): 새 경고 0. `use-relay-socket.ts:1014` wireSubsRef 경고는 원래 있던 것이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 빈 `lc.snap` 은 「스냅샷을 받았다」 로 확정하지 않는다**
- **Found during:** Task 2 (e2e `trading-workbench` 케이스 1 실패)
- **Issue:** 플랜은 「`limitChaserSnapSeq > 0` 이면 등록 목록을 안다」 를 전제했다. 그런데 relay 는 콜드 세션(막 만든 게이트웨이 세션)에서 인증 직후 **빈** hub 캐시를 `lc.snap []` 으로 먼저 보낸다(`fanout.ts` 인증 경로). 진짜 목록은 게이트웨이 64 팬아웃(`subscription-hub.ts` `#onLimitChaserList`)으로 한 번 더 온다. 플랜 규칙대로면 콜드 세션의 `?focus=` 가 진짜 목록 도착 전에 버려진다. 이는 D-02 회귀이고 옛 경로 → `?focus=` e2e 가 실패했다.
- **Fix:** 판정을 `knowsRegistered(snapSeq, list) = snapSeq > 0 ∧ list.length > 0` 한 곳으로 모았다. 빈 스냅샷은 모호하게 다뤄 보류를 유지한다. 플랜 truth 「빈 배열로 추론하지 않는다」 와 부분적으로 어긋나지만, 빈 배열을 「받았다」 의 증거로 쓰지 않을 뿐 「받았는가」 신호 자체는 여전히 `limitChaserSnapSeq` 다. 콜드 세션 단위 케이스를 추가했다.
- **남는 틈:** 등록 전략이 0건인 사용자의 오래된 키는 계속 보류된다. 근본 수정(relay 가 64 를 받기 전에는 인증 경로 `lc.snap` 을 보내지 않음 · VI 3상태 규율과 같게)은 relay 배포가 필요해 `deferred-items.md` 에 적었다.
- **Files modified:** trading-workbench.tsx · use-relay-socket.ts(JSDoc) · trading-workbench.test.tsx
- **Commit:** `592f433`

**2. [프로세스] RED 커밋을 따로 두지 않았다**
- 두 태스크 모두 RED 를 세션 안에서 먼저 관측하고 기록했다(위 표 · Task 1 RED 서술). 커밋은 태스크당 1개(테스트 + 구현)다.

**Total deviations:** 1 auto-fixed (Rule 1) + 1 process note. **Impact:** WR-07 은 닫혔고 D-02 회귀는 없다. 등록 전략 0건 사용자라는 좁은 틈만 relay 후속으로 남는다.

## Known Stubs

없음.

## Threat Flags

없음. 새 네트워크·인증 경로가 없다. T-18-96 은 전달 조건 무변경과 상태줄 계좌 카드로, T-18-97 은 `cardForUnfilled` 보장으로, T-18-98 은 `knowsRegistered` 로(빈 스냅샷 틈은 deferred), T-18-99 는 송신 0 을 단위·GC4 로 단언해 완화했다.

## Next

18-22 는 이번 갭 클로징 라운드의 마지막 플랜이다. 남은 플랜이 없으면 재검증(`-R2`)으로 넘어간다. 배포 순서 주의: 이 변경은 webapp 만 바꾸므로 relay 선배포가 필요 없다. deferred relay 수정을 한다면 relay 를 먼저 배포한다.

## Self-Check: PASSED

- 파일: 수정 6개 + `deferred-items.md` 모두 존재
- 커밋: `ee69760` · `592f433` 이 `git log` 에 있음(`git rev-list --count e611c3a..HEAD` = 2)
