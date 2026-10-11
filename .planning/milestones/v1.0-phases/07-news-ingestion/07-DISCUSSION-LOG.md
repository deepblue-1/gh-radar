# Phase 7: News Ingestion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 07-news-ingestion
**Areas discussed:** 수집 트리거 전략, 수집 범위 & 검색 쿼리, 캐시 TTL & 저장 정책, UI 레이아웃 & 상태

---

## Gray Area 선택

| Option | Description | Selected |
|--------|-------------|----------|
| 수집 트리거 전략 | on-demand / 배치 / 하이브리드 — 25K/day 한도와 UX 응답속도 절충 | ✓ |
| 수집 범위 & 검색 쿼리 | 어떤 종목에 뉴스 표시 + Naver 검색 키워드 디자인 + sort + 개수 | ✓ |
| 캐시 TTL & 저장 정책 | DB upsert 여부 + TTL + 중복 처리 + cleanup | ✓ |
| UI 레이아웃 & 상태 | Card 배치, 항목 디자인, 로딩/빈/에러, 개수 | ✓ |

**User's choice:** 4개 모두 선택

---

## 수집 트리거 전략

### Q1. Naver Search API 호출 트리거를 어떻게 설계할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| On-demand only + DB 캐시 | 상세 진입 시 Express에서 Naver 호출 → news_articles upsert → 응답 | |
| 하이브리드 (watchlist 배치 + 일반 on-demand) | watchlist prefetch + 나머지 on-demand | |
| 배치만 (top_movers + watchlist 대상) | Cloud Run Job 주기적 수집. 마스터 전체 검색 시 뉴스 부재 | |
| **Other (사용자 제시)** | scanner 종목 + watchlist 종목에 대해 주기적 수집 + 종목 상세페이지에서 뉴스+토론방을 새로고침하여 직접 트리거 | ✓ |

**User's choice:** 배치(scanner top_movers + watchlist 합집합) + 상세 페이지의 뉴스/토론방 전용 수동 새로고침 조합
**Notes:** 3번째 옵션 + 명시적 수동 트리거 = 자동 on-demand 없음. 사용자가 원할 때만 즉시 갱신

### Q2. 배치 수집 주기는?

| Option | Description | Selected |
|--------|-------------|----------|
| **15분** | 장 7h × 4 tick = 28 tick × 200 종목 = ~5,600/day, 또는 24h × 4 = 96 tick × 200 = ~19,200/day | ✓ |
| 10분 | 신선도↑, ~8,400/day | |
| 30분 | ~2,800/day, 신선도↓ | |

**User's choice:** 15분

### Q3. 상세 페이지 '새로고침' 버튼이 뉴스를 어떻게 다룰까요?

| Option | Description | Selected |
|--------|-------------|----------|
| 기존 버튼 확장 (종목+뉴스 동시) | 1개 버튼으로 모두 | |
| 뉴스 Card 내부 별도 새로고침 | 섹션별 독립 액션 | |
| 수동 새로고침 없음 | 배치만 | |
| **Other (사용자 제시)** | 뉴스와 종목토론방만 갱신하는 버튼을 따로 두고싶어 | ✓ |

**User's choice:** 뉴스·토론방 전용 새로고침을 종목 시세 새로고침과 분리
**Notes:** Phase 7에서는 뉴스 Card 자체 버튼, Phase 8에서 토론방 Card에도 동일 패턴 확장 예정

### Q4. 배치 수집 대상 종목은?

| Option | Description | Selected |
|--------|-------------|----------|
| **scanner top_movers + 전체 watchlist 합집합** | 중복 제거, 외 종목은 수동만 | ✓ |
| scanner top_movers 전체만 | watchlist 제외 | |
| watchlist만 | scanner 제외 | |

**User's choice:** scanner top_movers + 전체 watchlist 합집합

### Q5. 배치 Scheduler 실행 시간대는?

| Option | Description | Selected |
|--------|-------------|----------|
| **24시간 15분마다** | 장외 뉴스 포함, ~19,200/day | ✓ |
| 평일 장 시간만 (09:00~15:59 KST) | ~5,600/day, 장외 뉴스 누락 | |
| 평일 06:00~20:00 KST | 확장 장 시간, ~11,200/day, 주말 뉴스 누락 | |

**User's choice:** 24시간 15분마다

---

## 수집 범위 & 검색 쿼리

### Q1. Naver Search 검색 쿼리를 어떻게 구성할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| **종목명만** (예: "삼성전자") | 네이버 금융 검색 행태 일치, 대부분 고유 | ✓ |
| 종목명 + "주식" | 노이즈 감소, 매칭 엄격 | |
| 종목명 + 종목코드 | 뉴스에 코드 거의 없음, 매칭 실패 위험 | |

**User's choice:** 종목명만

### Q2. 정렬(sort) + 배치당 수집개수(display)는?

| Option | Description | Selected |
|--------|-------------|----------|
| **date + 20개** | 최신순 20개, 트레이더 관점 + 여유 | ✓ |
| date + 10개 | 최신순 10개 | |
| sim + 20개 | 관련도순 — 오래된 기사 가능 | |

**User's choice:** date + 20개

### Q3. UI 표시 시 가장 오래된 뉴스는 어디까지 보여줄까요?

| Option | Description | Selected |
|--------|-------------|----------|
| **최근 7일** | 일단위 동향 포함, 그 이전은 UI 숨김 | ✓ |
| 최근 3일 | 즉각적, 빈약 가능 | |
| 제한 없음 (최신 20개) | 오래된 기사가 상위 노출 가능 | |

**User's choice:** 최근 7일

---

## 캐시 TTL & 저장 정책

### Q1. news_articles DB retention (오래된 뉴스 cleanup)은?

| Option | Description | Selected |
|--------|-------------|----------|
| 30일 후 삭제 (nightly job) | Supabase free tier 여유 확보 | |
| **90일 후 삭제** | 장기 보관 + 백테스트/기반 분석 가능 | ✓ |
| 무제한 저장 | cleanup 없음, 무한 증가 위험 | |

**User's choice:** 90일 후 삭제

### Q2. '새로고침' 버튼 연타 방어 (per-user rate limit)는?

| Option | Description | Selected |
|--------|-------------|----------|
| **종목당 쿨다운 30초 + 버튼 disabled** | 상세 진입해도 30초 내 요청 있으면 버튼 비활성 | ✓ |
| 없음 (사용자 신뢰) | 연타 허용, 25K 소진 위험 | |
| IP 기반 rate limit | 기존 미들웨어 재사용, 사용자 단위 아님 | |

**User's choice:** 종목당 쿨다운 30초 + 버튼 disabled

### Q3. Phase 9 (AI 요약) 대비로 content_hash를 언제 계산할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| **지금 계산해서 저장 (title+description)** | upsert 시 sha256 생성, Phase 9 재사용 | ✓ |
| Phase 9에서 계산 (연기) | 수집 범위 최소화, 추후 backfill | |

**User's choice:** 지금 계산해서 저장 (title+description)

---

## UI 레이아웃 & 상태

### Q1. 상세 페이지에서 '관련 뉴스' Card 레이아웃은?

| Option | Description | Selected |
|--------|-------------|----------|
| 기존 2열 grid 유지 | 2열(뉴스+토론방) 그대로, 왼쪽만 교체 | |
| **세로 2단 적층 (전체 폭)** | 뉴스 Card가 전체 폭, 토론방은 아래 | ✓ |
| 새 섹션 (다른 위치) | Stats grid 바로 밑 | |

**User's choice:** 세로 2단 적층 (전체 폭)

### Q2. 뉴스 항목 표시 내용은?

| Option | Description | Selected |
|--------|-------------|----------|
| 제목 + 출처 배지 + 상대시간 + 원문링크 | 정보 풍부, 트레이더 신선도 | |
| **제목 + 절대시간 (MM/DD HH:mm)** | 단순, 명확 | ✓ |
| 제목 + description 스니펫 | 정보량↑, 스크롤 부담↑ | |

**User's choice:** 제목 + 절대시간 (MM/DD HH:mm)
**Notes:** 출처는 v1 상세 카드에서 미표시, `/news` 전체 페이지에서는 노출 (Claude 재량)

### Q3. 표시개수 & '더보기'는?

| Option | Description | Selected |
|--------|-------------|----------|
| 상위 5개 + '더보기' 로 전체(최대 20) | 같은 페이지에서 expand | |
| **Other (사용자 제시)** | 상위 5개 + '더보기' 클릭 시 **전체 뉴스 목록 페이지로 이동** | ✓ |
| 전체 20개 펼쳐서 | 스크롤 등록, 페이지 길이↑ | |
| 상위 10개만 (더보기 없음) | 나머지 버림 | |

**User's choice:** 상위 5개 + 더보기 → 전체 뉴스 목록 페이지 (신규 route `/stocks/[code]/news`)

### Q4. 반응형(모바일) 전략 + 빈 상태 UX?

| Option | Description | Selected |
|--------|-------------|----------|
| **모바일 1열 + 빈 상태 안내 메시지** | 세로 스택 + "아직 수집된 뉴스가 없어요" 류 카피 | ✓ |
| 모바일에서도 지속 2열 | Card 좁음, 가독성↓ | |
| 일반 빈 메시지만 | "뉴스가 없습니다" 단순 | |

**User's choice:** 모바일 1열 + 빈 상태 안내 메시지

---

## Claude's Discretion

- 출처(source) 파싱 로직 (URL host 추출 vs 도메인 매핑)
- Naver API `title` HTML 태그 strip 구현 (sanitize-html vs 정규식)
- `pubDate` RFC 822 → ISO 변환 (date-fns-tz 재사용)
- Retention cleanup 실행 방식 (news-sync Job 훅 vs 독립 Scheduler)
- API 호출 카운터 저장소 (Upstash vs Supabase vs in-memory)
- `/news` 페이지 server/client 경계
- 에러/빈 상태 UX 카피 문구
- news-sync Job 내부 종목 병렬 fetch 동시성
- Dockerfile / deploy 스크립트 세부 (05.1/06.1 템플릿 복제)
- 단위/통합 테스트 커버리지

## Deferred Ideas

- AI 뉴스 요약 (NEWS-02) → Phase 9
- 토론방 수집 (DISC-01) → Phase 8 (섹션별 독립 새로고침 패턴 재사용)
- 뉴스 전체 페이지 페이지네이션 (20개 이상)
- 출처별/날짜별 필터링
- 뉴스 이미지 썸네일
- 공유 / 북마크
- 실시간 새 뉴스 푸시 (v2)
- 동명 회사 노이즈 완화 (sector 기반)
- 출처 표시 상세 Card 재도입 (피드백 이후)
- 뉴스 자유 키워드 검색
