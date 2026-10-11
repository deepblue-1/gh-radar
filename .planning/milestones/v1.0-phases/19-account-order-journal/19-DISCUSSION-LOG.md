# Phase 19: 계좌별 주문기록 전용 연결 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-24
**Phase:** 19-account-order-journal
**Areas discussed:** 기록 주체 단일화, 저장 모델·화면 필터, 관찰자 자격·보안 경계, 보관·이어받기·운영 시간

---

## 기록 주체 단일화

**Q1. 주문 통보를 DB 에 쓰는 주체**

| Option | Description | Selected |
|--------|-------------|----------|
| 관찰자 단독 | 사용자 세션은 DB 미기록, 수동 주문 즉시 응답만 rid 로 탭에 | ✓ |
| 둘 다 쓰고 멱등 upsert | 세션 기록 유지 + 관찰자가 빈 곳 채움 | |
| 요청은 세션, 통보는 관찰자 | requested 행만 세션, 이후는 관찰자 | |

**Q2. 게이트웨이 로컬 거부(주문번호 없음) 기록**

| Option | Description | Selected |
|--------|-------------|----------|
| 기록 — 게이트웨이가 발행 | seq 키 행 | ✓ |
| 기록 안 함 | 브로커 통보만 | |

**Q3. 「오늘 주문」 카드 실시간 원천**

| Option | Description | Selected |
|--------|-------------|----------|
| 관찰자 기록 후 푸시 | 계좌 접근 가능 사용자 연결에 새 프레임 | ✓ |
| 지금처럼 세션 51 + REST 병합 | 웹앱 변경 최소 | |

**Q4. 관찰자 끊김 표시**

| Option | Description | Selected |
|--------|-------------|----------|
| 카드 표식 + healthz·알림 | 「기록 지연」 표식 | ✓ |
| healthz·알림만 | 화면 표시 없음 | |

---

## 저장 모델·화면 필터

**Q1. 계좌 기준 기록 위치**

| Option | Description | Selected |
|--------|-------------|----------|
| 새 테이블 + dma_orders 동결 | 이관 없음 | ✓ |
| dma_orders 계좌 기준 이관 | 중복·빈 계좌 행 정리 필요 | |
| 새 테이블 + 과거 행 복사 | 과거 이력 한 곳에 | |

**Q2. 사용자별 가시 행 필터 원천**

| Option | Description | Selected |
|--------|-------------|----------|
| 계좌 — 관찰자가 매핑 수신 | users.toml 전체 매핑을 관찰자로 받아 DB 동기화 | ✓ |
| 계좌 — 사용자 로그인 때 저장 | LoginResp.accounts 저장, 게이트웨이 무변경 | |
| DMA 사용자 기준 | 매핑 불필요, 같은 계좌 타 사용자 주문 안 보임 | |

**Q3. 카드 표시.** 사용자가 처음에 「오늘 주문 카드가 어디있는거야? 목업 보고 진행하고 싶어」라고 답했다. 그래서 위치(My page 맨 아래)를 안내하고 HTML 목업 `19-today-orders-mockup.html`(현재·A·B·C)을 만들어 연 뒤 다시 물었다.

| Option | Description | Selected |
|--------|-------------|----------|
| A — 목록 1개 + 계좌 라벨 | 현 구조 유지 | |
| B — 계좌별 묶음 | 계좌마다 소제목·목록 | ✓ |
| C — A + 「다른 단말」 칩 | 타 DMA 사용자 주문 표식 | |

**Q4. 출처·거래소 라벨**

| Option | Description | Selected |
|--------|-------------|----------|
| 출처 전 행 + NXT 만 | 상따·VI·수동 칩 + NXT 태그 | ✓ |
| 출처만 | 거래소 숨김 | |
| 지금처럼 | 라벨 확장 없음 | |

**Notes:** B′(B + 출처 칩 + NXT + 기록 지연 표식)로 목업을 갱신해 다시 열었고, 사용자가 「B′ 확정」했다. 목업 작성 중 현 카드의 390px 주문번호 잘림 결함을 발견했으며, 이 phase 에서 함께 고친다.

---

## 관찰자 자격·보안 경계

**Q1. 자격 모델**

| Option | Description | Selected |
|--------|-------------|----------|
| 별도 관찰자 설정 + 전용 로그인 | [observer] 비밀·새 로그인 메시지 | ✓ |
| users.toml 역할 필드 | 기존 LoginReq, 계좌 0건 예외 필요 | |

**Q2. 접속 출발지**

| Option | Description | Selected |
|--------|-------------|----------|
| 비밀 + 출발지 대역 제한 | 실측 대역 allowlist | |
| 비밀만 | 출발지 무관 | ✓ |

**Q3. 기록 범위**

| Option | Description | Selected |
|--------|-------------|----------|
| gh-radar 사용자의 계좌만 | 최소 보관 | |
| 게이트웨이 전 계좌 | 필터 없음, 나중 매핑 시 즉시 보임 | ✓ |

---

## 보관·이어받기·운영 시간

**Q1. 게이트웨이 버퍼.** 처음에는 사용자가 「supabase 에 기록으로 남기는게 좋지않아?」라고 답했다. 최종 기록은 Supabase 이고 이 질문은 relay 부재 구간을 넘길 버퍼를 묻는 것이라고 설명한 뒤, 「게이트웨이가 Supabase 직접 기록」 선택지를 추가해 다시 물었다.

| Option | Description | Selected |
|--------|-------------|----------|
| 디스크 버퍼 | 재시작해도 since_seq 이어받기 | ✓ |
| 메모리 버퍼 | 게이트웨이 재시작 겹치면 누락 | |
| 게이트웨이가 Supabase 직접 기록 | 내부망 출구·C++ HTTP·키 배치 필요 | |

**Q2. 연결 유지 시간**

| Option | Description | Selected |
|--------|-------------|----------|
| 24시간 상시 | 알림은 장중만 | ✓ |
| 장중만 | 시간표 로직 | |

**Q3. 전환 방식**

| Option | Description | Selected |
|--------|-------------|----------|
| 그림자 병행 후 전환 | 1~2일 대조 후 카드 전환 | |
| 한 번에 전환 | 장 마감 뒤 일괄 배포 | ✓ |

---

## Claude's Discretion

- 행 모델(주문 1행 + 단조 상태 전이, 원시 이벤트 로그 여부)
- seq 범위·거래일 경계·relay 커서 저장
- 기록 통보 MsgType 번호·필드
- 테이블·컬럼·인덱스 이름, RLS/RPC 형태
- 푸시 프레임 형식, 백오프 수치, 알림 임계, healthz 필드
- 게이트웨이 디스크 보관 일수, 다중 게이트웨이 식별

## Deferred Ideas

- 관찰자 출발지 IP 제한
- dma_orders 삭제·과거 이력 화면
- 교보(112) 관찰자
- 「다른 단말」 칩(변형 C)
- 그림자 병행 전환
