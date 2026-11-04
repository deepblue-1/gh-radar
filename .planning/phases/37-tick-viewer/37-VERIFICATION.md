---
phase: 37-tick-viewer
verified: 2026-11-04T22:20:00Z
status: human_needed
score: 12/12 must-haves verified
covered_files:
  - .planning/phases/37-tick-viewer/37-01-PLAN.md
  - .planning/phases/37-tick-viewer/37-01-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-02-PLAN.md
  - .planning/phases/37-tick-viewer/37-02-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-03-PLAN.md
  - .planning/phases/37-tick-viewer/37-03-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-04-PLAN.md
  - .planning/phases/37-tick-viewer/37-04-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-05-PLAN.md
  - .planning/phases/37-tick-viewer/37-05-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-06-PLAN.md
  - .planning/phases/37-tick-viewer/37-06-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-07-PLAN.md
  - .planning/phases/37-tick-viewer/37-07-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-08-PLAN.md
  - .planning/phases/37-tick-viewer/37-08-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-09-PLAN.md
  - .planning/phases/37-tick-viewer/37-09-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-10-PLAN.md
  - .planning/phases/37-tick-viewer/37-10-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-11-PLAN.md
  - .planning/phases/37-tick-viewer/37-11-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-12-PLAN.md
  - .planning/phases/37-tick-viewer/37-12-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-13-PLAN.md
  - .planning/phases/37-tick-viewer/37-13-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-14-PLAN.md
  - .planning/phases/37-tick-viewer/37-14-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-15-PLAN.md
  - .planning/phases/37-tick-viewer/37-15-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-16-PLAN.md
  - .planning/phases/37-tick-viewer/37-16-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-17-PLAN.md
  - .planning/phases/37-tick-viewer/37-17-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-18-PLAN.md
  - .planning/phases/37-tick-viewer/37-18-SUMMARY.md
  - .planning/phases/37-tick-viewer/37-19-PLAN.md
  - .planning/phases/37-tick-viewer/37-19-SUMMARY.md
  - tickgw/src/cache.ts
  - tickgw/src/indexer.ts
  - tickgw/src/poller.ts
  - tickgw/src/server.ts
  - tickgw/tests/poller.test.ts
  - webapp/src/instrumentation-client.ts
  - webapp/src/lib/router-transition.ts
  - webapp/src/lib/ticks/tick-url.ts
  - webapp/src/lib/ticks/use-tick-cursor.ts
  - webapp/src/lib/ticks/use-tick-live.ts
  - workers/tick-convert/src/modes/promote.ts
  - workers/tick-convert/src/tickgw-export.ts
  - workers/tick-convert/tests/helpers/fake-tickgw.ts
  - workers/tick-convert/tests/promote.test.ts
covered_digest: "v4:sha256:f6ecc966c6938980dcc0e26b09dbd6fe28cbb50226413cd99d2acdb7afdda23f"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "(37-12 · D-07 · D-04) 승격 격자는 장 마감 시점의 하루치 전체이거나 쓰이지 않는다 — 잘린 하루가 promoted 로 남지 않는다"
    status: failed
    reason: "CR-31 (코드로 재확인): tickgw 가 119 인덱서의 `compressed_files_skipped` 를 읽기만 하고(`tickgw/src/indexer.ts:133`, 로그 `skipped` 만 `poller.ts:341`) `applyOk`(`poller.ts:311-326`)·`closeOne`(`poller.ts:418-446`)은 `entry.complete` 를 건드리지 않는다. 119 기록기는 20:00 에 지난 시간 파일을 `zstd --rm` 으로 압축(gh-trade 회신 261102 · 인덱서 README '운영 경계')하므로, 낮에 닫혀 폴링이 멈춘 키는 20:01 마감 마무리에서 lastRecvNs+1 부터 요청해도 이미 압축된 시간대가 건너뛰어진 채 `closed=true`·`closedThroughNs≥20:00` 이 된다. 승격 Job 의 재확인(closed_through ≥ 20:00 · 첫 recv ≥ 08:00 · 레코드 수 = export records)은 모두 통과해 구멍 난 하루가 `promoted` 격자가 된다. 승격본은 `grid_ready` 로 요청 변환까지 막고, D-02 대상 밖 종목은 밤 변환이 덮어 주지 않는다."
    artifacts:
      - path: "tickgw/src/poller.ts"
        issue: "applyOk/closeOne 가 meta.compressedFilesSkipped > 0 을 complete=false 로 반영하지 않음"
      - path: "workers/tick-convert/src/modes/promote.ts"
        issue: "tickgw 가 알려 주지 않으면 구멍을 잡을 수 있는 검사가 없음(레코드 수는 tickgw 캐시와 비교하므로 구멍을 못 봄)"
    missing:
      - "applyOk: compressedFilesSkipped > 0 이면 entry.complete=false 로 내려 closeOne 의 `!entry.complete` 분기가 승격을 막게 한다(리뷰 CR-31 최소 수정)"
      - "승격률 보전: 오늘 complete 키를 19:55 KST 부터 리스와 무관하게 증분 폴링하는 사전 마무리 단계(선택)"
      - "회귀 시험: fake-indexer 가 skipped>0 을 내는 사례에서 export 목록에 키가 빠지거나 incomplete 로 세어지는지"
  - truth: "(37-12 · D-07) 20:00 승격 Job 이 그날 closed 키를 모두 올린다 — 키 하나의 모양 이상이 다른 키를 막지 않는다 (`키 하나 실패가 다른 키를 막지 않는다`)"
    status: failed
    reason: "CR-30 (코드로 재확인): tickgw `exportList`(`tickgw/src/server.ts:131-133`)는 레코드 0건 closed 키(NXT 비상장 종목을 NXT 로 연 경우·거래정지 등)에 `first_recv_ns: null`·`last_recv_ns: null` 을 싣지만, 승격 Job 의 `checkKey`(`workers/tick-convert/src/tickgw-export.ts:77-79`)는 세 ns 필드가 숫자 문자열이 아니면 throw 하고, `list()`(`:124`)는 `body.keys.map(checkKey)` 로 키 하나의 위반을 목록 전체 실패로 바꾼다. `runPromote` 가 던지고 종료 1 — 20:40 재실행도 같은 키 때문에 같은 결과라 그날 승격이 한 키도 되지 않는다. 시험용 `fake-tickgw.ts:89-90` 은 빈 키에 `\"0\"` 을 돌려줘 실제 계약과 갈라져 있어 시험이 초록이어도 이 경로는 증명되지 않았다. (11/3 운영 승격 11키가 성공한 것은 그날 0건 키가 없었기 때문이다.)"
    artifacts:
      - path: "workers/tick-convert/src/tickgw-export.ts"
        issue: "checkKey 가 first/last_recv_ns null 을 계약 위반으로 던짐 · list() 가 키 단위 실패를 전체 실패로 승격"
      - path: "tickgw/src/server.ts"
        issue: "exportList 가 records=0 키를 null ns 로 내보냄(계약과 소비자 불일치)"
    missing:
      - "checkKey 에서 first/last_recv_ns 는 null 허용(closed_through_ns 만 필수) 하거나 exportList 에서 records=0 키를 keys 에서 빼고 별도 집계"
      - "list() 의 키 단위 검사 실패를 incomplete/failed 로 내려 run 전체를 죽이지 않게"
      - "fake-tickgw 의 빈 키를 null 로 바꾸고 promote.test 에 '0건 closed 키 + 정상 키' 사례 추가"
deferred: []
human_verification:
  - test: "오늘 밤 19:55 따라잡기 · 20:01 마감 마무리 · 20:10 승격 Job 이 새 코드(tickgw 198d9dc3 · Job 198d9dc3)로 처음 도는 것을 로그로 확인한다"
    expected: "radar-gw tickgw 로그에 `catchup done keys=N caught=N lost=0`(lost > 0 이면 warn) · `closed` 줄들 · `compressed files skipped` warn 이 있다면 그 키는 closed 가 아님 · 20:10 `[tick-convert] mode=promote … failed=0` · 압축으로 일부가 비면 `incomplete` 가 아니라 export 에서 애초에 빠짐(unclosed 로 센다) · 승격된 키의 `tick_grids.sources` 가 `{promoted}` · 0건 키가 있어도 Job 종료 0"
    why_human: "런타임 동작이다. 20:00 압축(`zstd --rm`)과 19:55~20:01 스케줄링은 장 마감 뒤에만 실제로 발생하며, 단위 시험은 가짜 인덱서로 그 순서를 흉내 낸 것이다. 오늘 밤 전엔 관측할 수 없다."
  - test: "요청 변환 실측 수치를 SUMMARY 에 남긴다 (SC 3 기록 공백, 1라운드부터 이월)"
    expected: "프로덕션에서 격자·승격이 없는 비대상 종목 하나를 열어 「변환 중 · 약 N분 → 자동 열림」 소요와, 같은 종목 동시 요청 시 Cloud Run 실행 1회로 합쳐지는지를 기록한다"
    why_human: "프로덕션 조작·Cloud Run 실행 이력 확인이 필요하다. 기능 자체는 UAT C(천일고속 10/14)로 동작이 확인되어 있어 목표 달성은 막지 않는다. 수치만 비어 있다."
  - test: "R2 수정 중 로직 변경으로 표시된 항목의 사람 확인 (R2-WR-01 저녁 새 키 지연 · R2-WR-03 포기 규칙 · R2-IN-03~06)"
    expected: "(a) 19:55~21:00 에 새로 연 키가 캐시가 가득 찼을 때 `delayed` 가 되는 맞교환(승격 손실 방지 vs 저녁 신규 키 지연)이 수용 가능한지 판단한다. (b) nightly 결정적 실패 2회 초과 날짜가 더 고르지 않고 실행마다 종료 1 + error 로그를 내는 동작이 알림 설계 의도와 맞는지 본다. (c) 75(색인 준비 안 됨) 전역 대기 5→15→30→60초 단계가 장중에 체감 지연을 만들지 않는지 본다."
    why_human: "정책·운영 판단이다. 시험은 동작을 고정하지만 그 동작이 운영 의도에 맞는지는 사람이 정한다(REVIEW-FIX-R2 가 스스로 `requires human verification` 으로 표시)."
round1_verified: 2026-11-04T04:40:00Z
round1_status: gaps_found
round1_score: 10/12 must-haves verified
superseded_by: 37-VERIFICATION-R2.md
---

# Phase 37: 틱 전문 뷰어 Verification Report

**Phase Goal:** 트레이더가 KRX·NXT 어느 종목이든 08:00~20:00 의 틱 단위 전문(B6·A3·B9·R8·C3)을 실제 수신 순서대로 재생하며 한 틱의 호가창·앞뒤 전문·체결 버스트·거래대금·팀 거래정보를 본다. 공급은 두 갈래 — ① 당일 장중 종목 단위 요청형(119 소형 인덱서 + radar-gw ssh 강제 명령), ② 과거 날짜 GCS 원본 클라우드 변환(Cloud Run Job → 종목·날짜 격자).
**Verified:** 2026-11-04T04:40:00Z
**Status:** gaps_found
**Re-verification:** No — 초기 검증

## 한눈에 보기

핵심 목표(뷰어 자체와 두 공급 경로)는 코드·시험·운영 UAT 모두에서 달성되어 있다. 다만 **20:00 당일 캐시 → 격자 승격 경로**에 코드 리뷰가 지적한 두 결함(CR-30·CR-31)이 현재 코드에 그대로 남아 있고(`37-REVIEW-DISPOSITION.md` 전부 `open`), 이는 37-12 PLAN 의 must-have 진술("하루치 전체이거나 쓰이지 않는다", "키 하나 실패가 다른 키를 막지 않는다")과 직접 어긋난다. 두 건 모두 좁은 수정(각 5~15줄 + 시험)이라 gap closure 한 플랜으로 닫을 수 있다. 로드맵 SC 1~4 중 SC 4 의 "딥링크(틱 시각까지)" 일부와 SC 3 의 "요청 변환 실측 기록"은 경고 수준이다.

## Goal Achievement

### Observable Truths (ROADMAP 성공 기준 + PLAN must-have 통합)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | 목업 검토·채택 완료(019 D · 020 A+3 · 진입 A) · 폰 3판 과함 여부 실기기 재확인 | ✓ VERIFIED | `reference/mockup-ticks-entry.html` 존재 · 37-16-SUMMARY "G 폰 390 · 3판 판단 — OK(3판 유지)" 사용자 답 「A-G ok」(2026-11-03) |
| SC2 | gh-trade 계약 인계 · 119 인덱서 배포 뒤 radar-gw 에서 당일 종목 하루치 실측(크기·지연·이어받기) | ✓ VERIFIED (이어받기만 단위 시험) | `docs/inbox/from-gh-trade/261102-…-1.md`·`261103-…-2.md` 둘 다 `status: done` · 37-17-SUMMARY 실측: 삼성 KRX 365,022건 8.9MB 8.7초 · 삼성 NXT 640,952건 15.8MB 16.8초 · 5초 증분 35~50ms · `has_more` 는 운영에서 한 번도 true 가 안 나와 이어받기는 `tickgw` 시험(41/41)으로만 증명 |
| SC3 | 과거 변환 Job — 10/30 선별 종목 변환 시간·GCS 읽기 비용 실측 · 격자 적재 · 당일 밤 자동 · 요청 변환 경로 실측 · 90일 purge | ⚠️ VERIFIED + 기록 공백 | 10/30 nightly: KRX 141→140 · NXT 138→138 · 876초 · ≈$0.22/일 · 격자 278개(37-16-SUMMARY). 첫 이틀 밤 자동 실행 성공(23:30·01:30). 90일 purge: `workers/tick-convert/src/config.ts:107 keepDays=90` · `purge.ts` · RPC `tick_purge_old`. **공백:** PLAN 37-16 Task 2 ⑧(요청 변환 「약 N분」·Job 1회 합치기 실측 수치)은 SUMMARY 에 수치로 남아 있지 않다. 천일고속 10/14 가 요청 변환으로 열려 UAT C 는 OK 였으나 소요·실행 수는 기록 없음 |
| SC4a | `/analytics/ticks` 에서 당일(요청형·서버 캐시·자동 증분)과 과거(격자)가 같은 화면 | ✓ VERIFIED | `webapp/src/app/analytics/ticks/page.tsx` → `tick-viewer-page.tsx`(과거 `useTickGrid` · 당일 `useTickLive` · 같은 `buildTickSession`) · server `ticks.ts` 라우트 7개(`/day /today /live /open /own /convert /convert/cancel`) `app.ts:149` 등록 · `use-tick-live.test.tsx` 12/12 통과(재실행) · 37-17 당일 UAT 「당일 OK」 · 증분 5초·탭 숨김 정지 `use-tick-live.ts:135` |
| SC4b | DMA 게이트 | ✓ VERIFIED | RPC `tick_open_for_user`/`tick_today_for_user` 첫 줄 `dma_visible_accounts` 검사(`20261102200000_tick_viewer.sql:268,313`) · pgTAP tick_viewer 109 PASS(오케스트레이터) · server 403 `DMA_UNMAPPED` · 웹 `DmaGate` · 37-16 UAT A OK |
| SC4c | 팀 손익 golden 대조(export `payload.pnl`) | ✓ VERIFIED | `ticks-pnl.golden.test.ts` 재실행 통과 — 천일 10/14 실현 28,621,939 · 미실현 3,160,411 · 합계 31,782,350 · 끝 잔량 3,406주 일치. CONTEXT D-20 의 옛 예시 「3,401주」는 RESEARCH 골든 1 이 정정한 값으로 시험이 명시(`:190`). 프로덕션 UAT C OK |
| SC4d | 버스트 판정 `classify_orders` 일치(KRX) · NXT 런 규칙 오라클 일치 | ✓ VERIFIED | `ticks-orders-krx.golden.test.ts`·`ticks-orders-nxt.golden.test.ts` 재실행 통과(99 passed · 2 skipped=선택 픽스처) · NXT runs≥2=179/smp=65 · KRX 182/70 오라클 값이 시험에 박힘(`orders-nxt.golden.test.ts:100-101`) |
| SC4e | 세 보고서 「틱 보기」 | ✓ VERIFIED | `accum-detail.tsx:159` · `teamflow-detail.tsx:99` · `limitup-event-card.tsx` 모두 `tick-link` 알약 · 컴포넌트 시험 3종 · UAT D OK |
| SC4f | URL 딥링크(틱 시각까지) | ⚠️ VERIFIED (ms 단위 · 버스트 내부 부정확) | `tick-url.test.ts` 13/13 · `history.replaceState` 스로틀(`use-tick-cursor.ts`) · UAT E OK. 단 **WR-65**: `t` 가 ms 로 잘려 한 ms 안에 몰린 버스트 조각 중간에서 복사한 링크는 그 ms 첫 틱으로 열린다. D-18 이 `t=HH:MM:SS.mmm` 형식을 확정했으므로 스펙 안이지만 "같은 틱 · 새로고침 제자리" 의도에는 못 미친다 |
| M1 | (37-02 · D-19) 디코더가 pcap2parquet 와 행 수·키 열 일치 · LAYOUTS 정확 길이만 디코딩 · 나머지 raw 보존 | ✓ VERIFIED | `packages/shared/src/ticks/{framing,layouts,decode,route}.ts`(3,513줄 중) · `ticks-decode.golden.test.ts` 재실행 통과 · 리뷰 Part A 가 gh-trade 원문과 줄 단위 대조해 불일치 0 |
| M2 | (37-12 · D-07) 승격 격자는 하루치 전체이거나 쓰이지 않는다 | ✗ FAILED | gaps[0] — CR-31 |
| M3 | (37-12 · D-07) 키 하나의 실패가 다른 키를 막지 않는다 (승격 Job) | ✗ FAILED | gaps[1] — CR-30 |

**Score:** 10/12 truths verified (2 failed, 위 gaps 두 건)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared/src/ticks/*.ts` (15개 모듈) | 디코더 · 판정 · 손익 · 뷰어 모델 | ✓ VERIFIED | 실질 구현 3,513줄 · `index.ts` 가 `shared/src/index.ts:281` 에서 재수출 · 골든 시험 통과 |
| `workers/tick-convert/src/{modes/{nightly,request,promote,…},stage,store,meta,purge}.ts` | 변환 Job 3모드 + purge | ✓ VERIFIED (promote 경로 gaps) | 운영 Job `gh-radar-tick-convert` + `-promote` · Scheduler 23:30·01:30·20:10·20:40 가동(37-16·17 SUMMARY) |
| `tickgw/src/{cache,config,indexer,poller,server,log}.ts` | radar-gw 당일 캐시 게이트웨이 | ✓ VERIFIED (CR-30·31 영향) | tickgw 시험 41/41 · 운영 :8092 healthz 200 · 11/3 실측 |
| `server/src/routes/ticks.ts` + `services/{ticks,tick-gate-cache,tickgw-client,tick-convert-trigger}.ts` | API 7개 | ✓ VERIFIED | `app.ts:149` 마운트 · requireAuth · 게이트 60초 캐시 · 서버 시험 76 통과(오케스트레이터) |
| `supabase/migrations/20261102200000_tick_viewer.sql` 외 | 격자 메타·요청 큐·게이트 RPC·purge | ✓ VERIFIED | 마이그레이션 존재 · pgTAP `tick_viewer` 109 · `tick_grid_team_day` · 원격 반영(37-16) |
| `webapp/src/components/ticks/*` (14개) + `lib/ticks/*` (17개) | 뷰어 UI · 세션 · 커서 · 당일 훅 | ✓ VERIFIED | 웹 틱 관련 시험 699 통과(오케스트레이터) · 재실행 일부(5파일 77) 통과 · 사이드바 「틱뷰어」 `app-sidebar.tsx:188` |
| `scripts/{deploy-tick-convert,deploy-tickgw,setup-*-iam,smoke-tick-convert}.sh` · `infra/relay/tickpull/install.sh` | 배포·IAM·스모크 | ✓ VERIFIED | 운영 배포에 실사용됨(37-16·17 SUMMARY) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| 웹 뷰어 | server `/api/ticks/*` | `lib/ticks/tick-api.ts` fetch + Bearer | ✓ WIRED | 시험 · UAT |
| server `/live` | tickgw `/internal/…` | `tickgw-client.ts` + `TICKGW_URL` | ✓ WIRED | 운영 리비전 `00071-q9s` 스모크 15/15 |
| tickgw | 119 인덱서 | ssh 강제 명령 `tick-indexer --query` (tickpull) | ✓ WIRED | 37-17 실측 |
| 승격 Job | tickgw export | `tickgw-export.ts` | ⚠️ PARTIAL | 정상 키는 통과(11/3 11키) · 0건 키에서 전체 실패 (CR-30) |
| tickgw 마감 마무리 | 119 압축 상태 | `compressed_files_skipped` → complete | ✗ NOT_WIRED | 값을 읽고도 버림 (CR-31) |
| 세 보고서 | `/analytics/ticks?isin&d&ex&t` | `tick-link.ts` | ✓ WIRED | 시험 3종 · UAT D |
| 사이드바 | `/analytics/ticks` | `NAV_TICKS` | ✓ WIRED | `app-sidebar.test` · e2e sidebar-tree |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| 과거 뷰어 | 격자 zstd → 세션 | 서명 URL ← `tick_open_for_user` ← 밤 변환 격자(10/30 278개 적재) | 예 | ✓ FLOWING |
| 당일 뷰어 | `/api/ticks/live` 바이트 | tickgw 캐시 ← 119 인덱서 (삼성 36만 건 실측) | 예 | ✓ FLOWING |
| 승격 격자 | `grid/<D>/<EX>/<isin>.promoted` | tickgw export → promote | 예(11/3 `tick_grids` 11행) · **완결성 미보장** | ⚠️ 구멍 가능 (CR-31) |
| 팀 패널 KPI | A3 평균단가법 | `team-pnl.ts` ← 세션 A3 | 예 | ✓ FLOWING (golden) |

### Behavioral Spot-Checks (이번 검증에서 재실행 · maxWorkers=2)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 디코더·KRX/NXT 판정·손익 골든 | `pnpm exec vitest run ticks-decode.golden ticks-orders-krx.golden ticks-orders-nxt.golden ticks-pnl.golden` (packages/shared) | 4 files · 99 passed · 2 skipped(선택 픽스처) | ✓ PASS |
| 웹 세션·팀 모델·URL·전문 행·당일 훅 | `pnpm exec vitest run tick-session team-model tick-url msg-rows use-tick-live` (webapp) | 5 files · 77 passed | ✓ PASS |
| CR-30 현존 | `tickgw-export.ts:77-79` · `server.ts:131-133` 직접 읽기 | null 허용 안 함 · 불일치 확인 | ✗ FAIL(결함 현존) |
| CR-31 현존 | `grep compressedFilesSkipped tickgw/src` | `indexer.ts` 파싱 + `poller.ts:341` 로그만 | ✗ FAIL(결함 현존) |

Step 7b 전체 스위트 재실행은 하지 않았다(오케스트레이터 기록: shared 247 · tick-convert 151 · tickgw 41 · server 76 · webapp 699 · e2e 53 · pgTAP 109+30 · relay 1879 · webapp 전체 5553 모두 green).

### Probe Execution

해당 없음 — 이 페이즈는 `scripts/*/tests/probe-*.sh` 를 선언하지 않았다.

### Requirements Coverage (D-00 ~ D-22)

REQUIREMENTS.md 에 이 페이즈의 ID 가 없다(`Requirements: TBD`). PLAN frontmatter 의 `requirements` 는 CONTEXT 결정 ID 이며 19개 플랜의 합집합이 D-00 ~ D-22 전체를 덮는다(고아 요구사항 없음).

| 결정 | 플랜 | 상태 | 근거 |
|------|------|------|------|
| D-00 화면 정본(019 D · 020 A+3) | 05·10·13·14 | ✓ SATISFIED | 호가·전문·카드·차트·슬라이더 컴포넌트 + 시험 + UAT B·G |
| D-01 D-1 공백을 GCS 업로드 당일 밤으로 | 01·16 | ✓ SATISFIED | gh-trade 회신 ① 수용(20:30 이후 판정 · 21:30 회차) · 11/2 격자 01:30 변환 |
| D-02 밤 변환 대상(매집 등록 ∪ 15%↑) | 04·16·18 | ✓ SATISFIED | 10/30 KRX 141 · NXT 138 대상 실측 |
| D-03 그 밖 요청 변환 | 04·06·07·08·16 | ⚠️ SATISFIED (실측 수치 기록 없음) | request 모드 · UAT C. SC3 경고 참조 |
| D-04 격자 90일 | 04·06·12·16·18 | ✓ SATISFIED | keepDays=90 · `tick_purge_old` · purge=ok |
| D-05 당일 하루치 한 번에 + 이어받기 | 01·09·15·17·19 | ✓ SATISFIED | 실측 · 이어받기는 단위 시험 |
| D-06 자동 폴링(보일 때·끝일 때만) + 새 틱 배지 | 09·17·19 | ✓ SATISFIED | `use-tick-live` 시험 12 · UAT 「당일 OK」 |
| D-07 서버 캐시 키당 1줄 · 마감 뒤 승격 | 09·12·15·17 | ⚠️ PARTIAL | 키당 1줄은 ✓. **승격은 CR-30·CR-31 로 무결성 미보장** |
| D-08 DMA 게이트 | 04·07·08·15·16 | ✓ SATISFIED | RPC 게이트 · 403 · DmaGate |
| D-09 누적 순매수 있으면/없으면 | 04·07·14 | ✓ SATISFIED | `team-model.test` · 차트 시험 |
| D-10 팀 KPI 틱마다 A3 평균단가법 | 03·14 | ✓ SATISFIED | pnl 골든 |
| D-11 5창구 마지막 B9 | 05·14 | ✓ SATISFIED | `ticks-members.test` · `tick-team-panel.test` |
| D-12 우리 체결 포함 · 캡션 | 03·14 | ✓ SATISFIED | 골든 정의 일치 · 캡션 시험 |
| D-13 NXT 팀 판정(매집감지 규칙) | 03·13·14 | ✓ SATISFIED | NXT 골든 179/65 |
| D-14 사이드바 | 08 | ✓ SATISFIED | `app-sidebar.tsx:188` (이후 사용자 요청으로 「틱뷰어」·맨 위로 변경) |
| D-15 기본 날짜 | 04·07·08 | ✓ SATISFIED | `tick-viewer-page.tsx:42` · 15%↑ 오표시 수정(`ohlc_updated_at`) |
| D-16 진입 목업 A | 08 | ✓ SATISFIED | `tick-entry`·`tick-stock-picker`·`tick-state-card` + e2e |
| D-17 세 보고서 「틱 보기」 | 11·16 | ✓ SATISFIED | 컴포넌트 3종 |
| D-18 URL 딥링크 | 05·08·10·19 | ⚠️ SATISFIED (WR-65) | ms 단위 |
| D-19 TS 디코더 · golden | 01·02·06·13 | ✓ SATISFIED | 골든 통과 |
| D-20 shared 순수 함수 + 오라클 | 03·13·16 | ✓ SATISFIED | 골든 통과 |
| D-21 gh-trade 인박스 | 01·17·18 | ✓ SATISFIED | 노트 둘 `status: done` |
| D-22 배포 순서 | 01·15·16·17·19 | ✓ SATISFIED | DB → Job → server → push → (20:00 이후) radar-gw → server 스위치 순으로 실행 기록 |

### Anti-Patterns Found

디버그 마커(`TBD`/`FIXME`/`XXX`)·스텁 반환은 검사 대상 핵심 파일에서 발견하지 못했다(리뷰 Part A~C 도 스텁 지적 없음). 결함은 스텁이 아니라 **계약 불일치·누락 분기** 형태다.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tickgw/src/poller.ts` | 311-326, 418-446 | `compressedFilesSkipped` 무시 | 🛑 Blocker (M2) | 잘린 하루가 promoted |
| `workers/tick-convert/src/tickgw-export.ts` | 77-79, 124 | null ns 를 계약 위반으로 throw, 전체 실패 | 🛑 Blocker (M3) | 그날 승격 전멸 |
| `workers/tick-convert/tests/helpers/fake-tickgw.ts` | 89-90 | 가짜가 실제와 다른 값(`"0"`) | ⚠️ Warning | 시험이 결함을 가림 |
| `webapp/src/lib/ticks/use-tick-cursor.ts` | 249-269 | 재생 중 `replaceState` 가 진행 중 `router.push` 폐기(WR-60) | ⚠️ Warning | 재생 중 「목록으로」·종목 이동이 가끔 무시됨 |
| 당일 훅(WR-62·63·64) | — | zstd 해제 예외 미처리 · `X-Tick-Complete=false` 미표시 · offset 헤더 부재를 0 으로 | ⚠️ Warning | 당일 경로 방어력 |
| tickgw 운영(WR-30~35) | — | 승격 크기 상한 없음 · 256MB 버퍼 복사 · LRU 재다운로드 고리 · 배포 시각 가드 · 선택 env 누락 | ⚠️ Warning | 운영 견고성(실제 사고 미발생) |

그 밖 리뷰 Warning 16 · Info 18 전체는 `37-REVIEW.md` · `37-REVIEW-DISPOSITION.md`(전부 open) 참조. CR 두 건 외에는 목표 달성을 막지 않는 견고성·사용성 항목으로 판단한다.

### Human Verification Required

없음 — gaps_found 가 우선한다. 다음은 gap closure 와 별개로 기록만 권고한다.

1. **요청 변환 실측 수치 보충(SC 3).** 프로덕션에서 비대상 종목을 하나 열어 「변환 중 · 약 N분 → 자동 열림」 소요와 동시 요청 시 Cloud Run 실행 1회를 확인해 37-16-SUMMARY 에 남긴다. 기능 자체는 UAT C(천일고속 10/14) 로 동작이 확인되었다.
2. **로드맵 장부 갱신.** `ROADMAP.md` 의 `37-17-PLAN.md` 체크박스가 비어 있고 헤더가 `18/19 plans executed` 로 남아 있다. 37-17-SUMMARY 는 `status: complete`(2026-11-03). gap closure 뒤 phase complete 처리 때 함께 바로잡는다.

### Gaps Summary

**목표 달성 판단.** 사용자가 KRX·NXT 종목의 틱을 수신순·거래소순으로 재생하고, 그 틱의 호가창·전문·버스트·거래대금·팀 거래정보를 보는 기능은 shared 골든(디코더·KRX/NXT 판정·천일 10/14 손익), 웹·서버·tickgw·변환 Job 시험, pgTAP, 운영 배포 및 사용자 UAT(A~G, 당일 OK) 로 일관되게 증명된다. 과거·당일 두 공급 경로 모두 운영에서 가동 중이다.

**막는 것.** 두 gap 은 모두 **20:00 승격 경로**에 한정된다 — 화면에서 보이는 뷰어 자체가 아니라, 당일에 열어 본 비대상 종목을 "내일 요청 변환 없이 열리게" 격자로 남기는 부가 경로다.
- **CR-31(M2)** 은 조용한 데이터 오류다. 일찍 닫힌 키의 낮 시간대가 비어 있는 하루가 "완결 promoted" 로 보이고 요청 변환까지 막는다. 이 페이즈의 무결성 약속("전체이거나 없음")을 정면으로 어긴다. 11/3 운영 11키가 이 경우였는지는 확인할 수 없다(승격 로그가 이 구멍을 관측하지 못함).
- **CR-30(M3)** 은 시끄러운 실패다(Job 종료 1 · 알림). 0건 키(예: NXT 비상장 종목을 NXT 로 열기)가 하루치 승격 전체를 죽인다. 사용자가 그런 조작을 하면 언제든 발생한다.

**권고.** `/gsd-plan-phase 37 --gaps` 로 소규모 closure 플랜 하나(`poller.applyOk` 한 줄 + `checkKey` null 허용 + `list()` 키 단위 내리기 + 시험 보강, 선택으로 19:55 사전 마무리)를 만들고, 같은 라운드에 WR-30(승격 크기 상한)·WR-62(당일 해제 예외)를 함께 처리하는 것을 검토한다. 나머지 리뷰 항목은 별도 후속으로 미뤄도 목표 달성에는 영향이 없다. 재리뷰·재검증 파일은 기존 규칙대로 `-R2` 로 분리한다.

---

_Verified: 2026-11-04T04:40:00Z_
_Verifier: Claude (gsd-verifier)_
