---
phase: 29-dma-multi-server-admin
verified: 2026-10-10T06:17:00Z
status: gaps_found
score: 9/16 must-haves verified
covered_files:
  - ".planning/phases/29-dma-multi-server-admin/29-01-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-01-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-02-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-02-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-03-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-03-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-04-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-04-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-05-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-05-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-06-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-06-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-07-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-07-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-08-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-08-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-09-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-09-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-10-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-10-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-11-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-11-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-12-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-12-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-13-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-13-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-14-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-14-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-15-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-15-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-16-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-16-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-17-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-17-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-18-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-18-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-19-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-19-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-20-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-20-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-21-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-21-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-22-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-22-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-23-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-23-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-24-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-24-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-25-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-25-SUMMARY.md"
  - ".planning/phases/29-dma-multi-server-admin/29-26-PLAN.md"
  - ".planning/phases/29-dma-multi-server-admin/29-26-SUMMARY.md"
  - "packages/shared/src/admin.ts"
  - "relay/src/access/app-access.ts"
  - "relay/src/admin/admin-api.ts"
  - "relay/src/admin/admin-conn.ts"
  - "relay/src/admin/dispatcher.ts"
  - "relay/src/admin/intent-store.ts"
  - "relay/src/admin/planner.ts"
  - "relay/src/admin/session-sync.ts"
  - "relay/src/admin/snapshot-sink.ts"
  - "relay/src/admin/types.ts"
  - "relay/src/dma/session-manager.ts"
  - "relay/src/index.ts"
  - "relay/src/quote/quote-switch.ts"
  - "relay/src/registry/order-journal.ts"
  - "relay/src/registry/pipelines.ts"
  - "relay/src/registry/registry.ts"
  - "relay/src/ws/fanout.ts"
  - "scripts/deploy-relay.sh"
  - "server/src/middleware/require-admin.ts"
  - "server/src/routes/admin-servers.ts"
  - "server/src/routes/admin.ts"
  - "server/src/services/relay-admin-client.ts"
  - "supabase/migrations/20261006200000_app_access.sql"
  - "supabase/migrations/20261006200100_dma_registry_intent.sql"
  - "supabase/migrations/20261006200200_dma_admin_intent_rpcs.sql"
  - "supabase/migrations/20261006200300_dma_admin_reflect.sql"
  - "supabase/migrations/20261007200000_gateway_key_rename.sql"
  - "supabase/migrations/20261007200100_dma_visibility_v2.sql"
  - "webapp/src/app/admin/servers/page.tsx"
  - "webapp/src/app/admin/users/page.tsx"
  - "webapp/src/app/pending/page.tsx"
  - "webapp/src/components/admin/account-editor.tsx"
  - "webapp/src/components/admin/admin-sheet.tsx"
  - "webapp/src/components/admin/dma-connect-fields.tsx"
  - "webapp/src/components/admin/password-change.tsx"
  - "webapp/src/components/admin/pending-section.tsx"
  - "webapp/src/components/admin/reflect-chip.tsx"
  - "webapp/src/components/admin/role-segment.tsx"
  - "webapp/src/components/admin/server-card.tsx"
  - "webapp/src/components/admin/server-sheet.tsx"
  - "webapp/src/components/admin/servers-client.tsx"
  - "webapp/src/components/admin/use-field-save.ts"
  - "webapp/src/components/admin/user-create-sheet.tsx"
  - "webapp/src/components/admin/user-row.tsx"
  - "webapp/src/components/admin/user-sheet.tsx"
  - "webapp/src/components/admin/users-client.tsx"
  - "webapp/src/lib/supabase/access-gate.ts"
  - "webapp/src/lib/supabase/middleware.ts"
covered_digest: "v3:sha256:716561cf82cf58f8aaec480eeda6e59d25a85756de5a90cb638eef66035389b7"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "G-1 계좌별 주문 서버 — 각 계좌가 자기가 등록된 서버 중 하나를 주문 서버로 고르고, 그 계좌의 전략 설정·주문은 그 서버로만 간다 (사용자 변경 요청 2026-10-10, D-10 「증권사별 주문 서버」 대체)"
    status: failed
    severity: blocker
    reason: "현재 구현은 주문 서버가 증권사당 1대다 (dma_servers.is_order_server + 부분 유니크 uq_dma_servers_order(broker), relay SessionManager 색인 #byUserBroker = userId|broker, resolveTarget(broker), healthz brokers.{KB,KYOBO}, order.server 프레임이 broker 단위). 계좌 단위 지정 컬럼·API·UI·라우팅은 어디에도 없다."
    artifacts:
      - path: "supabase/migrations/20261006200100_dma_registry_intent.sql"
        issue: "주문 서버가 dma_servers 의 증권사 단위 플래그. 계좌별 주문 서버 열이 dma_user_accounts / dma_account_servers 에 없다"
      - path: "relay/src/dma/session-manager.ts"
        issue: "세션 색인이 (userId, broker) 하나. 같은 사용자가 같은 증권사의 두 서버에 동시에 세션을 열 수 없고, acquireFor 는 서버와 무관하게 기존 세션을 재사용한다"
      - path: "relay/src/registry/registry.ts"
        issue: "orderServerOf(broker) 만 있다 — 계좌 → 서버 해석이 없다"
      - path: "relay/src/ws/fanout.ts"
        issue: "order.server 알림·인증 직후 스냅샷이 broker 단위 current/next 비교 (계좌 단위 아님)"
      - path: "relay/src/index.ts"
        issue: "healthz brokers.{KB,KYOBO}.server 와 journal.state 가 증권사당 주문 서버 1대를 전제"
    missing:
      - "DB: 계좌별 주문 서버 열(예: dma_account_servers.is_order 또는 dma_user_accounts.order_server_key) — 그 계좌의 등록 서버(dma_account_servers active 행)로만 제약, NULL = 증권사 기본값(dma_servers.is_order_server), 등록 서버 해제 시 NULL 로 복귀하는 규칙"
      - "relay 라우팅: 주문·전략(상따·자동매도) 명령을 계좌 → (사용자, 그 서버) 세션으로. 같은 사용자가 같은 증권사에서 계좌별로 서로 다른 서버를 고른 경우에만 두 서버 세션 동시 보유 (SessionManager 색인을 (userId, serverKey) 로, forAccount 가 계좌의 서버를 보도록)"
      - "저널 매핑(JournalAccess/dma_account_access)·journal.state·healthz brokers·order.server 알림(계좌 단위로 재설계, WR-05 문구 문제 동시 해결) 재검토"
      - "Admin 계좌 줄에 주문 서버 select (등록 서버 중에서만), 작업대 배지는 계좌별"
      - "gh-trade 와이어 변경은 불필요해 보임 (계좌는 이미 서버별 users.toml 에 등록됨) — 계획 단계에서 gh-trade-0d 에 확인만"
  - truth: "「+ 사용자」 생성 경로는 이미 DMA 가 연결된 웹 사용자의 연결을 덮어쓰지 않는다 (DMA user_id 는 웹유저당 1개)"
    status: failed
    severity: blocker
    id: CR-01
    reason: "POST /api/admin/users 는 DMA_LINKED 가드 없이 app_users upsert 후 relay.createDmaUser 를 부르고, dma_admin_create_dma_user RPC 는 UPDATE app_users SET dma_user_id = … 를 조건 없이 실행한다 (코드 직접 확인). 전용 라우트 POST /users/:email/dma 는 같은 상황을 409 DMA_LINKED 로 막는다 — 가드가 한 경로에만 있다."
    artifacts:
      - path: "server/src/routes/admin.ts"
        issue: "POST /users (173-205행) 에 기존 dma_user_id 확인이 없다. relay 실패 시 앞서 한 역할 upsert 도 남는다"
      - path: "supabase/migrations/20261006200200_dma_admin_intent_rpcs.sql"
        issue: "dma_admin_create_dma_user 가 app_users.dma_user_id 를 무조건 덮어쓴다 (정본 가드 부재). 새 마이그레이션(CREATE OR REPLACE)으로 고쳐야 한다"
    missing:
      - "RPC 안 가드: 대상 app_users 행을 FOR UPDATE 로 잠그고 dma_user_id IS NOT NULL 이면 DMA_LINKED 로 거부 (정본 가드 = DB)"
      - "Express POST /users: body.dma 가 있으면 upsert 전에 현재 dma_user_id 확인 → DmaLinked() 409"
      - "relay INTENT_ERROR_CODES / INTENT_MESSAGE 에 DMA_LINKED 추가 (409 로 그대로 전달)"
      - "회귀 테스트: 이미 연결된 trader 이메일로 「+ 사용자」 → 409, dma_users·app_users 불변"
      - "이미 고아가 된 옛 DMA 유저가 운영에 있는지 점검 쿼리 (app_users 에 연결되지 않은 dma_users 행)"
  - truth: "계좌 등록 서버 의도가 동시 편집·중복 입력에서 조용히 사라지지 않는다"
    status: failed
    severity: warning
    id: WR-01+WR-06
    reason: "WR-01: 유저 삭제가 아닌 reconcile 경로의 op 2 settle 이 dma_admin_settle_server(p_user_removed=true) 분기에서 그 서버의 dma_account_servers 행을 상태 무관 전부 DELETE 한다 (RPC 코드 직접 확인) — 같은 시각 다른 계좌에서 막 체크한 active 행이 지워진다. WR-06: 「+ 계좌 추가」 폼에 기존 계좌번호를 넣으면 PUT upsert 가 기존 계좌의 값을 덮고 목록에 없는 active 서버를 removing 으로 돌려 실제 users.toml 에서 빠진다 (중복 검사·경고 없음)."
    artifacts:
      - path: "supabase/migrations/20261006200200_dma_admin_intent_rpcs.sql"
        issue: "dma_admin_settle_server 의 p_user_removed 분기가 전 행 삭제 (274-276행)"
      - path: "relay/src/admin/dispatcher.ts"
        issue: "op 2 ok 시 #settle(…, true) 호출 (223-234행) — 유저 삭제 경로 전용 플래그가 reconcile 에도 쓰인다"
      - path: "webapp/src/components/admin/account-editor.tsx"
        issue: "추가 폼이 accountKeyOf 중복 검사 없이 PUT 1건 (412-453행)"
    missing:
      - "settle: reconcile 의 op 2 는 state='removing' 행만 지운다 (전 행 삭제는 settleUserOnOk 경로에만)"
      - "추가 폼: 정규화한 (증권사, 계좌번호) 가 이미 있으면 「이미 있는 계좌 — 위 계좌 줄에서 서버를 고르세요」 로 막기 (필요하면 서버에도 create-only 플래그)"
  - truth: "역할 강등·허용 해제·서버 편집이 「즉시」 반영된다 (D-04) — 진행 중 주기 재적재와 겹쳐도"
    status: failed
    severity: warning
    id: WR-02
    reason: "AppAccess.reload() 는 진행 중인 #inFlight Promise 를 그대로 돌려준다 (app-access.ts 148-156행 직접 확인; ServerRegistry.reload 도 같은 방식). Express 가 커밋한 직후 호출한 즉시 재적재가 커밋 전에 시작된 주기 재적재와 겹치면 옛 행을 읽은 결과가 ok:true 로 돌아와 강등된 사용자의 wss·DMA 세션이 다음 주기(최대 60초)까지 열려 있다."
    artifacts:
      - path: "relay/src/access/app-access.ts"
        issue: "겹친 reload 가 꼬리 재적재 없이 진행 중 Promise 공유"
      - path: "relay/src/registry/registry.ts"
        issue: "ServerRegistry.reload 동일 패턴 (서버 끄기·주문 서버 교체가 최대 60초 지연)"
    missing:
      - "진행 중 적재가 있으면 그것이 끝난 뒤 한 번 더 읽는 꼬리 재적재 (주기 타이머는 기존 공유 유지 가능)"
      - "경합 테스트: 재적재 진행 중 강등 커밋 → 즉시 재적재가 강등을 반영"
  - truth: "시세 주 서버 카드에서 host/port 를 고치면 quote 연결이 새 주소로 따라간다"
    status: failed
    severity: warning
    id: WR-03
    reason: "index.ts 의 registry.on('changed') 는 change.roles 일 때만 quoteSwitch.reconcileWithRegistry 를 부른다 (463-473행 직접 확인). host·port 변경은 change.changed 로만 잡혀 저널·admin 파이프라인만 재생성되고 quote 는 옛 주소에 남는다. QuoteSwitch 의 noop 판정도 키만 비교한다."
    artifacts:
      - path: "relay/src/index.ts"
        issue: "changed 처리기가 현재 quote 서버의 주소 변경을 처리하지 않는다"
      - path: "relay/src/quote/quote-switch.ts"
        issue: "같은 키 재선택은 noop (host/port 비교 없음)"
    missing:
      - "change.changed 에 현재 quote 서버 키가 있으면 같은 키로 break-then-make 재연결, noop 판정에 host·port 포함"
  - truth: "사용자 삭제와 Admin 반영 요청은 서버 하나가 꺼져 있거나 느려도 끝난다 / 화면이 실제 결과와 일치한다"
    status: failed
    severity: warning
    id: WR-04+WR-07
    reason: "WR-04: AdminDispatcher.deleteUser 는 모든 서버 결과가 ok 일 때만 DB 삭제를 부른다 (dispatcher.ts 186-187행 직접 확인) — 등록 서버가 꺼져 있으면(skipped) 영원히 삭제되지 않고 화면은 사유 없는 「미반영」 만 보인다. WR-07: relay 는 서버별 op 를 순차로 보내 op 당 최대 ≈6초인데 Express 타임아웃은 12초라, 계좌가 여럿이거나 느린 서버가 있으면 relay 는 반영을 계속하는데 화면은 502 「만들지 못했어요」 를 보이고 재시도하면 DMA_USER_EXISTS 가 된다."
    artifacts:
      - path: "relay/src/admin/dispatcher.ts"
        issue: "skipped 가 deleted 판정을 막고 사유 메시지가 없다 / 요청 단위 마감 없음"
      - path: "server/src/config.ts"
        issue: "RELAY_ADMIN 타임아웃 12초가 relay 총 처리 시간 상한과 맞지 않는다"
    missing:
      - "skipped 결과에 「사용이 꺼진 서버 — 켜고 다시 삭제」 사유, 꺼진 서버 의도 행 정리 정책(Admin 확인 뒤 DB 의도만 삭제 후 서버는 켜질 때 대조)"
      - "relay 라우트 요청 단위 마감(예: 10초) + 남은 op 는 timeout 으로 접어 응답, 시세 전환 되돌리기는 응답 뒤 비동기"
  - truth: "Admin 데스크톱 시트는 채택 목업 A 와 D-14 「목록은 남는다」 를 따르고, 모바일 터치 타깃이 충분하다"
    status: partial
    severity: warning
    id: UI-REVIEW-2+3+6
    reason: "UI 감사(17/24): 데스크톱 시트가 공용 SheetOverlay(backdrop-blur) 때문에 목록을 흐리고 바깥 클릭이 시트를 닫는다 — 목업 A 는 스크림 없이 행 사이를 오가는 그림 (deferred-items 29-17). 계좌 버튼·역할 세그먼트 h-7(28px), 서버 라디오 칩 h-8(32px) 로 모바일 오탭 위험. 서버 카드 「사용 중」 토글이 opacity-45 로 꺼짐처럼 보이고 이유가 title 에만 있다."
    artifacts:
      - path: "webapp/src/components/admin/admin-sheet.tsx"
        issue: "데스크톱(≥md) 오버레이 blur·모달 — 목업 A 와 상이"
      - path: "webapp/src/components/admin/account-editor.tsx"
        issue: "h-7 터치 타깃 (328·555·558·659행)"
      - path: "webapp/src/components/admin/server-card.tsx"
        issue: "사용 중 토글 비활성 표현·이유 문구가 title 전용"
    missing:
      - "데스크톱 한정 비모달 시트 또는 투명·blur 없는 오버레이"
      - "모바일 최소 36~40px 타깃 (클릭 영역 확장 포함)"
      - "서버 카드에 보조 문구 1줄 상시 노출(사용 중 이유)"
  - truth: "「주문 서버가 X 로 바뀜 — 재접속하면 적용」 배지의 지시를 따르면 실제로 새 서버가 적용된다 (D-10)"
    status: failed
    severity: warning
    id: WR-05
    reason: "SessionManager.acquireFor 는 사용자×증권사 세션이 살아 있으면 서버와 무관하게 재사용하고 유예 중이면 유예를 취소하고 재사용한다 (session-manager.ts 253행). 새로고침·재접속해도 같은 옛 서버 세션에 붙고 fanout 이 같은 배지를 다시 보낸다. 새 서버는 「모든 탭을 닫고 5분 넘게 기다림」 또는 회선 실패 때만 적용된다."
    artifacts:
      - path: "webapp/src/components/trading/workbench/workbench-status-bar.tsx"
        issue: "문구(94행)가 실제 규칙과 맞지 않는다"
      - path: "relay/src/dma/session-manager.ts"
        issue: "세션 재사용 규칙 — 주문 서버 교체를 반영하는 명시 동작 없음"
    missing:
      - "G-1 의 계좌 단위 주문 서버 재설계 안에서 함께 해결 (문구 정정 또는 「지금 옮기기」 명시 동작)"
deferred: []
human_verification:
  - test: "승인되지 않은 계정(app_users 에 없는 Google 계정)으로 로그인해 /pending 화면 확인"
    expected: "스캐너·뉴스·종목 등 어떤 경로로 가도 /pending 이 보이고, 안내 한 줄(관리자 승인을 기다리고 있어요 — 승인되면 바로 열려요) + 이메일 + 로그아웃 1개가 모바일(390)·데스크톱에서 깨지지 않게 보인다. Admin 이 승인하면 다음 이동에서 홈으로 돌아간다"
    why_human: "시각·UX 판단. 코드·단위·e2e(access-gate.spec.ts 가 승인된 사용자의 /pending→홈 이동은 검증)는 있으나 미승인 계정의 실화면은 사람이 아직 확인하지 않았다 (UI 감사도 PendingCard 본문을 열어 보지 않았다)"
confirmed_decisions:
  - id: G-2
    decision: "교보 trader id 칸은 필요 없다. 교보 주문 전문(146B)에 지점·트레이더 칸이 없고 주문자 식별은 서버 단위 FEP 로그온 USER ID 다 (gh-trade server/src/broker/kyobo/KyoboProtocol.h, go-trader pkg/order/kyobo). 갭 아님 — 확정 결정으로 기록 (29-26 SUMMARY key-decisions 와 일치)."
---

# Phase 29: DMA 다중 서버 · 웹 Admin 유저 관리 Verification Report

**Phase Goal:** relay 가 게이트웨이 4대(KB120 · KB121 · KYOBO119 · KYOBO127)를 서버 레지스트리로 다루고, 웹 Admin 메뉴에서 바꾼 사용자·계좌·서버 연결이 gh-trade 서버에 즉시 반영된다 (레지스트리 키 개명 · 웹 Admin 화면 · relay 서버별 관리자 연결 role 2 / 44 · 86 · 87 · 보존 제약). 전문은 ROADMAP.md Phase 29 Goal.
**Verified:** 2026-10-10T06:17:00Z
**Status:** gaps_found
**Re-verification:** No — 최초 검증

## 요약

Phase 29 의 골격은 코드와 운영에서 실제로 동작한다. 서버 레지스트리 4행 시드, 키 in-place 개명, 웹 Admin 두 화면, relay 서버별 admin 연결(role 2, 44/86/87), (유저, 서버) 세션, 시세 주 서버 break-then-make, 빅뱅 배포까지 확인했다. 운영 healthz 에서 `brokers.KB.server = KB120`, `brokers.KYOBO.server = KYOBO119`, `adminConns.KB120 / KYOBO119 = ready`, 저널 두 곳 모두 `live`·`lagSeq 0` 이고 KB120 저널은 `lastSeq 13126` 으로 개명 전 커서를 이어 간다 (오늘 직접 호출).

그러나 상태는 `gaps_found` 다.

1. **사용자 변경 요청(G-1)**: 계좌별 주문 서버가 아직 없다. 현재 구현은 증권사당 주문 서버 1대(D-10)라서, 사용자가 2026-10-10 에 요구한 동작과 다르다 — 별도 설계가 필요한 블로커.
2. **CR-01 (Critical)**: 「+ 사용자」 경로가 기존 DMA 연결을 확인 없이 덮어써 옛 DMA 유저를 Admin 으로 정리할 수 없는 고아로 만든다 — 코드로 직접 확인.
3. 코드 리뷰 Warning 7건 중 6건 + UI 감사의 Phase 29 표면 결함이 목표("즉시 반영", 목업 일치)와 직접 부딪혀 갭 목록에 넣었다.

## Goal Achievement

ROADMAP 에 Success Criteria 가 비어 있어(`success_criteria: []`) Goal 문장에서 관측 가능한 진실을 도출하고, PLAN `must_haves`(26개 플랜)를 병합했다.

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | 서버 레지스트리 4대 시드(KB120·KB121·KYOBO119·KYOBO127), 기존 `KB`/`KYOBO` 키는 in-place UPDATE 로 개명되어 커서·epoch·매핑·신원 보존, 모든 마이그레이션 additive | ✓ VERIFIED | `20261006200100_dma_registry_intent.sql` 시드 4행(KB121·KYOBO127 enabled=false), `20261007200000_gateway_key_rename.sql` 7개 표 UPDATE 한 트랜잭션. 운영 healthz: KB120 `lastSeq 13126` 이어받음, KYOBO119 `live`. pgTAP 17파일 867 단언 PASS(오늘 오케스트레이터 근거) |
| 2  | 허용 gmail·역할(admin/trader/viewer) 전면 게이트 + 승인 대기 + `is_theme_admin()` 흡수 | ✓ VERIFIED | `app_users`·`my_app_access()` 마이그레이션, `middleware.ts` 가 `my_app_access` 1회 호출 후 `decideAccess`(access-gate.ts) 위임, `/pending` 페이지·PendingCard 존재, 사이드바 Admin 은 `useAppRole()==="admin"`. e2e access-gate 통과. 미승인 계정 실화면은 사람 확인 대기(Human Verification 1) |
| 3  | DMA user_id 는 웹유저당 1개 — 이미 연결된 웹유저의 연결은 어느 경로로도 덮어써지지 않는다 | ✗ FAILED (BLOCKER) | `POST /users` 에 가드 없음 + `dma_admin_create_dma_user` 가 `UPDATE app_users SET dma_user_id` 무조건 실행. 대조: `POST /users/:email/dma` 는 `DmaLinked()`. 갭 CR-01 |
| 4  | 계좌 = (증권사, 계좌번호) 단위 등록 서버 목록, 같은 KB 계좌 두 KB 서버 동시 등록, 유저 생성 = 유저 + 첫 계좌 한 화면, 계좌 0개 불허·마지막 계좌 제거 code 12 | ✓ VERIFIED | `dma_user_accounts`·`dma_account_servers`(PK 에 server_key, 증권사 불일치 트리거), `LAST_ACCOUNT` 12 매핑(relay types.ts), 생성 시트·planner 테스트, 운영에서 ezmesya 연결 성공(사용자 확인) |
| 5  | 등록 서버 의도가 동시 편집·중복 입력에서 보존된다 | ✗ FAILED (WARNING) | 갭 WR-01+WR-06 (settle 전 행 삭제 · 추가 폼이 기존 계좌 덮어씀) |
| 6  | 증권사별 「주문 서버」 1대 · 시세 주 서버 1대를 증권사/서버 무관하게 즉시 전환 (원 Goal 문구) | ✓ VERIFIED | `uq_dma_servers_order(broker)`·`uq_dma_servers_quote` 부분 유니크 + CHECK(끈 서버 불가), `QuoteSwitch`, Admin `/admin/servers` 라디오. `quote-switch`·`order-server-notice`·`app-access` 3파일 37 테스트 오늘 직접 실행 PASS. 운영 `/admin/servers` 정상(사용자 확인) |
| 7  | 계좌별 주문 서버 (사용자 변경 요청 G-1, 2026-10-10) | ✗ FAILED (BLOCKER) | 구현 없음. 현행은 증권사 단위(`resolveTarget(broker)`, `#byUserBroker`, `orderServerOf(broker)`, healthz `brokers`). 갭 G-1 (+ WR-05 문구 문제 동반) |
| 8  | 다중 서버 fan-out 부분 실패 표시 · 87 에만 있는 유저는 「서버에만 있음」 표시만 | ✓ VERIFIED | `AdminDispatcher` 서버별 결과 배열, `deriveAdminUsersOverview`·`ReflectChip` 칩 4종, `serverOnlyUsers` 편집 불가 행, 오프라인·타임아웃 outcome 기록 |
| 9  | 사용자 삭제·Admin 반영 요청이 꺼진/느린 서버에 막히지 않고 화면이 실제 결과와 일치 | ✗ FAILED (WARNING) | 갭 WR-04+WR-07 (`results.every(ok)` 만 삭제 / 12초 Express vs relay 순차 op) |
| 10 | relay: 세션 (유저, 서버) 단위 · 관찰자 서버 순회 · role 2 admin 연결 · 44/86/87 · 멱등 · BUSY · LivePing 30초/유휴 90초 · 87 뒤 mode 1 자가 선언 · 세션 합류 | ✓ VERIFIED | `admin-conn.ts`(role 2, 44 만 처리, 30초 LivePing), `dispatcher.ts`·`snapshot-sink.ts`(세대 가드)·`session-sync.ts`(declareAccounts mode "1"), `pipelines.ts` 서버별 저널+admin, generated 44/86/87. 운영 healthz `adminConns.KB120/KYOBO119 = ready`. 인박스 노트 `status: done`, `done_commit 1f9c0328` |
| 11 | 역할 강등·허용 해제·레지스트리 변경이 「즉시」 반영 (D-04) | ✗ FAILED (WARNING) | 갭 WR-02 (reload 가 진행 중 Promise 공유 — 코드 직접 확인). 단순 경로는 `app-access.test.ts` PASS, 겹침 경합만 미보호 |
| 12 | 시세 주 서버 break-then-make · 실패 시 예전 서버 복귀 · hub 재구독 1회 | ✓ VERIFIED | `quote-switch.ts`·`quote-switch.test.ts` 오늘 PASS. 주소 변경 케이스는 별도 갭 13 |
| 13 | 시세 주 서버의 host·port 변경이 quote 연결에 반영 | ✗ FAILED (WARNING) | 갭 WR-03 (`if (change.roles)` 만 보정, 키만 비교하는 noop) |
| 14 | 보존 제약 — 교보119·KB120 운영 상태 보존(커서·epoch·매핑·신원 유지) | ✓ VERIFIED | 운영 healthz: 두 저널 `live`·`lagSeq 0`·`seqRegressions 0`·`projectionErrors 0`, `mapping.rows` 유지, `sessionCount 0`(호출 시점에 열린 사용자 세션 없음). 사용자 확인 「/trading 정상」 |
| 15 | 빅뱅 배포·롤백 런북·gh-trade 착수 게이트 (ADMIN-12) | ✓ VERIFIED | `deploy-relay.sh` 전환 잠금·호스트 env 제거·`--rollback` 명시 주입, `supabase/rollback/29-gateway-key-rename-revert.sql`, 배포 창 SQL 은 migrations 로 이동(deploy-window 제거), server rev `gh-radar-server-00058-kqw`, 무인증 `/api/admin/users` 401(오케스트레이터 근거). 인박스 `status: done` |
| 16 | Admin 화면이 채택 목업 A·D-14(「목록은 남는다」)를 따르고 모바일 터치 타깃 충분 | ✗ FAILED (WARNING, partial) | 갭 UI-REVIEW-2+3+6. 나머지 UI(스켈레톤·오류·삭제 확인·부분 실패 칩·자기 잠금 방지)는 양호 |

**Score:** 9/16 truths verified (0 present, behavior-unverified)

### 점수 해석에 대한 메모

실패 7건 중 블로커는 2건(3 = CR-01, 7 = G-1)이다. 나머지 5건은 목표 문구와 직접 충돌하지만 좁은 경합·가장자리 경로라 Warning 으로 분류했다 (행 5·9·11·13·16). 운영 핵심 흐름(레지스트리, 조회·편집·연결, 서버 상태, 트레이딩)은 정상이라는 사용자 확인과 모순되지 않는다.

### Deferred Items

없음. ROADMAP 의 Phase 29 뒤에 다른 페이즈가 없어(roadmap.analyze 확인) 이월할 곳이 없다. 따라서 모든 갭은 `/gsd-plan-phase 29 --gaps` 대상이다.

### Required Artifacts

`verify.artifacts` 를 26개 플랜에 모두 돌린 결과: 전부 통과 (예외 2건은 의도된 이동).

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20261006200000..300_*.sql` (4) | 접근/레지스트리/의도 RPC/반영 | ✓ VERIFIED | RLS 켜짐·정책 0·`REVOKE anon, authenticated` 명시 패턴, 원격 push 완료 |
| `supabase/migrations/20261007200000_gateway_key_rename.sql`, `20261007200100_dma_visibility_v2.sql` | 키 개명 · 가시성 v2 | ✓ VERIFIED | 단, 개명 SQL 머리 주석이 아직 `supabase/deploy-window/29/` 를 정본 위치로 설명 (Info — 파일은 29-26 에서 migrations 로 이동) |
| `relay/src/{registry,admin,access,quote}/*` | 레지스트리·admin·접근 맵·QuoteSwitch | ✓ VERIFIED | `index.ts` 에서 결선(adminSnapshotSink · adminDispatcher · appAccess · quoteSwitch · pipelines.sync) |
| `server/src/routes/admin.ts`, `admin-servers.ts`, `middleware/require-admin.ts`, `services/relay-admin-client.ts` | Admin API | ✓ VERIFIED | CR-01 제외 |
| `webapp/src/app/admin/{users,servers}/page.tsx`, `pending/page.tsx`, `components/admin/*` (14) | Admin 화면 | ✓ VERIFIED | 존재·결선. 시각 결함은 갭 16 |
| `supabase/deploy-window/29/*.sql` (29-09 선언) | 배포 창 SQL | 의도된 부재 | 29-26 이 migrations 로 이동·`git rm` — 정상. `verify.artifacts` 의 29-09 2건 · `key-links` 의 29-09/29-25 2건 실패는 이 이동 때문 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| middleware.ts | `my_app_access` RPC → `decideAccess` | rpc 1회 | ✓ WIRED | 82~83행 |
| Express admin 라우트 | relay `/internal/admin/*` | `relay-admin-client` + `x-relay-secret` | ✓ WIRED | 운영 401 확인(오케스트레이터) |
| relay admin-conn | `adminSnapshotSink.onSnapshot` | `p.admin.on("snapshot")` | ✓ WIRED | index.ts 375행 |
| snapshot-sink | `JournalAccess.replace` | `accessOf(serverKey)?.replace(rows)` | ✓ WIRED | 159행 (key-links 정규식 `access\.replace` 가 `?.replace` 와 안 맞아 거짓 실패) |
| registry changed | pipelines.sync / quoteSwitch / fanout.notifyOrderServers | `registry.on("changed")` | ⚠️ PARTIAL | host/port 변경 시 quoteSwitch 미호출 (WR-03) |
| 29-07 마이그레이션 → middleware | `db push` 명령 패턴 | 플랜 정규식 | 해당 없음 | 플랜의 문자열 패턴이 코드가 아니라 사람 명령이라 도구가 못 찾음 — 원격 적용 자체는 29-07 SUMMARY·운영으로 확인 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `/admin/users` 목록 | `AdminUsersRaw` → 개요 | RPC `admin_users_raw()` (DB 의도 + 87 반영 표) | 예 — 사용자 확인: 실데이터 표시 | ✓ FLOWING |
| `/admin/servers` 카드 | 서버 행 + 상태 칩 | RPC `admin_servers_raw` + relay `/internal/admin/servers/status` | 예 — KB120·KYOBO119 연결·121/127 꺼짐(사용자 확인) | ✓ FLOWING |
| 반영 칩 | `dma_admin_results` + 87 스냅샷 | relay snapshot-sink → `dma_admin_apply_snapshot` | 예 — 「반영됨」 확인 | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 운영 relay 레지스트리 모드·admin 연결 | `curl https://dma.jx1.io/healthz` | `brokers.KB.server=KB120`, `KYOBO=KYOBO119`, `adminConns` 두 곳 `ready`, 두 저널 `live` lag 0 | ✓ PASS |
| 시세 전환·접근 맵 즉시 회수·주문 서버 알림 | `vitest run tests/quote-switch.test.ts tests/app-access.test.ts tests/order-server-notice.test.ts --maxWorkers=1` | 3 files / 37 tests passed | ✓ PASS |
| CR-01 존재 확인 | `server/src/routes/admin.ts` POST /users 와 RPC 소스 판독 | DMA_LINKED 가드 없음, 무조건 UPDATE | ✗ FAIL (갭) |
| 전체 회귀 | 오케스트레이터가 오늘 수행 | relay 1263 · webapp 3780(+1 skip) · shared 435 · server 472 · pgTAP 867 · e2e 149 | ✓ PASS (이번 검증에서 재실행하지 않음 — 메모리 사정) |

### Probe Execution

SKIPPED — 이 페이즈는 `scripts/*/tests/probe-*.sh` 형태 프로브를 선언하지 않았다 (검증 수단은 vitest · pgTAP · Playwright).

### Requirements Coverage

**추적성 메모:** `.planning/REQUIREMENTS.md` 에는 `ADMIN-xx` ID 가 한 건도 없고 Phase 29 행도 없다 (ROADMAP: `Requirements: TBD`). 26개 플랜은 RESEARCH 가 파생한 `ADMIN-01`~`ADMIN-12` 를 frontmatter 에 썼다 (정의 정본 = `29-RESEARCH.md` 78~89행). 모든 ID 를 아래에서 설명했다. ORPHANED 요구사항(REQUIREMENTS.md 가 Phase 29 에 매핑했으나 플랜이 안 쓴 ID)은 없다 — 매핑 자체가 없다. 조치 권고: 갭 클로징 때 REQUIREMENTS.md 에 ADMIN-01~12 를 등록해 추적성을 맞추거나, TBD 를 유지한다는 결정을 명시한다.

| Requirement | Source Plans | Description (RESEARCH) | Status | Evidence |
|-------------|--------------|------------------------|--------|----------|
| ADMIN-01 | 01, 07, 09, 25 | 서버 레지스트리 + 키 in-place 개명 + 역개명 롤백 | ✓ SATISFIED | 진실 1·15 |
| ADMIN-02 | 01, 07, 10, 12 | 허용 gmail·역할 표 + middleware 게이트 + 승인 대기 | ✓ SATISFIED | 진실 2 (미승인 실화면은 Human 1) |
| ADMIN-03 | 01, 05, 06, 07, 09, 25 | DMA 유저·계좌·등록 서버 의도 표 + 비밀번호 1개 + 가시성 뷰 | ⚠️ PARTIAL | 스키마·가시성 OK, 연결 덮어쓰기 CR-01 (진실 3·5) |
| ADMIN-04 | 02, 03, 08 | relay 레지스트리 순회 · 서버별 저널 + admin(role 2) · 안전 기본값 | ✓ SATISFIED | 진실 10 |
| ADMIN-05 | 02, 04, 05, 08, 11, 14 | admin 명령 경로 44 fan-out → 86 → 87 서버별 적재 | ✓ SATISFIED (결함 동반) | 진실 8·10 + WR-01·04·07 은 갭 |
| ADMIN-06 | 16, 20, 21, 22 | (유저, 서버) 세션 · 증권사별 주문 서버 · 주문 서버 바뀜 프레임 · mode 1 자가 선언 | ⚠️ PARTIAL | 세션·선언·프레임 OK, 사용자 변경(G-1)·WR-05 |
| ADMIN-07 | 23 | 시세 주 서버 즉시 전환 break-then-make | ✓ SATISFIED (결함 동반) | 진실 12, 가장자리 WR-03 |
| ADMIN-08 | 10, 11, 13, 24, 26 | Express `/api/admin/*` + requireAdmin + relay 클라이언트 + Cloud Run env | ✓ SATISFIED | 진실 15 (WR-07 동반) |
| ADMIN-09 | 04, 05, 13, 15, 17, 19 | `/admin/users` 목록·승인 대기·칩·시트·생성 시트 | ⚠️ PARTIAL | 화면 동작 OK, 생성 경로 CR-01 · 추가 폼 WR-06 |
| ADMIN-10 | 04, 05, 13, 15, 18 | `/admin/servers` + 사이드바 Admin 그룹 | ✓ SATISFIED (UI 결함 동반) | 진실 6·16 |
| ADMIN-11 | 06, 11 | 역할 강등·허용 해제 즉시 반영 | ⚠️ PARTIAL | 진실 11 (WR-02) |
| ADMIN-12 | 24, 25, 26 | 빅뱅 배포·롤백 런북 | ✓ SATISFIED | 진실 15 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `server/src/routes/admin.ts` | 173-205 | 정본 가드 부재(한 경로만 DMA_LINKED) | 🛑 Blocker | CR-01 고아 DMA 유저 |
| `supabase/migrations/20261006200200_dma_admin_intent_rpcs.sql` | 120-122, 274-276 | 무조건 UPDATE · 전 행 DELETE | 🛑 Blocker(CR-01) / ⚠️ Warning(WR-01) | 위 갭 |
| `relay/src/access/app-access.ts` | 148-156 | 진행 중 Promise 공유 | ⚠️ Warning | WR-02 |
| `relay/src/index.ts` | 463-473 | `change.roles` 만 시세 보정 | ⚠️ Warning | WR-03 |
| `relay/src/admin/dispatcher.ts` | 186-187 | `every(ok)` 만 삭제 | ⚠️ Warning | WR-04 |
| `supabase/migrations/20261007200000_gateway_key_rename.sql` | 머리 주석 | 이동 전 경로(`supabase/deploy-window/29/`) 설명 | ℹ️ Info | 문서 낡음 |
| `infra/relay/README.md` | 679 | `kMaxObservers` 4 (gh-trade 는 6) | ℹ️ Info | 문서 낡음 — 갭 클로징 때 같이 정정 |
| debt marker (`TBD`/`FIXME`/`XXX`) | — | 없음 | — | 커버 파일 전체 grep 결과 0건 (부채 마커 게이트 통과) |

IN-01(DMA id 마스킹 3벌) · IN-02(`timeout` 칩 색이 시트 err / 개요 warn) · IN-03(`useFieldSave` 성공 값 고정)은 목표를 막지 않는 Info 로 **갭에서 제외**하고, 갭 클로징 플랜 말미에 묶어 처리하도록 권고한다 (IN-03 은 WR-03 의 quote 복구가 화면에 안 보이는 부작용과 맞물리므로 WR-03 과 함께 고치면 싸다). UI 감사 중 `Button size="sm"` 글자색 소실(전역 컴포넌트)·`chat-sheet` 폭(Phase 29 밖 표면)·타이포 스케일 이탈은 Phase 29 표면 밖이거나 취향 영역이라 **별도 quick 으로 분리**하고 갭에서 제외했다.

### Human Verification Required

#### 1. /pending 승인 대기 화면 (미승인 계정)

**Test:** app_users 에 없는 Google 계정으로 로그인한다. 스캐너·뉴스·종목 등 임의 경로로 이동해 본다. 이어서 Admin 이 승인하면 어떻게 되는지 본다.
**Expected:** 항상 `/pending` 이 보이고 안내 한 줄 + 이메일 + 로그아웃 1개가 390px 모바일·데스크톱에서 정상 렌더링된다. 승인 직후 다음 이동에서 홈으로 돌아간다.
**Why human:** 시각·UX. 단위·e2e 는 승인된 사용자의 `/pending → 홈` 이동만 보증하고, 미승인 계정의 실제 화면은 사람이 확인한 적이 없다.

### Gaps Summary

**블로커 2건 (갭 클로징 필수)**

- **G-1 계좌별 주문 서버** — 사용자 요청으로 D-10("증권사별 주문 서버 1대")을 뒤집는다. 구현 영향이 넓다. 계획 시 결정할 사항: (a) DB 열 위치와 제약(계좌의 활성 등록 서버로만, NULL = `dma_servers.is_order_server` 기본값, 등록 서버를 해제하면 NULL 로 복귀), (b) relay 라우팅 키를 `(userId, broker)` 에서 `(userId, serverKey)` 로 바꾸되 두 서버 세션은 계좌들이 실제로 서로 다른 서버를 고른 경우에만 보유, (c) 저널 매핑·`journal.state`·healthz `brokers`·`order.server` 알림 재설계 (WR-05 의 무효 문구도 여기서 해소), (d) Admin 계좌 줄 select 와 작업대 계좌별 배지, (e) 장중(08:00~20:00) 교체 금지 규칙에 따른 배포 시점. gh-trade 와이어 변경은 필요 없어 보이나 gh-trade-0d 에 확인만 한다.
- **CR-01 사용자 생성이 기존 DMA 연결을 덮어씀** — 정본 가드를 DB 에 두고 Express 에서도 쓰기 전에 거른다. 운영에 이미 고아 DMA 유저가 생겼는지 점검 쿼리를 함께 둔다.

**경고 갭 5묶음 (같은 클로징 라운드에서 처리 권고)**

WR-01+WR-06(의도 보존) · WR-02(즉시 재적재 꼬리) · WR-03(시세 주소 변경) · WR-04+WR-07(삭제 완결·시간 상한) · UI 3건(데스크톱 시트 오버레이·터치 타깃·사용 중 토글 문구). WR-05 는 G-1 에 흡수.

**확정된 결정 (갭 아님)**

- G-2: 교보 trader id 칸은 필요 없다 — 교보 주문 전문(146B)에 지점·트레이더 필드가 없고 주문자 식별은 서버별 FEP 로그온 USER ID (gh-trade `KyoboProtocol.h`, go-trader `pkg/order/kyobo`). 29-26 SUMMARY 의 key-decisions 와 일치한다.

**운영 메모 (갭 아님)**: gh-trade 서버의 「마지막 사용자 삭제 거부(op 2 → code 12)」 가드는 gh-trade 쪽 재배포 대기 (코드 리뷰도 수용 처리). Admin 에서 서버의 마지막 사용자를 삭제하지 않는 운영 수칙이 재배포 전까지 유효하다.

---

_Verified: 2026-10-10T06:17:00Z_
_Verifier: Claude (gsd-verifier)_
