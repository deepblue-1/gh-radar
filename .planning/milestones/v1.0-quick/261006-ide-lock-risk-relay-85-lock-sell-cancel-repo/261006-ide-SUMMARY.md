---
phase: quick-261006-ide
plan: 01
subsystem: relay · shared · webapp(trading 카드 · 상한가 보고서) · supabase · workers/limitup-sync
tags: [limit-feature, 85, lock-risk, limitup-report, schema-version, gh-trade-inbox]
status: complete
requires:
  - gh-trade ea8d9171(f1j) · 8ee9ae7b(gp8) — 85 말미 lock_sell_krw · lock_cancel_krw, locks export 새 키 6개
  - 스케치 012-A 채택(bf038087)
provides:
  - relay 85 lockSellKrw · lockCancelKrw 중계(구 서버 0)
  - 카드 「상한가」 탭 3줄 누적/10초/창구 + 잠김 경과 머리 + 상태 줄 툴팁(WinForms gp8 · f1j 동형)
  - limitup_locks 6열 마이그레이션(20261006120000) + 보고서 잠김 요약 칩
  - limitup-sync schema_version {1, 2} 수용
affects: [relay 배포, supabase db push, limitup-sync 배포, webapp push]
tech-stack:
  added: []
  patterns: [WinForms 동형 순수 함수(shared) · 표시 문자열 뷰 모델(lockRiskRowsOf)]
key-files:
  created:
    - supabase/migrations/20261006120000_limitup_locks_lock_risk.sql
  modified:
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/limit-feature.ts
    - relay/src/dma/envelope.ts
    - relay/tests/helpers/frames.ts
    - packages/shared/src/relay.ts
    - packages/shared/src/limit-feature.ts
    - packages/shared/src/index.ts
    - packages/shared/src/limitup-report.ts
    - webapp/src/components/trading/card/limit-feature-table.tsx
    - webapp/src/lib/limitup-lanes.ts
    - webapp/src/components/analytics/limitup-event-card.tsx
    - workers/limitup-sync/src/manifest.ts
    - workers/limitup-sync/src/index.ts
    - docs/inbox/from-gh-trade/261006-limitup-lock-risk.md
decisions:
  - "카드 「상한가」 표는 누적/10초/창구 3행 — 상태 줄은 title 첫 줄, 잠김 경과는 누적 행 머리(--up 보통 굵기) · 칸 굵기 필드 제거(WinForms 동형)"
  - "잠김 경과 머리는 머리 칸 폭(w-11) 유지 · px-0.5 + 가운데 정렬로 「1:05:20」 수용(값 칸 폭 보존)"
  - "보고서 칩의 위험도 구분 「·」 은 앞 조각 꼬리에 붙여 줄바꿈된 줄이 「·」 로 시작하지 않게 함"
  - "limitup-sync 는 판으로 분기하지 않고 KNOWN_SCHEMA_VERSIONS = {1, 2} 게이트만 넓힘"
metrics:
  duration: "약 1시간"
  completed: 2026-10-06
actuals:
  tokens: 32500
  tasks: 3
  commits: 4
plan_head_before: bf03808780bdfd2023685683978a66ffe41eca1c
plan_head_after: 336e09234103dbdc2f9092b0b6120af22a970449
---

# Quick 261006-ide: 85 잠김 누적 매도·취소 중계 · 카드 3줄 표 · 보고서 잠김 요약 칩 · schema_version 2 수용

gh-trade ea8d9171/8ee9ae7b 인계를 반영했다. relay 는 85 말미 두 필드(원)를 중계하고, 카드 「상한가」 탭은 WinForms 와 같은 누적/10초/창구 3줄이 됐다(잠김 경과는 누적 행 머리, 상태는 툴팁 첫 줄로 감). 보고서 「잠김 구간」 에는 스케치 012-A 요약 칩을 달았고 limitup_locks 에 6열을 더했다. limitup-sync 는 판 1과 2를 모두 받는다.

## 커밋

| Task | 커밋 | 내용 |
|---|---|---|
| T1 | b889555f | relay 생성물 ea8d9171 · parseLimitFeature 2필드 · shared 3줄 표 · 카드 머리 · e2e P28-1/2 |
| T2 | 17a81cae | 마이그레이션 20261006120000 · pgTAP · LimitupLockRow 6필드 · lockRiskRowsOf · 사건 카드 칩 · e2e P28-R1c |
| T3 | fec0a87a | limitup-sync KNOWN_SCHEMA_VERSIONS {1, 2} |
| 인박스 | 336e0923 | 261006-limitup-lock-risk.md status: done · done_commit fec0a87a |

push 하지 않았다(`git status -sb` = ahead 13 — 이 작업 전 이미 ahead 9). Co-Authored-By 없음.

## 검증

| 항목 | 결과 |
|---|---|
| gh-trade `sync-relay-schema.sh --check` → 반영 | 가드 3종 통과 · diff = StockDMA.fbs(마커 ea8d9171 · 2026-10-06 + 85 말미 3줄) + stock-dma/limit-feature.ts(접근자 2 · add 2 · startObject 34 · create 인자)뿐 |
| gh-trade 작업 트리 | 실행 전후 `status --porcelain` 동일 |
| shared build · vitest | 388 통과 |
| relay typecheck · typecheck:tests · test | 1012 통과 |
| webapp typecheck(+e2e tsconfig) · vitest | 3557 통과 · 1 skip |
| limitup-sync typecheck · vitest | 93 통과 |
| pgTAP limitup_load(163) · limitup_report(54) | not ok 0 · RESULT PASS(로컬 일회용 컨테이너 · 원격 접촉 0) |
| e2e trading-workbench P28-1 · P28-2 | 통과(repeat 2 포함) |
| e2e order-log P28-O1 | 통과(코드 변경 없음, 회귀) |
| e2e limitup-report 전체(R1 · R1b · R1c) | 4/4 통과 |
| e2e trading-workbench P28-1b | **실패 — 기준 HEAD 에서도 실패(사전 결함)**. 아래 「미해결」 |

## relay hand-copy 3곳 점검

- `relay/src/dma/msg-type.ts` — 85 `LimitFeature: 85` · INBOUND 집합 그대로. 번호 무변경이라 고칠 것 없음.
- `relay/src/hub/subscription-hub.ts` — `case MSG.LimitFeature` → `parseLimitFeature` → `#onLimitFeature` 가 `RelayLimitFeatureMsg` 객체를 필드와 상관없이 `#limitFeatures.set` · `emit("market")` 한다. 고칠 것 없음(hub.test 에 새 필드 팬아웃 단언만 더함).
- `relay/src/dma/envelope.ts` — `parseLimitFeature` 에 `lockSellKrw` · `lockCancelKrw`(toNum 경계 · 2^53 밖 클램프)를 더했다. 이것이 유일한 변경 지점이다.
- server 는 `limitup_report_for_user` RPC JSON 을 그대로 돌려준다(`server/src/services/limitup-report.ts` `data as unknown as LimitupReportResponse`). 그래서 바꾸지 않았다.

## gh-trade 회신 재료

- **schema_version 2 판 올림 진행 가능** — limitup-sync `KNOWN_SCHEMA_VERSIONS = {1, 2}`(fec0a87a). 워커 배포 뒤 유효하다. 판 3 이상은 지금처럼 skip "schema" 한다.
- **Supabase `limitup_locks` 6열 추가**(sell_krw · cancel_krw bigint · risk_3s/10s/60s · risk_pre double, 20261006120000). 적재 · 보고서 RPC 본문은 바꾸지 않았다.
- **격자 표 열은 추가하지 않음** — 스케치 012-A 는 locks 행만 쓴다. 격자 cols lock_sell_krw · lock_cancel_krw 는 워커가 파일 그대로 Storage 에 올리지만 웹은 읽지 않는다.
- **85 featureSchema · 격자 schema_version 분기 없음** — `grep -rn "featureSchema\|schema_version" relay/src packages/shared/src webapp/src server/src` 에 비교 연산이 0건이다(값을 나르거나 타입으로만 쓴다). workers/limitup-sync 도 판 값은 `p_schema_version` 으로 넘길 뿐이고(load.ts), derive.ts 의 `GridJson.schema_version` 은 타입뿐이다. kLimitFeatureSchema · 사전 판을 올려도 안전하다.
- kind 15 저널 다리(`limitFeatureOfStrategyEvent`)는 두 값을 0 으로 채운다. 슬롯 매핑은 바꾸지 않았다.

## 배포 — 메인 세션 몫 (executor 는 실행하지 않았다)

순서는 「DB → 워커 → relay → (server) → push」 이고, push 가 곧 webapp 프로덕션 배포다.

1. **DB 마이그레이션** — `supabase db push --linked --yes`(허용 규칙 접두사 그대로 · 파이프 · `yes |` 금지). 20261006120000 1개.
   **오늘 밤 limitup-sync 적재(21:20 KST) 전에 반영해야 한다.** gh-trade 가 20:30 배치 전에 119 tickana 를 교체하고 9/29~10/2 를 --force 재export 한다. 마이그레이션 전에 워커가 새 키 실린 날짜를 적재하면 jsonb_populate_record 가 새 키를 버린다. 그 뒤에는 files_sig 가 같아 다시 적재되지 않는다(그때는 해당 날짜 limitup_loads.files_sig 를 비워 재적재를 유도해야 한다).
2. **limitup-sync 워커** — `scripts/deploy-limitup-sync.sh`(GCP_PROJECT_ID · SUPABASE_URL 필요 — 메모리 「워커 배포 스크립트 env」). gh-trade 가 schema_version 2 로 올리기 **전에** 반영한다.
3. **relay** — **20:00 KST 이후에만**(장 08:00~20:00) `scripts/deploy-relay.sh`. 새 필드를 실제로 보려면 gh-trade 서버(85 새 필드)도 20:00 이후 재기동되어야 한다. 그 전에는 새 relay 가 0 을 싣는다(잠김 중 「매도 0」 · 깨짐 「—」 — gh-trade 문서의 구 서버 동작).
4. **server** — 변경 없음(보고서 RPC JSON 을 그대로 통과) → 배포 불필요.
5. **push** — relay 배포가 끝난 뒤에만 한다. 구 relay JSON 에는 lockSellKrw/lockCancelKrw 가 없어 새 webapp 카드가 깨진 숫자를 그린다.
6. **gh-trade 회신** — 워커 배포 뒤 「schema_version 2 판 올림 진행 가능(워커 KNOWN_SCHEMA_VERSIONS {1,2}) · Supabase limitup_locks 6열 추가 · 격자 표 열은 추가 안 함(스케치 012-A 는 locks 만) · 85 featureSchema 분기 없음」 을 알린다.

## 스크린샷 (커밋하지 않음)

`/Users/alex/repos/gh-radar/.planning/quick/261006-ide-lock-risk-relay-85-lock-sell-cancel-repo/shots/`
- `lc-limit-feature-1280.png` — 카드 「상한가」 탭 1280: 머리 「0:43」(빨강) · 「매도 6.0억 · 취소 4.6억 · 위험도 35%」
- `lc-limit-feature-390.png` — 390: 머리 「1:03」 · 누적 3칸 잘림 없음
- `lc-limit-feature-390-1h.png` — 390: 머리 「1:05:20」 잘림 없음(추가 확인용)
- `limitup-lock-risk-1280.png` — 덕우 칩 한 줄 + 캡션
- `limitup-lock-risk-390.png` — 덕우 칩 390(위험도 칩이 시점 조각 사이에서 줄바꿈)
- `limitup-lock-risk-390-axion.png` — 엑시온 「끝 3초 전 192%」

e2e 는 스크린샷을 `test.info().outputPath('ide-…')` 로 남긴다(저장소에 절대경로를 넣지 않음). 위 파일은 그 출력을 복사한 것이다.

## 고친 시각 결함

- 잠김 경과 머리 「0:43」 이 px-0.5 좌측 정렬이라 머리 칸 왼쪽 끝에 붙어 보였다. 가운데 정렬로 바꿔 기본 머리 글자 시작과 거의 같은 자리에 오게 했다(「1:05:20」 도 잘리지 않음).
- 보고서 390 에서 위험도 칩이 줄바꿈되면 둘째 줄이 「· 깨짐 3초 전」 처럼 「·」 로 시작했다. 구분점을 앞 조각 꼬리로 옮겼다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] e2e P28-2 의 390 기준 카드 높이를 즉시 측정해 기준 HEAD 에서도 실패**
- **Found during:** Task 1 e2e
- **Issue:** 탭 이름이 바뀐 직후 잰 높이(787.5)가 곧 730.5 로 정착한다. 「상한가」 탭 클릭 뒤 높이와 달라 `카드 높이(390)` 단언이 실패했다. 내 변경을 모두 되돌린 기준 트리에서도 같은 값으로 실패해, 새 단언(머리 「1:03」 · 「1:05:20」 잘림 없음)까지 도달하지 못했다.
- **Fix:** `before` 를 250ms 간격 두 번 연속 같은 값이 나올 때까지 `expect.poll` 로 기다린 값으로 잡는다. sleep 은 쓰지 않았다.
- **Files modified:** webapp/e2e/specs/trading-workbench.spec.ts
- **Commit:** b889555f

**2. [계획 보정] e2e 스크린샷 경로**
- 계획은 shots/ 에 직접 남기라고 했다. 하지만 spec 에 로컬 절대경로를 넣으면 커밋되는 코드에 머신 경로가 박힌다. 그래서 `test.info().outputPath` 로 남기고 실행 뒤 shots/ 로 복사했다(order-log.spec lq5 와 같은 관례).

**3. [계획 보정] P28-R1c 「잠김 N」 머리**
- 실 export 픽스처는 덕우 lock_id 1 · 엑시온 lock_id 2 로 종목마다 잠김이 1개다. 그래서 e2e 는 「잠김 N」 머리가 **없음**을 단언한다. 2개 이상일 때의 「잠김 1」 · 「잠김 2」 는 단위 테스트(limitup-lanes · limitup-event-card)에서 합성 행으로 잠갔다.

## 미해결 (deferred-items.md)

- **e2e P28-1b 실패는 이 변경 전부터 있던 결함이다.** 기준 HEAD(bf038087)로 되돌린 트리에서도 같은 자리(재펼침 직후 「상한가 · 잠김 43초」 기대 → 「상한가」)에서 실패했다. ef2ec49c(WR-A01 — 강등 때 85 캐시 삭제)와 테스트 전제가 어긋난 것으로 보이지만 실측으로 확인하지는 않았다. relay hub 동작이라 범위 밖으로 두었다. 자세한 내용은 `deferred-items.md` 에 있다.
- 390 에서 1시간 넘는 잠김은 탭 제목 「상한가 · 잠김 65분 20초」 가 탭 알약 안에서 말줄임된다. 탭 접미 문구(formatDuration · D-04)는 이번 범위 밖이고 동작도 그대로다.

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261006120000_limitup_locks_lock_risk.sql
- FOUND: shots/ 6장
- FOUND commits: b889555f · 17a81cae · fec0a87a · 336e0923 (모두 HEAD 조상)
