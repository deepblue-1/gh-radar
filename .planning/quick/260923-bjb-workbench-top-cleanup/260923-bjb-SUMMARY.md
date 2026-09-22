---
phase: quick-260923-bjb
plan: 01
subsystem: webapp/trading-workbench
status: complete
tags: [ui, trading, workbench, vi, breakout, status-bar, container-query]
requires: []
provides:
  - "VI 한 패널 — 스트립 줄 · alert 슬롯(접혀도 보임) · 펼침 안 VI 설정(hidden 토글) · 주문 있을 때만 발동 표"
  - "ViServerErrorLine export (vi-settings-rows.tsx)"
  - "핵심만 남은 상태줄 (DMA · 77 배지 · 알림음 아이콘 · 반영 시각 · 다시 연결 · 단 수)"
  - "한 테두리 돌파 패널 — 라벨 「돌파」 · 머리줄 없는 표 · 빈 목록이면 펼친 영역 없음"
affects: [webapp /trading 작업대 상단]
tech-stack:
  added: []
  patterns:
    - "접힘 = hidden 속성(언마운트 아님) — 더티 입력 · 이탈 경고 합 보존"
    - "aria-controls 는 대상이 렌더될 때만"
key-files:
  created: []
  modified:
    - webapp/src/components/trading/workbench/vi-trigger-strip.tsx
    - webapp/src/components/trading/workbench/vi-settings-rows.tsx
    - webapp/src/components/trading/vi-order-list.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/workbench/workbench-status-bar.tsx
    - webapp/src/components/trading/workbench/breakout-strip.tsx
    - webapp/src/components/trading/__tests__/vi-trigger-strip.test.tsx
    - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
    - webapp/src/components/trading/__tests__/breakout-strip.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
decisions:
  - "D1: VI 설정은 VI 패널 펼침 본문 안에 hidden 으로 숨긴다(언마운트 아님) — 접었다 펴도 입력값 유지, 접힌 동안에도 이탈 경고의 VI 더티 합 유지"
  - "D1 재량: VI 서버 거부 경보(role=alert)는 설정 블록 밖, 스트립 줄 바로 아래 alert 슬롯 — 패널이 접혀 있어도 보인다(안전 신호 가시성)"
  - "돌파 더보기 aria-controls 는 표가 렌더될 때만 — 없는 id 를 가리키지 않는다(axe aria-valid-attr-value)"
  - "반영 시각은 보이는 글자 맨 HH:MM:SS, 「반영」 은 sr-only 접두 + title — generic span 에 aria-label 을 쓰지 않는다"
metrics:
  duration: "~40m"
  completed: 2026-09-23
estimate:
  tokens: 120000
  tasks: 3
actuals:
  tokens: 25365
  tasks: 3
  commits: 3
plan_head_before: 623b2a8e1e5796d182d1b181a041cbd0c9fe23ae
---

# Phase quick-260923-bjb Plan 01: 작업대 상단 정리 Summary

VI 설정(KRX·NXT)을 VI 패널 「더보기」 펼침 안 거래소당 한 줄로 옮기고(본문 830 이상은 KRX | NXT 2열), 상태줄은 DMA · 77 배지 · 알림음 아이콘 · 반영 시각 · 단 수만 남기고, 펼친 VI·돌파 목록의 머리줄 · 요약 · 설명문 · 라벨 개수를 지웠다. 승인 목업 `260923-bjb-mockup.html` 과 일치하며, 동작(확인 체크 · 110초 · 다이얼로그 · vi.set · 계좌 옮기기 · 알림음 · localStorage)은 바뀌지 않았다.

## Commits

| Task | Commit | 내용 |
|------|--------|------|
| 1 (tracer) | 25cc409 | VI 한 패널 — 스트립 줄 · alert 슬롯 · hidden 펼침 안 한 줄 설정 · 머리줄/설명문 제거 · 작업대 배선 |
| 2 | c3edd46 | 상태줄 핵심만 · 돌파 패널 머리줄/개수/신규 필 제거 · 작업대 개수 배선 삭제 |
| 3 | 0b06230 | e2e 갱신(openViPanel) + 390 한 줄 · 1000 나란히 레이아웃 단언 |

## Test Results

- **vitest (webapp 전체):** 92 files · 1467 passed · 1 skipped (선재 skip) · 0 failed
  - 대상 6파일: vi-trigger-strip 25 · vi-settings-rows 68 · vi-order-list 34 · trading-workbench 75(Task 2 후 동일 파일 green) · workbench-status-bar 19 · breakout-strip 32 — 전부 pass
- **typecheck:** `tsc --noEmit && tsc -p tsconfig.e2e.json` green
- **eslint:** touched 소스 6개 clean
- **playwright `trading-workbench a11y`:** 45 passed · 0 failed · 0 skipped (setup 1 + a11y 8 + trading-workbench 36, 신규 28b 포함, 1.7m)
- **negative grep:** `VI_WORKBENCH_TABLE_CAPTION` · `flex-[1_1_100%]`(vi-settings-rows) · `WORKBENCH_THRESHOLD_TEXT|onCountsChange|breakoutNewCount|viUnconfirmedCount|breakoutCounts` (src) · `stat-(breakout|vi|cards)|vi-order-caption` (e2e spec) — 전부 0건

## 넘침 실측 (실브라우저 · VI·돌파 패널 펼침)

| 뷰포트 | 본문(wb) | vi-settings-rows sw/cw | KRX 줄 | NXT 줄 | 상태줄 sw/cw | 문서 sw/cw |
|--------|---------|------------------------|--------|--------|--------------|-----------|
| 390 | 374 | 352 / 352 (넘침 없음) | 352×28 @y210 | 352×28 @y244 (쌓임) | 372 / 372, 높이 38(한 줄) | 390 / 390 |
| 1000 | 968 | 946 / 946 (넘침 없음) | 465×28 @x27,y218 | 448×28 @x525,y218 (나란히) | 966 / 966 | 1000 / 1000 |
| 390 더티(「수정」) | — | 352 / 352 | 352×62 (「수정」 이 줄 안에서 둘째 줄로 접힘, 넘침 없음) | — | — | — |
| 1000 더티 | — | 946 / 946 | 465×28 (한 줄 유지) | — | — | — |

라이트·다크 수치 동일. VI 패널 · 돌파 패널 컨테이너 모두 scrollWidth = clientWidth (표는 기존 계약대로 내부 table-container 가로 스크롤).

## 스크린샷 (커밋하지 않음)

`/private/tmp/claude-501/-Users-alex-repos-gh-radar/859e0909-ebce-44d2-9d01-d695f16e2013/scratchpad/shots/`
- bjb-light-390.png · bjb-dark-390.png · bjb-light-1000.png · bjb-dark-1000.png (제목줄 ~ 종목 추가란, VI·돌파 펼침)
- bjb-{light,dark}-{390,1000}-dirty.png (KRX 상승률 더티 → 「수정」)

관찰: 목업 ①②③ 과 일치 — 상태줄 「● DMA 실시간 · [음소거 아이콘] · HH:MM:SS · (1000) 1단/2단/3단」, VI 패널 한 테두리 안 스트립 줄 → 설정 줄(390 쌓임 / 1000 KRX | NXT 세로 구분선) → 표(머리줄·설명문 없음), 돌파 패널 라벨 「돌파」 · 머리줄 없는 표. 줄바꿈 · 잘림 · 겹침 없음. NXT 줄은 스텁이 KRX 전략만 시딩해 미조회(잠금) 상태라 흐리게 보이는 것이 정상. 390 더티에서 「수정」 은 줄 안에서 둘째 줄 오른쪽으로 접힌다(계획 D2 가 허용한 wrap — 넘침 0).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 에서 「상태줄 카운터」 테스트의 VI 라벨 기대값을 먼저 고침**
- **Found during:** Task 1 verify (trading-workbench.test green 요구)
- **Issue:** 계획은 상태줄 카운터 describe 를 Task 2 몫으로 두었으나, Task 1 의 라벨 변경(「VI 1」→「VI」)으로 같은 테스트의 라벨 단언이 Task 1 에서 깨짐
- **Fix:** Task 1 에서는 `vi-strip-label` 기대값 한 줄만 「VI」 로 바꾸고, describe 전체 대체는 계획대로 Task 2 에서 수행
- **Commit:** 25cc409

**2. [Rule 1 - Bug] e2e 26 이 빈 목록에서 `openViTable` 을 불러 표 대기가 실패할 경로 수정**
- **Found during:** Task 3
- **Issue:** 26 은 주문 0건에서 표를 먼저 연 뒤 72 를 밀어 넣는다. 이제 빈 목록이면 표를 그리지 않으므로 `vi-trigger-table` visible 대기가 실패한다
- **Fix:** 26 은 `openViPanel` 만 부르고, 72 도착 후 데드라인 locator 의 15초 대기로 표 등장을 기다린다
- **Commit:** 0b06230

**3. [추가 테스트] 계획 behavior 밖 보강 단언**
- trading-workbench.test: 「VI 설정 더티는 패널을 접어도 남는다」 describe 신설(이탈 경고 confirm 호출 + 같은 input 노드 · 값 유지) — 기존 이탈 경고 테스트는 카드 더티만 다뤄 VI 경로가 없었음
- workbench-status-bar.test: 「다시 연결」 onReconnect 클릭 단언 추가

### 기타

- 프로토콜의 pre-commit 보호 브랜치 가드(master 커밋 금지)는 오케스트레이터의 명시 지시(메인 작업 트리 · 순차 · 태스크별 커밋)와 이 프로젝트의 quick 커밋 관례(master 직접 커밋)에 따라 적용하지 않았다. push 는 하지 않았다.
- RowSwitch 크기(44×26)는 계획대로 유지했다(목업 `.sw` 는 40×24 이지만 계획이 변경을 지시하지 않았고 터치 타깃 규율이 있음).

## Threat Surface

T-bjb-01(경보 가시성): alert 슬롯 — trading-workbench.test 「hidden 조상 없음」 + e2e 15·27(펼치지 않고 경보 기대) green. T-bjb-02(실돈 설정): 송신·확인·계좌 코드 무변경, hidden 접힘으로 더티·이탈 경고 보존(신규 단위 테스트). 새 보안 표면 없음.

## Known Stubs

없음.

## Self-Check: PASSED

- 수정 파일 12개 존재, 커밋 25cc409 · c3edd46 · 0b06230 이 `git log` 에 있음, `git rev-list --count 623b2a8..HEAD` = 3.
