---
phase: "41"
slug: "kis-news-and-disclosure-feed"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-11"
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 출처: `41-RESEARCH.md` §Validation Architecture. 요구사항 ID 가 없는 phase 라 성공 기준(SC-1 ~ SC-7 · `41-CONTEXT.md` §specifics)과 D-19 로 추적한다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest — 새 워커 `workers/kis-news-sync` ^3(news-sync 와 같음) · server ^4.1.4(node) · shared ^4.1.4 · webapp ^2.1.9(jsdom) · home-sync 기존 설정 + pgTAP(로컬 일회용 Postgres 컨테이너 `public.ecr.aws/supabase/postgres:17.6.1.104`) |
| **Config file** | `server/vitest.config.ts` · `packages/shared/vitest.config.ts` · `webapp/vitest.config.ts` · 새 `workers/kis-news-sync/vitest.config.ts`(Wave 0 가 만든다) · pgTAP 러너 `scripts/verify-dma-orders-price-check.sh --test <file>` |
| **Quick run command** | `pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/<file>.test.ts --maxWorkers=2`(패키지별 단일 파일) · DB 는 `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news.test.sql` |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/kis-news-sync exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2 && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news.test.sql`(D-19 묶음 때 `pnpm --filter @gh-radar/home-sync exec vitest run --maxWorkers=2` 추가) |
| **Estimated runtime** | 단일 파일 ≤ 15초 · 전체 약 3분(Phase 40 실측 160초 기준 추정 — 실행 때 실측으로 교체) |

---

## Sampling Rate

- **After every task commit:** 그 태스크 파일 단위 `exec vitest run <파일> --maxWorkers=2` · DB 태스크는 pgTAP 1파일.
- **After every plan wave:** 건드린 패키지 `exec vitest run --maxWorkers=2` + pgTAP `kis_news.test.sql` — 전체 회귀는 한 세션만 돌린다(동시 세션 메모리 고갈 규칙).
- **Before `/gsd-verify-work`:** Full suite green + 배포 뒤 운영 확인(아래 Manual-Only 표).
- **Max feedback latency:** 단일 파일 ≤ 15초.

---

## Per-Task Verification Map

보안 검사는 사용자 결정으로 생략(`security_enforcement: false`) — Threat Ref 는 「—」. 태스크 ID 는 플랜이 확정된 뒤 채운다. 아래는 성공 기준별로 플랜이 반드시 연결해야 하는 검사다.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 41-TBD | TBD | TBD | SC-1 | — | 들여오기 RPC 는 서비스롤 전용 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/kis_news.test.sql` — 같은 일련번호 두 번 → 1행 · 같은 날 같은 (업체, 제목키) 다른 일련번호 → 1행 · 다음 날 같은 제목 → 2행 · 조회 코드 연결 · 마지막 수집 시각 갱신 · 임대 중복 실행 차단 | ❌ W0 | ⬜ pending |
| 41-TBD | TBD | TBD | SC-1 | — | N/A | unit | `pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/newsTitle.test.ts tests/cadence.test.ts tests/scheduler.test.ts tests/classify.test.ts --maxWorkers=2` — 커서 페이징 · 빠른 창(`07:00` · `20:00` 경계 · 주말) · 새 등록 먼저 · 표본 분류 | ❌ W0 | ⬜ pending |
| 41-TBD | TBD | TBD | SC-2 | — | N/A | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/stock-feed.test.ts --maxWorkers=2` — 제목키 · 앞부분 일치 · 시각 빠른 쪽 · 링크·스니펫은 네이버 · 정렬 | ❌ W0 | ⬜ pending |
| 41-TBD | TBD | TBD | SC-2 | — | N/A | route | `pnpm --filter @gh-radar/server exec vitest run tests/routes/news.test.ts --maxWorkers=2` — 종목 뉴스 조회·새로고침 응답이 합친 목록 | ✅ (케이스 추가) | ⬜ pending |
| 41-TBD | TBD | TBD | SC-3 | — | 인증 없는 조회 — 전용 제한기 · 입력 검증 400 | route | `pnpm --filter @gh-radar/server exec vitest run tests/routes/news-by-stock.test.ts --maxWorkers=2` — 101코드 400 · 글 없는 코드 빈 배열 · 수집 전 null · `+09:00` · 캐시 · RPC 1회 | ❌ W0 | ⬜ pending |
| 41-TBD | TBD | TBD | SC-3 | — | N/A | typecheck | `pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/server run typecheck` — 계약 타입 드리프트 | ✅ | ⬜ pending |
| 41-TBD | TBD | TBD | SC-4 | — | server 에 한투 호출 경로 없음 | static | `! grep -rn "koreainvestment\|FHKST01011800\|KIS_APP" server/src` | ✅ (명령) | ⬜ pending |
| 41-TBD | TBD | TBD | SC-4 | — | N/A | unit | `pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/apiUsage.test.ts tests/budget.test.ts --maxWorkers=2` — 카운터 증가 · 일일 가드 초과 시 실행 종료 | ❌ W0 | ⬜ pending |
| 41-TBD | TBD | TBD | SC-5 | — | 로그에 토큰·키 없음 | unit | `pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/classifyError.test.ts tests/token.test.ts --maxWorkers=2` — 오류 코드별 동작 · 로그에 `msg_cd`·`msg1`·상태 | ❌ W0 | ⬜ pending |
| 41-TBD | TBD | TBD | SC-5 | — | N/A | static | `git diff --stat <phase 시작>..HEAD -- workers/news-sync` 가 비어 있음(네이버 수집 무변경) | ✅ (명령) | ⬜ pending |
| 41-TBD | TBD | TBD | SC-6 | — | N/A | RTL | `pnpm --filter @gh-radar/webapp exec vitest run src/components/stock/__tests__ --maxWorkers=2` — 배지 · 링크 없는 줄 · 자료원 항상 | ✅ (케이스 추가) | ⬜ pending |
| 41-TBD | TBD | TBD | SC-6 | — | N/A | RTL | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading --maxWorkers=2` — 돌파 배지·행 펼침 · 상따 띠 · 강조 타이머 1개 | ✅ (케이스 추가) | ⬜ pending |
| 41-TBD | TBD | TBD | SC-6 | — | N/A | RTL | `pnpm --filter @gh-radar/webapp exec vitest run src/components/home --maxWorkers=2` — 홈 근거 목록의 공시 줄 | ✅ (케이스 추가) | ⬜ pending |
| 41-TBD | TBD | TBD | D-19 | — | N/A | unit | `pnpm --filter @gh-radar/home-sync exec vitest run src/ai/prompt.test.ts src/ai/clusterSurges.test.ts src/pipeline/loadSurges.test.ts --maxWorkers=2` — 공시 라벨 · verbatim · `stop_reason` 로그 | ✅ (케이스 추가) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `workers/kis-news-sync/` 패키지 골격 + `vitest.config.ts`
- [ ] `workers/kis-news-sync/tests/fixtures/kis-news-title-sample.json` — 실측 표본. 보존 사본: `.planning/phases/41-kis-news-and-disclosure-feed/reference/kis-news-title-probe-result.json`(2026-11-11 실측 · 토큰·키 문자열 0건 확인 · 아직 미커밋 — 픽스처 자리로 **옮긴다**)
- [ ] `supabase/tests/kis_news.test.sql`
- [ ] `packages/shared/src/__tests__/stock-feed.test.ts`
- [ ] `server/tests/routes/news-by-stock.test.ts`
- [ ] `scripts/kis-disclosure-kinds.sql`(D-10 공시 종류 목록)
- [ ] 스모크: Cloud Run 발신 한투 1회(키 주입 뒤)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 웹 네 자리가 채택 목업대로 보인다(폭 390 · PC · 상따 본문 폭 4밴드) | SC-6 | 시각 대조 | `reference/mockup-news-disclosure-web.html` 과 운영 화면을 나란히 대조 |
| 수집 하루 뒤 공시 종류 목록을 사용자에게 보여 주고 더 뺄 종류를 확인 | SC-7 (D-10) | 사용자 판단 | `scripts/kis-disclosure-kinds.sql` 결과 제시 |
| 평일 빠른 시간대에 새 글이 10초 안팎에 들어온다 · 수집기가 한 개만 돈다 | SC-1 | 운영 데이터 필요 | 수신 시각 − 작성 시각 분포(중앙값 15초 이하 목표) · 실행 로그 |
| 당일 호출 수가 카운터에 남고 예산 안 | SC-4 | 운영 데이터 필요 | `api_usage` 의 `kis_news_title` 당일 값 |
| gh-trade 클라가 종목 묶음 조회로 받는다 | SC-3 | 다른 저장소 클라 | `curl` 로 응답 형태·지연 확인 + gh-trade 세션 확인 |
| 홈 AI 요약 하루 호출 수 배포 전후 비교 | D-19 | 운영 데이터 필요 | home-sync 로그의 Claude 호출 수 비교 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
