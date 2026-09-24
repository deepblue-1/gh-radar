---
phase: 19-account-order-journal
plan: 08
subsystem: ui
tags: [webapp, today-orders, journal, B-prime, origin-chip, exchange-tag, journal-state, playwright, D-04, D-07, D-08]

requires:
  - phase: 19-06
    provides: "카드 원천 JournalOrderRow(REST 복원 + journal.rows 푸시) · mergeJournalRows · mergeOrderNotices(origin limit_chaser/vi + requester≠Manual 묶기) · 모르는 수량·가격 「—」"
  - phase: 19-07
    provides: "relay journal.state 프레임(live / delayed + since) — 카드 기록 지연 표식의 원천"
  - phase: 19-04
    provides: "JournalOrderRow 필드(accountNo · exchange · origin · requester) · RelayJournalStateMsg"
provides:
  - "components/trading/origin-tag.tsx — OriginTag({ tag, slot }) · originTagOf(origin) · OriginTagLabel(상따·VI·수동), account-panel 과 카드가 같은 조각"
  - "orders-api groupJournalRowsByAccount(rows, accounts) — relay 계좌 목록 순 · 목록 밖 계좌는 번호만으로 뒤에 · 행 없는 계좌 묶음 없음"
  - "「오늘 주문」 카드 B′ — 계좌 소제목 아래 묶음마다 표(≥1280)/2줄 카드 행(<1280), 통보 묶기는 묶음마다"
  - "출처 칩(미상 null 은 칩 없음) · NXT 행만 ExchangeTag · 「· 수동」 꼬리 제거 · 기록 지연 배지+안내 · 390px ②줄 줄바꿈"
  - "DOM 계약 today-orders-group(+data-account) · today-orders-group-account-no · today-order-origin · today-orders-delayed · today-orders-delayed-note"
  - "me.spec 테스트 9 · 10 (B′ 데스크톱 · 폰 390)"
affects: [19-12, 19-13, my-page, account-panel]

actuals:
  tokens: 15592
  tasks: 3
  commits: 3
plan_head_before: 3df9eb5692faf672c00c0f5e236dc3f23dc2a57d

tech-stack:
  added: []
  patterns:
    - "표시 원자 공용 추출 — 두 표면이 같은 칩을 쓰면 한 파일(exchange-tag.tsx 결)로 옮기고 slot prop 으로 DOM 계약만 가른다"
    - "병합 → 계좌 나누기 → 통보 접기 순서 — 접기가 계좌 경계를 넘지 않는다"
    - "e2e WebSocket 프레임 주입(page.routeWebSocket 프록시)으로 relay 가 못 내는 상태를 시각 확인용으로만 재현"

key-files:
  created:
    - webapp/src/components/trading/origin-tag.tsx
    - .planning/phases/19-account-order-journal/19-08-today-orders-{phone,wide}-{light,dark}[-delayed].png (8장)
  modified:
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/lib/orders-api.ts
    - webapp/src/components/trading/today-orders-card.tsx
    - webapp/src/components/trading/__tests__/today-orders-card.test.tsx
    - webapp/e2e/specs/me.spec.ts
    - .planning/phases/19-account-order-journal/deferred-items.md

key-decisions:
  - "19-08: 계좌 소제목 「계좌」 라벨은 plan 문구(11px) 대신 목업 .ahead .k · account-panel 계좌 머리와 같은 12px(t-caption) semibold — 목업이 UI 계약"
  - "19-08: 묶음 머리는 표/카드 행 두 벌이 아니라 묶음마다 한 번 — 한 묶음 안에 데스크톱 표(max-[1279px]:hidden)와 모바일 목록(min-[1280px]:hidden)을 둔다(뷰포트 규칙 유지)"
  - "19-08: 기록 지연 시각이 파싱 불가(orderTime 「—」)면 시각 문장을 빼고 지어내지 않는다"
  - "19-08: 표 머리 숫자 열 왼쪽 정렬(.tbl-wrap thead th 가 .num 을 이김)은 앱 전역 표 문제라 deferred-items 로 넘김"

patterns-established:
  - "OriginTag slot prop: account-panel 은 기본 account-origin-tag, 카드는 today-order-origin"

requirements-completed: [D-04, D-07, D-08]

coverage:
  - id: D1
    description: "B′ 계좌별 묶음 — relay 계좌 목록 순 · 목록 밖 계좌 번호만 · 행 없는 계좌 묶음 없음 · 소제목 N건 · 묶기가 계좌 경계를 넘지 않음"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑪-1 ⑪-2 ⑪-6"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#9. B′ — 데스크톱 1280"
        status: pass
    human_judgment: false
  - id: D2
    description: "출처 칩(상따·VI·수동, origin null 은 칩 없음 · account-panel 과 같은 클래스) · NXT 행만 ExchangeTag · 데스크톱 출처 열이 구분 뒤 · 「· 수동」 꼬리 없음 · 로컬 거부 「—」"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑪-3 ⑪-4 ⑪-5 ⑥-2 ⑫-4 ⑫-5"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx (무수정 59 green)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#9. B′ — 데스크톱 1280"
        status: pass
    human_judgment: false
  - id: D3
    description: "기록 지연 배지(role=status · 진행 점 · motion-reduce 정지) + 한 줄 안내(since → KST 시각), 로딩·빈·오류에서도 머리에, 행 흐림 없음"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑫-1 ⑫-2 ⑫-3"
        status: pass
      - kind: automated_ui
        ref: "playwright:.planning/phases/19-account-order-journal/19-08-today-orders-phone-light-delayed.png (routeWebSocket 으로 journal.state delayed 주입)"
        status: pass
    human_judgment: false
  - id: D4
    description: "390px 묶인 행 ②줄 줄바꿈 — 주문번호가 다음 줄로 내려가고 잘리지 않음 · 모든 행 잎 넘침 0"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑫-6"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#10. B′ — 폰 390"
        status: pass
    human_judgment: false
  - id: D5
    description: "목업 B′ 시각 대조(계좌 소제목 문법 · 칩 모양·색 · NXT 위치 · 줄바꿈 · 기록 지연 배지+안내 · 새 색 없음) — 라이트·다크 × 폰 390 · 데스크톱 1280"
    verification:
      - kind: automated_ui
        ref: "playwright:.planning/phases/19-account-order-journal/19-08-today-orders-*.png (8장, 실행자가 목업 캡처와 나란히 대조함)"
        status: pass
    human_judgment: true
    rationale: "plan human-check — 목업 채택안과 같은 문법인지는 grep·단위 테스트로 판정할 수 없다(end-of-phase UAT 에서 사용자 확인)"

duration: 10min
completed: 2026-09-25
status: complete
---

# Phase 19 Plan 08: 오늘 주문 카드 B′ Summary

**「오늘 주문」 카드를 채택 목업 B′ 로 — relay 계좌 목록 순 계좌별 묶음 · 줄마다 출처 칩(상따·VI·수동, 미상은 생략) · NXT 태그 · journal.state delayed 면 「기록 지연」 배지+시각 안내 · 390px 묶인 행 주문번호 줄바꿈, account-panel 출처 태그는 공용 `origin-tag.tsx` 로 추출**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-09-24T16:39:42Z
- **Completed:** 2026-09-24T16:50:00Z (KST 2026-09-25)
- **Tasks:** 3 / 3
- **Files modified:** 6 (소스·테스트) + 스크린샷 8 · deferred-items 1

## Accomplishments

- 카드가 계좌마다 소제목(계좌 · 번호 전체 · 상품명 · N건) 아래 목록/표를 반복한다. 순서는 relay 계좌 목록 순, 목록 밖 계좌는 번호만으로 뒤에, 행 없는 계좌는 묶음이 없다. 통보 묶기(`mergeOrderNotices`)는 묶음마다 불러 계좌 경계를 넘지 않는다. 헤더 「N건」 은 묶기 전 전체 행 수 그대로.
- 줄마다 출처 칩 — `originTagOf`: manual 수동 · limit_chaser 상따 · vi VI · null 은 칩 없음(D-08 보충 · T-19-30). 칩은 account-panel 과 같은 조각·같은 클래스(새 색 없음). NXT 행만 `ExchangeTag`(채움형)가 코드 옆에. 데스크톱 표는 「출처」 열이 구분 바로 뒤.
- `journal.state` 가 delayed 면 제목 옆 「기록 지연」 배지(role=status · 진행 점 `animate-pulse motion-reduce:animate-none`)와 「기록 지연 — 복구되면 채워집니다. HH:MM:SS 이후 주문이 아직 안 보일 수 있어요.」 안내. 로딩·빈·오류 본문과 무관하게 머리에 붙고, 이미 그린 행은 흐리게 하지 않는다(T-19-31).
- 모바일 ②줄 `flex-wrap gap-y-0.5` — 390px 에서 묶인 행(`#0000900010~0000900013 (4건)` + 가격 범위)의 주문번호가 다음 줄 오른쪽으로 내려가고 잘리지 않는다(기존 결함 수정 · D-07).
- 구분 칸의 「· 수동」 꼬리 제거(출처 칩이 말한다). `orderNoticeLabel` 의 메타 필드·함수는 trading-alerts 용으로 유지(trading-alerts 36 green).

## Task Commits

1. **Task 1: [tracer] B′ 한 경로 — 계좌별 묶음 · 출처 칩 · NXT 태그 · OriginTag 추출** — `74d9270` (feat)
2. **Task 2: 기록 지연 배지·안내 · 390px ②줄 줄바꿈 · 「· 수동」 꼬리 제거 · 로컬 거부 「—」** — `974059d` (feat)
3. **Task 3: e2e B′ — 계좌 순 묶음 · 칩 · NXT · 390px 주문번호 비잘림 + 목업 대조 시각 확인** — `cb28d46` (test)

Tracer 게이트: auto 모드 아님 · human_verify_mode end-of-phase · tracer `<verify>` 는 automated 만 → 재실행 green(카드·account-panel 89 · typecheck) 후 확장.

## Files Created/Modified

- `webapp/src/components/trading/origin-tag.tsx` (신규) — `OriginTag({ tag, slot = 'account-origin-tag' })` · `originTagOf(origin)` · `OriginTagLabel`. 순수 표시 원자(`'use client'`·relay 훅 없음), 머리 주석에 D-08(카드는 수동도 · account-panel 은 상따/VI 만).
- `webapp/src/components/orderbook/account-panel.tsx` — 비공개 `OriginTag` 삭제 · import 로 전환 · `AccountOriginTag = Exclude<OriginTagLabel, '수동'>`(prop 계약 유지).
- `webapp/src/lib/orders-api.ts` — `JournalAccountGroup` · `groupJournalRowsByAccount(rows, accounts)`.
- `webapp/src/components/trading/today-orders-card.tsx` — 헤더 주석 ⑨(계좌별 묶음) · ⑩(칩·태그) · ⑪(기록 지연), 묶음 렌더 · `OrderTableRow` / `OrderCardRow` 추출 · 기록 지연 배지+안내 · ②줄 줄바꿈 · `SideTag` 꼬리 제거.
- `webapp/src/components/trading/__tests__/today-orders-card.test.tsx` — ⑪-1~6 · ⑫-1~6 추가, ⑥-2 교체.
- `webapp/e2e/specs/me.spec.ts` — `TODAY_ORDERS` 두 계좌 9행(화면 6줄) · 테스트 9 · 10 · 테스트 8 목록 좁히기.
- `.planning/phases/19-account-order-journal/deferred-items.md` — 표 머리 `num` 정렬 전역 문제.

## 옛 ⑥-2 를 고친 사유

옛 ⑥-2 는 「수동 발주 · 시간외종가 접수는 「시간외종가 매수」 + 「수동」 메타로 읽힌다」 를 단언했다. D-08 로 구분 칸의 「· 수동」 꼬리가 없어지고 출처 칩이 수동을 말하게 됐으므로, 같은 입력(board G2 · requester Manual)에서 「구분 칸에 수동 없음 + 「· 수동」 텍스트 없음 + 칩 「수동」」 으로 바꿨다. 「시간외종가 매수」 단언은 그대로다.

## 시각 확인 (목업 B′ 대조)

실제 브라우저(Playwright · dev 3100 · relay 8090)에서 카드만 캡처했다. 기록 지연 상태는 relay 가 낼 수 없어(로컬 관찰자 비활성 = 무프레임) `page.routeWebSocket` 프록시로 `{t:"journal.state", s:"delayed", since: 04:52:10Z}` 한 프레임을 주입해 찍었다(임시 spec — 커밋 안 함).

- `.planning/phases/19-account-order-journal/19-08-today-orders-phone-light.png`
- `.planning/phases/19-account-order-journal/19-08-today-orders-phone-dark.png`
- `.planning/phases/19-account-order-journal/19-08-today-orders-phone-light-delayed.png`
- `.planning/phases/19-account-order-journal/19-08-today-orders-phone-dark-delayed.png`
- `.planning/phases/19-account-order-journal/19-08-today-orders-wide-light.png`
- `.planning/phases/19-account-order-journal/19-08-today-orders-wide-dark.png`
- `.planning/phases/19-account-order-journal/19-08-today-orders-wide-light-delayed.png`
- `.planning/phases/19-account-order-journal/19-08-today-orders-wide-dark-delayed.png`

목업 캡처(`#fBpmL` · `#fBpmSD` · `#fBpd`)와 나란히 본 결과: 계좌 소제목 문법(계좌 12 muted · 번호 mono 굵게 · 상품명 · N건 오른쪽), 칩 모양·색(회색 채움 11px), NXT 채움 태그가 코드 바로 뒤, 390 에서 묶인 줄의 「주문 #…~… (4건)」 이 다음 줄 오른쪽으로 내려감, 「· 수동」 꼬리 없음, 기록 지연 배지(회색 둥근 · 점)와 안내 박스(「기록 지연」 만 fg 굵게 · 시각 mono)가 목업과 같다. 새 색은 없다. 줄바꿈·잘림·겹침 결함 없음.

- 폰 캡처 왼쪽 아래의 검은 원은 Next.js dev 표시(개발 서버 전용 · fixed)다 — 앱 요소가 아니다(AI FAB 은 오른쪽 아래 · /me 에 없음).
- 데스크톱 표의 「수량」·「가격」 머리가 왼쪽 정렬로 보이는 것은 앱 전역 표 CSS 문제라(아래 Deferred) 이 카드에서 고치지 않았다. 목업은 오른쪽 정렬.
- 목업처럼 데스크톱 표는 묶음마다 하나라 두 계좌 표의 열 폭이 서로 다르다(목업 dTable 과 같음).

## Decisions Made

- 계좌 소제목 「계좌」 라벨은 목업 `.ahead .k` 와 account-panel 계좌 머리의 12px(t-caption) semibold 를 따랐다(plan 문구는 11px — 목업이 계약).
- 묶음 머리는 묶음마다 한 번만 그리고, 그 안에 데스크톱 표와 모바일 목록 두 벌을 둔다(뷰포트 규칙 유지 · 머리 중복 없음). 목록 `data-slot="today-orders-list"` 는 이제 계좌마다 하나다.
- 기록 지연 since 가 파싱 불가하면 시각 문장을 뺀다(모르는 시각을 지어내지 않음).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 테스트 8 의 `today-orders-list` 단일 가정**
- **Found during:** Task 3
- **Issue:** B′ 로 목록이 계좌마다 한 벌이 되어 `page.locator('[data-slot="today-orders-list"]')` 의 `boundingBox()` 가 strict 모드 다중 일치로 깨질 상황.
- **Fix:** 긴 종목명 행(0000900002)이 든 목록으로 `filter({ has })` 좁힘. 측정 규율(잎 좌표)은 그대로.
- **Files modified:** webapp/e2e/specs/me.spec.ts
- **Commit:** cb28d46

**2. [Rule 2 - Missing] 카드 머리 줄 `flex-wrap`**
- **Found during:** Task 2
- **Issue:** 머리(제목 · N건 · 기록 지연 배지)가 전부 `flex:none` 이라 폭이 모자라면 줄바꿈 대신 잘린다. 목업 `.toc-h` 는 `flex-wrap: wrap`.
- **Fix:** 머리 div 에 `flex-wrap` 추가(390 에서는 한 줄에 들어 시각 변화 없음).
- **Files modified:** webapp/src/components/trading/today-orders-card.tsx
- **Commit:** 974059d

**3. [Rule 3 - Fixture] e2e 픽스처 기존 2행 값 조정**
- **Found during:** Task 3
- **Issue:** plan 이 요구한 「NXT 태그 1개」 · 「계좌 B 의 origin null 행」 과 기존 ord-b(NXT · limit_chaser) · ord-c(origin null, 계좌 A)가 충돌.
- **Fix:** ord-b 를 KRX · origin null(긴 종목명 · 0000900002 유지), ord-c 를 origin manual 로. 가장 최신 행(ord-f)을 계좌 B 에 둬 계좌 목록 순 단언이 첫 등장 순과 갈리게 했다.
- **Files modified:** webapp/e2e/specs/me.spec.ts
- **Commit:** cb28d46

**4. [추가 DOM 훅] `today-orders-group-account-no` · `today-orders-groups`**
- plan DOM 계약 표에 없는 두 슬롯을 더했다 — e2e 가 묶음 머리 번호를 텍스트 전체가 아니라 그 칸으로 단언하기 위해. 기존 계약은 그대로.

**TDD 메모:** `tdd="true"` 두 task 는 테스트와 구현을 한 커밋(feat)에 담았다 — 별도 RED 커밋 없음. 새 단언(⑪ · ⑫)은 각각 구현 전 코드에서 실패하는 구조 단언(data-slot · 클래스 · 텍스트 부재)이다.

**Total deviations:** 3 auto-fixed(Rule 2 ×1 · Rule 3 ×2) + DOM 훅 추가 1. **Impact:** 기능 범위 변화 없음 — 표면 안의 잘림 예방과 테스트 정합.

## Deferred Issues

- 표 머리 숫자 열 오른쪽 정렬이 앱 전역에서 먹지 않는다(`.tbl-wrap thead th` 명시도가 `.num` 을 이김) — `deferred-items.md` 19-08 절. 모든 표 표면에 번지는 한 줄 수정이라 범위 밖.

## Verification

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` — green(tsc + e2e tsconfig).
- `pnpm --filter @gh-radar/webapp run test` — **98 files / 1707 passed** (1 skipped 기존) — 기준선 1695 → +12(⑪ 6 · ⑫ 6, ⑥-2 교체).
- `vitest run today-orders-card · account-panel` 89 green(account-panel 테스트 무수정 — `git diff --stat` 출력 없음) · `trading-alerts` 36 green.
- `playwright test e2e/specs/me.spec.ts` — **11 passed**(setup 1 + 기존 1~8 + 신규 9 · 10). 실행 전후 3100 · 8090 LISTEN 없음 확인.
- Acceptance: `function OriginTag` in account-panel 0 · `origin-tag` 2 · `groupJournalRowsByAccount` 3 · `today-order-origin` 2 · `ExchangeTag` 4 · `label.meta` 0 · `today-orders-delayed` 2 · `motion-reduce:animate-none` 1 · `flex-wrap gap-y-0.5` 1 · me.spec `today-orders-group` 4 · `B′` 6.

## Known Stubs

없음.

## Next Phase Readiness

- webapp 변경은 미push — 19-12 배포 순서(relay 먼저 · push 나중)를 따른다. 기록 지연 표식은 relay 19-07 이미지가 배포되고 `DMA_OBSERVER_SECRET` 이 주입돼야 실제로 뜬다(그 전에는 무프레임 = 표식 없음).
- 다음: 19-09.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/origin-tag.tsx
- FOUND: 스크린샷 8장(.planning/phases/19-account-order-journal/19-08-today-orders-*.png)
- FOUND: 74d9270 · 974059d · cb28d46 (`git log --oneline` 확인)
