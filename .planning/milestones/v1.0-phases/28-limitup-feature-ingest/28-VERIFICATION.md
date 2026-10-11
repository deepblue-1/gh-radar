---
phase: 28-limitup-feature-ingest
verified: 2026-10-10T01:29:00Z
round: 2
status: passed
score: 12/12 must-haves verified (truth 13 은 ROADMAP 정정으로 Deferred — UAT 7)
covered_files:
  - .planning/phases/28-limitup-feature-ingest/28-01-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-01-SUMMARY.md
  - .planning/phases/28-limitup-feature-ingest/28-02-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-02-SUMMARY.md
  - .planning/phases/28-limitup-feature-ingest/28-03-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-03-SUMMARY.md
  - .planning/phases/28-limitup-feature-ingest/28-04-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-04-SUMMARY.md
  - .planning/phases/28-limitup-feature-ingest/28-05-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-05-SUMMARY.md
  - .planning/phases/28-limitup-feature-ingest/28-06-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-06-SUMMARY.md
  - .planning/phases/28-limitup-feature-ingest/28-07-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-07-SUMMARY.md
  - .planning/phases/28-limitup-feature-ingest/28-08-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-08-SUMMARY.md
  - .planning/phases/28-limitup-feature-ingest/28-09-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-09-SUMMARY.md
  - .planning/phases/28-limitup-feature-ingest/28-10-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-10-SUMMARY.md
  - .planning/phases/28-limitup-feature-ingest/28-11-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-11-SUMMARY.md
  - .planning/phases/28-limitup-feature-ingest/28-12-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-12-SUMMARY.md
  - .planning/phases/28-limitup-feature-ingest/28-13-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-13-SUMMARY.md
  - .planning/phases/28-limitup-feature-ingest/28-14-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-14-SUMMARY.md
  - .planning/phases/28-limitup-feature-ingest/28-15-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-15-SUMMARY.md
  - .planning/phases/28-limitup-feature-ingest/28-16-PLAN.md
  - .planning/phases/28-limitup-feature-ingest/28-16-SUMMARY.md
  - infra/relay/limitup-pull/limitup-pull.sh
  - ops/alert-limitup-sync-failure.yaml
  - packages/shared/src/limit-feature.ts
  - packages/shared/src/strategy-event-text.ts
  - packages/shared/src/strategy-event.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/msg-type.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/ws/fanout.ts
  - scripts/deploy-limitup-sync.sh
  - server/src/routes/limitup-report.ts
  - server/src/services/limitup-report.ts
  - supabase/migrations/20261006090000_dma_strategy_events_limit_feature.sql
  - supabase/migrations/20261006090100_limitup_tables.sql
  - supabase/migrations/20261006090200_limitup_load_rpcs.sql
  - supabase/migrations/20261006090300_limitup_retention_storage.sql
  - supabase/migrations/20261006090400_limitup_report_rpcs.sql
  - supabase/migrations/20261006090500_limitup_commit_day_timeout.sql
  - supabase/migrations/20261006120000_limitup_locks_lock_risk.sql
  - webapp/src/components/analytics/limitup-day-grid.tsx
  - webapp/src/components/analytics/limitup-report.tsx
  - webapp/src/components/trading/card/card-tabs.tsx
  - webapp/src/lib/use-limitup-grid.ts
  - webapp/src/lib/use-order-log-feed.ts
  - webapp/src/lib/use-relay-socket.ts
  - workers/limitup-sync/src/config.ts
  - workers/limitup-sync/src/freshness.ts
  - workers/limitup-sync/src/grid.ts
  - workers/limitup-sync/src/index.ts
  - workers/limitup-sync/src/purge.ts
covered_digest: "v3:sha256:171bb19b0bf492fbe86dd012c2370dd40c8b0bf15a1f9ee874b8bd55082f11b0"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 11/13
  previous_report: 28-VERIFICATION.md (2026-10-05, 낡음 — 덮어쓰지 않음)
  gaps_closed:
    - "W-1 (CR-B01) 워커 날짜 격리 · purge 도달 — b38987b8 · 6be91f1f 로 닫힘"
    - "W-2 (WR-A01) relay 85 캐시 강등 삭제 — ef2ec49c 로 닫힘"
    - "truth 12 배포 순서 · 인박스 done — 노트 status done · done_commit 6cc4d55c · 타이머 enable (UAT 1·2·5)"
    - "human 6건 — UAT 6/6 pass (3a042a53)"
  gaps_remaining: []
  regressions: []
gaps: []
deferred:
  - truth: "truth 13 — limit_up_events(code,date) 와 short_code+date 조인"
    to: "CONTEXT Deferred (종목상세 링크 · 상한가 다음날 이력)"
    decided: "2026-10-10 UAT 7 사용자 결정 (b) — ROADMAP Phase 28 Goal 문구 정정"
warnings:
  - id: R2-W-2
    severity: low
    item: "WR-R2-01 — 주문로그 틈 메우기 가드가 「가장 오래된 라이브 줄」 키라서 비정상 상태(서버 기록 지연 · REST 0건)에서 상한 5,000 도달 뒤 새 kind 15 마다 ?lf=1 을 다시 부를 수 있다"
    where: "webapp/src/lib/use-order-log-feed.ts:182-193 (코드에서 확인)"
    status: "advisory — 「상한가 특징」 체크 켠 사용자 · 라이브 5,000줄 도달 · 서버 꼬리 정체 세 조건이 겹쳐야 한다. 목표(주문로그 노출) 자체는 달성"
  - id: R2-W-3
    severity: low
    item: "WR-R2-02 — 보존 정리가 throw 하면 dispatch 가 result 를 못 돌려 `limitup-sync stale` 로그가 사라진다"
    where: "workers/limitup-sync/src/index.ts:311-327, 332-357 (코드에서 확인)"
    status: "advisory — 종료 코드는 1 이라 알림 정책은 울린다. 가려지는 것은 원인 로그 한 줄"
human_verification: []
---

> **정본 frontmatter 는 2라운드(28-VERIFICATION-R2.md, 2026-10-10)로 승계됨.** 아래 본문은 1라운드(2026-10-05) 기록 그대로다.

# Phase 28: 상한가 특징 연동 — gh-trade Phase 27 계약 반영 검증 보고서

**Phase Goal:** gh-trade Phase 27 계약(85 `LimitFeature` · kind 15 저널 · 119 밤 export)을 받아 장중에는 상한가 특징을 실시간(카드 탭)으로, 밤에는 그날 상한가 사건 보고서를 웹에서 보게 한다. 배포 DB → radar-gw → relay → webapp, 인박스 노트 done.
**Verified:** 2026-10-05
**Status:** human_needed
**Re-verification:** No — 최초 검증

## 판정 요약

코드 쪽 목표는 달성됐다. 세 갈래(A·B·C)가 모두 실제 코드로 존재하고 연결돼 있으며, 데이터가 끝까지 흐른다. SUMMARY 의 주장은 코드와 교차 확인했고 불일치는 없었다. FAILED 로 뽑을 must-have 는 없다.

완전한 PASS 가 아닌 이유는 세 가지다.
1. 119 키 미등록 때문에 radar-gw 타이머가 꺼져 있다. 인박스 노트도 `open` 이다. ROADMAP Goal 의 「인박스 done」 은 아직 충족되지 않았다.
2. 85 · kind 15 는 장중에만 오므로 운영 관찰이 불가능하다.
3. 코드에 남은 결함 W-1(워커 실패 격리)과 W-2(relay 85 낡은 캐시)가 리뷰 지적 그대로 확인됐다. W-1 은 119 가 재export 를 보내 첫 재적재가 일어나기 전에 고치길 권한다.

## Goal Achievement — Observable Truths

ROADMAP 에는 Success Criteria 가 따로 없다. 그래서 Goal 문단과 16개 플랜 must_haves(CONTEXT D-01~D-23)에서 truth 13개를 뽑았다.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | (A) relay 가 quote 관찰자의 85 를 파싱·키별 캐시하고, 그 키를 FULL 로 잡은 소켓에만 중계한다. 새 FULL·승격 소켓은 q → tape → 85 순서로 스냅샷을 받는다. 명시 `case` 가 있어 키·초마다 warn 이 찍히지 않는다 | ✓ VERIFIED | `msg-type.ts` MSG.LimitFeature=85, INBOUND 28종에 포함, OUT_OF_SCOPE=`68,70,74,75,81,82`. `envelope.ts:893 parseLimitFeature`. hub `#onFeedFrame` case 2013, 사용자 세션 명시 warn case 1694, `#onLimitFeature` 가 `{full:true, price:false}` 방출. fanout `#deliverMarket` 1848 에서 `lv !== "full"` 소켓 제외, 스냅샷 1102·1126·1159. 단위 테스트(relay hub·fanout 196건)를 이번에 직접 실행해 통과 |
| 2 | (A) 웹 작업대 상따 카드 네 번째 탭 「상한가」 에 3줄 9칸 표, 탭 제목 「상한가 · 잠김 N초」. 자동 전환 없음, 카드 높이 불변, 접힌 카드 헤더 불변 | ✓ VERIFIED | `card-tabs.tsx` 탭 `limit`·`LimitFeatureTable`·`limitFeatureTabSuffix`. `strategy-card.tsx:308` 에서 level full 일 때만 `limitFeature` 사용. 스토어 `limitFeatures` 와 `limit-feature.drop` 이 `use-relay-socket.ts` 886·2106 에 연결. `alertTabFor` 는 `"limit"` 을 열지 않음(테스트로 고정). shared `limit-feature.ts` 391줄·테스트 66건을 직접 실행해 통과. 운영 실관찰은 human 항목 |
| 3 | (B) kind 15 가시성: RPC 시세 집합 `(1,2,10,15)` · shared `isMarketStrategyEvent` 가 같은 집합 · jsonb 래퍼(기본 kind 15 제외) · 30일 purge RPC · 부분 인덱스 · REVOKE anon/authenticated 명시 | ✓ VERIFIED | 마이그레이션 `…090000` 55·62행 `(1, 2, 10, 15)`. `strategy-event.ts:56,92`. server `?lf=0|1` zod(`schemas/orders.ts:127`)와 래퍼 `dma_strategy_events_for_user_json`. REVOKE/GRANT 세 함수 모두 명시. 원격 적용·RPC smoke 통과는 main session 의 운영 사실을 SUMMARY 28-14 로 대조 |
| 4 | (B) kind 15 한 줄 문장 조립(슬롯 되돌림·`message` 파서) + 주문로그 「상한가 특징」 체크(기본 숨김·별도 스토어·`?lf=1` 1회 조회·시세 판정은 kind) | ✓ VERIFIED | `strategy-event-text.ts:122 case 15`, `limit-feature.ts` `parseLimitFeatureMessage`. `order-log-filters.tsx` `data-slot="order-log-check-limit-feature"`, `use-order-log-feed.ts` `showLimitFeature`, `order-log-feed.ts:103 isMarketStrategyEvent`. `limitFeatureEvents` 가 `strategyEvents` 5,000 상한과 분리(`use-relay-socket.ts` 985-998). e2e P28-O1 존재 |
| 5 | (C) limitup 표 10개(6 + 파생 2 + stage + loads) · 날짜 단위 원자 commit RPC · RLS 정책 0 · service_role 전용 · 비공개 버킷 `limitup-grid` | ✓ VERIFIED | `…090100`(302줄)·`…090200`(208줄)·`…090300`(91줄). `limitup_purge_old` 가 D-19 대로 member_alloc 만 30일, 나머지 90일. 버킷은 `to_regclass('storage.buckets')` 가드 + `public=false` + `application/gzip`. pgTAP 2파일 존재 |
| 6 | (C) 워커: manifest 있는 날짜만 · sha256 대조 · `schema_version` 검사 · files_sig 로 바뀐 날짜만 재적재 · skip 은 exit 0, 같은 날짜 3연속 skip 이면 exit 1 · 파생 · 격자 업로드 · 90/30일 보존 · kind 15 purge | ✓ VERIFIED (W-1 참고) | `workers/limitup-sync/src/index.ts` skip 루프 · `filesSig` unchanged 판정 · `ALERT_SKIP_STREAK` · `main()` 종료 코드. `derive.ts`·`grid.ts`·`purge.ts` 존재. 격자 업로드를 commit 앞에 둠. 워커 vitest 73건을 직접 실행해 통과. 단 예외(non-skip) 경로의 실패 격리는 W-1 |
| 7 | (C) radar-gw 운반기: rsync(`-az --delete --exclude='*.tmp'`) + `gcloud storage rsync` 2단(데이터 → manifest) · 타이머 `Mon..Fri 21:00 Asia/Seoul` · 서비스 자원 상한 · 키 주석 `radar-gw-pull` · 호스트키 고정 | ✓ VERIFIED (코드·설치) / 가동은 human | `infra/relay/limitup-pull/{limitup-pull.sh,install.sh,.service,.timer}` 확인 — `MemoryMax=300M`, `Nice=19`, `IOSchedulingClass=idle`, `OOMScoreAdjust=500`, 서비스 `[Install]` 없음, `StrictHostKeyChecking=yes`. 설치 완료·`--check` 버킷 OK 는 28-14 SUMMARY. 119 접속은 미등록으로 Permission denied |
| 8 | 워커 운영 한 벌: Cloud Run Job · Scheduler `20 21 * * 1-5` · 알림 정책 · IAM(relay SA 버킷 한정 objectUser) · smoke(행 수 == manifest) | ✓ VERIFIED | `scripts/deploy-limitup-sync.sh`(task-timeout 1800s · max-retries 0 · type=cloud-storage readonly 마운트), `setup-limitup-sync-iam.sh`(`roles/storage.objectUser`), `smoke-limitup-sync.sh`, `ops/alert-limitup-sync-failure.yaml`. 운영: 이미지 d4a044dd · 4일 시드 smoke PASS 12 / FAIL 0 · 합계가 인박스 「확인 방법」 숫자(99/39/40,626/253,247/542/216)와 일치 — 28-14 SUMMARY 대조 |
| 9 | 보고서 API: `GET /api/limitup/report` · `/grid-urls` 가 `requireAuth` + DMA 게이트(403 `DMA_UNMAPPED`) · RPC 1회 · 서명 URL 1회 · 사용자 값 무시 | ✓ VERIFIED | `server/src/app.ts:102` 마운트. `routes/limitup-report.ts` 두 라우트 모두 `requireAuth()`. `services/limitup-report.ts` 에 `limitup_report_for_user` rpc 1회, `createSignedUrls` 1회. server 라우트 테스트 16건을 직접 실행해 통과(에러 경로의 warn 로그는 의도된 500 케이스) |
| 10 | 웹 보고서 `/analytics/limitup`: 6구역(머리 · KPI · 하루 격자 · 사건 카드 · 지문표 · 어제 결과) · `facts.text` 원문 + `source` 배지 · 격자 파일 지연 로드(서명 URL → `DecompressionStream`) · DMA 게이트 | ✓ VERIFIED | `page.tsx` → `LimitupReport` → `fetchLimitupReport`(`limitup-api.ts` → `/api/limitup/report`). 하위 컴포넌트 6종이 `limitup-report.tsx` 165-180행에서 모두 렌더링됨. `limitup-event-card.tsx` 322-323행 `{f.text}` 원문 + `{f.source}` 배지, `useLimitupGrid`(`use-limitup-grid.ts:54` gzip 해제). e2e `limitup-report.spec.ts` P28-R1·R1b 존재 |
| 11 | 사이드바 최상위 「분석」(아이콘 `ChartLine`) › 「상한가 보고서」, DMA 사용자에게만 노출 | ✓ VERIFIED | `app-sidebar.tsx:110-111 NAV_ANALYTICS`, 472-477 트레이딩 그룹과 같은 노출 조건, `pathname.startsWith("/analytics")` 로 제목만 활성 |
| 12 | 배포 순서 DB → radar-gw 타이머 → relay → webapp 를 지키고 인박스 노트를 `done` + `done_commit` 으로 마감 | ⚠️ UNCERTAIN | DB(마이그레이션 5개 적용) → GCS·워커 → radar-gw 설치 → relay `b581af31` → server `00056-8mn` → push → Vercel Ready 순으로 수행됨(28-14·28-15 SUMMARY). 단 **radar-gw 타이머는 disabled** 이고 노트는 `status: open`, `done_commit:` 비어 있음, 「119 등록 대기」 줄 존재(노트 274행). 28-15 플랜이 이 분기를 명시적으로 허용했고 「거짓 done 금지」 를 따랐으므로 코드 결함이 아니라 외부 의존이다 |
| 13 | ROADMAP Goal 의 「`limit_up_events(code,date)` 와 `short_code`+`date` 조인」 | ⚠️ UNCERTAIN | 어느 플랜·SUMMARY·구현에도 `limit_up_events` 참조가 없다(grep 0건). 보고서는 export 의 `name` · `d1_open` · `d1_ret` 로 자립한다. CONTEXT 는 이 조인을 「조인 키 = …」 라고만 적었고 이를 쓰는 소비처(종목상세 링크 등)는 Deferred 에 있다. 의도적 생략이라는 기록이 없으므로 사용자 판정이 필요하다(아래 override 제안) |

**Score:** 11/13 truths verified (behavior-unverified 0 · 2건은 UNCERTAIN → human 판정)

### behavior-dependent truth 확인

상태 전이·정리·순서 불변식을 주장하는 truth 는 테스트로 실행 증거를 확인했다. 존재만으로 VERIFIED 로 올리지 않았다.

| 불변식 | 증거 |
|--------|------|
| 85 는 FULL 소켓에만, price 소켓은 0 | `relay/tests/fanout.test.ts` LF1 · LS2 · LS4 |
| 스냅샷 순서 q → tape → 85 · 캐시 없으면 지어내지 않음 | LS1 · LS3 · LS5 |
| 해제·linger 만료 뒤 늦은 85 가 캐시를 되살리지 않음 | hub.test 872 · 905, fanout LS6 |
| 탭 안 full 소비자 0 이면 스토어에서 키 삭제(얼린 값 방지) | `relay-socket.test.ts` D1 외, e2e P28-1b |
| skip 3연속 → exit 1 · unchanged 는 skip 기록 안 함 | `workers/limitup-sync/tests/dispatch.test.ts` 18건 |

해당 테스트 파일(relay hub·fanout, 워커, shared, server 라우트)을 이번 검증에서 직접 실행했고 모두 통과했다. 웹 3501건·e2e 130건은 main session 의 보고를 신뢰했고 재실행하지 않았다.

## D-ID 커버리지 (플랜 `requirements:` → CONTEXT D-01~D-23)

REQUIREMENTS.md 에는 Phase 28 에 매핑된 ID 가 없다(ROADMAP 에도 `Requirements: TBD`). 플랜 16개의 `requirements:` 합집합이 D-01~D-23 전부와 일치한다. 고아 요구사항은 없다.

| D | 플랜 | 상태 | 비고 |
|---|------|------|------|
| D-01 · D-02 · D-03 · D-04 | 28-01 · 28-07 | ✓ | 카드 탭·9칸·탭 제목·자동 전환 없음 |
| D-05 | 28-01 · 28-05 · 28-07 | ✓ | 접힌 카드 칩 폐기 — 헤더 불변이 구현과 일치 |
| D-06 | 28-02 · 28-09 | ✓ | 시세 집합 이중 정본 일치 |
| D-07 | 28-09 · 28-11 | ✓ | 체크 칩 · 기본 숨김 |
| D-08 · D-19 | 28-02 · 28-06 | ✓ | kind 15 30일 purge · member_alloc 30일 · 나머지 90일 |
| D-09 · D-10 | 28-10 · 28-12 | ✓ | 분석 메뉴 · DMA 게이트(server + RPC + 웹 표시) |
| D-11 · D-12 | 28-10 · 28-12 · 28-13 | ✓ (backstop 은 human) | 6구역 · 중립색 곡선 |
| D-13 | 28-04 · 28-08 · 28-14 · 28-15 | ⚠️ | 코드·설치 ✓, 가동은 119 등록 대기 |
| D-14 | 28-03 · 28-06 · 28-08 · 28-14 · 28-16 | ✓ | 바뀐 날짜만 · 날짜 단위 교체 |
| D-15 · D-17 | 28-03 · 28-06 · 28-10 | ✓ | 표 6개 + 파생 2 + stage + loads |
| D-16 | 28-04 · 28-06 · 28-08 | ✓ | GCS 수명 규칙 없음 · 90일 정리 |
| D-18 | 28-02 · 28-11 | ✓ | jsonb 래퍼 · 스토어 분리 |
| D-20 | 28-03 · 28-08 · 28-16 | ✓ (W-1) | skip warn+0 · 3연속 1 |
| D-21 | 28-04 · 28-14 · 28-15 | ✓ | 키 주석 `radar-gw-pull` · 인박스 추기 |
| D-22 | 28-14 · 28-15 | ⚠️ | 순서 준수, 타이머 단계는 보류 |
| D-23 | 28-01 · 28-05 | ✓ (W-2) | 캐시 + 스냅샷 + 웹 drop |

## Required Artifacts (3단계: 존재 · 실질 · 연결)

| 영역 | 산출물 | 상태 |
|------|--------|------|
| relay | `msg-type.ts` · `envelope.ts` · `subscription-hub.ts` · `fanout.ts` | ✓ 실질 구현 · 연결됨 |
| shared | `limit-feature.ts`(391) · `member-codes.ts`(89) · `limitup.ts` · `limitup-report.ts` · `strategy-event*.ts` | ✓ |
| DB | 마이그레이션 5개 · pgTAP 2개 | ✓ (원격 적용: main session 사실 + 28-14 SUMMARY) |
| 워커 | `index/derive/grid/load/manifest/purge/config` + Dockerfile · 배포·IAM·smoke · 알림 yaml | ✓ |
| radar-gw | `limitup-pull.sh/.service/.timer` · `install.sh` · `docs/relay-operations.md` | ✓ |
| server | `routes/limitup-report.ts` · `services/limitup-report.ts` · `schemas` · `strategy-events` `lf` | ✓ `app.ts:102` 마운트 |
| webapp | 보고서 컴포넌트 9 · `limitup-lanes.ts`(779) · `use-limitup-grid.ts` · 카드 `limit-feature-table.tsx` · 주문로그 체크 | ✓ |
| e2e | `limitup-report.spec.ts` · P28-1 · P28-1b · P28-2 · P28-O1 | ✓ 존재 (이번에 재실행 안 함) |

## Key Link 확인

| From | To | 상태 |
|------|----|------|
| `msg-type.ts` INBOUND 85 | hub `#onFeedFrame` case | ✓ WIRED |
| hub market 이벤트 | fanout `#deliverMarket` full 한정 | ✓ WIRED |
| `use-relay-socket` `applyMarketFrames` | `useStrategyCardState` → `CardTabs limitFeature` | ✓ WIRED (level full 한정) |
| RPC `(1,2,10,15)` | shared `isMarketStrategyEvent` | ✓ 주석이 서로를 가리킴 |
| 워커 `commitDay` | `limitup_commit_day` RPC | ✓ |
| `purge.ts` | `dma_strategy_events_purge_limit_feature` RPC | ✓ |
| server `/api/limitup` | `limitup_report_for_user` | ✓ |
| 격자 행 버튼 | `#ev-{isin}` 사건 카드 | ✓ |
| 설치기 · IAM | 운반기 버킷 `gh-radar-limitup-export` | ✓ |

## Data-Flow Trace (Level 4)

| 값 | 원천 | 실데이터 | 상태 |
|----|------|----------|------|
| 카드 9칸 | 서버 85 → relay → `limitFeatures` | 운영 미관찰 | ✓ 경로 FLOWING (픽스처·e2e), 운영 관찰은 human |
| kind 15 줄 | `dma_strategy_events` → `_json` RPC `lf=1` | 운영 미관찰 | ✓ 경로 FLOWING |
| 보고서 KPI·격자·사건·지문표·어제 | 워커 적재 → `limitup_report_for_user` jsonb | 실 4일 시드. 실사용자 RPC 가 4일 반환, 20261002 entries 29 · locks 12 · facts 169, 0.23초 | ✓ FLOWING |
| 레인 곡선 | Storage `limitup-grid` 서명 URL → gzip 해제 | 서명 URL CORS ok(main session 확인) | ✓ FLOWING |

하드코딩 빈 값·정적 폴백은 찾지 못했다.

## Behavioral Spot-Checks

| 동작 | 명령 | 결과 |
|------|------|------|
| 워커 전체 | `cd workers/limitup-sync && npx vitest run` | 7파일 · 73건 통과 |
| shared 85 표기 | `cd packages/shared && npx vitest run src/__tests__/limit-feature.test.ts` | 66건 통과 |
| relay hub · fanout | `cd relay && npx vitest run tests/hub.test.ts tests/fanout.test.ts` | 196건 통과 |
| server 보고서 라우트 | `cd server && npx vitest run tests/routes/limitup-report.test.ts` | 16건 통과 |

## Probe Execution

SKIPPED — 이 phase 는 `scripts/*/tests/probe-*.sh` 를 선언하지 않았고 PLAN 에도 probe 지정이 없다. 대응 증거는 `smoke-limitup-sync.sh`, `smoke-relay.sh`, `smoke-server.sh` 이며 이 스크립트들은 운영 상태를 건드리므로 verifier 가 실행하지 않았다(28-14·28-15 SUMMARY 의 PASS 를 증거로 기록만 한다).

## Anti-Patterns

phase 가 바꾼 소스 105개 파일(테스트 제외)에서 `TBD`·`FIXME`·`XXX`·`TODO`·`HACK`·`PLACEHOLDER` 는 0건이다. 부채 마커 게이트는 통과했다. 스텁 의심 패턴이 값 흐름에 닿는 곳은 없었다.

코드 리뷰(28-REVIEW.md)의 Critical 1 · Warning 10 · Info 16 은 아직 미수정 상태다. 이 중 verifier 가 코드로 직접 재확인한 것은 W-1(CR-B01)과 W-2(WR-A01)다.

### 경고 상세

**W-1 (high) — CR-B01 워커 실패 격리 부재.** `index.ts` 의 날짜 루프 안 non-skip 오류(manifest 에 표 파일 없음 174, 행 수 불일치 177, 격자 isin 불일치 188, commit 예외 205-215)는 모두 `throw` 해서 `dispatch` 전체를 끝낸다. 날짜는 오름차순이라 실패 날짜 뒤의 더 새로운 날짜가 적재되지 않는다. purge(222-236, kind 15 purge 포함)는 루프 뒤에만 있어 같이 막힌다. 28-16 must-have 는 「skip 은 다른 정상 날짜를 막지 않는다」 이고 28-03 은 「예외는 사유 로그 후 exit 1」 이라 기술적으로 계획과는 맞다. 그러나 phase Goal(밤 보고서)과 D-08(kind 15 30일 보존)을 영구 실패 하나가 무기한 막을 수 있는 설계다. 알림은 울리지만 코드 배포 없이는 풀 방법이 없다. 현실적 트리거가 가깝다. 119 가 member_top 재export 를 이미 보냈고(inbox `261005-member-top-int64.md`) 운반기가 켜지면 옛 날짜가 재적재되는데, commit 이 statement_timeout 8초에 가까운 날(member_alloc 79,220행, 로컬 2~3초)이 있다(WR-B02).

**W-2 (medium) — WR-A01 낡은 85 스냅샷.** `unsubscribe` 의 FULL→PRICE 강등(1095-1127)과 `#resumeFromLinger` 강등, `resubscribeAll` 은 `#limitFeatures` 를 지우지 않는다. 같은 키를 다시 FULL 로 잡으면 fanout 이 강등 전 마지막 프레임을 「지금」 값으로 보낸다. 서버는 값이 바뀐 키만 보내므로 조용한 키는 다음 85 까지 낡은 「잠김 N초째」 가 남는다. 웹의 `limit-feature.drop` 도 relay 스냅샷이 다시 채우므로 의미가 줄어든다. 28-05 의 must-have 문구(「다시 펼치면 relay 스냅샷이 즉시 채운다」)와는 문자상 부합하지만 의도(얼린 값 방지)를 해친다. 주문 판단에 쓰지 않는 표시값이라 심각도는 중간이다. 기존 `#tapes` 도 같은 보존 패턴이다.

**W-3 (medium) — `limit_up_events` 조인 미구현.** 위 truth 13 참고.

## Requirements Coverage

REQUIREMENTS.md 매핑 ID 없음(ROADMAP `Requirements: TBD`). 위 D-ID 표가 대체한다. ORPHANED 요구사항 0.

## Human Verification Required

### 1. 119 키 등록과 타이머 가동
**Test:** gh-trade 사용자가 119 `authorized_keys` 에 노트의 `radar-gw-pull` 줄을 등록한다. 그 뒤 radar-gw 에서 `--check`(`env $(cat /etc/limitup-pull.env)` 형태로)를 돌리고, 통과하면 `systemctl enable --now limitup-pull.timer` 를 실행한 뒤 첫 회차를 수동으로 띄운다.
**Expected:** `--check` 119 OK · `[limitup-pull] … rsync=ok upload=ok`.
**Why human:** 119 등록은 외부(gh-trade) 사용자 작업이다. 현재 `Permission denied (publickey)`.

### 2. 인박스 마감
**Test:** 1번 첫 운반이 확인된 뒤 `261005-limitup-feature-85.md` 를 `status: done` · `done_commit: <8자>` 로 바꾸고 경로 지정 커밋한다.
**Expected:** README 규약대로 마감. ROADMAP Goal 의 마지막 조건이 닫힌다.
**Why human:** 119 등록이 선행 조건이고, 거짓 done 을 막는 게이트가 의도된 것이다.

### 3. 다음 거래일 장중 85 · kind 15 실관찰
**Test:** gh-trade 서버가 85 를 송출하는 날 FULL 카드 「상한가」 탭과 주문로그 체크를 본다.
**Expected:** 탭 제목 「상한가 · 잠김 N초」 1초 갱신, 접었다 펼치면 즉시 복원, `dma_strategy_events` kind 15 가 분당·키당 1행, relay 로그 85 미처리 warn 0.
**Why human:** 운영 85 는 장중에만 온다.

### 4. 첫 밤 자동 적재와 재export 재적재
**Test:** 119 등록 뒤 첫 평일 21:00 운반 → 21:20 워커. 옛 날짜는 member_top 재export 로 files_sig 가 바뀌어 날짜 단위 교체 재적재된다.
**Expected:** `smoke-limitup-sync.sh` 가 행 수 == manifest 로 통과, 워커 로그에 `limitup day committed` 와 `replaced: true`.
**Why human:** 운반기 → GCS → 워커 자동 경로는 한 번도 실제로 돌지 않았다. 지금 데이터는 수동 시드다. W-1 수정 전이라면 이 재적재가 가장 위험한 첫 트리거다.

### 5. 시각 확인 (backstop 7건)
**Test:** 폰 390px 에서 카드 「상한가」 탭(말줄임 + title · 탭 제목 한 줄)과 보고서(격자 2단 카드 · 레인 라벨 겹침 0), 데스크톱 8열(창구 열 말줄임)을 눈으로 본다.
**Expected:** 28-07·28-11·28-12·28-13 의 `verification: backstop` 진술 7건이 성립한다.
**Why human:** backstop 진술은 존재 증거만으로 VERIFIED 로 올리지 않는다. e2e(P28-2 · P28-R1b · P28-O1)가 일부를 덮는다고 하지만 verifier 가 재실행하지 않았다.

## 사용자 결정 요청

**Truth 13 (`limit_up_events` 조인).** 이 조인은 의도적 생략일 가능성이 높다. 의도라면 VERIFICATION.md frontmatter 에 아래를 추가해 수용할 수 있다.

```yaml
overrides:
  - must_have: "웹 보고서 페이지 `limit_up_events(code,date)` 와 `short_code`+`date` 조인"
    reason: "보고서는 export 열(name · d1_open · d1_ret)로 자립 — 조인 소비처(종목상세 링크 · 상한가 다음날 이력 요약)는 CONTEXT Deferred 로 이월"
    accepted_by: "{이름}"
    accepted_at: "{ISO 시각}"
```

## Gaps Summary

must-have 가 FAILED 인 항목은 없어 `gaps:` 는 비어 있다. status 는 `human_needed` 이고 사유는 외부 의존(119 키 · 장중 관찰 · 첫 밤 자동 적재 · 시각 확인)이다. 코드 쪽으로는 W-1 이 가장 큰 잔여 위험이다. 119 재export 의 첫 재적재가 일어나기 전에 날짜별 try/catch 로 실패를 격리하고 purge 를 항상 돌리도록 고치길 권한다(`/gsd-code-review` 의 CR-B01 수정안). W-2 와 나머지 Warning 은 같은 정리 pass 에서 다뤄도 된다.

작업 트리 참고. `docs/inbox/from-gh-trade/261005-limitup-feature-85.md` 에 미커밋 변경 1줄이 있다. gh-trade 1105548d 결정에 따라 「탐지 0 인 날은 export 디렉터리 자체가 없다」 로 바뀐 규칙이다. 워커는 manifest 있는 날짜만 보므로 영향이 없다. 28-REVIEW.md 도 미커밋 수정 상태이고 master 는 origin 보다 3커밋 앞서 있다. verifier 는 커밋하지 않았다.

---

_Verified: 2026-10-05_
_Verifier: Claude (gsd-verifier)_
