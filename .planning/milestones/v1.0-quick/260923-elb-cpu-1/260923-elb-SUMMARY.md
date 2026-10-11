---
phase: quick-260923-elb
plan: 01
status: complete
subsystem: webapp /trading 작업대 (relay 연결 훅 · 상따 사다리 · 체결 테이프 · 돌파 스트립)
tags: [perf, react, relay, trading, cpu]
requires: []
provides:
  - RELAY_MARKET_BATCH_MS / RELAY_MARKET_BUFFER_MAX (q/tape 100ms 배치)
  - TAPE_RENDER_WINDOW / tapeRowKeys / memo TradeTape
  - BREAKOUT_PRICE_THROTTLE_MS / useBreakoutQuotes().prices / advanceTracked
affects: [webapp/src/lib/use-relay-socket.ts, webapp/src/components/orderbook/*, webapp/src/components/trading/workbench/breakout-strip.tsx, webapp/src/lib/use-breakout-quotes.ts]
tech-stack:
  added: []
  patterns:
    - "시장 프레임 배치: effect 범위 버퍼 + 타이머, 비시장 프레임은 대기분과 같은 dispatch"
    - "copy-on-write 순차 병합 리듀서 액션(frames)"
    - "내용 키 + 오래된 쪽부터 센 중복 서수 행 키"
    - "렌더 중 setState 대신 커밋 기록 ref + useMemo 순수 한 걸음 + useLayoutEffect"
key-files:
  created: []
  modified:
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/lib/__tests__/relay-provider.test.tsx
    - webapp/src/components/orderbook/trade-tape.tsx
    - webapp/src/components/orderbook/orderbook-ladder.tsx
    - webapp/src/components/orderbook/__tests__/trade-tape.test.tsx
    - webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx
    - webapp/src/lib/use-breakout-quotes.ts
    - webapp/src/components/trading/workbench/breakout-strip.tsx
    - webapp/src/lib/__tests__/use-breakout-quotes.test.tsx
    - webapp/src/components/trading/__tests__/breakout-strip.test.tsx
decisions:
  - "q/tape 만 100ms 타이머 배치(rAF 아님 — 숨은 탭에서 멈춤), 버퍼 1000 도달 시 즉시 flush"
  - "같은 종목 q 를 버퍼에서 뭉개지 않고 한 액션 안 순차 병합 — 1건씩 적용한 결과와 동치"
  - "clockStamp 는 msg 프레임에서만 계산"
  - "compact 체결 테이프는 트리 밖 1벌(@min-[830px]/lc:hidden) — JS 폭 판정 없음"
  - "테이프 행 키 = entryKey + 중복 서수(배열 끝부터), 고정 중 렌더 창 50행, 행 className 상수"
  - "돌파 가격은 후보 ISIN 전체의 KRX prices 를 500ms 절대 마감 스로틀로만 노출(원시 맵 비노출)"
  - "BreakoutStrip 추적 상태는 advanceTracked 순수 함수 + 커밋 기록 ref(useLayoutEffect)"
metrics:
  duration: "약 36분 (2026-09-23T01:47Z ~ 02:24Z)"
  completed: 2026-09-23
  tasks: 3
  files: 11
actuals:
  tokens: 21400   # chars/4 over webapp/src 실현 diff(85,495 chars)
  tasks: 3
  commits: 3
plan_head_before: 85d77f06e3edebf64bada49fafc423b18273b006
---

# Phase quick-260923-elb Plan 01: /trading CPU 1단계 (1a · 3a · 2a) Summary

시세·체결 프레임 100ms 배치, 상따 compact 테이프 1벌 통합과 체결 식별 행 키·렌더 창, 돌파 칩 가격 2Hz 스로틀을 적용했다. 그 결과 최악 시나리오(3카드 + 돌파40 · 도착 분산)의 메인스레드 점유가 99%에서 14%로, renderer CPU는 약 121%에서 24%로 내려갔다.

## 기준점과 커밋

- **BASE_SHA:** `85d77f06e3edebf64bada49fafc423b18273b006` (Task 1 착수 직전 HEAD · 「전」 측정 기준점)

| Task | 커밋 | 내용 |
|------|------|------|
| 1 (tracer · 1a) | `79ac3f9` | perf(quick-260923-elb): 시세·체결 프레임을 100ms 모아 한 번에 적용하고 알림 시각은 msg 에만 찍는다 |
| 2 (3a) | `59bd549` | perf(quick-260923-elb): 상따 사다리의 체결 테이프를 트리 밖 1벌로 합치고 행 키·memo·렌더 창으로 커밋 비용을 줄인다 |
| 3 (2a) | `62d8a77` | perf(quick-260923-elb): 돌파 칩 가격 갱신을 초당 2회로 묶고 렌더 중 상태 갱신을 없앤다 |

push 는 하지 않았다. Co-Authored-By 는 넣지 않았다. stage 는 명시 경로로만 했다. 동시 세션의 `relay/src/generated/*` 미커밋 변경과 미추적 quick 디렉터리는 건드리지 않았다.

## 설계 선택

- **1a:** `RELAY_MARKET_BATCH_MS = 100` · `RELAY_MARKET_BUFFER_MAX = 1000`.
  - 버퍼와 타이머는 연결 effect 범위에 둔다(연결 수명 = 버퍼 수명).
  - 리듀서의 `frame` 액션은 `frames{market, frame, at}` 한 경로로 교체했다. `applyMarketFrames` 는 도착 순 순차 병합이고, Map 복사는 액션당 최대 1회(copy-on-write)다.
  - 비시장 프레임(알 수 없는 `t` 포함)은 대기분을 떼어 같은 dispatch 로 즉시 적용한다. `onclose` 는 맨 앞에서 flush 해 stale 전이보다 먼저 온다. cleanup 은 `disposed = true` 직후 flush 한다.
  - `clockStamp` 는 msg 에서만 부른다. 헤더 규율 8 을 추가했다. `relay-provider.tsx` 와 반환 `useMemo` 는 무수정이다.
- **3a:**
  - `ChaserLadder` 2단·1단 트리의 hr + compact TradeTape 두 벌을 지웠다. 대신 1단 트리 뒤 루트의 마지막 자식으로 `data-slot="ladder-tape"` · `@min-[830px]/lc:hidden` 블록 1벌을 둔다.
  - `TradeTape`: `TAPE_RENDER_WINDOW = 50`(고정 중에만 · 스크롤을 내리면 전부) · `tapeRowKeys`(entryKey + `#n` 서수, 배열 끝부터) · memo `TapeRow` · 행·셀 className 은 같은 `cn()` 인자로 모듈 로드 시 1회 계산한 상수 · `sides` 는 전체 rows 로 계산 · `export const TradeTape = memo(TradeTapeImpl)`.
  - 배치 플래시 메커니즘은 바꾸지 않았다.
- **2a:**
  - `BREAKOUT_PRICE_THROTTLE_MS = 500`.
  - `useBreakoutQuotes` 는 `quotes` 대신 `prices`(후보 ISIN 전체 · 알려진 KRX 가격만)를 반환한다. 첫 렌더 동기 초기화 · 마감은 절대 시각(마지막 적용 + 500) · 타이머는 최신 입력 ref 를 읽는다(마지막 값 도착) · 값이 같으면 신원을 유지한다.
  - `pickWithinBudget` 은 useMemo 로 감쌌다. 구독 diff effect 는 무수정이다.
  - `BreakoutStrip`: 렌더 중 `setTracked` 블록을 모듈 순수 함수 `advanceTracked` 로 옮겼다. 커밋 기록 ref(초기값은 옛 useState 초기값) · `candidates` addedAt 폴백 `Number.MAX_SAFE_INTEGER` · `tracked = useMemo(...)` · `useLayoutEffect` 로 ref 를 갱신한다.
  - `views`/`activate`/`dismiss` 는 메모이즈했고, `BreakoutChip`·`BreakoutTable` 은 memo 다. 헤더 ⑧ 을 추가했다.

## RED 관측 (구현 전)

- Task 1: relay-socket 새 describe 9건이 실패했다(ⓐ · ⓑ×6 · ⓔ · ⓕ). ⓒ·ⓓ·ⓓ-2 는 옛 구현에서도 통과한다(close/cleanup 경로 회귀 잠금용).
- Task 2: 8건이 실패했다 — trade-tape ⑤(렌더 창) · tapeRowKeys 2건 · DOM 재사용 1건 · ladder-chaser ⑦ · ⑧ · ⑪ · ⑰f.
- Task 3: 7건이 실패했다 — use-breakout-quotes 새 계약 6건(원시 맵 비노출 · 첫 렌더 prices · excludeIsins 가격 · THROTTLE−1 · 5회→1회 · 굶지 않음) · breakout-strip 스로틀 표시 1건.

## 테스트 결과

| 게이트 | 결과 |
|--------|------|
| Task 1 vitest (relay-socket + relay-provider) | 92 passed |
| Task 2 vitest (src/components/orderbook + src/components/trading) | 826 passed (30 files) |
| Task 3 vitest (use-breakout-quotes + breakout-strip) | 49 passed |
| **webapp 전체 vitest** | **1510 passed · 1 skipped · 0 failed** (92 files · 기준선 1487 + 23 신규) |
| typecheck (src + e2e) | exit 0 (Task 마다) |
| eslint (touched src 5파일 + 테스트) | exit 0 · 경고 1건은 기존 코드(`use-relay-socket.ts` cleanup 의 `wireSubsRef.current`, BASE 에도 있음) |
| Playwright Task 1: trading-workbench + orderbook | 49 passed |
| Playwright Task 2: orderbook + trading-workbench + a11y | 57 passed (a11y ⑤-b 무수정 통과) |
| Playwright Task 3: trading-workbench + a11y + orderbook + sidebar-tree | 64 passed |

Playwright 는 매번 3100·8090 이 비어 있는 것을 확인한 뒤 돌렸다(재사용 서버 없음 · Playwright 가 이 트리의 dev 서버를 직접 띄움). 끝난 뒤 두 포트가 비어 있음도 확인했다. e2e 스펙 수정은 필요 없었다.

**무수정 통과(동작 불변 증거):** relay-socket ⑧·⑫·⑭ · relay-provider ⑦ · trade-tape 플래시/핀/색/sr-only/compact/colgroup/빈 상태 · breakout-strip 무음/76 강조/알림 「기록 먼저 · 재생 나중」/돌파시각 첫 값/되살림/현재가 표시 · use-breakout-quotes 구독 diff·상한 40·언마운트 해제.

## 갱신한 기존 테스트와 이유

- relay-socket ⑤ · ⑤-a · ⑬ · ⑬-a, relay-provider ⑤ · ⑤-a: 단언 앞에 `flushMarket()` 를 넣었다. 관측 계약이 「시세 반영 ≤100ms 뒤」로 바뀌었기 때문이다. 단언 본문은 그대로다.
- trade-tape ⑤: 고정 중에는 `TAPE_RENDER_WINDOW`+헤더 행이고, 스크롤을 내리면 201행이다(렌더 창이라는 새 계약 · 링버퍼 200 은 유지).
- orderbook-ladder-chaser ⑦(tabbables 4 → 3, 순서 `ladder-scroll-two · ladder-scroll · tape-scroll`) · ⑧(compact 테이프 1 · hr 1 · 트리 밖 · `ladder-tape` 830 hidden · 1단 트리 뒤) · ⑪(10px 총계 90 → 80) · ⑰f(테이프는 두 박스 밖 · 모든 트리 밖): 테이프를 1벌로 합쳤기 때문이다.
- use-breakout-quotes 「quotes 는 컨텍스트 맵을 그대로」: `prices` 계약(원시 맵 비노출)으로 교체했다.
- breakout-strip 이탈 대조군: `update({})` 뒤에 스로틀 창 진행 1줄만 추가했다. 단언은 그대로다.

## perf 하니스 전후 측정

같은 MacBook Air, 같은 세션에서 연달아 쟀다. prod 빌드(`next build` + `next start -p 3190`) · 실 relay `:8190` · 스텁 supabase/api `:54399` · chromium headless 1440×1000 · q 10Hz + tape 5Hz/종목 · 10초 창 · 시나리오당 2회. 「전」 = BASE `85d77f0`, 「후」 = `62d8a77`. 둘 다 렌더 probe 로 계측했다(「후」는 TradeTape probe 대상이 `TradeTapeImpl`). 원자료는 scratchpad `perf/elb-before.jsonl` · `perf/elb-after.jsonl` 에 있다.

| 시나리오 | 빌드 | main% | renderer% | commits/s | DOM | StrategyCard/s | TradeTape/s | BreakoutStrip/s | AppSidebar/s (≈컨텍스트 갱신/s) |
|---|---|---|---|---|---|---|---|---|---|
| S1 cards3 버스트 | 전 | 33.7 / 33.7 | 43.3 / 43.5 | 43.8 / 42.4 | 17,122 / 17,137 | 90.3 / 87.9 | 222.3 / 212.1 | 30.1 / 29.3 | 30.1 / 29.3 |
| S1 cards3 버스트 | **후** | **13.9 / 14.0** | **21.5 / 21.6** | 17.9 / 17.2 | **6,818 / 6,644** | 20.9 / 20.6 | 45.9 / 45.7 | 7.0 / 6.9 | 7.0 / 6.9 |
| S2 cards3+돌파40 버스트 | 전 | 40.3 / 45.9 | 52.1 / 58.0 | 50.0 / 48.8 | 17,152 / 17,151 | 119.4 / 117.8 | 269.8 / 264.3 | 57.7 / 57.3 | 39.8 / 39.3 |
| S2 cards3+돌파40 버스트 | **후** | **14.7 / 13.1** | **24.8 / 23.0** | 18.4 / 19.3 | 6,508 / 6,569 | 22.4 / 21.5 | 45.1 / 47.0 | 9.5 / 9.2 | 7.5 / 7.2 |
| S3 cards3+돌파40 분산100 | 전 | 99.2 / 99.0 | 122.5 / 120.1 | 154.3 / 135.8 | 17,067 / 17,084 | 462.1 / 407.5 | 925.1 / 815.0 | 305.2 / 271.5 | 154.0 / 135.8 |
| S3 cards3+돌파40 분산100 | **후** | **14.0 / 14.5** | **23.1 / 24.4** | 20.0 / 20.4 | 6,688 / 6,778 | 27.8 / 27.8 | 48.1 / 48.1 | 11.3 / 11.3 | 9.3 / 9.3 |
| S4 cards3 COLS=3 버스트 | 전 | 45.1 / 48.8 | 57.9 / 63.5 | 44.0 / 43.5 | 17,137 / 17,197 | 89.1 / 87.6 | 215.0 / 215.9 | 29.7 / 29.2 | 29.7 / 29.2 |
| S4 cards3 COLS=3 버스트 | **후** | **22.0 / 20.3** | **32.0 / 29.9** | 18.5 / 16.5 | 6,824 / 6,584 | 20.6 / 20.3 | 46.4 / 44.3 | 6.9 / 6.8 | 6.9 / 6.8 |

(각 칸은 1회차 / 2회차.)

- 「전」 수치는 보고서 기준(3카드 버스트 33~35% · 돌파40 버스트 41~44% · 분산 98.8%)을 그대로 재현했다.
- 「후」는 보고서 기대치(S1~S3 ~20% 대)보다 낮다. 3a·2a 가 1a 배치와 겹쳤기 때문이다(보고서 조합 프로토타입 all+batch100: 버스트 13.2% · 분산 19.1%). S3 「후」가 50% 미만이라 추가 원인 조사는 하지 않았다.
- 시장 데이터가 일으키는 커밋: 모든 컨텍스트 소비자가 relay 값이 바뀔 때마다 렌더하므로, AppSidebar 렌더/s 가 곧 relay 컨텍스트 갱신 수다. 이 값이 **7~9.3/s** 로, 초당 ≤10 계약을 지킨다. 분산 도착에서도 154 → 9.3 이다.
- 전체 `commitsPerS`(17~20/s)에는 시장 배치 말고도 다음이 들어 있다: 카드별 TradeTape 배치 플래시의 끄기 커밋(140ms 타이머 · 인스턴스마다), 테이프 effect 의 상태 커밋, 돌파 가격 2Hz 적용. 이것들은 컨텍스트를 바꾸지 않는다. 그래서 StrategyCard 렌더는 약 21/s(카드 3 × 약 7)에 머문다.
- 돌파 40종목의 프레임 수는 그대로다(2b 범위 밖). 하지만 이제 그 프레임들은 커밋 수를 늘리지 않는다.

## Deviations from Plan

1. **[Rule 3 - Blocking] perf 빌드 env 의 relay URL 경로.** plan ④ 의 `NEXT_PUBLIC_RELAY_WS_URL=ws://localhost:8190` 에는 `/ws` 경로가 없다. relay 가 「알 수 없는 경로 업그레이드 — 거부」로 끊었고, 가짜 게이트웨이 연결 대기가 15초 만에 타임아웃됐다(첫 「전」 측정 8회 전부 실패). 두 worktree 를 `ws://localhost:8190/ws` 로 다시 빌드해 해결했다. 제품 코드와는 무관하고 하니스만의 문제다. 디버그 중 고아 relay 프로세스 1개(8190)가 남아 종료했다.
2. **[측정 범위] S4(COLS=3) 를 추가로 돌렸다.** plan 이 「여유가 있으면」으로 허용한 범위다.
3. **[테스트 구성] ⓓ 를 둘로 나눴다.** ⓓ(언마운트 → 타이머 0) · ⓓ-2(`enabled:false` → 초기값 · 타이머 0)이다. behavior 내용은 같다.
4. **[브랜치] master 에 직접 커밋했다.** `gsd-tools query git.base-branch --is-protected master` 는 `true` 를 돌려준다. 그러나 오케스트레이터 지시(main working tree 순차 실행 · Task 별 커밋)와 프로젝트 설정 `git.branching_strategy: "none"`(기존 quick 커밋 전부 master)에 따랐다. push 는 하지 않았다.
5. **[참고] `webapp/` 안에 중첩 `.git` 디렉터리가 있다(기존 상태).** `webapp/` 을 cwd 로 git 을 치면 다른 저장소를 본다. 모든 git 명령은 레포 루트에서 실행했다. 수정하지 않았다(범위 밖).

그 밖에는 plan 대로 실행했다. e2e 스펙 수정은 없었다.

## Known Stubs

없다.

## Threat Flags

없다. 새 네트워크 경로·송신·권한 경로가 없다. relay/·packages/shared 변경은 0줄이다. T-elb-01~08 완화책은 위 테스트(ⓐ·ⓑ·ⓒ·ⓓ·ⓕ · 렌더 창 스크롤 확장 · 격리 ⑤/⑤-a · worktree 정리)로 증명했다.

## perf worktree 정리

`git worktree add --detach` 로 scratchpad 에 만든 `wt-before` · `wt-after` 는 `git worktree remove --force` 로 제거했다. `git worktree list` 에는 main 과, 이 작업 전부터 있던 `.claude/worktrees/agent-*` 4개만 남아 있다. 포트 3190·8190·54399 가 비어 있음도 확인했다.

## 남은 과제 (범위 밖)

- **1b** 컨텍스트 분리: action / 느린 상태 / 키 단위 시세 store(`useSyncExternalStore`). 카드·폼이 자기 종목 틱에만 렌더하게 한다.
- **2b** relay 가격 전용 구독: 돌파 40종목의 10호가·테이프 프레임 자체를 없앤다.
- **3b** 활성 트리만 렌더(JS 폭 판정): CLAUDE.md 컨테이너 쿼리 규약과 충돌하므로 결정이 필요하다.

## Self-Check: PASSED

- 수정 파일 11개가 전부 존재하고, 커밋 `79ac3f9` · `59bd549` · `62d8a77` 이 `git log` 에 있다(`git rev-list --count 85d77f0..HEAD` = 3).
