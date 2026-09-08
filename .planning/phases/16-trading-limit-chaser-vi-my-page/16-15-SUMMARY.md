---
phase: 16-trading-limit-chaser-vi-my-page
plan: 15
subsystem: ui
tags: [nextjs, react, tailwind, relay-wss, playwright, vitest, rtl, a11y, my-page]

# Dependency graph
requires:
  - phase: 16-10
    provides: "AccountPanel 계좌 전용 모드(종목 축 없음) · `.rlist` 모바일 카드 행 · originTag · sendOrder"
  - phase: 16-11
    provides: "`strategy-badge`(배지 6종 + 거래소 태그) · `dma-gate` + `useDmaGateReason` · `limitChaserHref` · `/me` 라우트 셸"
  - phase: 16-09
    provides: "전역 relay 컨텍스트(`RelayProvider`) — status · limitChasers · viTrigger · account · strategiesDisabled"
provides:
  - "`/me` 본문 전체 — 상태줄 → 전략 현황 카드 → 계좌별 미체결·잔고 세로 반복 (MYPAGE-01)"
  - "`strategy-status-card.tsx` — 상따 전략 행 + VI 행 + 전체 비활성화(D-09, 확인 다이얼로그)"
  - "`useRelayContext().accountStates` — 계좌번호 → 병합된 계좌 상태 맵 (계좌별 반복의 전제)"
  - "`AccountPanel.accountName` — 계좌 전용 모드 헤더 우측 상품명 (UI-SPEC C5)"
  - "3표면 공통 게이트 수정 — 세션 판정 전에는 로그인 게이트를 세우지 않는다"
  - "`webapp/e2e/specs/me.spec.ts` — 8케이스 (계좌 2개 반복 · 14 왕복 · 1280/390 리플로우)"
affects: [16-16, 16-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "계좌 축 상태는 계좌번호 키 맵으로 들고 다닌다 — 「마지막 프레임 한 건」은 계좌가 2개 이상인 순간 거짓말이 된다"
    - "완료 신호(65)는 버튼 재활성에만 쓰고 목록 상태는 에코(60/61)로만 갱신 + 유실 백스톱 타이머"
    - "게이트 판정은 확정 신호에만 — 로그인 축에도 `isLoading` 가드를 둬 첫 페인트 번쩍임을 막는다"
    - "잘림 E2E 는 고장 모양에 맞춘다 — `.rlist` 는 잎 요소 right, 데스크톱 그리드는 자식 박스 + computed `min-width`"
    - "확인 다이얼로그의 실효 방어선은 포커스가 아니라 **DOM/탭 순서** (변이 실측)"

key-files:
  created:
    - webapp/src/components/trading/strategy-status-card.tsx
    - webapp/src/components/trading/__tests__/strategy-status-card.test.tsx
    - webapp/e2e/specs/me.spec.ts
  modified:
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/app/me/page.tsx
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/trading/dma-gate.tsx
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - .planning/phases/16-trading-limit-chaser-vi-my-page/deferred-items.md

key-decisions:
  - "계좌 상태를 계좌번호 키 맵(`accountStates`)으로 승격했다 — relay 는 계좌마다 `acct` 프레임을 한 벌씩 내려보내는데 기존 병합은 `prev.a !== next.a` 를 전량 교체로 처리해 **마지막 한 건만** 남겼다. 그 값으로 계좌 카드를 그리면 계좌 A 가 「미체결 주문이 없어요」라고 거짓말한다(D-21 이 성립 불가)."
  - "계좌 카드 머리를 두 벌 그리지 않는다 — `AccountPanel` 의 계좌 전용 모드 헤더가 곧 C5 의 카드 머리이고, 빠져 있던 상품명만 `accountName` prop 으로 채웠다. me-client 가 헤더를 따로 그리면 같은 계좌번호가 두 번 나온다."
  - "상태줄 문구는 `RELAY_STATE_LABELS` 단일 정본을 쓴다(D-36) — UI-SPEC C1 의 리터럴 `DMA Ready` 를 그대로 쓰면 호가주문 탭의 「실시간」과 같은 상태가 두 이름을 갖는다."
  - "확인 다이얼로그 부제를 상태에 따라 가른다 — 버튼은 상따·VI 중 하나만 살아 있어도 열리므로 원문(「상따 N건과 VI 자동매수가 한 번에 꺼져요」)을 고정하면 꺼지지 않는 것을 꺼진다고 말하게 된다."
  - "「발주됨」 배지를 My page 에서 만들지 않는다 — 주문 통보에 ISIN 이 없어 어느 전략의 발주인지 귀속시킬 수 없다. 근거 없이 붙이면 한 번도 발주되지 않은 전략에 그 배지가 붙는다."
  - "E2E 「비로그인 → 로그인 게이트」를 리다이렉트 단언으로 바꿨다 — middleware 가 먼저 `/login?next=/me` 로 막아 그 상태는 화면에 도달하지 않는다. 도달하지 않는 상태를 단언하면 그것이 곧 가짜 테스트다."

patterns-established:
  - "그리드 잘림 단언: 자식 박스 right 대조 + computed `min-width === '0px'` — 클래스 문자열이 아니라 실제 레이아웃을 정하는 값을 본다"
  - "첫 페인트 검증은 렌더 후가 아니라 **서버 응답 본문**을 본다 — 렌더 뒤 단언은 이미 사라진 뒤라 경주에 진다"
  - "테스트가 첫 실행에 전부 green 이면 변이를 주입해 실효성을 실측한다 (이 plan 에서 20종 주입, 초기 3종 헛통과 → 단언 교체 후 20종 전부 검출)"

requirements-completed: [MYPAGE-01]

# Metrics
duration: 65min
completed: 2026-09-09
---

# Phase 16 Plan 15: My page — 전략 현황 · 계좌별 미체결/잔고 Summary

**`/me` 를 전략 현황 카드(상따 전략 행 + VI 행 + 전체 비활성화) → 계좌별 미체결·잔고 세로 반복으로 채우고, 계좌가 2개 이상일 때 계좌 상태가 통째로 사라지던 브라우저 병합 결손을 계좌번호 키 맵으로 고쳤다 — RTL 13케이스 + E2E 8케이스로 잠갔다.**

## Performance

- **Duration:** 약 65분
- **Tasks:** 3 (+ 실행 중 발견한 결함 2건 수정 커밋 1개)
- **Files created:** 3 · **modified:** 7

## Accomplishments

- **전략 현황 카드** — 상따 전략 행(`.srow` 44px)이 종목명·단축코드·거래소 태그·**계좌번호 전체**·상태 배지를 전부 펴 보여주고(C2), 클릭하면 인코딩된 키로 편집 페이지에 간다. 사이드바 3단이 원 아이콘 2개로 축약한 상태의 **정본 화면**이다(N3a).
- **전체 비활성화(D-09)** — 확인 다이얼로그(기본 포커스 = 닫기, 실행 버튼은 `--destructive` **테두리**)를 거쳐 `{t:"strategies.disable"}` 을 **`key` 없이** 보낸다. 상태는 65 가 아니라 60/61 에코로만 갱신되고, 65 는 버튼을 다시 여는 데만 쓴다.
- **계좌별 세로 반복(D-21)** — 계좌 선택 UI 없이 계좌마다 카드 1개. 각 카드가 **자기 계좌의** 미체결·잔고를 보여준다(E2E 가 주문번호로 귀속을 확인).
- **계좌 상태 맵 승격** — `useRelayContext().accountStates`. 이게 없으면 계좌 2개짜리 사용자의 한쪽 카드가 조용히 비어 있었다.
- **3표면 공통 게이트 수정** — 로그인 사용자의 첫 페인트(SSR HTML 포함)에 「로그인이 필요해요」가 통째로 그려지던 문제를 잡았다. 상따·VI 화면에도 같이 적용된다.
- **E2E 8케이스** — 진짜 브라우저 → 진짜 relay → 스텁 게이트웨이로 `DisableStrategiesReq(14)` 왕복과 60/61 에코 반영까지 한 줄로 확인한다.

## Task Commits

1. **Task 1: 전략 현황 카드 (전략 행 · VI 행 · 전체 비활성화)** — `527af76` (feat)
2. **Task 2: My page 조립 (상태줄 · 계좌별 세로 반복)** — `4473120` (feat)
3. **실행 중 발견한 결함 2건 수정** — `4926e72` (fix)
4. **Task 3: My page E2E 8케이스** — `cff699f` (test)

## Files Created/Modified

- `webapp/src/components/trading/strategy-status-card.tsx` — 전략 행 · VI 행 · 전체 비활성화 + 확인 다이얼로그 (신규)
- `webapp/src/components/trading/__tests__/strategy-status-card.test.tsx` — RTL 13케이스 (신규)
- `webapp/e2e/specs/me.spec.ts` — E2E 8케이스 (신규)
- `webapp/src/components/trading/me-client.tsx` — 자리표시 제거 + 상태줄(C1) · 계좌 카드 반복(C5) 조립
- `webapp/src/app/me/page.tsx` — 본문 구성 주석 갱신
- `webapp/src/components/orderbook/account-panel.tsx` — `accountName` prop(계좌 전용 모드 헤더 우측 상품명, C5)
- `webapp/src/components/trading/dma-gate.tsx` — `useDmaGateReason` 에 `isLoading` 가드
- `webapp/src/lib/use-relay-socket.ts` — `accountStates` 맵 + `acct` 프레임의 **계좌별** 병합
- `webapp/src/lib/relay-provider.tsx` — Provider 밖 폴백에 빈 `accountStates`
- `.planning/phases/.../deferred-items.md` — 선행 실패 재현 기록 + 스코프 밖 메모 2건

## Decisions Made

frontmatter `key-decisions` 참조. 요지 3가지:

1. **계좌 축은 맵이어야 한다.** relay 는 인증 직후 캐시된 계좌 상태를 **계좌마다 한 프레임씩** 내려보낸다(`fanout.ts` 의 `getAccountStates(userId)` 전량). 브라우저가 그중 하나만 들고 있으면 D-21(계좌별 반복)이 애초에 성립하지 않고, 더 나쁘게는 **비어 있지 않은 계좌를 「미체결 없음」으로 그린다**. `account`(마지막 수신분)는 기존 소비자를 위해 의미 그대로 남겼다.
2. **문구의 단일 정본을 깨지 않는다.** UI-SPEC C1 은 `DMA Ready` 를 리터럴로 적었지만 D-36 은 상태 문구를 `RELAY_STATE_LABELS` 한 곳에 두라고 못 박았다. 리터럴을 따르면 같은 `ready` 가 호가주문 탭에서는 「실시간」, My page 에서는 「Ready」가 되어 D-36 이 막으려던 상황이 정확히 재현된다.
3. **모르는 것은 로딩으로 말한다.** 스냅샷 전 빈 목록을 「등록된 상따 전략이 없어요」로 단정하지 않고, 계좌 목록이 비었을 때도 「계좌 없음」이 아니라 「불러오는 중」으로 쓴다. relay 는 빈 `lc.snap` 도 보내므로 `ready` 이후의 0건만 확정이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 계좌가 2개 이상이면 계좌 상태가 마지막 한 건만 남았다**
- **Found during:** Task 1 (전략 행의 종목명 역매핑 원천을 찾다가 `mergeAccount` 를 읽고 발견)
- **Issue:** `use-relay-socket.ts` 의 `applyFrame` 이 `mergeAccount(state.account, frame)` 로 병합하고, `mergeAccount` 는 `prev.a !== next.a` 를 **전량 교체**로 처리한다. relay 는 계좌마다 `acct` 프레임을 보내므로 계좌가 2개면 뒤에 온 것이 앞의 것을 지운다. 이 상태로 My page 계좌 카드를 그리면 한쪽이 「미체결 주문이 없어요」가 되는데, 이는 **없다는 것이 아니라 우리가 버린 것**이다.
- **Fix:** `RelayConnectionState.accountStates: ReadonlyMap<string, RelayAccountState>` 추가. `acct` 케이스가 **그 계좌의 이전 상태**를 기준으로 병합하고 맵에 넣는다. `account` 는 「마지막으로 받은 계좌」라는 기존 의미를 그대로 유지한다(호가주문 탭이 소비 중).
- **Files modified:** `webapp/src/lib/use-relay-socket.ts`, `webapp/src/lib/relay-provider.tsx`
- **Verification:** E2E 케이스 1 이 계좌 A 카드에 `0000135742` 가, 계좌 B 카드에 `0000135801` 이 들어 있고 서로 섞이지 않음을 확인한다. 변이 E1(계좌 카드가 `account` 를 쓰게 함)을 주입해 실제로 실패함을 실측했다.
- **Committed in:** `527af76`

**2. [Rule 1 - Bug] 로그인 사용자의 첫 페인트에 로그인 게이트가 그려졌다**
- **Found during:** Task 3 (「비로그인 → 로그인 게이트」 E2E 를 설계하다 `AuthProvider` 의 초기 상태를 확인하며 발견)
- **Issue:** `AuthProvider` 는 `isLoading: true, user: null` 로 시작해 `getSession()` 이 돌아온 뒤에야 사용자를 채운다. `useDmaGateReason` 은 `user == null` 을 곧바로 「비로그인」으로 읽으므로 **로그인한 사용자의 첫 페인트에 「로그인이 필요해요」가 통째로 그려진다** — SSR HTML 에도 그대로 들어간다. 같은 파일이 `unauthorized` 에 대해서는 「확정 신호에만 반응한다」를 지키고 있어 규율이 한쪽만 적용된 상태였다. 3표면(상따·VI·My page) 전부에 해당한다.
- **Fix:** `if (isLoading) return null;` — 세션 판정 전에는 게이트를 세우지 않는다. 비로그인 진입은 middleware 가 `/login?next=…` 로 막고, 이 분기는 **열린 탭에서 세션이 만료되는 경우**(그때는 `isLoading` 이 false)를 위해 살아 있다.
- **Files modified:** `webapp/src/components/trading/dma-gate.tsx`
- **Verification:** E2E 케이스 6 이 서버 응답 본문에 「로그인이 필요해요」가 없고 `data-slot="me-page"` 가 있음을 단언한다(렌더 뒤 단언은 이미 사라진 뒤라 경주에 진다). 변이 E3(가드 제거)으로 검출을 실측했다.
- **Committed in:** `4926e72`

**3. [Rule 2 - Missing Critical] 스냅샷 수신 전 빈 목록을 「전략 없음」으로 단정했다**
- **Found during:** Task 3 준비
- **Issue:** UI-SPEC C2 에는 로딩 열(3행 스켈레톤)과 「스냅샷 수신 전 = `전략 정보를 불러오는 중이에요…`」가 있는데 구현에 없었다. 연결 중에는 목록이 비어 있으므로 진입 직후 항상 「등록된 상따 전략이 없어요」가 뜬다 — 묻지도 않고 없다고 말하는 것이다.
- **Fix:** `useSnapshotSeen(status)` 래치(`ready` 를 본 적 있는가). relay 가 빈 `lc.snap` 도 보내므로 `ready` 이후의 0건만 확정이고, 그 전에는 스켈레톤 3행 + `aria-busy="true"`. 재접속 중에는 래치를 내리지 않는다(사이드바 `everReady` 와 같은 판단).
- **Files modified:** `webapp/src/components/trading/strategy-status-card.tsx`
- **Verification:** RTL ⑦-a (`connecting` → 로딩 / `ready` → 확정된 빈 상태)
- **Committed in:** `4926e72`

**4. [Rule 2 - Missing Critical] 65 유실 시 버튼이 영원히 잠겼다**
- **Found during:** Task 1
- **Issue:** 「전체 비활성화」를 누르면 65 를 받을 때까지 버튼을 잠그는데, 65 가 유실되면 다시 열리지 않는다. T-16-07 은 「65 유실 시 버튼 재활성이 **늦어질 뿐**」을 accept 한 것이지 기능 상실을 accept 한 것이 아니다.
- **Fix:** 8초 백스톱 타이머. 서버가 60/61 에코를 먼저 보내므로 이 시점의 목록은 이미 정확하고, 다시 눌러도 같은 일(전부 끄기)이 한 번 더 나갈 뿐이라 위험하지 않다.
- **Files modified:** `webapp/src/components/trading/strategy-status-card.tsx`
- **Verification:** RTL ⑤ 가 송신 직후 잠김을 단언한다(백스톱 자체는 시간 의존이라 단언하지 않고 코드 경로로 둔다).
- **Committed in:** `527af76`

**5. [Rule 3 - Blocking] 계좌 카드 헤더에 상품명 자리가 없었다**
- **Found during:** Task 2
- **Issue:** UI-SPEC C5 의 카드 머리는 `계좌 {전체번호}`(mono) + 우측 `{상품명}` 인데, `AccountPanel` 의 계좌 전용 모드 헤더에는 상품명 슬롯이 없었다. me-client 가 헤더를 따로 그리면 **같은 계좌번호가 두 번** 나온다.
- **Fix:** `AccountPanel` 에 `accountName?: string` 추가(계좌 전용 모드에서만, 값이 있을 때만 렌더). 패널 헤더가 곧 카드 머리가 된다.
- **Files modified:** `webapp/src/components/orderbook/account-panel.tsx`
- **Verification:** E2E 케이스 1 이 카드 A/B 에서 「위탁종합」·「위탁CMA」를 읽는다.
- **Committed in:** `4473120`

### 계획과 다르게 판단한 것

**6. E2E 케이스 6 을 「게이트 렌더」가 아니라 「리다이렉트 + 첫 페인트」로 바꿨다.**
플랜은 "비로그인 진입 → 「로그인이 필요해요」 + 「로그인」 버튼"을 지시했으나, `/me` 는 middleware 가 `/login?next=/me` 로 먼저 돌려보내므로 **그 상태는 화면에 도달하지 않는다**(`PUBLIC_EXACT = ["/"]`). 도달하지 않는 상태를 단언하면 그 테스트는 아무것도 지키지 못한다. 실제 계약인 리다이렉트를 단언하고, 그 대가로 위 결함 2 를 잡는 「첫 페인트에 게이트 없음」 단언을 같은 케이스에 넣었다. (미인증 리다이렉트 자체는 16-11 의 `auth-guards.spec.ts` 가 이미 `/me` 를 포함해 잠그고 있다.)

**7. E2E 케이스 2 의 「폼에 채워진다」를 단언하지 않는다.**
상따 편집 폼은 **16-13 소관**이고 이 워크트리에는 없다(자리표시 상태). 그 화면의 문구를 단언하면 16-13 이 병합되는 순간 이 spec 이 애먼 이유로 깨진다. 대신 키가 왕복했다는 화면 밖 증거 — 사이드바 3단에서 그 전략만 `aria-current="page"` — 를 쓴다.

**8. 상태줄 문구를 `RELAY_STATE_LABELS` 로 쓴다(`DMA 실시간`).**
UI-SPEC C1 리터럴은 `DMA Ready` 지만 D-36(문구 단일 정본)과 Copywriting Contract(전 문구 한글)가 함께 걸린다. **16-13/16-14 도 같은 상태줄(A2/B1)을 만들므로 표면 간 문구가 갈릴 수 있다** — 검증 단계(16-17)에서 한 번 대조할 것.

**9. `useIsinNames()` 를 승격하지 않고 카드 안에 같은 판단을 뒀다.**
업스트림 노트는 `app-sidebar.tsx` 의 `useIsinNames()` 사용을 지시했으나 그 함수는 export 되어 있지 않다. 같은 wave 의 16-13 도 종목명 결선이 필요해 그 파일을 건드릴 가능성이 있어, 공유 파일을 수정하는 대신 카드 안에 `useIsinLabels()`(이름 **+ 단축코드**, 계좌 상태 **전부**를 훑는다)를 뒀다. 사이드바 판은 `account` 한 건만 보므로 계좌가 여럿이면 이름을 놓친다 — 승격한다면 이쪽이 정본이 되어야 한다.

---

**Total deviations:** 5 auto-fixed (2 bug, 2 missing critical, 1 blocking) + 판단 변경 4건
**Impact on plan:** 스코프 확대 없음. 결함 2건은 계좌 2개·첫 페인트라는 **이 plan 의 must_have 가 성립하려면 반드시 필요한** 수정이고, 나머지는 계약(UI-SPEC/D-36) 준수 또는 진행 차단 해소다. 16-12 소관 파일은 하나도 건드리지 않았다.

## Issues Encountered

**테스트가 첫 실행에 전부 통과했다 — 변이 20종을 주입해 실효성을 실측했고 3종이 헛통과했다.**

RTL 12종 (초기 9 + 포커스 5):

| # | 주입한 변이 | 검출 |
|---|-------------|------|
| 1 | 계좌번호 마스킹(`***1234`) | ✓ ① |
| 2 | `encodeURIComponent` 제거 | ✓ ② |
| 3 | `disabled` 제거 | ✓ ③ ③-a |
| 4a | `onOpenAutoFocus` 오버라이드 제거 | ❌ **놓침** |
| 4b | `autoFocus` 제거 | ❌ **놓침** |
| 4c | 푸터 시각 순서만 뒤집기 | ❌ 놓침(RTL 한계 — CSS 시각 순서) |
| 4d | 4a + 4b 동시 제거 | ❌ **놓침** |
| 4e | 실행 버튼을 DOM 앞으로 | ✓ (단언 보강 후) |
| 5 | `key: ""` 를 실음 | ✓ ⑤ |
| 6 | 65 로 목록 상태를 만듦 | ✓ ⑥ |
| 7 | 채움 빨강 버튼 | ✓ ③-b |
| 8 | 만원 환산 반올림 | ✓ viSummaryText |
| 9 | 이름 모르는 행에서 ISIN 중복 | ✓ ① |

**변이 4가 드러낸 것(중요):** 「기본 포커스가 닫기다」를 `toHaveFocus()` 로만 단언했더니 **두 겹 방어(`onOpenAutoFocus` + `autoFocus`)를 모두 지워도 통과했다.** Radix 는 기본적으로 첫 tabbable 로 포커스를 옮기는데, 닫기 버튼이 DOM 상 먼저라 결과가 같았기 때문이다. 즉 실효 방어선은 포커스 코드가 아니라 **DOM/탭 순서**다. 푸터 버튼 순서를 명시 단언(`buttons[0] === 닫기`)으로 추가하니 변이 4e 가 즉시 잡힌다.

E2E 8종:

| # | 주입한 변이 | 검출 |
|---|-------------|------|
| E1 | 계좌 카드가 `account`(마지막 한 건)를 씀 | ✓ 케이스 1 |
| E2 | 그리드 자식 `min-w-0` 제거 — **1차 단언** | ❌ **놓침** → computed style 단언 추가 후 검출 |
| E3 | `isLoading` 게이트 가드 제거 | ✓ 케이스 6 |
| E4 | 전체 비활성화 전송 제거 | ✓ 케이스 4 |
| E5 | 모바일 계좌번호 둘째 줄 규칙 제거 — **1차 단언** | ❌ **놓침** → 「배지 아래 + 전폭」 단언 추가 후 검출 |
| E6 | 표 컨테이너를 강제로 넘치게(`min-w-[900px]`) | ✓ 케이스 7 (잘림 단언이 실제로 문다) |

**변이 E2 가 드러낸 것:** `min-w-0` 을 지워도 잘림이 발생하지 않는다. 표를 감싸는 `overflow-x:auto` 컨테이너가 콘텐츠 최소폭 전파를 막기 때문이다. 규칙 자체는 유효하므로(감싸는 방식이 바뀌면 유일한 방어선) computed `min-width === '0px'` 로 직접 잠갔고, 잘림 단언이 살아 있음은 E6 로 따로 증명했다. `deferred-items.md` 에 기록했다.

**변이 E5 가 드러낸 것:** 「둘째 줄로 내려간다」는 390px 에서 규율이 없어도 자연 wrap 으로 성립한다. `order:9` + 전폭이 만드는 것 — **배지보다 아래** + **줄 전체 차지** — 를 함께 단언해야 문다.

**선행 실패 3건은 손대지 않았다.** `a11y`(일봉 차트 스켈레톤) · `news`(목록 상한) · `search`(⌘K). 셋 다 16-11 이 `deferred-items.md` 에 기록한 것과 동일하고, 실패 표면(`/stocks/005930`·`/news`·⌘K)이 이 plan 의 diff 와 겹치지 않는다.

## Known Stubs

없다. 16-11 이 `/me` 에 두었던 자리표시(`surface-placeholder`)는 이 plan 이 걷어냈다 —
`me-client.tsx` 에 `SurfacePlaceholder` 참조가 0건이다. (같은 컴포넌트를 상따·VI 클라이언트가
아직 쓰고 있으나 그것은 16-13/16-14 소관이다.)

의도적으로 **만들지 않은 것** 2가지는 스텁이 아니라 계약이다:
- **오늘 주문 이력 표** — v1 미포함(D-20 deferred). 조회 REST 라우트 호출 0건.
- **「발주됨」 배지** — 귀속 근거가 없어 만들지 않았다(위 Decisions 참조, `deferred-items.md` 기록).

## Threat Flags

없음. 이 plan 이 만든 표면은 전부 **이미 열려 있는 전역 wss 스냅샷의 표시**이고, 새 네트워크
엔드포인트·인증 경로·스키마 변경이 없다. 플랜 `<threat_model>` 의 `mitigate` 2건은 구현 +
테스트로 고정했다:

| Threat | 조치 |
|---|---|
| T-16-10 전체 비활성화 오조작 | 확인 다이얼로그 + 기본 포커스 닫기(DOM 순서까지 단언) + 테두리형 버튼 + 전략 0·VI 중지 시 `disabled` + 송신 후 잠금. 상따·VI 페이지에는 두지 않는다 |
| T-16-02 계좌 정보 노출 | 표시 원천은 전역 wss 계좌 스냅샷뿐. 주문 이력 REST 호출 0건(`grep` 0). 종목명·단축코드도 이미 받은 프레임에서만 얻는다 |
| T-16-07 65 유실 | 상태는 60/61 에코로만. 65 는 버튼 재활성 전용 + 8초 백스톱 |
| T-16-09 계좌번호 전체 표시 | UI-SPEC D2 계약대로 화면 전체 표시. 로그로 나가는 경로 없음(RTL 이 마스킹 변이를 검출) |

## User Setup Required

None.

## Next Phase Readiness

- **16-16 이 확인할 것:** `me-client` 는 주문 이력 REST 라우트를 호출하지 않는다. `POST /api/orders` 제거에 영향받는 코드가 이 plan 에는 없다.
- **16-17(검증)이 대조할 것:**
  1. **상태줄 문구.** 이 plan 은 `RELAY_STATE_LABELS`(→ `DMA 실시간`)를 썼다. 16-13/16-14 가 UI-SPEC 리터럴 `DMA Ready` 를 쓰면 세 표면이 갈린다.
  2. **`/me` axe 스캔.** 신규 표면이라 a11y spec 에 추가 대상이다. 선행 실패(`aria-prohibited-attr`)와 섞이지 않게 볼 것.
  3. 선행 실패 3건(`a11y`·`news`·`search`)은 여전히 미해결이다.
- **후속 plan 이 바로 쓸 수 있는 것:** `useRelayContext().accountStates`(계좌별 상태), `AccountPanel.accountName`, `StrategyStatusCard`, `viSummaryText`.
- **주의:** `dma-gate` 는 여전히 권한 장치가 아니다. 실제 차단은 relay `unauthorized` 와 middleware 로그인 벽이다.

## Self-Check: PASSED

- 생성 주장 파일 3개(`strategy-status-card.tsx` · 그 테스트 · `me.spec.ts`)와 수정 주장 파일 전부 디스크에 존재.
- 커밋 4개 전부 로그에 존재: `527af76` · `4473120` · `4926e72` · `cff699f`.
- `pnpm typecheck`(13 workspace) exit 0 · webapp 단위 49파일 469통과/1스킵 · relay 단위 17파일 327통과.
- `pnpm --filter @gh-radar/webapp test:e2e -- me.spec` 8/8 통과. 전량 실행(97 passed)에서 실패 3건은 16-11 이 기록한 선행 실패와 동일하다.
- `next build` 로 `/me` 라우트 생성 확인(4.41 kB) · lint 신규 경고 0(기존 2건 그대로).
- acceptance grep: `strategies.disable` 3건 · 전송 객체에 `key` 없음 · `me-client` 의 주문 이력 REST 호출 0건 · `<select>` 0건 · `SurfacePlaceholder` 0건 · spec 상단 `mode: 'serial'` 확인.
- **16-12 소관 파일 미수정** — 베이스 대비 변경 목록에 `limit-chaser.ts` · `limit-chaser-form.tsx` · `dirty-action-bar.tsx` 및 그 테스트가 하나도 없다.
- **STATE.md · ROADMAP.md 미수정** — 같은 변경 목록으로 확인.

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-09*
