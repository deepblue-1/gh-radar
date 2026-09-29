---
phase: 25-order-log-progress
plan: 01
subsystem: relay · shared · webapp · database
tags: [flatbuffers, relay, observer, journal, supabase, pgtap, websocket, react]

requires:
  - phase: 19 (관찰자 저널)
    provides: JournalObserver · JournalWriter · dma_journal_cursor · dma_journal_apply · WsFanout.deliverJournalRows
  - phase: gh-trade 25-01 (G1 통보)
    provides: StockDMA.fbs 5f49cfa5 (blob f08677d98b3feeafbe984362cdbe3fbb0858c49c) · relay/src/generated 16 경로
provides:
  - "생성물 커밋 — relay/src/generated 16 경로(수정 7 · 신규 9) · sync --check 차이 0"
  - "관찰자 80 두 스트림 파서(MAX_STRATEGY_BATCH_EVENTS 500) · 79 전략 head/oldest/resync · 5 strategy_since_seq"
  - "JournalWriter 스트림 서술자(JournalStreamSpec · JOURNAL_STREAM) + strategy-stream.ts(STRATEGY_APPLY_KEYS 43 · createStrategyWriter)"
  - "JournalObserver 커서 2 · since 2(epoch 짝 가드) · pending 2 · 주문 먼저 push"
  - "WsFanout.deliverStrategyEvents — 주문 이벤트 계좌 필터 · 시세 이벤트 매핑 보유자 전원(kind 판정)"
  - "shared strategy-event 계약(45 공개 칸) · 표시명 표 6종 + REASON_CODE_OPERATORS · 조립기(kind 3) · 하루 흐름 픽스처"
  - "RelayJournalEventsMsg · RelayUnfProgressEntry · RelayUnfProgressMsg 프레임 타입"
  - "webapp strategyEvents · strategyEventsBatch · upsertStrategyEvents(상한 5000) · OrderLogList F-A 한 줄"
  - "원격 미적용 마이그레이션 2 — dma_strategy_events · 전략 커서 칸 · dma_strategy_apply"
affects: [25-02, 25-03, 25-04, 25-06, 25-07, 25-10, 25-11]

actuals:
  tokens: 48800
  tasks: 2
  commits: 3
plan_head_before: 9436766e0367d5a7b1bd05606a8ee52ddae18935

tech-stack:
  added: []
  patterns:
    - "기록기 스트림 서술자 — 클래스 복제 없이 스트림 고유 4지점(커서 칸 · 커서 행 읽기 · 적용 RPC · 반환 매퍼)만 주입"
    - "관찰자 두 스트림 — pending 플래그 2 · since 2 · 주문 push 먼저, 주문이 끊기면 그 프레임 전략분은 재로그인으로"
    - "시세 공개 판정은 kind 로만(빈 계좌번호 비교 금지)"
    - "relay 테스트가 shared 소스 픽스처를 런타임 동적 import 로 읽는다(NodeNext · rootDir 경계 · 두 벌 금지)"

key-files:
  created:
    - relay/src/journal/strategy-stream.ts
    - packages/shared/src/strategy-event.ts
    - packages/shared/src/strategy-event-labels.ts
    - packages/shared/src/strategy-event-text.ts
    - packages/shared/src/__fixtures__/strategy-day.ts
    - packages/shared/src/__tests__/strategy-event-text.test.ts
    - webapp/src/test-fixtures/strategy-day.ts
    - webapp/src/components/trading/order-log/order-log-list.tsx
    - webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx
    - supabase/migrations/20260929180000_dma_strategy_events.sql
    - supabase/migrations/20260929180100_dma_strategy_apply.sql
    - supabase/tests/dma_strategy_apply.test.sql
  modified:
    - relay/src/generated/** (16 경로 — gh-trade 산출물 그대로)
    - relay/src/dma/msg-type.ts
    - relay/src/dma/envelope.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/src/journal/types.ts
    - relay/src/journal/writer.ts
    - relay/src/journal/observer.ts
    - relay/src/ws/fanout.ts
    - relay/src/index.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/tests/journal-push.test.ts
    - relay/tests/journal-boot.test.ts
    - relay/tests/journal-codec.test.ts
    - relay/tests/journal-gateway.test.ts
    - relay/tests/journal-observer.test.ts
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts

key-decisions:
  - "relay 트레이서의 기대값은 shared 픽스처 원본을 런타임 동적 import 로 읽는다 — relay tsconfig(NodeNext · rootDir=relay)가 packages/shared/src 정적 import 를 막아서. 값 두 벌을 만들지 않는다"
  - "적용 RPC 실패 로그 문구는 `[journal] ${rpc} 실패 — 같은 배치 재시도` — 기존 운영 검색어(dma_journal_apply 실패)를 그대로 잇고 전략 스트림은 dma_strategy_apply 로 갈린다"
  - "readCursor 는 이 스트림 epoch 칸이 NULL/빈 문자열이면 「커서 없음」 — 주문 스트림만 적용된 기존 커서 행의 전략 칸을 since 0 으로 읽는다(이관 없음)"
  - "dma_strategy_apply 커서 upsert 는 새 행일 때 주문 칸을 (p_epoch, 0) 으로 채운다(NOT NULL) — 주문 기록기는 last_seq 0 을 since 0 으로 읽어 결과가 같다"
  - "표시명 표 문자열 키 조회(reason_code · order_condition)는 Object.hasOwn 으로 자기 키만 본다 — 게이트웨이 원문이 프로토타입 키일 수 있다"

patterns-established:
  - "JournalStreamSpec<R, Out>: 스트림별 차이를 서술자 하나로 — 25-02 경계 케이스 · /healthz 전략 칸이 이 위에 선다"
  - "조립기 조각(StrategyEventParts) → 표면이 자기 문법으로 배치 — F-A 평문(title)과 렌더 textContent 가 같은 문장"

requirements-completed: []

coverage:
  - id: D1
    description: "gh-trade 생성물 16 경로를 수기 사본 · 소비처와 한 커밋으로 — sync --check 차이 0 · blob f08677d9 · SYNC MARKER 5f49cfa5"
    verification:
      - kind: other
        ref: "cd gh-trade/.claude/worktrees/phase-25-order-log-progress/server && RELAY=… ./scripts/sync-relay-schema.sh --check (신규/변경 예정 0 개 · .fbs 사본 최신)"
        status: pass
      - kind: other
        ref: "git show --name-only --format= a058f26f -- relay/src/generated | wc -l == 16"
        status: pass
    human_judgment: false
  - id: D2
    description: "실 TCP 관찰자 80(전략 BuyOrder · LimitExposed) → 전략 기록기 → dma_strategy_apply(가짜) → journal.events: A1·A2 둘 다 · B 시세만 · U 0 · 입력 키 43 · strategy since 0"
    verification:
      - kind: integration
        ref: "relay/tests/journal-push.test.ts#⑦ Phase 25 트레이서"
        status: pass
    human_judgment: false
  - id: D3
    description: "80 두 스트림 파서 · 79 전략 필드 · 5 strategy_since_seq 왕복 · 구 게이트웨이 0/0/false · 상한 500 · 형식 이상 비드롭"
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#관찰자 두 스트림 — 80 전략 이벤트 · 79/5 전략 커서 (Phase 25-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "shared 계약(45 공개 칸 · dmaUserId 없음) · KST ms 시각 · BuyOrder F-A 골든 한 줄"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-text.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "웹 스토어 journal.events 멱등 병합 · batch seq · 상한 5000 · reset, OrderLogList F-A 한 줄 렌더(골든 · data-kind/group · --up)"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#journal.events (Phase 25)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "원격 미적용 마이그레이션 2 — 멱등 · 전략 커서 독립 · 새 epoch 교체 · 공개 45키 · CHECK 없는 enum · 계약 위반 예외 · 권한 잠금 · 주문 적용이 전략 칸 불변"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_apply.test.sql (30/30)"
        status: pass
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_apply.test.sql (79/79)"
        status: pass
    human_judgment: false
  - id: D7
    description: "F-A 한 줄의 실제 화면 모양(말줄임 · 색 · 간격)은 패널 결선(25-07) 뒤 눈으로 확인해야 한다 — 이 플랜은 컴포넌트 단위 렌더만"
    verification: []
    human_judgment: true
    rationale: "OrderLogList 는 아직 어떤 화면에도 결선되지 않았다(25-07). jsdom 은 레이아웃 · 말줄임을 그리지 않는다"

duration: 26min
completed: 2026-09-29
status: complete
---

# Phase 25 Plan 01: 트레이서 — BuyOrder 한 건이 게이트웨이 프레임에서 주문로그 한 줄까지 Summary

**gh-trade 전략 이벤트 와이어(5f49cfa5)를 커밋하고, 관찰자 80 두 번째 스트림 → 서술자 주입 전략 기록기 → dma_strategy_apply → 계좌 필터/시세 공개 journal.events → 웹 스토어 → F-A 한 줄까지 BuyOrder 12451 한 건으로 끝까지 증명했다. 적용 RPC 는 가짜(relay 트레이서)와 실제 SQL(pgTAP 30건) 둘 다로 증명했다.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-09-29T09:23:51Z
- **Completed:** 2026-09-29T09:49:57Z
- **Tasks:** 2
- **Files modified:** 48 (생성물 16 포함)

## 생성물 대조 (G1 ②)

- gh-trade worktree 팁: `38c67a56` (`/Users/alex/repos/gh-trade/.claude/worktrees/phase-25-order-log-progress`)
- `.fbs` 확정 커밋: `5f49cfa5` · 정본 blob `f08677d98b3feeafbe984362cdbe3fbb0858c49c` (rev-parse 일치)
- `sync-relay-schema.sh --check`: 「신규/변경 예정 : 0 개」 · 「.fbs 사본 : 최신」 · 가드 3종 통과
- 커밋한 생성물 16 경로 (a058f26f — 손편집 0):
  - 수정 7: `StockDMA.fbs` · `stock-dma.ts` · `stock-dma/{envelope,journal-batch,msg-type,observer-login-req,observer-login-resp}.ts`
  - 신규 9: `stock-dma/{cancel-reason,cond-metric,evidence-kind,order-group,queue-progress-item,queue-progress,strategy-event-batch,strategy-event-kind,strategy-event}.ts`

## Accomplishments

- 관찰자 두 스트림 — 커서 2개를 다 읽은 뒤 연결, 로그인 since 2개(전략 since 는 두 기록기 epoch 가 같을 때만), pending 플래그 2개(구 게이트웨이 0/0/false 면 전략 pending 은 처음부터 거짓), 주문 push 먼저
- `JournalWriter<R, Out>` 스트림 서술자 — 기존 호출 · 테스트 무변경(`JOURNAL_STREAM` 기본), 모든 로그에 `stream` 문맥
- `deliverStrategyEvents` — 시세 이벤트 공개는 `isMarketStrategyEvent(kind)` 로만(빈 계좌번호 판정 없음)
- shared 조립기 kind 3 갈래 — `[09:45:02.861][12451][선매수] KRX | ○○전자 | 주문 · 조건 매도잔량≤50,000 / 실측 38,200 · 근거 호가(매도1잔량 52,100→38,200) · 상한가 매수잔량 0 · 12,350×300주 · 접수 +18ms | 누적 861,800`
- 원격 미적용 마이그레이션 2개 (25-11 에서 사용자가 `supabase db push`)

## Task Commits

1. **Task 1 (tracer): BuyOrder 한 건 — 생성물 커밋 · 80 두 스트림 · 전략 기록기 · journal.events · 웹 스토어 · 주문로그 한 줄** — `a058f26f` (feat)
   - 트레이서 게이트: 자동 검증만 있는 tracer · end-of-phase → `<verify>` 재실행 green → 확장 진행
2. **Task 2: 실제 데이터 층 (TDD)**
   - RED — `916aa214` (test): 마이그레이션 전 실행 `function public.dma_strategy_apply(unknown, unknown, jsonb) does not exist` (psql exit 3)
   - GREEN — `ae732e9b` (feat): 마이그레이션 2개 + pgTAP 30/30 · 저널 적용 회귀 79/79

## 트레이서 테스트 이름

- relay `tests/journal-push.test.ts` — `⑦ Phase 25 트레이서 — 관찰자 80(전략 BuyOrder · LimitExposed) → 전략 기록기 → dma_strategy_apply → journal.events: A1·A2 둘 다 · B 시세만 · U 0`

## 검증 결과

| 명령 | 결과 |
|---|---|
| sync-relay-schema.sh --check (+ blob · SYNC MARKER) | pass |
| shared build → relay typecheck → relay typecheck:tests → webapp typecheck(+e2e) | pass (error TS 0) · server typecheck 도 pass |
| relay vitest `-t "Phase 25 트레이서"` | 1 passed |
| relay 전체 `pnpm --filter @gh-radar/relay run test` | 29 files · 673 passed |
| shared `strategy-event-text.test.ts` / 전체 | 10 passed / 154 passed |
| webapp `relay-socket.test.ts` + `order-log` | 112 passed |
| webapp 전체 `pnpm --filter @gh-radar/webapp run test` | 126 files · 2846 passed · 1 skipped(기존) |
| pgTAP `dma_strategy_apply.test.sql` | 1..30 · not ok 0 · RED→GREEN |
| pgTAP `dma_journal_apply.test.sql` (회귀) | 1..79 · not ok 0 |

## Decisions Made

frontmatter `key-decisions` 참조.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 플랜 files 목록 밖 relay 테스트 3개 갱신**
- **Found during:** Task 1
- **Issue:** `ObserverLoginResult` · `JournalBatchFrame` · `buildLoginReq` 입력에 필수 필드가 늘어 `journal-codec.test.ts` · `journal-observer.test.ts` 가 typecheck:tests 에서 깨지고, `journal-gateway.test.ts` · `journal-codec.test.ts` · `journal-observer.test.ts` 의 deep-equal 이 새 필드(strategySinceSeq · strategy* 3필드)로 실패했다.
- **Fix:** 기대값에 새 필드(0/0/false · strategySinceSeq 0 · 빈 전략 벡터)를 더했다. 동작 변경 없음.
- **Files modified:** relay/tests/journal-codec.test.ts · journal-gateway.test.ts · journal-observer.test.ts
- **Commit:** a058f26f

**2. [Rule 3 - Blocking] relay 트레이서가 shared 픽스처를 정적 import 할 수 없음**
- **Found during:** Task 1
- **Issue:** relay `tsconfig.tests.json` 은 rootDir=relay · NodeNext 라 `packages/shared/src/__fixtures__/strategy-day.ts`(확장자 없는 상대 import) 정적 import 가 불가. 플랜은 ⑦ 이 `STRATEGY_DAY_BY_NAME` 과 deep-equal 이기를 요구했다.
- **Fix:** 테스트에서 `new URL(…, import.meta.url)` 동적 import 로 픽스처 원본을 읽고, 공개 행 → 와이어 레코드(`recordOf`)로 게이트웨이 입력을 만들었다 — 값 한 벌, 무손실 왕복이 곧 단언이다.
- **Files modified:** relay/tests/journal-push.test.ts
- **Commit:** a058f26f

**3. [Rule 1 - Bug] 적용 RPC 실패 로그 문구 회귀 방지**
- **Found during:** Task 1 (writer 일반화 직후 journal-writer ② 실패)
- **Issue:** 로그 문구를 「적용 RPC 실패」 로 일반화하자 기존 운영 검색어 `dma_journal_apply 실패` 가 사라졌다.
- **Fix:** 문구에 RPC 이름을 그대로 싣는다(`[journal] ${rpc} 실패 — 같은 배치 재시도`).
- **Commit:** a058f26f

**4. [Rule 1 - Bug] pgTAP throws_ok 인자 순서**
- **Found during:** Task 2 GREEN 첫 실행
- **Issue:** `throws_ok(sql, description)` 2인자는 두 번째를 오류 문구로 읽어 not ok 2건.
- **Fix:** `throws_ok(sql, errcode, errmsg, description)` 로 errcode(23502 · P0001) 명시.
- **Commit:** ae732e9b

**5. [해석] pgTAP 「rows[0]->>'group' = '1'」**
- Behavior 는 seq 1 LimitExposed · seq 2 BuyOrder 라 rows[0] 은 시세(group 0)다. rows seq 오름차순을 단언하고 BuyOrder 인 rows[1] 의 group 1 을 단언했다.

**6. [보강] 표시명 표 문자열 키 조회에 `Object.hasOwn`** — `reason_code` 는 게이트웨이 원문이라 `"constructor"` 같은 값이 프로토타입 멤버를 돌려주지 않게(Rule 2).

---

**Total deviations:** 4 auto-fixed (Rule 1 ×2 · Rule 3 ×2) + 해석 1 + 보강 1. **Impact:** 스코프 변화 없음 — 테스트 기대값 갱신 · 로그 문구 보존 · 테스트 인자 수정.

## Known Stubs

| 파일 | 줄 | 내용 | 해소 |
|---|---|---|---|
| packages/shared/src/strategy-event-text.ts | `strategyEventParts` 끝 fallback | kind 3 외(시세 1·2 · 대기 · 체결 · 매도 · 취소 · 거부)는 D-10 모르는 값 규칙(badge 원문 숫자 · 본문 "")으로 떨어진다 — 의도된 트레이서 범위 | 25-04 (조립기 나머지 7종) |
| webapp/src/components/trading/order-log/order-log-list.tsx | 전체 | 아직 어떤 화면에도 결선되지 않음 · panel 변형만 | 25-07 · 25-10 |

## Issues Encountered

None — 사전 입력(생성물 16 경로 · docker 이미지) 전제는 모두 충족됐다.

## User Setup Required

없음 — docker 이미지는 오케스트레이터가 받아 두었다. 원격 마이그레이션 적용은 25-11 결정 체크포인트.

## Next Phase Readiness

- 25-02(relay 경계 케이스 · /healthz 전략 칸) · 25-03(조회 RPC 2 · server 라우트) · 25-04(조립기 나머지) · 25-06(83 QueueProgress) · 25-07(목록 결선)이 이 트레이서 위에서 아키텍처 변경 없이 진행 가능
- 원격 DB 에는 아직 테이블 · RPC 가 없다 — relay 를 배포하면 전략 적용 RPC 가 실패해 전략 기록기가 재시도 · db_error 로 간다. **relay 배포는 25-11 마이그레이션 적용 뒤**여야 한다.

## Self-Check: PASSED
