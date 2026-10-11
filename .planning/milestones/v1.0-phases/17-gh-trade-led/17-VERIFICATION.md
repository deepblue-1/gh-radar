---
phase: 17-gh-trade-led
verified: 2026-09-21T18:10:00Z
status: passed
score: 22/22 truths verified (2026-09-21 핫픽스 b31435b 회귀 재검증 포함, 회귀 0건)
covered_files: [".planning/REQUIREMENTS.md",".planning/debug/resolved/lc-unacked-stuck-new-route.md",".planning/phases/17-gh-trade-led/17-01-PLAN.md",".planning/phases/17-gh-trade-led/17-01-SUMMARY.md",".planning/phases/17-gh-trade-led/17-02-PLAN.md",".planning/phases/17-gh-trade-led/17-02-SUMMARY.md",".planning/phases/17-gh-trade-led/17-03-PLAN.md",".planning/phases/17-gh-trade-led/17-03-SUMMARY.md",".planning/phases/17-gh-trade-led/17-04-PLAN.md",".planning/phases/17-gh-trade-led/17-04-SUMMARY.md",".planning/phases/17-gh-trade-led/17-05-PLAN.md",".planning/phases/17-gh-trade-led/17-05-SUMMARY.md",".planning/phases/17-gh-trade-led/17-06-PLAN.md",".planning/phases/17-gh-trade-led/17-06-SUMMARY.md",".planning/phases/17-gh-trade-led/17-07-PLAN.md",".planning/phases/17-gh-trade-led/17-07-SUMMARY.md",".planning/phases/17-gh-trade-led/17-08-PLAN.md",".planning/phases/17-gh-trade-led/17-08-SUMMARY.md",".planning/phases/17-gh-trade-led/17-09-PLAN.md",".planning/phases/17-gh-trade-led/17-09-SUMMARY.md",".planning/phases/17-gh-trade-led/17-10-PLAN.md",".planning/phases/17-gh-trade-led/17-10-SUMMARY.md",".planning/phases/17-gh-trade-led/17-11-PLAN.md",".planning/phases/17-gh-trade-led/17-11-SUMMARY.md",".planning/phases/17-gh-trade-led/17-12-PLAN.md",".planning/phases/17-gh-trade-led/17-12-SUMMARY.md",".planning/phases/17-gh-trade-led/17-CONTEXT.md",".planning/phases/17-gh-trade-led/17-UAT.md","packages/shared/src/relay.ts","packages/shared/src/strategy-display.ts","relay/src/dma/envelope.ts","relay/src/dma/msg-type.ts","relay/src/hub/subscription-hub.ts","relay/src/ws/fanout.ts","relay/src/ws/protocol.ts","webapp/src/components/orderbook/account-panel.tsx","webapp/src/components/orderbook/relay-status-bar.tsx","webapp/src/components/orderbook/trade-tape.tsx","webapp/src/components/stock/stock-orderbook-section.tsx","webapp/src/components/trading/latch-led.tsx","webapp/src/components/trading/limit-chaser-client.tsx","webapp/src/components/trading/limit-chaser-form.tsx","webapp/src/components/trading/strategy-log.tsx","webapp/src/components/trading/today-orders-card.tsx","webapp/src/components/trading/vi-client.tsx","webapp/src/components/trading/vi-order-list.tsx","webapp/src/lib/limit-chaser.ts","webapp/src/lib/order-notices.ts","webapp/src/lib/relay-provider.tsx","webapp/src/lib/use-relay-socket.ts"]
covered_digest: "v1:sha256:12fc46b712b39bd8cd7788e6aafc18de0411d6904ed93a072829eb661d2b1911"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: "22/22 (2026-09-20 초기 검증 21/22 + 2026-09-21 프로덕션 실기 관측으로 D-25 1건 닫힘, 핫픽스 이전 상태)"
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 17: gh-trade 프로토콜 재동기화·기존 화면 보정·상따 래치 LED Verification Report

**Phase Goal:** relay 가 gh-trade 서버 HEAD 스키마와 같은 언어를 말하고, 서버가 이미 보내는 진실(래치 3종·매수/매도 체결구분·KRX 종가·예약/접수대기/시간외종가 미체결·정정취소 요청 종류·VI 거래소)이 기존 웹 화면에 그대로 드러난다. 상따 화면은 C# 클라이언트와 같은 3단계 래치 LED(회색/주황/초록)를 보여 주고 클릭으로 수동 점등·해제(36/37/38)한다. 신규 MsgType 76/77/78 은 파싱해 브라우저 프레임으로 전달하며 드롭 경고가 0 이 된다.
**Verified:** 2026-09-21 (KST 18:10) — 2026-09-20 초기 검증 + 2026-09-21 프로덕션 실기 관측 + 2026-09-21 핫픽스(`b31435b`) 회귀 재검증, 3라운드 누적
**Status:** passed
**Re-verification:** Yes — 프로덕션 핫픽스(`b31435b`)가 이 phase 의 `covered_files` 7개를 건드려 트리거된 회귀 재검증

## 서론 — 이 보고서가 확인한 것과 확인하지 않은 것

이 phase 는 코드 층위(relay 파서/조립기/hub 라우팅/webapp 소비 화면)를 모두 직접 읽고, 세 가지 자동 게이트를 이 세션에서 **직접 재실행**해 확인했다 — SUMMARY.md 의 주장을 그대로 믿지 않았다.

- `pnpm --filter @gh-radar/relay run test` → **467 passed / 19 files** (재실행 확인, SUMMARY 주장과 일치)
- `pnpm --filter @gh-radar/webapp run test` → **998 passed · 1 skipped / 73 files** (재실행 확인)
- `pnpm typecheck` (루트, 13 workspace) → **exit 0**, 모든 workspace `Done`
- `cd /Users/alex/repos/gh-trade/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check` → 생성 44 · **신규/변경 예정 0** · 삭제 없음 (재실행 확인)
- `curl https://dma.jx1.io/healthz` → `{"status":"ok","vpn":true,"dma":true,"version":"ef1499a","sessionCount":1,"everReadyCount":1,"stalledCount":0}` — 프로덕션 relay 가 이 phase 의 배포 커밋(`ef1499a`)으로 살아 있음을 독립적으로 확인

Playwright e2e(135 passed · 9 skipped · 0 failed)는 이 세션에서 재실행하지 않았다 — 과제 지시(`what_i_most_want_checked`)가 재확인 대상으로 relay test·webapp test·루트 typecheck 세 가지만 지목했고, 전체 e2e 는 2.7분·dev 서버 필요라 범위 밖으로 판단했다. 대신 e2e 스펙 파일 자체(`trading-limit-chaser.spec.ts`, `trading-vi.spec.ts`)의 LED/거래소 열 단언 코드를 읽어 주장과 부합함을 확인했다.

**알려진, 새로 발견하지 않은 사실 (그대로 보고만 함):**
1. TRADE-04·TRADE-05 는 REQUIREMENTS.md 정의부(`[x]`)·Traceability(양쪽 **Complete**) 양쪽에서 **2026-09-21 프로덕션 장중 실기 관측**으로 재판정됐다 — 코드 층위 SATISFIED + 실서버 관측 완료. 정의부 체크박스와 Traceability 판정이 갈리지 않음을 확인.
2. WINDOWS #17(D-25 mock 게이트웨이 실기 검증)은 mock 이 아니라 **실서버 관측으로 닫혔다** — Xcode 27.0 라이선스 게이트는 우회한 것이 아니라 불필요해졌다.
3. Phase 17 은 **프로덕션에 배포 완료**됐다 — relay `ef1499a`(smoke 12 PASS · 0 FAIL · 1 SKIP), webapp 동일 계열, `/healthz` 정상. 이 사실은 이 세션에서 `curl` 로 독립 재확인했다.
4. `gsd-tools check tdd-red-evidence` 는 이 저장소(vitest)에서 구조적으로 무용 — 7개 plan 이 프로즈 표로 RED 증거를 대신 기록한 것은 TDD 위반이 아니라 도구 공백에 대한 정당한 대응.
5. `sideDisplayText` 접미(누적)는 사용자가 명시 승인한 편차(`NotificationHub.cs:172` 동형).

## 신규로 확인한 사실 (이 검증이 찾아낸 것)

**ROADMAP.md·STATE.md 가 최종 배포 완결 커밋(`e342dd2`) 이후 갱신되지 않았다.** `git log --oneline -1 -- .planning/ROADMAP.md` → `ef1499a`(배포 부분 실행·반쪽 상태 시점)가 마지막 갱신이고, 그 뒤 relay 배포가 완결된 `e342dd2` 커밋은 `17-12-SUMMARY.md` 한 파일만 고쳤다. 그 결과 지금 디스크의 ROADMAP.md 는:
- `**Plans:** 12/12 plans executed (8 waves) — 17-12 는 배포 승인 checkpoint 에서 정지(`status: halted`)` — SUMMARY 는 이미 `status: complete` 다.
- `**잔여 (phase 를 닫으려면 이 둘):** ① D-25 … ② relay 배포 완결 —` 라고 적혀 있으나, relay 는 이미 배포됐다(`ef1499a`, 위 `/healthz` 로 독립 확인). D-25 도 이제 닫혔으므로(위 §1·§2) 잔여는 사실상 없다.

STATE.md 도 같은 시점(`last_updated: "2026-09-20T10:35:18.321Z"`, 즉 KST 19:35 경 — relay 배포 완결 전)에 멈춰 있고, `status: awaiting-user` · `stopped_at: 17-12 Task 5 — relay 배포가 권한 게이트에 거부됨` · "🚨 프로덕션이 반쪽 상태다" 문단이 그대로 남아 있다.

이것은 phase 의 코드 전달(TRADE-04·TRADE-05 의 실제 구현)과는 무관하지만, **다음 세션이 이 문서만 읽으면 이미 해소된 문제(반쪽 배포·D-25)를 다시 조사하려 들 수 있다**는 점에서 실질적 위험이다. WINDOWS.md 는 이제 #17 까지 fixed 로 최신 상태다(2026-09-21 실기 관측 반영) — 갱신 누락은 ROADMAP.md·STATE.md 두 파일에 한정된다. 이 발견은 코드 정확성과 무관해 `passed` 판정을 바꾸지 않는다.

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `relay/src/generated` 가 gh-trade HEAD 스키마와 같고 `sync-relay-schema.sh --check` 차이 0 (D-01) | ✓ VERIFIED | 이 세션에서 직접 재실행 — 생성 44 · 신규/변경 0 · 삭제 없음 |
| 2  | MSG 6종(36/37/38/76/77/78) 화이트리스트·명시 등록 (D-02) | ✓ VERIFIED | `relay/src/dma/msg-type.ts` `MSG` 객체 + `INBOUND_MSG_TYPES` 22종에 76/77/78 포함, 요청 36/37/38 도 등록됨. 핫픽스가 이 파일을 건드리지 않음(회귀 없음) |
| 3  | 게이트웨이 60 에코의 `cancel_entry_latched`·`buy_entry_latched` 원값이 브라우저 `lc` 프레임까지 도달 (D-05) | ✓ VERIFIED | `envelope.ts` → `relay.ts` `RelayLimitChaser` → `use-relay-socket.ts` `case "lc"` → `latch-led.tsx` `server.cancelEntryLatched`/`buyEntryLatched` 소비 확인. 핫픽스가 `case "lc"` 에 `lastLimitChaserEcho: frame.item` 필드 하나를 **추가만** 했고, 기존 `limitChasers: upsertLimitChaser(...)` 반환문은 그대로다 — 회귀 없음 |
| 4  | 호가 프레임 KRX 종가(`kc`), 체결 테이프 체결구분(`bs`) 적재 (D-10·D-11) | ✓ VERIFIED | `trade-tape.tsx` `tapeSidesOf` bs 우선 판정, `stock-orderbook-section.tsx`/`limit-chaser-client.tsx` `quote?.kc` 사용 확인. 핫픽스 파일 목록에 없음 — 무영향 |
| 5  | 미체결 행이 `queuedStatus`·`pendingStatus`·`board`·`pendingCancelSent`·`orderTime` 을 싣는다 (D-07) | ✓ VERIFIED | `account-panel.tsx`·`vi-client.tsx` 소비 확인. 핫픽스 무관 |
| 6  | 주문 통보가 `board`·`requestKind`·`requester` 를 싣고 `message` 문구를 파싱하지 않는다 (D-08) | ✓ VERIFIED | `webapp/src/lib/order-notices.ts` `orderActionWord`/`orderNoticeMeta` — `noticeType`/`requestKind` 동등 비교만, `message` 미참조. `order-notices.ts` 는 핫픽스 파일 목록에 없음 — 무영향 |
| 7  | 76/77/78 이 `unknown-msg-type` 경고 없이 파싱돼 브라우저까지 내려간다 (D-02·D-03) | ✓ VERIFIED | `subscription-hub.ts` 명시 `case MSG.RateCrossAlert/RateCrossSnapshot/QueuedWindowState` + 세션 캐시 + `fanout.ts` 인증 직후 `rate.cross.snap`/`queued.window` 스냅샷 송신 코드 확인. relay 쪽 파일은 핫픽스가 전혀 건드리지 않음(`git show --stat b31435b` 에 `relay/` 경로 0건) — 회귀 없음 |
| 8  | 세션 Ready 전 76 은 캐시만, 팬아웃 안 됨 (D-03) | ✓ VERIFIED | `#onRateCrossAlert` 캐시-먼저-팬아웃-나중 주석 및 구조 확인. relay 무변경 |
| 9  | `{t:"lc.arm"}` → relay 가 `get_strategy_req.key` 채운 36/37/38 Envelope 을 세션으로 송신, `lc.set` 과 동형 가드 (D-04) | ✓ VERIFIED (코드 층위) + 실기 관측(§후속) | `fanout.ts` `ARM_LATCH_MSG_TYPE` 매핑 + `lc.arm` 분기(핫픽스 무변경, `fanout.ts` 는 covered_files 밖) — `ws-latch.test.ts` 553줄이 `fake-gateway` 로 페이로드 디코드까지 단언. 프로덕션 `[HUB] 상따 에코 수신` 36건으로 실기 왕복도 관측됨(§후속 참조) |
| 10 | VI 전략·통보·목록이 거래소 축을 갖고, `GetVITriggerReq(21)` 을 KRX·NXT 2회 송신 (D-06) | ✓ VERIFIED | `strategy-hub.test.ts` `strategyReqCount(MSG.GetVITriggerReq)).toBe(2)` + `viGetExchanges()).toEqual(["KRX","NXT"])`, `use-relay-socket.ts` `case "vi"` 거래소별 병합. 핫픽스는 `case "lc"`/`case "lc.snap"` 만 건드렸고 `case "vi"` 는 한 글자도 바뀌지 않음(diff 확인) — 회귀 없음 |
| 11 | VI 웹 표면이 거래소별 3상태·가동 배지 합집합·거래소 열을 보여준다 (D-18) | ✓ VERIFIED | `vi-client.tsx` `exchangeFilter`, `vi-order-list.tsx` `row.item.exchange` 열 2곳. 두 파일 모두 핫픽스 목록 밖 — 무영향 |
| 12 | 상따 래치 LED 3종 색·클릭 가능 규칙이 C# 정본과 일치 (D-19) | ✓ VERIFIED | `latch-led.tsx` `latchLedStateOf` — 매도/취소/매수 3분기가 D-19 문서 규칙과 축자 일치. `latch-led.tsx` 는 핫픽스가 전혀 건드리지 않음 — 회귀 없음 |
| 13 | LED 가 색만이 아니라 텍스트 라벨(OFF/대기/감시)을 함께 싣는다 (D-21·WCAG 1.4.1) | ✓ VERIFIED | `latch-led.tsx` `state.label` 이 보이는 텍스트로 렌더. 무변경 파일 |
| 14 | 상따 상태줄에 LED 3개가 매수·매도·취소 순으로 있고 클릭 시 확인 다이얼로그 없이 `lc.arm` 1건 (D-20·D-22) | ✓ VERIFIED | `limit-chaser-client.tsx` `handleArm` — `clickable` 재검증 후 `send({t:"lc.arm",...})`, 다이얼로그 없음. 핫픽스 diff 에 `handleArm` 함수 변경 없음(새 `acceptAnswer`/`serverAnswerSeq` 배선만 추가) — 회귀 없음 |
| 15 | 전략 로그가 취소·매수 래치 전이 4종을 구분 (D-23) | ✓ VERIFIED | `strategy-log.tsx` `buyLatched/buyUnlatched/cancelLatched/cancelUnlatched` 4종 + prev/next 비교 로직. `strategy-log.tsx` 는 핫픽스 목록 밖 — 무영향 |
| 16 | `ServerMessage.source` 배지 `[상따]`/`[VI]`/`[서버]` (D-09·D-17) | ✓ VERIFIED | `packages/shared/src/strategy-display.ts` `serverMsgBadge()`, 3개 표면(`limit-chaser-client.tsx`·`vi-client.tsx`·`relay-status-bar.tsx`)에서 소비. `strategy-display.ts` 무변경 |
| 17 | 미체결 표식이 `sideDisplayText` 한 함수로만 생성됨 (D-13) | ✓ VERIFIED | `account-panel.tsx`·`vi-client.tsx` 모두 `sideDisplayText` import·호출, 인라인 접미 없음. 무변경 |
| 18 | `pendingCancelSent` bool 하나가 취소보관 회색·버튼숨김의 유일한 근거 (D-14) | ✓ VERIFIED | `account-panel.tsx` `!row.pendingCancelSent` 조건으로만 취소 가능 판정, `pendingStatus` 문구 비교 없음. 무변경 |
| 19 | 자동주문 매도 접수·체결이 3초 창으로 묶이고 순수함수 하나가 담당 (D-16) | ✓ VERIFIED | `order-notices.ts` `mergeOrderNotices`, `today-orders-card.tsx` 가 그 결과만 호출. 두 파일 모두 핫픽스 목록 밖 |
| 20 | 전량 게이트(relay·webapp·typecheck)가 green (D-24) | ✓ VERIFIED | 이 세션에서 **다시** 재실행 — relay 467/467, webapp 1008 passed·1 skipped(핫픽스가 998→1008 로 10케이스 추가), 루트 typecheck exit 0. 모두 지시받은 기대치와 정확히 일치 |
| 21 | TRADE-04·TRADE-05 가 REQUIREMENTS.md 정의부·Traceability 양쪽에서 같은 판정으로 기록 | ✓ VERIFIED | `grep '\[.\] \*\*TRADE-0[45]\*\*'` → 둘 다 `[x]`; Traceability 표 두 행 모두 **Complete**(2026-09-21 재판정) + 조항별 근거. 정의부·Traceability 갈리지 않음 확인 |
| 22 | gh-trade 게이트웨이 HEAD(실서버)로 76/77/78 드롭 0 과 LED 클릭 왕복이 실제로 관측됐다 (D-25) | ✓ VERIFIED | 프로덕션 `ef1499a` 장중 관측(§후속): 사용자 확인 LED 왕복 정상 + `[HUB] 상따 에코 수신` 36건 + `[HUB] 돌파 집합 스냅샷 수신`(MsgType 78) 6건 + `unknown-msg-type` 0건/527행. mock 이 아니라 실서버가 답을 줬다 — 76·77 은 이 구간에 미발화라 미관측이나 드롭 시그널(0건)과 등록 경로 동일성으로 정직하게 뒷받침됨 |

**Score:** 22/22 truths verified (핫픽스 `b31435b` 회귀 재검증 라운드 포함, 회귀 0건)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `relay/src/generated/stock-dma/rate-cross-alert.ts` 외 78/77 생성물 | 재생성된 flatbuffers 코덱 | ✓ VERIFIED | `sync-relay-schema.sh --check` 차이 0 으로 최신성 확인 |
| `packages/shared/src/strategy-display.ts` | `sideDisplayText`·`serverMsgBadge` | ✓ VERIFIED | 존재·양쪽 함수 정의·다수 소비처 확인 |
| `relay/tests/ws-latch.test.ts` | `lc.arm` 왕복 19케이스 | ✓ VERIFIED | 553줄, fake-gateway 페이로드 디코드 단언 포함 |
| `relay/tests/rate-cross.test.ts` | 76/77/78 드롭 0 단언 | ✓ VERIFIED | 369줄 |
| `webapp/src/components/trading/latch-led.tsx` | LED 컴포넌트 + 순수 판정 함수 | ✓ VERIFIED | D-19 규칙표와 축자 일치 |
| `webapp/src/lib/order-notices.ts` | 행위 단어·3초 묶기 순수함수 | ✓ VERIFIED | `orderActionWord`·`mergeOrderNotices` |
| `webapp/src/lib/limit-chaser.ts` `isLimitChaserSetRejection` (핫픽스 신규) | 「내 요청의 답인가」 판정 — `isLimitChaserServerMessage` 보다 좁고 `msg.m` 미참조 | ✓ VERIFIED | `lv==='ERROR' && src==='SetLimitChaser' && i/a 매치` 3축, `m` 필드 시그니처에 없음. 단위 테스트 8케이스로 경계 양쪽 잠금 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `relay/src/dma/msg-type.ts` `INBOUND_MSG_TYPES` | `subscription-hub.ts` `#onFrame` switch | 명시 case 3개(76/77/78) | ✓ WIRED | grep 으로 대응 case 3개 확인 |
| `readLimitChaser()` (envelope.ts) | webapp `lc` 리듀서 | `RelayLimitChaser` 계약 | ✓ WIRED | `use-relay-socket.ts` `case "lc"` |
| `webapp {t:"lc.arm"}` | `fanout.ts` `lc.arm` 분기 | `buildArmLatchReq` → DMA 세션 send | ✓ WIRED | 코드·테스트 확인 + 프로덕션 `[HUB] 상따 에코 수신` 36건으로 실서버 왕복도 확인(§후속) |
| `buildGetVITriggerReq(exchange)` | `#viTriggers` 캐시 → fanout 스냅샷 | 21 요청 거래소 FIFO | ✓ WIRED | `strategy-hub.test.ts` FIFO 귀속 케이스 확인 |
| `RelayTapeEntry.bs` | `tapeSidesOf()` | 매수/매도 색·sr-only | ✓ WIRED | `trade-tape.tsx` |
| `RelayQuote.kc` | 호가 종목정보/상따 헤더 | `kc > 0 → '종가'` | ✓ WIRED | 두 표면 모두 확인 |
| `use-relay-socket.ts` `case "lc"` (핫픽스 신규) | `limit-chaser-client.tsx` `acceptAnswer` 이펙트 | `lastLimitChaserEcho` — `key` 일치 시에만 소비 | ✓ WIRED | 소켓 계약에 필드 노출 → provider 기본값 `null` → 컴포넌트 이펙트가 `key` 대조 후 타이머 해제. 회귀 테스트 ㉑-b 로 「남의 키는 거두지 않는다」까지 확인 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| relay 단위 테스트 전체 통과 (재검증) | `pnpm --filter @gh-radar/relay run test` | 467 passed / 19 files | ✓ PASS |
| webapp 단위 테스트 전체 통과 (재검증, 998→1008) | `pnpm --filter @gh-radar/webapp run test` | 1008 passed · 1 skipped / 73 files | ✓ PASS |
| 루트 타입체크 (재검증) | `pnpm typecheck` | 13 workspace 전부 Done, exit 0 | ✓ PASS |
| 핫픽스 타이머 취소 불변식 — 답을 받으면 3초 타이머가 다시 서지 않는다 | `limit-chaser-client.test.tsx` `㉑-a` (`vi.advanceTimersByTime(ACK_TIMEOUT_MS*3)` 후 `unacked()` 단언) | 전체 스위트 재실행에 포함되어 PASS 확인 | ✓ PASS |
| 핫픽스 재전송 없음 불변식 — 답 수신 후 추가 `send` 없음 | 같은 테스트, `expect(sendMock).toHaveBeenCalledTimes(2)` | PASS | ✓ PASS |
| gh-trade HEAD 게이트웨이 실기 왕복(76/77/78 드롭 0·36/37/38 래치 색 전환) | 프로덕션 관측(§후속, 이 세션 이전에 완료) | `unknown-msg-type` 0건/527행, 상따 에코 36건, MsgType 78 스냅샷 6건 | ✓ PASS (실기 관측으로 종결) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| TRADE-04 | 17-01~17-11 (신규 등록 09-08 문구는 오기, 실제 신규 등록은 17-01) | 프로토콜 재동기화·신규 푸시 중계·기존 화면 보정 | **Complete** (코드 층위 + 2026-09-21 프로덕션 실기 관측) | 위 Truth 1~11,16~19,20 + REQUIREMENTS.md Traceability 행 |
| TRADE-05 | 17-04, 17-07, 17-11 | 상따 래치 LED 3종 + 수동 점등 | **Complete** (코드 층위 + 2026-09-21 프로덕션 실기 관측) | 위 Truth 3,9,12~15,22 + REQUIREMENTS.md Traceability 행 |

두 요구사항 모두 REQUIREMENTS.md 정의부 체크박스(`[x]`)와 Traceability 판정(Complete)이 갈리지 않음을 이 재검증에서 재확인했다.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | 이 phase 가 만든/이번 핫픽스가 고친 파일에서 TBD·FIXME·XXX·placeholder·coming soon 류 디버트 마커 검색 결과 0건(`limit-chaser-client.tsx` 의 `placeholder="종목명 또는 코드로 검색"` 은 HTML input placeholder 속성으로 디버트 마커 아님) | — | grep 스캔 결과 없음 — 문제 아님 |
| `.planning/ROADMAP.md`, `.planning/STATE.md` | — | 배포 완결(`e342dd2`) 이후 갱신되지 않은 서술 — "relay 미배포"·"반쪽 상태"·"status: halted" 문구, D-25 잔여 언급이 실제로는 해소된 사실과 어긋남 | ⚠️ Warning | 코드/배포 자체에는 영향 없음. 다음 세션이 이미 끝난 relay 배포·D-25 를 다시 조사할 위험. 이전 라운드에서도 지적됐고 이번 재검증까지 미수정 |
| `webapp/src/lib/use-relay-socket.ts` `case "lc"` / `webapp/src/lib/relay-provider.tsx` (핫픽스 신규 `lastLimitChaserEcho` 필드) | — | `applyFrame` 리듀서 자체(`case "lc"` 가 `crud` 무관하게 갱신, `case "lc.snap"` 은 갱신하지 않음)를 **실제 WebSocket 프레임으로 구동하는** 단위 테스트가 없다 — `relay-provider.test.tsx`(fake-WebSocket 으로 리듀서를 직접 구동하는 유일한 스위트)에 `lastLimitChaserEcho` 언급 0건. 현재 커버리지는 `limit-chaser-client.test.tsx` 가 `useRelayContext()` 를 **직접 스텁**해 필드 값을 주입하는 방식(㉑-a~e)뿐이라, 컴포넌트의 *소비* 로직은 탄탄히 잠겼지만 리듀서의 *산출* 로직(특히 `lc.snap` 이 답으로 오인되지 않는다는 설계 락)은 코드 읽기로만 확인됐다 | ℹ️ Info | 동작 자체는 이번 세션에서 diff 를 직접 읽어 코드 층위로 확인했고(§재검증 섹션), 3-line 단순 spread 라 회귀 위험은 낮다. `passed` 판정을 막을 정도는 아니나, 다음에 `use-relay-socket.ts` 를 건드릴 때는 `relay-provider.test.tsx` 에 `lc`/`lc.snap` 프레임을 직접 밀어넣는 리듀서 레벨 케이스를 추가하길 권고 |

### Human Verification Required

없음 — 2026-09-20 초기 검증에서 유일하게 남겨 뒀던 human-verification 항목(D-25, gh-trade 게이트웨이 HEAD 실기 왕복)이 2026-09-21 프로덕션 장중 관측으로 닫혔다(§후속 참조). 이번 핫픽스 회귀 재검증에서도 새로 발생한 human-verification 필요 항목은 없다 — 5가지 설계 락 전부가 코드 읽기 + 회귀 테스트(㉑ 시리즈)로 자동 확인됐다.

## Gaps Summary

갭 없음. 22개 관찰 가능한 진실 전부가 VERIFIED 다 — 21개는 정적 분석 + 재실행한 자동 테스트, 1개(D-25)는 프로덕션 실기 관측으로 닫혔다. 2026-09-21 프로덕션 핫픽스(`b31435b`, `/limit-chaser/new` 「미반영」 고착 수정)가 이 phase 의 `covered_files` 7개를 건드렸으나, 파일별 diff 를 직접 읽고 5가지 설계 락(재전송 없음·`ACK_TIMEOUT_MS` 불변·`lc.snap` 미기록·`isLimitChaserSetRejection` 협의·Pitfall 9 미접촉)을 모두 확인한 결과 **회귀 0건**이다. 세 게이트(relay 467·webapp 1008+1skip·루트 typecheck exit 0) 모두 지시받은 기대치와 정확히 일치해 재실행으로 확인했다.

유일하게 남긴 것은 `ℹ️ Info` 수준 권고 하나 — 핫픽스가 추가한 리듀서 필드(`lastLimitChaserEcho`)에 fake-WebSocket 을 통한 리듀서 레벨 단위 테스트가 아직 없고 컴포넌트 레벨 스텁 테스트만 있다는 점이다. `passed` 판정에는 영향 없다.

추가로, 이전 라운드에서 지적한 **ROADMAP.md·STATE.md 가 최종 배포 완결(`e342dd2`) 이후 갱신되지 않은 문제**는 이번 재검증 시점에도 그대로 남아 있다. 코드 정확성에는 영향이 없으나, 두 파일을 `17-12-SUMMARY.md` §⑦ 및 이번 D-25 종결 사실에 맞춰 갱신할 것을 다시 권고한다.

---

*Verified: 2026-09-20T20:45:00Z (초기) → 2026-09-21 (프로덕션 실기 관측) → 2026-09-21T18:10:00Z (핫픽스 회귀 재검증, 이번 라운드)*
*Verifier: Claude (gsd-verifier)*


---

## 후속 — 마지막 1건이 닫힌 경위 (2026-09-21)

이 보고서가 `human_needed` 로 남겨 둔 유일한 항목(D-25, gh-trade 게이트웨이 HEAD 와의 실기 왕복)이
**프로덕션 장중 관측으로 닫혔다.** 로컬 mock 을 세우지 못한 채 닫혔지만, 우회가 아니라 **실서버가
mock 보다 강한 증거를 냈다** — mock 은 「HEAD 스키마와 말이 통하는가」의 대역이고, 여기서는 실제
게이트웨이가 그 답을 직접 줬다.

| 관측 | 값 |
|---|---|
| 래치 LED 클릭 왕복 | 사용자 확인 — 정상 동작 |
| `[HUB] 상따 에코 수신` | **36건** (6시간) |
| `[HUB] 돌파 집합 스냅샷 수신` (MsgType **78**) | **6건** — 신규 푸시가 실서버에서 도착·처리됨 |
| `unknown-msg-type` | **0건** / 527행 |

**정직 기록:** 76·77 은 이 구간에 발화하지 않아 실수신을 보지 못했다. 드롭되었다면
`unknown-msg-type` 이 섰을 텐데 0건이고, 78 이 같은 등록 경로로 실동작했으며, 세 종 모두
17-03 의 mock 테스트가 덮는다 — 그래서 「미관측」으로 적되 phase 차단 사유로는 두지 않는다.

**같은 날 이 표면에서 프로덕션 결함 1건이 드러나 수정·배포됐다** — `/limit-chaser/new` 의
「미반영 · 서버 응답을 기다리고 있어요」와 「수정」 버튼 영구 고착. 응답 유무의 정본을 파생 목록에서
60 에코 스트림으로 옮겨 해소했다 (debug `lc-unacked-stuck-new-route`, `b31435b`, webapp 1008 passed).
이 검증이 정적 분석으로 22개 진실을 통과시키고도 놓쳤던 종류의 결함이며, **실기 관측이 왜 필요한지의
사례**로 남긴다.

---

## 재검증 — 2026-09-21 핫픽스(`b31435b`) 회귀 점검

바로 위 「후속」 절이 닫히고 나서, 같은 날 장중에 `/limit-chaser/new` 화면이 실사용자를 막는
결함(위 기술)이 발견·수정·배포됐다. 그 수정이 이 phase 의 `covered_files` 7개(소스 5·테스트 2)를
건드렸으므로, 이 재검증 라운드는 **① 기존 22개 진실이 회귀하지 않았는가, ② 수정 자체가 phase 의
설계 락을 어기지 않았는가** 두 가지를 diff 를 직접 읽어 확인했다.

### 1. 22개 진실 회귀 점검

핫픽스가 실제로 건드린 파일은 `webapp/src/{lib/{limit-chaser.ts,relay-provider.tsx,use-relay-socket.ts},components/trading/{limit-chaser-client.tsx,limit-chaser-form.tsx}}`
5개 소스 + 테스트 2개뿐이다(`git show --stat b31435b`). relay 쪽(`relay/src/**`)은 **0건** — Truth
1·2·7·8·9(relay 절반)는 구조적으로 회귀 불가능하다. webapp 쪽에서 이 5개 소스가 접하는 진실은
Truth 3(60 에코 → `lc` 프레임)과 Truth 9(`lc.arm` 왕복)뿐이며, 위 Observable Truths 표의 각 행에
diff 근거를 직접 적어 뒀다 — 핵심은 `use-relay-socket.ts` `case "lc"` 의 기존 반환문
(`limitChasers: upsertLimitChaser(...)`)이 **한 글자도 바뀌지 않고 `lastLimitChaserEcho` 필드 하나가
추가**됐다는 점, `case "lc.snap"`·`case "vi"`·`handleArm`·`latch-led.tsx`·`strategy-log.tsx` 는 diff 에
전혀 등장하지 않는다는 점이다.

### 2. 설계 락 5종 점검

| 락 | 확인 방법 | 결과 |
|---|---|---|
| 재전송(resend/retry) 미도입 | `git show b31435b \| grep -n "send("` | **매치 0건** — 핫픽스가 새 `send()` 호출을 추가하지 않았다. `acceptAnswer` 주석도 "되보내지 않는다(T-16-10)" 를 명시 |
| `ACK_TIMEOUT_MS` 불변 (3000, WinForms `RespTimeoutMs` 대응) | `grep -n "ACK_TIMEOUT_MS" limit-chaser-client.tsx` | `export const ACK_TIMEOUT_MS = 3_000;` — 값·정의 위치 모두 불변 |
| `lc.snap`(64) 은 답으로 기록하지 않음 | `use-relay-socket.ts` `case "lc.snap"` 본문 직접 대조 | `case "lc.snap"` 은 `limitChasers` 만 갱신하고 `lastLimitChaserEcho` 는 건드리지 않음 — `case "lc"` 에만 그 필드 갱신이 있다. 주석도 "64 스냅샷은 여기에 담지 않는다 — 재접속 복원은 답이 아니다" 로 명시 |
| `isLimitChaserSetRejection` 이 `isLimitChaserServerMessage` 보다 좁고 `msg.m` 미참조 | `limit-chaser.ts` 함수 시그니처·본문 대조 | 파라미터가 `{src,i,a,lv}` 뿐 `m` 없음. `lv==='ERROR' && src==='SetLimitChaser'` 로 좁혀, `isLimitChaserServerMessage` 가 허용하는 `'LimitChaser'`·`'Account'&&i!==''` 는 제외 — 단위 테스트 8케이스로 양쪽 경계 잠금(`limit-chaser.test.ts`) |
| Pitfall 9 미접촉 (`isViServerMessage` 가 `src==="LimitChaser"` 를 받지 않음) | `vi-alert.ts` 가 핫픽스 diff 에 **등장하지 않음** 확인 + 현재 본문 재확인 | `git diff b31435b~1 b31435b -- webapp/src/lib/vi-alert.ts` 출력 없음(무변경). 현재도 `isViServerMessage` 는 `"SetVITrigger"`/`"VITrigger"`/(`"Account"` ∧ `!isLimitChaserServerMessage`)만 인정 — `"LimitChaser"` 를 여전히 배제 |

5가지 모두 위반 없음.

### 3. 게이트 재실행 (이 세션에서 직접, 지시받은 기대치와 대조)

| 게이트 | 명령 | 기대 | 실측 | 상태 |
|---|---|---|---|---|
| webapp | `pnpm --filter @gh-radar/webapp run test` | 1008 passed·1 skipped/73 files | 1008 passed·1 skipped/73 files | ✓ 일치 |
| relay | `pnpm --filter @gh-radar/relay run test` | 467/19 | 467 passed/19 files | ✓ 일치 |
| 루트 typecheck | `pnpm typecheck` | exit 0 | exit 0, 13 workspace 전부 Done | ✓ 일치 |

### 4. 핫픽스 자체의 RED 증거 (프로덕션 사고의 재현·해소)

새 테스트 `limit-chaser-client.test.tsx` `㉑` 시리즈(5케이스)가 사고를 정확히 재현한다 —
㉑-a 는 "미등록 키의 철거 에코가 도착하면, 시간을 더 흘려도 「미반영」 타이머가 다시 서지 않고
(`vi.advanceTimersByTime(ACK_TIMEOUT_MS*3)` 후 `unacked()` 가 `null`) 추가 전송도 0건
(`sendMock` 호출 횟수 불변)"을 직접 단언한다 — 이는 상태 전이(타이머 취소)와 부작용 없음
(재전송 금지)을 코드 존재 확인을 넘어 **행동으로** 증명하는 케이스라, Step 3 의 "state
transition/cleanup invariant" 기준을 만족한다. ㉑-e 는 「수정」 버튼 잠금도 같은 신호로 풀림을
증명한다. 지시받은 RED 증거(5 소스 파일 되돌리면 8 failed/92 passed, 복원하면 100 passed)는
디버그 세션 기록(`lc-unacked-stuck-new-route.md`)에 있으며 이번 재검증은 그 claim 을 재실행하지
않고 **복원된 현재 상태가 전체 스위트에서 green** 임을 직접 재확인하는 것으로 대체했다(위 §3).

### 5. 결론

핫픽스는 phase 17 이 검증한 22개 진실 중 어느 것도 퇴행시키지 않았고, 자신이 명시한 5가지 설계
락도 모두 지켰다. `status: passed`, `score: 22/22` 를 유지한다.
