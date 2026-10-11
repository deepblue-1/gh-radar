---
phase: quick-260930-lq5
plan: 01
subsystem: webapp/trading-card
status: complete
tags: [trading, card, order-log, strategy-log, dialog, e2e]
requires: [Phase 25 order-log feed (OrderLogFeedProvider · useUnseenOrderLogCount · strategyEventParts)]
provides:
  - CardOrderLogPopup · CardStrategyLogPopup (card-log-popups.tsx)
  - order-log-feed 한 종목 헬퍼 (ORDER_LOG_SIDE_FILTERS · matchesSide · sideFilterKind · orderNoTail · orderLogSummary)
  - CardTab = info · unfilled · holdings
affects: [card-tabs.tsx, strategy-card.tsx, trading-alerts.ts alertTabFor, e2e order-log · a11y]
tech-stack:
  added: []
  patterns: [shadcn Dialog 포털 오버레이 · 뷰포트 sm(640) 경계 · useStickToBottom 열 때마다 맨 아래]
key-files:
  created:
    - webapp/src/components/trading/card/card-log-popups.tsx
  modified:
    - webapp/src/lib/order-log-feed.ts
    - webapp/src/lib/__tests__/order-log-feed.test.ts
    - webapp/src/components/trading/card/card-tabs.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/__tests__/card-tabs.test.tsx
    - webapp/src/lib/trading-alerts.ts
    - webapp/src/lib/__tests__/trading-alerts.test.ts
    - webapp/e2e/specs/order-log.spec.ts
    - webapp/e2e/specs/a11y.spec.ts
decisions:
  - 구분 필터 매수·매도 = 구분 배지 색(tone) 축, 시세 = tone market. 창 분리 kind 로는 전체→생략 · 시세→market · 매도→sell · 매수→생략(전체)
  - 팝업을 다시 열면 구분/보기 필터는 「전체」로 초기화
  - 세그먼트 켜짐 면은 기존 --seg-on-bg/fg/shadow 토큰(목업 .seg span.on 과 라이트·다크 값 일치 — 새 토큰 0)
  - 팝업 행 구분선은 --border-subtle (프로젝트 TDS 규칙 테스트 — 목업의 --border 대신)
metrics:
  duration: ~16m
  completed: 2026-09-30
actuals:
  tokens: 27600
  tasks: 3
  commits: 4
plan_head_before: fce50bd930df8150b906f3bcaec72549269c5c74
---

# Quick 260930-lq5 Plan 01: 카드 주문로그 · 전략로그 탭 → 버튼 + 한 종목 팝업 Summary

종목 카드의 「주문로그」 · 「전략로그」 탭을 없애고, 탭 줄 오른쪽(접기 앞) outline 버튼 두 개가 그 카드 종목 · 거래소 · 계좌 범위의 가운데 다이얼로그(최대 880px · 80dvh, 폰 640 미만 전체 화면 + 두 줄 행)를 연다. 주문로그는 표 A 6열 + 요약 + 구분 세그먼트 + 창 분리, 전략로그는 시각 · 내용 2열 + 오류만. 새 조회 경로 0, 문장 조립 변경 0.

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | 주문로그 버튼 → 한 종목 팝업(표 A) · 헬퍼 · 카드 탭 연결 (tracer) | a4b45562 |
| 2 | 전략로그 버튼 → 팝업 · 전략로그 탭 제거 · alertTabFor → info | 4d7683ff |
| 3 | e2e(P25-7 · P25-7b · P25-9) · a11y axe 매트릭스 · 스크린샷 대조 · 전체 게이트 | 529af3e4 |

`commits: 4` 는 `git rev-list --count fce50bd9..HEAD` 로 잰 값이다. 이 범위에 다른 세션의 docs 커밋 `871b5013 docs(26): D-05 …` 이 하나 끼어 있어서, 이 플랜의 커밋은 3개(위 표)다.

Tracer gate: Task 1 을 커밋한 뒤 `<verify>`(vitest 4파일 · typecheck · eslint · 무변경 게이트)를 끝까지 다시 돌렸고 전부 통과한 다음 Task 2 로 넘어갔다.

## 결정 이행 (D1~D6)

- **D1:** 카드 탭은 정보 · 미체결(N) · 잔고(N) 세 개다. 탭 줄은 [주문로그][전략로그][접기] 순서다. 주문로그 배지는 팝업이 닫혀 있는 동안 들어온 범위 안 새 줄 수이고, 열면 0 이 된다. 배지가 있으면 접근성 이름이 「주문로그, 새 로그 N건」이다. 전략로그 버튼에는 배지가 없다. 피드가 없으면 주문로그 버튼도 없다.
- **D2:** shadcn `Dialog` 는 body 포털로 뜬다. 제목은 [알약] 종목명 거래소뿐이고 ISIN · 계좌 · 날짜는 없다(e2e 로 확인). 머리는 고정이고 본문만 스크롤한다. 줄은 오래된 것이 위에 있고, 열면 맨 아래에서 시작한다(`useStickToBottom` 이 열 때마다 마운트됨). 새 줄에는 왼쪽 primary 선이 붙는다.
- **D3:** 요약 줄(주문 · 체결 · 거부(빨강) · 취소 · 누적), 세그먼트 전체 · 매수 · 매도 · 시세, 건수, 창 분리(account · stock · ex · kind)가 있다. 표는 시각 · 주문번호 뒤 4자리 · 구분 배지 · 행위 · 내용(줄바꿈, mono 아님) · 누적(우측) 6열이다. 거부 행은 옅은 빨강 배경에 빨강 글자다. 상태 문구는 OrderLogList 와 같다.
- **D4:** 전략로그 팝업은 시각 · 내용 2열이고 전체 · 오류만 필터와 건수가 있다. 오류 행은 옅은 빨강 배경에 빨강 글자다. 카드 로그(최신이 index 0)를 뒤집어서 그린다.
- **D5:** 뷰포트 640 미만이면 두 팝업 모두 전체 화면이다(390×844 에서 상자 = 뷰포트, e2e 단언). 표 대신 두 줄 행을 쓴다.
- **D6:** `CardTab` 은 `"info" | "unfilled" | "holdings"` 이고, `alertTabFor` 는 vi · breakout 에 대해 cardIsNew 와 관계없이 `info` 를 돌려준다. 호출부 시그니처는 그대로다. 저장된 카드 탭 값은 원래 없어서(접힘만 저장) 저장값 가드는 필요 없었다.
- **무변경:** `shared-panels.tsx` · `order-log/` · `strategy-event-text.ts` 의 diff 는 0 이다(게이트 종료코드 0).

## 검증

- 단위 테스트: webapp vitest 전체 139 파일 · 3112 통과(1 skipped).
- 타입: typecheck(앱 + e2e) 통과.
- 린트: 건드린 파일 10개에서 eslint 경고 0.
- e2e: `order-log.spec.ts` 11/11 통과(P25-1~9 · 새 P25-7b 포함). `a11y.spec.ts`「Phase 25 axe」는 24 스캔(표면 6 × 본문 344·1280 × 라이트·다크)에서 critical/serious 0 으로 통과했다.
- 실측(P25-9, 390): 카드 탭 줄 탭 3 + 버튼 2 + 접기의 세로 중심 편차 0.0, 가로 넘침 0, 카드 폭 374 그대로. 팝업 스크롤러는 client 723 / height 915 로 넘치는 상태에서 열자마자 맨 아래였고, 새 줄이 오자 따라갔다.

## 시각 검증 (실 UI 스크린샷 · 목업 v2 A 대조)

`.planning/quick/260930-lq5-log-popup/shots/` 에 실제 브라우저(Next dev + 로컬 relay) 스크린샷을 저장했다.
- 팝업 8장: `lq5-{orderlog|stratlog}-{1280|390}-{light|dark}.png`
- 카드 탭 줄 2장: `lq5-card-{1280|390}-light.png`
- P25-7 팝업: `p25-7-card-orderlog-popup-1280.png`

Read 로 직접 열어서 대조한 장은 orderlog 1280 라이트 · 다크, orderlog 390 라이트 · 다크, stratlog 1280 라이트 · 다크, stratlog 390 다크, card 1280 · 390 라이트다.
- **①(카드):** 정보 · 미체결 · 잔고 뒤 오른쪽에 「주문로그」 · 「전략로그」 outline 버튼과 접기가 있어 목업과 일치한다(390 에서도 한 줄). 닫은 뒤 포커스가 버튼으로 돌아온 포커스 링도 보인다.
- **②A(주문로그 1280):** 알약 · 종목명 · KRX 제목, 창 분리 · 닫기 아이콘, 요약 줄(거부 빨강), 세그먼트(켜짐 흰 면 / 다크 grey300), 14건, 6열 표(번호 4자리 · 톤별 배지 · 거부 행 빨강 · 누적 우측)가 목업과 일치한다. 폭 880 · 높이 720.
- **③(전략로그 1280):** 알약 제목에 창 분리 없음, 전체 · 오류만 세그먼트 + 건수, 시각 · 내용 2열, 서버 오류 줄은 옅은 빨강 배경에 빨강 글자로 목업과 일치한다.
- **④(폰 390):** 전체 화면이고 알약이 없으며 「KRX · 주문로그」 부제가 붙는다. 두 줄 행(1줄 시각 · 배지 · 행위 · 번호 · 오른쪽 누적 N / 2줄 내용 전체)이 목업과 일치한다. 요약 줄은 계획의 재량 결정대로 폰에서도 유지했다.
- 손대는 표면 안에서 줄바꿈 · 잘림 · 겹침 결함은 찾지 못했다. 폰 스크린샷 왼쪽 아래의 「N」 원형 버튼은 Next dev 인디케이터(개발 서버 전용 오버레이)라 제품 UI 가 아니다.
- 따로 열어 보지 않은 장은 stratlog 390 라이트 한 장이다. 이 장도 같은 테스트의 크기 · 넘침 · 오류 행 단언은 통과했다.
- 스크린샷 속 전략로그 내용은 e2e 가 넣은 가짜 서버 통지 2건과 전략 등록 줄이다. 1280 라이트에서 「전략이 등록됐어요」가 두 번 찍힌 것은 테스트 시드 데이터 때문이고 UI 결함이 아니다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 팝업 행 구분선 토큰이 TDS 규칙 위반**
- **Found during:** Task 3 (webapp 전체 vitest)
- **Issue:** `styles/__tests__/tds-tokens.test.ts`「행 구분선은 hairline(--border-subtle)」 테스트가 목업 그대로 옮긴 `border-b border-[var(--border)]`(표 td · 폰 행 · 전략로그 폰 행) 3곳을 잡았다.
- **Fix:** 세 곳을 `border-[var(--border-subtle)]` 로 바꿨다. 다이얼로그 외곽선(sm:border --border)은 사면 외곽선이라 규칙 대상이 아니다.
- **Files modified:** webapp/src/components/trading/card/card-log-popups.tsx
- **Commit:** 529af3e4

**2. [Rule 3 - Blocking] DialogTrigger(asChild)가 트리거 버튼 data-slot 을 덮어씀**
- **Found during:** Task 1 (단위 테스트)
- **Issue:** Slot 이 넘기는 `data-slot="dialog-trigger"` 가 버튼 쪽 `...rest` 스프레드로 들어와 `card-log-button` 을 덮어썼다.
- **Fix:** `...rest` 를 먼저 펼치고 식별 속성을 뒤에 둔다(핸들러 · aria 는 그대로 받음).
- **Commit:** a4b45562

**3. [Rule 3 - Blocking] e2e 전략로그가 비어 있어 표 단언 실패**
- **Found during:** Task 3 (P25-7b 첫 실행)
- **Issue:** e2e 카드의 전략 로그가 비어 「로그 없음」만 보였다. 그래서 표가 없었고, 이 상태로는 목업 ③ 과 대조할 수 없었다.
- **Fix:** P25-7b 에서 전략을 시드하고(`seedLimitChasers`), 새로고침마다 서버 오류 통지 2건을 밀어 넣어 오류 행이 보이게 했다. 오류 행 `data-level="error"` 도 단언한다.
- **Commit:** 529af3e4

### 기타 조정
- a11y 매트릭스의 스캔 수 기대값을 20 에서 24 로 올렸다(카드 표면이 탭 1개에서 팝업 2개로 늘어 표면이 6개).

## Known Stubs

없음. 새 파일과 바뀐 파일 모두 실제 피드와 카드 로그에 연결되어 있다.

## Threat Flags

없음. 새 네트워크 · 인증 경로가 없다. 창 분리 URL 은 기존 경로와 같다(T-lq5-02 accept). 서버 원문은 React 텍스트 노드로만 그린다(T-lq5-01). 창 분리는 `native:hidden` + `isNativeApp()` 로 가린다(T-lq5-04).

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/card/card-log-popups.tsx
- FOUND: .planning/quick/260930-lq5-log-popup/shots/lq5-*.png (10장 — 팝업 8 + 카드 2)
- FOUND commits: a4b45562 · 4d7683ff · 529af3e4
