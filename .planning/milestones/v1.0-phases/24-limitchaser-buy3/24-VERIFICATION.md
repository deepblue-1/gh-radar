---
phase: 24-limitchaser-buy3
verified: 2026-09-29T14:05:00Z
round1_verified: 2026-09-28T11:55:00Z
status: passed
round1_status: gaps_found
superseded_by: 24-VERIFICATION-R4.md  # 갭 클로징 R2→R3→R4 끝에 R4 passed 22/22 (2026-09-29). 본문은 1라운드 원문 보존
score: 22/22 truths verified (round-1~3 누적 21건 회귀 없음 재확인 + R3-G1 닫힘 확인 = 22)
round1_score: 13/18 truths verified (2 present-but-behavior-unverified, 3 human 확인 대기)
covered_files: [".planning/phases/24-limitchaser-buy3/24-01-PLAN.md",".planning/phases/24-limitchaser-buy3/24-01-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-02-PLAN.md",".planning/phases/24-limitchaser-buy3/24-02-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-03-PLAN.md",".planning/phases/24-limitchaser-buy3/24-03-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-04-PLAN.md",".planning/phases/24-limitchaser-buy3/24-04-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-05-PLAN.md",".planning/phases/24-limitchaser-buy3/24-05-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-06-PLAN.md",".planning/phases/24-limitchaser-buy3/24-06-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-07-PLAN.md",".planning/phases/24-limitchaser-buy3/24-07-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-08-PLAN.md",".planning/phases/24-limitchaser-buy3/24-08-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-09-PLAN.md",".planning/phases/24-limitchaser-buy3/24-09-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-10-PLAN.md",".planning/phases/24-limitchaser-buy3/24-10-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-11-PLAN.md",".planning/phases/24-limitchaser-buy3/24-11-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-12-PLAN.md",".planning/phases/24-limitchaser-buy3/24-12-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-13-PLAN.md",".planning/phases/24-limitchaser-buy3/24-13-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-14-PLAN.md",".planning/phases/24-limitchaser-buy3/24-14-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-15-PLAN.md",".planning/phases/24-limitchaser-buy3/24-15-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-16-PLAN.md",".planning/phases/24-limitchaser-buy3/24-16-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-17-PLAN.md",".planning/phases/24-limitchaser-buy3/24-17-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-18-PLAN.md",".planning/phases/24-limitchaser-buy3/24-18-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-19-PLAN.md",".planning/phases/24-limitchaser-buy3/24-19-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-20-PLAN.md",".planning/phases/24-limitchaser-buy3/24-20-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-21-PLAN.md",".planning/phases/24-limitchaser-buy3/24-21-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-22-PLAN.md",".planning/phases/24-limitchaser-buy3/24-22-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-23-PLAN.md",".planning/phases/24-limitchaser-buy3/24-23-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-24-PLAN.md",".planning/phases/24-limitchaser-buy3/24-24-SUMMARY.md",".planning/phases/24-limitchaser-buy3/24-CONTEXT.md",".planning/phases/24-limitchaser-buy3/24-RESEARCH.md",".planning/phases/24-limitchaser-buy3/24-REVIEW-R2.md",".planning/phases/24-limitchaser-buy3/24-REVIEW-R3.md",".planning/phases/24-limitchaser-buy3/24-REVIEW-R4.md",".planning/phases/24-limitchaser-buy3/24-REVIEW-R5.md",".planning/phases/24-limitchaser-buy3/24-REVIEW.md",".planning/phases/24-limitchaser-buy3/24-UAT.md",".planning/phases/24-limitchaser-buy3/24-UI-SPEC.md",".planning/phases/24-limitchaser-buy3/24-VERIFICATION-R2.md",".planning/phases/24-limitchaser-buy3/24-VERIFICATION-R3.md",".planning/phases/24-limitchaser-buy3/deferred-items.md",".planning/phases/24-limitchaser-buy3/tools/lc-watch-side-audit.cjs",".planning/quick/260929-htw-24-r3-g1/260929-htw-PLAN.md",".planning/quick/260929-htw-24-r3-g1/260929-htw-SUMMARY.md","packages/shared/src/index.ts","packages/shared/src/relay.ts","relay/src/dma/envelope.ts","relay/src/dma/msg-type.ts","relay/src/generated/StockDMA.fbs","relay/src/generated/stock-dma/set-limit-chaser.ts","relay/src/ws/fanout.ts","relay/src/ws/protocol.ts","webapp/e2e/fixtures/relay.ts","webapp/e2e/specs/a11y.spec.ts","webapp/e2e/specs/trading-workbench.spec.ts","webapp/src/components/trading/__tests__/card-body.test.tsx","webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx","webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx","webapp/src/components/trading/__tests__/strategy-card.test.tsx","webapp/src/components/trading/card/card-body.tsx","webapp/src/components/trading/card/strategy-card.tsx","webapp/src/components/trading/latch-led.tsx","webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx","webapp/src/components/trading/lc/__tests__/setting-group.test.tsx","webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx","webapp/src/components/trading/lc/lc-fields.ts","webapp/src/components/trading/lc/setting-group.tsx","webapp/src/components/trading/lc/use-lc-field-commit.ts","webapp/src/components/trading/limit-chaser-form.tsx","webapp/src/components/trading/strategy-log.tsx","webapp/src/lib/__tests__/limit-chaser.test.ts","webapp/src/lib/limit-chaser.ts","webapp/src/test-fixtures/limit-chaser.ts"]
round1_covered_files: [".planning/phases/24-limitchaser-buy3/24-01-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-01-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-02-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-02-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-03-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-03-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-04-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-04-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-05-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-05-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-06-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-06-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-07-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-07-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-08-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-08-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-09-PLAN.md", ".planning/phases/24-limitchaser-buy3/24-09-SUMMARY.md", ".planning/phases/24-limitchaser-buy3/24-CONTEXT.md", ".planning/phases/24-limitchaser-buy3/24-RESEARCH.md", ".planning/phases/24-limitchaser-buy3/24-REVIEW.md", ".planning/phases/24-limitchaser-buy3/24-UI-SPEC.md", ".planning/phases/24-limitchaser-buy3/deferred-items.md", ".planning/phases/24-limitchaser-buy3/tools/lc-watch-side-audit.cjs", "packages/shared/src/index.ts", "packages/shared/src/relay.ts", "relay/src/dma/envelope.ts", "relay/src/dma/msg-type.ts", "relay/src/generated/StockDMA.fbs", "relay/src/generated/stock-dma/set-limit-chaser.ts", "relay/src/ws/fanout.ts", "relay/src/ws/protocol.ts", "webapp/e2e/fixtures/relay.ts", "webapp/e2e/specs/a11y.spec.ts", "webapp/e2e/specs/trading-workbench.spec.ts", "webapp/src/components/trading/card/card-body.tsx", "webapp/src/components/trading/card/strategy-card.tsx", "webapp/src/components/trading/latch-led.tsx", "webapp/src/components/trading/lc/lc-fields.ts", "webapp/src/components/trading/lc/setting-group.tsx", "webapp/src/components/trading/lc/use-lc-field-commit.ts", "webapp/src/components/trading/limit-chaser-form.tsx", "webapp/src/components/trading/strategy-log.tsx", "webapp/src/lib/limit-chaser.ts", "webapp/src/test-fixtures/limit-chaser.ts"]
covered_digest: "v1:sha256:3b6d2e29801b17640c6c30cc56d516a21edf197970ef80e61edc8c2143da4233"
round1_covered_digest: "v1:sha256:ec5704249860d6e0527650244898f3c37fbbc85b214e03291d3e33362b3c596b"
behavior_unverified: 0
round1_behavior_unverified: 2
overrides_applied: 0
requirements_note: "이 phase 의 요구사항 필드는 9개 PLAN 모두 requirements: [] 이다(grep 확인). REQUIREMENTS.md 교차검증 대상 없음 — informational only."
gaps:
  - truth: "선매수(pre-buy)를 쓰지 않는(주문금액 0) 후매수/추가매수 전용 buy3 전략이 새로고침·재마운트 뒤에도 정상적으로 편집 가능하다(Phase 24 핵심 가치 — 「선매수·추가매수·후매수 세 갈래를 사람이 독립적으로 고른다」, CONTEXT D-05)"
    status: failed
    reason: "레거시(구서버) 특례 「buyOrderAmount===0 이면 모른다」가 buy3Schema 판별 없이 무조건 걸린다. buy3 서버는 선매수 금액 0 을 정상값으로 늘 보내는데도, 웹은 새로고침 뒤 그 전략의 모든 확정(끄기 제외)을 「주문금액을 먼저 입력해 주세요」로 잠근다. WinForms 가 만든 후매수 전용 전략도 동일하게 잠긴다. 24-REVIEW.md WR-01 로 이미 발견됐고, 배포(11:05~11:27 KST) 이후 진행된 코드 리뷰(리뷰 타임스탬프 11:39 KST)에서 발견된 채 미수정 상태로 남았다(리뷰 이후 코드 변경 커밋 없음 — git log 확인)."
    artifacts:
      - path: webapp/src/components/trading/lc/use-lc-field-commit.ts
        issue: "amountUnknownNow()(:343-346)이 `server.buyOrderAmount === 0 && !amountConfirmedRef.current` 만 보고 `server.buy3Schema` 를 보지 않는다"
      - path: webapp/src/lib/limit-chaser.ts
        issue: "formFromServer()(:527)의 `buyOrderAmount: server.buyOrderAmount === 0 ? prev.buyOrderAmount : server.buyOrderAmount` 가 buy3 스키마에서도 무조건 레거시 특례를 적용한다 — 바로 아래 주석(:549-550)은 같은 서버가 싣는 extraBuyOrderAmount/postBuyOrderAmount 에는 이 특례를 적용하지 않는다고 스스로 적어 놓고 buyOrderAmount 에는 적용한다"
      - path: webapp/src/lib/__tests__/limit-chaser.test.ts
        issue: ":342-344 테스트가 이 버그 동작을 「의도」로 단언하고 있어(150 을 보존) buy3Schema=1 케이스에 대한 회귀 방지가 없다"
    missing:
      - "amountUnknownNow / amountRequired / formFromServer 세 곳의 판정을 `server.buy3Schema === 0`(구서버 에코일 때만) 로 좁힌다 — REVIEW.md WR-01 제안 수정과 동형"
      - "선매수 사전 검증(groupPrechecksOf)도 금액 0 이면 추가·후매수와 같은 amountRequired 문구를 쓰도록 맞춘다(IN-04)"
      - "buy3Schema=1 ∧ buyOrderAmount=0(선매수 미사용) 전략의 새로고침 뒤 편집 가능 여부를 확인하는 회귀 테스트"
  - truth: "relay 가 읽어서 넘기는 `buy3Schema` 판별자를 webapp 이 소비해, 구서버(buy3_schema 부재→0) 에코를 정확히 구분해 표시하고 편집을 안전하게 제한한다(RESEARCH 웹 인벤토리 「buy3Schema 는 UI 몫」 · relay envelope.ts:2005 주석 「판정은 UI 몫이다」)"
    status: failed
    reason: "`grep -rn buy3Schema webapp/src` 결과 제품 코드에는 0건(주석 1건 뿐)이다. 구서버 에코(신필드 전부 0/false)를 받으면 카드 상태 문구가 실제로 매수 감시 중인 전략을 「매수주문 켜짐 · 켠 매수 없음」으로 오인식하고, formFromServer 는 추가·후매수 기본 금액 4000 을 0 으로 덮는다. 무엇보다 웹에서 어떤 값이든 하나만 확정해도 buildCfg 는 buy_watch_side 를 싣지 않으므로(24-03), 구서버는 부재를 \"0\"으로 읽어 「매수잔량 기준」 전략의 감시 기준을 조용히 반대 호가로 뒤집는다."
    artifacts:
      - path: webapp/src/lib/limit-chaser.ts
        issue: "isLegacyBuySchema 류의 단일 판정 함수가 없다 — buy3Schema 를 아무도 읽지 않는다"
    missing:
      - "server.buy3Schema === 0 이면 폼을 읽기 전용으로 두고 철거(게이트 4종 OFF)만 허용, 카드에 「구서버 전략 — 새로고침/서버 확인 필요」 한 줄"
    deferred_note: "현재 운영 서버는 이미 buy3 스키마로 배포됐고(24-09), 24-02 D-14 추출 결과 「매수잔량 기준」 전략은 0건이라 이 경로의 현재 실사용 피해 범위는 0이다. 다만 상시 존재하는 코드 결함이며 relay 롤백(`deploy-relay.sh --rollback`) 시나리오에서는 즉시 재현된다."
  - truth: "선매수 켜기 대기열(queued) 확정이 동반 필드(자동 체크 값)를 최신 서버 상태로 다시 계산해, 사용자가 그사이 확정한 값을 덮지 않는다(D-06 자동 체크와 즉시반영 동시성 안전)"
    status: failed
    reason: "REVIEW.md WR-03 — `preBuyAutoChecksOf(base, upperLimit)` 는 누른 순간의 동기값으로 동반 필드를 굳혀 대기열에 넣는다. 앞선 확정이 in-flight 라 이 확정이 대기하면, drain 시점에 그 낡은 동반값(예: 매도 주문가격 = 상한가)이 사용자가 그사이 확정한 실제 값(예: 12,000)을 덮는다."
    artifacts:
      - path: webapp/src/components/trading/limit-chaser-form.tsx
        issue: ":910-937 선매수 켬 핸들러가 동반 필드를 값으로(함수가 아니라) 대기열에 싣는다"
      - path: webapp/src/components/trading/lc/use-lc-field-commit.ts
        issue: ":414, 607-621 drain → sendNow 가 대기 시점 companions 를 그대로 합친다"
    missing:
      - "companions 를 값이 아니라 꺼낼 때 계산하는 함수로 넘긴다(REVIEW.md WR-03 제안)"
    verification_note: "코드 리뷰의 구체적 파일:라인 근거를 채택했다 — 본 검증에서 별도 재현 실행은 하지 않았다(실시간 동시성 재현 필요)."
  - truth: "실패한 대기열 확정(failQueue)이 성공 판정 시 동반 필드(companions)까지 함께 서버값과 비교한다 — 주 필드만 같다고 성공으로 접지 않는다"
    status: failed
    reason: "직접 코드 확인: use-lc-field-commit.ts:496 `if (server != null && server[q.field] === q.value)` 는 주 필드만 비교하고 `q.companions` 를 보지 않는다. 같은 파일의 즉시/드레인 경로(sameAsServer)는 companions 까지 보는데 failQueue 만 다르다. 대기 중이던 「그룹 끄기 + buyEnabled:false 동반(D-02 전반)」 확정이 앞 건 실패 뒤 주 필드만 일치해 성공 처리되면, 동반 마스터 OFF 는 전송되지 않은 채 폼이 낙관 OFF 를 계속 그린다."
    artifacts:
      - path: webapp/src/components/trading/lc/use-lc-field-commit.ts
        issue: ":492-503 failQueue 가 sameAsServer(companions 포함) 대신 `server[q.field] === q.value` 만 쓴다"
    missing:
      - "failQueue 도 sameAsServer(server, q.field, q.value, q.companions) 로 통일(REVIEW.md WR-04 제안 diff)"
  - truth: "거부·무응답으로 끝난 제출의 사유(sent/sentCause)가 그 사건에만 귀속되고, 다음 무관한 에코에 잘못 붙지 않는다(전략 로그 정확성)"
    status: failed
    reason: "REVIEW.md WR-05 — `pendingRef`/`pendingCauseRef` 가 거부 통지·3초 무응답 시점에는 비워지지 않는다. serverFold 자동 마스터 OFF 제출이 거부되면 그 사유가 다음 비런타임 에코(다른 단말의 마스터 OFF, 15:40 KRX 강제해제 등)에 잘못 귀속돼 「서버가 매수 그룹 해제 — …」 문장이 엉뚱한 사건에 붙을 수 있다."
    artifacts:
      - path: webapp/src/components/trading/card/strategy-card.tsx
        issue: ":366-372, 480-501, 555-594 — 거부·타임아웃 분기에서 pendingRef/pendingCauseRef 를 비우지 않는다"
    missing:
      - "isLimitChaserSetRejection 분기와 무응답 타이머 만료 시 pendingRef/pendingCauseRef 를 함께 비운다(REVIEW.md WR-05 제안 diff)"
    verification_note: "코드 리뷰의 구체적 파일:라인 근거를 채택했다 — 본 검증에서 별도 재현 실행은 하지 않았다."
  - truth: "D-02 후반 자동 마스터 OFF 제출은 폼 인스턴스 전체에 걸쳐 정확히 1건만 나가, 여러 탭·기기에서 동시 편집을 되돌리지 않는다"
    status: failed
    reason: "REVIEW.md WR-06 — 「정확히 1건」 보장은 폼 인스턴스 하나 안에서만 성립한다. 같은 사용자가 연 탭·앱·작업대 카드 N개가 각자 같은 접힘 에코를 받아 N건을 보낸다. D-34(서버가 접힘과 동시에 마스터도 내림)로 실제 트리거 빈도는 낮지만, 서버가 그 백스톱에 닿지 않는 구서버 경로에서는 여전히 열려 있다."
    artifacts:
      - path: webapp/src/components/trading/limit-chaser-form.tsx
        issue: ":989-1034 dropMasterAfterServerFold 가드가 폼 인스턴스 범위를 벗어나지 못한다"
    missing:
      - "보낼 cfg 가 최신 에코와 buyEnabled 외 다른 값을 갖고 있으면 보내지 않기, 또는 relay 쪽 탭 간 중복 억제(REVIEW.md WR-06 제안)"
    verification_note: "코드 리뷰의 구체적 파일:라인 근거를 채택했다 — 본 검증에서 별도 재현 실행은 하지 않았다. D-34 서버 백스톱으로 실사용 발생 빈도는 낮다고 평가된다."
behavior_unverified_items:
  - truth: "후매수 소진(3단계) 진입 직전 300ms 창에서, 서버가 아직 소진 에코를 보내기 전에 옛 ON 값으로 클라이언트가 재제출하는 창이 실제 생기는지"
    test: "실 서버 대상 UAT — 후매수가 발동·보유중 상태에서 마지막 재진입 소진 시점을 실시간으로 관찰"
    expected: "300ms 창 안에 웹이 옛 ON cfg 를 재제출해 서버가 다시 열어버리는 핑퐁이 생기지 않는다"
    why_human: "실시간 타이밍 경합이라 정적 코드·단위/e2e 테스트로 재현되지 않는다 — 24-09 SUMMARY 도 이 항목을 UAT 로 명시 이월했다"
  - truth: "구서버 buy3Schema=0 에코를 받았을 때 카드 상태 문구·편집 가능 범위가 실제로 오인식되는지(WR-02 재현)"
    test: "가짜 게이트웨이 또는 롤백된 relay 로 buy3Schema 미탑재 에코를 만들어 상따 카드 표시를 관찰"
    expected: "구서버 에코를 오인식해 실제 무장 상태를 잘못 표시하거나 buy_watch_side 를 조용히 지우지 않아야 한다"
    why_human: "현재 프로덕션은 신 스키마로 배포돼 이 경로가 상시 트리거되지 않는다 — 코드상 결함은 확인했으나 실제 화면 오인식 정도는 눈으로 봐야 한다"
human_verification:
  - test: "300ms 창 실기 관찰(24-09 SUMMARY ⑨ · UAT 이월)"
    expected: "후매수 소진 직전 옛 ON 재제출 핑퐁이 관측되지 않는다"
    why_human: "실시간 타이밍 경합, UAT 전용"
  - test: "운영 웹 눈 확인(24-09 SUMMARY ⑥ · UAT 이월) — 상따 카드 매수 LED · 접힌 카드 3장 · DevTools WS lc.snap 의 buy3Schema:1 · 실전략 1건 값 확정→에코"
    expected: "매수 LED 2단계(OFF/감시/보유중) 정상 표시, buy3Schema:1 실제 확인, 값 확정 왕복 정상"
    why_human: "운영 웹 실기 확인 — 배포 직후 미수행으로 명시 이월됨"
  - test: "R6 한방 두 행 수용 여부(24-04 · 24-08 SUMMARY 「사람 확인 남은 항목」 1) — 스케치 009 D 의 한 행과 다른 두 행 UI"
    expected: "사용자가 두 행 레이아웃을 최종 승인하거나 거부"
    why_human: "디자인 채택 여부는 사람 판단 — 실행자는 사용자에게 물을 수 없어 미확정으로 남김(SUMMARY 명시)"
  - test: "24-08 SUMMARY 「사람 확인 남은 항목」 2~9 — 접힌 카드 흐림·L3, 제목줄 줄바꿈 3줄 헤더, 로그 문장 모양, 사전 검증 줄 시각, 무장 불가 패널 문구, 선매수 켬 실제 흐름(탭 이동 없음), 360폭 시딩 값 표시, 라이트/다크 색"
    expected: "스크린샷(reference/24-08-visual/, 8장) 기준으로 시각적으로 허용 가능한지 확인"
    why_human: "시각적 품질·수용 여부 판단 — 자동 측정 불가"
---

# Phase 24: gh-trade 상따 매수주문 3종 분리(선매수·추가매수·후매수) relay·webapp 반영 Verification Report

**Phase Goal:** gh-trade Phase 24 가 상따 매수를 선매수·추가매수·후매수 세 갈래로 나눈 와이어 규약(`SetLimitChaser` append 17필드, `buy3_schema=1`)을 relay 빌더/파서와 webapp 상따 설정 화면에 반영한다 — 구 감시대상 토글·매수 진입 래치(MsgType 38)는 폐기하고, 세 그룹을 독립적으로 켜고 끌 수 있으며, 매수 LED 는 2단계+보유중으로 단순화한다.

**Verified:** 2026-09-28T11:55:00Z (KST 20:55)
**Status:** gaps_found
**Re-verification:** No — initial verification
**요구사항 추적:** 이 phase 의 9개 PLAN 은 모두 `requirements: []` 이다(grep 으로 확인). REQUIREMENTS.md 교차 검증 대상이 없다 — informational only, ORPHANED 요구사항도 없음.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | relay 스키마 재생성이 gh-trade 팁과 드리프트 0 이다 (relay①) | ✓ VERIFIED | `sync-relay-schema.sh --check` 직접 재실행 결과 「신규/변경 예정 : 0 개」·「.fbs 사본 : 최신」(gh-trade `/Users/alex/repos/gh-trade/.claude/worktrees/phase-24-limitchaser-buy3` 대상) |
| 2 | relay 빌더가 `buy3_schema=1` 고정 + C→S 13필드를 싣고 `buy_watch_side`·S→C 4필드를 싣지 않는다 (relay②) | ✓ VERIFIED | `envelope.ts` `LC_FIXED_BUY3_SCHEMA`·`addBuy3Schema`~`addPostBuyOrderQty` 직접 확인, relay 전체 테스트 651/651 통과(직접 재실행) |
| 3 | 에코(60)·열거(64) 파서가 신필드 17개를 읽고 `buy_watch_side` 부재 시 `"0"` 을 만든다 (relay③) | ✓ VERIFIED | `readLimitChaser` 코드 확인 + `envelope.test.ts` 케이스(코드 리뷰 files_reviewed 목록에 포함, relay 전체 테스트 통과에 포함) |
| 4 | MsgType 38(ArmBuyLatchReq) 전송 경로가 완전히 제거됐다 (relay②) | ✓ VERIFIED | `relay/src/dma/msg-type.ts` — 38 은 주석(「구 ArmBuyLatchReq — 폐기·번호 봉인」)만 남고 MSG enum 에 없음 |
| 5 | 구 탭(신필드 없는 lc.set·lc.arm buy)이 세션·계좌 가드 뒤에서 거부 프레임 1건 + 소켓 유지로 처리된다 (24-03) | ✓ VERIFIED | `relay/src/ws/protocol.ts` `buy3CfgOf`·`LC_LEGACY_SET_REJECT_TEXT`·`LC_LEGACY_ARM_REJECT_TEXT`, `fanout.ts` 사용 지점 코드 확인 |
| 6 | 매수 탭이 공통 카드 + 선매수·추가매수·후매수 3장 접이식 카드로 재구성되고 감시대상 토글이 사라졌다 (webapp⑤) | ✓ VERIFIED | `lc-fields.ts`/`setting-group.tsx` 구조 확인, webapp 단위테스트 2681/2681(+1skip) 통과(직접 재실행), e2e P24-2 코드 존재 |
| 7 | 매수 LED 가 2단계(+보유중)로 단순화되고 클릭 불가다 (D-12, webapp⑧) | ✓ VERIFIED | `latch-led.tsx` `BUY_HOLDING_TOOLTIP`·클릭 불가 로직 확인, 24-01 e2e P24-1 |
| 8 | 마스터·그룹 스위치 동반 제출(D-01/D-02 전반)과 서버 접힘 하강 전이 시 마스터 자동 OFF(D-02 후반·D-19)가 구현돼 있다 | ✓ VERIFIED | `limit-chaser-form.tsx` `commitGroupSwitch`/`dropMasterAfterServerFold`, e2e P24-3/P24-4 코드 존재, 24-08 SUMMARY 실브라우저 증거 기술 |
| 9 | 선매수 자동 체크(D-06~D-08) · 사전 검증(D-03·D-10·D-16·D-27) 로직이 구현돼 있다 | ✓ VERIFIED | `preBuyAutoChecksOf`·`groupPrechecksOf` 등 코드 확인, e2e P24-3/P24-5 코드 존재 |
| 10 | axe critical/serious 0, 새 뷰포트 브레이크포인트·색 토큰 0, 44px 행 규약 유지 | ✓ VERIFIED | `a11y.spec.ts` 상따 매수 카드 axe 매트릭스(344·992 × 라이트·다크) 코드 존재, REVIEW.md 가 43개 파일을 검토하며 새 브레이크포인트·토큰 발견 0건으로 보고 |
| 11 | D-14: 구서버 「매수잔량 기준」 운영 전략 목록을 24-12 재기동 전에 읽기전용으로 추출해 보고했다 | ✓ VERIFIED | 24-02-SUMMARY: 읽기전용 도구 + `--self-test` 9건, 추출 결과 「옛 서버 lc.snap 총 2건 · 매수잔량 기준 0건」 |
| 12 | 배포 순서(gh-trade 24-11/24-12·WinForms 발행 → relay → webapp push)가 지켜졌고 smoke·healthz 가 정상이다 | ✓ VERIFIED | 24-09-SUMMARY: relay `94ebc91c`(직전 `2fe94209`) smoke PASS 12·FAIL 0·SKIP 1, master fast-forward push, Vercel Ready, git log 상 배포 기록 커밋 확인 |
| 13 | gh-trade 에 배포 완료를 회신했다 | ✓ VERIFIED (경로 변경) | 24-09-SUMMARY: 원 세션 `gh-trade-38` 소켓 소멸로 후계 세션 `gh-trade-f2` 에 동일 내용 회신(11:27 KST) — 프로세스 이슈일 뿐 코드/배포 결함 아님 |
| 14 | **선매수를 쓰지 않는(금액 0) buy3 전략이 새로고침 뒤에도 정상 편집 가능하다**(3종 분리의 핵심 가치) | ✗ FAILED | WR-01 — `use-lc-field-commit.ts`·`limit-chaser.ts` 가 buy3Schema 무관하게 레거시 특례를 적용 (아래 gaps 참조) |
| 15 | **webapp 이 `buy3Schema` 판별자를 소비해 구서버 에코를 정확히 구분한다** | ✗ FAILED | WR-02 — `grep buy3Schema webapp/src` 는 주석 1건뿐, 편집 시 `buy_watch_side` 조용히 소실 (아래 gaps 참조) |
| 16 | 대기열 확정의 동반 필드가 낡은 값으로 사용자의 최신 확정을 덮지 않는다 | ✗ FAILED | WR-03 (코드 리뷰 근거 채택, 아래 gaps 참조) |
| 17 | `failQueue` 가 동반 필드까지 함께 비교해 성공 판정한다 | ✗ FAILED | WR-04 — 직접 코드 확인(`server[q.field] === q.value` 만, companions 미비교) |
| 18 | 거부·무응답 사유가 다음 무관한 에코에 잘못 귀속되지 않는다 / D-02 후반 자동 OFF 가 폼 인스턴스 전체에서 정확히 1건만 나간다 | ✗ FAILED | WR-05·WR-06 (코드 리뷰 근거 채택, 아래 gaps 참조) |

**Score:** 13/18 truths verified (그 중 1건은 프로세스 경로 변경으로 실질 검증됨), 5건 FAILED(코드 결함), 2건 present-but-behavior-unverified(behavior_unverified_items), 4건 human_verification 대기.

### PLAN must_haves 롤업 (9개 PLAN 공통)

9개 PLAN(24-01~24-09) 각각의 `must_haves.truths`(총 90개 이상)는 SUMMARY 의 coverage 섹션과 대조했고, 다음을 직접 재현·재확인했다:
- `sync-relay-schema.sh --check` 재실행 → 드리프트 0 (재확인, SUMMARY 주장과 일치)
- `pnpm --filter @gh-radar/relay run test` 재실행 → 28 files · 651 passed (재확인, SUMMARY 주장과 일치)
- `pnpm --filter @gh-radar/webapp run test` 재실행 → 125 files · 2681 passed · 1 skipped (재확인, SUMMARY 주장과 일치)
- `MsgType 38`·`buy_watch_side`(Input)·`LC_LEGACY_*_REJECT_TEXT`·`buy3CfgOf`·a11y P24 매트릭스·e2e P24-1~P24-8 존재를 grep/코드 읽기로 직접 확인

개별 PLAN 의 must_haves 는 이 롤업 테스트 실행 범위에 포함돼 있어 별도로 위 18개 표에 흡수했다. 표 14~18 번 항목이 이 롤업에서 걸러지지 않은 **결함**이다 — 즉 PLAN 자체의 `<verify>` 자동 검증은 통과했지만(플랜이 요구한 대로 구현됐음), 코드 리뷰(24-REVIEW.md)가 플랜이 명시하지 않은 실제 운영 시나리오(레거시 특례·대기열 경합·다중 탭)에서 결함을 찾아냈다.

### Requirements Coverage

이 phase 의 모든 PLAN 은 `requirements: []` 이다(24-01~24-09 grep 확인). REQUIREMENTS.md 교차검증 대상 요구사항이 없으며 ORPHANED 항목도 없다.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `webapp/src/components/trading/lc/use-lc-field-commit.ts` | 343-346 | buy3Schema 미확인 레거시 특례 | 🛑 Blocker (WR-01) | 후매수/추가매수 전용 전략 새로고침 뒤 편집 잠김 |
| `webapp/src/lib/limit-chaser.ts` | 527 | 동일 레거시 특례(formFromServer) | 🛑 Blocker (WR-01) | 위와 같음 |
| `webapp/src/lib/__tests__/limit-chaser.test.ts` | 342-344 | 버그 동작을 의도로 단언 | ⚠️ Warning | buy3Schema 케이스 회귀 방지 없음 |
| (전체 webapp/src) | - | `buy3Schema` 미소비(주석 1건 외 0) | ⚠️ Warning (WR-02) | 구서버 에코 오인식 · `buy_watch_side` 조용한 반전 (현재 실사용 피해 0 — D-14 추출 0건) |
| `webapp/src/components/trading/limit-chaser-form.tsx` | 910-937 | 동반 필드 값 스냅샷(함수 아님) | ⚠️ Warning (WR-03) | 대기열 확정 시 낡은 값이 최신 확정을 덮을 수 있음 |
| `webapp/src/components/trading/lc/use-lc-field-commit.ts` | 492-503 | `failQueue` companions 미비교 | ⚠️ Warning (WR-04, 직접 확인) | 동반 마스터 OFF 미전송인데 성공 처리 |
| `webapp/src/components/trading/card/strategy-card.tsx` | 366-372, 480-501, 555-594 | pendingRef 거부/타임아웃 시 미정리 | ⚠️ Warning (WR-05) | 로그 사유 오귀속 |
| `webapp/src/components/trading/limit-chaser-form.tsx` | 989-1034 | 자동 OFF 가드가 폼 인스턴스 범위 한정 | ⚠️ Warning (WR-06) | 다중 탭 동시 편집 되돌림 가능성(빈도 낮음) |
| TBD/FIXME/XXX | - | 없음 | - | grep 결과 0건 |

**Debt marker gate:** `TBD`/`FIXME`/`XXX` 는 이번 phase 수정 파일 전체에서 0건이다 — 게이트 통과.

### Deployment Verification

- `sync-relay-schema.sh --check`(gh-trade 워크트리 대상) 직접 재실행 → 드리프트 0 — **재확인**
- `pnpm --filter @gh-radar/relay run test` 직접 재실행 → 28 files · 651 passed — **재확인**(SUMMARY 주장 635→651 증가는 24-02~24-09 추가 반영, 수치 불일치 아님)
- `pnpm --filter @gh-radar/webapp run test` 직접 재실행 → 125 files · 2681 passed · 1 skipped — **재확인**
- `git status` — 이 검증 시작 시점 작업 트리는 `.planning/state.json`·`milestone.lock`·quick shots·research cache 만 변경, 소스 변경 없음 → 24-09 배포 시점 코드와 현재 검증 대상 코드가 동일함을 확인
- 배포 기록(24-09-SUMMARY): relay `94ebc91c`(직전 `2fe94209`) smoke PASS 12·FAIL 0·SKIP 1, `/healthz` `status:"ok"`·`dma:true`, master fast-forward push, Vercel Ready — SUMMARY 주장을 그대로 신뢰하지 않고 git 커밋(`5ed34373`)·ROADMAP 갱신 존재로 교차 확인
- **중요 발견 — 타이밍:** 24-REVIEW.md 는 `reviewed: 2026-09-28T02:39:05Z`(UTC) = KST 11:39:05 이다. 배포는 KST 11:05~11:27 에 끝났다. 즉 **코드 리뷰가 배포 완료 이후에 실행**됐고, 리뷰가 찾은 6건의 Warning(WR-01~06) 은 리뷰 이후 어떤 수정 커밋도 없이(git log 상 `fa3ca7e4` 문서 커밋만 추가) 그대로 프로덕션에 남아 있다.

### Human Verification Required

1. **300ms 창 실기 관찰(24-09 SUMMARY ⑨)** — 후매수 소진 직전 옛 ON 재제출 핑퐁이 실제로 생기는지, 실 서버에서 관찰이 필요하다.
2. **운영 웹 눈 확인(24-09 SUMMARY ⑥)** — 매수 LED·접힌 카드·`buy3Schema:1`·값 확정 왕복을 실제 프로덕션 화면에서 확인한다.
3. **R6 한방 두 행 수용 여부(24-04·24-08 「사람 확인 남은 항목」 1)** — 실행자가 사용자에게 물을 수 없어 미확정으로 명시적으로 남겨졌다.
4. **24-08 「사람 확인 남은 항목」 2~9** — 흐림/L3 가독성, 3줄 헤더 줄바꿈, 로그 문장 모양, 사전 검증 줄 시각, 무장 불가 패널 문구, 선매수 켬 실제 흐름, 360폭 시딩 값 표시, 라이트/다크 색. 참고 스크린샷 8장은 `.planning/phases/24-limitchaser-buy3/reference/24-08-visual/`.

### Gaps Summary

이 phase 는 relay 와이어·webapp 기본 구조·자동화 테스트(relay 651·webapp 2681)·e2e(P24-1~8)·a11y·배포까지 **PLAN 이 명시한 대로는** 전부 구현·검증됐다. 문제는 PLAN 의 `<verify>` 범위 밖에서 코드 리뷰(24-REVIEW.md)가 찾아낸 **6건의 실제 코드 결함**이 배포 이후에도 수정되지 않고 남아 있다는 점이다.

가장 심각한 것은 **WR-01**이다 — 이 phase 의 표제 목표 자체가 "선매수·추가매수·후매수를 사람이 독립적으로 고른다"(CONTEXT D-05)인데, 선매수를 쓰지 않는 조합(예: 후매수 전용 전략)은 페이지를 새로고침하는 순간 편집이 잠긴다. 직접 코드를 읽어 확인했고(`use-lc-field-commit.ts:343-346`, `limit-chaser.ts:527`), 이 버그를 회귀 방지할 테스트도 없다(`limit-chaser.test.ts:342-344` 는 오히려 버그 동작을 정답으로 단언한다). **WR-02**(buy3Schema 미소비)는 현재 실사용 피해 범위가 0(D-14 추출 결과 매수잔량 기준 전략 0건)이지만, relay 가 명시적으로 "판정은 UI 몫"이라고 위임한 책임을 webapp 이 아무도 이행하지 않은 상태다. WR-03~06 은 코드 리뷰의 구체적 파일·라인 근거를 채택했고 그중 WR-04 는 직접 재확인했다 — 동시성·다중탭 경합이라 실사용 빈도는 낮게 평가되지만 코드 결함 자체는 실재한다.

이 6건 전부 **배포(11:05~11:27 KST) 이후에 실행된 코드 리뷰(11:39 KST)**에서 발견됐고, 이후 수정 커밋이 없다(git log 확인) — 즉 지금 프로덕션에 그대로 올라가 있다.

---

_Verified: 2026-09-28T11:55:00Z_
_Verifier: Claude (gsd-verifier)_
