# Requirements: gh-radar v1.1 운영 유지보수

**Defined:** 2026-10-11
**Core Value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다

v1.0 요구사항 아카이브: [milestones/v1.0-REQUIREMENTS.md](./milestones/v1.0-REQUIREMENTS.md)

## v1.1 Requirements

목표 기능이 없는 유지보수 마일스톤. 로드맵 phase 는 인박스 계약 반영 2건만 가지고, 나머지는 quick 으로 처리한다.

### 인박스 — KB 계좌별 주문자 IP/MAC (`docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md`)

- [ ] **IPMAC-01**: relay 가 Admin op 1/3(계좌 추가·수정)을 보내기 직전 op 5(ListUsers)로 87 을 재조회해 최신 `order_ip`/`order_mac` 을 되싣는다 — relay 밖(gh-trade 도구)에서 설정한 값이 웹 계좌 편집 한 번에 지워지지 않는다(R3-01 해제 조건)
- [ ] **IPMAC-02**: 웹 Admin 계좌 편집에 「주문자 IP」·「MAC 주소」 입력칸 2개 — 클라 검증은 서버 규칙과 같다(IP 12자리 숫자 또는 a.b.c.d · MAC 12 hex(`:`·`-` 허용) · 둘 다 적거나 둘 다 비움), 저장 뒤 87 의 정규화 표기(12자리 · 대문자 MAC)로 다시 그린다, 멱등 비교 7필드에 두 필드 포함, 도움말 한 줄(같은 서버의 두 계좌가 서로 체결될 수 있으면 서로 다른 사용자 PC 값)
- [ ] **IPMAC-03**: 86 code 13 BAD_ORDER_ENDPOINT 가 웹에 서버 문구 그대로 표시된다
- [ ] **IPMAC-04**: gh-trade 질문 3개에 답을 인박스 노트에 적고 `status: done` · `done_commit` 으로 닫는다 — ① code 7 문구 확장 여부(웹이 문장을 대조하는지 확인) ② 입력 표기(웹은 점표기·콜론 그대로 보내고 서버 정규화에 맡김, 표시는 87 값) ③ 사용자 PC IP/MAC 은 `ipconfig /all` 값 수기 입력 운영 절차
- [ ] **IPMAC-05**: 웹 Admin 에서 기존 계좌의 「계좌명」을 수정할 수 있다(지금은 추가 때만 입력 · 계좌 줄은 읽기 전용) — IP/MAC 과 같은 계좌 카드 편집에서 저장하고, 등록 서버마다 op 3 으로 반영된다(name 변경은 BUSY 미판정). 2026-10-11 사용자 추가 범위

### 인박스 — 상따 금액 단위 (`docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md`)

- [ ] **AMT-01**: relay 생성물 재동기화 커밋(`4970c3ae`)이 gh-trade master 병합 뒤 마커와 일치하는지 `sync-relay-schema.sh --check` 로 확인하고, 다르면 재생성한다
- [ ] **AMT-02**: 웹 `lc.set` 재제출 때 금액 8필드(`buy_watch_amount` … `cancel_watch_amount`)를 60/64 에코값 그대로 되싣는다 — 웹이 주 필드를 바꿔 보내면 짝이 맞는 금액(`floor(만원×10000÷비교가) == 주`) 또는 0 을 싣는다. C# 단말 칸의 만원 원값이 웹 재제출로 지워지지 않는다
- [ ] **AMT-03**: 84 `post_buy_floor_amount` 를 /me 기본설정에 표시·설정한다 — 42 는 12값 전체 교체에 이 필드를 포함하고 봉인 필드 `post_buy_floor_qty` 는 0
- [ ] **AMT-04**: 「만(주)」 단위 표시 도입 여부를 결정해 인박스 노트 질문 2개에 답하고 닫는다 — 도입하면 환산 규칙(gh-trade `docs/strategy/limit-chaser.md` §10 · 제출 내림 · 표시 반올림 · 그룹별 비교가 · 비교가 0 이면 등록 거부)을 그대로 공유, 안 하면 AMT-02 되싣기만

### 문서

- [ ] **DOCS-01**: CLAUDE.md 다이어트 — 세션마다 로드되는 분량을 핵심 규칙만으로 줄인다(스택 표 · 법적 판례 · 설치 참조 · 출처 링크는 `docs/` 로 이동, 운영 5원칙·공식 API 기준·인박스·컨벤션은 요약 유지). quick 으로 처리, 로드맵 phase 없음

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
| IPMAC-01 | Phase 30 | Pending |
| IPMAC-02 | Phase 30 | Pending |
| IPMAC-03 | Phase 30 | Pending |
| IPMAC-04 | Phase 30 | Pending |
| IPMAC-05 | Phase 30 | Pending |
| AMT-01 | Phase 31 | Pending |
| AMT-02 | Phase 31 | Pending |
| AMT-03 | Phase 31 | Pending |
| AMT-04 | Phase 31 | Pending |
| DOCS-01 | quick | Pending |

**Coverage:**
- v1.1 requirements: 10 total
- Mapped to phases: 9 (Phase 30: IPMAC 5 · Phase 31: AMT 4)
- Quick (phase 없음): 1 (DOCS-01)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-11*
*Last updated: 2026-10-11 — Phase 30 discuss 에서 IPMAC-05(계좌명 편집) 추가*
