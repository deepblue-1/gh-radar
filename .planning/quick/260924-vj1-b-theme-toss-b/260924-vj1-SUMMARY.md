---
phase: quick-260924-vj1
plan: 01
subsystem: webapp-theme
status: complete
tags: [theme, toss-b, tailwind, design-tokens, dark-mode, light-mode, experiment-branch]
requires: [sketch-001-toss-dark-theme]
provides:
  - "B 토큰(라이트 :root + .dark 동일 집합) — --surface --band --fg-2 --faint --raised-2 --seg-on-* --pill-on-* --ask-bar --bid-bar --side-bg"
  - "DetailBands — 종목상세 풀폭 섹션 + 12px 띠"
  - "폰 종목상세 「주문하기」 CTA (호가주문 탭 전환)"
affects: [webapp 전 화면 — 홈·스캐너·테마·관심종목·종목상세 4탭·트레이딩 작업대·마이·챗]
tech-stack:
  added: []
  patterns:
    - "레이어 밖 CSS 규칙(`[data-detail-band] > *`, `main:has(...)`)으로 섹션 컴포넌트 수정 없이 평면화"
    - "면 테두리는 지우지 않고 색만 투명 — 1px 기하 보존(§2.2b 밴드 전환 지점 불변)"
    - "2단 raised(`--raised-2`) — raised 박스 안 칩/버튼"
key-files:
  created:
    - webapp/src/components/stock/detail-bands.tsx
  modified:
    - webapp/src/styles/globals.css
    - webapp/src/lib/chart-colors.ts
    - webapp/src/components/ui/{card,button,badge,input,textarea,input-group,checkbox,toggle,tabs}.tsx
    - webapp/src/components/layout/{app-shell,app-header,app-sidebar,user-section}.tsx
    - webapp/src/components/stock/{stock-detail-client,stock-detail-tabs,stock-hero,stock-daily-chart-section,stock-stats-grid,stock-limit-up-section,stock-comovement-section,stock-news-section,stock-discussion-section,stock-orderbook-section}.tsx
    - webapp/src/components/orderbook/orderbook-ladder.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/card/{strategy-card,card-header,card-tabs,quote-grid-10,manual-order-form,stock-info-modal}.tsx
    - webapp/src/components/trading/workbench/{workbench-status-bar,vi-trigger-strip,breakout-strip,stock-add-bar,shared-panels,vi-settings-rows}.tsx
decisions:
  - "라이트 모드는 전 화면 회색 본문면(--surface #f2f4f6) + 흰 카드, 종목상세 비-호가 탭만 흰 바탕 + 회색 띠"
  - "데스크톱 2단·3단 사다리 행은 32px 절충(폰 1단만 B 44px) — orderbook-ladder.tsx 상단 LADDER_ROW_H/LADDER_BOX_TWO_H 두 상수로 44 전환 가능"
  - "lc 카드 안에서는 B 의 가로 증가분(굵은 숫자·큰 입력 글자·세그먼트 트랙 패딩·xs 세그먼트 패딩)을 적용하지 않음"
  - "상따 폼 방향 틴트(5%)·폰 bleed 그림자·clip-path 제거 — 방향은 그룹 제목 글자 + 체크박스 --lc-accent 가 말함"
  - "--accent 의미 유지(primary 틴트 — 챗 버블·AI 배지·계좌 행 선택). 알약 탭 선택만 --pill-on-* 로 이동"
metrics:
  duration: "~2h (시작 시각 미기록 — 근사)"
  completed: 2026-09-24
actuals:
  tokens: 53000
  tasks: 3
  commits: 0
plan_head_before: 46e8bea
---

# Phase quick-260924-vj1 Plan 01: 토스 B 테마(theme/toss-b) Summary

토스증권 스케치 001 채택안 B 를 webapp 전역에 다크·라이트 둘 다 적용: hex/rgba B 토큰 + Pretendard tnum 숫자 + 무테 명도 단계 면 + 20/16/12 radius, 종목상세는 풀폭 섹션 + 12px 띠 · 30px/700 히어로 · 16px 탭 · 폰 「주문하기」 CTA, 트레이딩은 44px 폰 사다리 · 토큰 잔량 막대 · 알약 세그먼트 — §2.2b 밴드/`lc` 가로 폭 불변식은 그대로 뒀다.

> **커밋 안 함(지시에 따름).** 사용자 전역 규칙(커밋 전 메시지 확인)에 따라 모든 변경은 worktree `theme/toss-b` 에 **미커밋 상태**로 남아 있다. `commits: 0` 은 그 결과이고, `plan_head_before` = HEAD `46e8bea`(변경 없음). 아래 「제안 커밋 메시지」 절이 태스크별로 썼을 메시지와 파일이다. push 없음.

## 검증 결과

| 게이트 | 결과 |
|---|---|
| T1 verify (shared build · typecheck · 대상 vitest 45파일 · grep 11개) | PASS — 622 passed / 1 skipped |
| T2 verify (typecheck · stock+chat vitest 15파일 · grep 10개) | PASS — 118 passed (+2 신규 CTA 테스트 포함) |
| T3 verify (typecheck · 전체 vitest · grep 13개) | typecheck/test PASS — **98 files · 1681 passed · 1 skipped** (기준선 1678 → +3 신규). grep 12/13 PASS, **`createPortal` in dirty-action-bar.tsx 1개 FAIL — 플랜 게이트 오류**(아래 참고) |
| `pnpm --filter @gh-radar/webapp run build` | PASS (env 없이도 빌드 성공). 컴파일된 CSS 에서 `main:has(...)`, `[data-detail-band]` 3규칙, `rounded-full!`(important), `--ask-bar` 유틸, CTA↔FAB `:has` 규칙 확인 |

**grep 게이트 FAIL 1건의 원인:** 플랜은 `grep -q 'createPortal' webapp/src/components/trading/dirty-action-bar.tsx` 를 요구하지만 HEAD(`46e8bea`)에서도 그 파일엔 `createPortal` 이 0회다 — 포털은 **`limit-chaser-form.tsx:1134`** 가 `createPortal(<DirtyActionBar .../>, ...)` 로 건다. 이번 변경은 두 파일 어디에서도 `createPortal` 줄을 건드리지 않았다(diff 0줄). 불변식(포털) 자체는 유지됨.

## 태스크별 내용

### Task 1 — B 토큰 · 프리미티브 · 앱 셸
- `globals.css`: `:root`/`.dark` 에 B 토큰 전부(oklch → hex/rgba), 신규 토큰 13개를 두 블록 모두 정의(스크립트로 두 블록 키 집합 일치 확인), `--led-*`/`--new-*` 주석 보존·값만 교체, radius 6/12/16/20 · `--radius` .75rem · `--font-num`. §9 주석에 B 단락 추가, §2.2b 블록 무변경(diff 확인). `.mono` → `--font-num` + tnum(Geist 보정 제거, font-weight 없음), `.slider-val` 동일, `.card-shadow` none, `.tbl-wrap` B 표.
- `chart-colors.ts` B hex 팔레트, 테스트는 「up 동일(B 의도) + down/text/grid 상이」 + 한국식 색 단언을 라이트·다크 둘 다.
- 프리미티브: Card 무테, Button outline/secondary = raised 채움(크기 불변), Badge outline/secondary = raised 알약, Input/Textarea/InputGroup raised 채움(포커스 테두리 채널·seamless 쌍 유지), Checkbox `--muted-fg` 1.5px 윤곽, Toggle outline = raised + 선택 `--seg-on-*`, Tabs default 활성 = `--seg-on-*`.
- 셸: main `bg-[var(--surface)]`(패딩 램프 불변), 사이드바/드로어 `--side-bg`, 헤더 무테, 사이드바 활성 = raised, 로그인 `--surface`.
- 스윕: 점선 플레이스홀더 18곳 `--faint`(전 폴더), 스캐너/관심종목 표 래퍼 = 카드 면 + 투명 thead, 칩/버튼 raised, 홈 카운트 칩 `--card`, 검색 kbd, 챗 필터 select.

### Task 2 — 종목상세 B 구조
- `DetailBands` 신규 + globals.css 「종목상세 B 띠」(`:empty` · `--card: var(--muted)` · `> *` 평면화) + `main:has([data-page-surface="plain"])`.
- 탭 바 16px/600 · 50px · md 램프 bleed 추가(기존 768~1023 8px 부족 결함 수정), 비-호가 패널 `pt-0`, 호가주문 패널 `w-auto` + `--surface` bleed(음수 마진 = 패딩 → `lc` 콘텐츠 폭 불변).
- 폰 CTA(`detail-order-cta-bar`, `md:hidden`, 호가주문 탭에서 언마운트) → `handleValueChange('orderbook')` 재사용, CTA 있을 때 Tabs 루트 `max-md:pb-[84px]`, FAB 은 `:has` 규칙으로 80px 위로.
- 히어로 30px/700 · 이름 18px/600 · 등락 15px/500 · 코드 raised 칩. 차트 섹션 20px/700 제목 + 알약 세그먼트 + bleed 제거. 스탯 5px 트랙 · 16px/500 값 · 구분선 제거. 상한가/동반상승/뉴스/토론 제목 20px/700, KPI 23px/800 → 20px/700.
- 테스트: 히어로 클래스 단언 갱신(+ extrabold 금지 단언), sticky 바 테스트에 md 단언 추가, CTA 테스트 2개 신규(전환 = pushState 1회 + scrollIntoView, 호가주문 탭 언마운트).

### Task 3 — 트레이딩·호가 표면
- 사다리: 폰 44px 행 / 440 박스(쌍 유지, ★ 주석 갱신), 행 radius 10, 최근 체결가 행 raised 면, 막대 `--ask-bar`/`--bid-bar`(Standard+Chaser 전 트리, 4+4곳) radius 6/8. 2·3단 행 32px(`LADDER_ROW_H` 상수) · 2단 박스 320(`LADDER_BOX_TWO_H`). 글자 크기·가로 패딩·gap·열 폭·마커 슬롯 불변.
- 상따 폼: 폰 탭 42px 중립 선택 면, 입력/세그먼트/행 38 → 46px(세로만, `px-1.5` 불변), 세그먼트 raised 트랙 + `--seg-on-*`(트랙 안쪽 패딩 없음), 방향 틴트·bleed 그림자·clip-path 제거, ≥992 카드 radius 16 · 투명 테두리. `--lw` 76/104 · 모든 `grid-cols-[var(--lw)_…]` · `@min-[700px]/lc:px-2` 불변.
- 수동주문: 입력·select 46px raised(잠김 = 투명 + 헤어라인), 주문 버튼 52px · radius 14 · 600(`px-px`·13px·`whitespace-normal` 불변), 진입 탭 B 중립 선택.
- 전략 카드 무테·열림 그림자 제거(dirty 테두리 유지), 카드 헤더 `py-3`(`px-2.5` 불변), xs 거래소 세그먼트 3곳(카드 헤더·종목상세 상태줄·작업대 단 수) = raised 알약 트랙 + `--pill-on-*`, 항목 사이 세로선 제거. 알약 탭 3곳 `--pill-on-*` + `rounded-full`, exchange-tag NXT = `--pill-on-*`, quote-grid 구분선 제거.
- 상태줄(작업대 `px-4 py-2.5` · 종목상세 `py-2.5` 가로 불변) = 카드 면 무테, 안쪽 칩 raised. 스트립 무테 카드 + raised 칩, 표 머리 투명, 「추가」 primary 채움 유지. 추가 바 입력 카드 면, 자동완성 popover. 더티 바 = popover 면 + 위 모서리 16(포털·문구·위치 불변).
- 테스트: 사다리 ⑫⑬⑰c⑰e(340→440, 34→44, 240→320, extrabold→bold, 16% 믹스 → ask/bid-bar, 최근 체결 행 raised 단언·2단 셀 h-8 단언 추가), 폼(세그먼트 `--input` 테두리, 선택 `--seg-on-*` 두 방향, 46px + raised + px-1.5, 카드 radius r-md, 틴트 제거 + `--lc-accent` 유지 단언).

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 3 - Blocking] relay 의존성 미설치로 typecheck 기준선부터 실패** — `tsc -p tsconfig.e2e.json` 이 `../relay` 소스를 끌어오는데 worktree 에 `relay/node_modules` 가 없었다(46 TS2307). `pnpm install --frozen-lockfile --offline --filter @gh-radar/relay` 로 **기존 lockfile 그대로** 스토어에서만 설치(신규 패키지 0, 네트워크 0). 이후 기준선 typecheck 0.
2. **[Rule 1 - Bug] tabs.tsx 활성 스타일이 소비처 override 를 못 받는 문제(내가 T1 에서 만든 것)** — 처음엔 `group-data-[variant=default]/tabs-list:data-[state=active]:bg-…` 로 넣었더니 카드 탭·공용 패널·종목정보 모달의 className override(`data-[state=active]:bg-…`)를 tailwind-merge 가 합치지 못해 알약 선택색이 가려질 수 있었다. 접두 없는 `data-[state=active]:` 로 바꿔 소비처가 덮을 수 있게 수정(`line` variant 는 기존 `group-data-[variant=line]` 투명 규칙이 계속 이김).
3. **[Rule 1 - Bug] Toggle 선택색이 관심종목 하트 색을 덮는 문제(예방)** — 선택 `--seg-on-*` 를 base 에 두면 `WatchlistToggle`(default variant, pressed 시 `--primary` 글자)이 흰/검 글자로 바뀐다. `--seg-on-*` 선택은 `outline`(세그먼트) variant 에만 두고 default 는 기존 `bg-muted` 유지.
4. **[Rule 1 - 시각 결함] raised 박스 안 칩/트랙이 같은 색이라 사라짐** — 띠 안 `--card` → `--muted` 재정의로 상한가 분포 0건 막대·테마 풀링 칩/트랙/더보기, 동반상승 근거 칩이 박스와 같은 색이 된다. 이 자리만 2단 raised `--raised-2` 로. 같은 이유로 검색 트리거 kbd(트리거가 raised), 더티 바 「되돌리기」(다크 popover = raised) 도 `--raised-2`.
5. **[Rule 1] 종목상세 스탯 태그 위치** — 트랙이 14 → 5px 로 얇아져 `-top-[40px]` 고정값 대신 `bottom-[calc(100%+10px)]`(sketch `.spec-tag` 와 같은 앵커).

### 플랜과 다르게 한 것(재량 · 근거)
- **`stock-daily-chart.tsx` 는 수정하지 않음.** 플랜은 그 파일의 `bg-[var(--card)]` → 투명을 요구했지만, 그 파일의 유일한 `--card` 칠은 차트 컨테이너가 아니라 **OHLC 호버 범례 오버레이**(`bg-[var(--card)]/85`)다. 투명으로 두면 캔들 위 글자가 안 읽힌다. 차트 바탕 투명화 의도는 `stock-daily-chart-section.tsx` 래퍼(`bg-transparent`)와 팔레트 bg 투명으로 이미 충족.
- **`message-assistant.tsx` 무변경** — 채움 없는 테두리는 마크다운 표 셀의 순수 구분선(스윕 규칙 「순수 구분선 → 그대로」), `bg-[var(--bg)]` 컨트롤 없음.
- **`dirty-action-bar.tsx`** — 플랜의 「바 면 `bg-[var(--bg)]`」는 실제로는 「되돌리기」 버튼이었다. 바 면(`color-mix(--card 96%)`)은 `--popover` 96% + `rounded-t-[var(--r-md)]`, 버튼은 `--raised-2`.
- **`relay-status-bar.tsx`** — 현재 소비처 0곳(미사용 컴포넌트). 규칙대로 카드 면·무테·`py-2.5` 만 적용.
- **manual-order-form 진입 탭(매수/매도/수동)** 도 상따 폼 탭과 같은 B 중립 선택 면으로(같은 카드 안 같은 줄 — 한쪽만 바꾸면 두 문법이 섞인다). 플랜 T3-2(a) 는 상따 폼만 명시.
- **3단 호가표 가격 굵기 600 → 500.** T3 본문은 「3단 400px 표 … 굵기 불변」이지만 우선하는 「타이포 교정」이 「사다리 가격 500」이고, 굵기를 **낮추는** 것은 폭을 줄여 400 하한에 안전하다(교정 절이 명시한 방향). 1·2단의 최근 체결가 800 → 700 도 같은 근거.
- **`lc` 가로 증가 0 규칙으로 적용하지 않은 B 수치:** 상따 입력 값 굵기 600(타이포 교정 「입력 값 600」) — 기존 굵기 유지(올리면 가로 증가). sketch `.v-b .lr .p 15px`·`.lr .q 13px`·`--lw 84px`·`.seg.xs padding 2px`·세그먼트 트랙 3px 패딩·`.fcol 14px` 모두 미적용. 잘림 위험으로 크기를 되돌린 요소는 없음(애초에 키우지 않음).
- **감시 대상 세그먼트 선택색**: 플랜대로 `--seg-on-*` 중립 선택 면으로 바꿨다 — 이는 **260912-gyz 의 사용자 결정(선택지 방향색)을 뒤집는다.** 실험 브랜치 판단용으로 적용했고 테스트 ②도 새 의미로 옮겼다. 사용자 확인 필요 항목.
- `app/design/**` 카탈로그 페이지의 테두리 컨테이너는 손대지 않음(사용자 화면 아님).

## 제안 커밋 메시지 (커밋하지 않음 — 사용자 확인 후 진행)

> 세 태스크가 일부 파일을 공유한다(globals.css = T1+T2, T1 점선 스윕이 T2/T3 소유 파일에도 1줄씩, tabs.tsx = T1 + T3 수정). 태스크별로 나눠 커밋하려면 공유 파일은 `git add -p` 로 헝크를 갈라야 한다. 사용자 전역 규칙(「HEAD 대비 working tree 전체를 한 번에 커밋」)을 따른다면 아래 3개를 합친 1커밋이 자연스럽다.

**T1** — `feat(260924-vj1): 토스 B 테마 토큰·프리미티브·앱 셸 전역 적용`
```
- globals.css :root/.dark 에 B 토큰(hex/rgba) 전부 정의 · 신규 토큰 13개 양쪽 블록 · radius 6/12/16/20
- .mono/.slider-val → Pretendard(--font-num)+tnum, .card-shadow none, .tbl-wrap B 표
- chart-colors B hex 팔레트 + 테스트(상승 동일·하락/텍스트/grid 상이·한국식 색 양 테마)
- Card/Button/Badge/Input/Textarea/InputGroup/Checkbox/Toggle/Tabs B 면
- AppShell --surface 본문면·--side-bg 사이드바·헤더 무테, 로그인 --surface
- 점선 플레이스홀더 --faint, 스캐너/관심종목 표·칩·홈·검색·챗 스윕
```
파일: globals.css, lib/chart-colors.ts, lib/__tests__/chart-colors.test.ts, ui/{card,button,badge,input,textarea,input-group,checkbox,toggle,tabs}.tsx, layout/{app-shell,app-header,app-sidebar,user-section}.tsx, app/login/page.tsx, home/{home-client,solo-card,theme-card}.tsx, scanner/{scanner-table,scanner-skeleton}.tsx, watchlist/{watchlist-table,watchlist-skeleton}.tsx, theme/{theme-chips,themes-client}.tsx, chat/{chat-sheet,conversation-list}.tsx, search/search-trigger.tsx, 점선 스윕 1줄: orderbook/{orderbook-ladder,trade-tape,account-panel}.tsx · stock/{stock-limit-up-section,stock-comovement-section}.tsx · trading/{latch-led,me-client,strategy-log,strategy-status-card,today-orders-card,vi-order-list}.tsx · trading/workbench/{breakout-strip,card-grid}.tsx

**T2** — `feat(260924-vj1): 종목상세 토스 B 구조 — 풀폭 섹션·띠·히어로·폰 주문하기 CTA`
```
- DetailBands 신규 — 섹션마다 풀폭 블록 + 12px --band 띠, globals.css 띠 규칙·main:has 흰 본문
- 탭 바 16px/600·md 램프 bleed, 호가주문 탭 --surface 회색 면(lc 폭 불변)
- 폰 「주문하기」 CTA — 기존 탭 전환 경로 재사용, 호가주문 탭에서 언마운트, FAB 들어올림
- 히어로 30px/700·코드 칩, 차트 알약 세그먼트, 스탯/상한가/동반상승/뉴스/토론 B 손질
- 히어로·sticky 바 테스트 갱신, CTA 테스트 2개 추가
```
파일: stock/detail-bands.tsx(신규), stock/{stock-detail-client,stock-detail-tabs,stock-hero,stock-daily-chart-section,stock-stats-grid,stock-limit-up-section,stock-comovement-section,stock-news-section,stock-discussion-section}.tsx, chat/chat-fab.tsx, globals.css(§3.9 절), stock/__tests__/{stock-hero,stock-detail-client,stock-detail-tabs}.test.tsx

**T3** — `feat(260924-vj1): 트레이딩·호가 표면 토스 B 리스킨 + 테스트 갱신`
```
- 폰 사다리 44px 행·440 박스, 2·3단 32px(LADDER_ROW_H)·2단 320, 잔량 막대 --ask-bar/--bid-bar
- 상따 폼 46px 입력·알약 세그먼트·중립 탭·방향 틴트 제거(--lw 76/104·가로 패딩 불변)
- 수동주문 46px 입력·52px 주문 버튼, 전략 카드 무테, 헤더 xs 세그먼트·알약 탭 --pill-on-*
- 상태줄·스트립·공용 패널 무테 카드 면 + raised 칩, 더티 바 popover 면(포털 불변)
- tabs.tsx 활성 스타일을 소비처가 덮을 수 있게 수정
- 사다리·상따 폼 테스트 단언을 새 클래스로 이전
```
파일: orderbook/{orderbook-ladder,account-panel,order-panel,relay-status-bar}.tsx, stock/stock-orderbook-section.tsx, trading/{limit-chaser-form,latch-led,exchange-tag,dirty-action-bar,today-orders-card,strategy-status-card,dma-gate}.tsx, trading/card/{strategy-card,card-header,card-tabs,quote-grid-10,manual-order-form,stock-info-modal}.tsx, trading/workbench/{workbench-status-bar,vi-trigger-strip,breakout-strip,stock-add-bar,shared-panels,vi-settings-rows}.tsx, ui/tabs.tsx, orderbook/__tests__/orderbook-ladder-chaser.test.tsx, trading/__tests__/limit-chaser-form.test.tsx

(전 경로 접두 `webapp/src/components/` — globals.css 는 `webapp/src/styles/`, chart-colors 는 `webapp/src/lib/`, login 은 `webapp/src/app/`.)

## 오케스트레이터 스크린샷 점검 목록

**잘림(오발주 직결 — 최우선)**
- [ ] `lc` 컨테이너 **400**(3단 호가표 하한 · 와이드 밴드 830 진입 직후, 뷰포트 ≈1120 사이드바 有) — 3단 표 가격 `12,625` 류 7자리 잘림 0, 마커 슬롯 보임, 32px 행.
- [ ] 본문 **700**(컴팩트 진입, 뷰포트 ≈732 · 또는 작업대 카드 폭 700) — 2열 폼 **주문금액** 잘림 0, 「한방체결」·「잔량추적」·「자동취소」 라벨 잘림 0, 46px 입력.
- [ ] 폰 **360 / 390** — 1단 사다리 44px 행·440 박스·20행 스크롤, 42% 열 7자리 가격 truncate 0, 매수/매도 탭 42px, 「매도잔량/매수잔량」 세그먼트 한 줄, 수동주문 52px 버튼 「예약매수」 2줄 접힘 정상.
- [ ] 카드 헤더 한 줄 접힘 경계(`@min-[760px]/lc`) — xs 알약 세그먼트 폭 변화 없음(세로선 1px 제거만).

**테마 × 화면**
- [ ] 라이트/다크 × 종목상세 4탭(차트 · 호가주문 · 종목정보 · 뉴스토론) × 폰 390 / 태블릿 768·1023 / 데스크톱 1280.
  - 라이트 비-호가 탭: 흰 바탕 + 12px 회색 띠, 띠 안 KPI/분포/후보 박스가 회색 raised 로 보임, 섹션 카드 테두리·그림자 없음.
  - 라이트 호가주문 탭: 좌우·아래 끝까지 #f2f4f6 회색 면 위 흰 카드(상태줄·종목정보 10칸·카드 본문·계좌 패널), `lc` 밴드 전환 지점이 이전과 동일.
  - 768~1023: sticky 탭 바가 좌우 끝까지 닿음(md bleed 수정).
- [ ] 라이트/다크 × `/trading` 작업대(1·2·3단) — 무테 카드, 상태줄 카드 면, VI/돌파 스트립 raised 칩·점선(거래중) 칩, 알약 탭(미체결·잔고·로그), 알림 토스트.
- [ ] 홈 · 스캐너 · 테마 · 관심종목 · 마이 · 챗 시트 · 로그인 — 라이트 회색 본문면 위 흰 카드, 다크 #17171c/#202027 단계, Pretendard 숫자 자릿수 정렬.
- [ ] 종목정보 모달(작업대 카드 → 종목정보) — 차트/스탯/상한가 섹션이 띠 없이 모달 안에서 정상(DetailBands 는 종목상세에만).

**겹침**
- [ ] 폰 종목상세 비-호가 탭: 하단 「주문하기」 CTA(빨강 54px) 와 AI 챗 FAB 이 겹치지 않음(FAB 이 CTA 위 80px), 마지막 콘텐츠가 CTA 에 안 가려짐(84px 여백). CTA 탭 → 호가주문 탭 전환 + 탭 바로 스크롤, 호가주문 탭에서 CTA 사라짐, 더티 액션 바와 동시 노출 없음.
- [ ] 더티 액션 바(상따 폼 값 변경) — 화면 하단 고정 유지(포털), 위 모서리 16 · popover 면, FAB 회피 여백 정상.

## Known Stubs

없음 — 데이터 경로 변경 0(순수 시각 리스킨).

## Threat Flags

없음 — 새 네트워크·입력·저장 경로 0. CTA 는 기존 탭 전환 핸들러만 호출. T-vj1-01~03 완화는 위 불변식·테스트로 유지(대시 바 포털 위치는 `limit-chaser-form.tsx`).

## 기타 관찰

- worktree 에 내가 만들지 않은 미추적 파일 `webapp/e2e/specs/zz-theme-gallery.spec.ts` 가 생겼다(오케스트레이터 스크린샷용으로 추정). 건드리지 않았다.
- 빌드 산출물(`webapp/.next`)은 gitignore 대상.

## Self-Check: PASSED

- 생성 파일 `webapp/src/components/stock/detail-bands.tsx` 존재 확인.
- 커밋은 지시에 따라 0건(HEAD `46e8bea` 그대로) — 확인할 해시 없음.
- 최종 `typecheck` 0 · `vitest` 98 files / 1681 passed / 1 skipped · build 성공.
