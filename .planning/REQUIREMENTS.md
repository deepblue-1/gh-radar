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

- [ ] **SRCH-01**: 종목명 또는 종목코드로 검색
- [ ] **SRCH-02**: 검색 자동완성 드롭다운
- [ ] **SRCH-03**: 종목 상세 페이지 (현재가, 등락률, 거래량 등 상세 정보)

### News

- [ ] **NEWS-01**: 종목별 관련 뉴스 목록 표시 (Naver Search API 활용)
- [ ] **NEWS-02**: AI 뉴스 요약 생성 (Claude Haiku, content-hash 캐싱)

### Discussion

- [ ] **DISC-01**: 네이버 종목토론방 글 목록 표시 (on-demand 스크래핑, 5~10분 캐싱)
- [ ] **DISC-02**: AI 토론방 요약 + 긍/부정/중립 센티먼트 분석 (Claude Haiku)

### Infrastructure

- [x] **INFR-01**: KIS OpenAPI 연동 (실시간 시세 데이터, 등락률 순위 REST 폴링) — Phase 5.1 production 활성화(Cloud Run Job + Scheduler)
- [x] **INFR-02**: Supabase 데이터베이스 스키마 구축 (stocks, news_articles, discussions, summaries) — Phase 5.1 stocks 테이블 자동 upsert 파이프라인 가동
- [x] **INFR-03**: Express API 서버 구축 및 Cloud Run 배포 (min-instances=1)
- [x] **INFR-04**: Next.js 프론트엔드 구축 및 Vercel 배포

## v2 Requirements

### Authentication

- **AUTH-01**: 이메일/비밀번호 로그인
- **AUTH-02**: 소셜 로그인 (Google, Kakao)

### Personalization

- **PERS-01**: 관심종목 저장 및 관리
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
| 캔들스틱 차트 | TradingView/키움이 이미 지배, 차별화 없음 |
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
| SRCH-01 | Phase 6 | In Progress |
| SRCH-02 | Phase 6 | In Progress |
| SRCH-03 | Phase 6 | In Progress |
| NEWS-01 | Phase 7 | Pending |
| DISC-01 | Phase 8 | Pending |
| NEWS-02 | Phase 9 | Pending |
| DISC-02 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after roadmap creation — all 23 requirements mapped*
