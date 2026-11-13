# Roadmap: gh-radar

## Milestones

- ✅ **v1.0 Launch** — Phases 1-29 (shipped 2026-10-11) · [아카이브](./milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 운영 유지보수** — Phases 30-33 (진행 중) · 버그 수정 · 자잘한 기능은 quick(phase 없음)

## Phases

**Phase Numbering:** 정수 phase 는 마일스톤 계획 작업, 소수 phase(2.1 …) 는 긴급 삽입(INSERTED). 번호는 마일스톤을 넘어 이어진다(v1.1 = 30부터).

<details>
<summary>✅ v1.0 Launch (Phases 1-29) — SHIPPED 2026-10-11</summary>

- [x] Phase 1: Data Foundation — 2026-04-13
- [x] Phase 2: Backend API — 2026-04-13
- [x] Phase 3: Design System — 2026-04-13
- [x] Phase 4: Frontend Scaffold — 2026-04-13
- [x] Phase 5: Scanner UI — 2026-04-13
- [x] Phase 05.1: Ingestion 운영 배포 (INSERTED) — 2026-04-14
- [x] Phase 05.2: Scanner 데이터 품질 (INSERTED) — 2026-04-14
- [x] Phase 6: Stock Search & Detail — 2026-04-16
- [x] Phase 06.1: stock-master-universe (INSERTED) — 2026-04-16
- [x] Phase 06.2: Auth + Watchlist (INSERTED) — 2026-04-16
- [x] Phase 7: News Ingestion — 2026-04-17
- [x] Phase 07.1: News description (INSERTED) — 2026-04-18
- [x] Phase 07.2: News rate-limit (INSERTED) — 2026-04-18
- [x] Phase 8: Discussion Board — 2026-04-18
- [x] Phase 08.1: Discussion Relevance Filter (INSERTED) — 2026-04-22
- [x] Phase 9: Daily Candle Data — 2026-05-12
- [x] Phase 09.1: Intraday Current Price (KIS → 키움) (INSERTED) — 2026-05-15
- [x] Phase 09.2: 종목 상세 일봉차트 (INSERTED) — 2026-05
- [x] Phase 10: Theme Classification — 2026-06-09
- [x] Phase 11: Co-movement Candidates — 2026-06-11
- [x] Phase 12: 상한가 다음날 이력 통계 — 2026-06-26
- [x] Phase 13: 홈 급등 테마 AI 분석 — 2026-07-02
- [x] Phase 14: AI 애널리스트 챗봇 — 2026-07-03
- [x] Phase 15: DMA 중계 서버(relay) — 2026-09-06
- [x] Phase 16: 트레이딩 메뉴(상따·VI·My page) — 2026-09-09
- [x] Phase 17: gh-trade 프로토콜 재동기화·래치 LED — 2026-09-21
- [x] Phase 18: 통합 트레이딩 작업대 — 2026-10-03
- [x] Phase 19: 계좌별 주문기록 전용 연결 — 2026-10-03
- [x] Phase 20: 호가주문 토스식 재구성 — 2026-10-03
- [x] Phase 21: GH Trade 모바일 앱 (Capacitor) — 2026-09-26
- [x] Phase 22: GH Trade 테스트 배포 (TestFlight · Firebase APK) — 2026-09-27
- ~~Phase 23: GH Trade Play 스토어 내부 테스트~~ — 2026-10-11 제거(Play 개발자 인증 대기 · 인증 뒤 새 phase)
- [x] Phase 24: 상따 매수주문 3종 분리 — 2026-09-29
- [x] Phase 25: 주문로그·잔량진행률 — 2026-10-03
- [x] Phase 26: 시세 전용 공유 연결 — 2026-10-01
- [x] Phase 27: 자동매도 연동 — 2026-10-10
- [x] Phase 28: 상한가 특징 연동 — 2026-10-10
- [x] Phase 29: DMA 다중 서버 · 웹 Admin 유저 관리 — 2026-10-11

</details>

### 🚧 v1.1 운영 유지보수 (진행 중)

**Milestone Goal:** gh-trade 인박스 open 2건의 계약을 relay·웹에 반영해 노트를 닫는다. CLAUDE.md 다이어트(DOCS-01)와 운영 버그·소규모 기능(MAINT)은 `/gsd-quick`·`/gsd-fast` 로 처리하고 phase 를 만들지 않는다.

- [x] **Phase 30: 인박스 KB 계좌별 주문자 IP/MAC** - relay R3-01(op 5 재조회) · 웹 Admin 계좌 편집 IP/MAC 입력칸 · 계좌명 편집 · code 13 문구 · 질문 3개 답으로 `261010-kb-order-ip-mac.md` 닫기 (completed 2026-10-11)
- [x] **Phase 31: 인박스 상따 금액 단위** - 생성물 마커 확인 · `lc.set` 금액 8필드 되싣기 · 84 `post_buy_floor_amount` · 「만(주)」 결정으로 `261011-limitchaser-amount-unit.md` 닫기 (completed 2026-10-12)
- [x] **Phase 32: 계좌 축 정리** - 작업대 계좌 스코프(전략·VI 계좌별) · 상단 줄 재설계(정규 배지·사운드 토글 제거, 시세·주문 축약, 계좌 선택) · /me 탭 위 계좌 칩(현황 · 잔고 · 주문 · 설정이 고른 계좌를 따름) · 매매설정 서버별(relay 42/84 serverKey) · VI 계좌별(relay 61 슬롯 · gh-trade Phase 33 뒤) (completed 2026-10-16)
- [x] **Phase 33: 팀 매집(teamflow) 보고서** - gh-trade `team_flow.ndjson.gz` export 적재(limitup-sync · 표 + payload) · 서버 RPC · `/analytics/teamflow` 목록(스케치 014 A 보고서 동형 · 기본 접힘) + 행 펼침 상세(스케치 015 C 차트 + 접힌 표) · 인박스 `261016-teamflow-export.md` 닫기 (completed 2026-10-16)
- [x] **Phase 34: 매집감지(accum) 보고서** - gh-trade `accum_flow.ndjson.gz` export 적재(limitup-sync 10번째 표 + payload · 재적재 감지 일반화) · 목록/상세 분리 RPC · `/analytics/accum` 목록 + 펼침 상세(순수 SVG 3판 차트 · 사이클 표 · 손익 · 판정 기준) · 10/19·10/20 소급 · 인박스 `261020-accum-flow-export.md` 닫기 (completed 2026-10-21)
- [x] **Phase 35: 발사 경계 지도 어드민** - gh-trade 16:00 예약 발사 · 09:00:30 개장차익 발사 결과(조각·머리)를 저널 80 kind 17·18 로 받아 DB 쪽 해석으로 `launch_heads`·`launch_pieces` 적재(relay 무변경) · 어드민 메뉴 날짜별 주문 내역 + 날짜 범위 발사 경계 지도(서버×시장 4패널 SVG) · 10/12~10/26 백필 · 인박스 `261027-launch-gate-admin.md` (completed 2026-11-01)
- [x] **Phase 36: 계좌별 주문가능 금액** - gh-trade Phase 41 계약(op 6 SetAccountBudget · op 7 SetAccountFee · 87/66/67 예수금 · 저널 손익 4필드) 반영 · 어드민 계좌 카드 예수금·수수료·매도세 · 웹 주문가능 표시·초과 경고 · 저널 손익 DB 적재 · 일자별 매매손익(`/admin/pnl` · `/me` 「손익」 탭) · 인박스 `261027-account-budget.md` · `261027-account-pnl.md` 닫기 (completed 2026-10-28)
- [x] **Phase 37: 틱 전문 뷰어** - KRX·NXT 전 종목 틱 단위 전문(호가 B6 · 체결 A3 · 거래원 B9 · VI R8 · 프로그램 C3)을 08:00~20:00 수신 순서대로 재생하는 `/analytics/ticks` 뷰어. 두 갈래 공급 — 당일 장중은 119 소형 인덱서 + radar-gw ssh 강제 명령 **종목 단위 요청형**(기록 1초 + 전송 · gh-trade 구현) · 과거 날짜는 `gs://gh-trade-tick-archive` 원본을 Cloud Run Job 이 tickana 디코더로 변환해 gh-radar 저장소에 적재. 슬라이더 · ms 시각 점프 · 좌우 키 틱 이동 · 그 틱 시점 호가창 · 전문 목록(수신순↔거래소순) · 체결 버스트(주문 묶기) · 거래대금 · 팀 거래정보(5창구 평균단가법). 목업 A/B/C 먼저 (completed 2026-11-04)
- [x] **Phase 38: 틱뷰어 우리 주문·체결 표시** - `/analytics/ticks` 체결 전문(A3)에 우리 팀 계좌(교보·KB 등 등록된 모든 계좌)가 낸 주문의 체결을 표시하고, 그 주문의 조건이 걸린 호가(B6)·체결(A3) 전문을 「이 주문은 이 전문을 보고 나갔다」 로 표시. 원천은 `dma_journal_events`(체결 E) · `dma_strategy_events` kind 3·6(조건 근거 ev_kind · cum_volume). 10/30 실측: 체결↔A3 짝짓기 401/406(98.8%) · 호가 근거 29/29 · 누적거래량 앵커 100/100. 목업 A/B/C 먼저 (completed 2026-11-03)
- [x] **Phase 39: 매매진단 챗봇** - 「왜 이 주문이 나갔나/안 나갔나」를 챗봇에 직접 묻는다. 기존 팀장 챗봇에 읽기 전용 「주문 진단」 전문가(`claude-opus-5-5`) 추가 — 저널 주문·체결 · 전략 이벤트 · 당일 틱 · kind 9 상태전이 조회, 계좌 범위는 `req.userId` 서버 강제. kind 9 43칸 매핑 노트를 gh-trade 인박스에 회신 → gh-radar 받는 쪽(DB · webapp) 먼저 배포 뒤 gh-trade 서버 켜기(relay 무변경). 시험 문항 11/5 13:10 금양그린파워 선매수(인박스 `261105-chatbot-diagnosis-kind9.md`) (completed 2026-11-09)
- [x] **Phase 40: 체결 앱 푸시 알림** - 주문이 체결되면 GH Trade 앱(iOS·Android)으로 푸시 1줄. 첫 체결 1건 + 전량 체결 1건(자동매도는 시작 1건 + 잔량 0 때 1건). relay 적용 행에서 판정·송신(iOS APNs 직접 · Android FCM v1 · 기존 Firebase 프로젝트). 설정 탭 「체결 알림」 토글(서버 저장) + 기기 토큰 등록. D-17(앱 안 Firebase SDK 없음) 번복 — Android 만. 트렐로 「체결시 어플알림」(yP2Q3UkZ) 검토 2026-11-06 (completed 2026-11-09)
- [x] **Phase 41: 한투 뉴스·공시 피드** - 한국투자증권 Open API 「종합 시황/공시(제목)」(`news-title` · tr_id `FHKST01011800`)으로 뉴스·공시 제목을 서버측 배치로 받아 기존 네이버 뉴스와 합치고, gh-radar 웹앱과 gh-trade(돌파감지 · 상따창)에 제공. 공시는 제공업체 코드 F(거래소 공시)·G(코스닥 공시). KRX F000 직수신은 범위 밖(느리면 후속). 키움 REST · 토스 API 에는 뉴스가 없음을 확인(2026-11-11). 트렐로 「키움api 뉴스가져와서 돌파에 띄우기」+「실시간 공시 반영」 (completed 2026-11-13)
- [x] **Phase 42: 틱뷰어 봉차트·이동평균·수익률 겹쳐보기** - `/analytics/ticks` 차트에 1분봉/5분봉 · SMA/EMA · 봉별 거래량 · 팀 당일 수익률 선 · 누적 평단 · 누적 수익률(미실현 기준)을 지금의 매집 레이어(팀 주문 원 · 당일 평단 · 순매수 계단)와 겹쳐 본다. 기존 차트는 건드리지 않고 새 차트를 따로 만들어 전환 스위치로 비교한 뒤 채택 여부를 정한다(되돌리기 = 새 파일 · 스위치 삭제). 목업 A/B 먼저 (completed 2026-11-13)
- [ ] **Phase 43: 공개매수 · 유상증자 · 합병 공시 텔레그램 알림** - 금감원 전자공시(DART)에 공개매수 유형 보고서(신고서 · 설명서 · 정정 · 의견표명서 · 결과보고서 전부)와 유상증자 · 합병 결정 주요사항보고서(코스피 · 코스닥)가 접수되면 텔레그램 단체방에 보고서마다 두 줄 알림 1건(보고서명 — 회사(종목코드) · 제출인 / DART 원문 링크 · 출처). 금감원 공식 OpenDART 공시검색을 공개매수(`pblntf_detail_ty=D004`) · 주요사항보고서(`B001`) 두 유형으로 서버측 고정 주기 폴링(장전 5초 · 그 밖 10초 · 하루 약 10,800회). 한투 API 는 이 공시가 오지 않고 KIND 는 DART 보다 같거나 늦어 제외(조사 · 실측 2026-11-12). 트렐로 「전자공시에서 공개매수 뜨면, 텔레그램 알림」(gNcHVLC3)

## Phase Details

### Phase 30: 인박스 KB 계좌별 주문자 IP/MAC

**Goal**: 운영자가 웹 Admin 에서 KB 계좌별 주문자 IP/MAC 을 안전하게 설정·수정할 수 있고, relay 밖에서 설정한 값이 웹 계좌 편집으로 지워지지 않는다(R3-01 해제 → KB 운영 서버 IP/MAC 설정 보류 해제)
**Depends on**: 없음 (relay 87 파서 · op 1/3 되싣기 · code 13 라벨은 29-47 에서 배포됨)
**Requirements**: IPMAC-01, IPMAC-02, IPMAC-03, IPMAC-04, IPMAC-05
**Success Criteria** (what must be TRUE):
  1. relay 밖(gh-trade 도구)에서 IP/MAC 을 설정한 계좌를 웹에서 이름만 바꿔 저장해도, op 5(ListUsers) 87 에 그 `order_ip`/`order_mac` 이 그대로 남는다(미설정 계좌는 빈 문자열)
  2. 웹 Admin 계좌 편집에 「주문자 IP」·「MAC 주소」를 `10.41.1.124`·`1c:fd:08:7d:97:8e` 로 저장하면 86 code 0 이고 목록이 사람이 읽는 표기 `10.41.1.124`·`1C:FD:08:7D:97:8E` 로 다시 그려진다(저장 · 비교는 정규화값 `010041001124`·`1CFD087D978E` — D-17 · 2026-10-11 갱신) — 같은 값 재저장은 「변경 없음」
  3. 한쪽만 적거나 형식이 틀리면 웹이 저장 전에 막고, 서버가 code 13 BAD_ORDER_ENDPOINT 를 내면 서버 문구가 그대로 보인다
  4. 입력칸 아래 도움말 한 줄(같은 서버의 두 계좌가 서로 체결될 수 있으면 서로 다른 사용자 PC 값)이 보인다
  5. 웹 Admin 계좌 카드 「편집」 에서 기존 계좌의 계좌명을 바꿔 저장하면 등록 서버마다 op 3 으로 반영되고(87 계좌명 갱신) 카드에 새 이름이 보인다
  6. 인박스 노트 `261010-kb-order-ip-mac.md` 에 질문 3개(code 7 문구 · 입력 표기 · `ipconfig /all` 수기 절차) 답이 적히고 `status: done` · `done_commit` 으로 커밋된다
  7. 같은 KB 계좌를 다른 DMA 사용자도 쓰면 그 계좌 「편집」 에 함께 쓰는 사용자 안내가 보이고, 저장 성공 뒤 그 사용자 카드도 새 IP/MAC 으로 다시 그려진다(D-18 · 2026-10-11 추가) — 서버 쪽 동시 반영은 gh-trade 261011 몫이라 실서버 저장 성공 확인은 gh-trade 배포 뒤(phase 완료를 막지 않는다)

**배포 순서**: DB 변경 없음 → relay(R3-01) 배포·확인(20:00 KST 이후) → server(Cloud Run — zod 가 `orderEndpoint` 를 버리므로 필수) → webapp push(= 프로덕션) — 백엔드 막히면 push 금지. 첫 배포 완료(2026-10-11 · relay:2234a1b5 · server 00061-fvv) — 갭 클로징(30-08 · 30-09)은 relay · server 무변경이면 webapp push 만
**Plans**: 9/9 plans complete
Plans:
**Wave 1**
- [x] 30-01-PLAN.md — (트레이서) orderEndpoint 쓰기 경로 Express → relay → op 3 · R3-01 op 5 재조회(D-15) · R3-02 다른 유저 IP/MAC 되싣기(D-16)
- [x] 30-02-PLAN.md — shared 규칙 한 벌: IP/MAC 정규화 · 검증 · 표시 판정(출처 · 불일치) · 계약 타입 · sameValues 정규화 비교

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 30-03-PLAN.md — 읽기 경로: relay GET /order-endpoints · Express GET /users 병렬 병합 · PUT 감사 플래그
- [x] 30-04-PLAN.md — 웹 계좌 카드 IP/MAC 읽기 줄 · 불일치 경고 · 「편집」 → 계좌명 저장 · 결과 줄(서버 문구 원문)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 30-05-PLAN.md — 웹 KB IP/MAC 입력칸 · 도움말 · 교보 해당 없음 · 클라 검증 · 원문 전송 · 「변경 없음」

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 30-06-PLAN.md — E2E P30(390 · 1080) · backstop 3종 · 전 워크스페이스 회귀 게이트

**Wave 5** *(blocked on Wave 4 completion)* — 갭 클로징(30-UAT gap 1)
- [x] 30-08-PLAN.md — (갭) IP/MAC 표시 표기(D-17): shared formatOrderIp · formatOrderMac · 읽기 줄 · 불일치 줄 · 편집 초깃값 · 양쪽 정규화 비교 · E2E 기대 갱신

**Wave 6** *(blocked on Wave 5 completion)* — 갭 클로징(30-UAT gap 2)
- [x] 30-09-PLAN.md — (갭) 공유 계좌 안내(D-18): shared findSharedAccountHolders · 편집 모드 「함께 쓰는 사용자」 줄 · 개요 결선 · 저장 뒤 재조회 · code 7 원문 · drift 고정 · E2E

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 30-07-PLAN.md — 배포(첫 배포 완료 기록 · 갭 클로징 webapp push) · 실서버 재확인(D-17 · D-18 · 공유 저장은 gh-trade 대기) · 인박스 261010 회신(① 261011 요청) · done

**UI hint**: yes

### Phase 31: 인박스 상따 금액 단위

**Goal**: 웹에서 상따를 재제출해도 C# 단말 칸에 사람이 넣은 만원 원값이 지워지지 않고, /me 기본설정에서 「후매수 최소」 금액을 보고 바꿀 수 있다
**Depends on**: Phase 30 (순서만 — 코드 의존 없음) · 외부: gh-trade `feature/limitchaser-amount-unit` master 병합 · 서버 배포(구 서버는 vtable 158~172 를 무시하므로 되싣기 실증은 배포 뒤)
**Requirements**: AMT-01, AMT-02, AMT-03, AMT-04
**Success Criteria** (what must be TRUE):
  1. `sync-relay-schema.sh --check` 가 gh-trade master 병합 마커 기준 「신규/변경 예정 0 개 · .fbs 사본 최신」을 낸다
  2. C# 상따창에서 만원을 넣은 종목을 웹에서 재제출해도 60 에코의 금액 8필드가 그 원값 그대로다(예: `sell_watch_amount: 100`) — 웹이 주를 바꿔 보내면 짝이 맞는 금액(`floor(만원×10000÷비교가) == 주`) 또는 0 이 실린다
  3. /me 기본설정에 「후매수 최소(만원)」가 84 값으로 보이고, 저장하면 42 12값 전체 교체로 84 에 그 값이 실리며 봉인 필드 `post_buy_floor_qty` 는 0 이다
  4. 「만(주)」 도입 여부가 인박스 노트 `261011-limitchaser-amount-unit.md` 질문 2개 답으로 적히고 `status: done` · `done_commit` 으로 커밋된다 — 도입하면 상따 수량 칸이 만원 입력 · 주 환산 표시(§10 규칙)로 바뀐다

**배포 순서**: gh-trade 서버 배포 확인 → DB 변경 없음 → relay → webapp push(= 프로덕션). AMT-04 결정이 범위를 정하므로 discuss 에서 먼저 답한다
**Plans**: 8/8 plans complete
Plans:
**Wave 1**
- [x] 31-01-PLAN.md — (트레이서) 매도 「매수잔량」 만원 한 칸 → lc.set 금액 · 산출 주 → relay → 10 → 60 에코 → 행 · 금액 8필드 계약(shared · relay zod/조립/파서) · §10 환산 한 벌
- [x] 31-02-PLAN.md — 표시 부품: 두 줄 행(56px · lc-row-sub) · 인라인 아래 줄 · 시트 환산 안내 줄(hint · 우선순위)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 31-03-PLAN.md — AMT-03: /me 「후매수 최소(만원)」 · 42 12값 · 봉인 0 · 84 금액 · 구 탭 84 캐시 되싣기
- [x] 31-04-PLAN.md — 수량 나머지 7칸 만원 입력 전환(모델 · cfg 8쌍 · 기본 0 · 상장주식수 만원 시딩 · 요약)
- [x] 31-05-PLAN.md — 주문로그 ⑦ 금액 표기 「N만(M주)」/「X.Y억(M주)」 · kind 1·2 ev_price 환산(D-19)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 31-06-PLAN.md — 화면 연결: 두 줄 행 · 파생 행 · 시트/인라인 환산 · 등록 차단 D-03/D-04 · 84 후매수 최소 시딩

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 31-07-PLAN.md — E2E P31(390 · 1080) · 폭/높이 백스톱 56/44 · 전 워크스페이스 회귀

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 31-08-PLAN.md — relay 배포(20:00 KST 뒤) · Vercel 미리보기(push 없음) · AMT-01 마커 · 인박스 2건 회신 · done

**UI hint**: yes

### Phase 32: 계좌 축 정리

**Goal**: 트레이딩 작업대와 /me 가 「고른 계좌 · 서버」 축으로 읽힌다 — 작업대는 고른 계좌의 전략·VI 만 보이고 상단 줄이 계좌 선택 중심으로 정리되며, /me 는 탭 위 계좌 칩으로 고른 계좌를 현황 · 잔고 · 주문 · 설정 네 탭이 함께 따르고, 매매설정은 그 계좌의 서버(gh-trade 게이트웨이)에 따로 보고 저장한다
**Depends on**: Phase 31 (순서만 — 코드 의존 없음) · 외부: 웨이브 ①~③ 은 gh-trade 와이어 변경 없음(UserSettings 는 서버마다 이미 `user_settings.toml` 에 따로 저장) · 웨이브 ④ 는 gh-trade Phase 33(61 `unregistered` · 21 → 계좌마다 61 · 인박스 `261016-vi-per-account.md` · 생성물 `ecd62f33`) · 2026-10-12 결정 「서버별 사용자 설정 저장 유지」와 일관
**Requirements**: AXIS-01, AXIS-02, AXIS-03, AXIS-04, AXIS-05
**Success Criteria** (what must be TRUE):
  1. 작업대에서 계좌를 고르면 전략 카드 격자 · VI 트리거 스트립 · VI 설정 행(웨이브 ④ — gh-trade Phase 33 뒤)이 그 계좌 것만 보이고, 계좌를 바꾸면 즉시 바뀐다(새 카드 기본 계좌 기능은 유지). 알림 토스트는 계좌와 무관하게 모든 계좌 것을 계좌 표시와 함께 띄우고, 누르면 그 계좌로 작업대 계좌가 바뀐다(32-CONTEXT D-03 · 2026-10-13 사용자 결정으로 「토스트만 보이고」 를 뒤집음)
  2. 작업대 상단 줄에 「정규」 배지와 사운드 토글이 없고, 계좌 선택 · 시세/주문 상태가 채택 목업 A 그대로 한 줄에 정리된다 — 알림음 켜고 끄기는 /me 설정 탭 「이 기기」 카드로 옮겨진다. E2E(trading-workbench · a11y aria-live · 단위) 가 새 구조로 통과한다
  3. /me 계정 카드 아래 · 탭 위 계좌 칩(상품명 · 번호 · 서버키 · `accounts[]` 순 + 행에만 있는 계좌)에서 고른 계좌를 현황 탭이 따른다 — 그 계좌의 전략 행 · VI 행(웨이브 ④ 전엔 그 계좌가 등록 계좌인 거래소만) · 상태줄 「상따 N건 · VI」 가 그 계좌 기준이고, 카드 맨 아래 「이 계좌 끄기」 가 그 계좌의 상따 · VI 만 끈다(relay `strategies.disable.account` · 14 건별 + 11 run:false · 65 집계 1건) · 「전체 비활성화」 는 없다(D-27)
  4. /me 잔고 · 주문 탭도 같은 칩을 따른다 — 잔고 = 그 계좌 한 벌(소제목 없음) · 주문 = 그 계좌 평탄 목록 · 「잔고 N」 · 「주문 N」 = 그 계좌 건수 · 칩 선택은 작업대와 따로 기기별 기억(Phase 16 D-21 전면 뒤집음 · 32-CONTEXT D-20 · D-22 · D-23)
  5. /me 설정 탭은 고른 계좌의 서버(서버키 칩 · 「이 계좌의 서버 {서버키} 에 저장돼요」)의 84 값을 보고 42 로 그 서버에만 저장한다 — relay `user.settings`/`user.settings.set` 에 `serverKey`, hub 84 캐시 `(userId, serverKey)`, `#fromPrimary` 필터 해제, 42 지정 서버 라우팅. 상따 폼 시딩은 카드 계좌의 소유 서버 설정을 읽는다. relay 단위 · E2E 통과, relay 배포(20:00 KST 뒤) 후 KB120 · KYOBO119 에서 서로 다른 값이 보인다

**배포 순서**: DB 변경 없음 → relay(20:00 KST 뒤) → webapp push(= 프로덕션). 웨이브 ① /me 계좌 칩 · 현황 · 잔고 · 주문(webapp 만 · 단독 push 가능) ② 작업대 계좌 스코프 · 상단 줄 A · 사이드바 · 토스트 · 「이 기기」 · 계좌별 끄기(relay 새 메시지 타입) ③ 매매설정 서버별(relay + shared + webapp) → ①~③ relay 배포 → push ④ VI 계좌별 — relay 먼저(20:00 KST 뒤) → gh-trade 서버(KB120 · 121 · 교보119) → webapp push
**Plans**: 14/14 plans complete

Plans:
**Wave 1**
- [x] 32-01-PLAN.md — 웨이브 ① /me 탭 위 계좌 칩 · 현황 탭 고른 계좌 · 라벨 한 벌 · /me 전체 비활성화 제거 (트레이서)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 32-02-PLAN.md — 웨이브 ① 잔고 한 벌 · 주문 평탄 목록 · 탭 라벨 숫자 · 목록 밖 계좌 칩 · ① 단독 push 결정 (트레이서)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 32-03-PLAN.md — 웨이브 ② 작업대 상단 줄 A · 「이 기기」 알림음 이전 (트레이서)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 32-04-PLAN.md — 웨이브 ② 작업대 계좌 스코프(숨김 주차 · pickAccount 3경로 · ISIN 경로) · 토스트 계좌 줄 (트레이서)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 32-05-PLAN.md — 웨이브 ② 사이드바 계좌 묶음 트리 (트레이서)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 32-06-PLAN.md — 웨이브 ② 계좌별 끄기 `strategies.disable.account` — relay 14 건별 + 11 run:false + 65 집계 · /me 「이 계좌 끄기」 (트레이서)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 32-07-PLAN.md — 웨이브 ③ 매매설정 서버별 relay · 계약 — hub 84 `(userId, serverKey)` · 42 지정 서버 · replay (트레이서)

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 32-08-PLAN.md — 웨이브 ③ 웹 서버별 84 `userSettingsByServer` · /me serverKey 저장 · 상따 폼 시딩 D-14b (트레이서)

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 32-09-PLAN.md — 웨이브 ③ /me 설정 = 고른 계좌의 서버 — 서버키 칩 · 「아직 못 받음」 · 캡션 · 칩 잠금 (트레이서)

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 32-10-PLAN.md — 웨이브 ①~③ 회귀 · 폭 백스톱 · relay(20:00 KST 뒤) → push · 라이브 UAT

**Wave 11** *(blocked on Wave 10 completion)*
- [x] 32-11-PLAN.md — 웨이브 ④ VI 계좌별 relay — D-17 checkpoint:decision · 슬롯 캐시 · `vi.slot` · 원천 · 가드 해제 (트레이서)

**Wave 12** *(blocked on Wave 11 completion)*
- [x] 32-12-PLAN.md — 웨이브 ④ 작업대 VI 설정 행 = 고른 계좌 슬롯 · 옮기기 제거 (트레이서)

**Wave 13** *(blocked on Wave 12 completion)*
- [x] 32-13-PLAN.md — 웨이브 ④ /me · 사이드바 VI 슬롯 · VI 줄 → 계좌 전환 · 웹 단일 칸 VI 상태 제거 (트레이서)

**Wave 14** *(blocked on Wave 13 completion)*
- [x] 32-14-PLAN.md — 웨이브 ④ relay 배포 · gh-trade 회신 · webapp push · 교보119 실증 · 인박스 닫기

**UI hint**: yes

## Progress

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 Launch | 37 | 432 | ✅ Shipped 2026-10-11 |
| v1.1 운영 유지보수 | 7 | — | 🚧 진행 중 |

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 30. 인박스 KB 계좌별 주문자 IP/MAC | v1.1 | 9/9 | Complete | 2026-10-11 |
| 31. 인박스 상따 금액 단위 | v1.1 | 8/8 | Complete | 2026-10-12 |
| 32. 계좌 축 정리 | v1.1 | 14/14 | Complete | 2026-10-16 |
| 33. 팀 매집(teamflow) 보고서 | v1.1 | 9/9 | Complete | 2026-10-16 |
| 34. 매집감지(accum) 보고서 | v1.1 | 13/13 | Complete | 2026-10-21 |
| 35. 발사 경계 지도 어드민 | v1.1 | 19/19 | Complete | 2026-11-01 |
| 36. 계좌별 주문가능 금액 | v1.1 | 10/10 | Complete | 2026-10-28 |
| 37. 틱 전문 뷰어 | v1.1 | 19/19 | Complete    | 2026-11-04 |
| 38. 틱뷰어 우리 주문·체결 표시 | v1.1 | 10/10 | Complete | 2026-11-03 |

### Phase 33: 팀 매집(teamflow) 보고서

**Goal**: gh-trade 119 밤 배치가 내보내는 `team_flow.ndjson.gz` 가 Supabase 에 적재되고, 「분석 › 팀 매집」 `/analytics/teamflow?d=YYYYMMDD` 에서 상한가 보고서(011 A)와 같은 틀로 하루 탐지 종목 목록(스케치 014 A 보고서 동형 · 기본 전부 접힘)과 행 펼침 상세(스케치 015 C 혼합 — 구간 가로 막대 · 거래원 2단 막대 · 10분 흐름 차트 + 접힌 표)가 읽힌다
**Depends on**: Phase 32 와 코드 의존 없음(순서만) · 외부: gh-trade `team-flow.md` §11 export(`batch.export_day` 가 manifest `files[]` 에 `team_flow.ndjson.gz` 추가 — radar-gw `limitup-pull` 은 export 디렉터리 전체를 미러하므로 운반 변경 없음) · 열 사전 정본 인박스 `docs/inbox/from-gh-trade/261016-teamflow-export.md` (2026-10-16 도착 — 열 사전 정본)
**Requirements**: TEAM-01, TEAM-02, TEAM-03, TEAM-04
**Success Criteria** (what must be TRUE):
  1. `gh-radar-limitup-sync`(21:20 KST) 가 manifest `files[]` 에 `team_flow.ndjson.gz` 가 있으면 같은 sha256 대조 · 날짜 단위 교체 규칙으로 `team_flow` 표(평평한 열 + `payload` jsonb)에 적재하고, 파일이 없는 날짜는 기존 표 6개 적재에 영향이 없다. 단위는 §11 그대로(ms epoch · 원 · 주 · 비중 0~1 · 등락률 % · NaN→null)
  2. 서버가 상한가 보고서와 같은 경로(RPC 1회 · DMA 게이트는 RPC 안(`dma_visible_accounts` → 403 DMA_UNMAPPED · 라우트는 인증만 — D-05))로 날짜 목록 · 종목 행 · 상세 payload 를 내주고, 사이드바 「분석」 에 「팀 매집」 항목이 생긴다
  3. `/analytics/teamflow` 목록 = 날짜 알약 → KPI 4칸(탐지 · 팀 순매수 종목 · 상한가 도달 · 팀 순매수 합) → 종목 행(결과 · 팀 순매수 · 20% 아래/위 · 매수 중 팀 · 구간별 순매수 9칸 미니막대) · 상한가 도달 「상한가 HH:MM」 / 미도달 「+NN.N%」 태그 · 행 클릭 시 그 자리 아코디언(한 번에 하나 · **기본 전부 접힘**) · 폰 390 은 2줄 카드형 행
  4. 펼친 상세 = 요약 문장 → [구간 가로 막대 | 거래원 2단 막대] 2열(폰 1열) → 10분 흐름 차트(순매수 막대 + 매수 중 팀 % 선 + 등락률 범위 띠 · 최대 매집 창 음영 · 첫 상한가 세로선) → 판정 기준 접힘. 차트 규칙 = 중앙 0선 · + 빨강/− 파랑 · 20% 점선 · 팀 비중 ≥ 30% 보라 · 수치는 `<title>` 툴팁. 구간 차트 아래 「구간표 보기」 · 10분 차트 아래 「10분 표 보기」 접힌 표(기본 접힘). 팀 체결이 거의 없는 종목(동양고속형)도 빈 차트가 깨지지 않는다
  5. 단위 · E2E(limitup-report 동형 fixture) 통과 · 10/14 실측 3종목으로 라이브 UAT · 인박스 `261016-teamflow-export.md` 를 `status: done` 으로 닫는다

**배포 순서**: DB 마이그레이션(표 · RPC · RLS 정책 0개 · service_role 전용 · REVOKE 명시(D-06)) → limitup-sync Job 재배포(`scripts/deploy-limitup-sync.sh` · 21:20 KST 밖) → server → webapp push(= 프로덕션). radar-gw 변경 없음. 첫 적재는 119 export 에 `team_flow.ndjson.gz` 가 실린 날짜부터
**Plans**: 9/9 plans complete

Plans:
**Wave 1**
- [x] 33-01-PLAN.md — (트레이서) 10/14 픽스처 → 워커 선택 파일 stage → commit_day 7번째 표 → teamflow_report_for_user → /api/teamflow/report → /analytics/teamflow 행(기본 접힘) · 펼침 요약 + pgTAP 이미지 승인(Wave 0)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 33-02-PLAN.md — (트레이서) 재적재 자동 감지(D-03 · 이력 rows.team_flow ≠ manifest) · pgTAP 적재 확장 + 보고서 RPC · 스모크 INV-8

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 33-03-PLAN.md — (트레이서) 목록 완성: 변환 모듈 · KPI 4칸 · 9칸 미니막대 · xl 7열/폰 카드 · --team 토큰

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 33-04-PLAN.md — (트레이서) 사이드바 「분석 › 팀 매집」 · 게이트 직접 진입 · 목록 E2E(1280 · 390) · 폭 백스톱 T1~T3

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 33-05-PLAN.md — (트레이서) 상세 ① 구간 가로 막대 · 구간표 · 판정 기준 · 거래원 2단 막대(2열 · 폰 1열)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 33-06-PLAN.md — (트레이서) 상세 ② 10분 흐름 39칸 고정축(key 93 → 15:20 칸 합산) · 10분 표

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 33-07-PLAN.md — (트레이서) 상세 E2E · 폭 백스톱 T6 · T8 · 전 워크스페이스 회귀 게이트

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 33-08-PLAN.md — 백엔드 배포(메인 세션): [BLOCKING] supabase db push(pgTAP 미실행이면 사용자 승인) → limitup-sync 재배포(20:55~21:25 밖) → radar-gw 낮 운반 1회 · Job 즉시 실행 · 스모크 INV-8 → server

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 33-09-PLAN.md — git push(= webapp 프로덕션) · 라이브 UAT 10/14 · 인박스 261016-teamflow-export done · TEAM-02 문구 정합

**UI hint**: yes

### Phase 34: 매집감지(accum) 보고서

**Goal**: gh-trade 119 밤 배치가 내보내는 `accum_flow.ndjson.gz` 가 Supabase `limitup_accum_flow`(PK `(date, isin)` · 평평한 열 37 + `payload` jsonb · 90일 purge)에 적재되고, 「분석 › 매집감지 보고서」 `/analytics/accum?d=YYYYMMDD` 에서 그날 매집감지 종목(장중 등록·청산 · 이월 · 06:00 탈락/만료 포함) 목록과 행 펼침 상세 차트(10초 가격 선 · 팀 매수/매도 원 · `first` 팀매수 시작 표식 · `day_cum_net` 순매수 누적 계단 · 사이클별 등록/청산 세로선 · 등록 전 음영)가 읽힌다. 「KYOBO119 판정 기준」 표기 · kind 16 과 join 하지 않음(이 표가 이력 정본)
**Depends on**: Phase 33(limitup-sync 선택 파일 적재 · teamflow 차트 부품) · 외부: gh-trade Phase 36(`master 7cb31d87` · 119 서버 + 119 tickana 배포) · 열 사전 정본 인박스 `docs/inbox/from-gh-trade/261020-accum-flow-export.md` (2026-10-20 도착)
**Requirements**: TBD
**Success Criteria** (초안 — discuss/plan 에서 확정):
  1. `limitup-sync`(20:30 KST)가 manifest `files[]` 의 `accum_flow.ndjson.gz` 를 team_flow 와 같은 sha256 대조 · `limitup_commit_day` 날짜 단위 원자 교체로 적재하고, 파일이 없는 날짜는 6표·team_flow 에 영향이 없다. 재적재 감지(이력 rows ≠ manifest)가 accum_flow 로 일반화된다
  2. 서버가 목록(평평한 열만)과 상세(한 종목 `payload` — 최대 json ≈ 224KB)를 분리된 RPC/라우트로 내준다. DMA 게이트는 teamflow 와 같은 경로
  3. `/analytics/accum` 목록 = 날짜 알약 → 종목 행(상태 매집중/매도중/종료 · 「이월 D+n」 · `end_reason` 청산/이월 탈락(복원 안 됨)/이월 만료 · `pos_*` KPI · `day_net_krw`) · 행 펼침 시 상세 지연 로드
  4. 상세 차트 7요소 + `first` 표식(범례 「팀매수 시작」) · 09:00 이전 등록은 09:00(`price.t0_ms`)에 맞춤 · 15:30~16:00 빈 칸 정상 · 팀 체결 없는 종목도 깨지지 않음
  5. 소급: gh-radar DB kind 16(KYOBO119)을 날짜별 JSON lines(인계 노트 「소급 목록 파일 형식」 23키 · `since_date`/`reg_time` 문자열)로 맥 `~/ticks/accum-backfill/<D>.jsonl` 에 내보낸다(10-19 · 필요 시 10-20) → gh-trade 가 119 로 옮겨 배치 → files_sig 자동 재적재
  6. 단위 · E2E 통과 · 첫 실물 날짜 라이브 UAT · 인박스 `261020-accum-flow-export.md` 를 `status: done` 으로 닫는다

**배포 순서**: DB 마이그레이션 → limitup-sync Job 재배포(20:30 밖) → server → webapp push(= 프로덕션). 119 배치가 20:20 을 넘기면 radar-gw `limitup-pull.timer` 20:30 · limitup-sync CRON 20:40 으로 함께 미룬다(D-09 조건부 합의)
**Plans**: 13/13 plans complete

Plans:
**Wave 1**
- [x] 34-01-PLAN.md — 트레이서 전반: 10/14 6행 픽스처 → 워커 선택 파일 목록화 → commit_day 10번째 쌍 → 목록/상세 RPC(전 마이그레이션 재생)
- [x] 34-02-PLAN.md — 소급 내보내기 도구: kind 16 → 23키 JSON lines(읽기 전용 · 페이지네이션 · 비출력 래퍼)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 34-13-PLAN.md — 트레이서 후반(wave 2): shared 타입 → GET /api/accum/report 목록/상세 → /analytics/accum 목록 · 펼침 지연 로드 · KPI 줄 · 픽스처 → 화면 전 층 판정

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 34-03-PLAN.md — 워커 재적재 감지 일반화(accum_flow_backfill) · 탐지 0 manifest 적재

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 34-04-PLAN.md — 목록 완성: KPI 4칸 · 배지 묶음 · 종료 사유 · 흐림 · 결과 태그 · 폰 3줄 · sr 설명
- [x] 34-05-PLAN.md — SQL 회귀: pgTAP accum_report(신규) · limitup_load 섹션 K · 스모크 INV-9

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 34-06-PLAN.md — 상세 차트 정적 레이어(순수 SVG): 가격 · 팀 원 · first · 누적 계단 · 10분 막대 · 세로선 · 음영 · 토큰

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 34-07-PLAN.md — 차트 조작: 프리셋 · 창 범위 · 휠/트랙패드 · 끌기 · 핀치 · 키보드 · 범례 · 캡션

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 34-08-PLAN.md — 상세 부속: 사이클 표(2개↑) · 팀 당일 손익 · 판정 기준 · 출처 칩

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 34-09-PLAN.md — 실브라우저 상세 경로 E2E · 사이드바 「분석 › 매집감지 보고서」

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 34-10-PLAN.md — 폰 390 · 폭 백스톱 6종 · 전 워크스페이스 회귀 게이트

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 34-11-PLAN.md — [BLOCKING] db push → Job 재배포 → 소급 실행 · gh-trade 전달 → 운반 · 적재 · 스모크 → server(메인 세션)

**Wave 11** *(blocked on Wave 10 completion)*
- [x] 34-12-PLAN.md — webapp push · 10/19 · 10/20 라이브 UAT · 인박스 회신 done

**UI hint**: yes

### Phase 35: 발사 경계 지도 어드민

**Goal**: gh-trade 서버(KB120 · KYOBO119)의 매일 **16:00 예약 발사(Q16)** 와 **09:00:30 개장차익 발사(N · A)** 결과가 조각(1행/주문 조각)·머리(1행/발사) 단위로 gh-radar DB 에 쌓이고(서버 쪽은 하루치만 남으므로 gh-radar DB 가 유일한 이력 저장소), 웹 **어드민 메뉴** 에서 ① 날짜별 발사 주문 내역(머리 + 조각 표 · 16:00 / 09:00:30 전환) ② 날짜 범위를 묶은 **발사 경계 지도**(서버 × 시장 4패널 · x = 송신 시각 µs · 접수/101·515/기타 점 · 그날 경계 띠 · 「쐈다면」 리본 · 다음 오프셋 선)를 본다. 채널은 관찰자 저널(80) StrategyEvent **kind 17 LaunchPiece · 18 LaunchHead**(관찰자 전용 append · 와이어 무변경) — relay 는 kind 를 해석하지 않고 43칸 원문을 `dma_strategy_events` 에 넣으므로 **relay 무변경**, 해석·upsert 는 DB 쪽(`dma_strategy_apply` 또는 트리거)이 `launch_pieces` · `launch_heads` 로 푼다. 10/12~10/26 은 첨부 `pieces.json` 등 ndjson 을 1회 적재 스크립트로 백필
**Depends on**: Phase 29(웹 Admin · requireAdmin) · Phase 34(순수 SVG 차트 부품 · 날짜 알약) · 외부: gh-trade 정식 계약 인계 노트(kind 17·18 칸 매핑 표 — 이 phase 의 상의 답은 2026-10-27 gh-trade-cc 에 회신) · 인박스 `docs/inbox/from-gh-trade/261027-launch-gate-admin.md`(상의, 2026-10-27 도착) · 첨부 `261027-launch-gate-admin-attach/launch-gate-map.html`(목업 출발점)
**Requirements**: TBD
**Success Criteria** (초안 — discuss/plan 에서 확정):
  1. 목업 2화면(날짜별 주문 내역 · 경계 지도)을 gh-radar 웹 톤으로 다시 그려 사용자 확인 → 계좌·사용자 열 노출 여부 결정 → gh-trade 에 회신(정식 인계 노트 전)
  2. DB: `launch_heads` · `launch_pieces`(논리 키 trade_date · gateway · profile · market · wire — 최신 seq 우선 upsert 로 재생 멱등) + kind 17·18 을 푸는 DB 쪽 해석 · 사용자 전략 이벤트 json 래퍼에서 17·18 제외 · 15·16 purge 에 포함시키지 않음(이력 정본)
  3. server: 어드민 전용 라우트(requireAuth → requireAdmin) 2개 — 날짜별 내역 · 날짜 범위 지도 데이터(RPC 1회)
  4. webapp: 사이드바 Admin 그룹에 메뉴 추가 · 두 화면(또는 탭) · 순수 SVG 4패널 · 폰 390 가로 스크롤
  5. 백필: ndjson(풀린 필드명) → `launch_pieces` 1회 적재 스크립트(머리는 조각에서 계산) · 10/12~10/26 적재 후 첨부 지도와 대조 일치
  6. 첫 실물 날짜 라이브 UAT(16:00:01 이후 relay 적재 → 어드민에 당일 행) · 인박스 `261027-launch-gate-admin.md` 및 후속 정식 인계 노트를 `status: done` 으로 닫는다
  7. **(범위 추가 2026-10-27 · 사용자 결정) 발사 계획 어드민** — 인박스 `261027-launch-plan-admin.md`(gh-trade Phase 43). 서버(KB120 · KYOBO119) × 발사(16:00 Q16 · 09:00:30 N) × 시장(코스피 · 코스닥) 칸마다 16:00 은 「조각 수 + 조각별 발사 시각 µs 목록(같거나 커지는 순서)」, 09:00:30 은 「시장별 µs 한 값」 을 고쳐 저장(admin 44 새 op · 서버 재기동 없이 다음 발사부터 · 발사 직전 저장은 그다음 발사부터 — 응답 문구로 안내). 경계 지도로 바로 가는 길. **목업 → 사용자 승인 → gh-trade Phase 43 정식 인계 노트(op · 필드 · code) 뒤 구현.** 노트 질문 2개(저장 전 미리보기 · 변경 이력 DB 보관)는 목업에서 결정. kind 17·18 정식 매핑(Wave B)도 같은 Phase 43 노트로 온다 — kind 18 Q16 학습값 칸은 빠지거나 뜻이 바뀌고 `next_offset_us` = 그 시점 발사 계획 첫 조각 시각

**배포 순서**: gh-trade 서버 먼저 배포해도 안전(relay 는 모르는 kind 도 그대로 적재) → gh-radar DB 마이그레이션 → server → webapp push(= 프로덕션). relay 재배포 없음(fbs enum·주석 sync 만). **범위 7(발사 계획 어드민)은 relay 배포 필요** — gh-trade 43 배포 확인 → DB(이력 표) → relay → server → webapp push(D-30 · 35-18 메인 세션) · 노트 전 플랜(35-12~15)은 로컬 커밋만(D-35)
**Plans**: 19/19 plans complete

Plans:
**Wave 1**
- [x] 35-01-PLAN.md — gh-trade 핸드오프(백필 ndjson 지금 · kind 17·18 매핑 요구) · 상의 노트 회신 (W1 · 메인 세션 체크포인트)
- [x] 35-02-PLAN.md — DB 트레이서 전반: launch_pieces/heads · 조건부 upsert · 백필/어드민 RPC 2 + pgTAP (W1)
- [x] 35-03-PLAN.md — shared group() 이식 · 백필 머리 계산 · relay 백필 도구 · CLI(dry-run/--apply/--status/--reproject) (W1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 35-04-PLAN.md — dma_strategy_apply 재정의(17·18 투영 서브블록 · rows 제외) · 스텁 · reproject · 래퍼/타임라인 제외 + pgTAP 회귀 (W2)
- [x] 35-05-PLAN.md — 어드민 라우트 2개(orders · map) · 사이드바 「발사」 (W2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 35-06-PLAN.md — /admin/launch 주문 내역 탭(16:00 · 09:00:30 · 폰 390) · 발사 색 토큰 (W3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 35-07-PLAN.md — 경계 지도 패널: 기하 lib + 순수 SVG(점 · 띠 · 점선 · 리본 · 마름모 · 이상치) (W4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 35-08-PLAN.md — 경계 지도 탭 조립(프리셋 칩 · 요약 카드 · 4패널) + 전체 회귀 게이트 (W5)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 35-09-PLAN.md — Wave A 배포: [BLOCKING] db push → 백필 적재 → server → push → 백필 UAT (W6 · 메인 세션)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 35-10-PLAN.md — Wave B: 정식 인계 노트 게이트 → kind 17·18 칸 매핑 + pgTAP · shared kind/라벨 sync (W7 · 노트 조건부)
- [x] 35-12-PLAN.md — 범위 7 노트 전: shared 발사 계획 계약 · 검증/「쐈다면」 판정 + 변경 이력 표 · RPC 2 + pgTAP (W7 · 로컬 커밋만)

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 35-11-PLAN.md — Wave B 배포: 매핑 db push · reproject · 라이브 UAT · 두 노트 닫기 — 범위 7 커밋 미배포면 push 는 35-18 로 넘기고 완료 (W8 · 메인 세션)
- [x] 35-13-PLAN.md — 범위 7 노트 전: server GET/PUT /api/admin/launch/plan (relay 계약 · 이력 기록 · 가짜 relay) (W8 · 로컬 커밋만)
- [x] 35-16-PLAN.md — 범위 7 노트 뒤: 정식 노트 op 대조 게이트 → relay op 8/9 · 스냅샷 94 · admin-conn request_id 짝 (W8 · 노트 조건부)

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 35-14-PLAN.md — 범위 7 노트 전: 웹 읽기 — 「다음 발사 계획」 줄 · 조각마다 점선 · 대신 값 · 변경 이력 + E2E (W9 · 로컬 커밋만)

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 35-15-PLAN.md — 범위 7 노트 전: 웹 쓰기 — 편집 칸 A · 미리보기 P2 · 저장/결과 + E2E 회귀 게이트 (W10 · 로컬 커밋만)

**Wave 11** *(blocked on Wave 10 completion)*
- [x] 35-17-PLAN.md — 범위 7 노트 뒤: relay GET/PUT /internal/admin/launch-plan · LaunchPlanService · interpretAdminResult 8/9 · Phase 36 겹침 순서 규칙 (W11)

**Wave 12** *(blocked on Wave 11 completion)*
- [x] 35-19-PLAN.md — 범위 7 노트 뒤: D-32 머리 카드 「다음 발사 계획 첫 조각」 · D-34 범위 상수 노트 대조 + 범위 7 전체 회귀 (W12 · 35-17 에서 분리)

**Wave 13** *(blocked on Wave 12 completion)*
- [x] 35-18-PLAN.md — 범위 7 배포: gh-trade 43 확인 → DB → relay → server → push · 라이브 UAT(D-33) · 인박스 261027-launch-plan-admin 닫기 (W13 · 메인 세션)

### Phase 36: 계좌별 주문가능 금액

**Goal**: gh-trade Phase 41 계약 두 인박스(`docs/inbox/from-gh-trade/261027-account-budget.md` · `261027-account-pnl.md` · fbs SYNC 7824e51b — 44 `AdminCommandReq` op 6 SetAccountBudget · op 7 SetAccountFee · 87 `AdminAccount` `budget_krw`·`fee_ppm`·`sell_tax_ppm` · 66/67 `AccountState.budget_krw` · 80 `JournalRecord` 말미 손익 4필드)을 받아 ① **어드민이 계좌별 예수금(와이어 `budget_krw` · 원 · 화면 만원) · 수수료(%) · 매도세(%)를 설정**하고(등록 서버 전부 fan-out · 서버별 칩 · 서버별 다름 · op 3 뒤 서버 간 되싣기 · DB 의도 저장 없음 — 87/67 정본), ② **웹 주문 화면(계좌 패널 · /me 잔고 탭 · 수동주문 폼 · 상따 카드)이 「주문가능 금액」을 실시간 표시**하며 초과는 경고만 하고(차단 · alert 없음), ③ 서버가 체결마다 실현손익·수수료·세금만큼 조정한 예수금을 66/67(한도 전용 67 포함) **마지막 값으로 덮어** 보이고, ④ 저널 손익 4필드(`avg_price`·`fee_krw`·`tax_krw`·`realized_pnl_krw`)를 DB 에 적재해 **「일자별 매매손익」**(`/admin/pnl` 전 계정·계좌 · `/me` 「손익」 탭 내 계좌)을 보여 준다. 주문가능 = `budget_krw − Σ(avg_price × stock_qty) − Σ(매수 미체결 unfilled_qty × price)` — 매도 미체결 제외 · 매수는 KRX·NXT · 예약 요약 · 접수대기 포함 · `pending_cancel_sent` 제외 · price 0 이면 현재가(없으면 0, 상한가 금지) · 0 = 미설정 「—」 · 표기 만원 내림 콤마(억 없음) · 음수는 「0만」 빨강. 화면 용어는 「한도」 대신 「예수금」(같은 것)
**Depends on**: Phase 29(웹 Admin · useFieldSave · 서버별 칩) · Phase 30(op 3 IP/MAC 되싣기 · 서버 간 불일치 선례) · Phase 31(shared 환산 한 벌) · Phase 32(계좌 축 · /me 계좌 칩 · 주문 서버 소유 필터 29-35) · Phase 34(행 펼침 보고서 선례) · 외부: gh-trade Phase 41(KB120 · 교보119 2026-10-27 20:42 배포 완료 · v1.0-893-g2d5bc207 — 구 서버는 op 6/7 에 code 1) · 인박스 `261027-account-budget.md` + `261027-account-pnl.md` · fbs SYNC 7824e51b
**Requirements**: TBD
**Success Criteria** (discuss 2026-10-27 확정 · 범위 확장 ③④ 반영):
  1. 목업 확인 — 완료(D-00 · `reference/mockup-account-budget.html` · ①~④ 그대로 · ⑤ 일자별 매매손익 A 안)
  2. relay: 44 op 6/op 7 송신(account_no + `budget_krw` / `fee_ppm`·`sell_tax_ppm` · user_id 미사용) · 86 code 0/5/8/10/11 + 1(구 서버 · 범위 밖 「서버 미지원」 · message 원문) · 87 `budget_krw`·`fee_ppm`·`sell_tax_ppm` 파싱 · 66/67 `budget_krw` 마지막 값 덮기(한도 전용 빈 벡터 델타 · 1~2초 재전송 · 재접속 캐시 유지) · 저널 손익 4필드 파싱 · op 3(op 1 신규 첫 계좌 포함) 성공 뒤 서버 간 op 6/7 되싣기 · op 6/7 결과는 반영 칩 기록(`dma_admin_results`) 밖
  3. server/shared: 어드민 쓰기 경로 2종(PUT budget · fee · requireAdmin) · 개요 응답에 서버별 예수금·비용률(67 live 우선 · 87 폴백 · op 5 스로틀) · bigint ↔ JSON(number · 안전 범위) · 주문가능 계산·표기·% ↔ ppm 은 shared 한 벌
  4. DB: `dma_journal_events` bigint 4열(기본 0) · `dma_journal_apply` 재정의(4키 적재 · 옛 이벤트 0) · 일자 집계 RPC 2종(어드민 계정별/계좌별 · /me 가시성 조인 · 호출 1회 · `exec_qty::bigint` · REVOKE anon/authenticated)
  5. webapp: 어드민 카드 「예수금 · 수수료 · 매도세」 상시 행(즉시 저장 · 서버별 칩 · 서버별 다름 · 범위 검증) · 계좌 패널 요약 줄 「주문가능 / 예수금」 · 수동주문 「주문가능」 행 + 초과 검증 줄 · 상따 금액 합산 경고 · `/admin/pnl`(계정별 | 계좌별) · `/me` 「손익」 탭 — 웹과 WinForms 클라가 같은 숫자
  6. 라이브 UAT(설정 → 86 code 0 · 87 · 67 한도 델타로 웹 즉시 갱신 · 같은 값 재전송 「변경 없음」 · 체결 뒤 저널 4값 → 매매손익 행) · 인박스 `261027-account-budget.md` · `261027-account-pnl.md` 를 `status: done` 으로 닫는다

**배포 순서**: gh-trade 서버는 이미 배포(말미 append · 구 서버 op 6/7 = code 1) → gh-radar DB 마이그레이션(`supabase db push --linked --yes` · 08:00~20:00 KST 밖) → relay(20:00 KST 뒤 · 메인 세션) → server → webapp push(= 프로덕션 · relay 뒤). relay 는 append-only 라 gh-trade 와의 순서 무관
**Plans**: 10/10 plans complete

Plans:
**Wave 1**
- [x] 36-01-PLAN.md — 트레이서: D-16 생성물·노트 경로 지정 커밋 · frames 복구 · 66/67 예수금 → hub 덮기 → shared 계산 → 계좌 패널 요약 줄

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 36-10-PLAN.md — shared 계약(순수 계약 플랜): 어드민 비용(op 6/7 해석 · 서버별 비용 · summarizeAccountCosts) · 표기 · ppm · 상따 합 · 매매손익 타입·기간

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 36-02-PLAN.md — relay 어드민: op 6 예수금 PUT → dispatcher fan-out → 44 → 86 (트레이서) · op 7 비용률 · 87 3필드 파싱
- [x] 36-03-PLAN.md — server+web 어드민 카드: 예수금 칸 저장 경로(트레이서) · 수수료·매도세 · 범위 · code 1 · 상태 6종 · 불일치 줄 · E2E
- [x] 36-06-PLAN.md — 주문가능 경고: 수동주문 「주문가능」 행 + 초과 검증 줄(트레이서) · 상따 금액 합산 경고

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 36-04-PLAN.md — 현재값 공급: 67 live · 87 → GET account-costs → 개요 costs(트레이서) · op 5 스로틀 · op 3 뒤 서버 간 되싣기
- [x] 36-05-PLAN.md — 저널 손익 4필드 → DB (D-15 one-way 체크포인트 → 트레이서: 파서 · apply 이벤트 · 4열 · apply 재정의 · pgTAP)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 36-07-PLAN.md — 매매손익 집계: /me RPC → GET /api/pnl(트레이서) · 어드민 RPC → GET /api/admin/pnl · pgTAP

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 36-08-PLAN.md — 매매손익 화면: /me 「손익」 탭(트레이서) · /admin/pnl · 사이드바 · E2E + 전체 회귀 게이트(멈춤 기준)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 36-09-PLAN.md — [BLOCKING] db push → relay → server → push · 라이브 UAT · 두 인박스 닫기 (메인 세션)

**UI hint**: yes

### Phase 37: 틱 전문 뷰어

**Goal**: 트레이더가 **KRX·NXT 어느 종목이든** 08:00~20:00 의 틱 단위 전문(호가 B6 · 체결 A3 · 거래원 B9 · VI R8 · 프로그램 C3)을 **실제 수신 순서대로 재생**하며 한 틱의 호가창 · 앞뒤 전문 · 체결 버스트 · 거래대금 · 팀 거래정보를 본다. 공급은 두 갈래(gh-trade-ac 와 합의 2026-11-02): ① **당일 장중 = 종목 단위 요청형** — 119 에 기록기와 분리된 소형 인덱서(코어 0 · nice)가 오늘 `.pcap` 꼬리를 (거래소, ISIN) 별로 쪼개 두고, radar-gw 가 ssh 강제 명령 키(tickarc · limitpull 선례)로 「isin · exchange · from_ns · to_ns → 원본 전문 바이트 + recv_ns + 거래소 라벨」 zstd 스트림을 받는다(지연 = 기록 1초 + 전송 · 동시 1~2건 · 응답 크기 상한 · stock-dma · relay 계약 무변경 · 119 구현은 gh-trade). ② **과거 날짜 = GCS 원본 클라우드 변환** — 매일 22:00 부터 올라오는 `gs://gh-trade-tick-archive/raw/<krx|nxt>/<D>/` pcap.zst(하루 4.5GB · 6,900만 건)를 Cloud Run Job 이 정본 디코더(gh-trade tickana `pcap2parquet` 레이아웃)로 변환해 gh-radar 저장소(종목·날짜 격자)에 적재, 119 부하 0. 화면: 상단 종목 · 날짜 · 거래소 선택, 08:00~20:00 슬라이더 + ms 시각 입력 점프 + 키보드 좌우 틱 이동, 그 틱 시점 호가창 10단(msg_seq 순 재구성), 앞뒤 전문 목록(종류 배지 · **수신순 ↔ 거래소순 토글** 또는 뒤집힘 표시 — A3/B6 는 다른 멀티캐스트 그룹이라 최대 수십 ms 뒤집힘), 체결 버스트(주문 묶기 = 같은 종목 A3 msg_seq 직전 +1 · bs 동일 · 모양 A SMP ∪ B 0/0 단독 ∪ C0 = 팀 · 나머지 일반 · 단일가 제외 — 정본 gh-trade `krx-a3-zero-quote.md` §2·§4 · `team-flow.md` §4), 거래대금(A3 cum_value), 팀 거래정보(5창구 교보·한국·유진·신한·NH · 당일 순매수 · 누적 · 당일 평단 · 평단 대비 수익률 — `team-flow.md` §5-1 평균단가법을 gh-radar 가 A3 에서 직접 계산 · 지난 export `payload.pnl` 과 golden 대조 · 창구별은 B9 스윕 차분 ≈1분 해상도 · 호가 걸어둔 팀 주문은 안 보여 최소치라는 한계 표기). 서버 `burst_upper_limit` 은 상한가 벽 전용이라 범용 버스트 기준으로 쓰지 않는다(2차로 「상한가 창 버스트 비율」 표시만 선택). 참고 스크린샷: 사용자 ATMParser(행 = 전문 하나 표) — 전문 목록 패널에만 살리고 호가창은 사다리형 분리
**Depends on**: Phase 28(radar-gw ↔ 119 rrsync 운반기 · GCS 버킷 · Cloud Run Job 적재 선례) · Phase 33·34(보고서 행 펼침 · 순수 SVG 차트 · export 적재 일반화) · 기존 `components/orderbook`(사다리 · 체결 테이프 색 규칙) · 외부: gh-trade 119 인덱서 + 조회 강제 명령(계약은 discuss 뒤 `scripts/trade-handoff.sh` 인박스로 — gh-trade-ac 2026-11-02 「계약 초안이 오면 그 기준으로 잡겠다」) · `gs://gh-trade-tick-archive` objectViewer(relay SA 보유 · 변환 Job SA 는 추가 바인딩 필요)
**Requirements**: TBD
**Success Criteria** (discuss 2026-11-02 확정):
  1. 목업 검토 · 채택 완료 — 019 D · 020 A+3 · 진입 A(`reference/mockup-ticks-entry.html`). 폰 3판 과함 여부만 실기기 UAT 에서 재확인(미결 유지).
  2. gh-trade 계약 인계(`scripts/trade-handoff.sh` 인박스 — D-21 항목) · 119 인덱서 배포 뒤 radar-gw 에서 당일 종목 하루치 조회 실측(응답 크기 · 지연 · 이어받기).
  3. 과거 변환 Job — 10/30 선별 종목(매집감지 등록 + 15%↑) 변환 시간 · GCS 읽기 비용 실측 · 종목·날짜 격자 적재 · 당일 밤 자동 · 요청 변환 경로(그 종목만 · 약 N분) 실측 · 90일 purge.
  4. 웹 뷰어 `/analytics/ticks` — 당일(요청형 · 서버 캐시 · 자동 증분)과 과거(격자)가 같은 화면 · DMA 게이트 · 팀 손익 golden 대조 통과(export `payload.pnl`) · 버스트 판정 tickana `classify_orders` 와 일치(KRX) · NXT 런 규칙 오라클 일치 · 세 보고서 「틱 보기」 · URL 딥링크(틱 시각까지).

**배포 순서**(D-22): DB(격자 메타 표 · RPC · 게이트 — `supabase db push --linked --yes` · 08:00~20:00 KST 밖) → 변환 Job(Cloud Run Job + Scheduler · GCS objectViewer 바인딩) → server(과거 경로 · TICKGW 없이) → webapp push(= 프로덕션) — 메인 세션(37-16). 당일 경로(radar-gw tickgw · server TICKGW_URL · 승격 Job)는 gh-trade 119 인덱서 배포 확인 뒤 20:00 KST 이후에만(37-17) · 그 전 화면은 「당일 자료 준비 중」.
**Plans:** 19/19 plans complete

Plans:
**Wave 1**
- [x] 37-01-PLAN.md — gh-trade 계약 인계(D-21 인박스 ①~⑤) · 사람 결정(격자 저장처 Supabase 플랜 · D-19 비종목 태그 범위) · fzstd legitimacy 확인
- [x] 37-02-PLAN.md — shared 디코더 트레이서: 오라클 픽스처 → 레코드 프레이밍 · LAYOUTS 이식 → pcap2parquet 골든 일치(D-19)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 37-03-PLAN.md — shared 판정 · 손익: classify_orders 주문별 일치(트레이서) · NXT 런 179/65 · 182/70 · 평균단가법 천일 10/14 export 골든(D-20)
- [x] 37-04-PLAN.md — DB: 격자 메타 · 요청 큐 · 실행 기록 · 게이트 RPC · 90일 purge · pgTAP(트레이서 = upsert → 하루 목록 · 열기)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 37-05-PLAN.md — shared 뷰어 모델: 레코드 인덱스 · 거래소순 순열 · 뒤집힘 · 마지막 B6 호가(트레이서) · 시각 · 밀도 · VI · 5창구
- [x] 37-06-PLAN.md — 변환 Job tick-convert 뼈대: request 모드(트레이서) · 업로드 판정(NOT_UPLOADED · partial)
- [x] 37-07-PLAN.md — server 과거 경로 API: open(게이트 · 서명 URL · 트레이서) · day · today · 요청 변환 트리거(should_trigger 일 때만)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 37-08-PLAN.md — 진입 화면 목업 A: 격자 목록 → 열기(트레이서) · 검색 피커 · 변환 흐름 · 상태 카드 · 사이드바 · e2e
- [x] 37-09-PLAN.md — radar-gw tickgw: 키당 폴러 · 원본 프레임 캐시 · 내부 live HTTP(트레이서) · 호출 규율 · 20:01 마감 마무리(closed 만 export) · 설치/배포 스크립트(tickpull uid · OOM 500)
- [x] 37-18-PLAN.md — 변환 Job nightly(트레이서 — 평일/휴장 · 최신부터 · 시간 예산 · 단일 통독 스테이징 · 15%∪등록 · 90일 purge) · Dockerfile · IAM/배포/스모크 스크립트

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 37-10-PLAN.md — 뷰어 골격: 서명 URL → fzstd → 세션 → 점프 → 호가 10단 → URL t(트레이서) · 슬라이더 · 키 · e2e 딥링크
- [x] 37-11-PLAN.md — 세 보고서 「틱 보기」: 팀 매집 RPC t20_ms → 알약(트레이서) · 매집감지 · 상한가
- [x] 37-12-PLAN.md — 20:00 승격 모드: tickgw export(closed 키) → 완결 재확인 → 승격 격자(트레이서 — 하루치 전체 또는 없음) · 승격 Job/Scheduler 20:10 · 20:40(당일 경로 켜질 때만)
- [x] 37-15-PLAN.md — 당일 경로 server: /api/ticks/live 중계(트레이서 — 게이트 60초 캐시 · 바이트 그대로) · CORS X-Tick-* · deploy-server 조건부 env

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 37-13-PLAN.md — 전문 목록 020 A+3: 행 그룹 · 고정 높이 창(트레이서) · 뒤집힘 표현 · 이 주문 · 거래대금 카드

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 37-14-PLAN.md — 3판 차트 · 팀 패널: minViewMs 일반화 · 커서 · 클릭 점프(트레이서) · 팀 레이어 · KPI · 5창구

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 37-19-PLAN.md — 당일 경로 웹: /api/ticks/live 하루치 → 세션 → 끝 틱(트레이서) · 폴링 규율 · 새 틱 배지 · 끝으로 · e2e(당일 · 미결선)

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 37-16-PLAN.md — [BLOCKING] db push → Job(10/30 실측) → server → push · 요청 변환 실측 · 라이브 UAT (메인 세션)

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 37-17-PLAN.md — 당일 경로 켜기: gh-trade 회신 대기 → 어댑터 반영 → radar-gw tickgw(20:00 뒤) → server 스위치 · SC 2 실측 · 당일 UAT (메인 세션)

### Phase 38: 틱뷰어 우리 주문·체결 표시

**Goal**: 트레이더가 틱뷰어(`/analytics/ticks`)에서 **우리 팀 계좌가 낸 주문의 체결이 어느 A3 전문인지**, 그리고 **그 주문의 조건이 어느 호가(B6)·체결(A3) 전문을 보고 걸렸는지**를 전문 목록·차트에서 바로 본다 — 「이 주문은 이 전문을 보고 나갔다」. 원천(2026-11-03 이전 세션 실측 — 다시 재지 않는다): ① 우리 체결 = `dma_journal_events`(exec_qty > 0 · notice_type 'E' — gateway · gw_time · account_no · order_no · isin · exchange · side · exec_price · exec_qty, 게이트웨이 전 계좌 기록 D-11, 계좌 가시성 `dma_account_access` · `dma_visible_accounts(p_user_id)`). 기록이 있는 게이트웨이는 **KB120 · KYOBO119 뿐**(KB121 · KYOBO127 은 10/30 · 11/3 모두 0행 — 「모든 계좌」는 relay/gh-trade 저널 연결 선행). ② 조건 근거 = `dma_strategy_events` kind 3 · 6(주문) — gw_time_ms · order_no · reason_code · cond_metric/threshold/actual · ev_kind(1 호가 · 2 체결 · 3 체결통보 · 0 없음) · ev_price · ev_qty_before/after · ev_trade_qty · cum_volume(그 거래소 누적거래량). 표시명 정본 `packages/shared/src/strategy-event-labels.ts`. ③ A3 에는 계좌 · 주문번호 · 체결번호가 없다 — cum_volume 은 레이아웃 offset 113 · 12자(`packages/shared/src/ticks/layouts.ts`)에 있으나 `A3Columns`(record-index.ts)에 열이 없어 추가 필요. 짝짓기 규칙(10/30 KRX 4종목 + NXT 1종목 격자 실측): 같은 가격 · A3 남은 수량 ≥ 체결 수량 · (gw_time − A3 체결시각) ∈ [−200, +1500]ms 중 가장 가까운 것, 배정한 만큼 A3 수량 차감 → 406건 중 401건(98.8%) · 시각차 p50 0~35ms · p95 ≤ 714ms. 약 40% 는 「큰 A3 의 일부」(A3 = 공격 주문 × 가격 단 합산 → 「우리 n주 / 전체 m주」 표기) · 약 25% 는 20ms 안 같은 가격 후보 둘 이상(「추정」 표시 검토). 조건 근거 ↔ 전문: 호가 근거(ev_kind 1)는 그 시각 −3s ~ +50ms 안 B6 중 ev_price 단 잔량 == ev_qty_after → 29/29 · 체결 근거(ev_kind 2) 단건(스윕 등)은 정확, 주기매도는 「누적 before → after 구간」 집계라 구간 표시 · cum_volume > 0 이벤트는 100/100 같은 누적거래량 A3 존재 → 「주문 직전 마지막 체결」 위치 확정 · 수동 주문 · 장전(cum 0)은 근거 없음 → 주문 시각 위치만. 당일(live) 경로도 저널이 장중 DB 에 바로 쌓이므로 가능.
**Depends on**: Phase 37(틱 전문 뷰어 — `webapp/src/lib/ticks/tick-session.ts` · `msg-rows.ts` · `components/ticks/tick-msg-list.tsx` · `tick-chart.tsx` 툴팁 `lib/ticks/tick-chart-tip.ts` · server `/api/ticks/*` · RPC `tick_*_for_user`, 37-17 당일 경로 완료 뒤) · Phase 32·36(계좌 가시성 `dma_visible_accounts` · 「오늘 주문」 카드 계좌 규칙) · Phase 35(저널 80 kind 적재 선례) · Cloud Run 왕복 비용 — 체결 · 조건 근거 다중 조회는 RPC 1회로 · 외부(범위에 들면): KB121 · KYOBO127 저널 연결은 gh-trade/relay 작업(`scripts/trade-handoff.sh`)
**Requirements**: TBD
**Success Criteria**:
  1. 목업 검토 · 채택 완료 — 표시 모양(전문 목록 행 배지 / 왼쪽 띠 / 차트 표식 등)은 HTML A/B/C 목업으로 사용자가 고른다.
  2. 우리 체결 ↔ A3 짝짓기 — 10/30 격자 실측 기준 **≥ 98%** (401/406 재현) · 「우리 n주 / 전체 m주」 부분 체결 표기 · 20ms 안 동가 후보 복수면 「추정」 표시 · 짝 없는 체결은 주문 시각 위치로 표시(누락 0).
  3. 조건 근거 전문 특정 — 호가 근거(ev_kind 1)는 B6 **29/29** 재현(ev_price 단 잔량 == ev_qty_after) · 체결 근거 단건 정확 · 주기매도 구간 표시 · cum_volume 앵커 **100/100** 으로 「주문 직전 마지막 체결」 A3 확정 · `A3Columns` 에 cum_volume 열 추가.
  4. 과거(격자)와 당일(live) 경로 같은 화면 · 계좌 가시성은 discuss 결정(`dma_visible_accounts` 권고)대로 서버측 강제 · 체결 · 조건 근거는 RPC 1회로 묶어 Cloud Run 왕복 최소.
  5. (discuss D-03 로 뜻 변경 · 2026-11-03) 대상 게이트웨이 = 어드민에서 켜진 서버(`dma_servers.enabled = true`) 전부 — 하드코딩 없음 · RPC 가 레지스트리와 조인해 켜진 서버 행만 돌려준다. KB121 · KYOBO127 은 꺼져 있어 빠지고 어드민이 켜면 자동 포함된다. gh-trade 인박스 요청 없음 · 「기록 없는 게이트웨이」 안내 없음(「우리 주문」 표 캡션에 그날 켜진 서버 목록만).

**미결 결정(discuss 에서 사용자에게 — phase 추가 때 정하지 않음)**: ① 계좌 가시성: 「오늘 주문」 카드와 같은 계좌 규칙(`dma_visible_accounts` · 권고) vs 모든 DMA 사용자에게 전 계좌. ② KB121 · KYOBO127 포함 여부(저널 연결 선행 = gh-trade/relay 작업). ③ 표시 모양: 전문 목록 행 배지 / 왼쪽 띠 / 차트 표식 등 — HTML A/B/C 목업으로. → 2026-11-03 discuss 로 전부 결정(38-CONTEXT D-01 · D-03 · 목업 B 둘째 레일).
**Plans:** 10/10 plans complete

Plans:
**Wave 1**
- [x] 38-01-PLAN.md — 트레이서: RPC tick_own_for_user 1회 → GET /api/ticks/own → 브라우저 matchOwnFills → 전문 목록 우리 체결 행 칩 「n/m」 · --mine 토큰(D-01 · D-03 · D-14 · D-15)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 38-02-PLAN.md — shared 10/30 오라클: A3Columns.cumVolume · 창 픽스처 생성기(로컬 사본 · 익명화 · --check) · 짝짓기 401/406 · 추정 108 재현(트레이서 = 생성기 → 픽스처)
- [x] 38-03-PLAN.md — RPC · 라우트 잠금: pgTAP 전체(가시성 · 어드민 · 켜진 서버 켜면 포함 · 필터 · 모양 — 트레이서) · /api/ticks/own supertest
- [x] 38-04-PLAN.md — 웹 주문 줄 · 짝 없음 줄(MSG_ITEM ORDER/NOFILL · 두 순열 · 트레이서) · 둘째 레일 14px · 줄 선택 · 당일 대기

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 38-05-PLAN.md — shared 조건 근거 · 앵커: locateEvidence B6 29/29(트레이서) · 체결 단건 2 · 구간 9 · 앵커 100/100

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 38-06-PLAN.md — 웹 근거 마디 ○ ◌ · 구간 점선 · 카드 ◆ 우리 주문 섹션 보기 ›(트레이서) · 「우리 주문」 표 · 근거 역참조 · 되돌아가기

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 38-07-PLAN.md — 차트 ◆ · 추정 · ◇ · 근거 ○ · 클릭 이동(트레이서) · 툴팁 우리 체결 줄 · 범례

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 38-08-PLAN.md — 화면 맨 위 제목 줄 「◆ 우리 체결 k/n ‹ ›」 · 키 [ ](트레이서) · 당일 「최신 받기」 1회 = live 1 + own 1

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 38-09-PLAN.md — e2e: 과거 흐름(트레이서) · own 실패 내성 · 당일 버튼 1회 · 폰 390 · 37 회귀

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 38-10-PLAN.md — 전체 회귀 → [BLOCKING] db push(20:00 뒤) → server(라이브 env) → push · 프로덕션 UAT (메인 세션)

### Phase 39: 매매진단 챗봇

**Goal**: 사용자가 「왜 이 주문이 나갔나 / 안 나갔나」를 운영자 중계 없이 gh-radar 챗봇에 직접 묻는다. 기존 팀장 챗봇(Phase 14 — Anthropic Messages API tool use, 팀장 Sonnet 5 + 전문가 5, `server/src/services/chat-orchestrator.ts`)에 **읽기 전용 「주문 진단」 전문가** 하나를 추가한다. 전문가 안의 도구(전부 조회 전용): ① 저널 주문·체결(`dma_journal_orders_for_user_json` · `dma_order_events_for_user`) ② 전략 이벤트 — 발주 사유 줄 · 조건 실측값(`dma_strategy_events_for_user_json`, kind 3·6 등) ③ 당일 시세 구간(tickgw/indexer — `/api/ticks/today` 경로, 오늘은 tickgw · 지난 날짜는 격자 또는 변환 요청 — D-12) ④ 상태전이 kind 9 조회(gh-trade 구현 뒤). 계좌 범위는 기존 RPC 와 같이 `p_user_id = req.userId` 로 서버가 묶는다 — 모델이 계좌를 고르지 못한다(공유 계좌 상호 노출은 운영자 결정 2026-11-05 로 허용 · 웹 조회 RPC 범위 그대로). 지식: `docs/trading-rules.md` · `docs/strategy/limit-chaser.md` 요약, 「단일가 체결 bs 공백 `' '` = 선매수 A3 판정·누적 제외」, 「0/0 조각 = 한 주문의 마지막 아닌 조각」(gh-trade `docs/analysis/krx-a3-zero-quote.md`). 진단 전문가 모델은 **`claude-opus-5-5`**(사용자 결정 2026-11-05 · env `CHAT_DIAGNOSIS_MODEL` · thinking 항상 켜짐이라 `output_config.effort` 를 명시 · 강제 `tool_choice` 금지) — 팀장·다른 전문가는 Sonnet 5 유지. **kind 9 「상태전이」** 43칸 매핑 노트를 `scripts/trade-handoff.sh` 로 gh-trade 인박스에 회신(1차: 설정 변경 이력(누가·언제·어느 그룹 ON/OFF·주요 값 전후) + 서버 자동 꺼짐/켜짐(선매수 1회 발주 뒤 꺼짐 · 마스터 해제 · 줄매수 재체크 · 후매수 잠금해제 · 위험도 래치), 사람/서버 구분은 kind 하나에 `reason_code` 로 · 진입 래치·게이트 차단·VI 미발주 사유는 2차) → gh-trade 가 서버를 구현하되 켜는 건 gh-radar 배포 뒤(relay 는 kind 를 거르지 않아 서버가 켜지면 바로 적재·푸시된다 — gh-radar webapp 을 먼저 배포한 뒤 gh-trade 서버를 켠다 · relay 무변경 · 사용자 결정 2026-11-05). 근거 인박스 `docs/inbox/from-gh-trade/261105-chatbot-diagnosis-kind9.md`.
**Depends on**: Phase 14(챗봇 팀장·전문가 구조 · SSE agent_start · `SPECIALIST_TOOL_NAMES`) · Phase 25(주문로그 RPC `dma_strategy_events_for_user_json` · `strategy-event-labels.ts`) · Phase 32·36(계좌 가시성 `dma_account_access` · `dma_visible_accounts`) · Phase 37·38(당일 틱 경로 `/api/ticks/today` · 체결↔A3 짝짓기) · 외부: kind 9 서버 구현은 gh-trade(인박스 회신 뒤) · Cloud Run 왕복 비용 — 진단 조회는 RPC 1회로 묶는다
**Requirements**: TBD
**Success Criteria**:
  1. 시험 문항 「11/5 13:10 금양그린파워 선매수 왜 나갔어?」(milles · KB120)에 챗봇이 ① 발주 사유 = `PreBuy A3 스윕호가변경` 임계 3(체결량 조건 아님) ② 13:10:29.302 VI 해제 단일가 160,463주 는 bs 공백이라 판정 제외 ③ 13:10:25 설정 재제출로 선매수가 다시 켜졌음(kind 9) — 셋을 모두 답하면 통과. kind 9 적재 전에는 ①·② 까지.
  2. 진단 도구는 전부 읽기 전용 · 계좌 범위는 `req.userId` 서버 강제 · 모델 입력에 계좌 선택 인자 없음 · 다른 사용자 계좌는 조회 불가(테스트).
  3. 진단 전문가는 `claude-opus-5-5` · 나머지는 `claude-sonnet-5` 유지 · `[chat] usage` 로그에 모델별 토큰이 남는다.
  4. kind 9 매핑 노트가 gh-trade 인박스에 `status: open` 으로 올라가고 gh-radar 가 받는 쪽(DB 가시성 RPC · webapp 주문로그 탭 「상태전이」 표시)을 먼저 배포한 뒤 gh-trade 가 서버를 켜면 relay 가 무변경으로 그대로 적재한다(웹 먼저 · 사용자 결정 2026-11-05). 와이어 무변경(StrategyEventKind 값만 채움).
  5. 챗봇 질의 비용은 사용자 수와 독립인 조회 RPC 만 — 원본 스크래핑·on-demand fetch 없음(CLAUDE.md 운영 기준).

**미결 결정(discuss 에서)**: ① 진단 전문가를 팀장의 도구 하나로 둘지(agent-as-tool · 기존 패턴) vs 「매매진단」 별도 대화 모드로 둘지. ② 당일 틱 조회를 전문가가 직접 부를지(기간·종목 인자) vs 이벤트 시각 ±N초 자동 첨부로 제한할지. ③ kind 9 2차 범위(진입 래치·게이트 차단·VI 미발주)를 이번 phase 에 넣을지. ④ 지난 날짜 시세 범위 — **해소(D-12): 지난 날짜도 연다**(격자 있으면 읽고 없으면 변환 요청 · 오늘은 tickgw).
**Plans:** 9/9 plans complete

Plans:
**Wave 1**
- [x] 39-01-PLAN.md — kind 9 매핑 노트 초안(43칸 · reason_code 대역 · 웹 먼저 배포 · 트레이서) → 사용자 검토(costly) → gh-trade 인박스 발송 · 인박스 261105 done · ROADMAP 배포 순서 정정
- [x] 39-02-PLAN.md — shared kind 9 「상태전이」: 라벨 · 사유 사전 · case 9 문장(트레이서) · tone state · strategyEventSide kind 9 null
- [x] 39-03-PLAN.md — RPC dma_diagnosis_for_user 1회(주문 · 체결 · 이벤트 · kind 9 · 트레이서) + pgTAP 전체(어드민 우회 없음 · 꺼진 서버 · 모양)
- [x] 39-04-PLAN.md — 시세 엔진: 지난 날짜 격자 → A3/B6 한 줄(트레이서 · 골든) · 오늘 tickgw · 변환 요청 · 자료 없음 사유 · 토큰 실측

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 39-05-PLAN.md — 진단 전문가 코어: Opus 5.5 루프 → get_order_log → RPC(트레이서) · 가드 · 하루 상한 · usage 로그 · 팀장 도구 등록 · search_stock · 계좌 범위 테스트

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 39-06-PLAN.md — 웹: 주문로그 「상태전이」 칩 · 회색 줄(트레이서) · 진행 표시 「주문 진단 전문가」 · 틱 보기 링크 같은 탭
- [x] 39-07-PLAN.md — 팀장 연결: 진단문 SSE 그대로 · 저장 일치(트레이서) · get_market_ticks 배선 · 모델별 usage · opt-in 실 API 스크립트
- [x] 39-08-PLAN.md — 지식 프롬프트: 선매수 판정 표 · bs 공백 규칙 원문 → system 블록(트레이서) · 나머지 매매 규칙 · kind 9 사전

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 39-09-PLAN.md — 전체 회귀 → [BLOCKING] db push(20:00 뒤) → server(조상 확인) → git push(웹 먼저) → gh-trade 알림 → UAT 시험 문항 ①·② (메인 세션)

### Phase 40: 체결 앱 푸시 알림

**Goal**: 주문이 체결되면 창을 안 보고 있어도 폰 앱(GH Trade iOS·Android)으로 **한 줄 푸시**가 온다 — 「종목 · 매수/매도 · 구분(선매수/줄매수/후매수/호가매도/수동/VI/자동매도) · KRX/NXT · 체결가 · 체결량/주문량 · 시각」. 보내는 때는 **주문 1건당 첫 체결 1건 + 전량 체결 1건**(첫 체결에 다 찼으면 1건) · 버스트 체결은 한 주문이라 그대로 묶임 · 자동매도는 시작(그룹 9 발동) 1건 + 잔량 0 때 1건. 송신 지점은 relay 의 저널 적용 결과(`writer.on("applied")` · [index.ts:501](relay/src/index.ts#L501)) — 주문·판정 로직 무변경이 구조적으로 보장되고(gh-trade 서버 밖), 보내기 실패는 주문에 영향 없음. 계좌→사용자는 기존 `accountsOf`·`userIdOf`. 송신: **iOS 는 APNs 직접**(HTTP/2 · .p8 키 · Secret Manager · 앱에 Firebase iOS SDK 없음) · **Android 는 FCM HTTP v1**(기존 Firebase 프로젝트 `gh-radar` · VM 서비스계정 역할로 키 파일 없이). 앱: `@capacitor/push-notifications` 8.x · iOS Push capability·entitlements · Android `google-services.json` + Firebase Messaging → **D-17 번복(Android 만)** — `.gitignore` · 위생 검사 (8) · Gradle 세 곳 조정 · 양 플랫폼 앱 재릴리스(`native:release`). 웹: `/me` 설정 탭 「체결 알림」 토글(**서버 저장** — 「이 기기」 카드의 localStorage 와 다름) · 앱 안에서만 권한 요청·토큰 등록 · 권한 거부 시 안내. DB: 기기 토큰 · 알림 설정 · **송신 로그(주문 id · seq 멱등)** — 응답 유실 재시도가 같은 행을 다시 돌려주고(WR-09) relay 재기동 커서 재생이 있어 중복 송신 방지 필수. 첫/전량 판정은 적용 행에 이전 상태가 없으므로 RPC 가 이전 상태를 돌려주거나 relay 가 주문별 직전 상태를 든다. 비용 0원(APNs·FCM 무료 · 사용자 5명 미만 · 하루 수십 건). 월 추가 서비스 없음. 근거: 트렐로 「체결시 어플알림」(https://trello.com/c/yP2Q3UkZ) 검토 2026-11-06 — 카드의 「텔레그램/카카오」 선택지는 앱 푸시로 닫음.
**Depends on**: Phase 19(관찰자 저널 · `dma_journal_apply` · applied 팬아웃) · Phase 21·22(Capacitor 앱 셸 · Firebase 프로젝트 D-17 · 릴리스 스크립트 · 위생 검사) · Phase 25(전략 이벤트 그룹 라벨 `ORDER_GROUP_LABELS` · kind 11 자동매도 발동) · Phase 29(`AppAccess.userIdOf` · 계좌 가시성) · Phase 32(`/me` 설정 탭) · 외부: Apple APNs Auth Key 발급(사용자 `!` 실행) · Firebase 콘솔 Android 앱 `google-services.json` 받기
**Requirements**: TBD
**Success Criteria**:
  1. 앱에서 「체결 알림」 을 켠 사용자의 계좌에 체결이 나면 iOS·Android 각각 3초 안에 한 줄 푸시가 오고, 탭하면 주문로그 화면이 열린다. 부분 체결 여러 조각은 첫 1건 + 전량 1건만 온다(테스트: 3조각 체결 → 2건).
  2. relay 재기동(커서 재생) · 적용 RPC 재시도(WR-09) 뒤에도 같은 체결로 두 번 보내지 않는다(송신 로그 멱등 테스트).
  3. 주문·판정 경로(`order-api` · 전략 · gh-trade 서버) diff 0 · 송신 실패(APNs 410 · FCM UNREGISTERED · 네트워크)는 로그 + 토큰 정리만 하고 저널 적용·팬아웃을 막지 않는다.
  4. 토글이 꺼진 사용자 · 다른 사용자 계좌의 체결은 오지 않는다(계좌 범위 테스트). 푸시 본문에 계좌번호 원문 없음(T-19-14 동형).
  5. 앱 안 Firebase 는 Android 만 — iOS 번들에 Firebase SDK 없음 · 위생 검사가 Android `google-services.json` 을 허용하되 비밀 목록(Firebase SA 키 등)은 종전대로 막는다. 양 플랫폼 `native:release` 통과.

**미결 결정(discuss 에서)**: ① 거부·취소도 보낼지 — 권고: 거부는 보냄 · 취소는 안 보냄. ② 자동매도 「잔량 0」 정의 — 자동매도 주문들의 미체결 잔량 0(전량 체결 또는 취소 확인) vs 계좌 보유 0. ③ 첫/전량 판정 방식 — RPC 가 이전 상태 반환 vs relay 메모리 직전 상태. ④ 설정 단위 — 사용자 1개 토글(모든 기기) vs 기기별. ⑤ 소리·배지 — 기본 소리만 · 장중 묶음(iOS 알림 그룹 thread-id = 종목) 여부.
**Plans:** 13/13 plans complete

Plans:
**Wave 1**
- [x] 40-01-PLAN.md — DB 기기 · 체인 · 송신 로그 · 전달 결과 표 4 + 기기 RPC 4 + 결과 보고 RPC(토큰 인계 · 토큰 일치 삭제) · pgTAP (W1)
- [x] 40-02-PLAN.md — shared 문안 정본 `pushMessageOf` · 탭 경로 · 스케치 029 C 안 7종 골든(계좌 칸 없음) (W1)
- [x] 40-03-PLAN.md — 앱 셸 공통: `@capacitor/push-notifications@8.1.3` · 포그라운드 배너 · 「설정 열기」 브리지 3곳(웹 · Android · iOS) (W1)
- [x] 40-04-PLAN.md — [사용자] 외부 준비물: App ID Push · APNs 키(.p8) · Android google-services.json (W1 · 체크포인트)
- [x] 40-13-PLAN.md — iOS Push 셸: `App.entitlements`(aps-environment) · pbxproj 두 구성 · AppDelegate 2 메서드 · 시뮬레이터/IPA 검사 단언 · Fastfile `GHTRADE_FORCE_PROFILE` (W1 · 40-03 에서 분리)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 40-05-PLAN.md — DB 판정 RPC `dma_push_claim`(체인 · 단계 · 짝 대기 · 당일 · 자동매도 · 수신자 · 멱등) · 3조각 → 2건 · 재생 0 pgTAP (W2)
- [x] 40-06-PLAN.md — relay `PushNotifier`(fanout 뒤 리스너 · 정착 400ms · 단일 비행 · 수신자 userIdsOf · 보유 조각 · 예외 격리) + `PUSH_NOTIFY` (W2)
- [x] 40-07-PLAN.md — server `/api/push-devices` GET · PUT · PATCH(끄기만) · DELETE + 소유권 404 (W2)
- [x] 40-08-PLAN.md — Android Firebase: google-services.json 추적 · 위생 검사 (2)(3)(8) 반전 · (11) iOS Firebase 0 · 릴리스 가드 · 채널 fills · 소형 아이콘 (W2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 40-09-PLAN.md — relay 송신기 APNs(http2 · ES256 JWT) · FCM v1(메타데이터 토큰 · probe) + deploy-relay 비치명 비밀 · IAM · 비밀 주입 스크립트 (W3)
- [x] 40-10-PLAN.md — webapp 「알림 받는 기기」 카드 · 권한(켤 때만) · 토큰 등록 · PC 목록 끄기/지우기 · 로그아웃 정리 (W3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 40-11-PLAN.md — webapp 탭 착지(계좌 해석) · 작업대 주문 토스트 숨김(D-20) · 앱 시작 토큰 갱신 (W4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 40-12-PLAN.md — 배포 전 게이트(SC-3 diff 0) → [BLOCKING] db push → 비밀 · IAM → relay(20:00 뒤) → git push → native:release → 실기기 UAT (W5 · 체크포인트)

### Phase 41: 한투 뉴스·공시 피드

**Goal**: 돌파·상따 종목에 「지금 무슨 재료가 떴나」를 뉴스·공시 제목으로 바로 보여 준다 — gh-radar 가 한국투자증권 Open API 「종합 시황/공시(제목)」(`GET /uapi/domestic-stock/v1/quotations/news-title` · tr_id `FHKST01011800`)을 **서버측 배치로** 받아 저장하고, 기존 네이버 뉴스(`news_articles`)와 합쳐 gh-radar 웹앱과 gh-trade(Windows 클라 돌파감지 목록 · 상따창)에 제공한다. 사용자 결정(2026-11-11): 「뉴스/공시를 gh-radar 가 한투 API 로 받아 gh-trade 에 쏴주는 형태 · 공시가 느리면 그때 KRX 직접 수신」 → **KRX F000 직수신(gh-trade 안 A·B)은 범위 밖**, 장중 지연 실측도 생략. 한투는 공식 쿼터 API 라 CLAUDE.md 「공식 API 운영 기준」 대상 — 호출량은 사용자 수와 독립인 서버측 폴링 · 설계 예산 ≤ 공식 한도 75% · 한도 소진 신호 시 run 중단 · 출처(자료원) 항상 표기. 실측(2026-11-11 21:03 실전 도메인 48회 · 응답 중앙 62ms)으로 확정된 API 성질: ① **제목만**(본문 · URL 필드 없음) → 원문 링크 · 스니펫은 네이버 쪽 몫 ② 뉴스와 공시가 한 목록 · 제공업체 코드 필터 동작(`F` 거래소 공시 · `G` 코스닥 공시 · 언론사 포함 21곳 관찰) ③ 종목코드 조회 동작하나 **응답 종목코드는 기사당 1개만 표시**(칸은 10개 · 조회 종목이 아닌 다른 관련 종목이 찍히기도 함 · 전체 글 중 종목코드 부착 약 40%) → 「전체 최신」만으로는 종목 매핑 불완전, 종목별 조회 병행 필요 ④ 언론사 자동 태깅 잡음(헤럴드경제가 「AI」 기사에 아이에이 038880) — 공시는 정확 ⑤ 같은 기사의 수정본이 다른 일련번호로 반복 → (자료원 · 제목) 중복 제거 ⑥ 페이지당 40건 · 다음 페이지는 `tr_cont` 가 아니라 마지막 글의 날짜·시각 커서(`00YYYYMMDD` · `0000HHMMSS`) · 1년 전까지 조회 ⑦ 제목 검색 파라미터는 무시됨 ⑧ 실시간 푸시 없음(폴링) · 일련번호 앞 14자리 = 작성일시 ⑨ 공시 작성시각은 KRX 송출 시각과 같은 초(세아베스틸지주 11/10 15:29:27 · F000S 첫 패킷 15:29:27.696 — gh-trade-42 대조 1건). 장중 지연(작성시각 → 조회 가능)은 미측정. 근거 메모: `reference_broker_news_api_survey` · 실측 원본은 세션 스크래치(저장소 밖).
**Depends on**: Phase 7·07.1(news-sync · `news_articles` · 네이버 검색 API) · Phase 09.1(키움 고정 IP · Secret Manager 패턴) · 외부: 한국투자증권 실전 앱키·시크릿(사용자 보유 · 저장소·Secret Manager 에 없음 → 사용자 `!` 주입) · gh-trade 쪽 클라 표시 작업(전달 방식 확정 뒤 인박스 노트로 인계)
**Requirements**: TBD
**Success Criteria** (초안 — discuss 에서 확정):
  1. 장중 새 뉴스·공시 제목이 한투에 뜬 뒤 정해진 주기 안에 gh-radar DB 에 들어오고, 같은 글이 두 번 저장되지 않는다(일련번호 멱등 · 수정본 중복 제거 테스트).
  2. 종목코드로 조회하면 그 종목의 한투 뉴스·공시와 네이버 뉴스가 시간순 한 목록으로 나오고, 각 줄에 출처(자료원)와 종류(뉴스/공시)가 붙는다. 네이버에 같은 기사가 있으면 원문 링크가 따라온다.
  3. gh-trade 가 합의된 방식으로 돌파·상따 종목의 뉴스·공시를 받는다(계약은 인박스 노트 · 수집 대상 밖 종목도 비지 않음).
  4. 호출량이 사용자 수와 무관하다 — 화면 진입·클라 조회가 한투 호출을 일으키지 않는다(저장분만 읽음). 일일 호출 수가 카운터에 남고 설계 예산 안이다.
  5. 한투 장애·한도 소진·토큰 만료는 로그와 함께 그 run 만 중단하고, 네이버 뉴스 수집과 기존 화면은 그대로 동작한다.

**미결 결정(discuss 에서)**: ① **gh-trade 전달 방식** — 클라가 gh-radar HTTP 조회 / 같은 HTTP 에 SSE 로 새 글 밀기 / relay 거쳐 DMA 서버 → 클라 Broadcast(.fbs 변경 · 실거래 서버 변경). 「쏴주는」의 뜻을 사용자에게 확인. **gh-trade-42 의견(2026-11-11): HTTP 조회 권고** — 클라에 같은 방식 선례 둘(ThemeLookup · FloatSharesClient: HttpWebRequest + gzip · TLS 1.2 · 100코드 청크 · 60초 주기) · 서버·.fbs 무변경. SSE 는 .NET 4.0 에 클라이언트가 없어 직접 구현(하루 안팎 추가)이고 HTTP 를 대체 못 함 · relay 경로는 읽기 전용 관찰자 연결에 실거래 서버 입력 경로를 새로 여는 일이라 비권고. 원하는 조회 단위는 둘 다: (가) 종목 묶음(최대 100코드 → 종목별 최신 N건 · 최근 D일 · 글 없는 종목도 빈 배열) (나) 전체 최신 흐름(since=커서 → 새 글 전부 + 다음 커서 · **커서는 작성시각이 아니라 gh-radar 수신 순번** — 늦게 들어온 글 누락 방지 · 5 ~ 10초 주기면 「쏴주는」 체감). 필드 요청: id · 종류(뉴스/공시) · 작성일시(시간대 명시) · 제목 · 자료원 · 종목코드 배열 · url(없으면 null) · gh-radar 수신 시각. 한투·네이버 같은 기사는 gh-radar 에서 한 건으로 합쳐 주기 · 공시 비재료(ELW·ETN·주식선물 안내 등) 거르기는 사용자 결정이고 거른다면 gh-radar 에서 한 번만. 클라 조회는 인증 없이 Express 직접(테마와 같음 · `/api` IP 당 분 200회 · 사무실 클라들은 IP 공유). 주의: 클라의 (가) 코드 목록을 한투 종목별 조회 대상 신호로 쓰자는 제안은 「호출량은 사용자 수와 독립」 원칙과 부딪치지 않게 **대상 등록만 하고 한투 호출은 배치가** 하는 꼴이어야 함(gh-trade-42 동의). 그래서 gh-trade-42 추가 요청: 종목 묶음 응답에 **종목별 마지막 수집 시각(없으면 null)** — 「아직 수집 전」과 「수집했는데 글 없음」을 클라가 가르게(돌파 직후 구간) · 첫 배치까지 걸리는 시간을 인박스 노트에 명시. ② 수집 구성 — 전체 최신 흐름 + 공시 F/G 흐름 + 종목별 조회(대상: top_movers · 관심종목 · gh-trade 돌파·상따 종목) 중 무엇을 어떤 주기로. 돌파 종목 목록을 gh-radar 가 받는 길(전략 이벤트에서 추출 가능한지). ③ 도는 곳 — news-sync 확장 / 새 워커(Cloud Run Job + Scheduler 는 최소 1분) / 상주 프로세스(초 단위 폴링이 필요하면). ④ 저장 — `news_articles` 확장(url NOT NULL · UNIQUE(stock_code,url) 과 충돌) vs 새 테이블 + 합치는 뷰/RPC. ⑤ 잡음 처리 — 종목 무관 글(전체의 약 60%) 저장 여부 · 자동 태깅 오류 거르기. ⑥ 웹앱 표시 — 종목 상세 뉴스 탭 · 상따 화면 어디에 어떻게(목업 A/B/C 먼저). ⑦ 한투 공식 호출 한도 · 토큰 수명(1일 · 발급 시 알림톡) 확인과 예산 숫자. ⑧ 한투 약관상 여러 사용자 화면 표시 가능 여부.
**Plans:** 14/14 plans complete

Plans:
**Wave 1**
- [x] 41-01-PLAN.md — 트레이서: 한투 글 1건 → `kis_news_ingest` → 표 → `stock_feed_by_codes` → shared `mergeStockFeed` → `GET /api/news/by-stock` + 같은 기사 합치기 규칙(15자 앞부분 · 12시간) (W1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 41-02-PLAN.md — 수집기 DB 받침(토큰 표 · 임대 · 대상 · 종목 정보 · 정리 · 공시 종류 · 운영 수치 RPC) + 운영 스크립트(IAM · 비밀 `!` · Job/Scheduler 배포 · 스모크 · 보고) (W2)
- [x] 41-03-PLAN.md — 조회 계약 굳히기(5초 캐시 · 전용 제한기 분 600) + gh-trade 계약 노트 `kis-news-by-stock` (W2)
- [x] 41-14-PLAN.md — ① 종목 뉴스 목록 server: 조회 · 새로고침 응답 = 합친 목록(등록 안 함 · before 커서 · 새로고침은 네이버만) (W2)
- [x] 41-04-PLAN.md — ① 종목 뉴스 목록 화면: 「공시」/「뉴스」 배지 · 링크 없는 줄 · 자료원 항상 · 「관련 뉴스·공시」 문구 (W2)
- [x] 41-06-PLAN.md — 수집기 A: `workers/kis-news-sync` 골격 · 응답 행 타입 · 실측 표본 픽스처 · env 계약 · 비밀 가림 로거 (W2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 41-05-PLAN.md — 작업대 피드 폴링(10초 · 100코드) · 공유 문맥 · ② 돌파 칩 · 표 「공」「뉴」 배지 + 행 선택 상세 (W3)
- [x] 41-12-PLAN.md — 수집기 A-2: shared ETP 판정 단일 정의 · 분류(D-07 · D-09 · D-11) · 들여오기 RPC 호출 (W3)
- [x] 41-13-PLAN.md — 수집기 A-3: 한투 클라이언트 · 오류 분류 · 커서 페이징 · DB 토큰(61초 가드) (W3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 41-07-PLAN.md — ③ 상따 카드 한 줄 띠(최근 공시 1 + 뉴스 1 · 펼침 · 빈 줄) (W4)
- [x] 41-08-PLAN.md — 수집기 B: 빠른 창 `07:00` ~ `20:00` · 초당 상한 · 대상 순환(새 등록 먼저) · 예산 · 장기 실행 루프 · 임대 · 오류 처리 (W4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 41-09-PLAN.md — 핵심 배포: 게이트 → [BLOCKING] db push → 비밀 · IAM(사용자 `!`) → 수집기 + 스모크 → server → 확인 → git push → 화면 UAT ① ~ ③ (W5 · 체크포인트)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 41-10-PLAN.md — D-19 마지막 묶음(코드): 홈 AI 재료에 공시 · 한투 뉴스 · `[공시]` 줄 · 홈 근거 목록 공시 줄 (W6)

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 41-11-PLAN.md — D-19 배포 + 하루 뒤 확인: Claude 호출 수 전후 · 홈 ④ · D-10 공시 종류 확인 · 수집 운영 수치 (W7 · 체크포인트)

### Phase 42: 틱뷰어 봉차트·이동평균·수익률 겹쳐보기

**Goal**: 틱뷰어 차트에서 「가격 흐름(봉 · 이동평균 · 거래량)」과 「팀 매집(주문 원 · 평단 · 순매수)」을 한 시간축에 겹쳐 본다 — 팀이 어느 봉 · 어느 이동평균 자리에서 사고팔았는지, 그때 평단과 수익률이 어땠는지를 한눈에. 사용자 결정(2026-11-12): ① 세 덩어리 전부 진행 — (가) 1분봉/5분봉 · SMA/EMA · 봉별 거래량 (나) 팀 당일 수익률 시계열 선 (다) 누적 평단 · 누적 수익률 ② **누적 수익률 = 미실현 기준** 「(현재가 − 누적 평단) ÷ 누적 평단」(실현 손익 미포함) ③ **기존 차트는 건드리지 않는다** — 새 차트를 별도 컴포넌트로 만들어 틱뷰어에서 전환 스위치로 같은 종목 · 같은 날짜를 번갈아 보고 채택 여부를 정한다. 아니다 싶으면 새 파일과 스위치만 지우면 원래대로. 사전 조사(2026-11-09 · 11-12 코드 확인): 기존 차트는 차트 라이브러리 없는 순수 SVG 4판(`components/ticks/tick-chart.tsx` 1,238줄 + 기하 `lib/ticks/tick-chart.ts` 866줄 · 테스트 약 1,100줄) · 세션에 그날 체결(A3) 전부가 메모리에 있어 (가) · (나)는 **브라우저 집계만으로** 가능(서버 무변경) · 당일 평단 선과 선택 틱 시점 수익률은 이미 있음(`teamAvgPathOf` · `teamKpiAt`) · (다)의 누적 평단 시계열은 매집감지 보고서 payload `avg_px`(`limitup_accum_flow.payload`)에 이미 적재돼 있고 틱 열기 RPC 는 같은 행에서 `pos_net` 만 싣는다 → **RPC 한 키 추가**(+ shared 타입 · server 스키마 통과)로 닿는다 · gh-trade 계약 변경 없음 · 추가 키는 기존 차트가 읽지 않아 되돌리기에 영향 없음. 제약: 가격 판 높이가 데스크톱 104px · 폰 72px 라 봉 + 이동평균 여러 개 + 팀 주문 원 · 우리 체결 표식이 겹친다 — 판 높이 · 선↔봉 전환 · 폰 처리를 목업으로 먼저 정한다. 당일 화면은 누적 선을 안 그리는 기존 결정(Phase 37 D-09)이 누적 평단 · 누적 수익률에도 걸린다.
**Depends on**: Phase 37(틱 전문 뷰어 · 차트 · 세션) · Phase 38(우리 체결 표식 — 새 차트에도 같이 얹을지) · Phase 34(매집감지 보고서 payload `avg_px` · `pos_net`). Phase 41 과 무관(겹치는 파일 없음)
**Requirements**: TBD
**Success Criteria** (discuss 2026-11-12 확정 — `42-CONTEXT.md` 「성공 기준」):
  1. 차트 카드 제목 줄 「선 차트 | 봉 차트」 스위치 한 번으로 두 차트를 오가고, 고른 쪽이 그 브라우저에 기억된다(처음은 선 차트). 바꿔도 보던 시간 구간은 그대로다(D-24). 선 차트의 모양 · 조작 · 테스트는 이 phase 전과 같다(기존 차트 파일 diff = 스위치 연결부 + 보기 창을 주고받는 선택 입력 2개뿐).
  2. 봉 차트에서 봉 단위 「자동 · 1 · 5 · 10 · 15 · 30 · 60분」 을 고를 수 있고, 봉의 시 · 고 · 저 · 종 · 거래대금이 그 구간 체결(A3) 직접 집계와 일치한다(단위 테스트). 자동은 봉 하나 폭이 4px 이상 되는 가장 작은 단위를 고른다.
  3. 이동평균 선을 「봉 기준 | 일 기준」 × 기간 × (봉 기준은 단순 | 지수)로 최대 6개까지 더하고 지울 수 있고 값이 정의식과 일치한다(단위 테스트). 봉 수 · 종가 수가 기간에 못 미치는 구간은 그리지 않는다. 구성은 브라우저에 기억된다.
  4. 팀 주문 원 · 당일 평단 · 우리 체결 ◆ · 근거 ○ 가 봉과 같은 시간축에 겹쳐 보이고, 수익률 판의 당일 수익률 커서 시점 값이 팀 거래정보 패널 「평단 대비 수익률」 과 같다.
  5. 과거 날짜 · 매집감지 등록 종목이면 누적 평단 선(가격 판)과 누적 수익률(수익률 판 · 미실현)이 보이고, 미등록 종목 · 당일 화면은 그 선과 값 띠의 누적 줄만 빠진 채 나머지는 그대로다.
  6. 선 차트의 조작(휠/끌기/핀치 · `+ − 전체 1분 10초` · 클릭 시각 점프 · 주문 원 클릭 · ◆ ○ 클릭 · Shift+끌기 구간 합계 · 폰 길게 누르기 · 값 띠)이 봉 차트에서도 같은 방식으로 동작한다.
  7. 하루 수십만 체결 종목에서도 확대/이동이 선 차트만큼 매끄럽다(봉 집계는 세션 · 단위당 1회).

**미결 결정(discuss 에서)**: ① **그리는 방식** — 기존처럼 순수 SVG(권고: 팀 원 · 계단 · 띠 · 커서가 봉과 한 좌표계 · 실제 시간축 10초 확대 · 기존 기하 함수 재사용) vs `lightweight-charts`(일봉 차트에 이미 사용 · 봉 · 이동평균은 기본 제공이지만 시간축이 봉 순번 기준이고 팀 원 · 계단 · 구간 합계를 플러그인으로 다시 짜야 함). 사용자 질문(11-12 「차트는 라이브러리 쓰는거야?」)에 권고와 함께 답함 — 확정은 discuss. ② 전환 스위치 자리 · 기본값(기존 차트 기본 권고) · 운영 배포 뒤 비교할지 로컬에서만 볼지 · 채택 뒤 기존 차트 처리. ③ 가격 판 — 선↔봉 전환인지 봉 위에 틱 선을 같이 둘지 · 판 높이(키우기 · 접기) · 폰은 봉을 그릴지. ④ 이동평균 — 기본 기간 묶음(예: 5 · 20 · 60) · SMA/EMA 동시 표시 수 · 설정 저장 위치 · 1분봉/5분봉 중 어느 봉 기준. ⑤ 거래량 — 봉별 막대를 새 판으로 둘지 가격 판 아래에 겹칠지 · 기존 「누적 거래대금 · 팀 비중」 판과의 관계 · 수량/금액. ⑥ 수익률 — 당일 · 누적 선을 어느 판 · 어느 축(%)에 둘지 · 당일 수익률 정의는 패널과 같은 「(실현 + 미실현) ÷ 매수 금액」 유지 여부. ⑦ 누적 평단 — 보고서 `avg_px` 가 우리 체결 제외 · 서버 상태기 기준이라 당일 평단(틱 재계산 · 우리 체결 포함)과 기준이 다른 점을 범례에 어떻게 밝힐지 · NXT 화면 처리. ⑧ 띠(시각별 값 칸) · 떠다니는 상자에 봉 값 · 이동평균 값 넣는 방식. ⑨ 우리 체결 ◆ · 근거 ○ 표식과 구간 합계(Shift+끌기)를 새 차트에도 옮길지.
**Plans:** 11/11 plans complete

Plans:
**Wave 1**
- [x] 42-01-PLAN.md — 트레이서: RPC `accum.avg_px` → shared 타입 → server 통과 → 봉 차트(1분봉 + 누적 평단) ← 제목 줄 「선 차트 | 봉 차트」 스위치 + 6단위 분봉 집계 · 캐시 오라클 테스트 (W1)
- [x] 42-02-PLAN.md — 수익률 계산: 당일(= `teamKpiAt` 시계열) · 누적(미실현) · 두 눈금 0% 맞춤 · 눈금 글자 (W1)
- [x] 42-03-PLAN.md — 이동평균(봉 단순 · 지수 · 일 단순) · 앞 거래일 종가 조회 · 브라우저 기억 키 3 · 색 토큰 `--ma-1` ~ `--ma-6` (W1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 42-04-PLAN.md — 가격 판 완성: 자동 단위 · 거래대금 막대 · 이동평균 선 · 당일 평단 · 가장자리 글자 · 판 제목 (W2)
- [x] 42-05-PLAN.md — 수익률 판 층 · 아래 세 판 층(선 차트 같은 함수 · `CandlePanels`) (W2)
- [x] 42-06-PLAN.md — 값 띠 A 4칸(띠 수익률 = 패널) · 카드 아래 캡션 · 기존 띠 부품 export (W2)
- [x] 42-07-PLAN.md — 조작부: 봉 단위 펼침 목록 · 이동평균 칩 + 한 장 양식 · 제목 줄(데스크톱 한 줄 · 폰 두 줄) (W2)
- [x] 42-08-PLAN.md — 선 차트 보기 창 주고받기(`useViewSync` · 선택 입력 2) · 차트 종류 기억 · 뷰어 마지막 창 ref (W2)
- [x] 42-09-PLAN.md — 봉 차트 조작: 확대 · 클릭 점프 · Shift+끌기 구간 합계 · 팀 원 · 우리 점 · 묶음 상자 · 길게 누르기 (W2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 42-10-PLAN.md — 봉 차트 결선: 단위 · 이동평균 · 일별 종가 · 판 셋 · 값 띠 · 캡션 · 제목 줄 · 보던 구간 유지(양쪽) · 끝-끝 테스트 (W3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 42-11-PLAN.md — 배포 전 게이트 → [BLOCKING] db push → server 생략 확인 → git push → 운영 UAT(폰 · PC · NXT 일 이동평균 질문) (W4 · 체크포인트)

**UI hint**: yes

### Phase 43: 공개매수 · 유상증자 · 합병 공시 텔레그램 알림

**Goal**: 공개매수 공시와 유상증자 · 합병 결정 공시(코스피 · 코스닥)가 DART 에 접수되면 수 초 ~ 수십 초 안에 텔레그램 단체방에 두 줄 알림이 간다(범위 확장 2026-11-12 사용자 결정 · CONTEXT D-03) — 트레이더가 정규장 전(NXT 프리마켓 08:00 전후)에 대상 종목을 안다. 사전 조사 · 실측(2026-11-12 · 트렐로 gNcHVLC3 검토): ① **한투 `news-title` 로는 안 된다** — 공시 제공처 F · G 는 거래소 수시공시 · 시장조치만 싣는다. 운영 DB 공시 1,993건(523종류) 중 공개매수신고서 0건, 분기보고서 · 대량보유보고서 같은 금감원 보고서류도 0건. 11-11 에스텍(069510)은 DART 07:48 접수인데 한투 쪽 첫 관련 글이 09:03(「상한가 출발」 자동 기사) · 「공개매수」 가 제목에 처음 나온 기사가 09:20 ② **KIND 는 이점이 없다** — 같은 공시가 DART 보다 0 ~ 1분 늦게 표기되고 공식 API 가 없어 스크래핑 5원칙(장중 실시간 폴링 금지) 대상 ③ **DART RSS(`todayRSS.xml`)는 못 쓴다** — 최신 50건뿐이고 지분공시류가 빠져 있다(공개매수도 지분공시) ④ **OpenDART 공시검색 `list.json` + `pblntf_detail_ty=D004`** 가 답 — 호출 1회로 당일 공개매수 공시 전체(신고서 · 설명서 · 정정 · 의견표명서 · 결과보고서가 한 유형)가 오고, 대상회사 종목코드 · 보고서명 · 제출인 · 접수번호가 실린다. 접수 시각은 없다(날짜만) ⑤ **API 반영 지연 실측 0 ~ 수 초** — 12:45 ~ 13:10 새 공시 8건이 API 와 DART 사이트 최근공시에 같은 순간 보였다(차이 −4 ~ +2초 · 사이트 10초 간격 조회 한계 안 · API 719회 오류 0 · 응답 약 120ms). 장전(07:30대)과 지분공시 유형 표본은 없다 — 운영 첫 실제 건으로 다시 확인 ⑥ **접수 시각 패턴** — 11월 신고서 4건이 07:30 · 07:35 · 07:49 · 08:03(그날 접수번호 000001 ~ 000003), 설명서가 2 ~ 4분 뒤 따라온다. 운영 분류: OpenDART 는 **공식 API 운영 기준** 대상 — 공식 한도 20,000회/일(한도 초과 응답 코드 `020`)의 75% = 15,000회/일 이하로 설계(평일 장전 07:00 ~ 09:00 5초 · 그 밖 09:00 ~ 20:00 10초 × 공개매수 · 주요사항보고서 2유형 = 약 10,800회 · 공식 한도의 54% — CONTEXT D-10 · 공개매수 단독 기준이던 「5초 × 9,360회」 를 대체), 호출량은 사용자 수와 무관한 고정 주기, 한도 소진 신호 시 그 run 중단, 알림에 출처(금융감독원 전자공시)와 원문 링크. 준비물: OpenDART 인증키는 사용자가 발급해 전달함(2026-11-12 · Secret Manager 미등록) · 텔레그램 봇 토큰 · 단체방 chat id 는 미보유 · 저장소에 텔레그램 코드 없음(새로 만든다). 비밀 등록은 사용자가 터미널에서 실행하는 비출력 스크립트로.
**Depends on**: 없음(독립). Phase 41 `workers/kis-news-sync` 가 같은 꼴의 선례 — 평일 창 장기 실행 루프 · 임대(중복 실행 방지) · `api_usage` 호출 수 카운터 · Scheduler 깨우기. Phase 42 와 무관(겹치는 파일 없음)
**Requirements**: TBD
**Success Criteria** (확정 2026-11-12 — 결정은 43-CONTEXT D-01 ~ D-17):
  1. 평일 수집 창(07:00 ~ 20:00) 안에 공개매수 유형 보고서 또는 유상증자 · 합병 결정 주요사항보고서(코스피 · 코스닥 상장사)가 DART 에 접수되면 30초 안에 텔레그램 단체방에 보고서마다 알림 1건이 온다 — 두 줄(「📢 보고서명 — 회사(종목코드) · 제출인」 / DART 원문 링크 · 「금융감독원 전자공시」).
  2. 같은 접수번호는 한 번만 알린다 — 수집기 재시작 · 중복 실행 · 같은 응답 반복에도(보낸 접수번호를 DB 에 남긴다).
  3. 수집기가 늦게 떴어도 그날 이미 접수된 건은 놓치지 않고, 지난 날짜 건을 한꺼번에 쏟아내지 않는다.
  4. 하루 OpenDART 호출 수가 설계 약 10,800회(공식 20,000 의 54%) · 상한 15,000회 이하이고 `api_usage` 에 KST 날짜별로 남는다. 한도 초과 응답(`020`)을 받으면 그 run 을 멈추고 재시도로 두드리지 않는다(다음 run 은 단독 탐침 1건).
  5. 텔레그램 전송이 실패하면 재시도하고, 끝내 못 보낸 건은 사유와 함께 로그에 남는다(무로그 실패 없음). 다음 실행이 이어서 보낸다.
  6. 수집기가 죽거나 OpenDART 가 5분 넘게 실패하면(하루 한도 초과 포함) 운영자 이메일(GCP 알림 정책)과 단체방 「⚠ 공시 알림이 멈췄습니다」 로 알리고, 복구되면 「다시 동작」 을 한 번 올린다(D-16 · D-17).
  7. 운영 중 첫 실제 공개매수 건과 첫 주요사항보고서 건에서 「DART 표기 시각 → 알림 도착」 지연을 기록해 ⑤ 실측을 장전 · 지분공시 · 주요사항보고서 유형으로 재확인한다.

**확정(2026-11-12 · 사용자)**: 트렐로 카드의 「공개매수 설명회」 는 DART 보고서 **「공개매수설명서」** 다(신고서 2 ~ 4분 뒤 항상 붙는다). 거래소 「기업설명회(IR) 개최」 공시가 아니다.
**미결 결정**: 없음 — ② ~ ⑨ 는 `43-CONTEXT.md` D-01 ~ D-17 이 답(2026-11-12 논의). 실행 자리는 새 워커 `workers/dart-alert`(kis-news-sync 꼴 장기 실행 Cloud Run Job).
**Plans:** 9/9 plans executed

Plans:
**Wave 1**
- [x] 43-01-PLAN.md — 트레이서: 공개매수 1건 DART 조회 → 거르기 → DB 한 번만 → 두 줄 문구 → 텔레그램 + 그 길의 DB 계약(표 2 · RPC 5 · pgTAP) (W1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 43-02-PLAN.md — DB 완성: 임대 인계 이어 보내기 · 송신 기한 90초 재차례 · 지난 날 닫기 · 장애 짝 상태 · 운영 수치 RPC · 워커 DB 어댑터 + 마이그레이션 자동 대조 계약 테스트 (W2)
- [x] 43-03-PLAN.md — env 계약 · 비밀 가림 로거 · 시간대(장전 5초 · 그 밖 10초 · 하루 10,800회) · 늦은 알림 기준점 · 호출 수 카운터 (W2)
- [x] 43-04-PLAN.md — OpenDART 상태 코드 분류 · 100건 넘는 날 쪽 넘김 · 텔레그램 응답 분류 (W2)
- [x] 43-09-PLAN.md — 유상증자 · 합병 허용 목록 판정 · 근접 불일치 warn · 문구 규칙 전부(제출인 생략 · 늦은 알림 · 장애 · 시험 글) — 43-01 에서 떼어 냄 · CLAUDE.md/stack.md OpenDART 기준(43-07 에서 옮김) (W2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 43-05-PLAN.md — 장기 실행 수집기(임대 · 예산 · 탐침 · 바퀴 · 늦은 알림) · 모드(probe · seed → auto 이어 감 · 창 밖 seed · test-send) · 진입점(DB 는 43-02 어댑터) (W3)
- [x] 43-07-PLAN.md — 배포 · IAM · 비밀(사용자 `!`) · 방 id 찾기 · 스모크 · 조사 · 이메일 정책 (W3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 43-06-PLAN.md — 장애 짝 글(5분 · 이메일 + 단체방) · 송신 재시도 · 방 이동 · 속도 제한 (W4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 43-08-PLAN.md — 배포 전 게이트 → [BLOCKING] DB push(대기 목록이 우리 파일 하나일 때만) · 봇 · 비밀 · 조사 · 배포 · 실제 DB 경로 seed · 개인 대화 시험 · 단체방 전환(메인 세션) → 단체방 UAT · 지연 기록 (W5 · 체크포인트)

**UI hint**: no
