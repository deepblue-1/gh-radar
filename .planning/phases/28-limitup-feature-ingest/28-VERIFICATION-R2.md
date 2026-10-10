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

> **2026-10-10 갱신:** truth 13(R2-W-1)은 UAT 7 에서 사용자 결정 (b) — ROADMAP Goal 에서 조인 구절을 Deferred 로 정정 — 로 닫혀 status passed 12/12. 아래 본문의 human_needed 판정은 결정 전 기록이다.

# Phase 28: 상한가 특징 연동 — 재검증 보고서 (2라운드)

**Phase Goal:** gh-trade Phase 27 계약(85 `LimitFeature` · kind 15 저널 · 119 밤 export)을 받아 장중에는 상한가 특징을 실시간(카드 탭)으로, 밤에는 그날 상한가 사건 보고서를 웹에서 보게 한다. 배포 DB → radar-gw → relay → webapp, 인박스 노트 done.
**Verified:** 2026-10-10T01:29:00Z
**Status:** human_needed
**Re-verification:** Yes — 1라운드(2026-10-05) 이후 코드가 바뀌어 새로 검증. 1라운드 보고서 `28-VERIFICATION.md` 는 낡았고 이 파일이 대체한다(덮어쓰지 않음).

## 판정 요약

목표는 달성됐다. 1라운드에서 막혔던 두 갈래가 닫혔다.

1. **외부 의존 4건(119 키 · 타이머 · 인박스 · 첫 밤 적재)**: 인박스 노트 `261005-limitup-feature-85.md` 가 `status: done` + `done_commit: 6cc4d55c` 이고(파일에서 직접 확인, 커밋 존재 확인), 짝 노트 `261005-member-top-int64.md` 도 `done` + `303d3a9f` 다. 타이머 가동과 첫 운반은 UAT 1·2·5 가 pass 로 기록했다.
2. **코드 결함 W-1 · W-2**: 둘 다 코드에서 닫힌 것을 직접 읽어 확인했다(아래).
3. **사람 확인 6건**: `28-UAT.md` 6/6 pass, issues 0 (3a042a53). 장중 85 · kind 15 관찰(3·4)과 시각 backstop(6)은 사용자 확인이다.

남은 것은 하나다. 코드 결함이 아니라 문서 정합 건이다. ROADMAP Goal 이 적은 `limit_up_events` 조인이 구현되지 않았고, 수용 기록도 없다(truth 13, R2-W-1). 이것이 status 를 `passed` 가 아니라 `human_needed` 로 만든 유일한 이유다. 1라운드부터 있던 항목이고 5일간 처리되지 않았다.

리뷰 R2 의 Warning 2건(WR-R2-01 · WR-R2-02)은 코드를 직접 읽어 지적이 맞음을 확인했다. 다만 둘 다 비정상 상태에서만 드러나는 견고성 결함이고 phase 목표 truth 를 깨지 않는다. advisory 로 남긴다.

## Goal Achievement — Observable Truths

ROADMAP 에 Success Criteria 목록이 없어(1라운드와 동일) Goal 문단과 16개 플랜 must_haves(CONTEXT D-01~D-23)에서 뽑은 13개 truth 를 그대로 재판정했다.

| # | Truth | Status | Evidence (이번 라운드에 직접 확인) |
|---|-------|--------|------------------------------------|
| 1 | (A) relay 가 quote 관찰자의 85 를 파싱·키별 캐시하고, 그 키를 FULL 로 잡은 소켓에만 중계. 새 FULL·승격 소켓은 q → tape → 85 스냅샷. 명시 `case` | ✓ VERIFIED | `msg-type.ts:250 LimitFeature: 85`, INBOUND 포함(312). `envelope.ts:909 parseLimitFeature`. hub `#onFeedFrame` `case MSG.LimitFeature`(2246) → `#onLimitFeature`(`{full:true, price:false}` 방출, 참조 없는 키·PRICE 키의 늦은 85 는 버림). fanout `2218` 에서 `limit.feature` 는 `lv !== "full"` 소켓 제외, 스냅샷 `#sendLimitFeatureSnapshot` 1385·1409. Phase 29 다중 서버 변경 뒤에도 유지. `relay hub.test + fanout.test` 201건 통과 |
| 2 | (A) 상따 카드 네 번째 탭 「상한가」 3줄 9칸, 탭 제목 「상한가 · 잠김 N초」, 자동 전환 없음 | ✓ VERIFIED | `card-tabs.tsx` `type CardTab = ... "limit"`·`limitFeatureTabSuffix`·`TabsTrigger value="limit"`. `strategy-card.tsx:308` 이 level full 일 때만 `limitFeature` 사용. 스토어 `limit-feature.drop` reducer(912-916). `card-tabs.test` 38건 통과. 운영 장중 관찰은 UAT 3 pass |
| 3 | (B) kind 15 가시성: RPC `(1,2,10,15)` · shared `isMarketStrategyEvent` 가 같은 집합 · jsonb 래퍼 · 30일 purge RPC · REVOKE anon/authenticated 명시 | ✓ VERIFIED | `…090000` 55·62행 `(1, 2, 10, 15)`, REVOKE/GRANT 세 함수 모두(71-73·91-93·112-114). `strategy-event.ts:92` `LimitFeature` 포함. Phase 29 `20261007200100_dma_visibility_v2.sql` 은 뷰만 바꾸고 이 RPC 본문은 건드리지 않음(파일 확인). pgTAP `dma_strategy_limit_feature` 24/24 · `dma_strategy_read` 28/28 (오늘 Nyquist 게이트 — 28-VALIDATION.md, 이번에 재실행하지 않음) |
| 4 | (B) kind 15 문장 조립(`case 15`) + 주문로그 「상한가 특징」 체크(기본 숨김 · 별도 스토어 · `?lf=1`) | ✓ VERIFIED | `strategy-event-text.ts:122 case 15`, `order-log-filters.tsx` 의 `order-log-check-limit-feature`, `use-order-log-feed.ts` 의 `showLimitFeature`·`loadLf`. 웹 `order-log` · `use-order-log-feed` 테스트 통과(webapp 11파일 170건). 장중 실관찰은 UAT 4 pass. 상한 5,000 축출 틈은 WR-A02 수정(453c1bc2)이 메우나 WR-R2-01 참고 |
| 5 | (C) limitup 표 · 날짜 단위 원자 commit RPC · RLS 정책 0 · service_role 전용 · 비공개 버킷 `limitup-grid` | ✓ VERIFIED | 마이그레이션 `…090100`·`…090200`·`…090300`·`…090500`(commit_day 함수 단위 timeout) 존재. pgTAP `limitup_load` 163/163 (오늘 게이트) |
| 6 | (C) 워커: manifest 있는 날짜만 · sha256 · schema_version · files_sig 로 바뀐 날짜만 재적재 · skip exit 0 / 3연속 exit 1 · 파생 · 격자 업로드 · 90/30일 보존 · kind 15 purge. **실패 날짜가 뒤 날짜·정리를 막지 않음** | ✓ VERIFIED | `index.ts` 날짜 루프(`for (const date of dates)` → `try { loadDay } catch` → `failed.push` 후 다음 날짜), purge 는 루프 뒤에 항상 도달(`purgeOld` 단계별 격리), 재적재 실패 시 `unpublish` 로 files_sig 를 지워 「새 격자 + 옛 행」 혼재 방지. `main` 종료 코드: failed 1 · alert 1 · stale 1 · 예외 1. **1라운드 W-1 닫힘.** 워커 vitest 9파일 94건 통과(dispatch 28 · dry-run 합계 · freshness · purge 포함) |
| 7 | (C) radar-gw 운반기: rsync 2단 · 타이머 `Mon..Fri 21:00 Asia/Seoul` · 자원 상한 · 키 `radar-gw-pull` | ✓ VERIFIED | `limitup-pull.timer:13 OnCalendar=Mon..Fri 21:00:00 Asia/Seoul`, `limitup-pull.sh --self-test` 13 cases OK(이번에 실행). 6cc4d55c 가 radar-gw mawk 비호환(`{8}` 반복)을 고침. 119 등록 · enable · 첫 운반 `rsync=ok upload=ok` 는 UAT 1 pass |
| 8 | 워커 운영 한 벌: Cloud Run Job · Scheduler · 알림 정책 · IAM · smoke | ✓ VERIFIED | `scripts/deploy-limitup-sync.sh` · `setup-limitup-sync-iam.sh` · `smoke-limitup-sync.sh` · `ops/alert-limitup-sync-failure.yaml` 존재. 4일 재적재 smoke PASS 12 · 창구 대조 0곳 차이는 UAT 5 기록. smoke 는 운영 상태를 건드려 재실행하지 않음 |
| 9 | 보고서 API: `GET /api/limitup/report` · `/grid-urls` — `requireAuth` + DMA 게이트(403 `DMA_UNMAPPED`) · RPC 1회 · 사용자 값 무시 | ✓ VERIFIED | `server/src/app.ts:108 app.use("/api/limitup", limitupRouter)`, `routes/limitup-report.ts` 두 라우트 모두 `requireAuth()`. server 라우트 테스트 19건 통과(출력의 warn/ERROR 는 DB_ERROR 500 경로를 의도적으로 두드리는 케이스) |
| 10 | 웹 보고서 `/analytics/limitup`: 6구역 · `facts.text` 원문 + `source` 배지 · 격자 지연 로드 · DMA 게이트 | ✓ VERIFIED | `app/analytics/limitup/page.tsx`, `limitup-report.tsx`·`limitup-day-grid.tsx`·`use-limitup-grid.ts`. 컴포넌트·훅 테스트 통과. 시각 backstop(폰 390px · 데스크톱 8열 · 카드 탭 폰 밴드)은 UAT 6 pass |
| 11 | 사이드바 「분석」(`ChartLine`) › 「상한가 보고서」, DMA 사용자에게만 노출 | ✓ VERIFIED | `app-sidebar.tsx:124-125 NAV_ANALYTICS`·`NAV_LIMITUP_REPORT`, 538 `pathname.startsWith("/analytics")` |
| 12 | 배포 순서 DB → radar-gw → relay → webapp 을 지키고 인박스 노트를 `done` + `done_commit` 으로 마감 | ✓ VERIFIED | 노트 frontmatter `status: done` · `done_commit: 6cc4d55c`(커밋 존재), 짝 노트 `303d3a9f` 도 done. 타이머 enable · 첫 운반 · 순서 준수는 UAT 1·2·5 pass. 노트 안에 남은 「119 등록 대기」 줄(274행)은 그 시점 이력으로, status 가 done 이므로 거짓 done 이 아님. **1라운드 partial 닫힘** |
| 13 | ROADMAP Goal 의 「`limit_up_events(code,date)` 와 `short_code`+`date` 조인」 | ⚠️ UNCERTAIN (사람 판정 필요) | phase 가 만든 소스(webapp · server · workers · shared · relay · supabase 마이그레이션)에 `limit_up_events` 참조 0건. `limit_up_events` 는 기존 `20260628120000_limit_up_tables.sql` 표이고 `server/src/routes/limitUp.ts` 등 옛 기능만 쓴다. 보고서는 export 의 `name` · `short_code` · `d1_open` · `d1_ret` 로 자립한다(UAT 6 시각 통과). CONTEXT 는 조인을 「조인 키 = short_code + date」 라는 키 규약으로만 적었고, 그 소비처(종목 행 → 종목상세 링크 · 상한가 다음날 이력)는 CONTEXT `Deferred Ideas` 에 이월돼 있다. 그러나 이월은 ROADMAP Goal 과 어긋난 채 수용 기록이 없다 |

**Score:** 12/13 truths verified (behavior-unverified 0 · 1건 UNCERTAIN → 사람 판정)

### truth 13 판단 근거

verifier 는 이것을 FAILED 로 올리지 않았다. 이유는 셋이다.
- 관찰 가능한 목표(그날 상한가 사건 보고서를 웹에서 본다)는 UAT 6 까지 포함해 달성됐다. 조인은 그 수단이다.
- 조인의 유일한 소비처가 CONTEXT Deferred 에 명시돼 있다. 이 phase 안에서 조인을 쓰면 보여줄 새 값이 없다.
- 구현 부재는 코드 결함이 아니다. 지워 달라고 한 적 없는 문구가 ROADMAP 에 남은 것이다.

그렇다고 VERIFIED 로도 올리지 않았다. 부재는 grep 으로 확인된 사실이고, 의도된 축소라는 수용 기록이 없다. verifier 가 사용자 대신 override 를 수용하는 것은 허용되지 않는다. 그래서 사람 결정 한 건으로 남긴다.

**결정 방법 (택일).**

(a) 수용 — 아래를 `28-VERIFICATION.md` frontmatter 에 추가한다.

```yaml
overrides:
  - must_have: "웹 보고서 페이지 `limit_up_events(code,date)` 와 `short_code`+`date` 조인"
    reason: "보고서는 export 열(name · short_code · d1_open · d1_ret)로 자립 — 조인 소비처(종목상세 링크 · 상한가 다음날 이력 요약)는 CONTEXT Deferred 로 이월"
    accepted_by: "{이름}"
    accepted_at: "{ISO 시각}"
```

(b) ROADMAP Phase 28 Goal 에서 조인 구절을 빼고 Deferred 로 옮긴다(실질 문서 정정). 이 경우 truth 13 은 사라지고 12/12 가 된다.

둘 중 어느 쪽이든 코드 변경은 필요 없다.

### behavior-dependent truth 확인

| 불변식 | 증거 |
|--------|------|
| 85 는 FULL 소켓에만, price 소켓은 0 | relay `fanout.test` — 이번에 hub + fanout 201건 직접 실행 통과 |
| FULL→PRICE 강등 · 재접속 뒤 낡은 85 캐시가 되살아나지 않음 (W-2 수정) | hub `#limitFeatures.delete` 3자리(1203 강등 · 1261 · 1317 release) 코드 확인 + `#onLimitFeature` 가 PRICE 키의 늦은 85 를 버림. hub 테스트 통과 |
| 날짜 하나의 영구 오류가 뒤 날짜 적재와 purge 를 막지 않음 (W-1 수정) | 워커 `dispatch.test` 28건 통과 — 날짜 격리 · purge 도달 · failed 시 exit 1 |
| skip 3연속 → exit 1 · unchanged 는 skip 기록 안 함 | 같은 `dispatch.test` |
| 재적재 실패 시 새 격자 + 옛 행이 섞이지 않음 (`unpublish`) | `load.test` · `dispatch.test` 와 코드(`index.ts` catch 의 `if (p?.sig) await unpublish(date)`) |
| 탭 안 full 소비자 0 이면 스토어에서 키 삭제 | 웹 `card-tabs.test` 38건 통과 + e2e P28-1b (오늘 게이트 12/12) |

모두 테스트 실행으로 확인했다. 존재(presence)만으로 올린 항목은 없다. 마지막 두 건의 e2e 는 이번에 재실행하지 않고 오늘 Nyquist 게이트(28-VALIDATION.md: Playwright P28 12/12)를 증거로 인용했다.

## 1라운드 이후 변경에 대한 회귀 확인

| 변경 | 확인 | 결과 |
|------|------|------|
| `fix(28)` 11개 (b38987b8 … 6be91f1f) | 리뷰 R2 가 diff 단위로 판정(10 닫힘 · 1 부분 = WR-A02). 이번에 W-1 · W-2 는 현재 코드를 직접 읽어 재확인 | 닫힘 |
| quick-261006-ide (85 잠김 누적 · locks 6열 · schema_version 1·2 수용) | `20261006120000_limitup_locks_lock_risk.sql` 존재, 워커가 `KNOWN_SCHEMA_VERSIONS` 로 판정. 워커 테스트 통과 | 이상 없음 |
| quick-261009-c43 (AI 애널리스트 차단 · smoke 폴링) | limitup 소스 파일 변경 없음(smoke 스크립트만) | 이상 없음 |
| Phase 29 다중 서버 (relay 레지스트리 · 서버별 세션 · 가시성 v2) | 85 경로(`msg-type` · `envelope` · hub · fanout)가 그대로 살아 있고 hub/fanout 201건 통과. 가시성 v2 는 뷰만 교체 — kind `(1,2,10,15)` RPC 본문 불변. 29 가 `dma-shared` → `dma-shr` 식으로 바꾼 pgTAP 픽스처는 1b66a044 가 재기반 | 이상 없음 |
| 오늘 게이트 | relay 1263/1263 · webapp 3766 passed (요청에 명시된 오늘 결과를 인용, 재실행하지 않음) | 인용 |

## Required Artifacts

| 영역 | 산출물 | 상태 |
|------|--------|------|
| relay | `msg-type.ts` · `envelope.ts` · `subscription-hub.ts` · `fanout.ts` | ✓ 실질 구현 · 연결됨 |
| shared | `limit-feature.ts` · `strategy-event.ts` · `strategy-event-text.ts` | ✓ (`limit-feature.test` 78건 통과) |
| DB | 마이그레이션 `…090000`~`…090500` · `…120000` · pgTAP 3파일 | ✓ (pgTAP 은 오늘 Nyquist 게이트 인용 — 54/54 · 163/163 · 24/24 · 28/28) |
| 워커 | `index/freshness/grid/purge/config` + 배포 · IAM · smoke · 알림 yaml | ✓ |
| radar-gw | `limitup-pull.sh/.service/.timer` · `install.sh` | ✓ (`--self-test` 13 OK) |
| server | `routes/limitup-report.ts` · `services/limitup-report.ts` | ✓ `app.ts:108` 마운트 |
| webapp | 보고서 컴포넌트 · `use-limitup-grid.ts` · 카드 탭 · 주문로그 체크 · 사이드바 · `/analytics/limitup` | ✓ |
| e2e | `webapp/e2e/specs/limitup-report.spec.ts` + P28-1·1b·2·O1 | ✓ 존재 (오늘 12/12 인용) |

## Key Link 확인

| From | To | 상태 |
|------|----|------|
| `msg-type.ts` INBOUND 85 | hub `#onFeedFrame` `case MSG.LimitFeature` | ✓ WIRED |
| hub `market` 이벤트 | fanout `limit.feature` full 소켓 한정(2218) | ✓ WIRED |
| fanout 스냅샷 | `#sendLimitFeatureSnapshot` (신규 full · 승격) | ✓ WIRED |
| 스토어 `limitFeatures` | `strategy-card.tsx:308` → `CardTabs limitFeature` (level full 한정) | ✓ WIRED |
| RPC `(1,2,10,15)` | shared `isMarketStrategyEvent` | ✓ 주석이 서로를 가리킴 |
| 워커 `commitDay` | `limitup_commit_day` RPC | ✓ |
| 워커 `purgeOld` | purge RPC · Storage 정리 | ✓ 루프 뒤 항상 도달 |
| server `/api/limitup` | `limitup_report_for_user` | ✓ |
| 사이드바 「분석」 | `/analytics/limitup` | ✓ |

## Data-Flow Trace (Level 4)

| 값 | 원천 | 상태 |
|----|------|------|
| 카드 9칸 | 서버 85 → relay → `limitFeatures` | ✓ FLOWING (UAT 3 로 운영 관찰 완료) |
| kind 15 줄 | `dma_strategy_events` → `_json` RPC `lf=1` + 라이브 푸시 | ✓ FLOWING (UAT 4) |
| 보고서 KPI · 격자 · 사건 · 지문표 · 어제 | 워커 적재 → `limitup_report_for_user` | ✓ FLOWING (UAT 5 의 4일 재적재 · 창구 대조 0곳 차이) |
| 레인 곡선 | Storage 서명 URL → gzip 해제 | ✓ FLOWING (UAT 6) |

하드코딩 빈 값 · 정적 폴백은 찾지 못했다.

## Behavioral Spot-Checks (이번에 실행)

| 동작 | 명령 | 결과 |
|------|------|------|
| 워커 전체 | `cd workers/limitup-sync && npx vitest run` | 9파일 94건 통과 |
| relay hub · fanout | `cd relay && npx vitest run tests/hub.test.ts tests/fanout.test.ts` | 201건 통과 |
| server 보고서 라우트 | `cd server && npx vitest run tests/routes/limitup-report.test.ts` | 19건 통과 |
| shared 85 표기 | `cd packages/shared && npx vitest run src/__tests__/limit-feature.test.ts` | 78건 통과 |
| 웹 보고서 · 격자 · 주문로그 · 카드 탭 | `cd webapp && npx vitest run src/components/analytics src/lib/__tests__/use-limitup-grid.test.tsx src/lib/__tests__/use-order-log-feed.test.tsx src/components/trading/__tests__/card-tabs.test.tsx src/components/trading/order-log/__tests__` | 11파일 170건 통과 |
| radar-gw 순수 함수 | `bash infra/relay/limitup-pull/limitup-pull.sh --self-test` | 13 cases OK |

pgTAP · Playwright · 전체 relay/webapp 회귀는 로컬 DB 컨테이너와 dev 서버가 필요해 이번에 실행하지 않았다. 호출자가 제시한 오늘 게이트(28-VALIDATION.md, 28-REVIEW-R2.md)를 증거로 인용한다.

## Probe Execution

SKIPPED — 이 phase 는 `scripts/*/tests/probe-*.sh` 를 선언하지 않았다. 대응 증거는 `smoke-limitup-sync.sh`(운영 상태를 건드려 verifier 가 실행하지 않음 · UAT 5 에 PASS 12 기록).

## Anti-Patterns

phase 가 바꾼 소스 30개 파일(위 covered_files 의 구현 파일 전부)에서 `TBD` · `FIXME` · `XXX` · `TODO` · `HACK` · `PLACEHOLDER` 0건. 부채 마커 게이트 통과. 스텁 의심 패턴이 값 흐름에 닿는 곳은 없다.

### 코드 리뷰 R2 처리 (28-REVIEW-R2.md — Critical 0 · Warning 2 · Info 7)

verifier 가 코드로 직접 재확인한 것은 Warning 2건이다. 둘 다 지적이 정확하다.

- **R2-W-2 (WR-R2-01)** `use-order-log-feed.ts:182-193`. 가드 키가 `strategyEventKey(oldestLive)` 한 값이다. 상한 5,000 에 닿은 뒤에는 새 kind 15 마다 `oldestLive` 가 바뀌어 가드가 풀린다. REST 가 꼬리를 못 옮기면 재조회가 반복될 수 있다. 발화 조건은 (1) 「상한가 특징」 체크를 켠 오늘 화면 (2) 라이브 kind 15 가 5,000줄에 도달 (3) 서버 기록이 라이브보다 밀리거나 0건. 기본은 숨김이고 세 조건이 겹쳐야 한다. 목표 truth 4 의 동작(켜면 노출)은 깨지지 않으므로 advisory.
- **R2-W-3 (WR-R2-02)** `index.ts:311-327`. `purgeOld` 가 throw 하면 dispatch 가 그대로 다시 던져 `main` 이 `result` 를 받지 못하고 `limitup-sync stale` 로그가 나가지 않는다. 단 `main` 의 catch 가 `return 1` 하므로 알림은 울린다. 가려지는 것은 stale 원인 로그 한 줄이다. truth 6 의 종료 코드 계약을 깨지 않으므로 advisory.

Info 7건(IN-R2-01~07)은 리뷰 R2 문서를 따른다. 처분 기록은 `28-REVIEW-R2-DISPOSITION.md`(9건 open)다. 이 중 IN-R2-02(KRX 캘린더 seed 가 2026-12-31 에 끝나 2027 년 이후 휴장일이 거래일로 센다)는 시한이 있다. 다음 분기 안에 처분하길 권한다.

## Requirements Coverage

REQUIREMENTS.md 에 Phase 28 로 매핑된 ID 없음(ROADMAP `Requirements: TBD`). 플랜 16개의 `requirements:` 합집합 = CONTEXT D-01~D-23 전부. 고아 요구사항 0. D-ID 판정은 1라운드 표와 같고, 1라운드에서 ⚠️ 였던 D-13(운반기 가동) · D-22(배포 순서)는 UAT 1·2·5 로 ✓ 가 됐다. D-20 · D-23 의 (W-1) · (W-2) 단서도 해소됐다.

## Human Verification Required

### 1. ROADMAP Goal 의 `limit_up_events` 조인 처리 결정 (R2-W-1)

**Test:** 위 「truth 13 판단 근거」의 (a) override 수용 또는 (b) ROADMAP Goal 문구 정정 중 하나를 택한다.
**Expected:** (a) 면 `28-VERIFICATION.md` frontmatter 에 override 가 붙어 truth 13 이 PASSED (override) 로 바뀌고 13/13. (b) 면 truth 13 이 사라져 12/12. 어느 쪽이든 status 는 `passed`.
**Why human:** 구현 부재는 관찰된 사실이지만 의도적 축소인지는 코드로 알 수 없고, override 수용에는 사람의 accepted_by 가 필요하다.

1라운드의 사람 확인 6건은 `28-UAT.md` 6/6 pass 로 닫혔으므로 다시 올리지 않는다.

## Gaps Summary

FAILED 로 판정한 truth 는 없고 `gaps:` 는 비어 있다. 코드 결함으로 인한 차단도 없다.

남은 일은 둘이다.
1. **결정 1건(블로커 아님, status 를 `human_needed` 로 만든 유일한 사유):** truth 13 의 override 수용 또는 ROADMAP 문구 정정. 코드 변경 없음.
2. **advisory 후속(다른 phase 에서 처리 가능):** WR-R2-01 · WR-R2-02 와 Info 7건. 처분은 `28-REVIEW-R2-DISPOSITION.md` 에서 관리한다. IN-R2-02(KRX 캘린더 만료 신호)만 2026-12-31 이라는 기한이 있다.

작업 트리 참고. `tasks/lessons.md` 가 이 phase 와 무관하게 수정 상태이고 untracked `shots/` · `ui-reviews/` 폴더가 있다. verifier 는 커밋하지 않았다.

---

_Verified: 2026-10-10T01:29:00Z_
_Verifier: Claude (gsd-verifier) — 2라운드_
