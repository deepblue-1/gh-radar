---
status: testing
phase: 20-toss-order-ticket
source: [20-VERIFICATION-R2.md]
started: 2026-09-25T09:10:00Z
updated: 2026-09-25T09:10:00Z
---

## Current Test

number: 1
name: 호가 탭 상태줄(D-24 안 C) 톤 대조
expected: |
  종목상세 호가 탭 상단 상태줄이 목업 status-strip-variants.html 안 C 와 색·둥근면·간격·정렬이 합치한다(다크/라이트 · 폰 360/390 · 태블릿 768 · 데스크톱 1280).
awaiting: user response

## Tests

테스트 빌드: https://gh-radar-webapp-qbf64htb3-alexs-projects-eabbefc0.vercel.app (커밋 a020d7a · 운영 도메인 미승격 · 실 relay/실계좌 연결 — 주문은 실제로 나간다)

### 1. 호가 탭 상태줄(D-24 안 C) 톤 대조
expected: 목업 status-strip-variants.html 안 C 와 시각적으로 합치한다(다크/라이트 · 폰 360/390 · 태블릿 768 · 데스크톱 1280)
result: [pending]

### 2. 우측 패널 전체 톤 대조 (목업 8차)
expected: 목업 index.html 과 다크/라이트 · 폰 390(터치) · 태블릿 768(터치) · 데스크톱 1280(마우스)에서 톤(색·둥근면·간격)이 합치한다
result: [pending]

### 3. 하이브리드 기기 시트/인라인 분기
expected: 주 포인터가 터치(coarse)면 행 탭 → 키패드 시트, 정밀(fine)이면 클릭 → 인라인 편집. 보조 포인터에 영향받지 않는다
result: [pending]

### 4. 결과 모름 대기 7초(LC_ORPHAN_WAIT_MS) 체감
expected: 무응답 뒤 다른 필드가 최대 7초 「반영 중…」으로 잠기는 것이 실사용 지연에 비해 과하지도 짧지도 않다
result: [pending]

### 5. 새 문구 3종 어조
expected: 범위 검증 문구(「{N}{단위} 이상 입력해 주세요」·「최대 {N}{단위}까지 입력할 수 있어요」) · ETP 경고(「주식 호가 단위(N원)와 달라요 · 가까운 값 A / B」) · 「주문금액 미입력」이 기존 문구 어조와 맞는다
result: [pending]

### 6. 레거시 전략(서버 주문금액 0) 실환경 관찰
expected: 금액 행 「—」 · 다른 값 확정 시 「주문금액을 먼저 입력해 주세요」 · 끄기는 수량 불변으로 허용 · 금액 입력 후 정상 동작. 실 relay 지연에서 CR-02/CR-03 판정도 정상
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
