---
status: complete
phase: 31-limitchaser-amount-unit
source: [31-VERIFICATION.md]
started: 2026-10-11T23:21:48Z
updated: 2026-10-12T08:09:15.759Z
---

## Current Test

[testing complete]

## Tests

### 1. relay 배포 → smoke-relay.sh 통과 → 이미지 태그 기록
expected: 라이브 relay 가 2234a1b5 에서 새 태그로 바뀌고 smoke 통과. relay 가 webapp 보다 먼저 나간다(새 번들이 먼저 나가면 구 relay zod 가 금액 키를 떨어뜨린다).
result: pass

### 2. Vercel 미리보기 고유 URL 배포(--skip-domain · push 없음) · 화면 확인
expected: trade.jx1.io 배포 ID(dpl_JAmpb3m3tmUnZ6qvfxpSEvTcpLQK) 전후 불변. 미리보기에서 수량 8칸 두 줄 행(위 만원 / 아래 주) · 시트 환산 안내 · 비교가 0 「비교가격 필요」 · /me 「후매수 최소(만원)」 · 주문로그 「N만(M주)」. UI-REVIEW 의 685 폭 여유 0.4px · S3/S4/S6 시각 확인 포함.
result: pass

### 3. gh-trade 서버 배포 뒤 실서버 실증
expected: C# 만원 입력 종목을 웹에서 재제출해도 60 에코 금액 원값 유지(예 sell_watch_amount: 100). /me 후매수 최소 저장 → 84 post_buy_floor_amount = 저장값 · post_buy_floor_qty 0.
result: pass

### 4. AMT-01 — gh-trade 병합 뒤 master 기준 재대조
expected: merge-base --is-ancestor exit 0 · master worktree 기준 sync-relay-schema.sh --check 「신규/변경 예정 0 개 · .fbs 사본 최신」 · 생성물 마커 접두 = master FBS 마지막 커밋. 다르면 relay/src/generated/ 재생성 경로 지정 커밋(D-15).
result: pass
source: automated
evidence: "2026-10-12 17:0x KST Claude 실측 — gh-trade master = origin/master = feature/limitchaser-amount-unit = 959382fb(fast-forward), merge-base --is-ancestor exit 0, master FBS 마지막 커밋 e5b4fbca = 생성물 마커 server-repo-commit e5b4fbca, sync-relay-schema.sh --check 「신규/변경 예정 0 개 · .fbs 사본 최신」 exit 0 → 재생성 불필요"

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
