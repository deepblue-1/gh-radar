# Phase 1: Data Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 01-data-foundation
**Areas discussed:** 프로젝트 구조, 종목 데이터 범위, Worker 실행 전략, Supabase 스키마

---

## 프로젝트 구조

### 패키지 매니저

| Option | Description | Selected |
|--------|-------------|----------|
| pnpm workspaces (추천) | 디스크 효율적, 네이티브 workspace 지원, Cloud Run 빌드 시 의존성 결합 용이 | ✓ |
| npm workspaces | 추가 설치 불필요, 단순함. 단, 쿼모나 lock 충돌 가능성 | |
| Turborepo + pnpm | 빌드 캐시와 태스크 오케스트레이션. 규모가 커지면 유리 | |

**User's choice:** pnpm workspaces

### 디렉토리 레이아웃

| Option | Description | Selected |
|--------|-------------|----------|
| apps/ + packages/ | apps/web, apps/server, apps/worker + packages/shared | |
| frontend/ + backend/ | 2분할 구조 | |
| 플랫 구조 | 루트에 src/web, src/server, src/worker | |
| (사용자 제안) webapp/ server/ workers/ | 역할을 명시적으로 드러낸 복수형 workers | ✓ |

**User's choice:** webapp/ server/ workers/ (사용자가 제안한 네이밍 채택)
**Notes:** "webapp, server, workers 는 어때?" — 각 단어가 역할을 더 명확히 드러낸다는 점에서 추천함.

### Worker 언어

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript (추천) | 언어 통일, packages/shared 타입 공유, 빠른 cold start | ✓ |
| Python | pykrx/python-kis 활용 가능하지만 실시간 데이터에는 부적합 | |

**User's choice:** TypeScript

### Worker 복수화

| Option | Description | Selected |
|--------|-------------|----------|
| worker/ (단수) | 단일 worker 전용 | |
| workers/ + ingestion/ 서브 폴더 (추천) | 미래 확장 공간 확보, 리네이밍 불필요 | ✓ |

**User's choice:** workers/ingestion/

---

## 종목 데이터 범위

### 필드 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 최소 세트 | 종목코드, 종목명, 마켓, 현재가, 전일대비, 등락률, 거래량, 갱신시각 | |
| 중간 세트 (추천) | 최소 + 시가/고가/저가, 시가총액, 상한가/하한가 | ✓ |
| 전체 세트 | 중간 + PER/PBR/EPS, 외국인 보유율, 투자자별 매수/매도 | |

**User's choice:** 중간 세트

### 보존 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 최신 스냅샷만 (추천) | stocks 테이블에 upsert, 과거 데이터 없음 | ✓ |
| 시계열 보존 | stock_snapshots 별도 테이블 타임스탬프 기록 | |

**User's choice:** 최신 스냅샷만

---

## Worker 실행 전략

### 폴링 주기

| Option | Description | Selected |
|--------|-------------|----------|
| 1분 간격 (추천) | REQUIREMENTS SCAN-07 명시, 하루 약 392회 실행 | ✓ |
| 30초 간격 | 더 빠른 갱신, 하루 약 780회. Cloud Run Job 비용 2배 | |
| 5분 간격 | 보수적, 하루 약 78회. 실시간 UX 미달 | |

**User's choice:** 1분 간격
**Notes:** 사용자가 "cloud run job과 cron에 대해 좀더 설명해줄래?" 질문 → Cloud Run Job vs Service 차이, Cloud Scheduler 역할을 설명한 뒤 확정.

### 장외/휴장일 동작

| Option | Description | Selected |
|--------|-------------|----------|
| Worker 실행 안 함 | Cloud Scheduler cron 자체를 장 시간에만 트리거 | |
| Worker 내부에서 판단 | cron은 항상 트리거, Worker 코드가 판단 후 exit | |
| 장외에도 1회 | 장종료 직후 1회 더 실행해 종가 스냅샷 확보 | ✓ |

**User's choice:** 장외에도 1회 (장종료 직후 종가 스냅샷용 15:35 1회 추가)

### 휴장일 감지 방식

| Option | Description | Selected |
|--------|-------------|----------|
| B. KIS 응답 기반 자동 감지 (추천) | KIS 응답이 비거나 갱신시각이 오늘이 아니면 skip | 초기 선택 |
| A. 하드코딩 JSON | KRX 공식 캘린더를 JSON에 저장, 연 1회 업데이트 | |
| C. 공공데이터 API + 보완 | 특일정보 API 기본, 근로자의날/연말만 하드코딩 추가 | |
| (사용자 요청) KIS 장운영 시간 조회 API 활용 | python-kis의 trading_hours()는 정규 장 시간만 반환, 휴장일 판단 불가능으로 확인됨 | 기각 |
| **KIS 응답의 영업일 필드 검사 (최종)** | 등락률 순위 응답의 bsop_date 필드가 오늘과 다르면 skip, Phase 1에서 실증 검증 | ✓ |

**User's choice:** KIS 응답의 영업일 필드 검사
**Notes:** 사용자가 KIS `장운영 시간 조회` API 활용 가능성을 질문했고, 웹 리서치로 해당 API가 정규 장 시간만 반환하고 휴장일 여부는 알려주지 않음이 확인됨. 대안으로 등락률 순위 API 응답의 영업일 필드를 검사하는 방식으로 결정.

### 에러 복구 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 지수 백오프 재시도 (추천) | 1→2→4초, 최대 3회. 그 후 다음 cron 사이클로 위임 | ✓ |
| 즉시 실패 처리 | 재시도 없이 exit | |
| 오류 알림 | Supabase error_log + 웹훅 알림 | |

**User's choice:** 지수 백오프 재시도

### 부분 실패 처리

| Option | Description | Selected |
|--------|-------------|----------|
| 멱등 트랜잭션 (추천) | 트랜잭션 없이 batch upsert, 다음 사이클에서 오버라이트 | ✓ |
| 전체 트랜잭션 | 모두 성공 또는 모두 롤백 | |

**User's choice:** 멱등 트랜잭션

---

## Supabase 스키마

### Phase 1 스키마 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 4개 테이블 전부 생성 (추천) | stocks는 풀 스키마, 나머지 3개는 스켈레톤 | ✓ |
| stocks만 데이터 넣음 | 4개 테이블 정의, stocks만 upsert | |
| stocks만 생성 | 나머지는 해당 Phase에서 마이그레이션 | |

**User's choice:** 4개 테이블 전부 생성

### RLS 정책

| Option | Description | Selected |
|--------|-------------|----------|
| 모든 테이블 RLS 활성화 + 공개 읽기 (추천) | public SELECT, service_role write only | 초기 선택 |
| RLS 비활성화 | anon 키 엄격 관리 필요 | |
| (사용자 발화) v1에도 인증 추가 | PROJECT.md와 충돌하는 스코프 변경 | 재확인 필요 |
| **A. RLS만 활성화, 로그인 없음 (최종)** | 원래 v1 스펙 유지, public SELECT + service_role write | ✓ |

**User's choice:** A. RLS만 활성화, 로그인 없음
**Notes:** 사용자가 "v1에도 인증을 넣어야겠다"라고 발화하여 3가지 해석(A: RLS만, B: 사용자 로그인 추가, C: 관리자 백오피스만 로그인)을 제시. 확인 결과 의도는 "RLS 활성화"였고 사용자 로그인은 v2로 유지.

### 마이그레이션 도구

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase CLI (추천) | supabase/migrations/ SQL 파일, supabase db push | ✓ |
| Supabase Dashboard SQL Editor | 웹에서 직접 실행, 버전 관리 불만족 | |

**User's choice:** Supabase CLI
**Notes:** 사용자가 "supabase mcp 가 설치되어있는데, mcp 혹은 cli 로 하면 될거 같아. ../weekly-wine-bot 에서 supabase를 잘 활용하고 있는지 확인해봐" → weekly-wine-bot 탐색 결과 CLI 기반 마이그레이션 패턴 확인, 동일 패턴 채택. MCP는 인터랙티브 탐색용 병행 사용.

---

## Claude's Discretion

Plan 단계에서 결정할 영역:
- 테이블 컬럼 타입(numeric precision 등)
- stocks 인덱스 전략
- Dockerfile 베이스 이미지
- 로깅 포맷
- 환경 변수 관리 방식
- KIS OAuth2 토큰 재사용 캐싱 전략

## Deferred Ideas

- 사용자 로그인 (AUTH-01/02): v2 유지
- 시계열 스냅샷 테이블: v2 이후
- Python 워커: 필요 시점에 추가
- BullMQ + Upstash Redis: Phase 9 검토
- 재무지표 필드 (PER/PBR/EPS): v2 이후 screener 기능과 함께
