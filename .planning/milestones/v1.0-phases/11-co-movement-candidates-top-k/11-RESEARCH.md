# Phase 11: Co-movement Candidates — Research

**Researched:** 2026-06-11
**Domain:** Postgres 사전계산(통계 집계 SQL) + Cloud Run Job 워커 + Express 읽기 라우트 + 종목상세 UI 섹션
**Confidence:** HIGH (핵심 수치 전부 read-only 실측 / 모든 권고가 코드 선례 위에 얹힘)

이 RESEARCH 는 새 라이브러리·기술 도입이 아니라 **이미 production 에서 돌고 있는 패턴**(candle-sync 워커 / theme_tables 마이그레이션 / intraday RPC / themes.ts 읽기 라우트 / theme-rank-row UI)을 co-movement 도메인에 복제·확장하는 HOW 구체화다. 따라서 "Standard Stack" 은 외부 생태계가 아니라 **이 저장소의 확정된 내부 선례**를 가리킨다.

<user_constraints>
## User Constraints (from 11-CONTEXT.md)

### Locked Decisions
- **D-01:** v1 은 **두 경로를 모두** 사전계산·병합. (1) 테마-풀링 참여도(정밀·설명가능): 테마 "발화일"에 각 멤버 동반율. (2) 글로벌 co-surge 그래프(테마-독립 recall): 페어가 ≥N회 동반급등한 엣지.
- **D-02:** 읽기 시 후보풀 = (앵커의 활성 테마 멤버) ∪ (앵커의 고동반 co-surge 이웃) → 병합·dedup·랭킹.
- **D-03:** 각 후보에 근거 라벨 — 공유 테마 칩 AND/OR "직접동반 N회". 둘 다 해당이면 둘 다 표시.
- **D-04:** 노출 임계 완화 — 테마 발화일 ≥5, co-surge ≥3 (정확한 컷은 plan 튜닝).
- **D-05:** 약한 후보는 신뢰도·표본수 배지로 구분(숨기지 않음).
- **D-06:** "동조 데이터 부족" 빈 상태는 **두 경로 모두 빌 때만**.
- **D-07:** D0(당일 동반)·D+1(익일 후행) 둘 다 계산.
- **D-08:** UI 는 단일 TOP-K 리스트 + D+1 우세 후보에 "후행형" 배지. 정렬은 결합 점수.
- **D-09:** 후보 행 = 종목명/코드 · 실시간 등락률(stock_quotes) · 동반율(conf_d0) · 표본수 · 근거 · 후행형 배지 · 강도바.
- **D-10:** TOP-K 기본 8 (UI-SPEC 사용자 수정으로 **초기 렌더 3 + 더보기**로 갱신). 강도바 = 결합 점수 기준, lift 는 내부 디노이즈.
- **D-11:** 메가캡/다중테마 노이즈 → 테마 타이트니스 가중. 하드컷·시총/유동성 필터 없음.
- **D-12:** 점수 = conf_d0(주) + lift + avg_ret + conf_d1. lookback **24개월**.
- **D-13:** 이벤트 = `change_rate` 15~31% (>31 제외). 동반 바 = ≥10%. 시장 광역일(co-surge 종목 >100) 제외.
- **D-14:** production 점수는 **co-surge 빈도/lift** 사용 — Pearson ρ 미채택(검증용으로만 측정).

### Claude's Discretion (이 RESEARCH 가 채우는 영역)
- `theme_comovement` + co-surge 엣지 테이블의 정확한 스키마·컬럼·PK·인덱스, SQL 계산 함수 구조, `(date, code) WHERE change_rate>=10` 부분 인덱스 정의.
- 타이트니스 가중 공식, 두 경로 결합 점수 가중치, 정확한 노출 컷(≥5/≥3 근처), co-surge 엣지 최소 횟수(≥3 노출 vs ≥5 강함).
- 배지/강도바 디자인 토큰, 더보기 페이지네이션, RPC vs Express 라우트 선택(themes.ts 선례 따름).

### Deferred Ideas (OUT OF SCOPE)
- **co-surge → 테마 역발굴**: 강한 테마무관 동조 클러스터를 Phase 10 THEME-04 입력으로 (v2).
- **Pearson 기반 일반 상관 path**: production 미채택(co-surge 빈도 채택). 측정만 함.
- 페어 X→Y 정식 모델 / Granger lead-lag / 인트라데이 시차 (v2).
- 동조 기반 알림(NOTF 계열, v2).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COMV-01 (신규) | 종목 X 급등 시 일봉 통계적 동조로 "따라 오를 후보 Y" 점수화 → 종목상세 TOP-K 표시. 두 경로(테마-풀링 + co-surge) 사전계산·병합. | §스키마(theme_comovement + cosurge_edges) · §SQL 사전계산(발화일 도출 + conf/lift/avg_ret + self-join) · §읽기 경로(Express 라우트 union 집계) · §UI(theme-rank-row 적응). 5개 성공기준 전부 §Validation Architecture 에 검증 신호 매핑. |

> REQUIREMENTS.md 등록은 plan 단계(현재 COMV 계열 미등록). v1 33개 + COMV-01 → 34개 예상.
</phase_requirements>

## Summary

co-movement 은 **이벤트가 희소한 영역**이다 — 실측상 24개월 lookback 에서 이벤트(change_rate 15~31%)는 전체 4.07M 일봉 중 **9,713행(0.24%)**, 동반 바(≥10%)는 **20,988행(487 거래일)** 에 불과하다. 이 작은 부분집합 위에서 (1) 테마 발화일 기반 멤버 동반율, (2) 글로벌 co-surge 페어 그래프 두 신호를 **전부 Postgres SQL 함수로 사전계산**한 뒤 `theme_comovement` + `cosurge_edges` 두 테이블에 적재한다. 읽기 시점에는 앵커의 활성 테마 멤버 union 과 co-surge 이웃을 합쳐 TOP-K 로 랭킹한다.

핵심 비용 검증: co-surge self-join 은 날짜별 동반 종목으로 그룹핑한 intra-day 페어 생성이다. 광역일(>100종목, 18일=3.7%)을 제외하면 총 페어 비교가 **992K → 394K(60% 감소)** 로 떨어진다 — Postgres 가 수 초 안에 처리하는 규모다(노드로 행을 끌어오면 OOM·네트워크 비용이지만, SQL 내부 집계는 가볍다). 읽기 경로 후보풀은 타이트 앵커(한국석유, 2테마)에서 36종목, 메가캡 앵커(삼성전자, 35테마)에서 624종목으로, 모두 PostgREST db-max-rows(1000) 미만이라 themes.ts 의 청크 IN 패턴(페이지네이션 불요) 으로 충분하다.

**Primary recommendation:** candle-sync 워커 구조를 1:1 복제한 얇은 `co-movement-sync` 워커가 **SECURITY DEFINER plpgsql 함수 1개(`rebuild_comovement()`)를 RPC 호출**해 두 테이블을 full-rebuild(TRUNCATE + INSERT-SELECT) 하고, EOD candle-sync 이후 야간 1회 Scheduler 로 트리거한다. 읽기는 themes.ts 와 동형의 **Express 라우트 `GET /api/stocks/:code/co-movement`**(RPC 아님 — themes.ts 선례 + apiFetch<T> 계약 일치 + 멀티스텝 집계 가독성). 점수는 `0.5·conf_d0 + 0.2·norm(lift) + 0.2·avg_ret_norm + 0.1·conf_d1` 결합, 타이트니스는 테마 기여를 `1/sqrt(member_count)` 로 down-weight.

## Standard Stack (이 저장소의 확정 선례)

이 phase 는 외부 라이브러리를 새로 도입하지 않는다. 아래는 복제·확장할 **내부 선례**다.

### Core
| 선례 | 위치 | 용도 | 왜 이걸 쓰나 |
|------|------|------|--------------|
| candle-sync 워커 | `workers/candle-sync/src/index.ts` | 단일 entry→mode dispatch, service-role, CLI 진입 가드 | [VERIFIED: 코드] production 야간 배치 검증됨. `co-movement-sync` 가 1:1 복제 대상 |
| intraday RPC | `supabase/migrations/20260514120200_intraday_upsert_close_rpc.sql` | plpgsql 함수 + `jsonb_array_elements` 루프 + SECURITY DEFINER + REVOKE 3줄 | [VERIFIED: 코드] service_role 만 EXECUTE, REVOKE 규약 확립. 사전계산 함수가 이 권한 패턴 승계 |
| theme_tables 마이그레이션 | `supabase/migrations/20260609120000_theme_tables.sql` | 사전계산 테이블 + 부분 인덱스 + RLS(TO anon, authenticated) | [VERIFIED: 코드] `theme_comovement` 가 동일 톤(BEGIN/COMMIT · 부분 인덱스 · RLS) 따름 |
| themes.ts 읽기 라우트 | `server/src/routes/themes.ts` | 멤버 union → stock_quotes 청크 IN 조인 → 메모리 집계 → 정렬 | [VERIFIED: 코드] `.in()` 청크(414) + `.range()` 결과-행 페이지네이션(db-max-rows 1000) 둘 다 구현. 읽기 라우트 직접 복제 |
| deploy-candle-sync.sh | `scripts/deploy-candle-sync.sh` | Cloud Run Job + Scheduler OAuth invoker(OIDC 금지) | [VERIFIED: 코드] EOD 17:30 cron 패턴. co-movement Scheduler 가 이후 시각으로 복제 |

### Supporting
| 선례 | 위치 | 용도 | 언제 |
|------|------|------|------|
| computeTop3.ts | `server/src/lib/computeTop3.ts` | 순수 함수 통계 집계(NaN 가드 + 상위N 평균) | 읽기 라우트의 결합 점수·랭킹 계산을 순수 함수로 분리할 때 |
| theme.ts mapper | `server/src/mappers/theme.ts` | snake_case row → camelCase 계약 + unknown 값 폴백 | co-movement row → `CoMovementCandidate` 매핑 |
| shared theme.ts | `packages/shared/src/theme.ts` | webapp·server 공유 camelCase 타입 + 런타임 sentinel | `CoMovementCandidate` / `CoMovementEvidence` 응답 타입 정의 (계약 드리프트 방지, lessons) |
| theme-rank-row.tsx | `webapp/src/components/theme/theme-rank-row.tsx` | 강도바(`barPct`) + Link + double-ring focus | 후보 행 카드의 `.underbar` 강도 라인 + 행 전체 Link |
| theme-chips.tsx | `webapp/src/components/theme/theme-chips.tsx` | 근거 칩(outline + dot) + Supabase 직접 fetch + quiet fallback | 공유 테마 칩 + 에러 시 섹션 숨김 |

### Alternatives Considered
| 표준 선택 | 대안 | 트레이드오프 |
|-----------|------|--------------|
| 읽기 = Express 라우트(themes.ts) | 읽기 = Postgres RPC 함수 | §7 참조. 후보풀 ≤624행이라 RPC 의 "DB 내부 조인" 이점이 작고, themes.ts 가 이미 청크 IN + 페이지네이션 + stock_quotes 조인 + 메모리 집계를 검증했으며 apiFetch<T> 계약 일치(lessons: 응답 계약 드리프트)가 쉬움 → **Express 채택** |
| 사전계산 = plpgsql 함수(`rebuild_comovement()`) | 사전계산 = 워커가 노드로 이벤트 행을 끌어와 JS 집계 | 노드 JS 집계는 20,988행 fetch + self-join 메모리(394K 페어)를 노드에 올림 → STATE.md 의 "노드로 행 끌어오기 금지(OOM·네트워크)" 원칙 위배. **plpgsql 채택** |
| full-rebuild(TRUNCATE+INSERT-SELECT) | 증분(어제 발화일만 추가) | 24m sliding window 라 매일 가장 오래된 날이 빠지고 새 날이 들어옴 → 증분은 만료 처리가 복잡. 9,713행 규모면 full-rebuild 가 수 초 → **full-rebuild 채택** (candle-sync daily 와 달리 멱등 전체 재구성) |
| co-surge 방향성 무시(무향 엣지, code_a<code_b) | 방향성 엣지(X→Y, Y→X 분리) | v1 은 "같은 날 동반"(D0) 이라 본질적으로 대칭. D+1 후행은 **테마-풀링 경로의 conf_d1** 로 표현(페어 방향성 아님). 방향성 페어는 v2 deferred(Granger). **무향 채택** |

**설치:** 신규 npm 패키지 없음. 워커는 `@supabase/supabase-js`(이미 워커 node_modules 존재) 만 사용.

**Version verification:** 신규 외부 의존성 없음 — 버전 확인 대상 없음. [VERIFIED: workers/candle-sync 기존 의존성 재사용]

## Architecture Patterns

### 권장 구성 (5개 산출물, CONTEXT 성공기준 정렬)
```
supabase/migrations/
└── 2026XXXX_comovement_tables.sql   # theme_comovement + cosurge_edges + 부분인덱스 + rebuild_comovement() RPC
workers/co-movement-sync/            # candle-sync 1:1 복제 (얇음 — RPC 호출만)
├── src/index.ts                     #   단일 entry, mode 불필요(단일 cycle) 또는 MODE=rebuild
├── src/config.ts                    #   SUPABASE_URL + SERVICE_ROLE_KEY + LOOKBACK_MONTHS=24
├── src/services/supabase.ts         #   createClient(url, serviceRoleKey)
└── src/rebuild.ts                   #   supabase.rpc('rebuild_comovement', {...}) 호출 + 결과 로깅
server/src/routes/stocks.ts          # stocksRouter.get('/:code/co-movement') 추가 (중첩 라우터 또는 직접)
server/src/lib/computeComovement.ts  # 순수 함수: 두 경로 병합·dedup·결합점수·랭킹·후행판정
server/src/mappers/comovement.ts     # row → CoMovementCandidate
packages/shared/src/comovement.ts    # CoMovementCandidate / CoMovementEvidence 공유 타입
webapp/src/components/stock/stock-comovement-section.tsx  # UI (theme-rank-row + theme-chips 적응)
scripts/{setup-comovement-sync-iam,deploy-comovement-sync,smoke-comovement-sync}.sh
```

### Pattern 1: full-rebuild plpgsql 함수 (단일 RPC, SECURITY DEFINER)
**What:** 워커가 `rebuild_comovement()` 1개를 호출하면 함수 내부에서 TRUNCATE → 발화일 CTE → 멤버 통계 INSERT → co-surge self-join INSERT 를 순차 수행. 노드는 행을 한 줄도 받지 않는다(결과 카운트만).
**When to use:** 이벤트 부분집합이 작고(2만 행) sliding window 라 full-rebuild 가 증분보다 단순할 때.
**Example:**
```sql
-- Source: intraday RPC 권한 패턴(20260514120200) + theme_tables 톤 승계
CREATE OR REPLACE FUNCTION public.rebuild_comovement(
  p_lookback_months int DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp   -- WR-D-03 규약(triggers_followup)
AS $$
DECLARE
  v_since date := (current_date - (p_lookback_months || ' months')::interval)::date;
  v_theme_rows int;
  v_edge_rows  int;
BEGIN
  -- 1. 발화일 도출 + 멤버 통계 → theme_comovement (Pattern 2)
  TRUNCATE theme_comovement;
  -- (INSERT ... SELECT, 아래 §SQL 사전계산 §2(a)(b))
  GET DIAGNOSTICS v_theme_rows = ROW_COUNT;

  -- 2. co-surge 엣지 → cosurge_edges (Pattern 3, 광역일 제외)
  TRUNCATE cosurge_edges;
  -- (INSERT ... SELECT, 아래 §SQL 사전계산 §2(c)(d))
  GET DIAGNOSTICS v_edge_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'lookback_since', v_since,
    'theme_comovement_rows', v_theme_rows,
    'cosurge_edge_rows', v_edge_rows,
    'rebuilt_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rebuild_comovement(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rebuild_comovement(int) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rebuild_comovement(int) TO service_role;
```

### Pattern 2: 읽기 = themes.ts 청크 IN + stock_quotes 조인 + 메모리 집계
**What:** 앵커의 활성 테마 → 멤버 union(`theme_comovement` 직접) + co-surge 이웃(`cosurge_edges` 양방향 조회) → 종목 code 합집합 → stock_quotes 청크 IN(실시간 등락률) → 결합점수 랭킹 → TOP-K.
**When to use:** 후보풀이 가변(36~624)이고 stock_quotes 실시간 조인이 필요할 때.
**Example:** themes.ts 의 `fetchQuotesChunked`(QUOTE_CHUNK=200) 를 **그대로 재사용**. theme_comovement/cosurge_edges 는 앵커당 행이 작아(≤624) `.eq()`/`.in()` 단순 조회로 충분하나, **방어적으로 `.range()` 페이지네이션 포함**(lessons: db-max-rows 1000 — 메가캡 624는 미달이지만 안전마진).

### Anti-Patterns to Avoid
- **노드 JS self-join:** 20,988 동반바를 노드로 fetch 해 페어 생성 금지(394K 페어 메모리 + 네트워크). SQL 내부 GROUP BY date 로 처리. [근거: STATE.md Phase 11 entry]
- **읽기 시 on-demand 계산:** 사용자 클릭 시 발화일/co-surge 를 즉석 계산 금지 — 반드시 사전계산 테이블만 읽음(themes.ts 가 top3 를 실시간 계산하는 것과 달리, co-movement 통계는 무겁고 변동이 일봉 단위라 야간 배치 캐시). [근거: D-02 "읽기 시 후보풀 = 사전계산 union"]
- **`error` 무시:** stock_quotes 조인 `error` 를 빈 결과로 흘리면 등락률 전부 0 → 정렬 silent 깨짐. throw 필수. [근거: lessons 37afcde]
- **응답 shape 드리프트:** webapp `apiFetch<CoMovementResponse>` 와 server `res.json` 인자 타입 불일치 금지(배열↔객체). shared 타입 공유. [근거: lessons 2026-06-10 계약 드리프트]
- **Naver 5원칙 오적용:** co-movement 은 자체 DB 집계라 외부 호출 0 → 5원칙 무관(명시만). [근거: CONTEXT canonical_refs]

## Don't Hand-Roll

| 문제 | 직접 만들지 말 것 | 대신 사용 | 왜 |
|------|------------------|-----------|-----|
| `.in()` 대량 조회 URL 한계(414) | 단일 거대 `.in(codes)` | themes.ts `fetchQuotesChunked`(QUOTE_CHUNK=200) 복제 | 강세장 codes 폭증 시 통째 실패 회귀 [VERIFIED: lessons 37afcde] |
| 결과-행 절단(db-max-rows 1000) | 청크만 하고 끝 | `.range(from, from+1000-1)` advance-by-actual 페이지네이션 | 청크와 별개 축 — 한 청크가 1000행 넘으면 잘림 [VERIFIED: lessons 2026-06-10] |
| RPC 권한(anon auto-grant) | GRANT 만 | REVOKE FROM PUBLIC + REVOKE anon,authenticated + GRANT service_role 3줄 | 플랫폼 auto-grant 가 덮어씀 [VERIFIED: MEMORY feedback_supabase_rpc_revoke] |
| 신규 테이블 RLS | TO anon 만 | TO anon, authenticated 둘 다 | 로그인 사용자 default-deny 빈응답 [VERIFIED: MEMORY feedback_supabase_rls_authenticated] |
| Scheduler→Job 인증 | OIDC | `--oauth-service-account-email` | OIDC 금지 lesson [VERIFIED: deploy-candle-sync.sh] |
| 강도바 폭 계산 | 새 식 | theme-rank-row `Math.max(4, Math.min(100, x*100))` | 검증된 barPct 식 [VERIFIED: 코드] |

**Key insight:** 이 phase 의 거의 모든 "어려운 부분"(청크/페이지네이션/RPC권한/RLS/배포인증)은 이미 Phase 9·9.1·10 에서 한 번씩 회귀로 터지고 lessons 에 박제됐다. 새로 발명할 게 없고, **선례를 정확히 복제하는 것이 곧 회귀 방지**다.

## Runtime State Inventory

> 이 phase 는 신규 테이블/워커/라우트 **추가**이지 rename/refactor 가 아니다. 기존 식별자를 바꾸지 않으므로 런타임 상태 마이그레이션은 최소. 그래도 "추가가 기존 런타임에 닿는 지점"을 명시.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 신규 테이블 `theme_comovement` + `cosurge_edges` 만 추가. 기존 데이터 변경 0. 읽기 소스 `stock_daily_ohlcv`(4.07M, 무변경) · `theme_stocks`(7,492 active, 무변경) · `stock_quotes`(읽기 조인, 무변경) | 신규 마이그레이션 [BLOCKING] db push. 기존 데이터 마이그레이션 없음 |
| Live service config | 신규 Cloud Run Job `gh-radar-comovement-sync` + Scheduler 1개. 기존 candle-sync/theme-sync/intraday-sync Job·Scheduler 무변경 | setup-iam + deploy 스크립트 신규. 기존 GCP 리소스 미변경 |
| OS-registered state | 없음 — 신규 Scheduler cron 등록만(GCP), OS 레벨 task 없음 | None — verified by deploy-candle-sync.sh 패턴(GCP Scheduler 전용) |
| Secrets/env vars | 기존 Secret 재사용: `gh-radar-supabase-service-role`. 신규 시크릿 0(co-movement 은 외부 API 키 불요 — KRX/Naver/Anthropic 미사용) | None — 기존 service-role secret 바인딩만 |
| Build artifacts | 신규 `workers/co-movement-sync/` 패키지 + Dockerfile. pnpm workspace 추가 | pnpm install(워크스페이스 인식) + Docker 이미지 빌드 |

**핵심 질문(모든 파일 업데이트 후 남는 런타임 상태):** 신규 추가라 "캐시된 옛 문자열" 문제 없음. 단 **server 재배포 필수** — 새 라우트 `/api/stocks/:code/co-movement` 는 코드 추가만으로 production 에 없다(lessons: 새 라우트는 server 재배포까지 + prod curl). webapp 도 Vercel 배포 필요.

## SQL 사전계산 구조 (핵심 — research_focus #2)

> 모든 수치는 read-only 실측(2026-06-11, master-sync .env REST API). 실제 EXPLAIN/실행 시간은 마이그레이션 적용 후 plan 단계 검증(§Open Questions).

### 실측 데이터 규모 (CONTEXT 추정 보정)
| 지표 | 실측값 | CONTEXT 추정 | 비고 |
|------|--------|--------------|------|
| 전체 일봉 | 4,071,084 | 4.07M | 일치 |
| 이벤트(15~31%) 24m | **9,713행** | "~2.5만 행" | CONTEXT 의 2.5만은 **전체 6년** 기준. 24m lookback 은 ~1만 행 (더 작음 — SQL 비용 더 유리) |
| 이벤트(15~31%) 전체 | 26,298 | ~2.5만 | 일치(전체 기준) |
| 아티팩트(>31%) 전체 | **185건** | "67건" | 재측정 시 185 — `change_rate>31` 제외 컷은 유효, 건수만 보정 |
| 동반 바(≥10%) 24m | **20,988행 / 487 거래일** | (미측정) | 부분 인덱스 대상 핵심 수치 |
| 날짜별 동반 종목 수 | min 9 / median 34 / p90 70 / p99 164 / max 886, mean 43.1 | "평균 50.6/일" | 24m 기준 43.1 (전체 기준 50.6보다 낮음) |
| 광역일(>100종목) | **18일(3.7%)**, max 886종목 | ">100 제외" | 제외 시 self-join 60% 절감 |

### (a) 테마 발화일 도출 — 멤버 ≥2 동일일 ≥15% 급등
**쿼리 형태:** theme_stocks(active) ⋈ stock_daily_ohlcv(이벤트) 를 `(theme_id, date)` 로 그룹핑, `count(distinct stock_code) >= 2` HAVING.
```sql
-- 발화일 CTE
WITH ignite AS (
  SELECT ts.theme_id, o.date AS ignite_date,
         count(*) AS ignite_member_count
  FROM theme_stocks ts
  JOIN stock_daily_ohlcv o
    ON o.code = ts.stock_code
   AND o.date >= v_since
   AND o.change_rate >= 15 AND o.change_rate <= 31   -- D-13 이벤트(아티팩트 제외)
  WHERE ts.effective_to IS NULL
    AND ts.manual_override IS DISTINCT FROM 'excluded'  -- admin 제외 종목 무시(theme_admin_overrides)
  GROUP BY ts.theme_id, o.date
  HAVING count(*) >= 2                                 -- 발화일 = 멤버 ≥2 동반
),
theme_ignite_count AS (   -- 테마별 발화일 총수 (계산 게이팅 ≥8)
  SELECT theme_id, count(*) AS ignite_days
  FROM ignite GROUP BY theme_id
)
```
**실측 검증:** 정유(3멤버)=0 발화일, 석유화학(17)=2, 원자력발전(50)=32, 로봇(70)=**110**, AI로봇(66)=81. → **발화일이 멤버 수와 강하게 비례** → 게이팅(≥8)과 타이트니스 가중이 정량 정당화됨. [VERIFIED: probe-theme-event 2026-06-11]

### (b) 멤버별 conf_d0 / conf_d1 / lift / avg_ret 윈도우 패턴
**conf_d0(동반율):** 테마 발화일 중 해당 멤버가 같은 날 ≥10% 동반한 비율.
```sql
member_d0 AS (
  SELECT i.theme_id, ts.stock_code,
         count(*) FILTER (WHERE o.change_rate >= 10) AS d0_co_count,  -- 동반 바 ≥10
         (SELECT count(*) FROM theme_ignite_count tic WHERE tic.theme_id = i.theme_id) AS ignite_total,
         avg(o.change_rate) FILTER (WHERE o.change_rate >= 10) AS avg_ret_d0       -- 발화일 평균 수익률(강도)
  FROM ignite i
  JOIN theme_stocks ts ON ts.theme_id = i.theme_id AND ts.effective_to IS NULL
  LEFT JOIN stock_daily_ohlcv o
    ON o.code = ts.stock_code AND o.date = i.ignite_date    -- D0: 같은 날
  GROUP BY i.theme_id, ts.stock_code
)
-- conf_d0 = d0_co_count::numeric / ignite_total
```
**conf_d1(익일 후행율):** 발화일 **다음 거래일**에 ≥10% 후행한 비율. 다음 거래일은 `LEAD(date) OVER (PARTITION BY code ORDER BY date)` 또는 발화일+조인으로 "그 종목의 다음 행". **권고: 종목별 거래일 시퀀스를 윈도우로 구해 발화일 다음 행과 조인** (캘린더 날짜 +1 은 주말/휴장 오류 — 반드시 거래일 시퀀스 사용).
```sql
-- 종목별 다음 거래일 매핑 (휴장일 안전)
trading_next AS (
  SELECT code, date,
         LEAD(date) OVER (PARTITION BY code ORDER BY date) AS next_date
  FROM stock_daily_ohlcv WHERE date >= v_since
)
-- conf_d1: ignite_date 의 next_date 에서 change_rate >= 10 비율
```
**lift(디노이즈):** `conf_d0 / base_rate`, base_rate = 해당 멤버의 전체 거래일 중 ≥10% 급등 비율.
**실측 sanity:** 흥구석유 base_rate = 3.1%(484거래일 중 15일 ≥10%). 한국석유 발화일 동반율(conf_d0)이 3.1%보다 훨씬 높으면 lift ≫ 1 → "기저 급등률 대비 디노이즈" 작동. base_rate 가 낮을수록 동반의 정보량이 큼. [VERIFIED: probe-readpath 2026-06-11]
```sql
base_rate AS (
  SELECT code,
         count(*) FILTER (WHERE change_rate >= 10)::numeric
           / NULLIF(count(*), 0) AS p_surge
  FROM stock_daily_ohlcv WHERE date >= v_since GROUP BY code
)
-- lift = conf_d0 / NULLIF(p_surge, 0)
```

### (c) co-surge 엣지 self-join — 페어 동반급등 ≥N일
**구조:** 동반 바(≥10%, 광역일 제외) 를 `date` 로 self-join 해 같은 날 동반한 모든 페어 생성, `(code_a, code_b)` 로 GROUP BY count.
```sql
daily_bars AS (   -- 동반 바, 광역일 제외
  SELECT o.date, o.code, o.change_rate
  FROM stock_daily_ohlcv o
  WHERE o.date >= v_since AND o.change_rate >= 10
    AND o.date NOT IN (SELECT date FROM broad_days)   -- §(d) 광역일 제외
),
cosurge AS (
  SELECT a.code AS code_a, b.code AS code_b,
         count(*) AS co_count,
         avg((a.change_rate + b.change_rate) / 2) AS avg_pair_ret
  FROM daily_bars a
  JOIN daily_bars b ON a.date = b.date AND a.code < b.code   -- 무향(code_a<code_b), self/중복 제거
  GROUP BY a.code, b.code
  HAVING count(*) >= 3                                       -- 노출 컷 ≥3 (D-04)
)
```
**비용 실측:** self-join 비교 횟수 = Σ C(n,2) (날짜별 동반 종목 n). 광역일 포함 992,282 → **광역일(>100) 제외 393,692** (60% 감소). Postgres date-equi-join + GROUP BY 로 수 초 내 처리(394K 페어 생성·집계는 인덱스 있으면 가벼움). **plpgsql 내부 INSERT-SELECT 로 실행, 노드 fetch 금지.** [VERIFIED: probe-cosurge 2026-06-11]
**lift(co-surge):** 페어 co_count 대비 기대 동반 횟수. `co_count / (n_a · n_b / total_days)` 형태(독립 가정 대비 초과 동반). plan 에서 정확식 확정(§Open Q).

### (d) 시장 광역일 탐지·제외
```sql
broad_days AS (
  SELECT date FROM stock_daily_ohlcv
  WHERE date >= v_since AND change_rate >= 10
  GROUP BY date HAVING count(*) > 100        -- D-13: co-surge 종목 >100 = 시장 광역일
)
```
**실측:** 18일(전체 487 거래일의 3.7%), max 886종목. 이 18일을 빼면 self-join 60% 절감 + "시장 전체 상승" 노이즈 배제. **co-surge 경로에만 적용**(테마 발화일은 멤버 ≥2 + 테마 응집이라 광역일 영향 작음 — 단 일관성 위해 테마 발화일에도 동일 제외 권고, plan 확정). [VERIFIED: probe-cosurge]

### plpgsql vs 순수 SQL
**권고: plpgsql 함수 `rebuild_comovement()` 1개** (intraday RPC 선례). 이유: (1) TRUNCATE + 다중 INSERT 를 단일 트랜잭션·단일 RPC 로 묶음, (2) `GET DIAGNOSTICS` 로 적재 행수 반환(워커 로깅·smoke 검증), (3) 워커는 `supabase.rpc('rebuild_comovement', {...})` 한 줄. CTE 체인은 함수 본문 내 INSERT-SELECT 로 작성. [근거: intraday RPC + STATE.md "Postgres SQL 함수로 사전계산"]

## 스키마 (research_focus #1)

### theme_comovement (테마-풀링 경로)
```sql
CREATE TABLE theme_comovement (
  theme_id      uuid NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  stock_code    text NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  ignite_days   int  NOT NULL,              -- 테마 발화일 총수(게이팅·표본수 배지)
  member_count  int  NOT NULL,              -- 발화 시점 테마 멤버 수(타이트니스 분모, D-11)
  conf_d0       numeric(5,4) NOT NULL,      -- 동반율(주 점수, D-12) 0~1
  conf_d1       numeric(5,4) NOT NULL,      -- 익일 후행율(후행형 판정, D-07)
  lift          numeric(8,4),              -- conf_d0 / base_rate (디노이즈, nullable: base_rate=0)
  avg_ret       numeric(8,4),              -- 발화일 평균 수익률(강도)
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (theme_id, stock_code)
);
-- 읽기: 앵커 stock_code 의 테마 → 그 테마들의 전 멤버. 두 역조회 인덱스.
CREATE INDEX idx_theme_comovement_code  ON theme_comovement (stock_code);  -- 앵커가 속한 (theme,row) 찾기
CREATE INDEX idx_theme_comovement_theme ON theme_comovement (theme_id);    -- 그 테마의 멤버 union
```
**읽기 RPC 가 한 번에 끌어와야 할 필드:** `theme_id, stock_code, conf_d0, conf_d1, lift, avg_ret, ignite_days, member_count` + (테마명은 themes 조인 또는 별도) + stock_code 의 종목명/실시간 등락률(stocks/stock_quotes 조인). [근거: D-09 행 구성]
**적재 컷:** 발화일 ≥8 테마만 (계산 안정성, §6). conf_d0 모든 멤버 적재(노출 컷 ≥5 는 themes.ignite_days 로 읽기 시 필터 — §6 분리 전략).

### cosurge_edges (글로벌 co-surge 경로)
```sql
CREATE TABLE cosurge_edges (
  code_a       text NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  code_b       text NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,  -- code_a < code_b 무향
  co_count     int  NOT NULL,              -- 동반급등 횟수(표본수 배지, "직접동반 N회")
  lift         numeric(8,4),              -- 독립 대비 초과 동반(디노이즈)
  avg_pair_ret numeric(8,4),              -- 페어 평균 수익률(강도)
  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code_a, code_b),
  CHECK (code_a < code_b)                  -- 무향 정규화 강제
);
-- 앵커가 code_a 또는 code_b 양쪽에 올 수 있어 두 방향 인덱스 필요.
CREATE INDEX idx_cosurge_a ON cosurge_edges (code_a);
CREATE INDEX idx_cosurge_b ON cosurge_edges (code_b);
```
**방향성:** 무향(code_a<code_b). D0 동반은 대칭이라 X→Y/Y→X 구분 불필요. **읽기 시 앵커 = code_a OR code_b 두 쿼리 union** (또는 `WHERE code_a=:anchor OR code_b=:anchor` — 단 OR 는 인덱스 2개 못 타므로 union all 권고). [근거: D-14 "co-surge 빈도/lift", 방향성 페어는 v2 deferred]
**적재 컷:** co_count ≥3 적재(노출 컷). ≥5 "강함" 은 읽기 시 배지 구분(§6).

### 부분 인덱스 (research_focus #3)
```sql
-- CONTEXT 명시: (date, code) WHERE change_rate >= 10
CREATE INDEX idx_ohlcv_surge_bar
  ON stock_daily_ohlcv (date, code) WHERE change_rate >= 10;
```
**커버 분석 (실측 기반):**
- **(c) co-surge self-join:** `daily_bars a JOIN daily_bars b ON a.date=b.date` — `(date, code) WHERE change_rate>=10` 가 **정확히 이 조인을 커버**(date 선두 → date-equi-join, change_rate>=10 부분조건이 20,988행만 색인). ✅ 커버
- **(a) 테마 발화일:** `JOIN ... ON o.code=ts.stock_code AND o.change_rate>=15..31` — 이건 **code 선두 접근**(특정 테마 멤버 code 로 이벤트 찾기)이라 `(date,code)` 부분인덱스가 최적이 아님. PK `(code, date)` 가 code 선두라 더 적합. 단 change_rate 15~31 필터는 부분인덱스 없이 PK 스캔 후 필터 → 멤버당 거래일 ~484행이라 가벼움. **추가 인덱스 불요 가능** (plan EXPLAIN 검증).
- **결론:** `(date, code) WHERE change_rate>=10` 부분 인덱스 **1개로 co-surge self-join 커버**(가장 비싼 경로). 테마 발화일은 PK(code,date) 활용. **부분 인덱스 1개 추가 권고** + plan 단계 EXPLAIN 으로 발화일 경로 인덱스 필요 여부 확정(§Validation). [VERIFIED: 인덱스 설계는 코드 선례 + 실측 행수, EXPLAIN 은 plan]

## 타이트니스 가중 공식 (research_focus #4)

**문제 실측:** 삼성전자 앵커 = **35테마 → 624종목 union**. 한국석유 = 2테마 → 36종목. 메가캡이 앵커면 헐렁한 대형 테마들이 무차별 후보를 쏟아냄. [VERIFIED: probe-readpath]

**권고 공식 (테마 기여 down-weight):**
```
theme_weight = 1 / sqrt(member_count)
theme_score(candidate) = conf_d0 · theme_weight
```
근거: `1/sqrt(n)` 은 `1/n`(과도 페널티 — 큰 테마를 거의 0으로) 과 `1/log(n)`(약한 페널티) 사이의 균형. 실측 멤버 분포(정유 3 ~ 로봇 70)에서:
- 정유(3멤버): weight = 0.58 (작고 응집 → 우대)
- 원자력발전(50): weight = 0.14
- 로봇(70): weight = 0.12 (헐렁한 대형 → 기여↓)

**co-surge 엣지 강도와 결합:** co-surge 는 테마 멤버 수 무관(페어 직접 통계)이라 타이트니스 가중 미적용. 대신 co-surge lift 자체가 디노이즈. 한 후보가 여러 테마에 동시 소속 시 **max(theme_score) 채택**(합산하면 메가캡 다중테마가 다시 부풀음 — max 가 "가장 응집된 근거" 우선). [근거: D-11 "작고 응집된 테마·강한 co-surge 우대"]

**메가캡 union 시나리오 적용 예:** 삼성전자 앵커 → 624종목 각각 max(theme_score) 계산 → 대부분 헐렁한 반도체 테마(멤버 多)라 weight 작음 → 결합 점수 낮음 → TOP-K 에서 자연 탈락. 작고 응집된 테마 멤버나 강한 co-surge 이웃만 상위. (메가캡은 ≥15% 급등 자체가 드물어 co-surge 경로로는 앵커가 거의 안 됨 — 주 문제는 앵커일 때 624 union 인데 가중으로 해결.)

## 두 경로 결합 점수 (research_focus #5)

**결합 점수 (강도바·정렬 기준, D-10):**
```
combined = 0.5·conf_d0_eff + 0.2·lift_norm + 0.2·avg_ret_norm + 0.1·conf_d1
  conf_d0_eff = max over themes of (conf_d0 · 1/sqrt(member_count))   -- 테마 경로 + 타이트니스
                또는 co-surge 경로면 co_surge_conf (co_count 정규화)
  lift_norm    = min(1, lift / LIFT_CAP)        -- LIFT_CAP=10 등으로 클리핑(plan 튜닝)
  avg_ret_norm = min(1, avg_ret / 30)           -- 30% 만점 정규화(상한가 근처)
```
가중 근거: conf_d0 가 주 신호(D-12 "주, 동반율") → 0.5. lift·avg_ret 은 디노이즈·강도 보조 → 각 0.2. conf_d1 은 후행 신호라 결합엔 소량(0.1) 기여하되 **후행형 배지는 별도 판정**(§9). 정확한 가중치는 plan 에서 fixture 쌍 랭킹 sanity 로 튜닝(§Validation).

**dedup — 한 후보가 양쪽 경로에 다 나올 때 (D-02/D-03):**
- 후보 key = stock_code. 테마 경로 결과 + co-surge 경로 결과를 stock_code 로 merge.
- **근거(evidence)는 합집합:** 공유 테마 칩들 + "직접동반 N회"(co-surge) **둘 다 표시**(D-03).
- **점수는 max(theme_combined, cosurge_combined)** 또는 가중 합(plan 확정). max 권고: 두 경로가 같은 종목을 가리키면 신호 강화지만 중복 가산은 부풀림. 양쪽 다 있으면 강도바에 살짝 보너스(예: ×1.1) 가능 — plan 재량.

## 노출 컷 vs 계산 컷 (research_focus #6)

**두 축 분리 (CONTEXT D-04 주의 + B절):**
| 축 | 테마 경로 | co-surge 경로 | 구현 |
|----|-----------|----------------|------|
| **계산(적재) 컷** | 발화일 ≥8 | co_count ≥3 | `rebuild_comovement()` 의 HAVING — 이 미만은 **테이블에 안 들어감** |
| **노출 컷** | 발화일 ≥5 | co_count ≥3 | 읽기 라우트가 theme_comovement.ignite_days/cosurge.co_count 로 필터 |
| **강함(배지)** | (배지: 발화일·conf 신뢰도) | co_count ≥5 | 읽기 시 배지 분기 |

**권고 구현:**
- **적재 ≥8 + 노출 ≥5 충돌 해결:** 발화일 5~7 테마도 노출하려면 **적재 컷을 ≥5 로 낮추고**, ignite_days 컬럼을 읽기 시 필터·배지에 사용. 즉 `rebuild_comovement()` HAVING 은 **≥5(노출 최저)** 로 적재하고, ≥8 미만(5~7)은 **"표본 적음" 신뢰도 배지**로 구분(D-05 "약한 후보는 배지로 숨기지 않음"). 계산 안정성 ≥8 은 별도 하드 게이팅이 아니라 **배지 임계**로 표현.
  - 근거: D-04 는 "노출 임계 완화 ≥5", D-05 는 "약한 후보 숨기지 않음". 따라서 ≥8 을 적재 게이팅(=숨김)으로 쓰면 D-05 와 모순. **적재 ≥5 + ignite_days 컬럼 + 배지** 가 두 결정을 모두 만족.
  - 실측 영향: 석유화학(2 발화일)은 ≥5 미달이라 미노출. 원자력발전(32)·로봇(110) 은 노출 + "충분" 배지. 발화일 5~7 테마는 노출 + "표본 적음" 배지. [VERIFIED: probe-theme-event]
- **co-surge ≥3 적재 + ≥5 강함:** co_count ≥3 적재(노출 최저), 읽기 시 ≥5 면 "직접동반 N회" 칩에 강조(accent fill — UI-SPEC). fixture: 한국석유↔흥구석유 9회·광전자↔이노 12회(강함), 휴림에이텍↔휴림로봇 9회(≥10 기준) — 모두 ≥3 노출, ≥5 강함. [VERIFIED: probe-fixture]

## 읽기 경로 (research_focus #7)

**선택: Express 라우트 `GET /api/stocks/:code/co-movement?k=8`** (RPC 아님).

**themes.ts 선례 분석:**
- themes.ts 는 (1) `.in()` 청크(QUOTE_CHUNK=200, URL 414 방지), (2) `.range()` 결과-행 페이지네이션(db-max-rows 1000), (3) stock_quotes 청크 조인, (4) 메모리 집계(computeTop3Avg) 를 **이미 검증**. co-movement 읽기는 동형 문제(멤버 union + quotes 조인 + 집계).
- **후보풀 행 수 실측:** 타이트 앵커 36행, 메가캡 624행 — **둘 다 db-max-rows 1000 미만**. 따라서 theme_comovement/cosurge_edges 조회는 단순 `.in()`/`.eq()` 로 충분(페이지네이션 안전마진만). **stock_quotes 조인만 청크 IN 필수**(624 codes → 200×4 청크). [VERIFIED: probe-readpath]

**RPC vs Express 결론:**
| 기준 | Express(themes.ts) | Postgres RPC |
|------|--------------------|--------------|
| 414 청크 | 검증된 fetchQuotesChunked 복제 | RPC 내부 조인이라 414 무관(장점) |
| db-max-rows | 검증된 .range() | RPC 가 집계 후 작은 결과 반환(장점) |
| apiFetch<T> 계약 | shared 타입 일치 쉬움(lessons) | RPC 반환 jsonb → 매핑 한 겹 더 |
| 결합점수·타이트니스·dedup 가독성 | JS 순수함수(computeComovement) 명료 | plpgsql 내 복잡 점수식 가독성↓ |
| 선례 일관성 | themes.ts·scanner.ts 와 동일 | intraday RPC 는 쓰기 전용 |
**→ Express 채택.** 후보풀이 작아(≤624) RPC 의 "DB 내부 집계" 이점이 작고, 결합 점수·타이트니스 가중·두 경로 dedup·후행 판정은 **JS 순수 함수(computeComovement.ts)** 가 plpgsql 보다 명료·테스트 용이. stock_quotes 조인은 themes.ts fetchQuotesChunked 그대로. [근거: themes.ts 선례 + CONTEXT "RPC vs Express 라우트 선택(themes.ts 선례 따름)"]

**라우트 등록:** `stocksRouter.get("/:code/co-movement", ...)` — 단 `/:code` 핸들러(stocks.ts:90)보다 **먼저 등록**(Express 라우트 매칭 순서 — themes.ts 의 `/search` before `/:code` 선례). 또는 중첩 라우터(`stocksRouter.use("/:code/co-movement", comovementRouter)`, news/discussions 선례). [VERIFIED: stocks.ts:21-24 중첩 라우터 패턴]

**응답 계약 (lessons 드리프트 방지):**
```typescript
// packages/shared/src/comovement.ts — server·webapp 공유
export interface CoMovementCandidate {
  code: string; name: string; market: Market;
  liveChangeRate: number | null;     // stock_quotes 실시간
  confD0: number;                    // 동반율(표시 메트릭)
  strength: number;                  // 결합 점수(강도바 width)
  isTrailing: boolean;               // 후행형 배지(§9)
  sharedThemes: { id: string; name: string }[];  // 공유 테마 칩
  coSurgeCount: number | null;       // "직접동반 N회"(없으면 null)
  sampleConfidence: 'high' | 'low';  // 표본수 배지(발화일 ≥8 등)
}
export interface CoMovementResponse { candidates: CoMovementCandidate[]; }
```
webapp `apiFetch<CoMovementResponse>` ↔ server `res.json<CoMovementResponse>` 타입 일치. **객체 반환(배열 아님)** — themes.ts:292 의 배열 반환이 계약 드리프트로 prod error 난 lesson 회피. [VERIFIED: lessons 2026-06-10]

## 워커 / 배포 (research_focus #8)

**candle-sync 복제 시 변경점:**
| 항목 | candle-sync | co-movement-sync |
|------|-------------|------------------|
| mode dispatch | daily/recover/backfill 3종 | **단일 cycle**(intraday-sync 선례 — MODE 제거) 또는 MODE=rebuild 1종 |
| 작업 내용 | KRX fetch → map → upsert(노드) | **`supabase.rpc('rebuild_comovement', {p_lookback_months:24})`** 한 줄 + 결과 로깅 |
| 외부 의존성 | KRX_AUTH_KEY + KRX_BASE_URL | **없음**(자체 DB 집계 — service-role 만) |
| Secret | krx-auth-key + supabase-service-role | **supabase-service-role 1개만** |
| config | mode/basDd/minExpected/lookback... | SUPABASE_URL + SERVICE_ROLE_KEY + LOOKBACK_MONTHS(=24) |
| Dockerfile | candle-sync 동일 멀티스테이지 | 1:1 복제 |

**SQL 함수 호출 방식:** `supabase.rpc('rebuild_comovement', { p_lookback_months: 24 })` → 반환 jsonb `{theme_comovement_rows, cosurge_edge_rows, ...}` 로깅. raw SQL 아님(supabase-js RPC). 워커는 30줄 미만(intraday-sync 보다 얇음 — fetch/map/dedup 전부 불요). [근거: intraday RPC 호출 + STATE.md "얇은 co-movement-sync"]

**Scheduler cron:** candle-sync EOD `30 17 * * 1-5` **이후**. EOD 가 그날 일봉을 17:30 에 적재 → co-movement 은 그 데이터를 읽어야 함. **권고 `0 18 * * 1-5`** (EOD +30분 마진) 또는 야간 한가한 시각 `0 2 * * 2-6`(다음날 새벽, 전 영업일 데이터 확정 후 — 더 안전). plan 에서 EOD 완료 신뢰도 따라 확정(§Open Q). [근거: deploy-candle-sync.sh cron 패턴 + CONTEXT "EOD 이후 야간 1회"]

**IAM/배포 스크립트 차이:**
- `setup-comovement-sync-iam.sh`: candle-sync 복제. 단 **KRX secret 바인딩 제거**(supabase-service-role 만). runtime SA `gh-radar-comovement-sync-sa` 최소권한.
- `deploy-comovement-sync.sh`: Job 1개(daily 3개 아님) + Scheduler 1개. COMMON_SECRETS 에서 KRX_AUTH_KEY 제거. task-timeout: rebuild 가 self-join 포함이라 **600s 권고**(candle-sync daily 300s 보다 여유 — 실 시간은 plan smoke 측정). OAuth invoker(OIDC 금지).
- Scheduler→Job invoker 바인딩은 deploy 스크립트 내(Job 생성 후), `--oauth-service-account-email` 전용. [VERIFIED: deploy-candle-sync.sh §5.5/§6 패턴]

## 후행형 판정 (research_focus #9)

**판정 임계 (D-08 "D+1 우세 후보에 후행형 배지"):**
```
isTrailing = (conf_d1 > conf_d0) AND (conf_d1 >= TRAIL_MIN)
  TRAIL_MIN = 0.3 등 (plan 튜닝 — 너무 낮으면 노이즈 후행)
```
근거: "후행형" = 같은 날(D0) 보다 **다음 날(D+1)에 더 자주 따라옴**. 단순 `conf_d1 > conf_d0` 만 쓰면 둘 다 낮을 때(0.1 vs 0.12) 의미 없는 후행 판정 → 최소 임계 AND. co-surge 전용 후보(테마 경로 없음)는 conf_d1 부재 → isTrailing=false(D0 동반만 표현, D+1 은 테마 경로 신호). [근거: D-07/D-08, conf_d1 은 theme_comovement 컬럼]
**비율 vs 차이:** 차이(`conf_d1 - conf_d0 > 0`) + 최소 임계 권고. 비율(`conf_d1/conf_d0 > 1.2`) 은 conf_d0=0 분모 문제. plan 에서 fixture 로 sanity(예: 알려진 후행 종목 있으면). UI-SPEC §후행형 배지가 `--down` 톤으로 이미 시각 확정.

## 검증 fixture 활용 (research_focus #10)

**실측 ground truth (SQL 정확성 검증 — probe-fixture 2026-06-11):**
| 페어 | code | D0 동반(≥15%) | ≥10% 바 동반 | SQL 검증 용도 |
|------|------|---------------|--------------|---------------|
| 한국석유↔흥구석유 | 004090↔024060 | **7회** | 9회 | cosurge_edges 의 (004090,024060) co_count 가 ≥10% 기준 ~9 인지 대조 |
| 광전자↔이노인스트루먼트 | 017900↔215790 | **10회** | 12회 | co_count ~12, "강함"(≥5) 검증 |
| 휴림에이텍↔휴림로봇 | 078590↔090710 | **4회** | 9회 | ≥3 노출 통과 / ≥5 경계(15% 기준 4) 신뢰도 배지 검증 |

**활용 방법:**
1. **SQL 정확성:** `rebuild_comovement()` 실행 후 `SELECT * FROM cosurge_edges WHERE code_a='004090' AND code_b='024060'` → co_count 가 실측 9(≥10% 기준)와 일치하는지 단언. 불일치 시 self-join/광역일 제외 로직 버그.
2. **랭킹 sanity:** 한국석유(004090) 앵커 읽기 → 흥구석유(024060) 가 TOP-K 상위(conf_d0 高 + co-surge 9회)에 나오는지. 실측 한국석유 2테마 union 36종목 중 흥구석유가 상위여야 함.
3. **테마-독립 검증:** 휴림 계열은 "계열사"(테마 미태깅 가능) — co-surge 경로로만 잡히면 "직접동반 N회" 칩만 뜨고 공유 테마 칩 없음(D-03 분리 검증).
4. **회귀 테스트:** 이 3쌍 + code 를 server 단위 테스트 fixture 로 박제(supabase-mock). 단 **mock 이 db-max-rows·청크 제약을 시뮬레이션**해야 회귀 잡음(lessons 2026-06-10: mock 이 실서버 제약 안 닮으면 prod 까지 샘). [VERIFIED: probe-fixture + lessons]

## Common Pitfalls

### Pitfall 1: conf_d1 익일 계산에 캘린더 +1 사용
**What goes wrong:** `ignite_date + 1` 로 다음 날 조회 → 금요일 발화면 토요일(거래 없음) 조회 → conf_d1 항상 0.
**Why:** 한국 증시 주말·공휴일 휴장. 캘린더 날짜 ≠ 거래일.
**How to avoid:** `LEAD(date) OVER (PARTITION BY code ORDER BY date)` 로 그 종목의 **실제 다음 거래일** 매핑(§SQL b). [근거: stock_daily_ohlcv 는 거래일만 행 존재 — businessDay 개념]
**Warning signs:** conf_d1 분포가 비정상적으로 0 편중.

### Pitfall 2: co-surge self-join 광역일 미제외로 비용 폭발 + 노이즈
**What goes wrong:** max 886종목 날을 self-join 하면 그 하루만 C(886,2)=392K 페어 — 전체 비용의 다수가 18일에 집중 + "시장 전체 상승"이 가짜 동조로.
**Why:** 광역일은 종목간 관계가 아니라 시장 베타.
**How to avoid:** broad_days(>100) 선제 제외 CTE(§SQL d). 실측 60% 비용 절감 + 노이즈 제거. [VERIFIED: probe-cosurge]
**Warning signs:** cosurge_edges 행수 폭증 / 무관한 종목쌍 다수.

### Pitfall 3: 메가캡 앵커 624종목 무가중 노출
**What goes wrong:** 삼성전자 앵커 → 35테마 624종목이 conf_d0 만으로 랭킹 → 헐렁한 반도체 테마 멤버 무차별 상위.
**Why:** 큰 테마는 멤버 수 자체로 동반 확률이 높음(통계적 우연).
**How to avoid:** `1/sqrt(member_count)` 타이트니스 가중(§4) + 결합 점수. [VERIFIED: probe-readpath 624 union]
**Warning signs:** 메가캡 상세에서 무관 종목이 TOP 차지.

### Pitfall 4: 새 라우트 추가 후 server 미재배포
**What goes wrong:** `/api/stocks/:code/co-movement` 코드/테스트 green 이지만 prod 404. webapp 섹션 빈 화면(quiet fallback 이라 조용히).
**Why:** Cloud Run server 이미지가 옛 SHA. [VERIFIED: lessons Phase 10 — 정확히 이 회귀]
**How to avoid:** deploy plan 에 server 재배포(`deploy-server.sh`) + **prod curl** `GET /api/stocks/004090/co-movement` 검증 포함.
**Warning signs:** 로컬 green, prod 섹션 미렌더.

### Pitfall 5: theme_stocks manual_override='excluded' / hidden 테마 미반영
**What goes wrong:** admin 이 제외한 종목/숨긴 테마가 발화일·멤버 union 에 포함.
**Why:** theme_admin_overrides(20260610130000) 가 추가한 `manual_override`/`hidden` 을 사전계산이 무시.
**How to avoid:** 발화일 CTE 에 `ts.manual_override IS DISTINCT FROM 'excluded'`, themes 조인에 `hidden=false`(§SQL a). [VERIFIED: theme_admin_overrides.sql + themes.ts:176 hidden 필터]
**Warning signs:** 운영자가 뺀 종목이 동조 후보에 등장.

## Code Examples

### 읽기 라우트 골격 (themes.ts 복제)
```typescript
// Source: server/src/routes/themes.ts (fetchQuotesChunked 재사용)
stocksRouter.get("/:code/co-movement", async (req, res, next) => {
  try {
    const supabase = req.app.locals.supabase as SupabaseClient;
    const code = req.params.code;
    const k = Math.min(Number(req.query.k) || 8, 50);

    // 1. 앵커 활성 테마 → theme_comovement 멤버 union (앵커 stock_code 로 테마 찾기)
    const { data: anchorRows, error: aErr } = await supabase
      .from("theme_comovement").select("theme_id").eq("stock_code", code);
    if (aErr) throw aErr;
    const themeIds = [...new Set((anchorRows ?? []).map(r => r.theme_id))];
    // 2. 그 테마들의 전 멤버 (themes.hidden=false 조인) — .in() 청크 + .range()
    // 3. co-surge 이웃: cosurge_edges WHERE code_a=code UNION code_b=code
    // 4. stock_quotes 청크 IN (fetchQuotesChunked 그대로)
    // 5. computeComovement(themeRows, cosurgeRows, quotes) → 결합점수·타이트니스·dedup·랭킹·후행
    // 6. res.json<CoMovementResponse>({ candidates: ranked.slice(0, k) })
  } catch (e) { next(e); }
});
```

### UI 섹션 골격 (theme-rank-row + theme-chips 적응)
```tsx
// Source: theme-rank-row.tsx barPct + theme-chips.tsx quiet fallback
// 'use client'. mount fetch apiFetch<CoMovementResponse>. 에러 → 섹션 숨김(null).
// 초기 3행 + 더보기(useState expanded). 행 = Link /stocks/[code] + .underbar 강도.
const barPct = Math.max(4, Math.min(100, candidate.strength * 100)); // theme-rank-row 동형
```

## State of the Art

| Old Approach | Current Approach | When | Impact |
|--------------|------------------|------|--------|
| 노드로 이벤트 행 끌어와 JS 집계 | Postgres plpgsql self-join 사전계산 | 본 phase 결정 | OOM·네트워크 회피, 2만 행 SQL 내부 처리 |
| Pearson ρ 일반 상관 | co-surge 빈도/lift (테일 동조) | D-14 | "따라잡기"는 평균 상관 아닌 발화 시 동반 점프 |
| on-demand 계산 | 야간 배치 사전계산 테이블 | D-02 | 읽기 지연·반복 비용 제거 |

**Deprecated/outdated:** 없음(신규 기능). CONTEXT 의 "~2.5만 이벤트 행"은 24m 한정 시 9,713 으로 보정(전체 6년은 26,298).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `1/sqrt(member_count)` 타이트니스 가중이 최적 균형 | §4 | 낮음 — plan 에서 fixture 랭킹 sanity 로 튜닝. 1/log·1/n 대안 명시됨 |
| A2 | 결합 점수 가중치 0.5/0.2/0.2/0.1 | §5 | 중간 — 표시 품질 영향. fixture 쌍 상위 노출로 검증 후 조정 |
| A3 | co-surge lift 정확식(독립 대비 초과 동반) | §SQL c | 중간 — 디노이즈 강도 영향. plan EXPLAIN+sanity 확정 |
| A4 | rebuild self-join 실행 ~수 초(394K 페어) | §SQL c, §워커 | 중간 — task-timeout 영향. 실측 EXPLAIN ANALYZE 는 마이그레이션 후 plan |
| A5 | 적재 컷 ≥5 + 배지(≥8) 가 D-04/D-05 둘 다 만족 | §6 | 낮음 — 결정 정렬 논리. plan 확정 |
| A6 | Scheduler cron `0 18`(EOD+30m) 또는 `0 2` 새벽 | §워커 | 낮음 — EOD 완료 신뢰도 따라. 새벽이 더 안전 |
| A7 | 후행형 임계 conf_d1 > conf_d0 AND ≥0.3 | §9 | 낮음 — 배지 표시만. fixture sanity |
| A8 | 부분 인덱스 1개로 co-surge 커버, 발화일은 PK | §3, §부분인덱스 | 중간 — 성능. plan EXPLAIN 으로 발화일 경로 인덱스 필요 여부 확정 |

**이 표가 비어있지 않은 이유:** 스키마·SQL 구조·실측 규모는 전부 검증(HIGH)됐으나, **공식의 정확한 계수·임계·실행시간**은 마이그레이션 적용 후 EXPLAIN·fixture 튜닝이 필요한 본질적 미확정 영역이다. plan 단계 Wave 0 에서 마이그레이션 push → fixture 대조 → 계수 확정 순서 권고.

## Open Questions

1. **rebuild_comovement() 실제 실행 시간 + EXPLAIN 플랜**
   - 알고 있는 것: 이벤트 9,713행 / 동반바 20,988행 / self-join 394K 페어(광역일 제외)
   - 불확실: 실제 wall-clock(인덱스 빌드 후), task-timeout 값
   - 권고: plan Wave 0 에서 마이그레이션 push 후 `EXPLAIN ANALYZE` + 워커 smoke 1회 실측 → task-timeout 확정(초기 600s, 측정 후 조정)

2. **co-surge lift 정확식**
   - 알고 있는 것: 독립 가정 대비 초과 동반이 디노이즈 개념
   - 불확실: `co_count / (n_a·n_b/total_days)` vs 다른 정규화
   - 권고: plan 에서 fixture 쌍(한국석유↔흥구석유 등)의 lift 가 무관 페어보다 유의하게 큰지 sanity

3. **Scheduler 정확 시각 (EOD 완료 신뢰도)**
   - 알고 있는 것: candle-sync EOD `30 17`, recover `10 8`
   - 불확실: 18:00 시점 EOD 가 항상 완료됐는지(가끔 KRX 지연)
   - 권고: 안전하게 **다음날 새벽 `0 2 * * 2-6`**(전 영업일 데이터 확정 후) 또는 EOD 성공 의존. plan 확정

4. **발화일 경로 추가 인덱스 필요 여부**
   - 알고 있는 것: co-surge 는 `(date,code) WHERE change_rate>=10` 커버, 발화일은 PK(code,date) 사용
   - 불확실: 멤버 7,492 ⋈ 이벤트 조인이 PK 만으로 충분히 빠른지
   - 권고: plan EXPLAIN 으로 발화일 CTE 가 seq scan 타면 `(code, date) WHERE change_rate>=15` 등 추가 검토

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Postgres | 사전계산 + 읽기 | ✓ | managed (ivdbzxgaapbmrxreyuht) | — |
| stock_daily_ohlcv | 이벤트 소스 | ✓ | 4,071,084행 (2020~2026) | — |
| theme_stocks | 발화일 멤버 | ✓ | 7,492 active | — |
| stock_quotes | 읽기 실시간 등락률 | ✓ | intraday-sync 갱신 | — |
| @supabase/supabase-js (워커) | RPC 호출 | ✓ | workers/*/node_modules | — |
| Cloud Run Jobs + Scheduler | 야간 배치 | ✓ | candle-sync 선례 | — |
| Docker (amd64) | 이미지 빌드 | ✓ | deploy-candle-sync 패턴 | — |

**Missing dependencies with no fallback:** 없음 — 모든 의존성이 이미 production 가동 중.
**Missing dependencies with fallback:** 없음.
**주의:** 직접 DB connection string(패스워드)은 .env 에 없음 — service_role_key 는 REST 전용. 따라서 `EXPLAIN ANALYZE`·임의 SQL 실측은 **마이그레이션 적용 후 Supabase SQL Editor 또는 plan 단계**에서만 가능(이 RESEARCH 의 모든 수치는 REST head:true count + 페이지네이션 집계로 측정).

## Validation Architecture

> nyquist_validation: true (config.json). 5개 성공기준 각각의 검증 신호.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (워커·server 워크스페이스 공통, candle-sync/themes 선례) |
| Config file | 각 워크스페이스 vitest (passWithNoTests:true 패턴) |
| Quick run command | `pnpm -F @gh-radar/server test` / `pnpm -F @gh-radar/co-movement-sync test` |
| Full suite command | `pnpm -r test` (전 워크스페이스) |

### 성공기준 → 검증 신호 맵 (CONTEXT 5개 산출물)
| # | 성공기준 | 검증 유형 | 명령/쿼리/신호 |
|---|----------|-----------|----------------|
| 1 | theme_comovement + cosurge_edges + 부분인덱스 production 존재 | 마이그레이션·인덱스 | `supabase db push` exit 0 + `\d theme_comovement` + `\d cosurge_edges` + `\di idx_ohlcv_surge_bar`. EXPLAIN 으로 self-join 이 부분인덱스 사용 확인 |
| 2 | SQL 함수가 발화일 도출 + conf/lift/avg_ret/conf_d1 계산 → ≥5 적재 | SQL 출력 정확성(fixture 대조) | `SELECT rebuild_comovement(24)` → 반환 jsonb 행수 > 0. **fixture 단언:** `SELECT co_count FROM cosurge_edges WHERE code_a='004090' AND code_b='024060'` == 실측 9(±오차). `SELECT * FROM theme_comovement WHERE stock_code='024060'` conf_d0 합리적(0~1) |
| 3 | 얇은 co-movement-sync 워커 + Job + Scheduler EOD 이후 야간 1회 | 워커 실행·적재 행수 | `smoke-comovement-sync.sh`: Job execute → Cloud Logging `jsonPayload.msg` 에 `{theme_comovement_rows, cosurge_edge_rows}` > 0. Scheduler describe cron 확인 |
| 4 | GET /api/stocks/:code/co-movement TOP-K(conf_d0 desc) + stock_quotes 조인 | RPC 응답 계약·정렬 | **prod curl** `GET /api/stocks/004090/co-movement?k=8` → 200 + `{candidates:[...]}` 객체(배열 아님) + 흥구석유 상위 + strength desc 정렬 + liveChangeRate 존재. 단위테스트: computeComovement 결합점수·dedup·후행 |
| 5 | 종목상세 ThemeChips 다음 "동조 후보" 섹션 + 빈 상태 | UI 렌더·빈 상태 | webapp E2E 또는 수동: `/stocks/004090` 에 동조 후보 섹션(StockThemeChips 다음). 후보 0(테마없음+co-surge없음) 종목 → "동조 데이터 부족" 빈 상태. 후보 >3 → 더보기 |

### Sampling Rate
- **Per task commit:** `pnpm -F @gh-radar/server test` (computeComovement·읽기 라우트 단위)
- **Per wave merge:** `pnpm -r test` + typecheck/build
- **Phase gate:** 마이그레이션 push → fixture SQL 대조 → 워커 smoke → prod curl(5/5) green 후 `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `server/src/lib/computeComovement.test.ts` — 결합점수/타이트니스/dedup/후행 판정 (fixture 3쌍 박제) — COMV-01
- [ ] `server/src/routes/__tests__/co-movement.test.ts` — 읽기 라우트(청크 IN + db-max-rows mock + 빈 상태)
- [ ] `workers/co-movement-sync/` vitest 스캐폴드 (passWithNoTests + RPC 호출 mock)
- [ ] supabase-mock 이 db-max-rows 1000 + 청크 시뮬레이션 유지(lessons — 이미 추가됨, 회귀 가드 확인)
- [ ] **plan Wave 0 [BLOCKING]:** 마이그레이션 push → `EXPLAIN ANALYZE` 실측 → fixture co_count 대조(SQL 정확성 1차 게이트 — 노드 mock 못 잡는 self-join 로직)

## Security Domain

> security_enforcement 키가 config.json 에 없음 → 기본 enabled 로 처리. 단 이 phase 는 **인증·외부입력·암호화가 핵심이 아닌** 내부 DB 집계 + 공개 읽기라 적용 카테고리 제한적.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | co-movement 은 공개 데이터(로그인 불요, scanner/themes 동일) |
| V3 Session Management | no | 세션 무관 |
| V4 Access Control | yes | RPC `rebuild_comovement` = service_role only(REVOKE 3줄). 신규 테이블 RLS: 공개 read `TO anon, authenticated`(default-deny 함정 회피). 쓰기는 service_role(워커) |
| V5 Input Validation | yes | `:code` 파라미터 + `k` query — zod 또는 themes.ts 의 safeParse 패턴(`ThemeDetailParams` 동형). k 상한 클램프(min(k,50)) |
| V6 Cryptography | no | 암호화 대상 없음(공개 시세 집계) |

### Known Threat Patterns for {Express + Supabase + plpgsql}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RPC anon auto-grant(권한상승) | Elevation | REVOKE PUBLIC + REVOKE anon,authenticated + GRANT service_role [VERIFIED: feedback_supabase_rpc_revoke] |
| 신규 테이블 default-deny(가용성) | DoS(자기) | RLS `TO anon, authenticated USING(true)` 둘 다 [VERIFIED: feedback_supabase_rls_authenticated] |
| `:code` injection | Tampering | PostgREST 파라미터화(supabase-js) + 입력 검증. raw SQL 미사용 |
| error.message 누출(정보노출) | Information Disclosure | UI 에러 시 섹션 조용히 숨김(error.message 미노출) [VERIFIED: themes/chips quiet fallback + Phase 09.2] |
| plpgsql search_path 하이재킹 | Elevation | `SET search_path = public, pg_temp` (SECURITY DEFINER 함수) [VERIFIED: triggers_followup WR-D-03] |

## Project Constraints (from CLAUDE.md)

- **커밋 규칙:** 한글 메시지, 커밋 전 사용자 확인, push까지, Co-Authored-By 금지. (본 RESEARCH 는 plan/execute 단계 커밋에 해당)
- **Simplicity First / Minimal Impact:** co-movement 은 신규 추가지만 **선례 복제**라 새 패턴 발명 최소. 기존 테이블/워커/라우트 무변경, 추가만.
- **No Laziness:** 근본 원인 — 모든 수치 실측(추측 금지, lessons 2026-06-10 정량 주장 실측 규칙 준수).
- **Verification Before Done:** 5/5 성공기준 검증 신호 명시(§Validation). prod curl 필수(코드 green ≠ prod 동작).
- **Naver 5원칙:** co-movement 은 자체 DB 집계·외부 호출 0 → **5원칙 무관**(명시만). 새 source 추가 아님.
- **GSD Workflow:** plan/execute 는 GSD 명령 경유. 직접 repo 편집 금지.

## Sources

### Primary (HIGH confidence)
- read-only DB probe (master-sync .env REST API, 2026-06-11) — 이벤트/동반바/발화일/co-surge페어/후보풀/fixture 전 수치
- `supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql` — 이벤트 소스 스키마(PK code,date)
- `supabase/migrations/20260514120200_intraday_upsert_close_rpc.sql` — plpgsql RPC + REVOKE 3줄 권한 패턴
- `supabase/migrations/20260609120000_theme_tables.sql` + `20260610130000_theme_admin_overrides.sql` — 사전계산 테이블·부분인덱스·RLS·manual_override/hidden
- `supabase/migrations/20260610120000_theme_triggers_followup.sql` — `SET search_path` 규약
- `server/src/routes/themes.ts` — 읽기 라우트(청크 IN + .range() 페이지네이션 + stock_quotes 조인)
- `server/src/lib/computeTop3.ts` / `server/src/mappers/theme.ts` — 순수함수 집계 + row 매핑
- `workers/candle-sync/src/{index,config,modes/daily,services/supabase}.ts` — 워커 구조
- `scripts/deploy-candle-sync.sh` — Cloud Run Job + Scheduler OAuth 패턴
- `webapp/src/components/theme/{theme-rank-row,theme-chips}.tsx` — UI 강도바·근거칩·quiet fallback
- `webapp/src/components/stock/stock-detail-client.tsx` — UI 삽입 위치(StockThemeChips 다음)
- `tasks/lessons.md` — 청크/페이지네이션/계약드리프트/정량실측/배포완결성
- `packages/shared/src/theme.ts` — 공유 타입 계약 패턴
- 11-CONTEXT.md / 11-UI-SPEC.md / mockups/co-movement-adopted.html — 확정 결정·UI 계약

### Secondary (MEDIUM confidence)
- (없음 — 전부 코드 선례 또는 실측)

### Tertiary (LOW confidence)
- (없음 — 외부 WebSearch 미사용. 신규 라이브러리 없음, 도메인이 자체 데이터 집계라 외부 출처 불요)

## Metadata

**Confidence breakdown:**
- 스키마(theme_comovement/cosurge_edges/부분인덱스): HIGH — theme_tables + 실측 행수·후보풀 기반
- SQL 사전계산 구조: HIGH(구조)/MEDIUM(계수) — self-join 비용·발화일 분포 실측, 정확 계수는 plan EXPLAIN+fixture
- 읽기 경로(Express vs RPC): HIGH — themes.ts 선례 + 후보풀 실측(36~624 < 1000)
- 워커/배포: HIGH — candle-sync 1:1 복제, 변경점 명확
- 타이트니스/결합점수/후행 임계: MEDIUM — 공식 후보 + 실측 메가캡 시나리오, 계수는 fixture 튜닝
- 검증 fixture: HIGH — 3쌍 ground truth 실측(co_count 7/10/4)
- 보안: HIGH — 적용 카테고리 제한적, 전부 기존 선례

**Research date:** 2026-06-11
**Valid until:** 2026-07-11 (안정 — 내부 선례 기반, 외부 의존성 없음. 단 stock_daily_ohlcv 일봉이 매일 증가하므로 행수 수치는 점진 증가 — 분포·비율은 안정)
