# Phase 29: DMA 다중 서버 · 웹 Admin 유저 관리 - Context

**Gathered:** 2026-10-06
**Status:** Ready for planning

<domain>
## Phase Boundary

relay 가 게이트웨이 4대(KB120 · KB121 · KYOBO119 · KYOBO127)를 **서버 레지스트리**로 다루고, 웹 **Admin 메뉴**(`/admin/users` · `/admin/servers`)에서 바꾼 허용 gmail · 역할 · 웹유저↔DMA유저 연결 · 계좌 · 등록 서버 · 주문/시세 서버가 relay 의 **서버별 관리자 연결**(ObserverLoginReq role 2 · 44/86/87)로 gh-trade 서버 users.toml 에 즉시 반영된다. 기존 KB/KYOBO 키는 in-place 마이그레이션(커서 · epoch · 매핑 · 신원 보존), 모든 마이그레이션은 additive. 교보119 · KB120 은 운영 중(미체결 · 잔고)이라 기존 세션 · 관찰자 동작은 마지막 배포 단계까지 불변.

**범위 밖:** gh-trade 서버 쪽 구현(gh-trade Phase 29 `29-admin-users-toml-gh-radar`, worktree `phase-29-admin-users`) · WinForms 클라 변경(없음) · 트레이딩 표면 UI 변경(주문 서버 바뀜 배지 1개 제외).

**착수 게이트:** gh-trade 확정 fbs 인박스 노트(`docs/inbox/from-gh-trade/`) 도착 → `sync-relay-schema.sh` 생성물 커밋 뒤 relay 착수. 2026-10-06 현재 fbs 에 44/86/87 은 아직 없고 인박스 open 노트도 없다. 웹 Admin · DB · 허용/역할은 게이트와 무관하게 먼저 진행 가능.

</domain>

<decisions>
## Implementation Decisions

### 이미 확정된 것 (ROADMAP · 메모리 `project_dma_admin_multi_server_261006` · gh-trade ROADMAP Phase 29 · gh-trade-0d 10-06 통보 — 다시 묻지 않는다)
- 서버 키 = 증권사+IP 끝자리 `KB120` · `KB121` · `KYOBO119` · `KYOBO127`. 기존 `KB`→`KB120`, `KYOBO`→`KYOBO119` 는 **in-place UPDATE**(dma_journal_cursor · dma_journal_events · dma_strategy_events · dma_gateway_identities · dma_account_access 등 `gateway` 문자열 키 전부 — 커서 · epoch · 매핑 · 신원 보존). additive 만.
- DMA user_id 는 웹유저당 1개, **모든 증권사 · 서버에 같은 문자열**. 비밀번호는 Admin 이 정하고 relay 가 DMA 유저당 1개 암호화 보관 → 서버마다 op1 UpsertUser.
- 계좌는 (증권사, 계좌번호) 단위로 등록 서버 목록 선택. 같은 KB 계좌를 두 KB 서버에 동시 등록 가능. 이중 전략 방지 불필요(서버가 각자). 교보는 branch/trader 빈값 · 라우팅표 없음 · account_no 는 서버 정규화 값으로 대조.
- 계좌 0개 유저 불허(신규 op1 첫 계좌 필수 · 마지막 계좌 제거는 code 12 LAST_ACCOUNT → 유저 삭제로). 유저 생성 = 유저 + 첫 계좌 한 화면.
- 증권사별 「주문 서버」 1대 · 시세 주 서버 1대(증권사/서버 무관) 즉시 전환. 다중 서버 fan-out 부분 실패 표시. 87 에만 있는 유저는 「서버에만 있음」 표시만(편집 불가).
- relay: 세션 (유저, 서버) 단위 · 관찰자(저널 · quote) 서버 순회 · 서버별 관리자 연결 = ObserverLoginReq(5) role 2 — observer.toml secret 하나(`DMA_OBSERVER_SECRET` 그대로, 새 Secret 없음) · 서버 kMaxObservers 4→6 · C→S 44 AdminCommandReq(op 1 UpsertUser / 2 DeleteUser / 3 SetAccount / 4 RemoveAccount / 5 ListUsers, request_id) · S→C 86 AdminCommandResp(code 0~12, 한국어 message, users_rev) · S→C 87 AdminUsersSnapshot(users.toml 전체, 비밀번호 없음, 변경 뒤 · op5 뒤) · 멱등(같은 값 → 0, rev 불변) · admin 연결 LivePing 30초 / 유휴 90초 스윕 / 5분 재접속 · 계좌 추가 후 87 → 보고 3(mode 1) 자가 선언 · 세션 합류 유지(user_id@BROKER, D-17 뒤집음 — 웹과 WinForms 가 같은 Session 공유).
- **BUSY(9) 는 계좌 상태로만 판정**(LimitChaser · VI · VIOrderWatch · 미체결 · 예약주문). 접속 수는 사유가 아니다. **DeleteUser(op 2) 는 연결이 붙어 있어도 BUSY 가 아니다** — 조건 없으면 서버가 그 유저 세션 전부에 54 INFO 「관리자가 사용자를 삭제 — 연결 종료」 → 연결 종료 → users 제거 → 86 ok → 87. relay 가 그 유저로 열어 둔 사용자 세션도 끊기고 재로그인은 거부된다(relay 는 이를 `unauthorized` 류 종료로 다루고 재접속 루프를 돌지 않는다). SetAccount(op 3) 로 기존 계좌의 branch_no/trader_id 변경은 그 계좌에 BUSY 조건이 있으면 9 거부(name/priority 변경은 항상 즉시). (gh-trade-0d 2026-10-06 통보)
- 보존 제약: 교보119 · KB120 운영 중. 기존 세션 · 관찰자 동작은 마지막 배포 단계까지 불변.

### 허용 gmail · 역할 모델
- **D-01: 허용 목록은 로그인 뒤 전면 차단.** Google 로그인은 지금처럼 누구나 되지만, 허용 표에 없는 gmail 은 앱 어디서든 「승인 대기」 화면만 본다(스캐너 · 뉴스 · 종목도 못 봄). 판정은 `webapp/src/lib/supabase/middleware.ts` 1곳(공개 whitelist 기본 차단 위에 역할 게이트 추가). 가입 흔적(auth.users)이 남아 Admin 이 「가입한 사용자 중에서 허용」 할 수 있고, 목록에 넣는 즉시 풀린다. — **Reversibility:** costly — 로그인 자체 거부(Auth Hook)로 바꾸면 승인 대기 목록 흐름(D-03)이 사라진다.
- **D-02: 역할 3단 admin · trader · viewer.** admin = Admin 메뉴 + 모든 화면, trader = Admin 제외 전부, viewer = 트레이딩 표면 없이 스캐너 · 뉴스 · 분석만(DMA 연결 없음). 테마 운영자 권한(`theme_admins` · `is_theme_admin()`)은 admin 역할에 흡수 — `is_theme_admin()` 을 새 표의 admin 판정으로 재정의하거나 theme_admins 를 뷰로 대체(플래너 재량, 기존 RLS 정책 이름 유지). 사이드바 조건부 숨김 규칙이 viewer 만큼 하나 늘어난다. — **Reversibility:** reversible.
- **D-03: 허용 · 역할 부여 = 사전 등록 + 가입 대기 둘 다.** 허용 표의 키는 **이메일**(gmail). Admin 이 가입 전에 이메일을 넣어 둘 수 있고(사전 등록), 가입했지만 미허용인 사용자는 `/admin/users` 상단 「승인 대기」 섹션에 떠서 역할을 골라 승인한다. 가입 시 auth.users 와 이메일로 매칭. — **Reversibility:** reversible.
- **D-04: 역할 강등 · 허용 해제는 즉시.** middleware 가 매 요청 역할을 보므로 다음 페이지 이동부터 차단. relay 는 허용/역할 표를 읽어(identities 60초 재적재 동형, 또는 Express→relay HTTP 즉시 통보) 그 사용자의 wss 를 끊고 DMA 세션은 유예 후 종료. 서버 쪽 전략 · 미체결은 건드리지 않는다. — **Reversibility:** reversible.

### 진실 원본 · 비밀번호 · 반영 경로
- **D-05: DB 가 의도, 서버 87 은 반영 상태.** Supabase 새 표(웹유저 · 허용/역할 · DMA 유저 · 계좌 · 계좌별 등록 서버)가 Admin 이 정한 의도이고, relay 가 서버별 87 스냅샷을 **서버별 DB 표**에 적재해 화면은 두 표를 조인해 「반영됨 / 미반영 / 실패 · BUSY / 서버에만 있음」 칩을 그린다. 서버가 꺼져 있어도 편집은 가능하고 「다시 반영」 이 차이를 따라잡는다. 기존 `dma_credentials` · `dma_gateway_identities` 는 새 표에서 **파생**(relay 소비자 · RPC `dma_*_for_user` 의 (gateway, dma_user_id) 조인 의미는 유지). — **Reversibility:** one-way — 새 표를 정본으로 삼은 뒤 relay 세션 · 가시성 RPC · 주문 경로(`server/src/services/dma-orders.ts` 의 user_id→dma_user_id→dma_account_access 체인)가 그 표를 읽게 되므로, 되돌리려면 데이터 역이관 마이그레이션이 필요하다.
- **D-06: 비밀번호는 Admin 이 입력(확인 칸 1개) · 저장 후 재표시 없음.** 「변경」 만 가능, 복호화 API 없음. 기존 `encryptDmaPassword`(AES-256-GCM, AAD = user_id) 재사용. — **Reversibility:** reversible.
- **D-07: 반영 경로 = webapp → Express(admin 역할 검증) → relay HTTP 요청/응답.** 주문 D-22(`x-relay-secret`) 경로 동형. relay 가 대상 서버마다 44 를 보내고 86 을 모아 **서버별 결과 배열**로 응답(타임아웃 · 끊긴 서버는 그 서버만 실패). 87 은 relay 가 서버별 DB 표에 적재. Admin 화면은 wss 없이 동작(admin 에게 DMA 세션이 없어도 된다). — **Reversibility:** costly — wss admin 프레임으로 바꾸면 hub · fanout 에 admin 경로가 생기고 Express 라우트는 버려진다.
- **D-08: 비밀번호 변경은 열린 세션 유지 · 다음 로그인부터 새 비밀.** relay 는 암호문만 교체하고 열린 사용자 세션은 그대로(전략 · 미체결 영향 0). 5분 유예 뒤 재로그인부터 새 값. 서버 동작과 같은 의미. — **Reversibility:** reversible.

### 서버 레지스트리 · 전환 · 배포 단계
- **D-09: 서버 레지스트리는 전부 DB 표**(예: `dma_servers` — 키 · 증권사 · host · port · enabled · 증권사별 주문 서버 · 시세 주 서버). Admin `/admin/servers` 에서 편집, 재배포 없이 서버 추가. relay 는 부팅 시 + 주기(identities 동형) 또는 HTTP 통보로 재적재해 관찰자(저널 · admin) 연결을 enabled 서버에 맞춰 올리고 내린다. **안전 기본값 재설계 필수:** 지금 `relay/src/config.ts` 원칙(실서버 주소는 배포 env 로만, 로컬 기본값은 안전)을 유지하려면 로컬 · 테스트 relay 가 운영 DB 레지스트리를 읽어 실서버에 붙지 못하게 하는 env 게이트(예: 레지스트리 사용 여부 플래그 · nodeEnv 조건 · 허용 호스트 접두 검사)를 둔다 — 형태는 플래너 재량, 원칙은 고정. 네트워크(라우트 · nft · DOCKER-USER)는 `infra/relay/README.md` §DMA 서버 추가 절차 그대로 수동. `scripts/deploy-relay.sh` 의 `DMA_HOST` · `DMA_KYOBO_*` env 는 마지막 배포에서 레지스트리로 대체(호환 기간 없음, D-12). — **Reversibility:** costly — env 표로 되돌리면 Admin 서버 페이지 · 즉시 전환이 사라지고 deploy 스크립트가 다시 주소를 안다.
- **D-10: 주문 서버 전환 시 기존 세션 유지 · 새 로그인부터 새 서버.** 열린 사용자 세션은 예전 서버에 그대로(미체결 · 전략 보존). 사용자 화면에 「주문 서버가 KB121 로 바뀜 — 재접속하면 적용」 배지(상태 프레임 1종 추가, 문구 재량). 정리와 이동은 사용자가 한다(「서버 옮겨 주문」 전제). — **Reversibility:** reversible.
- **D-11: 시세 주 서버 전환은 break-then-make.** quote 연결은 1개 불변. 예전 연결을 닫고 새 서버에 role 1 로그인 → 합집합 재구독(`resubscribeAll` 동형). 전환 중 시세 배지 적색 + 호가창은 마지막 캐시(Phase 26 D-01 그대로). 새 서버 로그인 실패(거부 · 타임아웃)면 예전 서버로 되돌리고 Admin 에 오류 표시. — **Reversibility:** reversible.
- **D-12: 배포는 1회 빅뱅.** gh-trade 서버 4대가 새 프로토콜(role 2 · 44/86/87 · kMaxObservers 6)로 올라온 뒤, 장 마감 후(20:00 이후) DB → relay → webapp 한 번에. 단계 간 호환 코드 없음. 롤백 = 이전 relay 이미지 재배포 + webapp 되돌림(DB 마이그레이션은 additive 라 그대로 둬도 옛 relay 가 돈다 — 키 개명 UPDATE 는 옛 relay 의 `KB`/`KYOBO` 커서 조회와 어긋나므로 **롤백 절차에 키 역개명 SQL 을 포함**). 그 전까지 운영 relay(KB120 · KYOBO119 관찰자) 는 손대지 않는다. — **Reversibility:** one-way — 배포 뒤 Admin 이 서버에 쓴 users.toml 변경은 되돌릴 수 없고, 키 개명은 역개명 SQL 로만 되돌린다.

### Admin 화면 구조와 흐름 (목업 3장 채택 — `reference/` 참조)
- **D-13: 사이드바 「Admin」 그룹 아래 하위 2항목 `/admin/users` · `/admin/servers`.** 「분석 › 상한가 보고서」 패턴(`app-sidebar.tsx`). admin 역할에게만 노출, 모바일 탭바에는 넣지 않는다(드로어 진입). — **Reversibility:** reversible.
- **D-14: `/admin/users` = 목록 + 시트(목업 A).** 폰은 바텀시트(거의 전체 높이), 데스크톱은 우측 패널 440px, 목록은 남는다(호가주문 바텀시트 스케치 002 패턴 재사용). 목록 상단 「승인 대기」 섹션(행 + 「승인」 버튼 → 역할 선택). 유저 행 = 이메일 · 역할 칩 · DMA id(없으면 「DMA 연결 없음」) · 계좌 수 · 서버별 반영 칩. 「서버에만 있음」 행은 흐린 칩, 보기만. 「+ 사용자」 버튼은 헤더 우측. — **Reversibility:** reversible.
- **D-15: 시트 안 편집은 필드별 즉시 저장 · 결과 칩 인라인.** 역할 세그먼트 탭, 계좌별 등록 서버 체크 토글, 계좌 추가/제거, 비밀번호 변경 확인 — 각각이 한 요청(D-07)이고 응답이 오면 그 자리 칩이 반영됨/실패 · BUSY(서버 한국어 message 그대로)로 바뀐다. 「저장」 버튼 없음, 「다시 반영」 · 「사용자 삭제」 만 하단. Phase 27 D-13 즉시 저장 동형. 유저 삭제 · 마지막 계좌 제거(= 유저 삭제)는 확인 다이얼로그 1회(위험 작업). — **Reversibility:** reversible.
- **D-16: 「+ 사용자」 생성 시트 = 한 시트 · 역할 따라 DMA 섹션 펼침(목업 A).** gmail · 역할 세그먼트가 위. trader/admin 을 고르면 「DMA 연결」 그룹(DMA id · 비밀번호 · 확인 · 첫 계좌: 증권사 세그먼트 · 계좌번호 · 등록 서버 체크 — 증권사에 맞는 서버만 활성)이 펼쳐지고 **전부 필수**. viewer 는 gmail · 역할만. 버튼 1개가 허용 표 + DMA 유저 + 첫 계좌를 한 번에 만들고(DB 의도 저장 → 등록 서버마다 op1 + op3), 서버별 결과는 만들어진 유저의 편집 시트로 넘어가 칩으로 보인다. 이미 가입한 이메일이면 승인 대기에서 빠진다. — **Reversibility:** reversible.
- **D-17: `/admin/servers` = 증권사 그룹 카드(목업 A).** 「KB」「교보」 섹션 아래 서버 카드 2장씩. 카드 = 키 · 주소 · 사용 토글 · 상태 칩(연결 · 저널 · admin 연결 · 그 서버 유저 수) · 「주문 서버」 라디오(증권사 안에서 1개) · 「시세 주 서버」 라디오(전체 1개, 초록 계열). 라디오를 누르는 즉시 전환(D-10 · D-11). 카드 탭 → 편집 시트(키 · 증권사 · host · port). 「+ 서버」 헤더 우측. 폰은 카드 1열. 사용을 끄면 그 서버의 저널 · admin 연결을 내리고 주문/시세 서버로 고를 수 없다(운영 중 서버에 유저가 있으면 끄기 전 확인). — **Reversibility:** reversible.

### plan-phase 추가 결정 (2026-10-06 리서치 미결 해소 — 사용자 확인)
- **D-18: (유저, 서버) 세션 병합 규칙 = 권고안.** 주문 · 계좌 · 상따 · 83 은 증권사 세션을 병합해 하나의 웹 사용자 뷰로. VI · 사용자 설정(84) · 돌파 집합(76/78) 은 KB(사용자의 첫 증권사) 세션만 원천. 상태 프레임은 계좌 합집합 + 어느 세션이든 ready 면 ready. 교보 세션 acquire 는 이 규칙으로 이번 phase 에서 켠다. — **Reversibility:** reversible.
- **D-19: 비밀번호 암호화 AAD = dma_user_id (D-06 정정).** 「DMA 유저당 1개 보관」 · 가입 전 사전 등록과 양립하도록 AAD 를 웹 user_id 에서 DMA 유저 키로 바꾼다. 기존 `dma_credentials` 암호문은 relay 모듈을 통해 재암호화 이관(dual-write 기간 뒤 정리). `encryptDmaPassword`/`decryptDmaPassword` 의 AES-256-GCM 자체는 유지. — **Reversibility:** costly — 이관 뒤 되돌리려면 역이관 필요.
- **D-20: 허용/역할 표 초기 시드.** `alex@jx1.io` · `ezmesya@gmail.com`(현 테마 운영자) = admin. `dma_credentials` 를 보유한 기존 사용자 = trader. 나머지 기존 가입자 = 승인 대기(미허용). e2e 테스트 계정 = admin — **e2e 전용 경로로만**(2026-10-06 플랜 체커 뒤 사용자 확인: Playwright 로그인은 실 자격증명 · 미들웨어는 서버측 실 Supabase 판정이라 `page.route` 스텁으로는 역할 부여 불가). 운영 마이그레이션(`supabase/migrations/*`)에 테스트 계정 admin 행을 넣지 않는다. 구체 경로는 플래너 재량: e2e 글로벌 셋업의 service-role upsert(종료 시 제거) · 기존 `webapp/scripts/seed-test-user.ts` 확장 · 비운영 환경 한정 우회 중 택1. 시드 없으면 전체 e2e 가 승인 대기에 막힌다. — **Reversibility:** reversible.
- **D-21: viewer 는 「분석」 제외 (D-02 문구 정정).** viewer = 스캐너 · 뉴스 · 테마만. 상한가 보고서 · AI 애널리스트는 DMA 연결 사용자(trader/admin) 전용으로 유지 — server 의 `DMA_UNMAPPED` 403 게이트는 변경하지 않는다. — **Reversibility:** reversible.
- **D-22: 착수 게이트 열림 (2026-10-06 22:20 — gh-trade 인박스 노트 `docs/inbox/from-gh-trade/261006-admin-users-role2-44-86-87.md` 도착, status: open).** 계약 커밋 `92cdfbff`(브랜치 `worktree-phase-29-admin-users`, master 미병합) · fbs blob `03fc8cbedcd8542e9febf2416fa8bd595aa5d9fd`(안정 식별자) · `fbs_sync_marker ea8d9171` 은 그 HEAD 의 조상. 생성물 동기화는 **worktree 경로에서** `cd /Users/alex/repos/gh-trade/.claude/worktrees/phase-29-admin-users/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh`(`--check` = 대조만, 8 파일 신규/변경 · 삭제 0). 생성물 커밋 뒤 노트의 `status: done` + `done_commit` 를 채워 **경로 지정** 커밋(`git add -A` 금지). gh-trade master 병합 뒤 blob 대조로 재동기화 불필요 여부를 확인한다. 와이어 확정: 테이블 `AdminAccount{account_no,name,branch_no,trader_id,priority:int}` · `AdminCommandReq{request_id:ulong,op:ubyte,user_id,password,account}` · `AdminCommandResp{request_id:ulong,ok:bool,code:ushort,message,users_rev:ulong}` · `AdminUser{user_id,accounts:[AdminAccount]}` · `AdminUsersSnapshot{users_rev:ulong,users:[AdminUser]}`, Envelope 슬롯 92/94/96, 79 role=2 · accounts 빈 벡터 · journal_epoch "". `users_rev` 는 서버 메모리 카운터(재기동 시 1) — relay 는 접속마다 op 5 로 전체 대조. op 4 는 멱등 아님(없는 계좌 → 8).
- **D-23: gh-trade 질문 ①~⑤ 답(gh-radar 결정, 노트 회신).** ① admin 연결은 서버당 1개(journal 1 + admin 1 · quote 는 주 서버 1 → 합 ≤ 6). ② 비밀번호 변경 54 무통지로 충분(D-08 동형). ③ 교보 계좌의 빈 branch/trader 는 Admin 화면에서 「해당 없음」 으로 표시하고 입력 칸은 KB 선택 때만 노출. ④ BUSY(9) 의 한국어 message 는 결과 칩에 그대로 표시(D-15). ⑤ op 4 는 DB 등록 서버 목록에 있는 서버에만 보내고, 87 로 「서버에만 있음」 인 계좌는 지우지 않는다(표시만, D-16); 서버가 8 NO_SUCH_ACCOUNT 를 돌려주면 「이미 없음 = 반영됨」 으로 대조 처리(오류 칩 아님).
- 리서치 Open Q4(KB121 · KYOBO127 observer.toml 비밀) · Q6(healthz 503 축) 은 Claude's Discretion — 권고(증권사별 비밀 env 재사용 · `journal` 축 = KB 주문 서버 저널)로 플랜.

### Claude's Discretion
- 새 DB 표 이름 · 열 · RPC 형태(service_role 전용 + `REVOKE anon, authenticated` 명시 · 공개 읽기 RPC 는 `is_admin()` 게이트) · 87 적재 표 구조(서버별 users_rev 포함) · 기존 dma_credentials / dma_gateway_identities 파생 방식(뷰 vs 동기화) · 마이그레이션 순서.
- 허용/역할 표와 `theme_admins` 통합 형태 · `is_theme_admin()` 재정의 · 승인 대기 차단 페이지의 문구 · 레이아웃(모바일 우선, 로그아웃 버튼 1개 + 안내 한 줄 권고).
- relay: 레지스트리 재적재 방식(주기 vs HTTP 통보) · 서버별 admin 연결 상태기계(`quote/feed.ts` role 매개변수화 vs 파생) · 44 request_id 상관 · 타임아웃 값 · (유저, 서버) 세션 키 설계와 hub 세션 교체 규칙 · 주문 경로(`/api/dma/*`)가 증권사별 주문 서버를 고르는 지점 · 「주문 서버 바뀜」 상태 프레임 이름 · healthz 본문 확장(`journalGateways` 를 레지스트리 키로 · admin 연결 축 · quote 전환 중 상태) 과 503 축(KB120 사용자 세션 · quote 는 그대로, 추가 서버는 본문만 — Phase 26 D-16 · quick-260929-c8e 선례) · 레지스트리 안전 기본값 게이트의 구체 형태(D-09).
- Express: admin 라우트 경로 · 역할 검증 미들웨어 · relay HTTP 계약(요청/응답 JSON) · 감사 로그(누가 무엇을 언제 — 최소 relay 로그 1줄, DB 감사표는 선택).
- 테스트: fake gateway 에 role 2 로그인 · 44/86/87 시나리오 · 다중 서버 fan-out 부분 실패 · 키 개명 마이그레이션 회귀 · middleware 역할 게이트 · Admin 컴포넌트(시트 즉시 저장 · 결과 칩) · e2e 1~2 시나리오.
- KB121 · KYOBO127 처럼 아직 접속 불가한 서버의 초기 상태(enabled=false 시드 권고) · 관찰자 정원 배분(서버당 journal 1 + admin 1, quote 는 주 서버 1 — 합 ≤ 6).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 결정 정본 · gh-trade 계약
- `.planning/ROADMAP.md` §Phase 29 — 범위 · 확정 계약 요약 · 착수 게이트.
- `/Users/alex/.claude/projects/-Users-alex-repos-gh-radar/memory/project_dma_admin_multi_server_261006.md` — 2026-10-06 사용자 결정 정본(서버 키 · DMA id 규칙 · 계좌/서버 · 보존 제약 · 계약 잠정 확정본 · relay 책임).
- `/Users/alex/repos/gh-trade/.planning/ROADMAP.md` §Phase 29 — gh-trade 쪽 Goal(검증→파일 저장→RCU 순서 · 라이브 세션 즉시 반영 · BUSY · 멱등 · 계좌 0개 불허 · kMaxObservers 6 · 세션 합류 유지).
- `/Users/alex/repos/gh-trade/server/src/protocol/StockDMA.fbs` — 현재 와이어(ObserverLoginReq.role 슬롯 14 · ObserverLoginResp.role 슬롯 26). **44/86/87 은 아직 없음** — 확정본은 인박스 노트 + `sync-relay-schema.sh`(gh-trade 소유, `RELAY=` 지정, flatc 25.12.19) 로 온다.
- `docs/inbox/from-gh-trade/README.md` — 인박스 노트 형식 · 처리 절차(`status: done` + `done_commit`, 경로 지정 커밋).
- `/Users/alex/.claude/projects/-Users-alex-repos-gh-radar/memory/reference_gh_trade_protocol_sync.md` — 수기 사본 3곳(`relay/src/dma/msg-type.ts` MSG/INBOUND 화이트리스트 · `envelope.ts` · `subscription-hub.ts`) 갱신 규칙.

### 채택 목업 (Admin 화면 정본)
- `.planning/phases/29-dma-multi-server-admin/reference/mockup-admin-users.html` — `/admin/users` 목록 + 시트(A 채택) · 승인 대기 섹션 · 서버별 반영 칩 · 「서버에만 있음」 행.
- `.planning/phases/29-dma-multi-server-admin/reference/mockup-admin-user-create.html` — 「+ 사용자」 생성 시트(A 채택) · 역할 따라 DMA 섹션 펼침 · 첫 계좌 + 등록 서버.
- `.planning/phases/29-dma-multi-server-admin/reference/mockup-admin-servers.html` — `/admin/servers` 증권사 그룹 카드(A 채택) · 주문/시세 서버 라디오 · 상태 칩.

### relay 현재 구조 (바뀌는 곳)
- `relay/src/config.ts` — `EXTRA_OBSERVER_ENV` 표 · `dmaHost`/`dmaBroker` 단일 주 게이트웨이 · 안전 기본값 원칙(D-09 가 지켜야 할 것).
- `relay/src/index.ts` — 주 게이트웨이 파이프라인 + `extraJournals` 순회 · `GatewayIdentities` · healthz `journalGateways` · 종료 drain.
- `relay/src/journal/identities.ts` — 60초 통째 재적재 패턴(허용/역할 · 레지스트리 재적재의 선례).
- `relay/src/journal/observer.ts` · `relay/src/quote/feed.ts` — 관찰자 상태기계(role 1 선례 · rejected/role_mismatch 영구 정지 규칙) — admin role 2 연결의 출발점.
- `relay/src/dma/session-manager.ts` · `relay/src/dma/session.ts` — 사용자 세션(userId 키 · broker 단일 · 5분 유예) — (유저, 서버) 키로 바뀐다.
- `relay/src/store/credentials.ts` — `encryptDmaPassword`/`decryptDmaPassword`(AES-256-GCM, AAD = user_id) · `getDmaCredentials`.
- `scripts/deploy-relay.sh` — `DMA_HOST` · `DMA_KYOBO_HOST` · `DMA_OBSERVER_SECRET*` env 주입 · uptime 체크 생성 규칙(KYOBO 선례).

### DB 현재 구조
- `supabase/migrations/20260905120100_dma_credentials.sql` — `dma_credentials`(user_id PK · dma_user_id · dma_password_enc), service_role 전용 패턴.
- `supabase/migrations/20260929190000_dma_gateway_identities.sql` — (user_id, gateway) → dma_user_id 명시 연결 · 가시성 조인 의미.
- `supabase/migrations/20260924200000_dma_journal_tables.sql` · `20260924200100_dma_journal_rpcs.sql` · `20260929180000_dma_strategy_events.sql` — `gateway` 문자열 키를 가진 표 · RPC `p_gateway` — 키 개명 UPDATE 대상.
- `supabase/migrations/20260610130000_theme_admin_overrides.sql` — `theme_admins` 이메일 허용목록 + `is_theme_admin()` SECURITY DEFINER 패턴(허용/역할 RPC 선례 · D-02 흡수 대상).

### webapp 현재 구조
- `webapp/src/lib/supabase/middleware.ts` — 공개 whitelist 기본 차단(D-10) — D-01 역할 게이트가 들어가는 곳.
- `webapp/src/app/auth/callback/route.ts` — 「whitelist/role 체크 없음(D-04)」 주석 — D-01 이후 갱신.
- `webapp/src/components/layout/app-sidebar.tsx` — NAV 상수 · 「분석 › 상한가 보고서」 하위 항목 패턴 · 조건부 숨김.
- `webapp/src/components/trading/dma-gate.tsx` — 「매핑 없음에는 버튼이 없다 · 관리자 문의」 문구 — 이제 Admin 이 연결하므로 문구 재검토.
- `webapp/src/components/me/limit-chaser-defaults.tsx` — 즉시 저장 + 상태 칩 패턴(Phase 27 D-13) — D-15 선례.
- `server/src/services/dma-orders.ts` — Express→relay HTTP(`x-relay-secret`) 경로 · user_id→dma_user_id→dma_account_access 체인 — D-07 선례 · D-05 소비자.

### 운영 문서
- `infra/relay/README.md` §다중 게이트웨이 관찰자(1151) · §신원 연결 추가·제거(1212) · §DMA 서버 추가 절차(1535) · §관찰자 비밀(1110) — 수동 SQL 절차는 Admin 으로 대체되므로 갱신 대상.
- `.planning/phases/26-shared-quote-feed/26-CONTEXT.md` — quote 관찰자 결정(D-01 배지 2축 · D-02/D-16 503 · D-03 폴백 없음 · D-11/D-15 구독 상한 · D-17 비밀 폴백) — D-11 전환이 지켜야 할 것.
- `/Users/alex/.claude/projects/-Users-alex-repos-gh-radar/memory/project_kyobo127_relay_observer.md` — KYOBO 관찰자 운영 규칙(observer.toml 변경 시 relay 재시작 · 재접속 순서 · uptime check_id 한정).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GatewayIdentities`(`relay/src/journal/identities.ts`): 부팅 1회 + 60초 통째 재적재 — 허용/역할 표 · 서버 레지스트리 · 87 캐시 재적재의 틀.
- `QuoteFeed`(`relay/src/quote/feed.ts`): role 매개변수 관찰자 로그인 상태기계(disabled→connecting→logging_in→ready / rejected / role_mismatch) — role 2 admin 연결로 확장 가능.
- `encryptDmaPassword`/`decryptDmaPassword`: 그대로 재사용(AAD = 웹 user_id 유지).
- `server/src/services/dma-orders.ts` 의 relay HTTP 호출 + `x-relay-secret`: Admin 명령 라우트의 동형.
- `is_theme_admin()` SECURITY DEFINER + `REVOKE … FROM PUBLIC; GRANT … TO authenticated` 마이그레이션 패턴: 역할 RPC 선례.
- 호가주문 바텀시트(스케치 002) · `limit-chaser-defaults.tsx` 즉시 저장 칩 · `app-sidebar.tsx` 하위 항목: Admin 화면 구성 요소.

### Established Patterns
- 게이트웨이 키는 DB 전반 `gateway` 문자열(PK · RPC `p_gateway`) — 개명은 UPDATE 로 전 표 일괄.
- 로그 인자에 dmaUserId · password 금지(이전 phase 결정 D-19 — 이 phase 의 D-19 AAD 결정과 무관) · logger redact 에 비밀 env 추가.
- service_role 전용 표 = RLS 켜고 정책 0개 + `REVOKE anon, authenticated` 명시(메모리 `feedback_supabase_rpc_revoke`).
- 배포 순서 DB → relay → webapp, push 자체가 webapp 프로덕션 배포(백엔드 막히면 push 금지). 장중(08:00~20:00) VM · relay 재배포 금지.
- 관찰자 거부(79 success=false)면 재접속 루프 중단 + healthz 로 드러냄(Phase 19 D-13 · 26 D-16).

### Integration Points
- middleware 역할 게이트 → 승인 대기 페이지(새 라우트) · 사이드바 Admin 그룹 · `/admin/users` · `/admin/servers` · 「+ 사용자」 시트.
- Express `/api/admin/*`(이름 재량) → relay HTTP → 서버별 44/86 → 응답 배열; relay 87 → DB 서버별 표.
- relay `index.ts` 파이프라인을 레지스트리 순회로(저널 관찰자 · admin 연결 서버별, quote 는 주 서버 1, 사용자 세션은 증권사별 주문 서버).
- `scripts/deploy-relay.sh` env 에서 호스트 주입 제거(D-09) · uptime 체크를 레지스트리 키로.

</code_context>

<specifics>
## Specific Ideas

- Admin 화면 3장은 채택 목업이 정본이다 — 목업에 있는 요소만, 없는 요소(토스트 · 힌트 패널 · 시뮬 부속물)는 넣지 않는다(메모리 `feedback_ui_html_mockups_first`).
- 서버별 반영 칩 문구: 「반영됨」(ok) · 「미반영」(warn) · 「실패 · BUSY」(err, 서버 한국어 message 툴팁) · 「서버에만 있음」(흐린 점선).
- 주문 서버 바뀜 배지 문구 예: 「주문 서버가 KB121 로 바뀜 — 재접속하면 적용」.
- 시세 주 서버 라디오는 증권사 섹션을 가로질러 1개만 켜진다(초록 계열로 주문 서버 라디오와 구분).
- 승인 대기 차단 페이지는 모바일 우선 · 안내 한 줄 + 로그아웃 1개(세부는 플래너/UI 스펙 재량).

</specifics>

<deferred>
## Deferred Ideas

- Admin 감사 로그 화면(누가 언제 무엇을) — 이번엔 relay/Express 로그 1줄로 충분, 화면은 별도 phase.
- Admin 이 사용자 대신 전략 · 미체결을 정리하는 기능(BUSY 해소 도우미) — 서버가 강제 정리하지 않는 계약이라 범위 밖.
- 서버 추가 시 네트워크(라우트 · nft) 자동화 — 지금은 README 수동 절차 유지.

</deferred>

---

*Phase: 29-dma-multi-server-admin*
*Context gathered: 2026-10-06*
