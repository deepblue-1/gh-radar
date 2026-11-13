---
phase: 41-kis-news-and-disclosure-feed
verified: 2026-11-13T12:10:00Z
status: passed
score: 8/8 must-haves verified
covered_files:
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-01-PLAN.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-01-SUMMARY.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-02-PLAN.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-02-SUMMARY.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-03-PLAN.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-03-SUMMARY.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-04-PLAN.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-04-SUMMARY.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-05-PLAN.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-05-SUMMARY.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-06-PLAN.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-06-SUMMARY.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-07-PLAN.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-07-SUMMARY.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-08-PLAN.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-08-SUMMARY.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-09-PLAN.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-09-SUMMARY.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-10-PLAN.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-10-SUMMARY.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-11-PLAN.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-11-SUMMARY.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-12-PLAN.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-12-SUMMARY.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-13-PLAN.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-13-SUMMARY.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-14-PLAN.md"
  - ".planning/phases/41-kis-news-and-disclosure-feed/41-14-SUMMARY.md"
  - "packages/shared/src/stock-feed.ts"
  - "server/src/routes/news-by-stock.ts"
  - "server/src/routes/news.ts"
  - "supabase/migrations/20261112100000_kis_news_feed.sql"
  - "supabase/migrations/20261112200000_kis_news_collector.sql"
  - "supabase/migrations/20261113300000_stock_feed_min_disclosures.sql"
  - "webapp/src/components/home/news-block.tsx"
  - "webapp/src/components/stock/news-item.tsx"
  - "webapp/src/components/trading/card/card-news-strip.tsx"
  - "webapp/src/components/trading/workbench/breakout-strip.tsx"
  - "webapp/src/lib/use-stock-feed.ts"
  - "workers/home-sync/src/ai/prompt.ts"
  - "workers/home-sync/src/pipeline/loadSurges.ts"
  - "workers/kis-news-sync/src/collector.ts"
  - "workers/kis-news-sync/src/kis/client.ts"
  - "workers/kis-news-sync/src/kis/newsTitle.ts"
  - "workers/kis-news-sync/src/pipeline/classify.ts"
covered_digest: "v4:sha256:0fae83de2ec8c6882dd41cba6c8a603b97e2ccf308724572c887046cb27dcb9f"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 41: 한투 뉴스·공시 피드 검증 보고서

**Phase Goal:** 돌파·상따 종목에 「지금 무슨 재료가 떴나」를 뉴스·공시 제목으로 바로 보여 준다. gh-radar 가 한투 「종합 시황/공시(제목)」(`FHKST01011800`)을 서버측 배치로 받아 저장하고, 네이버 뉴스(`news_articles`)와 합쳐 웹앱과 gh-trade(묶음 조회)에 제공한다. 공식 쿼터 API 규칙(사용자 수와 독립 · 설계 예산 ≤ 75% · 한도 신호 시 run 중단 · 출처 표기)을 따른다.
**Verified:** 2026-11-13
**Status:** passed (열린 경고 있음 — 아래 「열린 리뷰 지적에 대한 판단」 참고)
**Re-verification:** 아니오 — 최초 검증
**요구사항 ID:** 이 phase 는 REQUIREMENTS.md 에 매핑된 ID 가 없다(`grep "Phase 41" REQUIREMENTS.md` 0건). 각 PLAN 의 `requirements:` 는 성공 기준 SC-1 ~ SC-7 을 가리키므로, 이 보고서는 SC-1 ~ SC-7 과 결정 D-01 ~ D-21 로 추적한다. ID 부재는 실패로 보지 않았고, 고아(orphaned) 요구사항도 없다.

## 목표 달성

### 관찰 가능한 사실

| # | 사실 (성공 기준) | 상태 | 근거 |
|---|------------------|------|------|
| 1 | **SC-1** 평일 `07:00` ~ `20:00` 새 글이 10초 안팎 주기로 DB 에 들어오고 같은 글이 두 번 저장되지 않는다 | ✓ VERIFIED | 수집기 `workers/kis-news-sync/src/collector.ts`(689줄) 실재. 빠른 창 루프가 전체 최신 5초 · 공시 F · G 60초 · 종목별 순환(`FEED_INTERVAL_MS` · `DISCLOSURE_SAFETY_MS` · `fastStep`). 일련번호 멱등 · 같은 날 수정본 합치기는 RPC `kis_news_ingest` + pgTAP(오케스트레이터 재실행: `kis_news_auto_market` 10/10 · VALIDATION `kis_news` 61/61 · `kis_news_collector` 84/84). 운영 실측(41-11, 2026-11-13): 공시 수신 지연 중앙 3.3초 · 90% 5.5초, 하루 글 2,348건(공시 403), 임대 잡은 실행 1개(07:00 ~ 20:00). 이 검증에서 단일 테스트 파일 3개 재실행 63/63 통과(`newsTitle` · `collector` · `classifyError`). CR-01 은 되감기 경로의 잠재 결함이지 이 사실을 깨지 않는다(아래). |
| 2 | **SC-2** 종목 조회 시 한투 뉴스 · 공시와 네이버 뉴스가 시간순 한 목록 · 줄마다 자료원과 종류 · 같은 기사는 한 줄 + 네이버 링크 | ✓ VERIFIED | `server/src/routes/news.ts` · `news-by-stock.ts` 가 RPC `stock_feed_by_codes` 1회 + shared `mergeStockFeed` 를 부른다(grep 확인, D-14 한 곳 합치기). home-sync 도 같은 shared 함수를 쓴다. `news-item.tsx` 가 `kind` 배지 · 링크 없는 줄(`news-item-nolink`) · `↗` 는 URL 있는 줄만 · 자료원 줄을 그린다. 이 검증에서 server `news-by-stock` · `news` 44/44, shared `stock-feed` 29/29 재실행 통과. |
| 3 | **SC-3** gh-trade 가 종목 묶음 조회로 받는다(수집 대상 밖 종목도 비지 않음 · 「수집 전」 구분) | ✓ VERIFIED | `GET /api/news/by-stock` 구현 · `collectedAt` null 구분 · `p_register: true` 등록만. 인박스 노트 `../gh-trade/docs/inbox/from-gh-radar/261112-kis-news-by-stock.md` 가 `status: done` · `done_commit: 5d38a6a3`. 그 커밋을 gh-trade 저장소에서 직접 확인: `client/Services/Radar/NewsLookup.cs`(861줄) · `RateCrossListForm.cs` · `LimitChaserForm.cs` · `NewsStripControl.cs` 추가(2026-11-12). 2026-11-13 인박스 `261113-news-disclosure-quota.md`(공시 밀림)도 `e762eb75` 로 처리 완료. |
| 4 | **SC-4** 호출량이 사용자 수와 무관 · 일일 호출 수가 카운터에 남고 설계 예산 안 | ✓ VERIFIED | `server/src` · `webapp/src` · `deploy-server.sh` 에 한투 호출 경로 · env · Secret grep 0건(조회는 DB 만 읽음). 초당 상한 `KIS_NEWS_MAX_RPS` 기본 5 = 공식 초당 20건의 25%, 코드 상한 15(75%)를 `config.ts`(`KIS_MAX_RPS_LIMIT`)와 배포 스크립트가 강제. 카운터 `api_usage` `kis_news_title`: 2026-11-13 91,179건(자체 상한 200,000 의 46%) · 한도 의심 0. 주의: 한투 공개 일일 한도는 미확인(RESEARCH A2)이라 200,000 은 「공식 75%」가 아니라 폭주 방지 자체 상한이다 — 75% 기준은 확인된 초당 20건에 대해 지켜진다. |
| 5 | **SC-5** 한투 장애 · 한도 소진 · 토큰 만료는 로그와 함께 그 run 만 중단하고, 네이버 수집과 기존 화면은 그대로 | ✓ VERIFIED (경고 WR-02 · WR-04) | `classifyKisError` · `safeErrorFields` · `StopRun` 종료 코드 · 토큰 61초 가드 · 임대 · 한도 의심 탐침(`collector.ts` 270 ~ 284) 실재, `classifyError` 17/17 통과. `git diff --stat e951de6e..HEAD -- workers/news-sync` 빈 출력(네이버 수집 무변경), 새 마이그레이션이 `news_articles` 를 고치는 문장 0. 한도 소진이 알 수 없는 코드 + 5xx 로 오는 경우는 중단 대신 백오프(WR-02, 미관측 가장자리). |
| 6 | **SC-6** 웹 네 자리(종목 뉴스 목록 · 작업대 돌파 목록 · 상따 카드 · 홈)가 목업대로 보인다 | ✓ VERIFIED | 배선 확인: `trading-workbench.tsx:1528` `StockFeedProvider` · `breakout-strip.tsx` `feedBadgesOf` · `FeedRows` · 행 선택 상세 · `strategy-card.tsx:1217` `CardNewsStrip` · `news-block.tsx` 링크 없는 공시 줄 · `stock-news-section.tsx` 「관련 뉴스·공시」. 41-UI-REVIEW(코드 대조) 가 배지 · 색 토큰 · 폰트 · 띠 치수가 목업과 일치함을 확인. 시각 UAT 는 사용자 「됐다」(2026-11-12, 폰 · PC) · 홈 ④ 「됨」(2026-11-13). |
| 7 | **SC-7 / D-10** 수집 하루 뒤 공시 종류 목록을 사용자에게 보여 더 뺄 종류를 확인 | ✓ VERIFIED | 41-11 SUMMARY: 하루 403건 · 12개 묶음 제시, 사용자 「숨기고 싶은 종류 없음」 → 규칙 변경 없음. |
| 8 | **D-19** 홈 급등 요약 AI 가 공시 · 한투 뉴스를 재료로 읽고, 호출 수가 폭증하지 않는다 | ✓ VERIFIED | `workers/home-sync/src/pipeline/loadSurges.ts:233` RPC + `mergeStockFeed`, `prompt.ts` `[공시]` 줄. 호출 수: 기준선 478 → 11/13 463(−3%), 463회 모두 `end_turn`. 모델은 D-19 의 `haiku-4-5` 에서 별도 커밋 `77b680e6`(2026-11-12)으로 `haiku-5-5` 로 바뀌었다 — 이 phase 밖 사용자 지시 변경이라 목표를 해치지 않는다(참고). |

**점수:** 8/8 사실 검증(행동 미검증 0건). 위 점수는 SC-1 ~ SC-7 7개 + D-19.

### 필수 산출물 (플랜 `must_haves.artifacts`)

`gsd-tools query verify.artifacts` 로 플랜 14개 전부 실행: 01 4/4 · 02 4/4 · 03 2/2 · 04 2/2 · 05 3/3 · 06 5/5 · 07 1/1 · 08 3/3 · 09 1/1 · 10 3/3 · 11 1/1 · 12 3/3 · 13 3/3 · 14 1/1 — 누락 · 껍데기(stub) 0건.

### 핵심 연결 (Key Links)

`verify.key-links` 결과 14개 플랜 중 12개 전부 연결. 2건은 도구 한계로 수동 확인했다.

| From | To | 상태 | 확인 |
|------|----|------|------|
| 41-03 노트 → gh-trade 세션 | 인박스 `261112-kis-news-by-stock.md` | ✓ WIRED | 도구는 저장소 밖 경로를 거부. 파일 직접 확인: `status: done` · `done_commit: 5d38a6a3` · gh-trade 저장소의 해당 커밋이 `NewsLookup.cs` 등 추가 |
| 41-11 home-sync → RPC `stock_feed_by_codes` | `loadSurges.ts:233` | ✓ WIRED | 도구는 `from` 이 파일 경로가 아니라고 거부. grep 으로 호출 확인 |
| 수집기 → `kis_news_ingest` RPC → `kis_news` · `kis_news_stocks` | `collector.ts` `ingestFeed` / `pipeline/ingest.ts` | ✓ WIRED | 도구 통과 |
| 웹 폴링 → `/api/news/by-stock` → RPC → `mergeStockFeed` | `use-stock-feed.ts` → `news-by-stock-api.ts` → `news-by-stock.ts` | ✓ WIRED | 도구 통과 + 코드 확인 |

### 데이터 흐름 추적 (Level 4)

| 산출물 | 데이터 | 출처 | 실데이터 | 상태 |
|--------|--------|------|----------|------|
| `news-by-stock.ts` `items` | `stock_feed_by_codes` RPC → `kis` + `naver` 배열 | `kis_news`(수집기 적재) · `news_articles`(네이버) | 예 — 운영 하루 2,348건 적재 | ✓ FLOWING |
| `breakout-strip.tsx` 배지 · 상세 | `StockFeedProvider` → `useStockFeedPolling` → fetch | 같은 server 엔드포인트 | 예 — 사용자 UAT 「됐다」 | ✓ FLOWING |
| `card-news-strip.tsx` | `useStockFeedEntry(code)` | 같은 공급자 | 예 | ✓ FLOWING |
| `news-block.tsx` 홈 | home-sync 가 쓴 `HomeNewsRef`(공시 포함) | `loadSurges` → RPC → AI | 예 — 11/13 호출 463회 | ✓ FLOWING |

### 행동 점검 (Step 7b)

| 행동 | 명령 | 결과 | 상태 |
|------|------|------|------|
| 커서 되감기 · 수집 루프 · 오류 분류 | `pnpm exec vitest run tests/newsTitle.test.ts tests/collector.test.ts tests/classifyError.test.ts --maxWorkers=2` (kis-news-sync) | 3 파일 63/63 | ✓ PASS |
| server 묶음 조회 · 종목 뉴스 | `vitest run tests/routes/news-by-stock.test.ts tests/routes/news.test.ts --maxWorkers=2` | 2 파일 44/44 | ✓ PASS |
| shared 합치기 | `vitest run src/__tests__/stock-feed.test.ts --maxWorkers=2` | 29/29 | ✓ PASS |
| 전체 회귀 · pgTAP | 오케스트레이터가 이 실행에서 수집 — relay 2006 · server 1017 · shared 1369 · kis-news-sync 238 · home-sync 188 · webapp 6320/6321(실패 1건은 Phase 42 의 `chart-kind-switch.test.tsx` 시간 초과, 단독 재실행 15/15) | 재실행하지 않음 | ✓ (인용) |

### 프로브 실행 (Step 7c)

이 phase 는 `scripts/*/tests/probe-*.sh` 형 프로브를 선언하지 않았다. 배포 스모크(`scripts/smoke-kis-news-sync.sh`)는 Cloud Run 에서 한투를 1회 호출하는 운영 도구라 로컬에서 실행하지 않았다(원격 접촉 금지). 41-09 Task 2 에서 실제 실행 기록이 있다. SKIPPED.

### 요구사항 커버리지

REQUIREMENTS.md 에 Phase 41 매핑 ID 없음. SC-1 ~ SC-7 은 위 「관찰 가능한 사실」로 전부 처리했다(SC-1 ~ SC-6 · SC-7 모두 VERIFIED).

### 안티패턴 스캔

| 파일 | 패턴 | 심각도 | 영향 |
|------|------|--------|------|
| phase 수정 소스(`workers/kis-news-sync/src` · shared · server · webapp · home-sync · 마이그레이션 · 스크립트) | `TBD` · `FIXME` · `XXX` | 0건 | 부채 표식 게이트 통과 |
| 같은 범위 | `TODO` · `HACK` · `PLACEHOLDER` | 0건 | — |
| `server/src` · `webapp/src` | 한투 직접 호출 · 비밀 | 0건 | 운영 기준 ③ 충족 |

### 열린 리뷰 지적에 대한 판단 (41-REVIEW.md · 41-REVIEW-DISPOSITION.md 전부 `open`)

오케스트레이터 요청에 따라 치명 2건이 성공 기준을 막는지 직접 코드와 표본으로 확인했다. 결론: 둘 다 목표를 막지 않는 품질 결함이다. 다만 둘 다 실재하고 고칠 가치가 있다.

**CR-01 (수집기 되감기 커서가 갱신 시각을 쓴다) — 실재 확인, 목표는 유지.**
- 확인: `newsTitle.ts` `cursorOf` 는 `data_dt` · `data_tm`(갱신 시각)을 쓴다. 실측 픽스처 `kis-news-title-sample.json` 의 `stock_005930` 마지막 행은 일련번호 시각 `14:25:19` 인데 `data_tm` 이 `175422`(17:54:22)다 — 리뷰의 주장과 일치. 이 행이 쪽 끝에 오면 다음 쪽이 같은 쪽으로 돌아와 `added === 0` 으로 경고 없이 멈추고, `lastSeen` 이 앞으로 가 틈이 남는다.
- 왜 SC-1 을 깨지 않는가: 정상 경로는 5초마다 첫 쪽(40건)을 받아 `lastSeen` 에 닿고 끝난다(쪽 넘김이 일어나지 않는다). 결함이 나려면 한 번에 40건을 넘는 몰림 + 쪽 끝 수정본이 겹쳐야 한다. 공시는 F · G 안전망(60초마다 1쪽)과 종목별 조회가 따로 덮는다. 실제 운영도 공시 403건을 중앙 3.3초에 받았다.
- 남는 위험: 몰림이 큰 장 시작 무렵이나 느린 실행(최대 30쪽)에서 뉴스(공시 외)가 영구히 비는 틈. 테스트는 이 경우를 덮지 않는다. **후속 수정 권고(우선).**

**CR-60 (새 글 강조 기준선이 수집 전 응답) — 실재 확인, 목표는 유지.**
- 확인: `use-stock-feed.ts:110 ~ 119` 의 `apply` 는 코드별 첫 응답을 `collectedAt` 확인 없이 기준선으로 삼는다. 서버가 막 등록한 종목은 첫 응답이 `collectedAt: null` 이라 이후 종목별 수집이 메운 3일 치 글이 모두 「새 글」 30초 강조를 받는다.
- 왜 SC-6 을 깨지 않는가: 새 글 강조는 CONTEXT 「Claude's Discretion」 항목이고 SC · D-15 ~ D-20 의 필수 요소가 아니다. 목록 · 배지 · 띠 · 자료원 표기 자체는 정상이다. 영향은 새로 등록된 종목에 한한 30초짜리 오해 소지 강조다.
- 남는 위험: 상따 카드에서 지난 기사가 방금 뜬 재료처럼 보일 수 있다. **후속 수정 권고.**

**경고 중 운영 기준과 직접 닿는 것 — 확인했으나 판정은 경고 유지:**
- **WR-02**: `classifyKisError` 가 5xx 상태이면 `msg_cd` 가 있어도 모르는 코드를 `transient` 로 분류(`client.ts:43 ~ 49` 에서 확인) → 한도 소진이 5xx + 모르는 코드로 오면 run 을 멈추지 않고 최대 60초 백오프를 반복. CLAUDE.md 운영 기준 ④ 에 틈이 있다. 단, 한투 일일 한도 자체가 미확인이고 한도 의심 표시는 0건이며, 자체 일일 상한 200,000 이 최악을 묶는다. 후속 수정 권고.
- **WR-01 · WR-03 · WR-04**: 60초 정지가 같은 걸음에 안 걸림 · 분류 통계를 버려 무로그 0건 수집 가능 · 탐침이 토큰 무효를 오진. 모두 가장자리 · 관측성 결함이며 운영 수치(한도 의심 0 · 임대 1개)가 현재 정상임을 보인다.
- **WR-30**(시황 규칙 오탐으로 종목 재료 기사가 지워짐) · **WR-31**(`before` 커서가 한투 ↔ 네이버 짝을 끊음) · **WR-32**(등록 upsert 교착 가능) · **WR-60 ~ WR-63**(폴링 겹침 · 디바운스 부재 · 「N건」 표기 · e2e 픽스처): 모두 품질 · 견고성 지적이며 SC 를 깨지 않는다. WR-63 은 e2e 가 새 계약을 지나가지 않는다는 점이라 회귀 방어가 얇다.
- **UI 감사(18/24)**: 돌파 표 행 선택의 키보드 도달 불가 · 링크 `aria-label` 이 뉴스 배지를 가림 · 배지 대비 4.19 — 접근성 결함. 마우스 · 터치 기능은 UAT 로 확인됨.

판정을 「passed」 로 둔 이유: 모든 SC 가 운영 데이터와 사용자 UAT 로 달성되었고, 치명 2건 모두 SC 문장을 직접 거짓으로 만드는 증거를 찾지 못했다. 반대로 SC-1 의 「틈 없이」 와 SC-5 의 「한도 신호 시 중단」 은 위 결함 때문에 정상 경로에서만 보장된다. 이 두 줄을 향후 신뢰 근거로 쓰기 전에 CR-01 · WR-02 를 닫는 것을 권한다.

### 인간 검증 필요 항목

없음. 시각 UAT(①~③ · ④) · D-10 공시 종류 확인 · 토큰 알림톡 · D-19 호출 수는 모두 사용자 답으로 기록되어 있다(41-VALIDATION 「Validation Sign-Off」 · 41-11 SUMMARY).

한계(검증하지 못한 것): 원격 DB · 운영 API 에는 접속하지 않았다(지시). 마이그레이션 `20261113300000`(6인자 RPC)의 원격 적용은 Phase 43-08 SUMMARY 가 「이미 원격 적용 · `stock_feed_by_codes` 6인자 확인」이라 적은 독립 기록으로 확인했다. gh-trade 클라의 실화면 동작은 해당 저장소 커밋 존재까지만 확인했다.

### 요약

Phase 41 은 목표를 달성했다. 한투 수집기(상주 Cloud Run Job · 임대 · 토큰 재사용 · 초당 상한 · 예산 카운터), 저장소(`kis_news` 계열 · 멱등 들여오기 · 서비스롤 전용 RLS), 조회(server 묶음 · 종목 뉴스 · shared 합치기), 소비(gh-trade `NewsLookup` · 웹 네 자리 · 홈 AI 재료)가 코드에 실재하고 서로 연결되며, 운영에서 실제 데이터가 흐른다(하루 2,348건 · 공시 지연 중앙 3.3초 · 호출 91,179건). 열린 치명 2건(CR-01 · CR-60)과 경고 11건은 후속 quick 으로 처리할 가치가 있는 견고성 결함이다.

**권고 후속(우선순위):** CR-01 → WR-02 → CR-60 → WR-04 · WR-01 · WR-03 → WR-30 · WR-31 → 나머지.

---

_Verified: 2026-11-13_
_Verifier: Claude (gsd-verifier)_
