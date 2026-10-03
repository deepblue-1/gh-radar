---
phase: quick-261003-rc4
plan: 01
status: complete
subsystem: relay · shared · supabase · webapp
tags: [burst-limit, gh-trade-sync, limit-chaser, orderbook, order-log]
requires: [gh-trade 3dabd6ff / 26b3493e (phd + buy3_schema ≥ 3 가드)]
provides:
  - relay/src/generated 재동기화 (마커 26b3493e)
  - StrategyEventKind 10 BurstLimit 시세 이벤트 (shared · 조회 RPC · 푸시 · 주문로그)
  - 추가매수 ☐버스트 시 해제 (buy3_schema 3 파생 · 60/64 디코드 · 웹 체크 행)
  - RelayQuote.bul → 상따 사다리 「버스트」 겹침 표식
affects: [relay 배포, supabase db push, webapp push]
tech-stack:
  added: []
  patterns: [buy3_schema 존재 파생 (lcBuy3SchemaOf) · 시세 kind 집합 TS/SQL 이중 정본]
key-files:
  created:
    - supabase/migrations/20261003120000_dma_strategy_events_burst_limit.sql
  modified:
    - relay/src/generated/StockDMA.fbs (+ stock-dma/msg-type · quote-state · set-limit-chaser · strategy-event-kind)
    - packages/shared/src/strategy-event.ts · strategy-event-labels.ts · strategy-event-text.ts · relay.ts
    - relay/src/dma/envelope.ts · relay/src/ws/protocol.ts · relay/src/hub/subscription-hub.ts
    - webapp/src/lib/limit-chaser.ts · webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/components/orderbook/orderbook-ladder.tsx · webapp/src/components/trading/card/card-body.tsx
decisions:
  - "생성물 마커는 26b3493e — 실행 중 gh-trade master 가 3dabd6ff → 26b3493e(StockDMA.fbs 주석 전용)로 전진해 L-1 규칙대로 새 해시로 진행"
  - "buy3_schema 3 은 postBuyAuto · extraBuyBurstRelease 둘 다 있을 때만 — burst 단독은 1 + 미적재 + warn (P-1)"
  - "시세 kind 집합 {1, 2, 10} 을 shared isMarketStrategyEvent 와 조회 RPC 두 곳에 같이 둔다 · 9 는 예약이라 제외"
  - "「버스트」 표식은 상따 사다리 세 트리 각각의 매도 10단 위 absolute 겹침 (pointer-events 없음 · 레이아웃 폭 0)"
metrics:
  duration: 16m
  completed: 2026-10-03
plan_head_before: 7a8308fc
commits: 4
actuals:
  tokens: 33000
  tasks: 3
  commits: 4
---

# Phase quick-261003-rc4 Plan 01: 버스트 상한가 후속 (gh-trade phd 프로토콜 반영) Summary

gh-trade 26b3493e(= 3dabd6ff + 주석 전용 수정) 스키마를 relay 생성물에 반영하고, 그 위에 세 가지를 얹었다. 첫째, kind 10 「버스트 상한가」 를 시세 이벤트로 저장·푸시·백필·표시한다. 둘째, 추가매수 「☐버스트 시 해제」 를 양방향으로 연결했고 relay 가 buy3_schema 3 으로 싣는다. 셋째, QuoteState.burst_upper_limit 를 relay `bul` 로 실어 상따 호가 사다리에 「버스트」 겹침 표식을 그린다.

## 커밋

| # | 해시 | 메시지 | 파일 |
|---|------|--------|------|
| 1 | 648e7892 | chore(quick-261003-rc4): relay 생성물 재동기화 — gh-trade 26b3493e (BurstLimit 10 · burst_upper_limit · extra_buy_burst_release · BulkSellReq 40) | relay/src/generated 5파일 |
| 2 | dc439352 | feat(quick-261003-rc4): 주문로그 kind 10 「버스트 상한가」 — shared 시세 이벤트 판정 · 조회 RPC 가시성 (1, 2, 10) · pgTAP | shared 5 · 마이그레이션 1 · pgTAP 1 · relay 테스트 1 · webapp 테스트 3 |
| 3 | 6181ee5d | feat(quick-261003-rc4): 추가매수 「버스트 시 해제」 양방향 — relay buy3_schema 3 파생 · 60/64 디코드 · 웹 체크 행 | shared relay.ts · relay 3 소스 + 5 테스트/헬퍼 · webapp 3 소스 + 6 테스트/픽스처 |
| 4 | 4b328171 | feat(quick-261003-rc4): 호가창 「버스트」 표시 — QuoteState.burst_upper_limit → relay bul → 상따 사다리 겹침 표식 | shared relay.ts · relay 2 소스 + 3 테스트/헬퍼 · webapp 2 소스 + 7 테스트 |

- 모든 커밋 메시지는 한글이고 Co-Authored-By 줄이 없다(대소문자 무시 「co-authored」 0건).
- 어떤 커밋에도 `.planning/` 경로가 들어가지 않았다. 다른 세션이 수정 중인 `.planning/phases/25-order-log-progress/25-UAT.md` 와 미추적 `shots/` · `research/.cache/` 는 건드리지 않았다.
- push 하지 않았다. master 는 origin 대비 ahead 4 상태다.

## 생성물 동기화 (L-1 · D-05)

- **마커 해시는 26b3493e(3dabd6ff 아님)이다.** 실행 중에 다른 세션이 gh-trade 에 `26b3493e fix(limitchaser): ☐버스트 시 해제는 buy3_schema ≥ 3 일 때만 읽고…`(20:01:57 KST) 를 커밋했다. 그 커밋의 StockDMA.fbs 변경은 `git diff 3dabd6ff master` 기준 주석 줄만 고쳤다(buy3_schema 3 설명과 extra_buy_burst_release 주석). L-1 규칙의 「주석 전용 후속 해시」 에 해당해 새 해시로 진행했다. 필드와 enum 변경은 없다.
- 첫 클론(3dabd6ff)으로 한 번 동기화한 뒤 master 전진을 발견했다. 새 클론으로 `--check` 를 다시 돌렸고(신규·변경 예정 .ts 0개, .fbs 사본만 갱신) 그다음 반영했다. 생성 .ts 는 두 실행 결과가 같다.
- 실행 방식: `git clone --no-checkout` 로 gh-trade 를 스크래치패드에 클론하고 커밋된 master 의 `sync-relay-schema.sh` 와 `StockDMA.fbs` 만 체크아웃했다. 그 클론에서 `RELAY=…/gh-radar/relay` 로 `--check` 를 돌린 뒤 반영했다. flatc 는 25.12.19 이고 가드 3종을 통과했다. 클론은 실행 뒤 삭제했다.
- 확인 결과:
  - 마커 3행이 `server-repo-commit: 26b3493e` 다.
  - `tail -n +8` 본문이 클론의 fbs 와 `cmp` 상 동일하다.
  - 바뀐 파일은 정확히 다섯 개다(StockDMA.fbs · msg-type.ts · quote-state.ts · set-limit-chaser.ts · strategy-event-kind.ts). 새 미추적 파일은 없다.
- **gh-trade 작업 트리 전후 대조**
  - 첫 스냅샷(20:00)과 실행 뒤 status 가 달랐다. 원인은 다른 세션의 26b3493e · dec8f202 커밋으로 미커밋 M 8줄이 사라진 것이다. 이 실행기는 원본 저장소에 쓰기를 하지 않았다(클론에서 읽기만 함).
  - 재실행 직전에 찍은 두 번째 스냅샷과 실행 뒤 status 는 `diff` 결과 동일했다(GHT_SAME).
- 커밋 1 이후로 relay/src/generated 는 바뀌지 않았다(`git log 7a8308fc..HEAD -- relay/src/generated` = 1건, 작업 트리 diff 0).

## 수기 사본 점검

| 사본 | 판정 | 근거 |
|------|------|------|
| `relay/src/dma/msg-type.ts` | 무변경 | D-04 — relay 가 주고받는 번호만 나열한다. 40 BulkSellReq 는 C→S 이고 relay 는 쓰지 않는다. |
| `relay/src/dma/envelope.ts` | 변경 (Task 2 · 3) | `LC_BURST_RELEASE_BUY3_SCHEMA = 3` · `LcSetCfg` 확장 · `lcBuy3SchemaOf` · `addExtraBuyBurstRelease`(schema 3 일 때만) · `readLimitChaser` 의 `extraBuyBurstRelease: t.extraBuyBurstRelease()` · `parseQuoteState` 의 `bul: q.burstUpperLimit()` · 슬롯 수 주석 65 → 68(생성물 `startObject(68)`) · 「최대 46 필드」 → 47 |
| `relay/src/hub/subscription-hub.ts` | 변경 (Task 3) | `samePriceSection` 의 표에 `bul` 행을 추가하고 비교 `a.bul === b.bul` 을 넣었다(필드 12 → 13 · P-8) |

## RED / GREEN 관측

| 테스트 | 구현 전 | 비고 |
|--------|---------|------|
| pgTAP dma_strategy_read 신규 4단언 | **RED** — not ok 8 · 9 (U1/U2 kind 10 이 have NULL) | U3/U4 0행 단언은 처음부터 통과(의도된 대조) |
| shared labels/text/isMarket 3건 | **RED** 3 failed | |
| relay journal-push ⑦-burst | shared 구현 뒤 추가해 바로 GREEN | relay 코드는 바뀌지 않았다. shared 판정 확장이 그대로 이어지는지 확인하는 종단 특성 테스트다 |
| webapp order-log 3파일 신규 단언 | shared 구현 뒤 추가해 바로 GREEN | webapp 코드 무변경. 같은 이유의 특성 테스트다 |
| relay envelope ③-burst B1 · B2 · B4 · B5 · lcBuy3SchemaOf · ⑤-burst · 60키 단언 | **RED** (16 failed, protocol · fanout 포함) | B3 은 처음부터 통과했다(기존 ③-auto 동작의 특성) |
| relay protocol ①-burst (B7) | **RED** | |
| relay fanout ⑰-burst (B8) · 60키 단언 | **RED** | ⑰-burst-b(철거 — #isTeardown 무변경)는 처음부터 통과했다(특성) |
| webapp B9 기본값 · formFromServer | **RED** | B9 삭제 판정 무변경은 처음부터 통과했다(특성) |
| webapp B10 (폼 6건) · B11 (lc-fields 2건) · 45키 단언 4곳 · lc-tracer | **RED** 13 failed | |
| webapp B12 strategy-log 3건 | 처음부터 GREEN | P-5 특성 테스트다. strategy-log.tsx 는 바꾸지 않았다 |
| relay Q1 · Q2(P2) · Q3 | **RED** 3 failed | |
| webapp Q4 | **RED** | Q5 · Q6(chaser 클릭 · orderbook 변형 0개)는 처음부터 통과했다(특성) |

## 테스트 수 (전 → 후)

| 대상 | 전 (HEAD 7a8308fc) | 후 | 증감 |
|------|-----|-----|------|
| shared vitest | 249 (14 files) | 250 (14 files) | +1 (나머지 2건은 기존 it 확장) |
| relay vitest | 902 (35 files) | 915 (35 files) | +13 |
| webapp vitest | 3163 passed · 1 skipped (140 files) | 3182 passed · 1 skipped (140 files) | +19 |
| pgTAP dma_strategy_read | plan 24 | plan 28 — PASS | +4 |
| pgTAP dma_gateway_identities | 42 | 42 — PASS | 0 |
| pgTAP dma_strategy_apply | 30 | 30 — PASS | 0 |

- 타입체크는 모두 통과했다: shared build, relay `typecheck` 와 `typecheck:tests`, webapp `typecheck`(앱 + e2e).
- pgTAP 은 로컬 docker(29.4.0)의 일회용 컨테이너에서 마이그레이션 49개를 재생한 뒤 돌렸다. 원격 DB 에는 접촉하지 않았다.

## 플래너 재량 P-1 ~ P-9 채택

| 항목 | 채택 | 메모 |
|------|------|------|
| P-1 3 의 단조성 | 채택 | `lcBuy3SchemaOf` 로 파생한다. burst 만 있으면 schema 1 로 보내고 필드를 싣지 않으며 `logger.warn` 1줄을 남긴다(같은 파일 sweep 경고와 같은 로거·레벨). B4 테스트로 고정했다 |
| P-2 체크 위치 | 채택 | 추가매수 카드 마지막 'check' 행이고 independent 가 아니다. 라벨은 `LABEL_TEXT` 의 whitespace-nowrap 으로 줄바꿈되지 않는다 |
| P-3 접힌 요약 | 채택 | ON 일 때만 4번째 kv 「버스트 시 해제 · 켬」 을 붙인다 |
| P-4 삭제 제출 | 채택 | 강제 false 를 따로 두지 않았다. 게이트·삭제 판정은 무변경이고 B9 특성 테스트가 있다 |
| P-5 전략 로그 | 채택 | VALUE_COMPARE_SKIP 무변경. B12 특성 테스트 3건으로 확인했고 코드는 바꾸지 않았다 |
| P-6 표식 위치·모양 | 채택 | `BurstMark` 는 absolute · inset-x-0 · top-0 · z-[2] · pointer-events-none 이다. 알약 스타일은 `--up` 테두리·글자, `--card` 85% color-mix 바탕, `--t-lg` bold, `--r-md`, whitespace-nowrap 이다. 높이는 3단·2단이 `LADDER_BOX_TWO_H`, 1단이 새 상수 `LADDER_BOX_ONE_H` 다(기존 리터럴 `h-[440px]` 을 상수로 뽑아 두 곳에서 공유) |
| P-7 orderbook 변형 | 채택 | 기본 변형에는 표식이 없고 Q6 로 0개임을 단언했다 |
| P-8 PRICE 섹션 | 채택 | `samePriceSection` 에 `bul` 비교를 넣었다 |
| P-9 quote 계약 | 채택 | `RelayQuote.bul` 은 필수 boolean 이고 웹은 `quote.bul === true` 로만 판정한다 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] gh-trade master 가 실행 중 전진 (3dabd6ff → 26b3493e)**
- **Found during:** Task 1 ①(f) 상태 대조
- **Issue:** 다른 세션이 StockDMA.fbs 주석만 고친 커밋을 master 에 올렸다. 첫 클론으로 만든 마커 3dabd6ff 는 더 이상 「마지막 스키마 커밋」 이 아니다.
- **Fix:** L-1 의 「주석 전용 후속 해시」 규칙에 따라 새 클론에서 다시 동기화했다(마커 26b3493e). 생성 .ts 는 같다.
- **Commit:** 648e7892

**2. [Rule 1 - 테스트 스펙 잠금 갱신] setting-group.test.tsx · limit-chaser-form.test.tsx 행 수**
- **Found during:** Task 2 커밋 전 webapp 전체 vitest(vzy 교훈)
- **Issue:** 추가매수 그룹 행 id 목록, 필드→id 표, 「모든 리스트 행 44px」 의 행 수(25) 가 새 체크 행을 반영하지 못했다.
- **Fix:** 추가매수 행 4개(마지막 'check'), `extraBuyBurstRelease: 'lc-extra-buy-burst-release'`, 행 수 26 으로 갱신했다. setting-group.test.tsx 는 플랜 files 목록 밖이다.
- **Commit:** 6181ee5d

**3. [사소] hub.test P2 제목 「12칸」 → 「13칸(+ bul)」**
- **Commit:** 4b328171

### 실행 환경 메모
- 실행기 규약상 보호 브랜치(master) 커밋은 막혀 있다. 이번에는 오케스트레이터가 「master 메인 트리에서 순차 실행 · 커밋」 을 명시했으므로 그 지시를 따랐다.
- STATE.md 와 ROADMAP.md 는 갱신하지 않았다(오케스트레이터 몫 · 제약 조건).

## Known Stubs

없다.

## 시각 검증 메모

- 「버스트」 표식은 jsdom 단언(클래스·DOM 개수·slot)으로만 확인했다. 실제 브라우저에서 밴드별 렌더 결과(특히 1단 트리의 사다리 열 42% 폭에서 알약이 한 줄로 서는지)는 보지 않았다.
- whitespace-nowrap 이고 글자가 3자라 넘칠 가능성은 낮다.
- 첫 거래일 실화면에서 bul = true 프레임이 올 때 한 번 보는 것을 권한다. gh-trade 서버가 phd 를 배포하기 전에는 늘 false 다.

## 배포 메모 (메인 세션 몫 · 순서 고정 · 실행기는 하지 않았다)

1. **마이그레이션 원격 적용:** `supabase db push` (20261003120000_dma_strategy_events_burst_limit.sql). 적용 뒤 anon · authenticated 로 `dma_strategy_events_for_user` EXECUTE 가 거부되는지 확인하면 좋다(선택).
2. **relay 배포:** `scripts/deploy-relay.sh` 로 배포한다. env(GCP_PROJECT_ID · SUPABASE_URL · CORS_ALLOWED_ORIGINS 등)는 라이브 값에서 가져온다. 배포 뒤 `/healthz` 와 `smoke-relay.sh` 를 확인한다. 실행 직전 `git status -sb` 로 남의 로컬 커밋이 섞이지 않았는지 본다(현재 다른 세션의 25-UAT.md 미커밋 변경이 있다).
3. **그 뒤 `git push`:** push 가 곧 webapp 프로덕션 배포다(relay 먼저 · push 나중). 마지막으로 push 되는 커밋이 문서 전용이면 Vercel ignoreCommand 가 빌드를 건너뛸 수 있으니 배포 여부를 확인한다.
4. **gh-trade 쪽:** 서버가 phd(3dabd6ff) 와 buy3_schema ≥ 3 가드(26b3493e — 이제 커밋됨)를 배포하기 전까지 화면은 다음과 같다.
   - bul 은 false 로 오고 kind 10 은 발생하지 않는다.
   - 「버스트 시 해제」 를 체크하면 에코가 false 로 돌아와 「반영하지 못했어요」 로 되돌아간다.
   - relay 를 먼저 내보내도 구 서버는 모르는 필드를 무시한다(D-01).

## Threat Flags

없다 — 새 엔드포인트나 권한 경로는 없다. 조회 RPC 재정의는 권한 3줄을 그대로 다시 적었고, dma_gateway_identities pgTAP 권한 단언도 회귀 통과했다.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261003120000_dma_strategy_events_burst_limit.sql
- FOUND commits: 648e7892 · dc439352 · 6181ee5d · 4b328171
