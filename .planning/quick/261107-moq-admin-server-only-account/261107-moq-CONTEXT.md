# quick 261107-moq — 어드민 「서버에만 있음」 계좌 줄: 이 사용자에 연결 · 서버에서 빼기

## 배경 (2026-11-07)

- gh-trade 가 11/5 교보 112 를 다시 세팅하며 119 의 `users.toml` 을 그대로 복사했다. 그래서 112 의 milles/김현중 ·
  ezmesya/김현중이 gh-radar DB 의도(`dma_account_servers`)에 없는 「서버에만 있음」 계좌가 됐다.
- 어드민에서 milles/김현중 연결을 지웠지만 op 는 DB 등록 서버(119)에만 갔다. 112 에 남아 gh-trade 로그인 계좌 목록에 계속 보였다.
- 그날 수동 정리 완료: `dma_admin_adopt_server_accounts('KYOBO112')` → relay 내부 DELETE → 112 op 4 ok.
- gh-trade 의견(gh-trade-85): D-23 ⑤(DB 에 없는 서버 계좌는 자동으로 안 건드림)는 유지한다. 자동 adopt 대신
  Admin 이 「서버에만 있음」을 보여 주고 **확인을 받아** 등록한다.

## 결정 (잠김)

- **D-01 화면 = 목업 B** (`reference/mockup-server-only-account.html`, 사용자 채택 2026-11-07).
  - 대상은 사용자 시트의 **흐린 점선 계좌 카드** `ServerOnlyAccountRow` 하나다
    (`webapp/src/components/admin/account-editor.tsx` — 그 사용자 의도에 없는 계좌가 87 에만 있음).
  - 카드 안 칩 아래에 한 줄 설명을 넣는다: 「**{서버키 · 로 이음}** 서버 설정에만 있고 이 사용자에 연결돼 있지 않아요.
    그래서 여기서 연결 해제해도 그 서버에는 닿지 않아요.」
  - 그 아래 버튼 줄 `[이 사용자에 연결]` `[서버에서 빼기](빨강 글씨)`. 누르면 같은 자리에 확인 상자가 버튼 줄을 대신한다.
    - 연결 확인(파랑 테두리): 「{계좌명}을 **{dma}** 에 연결해요. {서버} 서버 설정은 그대로예요.」 /
      작은 글씨 「연결하면 위 계좌들처럼 서버를 켜고 끄거나 연결 해제할 수 있어요.」 / `[취소] [연결]`
    - 빼기 확인(빨강 테두리): 「**{서버}** 서버 설정에서 {dma} 의 {계좌명}을 빼요. {dma} 는 다시 로그인하면 계좌 목록에서 사라져요.」 /
      작은 글씨 「이 계좌에 상따·VI·미체결·예약이 남아 있으면 서버가 거절해요(같은 계좌를 가진 다른 사용자 것도 포함) — 장 마감 뒤에 하세요.」 /
      `[취소] [서버에서 빼기](빨강 채움)`
  - 결과: 성공이면 목록 재조회(연결 → 일반 계좌 카드로 바뀜 · 빼기 → 카드 사라짐). 서버별 실패(BUSY 등)는 기존 계좌 카드와
    같은 반영 칩·오류 줄 방식으로 보인다(기존 `onResults` 경로 재사용).
  - 대상 아님: 의도 계좌의 서버 체크 줄에 붙는 「서버에만 있음」 칩(case b) — 지금처럼 체크박스로 켜면 등록된다. 손대지 않는다.
  - 대상 아님: 사용자 목록의 「서버에만 있음」 **사용자** 행(`ServerOnlyRow` — dma_users 에 없는 DMA id). 그대로 보기만.
- **D-02 「연결」과 「빼기」는 한 RPC** — 새 마이그레이션의 `dma_admin_adopt_server_only_account(p_dma_user_id, p_broker, p_account_no, p_remove boolean)`:
  - dma_users 행 잠금(`FOR UPDATE`), 없으면 `NO_DMA_USER`.
  - 원천 = `dma_server_user_accounts`(87) 중 그 (유저, 계좌번호) · 서버 증권사 = p_broker · **enabled 서버만** ·
    `dma_account_servers` 에 그 (유저, 증권사, 계좌, 서버) 행이 **아직 없는** 것. 0건이면 `NOT_SERVER_ONLY`(이미 정리됐거나 오래된 화면).
  - `dma_user_accounts` 에 87 값(name · branch_no · trader_id · priority — 여러 서버면 서버 sort_order 첫 행)으로
    `ON CONFLICT DO NOTHING` 삽입(CHECK 위반은 원래 23514 그대로). 계좌 마스터는 기존 트리거가 채운다.
  - `dma_account_servers` 에 원천 서버마다 `state = CASE WHEN p_remove THEN 'removing' ELSE 'active' END` 삽입.
  - 반환 `{ servers: [...] }`. REVOKE PUBLIC · anon · authenticated 명시, GRANT service_role (메모리 함정).
  - 기존 `dma_admin_adopt_server_accounts(p_server)`(서버 통째 입양 · 배포 창 런북)는 그대로 둔다.
- **D-03 relay 경로** — `relay/src/admin/admin-api.ts` 에 `POST /dma-users/:dma/accounts/:broker/:accountNo/server-only`
  body `{ action: "link" | "remove" }`:
  - 둘 다 intent-store 새 메서드(위 RPC) → `link` 는 op 없음(서버에 이미 같은 값이 있다) · 결과 `{ results: [] }`.
  - `remove` 는 RPC 뒤 `dispatcher.reconcileUser(dma, …)` — 기존 planner 가 removing 계좌를 op 4(그 서버의 그 유저 계좌 전부면 op 2)로
    보내고 settle 이 행 · 연결을 지운다. 기존 DELETE 라우트와 같은 audited · 마감 · `reloadOrderServers` 패턴.
  - IntentError 코드 `NOT_SERVER_ONLY` · `NO_DMA_USER` 매핑(409/404 — 기존 코드 매핑 규약을 따른다).
- **D-04 server(Express)** — `server/src/routes/admin.ts` 에 같은 경로 프록시 + `relay-admin-client.ts` 메서드. 기존 removeAccount 와 같은 모양.
- **D-05 webapp** — `webapp/src/lib/admin-api.ts` 클라이언트 함수 + `ServerOnlyAccountRow` 를 D-01 대로. 사용자 시트가 이미 받는
  `onResults` · `onChanged` 를 넘긴다.
- **D-06 범위 상한** — 위 5곳 + 각 테스트(마이그레이션 pgTAP 1 · relay route 단위 · server route 단위 · webapp 컴포넌트 단위)만.
  planner/dispatcher/shared diff 로직은 바꾸지 않는다. e2e 전체 회귀 금지(관련 spec 만, 동시 세션 메모리 — vitest `--maxWorkers=2`).

## 배포 순서

DB 마이그레이션 → relay → server → push(webapp). 배포는 메인 세션이 한다(서브에이전트 배포는 분류기 차단).
