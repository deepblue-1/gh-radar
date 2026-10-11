# Roadmap: gh-radar

## Milestones

- ✅ **v1.0 Launch** — Phases 1-29 (shipped 2026-10-11) · [아카이브](./milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 운영 유지보수** — Phases 30-31 (진행 중) · 버그 수정 · 자잘한 기능은 quick(phase 없음)

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

- [ ] **Phase 30: 인박스 KB 계좌별 주문자 IP/MAC** - relay R3-01(op 5 재조회) · 웹 Admin 계좌 편집 IP/MAC 입력칸 · 계좌명 편집 · code 13 문구 · 질문 3개 답으로 `261010-kb-order-ip-mac.md` 닫기
- [ ] **Phase 31: 인박스 상따 금액 단위** - 생성물 마커 확인 · `lc.set` 금액 8필드 되싣기 · 84 `post_buy_floor_amount` · 「만(주)」 결정으로 `261011-limitchaser-amount-unit.md` 닫기

## Phase Details

### Phase 30: 인박스 KB 계좌별 주문자 IP/MAC

**Goal**: 운영자가 웹 Admin 에서 KB 계좌별 주문자 IP/MAC 을 안전하게 설정·수정할 수 있고, relay 밖에서 설정한 값이 웹 계좌 편집으로 지워지지 않는다(R3-01 해제 → KB 운영 서버 IP/MAC 설정 보류 해제)
**Depends on**: 없음 (relay 87 파서 · op 1/3 되싣기 · code 13 라벨은 29-47 에서 배포됨)
**Requirements**: IPMAC-01, IPMAC-02, IPMAC-03, IPMAC-04, IPMAC-05
**Success Criteria** (what must be TRUE):
  1. relay 밖(gh-trade 도구)에서 IP/MAC 을 설정한 계좌를 웹에서 이름만 바꿔 저장해도, op 5(ListUsers) 87 에 그 `order_ip`/`order_mac` 이 그대로 남는다(미설정 계좌는 빈 문자열)
  2. 웹 Admin 계좌 편집에 「주문자 IP」·「MAC 주소」를 `10.41.1.124`·`1c:fd:08:7d:97:8e` 로 저장하면 86 code 0 이고 목록이 `010041001124`·`1CFD087D978E` 로 다시 그려진다 — 같은 값 재저장은 「변경 없음」
  3. 한쪽만 적거나 형식이 틀리면 웹이 저장 전에 막고, 서버가 code 13 BAD_ORDER_ENDPOINT 를 내면 서버 문구가 그대로 보인다
  4. 입력칸 아래 도움말 한 줄(같은 서버의 두 계좌가 서로 체결될 수 있으면 서로 다른 사용자 PC 값)이 보인다
  5. 웹 Admin 계좌 카드 「편집」 에서 기존 계좌의 계좌명을 바꿔 저장하면 등록 서버마다 op 3 으로 반영되고(87 계좌명 갱신) 카드에 새 이름이 보인다
  6. 인박스 노트 `261010-kb-order-ip-mac.md` 에 질문 3개(code 7 문구 · 입력 표기 · `ipconfig /all` 수기 절차) 답이 적히고 `status: done` · `done_commit` 으로 커밋된다

**배포 순서**: DB 변경 없음 → relay(R3-01) 배포·확인(20:00 KST 이후) → server(Cloud Run — zod 가 `orderEndpoint` 를 버리므로 필수) → webapp push(= 프로덕션) — 백엔드 막히면 push 금지
**Plans**: 6/7 plans executed
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

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 30-07-PLAN.md — 배포 relay(20:00 KST 뒤) → server → webapp push · 실서버 확인 · 인박스 261010 회신 · done

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
**Plans**: 4/8 plans executed
Plans:
**Wave 1**
- [x] 31-01-PLAN.md — (트레이서) 매도 「매수잔량」 만원 한 칸 → lc.set 금액 · 산출 주 → relay → 10 → 60 에코 → 행 · 금액 8필드 계약(shared · relay zod/조립/파서) · §10 환산 한 벌
- [x] 31-02-PLAN.md — 표시 부품: 두 줄 행(56px · lc-row-sub) · 인라인 아래 줄 · 시트 환산 안내 줄(hint · 우선순위)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 31-03-PLAN.md — AMT-03: /me 「후매수 최소(만원)」 · 42 12값 · 봉인 0 · 84 금액 · 구 탭 84 캐시 되싣기
- [x] 31-04-PLAN.md — 수량 나머지 7칸 만원 입력 전환(모델 · cfg 8쌍 · 기본 0 · 상장주식수 만원 시딩 · 요약)
- [ ] 31-05-PLAN.md — 주문로그 ⑦ 금액 표기 「N만(M주)」/「X.Y억(M주)」 · kind 1·2 ev_price 환산(D-19)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 31-06-PLAN.md — 화면 연결: 두 줄 행 · 파생 행 · 시트/인라인 환산 · 등록 차단 D-03/D-04 · 84 후매수 최소 시딩

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 31-07-PLAN.md — E2E P31(390 · 1080) · 폭/높이 백스톱 56/44 · 전 워크스페이스 회귀

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 31-08-PLAN.md — relay 배포(20:00 KST 뒤) · Vercel 미리보기(push 없음) · AMT-01 마커 · 인박스 2건 회신 · done

**UI hint**: yes

## Progress

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 Launch | 37 | 432 | ✅ Shipped 2026-10-11 |
| v1.1 운영 유지보수 | 2 | — | 🚧 진행 중 |

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 30. 인박스 KB 계좌별 주문자 IP/MAC | v1.1 | 6/7 | Not started | - |
| 31. 인박스 상따 금액 단위 | v1.1 | 4/8 | Not started | - |
