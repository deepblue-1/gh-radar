# Phase 34: 매집감지(accum) 보고서 - Context

**Gathered:** 2026-10-20
**Status:** Ready for planning

<domain>
## Phase Boundary

gh-trade 119 밤 배치(20:10)가 내보내는 `accum_flow.ndjson.gz`(종목·일 한 줄 · 평평한 열 37 + `payload` jsonb 6키)를 `gh-radar-limitup-sync` 가 team_flow 와 같은 선택 파일 규칙으로 `limitup_accum_flow` 표에 적재하고(90일 purge), 서버가 **목록(평평한 열만)** 과 **상세(한 종목 payload)** 를 분리된 RPC/라우트로 내주며, 사이드바 「분석」 에 「매집감지 보고서」 항목이 생기고, `/analytics/accum?d=YYYYMMDD` 에서 그날 매집감지 종목 목록(목업 A 평탄 목록)과 행 펼침 상세(목업 C 세 패널 차트 + 사이클 표 + 손익 줄 + 판정 기준 접힘)가 읽힌다. gh-radar DB kind 16(KYOBO119)을 날짜별 JSON lines 로 내보내는 소급 스크립트를 돌려(10/19 · 10/20) gh-trade 에 넘기고, 인박스 `docs/inbox/from-gh-trade/261020-accum-flow-export.md` 의 질문 4건에 회신하고 `status: done` 으로 닫는다.

**이 discuss 중 바뀐 전제(2026-10-20):**
- gh-trade 가 119 서버 `v1.0-497-gd6829c2a`(19:07 재기동) + tickana 를 **이미 배포**했다. **오늘(10/20) 20:10 배치가 첫 실물 `accum_flow` 를 쓴다.** 단 서버가 19:07 에 재기동돼 장중 이벤트가 서버 이벤트 파일에 없으므로 오늘 밤 파일은 기동 정합 행 위주일 가능성이 크다 → 10/20 도 소급 대상(D-23).
- 인박스 노트가 `a53876f2` 로 갱신됐다(열·스키마·manifest 모양 무변경 · 규칙 3개 추가): **CR-01** 사이클 경계 = 번호가 바뀔 때 **또는 종료 행 바로 뒤 비종료 행**(06:00 탈락·장중 재기동 뒤 재등록은 번호가 1 로 되돌아갈 수 있다) · **CR-02** 재기록 이어받기(같은 날짜 export 를 다시 쓸 때 직전 accum_flow 에 있던 종목 중 이번에 못 만든 종목 행은 이어받는다 — 소급 행이 D+1 재기록에 지워지지 않는다 · 같은 sha 면 files_sig 그대로) · **WR-02** 탐지 0 거래일 소급은 빈 표 6개(0행) + accum_flow + manifest 를 쓴다.
- 기존 워커의 선택 파일 처리는 **team_flow 하드코딩**(`index.ts:223-239` · `load.ts:23`)이라 목록으로 일반화해야 한다(D-02). 기존 teamflow 보고서 RPC 는 payload 포함 **단일 번들**이라 분리 RPC 는 새로 만든다(D-06). teamflow 차트 축은 09:00~15:30 39칸 고정 · 막대 전용이라 재사용 불가 — 시간(ms) 축 차트는 새로 만든다(D-14 · D-17).
- 라이브 「매집」 패널은 상태 3 을 「청산」 으로 쓴다(`packages/shared/src/accum-signal.ts:93-104`). 보고서는 상태 3 = 「종료」 + 사유(청산/이월 탈락/이월 만료)로 가르므로 **자체 라벨**을 쓴다(D-11).

</domain>

<decisions>
## Implementation Decisions

### 적재 (DB · 워커)
- **D-01: 같은 트랜잭션 · 표 하나.** `limitup_accum_flow` — PK `(date, isin)` · 평평한 열 37개(인박스 열 사전 순서 · `*_rate` 는 `double precision` · `since_date text` · `name`/`market`/`end_time_ms`/`reg_time_ms` 등 null 허용은 열 사전대로) + `payload jsonb`. `limitup_stage` CHECK 에 `accum_flow` 추가 · `limitup_commit_day` CREATE OR REPLACE(DELETE-by-date → INSERT 쌍 추가 · 옛 워커 호출 0행 호환 · REVOKE/GRANT · `statement_timeout` 재진술) · `limitup_purge_old` 에 90일 DELETE 한 줄. Phase 33 D-01 과 같은 결. — **Reversibility:** costly — commit_day 시그니처 · stage CHECK · purge 가 한 몸이라 되돌리면 마이그레이션 3곳을 다시 고친다.
- **D-02: 선택 파일을 목록으로 일반화.** 워커의 `TEAM_FLOW_FILE` 단일 분기를 선택 파일 목록(`team_flow` · `accum_flow`)으로 바꾼다 — manifest 에 없으면 그 표 0행 commit(`p_expected.<tbl> = 0` · `limitup_loads.rows` 에 항상 키) · 있으면 `files[].rows` 와 행 수 대조 + sha256 대조 · **재적재 감지 일반화**(manifest 에 파일이 있는데 `limitup_loads.rows` 의 그 키가 없거나 `rows` 와 다르면 files_sig 가 같아도 재적재 · reason `accum_flow_backfill` 류 · 격자 재업로드 생략은 기존 backfill 분기 그대로) · 스테이지 청크는 행 크기(최대 json ≈ 224KB)를 감안해 team_flow 보다 작게(플래너 재량). `KNOWN_SCHEMA_VERSIONS {1,2}` · `NAME_RE` 는 그대로 통과.
- **D-03: 탐지 0 거래일 manifest 를 정상 적재로 수용.** 매집감지 보고서는 상한가·팀 매집 탐지와 무관하게 있어야 한다(사용자 결정). 6표 전부 0행 + `accum_flow` 만 있는 manifest(WR-02 소급 산출물)를 워커가 그대로 적재한다(단위 테스트 추가). 상한가 보고서 `dates[]`·팀 매집 `dates[]` 는 「행 있는 날짜만」 규칙이라 그 날짜가 뜨지 않음을 확인한다(플래너 — 뜨면 빈 날 문구로 처리). gh-trade 에는 「탐지 0 이지만 매집 등록이 있는 날은 **밤 배치가 자동으로** 빈 6표 + accum_flow export 를 쓰라」 고 회신한다(D-24).
- **D-04: files_sig 통째 재적재 수용.** 소급으로 과거 manifest 에 accum_flow 가 더해지면 그 날짜 6표 + 격자까지 다시 도는 비용을 받아들인다(accum_flow 만 다시 싣는 경로는 만들지 않는다 — 인박스 질문 ③ 답). CR-02 재기록으로 sha 가 같으면 sig 가 그대로이므로 재적재 감지는 D-02 의 `rows` 키 비교가 맡는다.
- **D-05: 단위 변환 없음.** 워커는 행을 그대로 넣는다(ms epoch · 원 · 주 · % 그대로 · `since_date` 문자열). 억 · 시각 표기는 웹 표시층.

### 서버 · RPC (목록 / 상세 분리)
- **D-06: RPC 2개 · 라우트 2개.** 목록 `accum_report_for_user(p_user_id uuid, p_date text default null) → jsonb` = `{access, dates[], date, rows[]}` 에 **평평한 열만**(payload 제외). 상세 `accum_detail_for_user(p_user_id uuid, p_date text, p_isin text) → jsonb` = `{access, row}` 에 평평한 열 + `payload`(한 종목 · 최대 json ≈ 224KB — 행 단위 fetch 로 문제없음 · 인박스 질문 ④ 답 · `reg_time_ms` 초 해상도도 수용). 둘 다 DMA 게이트는 **RPC 안** `dma_visible_accounts` → `{access:false}` → 서버 403 `DmaUnmapped`(Phase 33 D-05 동형 · 라우트는 `requireAuth()` 만). SECURITY INVOKER · `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` · `GRANT TO service_role` 명시. 라우트 모양(`GET /api/accum/report?d=` · `GET /api/accum/report/:date/:isin` 류)과 이름은 플래너 재량. 웹은 행을 펼칠 때 상세를 **지연 로드**하고 같은 세션에서 `(date, isin)` 별로 메모리 캐시한다(재펼침 시 재요청 없음).
- **D-07: 표 접근 · 날짜 목록은 Phase 33 승계.** RLS 켜고 정책 0개 · service_role 전용(33 D-06). `dates[]` 는 `limitup_accum_flow` 에 행이 1개 이상인 날짜만 · `p_date` 없으면 최신 · 행 없는 날짜 직접 진입은 `rows: []`(33 D-07). 서버는 snake_case 그대로 통과(매퍼 없음).

### 목록 (채택 목업 A `reference/mockup-accum-list.html`)
- **D-08: A 평탄 목록.** 상한가·팀 매집 보고서 동형(날짜 알약 → KPI 4칸 → 종목 행 → 그 자리 아코디언 · **기본 전부 접힘** · 한 번에 하나 · `key=date` 리셋). **정렬 = 상태(매집중 → 매도중 → 종료) 그 안 `pos_net_krw` 내림차순**(라이브 「매집」 패널 `sortAccum` 과 같은 순서) · 정렬 전환 UI 없음. 데스크톱(xl) 열 = 종목(이름 · 코드 · 시장) · 상태(배지 묶음 + 종료 사유 줄) · 결과(태그) · 팀 순매수(등록 후 `pos_net_krw` · 아랫줄 「평단 N · 등록가 N」) · 하루 순매수(`day_net_krw`) · 등록·종료(등록 HH:MM 또는 이월 「MM/DD 등록」 · 아랫줄 「HH:MM 청산」/「장 마감까지」/「오늘 이월」 · 탈락·만료는 「MM/DD 등록 / 06:00 탈락」) · 셰브론. 폰(< xl) = 1줄 종목 + 결과 태그 · 2줄 상태 배지 묶음 · 3줄 메타 「팀 순매수 · 하루 · 등록 HH:MM → HH:MM」.
- **D-09: KPI 4칸** = 등록 종목(행 수 · 보조 「이월 n」) · 장 마감 보유(상태 1+2 수 · 보조 「매집중 a · 매도중 b」) · 종료(상태 3 수 · 보조 「청산 a · 탈락 b · 만료 c」) · 팀 순매수 합(**전 행** `pos_net_krw` 합 · 종료 행 포함 · 부호 + 억 1자리 · 부호 색). 행이 있는 날에만 그린다.
- **D-10: 하루 순매수 열은 값만.** 열 머리 「하루 순매수(등록 전 포함)」 · 행에 보조줄 없음 · pos/day 차이 설명은 상세 「판정 기준」 접힘(D-22). 값 0 은 `--fg-2` 「0.0억」.
- **D-11: 상태 · 종료 표기(자체 라벨).** 상태 배지 1 「매집중」(`--team`/`--team-bg`) · 2 「매도중」(`--accum-sell`) · 3 「종료」(회색 · `--muted` + `--border-subtle`) — 라이브 패널 배지와 같은 치수·색 축, 라벨 3 만 다르다(shared `ACCUM_STATE_LABELS` 는 건드리지 않는다). 배지 묶음 = 상태 + `carry_days > 0` 「이월 D+n」(`--accum-carry`) + `cycle > 1` 「사이클 n」. 종료 행은 배지 아래 사유 줄 「청산 · HH:MM」 / 「이월 탈락(복원 안 됨) · HH:MM」 / 「이월 만료 · 06:00」(`end_reason` 1/2/3 · 시각 = `end_time_ms` KST). **청산이 아닌 종료(`end_reason` 2 · 3) 행은 흐리게**(opacity ≈ .6) — 장중 청산은 정상 농도.
- **D-12: 결과 태그.** 등락률 태그 「+NN.N%」(`last_rate` · 회색 알약). `last_px >= upper` 면 `--up` 톤 「상한가 +NN.N%」(export 에 상한가 도달 시각이 없으므로 HH:MM 은 붙이지 않는다 — 목업의 「상한가 14:17」 은 합성 표기). 데스크톱 보조줄 「고가 +NN.N%」(`high_rate`) 는 상한가가 아닐 때만. `last_rate` null 은 「—」.
- **D-13: 표기 규칙 승계.** 금액 = 부호 + 억 소수 1자리(`fmtEok` 재사용 · 손익 줄은 2자리) · 가격(평단 · 등록가) = 원 정수 쉼표 · 시각 = KST HH:MM(차트 툴팁은 HH:MM:SS) · null 「—」. 33 D-10 과 같다.

### 상세 차트 (채택 목업 C `reference/mockup-accum-chart.html` + 세 번째 패널은 `mockup-accum-detail.html`)
- **D-14: 세 패널 · 시간축 09:00~20:00 · 확대/축소 · 좌우 이동.** 위 **가격 패널**(`payload.price` 10초 선 · 팀 주문 원 · `first` 표식 · 등록/종료 세로선 · 등록 전 음영) → **순매수 누적 패널**(`payload.day_cum_net` 계단 · 0선 점선 · 보라 `--team`) → **10분 매수/매도 패널**(`payload.buckets` 10분 칸 매수 빨강 / 매도 파랑 막대 쌍 · 사용자 결정으로 로드맵 7요소에 추가). 세 패널은 같은 x(ms) 창을 공유한다. **기본 창 = 하루 전체 09:00~20:00**(데스크톱 · 폰 동일). 휠/트랙패드(폰은 핀치) = 커서 기준 확대/축소 · 드래그 = 좌우 이동 · 프리셋 버튼 「전체 · 정규장(09:00~15:30) · 마지막 2시간(마지막 체결 끝 2시간)」 · 최소 창 10분 · 창은 09:00~20:00 안으로 clamp · 가격축은 **보이는 창 안의 가격으로 자동 맞춤** · 누적축 · 10분축은 하루 전체 범위 고정(0선이 흔들리지 않게). 15:30~16:00 은 빈 띠(정상) · 가격 선은 15분 이상 공백에서 끊는다(이어 긋지 않는다). 현재 창 범위 「HH:MM ~ HH:MM」 을 프리셋 줄 오른쪽에 표시.
- **D-15: 주문 원.** `payload.orders` 각 주문을 (t_ms, px) 에 원으로 · 매수 `--up` · 매도 `--down` · 채움 불투명도 .55 · **반지름 = 2.2 + √(val ÷ 1천만) × 0.5, 상한 7px**(1천만 ≈ 2.7 · 1억 ≈ 3.8 · 10억 이상 7 — 사용자 「너무 크다」 정정 뒤 채택). `first = 1` 은 같은 원에 `--fg` 테두리 1.6px(범례 「팀매수 시작」 · 1천만 미만이어도 실린 이유). 툴팁(`<title>` 또는 동급) = 「HH:MM:SS 팀 매수/매도 N주 · X.XX억 @가격 · N조각 (· 팀매수 시작)」.
- **D-16: 세로선 · 음영 · 경계 사례.** 사이클마다 등록선 = `--team` 실선 + 라벨 「등록 HH:MM」(사이클 2개 이상이면 「· k」 번호) · 종료선 = `--muted-fg` 점선 + 라벨 「{사유} HH:MM」(청산/이월 탈락(복원 안 됨)/이월 만료). 등록 전 음영 = 09:00 ~ **그날 첫 사이클** `reg_time_ms`(세 패널 전체 높이 · `--shade` 류 연한 회색) — **오늘 등록(`since_date == date`) 일 때만**. 이월 종목(`since_date < date`)은 등록선 · 음영 없음, 좌상단 「이월 D+n · MM/DD HH:MM 등록」 한 줄(`--accum-carry`). 09:00 이전 등록(`reg_time_ms < price.t0_ms`)은 09:00 에 맞춘다. 06:00 종료 행만 있는 종목(`end_time_ms` < 09:00)은 종료선을 09:00 왼쪽 끝에 붙이고 라벨 「이월 탈락 06:00」. `cycles[]` 는 **번호 연속을 가정하지 않고 나온 순서대로**(CR-01 — 번호가 1 로 되돌아가도 별개 사이클).
- **D-17: 확대/축소 구현은 리서치가 정한다.** 후보 = lightweight-charts(종목 차트에 이미 사용 · 패널 · 마커 · 시간축 pan/zoom 내장 · oklch 색 거부라 hex 변환 필요) vs 순수 SVG 자체 pan/zoom(Phase 33 D-12 결 · `useChartWidth` · 1:1 viewBox). 요구 조건: 세 패널 x 동기 · 가변 반지름 원 · 전체 높이 음영 · 라벨 달린 세로선 · 계단 선 · 막대 쌍 · 툴팁 · 폰 핀치 · 드래그 · `prefers-reduced-motion` 존중 · 한선엔지니어링급(price 3,648칸 · orders 501 · day_cum_net 6,513점) 에서 끊김 없는 확대/이동. 리서치가 둘 중 하나를 근거와 함께 고르고, 플래너는 그 선택을 잠근다.
- **D-18: 빈 자료.** 팀 체결 없는 종목(`orders` 0 · `day_cum_net` 0 · `pnl` null)은 가격 선 + 0선 + 축만으로 깨지지 않는다(「팀 체결 없음」 캡션). `price` 가 비면(체결 0) 차트 자리에 「그날 체결 자료 없음」 한 줄. 상세 로드 중 스켈레톤 · 실패 시 「상세를 불러오지 못했어요 · 다시 시도」.

### 상세 부속 (채택 목업 `reference/mockup-accum-detail.html` 토글값: 사이클 표 2개↑만 · 손익 줄 켬 · 10분 막대 세 번째 패널 · 임계 판정 기준 안)
- **D-19: 상세 순서** = KPI 줄 → 범례 → 프리셋 줄 → 차트(세 패널) → 사이클 표(조건부) → 팀 당일 손익 줄 → 「판정 기준」 접힘 → 출처 칩. **KPI 줄 4개**(마지막 사이클 = 평평한 열) = 등록가(`pos_reg_px`) · 평단(`pos_avg_px`) · 등록 후 순매수(`pos_net_krw` 부호 색) · 최고 순매수(`pos_peak_net_krw`). 임계는 넣지 않는다.
- **D-20: 사이클 표는 `cycles.length >= 2` 일 때만** 차트 아래 **기본 펼침**(1개면 표 없음 · KPI 줄만). 열 = # · 등록(HH:MM:SS) · 종료(HH:MM:SS 또는 「장 마감까지」) · 상태/사유 · 등록가 · 평단 · 순매수 · 최고 순매수 · 매수/매도 수량 · 마지막 사이클 행 `--team` 왼쪽 강조. 폰은 가로 스크롤.
- **D-21: 팀 당일 손익 줄 = 팀 매집 보고서 동형.** `payload.pnl` 13키 중 총 손익(`total_val` · 억 2자리 부호 색) + 수익률(`ret` × 100 소수 1자리) · 실현 · 평가 · 보유주(`end_qty`) · 출처 모를 매도(`unknown_sell_qty`). `pnl` null 이면 「팀 체결 없음」.
- **D-22: 「판정 기준」 접힘(기본 접힘).** 첫 줄 = **이 종목의 등록 임계**(`th_net_krw` 억 · `th_same` 조각 · `th_mcap_krw` 억 이하 · 현재 시총 `mcap_krw`) → `pos_*`(서버 상태기 · 등록 후 · 우리 체결 제외 · 마지막 사이클) vs `day_*`/차트(119 pcap 재계산 · 하루 전체 · 등록 전 · 우리 체결 · 상한가 체결 포함 · 팀 매집 보고서 하루 합계와도 다름) → 원(1천만 이상 + 사이클별 첫 매수)/계단(전체 팀 주문) 규칙 → 종료 사유 3종 뜻(2 = 06:00 탈락 + 서버 기동 정합) → 「규칙 원문: gh-trade 매집감지(accum-signal) · 팀 매집 분석 §13」 한 줄(링크 없음 · 웹에 하드코딩). **「KYOBO119 판정 기준」** 은 페이지 머리 칩(「KYOBO119 판정 기준 · 20:30 적재」)과 상세 끝 출처 칩 두 곳에 표기한다(인박스 D-03). kind 16 과 join 하지 않는다(이 표가 이력 정본).

### 소급 · 인박스 · 배포 · UAT
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 계약 정본 (열 사전 · 규칙 · 소급 파일 형식)
- `docs/inbox/from-gh-trade/261020-accum-flow-export.md` — **열 사전 정본**(평평한 열 37 · payload 6키 · 단위 · 규칙 · CR-01 사이클 경계 · CR-02 재기록 이어받기 · WR-02 탐지 0 소급 · 소급 목록 파일 23키 매핑 · 샘플 실측 · 시각표 · 질문 4건). phase 끝에 `## 회신` 채우고 `status: done`.
- `docs/inbox/from-gh-trade/261018-accum-signal.md` §「바뀐 것」 43칸 매핑 표 · :96 `message` 형식(`since=|reg=|st=|end=|cyc=|carry=|row=|our=|th=net/same/mcap`) — 소급 스크립트의 kind 16 → 23키 변환 근거.
- `/Users/alex/repos/gh-trade/docs/analysis/team-flow.md` §13 — accum_flow 규칙 정본(대상 · 입력 범위 G1+G4 20:00 · pos vs day · payload 6키 · first 창 · 보존 90일).
- `/Users/alex/repos/gh-trade/docs/features/accum-signal.md` §④ — 이월 · 06:00 판정 · 기동 정합 · `log/accum_events/<D>.jsonl` — 종료 사유 뜻 · 판정 기준 접힘 본문 원천.
- `/Users/alex/repos/gh-trade/server/tools/analysis/tickana/teamflow_accum.py` — `EVENT_KEYS_REQUIRED`(:30-32 · 23키) · `FLAT_COLUMNS`(:34-38 · 37열 순서) · `PRICE_CELLS = 3960`(:40) — 노트와 어긋나면 코드가 맞다(gh-trade 에 알린다).
- `~/ticks/accum-flow-sample/20261014/accum_flow.ndjson.gz`(1행 · sha256 `943b0a12…2a10`) · `accum_flow-34.ndjson.gz`(34행 · 최대 json 224KB 한선엔지니어링) · `events.jsonl` · `events-34.jsonl` — 픽스처 원천(모의 등록 줄 · 실물 첫 행이 나오면 교체).
- `docs/inbox/from-gh-trade/README.md` · `CLAUDE.md` 「gh-trade 인박스」 · `scripts/trade-handoff.sh` — 인박스 닫기(경로 지정 커밋) · gh-trade 에 일 요청하는 경로.

### 채택 목업 (화면 정본 — 사용자 검토 완료 2026-10-20)
- `.planning/phases/34-accum/reference/mockup-accum-list.html` — **변형 A** 채택(행 열 · 배지 묶음 · 종료 사유 줄 · 흐림 · KPI 4칸 · 폰 카드 · 정렬). 변형 B/C 는 기각. 목업의 「상한가 HH:MM」 은 합성 표기(D-12).
- `.planning/phases/34-accum/reference/mockup-accum-chart.html` — **변형 C + 확대/축소 · 드래그 · 프리셋 · 기본 전체 창 · 작은 원** 채택(두 패널 · 휠/드래그 코드 · 눈금 규칙 · 가격축 자동 맞춤 · 음영 · 세로선 라벨 · 이월 처리 · 원 반지름 식 · 툴팁 문구).
- `.planning/phases/34-accum/reference/mockup-accum-detail.html` — 펼친 행 전체 · 채택 토글값 = 사이클 표 「2개↑일 때만 펼침」 · 손익 줄 「켬」 · 10분 매수/매도 「세 번째 패널」 · 임계 「판정 기준 안에만」(사이클 표 열 · 손익 줄 항목 · 판정 기준 본문 초안 · 출처 칩).
- `.planning/phases/34-accum/reference/mockup-accum-chart-data.js` — 10/14 실측 3종목 payload(천일고속 · 한선엔지니어링 · 동양고속 — 사이클 · 이월은 목업에서 합성).

### Phase 33 승계 (적재 · RPC · 보고서 틀 · 표기)
- `.planning/phases/33-teamflow/33-CONTEXT.md` — D-01~D-07(적재 · RPC 안 DMA 게이트 · 표 접근 · 날짜 목록) · D-10(억 1자리) · D-12(순수 SVG 결) · D-18(배포 순서) 승계 근거. `33-UI-SPEC.md` — KPI 띠 · 아코디언 치수 계약.
- `supabase/migrations/20261016200000_limitup_team_flow.sql` — 표(:48-82 · `double precision` 이유) · 접근 잠금(:100-104) · stage CHECK 교체(:107-109) · `limitup_commit_day`(:112-238 · `v_tbls` :125 · `p_expected ? 'team_flow'` :211-213 · `statement_timeout` :235) · `limitup_purge_old`(:242-299 · :275). **accum_flow 는 이 파일을 본떠 새 마이그레이션 1개.**
- `supabase/migrations/20261016200100_teamflow_report_rpc.sql` — `teamflow_report_for_user`(:29 · 게이트 · dates · rows 번들) — 목록 RPC 틀(payload 제외로 바꾼다) · 상세 RPC 는 신규.
- `supabase/migrations/20261006090400_limitup_report_rpcs.sql` · `20261006090500_limitup_commit_day_timeout.sql` — 보고서 RPC 틀 · 재진술할 timeout.
- `workers/limitup-sync/src/index.ts`(:117 `STAGE_TABLES` · :149-155 prev · :223-239 team_flow 재적재 감지 · :266-274 선택 파일 읽기 · :302-307 backfill 격자 생략 · :321-326 실패 처리) · `src/load.ts`(:16 `StageTbl` · :23 `TEAM_FLOW_FILE` · :29 청크 · :75-85 commitDay) · `src/manifest.ts`(:19 KNOWN · :38 NAME_RE · :87-94 filesSig) · `src/config.ts:60` 90일 · `tests/fixtures/export/` · `tests/helpers/fake-supabase.ts`.
- `scripts/deploy-limitup-sync.sh` — Job 재배포(CRON 20:30 · GCS 볼륨). `infra/relay/limitup-pull/limitup-pull.sh`(`--allow-daytime`) · 타이머 `OnCalendar` 20:20 — D-09 미루기 대상. `docs/relay-operations.md` 112~136행.
- `server/src/routes/teamflow-report.ts`(:27) · `server/src/services/teamflow-report.ts`(:47-67 RPC 1회 · `DmaUnmapped`) · `server/src/schemas/teamflow-report.ts`(:11 `Ymd`) · `server/src/errors.ts:83` · `server/src/app.ts`(:112 · :114 마운트).
- `packages/shared/src/accum-signal.ts`(:93-104 라이브 라벨 — 보고서는 자체 라벨 D-11 · :140-185 `accumSignalOf` 필드 매핑 — 소급 스크립트 매핑 대조용).
- `webapp/src/components/analytics/teamflow-report.tsx`(:41-46 상태 · :63 `?d` · :68-84 DmaGate · :144-157 빈 상태 문구) · `teamflow-day-grid.tsx`(:46 `COLS_XL` · :80-104 아코디언 규칙 · 폰 카드) · `teamflow-kpi-strip.tsx` · `teamflow-detail.tsx`(순서 · pnl 줄) · `teamflow-bucket-chart.tsx` · `webapp/src/lib/teamflow-report.ts`(:60 `fmtEok` · :87 `fmtRate` · :95 `kstHm` · :73/:80 톤) · `teamflow-chart.ts`(:167 · :229 ms→x 아이디어) · `webapp/src/hooks/use-chart-width.ts:15` · `webapp/src/lib/teamflow-api.ts`(:19-22 `authFetch`) · `webapp/src/lib/limitup-report.ts`(:355 `dateNavOf` · :371 `parseYmdParam` · :383 `fmtYmd*`) · `limitup-date-nav.tsx:25`.
- `webapp/src/components/trading/workbench/accum-strip.tsx`(:327 `StateBadge` · :341 `CarryBadge` · :443-451 머리) · `webapp/src/lib/accum-list.ts:99` `sortAccum` — 배지 치수 · 색 축 · 정렬 동형 근거.
- `webapp/src/components/layout/app-sidebar.tsx`(:181-184 NAV · :599-600 active · :674-703 분석 그룹) · `__tests__/app-sidebar.test.tsx`(:1268-1288 순서 · :1339-1362 teamflow 가시성) · `webapp/e2e/specs/sidebar-tree.spec.ts`(:88-100 `TREE_LINKS` · :346-349 모킹) · `webapp/e2e/specs/teamflow-report.spec.ts` · `webapp/e2e/fixtures/` · `webapp/src/test-fixtures/teamflow-export.ts`.
- `webapp/src/styles/globals.css`(:76-93 라이트 · :237-251 다크 — `--up/--down/--team/--accum-sell/--accum-carry` 토큰) · [[feedback_lightweight_charts_oklch]](lightweight-charts 채택 시 hex 변환).

### kind 16 (소급 입력)
- `supabase/migrations/20260929180000_*`(:43-91 `dma_strategy_events` — PK `(gateway, journal_epoch, seq)` · `snap_cum bigint[]` · `message text` · `trade_date`) · `20261007200000_gateway_key_rename.sql:4`(`'KYOBO119'`) · `20261018120000_dma_strategy_events_accum_signal.sql`(:94-109 kind 15/16 30일 purge · :115 부분 인덱스 · :120 읽기 RPC) · `20261018233000_dma_accum_signals_restore_cut.sql` · `20261019160000_dma_accum_signals_per_gateway.sql` — 30일 purge 비대칭(join 금지 D-22) · 날짜별 `trade_date` 조회 근거.
- `scripts/migrate-dma-users.ts` · `scripts/dma-credentials.sh`(:54-75 env/gcloud 키 주입) — 소급 스크립트 패턴. [[feedback_secret_injection_user_bang]] — 키 쓰기는 분류기 차단이지만 읽기 전용 실행은 Claude 가 한다(사용자 결정 D-23).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 워커 파이프라인(manifest → files_sig → sha256 → stage → commit → purge · backfill 분기 · 옛 워커 호환 commit_day)은 그대로. accum_flow 는 **선택 파일 목록화**(D-02) + 표 1개 + 테스트.
- `teamflow_report_for_user` 틀(게이트 · dates · 날짜 선택) → 목록 RPC. 상세 RPC 는 같은 게이트 + 단일 행 `to_jsonb`.
- 서버 teamflow 라우트 · 서비스 · zod `Ymd` · `DmaUnmapped` → 복제(목록 · 상세 2개).
- 웹 `LimitupDateNav` · `parseYmdParam` · `dateNavOf` · `fmtYmd*` · `fmtEok` · `kstHm` · DmaGate · PageHeader · `authFetch` · `useChartWidth` — 재사용. KpiStrip · DayGrid 아코디언 — teamflow 처럼 복제(라벨 · 열 · 지연 로드가 다름).
- 라이브 매집 패널 배지 치수(`BADGE` 상수) · 색 축 · `sortAccum` 순서 — 보고서 배지 · 정렬이 동형.
- 목업 3개의 JS(정렬 키 · KPI 집계 · 눈금 규칙 · 창 clamp · 휠/드래그 · 반지름 식 · 사이클 표 · 손익 줄 · 판정 기준 본문) — React 이식 원본.

### Established Patterns
- 표 접근 = RLS 정책 0개 + service_role + 서버 RPC(SECURITY INVOKER · REVOKE 명시). PostgREST 직접 읽기 없음.
- `jsonb_populate_record` 는 모르는 키를 버리고 bigint 열에 소수가 오면 실패 → 열 추가 마이그레이션이 첫 적재보다 먼저 · `*_rate` 는 double precision.
- 서버 snake_case 통과 · 웹 표시층 변환 · 억 1자리.
- 보고서 UI 는 날짜 알약 → KPI 띠 → 아코디언(`key=date`) · 빈 상태 두 종류 · E2E `page.route` 모킹.
- Cloud Run 왕복 비용([[project_cloudrun_egress_roundtrip_cost]]) — 목록은 RPC 1회, 상세는 행 펼침당 1회(지연 로드 · 캐시).

### Integration Points
- `limitup_stage` CHECK · `limitup_commit_day` · `limitup_purge_old`(SQL 3곳) · 워커 `loadDay` · `limitup_loads.rows` 키.
- `server/src/app.ts` 라우터 등록 · `packages/shared` 타입 재export.
- `app-sidebar.tsx` 분석 그룹(「팀 매집 보고서」 다음) + 사이드바 단위/E2E 링크 순서 단언.
- `webapp/src/app/analytics/accum/page.tsx`(AppShell + Suspense — `useSearchParams`).
- `scripts/` 소급 스크립트 · `~/ticks/accum-backfill/` · gh-trade 세션 핸드오프.
- `infra/relay/limitup-pull/` 타이머 · `scripts/deploy-limitup-sync.sh` CRON(D-09 조건부).

</code_context>

<specifics>
## Specific Ideas

- 「지금 들고 있는 것이 먼저, 끝난 것은 아래로 흐리게」 — 라이브 「매집」 패널과 같은 순서로 보고서가 이어진다(D-08 · D-11).
- 차트는 **하루 전체가 기본**이고, 보고 싶은 구간은 사용자가 휠·드래그로 들어간다(「최신 2시간」 안은 사용자가 철회). 원은 작게 — 가격 선이 주인공이고 원은 표식(D-14 · D-15).
- 사이클이 여러 개인 날(등록 → 청산 → 재등록)은 차트 세로선 + 표로 「몇 번 들어갔다 나왔나」 가 읽혀야 한다(D-16 · D-20). 사용자는 이 개념을 목업으로 보고서야 이해했다 — 실제 화면도 세로선 라벨에 번호를 붙인다.
- 매집감지 보고서는 상한가 · 팀 매집 탐지와 **독립**이다 — 탐지 0 인 날도 매집 등록이 있으면 보고서가 있어야 한다(D-03 · D-24 ⑤).
- 「등록 후 순매수(pos)」 와 「하루 순매수(day)」 가 부호까지 다를 수 있다는 것을 목록은 열 머리로, 상세는 판정 기준 접힘으로만 설명한다(D-10 · D-22) — 행을 무겁게 하지 않는다.

</specifics>

<deferred>
## Deferred Ideas

- **탐지 0 거래일 자동 export(gh-trade 몫).** 밤 배치가 장중 행이 있는 탐지 0 일에 빈 6표 + accum_flow 를 자동으로 쓰는 것 — gh-trade 가 「가능 · 작은 수정」 으로 받아 사용자 확인 뒤 quick 으로 진행(D-24 ⑤ 조건). gh-radar 는 D-03 으로 받을 준비만. 재배포 알림이 오면 첫 적용 날짜를 UAT 에 더한다.
- **라이브 「매집」 패널 상태 3 라벨 「청산」 → 「종료」 통일 여부.** 보고서가 「종료 + 사유」 로 가르므로 라이브 패널도 맞출지 — 별도 quick(사용자 판단).
- **목록 행에 팀 손익 열.** 팀 매집 보고서 목록에는 손익 열이 있지만 이번 목록에는 넣지 않았다(상세 손익 줄만). 필요하면 후속.
- **10분 표 보기(buckets 접힌 표).** 세 번째 패널로 그리므로 표는 두지 않는다. 숫자 확인 요구가 생기면 후속.
- **D-09 10분 미루기 실행.** gh-trade 첫날 실측 보고 뒤 별도 커밋(phase 안에서 조건부 — 실측이 20:20 을 넘지 않으면 할 일 없음).

</deferred>

---

*Phase: 34-accum*
*Context gathered: 2026-10-20*
