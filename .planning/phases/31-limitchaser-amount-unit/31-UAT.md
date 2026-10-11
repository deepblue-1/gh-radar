---
status: testing
phase: 31-limitchaser-amount-unit
source: [31-VERIFICATION.md]
started: 2026-10-11T23:21:48Z
updated: 2026-10-11T23:21:48Z
---

## Current Test

number: 1
name: relay 배포 → smoke-relay.sh 통과 → 이미지 태그 기록
expected: |
  라이브 relay 가 2234a1b5 에서 새 태그(병합 커밋 88e0ed31 이후 HEAD)로 바뀌고 smoke 가 통과한다. 장 시간 08:00~20:00 KST 밖 권장.
awaiting: user response

## Tests

### 1. relay 배포 → smoke-relay.sh 통과 → 이미지 태그 기록
expected: 라이브 relay 가 2234a1b5 에서 새 태그로 바뀌고 smoke 통과. relay 가 webapp 보다 먼저 나간다(새 번들이 먼저 나가면 구 relay zod 가 금액 키를 떨어뜨린다).
result: [pending]

### 2. Vercel 미리보기 고유 URL 배포(--skip-domain · push 없음) · 화면 확인
expected: trade.jx1.io 배포 ID(dpl_JAmpb3m3tmUnZ6qvfxpSEvTcpLQK) 전후 불변. 미리보기에서 수량 8칸 두 줄 행(위 만원 / 아래 주) · 시트 환산 안내 · 비교가 0 「비교가격 필요」 · /me 「후매수 최소(만원)」 · 주문로그 「N만(M주)」. UI-REVIEW 의 685 폭 여유 0.4px · S3/S4/S6 시각 확인 포함.
result: [pending]

### 3. gh-trade 서버 배포 뒤 실서버 실증
expected: C# 만원 입력 종목을 웹에서 재제출해도 60 에코 금액 원값 유지(예 sell_watch_amount: 100). /me 후매수 최소 저장 → 84 post_buy_floor_amount = 저장값 · post_buy_floor_qty 0.
result: [pending]

### 4. AMT-01 — gh-trade 병합 뒤 master 기준 재대조
expected: merge-base --is-ancestor exit 0 · master worktree 기준 sync-relay-schema.sh --check 「신규/변경 예정 0 개 · .fbs 사본 최신」 · 생성물 마커 접두 = master FBS 마지막 커밋. 다르면 relay/src/generated/ 재생성 경로 지정 커밋(D-15).
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
