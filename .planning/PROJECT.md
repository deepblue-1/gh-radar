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
- [x] GH Trade 모바일 앱 (MOBILE-01) — Validated in Phase 21: Capacitor Remote-URL 셸(iOS·iPadOS·Android `com.ghtrade.app`)이 운영 웹 https://trade.jx1.io 를 로드 · 네이티브 하단 플로팅 탭바 5탭(라벨 없는 캡슐 · 키보드/키패드 즉시 숨김) · pull-to-refresh · 네이티브 Google 로그인 → signInWithIdToken · 오프라인 폴백 · 인앱 브라우저 · 테마 동기화(기본 다크). UAT 4차 실서버 30/30 pass · 재검증 R2 15/15 (2026-09-26). 스토어/TestFlight 배포는 별도 phase
- [x] DMA 다중 서버 · 웹 Admin 유저 관리 (ADMIN-01~12) — Validated in Phase 29: 서버 레지스트리 4대(KB120·KB121·KYOBO119·KYOBO127, `dma_servers`) · 웹 Admin(`/admin/users` · `/admin/servers`)에서 허용 gmail·역할·DMA 유저·계좌·등록 서버·계좌별 주문 서버(G-1)를 편집하면 relay 가 서버별 관리자 연결(44/86/87)로 즉시 반영 · (유저, 서버) 세션 · 옛 서버 전략 끄기(sweep) · 운영(교보119·KB120) 보존 배포 relay 183ea9c8. 3라운드 갭 클로징 뒤 검증 passed(override 1 — R3-01 IP/MAC 87 캐시, IP/MAC 작업과 함께). 두 번째 서버 켜기 전 결정 남음(29-53-SUMMARY)

- [x] 실시간 상한가 근접 종목 스캔 (등락률 기준값 조절) — Validated in Phase 5·05.2·09.1 (v1.0)
- [x] 종목 검색 기능 — Validated in Phase 6·06.1 (v1.0)
- [x] 종목별 뉴스 수집 및 AI 요약 — Validated in Phase 7·07.1·07.2·13·14 (v1.0, 요약은 홈 AI 분석·챗봇으로 흡수)
- [x] 종목별 네이버 종목토론방 수집 및 AI 분류 — Validated in Phase 8·08.1 (v1.0, Haiku 분류는 비용으로 비활성)
- [x] 로그인(Google OAuth) + 관심종목 — Validated in Phase 06.2 (v1.0, 이메일/비번 AUTH-01 은 Deferred)
- [x] GH Trade 테스트 배포 (iOS TestFlight · Android Firebase APK) — Validated in Phase 22 (MOBILE-02, v1.0)
- [x] KB 계좌별 주문자 IP/MAC (IPMAC-01~05) — Validated in Phase 30: relay R3-01(op 1/3 직전 op 5 재조회 · 실패면 44 미송신) · R3-02(공유 계좌 추가 시 다른 유저 IP/MAC 되싣기) · 웹 Admin 계좌 카드 편집(계좌명 · IP/MAC, 표시는 `10.41.1.124` · `1C:FD:08:7D:97:8E`, 저장 · 비교는 정규화값) · 공유 계좌 IP/MAC 동시 반영(gh-trade 261011 op 3 전파 + 웹 안내 줄) · KB 운영 서버 IP/MAC 설정 보류 해제. 배포 relay 2234a1b5 · server 00061-fvv · webapp 34f145b1, 실서버 UAT 2라운드 pass(KB120). 남은 비차단: KB121 전파 배포 확인 · 실주문 전문 IP/MAC 회선 관측
- [x] 상따 금액(만원) 단위 (AMT-01~04) — Validated in Phase 31: 웹 `lc.set` 재제출이 C# 단말 칸의 만원 원값을 지우지 않는다(금액 8필드 되싣기 · 구 탭은 relay 가 에코 원값으로 보충) · 수량 8칸 두 줄 행(위 만원 / 아래 주) · 시트 환산 안내 · 주문로그 「N만(M주)」 · /me 「후매수 최소(만원)」(84 `post_buy_floor_amount` · 42 12값). gh-trade feature 병합 뒤 생성물 마커 e5b4fbca 일치. UAT 4/4 · 재검증 R2 passed 4/4 (2026-10-12)

### Active

- [ ] gh-trade 인박스 처리 — 새 노트가 오면 처리 · ~~KB 계좌별 주문자 IP/MAC~~ Phase 30 완료 · ~~상따 금액 단위~~ Phase 31 완료
- [ ] 운영 중 발견되는 버그 수정 · 자잘한 기능 추가 (v1.1 상시)
- [x] CLAUDE.md 다이어트

### Out of Scope

- 미국 주식 — 한국 시장만(v1.0 그대로 유효)
- 실시간 알림/푸시 — 계속 범위 밖(relay `/healthz` 알림은 운영 감시로 별개)
- Play 스토어 배포 — 개발자 인증 뒤 새 phase(2026-10-11 Phase 23 제거)
- 이메일/비밀번호 로그인(AUTH-01) — Google OAuth 로 충분, 요청 있을 때만

## Current State (v1.0 shipped 2026-10-11)

- 운영: webapp https://gh-radar-webapp.vercel.app · 트레이딩 https://trade.jx1.io (push = 프로덕션 배포) · relay(Cloud Run, VPN 으로 KB/교보 gh-trade 서버) · 워커 Cloud Run Job 7종(master/intraday/news/discussion/theme/limitup/home-sync)
- 모바일: GH Trade iOS TestFlight · Android Firebase APK(Play 는 인증 대기)
- 37 phase · 432 plan · quick 130건 → `.planning/milestones/v1.0-*` 로 아카이브
- 열린 운영 항목: 두 번째 DMA 서버 켜기 전 결정 · ~~KB IP/MAC 설정 보류(R3-01)~~ 해제(Phase 30) · KB121 IP/MAC 전파 배포 확인 · 실주문 IP/MAC 회선 관측 · D-25 래치 실기 관측(Xcode 라이선스) · smoke INV-9 첫 실행

## Current Milestone: v1.1 운영 유지보수

**Goal:** 목표 기능 없이, 운영 중인 프로덕트의 버그 수정 · 자잘한 기능 추가 · gh-trade 인박스 계약 반영을 작은 단위로 처리한다. 마일스톤은 작게 유지하고 주기적으로 마무리한다(토큰 비용).

**Target features:**
- 인박스 KB 계좌별 주문자 IP/MAC — relay R3-01(계획 직전 op 5 재조회) · 웹 Admin 계좌 편집 입력칸 2개 · gh-trade 질문 3개 답
- 인박스 상따 금액 단위 — `lc.set` 재제출 때 금액 8필드 에코값 되싣기 · 84 `post_buy_floor_amount` 표시(「만(주)」 UI 도입은 결정 사항)
- CLAUDE.md 다이어트 — quick 1건
- 운영 버그 · 소규모 기능 — 발생 시 `/gsd-quick`·`/gsd-fast`, 로드맵 phase 없음

**보류(v1.1 밖):** 두 번째 DMA 서버(KB121·KYOBO127) 켜기 전 결정(R3-03/05/06 · 51 계좌 필터) — 켤 계획이 생길 때 별도 phase.

## Context

- 대상 시장: 한국 주식 (코스피/코스닥) · 실거래는 KB·교보 DMA(gh-trade 서버)
- 시세: 키움 REST(매분) + KRX EOD 일봉 · 실시간 호가는 relay 공유 연결 · 뉴스: Naver Search API · 종목토론: Bright Data 경유 배치
- AI: Claude API — 챗봇 Sonnet 5 · 분류 Haiku 4.5(비활성)
- 프론트엔드: Next.js 15 + Tailwind 4 + shadcn/ui → Vercel · 모바일 Capacitor
- 백엔드: Express(Cloud Run) · relay(Cloud Run + WireGuard radar-gw) · 워커 Cloud Run Job
- 데이터베이스: Supabase (RLS · RPC)

## Constraints

- **Budget**: 무료 API 활용 우선, API 호출 비용 최소화
- **데이터 갱신**: 실시간이 이상적이나, API 제한 시 1분 간격 폴링 허용
- **배포 환경**: 프론트 Vercel, 백엔드 Cloud Run (컨테이너 기반)
- **법적**: 크롤링 시 robots.txt 준수, API 이용약관 준수

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Claude API로 뉴스/토론방 요약 | 사용자 선호, 한국어 요약 품질 우수 | ⚠️ Revisit — 요약은 홈 AI 분석·챗봇으로 흡수, 토론 Haiku 분류는 비용으로 비활성 |
| v1에 로그인+관심종목 포함 | Phase 7 뉴스 배치가 "사용자별 관심종목"을 타겟팅해야 트레이더 유즈케이스 완성 (2026-04-16 v2→v1 승격) | ✓ Good — Phase 06.2 (Google OAuth · 홈 인증 게이트) |
| 상한가 기준값 사용자 조절 가능 | 트레이더마다 전략이 다름 | ✓ Good — Phase 5 스캐너 |
| 공유 KB 계좌 IP/MAC 은 모든 보유자에 함께 반영(Phase 30 D-18) | gh-trade 가 같은 계좌번호의 라우팅 값(지점·거래자·IP·MAC)을 사용자 간 한 벌로 강제 — 사용자별 op 3 으로는 바꿀 수 없음 | ✓ Good — gh-trade op 3 원자적 전파(261011) · KB120 실서버 확인 |
| 실시간 시세 소스: KIS → 키움 OpenAPI 전환 | KIS REST 폴링 한계 (per-stock N+1, rate limit) → 키움 ka10027 페이지네이션 단일 호출로 활성 종목 매분 갱신. Direct VPC Egress + Static IP whitelist 필수. | Phase 09.1 (2026-05-15) — KIS 완전 폐기 |
| 캔들스틱 차트 채택 (Out of Scope 정책 반전) | 2026-05-15 사용자 명시 — 상세 페이지 자체 완결성 우선, TradingView/키움과의 차별화보다 트레이더가 화면 전환 없이 가격 흐름을 즉시 파악하는 가치 우선. RESEARCH 비교 후 lightweight-charts 5.2.0 lock-in. | Phase 09.2 |
| 모바일 = Capacitor Remote-URL 셸 + 네이티브 탭바/로그인 (Phase 21) | 웹 한 벌을 운영 URL 로 그대로 쓰고(middleware 인증·OAuth callback 때문에 static export 불가), Google 이 WebView OAuth 를 막아 네이티브 Sign-In 이 필수 | ✓ Good — UAT 4차 30/30 (2026-09-26) |
| 시세는 relay 공유 연결 1개로 팬아웃 (Phase 26) | 유저별 DMA 세션 구독이면 같은 시세가 VPN 구간에 N 벌 흐르고 주문 통보가 시세 뒤에 줄을 섬 → 관찰자 로그인 quote 역할(주문 권한 0) 연결 1개 · 참조계수 `isin\|ex` 전역화 · 캐시 공유 · PRICE 필터 relay 이관. 폴백 없음이라 `/healthz` 503 축으로 감시 | ✓ Good — 첫 거래일 UAT (a)~(e) pass (2026-10-01) |
| 주문로그·잔량진행률은 gh-trade 서버 StrategyEvent(80 별도 seq)·QueueProgress(83)를 진실 원본으로 relay 가 적재·팬아웃 (Phase 25) | 웹이 문구를 파싱하거나 진행률을 재계산하면 클라(WinForms)와 갈라짐 → 값은 서버가 정하고 웹은 표시만. 계약 변경(수동/VI group 7·8 · first_filled · 추가매수 포기 수량)은 gh-radar relay·웹 먼저 배포 → 서버 나중 | ✓ Good — UAT 7/7 pass · Nyquist validated (2026-10-03) |
| 자동매도는 gh-trade 서버(Phase 28)가 진실 원본 — gh-radar 는 relay 중계(41 바로시작/중지 · 42/43/84 사용자 설정 · schema 4 요청 4필드 · 에코 4필드)와 웹 표시·조작만 (Phase 27) | 상태 전이·매도 판단은 서버가 하고 웹은 에코(`auto_sell_state` 등)·저널 kind 11~14 를 그대로 보여 준다. 「미반영」은 낙관 반영 없이 기대 전이로만 해제. /me 기본설정은 84 캐시 + 1칸 전체 교체(42), present=false 면 내장 기본값 표시만 | ✓ Good — 첫 거래일 UAT 5/5 pass · 재검증 R2 passed 12/12 · Nyquist validated (2026-10-10). R2 Warning 2(「미반영」 잔존 표시) 미처리 |
| 상한가 특징은 gh-trade 가 진실 원본 — 장중 85 LimitFeature 는 relay 가 FULL 구독에만 1초 중계, 밤 보고서는 119 export 를 radar-gw 21:00 pull → GCS → limitup-sync 21:20 날짜 단위 교체 적재 (Phase 28) | 웹이 특징을 재계산하면 WinForms 와 갈라짐 → 값·문장(`facts.text`)은 서버가 정하고 웹은 표시만. 119 는 외부에서 못 들어가 radar-gw 가 읽기 전용 rrsync 키로 당겨 옴. 보고서는 export 열로 자립하고 `limit_up_events` 조인은 종목상세 링크·다음날 이력과 함께 Deferred | ✓ Good — UAT 7/7 pass · 재검증 R2 passed 12/12 · Nyquist validated (2026-10-10) |
| DMA 다중 서버 — 레지스트리는 gh-radar DB(`dma_servers` · 계좌 등록 의도), 계좌 설정 정본은 gh-trade 서버 users.toml(87 스냅샷) · relay 가 서버별 관리자 연결로 반영 (Phase 29) | 서버 4대를 웹에서 관리하되 서버가 각자 계좌·전략을 소유 → 의도는 DB, 반영 결과는 서버 87 로 대조(칩). 계좌별 주문 서버(G-1)는 지정 ?? 기본 서버 ?? 유일 등록 서버 규칙 한 벌(shared `resolveEffectiveOrderServer`)로 relay · Admin 이 같이 판정 | ✓ Phase 29 (운영은 지정 0 · 두 번째 서버 꺼짐 — 켜기 전 결정 남음) |

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
*Last updated: 2026-10-12 after Phase 31*
