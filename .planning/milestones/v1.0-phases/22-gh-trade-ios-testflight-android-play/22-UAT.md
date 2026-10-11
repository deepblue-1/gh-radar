---
status: complete
phase: 22-gh-trade-ios-testflight-android-play
source: [22-VERIFICATION.md]
started: 2026-09-27T08:07:49Z
updated: 2026-09-27T10:40:18Z
---

## Current Test

[testing complete]

## Tests

### 1. 본인 iPhone 에서 TestFlight 내부 그룹이 두 번째 빌드(202609271538)를 자동으로 밀어주는지, 업데이트 후 로그인이 유지되는지 확인한다
expected: 사용자 조작 없이 새 빌드가 나타나고, 업데이트 후에도 재로그인 없이 홈에 도착한다(D-03)
result: pass

### 2. 본인 Android 기기에서 Firebase 「새 빌드」 알림(또는 App Tester)을 탭해 versionCode 609271542 로 삭제 없이 덮어 설치하고 로그인이 유지되는지 확인한다
expected: 탭 → 덮어 설치로 업데이트되고 로그인이 유지된다(D-15)
result: pass

### 3. 테스터가 mobile/README.md 「테스터 안내」 문구만 보고 iPhone 3단계 · Android 4단계를 완료해 로그인 → 홈에 도착하는지 확인한다
expected: 문서화된 단계 수(iOS 3 · Android 4)를 넘지 않고 설치·로그인에 성공한다(D-02 · D-13)
result: pass

### 4. dma_credentials 가 없는 계정으로 로그인해 트레이딩 탭을 열고 DmaGate 안내만 보이는지 확인한다
expected: 시세·주문 UI 없이 DmaGate 안내만 보인다 — 트레이딩 권한이 부여되지 않았다(D-04)
result: pass

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
