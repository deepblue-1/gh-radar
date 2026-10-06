---
status: done
from: gh-trade
from_commit: d544f4bd
from_branch: worktree-phase-29-admin-users
date: 2026-10-06
fbs_sync_marker: ea8d9171
done_commit: 1f9c0328
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-06

## 바뀐 것

Phase 29(원격 유저·계좌 관리 admin 역할) 와이어 계약을 확정·커밋했다 — gh-radar-34 합의(2026-10-06) 그대로, 사용자 확정 「확정」.
이 노트에는 비밀값·계좌번호·게이트웨이 주소를 적지 않는다.

| 항목 | 값 |
|------|----|
| `.fbs` 확정 커밋 (전체) | `92cdfbff173c41bbb032c5bd4da944d45606e0ac` |
| `.fbs` 확정 커밋 (짧은) | `92cdfbff` |
| 커밋 제목 | `feat(29-01): 프로토콜 — admin 역할(role 2)·MsgType 44/86/87·…·Envelope 92/94/96 append + 클라 생성물·expected-vtable·protocol.md 동기화 (D-04)` |
| `server/src/protocol/StockDMA.fbs` blob | `03fc8cbedcd8542e9febf2416fa8bd595aa5d9fd` |
| 문서 커밋 | `d544f4bd` (`order-journal.md` admin 절 · 정원 6 — 이 노트의 `from_commit`) |
| 브랜치 | `worktree-phase-29-admin-users` (Phase 29 worktree — master 병합 전) |

- **blob 해시가 안정 식별자다** — 병합 방식에 따라 master 의 커밋 해시는 달라질 수 있지만 같은 스키마면 `git rev-parse <커밋>:server/src/protocol/StockDMA.fbs` 가 위 blob 과 같다.
- 와이어 (전부 말미 append — 기존 번호·슬롯·`(deprecated)` 봉인 무이동, expected-vtable 은 `+` 22줄·삭제 0):
  - MsgType **44 `AdminCommandReq`**(C→S) · **86 `AdminCommandResp`**(S→C) · **87 `AdminUsersSnapshot`**(S→C)
  - 테이블 5 (선언 순서): `AdminAccount{account_no, name, branch_no, trader_id, priority:int}` →
    `AdminCommandReq{request_id:ulong, op:ubyte, user_id, password, account:AdminAccount}` →
    `AdminCommandResp{request_id:ulong, ok:bool, code:ushort, message, users_rev:ulong}` →
    `AdminUser{user_id, accounts:[AdminAccount]}` → `AdminUsersSnapshot{users_rev:ulong, users:[AdminUser]}`
  - Envelope 슬롯: `admin_command_req` **92** · `admin_command_resp` **94** · `admin_users_snapshot` **96** (`limit_feature` 90 뒤)
  - `ObserverLoginReq.role` / `ObserverLoginResp.role` 에 **2 = admin** (주석만 — 필드 변경 0)
- 의미 규칙 요약 (전문은 `.fbs` 주석 · `server/docs/protocol.md` 44/86/87 행 · `docs/features/order-journal.md` admin 절):
  - **관문(D-02):** admin 연결은 같은 관찰자 비밀(`DMA_OBSERVER_SECRET`)로 role 2 를 연다. 어떤 Session 에도 붙지 않고 4(LivePing)·44 만 처리,
    80·76/78·사용자 요청은 드롭(warn 1회). 79 는 role 2 · accounts 빈 벡터 · journal_epoch "" · 78/80 없음. 정원 4 → **6**(journal+quote+admin 합산), 유휴 스윕 대상.
  - **op:** 1 UpsertUser(신규 = 비밀번호 + 첫 계좌 필수 · 기존 = 비밀번호만, 빈 값 = 유지, account 무시) · 2 DeleteUser · 3 SetAccount(추가 또는 같은 account_no 갱신) ·
    4 RemoveAccount(account_no 만) · 5 ListUsers. `request_id` 는 86/87 에 에코.
  - **code(D-05):** 0 OK · 1 BAD_OP · 2 BAD_USER_ID · 3 BAD_PASSWORD · 4 NO_SUCH_USER · 5 BAD_ACCOUNT_NO · 6 BAD_BRANCH_TRADER(KB 만) · 7 ACCOUNT_CONFLICT ·
    8 NO_SUCH_ACCOUNT · 9 BUSY · 10 PERSIST_FAILED · 11 NOT_ADMIN · 12 LAST_ACCOUNT. `message` 는 한국어 사용자 문장(화면 표시용), 분기는 `code`.
  - **rev(D-06):** `users_rev` 기동 1 · 실제 변경마다 +1(메모리 카운터 — 재기동 시 1 로 복귀, relay 는 접속마다 op 5 로 전체 대조). 변경 op 가 실제 변경을 냈을 때만 86 다음 87 1회, op 5 는 87 만.
  - **멱등(D-09):** 무변경은 code 0 · rev 불변 · 파일 안 씀 · 87 없음. op 4 의 없는 계좌는 8(멱등 삭제 아님).
  - **op 의미·BUSY·54(D-10~D-15):** BUSY(9) 는 **계좌 상태로만** 판정(상따·VI 슬롯·VI 감시·미체결·예약) — 붙은 연결 수는 BUSY 사유가 아니다. 서버는 대신 정리하지 않는다.
    SetAccount 의 branch/trader 변경은 BUSY 면 9, name/priority 는 즉시 반영. DeleteUser 도 BUSY 검사 후 붙은 연결에 54 INFO 뒤 종료. 계좌 추가·제거는 그 유저 세션에 54 INFO,
    비밀번호 변경은 통지 없음. 계좌 0개 유저 불허(마지막 계좌 제거 = 12).
  - **87(D-07/D-16):** users.toml **전체**(WinForms 전용 유저 포함), 유저 = 파일 순 · 계좌 = priority 오름차순, account_no 는 NormalizeAccountNo 정규화값. **비밀번호는 어디에도 없다.**
    KB 는 branch_no 5자·trader_id 6자, **교보 서버 계좌는 branch/trader 가 빈 문자열**이다.
  - **서버 독립(D-17):** 같은 계좌를 여러 게이트웨이에 올려도 각 서버가 자기 주문만 관리 — 서버 간 중복 방지 없음.
  - **복원 경로 무접촉(D-19):** 새 메시지·역할은 append-only 라 strategy_state.toml·account_state.toml·vi_orders.toml·예약주문 복원 경로를 건드리지 않는다.

판정기가 걸린 파일:

- docs/features/order-journal.md
- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

- **생성물 재동기화 필요** — 생성 기준 `fbs_sync_marker` `ea8d9171` 은 이 트리 HEAD 의 조상임을 확인했다(`git merge-base --is-ancestor` = 조상, 미병합 생성물 덮어쓰기 위험 없음).
  `--check` 결과는 생성 .ts 신규/변경 8 · 삭제 없음 · `.fbs` 사본 갱신 예정. Phase 29 가 master 에 병합되기 **전**에는 메인 체크아웃에 새 `.fbs` 가 없으므로 반드시 이 worktree 경로에서 돌린다
  (`RELAY=` 필수 — 기본값 `../../gh-radar/relay` 는 worktree 깊이에서 틀린 경로다):

  ```bash
  cd /Users/alex/repos/gh-trade/.claude/worktrees/phase-29-admin-users/server
  RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check   # 대조만 (쓰기 없음)
  RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh           # 반영 (relay/src/generated/ 에 씀)
  ```

- relay: admin 연결(role 2) 로그인 · 44 송신 / 86·87 수신 코덱 · 접속마다 op 5 전체 대조 · Admin 화면 fan-out.
- webapp: Admin 화면(유저·계좌 CRUD, code/message 표시), Supabase 대조(「서버에만 있음」 표시 — D-16). DB 마이그레이션 필요 여부는 gh-radar Phase 판단.
- gh-trade 서버 구현(29-04 핸들러 · 29-05 ops 2/3/4 · 29-06 E2E·점검 도구)은 이 계약 위에서 병행 진행 중이다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 새 메시지는 relay 가 보내기 전까지 쓰이지 않고 구 relay 는 role 0/1 그대로다(D-19). 서버 재기동은 20:00 KST 이후 체크포인트(29-07, 가동 2대 KB120·KYOBO119).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- 서버 기동 로그에 `관찰자 정원 6` (29-04 배포 뒤).
- `observer_probe.py --role admin users` 가 `USERS rev=1 count=N` 을 낸다(29-06 점검 도구 — 비밀번호 없음).
- relay admin 로그인 뒤 79 `role=2` · accounts 빈 벡터를 받고, op 5 로 87 을 수신한다. 수락 로그 `[Gateway] 관찰자 로그인(admin — users.toml 관리) conn=… ip=… client='…'`.
- 생성물: relay `src/generated/StockDMA.fbs` SYNC MARKER `server-repo-commit` 가 `92cdfbff` 이후 커밋, 사본 본문의 blob 대조가 위 표와 같음.

## 질문

① relay 가 같은 서버에 admin 연결을 몇 개 유지할 계획인가 (서버 정원 6 = journal+quote+admin 각 1 + 재접속 경합 여유 — admin 동시 연결 수 자체 제한은 없다)
② 비밀번호 변경(op 1 기존 유저)에 54 통지가 없는 것(D-10 — 열린 세션은 그대로, 다음 로그인부터 새 값)으로 충분한가
③ 87 의 교보 서버 계좌는 branch_no/trader_id 가 빈 문자열이다 — Admin 화면 표시(빈 칸·「해당 없음」 등) 확인
④ BUSY(9) 의 message 건수 문구(예 「미체결 2건 · 상따 1건 · VI 1건 등록 — 먼저 정리」)를 화면에 그대로 표시하는지
⑤ op 4 는 멱등이 아니다(없는 계좌 → 8 NO_SUCH_ACCOUNT) — gh-radar 가 87 로 확인한 계좌만 지우는 흐름인지 확인
