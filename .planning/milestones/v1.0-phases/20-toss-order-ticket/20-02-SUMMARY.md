---
phase: 20-toss-order-ticket
plan: 02
subsystem: ui
tags: [krx-tick, numpad, pure-functions, vitest, playwright-spike, container-query]
status: complete

requires:
  - phase: 20-toss-order-ticket (20-01)
    provides: "필드 확정 상태 기계 · 인라인 편집 트레이서 — 이 플랜과 파일 교차 없음(같은 wave 순수 기반)"
provides:
  - "packages/shared/src/krxTick.ts — krxTickSize · tickUp · tickDown · priceInputIssue · PriceIssue (저장소 유일 호가 단위 표)"
  - "limitUpPrice · order-panel deriveTickSize 폴백이 krxTickSize 를 부른다(행동 보존)"
  - "webapp/src/lib/numpad.ts — 키패드 버퍼 리듀서 · 단위별 칩 · 검증 문구 · ↑↓ 스텝(시트 20-03 · 인라인 20-05 · 수동주문 20-06 공용)"
  - "폭 스파이크 실측 표 — 20-04 백스톱 레벨 · 20-06 ≥700 버튼 17px 판단 근거"
affects: [20-03, 20-04, 20-05, 20-06, 20-07, intraday-sync]

actuals:
  tokens: 8553
  tasks: 3
  commits: 4
plan_head_before: 178ad5325261e7e006cf17b882c146c6a679da51

tech-stack:
  added: []
  patterns:
    - "RED 스텁은 중립값(0/v/null)을 돌려 단언 실패로 RED 를 만든다(throw 는 단언이 아님)"
    - "흡수 리팩터 전 옛 동작을 현 코드에서 통과하는 특성 테스트로 먼저 고정(⑳~㉒)"
    - "일회성 폭 스파이크 = 저장소 밖 Node ESM + createRequire 로 webapp 의 @playwright/test 차용 + Pretendard data URL"

key-files:
  created:
    - packages/shared/src/krxTick.ts
    - packages/shared/src/krxTick.test.ts
    - webapp/src/lib/numpad.ts
    - webapp/src/lib/__tests__/numpad.test.ts
  modified:
    - packages/shared/src/limitUp.ts
    - packages/shared/src/index.ts
    - webapp/src/components/orderbook/order-panel.tsx
    - webapp/src/components/orderbook/__tests__/order-panel.test.tsx

key-decisions:
  - "20-04 폭 백스톱: 폰(344) L2 · 700 L2 · 992 L0 — 830 은 감시대상 행이 L2 로도 3.4px 넘쳐 사다리로 해소 불가(⚠ 20-04 전 사용자 결정 필요 · 권고 = ≥700 토글 좌우 10→8)"
  - "20-06: ≥700 수동주문 버튼 「예약매수」 17px 는 206px 버튼에 한 줄(58.1px)로 든다 → @min-[700px]/lc:text-[17px] 적용 가능"
  - "키패드 9자리 상한에서 「00」처럼 한 번에 두 자리가 넘치는 키는 한 자리만 받지 않고 키 전체를 무시한다"
  - "padChipDisabled 의 maxPieces 한도는 set 칩에 적용 — 호출부는 단위 '회'에서만 maxPieces 를 넘긴다(PadCtx 주석에 계약 명시)"

patterns-established:
  - "호가 단위가 필요한 곳은 @gh-radar/shared 의 krxTickSize/tickUp/tickDown/priceInputIssue 만 부른다 — 표 복제 금지"
  - "키패드 규칙은 webapp/src/lib/numpad.ts 한 벌 — 시트·인라인·수동주문이 같은 함수를 쓴다"

requirements-completed: []

coverage:
  - id: D1
    description: "KRX 호가 단위 헬퍼 한 곳 + 7구간 경계 · ±1호가 · 입력 검증(보정 없음)"
    verification:
      - kind: unit
        ref: "packages/shared/src/krxTick.test.ts (23)"
        status: pass
  - id: D2
    description: "limitUpPrice · deriveTickSize 폴백 행동 보존(흡수 리팩터)"
    verification:
      - kind: unit
        ref: "packages/shared/src/limitUp.test.ts · webapp order-panel.test.tsx ⑳~㉒"
        status: pass
  - id: D3
    description: "키패드 버퍼 · 칩 · 검증 문구 · canConfirm · ↑↓ 스텝"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/numpad.test.ts (58)"
        status: pass
  - id: D4
    description: "폭 예산 스파이크 — 4밴드 × L0~L3 행 넘침 · 시트 · 버튼 실측"
    verification:
      - kind: other
        ref: "저장소 밖 일회성 스크립트(삭제됨) — 수치는 이 문서 「폭 스파이크」 절"
        status: pass

duration: 11min
completed: 2026-09-25
---

# Phase 20 Plan 02: 호가 단위 헬퍼 · 키패드 규칙 · 폭 스파이크 Summary

**KRX 7구간 호가 단위를 `packages/shared/src/krxTick.ts` 한 곳으로 올려 `limitUpPrice` · `deriveTickSize` 폴백이 같은 함수를 부르게 했다(행동 보존). 키패드 버퍼 · 단위별 칩 · UI-SPEC 검증 문구 · ↑↓ 스텝은 순수 모듈 `numpad.ts` 로 묶었다. 폭 스파이크 실측 결과, 백스톱 레벨은 폰 L2 · 700 L2 · 992 L0 이다. 830 에서는 감시대상 행이 사다리로 해소되지 않는다.**

## Performance

- **Duration:** 약 11분
- **Started:** 2026-09-25T03:53:20Z
- **Completed:** 2026-09-25T04:04Z
- **Tasks:** 3 (TDD 2 + 스파이크 1)
- **Files modified:** 8 (생성 4 · 수정 4)

## Accomplishments

- `krxTickSize`(7구간) · `tickUp` · `tickDown`(= v − tick(v−1), 경계에서 정확) · `priceInputIssue` 를 구현했다. `priceInputIssue` 는 상한 초과를 먼저 보고하고, 그다음 단위 불일치와 가까운 두 값을 돌려준다. 값은 보정하지 않는다.
- `limitUp.ts` 의 7단 if 사슬과 `order-panel.tsx` 의 `TICK_TABLE`·`tickFromTable` 을 지웠다. 이제 저장소에 호가 단위 표는 한 벌뿐이다. `limitUp.test` 는 그대로 통과한다. 흡수 전 옛 표 동작은 특성 테스트 ⑳~㉒ 로 먼저 고정했고, 흡수 뒤에도 통과한다.
- `numpad.ts` 를 만들었다. fresh 첫 입력, 00/0 규칙, 9자리 상한, D-17 칩 구성과 접근성 이름, 칩 비활성(시세 미수신·조각 한도), 9자리를 넘는 칩 무시, 검증 문구 원문, `canConfirmPad`, `stepValue` 를 담는다.
- 폭 스파이크로 4밴드 × L0~L3 행 넘침과 시트·수동주문 버튼을 Pretendard 실제 서체로 실측했다. 스크립트는 저장소 밖에서 돌리고 지웠다.

## Task Commits

1. **Task 1 RED:** `5c1709e` — test(20-02): KRX 호가 단위 헬퍼 실패 테스트 + deriveTickSize 표 폴백 행동 보존 가드
2. **Task 1 GREEN:** `35d95a1` — feat(20-02): KRX 호가 단위 헬퍼 한 곳(krxTick.ts) + limitUp·order-panel 표 흡수
3. **Task 2 RED:** `50e8af9` — test(20-02): 키패드 버퍼·칩·검증 문구·스텝 실패 테스트 추가
4. **Task 2 GREEN:** `e088e40` — feat(20-02): 키패드 순수 모듈 numpad.ts — 버퍼 리듀서·단위별 칩·검증 문구·↑↓ 스텝
5. **Task 3 (스파이크):** 커밋 없음. 저장소 파일을 바꾸지 않았고, 결과는 아래 「폭 스파이크」 절에 있다.

REFACTOR 커밋은 없다(정리할 것이 없었다).

## TDD Gate Compliance

| 태스크 | RED 커밋 | RED 증거(`gsd-tools check tdd-red-evidence`) | GREEN 커밋 |
|---|---|---|---|
| Task 1 | `5c1709e` | `RED_EVIDENCE_OK`. 대상 「krxTickSize > 경계 2,000 — 직하 1원 · 직상 5원」, 25건 중 21건 실패(스텁이 0 을 돌려 `expected 0 to be 1`). limitUp 2건은 통과 | `35d95a1` |
| Task 2 | `50e8af9` | `RED_EVIDENCE_OK`. 대상 「padKey — fresh 첫 입력 > 첫 숫자 키는 값을 통째로 바꾼다」, 58건 중 42건 실패 | `e088e40` |

RED 증거는 vitest `tap-flat` 출력에 `# tests/# pass/# fail` 요약 줄을 붙여 검사기에 넣었다(20-01 과 같은 방식).

## 폭 스파이크

**방법:** 저장소 밖 `${TMPDIR}/gh-radar-p20-spike/lc-width-spike.mjs` 에서 webapp 의 `@playwright/test` chromium 을 `createRequire` 로 빌렸다. 서체는 `PretendardVariable.woff2` 를 data URL 로 싣고 `document.fonts.check` 로 적재를 확인했다. 앱 기준선도 그대로 옮겼다: `html[lang=ko]` letter-spacing −0.01em · keep-all, body tabular-nums, 버튼 letter-spacing inherit(preflight).

기하는 카드 본문 그리드를 따랐다. 좌 열은 폰 42% · 700 → 260 · 830 → 400 · 992 → 460(left border 1 포함)이다. 우 패널 패딩은 폰 8 · ≥700 10, 목록 열은 폰 1열 · ≥700 2열(간격 8 · ≥992 16), 그룹 면 패딩은 `10 10 4` 이다. 행은 flex space-between · gap 6 · 좌우 4 · 44px 이고, 라벨은 14/400 nowrap, 값은 15/500 tnum nowrap + ` ›` 이다.

**판정:**
- **넘침 px** = max(행 `scrollWidth − clientWidth`, 잎 요소 우측 끝 − 행 우측 끝, 자손 `scrollWidth − clientWidth`). e2e `overflow.ts` 와 같은 관점이다.
- **여유 px** = 행 내용 폭 − (자식 폭 합 + 간격). 음수면 넘친 것이다.
- **채택 기준**은 엄격 기준(모든 행 여유 ≥ 0)이다. 참고로 e2e 1px 반올림 기준 결과도 적었다.

**행 내용 폭(px):** 344 → 156 (L1+ 164) · 700 → 178 (186) · 830 → 173 (181) · 992 → 220 (228). RESEARCH 추정 155/173 과 맞는다.

### 밴드 × 레벨 — 최대 넘침 px / 최소 여유 px

| 본문 | L0 기본 | L1 행 좌우 0 | L2 +간격 4 | L3 +쉐브런 숨김 | 넘치는 행 | 채택(엄격) | 참고(e2e >1px) |
|---|---|---|---|---|---|---|---|
| 344 | **6** / −9.1 | **2** / −1.1 | 0 / +0.9 | 0 / +0.9 | 파생 「잔량추적 기준선 \| 100,000주」 하나뿐 | **L2** | L2 |
| 700 | **4** / −8.4 | 0 / −0.4 | 0 / +1.6 | (0 / +1.6 · ≥700 불허) | 감시대상(≥700 라벨 + 인라인 토글) 하나뿐 | **L2** | L1 |
| 830 | **9** / −13.4 | **5** / −5.4 | **3** / −3.4 | (3 / −3.4 · ≥700 불허) | 감시대상(≥700) 하나뿐 | **없음 ⚠** | 없음 |
| 992 | 0 / +33.6 | 0 / +41.6 | 0 / +43.6 | 0 / +43.6 | — | **L0** | L0 |

우 패널 자체의 `scrollWidth − clientWidth` 는 모든 밴드·레벨에서 0 이었다(`min-w-0` 사슬 덕에 넘침은 행 안에 머문다).

### 행별 여유 px(L0) — 좁은 행 위주

| 행 | 344 | 700 | 830 | 992 |
|---|---|---|---|---|
| 파생 잔량추적 기준선 \| 100,000주 (쉐브런 없음) | **−9.1** (L2 +0.9) | +12.9 | +7.9 | +54.9 |
| 매수가격/비교가격/한방가격/매도가격 1,274,000원 › | +8.5 | +30.5 | +25.5 | +72.5 |
| 감시대상 (폰 = 풀폭 토글 14/600 · ≥700 = 라벨 + 13/600 토글) | +12.2 (버튼 안 글자 여유) | **−8.4** | **−13.4** | +33.6 |
| 체크 체결 \| 100,000주 › | +17.4 | +39.4 | +34.4 | +81.4 |
| 호가잔량·취소잔량 100,000주 › | +21.5 | +43.5 | +38.5 | +85.5 |
| 체크 잔량추적 \| 100% › | +24.6 | +46.6 | +41.6 | +88.6 |
| 주문금액 9,999만원 › | +27.2 | +49.2 | +44.2 | +91.2 |

### 830 감시대상 행 대안 실측(글자 크기 불변 · 사다리 밖)

| 대안 | 700 L0 / L1 / L2 | 830 L0 / L1 / L2 |
|---|---|---|
| A 현재 스펙(토글 좌우 10) | −8.4 / −0.4 / +1.6 | −13.4 / −5.4 / −3.4 |
| B ≥700 토글 좌우 10→8 | −0.4 / +7.6 / +9.6 | −5.4 / +2.6 / **+4.6** |
| C ≥700 토글 좌우 10→6 | +7.6 / +15.6 / +17.6 | +2.6 / +10.6 / +12.6 |
| D ≥700 도 라벨 숨김 + 풀폭 토글(13px 유지) | +22.7 / +26.7 / +26.7 | +20.7 / +24.7 / +24.7 |

### 그룹 헤더(제목 15/600 + 상태 12px 「발주 완료 · 무장 해제」 + 스위치 40)

넘침 0. 텍스트 줄 수는 344·700·830 에서 2줄(상태가 둘째 줄로 내려가고 말줄임 없음), 992 에서 1줄이다. UI-SPEC E1 long-text 기대와 맞는다.

### 시트(뷰포트 390 → 시트 370 · 안폭 330 · 디스플레이 안폭 298)

| 항목 | tnum | 비례 숫자 |
|---|---|---|
| 「999,999,999」 26/700 + 캐럿 폭 | 170.1 | 165.5 |
| 「지금 1,274,000원」 12.5px | 93.6 · 1줄 | 93.6 · 1줄 |
| 디스플레이 상자 넘침 | 0 | 0 |
| 상태 줄 「100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200」 12.5px | **1줄** · 넘침 0 | 1줄 · 넘침 0 |

→ E3 long-text(2줄 이하 · 잘림 0 · 9자리 26px 상자 안)를 충족한다.

### 수동주문 버튼(실제 `OrderButton` 기하: h48 · border 1 · px 1 · overflow hidden · leading 1.15 · whitespace normal · 600)

| 경우 | 버튼 폭 | 줄 수 | 글자 폭 | 잘림 X/Y |
|---|---|---|---|---|
| ⒝ 344 · 13px · 「예약」 윗줄 분리(SideLabel) | 87.8 | 2 | 22.2 | 0 / 0 |
| ⒝ 344 · 13px · 분리 없음 | 87.8 | 1 | 44.3 | 0 / 0 |
| ⒝ 344 · 17px · 분리 | 87.8 | 2 | 29.1 | 0 / 0 |
| ⒝ 344 · 17px · 분리 없음 | 87.8 | 1 | 58.1 | 0 / 0 |
| ⒞ 700 · 17px · 한 줄 | 206 | **1** | 58.1 | 0 / 0 |

→ 20-06 은 `@min-[700px]/lc:text-[17px]` 를 적용할 수 있다(⒞ 한 줄 확인). 폰 밴드는 D-11 에 따라 13px 를 유지한다.

### 20-04 백스톱 결정

- **폰(344) = L2**: 행 좌우 패딩 0, 라벨–값 간격 4. 원인은 파생 「잔량추적 기준선」 한 행뿐이다. 이 행에는 쉐브런이 없어서 L3 는 효과가 없고, 따라서 필요도 없다. 「폰 밴드가 L3 로도 넘친다」는 ⚠ 조건에는 **해당하지 않는다**. 다만 여유가 +0.9px 로 얇으므로, 20-07 P20-3 이 실제 앱에서 이 행을 반드시 단언해야 한다.
- **700 = L2**: 값 행은 전부 L0 에서 들어간다(최소 +12.9). 감시대상 행만 L1 −0.4 → L2 +1.6 이다.
- **830 = ⚠ 사다리로 해소 불가**: 값 행은 L0 에서 전부 들어간다(최소 +7.9). 감시대상(≥700 라벨 + 인라인 토글)만 L2 에서도 −3.4px 넘친다. UI-SPEC 의 토글 좌우 10 또는 ≥700 감시대상 모양(D-02)을 바꿔야 하므로 **20-04 실행 전 사용자 결정이 필요하다.** 권고는 **B(≥700 토글 좌우 10→8) + L2** 다. 830 은 +4.6, 700 은 +9.6 이 되고 글자 크기와 모양은 그대로다. C(10→6)는 L0 만으로 들어가고, D(라벨 숨김 풀폭)는 여유가 가장 크지만 D-02 모양이 바뀐다.
- **992 = L0**: 아무것도 바꾸지 않는다.
- 적용 방식 참고: 폰과 ≥700 이 둘 다 L2 면 행 패딩·간격은 밴드 분기 없이 한 벌로 줄일 수 있다(992 는 L2 에서도 +43.6 이라 무해하다). 20-04 계획의 「폰 전용 컨테이너 쿼리 쌍」보다 단순하다.

## Decisions Made

- 9자리 상한에서 한 번에 두 자리가 넘치는 「00」(8자리 + 00)은 한 자리만 받지 않고 키 전체를 무시한다. 목업은 잘라서 9자리를 만들었지만, 플랜 문구 「9자리 초과 무시」와 T-20-06(초과 입력 거부)에 맞췄다.
- `padChipDisabled` 는 `set` 칩에 `ctx.maxPieces` 한도를 적용한다. 계약상 `maxPieces` 는 단위 '회'에서만 넘기며, 이를 PadCtx JSDoc 에 명시했다.
- 비활성 칩을 누르면 상태를 그대로 돌려준다(fresh 도 유지). 9자리를 넘기는 칩은 버퍼는 그대로 두고 fresh 만 푼다(칩을 누른 사실은 반영).
- `stepValue(999,999,999, '원', +1)` 은 tickUp 결과를 999,999,999 로 자른다. 호가 단위에 맞지 않는 값이 되지만, 검증 문구가 확인을 잠근다(보정 없음 원칙 유지).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 행동 보존 증명] deriveTickSize 폴백 특성 테스트 추가**
- **Found during:** Task 1 착수 전
- **Issue:** `deriveTickSize` 에는 테스트도 없고 저장소 안 소비처도 없다. 그래서 `order-panel.test.tsx` 가 초록이어도 옛 `TICK_TABLE` 흡수의 행동 보존을 증명하지 못한다(프로젝트 규칙: 흡수 표의 행동 보존을 테스트로 증명).
- **Fix:** 흡수 **전**에 옛 코드에서 통과하는 ⑳ 관측값 우선 · ㉑ 7구간 경계 직하/직상 폴백(호가 없음·전부 0) · ㉒ 0 이하·NaN → 1 을 `order-panel.test.tsx` 에 더했다. 흡수 뒤에도 그대로 통과한다.
- **Files modified:** `webapp/src/components/orderbook/__tests__/order-panel.test.tsx` (플랜 files 목록 밖 · 테스트만)
- **Commit:** `5c1709e`

**2. [Rule 1 - Bug] krxTick 테스트 기대값 오기**
- **Found during:** Task 1 GREEN
- **Issue:** 「상한 0 이면 단위만 본다」 케이스의 999,900 은 1,000원 단위가 아니어서 null 이 될 수 없다(테스트가 틀렸다).
- **Fix:** 999,000 으로 바꿨다(1,000원 단위라 null). 구현은 바꾸지 않았다.
- **Files modified:** `packages/shared/src/krxTick.test.ts`
- **Commit:** `35d95a1`

**3. [Rule 3 - Blocking] RED 스텁 모양**
- **Found during:** Task 1 RED
- **Issue:** 새 모듈이라 import 대상이 없으면 로드 실패(fixture_or_load_failure)가 되고, `throw` 스텁은 단언 실패가 아니다.
- **Fix:** 시그니처만 있고 중립값(0 / v / null)을 돌려주는 스텁을 RED 커밋에 함께 넣었다. 그래서 대상 테스트가 단언으로 실패한다. GREEN 에서 전부 교체했다(Task 2 도 같음).
- **Files modified:** `packages/shared/src/krxTick.ts`, `webapp/src/lib/numpad.ts`
- **Commit:** `5c1709e`, `50e8af9`

**4. [실행 환경] 플랜 커밋 원장 위치**
- worktree 격리 정책이 `.git/worktrees/…` 경로 쓰기를 거부했다. 그래서 `plan_head_before`(178ad53)는 세션 스크래치패드에 기록했고, `commits: 4` 는 `git rev-list --count 178ad53..HEAD` 로 측정했다.

---

**Total deviations:** 3 auto-fixed (Rule 1 ×1 · Rule 2 ×1 · Rule 3 ×1) + 실행 환경 1. **Impact:** 전부 증명을 강화하거나 테스트 오기를 고친 것이다. 범위 확장은 없다.

## Issues Encountered

- 스파이크 첫 실행에서 줄 수 측정이 부풀었다. `Range.getClientRects` 가 block span 상자를 포함했고, 크기가 다른 글자(15px 제목 + 12px 상태)가 같은 줄에서도 top 이 달랐기 때문이다. 텍스트 노드 단위로 세로로 겹치는 사각형끼리 묶는 방식으로 고쳐 다시 쟀다. 표의 값은 고친 뒤의 것이다.

## Verification (실측 출력)

- `pnpm --filter @gh-radar/shared exec vitest --run src/krxTick.test.ts src/limitUp.test.ts` → `Test Files 2 passed (2) · Tests 25 passed (25)`
- shared 전체 → `Tests 131 passed (131)`
- `pnpm --filter @gh-radar/shared build` → `DTS ⚡️ Build success`
- `pnpm --filter @gh-radar/relay run typecheck` · `typecheck:tests` → 오류 0
- `pnpm --filter @gh-radar/webapp run typecheck` → `tsc --noEmit && tsc -p tsconfig.e2e.json` 오류 0
- intraday-sync(`limitUpPrice` 소비처) typecheck → 오류 0
- `pnpm --filter @gh-radar/relay run test` → `Test Files 22 passed (22) · Tests 632 passed (632)`
- `pnpm --filter @gh-radar/webapp run test` → `Test Files 102 passed (102) · Tests 1842 passed | 1 skipped (1843)` (skip 1 은 기존 것)
- 수용 grep: `krxTickSize(tgt)` 1 · limitUp 구간 비교식 0 · order-panel `TICK_TABLE|tickFromTable` 0 · order-panel `krxTickSize` 4 · index `krxTick` 2 · krxTick.test `it(` 23 · numpad `from '@gh-radar/shared'` 1 · numpad 구간 비교식 0 · `'1호가 내리기'` 1 · `'전부 지우기'` 1
- 스파이크 verify ① JSON 4밴드 + sheet + manualButtons 종료 코드 0 · ② 스파이크 디렉터리 삭제 후 `git status --porcelain` 에 spike 흔적 없음

## Known Stubs

없음. RED 스텁은 GREEN 커밋에서 전부 실제 구현으로 바꿨다.

## Next Phase Readiness

- 20-03(시트) · 20-05(인라인 ↑↓·검증) · 20-06(수동주문)은 `numpad.ts` 와 `@gh-radar/shared` 의 `krxTick` 을 import 해서 바로 쓸 수 있다. webapp 은 shared **dist** 를 읽으므로 shared 를 바꾸면 `pnpm --filter @gh-radar/shared build` 를 먼저 돌려야 한다.
- **블로커(20-04 전):** 830 밴드 감시대상 행의 폭 해법(B/C/D 중 선택, 권고 B + L2)을 사용자가 결정해야 한다.

## Self-Check: PASSED

- FOUND: packages/shared/src/krxTick.ts · packages/shared/src/krxTick.test.ts · webapp/src/lib/numpad.ts · webapp/src/lib/__tests__/numpad.test.ts
- FOUND commits: 5c1709e · 35d95a1 · 50e8af9 · e088e40 (`git log 178ad53..HEAD`)
- 스파이크 흔적: 저장소 0 · 임시 디렉터리 삭제 확인
