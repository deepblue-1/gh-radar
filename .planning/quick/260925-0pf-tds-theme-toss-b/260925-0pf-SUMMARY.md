---
phase: quick-260925-0pf
plan: 01
subsystem: webapp/theme
status: complete
tags: [theme, toss-b, tds, design-tokens, hairline, typography]
requires: [quick-260924-vj1]
provides:
  - "@toss/tds-colors@0.1.0 공식값 기반 globals.css 토큰(:root·.dark 대칭)"
  - "TDS 토큰 고정 + 차트↔CSS up/down 교차 + 행 구분선 hairline 가드 테스트"
affects: [webapp 전 표면(색) · 종목상세(탭·스탯·히어로·폰 CTA) · 수동주문 버튼 높이]
tech-stack:
  added: []
  patterns: ["소스 읽기 가드 테스트(방향 테두리 + var(--border) 금지)"]
key-files:
  created:
    - webapp/src/styles/__tests__/tds-tokens.test.ts
  modified:
    - webapp/src/styles/globals.css
    - webapp/src/lib/chart-colors.ts
    - webapp/src/lib/__tests__/chart-colors.test.ts
    - webapp/src/components/stock/stock-detail-tabs.tsx
    - webapp/src/components/stock/stock-stats-grid.tsx
    - webapp/src/components/stock/stock-hero.tsx
    - webapp/src/components/trading/card/manual-order-form.tsx
    - (행 구분선 스윕 28파일 — 아래 목록)
decisions:
  - "다크 선택 면(seg-on/pill-on) = grey300 #4d4d59 — 트랙 대비 1.66:1(옛 비공식 1.47 · grey200 1.27)"
  - "--faint = 비활성 grey400(소비처가 전부 테두리/채움)"
  - "--flat 은 --muted-fg 와 짝 유지 → 라이트 grey600"
  - "차트 축 글자 grey500 · grid grey100(두 테마 대칭)"
  - "hairline = 기존 --border-subtle 재사용(새 토큰 0), --border 는 무테 유지용 값 그대로"
  - "스탯 값 16/500(st10) 유지 · 종목명 18→17(t5) 스냅"
  - "수동주문 주문 버튼 48(TDS large) — 글자 13 유지(lc 가로 증가 0)"
  - "BottomCTA 하단 20/safe-area 를 max(20px, safe-area) 로 해석"
metrics:
  duration: "~25min"
  completed: 2026-09-25
estimate:
  tokens: 95000
  tasks: 3
actuals:
  tokens: 14900
  tasks: 3
  commits: 0
plan_head_before: f8280a4
---

# Phase quick-260925-0pf Plan 01: 토스 B 테마 공식 TDS 값 정렬 Summary

토스 B 테마 토큰을 `@toss/tds-colors@0.1.0` 공식 앱 팔레트로 교정(다크 띠 #101013 · 다크 red #f04251 · 다크 선택 면 grey300 · 라이트 보조 grey600 · hairlineBorder), 방향 행 구분선 45줄 + 특수 3곳을 `--border-subtle` hairline 으로 옮기고, 종목상세 탭 17 · 스탯 라벨 15 · 종목명 17 · 폰 CTA 56/r16/17(BottomCTA) · 수동주문 버튼 48 로 TDS 크기에 맞췄다. 가드 테스트 1개 신규.

**커밋 0 · push 0** (지시대로 미커밋 — `git log -1` = f8280a4). `commits: 0` 은 의도된 상태다.

## 제안 커밋 메시지 (HEAD 대비 working tree 전체 1커밋 · Co-Authored-By 없음)

```
feat(webapp): 토스 B 테마를 공식 TDS 값으로 정렬 — 팔레트·텍스트 역할·hairline 구분선·타입 스케일·CTA/주문 버튼 크기
```

(주의: 미추적 `webapp/e2e/specs/zz-theme-gallery.spec.ts` 는 오케스트레이터 임시 파일 — 커밋 대상에서 제외. `.planning/quick/260925-0pf-tds-theme-toss-b/` 는 포함 여부를 사용자가 결정.)

## 태스크 · verify 결과

| Task | 이름 | verify | 비고 |
|---|---|---|---|
| 1 | TDS 토큰 값 + 차트 팔레트 + 토큰 고정 테스트 | PASS | RED 15 실패 확인 → GREEN 56/56 |
| 2 | 행 구분선 hairline 가드 + 45줄 스윕 + 특수 3곳 | PASS | RED 정확히 45줄(계획 목록과 1:1 일치) → GREEN 0줄 · card-body 67/67 |
| 3 | 타입 스케일 · 버튼 크기 + 전체 게이트 | PASS | typecheck 0 · vitest 전체 통과 · build 성공 · 컴파일 CSS 두 식 존재 · §2.2b sha256 일치 |

### 게이트 결과
- `typecheck` (tsc --noEmit + e2e tsconfig): exit 0.
- `test` (전체 vitest): **Test Files 99 passed · Tests 1731 passed | 1 skipped (1732)**. 기준선 1681 대비 **+50** (tds-tokens.test.ts 49 = 라이트 22 + 다크 20 + rgba 틴트 2 + 토큰 집합 2 + 차트 교차 2 + 가드 1, chart-colors.test.ts +1 = 공식값 고정 테스트). skipped 1 은 기존.
- `build` (next build): exit 0. 컴파일 CSS 에 `padding-bottom:max(20px,env(safe-area-inset-bottom))` · `padding-bottom:calc(76px + max(20px,env(safe-area-inset-bottom)))` 생성 확인.
- 불변식: `[--lw:76px]` · `@min-[992px]/lc:[--lw:104px]` · `createPortal` · card-body 260/400/460 열 3개 그대로, §2.2b 블록 sha256 `c7eb5ddd…ea254f` 일치(작업 전·후).

### 4면 외곽선 전후 개수 (T-0pf-04)
`var(--border)` 를 쓰는 4면 `border` 줄(components·app, `__tests__`·`app/design` 제외): **스윕 전 54 → 스윕 후 54** (동일). 스윕 diff 는 `word-diff` 로 확인 — 바뀐 토큰은 전부 `…border-[var(--border)]` → `…border-[var(--border-subtle)]` 색 토큰뿐(변형 접두·방향 토큰·다른 클래스 불변).

## 변경 요약

**Task 1 — 토큰(0PF-A · U-01)**
- `:root`: `--muted-fg`·`--flat` #8b95a1 → #6b7684(grey600), `--border-subtle` #f2f4f6 → #e5e8eb(hairlineBorder).
- `.dark`: `--band` #0f0f12 → #101013, `--faint` #6b6b73 → #62626d, `--raised-2` #454552 → #3c3c47, `--border-subtle` 흰 4% → #3c3c47, `--destructive`·`--up` #f04452 → #f04251, `--up-bg`·`--bid-bar` 틴트 rgb(240,68,82) → rgb(240,66,81), `--seg-on-bg`·`--pill-on-bg` #454552 → #4d4d59.
- 키 추가·삭제 0, `--border` 값 불변. §9 머리 주석(출처·텍스트 역할·명도 단계·`--border-subtle`/`--border` 역할) · `.dark` 세그먼트 주석 재작성.
- `chart-colors.ts` dark: up #f04251 · text #7e7e87 · grid #2c2c35 (light 불변), 머리 주석 교체. `detail-bands.tsx` 주석만 #101013.

**Task 2 — hairline(0PF-B)**: 가드 보고 45줄의 색 토큰만 치환 + Separator 배경 · 수동주문 잠김 입력 테두리 · 상한가 KPI gap-px 격자 배경. `card-body.test.tsx` 좌 pane 색 단언을 `--border-subtle` 로 이동(`border-r`·형제 단언 유지).

**Task 3 — 크기(0PF-C · 0PF-D)**
- 종목상세 탭 트리거 16 → 17px(600 · 높이 50 · px-3 불변).
- 폰 CTA 버튼 54 → 56px · 16.5 → 17px · radius 16 유지. 바 `px-4` → `px-5`, 하단 `calc(12px+safe)` → `max(20px, safe)`.
- Tabs 루트 예약 `84px` → `calc(76px + max(20px, safe))`, 챗 FAB `calc(80px + safe)` → `calc(70px + max(20px, safe))`.
- 스탯 라벨 13.5 → 15px(2곳, 보조색 유지), 값 16/500 유지.
- 히어로 종목명 18 → 17px.
- 수동주문 주문 버튼 52 → 48px(radius 14 이미 일치), 근처 주석 갱신.
- `stock-detail-tabs.test.tsx` Test 7 에 CTA `h-[56px]`·`rounded-[16px]` · 탭 `text-[17px]` 단언 추가.

## 재량 결정 (계획 지시 기록)
1. **다크 선택 면 grey300 #4d4d59** — 트랙 `--muted` grey100 #2c2c35 대비 명도비 grey200 1.27 : 1 · 옛 비공식 #454552 1.47 : 1 · grey300 1.66 : 1. 세그먼트 선택 오판 = 오발주이므로 옛 값보다 약해질 수 없음 → grey300. hover(`--raised-2` grey200)와 선택(grey300)이 다시 구분된다.
2. **`--faint` = 비활성 grey400** — 소비처 19곳이 전부 `border-`/`bg-[var(--faint)]`(점선 플레이스홀더 · OFF LED 윤곽 · 범위 밴드), 글자색 0. RESEARCH 의 「3차 grey500」 후보 대신 「비활성 grey400」 채택, 라이트 #b0b8c1(grey400)과 대칭.
3. **`--flat` 짝** — vj1 에서 `--muted-fg` 와 같은 값으로 짝지은 토큰이라 라이트도 함께 grey600 으로 이동(다크는 이미 둘 다 grey600).
4. **차트 축 grey500 · grid grey100** — 라이트(#8b95a1/#f2f4f6)는 이미 그 단계, 다크를 같은 역할로 맞춤(#7e7e87/#2c2c35). up/down 은 CSS 토큰과 교차 단언.
5. **hairline = 기존 `--border-subtle` 재사용(새 토큰 0)** — 소비처 27곳이 이미 전부 방향 구분선이었다. **`--border` 는 유지** — 4면 외곽선 54줄이 기대는 값이라 hairline 으로 올리면 모든 면에 테두리가 생긴다(무테 붕괴).
6. **스탯 값 16/500(st10) 유지** — t5 17 도 허용이지만 3열 격자 값 줄 가로 증가 회피.
7. **종목명 17(t5) 스냅** — 스케일 밖 18 을 줄어드는 방향으로.
8. **주문 버튼 48 · 글자 13 유지** — TDS large 높이만 적용.
9. **BottomCTA 하단 = `max(20px, env(safe-area-inset-bottom))`** — 「하단 20/safe-area」 해석. 부수 효과로 Tabs 예약 여백이 노치 폰 safe-area 를 포함하도록 교정(기존 고정 84 는 노치 폰에서 safe-area 만큼 가려질 수 있었음).

## `lc` 안에서 적용하지 않은 TDS 수치 (lc 가로 증가 0 규칙)
- 수동주문 주문 버튼 글자: TDS large = t5 **17px** → 현행 **13px** 유지(`px-px` · `leading-[1.15]` · `whitespace-normal` · `@min-[700px]/lc:` 변형 불변). 높이만 52 → 48.
- 그 밖의 `lc` 안(호가 사다리 · 종목정보 10칸 · 매수/매도 폼 · 카드 헤더)은 이번 플랜에서 색(구분선 hairline)만 바뀌었고 글자·굵기·자간·가로 패딩·gap·열 폭·`--lw` 는 손대지 않았다.

## 오케스트레이터 스크린샷 점검 목록
- 다크/라이트 × 종목상세 4탭: 폰 360·390 에서 탭 바 한 줄(17px 4라벨), CTA 56 표시, 챗 FAB 이 CTA 위(겹침 없음), 마지막 콘텐츠가 CTA 에 안 가려짐.
- 작업대 3단 호가표 컨테이너 400: 가격 잘림 0, 새 hairline 행 구분선이 보이는지.
- 본문 700 폼: 주문금액·라벨 잘림 0.
- 폰 수동주문 48px 버튼: 「예약매수」 등 2줄 접힘이 잘리지 않는지.
- 다크 세그먼트/알약 선택 면(grey300)이 트랙·hover 와 식별되는지.
- 면에 테두리가 새로 생기지 않았는지: 홈 · 챗 · 테마 · 뉴스 · 토론.
- 다크 종목상세 띠(#101013) · 라이트 보조 텍스트(grey600) 대비 확인.

## 변경 파일 목록 (39)
신규 1: `webapp/src/styles/__tests__/tds-tokens.test.ts`

수정 38:
- 토큰·차트: `webapp/src/styles/globals.css` · `webapp/src/lib/chart-colors.ts` · `webapp/src/lib/__tests__/chart-colors.test.ts` · `webapp/src/components/stock/detail-bands.tsx`
- hairline 스윕: `app/chat/page.tsx` · `components/ui/{card,sheet,table,separator}.tsx` · `components/chat/{citation,composer,conversation-list}.tsx` · `components/layout/app-sidebar.tsx` · `components/orderbook/{orderbook-ladder,trade-tape}.tsx` · `components/stock/{stock-detail-tabs,stock-discussion-section,discussion-page-client,stock-news-section,stock-limit-up-section}.tsx` · `components/scanner/{scanner-table,scanner-skeleton}.tsx` · `components/trading/{limit-chaser-form,vi-order-list,strategy-status-card}.tsx` · `components/trading/card/{stock-info-modal,card-body,manual-order-form}.tsx` · `components/trading/workbench/{vi-trigger-strip,shared-panels,breakout-strip,vi-settings-rows}.tsx` · `components/watchlist/{watchlist-skeleton,watchlist-table}.tsx`
- 크기: `components/stock/{stock-detail-tabs,stock-stats-grid,stock-hero}.tsx` · `components/trading/card/manual-order-form.tsx`
- 테스트: `components/trading/__tests__/card-body.test.tsx` · `components/stock/__tests__/stock-detail-tabs.test.tsx`

## Deviations from Plan
None — plan executed exactly as written. (가드 RED 목록이 계획 45줄과 정확히 일치, 4면 외곽선 54줄 전후 동일.)

## Known Stubs
None.

## Self-Check: PASSED
- FOUND: webapp/src/styles/__tests__/tds-tokens.test.ts
- FOUND: 수정 38파일(git status 확인)
- 커밋 없음(의도) — HEAD f8280a4 그대로
