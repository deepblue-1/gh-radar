---
status: complete
phase: 30-kb-ip-mac
source: [30-07-PLAN.md Task 2 (실서버 확인)]
started: 2026-10-11T07:20:00Z
updated: 2026-10-11T10:00:00Z
---

## Current Test

[testing complete — gap 2건 해결(30-08 · 30-09) · 2라운드 재확인 통과]

## Deployed

- relay `relay:2234a1b5` (smoke 11 PASS / 0 FAIL / 2 SKIP · adminConns KB120 · KYOBO119 ready)
- server `gh-radar-server-00061-fvv` (smoke 15/15)
- webapp push `5dfb884c..2234a1b5` → Vercel 프로덕션 Ready (2026-10-11 16:06 KST, trade.jx1.io)
- 갭 클로징(30-08 · 30-09): `git diff --stat 2234a1b5..HEAD -- relay/src server/src` 빈 출력 → relay · server 재배포 없음 · webapp push `2234a1b5..34f145b1` → Vercel 프로덕션 Ready (deployment gh-radar-webapp-16xyl2l3y)
- gh-trade 261011(op 3 공유 계좌 IP/MAC 원자적 전파 · gh-trade master 46a10ce9 · 노트 done_commit d5a20cfb) → 사용자가 KB120 에 배포. KB121 은 gh-trade 배포 여부 확인 필요

## Tests

### 1. 계좌명만 저장 → op 3 직전 op 5(87) 재조회 (IPMAC-01 · D-15)
expected: 칩 「반영됨」 · 카드 IP/MAC 그대로 · relay_docker 에 op 3 결과 앞 87 수신
result: pass
evidence: relay_docker 07:22:36Z~07:23:59Z 저장 6건 모두 `users.toml 스냅샷 수신(87)` → ~30ms 뒤 `명령 결과(86) op 3 code 0` 순서.

### 2. KB 계좌 IP/MAC 저장 → 정규화 표기 표시 (IPMAC-02)
expected: 86 code 0 · 카드에 저장값 표시
result: pass
first_result: issue
reported: "IP는 123.123.123.123 형태로, MAC 은 1C:FD:08:7D:97:8E 형태로 출력해야 보기가 편할 것 같다 (지금은 전문 표기). 저장은 그렇게 하더라도 보여지는 건 보기 좋게"
severity: minor
resolved_by: 30-08 (D-17)
retest: pass (2라운드 · 2026-10-11 · 사용자) — 카드 읽기 줄 · 편집 초깃값이 `10.41.1.124` · `1C:FD:08:7D:97:8E`

### 3. 같은 값 재저장 → 「변경 없음」 (D-06)
expected: 요청 없이 「변경 없음」
result: pass
note: 사용자 「잘된다」

### 4. IP 만 입력 → 저장 비활성 + 짝 오류 문구 (D-04)
expected: 저장 버튼 꺼짐 · 「IP 와 MAC 은 둘 다 적거나 둘 다 비워 주세요」
result: pass
note: 사용자 「잘된다」

### 5. 다른 DMA 사용자와 공유하는 계좌의 IP/MAC 편집
expected: 저장 성공
result: pass
first_result: issue
reported: "DMA junysim 계정의 37728502101 계좌를 편집하려 했더니 'KB120 실패: 다른 사용자가 같은 계좌를 다른 지점번호/거래자ID 로 보유하고 있습니다'. 다른 사용자가 같은 계좌를 쓰면 그 계좌의 IP/MAC 을 같이 바꾸는 게 어떨까?"
severity: major
evidence: relay_docker 07:25:39Z · 07:25:45Z `명령 결과(86) op 3 code 7`.
resolved_by: 30-09 (D-18 · gh-radar 안내 줄 · 저장 뒤 재조회) + gh-trade 261011 (op 3 원자적 전파 · KB120 배포)
retest: pass (2라운드 · 2026-10-11 · 사용자) — junysim 37728502101 편집 모드 공유 계좌 안내 줄 표시 · KB120 에서 공유 계좌 IP/MAC 저장 + 함께 쓰는 사용자 카드 동시 갱신. KB121 은 gh-trade 배포 여부 확인 필요

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "KB 계좌 카드 · 편집칸이 주문자 IP/MAC 을 사람이 읽는 표기(IP 점표기 `10.41.1.124` · MAC 콜론 대문자 `1C:FD:08:7D:97:8E`)로 보여준다 — 저장 · 전송 · 87 비교는 그대로 정규화값"
  status: resolved
  reason: "User reported: 표시가 전문 표기(010041001124 · 1CFD087D978E)라 보기 불편"
  severity: minor
  test: 2
  resolved: "30-08 · 2라운드 재확인 pass(2026-10-11)"
  resolution_plan: 30-08
  decision: "D-17 (30-CONTEXT)"
  root_cause: "shared summarizeOrderEndpoint 가 87 정규화값을 표시값으로 그대로 내고, 웹 카드 · 불일치 경고 · 편집칸 초깃값이 그 값을 그대로 쓴다 — 표시용 포맷 함수가 없다"
  artifacts:
    - path: "packages/shared/src/order-endpoint.ts"
      issue: "정규화(12자리 · 12 hex)만 있고 역방향 표시 포맷(점표기 · 콜론)이 없다"
    - path: "webapp/src/components/admin/account-editor.tsx"
      issue: "읽기 줄 · 불일치 경고 · 편집 초깃값이 정규화값 그대로"
  missing:
    - "shared formatOrderIp('010041001124') → '10.41.1.124' · formatOrderMac('1CFD087D978E') → '1C:FD:08:7D:97:8E' (형식 밖 값은 원문 그대로)"
    - "읽기 줄 · 불일치 경고 · 편집칸 초깃값에 적용 (서버는 점표기 · 콜론을 받아 정규화하므로 전송 규칙 D-07 그대로)"
    - "단위 테스트 · E2E 기대 문구 갱신"

- truth: "다른 DMA 사용자가 같은 KB 계좌를 쓸 때, 한 사용자에서 그 계좌의 IP/MAC 을 바꾸면 그 계좌를 쓰는 모든 사용자의 IP/MAC 이 함께 바뀐다 (사용자 요청 — D-11 「다른 유저 op 없음」 을 뒤집는다)"
  status: resolved
  reason: "User reported: junysim 37728502101 편집 → KB120 code 7 「다른 사용자가 같은 계좌를 다른 지점번호/거래자ID 로 보유」"
  severity: major
  test: 5
  resolved: "30-09 + gh-trade 261011(KB120 배포) · 2라운드 재확인 pass(2026-10-11) · KB121 은 gh-trade 배포 여부 확인 필요"
  resolution_plan: 30-09
  decision: "D-18 (30-CONTEXT) — D-11 을 IP/MAC 에 한해 대체"
  external: "gh-trade 몫 — <gh-trade>/docs/inbox/from-gh-radar/261011-shared-account-ipmac.md (op 3 원자적 전파 · done · done_commit d5a20cfb · quick-261011-n26). KB120 배포 · 사용자 확인 2026-10-11. KB121 은 gh-trade 배포 여부 확인 필요"
  resolution_note: "플래너 drift 확인(2026-10-11) — relay · server 변경 불필요: relay 는 요청 DMA 사용자만 계획(자동 reconcile 없음), DB 의도에 IP/MAC 이 없어 sameValues 비교 제외(GC-02) · 개요 칩 판정도 87 IP/MAC 을 빼므로 다른 사용자에 전파된 값은 drift · op 를 만들지 않는다"
  root_cause: "gh-trade ValidateUsers(server/src/util/Config.cpp 2차 검증)가 users.toml 전체에서 같은 KB 계좌번호의 branchNo · traderId · orderIp · orderMac 이 사용자 간 한 벌이어야 한다고 본다(quick-261010-vfn). op 3 은 한 사용자만 바꾸므로 공유 계좌의 IP/MAC 변경은 어느 순서로 보내도 code 7 이다 — relay 에서 사용자별 op 3 을 차례로 보내는 방식으로는 풀 수 없다(첫 op 가 늘 상대 사용자와 어긋난다)."
  artifacts:
    - path: "gh-trade server/src/util/Config.cpp:1186-1201"
      issue: "사용자 간 같은 계좌 라우팅 값 한 벌 검증 — 단일 사용자 op 3 으로는 공유 계좌 값을 못 바꾼다"
    - path: "relay/src/admin/planner.ts"
      issue: "D-11 — 다른 사용자에 op 를 만들지 않는다"
  missing:
    - "gh-trade 인계(scripts/trade-handoff.sh): KB 계좌 op 3 이 orderIp/orderMac 을 바꾸면 같은 서버 users.toml 에서 그 계좌번호를 가진 모든 사용자에 같은 값을 한 번의 검증 · 저장으로 반영(원자적) — 또는 같은 의미의 새 op. code 7 문구도 「지점번호/거래자ID/주문자 IP·MAC」 으로 넓히기(인박스 261010 질문 ①)"
    - "gh-radar 웹: 편집 모드에서 이 계좌를 함께 쓰는 다른 DMA 사용자 목록을 「함께 바뀜」 안내로 보이기 · 저장 뒤 개요 재조회로 그 사용자 카드도 새 값"
    - "relay · server: 계약 변화 반영(필요 시) · 테스트"
    - "30-07 Task 3(인박스 261010 닫기)은 이 gap 결론(질문 ① 답이 바뀜) 뒤로 미룬다"

## Round 2 (2026-10-11 · 갭 클로징 배포 뒤 · 사용자)

| # | 항목 | 결과 |
|---|------|------|
| R2-1 | (D-17 · IPMAC-02) KB 카드 읽기 줄 · 편집칸 초깃값 표기 `10.41.1.124` · `1C:FD:08:7D:97:8E` | pass |
| R2-2 | (D-18) junysim 37728502101 「편집」 — 공유 계좌 안내 줄 | pass |
| R2-3 | (D-18 · gh-trade 261011) 공유 계좌 IP/MAC 저장 + 함께 쓰는 사용자 카드 동시 갱신 | pass (KB120) · KB121 은 gh-trade 배포 여부 확인 필요 |

남은 확인(비차단): KB 주문 전문(TCHODR1000 orderInfo · macAddr)에 설정한 IP/MAC 이 실리는지 회선 관측 없음 — gh-trade 로그는 설계상 값을 찍지 않고, 지금은 gh-trade 단위 테스트 `server/tests/test_kb_endpoint_race.cpp` 만. 후보는 30-07-SUMMARY 「Next Phase Readiness」.
