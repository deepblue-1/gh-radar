---
phase: quick-260922-tqr
plan: 01
subsystem: webapp/trading-workbench · orderbook · search
tags: [ui-cleanup, ios, a11y, vi, trade-tape]
status: complete
requires: []
provides:
  - "작업대 상태줄 알림 묶음 = 돌파 알림음 1개 (VI 브라우저 알림 기능째 제거)"
  - "vi-alert.ts = manwonToKrw · krwToManwon · MAX_VI_ORDER_AMOUNT_MANWON · isViServerMessage 만"
  - "CommandInput · StockSearchField 입력 글꼴 터치 16px / 마우스 14px"
  - "체결 테이프·상따 카드 수량 색 설명 문구 0"
affects: [webapp]
tech-stack:
  added: []
  patterns: ["pointer-fine: 변형으로 입력 글꼴을 기기 성질(포인터)로 가름 — 폭 브레이크포인트 아님"]
key-files:
  created: []
  modified:
    - webapp/src/components/trading/workbench/workbench-status-bar.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/lib/vi-alert.ts
    - webapp/src/lib/alert-tone.ts
    - webapp/src/lib/breakout-list.ts
    - webapp/src/components/trading/workbench/vi-settings-rows.tsx
    - webapp/src/components/ui/command.tsx
    - webapp/src/components/trading/workbench/stock-add-bar.tsx
    - webapp/src/components/orderbook/trade-tape.tsx
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
    - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
    - webapp/src/lib/__tests__/vi-alert.test.ts
    - webapp/src/components/orderbook/__tests__/trade-tape.test.tsx
    - webapp/e2e/specs/search.spec.ts
    - webapp/e2e/specs/trading-workbench.spec.ts
  deleted:
    - webapp/src/lib/use-vi-end-alerts.ts
decisions:
  - "iOS 확대 방지는 16px 글꼴로만 — viewport 확대 금지 미사용(핀치줌 유지)"
  - "입력 글꼴 분기는 sm:/md: 가 아니라 pointer-fine: — iPhone 가로(844~932px)에서도 16px 유지, 포인터 미상이면 16px(안전)"
  - "tapeSidesOf 반환에서 usedFallback 제거(유일 소비처가 설명 문구) — 내부 추정 게이트는 needsFallback 로 이름만 바꿔 유지"
metrics:
  duration: "~6m"
  completed: 2026-09-22
plan_head_before: 0696fa0
actuals:
  tokens: 20000
  tasks: 3
  commits: 3
---

# Phase quick-260922-tqr Plan 01: 작업대/호가 UI 정리 Summary

VI 마감 알림 토글을 기능째 제거하고(훅·타이머·권한·Notification 0), iPhone 검색 입력의 포커스 확대를 `pointer-fine:` 기반 16px/14px 로 막고, 체결 테이프·상따 카드의 수량 색 설명 문구를 걷어냈다. 매수/매도 판정과 VI 금액 변환은 불변.

## Tasks

| # | Task | Commit | 요지 |
|---|------|--------|------|
| 1 | VI 마감 알림 토글 기능째 제거 (TQR-01) | 401aaf3 | ViAlertToggle · onViAlertChange · use-vi-end-alerts.ts(git rm) · vi-alert 알림 export 삭제, 포인터 주석 3곳 정리 |
| 2 | iPhone 검색 입력 확대 방지 (TQR-02) | 237aa49 | CommandInput `text-base pointer-fine:text-sm`, StockSearchField `text-[length:var(--t-base)] pointer-fine:text-[length:var(--t-sm)]` + e2e 4단언 |
| 3 | 체결 테이프 설명 문구 + 카드 캡션 제거 (TQR-03) | 00b7e4c | SIDE_NOTE 2개 · 하단 `<p>` · card-body 캡션 삭제, `TapeSidesResult.usedFallback` 삭제 |

## RED → GREEN 기록

- **Task 1:** 상태줄 부재 단언 테스트를 먼저 바꿔 실행 → `workbench-alerts` 안 버튼 2개로 **RED**(expected length 1, got 2). 코드 제거 후 관련 5파일 195/195 **GREEN**.
- **Task 3:** ⑫ ⑬ ⑧ compact 4건을 먼저 바꿔 실행 → 정확히 그 4건 **RED**(21 pass / 4 fail). 코드 제거 후 trade-tape 25/25, 관련 4파일 82/82 **GREEN**. ⓪-1(추정 호출 0회) · ⓪-3(1회) spy 단언은 유지 — 추정 게이트 증명 그대로.

## 브레이크포인트 선택 근거 (`pointer-fine:` vs `sm:`)

iOS Safari 의 확대는 **터치 기기에서 16px 미만 입력에 포커스**할 때 일어난다 — 폭과 무관하다. `sm:`(640) · `md:`(768) 로 가르면 iPhone 가로 모드(844~932px)가 데스크톱 쪽으로 떨어져 14px 로 돌아가 다시 확대된다. 그래서 기본값을 16px 로 두고 `@media (pointer: fine)` 에서만 14px 로 되돌렸다. 포인터를 모르는 환경은 16px(확대 안 함) 쪽이라 안전하고, 마우스 데스크톱은 어떤 폭에서도 기존과 픽셀 동일하다. 근거 주석은 `command.tsx`(정본)와 `stock-add-bar.tsx`(참조)에 있다. `app/layout.tsx` viewport 는 건드리지 않았다(`maximumScale`/`userScalable` 없음 grep 확인).

## Verification

| Gate | 결과 |
|------|------|
| typecheck (`tsc --noEmit && tsc -p tsconfig.e2e.json`) | 오류 0 |
| 전체 vitest | **92 files · 1456 pass / 1 skip** (기준선 1472 → 1456, **−16** = vi-alert.test 25→10 (−15) + workbench-status-bar 16→15 (VI 토글 2건 → 부재 단언 1건, −1); trade-tape 25→25) |
| eslint (변경 16파일) | 오류 0 · 경고 1 (`search.spec.ts:10` `modKey` 미사용 — 기존 경고, 이번 변경 무관) |
| Playwright `trading-workbench orderbook search` | **54 passed / 0 skipped / 0 failed** (2.1m, PORT=3100 · relay 픽스처 8090). 새 테스트 3건(검색 14px · 검색 터치 16px · 작업대 터치 16px) + 테스트 9 14px 단언 + 테스트 20 토글 0개 포함 |
| search 단독 | 8 passed |
| 잔재 grep (`마감알림|useViEndAlerts|use-vi-end-alerts|SIDE_NOTE|체결구분 기준`, `__tests__` 제외) | 출력 없음 |

작업대 종목 추가란은 844×390 hasTouch 에서도 보여 390×844 대체는 필요 없었다. 바깥 describe `beforeEach` 가 `WIDE_VIEWPORT` 로 덮기 때문에 터치 테스트 안에서 `page.setViewportSize({844,390})` 를 다시 건다(`test.use` 의 `hasTouch` 는 컨텍스트 수준이라 유지됨).

선택 항목인 dev 서버 시각 확인은 하지 않았다 — Playwright computed-style 단언과 DOM 부재 단언으로 대신했다.

## Deviations from Plan

**1. [Rule 1 - 정리] 상태줄 테스트 describe 제목 갱신**
- 「이 기기 전용 알림 2종 (D-17 · Q-1)」 → 「돌파 알림음 (D-17)」. 알림이 1종이 되면서 제목이 사실과 달라졌다. 커밋 401aaf3.

**2. [Rule 1 - 정리] `tapeSidesOf` 내부 불리언 이름 `usedFallback` → `needsFallback`**
- 동작은 그대로(추정 게이트 유지). 반환 필드가 사라진 뒤에도 같은 이름을 남기면 검증 grep(`usedFallback:`)과 헷갈리고 의미도 「쓸지 여부」라 더 정확하다. 커밋 00b7e4c.

**3. [Rule 3] e2e 검색 열기 헬퍼는 `filter({ visible: true })` + `toPass` 재시도**
- 844 폭에서 첫 트리거가 숨겨질 수 있고, 하이드레이션 전 클릭은 조용히 사라질 수 있어(기존 ⌘K 테스트 주석과 같은 경주) 다이얼로그가 열릴 때까지 다시 누른다. 커밋 237aa49.

그 밖에는 계획대로 실행했다.

## Known Stubs

없음.

## Unresolved / Handoff

- **push 하지 않음** — push 는 webapp 프로덕션 배포이고 Phase 18 relay(R2~R4) 미배포 상태라 배포 순서(relay → 검증 → webapp push)를 지키려고 보류했다. push 여부·시점은 사용자가 정한다.
- 사용자 브라우저에 남은 `gh-radar:vi-alert` localStorage 키는 무해해서 정리 코드를 넣지 않았다(T-tqr-05 accept).

## Self-Check: PASSED

- FOUND: webapp/src/lib/vi-alert.ts · workbench-status-bar.tsx · command.tsx · stock-add-bar.tsx · trade-tape.tsx · card-body.tsx
- DELETED (의도): webapp/src/lib/use-vi-end-alerts.ts
- FOUND commits: 401aaf3 · 237aa49 · 00b7e4c (`git rev-list --count 0696fa0..HEAD` = 3)
