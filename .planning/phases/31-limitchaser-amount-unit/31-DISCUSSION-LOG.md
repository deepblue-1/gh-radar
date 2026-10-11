# Phase 31: 인박스 상따 금액 단위 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-11
**Phase:** 31-인박스 상따 금액 단위
**Areas discussed:** 「만(주)」 도입 범위 (AMT-04), 수량 칸 표시 모양, /me 「후매수 최소」 행, 확인·배포 경로

---

## 「만(주)」 도입 범위 (AMT-04)

| Option | Description | Selected |
|--------|-------------|----------|
| WinForms 동형 도입 (권장) | 8칸 만원 입력 · 주 환산 표시 · 그룹 비교가 · 비교가 0·0주 거부 문구 C# 동일 · 발동·기준선 역산 · 에코 짝 검사 | ✓ |
| 되싣기만 (주 입력 유지) | AMT-02 만 — 에코 금액 그대로 되싣고 웹이 주를 바꾼 칸은 금액 0 | |
| 표시만 병기 | 입력은 주, 칸 아래 「≈ N만」 역산만 | |

**User's choice:** WinForms 동형 도입
**Notes:** 사용자 지시 「최대한 gh-trade phase 32 작업에 맞게」.

---

## 수량 칸 표시 모양 (목업 `reference/mockup-amount-unit.html`)

| Option | Description | Selected |
|--------|-------------|----------|
| A. 행 안 한 줄 병기 | 「1,000만 · 7,770주」 늘 보임, 폰 밴드 폭 부족 위험 | |
| B. 행은 만원 · 주는 시트 안 (권장) | C# 칸=만원 · 툴팁=N주 동형, 행 폭 그대로 | |
| C. 두 줄 행 | 값 아래 작은 글씨 「7,770주」, 행 44→56px | ✓ |

**User's choice:** C. 두 줄 행
**Notes:** 권장(B)과 다른 선택 — 환산 주를 늘 보이게. 데스크톱 밴드도 두 줄(Claude 재량).

---

## /me 「후매수 최소」 행

| Option | Description | Selected |
|--------|-------------|----------|
| 「후매수 최소(만원)」 로 교체 (권장) | WinForms 동형, 봉인 필드 화면에서 제거 · 42 에 0 | ✓ |
| 두 행 병행 | 옛 「하한잔량(주)」 유지 — C# 과 갈림 | |

**User's choice:** 교체

---

## 확인·배포 경로

| Option | Description | Selected |
|--------|-------------|----------|
| gh-trade 서버 배포 확인 뒤 relay (권장) | 인박스 순서 그대로, 그 전엔 webapp 미리보기만 | |
| relay 먼저 배포 허용 | 호환이라 구 서버에서도 안전, 미리보기가 새 relay 코덱을 탐 | ✓ |

**User's choice:** relay 먼저 배포 허용
**Notes:** 사용자 요구 — 브랜치 작업을 Vercel 주소로 접속해 확인할 수 있게 별도 배포(운영 도메인 불변 고유 URL). push 금지(phase 30 세션이 master 사용 중).

## Claude's Discretion

에코 짝 검사·되싣기 구현 위치, 추적 기준선 역산, 시트 상태 줄 문구, 새 폼 시딩, 인박스 답 2개 문구, 두 줄 행 컴포넌트 구현, 테스트 범위.

## Deferred Ideas

금액 3칸 환산 주 보조 표시 · 상장주식수 비율 시딩 웹 도입 · gh-trade `DropMasterAfterServerFold` quick.
