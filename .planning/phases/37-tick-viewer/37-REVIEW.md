---
phase: 37-tick-viewer
reviewed: 2026-11-04T00:00:00Z
depth: standard
files_reviewed: 176
files_reviewed_list:
  - infra/relay/tickpull/install.sh
  - ops/alert-tick-convert-failure.yaml
  - packages/shared/src/__tests__/helpers/tick-digest.ts
  - packages/shared/src/__tests__/ticks-book.test.ts
  - packages/shared/src/__tests__/ticks-decode.golden.test.ts
  - packages/shared/src/__tests__/ticks-density.test.ts
  - packages/shared/src/__tests__/ticks-framing.test.ts
  - packages/shared/src/__tests__/ticks-layouts.test.ts
  - packages/shared/src/__tests__/ticks-members.test.ts
  - packages/shared/src/__tests__/ticks-orders-krx.golden.test.ts
  - packages/shared/src/__tests__/ticks-orders-nxt.golden.test.ts
  - packages/shared/src/__tests__/ticks-pnl.golden.test.ts
  - packages/shared/src/__tests__/ticks-record-index.test.ts
  - packages/shared/src/__tests__/ticks-route.test.ts
  - packages/shared/src/__tests__/ticks-time.test.ts
  - packages/shared/src/index.ts
  - packages/shared/src/teamflow-report.ts
  - packages/shared/src/tick-api.ts
  - packages/shared/src/ticks/book.ts
  - packages/shared/src/ticks/decode.ts
  - packages/shared/src/ticks/density.ts
  - packages/shared/src/ticks/framing.ts
  - packages/shared/src/ticks/index.ts
  - packages/shared/src/ticks/layouts.ts
  - packages/shared/src/ticks/members.ts
  - packages/shared/src/ticks/orders-krx.ts
  - packages/shared/src/ticks/orders-nxt.ts
  - packages/shared/src/ticks/record-index.ts
  - packages/shared/src/ticks/route.ts
  - packages/shared/src/ticks/team-pnl.ts
  - packages/shared/src/ticks/tick-time.ts
  - pnpm-workspace.yaml
  - scripts/deploy-server.sh
  - scripts/deploy-tick-convert.sh
  - scripts/deploy-tickgw.sh
  - scripts/setup-tick-convert-iam.sh
  - scripts/setup-tickgw-iam.sh
  - scripts/smoke-tick-convert.sh
  - scripts/tick-oracle/gen-fixtures.sh
  - scripts/tick-oracle/oracle.py
  - server/src/app.ts
  - server/src/config.ts
  - server/src/routes/ticks.ts
  - server/src/schemas/ticks.ts
  - server/src/server.ts
  - server/src/services/cors-config.ts
  - server/src/services/tick-convert-trigger.ts
  - server/src/services/tick-gate-cache.ts
  - server/src/services/tickgw-client.ts
  - server/src/services/ticks.ts
  - server/tests/routes/ticks-live.test.ts
  - server/tests/routes/ticks.test.ts
  - server/tests/services/cors-config.test.ts
  - server/tests/services/tick-convert-trigger.test.ts
  - server/tests/services/tickgw-client.test.ts
  - supabase/migrations/20261102200000_tick_viewer.sql
  - supabase/migrations/20261102200100_tick_viewer_queue.sql
  - supabase/migrations/20261102200200_teamflow_report_t20.sql
  - supabase/migrations/20261103090000_stock_quotes_ohlc_updated_at.sql
  - supabase/tests/teamflow_report.test.sql
  - supabase/tests/tick_viewer.test.sql
  - tickgw/Dockerfile
  - tickgw/package.json
  - tickgw/src/cache.ts
  - tickgw/src/config.ts
  - tickgw/src/indexer.ts
  - tickgw/src/log.ts
  - tickgw/src/poller.ts
  - tickgw/src/server.ts
  - tickgw/tests/fixtures/fake-indexer.mjs
  - tickgw/tests/indexer.test.ts
  - tickgw/tests/poller.test.ts
  - tickgw/tests/server.test.ts
  - tickgw/tsconfig.json
  - tickgw/vitest.config.ts
  - webapp/e2e/fixtures/ticks.ts
  - webapp/e2e/specs/sidebar-tree.spec.ts
  - webapp/e2e/specs/ticks-viewer.spec.ts
  - webapp/package.json
  - webapp/src/app/analytics/ticks/page.tsx
  - webapp/src/components/analytics/__tests__/accum-detail.test.tsx
  - webapp/src/components/analytics/__tests__/limitup-event-card.test.tsx
  - webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx
  - webapp/src/components/analytics/accum-day-grid.tsx
  - webapp/src/components/analytics/accum-detail.tsx
  - webapp/src/components/analytics/limitup-date-nav.tsx
  - webapp/src/components/analytics/limitup-event-card.tsx
  - webapp/src/components/analytics/teamflow-detail.tsx
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/ticks/__tests__/tick-amount-card.test.tsx
  - webapp/src/components/ticks/__tests__/tick-book.test.tsx
  - webapp/src/components/ticks/__tests__/tick-chart.test.tsx
  - webapp/src/components/ticks/__tests__/tick-entry.test.tsx
  - webapp/src/components/ticks/__tests__/tick-msg-list.test.tsx
  - webapp/src/components/ticks/__tests__/tick-order-card.test.tsx
  - webapp/src/components/ticks/__tests__/tick-slider.test.tsx
  - webapp/src/components/ticks/__tests__/tick-state-card.test.tsx
  - webapp/src/components/ticks/__tests__/tick-stock-picker.test.tsx
  - webapp/src/components/ticks/__tests__/tick-team-panel.test.tsx
  - webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx
  - webapp/src/components/ticks/tick-amount-card.tsx
  - webapp/src/components/ticks/tick-book.tsx
  - webapp/src/components/ticks/tick-chart.tsx
  - webapp/src/components/ticks/tick-entry.tsx
  - webapp/src/components/ticks/tick-header.tsx
  - webapp/src/components/ticks/tick-msg-list.tsx
  - webapp/src/components/ticks/tick-order-card.tsx
  - webapp/src/components/ticks/tick-slider.tsx
  - webapp/src/components/ticks/tick-state-card.tsx
  - webapp/src/components/ticks/tick-stock-picker.tsx
  - webapp/src/components/ticks/tick-team-panel.tsx
  - webapp/src/components/ticks/tick-viewer-page.tsx
  - webapp/src/components/ticks/tick-viewer.tsx
  - webapp/src/components/trading/dma-gate.tsx
  - webapp/src/hooks/__tests__/use-chart-view.test.tsx
  - webapp/src/hooks/use-chart-view.ts
  - webapp/src/lib/__tests__/accum-chart.test.ts
  - webapp/src/lib/accum-chart.ts
  - webapp/src/lib/ticks/__tests__/msg-rows.test.ts
  - webapp/src/lib/ticks/__tests__/team-model.test.ts
  - webapp/src/lib/ticks/__tests__/tick-chart.test.ts
  - webapp/src/lib/ticks/__tests__/tick-format.test.ts
  - webapp/src/lib/ticks/__tests__/tick-link.test.ts
  - webapp/src/lib/ticks/__tests__/tick-session.test.ts
  - webapp/src/lib/ticks/__tests__/tick-url.test.ts
  - webapp/src/lib/ticks/__tests__/use-fixed-window.test.tsx
  - webapp/src/lib/ticks/__tests__/use-tick-cursor.test.tsx
  - webapp/src/lib/ticks/__tests__/use-tick-grid.test.tsx
  - webapp/src/lib/ticks/__tests__/use-tick-live.test.tsx
  - webapp/src/lib/ticks/msg-rows.ts
  - webapp/src/lib/ticks/team-model.ts
  - webapp/src/lib/ticks/tick-api.ts
  - webapp/src/lib/ticks/tick-chart.ts
  - webapp/src/lib/ticks/tick-format.ts
  - webapp/src/lib/ticks/tick-link.ts
  - webapp/src/lib/ticks/tick-session.ts
  - webapp/src/lib/ticks/tick-url.ts
  - webapp/src/lib/ticks/use-fixed-window.ts
  - webapp/src/lib/ticks/use-tick-cursor.ts
  - webapp/src/lib/ticks/use-tick-grid.ts
  - webapp/src/lib/ticks/use-tick-live.ts
  - webapp/src/styles/globals.css
  - webapp/src/test-fixtures/tick-grid.ts
  - webapp/src/test-fixtures/tick-synth.ts
  - workers/tick-convert/Dockerfile
  - workers/tick-convert/package.json
  - workers/tick-convert/src/archive.ts
  - workers/tick-convert/src/config.ts
  - workers/tick-convert/src/grid-file.ts
  - workers/tick-convert/src/index.ts
  - workers/tick-convert/src/logger.ts
  - workers/tick-convert/src/meta.ts
  - workers/tick-convert/src/modes/nightly.ts
  - workers/tick-convert/src/modes/promote.ts
  - workers/tick-convert/src/modes/request.ts
  - workers/tick-convert/src/purge.ts
  - workers/tick-convert/src/scan.ts
  - workers/tick-convert/src/select.ts
  - workers/tick-convert/src/services/supabase.ts
  - workers/tick-convert/src/stage.ts
  - workers/tick-convert/src/store.ts
  - workers/tick-convert/src/tickgw-export.ts
  - workers/tick-convert/tests/archive.test.ts
  - workers/tick-convert/tests/config.test.ts
  - workers/tick-convert/tests/entry.test.ts
  - workers/tick-convert/tests/helpers/fake-supabase.ts
  - workers/tick-convert/tests/helpers/fake-tickgw.ts
  - workers/tick-convert/tests/helpers/synth-archive.ts
  - workers/tick-convert/tests/nightly.test.ts
  - workers/tick-convert/tests/promote.test.ts
  - workers/tick-convert/tests/purge.test.ts
  - workers/tick-convert/tests/request.test.ts
  - workers/tick-convert/tests/too-large.test.ts
  - workers/tick-convert/tsconfig.json
  - workers/tick-convert/vitest.config.ts
findings:
  critical: 2
  warning: 16
  info: 18
  total: 36
status: issues_found
---

# Phase 37: Code Review Report

**Reviewed:** 2026-11-04
**Depth:** standard
**Files Reviewed:** 176
**Status:** issues_found

> 176 파일 범위(SUMMARY key-files ∪ task-commit 범위 — 바이너리 픽스처 · 생성 골든 json · lockfile · 문서 · 저장소 밖 경로 제외)를 리뷰어 셋이 영역별로 나눠 봤다. ID 대역: Part A 01–29 · Part B 30–59 · Part C 60–89. Phase 38 리뷰(38-REVIEW.md)와 UI 감사(37-UI-REVIEW.md)에 이미 있는 항목은 다시 올리지 않았다.

## Summary

### Part A — packages/shared ticks · tick-api · tick-oracle · supabase

Part A(shared 틱 디코더 · 판정 · 손익 · 뷰어 모델 · API 계약, 오라클 생성기, 틱 뷰어 마이그레이션 4개와 pgTAP 2개)를 현재 상태 기준으로 읽었다. 번역 모듈(`framing` · `layouts` · `decode` · `orders-krx` · `orders-nxt` · `team-pnl`)은 gh-trade 원문(`pcap2parquet.py` 레코드 루프 · `teamflow.team_pnl`)과 직접 한 줄씩 대조했고 갈리는 곳이 없었다. 은행가 반올림(음수 .5 포함), 2^53 넘는 값의 BigInt 경로, zstd 프레임 헤더 크기 계산, time12 KST 날짜 내림, `price_change` 부호도 확인했다. `tsc --noEmit -p packages/shared` 는 깨끗하고(루트 `export *` 이름 충돌 0), RPC 는 전부 PUBLIC · anon · authenticated 를 명시적으로 REVOKE 했으며 첫 줄에서 `dma_visible_accounts` 게이트를 탄다(우회 경로 0).

주요 우려는 요청 변환 큐의 **하루 상한(비용 가드)이 실제 Job 실행 횟수가 아니라 「오늘 triggered_at 이 찍힌 행 수」를 센다**는 점이다. 같은 키를 다시 요청하면 앞서 찍힌 `triggered_at` 이 지워져, 한 키는 몇 번을 다시 깨워도 상한에 1건으로만 잡힌다. 그 밖에는 여러 사용자가 공유하는 요청을 첫 요청자가 취소할 수 있는 문제, 선택 골든 테스트의 게이트 조건 불일치, 정보성 유지보수 항목들이 있다. CONTEXT 의 확정 결정(D-03 요청 변환 비용 수용 · D-09 누적 선 · D-12 우리 체결 포함 · D-13 NXT 미합산)에 따른 의도된 동작은 지적하지 않았다.

### Part B — server · tickgw · workers/tick-convert · 배포 스크립트

Part B 범위(tickgw 컨테이너 · server 당일/과거 틱 경로 · tick-convert Job 3모드 · 배포/IAM 스크립트)를 현재 트리 기준으로 읽었다. 인증 · 공유 비밀 · 사설 대역 가드(requireAuth → 게이트 캐시 → tickgw, `secretOk` timingSafeEqual, `assertTickgwUrl` / `checkTickgwUrl` userinfo 우회 차단)는 우회 경로를 찾지 못했다.

문제는 **승격(promote) 경로의 계약 불일치 두 건**에 몰려 있다.
1. tickgw 가 레코드 0건인 closed 키를 `first_recv_ns: null` 로 내보내는데, 승격 Job 은 그 필드가 문자열이 아니면 **목록 전체를 throw** 한다. 그러면 그날 승격이 한 키도 되지 않는다. 시험용 가짜 tickgw 가 `"0"` 을 돌려주고 있어서 이 결함이 가려졌다.
2. 119 기록기는 20:00 에 지난 시간 파일을 `zstd --rm` 으로 압축한다. 그런데 20:01 마감 마무리는 `compressed_files_skipped` 를 무시하고 키를 `complete/closed` 로 닫는다. 그 결과 브라우저가 일찍 닫힌 키는 몇 시간이 빠진 하루가 「완결」 승격본으로 올라간다. 승격본이 있으면 `grid_ready` 가 요청 변환까지 막는다.

그 밖에는 다음을 Warning 으로 분류했다.
- tickgw 256MB 컨테이너 안의 전체 버퍼 복사(OOM 이면 그날 캐시 소실)
- 캐시 상한을 넘을 때 LRU 가 활성 키를 지우고 다시 받는 반복(119 부하)
- 승격의 50MB 상한 누락
- 배포 시각 가드가 20:00~21:00 승격 창을 보호하지 않음
- 선택 env `TICKGW_URL` 을 빠뜨린 재배포가 당일 경로를 조용히 끄거나 승격 Job 을 옛 이미지에 묶어 둠
- nightly 영구 실패 날짜의 반복 전량 통독

### Part C — webapp 틱 뷰어 · 링크 · 당일 경로

Phase 37 의 webapp 쪽 전체를 읽었다. 흐름은 다음과 같다. 페이지(`tick-viewer-page`)가 `open`·변환 폴링·당일 경로를 고른다. 격자는 `useTickGrid` 가 받아 fzstd 로 스트리밍 해제하고, 당일은 `useTickLive` 가 하루치를 받은 뒤 버튼으로 증분을 받는다. 세션은 `buildTickSession` 이 만들고 `useTickCursor` 가 커서·키·재생·URL `t` 를 맡는다. 그 아래로 차트·슬라이더·호가·전문 목록·카드가 붙고, 세 보고서의 「틱 보기」 링크와 사이드바·DmaGate·날짜 알약 달력이 있다. globals.css 는 틱 뷰어 토큰(`--vi`·`--mine`)과 `tick-indeterminate` 만 봤다.

38-REVIEW.md 에 이미 있는 항목(우리 체결 dt 부호, 당일 끝자락 오짝, 중복 A3, ownPick id, own 실패 시 층 소실, 재정렬 키, 고른 줄 해제, 모양 검사, 라벨 하드코딩)은 다시 올리지 않았다. UI 감사 항목(글자·간격·포커스)도 뺐다.

결함은 **URL 쓰기·당일 증분·디코딩 오류 처리**에 모여 있다.

- **WR-60 · WR-61:** 커서의 250ms 스로틀 `history.replaceState` 가 두 가지 문제를 일으킨다.
  - Next 15 는 이 호출을 `ACTION_RESTORE` 로 바꾸고, 진행 중인 `router.push` 를 버린다(`app-router-instance.js:131-134` 에서 확인). 그래서 재생 중에 「목록으로」·날짜·거래소·종목 고르기를 누르면 이동이 사라질 수 있다.
  - 대기 중인 타이머가 옛 세션을 붙잡고 있어서, 당일 증분 직후 BigInt TypeError 가 나거나 틀린 `t` 가 써질 수 있다.
- **WR-62:** 당일 경로에서 zstd 해제·세션 재생성 예외를 잡지 않는다. 하루치 받기에서 나면 카드가 영원히 「받는 중」에 머문다. 증분에서 나면 offset 이 이미 앞으로 가 있어서 그 조각을 조용히 건너뛴다(틱 구멍).
- **WR-63:** `X-Tick-Complete=false`(tickgw 가 알고 있는 끊김)를 읽기만 하고 아무 데도 보이지 않는다.
- **WR-64:** `tickLiveMetaOf` 는 헤더가 없으면 null 을 준다고 주석에 적었다. 그런데 `Number('') === 0` 이라 null 이 아니라 0 이 된다.
- **WR-65:** URL `t` 는 ms 로 잘린다. 그래서 한 ms 안에 몰린 버스트 조각에서는 딥링크·새로고침이 같은 틱으로 돌아오지 않는다.

## Critical Issues

### CR-30: 레코드 0건 closed 키 하나가 그날 승격 전체를 실패시킨다 (tickgw export ↔ promote 계약 불일치)

**File:** `tickgw/src/server.ts:132-133` · `workers/tick-convert/src/tickgw-export.ts:77-79,124` · `workers/tick-convert/tests/helpers/fake-tickgw.ts:89-90`

**Issue:** tickgw `exportList` 는 `firstRecvNs`/`lastRecvNs` 가 null 이면 `first_recv_ns: null`, `last_recv_ns: null` 을 싣는다. 레코드 0건 키(예: NXT 비상장 종목을 NXT 로 연 경우, 거래정지 종목)가 바로 이렇다. 이런 키도 `closeOne` 에서 `applyOk` → `entry.complete` 가 유지되므로 `closed = true` 가 되고, 따라서 export 목록에 나온다. 반면 승격 Job 의 `checkKey` 는 세 ns 필드가 `/^\d{1,20}$/` 문자열이 아니면 throw 한다. `list()` 는 `body.keys.map(checkKey)` 로 키 하나의 모양 위반을 목록 전체 실패로 바꾼다. 그러면 `runPromote` 가 throw 하고 종료 1 이 되며, **그날 모든 키가 승격되지 않는다**(20:40 재실행도 같은 키 때문에 똑같이 실패). 0건 키에는 promote 의 「레코드 0 → incomplete」 분기(promote.ts:168)가 이미 있지만, 그 분기까지 가지 못한다. 시험 가짜(`fake-tickgw.ts:89-90`)는 빈 키에 `String(0n)` = `"0"` 을 돌려줘서 실제 tickgw 계약과 갈라져 있다. 시험이 초록이어도 이 경로는 증명되지 않았다.

**Fix:** 두 쪽 중 하나로 계약을 맞추고, 가짜도 실제와 같게 고친다.
```ts
// tickgw-export.ts checkKey — first/last 는 null 허용, closed_through 만 필수
for (const f of ["first_recv_ns", "last_recv_ns"] as const) {
  if (o[f] !== null && (typeof o[f] !== "string" || !NS_RE.test(o[f] as string))) bad(f);
}
if (typeof o.closed_through_ns !== "string" || !NS_RE.test(o.closed_through_ns)) bad("closed_through_ns");
// TickgwExportKey.first_recv_ns/last_recv_ns: string | null

// 또는 tickgw/src/server.ts exportList 에서 records === 0 키를 keys 에서 빼고 unclosed 처럼 별도 카운트
// fake-tickgw.ts:89-90 — 빈 키는 null 을 돌려주고 promote.test 에 「0건 closed 키 + 정상 키」 사례 추가
```
키 하나의 모양 위반이 run 전체를 죽이지 않도록, `list()` 는 키 단위 검사 실패를 `incomplete`/`failed` 로 내리는 편이 안전하다.

### CR-31: 20:00 원본 압축(`compressed_files_skipped`)을 무시해 잘린 하루를 「완결 · closed」 로 승격한다

**File:** `tickgw/src/poller.ts:311-326,418-446` · `tickgw/src/indexer.ts:133-136` · `tickgw/src/poller.ts:199-207`

**Issue:** gh-trade 인덱서 계약(`gh-trade/server/tools/indexer/README.md:41,64`)은 이렇다. 「20:00 보류 창이 끝나면 기록기가 지난 시간 파일을 `zstd --rm` 으로 압축 → 그 파일은 질의에서 건너뛰고 `compressed_files_skipped` 로 센다」. tickgw 는 이 값을 `parseMeta` 로 읽지만 로그(`skipped`)에만 남긴다. `applyOk` 는 이 값과 관계없이 `entry.complete` 를 그대로 둔다.

폴러는 리스가 살아 있는 키만 증분을 받는다(`liveRuns`, `leaseUntil > now`). 그래서 브라우저가 예를 들어 11:00 에 닫힌 키는 `lastRecvNs ≈ 11:00` 에 멈춘다. 이런 키는 오늘 complete 라서 유휴 삭제도 면제된다. 20:01 마감 마무리(`closeOne`)는 `lastRecvNs+1` 부터 요청한다. 이때 11~19시 파일은 이미 `.pcap.zst` 로 바뀌어 건너뛰어지고, 20시 파일의 몇 초분만 온다. 결과는 `has_more=false` → `closed = true`, `closedThroughNs ≈ 20:00:59` 다. 승격 Job 의 재확인(closed_through ≥ 20:00, 첫 recv ≥ 08:00, records 일치, 잘린 꼬리 없음)도 모두 통과한다. 결국 **11:00~20:00 이 빠진 하루가 promoted 격자로 올라간다**. 이것은 promote.ts 머리 주석이 막으려던 바로 그 상황(「잘린 하루가 promoted 로 남아 `grid_ready` 로 요청 변환을 막는」)이다. D-02 대상이 아닌 종목은 밤 변환이 덮어 주지도 않는다. 20:00 이후 처음 연 키도 같은 이유로 일부만 받으면서 `X-Tick-Complete: true` 를 내보낸다(server.ts:187).

**Fix:** 건너뛴 파일이 있으면 그 키는 더 이상 「08:00 부터 끊김 없음」 이 아니다.
```ts
// poller.ts applyOk — append 직후
if (meta.compressedFilesSkipped > 0) {
  if (entry.complete) log("warn", "compressed files skipped — not complete", { key: run.key, skipped: meta.compressedFilesSkipped });
  entry.complete = false; // closeOne 의 `!entry.complete` 분기가 승격을 막는다 · live 는 X-Tick-Complete:false
}
```
승격률을 지키려면 이것과 함께 「오늘 complete 키는 19:55 KST 부터 리스와 무관하게 증분을 받아 20:00 전에 따라잡는」 사전 마무리 단계를 더한다(아니면 대부분의 키가 승격에서 빠진다). 정확성의 최소 조건은 위 한 줄이다.

## Warnings

### WR-01: 요청 변환 하루 상한이 「행 수」를 세서, 같은 키를 다시 깨우는 Job 실행이 상한에 잡히지 않음

**File:** `supabase/migrations/20261102200100_tick_viewer_queue.sql:128-153`
**Issue:** 상한 판정(129-133행)은 `triggered_at` 이 오늘(KST)인 **요청 행** 수를 센다. 그런데
- (6) `INSERT … ON CONFLICT DO UPDATE` (141-146행)가 끝난 요청(`failed` · `cancelled` · `done`)을 다시 pending 으로 돌릴 때 `triggered_at = NULL` 로 지운다. 바로 다음 (7)에서 같은 행에 `now()` 가 다시 찍히므로, 몇 번을 다시 요청해도 그 키는 상한에 계속 1건이다.
- (7) (149-153행)은 2분이 지난 pending 의 `triggered_at` 을 덮어쓴다. 그래서 Job 이 claim 전에 죽는 경우, 웹 폴링의 stale 재요청(`tick-viewer-page.tsx:277,322`)이 2분마다 Job 을 새로 깨워도 상한은 늘지 않는다.
- `NO_RECORDS` · `TOO_LARGE` 는 과거 날짜에서는 결과가 정해진 실패인데, 120행의 단락은 `NOT_UPLOADED` 만 막는다. 그래서 「다시 시도」를 누를 때마다 같은 결과를 내는 하루치 Archive 통독 Job 이 다시 돈다. 취소 → 재요청 반복도 같다(취소된 행은 `tick_trigger_blocked` 의 pending/running 조건에 안 걸린다).

머리 주석(29-30행)은 이 상한을 「사용자 수와 독립이어야 하는 비용 가드」라고 하지만, 실제로는 **서로 다른 키의 수**만 묶을 뿐 Job 실행 횟수를 묶지 못한다. server 쪽에도 별도 스로틀이 없다(`server/src/routes/ticks.ts:180` 은 cap 을 넘기기만 한다). pgTAP J 절도 「같은 키 재요청」이 상한을 소모하는지는 확인하지 않는다.
**Fix:** 상한은 Job 실행 단위로 센다. 결정된 실패는 다시 깨우지 않는다.
```sql
-- (a) 실행 수로 센다 — 트리거한 횟수를 따로 쌓는다(행을 덮어써도 지워지지 않게)
ALTER TABLE public.tick_convert_requests ADD COLUMN trigger_count integer NOT NULL DEFAULT 0;
-- (7) UPDATE … SET triggered_at = now(), trigger_count = trigger_count + 1 …
-- 상한: SELECT coalesce(sum(trigger_count),0) … WHERE (triggered_at AT TIME ZONE 'Asia/Seoul')::date = v_today
--   (하루가 넘어가면 0 으로 되돌리거나, tick_convert_runs mode='request' 의 오늘 행 수로 센다)

-- (b) 결정된 실패는 NOT_UPLOADED 처럼 단락(과거 날짜 원본은 바뀌지 않는다)
ELSIF v_found AND v_row.status = 'failed' AND v_row.error IN ('NO_RECORDS', 'TOO_LARGE') THEN
  v_out := v_out || jsonb_build_object('terminal', true);
```
위 둘 중 (a)는 필수, (b)는 비용 가드를 강하게 하고 싶을 때 쓴다. pgTAP 에 「같은 키 failed → 재요청 → 상한 소모」 단언을 더한다.

### WR-02: 여러 사용자가 합쳐 쓰는 요청을 첫 요청자가 취소하면 다른 사용자 화면에는 「실패」로 보임

**File:** `supabase/migrations/20261102200100_tick_viewer_queue.sql:141-146, 194-197`
**Issue:** D-03 은 「같은 (종목, 날짜) 동시 요청은 Job 하나로 합친다」이다. 그런데 행은 (날짜, 거래소, isin) 하나뿐이고 `requested_by` 에는 첫 요청자만 남는다. 두 번째 사용자가 같은 키를 요청하면 ON CONFLICT 의 `WHERE r.status IN ('failed','cancelled','done')` 가 거짓이라 행이 그대로다. 이때 첫 요청자가 취소하면(194-197행) 공유 요청 전체가 `cancelled` 가 된다. 두 번째 사용자의 폴링은 `cancelled` 를 「변환에 실패했어요 · 다시 시도」 카드로 보여 준다(`webapp/src/components/ticks/tick-viewer-page.tsx:319-320`). 거꾸로 두 번째 사용자는 자기가 기다리는 요청을 취소할 수 없다(`cancelled: false`).
**Fix:** 요청자를 집합으로 두고 취소는 「내 몫 빼기」로 바꾼다. 마지막 요청자가 빠질 때만 `cancelled` 로 한다.
```sql
ALTER TABLE public.tick_convert_requests ADD COLUMN requesters uuid[] NOT NULL DEFAULT '{}';
-- 요청: … DO UPDATE SET requesters = array_append(array_remove(r.requesters, p_user_id), p_user_id) …(종료 상태 리셋은 따로)
-- 취소: UPDATE … SET requesters = array_remove(requesters, p_user_id),
--              status = CASE WHEN cardinality(array_remove(requesters, p_user_id)) = 0 THEN 'cancelled' ELSE status END
--        WHERE … AND status = 'pending' AND p_user_id = ANY(requesters);
```
최소 수정으로는 웹이 `cancelled` 를 「실패」가 아니라 「취소됨 · 다시 요청」으로 구분해 보이게 한다.

### WR-03: 빅텍 하루 선택 골든은 `.pnl.json` 존재만 보고 켜지는데, 생성기는 크기 초과 `.ticks.zst` 를 「커밋하지 말라」고만 함

**File:** `packages/shared/src/__tests__/ticks-pnl.golden.test.ts:262-268`, `scripts/tick-oracle/gen-fixtures.sh:86-94`
**Issue:** `gen-fixtures.sh pnl --bigtech` 는 1.5MB 를 넘어도 `bigtech-1022-a3.ticks.zst` 와 `bigtech-1022.pnl.json` 을 **둘 다 쓰고** 종료 0 이다. 안내는 「커밋하지 않는다(테스트는 skipIf)」뿐이다. 그런데 테스트 게이트(262행)는 `bigtech-1022.pnl.json` 만 확인한 뒤 `.ticks.zst` 를 읽는다(266행). 안내대로 큰 zst 만 빼고 json 을 커밋하면 CI 에서 ENOENT 로 깨진다. 생성한 로컬 트리에서는 늘 통과해서 드러나지 않는다.
**Fix:**
```ts
const BIGTECH_DAY =
  existsSync(tickFixturePath("bigtech-1022.pnl.json")) && existsSync(tickFixturePath("bigtech-1022-a3.ticks.zst"));
```
생성기는 크기를 넘으면 두 파일을 다 지우거나 `exit 1` 로 끝낸다(decode · launch 부명령과 같게).

### WR-30: 승격 경로에 격자 크기 상한(`GRID_MAX_BYTES`)이 없다 → 대형 종목은 매일 두 번 실패 · 알림

**File:** `workers/tick-convert/src/modes/promote.ts:178-183`

**Issue:** nightly(`nightly.ts:255,264-269`)와 request(`request.ts:181-187`)는 `g.bytes.length > GRID_MAX_BYTES`(버킷 `tick-grid` file_size_limit 50MB)면 업로드하지 않고 TOO_LARGE 로 건너뛴다. promote 에는 이 판정이 없다. 그래서 50MB 를 넘는 키(10/30 KR7420610008 실측 사례)는 Storage 가 업로드를 거부하고, 키는 `failed` 가 되어 종료 1 과 알림 정책 발화로 이어진다. 이 일이 20:10 · 20:40 두 번 반복된다. 또 2Gi Job 안에서 그 키의 원시 바이트 전체를 `decompressFrames`(프레임별 해제 + `concatBytes` 복사)로 펼치므로, 큰 키는 원시의 2배 이상이 동시에 메모리에 올라간다.

**Fix:** nightly · request 와 같은 규칙으로 건너뛴다.
```ts
const g = buildGridFile(raw, deps.config.zstdLevel);
if (g.bytes.length > GRID_MAX_BYTES) {
  out.status = "incomplete"; // 또는 새 상태 "tooLarge" — 실패로 세지 않음
  out.reason = `TOO_LARGE ${g.bytes.length}B > ${GRID_MAX_BYTES}`;
  return;
}
```
`key.bytes`(export 목록의 압축 크기)가 상한의 몇 배를 넘으면 바이트를 당기기 전에 건너뛰는 사전 판정도 메모리 위험을 줄인다.

### WR-31: tickgw 256MB 컨테이너에서 전체 버퍼 복사가 겹쳐 OOM → 그날 캐시(승격 입력) 소실

**File:** `tickgw/src/cache.ts:129-145` · `tickgw/src/server.ts:148,177` · `tickgw/src/indexer.ts:141,169` · `scripts/deploy-tickgw.sh:215-217`

**Issue:** 캐시 상한은 기본 128MB(`TICKGW_CACHE_BYTES`)이고, 컨테이너는 `--memory=256m --memory-swap=256m` 에 `--restart=always` 다. 그런데 다음이 같은 프로세스 안에서 겹친다.
- `slice()` 는 매 요청 `Buffer.concat` 으로 offset..end 를 새로 복사한다. 첫 요청(offset 0)이나 `exportBytes`(키 전체)는 그 키 크기만큼 통째 복사된다.
- ssh 호출 하나가 stdout 을 최대 32MB 청크로 모은 뒤 `Buffer.concat(chunks, size)` 로 다시 복사한다(최대 64MB 일시 사용).
- server 인스턴스가 여럿이거나 브라우저 첫 요청이 몰리면 위 복사가 동시에 여러 개 생긴다.

128MB 캐시 + Node 기본 ~50MB + 인덱서 64MB + export/live 복사 수십 MB 면 상한에 닿는다. OOM-kill 이 나면 재기동하면서 메모리 캐시가 모두 사라진다. 20:01~20:40 사이라면 그날 승격이 통째로 없어지고, 장중이라면 모든 활성 키가 08:00 부터 다시 받기 시작해 119 에 폭주가 간다.

**Fix:** 복사 없이 청크를 그대로 흘려보낸다.
```ts
// server.ts live / exportBytes — Buffer.concat 대신
res.writeHead(200, { ..., "Content-Length": String(end - offset) });
for (const part of deps.cache.iterSlice(key, offset, end)) res.write(part); // subarray 만 내보낸다
res.end();
```
그리고 `cacheBytes` 를 컨테이너 한도의 ≤ 40%(예: 96MB)로 낮추거나 `--memory` 를 올린다. 정상 경로에서는 `indexer.ts` 의 `maxStdoutBytes` 를 계약 상한(16MB) + 여유로 줄이는 것도 검토한다.

### WR-32: 당일 첫 응답(08:00~지금 하루치)에 크기 상한이 없어 server 를 통째로 버퍼링해 통과한다

**File:** `tickgw/src/server.ts:173-177` · `server/src/services/tickgw-client.ts:51-52,132` · `server/src/routes/ticks.ts:147-148`

**Issue:** `live()` 는 `slice(key, offset, end = entry.size)` 로 남은 전부를 한 응답에 싣는다. `slice` 는 `end` 인자를 받지만 쓰지 않는다. server 는 axios `arraybuffer` 로 응답 전체를 메모리에 받은 뒤 `Buffer.from(res.data)` 로 한 번 더 복사한다(Node axios 는 Buffer 를 주므로 이 호출은 복사다). 그다음 `Content-Length` 고정 응답으로 내보낸다. 거래가 많은 종목의 오후 첫 열기는 수십 MB 가 될 수 있다. 이 경우 ① server 인스턴스 메모리를 사용자 수에 비례해 쓰고, ② 20초 axios 타임아웃에 걸릴 수 있으며, ③ Cloud Run 의 HTTP/1 비스트리밍 응답 크기 한도(32 MiB 로 알려져 있음 — 배포 환경에서 확인 필요)를 넘으면 실패한다. 실패하면 웹이 같은 offset 0 을 계속 다시 요청하는 고리에 빠진다.

**Fix:** tickgw 에서 한 응답을 자른다. 웹 훅은 이미 `X-Tick-Offset-End` 로 이어받으므로, 「더 있음」 신호만 더하면 된다.
```ts
const LIVE_MAX = 8 * 1024 * 1024;
const stop = Math.min(entry.size, offset + LIVE_MAX);
const body = deps.cache.slice(key, offset, stop);
// X-Tick-Offset-End = stop · X-Tick-More: stop < entry.size ? "true" : "false"
```
server 쪽은 `Buffer.from(res.data)` 대신 `Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data)` 를 쓴다. 웹은 `X-Tick-More` 가 true 면 곧바로 다음 요청을 보내도록 바꾼다(webapp 은 part C 범위).

### WR-33: 활성 키 합이 캐시 상한을 넘으면 LRU 가 폴링 중인 키를 지우고, 그 키를 08:00 부터 다시 받는 고리에 빠진다

**File:** `tickgw/src/cache.ts:98-126` · `tickgw/src/poller.ts:157-166,231-235,311-313`

**Issue:** `enforceLimit` 은 `append` 할 때마다 `lastAccess` 가 가장 오래된 키를 지우며, 면제가 없다. 리스가 살아 있어서 바로 다음 touch 가 올 키도 지운다. 지워진 키는 다음 touch(≈5초 뒤)에 새 epoch 로 다시 만들어지고, 폴러는 `loaded=false` 로 **08:00 부터 하루치를 16MB 단위로 다시 받는다**. 그 append 가 다시 상한을 넘기면 또 다른 활성 키가 지워진다. 활성 키 합이 상한을 넘는 동안 이 순환이 멈추지 않는다. 키 하나의 하루치가 상한(128MB)을 넘으면 더 나쁘다. 그 키는 append 직후 자기 자신이 지워지고 무한히 처음부터 다시 받는다. 119 인덱서(코어 0 · gh-trade 공유)에 사용자 수와 무관한 무한 전량 질의가 걸리고, 웹은 409 로 매번 offset 0 부터 다시 받는다.

**Fix:** 리스가 살아 있는 키는 LRU 후보에서 빼고, 그래도 상한을 넘으면 새 키를 받지 않는다. 키 하나가 상한을 넘으면 지우지 말고 「너무 큼」 상태로 폴링을 멈춘다.
```ts
// cache.enforceLimit(protect: (e) => boolean) — 보호 키는 건너뛰고, 후보가 없으면 멈춘다
// poller.applyOk — append 전에 entry.size + bytes.length > limitBytes 면 run.tooLarge = true · state "blocked"(새 상태 "too_large")
```

### WR-34: tickgw 배포 시각 가드가 20:00~21:00 승격 창을 보호하지 않고, 실패 시 되돌릴 컨테이너도 없다

**File:** `scripts/deploy-tickgw.sh:52-55,109-111,200-205,237-262`

**Issue:** `daytime_blocked` 는 평일 08:00 ≤ t < 20:00 만 막는다. 그런데 tickgw 의 당일 캐시는 메모리뿐이고, 20:01 마감 마무리 → 20:10 · 20:40 승격 Job 이 그 메모리를 읽는다(`TICKGW_KEEP_UNTIL` 21:00 도 같은 전제다). 20:00~20:45 사이에 배포하면 컨테이너 교체로 그날 승격 입력이 전부 사라진다. 게다가 새 컨테이너를 검증하기 **전에** 옛 컨테이너를 `kill → rm` 한다. 그래서 `/healthz` 나 자기 시험이 실패하면 `docker stop` 으로 끝나고, tickgw 가 하나도 없는 상태(server 는 502)로 남는다.

**Fix:** 가드 끝을 21:00 이후로 미룬다(예: `hhmm >= 800 && hhmm < 2100`). 메시지에 「승격 Job 20:40 · KEEP_UNTIL 21:00」 근거를 적는다. 교체는 새 이미지를 다른 이름으로 `docker create` 해서 검증한 다음 바꾸거나, 실패하면 이전 이미지 태그로 다시 `docker run` 하는 되돌림 단계를 넣는다.

### WR-35: 선택 env `TICKGW_URL` 을 빠뜨린 재배포가 운영 중인 당일 경로를 조용히 끄거나 승격 Job 을 옛 이미지에 묶어 둔다

**File:** `scripts/deploy-server.sh:81-88,221-226,250,275-276,299-302` · `scripts/deploy-tick-convert.sh:229-291`

**Issue:** 당일 경로는 이미 켜져 있다(37-17). 그런데 두 스크립트 모두 `TICKGW_URL` 을 선택값으로 둔다.
- `deploy-server.sh` 는 `--set-env-vars` 전량 치환이다. 다른 이유(예: 챗봇 수정)로 `TICKGW_URL` 없이 재배포하면 env 에서 `TICKGW_URL` 이 빠지고, server 는 `/api/ticks/live` 503 · `today.live=false` 로 당일 경로를 끈다. 배포는 「ℹ 꺼짐」 한 줄만 찍고 성공으로 끝난다. 같은 스크립트가 `RELAY_INTERNAL_URL` 은 필수로 막는 것과 대조된다.
- `deploy-tick-convert.sh` 는 `TICKGW_URL` 이 없으면 Section 7b 를 통째로 건너뛴다. 그러면 nightly Job 은 새 이미지가 되고 promote Job 은 옛 SHA 이미지에 남는다. 격자 행 모양(quick 261103-j4d 팀 값 · 261103-pei 같은 후속 변경)이 바뀌어도 승격본만 옛 코드로 써진다.

**Fix:** 라이브 상태를 읽어 기본값으로 쓰고, 끄는 것은 명시 플래그로만 허용한다.
```bash
LIVE_TICKGW=$(gcloud run services describe "$SERVICE" --region="$REGION" \
  --format='value(spec.template.spec.containers[0].env.filter(name=TICKGW_URL).value)' 2>/dev/null || true)
if [[ -z "${TICKGW_URL:-}" && -n "$LIVE_TICKGW" && "${TICKGW_DISABLE:-0}" != 1 ]]; then
  echo "ERROR: 라이브에 TICKGW_URL 이 있다 — 같은 값을 넘기거나 TICKGW_DISABLE=1 로 끈다" >&2; exit 1
fi
```
deploy-tick-convert.sh 도 같은 방법으로, promote Job 이 이미 있으면 `TICKGW_URL` 을 요구하거나 Job 의 현재 env 에서 읽어 함께 갱신한다.

### WR-36: nightly 에서 키 하나만 실패해도(또는 원본 하나가 깨져도) 그 날짜 전량(≈9GB Archive)을 하루 두 번 · 최대 10일 다시 읽는다

**File:** `workers/tick-convert/src/modes/nightly.ts:92-112,293-297,377-389`

**Issue:** `nightlyDatesOf` 는 KRX · NXT 둘 다 `ok=true` 인 날짜만 「끝」 으로 본다. 그런데 `ok` 는 `er.failed === 0` 이라서, 종목 하나의 업로드 실패(Storage 일시 오류 · 특정 키의 영구 거부)나 깨진 시간 객체 하나(`scanOne` throw → 날짜 전체 fatal)가 있으면 그 날짜는 영영 ok 가 되지 않는다. 그러면 23:30 · 01:30 실행마다 그 날짜를 다시 고르고, 두 라벨 원본 전부(하루 4.5GB × 2 · ARCHIVE 클래스 꺼내기 요금)를 다시 통독하고, 이미 성공한 격자 수백 개를 다시 올린다. 이 일이 catch-up 창 10일 동안 최대 20회 되풀이된다. 시간 예산 40분도 이 날짜에 먼저 쓰여 새 날짜가 밀린다. CLAUDE.md 「무료 우선 · 비용 최소화」 와도 어긋난다.

**Fix:** 날짜 단위 ok 와 키 단위 실패를 나눈다. 키 일부 실패는 실행 기록 `ok=true, error="failed n: <isin…>"` 로 닫고 실패 키만 별도 표(또는 요청 큐 `tick_convert_requests` 의 pending)로 넘긴다. 날짜 단위 fatal 은 `tick_convert_runs` 의 같은 날짜 실패 횟수를 세어 N회(예: 2회)를 넘으면 재선택하지 않고 알림만 남긴다.

### WR-60: 재생 중 URL 스로틀 쓰기가 진행 중인 `router.push` 를 버린다 — 「목록으로」·날짜·거래소·종목 이동이 사라짐

**File:** `webapp/src/lib/ticks/use-tick-cursor.ts:249-269` (+ `webapp/src/components/ticks/tick-viewer-page.tsx:377-384`)

**Issue:**
- `rec` 가 바뀔 때마다 `window.history.replaceState(null, '', tickUrlOf(...))` 를 부른다. 250ms 스로틀을 거치고, 마지막 쓰기에서 250ms 가 지났으면 바로 부른다.
- Next 15.5.15 는 `history.replaceState` 를 패치해 두었다(`app-router.js:293-331`). 패치된 함수는 `ACTION_RESTORE` 를 dispatch 한다.
- 액션 큐는 이미 대기 중인 액션이 있을 때 들어온 RESTORE 를 「Navigations … take priority — Mark the pending action as discarded」로 처리한다(`app-router-instance.js:131-134`).
- 그래서 페이지의 `go()` → `router.push(...)` 가 RSC 응답을 기다리는 동안 커서 쓰기가 한 번이라도 일어나면, 그 push 는 discarded 되고 URL 은 옛 종목·옛 `t` 로 되돌아간다.
- 재생 중에는 이 상황이 확실하게 생긴다. 최대 속도는 매 프레임, 1×/10× 는 수신 간격마다 `rec` 가 바뀌어 250ms 마다 쓰기가 일어난다. ← → 를 누르고 있다가 바로 「‹ 목록으로」를 눌러도 같다.
- 사용자에게는 클릭이 먹지 않은 것처럼 보인다. 재생도 계속된다.
- 타이머는 뷰어가 언마운트될 때만 지워진다(`:270-275`). 그런데 언마운트는 push 가 커밋된 뒤에 일어나므로 이 창(push 시작 ~ 커밋)을 막지 못한다.

**Fix:** 이동을 시작하는 순간 커서의 URL 쓰기를 멈춘다. 예를 들어 페이지가 내비게이션 토큰 ref 를 내려 주고, `write()` 가 그 토큰을 확인한다.
```ts
// tick-viewer-page.tsx
const navRef = useRef(0);
const go = (next: …) => {
  navRef.current += 1;           // 이후 커서 쓰기 금지
  router.push(tickUrlOf({ … }));
};
// <TickViewer navToken={navRef} … /> → useTickCursor(session, { …, navToken })
// use-tick-cursor.ts write()
const token0 = useRef(navToken.current);
const write = () => {
  timer.current = null;
  if (navToken.current !== token0.current) return; // 떠나는 중 — replaceState 하지 않는다
  …
};
```
또는 `go()` 에서 재생을 멈추고 대기 타이머를 지우는 `cursor.suspendUrl()` 을 먼저 부른다. e2e 에 「재생 중 ‹ 목록으로 → URL 에 isin 없음 · 목록 화면」 단언을 더한다.

### WR-61: 대기 중인 URL 쓰기 타이머가 옛 세션을 붙잡는다 — 당일 증분 직후 BigInt TypeError 또는 틀린 `t`

**File:** `webapp/src/lib/ticks/use-tick-cursor.ts:252-268`

**Issue:**
- `write` 는 그것을 예약한 effect 실행의 `session`·`live` 를 클로저로 잡는다.
- `timer.current !== null` 이면 새로 예약하지 않으므로(`:268`) 그 뒤 `rec`·`session` 이 바뀌어도 옛 `write` 가 그대로 실행된다.
- 당일에 커서가 끝 틱이고 250ms 안에 증분 세션이 오면(`useTickCursor` ⑤ 가 새 끝으로 따라감), `recRef.current` 는 옛 세션 길이 이상인 새 끝 rec 가 된다. 이때 다음이 일어난다.
  1. `live && r === endRecOf(옛 session)` 이 false → `t` 를 지우는 분기를 타지 않는다.
  2. `fmtTickTime(옛session.index.recvNs[r]!)` 에서 `BigInt64Array` 범위 밖 읽기가 `undefined` 를 준다 → `undefined + KST_OFFSET_NS` 에서 `TypeError: Cannot mix BigInt and other types` 가 타이머 안에서 잡히지 않고 터진다. URL 은 지난 `t` 그대로 남는다.
- 같은 이유로, 끝 틱인데도 `t` 가 지워지지 않거나 반대로 붙는 일이 생길 수 있다.

**Fix:** `write` 가 세션·live 를 ref 로 읽게 하고, 값이 바뀌면 다시 예약한다.
```ts
const sessionRef = useRef(session); const liveRef = useRef(live);
useEffect(() => { sessionRef.current = session; liveRef.current = live; });
const write = () => {
  timer.current = null;
  const s = sessionRef.current; const r = recRef.current;
  if (r < 0 || r >= s.index.n) return;
  if (liveRef.current && r === endRecOf(s, modeRef.current)) { … }
  window.history.replaceState(null, '', tickUrlOf({ ...urlRef.current, t: fmtTickTime(s.index.recvNs[r]!) }));
};
```
`use-tick-cursor.test.tsx` 에 「쓰기 직후 200ms 안에 증분 세션(끝 따라감) → 예외 0 · URL 에 `t` 없음」 케이스를 더한다.

### WR-62: 당일 zstd 해제·세션 재생성 예외를 잡지 않는다 — 하루치는 영원히 「받는 중」, 증분은 조각을 조용히 건너뜀

**File:** `webapp/src/lib/ticks/use-tick-live.ts:185-215`, `:234-249` (+ `webapp/src/lib/ticks/tick-session.ts:352`)

**Issue:**
- `tick()` 은 fetch 만 `try` 로 감싼다. `handle(r)`(`:248`)은 바깥에 있다.
- `handle` 안의 `appendTickBytes` → fzstd `decompress` 는 잘린·깨진 프레임에서 throw 한다. `buildTickSession` 도 throw 할 수 있다(`boards.length >= NO_BOARD` RangeError 등).
- 그러면 `void tick()` 이 unhandled rejection 이 된다.
- **하루치 받기(filling):** `c.session` 은 null 이고 `c.pending` 은 비워지지 않는다. publish·schedule 도 일어나지 않는다. 그래서 카드가 「당일 · 하루치 받는 중」에 영원히 머문다. 다음 요청도 오류 표시도 없다(`errors` 0).
- **증분:** `c.offset = m.offsetEnd`(`:193`)·`c.errors = 0`·`c.fetchedAt` 이 append 보다 **먼저** 바뀐다. 그래서 다음 「최신 받기」는 offsetEnd 다음 바이트부터 받는다. 실패한 조각의 틱은 세션에서 영구히 빠지고(주문 묶기·팀 손익이 구멍 위에서 계산된다), 머리는 「최신 받기」 성공처럼 보인다.
- 리플레이 도구에서 데이터가 조용히 빠지는 경로다.

**Fix:** `appendTickBytes` 를 try 로 감싼다. 성공한 뒤에만 offset·meta 를 커밋하고, 실패하면 오류로 센다.
```ts
const handle = (r: TickLiveResult) => {
  if (r.status === 200 && r.meta !== null) {
    const m = r.meta;
    try {
      if (filling()) { … c.session = appendTickBytes(null, concatBytes([...c.pending, r.bytes]), key); … }
      else if (r.bytes.length > 0) c.session = appendTickBytes(c.session, r.bytes, key);
    } catch (e) {
      console.warn('[ticks/live] decode failed', e);
      c.errors += 1; c.pending = []; c.offset = 0; c.epoch = null; // 하루치부터 다시(또는 halt('unavailable'))
      publish(); return schedule(pollMs);
    }
    c.offset = m.offsetEnd; c.epoch = m.epoch; c.meta = m; c.errors = 0; c.fetchedAt = Date.now();
    …
  }
};
```
`tick()` 의 `handle(r)` 도 try/catch 로 감싸 마지막 방어선을 둔다. `use-tick-live.test.tsx` 에 「깨진 본문 → 상태가 error/재시도로 바뀐다 · offset 그대로」 케이스를 더한다.

### WR-63: `X-Tick-Complete=false`(알려진 끊김)를 화면 어디에도 보이지 않는다

**File:** `webapp/src/lib/ticks/tick-api.ts:110` · `webapp/src/lib/ticks/use-tick-live.ts` · `webapp/src/components/ticks/tick-header.tsx` · `webapp/src/components/ticks/tick-viewer-page.tsx:413-425`

**Issue:**
- 계약상 `complete` 는 「08:00 부터 끊김 없이 이어졌는가」다(`packages/shared/src/tick-api.ts:179-180`). tickgw 는 `has_more` 커서가 없을 때 `entry.complete = false` 로 끊김을 기록하고 증분으로 넘어간다(`tickgw/src/poller.ts:318-321`). 그 키는 승격도 하지 않는다.
- 웹은 `meta.complete` 를 파싱만 한다. `use-tick-live.ts`·`tick-viewer-page.tsx`·`tick-header.tsx` 어디서도 읽지 않는다(grep 로 확인).
- 그래서 하루치 중간이 빠진 당일 세션이 이어진 자료처럼 보인다. 버스트 묶기(seq+1), 열린 주문, 팀 손익 같은 계산이 구멍을 넘어 이어지는데 사용자에게 경고가 없다.
- 머리의 지연 배지는 `delayed`/`blocked` 상태만 본다.

**Fix:** `live.meta?.complete === false` 이면 머리에 「당일 자료 일부 빠짐 · 손익 · 주문 판정이 불완전」 배지(`role="status"`)를 띄운다. 가능하면 팀 패널 캡션에도 같은 말을 붙인다.
```tsx
// tick-viewer-page.tsx live 머리 prop
incomplete: live.session !== null && live.meta?.complete === false,
// tick-header.tsx
{live?.incomplete && <span data-slot="tick-live-gap" role="status" className="…">당일 자료 일부 빠짐</span>}
```

### WR-64: `tickLiveMetaOf` 가 `X-Tick-Offset-End` 없음을 0 으로 받는다 — 다음 증분이 하루치 전체를 다시 이어붙인다

**File:** `webapp/src/lib/ticks/tick-api.ts:96-100`

**Issue:**
- 주석은 「epoch · offsetEnd 가 없거나 깨졌으면 null(호출자는 502 처럼 다룬다)」이다.
- 그런데 `Number(h.get(...) ?? '')` 는 헤더가 없을 때(`null` → `''`) 그리고 공백일 때 **0** 이다. `Number.isSafeInteger(0) && 0 >= 0` 을 통과하므로 null 이 아니라 `offsetEnd: 0` 인 meta 가 된다.
- 그 결과는 다음과 같다.
  1. 증분 응답이면 `c.offset = 0` 이 된다.
  2. 다음 「최신 받기」는 offset 0 부터 같은 epoch 의 바이트 전부를 받는다.
  3. `appendTickBytes(c.session, …)` 가 그 바이트를 기존 버퍼 **뒤에 다시** 붙여 모든 레코드가 두 벌이 된다. 중복 칩이 전면에 붙는다. 누적 거래대금(turnover)은 duplicates 를 빼지만, 주문 묶기·팀 체결(`teamTradesOf`)은 중복을 빼지 않아 팀 순매수·손익이 두 배가 된다.
- 지금은 server 가 `offsetEnd === undefined` 를 502 로 바꾸고(`server/src/routes/ticks.ts:133`) CORS 가 헤더를 노출하므로 운영 경로에서는 잠재 결함이다. 다만 방어선이 주석대로 동작하지 않는다.

**Fix:**
```ts
const rawEnd = (h.get(TICK_LIVE_HEADERS.offsetEnd) ?? '').trim();
if (epoch === '' || !/^\d+$/.test(rawEnd)) return null;
const end = Number(rawEnd);
if (!Number.isSafeInteger(end)) return null;
```
「offsetEnd 헤더 없음 → null(→ 502)」 단위 테스트를 더한다.

### WR-65: URL `t` 가 ms 로 잘려 딥링크·새로고침이 같은 틱으로 돌아오지 않는다 — 버스트 조각 안에서 특히

**File:** `webapp/src/lib/ticks/use-tick-cursor.ts:263` · `:112-116` · `webapp/src/components/ticks/tick-slider.tsx:115-121`

**Issue:**
- 커서는 `fmtTickTime(recvNs[rec])` 를 쓴다. 이 함수는 ms 아래를 버린다(`packages/shared/src/ticks/tick-time.ts:60-69`).
- 다시 열 때는 `recAtNs` = recv ≥ 그 ms 인 **첫** 틱이다.
- 한 주문의 A3 조각들은 대개 같은 ms 안에 µs 간격으로 들어온다(꼬리 지속 「µs」 표기가 그 근거). 그래서 70조각 주문의 40번째 조각에서 링크를 복사하거나 새로고침하면, 같은 ms 의 첫 레코드(첫 조각이나 그 앞 B6)로 열린다.
- 거래소순 모드에서는 그 첫 레코드가 거래소순으로 몇 행 위일 수도 있다.
- 성공 기준 4 「URL 딥링크(틱 시각까지)」와 D-18 「복사해 넘기면 같은 틱 · 새로고침 제자리」를 버스트 안에서 만족하지 못한다.
- 같은 원인으로 슬라이더 시각 입력에 포커스만 주고 Enter·「점프」를 누르면(초안 = 현재 시각) 커서가 현재 틱에서 그 ms 첫 틱으로 움직인다.

**Fix:** `t` 형식(D-18)은 두고, 같은 ms 안의 순번을 덧붙인다. 예: `t=13:05:07.123&k=3` = recv 가 그 ms 인 틱 중 수신순 3번째(0부터).
```ts
// 쓰기
const msNs = (recvNs[r] / 1_000_000n) * 1_000_000n;
const k = recvPos[r] - lowerBoundRecv(index.recvNs, recvOrder, msNs);
tickUrlOf({ …, t, k: k > 0 ? k : null });
// 읽기(initialRecOf)
const p = lowerBoundRecv(...) + (k ?? 0);   // 같은 ms 안일 때만
```
그 밖에 슬라이더 `jump()` 는 초안이 현재 `time` 과 같으면 아무것도 하지 않게 한다.

## Info

### IN-01: `hits15(pct, px, chg)` 와 `DayRateTracker.add(pct, chg, px)` 의 숫자 인자 순서가 반대

**File:** `packages/shared/src/ticks/route.ts:67, 93`
**Issue:** 같은 모듈의 두 공개 함수가 같은 두 숫자를 서로 반대 순서로 받는다. 지금 호출처(`workers/tick-convert/src/modes/nightly.ts:229` · `promote.ts:139`)는 맞게 부르지만, 둘 다 `number` 라 바꿔 넣어도 타입 오류가 나지 않는다. 그러면 기준가 최빈값과 15% 대상 선별이 조용히 틀어진다(D-02 대상 집합).
**Fix:** `add(pct, px, chg)` 로 순서를 맞추거나, `add({ pct, px, chg })` 객체 인자로 바꾼다.

### IN-02: 레코드 인덱스 · 거래소순 · 뒤집힘 · 호가 재구성이 「한 파일 = 한 ISIN」을 전제하는데, 이 전제를 검사하거나 적어 두지 않음

**File:** `packages/shared/src/ticks/record-index.ts:76-113, 150-178, 358-414`; `packages/shared/src/ticks/book.ts:20-34`
**Issue:** 보드 키가 `board_id` 2바이트뿐이다(100행). `exchangeOrderOf` · `inversionsOf`(키 `b*1e8+s`) · `lastB6Of` 는 seq 공간이 보드마다 하나라고 가정한다. 그런데 msg_seq 는 (종목, 보드)마다 따로다(머리 주석 10행). 여러 ISIN 이 섞인 버퍼를 넣으면 다른 종목의 seq 끼리 섞어 정렬하고, 런을 종목 경계를 넘어 잇고, 닫는 B6 를 다른 종목에서 찾는다. 운영 격자는 종목 단위라 지금은 맞다. 다만 발사 대기열 골든 픽스처(`launch1030-*-0900`)는 8종목짜리라서 테스트가 `cutOf` 로 먼저 쪼갠다. 다음 소비자가 같은 함정에 빠질 수 있다.
**Fix:** `buildTickIndex` 의 JSDoc 에 「단일 ISIN 버퍼 전제」를 적는다. A3 · B6 · R8 의 ISIN(오프셋 17/15)이 첫 레코드와 다르면 `RangeError` 로 막는다(또는 보드 키에 ISIN 을 넣는다).

### IN-03: `PcapNsReader` 의 `nonUdp` · `badFrame` 분기가 테스트로 잠기지 않음

**File:** `packages/shared/src/ticks/framing.ts:217-238`; `packages/shared/src/__tests__/ticks-framing.test.ts:176`
**Issue:** 분기 조건을 `pcap2parquet.py:289-307` 과 직접 대조했고 같다. 다만 테스트는 `nonIpv4` 1건만 만들고 `nonUdp` · `badFrame` 는 0 으로만 단언한다. 이 리더는 변환 Job 통독 경로(`workers/tick-convert/src/scan.ts:47`)의 정본이다.
**Fix:** 합성 프레임 3종(IPv4 + TCP → nonUdp · incl 20 → badFrame · ulen 이 프레임을 넘음 → badFrame)을 추가한다.

### IN-04: `a3ColumnsOf` 가 필드 오프셋은 레이아웃에서 찾지만 길이는 숫자로 박아 둠

**File:** `packages/shared/src/ticks/record-index.ts:282, 286-287, 290`
**Issue:** `A3_OFF` 는 `fieldOff(A3_LAYOUT, …)` 로 찾는다. 그런데 `parseUint(…, 10)` · `parseValue22(…, 22)` · `parseUint(…, 12)` · `parseStr(…, 12)` 의 길이는 상수다. 레이아웃 길이가 바뀌면 오프셋만 따라가고 길이는 안 따라간다. 지금은 `ticks-record-index.test.ts:192-204` 의 decodeFields 무차별 대조가 잡아 준다. 다만 새 열을 더할 때(Phase 38 의 `cumVolume` 처럼) 테스트 단언을 같이 더하지 않으면 길이 실수가 조용히 들어올 수 있다.
**Fix:** `fieldOff` 를 `{ offset, length }` 를 돌려주는 `fieldOf` 로 바꿔 길이도 레이아웃에서 읽는다.

### IN-05: `num()` · `str()` 변환 도우미가 다섯 모듈에 복사돼 있고, `decodeAny` 가 `layoutOf` 를 다시 구현함

**File:** `packages/shared/src/ticks/orders-krx.ts:41-49`, `orders-nxt.ts:37-45`, `book.ts:57-61`, `density.ts:43-47`, `members.ts:50-54`; `decode.ts:216-219` vs `layouts.ts:285-289`
**Issue:** 같은 `FieldValue → number` 규칙(bigint → Number · 그 밖 NaN)이 다섯 벌 있다. 레이아웃 조회도 두 벌이다. 규칙을 바꾸면(예: bigint 정밀도 경고) 한 곳만 고치고 갈라질 수 있다.
**Fix:** `decode.ts` 에 `numOf` · `strOf` 를 두고 export 해서 다섯 모듈이 import 한다. `decodeAny` 는 `layoutOf(payload)` 를 부른다.

### IN-06: `tick_grid_upsert` 는 한 배치 안에 같은 (date, exchange, isin) 가 두 번 오면 배치 전체가 실패함

**File:** `supabase/migrations/20261102200000_tick_viewer.sql:214-241` (현재 정의 `20261103230000_tick_grid_team_day.sql:50-104` 도 같음)
**Issue:** `INSERT … SELECT FROM jsonb_to_recordset … ON CONFLICT DO UPDATE` 는 입력에 같은 충돌 키가 두 번 있으면 `ON CONFLICT DO UPDATE command cannot affect row a second time` 으로 문장 전체를 롤백한다. 지금 Job 은 키마다 한 행을 만들어서 터지지 않는다. 다만 그날 격자 메타를 한 번에 잃는 실패 방식이고, 함수 쪽에는 방어가 없다.
**Fix:** `SELECT DISTINCT ON (r.date, r.exchange, r.isin) … ORDER BY r.date, r.exchange, r.isin` 로 입력을 한 키 한 행으로 줄이거나, 중복이면 명시적으로 `RAISE` 해 원인을 드러낸다.

### IN-07: 오라클 `scoped_frames` 가 빈 범위에 `None` 을 넣는데, `cmd_pnl` · `cmd_g4cut` 은 바로 튜플로 풂

**File:** `scripts/tick-oracle/oracle.py:552-554, 591, 635`
**Issue:** 범위 A3 가 0행이면 `res[scope] = None` 이다. 그런데 591행 `P, last_px = res[scope]` 와 635행이 `TypeError: cannot unpack non-iterable NoneType` 트레이스백으로 죽는다. 다른 실패 경로는 전부 `[oracle] …` 메시지와 함께 종료 1 이다. ISIN 을 잘못 넣거나 시간 창이 비면 원인을 바로 알기 어렵다.
**Fix:**
```python
if res[scope] is None:
    print(f"[oracle] {scope}: 범위 A3 0행 — ISIN · 시간을 확인", file=sys.stderr)
    return 1
P, last_px = res[scope]
```

### IN-08: 생성기 머리의 「.ticks.zst 하나라도 1.5MB 초과면 종료 1」이 decode · launch 에만 적용됨

**File:** `scripts/tick-oracle/gen-fixtures.sh:37, 85-103`
**Issue:** 머리 주석은 크기 규칙을 전역 규칙처럼 적었다. 그런데 `g4cut`(`bigtech-1022-g4.ticks.zst`)과 `pnl`(천일 · 빅텍)은 크기를 재지 않거나(g4cut · 천일) 재고도 종료 0 이다(빅텍). 지금 픽스처는 전부 상한 아래지만, 원본을 다시 받아 돌리면 큰 파일이 조용히 커밋될 수 있다.
**Fix:** `check_size()` 함수를 하나 두고 `.ticks.zst` 를 만드는 모든 부명령 끝에서 부른다. 빅텍만 예외라면 주석에 예외를 명시한다.

### IN-30: `runIndexer` 의 상한 초과 경로가 0 으로 채운 버퍼를 만들고, 종료코드 삼항식은 죽은 코드다

**File:** `tickgw/src/indexer.ts:166-169,192-199,223`

**Issue:** stdout 상한을 넘으면 마지막 청크는 `chunks` 에 넣지 않으면서 `size` 에는 더한다. 그래서 `Buffer.concat(chunks, size)` 가 0 으로 채운 꼬리를 가진 버퍼를 할당한다(code −1 이라 버려지지만 32MB+ 를 헛할당한다). `exitCode = code ?? (signal ? -1 : -1)` 은 두 갈래가 같다.

**Fix:** 상한 초과 시 `size -= b.length` 를 하거나 `stdout: forced ? Buffer.alloc(0) : Buffer.concat(chunks)` 로 바꾸고, `exitCode = code ?? -1` 로 줄인다.

### IN-31: 요청 변환 트리거 타임아웃(10초) 뒤 되돌림이 이미 시작된 실행과 중복 실행을 낳을 수 있다

**File:** `server/src/services/tick-convert-trigger.ts:95-131` · `server/src/services/ticks.ts:256-259`

**Issue:** Admin API 가 실행을 만든 뒤 응답이 10초를 넘기면 `TIMEOUT` 이 되고, `tick_request_trigger_failed` 가 `triggered_at` 을 NULL 로 되돌린다. 다음 요청이 Job 을 또 깨우게 된다. claim 이 원자적이라 데이터는 안전하지만, 빈 실행과 하루 상한 카운트가 늘어난다.

**Fix:** 타임아웃(`status 0 · TIMEOUT`)일 때는 되돌리지 않고 stale 2분 규칙에 맡기거나, 실행 목록을 조회해 확인한다.

### IN-32: 통독 중 잘린 꼬리 파일 수(`truncatedFiles`)가 어디에도 보고되지 않는다

**File:** `workers/tick-convert/src/scan.ts:64` · `workers/tick-convert/src/modes/nightly.ts:231` · `workers/tick-convert/src/modes/request.ts:165-166`

**Issue:** `ScanStats.truncatedFiles` 를 세지만 nightly · request 요약 로그와 실행 기록 어디에도 싣지 않는다. 기록기 비정상 종료로 시간 파일 끝이 잘려도 흔적이 남지 않는다(무로그 손실 금지 원칙).

**Fix:** 요약 줄에 `truncated=${stats.truncatedFiles}` 를 더하고, 0 이 아니면 실행 기록 error 에 note 를 남긴다.

### IN-33: 배포 스크립트가 HEAD SHA 로 태그하지만 작업 트리를 빌드하고, IAP 실패를 「tickpull 미설치」 로 잘못 알린다

**File:** `scripts/deploy-tickgw.sh:116-119,132` · `scripts/deploy-tick-convert.sh:90`

**Issue:** 더러운 작업 트리를 빌드해도 이미지 태그와 `APP_VERSION` 은 HEAD SHA 라서, 운영 이미지와 커밋이 어긋날 수 있다. 또 deploy-tickgw ③ 은 `gcloud compute ssh … 2>/dev/null || true` 라서 IAP · 샌드박스 차단으로 실패해도 「tickpull 미설치 — install.sh 먼저」 로 안내한다.

**Fix:** `git diff --quiet HEAD || { echo "작업 트리가 더럽다"; exit 2; }` 가드(또는 `-dirty` 접미)를 넣는다. ssh 종료코드를 따로 보고 255 면 「IAP SSH 실패」 로 구분한다.

### IN-34: `openTick` 이 RPC 응답 필드 일부를 모양 검사 없이 단언 캐스트한다

**File:** `server/src/services/ticks.ts:139-160`

**Issue:** 머리 주석은 「모양 위반 → 500 DB_ERROR」 라고 하지만, `grid.bytes/records/a3_count/mode/fmt/created_at` · `eta_s` · `date/exchange/isin` 은 `as` 캐스트로 통과한다. RPC 가 바뀌면 웹이 `undefined` 를 받아 조용히 오작동한다.

**Fix:** 최소한 `eta_s`(number) · `grid.bytes/records`(number) · `grid.mode`(열거) 를 검사하고, 어긋나면 `DbError(FAIL, shapeCause(...))` 를 던진다.

### IN-60: 「오늘」이 마운트 때 한 번만 정해져서 20:00·자정을 넘기면 목록과 열기가 엇갈린다

**File:** `webapp/src/components/ticks/tick-viewer-page.tsx:154-155`, `:456-468`

**Issue:**
- `boot = useState(() => defaultTickDateOf(new Date()))` 는 페이지 수명 내내 고정이다.
- 자정을 넘겨 열어 두면 다음처럼 엇갈린다.
  - `today` 는 어제 날짜로 남아 「오늘 종목」 목록을 계속 그린다. 그런데 `fetchTickToday()` 는 새 날의 목록을 준다(응답의 `date` 는 무시한다).
  - 행을 누르면 `go({ isin, ex })` 가 `d: shown`(어제)으로 연다. 오늘 목록의 종목을 어제 날짜로 여는 셈이다.
- 20:00 을 넘기면 진입은 계속 「라이브」 칩을 보인다. 그런데 열면 `nodataReasonOf` 가 「업로드 전」을 낸다.

**Fix:** `today` 를 분 단위로 다시 계산한다(visibilitychange·1분 타이머). 아니면 오늘 목록은 `todayList.resp.date` 를 열기 날짜로 쓴다.

### IN-61: 공급 배지가 자료 출처가 아니라 날짜로 정해진다

**File:** `webapp/src/components/ticks/tick-viewer-page.tsx:410`

**Issue:** `supply={isToday ? 'live' : 'grid'}` 이다. 그래서 오늘 날짜라도 격자(요청 변환·승격본)로 연 경우 머리에 「당일 · 119 요청형」이 붙는다.

**Fix:** `view.kind === 'live' ? 'live' : view.kind === 'loaded' ? 'grid' : (isToday ? 'live' : 'grid')` 처럼 열린 경로로 정한다.

### IN-62: 격자 서명 URL fetch 에 시간 상한·취소가 없다

**File:** `webapp/src/lib/ticks/use-tick-grid.ts:100`, `:83-90`

**Issue:**
- `fetch(grid.url)` 와 `reader.read()` 루프에 timeout·AbortSignal 이 없다. 스토리지 응답이 멈추면 「격자 받는 중 · n%」에서 끝나지 않는다. 「다시 시도」 버튼은 error 상태에만 있어서 벗어날 길은 다른 곳으로 이동하는 것뿐이다.
- 다른 종목으로 옮겨도 이전 다운로드는 취소되지 않고 끝까지 받은 뒤 `remember` 로 캐시를 밀어낸다.
- 당일 경로(`fetchTickLive`)는 `AbortSignal.timeout(30s)` 를 쓴다.

**Fix:** 진행이 N초(예: 30초) 멈추면 abort 하는 stall 타이머를 둔다 → `TickGridLoadError('격자 시간 초과')` → error 카드·재시도.

### IN-63: 증분·own 재조회마다 전문 목록이 커서 행으로 강제 가운데 스크롤된다

**File:** `webapp/src/components/ticks/tick-msg-list.tsx:613-619` (+ `webapp/src/components/ticks/tick-viewer.tsx:310`)

**Issue:**
- 가운데 정렬은 「모델 identity 가 바뀌면」 일어난다(`changed ? 'center' : 'nearest'`). 원래는 순서 토글 직후에만 의도한 동작이다.
- 그런데 `rows` 는 `[session, cursor.mode, ownModel]` 에 걸린 useMemo 라 다음 경우에도 새로 만들어진다.
  - 당일 「최신 받기」(새 세션)
  - own 재조회(`ownRefreshKey` → 새 `ownModel`)
- 그래서 과거 틱을 보면서 목록을 위아래로 훑던 사용자가 버튼을 누를 때마다 커서 행으로 끌려간다.

**Fix:** `lastModel` 대신 직전 `mode` 를 기억하고, 모드가 바뀔 때만 `'center'` 를 쓴다.

### IN-64: 409(epoch 교체)로 하루치를 다시 받는 동안 「최신 받기」 버튼이 눌리지만 아무 일도 하지 않는다

**File:** `webapp/src/lib/ticks/use-tick-live.ts:165`, `:293-298` · `webapp/src/components/ticks/tick-header.tsx:130-151`

**Issue:**
- `refreshing` 은 `c.running && !filling()` 이라 refetching 중에는 false 다. 그래서 버튼이 활성으로 보인다.
- 그런데 `refresh()` 는 `c.refetching` 이면 false 를 돌려주고 무시한다. 사용자는 눌러도 반응이 없다(아이콘도 돌지 않는다).

**Fix:** view 에 `refetching` 을 싣고, 머리에서 버튼을 「다시 받는 중」 비활성으로 그린다.

---

_Reviewed: 2026-11-04_
_Reviewer: Claude (gsd-code-reviewer × 3 parts)_
_Depth: standard_
