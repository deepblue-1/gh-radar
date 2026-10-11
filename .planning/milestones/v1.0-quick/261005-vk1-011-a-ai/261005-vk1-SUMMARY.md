---
phase: quick-261005-vk1
plan: 01
subsystem: webapp/analytics · webapp/layout
tags: [limitup, report, accordion, chart, sidebar, sketch-011]
status: complete
requires: [Phase 28 상한가 보고서(28-12 · 28-13), 스케치 011 채택안 A]
provides:
  - isListedStock · excludedCaptionOf · entryBuyTopOf · KPI 4칸 kpisOf · 리스트 행 dayRowsOf
  - 종목 리스트 + 아코디언(LimitupDayGrid renderDetail)
  - eventsOf · storyOf · memberWindowsOf · layoutEventBand · 탐지율 기준선 레인
  - 사이드바 분석 하위 AI 애널리스트 + 레일 전용 아이콘
affects: [/analytics/limitup, AppSidebar(전 화면)]
tech-stack:
  added: []
  patterns: [번호 사건 배열 하나가 레인 마커와 사실 문장을 함께 만든다, rail && 렌더 + hidden rail:block 이중 가드]
key-files:
  created: []
  modified:
    - webapp/src/lib/limitup-report.ts
    - webapp/src/lib/limitup-lanes.ts
    - webapp/src/components/analytics/limitup-day-grid.tsx
    - webapp/src/components/analytics/limitup-event-card.tsx
    - webapp/src/components/analytics/limitup-lane.tsx
    - webapp/src/components/analytics/limitup-kpi-strip.tsx
    - webapp/src/components/analytics/limitup-report.tsx
    - webapp/src/components/analytics/limitup-fingerprint-table.tsx
    - webapp/src/app/analytics/limitup/page.tsx
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/chat/chat-fab.tsx
    - 테스트 6 · e2e 3 (아래 표)
decisions:
  - 리스트 기본 = 첫 행 펼침(보고서는 읽으러 오는 화면 · 비용은 격자 파일 1건)
  - 리스트 「+60초 매도」 열 유지(스케치엔 없지만 다른 곳에 안 나오는 유일한 지표)
  - 리스트·요약의 「직전 1분 매수 1위」 는 사실 member_entry_buy 출처만 — entries.entry_buy_* 는 다른 창
  - 네이티브 탭 · NATIVE_TAB_PATHS · TAB_ROOTS 의 /chat 은 그대로(결정 범위 = 사이드바)
metrics:
  duration: 약 20분(기록 시작 14:00Z ~ 14:20Z 기준 — 실측 벽시계는 더 길 수 있음)
  completed: 2026-10-05
actuals:
  tokens: 61915
  tasks: 3
  commits: 3
plan_head_before: 9117e218cc6df07c24b4e62ebd41af3184572f97
---

# Quick 261005-vk1: 스케치 011 A 상한가 보고서 리스트 펼침 · 번호 연결 사건 카드 · 사이드바 AI 애널리스트 이동 Summary

상한가 보고서를 「미도달 제외 + KPI 4칸 + 종목 리스트 아코디언」으로 바꿨습니다. 펼친 사건 카드는 스케치 011 A 구조입니다. 한 줄 요약 아래 두 레인이 오고, 레인에는 라벨 띠 번호 · 지시선 · 탐지율 선 · 직전 1분 파란 면이 있습니다. 오른쪽에는 같은 번호의 사실 문장이 서고, 마우스를 올리면 레인과 문장이 서로 강조됩니다. 사이드바 「AI 애널리스트」는 「분석」 하위로 옮겼고, 트레이딩 권한자에게만 보입니다.

## 커밋

| Task | 내용 | 커밋 |
| ---- | ---- | ---- |
| 1 (트레이서) | 미도달 제외 · KPI 4칸 · 종목 리스트 그 자리 펼침 | 865257ea |
| 2 | 사건 카드 가독성(한 줄 요약 · 번호 마커↔사실 문장 · 탐지 기준선 · 직전 1분 창 · 용어 교체) | 44b9366a |
| 3 | 사이드바 AI 애널리스트 → 분석 하위(권한자만) + 레일 아이콘 | e76c7d1c |

push 없음 · 배포 없음 · Co-Authored-By 없음.

## 무엇이 바뀌었나

**D-02 미도달 제외 · KPI**
- `isListedStock`: entry 가 있으면 `first_upper_ms != null` 인 종목만 목록에 남깁니다. entry 가 없는 옛 잠김 행은 잠김이 있으면 남습니다.
- `excludedCaptionOf`: 「상한가에 닿지 않은 N종목(이름 · …, 최대 5개 + 외 N)은 목록에서 뺐어요」. 제외가 0건이면 줄이 없습니다.
- KPI는 상한가 도달 · 종가까지 유지 · 깨짐 · 어제 D+1 4칸입니다. 20261002 픽스처 값은 2 · 1 · 1 · +2.5% 입니다. 결과 태그에서 「미도달」을 지웠습니다.

**D-03 리스트 + 아코디언**
- h2 「상한가 종목」. xl 이상은 8열 표(종목 · 결과 · 첫 상한가 · 잔량 스파크 · 최대 잔량 · +60초 매도 · 직전 1분 매수 1위 · chevron), xl 미만은 2단 카드형입니다.
- 한 번에 하나만 열리고 첫 행이 기본으로 펼쳐집니다. 같은 행을 다시 누르면 접히고, 날짜가 바뀌면(`key=date`) 첫 행으로 초기화됩니다.
- 행 버튼에는 `aria-expanded`, 열렸을 때 `aria-controls=ev-{isin}`, WR-A05 `aria-describedby` 설명이 있습니다. 사건 카드는 `aria-labelledby` 로 행 버튼을 가리킵니다.
- 격자 뒤에 따로 쌓이던 사건 카드 묶음과 `scrollToEventCard`/h3 포커스, IntersectionObserver 지연 로드를 지웠습니다.
- 위쪽 카드가 접히면서 새로 연 행이 앱 머리 위로 밀려나면 `scrollIntoView` 로 되돌립니다(reduced-motion 존중).

**D-04/D-05 사건 카드**
- `eventsOf`: 시각이 있는 사실에 시간순 번호를 매깁니다(덕우전자 1~9). 창 사실(직전 1분 매수/매도)은 번호 없이 window 로만 표시합니다.
- 사실 문장 앞의 시각 접두를 지웠습니다. 창구 문장 머리는 「상한가 직전 1분 매수 창구 (09:05:01~09:06:01): …」로 바꿨습니다.
- `storyOf` 결과 예: 「09:02:26 20% 도달 → 3분 35초 뒤 09:06:01 첫 상한가 5,730원 → 10.1초 만에 깨짐(5,720원) · 종가 5,290원 (−7.7%)」. 둘째 줄은 「상한가 직전 1분 매수 1위 한국증권 54.4%」입니다.
- 레인 1 「상한가 도달까지」:
  - 기준선은 상한가 선(오른쪽 위 라벨)과 「등락률 20% (탐지 기준) 5,292원」 선(왼쪽 아래 라벨) 둘뿐입니다. 25% 선과 「25% 도달」 마커는 지웠습니다.
- 레인 2 「잠김 구간」:
  - ▼ · ✕ 는 title 만 남깁니다.
  - `lock_hold` 처럼 창 끝 뒤에 있는 사건은 x=100 에 고정합니다.
  - q_max 마커의 높이는 사실의 krw 값입니다.
- `layoutEventBand`: 라벨 띠는 최대 3줄이고, 넘치면 점 위에 번호만 씁니다. 폰(폭 < 560)에서는 번호만 보입니다.
- 창 음영은 `var(--accent)`, 캡션은 `--accent-fg` 입니다. SVG 에는 글자가 0개입니다.
- 창구 막대 제목은 「상한가 직전 1분 매수 창구」/「깨짐 직전 1분 매도 창구」이고, 그 아래 「range · 1분 단위 배분이라 추정」이 붙습니다.
- 지문표 머리도 「상한가 직전 1분 매수」·「깨짐 직전 1분 매도」로 바꿨습니다.
- 미사용 export 를 정리했습니다: `lockTagsOf` · `MAX_LOCK_TAGS` · `fmtSpan` · `circledNumber` · `factsSorted` · `layoutLaneLabels` 와 그 테스트.

**D-01 사이드바**
- 「분석」 SUB_LIST 의 「상한가 보고서」 다음에 `data-sidebar-item="chat"` 을 두었습니다. tradingVisible 이 거짓이면 렌더하지 않습니다.
- /chat 에서는 이 하위 항목만 켜집니다(`aria-current` + `--nav-on-bg`). 「분석」 제목은 꺼집니다.
- 레일에서는 「분석」 아이콘 밑에 `li.hidden.rail:block` 으로 MessageSquare 아이콘을 둡니다(`rail &&` 렌더 가드와 함께).

## 왜 첫 행을 기본으로 펼치나

보고서는 읽으러 오는 화면이라 첫 화면에 사건 카드 하나가 바로 보여야 합니다. 비용은 격자 파일 1건입니다(옛 화면도 상단 카드를 진입 즉시 받았습니다).

## 스케치 011 A 와 다른 점

1. **리스트 「+60초 매도」 열 유지**: 스케치 리스트에는 없지만 다른 곳에 나오지 않는 유일한 지표입니다. 사용자 결정은 이 지표를 지우라고 하지 않았습니다.
2. **색은 앱 토큰(D-05 · R-6 이 스케치를 이김)**:
   - 결과 태그 깨짐 = `--up`(빨강) · 유지 = `--down`(파랑). 스케치는 반대였습니다.
   - 상한가 선은 `--border-subtle`(회색) 점선입니다(스케치는 빨강).
   - 잠김 곡선은 `--fg`, 잠김 음영은 `--muted` 입니다.
   - 탐지 · 기준 10억 선은 `--led-latent` 입니다.
3. **비강조 번호 원**: 카드 바탕 + `--muted-fg` 테두리입니다. 스크린샷 대조에서 `--muted-fg` 바탕 + `--card` 글자가 다크 테마에서 거의 안 읽혀서 고쳤습니다(아래 시각 결함 수정).
4. **KPI 단위**: 「종목」 small 단위는 붙이지 않았습니다(기존 mono 20px · 단위 없음 표기 유지). 「어제 D+1 시가」 라벨도 「어제 D+1」 그대로입니다.

## entries.entry_buy_* 와 member_entry_buy 는 창이 다르다

- 사실 `member_entry_buy` 의 창은 [anchor − 60s, anchor] 입니다(workers/limitup-sync derive.ts). entries `entry_buy_member*/share*` 는 다른 창입니다.
- 실 export 20261002 에서 값이 갈립니다:
  - 덕우전자: entries 1위 신한(00002) 89.6% vs 사실 한국증권 54.4%
  - 엑시온그룹: entries 00002 34.1% vs 사실 JP모간 49.6%
- 그래서 리스트 · 요약의 「직전 1분 매수 1위」는 사실 values 에서만 만듭니다(`entryBuyTopOf`). 단위 테스트에서 「신한」이 나오지 않는지 확인합니다.
- 옛 리스트 「진입 매수 창구」 열은 entries 값을 썼습니다. 이름과 숫자의 창이 어긋나 있었던 셈이고, 이번에 함께 바로잡혔습니다.

## 다른 /chat 표면 (미변경 — 사용자 판단 필요)

결정 범위가 사이드바라 아래 표면은 바꾸지 않았습니다. 이 표면에서는 /chat 이 여전히 모든 사용자에게 열려 있습니다.

| 표면 | 위치 | 현재 |
| ---- | ---- | ---- |
| 네이티브 iOS 탭바 | mobile/ios TabRoutes.swift | /chat 탭 모든 사용자 |
| 네이티브 Android 탭바 | mobile/android TabRoutes.kt | /chat 탭 모든 사용자 |
| 네이티브 프리페치 | native-bridge-provider.tsx `NATIVE_TAB_PATHS` | /chat 포함 |
| 탭 스크롤 기억 | tab-scroll-memory.ts `TAB_ROOTS` | /chat 포함 |
| 종목상세 FAB | chat-fab.tsx | 그대로(주석만 사실대로 정정) |
| /chat 직접 주소 | app/chat | 라우트 유지 · server requireAuth |

네이티브 탭까지 권한자 전용으로 맞추려면 앱 릴리스가 필요합니다. 따로 결정해 주세요.

## 검증

| 항목 | 결과 |
| ---- | ---- |
| `pnpm --filter @gh-radar/webapp run typecheck`(앱 + e2e) | 통과 |
| `pnpm --filter @gh-radar/webapp run test`(vitest 전체) | **149 파일 · 3530 통과 · 1 skip**(기존 skip) |
| vitest 대상: limitup-report 39 · limitup-lanes 37 · day-grid 12 · event-card 13 · report 12 · tables 5 · app-sidebar 58 | 통과 |
| e2e `limitup-report.spec.ts`(P28-R1 데스크톱 1280 · P28-R1b 폰 390) | 3 passed(setup 포함) |
| e2e `sidebar-tree.spec.ts` + `shell-chrome.spec.ts` | 19 passed |

- e2e 첫 실행에서 실패가 1건 있었습니다. 「AXION 행을 연 직후 그 행이 화면 안」 단언이 즉시 측정이라 smooth 스크롤 보정보다 먼저 쟀습니다. `expect.poll` 로 바꾸니 통과했습니다. 보정 로직 자체는 동작합니다(−513 → 머리 아래).
- 스크린샷(fullPage):
  - `webapp/test-results/limitup-report-1280.png` · `webapp/test-results/limitup-report-390.png`
  - 사본: `.planning/quick/261005-vk1-011-a-ai/shots/limitup-report-1280.png` · `.planning/quick/261005-vk1-011-a-ai/shots/limitup-report-390.png`(커밋 안 함)
  - fullPage 캡처라 sticky 앱 머리 · 사이드바가 페이지 중간에 찍혔습니다. 캡처 방식에서 생긴 것이고 실제 화면 결함은 아닙니다.

## 시각 결함 수정(스크린샷 대조 후 · 묻지 않고 고침)

1. 비강조 번호 원(⑤⑥ 등)이 다크 테마에서 회색 바탕 + 어두운 글자라 거의 안 읽혔습니다. 카드 바탕 + `--muted-fg` 테두리 + `--fg` 글자로 바꿨습니다.
2. 「상한가 직전 1분」 · 「깨짐 직전 1분」 창 캡션이 곡선과 겹쳐 읽기 어려웠습니다. 선 라벨과 같은 반투명 카드 면을 깔았습니다.
3. 띠에 자리가 없어 점 위에 쓰는 번호(⑦⑧⑨)가 곡선 · 세로선 위에서 묻혔습니다. 같은 반투명 면을 깔았습니다.

## Deviations from Plan

1. **[Rule 3 — Blocking] 단위 테스트의 SVG 색 감사 범위**: 리스트 chevron(lucide `svg`)이 스파크라인 감사(`document.querySelectorAll('svg')`)에 잡혔습니다. 감사 선택자를 `svg:not(.lucide)` 로 좁혔습니다. 색 규칙은 바뀌지 않았습니다(e2e 감사는 `svg *` 의 fill/stroke 속성만 봐서 영향이 없습니다).
2. **[Rule 2] 제목 수준**: 카드 h3 를 지우면서 레인 제목 · 「사실 문장」을 h3, 창구 그룹 제목을 h4 로 올렸습니다. h2(상한가 종목) 아래에서 수준이 건너뛰지 않게 하려는 것입니다.
3. **TDD 순서**: 각 태스크는 구현과 테스트를 같은 태스크 안에서 작성했습니다. RED 를 따로 커밋하지 않았고, 태스크당 feat 1커밋입니다(plan 이 허용한 형태).
4. **LimitupEvent 에 `px` · `krw` 필드 추가**: 레인 마커 높이를 사실 values 에서 바로 읽게 했습니다(plan 의 「values.px · values.krw 기준」을 구현한 방식).

## Known Stubs

없음.

## Self-Check: PASSED

- 커밋 865257ea · 44b9366a · e76c7d1c 존재 확인(`git log`).
- 스크린샷 사본 두 장이 quick 디렉터리 shots/ 에 있습니다.
- 기존 미추적 파일(.planning/milestone.lock · 다른 quick shots · .planning/research/.cache/)은 건드리지 않았습니다.
