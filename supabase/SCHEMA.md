# gh-radar Database Schema

## 테이블 관계도

```
stocks (PK: code)
  │
  ├──< news_articles (FK: stock_code → stocks.code)
  │       └──? summaries (FK: summary_id → summaries.id)
  │
  └──< discussions (FK: stock_code → stocks.code)

summaries (PK: id, UNIQUE: content_hash)

kis_tokens (PK: id = 'current', 단일 행)
```

## 테이블 상세

### stocks

| 컬럼 | 타입 | 설명 |
|------|------|------|
| code | text PK | 종목코드 (6자리) |
| name | text NOT NULL | 종목명 |
| market | text NOT NULL | 'KOSPI' \| 'KOSDAQ' |
| price | numeric(20,2) NOT NULL | 현재가 |
| change_amount | numeric(20,2) NOT NULL | 전일대비 |
| change_rate | numeric(8,4) NOT NULL | 등락률 (%) |
| volume | bigint NOT NULL DEFAULT 0 | 거래량 |
| open | numeric(20,2) | 시가 |
| high | numeric(20,2) | 고가 |
| low | numeric(20,2) | 저가 |
| market_cap | bigint | 시가총액 |
| upper_limit | numeric(20,2) NOT NULL | 상한가 |
| lower_limit | numeric(20,2) NOT NULL | 하한가 |
| updated_at | timestamptz NOT NULL DEFAULT now() | 갱신시각 |

**인덱스:**
- `idx_stocks_change_rate_desc` — change_rate DESC (Scanner 정렬)
- `idx_stocks_market` — market (마켓별 필터)

### news_articles

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK DEFAULT gen_random_uuid() | |
| stock_code | text NOT NULL FK → stocks.code | 종목코드 |
| title | text NOT NULL | 뉴스 제목 |
| source | text | 출처 |
| url | text NOT NULL | 원문 URL |
| published_at | timestamptz NOT NULL | 발행일 |
| content_hash | text | AI 요약 캐싱용 해시 |
| summary_id | uuid FK → summaries.id | 연결된 요약 |
| created_at | timestamptz NOT NULL DEFAULT now() | 생성일 |

**인덱스:** `idx_news_stock_published` — (stock_code, published_at DESC)
**UNIQUE:** (stock_code, url)

### discussions

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK DEFAULT gen_random_uuid() | |
| stock_code | text NOT NULL FK → stocks.code | 종목코드 |
| post_id | text NOT NULL | Naver 게시글 ID |
| title | text | 게시글 제목 |
| body | text | 게시글 본문 |
| author | text | 작성자 |
| posted_at | timestamptz | 게시 시각 |
| scraped_at | timestamptz NOT NULL DEFAULT now() | 스크래핑 시각 |

**인덱스:** `idx_discussions_stock_posted` — (stock_code, posted_at DESC)
**UNIQUE:** (stock_code, post_id)

### summaries

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK DEFAULT gen_random_uuid() | |
| content_hash | text NOT NULL UNIQUE | 캐싱 키 |
| summary_type | text NOT NULL | 'news' \| 'discussion' |
| summary_text | text NOT NULL | 요약 텍스트 |
| sentiment | jsonb | {positive, negative, neutral} |
| model | text NOT NULL | 사용 모델명 |
| input_tokens | int | 입력 토큰 수 |
| output_tokens | int | 출력 토큰 수 |
| created_at | timestamptz NOT NULL DEFAULT now() | 생성일 |

### kis_tokens

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK CHECK (id = 'current') | 단일 행 강제 |
| access_token | text NOT NULL | KIS 액세스 토큰 |
| token_type | text NOT NULL DEFAULT 'Bearer' | 토큰 타입 |
| expires_at | timestamptz NOT NULL | 만료 시각 |
| issued_at | timestamptz NOT NULL DEFAULT now() | 발급 시각 |

## RLS 현황

| 테이블 | RLS | anon SELECT | 비고 |
|--------|-----|-------------|------|
| stocks | ON | YES | 공개 읽기 |
| news_articles | ON | YES | 공개 읽기 |
| discussions | ON | YES | 공개 읽기 |
| summaries | ON | YES | 공개 읽기 |
| kis_tokens | ON | NO | service_role 전용 |

---
*스키마 버전: 2026-04-13*
*마이그레이션: `supabase/migrations/` 참조*
