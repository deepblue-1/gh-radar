---
phase: 18-gh-trade-ui-nxt-vi
plan: 05
subsystem: ui
tags: [vi, nxt, workbench, trading, react, tdd]
status: complete

requires:
  - phase: 17
    provides: "viTriggers{KRX,NXT} 거래소 축 리듀서 · RelayViSetMsg.exchange optional · viOrderKey 거래소 포함"
  - phase: 18-02
    provides: "--new-bg / --new-bd 토큰 · §2.2b wb 컨테이너 문단"
provides:
  - "ViSettingsRows — KRX/NXT 거래소별 VI 설정 2줄 (줄의 exchange prop 이 vi.set 페이로드로 나감)"
  - "ViTriggerStrip — VI 발동 칩 스트립 + 「더보기」 표 (확인 체크는 표에서만)"
  - "ViOrderList variant=\"workbench\" — 목업 11열 · wb 컨테이너 열 접기 · 미확인 행 --new-bg · 네이티브 확인 체크"
  - "ExchangeTag · isUnconfirmedViOrder · stockCodeOf · VI_WORKBENCH_TABLE_CAPTION · VI_ORDER_EMPTY_TEXT (vi-order-list 공용)"
  - "VI 승계 상수·ViConfirmDialog 의 정본이 workbench/vi-settings-rows.tsx 로 이동"
affects: [18-11, 18-12, 18-13, trading-workbench]

actuals:
  tokens: 30600
  tasks: 3
  commits: 5
plan_head_before: c055d3f67b2898e19d0ce133a335c7afd63d2343

tech-stack:
  added: []
  patterns:
    - "거래소는 줄 컴포넌트의 prop — 폼·기준선·잠금·에코 상관을 줄 인스턴스마다 따로 든다(상위 분배 금지)"
    - "하나의 판정·전송 로직(ViOrderList)에 표면 variant 만 추가 — isConfirmable 두 벌 금지"
    - "작업대 폭 분기는 @min-[700px]/wb · @min-[830px]/wb (wb 컨테이너는 18-11 TradingWorkbench 가 건다)"

key-files:
  created:
    - webapp/src/components/trading/workbench/vi-settings-rows.tsx
    - webapp/src/components/trading/workbench/vi-trigger-strip.tsx
    - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
    - webapp/src/components/trading/__tests__/vi-trigger-strip.test.tsx
  modified:
    - webapp/src/components/trading/vi-settings-card.tsx
    - webapp/src/components/trading/vi-order-list.tsx
    - webapp/src/components/trading/vi-client.tsx
    - webapp/src/components/trading/__tests__/vi-settings-card.test.tsx
    - webapp/e2e/specs/trading-vi.spec.ts

key-decisions:
  - "VI_EDIT_EXCHANGE 상수와 고정 캡션을 정의·소비처 전부에서 제거. 옛 카드는 exchange prop 을 받고, 옛 /trading/vi 화면(vi-client)은 서버값 선택과 prop 이 같은 값을 보도록 로컬 VI_SURFACE_EXCHANGE='KRX' 한 자리를 둔다(18-13 에서 파일째 제거)"
  - "옛 카드의 마감알림 스위치(AlertSwitch)는 18-11 상태줄 이관 전까지 옛 /trading/vi 에 남긴다 — 지금 빼면 운영 중인 옛 화면에서 VI 해제 10초 전 알림이 사라진다. 새 VI 줄에는 없다(Q-1)"
  - "VI 줄의 계좌는 상태줄이 고른 accountNo prop. 공란이면 줄 잠금"
  - "3초 ack 타임아웃은 잠금 해제 + 줄 아래 「미반영 · 서버 응답을 기다리고 있어요」(옛 VI 상태줄 문구) — 재전송 0"
  - "「다른 단말에서 변경됨」은 내가 보내지 않은 에코가 더티를 덮었을 때만, 줄 아래 role=status 로 6초"
  - "작업대 표 확인 체크는 네이티브 체크박스(UI-SPEC 접근성), 비활성 = !isConfirmable ∨ 전송 중. 옛 패널(Radix)은 동작 불변"
  - "공란 입력은 null 로 들고 「수정」 disabled — 0 과 공란을 구분"

requirements-completed: []

coverage:
  - deliverable: "고정 거래소 상수 0건 + 줄별 exchange 송신"
    human_judgment: false
    verification:
      - kind: command
        ref: "! grep -rq VI_EDIT_EXCHANGE webapp/src"
        status: pass
      - kind: test
        ref: "vi-settings-rows.test.tsx ① 줄의 거래소를 실어 보낸다 (3 cases)"
        status: pass
  - deliverable: "줄 독립 더티·에코"
    human_judgment: false
    verification:
      - kind: test
        ref: "vi-settings-rows.test.tsx ② 줄 독립 (3 cases)"
        status: pass
  - deliverable: "확인 체크는 표에서만 · isConfirmable 단일 판정 · 재정렬 0"
    human_judgment: false
    verification:
      - kind: test
        ref: "vi-trigger-strip.test.tsx 확인 체크 · E3 ordering"
        status: pass
      - kind: command
        ref: "! grep -nE '\\.sort\\(|reverse\\(\\)' vi-trigger-strip.tsx"
        status: pass
  - deliverable: "만원↔원 인라인 곱셈 0건"
    human_judgment: false
    verification:
      - kind: command
        ref: "! grep -nE '\\* *10000|\\* *10_000' vi-settings-rows.tsx"
        status: pass
  - deliverable: "목업 대비 배치·문구·색 눈 대조"
    human_judgment: true
    verification:
      - kind: manual
        ref: "두 컴포넌트는 아직 어느 라우트에도 마운트되지 않음 — 18-11 작업대 조립 후 dev 화면에서 대조"
        status: pending
  - deliverable: "E3 error — 확인 전송 거부/타임아웃 시 잠금 해제 + 행 인라인 고지"
    human_judgment: true
    verification:
      - kind: test
        ref: "vi-trigger-strip.test.tsx E3 error (send=false mock 수준)"
        status: pass
      - kind: manual
        ref: "backstop — 실기 게이트웨이 왕복 UAT 로 확인"
        status: pending

metrics:
  duration: "~17분"
  completed: 2026-09-22
---

# Phase 18 Plan 05: VI 설정 2줄 + VI 발동 스트립/표 Summary

VI 설정을 KRX·NXT 두 줄로 나눴습니다. 각 줄은 자기 거래소를 `vi.set` 에 직접 싣습니다. VI 발동 스트립은 칩 한 줄과 「더보기」 표로 구성되며, 표 본문은 기존 `ViOrderList` 의 확인 판정(`isConfirmable`)·전송·110초 타이머를 그대로 씁니다. 고정 거래소 상수 `VI_EDIT_EXCHANGE` 는 저장소에서 완전히 사라졌습니다.

## 무엇을 만들었나

- **`workbench/vi-settings-rows.tsx`**
  - `ViSettingsRows` 가 KRX·NXT 줄을 그리고, 줄마다 폼·기준선·전송 잠금·에코 상관을 독립적으로 가집니다.
  - 줄 구성: 거래소 태그 · on/off 스위치(확인 다이얼로그 경유) · 「가동중」+「서버 반영 HH:MM:SS」 또는 「중지」 · 상승률 % · 금액 만원 · 더티일 때 「수정」.
  - 계좌 셀렉터와 마감알림은 줄에 두지 않았습니다.
- **`workbench/vi-trigger-strip.tsx`**
  - 접힌 줄: 「VI N」 + 「미확인 M」 필 + 칩 가로 스크롤 + 「더보기/접기」.
  - 펼친 상태: 「VI 발동 주문」 헤더 + `ViOrderList variant="workbench"`.
  - 펼침 상태는 컴포넌트 로컬이고 localStorage 키를 새로 만들지 않습니다.
- **`vi-order-list.tsx`**
  - `variant="workbench"` 를 추가했습니다: 목업 11열, 본문 700/830 에서 `col-vi`/`col-vi2` 를 접고, 폰 밴드에서는 보조 줄로 대신합니다.
  - 미확인 행은 `--new-bg` 로 칠합니다. 확인 체크는 네이티브 체크박스이고, 비활성 사유를 `title` 과 `aria-describedby` 두 경로로 전달합니다.
  - 110초 진행바는 바와 `{N}s` 를 함께 표시합니다.
  - 보내지 못한 확인은 그 행 바로 아래에 `role="status"` 로 알립니다.
  - `ExchangeTag`, `isUnconfirmedViOrder`, `stockCodeOf` 를 공용으로 내보냅니다.
- **`vi-settings-card.tsx` (옛 `/trading/vi` 전용)**
  - 상수와 캡션을 없애고 `exchange` prop 을 받도록 바꿨습니다.
  - 승계 상수와 `ViConfirmDialog` 는 새 파일에서 가져다 씁니다. 옛 테스트 import 경로가 깨지지 않도록 re-export 를 남겼습니다.

## 옛 `vi-settings-card.test.tsx` 커버리지 대조 (Task 3)

| 옛 단언 | 새 위치 |
|---|---|
| 계좌·금액·상승률 행 | rows「줄 구성」(계좌는 상태줄 몫 — 줄에 없음을 단언) |
| 종목 축·주문유형·비밀번호 UI 부재 | rows「이관 — 표면 규율」 |
| 더티 0이면 액션 없음 | rows「더티 0 이면 「수정」이 렌더 자체가 없다」 |
| ① 수정 시 run 유지(가동/중지 양쪽) | rows ①「수정」은 run 을 현재값 그대로, 첫 케이스 run:false |
| ② 시작 다이얼로그 기본 포커스 취소 · 요약 4항목 | rows「시작/중지 확인 다이얼로그」 |
| ② 시작 확정 = 현재 폼 값 + run:true | rows「이관 — 시작 확정」 |
| ② 취소 경로 무전송 | rows「취소하면 아무것도 나가지 않는다」 |
| ② 중지 기본 포커스 닫기 · 중지 확정 run:false | rows「이관 — 중지 다이얼로그」 + ① 시작/중지 경로 |
| ② 세 경로 exchange 적재 | rows ① 3케이스(KRX/NXT 양쪽) |
| ④ 반영 중… · 에코 전 재클릭 무전송 | rows「E2 loading」 |
| 3초 타임아웃 무재전송 | rows「★ 3초 타임아웃」(5배 시간 경과 후에도 send 1회) |
| ⑤ 에코가 더티를 덮음 | rows「D-27」(덮은 개수 콜백 대신 인라인 고지) |
| ⑤ 빈 61 입력 보존 | rows「빈 61(null)은 입력값을 지우지 않는다」 |
| ⑤ 미조회 잠금 | rows「이관 — 미조회(키 부재)」 |
| ⑦ 세션 끊김 중 수정 무전송 · 복귀 시 정상 | rows「이관 — 세션 가드」 |
| ⑧ 금액 상한 3종(자름+이유, 잘린 값 전송, 에코발 초과 차단) | rows「⑦ 금액 상한」 2케이스(자름·전송은 1케이스에 합침) |
| ⑨ 수정 전송 실패 → 잠그지 않음 + 사유 | rows「보내지 못하면(send=false)」 |
| ⑨ 시작 전송 실패 → 다이얼로그 유지 | rows「이관 — 「시작」이 못 나가면」 |
| ⑥ 마감알림 권한 거부/허용 | **옛 카드에 그대로 남김**(테스트도 유지). 18-11 상태줄이 이어받음. `vi-alert.test.ts` 가 순수 함수를 계속 덮음 |
| 「되돌리기」 무전송 | **의도적 부재**: 목업(D-26 정본)의 VI 줄에는 되돌리기가 없습니다. 옛 카드 테스트는 18-13 까지 유지 |

## TDD Gate Compliance

| 태스크 | RED | GREEN |
|---|---|---|
| Task 1 | bea5560 (모듈 부재로 실패 확인) | ebc748f (24/24) |
| Task 2 | 6bac523 (모듈 부재로 실패 확인) | 8c959f0 (16/16) |
| Task 3 | — (커버리지 보강, test-only) | bf328a0 |

## Deviations from Plan

### 해석 조정

**1. [Rule 2 - 운영 보호] 마감알림 스위치를 옛 카드에 남김**
- **발견 시점:** Task 1
- **내용:** 플랜은 「AlertSwitch 를 이 파일에서 제거」라고 적었지만, 같은 플랜이 「옛 `/trading/vi` 는 18-12 까지 살아 있어야 한다」고도 합니다. 지금 제거하면 운영 중인 옛 화면에서 VI 해제 10초 전 알림을 켤 방법이 사라지고 e2e(`trading-vi.spec.ts:242`)도 깨집니다.
- **처리:** 새 VI 줄에는 마감알림을 두지 않았습니다(Q-1 준수). 옛 카드에는 18-11 상태줄 이관 전까지 남깁니다. `vi-alert.ts` 는 건드리지 않았습니다.

**2. [Rule 3 - 차단 해소] 옛 화면이 쓸 거래소 한 자리**
- **내용:** 옛 카드가 `exchange` prop 을 요구하게 되면서 `vi-client.tsx` 에 `VI_SURFACE_EXCHANGE='KRX'` 한 자리를 뒀습니다. 기존 `viTriggers.KRX` 리터럴도 이 상수로 합쳐서, 서버값 선택과 송신 거래소가 갈릴 수 없게 했습니다. 이 파일은 18-13 에서 통째로 삭제됩니다. 작업대 경로에는 고정 거래소가 없습니다.

**3. [Rule 1 - 테스트 정합] e2e 캡션 단언 갱신**
- `trading-vi.spec.ts` 의 고정 캡션 단언을 제목 「설정 · KRX」 단언으로 바꿨습니다(캡션을 없앴기 때문).

### 기타
- 공용 태그 조각 `ExchangeTag` 는 플랜 파일 목록 밖인 `vi-order-list.tsx` 에 뒀습니다. 이 파일은 18-13 이후에도 남으므로 두 VI 블록이 한 벌을 씁니다.

## Known Stubs

없습니다. 다만 두 컴포넌트는 아직 어느 라우트에도 마운트되지 않았습니다. 18-11 `TradingWorkbench` 가 `@container/wb` 와 함께 조립하기 전까지 `wb` 컨테이너 쿼리는 폰 밴드(기본) 레이아웃으로 보입니다. 설계상 의도한 것입니다.

## Deferred / Backstop

- **E3 error(확인 전송 거부/타임아웃):** mock 수준(send=false)까지만 단언했습니다. 기존 `vi-order-list` ③ 규율(「보낸 뒤 무응답은 정상 경로 — 타임아웃 UI 를 만들지 않는다」)을 완화하지 않았습니다. **backstop — 실기 UAT 로 확인.**
- **목업 눈 대조(human-check):** 18-11 조립 후 dev 화면(PORT 3100)에서 대조합니다.
- **서버 거부 문구(`ServerMessage` ERROR) 표시:** 줄에서는 파싱하지 않습니다. 에코 부재가 곧 거부이므로 3초 「미반영」으로 알립니다. 서버 메시지 원문 표시는 작업대 상태줄(18-11) 몫입니다.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/workbench/vi-settings-rows.tsx
- FOUND: webapp/src/components/trading/workbench/vi-trigger-strip.tsx
- FOUND: webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
- FOUND: webapp/src/components/trading/__tests__/vi-trigger-strip.test.tsx
- FOUND commits: bea5560 · ebc748f · 6bac523 · 8c959f0 · bf328a0
- `pnpm --filter @gh-radar/webapp test` 1121 passed / 1 skipped (기준선 1008 이상) · typecheck exit 0 · `VI_EDIT_EXCHANGE` 0건
