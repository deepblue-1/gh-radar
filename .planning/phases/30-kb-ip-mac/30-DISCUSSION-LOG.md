# Phase 30: 인박스 KB 계좌별 주문자 IP/MAC - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-11
**Phase:** 30-kb-ip-mac
**Areas discussed:** 계좌 편집 모양, 추가 폼에 IP/MAC, 계좌 줄 IP/MAC 표시, code 7 문구 회신

범위 추가(사용자 요청): 기존 계좌의 계좌명 편집 → IPMAC-05 로 REQUIREMENTS · ROADMAP 반영.

---

## 계좌 편집 모양 (목업 `reference/mockup-account-edit.html`)

| Option | Description | Selected |
|--------|-------------|----------|
| A 항상 입력칸 | 계좌명 제목줄 밑줄 칸 · KB IP/MAC 칸 늘 노출 · 바꾸면 카드 아래 「되돌리기 · 저장」 | |
| B 카드 펼침 | 평소 읽기 전용 · 「편집」 → 그 카드 안 입력칸 · 도움말 · 취소/저장 · 한 번에 한 카드 | ✓ |
| C 작은 시트 | 「편집」 → 폰 시트 위 작은 시트 / 데스크톱 다이얼로그 | |

**User's choice:** B 카드 펼침 (권장)

---

## 추가 폼에 IP/MAC

| Option | Description | Selected |
|--------|-------------|----------|
| 넣지 않음 | 만든 뒤 카드 「편집」 에서만 — 입력 자리 1곳 | ✓ |
| 「+ 계좌 추가」 폼에만 | 추가 폼(KB)에 선택 칸 2개 | |
| 추가 폼 + 사용자 생성 | 첫 계좌까지 입력 자리 3곳 | |

**User's choice:** 넣지 않음 (권장)

---

## 계좌 줄 IP/MAC 표시

| Option | Description | Selected |
|--------|-------------|----------|
| 흐린 「미설정」 줄 | 「주문자 IP · MAC 미설정(서버 NIC 값)」 | ✓ |
| 줄 숨김 | 설정된 계좌만 줄 표시 | |
| 경고색 미설정 | 같은 서버 KB 계좌 2개 이상 미설정이면 주황 경고 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 경고 한 줄 | 주문 서버 값 표시 + 「KB121 은 다른 값 — 저장하면 같아져요」 | ✓ |
| 서버별 줄 나열 | 다를 때 서버마다 한 줄 | |
| 신경 안 씀 | 주문 서버 값만 | |

**User's choice:** 흐린 미설정 줄 · 경고 한 줄 (둘 다 권장)

---

## code 7 문구 회신

| Option | Description | Selected |
|--------|-------------|----------|
| 넓혀 달라 | 「다른 지점번호/거래자ID/주문자 IP·MAC 으로 보유」 — 웹은 문장 대조 안 함 | ✓ |
| 그대로 두라 | 종전 문구 유지 | |

**User's choice:** 처음엔 「설명을 더 해줘」 → code 7 의미(공유 계좌 설정 일치 규칙) · 문구 혼동 예시 · 공유 계좌 편집 시 code 7 거절 가능성을 설명 → 「넓혀 달라」.
**Notes:** 공유 계좌 처리는 ① 거절 문구 표시만(일괄 반영 안 함)으로 결정.

---

## Claude's Discretion

- IP/MAC 을 DB 없이 PUT → planner 로 넘기는 경로, 개요 뷰의 서버별 IP/MAC 노출, 계좌명 빈 값·길이, 편집 카드 전환 동작, op 5 재조회 실패 처리, 멱등 비교 방식

## Deferred Ideas

- 공유 계좌 IP/MAC 일괄 반영
- 계좌 생성 시 IP/MAC 입력
