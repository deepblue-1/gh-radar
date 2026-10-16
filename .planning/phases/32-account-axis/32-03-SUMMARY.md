---
phase: 32-account-axis
plan: 03
subsystem: ui
tags: [react, nextjs, playwright, vitest, trading-workbench, me-page, account-axis]

requires:
  - phase: 32-account-axis
    provides: "32-01 — accountFullLabelOf(D-12 전체 라벨) · 32-02 — /me 설정 탭 구조(고른 계좌 칩 아래 탭)"
  - phase: 26
    provides: "quotePillOf · orderPillOf 배지 2축 판정(문구 · 톤 정본)"
  - phase: 29
    provides: "29-39 G-1 serverKey · staleStrategies · movedFrom 보조 줄 문구(WORKBENCH_STATUS_TEXT)"
provides:
  - "WorkbenchStatusBar({ status, statusLabel, quoteState, subLimit, subLimitLabel?, accounts, accountNo, onAccountChange, cols, onColsChange, phoneBand, onReconnect?, className? }) — 상단 줄 A 카드 한 줄(AccountPill 내장)"
  - "WorkbenchAuxLines({ account }) — 낡은 전략 · 옮김 보조 줄(카드 밖 · data-slot workbench-aux-lines · 없으면 null)"
  - "data-slot workbench-reconnect(끊김 「다시 연결」 텍스트 버튼 · workbench-dma 라이브 영역 밖 형제) · workbench-order(주문 알약 묶음)"
  - "DeviceSettingsCard · DEVICE_SETTINGS_TEXT — /me 설정 탭 「이 기기」 카드(me-device-card · me-device-tone · me-device-tone-activate)"
  - "E2E P32-top(1080 한 줄 · 순서 · 뺀 것 0 · 잘림 0)"
affects: [32-04, 32-09, 32-10]

actuals:
  tokens: 26400
  tasks: 3
  commits: 6
plan_head_before: f59be9b3b3a092fbc1f1fc836cc80122a1f68f24
plan_head_after: 8fcef91c

tech-stack:
  added: []
  patterns:
    - "라이브 영역(aria-live)과 조작 버튼은 형제로 — 시각상 한 알약은 바깥 inline-flex 묶음이 만든다"
    - "보이는 상태어를 줄일 때는 원문을 sr-only 「 — {원문}」 + title 로 남긴다(정보 손실 0)"
    - "localStorage 토글은 마운트 뒤 읽고, 오디오 resume 은 켜는 클릭 핸들러 안에서만"

key-files:
  created:
    - webapp/src/components/me/device-settings-card.tsx
    - webapp/src/components/me/__tests__/device-settings-card.test.tsx
  modified:
    - webapp/src/components/trading/workbench/workbench-status-bar.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/lib/queued-window.ts
    - webapp/src/lib/__tests__/queued-window.test.ts
    - webapp/src/lib/quote-state.ts
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/e2e/specs/a11y.spec.ts
    - .planning/phases/32-account-axis/deferred-items.md

key-decisions:
  - "h1 에 data-slot=\"workbench-title\" 을 직접 단다(래퍼 div 삭제) — 조립 순서 단위 테스트의 슬롯 이름을 살리고 머리 묶음 자식은 h1 · 카드 · (보조 줄) 셋뿐"
  - "끊김 판정은 orderPillOf 를 바꾸지 않고 상태줄이 onReconnect 유무(= UNRECOVERABLE_STATES)로 정한다 — 보이는 「끊김」 · 점 · 글자 --destructive · 원문은 sr-only · title(workbench-dma 에)"
  - "보조 줄은 head gap-2(8px) 안에서 -mt-1 로 카드와 4px · 좌우 px-1(4px) — UI-SPEC S1 수치"
  - "「이 기기」 스위치는 켜짐 ∧ 차단이어도 클릭하면 끈다 — 활성화는 별도 「클릭해 활성화」 버튼 몫(옛 아이콘 토글의 「차단이면 끄지 않는다」 는 한 버튼이 두 일을 해서 필요했던 규칙)"
  - "ACCOUNT_PILL_TITLE 문구는 그대로(32-04 D-01 에서 교체 — 플랜 Flagged assumption)"
  - "E2E 에서 뺀 슬롯의 부재는 글자(「정규 · 반영 · 다시 연결」 · 「시간외종가」)로 잰다 — Task 2 수용 기준(spec 안 옛 슬롯 이름 0)과 Task 1 의 부재 단언을 같이 만족"

patterns-established:
  - "상단 줄 준비 신호 = workbench-status-bar 카드 자신의 data-status(다른 spec 5개가 그대로 씀)"

requirements-completed: [AXIS-02]

coverage:
  - id: D1
    description: "(트레이서 · D-05) h1 자기 줄 → 상단 줄 카드 한 줄(셀렉트 → 서버키 칩 → 시세 → 주문 → ml-auto 세그먼트) → 보조 줄 · 카드 자신이 workbench-status-bar + data-status"
    requirement: AXIS-02
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx#P32 상단 줄 A (D-05 · D-06 · S1)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/trading-workbench.test.tsx#머리 — h1 자기 줄 → 상단 줄 카드 → (보조 줄) 세로 묶음"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P32-top"
        status: pass
    human_judgment: false
  - id: D2
    description: "(D-06) 「정규」 · 예약 창 배지 · 알림음 아이콘 · 반영 시각 · 「다시 연결」 Button 없음 — 77 수신 · 카드 예약 표시 유지"
    requirement: AXIS-02
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx#뺀 것 — 예약 창 배지 · 알림음 · 반영 시각 · 「다시 연결」 Button 이 없다"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#G-21-R3-10 이전 — 시간외종가 G2 창 (주문유형 offhours 활성 · 상단 줄 창 배지 글자 없음)"
        status: pass
    human_judgment: false
  - id: D3
    description: "(D-06 · S1 error) UNRECOVERABLE → 「주문 끊김」(--destructive) + 라이브 영역 밖 형제 「다시 연결」(--primary) · 원문 sr-only · title · unauthorized 링크 없음"
    requirement: AXIS-02
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx#끊김 · 「다시 연결」 4건 · unauthorized"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/a11y.spec.ts#/trading — 위반 0 (④ workbench-dma aria-live)"
        status: pass
    human_judgment: false
  - id: D4
    description: "(D-15 · S9) /me 설정 탭 「이 기기」 카드 · Switch 「돌파 알림음」 · 저장 gh-radar:breakout-tone · 켜는 클릭 안 resume · 켜짐 ∧ 차단 「클릭해 활성화」"
    requirement: AXIS-02
    verification:
      - kind: unit
        ref: "webapp/src/components/me/__tests__/device-settings-card.test.tsx (7)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/me-client.test.tsx"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/a11y.spec.ts#/me — 위반 0 (설정 탭 스캔에 새 카드 포함)"
        status: pass
    human_judgment: false
  - id: D5
    description: "(Pitfall 4) 상단 줄 준비 신호를 쓰는 다른 spec 회귀 — order-log · unfilled-progress · stock-detail-tabs · trading-workbench"
    requirement: AXIS-02
    verification:
      - kind: e2e
        ref: "order-log 13 · unfilled-progress 6 · stock-detail-tabs 13 전부 통과 · trading-workbench 77 통과 / 1 실패(P31-3 기존 결함 · deferred) / 3 미실행"
        status: partial
    human_judgment: false
  - id: D6
    description: "S1 · S9 시각(목업 ① A 대비 · 이 기기 카드 면 · 44px 행) — 목업 대비 시각 판정"
    verification:
      - kind: automated_ui
        ref: "E2E P32-top 1080 한 줄 · 잘림 0 · 가로 스크롤 0"
        status: pass
    human_judgment: true
    rationale: "목업 대비 시각 판정(색 · 간격 · 「끊김 · 다시 연결」 알약 모양)은 사람 몫(UI 리뷰)"

duration: 30min
completed: 2026-10-16
status: complete
---

# Phase 32 Plan 03: 작업대 상단 줄 A · 「이 기기」 알림음 이전 Summary

**작업대 머리를 「트레이딩」 h1 → 계좌 셀렉트 · 서버키 칩 · 시세 · 주문 · 세그먼트 한 줄 카드 → 카드 밖 보조 줄로 다시 세우고(「정규」 배지 · 알림음 · 반영 시각 · 다시 연결 버튼 제거, 끊김일 때만 알약 안 「다시 연결」), 돌파 알림음 토글을 /me 설정 「이 기기」 스위치 카드로 옮겼다(AXIS-02 · D-05 · D-06 · D-07 · D-15).**

## Performance

- **Duration:** 약 30분(벽시계 측정값)
- **Started:** 2026-10-16T05:02:12Z
- **Completed:** 2026-10-16T05:32:20Z
- **Tasks:** 3
- **Files modified:** 13 (생성 2 · 수정 11 — deferred-items.md 포함)

## Accomplishments
- `WorkbenchStatusBar` 가 `AccountPill` 을 품는다 — props 에 `accounts` · `accountNo` · `onAccountChange` 추가, `queuedWindow` · `appliedAt` · `account` 삭제. 루트 슬롯 · `data-status` · `workbench-dma`/`workbench-quote` `aria-live` 유지(다른 spec 준비 신호 그대로)
- 끊김(UNRECOVERABLE): 보이는 「주문 끊김」 + sr-only 「 — 회선 단절」 + `title`, 라이브 영역 밖 형제 `workbench-reconnect` 텍스트 버튼
- `WorkbenchAuxLines` — 낡은 전략 · 옮김 보조 줄을 카드 밖(머리 묶음 안)으로. 필드 없으면 요소 0
- `AccountPill` 옵션 글자 = `accountFullLabelOf`(D-12 — 종전 인라인 조립과 같은 글자)
- 소비처 0 코드 삭제: 77 상태줄 배지 판정 함수 · 반환 타입 · 단위 describe, 작업대 반영 시각 훅 + 그 훅만 쓰던 `clockNow`
- `DeviceSettingsCard`(/me 설정 탭 상따 기본설정 아래) — Switch 「돌파 알림음」 · 캡션 `aria-describedby` · 켜짐 ∧ 차단이면 「클릭해 활성화」. 저장 키 · 작업대 재생(`readTonePref`) 불변
- E2E `P32-top` 신규 · 기존 반영 시각 · G2 창 배지 단언 정리 · 접힘 그룹 4→5 기존 결함 3곳 해소(32-02 deferred 닫음)

## Task Commits

1. **Task 1 (tracer): 상단 줄 A 한 줄** — `31d6a073` (feat) · 트레이서 게이트: `<verify>`(vitest 44/44 · E2E P32-top + aria-live/live 4 passed · a11y `/trading` live 단언 포함 2 passed) 통과 → 확장
2. **Task 2: 소비처 0 코드 제거 · E2E 정리** — `2c4d17cf` (refactor)
3. **Task 3: /me 「이 기기」 카드(TDD)** — RED `46430515` (test) → GREEN `6d4e3822` (feat)
4. **(플랜 검증 중) a11y axe 매트릭스 접힘 4→5** — `9d74ac8a` (test · 기존 결함)
5. **(자체 점검) 머리 주석의 루트 슬롯 문자열 중복 제거** — `8fcef91c` (docs · 수용 grep 「1줄」)

`commits: 6` 은 `git rev-list --count --grep="(32-03)" f59be9b3..HEAD` 측정값이다(SUMMARY 커밋 전). 같은 구간 전체 `rev-list --count` 는 7 — 동시 세션의 `425eaeec docs(33): …` 가 사이에 끼어 있다(이 플랜 커밋 아님).

## TDD (Task 3)
- **RED** (`46430515`): 테스트 + `return null` 자리표시. 7건 전부 실패 — 실패 지점이 전부 계획한 요소 부재였다(`TestingLibraryElementError: role "switch" name "돌파 알림음"` ×4 · `expected null not to be null`(카드 · 활성화 버튼) ×2 · 활성화 버튼 클릭 대상 없음 ×1). 임포트 · 문법 · 픽스처 오류 0(첫 시도는 모듈 미존재 임포트 오류라 INVALID_RED 로 보고 자리표시를 넣어 다시 돌렸다). 플랜 `type: execute` 라 TAP 분류기(`check tdd-red-evidence`)는 돌리지 않았고 위 의미 판정만 기록한다(32-01 · 32-02 와 같은 처리).
- **GREEN** (`6d4e3822`): device-settings-card 7/7 · me-client 24/24.
- **REFACTOR:** 없음.

## Decisions Made
- h1 에 `data-slot="workbench-title"` 을 직접 달고 래퍼 div 를 지웠다 — 머리 묶음 자식이 h1 · 카드 · (보조 줄) 셋.
- 끊김 표기는 `orderPillOf` 불변 · 상태줄이 `onReconnect` 유무로 판정. 원문 `title` 은 `workbench-dma` 에(버튼 호버에 상태어가 뜨지 않게).
- 「다시 연결」 버튼 글자 크기는 카드 상속 12px(`--t-caption`) + 600 — UI-SPEC 12/600. (`--t-sm` 은 14px 라 쓰지 않았다.)
- 「이 기기」 스위치: 켜짐 ∧ 차단에서 스위치를 누르면 끈다 — 활성화는 별도 버튼(스위치는 보이는 그대로 동작).
- E2E 부재 단언은 글자로 — spec 안 옛 슬롯 이름 0(Task 2 수용 기준)과 Task 1 부재 단언 동시 충족.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] trading-workbench 단위 테스트의 머리 구조 단언**
- **Found during:** Task 1
- **Issue:** `trading-workbench.test.tsx`(플랜 파일 목록 밖)가 「계좌 셀렉트가 `workbench-title` 안」 · 「`workbench-head` flex-wrap · 상태줄 `flex-[1_1_auto]`」 를 단언 — 새 구조에서 깨진다.
- **Fix:** 셀렉트는 상단 줄 카드 안 · 머리는 `flex-col`(h1 → 카드) · 보조 줄 없으면 자식 2개로 고쳤다(뷰포트 브레이크포인트 금지 단언 유지).
- **Files modified:** webapp/src/components/trading/__tests__/trading-workbench.test.tsx
- **Committed in:** `31d6a073`

**2. [Rule 3 - Blocking] 접힘 그룹 4→5 기존 결함 3곳(검증 경로 차단)**
- **Found during:** Task 1 · Task 2 · 플랜 검증
- **Issue:** quick-261012-oif(매수취소 접이식)이 상따 카드 접힘 그룹을 5개로 늘렸는데 a11y `/trading` 케이스(400) · a11y `setLcFolds`(331) · trading-workbench P24-2(3573)가 4를 기대. a11y `/trading` 은 플랜이 요구한 live 단언(463)보다 앞에서 실패하고, P24-2 는 serial 묶음이라 뒤 24건을 미실행으로 만들었다.
- **Fix:** 세 곳 기대값을 실측 5로 · 주석에 매수취소 추가. 32-02 deferred 항목을 해소로 표기.
- **Files modified:** webapp/e2e/specs/a11y.spec.ts · webapp/e2e/specs/trading-workbench.spec.ts · deferred-items.md
- **Committed in:** `31d6a073` · `2c4d17cf` · `9d74ac8a`

**3. [Rule 1 - 정리] 반영 시각 훅만 쓰던 `clockNow` 삭제**
- **Found during:** Task 2
- **Issue:** `useAppliedAt` 삭제 뒤 작업대 `clockNow` 소비처 0.
- **Fix:** 함수 삭제(strategy-card · strategy-log-feed 의 동명 함수는 각자 파일 소유라 무관).
- **Committed in:** `2c4d17cf`

**4. [Rule 2 - 정합] G2 창 E2E 의 77 도착 확인 경로**
- **Found during:** Task 2
- **Issue:** 창 배지가 77 도착 신호였다 — 지우면 「배지 없음」 단언이 77 도착 전에 헛통과할 수 있다.
- **Fix:** 주문유형 `offhours` 옵션 활성(= 77 G2 도착) 뒤에 「상단 줄에 『시간외종가』 글자 없음」 을 단언. 폭별 잘림 0 루프는 상단 줄 대상으로 유지.
- **Committed in:** `2c4d17cf`

---

**Total deviations:** 4 auto-fixed (Rule 3 ×2 · Rule 1 · Rule 2)
**Impact on plan:** 범위 확장 없음 — 전부 이 플랜의 검증 경로를 열거나 지운 표면의 잔여물 정리.

## Issues Encountered
- **trading-workbench P31-3(폰 시트 환산 · 비교가 0 에코 아래 줄) 실패 — 기존 결함 · 범위 밖.** `lc-sell-watch-qty` 아래 줄이 「비교가격 필요」 대신 「777주」. 단독 재실행에서도 결정적. 32-03 은 상따 카드 · lc 를 건드리지 않았다 → `deferred-items.md` 에 기록(원인 추정 261012 quick 들).
- 첫 전체 실행에서 test 1(옛 경로 리다이렉트)이 `/` 로 튕긴 1회 — 재실행에서 통과(일시적 · 인증 세션 추정).

## Verification
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` — exit 0
- `vitest run src/components/trading src/components/me src/lib --maxWorkers=2` — 103 files · 3179 passed · 1 skipped · FAIL 0
- `playwright … a11y.spec.ts` — 13/13 · `me.spec.ts` — 전부 통과(29) · order-log 13 · unfilled-progress 6 · stock-detail-tabs 13 통과
- `playwright … trading-workbench.spec.ts` — 77 통과 · 1 실패(P31-3 기존 결함) · 3 미실행
- 수용 grep: `WorkbenchAuxLines(` 1 · `workbench-reconnect` 1 · `workbench-status-bar` 1(`8fcef91c` 뒤) · `workbench-dma` 1 · 옛 슬롯 3종 0 · trading-workbench.tsx `WorkbenchAuxLines` 2 · `queuedWindowBadgeOf|useAppliedAt` (src) 0 · spec `stat-applied|workbench-window-badge` 0 · `DeviceSettingsCard(` 1 · 캡션 1 · `writeTonePref(` 2 · `<DeviceSettingsCard` 1

## User Setup Required
None.

## Next Phase Readiness
- 32-04(작업대 계좌 스코프 D-01)는 `WorkbenchStatusBar` 의 `accounts` · `accountNo` · `onAccountChange` 를 그대로 쓰고 `ACCOUNT_PILL_TITLE` 만 S1 새 문구로 바꾸면 된다.
- push 하지 않았다(웨이브 push 는 32-10).

## Self-Check: PASSED
- FOUND: webapp/src/components/me/device-settings-card.tsx · webapp/src/components/me/__tests__/device-settings-card.test.tsx · webapp/src/components/trading/workbench/workbench-status-bar.tsx
- FOUND commits: 31d6a073 · 2c4d17cf · 46430515 · 6d4e3822 · 9d74ac8a · 8fcef91c
- 수용 grep 재확인 중 `data-slot="workbench-status-bar"` 가 머리 주석에도 있어 2줄 → `8fcef91c` 로 1줄
