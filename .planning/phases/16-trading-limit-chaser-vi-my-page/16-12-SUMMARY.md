---
phase: 16-trading-limit-chaser-vi-my-page
plan: 12
subsystem: ui
tags: [react, nextjs, tailwind, vitest, rtl, a11y, relay-wss, pure-functions]

# Dependency graph
requires:
  - phase: 16-11
    provides: "라우트 셸 · `strategy-badge.tsx` · `dma-gate.tsx` · 자리표시 클라이언트"
  - phase: 16-09
    provides: "전역 relay 컨텍스트 — `useRelayContext().send` · `limitChasers`"
  - phase: 16-03
    provides: "`RelayLimitChaser` / `RelayLimitChaserInput` 와이어 계약 (S→C 전용 4필드 분리)"
  - phase: 15
    provides: "`order-panel.tsx` 규율 헤더 · `FormRow` · 세그먼트 탭(Radix 미사용) 선례"
provides:
  - "`lib/limit-chaser.ts` — 수량 산출·전략 키·더티 판정·삭제 판정·기본값·상한가 시딩·에코 반영 순수 함수 9종"
  - "`DIRTY_COMPARED_FIELDS` — 더티 비교 대상 21종의 공개 상수(테스트가 「무엇이 빠졌는지」를 직접 단언)"
  - "`limit-chaser-form.tsx` — 카드 2개 · 그룹 6개 · 스위치 즉시 전송 · 더티 · 에코 우선"
  - "`dirty-action-bar.tsx` — 「수정」/「되돌리기」 하단 액션 바(상따·VI 공용)"
  - "globals.css `[hidden]{display:none!important}` — 탭 pane 숨김 backstop"
affects: [16-13, 16-14, 16-16, 16-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "더티·삭제 판정을 순수 함수 한 곳에 모으고 비교 대상 목록을 **공개 상수**로 노출 — 「무엇이 비교되지 않는지」가 테스트 대상이 된다"
    - "`hidden` 은 **좁은 폭에서만** 거는 DOM 속성 — `useSyncExternalStore` + `matchMedia` 로 판단하고 CSS 는 backstop 만"
    - "공용 primitive 를 한 화면 때문에 고치지 않고, 기하가 안전장치인 컨트롤(44×26 스위치)은 순수 버튼으로 그린다"
    - "테스트가 첫 실행에 green 이면 변이를 주입해 실효성을 실측한다(이 plan 에서 15종 주입, 15종 전부 검출)"

key-files:
  created:
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/dirty-action-bar.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  modified:
    - webapp/src/styles/globals.css

key-decisions:
  - "「수정」 경로에서도 `crud` 를 `\"C\"` 로 박지 않고 `crudOf(form)` 를 쓴다. 자동취소 게이트는 스위치가 아니라 **체크박스(값)** 라 「수정」으로만 꺼지는데, 그때 매수·매도가 이미 꺼져 있으면 그 「수정」이 곧 삭제다. `\"C\"` 를 박으면 서버가 어차피 `\"D\"` 로 정규화하므로 화면과 와이어만 갈린다."
  - "스위치 3종(`buyEnabled`·`sellEnabled`·`sweepEnabled`)을 더티 비교 대상에서 뺐다. 즉시 전송이라 송신~에코 사이 한 프레임 동안 서버값과 달라지는데, 그걸 더티로 세면 스위치를 켤 때마다 액션 바가 깜빡인다. 에코의 `enabled` 가 **설정값이 아니라 무장 상태**(Pitfall 10)라는 사실과도 짝이 맞는다 — 발주가 나가 게이트가 소진되면 「미반영 변경 1건」으로 오표시된다."
  - "정체성 4필드(`isin`·`accountNo`·`market`·`exchange`)를 폼 상태에서 뺐다. 그 넷이 바뀌면 **다른 전략 키**라 수정이 아니라 신규 등록이고, 상단 종목·거래소·계좌 카드(A1, 16-13 소관)의 값이다. 폼은 props 로 받아 전송에만 싣는다."
  - "탭 pane 의 `hidden` 을 **좁은 폭에서만** 건다. 항상 걸면 데스크톱에서 매도 폼이 접근성 트리에서 통째로 사라지고, 클래스로만 숨기면 작성자 `display:grid` 가 UA 규칙을 이겨 목업 R2① 회귀가 난다. 판단은 `useSyncExternalStore` + `matchMedia`(SSR 스냅샷은 데스크톱), CSS `[hidden]{display:none!important}` 는 backstop 이다."
  - "스위치를 `ui/switch.tsx`(Radix) 대신 `role=\"switch\"` 순수 버튼으로 그렸다. thumb 기하(16px · `translate-x-4`)가 primitive 안에 하드코딩돼 호출부에서 못 바꾸는데, 이 화면의 **유일한 오터치 방어가 정확히 44×26**(D-05 가 확인 다이얼로그를 배제했으므로)이다. 공용 primitive 를 한 화면 때문에 고치는 것보다 이쪽이 부작용이 작다."
  - "체크박스를 `ui/checkbox.tsx`(Radix) 대신 네이티브 `<input type=\"checkbox\">` 로 썼다. Radix 는 `<button role=\"checkbox\">` 라 `<label for>` 로 이름을 붙일 수 없고, 21개 컨트롤이 붙는 고밀도 폼에서 라벨 클릭 토글과 라벨 연결을 동시에 얻으려면 네이티브가 맞다."
  - "액션 바 채움 버튼의 글자색을 `--primary-fg` 가 아니라 값이 동일한 `--destructive-fg` 로 썼다(S-6). accent 축 토큰 이름이 파일에 등장하는 순간 `--down`(매도 파랑)과의 충돌을 grep 으로 감시할 수 없게 된다 — `order-panel.tsx` ④ 와 같은 규율이다."

patterns-established:
  - "비교 대상 목록을 `as const satisfies readonly (keyof T)[]` 로 잠근다 — 타입이 1차로 막고 공개 상수가 2차로 막는다"
  - "포맷된 controlled 숫자 입력의 값 단언은 `fireEvent.change` 로 확정한다(`userEvent.type` 은 재포맷마다 캐럿을 다시 잡아 결과가 환경 의존적)"
  - "뷰포트 분기 단언은 `matchMedia` 스냅샷을 갈아끼운 뒤 한다 — jsdom 기본 폴리필은 `matches:false` 라 좁은 폭 경로가 아예 실행되지 않는다"

requirements-completed: [TRADE-01]

# Metrics
duration: 40min
completed: 2026-09-08
---

# Phase 16 Plan 12: 상따 폼 · 조작 규율 Summary

**「스위치는 즉시, 값은 「수정」 버튼」이라는 이 phase 의 핵심 규율을 순수 함수 9종 + 폼 카드 2개 + 하단 액션 바로 구현하고, 그 6개 규율을 단위 25 · RTL 23 케이스로 잠갔다 — 테스트 실효성은 변이 15종을 주입해 실측했다(15종 전부 검출).**

## Performance

- **Duration:** 약 40분
- **Tasks:** 3 (TDD RED→GREEN 1건 포함)
- **Commits:** 4

## What Was Built

### Task 1 — `lib/limit-chaser.ts` (순수 함수)

| 함수 | 역할 | 잠근 것 |
|------|------|---------|
| `buyOrderQtyFromAmount` | `floor(금액(만원) × 10000 / 가격)` | **역산 금지** · 가격 ≤0 이면 0 · 100억주도 uint 래핑 없음 |
| `strategyKey` | `{isin}:{accountNo}:{exchange}` | isin·accountNo **12자 절단**(서버 `strncpy` 동형) |
| `dirtyFieldsOf` | 더티 판정 유일 지점(D-06) | S→C 4필드·스위치 3종 제외 · `buyOrderAmount === 0` 제외 · 에코 없으면 더티 0 |
| `isDeleteIntent` / `crudOf` | 삭제 판정(D-08) | **취소 게이트 포함**(Pitfall 7) |
| `seedFromUpperLimit` | 가격 5칸 상한가 시딩 | 신규 폼 1회 |
| `defaultLimitChaserForm` | WinForms 기본값 | 매 호출 새 객체 |
| `estimatedSellQty` | 예상 매도수량(표시 전용) | 서버 계산값이 정본 |
| `formFromServer` | 에코 → 폼(D-11) | 더티도 덮되 `buyOrderAmount === 0` 만 예외 |

`DIRTY_COMPARED_FIELDS`(21종)를 공개 상수로 내보내, 테스트가 「무엇이 비교 대상이 **아닌지**」를 배열 자체로 단언한다.

### Task 2 — `limit-chaser-form.tsx` · `dirty-action-bar.tsx`

- 카드 **2개**(매수/매도), 그룹 **6개**(`data-slot="lc-group-{buy|buy-price|sweep|sell|sell-price|cancel}"`).
- 스위치 3개 = **44×26 + `ml-auto` 고정 위치 + gap 8px**. 확인 다이얼로그가 **없다**(D-05) — 그 기하가 유일한 오터치 방어라는 사실을 파일 헤더에 못박았다.
- 값 변경 = 더티(라벨 `--primary` + `● ` 접두 · 입력 테두리 + 2px 링) → 하단 액션 바. **자동 반영 경로 0건.**
- 에코 도착 = 서버값이 이긴다(더티 포함) + 덮은 필드 ≤150ms 플래시 + 액션 바 소멸.
- 자동취소 그룹은 **중립색**(좌측 3px `--border`) + 캡션 `가드`. 경고 전용 색 토큰은 저장소에 없으므로 쓰지 않는다.
- 모바일 「매수/매도」 세그먼트 탭 — `role="tablist"`/`role="tab"`/`aria-selected`, 비활성 pane 은 **좁은 폭에서만** `hidden` 속성.

### Task 3 — RTL 23케이스

계획의 12케이스를 전부 덮고, 경계 케이스(전송 중 중복 제출 · 파생값 `—` · 클라 고정 3 미노출 · 데스크톱에서 pane 미숨김 · 라벨 클릭 토글 · A9 연쇄 비활성)를 더해 23케이스가 됐다.

## Verification

```
webapp typecheck            exit 0
webapp lint                 신규 경고 0건 (기존 2건은 다른 파일)
webapp test (전량)          50 files · 504 passed · 1 skipped
  limit-chaser.test.ts      25 passed
  limit-chaser-form.test.tsx 23 passed
```

### 변이 주입 실측 (blindspot #4 — 첫 실행 green 이면 실효성을 의심한다)

| # | 변이 | 검출 |
|---|------|------|
| 1 | `floor` → `round` (수량 산출) | **처음엔 미검출** → 나머지 ≥0.5 케이스(10만÷15,000=6.67) 추가 후 검출 |
| 2 | 전략 키 12자 절단 제거 | 검출 |
| 3 | 더티 비교의 `buyOrderAmount === 0` 가드 제거 | 검출 |
| 4 | 삭제 판정에서 취소 게이트 제외 | 검출 |
| 5 | 에코가 `buyOrderAmount: 0` 을 덮도록 변경 | 검출 |
| 6 | `defaultLimitChaserForm` 잔량추적 50→40 | 검출 |
| 7 | `estimatedSellQty` `floor` → `ceil` | 검출 |
| 8 | 값 변경 시 즉시 전송(자동 반영 부활) | 검출(8케이스) |
| 9 | `crud` 를 `"C"` 로 고정 | 검출 |
| 10 | 스위치 cfg 가 서버값을 쓰도록(더티 누락) | 검출 |
| 11 | cfg 에 S→C 4필드 추가 | 검출 |
| 12 | 에코가 더티 필드를 보존하도록(보류 부활) | 검출 |
| 13 | pane 숨김을 `hidden` 속성 → 클래스 | 검출 |
| 14 | 「되돌리기」가 전송하도록 | 검출 |
| 15 | 액션 바가 `dirtyCount === 0` 에도 렌더 | 검출(4케이스) |

**변이 1 이 이 plan 의 수확이다.** 「10만원 ÷ 30,000 = 3」만으로는 `floor` 와 `round` 가 구분되지 않는다 — 나머지가 0.5 를 넘는 케이스가 없으면 반올림 회귀가 통과한다. 반올림이면 예수금 없는 1주가 더 나간다.

## Deviations from Plan

### Auto-fixed / 계획 대비 조정

**1. [Rule 2 - 누락된 필수 기능] `globals.css` 에 `[hidden]{display:none!important}` 추가**
- **Found during:** Task 2
- **Issue:** 계획의 acceptance criteria 가 이 규칙의 존재를 요구하는데 저장소에 없었다. 없으면 작성자 `display:grid` 가 UA 규칙을 이겨 모바일 탭에서 두 폼이 모두 흐른다(목업 R2① 회귀).
- **Fix:** 언레이어 규칙으로 추가하고, Tailwind 의 `hidden` **클래스**와 HTML `hidden` **속성**의 구분을 주석에 남겼다.
- **Commit:** `be513aa`

**2. [계획 조정] 탭 pane 의 `hidden` 을 좁은 폭에서만 건다**
- 계획은 「비활성 pane 은 `hidden` 속성」만 적었다. 그대로 항상 걸면 데스크톱 3열에서 매도 폼이 **접근성 트리에서 사라진다**(`hidden` 은 시각 뿐 아니라 AOM 에서도 제외된다). 좁은 폭 판단을 `useSyncExternalStore` + `matchMedia` 로 넣고, 데스크톱에서 어느 pane 도 숨지 않는다는 단언을 테스트에 추가했다.

**3. [계획 조정] 「수정」의 `crud` 를 `"C"` 고정이 아니라 `crudOf(form)`**
- 계획 Task 2 는 `crud "C"`, Task 1 은 `crudOf(form)` 을 지시해 서로 어긋났다. `crudOf` 로 통일했다(근거는 key-decisions 첫 항목).

**4. [계획 조정] 폼 상태에서 정체성 4필드 제외**
- 계획의 「전체 33필드 전송」은 유지하되, 폼이 **편집**하는 값은 24종이다. 나머지 9(정체성 4 + 파생 2 + 고정 3)는 전송 시점에 조립한다. 조립기는 폼 파일 안의 `buildCfg` 한 곳이고, lib 에는 두지 않았다(계획의 「하지 않는 것」).

**5. [계획 조정] 스위치·체크박스에 shadcn primitive 를 쓰지 않음**
- 근거는 key-decisions. 계획 read_first 는 `ui/{switch,checkbox,...}` 를 읽으라고 했고 읽은 결과가 이 판단이다.

**6. [문구 조정] 주석에서 `debounce`·`--warn` 리터럴 제거**
- acceptance criteria 가 이 두 문자열의 **출현 0건**을 감시선으로 삼는데, 「쓰지 않는다」는 설명 자체가 그 감시선을 무력화한다(이미 nonzero 라 나중에 진짜 코드가 들어와도 grep 이 안 튄다). 같은 의미의 한글 표현(「디바운스」·「경고 전용 색 토큰」)으로 바꿔 감시선을 살렸다.

**7. [계획 대비 추가] 케이스 12 → 23케이스**
- 계획의 12케이스를 전부 덮은 뒤 경계 6종을 추가했다(전송 중 중복 제출 가드 · 매수가격 0 파생값 `—` · 클라 고정 3 미노출 · 데스크톱 pane 미숨김 · 라벨 클릭 토글 · A9 연쇄 비활성).

### 인증 게이트

없음.

## Known Stubs

없음. 이 plan 이 만든 3개 파일은 전부 실제 데이터(`useRelayContext().send` · `server` prop)에 연결돼 있다.

다만 **아직 아무도 렌더하지 않는다** — `limit-chaser-client.tsx` 의 자리표시를 걷어내고 이 폼을 배치하는 것은 **16-13** 소관이다(16-11 SUMMARY 인계 그대로). 그때 다음 3개를 배선해야 한다:

1. `server` = `useRelayContext().limitChasers` 에서 `strategyKey(isin, accountNo, exchange)` 로 고른 1건
2. `sellableQty` = `RelayAccountState.hold[].sellableQty`(해당 ISIN)
3. `buyStatusText`/`sellStatusText` = `strategy-badge.tsx`(16-11)의 배지 매핑 — 에코의 `enabled` 가 **무장 상태**임을 구분하는 문구가 그쪽에 있다
4. `onDirtyCountChange` = 이탈 경고(라우터 가드 + `beforeunload`, D-06 7항)

## Threat Flags

없음. 이 plan 이 만든 표면은 전부 기존 `lc.set` 경로 안쪽이고, 새 네트워크 엔드포인트·인증 경로·파일 접근·스키마 변경이 없다.

계획 `<threat_model>` 의 대응 상태:

| Threat ID | Disposition | 결과 |
|-----------|-------------|------|
| T-16-10 (오조작) | accept | 확인 다이얼로그 없음을 테스트로 **고정**했다(부재가 회귀로 되살아나는 것도 막는다). 44×26 + `ml-auto` + gap 8px 이 파일 헤더에 「유일한 방어」로 명시됨 |
| T-16-10 (수량 오산) | mitigate | 역산 없음 + 단위 5케이스 + 변이 1(반올림) 검출. 실측 사고 이력(2주→598주)을 `lib/limit-chaser.ts` 주석에 남김 |
| T-16-01 (계좌 권한) | transfer | 폼은 `accountNo` 를 props 로 받아 싣기만 한다. 대조는 relay `session.allowedAccounts`(16-07) — 주석에 명시 |
| T-16-05 (S→C 4필드) | mitigate | cfg 키 집합 **정확히 33개** 단언 + 변이 11 검출 |

## Self-Check: PASSED

- `webapp/src/lib/limit-chaser.ts` — FOUND
- `webapp/src/lib/__tests__/limit-chaser.test.ts` — FOUND
- `webapp/src/components/trading/limit-chaser-form.tsx` — FOUND
- `webapp/src/components/trading/dirty-action-bar.tsx` — FOUND
- `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx` — FOUND
- 커밋 `6d48764` / `f3aa95d` / `be513aa` / `072abe3` — FOUND
- 16-15 소관 파일(`strategy-status-card.tsx` · `me-client.tsx` · `me/page.tsx` · `e2e/specs/me.spec.ts`) — **미수정 확인**
- `STATE.md` / `ROADMAP.md` — **미수정 확인**
