---
phase: 25-order-log-progress
verified: 2026-10-03T12:00:00Z
status: passed
score: 12/12 plans' must_haves fully verified (round 2 · 25-VERIFICATION-R2.md — gap closed by 25-13) · UAT 7/7 pass 2026-10-03 · Nyquist validated
requirements_note: "Phase 25 요구사항 ID 없음 — ROADMAP.md 「Requirements: TBD」, 12개 PLAN 전부 `requirements: []`. REQUIREMENTS.md 에도 Phase 25 매핑 행 없음(grep 0건). 요구사항 커버리지 섹션은 그래서 생략한다."
covered_files:
  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/25-order-log-progress/25-01-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-01-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-02-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-02-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-03-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-03-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-04-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-04-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-05-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-05-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-06-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-06-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-07-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-07-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-08-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-08-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-09-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-09-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-10-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-10-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-11-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-11-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-12-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-12-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-13-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-13-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-REVIEW.md"
  - ".planning/phases/25-order-log-progress/25-UAT.md"
  - ".planning/phases/25-order-log-progress/25-VALIDATION.md"
  - ".planning/phases/25-order-log-progress/25-VERIFICATION-R2.md"
  - ".planning/phases/25-order-log-progress/deferred-items.md"
  - "packages/shared/src/__fixtures__/strategy-day.ts"
  - "packages/shared/src/order-timeline.ts"
  - "packages/shared/src/strategy-event-labels.ts"
  - "packages/shared/src/strategy-event-text.ts"
  - "packages/shared/src/strategy-event.ts"
  - "relay/src/dma/envelope.ts"
  - "relay/src/dma/msg-type.ts"
  - "relay/src/hub/subscription-hub.ts"
  - "relay/src/index.ts"
  - "relay/src/journal/observer.ts"
  - "relay/src/journal/status.ts"
  - "relay/src/journal/strategy-stream.ts"
  - "relay/src/journal/writer.ts"
  - "relay/src/ws/fanout.ts"
  - "server/src/routes/orders.ts"
  - "server/src/routes/strategy-events.ts"
  - "supabase/migrations/20260929180000_dma_strategy_events.sql"
  - "supabase/migrations/20260929180100_dma_strategy_apply.sql"
  - "supabase/migrations/20260929180200_dma_strategy_read_rpcs.sql"
  - "webapp/e2e/specs/a11y.spec.ts"
  - "webapp/e2e/specs/me.spec.ts"
  - "webapp/e2e/specs/order-log.spec.ts"
  - "webapp/e2e/specs/unfilled-progress.spec.ts"
  - "webapp/src/app/trading/order-log/page.tsx"
  - "webapp/src/components/orderbook/unfilled-progress.tsx"
  - "webapp/src/components/trading/card/card-tabs.tsx"
  - "webapp/src/components/trading/order-log/order-log-feed-context.tsx"
  - "webapp/src/components/trading/order-log/order-log-list.tsx"
  - "webapp/src/components/trading/order-log/order-log-panel.tsx"
  - "webapp/src/components/trading/order-log/order-log-window.tsx"
  - "webapp/src/components/trading/order-timeline.tsx"
  - "webapp/src/components/trading/workbench/shared-panels.tsx"
  - "webapp/src/lib/order-log-feed.ts"
  - "webapp/src/lib/order-notices.ts"
  - "webapp/src/lib/order-timeline.ts"
  - "webapp/src/lib/orders-api.ts"
  - "webapp/src/lib/queue-progress.ts"
  - "webapp/src/lib/strategy-events-api.ts"
  - "webapp/src/lib/trading-layout.ts"
  - "webapp/src/lib/use-order-log-feed.ts"
  - "webapp/src/lib/use-stick-to-bottom.ts"

covered_digest: "v1:sha256:56ebfda3b540d3e51be991b1d8f23f2a675515187860e57b4633d12ba2371deb"
behavior_unverified: 0
overrides_applied: 0
gaps:

  - truth: "25-06 must_have: 「세션 교체(#clearCaches) 뒤 옛 진행률이 남지 않는다(RESEARCH Pitfall 6)」"
    status: partial
    reason: >
      relay/src/hub/subscription-hub.ts 의 #clearCaches(1768행대)는 허브 내부 캐시 #queueProgress 만
      비우고, 그 사용자에게 이미 연결된 브라우저에는 삭제 프레임을 보내지 않는다. hub.test.ts 의
      동명 테스트(640행)는 hub.getQueueProgressEntries()(= 새 연결이 받는 snap 원천)만 검증하고,
      이미 연결된 브라우저의 웹 스토어 queueProgress Map 이 실제로 비워지는지는 검증하지 않는다.
      세션 교체 뒤 새 세션의 83 이 같은 (isin, exchange) 키를 다시 「빈 items」로 보내면
      #onQueueProgress 의 `(prev === undefined || prev.length===0) && items.length===0` 가드에
      걸려 팬아웃되지 않는다(허브 캐시가 이미 비어 있으므로 prev===undefined) — 이미 연결된
      브라우저는 옛 진행률(예: 「곧 내 차례 · 99%」)을 서버가 삭제를 알렸음에도 계속 표시한다.
      코드 리뷰 WR-02 가 같은 근거로 이미 지적했고 수정되지 않았다.
    artifacts:
      - path: "relay/src/hub/subscription-hub.ts"
        issue: "#clearCaches(약 1768행)가 큐프로그레스 캐시를 지우면서 이미 연결된 브라우저로 삭제 프레임을 내보내지 않음 · #onQueueProgress(약 1255행)의 빈→빈 억제 가드가 세션 교체 직후의 실제 삭제 신호까지 억제"
        issue2: "relay/tests/hub.test.ts:640 테스트는 허브 내부 상태만 확인 — 연결된 브라우저로의 팬아웃은 미검증"
    missing:
      - "#clearCaches 에서 비우기 직전에 그 사용자의 진행률 키마다 빈 unf.progress(snap:false, items:[]) 팬아웃 — 또는 새 세션 ready 시 1회 snap:true 팬아웃으로 브라우저 Map 을 초기화(WR-02 제안 a/b)"
      - "이미 연결된 브라우저가 실제로 갱신을 받는지 검증하는 fanout 레벨 테스트(현재 hub.test.ts:640 은 허브 내부 상태만 봄)"

deferred:

  - truth: "기획서 D-09 두 줄 문장 형식(gh-trade 537266ea · bddf2e76) 적용"
    addressed_in: "Phase 25 플랜 범위 밖 후속(25-11-SUMMARY.md 명시)"
    evidence: "25-11-SUMMARY.md: 「D-09 두 줄 형식 — gh-trade 537266ea · bddf2e76, 정본 docs/features/order-log-progress.md ⑦. Phase 25 플랜 범위 밖 후속으로 남긴다.」 — 계획 단계 이후 사용자 결정으로 명시적으로 범위 밖 처리됐으므로 갭이 아니라 후속 항목으로 기록한다."
advisory:

  - finding: "WR-01(코드 리뷰): 전략 기록기 지속 실패(포이즌 이벤트 · DB 오류)가 큐 상한(5,000)에 닿으면 관찰자 소켓 전체가 끊겨 결국 주문 저널 적재까지 지연된다 — ROADMAP 이 명시한 「별도 트랜잭션 — 한쪽 포이즌이 다른 쪽 커서를 막지 않게」 의도가 DB 트랜잭션 수준에서는 지켜지지만(dma_strategy_apply 별도 advisory lock 확인) 소켓 백프레셔 수준에서는 새지 않는다."
    category: architectural
    reason: "정상 운영 조건(마이그레이션 적용됨 · 계약 준수 이벤트)에서는 재현되지 않고, 포이즌 이벤트나 원격 DB 장애가 지속될 때만 발현하는 견고성 결함이다. 25-02 must_haves 문구를 문자 그대로 위반하지는 않지만 ROADMAP 설계 의도와 어긋난다 — 후속 관찰/수정 권장."
    evidence_status: "코드 리뷰 WR-01 파일·라인 근거 확인(observer.ts:386-397 · writer.ts:405-411) — 재현 테스트는 없음"
  - finding: "WR-03(코드 리뷰): hidden(display:none) 상태로 접힌 목록(카드 접힘 · 카드 탭 접힘 · 폰 밴드 공용 패널 접힘)에 푸시로 줄이 늘면 맨 아래 자동 고정이 깨져, 다시 펼쳤을 때 새 줄이 화면 밖에 남을 수 있다."
    category: other
    reason: "25-07 must_have 「스크롤 고정」 문구는 보이는 상태의 동작을 규정하고 숨김→표시 전환은 명시하지 않아 문자 그대로의 위반은 아니지만, UX 기대(새 로그 배지가 있는데 스크롤은 안 따라감)와 어긋난다."
    evidence_status: "코드 리뷰 WR-03 파일·라인 근거 확인(use-stick-to-bottom.ts:80-91) — 재현 테스트는 없음"
  - finding: "WR-04(코드 리뷰): 창 분리 ↗ 버튼의 window.open 이 noopener 를 쓰고 있어 HTML 표준상 이름으로 기존 창을 재사용하지 못하고 누를 때마다 새 창 · 새 relay 연결이 생긴다."
    category: other
    reason: "25-07 must_haves 문구는 창 이름·크기만 규정하고 재사용을 문자 그대로 약속하지 않으나, 코드 주석(ORDER_LOG_WINDOW_NAME)은 재사용을 명시한다 — 구현 의도와 실제 동작의 괴리."
    evidence_status: "코드 리뷰 WR-04 파일·라인 근거 확인 — 재현 테스트는 window.open 모킹 단위 테스트뿐, 실브라우저 e2e 없음"
  - finding: "WR-05(코드 리뷰): 마운트 조회(REST)가 relay 인증보다 먼저 끝나는 경합에서 그 사이 삽입된 이벤트가 REST 응답에도 없고 재생 대상도 아니어서 영구 누락될 수 있다(창 분리 페이지에서 가장 잘 드러남)."
    category: other
    reason: "드문 타이밍 경합이고 다음 ready 재진입이나 날짜 이동으로 자연 해소된다 — 필수 표시 truth 를 구조적으로 무너뜨리지는 않는다."
    evidence_status: "코드 리뷰 WR-05 파일·라인 근거 확인(use-order-log-feed.ts:100-112) — 재현 테스트 없음"
human_verification:

  - test: "첫 거래일 UAT (a): 상따 매수 1건 발생 시 주문로그 탭에 BuyOrder 줄(조건 · 근거 · 상한가 매수잔량 · 접수 +ms)이 게이트웨이 로그의 전송 시각 · 조건값과 일치하는지 로그인 세션에서 대조"
    expected: "실이벤트 필드값이 게이트웨이 원본과 일치"
    why_human: "실 시세·주문 이벤트가 필요해 장중 실거래로만 검증 가능(25-12-SUMMARY UAT 체크리스트 항목 a, 배포 시점 headSeq=0)"
  - test: "첫 거래일 UAT (b): 그 주문 행을 펼쳐 통보(접수·체결) 조각과 전략 줄이 같은 ms 규칙(통보 먼저)으로 보이는지 확인"
    expected: "타임라인이 gw_time_ms 순 · 동시각은 통보 우선으로 정렬"
    why_human: "실 주문 이벤트 타이밍 필요 — 로컬 e2e 는 고정 픽스처로만 검증"
  - test: "첫 거래일 UAT (c): 공용 패널 배지 · 카드 배지 · 창 분리 「오늘」 이어붙임이 실이벤트 도착 시 실제로 갱신되는지"
    expected: "탭이 안 보이는 동안 배지 카운트 증가, 탭 열면 0"
    why_human: "실시간 푸시 도착 타이밍은 실거래로만 관찰 가능"
  - test: "첫 거래일 UAT (d): 대기 · 첫 체결 · 취소 · 매도 · 상한가 노출/진입 줄(상따 origin 주문)이 실제로 그려지는지"
    expected: "각 kind 별 문장이 D-09/D-10 규칙대로 보임"
    why_human: "골든 픽스처는 로컬에서 검증됐으나 실 gh-trade 서버가 내는 실제 필드값 조합은 실거래에서만 확인 가능"
  - test: "첫 거래일 UAT (e): 83 QueueProgress 로 미체결 진행률 막대가 실제로 갱신되는지(수동·VI 대기 포함, 단일가/VI 구간 정지 포함)"
    expected: "체결예상까지 진행률 막대·퍼센트가 실시간으로 움직이고 단일가/VI 구간에서 멈춤"
    why_human: "실 83 스트림 필요 — 배포 시점 headSeq=0(장 마감 후 배포)이라 로컬 픽스처 e2e 외 실증 없음"
  - test: "첫 거래일 UAT (f)/(g): 수동·VI 주문은 전략 이벤트 0 이 정상인지 · healthz journal.strategy.lastSeq 가 null→값으로 전이하고 lagSeq 가 0 근처를 유지하는지"
    expected: "수동 주문에 상따 줄 없음 · lastSeq 전이 정상 · dbError:false 유지"
    why_human: "실 게이트웨이 트래픽 필요"
  - test: "운영 웹 로그인 세션 육안 확인: 작업대 공용 패널 「주문로그」 탭 · 카드 「주문로그」/「전략로그」 탭 · /trading/order-log 창 · 마이페이지 오늘 주문 행 ▶ 펼침 · DevTools WS 인증 직후 unf.progress snap 1프레임"
    expected: "다섯 표면 모두 정상 렌더 · 새로고침 후 6289e430 번들 반영"
    why_human: "25-12-SUMMARY 「사용자 항목 1」에 명시된 대로 아직 미수행 — 시각적 확인은 로그인 브라우저 세션에서만 가능"
latest_round: 2 (25-VERIFICATION-R2.md · round-1 body below kept as record)
---

> **2026-10-03 정본 승계:** frontmatter 는 최신 라운드(`25-VERIFICATION-R2.md` · gap 0 · human_needed) + 25-UAT 7/7 pass + 25-VALIDATION validated 로 `passed` 승계. 아래 본문은 1라운드(gaps_found · WR-02) 기록 그대로다.
# Phase 25: 주문로그·잔량진행률 Verification Report

**Phase Goal:** ROADMAP.md 「Phase 25」 절 전문 — gh-trade StrategyEvent 저널을 relay 두 번째 스트림으로 수신해 오늘 주문 카드 행 펼침 · 작업대 「주문로그」 탭 · 미체결 진행률(B안) 3표면으로 노출하고, 별건 3(방향 미상 · 접수 불명 · R(New))을 처리한다. 착수·배포 순서(마이그레이션 → gh-trade 서버 → relay → server → webapp push)를 지킨다.
**Verified:** 2026-09-30 (커밋 6289e430 기준 — 배포된 프로덕션 코드)
**Status:** gaps_found
**Re-verification:** No — initial verification
**Requirements:** 없음 — ROADMAP.md 는 이 phase 의 Requirements 를 「TBD」로 남겼고, 12개 PLAN 파일 전부 `requirements: []`다. `.planning/REQUIREMENTS.md` 에도 Phase 25 를 가리키는 행이 없다(grep 0건). 요구사항 커버리지 절은 그래서 N/A 로 생략한다.

## Goal Achievement

### 검증 방법

12개 PLAN 의 `must_haves`(truths/artifacts/key_links/prohibitions)를 전부 추출해(총 ~115개 truth 문장) 커밋 `6289e430`(배포본, `git show 6289e430:<path>` 로 읽음) 코드에 직접 대조했다. 플랜당 truth 가 5~17개로 방대해, 아래 표는 **플랜 단위**로 묶어 보고하고 개별 truth 는 근거 열에 구체적으로 적는다. 오케스트레이터가 사전에 확보한 build/typecheck/vitest(relay 721 · webapp 3031+1skip · server 275 · shared 237)/pgTAP(3파일 133 ok)/Playwright(order-log+me+unfilled-progress+a11y 46 · trading-workbench 63, 기존 실패 3건 제외)/원격 migration list/anon 401/서버 401 증거를 채택하고, 그 위에 핵심 와이어링·별건 3·D-09 조립기·23-06 진행률 파이프라인을 직접 소스에서 재확인했다.

### Observable Truths (플랜 단위)

| # | 플랜 | 핵심 truths | 상태 | 근거 |
|---|------|------------|------|------|
| 1 | 25-01 트레이서 | fbs 생성물 1커밋(blob f08677d9) · 80 두 스트림 · 전략 기록기 · journal.events · 웹 스토어 · 주문로그 한 줄 · dma_strategy_events/apply 마이그레이션 · pgTAP | ✓ VERIFIED | `relay/src/journal/strategy-stream.ts` · `relay/src/ws/fanout.ts:1565 deliverStrategyEvents` · `relay/src/index.ts:220 strategyWriter.on("applied", …)` · `use-relay-socket.ts:857 case "journal.events"` · 마이그레이션 2개 존재 · pgTAP 133 ok(오케스트레이터 사전 확보) |
| 2 | 25-02 relay 스트림 경계 | 갭·resync·구게이트웨이·live 전이·/healthz journal.strategy · 부팅 결선 | ✓ VERIFIED (WR-01 advisory 별도) | `relay/src/journal/status.ts` `strategyWriter` 필드 · `relay/tests/helpers/supabase-stub.ts` `dma_strategy_apply` 경로 · vitest relay 721 통과(사전 확보) — 단, 지속 포이즌/DB 장애 시 소켓 전체가 끊기는 견고성 결함은 advisory 로 별도 기록(WR-01) |
| 3 | 25-03 조회 RPC · 라우트 | dma_strategy_events_for_user · dma_order_events_for_user UNION ALL · GET /api/orders/:id/events · GET /api/strategy-events · dma_user_id 없음 | ✓ VERIFIED | `supabase/migrations/20260929180200_dma_strategy_read_rpcs.sql` 존재 · `server/src/routes/strategy-events.ts` · `server/src/routes/orders.ts` · 서버 401(배포 후, 오케스트레이터 확보) |
| 4 | 25-04 문장 조립기 | shared strategyEventParts 1곳 · 기획서 골든 하루 흐름 · 표시명 표 · enum 신규값 | ✓ VERIFIED | `packages/shared/src/strategy-event-text.ts` · `packages/shared/src/__tests__/strategy-event-text.test.ts` 「골든 — 기획서 하루 흐름 + 갈래 전량」describe 존재 · `.message` 사용은 kind 8 원문 그대로(D-36 준수, 파싱 없음) |
| 5 | 25-05 별건 3 | 방향 미상 「주문」 · 접수 불명(−2) · R(New) 참고 방향 | ✓ VERIFIED | `webapp/src/lib/order-notices.ts` `sideRef` · `webapp/src/lib/orders-api.ts:183 label:"접수 불명"` 직접 확인 |
| 6 | 25-06 진행률 데이터 경로 | 83 파서 · hub 계좌 필터 · unf.progress · dma_user_id 제거 · 세션교체 뒤 잔존 없음 · 빈→빈 억제 | ⚠️ PARTIAL — 아래 gaps 참조 | `subscription-hub.ts:1255 #onQueueProgress` · `1768 #clearCaches` 직접 읽음 — 세션 교체 뒤 **이미 연결된** 브라우저에는 삭제 프레임이 가지 않아 옛 진행률이 남을 수 있다(코드 리뷰 WR-02 와 동일 근거, 직접 재확인) |
| 7 | 25-07 공용 패널 주문로그 탭 | F-A 한 줄 · 탭 신설 · 필터 · 새 로그 배지 · 스크롤 고정 · 창 분리 버튼 · P25-1 e2e | ✓ VERIFIED (WR-03/WR-04 advisory) | `order-log-feed.ts` · `use-stick-to-bottom.ts` · `order-log-panel.tsx` · `order-log.spec.ts` 존재, Playwright 46 passed(사전 확보) 포함 — hidden 상태에서의 자동 따라감 붕괴(WR-03)·창 재사용 미동작(WR-04)은 advisory |
| 8 | 25-08 오늘 주문 행 펼침 | 통보+상따 한 타임라인 · 묶음 · 라이브 끼워넣기 · 디바운스 재조회 · 펼침 트리거 · 빈/로딩/에러 | ✓ VERIFIED (WR-05 advisory) | `webapp/src/lib/order-timeline.ts` · `webapp/src/components/trading/order-timeline.tsx` · P25-E1~E7 (25-07/08 SUMMARY 근거 + 사전 확보 vitest/e2e) — REST/relay 인증 경합으로 인한 드문 갭(WR-05)은 advisory |
| 9 | 25-09 미체결 진행률 B안 | 3표면 + 모바일 r3 · 클램프 · 취소보관 tone · colSpan | ✓ VERIFIED | `webapp/src/components/orderbook/unfilled-progress.tsx` · `webapp/e2e/specs/unfilled-progress.spec.ts` 존재, Playwright 46 passed 포함(사전 확보) — 웹 스토어 자체 클램프·유지 로직은 정상(업스트림 25-06 파이프라인의 삭제신호 누락과는 별개 계층) |
| 10 | 25-10 카드 탭 · 창 분리 · axe | 카드 탭 「주문로그」 · 「전략로그」 개명 · 창 분리 라우트 · 폰밴드 판정 공유 · axe critical/serious 0 | ✓ VERIFIED | `webapp/src/app/trading/order-log/page.tsx` · `webapp/src/components/trading/card/card-tabs.tsx` `orderlog` · `webapp/e2e/specs/a11y.spec.ts` 「Phase 25 axe 매트릭스」 test 존재(799행) |
| 11 | 25-11 원격 스키마 적용 | 마이그레이션 3개 원격 적용 · migration list Local=Remote · anon 401 | ✓ VERIFIED | 25-11-SUMMARY.md 확인(48행 Local=Remote · 3 RPC 401, 오케스트레이터 사전 확보와 일치) |
| 12 | 25-12 배포 순서 | 마이그레이션→gh-trade→relay→server→webapp 순서 · 준비 게이트 · smoke · 401 · Vercel 확인 | ✓ VERIFIED | 25-12-SUMMARY.md 배포 기록표(relay smoke PASS10/FAIL0 · server 401 · Vercel Ready 6289e430) — UAT 항목만 human_verification 으로 이관 |

**Score:** 11/12 plans' must_haves fully verified · 1 partial(25-06, 세션 교체 뒤 진행률 잔존 가능성)

### 별도 확인 — 착수·배포 순서 준수

ROADMAP 이 명시한 고정 순서(마이그레이션 → gh-trade 서버 예고 → relay → server → webapp push)가 25-12-SUMMARY 배포 기록표에 그대로 반영돼 있고, 각 단계 검증(스키마 대조 · relay smoke · server 401 · Vercel Ready)을 통과한 뒤에만 다음 단계로 넘어갔다. 동시 세션(quick-260929-vzy)의 미검증 커밋은 push 대상에서 제외됐다(fast-forward 로 배포 커밋만 push).

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `relay/src/journal/strategy-stream.ts` | 전략 스트림 서술자 · 적용 이벤트 변환 | ✓ VERIFIED | 6289e430 존재 |
| `relay/src/ws/fanout.ts` | `deliverStrategyEvents` | ✓ VERIFIED | 1565행 확인 |
| `relay/src/hub/subscription-hub.ts` | `#onQueueProgress` · `getQueueProgressEntries` · `allowedAccounts` | ⚠️ HOLLOW (부분) | 존재·와이어됨이나 `#clearCaches` 경로의 삭제 신호 누락(gaps 참조) |
| `packages/shared/src/strategy-event-text.ts` | `strategyEventParts` 전 종류 | ✓ VERIFIED | kind 1~8 + 모르는 값 분기 확인 |
| `supabase/migrations/20260929180000/100/200_*.sql` | 테이블 · 적용 RPC · 조회 RPC | ✓ VERIFIED | 3개 파일 존재 · 원격 적용 확인(25-11) |
| `server/src/routes/strategy-events.ts`, `orders.ts` | 새 조회 라우트 2 | ✓ VERIFIED | 존재 · 배포 후 401(오케스트레이터 확보) |
| `webapp/src/components/trading/order-log/*` | 공용 패널 탭 · 창 분리 · 피드 컨텍스트 | ✓ VERIFIED | 5개 파일 전부 존재 |
| `webapp/src/components/orderbook/unfilled-progress.tsx` | 진행률 보조행 컴포넌트 | ✓ VERIFIED | row/compact 변형 확인 |
| `webapp/src/app/trading/order-log/page.tsx` | 창 분리 라우트 | ✓ VERIFIED | 존재 |
| `webapp/src/lib/use-stick-to-bottom.ts` | 스크롤 고정 훅 | ⚠️ ORPHANED-EDGE (부분) | 정상 경로는 동작하나 hidden→visible 전환 시 갱신 누락(WR-03, advisory) |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `relay/src/journal/observer.ts` | `relay/src/journal/strategy-stream.ts` | `strategyWriter.push` | ✓ WIRED | 25-01 확인 |
| `relay/src/index.ts` | `relay/src/ws/fanout.ts` | `strategyWriter.on("applied", …) → deliverStrategyEvents` | ✓ WIRED | 220행 확인 |
| `relay/src/ws/fanout.ts` | `webapp/src/lib/use-relay-socket.ts` | `{t:"journal.events"}` | ✓ WIRED | 857행 확인 |
| `relay/src/hub/subscription-hub.ts` | `webapp` (via fanout) | `{t:"unf.progress"}` | ⚠️ PARTIAL | 정상 갱신 경로는 WIRED, 세션 교체 뒤 삭제 프레임 경로만 미배선(gaps) |
| `server/src/routes/orders.ts` | `dma_order_events_for_user` RPC | `listOrderEvents` | ✓ WIRED | 25-03 확인 |
| `webapp/src/components/trading/workbench/trading-workbench.tsx` | `order-log-feed-context.tsx` | `OrderLogFeedProvider` | ✓ WIRED | 존재 확인 |
| `webapp/src/components/trading/card/strategy-card.tsx` | `order-log-feed-context.tsx` | `useOrderLogFeedContext` | ✓ WIRED | 25-10 확인 |

### Behavioral Spot-Checks / 테스트 증거 (오케스트레이터 사전 확보 + 본 검증 직접 확인)

| 항목 | 근거 | 상태 |
|---|---|---|
| build/typecheck 전 패키지 | exit 0 · `error TS` 0건 | ✓ PASS |
| vitest | relay 721 · webapp 3031(+1 skip) · server 275 · shared 237 | ✓ PASS |
| pgTAP | dma_strategy_apply 30 · dma_strategy_read 24 · dma_journal_apply 79 = 133 ok · not ok 0 | ✓ PASS |
| Playwright | order-log+me+unfilled-progress+a11y 46 passed · trading-workbench(기존 실패 3건 제외) 63 passed | ✓ PASS |
| 원격 마이그레이션 | `supabase migration list` 48행 Local=Remote | ✓ PASS |
| 원격 anon 권한 | 3 RPC 전부 401 | ✓ PASS |
| relay smoke | PASS 10 · FAIL 0 · SKIP 2(정상) | ✓ PASS |
| server 새 라우트 | 배포 전 404 → 배포 후 401 | ✓ PASS |
| D-09 골든 하루 흐름 | `strategy-event-text.test.ts` 「골든 — 기획서 하루 흐름 + 갈래 전량」 describe 확인(14줄 · 갈래 12개) | ✓ PASS |
| axe 매트릭스(25-10) | `a11y.spec.ts:799` Phase 25 5표면 × 본문폭 × 테마 critical/serious 0 | ✓ PASS |
| `#clearCaches` 삭제 신호 | `hub.test.ts:640` 은 허브 내부 상태만 검증 — 팬아웃 레벨 검증 없음 | ✗ GAP(간접 증거) |

### Anti-Patterns Found

디버트 마커(TBD/FIXME/XXX) — Phase 25 핵심 파일 13개 스캔 결과 **0건**. 경고성 마커(TODO/HACK/PLACEHOLDER) — **0건**. 별도 코드 리뷰(`25-REVIEW.md`, 2026-09-29)가 Critical 0 · Warning 5 · Info 6 을 이미 상세 근거와 함께 남겼다. 본 검증에서 직접 소스를 읽어 재확인한 결과:

- **WR-02(진행률 삭제 신호 누락)는 25-06 must_have 문구를 직접 위반** → `gaps`로 승격.
- **WR-01·WR-03·WR-04·WR-05**는 문자 그대로의 must_have 위반은 아니되(정상 경로·happy path는 동작), 설계 의도·UX 기대와 어긋나는 견고성 결함 → `advisory`로 기록(팔로우업 권장).
- Info 6건(IN-01~06)은 로그 품질·경합 조건 수준으로 phase 목표에 영향 없음 — 리뷰 원문 참조.

### Requirements Coverage

N/A — 위 frontmatter `requirements_note` 참조. Phase 25 는 요구사항 ID 가 없다.

### Human Verification Required

25-12-SUMMARY.md 의 「첫 거래일 UAT 체크리스트」 7항목(a~g, 전부 「대기」)과 「사용자 항목 1(운영 웹 로그인 세션 확인)」을 human_verification 목록으로 이관했다(위 frontmatter 참조). 이유: 2026-09-29 장 마감 뒤 배포라 실이벤트 0(`journal.strategy.headSeq=0`)이고, 실 상따 매수·83 QueueProgress·로그인 화면 육안 확인은 2026-09-30 장중 실거래로만 검증 가능하다.

### Gaps Summary

**1건 — 25-06 「세션 교체 뒤 옛 진행률이 남지 않는다」 부분 미충족.**

`relay/src/hub/subscription-hub.ts` 의 `#clearCaches`(허브 세션 재생성 시 호출)는 서버 내부의 `#queueProgress` 캐시만 비우고, 그 사용자에게 **이미 연결돼 있는** 브라우저에는 삭제를 알리는 프레임을 보내지 않는다. 그 뒤 새 세션에서 83 QueueProgress 가 같은 (isin, exchange) 키를 「빈 items」로 보내면 `#onQueueProgress` 의 빈→빈 억제 최적화(`prev === undefined && items.length === 0` → return)에 걸려 팬아웃이 일어나지 않는다. 결과적으로 이미 화면을 보고 있던 사용자는 서버가 이미 지운 진행률(예: 부분 체결 후 남은 미체결의 「곧 내 차례 · 99%」)을 무기한 계속 보게 될 수 있다. 이는 코드 리뷰 WR-02 가 파일·라인 근거로 이미 지적한 결함과 동일하며, 본 검증에서 소스를 직접 읽어 재확인했다. `relay/tests/hub.test.ts:640` 의 동명 테스트는 허브 내부 상태(`getQueueProgressEntries`, 즉 *새* 연결이 받는 snap 원천)만 검증하므로, must_have 문구가 요구하는 「이미 연결된 사용자 기준 옛 진행률 미잔존」을 실제로 증명하지 못한다.

영향 범위: 세션 교체는 relay 관찰자 재로그인·게이트웨이 재기동·네트워크 순단 등으로 발생할 수 있는 정상 운영 이벤트이며(이 저장소 메모리에 기록된 「KYOBO 관찰자 다중 업스트림」·「wg-probe 터널 정지」 등 사례 참고), 이 결함은 Phase 25 의 두 핵심 표면 중 하나인 잔량진행률의 정확성을 직접 훼손한다. 수정은 WR-02 가 제시한 방법(①`#clearCaches` 에서 비우기 직전 빈 프레임 팬아웃, ②새 세션 ready 시 1회 snap:true 로 초기화, ③억제 조건 재정의) 중 하나로 가능하며 국소적이다.

그 외 4건(WR-01·03·04·05)은 must_have 문구를 문자 그대로 위반하지 않는 견고성/edge-case 결함으로 판단해 `advisory` 로만 기록했다 — 정상 경로(happy path)는 방대한 자동 테스트(vitest 4264+ · Playwright 109 · pgTAP 133)로 뒷받침된다.

기획서 D-09 두 줄 문장 형식은 계획 이후 사용자 결정으로 Phase 25 범위 밖 후속으로 명시적으로 분리됐으므로(25-11-SUMMARY.md 기록) 갭이 아니라 `deferred` 로 기록했다.

---

_Verified: 2026-09-30_
_Verifier: Claude (gsd-verifier)_
