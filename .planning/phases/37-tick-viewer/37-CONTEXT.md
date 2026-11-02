# Phase 37: 틱 전문 뷰어 - Context

**Gathered:** 2026-11-02
**Status:** Ready for planning

<domain>
## Phase Boundary

트레이더가 **KRX·NXT 어느 종목이든** 08:00~20:00 의 틱 단위 전문(호가 B6 · 체결 A3 · 거래원 B9 · VI R8 · 프로그램 C3)을 **실제 수신 순서대로 재생**하며 한 틱의 호가창 · 앞뒤 전문 · 체결 버스트(주문 묶기) · 거래대금 · 팀 거래정보를 보는 `/analytics/ticks` 뷰어. 공급은 두 갈래(gh-trade-ac 합의 2026-11-02 · 세부는 이 discuss 로 확정):

- **① 당일 장중 = 종목 단위 요청형.** 119 에 기록기와 분리된 소형 인덱서(코어 0 · nice)가 오늘 `.pcap` 꼬리를 (거래소, ISIN) 별로 쪼개 두고, radar-gw 가 ssh 강제 명령 키(`tickarc` · `limitpull` 선례)로 「isin · exchange · from_ns · to_ns → 원본 전문 바이트 + recv_ns + 거래소 라벨」 zstd 스트림을 받는다(지연 = 기록 1초 + 전송 · 동시 1~2건 · 응답 크기 상한 · stock-dma · relay 계약 무변경 · 119 구현은 gh-trade). gh-radar 는 받은 원본 바이트를 **tickana `packets.py` LAYOUTS 와 같은 레이아웃으로 직접 디코딩**한다(TS 이식 · pcap2parquet 출력과 golden 대조).
- **② 과거 날짜 = GCS 원본 클라우드 변환.** `gs://gh-trade-tick-archive/raw/<krx|nxt>/<D>/` pcap.zst(하루 4.5GB · 6,900만 건)를 Cloud Run Job 이 정본 디코더 레이아웃으로 변환해 gh-radar 저장소(종목·날짜 격자)에 적재, 119 부하 0. **대상은 전 종목이 아니라 D-02 의 선별 종목**, 나머지는 열 때 요청 변환(D-03).

화면은 스케치 019 **D 종합**(머리 → 매집감지 3판 차트 → 슬라이더 카드 → HTS 3단 · 호가 「주 | 금액」 토글) + 스케치 020 **A 행 그룹 + 뒤집힘 3**(기본 거래소순 · 수량 옆 금액 병기 · B6 총잔량 제거) + 이 discuss 의 진입 목업 **A**(검색 + 그날 격자 목록 · 상태 카드 3종)가 정본이다. 버스트 = 같은 종목 A3 msg_seq 직전 +1 · bs 동일 주문 묶기, 팀 = A(SMP) ∪ B(0/0 단독) ∪ C0 · 단일가 제외 — **서버 매집감지 · tickana `classify_orders` 와 일치**해야 한다. NXT 는 서버 NXT 런 규칙(D-13). 팀 손익 = `team-flow.md` §5-1 평균단가법을 gh-radar 가 A3 에서 직접 계산 · export `payload.pnl` 과 golden 대조. 서버 `burst_upper_limit` 은 상한가 벽 전용이라 범용 버스트 기준으로 쓰지 않는다.

**성공 기준(discuss 로 확정 — 플래너가 ROADMAP Phase 37 Success Criteria 를 이 넷으로 고친다):**
1. 목업 검토 · 채택 완료 — 019 D · 020 A+3 · 진입 A(`reference/mockup-ticks-entry.html`). 폰 3판 과함 여부만 실기기 UAT 에서 재확인(미결 유지).
2. gh-trade 계약 인계(`scripts/trade-handoff.sh` 인박스 — D-21 항목) · 119 인덱서 배포 뒤 radar-gw 에서 당일 종목 하루치 조회 실측(응답 크기 · 지연 · 이어받기).
3. 과거 변환 Job — 10/30 선별 종목(매집감지 등록 + 15%↑) 변환 시간 · GCS 읽기 비용 실측 · 종목·날짜 격자 적재 · 당일 밤 자동 · 요청 변환 경로(그 종목만 · 약 N분) 실측 · 90일 purge.
4. 웹 뷰어 `/analytics/ticks` — 당일(요청형 · 서버 캐시 · 자동 증분)과 과거(격자)가 같은 화면 · DMA 게이트 · 팀 손익 golden 대조 통과(export `payload.pnl`) · 버스트 판정 tickana `classify_orders` 와 일치(KRX) · NXT 런 규칙 오라클 일치 · 세 보고서 「틱 보기」 · URL 딥링크(틱 시각까지).

**범위 밖(이 phase 에 넣지 않는다):** 「상한가 창 버스트 비율」 2차 표시 · 전 종목 매일 변환 · 우리 체결 제외 계산 · 창구별 순매수 배분(`member_flow` 규칙) 뷰어 재계산 · NXT 외 보드(G4 등) · 폰 전용 재배치.

</domain>

<decisions>
## Implementation Decisions

### 목업 · 스케치 채택 (D-00)
- **D-00: 화면 정본 셋.** ① 스케치 019 **D 종합** — 머리(종목 · 날짜 · KRX|NXT · 공급 배지 · 현재 틱 시각/seq) → 매집감지 3판 차트(가격 선 · 팀 평단 `--up` 점점선 · 팀 주문 원 ≥500만 | 당일 팀 순매수 보라 계단(오른쪽 축) + 누적 순매수 회색 계단(이월 포함 · 왼쪽 회색 축 · 0 포함) | 10분 팀 매수/매도 막대 · VI 띠 · 15:30~16:00 빈 띠 · 장전 음영 · 현재 틱 커서 + 시각 라벨 · 휠/끌기/클릭/`+ − 0`/「1분」「10초」 · 틱이 창 밖이면 창이 따라감 · 주문 원 클릭 = 그 주문 마지막 조각) → 슬라이더 카드(‹ ▶ › · 08~20 슬라이더(5분 거래대금 밀도 · VI 눈금) · 시각 입력 + 점프 · 당일이면 「끝으로」) → HTS 3단(호가 10단 「주 | 금액」 토글(스케치 010 C 축약 · 바닥 줄 총잔량 ↔ 합산 금액 · 바 길이 단위 따름) · 전문 목록 · 이 주문 | 거래대금 | 팀 거래정보). 폰 390: 3판 165px + 슬라이더 카드 + 「호가 | 전문 | 버스트 · 팀」 세그먼트. ② 스케치 020 **A 행 그룹 + 3 둘 다** — 전문 전부 한 행씩, 한 주문은 왼쪽 레일(팀 보라 · 일반 회색) + 둘째 조각부터 시각 흐림 + 닫는 B6 행 앞 「닫는 B6」 점선 칩 + 꼬리 줄 「┗ n조각 k단 · 수량 · 금액 · 지속 · 모양」(모양 칩은 꼬리에만 · 1조각 주문은 그 행) · 70조각도 71행 + 꼬리 · 머리 「수신순 | 거래소순」 토글(**기본 거래소순** = msg_seq 순) + 먼저 온 B6 행 seq 주황 `↕` + 꼬리말(수신순 「↕ 9.0ms 먼저 수신」 · 거래소순 「↕ 수신은 9.0ms 먼저」) + 수신순에서만 msg_seq 제자리 점선 「⋯ 거래소순 자리」 줄 + 머리 「↕ 다음 역전」 · A3 `16,400 +1,064 (1,745만) 매수 · 0/0` · B6 `매도1 16,400 ×283 (464만) 매수1 16,350 ×121 (198만)` · B6 총잔량은 행에서 뺌. ③ 진입 목업 `reference/mockup-ticks-entry.html` **A**(D-16). 키: `←` `→` 한 틱 · `Shift+←/→` 10틱 · `Space` 재생 · 시각 입력 `HH:MM:SS.mmm` + Enter/「점프」.

### 공급 공백 · 과거 변환 범위
- **D-01: D-1 공백은 GCS 업로드를 당일 밤으로 당겨 메운다(gh-trade 요청).** 지금 `tick-archive` 완결 판정은 「이름의 날짜 < 오늘」 이라 D 의 원본이 D+1 22:00 에야 올라와, 어제가 하루 종일 과거 격자에도 당일 인덱서에도 없다. gh-trade 에 완결 판정을 **「같은 줄기의 `.pcap` 짝이 없고 20:30 이후(기록 종료 뒤)」** 로 바꿔 **D 를 D 22:00 에 올리도록** 요청한다(인박스 D-21 ①). 변환 Job 이 그날 밤 돌면 다음날 아침 어제 격자가 있다. 119 요청형은 **오늘만** 덮는다(어제까지 덮는 안 기각 · 공백 수용 기각). — **Reversibility:** costly — gh-trade `tick-archive.sh` 완결 규칙 · 타이머 변경을 요청하는 외부 운영 계약이며, 되돌리면 D-04 Job 시각 · 사용자 안내 문구가 다시 바뀐다.
- **D-02: 밤 변환 대상 = 그날 매집감지에 등록된 모든 종목 + 그날 15% 이상 상승했던 모든 종목(사용자 직접 지정).** 전 종목(기각 · 저장 과다) · 보고서 탐지 종목만(기각) 아님. 「매집감지 등록」 = `limitup_accum_flow` (D, isin) 행(21:00 적재) ∪ 그날 라이브 kind 16 등록(`dma_strategy_events` · 적재 전 보강). 「15% 이상 상승」 = 그날 **고가 기준** 기준가 대비 +15% 이상 — 판정 입력(pcap A3 에서 직접 vs 키움 매분 스냅 vs KRX EOD)은 Claude 재량(아래). KRX·NXT 둘 다(같은 ISIN 이 대상이면 두 거래소 격자 다 만든다).
- **D-03: 그 밖의 종목 과거 날짜는 열 때 요청 변환.** 격자에 없는 (종목, 거래소, 날짜)를 열면 Cloud Run Job 을 **그 종목만** 대상으로 켜고 「변환 중 · 약 N분 · 끝나면 자동으로 열림」 상태 카드(목업 「미변환 종목 고름」) + 취소. 끝나면 격자에 남아 다음부터 바로. GCS Archive 읽기 요금(하루치 pcap 통독)이 그때마다 붙는 것을 받아들인다. 같은 (종목, 날짜) 동시 요청은 Job 하나로 합친다(사용자 수 독립). — **Reversibility:** reversible.
- **D-04: 격자 보존 90일.** 119 원본 회전 · 매집감지 purge 와 같은 기간. 지나면 지우고, 열면 D-03 요청 변환으로 재생성(GCS 원본은 영구). 밤 변환본이 당일 캐시 승격본(D-06)을 덮어쓴다.

### 당일 요청형 호출 규율
- **D-05: 당일 종목을 열면 08:00 부터 지금까지 하루치를 한 번에 요청한다.** 그 뒤는 마지막 recv_ns 이후 증분만. 차트 · 슬라이더가 처음부터 하루 전체를 그린다. 응답 상한에 걸리면 **이어받기**(응답에 `has_more` + `next_from_ns` 류 커서 · 계약 항목 D-21 ②). 슬라이더 주변 시간 창만(기각) · 하루치 + 창 이중 요청(기각).
- **D-06: 새 틱은 자동 폴링 — 탭이 보이고 현재 틱이 끝에 있을 때만.** 5~10초 간격으로 마지막 recv_ns 이후 증분. 사용자가 과거 틱을 보고 있으면 멈추고 목록 끝에 「새 틱 n건」 배지, 「끝으로」 누르면 즉시 증분 1회 + 끝 틱으로. 수동만(기각) · 늘 폴링(기각). 정확한 간격 · 백오프는 리서치.
- **D-07: 119 호출은 서버 캐시로 (종목, 거래소, 날짜) 당 1줄.** gh-radar 서버(또는 relay — 어느 쪽이 radar-gw 를 통해 119 에 닿는지는 리서치)가 받은 원본 바이트를 종목별로 들고 있고, **폴링도 종목당 하나**(브라우저 N 개가 열려도 119 호출은 종목당 동일 — CLAUDE.md 「호출량은 사용자 수와 독립」). 장 마감(20:00) 뒤 그날 캐시는 **그날 격자로 승격**하고, 밤 변환 대상이면 변환본이 덮어쓴다(D-04). — **Reversibility:** reversible.
- **D-08: 접근 = DMA 매핑 사용자만(과거 · 당일 동일).** 매집감지 · 팀 매집 보고서와 같은 게이트 — RPC 안 `dma_visible_accounts` · 403 `DMA_UNMAPPED` · 웹 `DmaGate surface="틱 전문 뷰어"` 표시 장치. 과거만 로그인 전체(기각) · 관리자만(기각).

### 팀 거래정보 범위
- **D-09: 누적 순매수(이월 포함 회색 선)는 있으면 그리고 없으면 당일 선만.** `limitup_accum_flow` (날짜, isin) 행이 있으면 `payload.pos_net` 로 회색 누적 선 + 왼쪽 회색 축(스케치 018 ② 동형). 없으면 보라 당일 선만 · 왼쪽 축 생략 · 범례 「누적 자료 없음(매집감지 미등록)」. 당일 종목은 늘 당일 선만(라이브 kind 16 포지션으로 보강하지 않는다). 전 종목 pos_net export 요청(기각) · 누적 선 제거(기각).
- **D-10: 팀 거래정보 KPI = A3 평균단가법(§5-1) 틱마다.** 당일 팀 순매수(금액 · 수량) · 누적(pos_net 있을 때만 · D-09) · 당일 평단 · 평단 대비 수익률(선택 틱 시점 체결가 기준 미실현 + 실현) — 선택 틱까지의 체결로 계산. 단일가(bs ≠ '1'/'2') 제외 · 상한가 가격 체결 포함(§5-1). 거래대금 = A3 `cum_value`(선택 틱 시점).
- **D-11: 5창구(교보·한국·유진·신한·NH) 표는 선택 틱 시점의 마지막 B9 그대로.** 창구별 누적 매수/매도 수량 · 금액 + 「B9 HH:MM:SS 기준 · ≈1분 해상도」 · 상위 5 밖 창구는 「—」. 추정(배분) 없음 — `member_flow` 배분 재계산(기각) · 표 생략(기각).
- **D-12: 우리(KB·교보 DMA) 체결은 포함하고 캡션만.** A3 만으로 계산 — export `payload.pnl` 과 같은 정의라 golden 대조가 성립한다. 팀 패널 캡션 「우리 체결 포함 · 호가 걸어 둔 팀 주문 미포함(최소치)」. 저널 80 조인으로 「우리」 배지(기각) · 제외 계산(서버 D-07 동형 · 기각).
- **D-13: NXT 도 팀 판정 · 손익을 보인다 — 서버 매집감지 NXT 런 규칙 그대로(사용자 「매집감지 규칙을 따르면 돼」).** 런 = 같은 ISIN 직전 NXT A3 seq + 1 ∧ 같은 bs · 닫는 B6 = 마지막 A3 seq + 1 · 완성 4경로(닫는 B6 · 선착 뒤 늦은 조각 · 새 런 · 200ms) · **팀 = 런 안 한 가격 2조각 이상(SMP 모양)만**(0/0 없음). 정본 gh-trade `docs/features/accum-signal.md` 「NXT 런」 D-01·D-02·D-04 · 파이썬 오라클 `tickana/nxt_fixture.py classify_nxt_team_orders` · 런 분석기 `tickana/nxt_runs.py`. 팀 패널 · 차트 팀 계단 · 주문 원은 NXT 에서도 그린다(같은 ISIN KRX 와 **합산하지 않는다** — 뷰어는 거래소 하나를 보므로 그 거래소 체결만). 주문 묶기만 하고 팀 숨김(기각) · NXT 제외(기각).

### 진입 · 선택 · 연결
- **D-14: 사이드바 「분석」 그룹에 「틱 전문 뷰어」** — 「매집감지 보고서」 다음 · active = prefix `/analytics/ticks` · 사이드바 테스트 · e2e `sidebar-tree` 링크 순서 단언 갱신(Phase 34 D-27 동형).
- **D-15: 기본 날짜 = 평일 `08:00~20:00` 이면 오늘, 그 밖에는 격자가 있는 최근 날짜.** 오늘 빈 상태 목록 = 오늘 매집감지 등록(라이브 kind 16) + 지금 15% 이상 상승 종목(키움 매분 스냅 `intraday`) 「라이브」 칩 · 과거 빈 상태 목록 = 그 날짜 격자 종목.
- **D-16: 진입 · 빈 상태 = 목업 A(`reference/mockup-ticks-entry.html` · 사용자 검토 2026-11-02).** 머리: 종목 검색(기존 전역 검색 재사용 · 이름/코드 · 제안 행에 그 날짜 준비 상태 칩 「격자 있음 · 변환 필요 · 약 N분 · 오늘 · 라이브」) + 날짜 알약(보고서 동형 ‹ › + 달력) + KRX|NXT 세그먼트. 빈 상태: 「{날짜} 격자 종목 · n종목」 패널 — 등락률순(이름순 토글) · 출처 칩(매집감지 · 15%↑ · 요청 변환 · NXT) · 클릭 = 열기 · 캡션 「목록에 없는 종목은 위 검색으로 — 그 종목만 변환해서 열어요(약 N분)」. 상태 카드 3종 공통: 「변환 중」(주황 · 진행 바 · 취소) · 「당일 · 08:00~지금 하루치 받는 중 · 대기 k건」(빨강 · 진행 바 · 취소) · 「자료 없음」(휴장 · 당일 22:00 전 · 90일 밖 → 「최근 거래일로」 버튼). 로드된 뒤 머리는 019 D 그대로(검색은 머리에 남는다). B 검색창만 · C 최근 본 기각.
- **D-17: 세 보고서(매집감지 · 팀 매집 · 상한가) 펼친 상세 머리에 「틱 보기 ›」 알약.** 그 종목 · 그 날짜 · 의미 있는 시각으로 점프 — 매집감지 = 마지막 사이클 등록 시각(`reg_time_ms`) · 팀 매집 = 상한가 도달 시각(규칙 5 · 없으면 첫 20% 도달) · 상한가 = 첫 상한 도달(`first_upper_ns` · 미도달이면 `t20_ns`). 보고서 종목은 밤 변환 대상(D-02)이라 바로 열린다. 거래소는 KRX 기본.
- **D-18: URL = `/analytics/ticks?isin=&d=YYYYMMDD&ex=KRX|NXT&t=HH:MM:SS.mmm`.** 틱을 옮길 때마다 `history.replaceState`(히스토리 안 쌓임 · 스로틀). 복사해 넘기면 같은 틱 · 새로고침 제자리 · 「틱 보기」 도 같은 꼴. `t` 는 그 시각 이후 첫 틱(수신순 기준)으로 맞춘다. `t` 없으면 과거는 08:00 첫 틱 · 당일은 끝 틱.

### 계약 · 배포
- **D-19: 디코더는 gh-radar 가 TS 로 이식 · pcap2parquet 와 golden 대조.** 태그 2자 + 길이 키로 `LAYOUTS`(A3 186B · B6 590B · R8 116B · B9 414B · C3 400B) 를 옮기고, 맞지 않는 전문은 raw(태그 · 정보구분 · 길이 · recv_ns)로 보존(버리지 않는다 — 전문 목록 「기타」 행). 단위 · `*_ns` · `exchange`/`market` 유도 규칙은 `server/tools/analysis/README.md` 「Parquet 표 스키마」 그대로. 검증 = 같은 pcap 조각을 두 디코더로 돌려 행 수 · 키 열 일치(gh-trade `server/tests/support/RawPacketFixtures.h` 표본 재사용). — **Reversibility:** costly — 격자 파일 형식과 당일 캐시가 이 디코더 출력에 묶이며, 레이아웃 오류는 저장된 격자를 전부 재변환해야 고쳐진다.
- **D-20: 버스트 · 팀 판정 · 손익 계산은 shared 패키지 순수 함수 + 오라클 픽스처.** KRX = `krx-a3-zero-quote.md` §2 묶기 · §3/§4 판정(A ∪ B ∪ C0 · C 일반 · 단일가 제외) · NXT = D-13 — gh-trade 오라클(KRX 빅텍 20261022 · NXT 101360 20261016 13시 컷: NXT runs≥2=179 smp=65 · KRX runs≥2=182 smp=70)과 수치 일치 테스트. 손익 = §5-1 → export `payload.pnl`(10/14 천일고속 실현 +0.27억 · 미실현 +0.03억 · 합계 +0.30억 · 1.12% · 끝 잔량 3,401주)과 골든. 서버 · 웹이 같은 함수를 쓴다(웹은 선택 틱까지 증분 계산).
- **D-21: gh-trade 인박스(`scripts/trade-handoff.sh tick-viewer-contract`)는 플랜 1 로 보내고, 응답을 기다리는 동안 과거 경로를 먼저 만든다.** 항목: ① `tick-archive` 완결 판정 · 업로드를 D 22:00 으로(D-01) ② 119 인덱서 + ssh 강제 명령 계약 — 인자 `isin · exchange · date(오늘만) · from_ns · to_ns`, 응답 = zstd 스트림(레코드 = recv_ns + 거래소 라벨 + 원본 UDP 페이로드 · pcap-ns 와 같은 프레이밍 제안) + 끝 표시 + 상한 초과 시 `has_more`/`next_from_ns` · 동시 1~2건(초과는 429 류 + 대기 안내) · 응답 크기 상한 수치 · 키 등록 줄(`restrict,command=…` · `tickarc`/`limitpull` 동형 전용 사용자 `tickpull` 제안) ③ 「거래소 시각」 열 정의(A3 `trade_time` 과 B6 `proc_time` 이 같은 시계인지 · 뷰어 「거래소순」 은 msg_seq 만 쓴다) ④ NXT 체결의 호가 공백 규칙(NXT A3 에 0/0 이 없을 때 호가 재구성에 영향) ⑤ 변환 Job 서비스 계정에 `gs://gh-trade-tick-archive` objectViewer 바인딩은 gh-radar 가 한다(알림만). 노트 커밋은 gh-trade 세션.
- **D-22: 배포 순서 = DB(격자 메타 표 · RPC · 게이트) → 변환 Job(새 Cloud Run Job + Scheduler · GCS 바인딩) → 서버/relay(당일 경로 · 캐시) → webapp push(= 프로덕션). 당일 경로는 gh-trade 119 인덱서 배포 뒤에만 켠다(그 전엔 「당일 자료 준비 중」 카드).** radar-gw 변경(키 · 유닛)은 20:00 이후 · 「relay 먼저 · push 나중」 원칙.

### Claude's Discretion
- **저장처 · 파일 형식**(Supabase Storage 격자 — `limitup-sync` grid 선례 — vs gh-radar 전용 GCS 버킷 + 서명 URL · 종목·날짜 파일 1개(gzip NDJSON vs 자체 바이너리 vs Parquet) · 브라우저 직접 다운로드 vs 서버 경유). Cloud Run 서버 VPC egress 왕복 비용([[project_cloudrun_egress_roundtrip_cost]])을 리서치가 잰다.
- **변환 Job 설계** — 트리거(22:00 업로드 뒤 23:00 고정 vs 객체 도착 알림) · 4.5GB 스트리밍 메모리 · 대상 선별 순서(첫 패스에서 ISIN 별 고가 · 기준가 계산 뒤 둘째 패스 쓰기 vs 임시 디스크) · 15% 판정 입력(pcap A3 직접 권장 — 기준가 = `px − 부호 × price_change` 최빈값 · 정수 경계 비교 `team-flow.md` §5) · 요청 변환(D-03)의 Job 인자 · 소요 안내 N분 · 중복 합치기.
- **당일 경로 위치**(서버 vs relay) · 증분 폴링 간격(5~10초 안) · 백오프 · 캐시 메모리 상한 · 20:00 승격 시점.
- **호가 재구성**(선택 틱 시점 마지막 B6 · msg_seq 순 · B6 가 없는 구간 처리) · 전문 목록 가상 스크롤(하루 수십만 행) · 슬라이더 5분 밀도 계산 · `t` 점프 이진 탐색.
- **차트 코드 재사용 범위** — `accum-chart.tsx`/`lib/accum-chart.ts`(순수 SVG · `useChartGestures` · `useChartWidth`)를 틱 커서 · 10초 가격 대신 틱 가격 선으로 일반화할지 복제할지.
- **격자 메타 표**(날짜별 종목 목록 · 출처 칩 · 변환 상태 · purge) 스키마 · RPC 모양 · 요청 변환 상태 폴링.
- **키 바인딩 · 재생 속도**(스케치 그대로 `Space` 재생 · 속도는 1×/10×/최대 정도).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 화면 정본 (채택 목업 · 스케치)
- `.planning/sketches/019-tick-viewer-layout/README.md` + `index.html` — **배치 D 종합** 채택(2026-11-02 · 4차 검토) · 호가 「주 | 금액」 토글 · 누적 선 pos_net 계약 항목 · 폰 165px · 미결(폰 3판 · NXT 호가 공백 · 당일 지연 표현). 생성 데이터 규칙(한선엔지니어링 101360 2026-10-22 본뜸 · 역전 12%).
- `.planning/sketches/020-msg-row-inversion-burst/README.md` + `index.html` — **A 행 그룹 + 3 둘 다** 채택 · 기본 거래소순 · 금액 병기 · B6 총잔량 제거 · 70조각 주문 · 미결(거래소 시각 열 정의 · B9/C3 뒤집힘 · 폰 B6 행 잘림).
- `.planning/phases/37-tick-viewer/reference/mockup-ticks-entry.html` — **진입 A** 채택(2026-11-02) · 상태 카드 3종(변환 중 · 당일 수신 중 · 자료 없음) · 검색 제안 상태 칩 · 격자 목록 열(종목 · 등락률 · 출처 · ›).
- `.planning/sketches/018-accum-day-axis/README.md` · `017-accum-pos-net-line/README.md` — 누적 왼쪽 회색 축 · 포지션 주인공 보라(차트 둘째 판 동형 근거). `.planning/sketches/010-amount-based-options/README.md` — 금액 축약 표기 C(억 · 만 · 주수 병기 없음).

### 판정 규칙 정본 (gh-trade — 수치가 어긋나면 이 문서 · 오라클이 맞다)
- `/Users/alex/repos/gh-trade/docs/analysis/krx-a3-zero-quote.md` §1 사실 F1~F5 · **§2 주문 묶기**(A3 msg_seq +1 · B6 자리) · **§3 모양 A/B/C/C0/D/E** · **§4 결정(팀 = A ∪ B · C 일반)** · §7 수치(빅텍 10/22 B6 묶기 66.9억).
- `/Users/alex/repos/gh-trade/docs/analysis/team-flow.md` §3 팀 다섯 창구(교보 00001 · 한국 00003 · 유진 00008 · 신한 00002 · NH 00012) · **§4 규칙 1~8**(2 한 주문 · 3 팀 종류 · 6 B9 · 7 수동 주문 안 보임 · 8 KRX G1) · §5 구간 · 기준가 · 정수 경계 · **§5-1 팀 당일 손익(평균단가법)** · §11 export `payload.pnl` 13키 · §13 accum_flow.
- `/Users/alex/repos/gh-trade/docs/features/accum-signal.md` 「NXT 런」 D-01·D-02·D-04·D-10·D-11(:54-55 · :100-107) — NXT 팀 판정 정본(D-13) · 우리 체결 제외 D-07(뷰어는 안 함 D-12) · 거래대금 = KRX `cumTradeValue` 최댓값(:112).
- `/Users/alex/repos/gh-trade/server/tools/analysis/tickana/teamflow.py`(`classify_orders` · `team_pnl`) · `nxt_fixture.py`(`classify_nxt_team_orders`) · `nxt_runs.py`(머리 주석 — 런 정의 · 검증 수치 NXT 179/65 · KRX 182/70) — 오라클 함수. `/Users/alex/repos/gh-trade/server/tests/support/AccumNxtFixtures.h` — NXT 오라클 생성물.

### 전문 레이아웃 · 원본 보관 · 운반 (디코더 이식 · Job · 강제 명령)
- `/Users/alex/repos/gh-trade/server/tools/analysis/tickana/packets.py` — **`LAYOUTS` 정본**(태그 · 길이 · 필드 오프셋 · 자체검사) — TS 이식 원천(D-19). `pcap2parquet.py` — pcap-ns 프레이밍(`_GHDR` · `_REC` · 8MiB 스트리밍 · zstd) · 출력 경로 · 레코드 순회 — Job 변환기 원천.
- `/Users/alex/repos/gh-trade/server/tools/analysis/README.md` 「Parquet 표 스키마」(:311-330 — 단위 · `*_ns` · `exchange`/`market` 유도 · 표별 열) · 「알려진 한계」(B9 해상도 ≈100초 · 체결 귀속 불가) · 「rrsync 읽기 전용 키」(:279-301 — 119 키 등록 절차 · 사용자 수행).
- `/Users/alex/repos/gh-trade/server/tools/archive/README.md` — tick-archive 구조 · **완결 판정(:49-50 — 이름 날짜 < 오늘 → D+1 22:00)** · 장중 가드 · 복원 명령 · 비용. D-01 변경 요청 근거.
- `/Users/alex/repos/gh-trade/server/tests/support/RawPacketFixtures.h` — 전문 표본(디코더 golden 픽스처).
- `docs/inbox/from-gh-trade/261005-tick-raw-archive-gcs.md` — 버킷 `gs://gh-trade-tick-archive`(asia-northeast3 · ARCHIVE · relay SA objectCreator+Viewer · 삭제 403 · 경로 `raw/<krx|nxt>/<D>/<D-HHMM[-N]>.pcap.zst`) · 「원본이 필요하면 objectViewer 로 읽을 수 있다」.
- `docs/relay-operations.md` :105-136 — radar-gw 공유 호스트 규칙(지우지 말 것 · 변경 전 알림) · `tickarc` · `limitpull` 설치 문법(전용 사용자 · 지문 대조 · 키는 없을 때만 · 자원 상한 · `Asia/Seoul` 타이머 · 119 등록 줄 `restrict,command="/usr/local/bin/rrsync -ro …"`). `infra/relay/limitup-pull/{limitup-pull.sh,install.sh,*.service,*.timer}` — 당일 경로 키 · 유닛의 본.
- `docs/inbox/from-gh-trade/README.md` · `CLAUDE.md` 「gh-trade 인박스」 · `scripts/trade-handoff.sh` · `docs/inbox/trade-handoff-template.md` — D-21 인계 경로.

### Phase 34 · 28 승계 (적재 · RPC · 보고서 틀 · 차트)
- `.planning/phases/34-accum/34-CONTEXT.md` D-06·D-07(RPC 안 DMA 게이트 · service_role 전용 · 날짜 목록) · D-14~D-18(3판 차트 · 주문 원 반지름 · 세로선 · 빈 자료) · D-25(배포 순서) · D-27(사이드바). `34-UI-SPEC.md` — 차트 치수 · 색 축.
- `supabase/migrations/20261020200000_limitup_accum_flow.sql` · `20261020200100_accum_report_rpc.sql` · `20261026120000_limitup_accum_flow_pos_day_avg.sql` — `limitup_accum_flow` 표 · `payload.pos_net` · 상세 RPC(D-09 · D-17 입력) · 90일 purge 틀.
- `workers/limitup-sync/src/{index.ts,load.ts,grid.ts,purge.ts,config.ts}` · `scripts/deploy-limitup-sync.sh` — Cloud Run Job + Scheduler + GCS 볼륨 + Supabase Storage 격자 선례(변환 Job 의 본).
- `server/src/routes/accum-report.ts` · `server/src/services/accum-report.ts` · `server/src/schemas/accum-report.ts` — 조회 라우트 · 방어선 주석 틀(T-15-03 · T-19-01 · T-19-17).
- `webapp/src/components/analytics/accum-chart.tsx` · `webapp/src/lib/accum-chart.ts` · `webapp/src/hooks/use-chart-view.ts` · `use-chart-width.ts` — 3판 순수 SVG · 휠/끌기/핀치 · 1:1 viewBox(차트 재사용 후보). `accum-report.tsx` · `accum-detail.tsx` · `accum-kpi-strip.tsx` — 보고서 틀 · 「틱 보기」 알약 자리(D-17). `webapp/src/components/analytics/teamflow-detail.tsx` · `limitup` 상세 컴포넌트 — 나머지 두 「틱 보기」 자리.
- `webapp/src/components/orderbook/orderbook-ladder.tsx`(`OrderbookLadderProps` · 행 색 규칙 · `burstMarkOf`) · `trade-tape.tsx` — 호가 10단 사다리 · 체결 테이프 색 규칙(재생용 정적 호가에 맞게 분리 또는 재사용).
- `webapp/src/components/search/global-search.tsx` · `search-trigger.tsx` — 종목 검색 재사용(D-16). `webapp/src/components/layout/app-sidebar.tsx`(:181-186 분석 그룹) · `__tests__/app-sidebar.test.tsx` · `webapp/e2e/specs/sidebar-tree.spec.ts` — D-14.
- `webapp/src/lib/teamflow-report.ts`(`fmtEok` · `kstHm`) · `webapp/src/lib/limitup-report.ts`(`dateNavOf` · `parseYmdParam`) · `limitup-date-nav.tsx` — 날짜 알약 · 표기.
- `webapp/src/styles/globals.css` — `--up/--down/--team/--vi` 토큰(목업 사본과 같음) · [[feedback_lightweight_charts_oklch]].
- `packages/shared/src/accum-signal.ts` — kind 16 필드(D-02 라이브 등록 · D-15 오늘 목록 입력).

### 운영 제약 (CLAUDE.md · 메모리)
- `CLAUDE.md` 「공식 API 운영 기준」 3 호출량은 사용자 수와 독립(D-07) · 「gh-trade 인박스」 · 「배포 순서」. [[feedback_deploy_relay_before_push]] · [[feedback_sandbox_blocks_tcp_probes]](radar-gw 스모크는 `dangerouslyDisableSandbox`) · [[feedback_secret_injection_user_bang]](키 등록 · Secret 쓰기는 사용자 `!`) · [[project_market_hours_0800_2000]](radar-gw 변경 20:00 이후) · [[reference_gh_radar_deployer_sa]] · [[project_cloudrun_egress_roundtrip_cost]].

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`accum-chart.tsx` + `lib/accum-chart.ts`** — 3판 순수 SVG(가격 · 누적 · 10분 막대) · `useChartGestures`(휠 · 끌기 · 핀치 · 키) · `useChartWidth` · 툴팁 · 주문 원 — 뷰어 차트의 본(틱 커서 · 틱 가격 선 · VI 띠만 추가).
- **`components/orderbook/orderbook-ladder.tsx`** — 호가 10단 사다리(행 색 · 바 16% · `depth 10`) — 재생용 정적 호가(`RelayQuote` 대신 B6 재구성값)로 입력만 바꿔 쓸 수 있는지 리서치. `trade-tape.tsx` 체결 색 규칙(매수 빨강 · 매도 파랑).
- **보고서 3종 틀** — `AppShell` + `Suspense` + `useSearchParams` 페이지 · `DmaGate` · 날짜 알약(`limitup-date-nav`) · `fmtEok`/`kstHm` 표기 · KPI 띠.
- **`workers/limitup-sync`** — Cloud Run Job 뼈대(config · logger · manifest · grid Storage upload · purge 90일 · 알림 종료 코드) · `scripts/deploy-limitup-sync.sh`.
- **`infra/relay/limitup-pull/`** — radar-gw 전용 사용자 · ssh 키 · known_hosts 지문 · systemd 자원 상한 · 설치기 멱등 — 당일 경로 키 · (필요 시) 로컬 캐시 유닛의 본.
- **`global-search.tsx`** — 종목 검색(이름/코드 · 최근 검색).
- **`packages/shared`** — 순수 함수 + 테스트 자리(버스트 · 팀 · 손익 · 디코더 레이아웃 · 포맷터).

### Established Patterns
- 보고서 접근은 **RPC 안 게이트**(service_role 전용 · `dma_visible_accounts` · 403 `DMA_UNMAPPED`) — 웹 `DmaGate` 는 표시 장치(34 D-06).
- 적재는 **날짜 단위 교체 · 90일 purge · 알림은 Job 종료 코드**(28 · 34). 서버는 snake_case 통과(매퍼 없음).
- 차트는 **순수 SVG · 1:1 viewBox · 글자 11px 고정**(33 D-12 · 34 D-17) — lightweight-charts 는 oklch 거부.
- 값은 서버(gh-trade)가 정하고 웹은 표시만 — 이 phase 는 예외적으로 **gh-radar 가 A3 에서 직접 계산**하므로 **오라클 픽스처 · golden 대조**로 갈림을 막는다(D-20).
- radar-gw 는 gh-trade 와 공유 호스트 — 전용 사용자 · 키는 없을 때만 · 자원 상한 · 20:00 이후 변경 · 지우지 말 것 목록.

### Integration Points
- 라우트 `/analytics/ticks`(새 페이지) · 사이드바 「분석」 그룹(D-14) · 세 보고서 상세 머리 「틱 보기」(D-17).
- 서버: 새 라우트(격자 메타 · 격자 파일/서명 URL · 당일 요청 · 요청 변환 트리거 · 상태 폴링) · 새 RPC(게이트 + 날짜별 격자 목록) · 새 표(격자 메타 · 변환 상태).
- 워커: 새 Cloud Run Job `gh-radar-tick-convert`(밤 Scheduler + 요청 실행) · SA 에 `gs://gh-trade-tick-archive` objectViewer.
- radar-gw: 당일 경로 전용 사용자 · 키 · 119 등록(사용자) · (서버/relay 가 radar-gw 를 거쳐 119 에 닿는 경로는 리서치).
- 인박스: gh-trade `docs/inbox/from-gh-radar/YYMMDD-tick-viewer-contract.md`(D-21).

</code_context>

<specifics>
## Specific Ideas

- 사용자 ATMParser 스크린샷(행 = 전문 하나)은 **전문 목록 패널에만** 살리고 호가창은 사다리형 분리(로드맵 · 019).
- 「매집감지 규칙을 따르면 돼. 0/0 대신에도 팀매수 판정이 가능해」 — NXT 팀 판정은 서버 NXT 런 규칙(D-13).
- 변환 대상 「매집감지에 등록되어 있는 모든 종목 + 15% 이상 상승했던 모든 종목」(D-02) — 사용자가 직접 정한 범위.
- 「목업으로 보여줘」 → 진입 목업 A/B/C 즉석 제작 · A 채택(D-16). 목업 「변환 중 약 4분」 은 가정값 — Job 실측 뒤 문구 갱신.
- 금액 표기는 스케치 010 C 축약(억 · 만 · 주수 병기 없음) · 팀 보라 · VI 주황 · 매수 빨강 · 매도 파랑(한국 관례).

</specifics>

<deferred>
## Deferred Ideas

- **「상한가 창 버스트 비율」 2차 표시** — 로드맵이 선택 항목으로 둔 것. 뷰어 1차에는 넣지 않는다.
- **창구별 순매수 배분(`member_flow` 규칙) 뷰어 재계산** — D-11 에서 기각(추정값). 필요하면 export 값을 읽는 별도 작업.
- **우리 체결 「우리」 배지 · 제외 계산** — D-12 기각. 저널 80 조인은 후속.
- **전 종목 매일 변환** — D-02 기각(저장 과다). 요청 변환 사용 빈도 · 비용을 90일 보고 재검토.
- **폰 3판 차트 과함 여부 · 폰 B6 행 잘림** — 스케치 019·020 미결 · 실기기 UAT 에서 본다.
- **B9 · C3 수신 뒤집힘 표현** — 020 은 A3 ↔ B6 만 심었다. 실데이터에서 보이면 같은 `↕` 규칙 적용 여부 결정.
- **KRX+NXT 합산 팀 포지션 보기** — 뷰어는 거래소 하나씩(D-13). 합산 뷰는 별도.

</deferred>

---

*Phase: 37-tick-viewer*
*Context gathered: 2026-11-02*
