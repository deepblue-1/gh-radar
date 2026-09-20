---
status: testing
phase: 17-gh-trade-led
source: [17-VERIFICATION.md]
started: 2026-09-20T11:50:00Z
updated: 2026-09-20T11:50:00Z
---

## Current Test

number: 1
name: gh-trade 게이트웨이 HEAD 와의 실기 왕복 — 76/77/78 드롭 0 · `lc.arm` → 36/37/38 → 60 에코 LED 색 전환
expected: |
  상따 화면(`/trading/limit-chaser/{키}`)에서 매수·매도·취소 LED 를 클릭하면
  - 클릭 즉시 `{t:"lc.arm"}` 1건이 relay 로 나간다
  - relay 로그에 `unknown-msg-type` warn 없이 60 에코가 도착한다
  - LED 색이 회색 ↔ 주황 ↔ 초록으로 바뀐다
  - 무장 위반 클릭(예: 매도잔량 기준에서 매수 래치)에서는 서버 한글 WARN 문구가 상태바에 뜬다
  겸해서 76/77/78 신규 푸시가 드롭 경고 0 으로 흐른다.
awaiting: user response

## Tests

### 1. 래치 LED 클릭 왕복 + 신규 푸시 드롭 0 (D-25)
expected: 위 Current Test 의 expected 와 동일
result: [pending]

경로는 둘 중 하나 (아무거나 하나면 닫힌다):

**(a) 다음 장중 프로덕션 관측 — 추가 설치 없음**
  평일 08:00~20:00 KST 에 https://gh-radar-webapp.vercel.app 의 상따 화면에서 LED 클릭.
  프로덕션은 이미 이 phase 의 코드(`ef1499a`)로 배포돼 있다.

**(b) 로컬 mock 게이트웨이 — 장 시간과 무관**
  ```
  sudo xcodebuild -license                      # 사람만 가능 (현재 차단 지점)
  cd /Users/alex/repos/gh-trade/server
  ./scripts/build.sh --server-only              # 약 45초
  ./scripts/run-mac.sh
  cd /Users/alex/repos/gh-radar && ./dev.sh --with-relay   # webapp PORT=3100
  ```

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

- 코드 층위는 22개 관찰 가능한 진실 중 21개가 VERIFIED (정적 분석 + 재실행한 자동 게이트).
- 이 1건은 Phase 17 코드의 결함이 아니라 **검증 환경의 한계**다 — 실기 왕복은 정적 분석으로 증명할 수 없는 런타임 사실이고, mock 빌드는 Xcode 27.0 라이선스 미동의로 막혀 있다.
- 이 테스트가 통과하면 **WINDOWS #17 이 닫히고 TRADE-04 · TRADE-05 를 Complete 로 재판정**한다.
