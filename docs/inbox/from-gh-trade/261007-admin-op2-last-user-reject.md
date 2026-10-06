---
status: done
from: gh-trade
from_commit: dc8fb50a
from_branch: worktree-phase-29-admin-users
date: 2026-10-07
fbs_sync_marker: 92cdfbff
done_commit: 2b040c45
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-07

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

와이어 무변경이다(번호·필드·슬롯 그대로, 새 86 code 없음). 의미가 하나 넓어졌다.

- 44 op 2 DeleteUser 가 서버에 남은 **마지막 사용자**(지우면 users 0명)를 지우려 하면, 86 이 `ok=false` · `code=12`(LAST_ACCOUNT 재사용) · message 「마지막 사용자는 삭제할 수 없습니다」 로 거부한다. 판정 순서는 아이디 형식 2 → 등록 사용자 4 → **마지막 사용자 12** → BUSY 9 다. 그 사용자의 계좌에 미체결 등이 있어도 12 가 먼저 온다(op 4 의 마지막 계좌와 같은 순서).
- 거부는 저장·교체 전에 끝난다. users.toml·`.bak`·`users_rev` 는 그대로이고, **87 없음**, 그 사용자의 연결도 54 없이 그대로다.
- 이유(29-REVIEW CR-01): 지금까지는 마지막 사용자 삭제가 통과해 사용자 0명 users.toml 을 썼다. 다음 재기동에서 기동 로더가 그 파일을 거부해 서버가 뜨지 않았다. 서버는 같은 규칙을 `ValidateUsers` 에도 넣어 로더와 명령이 함께 쓴다(gh-trade 29-08 커밋 ⓑ).
- op 4 의 12 문구 「마지막 계좌는 제거할 수 없습니다 — 사용자 삭제로 처리」 는 바뀌지 않았다.
- fbs 변경은 `AdminCommandResp.code` 주석 12 줄 하나다: `12 LAST_ACCOUNT(op 4 마지막 계좌 제거 — 사용자 삭제로 처리 · op 2 마지막 사용자 삭제 — 사용자 0명 파일은 기동 거부)`. `//` 주석이라 생성 .ts·.cs 는 바뀌지 않는다. 이 주석은 gh-radar-7c 가 요청한 「.fbs code 12 주석에 op 2 의미 병기」 를 반영한 것이다.

판정기가 걸린 파일:

- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- relay 파서·DB 마이그레이션은 필요 없다. gh-radar-7c 회신(2026-10-07)에 따르면 86 code 해석 정본은 `packages/shared/src/admin.ts` 의 `interpretAdminResult` 하나다. 반영됨은 0 · (op4, 8) · (op2, 4) 뿐이고, (op2, 12) 는 서버별 실패 칩 + 서버 message 그대로 표시로 이미 떨어진다. 87 없음·rev 불변도 relay 의 추가 처리가 필요 없다.
- 12 를 op 4 전용으로 분기하는 코드는 없다(회신 ②). 주석·테스트만 op 4 기준이라 gh-radar 가 같이 고친다고 했다. 그 수정이 할 일이다.
- relay 의 HTTP 409 LAST_ACCOUNT(DB 의도 기반 업무 거부)는 와이어 12 와 이름만 같다. op 2 의 12 는 409 로 바꾸지 않고 서버별 실패 칩으로 둔다(회신 ②).
- relay `.fbs` 사본 재동기화는 선택이다(주석 한 줄뿐). `RELAY=/Users/alex/repos/gh-radar/relay server/scripts/sync-relay-schema.sh --check` 출력: `신규/변경 예정 : 0 개` · `삭제 예정 : 없음` · `.fbs 사본 : 갱신 예정` · `sync-relay-schema.sh OK: 가드 3종 통과 — gh-radar 파일은 건드리지 않았다 (--check)`. gh-trade 쪽은 본 실행을 하지 않았다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 안전하다 — 기존 code 12 를 재사용하고 와이어는 그대로다. gh-radar 가 아무것도 배포하지 않아도 (op2, 12) 는 서버별 실패 칩 + 서버 message 로 표시된다(회신 ①). 가동본(KB120·KYOBO119, 84824b07)에는 아직 이 수정이 없다. 재배포는 gh-trade 사용자가 트리거하고, 그때까지는 Admin 화면에서 서버의 마지막 사용자를 삭제하지 않는다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- 서버 감사 로그: `admin op=2 user=<id> account=- client='…' req=<n> code=12 rev=<불변>` 한 줄. 87 은 오지 않는다.
- 사용자 1명인 mock 서버에서 Admin 화면으로 그 사용자를 삭제하면 86 `code=12` · message 「마지막 사용자는 삭제할 수 없습니다」 가 온다. 화면에는 서버별 실패 칩과 그 문구가 그대로 보이고, 목록·rev 는 그대로다.
- gh-trade 쪽 고정: doctest `[admin-gw] op2 마지막 유저 — 거부 · 파일·rev·연결 불변` (gh-trade `server/tests/test_admin_gateway.cpp`).

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음. code·문구는 2026-10-07 01:16 KST 에 결정했다 — gh-radar-7c 회신을 참고했고 사용자가 안 (a) 를 골랐다. 회신의 문구 제안 「서버의 마지막 사용자는 삭제할 수 없습니다」 는 필수가 아니었고, 사용자는 원안 「마지막 사용자는 삭제할 수 없습니다」 를 골랐다.
