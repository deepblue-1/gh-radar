---
phase: 18-gh-trade-ui-nxt-vi
plan: 13
subsystem: testing
tags: [e2e, playwright, trading, workbench, container-query, a11y, cleanup, validation]
status: complete

requires:
  - phase: 18-12
    provides: "옛 트레이딩 라우트 4개 리다이렉트 · 사이드바 「트레이딩」 제목 링크 + 3단"
  - phase: 18-11
    provides: "/trading 작업대(TradingWorkbench · CardGrid · WorkbenchStatusBar · SharedPanels 조립)"
  - phase: 18-03
    provides: "(미실행 · 사용자 승인 대기) dma_orders 마이그레이션 원격 반영 — 배포 순서상의 선행 조건일 뿐 이 플랜의 코드 작업은 막지 않았다"
provides:
  - "webapp/e2e/specs/trading-workbench.spec.ts — /trading 작업대 e2e 28케이스(신설 8 + 옛 상따·VI e2e 이관 20)"
  - "webapp/e2e/overflow.ts — 잘림 판정 헬퍼 2종(leavesOverflowing · scrollOverflowing)의 유일한 정의(승격)"
  - "작업대 카드 서버 거부 인라인 경보(card-server-error) · VI 몫 서버 거부 경보(vi-server-error · lib/use-vi-server-error.ts)"
  - "폰 밴드 공용 패널 = body 포털 fixed + 흐름 안 자리(sticky 가 한 번도 붙지 않던 결함 수정)"
  - "옛 상따·VI 화면 컴포넌트 3종 · 단위 테스트 3종 · 옛 e2e 2종 삭제"
  - "18-VALIDATION.md 확정(status validated · wave_0_complete true · nyquist_compliant false + 사유)"
affects: [18-verify, uat, deploy]

actuals:
  tokens: 127000
  tasks: 3
  commits: 16
plan_head_before: 078371e9d8c3679af5bfe4b46deeae21710375ed

tech-stack:
  added: []
  patterns:
    - "카드 컨테이너 폭은 뷰포트를 재고-옮기고-다시 재서 정확히 맞춘 뒤 「맞췄다」 자체를 단언, 밴드는 카드 본문 첫 칸의 계산 폭으로 판정"
    - "스크롤·말줄임이 계약인 표면은 같은 판정(scrollOverflowing) 결과에서 계약 대상 슬롯만 걸러 낸다 — 새 판정식을 쓰지 않는다"
    - "wb(layout containment) 안에서 뷰포트에 붙여야 하는 요소는 더티 바처럼 document.body 포털 + 흐름 안 자리"

key-files:
  created:
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/e2e/overflow.ts
    - webapp/src/lib/use-vi-server-error.ts
    - webapp/src/lib/__tests__/use-vi-server-error.test.ts
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
  modified:
    - webapp/e2e/specs/sidebar-tree.spec.ts
    - webapp/e2e/specs/a11y.spec.ts
    - webapp/e2e/specs/me.spec.ts
    - webapp/e2e/specs/orderbook.spec.ts
    - webapp/src/components/trading/workbench/shared-panels.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/workbench/vi-settings-rows.tsx
    - webapp/src/components/trading/workbench/vi-trigger-strip.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/styles/globals.css
    - webapp/src/components/trading/__tests__/shared-panels.test.tsx
    - webapp/src/components/trading/__tests__/stock-add-bar.test.tsx
    - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
    - webapp/src/components/trading/__tests__/vi-trigger-strip.test.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - .planning/phases/18-gh-trade-ui-nxt-vi/18-VALIDATION.md
  deleted:
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/components/trading/vi-client.tsx
    - webapp/src/components/trading/vi-settings-card.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
    - webapp/src/components/trading/__tests__/vi-client.test.tsx
    - webapp/src/components/trading/__tests__/vi-settings-card.test.tsx
    - webapp/e2e/specs/trading-limit-chaser.spec.ts
    - webapp/e2e/specs/trading-vi.spec.ts

key-decisions:
  - "폰 밴드 공용 패널은 sticky 가 아니라 document.body 포털 fixed + 흐름 안 자리(spacer)다 — 앱 셸 main(overflow-auto)이 sticky 컨테이너인데 스크롤은 창이 해서 sticky 가 한 번도 붙지 않았다. 앱 셸을 고치면 종목상세 탭 바 등 다른 sticky 가 한꺼번에 살아나므로 패널에서 푼다"
  - "서버 거부(ServerMessage ERROR)는 카드 인라인 role=alert(card-server-error)와 VI 두 줄 아래 role=alert(vi-server-error)로 되살린다 — 옛 두 화면의 상태줄 경보 계약(T-16-07)을 작업대가 잃고 있었다(거부가 닫힌 로그 탭에만 쌓임)"
  - ".tbl-wrap 는 overflow-x auto 다 — 레이어 밖 규칙이 Table 의 overflow-x-auto 를 이겨 좁은 폭 표가 스크롤 대신 조용히 잘렸다(폰 VI 발동 표 132px)"
  - "옛 e2e 두 파일은 「삭제 또는 흡수」 중 흡수 후 삭제로 확정 — relay 왕복 단언 20건을 trading-workbench 9~28 로 옮겼다"
  - "옛 화면 고유 기능 4건(VI 최근 발동 줄 · 장 마감 표시 · VI 미체결 거래소 필터/전체 취소 · 미체결 출처 태그)은 새 UI 를 목업 없이 만들지 않고 사용자 결정으로 올린다 — 이 기능들은 18-12 리다이렉트 이후 이미 도달 불가였다"
  - "TRADE-07 은 완료 표시하지 않는다 — 코드·자동 게이트는 끝났지만 실 DB 경로가 18-03(마이그레이션 원격 반영) 미실행에 걸려 있다"

requirements-completed: [TRADE-06, TRADE-08, TRADE-09]

coverage:
  - deliverable: "/trading 작업대 e2e — 리다이렉트 · 단 수 · 카드 4밴드 잘림 0 · 격자 조합 · 스택 · 칩 클릭 · 더티 바 겹침 · 상태줄 wrap"
    human_judgment: false
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#1~8"
        status: pass
  - deliverable: "옛 상따·VI e2e relay 왕복 단언 이관(20건)"
    human_judgment: false
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#9~28"
        status: pass
  - deliverable: "기존 e2e 4종 갱신(sidebar-tree · a11y · me · orderbook)"
    human_judgment: false
    verification:
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp run test:e2e (137 pass / 0 fail)"
        status: pass
  - deliverable: "옛 컴포넌트 3종·테스트 제거 + 단언 이관(커버리지 대조표)"
    human_judgment: false
    verification:
      - kind: test
        ref: "strategy-card-flow.test.tsx(26) · stock-add-bar.test.tsx(+7) · vi-settings-rows.test.tsx(+3) · use-vi-server-error.test.ts(4) · trading-workbench.test.tsx(+1)"
        status: pass
      - kind: command
        ref: "! grep -rq 'vi-client|vi-settings-card|limit-chaser-client' webapp/src webapp/e2e · ! grep -rq VI_EDIT_EXCHANGE webapp/src"
        status: pass
  - deliverable: "옛 화면 고유 기능 4건의 거취(설계상 미이관)"
    human_judgment: true
    rationale: "새 UI 를 만들지 않고 사용자 결정으로 올렸다 — 아래 「사용자 결정 필요」"
  - deliverable: "실 게이트웨이 정정 왕복 · 예약/시간외종가 실발주 · 자동재생 차단 표시 · VI 확인 거부 왕복"
    human_judgment: true
    rationale: "자동 게이트로 닫히지 않는 실기 관측 항목 — UAT 인계(아래)"

duration: 48min
completed: 2026-09-22
---

# Phase 18 Plan 13: `/trading` 작업대 자동 게이트 마감 Summary

**`/trading` 작업대 e2e 28케이스를 새로 세웠습니다. 카드 폭 경계 여섯 곳과 격자·뷰포트 조합에서 잘림이 0 이고, 밴드 판정이 카드 폭 기준이라는 것이 실브라우저로 증명됐습니다. 옛 상따·VI 화면의 파일과 테스트는 단언을 전부 옮긴 뒤 지웠습니다. 전량 게이트는 green 입니다.**

실측 중 결함 다섯 건을 찾아 고쳤습니다.
- 폰 밴드 공용 패널의 sticky 가 한 번도 붙지 않았습니다.
- 서버 거부가 화면에 서지 않았습니다(카드 · VI 두 곳).
- 좁은 폭 표가 스크롤 대신 잘렸습니다.
- VI 칩 줄에 키보드로 닿을 수 없었습니다.
- 카드 폭 992 에서 세그먼트 글자가 2px 잘렸습니다.

## Performance

- **Duration:** 약 48분
- **Started:** 2026-09-22T02:42:01Z
- **Completed:** 2026-09-22T03:30:46Z
- **Tasks:** 3
- **Files:** 신설 5 · 수정 17 · 삭제 8

## Accomplishments

- **작업대 e2e 신설 (Task 1)** — `trading-workbench.spec.ts` 1~8
  - 옛 경로 4개가 실제 네비게이션으로 `/trading` 에 닿습니다. `[key]` 는 `?focus=` 로 가고 그 카드가 펼쳐집니다.
  - 단 수 1/2/3 을 누르면 계산된 열 수가 바뀌고, 새로고침해도 유지됩니다. 폰에서는 세그먼트가 DOM 에 없고 1단입니다.
  - 돌파 칩을 누르면 카드 1장(KRX · 스위치 OFF · 기본값)이 서고, 그 칩이 「거래중」이 됩니다. 서버 송신은 0 입니다.
  - 카드 컨테이너를 699/700 · 829/830 · 991/992 로 정확히 맞춥니다. 폭에서 기대한 밴드와 CSS 가 고른 밴드(본문 첫 칸 계산 폭)가 같고, 잘림은 0 입니다.
  - 격자 × 뷰포트 조합의 밴드를 박제했습니다: 1440 = 1단 데스크톱 · 2단 폰 · 3단 폰 / 1920 = 1단 데스크톱 · 2단 컴팩트 · 3단 폰 / 360·390 = 폰.
  - 펼침 0/1/2+ × 접힘 0/1/N 조합에서 스택은 격자 한 칸이고, 펼친 카드가 먼저 옵니다.
  - 폰 더티 바와 공용 패널의 `boundingBox()` 가 겹치지 않고, 패널이 실제로 바 바로 위에 붙습니다(접힘 · 펼침 · 맨 아래).
  - 폰 상태줄은 2줄 이상으로 wrap 하고 잘림이 0 입니다.
  - 잘림 판정 두 가지는 `e2e/overflow.ts` 로 **옮겼습니다**(본문 무변경). 새 판정식은 없습니다.
- **옛 e2e 이관 (Task 2)** — 9~28 = 상따 11건 · VI 9건. 목록은 아래 대조표에 있습니다.
- **기존 e2e 4종 갱신 (Task 2)**
  - sidebar-tree: 「트레이딩」 제목 링크, 3단(KRX VI · NXT VI · 등록 전략 LED 3점 톤), 링크 순서, `?focus=` 로 그 등록 카드 펼침을 봅니다.
  - a11y: 옛 3케이스를 `/trading` 데스크톱 · 폰 · VI 케이스로 교체했습니다.
  - me: 전략 행 링크 대상을 바꿨습니다. 사이드바 아이콘 단언은 LED 로 옮겼습니다.
  - orderbook: 18-10 셀렉터 표대로 갱신하고, 더티 바 ↔ AI FAB 겹침 0(390 · 1440)을 신설했습니다.
- **옛 컴포넌트 제거 (Task 2)** — 3파일과 테스트를 지웠습니다. 저장소에 옛 모듈명·`VI_EDIT_EXCHANGE` 가 0건입니다.
- **전량 게이트 · 검증 계약 (Task 3)** — 결과는 아래 숫자에 있습니다. `18-VALIDATION.md` 의 미기입 칸은 0 입니다.

## Task Commits

1. **Task 1: 작업대 e2e 신설** — `bd53969`
   - 실측 결함 수정: 공용 패널 RED `0044d04` → GREEN `4517a41`, 세그먼트 992 `45af913`
2. **Task 2: 기존 e2e 갱신 · 옛 컴포넌트 제거**
   - 카드 훅 규율 이관 + 서버 거부 RED `fd0b7dc` → GREEN `312d3dd`
   - VI 서버 거부 RED `ac9f33c` → GREEN `c2adcc0`
   - 검색 규율 이관 `c9aa0b6`
   - 표 잘림 수정 `9eb8189`
   - e2e 이관 9~28 `e7c7861`
   - VI 칩 줄 키보드 접근 `400879e`
   - sidebar · a11y · me `a4e6926`
   - orderbook `f1389f3`
   - 삭제 · 주석 정리 `c7c1616`
3. **Task 3: 전량 게이트 · VALIDATION** — `fd9271d`

## TDD Gate Compliance

- Task 1 은 `tdd="true"` 입니다. e2e 스펙 자체가 테스트입니다. 처음 실행에서 케이스 4(세그먼트 992 잘림)와 7(공용 패널 펼침 겹침 82px)이 실패했습니다. 7 은 단위 RED(`0044d04`, 2건 실패) → GREEN(`4517a41`) 으로 고쳤습니다.
- 서버 거부 두 건은 RED 커밋에서 실패 수(카드 5건 · VI 3건)를 확인한 뒤 GREEN 으로 닫았습니다.
- REFACTOR 커밋은 없습니다. `c7c1616` 은 삭제 커밋입니다.

## 전량 게이트 결과 (Task 3)

| 게이트 | 결과 | Phase 17 기준선 |
|---|---|---|
| config `build_command` 전문 (shared build · relay typecheck · relay typecheck:tests · webapp typecheck) | exit 0 | — |
| relay `vitest` | **500 passed** (20 files) | 467 |
| webapp `vitest` | **1323 passed** · 1 skipped (92 files) | 1008 |
| shared `vitest` | **108 passed** | 108 |
| Playwright 전량 | **137 passed · 0 failed** · 9 skipped · 2.9분 | 135 / 0 |

- 9 skipped 는 `watchlist.spec.ts` 5건과 `user-themes.spec.ts` 4건입니다. `SUPABASE_SERVICE_ROLE_KEY` 가 없을 때의 `test.skip` 이라 이 phase 와 무관한 선재 조건입니다.
- webapp 통과 수가 18-12(1386)보다 적은 것은 옛 테스트 3파일을 지웠기 때문입니다. 규율은 새 테스트로 옮겼습니다(아래 대조표).
- 실행 후 dev 서버(:3100)를 내렸습니다. relay 픽스처(:8090/8091)도 남아 있지 않습니다.

## 커버리지 대조표 — 지운 파일이 덮던 단언과 이어받은 자리

### e2e `trading-limit-chaser.spec.ts` (상따 화면)

| 옛 케이스 | 단언 | 이어받은 자리 |
|---|---|---|
| 1 | 빈 폼: 스위치 3종 OFF · 기본값(10 · 10,000) · 액션 바 미렌더 · 인라인 검색 | workbench 3(칩 카드) · 9(종목 추가란) |
| 2 | 종목 선택 → 가격 5칸 상한가 시딩 · 종목정보 상한 · 호가 20행 | workbench 9 |
| 3 | 스위치 즉시 전송 → 10 → 60 → 무장 LED · 로그 · 사이드바, WR-06 잠금 | workbench 10 |
| 3b | LED 3개 순서 · 보이는 라벨 · 옛 세그먼트 부재 | workbench 11 |
| 4 | 값 변경 → 바 「1개」 → 수정 → 10 → 에코 → 바 소멸 · 반영 시각 · FAB 부재 | workbench 12 |
| 5 | 다른 단말 변경 — 서버 우선 · 6초 배너 status · 로그 1줄 | workbench 13 |
| 6 | 매수·매도 OFF = 삭제(crud D) · 사이드바 제거 · 폼 초기화 · 삭제 버튼 없음 | workbench 14 |
| 7 · 7b | 서버 거부 상태줄 alert + 로그 · VI 몫 Account 통지는 먹지 않음 | workbench 15 (카드 경보로 되살림) |
| 8 | 매핑 없음 게이트가 본문 대체 · 버튼 없음 | workbench 19 |
| 9 | 390 — 42% 2열 · min-width 0 · 탭당 한 pane · 모바일 사다리 20 · compact 테이프 1 · 미체결/pane 잘림 0 | workbench 18 (탭은 「매수·매도·수동」 3탭, 미체결은 공용 패널의 가로 스크롤 표 + 말줄임·title) |
| 10 | 더티 시 이탈 확인 · 더티 0 대조군 | workbench 16 |
| 11 | 본문 700 경계: 세그먼트 잘림 0 · 헤더 검색 10칸 유지 · 3컨트롤 높이 · Esc | 세그먼트는 workbench 4(카드 700 두 판정). 헤더 검색·트리거·거래소 콤보는 설계로 사라짐(D-08 종목 추가란 · D-10 헤더 세그먼트). Esc 는 stock-add-bar 단위 테스트 |
| 12 | 뷰포트 360·390·768·1023 잘림 0 | workbench 4 · 5 (카드 폭 기준) |
| 13 | 와이드 832·880·960 체결가·체결량 잘림 0 · 데스크톱 시(時) · sr-only | workbench 17 (카드 폭) |
| 14 | ↓/Enter 키보드만으로 종목 선택 | workbench 9 |

### e2e `trading-vi.spec.ts` (VI 화면)

| 옛 케이스 | 단언 | 이어받은 자리 |
|---|---|---|
| 1 | 중지 진입 — 서버값 · 스위치/시작 · 비밀번호 UI 없음 · 사이드바 배지 · 빈 주문 문구 · 액션 바 없음 | workbench 20 |
| 2 | 수정 → 11 페이로드 run 유지 · 원 단위 · FAB 부재 · 시각 HH:MM:SS | workbench 21 (+ exchange KRX 페이로드) |
| 3 | 시작 확인 — 요약 · 기본 포커스 취소 · Close 없음 · run=true · 에코로 사이드바 | workbench 22 |
| 4 | 중지 확인 — 6건 · (유지) · 경고 · 닫기 포커스 · run=false | workbench 23 |
| 5 | 주문 6건 배지 · 부분체결 파생 · 역매핑 · 잠긴 체크 · 110초 · 캡션 | workbench 24 (작업대 11열 표) |
| 6 | 확인 체크 → 33 · 다이얼로그 없음 · 73 정정 후 해제 | workbench 25 |
| 7 | 1초 틱 · 20초 경계 색/숫자 · 진행바 폭 | workbench 26 |
| 8 | 매핑 없음 게이트 | workbench 19 |
| 10 | VI 몫 통지만 alert · 상따 몫/relay 거부 제외 | workbench 27 (VI 줄 경보로 되살림) |
| 11 | ≥1280 [설정 420 \| 계좌 556] 레이아웃 · 거래소 필터 · 전체 취소 · 출처 태그 VI | 레이아웃은 설계로 폐기(작업대 섹션 순서 D-04). **필터·전체 취소·출처 태그는 미이관 — 사용자 결정 필요** |
| 9 | 390 — 카드 행 · 세로 순서 · 잘림 0 | workbench 28 (VI 두 줄 · 스트립 · 표 · 돌파 표, 스크롤·말줄임 계약) |

### 단위 `limit-chaser-client.test.tsx`

| 옛 | 이어받은 자리 |
|---|---|
| ② ③ strategyStatusOf | strategy-card-flow |
| ④ ⑤ 제목 · 전략키 비표시 · 키 잠금 | trading-workbench.test(제목) · card-header(등록 = 거래소 잠김) |
| ⑥ ⑦ ⑦b ⑧ ⑪ ⑬ 전송↔에코 · 배너 · 3초 미반영 · 삭제 · 자동 비활성화 | strategy-card-flow |
| ⑨ ⑩ ⑳ 서버 거부 · 몫 가르기 · 출처 배지 | strategy-card-flow (card-server-error — **되살림**) |
| ⑫ 이탈 경고 더티일 때만 | trading-workbench.test(양성) + workbench e2e 16(음성 대조군) |
| ⑭ 4밴드 선언 · min-w-0 | strategy-card(@container/lc) · card-body ④ · e2e 4·5 |
| ⑭b 더티 바 body 포털 | strategy-card-flow · card-body ⑥ |
| ⑮ 출처 태그 「상따」 · 계좌 셀렉터 1벌 | 셀렉터: shared-panels ②-a. 태그는 18-09 결정(relay 에 origin 없음 · 추정 금지)으로 미표시 — **사용자 결정 필요** |
| ⑯ 시장 미상 선택 불가 · cfg 에 market 없음 | stock-add-bar(주문 불가 배지·isPickable) · limit-chaser-form(market 키 부재) |
| ⑰ 헤더 카드(계좌 칩 · 거래소 콤보 · 트리거 왕복 · 10칸 · 높이 · Q-02/04/05) | 10칸: quote-grid-10. 계좌: AccountPill(workbench-status-bar). 나머지는 설계로 사라진 UI(D-08 · D-10) |
| ⑱ 검색 ↓/↑/Enter · 비선택 행 건너뛰기 · 목록 갱신 · ARIA | stock-add-bar (+7, `StockSearchField` 공용) |
| ⑲ LED 전송 규율 1~9 | strategy-card-flow |
| ㉑ 철거 에코 · 거부 = 서버의 답 a~e | strategy-card-flow |

### 단위 `vi-client.test.tsx` · `vi-settings-card.test.tsx`

| 옛 | 이어받은 자리 |
|---|---|
| vi-client ① `vi.notice` 최근 발동 줄 | **미이관 — 사용자 결정 필요** (viNotices 소비처가 다시 0) |
| vi-client ② 서버 메시지 출처 배지 · 몫 가르기 | use-vi-server-error + vi-settings-rows + trading-workbench.test (vi-server-error — **되살림**) |
| vi-client ③ 미체결 표식 두 표면 동일 | 표면이 계좌 패널 하나로 줄어 비교 대상이 없다(account-panel 테스트가 표식 자체를 잠금) |
| vi-client ④ 전체 취소가 취소보관 행 제외 | **미이관 — 기능 자체가 작업대에 없음(사용자 결정 필요)** |
| vi-settings-card 4행 · 비밀번호 없음 · 더티 0 | vi-settings-rows (줄 구성 · 이관 describe) |
| ① 수정 run 유지(가동/중지) | vi-settings-rows ① |
| 「되돌리기」 | 작업대 VI 줄에는 「수정」만 있다(D-05 줄 설계) |
| ② ③ 시작/중지 다이얼로그 · 요약 · 포커스 · 거래소 실음 | vi-settings-rows ① · 이관 ② · e2e 22·23 |
| ④ ⑤ ⑦ ⑧ ⑨ 재활성 금지 · 에코 규율 · 세션 가드 · 금액 상한 · 전송 실패 | vi-settings-rows (E2 · D-27 · ⑦ · 이관) |
| ⑥ 마감알림 권한 거부/허용 | workbench-status-bar (알림 2종) |

→ **이어받는 곳이 없는 안전 단언은 0 입니다.** 이어받지 않은 5건은 옛 화면 고유 **기능**입니다. 18-12 리다이렉트 이후 이미 도달할 수 없던 기능이라, 새 UI 를 목업 없이 만들지 않고 아래 결정으로 올립니다. 서버 거부 경보 두 건은 안전 계약(T-16-07)이라 이번에 되살렸습니다.

## orderbook.spec 셀렉터 — 18-10 목록 밖 변경

- 18-10 표에 있던 셀렉터는 표대로 바꿨고, 표 밖에서 깨진 **셀렉터**는 없었습니다.
- **내용 변화 1건을 보고합니다.** 옛 단언 「총잔량 550」을 뺐습니다. 호가 탭이 chaser 사다리를 쓰게 되면서(18-10 D-24) 총잔량 줄이 화면에서 사라졌기 때문입니다. 18-10 표에는 없던 변화입니다. 의도였는지 확인해 주세요.
- compact 테이프는 시각을 「분:초」로 씁니다. 그래서 `09:30:17` 단언을 `30:17` 로 바꿨습니다. 순서 단언은 그대로입니다.

## UAT 인계 — 자동 게이트로 닫히지 않는 항목

아래 넷은 자동 게이트가 green 이어도 닫히지 않습니다. Phase 17 D-25 와 같은 성격의 실기 관측 항목이고, 「테스트가 통과했으니 됐다」로 종결하지 않습니다.

1. **실 게이트웨이 정정 왕복** (TRADE-07)
   - `order_type "M"` 정정과 통보 `notice_type "M"` 표시를 봅니다.
   - 장 시간 08:00~20:00 KST · VPN·터널이 필요합니다. mock 은 프레임 형태만 단언합니다.
2. **예약구간 조각 발주 · 시간외종가 G2/G3 실발주** (TRADE-07)
   - 창은 서버가 판정합니다. mock 으로는 라벨·프레임만 검증했습니다.
3. **알림음 자동재생 차단 상태 표시** (TRADE-06)
   - 브라우저 autoplay 정책이라 실브라우저의 사용자 제스처에 의존합니다.
4. **VI 확인 체크 전송 거부/타임아웃 왕복** (UI-SPEC backstop E3 error · TRADE-08)
   - 스텁은 33 에 거부·무응답을 흉내 내지 않습니다.

UI-SPEC backstop 6행 중 Task 1 이 닫은 것은 다섯입니다: E1 overflow(케이스 8) · E6 overflow(4 · 5) · E6 zero-one-many(6) · E13 overflow(7 · 18) · E15 overflow(7). 남은 하나(E3 error)가 위 4번입니다.

## 배포 — 이 플랜에서 하지 않았습니다

push 는 곧 webapp 프로덕션 배포입니다. 그래서 push 하지 않았고, 아무것도 배포하지 않았습니다. 아래 순서를 **사용자 승인 대상**으로 남깁니다.

1. **DB 마이그레이션 반영 (18-03 — 미실행)**
   - `supabase/migrations/20260921120000_dma_orders_modify_offhours.sql` 을 원격에 반영합니다.
   - 반영 뒤 제약 3건과 컬럼 2개(`piece_count` · `krx_session`)를 조회로 확인합니다(18-03 Task 2).
   - 이게 없으면 relay 의 정정(`M`) · 시간외종가(`price 0`) · 조각 insert 가 CHECK 에 막힙니다.
2. **relay 배포**
   - 18-01 계약: `order.modify` · `pieceCount` · `krxSession` · 돌파 `name`/`code`.
   - VM 정지·재적용은 장 마감(20:00 KST) 이후가 원칙입니다.
3. **relay 검증** — 헬스 체크, 새 필드 왕복.
4. **git push** — Vercel 프로덕션 webapp 배포.
   - webapp 을 먼저 올리면 안 됩니다. zod 가 relay 의 새 필드를 조용히 버리고, 새 요청 종류(`order.modify`)가 구 relay 에서 거부됩니다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 버그] 폰 밴드 공용 패널의 sticky 가 한 번도 붙지 않음**
- **발견:** Task 1 케이스 7. 펼친 패널을 더티 바가 82px 덮었고, 접힘 상태에서는 패널이 화면 밖에 있어 겹침 0 이 헛통과했습니다.
- **원인:** 앱 셸 `main` 이 `overflow-auto` 라 sticky 의 스크롤 컨테이너가 됩니다. 그런데 실제로 스크롤하는 것은 창입니다.
- **조치:** 폰 밴드(`phoneBand`)에서만 body 포털 + `fixed bottom-0 z-20`, 흐름 안에는 패널 높이 + 바 예약만큼 자리를 둡니다. 앱 셸은 건드리지 않았습니다(종목상세 탭 바 등 다른 sticky 부작용).
- **검증:** 케이스 7 에 「패널 끝 = 바 위」·「패널이 화면 안」 단언을 추가했습니다.
- **파일:** shared-panels.tsx · trading-workbench.tsx · shared-panels.test.tsx
- **커밋:** `0044d04` · `4517a41`

**2. [Rule 1 - 시각 결함] 「감시 대상」 세그먼트가 카드 폭 992 에서 2px 잘림**
- **원인:** 데스크톱 밴드 진입 구간에서 `--lw` 가 104px 이 되어 버튼이 46px 로 좁아집니다.
- **조치:** 그 밴드에서만 좌우 패딩을 0 으로 했습니다(여유 1.7px). 칸을 넓히면 이웃 행 정렬(Q-03)이 깨집니다.
- **커밋:** `45af913`

**3. [Rule 2 - 안전] 작업대 카드가 서버 거부를 그리지 않음 (T-16-07)**
- **문제:** 훅은 `lastError` 를 계산했지만 카드는 그리지 않았습니다. 거부가 기본으로 닫힌 로그 탭에만 쌓였습니다.
- **조치:** `card-server-error` role=alert + 출처 배지를 추가했습니다.
- **커밋:** `fd0b7dc` · `312d3dd`

**4. [Rule 2 - 안전] VI 몫 서버 거부가 작업대 어디에도 서지 않음**
- **문제:** 18-05 가 「작업대 몫」으로 넘겼는데 18-11 에서 빠졌습니다.
- **조치:** `useViServerError`(isViServerMessage 하나) → VI 두 줄 아래 role=alert.
- **커밋:** `ac9f33c` · `c2adcc0`

**5. [Rule 1 - 시각 결함] 좁은 폭 표가 스크롤 대신 잘림**
- **원인:** 레이어 밖 `.tbl-wrap { overflow: hidden }` 이 Table 의 `overflow-x-auto` 를 이겼습니다. 폰 VI 발동 표가 132px 잘렸습니다.
- **조치:** `overflow-x: auto` 로 바꿨습니다. 소비처는 account-panel · vi-order-list · today-orders-card · breakout-strip 넷이고, 넘칠 때만 달라집니다(잘림 → 스크롤). e2e 전량으로 회귀가 없음을 확인했습니다.
- **커밋:** `9eb8189`

**6. [Rule 2 - 접근성] VI 칩 줄에 키보드로 닿지 못함**
- **원인:** axe `scrollable-region-focusable` serious — 칩이 버튼이 아닙니다.
- **조치:** tabIndex 0 + role=group + aria-label 「VI 발동 종목」(호가 사다리 스크롤 영역과 같은 해법).
- **커밋:** `400879e`

### 계획 문면과 다르게 한 것

- **옛 e2e 두 파일의 단언 20건을 workbench 로 옮겼습니다.** 계획은 「남은 단언이 있으면 그 케이스만 옮긴다」였고, 실제로는 거의 전부가 남아 있었습니다. 옛 화면 단언은 전부 옛 경로로 진입했기 때문입니다.
- **`orderbook.spec.ts` 에 케이스 11(더티 바 ↔ FAB 겹침)을 새로 넣었습니다.** 18-10 인계 사항입니다.
- **`me.spec.ts` 의 사이드바 원 아이콘 단언을 LED 로 옮겼습니다.** 18-12 에서 아이콘이 사라져 깨져 있었습니다. 계획에는 「링크 대상만」으로 적혀 있었습니다.
- **주석 속 옛 파일명까지 정리했습니다.** 계획 verify(`! grep -rq …`)가 주석도 셉니다.
- **`requirements-completed` 에서 TRADE-07 을 뺐습니다.** 18-03 미실행으로 실 DB 경로가 열리지 않았습니다(오케스트레이터 지시).

**Total deviations:** 자동 수정 6건(Rule 1 ×3 · Rule 2 ×3) + 문면 차이 5건. **Impact:** 전부 이 phase 표면 안의 정확성·안전·시각 결함입니다. 앱 전역에 닿는 변경은 `.tbl-wrap` 한 줄뿐이고, 넘칠 때만 동작이 달라집니다.

## 사용자 결정 필요

1. **옛 화면 고유 기능 4건의 거취.** 18-12 리다이렉트 이후 이미 볼 수 없던 기능입니다. 새 UI 는 목업 검토 없이 만들지 않았습니다.
   - VI **「최근 발동 {종목} · {거래소} · {가격}원」** 줄(`viNotices` — 72/73 주문 행보다 먼저 오는 신호). 지금은 소비처가 다시 0 입니다.
   - **「장 마감」** 표시. 작업대에는 77 구간 배지가 있습니다.
   - VI 미체결 **거래소 필터 · 「전체 취소」**(취소보관 행 제외 규칙 포함). 공용 패널은 단일 계좌 · 전 종목 표입니다.
   - 미체결 **출처 태그**(「상따」/「VI」). 18-09 가 relay 에 origin 이 없어 추정하지 않기로 했습니다.
2. **호가 탭 총잔량 줄 부재**가 의도인지(위 orderbook 보고).
3. 이 플랜은 **기존 두 쟁점**을 바꾸지 않았습니다.
   - 18-08: 돌파 순서(reducer 오래된 순 vs UI-SPEC 「최신 위」).
   - 18-11: 등록 전략 카드 ✕ 는 카드만 닫고 서버 전략은 계속 돕니다.
4. **배포 승인** — 위 4단계 순서.

## Known Stubs

없습니다.

## Threat Flags

없습니다. 새 네트워크 경로·권한 경로는 없습니다.
- T-18-62: 커버리지 대조표를 만들었고, 이어받는 곳이 없는 안전 단언은 0 입니다. 기능 4건은 위 결정 항목입니다.
- T-18-63: Manual-Only 3항목 + backstop 1항목을 UAT 로 인계했습니다. `nyquist_compliant` 는 false 로 두었습니다(18-03 사유).
- T-18-64: 배포하지 않았고, relay 먼저 순서를 적었습니다.
- T-18-65: 잘림 판정은 `e2e/overflow.ts` 하나입니다. verify grep 이 1건을 보고했습니다.
- T-18-66: 포트를 적지 않았습니다. `playwright.config.ts` · `fixtures/relay.ts` 가 정본입니다.

## Self-Check: PASSED

- 신설 파일 5개가 존재합니다: trading-workbench.spec.ts · overflow.ts · use-vi-server-error.ts · use-vi-server-error.test.ts · strategy-card-flow.test.tsx.
- 삭제 8파일은 `git ls-files` 에 없습니다.
- 커밋 16건이 git log 에 있습니다. `git rev-list --count 078371e..HEAD` = 16 입니다(이 SUMMARY 커밋 전).
- 계획 verify
  - `grep -c overflowX …` = 1
  - `boundingBox(` = 11
  - 옛 모듈명 0건 · `VI_EDIT_EXCHANGE` 0건
  - `TBD` 0건
  - typecheck exit 0 · e2e trading-workbench · sidebar-tree · a11y 통과
