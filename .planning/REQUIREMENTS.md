# Requirements: gh-radar v1.1 운영 유지보수

**Defined:** 2026-10-11
**Core Value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다

v1.0 요구사항 아카이브: [milestones/v1.0-REQUIREMENTS.md](./milestones/v1.0-REQUIREMENTS.md)

## v1.1 Requirements

유지보수 마일스톤. 로드맵 phase 는 인박스 계약 반영 2건(30·31) + 사용자 요청 2건(32 계좌 축 · 33 팀 매집 보고서)이고, 나머지는 quick 으로 처리한다.

### 인박스 — KB 계좌별 주문자 IP/MAC (`docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md`)

- [x] **IPMAC-01**: relay 가 Admin op 1/3(계좌 추가·수정)을 보내기 직전 op 5(ListUsers)로 87 을 재조회해 최신 `order_ip`/`order_mac` 을 되싣는다 — relay 밖(gh-trade 도구)에서 설정한 값이 웹 계좌 편집 한 번에 지워지지 않는다(R3-01 해제 조건)
- [x] **IPMAC-02**: 웹 Admin 계좌 편집에 「주문자 IP」·「MAC 주소」 입력칸 2개 — 클라 검증은 서버 규칙과 같다(IP 12자리 숫자 또는 a.b.c.d · MAC 12 hex(`:`·`-` 허용) · 둘 다 적거나 둘 다 비움), 저장 뒤 87 값을 다시 그린다 — 화면 표기는 IP 점표기 · MAC 콜론 대문자(`10.41.1.124` · `1C:FD:08:7D:97:8E`), 저장 · 비교는 정규화값(12자리 · 대문자 MAC)(Phase 30 D-17 · 2026-10-11 갱신 → 30-08), 공유 KB 계좌는 편집 모드에 함께 쓰는 사용자 안내(D-18 → 30-09), 멱등 비교 7필드에 두 필드 포함, 도움말 한 줄(같은 서버의 두 계좌가 서로 체결될 수 있으면 서로 다른 사용자 PC 값)
- [x] **IPMAC-03**: 86 code 13 BAD_ORDER_ENDPOINT 가 웹에 서버 문구 그대로 표시된다
- [x] **IPMAC-04**: gh-trade 질문 3개에 답을 인박스 노트에 적고 `status: done` · `done_commit` 으로 닫는다 — ① code 7 문구 확장 여부(웹이 문장을 대조하는지 확인) ② 입력 표기(웹은 점표기·콜론 그대로 보내고 서버 정규화에 맡김, 표시는 87 값의 사람이 읽는 표기 — D-17) ③ 사용자 PC IP/MAC 은 `ipconfig /all` 값 수기 입력 운영 절차
- [x] **IPMAC-05**: 웹 Admin 에서 기존 계좌의 「계좌명」을 수정할 수 있다(지금은 추가 때만 입력 · 계좌 줄은 읽기 전용) — IP/MAC 과 같은 계좌 카드 편집에서 저장하고, 등록 서버마다 op 3 으로 반영된다(name 변경은 BUSY 미판정). 2026-10-11 사용자 추가 범위

### 인박스 — 상따 금액 단위 (`docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md`)

- [x] **AMT-01**: relay 생성물 재동기화 커밋(`4970c3ae`)이 gh-trade master 병합 뒤 마커와 일치하는지 `sync-relay-schema.sh --check` 로 확인하고, 다르면 재생성한다
- [x] **AMT-02**: 웹 `lc.set` 재제출 때 금액 8필드(`buy_watch_amount` … `cancel_watch_amount`)를 60/64 에코값 그대로 되싣는다 — 웹이 주 필드를 바꿔 보내면 짝이 맞는 금액(`floor(만원×10000÷비교가) == 주`) 또는 0 을 싣는다. C# 단말 칸의 만원 원값이 웹 재제출로 지워지지 않는다
- [x] **AMT-03**: 84 `post_buy_floor_amount` 를 /me 기본설정에 표시·설정한다 — 42 는 12값 전체 교체에 이 필드를 포함하고 봉인 필드 `post_buy_floor_qty` 는 0
- [x] **AMT-04**: 「만(주)」 단위 표시 도입 여부를 결정해 인박스 노트 질문 2개에 답하고 닫는다 — 도입하면 환산 규칙(gh-trade `docs/strategy/limit-chaser.md` §10 · 제출 내림 · 표시 반올림 · 그룹별 비교가 · 비교가 0 이면 등록 거부)을 그대로 공유, 안 하면 AMT-02 되싣기만

### 계좌 축 정리 (Phase 32 · 사용자 요청 2026-10-13)

- [ ] **AXIS-01**: 작업대 계좌 선택이 화면 범위다 — 고른 계좌의 전략 카드 · VI 트리거 스트립 · VI 설정 행만 보이고, 새 카드 기본 계좌 기능은 유지한다. 알림 토스트는 모든 계좌 것을 계좌 표시와 함께 띄우고 누르면 그 계좌로 작업대 계좌가 바뀐다(Phase 32 D-03 — 2026-10-13 사용자 결정으로 「토스트만 보이고」 를 뒤집음)
- [ ] **AXIS-02**: 작업대 상단 줄 재설계 — 「정규」 배지 · 사운드 토글 제거, 계좌 선택을 중심으로 시세·주문 상태를 축약한 한 줄(채택 목업 A). 알림음 켜고 끄기는 /me 설정 탭 「이 기기」 카드로 옮긴다(Phase 32 D-05 · D-15)
- [ ] **AXIS-03**: /me 현황 탭은 탭 위 계좌 칩으로 고른 계좌의 전략 현황 · VI 만 보인다(계좌 묶음 · 소제목 없음 · 상태줄 「상따 N건 · VI」 도 고른 계좌 기준). 카드 맨 아래에는 「이 계좌 끄기」(그 계좌의 상따 · VI 를 relay `strategies.disable.account` 로) 한 줄만 두고 「전체 비활성화」 는 없다(Phase 32 D-21 · D-09 · D-27 — 2026-10-16 사용자 결정으로 「계좌별로 묶어 나열」 을 뒤집음)
- [ ] **AXIS-04**: /me 는 계정 카드 아래 · 탭 위 계좌 칩 한 곳에서 계좌를 고르고 현황 · 잔고 · 주문 · 설정 네 탭이 전부 그 계좌를 따른다(잔고 = 그 계좌 한 벌 · 주문 = 그 계좌 평탄 목록 · 탭 라벨 숫자 = 그 계좌 건수 · 선택은 작업대와 따로 기기별 기억). Phase 16 D-21(「계좌 선택 UI 없음 · 계좌별 세로 반복」)을 전면 뒤집는다(Phase 32 D-20 · D-22 · D-23 · 2026-10-16)
- [ ] **AXIS-05**: /me 설정 탭 매매설정을 서버별로 보고 저장한다 — 설정 탭의 서버 = 탭 위 계좌 칩으로 고른 계좌의 서버(서버 세그먼트 없음 · Phase 32 D-24) · relay `user.settings`/`user.settings.set` 에 `serverKey`, hub 84 캐시 `(userId, serverKey)` · `#fromPrimary` 해제 · 42 지정 서버 라우팅, 상따 폼 시딩은 카드 계좌의 소유 서버 설정. gh-trade 와이어 변경 없음

### 팀 매집(teamflow) 보고서 (Phase 33 · 사용자 요청 2026-10-16 · 스케치 014 A · 015 C)

- [ ] **TEAM-01**: gh-trade 119 밤 export 의 `team_flow.ndjson.gz`(gh-trade `docs/analysis/team-flow.md` §11 · 열 사전 인박스 `261016-teamflow-export.md`)를 `gh-radar-limitup-sync` 가 기존 표 6개와 같은 규칙(manifest sha256 대조 · 날짜 단위 교체)으로 `team_flow` 표(평평한 열 + `payload` jsonb)에 적재한다. 파일이 없는 날짜는 기존 적재에 영향이 없다
- [ ] **TEAM-02**: 서버가 상한가 보고서와 같은 경로(RPC 1회 · `require-dma-mapped`)로 날짜 목록 · 종목 행 · 상세 payload 를 내주고, 사이드바 「분석」 에 「팀 매집」 항목이 생긴다
- [ ] **TEAM-03**: `/analytics/teamflow?d=YYYYMMDD` 목록 — 날짜 알약 → KPI 4칸 → 종목 행(결과 · 팀 순매수 · 20% 아래/위 · 매수 중 팀 · 구간별 순매수 9칸 미니막대 · 상한가/미도달 태그) → 행 클릭 그 자리 아코디언(한 번에 하나 · 기본 전부 접힘), 폰 390 은 2줄 카드형 행(스케치 014 A)
- [ ] **TEAM-04**: 행 펼침 상세 — 요약 문장 → [구간 가로 막대 | 거래원 2단 막대] 2열(폰 1열) → 10분 흐름 차트(순매수 막대 + 매수 중 팀 % 선 + 등락률 범위 띠 · 최대 매집 창 음영 · 첫 상한가 세로선) → 판정 기준 접힘. 각 차트 아래 접힌 표(「구간표 보기」 · 「10분 표 보기」). 차트 규칙 = 중앙 0선 · + 빨강/− 파랑 · 20% 점선 · 팀 비중 ≥ 30% 보라 · `<title>` 툴팁(스케치 015 C)

### 문서

- [x] **DOCS-01**: CLAUDE.md 다이어트 — 세션마다 로드되는 분량을 핵심 규칙만으로 줄인다(스택 표 · 법적 판례 · 설치 참조 · 출처 링크는 `docs/` 로 이동, 운영 5원칙·공식 API 기준·인박스·컨벤션은 요약 유지). quick 으로 처리, 로드맵 phase 없음

## 상시 (phase 없음)

- **MAINT**: 운영 중 발견되는 버그 수정 · 자잘한 기능 추가 — `/gsd-quick`(여러 파일) · `/gsd-fast`(값 하나) 로 처리. STATE.md Quick Tasks 표에 누적.

## v1.2+ (보류)

- **ADMIN-NEXT**: 두 번째 DMA 서버(KB121·KYOBO127) 켜기 전 결정 — R3-03 부팅 창 백스톱 · R3-05 무동작 대여 미승격 · R3-06 VI 끄기 에코 미확인 · 51 OrderResp 계좌 필터 공백 수용 · 실서버 실증(정본 `milestones/v1.0-phases/29-dma-multi-server-admin/29-53-SUMMARY.md`)
- **AUTH-01**: 이메일/비밀번호 로그인(v1.0 Deferred)
- **PLAY-01**: GH Trade Play 스토어 내부 테스트(개발자 인증 뒤)

## Out of Scope

| Feature | Reason |
|---------|--------|
| 신규 대형 기능 phase | v1.1 은 유지보수 — 큰 기능은 v1.2 로 새 마일스톤 |
| 두 번째 DMA 서버 켜기 | 운영 영향 0 · 켤 계획이 생길 때 별도 phase (2026-10-11 사용자 결정) |
| 실시간 알림/푸시 · 미국 주식 | v1.0 부터 범위 밖 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| IPMAC-01 | Phase 30 | Complete |
| IPMAC-02 | Phase 30 | Complete |
| IPMAC-03 | Phase 30 | Complete |
| IPMAC-04 | Phase 30 | Complete |
| IPMAC-05 | Phase 30 | Complete |
| AMT-01 | Phase 31 | Complete |
| AMT-02 | Phase 31 | Complete |
| AMT-03 | Phase 31 | Complete |
| AMT-04 | Phase 31 | Complete |
| DOCS-01 | quick | Complete |
| AXIS-01 | Phase 32 | Pending |
| AXIS-02 | Phase 32 | Pending |
| AXIS-03 | Phase 32 | Pending |
| AXIS-04 | Phase 32 | Pending |
| AXIS-05 | Phase 32 | Pending |
| TEAM-01 | Phase 33 | Pending |
| TEAM-02 | Phase 33 | Pending |
| TEAM-03 | Phase 33 | Pending |
| TEAM-04 | Phase 33 | Pending |

**Coverage:**
- v1.1 requirements: 15 total
- Mapped to phases: 14 (Phase 30: IPMAC 5 · Phase 31: AMT 4 · Phase 32: AXIS 5)
- Quick (phase 없음): 1 (DOCS-01)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-11*
*Last updated: 2026-10-13 — Phase 32 추가(AXIS-01~05 · 계좌 축 정리)*
