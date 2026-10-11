# Phase 12: 상한가 다음날 이력 통계 — Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

종목 자체의 과거 **마감상한가**(종가가 상한가 가격에서 굳은 날) 이벤트에 대해 "상한가 종가 매수 → 다음날 시초가 매도" 가정의 다음날 시/고/저/종 수익률을 일봉(`stock_daily_ohlcv`)으로 백테스트해, 종목 상세 페이지(`/stocks/[code]`)에 **읽기전용 카드**로 표시한다. 근거 데이터는 **종목 자체 이력만**(시장평균/shrinkage 미사용). 순수 KRX EOD 집계로 외부 호출이 없어 크롤링 5원칙과 무관. 사전계산은 신규 워커가 야간 1회 수행 → Supabase 저장 → 종목상세 읽기전용.

이 phase는 **HOW를 구체화** — 새 capability 추가 아님. 진입가정(A안)·표시안(C안)·종목자체이력·색상은 아이디어 디스커션 + HTML 목업 A/B/C 비교(2026-06-26)로 이미 확정. 이번 discuss는 STATE에 "plan-phase에서 확정"으로 남겨둔 **사전계산 스키마·이벤트 판별·표시 파라미터·배치 아키텍처**만 좁혀 잠갔다.
</domain>

<decisions>
## Implementation Decisions

### A. 상한가 이벤트 판별 — 결정값 가격 매칭(비율 임계 아님)
- **D-01:** 상한가 이벤트는 **change_rate 비율 임계가 아니라, 상한가 "가격"에 도달했는지로 판별**한다 (사용자 명시 정정). 상한가 가격은 정해진 결정값: **상한가 가격 = 전일 종가 × 1.30 을 KRX 호가단위(호가가격단위)로 정리**한 값. 일봉으로 재구성 가능.
- **D-02:** 도달 기준 = **마감상한가**, 즉 `close == 상한가가격`. (진입가정이 "상한가 종가 매수"이므로 종가가 상한가에서 굳은 날만 이벤트. 장중 고가 터치 후 밀려난 날은 제외 — 그날 종가 매수가 성립 안 함.) STATE "마감상한가 7회"와 동일.
- **D-03:** **점상한가(점상) 태그** = 이벤트 당일 `open == high == low == close == 상한가가격` (아침부터 상한가로 굳음, 강한 매수세). OHLC만으로 판별.
- **D-04:** lookback = **24개월** (Phase 11 co-movement·목업과 일관, 최근 시장 레짐 반영). 24개월 window라 KRX 호가단위 개편 이전 구간 혼입 없음 → **단일 호가단위 테이블**로 처리 가능.

### B. 핵심 지표 + 진입/청산 가정 (carry-forward, 확정)
- **D-05:** 진입가정 **A안** = 상한가 당일 **종가(=상한가)에 매수**. 핵심 지표 = **다음 영업일 시초가 수익률** = `(다음날 open − 이벤트일 close) / 이벤트일 close`.
- **D-06:** 이벤트별 표시 컬럼 = 다음날 **시/고/저/종** 수익률 4종 (모두 이벤트일 종가=상한가 기준). 고가 수익률은 과대평가라 참고용, 시초가가 주 지표.
- **D-07:** 추가 컬럼 = **거래대금**(이벤트일 `trade_amount`, 직접 사용 가능) + **회전율**. 회전율 = 이벤트일 `volume / stocks.listing_shares`. ⚠ `listing_shares`는 현재값이라 과거 이벤트일엔 근사(증자/감자 시 오차) — planner/researcher가 표기 또는 허용오차로 처리.

### C. 표시 — ② 데이터 대시보드 (2026-06-28 v2 목업 재확정)

> **표시 방향 재확정 (2026-06-28):** 목업 3안(`12-limit-up-mockup.html`: ① 신뢰도 게이지 / ② 데이터 대시보드 / ③ 이벤트 타임라인) 시각 비교 후 **②안 채택**(사용자 결정). 이전 "C안(히어로 큰 % + 분포 + 리스트 + 테마)" 프레이밍을 ②안 위계로 갱신. **데이터 결정값(D-05~D-07 지표, D-09 N≥3 게이팅, D-10 최근3회, D-13 색상, D-14 면책)은 그대로 carry-forward**, 바뀐 것은 **레이아웃·위계뿐**.
> **②안 레이아웃 (`12-limit-up-mockup.html` ② 섹션이 시각 기준):**
> - **상단 KPI 4칸 그리드** = ① 시초가 익절 `71% (5/7)` · ② 평균 시초가 `+2.8%` · ③ 최악 저가 `−7.1%` · ④ **분포 spark**(5버킷 미니 막대). 큰 단일 게이지/대형 %숫자 아님 — KPI 클러스터가 히어로.
> - **전체 OHLC 이벤트 표** = 상한가일 · 구분(점상/일반) · 시 · 고 · 저 · 종 · 거래대금 · 회전율 (D-12 컬럼 그대로, 오래된 건 faded, 길면 더보기).
> - **테마 풀링 = 가로 바**(`pool-bar`: 테마명 · 진행바 · 익절률% · `N=… 평균 ±x%`). 별도 카드 스택 아님 — 한 카드 안 가로 바 리스트(D-15~D-17 데이터 동일).
> - 색상/태그/면책/legend(점상 정의·회전율=거래량/상장주식수)는 ②안 목업대로.

- **D-08 (②안 갱신):** **히어로 = 상단 KPI 4칸 그리드**(시초가 익절 % + "M/N" · 평균 시초가 · 최악 저가 · 분포 spark). 큰 단일 %숫자 게이지가 아니라 KPI 클러스터로 표현. 서브 지표(최근 3회 승패)는 KPI 또는 표 상단 캡션에 배치(Claude 재량).
- **D-09:** **확률% 게이팅 = N≥3** (목업 7회는 표시; 표본 3회 미만이면 큰 % 숨기고 카운트만, 예 "2회 중 1회"). 가짜정밀도 회피. (STATE 초안 N≥5에서 **N≥3으로 완화** — 사용자 결정.)
- **D-10:** **"최근 N회" 보조스탯 N=3** ("최근 3회 2승 1패"). 감쇠공식 대신 최근 N회 + 최신순 정렬로 최근가중(가짜정밀도 회피).
- **D-11 (②안 갱신):** **분포** = 다음날 시초가 수익률 5버킷(−10\~−5 / −5\~0 / 0\~+5 / +5\~+10 / +10%+), 수익=빨강(`--up`)·손실=파랑(`--down`). ②안에서는 **KPI 그리드 4번째 칸의 compact spark 막대**로 표현(대형 히스토그램 대신). 풀 히스토그램으로 확장할지 spark로 둘지는 Claude 재량(목업 ②는 spark). 버킷 경계는 목업 기준.
- **D-12:** **이벤트 리스트** = 최신순. 컬럼 = 상한가일 · 구분(점상/일반) · 다음날 시·고·저·종 · 거래대금 · 회전율. 오래된 이벤트는 흐리게(faded). 길면 상위 N + "더보기".
- **D-13:** 색상 = 국내 관행 **수익=빨강 `--up` / 손실=파랑 `--down` / 보합=`--flat`**. globals.css oklch 토큰 직접 사용(차트 아님 → `chart-colors.ts` 변환 불필요).
- **D-14:** 하단 면책 = "표본 N회로 적음 / 과거 통계이며 미래 수익 보장 아님 / 출처 KRX".

### D. L2 — 소속 테마의 다음날 익절 경향 카드
- **D-15:** per-stock 백테스트와 **별도 축**의 보조 카드. 의미 = 이 종목이 속한 테마의 **멤버 종목 전체가 과거 마감상한가 갔을 때 다음날 시초가 익절률**(테마 풀링, 24개월).
- **D-16:** 데이터 = `theme_stocks`(Phase 10, `is_system=true`, `effective_to IS NULL` active 멤버) + 동일 상한가 백테스트 로직을 테마 멤버 풀로 집계. **신규 집계**(co-movement의 동조와는 다른 계산 — 단순 멤버 풀링 익절률).
- **D-17 (②안 표기 갱신):** 테마 선택/정렬 = **종목의 소속 시스템 테마 전부, 표본수 N(테마 풀 누적 상한가 이벤트 수) 내림차순**. 유저 테마 제외(개인화 노이즈). 많으면 상위 일부 + 더보기(Claude 재량). ②안 표기 = **가로 풀링 바**(`pool-bar`: 테마명 · 진행바(익절률 폭) · 익절률% · "N=… · 평균 ±x%"). 별도 카드 스택이 아닌 한 카드 내 가로 바 리스트.
- **D-18:** 이 카드는 AI 테마 중복제거(Phase 10 결과) 위에 얹는다 — 별도 테마 정규화 없음.

### E. 아키텍처 — Phase 11 co-movement 패턴 복제
- **D-19:** 사전계산 = **신규 thin 워커**(`co-movement-sync` 복제). 마이그레이션(`limit_up_*` 사전계산 테이블) → plpgsql `rebuild_*` RPC(TRUNCATE+INSERT, SECURITY DEFINER + search_path 격리) → 워커가 RPC 1줄 호출 → Cloud Run Job + Scheduler. **기존 master-sync 워커 확장 아님**(master-sync는 KRX 마스터 인제스트 성격이라 결합도/스케줄 성격 상이).
- **D-20:** 스케줄 = candle-sync EOD(17:30 KST) **이후 야간 1회**(다음날 OHLCV가 준비된 뒤 재계산). co-movement-sync와 동급.
- **D-21:** 종목상세 읽기 = **server 읽기 라우트**(`/api/stocks/:code/...`, comovement 라우트 미러, `{ ... }` 객체 반환·배열 아님) → 새 라우트는 **server 재배포 + prod curl 검증** 필요(lessons). 섹션 마운트 = `stock-detail-client.tsx`의 co-movement 섹션 인근.
- **D-22:** **on-demand fetch 금지** — 종목상세 진입이 원본 재계산을 트리거하면 안 됨. 워커가 미리 채운 사전계산 테이블만 읽음.

### 점수/표본 임계 (carry-forward)
- **D-23:** 단일 확률숫자 대신 **실제 상한가 이벤트 리스트가 히어로**. 확률%는 N≥3 보조. 시장평균 대비/shrinkage 미사용(종목 자체 이력만).

### Claude's Discretion (planner/researcher 재량)
- `limit_up_*` 사전계산 테이블의 정확한 스키마·컬럼·PK·인덱스(per-stock 통계 1행 + 이벤트 리스트 N행, 테마 풀링 1행 등 분할 방식). RPC 함수 구조·CTE.
- 히스토그램 버킷 경계·바 색상 임계, 이벤트 리스트 더보기 페이지네이션·faded 기준일 수.
- 회전율 근사 처리(현재 listing_shares 사용 명시 vs 생략), `change_rate` 컬럼 교차검증/폴백 사용 여부.
- 테마 카드 노출 개수·더보기, RPC vs server 라우트 세부(comovement 선례 따름).
- 빈 상태(상한가 이벤트 0회) 카피·레이아웃.

### Folded Todos
없음 (todo match 0건).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 아키텍처 템플릿 (Phase 11 co-movement — 1:1 복제 대상)
- `supabase/migrations/20260611120000_comovement_tables.sql` — 사전계산 테이블 + plpgsql `rebuild_comovement()` RPC(SECURITY DEFINER + search_path, TRUNCATE+INSERT, REVOKE anon/authenticated + GRANT service_role) + RLS(read TO anon, authenticated 둘 다) + `(date, code) WHERE change_rate>=10` 부분 인덱스. **신규 마이그레이션의 패턴 원본.**
- `workers/co-movement-sync/src/index.ts` + `src/config.ts` — RPC 1줄 호출 thin 워커. **신규 워커 복제 원본.**
- `workers/co-movement-sync/Dockerfile` — 2-stage 빌드(master-sync 동형).
- `server/src/routes/comovement.ts` — `GET /api/stocks/:code/co-movement`, mergeParams, `{ ... }` 객체 반환, 청크 IN + 결과-행 페이지네이션. **신규 읽기 라우트 미러.**
- `server/src/routes/stocks.ts` — 중첩 라우터 등록(`/:code` 이전 등록으로 shadowing 회피).
- `webapp/src/components/stock/stock-comovement-section.tsx` + `webapp/src/lib/comovement-api.ts` — 섹션 컴포넌트 + apiFetch 계약. **신규 섹션 미러.**
- `webapp/src/components/stock/stock-detail-client.tsx` — 섹션 마운트 위치.

### 이벤트 소스 (일봉) + 상한가 가격 계산
- `supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql` — `stock_daily_ohlcv` 스키마: PK(code,date), open/high/low/close numeric(20,2), volume/trade_amount bigint, `change_rate` nullable. **백테스트 소스(전일 종가 = LAG(close) over date).**
- `supabase/migrations/20260512123000_widen_change_rate.sql` — change_rate numeric(10,4) (참고).
- `supabase/migrations/20260415120000_split_stocks_master_quotes_movers.sql` — `stocks.listing_shares bigint`(KRX LIST_SHRS 상장주식수, 회전율 분모). ⚠ 현재값(과거 근사).
- **researcher 핵심 과제:** KRX **호가단위(호가가격단위) 테이블 + 상한가 가격 산출·반올림 규칙**(전일 종가 × 1.30 → 호가단위 절사) 확정. 24개월(2024-06\~2026-06)은 단일 호가단위 체제. 가격은 정수(원)라 `close == 상한가가격` 정확 비교 가능.

### 테마 풀링 (L2 카드)
- `supabase/migrations/20260609120000_theme_tables.sql` — `themes`/`theme_stocks`: PK(theme_id,stock_code), `is_system`, `effective_to IS NULL`=active, `idx_theme_stocks_code` 역조회. **L2 테마 멤버 풀 소스.**
- `supabase/migrations/20260610140000_retire_nonregular_theme_stocks.sql` — 비정규 멤버 정리(참고).

### 배포 패턴
- `scripts/deploy-candle-sync.sh` / co-movement-sync 배포 스크립트 — Cloud Run Job + Scheduler(EOD 이후 야간) + IAM(OAuth invoker, OIDC 금지) 패턴.

### 제약·교훈 (필독)
- `tasks/lessons.md` — `.in()` URL 청크(414) + db-max-rows(1000) 결과-행 페이지네이션, 프론트↔server `apiFetch<T>` 응답 계약(배열↔객체) 일치, 새 라우트는 server 재배포까지 + prod curl 검증, 정량 주장은 실측.
- `CLAUDE.md` "Naver 5원칙" — 본 phase는 **자체 DB·KRX EOD 집계, 외부 호출 없음 → 5원칙 무관**(명시만).
- Supabase 룰: RPC는 `REVOKE anon, authenticated` 명시 + `GRANT service_role`; 공개 read RLS는 `TO anon, authenticated` 둘 다.

### Origin
- `.planning/ROADMAP.md` (Phase 12 entry) — 확정 스코프.
- **`.planning/phases/12-a-n-master-sync/12-limit-up-mockup.html`** — v2 목업 ①②③, **②안(데이터 대시보드) 채택**(2026-06-28, 시각 스펙 원본). ②안 = KPI 4그리드(분포 spark 포함) + 전체 OHLC 표 + 테마 가로 풀링 바. 색상/태그/면책/legend 기준. **planner/executor는 이 파일 ② 섹션을 시각 기준으로 읽을 것.**
- (참고) `scratchpad/limit-up-nextday-mockup.html` (세션 971e8b2a) — 구 A/B/C 목업. ②안 채택으로 대체됨.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `workers/co-movement-sync/*` 전체 구조 + Dockerfile — 신규 `limit-up-sync`(가칭) 워커 복제.
- `supabase/migrations/20260611120000_comovement_tables.sql` — 사전계산 테이블 + RPC + RLS + REVOKE/GRANT + 부분 인덱스 패턴.
- `server/src/routes/comovement.ts` + `webapp/.../stock-comovement-section.tsx` + `lib/comovement-api.ts` — 읽기 라우트 + 섹션 + apiFetch 계약.
- `stock_daily_ohlcv`(~4M행, 2020\~) — 백테스트 소스. `stocks.listing_shares` — 회전율 분모.
- `theme_stocks`(active 멤버) — L2 테마 풀링.

### Established Patterns
- 사전계산 테이블 + service-role thin 워커 + Cloud Run Job/Scheduler(candle-sync/co-movement-sync/theme-sync).
- 읽기: Express 라우트 + `apiFetch<T>`(계약 타입 일치) 또는 직접 Supabase client.
- 색상: globals.css oklch 토큰; lightweight-charts만 hex 변환(본 섹션은 차트 아님 → 토큰 직접).
- SQL 윈도우 함수로 LAG(전일 종가)·LEAD(다음날 OHLC) 계산 후 집계(RPC 내부).

### Integration Points
- `stock-detail-client.tsx` 섹션 마운트(co-movement 섹션 인근).
- 새 server 라우트 `/api/stocks/:code/...` → **server 재배포 필요** + prod curl 검증.
- 새 마이그레이션(`limit_up_*` 테이블 + RPC) → **[BLOCKING] supabase db push**.
- 새 워커 → deploy/IAM 스크립트 + Scheduler(candle-sync EOD 이후).
</code_context>

<specifics>
## Specific Ideas

- **목업 C안**(scratchpad/limit-up-nextday-mockup.html)이 시각 기준: 히어로 큰 71% + "과거 7회 중 5회" + 서브라인(평균 시초가 +2.8% · 최악 저가 −7.1% · 최근 3회 2승1패) + 5버킷 히스토그램 + 이벤트 테이블(시·고·저·종 + 거래대금 + 회전율 + 점상/일반 태그, 오래된 건 faded) + 테마 카드 3종(HBM 62% N=85 등).
- 점상 태그 시각: `tag-jeom`(--up-bg/--up). 일반: `tag-norm`(muted).
- 회전율 = 거래량 / 상장주식수 (목업 legend 명시).
- 카피: "상한가 다음날 이력" / "상한가 종가 매수 → 다음날 시초가 매도 시" / 빈/적은표본 면책 "표본 N회로 적음. 과거 통계이며 미래 수익을 보장하지 않습니다."
</specifics>

<deferred>
## Deferred Ideas

- **상한가 잠긴 시각 / 매수잔량(굳은 강도)** — EOD 일봉으로 불가(인트라데이 필요, KIS 실시간). v2 (ROADMAP 기재).
- **시장평균 대비 / shrinkage / 베이지안 보정** — v1 미채택(종목 자체 이력만, 사용자 결정). 표본 적은 종목의 신뢰구간은 v2 검토 여지.
- **고가 기반 익절(과대평가)** — 표시는 하되 핵심지표 아님. 정식 청산모델은 v2.
- **장중 터치(고가==상한가)이나 종가 미달 이벤트** — v1 제외(종가 매수 가정 불성립). 별도 "장중 상한가 터치 빈도" 지표는 v2 여지.

### Reviewed Todos (not folded)
없음 (todo match 0건).
</deferred>

---

*Phase: 12-a-n-master-sync*
*Context gathered: 2026-06-26*
