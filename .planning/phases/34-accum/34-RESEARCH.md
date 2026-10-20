# Phase 34: 매집감지(accum) 보고서 - Research

**Researched:** 2026-10-20
**Domain:** 밤 export 선택 파일 적재 일반화(limitup-sync) · Supabase 표/RPC 2개 · Express 조회 라우트 2개 · Next 보고서 화면 + 시간(ms) 축 3패널 SVG 차트(확대/축소 · 이동 · 핀치) · kind 16 소급 내보내기 스크립트
**Confidence:** HIGH(코드 · 계약 · 샘플 실측 근거) / MEDIUM(차트 성능 · 터치 제스처 — 실기기 미검증)

## Summary

Phase 34 는 Phase 33(teamflow)의 길을 거의 그대로 다시 밟는다. 새 기술은 없다 — **새 패키지 0개**이고, 모든 층(마이그레이션 · 워커 · 서버 · shared 타입 · 웹 · e2e)에 복제 원본이 이미 있다. 계획을 세울 때 중요한 것은 「무엇을 새로 만드나」 가 아니라 「team_flow 하드코딩을 어디서 목록으로 풀고, 어떤 기존 단언이 깨지나」 와 「차트를 무엇으로 그리나」 두 가지다.

D-17(차트 구현)의 결론은 **순수 SVG 자체 pan/zoom** 이다. lightweight-charts 5.2.0(설치본)은 ① 시간축이 데이터 점 간격(`barSpacing` = 점 사이 픽셀) 기반이라 15:30~16:00 공백 · 무체결 구간이 접히고 ② 시리즈 데이터가 **엄격 오름차순 시각**(같은 초 중복 불가 — `day_cum_net` 은 주문마다 1점이라 같은 초가 흔하다)이며 ③ 시각 단위가 **초**(`UTCTimestamp`)이고 ④ 마커 크기가 배수(`size`)뿐이라 「반지름 = 2.2 + √(val ÷ 1천만) × 0.5, 상한 7px」 · `first` 테두리 · 채움 불투명도 .55 를 표현하려면 커스텀 primitive 플러그인을 짜야 한다. 패널 전체 높이 음영 · 라벨 달린 세로선도 플러그인이다. 즉 요구 조건 대부분을 라이브러리 밖에서 다시 짜야 하므로 이점이 없다. 반면 채택 목업 C 의 JS(휠 · 드래그 · 프리셋 · 눈금 · clamp · 반지름 식 · 15분 공백 끊기)가 이미 SVG 로 동작하고, Phase 33 의 `useChartWidth` · 1:1 viewBox 규율을 그대로 쓴다.

두 번째로 중요한 발견은 **D-03 의 전제 하나가 코드와 다르다**는 것이다. 팀 매집 보고서 `dates[]` 는 「team_flow 행 있는 날짜」 라 탐지 0 일이 뜨지 않지만, **상한가 보고서 `dates[]` 는 `limitup_loads.files_sig IS NOT NULL` 기준**이라 탐지 0 일(6표 0행 commit)이 **뜬다**. 다행히 상한가 보고서는 그 경우를 이미 그린다(KPI 0 + 「이 날은 상한가 사건이 없어요」). 플래너는 이것을 「뜨지 않음 확인」 이 아니라 「뜨고 빈 날 문구로 그려짐 확인」 단언으로 바꿔야 한다.

**Primary recommendation:** teamflow 경로를 복제하되 워커는 `OPTIONAL_FILES` 목록(team_flow · accum_flow)으로 일반화하고, 차트는 `lib/accum-chart.ts`(순수 기하) + `hooks/use-chart-view.ts`(휠은 네이티브 `{passive:false}` 리스너 · 드래그/핀치는 Pointer Events · rAF 합치기) + `accum-chart.tsx`(세 패널 SVG)로 짠다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| accum_flow 파일 적재(sha 대조 · 행 수 대조 · 재적재 감지) | Worker(Cloud Run Job `limitup-sync`) | Database(`limitup_commit_day`) | 날짜 원자 교체는 DB 함수 1회(PostgREST 는 요청 간 트랜잭션 불가) · 판정은 워커 |
| 날짜 단위 교체 · 90일 purge | Database / Storage | — | 기존 9쌍 commit · purge 함수에 10번째 쌍 · 1줄 |
| DMA 게이트 · 목록/상세 조회 | Database(RPC 안 `dma_visible_accounts`) | API(Express — `requireAuth` 만 · 403 변환) | Phase 33 D-05 동형 · Cloud Run 왕복 1회 |
| 단위 변환(억 · HH:MM · %) · 정렬 · KPI 집계 | Browser(webapp `lib/accum-report.ts`) | — | D-05 워커 무변환 · 서버 snake_case 통과 |
| 상세 지연 로드 · (date,isin) 캐시 | Browser | API | 행 펼침당 RPC 1회 |
| 차트 기하 · 확대/축소 · 핀치 | Browser(순수 SVG) | — | D-17 결론(아래) |
| kind 16 → JSON lines 소급 내보내기 | 운영 스크립트(맥, `scripts/` + relay 워크스페이스 tsx) | Database(서비스롤 읽기 전용) | D-23 — Claude 가 맥에서 실행 |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 적재 (DB · 워커)
- **D-01: 같은 트랜잭션 · 표 하나.** `limitup_accum_flow` — PK `(date, isin)` · 평평한 열 37개(인박스 열 사전 순서 · `*_rate` 는 `double precision` · `since_date text` · `name`/`market`/`end_time_ms`/`reg_time_ms` 등 null 허용은 열 사전대로) + `payload jsonb`. `limitup_stage` CHECK 에 `accum_flow` 추가 · `limitup_commit_day` CREATE OR REPLACE(DELETE-by-date → INSERT 쌍 추가 · 옛 워커 호출 0행 호환 · REVOKE/GRANT · `statement_timeout` 재진술) · `limitup_purge_old` 에 90일 DELETE 한 줄. Phase 33 D-01 과 같은 결. — **Reversibility:** costly — commit_day 시그니처 · stage CHECK · purge 가 한 몸이라 되돌리면 마이그레이션 3곳을 다시 고친다.
- **D-02: 선택 파일을 목록으로 일반화.** 워커의 `TEAM_FLOW_FILE` 단일 분기를 선택 파일 목록(`team_flow` · `accum_flow`)으로 바꾼다 — manifest 에 없으면 그 표 0행 commit(`p_expected.<tbl> = 0` · `limitup_loads.rows` 에 항상 키) · 있으면 `files[].rows` 와 행 수 대조 + sha256 대조 · **재적재 감지 일반화**(manifest 에 파일이 있는데 `limitup_loads.rows` 의 그 키가 없거나 `rows` 와 다르면 files_sig 가 같아도 재적재 · reason `accum_flow_backfill` 류 · 격자 재업로드 생략은 기존 backfill 분기 그대로) · 스테이지 청크는 행 크기(최대 json ≈ 224KB)를 감안해 team_flow 보다 작게(플래너 재량). `KNOWN_SCHEMA_VERSIONS {1,2}` · `NAME_RE` 는 그대로 통과.
- **D-03: 탐지 0 거래일 manifest 를 정상 적재로 수용.** 매집감지 보고서는 상한가·팀 매집 탐지와 무관하게 있어야 한다(사용자 결정). 6표 전부 0행 + `accum_flow` 만 있는 manifest(WR-02 소급 산출물)를 워커가 그대로 적재한다(단위 테스트 추가). 상한가 보고서 `dates[]`·팀 매집 `dates[]` 는 「행 있는 날짜만」 규칙이라 그 날짜가 뜨지 않음을 확인한다(플래너 — 뜨면 빈 날 문구로 처리). gh-trade 에는 「탐지 0 이지만 매집 등록이 있는 날은 **밤 배치가 자동으로** 빈 6표 + accum_flow export 를 쓰라」 고 회신한다(D-24).
- **D-04: files_sig 통째 재적재 수용.** 소급으로 과거 manifest 에 accum_flow 가 더해지면 그 날짜 6표 + 격자까지 다시 도는 비용을 받아들인다(accum_flow 만 다시 싣는 경로는 만들지 않는다 — 인박스 질문 ③ 답). CR-02 재기록으로 sha 가 같으면 sig 가 그대로이므로 재적재 감지는 D-02 의 `rows` 키 비교가 맡는다.
- **D-05: 단위 변환 없음.** 워커는 행을 그대로 넣는다(ms epoch · 원 · 주 · % 그대로 · `since_date` 문자열). 억 · 시각 표기는 웹 표시층.

#### 서버 · RPC (목록 / 상세 분리)
- **D-06: RPC 2개 · 라우트 2개.** 목록 `accum_report_for_user(p_user_id uuid, p_date text default null) → jsonb` = `{access, dates[], date, rows[]}` 에 **평평한 열만**(payload 제외). 상세 `accum_detail_for_user(p_user_id uuid, p_date text, p_isin text) → jsonb` = `{access, row}` 에 평평한 열 + `payload`(한 종목 · 최대 json ≈ 224KB — 행 단위 fetch 로 문제없음 · 인박스 질문 ④ 답 · `reg_time_ms` 초 해상도도 수용). 둘 다 DMA 게이트는 **RPC 안** `dma_visible_accounts` → `{access:false}` → 서버 403 `DmaUnmapped`(Phase 33 D-05 동형 · 라우트는 `requireAuth()` 만). SECURITY INVOKER · `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` · `GRANT TO service_role` 명시. 라우트 모양(`GET /api/accum/report?d=` · `GET /api/accum/report/:date/:isin` 류)과 이름은 플래너 재량. 웹은 행을 펼칠 때 상세를 **지연 로드**하고 같은 세션에서 `(date, isin)` 별로 메모리 캐시한다(재펼침 시 재요청 없음).
- **D-07: 표 접근 · 날짜 목록은 Phase 33 승계.** RLS 켜고 정책 0개 · service_role 전용(33 D-06). `dates[]` 는 `limitup_accum_flow` 에 행이 1개 이상인 날짜만 · `p_date` 없으면 최신 · 행 없는 날짜 직접 진입은 `rows: []`(33 D-07). 서버는 snake_case 그대로 통과(매퍼 없음).

#### 목록 (채택 목업 A `reference/mockup-accum-list.html`)
- **D-08: A 평탄 목록.** 상한가·팀 매집 보고서 동형(날짜 알약 → KPI 4칸 → 종목 행 → 그 자리 아코디언 · **기본 전부 접힘** · 한 번에 하나 · `key=date` 리셋). **정렬 = 상태(매집중 → 매도중 → 종료) 그 안 `pos_net_krw` 내림차순**(라이브 「매집」 패널 `sortAccum` 과 같은 순서) · 정렬 전환 UI 없음. 데스크톱(xl) 열 = 종목(이름 · 코드 · 시장) · 상태(배지 묶음 + 종료 사유 줄) · 결과(태그) · 팀 순매수(등록 후 `pos_net_krw` · 아랫줄 「평단 N · 등록가 N」) · 하루 순매수(`day_net_krw`) · 등록·종료(등록 HH:MM 또는 이월 「MM/DD 등록」 · 아랫줄 「HH:MM 청산」/「장 마감까지」/「오늘 이월」 · 탈락·만료는 「MM/DD 등록 / 06:00 탈락」) · 셰브론. 폰(< xl) = 1줄 종목 + 결과 태그 · 2줄 상태 배지 묶음 · 3줄 메타 「팀 순매수 · 하루 · 등록 HH:MM → HH:MM」.
- **D-09: KPI 4칸** = 등록 종목(행 수 · 보조 「이월 n」) · 장 마감 보유(상태 1+2 수 · 보조 「매집중 a · 매도중 b」) · 종료(상태 3 수 · 보조 「청산 a · 탈락 b · 만료 c」) · 팀 순매수 합(**전 행** `pos_net_krw` 합 · 종료 행 포함 · 부호 + 억 1자리 · 부호 색). 행이 있는 날에만 그린다.
- **D-10: 하루 순매수 열은 값만.** 열 머리 「하루 순매수(등록 전 포함)」 · 행에 보조줄 없음 · pos/day 차이 설명은 상세 「판정 기준」 접힘(D-22). 값 0 은 `--fg-2` 「0.0억」.
- **D-11: 상태 · 종료 표기(자체 라벨).** 상태 배지 1 「매집중」(`--team`/`--team-bg`) · 2 「매도중」(`--accum-sell`) · 3 「종료」(회색 · `--muted` + `--border-subtle`) — 라이브 패널 배지와 같은 치수·색 축, 라벨 3 만 다르다(shared `ACCUM_STATE_LABELS` 는 건드리지 않는다). 배지 묶음 = 상태 + `carry_days > 0` 「이월 D+n」(`--accum-carry`) + `cycle > 1` 「사이클 n」. 종료 행은 배지 아래 사유 줄 「청산 · HH:MM」 / 「이월 탈락(복원 안 됨) · HH:MM」 / 「이월 만료 · 06:00」(`end_reason` 1/2/3 · 시각 = `end_time_ms` KST). **청산이 아닌 종료(`end_reason` 2 · 3) 행은 흐리게**(opacity ≈ .6) — 장중 청산은 정상 농도.
- **D-12: 결과 태그.** 등락률 태그 「+NN.N%」(`last_rate` · 회색 알약). `last_px >= upper` 면 `--up` 톤 「상한가 +NN.N%」(export 에 상한가 도달 시각이 없으므로 HH:MM 은 붙이지 않는다 — 목업의 「상한가 14:17」 은 합성 표기). 데스크톱 보조줄 「고가 +NN.N%」(`high_rate`) 는 상한가가 아닐 때만. `last_rate` null 은 「—」.
- **D-13: 표기 규칙 승계.** 금액 = 부호 + 억 소수 1자리(`fmtEok` 재사용 · 손익 줄은 2자리) · 가격(평단 · 등록가) = 원 정수 쉼표 · 시각 = KST HH:MM(차트 툴팁은 HH:MM:SS) · null 「—」. 33 D-10 과 같다.

#### 상세 차트 (채택 목업 C `reference/mockup-accum-chart.html` + 세 번째 패널은 `mockup-accum-detail.html`)
- **D-14: 세 패널 · 시간축 09:00~20:00 · 확대/축소 · 좌우 이동.** 위 **가격 패널**(`payload.price` 10초 선 · 팀 주문 원 · `first` 표식 · 등록/종료 세로선 · 등록 전 음영) → **순매수 누적 패널**(`payload.day_cum_net` 계단 · 0선 점선 · 보라 `--team`) → **10분 매수/매도 패널**(`payload.buckets` 10분 칸 매수 빨강 / 매도 파랑 막대 쌍 · 사용자 결정으로 로드맵 7요소에 추가). 세 패널은 같은 x(ms) 창을 공유한다. **기본 창 = 하루 전체 09:00~20:00**(데스크톱 · 폰 동일). 휠/트랙패드(폰은 핀치) = 커서 기준 확대/축소 · 드래그 = 좌우 이동 · 프리셋 버튼 「전체 · 정규장(09:00~15:30) · 마지막 2시간(마지막 체결 끝 2시간)」 · 최소 창 10분 · 창은 09:00~20:00 안으로 clamp · 가격축은 **보이는 창 안의 가격으로 자동 맞춤** · 누적축 · 10분축은 하루 전체 범위 고정(0선이 흔들리지 않게). 15:30~16:00 은 빈 띠(정상) · 가격 선은 15분 이상 공백에서 끊는다(이어 긋지 않는다). 현재 창 범위 「HH:MM ~ HH:MM」 을 프리셋 줄 오른쪽에 표시.
- **D-15: 주문 원.** `payload.orders` 각 주문을 (t_ms, px) 에 원으로 · 매수 `--up` · 매도 `--down` · 채움 불투명도 .55 · **반지름 = 2.2 + √(val ÷ 1천만) × 0.5, 상한 7px**(1천만 ≈ 2.7 · 1억 ≈ 3.8 · 10억 이상 7 — 사용자 「너무 크다」 정정 뒤 채택). `first = 1` 은 같은 원에 `--fg` 테두리 1.6px(범례 「팀매수 시작」 · 1천만 미만이어도 실린 이유). 툴팁(`<title>` 또는 동급) = 「HH:MM:SS 팀 매수/매도 N주 · X.XX억 @가격 · N조각 (· 팀매수 시작)」.
- **D-16: 세로선 · 음영 · 경계 사례.** 사이클마다 등록선 = `--team` 실선 + 라벨 「등록 HH:MM」(사이클 2개 이상이면 「· k」 번호) · 종료선 = `--muted-fg` 점선 + 라벨 「{사유} HH:MM」(청산/이월 탈락(복원 안 됨)/이월 만료). 등록 전 음영 = 09:00 ~ **그날 첫 사이클** `reg_time_ms`(세 패널 전체 높이 · `--shade` 류 연한 회색) — **오늘 등록(`since_date == date`) 일 때만**. 이월 종목(`since_date < date`)은 등록선 · 음영 없음, 좌상단 「이월 D+n · MM/DD HH:MM 등록」 한 줄(`--accum-carry`). 09:00 이전 등록(`reg_time_ms < price.t0_ms`)은 09:00 에 맞춘다. 06:00 종료 행만 있는 종목(`end_time_ms` < 09:00)은 종료선을 09:00 왼쪽 끝에 붙이고 라벨 「이월 탈락 06:00」. `cycles[]` 는 **번호 연속을 가정하지 않고 나온 순서대로**(CR-01 — 번호가 1 로 되돌아가도 별개 사이클).
- **D-17: 확대/축소 구현은 리서치가 정한다.** 후보 = lightweight-charts(종목 차트에 이미 사용 · 패널 · 마커 · 시간축 pan/zoom 내장 · oklch 색 거부라 hex 변환 필요) vs 순수 SVG 자체 pan/zoom(Phase 33 D-12 결 · `useChartWidth` · 1:1 viewBox). 요구 조건: 세 패널 x 동기 · 가변 반지름 원 · 전체 높이 음영 · 라벨 달린 세로선 · 계단 선 · 막대 쌍 · 툴팁 · 폰 핀치 · 드래그 · `prefers-reduced-motion` 존중 · 한선엔지니어링급(price 3,648칸 · orders 501 · day_cum_net 6,513점) 에서 끊김 없는 확대/이동. 리서치가 둘 중 하나를 근거와 함께 고르고, 플래너는 그 선택을 잠근다.
- **D-18: 빈 자료.** 팀 체결 없는 종목(`orders` 0 · `day_cum_net` 0 · `pnl` null)은 가격 선 + 0선 + 축만으로 깨지지 않는다(「팀 체결 없음」 캡션). `price` 가 비면(체결 0) 차트 자리에 「그날 체결 자료 없음」 한 줄. 상세 로드 중 스켈레톤 · 실패 시 「상세를 불러오지 못했어요 · 다시 시도」.

#### 상세 부속 (채택 목업 `reference/mockup-accum-detail.html` 토글값: 사이클 표 2개↑만 · 손익 줄 켬 · 10분 막대 세 번째 패널 · 임계 판정 기준 안)
- **D-19: 상세 순서** = KPI 줄 → 범례 → 프리셋 줄 → 차트(세 패널) → 사이클 표(조건부) → 팀 당일 손익 줄 → 「판정 기준」 접힘 → 출처 칩. **KPI 줄 4개**(마지막 사이클 = 평평한 열) = 등록가(`pos_reg_px`) · 평단(`pos_avg_px`) · 등록 후 순매수(`pos_net_krw` 부호 색) · 최고 순매수(`pos_peak_net_krw`). 임계는 넣지 않는다.
- **D-20: 사이클 표는 `cycles.length >= 2` 일 때만** 차트 아래 **기본 펼침**(1개면 표 없음 · KPI 줄만). 열 = # · 등록(HH:MM:SS) · 종료(HH:MM:SS 또는 「장 마감까지」) · 상태/사유 · 등록가 · 평단 · 순매수 · 최고 순매수 · 매수/매도 수량 · 마지막 사이클 행 `--team` 왼쪽 강조. 폰은 가로 스크롤.
- **D-21: 팀 당일 손익 줄 = 팀 매집 보고서 동형.** `payload.pnl` 13키 중 총 손익(`total_val` · 억 2자리 부호 색) + 수익률(`ret` × 100 소수 1자리) · 실현 · 평가 · 보유주(`end_qty`) · 출처 모를 매도(`unknown_sell_qty`). `pnl` null 이면 「팀 체결 없음」.
- **D-22: 「판정 기준」 접힘(기본 접힘).** 첫 줄 = **이 종목의 등록 임계**(`th_net_krw` 억 · `th_same` 조각 · `th_mcap_krw` 억 이하 · 현재 시총 `mcap_krw`) → `pos_*`(서버 상태기 · 등록 후 · 우리 체결 제외 · 마지막 사이클) vs `day_*`/차트(119 pcap 재계산 · 하루 전체 · 등록 전 · 우리 체결 · 상한가 체결 포함 · 팀 매집 보고서 하루 합계와도 다름) → 원(1천만 이상 + 사이클별 첫 매수)/계단(전체 팀 주문) 규칙 → 종료 사유 3종 뜻(2 = 06:00 탈락 + 서버 기동 정합) → 「규칙 원문: gh-trade 매집감지(accum-signal) · 팀 매집 분석 §13」 한 줄(링크 없음 · 웹에 하드코딩). **「KYOBO119 판정 기준」** 은 페이지 머리 칩(「KYOBO119 판정 기준 · 20:30 적재」)과 상세 끝 출처 칩 두 곳에 표기한다(인박스 D-03). kind 16 과 join 하지 않는다(이 표가 이력 정본).

#### 소급 · 인박스 · 배포 · UAT
- **D-23: 소급 내보내기는 Claude 가 맥에서 실행.** repo 에 `scripts/export-accum-backfill.ts`(이름 재량 · `scripts/migrate-dma-users.ts` 패턴 — tsx + supabase-js service role · 키는 `scripts/dma-credentials.sh` 류 비출력 래퍼로 주입 · **읽기 전용**)를 두고 날짜 인자로 돌린다. 입력 = `dma_strategy_events` `kind = 16 AND gateway = 'KYOBO119' AND trade_date = D`(queue_case 무관 · 전부) · 출력 = `~/ticks/accum-backfill/<D>.jsonl`(한 줄 = 인박스 「소급 목록 파일 형식」 23키 — `row←queue_case` · `state←qty` · `end_reason←cancel_reason` · `cycle←expected_cum` · `carry_days←entry_round` · `since_date`/`reg_time` 은 `message` 의 `since=`/`reg=` **문자열**(앞 0 유지) · `th_net_krw`/`th_min_same`←`snap_cum[0]`/`[1]` · `th_max_mcap_krw`←`message` `th=` 셋째 값 · 나머지 매핑 표대로 정수). **대상 = 10/19 · 10/20**(10/20 은 서버 19:07 재기동으로 장중 이벤트가 서버 파일에 없음 · CR-02 이어받기로 D+1 재기록에도 보존). 전달 = 맥 파일 경로 + 행 수를 gh-trade 세션에 SendMessage(필요하면 `scripts/trade-handoff.sh` 노트) → gh-trade 가 119 `~/ticks/accum-backfill/<D>.jsonl` 로 옮겨 `tickana.batch --accum-events` 실행(인박스 질문 ② = (b) 사용자/맥 경로). 실행 결과(파일 경로 · 행 수 · `bad=`)를 SUMMARY 에 남긴다.
- **D-24: 인박스 회신(`## 회신` 에 적고 마지막 플랜에서 `status: done` · `done_commit` 경로 지정 커밋).** ① D-09 조건부 10분 미루기 **수락** — gh-trade 첫날 실측(`finished_at` > 20:20)을 받으면 `infra/relay/limitup-pull/` 타이머 `OnCalendar` 20:30 과 `scripts/deploy-limitup-sync.sh` `CRON` 20:40 을 함께 미루고 회신, 안 넘기면 그대로. ② 소급 전달 = **(b) 맥 파일 → gh-trade 가 119 로**. ③ files_sig 통째 재적재 **수락**(D-04). ④ 샘플 행 모양 이상 없음 — 상세 RPC 행 단위 fetch 로 224KB 문제없음 · `reg_time_ms` 초 해상도 수용 · `th_same`/`th_mcap_krw` 열 이름은 export 그대로 쓴다. 추가 ⑤ **탐지 0 이지만 매집 등록이 있는 날은 밤 배치가 자동으로 빈 6표 + accum_flow + manifest 를 쓰도록 요청**(gh-radar 워커는 D-03 으로 수용 · 수동 recover 불필요하게). **2026-10-20 저녁 gh-trade-f4 와 합의(SendMessage):** 게시 조건은 「그날 이벤트 파일에 **장중 행(row 1 분 경계 또는 row 5 경보)** 이 있다」 로 좁힌다 — 06:00 row 4 · 복원 row 3 만 있는 날은 게시 안 함(휴장일 · KRX 시험 송출 오게시 회피). 알고 받는 한계: 탐지 0 거래일에 06:00 탈락·만료만 있고 장중 포지션이 없으면 그 탈락은 보고서 이력에 남지 않는다. gh-trade 가 사용자 확인 뒤 quick 으로 구현 · 119 재배포하고 다시 알린다. ⑥ CR-01 · CR-02 · WR-02 반영 확인. gh-trade 세션(gh-trade-f4)에 처리 완료를 SendMessage 로 알린다(보조 — 파일이 정본).
- **D-25: 배포 순서.** DB 마이그레이션(표 · CHECK · commit_day · purge · RPC 2개 — 옛 워커 호환) → limitup-sync Job 재배포(`scripts/deploy-limitup-sync.sh` · **20:20~20:50 KST 밖**) → 소급 파일 내보내기(D-23) → gh-trade 119 배치 뒤 radar-gw `limitup-pull.sh --allow-daytime` 1회 운반 + `gcloud run jobs execute` 즉시 실행(재적재 감지로 10/19 · 10/20 채움) → server 배포 → webapp push(= 프로덕션). relay · 와이어 변경 없음. 배포 · 스모크는 메인 세션이 한다(서브에이전트 배포 금지 · [[feedback_subagent_deploy_classifier]]). D-09 10분 미루기는 gh-trade 실측 보고를 받은 뒤 별도 커밋.
- **D-26: 라이브 UAT = 10/19 · 10/20 실물.** 프로덕션 수동 주입 없음. `/analytics/accum?d=20261019` · `20261020` 에서 목록 · 상세 차트(등록 전 음영 · 세로선 · first · 사이클 표 · 손익 줄) 실측. 오늘 밤(10/20 20:30) 적재분은 옛 워커가 sha 대조만 하고 통과하므로, 워커 배포 뒤 첫 실행(재적재 감지)이 채운다.
- **D-27: 사이드바.** 「분석」 그룹 「팀 매집 보고서」 다음에 「매집감지 보고서」(`/analytics/accum` · active = prefix) · `app-sidebar.test.tsx` · `e2e/specs/sidebar-tree.spec.ts` 의 링크 순서 단언 갱신.

### Claude's Discretion
- 표 · RPC · 라우트 · 파일 · shared 타입 이름(`limitup_accum_flow` · `accum_report_for_user` · `accum_detail_for_user` · `server/src/routes/accum-report.ts` · `webapp/src/app/analytics/accum/page.tsx` · `packages/shared/src/accum-report.ts` 류) · 선택 파일 목록 상수 이름 · 스테이지 청크 크기 · 재적재 reason 문자열.
- 상한가 보고서 · 팀 매집 부품 재사용 범위(`LimitupDateNav` · `parseYmdParam` · `dateNavOf` · `fmtYmd*` · `fmtEok` · `kstHm` · DmaGate · KpiStrip/DayGrid 는 teamflow 처럼 **복제**(일반화 안 함)) · 상세 지연 로드 스켈레톤 모양 · 캐시 구현 위치.
- 빈 상태 문구(「아직 올라온 매집감지 보고서가 없어요 / 첫 보고서는 평일 밤 20:30쯤 올라와요」 · 「이 날은 매집감지 데이터가 없어요」 + 「최신 보고서 보기」 — teamflow 문구 변형) · 문서 title · 오류 문구.
- 차트 세부(패널 높이 · 여백 · 눈금 간격 규칙 · 10분 막대 폭 · 라벨 겹침 회피 · 폰 390 터치 임계) · 범례 순서 · 프리셋 버튼 모양 · 세 번째 패널 제목 문구.
- 판정 기준 접힘 본문 문구(D-22 의 항목 순서는 고정 · 문장은 재량) · 「이월 탈락(복원 안 됨)」 툴팁 보강 여부.
- 소급 스크립트의 인자(`--date` 복수 · `--out`) · `bad` 집계 로그 모양 · 실행 전 행 수 미리보기.
- E2E = teamflow-report.spec 동형(`page.route` 로 목록 · 상세 두 경로 모킹 · 390 폰 · 아코디언 1개 · 사이클 표 조건부 · 프리셋 클릭) · 단위 = 변환 함수(정렬 키 · KPI 집계 · 라벨 매핑 · 원 반지름 · 창 clamp · 눈금 · 소급 행 매핑) · 워커 픽스처 = 맥 샘플(`accum_flow.ndjson.gz` 1행 + `accum_flow-34.ndjson.gz` 34행 중 선별 · manifest `files[]` 에 rows/sha256 맞춤 · 날짜는 기존 20261002 와 섞을지 재량) + 탐지 0 manifest 픽스처(D-03).
- 알림 `ops/alert-limitup-sync-failure.yaml` 문구에 accum_flow 언급 여부.

### Deferred Ideas (OUT OF SCOPE)
- **탐지 0 거래일 자동 export(gh-trade 몫).** 밤 배치가 장중 행이 있는 탐지 0 일에 빈 6표 + accum_flow 를 자동으로 쓰는 것 — gh-trade 가 「가능 · 작은 수정」 으로 받아 사용자 확인 뒤 quick 으로 진행(D-24 ⑤ 조건). gh-radar 는 D-03 으로 받을 준비만. 재배포 알림이 오면 첫 적용 날짜를 UAT 에 더한다.
- **라이브 「매집」 패널 상태 3 라벨 「청산」 → 「종료」 통일 여부.** 보고서가 「종료 + 사유」 로 가르므로 라이브 패널도 맞출지 — 별도 quick(사용자 판단).
- **목록 행에 팀 손익 열.** 팀 매집 보고서 목록에는 손익 열이 있지만 이번 목록에는 넣지 않았다(상세 손익 줄만). 필요하면 후속.
- **10분 표 보기(buckets 접힌 표).** 세 번째 패널로 그리므로 표는 두지 않는다. 숫자 확인 요구가 생기면 후속.
- **D-09 10분 미루기 실행.** gh-trade 첫날 실측 보고 뒤 별도 커밋(phase 안에서 조건부 — 실측이 20:20 을 넘지 않으면 할 일 없음).
</user_constraints>

<phase_requirements>
## Phase Requirements

REQUIREMENTS.md 에 Phase 34 ID 가 아직 없다(로드맵 「Requirements: TBD」). 아래는 Goal · Success Criteria · CONTEXT 결정에서 도출한 **제안 ID** 다 — 플래너가 REQUIREMENTS.md 에 올리고(teamflow 의 TEAM-01~04 와 같은 꼴) 플랜에 매핑한다.

| ID | Description | Research Support |
|----|-------------|------------------|
| ACCUM-01 | `limitup-sync` 가 manifest `files[]` 의 `accum_flow.ndjson.gz` 를 team_flow 와 같은 규칙(sha256 · 행 수 대조 · `limitup_commit_day` 날짜 원자 교체)으로 `limitup_accum_flow` 에 적재하고, 파일 없는 날짜는 6표 · team_flow 에 영향 없음 · 재적재 감지(이력 rows ≠ manifest)가 accum_flow 로 일반화 · 탐지 0 manifest 수용 · 90일 purge | §워커 통합 지점 · §SQL 지점 · Pitfall 1~5 |
| ACCUM-02 | 서버가 목록(평평한 열만)과 상세(한 종목 payload)를 분리된 RPC/라우트로 내준다 · DMA 게이트는 RPC 안 · 라우트는 `requireAuth` 만 | §SQL 지점 RPC · §서버 지점 · Pitfall 6 |
| ACCUM-03 | 사이드바 「분석 › 매집감지 보고서」 · `/analytics/accum?d=` 목록(날짜 알약 · KPI 4칸 · 상태 배지 묶음 · 종료 사유 · 흐림 · 정렬) · 행 펼침 시 상세 지연 로드 + 메모리 캐시 | §웹 지점 목록 · Pitfall 9 · 10 |
| ACCUM-04 | 상세 = KPI 줄 → 범례 → 프리셋 → 세 패널 차트(가격 선 · 팀 원 · first · 누적 계단 · 10분 막대 · 사이클 세로선 · 등록 전 음영 · 확대/축소 · 드래그 · 핀치) → 사이클 표(2개↑) → 손익 줄 → 판정 기준 → 출처 칩 · 빈 자료 · 경계 사례 | §D-17 결론 · §차트 설계 · Pitfall 11~15 |
| ACCUM-05 | kind 16(KYOBO119)을 날짜별 23키 JSON lines 로 `~/ticks/accum-backfill/<D>.jsonl` 에 내보내는 읽기 전용 스크립트 · 10/19 · 10/20 실행 · gh-trade 전달 | §소급 스크립트 · Pitfall 16~18 |
| ACCUM-06 | 단위 · pgTAP · E2E 통과 · 10/19 · 10/20 라이브 UAT · 인박스 `261020-accum-flow-export.md` 회신 + `status: done` | §Validation Architecture · §배포 |
</phase_requirements>

## Project Constraints (from CLAUDE.md · 자동 메모리)

| 출처 | 지시 | 이 phase 에 닿는 곳 |
|------|------|-------------------|
| CLAUDE.md 「gh-trade 인박스」 | 처리하면 `status: done` · `done_commit` 채워 **경로 지정** 커밋(`git add -A` 금지) | 마지막 플랜 |
| CLAUDE.md 「GSD Workflow」 | 파일 변경은 GSD 명령 안에서 | 전 플랜 |
| CLAUDE.md 「데이터 소스 운영 기준」 | 서버측 배치만 · 사용자 트래픽 비례 호출 금지 · 출처 표기 | accum 은 119 밤 배치 산출물이라 해당 — 「KYOBO119 판정 기준」 출처 칩(D-22) |
| 메모리 RPC REVOKE | `REVOKE … FROM PUBLIC` + `FROM anon, authenticated` 명시 + `GRANT … TO service_role` | RPC 2개 · commit_day · purge |
| 메모리 RLS | 새 표는 RLS 켬 — 이 표는 정책 0개 · service_role 전용(33 D-06 승계)이라 `TO anon, authenticated` 정책을 만들지 않는다 | `limitup_accum_flow` |
| 메모리 Cloud Run 왕복 | 다중 쿼리는 RPC 1회 | 목록 1회 · 상세 행 펼침당 1회 |
| 메모리 lightweight-charts oklch | 쓰면 hex 변환 | **D-17 결론 = 쓰지 않음** — 해당 없음 |
| 메모리 동시 세션 테스트 | vitest `--maxWorkers=2` · playwright `--workers=1` · 전체 회귀는 한 세션 | Validation |
| 메모리 서브에이전트 배포 차단 | executor 는 커밋까지 · 배포 · 스모크는 메인 세션 | 배포 플랜은 `autonomous: false` 또는 메인 세션 런북 |
| 메모리 배포 relay 먼저 · push 나중 | push = webapp 프로덕션 배포 · 백엔드 막히면 push 금지 | D-25 순서 |
| 메모리 비밀 주입 · `.env` | `.env` 읽기는 이 환경의 Bash 훅이 막는다(이번 리서치에서 실측) · 키는 래퍼가 `source` 로만 | 소급 스크립트 실행 |
| 메모리 샌드박스 TCP · IAP SSH 차단 | radar-gw `limitup-pull.sh --allow-daytime` · relay 스모크는 `dangerouslyDisableSandbox` | 배포 런북 |
| 메모리 보안검사 안 함 | `security_enforcement: false` · `/gsd-secure-phase` 생략 · nyquist 유지 | Security Domain 생략 |
| 메모리 목업 open | 목업은 `open` 으로만 | 이미 채택 완료 — 추가 목업 없음 |
| 메모리 GSD 단계 경계 멈춤 | 명령 하나 끝나면 요약 + 다음 명령 안내 | 오케스트레이터 몫 |

## Standard Stack

### Core (전부 기존 — 새 설치 없음)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.49.0(워커) | stage insert · RPC | 워커 · 서버 · relay 공통 [VERIFIED: workers/limitup-sync/package.json] |
| Express + zod | 기존 | 라우트 · 입력 검증 | teamflow 라우트 복제 [VERIFIED: server/src/routes/teamflow-report.ts] |
| React 19 · Next 15 | `^19.0.0` · `^15.0.0` | 보고서 화면 | [VERIFIED: webapp/package.json] |
| 순수 SVG + `useChartWidth` | 기존 훅 | 세 패널 차트 | D-17 결론 · Phase 33 D-12 결 [VERIFIED: webapp/src/hooks/use-chart-width.ts] |
| pgTAP(로컬 컨테이너) | `public.ecr.aws/supabase/postgres:17.6.1.104` | SQL 회귀 | [VERIFIED: scripts/verify-dma-orders-price-check.sh:34 `IMAGE="public.ecr.aws/supabase/postgres:17.6.1.104"`] |
| vitest · Playwright | webapp `^2.1.9` · `^1.59.1` | 단위 · E2E | [VERIFIED: webapp/package.json] |
| tsx(relay 워크스페이스) | 기존 | 소급 스크립트 실행 | `scripts/migrate-dma-users.ts` 패턴 [VERIFIED: scripts/dma-credentials.sh:85] |

**Installation:** 없음 — 외부 패키지 설치 0(Package Legitimacy Audit 대상 없음).

## D-17 결론 — 순수 SVG 자체 pan/zoom (플래너가 잠근다)

설치본 lightweight-charts 5.2.0 을 직접 열어 확인한 막힘 4가지(그래서 쓰지 않는다 · oklch→hex 변환도 불필요):
- 시간축이 점 간격 기반 — `barSpacing` 「The space between bars in pixels.」 [VERIFIED: webapp/node_modules/lightweight-charts/dist/typings.d.ts:1362-1367] → 15:30~16:00 · 무체결 공백이 접힌다.
- 시리즈 시각 엄격 오름차순 `prevTime < currentTime` · `data must be asc ordered by time` [VERIFIED: dist/lightweight-charts.development.mjs:12567-12568] + 초 단위 `UTCTimestamp` [VERIFIED: typings.d.ts:5005] → `day_cum_net`(주문마다 1점 · 같은 초 중복)을 합쳐야 한다.
- 마커 `shape: "circle" | "square" | "arrowUp" | "arrowDown"` · `size?: number` 배수 · `color` 하나 [VERIFIED: typings.d.ts:4922 · 3960-3984] → D-15 픽셀 반지름 · `first` 테두리 · 채움 .55 불가(커스텀 primitive 필요).
- 패널 경계를 넘는 음영 · 라벨 세로선 = 플러그인.

순수 SVG 는 목업 C 의 `clampView` · `ticks` · `preset` · `rOf` · 휠/드래그 · 15분 끊기 JS 를 그대로 이식하고 Phase 33 `useChartWidth` · 1:1 viewBox 를 쓴다. 최대 행(한선엔지니어링 price 3,648 · orders 501 · day_cum_net 6,513 — 샘플 실측)도 path 2개 + 원 ≤ 501개 · 창 밖은 이진 탐색으로 자름 · rAF 로 프레임당 렌더 1회. 「끊김 없음」 은 실기기 전이라 [ASSUMED] — E2E 휠 스모크 + 라이브 UAT 로 확인.

## 계약 실측 (export 행 · 샘플)

**열 순서 정본** — gh-trade `teamflow_accum.py:34-38` [VERIFIED: /Users/alex/repos/gh-trade/server/tools/analysis/tickana/teamflow_accum.py:34-38]:

```
FLAT_COLUMNS = ("date", "isin", "short_code", "name", "market", "base", "upper", "last_px", "last_rate", "high_px", "high_rate",
                "state", "end_reason", "cycle", "carry_days", "since_date", "reg_time_ms", "end_time_ms", "our_excluded_qty", "mcap_krw",
                "th_net_krw", "th_same", "th_mcap_krw",
                "pos_buy_qty", "pos_buy_krw", "pos_sell_qty", "pos_sell_krw", "pos_net_krw", "pos_avg_px", "pos_peak_net_krw", "pos_reg_px",
                "day_buy_krw", "day_sell_krw", "day_net_krw", "day_buy_qty", "day_sell_qty", "schema_version")
```

인박스 열 사전과 한 칸도 다르지 않다(노트와 어긋나면 코드가 맞다 — CONTEXT).

**맥 샘플 34행 JSON 형 실측**(`~/ticks/accum-flow-sample/20261014/accum_flow-34.ndjson.gz` · sha256 `1f633270df99b15d59dafc8ec91762e9cea4c174e6502c9f1f82faaba74d2a5e` · 이번 세션 python 으로 전 행 순회) [VERIFIED: 샘플 파일]:
- `str`: date · isin · short_code · market · since_date / `str|null`: name / `float`: last_rate · high_rate / `int`: 나머지 전부 / `null`(이 샘플): end_time_ms(전부 살아 있는 모의 줄).
- payload 6키 순서 `price · orders · buckets · day_cum_net · pnl · cycles` · `orders.side` 는 `"B"`/`"S"` 문자열 · `pnl` null 3행(CJ씨푸드1우 · 하이퍼코퍼레이션 · name null 행).
- 비 KR ISIN 실재: `KYG2114A1094`(씨엑스아이) · `KRA0113321F5`(name null). → ISIN 검증은 `^[A-Z0-9]{12}$`(gh-trade `_ISIN_RE = re.compile(r"^[A-Z0-9]{12}$")` [VERIFIED: teamflow_accum.py:52]) — `^KR7…` 로 좁히면 이 행들의 상세 라우트가 400 이 된다.
- 행 크기(compact json): 최소 1,394 B(CJ씨푸드1우 · orders 0) · 중앙 ≈ 30KB · 최대 223,742 B(한선엔지니어링). 1행 샘플 `accum_flow.ndjson.gz` sha256 `943b0a1248ba4c98c7289b6c6be0686bfb756c6ffb0c27149aec070814bc2a10`(인박스 값과 일치).

**`price` 는 항상 있다** — `price_cells` 가 체결 0 이어도 `{"t0_ms": t0_ms, "step_s": PRICE_STEP_S, "idx": [], "px": []}` 를 낸다 [VERIFIED: teamflow_accum.py:198-203]. 단 `build_day_row` 는 A3 0행이면 `raise ValueError(f"A3 행 0: {isin}")`(그 종목 행 자체가 없다) — 그래서 `idx` 가 빈 행은 「체결이 전부 09:00~20:00 밖」 인 드문 경우뿐이다. D-18 「그날 체결 자료 없음」 은 `price.idx.length === 0` 으로 판정한다.

**`orders` 빈 모양** — `{k: [] for k in keys}` 7키 빈 배열 [VERIFIED: teamflow_accum.py:242-245]. `first` 창은 `(앞 end, 이 end]` — 06:00 종료 행만 있는 종목은 `first` 0건(인박스).

**사이클 경계(CR-01)** — `cycles_of`: 「`prev["cycle"] != r["cycle"] or (int(prev["row"]) == ROW_END and int(r["row"]) != ROW_END)`」 [VERIFIED: teamflow_accum.py `cycles_of`] → 같은 날 `cycles[]` 에 `cycle` 값이 **중복**(1, 1)될 수 있다.

## 워커 통합 지점 (D-02 · D-03 · D-04)

현재 하드코딩 지점(전부 이번 세션에 Read):

| 위치 | 현재 값(원문) | 바꿀 것 |
|---|---|---|
| `src/load.ts:16` | `export type StageTbl = ExportTbl \| "grid_summary" \| "member_daily" \| "team_flow";` | `\| "accum_flow"` 추가 |
| `src/load.ts:23` | `export const TEAM_FLOW_FILE = "team_flow.ndjson.gz";` | 선택 파일 목록 상수로 |
| `src/load.ts:28` | `export const TEAM_FLOW_STAGE_CHUNK = 20;` | 표별 청크 |
| `src/index.ts:117` | `const STAGE_TABLES: readonly StageTbl[] = [...EXPORT_TABLES, "grid_summary", "member_daily", "team_flow"];` | `"accum_flow"` 추가(→ `emptyCounts` · `totals` · `p_expected` 에 키가 늘 생긴다) |
| `src/index.ts:223-224` | `const tfEntry = m.files.find((f) => f.name === TEAM_FLOW_FILE);` · `const needTeamFlow = tfEntry !== undefined && p?.rows?.team_flow !== tfEntry.rows;` | 목록 순회 → `needBackfill: tbl[]` |
| `src/index.ts:239` | `const reason = p === undefined ? "new" : p.sig !== sig ? "files_sig" : "team_flow_backfill";` | `${tbls.join("+")}_backfill` — 표 하나면 기존 문자열 그대로(`team_flow_backfill` 단언 유지) |
| `src/index.ts:266-274` | team_flow 읽기 · 행 수 대조 | 목록 순회 |
| `src/index.ts:302` | `const backfill = reason === "team_flow_backfill";` | `reason.endsWith("_backfill")` |
| `src/index.ts:307` | `await stageDay(sb, date, { team_flow: teamFlow }, Math.min(config.stageChunk, TEAM_FLOW_STAGE_CHUNK));` | 표마다 자기 청크 |
| `src/manifest.ts:19` | `export const KNOWN_SCHEMA_VERSIONS: ReadonlySet<number> = new Set([1, 2]);` | 그대로(인박스 「schema_version 은 export 공통 값 `1`」) |

**청크 권고: accum_flow 는 행 1개씩(`chunk = 1`).** 최대 행 224KB 는 Phase 33 이 증명한 insert 본문(member_alloc 1000행 ≈ 293KB — `load.ts:24-27` 주석) 안에 들어가고, 하루 행 수가 수~수십이라 insert 횟수(≤ 수십 번)는 문제가 아니다. 2개씩이면 최악 ≈ 448KB 로 증명 범위를 넘는다. (바이트 예산 청크는 우아하지만 `stageDay` 시그니처를 바꾸는 일이라 이번 범위 밖.)

**탐지 0 manifest(D-03)** — 현재 코드로 이미 통과한다: 6표 루프는 `if (!entry) throw new Error(\`${date}: manifest has no ${name}\`)` 라 **6개 파일 항목이 rows 0 으로 있어야** 하고(WR-02 「빈 표 6개(0행)」 와 일치), 격자 0개 · `memberDailyOf(date, [], [], [])` → 빈 배열 · `limitup_commit_day` 는 기대 0 = stage 0 으로 통과. 새 테스트는 「6표 rows 0 + accum_flow N + team_flow 없음」 manifest 로 commit `p_expected` = `{6표 0, grid_summary 0, member_daily 0, team_flow 0, accum_flow N}` 를 단언한다. 픽스처는 빈 ndjson.gz 6개(sha 를 manifest 에 맞춤)를 `tests/fixtures/` 에 새 날짜 디렉터리로 만든다(`make-fixture.mjs` 규칙: gzip level 9 · mtime 0).

**재적재 감지 일반화의 운영 효과(배포 직후 첫 run):** 이력 rows 에 `accum_flow` 키가 없는 날짜는 90일 전부지만, **manifest 에 accum_flow 가 있는 날짜만** 재적재된다(`entry !== undefined` 조건) — 10/20(오늘 밤 첫 실물 · 옛 워커가 sha 만 대조하고 통과) 하나, 소급 후 10/19(files_sig 변경). 나머지 날짜는 `unchanged`. 격자 재업로드는 `_backfill` 분기에서 생략(sig 같음 = 격자 sha 같음).

## SQL 지점

### 새 마이그레이션 1개(표 · CHECK · commit_day · purge) + RPC 마이그레이션 1개

`20261016200000_limitup_team_flow.sql` 을 본뜬다. 가장 최근 정의가 이 파일이다 — 이후 `limitup_commit_day` · `limitup_purge_old` · `limitup_stage_tbl_check` 를 다시 정의한 마이그레이션은 없다 [VERIFIED: `grep -ln` 결과 마지막이 20261016200000 · 그 뒤 20261020130000 은 데이터 DELETE 뿐].

**열 형 권고(D-01):**
| 열 | 형 | 이유 |
|---|---|---|
| date · isin | `text NOT NULL` · PK `(date, isin)` | 다른 limitup 표와 같음 |
| short_code · name · market · since_date | `text` | since_date 는 문자열 계약(인박스) |
| last_rate · high_rate | `double precision` | `jsonb_populate_record` 가 29.78 을 bigint 에 넣으면 그날 commit 통째 실패(20261016200000 머리말 :31-32) |
| state · end_reason · cycle · carry_days · schema_version | `integer` | 작은 정수 · CHECK 없음(team_flow `status` 선례 — 값이 늘면 commit 전체 실패) |
| 나머지 숫자 열(base · upper · *_px · *_ms · *_krw · *_qty · th_same · mcap_krw) | `bigint` | 원 · ms · 주. `th_same` 도 bigint 로 통일(형 실수 여지 제거) |
| payload | `jsonb` | 6키 원문 |

**commit_day 10번째 쌍** — 9번째 쌍(:215-223)을 그대로 복제:

```sql
-- Source: supabase/migrations/20261016200000_limitup_team_flow.sql:215-223 (team_flow 쌍) 복제
DELETE FROM public.limitup_accum_flow WHERE date = p_date;
INSERT INTO public.limitup_accum_flow
  SELECT (jsonb_populate_record(NULL::public.limitup_accum_flow, s.payload)).*
    FROM public.limitup_stage s WHERE s.date = p_date AND s.tbl = 'accum_flow' ORDER BY s.seq;
GET DIAGNOSTICS v_n = ROW_COUNT;
IF p_expected ? 'accum_flow' THEN
  v_rows := v_rows || jsonb_build_object('accum_flow', v_n);
END IF;
```

그리고 `v_tbls`(:124-125 `ARRAY['entries', 'locks', 'jumps', 'member_alloc', 'facts', 'touches', 'grid_summary', 'member_daily', 'team_flow']`)에 `'accum_flow'` · stage CHECK(:106-107 `CHECK (tbl IN ('entries', 'locks', 'jumps', 'member_alloc', 'facts', 'touches', 'grid_summary', 'member_daily', 'team_flow'))`)에 `'accum_flow'` · `DROP CONSTRAINT limitup_stage_tbl_check`(IF EXISTS 없이 — :105) · `ALTER FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) SET statement_timeout = '120s';`(:245 재진술) · REVOKE/GRANT 3줄 · purge 본문에 `DELETE FROM public.limitup_accum_flow WHERE date < v_cutoff;` + `deleted` 키 · 끝 `NOTIFY pgrst, 'reload schema';`.

### RPC 2개

목록 RPC 는 `teamflow_report_for_user`(20261016200100:28-60) 틀이다. 두 가지를 바꾼다.

1. **payload 를 읽지 않는다.** `to_jsonb(t) - 'payload'` 는 행 전체(TOAST 된 payload 포함)를 jsonb 로 만든 뒤 지우므로 하루 수십 행 × 수십~수백 KB 를 쓸데없이 풀어낸다 [ASSUMED — PG 가 composite → jsonb 변환 때 모든 속성을 detoast 한다는 일반 동작]. 열 목록 서브쿼리로 만든다(비용 0 · 확실).
2. **정렬** — SQL 은 `ORDER BY state, pos_net_krw DESC NULLS LAST, isin` 로 주고, 웹이 같은 키로 다시 정렬한다(teamflow 의 「SQL 정렬 + 웹 `sortRows`」 이중 규율).

```sql
-- 목록 rows (payload 제외 — 열 목록 서브쿼리)
'rows', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.state, s.pos_net_krw DESC NULLS LAST, s.isin), '[]'::jsonb)
           FROM (SELECT a.date, a.isin, a.short_code, a.name, a.market, a.base, a.upper, a.last_px, a.last_rate,
                        a.high_px, a.high_rate, a.state, a.end_reason, a.cycle, a.carry_days, a.since_date,
                        a.reg_time_ms, a.end_time_ms, a.our_excluded_qty, a.mcap_krw, a.th_net_krw, a.th_same,
                        a.th_mcap_krw, a.pos_buy_qty, a.pos_buy_krw, a.pos_sell_qty, a.pos_sell_krw, a.pos_net_krw,
                        a.pos_avg_px, a.pos_peak_net_krw, a.pos_reg_px, a.day_buy_krw, a.day_sell_krw, a.day_net_krw,
                        a.day_buy_qty, a.day_sell_qty, a.schema_version
                   FROM public.limitup_accum_flow a WHERE a.date = v_date) s)
```

상세 RPC 는 같은 게이트 + `(SELECT to_jsonb(a) FROM public.limitup_accum_flow a WHERE a.date = p_date AND a.isin = p_isin)` — 없으면 `row: null`(404 로 바꾸지 않고 200 — 33 D-07 「행 없는 날 200」 결과 같은 결). `p_date`/`p_isin` 형식 검사는 서버 zod 가 먼저 한다(RPC 0회).

권한 3줄은 두 함수 모두: `REVOKE EXECUTE … FROM PUBLIC;` · `REVOKE EXECUTE … FROM anon, authenticated;` · `GRANT EXECUTE … TO service_role;`(20261016200100:65-67 원문 꼴).

### pgTAP

- `supabase/tests/limitup_load.test.sql` 에 섹션 K(accum_flow) 추가 — J(team_flow, :238~)의 복제: stage CHECK 허용 · `p_expected.accum_flow` N → N행 · payload 중첩 · double · null · 이력 키 · **옛 워커 호출(키 없음)은 rows 에 키 없음 + 그날 accum_flow 비움** · purge `deleted.accum_flow`. `plan(218)` 숫자를 늘린다.
- 기존 단언 :315 「옛 워커 호출이면 rows 키 8개」(`jsonb_object_keys … = 8`)는 `IF p_expected ? 'accum_flow'` 를 지키면 그대로 통과한다 — 키를 늘 쓰면 깨진다(Pitfall 1).
- 새 `supabase/tests/accum_report.test.sql` — teamflow_report.test.sql 동형(게이트 · 이력 0 · dates 행 있는 날만 · 최신 · 행 없는 날 rows [] · 정렬 · **목록 행에 `payload` 키 없음** · 상세 row 있음/없음 · 권한 anon/authenticated 불가 · SECURITY INVOKER · STABLE).

## 서버 지점

`server/src/routes/teamflow-report.ts` · `services/teamflow-report.ts` · `schemas/teamflow-report.ts` 를 복제한다.

- 라우터 이름 · 마운트: `app.ts:112` `app.use("/api/teamflow", teamflowRouter);` 옆에 `app.use("/api/accum", accumRouter)`. 이미 `app.use("/api/accum-signals", accumSignalsRouter);`(:114)가 있다 — Express 경로 매칭은 세그먼트 단위라 충돌하지 않지만, **이름 혼동을 피하려고 라우터 파일 · 심볼을 `accum-report`** 로 짓는다(라이브 패널 = `accum-signals`).
- 권고 경로: `GET /api/accum/report?d=YYYYMMDD`(목록) · `GET /api/accum/report/:date/:isin`(상세). zod: `d` = `Ymd.optional()`(`schemas/limitup-report.ts` 의 `Ymd` 재사용) · 상세 params = `{ date: Ymd, isin: z.string().regex(/^[A-Z0-9]{12}$/) }`.
- 서비스 모양 검증: `data.access === false` → `DmaUnmapped()` · `access !== true` → 500 · 목록은 `dates`/`rows` 배열 검사 · 상세는 `row` 가 `null` 또는 객체인지 검사.
- 응답 크기: 상세 ≤ ~224KB json — `compression` 미들웨어가 이미 있다(`server/src/app.ts:2` `import compression from "compression";`). 요청 본문 한도(`express.json({ limit: "16kb" })`)는 GET 이라 무관.
- 웹 `authFetch` 기본 타임아웃(teamflow 는 하루 번들 487KB 라 `timeoutMs: 15_000`) — 목록은 작으니 기본, 상세는 10~15초 권고.

## shared 타입

`packages/shared/src/accum-report.ts` 신규 — `AccumRow`(평평한 37열) · `AccumPayload`(price · orders · buckets · day_cum_net · pnl · cycles) · `AccumCycle`(16키) · `AccumReportResponse` · `AccumDetailResponse`. `pnl` 은 `TeamflowPnl` 을 재사용한다(13키 동일 — 인박스 「키 13개는 261020-teamflow-pnl 노트의 `payload.pnl` 과 같다」 · `packages/shared/src/teamflow-report.ts:128-143` 키 `buy_val · buy_qty · sell_val · sell_qty · realized_val · realized_qty · unrealized_val · total_val · ret · end_qty · end_cost_val · unknown_sell_qty · unknown_sell_val`). `index.ts:225-242` 의 teamflow export 블록 옆에 재수출. webapp/server 는 `pnpm --filter @gh-radar/shared build` 뒤에 타입을 본다.

## 웹 지점

### 파일 구성 (teamflow 복제 · 일반화 안 함)

```
webapp/src/
├── app/analytics/accum/page.tsx            # AppShell + Suspense(useSearchParams) — teamflow/page.tsx 동형
├── components/analytics/
│   ├── accum-report.tsx                    # 상태기계(loading·error·gate·ready) · 머리 칩 · 빈 상태 2종
│   ├── accum-kpi-strip.tsx                 # D-09 4칸
│   ├── accum-day-grid.tsx                  # 목록 · 아코디언(기본 접힘 · 한 번에 하나 · key=date) · 배지 묶음
│   ├── accum-detail.tsx                    # 지연 로드 · 스켈레톤 · 실패 · KPI 줄 → … → 출처 칩
│   ├── accum-chart.tsx                     # 세 패널 SVG(순수 렌더 — 기하는 lib)
│   └── accum-cycle-table.tsx               # D-20(2개↑)
├── hooks/use-chart-view.ts                 # 창 상태 · 휠(native passive:false) · 드래그 · 핀치 · rAF
└── lib/
    ├── accum-api.ts                        # fetchAccumReport · fetchAccumDetail(+캐시)
    ├── accum-report.ts                     # 정렬 · KPI · 라벨 · 태그 · 등록/종료 칸 문구
    └── accum-chart.ts                      # 순수 기하(clamp · ticks · preset · rOf · 경로 · 원 · 막대 · 세로선 · 음영)
```

### 재사용(import) vs 복제

- import: `LimitupDateNav`(`limitup-date-nav.tsx`) · `parseYmdParam` · `dateNavOf` · `fmtYmdShort`(`lib/limitup-report.ts`) · `fmtEok` · `toneOf` · `TONE_TEXT` · `fmtRate` · `kstHm` · `isNum` · `MINUS`(`lib/teamflow-report.ts` — 시그니처 `fmtEok(won, opts: { signed?: boolean; digits?: 1 | 2 } = {})` [VERIFIED: :60]) · `DmaGate`/`useDmaGateReason` · `PageHeader` · `CARD` · `authFetch` · `useChartWidth` · `CHART_FALLBACK_W`/`chartWidthOf`(`lib/teamflow-chart.ts:23-26`).
- 복제: KpiStrip · DayGrid 아코디언(teamflow-day-grid.tsx 의 `pendingScroll` · `scroll-mt` · 행 버튼 aria 규율 그대로) · 배지(라이브 `accum-strip.tsx:324` `const BADGE = 'inline-flex h-4 flex-none items-center rounded-[4px] border border-transparent px-1 text-[9px] font-bold';` 의 치수 · 색 축 — 상태 3 라벨만 「종료」).

### 정렬 — D-08 문구와 라이브 `sortAccum` 의 차이 (플래너 주의)

라이브 `sortAccum`(`lib/accum-list.ts:94-103`)은 「종료가 아닌 행끼리는 `netKrw` 내림차순 · 종료 행은 `gwTimeMs` 내림차순」 이다 — **매집중/매도중을 가르지 않는다** [VERIFIED: `if (aEnd !== bEnd) return aEnd ? 1 : -1; if (!aEnd && a.netKrw !== b.netKrw) return b.netKrw - a.netKrw; if (aEnd && a.gwTimeMs !== b.gwTimeMs) return b.gwTimeMs - a.gwTimeMs;`]. 채택 목업 A 는 `order = r => (r.st === 3 ? 2 : r.st === 2 ? 1 : 0)` 후 `b.pos - a.pos` 다. **D-08 은 잠긴 결정이고 목업 A 와 같으니 「상태 1 → 2 → 3, 그 안 `pos_net_krw` 내림차순, 동률 isin」 로 구현**하고, `sortAccum` 을 import 하지 않는다(행 모양도 다르다). 「라이브와 같은 순서」 라는 괄호는 엄밀히는 「종료가 아래」 까지만 같다.

### 상세 지연 로드 · 캐시

`lib/query-cache.ts` 는 「로그인 사용자가 바뀌면 AuthProvider 가 비운다」 는 성질이 있어(파일 머리 주석) 사용자별 데이터에 맞다. `fetchAccumDetail(date, isin)` 안에서 `readQueryCache(key, Number.POSITIVE_INFINITY)` / `writeQueryCache` 로 `accum-detail:${date}:${isin}` 를 캐시하고, 같은 키 진행 중 요청은 모듈 Map 의 Promise 로 합친다(실패는 캐시하지 않음 → 「다시 시도」 가 재요청). 재펼침 = 재요청 없음(D-06). 행 데이터는 그날 재적재 전까지 불변이다.

### 차트 설계 (D-14 ~ D-18 · 목업 C 이식)

**기하(순수 함수 — 단위 테스트 대상):**
- 상수: `T0 = price.t0_ms`(09:00 KST) · `T1530 = T0 + 6.5h` · `T1600 = T0 + 7h` · `T2000 = T0 + 11h` · `MIN_W = 10분`.
- `clampView(v)` · `preset('full'|'reg'|'last2h')` · `ticks(view)`(5분/15분/30분/1시간 단계 — 목업 원문) · `rOf(val) = Math.max(2.2, Math.min(7, 2.2 + Math.sqrt(val / 1e7) * 0.5))`.
- 가격 경로: 창 밖은 이진 탐색으로 자르고(±30분 여유 — 목업 `inView`) 이웃 점 간격 > 15분이면 `M` 으로 끊는다. 가격 y 범위 = **보이는 창 안의 가격 ∪ 보이는 주문 px**(원이 축 밖으로 잘리지 않게) · 비면 하루 전체.
- 누적 계단: `day_cum_net` 하루 전체 min/max(0 포함)로 y 고정 · `M x0,y(0) L x0,y0` 뒤 `H x V y` · 끝 `H x(T2000)`.
- 10분 막대: `slot` 0~65 → `x(T0 + slot × 10분)` · 칸 폭 = `(x(T2000) − x(T0)) / 66` 기준이 아니라 **현재 창 기준 `x(slot+1) − x(slot)`**(확대 시 막대도 넓어진다) · y 는 하루 전체 max 고정 · 매수 `--up` · 매도 `--down`.
- 세로선: `cycles[]` 나온 순서대로. 등록선 x = `max(reg_time_ms, T0)`(09:00 이전 등록 맞춤) · `reg_time_ms` null 이면 그리지 않음 · 이월(`since_date < date`)이면 등록선 없음 + 좌상단 「이월 D+n · MM/DD HH:MM 등록」. 종료선 x = `max(end_time_ms, T0)`(06:00 행은 왼쪽 끝) · 라벨 = 사유 + HH:MM.
- 음영: 오늘 등록(`since_date === date`)이고 첫 사이클 `reg_time_ms` 가 있을 때만 `[T0, max(T0, firstReg)]` · 세 패널 전체 높이. 15:30~16:00 빈 띠 `--gap` 류.
- 라벨 「· k」: CR-01 때문에 `cycle` 값이 중복될 수 있으므로 **k = 나온 순서 1-based 번호**를 권고(사이클 표 # 열도 같은 번호 — Open Question 2).

**상호작용(훅):**
- 휠: React `onWheel` 은 passive 라 `preventDefault()` 가 무시된다 [CITED: github.com/facebook/react/pull/19654]. `ref.current.addEventListener('wheel', h, { passive: false })` 로 직접 단다. `deltaY` = 커서 기준 확대/축소(`k = Math.exp(deltaY × 0.0015)` — 목업), `deltaX`(트랙패드 가로) = 이동. macOS 트랙패드 핀치는 `ctrlKey` 가 켜진 wheel 로 온다 [ASSUMED] — 같은 확대 경로로 처리된다.
- 드래그 · 핀치: Pointer Events + `setPointerCapture`. 활성 포인터 1개 = 이동, 2개 = 두 점 거리 비로 중점 기준 확대. SVG 에 **`touch-action: pan-y`** — 세로 스크롤은 브라우저가 하고, 가로 드래그와 핀치는 페이지로 온다 [CITED: developer.mozilla.org/en-US/docs/Web/CSS/touch-action — 「pan-y: Enable single-finger vertical panning gestures」 · pinch-zoom 은 명시할 때만 브라우저 몫]. 목업의 `touch-action: none` 을 그대로 옮기면 폰에서 차트 위로 손가락을 대고 **페이지를 아래로 못 내린다**(Pitfall 12).
- 이벤트는 rAF 로 합쳐 프레임당 `setView` 1회. 프리셋 전환은 애니메이션 없이 즉시(`prefers-reduced-motion` 은 자연히 존중 — 애니메이션 자체를 두지 않는다).
- 툴팁: `<title>`(D-15 「`<title>` 또는 동급」 · Phase 33 결). 터치에서는 `<title>` 이 뜨지 않는다 [ASSUMED] — Open Question 3.
- 폭: `useChartWidth` 로 잰 폭을 viewBox 와 1:1(11px 글자가 늘지 않게 — 33 Pitfall 8 · jsdom 0폭은 640 폴백).

**토큰:** 목업의 `--shade`(`rgba(107,118,132,.10)` / 다크 `rgba(255,255,255,.07)`) · `--gap`(`rgba(107,118,132,.07)` / `rgba(255,255,255,.04)`)은 `globals.css` 에 없다 [VERIFIED: grep 0건]. 새 토큰 쌍으로 넣되 이름은 범용 `--gap` 대신 `--accum-shade` · `--accum-gap` 류를 권고(Tailwind `gap-*` 와 읽기 혼동 회피). `webapp/src/styles/__tests__/tds-tokens.test.ts` 의 `LIGHT_EXPECTED`/`DARK_EXPECTED` 에 같이 추가한다.

### 사이드바

`app-sidebar.tsx:184` `const NAV_TEAMFLOW = { href: "/analytics/teamflow", label: "팀 매집 보고서" } as const;` 다음에 `NAV_ACCUM = { href: "/analytics/accum", label: "매집감지 보고서" }` · `accumActive = pathname.startsWith(NAV_ACCUM.href)`(:599-600 꼴) · 분석 하위 목록 `teamflow` `<li>` 다음 · `item="accum"`. 단언 갱신: `__tests__/app-sidebar.test.tsx`(:1268-1288 순서 · :1339-1362 가시성) · `e2e/specs/sidebar-tree.spec.ts` `TREE_LINKS`(:88-100 — `'팀 매집 보고서'` 다음 `'매집감지 보고서'`) · DMA 403 루프(:346-349)에 `page.route('**/api/accum/report**', …)` 와 경로 `'/analytics/accum'` 추가.

## 소급 스크립트 (D-23)

**위치 · 실행:** `scripts/export-accum-backfill.ts`(+ 비출력 래퍼 `scripts/export-accum-backfill.sh` — `dma-credentials.sh` Section 1~2 복제: 저장소 루트로 `cd` · `workers/master-sync/.env` 를 `set -a; source` · 키 이름만 검사 · `exec pnpm --filter @gh-radar/relay exec tsx ../scripts/export-accum-backfill.ts "$@"`). 클라이언트는 `relay/src/store/supabase.ts` 의 `createRelaySupabase(url, serviceRoleKey)`. **매핑은 순수 함수로 분리**(`relay/src/store/accum-backfill.ts` + `relay/tests/accum-backfill.test.ts` — `dma-users-migrate.ts` 선례)해 단위 테스트한다.

**입력 쿼리:** `dma_strategy_events` · `kind = 16` · `gateway = 'KYOBO119'`(게이트웨이 키 원문 — `20261006200100_dma_registry_intent.sql:64` `('KYOBO119', 'KYOBO', '10.16.207.119', …)`) · `trade_date = 'YYYY-MM-DD'`. **`trade_date` 는 `date` 형이다** — `trade_date         date        NOT NULL,` [VERIFIED: 20260929180000_dma_strategy_events.sql:47] → 인자 `20261019` 를 `2026-10-19` 로 바꿔 넣는다. 부분 인덱스 `idx_dma_strategy_events_accum_signal_day (trade_date) WHERE kind = 16` 이 있다(20261018120000).

**페이지네이션 필수:** PostgREST `max_rows = 1000` [VERIFIED: supabase/config.toml:18] — `select()` 는 1000행에서 조용히 잘린다. 하루 kind 16 은 「등록 종목 수 × 누적이 바뀐 분 수」(261018 노트)라 수십 종목 × 수백 분이면 1000 을 쉽게 넘는다. `.order('gw_time_ms').order('journal_epoch').order('seq').range(i, i + 999)` 를 빈 페이지까지 돈다. 실제 10/19 · 10/20 행 수는 이번 세션에서 재지 못했다(`.env` 읽기가 훅에 막힘) — 스크립트의 「실행 전 행 수 미리보기」(`count: 'exact', head: true`)가 첫 출력이 되게 한다.

**23키 매핑(인박스 표 원문 그대로 — 소스 열 → 키):** `row←queue_case` · `gw_time_ms←gw_time_ms` · `isin←isin` · `state←qty` · `end_reason←cancel_reason` · `cycle←expected_cum` · `carry_days←entry_round` · `since_date←message since=`(문자열) · `reg_time←message reg=`(문자열 · 앞 0 유지) · `buy_qty←ev_qty_before` · `buy_krw←limit_bid_qty` · `sell_qty←ev_qty_after` · `sell_krw←bid1_qty` · `net_qty←ev_trade_qty` · `net_krw←cond_threshold` · `avg_px←ev_price` · `reg_px←bid1_price` · `peak_net_krw←ask_qty_at_limit` · `our_excluded_qty←immediate_fill_qty` · `mcap_krw←base_cum` · `th_net_krw←snap_cum[0]` · `th_min_same←snap_cum[1]` · `th_max_mcap_krw←message th= 셋째 값`. 라이브 `accumSignalOf`(`packages/shared/src/accum-signal.ts:140-185`)와 열 대응이 같다 — 대조 테스트로 쓴다(단 shared 는 camelCase 행을 받으므로 함수 재사용은 하지 않는다).

**message 파싱 결측 처리:** gh-trade `cycles_of` 는 `since_date=str(src["since_date"])` 라 **null 을 내보내면 since_date 가 문자열 `"None"`** 이 된다 [VERIFIED: teamflow_accum.py `cycles_of` 원문 `since_date=str(src["since_date"])`]. `reg_time` 은 `_HMS_RE` 실패면 `reg_time_ms` null 로 안전하다. 그래서 `since=`/`reg=` 를 못 읽은 줄은 **빈 문자열 `""`** 로 내보내고(키는 반드시 둔다 — 키가 빠지면 그 줄이 `bad`), 스크립트가 그 개수를 따로 센다. `th=` 셋째 값이 없으면 `0`(서버 의미 「0 = 상한 없음」 — 261018 노트 설정값 설명).

**출력:** `~/ticks/accum-backfill/<YYYYMMDD>.jsonl` — 이 디렉터리에는 이미 gh-trade 의 10/18 작업물(`a3pcap/` · `master/` · `parquet/` · `raw/` · `ref/` · `fetch.log`)이 있다 [VERIFIED: ls]. 스크립트는 `<D>.jsonl` 만 쓰고, 이미 있으면 `--force` 없이는 거부하며, tmp 파일 → rename 으로 놓는다. 끝에 「경로 · 행 수 · isin 수 · since/reg 결측 수」 를 출력(D-23 SUMMARY 기록용). 계좌 칸은 kind 16 이 원래 빈 문자열이지만 `dma_user_id` 등은 select 하지 않는다(필요 열만).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 날짜 원자 교체 | 워커에서 DELETE/INSERT 여러 요청 | `limitup_commit_day` 10번째 쌍 | PostgREST 는 요청 간 트랜잭션 불가 |
| 목록 날짜 이동 · `?d` 정본화 | 새 날짜 nav | `LimitupDateNav` · `dateNavOf` · `parseYmdParam` | 행 없는 날 앞뒤 이동 규칙까지 이미 검증 |
| 억 · % · HH:MM 표기 | 새 포매터 | `fmtEok` · `fmtRate` · `kstHm` · `toneOf` | 반올림 0 색 판정 등 엣지 처리 |
| 사용자별 메모리 캐시 | 새 전역 Map(로그아웃 미정리) | `lib/query-cache.ts` | AuthProvider 가 사용자 전환 시 비운다 |
| 차트 폭 측정 | 새 ResizeObserver | `useChartWidth` | jsdom 0폭 폴백 포함 |
| 서비스롤 클라이언트 · 키 주입 | 스크립트에서 `.env` 파싱 | `createRelaySupabase` + 래퍼 `set -a; source` | 키 비출력 규약 |
| 차트 라이브러리 플러그인 | lightweight-charts primitive 로 원 · 음영 · 세로선 | 순수 SVG | §D-17 |

**D-09 대상 원문:** `CRON="30 20 * * 1-5"`(`scripts/deploy-limitup-sync.sh:73`) · `OnCalendar=Mon..Fri 20:20:00 Asia/Seoul`(`infra/relay/limitup-pull/limitup-pull.timer:13`) — gh-trade 실측 > 20:20 일 때만 둘 다 10분.

## Common Pitfalls

### Pitfall 1: commit_day 가 `accum_flow` 키를 늘 쓰면 재적재 감지가 꺼진다
**What goes wrong:** 옛 워커 호출(키 없음)에도 `rows.accum_flow = 0` 이 기록되면 새 워커가 「0 ≠ manifest N」 으로 재적재는 하지만, 반대로 새 워커가 0 을 정상 기록한 날과 구별이 안 되고 pgTAP :315(키 8개) 단언이 깨진다.
**How to avoid:** `IF p_expected ? 'accum_flow' THEN` 로만 기록(team_flow 쌍 원문 그대로).

### Pitfall 2: CREATE OR REPLACE 가 `statement_timeout = '120s'` 를 지운다
**How to avoid:** `ALTER FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) SET statement_timeout = '120s';` 재진술 + `NOTIFY pgrst, 'reload schema'`(20261016200000:245 · :310).

### Pitfall 3: stage CHECK 를 `IF EXISTS` 로 지우면 조용히 미적용
**How to avoid:** `ALTER TABLE public.limitup_stage DROP CONSTRAINT limitup_stage_tbl_check;`(이름 정확 · IF EXISTS 없음 — :105).

### Pitfall 4: 표 마이그레이션보다 데이터가 먼저 오면 commit 이 실패한다
**What goes wrong:** 새 워커가 stage `tbl='accum_flow'` 를 넣는데 CHECK 가 옛 9값이면 23514 로 그날 실패.
**How to avoid:** D-25 순서(DB 먼저). 옛 워커 + 새 DB 는 안전(키 없음 → DELETE 만 · 0 = 0 통과).

### Pitfall 5: 기존 단위 테스트의 「정확한 키 집합」 단언이 무더기로 깨진다
**What goes wrong:** `StageTbl` 에 `accum_flow` 가 늘면 `emptyCounts()` 키가 늘어 `toEqual` 단언이 깨진다 — `dispatch.test.ts:441` `const EXPECTED9 = { ...STAGED8, team_flow: 0 };`(:483 · :485 · :508 · :554 에서 사용) · `load.test.ts:28-30`(`team_flow: 0` · `STAGE_TABLES` 목록) · reason/로그 문구 단언(:592-594 `reason: "team_flow_backfill"` · `msg.startsWith("limitup day team_flow backfill")` · :663 실패 warn 원문).
**How to avoid:** 플랜에 「EXPECTED9 → EXPECTED10 · load.test 목록 갱신」 을 명시 작업으로 넣고, reason 은 `${tbls.join("+")}_backfill` 로 만들어 표 하나일 때 기존 문자열이 유지되게 한다. 로그 문구도 표 이름을 끼우는 꼴(`limitup day ${tbl} backfill …`)로 바꾸면 team_flow 단언은 그대로 산다.

### Pitfall 6: 목록 RPC 가 `to_jsonb(t) - 'payload'` 로 payload 를 풀어 버린다
**How to avoid:** 열 목록 서브쿼리(위 SQL). 목록 응답에 `payload` 키가 없음을 pgTAP · 서버 테스트로 단언.

### Pitfall 7: 상세 라우트 ISIN 검증을 `^KR` 로 좁힌다
**What goes wrong:** 실샘플 `KYG2114A1094` · `KRA0113321F5` 상세가 400.
**How to avoid:** `^[A-Z0-9]{12}$`(gh-trade `_ISIN_RE` 와 같음).

### Pitfall 8: 상한가 보고서에 탐지 0 일이 「뜬다」 (D-03 전제 정정)
**What goes wrong:** D-03 은 「상한가 · 팀 매집 `dates[]` 는 행 있는 날짜만이라 뜨지 않음」 을 확인하라고 했지만, 상한가 보고서는 `v_dates := ARRAY(SELECT l.date FROM public.limitup_loads l WHERE l.files_sig IS NOT NULL ORDER BY l.date DESC);` [VERIFIED: 20261006090400_limitup_report_rpcs.sql:61] — 적재 이력 기준이라 탐지 0 일도 뜬다. 팀 매집은 `SELECT DISTINCT t.date FROM public.limitup_team_flow t`(20261016200100:45)라 안 뜬다.
**How to avoid:** 고칠 것은 없다 — 상한가 보고서는 loaded + 0행을 이미 그린다(KPI + `limitup-day-grid.tsx:161` 「이 날은 상한가 사건이 없어요」 · 「상한가에 닿은 종목이 없는 날이에요」). 플래너는 확인 항목을 「상한가 = 뜨고 빈 날 문구 · 팀 매집 = 안 뜸」 으로 바꾼다. 부수 효과: 다음 날 상한가 보고서의 「어제 결과」 가 이 빈 날을 가리켜 「어제 보고서가 없어요」 가 된다(의미상 맞음 — 어제 잠김 0).

### Pitfall 9: e2e 목 경로 glob 이 상세 경로를 못 잡는다
**What goes wrong:** Playwright glob 의 `*` 는 `/` 를 넘지 않는다 — `**/api/accum/report*` 는 `/api/accum/report/20261019/KR…` 를 잡지 않는다 [ASSUMED — Playwright glob 규칙].
**How to avoid:** 목록 `**/api/accum/report?*`/`**/api/accum/report` 와 상세 `**/api/accum/report/**` 를 따로 등록하거나 정규식 route. 사이드바 403 루프도 `**/api/accum/report**`.

### Pitfall 10: 「사이클 n」 배지(목록)와 차트 사이클 수가 어긋난다
**What goes wrong:** 목록은 평평한 열 `cycle` 만 본다(payload 제외). CR-01 로 06:00 탈락 뒤 재등록이 번호 1 로 돌아가면 그날 사이클이 2개여도 `cycle = 1` 이라 배지가 안 뜬다.
**How to avoid:** 수용(목록 = 평평한 열 원칙 · D-11 문구 그대로 `cycle > 1`). 상세 사이클 표 · 세로선은 `cycles.length` 기준. Open Question 2.

### Pitfall 11: React `onWheel` 에서 `preventDefault()` 가 안 먹는다
**What goes wrong:** 차트 위 휠이 확대와 동시에 페이지를 스크롤한다.
**How to avoid:** `useEffect` 에서 `el.addEventListener('wheel', h, { passive: false })` + 정리 [CITED: React PR #19654].

### Pitfall 12: `touch-action: none` 이 폰 페이지 스크롤을 막는다
**What goes wrong:** 목업 CSS `.chart svg { … touch-action: none; }` 를 그대로 옮기면 상세가 긴 폰에서 차트 위 세로 스와이프가 먹혀 아래 사이클 표 · 손익 줄로 못 내려간다.
**How to avoid:** `touch-action: pan-y`(세로 스크롤은 브라우저 · 가로 드래그 · 핀치는 페이지). 브라우저가 세로 팬을 시작하면 `pointercancel` 이 오므로 드래그 상태를 거기서 풀어 준다 [CITED: MDN touch-action].

### Pitfall 13: 09:00 이전 · 06:00 시각을 그대로 x 로 그린다
**What goes wrong:** 창이 09:00 부터라 x 가 음수 → 선이 클립 밖으로 사라진다(06:00 탈락 종료선 · 08:xx 등록).
**How to avoid:** D-16 대로 `max(t, T0)` 로 붙이고 라벨은 원래 시각(「이월 탈락 06:00」). 기준 시각은 하드코딩 대신 `price.t0_ms`.

### Pitfall 14: 가격 y 범위를 선만으로 잡아 원이 잘린다 · 창 안 체결 0 이면 NaN
**How to avoid:** y 범위 = 보이는 가격 ∪ 보이는 주문 px · 보이는 점 0 이면 하루 전체로 폴백(목업 `vis.length ? vis : 전체`) · `price.idx` 자체가 비면 D-18 문구.

### Pitfall 15: 이월 · 등록 시각 null 행에서 음영 · 등록선 계산이 깨진다
**What goes wrong:** `reg_time_ms` 는 「형식이 깨졌으면 null」(인박스) · 이월 종목은 `since_date < date`.
**How to avoid:** 음영 조건 = `since_date === date && firstReg !== null`. 등록선은 `reg_time_ms !== null && since_date === date` 일 때만. 이월 문구의 「MM/DD HH:MM」 은 `since_date` + `reg_time_ms` 의 KST 시각(null 이면 「MM/DD 등록」).

### Pitfall 16: 소급 조회가 1000행에서 잘린다
**How to avoid:** `.range()` 페이지네이션 + 미리보기 count 와 최종 행 수 대조(다르면 exit 1).

### Pitfall 17: since/reg 를 숫자나 null 로 내보낸다
**What goes wrong:** `reg` 를 숫자로 내면 「095720」 → 95720 → `_HMS_RE` 실패 → `reg_time_ms` null(인박스 경고) · since 를 null 로 내면 export 에 문자열 `"None"`.
**How to avoid:** 둘 다 문자열 · 결측은 `""` · 단위 테스트에 「앞 0 유지」 · 「message 깨짐」 케이스.

### Pitfall 18: `.env` 를 Claude 가 직접 읽으려다 막힌다
**What goes wrong:** 이 환경의 Bash 훅이 `.env` 패턴 읽기를 차단한다(이번 리서치에서 실측 — 「Secret read guard」). 
**How to avoid:** 래퍼가 `source` 하고 TS 가 `process.env` 만 본다(값 비출력). 실행은 `bash scripts/export-accum-backfill.sh --date 20261019 --date 20261020` 한 줄. 훅이 래퍼 실행까지 막으면 사용자 `!` 실행으로 안내(메모리 「비밀 주입은 사용자 `!` 실행」).

### Pitfall 19: 배포 창 · 동시 세션
**What goes wrong:** 20:20~20:50 KST 안에 워커를 재배포하면 진행 중 적재와 겹친다. 메인 트리 브랜치가 옆 세션에 의해 바뀔 수 있다.
**How to avoid:** D-25 시간 밖 · 배포는 메인 세션 · 긴 execute 는 전용 worktree(메모리).

## Code Examples

### 워커 — 선택 파일 목록화
```ts
// workers/limitup-sync/src/load.ts — TEAM_FLOW_FILE(:23) · TEAM_FLOW_STAGE_CHUNK(:28) 대체
export type OptionalTbl = "team_flow" | "accum_flow";
export const OPTIONAL_FILES: readonly { tbl: OptionalTbl; file: string; chunk: number }[] = [
  { tbl: "team_flow", file: "team_flow.ndjson.gz", chunk: 20 },   // 기존 값 그대로(:28)
  { tbl: "accum_flow", file: "accum_flow.ndjson.gz", chunk: 1 },  // 최대 행 ≈ 224KB
];

// index.ts loadDay 안 — :223-239 대체
const optional = OPTIONAL_FILES.map((o) => ({ ...o, entry: m.files.find((f) => f.name === o.file) }));
const backfillTbls = optional.filter((o) => o.entry !== undefined && p?.rows?.[o.tbl] !== o.entry.rows).map((o) => o.tbl);
if (p?.sig === sig && backfillTbls.length === 0) { /* unchanged — 기존 그대로 */ }
const reason = p === undefined ? "new" : p.sig !== sig ? "files_sig" : `${backfillTbls.join("+")}_backfill`;
```

### 차트 기하 — 목업 C 원문 이식
```ts
// webapp/src/lib/accum-chart.ts — Source: .planning/phases/34-accum/reference/mockup-accum-chart.html (채택 목업 C)
export const MIN_VIEW_MS = 10 * 60_000;
export interface View { t0: number; t1: number }
export function dayBoundsOf(t0ms: number) {
  return { T0: t0ms, T1530: t0ms + 6.5 * 3600e3, T1600: t0ms + 7 * 3600e3, T2000: t0ms + 11 * 3600e3 };
}
export function clampView(v: View, T0: number, T2000: number): View {
  const w = Math.max(MIN_VIEW_MS, Math.min(T2000 - T0, v.t1 - v.t0));
  const t0 = Math.max(T0, Math.min(v.t0, T2000 - w));
  return { t0, t1: t0 + w };
}
export const orderRadiusOf = (val: number) => Math.max(2.2, Math.min(7, 2.2 + Math.sqrt(val / 1e7) * 0.5));
/** 커서 시각 tc 기준 확대/축소 — k > 1 축소 · k < 1 확대(목업 wheel 식). */
export const zoomAt = (v: View, tc: number, k: number): View => ({ t0: tc - (tc - v.t0) * k, t1: tc + (v.t1 - tc) * k });
```

### 훅 — 네이티브 휠 + 포인터(드래그 · 핀치) + rAF
```ts
// webapp/src/hooks/use-chart-view.ts (요지)
useEffect(() => {
  const el = svgRef.current;
  if (!el) return;
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();                                   // passive:false 라 먹힌다
    schedule((v) => zoomAt(v, timeAt(e.clientX), Math.exp(e.deltaY * 0.0015)));
  };
  el.addEventListener('wheel', onWheel, { passive: false });
  return () => el.removeEventListener('wheel', onWheel);
}, [/* timeAt deps */]);
// pointerdown/move/up/cancel: 활성 포인터 Map — 1개 = 이동, 2개 = 거리 비 확대(중점 기준). SVG 에 style={{ touchAction: 'pan-y' }}.
// schedule(): requestAnimationFrame 로 대기 중 변환을 합쳐 프레임당 setView(clampView(…)) 1회.
```

### 소급 — 한 행 매핑(순수 함수)
```ts
// relay/src/store/accum-backfill.ts — 키 · 원천은 인박스 「소급 목록 파일 형식」 표 원문
function msgOf(message: string): Map<string, string> { /* "k=v|k=v" — accum-signal.ts parseAccumMessage 와 같은 규칙 */ }
export function accumBackfillLineOf(r: Kind16Row): Record<string, string | number> {
  const m = msgOf(r.message);
  const th = (m.get("th") ?? "").split("/");
  return {
    row: r.queue_case, gw_time_ms: r.gw_time_ms, isin: r.isin, state: r.qty, end_reason: r.cancel_reason,
    cycle: r.expected_cum, carry_days: r.entry_round,
    since_date: /^\d{8}$/.test(m.get("since") ?? "") ? m.get("since")! : "",
    reg_time: /^\d{6}$/.test(m.get("reg") ?? "") ? m.get("reg")! : "",
    buy_qty: r.ev_qty_before, buy_krw: r.limit_bid_qty, sell_qty: r.ev_qty_after, sell_krw: r.bid1_qty,
    net_qty: r.ev_trade_qty, net_krw: r.cond_threshold, avg_px: r.ev_price, reg_px: r.bid1_price,
    peak_net_krw: r.ask_qty_at_limit, our_excluded_qty: r.immediate_fill_qty, mcap_krw: r.base_cum,
    th_net_krw: r.snap_cum[0] ?? 0, th_min_same: r.snap_cum[1] ?? 0,
    th_max_mcap_krw: th.length === 3 && /^\d+$/.test(th[2]) ? Number(th[2]) : 0,
  };
}
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 순수 SVG 가 한선급 행에서 프레임 끊김 없이 확대/이동된다 | D-17 결론 | 끊기면 가격 선 · 계단만 canvas 로 내리는 후속 작업 |
| A2 | `to_jsonb(row)` 가 TOAST 된 payload 를 detoast 한다 | SQL RPC | 틀려도 권고(열 목록 서브쿼리)는 무해 |
| A3 | macOS 트랙패드 핀치가 `ctrlKey` wheel 로 온다 | 차트 상호작용 | 같은 확대 경로라 영향 작음 |
| A4 | `<title>` 툴팁은 터치에서 안 뜬다 | 차트 툴팁 | 폰 사용자가 원 금액을 못 봄 — Open Q3 |
| A5 | Playwright route glob `*` 는 `/` 를 넘지 않는다 | Pitfall 9 | 목이 안 걸려 실 server 호출 → E2E 실패로 바로 드러남 |
| A6 | 10/19 · 10/20 KYOBO119 kind 16 이 1000행을 넘는다(페이지네이션 필요) | 소급 | 안 넘어도 페이지네이션은 무해 |
| A7 | accum_flow chunk 1 의 insert 횟수(하루 ≤ 수십)는 적재 시간에 영향이 작다 | 워커 | 느리면 chunk 2 로 |

## Open Questions

1. **10/20 첫 실물 행 수 · 소급 행 수**
   - What we know: 오늘 밤 20:10 배치가 첫 실물을 쓰고, 서버 19:07 재기동 탓에 기동 정합 행 위주일 가능성(CONTEXT).
   - What's unclear: 실제 행 수 · kind 16 행 수(이번 세션 DB 조회 불가 — `.env` 훅 차단).
   - Recommendation: 소급 스크립트의 미리보기 count 를 첫 단계로 · 실물 1행이 나오면 워커 픽스처 1행 샘플을 실물로 교체할지 SUMMARY 에서 판단.
2. **사이클 「· k」 · 표 # 를 `cycle` 값으로 쓸까 순서 번호로 쓸까** (CR-01 로 값 중복 가능)
   - Recommendation: 순서 번호(1-based). 목록 배지 「사이클 n」 은 D-11 대로 평평한 열 `cycle` 그대로. 플래너가 UI-SPEC 단계에서 잠근다.
3. **폰 툴팁** — `<title>` 은 터치에서 안 보인다.
   - Recommendation: v1 은 `<title>`(D-15 허용) · 탭으로 고정 툴팁은 후속. UAT 질문에 넣는다.
4. **D-09 10분 미루기** — gh-trade 첫날 실측 대기. 넘으면 `limitup-pull.timer` `OnCalendar` 와 `deploy-limitup-sync.sh` `CRON` 을 한 커밋에서 함께(D-24 ①).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + `public.ecr.aws/supabase/postgres:17.6.1.104` | pgTAP | ✓ | 이미지 `sha256:eefa6c87…` | — (러너 exit 3 = 미실행 ≠ 통과) |
| Node | 전 워크스페이스 | ✓ | v24.21.0 | — |
| pnpm | 빌드 · 테스트 | ✓ | 11.15.1 | — |
| Python 3 | 샘플 검사 · 픽스처 선별(선택) | ✓ | 3.14.2 | node 로 대체 가능 |
| gcloud | Job 재배포 · `run jobs execute` · server 배포 | ✓ | SDK 558.0.0 | — (메인 세션) |
| 맥 샘플 `~/ticks/accum-flow-sample/20261014/` | 워커 · 웹 픽스처 원천 | ✓ | 4파일 | — |
| `~/ticks/accum-backfill/` | 소급 출력 | ✓(gh-trade 기존 작업물 공존) | — | — |
| `workers/master-sync/.env` 키 | 소급 스크립트 | 래퍼 경유만(Claude 직접 읽기 훅 차단) | — | 사용자 `!` 실행 |
| radar-gw IAP SSH | 1회 운반 `--allow-daytime` | 샌드박스 차단 가능 | — | `dangerouslyDisableSandbox`(메인 세션) |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest(워커 · server · webapp · relay — 각 `maxWorkers` 기본 2) · Playwright 1.59(`workers: 1`) · pgTAP(로컬 컨테이너) |
| Config file | `workers/limitup-sync/vitest.config.ts` · `server/vitest.config.ts` · `webapp/vitest.config.ts` · `relay/vitest.config.ts` · `webapp/playwright.config.ts` |
| Quick run command | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/limitup-sync exec vitest run --maxWorkers=2` · `pnpm --filter @gh-radar/server exec vitest run tests/routes/accum-report.test.ts --maxWorkers=2` · `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-report.test.ts src/lib/__tests__/accum-chart.test.ts --maxWorkers=2` |
| Full suite command | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/relay exec vitest run tests/accum-backfill.test.ts && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/accum-report.spec.ts e2e/specs/sidebar-tree.spec.ts e2e/specs/teamflow-report.spec.ts e2e/specs/limitup-report.spec.ts --workers=1` + pgTAP `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql` · `--test supabase/tests/accum_report.test.sql` · `--test supabase/tests/teamflow_report.test.sql` · `--test supabase/tests/limitup_report.test.sql` |

주의: server · webapp 의 `test` 스크립트는 watch(`"test": "vitest"`)/passWithNoTests 라 쓰지 않는다 — `exec vitest run`. Playwright webServer 타임아웃이면 `rm -rf webapp/.next`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACCUM-01 | accum_flow 있으면 N행 chunk 1 stage · `p_expected.accum_flow` N · 없으면 0 · 행 수 불일치 실패 · 재적재 감지(키 없음/다름 → `accum_flow_backfill` · 격자 생략) · 탐지 0 manifest 적재 · team_flow 동시 backfill reason | unit | `pnpm --filter @gh-radar/limitup-sync exec vitest run tests/dispatch.test.ts tests/load.test.ts tests/dispatch-dryrun-totals.test.ts --maxWorkers=2` | ✅ 수정 + 픽스처 ❌ Wave 0 |
| ACCUM-01 | 10번째 쌍 · CHECK · 옛 워커 호환 · purge · timeout 재진술 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql` | ✅ 수정(섹션 K) |
| ACCUM-02 | 게이트 · dates · 최신 · 빈 날 · 정렬 · 목록 payload 없음 · 상세 row/null · 권한 | pgTAP | `… --test supabase/tests/accum_report.test.sql` | ❌ Wave 0 |
| ACCUM-02 | 라우트 401/403/400(Ymd · ISIN `KYG…` 허용) · RPC 1회 · 모양 위반 500 | integration(supertest) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/accum-report.test.ts --maxWorkers=2` | ❌ Wave 0 |
| ACCUM-03 | 정렬 키 · KPI 집계 · 상태/사유 라벨 · 결과 태그 · 등록/종료 칸 문구 · 흐림 판정 | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-report.test.ts --maxWorkers=2` | ❌ Wave 0 |
| ACCUM-03 | 목록 · 아코디언 · 지연 로드 1회 · 재펼침 재요청 0 · 빈 상태 · DmaGate | RTL + E2E | `… vitest run src/components/analytics/__tests__/accum-report.test.tsx` · `… playwright test e2e/specs/accum-report.spec.ts --workers=1` | ❌ Wave 0 |
| ACCUM-03 | 사이드바 순서 · 403 직접 진입 | RTL + E2E | `… vitest run src/components/layout/__tests__/app-sidebar.test.tsx` · `… playwright test e2e/specs/sidebar-tree.spec.ts --workers=1` | ✅ 수정 |
| ACCUM-04 | clamp · preset · ticks · rOf · 15분 끊기 · y 범위(원 포함) · 09:00 맞춤 · 06:00 종료선 · 이월 음영 없음 · 빈 orders/price | unit | `… vitest run src/lib/__tests__/accum-chart.test.ts` | ❌ Wave 0 |
| ACCUM-04 | 세 패널 · 1:1 viewBox · 프리셋 클릭 → 창 표시 · 휠 확대 · 390 폰 · 사이클 표 조건부 · 손익 줄 · 팀 체결 없음 캡션 | RTL + E2E | 위 e2e | ❌ Wave 0 |
| ACCUM-05 | 23키 · 문자열 since/reg(앞 0) · th 셋째 값 · message 깨짐 · `accumSignalOf` 열 대응 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/accum-backfill.test.ts` | ❌ Wave 0 |
| ACCUM-06 | 10/19 · 10/20 라이브(음영 · 세로선 · first · 사이클 표 · 손익) | manual UAT | — (D-26 · 프로덕션 수동 주입 없음) | — |

### Sampling Rate
- **Per task commit:** 해당 층 quick 명령
- **Per wave merge:** 그 wave 가 닿은 워크스페이스 전체 vitest + typecheck
- **Phase gate:** Full suite + pgTAP 4파일 green → `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `workers/limitup-sync/tests/fixtures/accum_flow/20261014/accum_flow.ndjson.gz` — 34행 샘플에서 선별(권고: 천일고속 `KR7000650002` · 한선엔지니어링 `KR7452280001`(최대 행) · CJ씨푸드1우 `KR7011151008`(orders 0 · pnl null) · `KRA0113321F5`(name null) · `KYG2114A1094`(비 KR ISIN) · 동양고속 `KR7084670009`) — gzip level 9 · mtime 0 · sha 를 테스트 상수로
- [ ] 탐지 0 manifest 픽스처 날짜 디렉터리(빈 6표 ndjson.gz + accum_flow + manifest)
- [ ] `webapp/src/test-fixtures/accum-export.ts` — 워커 픽스처를 읽는 공용 로더(teamflow-export.ts 동형) + 합성 다중 사이클 · 이월 · 06:00 종료 행(실물에 없으므로 합성 표시)
- [ ] `supabase/tests/accum_report.test.sql` · `server/tests/routes/accum-report.test.ts` · `relay/tests/accum-backfill.test.ts` · `webapp/src/lib/__tests__/accum-report.test.ts` · `accum-chart.test.ts` · `webapp/e2e/specs/accum-report.spec.ts` · `webapp/e2e/fixtures/accum-report.ts`
- [ ] `scripts/smoke-limitup-sync.sh` — INV-9 `limitup_accum_flow count == manifest files[accum_flow.ndjson.gz].rows`(INV-8 :219-225 복제)

## Security Domain

`security_enforcement: false`(`.planning/config.json` · 메모리 「보안검사 안 함」) — 생략. 권한 규율(RPC REVOKE · RLS 정책 0 · `requireAuth` · 서버 403)은 위 SQL · 서버 절과 pgTAP 권한 단언으로 다룬다.

## 배포 · 운영 (D-25 보강)

1. `supabase db push --linked --yes`(허용 규칙 접두사 그대로 — 메모리) — 표 · CHECK · commit_day · purge · RPC 2개.
2. 워커 재배포 `scripts/deploy-limitup-sync.sh`(env `GCP_PROJECT_ID` · `SUPABASE_URL` 필수 — 메모리) · 20:20~20:50 KST 밖.
3. 소급 `bash scripts/export-accum-backfill.sh --date 20261019 --date 20261020` → gh-trade 세션 SendMessage(경로 · 행 수).
4. gh-trade 119 배치 확인 문자열 `stage=accum_flow reason=backfill … isins=N` 뒤 radar-gw `limitup-pull.sh --allow-daytime` 1회(샌드박스 해제) + `gcloud run jobs execute` → 로그 `reason` `files_sig`(10/19) · `accum_flow_backfill`(10/20 — 오늘 밤 옛 워커 적재분) 확인 · 스모크 INV-9.
5. server 배포(`deploy-server.sh` — `CORS_ALLOWED_ORIGINS` · `RELAY_INTERNAL_URL` 는 라이브 Cloud Run env 에서 — 33-08 Rule 3 선례) → webapp push(= 프로덕션).
6. 인박스 `## 회신` ①~⑥ · `status: done` · `done_commit` · 경로 지정 커밋 · gh-trade-f4 SendMessage.

## Sources

### Primary (HIGH confidence)
- 저장소 코드(이번 세션 Read): `workers/limitup-sync/src/{index,load,manifest,config}.ts` · `tests/dispatch.test.ts` · `tests/load.test.ts` · `supabase/migrations/20261016200000_limitup_team_flow.sql` · `20261016200100_teamflow_report_rpc.sql` · `20261006090400_limitup_report_rpcs.sql` · `20260929180000_dma_strategy_events.sql` · `20261018120000_dma_strategy_events_accum_signal.sql` · `supabase/config.toml` · `server/src/{routes,services,schemas}/teamflow-report.ts` · `server/src/app.ts` · `packages/shared/src/{teamflow-report,accum-signal}.ts` · `webapp/src/components/analytics/teamflow-*.tsx` · `webapp/src/lib/{teamflow-report,teamflow-api,accum-list,query-cache}.ts` · `webapp/src/hooks/use-chart-width.ts` · `webapp/src/components/layout/app-sidebar.tsx` · `webapp/e2e/specs/{teamflow-report,sidebar-tree}.spec.ts` · `scripts/{dma-credentials.sh,migrate-dma-users.ts,deploy-limitup-sync.sh,smoke-limitup-sync.sh}` · `infra/relay/limitup-pull/limitup-pull.timer`
- 계약: `docs/inbox/from-gh-trade/261020-accum-flow-export.md` · `261018-accum-signal.md` · gh-trade `server/tools/analysis/tickana/teamflow_accum.py`
- 샘플 실측: `~/ticks/accum-flow-sample/20261014/{accum_flow.ndjson.gz,accum_flow-34.ndjson.gz,events.jsonl}`
- lightweight-charts 5.2.0 설치본 `dist/typings.d.ts` · `dist/lightweight-charts.development.mjs`
- 채택 목업 3종 + 데이터 JS(`.planning/phases/34-accum/reference/`)

### Secondary (MEDIUM confidence)
- [MDN touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action) — pan-y · pinch-zoom 정의
- [React PR #19654](https://github.com/facebook/react/pull/19654) — wheel/touch 핸들러 passive 유지

### Tertiary (LOW confidence)
- 차트 프레임 성능 · 트랙패드 핀치 · 터치 `<title>` — 실기기 미검증(Assumptions A1 · A3 · A4)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 패키지 0 · 전 층 복제 원본 실재
- Architecture: HIGH — teamflow 경로 + 계약 · 샘플 실측
- D-17 차트 선택: HIGH(라이브러리 한계는 설치본 코드로 확인) / 성능은 MEDIUM
- Pitfalls: HIGH(코드 근거) · 터치 · glob 일부 MEDIUM

**Research date:** 2026-10-20
**Valid until:** 2026-11-03(gh-trade 첫 실물 · D-09 실측이 오면 소급 · 배포 절 갱신)
