# Phase 29: DMA 다중 서버 · 웹 Admin 유저 관리 — Research

**Researched:** 2026-10-06
**Domain:** relay 다중 게이트웨이(서버 레지스트리 · admin role 2 · (유저, 서버) 세션) + Supabase 허용/역할/DMA 의도 모델 + Next.js middleware 역할 게이트 + Express admin 라우트 + 빅뱅 배포
**Confidence:** MEDIUM (코드베이스 사실은 HIGH, 와이어 44/86/87 은 gh-trade 플랜 단계라 PENDING)

## Summary

이 phase 는 네 층을 동시에 바꾼다. **(1) DB** — 새 의도 표(허용 gmail·역할 / DMA 유저(비밀번호 암호문) / 계좌 / 계좌별 등록 서버 / 서버 레지스트리 / 서버별 87 스냅샷)를 additive 로 만들고, 기존 `gateway` 문자열 키 `KB`→`KB120` · `KYOBO`→`KYOBO119` 를 in-place UPDATE 한다(역개명 SQL 은 롤백용으로 같이 만든다). **(2) relay** — 지금은 `config.ts` 의 env(주 게이트웨이 1 + `EXTRA_OBSERVER_ENV` 표 1행)와 `SessionManager`(userId 키 · 단일 host/broker)가 고정이다. 이것을 DB 레지스트리 순회(서버별 저널 관찰자 + admin 연결 role 2, quote 는 주 서버 1)와 (유저, 서버) 세션으로 바꾸고, 내부 HTTP(8091)에 admin 명령 경로를 연다. **(3) webapp** — `middleware.ts` 에 역할 게이트, 승인 대기 화면, 사이드바 Admin 그룹, `/admin/users` · `/admin/servers`. **(4) server(Express)** — `/api/admin/*` + admin 역할 미들웨어 + relay HTTP 클라이언트(16-16 에서 지운 `relay-client.ts` 를 admin 용으로 되살리는 형태).

가장 큰 위험은 세 가지다. ① **`JournalAccess` 의 「users.toml 은 핫리로드가 없다」 전제가 깨진다** — 지금 가시성(`dma_account_access`)은 관찰자 로그인(79) 때만 갱신되므로, 87 을 받으면 그 서버의 `JournalAccess.replace` 도 같이 불러야 새 계좌 주문이 웹에 보인다. ② **(유저, 서버) 세션은 교보 웹 주문을 처음 여는 일이다** — hub 의 사용자 캐시(계좌·상따·VI·84·83)가 전부 `userId` 1세션 전제라 다중 세션 병합 규칙(특히 VI · 사용자 설정 84 가 증권사별로 둘이 되는 문제)이 미결이다. ③ **D-01 게이트가 시드 없이 배포되면 전원이 잠긴다** — 기존 사용자 · e2e 테스트 사용자 · `theme_admins`(현재 `ezmesya@gmail.com`)를 허용 표에 넣는 시드 결정이 필요하다.

착수 게이트: 2026-10-06 현재 gh-trade `StockDMA.fbs` 에 44/86/87 은 **없다**(gh-trade master 와 phase-29 worktree 모두 `AdminCommandReq` 0건 확인). gh-trade 29-01 플랜이 그 와이어를 확정 · 인계(인박스 노트 + `sync-relay-schema.sh --check`)할 예정이다. DB · webapp · Express · relay 의 레지스트리/세션 구조 변경은 게이트와 무관하게 먼저 진행할 수 있고, 44/86/87 코덱 · admin 명령 · 87 적재만 게이트 뒤다.

**Primary recommendation:** 웨이브를 「게이트 무관(DB 의도 모델 · 허용/역할 게이트 · Admin UI 골격 · Express 라우트 · relay 레지스트리 적재와 안전 기본값)」 → 「게이트 뒤(생성물 동기화 · role 2 admin 연결 · 44/86/87 · 87→DB/JournalAccess)」 → 「(유저, 서버) 세션 · 주문 서버 · 시세 주 서버 전환」 → 「빅뱅 배포 런북」 으로 나누고, 키 개명 UPDATE 는 additive 마이그레이션과 **분리된 별도 마이그레이션**으로 두어 「옛 relay 정지 → 개명 → 새 relay 기동」 창에서만 적용한다.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Claude's Discretion
- 새 DB 표 이름 · 열 · RPC 형태(service_role 전용 + `REVOKE anon, authenticated` 명시 · 공개 읽기 RPC 는 `is_admin()` 게이트) · 87 적재 표 구조(서버별 users_rev 포함) · 기존 dma_credentials / dma_gateway_identities 파생 방식(뷰 vs 동기화) · 마이그레이션 순서.
- 허용/역할 표와 `theme_admins` 통합 형태 · `is_theme_admin()` 재정의 · 승인 대기 차단 페이지의 문구 · 레이아웃(모바일 우선, 로그아웃 버튼 1개 + 안내 한 줄 권고).
- relay: 레지스트리 재적재 방식(주기 vs HTTP 통보) · 서버별 admin 연결 상태기계(`quote/feed.ts` role 매개변수화 vs 파생) · 44 request_id 상관 · 타임아웃 값 · (유저, 서버) 세션 키 설계와 hub 세션 교체 규칙 · 주문 경로(`/api/dma/*`)가 증권사별 주문 서버를 고르는 지점 · 「주문 서버 바뀜」 상태 프레임 이름 · healthz 본문 확장(`journalGateways` 를 레지스트리 키로 · admin 연결 축 · quote 전환 중 상태) 과 503 축(KB120 사용자 세션 · quote 는 그대로, 추가 서버는 본문만 — Phase 26 D-16 · quick-260929-c8e 선례) · 레지스트리 안전 기본값 게이트의 구체 형태(D-09).
- Express: admin 라우트 경로 · 역할 검증 미들웨어 · relay HTTP 계약(요청/응답 JSON) · 감사 로그(누가 무엇을 언제 — 최소 relay 로그 1줄, DB 감사표는 선택).
- 테스트: fake gateway 에 role 2 로그인 · 44/86/87 시나리오 · 다중 서버 fan-out 부분 실패 · 키 개명 마이그레이션 회귀 · middleware 역할 게이트 · Admin 컴포넌트(시트 즉시 저장 · 결과 칩) · e2e 1~2 시나리오.
- KB121 · KYOBO127 처럼 아직 접속 불가한 서버의 초기 상태(enabled=false 시드 권고) · 관찰자 정원 배분(서버당 journal 1 + admin 1, quote 는 주 서버 1 — 합 ≤ 6).

### Deferred Ideas (OUT OF SCOPE)
- Admin 감사 로그 화면(누가 언제 무엇을) — 이번엔 relay/Express 로그 1줄로 충분, 화면은 별도 phase.
- Admin 이 사용자 대신 전략 · 미체결을 정리하는 기능(BUSY 해소 도우미) — 서버가 강제 정리하지 않는 계약이라 범위 밖.
- 서버 추가 시 네트워크(라우트 · nft) 자동화 — 지금은 README 수동 절차 유지.
</user_constraints>

<phase_requirements>
## Phase Requirements

ROADMAP 은 이 phase 에 요구사항 ID 를 두지 않았다(`Requirements: TBD`). 아래는 ROADMAP Goal 과 D-01..D-17 에서 **파생한 제안 ID**다(gh-trade 의 `ADM-01~08` 과 겹치지 않게 `ADMIN-` 접두). 플래너가 REQUIREMENTS.md 에 등재할지 결정한다.

| ID | Description | Research Support |
|----|-------------|------------------|
| ADMIN-01 | 서버 레지스트리 `dma_servers`(4대 시드 · enabled · 증권사별 주문 서버 · 시세 주 서버) + 기존 `KB`/`KYOBO` 키 in-place 개명 + 역개명 롤백 SQL | §데이터 모델 ①⑦ · §키 개명 · Pitfall 1·2·3 |
| ADMIN-02 | 허용 gmail · 역할(admin/trader/viewer) 표 + middleware 전면 게이트 + 승인 대기 화면 + `is_theme_admin()` 흡수 | §데이터 모델 ② · §webapp 게이트 · Pitfall 6·7 |
| ADMIN-03 | DMA 유저 · 계좌 · 등록 서버 의도 표 + 비밀번호 암호문(DMA 유저당 1개) + 가시성 뷰 파생(`dma_visibility_identities` 재정의) | §데이터 모델 ③④⑤⑥ · Pitfall 5 |
| ADMIN-04 | relay 레지스트리 순회 — 서버별 저널 관찰자 + admin 연결(role 2) · quote 주 서버 1 · D-09 안전 기본값 게이트 · 재적재 | §relay 변경 지도 · Pattern 1·2 |
| ADMIN-05 | admin 명령 경로 — Express → relay HTTP → 서버별 44 fan-out → 86 결과 배열 · 87 서버별 적재 + 그 서버 `JournalAccess` 갱신 | Pattern 3·4 · Pitfall 4 |
| ADMIN-06 | (유저, 서버) 사용자 세션 · 증권사별 주문 서버 선택 · 「주문 서버 바뀜」 프레임 · 87 뒤 계좌 자가 선언(3 mode 1) · 비밀번호 변경 시 세션 내 비밀 교체 | Pattern 5 · Pitfall 8·9·10 · Open Q1 |
| ADMIN-07 | 시세 주 서버 즉시 전환 break-then-make · 실패 시 복귀 · 상태 배지 | Pattern 6 |
| ADMIN-08 | Express `/api/admin/*` + `requireAdmin` + relay admin 클라이언트(사설 대역 가드 · `x-relay-secret`) + Cloud Run env/IAM 복원 | §Express · Runtime State Inventory |
| ADMIN-09 | `/admin/users` — 목록 · 승인 대기 · 서버별 반영 칩 · 「서버에만 있음」 · 편집 시트(필드별 즉시 저장) · 생성 시트 | §webapp Admin 화면 |
| ADMIN-10 | `/admin/servers` — 증권사 그룹 카드 · 사용 토글 · 주문/시세 라디오 · 상태 칩 · 편집 시트 + 사이드바 Admin 그룹 | §webapp Admin 화면 |
| ADMIN-11 | 역할 강등 · 허용 해제 즉시 반영 — relay 허용/역할 재적재 · wss 종료 · DMA 세션 유예 종료 | Pattern 7 |
| ADMIN-12 | 빅뱅 배포 · 롤백 런북 — deploy-relay env 정리 · uptime 체크 재키잉 · README 갱신 · gh-trade 서버 선배포 확인 | §배포 · 롤백 · Runtime State Inventory |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

| 출처 | 지시 | 이 phase 에 미치는 영향 |
|------|------|-------------------------|
| 루트 CLAUDE.md §gh-trade 인박스 | 세션 시작 때 `docs/inbox/from-gh-trade/` 의 `status: open` 노트부터 읽고, 처리하면 `status: done` + `done_commit` 을 채워 **경로 지정** 커밋 | 착수 게이트 태스크의 형식. 현재 open 노트 0건(아래 §착수 게이트) |
| 루트 CLAUDE.md §Constraints | 프론트 Vercel · 백엔드 Cloud Run · 무료 API 우선 | uptime 체크 수를 늘릴 때 무료 한도(아래 Pitfall 3) |
| 루트 CLAUDE.md §Conventions | 상따 화면 반응형은 본문 폭 컨테이너 쿼리(정본 `globals.css` §2.2b) · 앱 셸·사이드바는 뷰포트 브레이크포인트 | Admin 화면(시트 440px 우측 패널 / 폰 바텀시트)은 앱 셸 레벨이라 뷰포트 기준으로 충분 — 표를 복사하지 말 것 |
| 루트 CLAUDE.md §GSD Workflow | 파일 변경은 GSD 명령 안에서 | — |
| 사용자 전역 CLAUDE.md | 커밋 메시지 한글 · 커밋 전 사용자 확인 · Co-Authored-By 금지 | 이 리서치는 커밋하지 않았다(오케스트레이터/사용자 몫) |
| 메모리 `feedback_supabase_rpc_revoke` | RPC 는 `REVOKE … FROM anon, authenticated` 명시(플랫폼 auto-grant) | 새 RPC 전부 |
| 메모리 `feedback_supabase_rls_authenticated` | 공개 표 정책은 `TO anon, authenticated` 둘 다 | 새 표는 공개 표가 아니므로 정책 0개(service_role 전용) |
| 메모리 `feedback_deploy_relay_before_push` · `feedback_subagent_deploy_classifier` | push = webapp 프로덕션 배포 · executor 는 커밋까지만, 배포는 메인 세션 | 빅뱅 배포 태스크는 checkpoint(사용자/메인 세션) |
| 메모리 `project_market_hours_0800_2000` | VM · relay 재배포는 20:00 KST 이후 | 배포 창 |
| 메모리 `feedback_concurrent_session_commit_race` · 인박스 README | `git add -A` 금지 · 커밋 직전 `git status -sb` | 생성물 커밋 태스크 |
| 메모리 `feedback_no_security_review` · config `security_enforcement: false` | 보안 절 생략 | 이 문서에 Security Domain 절을 두지 않는다 |
| 메모리 `feedback_ui_html_mockups_first` | 목업에 없는 요소(토스트 · 힌트 패널) 금지 | Admin 화면은 채택 목업 3장이 정본 |
| 메모리 `feedback_silent_failure_max_tokens` | fail-safe catch 는 사유 로깅 | admin 명령 실패 · 87 적재 실패 로그 |
| 메모리 `reference_gh_trade_protocol_sync` | `sync-relay-schema.sh` 는 gh-trade 소유 · `RELAY=` 지정 · flatc 25.12.19 · 수기 사본 3곳 | 착수 게이트 태스크 |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 허용 gmail · 역할 판정(페이지) | Frontend Server (Next middleware) | Database (SECURITY DEFINER RPC) | D-01 「판정은 middleware 1곳」. 원천은 DB 표 · 매 요청 RPC 1회(D-04 즉시성) |
| Admin 화면(목록 · 시트 · 카드) | Browser / Client | Frontend Server(라우트 보호) | wss 없이 REST 로 동작(D-07) |
| Admin 권한 강제 · 의도 저장(허용/역할) | API / Backend (Express) | Database | Express 가 `requireAuth` + admin 역할 DB 확인. 브라우저가 PostgREST 로 직접 쓰지 않는다 |
| DMA 비밀번호 암호화 · 44 fan-out · 87 적재 | relay (VM) | Database | `DMA_CRED_KEY` 는 relay 에만 있다(Phase 15 D-19). 게이트웨이 소켓도 relay 만 |
| 서버 레지스트리 · 주문/시세 서버 지정 | Database (`dma_servers`) | relay(적재 · 전환 실행) | D-09 전부 DB. 시세 전환은 relay 가 실행 성공 뒤 DB 반영 |
| 사용자 DMA 세션 · 주문 라우팅 | relay | — | (유저, 서버) 세션 · 계좌→세션 선택 |
| 주문 가시성(REST 오늘 주문 · 주문로그) | Database (뷰 · RPC) | API (Express 조회) | `dma_visible_accounts` 한 곳 — 뷰 재정의로 서버 키 전개 |
| 승인 대기 화면 | Frontend Server (리다이렉트) + Browser | — | 미허용 로그인 사용자 전용 라우트 |

## Standard Stack

이 phase 는 **새 외부 패키지를 설치하지 않는다**. 전부 기존 스택이다.

### Core (기존 — 버전은 package.json 실측)
| Library | Version | Purpose | 근거 |
|---------|---------|---------|------|
| flatbuffers (npm) | ^25.9.23 | relay 와이어 코덱 — 생성물은 flatc 25.12.19 고정 | [VERIFIED: relay/package.json] · [VERIFIED: `flatc --version` → `flatc version 25.12.19`] |
| express | ^5.2.1 (relay) | relay 내부 HTTP(8091) — admin 라우트 추가 | [VERIFIED: relay/package.json] |
| zod | ^4.0.0 (relay) | admin HTTP 바디 검증 | [VERIFIED: relay/package.json] |
| @supabase/supabase-js | 2.103.x | relay/server/webapp DB 접근 | [VERIFIED: relay/package.json · webapp/package.json `"2.103.2"`] |
| @supabase/ssr | 0.10.2 | middleware 세션 + 역할 RPC | [VERIFIED: webapp/package.json] |
| axios · supertest · vitest | 기존 | server relay 클라이언트(옛 `relay-client.ts` 가 axios) · 라우트 테스트 | [VERIFIED: server/package.json `supertest ^7.2.2`, `vitest ^4.1.4`] |
| pgTAP (로컬 컨테이너) | `public.ecr.aws/supabase/postgres:17.6.1.104` | 마이그레이션 회귀 | [VERIFIED: scripts/verify-dma-orders-price-check.sh:29 · 로컬 이미지 존재 확인] |

**Installation:** 없음.

## Package Legitimacy Audit

이 phase 는 외부 패키지를 설치하지 않는다 — 감사 대상 0건.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## 착수 게이트 — gh-trade 계약 상태 (CONFIRMED / PENDING 분리)

### CONFIRMED (이번 세션에 파일로 확인)
- 현재 gh-trade master 의 `ObserverLoginReq` 는 `role: ubyte;` 슬롯 14 · 주석 「0 = journal … 1 = quote … 그 밖 값은 거부 (vtable 슬롯 14)」, `ObserverLoginResp` 는 `role: ubyte;` 슬롯 26 · `broker: string; // "KB"/"KYOBO" (mock 은 "MOCK") — gh-radar p_gateway 원천 (D-04)` 이다. [VERIFIED: /Users/alex/repos/gh-trade/server/src/protocol/StockDMA.fbs:1208-1260]
- 44/86/87 은 **아직 없다** — gh-trade master 와 `phase-29-admin-users` worktree(HEAD `20a0224d`) 둘 다 `grep -c AdminCommandReq` = 0. [VERIFIED: grep 이번 세션]
- gh-radar relay 생성물 SYNC MARKER `server-repo-commit: ea8d9171` · flatc 25.12.19 이고, `ea8d9171` 은 gh-trade phase-29 HEAD 의 조상이다(29-01 이 요구하는 「생성 기준 조상 확인」 이 지금은 통과). [VERIFIED: relay/src/generated/StockDMA.fbs:1-7 · `git merge-base --is-ancestor`]
- 인박스: `docs/inbox/from-gh-trade/` 에 Phase 29 노트 없음(기존 7건은 다른 주제). 노트 형식 · 처리 절차는 README 정본(`status` · `from_commit` · `fbs_sync_marker` · `done_commit`, 경로 지정 커밋). [VERIFIED: docs/inbox/from-gh-trade/README.md]
- `sync-relay-schema.sh` 는 gh-trade 소유, 산출 경로 `$RELAY/src/generated`(= `relay/src/generated/StockDMA.fbs` 마커 7줄 + `stock-dma/*.ts` + `stock-dma.ts` 색인), `--check` 는 무변경 대조, `RELAY=` 미지정 시 형제 repo 메인 체크아웃에 쓴다. [VERIFIED: /Users/alex/repos/gh-trade/server/scripts/sync-relay-schema.sh:1-60]

### CITED (gh-trade 29 CONTEXT · 29-01 플랜 — 확정 결정이지만 fbs 커밋 전)
gh-trade `29-CONTEXT.md` D-04 블록(번호 · 필드 확정, Envelope 말미 append): [CITED: /Users/alex/repos/gh-trade/.claude/worktrees/phase-29-admin-users/.planning/phases/29-admin-users-toml-gh-radar/29-CONTEXT.md D-04]
```
table AdminAccount { account_no:string; name:string; branch_no:string; trader_id:string; priority:int; }
table AdminCommandReq { request_id:ulong; op:ubyte; user_id:string; password:string; account:AdminAccount; }
table AdminCommandResp { request_id:ulong; ok:bool; code:ushort; message:string; users_rev:ulong; }
table AdminUser { user_id:string; accounts:[AdminAccount]; }
table AdminUsersSnapshot { users_rev:ulong; users:[AdminUser]; }
```
- MsgType 44 `AdminCommandReq`(C→S) · 86 `AdminCommandResp` · 87 `AdminUsersSnapshot`(S→C), Envelope 슬롯 `admin_command_req`(92) · `admin_command_resp`(94) · `admin_users_snapshot`(96) — 29-01 플랜 기대값. [CITED: gh-trade 29-01-PLAN.md must_haves]
- code 표 0 OK · 1 BAD_OP · 2 BAD_USER_ID(빈/8B 초과) · 3 BAD_PASSWORD · 4 NO_SUCH_USER · 5 BAD_ACCOUNT_NO · 6 BAD_BRANCH_TRADER · 7 ACCOUNT_CONFLICT · 8 NO_SUCH_ACCOUNT · 9 BUSY · 10 PERSIST_FAILED · 11 NOT_ADMIN · 12 LAST_ACCOUNT. [CITED: gh-trade 29-CONTEXT D-05]
- `users_rev` 기동 1 · 변경마다 +1 · **재기동 시 1 로 복귀**(relay 는 접속마다 op5 로 전체 대조). 실제 변경이 있을 때만 86 뒤 87 1회, op5 는 87 만. [CITED: gh-trade 29-CONTEXT D-06]
- 멱등: op1 기존 유저 + 빈 password → 0 · rev 불변. op4 없는 계좌 → **8**(멱등 삭제 아님 — 「gh-radar 는 87 로 확인한 계좌만 지운다」). [CITED: gh-trade 29-CONTEXT D-09]
- admin 연결은 Session 에 붙지 않고 게이트에서 **4(LivePing)·44 만** 받는다(80 저널 · 76/78 시세 드롭). 79 응답은 `role=2` · 빈 accounts · 빈 epoch. 사용자 세션 연결이 보낸 44 는 86 code 11. [CITED: gh-trade 29-CONTEXT D-02 · 29-01 표]
- `kMaxObservers` 4→6, admin 동시 연결 수 제한 없음(정원 안), 유휴 스윕 90초 대상. [CITED: gh-trade 29-CONTEXT D-03]
- 54 INFO 문구: 계좌 추가/제거 「관리자가 계좌 N 추가/제거 — 재로그인하면 목록에 반영」, DeleteUser 「관리자가 사용자를 삭제 — 연결 종료」 뒤 연결 종료. [CITED: gh-trade 29-CONTEXT D-14 · D-15]
- **gh-trade 이번 phase 배포 범위는 KB120 · KYOBO119 두 대뿐**이다. KB121 · KYOBO127 은 「정비 때 같은 버전(페이즈 밖)」. [CITED: gh-trade 29-CONTEXT D-21] → KB121 · KYOBO127 은 role 2 를 모르는 바이너리일 수 있으므로 `enabled=false` 시드가 맞다.

### PENDING (게이트가 닫히는 조건)
1. gh-trade 29-01 커밋 ⓐ(fbs + 생성물 + expected-vtable) → `radar-handoff.sh admin-users-role2-44-86-87` 인박스 노트 도착.
2. 노트의 `fbs_sync_marker` 가 gh-trade phase-29 HEAD 의 조상인지 확인 → gh-trade worktree 경로에서 `RELAY=/Users/alex/repos/gh-radar/relay server/scripts/sync-relay-schema.sh` 실행(gh-trade 문서상 본 실행은 **gh-radar 세션 몫**).
3. 생성물(`relay/src/generated/StockDMA.fbs` · `stock-dma/admin-*.ts` 5개 · `msg-type.ts` · `envelope.ts` · `stock-dma.ts`) + 수기 사본 3곳(아래) 갱신을 경로 지정 커밋 → 노트 `status: done` + `done_commit`.
   - 새 생성물 파일 이름 `admin-account.ts` · `admin-command-req.ts` · `admin-command-resp.ts` · `admin-user.ts` · `admin-users-snapshot.ts` 는 기존 명명(`observer-login-req.ts` 등)에서 추정한 것이다 [ASSUMED] — 실제는 sync 출력이 정한다.

**수기 사본 3곳**(메모리 기재와 실제 경로가 하나 다르다): `relay/src/dma/msg-type.ts`(`MSG` 상수 · `INBOUND_MSG_TYPES` 화이트리스트 — 86 · 87 추가, 44 는 C→S 라 MSG 상수에만) · `relay/src/dma/envelope.ts`(`buildObserverLoginReq` 의 role 가드 `if (role !== 0 && role !== 1)` 를 2 까지 · 44 조립기 · 86/87 파서) · **`relay/src/hub/subscription-hub.ts`**(메모리는 `dma/subscription-hub.ts` 로 적었지만 실제 경로는 `hub/` — 사용자 세션 · quote 연결로 86/87 이 오면 명시 warn case). [VERIFIED: relay/src/dma/envelope.ts:3108-3110 · relay/src/dma/msg-type.ts:259 · `ls relay/src/hub`]

## Architecture Patterns

### System Architecture Diagram

```
 브라우저(admin)                          브라우저(trader)
   │ /admin/users · /admin/servers           │ wss(8090) {t:"auth"}
   ▼                                         ▼
 Next middleware ──RPC my_app_access()──▶ Supabase ◀──────────────┐
   │ (role=admin 만 /admin/*,                   ▲  ▲               │
   │  미허용=승인 대기)                          │  │               │
   ▼                                            │  │               │
 Express /api/admin/* ── requireAuth+requireAdmin┘  │               │
   │  (허용/역할 쓰기는 직접 RPC)                    │               │
   │  DMA 계열은 POST http://<VM>:8091/internal/admin/*  (x-relay-secret)
   ▼                                               │               │
 relay 내부 HTTP(8091) ──암호화·의도 저장 RPC───────┘               │
   │                                                               │
   ├─ AdminFanout ── 서버별 admin 연결(role 2) ──44──▶ KB120 ┐       │
   │      ▲  86(결과) / 87(스냅샷)               ──44──▶ KYOBO119│ (enabled 서버만)
   │      └─ 87 → dma_server_* 표 적재 + 그 서버 JournalAccess.replace ─┘
   │
   ├─ RegistryLoader(부팅 + 60s + /internal/admin/registry/reload) ─ dma_servers
   │      └─ 서버별 파이프라인 생성/정지: JournalObserver(role 0) · AdminConn(role 2)
   ├─ QuoteSwitch(stable feed) ─ quote 주 서버 1개(role 1) · break-then-make
   ├─ AccessLoader(60s) ─ app_users/역할 → wss 강제 종료 · DMA 세션 유예 종료
   └─ SessionManager((userId, serverKey)) ─ 증권사별 주문 서버 · 계좌→세션 라우팅
          └─ 87 에 새 계좌 → 그 세션 UpdateAccountNoReq(mode 1) 자가 선언
```

### relay 변경 지도 (현재 → 목표, 파일:줄 근거)

| 모듈 | 현재 (VERIFIED) | 목표 (RECOMMENDATION) |
|------|------------------|------------------------|
| `relay/src/config.ts` | 주 게이트웨이 = env 4개, `const dmaHost = optional("DMA_HOST") ?? "127.0.0.1";` · `const dmaBroker = optional("DMA_BROKER") ?? "KB";` (145-147). 추가 관찰자 표 `EXTRA_OBSERVER_ENV` 1행 `{ gateway: "KYOBO", hostEnv: "DMA_KYOBO_HOST", portEnv: "DMA_KYOBO_PORT", secretEnv: "DMA_OBSERVER_SECRET_KYOBO" },` (52-54). production 에서 `DMA_OBSERVER_SECRET` 없으면 throw (131-134) | 레지스트리 원천 선택 env(예 `DMA_REGISTRY_SOURCE` = `env`(기본) \| `db`) — `db` 는 `nodeEnv === "production"` 일 때만 허용(아니면 throw). `env` 모드는 오늘의 `DMA_HOST`(기본 127.0.0.1) 단일 서버를 합성 레지스트리 1행으로 만든다(로컬 · e2e · 테스트). 비밀은 **증권사별**: `KB` → `DMA_OBSERVER_SECRET`, `KYOBO` → `DMA_OBSERVER_SECRET_KYOBO`(Pitfall 11) |
| `relay/src/index.ts` | `const [primaryUpstream, ...extraUpstreams] = config.journalUpstreams;` (149) · 파이프라인 정적 배열 · `SessionManager({ host: config.dmaHost, …, broker: config.dmaBroker })` (165-170) · `QuoteFeed({ host: config.dmaHost … })` (201-206) · healthz `journalGateways: extraJournals.map(…)` (287-290) · 종료 drain (352-413) | 결선을 `ServerRegistry`(부팅 적재 후 시작) 순회로. 파이프라인 맵 `Map<serverKey, {journal, admin}>` 을 레지스트리 diff 로 올리고 내림. 종료 절차에 admin 연결 stop 추가 |
| `relay/src/journal/identities.ts` | `IDENTITY_REFRESH_MS = 60_000` (31) · 뷰 `dma_visibility_identities` 를 `.in("gateway", [...this.#gateways])` 로 읽음 (99-102) · 실패 시 직전 맵 유지 · 첫 성공 전 fail closed | 재적재 틀을 레지스트리 · 허용/역할 적재기에 복제(통째 교체 · 겹침 금지 · 실패 시 직전 유지). 신원은 뷰 재정의 후 **전 서버 키**를 gateways 로 |
| `relay/src/journal/observer.ts` | `gateway` 는 deps(로그 · 커서 키) · 거부 = 영구 정지(D-13) · `OBSERVER_CLIENT_NAME = "gh-radar-relay"` (76) | 변경 최소 — 서버 키를 gateway 로 받는다. 79 `broker` 가 레지스트리 broker 와 다르면 설정 오류로 halt(권고) |
| `relay/src/quote/feed.ts` | `QUOTE_CLIENT_NAME = "gh-radar-relay/quote"` (67) · `QUOTE_ROLE = 1` (70) · 상태 `"disabled" \| "connecting" \| "logging_in" \| "ready" \| "rejected" \| "role_mismatch"` (81) · host/port 고정 생성자 · 거부 5분×12 재시도 | admin 연결은 이 상태기계를 **파생 복사**(`AdminConn`, role 2) — 저널 관찰자에 role 분기를 넣지 않은 Phase 26 Pattern 2 선례. quote 는 안정 래퍼(`QuoteSwitch`)가 내부 `QuoteFeed` 를 교체 |
| `relay/src/dma/session-manager.ts` | `#sessions = new Map<string, Entry>()` 키 = userId (166) · 단일 `#host/#port/#broker` · `acquire(userId, creds)` (187) · `get(userId)` (268) · `SESSION_GRACE_MS = 300_000` (34) · `NO_RETRY_STATES = new Set(["session_rejected", "unauthorized"])` (157) | 키 `${userId}\|${serverKey}` · `acquireForUser(userId, creds, servers[])` · `sessionsOf(userId)` · `forAccount(userId, accountNo)` · `updatePassword(dmaUserId, pw)` · `closeForDmaUser(dmaUserId)` |
| `relay/src/dma/session.ts` | 재접속마다 `buildLoginReq(this.#dmaUserId, this.#password, this.#broker)` (305) · `UpdateAccountNoResp` 는 `declaring` 상태 밖이면 무시 (413-416) | 비밀 교체 메서드 · Ready 중 계좌 추가 선언(mode "1") 경로 · 87 기반 허용 계좌 축소 반영 |
| `relay/src/hub/subscription-hub.ts` | `HubSession.userId` (299) 가 모든 사용자 캐시 키 · `attach(session)` 은 같은 userId 의 다른 세션을 **교체**로 보고 캐시를 지운다 (832-848) | 다중 세션이면 교체 규칙이 깨진다 → 세션 소유 키(`ownerKey = userId\|serverKey`)로 캐시 · 팬아웃은 userId. Open Q1 |
| `relay/src/ws/fanout.ts` | wss 인증 → `getDmaCredentials` (1906-1907) → 행 없으면 `unauthorized` · `acquire` 1회 | 인증 = 역할(admin/trader) + DMA 연결 확인 → 증권사별 주문 서버 세션 acquire. `revokeUser(userId)` 추가(D-04) |
| `relay/src/ws/order-handler.ts` | `const session = deps.sessions.get(userId);` (422) → `allowedAccounts` 대조 (432) | `sessions.forAccount(userId, msg.accountNo)` — 계좌가 들어 있는 세션으로 라우팅(증권사 판정이 자연히 됨) |
| `relay/src/order/order-api.ts` | 8091 = `/healthz` + 비밀 관문뿐 (`app.use(express.json({ limit: "16kb" }));` · `app.use(relaySecretGuard(deps.relayOrderSecret));` 226-227) · `isGatewayLinkUp(deps.dmaHost, …)` (334) | `/internal/admin/*` 라우터 추가(관문 뒤). healthz 의 `dmaHost` 는 KB 주문 서버 host 로. 본문 `journalGateways` 를 레지스트리 키로 · `adminConns` 축 · quote 전환 상태 |
| `relay/src/store/credentials.ts` | `encryptDmaPassword(plain, userId, keyB64)` AAD = `cipher.setAAD(Buffer.from(userId, "utf8"));` (77-85) · `getDmaCredentials` 는 `dma_credentials` 를 `user_id` 로 조회 (120-148) | 함수 재사용 · AAD 인자를 DMA 유저 키로(Pitfall 5) · 조회 원천을 새 표(RPC 1회)로 |

### Recommended Project Structure (신규 파일 제안)

```
relay/src/
├── registry/registry.ts        # dma_servers 적재(부팅·60s·reload) + env 합성 모드(D-09)
├── admin/admin-conn.ts         # 서버별 role 2 연결 상태기계(quote/feed.ts 파생)
├── admin/admin-fanout.ts       # 44 송신 · request_id 상관 · 86 수집 · 서버별 결과 배열
├── admin/snapshot-sink.ts      # 87 → DB(dma_server_users*) + JournalAccess.replace
├── admin/admin-api.ts          # /internal/admin/* 라우터(zod)
├── access/app-access.ts        # 허용/역할 60s 재적재 → fanout.revokeUser
└── quote/quote-switch.ts       # 안정 HubQuoteFeed 래퍼 · break-then-make
server/src/
├── middleware/require-admin.ts
├── routes/admin.ts             # /api/admin/*
└── services/relay-admin-client.ts  # 옛 relay-client.ts 의 사설 대역 가드 재사용
webapp/src/
├── app/pending/page.tsx        # 승인 대기
├── app/admin/users/page.tsx
├── app/admin/servers/page.tsx
├── components/admin/*          # 목록 · 시트 · 칩 · 카드
└── lib/admin-api.ts
supabase/migrations/
├── 2026100xxxxx00_admin_access_registry.sql   # additive(게이트 무관 · 언제든)
├── 2026100xxxxx01_dma_visibility_v2.sql       # 뷰 재정의(새 relay 와 같이 — 배포 창)
└── 2026100xxxxx02_gateway_key_rename.sql      # 키 개명(배포 창 · 옛 relay 정지 뒤)
supabase/rollback/29-gateway-key-rename-revert.sql  # 역개명 + 옛 뷰 복원(적용하지 않는 수동 SQL)
supabase/tests/admin_access_registry.test.sql · gateway_key_rename.test.sql
```

### 데이터 모델 제안 (RECOMMENDATION — 이름 · 열은 플래너 재량)

모두 RLS 활성 + 정책 0개 + `REVOKE ALL … FROM PUBLIC` + `REVOKE ALL … FROM anon, authenticated` + `GRANT … TO service_role`(기존 `dma_journal_tables.sql` 잠금 4줄과 같은 형태). [VERIFIED: supabase/migrations/20260924200000_dma_journal_tables.sql:171-189 잠금 블록]

```sql
-- ① 서버 레지스트리 (D-09)
CREATE TABLE public.dma_servers (
  key              text PRIMARY KEY CHECK (key ~ '^(KB|KYOBO)[0-9]{1,3}$'),
  broker           text NOT NULL CHECK (broker IN ('KB','KYOBO')),
  host             text NOT NULL CHECK (host <> ''),
  port             integer NOT NULL DEFAULT 9100 CHECK (port BETWEEN 1 AND 65535),
  enabled          boolean NOT NULL DEFAULT false,
  is_order_server  boolean NOT NULL DEFAULT false,   -- 증권사 안에서 1대
  is_quote_primary boolean NOT NULL DEFAULT false,   -- 전체 1대
  sort_order       integer NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (left(key, length(broker)) = broker),
  CHECK (NOT is_order_server  OR enabled),
  CHECK (NOT is_quote_primary OR enabled)
);
CREATE UNIQUE INDEX uq_dma_servers_order ON public.dma_servers (broker) WHERE is_order_server;
CREATE UNIQUE INDEX uq_dma_servers_quote ON public.dma_servers ((true)) WHERE is_quote_primary;
-- 시드: KB120(enabled · order · quote) · KYOBO119(enabled · order) · KB121/KYOBO127(enabled=false).

-- ② 허용 gmail · 역할 (D-01~D-03) — 키는 이메일(소문자)
CREATE TABLE public.app_users (
  email       text PRIMARY KEY CHECK (email = lower(btrim(email)) AND email <> ''),
  role        text NOT NULL CHECK (role IN ('admin','trader','viewer')),
  dma_user_id text REFERENCES public.dma_users(dma_user_id) ON DELETE SET NULL,  -- 웹유저당 0~1
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ③ DMA 유저 (비밀번호 암호문 1개 — D-06)
CREATE TABLE public.dma_users (
  dma_user_id     text PRIMARY KEY CHECK (dma_user_id <> '' AND octet_length(dma_user_id) <= 8),
  password_enc    text NOT NULL,          -- base64(nonce‖tag‖ct), AAD 는 Pitfall 5
  password_set_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ④ 계좌 의도 (증권사, 계좌번호) — 서버 정규화값으로 저장
CREATE TABLE public.dma_user_accounts (
  dma_user_id text NOT NULL REFERENCES public.dma_users ON DELETE CASCADE,
  broker      text NOT NULL CHECK (broker IN ('KB','KYOBO')),
  account_no  text NOT NULL CHECK (account_no <> '' AND length(account_no) <= 12),
  name        text NOT NULL DEFAULT '',
  branch_no   text NOT NULL DEFAULT '',
  trader_id   text NOT NULL DEFAULT '',
  priority    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (dma_user_id, broker, account_no),
  CHECK (broker <> 'KB'    OR (length(branch_no) = 5 AND length(trader_id) = 6)),
  CHECK (broker <> 'KYOBO' OR (branch_no = '' AND trader_id = ''))
);

-- ⑤ 계좌별 등록 서버 의도
CREATE TABLE public.dma_account_servers (
  dma_user_id text NOT NULL,
  broker      text NOT NULL,
  account_no  text NOT NULL,
  server_key  text NOT NULL REFERENCES public.dma_servers(key) ON UPDATE CASCADE,
  PRIMARY KEY (dma_user_id, broker, account_no, server_key),
  FOREIGN KEY (dma_user_id, broker, account_no) REFERENCES public.dma_user_accounts ON DELETE CASCADE
);  -- 서버 broker 일치는 트리거 또는 RPC 검증

-- ⑥ 서버별 87 반영 상태 (D-05)
CREATE TABLE public.dma_server_snapshots (
  server_key  text PRIMARY KEY,
  users_rev   bigint NOT NULL,              -- 재기동 시 1 로 돌아간다 — 비교 키로 쓰지 않는다
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.dma_server_user_accounts (
  server_key  text NOT NULL,
  dma_user_id text NOT NULL,
  account_no  text NOT NULL, name text NOT NULL DEFAULT '', branch_no text NOT NULL DEFAULT '',
  trader_id   text NOT NULL DEFAULT '', priority integer NOT NULL DEFAULT 0,
  PRIMARY KEY (server_key, dma_user_id, account_no)
);
-- 적재는 RPC dma_admin_apply_snapshot(p_server text, p_rev bigint, p_users jsonb) 한 트랜잭션(delete+insert —
-- dma_journal_sync_access 원자 교체 동형).
```

근거 값:
- `kMaxUserIdLen = 8` · `BAD_USER_ID(빈/8B 초과)` → `octet_length(dma_user_id) <= 8`. [CITED: gh-trade 29-CONTEXT canonical_refs 「L177(`kMaxUserIdLen=8`)」 · D-05 code 2]
- 계좌번호 ≤12 · KB branch 5 · trader 6: `constexpr size_t kMaxAccountNoLen = 12;` [VERIFIED: /Users/alex/repos/gh-trade/server/src/util/Config.cpp:986] · `if (kbFields && a.branchNo.size() != kBranchNoLen)` · `"branch_no (5자)"` · `"trader_id (6자)"` [VERIFIED: Config.cpp:1067-1072]
- 정규화: `NormalizeAccountNo` = 앞뒤 공백/탭 제거 → 좌측 `'0'` 제거 → 전부 `'0'` 이면 `"0"` → 빈 값이면 `""`. [VERIFIED: /Users/alex/repos/gh-trade/server/src/broker/base/AccountUtil.h:14-38] → `packages/shared` 에 같은 함수를 이식해 Admin 입력 · DB 의도 저장 · 87 대조가 같은 키를 쓴다.

**⑦ 가시성 파생 (D-05 「(gateway, dma_user_id) 조인 의미 유지」).** 현재 규칙 뷰는
```sql
CREATE OR REPLACE VIEW public.dma_visibility_identities WITH (security_invoker = true) AS
  SELECT c.user_id, c.gateway, c.dma_user_id FROM public.dma_credentials c
  UNION ALL
  SELECT l.user_id, l.gateway, l.dma_user_id FROM public.dma_gateway_identities l
    JOIN public.dma_credentials c ON c.user_id = l.user_id WHERE l.gateway <> c.gateway;
```
이고 조회 RPC 3종은 `dma_visible_accounts(p_user_id)` 하나로 이 뷰를 거친다. [VERIFIED: supabase/migrations/20260929190000_dma_gateway_identities.sql:96-126 (뷰 96 · 헬퍼 113)]
권고: **뷰 이름 · 열을 그대로 두고 본문만** 「auth.users ⨝ app_users(role ∈ admin,trader · dma_user_id NOT NULL) × dma_servers(key)」 → `(user_id, server_key AS gateway, dma_user_id)` 로 재정의한다. 「같은 DMA id 를 모든 서버에」 결정과 정확히 같은 의미이고, RPC 3종 · `dma_visible_accounts` · server `dma-orders.ts` · relay `identities.ts` 는 무수정이다(identities 의 gateways 목록만 전 서버 키로). `dma_credentials` · `dma_gateway_identities` 표는 **지우지 않는다**(롤백 시 옛 relay 가 읽는다 — Pitfall 5).

**⑧ theme admin 흡수(D-02).** `is_theme_admin()` 본문을 `SELECT EXISTS (SELECT 1 FROM public.app_users a WHERE a.email = lower(auth.jwt() ->> 'email') AND a.role = 'admin')` 로 `CREATE OR REPLACE`(이름 · `REVOKE … FROM PUBLIC; GRANT … TO authenticated` 유지 → 정책 `admin_update_system_themes` · `admin_write_system_theme_stocks` 무수정). 현재 본문 · 시드: `WHERE a.email = (auth.jwt() ->> 'email')` · `INSERT INTO theme_admins(email) VALUES ('ezmesya@gmail.com')`. [VERIFIED: supabase/migrations/20260610130000_theme_admin_overrides.sql:45-59, 88] — 시드에서 `ezmesya@gmail.com` 의 역할을 정하지 않으면 테마 편집 권한이 사라진다(Open Q3).

**⑨ 역할 조회 RPC(middleware · 사이드바 · relay).** `my_app_access()` RETURNS (role text, dma_user_id text) — SECURITY DEFINER · `auth.jwt() ->> 'email'` 기준 · `GRANT EXECUTE … TO authenticated` 만(본인 것만 반환하므로 노출면 없음). `is_theme_admin()` 과 같은 패턴.

### 키 개명 마이그레이션 (D-12 · ADMIN-01)

대상(전부 `text` 열 — [VERIFIED: 각 파일 줄]):
| 표 | 열 · 키 | 근거 |
|----|---------|------|
| `dma_journal_events` | `gateway` · PK `(gateway, journal_epoch, seq)` | 20260924200000:63, PK :90 |
| `dma_account_orders` | `gateway` · UNIQUE `(gateway, trade_date, account_no, order_no)` · `(gateway, journal_epoch, reject_seq)` | :100, 유니크 인덱스 :133 · :138 |
| `dma_account_access` | `gateway` · PK `(gateway, dma_user_id, account_no)` | :149, PK :155 |
| `dma_journal_cursor` | `gateway` PK(+ 전략 커서 열) | :164 · 20260929180000 `ADD COLUMN strategy_journal_epoch` |
| `dma_strategy_events` | `gateway` · PK `(gateway, journal_epoch, seq)` | 20260929180000:44 |
| `dma_credentials` | `gateway` DEFAULT `'KB'` | 20260929190000:64 |
| `dma_gateway_identities` | `gateway` · PK `(user_id, gateway)` | 20260929190000:69 |

```sql
-- 배포 창 전용(옛 relay 정지 뒤). 한 트랜잭션.
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.dma_journal_cursor     SET gateway = 'KB120'    WHERE gateway = 'KB';
UPDATE public.dma_journal_cursor     SET gateway = 'KYOBO119' WHERE gateway = 'KYOBO';
-- … 같은 두 줄을 위 7개 표에 …
ALTER TABLE public.dma_credentials ALTER COLUMN gateway SET DEFAULT 'KB120';
COMMIT;
```
역개명(롤백 · 적용하지 않는 수동 SQL): 같은 UPDATE 를 반대로 + ⑦ 뷰를 20260929190000 본문으로 `CREATE OR REPLACE` + `SET DEFAULT 'KB'`. 새 키(`KB121` · `KYOBO127`)로 쌓인 행은 그대로 둔다(옛 relay 가 읽지 않는다).

### Pattern 1: 레지스트리 적재 + 안전 기본값 (D-09)
**What:** relay 는 `DMA_REGISTRY_SOURCE=db` **그리고** `NODE_ENV=production` 일 때만 `dma_servers` 를 읽는다. 그 밖에는 `DMA_HOST`(기본 `127.0.0.1`) · `DMA_PORT` · `DMA_BROKER` 로 1행 합성 레지스트리(키 = `${broker}LOCAL` 같은 비운영 키)를 만든다.
**Why:** 개발 Mac 은 WireGuard 로 운영 게이트웨이에 직결된다 — radar-gw nft 규칙이 `iifname "wg0" oifname "tun0" ip daddr 10.41.1.120 tcp dport { 9100, 22 } accept` 와 `ip saddr 10.20.0.2 ip daddr { 10.16.207.112, 10.16.207.119, 10.16.207.127 } tcp dport { 9100, 22 } accept` 를 연다. [VERIFIED: infra/relay/startup.sh:498, 512] 로컬 relay 가 운영 Supabase(같은 프로젝트)의 레지스트리를 읽으면 실서버 정원(6)을 먹고 실계좌 서버에 admin 명령을 보낼 수 있다.
**When:** 부팅 1회 + 60초 + `POST /internal/admin/registry/reload`(Admin 이 서버 편집 직후 Express 가 호출 — D-17 즉시성). 적재 실패면 직전 레지스트리 유지(identities 규율).

### Pattern 2: 서버별 admin 연결 (role 2)
**What:** `QuoteFeed` 상태기계를 축약 복사한 `AdminConn`(role 2 · `client="gh-radar-relay/admin"`). 로그인 79 `role !== 2` → `role_mismatch` 정지, 거부 → `rejected`(quote 와 같은 5분 × 12 유한 재시도 권고 — 정원 일시 초과 가능). ready 직후 op5 1건 → 87 → 스냅샷 적재.
**LivePing:** `DmaClient` 가 이미 30초 핑을 쏜다 — `export const PING_INTERVAL_MS = 30_000;` [VERIFIED: relay/src/dma/dma-client.ts:71] → 유휴 90초 스윕 대상이어도 끊기지 않는다. 「5분 재접속」 은 거부 뒤 재시도 간격과 같은 값으로 맞춘다.
**request_id 상관:** 연결별 `ulong` 단조 카운터(BigInt) → `Map<requestId, {resolve, timer}>`. 서버가 수신 스레드에서 직렬 처리하므로 relay 도 **서버당 1건 비행 큐**로 보내면 86/87 순서가 단순해진다(87 은 같은 연결에서 86 직후에 온다 — TCP 순서).
**정원:** 서버당 journal 1 + admin 1 = 2, quote 주 서버만 +1 → 최대 3 ≤ 6 · 재접속 겹침 여유 3.

### Pattern 3: relay 내부 admin HTTP 계약 (D-07)
기존 관문(`x-relay-secret` · 상수시간 비교 · `/healthz` 만 예외)을 그대로 지난다 — `relaySecretGuard` 는 `req.path === HEALTH_PATH` 외 모든 경로를 막는다. [VERIFIED: relay/src/order/order-api.ts:196-215] 8091 은 Caddy 가 `/healthz` 만 프록시하므로 공인 노출이 없다. [VERIFIED: infra/relay/Caddyfile `handle /healthz { reverse_proxy 127.0.0.1:8091 }`]

```
POST /internal/admin/users            {admin, email, role, dmaUserId, password, account:{broker,accountNo,name,branchNo,traderId,priority}, servers:[key]}
POST /internal/admin/users/:dma/password   {admin, password}                 → 등록된 모든 서버에 op1
PUT  /internal/admin/users/:dma/accounts   {admin, account, servers:[key]}   → 추가 서버 op3 · 빠진 서버 op4
DELETE /internal/admin/users/:dma/accounts/:broker/:accountNo {admin}        → op4 (마지막이면 12 → 화면은 유저 삭제 유도)
DELETE /internal/admin/users/:dma     {admin}                                → 등록 서버 전부 op2
POST /internal/admin/users/:dma/reconcile {admin}                            → 「다시 반영」: 의도 vs 87 diff 를 op 로
POST /internal/admin/servers/:key/quote-primary {admin}                       → break-then-make(Pattern 6)
POST /internal/admin/registry/reload  {admin}
GET  /internal/admin/servers/status                                           → 서버별 {journal, admin, quote, users}
응답(변경 계열): { results: [{ server, outcome: "ok"|"failed"|"timeout"|"offline", code?, message?, usersRev? }] }
```
- 서버별 타임아웃은 `LOGIN_RESP_TIMEOUT_MS`(5000) 와 같은 자릿수(5초) 권고 · 서버 간은 병렬 · 끊긴 서버는 즉시 `offline`. Express 쪽 HTTP 타임아웃은 (서버 타임아웃 + 여유) 로.
- 비밀번호는 Express → relay 평문(VPC 내부 http) — 옛 주문 경로와 같은 통로(`RELAY_INTERNAL_URL` 은 `http://10.10.0.5:8091` 이었다). [VERIFIED: infra/relay/README.md:161] relay 가 암호화 · 저장 후 op1. Express 는 키를 갖지 않는다(Phase 15 D-19 — credentials.ts:14 「Cloud Run server 는 `DMA_CRED_KEY` 를 갖지 않는다」).
- 감사: relay 1줄 `admin op=… server=… dmaUser=… code=… rev=… admin=<email>`(비밀번호 · 계좌번호 원문 금지 — 계좌는 `maskAccountNo`).

### Pattern 4: 87 적재 → 두 곳 (중요)
**What:** 87 을 받으면 (a) `dma_admin_apply_snapshot` RPC 로 서버별 반영 표 교체 (b) **그 서버 파이프라인의 `JournalAccess.replace(flatten(87))`** (c) 그 서버의 라이브 사용자 세션에 새 계좌 자가 선언.
**Why (b):** `JournalAccess` 의 원천은 「관찰자 로그인 응답 스냅샷 하나」 이고 근거가 「users.toml 은 핫리로드가 없어 게이트웨이 재시작 = 관찰자 재로그인」 이다. [VERIFIED: relay/src/journal/access.ts 머리 주석] Phase 29 로 그 전제가 깨진다 — (b) 없이는 Admin 이 추가한 계좌의 주문이 REST(`dma_visible_accounts` → `dma_account_access`) · 푸시 어디에도 안 보인다. 87 의 행 모양(dma_user_id · account_no · name · priority)이 `ObserverAccountRow`(`dmaUserId · accountNo · name · priority`)와 같다. [VERIFIED: relay/src/journal/types.ts:117-122]

### Pattern 5: (유저, 서버) 세션
**What:** 세션 키 `${userId}|${serverKey}`. 사용자 wss 인증 시 「그 DMA 유저가 87 상 존재하는 증권사별 주문 서버」 마다 세션 1개를 acquire(서버에 유저가 없으면 열지 않는다 — 로그인 거부 루프 방지). 주문은 계좌가 든 세션으로: `order-handler` 의 `deps.sessions.get(userId)` 를 `forAccount(userId, accountNo)` 로.
**D-10 주문 서버 전환:** 열린 세션은 서버 키가 고정이라 그대로 산다. 레지스트리 재적재가 「그 사용자 · 그 증권사의 열린 세션 서버 ≠ 현재 주문 서버」 를 감지하면 그 사용자 연결에 새 상태 프레임(예 `{t:"order.server", broker, current, pending}`) 1종. 새 세션은 다음 acquire 에서 새 서버로.
**D-08 비밀번호:** `DmaSession` 은 재접속마다 저장된 평문으로 다시 로그인한다(Pitfall 8) → `SessionManager.updatePassword(dmaUserId, pw)` 가 세션 내부 비밀만 교체(재로그인 없음).
**DeleteUser:** relay 가 op2 를 보내기 전에 그 DMA 유저의 세션들을 정리 대상으로 표시 → 86 ok 면 세션 `close()` + 그 사용자 연결에 `unauthorized` 상태 → 재접속 루프 없음.

### Pattern 6: 시세 주 서버 전환 (D-11)
**What:** hub 는 `attachFeed(feed)` 로 feed 를 교체할 수 있고(다른 객체면 「옛 연결 리스너는 침묵 · pacer reset」), `QuoteStatus` 는 생성 때 feed 하나를 묶는다. [VERIFIED: relay/src/hub/subscription-hub.ts attachFeed · relay/src/index.ts:212] → **안정 래퍼 `QuoteSwitch`** 가 `HubQuoteFeed` 표면(`isReady` · `send` · `on("frame"/"ready"/"state")`)을 제공하고 안쪽 `QuoteFeed` 만 바꾼다(hub · status 재결선 없음).
**순서:** 옛 feed `stop()` → 새 host 로 `new QuoteFeed` → `start()` → `ready` 대기(상한 = 로그인 타임아웃 + 여유, 예 10초) → 성공: DB `is_quote_primary` 갱신 · 래퍼 `ready` 재방출(hub `resubscribeAll`) / 실패(`rejected` · `role_mismatch` · 타임아웃): 새 feed stop → 옛 host 로 다시 생성 → 오류 응답. 전환 중 래퍼 상태 `connecting` → 배지 적색(QuoteStatus 3초 디바운스 그대로).

### Pattern 7: 허용 · 역할 즉시 반영 (D-04)
- webapp: middleware 매 요청 `my_app_access()` → 미허용 `/pending` · viewer 의 트레이딩 표면(`/trading` · `/me`?) 차단 · 비admin `/admin/*` 차단.
- relay: `app_users` 60초 재적재(+ Express 가 역할 변경 직후 `POST /internal/admin/access/reload`) → 사라졌거나 viewer 로 내려간 userId 의 wss 를 닫고(`fanout.revokeUser`) 세션은 기존 유예(`SESSION_GRACE_MS = 300_000`)로 종료. 서버 쪽 전략 · 미체결 무접촉.

### Anti-Patterns to Avoid
- **JWT 커스텀 클레임으로 역할 판정:** Custom Access Token Hook 은 새 JWT 를 발급할 때만 실행된다 — 강등이 토큰 수명(기본 1시간) 동안 반영되지 않아 D-04 위반. [CITED: supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook]
- **저널 관찰자에 role 분기 추가:** 커서 · epoch · 매핑에 묶여 있어 회귀 면적이 커진다(Phase 26 Pattern 2 선례가 같은 이유로 quote 를 별도 클래스로 뺐다). [VERIFIED: relay/src/quote/feed.ts 머리 주석 「Pattern 2」]
- **87 `users_rev` 를 DB 최신성 비교에 사용:** 재기동 시 1 로 돌아간다(gh-trade D-06). 수신 시각 + 연결 세대로 교체한다.
- **op4 를 멱등 삭제로 가정:** 없는 계좌는 code 8. 「87 로 확인한 계좌만 지운다」. [CITED: gh-trade 29-CONTEXT D-09]
- **Admin 화면에 「저장」 버튼:** 채택 목업 A 의 편집 본문에 「삭제 다시 반영 저장」 이 그려져 있지만 D-15 가 「저장 버튼 없음」 으로 확정했다 — CONTEXT 가 이긴다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 비밀번호 암호화 | 새 암호 코드 | `encryptDmaPassword` / `decryptDmaPassword` (AES-256-GCM · nonce 매 호출) | 이미 GCM · AAD · 짧은 암호문 가드가 검증됨 [VERIFIED: relay/src/store/credentials.ts:77-112] |
| 관찰자 연결 수명(백오프 · generation · 핑) | 새 소켓 루프 | `DmaClient` + `QuoteFeed` 상태기계 파생 | half-open · 구세대 콜백 · 정체 감지가 다 들어 있다 |
| 주기 재적재 | setInterval 직접 | `GatewayIdentities` 틀(겹침 금지 · 실패 시 직전 유지 · fail closed) | 같은 규율 3곳(신원 · 레지스트리 · 허용) |
| 공유 비밀 관문 | 새 미들웨어 | `relaySecretGuard`(상수시간 · 길이 선검사) | 오라클 방지 규율 포함 |
| relay HTTP 클라이언트(server) | 새 axios 래퍼 | 옛 `relay-client.ts` 의 `assertRelayUrl`(10.10.0.0/26 사설 대역 가드 · loopback 은 비프로덕션만) | `git show b93681b6^:server/src/services/relay-client.ts` 로 복원 가능 [VERIFIED: git 이번 세션] |
| 계좌번호 정규화 | 즉석 regex | gh-trade `NormalizeAccountNo` 규칙의 shared 이식 + 표 테스트 | 하이픈/0 차이로 87 대조가 조용히 어긋난다 |
| pgTAP 러너 | 새 스크립트 | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/<file>.sql` | 원격 접촉 0 · trap 정리 · 이미지 고정 |
| 바텀시트/우측 패널 | 새 오버레이 | `webapp/src/components/ui/sheet.tsx` (`side` = `"top" \| "right" \| "bottom" \| "left"`) + 스케치 002 | 이미 Radix 기반 · 슬라이드 변형 있음 [VERIFIED: sheet.tsx:60-64] |
| 즉시 저장 칩 | 새 저장 상태기계 | `limit-chaser-defaults.tsx` 의 「한 번에 1건 비행 · 행당 대기열 · 3초 실패」 규율 | Phase 27 D-13 동형 |

**Key insight:** 이 phase 의 대부분은 「이미 있는 틀을 N 개로 늘리는 일」 이다. 새로 발명할 것은 (유저, 서버) 세션 병합 규칙과 87→매핑 갱신 두 가지뿐이고, 둘 다 기존 불변식(1세션 · 무핫리로드)을 깨는 지점이라 테스트를 먼저 써야 한다.

## Runtime State Inventory

> 키 개명(rename) + env → DB 레지스트리 이전(migration) phase 다.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Supabase 7개 표의 `gateway` 값 `'KB'` · `'KYOBO'`(위 표). 원격 행 수는 미측정 [ASSUMED: 수천~수십만 — kind 15 가 하루 수천~1만 행] | **데이터 마이그레이션**(UPDATE) — 배포 창, 옛 relay 정지 뒤. 역개명 SQL 별도. KYOBO 의 127 시절 epoch 행도 `KYOBO119` 로 묶인다(Pitfall 2) |
| Stored data | 브라우저 메모리 — 전략 이벤트 병합 키 `` `${r.gateway}\|${r.journalEpoch}\|${r.seq}` `` [VERIFIED: packages/shared/src/strategy-event.ts:313-314] | 코드 변경 없음 — 배포 뒤 열린 탭은 새로고침 전까지 중복 표시 가능(20:00 이후 배포라 허용) |
| Live service config | Cloud Monitoring uptime `gh-radar-kyobo-observer-healthz` JSONPath `KYOBO_JSON_PATH='$.journalGateways.KYOBO.alerting'` · 정책 `gh-radar-kyobo-observer-down` · 동기화 판정 `g.get("KYOBO")` [VERIFIED: scripts/deploy-relay.sh:115-118, 231] | **코드 수정**(deploy 스크립트) — 키가 `KYOBO119` 로 바뀌면 판정이 `absent` 가 되어 체크 · 정책이 **조용히 삭제**된다. 새 키로 재키잉(Pitfall 3) |
| Live service config | gh-trade 서버 4대 `config/users.toml`(이제 relay admin 명령이 쓴다) · `config/observer.toml`(KB121 · KYOBO127 의 비밀 값 미확인) | 관리 이관(코드 아님) · 121/127 비밀 확인은 Open Q4 |
| Live service config | Supabase `theme_admins` 1행(`ezmesya@gmail.com`) | 시드 결정(Open Q3) |
| OS-registered state | radar-gw 컨테이너 env-file — `DMA_HOST` · `DMA_PORT` · `DMA_BROKER` · `DMA_KYOBO_HOST` · `DMA_KYOBO_PORT` 를 `printf` 로 넣고, 다음 배포는 `read_live_env` 로 실행 중 값을 보존한다 [VERIFIED: scripts/deploy-relay.sh:373, 415-418, 676-687] | **코드 수정** — 마지막 배포에서 호스트 env 주입 · 보존 로직 제거, `DMA_REGISTRY_SOURCE=db` 추가(D-09). systemd 유닛 이름 변경 없음 — 확인: 유닛은 VPN(openconnect · securwayssl) 소관이고 키 문자열을 갖지 않는다 |
| Secrets/env vars | Secret 이름 무변경: `gh-radar-dma-observer-secret`(→ `DMA_OBSERVER_SECRET`) · `gh-radar-dma-observer-secret-kyobo`(→ `DMA_OBSERVER_SECRET_KYOBO`, 지금은 **선택**) [VERIFIED: deploy-relay.sh:491 치명 4종 루프 · README §Secret 4종] | KYOBO 서버가 레지스트리에 있으면 KYOBO 비밀은 사실상 필수 — 루프 정책 재검토. 새 Secret 없음 |
| Secrets/env vars | server(Cloud Run) — `RELAY_INTERNAL_URL` · `RELAY_ORDER_SECRET` env/secret 바인딩과 server SA 의 secret accessor 를 16-16 에서 **제거**했다 [VERIFIED: scripts/deploy-server.sh:88-100, 152-166 · server/src/config.ts:44-48] | **코드 + IAM** — env/secret 재추가 · server SA 에 `gh-radar-relay-order-secret` accessor 재부여 · 방화벽 `relay-allow-internal-order`(8091) 는 그대로 존재 |
| Build artifacts | `relay/src/generated/**`(sync 재생성) · `packages/shared` dist(비추적 — typecheck 전 build) · relay 이미지 태그(롤백 대상 = 배포 직전 `/healthz` `version`) | 생성물 커밋 · 배포 직전 현재 태그 기록 |
| Build artifacts | `scripts/dma-credentials.ts` — `dma_credentials` 수기 등록 스크립트(D-17 「WinForms 와 달라야 한다」 주석 포함) | 폐기 또는 「레거시 · 롤백 전용」 표시. D-17 문구는 세션 합류 유지로 뒤집혔다 |

## 배포 · 롤백 순서 (D-12 빅뱅)

**전제:** gh-trade 29-07 이 KB120 · KYOBO119 를 새 바이너리로 재기동 완료(role 2 · 44/86/87 · 정원 6) — gh-trade STATE.md 「120 배포」 행과 `observer_probe.py --role admin users` 로 확인. [CITED: gh-trade 29-07-PLAN objective · D-25]

| 시점 | 단계 | 비고 |
|------|------|------|
| 언제든(게이트 무관) | additive 마이그레이션 `admin_access_registry`(표 · 시드 · RPC · `my_app_access` · `is_theme_admin` 재정의) 를 `supabase db push --linked --yes` | 옛 relay 무영향. **단** `is_theme_admin` 재정의 · webapp 게이트는 시드가 맞아야 안전 |
| 20:00 KST 이후 | ① 현재 relay 태그 기록(`curl -s https://dma.jx1.io/healthz \| jq -r .version`) | 롤백 대상 |
| | ② 옛 relay 정지(`docker stop`) — 저널 기록 중단 | 커서는 RPC 트랜잭션 안에서만 전진하므로 유실 없음(index.ts 종료 절차 주석) |
| | ③ `gateway_key_rename` + `dma_visibility_v2` 마이그레이션 push | 옛 relay 가 돌고 있으면 `KB` 커서 행이 새로 생겨 이력이 갈라진다(Pitfall 1) |
| | ④ 새 relay 배포(`DMA_REGISTRY_SOURCE=db` · 호스트 env 제거) → `/healthz` 확인 · `smoke-relay.sh` | 기동 직후 quote `connecting` 은 장 밖이라 200 |
| | ⑤ server(Express) 배포 — `RELAY_INTERNAL_URL` · `RELAY_ORDER_SECRET` 복원 | |
| | ⑥ uptime/정책 재키잉(`deploy-relay.sh --alert-only` 수정본) | |
| | ⑦ webapp push(= 프로덕션 배포) | 백엔드가 막히면 push 금지 |

**롤백:** webapp revert push → server 이전 리비전 → relay 정지 → **역개명 SQL + 옛 뷰 복원** → `deploy-relay.sh --rollback <태그>`(env-file 에 `DMA_HOST` · `DMA_KYOBO_HOST` 를 다시 명시 주입해야 한다 — 새 배포가 보존 로직을 지웠으면 `--rollback` 경로도 호스트를 알아야 한다). 배포 뒤 Admin 이 서버 users.toml 에 쓴 변경은 되돌리지 못한다(D-12 one-way).

## Common Pitfalls

### Pitfall 1: 옛 relay 가 도는 중에 키 개명
**What goes wrong:** 개명 직후 옛 relay 기록기가 커서를 `KB` 로 upsert · `p_gateway='KB'` 로 적재 → `KB` 와 `KB120` 이력이 갈라지고 새 relay 는 `KB120` 커서부터 재생해 중복 · 누락이 섞인다.
**How to avoid:** 개명 마이그레이션을 additive 와 분리, 런북 ②→③ 순서 강제. pgTAP 로 「개명 후 `dma_journal_apply('KB120', 같은 epoch, 다음 seq)` 가 이어진다」 를 고정.
**Warning signs:** 배포 뒤 `SELECT gateway FROM dma_journal_cursor` 에 `KB` 가 다시 보임.

### Pitfall 2: KYOBO 의 127 시절 이력 · KYOBO127 재가동
**What goes wrong:** `KYOBO` 행에는 127 시절 epoch(09-29~10-06) 과 119 epoch(`20261006-435c30ff…`)이 섞여 있다(메모리 `project_kyobo127_relay_observer`). 전부 `KYOBO119` 로 개명되면, 나중에 KYOBO127 을 켰을 때 127 이 옛 저널 저장소(같은 epoch)를 들고 있으면 커서 없는 `KYOBO127` 이 since 0 으로 재생 → 같은 주문이 `KYOBO127` 키로 한 번 더 투영된다(`dma_account_orders` 유니크 키에 gateway 가 들어 있어 충돌 없이 중복).
**How to avoid:** 런북에 「KYOBO127 활성화 전: 79 epoch 확인 → 옛 epoch 와 같으면 `dma_journal_cursor('KYOBO127', epoch, max(seq))` 시드」 1단계. [ASSUMED: 127 이 옛 저널을 보존하고 있을지는 미확인]

### Pitfall 3: uptime 체크가 키 개명으로 조용히 사라짐 · 무료 한도
**What goes wrong:** `sync_kyobo_monitoring` 은 healthz 에 `KYOBO` 키가 없으면 정책 → 체크를 삭제한다(「키가 없으면 절대 만들지 않는다」). 개명 뒤 키는 `KYOBO119` → 교보 끊김 알림이 사라진다. 서버마다 체크를 만들면 체크 1개 ≈ 6지점 × 1/분 × 30일 ≈ 25.9만 회/월이라 4개(KB 포함)면 무료 100만 회를 넘는다(README 의 「체크 2개 ≈ 월 52만 회」 와 같은 계산).
**How to avoid:** KYOBO 체크를 `$.journalGateways.KYOBO119.alerting` 로 재키잉(교보 주문 서버 키를 따라가게 하려면 healthz 에 「증권사별 주문 서버 저널 alerting」 같은 **고정 이름** 필드를 두는 편이 낫다 — 예 `brokers.KYOBO.alerting`). 체크 수는 3 이하 유지.

### Pitfall 4: 87 을 받고도 가시성이 안 바뀜
(위 Pattern 4) `JournalAccess.replace` 를 87 에서 부르지 않으면 Admin 이 추가한 계좌 주문이 다음 관찰자 재로그인(게이트웨이 재시작 · 회선 끊김)까지 아무에게도 안 보인다. `JournalAccess` 는 유효 행 0 스냅샷을 거부한다(`emptySnapshotsRejected`) — 87 에 유저가 0명이면 같은 규율 적용. [VERIFIED: relay/src/journal/access.ts JournalAccessHealth 주석]

### Pitfall 5: AAD 와 사전 등록
**What goes wrong:** 현재 AAD 는 웹 `user_id`(`cipher.setAAD(Buffer.from(userId, "utf8"))`, 행 이동 공격 방지). [VERIFIED: credentials.ts:82-83] 그런데 D-03 사전 등록 사용자는 아직 `auth.users` id 가 없고, D-16 생성 시트는 그 순간 비밀번호를 받아 op1 을 보낸다 → 웹 user_id AAD 로는 저장할 수 없다. 또 「DMA 유저당 1개」 보관이고 한 DMA id 를 여러 웹 사용자가 공유하는 실데이터가 있다(「한 dma_user_id 를 gh-radar 사용자 여럿이 공유하는 실데이터가 있다」). [VERIFIED: 20260929190000_dma_gateway_identities.sql:18-20]
**How to avoid:** `dma_users.password_enc` 의 AAD = DMA 유저 식별(예 `'dma-user:' + dma_user_id`) — 함수는 그대로 재사용하고 인자만 바꾼다. 기존 `dma_credentials` 행은 **재암호화 스크립트**(relay 모듈 경유 · `scripts/dma-credentials.ts` 의 링크 모드가 「원본 user_id 로 복호 → 대상으로 재암호화 → 재복호 검증」 을 이미 한다)로 `dma_users` 로 옮긴다 — SQL 만으로는 못 한다(키가 relay 에만 있다). 롤백 안전을 위해 relay 가 비밀번호 변경 시 연결된 웹 사용자의 `dma_credentials` 행도 옛 AAD 로 함께 갱신(dual-write)하는 것을 권고. D-06 의 「AAD = user_id」 문구와 다르므로 확인 필요(Open Q2).

### Pitfall 6: 시드 없는 D-01 게이트 = 전원 잠김 (e2e 포함)
**What goes wrong:** 게이트가 켜지는 순간 `app_users` 에 없는 사람은 전부 `/pending`. 기존 운영 사용자 · Playwright 테스트 사용자(`E2E_TEST_EMAIL` — 실 Supabase 로그인) · 앱(Capacitor) 사용자 모두.
**How to avoid:** 시드 마이그레이션(데이터 기반: `dma_credentials` 보유자 → trader, `theme_admins` · `alex@jx1.io` → admin, 그 외 기존 auth.users → ? ) + e2e 테스트 계정 시드 단계(`webapp/scripts/seed-test-user.ts` 옆). 역할 결정은 Open Q3.

### Pitfall 7: viewer 와 「분석」 의 기존 게이트 충돌
D-02 는 viewer 에게 「분석」 을 연다. 그러나 `/analytics/limitup` 은 Phase 28 D-10 으로 「DMA 연결 사용자만」 이고 server 라우트가 `dma_visible_accounts` 미매핑이면 403 `DMA_UNMAPPED` 를 낸다. [VERIFIED: server/src/routes/limitup-report.ts:20 · 28-CONTEXT D-10] AI 애널리스트(`/chat`)도 「분석 하위 · 트레이딩 권한자 전용」(quick-261005-vk1). viewer 가 분석을 보려면 서버 게이트를 역할 기반으로 바꿔야 한다 — Open Q5.

### Pitfall 8: 비밀번호 변경 뒤 회선 재접속 = 세션 거부
**What goes wrong:** `DmaSession` 은 TCP 가 다시 올라올 때마다 저장된 평문으로 `LoginReq` 를 보낸다(`buildLoginReq(this.#dmaUserId, this.#password, this.#broker)`). [VERIFIED: relay/src/dma/session.ts:305] Admin 이 비밀번호를 바꾼 뒤 VPN 순단이 오면 옛 비밀로 재로그인 → 거부 → `session_rejected`(재시도 없음).
**How to avoid:** Pattern 5 의 `updatePassword` — D-08 「열린 세션 유지」 와 모순 없이 다음 로그인(재접속 포함)부터 새 값.

### Pitfall 9: hub 의 「같은 userId 다른 세션 = 교체」 규칙
`attach` 는 같은 userId 로 다른 세션 객체가 오면 「세션 교체 — 사용자 캐시 폐기」 한다. [VERIFIED: subscription-hub.ts:832-848] KB 세션과 KYOBO 세션을 같은 userId 로 attach 하면 서로의 캐시를 지운다. 세션 소유 키를 도입하기 전에 다중 세션을 켜지 말 것.

### Pitfall 10: 계좌 추가 자가 선언은 `declaring` 밖에서 무시된다
`UpdateAccountNoResp` 는 `declaring` 상태가 아니면 「예상 밖 시점」 으로 버린다. [VERIFIED: session.ts:413-416] Ready 세션에서 mode "1" 을 보내면 응답을 처리할 경로가 없다 → Ready 중 단건 선언 경로(응답 대조 · `allowedAccounts` 갱신 · 상태 프레임 accounts 재송신)를 새로 둔다.

### Pitfall 11: 「DMA_OBSERVER_SECRET 그대로」 는 KB 만의 사실
KB 관찰자 비밀은 `DMA_OBSERVER_SECRET`, 교보는 별도 Secret `gh-radar-dma-observer-secret-kyobo` → `DMA_OBSERVER_SECRET_KYOBO` 다. [VERIFIED: config.ts:52-54 · README §다중 게이트웨이 관찰자 표] role 2 는 「그 서버 observer.toml 비밀」 을 쓰므로 교보 서버의 admin 연결은 교보 비밀이어야 한다. 레지스트리에 비밀을 두지 말고 **증권사 → env 키** 고정 매핑으로 고른다. KB121 · KYOBO127 의 observer.toml 값이 같은 증권사 값과 같은지는 미확인(Open Q4).

### Pitfall 12: 79 응답 `broker` 는 여전히 `"KB"`/`"KYOBO"`
`ObserverLoginResp.broker` 주석이 「gh-radar p_gateway 원천」 이지만 relay 는 이미 config 키를 쓴다(커서를 로그인 전에 읽기 때문 — index.ts:105-108). 서버 키로 바뀌어도 이 필드를 키로 쓰면 안 된다. 대신 레지스트리 broker 와 대조하는 안전장치로 쓴다. [VERIFIED: StockDMA.fbs ObserverLoginResp · relay/src/index.ts:105-108]

### Pitfall 13: Express 로그에 비밀번호
server 의 pino redact 는 `authorization` · `cookie` · `x-api-key` · 일부 키뿐이고 `*.password` 가 없다. [VERIFIED: server/src/logger.ts:14-25] relay 는 `"*.password"` 를 이미 가린다. [VERIFIED: relay/src/logger.ts:42] server redact 에 `*.password` · `req.body.password` · `x-relay-secret` 추가.

## Code Examples

### 역할 게이트를 middleware 에 얹는 자리
```typescript
// Source: webapp/src/lib/supabase/middleware.ts:46-73 (현재) + 권고 추가분
const { data: { user } } = await supabase.auth.getUser();      // 그대로(서명 검증 · refresh)
// ... 기존 미인증 → /login, 로그인 상태 /login → / 분기 ...
if (user && !isPublic) {
  const { data } = await supabase.rpc("my_app_access");        // SECURITY DEFINER · 본인 1행
  const role = (data as { role: string } | null)?.role ?? null;
  if (role === null && pathname !== "/pending") return redirectTo(request, "/pending");
  if (role !== null && pathname === "/pending") return redirectTo(request, "/");
  if (pathname.startsWith("/admin") && role !== "admin") return redirectTo(request, "/");
  // viewer 트레이딩 표면 차단 목록은 Open Q5 결정 뒤
}
```

### relay 내부 admin 라우터 결선 자리
```typescript
// Source: relay/src/order/order-api.ts:221-227 (현재 관문 순서) — 404 앞에 라우터 1줄
app.use(express.json({ limit: "16kb" }));
app.use(relaySecretGuard(deps.relayOrderSecret));
app.get(HEALTH_PATH, /* … */);
if (deps.admin !== undefined) app.use("/internal/admin", deps.admin.router);   // 신규
app.use((_req, _res, next) => next(new RelayApiError(404, "NOT_FOUND", "Route not found")));
```

### 87 → 매핑 갱신
```typescript
// ObserverAccountRow 와 같은 모양(relay/src/journal/types.ts:117-122)으로 평탄화해 그 서버의 JournalAccess 에 넘긴다
const rows = snapshot.users.flatMap((u) =>
  u.accounts.map((a) => ({ dmaUserId: u.userId, accountNo: a.accountNo, name: a.name, priority: a.priority })),
);
pipelines.get(serverKey)?.access.replace(rows);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `dma_credentials` 행 = allowlist(수기 스크립트) | 허용/역할 표 + Admin 화면 | Phase 29 | `scripts/dma-credentials.ts` 레거시화 |
| 게이트웨이 키 = 증권사(`KB`/`KYOBO`) | 증권사 + IP 끝자리 | Phase 29 | 서버마다 커서 · epoch · 매핑 독립 |
| users.toml 수기 배치 · 핫리로드 없음 | 서버 admin 명령 · RCU · 87 | gh-trade Phase 29 | relay 매핑의 「로그인 스냅샷 = 정본」 전제 폐기 |
| gh-radar DMA user_id 는 WinForms 와 달라야 함(D-17) | 세션 합류 유지(같은 Session 공유) | 2026-10-06 합의 | dma-credentials.ts · session.ts:424 주석 갱신 |
| server 는 relay HTTP 를 부르지 않음(16-16) | admin 명령만 다시 부름 | Phase 29 | Cloud Run env/IAM 복원 |

**Deprecated/outdated:** 메모리의 「subscription-hub 는 `relay/src/dma/`」 표기 — 실제 `relay/src/hub/subscription-hub.ts`. CONTEXT 의 「`server/src/services/dma-orders.ts` 의 relay HTTP 호출 + `x-relay-secret`」 — 그 파일은 지금 조회 전용 RPC 래퍼이고 relay 를 부르지 않는다(「★ 쓰기 함수가 없다」). relay HTTP 선례는 삭제된 `relay-client.ts`(git 이력)다. [VERIFIED: server/src/services/dma-orders.ts:19-51 · server/src/server.ts:65-66]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 새 생성물 파일명 `admin-*.ts` 5개 | 착수 게이트 | 생성물 커밋 경로 목록만 틀림 — sync 출력이 정본 |
| A2 | KB121 · KYOBO127 포트 9100 · relay 호스트에서 라우팅 가능(KB121 은 KB VPN tun0 경유) | 데이터 모델 시드 | enabled 전환 시 연결 실패 — 시드는 enabled=false 라 배포에는 무영향 |
| A3 | 127 이 옛 저널 저장소(같은 epoch)를 보존 | Pitfall 2 | 커서 시드 단계가 불필요하거나 반대로 중복 투영 |
| A4 | 원격 `dma_journal_events` · `dma_strategy_events` 행 수가 한 트랜잭션 UPDATE 로 수 초 안 | 키 개명 | lock_timeout · 장시간 잠금 — 배포 창 연장 |
| A5 | middleware 의 RPC 1회 추가 지연이 체감 문제 없음(Vercel ↔ Supabase 1왕복) | Pattern 7 | 페이지 이동 지연 — 측정 필요 |
| A6 | Express → relay 평문 http(VPC) 로 비밀번호 전송이 기존 주문 경로와 같은 수준으로 수용됨 | Pattern 3 | 보안 판단 필요 시 TLS · 별도 암호화 |
| A7 | 교보 웹 주문(교보 사용자 세션)이 이번 phase 범위다 | Pattern 5 · Open Q1 | 범위가 크게 달라짐 |

## Open Questions (RESOLVED)

> 해소처: Q1 → 29-CONTEXT D-18(G-1 소유 필터 · primary 보정은 29-35) · Q2 → D-19 · Q3 → D-20 · Q4 → 29-CONTEXT Claude's Discretion(증권사별 비밀 env 재사용) · Q5 → D-21 · Q6 → 29-CONTEXT Claude's Discretion(`journal` 축 = KB 주문 서버 저널) + G-1 재검토 29-36 Task 3(journal/brokers = 증권사 기본 주문 서버 · 계좌 지정 서버는 healthz 본문 `accountOrderServers`).

1. **(유저, 서버) 세션 병합 규칙 — 특히 교보 세션의 VI · 사용자 설정(84) · 상태 프레임**
   - What we know: 지금 사용자 세션은 KB 1개이고 hub 의 VI 캐시 키는 `viTriggerKey(userId, exchange)`, 84 · 77 · 76/78 도 userId 단위다. 「트레이딩 표면 UI 변경 없음(배지 1개 제외)」 이 범위 제약이다.
   - What's unclear: 한 사용자가 KB · 교보 세션을 동시에 가지면 VI 설정 · 84(상따 기본설정) · 돌파 집합 · `{t:"state"}` 가 증권사별로 둘이 된다. 웹 UI 는 하나만 그린다.
   - Recommendation: discuss 로 한 번 확인 — 권고안은 「주문 · 계좌 · 상따 · 83 은 세션 병합, VI · 84 · 76/78 은 KB(또는 사용자의 첫 증권사) 세션만 원천, 상태 프레임은 계좌 합집합 + 어느 세션이든 ready 면 ready」. 이 결정 전에는 (유저, 서버) 키 구조만 만들고 교보 세션 acquire 는 켜지 않는 단계 분리가 안전하다.
2. **비밀번호 AAD** — D-06 은 「AAD = user_id 재사용」 이라 했지만 사전 등록 · DMA 유저당 1개 보관과 양립하지 않는다(Pitfall 5). DMA 유저 키 AAD + 재암호화 이관 + dual-write 로 가도 되는지.
3. **허용 표 시드** — 기존 auth.users 의 역할(dma_credentials 보유자 = trader? 나머지 = 미허용/viewer?), `ezmesya@gmail.com`(현 테마 운영자)의 역할, `alex@jx1.io` 가 이미 가입했는지, e2e 테스트 계정 역할.
4. **KB121 · KYOBO127 observer.toml 비밀** — 같은 증권사 비밀과 같은 값인지(교보 127 은 119 와 같다는 기록만 있음). 다르면 서버별 비밀 env 가 필요하다(새 Secret 없음 원칙과 충돌).
5. **viewer 의 「분석」 범위** — 상한가 보고서 · AI 애널리스트를 viewer 에게 열지(그러면 server 게이트를 역할 기반으로 바꿔야 함) 아니면 「분석」 = 스캐너 · 테마류만인지.
6. **healthz 503 축의 주인** — 지금 `journal` 은 「주 게이트웨이」 하나다. KB 주문 서버를 KB121 로 바꾸면 503 축도 따라가야 하는지(권고: `journal` = KB 주문 서버 저널, 나머지는 `journalGateways` 본문만).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | relay/server/webapp | ✓ | v24.21.0 (relay engines `>=22`) | — |
| pnpm | 워크스페이스 | ✓ | 11.15.1 | — |
| flatc | 생성물 sync(gh-trade 스크립트가 호출) | ✓ | 25.12.19 (고정값 일치) | — |
| docker + pgTAP 이미지 | 마이그레이션 회귀 | ✓ | `public.ecr.aws/supabase/postgres:17.6.1.104` 로컬 존재 | — |
| supabase CLI | `db push --linked` (배포) | ✓ | 2.75.0 | — |
| gcloud | deploy-relay · deploy-server · uptime | ✓ | (설치 확인) | — |
| gh-trade KB120 · KYOBO119 새 바이너리 | role 2 · 44/86/87 | ✗(아직) | — | 없음 — 빅뱅 배포의 선행 조건 |
| KB121 · KYOBO127 | 추가 서버 | ✗(접속 불가 · 구버전) | — | enabled=false 시드 |

**Missing dependencies with no fallback:** gh-trade 서버 새 바이너리(배포 단계만 막힘 — 구현 · 테스트는 fake gateway 로 진행).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest(relay ^4.1.4 · server ^4.1.4 · webapp ^2.1.9) · Playwright ^1.59.1 · pgTAP(로컬 컨테이너) |
| Config file | `relay/vitest.config.*` · `server/vitest.config.*` · `webapp/vitest.config.*` · `webapp/playwright.config.ts`(workers 1 · relay 8090 고정) |
| Quick run command | `pnpm --filter @gh-radar/relay exec vitest run <파일>` / `pnpm --filter @gh-radar/webapp exec vitest run <파일>` / `pnpm --filter @gh-radar/server exec vitest run <파일>` |
| Full suite command | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` (config `build_command` + `test_command`) + `pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADMIN-01 | 개명 후 커서 · epoch · 매핑 · 신원 보존, `dma_journal_apply('KB120', …)` 이어받기, 역개명 SQL 왕복, 레지스트리 부분 유니크(주문 1/증권사 · 시세 1) | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/gateway_key_rename.test.sql` | ❌ Wave 0 |
| ADMIN-02 | `my_app_access` 본인 1행 · anon 불가 · `is_theme_admin` 재정의 후 정책 동작 · 승인 대기 목록 RPC service_role 전용 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/admin_access_registry.test.sql` | ❌ Wave 0 |
| ADMIN-02 | middleware 판정표(미허용→/pending · viewer · 비admin /admin) | unit(순수 함수로 분리 — `public-path.ts` 선례) | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/supabase/__tests__/access-gate.test.ts` | ❌ Wave 0 |
| ADMIN-03 | 뷰 재정의 후 가시성 매트릭스(같은 DMA id × 전 서버 키 · viewer 제외) · RPC 3종 무수정 통과 | pgTAP | 위 admin_access_registry 또는 `dma_visibility_v2.test.sql` | ❌ Wave 0 |
| ADMIN-04 | `DMA_REGISTRY_SOURCE=db` 비프로덕션 throw · env 합성 1행 · 레지스트리 diff 로 파이프라인 올림/내림 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/config-registry.test.ts tests/registry.test.ts` | ❌ Wave 0 (`tests/config-upstreams.test.ts` 선례) |
| ADMIN-04/05 | fake gateway role 2 로그인 · 79 role 2 · role_mismatch · 44→86→87 · request_id 상관 · 타임아웃 | integration(fake gateway) | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-conn.test.ts tests/admin-gateway.test.ts` | ❌ Wave 0 (`tests/quote-gateway.test.ts` 선례) |
| ADMIN-05 | 2서버 fan-out 부분 실패(한 서버 BUSY 9 · 한 서버 무응답) → 결과 배열 · 87 → 반영 표 RPC + `JournalAccess.replace` | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-fanout.test.ts` | ❌ Wave 0 |
| ADMIN-06 | (유저, 서버) acquire · `forAccount` 라우팅 · 비밀 교체 후 재접속 로그인 새 비밀 · Ready 중 계좌 선언 · 주문 서버 바뀜 프레임 | unit + integration | `pnpm --filter @gh-radar/relay exec vitest run tests/session-manager.test.ts tests/account-declare.test.ts tests/ws-order.test.ts` | ✅ 확장 |
| ADMIN-07 | 시세 전환 성공 · 새 서버 거부 시 복귀 · hub 재구독 1회 | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/quote-switch.test.ts` | ❌ Wave 0 |
| ADMIN-08 | `/api/admin/*` 401(미인증) · 403(비admin) · relay 결과 배열 통과 · 사설 대역 가드 | route(supertest) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin.test.ts tests/services/relay-admin-client.test.ts` | ❌ Wave 0 |
| ADMIN-09/10 | 시트 즉시 저장 · 결과 칩(반영됨/미반영/실패·BUSY/서버에만 있음) · 생성 시트 역할 펼침 · 서버 카드 라디오 | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/admin/__tests__` | ❌ Wave 0 |
| ADMIN-09/10 | e2e: admin 로그인 → /admin/users 생성 → 결과 칩 / 비admin 의 /admin 차단 | e2e(relay 픽스처 + 스텁 Supabase 확장) | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin.spec.ts --reporter=list` | ❌ Wave 0 |
| ADMIN-11 | 역할 강등 → 60초 재적재(테스트는 짧게) → wss 종료 · 세션 유예 | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/app-access.test.ts` | ❌ Wave 0 |
| ADMIN-12 | 배포 · 재키잉 · 롤백 | manual(checkpoint) | `bash scripts/smoke-relay.sh` · `curl -s https://dma.jx1.io/healthz \| jq` | — |

### Sampling Rate
- **Per task commit:** 해당 파일 vitest 단건 + 관련 typecheck(`pnpm --filter @gh-radar/shared build` 선행)
- **Per wave merge:** config `build_command` + `test_command` 전량 + server vitest + 그 wave 의 pgTAP
- **Phase gate:** 전량 green + Playwright admin spec + 기존 trading-workbench spec 회귀 + pgTAP 전 파일 재생

### Wave 0 Gaps
- [ ] `relay/tests/helpers/fake-gateway.ts` — role 2 로그인(지금은 role 1 이면 quote 목록, 그 외는 journal 로 분기) 분리 기록 + 44 수신 기록 + `respondAdmin(code, message, usersRev)` · `pushAdminSnapshot(users)` · 다중 인스턴스(서버 2대) 사용 예
- [ ] `relay/tests/helpers/frames.ts` — 86/87 프레임 빌더(생성물 도착 뒤)
- [ ] `relay/tests/helpers/supabase-stub.ts` · `webapp/e2e/fixtures/relay.ts` 스텁 — `dma_servers` · `app_users` · 새 RPC 경로(위에 없는 경로는 빈 배열 200 + `unknownRequests()` 로 드러난다)
- [ ] `supabase/tests/gateway_key_rename.test.sql` · `admin_access_registry.test.sql`
- [ ] `webapp/src/lib/supabase/access-gate.ts`(순수 판정 함수) + 테스트
- [ ] e2e 테스트 계정의 `app_users` 시드 단계(Pitfall 6)

## Sources

### Primary (HIGH confidence — 이번 세션 파일 확인)
- gh-radar: `relay/src/{config.ts, index.ts, order/order-api.ts, journal/{identities,observer,access,types}.ts, quote/feed.ts, dma/{session-manager,session,dma-client,envelope,msg-type}.ts, hub/subscription-hub.ts, ws/{fanout,order-handler}.ts, store/credentials.ts, logger.ts}` · `relay/tests/helpers/{fake-gateway,supabase-stub}.ts` · `server/src/{services/dma-orders.ts, middleware/require-auth.ts, config.ts, app.ts, routes/limitup-report.ts, logger.ts}` · `webapp/src/{lib/supabase/{middleware,public-path}.ts, app/auth/callback/route.ts, components/layout/app-sidebar.tsx, components/trading/dma-gate.tsx, components/me/limit-chaser-defaults.tsx, components/ui/sheet.tsx, hooks/use-is-theme-admin.ts}` · `webapp/playwright.config.ts` · `webapp/e2e/fixtures/relay.ts` · `supabase/migrations/{20260610130000, 20260924200000, 20260929180000, 20260929190000}*.sql` · `scripts/{deploy-relay.sh, deploy-server.sh, verify-dma-orders-price-check.sh, dma-credentials.ts}` · `infra/relay/{README.md, Caddyfile, startup.sh}` · `docs/inbox/from-gh-trade/README.md` · git `b93681b6^:server/src/services/relay-client.ts`
- gh-trade: `server/src/protocol/StockDMA.fbs`(ObserverLoginReq/Resp) · `server/src/broker/base/AccountUtil.h` · `server/src/util/Config.cpp:986-1080` · `server/scripts/sync-relay-schema.sh` · `.planning/ROADMAP.md §Phase 29`
- 메모리: `project_dma_admin_multi_server_261006` · `reference_gh_trade_protocol_sync` · `project_kyobo127_relay_observer`

### Secondary (MEDIUM — 확정 결정이지만 구현 전)
- gh-trade `phase-29-admin-users` worktree `.planning/phases/29-admin-users-toml-gh-radar/{29-CONTEXT.md, 29-01..07-PLAN.md}` (D-01~D-25 · 와이어 · 배포 범위)
- [Supabase Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) — 훅은 새 JWT 발급 때만 실행(역할 즉시성 판단 근거)

### Tertiary (LOW)
- 원격 DB 행 수 · KB121/KYOBO127 네트워크 · 127 저널 보존 여부(Assumptions A2~A4)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 패키지 없음, 버전 실측
- Architecture(relay · DB · webapp 변경 지점): HIGH — 줄 단위 근거
- 와이어(44/86/87): MEDIUM — gh-trade 확정 결정 · 플랜이지만 fbs 미커밋
- (유저, 서버) 세션 병합 규칙: LOW — 제품 결정 미결(Open Q1)
- Pitfalls: HIGH(코드 근거) / MEDIUM(Pitfall 2 · 3 의 운영 수치)

**Research date:** 2026-10-06
**Valid until:** gh-trade 29-01 인계 노트 도착 시점까지(와이어 절 재확인) · 그 밖 30일
