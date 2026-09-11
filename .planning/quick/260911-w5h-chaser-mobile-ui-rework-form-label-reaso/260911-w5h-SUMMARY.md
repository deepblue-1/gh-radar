---
phase: quick-260911-w5h
plan: 01
subsystem: webapp
tags: [ui, mobile, trading, limit-chaser, orderbook, a11y]
status: complete

requires:
  - 16-UI-SPEC (T3 10px 허용처 · C2/C7/R6 카드 행 · §키보드 접근성)
  - quick-260911-tuk (상따 폼 파생값 제거 · 계좌 전용 잔고 매입금액)
provides:
  - "라이트 기본 테마 · 모바일 본문 여백 8px"
  - "상따 폼 모바일 전면 정리(세그먼트 전폭 · 사유 카드 하단 집약 · 16px 입력 · 테두리 한 겹)"
  - "상따 헤더 카드(계좌 칩 · 거래소 콤보 · 종목 검색 트리거 · 종목정보 8칸)"
  - "좁은 폭 호가(마커 제거 · 340px 박스 · 경계 중앙 스크롤) + compact 체결 테이프"
  - "잔고·미체결·전략 현황 3목록 공통 읽기 문법"
  - "webapp/src/lib/quote-format.ts (시총 · 발행1% 포맷)"
  - "TradeTape `compact` 옵션 (기본값 off · 기존 동작 불변)"
  - "ladderPctTextSigned (좁은 폭 부호·% 표기)"
affects:
  - webapp 전 페이지(본문 여백 · 기본 테마)
  - 호가주문 탭(취소 버튼 글리프 · 데스크톱 미체결 표는 불변)

tech-stack:
  added: []
  patterns:
    - "순수 함수 모듈 + 콜로케이트 단위 테스트 (limit-up-format.ts 관례 승계)"
    - "모바일 전용 변경은 `min-[1280px]:` 로 데스크톱 원상 유지"
    - "색·형태 단독 전달 금지 — 배경/굵기 옆에 `sr-only` 동반 (WCAG 1.4.1)"

key-files:
  created:
    - webapp/src/lib/quote-format.ts
    - webapp/src/lib/__tests__/quote-format.test.ts
    - webapp/src/components/layout/__tests__/app-shell-chrome.test.tsx
  modified:
    - webapp/src/components/providers/theme-provider.tsx
    - webapp/src/components/layout/app-shell.tsx
    - webapp/src/components/stock/stock-detail-tabs.tsx
    - webapp/src/components/stock/stock-orderbook-section.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/components/orderbook/orderbook-ladder.tsx
    - webapp/src/components/orderbook/trade-tape.tsx
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/trading/strategy-status-card.tsx
    - webapp/src/components/trading/strategy-log.tsx
    - webapp/e2e/specs/trading-limit-chaser.spec.ts
    - webapp/e2e/specs/a11y.spec.ts
    - webapp/e2e/specs/me.spec.ts

decisions:
  - "가격 칩 행에서 상한가·하한가 칩만 걷고 기준가·호가단위는 남겼다 (계획자 판단 — 사용자 확인 요청)"
  - "`formatOnePercentShares` 에 하한 분기를 두지 않는다 — 100주 미만 상장은 존재하지 않아 영원히 안 타는 분기다"
  - "A1/A2 전역 계약에 새 테스트 파일 1개를 더했다 (플랜의 파일 수 61/62 → 실제 62/63)"

metrics:
  duration: "약 40분"
  completed: 2026-09-12
  tasks: 4

actuals:
  tokens: 118000
  tasks: 4
  commits: 4
plan_head_before: cdf26d8fa721b834b387a419e9a8a942ba625100
---

# Quick 260911-w5h: 상따 모바일 UI 전면 정리 Summary

사용자가 목업 7벌을 반복 검토해 확정한 상따·잔고·미체결·전략 모바일 정리를 구현했다 — 전부
**표시 문제**였고 데이터 경로·무장 판정식·전송 cfg 는 한 줄도 바뀌지 않았다.

## 태스크별 커밋

| # | 커밋 | 제목 | 테스트 변화 |
|---|------|------|-------------|
| 1 | `aaeaa36` | 라이트 기본 테마 + 상따 폼 모바일 전면 정리 | 61 files/710 → **62 files/729** |
| 2 | `4545e19` | 상따 헤더 카드(계좌 칩·거래소 콤보·종목 트리거·종목정보 8칸) | 62/729 → **63 files/747** |
| 3 | `2846c6d` | 모바일 호가 마커 제거 + compact 체결 테이프 | 63/747 → **63 files/762** |
| 4 | `e0f6ad0` | 목록 3종 공통 문법 | 63/762 → **63 files/763** |

기준선 `61 files / 710 passed / 1 skipped` → 최종 **`63 files / 763 passed / 1 skipped`**.
passed 는 한 번도 감소하지 않았다. `lint` = error 0 · warning **정확히 3건**(기준선과 동일:
`ScannerEmpty` · `_msg` · `use-relay-socket` exhaustive-deps). `build` exit 0. `typecheck`
(`tsc --noEmit` + `tsc -p tsconfig.e2e.json`) exit 0.

## 「데스크톱 불변」을 무엇으로 증명했는가

계획이 요구한 잠금을 **명시 단언**으로 박았다. 이 단언들이 「모바일만 바꿨다」의 유일한 증거다.

| 표면 | 단언 |
|---|---|
| 상따 사다리 표 | `orderbook-ladder-chaser.test.tsx` **⑯** — `ladder-row` 20 + `ladder-fill-head` 1 + `ladder-fill-cell` 10 + `ladder-marker` 20, 데스크톱 `ladder-pct` 20개가 `%` 없음 |
| 데스크톱 등락률 계약 | 같은 파일 **④** — `ladderPctText` 반환값 4갈래 + 데스크톱 셀 `minWidth: 40px`. `export` 도 그대로다 |
| 마커 우선순위 | **③ / ③b** — 상한가 == 최근 체결가면 「상」이 이긴다(데스크톱 기준으로 다시 셈) |
| 잔고 7열 표 | `account-panel.test.tsx` **⑯-e / ⑯-g** 가 손대지 않고 그대로 통과. **⑯-h** 가 종목 축 모드에서 표 헤더 「평가금액」이 남아 있음을 추가로 확인 |
| 미체결 표 | **⑰-a** — 주문번호가 **표에는 있고** 카드에는 없다. **⑰-b** — `account-origin-tag` 가 표에만 3개 |
| `variant="orderbook"` 표준 사다리 | `orderbook-ladder.test.tsx` 10건 전부 무수정 통과 |
| `TradeTape` 기존 호출부 | `trade-tape.test.tsx` **⑩ 첫 케이스** — `compact` 미전달 시 `<thead>` 3헤더 · `HH:MM:SS` · `max-h-[320px]` · `tabindex` 없음 · `px-1.5` · `h-[var(--row-h)]` |
| 전송 와이어 | `limit-chaser-client.test.tsx` **⑯** (`cfg` 에 `market` 키 없음) 무수정 통과 |
| 무장 판정 | `limit-chaser-form.test.tsx` ①~⑯ 이 전부 통과 — 판정식을 건드리지 않았다는 뜻이다 |

## ★ 사용자 확인 요청 — 가격 칩 행 판단

계획자 판단을 그대로 실행했다: 헤더 종목정보 8칸이 **상한·하한을 이미 보여주므로** 같은 카드
안에서 같은 숫자가 두 번 나온다 → `lc-price-chips` 에서 **상한가·하한가 칩 2개를 걷고**
`기준가 · 호가단위` **2칩만 남겼다**. 그 둘은 8칸 어디에도 없어서 지우면 정보가 사라진다.

사용자는 칩 행을 없애라고 하지 **않았으므로** 행 자체는 살렸다. **이 판단을 확인해 주세요** —
「칩 행을 통째로 없애라」 또는 「상한·하한을 칩에 남기고 8칸에서 빼라」면 되돌린다.

## compact 테이프 `colgroup` 비율

계획이 준 `26% / 42% / 32%` 를 **그대로** 썼다(조정하지 않았다). 근거는 코드 주석에 박제:
390px 뷰포트 → `AppShell main` `p-2` 로 본문 374px → `lc-body-grid` 좌측 칼럼 42% ≈157px →
카드 패딩 8×2 제외 콘텐츠 ≈140px. 가장 넓은 것이 체결가(9자)라 가운데가 가장 넓다.

⚠️ **다만 실제로 잘리는지는 확인하지 못했다** — jsdom 에는 레이아웃이 없고 Playwright 를
돌리지 않았다. 단위 테스트가 잠근 것은 비율 값과 「체결가 칼럼이 가장 넓다」는 **규율**이지
「잘리지 않는다」는 사실이 아니다. 실기기에서 잘리면 비율만 조정하면 된다(규율은 유지).

## Playwright 미실행 — 무엇이 미검증으로 남았는가

플랜 지시대로 **Playwright 를 돌리지 않았다**. e2e 스펙 3종(`trading-limit-chaser.spec.ts` ·
`a11y.spec.ts` · `me.spec.ts`)은 **고쳤을 뿐 통과를 본 것이 아니다** — `tsc -p tsconfig.e2e.json`
통과가 확인한 것은 타입뿐이다.

그래서 다음이 미검증으로 남는다. 전부 **실측이 필요한** 항목이다:

1. **340px 박스의 경계 중앙 초기 스크롤.** `box.scrollTop = row.offsetTop - box.clientHeight / 2`
   가 매도1/매수1 경계를 정말 정중앙에 놓는지. jsdom 은 `offsetTop`/`clientHeight` 가 전부 0
   이라 계산식만 잠겼고 결과는 못 봤다. `centeredRef` 최초 1회 규율도 마찬가지다.
2. **compact 테이프 스크롤의 axe `scrollable-region-focusable` 대응.** `tabIndex={0}` +
   `data-slot="tape-scroll"` 을 걸었고 `a11y.spec.ts` 의 tabbable 목록을 2개로 고쳤지만,
   axe 가 실제로 조용해지는지는 못 봤다. **DOM 순서(사다리 → 테이프)를 가정**하고 목록 순서를
   `['div[ladder-scroll]', 'div[tape-scroll]']` 로 썼다 — 어긋나면 그 단언부터 실패한다.
3. **`p-2` 가 다른 페이지 레이아웃에 준 영향.** `main` 패딩은 **전 페이지**에 걸린다. 본문
   패딩을 가로지르는 클래스는 `grep` 으로 훑어 `stock-detail-tabs` 1건뿐임을 확인하고 함께
   고쳤지만(다른 `px-6` 는 전부 자기 패딩이거나 `main` 밖이다), 스캐너·테마·관심종목 등에서
   8px 여백이 시각적으로 답답한지는 눈으로 못 봤다.
4. **라이트 기본 테마에서의 전 페이지 대비.** 기본값만 바꿨다 — 라이트 토큰 자체는 원래
   있었지만 「모든 화면이 라이트에서 처음부터 보인다」는 상황은 실측된 적이 없다.
   `lightweight-charts` 차트 색 주입(hex 변환 경로)도 라이트에서 확인이 필요하다.
5. **모바일 실기기에서의 iOS 자동 확대.** 입력 글꼴 16px 이 근본 해결이지만 실제 Safari 에서
   확대가 사라지는지는 못 봤다.
6. **`me.spec.ts` 의 새 폭 단언.** 전략 행 2줄 구조에서 `strategy-row-meta` 가 행 폭의 80%
   를 넘는지는 실측 대상이다.

## 계획이 틀렸던 지점과 코드에서의 정정

**1) `formatOnePercentShares` 의 「1억 미만 → 대시」 대칭 기대 (내가 틀렸다)**
계획 스펙은 `listedShares <= 0` 만 대시로 규정했으므로 `99주 → '0주'` 다. 처음에 시총과 같은
하한을 기대하는 테스트를 썼다가 실패했고, **스펙을 바꾸지 않고 테스트를 고쳤다.** 근거를
테스트 주석에 남겼다: 상장주식수 100주 미만 종목은 한국 시장에 없어 그 분기는 영원히 안
탄다 — 없는 경우를 위한 분기는 읽는 사람에게 「그런 경우가 있다」는 거짓말을 한다. 실재하는
`ls === 0`(프레임 미수신)은 위 케이스가 잠근다.

**2) 테스트 파일 수 (플랜의 61/62 → 실제 62/63)**
플랜 `<behavior>` A1/A2 가 테마 기본값·본문 여백 단언을 요구했는데 `theme-provider`·`app-shell`
둘 다 **테스트 집이 없었다**(grep 실측 0건). 기존 파일에 끼워 넣으면 스코프가 어긋나므로
`layout/__tests__/app-shell-chrome.test.tsx` 를 신설했다. sticky 탭 바 단언은 그 바를 실제로
렌더하는 `stock-detail-client.test.tsx` 에 붙였다(Test 8). 결과적으로 파일 수가 플랜의 숫자보다
**각 단계 +1** 이다 — 계약을 잠그는 쪽을 택했고, 그 판단을 여기 남긴다.

**3) `RowKey` / `RowValue` 가 미사용이 됐다 (플랜이 예상하지 않음)**
새 잔고·미체결 카드 문법이 라벨 조각을 쓰지 않으므로 두 헬퍼가 고아가 됐다. 남기면
`no-unused-vars` warning 이 늘어 lint 기준선(3건)이 깨진다 → **정의를 제거**했다.
(`OriginTag` 는 데스크톱 표가 계속 쓰므로 그대로다 — 플랜의 실측이 맞았다.)

**4) 계획이 맞았던 함정 (전부 실제로 밟았다)**
- `-mx-6` 상쇄: 실측 1건(`stock-detail-tabs:102`)이 정확했고, 안 고쳤으면 모바일에서 바가
  삐져나갔다. `grep` 완료 조건을 「맨몸으로 남은 것 0건」으로 본 것도 맞았다.
- `exchangeBadgeOf`: import 만 지우고 정의를 남겼다. `strategy-badge.test.tsx:139~149` 가
  그대로 통과한다.
- `me.spec.ts` 폭 단언: 2줄 구조에서 계좌번호가 줄 안의 조각이 되어 깨지는 것이 맞았다.
  대상을 `strategy-row-account` → `strategy-row-meta` 로 옮겼다.
- `ladder-scroll` 유지(뒤집힌 전제): `a11y.spec.ts` 의 tabbable 단언이 살아 있었고, compact
  테이프가 들어오며 **2개**가 되는 것도 맞았다.

## 잠그지 못한 갈래 (과장 없이)

- **⑬ 상한가 `sr-only` 단언의 셀렉터가 약하다.** `'.sr-only ~ .sr-only'` 로 짚었는데, 이는
  「단계 라벨 다음의 sr-only」를 가정한다. 마크업 순서가 바뀌면 이 단언은 조용히 다른 것을
  잡을 수 있다. 텍스트 단언(`toContain('상한가')`)이 함께 있어 완전 무력화는 아니다.
- **⑨ 범례 「좁은 폭에 0개」 단언**은 `.min-\[1280px\]\:hidden` 클래스 셀렉터에 의존한다.
  그 유틸 클래스가 바뀌면 셀렉터가 빈 결과를 돌려주며 **헛통과**한다. 앞줄의
  `toHaveLength(1)` 이 실질적 잠금이다.
- **모바일 세그먼트 `w-full` 이 실제로 「매도잔량」을 한 줄에 담는지**는 클래스 단언
  (`whitespace-nowrap`)만 잠갔다. 잘림 여부는 실측 대상이다.
- **전략 현황 행 높이가 정말 일정한지**는 「r1 배지 개수 == 상태 배지 개수」로 간접
  증명했을 뿐 실측 높이를 비교하지 않았다.
- **`account-holding-r3` 의 「대시 0개」** 는 계좌 전용 모드(`⑯-c`)에서만 잠갔다. 종목 축
  모드에서 **일부 행만** 현재가를 아는 혼합 상황은 fixture 에 없다.

## Self-Check: PASSED

- 생성 파일 3개 존재 확인 (`quote-format.ts` · `quote-format.test.ts` · `app-shell-chrome.test.tsx`)
- 커밋 4개 존재 확인 (`aaeaa36` · `4545e19` · `2846c6d` · `e0f6ad0`)
- `git rev-list --count cdf26d8..HEAD` = **4** (프론트매터 `commits: 4` 와 일치)
