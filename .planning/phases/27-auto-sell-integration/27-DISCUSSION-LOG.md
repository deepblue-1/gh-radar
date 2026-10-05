# Phase 27: 자동매도 연동 — gh-trade Phase 28 와이어 계약 반영 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-05
**Phase:** 27-auto-sell-integration
**Areas discussed:** 카드 자동매도 칸, 바로시작/중지 동작, 사용자 설정 화면, 주문로그 표시

사용자가 4영역 전부 선택. 중간에 「다 정하고 나서 목업 보여 주는 건가?」 지적 → 영역 1 의 4답이 모이자 즉시 HTML 목업을 열어 검토(2회 수정) 후 채택, 영역 3 은 옵션 자체를 목업 3변형으로 제안.

---

## 카드 자동매도 칸

| Option | Description | Selected |
|--------|-------------|----------|
| 매도 pane 별도 그룹 카드 「자동매도」 | LC_SELL_GROUPS slot 'auto-sell', 매도주문·매수취소 아래 세 번째, SettingGroup 재사용 | ✓ |
| 매도주문 카드 안 하위 섹션 | 카드 수 유지, dimGate 꼬임 | |
| 매수 pane 에 넣기 | 후매수 아래 네 번째 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 제목줄 상태 칩 + 읽기 전용 행 2개 | 칩 대기/감시/매도중/완료 + 「누적 매도」「기준」 derived 행 | ✓ |
| 상태 칩만 | 누적·기준은 요약·시트에만 | |
| 칩 + 누적 한 줄 | 기준 생략 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 4번째 LED 「자동」 추가 | OFF 회색/대기·감시 초록/매도중 주황/완료 파랑, 클릭 불가 | ✓ |
| 매도 LED 에 합침 | 구분 못 함 | |
| LED 없음 — 칩만 | 헤더 그대로 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 자동매도 카드 본문 마지막 행 | 버튼 2개, 상태에 따라 하나 활성, 접히면 안 보임 | ✓ |
| 카드 제목줄(접힘 요약에도) | 접힌 채 누를 수 있음 | |
| 카드 헤더 액션 | ✕ 옆 | |

**목업 검토** (`reference/mockup-auto-sell-card.html`): 1차 「바로시작은 보유 물량을 … 설명은 빼줘」 → 버튼 아래 설명 줄 제거. 2차 「바로시작 누르면 밑에 전략로그 나오던데 없애줘」 → 카드 아래 전략 로그 패널 제거. 3차 「이대로 채택」.

**User's choice:** 전부 Recommended + 목업 2회 수정 후 채택
**Notes:** 설명 줄·로그 패널 없는 깔끔한 카드 선호.

---

## 바로시작/중지 동작

| Option | Description | Selected |
|--------|-------------|----------|
| 확인 없이 바로 전송 | 스위치 바로 반영 규율·WinForms 동형 | ✓ |
| 1회 확인 시트 | 바텀시트 확인 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 더티가 있으면 바로시작 비활성 | 「수정」 반영 후 누름, 중지는 무관 | ✓ |
| 더티 먼저 lc.set 후 41 두 단계 | 자동 2단계 | |
| 그냥 41 전송(더티 유지) | 서버 저장값으로 시작 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 3초 무응답 = 미반영 실패(lc.set 동형) | 버튼 잠금+칩 「전송…」, 60 에코 기대 전이 = 성공, 54 원문 로그, 재시도 없음 | ✓ |
| 낙관 갱신 후 에코로 교정 | 즉시 매도중 표시 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 전략 없으면 둘 다 비활성, 나머지 서버 판정 | 마지막 에코 없음 = 비활성, 보유 0·단일가·범위는 서버 54 원문 | ✓ |
| 항상 활성 | 거부 전부 서버 원문 | |
| 전략 없음 + 잔고 0 도 웹이 가림 | 계좌 잔고 조인 | |

**User's choice:** 전부 Recommended
**Notes:** 「다음 영역」 선택 — 전략 로그 문구는 서버 54 INFO 원문·클라 합성 없음으로 재량 처리.

---

## 사용자 설정 화면

| Option | Description | Selected |
|--------|-------------|----------|
| /me 마이페이지 「상따 기본설정」 섹션 | 계정 카드 아래 | ✓ |
| 상따 화면 상단 ⚙ → 시트/팝오버 | 매매 맥락에서 바로 | |
| 별도 라우트 /trading/settings | 전용 페이지 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 새 전략 폼 기본값을 84 값으로 교체 | D-04 상수 7칸 + 자동매도 비율·방법 2칸 시딩, 미수신 폴백 | ✓ |
| 설정 화면 편집만, 폼 기본값은 D-04 상수 유지 | 변경 최소 | |

저장 UX 질문에 사용자가 「목업으로 옵션제안」 → `reference/mockup-user-settings.html` 3변형 작성·열기:

| Option | Description | Selected |
|--------|-------------|----------|
| A 행 편집 + 하단 저장 바 | DirtyActionBar 동형, 42 는 저장 때 한 번 (Claude 추천) | |
| B 폼 한 장 + 저장 버튼 | 11필드 2열 그리드 | |
| C 행 확정마다 즉시 저장 | 저장 버튼 없음, 확정마다 42 전체 전송, 행 초록 플래시 | ✓ |
| 수정 후 다시 보기 | | |

**User's choice:** 위치·84 활용은 Recommended, 저장 UX 는 **C**(Claude 추천 A 와 다름)
**Notes:** 사용자 기본값은 전략 무장과 달리 즉시 반영돼도 위험이 없다는 판단으로 읽힘. present=false·84 미수신·서버 거부 상태 표시는 목업 그대로 수용.

---

## 주문로그 표시

| Option | Description | Selected |
|--------|-------------|----------|
| 「자동매도」 필터 값 신설 | 전체·선매수·추가매수·후매수·매도·자동매도·시세 | ✓ |
| 「매도」에 합침 | 필터 값 유지 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 발동·정정·상태·멈춤/재개는 값으로 갈림 | 14 는 cond_actual 로 VI 멈춤/동시호가 멈춤/재개 | ✓ |
| kind 당 한 낱말 고정(14 = 「멈춤」) | 재개도 멈춤 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 「자동매도」 배지 신설 | WinForms OriginTag 동형, AutoSell·AutoSellCommand 모두 | ✓ |
| 「상따」 배지에 합침 | | |

| Option | Description | Selected |
|--------|-------------|----------|
| 10 「매수 우선 취소」 · 11 「동시호가 감축」 | 인박스 가안·WinForms 동일 | ✓ |
| 10 「매수 우선」 · 11 「회차 감축」 | 더 짧게 | |

**User's choice:** 전부 Recommended
**Notes:** 마무리 질문에 「CONTEXT 작성」 선택 — kind 6 group 9 문장 세부는 재량.

---

## Claude's Discretion

- relay 84 캐시 자료구조·브라우저 프레임 이름·43 요청 시점·수기 사본 갱신 형태·85 드롭·42 relay 측 범위 검증 여부·테스트 픽스처
- shared/webapp 신필드 이름(camelCase 규약)·outbound union
- 조립기 문장 세부(kind 6 group 9 두 변종·11·12·13·14)
- 카드 세부(요약 순서·pend 문구·방법 3택 행 kind·더티 판정 범위·41 과 lc.set 큐 관계·LED 좁은 밴드 축약)
- 설정 섹션 세부(컴포넌트 위치·상따 화면 링크·플래시·되돌림·모바일 폭)
- 주문로그 세부(kind 12 정정 묶기·필터 키·창 분리 쿼리)
- 테스트 범위

## Deferred Ideas

- 85 LimitFeature·kind 15 중계·표시(gh-trade Phase 27 별도 인박스)
- 127 서버 배포(gh-trade 몫)
- 상따 화면 ⚙ 진입점
- 설정 변경 이력 표시
- 장전 동시호가 회차 카드 표시(에코 칸 없음)
- Rejected(8) group 9 reject_seq 조인(Phase 25 deferred 유지)
