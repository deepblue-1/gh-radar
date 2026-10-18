---
phase: quick-261018-rfy
plan: 01
status: complete
subsystem: dma-strategy-events · trading-workbench
tags: [kind-16, accum-signal, 매집감지, gh-trade-inbox, supabase-rpc, workbench-panel]
requires:
  - relay 생성물 04dc1b7a (StockDMA AccumSignal 88/89 · kind 16)
provides:
  - shared STRATEGY_EVENT_KIND.AccumSignal · accumSignalOf · 시세 집합 {1,2,10,15,16}
  - dma_accum_signals_for_user_json RPC · GET /api/accum-signals
  - relay 리듀서 accumSignalEvents 별도 목록 · useAccumSignals · AccumStrip
affects:
  - 주문로그 jsonb 래퍼(kind 16 제외) · purge RPC(15·16) · relay WsFanout(shared 판정 import — 재빌드 필요)
tech-stack:
  added: []
  patterns:
    - kind 별 별도 목록(15 선례 복제) · 복원 ∪ 라이브 병합(use-order-log-feed 축소판)
    - 렌더 안 순수 계산 + 레이아웃 effect 커밋(돌파 ⑧) · DISTINCT ON + LEFT JOIN dma_servers 로 quote-primary 우선
key-files:
  created:
    - packages/shared/src/accum-signal.ts
    - supabase/migrations/20261018120000_dma_strategy_events_accum_signal.sql
    - supabase/tests/dma_strategy_accum_signal.test.sql
    - server/src/routes/accum-signals.ts
    - webapp/src/lib/accum-signals-api.ts
    - webapp/src/lib/accum-list.ts
    - webapp/src/lib/use-accum-signals.ts
    - webapp/src/components/trading/workbench/accum-strip.tsx
  modified:
    - packages/shared/src/strategy-event.ts
    - packages/shared/src/strategy-event-labels.ts
    - packages/shared/src/index.ts
    - server/src/services/dma-orders.ts
    - server/src/app.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/trading-layout.ts
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/styles/globals.css
    - docs/inbox/from-gh-trade/261018-accum-signal.md
    - .planning/STATE.md
decisions:
  - "매집 패널 onAddCard 는 이름을 모르면 이름만 undefined, 코드는 행의 stocks 조인 값을 그대로 싣는다(돌파 ⑥ 은 이름 · 코드 둘 다 뺐지만 kind 16 코드는 DB 조인이라 신뢰 가능)"
  - "청산(state 3) 행의 펼친 표 액션은 ✕ 만 — 「추가」 없음(목업 A 그대로). 행 클릭은 다른 행과 같은 activate"
  - "새 CSS 토큰은 계획 값 그대로 — 라이트 대비 --accum-sell 4.77:1 · --accum-carry 4.67:1 로 AA 통과"
metrics:
  duration: 15m
  completed: 2026-10-18
actuals:
  tokens: 36000
  tasks: 3
  commits: 5
plan_head_before: 04dc1b7a9df367b5f9abb95e628f0235216e89d4
plan_head_after: 52a5900c27f6747135da4d2b9d19894a6a913309
---

# Quick 261018-rfy: 매집감지(kind 16 AccumSignal) gh-radar 수용 Summary

gh-trade Phase 34 kind 16 을 shared 시세 집합 · 조회/purge RPC · isin 별 최신(같은 분 quote-primary 우선) 읽기 RPC · `GET /api/accum-signals` · 웹 리듀서 별도 목록 · 복원 훅을 거쳐 `/trading` 작업대 「매집」 패널(돌파 동형 칩 + 10열 표)까지 잇고, 주문로그에는 한 줄도 섞지 않는다.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 RED | 34ebe695 | shared accumSignalOf · 시세 집합 · 라벨 · server supertest · pgTAP 26단언 |
| 1 GREEN | 4e1049e4 | shared kind 16 · 마이그레이션 · /api/accum-signals · 웹 REST 클라 |
| 2 RED | ba705002 | 리듀서 kind 16 describe · accum-list · use-accum-signals · accum-strip · 토큰 · 작업대 배치 |
| 2 GREEN | 89947e7f | 리듀서 세 갈래 · 복원 훅 · 순수 함수 · AccumStrip · 작업대 배치 · CSS 토큰 (done_commit) |
| 3 | 52a5900c | 인박스 노트 status: done · 회신 절 · STATE.md quick 행 |

## 테스트 (모두 `--maxWorkers=2` · playwright 미실행)

- shared 전체 22파일 655 통과(accum-signal 9 · strategy-event-text · labels 갱신 포함) · build · typecheck 통과.
- server `accum-signals.test.ts` ①~⑦ + `strategy-events.test.ts` = 15 통과 · typecheck 통과.
- relay `journal-push.test.ts` 16 통과(relay 코드 무변경 회귀).
- **pgTAP 실행함**(로컬 일회용 컨테이너 · 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` 를 로컬에 pull 한 뒤): `dma_strategy_accum_signal` 26/26 · `dma_strategy_limit_feature` 24/24 · `dma_strategy_read` 28/28 — not ok 0.
- webapp 8파일 498 통과(accum-list · use-accum-signals · relay-socket · use-order-log-feed · accum-strip · breakout-strip · trading-workbench · tds-tokens) + 회귀 trading-layout · order-log-feed · order-log 패널 6파일 110 · relay-provider 42 통과. typecheck 통과 · eslint 새 파일 0 오류(작업대 · use-relay-socket 의 기존 경고 2건은 범위 밖).

## 새 CSS 토큰 최종 값

| 토큰 | 라이트 | 다크 |
|------|--------|------|
| `--accum-sell` | `#c2410c` | `#ff9f43` |
| `--accum-sell-bg` | `#fff4e6` | `rgba(255, 159, 67, 0.16)` |
| `--accum-carry` | `#a16207` | `#ffd43b` |
| `--accum-carry-bg` | `#fef9e7` | `rgba(255, 212, 59, 0.16)` |

라이트 글자/면 대비 4.77:1 · 4.67:1(AA) — 조정 없음.

## 배포 메모 (메인 세션 몫 — 이 quick 은 배포 · push 하지 않았다)

DB `supabase db push --linked --yes`(마이그레이션 20261018120000) → **relay 재빌드 배포**(relay 코드는 무변경이지만 `WsFanout` 이 shared `isMarketStrategyEvent` 를 import 하므로 재빌드해야 kind 16 이 시세 이벤트로 팬아웃된다) → server(`/api/accum-signals`) → webapp push.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 라벨 전수 표 단언 갱신**
- **Found during:** Task 1 GREEN
- **Issue:** `strategy-event-labels.test.ts` 의 「표시명 표 전수」 toEqual 이 16 을 몰라 실패.
- **Fix:** 기대 표에 `16: "매집감지"` 를 더하고 제목에 16 을 적었다(계획 파일 안).
- **Commit:** 4e1049e4

**2. [Rule 2 - 정확성] 매집 칩 onAddCard 에 코드 전달**
- **Found during:** Task 2 GREEN(작업대 통합 테스트)
- **Issue:** 돌파 ⑥ 규칙을 그대로 옮기면 relay 라벨에 이름이 없는 종목은 코드도 빠져 카드의 종목정보가 비었다. kind 16 코드는 DB `stocks` 조인 값이라 신뢰할 수 있다.
- **Fix:** 이름만 모르면 undefined, 코드는 행 값(없으면 relay 라벨) 그대로 싣는다. 컴포넌트 머리 주석 ⑥ 에 기록.
- **Commit:** 89947e7f

**3. [Rule 3 - 블로킹] pgTAP 러너 이미지 로컬 준비**
- 러너가 로컬 이미지만 쓰는데 이미지가 없어 `docker pull` 로 준비했다(메모리 「로컬 준비는 직접」). 원격 DB 접촉 0.

그 밖에 `useAccumSignals` 는 병합 뒤 kind 16 만 남기고 최신을 고른다(비-16 행이 같은 isin 의 최신으로 끼어드는 것 방지 — 방어적 거름).

## Known Stubs

없음.

## Self-Check: PASSED

- 생성 파일 8개 존재 · 커밋 5개(34ebe695 · 4e1049e4 · ba705002 · 89947e7f · 52a5900c) HEAD 조상 확인.
- relay/ · teamflow-detail.tsx 무변경 · Co-Authored-By 0 (Task 3 verify 통과).
