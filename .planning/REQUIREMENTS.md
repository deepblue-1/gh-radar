# Requirements: gh-radar

**Defined:** 2026-04-10
**Core Value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다.

## v1 Requirements

### Design System

- [ ] **DSGN-01**: 디자인 토큰 정의 (컬러 팔레트, 타이포그래피, 스페이싱/여백 규칙) — CSS 변수 기반, 하드코딩 최소화
- [ ] **DSGN-02**: Light/Dark 테마 지원 (CSS 변수 전환 방식)
- [ ] **DSGN-03**: 공통 컴포넌트 라이브러리 (Button, Card, Table, Badge, Input 등) — shadcn/ui 커스터마이징 기반
- [ ] **DSGN-04**: 페이지 레이아웃 템플릿 (네비게이션, 사이드바, 콘텐츠 영역)
- [ ] **DSGN-05**: 디자인 시스템 HTML 카탈로그 문서 (토큰, 컴포넌트, 레이아웃 시각화)

### Scanner

- [x] **SCAN-01**: 코스피/코스닥 전 종목의 실시간 등락률 리스트 표시
- [x] **SCAN-02**: 상한가 근접 종목 필터링 (기준값 사용자 조절 가능, 기본 25%)
- [x] **SCAN-03**: 임계값 슬라이더 UI (10~29% 범위)
- [x] **SCAN-04**: 종목별 현재가 + 등락률 + 거래량 표시
- [x] **SCAN-05**: 코스피/코스닥 마켓 뱃지 표시
- [x] **SCAN-06**: 데이터 갱신 시각 표시
- [x] **SCAN-07**: 1분 간격 자동 갱신 (장 시간 내)
- [x] **SCAN-08**: 갱신시각 서버 DB 기준 표시 (Phase 05.2 — `stocks.updated_at` MAX → `X-Last-Updated-At` 헤더)

> 각주: SCAN-04의 "거래량"은 Phase 05.2에서 "거래대금(KRW)"으로 재해석됨. UI는 `inquirePrice.acml_tr_pbmn` 정확값 표시, inquirePrice 실패 종목은 "-" 표시.

### Search

- [x] **SRCH-01**: 종목명 또는 종목코드로 검색
- [x] **SRCH-02**: 검색 자동완성 드롭다운
- [x] **SRCH-03**: 종목 상세 페이지 (현재가, 등락률, 거래량 등 상세 정보)

### News

- [x] **NEWS-01**: 종목별 관련 뉴스 목록 표시 (Naver Search API 활용)

### Discussion

- [x] **DISC-01**: 네이버 종목토론방 글 목록 표시 (on-demand 스크래핑, 5~10분 캐싱) — Phase 8 (production live 2026-04-18)
- [x] **DISC-01.1**: 종목토론 의미성 AI 분류 + 필터링 (price_reason/theme/news_info/noise 4-category, Claude Haiku 4.5 inline classify, 웹앱 Switch 토글 기본 ON=meaningful + URL sync) — Phase 08.1

### Authentication

- [ ] **AUTH-01**: 이메일/비밀번호 로그인 (Supabase Auth 기반) — Phase 06.2 Deferred (Google OAuth 우선, 이메일/비밀번호는 별도 phase)
- [x] **AUTH-02**: 소셜 로그인 (Google 완료, Kakao 별도 phase) — Phase 06.2

### Personalization

- [x] **PERS-01**: 관심종목 저장 및 관리 (로그인 계정별 watchlist CRUD) — Phase 06.2

### Infrastructure

- [x] **INFR-01**: KIS OpenAPI 연동 (실시간 시세 데이터, 등락률 순위 REST 폴링) — Phase 5.1 production 활성화(Cloud Run Job + Scheduler)
- [x] **INFR-02**: Supabase 데이터베이스 스키마 구축 (stocks, news_articles, discussions, summaries) — Phase 5.1 stocks 테이블 자동 upsert 파이프라인 가동
- [x] **INFR-03**: Express API 서버 구축 및 Cloud Run 배포 (min-instances=1)
- [x] **INFR-04**: Next.js 프론트엔드 구축 및 Vercel 배포

### Data

- **DATA-01**: KRX 상장 전 종목 3년치 일봉 OHLCV 수집 및 영업일 EOD 증분 갱신 (분석 기반 데이터 레이어 — Phase 9)
- **DATA-02**: 장중 활성 거래 종목(~1,898) 의 현재가/등락/누적거래량을 1분 cadence 로 stock_quotes + stock_daily_ohlcv 오늘자 row 에 UPSERT (키움 REST `ka10027` 페이지네이션). 추가로 hot set (등락률 상위 200 ∪ watchlist unique) 의 OHLC + 상한가/하한가/시가총액을 `ka10001` 단일 종목 호출로 매분 갱신. trade_amount 는 `volume × close` 근사값 (트레이딩 시그널 용도). Direct VPC Egress + Cloud NAT static IP 1개로 worker(intraday-sync) + Cloud Run service(server) 가 동일 outbound IP 공유. **KIS ingestion(workers/ingestion + server/src/kis) 완전 폐기** — Phase 09.1 재정의 (2026-05-14, "KIS → 키움 완전 대체"). **Status:** ✅ Complete (Phase 09.1 — 2026-05-15)
- **DATA-03**: 종목 상세 페이지(`/stocks/[code]`) 상단에 해당 종목의 일봉 캔들 + Volume 차트(1M / 3M / 6M / 1Y 토글, 한국식 색상)를 표시하여 트레이더가 화면 전환 없이 가격 흐름을 즉시 파악할 수 있다 (Phase 09.2 — 2026-05-15 사용자 명시 OOS 반전).

### Theme

- [x] **THEME-01**: 테마별 종목 매핑 수집 — 네이버 금융 테마(산업/이벤트) + 알파스퀘어(정치인주/시사) 2-tier 소스를 일 1회 16:00 KST 배치로 수집, 콘텐츠 SHA256 해시 변경 감지, 한국 크롤링 운영 5원칙 준수. `themes` + `theme_stocks` 테이블(effective_from/to 이력, source/confidence, stocks FK) — Phase 10
- [ ] **THEME-02**: 테마 목록 페이지 + 테마별 종목 리스트 표시 — 웹앱 `/themes`(내 테마 상단 + 시스템 테마, 소속 종목 상위 3종목 평균 등락률 순 정렬), `/themes/[id]` 상세(scanner row 재사용), 종목 상세 `/stocks/[code]` 테마 칩. `stock_quotes` 활용 + 출처 표기 — Phase 10
- [ ] **THEME-03**: 유저 테마 CRUD — 로그인 유저가 본인 소유 테마 생성/편집/삭제 + 종목 add/remove, 시스템 테마 스냅샷 fork. per-user owner-only RLS (watchlist 모델 복제). 시스템 테마(read-only)와 별도 레이어로 분리 — Phase 10 (10-02: 데이터 모델 + owner-only RLS 5정책 + 50-limit trigger 토대 적용 / CRUD API+UI 는 10-05·10-07 대기 → In Progress)
- [x] **THEME-04**: AI 테마 보강 — Claude Haiku 4.5로 뉴스(`news_articles`) 기반 신규 시스템 테마 후보 발굴 + 종목↔테마 오분류 교정 (discussion-sync classify 패턴 재사용, 시스템 레이어) — Phase 10

## v2 Requirements

### Personalization

- **PERS-02**: 관심종목 기반 맞춤 뉴스 피드

### Notifications

- **NOTF-01**: 상한가 근접 종목 발생 시 알림
- **NOTF-02**: 관심종목 급등/급락 알림

### Expansion

- **EXPN-01**: 미국 주식 지원 (NYSE/NASDAQ)

## Out of Scope

| Feature | Reason |
|---------|--------|
| 주문/매매 기능 | 인허가 필요, 법적 리스크, 복잡도 |
| 포트폴리오 관리 | 인증 필요, v2 이후 |
| AI 자동매매 추천 | 법적/윤리적 리스크, 복잡도 |
| 모바일 앱 | 웹 우선, 반응형으로 대응 |
| 실시간 채팅/커뮤니티 | 핵심 가치와 무관, 복잡도 |
| PER/PBR 등 재무지표 스크리너 | v1 핵심이 아님, 향후 확장 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFR-01 | Phase 1 | Pending |
| INFR-02 | Phase 1 | Pending |
| INFR-03 | Phase 2 | Pending |
| DSGN-01 | Phase 3 | Pending |
| DSGN-02 | Phase 3 | Pending |
| DSGN-03 | Phase 3 | Pending |
| DSGN-04 | Phase 3 | Pending |
| DSGN-05 | Phase 3 | Pending |
| INFR-04 | Phase 4 | Done |
| SCAN-01 | Phase 5 | Complete |
| SCAN-02 | Phase 5 | Complete |
| SCAN-03 | Phase 5 | Complete |
| SCAN-04 | Phase 5 | Complete |
| SCAN-05 | Phase 5 | Complete |
| SCAN-06 | Phase 5 | Complete |
| SCAN-07 | Phase 5 | Complete |
| SCAN-08 | Phase 05.2 | Complete |
| SRCH-01 | Phase 6 | In Progress |
| SRCH-02 | Phase 6 | In Progress |
| SRCH-03 | Phase 6 | In Progress |
| AUTH-01 | Phase 6.2 | Deferred |
| AUTH-02 | Phase 6.2 | Partial (Google 완료, Kakao 별도) |
| PERS-01 | Phase 6.2 | Complete |
| NEWS-01 | Phase 7 | Complete |
| DISC-01 | Phase 8 | Complete |
| DISC-01.1 | Phase 08.1 | Complete |
| DATA-01 | Phase 9 | Complete |
| DATA-02 | Phase 09.1 | Complete |
| DATA-03 | Phase 09.2 | Complete |
| THEME-01 | Phase 10 | Complete |
| THEME-02 | Phase 10 | Pending |
| THEME-03 | Phase 10 | In Progress (10-02 데이터 모델+RLS 토대; CRUD API/UI 10-05·10-07 대기) |
| THEME-04 | Phase 10 | Complete |

**Coverage:**
- v1 requirements: 33 total (DISC-01.1 added in Phase 08.1; DATA-01 added 2026-05-10 with Phase 9 의미 교체; DATA-02 added 2026-05-13 with Phase 09.1 인서트; NEWS-02·DISC-02 removed 2026-06-08 구 Phase 10(AI Summarization) 삭제; 2026-06-08 SCAN-08 매핑 누락 보강 + 카운트 27→29 정합 정정; THEME-01·THEME-02 added 2026-06-08 with Phase 10(Theme Classification — 삭제된 구 Phase 10 번호 재사용) → 29→31; THEME-03(유저 CRUD)·THEME-04(AI 보강) added 2026-06-09 Phase 10 discuss-phase 스코프 확장 → 31→33)
- Mapped to phases: 33
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-06-09 — Phase 10 discuss-phase: THEME-03(유저 테마 CRUD)·THEME-04(AI 보강) 추가 (스코프 확장 — 시스템/유저 테마 분리 모델 + AI 테마 발굴). 커버리지 31→33. 10-02 data-model-migration 완료: THEME-03 Pending→In Progress (themes/theme_stocks + owner-only RLS + 50-limit trigger 토대 prod 적용; CRUD API/UI 는 10-05·10-07 대기). THEME-01 은 10-01 에서 Complete 표기 유지(스키마 토대; 실 수집 runtime 은 10-03·10-08 의존).*
