# gh-radar

## What This Is

한국 주식 트레이더를 위한 실시간 종목 정보 웹앱. 상한가에 근접한 종목을 실시간으로 스캔하고, 관심 종목의 뉴스와 네이버 종목토론방 정보를 AI가 요약하여 제공한다.

## Core Value

트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다.

## Requirements

### Validated

- [x] 실시간 또는 1분 간격 데이터 갱신 — Validated in Phase 09.1: 키움 ka10027 매분 cycle (`* 9-15 * * 1-5` Asia/Seoul) 로 활성 종목 ~944 row 갱신
- [x] 상한가 다음날 이력 통계 (LIMIT-01) — Validated in Phase 12: 종목 자체 마감상한가 이벤트의 다음날 시/고/저/종 수익률을 KRX EOD 일봉으로 백테스트(`rebuild_limit_up` 야간 사전계산, event_rows=3459), 종목상세에 읽기전용 데이터 대시보드(히어로 익절률 + 분포 밴드 + 이벤트 표 + 테마 풀링)로 표시. limit-up-sync 워커 Cloud Run Job + nightly Scheduler 활성.
- [x] AI 애널리스트 챗봇 (CHAT-01) — Validated in Phase 14: 팀장(claude-sonnet-5, adaptive thinking)+전문가 5(claude-sonnet-5: 시세/테마/뉴스/상한가/웹서치) 멀티에이전트 오케스트레이션, SSE POST /api/chat(JWT 검증), 로그인 사용자별·종목별 히스토리(conversations/messages RLS 8정책), 전역 FAB+챗 시트+/chat 페이지, 마크다운/스텝퍼/미니카드/인용/미니차트 렌더. production 라이브(첫 토큰 ~0.5s, web_search POC PASS). 면책 문구는 사용자 지시로 미표기.

### Active

- [ ] 실시간 상한가 근접 종목 스캔 (등락률 기준값 사용자 조절 가능, 기본 25%)
- [ ] 종목 검색 기능
- [ ] 종목별 뉴스 수집 및 AI 요약
- [ ] 종목별 네이버 종목토론방 수집 및 AI 요약
- [ ] 로그인/회원 기능 (이메일/비번 + 소셜 로그인)
- [ ] 관심종목 저장 및 관리 (로그인 계정별)

### Out of Scope

- 미국 주식 — v1은 한국 시장만, 이후 확장
- 모바일 앱 — 웹 우선
- 실시간 알림/푸시 — v2 이후

## Context

- 대상 시장: 한국 주식 (코스피/코스닥)
- 주식 데이터 소스: 무료 API 활용 (한국투자증권 OpenAPI, KRX 공개데이터 등)
- 뉴스 소스: 리서치 후 결정 (네이버 금융, 한경, 매경 등 후보)
- AI 요약: Claude API 사용
- 프론트엔드: Next.js + Tailwind CSS + shadcn/ui → Vercel 배포
- 백엔드: TypeScript + Express → Cloud Run 배포
- 데이터베이스: Supabase
- 필요시 Python 스크립트 별도 활용 가능 (크롤링 등)

## Constraints

- **Budget**: 무료 API 활용 우선, API 호출 비용 최소화
- **데이터 갱신**: 실시간이 이상적이나, API 제한 시 1분 간격 폴링 허용
- **배포 환경**: 프론트 Vercel, 백엔드 Cloud Run (컨테이너 기반)
- **법적**: 크롤링 시 robots.txt 준수, API 이용약관 준수

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Claude API로 뉴스/토론방 요약 | 사용자 선호, 한국어 요약 품질 우수 | — Pending |
| v1에 로그인+관심종목 포함 | Phase 7 뉴스 배치가 "사용자별 관심종목"을 타겟팅해야 트레이더 유즈케이스 완성 (2026-04-16 v2→v1 승격) | — Pending |
| 상한가 기준값 사용자 조절 가능 | 트레이더마다 전략이 다름 | — Pending |
| 실시간 시세 소스: KIS → 키움 OpenAPI 전환 | KIS REST 폴링 한계 (per-stock N+1, rate limit) → 키움 ka10027 페이지네이션 단일 호출로 활성 종목 매분 갱신. Direct VPC Egress + Static IP whitelist 필수. | Phase 09.1 (2026-05-15) — KIS 완전 폐기 |
| 캔들스틱 차트 채택 (Out of Scope 정책 반전) | 2026-05-15 사용자 명시 — 상세 페이지 자체 완결성 우선, TradingView/키움과의 차별화보다 트레이더가 화면 전환 없이 가격 흐름을 즉시 파악하는 가치 우선. RESEARCH 비교 후 lightweight-charts 5.2.0 lock-in. | Phase 09.2 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-03 — Phase 14 complete (AI 애널리스트 챗봇, CHAT-01). 팀장+전문가 5 멀티에이전트 SSE 챗봇 production 라이브 — 상세는 Validated 항목 참조. 코드리뷰 Warning 8건 수정 반영, human UAT 4항목은 14-HUMAN-UAT.md 추적. (이전: Phase 13 complete (홈 화면 — 오늘의 급등 테마 AI 분석, HOME-01). 앱 루트(/)에 새 "홈" 신설: 오늘 +20% 급등 종목을 큐레이션 테마와 무관하게 Claude Haiku 1회로 bottom-up 클러스터링하여 주도 테마·상승 이유·소속 종목·근거 뉴스(1-2건 verbatim)를 시점별(:30) 스냅샷으로 read-only 표시. 신규 home-sync Cloud Run Job(장중 cron 30 9-15 * * 1-5 KST, OAuth invoker) + home_theme_snapshots 일별 이력 테이블(hash-skip clone-append) + 읽기 라우트 GET /api/home. 프로덕션 배포 + Claude POC PASS(4테마 실측, 환각 0, ~$3.1/월). 비차단 후속: 테마 내 newsRefs URL dedup, loadSurges .limit 보강(WR-01/02). (이전: Phase 12 상한가 다음날 이력 통계 LIMIT-01, Phase 11 Co-movement, Phase 10 theme-classification.)*
