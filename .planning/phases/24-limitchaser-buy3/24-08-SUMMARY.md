---
phase: 24-limitchaser-buy3
plan: 08
subsystem: webapp-trading-lc-e2e
status: complete
tags: [limit-chaser, buy3, e2e, playwright, a11y, axe, backstop, width-invariant, d-01, d-02, d-16, d-19]
requires:
  - 24-07 (선매수 자동 체크 · D-04 기본값 · D-17 시딩)
  - 24-06 (commitGroupSwitch · D-02 후반 dropMasterAfterServerFold · 사전 검증 · D-16)
  - 24-05 (서버 접힘 로그 문장 · 후매수 override 무배너)
  - 24-04 (접이식 그룹 카드 · 요약 줄 · 흐림 한 겹 · L3)
provides:
  - "e2e P24-2 ~ P24-8 (webapp/e2e/specs/trading-workbench.spec.ts) — 실브라우저 행동 증거 + 폭 · 한 화면 backstop"
  - "a11y 상따 매수 카드 axe 매트릭스 344 · 992 × 라이트 · 다크 × 접힘 · 펼침 (webapp/e2e/specs/a11y.spec.ts)"
  - "readSetLimitChaserRequest 매도 · 취소 게이트/체크 8필드 (relay/tests/helpers/fake-gateway.ts)"
  - "SettingGroup 제목줄 상태 문구 — inline-block 덩어리 + 「 · 」 조각 경계 줄바꿈(statusPiecesOf)"
  - "시각 확인용 스크린샷 8장 (reference/24-08-visual/)"
affects: [24-09]
plan_head_before: 0512552524963d6ae112afa91f02b765eb3858f6
estimate:
  tokens: 75000
actuals:
  tokens: 15000
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "제출 여부는 게이트웨이 10 개수(lcSetCount), 내용은 디코드(lcSetRequests) — 화면 낙관 표시로 제출을 말하지 않는다"
    - "관찰 창(waitForTimeout 1500)으로 「정확히 1건 · 추가 0건」 을 잰다 — 자동 제출 루프(T-24-43) 단언"
    - "폭 판정 범위를 우측 설정 패널로 좁혀 phase 밖 기존 실패(카드 헤더 <b> 넘침)와 분리"
    - "누적 opacity = 조상 체인 곱 — 흐림 한 겹(0.45)과 겹침(0.2025)을 실브라우저 계산값으로 가른다"
key-files:
  created:
    - .planning/phases/24-limitchaser-buy3/reference/24-08-visual/ (스크린샷 8장)
  modified:
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/e2e/specs/a11y.spec.ts
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
    - relay/tests/helpers/fake-gateway.ts
key-decisions:
  - "제목줄 상태 문구는 inline-block 한 덩어리 + 「 · 」 조각(nowrap) 경계에서만 줄바꿈 — 본문 344 에서 「켜짐 ·」/「켠 매수 없음」 쪼개짐을 고치고, 전체 nowrap 은 폭 0.4px 차로 스위치를 덮을 수 있어 쓰지 않았다"
  - "P24-7 은 P20-3 을 복제하지 않고 판정 범위를 우측 설정 패널로 둔다 — 카드 헤더 이름 넘침(기존 실패)이 phase 24 backstop 을 가리지 않게"
  - "D-02 후반 재수신 단언은 계획 순서 그대로(마스터 OFF 제출 in-flight 중 같은 접힘 에코 재주입 → 0건, 그 뒤 마스터 OFF 에코 → 서버 접힘 로그 · 무배너)로 통과했다"
metrics:
  duration: 23min
  started: 2026-09-27T19:29:23Z
  completed: 2026-09-27T19:53:00Z
  tasks: 2
  files: 5
requirements-completed: []
coverage:
  - id: T1
    description: "P24-2 ~ P24-6 — 접기 · D-01 + 자동 체크 · D-02 전반/후반 · D-19 · 삭제 가드 · 사전 검증 · D-16 · 후매수 단계 · override 무배너"
    verification:
      - kind: e2e
        ref: "playwright:e2e/specs/trading-workbench.spec.ts -g \"P24-\" (P24-1 ~ P24-6 · 6 passed + setup)"
        status: pass
    human_judgment: false
  - id: T2
    description: "P24-7 폭 최악값 · 행 44 · 흐림 0.45 · 폰 긴 상태 문구 / P24-8 폰 한 화면 / axe 매트릭스"
    verification:
      - kind: e2e
        ref: "playwright:e2e/specs/trading-workbench.spec.ts -g \"P24-7|P24-8\" (2 passed + setup)"
        status: pass
      - kind: e2e
        ref: "playwright:e2e/specs/a11y.spec.ts 상따 매수 카드 axe 매트릭스 (8 스캔 · 0 위반)"
        status: pass
    human_judgment: true
    rationale: "R6(한방 두 행) 수용 여부와 폰 · 데스크톱 × 라이트 · 다크 시각 확인은 사용자 답이 필요하다 — 아래 「사람 확인 남은 항목」"
---

# Phase 24 Plan 08: e2e 증거 · 폭 · 한 화면 · a11y Summary

24-04 ~ 24-07 이 단위 테스트로 세운 매수 3종 동작을 진짜 relay + 스텁 게이트웨이 위의 실브라우저로 끝까지 증명했다. 제출 여부는 게이트웨이가 받은 `SetLimitChaserReq(10)` 개수로, 내용은 디코드로 단언했다. UI-SPEC 폭 불변식 · 폰 한 화면 · 흐림 한 겹 · axe 매트릭스와 backstop 4건을 쟀다. 제목줄 상태 문구가 본문 344 에서 구분점 앞뒤로 쪼개지는 시각 결함 하나를 고쳤다.

**두 클라 동작 같음(D-19 2026-09-28 정정):** 서버 접힘 에코(세 그룹 OFF · 마스터 ON · 매도 ON)를 받으면 웹도 WinForms `b066e135` 처럼 마스터 OFF 를 정확히 1건 보낸다. 같은 에코를 다시 받거나 삭제 가드 상태면 0건이다(P24-4 실브라우저 단언).

## Performance

- **Duration:** 23 min
- **Started:** 2026-09-27T19:29:23Z
- **Completed:** 2026-09-27T19:53:00Z
- **Tasks:** 2/2
- **Files modified:** 5 (+ 스크린샷 8장)

## Accomplishments

- **P24-2 접기 · 요약:** 첫 렌더에서 세 접기 버튼은 `aria-expanded=false` 다. 선매수 행은 DOM 에 있지만(`toHaveCount(1)`) 숨어 있다. 요약 줄 3개가 보인다. 접기 버튼을 누르면 펼쳐지고 전송은 0건이다. 스위치를 눌러도 접힘은 그대로다. 에코가 와도 펼친 카드는 펼친 채이고 나머지 두 카드는 접힌 채다.
- **P24-3 D-01 + D-06:** 마스터 OFF 전략에서 「선매수 켜기」를 한 번 누르면 10 이 정확히 1건 나간다. 디코드 결과는 `buy3Schema 1 · crud C · preBuyEnabled · buyEnabled` 와 자동 체크 6종 전부 true 다. 확인창은 없다. 에코 뒤 로그 첫 줄은 「선매수 자동 체크 — 켬: …」, 둘째 줄은 「선매수 체크 — 매수주문도 켬」이다.
- **P24-4 D-02 · D-19:**
  - (a) 사람이 마지막 그룹(후매수)을 끄면 10 한 건에 `postBuyEnabled false · buyEnabled false · crud C · sellEnabled true` 가 실린다.
  - (b) 서버 접힘 에코 뒤 1.5초 안에 10 이 정확히 1건 더 나간다. 디코드는 `buyEnabled false · crud C · 매도 ON · 세 그룹 false` 다. 같은 에코를 다시 넣으면 1.5초 동안 추가 0건이다. 마스터 OFF 에코 뒤 로그 최상단은 「서버가 매수 그룹 해제 — 매수 그룹이 모두 꺼져 매수주문도 끔」이고 「다른 단말」 배너는 없다.
  - (c) 삭제 가드(매도 · 취소 게이트 전부 OFF)에서는 추가 0건이고 매수주문 상태는 「켜짐 · 켠 매수 없음」이다.
- **P24-5 사전 검증 · D-16:**
  - 레거시 에코(`buy3Schema 0` · 신필드 0)에서 추가매수를 켜면 전송 0건이다. `role=alert` 로 「주문금액을 먼저 입력해 주세요」가 뜬다. 금액을 확정하면 10 한 건 · 에코 뒤 줄이 사라진다.
  - 비교가격 = 매수1호가 97,900 이면 전송 0건 · 사전 검증 줄 없음이다. 로그 원문은 「추가매수는 상한가 도달 전에만 켤 수 있습니다 — 매수1호가 == 비교가격」이다.
  - 비교가격이 98,000 이면 같은 클릭이 10 한 건을 만든다.
- **P24-6 후매수 단계:**
  - 단계 1 은 「감시 중」이다.
  - 단계 2 에서 매도 · 취소 값 override(330,000주)가 와도 결과는 이렇다: 후매수 · 매수주문 「보유중」, 매수 LED `latent`, 매도 · 취소 상태 끝 「 · 후매수 발동」. 배너 · 「서버 반영 완료」 · 「다른 단말」 로그는 0 이고 전송도 0 이다.
  - 단계 3 은 「소진」이다. 요약은 「3회 · 남은 0회」이고, 펼치면 소진 안내 원문이 보인다.
- **P24-7 폭 · 높이 · 흐림:**
  - 본문 344 · 700 · 830 · 992 에서 패널 넘침 0 · 잘림 두 판정 0 · 말줄임 0 이다. 모든 행은 44px(±0.5)이고 접기 버튼은 ≥ 32 다. 접힌 요약 줄(최대 5줄)의 세로 · 가로 넘침은 0 이고 kv 잘림도 0 이다.
  - 꺼진 선매수 · 추가매수 행 글자의 누적 opacity 는 0.45 다(0.2025 아님). 원형 체크 · 스위치 · 접기 버튼은 1 이고 켜진 후매수 글자도 1 이다.
  - 폰 밴드 긴 상태 문구는 제목 옆 흐름의 둘째 줄에 서고 말줄임이 없다. 스위치는 헤더 오른쪽 끝이다.
- **P24-8 폰 한 화면:** 390×844 · D-04 기본값 · 후매수 감시 중 · 세 카드 접힘 조건에서 탭 줄 위부터 후매수 카드 아래까지 **584px**(≤ 660)다.
- **axe 매트릭스:** 본문 344 · 992 × 라이트 · 다크 × 접힘 · 펼침 8 스캔에서 critical/serious 위반은 0 이다(기존 예외 `color-contrast` 규칙 그대로).

## Backstop 측정값

| 항목 | 값 |
|---|---|
| 행 최소 여유(px) — P24-7 | 344: **+0.4**(「잔량추적 기준선 100,000주」 · Phase 20 기준선 행) · 700: +8.7 · 830: +3.7 · 992: +50.7(셋 다 「최대 잔량 177,000,000주 ›」) |
| 접힌 요약 줄 수 | 344: 선매수 4 · 추가매수 3 · 후매수 5 / 700: 4 · 3 · 4 / 830: 4 · 3 · 5 / 992: 3 · 2 · 3 — 전부 잘림 0 · 카드가 늘어남 |
| 폰 밴드 긴 상태(E1 long-text) | 「켜짐 · 켠 매수 없음」 헤더 50px · 상태 1줄(85.8 / 흐름 112px) · 「무장 · 대기 · 후매수 발동」 헤더 64px · 상태 2줄(「무장 · 대기 ·」/「후매수 발동」 · 자연 폭 111.9 vs 흐름 폭 ≈111.6 — 0.4px 모자람) |
| 폰 한 화면(E1 overflow) | 584px ≤ 660 · 매수주문 128 · 선매수 119 · 추가매수 119 · 후매수 141 · 카드 폭 372 |
| E7 partial(override 무배너) | P24-6 단계 2 — 배너 0 · 「서버 반영 완료」 0 · 「다른 단말」 로그 0 |
| L3 백스톱 추가 적용 | 불필요 — 모든 폭에서 통과(24-04 가 이미 L3 를 폰 밴드 전체에 켰다) |

## Phase 전체 diff 점검(액션 ⑤)

기준은 24-01 계획 시작 커밋 `10fea29b` 이다(24-01 SUMMARY `plan_head_before`).

- `git diff 10fea29b -- webapp/src | grep -E '^\+' | grep -cE '@media|(^|[" ])(sm|md|lg|xl|2xl):'` → **0**
- 컨테이너 경계 숫자: 추가된 줄의 `@min-[Npx]` 는 전부 기존 `700` 이다(+2 · −7). 새 숫자는 0 이다.
- 새 색 토큰: `globals.css` 에 추가된 `--` 변수 **0**

## 검증

| 명령 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "P24-"` | 7 passed (setup + P24-1 ~ P24-6) — Task 1 시점. Task 2 뒤 P24-1 ~ P24-8 전부 아래 전체 실행에 포함 |
| `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "P24-7\|P24-8"` | 3 passed (setup + 2) |
| `pnpm --filter @gh-radar/webapp run typecheck` | exit 0 (tsc + tsconfig.e2e) |
| `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/a11y.spec.ts e2e/specs/me.spec.ts e2e/specs/sidebar-tree.spec.ts --grep-invert "5\. 격자\|P20-3 최악값\|iPhone 가로 폭 844"` | **85 passed** (3.0m) · failed 0 |
| 기존 실패 3건 단독 재실행 | 그대로다(deferred-items): 5. 격자 헤더 `<b>` 26px · P20-3 헤더 `<b>` 24px · iPhone 844 16px 기대 vs 14px. 이번 변경과 무관하다 |
| `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading src/lib` | 77 files · 2066 passed · 1 skipped |
| `relay: npx vitest run tests/fanout.test.ts` (디코더 확장 회귀) | 61 passed |
| eslint(변경 4파일) | 0 |

수용 grep 결과:

- `test('P24-[2-6] ` 5 · `waitForTimeout(1500)` 3 · 서버 접힘 문장 1 이상 · `10\.41\.|DMA_HOST=10` 0
- `test('P24-(7|8) ` 2 · `660` 3 · `0.45` 6 · a11y `dark|colorScheme` 1 이상

## Task Commits

1. **Task 1: 행동 e2e P24-2 ~ P24-6** — `d74eaf58`
2. **Task 2: 폭 · 높이 · 흐림 · 한 화면 · axe + 상태 문구 줄바꿈 수정** — `7aa4cabc`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 막힘] `readSetLimitChaserRequest` 에 매도 · 취소 필드가 없었다**
- **Found during:** Task 1 (P24-3 자동 체크 동반 단언)
- **Issue:** e2e 디코더는 매수 필드만 꺼냈다. 그래서 `sellEnabled` · `cancelQtyEnabled` 동반과 D-02 후반 제출의 매도 게이트 유지를 단언할 수 없었다.
- **Fix:** 테스트 헬퍼에 8필드를 추가했다(`sellEnabled` · `sellTradeQtyEnabled` · `sellQtyTrackEnabled` · `sellOrderPrice` · `sellWatchPrice` · `cancelQtyEnabled` · `cancelTradeEnabled` · `cancelQtyTrackEnabled`). 생성 접근자를 그대로 읽는 추가만 했고 제품 코드 변경은 없다. relay `fanout.test` 61 passed.
- **Files modified:** relay/tests/helpers/fake-gateway.ts (플랜 files 밖)
- **Commit:** d74eaf58

**2. [Rule 1 - 시각 결함] 제목줄 상태 문구가 구분점에서 쪼개졌다**
- **Found during:** Task 2 (P24-7 E1 long-text)
- **Issue:** 본문 344 에서 「매수주문 켜짐 ·」 / 「켠 매수 없음」으로 상태가 제목 줄과 둘째 줄에 걸쳐 갈렸다. UI-SPEC 은 「둘째 줄로 내려간다」고 적었다.
- **Fix:** 상태 span 을 `inline-block max-w-full` 한 덩어리로 바꿨다. `statusPiecesOf` 로 「 · 」 조각을 `nowrap` 으로 나누고 구분점은 앞 조각에 붙였다. 전체 `nowrap` 은 쓰지 않았다. 「무장 · 대기 · 후매수 발동」은 344 흐름 폭보다 0.4px 넓어 스위치를 덮을 수 있기 때문이다. 그래서 조각 경계에서만 줄바꿈한다. 글자와 접근성 이름은 원문 그대로다. 새 경계 숫자 · 뷰포트 분기 · 글자 크기 변경은 없다.
- **Files modified:** webapp/src/components/trading/lc/setting-group.tsx · setting-group.test.tsx(상태 span 조회를 `data-slot` 으로 바꾸고 조각 단언 추가)
- **Commit:** 7aa4cabc

**Total deviations:** 2 auto-fixed(Rule 3 ×1 · Rule 1 ×1). **Impact:** 아키텍처 변경 없음 · 새 전송 경로 없음. relay 런타임 변경 없음(테스트 헬퍼만).

## 사람 확인 남은 항목 (UAT 후보)

아래는 자동 측정으로 닫을 수 없어 사용자 눈이 필요하다. 참고 스크린샷은 `.planning/phases/24-limitchaser-buy3/reference/24-08-visual/` 에 있다(폰 390 · 데스크톱 1280 × 라이트 · 다크 × 접힘 · 펼침 8장 · 시드 = 선매수 한방 3건 @12,990원 · 추가매수 OFF(흐림) · 후매수 감시 중). 확인 경로: dev 서버 `http://localhost:3100/trading`(`./dev.sh --with-relay`).

1. **R6 한방 두 행 수용 여부(24-04 · 필수 답):** 선매수 안 한방이 「○ 한방 ─ 3건 ›」 + 「한방가격 ─ 12,990원 ›」 두 행이다. 스케치 009 D 의 한 행 「☐한방 3건 @12,990원」과 다르다(UI-SPEC R6, 폰 행 폭 불변식 때문). **사용자 답: 미수령** — 실행자는 사용자에게 물을 수 없다.
2. **접힌 카드 · 요약 줄 · 흐림 · L3(24-04):** 기본 접힘과 요약 값의 가독성을 본다. 꺼진 그룹 흐림(0.45)의 대비도 본다. 폰 밴드에서는 쉐브런이 숨는다(L3).
3. **제목줄 상태 줄바꿈(24-08 수정):** 폰 밴드에서 「켜짐 · 켠 매수 없음」이 둘째 줄 한 덩어리인지 본다. 본문 344 매도 카드 「무장 · 대기 · 후매수 발동」은 0.4px 차로 「무장 · 대기 ·」/「후매수 발동」 두 줄(헤더 64px, 3줄 헤더)이 된다 — 이 모양을 받아들이는지 확인이 필요하다.
4. **로그 문장 모양(24-05 · 24-06 · 24-07):** D-01 줄과 자동 체크 줄의 순서는 e2e 가 단언했다. 줄바꿈 · 색(생략 있으면 error 빨강)과 「서버가 매수 그룹 해제 — …」 · D-16 원문 한 줄의 공용 패널 모양은 사람이 봐야 한다.
5. **사전 검증 줄 시각(24-06):** 12.5px, 긴 문구 2~3줄 접힘, 카드 폭 안, 접힘/펼침 때 위치.
6. **무장 불가 패널 한 줄 병합 문구(24-06):** 「매수주문 · 선매수 · 추가매수 · 후매수 · …」.
7. **선매수 켬 실제 흐름(24-07):** 매도 탭으로 자동 이동하지 않는지 본다(폰 밴드 — e2e 는 와이드에서만 확인). 매도 · 취소 스위치 · 체크가 낙관 ON 뒤 에코로 확정되는지 본다.
8. **시딩 값 표시(24-07):** 새 전략 카드 360 폭 「체결량 17,909,347주」가 빠듯하지만 잘리지 않는지 본다.
9. **라이트 · 다크 전반:** 매도 「주문가격 · 비교가격 · 매수잔량」 · 취소 「매수잔량」 라벨, 상태 색(감시 중 초록 · 보유중 주황)을 두 테마로 본다.

## Known Stubs

없음.

## Deferred Issues

`deferred-items.md` 의 기존 e2e 실패 3건(5. 격자 · P20-3 최악값 · iPhone 844 16px)은 그대로이고 이번 변경과 무관하다. P24-7 은 판정 범위를 우측 패널로 두어 그 헤더 넘침에 막히지 않는다.

## Threat Flags

없음. 새 네트워크 표면 · 인증 경로 · 스키마 변경이 없다. 이행 내역:

- **T-24-34:** spec 에 `10.41.` · `DMA_HOST=10` 리터럴 0 이다. 게이트웨이는 `withLocalRelay` 의 `127.0.0.1` 스텁이다.
- **T-24-35:** 계좌 `E2E_ACCOUNT_NO` · 종목 `E2E_ISIN` 픽스처 상수만 쓴다. 스크린샷도 스텁 데이터다.
- **T-24-43:** 게이트웨이 수신 개수로 하강 전이 1건 · 재수신 0건 · 삭제 가드 0건을 단언했다(P24-4).
- **T-24-36:** backstop 은 전부 통과했다. 수정은 상태 문구 줄바꿈 한 건(말줄임 0 · 뷰포트 분기 0 · 새 숫자 0)이다.

## Self-Check: PASSED

- FOUND: webapp/e2e/specs/trading-workbench.spec.ts · webapp/e2e/specs/a11y.spec.ts · webapp/src/components/trading/lc/setting-group.tsx · relay/tests/helpers/fake-gateway.ts · reference/24-08-visual/ (8 png)
- FOUND commits: d74eaf58 · 7aa4cabc
