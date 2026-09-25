---
phase: 20-toss-order-ticket
plan: 07
subsystem: testing
tags: [playwright, e2e, a11y, axe, container-query, numpad-sheet, limit-chaser, manual-order]
status: complete

requires:
  - phase: 20-04
    provides: "lc-fields 필드 스펙(data-lc-field = 옛 id) · 스위치 4개 role=switch · 더티 바 폐기 · 폰 L2 백스톱 · 20-07 까지 red 로 남긴 e2e 목록"
  - phase: 20-05
    provides: "인라인 편집기(Enter/Esc/Tab · ↑↓ · 검증 말풍선)"
  - phase: 20-06
    provides: "수동주문 TicketBox · 48/38 버튼 · 시트 입력(fill) · 344 라벨 잘림 human_judgment 인계"
provides:
  - "trading-workbench.spec.ts — 새 조회구 lcRow/lcValue/editLc/lcSwitch · 더티 바 케이스 7·12·GC2·13·16 즉시 반영 재정의 · P20-3 · P20-4 · P20-5"
  - "orderbook.spec.ts — 11 재정의(호가 탭 키패드 시트 vs AI FAB · hasTouch 중첩 describe · elementFromPoint)"
  - "a11y.spec.ts — 스위치 4종 role=switch · 값 버튼 그룹 설명 · ⑦ 인라인 편집 재정의 · 터치 시트 열린 상태 axe"
  - "sidebar-tree.spec.ts — 스위치 role · 등록 카드 세그먼트 단언 현행화"
  - "overflow.ts — 빈 절대배치 가상요소(히트 영역)만으로 넘친 요소 제외"
  - "setting-group.tsx — 제목 있는 그룹의 값 버튼 aria-describedby = 그룹 제목"
  - "number-pad-sheet.tsx — 빈 값 디스플레이 기준선 받침"
affects: [20-verify-work, 20-validate-phase]

actuals:
  tokens: 17300
  tasks: 3
  commits: 5
plan_head_before: 663307f296dda431295a1c898293ec826ad5797f

tech-stack:
  added: []
  patterns:
    - "행 값 단언은 `[data-lc-field=\"{옛 id}\"] [data-slot=\"lc-row-value\"]` 텍스트 · 편집은 행 클릭 → 옛 id 입력 → Enter · 더티 바 셀렉터는 부재 단언에만"
    - "폭 백스톱은 행마다 「진짜 여유 = 안쪽 폭 − 직계 자식 내용 폭(Range) − 간격」 을 재어 annotation 으로 남긴다 — justify-between 의 오른쪽 끝 여유는 들어가면 늘 0 이라 여유를 말하지 못한다"
    - "재마운트 없음은 DOM 노드에 표식(data-e2e-mark)을 달고 펼친 뒤 같은 노드인지로 증명한다"
    - "시트 z 순서는 elementFromPoint 두 점(확정 버튼 중심 = 확정 · FAB 중심 = 시트/딤)으로 잰다 — 열린 모달은 FAB 을 aria-hidden 으로 만들므로 FAB 은 열기 전에 잰다"
    - "레이아웃 가드는 먼저 고친 코드를 잠시 되돌려 실패하는지 확인한 뒤 복원한다"

key-files:
  created:
    - .planning/phases/20-toss-order-ticket/deferred-items.md
  modified:
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/e2e/specs/orderbook.spec.ts
    - webapp/e2e/specs/a11y.spec.ts
    - webapp/e2e/specs/sidebar-tree.spec.ts
    - webapp/e2e/overflow.ts
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
    - webapp/src/components/trading/lc/number-pad-sheet.tsx
    - .planning/phases/20-toss-order-ticket/20-VALIDATION.md

key-decisions:
  - "매수·매도 값 버튼 이름 중복(「체결 30,000주」 · 「비교가격 127,400원」)은 이름을 바꾸지 않고 aria-describedby 로 그룹 제목을 붙여 가른다 — UI-SPEC §205 이름 계약 「{라벨} {값}{단위}」 이 사용자 승인 계약이기 때문"
  - "overflow.ts 판정에 세 번째 제외(빈 절대배치 가상요소만으로 넘친 요소)를 더한다 — GroupSwitch 의 44 히트 확장 ::after 가 scrollWidth 를 2px 늘린 오탐. 실제 글자 넘침은 Range 로 계속 잡는다"
  - "sidebar-tree 1 의 「등록 카드 세그먼트 잠김」 단언은 quick-260923-pgv(285f3b3) 이후 낡은 것이라 현행 계약(활성)으로 고친다 — 20-04 가 이 케이스의 실패 원인을 체크박스로만 적었으나 실측 첫 실패는 그 앞 줄이었다"
  - "폰 밴드 「예약 매수」 접근성 이름 공백은 18-07 SideLabel 산물이라 고치지 않고 deferred-items 에 기록한다"

patterns-established:
  - "e2e 임시 스크린샷 spec 은 zz-*.tmp.spec.ts 로 만들어 실행 직후 지운다 — 커밋·스테이징 없음"

requirements-completed: []

coverage:
  - id: T1
    description: "작업대 e2e 새 셀렉터 이관 · 더티 바 케이스 5개(7 · 12 · GC2 · 13 · 16) 즉시 반영 재정의 · P20-3 최악값 × 본문 344/700/830/992 잘림 0 · 행 44px(편집 중 포함) · ≥700 그룹 높이 동일"
    verification:
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts (43 passed · 셋업 포함)"
        status: pass
    human_judgment: false
  - id: T2
    description: "P20-4 매수가격 시트(칩 · D-15 잠금 · 감시 중 안내 · 적용 → 10 → 에코) · P20-5 수동주문 시트(주문 0 · 확인 다이얼로그로만) · orderbook 11 재정의 · a11y 스위치/인라인 편집/시트 axe · sidebar-tree 이관"
    verification:
      - kind: e2e
        ref: "playwright test trading-workbench · orderbook · a11y · sidebar-tree → 71 passed"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/setting-group.test.tsx#⑧ 값 버튼의 그룹 설명 (3)"
        status: pass
    human_judgment: false
  - id: T3
    description: "Phase 20 최종 게이트 — build_command · test_command · shared 전체 · webapp build · e2e 4 spec · VALIDATION 갱신"
    verification:
      - kind: gate
        ref: "build_command 종료 0 · relay 632 · webapp 1970(+1 skip) · shared 131 · next build 성공 · e2e 71 passed"
        status: pass
    human_judgment: false
  - id: V1
    description: "시각 확인 — 목업 8차(002-toss-order-ticket)와 톤 대조 · 실기 하이브리드 기기"
    verification: []
    human_judgment: true
    rationale: "색·둥근면·간격 톤 대조와 실기 하이브리드 판정은 사람이 본다(20-VALIDATION Manual-Only). 실행자는 스크린샷 36장을 직접 보고 잘림·겹침·줄바꿈 결함 1건을 고쳤다."

duration: 39min
completed: 2026-09-25
---

# Phase 20 Plan 07: e2e 이관 · 실브라우저 불변식 · 최종 게이트 Summary

**작업대 · 호가 탭 · 접근성 · 사이드바 e2e 4 spec 을 새 리스트·즉시 반영·키패드 시트 표현으로 옮겼다. 폭 불변식(최악값 × 4밴드 잘림 0 · 행 44px · 그룹 높이)과 터치 시트(D-12 · D-13 · D-15 · D-10)를 실브라우저로 잠갔다. Phase 20 자동 게이트는 전부 green 이다(e2e 71 passed). 실행 중 찾은 결함 두 건도 고쳤다: 키패드 시트 빈 값 정렬, 값 버튼 이름 중복.**

## Performance

- **Duration:** 약 39분 (2026-09-25T05:36:42Z → 06:15Z)
- **Tasks:** 3/3 (+ 결함 수정 커밋 2)
- **Files modified:** 10 (생성 1 · 수정 9)

## Accomplishments

1. **Task 1 — 작업대 e2e 이관 (`trading-workbench.spec.ts`)**
   - 조회구를 바꿨다. `dirtyBar` 상수는 없애고 `DIRTY_BAR_SEL` 을 부재 단언에만 쓴다. `lcRow` · `lcValue` · `editLc` · `lcSwitch` 를 더했다. `openFocusedCard` 는 행 값 「10,000주」 를 기다린다. VI 케이스가 쓰는 `field` 는 그대로 뒀다.
   - 셀렉터 이관: 3(스위치 4개 · 「10만원」 · 「10,000주」) · 9(가격 5칸 「127,400원」) · 10(미등록 카드 값 확정 = 전송 0 · A-P1) · 14 · 18(주석).
   - **재정의 5건(삭제 0 · 케이스 수 40 → 43):**
     - **7** 폰 밴드: 편집 중 행 ∩ 하단 고정 패널 ≤ 1px · 패널 하단 고정 · 적용 → 10 → 에코 · 맨 아래 카드 끝이 묻히지 않음
     - **12** 값 확정 → 10 즉시(「수정」·「되돌리기」 0) → 에코 → 행 값 · 반영 시각
     - **GC2** 접었다 펴도 **같은 DOM 노드**(표식 유지) · 포커스는 헤더 토글
     - **13** 편집 중 다른 단말 에코 → 입력 8,000 유지 · Esc 뒤 「5,000주」 · 배너 「다른 단말에서 변경됐어요 · 서버 값으로 맞췄어요」 · 로그 1줄 · 전송 0
     - **16** 대조군 + 적용 뒤 「홈」 이동 = 다이얼로그 0
   - **P20-3:** 최악값 시드(1,274,000원 · 100,000주 · 9,999만원 · 기준선 100,000주)로 카드를 344 · 700 · 830 · 992 에 정확히 맞춰 잰다.
     - 카드 잘림 0(두 판정) · 우측 패널 scrollWidth ≤ clientWidth · 행마다 잎 요소가 행 안쪽 끝을 넘지 않음 · 보이는 모든 행 44±0.5 · 편집 중 행 44.
     - 폰 밴드는 매수·매도 pane 을 각각 편다.
     - 344 수동주문은 예약창(77 open)으로 「예약매수」「예약매도」 48 · 「정정」「취소」 38 라벨 잘림 0(overX/overY 0)을 단언한다(20-06 human_judgment 해소).
     - 기준선 없는 시드에서 700/830/992 매수주문 · 매도주문 그룹 높이 차 ≤ 0.5 · 헤더 높이 동일.
2. **Task 2 — 터치 · 호가 탭 · 접근성 · 사이드바**
   - **P20-4:** 첫 키 덮기로 98150 → 「100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200」 + 적용 잠금 · 127450 → 「상한가 127,400원을 넘을 수 없어요」 · 칩 현재가 98,100 · 상한가 127,400 · −1호가 127,300 · +1호가 127,400 · 「감시 중 — 적용하면 바로 반영돼요」 · 적용 → 10 1건 → 에코 → 닫힘 · 행 「127,300원」 · 행 포커스 복귀. 칩이 fresh 를 끄므로(`applyPadChip`) 키 검증을 칩보다 먼저 한다.
   - **P20-5:** 폰 「수동」 → 인라인 입력 0 · 가격 상자(aria-haspopup) → 시트 「가격」 → 현재가 → 「가격 입력」 → 상자 「가격 98,100원」 · 수량 +1,000 → 「수량 입력」. DirectOrderReq 0 · 확인 다이얼로그 0 → 「매수」 → 확인 다이얼로그 → 취소 → 여전히 0 · 감사 기록 0.
   - **orderbook 11 재정의:** hasTouch 중첩 describe(relay 공유 · 게이트웨이를 내리는 9 보다 먼저). 390 → 370 · 1440 → 440 가운데. 확정 버튼 중심의 `elementFromPoint` = 확정 버튼. FAB 중심의 최상위 = 시트/딤. 닫으면 행 포커스.
   - **a11y:**
     - ③ 스위치 4종 `role=switch`(매수취소 포함) · 비교가격 값 버튼 그룹 설명(매수주문/매도주문).
     - 모바일 준비 대기는 행 값으로 바꿨다.
     - ⑦ 재정의: 인라인 편집 중 입력 이름 「잔량」 · 포커스 유지 · axe 0 · Esc 뒤 행 포커스.
     - 새 터치 describe: 시트 role=dialog · aria-modal · 이름 「잔량」 · 설명 · 포커스 시트 안 · axe critical/serious 0 · 닫으면 연 행 포커스.
   - **sidebar-tree 1:** 매도주문 스위치를 `role=switch` 로 바꾸고, 세그먼트 단언을 현행 계약으로 고쳤다(아래 편차 3).
3. **Task 3 — 최종 게이트 + 시각 확인 + VALIDATION** (아래 「게이트 결과」 · 「시각 확인」)

## 게이트 결과 (worktree 루트 · 실제 출력 꼬리)

| # | 명령 | 결과 |
|---|---|---|
| 1 | `build_command`(shared build → relay typecheck → relay typecheck:tests → webapp typecheck) | 전부 종료 0 · `DTS ⚡️ Build success` · `tsc --noEmit && tsc -p tsconfig.e2e.json` 오류 0 |
| 2 | `test_command` — relay | `Test Files 22 passed (22)` · `Tests 632 passed (632)` |
| 2 | `test_command` — webapp | `Test Files 107 passed (107)` · `Tests 1970 passed \| 1 skipped (1971)` (20-06 1,967 + 20-07 ⑧ 3건 · skip 1 은 기존) |
| 3 | `pnpm --filter @gh-radar/shared exec vitest --run` | `Test Files 10 passed (10)` · `Tests 131 passed (131)` |
| 4 | `pnpm --filter @gh-radar/webapp run build` | 종료 0 · `✓ Compiled successfully` · 「Failed to compile」/「Type error」 0 |
| 5 | e2e 4 spec(이름 지정 · Playwright 가 이 worktree dev 서버를 직접 띄움) | **`71 passed (2.6m)`** · failed 0 · did not run 0 — 셋업 1 · trading-workbench 43 · orderbook 11 · a11y 9 · sidebar-tree 7 |

- 주문 경로 케이스(orderbook 6 · 7 · GC5 · GC6)는 셀렉터를 바꾸지 않고 green 이다.
- 포트 3100: 시작할 때 리스너가 없었다. 반복 실행용으로 이 worktree `webapp` 에서 dev 서버를 띄웠고(cwd 확인), `next build` 전에 내렸다. 최종 e2e 는 3100 이 빈 상태에서 Playwright webServer 가 이 worktree 를 직접 띄웠다(T-20-16).
- `zz-theme-gallery.spec.ts` 는 실행 대상이 아니었고(로그 0회) `?? webapp/e2e/specs/zz-theme-gallery.spec.ts` 그대로다. `.planning/milestone.lock` 도 그대로다.

### P20-3 실측 여유 (행 「라벨 ─ 값」 두 조각의 남는 폭)

| 카드 폭 | 최소 여유 | 행 |
|---|---|---|
| 344 | **+0.4px** | 잔량추적 기준선 100,000주 |
| 700 | +12.9px | 잔량추적 기준선 100,000주 |
| 830 | +7.9px | 잔량추적 기준선 100,000주 |
| 992 | +54.9px | 잔량추적 기준선 100,000주 |

20-04 는 폰 L2 여유를 +0.9px 로 추정했다. 실브라우저 값은 **+0.4px** 이다. 들어가므로 백스톱을 더 걸지 않았다(글자 크기 불변 · 플랜 규칙). 다만 매우 얇다 — 글꼴이 바뀌거나 최악값보다 긴 값(7자리 수량)이 오면 먼저 깨질 행이다. P20-3 이 이 행을 잡는다.

## 시각 확인

this worktree dev 서버 + 로컬 relay 로 스크린샷 36장을 찍어 직접 봤다. 경로는 세션 스크래치패드 `…/scratchpad/shots/` 이고 커밋하지 않았다.

- 카드 4밴드(344 · 700 · 830 · 992) × 라이트/다크 · 344 매도/수동 pane · 최악값 344 매수/매도/예약 수동주문
- 인라인 편집(992) · ≥700 수동주문 덮개
- 터치 시트 390(감시 중 · 호가 단위 오류) · 768 · 가로 폰 844×390(내부 스크롤) · 수동주문 시트 390 · 호가 탭 390 시트 · 호가 탭 1280

그룹 면 · 44px 행 · 스위치 · 원형 체크 · 감시대상 풀폭 토글 · 시트 기하/딤 · 48/38 버튼은 잘림 · 겹침 · 줄바꿈 결함이 없었다. 344 에서 「예약 / 매수」 두 줄은 48px 안에 들어간다. 호가 탭 시트는 FAB 을 덮는다.

- **고친 결함 1건:** 빈 값 키패드 시트에서 단위 「원」이 캐럿 **위**로 떠 있었다. 22.5px 어긋났고, 수동주문 상자를 처음 열 때와 ⌫ 로 다 지웠을 때 보였다. 수정 뒤 캐럿 옆 같은 줄이다(`fixed-manual-empty-*.png`). 편차 2.
- 화면 왼쪽 아래 둥근 「N」 은 Next.js dev 표시기이고 앱 요소가 아니다.

**사용자 UAT 요청(end-of-phase):** 목업 `.planning/sketches/002-toss-order-ticket/index.html`(8차)과 나란히 톤을 대조해 주세요. 조건은 다크/라이트 · 폰 390 터치 · 태블릿 768 터치 · 데스크톱 1280 마우스입니다. 실기 하이브리드 기기(터치+트랙패드)에서 행 탭은 시트, 마우스 클릭은 인라인으로 열리는지도 봐 주세요. 긴 상태 문구 「발주 완료 · 무장 해제」는 둘째 줄로 내려가고 말줄임이 없어야 합니다. 이 항목들은 자동으로 확인할 수 없습니다(20-VALIDATION Manual-Only).

## 인계 항목 처리

| 인계 | 처리 |
|---|---|
| 20-04 red: a11y:329 · orderbook:419(#11) · sidebar-tree:154 · trading-workbench:366(#3) + 정적 목록 3·4·5·7·10·12·GC2·13·14·15·16·17·18(28b) | 전부 이관·재정의했다. trading-workbench 는 serial 이라 파일 전체를 돌렸고, 「did not run」 0 으로 43 passed 다. 28b 는 오탐이었다(VI 입력 `field` 그대로 green). |
| D-02a 감시대상 풀폭 · 라벨 없음 | P20-3 은 감시대상 행을 44px 로 재고, 여유 계산에서는 뺀다(풀폭 토글이라 늘 0). 잘림은 두 판정이 본다. |
| 폰 기준선 행 +0.9px | 실브라우저 최악값에서 **+0.4px** 로 들어간다(위 표). 단언은 여유 ≥ −0.5 · 오른쪽 끝 ≥ −0.5. |
| 20-06 344 수동주문 라벨 잘림(human_judgment) | P20-3 이 예약창 최악 라벨로 48·48·38·38 높이와 overflow 0 을 단언한다. |
| 값 버튼 이름 중복 「체결 30,000주」 | 고쳤다(편차 1). 이름 계약은 그대로 두고 aria-describedby = 그룹 제목을 달았다. 단위 3건 · e2e a11y ③-b 로 잠갔다. |

## Task Commits

1. **Task 1:** `7c8755d` — test(20-07): 작업대 e2e 새 셀렉터 이관 · 더티 바 케이스 5개 즉시 반영 재정의 · P20-3 최악값 × 4밴드 폭/44px/그룹 높이
2. **편차 1:** `3c9f7c0` — fix(20-07): 같은 이름의 매수·매도 값 버튼을 그룹 제목 설명(aria-describedby)으로 구분
3. **Task 2:** `e14ac0f` — test(20-07): 터치 시트 P20-4·P20-5 · 호가 탭 시트 vs FAB(11 재정의) · a11y 스위치/인라인 편집/시트 axe · 사이드바 이관
4. **편차 2:** `2843881` — fix(20-07): 키패드 시트 빈 값에서 단위 「원」이 캐럿 위로 뜨던 정렬 결함 수정
5. **Task 3:** `72ecc48` — docs(20-07): Phase 20 최종 게이트 결과로 VALIDATION 상태 채움 · wave_0_complete · 범위 밖 발견 기록

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 접근성] 같은 이름의 매수·매도 값 버튼 구분 (20-04 인계)**
- **발견:** Task 2 a11y 이관
- **문제:** ≥700 두 열에서 「체결 30,000주」 와 「비교가격 127,400원」(두 비교가격이 같은 값일 때)이 매수·매도 양쪽에 같은 이름으로 선다. 스크린리더 버튼 목록에서 구분되지 않는다.
- **처리:** 이름에 그룹 접두를 붙이면 UI-SPEC §205 이름 계약이 깨지고 단위 테스트 4곳이 바뀐다. 그래서 `SettingGroup` 이 제목 span 에 `useId` 를 달고 컨텍스트로 내린다. `SettingRow` · `CheckValueRow` 값 버튼이 그 id 를 `aria-describedby` 로 쓴다. 제목 없는 가격 섹션 · 그룹 밖 렌더 · 체크 버튼(이름에 그룹이 이미 있음)은 설명이 없다. 보이는 변화는 0 이다.
- **검증:** setting-group ⑧ 3건(RED 1 실패 → GREEN) · 관련 5 파일 153 통과 · e2e a11y ③-b
- **파일:** `setting-group.tsx` · `setting-group.test.tsx` · **커밋:** `3c9f7c0`

**2. [Rule 1 - 시각 결함] 키패드 시트 빈 값 디스플레이 정렬**
- **발견:** Task 3 시각 확인(`manual-sheet-390-*.png`)
- **문제:** 값이 비면 값 슬롯에 줄 상자가 없어 baseline 정렬이 무너졌다. 단위 「원」이 캐럿보다 22.5px 위에 섰고, 수동주문 가격 시트를 처음 열 때마다 보였다.
- **처리:** 디스플레이 앞에 같은 글자 크기의 폭 0 받침(`String.fromCharCode(0x200b)` · `aria-hidden`)을 늘 둔다. 값 슬롯 텍스트는 빈 문자열 그대로라 단위 계약 `valueText() === ''` 가 유지된다.
- **검증:** e2e 가드 `expectUnitBesideCaret`(세로 중심 차 < 8px · 단위가 캐럿 오른쪽)를 P20-4(다 지운 뒤) · P20-5(빈 상자 첫 열림)에 넣었다. 받침을 잠시 지우면 **22.5 로 실패**하고, 복원하면 통과함을 확인했다. 시트 관련 단위 4 파일 194 통과. 재촬영으로 같은 줄을 확인했다.
- **파일:** `number-pad-sheet.tsx` · `trading-workbench.spec.ts` · **커밋:** `2843881`

**3. [Rule 1 - 낡은 단언] sidebar-tree 1 세그먼트 「잠김」**
- **발견:** Task 2 4-spec 실행(`sidebar-tree.spec.ts:211`)
- **문제:** `aria-disabled="true"` 를 기대했다. 그러나 quick-260923-pgv(`285f3b3`, Phase 20 이전)부터 등록 카드 세그먼트는 활성이다(거래소 토글 = 키 전환). 20-04 는 이 케이스의 실패를 체크박스(212)로 적었지만 실측 첫 실패는 그 앞 줄이었다.
- **처리:** `not.toHaveAttribute('aria-disabled','true')` 와 KRX 라디오 enabled 로 바꾸고 주석을 현행화했다.
- **커밋:** `e14ac0f`

**4. [Rule 3 - 판정 오탐] overflow.ts 히트 영역 가상요소 제외**
- **발견:** Task 1 첫 실행(케이스 4, 카드 699)
- **문제:** `GroupSwitch` 의 44 히트 확장 `::after`(-inset-x 2px)가 버튼 scrollWidth 를 2px 늘렸다. 저장소 유일 판정 `scrollOverflowing` 이 글자 없는 `button[popover-anchor]` 두 개를 「잘림」으로 잡았다.
- **처리:** `sr-only` 제외와 같은 결로 세 번째 제외를 더했다. 조건은 빈(`content:""`) 절대배치 `::before/::after` 가 있고, **요소의 실제 내용(Range · 글자 포함)이 자기 상자 안**인 경우다. 실제 글자 넘침은 그대로 잡는다.
- **파일:** `webapp/e2e/overflow.ts`(플랜 files 밖) · **커밋:** `7c8755d`

### 범위·문면 메모

- **acceptance grep `test\('(7|12|13|16|GC2)\.`:** 결과는 4다. GC2 제목은 원래 「GC2 카드…」(점 없음)라 이 정규식에 걸리지 않는다. 재정의 5건은 모두 있다(7 · 12 · 13 · 16 + `test('GC2 `). GC1 · GC3 과 ID 모양을 맞추려고 제목을 바꾸지 않았다.
- **`lcSwitch(` ≥ 4:** 처음엔 3이었다. 케이스 12(값 확정 뒤 매수주문 스위치 켜진 채)와 P20-3(최악값 시드의 두 게이트 켜짐)에 의미 있는 단언을 더해 6이 됐다.
- **P20-4 순서:** 플랜 문면은 「칩 → 키 98150(첫 키가 덮음)」 순서였다. 그러나 칩이 fresh 를 끄므로 그 순서로는 첫 키가 값을 덮지 않는다. 그래서 키 검증을 먼저 하고 칩을 뒤에 했다. 적용 값은 서버(71,000)와 다른 127,300 이다.
- **VALIDATION 범례:** acceptance 는 `⬜ pending` grep 0 이다. 범례 줄 「⬜ pending」을 「⬜ 대기」로 바꿔 맞췄다(행 상태는 전부 ✅).
- **20-02-T3 행:** 일회성 스파이크라 명령을 다시 돌리지 않았다. 「✅ green (20-02 실측 · 실브라우저 단언은 20-07 P20-3 이 대체)」로 적었다.

**Total deviations:** auto-fix 4(Rule 1 ×2 · Rule 2 ×1 · Rule 3 ×1) · 문면 메모 5. **Impact:** 주문·전송 경로 · 프로토콜 · 워크벤치 배관 변경은 0 이다. 제품 코드 변경은 aria 속성 1개와 보이지 않는 기준선 받침 1개뿐이다.

## Deferred Issues

- `deferred-items.md` 1건: 폰 밴드 수동주문 버튼의 접근성 이름이 「예약 매수」(공백 포함)로 계산된다. 18-07 `SideLabel` 의 block span 이 원인이고 Phase 20 과 무관하다. 낭독 의미는 같다.

## Known Stubs

없음.

## Threat Flags

없음. 새 네트워크 표면 · 인증 경로 · 스키마 변경이 없다. 플랜 threat_model 대응:
- T-20-16: 3100 리스너 확인 · cwd 확인 · 최종 e2e 는 Playwright 가 이 worktree 를 직접 띄움
- T-20-17: 옛 케이스 삭제 0 · 케이스 수 40 → 43 · orderbook 11 · a11y ⑦ 재정의
- T-20-09: P20-5 DirectOrderReq 0 · 감사 기록 0
- T-20-12: P20-3 최악값 × 4밴드

## Next Phase Readiness

- Phase 20 의 7개 플랜이 모두 완료됐다. `/gsd-verify-work 20` 로 넘길 수 있다(시각 UAT 1건 남음).
- `nyquist_compliant` · `status` · Approval 은 validate-phase 몫이라 건드리지 않았다.
- push · relay/webapp 배포 없음(theme/toss-b 미병합 실험 브랜치).

## Self-Check: PASSED

- 파일 9개 존재: trading-workbench · orderbook · a11y · sidebar-tree spec · `overflow.ts` · `setting-group.tsx` · `number-pad-sheet.tsx` · `20-VALIDATION.md` · `deferred-items.md`
- 커밋 5개 존재(`git log`): `7c8755d` · `3c9f7c0` · `e14ac0f` · `2843881` · `72ecc48` — `git rev-list --count 663307f..HEAD` = 5(SUMMARY 커밋 전)
- `git status --porcelain -- webapp/e2e/specs/zz-theme-gallery.spec.ts` → `?? webapp/e2e/specs/zz-theme-gallery.spec.ts`
- 임시 스크린샷 spec 2개는 실행 뒤 삭제했고 작업 트리에 남은 추적 외 파일은 원래 2개뿐이다
