---
phase: quick-261115-pkq
plan: 01
subsystem: webapp/ticks
tags: [refactor, typography, tick-viewer, ui-review]
status: complete
requires: []
provides:
  - "webapp/src/components/ticks/chart-typography.ts — CHART_TITLE_TEXT · CHART_BAND_TEXT · CHART_PILL_FONT_SIZE"
affects:
  - "틱뷰어 선 차트 · 봉 차트 (렌더 결과 변화 없음)"
tech-stack:
  added: []
  patterns:
    - "공유 Tailwind 클래스는 .ts 안 완전한 리터럴 상수 + 템플릿 리터럴 조립 (cn 으로 감싸지 않음 — tailwind-merge 충돌 회피)"
key-files:
  created:
    - webapp/src/components/ticks/chart-typography.ts
  modified:
    - webapp/src/components/ticks/tick-chart.tsx
    - webapp/src/components/ticks/candle-chart-title.tsx
    - webapp/src/components/ticks/tick-chart-band.tsx
    - webapp/src/components/ticks/candle-chart-band.tsx
    - webapp/src/components/ticks/candle-chart.tsx
decisions:
  - "선 · 봉 차트 공유 글자 값 3개를 chart-typography.ts 한 곳으로 모음 (Phase 42 UI-REVIEW 3번 해소 · 동작 변경 0)"
metrics:
  duration: "약 2분 (코드 편집 ~ 커밋 2개 82초)"
  completed: 2026-11-15
estimate:
  tokens: 40000
  tasks: 2
actuals:
  tokens: 2105
  tasks: 2
  commits: 2
plan_head_before: 9f87986c3e94743c8bd2fbe2caeaa9fd5ac4b3eb
plan_head_after: ecf6231054e550a53b2c7e1adf6257697f59a97f
---

# Quick 261115-pkq Plan 01: 틱뷰어 차트 공유 글자 상수 Summary

선 차트 · 봉 차트가 각자 다시 적어 두던 글자 값 3개(「타임라인」 제목 · 값 띠 루트 · 구간 칩 SVG 글자 크기)를 새 모듈 `chart-typography.ts` 의 상수로 모으고 6곳이 import 하게 했다. 렌더되는 클래스 문자열 · SVG 속성은 이전과 바이트 단위로 같다.

## ① 커밋

| 태스크 | 해시 | 메시지 | 파일 |
|---|---|---|---|
| 1 (tracer) | 96f15176 | refactor(quick-261115-pkq): 틱뷰어 「타임라인」 제목 글자를 선 · 봉 차트 공유 상수로 (동작 변경 0) | chart-typography.ts · tick-chart.tsx · candle-chart-title.tsx |
| 2 | ecf62310 | refactor(quick-261115-pkq): 틱뷰어 값 띠 · 구간 칩 글자 크기도 선 · 봉 차트 공유 상수로 (동작 변경 0) | chart-typography.ts · tick-chart-band.tsx · candle-chart-band.tsx · tick-chart.tsx · candle-chart.tsx |

두 커밋 합친 파일은 `webapp/src/components/ticks/` 아래 6개뿐 — `webapp/src/lib` · `webapp/src/hooks` · `__tests__` 변경 0. 삭제 파일 0.

## ② 상수 3개와 쓰는 곳 6곳

| 상수 | 값 | 쓰는 곳 (파일:줄) |
|---|---|---|
| `CHART_TITLE_TEXT` | `'text-[12.5px] font-bold'` | tick-chart.tsx:660 · candle-chart-title.tsx:74 — `` className={`m-0 ${CHART_TITLE_TEXT} text-[var(--fg)]`} `` |
| `CHART_BAND_TEXT` | `'text-[11.5px] leading-[14px]'` | tick-chart-band.tsx:74 · candle-chart-band.tsx:59 — cn 첫 인자 `` `grid border-b border-[var(--border-subtle)] ${CHART_BAND_TEXT} tabular-nums` `` |
| `CHART_PILL_FONT_SIZE` | `10.5` | tick-chart.tsx:1009 · candle-chart.tsx:880 — `fontSize={CHART_PILL_FONT_SIZE}` |

(candle-chart-band.tsx:16 머리 JSDoc 에 상수 이름을 한 구절로 적었다 — 계획 지시.)

## ③ 검증 결과 원문

- `npm --prefix webapp run typecheck` → `typecheck exit=0` (Task 1 · Task 2 둘 다)
- `npm --prefix webapp run test -- --maxWorkers=2 src/components/ticks/__tests__` (Task 1 · Task 2 둘 다):
  ```
   Test Files  23 passed (23)
        Tests  318 passed (318)
  ```
- 계획의 `<automated>` grep 검사 전부 통과(`GREP_OK`) — 옛 리터럴 0줄 · TickGroupBox 머리 `text-[11.5px] font-bold` 정확히 1줄 보존.

## ④ 손대지 않은 범위 밖

TickGroupBox 머리(`text-[11.5px] font-bold`) · 다른 카드 제목 · 확대 버튼 클래스(`btn` · BTN_DESKTOP/PHONE) · 구간 칩 폭 추정식(글자당 6.4 + 10) · 띠 안 Head/Kv/Rest 글자 · 보호 lib/hook 파일 · 테스트 파일은 그대로.

## ⑤ 파일 이름

`chart-type.ts` 는 같은 디렉터리 `chart-kind-switch.tsx` 의 「차트 종류」 나 TS 타입 모듈로 읽힐 수 있어, 글자 상수임이 드러나는 `chart-typography.ts` 로 했다.

## ⑥ 메인 세션 메모

push 하면 webapp 프로덕션 배포(Vercel)가 일어나지만 화면 변화는 0 이다. server · worker 배포 대상 없음. 이번 실행은 push · 배포하지 않았다.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: webapp/src/components/ticks/chart-typography.ts
- FOUND: 96f15176 (HEAD 조상)
- FOUND: ecf62310 (HEAD)
