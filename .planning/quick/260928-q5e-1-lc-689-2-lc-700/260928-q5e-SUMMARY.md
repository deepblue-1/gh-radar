---
phase: quick-260928-q5e
plan: 01
subsystem: webapp/trading (상따 카드 반응형 §2.2b)
tags: [responsive, container-query, galaxy-fold, e2e, layout]
status: complete
requires: [quick-260923-hfk]
provides: ["lc 첫 경계 685 (LC_COMPACT_MIN_PX)", "e2e FOLD_VIEWPORT · test 4c"]
affects: [webapp/src/styles/globals.css §2.2b, CLAUDE.md Conventions]
tech-stack:
  added: []
  patterns: ["경계 값은 계산하지 않고 임시 경계 + 카드 폭 사다리로 실측"]
key-files:
  created: []
  modified:
    - webapp/src/styles/globals.css
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/e2e/specs/a11y.spec.ts
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/card/manual-order-form.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/card/quote-grid-10.tsx
    - webapp/src/components/orderbook/orderbook-ladder.tsx
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx
    - CLAUDE.md
decisions:
  - "lc 첫 경계(폰|컴팩트) 700 → 685 — 사다리 실측 F=680(P20-3 · P24-7 최악값 행 −1.3px) 바로 위. 폴드 lc 689 여유 4px"
  - "wb 700(공용 패널 sticky · 돌파/VI 표 열 접기 · VI 설정 2열) · 격자 680 은 무변경 — 폴드에서 카드는 컴팩트, 페이지 표면은 폰 밴드인 조합이 의도"
metrics:
  duration: "약 75분"
  completed: 2026-09-28
estimate:
  tokens: 170000
actuals:
  tokens: 18707
  tasks: 2
  commits: 1
plan_head_before: 9bcd02841a1a10f1f3197d4984fe702493e69b3a
---

# Quick 260928-q5e: 상따 카드 lc 첫 경계 700 → 685 (폴드 세로 1단 매수·매도 2열) Summary

갤럭시 폴드 안쪽 세로(707×823) 1단에서 카드 lc 689px 가 첫 경계 700 에 11px 모자라 폰 밴드(매수|매도|수동 3탭)에 갇히던 것을, 카드 폭 사다리 실측으로 정한 685 로 경계를 내려 컴팩트 밴드(좌 호가 260 · 우 매수/매도 2열)로 그리게 했다.

결정: X = 685

## RED 재현 (현행 700 · 소스 무변경)

- e2e 4c 신설 후 실행 → `폴드 1단 카드 689px — CSS 가 고른 밴드` Expected `"compact"` Received `"phone"`.
- 로그: `[q5e] 폴드 1단 카드 lc = 689px · band = phone`. 폴드 lc 실측값 = **689px** (플랜 예상과 일치).

## 사다리 실측 (임시 경계 `@min-[600px]/lc` 로 컴팩트 강제 · 소스 6개 작업 트리만 · 역치환 후 diff 0 확인)

| 카드 폭 | 4c (두 pane · 세 그룹 펼침 · 수동주문 덮기) | P20-3 (최악값 · 행 44 · 편집 44 · 헤더 높이) | P24-7 (패널 넘침 · 말줄임 0 · 접힘 요약) | 행 최소 여유 (P20-3 / P24-7) |
|---|---|---|---|---|
| 700 | 통과 | 통과 (헤더 26/26) | 통과 | +8.7 / +8.7 px |
| 695 | 통과 | 통과 (헤더 26/26) | 통과 | +6.2 / +6.2 |
| 690 | 통과 | 통과 (헤더 26/26) | 통과 | +3.7 / +3.7 |
| 689 | 통과 | 통과 (헤더 26/26) | 통과 | +3.2 / +3.2 |
| 688 | 통과 | 통과 (헤더 26/26) | 통과 | +2.7 / +2.7 |
| 685 | 통과 | 통과 (헤더 26/26) | 통과 | +1.2 / +1.2 |
| 680 | 통과 | **실패** | **실패** | −1.3 |

- 첫 실패 F = 680. 잘린 요소: P20-3 `lc-extra-buy-min-qty` 「최소 잔량177,000,000주 ›」 · `lc-extra-buy-max-qty` 「최대 잔량177,000,000주 ›」 slack −1.3px(행 안쪽 끝을 넘은 잎) / P24-7 `lc-extra-buy-max-qty` 「최대 잔량177,000,000주 ›」 slack −1.3px.
- 여유는 폭 1px 당 0.5px 로 선형 감소(두 열이 나눠 가짐). 4c(기본값)는 680 까지 전부 통과.
- 결정표: F = 680 → **X = 685**. 폴드 lc 689 − 685 = **여유 4px**.
- 측정 중 비-사다리 실패 1건: P20-3 가 344(폰 밴드) 첫 단언에서 카드 헤더 `<b>삼성전자</b>` 24px 넘침으로 멈춤. 현행 700 소스로도 동일하게 재현 → Phase 24 `deferred-items.md` 2번 기존 실패(측정 결과 아님). 사다리 측정은 344 를 임시로 빼고 돌렸다(24-04 선례와 같은 방식).

## Task 2 적용 내용

- 리터럴 `@min-[700px]/lc` → `@min-[685px]/lc` 50곳(소스 6 · 단위 6), 옛 리터럴 0곳.
- lc 뜻 「700」 산문(주석 · 테스트 제목) 전부 685 로(플랜 interfaces 목록). setting-group L66 은 새 실측(685 최악값 +1.2px) 인용, manual-order-form L1418 은 「20-02 폭 스파이크 — 버튼 ≈200px」로.
- `trading-workbench.tsx` `WB_PHONE_BAND_BELOW = 700` 값 그대로 · doc 만 「카드 lc 첫 경계 685 와 다른 값」.
- globals.css §2.2b: 표 두 행(`~684px` · `685~829px`, 박스 정렬 유지), `LC_COMPACT_MIN_PX = 685` 정본 줄, 첫 근거 항목 재작성(사다리 실측 · 옛 260912-k2x 기록 대체 · 폴드 여유 4px), 「본문 685 · 830 · 992」, hfk 문단 「첫 경계(685)」, 「컨테이너는 둘이다」 문단에 lc 685 / wb 700 유지 명시.
- CLAUDE.md L179 「본문 685 · 830 · 992」(표 복사 없음).
- e2e: `FOLD_VIEWPORT {707,823}` · `LC_COMPACT_MIN = 685` · `bandOfWidth` · test 4c · test 4 `684/685` · P24-7/P20-3 `[344, LC_COMPACT_MIN, 830, 992]` + 폰 분기 `bandOfWidth(target) === 'phone'` · P20-3 헤더 루프 `[LC_COMPACT_MIN, 830, 992]` · 제목 템플릿 리터럴. 임시 사다리 · 측정 로그 제거(`LC_LADDER` 0건).
- a11y.spec: doc · `target < 685` 두 곳.

## 게이트

| 게이트 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/webapp run typecheck` (앱 + e2e) | 통과 |
| vitest 전체 | 125 파일 중 124 통과 · 1 실패(strategy-card.test 의 정규식 `/@min-\[700px\]\/lc:/` — 아래 편차 1) → 수정 후 해당 파일 17/17 통과. 대상 8파일 재실행 529/529 통과. 전체 건수: 2812 통과 · 1 실패(수정됨) · 1 skip |
| Playwright trading-workbench (기존 실패 4건 `--grep-invert`) | **62 passed (6.3분)** — 신규 4c(폴드 lc 689 · compact), test 4(684/685 · 829/830 · 991/992), P24-7(344 · 685 · 830 · 992, 행 최소 여유 344 +0.4 · 685 +1.2 · 830 +3.7 · 992 +50.7), 폰 390 3탭 케이스 포함 |
| 제외한 4건 단독 실행 | 전부 기존 실패와 같은 메시지: 「5. 격자」 뷰포트 360 → 카드 342 헤더 `<b>삼성전자</b>` 26px(360 밴드 단언 'phone' 은 통과 후 잘림 단언에서 실패) · 「P20-3」 344 헤더 `<b>삼성전자</b>` 24px · 「iPhone 가로 폭 844」 16px 기대/14px · 「GC6」 검색 → /stocks/005930 이동 안 됨(현행 700 소스로도 동일 실패 확인) |
| a11y 「상따 매수 카드 axe」 · 「구서버 에코 카드 axe」 | 기본 30초 타임아웃에서는 첫 케이스가 axe 스캔 중 타임아웃(현행 700 소스로도 동일 재현 — 환경 성능). `--timeout=180000` 으로 **2건 통과** |

- P20-3 의 685 폭 판정은 영구 형태(344 가 첫 루프)에서는 344 기존 실패 때문에 도달하지 못한다. 685 에서의 P20-3 통과(행 +1.2 · 편집 44 · 헤더 26/26)는 Task 1 측정 실행(344 제외)으로 증명했다.
- 플랜 Task 2 verify 의 마지막 `-g "4\. 카드|4c\.|5\. 격자"` 는 「5. 격자」 기존 실패로 빨갛다(이 작업과 무관 · 360 헤더 이름). 4 · 4c 는 위 전체 실행에서 초록.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] strategy-card.test.tsx 의 이스케이프된 lc 700 정규식**
- **Found during:** Task 2 ⑧ vitest 전체
- **Issue:** `expect(grid.className).toMatch(/@min-\[700px\]\/lc:/)` — 이스케이프 형태라 플랜의 리터럴 grep(50곳)에 잡히지 않았다.
- **Fix:** `/@min-\[685px\]\/lc:/` 로 변경. 커밋 파일이 플랜 21개 + 이 1개 = 22개.
- **Commit:** 3da455e1

**2. [Rule 1 - 정본 문구] globals.css 정본 줄의 리터럴 인용이 51번째 리터럴이 됨**
- **Found during:** Task 2 verify(리터럴 50곳 대조)
- **Issue:** 플랜이 지시한 정본 문장 「코드 `@min-[685px]/lc`(Tailwind 스캔 — 리터럴)」이 webapp/src 안이라 리터럴 개수를 51 로 만들어 정본 일치 게이트와 모순.
- **Fix:** 「코드 `@min-[Npx]/lc` 리터럴(N = 이 값 · Tailwind 스캔)」으로 바꿔 50곳 유지. 푸시 전 내 커밋을 amend(주석 한 줄 · 테스트 영향 없음).
- **Commit:** 3da455e1

**3. [측정 방법] P20-3 344 기존 실패 우회**
- Task 1 측정 실행에서만 P20-3 배열에서 344 를 임시로 뺐다(그리고 685 헤더 높이를 재려고 680 을 뺀 실행 1회). 최종 코드에는 `[344, LC_COMPACT_MIN, 830, 992]` 로 복구.

**4. [게이트 실행 방법] trading-workbench 전체 실행**
- `mode: 'serial'` 이라 첫 실패 뒤가 전부 skip 되므로 기존 실패 4건을 `--grep-invert` 로 빼고 돌렸다(Phase 24 24-01 선례). GC6 은 Phase 24 deferred 목록에 없던 기존 실패라 현행 700 소스로 재현해 무관함을 확인했다.

## Deferred Issues (범위 밖 · 수정하지 않음)

- 카드 헤더 종목명 `<b>` 넘침(폰 344/342 카드) — test 5 · P20-3 을 막는 기존 실패. Phase 24 deferred-items 1·2번.
- 「iPhone 가로 폭 844 … 16px」 낡은 기대값 — Phase 24 deferred-items 3번.
- **GC6** (검색 옵션 클릭 후 /stocks/005930 로 이동하지 않음) — 현행 소스에서도 결정적으로 실패. Phase 24 deferred 목록에 없음 → 새로 기록 필요.
- a11y 「상따 매수 카드 axe 매트릭스」 기본 30초 타임아웃 — 현행 소스에서도 재현. 180초에서 통과(위반 0).

## 미배포

- push · 배포는 하지 않았다(오케스트레이터가 사용자 확인 후). push 가 곧 webapp 프로덕션 배포다.
- 폴드 실기기 확인(세로 1단에서 매수·매도 2열 · 3탭 없음)은 사용자 몫이다. e2e 는 같은 CSS 뷰포트 707×823 로 증명했다.

## Self-Check: PASSED

- 커밋 3da455e1 존재 · 22파일 · Co-Authored-By 없음 · server/relay/packages/shared/wb 표면 파일 없음 · SUMMARY 미포함.
- `LC_COMPACT_MIN_PX = 685` · 리터럴 685 50곳 / 700 0곳 · e2e `const LC_COMPACT_MIN = 685;` · `LC_LADDER` 0 · CLAUDE.md/globals.css 「본문 685 · 830 · 992」 · `WB_PHONE_BAND_BELOW = 700` 확인.
