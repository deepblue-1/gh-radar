# Phase 33: 팀 매집(teamflow) 보고서 - Context

**Gathered:** 2026-10-16
**Status:** Ready for planning

<domain>
## Phase Boundary

gh-trade 119 밤 배치가 내보내는 `team_flow.ndjson.gz`(종목·일 한 줄 · 평평한 열 29개 + `schema_version` + `payload`)를 `gh-radar-limitup-sync` 가 기존 표 6개와 같은 규칙으로 `limitup_team_flow` 표에 적재하고(TEAM-01), 서버가 상한가 보고서와 같은 경로(RPC 1회)로 날짜 목록 · 종목 행 · 상세 payload 를 내주며 사이드바 「분석」 에 「팀 매집」 항목이 생기고(TEAM-02), `/analytics/teamflow?d=YYYYMMDD` 에서 스케치 014 A(보고서 동형 · 기본 전부 접힘) 목록(TEAM-03)과 스케치 015 C(차트 + 접힌 표) 행 펼침 상세(TEAM-04)가 읽힌다. 인박스 `docs/inbox/from-gh-trade/261016-teamflow-export.md` 를 `status: done` 으로 닫는다.

**이 discuss 중 바뀐 전제(2026-10-16):**
- 인박스 노트가 **도착했다**(열 사전 정본). 로드맵 「미도착 — 스케치 014 README Data contract 기준」 은 더 이상 유효하지 않다 — 열 이름 · 단위는 인박스 노트와 gh-trade `export_row` 코드가 정본이고, 스케치 014 `data.js` 의 필드 이름(`t` · `rate_lo/hi` · `team_buy_share` 정수 % · `total` 분리 · `status:"up"` · 억 단위)은 **화면용 가공값**이라 그대로 쓰지 않는다.
- gh-trade 는 export 를 119 에 **이미 배포**했고(10/16 낮), 과거 11일(20260929 · 0930 · 1001 · 1002 · 1006 · 1007 · 1008 · 1012 · 1013 · 1014 · 1015)을 재기록해 119 `~/ticks/export/<D>/` 에 놓았다. 오늘(10/16) 21:00 pull 에 실리고, files_sig 가 바뀌므로 **오늘 밤 지금 워커가 11일을 「바뀐 날짜」로 다시 적재한다**(표 6개 내용 동일 · team_flow 파일은 sha 대조만 하고 통과 — `NAME_RE` 가 `team_flow.ndjson.gz` 를 허용함을 확인). 10/14 라이브 UAT 는 정식 경로로 가능하다.
- `schema_version` 은 export 공통 값 **1**(워커 `KNOWN_SCHEMA_VERSIONS {1,2}` 안). 등락률(`*_rate` · `lo`/`hi`)은 % 그대로, 비중(`share` 류)만 0~1(분모 0 은 null).

</domain>

<decisions>
## Implementation Decisions

### 적재 (TEAM-01)
- **D-01: 같은 트랜잭션.** `limitup_team_flow` 를 `limitup_commit_day` 의 **7번째 표**로 넣는다(별도 stage/commit RPC 를 만들지 않는다). 마이그레이션 = 표 생성(PK `(date, isin)` · 평평한 열 29개 + `schema_version int` + `payload jsonb` — export 행의 `payload` 키가 그대로 있으므로 `jsonb_populate_record` 로 열 매핑된다 · `name` · `market` · `first_limit_ms` 등 null 허용은 인박스 열 사전대로) · `limitup_stage` CHECK 에 `team_flow` 추가 · `limitup_commit_day` CREATE OR REPLACE(DELETE-by-date → INSERT 쌍 추가 · REVOKE/GRANT · `statement_timeout` ALTER 재진술) · `limitup_purge_old` 에 90일 삭제 한 줄(`LIMITUP_KEEP_DAYS` 와 같은 기간). — **Reversibility:** costly — commit_day 시그니처 · stage CHECK · purge 가 한 몸이라 되돌리면 마이그레이션 3곳을 다시 고쳐야 한다.
- **D-02: 파일 없는 날짜 = 0행 commit.** 워커는 `team_flow.ndjson.gz` 를 **선택 파일**로 다룬다 — `EXPORT_TABLES` 의 7번째 필수 항목이 아니라 별도 선택 분기(`index.ts:223-233` 의 「manifest has no …」 throw 를 타지 않는다). manifest 에 없으면 stage 0행 · `p_expected.team_flow = 0` 으로 commit 해 그 날짜 team_flow 행을 비운다(날짜 교체 규칙 유지). 있으면 `files[].rows` 와 행 수 대조 · sha256 대조는 기존 `verifyFiles` 그대로. `limitup_loads.rows` jsonb 에는 새 워커가 **항상 `team_flow` 키**를 쓴다(0 포함).
- **D-03: 재적재는 워커 자동 감지(영구 규칙).** manifest `files[]` 에 `team_flow.ndjson.gz` 가 있는데 그 날짜 `limitup_loads.rows` 에 `team_flow` 키가 **없으면** files_sig 가 같아도 그 날짜를 재적재한다(멱등 · 수동 UPDATE 없음 · 배포 순서와 무관). 이 규칙이 오늘 밤 옛 워커가 적재할 11일 + 10/16 을 워커 배포 뒤 첫 실행에서 채운다. 새 `limitup_commit_day` 는 **옛 워커 호출**(p_expected 에 `team_flow` 없음 · stage 에 team_flow 0행)도 0행으로 받아들여야 한다 — DB 마이그레이션이 워커 배포보다 먼저 가고 그 사이 21:20 적재가 끼어도 깨지지 않게.
- **D-04: 단위 변환 없음.** 워커는 행을 그대로 넣는다(기존 패턴 — NaN→null 은 export 보장). DB 는 §11 단위 그대로(ms epoch · 원 · 주 · share 0~1 · rate %). 억 · % 변환은 웹 표시층(D-10).

### 서버 · 접근 (TEAM-02)
- **D-05: RPC 1회 · 하루 번들에 payload 포함.** `teamflow_report_for_user(p_user_id uuid, p_date text default null) → jsonb` 하나가 `{access, dates[], date, rows[]}` 를 내고 `rows[]` 에 평평한 열 + `payload` 를 **함께** 싣는다(행 펼침 때 추가 fetch 없음 · 하루 20~53행 × payload ≈ 수 KB 라 번들 허용). DMA 게이트는 상한가 보고서처럼 **RPC 안** `dma_visible_accounts` → `{access:false}` → 서버 403 `DmaUnmapped`. 라우트는 `requireAuth()` 만 쓰고 `requireDmaMapped()` 미들웨어를 겹치지 **않는다**(왕복 2회 방지 — 로드맵의 「require-dma-mapped」 는 「RPC 안 게이트」 로 읽는다). RPC 는 SECURITY INVOKER · `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` · `GRANT TO service_role` 명시([[feedback_supabase_rpc_revoke]]).
- **D-06: 표 접근은 limitup 패턴.** `limitup_team_flow` 는 RLS 켜고 **정책 0개** · `REVOKE ALL FROM PUBLIC, anon, authenticated` · `GRANT … TO service_role`(마이그레이션 주석 「POLICY 추가하지 말 것」 과 같은 결). 로드맵 「RLS `TO anon, authenticated`」 는 PostgREST 직접 읽기 표에만 해당하는 규칙이라 여기엔 적용하지 않는다 — 읽기는 서버 RPC 뿐.
- **D-07: 날짜 목록 = 팀 매집 행이 있는 날짜만.** `dates[]` 는 `limitup_team_flow` 에 행이 1개 이상인 날짜(0행 commit 날짜 · 적재 전 날짜 제외). `p_date` 없으면 최신 행 있는 날짜. `?d=` 로 행 없는 날짜를 직접 열면 `rows: []` 로 내려 웹이 빈 상태(「이 날은 팀 매집 데이터가 없어요」 류)를 그린다.

### 목록 (TEAM-03 — 스케치 014 A)
- **D-08: 정렬 = 팀 순매수(`team_net_val`) 내림차순.** 상한가 · 미도달 섞임(태그로 구분) · 정렬 전환 UI 없음. 아코디언 한 번에 하나 · **기본 전부 접힘**(상한가 보고서 DayGrid 의 「첫 행 기본 펼침」 과 다름).
- **D-09: 태그.** `status === "limit"` → 「상한가 HH:MM」(`first_limit_ms` KST · 없으면 「상한가」 만). 미도달 → 종가 등락률 `last_rate` 태그(「+22.6%」) + 데스크톱 「결과」 열 보조줄 「고가 +29.1%」(`high_rate`). 폰 390 은 2줄 카드형 행(스케치 014 A 그대로).
- **D-10: 금액 · 비중 표기.** 금액은 **부호 + 억 소수 1자리**(`+7.0억` · `−3.1억` · `0.2억` · 1,000억 이상도 억 유지 · 조 변환 없음), 비중은 **정수 %**(`share` 0~1 × 100 반올림 · null 은 「—」). 상한가 보고서 「27.6억」 과 같은 결. 변환은 웹 표시층 함수 하나(상따 010 C 축약 규칙은 쓰지 않는다).
- **D-11: KPI 4칸** = 탐지(행 수) · 팀 순매수(`team_net_val > 0` 종목 수) · 상한가 도달(`status === "limit"` 수) · 팀 순매수 합(**전 종목 합** · 음수 포함 · 부호 색). 미니막대 9칸 = `payload.bands[]` 의 label 고정 슬롯 `0% 미만 · 0~5% · 5~10% · 10~15% · 15~20% · 20~25% · 25~28% · 28%~상한 미만 · 상한가 가격`(「하루 합계」 행 제외 · 없는 label 은 빈 칸 · 20% 경계 점선은 5번째 칸 앞). 「20% 아래/위」 열 = `below20_net_val` / `above20_net_val`, 「매수 중 팀」 = `team_buy_share`.

### 상세 · 차트 (TEAM-04 — 스케치 015 C)
- **D-12: 순수 SVG 손그림.** 스케치 015 `index.html` 의 차트 코드를 React 컴포넌트로 이식한다(구간 가로 막대 · 거래원 2단 막대 · 10분 흐름 막대 + 보라 선 + 등락률 띠). 라이브러리 추가 없음(recharts 래퍼 · lightweight-charts 안 씀). 색은 CSS 변수 그대로(`--up`/`--down` 류 · [[feedback_lightweight_charts_oklch]] 문제 없음) · 수치는 `<title>` 툴팁 · 상한가 보고서 lane/sparkline 과 같은 `viewBox` 결.
- **D-13: 10분 차트 가로축 = 장 시간 고정(39칸).** 장 시간 = 09:00~15:30. `payload.buckets[]` 의 `key`(0~143 · `start` "HH:MM")를 09:00=key 54 … 15:20=key 92 슬롯에 놓고 빈 버킷은 빈 칸(0선만). 종목 간 같은 위치에서 「언제」 가 읽히고 VI · 잠김 공백이 보인다. 폰 390 막대 ≈ 7px(스케치 검증값). 최대 매집 창 음영 = `payload.window.start~end`, 첫 상한가 세로선 = `first_limit_ms`, 등락률 띠 = `buckets[].lo/hi`(% 그대로) · 20% 점선, 팀 비중 선 = `buckets[].share`(≥ 0.30 보라 강조). **2026-10-16 plan-phase 보정(사용자 결정):** 종가 단일가 체결 버킷 `key` 93(15:30:00 체결 · 실측 34행 중 33행에 존재 · key 92 는 0행)은 **마지막 칸(슬롯 38 = 15:20 칸 · 15:20~15:30 종가 접수 구간)에 합산**한다 — 축은 39칸 · 15:30 끝 표기 그대로, 마지막 빈 칸이 사라진다. 합산 규칙: 수량 · 금액 키는 더하고 `lo`=min · `hi`=max · `share` 는 합산한 `team_buy ÷ buy_aggr`(분모 0 → null). 그 밖의 범위 밖 key(< 54 · > 93)는 차트에서 버린다. 「10분 표 보기」 표에는 key 92 · 93 이 각자 행으로 남는다.
- **D-14: 상세 순서 · 접힌 표.** 요약 문장(`payload.summary_lines[]` · HTML 은 `<b>` 만 허용 — sanitize 후 렌더) → [구간 가로 막대 | 거래원 2단 막대] 2열(폰 1열) → 10분 흐름 차트 → 판정 기준 접힘. 구간 차트 아래 「구간표 보기」(bands 표 · 「하루 합계」 행 포함 · 열 = gh-trade 샘플 표 6열), 10분 차트 아래 「10분 표 보기」(buckets 표 7열) — 기본 접힘. 거래원 = `payload.members.rows[]`(buy/sell/net null 허용) + `absent[]` → 「상위 5 밖: …」 한 줄. 팀 체결이 거의 없는 종목(동양고속형)도 빈 차트가 0선 · 축만으로 깨지지 않는다.

### UAT · 픽스처 · 인박스
- **D-15: 라이브 UAT = 10/14 정식 경로.** gh-trade 가 재기록한 11일이 오늘 21:00 pull → 오늘 밤 옛 워커 재적재(team_flow 열 없음) → Phase 33 워커 배포 뒤 D-03 자동 감지로 team_flow 채움 → `/analytics/teamflow?d=20261014` 에서 에스엠벡셀 · 한선엔지니어링 · 동양고속(+천일고속) 실측으로 UAT. 프로덕션 DB 수동 주입 없음.
- **D-16: 픽스처 = 맥 샘플.** `~/ticks/teamflow/sample/20261014/team_flow.ndjson.gz`(34행 · sha256 `f6656ae2…d897` · 119 10/14 export 의 team_flow 와 같은 코드 · 같은 입력)를 워커 픽스처 `workers/limitup-sync/tests/fixtures/export/<date>/` 와 E2E 픽스처(`webapp/e2e/fixtures/`)의 원천으로 쓴다. 기존 픽스처 날짜 20261002 와 섞을지 별도 날짜로 둘지는 플래너 재량(manifest `files[]` 에 team_flow 항목 + rows + sha256 이 맞아야 한다).
- **D-17: 인박스 닫기.** `docs/inbox/from-gh-trade/261016-teamflow-export.md` 의 `status: done` · `done_commit` 을 phase 마지막 플랜(배포 뒤)에서 채워 **경로 지정** 커밋. gh-trade 세션(gh-trade-e0)에 처리 완료를 SendMessage 로 알린다(보조).

### 배포 순서
- **D-18:** DB 마이그레이션(표 · CHECK · commit_day · purge · 보고서 RPC — 옛 워커 호환 D-03) → limitup-sync Job 재배포(`scripts/deploy-limitup-sync.sh` · **21:00~21:20 KST 밖**) → server → webapp push(= 프로덕션). radar-gw 변경 없음. 워커 배포 뒤 첫 실행(다음 21:20 또는 수동 `gcloud run jobs execute`)이 11일 + 10/16 team_flow 를 채운다. **2026-10-16 plan-phase 보정(사용자 결정 · gh-trade 세션 전달):** 워커 재배포 직후 **장중이어도 21:00 타이머를 기다리지 않고** radar-gw 에서 `limitup-pull.sh --allow-daytime` 을 1회 돌려 운반한 뒤 `gcloud run jobs execute` 로 워커를 즉시 실행하고 INV-8 로 10/14 를 확인한다(메인 세션 체크포인트). limitup-pull 은 Nice 19 · IO idle · MemoryMax 300M 이라 relay 부하는 작다. 단, 20:55~21:25 KST 창은 여전히 피한다.

### Claude's Discretion
- 표 · RPC · 라우트 · 파일 이름(`limitup_team_flow` · `teamflow_report_for_user` · `server/src/routes/teamflow-report.ts` · `webapp/src/app/analytics/teamflow/page.tsx` 류) · shared 타입 위치(`packages/shared/src/teamflow-report.ts`).
- 상한가 보고서 부품 재사용 범위: `parseYmdParam` · `dateNavOf` · `fmtYmd*` · `LimitupDateNav` · KpiStrip 레이아웃(라벨 하드코딩이라 prop 화 또는 복제) · DayGrid 아코디언(기본 펼침 · 8열 템플릿 · `rowButtonId` 가 하드코딩 — 일반화 vs teamflow 전용 복제는 플래너가 정한다).
- 사이드바 「팀 매집」 항목 위치(「상한가 보고서」 다음) · active 판정(`limitupActive` 와 같은 prefix 방식) · 문서 title · 빈 상태 문구(「21:20 뒤」 류 상한가 보고서 문구 변형).
- 판정 기준 접힘 본문 = gh-trade `team-flow.md` §3 · §4 · §5 요약을 웹에 **하드코딩**(export 에 규칙 텍스트 없음) · 출처 링크 없이 「gh-trade 팀 매집 분석 규칙」 한 줄 표기.
- `members` 가 null 인 종목 = 거래원 영역에 「거래원 자료 없음」 한 줄. `window` null = 음영 없음 · 요약 문장은 export 그대로.
- 폰 390 차트 폭 = 컨테이너 폭 100% `viewBox` 스케일(스케치와 같은 비율) · 구간 차트 막대 높이 · 접힌 표 가로 스크롤.
- 보존 90일 · 옛 워커 호환 분기 구현 방식 · `limitup_loads.rows` 키 검사 SQL 위치(워커 vs RPC).
- E2E 는 limitup-report.spec 동형(`page.route` 로 `/api/teamflow/report*` 모킹 · 390 폰 · 아코디언 1개 · 접힌 표 토글) · 단위 테스트는 변환 함수(억 · % · 9칸 슬롯 · 39칸 축) 중심.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 계약 정본 (열 사전 · 단위 · 규칙)
- `docs/inbox/from-gh-trade/261016-teamflow-export.md` — **열 사전 정본**(평평한 열 29개 · payload 구조 · 단위 · 실패 규칙 · 샘플 경로 · 「gh-radar 가 할 일」). phase 끝에 `status: done` 으로 닫는다.
- `/Users/alex/repos/gh-trade/docs/analysis/team-flow.md` §3 팀 정의 · §4 판정 규칙 1~8 · §5 구간 정의 · §11 일일 export — 판정 기준 접힘 본문의 원천 · 단위 규칙.
- `/Users/alex/repos/gh-trade/server/tools/analysis/tickana/teamflow.py` `export_row`(843행~) · `detail_stock` bands/buckets/window/members 생성부(555~598행) — 키 이름 · null 조건의 코드 정본(노트와 어긋나면 코드가 맞다 · gh-trade 에 알린다).
- `~/ticks/teamflow/sample/20261014/team_flow.ndjson.gz` — 10/14 34행 샘플(픽스처 원천 · D-16).
- `docs/inbox/from-gh-trade/README.md` · `CLAUDE.md` 「gh-trade 인박스」 — 인박스 닫기 규칙(경로 지정 커밋).

### 채택 목업 (화면 정본)
- `.planning/sketches/014-teamflow-list-detail/README.md` — A 보고서 동형 · 기본 전부 접힘 · Data contract 표(필드 이름은 화면용 — 실제 키는 인박스 노트).
- `.planning/sketches/014-teamflow-list-detail/index.html` — 목록 행 · 미니막대 `strip()`(`BAND_SLOTS` 9칸 · 212~235행) · KPI 계산(271~273행) · 태그(209~210행) · 폰 2줄 카드.
- `.planning/sketches/015-teamflow-detail-chart/README.md` — C 혼합 · 차트 규칙(중앙 0선 · ± 색 · 20% 점선 · ≥30% 보라 · `<title>`).
- `.planning/sketches/015-teamflow-detail-chart/index.html` — 세 차트 SVG 코드(이식 원본).
- `.planning/sketches/014-teamflow-list-detail/data.js` — 10/14 실측 3종목 화면용 데이터(필드 이름 · 단위는 **가공값** — 참고만).

### 상한가 보고서 동형 패턴 (코드)
- `supabase/migrations/20261006090100_limitup_tables.sql` — 표 · stage CHECK(188~189행) · `limitup_loads`(195~201행 `rows` jsonb) · 접근 잠금(251~300행 · 정책 0개).
- `supabase/migrations/20261006090200_limitup_load_rpcs.sql` — `limitup_commit_day`(51행~ · `v_tbls` 65~66행 · DELETE/INSERT 쌍 99~151행) · REVOKE/GRANT(196~206행).
- `supabase/migrations/20261006090300_limitup_retention_storage.sql` — `limitup_purge_old`(28행 · 표별 DELETE 49~67행).
- `supabase/migrations/20261006090400_limitup_report_rpcs.sql` — `limitup_report_for_user`(40행 · DMA 게이트 57~58행 · dates 61행) — 보고서 RPC 틀.
- `supabase/migrations/20261006090500_limitup_commit_day_timeout.sql` — CREATE OR REPLACE 때 재진술할 `statement_timeout`.
- `workers/limitup-sync/src/index.ts`(18~49행 파이프라인 주석 · 119행 dispatch · 188~290행 loadDay · 223~233행 필수 파일 throw) · `src/load.ts`(13행 `EXPORT_TABLES` · 35행 stageDay · 64행 commitDay) · `src/manifest.ts`(19행 KNOWN_SCHEMA_VERSIONS · 38행 NAME_RE · 87행 filesSig · 107행 verifyFiles) · `tests/fixtures/export/20261002/` · `tests/helpers/fake-supabase.ts`.
- `scripts/deploy-limitup-sync.sh` — Job 재배포(21:20 KST Scheduler · GCS 볼륨 `/mnt/export/export`).
- `server/src/routes/limitup-report.ts` · `server/src/services/limitup-report.ts`(51~62행 RPC 1회 · `DmaUnmapped`) · `server/src/schemas/limitup-report.ts`(`^\d{8}$`) · `server/src/app.ts`(22 · 108행 라우터 등록).
- `packages/shared/src/limitup-report.ts`(189행 `LimitupReportResponse` access/loaded 유니온) · `packages/shared/src/index.ts`(204~220행 재export).
- `webapp/src/components/analytics/limitup-report.tsx`(62행 · `?d` 65~77행 · fetch/DmaGate 79~105행 · 빈 상태 157~170행) · `limitup-date-nav.tsx` · `limitup-kpi-strip.tsx` · `limitup-day-grid.tsx`(12~36행 아코디언 규칙 · 첫 행 기본 펼침) · `limitup-lane.tsx` · `limitup-sparkline.tsx`(순수 SVG 결) · `webapp/src/lib/limitup-report.ts`(355행 `dateNavOf` · 371행 `parseYmdParam` · 383~392행 `fmtYmd*`) · `webapp/src/lib/limitup-api.ts`.
- `webapp/src/components/layout/app-sidebar.tsx`(124~125행 NAV_ANALYTICS/NAV_LIMITUP_REPORT · 470행 `limitupActive` · 531~572행 분석 그룹) · `__tests__/app-sidebar.test.tsx`(173~181행 링크 순서) · `webapp/e2e/specs/sidebar-tree.spec.ts`(77~86행).
- `webapp/e2e/specs/limitup-report.spec.ts` · `webapp/e2e/fixtures/limitup-report.ts` · `webapp/src/test-fixtures/limitup-report.ts` · `limitup-export.ts` — E2E · 단위 픽스처 동형.
- `webapp/src/lib/format.ts`(`formatTradeAmount` — 억 버림 규칙 · 부호 없음 · 재사용 불가 사유 참고).

### 운반 · 운영
- `docs/relay-operations.md` 112~136행 — 21:00 KST radar-gw rsync → GCS 2패스 → 21:20 Job. 변경 없음.
- `infra/relay/limitup-pull/limitup-pull.sh` — export 디렉터리 전체 미러(team_flow 자동 포함). `infra/relay/README.md` 1644행 — 21:00~21:20 회피.
- `ops/alert-limitup-sync-failure.yaml` — 알림 문구에 team_flow 언급 추가 여부(플래너 재량).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 워커 파이프라인 전체(manifest → files_sig → sha256 → stage → commit → purge): team_flow 는 선택 파일 분기 + `rows` 키 감지(D-02 · D-03)만 더한다.
- `limitup_report_for_user` 의 틀(DMA 게이트 · dates · 날짜 선택 · jsonb 번들)을 `teamflow_report_for_user` 가 복제.
- 서버 `limitup-report` 라우트 · 서비스 · zod 스키마(`^\d{8}$` + 실제 날짜 검사) · `DmaUnmapped` 403 — 그대로 복제.
- 웹 `LimitupDateNav`(날짜 알약) · `parseYmdParam` · `dateNavOf` · `fmtYmd*` · DmaGate 처리(401/403) · PageHeader — 재사용. KpiStrip 레이아웃(라벨 prop 화 필요) · DayGrid 아코디언(기본 펼침 · 열 템플릿 · `rowButtonId` 일반화 필요).
- 순수 SVG 결(`limitup-lane.tsx` · `limitup-sparkline.tsx` · `viewBox`) — 015 차트 이식 시 같은 방식.

### Established Patterns
- 표 접근 = RLS 정책 0개 + service_role 전용 + 서버 RPC(SECURITY INVOKER · REVOKE 명시). PostgREST 직접 읽기 없음.
- `jsonb_populate_record` 는 모르는 키를 버리므로 **열 추가 마이그레이션이 첫 적재보다 먼저** 가야 한다(`20261006120000_limitup_locks_lock_risk.sql` 선례).
- 서버는 행을 snake_case 그대로 통과(매퍼 없음) — 웹 표시층이 변환.
- 상한가 보고서 UI 로직(`kpisOf` · `dayRowsOf` · `limitup-lanes.ts` · grid/Storage 경로)은 limitup 전용 — teamflow 는 자기 변환 함수를 갖는다(grid · Storage 없음).
- E2E 는 `page.route` 로 API 모킹 + 실 export 기반 픽스처.

### Integration Points
- `limitup_stage` CHECK · `limitup_commit_day` · `limitup_purge_old`(SQL 3곳 하드코딩) · 워커 `loadDay` · `limitup_loads.rows`.
- `server/src/app.ts` 라우터 등록 · `packages/shared` 타입 재export.
- `app-sidebar.tsx` 분석 그룹(「상한가 보고서」 다음) · 사이드바 단위/E2E 테스트의 링크 순서 단언.
- `webapp/src/app/analytics/teamflow/page.tsx`(AppShell + Suspense — `useSearchParams`).

</code_context>

<specifics>
## Specific Ideas

- 「오늘 누가 모았나」 를 목록이 먼저 답한다 — 팀 순매수 내림차순(D-08) · 기본 전부 접힘.
- 10분 차트는 종목이 달라도 같은 자리에 같은 시각이 오게(D-13 고정축) — 잠김 · VI 공백이 보이는 것이 정보.
- 동양고속처럼 팀이 거의 없는 종목의 빈 차트가 초라하지 않게(015 README 「What to Look For」).
- 상한가 보고서와 한 몸처럼 — 날짜 알약 · KPI 띠 · 아코디언 · 억 1자리 · SVG 결 전부 동형. 다른 점은 「기본 전부 접힘」 과 「행 있는 날짜만」 둘.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (gh-trade 쪽 후속 — `b9_lower` · `worst[]` · `reach` payload 는 화면 미사용으로 적재만 한다. 쓰게 되면 그때 phase.)

</deferred>

---

*Phase: 33-teamflow*
*Context gathered: 2026-10-16*
