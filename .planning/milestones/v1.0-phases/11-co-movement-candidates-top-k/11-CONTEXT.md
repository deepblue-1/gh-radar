# Phase 11: Co-movement Candidates — Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

종목 X가 급등/상한가일 때, 과거 일봉(`stock_daily_ohlcv`)의 통계적 동조를 기반으로 "X를 따라 오를 후보 종목 Y들"을 점수화해 종목 상세 페이지에 TOP-K로 표시한다. 테마(Phase 10)와는 다른 축의 신호. 이 phase는 **HOW를 구체화** — 새 capability 추가 아님.
</domain>

<decisions>
## Implementation Decisions

### A. 통계 단위 / 하이브리드 결합 — 둘 다 v1 (실측 기반 결정)
- **D-01:** v1은 **두 경로를 모두** 사전계산·병합한다.
  - (1) **테마-풀링 참여도** (정밀·설명 가능): 테마 "발화일"에 각 멤버의 동반율.
  - (2) **글로벌 co-surge 그래프** (테마-독립 recall): 페어가 ≥N회 동반급등한 엣지.
- **D-02:** 읽기 시 후보풀 = (앵커의 활성 테마 멤버) ∪ (앵커의 고동반 co-surge 이웃) → 병합·dedup·랭킹.
- **D-03:** 각 후보에 **근거 라벨** — 공유 테마 칩 AND/OR "직접동반 N회". 둘 다 해당이면 둘 다 표시.
- **근거 (read-only 실측 2026-06-10):** 강한 동조 376쌍(≥5 동반급등일/24m) 중 **41%가 테마 무관**; 둘 다 테마 보유한 쌍 중에서도 31%는 서로 다른 테마. 테마무관 쌍 mean Pearson ρ=0.36(최고 한국석유↔흥구석유 0.91, 광전자↔이노인스트루먼트 0.66). 테마 공유 lift 13배지만 recall은 ~60%(완전 X) → co-surge 경로가 나머지 41% 포착. 보너스: co-surge 그래프가 **테마없는 앵커(~11%)에도 이웃 제공** → 빈 상태 대폭 감소.

### B. 노출 기준 + 빈 상태 — 포괄 + 신뢰도 배지
- **D-04:** **노출 임계 완화** — 테마 발화일 ≥5, co-surge ≥3 (정확한 컷은 plan 튜닝). 더 많이 노출.
- **D-05:** 약한 후보는 **신뢰도·표본수 배지**로 구분(숨기지 않음).
- **D-06:** "동조 데이터 부족" 빈 상태는 **두 경로 모두 빌 때만** (테마없음 + co-surge 이웃도 없음).
- **주의 (별개 축):** 테마 점수 *계산 안정성*용 최소 발화일은 더 높게(예: ≥8) 둘 수 있음. *노출 임계*(≥5/≥3)와 *계산 임계*는 다른 축 — planner가 분리해 확정.

### C. 시차(D0/D+1) 표현 — 단일 리스트 + '후행형' 배지
- **D-07:** D0(당일 동반)·D+1(익일 후행) 둘 다 계산.
- **D-08:** UI는 **단일 TOP-K 리스트** + D+1 우세 후보에 **"후행형" 배지**. 정렬은 결합 점수. (그룹 분리 안 함 — v1 단순성.)

### D. 행 구성 + TOP-K + 메가캡 — 타이트니스 가중
- **D-09:** 후보 행 = 종목명/코드 · 실시간 등락률(`stock_quotes`) · 동반율(conf_d0) · 표본수(발화일/동반횟수) · 근거(공유테마 칩 또는 "직접동반 N회") · 후행형 배지 · 강도바.
- **D-10:** TOP-K 기본 **8** (더보기 확장). 강도바 = 결합 점수 기준, lift는 내부 디노이즈.
- **D-11:** 메가캡/다중테마 노이즈 → **테마 타이트니스 가중** (멤버 많은 헐렁한 대형 테마 기여↓, 작고 응집된 테마·강한 co-surge 엣지 우대). **하드컷·시총/유동성 필터 없음.** 메가캡은 ≥15% 급등이 드물어 co-surge 경로로는 자동 배제, 주 문제는 앵커일 때의 34테마 union → 가중으로 자연 해결.

### 점수 정의 (carry-forward, 확정)
- **D-12:** conf_d0(주, 동반율) + lift(기저 급등률 대비 디노이즈) + avg_ret(발화일 평균 수익률, 강도) + conf_d1(익일 후행율). lookback **24개월**.
- **D-13:** 이벤트 = `change_rate` 15~31% (>31 = 신규상장 등 아티팩트, 제외 — 실측 67건). 동반 바 = ≥10%. 시장 광역일(co-surge 종목 >100) 제외해 시장 전체 상승 노이즈 배제.
- **D-14:** production 점수는 **co-surge 빈도/lift** 사용 — Pearson ρ는 **미채택**(이번 디스커션에서 "진짜 동조냐" 검증용으로만 측정). 이유: "따라잡기"는 테일 동조(발화 시 동반 점프)지 평균 상관이 아니다. 실측에서도 ρ 낮지만(0.1~0.2) 발화일엔 반복 동반하는 쌍 다수.

### Claude's Discretion (planner/researcher 재량)
- `theme_comovement` + co-surge 엣지 테이블의 정확한 스키마·컬럼·PK·인덱스, SQL 계산 함수 구조, `(date, code) WHERE change_rate>=10` 부분 인덱스 정의.
- 타이트니스 가중 공식, 두 경로 결합 점수 가중치, 정확한 노출 컷(≥5/≥3 근처), co-surge 엣지 최소 횟수(≥3 노출 vs ≥5 강함).
- 배지/강도바 디자인 토큰, 더보기 페이지네이션, RPC vs Express 라우트 선택(themes.ts 선례 따름).

### Folded Todos
없음 (todo match 0건).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 이벤트 소스 (일봉)
- `supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql` — `stock_daily_ohlcv` 스키마 (PK (code,date); `change_rate` 사전계산 nullable; `idx_stock_daily_ohlcv_date_desc`). 이벤트 = `WHERE change_rate`.
- `supabase/migrations/20260512123000_widen_change_rate.sql` — `change_rate` numeric(10,4) (극단 아티팩트 대응 → >31 제외 근거).
- `workers/candle-sync/src/index.ts` — 워커 패턴(단일 entry→mode dispatch, service-role, chunked upsert). `co-movement-sync` 워커 복제 대상.
- `scripts/deploy-candle-sync.sh` — Cloud Run Job + Scheduler 배포 패턴(EOD 17:30 이후 야간 1회 스케줄 참고).

### 테마 (풀링·게이팅)
- `supabase/migrations/20260609120000_theme_tables.sql` — `themes`/`theme_stocks` (PK (theme_id,stock_code); `effective_to IS NULL`=active; `idx_theme_stocks_code` 역조회). 89% 커버리지·평균 21멤버.
- `server/src/routes/themes.ts` — 테마→멤버 조회 + `stock_quotes` 청크 조인 + **결과-행 페이지네이션** 패턴 (읽기 RPC 직접 참고).

### UI
- `webapp/src/components/stock/stock-detail-client.tsx` — 삽입 위치(`StockThemeChips` 다음).
- `webapp/src/components/theme/theme-rank-row.tsx` — 강도바+랭크 행 재사용.
- `webapp/src/components/theme/theme-chips.tsx` — 근거 칩 패턴.
- `webapp/src/styles/globals.css` — 색상 토큰(oklch). 동조 섹션은 차트 아님이라 토큰 직접 사용 가능(`chart-colors.ts` oklch 회피는 lightweight-charts 한정).

### 제약·교훈 (필독)
- `tasks/lessons.md` — **`.in()` URL 청크(414) + db-max-rows(1000) 결과-행 페이지네이션 둘 다** 필요(읽기 RPC가 테마 멤버 union·quotes 조인 시 직결). 프론트↔서버 `apiFetch<T>` 응답 계약(배열↔객체) 일치. 새 라우트는 server 재배포까지. 정량 주장은 실측.
- `CLAUDE.md` "Naver 5원칙" — co-movement은 **자체 DB 집계·외부 호출 없음 → 5원칙 무관**(명시만).

### Origin
- `tasks/co-movement-idea-prompt.md` — 원 아이디어 출발점.
- `.planning/ROADMAP.md` (Phase 11 entry) — 확정 스코프·실측 앵커.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `theme-rank-row.tsx`(강도바+랭크), `InfoStockCard`, `ScannerTable`/`ScannerCardList`(행/카드 렌더), `theme-chips.tsx`(근거 칩) — 동조 섹션 UI 직접 재사용.
- `server/src/routes/themes.ts`의 청크 IN + 결과-행 페이지네이션 헬퍼 — 읽기 RPC가 동일 문제(테마 멤버 union·quotes 조인) 직면.
- `workers/candle-sync` 구조 + `scripts/deploy-candle-sync.sh` — `co-movement-sync` 복제.
- `server/src/lib/computeTop3.ts` — 테마 통계 집계 패턴.

### Established Patterns
- 사전계산 테이블 + service-role 워커 + Cloud Run Job/Scheduler (candle-sync/theme-sync).
- 읽기: Express 라우트 + `apiFetch<T>`(계약 타입 일치 필수) 또는 직접 Supabase client(theme-chips 선례).
- 색상: globals.css oklch 토큰; lightweight-charts만 hex 변환.

### Integration Points
- `stock-detail-client.tsx` 섹션 마운트(ThemeChips 다음).
- 새 server 라우트 `/api/stocks/:code/co-movement` → **server 재배포 필요**(lessons: 새 라우트는 server 재배포까지 + prod curl 검증).
- 새 마이그레이션(`theme_comovement` + co-surge 엣지 + 부분 인덱스) → **[BLOCKING] supabase db push**.
- 새 워커 → deploy/IAM 스크립트 + Scheduler(candle-sync EOD 이후).
</code_context>

<specifics>
## Specific Ideas

- **실측 테마무관 동조 예시**(읽기 RPC/스코어 검증 fixture로 활용 가능): 한국석유↔흥구석유(ρ0.91, 석유 이름 바스켓), 광전자↔이노인스트루먼트(ρ0.66, 광통신 세부섹터), 휴림에이텍↔휴림로봇(그룹 계열사). 패턴 = 계열사 / 세부섹터 미태깅 / 이름·업종 바스켓.
- 동조 섹션 카피: "동조 후보" / 빈 상태 "동조 데이터 부족". 근거 노출 = "테마 발화 시 동반 X% · 근거 N일" + 공유 테마 칩 또는 "직접동반 N회".
</specifics>

<deferred>
## Deferred Ideas

- **co-surge → 테마 역발굴**: 강한 테마무관 동조 클러스터(휴림 그룹·광통신)는 잠재 테마. Phase 10 **THEME-04(AI 테마 보강)** 입력으로 피드백 (v2).
- **Pearson 기반 일반 상관 path**: production 미채택(co-surge 빈도 채택). 측정만 함.
- 페어 X→Y 정식 모델 / Granger lead-lag / 인트라데이 시차 (v2 — ROADMAP 기재).
- 동조 기반 알림(NOTF 계열, v2).

### Reviewed Todos (not folded)
없음 (todo match 0건).
</deferred>

---

*Phase: 11-co-movement-candidates-top-k*
*Context gathered: 2026-06-10*
