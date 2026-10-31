---
status: testing
phase: 35-launch-gate
source: [35-VERIFICATION.md]
started: 2026-11-01T00:00:00+09:00
updated: 2026-11-01T00:00:00+09:00
---

## Current Test

number: 1
name: 35-REVIEW CR-01 처리 결정 — 발사 계획 저장에서 「송신 뒤 결과 불명」 을 offline(미반영) 으로 확정 보고하는 경로를 고칠지, 알려진 한계로 받아들일지
expected: |
  고친다면 relay/server/webapp 세 곳에서 송신 뒤 실패를 timeout(모름)으로 보고하고 웹이 계획을 재조회한다.
  받아들인다면 35-REVIEW-DISPOSITION.md 에 deferred + 사유를 적는다.
awaiting: user response

## Tests

### 1. 35-REVIEW CR-01 처리 결정 — 송신 뒤 결과 불명을 offline(미반영)으로 확정 보고·이력 기록
expected: 고친다면 relay/server/webapp 세 곳에서 송신 뒤 실패를 timeout(모름)으로 보고하고 웹이 계획을 재조회한다. 받아들인다면 35-REVIEW-DISPOSITION.md 에 deferred + 사유를 적는다.
result: [pending]

### 2. WR-01(저장 ok 인데 plan:null 이면 화면이 저장 전 계획 유지) · WR-02(백필 pieceKey/headKey 에 fire_base 누락) 처리 결정
expected: WR-01 은 CR-01 과 같은 웹 onSave 분기에서 같이 고친다. WR-02 는 백필이 이미 적재 완료라 재사용 시에만 영향 — 고치거나 deferred 로 기록.
result: [pending]

### 3. UI 검토(35-UI-REVIEW 15/24) — µs 입력칸 포커스 링 · 지도 값 hover 전용 · 작은 터치 타깃
expected: 폰 390 · 키보드 포커스에서 입력칸 포커스가 보이고, 지도 값이 터치에서도 읽힌다.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
