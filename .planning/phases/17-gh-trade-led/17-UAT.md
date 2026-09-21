---
status: passed
phase: 17-gh-trade-led
source: [17-VERIFICATION.md]
started: 2026-09-20T11:50:00Z
updated: 2026-09-21T09:10:00Z
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
awaiting: none — 2026-09-21 장중 실기 관측 완료

## Tests

### 1. 래치 LED 클릭 왕복 + 신규 푸시 드롭 0 (D-25)
expected: 위 Current Test 의 expected 와 동일
result: **PASS** (2026-09-21 장중, 프로덕션 `ef1499a`)

관측 근거 — 경로 (a) 프로덕션 장중 관측으로 닫혔다:
- **사용자 확인:** 상따 화면에서 래치 LED 클릭 왕복이 정상 동작한다 (「LED 잘돼」).
- **relay 로그 교차검증** (프로덕션 컨테이너, 6시간 구간 527행):
  - `[HUB] 상따 에코 수신` **36건** — `lc.arm` → 36/37/38 → 60 에코 경로가 살아 있다
  - `[HUB] 돌파 집합 스냅샷 수신 — 전량 교체` **6건** — **MsgType 78** 이 실서버에서 실제로 도착·처리됐다
  - `unknown-msg-type` **0건** — 드롭 0 실증
- **정직 기록:** 76(`RateCrossAlert`)·77(`QueuedWindowState`)은 이 구간에 발화하지 않아 **실수신을 보지 못했다**(둘 다 info 로그가 없어 로그로도 판별 불가). 드롭되었다면 `unknown-msg-type` 이 섰을 텐데 0건이고, 78 이 같은 등록 경로로 실동작했으며, 세 종 모두 17-03 의 mock 테스트가 덮는다.

경로 (b) 로컬 mock 은 **불필요해졌다** — Xcode 라이선스 게이트를 우회한 것이 아니라, 실서버가 mock 보다 강한 증거를 냈다.

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
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- 코드 층위는 22개 관찰 가능한 진실 중 21개가 VERIFIED (정적 분석 + 재실행한 자동 게이트).
- 이 1건은 Phase 17 코드의 결함이 아니라 **검증 환경의 한계**다 — 실기 왕복은 정적 분석으로 증명할 수 없는 런타임 사실이고, mock 빌드는 Xcode 27.0 라이선스 미동의로 막혀 있다.
- ✅ 통과했다. **WINDOWS #17 닫힘**, **TRADE-04 · TRADE-05 Complete 로 재판정** (정의부·Traceability 대칭 확인).
- 같은 날 이 표면에서 프로덕션 결함 1건을 발견·수정·배포했다 — `/limit-chaser/new` 의 「미반영」·「수정」 버튼 영구 고착 (debug `lc-unacked-stuck-new-route`, 수정 `b31435b`).
