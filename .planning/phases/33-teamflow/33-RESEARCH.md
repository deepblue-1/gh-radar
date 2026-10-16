# Phase 33: 팀 매집(teamflow) 보고서 - Research

**Researched:** 2026-10-16
**Domain:** 밤 export 적재(Supabase SQL · Cloud Run Job 워커) → 조회 RPC · Express 라우트 → Next.js 순수 SVG 보고서 화면
**Confidence:** HIGH (코드 · 실제 샘플 · 마이그레이션을 이번 세션에 직접 읽고 돌려 봄. 남은 위험은 아래 「Open Questions」 3건)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 적재 (TEAM-01)
- **D-01: 같은 트랜잭션.** `limitup_team_flow` 를 `limitup_commit_day` 의 **7번째 표**로 넣는다(별도 stage/commit RPC 를 만들지 않는다). 마이그레이션 = 표 생성(PK `(date, isin)` · 평평한 열 29개 + `schema_version int` + `payload jsonb` — export 행의 `payload` 키가 그대로 있으므로 `jsonb_populate_record` 로 열 매핑된다 · `name` · `market` · `first_limit_ms` 등 null 허용은 인박스 열 사전대로) · `limitup_stage` CHECK 에 `team_flow` 추가 · `limitup_commit_day` CREATE OR REPLACE(DELETE-by-date → INSERT 쌍 추가 · REVOKE/GRANT · `statement_timeout` ALTER 재진술) · `limitup_purge_old` 에 90일 삭제 한 줄(`LIMITUP_KEEP_DAYS` 와 같은 기간). — **Reversibility:** costly — commit_day 시그니처 · stage CHECK · purge 가 한 몸이라 되돌리면 마이그레이션 3곳을 다시 고쳐야 한다.
- **D-02: 파일 없는 날짜 = 0행 commit.** 워커는 `team_flow.ndjson.gz` 를 **선택 파일**로 다룬다 — `EXPORT_TABLES` 의 7번째 필수 항목이 아니라 별도 선택 분기(`index.ts:223-233` 의 「manifest has no …」 throw 를 타지 않는다). manifest 에 없으면 stage 0행 · `p_expected.team_flow = 0` 으로 commit 해 그 날짜 team_flow 행을 비운다(날짜 교체 규칙 유지). 있으면 `files[].rows` 와 행 수 대조 · sha256 대조는 기존 `verifyFiles` 그대로. `limitup_loads.rows` jsonb 에는 새 워커가 **항상 `team_flow` 키**를 쓴다(0 포함).
- **D-03: 재적재는 워커 자동 감지(영구 규칙).** manifest `files[]` 에 `team_flow.ndjson.gz` 가 있는데 그 날짜 `limitup_loads.rows` 에 `team_flow` 키가 **없으면** files_sig 가 같아도 그 날짜를 재적재한다(멱등 · 수동 UPDATE 없음 · 배포 순서와 무관). 이 규칙이 오늘 밤 옛 워커가 적재할 11일 + 10/16 을 워커 배포 뒤 첫 실행에서 채운다. 새 `limitup_commit_day` 는 **옛 워커 호출**(p_expected 에 `team_flow` 없음 · stage 에 team_flow 0행)도 0행으로 받아들여야 한다 — DB 마이그레이션이 워커 배포보다 먼저 가고 그 사이 21:20 적재가 끼어도 깨지지 않게.
- **D-04: 단위 변환 없음.** 워커는 행을 그대로 넣는다(기존 패턴 — NaN→null 은 export 보장). DB 는 §11 단위 그대로(ms epoch · 원 · 주 · share 0~1 · rate %). 억 · % 변환은 웹 표시층(D-10).

#### 서버 · 접근 (TEAM-02)
- **D-05: RPC 1회 · 하루 번들에 payload 포함.** `teamflow_report_for_user(p_user_id uuid, p_date text default null) → jsonb` 하나가 `{access, dates[], date, rows[]}` 를 내고 `rows[]` 에 평평한 열 + `payload` 를 **함께** 싣는다(행 펼침 때 추가 fetch 없음 · 하루 20~53행 × payload ≈ 수 KB 라 번들 허용). DMA 게이트는 상한가 보고서처럼 **RPC 안** `dma_visible_accounts` → `{access:false}` → 서버 403 `DmaUnmapped`. 라우트는 `requireAuth()` 만 쓰고 `requireDmaMapped()` 미들웨어를 겹치지 **않는다**(왕복 2회 방지 — 로드맵의 「require-dma-mapped」 는 「RPC 안 게이트」 로 읽는다). RPC 는 SECURITY INVOKER · `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` · `GRANT TO service_role` 명시([[feedback_supabase_rpc_revoke]]).
- **D-06: 표 접근은 limitup 패턴.** `limitup_team_flow` 는 RLS 켜고 **정책 0개** · `REVOKE ALL FROM PUBLIC, anon, authenticated` · `GRANT … TO service_role`(마이그레이션 주석 「POLICY 추가하지 말 것」 과 같은 결). 로드맵 「RLS `TO anon, authenticated`」 는 PostgREST 직접 읽기 표에만 해당하는 규칙이라 여기엔 적용하지 않는다 — 읽기는 서버 RPC 뿐.
- **D-07: 날짜 목록 = 팀 매집 행이 있는 날짜만.** `dates[]` 는 `limitup_team_flow` 에 행이 1개 이상인 날짜(0행 commit 날짜 · 적재 전 날짜 제외). `p_date` 없으면 최신 행 있는 날짜. `?d=` 로 행 없는 날짜를 직접 열면 `rows: []` 로 내려 웹이 빈 상태(「이 날은 팀 매집 데이터가 없어요」 류)를 그린다.

#### 목록 (TEAM-03 — 스케치 014 A)
- **D-08: 정렬 = 팀 순매수(`team_net_val`) 내림차순.** 상한가 · 미도달 섞임(태그로 구분) · 정렬 전환 UI 없음. 아코디언 한 번에 하나 · **기본 전부 접힘**(상한가 보고서 DayGrid 의 「첫 행 기본 펼침」 과 다름).
- **D-09: 태그.** `status === "limit"` → 「상한가 HH:MM」(`first_limit_ms` KST · 없으면 「상한가」 만). 미도달 → 종가 등락률 `last_rate` 태그(「+22.6%」) + 데스크톱 「결과」 열 보조줄 「고가 +29.1%」(`high_rate`). 폰 390 은 2줄 카드형 행(스케치 014 A 그대로).
- **D-10: 금액 · 비중 표기.** 금액은 **부호 + 억 소수 1자리**(`+7.0억` · `−3.1억` · `0.2억` · 1,000억 이상도 억 유지 · 조 변환 없음), 비중은 **정수 %**(`share` 0~1 × 100 반올림 · null 은 「—」). 상한가 보고서 「27.6억」 과 같은 결. 변환은 웹 표시층 함수 하나(상따 010 C 축약 규칙은 쓰지 않는다).
- **D-11: KPI 4칸** = 탐지(행 수) · 팀 순매수(`team_net_val > 0` 종목 수) · 상한가 도달(`status === "limit"` 수) · 팀 순매수 합(**전 종목 합** · 음수 포함 · 부호 색). 미니막대 9칸 = `payload.bands[]` 의 label 고정 슬롯 `0% 미만 · 0~5% · 5~10% · 10~15% · 15~20% · 20~25% · 25~28% · 28%~상한 미만 · 상한가 가격`(「하루 합계」 행 제외 · 없는 label 은 빈 칸 · 20% 경계 점선은 5번째 칸 앞). 「20% 아래/위」 열 = `below20_net_val` / `above20_net_val`, 「매수 중 팀」 = `team_buy_share`.

#### 상세 · 차트 (TEAM-04 — 스케치 015 C)
- **D-12: 순수 SVG 손그림.** 스케치 015 `index.html` 의 차트 코드를 React 컴포넌트로 이식한다(구간 가로 막대 · 거래원 2단 막대 · 10분 흐름 막대 + 보라 선 + 등락률 띠). 라이브러리 추가 없음(recharts 래퍼 · lightweight-charts 안 씀). 색은 CSS 변수 그대로(`--up`/`--down` 류 · [[feedback_lightweight_charts_oklch]] 문제 없음) · 수치는 `<title>` 툴팁 · 상한가 보고서 lane/sparkline 과 같은 `viewBox` 결.
- **D-13: 10분 차트 가로축 = 장 시간 고정 09:00~15:30(39칸).** `payload.buckets[]` 의 `key`(0~143 · `start` "HH:MM")를 09:00=key 54 … 15:20=key 92 슬롯에 놓고 빈 버킷은 빈 칸(0선만). 종목 간 같은 위치에서 「언제」 가 읽히고 VI · 잠김 공백이 보인다. 폰 390 막대 ≈ 7px(스케치 검증값). 최대 매집 창 음영 = `payload.window.start~end`, 첫 상한가 세로선 = `first_limit_ms`, 등락률 띠 = `buckets[].lo/hi`(% 그대로) · 20% 점선, 팀 비중 선 = `buckets[].share`(≥ 0.30 보라 강조).
- **D-14: 상세 순서 · 접힌 표.** 요약 문장(`payload.summary_lines[]` · HTML 은 `<b>` 만 허용 — sanitize 후 렌더) → [구간 가로 막대 | 거래원 2단 막대] 2열(폰 1열) → 10분 흐름 차트 → 판정 기준 접힘. 구간 차트 아래 「구간표 보기」(bands 표 · 「하루 합계」 행 포함 · 열 = gh-trade 샘플 표 6열), 10분 차트 아래 「10분 표 보기」(buckets 표 7열) — 기본 접힘. 거래원 = `payload.members.rows[]`(buy/sell/net null 허용) + `absent[]` → 「상위 5 밖: …」 한 줄. 팀 체결이 거의 없는 종목(동양고속형)도 빈 차트가 0선 · 축만으로 깨지지 않는다.

#### UAT · 픽스처 · 인박스
- **D-15: 라이브 UAT = 10/14 정식 경로.** gh-trade 가 재기록한 11일이 오늘 21:00 pull → 오늘 밤 옛 워커 재적재(team_flow 열 없음) → Phase 33 워커 배포 뒤 D-03 자동 감지로 team_flow 채움 → `/analytics/teamflow?d=20261014` 에서 에스엠벡셀 · 한선엔지니어링 · 동양고속(+천일고속) 실측으로 UAT. 프로덕션 DB 수동 주입 없음.
- **D-16: 픽스처 = 맥 샘플.** `~/ticks/teamflow/sample/20261014/team_flow.ndjson.gz`(34행 · sha256 `f6656ae2…d897` · 119 10/14 export 의 team_flow 와 같은 코드 · 같은 입력)를 워커 픽스처 `workers/limitup-sync/tests/fixtures/export/<date>/` 와 E2E 픽스처(`webapp/e2e/fixtures/`)의 원천으로 쓴다. 기존 픽스처 날짜 20261002 와 섞을지 별도 날짜로 둘지는 플래너 재량(manifest `files[]` 에 team_flow 항목 + rows + sha256 이 맞아야 한다).
- **D-17: 인박스 닫기.** `docs/inbox/from-gh-trade/261016-teamflow-export.md` 의 `status: done` · `done_commit` 을 phase 마지막 플랜(배포 뒤)에서 채워 **경로 지정** 커밋. gh-trade 세션(gh-trade-e0)에 처리 완료를 SendMessage 로 알린다(보조).

#### 배포 순서
- **D-18:** DB 마이그레이션(표 · CHECK · commit_day · purge · 보고서 RPC — 옛 워커 호환 D-03) → limitup-sync Job 재배포(`scripts/deploy-limitup-sync.sh` · **21:00~21:20 KST 밖**) → server → webapp push(= 프로덕션). radar-gw 변경 없음. 워커 배포 뒤 첫 실행(다음 21:20 또는 수동 `gcloud run jobs execute`)이 11일 + 10/16 team_flow 를 채운다.

### Claude's Discretion
- 표 · RPC · 라우트 · 파일 이름(`limitup_team_flow` · `teamflow_report_for_user` · `server/src/routes/teamflow-report.ts` · `webapp/src/app/analytics/teamflow/page.tsx` 류) · shared 타입 위치(`packages/shared/src/teamflow-report.ts`).
- 상한가 보고서 부품 재사용 범위: `parseYmdParam` · `dateNavOf` · `fmtYmd*` · `LimitupDateNav` · KpiStrip 레이아웃(라벨 하드코딩이라 prop 화 또는 복제) · DayGrid 아코디언(기본 펼침 · 8열 템플릿 · `rowButtonId` 가 하드코딩 — 일반화 vs teamflow 전용 복제는 플래너가 정한다).
- 사이드바 「팀 매집」 항목 위치(「상한가 보고서」 다음) · active 판정(`limitupActive` 와 같은 prefix 방식) · 문서 title · 빈 상태 문구(「21:20 뒤」 류 상한가 보고서 문구 변형).
- 판정 기준 접힘 본문 = gh-trade `team-flow.md` §3 · §4 · §5 요약을 웹에 **하드코딩**(export 에 규칙 텍스트 없음) · 출처 링크 없이 「gh-trade 팀 매집 분석 규칙」 한 줄 표기.
- `members` 가 null 인 종목 = 거래원 영역에 「거래원 자료 없음」 한 줄. `window` null = 음영 없음 · 요약 문장은 export 그대로.
- 폰 390 차트 폭 = 컨테이너 폭 100% `viewBox` 스케일(스케치와 같은 비율) · 구간 차트 막대 높이 · 접힌 표 가로 스크롤.
- 보존 90일 · 옛 워커 호환 분기 구현 방식 · `limitup_loads.rows` 키 검사 SQL 위치(워커 vs RPC).
- E2E 는 limitup-report.spec 동형(`page.route` 로 `/api/teamflow/report*` 모킹 · 390 폰 · 아코디언 1개 · 접힌 표 토글) · 단위 테스트는 변환 함수(억 · % · 9칸 슬롯 · 39칸 축) 중심.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (gh-trade 쪽 후속 — `b9_lower` · `worst[]` · `reach` payload 는 화면 미사용으로 적재만 한다. 쓰게 되면 그때 phase.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEAM-01 | `team_flow.ndjson.gz` 를 `gh-radar-limitup-sync` 가 기존 6표와 같은 규칙(sha256 대조 · 날짜 단위 교체)으로 `team_flow` 표(평평한 열 + `payload` jsonb)에 적재 · 파일 없는 날짜는 기존 적재에 영향 없음 | §「Export 스키마 정본」(열 29 + 타입 · payload 키 트리 · 실측 null 분포) · §「워커 통합 지점」(선택 파일 분기 · D-03 감지 · 청크) · §「SQL 지점」(CREATE OR REPLACE 패턴 · 옛 워커 호환 · CHECK 이름 · statement_timeout) · Pitfall 1~5 |
| TEAM-02 | 서버가 상한가 보고서와 같은 경로(RPC 1회 · DMA 게이트)로 날짜 목록 · 종목 행 · 상세 payload 제공 · 사이드바 「분석」 에 「팀 매집」 | §「보고서 RPC 골격」 · §「서버 지점」(route/service/schema 복제 · app.ts 등록 · 403) · §「shared 타입」 · §「사이드바」(NAV 상수 · 테스트 2곳) · Pitfall 6(응답 크기) |
| TEAM-03 | `/analytics/teamflow?d=` 목록 — 날짜 알약 → KPI 4칸 → 종목 행(결과 · 팀 순매수 · 20% 아래/위 · 매수 중 팀 · 9칸 미니막대 · 태그) → 아코디언(한 번에 하나 · 기본 전부 접힘) · 폰 390 2줄 카드 | §「웹 지점」(재사용 vs 복제 판정 · DayGrid 결합도) · §「표시 변환」(골든 값 · 10/14 KPI 실측 34·9·9·−26.3억) · §「스케치 014 이식」 |
| TEAM-04 | 행 펼침 상세 — 요약 → [구간 막대 · 거래원 2단] → 10분 흐름 → 판정 기준 · 접힌 표 2개 · 차트 규칙 | §「스케치 015 차트 이식」(함수 · 상수 · 축 매핑) · §「10분 축 실측」(key 93 = 15:30 종가 단일가 · key 92 0회) · Pitfall 7~9 |
</phase_requirements>

## Summary

이 phase 는 새 라이브러리가 0개인 「동형 복제 + 한 표 추가」 다. 적재 쪽은 `limitup_commit_day` 한 함수가 원자 교체의 유일한 자리라(마이그레이션 `20261006090200` 머리말) 표 하나를 7번째로 더하고 CHECK · purge 두 곳을 같이 고치면 된다. 기존 commit 함수는 이미 `v_e := coalesce((p_expected->>v_t)::integer, 0)`(`20261006090200_limitup_load_rpcs.sql:89`) 이라 **키가 없는 옛 워커 호출은 그대로 0행으로 통과한다** — D-03 호환은 시그니처를 바꾸지 않는 CREATE OR REPLACE 로 거저 얻는다. 단, **CREATE OR REPLACE 는 `ALTER FUNCTION … SET statement_timeout` 을 지운다**(PostgreSQL 문서 — 「All other function properties are assigned the values specified or implied in the command」). 120s 재진술은 선택이 아니라 필수다.

가장 중요한 함정은 D-03 감지와 D-02 「항상 team_flow 키」 의 상호작용이다. 새 commit 함수가 v_rows 에 `team_flow` 키를 **무조건** 쓰면, 오늘 밤 마이그레이션 뒤 옛 워커가 11일을 재적재할 때 `rows.team_flow = 0` 이 기록되고 「키 없음」 감지가 영영 안 켜진다(11일 team_flow 가 빈 채로 남는다). 그래서 (가) commit 함수는 **`p_expected ? 'team_flow'` 일 때만** 키를 쓰고, (나) 워커 감지는 「키 존재」 가 아니라 **`prev.rows.team_flow !== manifest team_flow rows`**(없으면 불일치) 로 판정하기를 권한다 — 둘 다 싸고, 둘 중 하나만 있어도 위 사고를 막는다.

실측 샘플(34행 · sha256 일치 확인)은 D-05 의 「payload ≈ 수 KB」 가 틀렸음을 보여 준다: payload 중앙값 14.6KB, 하루 34행 JSON ≈ 487KB(gzip ≈ 100KB). 상한가 보고서 응답도 ≈400KB(`webapp/src/lib/limitup-api.ts:17`)이고 server 는 이미 `compression` 미들웨어(`server/src/app.ts:81-87`)를 쓰므로 번들 결정은 유지해도 되지만, fetch 타임아웃 15초 동형 · stage insert 청크 축소(team_flow 만 ~20행)가 필요하다. 또 10분 버킷 `key` 93(15:30 종가 단일가 체결)이 34행 중 33행에 있고 key 92(15:20)는 0행이라, D-13 의 39칸(54~92) 축은 **종가 단일가 체결을 항상 버리고 마지막 칸은 항상 빈다** — 사용자 확인이 필요한 유일한 화면 쪽 질문이다(Open Questions 1).

**Primary recommendation:** 마이그레이션 2개(표+적재 3곳 / 보고서 RPC) → 워커(선택 파일 · 개수 기반 재적재 감지 · team_flow 소청크) → server/shared 복제 → 웹(DayGrid · KpiStrip 은 **복제**, LimitupDateNav · 날짜 헬퍼 · DmaGate 는 재사용) 순으로 짜고, pgTAP 2파일 + 워커 vitest + server vitest + 웹 vitest + E2E 1 spec 으로 잠근다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| export 파일 운반(119 → GCS) | 외부(radar-gw limitup-pull) | — | 변경 없음 — `--delete` 미러가 `team_flow.ndjson.gz` 를 자동 포함(`docs/relay-operations.md` 운반기 절) |
| 파일 검증 · 선택 파일 분기 · 재적재 감지 | Cloud Run Job 워커(`workers/limitup-sync`) | — | manifest/sha/행 수 판정은 이미 워커가 정본 |
| 날짜 원자 교체(7표 DELETE→INSERT) | Database(plpgsql `limitup_commit_day`) | — | PostgREST 는 요청 간 트랜잭션을 못 잇는다(`20261006090200` 머리말 9~11행) |
| 보존 90일 | Database(`limitup_purge_old`) | 워커(run 끝 호출) | 기존 구조 그대로 |
| DMA 게이트 · 날짜 목록 · 하루 번들 | Database(`teamflow_report_for_user`) | API(403 변환) | 왕복 1회 원칙 · 게이트 정본은 RPC 안 `dma_visible_accounts` |
| 인증 · 입력 검증 · 403/500 매핑 | API(Express 라우트 · zod) | — | `limitup-report` 라우트와 동형 |
| 정렬 · KPI · 억/% 변환 · 9칸 · 39칸 · `<b>` 토큰화 | Browser(`lib/teamflow-report.ts`) | — | D-04/D-10 — DB 는 원 단위 그대로, 표시 변환은 웹 한 모듈 |
| 차트 3종 · 아코디언 · 접힌 표 | Browser(React 순수 SVG) | — | D-12 라이브러리 없음 |
| 라우트 보호(미인증) | Frontend Server(Next middleware) | — | 공개 whitelist 밖 경로는 기본 차단(`webapp/src/lib/supabase/middleware.ts:15,58-62`) — 새 경로 추가 작업 없음 |

## Project Constraints (from CLAUDE.md · 자동 메모리)

- **Supabase RPC 는 `REVOKE … FROM PUBLIC` + `REVOKE … FROM anon, authenticated` + `GRANT … TO service_role` 3줄 명시**(auto-grant 가 PUBLIC REVOKE 를 덮는다 — 메모리 `feedback_supabase_rpc_revoke` · 기존 마이그레이션 전부 이 형태).
- **표는 RLS 활성 + 정책 0개 + 같은 REVOKE 3줄 + service_role 4권한**(`20261006090100_limitup_tables.sql:251-300` · 주석 「접근 규칙(POLICY)을 추가하지 말 것」). D-06.
- **데이터 소스 운영 기준:** team_flow 는 스크래핑도 공식 API 도 아니다(자체 119 배치 export) — 5원칙 대상 아님. 사용자 트래픽과 무관한 고정 배치(21:20) 1회 적재 · 웹은 캐시(DB)만 읽는다는 성질은 이미 만족.
- **사용자 대면 문구는 한글**(UI-SPEC Copywriting 정본).
- **배포:** 서브에이전트(executor)는 커밋까지만, 배포는 메인 세션(메모리 `feedback_subagent_deploy_classifier`) · 배포 명령은 허용 규칙 접두사 그대로 — `supabase db push --linked --yes`(파이프 · `yes |` 금지 — `feedback_deploy_cmd_match_allow_rule`) · 워커 배포 스크립트 env `GCP_PROJECT_ID` + `SUPABASE_URL` 필수, server 는 `CORS_ALLOWED_ORIGINS` 도(라이브 Cloud Run env 에서 추출 — `reference_deploy_worker_env`) · Deployer SA `GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json` + `CLOUDSDK_CORE_PROJECT=gh-radar` · **push 자체가 webapp 프로덕션 배포** — 백엔드(DB · Job · server)가 막히면 push 하지 않는다(`feedback_deploy_relay_before_push`).
- **테스트 자원:** vitest `--maxWorkers=2` · playwright `--workers=1`(동시 세션 메모리 고갈 — `project_mac_freeze_concurrent_tests_261010`). Playwright webServer 타임아웃이면 `rm -rf webapp/.next`.
- **동시 세션:** Phase 32 가 같은 working tree 에서 플랜 중 — `git add <경로>` 경로 지정 · 긴 execute 는 전용 worktree(`feedback_concurrent_session_commit_race`).
- **커밋:** 한글 메시지 · Co-Authored-By 넣지 않기(사용자 전역 CLAUDE.md).
- **보안 리뷰 생략:** `.planning/config.json` `security_enforcement: false`(메모리 `feedback_no_security_review`) — 이 문서는 Security Domain 절을 두지 않는다. Nyquist(`nyquist_validation: true`)는 유지.
- **인박스:** 처리 후 노트 `status: done` · `done_commit` 채우고 **경로 지정** 커밋(CLAUDE.md 「gh-trade 인박스」).

## Standard Stack

이 phase 는 **새 패키지를 설치하지 않는다**(D-12 · UI-SPEC Registry Safety). 아래는 이미 있는 스택의 확인값이다.

### Core (기존 · 버전은 이번 세션 `package.json` 에서 읽음)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Postgres (Supabase) | 17.x — pgTAP 러너 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` | 표 · plpgsql RPC | [VERIFIED: scripts/verify-dma-orders-price-check.sh:34] |
| @supabase/supabase-js | worker `^2.49.0` · webapp `2.103.2` | stage insert · rpc | [VERIFIED: workers/limitup-sync/package.json · webapp/package.json] |
| express | `^5.2.1` · zod `^4.0.0` · compression `^1.8.2` | 라우트 · 쿼리 검증 · gzip | [VERIFIED: server/package.json:22,24,31] |
| next / react | `^15.0.0` / `^19.0.0` | 페이지 · 컴포넌트 | [VERIFIED: webapp/package.json:24,27] |
| lucide-react | `^1.8.0` | `ChevronDown` · `ChevronRight` 2개 | [VERIFIED: webapp/package.json:23] |

### Supporting (테스트)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | worker `^3.0.0` · server `^4.1.4` · webapp `^2.1.9` | 단위 · 라우트 · RTL | 패키지별 버전이 다르다 — 명령은 각 패키지 `exec vitest run` |
| @playwright/test | `^1.59.1` | E2E | `withLocalRelay` 픽스처(DMA 매핑 사용자 → 사이드바 「분석」 노출) |
| pgTAP | 러너가 컨테이너 안에서 `CREATE EXTENSION pgtap` | SQL 회귀 | `supabase/tests/limitup_load.test.sql` · `limitup_report.test.sql` 확장/동형 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 순수 SVG | recharts(`ui/chart` 설치돼 있음) · lightweight-charts | D-12 로 금지 — 고정 39칸 축 · 1:1 viewBox 11px 글자 계약을 라이브러리로 맞추는 비용이 더 크다 |
| DayGrid 일반화 | teamflow 전용 복제 | 아래 「웹 지점」 — **복제 권장** |

**Installation:** 없음.

## Package Legitimacy Audit

이 phase 는 외부 패키지를 설치하지 않는다 — 감사 대상 0.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Export 스키마 정본 (연구 초점 1)

정본 코드: `/Users/alex/repos/gh-trade/server/tools/analysis/tickana/teamflow.py` `export_row`(843~873행) · `detail_stock`(553~599행) · `bucket_rows`(482~496행) · `top_window`(499~515행) · `member_rows`(518~550행), 파일 쓰기 `export.py` `write_day`(254~291행). gh-trade HEAD 41fa8405 기준 `teamflow.py` 의 마지막 변경은 8f29a461(quick-261016-ex1) — 인박스 노트(8f29a461~8e670584)와 같은 코드다. [VERIFIED: `git log -- teamflow.py`]

### 샘플 검증 (이번 세션 실행)
- `shasum -a 256 ~/ticks/teamflow/sample/20261014/team_flow.ndjson.gz` → `f6656ae29779b127a46322197cb440be0b1efe9900d13d7ca038b290db37d897` (노트와 일치) · 압축 96,604B · 해제 450,015B · **34행** · isin 오름차순 · 키 순서 34행 모두 같음 · `schema_version` 전부 `1` · `date` 전부 `"20261014"` · `bucket_min` 전부 `10`. [VERIFIED: 샘플 파이썬 분석]
- `「하루 합계」.net_val == team_net_val` 34행 전부 참(노트 46행 정의 확인).

### 평평한 열 29개 + schema_version + payload — SQL 타입 권장

`export_row` 의 `rec = dict(...)` 키 순서 그대로(teamflow.py:847~858) — 샘플 타입 분포는 34행 실측.

| # | 열 | 코드 출처 | 샘플 타입(34행) | SQL 타입 | null |
|---|---|---|---|---|---|
| 1 | `date` | `d["date"]` | str | `text NOT NULL` | PK |
| 2 | `isin` | | str | `text NOT NULL` | PK |
| 3 | `short_code` | `isin[3:9]` | str | `text` | 이론상 없음 |
| 4 | `name` | entries A0(`names.get(isin)`) | str 34 | `text` | 가능(노트 30행) |
| 5 | `market` | `MARKET_LABEL.get(...)` S→KOSPI · Q→KOSDAQ | str 34 (KOSDAQ 21 · KOSPI 13) | `text` | 가능 |
| 6 | `base` | | int | `bigint` | |
| 7 | `upper` | | int | `bigint` | |
| 8 | `first_limit_ms` | `_ms(first_limit_ns)` | int 15 · **null 19** | `bigint` | 미도달 |
| 9 | `first_limit_auction` | `bool(len(lim) and …)` | **bool 34(null 0)** | `boolean` | 코드상 항상 bool |
| 10 | `last_ms` | | int | `bigint` | |
| 11 | `last_px` | | int | `bigint` | |
| 12 | `last_rate` | `round(…, 1)` | float | `double precision` | |
| 13 | `status` | `"limit" if last_px == upper else "below"` | str (below 25 · limit 9) | `text` | |
| 14 | `volume` | | int (최대 23,588,891) | `bigint` | |
| 15 | `value` | | int (최대 112,599,046,510 > int4) | `bigint` | |
| 16 | `team_buy_val` | 「하루 합계」 band | int | `bigint` | |
| 17 | `team_sell_val` | | int | `bigint` | |
| 18 | `team_net_val` | | int (≤0 이 25행 · 0 이 3행) | `bigint` | |
| 19 | `team_buy_share` | `_ratio(team_buy, buy_aggr)` | float 31 · **null 3** | `double precision` | 분모 0 |
| 20 | `below20_net_val` | | int | `bigint` | |
| 21 | `above20_net_val` | `pre20.net_val` | int | `bigint` | |
| 22 | `limit_team_buy_val` | `lim.vol` 있을 때만 | int 15 · null 19 | `bigint` | |
| 23 | `limit_team_sell_val` | | int 15 · null 19 | `bigint` | |
| 24 | `reach_team_share` | `rc` 있을 때만 | float 12 · null 22 | `double precision` | |
| 25 | `reach_team_val` | | int 12 · null 22 | `bigint` | |
| 26 | `b9_lower` | `int(round(res[0]))` or None | int 34 | `bigint` | 가능 |
| 27 | `high_px` | | int | `bigint` | |
| 28 | `high_rate` | `round(…, 1)` | float | `double precision` | |
| 29 | `high_ms` | | int | `bigint` | |
| — | `schema_version` | 인자 | int | `integer` | |
| — | `payload` | dict | object | `jsonb` | |

- 기존 표 관례(「PK 열 밖은 전부 NULL 허용」 — `20261006090100_limitup_tables.sql:14`)대로 PK 2열만 NOT NULL. `status` 에 CHECK 를 걸지 않는다 — gh-trade 가 값을 하나 늘리면 **그날 commit 전체가 실패**한다(entries 등도 CHECK 없음). [VERIFIED: 마이그레이션 원문]
- 예약어: 29열 중 따옴표가 필요한 것은 없다(`value` · `upper` · `name` · `status` 는 PG 비예약 키워드/함수명). [ASSUMED — PG 키워드 표 미조회 · 낮은 위험: pgTAP 재생이 즉시 잡는다]
- `jsonb_populate_record` 는 「출력 열이 json/jsonb 면 JSON 값을 그대로 복제」 하고 「열과 맞지 않는 키는 무시 · 키 없는 열은 NULL」 이다 [CITED: postgresql.org/docs/17/functions-json.html]. 같은 저장소에 선례가 있다 — `limitup_facts."values" jsonb` 에 중첩 객체가 그대로 들어가고 pgTAP 이 `"values"->>'krw'` 로 확인한다(`supabase/tests/limitup_load.test.sql:45,65-66`). 즉 export 행의 `payload` 키 → `payload jsonb` 열은 추가 코드 없이 들어간다. [VERIFIED: 코드 + 문서]
- 숫자 열 타입 주의: JSON 숫자는 「텍스트 표현을 열 입력 함수에」 넣는다 [CITED: 같은 문서] — `29.8` 을 `bigint` 열에 넣으면 그날 commit 이 통째로 실패한다. 그래서 `*_rate` · `*_share` 는 반드시 `double precision`.

### payload 키 트리 (코드 정본 · 샘플 확인)

```
payload
├─ bands[]            # detail_stock bands + share 덧입힘 (teamflow.py:866)
│   └─ {label, vol, val, buy_aggr, sell_aggr, team_buy, team_sell, net, team_buy_val, team_sell_val, net_val, share}
│       share = _ratio(team_buy, buy_aggr) → 0~1 | null(분모 0 — 샘플 59칸)
│       label 순서 고정: "0% 미만"(체결 있을 때만 — 샘플 17/34) · "0~5%" · "5~10%" · "10~15%" · "15~20%" · "20~25%" ·
│                       "25~28%" · "28%~상한 미만" · "상한가 가격"(lim.vol 있을 때만 — 샘플 15/34) · "하루 합계"(항상 마지막)
├─ buckets[]          # bucket_rows — 체결 있는 버킷만, key 오름차순 (teamflow.py:482-496, 867)
│   └─ {key, start "HH:MM", lo, hi, share, vol, val, buy_aggr, sell_aggr, team_buy, team_sell, net, team_buy_val, team_sell_val, net_val}
│       lo/hi = 등락률 % 원값 float(반올림 없음 — 예 21.089223638470457) · share 0~1 | null(샘플 269칸)
├─ bucket_min         # 10 (노트는 buckets 줄 안에 「bucket_min = 10」 으로만 적음 — 실제는 payload 최상위 키)
├─ window             # top_window — 없으면 null(샘플 4/34)
│   └─ {i, j, start "HH:MM", end "HH:MM"(마지막 버킷 끝 분 = start+9), lo, hi(%), net_val, share_lo, share_hi(0~1)}
│       share_lo/hi 는 버킷 % share(_share — 분모 0 이면 0.0, null 아님) ÷ 100 → 항상 숫자
├─ worst[]            # {start, net_val} 최대 3 — 화면 미사용
├─ reach              # {t_ms, buy, team, team_val} | null — 화면 미사용
├─ members            # member_rows — B9 없으면 null(샘플 0/34)
│   └─ {time "HH:MM", rows[{member, name, buy, sell, net}], absent[이름…], total{buy,sell,net}|null,
│       top_buy{member,name,qty}, top_sell{member,name,qty}}
│       rows 순서 = net 있는 행 net 내림차순 → net null 행(한쪽만 상위 5) 뒤 · null 칸 있는 행 샘플 19개
│       total = 행 2개 이상이고 null 행이 없을 때만(샘플 null 15/34)
│       time 은 15:30 이후일 수 있다(샘플 "19:50" · "20:00" — B9 마지막 스윕 시각)
└─ summary_lines[]    # 3~5줄(샘플 4줄 20 · 5줄 13 · 3줄 1) · 태그는 <b> · </b> 만(각 160회 — 다른 태그 0)
```

### 노트 ↔ 코드 차이 (코드가 맞다 — gh-trade 에 알릴 것)
1. `first_limit_auction` — 노트는 「그 체결이 단일가(VI)였나」 만 적었지만 코드는 **상한가 체결이 없어도 `false`(null 아님)** 다(`bool(len(lim) and …)` teamflow.py:262). 웹은 이 값을 쓰지 않으므로 영향 없음.
2. `bucket_min` — 노트는 buckets 설명 안에 적었지만 실제는 **payload 최상위 키**(teamflow.py:868).
3. `window.share_lo/hi` — 노트에 단위 표기 없음. 코드는 `÷100` 으로 **0~1**, 분모 0 이어도 0(null 아님)(teamflow.py:869 · `_share` 478-479).
4. `members.time` 이 장 마감 뒤일 수 있다 — 노트에 언급 없음(샘플 에스엠벡셀 "19:50" · 한선 "20:00"). UI-SPEC 캡션 「{members.time} 기준 하루 누적」 은 그대로 맞다(사실 표기).
5. 인박스 「gh-radar 가 할 일」 4번째 항목(이미 적재된 날짜는 `files_sig` 를 NULL 로)은 **D-03 자동 감지로 대체**됐다 — 인박스를 닫을 때 그 사실을 한 줄 남긴다.

### 10/14 실측 골든 (단위 · E2E 단언 원천)
- KPI: 탐지 **34** · 팀 순매수 종목(`team_net_val > 0`) **9** · 상한가 도달(`status === "limit"`) **9** · 팀 순매수 합 **−2,629,083,913원 → 「−26.3억」**. [VERIFIED: 샘플 계산]
- 정렬(D-08) 상위 5: 한선엔지니어링 +5.9억(below) · 제주항공 +4.6억(below) · 천일고속 +4.1억(limit) · 도우인시스 +2.5억(below) · 동양고속 +2.2억(below).
- UAT 4종목:

| 종목 | isin | status | team_net_val | first_limit KST | window | 비고 |
|---|---|---|---|---|---|---|
| 천일고속 | KR7000650002 | limit | +410,594,300 | 11:50:30 | 12:00~12:09 | members 4행 · 교보 sell null · absent [유진] · total null |
| 에스엠벡셀 | KR7010580009 | limit | −112,514,343 | 14:17:30 | 14:10~14:19 | 「0% 미만」 · 「상한가 가격」 행 둘 다 있음 · members.time "19:50" |
| 동양고속 | KR7084670009 | below 22.1% | +215,192,650 | null | 12:00~12:19 | 팀 거의 없음(team_buy_share 0.020) · 「0~5%」 share 0.0 |
| 한선엔지니어링 | KR7452280001 | below 26.9% | +586,497,190 | null | 09:10~09:59 | 20% 아래 +17.5억 · 위 −11.6억 |

- `window` null 4행(CJ씨푸드1우 · 하이퍼코퍼레이션 · 바이오인프라 · 1행) · `team_buy_share` null 3행(모두 team_net_val 0 → 「0.0억」 · 「—」).

## 10분 축 실측 (연구 초점 8 보강 — D-13 과 직결)

`bucket_rows` 의 `key = (KST 하루 ns) // (10분)`(teamflow.py:487-488). 샘플 34행 key 분포: 54(09:00)~91 이 대부분 행에 있고, **key 92(15:20) = 0행, key 93(15:30) = 33행**. key 93 은 종가 단일가 체결(15:20~15:30 접수 → 15:30:00 체결)이다 — 예 천일고속 key 93 `{vol: 40, buy_aggr: 0, share: null, lo == hi == 29.78}`. [VERIFIED: 샘플]

즉 D-13 그대로(54~92 · 범위 밖 버림 — UI-SPEC T11 `bucketSlotsOf`)면:
- 39번째 칸(15:20)은 **사실상 항상 빈 칸**이고, 종가 단일가 체결은 차트에서 빠진다(표에는 남는다).
- 종가 단일가는 단일가라 공격 방향이 없어 팀 막대 · 비중 선에는 영향 0(buy_aggr 0 · share null). 등락률 띠의 마지막 값만 빠진다.
- → Open Questions 1 로 올린다(「key 93 을 슬롯 38(15:20 칸 = 종가 접수 구간)에 접어 넣을까」). 결정 전까지는 D-13 · UI-SPEC 그대로 구현한다.

## 워커 통합 지점 (연구 초점 2)

### 현재 동작 (원문 인용)
- `EXPORT_TABLES` — `export const EXPORT_TABLES = ["entries", "locks", "jumps", "member_alloc", "facts", "touches"] as const;` · `export type StageTbl = ExportTbl | "grid_summary" | "member_daily";` [VERIFIED: workers/limitup-sync/src/load.ts:13,16]
- `KNOWN_SCHEMA_VERSIONS` — `new Set([1, 2])` [VERIFIED: src/manifest.ts:19] → `schema_version 1` 통과.
- `NAME_RE` — `/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/` [VERIFIED: src/manifest.ts:38] → `team_flow.ndjson.gz` 허용. 그래서 지금 워커는 이 파일을 `filesSig` · `verifyFiles` 에는 넣고(sha 대조 통과) 적재에는 쓰지 않는다 — 노트 74행 「모르는 파일은 sha 대조만 하고 통과」 와 일치.
- `filesSig` = `files[]` 를 name 정렬한 `name:sha256\n` 의 sha256(src/manifest.ts:87-93) → team_flow 가 생기면 sig 가 바뀐다 → 오늘 밤 11일 재적재(CONTEXT `<domain>` 대로).
- 이력 select — `sb.from("limitup_loads").select("date, files_sig, skip_streak").gte("date", since)` (src/index.ts:131) · `prev` 맵은 `{ sig, streak }` 만 든다(128·134행). **`rows` 를 읽지 않는다** → D-03 을 위해 `"date, files_sig, skip_streak, rows"` 로 넓히고 맵에 `rows` 를 담는다.
- unchanged 판정 — `if (p?.sig === sig) { … return; }` (src/index.ts:201-214) → 여기에 「team_flow 재적재 필요」 조건을 끼운다.
- 필수 파일 throw — `for (const t of EXPORT_TABLES) { … if (!entry) throw new Error(\`${date}: manifest has no ${name}\`); … if (rows.length !== entry.rows) throw … }` (src/index.ts:223-233). team_flow 는 이 루프 **밖**에서 처리한다(D-02).
- stage — `stageDay(sb, date, { ...tables, grid_summary, member_daily }, config.stageChunk)` (262행) · 청크 기본 `LIMITUP_STAGE_CHUNK` 1000(src/config.ts:62).
- commit — `commitDay(sb, { …, expected: counts })` (264-270행) · `counts = emptyCounts()` 는 `STAGE_TABLES = [...EXPORT_TABLES, "grid_summary", "member_daily"]`(102행)로 만든다.

### 권장 변경 (구체)
```ts
// load.ts — EXPORT_TABLES 는 그대로 둔다(D-02: 필수 6표 루프 · dry-run 합계 테스트가 이 목록을 순회한다)
export const TEAM_FLOW_FILE = "team_flow.ndjson.gz";
export type StageTbl = ExportTbl | "grid_summary" | "member_daily" | "team_flow";
/** team_flow 행 ≈ 14KB(10/14 실측 중앙값) — 기존 증명된 insert 크기(member_alloc 1000행 ≈ 293KB)에 맞춘 청크 */
export const TEAM_FLOW_STAGE_CHUNK = 20;

// index.ts loadDay — unchanged 판정 앞
const tf = m.files.find((f) => f.name === TEAM_FLOW_FILE);
const prevTf = p?.rows?.team_flow;                       // limitup_loads.rows 에서
const needTeamFlow = tf !== undefined && prevTf !== tf.rows; // 키 없음(undefined) 포함 — Pitfall 1
if (p?.sig === sig && !needTeamFlow) { /* 기존 unchanged */ }
// … 필수 6표 루프 뒤
let teamFlow: Row[] = [];
if (tf) {
  teamFlow = readNdjsonGz(join(config.exportDir, date, TEAM_FLOW_FILE));
  if (teamFlow.length !== tf.rows) throw new Error(`${date}: ${TEAM_FLOW_FILE} rows ${teamFlow.length} != manifest ${tf.rows}`);
}
counts.team_flow = teamFlow.length;                       // 항상 키(0 포함) — D-02
// stage: team_flow 만 작은 청크로 따로 부른다
await stageDay(sb, date, { ...tables, grid_summary, member_daily }, config.stageChunk);
await stageDay(sb, date, { team_flow: teamFlow }, Math.min(config.stageChunk, TEAM_FLOW_STAGE_CHUNK));
```
- 로그: 재적재 사유를 구분해 남긴다(예 `{ reason: sigChanged ? "files_sig" : "team_flow_backfill" }`) — 운영자가 오늘 밤/내일 첫 run 의 12일 재적재를 「이상」 으로 오인하지 않게.
- 재적재 비용: sig 가 같아도 전체(6표 + 격자 업로드 + team_flow)를 다시 한다 — 첫 run 에 12일. 기존 실측 commit 5.6~10.9초/일(src/index.ts:55) · 격자 업로드 포함해도 Job task-timeout 1800s(`scripts/deploy-limitup-sync.sh` 머리말 14행) 안. [VERIFIED: 코드 주석 · 스크립트]
- `DispatchResult.rows/totals` 는 `Record<StageTbl, number>` 라 `team_flow` 가 자동으로 들어간다(src/index.ts:74-75).

### 기존 테스트 중 깨지는 단언 (플래너가 같은 플랜에서 고칠 것)
| 파일:행 | 현재 단언 | 바뀌는 이유 |
|---|---|---|
| `tests/load.test.ts:78` | `expect(select.cols).toBe("date, files_sig, skip_streak")` | D-03 이 `rows` 를 읽는다 |
| `tests/load.test.ts:103` | `p_expected` 키 = `STAGE_TABLES` 8개 | team_flow 키 추가(9개) |
| `tests/dispatch.test.ts:436,479-481` | `EXPECTED8` · `toHaveLength(8)` · `totals: EXPECTED8` | `team_flow: 0` 추가 |
| `tests/helpers/fake-supabase.ts:43` | `LoadRow = { date; files_sig; skip_streak }` | `rows?: Record<string, number> \| null` 추가 |
| `tests/dispatch-dryrun-totals.test.ts:72-74` | `EXPORT_TABLES` 순회 | **안 깨짐** — team_flow 를 `EXPORT_TABLES` 에 넣지 않으면 그대로(넣으면 깨진다 — D-02 근거 하나 더) |

### 픽스처 배치 (D-16 — 플래너 재량에 대한 권장)
- **`tests/fixtures/export/` 아래에 새 날짜 디렉터리(manifest 포함)를 두지 마라.** `load.test.ts` 는 `LIMITUP_EXPORT_DIR = FIXTURE`(커밋된 디렉터리 직접 — load.test.ts:39 `process.env.LIMITUP_EXPORT_DIR = FIXTURE;`)이고 `NOW = 2026-10-05` 의 `since` 는 약 07-07 이라, `20261014/manifest.json` 이 생기면 load.test 가 날짜 2개를 보고 기존 단언이 깨진다. (`listExportDates` 는 manifest 없는 디렉터리를 무시하므로 — src/manifest.ts:45 — manifest 만 없으면 무해하긴 하다.)
- 권장: 샘플을 **바이트 그대로** `workers/limitup-sync/tests/fixtures/team_flow/20261014/team_flow.ndjson.gz` 에 복사(sha `f6656ae2…d897` 유지 · 96.6KB). dispatch 테스트는 기존 문법 `addDay(date, edit)`(dispatch.test.ts:44-58 — 20261002 픽스처를 tmp 의 다른 날짜로 복사하고 manifest date · 격자 date 를 고쳐 쓴다)로 `20261014` 날을 만들고, team_flow 파일을 그 디렉터리에 복사 + `edit` 로 `files.push({ name: "team_flow.ndjson.gz", rows: 34, sha256: "f6656ae2…" })` 한다. (6표 행의 `date` 는 20261002 로 남지만 가짜 Supabase 는 payload date 를 보지 않는다 — BAD=20261001 사본이 이미 같은 방식이다.)
- 웹 단위/E2E 는 같은 파일을 `node:fs` 로 읽는 `webapp/src/test-fixtures/teamflow-export.ts` 를 둔다(선례 `src/test-fixtures/limitup-export.ts:31` 의 `DIR = path.resolve(__dirname, '../../../workers/limitup-sync/tests/fixtures/export', EXPORT_DATE)`). E2E 픽스처 `e2e/fixtures/teamflow-report.ts` 는 그것을 감싸 응답 봉투를 만든다(선례 `e2e/fixtures/limitup-report.ts` 가 `@/test-fixtures/limitup-export` 를 import).

## SQL 지점 (연구 초점 3)

### 원문 인용
- stage CHECK — `tbl text NOT NULL CHECK (tbl IN ('entries', 'locks', 'jumps', 'member_alloc', 'facts', 'touches', 'grid_summary', 'member_daily')),` [VERIFIED: 20261006090100_limitup_tables.sql:188-189] — **열 인라인 이름 없는 CHECK** 다.
- `limitup_loads."rows" jsonb` — 「표별 실제 삽입 행 수」 [VERIFIED: 같은 파일 201행].
- commit 함수 시그니처 `public.limitup_commit_day(p_date text, p_manifest_sha256 text, p_files_sig text, p_schema_version integer, p_expected jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp` [VERIFIED: 20261006090200_limitup_load_rpcs.sql:51-62]
- `v_tbls constant text[] := ARRAY['entries', 'locks', 'jumps', 'member_alloc', 'facts', 'touches', 'grid_summary', 'member_daily'];` (65-66행) · 행 수 대조 `v_e := coalesce((p_expected->>v_t)::integer, 0);` (89행) · 표마다 `DELETE FROM public.limitup_<t> WHERE date = p_date; INSERT INTO public.limitup_<t> SELECT (jsonb_populate_record(NULL::public.limitup_<t>, s.payload)).* FROM public.limitup_stage s WHERE s.date = p_date AND s.tbl = '<t>' ORDER BY s.seq; GET DIAGNOSTICS v_n = ROW_COUNT; v_rows := v_rows || jsonb_build_object('<t>', v_n);` (99-153행) · 이력 upsert(156-166행) · stage 비움(168행).
- 권한 3줄 — `REVOKE ALL ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) FROM PUBLIC;` / `… FROM anon, authenticated;` / `GRANT EXECUTE … TO service_role;` (200-202행)
- 타임아웃 — `ALTER FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) SET statement_timeout = '120s';` + 권한 3줄 재진술 + 트랜잭션 밖 `NOTIFY pgrst, 'reload schema';` [VERIFIED: 20261006090500_limitup_commit_day_timeout.sql:22-31]
- purge — `limitup_purge_old(p_keep_days integer, p_alloc_keep_days integer)` 안 `DELETE FROM public.limitup_<t> WHERE date < v_cutoff; GET DIAGNOSTICS v_n = ROW_COUNT; v_out := v_out || jsonb_build_object('<t>', v_n);` 반복 · 권한은 `REVOKE EXECUTE … FROM PUBLIC` / `FROM anon, authenticated` / `GRANT EXECUTE … TO service_role` [VERIFIED: 20261006090300_limitup_retention_storage.sql:28-76]
- 보고서 게이트 — `IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN RETURN jsonb_build_object('access', false); END IF;` [VERIFIED: 20261006090400_limitup_report_rpcs.sql:57-59] · `dma_visible_accounts(p_user_id uuid)` 정의는 20260929190000:113 (Phase 29 v2 뷰 교체 뒤에도 같은 시그니처 — 20261007200100 머리말 9행).
- 열 추가 선례 `20261006120000_limitup_locks_lock_risk.sql` — 「이 마이그레이션 **전에** 새 키가 실린 날짜가 적재되면 jsonb_populate_record 가 모르는 키를 버리고 files_sig 는 같아 다시 적재되지 않는다」(21-22행). 이번엔 D-03 이 이 구멍을 자동으로 메운다.

### CREATE OR REPLACE 로 옛 워커 호환이 되는가 — 예
- 인자 타입 · 반환 타입을 그대로 두면 CREATE OR REPLACE 로 본문만 바꿀 수 있고, 「ownership and permissions … do not change」 [CITED: postgresql.org/docs/17/sql-createfunction.html]. 시그니처가 같으므로 옛 워커의 `sb.rpc("limitup_commit_day", { p_date, p_manifest_sha256, p_files_sig, p_schema_version, p_expected })`(workers/limitup-sync/src/load.ts:65-71)가 그대로 맞는다.
- 옛 워커 호출: `p_expected` 에 `team_flow` 키 없음 → 89행 `coalesce(…, 0)` → stage team_flow 0행과 일치 → 통과. **본문 변경 없이 이미 호환이다.**
- **반드시 재진술:** 같은 문서 — 「All other function properties are assigned the values specified or implied in the command」 → CREATE OR REPLACE 는 `20261006090500` 의 `statement_timeout = '120s'` 를 **지운다**. 같은 마이그레이션에서 `ALTER FUNCTION … SET statement_timeout = '120s'` 를 다시 쓰고, 끝에 `NOTIFY pgrst, 'reload schema';`(PostgREST 가 함수 속성을 `SET LOCAL` 로 끌어올리려면 스키마 캐시가 다시 읽어야 한다 — 20261006090500 머리말 10-13행). 권한은 보존되지만 프로젝트 관례대로 3줄 재진술.

### 권장 마이그레이션 골격 (파일 1 — `20261016200000_limitup_team_flow.sql` 류 · 타임스탬프는 최신 `20261010200100` 보다 뒤 · Phase 32 는 마이그레이션 없음 확인)
```sql
BEGIN;
CREATE TABLE public.limitup_team_flow (
  date text NOT NULL, isin text NOT NULL, short_code text, name text, market text,
  base bigint, upper bigint, first_limit_ms bigint, first_limit_auction boolean,
  last_ms bigint, last_px bigint, last_rate double precision, status text,
  volume bigint, value bigint,
  team_buy_val bigint, team_sell_val bigint, team_net_val bigint, team_buy_share double precision,
  below20_net_val bigint, above20_net_val bigint,
  limit_team_buy_val bigint, limit_team_sell_val bigint,
  reach_team_share double precision, reach_team_val bigint, b9_lower bigint,
  high_px bigint, high_rate double precision, high_ms bigint,
  schema_version integer, payload jsonb,
  PRIMARY KEY (date, isin)
);
ALTER TABLE public.limitup_team_flow ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_team_flow FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_team_flow FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_team_flow TO service_role;

-- stage CHECK: 이름 없는 인라인 CHECK 의 PG 기본 이름 = <표>_<열>_check
ALTER TABLE public.limitup_stage DROP CONSTRAINT limitup_stage_tbl_check;   -- IF EXISTS 쓰지 말 것(Pitfall 3)
ALTER TABLE public.limitup_stage ADD CONSTRAINT limitup_stage_tbl_check CHECK (tbl IN (
  'entries','locks','jumps','member_alloc','facts','touches','grid_summary','member_daily','team_flow'));

CREATE OR REPLACE FUNCTION public.limitup_commit_day(p_date text, p_manifest_sha256 text, p_files_sig text,
  p_schema_version integer, p_expected jsonb) RETURNS jsonb … AS $$
  -- v_tbls 에 'team_flow' 추가(대조 루프는 그대로 — 키 없으면 0)
  -- 8쌍 뒤에 9번째 쌍:
  DELETE FROM public.limitup_team_flow WHERE date = p_date;
  INSERT INTO public.limitup_team_flow
    SELECT (jsonb_populate_record(NULL::public.limitup_team_flow, s.payload)).*
      FROM public.limitup_stage s WHERE s.date = p_date AND s.tbl = 'team_flow' ORDER BY s.seq;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF p_expected ? 'team_flow' THEN                       -- Pitfall 1: 옛 워커 호출은 키를 남기지 않는다
    v_rows := v_rows || jsonb_build_object('team_flow', v_n);
  END IF;
  …
$$;
ALTER FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) SET statement_timeout = '120s';
-- REVOKE PUBLIC / REVOKE anon, authenticated / GRANT service_role (commit_day)

CREATE OR REPLACE FUNCTION public.limitup_purge_old(p_keep_days integer, p_alloc_keep_days integer) … 
  -- 기존 줄 + DELETE FROM public.limitup_team_flow WHERE date < v_cutoff; … 'team_flow'
-- REVOKE/GRANT purge 3줄 재진술 (purge 는 ALTER SET 속성이 없어 잃을 것 없음)
COMMIT;
NOTIFY pgrst, 'reload schema';
```
- `limitup_stage_tbl_check` 이름은 PostgreSQL 기본 명명 규칙(인라인 열 CHECK → `<table>_<column>_check`)에서 온 것이다. [ASSUMED — 원격 카탈로그 미조회] 그래서 `IF EXISTS` 없이 정확한 이름으로 DROP 해 이름이 틀리면 **마이그레이션이 실패**하게 하고(조용한 미적용 방지), pgTAP 재생으로 확인한다.
- `DELETE … team_flow` 를 키 유무와 무관하게 항상 하는 이유: 날짜 교체 규칙(D-02 「그 날짜 team_flow 행을 비운다」). 옛 워커가 바뀐 날짜를 재적재하면 옛 team_flow 가 남아 새 6표와 어긋나는 것보다 비우는 쪽이 맞고, 키를 남기지 않으므로 새 워커가 다음 run 에 채운다.

### 보고서 RPC 골격 (파일 2 — `…_teamflow_report_rpc.sql`)
```sql
CREATE FUNCTION public.teamflow_report_for_user(p_user_id uuid, p_date text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_dates text[]; v_date text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;
  v_dates := ARRAY(SELECT DISTINCT t.date FROM public.limitup_team_flow t ORDER BY t.date DESC);  -- D-07
  IF cardinality(v_dates) = 0 THEN
    RETURN jsonb_build_object('access', true, 'dates', '[]'::jsonb, 'date', NULL, 'rows', '[]'::jsonb);
  END IF;
  v_date := coalesce(p_date, v_dates[1]);
  RETURN jsonb_build_object('access', true, 'dates', to_jsonb(v_dates), 'date', v_date,
    'rows', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.team_net_val DESC NULLS LAST, t.isin), '[]'::jsonb)
               FROM public.limitup_team_flow t WHERE t.date = v_date));
END; $$;
-- REVOKE EXECUTE … FROM PUBLIC; REVOKE EXECUTE … FROM anon, authenticated; GRANT EXECUTE … TO service_role;
```
- 응답 모양(D-05 · D-07): `{access:false}` · `{access:true, dates:[], date:null, rows:[]}` · `{access:true, dates, date, rows}`(행 없는 날짜면 `rows: []`). 상한가 보고서의 `loaded` 플래그는 두지 않는다 — UI-SPEC T1 빈 상태 판정이 `dates.length` · `rows.length` 만 쓴다.
- `DISTINCT date` 스캔은 PK `(date, isin)` 앞 열이라 인덱스로 끝난다(90일 × ~40행 ≈ 3,600행 — 무시 가능). 정렬은 RPC 와 웹 `sortRows` 가 같은 규칙(UI-SPEC T11)이라 둘 다 둬도 결과가 같다.
- `to_jsonb(t)` 는 `payload` 를 중첩 객체 그대로 싣는다(상한가 보고서가 `facts."values"` 를 같은 방식으로 내보냄 — `20261006090400:77-78`).

### 마이그레이션 적용 · 검증 명령
- 로컬 회귀: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql` · `… --test supabase/tests/teamflow_report.test.sql`(일회용 컨테이너에 전 마이그레이션 재생 — 원격 접촉 0, `scripts/verify-dma-orders-price-check.sh` 머리말). **주의: 러너 이미지가 로컬에 없다**(아래 Environment Availability).
- 원격: `supabase db push --linked --yes`(메인 세션 · 허용 규칙 접두사 그대로).

## 서버 지점 (연구 초점 4)

- 라우트 원형 — `limitupRouter.get("/report", requireAuth(), async (req, res, next) => { const parsed = LimitupReportQuery.safeParse(req.query); if (!parsed.success) { … throw ValidationFailed(…) } … res.json(await getLimitupReport(supabase, req.userId!, parsed.data.d)); } catch (e) { next(e); } })` [VERIFIED: server/src/routes/limitup-report.ts:28-40]
- 서비스 원형 — `supabase.rpc("limitup_report_for_user", { p_user_id: userId, p_date: d ?? null })` → error 면 `DbError(…, causeOf(error))` · 객체 아니면 `DbError(…, shapeCause(…))` · `if (data.access !== true) throw DmaUnmapped();` [VERIFIED: server/src/services/limitup-report.ts:51-64]
- `DmaUnmapped = () => new ApiError(403, "DMA_UNMAPPED", "DMA 계정이 연결되지 않았습니다.")` [VERIFIED: server/src/errors.ts:83-84]
- 스키마 — `Ymd = z.string().regex(/^\d{8}$/, …).refine(실재 날짜)` · `LimitupReportQuery = z.object({ d: Ymd.optional() })` [VERIFIED: server/src/schemas/limitup-report.ts:10-22] → teamflow 는 `Ymd` 를 export 해 재사용하거나 같은 정의를 복제(재사용 권장 — 한 판정).
- 등록 — import `server/src/app.ts:22` · `app.use("/api/limitup", limitupRouter);` 108행 → 그 다음 줄에 `app.use("/api/teamflow", teamflowRouter);`. `requireDmaMapped` 미들웨어(`server/src/middleware/require-dma-mapped.ts`)는 쓰지 않는다(D-05).
- 압축 — `app.use(compression({ filter: … }))` 가 라우터 앞(81-87행)이라 teamflow JSON(≈487KB → gzip ≈100KB)도 자동 압축.
- 서버 테스트 원형 — `server/tests/routes/limitup-report.test.ts`(supertest · `createApp` · 최소 mock 의 `rpc(fn, params)` 기록 · ①401 ②400 ③RPC 1회 파라미터 ④200 snake_case 통과 ⑤빈 날짜 ⑥`{access:false}`→403 ⑦RPC error→500 원문 비노출 ⑧비객체→500 · cause 로그). teamflow 는 이 8케이스를 그대로 복제(`tests/routes/teamflow-report.test.ts`).

## shared 타입 (연구 초점 5)

- 원형 — `export type LimitupReportResponse = | { access: false } | { access: true; dates: LimitupDate[]; date: LimitupDate | null; loaded: false } | { access: true; …; loaded: true; … }` [VERIFIED: packages/shared/src/limitup-report.ts:189] · 재export 블록 `export type { …, LimitupReportResponse, … } from "./limitup-report";` [VERIFIED: packages/shared/src/index.ts:204-220] · 「행 키는 export 열 이름 그대로(snake_case) · 봉투 키는 camelCase」(limitup-report.ts:4-6).
- 새 `packages/shared/src/teamflow-report.ts`: `TeamflowRow`(위 29열 + `schema_version` + `payload: TeamflowPayload`) · `TeamflowBand` · `TeamflowBucket` · `TeamflowWindow` · `TeamflowMembers`(+`TeamflowMemberRow`) · `TeamflowReportResponse = { access: false } | { access: true; dates: string[]; date: string | null; rows: TeamflowRow[] }`. `index.ts` 에 같은 모양의 `export type { … } from "./teamflow-report";` 블록 추가.
- 함께 고칠 것: `LimitupLoadRows`(limitup-report.ts:165-170)의 키 유니온에 `"team_flow"` 추가(이력 `rows` 에 키가 생기므로).
- **빌드 필요:** shared 는 `dist` 로 export 한다(`packages/shared/package.json` `"types": "./dist/index.d.ts"`) → webapp · server · worker typecheck/테스트/E2E 전에 `pnpm --filter @gh-radar/shared build`. Phase 32 플랜도 같은 순서를 쓴다(32-02-PLAN.md:124,169).

## 웹 지점 (연구 초점 6)

### 그대로 재사용 (확인)
- `LimitupDateNav({ date, prev, next, onGo })` — aria 「이전 보고서」 · 「다음 보고서」 · `fmtYmdLabel` [VERIFIED: webapp/src/components/analytics/limitup-date-nav.tsx:14-54]
- `dateNavOf` · `parseYmdParam` · `fmtYmdShort` · `fmtYmdLabel` · `kstSecOf` [VERIFIED: webapp/src/lib/limitup-report.ts:355,371,383-392,394]
- 페이지 상태기계 · `?d` 정본화 · DmaGate 분기 — `limitup-report.tsx:53-130` 의 구조를 그대로 옮긴다(BASE 만 `/analytics/teamflow`). 주의: **상한가 보고서 실제 경로는 `/analytics/limitup`**(`limitup-report.tsx:60`, `app/analytics/limitup/page.tsx`) — CONTEXT 의 `limitup-report/page.tsx` 표기는 틀린 경로다.
- 페이지 셸 — `AppShell sidebar={<AppSidebar />}` + `<Suspense fallback={null}>`(`webapp/src/app/analytics/limitup/page.tsx`) — `useSearchParams` 때문에 Suspense 필수.
- API — `authFetch<T>(path, { timeoutMs: 15_000 })` 동형(`webapp/src/lib/limitup-api.ts:20-23` — 「실데이터 하루 ≈ 400KB(gzip ≈ 45KB)라 15초」). teamflow 응답 크기가 같은 급이라 **15초를 그대로** 쓴다.
- DmaGate — `export type DmaGateSurface = "상따 전략" | "VI 자동매수" | "전략·잔고·미체결" | "트레이딩" | "상한가 보고서" | "AI 애널리스트";` [VERIFIED: webapp/src/components/trading/dma-gate.tsx:31-39] → `"팀 매집"` 추가. `topicParticle` 은 마지막 글자 받침으로 「은/는」 을 고른다(55-62행) — 「집」 은 받침이 있어 「팀 매집은」.
- 미들웨어 — 공개 whitelist 밖은 기본 차단이라 `/analytics/teamflow` 는 추가 작업 없이 보호된다(`webapp/src/lib/supabase/middleware.ts:15,58-62`).

### 복제 권장 (일반화하지 말 것)
- **`LimitupDayGrid`** — `useState<string | null>(() => rows[0]?.isin ?? null)`(122행 · 첫 행 펼침) 외에도 `LimitupDayRow` 타입 · 8열 `COLS_XL`(38행) · `ResultTags`(`LimitupResultTag` 3종) · `LimitupSparkline` · `Meta` 4칸 · 머리 문구 「상한가 종목」 · 빈 상태 · `rowButtonId` = `limitup-row-${isin}`(47-49행) · sr 설명 `rowDescription`(71-80행)까지 상한가 전용 값이 박혀 있다. 일반화하면 상한가 보고서 e2e · RTL(`__tests__/limitup-day-grid.test.tsx`)을 같이 흔든다(CLAUDE.md 「Minimal Impact」). **복제할 것은 문법 3가지뿐**: ① `pendingScroll` + `useLayoutEffect` 점프 보정(123-146행) ② 버튼 aria 문법(189-197행) ③ 같은 DOM · CSS 전환(`grid-cols-[minmax(0,1fr)_auto_16px]` → `xl:` 열 템플릿 · 메타 `xl:contents` · 라벨 `xl:sr-only`). 초기값은 `useState<string | null>(null)`.
- **`LimitupKpiStrip`** — 라벨 4개가 함수 안에 하드코딩(11-16행)이고 값은 `--fg` 고정(27행). teamflow 4번째 칸은 부호 색이 필요하다. 32줄짜리라 `teamflow-kpi-strip.tsx` 복제가 상한가 쪽 무변경으로 끝난다. UI-SPEC 「복제 시 치수 불변 계약」(`p-3` · 값 `mono text-[20px] leading-[1.2] font-semibold` · `grid-cols-2 md:grid-cols-4 gap-2`)만 지키면 된다.

### `formatTradeAmount` 를 쓰지 않는 이유 (확인)
`if (!Number.isFinite(value) || value === 0) return '-'; … if (value >= trillion) return \`${(value / trillion).toFixed(1)}조\`; return \`${new Intl.NumberFormat('ko-KR').format(Math.floor(value / uk))}억\`;` [VERIFIED: webapp/src/lib/format.ts:11-22] — 0 을 「-」 로 · 억 미만 **버림**(`Math.floor` — 음수는 더 작은 쪽으로) · 부호 없음 · 1조 이상 조 변환. D-10(부호 · 반올림 1자리 · 0.0억 · 조 없음)과 네 군데가 다르다 → `lib/teamflow-report.ts` 의 `fmtEok` 신설.

### 토큰
- `--team` · `--team-bg` 는 **아직 없다**(`grep -n "--team" globals.css` 0건). 이웃 값: 라이트 `--up: #f04452`(76행) · `--down: #3182f6`(77행) · `--up-bg: #ffeeee`(79행) · `--muted-fg: #6b7684`(57) · `--faint: #b0b8c1`(58) · `--border-subtle: #e5e8eb`(61) / 다크 `.dark`(198행~) `--up: #f04251`(224) · `--up-bg: rgba(240, 66, 81, 0.16)`(227). [VERIFIED: webapp/src/styles/globals.css]
- 토큰 테스트 — `THEME_COLOR_TOKENS = [ 'bg', … 'up', 'down', 'flat', 'up-bg', 'down-bg', … 'group-bg', 'switch-off', 'dim', ];` 에 `'team'`, `'team-bg'` 추가 · `LIGHT_EXPECTED`(35행~) · `DARK_EXPECTED`(68행~)에 UI-SPEC 값(`#a234c7` / `#f9f0fc` · `#c353e5` / `rgba(174, 61, 209, 0.16)`) 고정 · 테스트가 「둘 다 정의 · oklch 없음」 을 순회 검사(webapp/src/styles/__tests__/tds-tokens.test.ts:100-108,128-136). Tailwind `@theme` 등록은 불필요 — UI-SPEC 이 `bg-[var(--team-bg)]` 임의값 문법만 쓴다.

### 사이드바 (TEAM-02)
- 상수 — `const NAV_ANALYTICS: NavLeaf = { href: "/analytics/limitup", label: "분석", icon: ChartLine };` · `const NAV_LIMITUP_REPORT = { href: "/analytics/limitup", label: "상한가 보고서" } as const;` [VERIFIED: webapp/src/components/layout/app-sidebar.tsx:124-125] → `NAV_TEAMFLOW = { href: "/analytics/teamflow", label: "팀 매집" } as const;`
- 활성 — `const limitupActive = pathname.startsWith(NAV_LIMITUP_REPORT.href);` (470행) → `teamflowActive = pathname.startsWith(NAV_TEAMFLOW.href)`. 접두가 겹치지 않는다(`/analytics/limitup` vs `/analytics/teamflow`).
- 위치 — `SUB_LIST`(548행) 안 「상한가 보고서」 `li`(553행 `item="limitup-report"`)와 「AI 애널리스트」 `li`(562행 `item="chat"`) 사이에 `SubNavLink item="teamflow"`. 레일 아이콘은 만들지 않는다(UI-SPEC T10) — 그룹 제목 아이콘이 `/analytics` 접두로 켜진다(538행).
- 고칠 테스트: `webapp/src/components/layout/__tests__/app-sidebar.test.tsx:874-903`(링크 순서 배열 · `data-sidebar-item` 배열 `["limitup-report", "chat"]` → `["limitup-report", "teamflow", "chat"]`) · `webapp/e2e/specs/sidebar-tree.spec.ts:82-93` `TREE_LINKS` 에 `'팀 매집'` 을 `'상한가 보고서'` 다음에(370행 링크 수 단언은 `TREE_LINKS.length` 를 쓰므로 자동). 게이트 직접 진입 루프(sidebar-tree.spec.ts:307-312)에 `/analytics/teamflow` 와 `**/api/teamflow/report*` 403 목을 더할지는 플래너 재량(권장 — 「메뉴 숨김은 권한이 아니다」 를 같은 자리에서 잠금).

## 스케치 이식 (연구 초점 8)

### 스케치 014 (`.planning/sketches/014-teamflow-list-detail/index.html`)
- `BAND_SLOTS = ['0% 미만','0~5%','5~10%','10~15%','15~20%','20~25%','25~28%','28%~상한 미만','상한가 가격']` (212행) — 실제 export label 과 글자 단위로 같다(샘플 label 집합과 대조 완료). 단 스케치는 `b.team_net_val` 키를 읽는다(216행) — **실제 키는 `net_val`**.
- `strip(d, W, H = 26)`(215-235행): `mid = H/2 · gap 2 · bw = (W − 8·gap)/9 · null 칸 = 높이 1 rect · 값 칸 높이 = max(1.5, |v|/mx·(mid−2)) · 20% 점선 x = 5·(bw+gap) − gap/2`. 합성 행(`flat`) 분기는 이식하지 않는다(실데이터는 bands 가 항상 있다). UI-SPEC T4 가 viewBox `0 0 178 28` · 칸 18 · 사이 2 · `mx = max(5천만 원, 행 최대)` 로 확정.
- KPI(271-273행 `shell()`): `net = Σ team_net_val` · `posN = count(team_net_val > 0)` · `limN = count(status === 'limit')` — D-11 과 같다(null 은 합 · 개수에서 제외 — UI-SPEC T2 partial).
- 태그(208-210행 `tagOf`): `status === 'limit'` → 「상한가 HH:MM」 · 아니면 `rate(last_rate)`. 스케치의 `d.first_limit`(문자열)는 가공값 — 실제는 `first_limit_ms` → `kstSecOf` 로 HH:MM.

### 스케치 015 (`.planning/sketches/015-teamflow-detail-chart/index.html`) — 이식 대상 함수
| 스케치 함수(행) | 입력(스케치 가공 키 → 실제 키) | 스케치 상수 | UI-SPEC 확정값(4 배수) | React 컴포넌트(예시) |
|---|---|---|---|---|
| `bandChart(d, W)` (235-257) | `bands[].team_net_val` → `net_val` · `team_buy_share`(정수 %) → `share`(0~1) · 「하루 합계」 제외 | `RH 28 · L 96 · R 118 · top 6 · bar 14 · sc = (bw/2 − 6)/mx` · 20% 점선 = `i20 > 0` 일 때 그 행 위 | 행 28 · 막대 16 · L 96 · R 120 · H = 24 + 행수×28 · `sc = (판폭/2 − 8) ÷ max(5천만, |net_val| 최대)` | `TeamflowBandChart({ name, bands, below20, above20 })` |
| `bucketChart(d, W)` (259-293) | `buckets[].t` → `start` · `rate_lo/hi` → `lo/hi` · `team_buy_share` → `share` · `b.window` 플래그 → `payload.window.start~end` · `d.first_limit` → `first_limit_ms` | `L 36 · R 34 · T 8 · H1 130 · GAP 14 · H2 54 · tick 18` · **`n = bs.length`(가변 칸)** · `zero = T + H1·0.55` · `ys(s) = T + H1 − min(s,60)/60·H1` · `rlo = min(0, lo 최소) · rhi = max(30, hi 최대)` · 첫 상한가 = 같은 버킷 칸 가운데 | **39칸 고정**(D-13 — 스케치와 다른 핵심) · L 40 · R 36 · T 8 · H1 128 · GAP 16 · H2 56 · 눈금 20 → H 228 · `slot = (W − 76)/39` · 막대 폭 `max(2, slot − 2)` · 비중 선 0~0.60 · 빈 칸 · null 에서 선 끊기 · 첫 상한가 = 분 단위 정확 위치 `40 + (분 − 540)/10 × slot` | `TeamflowBucketChart({ name, buckets, window, firstLimitMs })` |
| `memberBars(d)` (295-302) | `d.members`(배열) → `payload.members.rows` · `d.members_missing` → `members.absent` · null 칸 미지원 → buy/sell/net null 허용 | HTML · 폭 % = 값 ÷ max(buy, sell) | `grid-cols-[48px_minmax(0,1fr)_88px]` · 트랙 `h-2` × 2 · net 내림차순(null 뒤) | `TeamflowMembers({ members })` |
| `bandTable` · `bucketTable` (214-226) | 위와 같은 키 치환 · 스케치 10분 억 2자리 | — | 6열 / 7열 · 억 1자리 단일 함수 | `TeamflowBandTable` · `TeamflowBucketTable` |
| `head(d)` (304-308) · `rule` (309) | 스케치 `headline` · `<b>` 를 정규식으로 덧입힘 | — | 요약 = `summary_lines` 원문의 `<b>` 만 토큰화 · 사실 줄은 요약 상자 **끝** · 판정 기준 6항목 하드코딩 | `TeamflowDetail` |

- 폭 측정은 `limitup-lane.tsx` 선례: `const FALLBACK_W = 640;`(62행) · `useLayoutEffect` 안 `const read = () => setWidth(el.clientWidth); … if (typeof ResizeObserver === 'undefined') return; const ro = new ResizeObserver(read);`(136-142행). 단 lane 은 `viewBox="0 0 100 100"` + `preserveAspectRatio="none"` + **SVG 안 글자 없음**(22-25행)이고, teamflow 차트 2종은 **SVG 안에 11px 글자가 있다** → UI-SPEC 대로 `viewBox="0 0 {W} {H}"` 를 측정 폭과 1:1 로(그래야 글자가 늘어나지 않는다). 미니막대만 `preserveAspectRatio="none"`.
- jsdom 에서 `clientWidth` 는 0 이다 — 단위 테스트는 폴백 640 으로 그려지는지(또는 0 을 폴백으로 취급하는지)를 정해 둬야 한다(Pitfall 8).
- `<b>` 토큰화는 `dangerouslySetInnerHTML` 없이 조각 배열로(UI-SPEC T11 `summaryPartsOf`) — 선례 `StoryPart { text: string; strong?: boolean; arrow?: boolean }`(webapp/src/lib/limitup-lanes.ts:616-620). 샘플 summary 에 `<b>` 외 태그 0 · 엔티티 0 이지만 계약상 「그 밖 태그는 글자째 제거」.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 날짜 원자 교체 | 워커에서 DELETE/INSERT 여러 요청 | 기존 `limitup_commit_day` 에 9번째 쌍 | PostgREST 는 요청 간 트랜잭션 불가 — 보고서가 반쪽 날짜를 본다 |
| 별도 team_flow stage/commit RPC | 새 RPC 쌍 | 같은 stage 표 · 같은 commit(D-01) | 6표와 다른 트랜잭션이면 「표 6개는 새 export · team_flow 는 옛것」 상태가 생긴다 |
| 재적재 트리거 | 운영자 수동 `UPDATE limitup_loads SET files_sig = NULL` | 워커 개수 기반 감지(D-03) | 선례(20261006120000:21-22)의 구멍을 영구 규칙으로 |
| jsonb → 열 매핑 | 워커에서 열 이름 맞춰 행 재조립 | `jsonb_populate_record` + payload 원문 | 키 이름 = 열 이름 하나의 규칙(기존 8표 전부) |
| 날짜 형식 검사 | 새 정규식 | server `Ymd`(schemas/limitup-report.ts:10-19) · web `parseYmdParam` | `20260230` 같은 값까지 같은 판정 |
| 날짜 알약 · ‹ › 판정 | 새 컴포넌트 | `LimitupDateNav` + `dateNavOf` | 행 있는 날짜만(D-07) 넣으면 주말 · 0행 날짜를 저절로 건너뛴다 |
| HTML 요약 렌더 | `dangerouslySetInnerHTML` · DOMPurify 추가 | `<b>` 만 조각 배열 | 의존성 0 · XSS 경로 0 |
| 억 표기 | `formatTradeAmount` 재사용 | `fmtEok`(새 함수 1개) | 위 「formatTradeAmount 를 쓰지 않는 이유」 |

**Key insight:** 이 phase 의 위험은 새 기술이 아니라 「이미 있는 원자 교체 경로에 한 표를 끼울 때 생기는 호환 틈」(타임아웃 소실 · 키 의미 · CHECK 이름 · 픽스처 날짜 오염)이다.

## Runtime State Inventory

(리네임 phase 는 아니지만 「배포 순서와 기존 적재 상태」 가 결과를 좌우하므로 같은 다섯 칸으로 점검한다.)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `limitup_loads` 의 기존 날짜들 — `rows` 에 `team_flow` 키 없음. 오늘(10/16) 21:20 옛 워커가 재기록 11일 + 10/16 을 재적재(files_sig 변경) — 그때도 키 없음(마이그레이션 전이든 뒤든, Pitfall 1 대로 구현하면). | **데이터 마이그레이션 없음** — 새 워커 첫 run 의 D-03 감지가 채운다. 프로덕션 수동 UPDATE 금지(D-15) |
| Live service config | Cloud Scheduler `gh-radar-limitup-sync-nightly`(평일 21:20 KST) · Job env(`--set-env-vars` 가 통째로 바꿈 — `LIMITUP_SKIP_DATES` 쓰고 있으면 재배포 때 env 로 넘겨야 유지, deploy-limitup-sync.sh 머리말 20-23행) | 재배포 시 `LIMITUP_SKIP_DATES` 현재 값 확인 · 새 env 불필요(team_flow 청크는 코드 상수 권장) |
| OS-registered state | radar-gw `limitup-pull.timer`(Mon..Fri 21:00) — export 디렉터리 통째 미러 | 없음 — 새 파일 자동 포함 |
| Secrets/env vars | 없음 — 새 비밀 · 새 env 이름 없음 | 없음 |
| Build artifacts | `packages/shared/dist` — 새 타입 export 전까지 webapp/server 가 옛 d.ts 를 본다 · `webapp/.next` 캐시 | 각 검증 명령 앞 `pnpm --filter @gh-radar/shared build` · E2E 타임아웃 시 `rm -rf webapp/.next` |

## Common Pitfalls

### Pitfall 1: 「항상 team_flow 키」 가 D-03 감지를 꺼 버린다
**What goes wrong:** 새 commit 함수가 v_rows 에 `team_flow: 0` 을 무조건 쓰면, 마이그레이션 뒤 · 워커 배포 전에 옛 워커가 적재한 날짜(오늘 밤 12일)가 「키 있음」 이 되어 새 워커가 영영 재적재하지 않는다 → 10/14 UAT 불가.
**Why it happens:** D-02 「새 워커가 항상 키를 쓴다」 를 DB 함수 쪽에서 구현하면 옛 워커 호출에도 적용된다.
**How to avoid:** (가) commit 함수는 `IF p_expected ? 'team_flow'` 일 때만 키 기록 (나) 워커 감지는 `prev.rows?.team_flow !== manifestTf.rows`(키 없음 = undefined 도 불일치). 둘 다 구현 권장.
**Warning signs:** 배포 뒤 첫 run 로그에 `team_flow_backfill` 사유가 0건인데 `limitup_team_flow` 에 10/14 행이 없다.

### Pitfall 2: CREATE OR REPLACE 가 `statement_timeout = '120s'` 를 지운다
**What goes wrong:** 함수 속성이 사라져 PostgREST 기본(서비스롤 역할 설정)으로 돌아가고, member_alloc 큰 날에 `57014` 로 그날 적재가 매일 실패할 수 있다.
**Why it happens:** 「All other function properties are assigned the values specified or implied in the command」 [CITED: PG 17 CREATE FUNCTION].
**How to avoid:** 같은 마이그레이션에 `ALTER FUNCTION … SET statement_timeout = '120s'` + `NOTIFY pgrst, 'reload schema'`. pgTAP 에 `SELECT is((SELECT proconfig FROM pg_proc WHERE oid = 'public.limitup_commit_day(text,text,text,integer,jsonb)'::regprocedure), ARRAY['search_path=public, pg_temp','statement_timeout=120s'], …)` 류 단언(정확한 배열 문자열은 재생 결과로 확정).
**Warning signs:** 워커 로그 `limitup commit slow` 없이 `canceling statement due to statement timeout`.

### Pitfall 3: stage CHECK 를 `DROP CONSTRAINT IF EXISTS` 로 지우면 조용히 미적용
**What goes wrong:** 이름이 다르면 DROP 이 건너뛰어지고 ADD 가 같은 이름 충돌 없이 하나 더 생기거나(이름이 다르면) 옛 CHECK 가 남아 `team_flow` stage insert 가 23514 로 실패 → 그 날짜 `failed` 반복.
**How to avoid:** 정확한 이름으로 DROP(실패하면 마이그레이션이 멈추게) · pgTAP 에서 `INSERT INTO limitup_stage (… tbl …) VALUES (…'team_flow'…)` lives_ok.

### Pitfall 4: 새 열 마이그레이션보다 데이터가 먼저 오면 키가 버려진다
**What goes wrong:** `jsonb_populate_record` 는 모르는 키를 무시한다 [CITED] — 표가 없는데 stage 에 team_flow 가 들어가는 경로는 CHECK 가 막지만, 앞으로 gh-trade 가 **평평한 열을 추가**하면 같은 함정이 반복된다.
**How to avoid:** 이번엔 배포 순서(D-18 DB 먼저)로 해결. 향후 열 추가는 `20261006120000` 선례 + D-03 류 감지로. 인박스 노트에 「열 추가 전 gh-radar 마이그레이션 먼저」 를 다시 적을 필요는 없다(team-flow.md §2 가 이미 「열을 바꾸면 gh-radar 와 먼저 상의」).

### Pitfall 5: team_flow 를 기존 청크(1000행)로 넣으면 한 요청이 ~0.5~0.75MB
**What goes wrong:** 지금까지 증명된 최대 insert 본문은 member_alloc 1000행 ≈ 293KB(픽스처 실측). team_flow 하루 34~53행 × ≈14KB = 487~750KB 를 한 요청으로 보내면 Supabase 게이트웨이 본문 한도에 닿을 수 있다. [ASSUMED — 한도 수치 미확인]
**How to avoid:** team_flow 만 20행 청크(≈290KB). 비용은 요청 2~3회.
**Warning signs:** `limitup_stage insert … team_flow seq 1..34: 413` 류 메시지.

### Pitfall 6: D-05 의 「payload ≈ 수 KB」 는 실측과 100배 차이
**What goes wrong:** 하루 응답 ≈ 487KB(34행) ~ 750KB(53행). 기본 fetch 타임아웃(8초)·폰 회선에서 느려질 수 있다.
**How to avoid:** 번들 결정(D-05)은 유지하되 — server gzip 이 이미 켜져 있고(app.ts:81-87) 상한가 보고서도 ≈400KB 로 운영 중 — `timeoutMs: 15_000`(limitup-api.ts 동형). RPC 에서 `payload - 'worst' - 'reach'` 같은 축소는 이득이 작아(버킷 미사용 4키를 빼도 ≈20%) 권하지 않는다.
**Warning signs:** E2E 는 목이라 못 잡는다 — 라이브 UAT 에서 첫 로드 시간 확인.

### Pitfall 7: 10분 축 54~92 는 종가 단일가(key 93)를 항상 버린다
**What goes wrong:** 사용자가 「15:20 칸이 늘 비어 있다 · 종가 체결이 안 보인다」 를 버그로 볼 수 있다.
**How to avoid:** Open Questions 1 결정 전에는 UI-SPEC 대로 구현하고 단위 테스트로 「key 93 은 차트 슬롯에 없고 표에는 있다」 를 잠근다(결정이 바뀌면 그 테스트 하나만 뒤집는다).

### Pitfall 8: jsdom `clientWidth = 0` 으로 차트가 0폭이 된다
**What goes wrong:** RTL 테스트에서 ResizeObserver 없음 · clientWidth 0 → `slot` 음수 · NaN 좌표.
**How to avoid:** 폭이 0 이하이면 폴백 640 을 쓰는 규칙을 컴포넌트에 넣고, 기하 계산은 순수 함수(`lib/teamflow-report.ts`)로 빼서 단위 테스트한다.

### Pitfall 9: 스케치 가공 키를 그대로 옮기는 실수
**What goes wrong:** `team_net_val`(bands 안) · `t` · `rate_lo/hi` · `team_buy_share` 정수 % · `members_missing` · `status:"up"` · 억 단위 값은 스케치 `data.js` 전용이다. 실제 키로 바꾸지 않으면 차트가 전부 빈다.
**How to avoid:** shared 타입을 먼저 만들고 컴포넌트는 그 타입만 받게 — 타입체크가 잡는다. 위 「스케치 015」 표의 치환 열이 체크리스트.

### Pitfall 10: 「상한가 도달」 KPI 와 「미도달」 태그의 의미 차이
**What goes wrong:** D-11 · D-09 는 `status === "limit"`(종가가 상한가)로 센다. 10/14 샘플에서 장중 상한가를 찍고 내려온 종목이 **6개**(first_limit_ms 있음 15 − status limit 9)다 — 이들은 KPI 「상한가 도달」 에서 빠지고 태그가 「+25.0%」 류(미도달 모양)로 나온다.
**How to avoid:** 잠긴 결정이므로 그대로 구현하고 Open Questions 2 로 사용자 확인만 받는다.

## Code Examples

### 표시 변환 골든 (UI-SPEC T11 · 단위 테스트 원천)
```ts
// lib/teamflow-report.ts — 규칙 출처: 33-UI-SPEC.md 「표시 변환 규칙」
const MINUS = '−';
export function fmtEok(won: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (won == null || !Number.isFinite(won)) return '—';
  const r = Math.round(won / 1e7) / 10;              // 억 소수 1자리 반올림
  const abs = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(r));
  if (r === 0) return '0.0억';                         // 반올림 0 은 부호 없음
  const sign = opts.signed ? (r > 0 ? '+' : MINUS) : r < 0 ? MINUS : '';
  return `${sign}${abs}억`;
}
// 골든(10/14 실측): fmtEok(-2629083913, {signed:true}) === '−26.3억' · fmtEok(586497190, {signed:true}) === '+5.9억'
//                  fmtEok(0, {signed:true}) === '0.0억' · fmtEok(123_450_000_000, {signed:true}) === '+1,234.5억'
export const fmtShare = (s: number | null) => (s == null ? '—' : `${Math.round(s * 100)}%`); // 0.26023 → '26%'
export const BUCKET_KEY_FIRST = 54; // 09:00
export const BUCKET_KEY_LAST = 92;  // 15:20 칸 (39칸)
```
`Math.round(won / 1e7) / 10` 은 음수 −0.05억 경계에서 JS `Math.round` 가 +쪽으로 반올림한다(−0.05 → −0). 「반올림 0 은 부호 없음」 규칙이 그 경우를 「0.0억」 으로 흡수하므로 표시상 문제는 없지만, 골든에 `-5_000_000` → `'0.0억'` 을 넣어 의도를 잠근다. [ASSUMED — 반올림 방향 규칙은 UI-SPEC 에 명시 없음]

### 워커 — 개수 기반 team_flow 재적재 감지 (위 「권장 변경」 요약)
```ts
type Prev = { sig: string | null; streak: number; rows: Record<string, number> | null };
const tf = m.files.find((f) => f.name === TEAM_FLOW_FILE);
const needTeamFlow = tf !== undefined && p?.rows?.team_flow !== tf.rows;
```

### 서버 — 라우트 복제 (원형 server/src/routes/limitup-report.ts:28-40)
```ts
teamflowRouter.get('/report', requireAuth(), async (req, res, next) => {
  try {
    const parsed = TeamflowReportQuery.safeParse(req.query);   // z.object({ d: Ymd.optional() })
    if (!parsed.success) { const i = parsed.error.issues[0]; throw ValidationFailed(`${i.path.join('.')}: ${i.message}`); }
    res.json(await getTeamflowReport(req.app.locals.supabase as SupabaseClient, req.userId!, parsed.data.d));
  } catch (e) { next(e); }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 열 추가 후 재적재 = 운영자가 `files_sig` NULL(20261006120000:21-22 · 인박스 「할 일」 4번) | 워커가 이력 `rows` 와 manifest 를 대조해 자동 재적재(D-03) | Phase 33 | 수동 UPDATE 없음 · 배포 순서 무관 |
| gh-trade detail 「하루 합계」 = 상한가 가격 포함 | 상한가 가격 **제외**(평평한 `team_*` 와 같은 값) | 2026-10-16 quick-261016-ex1(team-flow.md §5) | 구간표 마지막 행 = 평평한 열 — 샘플 34행 일치 확인 |

**Deprecated/outdated:** 로드맵 「인박스 미도착 — 스케치 014 README Data contract 기준」(CONTEXT `<domain>` 이 무효화) · 인박스 「schema_version 2」 초안(노트 19행이 1 로 정정).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | stage CHECK 기본 이름 = `limitup_stage_tbl_check` | SQL 지점 | 마이그레이션이 DROP 에서 실패(정확한 이름 DROP 이라 조용한 사고는 없음) → 이름 확인 후 재작성. pgTAP 재생으로 사전 확인 |
| A2 | 29열 중 따옴표 필요한 예약어 없음 | Export 스키마 | DDL 오류 — pgTAP 재생이 즉시 잡음 |
| A3 | Supabase 게이트웨이 insert 본문 한도가 ~0.5MB 근처일 수 있음 | Pitfall 5 | 한도가 넉넉하면 소청크는 불필요한 보수 — 비용은 요청 2~3회뿐 |
| A4 | `Math.round` 음수 반올림 방향을 「0.0억」 규칙이 흡수 | Code Examples | 표시 1건 차이 — 골든 테스트로 잠금 |
| A5 | PostgREST select 의 `rows` 열 이름이 그대로 동작(비예약) | 워커 통합 | select 오류 시 run 전체 실패(이력 select 는 날짜 루프 앞 · index.ts:131-132 throw) — 워커 vitest 는 가짜 Supabase 라 못 잡는다 → 배포 뒤 smoke 1회로 확인 |

## Open Questions

1. **종가 단일가 버킷(key 93)을 10분 차트에 넣을까**
   - What we know: 샘플 34행 중 33행에 key 93(15:30) 버킷이 있고 key 92(15:20)는 0행. D-13 · UI-SPEC 은 54~92 39칸 · 범위 밖 버림.
   - What's unclear: 사용자가 「09:00~15:30」 축에서 종가 체결이 빠지는 것을 원했는지(스케치 015 는 가변 칸이라 key 93 이 그려졌다).
   - Recommendation: discuss 없이 결정 가능한 작은 갈림 — 플래너가 확인 체크포인트 1개로 묻고, 답이 없으면 D-13 그대로. 대안 「key 93 → 슬롯 38(15:20 칸 = 15:20~15:30 종가 접수 구간)에 접기」 는 축 39칸 · 15:30 끝 표기를 그대로 지키면서 마지막 빈 칸을 없앤다.

2. **「상한가 도달」 KPI · 태그가 종가 기준이라 장중 상한가 후 하락 6종목이 「미도달」 모양**
   - What we know: D-09 · D-11 잠금(`status === "limit"`). 10/14 = first_limit 있음 15 · status limit 9.
   - Recommendation: 그대로 구현 · UAT 때 사용자에게 한 줄로 확인(라벨만 「종가 상한가」 로 바꾸는 선택지 제시). 바뀌면 KPI 라벨 · 태그 규칙 2곳.

3. **pgTAP 러너 이미지가 로컬에 없다**
   - What we know: `scripts/verify-dma-orders-price-check.sh:85-86` 은 `public.ecr.aws/supabase/postgres:17.6.1.104` 가 없으면 받지 않고 멈춘다. `docker image ls` 에 postgres 이미지 없음(이번 세션 확인).
   - Recommendation: Wave 0 에 `docker pull public.ecr.aws/supabase/postgres:17.6.1.104`(네트워크 · 사용자 승인) 한 단계. 못 받으면 SQL 검증은 「원격 push 뒤 smoke」 로만 남고, VERIFICATION 에 「pgTAP 미실행」 을 명시(메모리 `feedback_no_skipping_gsd_gates`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | 전 패키지 | ✓ | v24.21.0 | — |
| pnpm | 워크스페이스 | ✓ | 11.15.1 | — |
| Docker(OrbStack) | pgTAP 러너 | ✓ | client 29.8.2 | — |
| `public.ecr.aws/supabase/postgres:17.6.1.104` | pgTAP 재생 | ✗ | — | `docker pull` 1회(승인 필요) · 불가 시 원격 smoke 만 |
| Supabase CLI | `db push` | ✓ | 2.75.0(최신 2.121.0 알림 — 업그레이드 불필요) | — |
| gcloud | Job · server 배포 · Job 수동 실행 | ✓ | SDK 558.0.0 | — |
| 맥 샘플 `~/ticks/teamflow/sample/20261014/team_flow.ndjson.gz` | 픽스처 원천 | ✓ | sha 일치 | — |
| 로컬 export 사본 `~/ticks/research/export/20261014` | (6표 실 픽스처) | ✗ | 20261008 까지만 | 불필요 — team_flow 단독 파일 + 20261002 6표 사본 문법으로 충분 |

**Missing dependencies with no fallback:** 없음.
**Missing dependencies with fallback:** pgTAP 이미지(pull 또는 원격 smoke).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | worker vitest ^3 · server vitest ^4.1.4 + supertest · webapp vitest ^2.1.9(jsdom · RTL) + Playwright ^1.59.1 · pgTAP(일회용 컨테이너) |
| Config file | `workers/limitup-sync/vitest.config.ts` · `server`(package `vitest`) · `webapp/vitest.config.ts`(maxWorkers 기본 2) · `webapp/playwright.config.ts`(baseURL 3100 · webServer `PORT=3100 pnpm dev`) · `scripts/verify-dma-orders-price-check.sh` |
| Quick run command | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/limitup-sync exec vitest run --maxWorkers=2` (워커) · `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/teamflow-report.test.ts --maxWorkers=2` (웹 변환) |
| Full suite command | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/teamflow-report.spec.ts e2e/specs/sidebar-tree.spec.ts e2e/specs/limitup-report.spec.ts --workers=1` + pgTAP 2파일 |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEAM-01 | 표 · CHECK · commit 9번째 쌍 · payload jsonb 그대로 · 옛 워커 호출(키 없음) 0행 통과 + `rows` 에 키 없음 · 새 호출 키 0 포함 · 재적재로 행 줄면 옛 행 없음 · 90일 purge · statement_timeout 보존 · 권한/RLS/정책 0 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql` | ✅ 확장(plan 163 → 증가) |
| TEAM-01 | 선택 파일: 없으면 `p_expected.team_flow = 0` · 있으면 행 수 대조(불일치 → 그 날짜 failed) · sha 불일치 → skip "sha" · `limitup_loads` select 에 `rows` · sig 같아도 `rows.team_flow` 없음/불일치면 재적재 · 같으면 unchanged · team_flow 소청크(34행 → 2 insert) · `EXPORT_TABLES` 불변 | 워커 단위 | `pnpm --filter @gh-radar/limitup-sync exec vitest run tests/dispatch.test.ts tests/load.test.ts --maxWorkers=2` | ✅ 수정 + 새 describe |
| TEAM-01 | 실 적재: 10/14(+11일) `limitup_team_flow` 행 수 == manifest team_flow rows | 라이브 smoke | 배포 뒤 Job 실행(`gcloud run jobs execute gh-radar-limitup-sync --region=asia-northeast3 --wait`, 21:00~21:20 밖) + 로그 `team_flow_backfill` · 행 수 SQL(또는 `scripts/smoke-limitup-sync.sh` 에 INV 추가 — 재량) | ❌ 수동 |
| TEAM-02 | RPC 게이트 `{access:false}` · 이력 0 → `dates [] date null rows []` · dates = team_flow 행 있는 날짜만(0행 commit 날짜 제외) · p_date null = 최신 · 없는 날짜 rows [] · 정렬 · payload 포함 · anon/authenticated EXECUTE 불가 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/teamflow_report.test.sql` | ❌ Wave 0(`limitup_report.test.sql` 픽스처 사용자 문법 복제 — 7-60행) |
| TEAM-02 | 401 · 400(형식/실재) · RPC 1회 `{p_user_id, p_date}` · 200 통과 · 403 DMA_UNMAPPED · 500 원문 비노출 | server 라우트 | `pnpm --filter @gh-radar/server exec vitest run tests/routes/teamflow-report.test.ts --maxWorkers=2` | ❌ Wave 0 |
| TEAM-02 | 사이드바 순서 「상한가 보고서 → 팀 매집 → AI 애널리스트」 · `/analytics/teamflow` 에서 그 항목만 활성 | 웹 단위 + E2E | `pnpm --filter @gh-radar/webapp exec vitest run src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2` · `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/sidebar-tree.spec.ts --workers=1` | ✅ 수정 |
| TEAM-03 | `fmtEok`/`toneOf`/`fmtShare`/`fmtRate`/`kstHm`/`bandSlotsOf`/`sortRows` 골든 · KPI 10/14 = 34 · 9 · 9 · −26.3억 | 웹 단위 | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/teamflow-report.test.ts --maxWorkers=2` | ❌ Wave 0 |
| TEAM-03 | 상태기계(로딩 · 오류 · 게이트 401/403 · 이력 0 · 행 없는 날) · 기본 전부 접힘 · 한 번에 하나 · 날짜 바뀌면 접힘 · 문서 제목 | 컴포넌트 RTL | `pnpm --filter @gh-radar/webapp exec vitest run src/components/analytics/__tests__/teamflow-report.test.tsx --maxWorkers=2` | ❌ Wave 0(`limitup-report.test.tsx` 의 `vi.mock('next/navigation')` · `vi.mock('@/lib/limitup-api')` 문법) |
| TEAM-03 | 1280 7열 · 390 2줄 카드 · 페이지 가로 스크롤 0 · 행 클릭 아코디언 · 알약 ‹ › | E2E | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/teamflow-report.spec.ts --workers=1` | ❌ Wave 0 |
| TEAM-03 | 토큰 `--team`/`--team-bg` 양 테마 · hex/rgba | 웹 단위 | `pnpm --filter @gh-radar/webapp exec vitest run src/styles/__tests__/tds-tokens.test.ts --maxWorkers=2` | ✅ 수정 |
| TEAM-04 | `bucketSlotsOf`(key 54→0 · 92→38 · 93 차트 제외/표 포함) · `summaryPartsOf`(`<b>` 만 strong · 다른 태그 제거 · 엔티티 5종) · 차트 기하 순수 함수(폭 0 → 폴백 640) | 웹 단위 | 위 `teamflow-report.test.ts` | ❌ Wave 0 |
| TEAM-04 | members null → 「거래원 자료 없음」 · window null → 음영 · 캡션 없음 · buckets 빔 → 「10분 체결 기록이 없어요」 · 「하루 합계」 만 → 「구간 체결이 없어요」 · 접힌 표 3토글 독립 · 행 접으면 초기화 | 컴포넌트 RTL | `pnpm --filter @gh-radar/webapp exec vitest run src/components/analytics/__tests__/teamflow-detail.test.tsx --maxWorkers=2` | ❌ Wave 0 |
| TEAM-04 | 1280 상세 2열 · 390 1열 · 동양고속 차트 렌더(0선 · 축) · 「구간표 보기」 · 「10분 표 보기」 토글 · 첫 상한가 라벨이 오른쪽 끝을 넘지 않음 | E2E | 위 teamflow-report.spec.ts | ❌ Wave 0 |
| TEAM-04 | 10/14 실측 4종목 시각 확인 · 첫 로드 시간 · 다크 대비 | 라이브 UAT(수동) | `/analytics/teamflow?d=20261014` (워커 첫 run 뒤) | — |

### Sampling Rate
- **Per task commit:** 해당 패키지 quick 명령(워커 vitest / 웹 해당 파일 vitest / server 해당 파일).
- **Per wave merge:** 위 Full suite 중 그 웨이브가 닿은 패키지 + pgTAP(이미지 있으면).
- **Phase gate:** Full suite green + pgTAP 2파일(또는 「미실행」 명시) → 배포 → 라이브 smoke + 10/14 UAT → 인박스 닫기.

### Wave 0 Gaps
- [ ] `workers/limitup-sync/tests/fixtures/team_flow/20261014/team_flow.ndjson.gz` — 맥 샘플 바이트 복사(sha `f6656ae2…d897`)
- [ ] `workers/limitup-sync/tests/helpers/fake-supabase.ts` — `LoadRow.rows` 추가
- [ ] `supabase/tests/teamflow_report.test.sql` — 새 pgTAP
- [ ] `server/tests/routes/teamflow-report.test.ts`
- [ ] `webapp/src/test-fixtures/teamflow-export.ts` · `webapp/e2e/fixtures/teamflow-report.ts`
- [ ] `webapp/src/lib/__tests__/teamflow-report.test.ts` · `src/components/analytics/__tests__/teamflow-report.test.tsx` · `teamflow-detail.test.tsx`
- [ ] `webapp/e2e/specs/teamflow-report.spec.ts`(limitup-report.spec 동형 — `test.describe.configure({ mode: 'serial' })` · `withLocalRelay` · `page.route('**/api/teamflow/report*')`)
- [ ] pgTAP 이미지 `docker pull public.ecr.aws/supabase/postgres:17.6.1.104`(승인)

## 배포 · 운영 (연구 초점 9)

순서(D-18) — 전부 **메인 세션**에서(executor 는 커밋까지):
1. **DB:** `supabase db push --linked --yes` — 마이그레이션 2개. 오늘 21:20 전이든 뒤든 안전(옛 워커 호환 · Pitfall 1 구현 전제).
2. **Job:** `GCP_PROJECT_ID=gh-radar SUPABASE_URL=… [LIMITUP_SKIP_DATES=…] bash scripts/deploy-limitup-sync.sh` — 필수 env 가드(`scripts/deploy-limitup-sync.sh:28-36`), Job env 는 `COMMON_ENV="^@^SUPABASE_URL=…@LIMITUP_EXPORT_DIR=/mnt/export/export@LIMITUP_KEEP_DAYS=90@LIMITUP_ALLOC_KEEP_DAYS=30@KIND15_KEEP_DAYS=30${LIMITUP_SKIP_DATES:+…}"`(94행 — 새 env 불필요). 알림 정책 단계는 `NOTIFICATION_CHANNEL_ID` 필요(162행). **21:00~21:20 KST 밖**(운반 21:00 → Job 21:20). 첫 실행은 다음 21:20 또는 수동 `gcloud run jobs execute gh-radar-limitup-sync --region=asia-northeast3 --wait`(이것도 21:00~21:20 밖) — 12일 재적재 로그 확인.
3. **server:** `scripts/deploy-server.sh`(필수 env `GCP_PROJECT_ID` · `SUPABASE_URL` · `CORS_ALLOWED_ORIGINS` — 라이브 Cloud Run env 에서).
4. **webapp:** `git push` = Vercel 프로덕션. 1~3 중 하나라도 막히면 push 금지.
5. **인박스:** `docs/inbox/from-gh-trade/261016-teamflow-export.md` 프런트매터 `status: done` · `done_commit: <sha>` → `git add docs/inbox/from-gh-trade/261016-teamflow-export.md` 경로 지정 커밋 → gh-trade 세션에 SendMessage(보조) — 노트 ↔ 코드 차이 5건(위 「노트 ↔ 코드 차이」)을 함께 알린다.
- 알림 문서 `ops/alert-limitup-sync-failure.yaml` 의 `documentation.content` 에 team_flow 언급 추가는 선택(재량) — 실패 판정 로직은 그대로(종료 1 = 실패 실행).
- radar-gw · relay 변경 없음.

## Sources

### Primary (HIGH confidence — 이번 세션 직접 읽음/실행)
- gh-trade `server/tools/analysis/tickana/teamflow.py`(141-298, 472-660, 820-900행) · `export.py` `write_day` · `batch.py` 459-476행 · `docs/analysis/team-flow.md` §1~5 · §10 · §11
- `~/ticks/teamflow/sample/20261014/team_flow.ndjson.gz` — sha256 · 34행 · 타입 · null · label · key 분포 파이썬 분석
- gh-radar `supabase/migrations/20261006090100~090500 · 20261006120000` · `supabase/tests/limitup_load.test.sql` · `limitup_report.test.sql` · `scripts/verify-dma-orders-price-check.sh`
- `workers/limitup-sync/src/{index,load,manifest,config,purge}.ts` · `tests/{dispatch,load,dispatch-dryrun-totals,purge}.test.ts` · `tests/helpers/fake-supabase.ts` · `tests/fixtures/make-fixture.mjs` · 20261002 manifest
- `server/src/{app.ts,errors.ts,routes/limitup-report.ts,services/limitup-report.ts,schemas/limitup-report.ts}` · `server/tests/routes/limitup-report.test.ts`
- `packages/shared/src/{limitup-report.ts,index.ts}` · `package.json`
- `webapp/src/components/analytics/{limitup-report,limitup-date-nav,limitup-kpi-strip,limitup-day-grid,limitup-lane,limitup-sparkline}.tsx` · `lib/{limitup-report,limitup-api,limitup-lanes,format}.ts` · `components/trading/dma-gate.tsx` · `components/layout/app-sidebar.tsx` + 테스트 · `e2e/specs/{limitup-report,sidebar-tree}.spec.ts` · `e2e/fixtures/limitup-report.ts` · `src/test-fixtures/limitup-export.ts` · `styles/globals.css` · `styles/__tests__/tds-tokens.test.ts` · `vitest.config.ts` · `playwright.config.ts` · `lib/supabase/middleware.ts`
- `.planning/sketches/014 · 015` README + index.html
- `scripts/deploy-limitup-sync.sh` · `scripts/smoke-limitup-sync.sh` · `docs/relay-operations.md` 105-140 · `infra/relay/README.md` 1641-1645

### Secondary (MEDIUM — 공식 문서)
- PostgreSQL 17 CREATE FUNCTION(CREATE OR REPLACE 속성 · 권한 · 시그니처) — https://www.postgresql.org/docs/17/sql-createfunction.html
- PostgreSQL 17 JSON 함수(`jsonb_populate_record` 변환 규칙) — https://www.postgresql.org/docs/17/functions-json.html

### Tertiary (LOW)
- Supabase 게이트웨이 요청 본문 한도(A3) — 미확인

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 패키지 0 · 버전은 package.json 직접 확인
- Architecture: HIGH — 상한가 보고서 전 경로를 줄 단위로 대조 · 옛 워커 호환은 기존 함수 89행 + PG 문서로 이중 확인
- Pitfalls: HIGH(1·2·3·6·7·9·10 — 코드/샘플/문서 근거) · MEDIUM(5 — 한도 수치 미확인) · 픽스처 오염(load.test.ts 직접 디렉터리 사용) 확인

**Research date:** 2026-10-16
**Valid until:** 2026-11-15(gh-trade 가 export 열을 바꾸면 즉시 무효 — team-flow.md §2 규칙상 인박스 노트가 먼저 온다)
