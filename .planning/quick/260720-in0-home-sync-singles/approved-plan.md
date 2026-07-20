# home-sync 클러스터링에 네이버 테마 멤버십 힌트 추가 (곡물사료 singles 미묶임 해결)

## Context

2026-07-20 장중, 미래생명자원(218150)·고려산업(002140)·한탑(002680)이 모두 곡물/사료 재료로 급등했으나 홈 주도테마로 묶이지 않고 전부 singles로 표시됨. 실데이터 분석 결과:

- **클러스터링은 100% 뉴스 텍스트 기반** (D-04 anti-hallucination: reason은 입력 뉴스에만 근거, 애매하면 singles).
- Claude 입력 뉴스 상태: **한탑 0건**, **고려산업 2건(전부 무관 — 연봉/염색산단 기사)**, 미래생명자원만 "흑해 곡물선 피격" 특징주 기사 보유. 세 종목을 잇는 텍스트 신호가 전무 → 프롬프트 규칙대로 singles 처리 (버그 아님, 설계 한계).
- 사후 병합(reassignOrphans)은 "기존 테마의 뉴스/reason에 종목명 등장"이 조건인데 곡물 테마 자체가 생성되지 않아 발동 불가.
- **해결 데이터는 이미 있음**: theme-sync가 수집한 네이버 테마 `사료` = 정확히 이 3종목 (themes/theme_stocks 테이블). 추가 크롤링/API 불필요.

목표: 뉴스 공백 시에도 기존 네이버 테마 멤버십을 클러스터링 힌트로 활용해 동일 테마 동반 급등을 묶는다. anti-hallucination 원칙은 유지.

## 변경 설계

### 1. 테마 힌트 로더 — `workers/home-sync/src/pipeline/loadSurges.ts` (또는 신규 `loadThemeHints.ts`)

- 급등 종목 코드 집합에 대해 `theme_stocks`(code 청크 IN, 기존 `QUOTE_CHUNK` 패턴 재사용) → `themes`(id IN) 조인 로드.
- **급등 종목 2개 이상이 공유하는 테마만 유지** (노이즈 컷: 정치인 테마 등 단독 소속 테마 제외 + 토큰 절약).
- 반환 형태: `Map<themeName, string[]>` (테마명 → 소속 급등 종목 코드들). `Surge` 타입은 변경하지 않고 별도 인자로 전달 (기존 계약 최소 영향).

### 2. 프롬프트에 참고 분류 섹션 — `workers/home-sync/src/ai/prompt.ts`

- `formatClusterMessage(surges, themeHints)` — 유저 메시지 끝에 섹션 추가:
  ```
  참고 테마 분류 (네이버, 2개 이상 급등 종목이 공유하는 것만):
  - 사료: 002140 고려산업, 002680 한탑, 218150 미래생명자원
  ```
- `CLUSTER_SYSTEM_PROMPT` 규칙 추가 (기존 규칙 유지 + 아래):
  - "뉴스 근거가 부족해도, 참고 테마 분류에서 같은 테마에 속한 급등 종목 2개 이상은 그 테마로 묶을 수 있다. 이 경우 테마명은 참고 분류의 이름을 사용하고, reason에는 뉴스 근거가 없으면 '동일 테마 소속 동반 급등'임을 밝히며 사실을 지어내지 않는다. newsRefs는 실제 있는 인덱스만."
  - "참고 분류가 뉴스 서사와 충돌하면 뉴스를 우선한다."
- few-shot 1개 추가: 뉴스 없는 2종목 + 참고 분류 "사료" → 사료 테마로 묶는 예시 (곡물사료 케이스 재현).

### 3. 오케스트레이션 — `workers/home-sync/src/index.ts`, `ai/clusterSurges.ts`

- `runHomeSyncCycle`: loadSurges 후 테마 힌트 로드 → `cluster(surges, cfg, themeHints)` 전달.
- `clusterSurges` 시그니처에 `themeHints` 추가 (기본값 빈 Map — 기존 테스트 하위호환).
- content hash는 변경하지 않음 (테마 멤버십은 일 배치라 사실상 정적; 급등집합/뉴스 변화 시 재클러스터되는 기존 동작으로 충분).

### 4. 테스트

- `prompt.test.ts`: 힌트 섹션 포맷, 2종목 미만 공유 테마 미포함.
- `clusterSurges.test.ts`: 힌트 전달 경로 (모킹).
- `loadSurges` 힌트 로더: 청크/공유 필터 단위 테스트.
- 기존 65개 테스트 회귀 없음.

## 재사용하는 기존 자산

- `themes`/`theme_stocks` 테이블 (theme-sync 산출물, 이미 적재 중)
- `QUOTE_CHUNK` 청크 IN 패턴 (loadSurges.ts)
- `demoteInvalidThemes`/`reassignOrphans`/`sortThemes` — 무변경 (힌트로 만들어진 테마도 동일 검증 통과: stockCodes는 급등 집합 내로 제한 유지)

## 비용 영향

- Supabase 쿼리 +2/사이클 (theme_stocks, themes — 수 KB).
- Claude 입력 토큰 +약간 (공유 테마 라인 수 개). 호출 횟수 변화 없음.

## Verification

1. `pnpm -C workers/home-sync test` — 신규 + 기존 전부 통과.
2. 로컬 1회 실행 (`HOME_SYNC_*` env + 오늘 데이터): 사료 3종목이 하나의 테마로 묶이는지 스냅샷 payload 확인 — 단, 장 마감 후에는 stock_quotes 신선도 필터로 급등 0건일 수 있으므로, `clusterSurges`를 오늘 11:45 슬롯 입력 재현 fixture로 단위 검증하는 것을 기본으로 함.
3. 배포(deploy-home-sync.sh, 기존 스케줄 유지) 후 다음 거래일 장중 스냅샷에서 동일 케이스 확인 + `bash scripts/smoke-home-sync.sh`.

## 범위 외 (이번에 안 함)

- 특징주 뉴스 실시간 보강(급등 종목 on-demand Naver Search) — 별도 과제. 크롤링 5원칙 #3(on-demand 금지)과의 정합 검토 필요해 분리.
- 한탑처럼 흔들리는 임계(15%) 경계 종목의 테마 잔류(hysteresis) — 관찰 후 필요 시.
