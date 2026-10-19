---
phase: quick-261019-j1w
plan: 01
subsystem: relay-generated · shared · webapp(trading workbench)
tags: [accum-signal, kind16, sell-warn, flatbuffers, workbench]
status: complete
requires:
  - quick-261018-rfy (kind 16 매집감지 수용 · 「매집」 패널)
provides:
  - AccumSignal.sellWarn · sellWarns (kind 16 hasRemaining · condMetric)
  - 작업대 「매집」 패널 「매도경보」 배지(data-slot accum-warn)
  - relay 생성물 88/89 AccumSignal sellWarn() · sellWarns() · dayAvgPx()
affects:
  - webapp /trading 작업대
tech-stack:
  added: []
  patterns:
    - "Tailwind v4 @utility 로 깜빡임 유틸 — 유틸리티 레이어라 motion-reduce:animate-none 이 이긴다(컴파일 실측)"
key-files:
  created: []
  modified:
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/accum-signal.ts
    - packages/shared/src/accum-signal.ts
    - packages/shared/src/strategy-event.ts
    - packages/shared/src/__tests__/accum-signal.test.ts
    - webapp/src/components/trading/workbench/accum-strip.tsx
    - webapp/src/styles/globals.css
    - webapp/src/styles/__tests__/tds-tokens.test.ts
    - webapp/src/components/trading/__tests__/accum-strip.test.tsx
    - webapp/src/lib/__tests__/accum-list.test.ts
    - webapp/src/lib/__tests__/use-accum-signals.test.tsx
    - docs/inbox/from-gh-trade/261019-accum-sell-warn.md
    - docs/inbox/from-gh-trade/261019-accum-day-avg-px.md
    - .planning/STATE.md
decisions:
  - "매도경보 배지 글자색은 새 토큰 --accum-warn-fg(라이트 #ffffff 5.2:1 · 다크 #111111 9.2:1) — CONTEXT D-01 이 플랜의 text-[#111] 을 대체"
  - "경보 표시 조건은 showsWarn(state === 1 && sellWarn) 하나로 배지 · 칩 title 이 공유"
metrics:
  duration: "~25분"
  completed: 2026-10-19
actuals:
  tokens: 9300
  tasks: 3
  commits: 6
plan_head_before: f577d2583884a46323b01db81eabf38a1d75bf08
plan_head_after: 1514bfcf7e78cf6cb8dcdb6b64c88ea263c1b556
---

# Quick 261019-j1w: 매집감지 매도 조기 경보 · 오늘 매수 평단 수용 Summary

gh-trade 776320af 기준 relay 생성물을 재생성하고(sellWarn · sellWarns · dayAvgPx 접근자), shared `accumSignalOf` 에 kind 16 (나) 재해석(hasRemaining → sellWarn · condMetric → sellWarns · 행 종류 5 통과)을 넣었다. `/trading` 작업대 「매집」 패널의 매집중 종목에는 주황 채움 「매도경보」 배지가 1초 주기로 깜빡인다(목업 A).

## 커밋

| 태스크 | 커밋 | 내용 |
|---|---|---|
| 1 | e3f512af | chore: relay 스키마 재생성 — gh-trade 776320af (relay/src/generated 2파일만) |
| 1 | ee276e93 | test(RED): kind 16 sellWarn · sellWarns · 행 종류 5 매핑 단언 |
| 1 | f04a159d | feat(GREEN): shared kind 16 매도 경보 — sellWarn · sellWarns · 행 종류 5 |
| 2 | dd081406 | test(RED): 매도경보 배지 · 라이브 에지 행 5 · fixture 두 필드 · --accum-warn-fg 토큰 |
| 2 | 2021cd24 | feat(GREEN): 「매집」 패널 주황 「매도경보」 배지 — 목업 A · 1초 깜빡임 · 횟수 title (= done_commit) |
| 3 | 1514bfcf | docs: 인박스 261019 노트 2건 회신 · done · STATE.md quick 행 |

## 검증

- 재생성 뒤 `sync-relay-schema.sh --check`: 신규/변경 0 · 삭제 없음 · .fbs 사본 최신. `relay typecheck` 통과.
- shared `accum-signal.test.ts` 13/13 통과(RED 때 5 실패 확인) · shared build · typecheck 통과.
- webapp vitest 5파일(accum-strip · accum-list · use-accum-signals · trading-workbench · tds-tokens) 276/276 통과(RED 때 accum-strip 2 · tds-tokens 4 실패 확인) · `--maxWorkers=2`.
- webapp typecheck(tsc + e2e tsconfig) · eslint(변경 5파일) 통과.
- Tailwind 4.2.2 컴파일 실측: `.accum-blink` 다음에 `.motion-reduce:animate-none` 가 유틸리티 레이어 안에 생성된다 — 동작 줄이기에서 정적이다.
- Task 3 automated verify 전 항목 통과(done_commit 일치 · 공동 저자 줄 없음 · relay 생성물 밖 무변경 · accum-list.ts · use-accum-signals.ts · teamflow-detail.tsx 무변경).
- playwright e2e 미실행(지시대로).

## Deviations from Plan

**1. [CONTEXT 우선] 배지 글자색 `text-[#111]` → `text-[var(--accum-warn-fg)]`**
- 플랜은 #111 고정이었으나 CONTEXT D-01(플랜 작성 뒤 메인 세션 결정)이 새 토큰으로 바꿨다. globals.css `:root` #ffffff · `.dark` #111111, tds-tokens.test.ts 의 라이트 · 다크 기대값과 THEME_COLOR_TOKENS 에 항목을 더했다. tds-tokens.test.ts 는 플랜 files 목록 밖이지만 CONTEXT 가 지정했다.
- 대비: 라이트 #ffffff on #c2410c ≈ 5.2:1 · 다크 #111111 on #ff9f43 ≈ 9.2:1(둘 다 AA). 이전 플랜 안의 라이트 #111 은 ≈ 3.6:1 이었다.

**2. 표시 조건 헬퍼 `showsWarn`** — WarnBadge 와 chipTitle 이 같은 조건(state 1 && sellWarn)을 쓰도록 작은 함수로 묶었다(동작 동일).

**3. use-accum-signals 훅 테스트는 RED 단계에서 이미 통과** — 훅 로직은 바뀌지 않았고 shared 매핑(Task 1)이 먼저 들어갔기 때문이다. 회귀 잠금 용도이므로 그대로 두었다.

## 메모

- 칩 폭(max-w 18rem): 경보 · 이월 · 「신규」 가 동시에 붙으면 이름이 `truncate` 로 더 줄어든다(이름 칸만 min-w-0). 겹침이나 넘침은 없다.
- 배포 메모: webapp push 만 하면 된다. relay 재배포는 필요 없다(88 미사용 · 생성물만). DB 마이그레이션도 없다. gh-trade 서버가 먼저 나가도 안전하다 — 지금 웹은 hasRemaining false · condMetric 0 을 경보 꺼짐으로 읽고, 행 종류 5 는 그대로 통과한다.

## Known Stubs

없음.

## Self-Check: PASSED

- 수정 파일 14개 존재 · 커밋 6건(e3f512af · ee276e93 · f04a159d · dd081406 · 2021cd24 · 1514bfcf) 모두 HEAD 조상.
