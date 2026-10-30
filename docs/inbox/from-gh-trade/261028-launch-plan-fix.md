---
status: done
from: gh-trade
from_commit: f5113297
from_branch: master
date: 2026-10-28
fbs_sync_marker: f156cb6f
done_commit: 9f51eb45
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-28

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어 무변경**(MsgType·필드·슬롯·kind 번호 그대로, fbs 무변경 — relay 재동기화 불필요). 261028-launch-plan-contract 이후 Phase 43 코드 리뷰 수정(43-REVIEW-FIX, gh-trade f5113297)으로 **의미·문구**만 바뀌었다.

1. **op 8 거부 고정 문구 1개 추가**(code 1, 기존 7종 그대로 → 8종): 「시각 목록 폭 상한 밖(마지막 − 첫 ≤ 500µs)」 — Q16 조각 시각 목록의 폭(마지막 − 첫)이 500µs 를 넘으면 거부. 서버 파일 읽기에도 같은 상한.
2. **op 8 새 실패 응답**: 서버 `plan_file` 설정이 빈 값이면 종전 「저장 — 다음 발사부터 적용」(code 0) 대신 **code 10** 「발사 계획 저장 경로 없음 — 서버 plan_file 설정을 확인하세요」. 메모리·`plan_rev` 는 바뀌지 않는다(운영 119·120 은 plan_file 설정이 있어 정상 경로).
3. **kind 17 `planned_us`**: 16:00 뒤 조각도 서버 설정 클램프로 자른 **뒤** 값(종전엔 첫 조각만 클램프). 계획 값이 클램프 안이면 종전과 같다.
4. **kind 17 `result_code`·`rc=`**: **첫 발 번호** 기준으로 읽는다(재전송 접수 조각이 「거부인데 코드 0·원문 빈 값」으로 찍히던 결함 수정). `order_no` 는 종전처럼 마지막 번호.
5. **서버 기동**: 계획 파일이 손상돼 못 읽으면 원본을 덮지 않고 error 로그 + 그날은 초깃값을 메모리로만 쓴다. 그 상태에서 op 9 는 초깃값·`plan_rev` 1 을 돌려줄 수 있다(다음 op 8 저장이 파일을 정상으로 덮는다).

판정기가 걸린 파일:

- server/docs/protocol.md (86 고정 문구 7종 → 8종 · code 10 문구)

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- 생성물 재동기화·DB 마이그레이션: **필요 없음**.
- 어드민 편집 칸: 저장 전 클라이언트 검증에 「마지막 − 첫 ≤ 500µs」 를 넣으면 좋다(서버가 거부하므로 필수는 아님). 거부 문구는 고정 문구를 그대로 보여 주면 된다.
- op 8 응답 code 10 을 「저장 실패」로 표시(ok=false 이므로 기존 분기면 이미 실패로 보일 것 — 확인만).
- 발사 경계 지도: kind 17 `planned_us` 는 클램프 뒤 값이라 계획 값과 다를 수 있다(계획이 클램프 밖일 때만).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 와이어 무변경이라 순서 제약 없음. gh-trade Phase 43 서버(이 수정 포함)는 아직 미배포.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- 어드민에서 Q16 시각 목록 폭을 600µs 로 저장 → 86 code 1 「시각 목록 폭 상한 밖(마지막 − 첫 ≤ 500µs)」 이 화면에 그대로 뜬다.
- 재전송으로 접수된 조각의 kind 17 행에 거부 코드(`rc=` 원문)가 남는다.

## 질문

없음

## 회신

(2026-10-30) **반영 · 라이브 확인 — 닫는다.** ① 폭 상한 500µs 클라 검증 `LAUNCH_PLAN_LIMITS.q16.maxSpanUs = 500` · `validateLaunchPlanDraft` 폭 위반(`f2db92c3`) ② code 10 은 ok=false 기존 분기로 「저장 실패」 — 「서버 미지원」 은 code 1 「알 수 없는 명령입니다」 일 때만(`9f51eb45`) ③ `planned_us` 는 매핑하지 않는다(열 없음 — 지도는 `sent_rel_us` 를 그린다) ④ 재전송 조각 `result_code` 라이브 확인 — 10-28 ~ 10-30 KYOBO119 N 재전송 조각(retry 1~2)에 `E127`, 10-29 KB120 N 코스닥 w0(retry 1)에 `0515` 가 남는다. 배포는 35-18(relay `2f26aea4` · server `00068-5fj` · push `2f26aea4`).
