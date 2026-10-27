# Phase 35: 발사 경계 지도 어드민 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-27
**Phase:** 35-launch-gate
**Areas discussed:** 적재 모델, 백필, 주문 내역 화면, 경계 지도 화면

---

## 적재 모델

| Option | Description | Selected |
|--------|-------------|----------|
| 그대로 저장·그대로 표시 | 계좌·사용자 원문 저장 + 어드민 표 노출 | ✓ |
| 저장은 그대로, 표시는 마스킹 | 화면은 계좌 뒤 4자리 | |
| 계좌·사용자 저장 안 함 | 조각 표에 열 없음 | |

| Option | Description | Selected |
|--------|-------------|----------|
| A 도 받아 주문 내역에만 | kind 17·18 에 A 포함 · 지도에는 안 그림 | |
| A 는 받지 않음 | Q16·N 만 | |
| (자유 입력) | A 는 09:00:27 KRX 매수 뒤 09:00:30 NXT 매도 — N 매수와 A 매도가 같은 순간 NXT 로 나가므로 09:00:30 지도에 합쳐 같이 본다 | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| kind 18 우선, 백필만 계산 | 라이브 머리는 서버 값 · 백필은 조각에서 셀 수 있는 값만 + source='backfill' | ✓ |
| 항상 조각에서 계산 | kind 18 은 보조 열만 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 둘 다 영구 보관 | launch_* · kind 17·18 원문 purge 없음 | ✓ |
| 풀린 표만 영구, 원문 30일 | 원문은 15·16 purge 에 포함 | |

**User's choice:** 계좌 그대로 · A 포함(09:00:30 NXT 합지도 · 매수/매도 구별) · kind 18 우선 · 영구 보관
**Notes:** A 의 09:00:27 KRX 매수 조각은 주문 내역에만. gh-trade 에 조각마다 송신 거래소·발사 기준시각·side 를 명시해 달라고 회신하기로.

---

## 백필

| Option | Description | Selected |
|--------|-------------|----------|
| 로그에 남은 전부, 지금 바로 | 두 서버 · 16:00 + 09:00:30 · 가장 이른 날부터 · 정식 인계 전 요청 | ✓ |
| 로그에 남은 전부, 정식 인계와 함께 | 칸 매핑 표와 같이 받음 | |
| 10/12 이후만 | 첨부 범위 + 09:00:30 만 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 뽑히는 값만 넣고 나머지 null | 주문 속성 열 nullable · 화면 「—」 · source='backfill' | ✓ |
| 주문 속성 없는 날은 제외 | 종일 값 있는 행만 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Claude가 실행 | dry-run → --apply · 키는 비출력 래퍼 · 실행 전 명령 제시 | ✓ |
| 직접 실행 | Claude 가 한 줄 만들고 사용자가 `!` 로 실행 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 자동 대조 + 어드민 화면 눈 확인 | pieces.json → DB 집계 = 첨부 HTML 계산 단언 + 지도 나란히 확인 | ✓ |
| 어드민 화면 눈 확인만 | 자동 단언 없음 | |

**User's choice:** 로그 전부 지금 요청 · 빈 열 null · Claude 실행 · 자동 대조 + 눈 확인
**Notes:** 사용자 중간 메시지 「지금까지 서버가 쐈던 데이터도 gh-trade 통해서 받아와서 저장해놓자」 가 범위를 정했다.

---

## 주문 내역 화면 (목업 `reference/mockup-launch-orders.html`)

| Option | Description | Selected |
|--------|-------------|----------|
| Admin 항목 1개 「발사」 + 탭 2개 | 페이지 안 탭 주문 내역 \| 경계 지도 · ?tab= 딥링크 | ✓ |
| Admin 항목 2개 | 독립 페이지 2개 | |

| Option | Description | Selected |
|--------|-------------|----------|
| A 서버×시장 섹션 | 머리 카드 4장 + 서버·시장별 조각 표 | ✓ |
| B 머리 표 + 평탄 조각 표 | 머리 4행 표 + 필터 칩 + 조각 한 표 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 목업 열 그대로 | wire · 예약·조각·라운드 · 송신 µs · 결과 · 접수 시각 · 종목 · 구분 · 가격 · 수량/체결 · 계좌 · 사용자 · 주문번호 (+09:00:30 발사·재전송) | ✓ |
| 주문번호·예약 id 숨김 | 툴팁/펼침으로 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 표 가로 스크롤 그대로 | 폰 = 카드 1열 + 표 스크롤 | ✓ |
| 폰은 카드 행 | 조각 1건 = 카드 | |

**User's choice:** 메뉴 1개+탭 · 변형 A · 열 그대로 · 표 스크롤
**Notes:** 사용자가 목업을 브라우저에서 보고 답함. 사용자 중간 메시지 「경계지도 목업은 안보여줘?」 로 다음 영역 목업을 바로 열었다.

---

## 경계 지도 화면 (목업 `reference/mockup-launch-gate-map.html`)

| Option | Description | Selected |
|--------|-------------|----------|
| A 프리셋 칩 | 최근 10일 · 20일 · 전체 + 범위 텍스트 | ✓ |
| B 시작·끝 날짜 | 범위 입력 부품 신설 | |
| A + B 둘 다 | 칩 옆 「직접 지정」 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 첨부 구성 전부 유지 | 요약 카드 + 4패널 + 리본 + 날짜 표 접힘 | ✓ |
| 리본 빼고 점 지도 + 경계 띠만 | 패널 짧아짐 | |
| 요약 카드도 빼고 4패널만 | 가장 단순 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 이 꼴 그대로 | N 매수 원 · A 매도 마름모 한 패널 · 첫 발만 점 · 재전송 툴팁 · 고정 오프셋 선 | ✓ |
| 재전송도 점으로 | 서버가 재전송 시각을 줘야 함 | |
| 매수·매도 패널 분리 | 8패널 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 가로 스크롤 그대로 | SVG 640 고정 · 카드 2열 | ✓ |
| 폰은 폭에 맞춰 축소 | 390 에 맞춰 줄임 | |

**User's choice:** 프리셋 칩 · 첨부 구성 유지 · 09:00:30 합패널 · 가로 스크롤
**Notes:** 09:00:30 데이터는 10/26 하루 실측 + A 매도 2행 합성으로 보여 줌.

---

## Claude's Discretion

- 표·RPC·라우트·파일·타입 이름 · 발사 기준 열 표현 · 해석 위치(apply 재정의 vs 트리거) · 칸 매핑 코드 구조
- 쿼리 파라미터 이름 · 탭 상태 보존 · 빈 상태/오류 문구 · 스켈레톤
- 차트 세부(높이 · 눈금 · 스태킹 · 리본 높이) · 숫자 형식
- 백필 스크립트 인자 · dry-run 출력 · E2E/단위/SQL 테스트 구성

## Deferred Ideas

- 시작·끝 날짜 입력 부품 · 재전송 점 표시(서버 시각 필요) · 변형 B 평탄 표 + 필터 · 계좌 마스킹 토글 · kind 17·18 라벨/fbs 주석 sync(정식 노트 뒤) · 백필 09:00:30 side 복원(gh-trade 몫)

---

# 범위 7 추가 discuss — 발사 계획 어드민 (2026-10-27)

**Areas discussed:** 화면 자리·지도 연결, 칸 편집·저장 방식, 저장 전 미리보기, 변경 이력·변경자
**입력:** 인박스 `docs/inbox/from-gh-trade/261027-launch-plan-admin.md` (gh-trade Phase 43 · 목업 먼저)

## 화면 자리·지도 연결 (목업 `reference/mockup-launch-plan-place.html`)

| Option | Description | Selected |
|--------|-------------|----------|
| B 경계 지도 패널 안 | 패널마다 「다음 발사 계획」 줄 + 「계획 고치기」 → 패널 안 편집 · 점선 = 계획 조각 전부 | ✓ |
| A 「발사」 3번째 탭 | 주문 내역 · 경계 지도 · 발사 계획 · 칸마다 「경계 지도에서 보기 →」 | |
| C 별도 메뉴 | Admin 「발사 계획」 항목 · 한 화면에 칸 8개 · 머리 링크로 지도 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 서버 현재 계획 조회 | relay admin 연결로 조회 · 서버 꺼짐이면 kind 18 마지막 발사 값 대신 + 고치기 막음 | ✓ |
| 마지막 발사 값만 | kind 18 값만 · 저장 계획은 다음 발사 뒤에 보임 | |

**User's choice:** B · 서버 현재 계획 조회

## 칸 편집·저장 방식 (목업 `reference/mockup-launch-plan-edit.html`)

| Option | Description | Selected |
|--------|-------------|----------|
| A 조각마다 직접 입력 | 조각 수 −/+ · 칸마다 µs · 순서 위반 빨간 테두리 + 저장 막음 | ✓ |
| B 첫 시각 + 간격 | 첫 조각 µs + 조각별 간격 · 결과 줄 | |
| C 직접 입력 + 고르게 채우기 | A + 「첫 · 간격 → 채우기」 도우미 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 바로 보냄 | Phase 36 결 · 확인창 없음 | ✓ |
| 확인 한 번 | 전 → 후 확인창 뒤 송신 | |

**User's choice:** A · 바로 보냄 (저장 단위 = 패널 1칸 · 적용 시점 안내 문구는 목업 그대로 이의 없음)

## 저장 전 미리보기 (목업 `reference/mockup-launch-plan-preview.html` · gh-trade 질문 1)

| Option | Description | Selected |
|--------|-------------|----------|
| P2 선 + 조각별 「쐈다면」 | 바꿀 조각 노란 실선 + 조각마다 지난 N일 접수·모름·거부 날 수 지금/바꿀 | ✓ |
| P1 바꿀 계획 선만 | 노란 실선만 | |
| 없음 | 저장 뒤 점선 갱신 | |

**User's choice:** P2

## 변경 이력·변경자 (gh-trade 질문 2)

| Option | Description | Selected |
|--------|-------------|----------|
| 남기고 패널에 마지막 변경 + 이력 접힘 | 저장마다 1행 영구 · 마지막 변경 시각·이메일 · 「변경 이력」 접힘 | ✓ |
| 남기고 마지막 변경만 표시 | DB 에만 이력 | |
| 남기지 않음 | 서버 현재 값만 | |

**User's choice:** 남기고 패널에 마지막 변경 + 이력 접힘

## gh-trade 회신 시점

| Option | Description | Selected |
|--------|-------------|----------|
| 지금 보냄 | CONTEXT 커밋과 함께 trade-handoff 노트 + SendMessage · 본문 먼저 보여 줌 | ✓ |
| 플랜 첫 태스크로 | plan-phase 첫 플랜에서 | |

## Claude's Discretion (범위 7)

- 이력 표 · 라우트 · relay HTTP 이름 · 이력 행을 쓰는 쪽(server vs relay) · 이력 읽기 왕복 배치
- 펼침 상태 · 접힘 건수 · 시각 표기 · 입력 폭 · 폰 배치 · 줄 문구 · 스켈레톤 · 실패 시도도 이력 1행(결과 열)

## Deferred Ideas (범위 7)

- gh-radar 밖 계획 변경 감지(현재 값 ≠ 마지막 이력) · 지도 위 끌기 편집 · 서버/시장 간 복사 · 간격 채우기 도우미
