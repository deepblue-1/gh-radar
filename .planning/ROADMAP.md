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
- [ ] **Phase 35: 발사 경계 지도 어드민** - gh-trade 16:00 예약 발사 · 09:00:30 개장차익 발사 결과(조각·머리)를 저널 80 kind 17·18 로 받아 DB 쪽 해석으로 `launch_heads`·`launch_pieces` 적재(relay 무변경) · 어드민 메뉴 날짜별 주문 내역 + 날짜 범위 발사 경계 지도(서버×시장 4패널 SVG) · 10/12~10/26 백필 · 인박스 `261027-launch-gate-admin.md`

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
| v1.1 운영 유지보수 | 6 | — | 🚧 진행 중 |

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 30. 인박스 KB 계좌별 주문자 IP/MAC | v1.1 | 9/9 | Complete | 2026-10-11 |
| 31. 인박스 상따 금액 단위 | v1.1 | 8/8 | Complete | 2026-10-12 |
| 32. 계좌 축 정리 | v1.1 | 14/14 | Complete | 2026-10-16 |
| 33. 팀 매집(teamflow) 보고서 | v1.1 | 9/9 | Complete | 2026-10-16 |
| 34. 매집감지(accum) 보고서 | v1.1 | 13/13 | Complete | 2026-10-21 |
| 35. 발사 경계 지도 어드민 | v1.1 | 17/19 | In progress | — |

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
**Plans**: 17/19 plans executed

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
- [ ] 35-11-PLAN.md — Wave B 배포: 매핑 db push · reproject · 라이브 UAT · 두 노트 닫기 — 범위 7 커밋 미배포면 push 는 35-18 로 넘기고 완료 (W8 · 메인 세션)
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
- [ ] 35-18-PLAN.md — 범위 7 배포: gh-trade 43 확인 → DB → relay → server → push · 라이브 UAT(D-33) · 인박스 261027-launch-plan-admin 닫기 (W13 · 메인 세션)

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
**Plans**: 10/10 plans executed

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
