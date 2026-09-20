---
phase: 17-gh-trade-led
verified: 2026-09-20T20:45:00Z
status: human_needed
score: 21/22 truths verified (1 present-but-behavior-unverified)
covered_files: [".planning/REQUIREMENTS.md",".planning/phases/17-gh-trade-led/17-01-PLAN.md",".planning/phases/17-gh-trade-led/17-01-SUMMARY.md",".planning/phases/17-gh-trade-led/17-02-PLAN.md",".planning/phases/17-gh-trade-led/17-02-SUMMARY.md",".planning/phases/17-gh-trade-led/17-03-PLAN.md",".planning/phases/17-gh-trade-led/17-03-SUMMARY.md",".planning/phases/17-gh-trade-led/17-04-PLAN.md",".planning/phases/17-gh-trade-led/17-04-SUMMARY.md",".planning/phases/17-gh-trade-led/17-05-PLAN.md",".planning/phases/17-gh-trade-led/17-05-SUMMARY.md",".planning/phases/17-gh-trade-led/17-06-PLAN.md",".planning/phases/17-gh-trade-led/17-06-SUMMARY.md",".planning/phases/17-gh-trade-led/17-07-PLAN.md",".planning/phases/17-gh-trade-led/17-07-SUMMARY.md",".planning/phases/17-gh-trade-led/17-08-PLAN.md",".planning/phases/17-gh-trade-led/17-08-SUMMARY.md",".planning/phases/17-gh-trade-led/17-09-PLAN.md",".planning/phases/17-gh-trade-led/17-09-SUMMARY.md",".planning/phases/17-gh-trade-led/17-10-PLAN.md",".planning/phases/17-gh-trade-led/17-10-SUMMARY.md",".planning/phases/17-gh-trade-led/17-11-PLAN.md",".planning/phases/17-gh-trade-led/17-11-SUMMARY.md",".planning/phases/17-gh-trade-led/17-12-PLAN.md",".planning/phases/17-gh-trade-led/17-12-SUMMARY.md",".planning/phases/17-gh-trade-led/17-CONTEXT.md","packages/shared/src/relay.ts","packages/shared/src/strategy-display.ts","relay/src/dma/envelope.ts","relay/src/dma/msg-type.ts","relay/src/hub/subscription-hub.ts","relay/src/ws/fanout.ts","relay/src/ws/protocol.ts","webapp/src/components/orderbook/account-panel.tsx","webapp/src/components/orderbook/relay-status-bar.tsx","webapp/src/components/orderbook/trade-tape.tsx","webapp/src/components/stock/stock-orderbook-section.tsx","webapp/src/components/trading/latch-led.tsx","webapp/src/components/trading/limit-chaser-client.tsx","webapp/src/components/trading/strategy-log.tsx","webapp/src/components/trading/today-orders-card.tsx","webapp/src/components/trading/vi-client.tsx","webapp/src/components/trading/vi-order-list.tsx","webapp/src/lib/order-notices.ts","webapp/src/lib/use-relay-socket.ts"]
covered_digest: "v1:sha256:3439d4dffb0a9a393b1f23d509c09453be3902899c0bdbe190350b7652ec18d4"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "gh-trade 게이트웨이 HEAD 실기(mock 또는 실서버)로 76/77/78 드롭 0 과 lc.arm → 36/37/38 → 60 에코 래치 색 전환 왕복이 실제로 관측된다 (D-25, TRADE-04·TRADE-05 정의문의 조건)"
    test: "sudo xcodebuild -license 동의 → gh-trade server HEAD 재빌드(`./scripts/build.sh --server-only`) → `./scripts/run-mac.sh` → `./dev.sh --with-relay` 로 relay dev(ws:8090)+webapp dev(3100) 기동 → `/trading/limit-chaser` 에서 매수/매도/취소 LED 클릭 → 60 에코 색 전환 확인, 또는 다음 장중 프로덕션에서 같은 클릭 관찰"
    expected: "클릭 즉시 `{t:\"lc.arm\"}` 1건이 나가고 relay 로그에 unknown-msg-type warn 없이 60 에코가 도착해 LED 색이 바뀐다. 무장 위반 클릭에서는 서버 한글 WARN 문구가 상태바에 뜬다"
    why_human: "코드 층위(파서·가드·zod·빌더)는 단위·통합 테스트(ws-latch.test.ts 19케이스가 fake-gateway 로 페이로드 디코드까지 단언, rate-cross.test.ts 가 드롭 0 을 스파이로 단언)로 전부 닫혀 있으나, 실제 gh-trade 게이트웨이(HEAD 스키마)와의 왕복은 Xcode 27.0 라이선스 미동의로 로컬 mock 빌드가 불가능했고 실서버 배포 직후에도 일요일 장 마감이라 관측 기회가 없었다. 이 왕복은 정적 분석이나 grep 으로 증명할 수 없는 런타임 사실이다"
---

# Phase 17: gh-trade 프로토콜 재동기화·기존 화면 보정·상따 래치 LED Verification Report

**Phase Goal:** relay 가 gh-trade 서버 HEAD 스키마와 같은 언어를 말하고, 서버가 이미 보내는 진실(래치 3종·매수/매도 체결구분·KRX 종가·예약/접수대기/시간외종가 미체결·정정취소 요청 종류·VI 거래소)이 기존 웹 화면에 그대로 드러난다. 상따 화면은 C# 클라이언트와 같은 3단계 래치 LED(회색/주황/초록)를 보여 주고 클릭으로 수동 점등·해제(36/37/38)한다. 신규 MsgType 76/77/78 은 파싱해 브라우저 프레임으로 전달하며 드롭 경고가 0 이 된다.
**Verified:** 2026-09-20 (KST 20:45)
**Status:** human_needed
**Re-verification:** No — initial verification

## 서론 — 이 보고서가 확인한 것과 확인하지 않은 것

이 phase 는 코드 층위(relay 파서/조립기/hub 라우팅/webapp 소비 화면)를 모두 직접 읽고, 세 가지 자동 게이트를 이 세션에서 **직접 재실행**해 확인했다 — SUMMARY.md 의 주장을 그대로 믿지 않았다.

- `pnpm --filter @gh-radar/relay run test` → **467 passed / 19 files** (재실행 확인, SUMMARY 주장과 일치)
- `pnpm --filter @gh-radar/webapp run test` → **998 passed · 1 skipped / 73 files** (재실행 확인)
- `pnpm typecheck` (루트, 13 workspace) → **exit 0**, 모든 workspace `Done`
- `cd /Users/alex/repos/gh-trade/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check` → 생성 44 · **신규/변경 예정 0** · 삭제 없음 (재실행 확인)
- `curl https://dma.jx1.io/healthz` → `{"status":"ok","vpn":true,"dma":true,"version":"ef1499a","sessionCount":1,"everReadyCount":1,"stalledCount":0}` — 프로덕션 relay 가 이 phase 의 배포 커밋(`ef1499a`)으로 살아 있음을 독립적으로 확인

Playwright e2e(135 passed · 9 skipped · 0 failed)는 이 세션에서 재실행하지 않았다 — 과제 지시(`what_i_most_want_checked`)가 재확인 대상으로 relay test·webapp test·루트 typecheck 세 가지만 지목했고, 전체 e2e 는 2.7분·dev 서버 필요라 범위 밖으로 판단했다. 대신 e2e 스펙 파일 자체(`trading-limit-chaser.spec.ts`, `trading-vi.spec.ts`)의 LED/거래소 열 단언 코드를 읽어 주장과 부합함을 확인했다.

**알려진, 새로 발견하지 않은 사실 (그대로 보고만 함):**
1. TRADE-04·TRADE-05 는 REQUIREMENTS.md 정의부·Traceability 양쪽에서 **의도적으로 Pending** — 코드 층위는 닫혔으나 실기 게이트웨이 왕복이 0회다(Phase 16 TRADE-03 선례와 같은 기준).
2. WINDOWS #17(D-25 mock 게이트웨이 실기 검증 미수행)은 **의도적으로 open** — Xcode 27.0 라이선스 미동의로 gh-trade HEAD 재빌드 불가. 유일하게 실행 가능한 구형 바이너리(2026-09-13)에는 78·36/37/38·`krx_close_price`·`request_kind` 심볼이 0건이라, 돌리면 거짓 「드롭 0」이 된다.
3. Phase 17 은 **프로덕션에 배포 완료**됐다 — relay `ef1499a`(smoke 12 PASS · 0 FAIL · 1 SKIP), webapp 동일 커밋, `/healthz` 정상. 이 사실은 이 세션에서 `curl` 로 독립 재확인했다.
4. `gsd-tools check tdd-red-evidence` 는 이 저장소(vitest)에서 구조적으로 무용 — 7개 plan 이 프로즈 표로 RED 증거를 대신 기록한 것은 TDD 위반이 아니라 도구 공백에 대한 정당한 대응.
5. `sideDisplayText` 접미(누적)는 사용자가 명시 승인한 편차(`NotificationHub.cs:172` 동형).

## 신규로 확인한 사실 (이 검증이 찾아낸 것)

**ROADMAP.md·STATE.md 가 최종 배포 완결 커밋(`e342dd2`) 이후 갱신되지 않았다.** `git log --oneline -1 -- .planning/ROADMAP.md` → `ef1499a`(배포 부분 실행·반쪽 상태 시점)가 마지막 갱신이고, 그 뒤 relay 배포가 완결된 `e342dd2` 커밋은 `17-12-SUMMARY.md` 한 파일만 고쳤다. 그 결과 지금 디스크의 ROADMAP.md 는:
- `**Plans:** 12/12 plans executed (8 waves) — 17-12 는 배포 승인 checkpoint 에서 정지(`status: halted`)` — SUMMARY 는 이미 `status: complete` 다.
- `**잔여 (phase 를 닫으려면 이 둘):** ① D-25 … ② relay 배포 완결 —` 라고 적혀 있으나, relay 는 이미 배포됐다(`ef1499a`, 위 `/healthz` 로 독립 확인). 잔여는 사실상 ①(D-25) 하나뿐이다.

STATE.md 도 같은 시점(`last_updated: "2026-09-20T10:35:18.321Z"`, 즉 KST 19:35 경 — relay 배포 완결 전)에 멈춰 있고, `status: awaiting-user` · `stopped_at: 17-12 Task 5 — relay 배포가 권한 게이트에 거부됨` · "🚨 프로덕션이 반쪽 상태다" 문단이 그대로 남아 있다.

이것은 phase 의 코드 전달(TRADE-04·TRADE-05 의 실제 구현)과는 무관하지만, **다음 세션이 이 문서만 읽으면 이미 해소된 문제(반쪽 배포)를 다시 조사하거나 relay 를 중복 배포하려 들 수 있다**는 점에서 실질적 위험이다. WINDOWS.md 는 올바르게 최신 상태다(#12·#13·#14·#15·#16 fixed, #17 만 open) — 갱신 누락은 ROADMAP.md·STATE.md 두 파일에 한정된다.

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `relay/src/generated` 가 gh-trade HEAD 스키마와 같고 `sync-relay-schema.sh --check` 차이 0 (D-01) | ✓ VERIFIED | 이 세션에서 직접 재실행 — 생성 44 · 신규/변경 0 · 삭제 없음 |
| 2  | MSG 6종(36/37/38/76/77/78) 화이트리스트·명시 등록 (D-02) | ✓ VERIFIED | `relay/src/dma/msg-type.ts` `MSG` 객체 + `INBOUND_MSG_TYPES` 22종에 76/77/78 포함, 요청 36/37/38 도 등록됨 |
| 3  | 게이트웨이 60 에코의 `cancel_entry_latched`·`buy_entry_latched` 원값이 브라우저 `lc` 프레임까지 도달 (D-05) | ✓ VERIFIED | `envelope.ts` → `relay.ts` `RelayLimitChaser` → `use-relay-socket.ts` `case "lc"` → `latch-led.tsx` `server.cancelEntryLatched`/`buyEntryLatched` 소비 확인 |
| 4  | 호가 프레임 KRX 종가(`kc`), 체결 테이프 체결구분(`bs`) 적재 (D-10·D-11) | ✓ VERIFIED | `trade-tape.tsx` `tapeSidesOf` bs 우선 판정, `stock-orderbook-section.tsx`/`limit-chaser-client.tsx` `quote?.kc` 사용 확인 |
| 5  | 미체결 행이 `queuedStatus`·`pendingStatus`·`board`·`pendingCancelSent`·`orderTime` 을 싣는다 (D-07) | ✓ VERIFIED | `account-panel.tsx`·`vi-client.tsx` 소비 확인 |
| 6  | 주문 통보가 `board`·`requestKind`·`requester` 를 싣고 `message` 문구를 파싱하지 않는다 (D-08) | ✓ VERIFIED | `webapp/src/lib/order-notices.ts` `orderActionWord`/`orderNoticeMeta` — `noticeType`/`requestKind` 동등 비교만, `message` 미참조 |
| 7  | 76/77/78 이 `unknown-msg-type` 경고 없이 파싱돼 브라우저까지 내려간다 (D-02·D-03) | ✓ VERIFIED | `subscription-hub.ts` 명시 `case MSG.RateCrossAlert/RateCrossSnapshot/QueuedWindowState` + 세션 캐시 + `fanout.ts` 인증 직후 `rate.cross.snap`/`queued.window` 스냅샷 송신 코드 확인. 단위 테스트(`rate-cross.test.ts` 369줄)가 드롭 0 을 스파이로 단언 |
| 8  | 세션 Ready 전 76 은 캐시만, 팬아웃 안 됨 (D-03) | ✓ VERIFIED | `#onRateCrossAlert` 캐시-먼저-팬아웃-나중 주석 및 구조 확인 |
| 9  | `{t:"lc.arm"}` → relay 가 `get_strategy_req.key` 채운 36/37/38 Envelope 을 세션으로 송신, `lc.set` 과 동형 가드 (D-04) | ✓ VERIFIED (코드 층위) | `fanout.ts` `ARM_LATCH_MSG_TYPE` 매핑 + `lc.arm` 분기, `ws-latch.test.ts` 553줄이 `fake-gateway` 로 페이로드 디코드까지 단언 — **단, 실제 게이트웨이 왕복은 미관측(아래 behavior_unverified #1)** |
| 10 | VI 전략·통보·목록이 거래소 축을 갖고, `GetVITriggerReq(21)` 을 KRX·NXT 2회 송신 (D-06) | ✓ VERIFIED | `strategy-hub.test.ts` `strategyReqCount(MSG.GetVITriggerReq)).toBe(2)` + `viGetExchanges()).toEqual(["KRX","NXT"])`, `use-relay-socket.ts` `case "vi"` 거래소별 병합 |
| 11 | VI 웹 표면이 거래소별 3상태·가동 배지 합집합·거래소 열을 보여준다 (D-18) | ✓ VERIFIED | `vi-client.tsx` `exchangeFilter`, `vi-order-list.tsx` `row.item.exchange` 열 2곳 |
| 12 | 상따 래치 LED 3종 색·클릭 가능 규칙이 C# 정본과 일치 (D-19) | ✓ VERIFIED | `latch-led.tsx` `latchLedStateOf` — 매도/취소/매수 3분기가 D-19 문서 규칙과 축자 일치(취소 무장 = `cancelQtyEnabled \|\| cancelTradeEnabled`, `cancelQtyTrackEnabled` 미포함 확인) |
| 13 | LED 가 색만이 아니라 텍스트 라벨(OFF/대기/감시)을 함께 싣는다 (D-21·WCAG 1.4.1) | ✓ VERIFIED | `latch-led.tsx` `state.label` 이 보이는 텍스트로 렌더 |
| 14 | 상따 상태줄에 LED 3개가 매수·매도·취소 순으로 있고 클릭 시 확인 다이얼로그 없이 `lc.arm` 1건 (D-20·D-22) | ✓ VERIFIED | `limit-chaser-client.tsx` `handleArm` — `clickable` 재검증 후 `send({t:"lc.arm",...})`, 다이얼로그 없음 |
| 15 | 전략 로그가 취소·매수 래치 전이 4종을 구분 (D-23) | ✓ VERIFIED | `strategy-log.tsx` `buyLatched/buyUnlatched/cancelLatched/cancelUnlatched` 4종 + prev/next 비교 로직 |
| 16 | `ServerMessage.source` 배지 `[상따]`/`[VI]`/`[서버]` (D-09·D-17) | ✓ VERIFIED | `packages/shared/src/strategy-display.ts` `serverMsgBadge()`, 3개 표면(`limit-chaser-client.tsx`·`vi-client.tsx`·`relay-status-bar.tsx`)에서 소비 |
| 17 | 미체결 표식이 `sideDisplayText` 한 함수로만 생성됨 (D-13) | ✓ VERIFIED | `account-panel.tsx`·`vi-client.tsx` 모두 `sideDisplayText` import·호출, 인라인 접미 없음 |
| 18 | `pendingCancelSent` bool 하나가 취소보관 회색·버튼숨김의 유일한 근거 (D-14) | ✓ VERIFIED | `account-panel.tsx` `!row.pendingCancelSent` 조건으로만 취소 가능 판정, `pendingStatus` 문구 비교 없음 |
| 19 | 자동주문 매도 접수·체결이 3초 창으로 묶이고 순수함수 하나가 담당 (D-16) | ✓ VERIFIED | `order-notices.ts` `mergeOrderNotices`, `today-orders-card.tsx` 가 그 결과만 호출 |
| 20 | 전량 게이트(relay·webapp·typecheck)가 green (D-24) | ✓ VERIFIED | 이 세션에서 재실행 — relay 467/467, webapp 998+1skip, 루트 typecheck exit 0 |
| 21 | TRADE-04·TRADE-05 가 REQUIREMENTS.md 정의부·Traceability 양쪽에서 같은 판정(Pending)으로 기록 | ✓ VERIFIED | `grep '\[.\] \*\*TRADE-0[45]\*\*'` → 둘 다 `[ ]`; Traceability 표 두 행 모두 **Pending** + 조항별 근거 |
| 22 | mock 게이트웨이(서버 HEAD)로 76/77/78 드롭 0 과 LED 클릭 왕복이 실제로 관측됐다 (D-25) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | 코드는 전부 쓰여 있고 단위/통합 테스트로 페이로드까지 단언됐으나, **실제 gh-trade 게이트웨이(HEAD 스키마)와의 런타임 왕복은 관측되지 않았다** — Xcode 라이선스 게이트로 mock 빌드 불가, 프로덕션 배포 이후는 일요일 장 마감으로 관측 기회 없음 |

**Score:** 21/22 truths verified (1 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `relay/src/generated/stock-dma/rate-cross-alert.ts` 외 78/77 생성물 | 재생성된 flatbuffers 코덱 | ✓ VERIFIED | `sync-relay-schema.sh --check` 차이 0 으로 최신성 확인 |
| `packages/shared/src/strategy-display.ts` | `sideDisplayText`·`serverMsgBadge` | ✓ VERIFIED | 존재·양쪽 함수 정의·다수 소비처 확인 |
| `relay/tests/ws-latch.test.ts` | `lc.arm` 왕복 19케이스 | ✓ VERIFIED | 553줄, fake-gateway 페이로드 디코드 단언 포함 |
| `relay/tests/rate-cross.test.ts` | 76/77/78 드롭 0 단언 | ✓ VERIFIED | 369줄 |
| `webapp/src/components/trading/latch-led.tsx` | LED 컴포넌트 + 순수 판정 함수 | ✓ VERIFIED | D-19 규칙표와 축자 일치 |
| `webapp/src/lib/order-notices.ts` | 행위 단어·3초 묶기 순수함수 | ✓ VERIFIED | `orderActionWord`·`mergeOrderNotices` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `relay/src/dma/msg-type.ts` `INBOUND_MSG_TYPES` | `subscription-hub.ts` `#onFrame` switch | 명시 case 3개(76/77/78) | ✓ WIRED | grep 으로 대응 case 3개 확인 |
| `readLimitChaser()` (envelope.ts) | webapp `lc` 리듀서 | `RelayLimitChaser` 계약 | ✓ WIRED | `use-relay-socket.ts` `case "lc"` |
| `webapp {t:"lc.arm"}` | `fanout.ts` `lc.arm` 분기 | `buildArmLatchReq` → DMA 세션 send | ✓ WIRED | 코드·테스트 확인. **게이트웨이까지의 실제 왕복은 미관측** |
| `buildGetVITriggerReq(exchange)` | `#viTriggers` 캐시 → fanout 스냅샷 | 21 요청 거래소 FIFO | ✓ WIRED | `strategy-hub.test.ts` FIFO 귀속 케이스 확인 |
| `RelayTapeEntry.bs` | `tapeSidesOf()` | 매수/매도 색·sr-only | ✓ WIRED | `trade-tape.tsx` |
| `RelayQuote.kc` | 호가 종목정보/상따 헤더 | `kc > 0 → '종가'` | ✓ WIRED | 두 표면 모두 확인 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| relay 단위 테스트 전체 통과 | `pnpm --filter @gh-radar/relay run test` | 467 passed / 19 files | ✓ PASS |
| webapp 단위 테스트 전체 통과 | `pnpm --filter @gh-radar/webapp run test` | 998 passed · 1 skipped / 73 files | ✓ PASS |
| 루트 타입체크 | `pnpm typecheck` | 13 workspace 전부 Done, exit 0 | ✓ PASS |
| 스키마 재동기화 차이 0 | `RELAY=... ./scripts/sync-relay-schema.sh --check` | 생성 44 · 신규/변경 0 | ✓ PASS |
| 프로덕션 relay 배포 확인 | `curl https://dma.jx1.io/healthz` | `version:"ef1499a"`, `dma:true` | ✓ PASS |
| gh-trade HEAD 게이트웨이 실기 왕복(76/77/78 드롭 0·36/37/38 래치 색 전환) | (Xcode 라이선스 게이트로 실행 불가) | — | ? SKIP → 인간 검증으로 라우팅 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| TRADE-04 | 17-01~17-11 (신규 등록 09-08 문구는 오기, 실제 신규 등록은 17-01) | 프로토콜 재동기화·신규 푸시 중계·기존 화면 보정 | 코드 층위 SATISFIED, 문서상 **Pending 유지(의도적)** | 위 Truth 1~11,16~19,20 + REQUIREMENTS.md Traceability 행 |
| TRADE-05 | 17-04, 17-07, 17-11 | 상따 래치 LED 3종 + 수동 점등 | 코드 층위 SATISFIED, 문서상 **Pending 유지(의도적)** | 위 Truth 3,9,12~15 + REQUIREMENTS.md Traceability 행 |

두 요구사항 모두 REQUIREMENTS.md 자체가 "코드 층위는 닫혔으나 실기 왕복·배포 확증 미완"이라는 근거로 Pending 을 유지하고 있으며, 이 검증은 그 판정이 **정직하고 내적으로 일관됨**을 확인했다(정의부 체크박스와 Traceability 판정이 갈리지 않는다).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | 이 phase 가 만든 신규/수정 파일에서 TBD·FIXME·XXX·placeholder·coming soon 류 디버트 마커 검색 결과 0건 | — | grep 스캔 결과 없음 — 문제 아님 |
| `.planning/ROADMAP.md`, `.planning/STATE.md` | — | 배포 완결(`e342dd2`) 이후 갱신되지 않은 서술 — "relay 미배포"·"반쪽 상태"·"status: halted" 문구가 실제로는 해소된 사실과 어긋남 | ⚠️ Warning | 코드/배포 자체에는 영향 없음. 다음 세션이 이미 끝난 relay 배포를 다시 조사·재시도할 위험 |

### Human Verification Required

### 1. gh-trade 게이트웨이 HEAD 와의 실기 왕복 — 76/77/78 드롭 0, `lc.arm` → 36/37/38 → 60 에코 LED 색 전환

**Test:** ① `sudo xcodebuild -license` 로 Xcode 27.0 동의(사람만 가능) → `cd /Users/alex/repos/gh-trade/server && ./scripts/build.sh --server-only` 로 HEAD 재빌드 → `./scripts/run-mac.sh` → `cd /Users/alex/repos/gh-radar && ./dev.sh --with-relay`(webapp:3100, relay ws:8090) → `/trading/limit-chaser` 에서 계좌 연결 후 매수/매도/취소 LED 를 순서대로 클릭. 또는, 다음 거래일 장중 프로덕션에서 같은 조작을 관찰(17-12-SUMMARY §④ 6항목 체크리스트).
**Expected:** relay 로그에 `unknown-msg-type` warn 이 76/77/78 프레임 수신 중 0건이고, LED 클릭이 60 에코로 즉시 색이 바뀌며(주황↔초록), 무장 위반 클릭에서는 서버 한글 WARN 문구가 상태바에 그대로 뜬다.
**Why human:** relay·webapp 코드는 모두 존재하고 페이로드 구조까지 단위 테스트(`ws-latch.test.ts`)로 잠겨 있지만, 실제 gh-trade 게이트웨이(HEAD 스키마)와의 왕복 자체는 이 저장소 안에서 재현할 수 없다 — 필요한 서버 바이너리 재빌드가 사람의 `sudo` 동의를 요구하는 Xcode 라이선스 게이트에 막혀 있다. 이것은 Phase 17 코드의 결함이 아니라 검증 환경의 한계이며, WINDOWS #17 이 이미 open 상태로 이 사실을 추적하고 있다.

## Gaps Summary

코드 층위(relay 파서·조립기·hub 라우팅·webapp 소비 화면 전부)는 이 phase 의 목표를 완전히 만족한다 — 22개 관찰 가능한 진실 중 21개가 정적 분석 + 재실행한 자동 테스트로 VERIFIED 됐다. 유일한 미해결 항목은 gh-trade 게이트웨이 HEAD 와의 **실제 런타임 왕복**(D-25)이며, 이는 이 phase 의 SUMMARY·REQUIREMENTS.md·WINDOWS.md 가 이미 정직하게 "Pending"·"open"으로 기록해 둔 것과 정확히 같은 항목이다 — 이 검증이 축소하거나 과장하지 않고 그대로 확인했다.

추가로, 이 검증은 **ROADMAP.md·STATE.md 가 최종 배포 완결(`e342dd2`) 이후 갱신되지 않아 이미 해소된 "relay 미배포/반쪽 상태"를 여전히 미해결로 서술하고 있음**을 발견했다. 코드 정확성에는 영향이 없으나, 다음 세션의 혼선을 막기 위해 두 파일을 `17-12-SUMMARY.md` §⑦의 사실(relay `ef1499a` 배포 완료·smoke 12 PASS·healthz 정상)에 맞춰 갱신할 것을 권고한다.

---

*Verified: 2026-09-20T20:45:00Z*
*Verifier: Claude (gsd-verifier)*
