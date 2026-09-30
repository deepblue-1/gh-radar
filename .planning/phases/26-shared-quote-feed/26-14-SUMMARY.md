---
phase: 26-shared-quote-feed
plan: 14
subsystem: ui
tags: [status-bar, quote-feed, relay, webapp, e2e, d-01, d-04, d-14]

requires:
  - phase: 26-12
    provides: "webapp RelayConnectionState.quoteState · subLimit(최신 1건 · 초기 null) · useRelayContext 동일 필드"
  - phase: 26-13
    provides: "채택안 안 B 점형 · 목업 머리 「26-14 정본 목록」(문구 · 톤 · 구독 한도 title · 폰 폭 규칙)"
provides:
  - "webapp/src/lib/quote-state.ts — quotePillOf(quoteState, subLimit, subject?) · orderPillOf(status, statusLabel) 단일 판정"
  - "작업대 상태줄 시세 필 data-slot=\"workbench-quote\" · 주문 필(workbench-dma 자리 · 접두 「주문」)"
  - "My page 상태줄 시세 필 data-slot=\"me-quote\" · 주문 필 data-slot=\"me-dma\" · 톤 점"
  - "RELAY_STATE_LABELS.connecting = 「서버 연결 중…」(화면 「주문 서버 연결 중…」)"
  - "e2e 「Phase 26 D-01 · D-04」 — quote 연결만 끊기 → 시세 필만 적색 · 호가 숫자 · 불투명도 불변 → 복구"
affects: [26 phase 검증 · UAT, packages/shared RELAY_STATE_LABELS 소비처]

actuals:
  tokens: 11020
  tasks: 2
  commits: 4
plan_head_before: 1cc95a3f36a49f3244edb09aae01173894a7396d

tech-stack:
  added: []
  patterns:
    - "상태 → 필 판정은 lib 함수 하나(quotePillOf · orderPillOf), 두 상태줄은 그리기만 — queuedWindowBadgeOf 선례"
    - "안 B: 정상이면 상태어를 숨기고 sr-only 로만 말한다(RELAY_STATE_LABELS.ready 재사용 · 새 문구 없음)"

key-files:
  created:
    - webapp/src/lib/quote-state.ts
    - webapp/src/lib/__tests__/quote-state.test.ts
  modified:
    - webapp/src/components/trading/workbench/workbench-status-bar.tsx
    - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/components/trading/__tests__/me-client.test.tsx
    - packages/shared/src/relay.ts
    - webapp/e2e/specs/trading-workbench.spec.ts

key-decisions:
  - "안 B 정본을 따랐다: 「● 시세」 · 「● 시세 HH:MM:SS~ 멈춤」 · 「● 주문」 — 플랜 문구 예시(안 A 「시세 실시간」 · 「이후 갱신 없음」 · 구독 한도 칩)는 쓰지 않았다"
  - "주문 필 판정도 orderPillOf 로 lib 에 올렸다 — 두 상태줄이 ready 상태어 숨김 · 연결 문구 · 점멸 규칙을 따로 갖지 않게"
  - "QuotePill 모양 = { tone, label, detail, srDetail, title } — 안 B 에 칩이 없어 플랜의 limit 필드는 title 로 합쳤다"
  - "구독 한도 종목 라벨: 작업대는 카드 name/code → relay 라벨 → ISIN 원문, My page 는 relay 라벨 → ISIN 원문"
  - "scope global 문구는 목업의 「…」 뒤를 지어내지 않고 「…시세를 받지 못했어요.」 에서 끝냈다"
  - "RELAY_STATE_LABELS.connecting 소비처는 두 상태줄 폴백 · use-relay-socket statusLabel 뿐(relay · e2e 단언 없음) — 영향 확인 뒤 변경"

patterns-established:
  - "상태 축 톤: 정상 --led-armed · 진행/꺼짐 --flat · 끊김 --destructive · 접두 --muted-fg(상태줄 기본색) — --up 금지"

requirements-completed: []

coverage:
  - id: D1
    description: "quotePillOf · orderPillOf 판정 — 모름 null · live · down(시각 · 시각 없음 · 파싱 불가) · 구독 한도 title(user/global · ISIN 폴백) · 주문 ready/연결/진행"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/quote-state.test.ts (13 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "작업대 상태줄 시세 필 workbench-quote(모름이면 없음 · data-tone · aria-live · 주문 필 앞 · --destructive · title) + 주문 필 문구"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx#WorkbenchStatusBar — 시세 필 (D-01 · D-04)"
        status: pass
    human_judgment: false
  - id: D3
    description: "My page 상태줄 me-quote · me-dma · 톤 점 · 「주문 서버 연결 중…」 · 상따/VI/계좌 칸 유지"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/me-client.test.tsx#MeStatusBar — 시세 필 (D-01 · D-04)"
        status: pass
    human_judgment: false
  - id: D4
    description: "실 relay e2e — quote 연결만 끊으면 시세 필만 down · 주문 필 ready · 호가 20행 · 99,000 · 실효 불투명도 불변 · 복구 뒤 live"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#Phase 26 D-01 · D-04 — 시세 끊김은 시세 필만 적색 · 호가 숫자 불변 · 복구 뒤 live"
        status: pass
      - kind: e2e
        ref: "playwright test trading-workbench · me · a11y --grep-invert '5\\. 격자 1/2/3단|P20-3 최악값|16px 다' — 95 passed · 0 failed · 0 flaky"
        status: pass
    human_judgment: false
  - id: D5
    description: "두 상태줄의 실제 모양이 채택 목업(안 B · 라이트/다크 · 폰 폭 360 끊김 줄바꿈)과 같은가"
    verification: []
    human_judgment: true
    rationale: "e2e 는 잘림 0 · 슬롯 · 톤 속성만 단언한다. 목업과의 시각 일치(점 크기 · 색 · 줄바꿈 위치)는 사람이 봐야 한다"

duration: 14min
completed: 2026-10-01
status: complete
---

# Phase 26 Plan 14: 배지 2축 구현 (안 B) Summary

**`/trading` 과 My page 상태줄에 「● 시세」 필을 세우고 옛 DMA 필을 「● 주문」 으로 바꿨다. 시세 공유 연결이 끊기면 시세 필만 적색 「● 시세 09:41:52~ 멈춤」 이 되고 주문 필과 호가 숫자는 그대로다. 두 상태줄은 `quotePillOf` · `orderPillOf` 한 곳에서 판정을 받는다. 실 relay e2e 로 「끊김 → 시세만 적색 → 복구」 를 확인했다.**

## Performance

- **Duration:** 약 14분
- **Started:** 2026-09-30T15:33:31Z
- **Completed:** 2026-09-30T15:47:20Z (KST 2026-10-01 00:47)
- **Tasks:** 2/2 (둘 다 TDD — RED · GREEN 커밋 각 1)
- **Files modified:** 9 (신규 2)

## Accomplishments

- `webapp/src/lib/quote-state.ts` 를 새로 만들었다. `quotePillOf` 는 시세 필을, `orderPillOf` 는 주문 필을 판정한다. 채택안 문구와 톤은 이 파일에만 있다.
- 작업대 상태줄: 시세 필 `workbench-quote` 가 주문 필 앞에 선다. relay 가 시세 상태를 모르면 필이 없다. 정상이면 「● 시세」 이고 끊기면 점과 상태어가 `--destructive` 로 바뀐다. 구독 한도는 칩 없이 필 `title` 로만 보인다. 주문 필은 `workbench-dma` 슬롯과 `aria-live` 를 그대로 두고 접두만 「주문」 으로 바꿨다. ready 면 상태어를 보이지 않는다.
- My page 상태줄: `me-quote` · `me-dma` 필이 같은 판정 함수를 쓴다. 늘 회색이던 점이 작업대와 같은 톤 점이 됐다(메모 ④).
- `RELAY_STATE_LABELS.connecting` 을 「서버 연결 중…」 으로 바꿨다. 화면에는 「주문 서버 연결 중…」 으로 보인다.
- e2e 「Phase 26 D-01 · D-04」 는 자기 relay 를 띄운다. quote 로그인 응답을 끄고 quote 소켓을 끊으면 시세 필이 `down` 이 되고 `시세 HH:MM:SS~ 멈춤` 이 뜬다. 이때 주문 필은 ready 이고 호가는 20행 · `99,000` 에 실효 불투명도도 같다. 응답을 다시 켜면 `ok` 로 돌아온다.
- 호가 사다리 · 체결 테이프(`webapp/src/components/orderbook/*`)와 `isStale` 은 한 줄도 바꾸지 않았다(D-04).

## 채택안 반영 목록 (안 B 정본 → 구현)

| 정본 항목 | 구현 |
|---|---|
| 모름 → 시세 필 없음 | `quotePillOf(null, …)` → `null` → 조건부 렌더 |
| live 「● 시세」 | `detail: null` · sr-only 「실시간」 · 점 `--led-armed` |
| down 「● 시세 HH:MM:SS~ 멈춤」 | `formatKstMs(Date.parse(since)).slice(0, 8)` + 「~ 멈춤」 · 점 · `<b>` `--destructive` |
| down since 없음 → 「● 시세 멈춤」 | 빈 문자열 · 파싱 불가도 같은 문구(T-26-25) |
| 주문 ready 「● 주문」 | `orderPillOf` → `detail: null` · sr-only 「실시간」 |
| 주문 connecting 「● 주문 서버 연결 중…」 | 상수 변경 + idle 빈 라벨 폴백 · 점멸 |
| 주문 기타 「● 주문 {RELAY_STATE_LABELS[status]}」 | `statusLabel` 그대로 · 진행 상태만 점멸 |
| 구독 한도 = 시세 필 title · 칩 없음 | `title` 속성 · `workbench-sub-limit` 슬롯 없음(단위 단언) |
| My page 톤 점 | `bg-current` → `--led-armed` / `--flat` / `--destructive` |
| 폰 폭 — 필은 nowrap 단위 · 줄은 필 사이에서만 | 두 상태줄의 필 전부 `whitespace-nowrap` · 바는 `flex-wrap`(기존). e2e 「8.상태줄」 360 · 390 잘림 0 통과 |
| 재연결 중 시세 필은 마지막 값 유지 | 스토어가 quoteState 를 지우지 않는 26-12 동작 그대로(판정 함수는 status 를 보지 않는다) |

## 바뀐 계약 문구

- `RELAY_STATE_LABELS.connecting`: 「시세 서버 연결 중…」 → 「서버 연결 중…」. 나머지 8개 라벨은 그대로다.
- 사용처를 grep 했다. 두 상태줄의 빈 라벨 폴백과 `use-relay-socket` `statusLabel` 만 이 상수를 쓴다. relay 코드와 테스트, e2e 는 이 문구를 단언하지 않는다. 두 상태줄은 이제 둘 다 접두 「주문」 을 붙이므로 다른 화면의 문구가 바뀌는 곳은 없다. `use-relay-socket.ts:1596` 주석에 옛 문구가 남아 있지만 Phase 15 에 겪은 일을 적은 이력이라 고치지 않았다.
- 스크린리더용 「실시간」 은 새 문구가 아니다. 기존 `RELAY_STATE_LABELS.ready` 를 `sr-only` 로 다시 쓴 것이다.

## e2e 결과

- 새 케이스만 따로 돌린 결과: 2 passed (setup 포함) · 19.5초.
- 3 spec 을 전부 돌리면 「5. 격자 1/2/3단」 이 `삼성전자 over 26` 으로 실패한다. serial describe 라 뒤 59건이 돌지 않았다. 이 실패는 26-05 `deferred-items.md` 에 기록된 카드 헤더 이름 말줄임과 수치까지 같다.
- 알려진 3건을 뺀 실행(`--grep-invert '5\. 격자 1/2/3단|P20-3 최악값|16px 다'`, 26-08 과 같은 방식): **95 passed · 0 failed · 0 flaky (4.0분)**. a11y(axe) 매트릭스와 `workbench-dma` aria-live 단언, me.spec 이 여기에 들어 있다.

## TDD Gate Compliance

| 태스크 | RED | GREEN | 관찰한 RED |
|---|---|---|---|
| Task 1 | `db434497` test | `403ea305` feat | 첫 실행은 모듈이 없어 import 오류가 났다(INVALID_RED). 타입만 있는 스텁을 추가해 다시 돌렸고 13건 중 12건이 단언 실패했다. 예: `expected null to deeply equal { tone: 'ok', … }`, `expected null to be '시세 서버 연결 중…'`. 남은 1건은 `null` 케이스로, 스텁 기본값과 같아서 통과했다 |
| Task 2 | `701ebef8` test | `dde91ad8` feat | 새 4건이 모두 단언 실패했다(`expected null not to be null` ×2 · `toHaveAttribute` 대상 null ×2). 기존 11건은 통과했다. 처음에는 TypeError(`cloneNode` of null)가 나서 명시 단언으로 바꾼 뒤 커밋했다 |

- `check tdd-red-evidence` 는 vitest 출력을 파싱하지 못해서(알려진 도구 문제) 위에 관찰한 출력을 적었다.
- REFACTOR 커밋은 없다(정리할 것이 없었다).

## Task Commits

1. **Task 1 RED:** `db434497` — test(26-14): 배지 2축 판정 quotePillOf · orderPillOf 실패 테스트
2. **Task 1 GREEN:** `403ea305` — feat(26-14): 작업대 상태줄 시세 · 주문 2축 — quotePillOf
3. **Task 2 RED:** `701ebef8` — test(26-14): My page 상태줄 시세 필 · 주문 연결 문구 실패 테스트
4. **Task 2 GREEN:** `dde91ad8` — feat(26-14): My page 시세 필 · 주문 연결 문구 · 끊김 e2e

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `webapp/src/lib/quote-state.ts` — `quotePillOf` · `orderPillOf` · `QuotePill` · `OrderPill`(신규)
- `webapp/src/lib/__tests__/quote-state.test.ts` — 판정 단위 13건(신규)
- `webapp/src/components/trading/workbench/workbench-status-bar.tsx` — props `quoteState` · `subLimit` · `subLimitLabel?`, 머리 주석 ⑥, 시세 필, 주문 필
- `webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx` — props 기본값, 「주문」 문구, `시세 필 (D-01 · D-04)` describe 5건
- `webapp/src/components/trading/workbench/trading-workbench.tsx` — `quoteState={relay.quoteState}` · `subLimit` · `subLimitLabel`(카드 → relay 라벨)
- `webapp/src/components/trading/me-client.tsx` — MeStatusBar 시세 필 · 주문 필 · 톤 점, 안 쓰게 된 `PROGRESS_STATES` · `RELAY_STATE_LABELS` import 제거
- `webapp/src/components/trading/__tests__/me-client.test.tsx` — `MeStatusBar — 시세 필 (D-01 · D-04)` describe 4건
- `packages/shared/src/relay.ts` — `RELAY_STATE_LABELS.connecting` 과 Phase 26 주석
- `webapp/e2e/specs/trading-workbench.spec.ts` — 파일 끝에 자기 relay describe와 「Phase 26 D-01 · D-04」 1케이스

## Decisions Made

- 안 B 정본이 플랜의 안 A 예시보다 우선한다(플랜 context 가 지시한 규칙이다). 자세한 내용은 아래 Deviations 1에 있다.
- 주문 필 판정도 lib 로 올렸다. 두 상태줄이 서로 다른 `PROGRESS_STATES` 사본을 들고 있었는데, 안 B 로 「ready 면 상태어 숨김」 이 추가되면서 한 곳에 두지 않으면 갈라질 자리가 됐기 때문이다.
- My page 시세 필에도 `aria-live="polite"` 를 붙였다. 바 전체가 이미 polite 영역이라 중첩된다. 하지만 공지는 가장 가까운 영역 하나로 가므로 중복되지 않고, 두 상태줄의 마크업을 같게 두는 쪽을 택했다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 채택안 우선] 플랜 문구 예시(안 A)를 채택안 안 B 정본으로 바꿨다**
- **Found during:** Task 1
- **Issue:** 플랜의 behavior · artifacts 는 안 A 기준이었다(「시세 실시간」 · 「09:41:52 이후 갱신 없음」 · 구독 한도 `limit` 표시 · 「주문 실시간」). 사용자는 26-13 에서 안 B 를 골랐다.
- **Fix:** 목업 머리 「26-14 정본 목록」 대로 구현했다. live 는 「● 시세」, down 은 「● 시세 HH:MM:SS~ 멈춤」, since 없으면 「● 시세 멈춤」, ready 는 「● 주문」 이다. 구독 한도는 title 로만 보인다. `QuotePill` 에서 `limit` 필드를 뺐고, 구독 한도 문구는 `title` 에 넣었다. 정상일 때 상태어가 보이지 않으므로 `srDetail` 을 더했다.
- **Files modified:** quote-state.ts, workbench-status-bar.tsx, me-client.tsx, 테스트 3개
- **Verification:** 단위 테스트가 보이는 글자(`sr-only` 제외)를 정본 문구로 단언한다. e2e 는 `<b>` 0개와 down 정규식을 단언한다.
- **Committed in:** 403ea305, dde91ad8

**2. [Rule 2 - 누락 기능] 구독 한도 문구의 종목 라벨 입력 추가(`quotePillOf` 세 번째 인자 · `subLimitLabel` prop)**
- **Found during:** Task 1
- **Issue:** 정본 문구는 「{종목}({코드} · {거래소})」 인데 `sub.limit` 프레임에는 ISIN 과 거래소만 있다. 플랜이 정한 두 인자 시그니처로는 종목명을 채울 수 없다.
- **Fix:** 선택 인자 `subject?: IsinLabel` 를 추가했다. 작업대는 카드 name/code 를 먼저 쓰고 없으면 relay 라벨을, My page 는 relay 라벨(`useIsinLabels`)을 넘긴다. 둘 다 모르면 ISIN 원문을 쓴다(지어내지 않는다 · T-26-26 — 계좌 · 사용자 식별자 없음).
- **Committed in:** 403ea305, dde91ad8

**3. [Rule 2 - 일관성] My page 주문 필에 `data-slot="me-dma"` 와 `whitespace-nowrap` 추가**
- **Found during:** Task 2
- **Issue:** 옛 DMA 필에는 슬롯이 없어 단위 테스트가 주문 필을 집을 수 없었다. 또 채택안 폰 폭 규칙(필은 nowrap 단위)과 달랐다.
- **Fix:** 슬롯과 nowrap 을 더했다. `data-status` 와 바 전체의 `aria-live` 는 그대로 뒀다.
- **Committed in:** dde91ad8

---

**Total deviations:** 3 auto-fixed (채택안 우선 1 · 누락 기능 2)
**Impact on plan:** 셋 다 채택안을 그대로 그리는 데 필요했다. 채택안에 없는 색 · 토큰 · 보이는 문구는 추가하지 않았다(D-14).

## Issues Encountered

- 3 spec 전체 실행에서 26-05 deferred 「5. 격자 1/2/3단」(카드 헤더 이름 말줄임 · `over 26`)이 그대로 재현됐다. serial 이라 뒤 케이스가 막혀서 26-08 방식대로 알려진 3건을 빼고 다시 돌렸다(95 passed). 새로 생긴 실패는 없다. 이 플랜은 카드 헤더를 건드리지 않았다.
- 순차 · 비격리 실행 지시에 따라 `master` 에 직접 커밋했다. 매 커밋 전 `git status -sb` 와 `git diff --cached --stat` 로 내 파일만 스테이징됐는지 확인했다. 다른 세션 산출물(milestone.lock · shots/ · research/.cache)은 건드리지 않았다. push · 배포는 하지 않았다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 배지 2축이 두 상태줄에 모두 들어갔다. 남은 것은 시각 확인(coverage D5)이다. 라이트/다크 화면과 폰 폭 360 에서 시세가 끊겼을 때 오른쪽 묶음이 둘째 줄로 내려가는지 확인하면 된다.
- webapp 변경은 push 하는 순간 프로덕션에 배포된다. relay 는 26-12 까지 이미 `quote.state` 를 보낸다. 다만 이 변경을 push 하기 전에 relay 배포 상태부터 확인해야 한다(메모리 「배포는 relay 먼저 · push 나중」).
- 블로커 없음.

---
*Phase: 26-shared-quote-feed*
*Completed: 2026-10-01*

## Self-Check: PASSED
