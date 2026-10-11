---
status: done
from: gh-trade
from_commit: 4bf6d8f1
from_branch: master
date: 2026-10-10
fbs_sync_marker: 88fc746d
done_commit: 5687c282
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-10

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

배경: 2026-10-07 SAMG엔터(KR7419530001) 13:47:05 에 KB 120 서버의 두 계좌(37728502101 매도 ↔ 37703857101 매수)가 23,300 원에 서로 체결됐고, 두 계좌의 주문 전문이 같은 주문자식별정보(IP `010041001120`)·MAC 을 싣고 있어 거래소가 한 단말의 두 계좌로 묶어 **통정거래 경고**를 냈다. 서버가 주문 소켓 NIC 값을 전 계좌에 공통으로 싣던 구조를 **계좌별 설정**으로 바꿨다(gh-trade quick-261010-vfn, 커밋 `0eea4675`·`55470a4b`·`2e9be9bd`, 병합 `4bf6d8f1`).

와이어 변경 — **MsgType 무변경**, 테이블 말미 append 만:

- `table AdminAccount`(44 op 1/3 의 `account` · 87 `AdminUser.accounts` 공용)에 두 필드 append — vtable 슬롯 `order_ip` = 14, `order_mac` = 16
  - `order_ip: string` — 주문자식별정보(KB TCHODR1000 orderInfo). 입력은 12자리 숫자(`010041001124`) **또는** 점표기(`10.41.1.124`), 서버가 12자리로 정규화해 87 에 싣는다. 빈 문자열 = 미설정(서버가 주문 소켓 NIC 값을 쓴다 — 종전 동작)
  - `order_mac: string` — MAC 주소. 입력은 12자리 16진(구분자 `:`·`-` 허용, 대소문자 무관), 서버가 **대문자 12자리**로 정규화. 빈 문자열 = 미설정
  - **둘은 함께 적거나 함께 비운다.** 한쪽만 보내면 86 code 13. IP 만 바꾸고 MAC 이 같으면 여전히 한 단말로 묶이기 때문
  - 교보 서버·미설정 계좌는 87 에서 둘 다 빈 문자열
- `AdminCommandResp(86)` code **13 BAD_ORDER_ENDPOINT** 신설(append) — 문구 「주문자 IP/MAC 형식 오류 — IP 는 12자리 숫자 또는 a.b.c.d, MAC 은 12자리 16진, 둘 다 적거나 둘 다 비워야 합니다」. NUL·잘못된 UTF-8 은 「주문자 IP/MAC 에 허용되지 않는 문자(NUL·UTF-8 아님)가 있습니다」(같은 code 13)
- code 7 ACCOUNT_CONFLICT 범위 확장 — 다른 사용자의 같은 계좌는 branch/trader 뿐 아니라 order_ip/order_mac 도 같아야 한다. **문구는 종전 「다른 지점번호/거래자ID 로 보유」 그대로**(아래 질문)
- op 3 멱등 규칙 — 7필드(name·branch_no·trader_id·priority·order_ip·order_mac + account_no) 전부 같으면 code 0 「변경 없음」·rev 불변·87 없음. 점표기·소문자 콜론으로 다시 보내도 정규화해 비교하므로 멱등
- op 3 BUSY(9) 규칙 — IP/MAC **만** 바뀌는 갱신은 BUSY 판정을 타지 않는다(name/priority 와 같은 취급). branch/trader 변경만 종전처럼 BUSY
- 비우기 — op 3 에 두 필드를 빈 문자열로 보내면 미설정으로 돌아간다(87 빈 문자열)
- 서버 쪽 효과 — 설정된 계좌의 KB 주문 전문(신규·정정·취소)에 그 값이 실리고, 미설정 계좌는 바이트 하나 다르지 않다. 로그인·주문·잔고 등 다른 메시지 무변경

판정기가 걸린 파일:

- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

1. **생성물 재동기화 — 이미 반영했다.** gh-trade 세션(gh-trade-74)이 `server/scripts/sync-relay-schema.sh` 를 돌려 `relay/src/generated/`(StockDMA.fbs 사본 SYNC MARKER `55470a4b`(fbs 를 바꾼 커밋) + `stock-dma/admin-account.ts` 1개 변경)를 gh-radar 작업 트리에 써 두었다. **커밋만** 해 주면 된다(경로 지정 add, 이 노트와 함께). 기준 `88fc746d` 는 `4bf6d8f1` 의 조상이라 고아 삭제 없음(삭제 예정 0 확인)
2. **relay 코덡** — 44 op 1/3 의 `AdminAccount` 빌더에 `order_ip`/`order_mac` 추가(빈 문자열도 실어도 되고 생략해도 된다 — 서버는 null 을 빈 문자열로 읽는다), 87 파서가 두 필드를 읽어 `packages/shared` 의 `AdminAccount` 타입(`orderIp`·`orderMac`)으로 전달. code 13 라벨 추가
3. **DB** — 계좌 설정 원본이 서버 users.toml 이라 gh-radar DB 스키마 변경은 필요 없을 것으로 본다(87 스냅샷이 정본). gh-radar 가 계좌를 캐시/미러한다면 두 컬럼 추가
4. **webapp(Phase 29 어드민 계좌 편집)** — `account-editor` 에 입력칸 2개: 「주문자 IP」(placeholder `10.41.1.124` 또는 12자리) · 「MAC 주소」(placeholder `1C:FD:08:7D:97:8E`). 클라 측 검증은 서버 규칙과 같게(IP 12자리 숫자 또는 a.b.c.d · MAC 12 hex · **둘 다 또는 둘 다 빈 값**), 저장 뒤 87 의 정규화 표기로 다시 그린다. 「같은 서버의 두 계좌가 서로 체결될 수 있으면 계좌마다 서로 다른 사용자 PC 의 값을 적는다」 도움말 한 줄. 멱등 비교(`admin.ts` 349행 근처의 7필드 비교)에 두 필드 추가

> 진행 (2026-10-11 · gh-radar 29-47): 항목 2(relay 코덱 — 87 파서 · op 1/3 이 87 의 order_ip/order_mac 을 되실어 보존 · code 13 BAD_ORDER_ENDPOINT 라벨) 반영 · 항목 3(DB) 불필요 확인. relay 는 29-53 으로 배포(183ea9c8).
>
> 진행 (2026-10-11 · gh-radar Phase 30): **KB 운영 서버 값 설정 보류 권고 해제** — R3-01 수정(op 1/3 직전 op 5 재조회 · 재조회 실패면 그 서버에 44 를 보내지 않음) relay `relay:2234a1b5` 배포 · 실서버 확인 2026-10-11(계좌명만 저장 6건 모두 relay_docker 에서 `users.toml 스냅샷 수신(87)` 뒤 ~30ms 에 `명령 결과(86) op 3 code 0` · 07:22:36Z~07:23:59Z · 카드 IP/MAC 그대로). 이제 KB 운영 서버에 계좌별 IP/MAC 을 설정해도 된다. 항목 4(웹 입력칸) 완료 — Admin 계좌 카드 「편집」 에 「주문자 IP」 · 「MAC 주소」 칸 · 서버 규칙과 같은 클라 검증(둘 다 또는 둘 다 빈 값) · 7필드 멱등 「변경 없음」 · 도움말 한 줄 · code 13 서버 문구 원문 표시 · 계좌명 편집(server `gh-radar-server-00061-fvv` · webapp `2234a1b5`, 갭 클로징 webapp `34f145b1`).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예.** 구 relay 는 두 필드를 모르는 채 44 를 보내고(서버는 빈 문자열 = 미설정으로 받는다) 87 의 새 슬롯을 무시한다 — FlatBuffers 말미 append 라 양방향 하위호환. 역순(relay 먼저)도 안전하다 — 구 서버는 새 슬롯을 무시하고 code 13 을 내지 않을 뿐이다. 운영 서버(KB 120/121) 배포는 gh-trade 가 사용자 확인 뒤 한다 — KB 쪽 매체 IP·MAC 등록 변경 필요 여부를 먼저 확인할 예정

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- relay: admin 연결에서 op 5(ListUsers) → 87 의 각 계좌에 `order_ip`/`order_mac` 키가 보인다(미설정은 빈 문자열). op 3 로 `order_ip="10.41.1.124"`·`order_mac="1c:fd:08:7d:97:8e"` 보내면 86 code 0 + 87 에 `010041001124`/`1CFD087D978E`. 같은 요청 재전송 → code 0 「변경 없음」. `order_ip` 만 → code 13
- 서버 로그(설정 뒤 첫 주문): `[KBBroker] 신규주문 전송 …` 은 그대로이고, 전문 바이트는 `order_probe`/골든 테스트로 확인(gh-trade 몫). 기동 로그 `[KBBroker] 계좌 라우팅 표 N건` 은 종전과 같다
- webapp: 계좌 편집 저장 뒤 목록에 정규화 표기(12자리·대문자 MAC)로 다시 그려지면 끝

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

1. code 7 문구 — 지금은 IP/MAC 불일치도 종전 「다른 지점번호/거래자ID 로 보유」 문구로 나간다(테스트 2곳·`e2e_admin_users.sh` 가 문장을 대조해 gh-trade 가 이번에 바꾸지 않았다). 「다른 지점번호/거래자ID/주문자 IP·MAC 으로 보유」 로 넓히는 게 좋겠는가? gh-radar 화면이 이 문장을 대조한다면 함께 바꾸고, 아니면 gh-trade 가 다음 quick 에서 바꾼다
2. 입력 표기 — 웹에서 점표기(`10.41.1.124`)와 콜론 MAC 을 받아 서버에 그대로 보내도 되고(서버가 정규화), 웹이 먼저 정규화해 보내도 된다. 어느 쪽이 편한가? 표시는 87 의 정규화값을 권한다
3. 사용자 PC IP/MAC 을 어드민 페이지에서 어떻게 받을지(수기 입력 전제) — 사용자가 `ipconfig /all` 값을 보내 주는 운영 절차면 충분한가

## 회신 (2026-10-11 · gh-radar Phase 30)

질문 순서대로:

1. **① code 7 문구 — 넓혀 달라 — 그리고 공유 계좌 IP/MAC 동시 반영 요청: `from-gh-radar/261011-shared-account-ipmac.md`.** gh-radar 웹 · relay 는 code 7 문장을 대조하지 않는다 — 서버 message 를 칩 · 카드 결과 줄에 원문 그대로 표시한다(제품 소스 grep 0건 · 테스트 `__tests__` · e2e 픽스처의 code 7 원문 상수는 목 응답이라 대조가 아니다). 문구를 넓혀도 gh-radar 변경은 없다(D-12). 실서버 UAT(2026-10-11)에서 공유 계좌(같은 KB 계좌를 여러 DMA 사용자가 보유 — `junysim` `37728502101`)의 IP/MAC 편집이 code 7 로 막혔고, 사용자 결정으로 공유 계좌는 IP/MAC 이 함께 바뀌어야 한다(D-18). 서버 쪽 op 3 원자적 전파를 261011 로 요청했고, gh-radar 는 편집 모드 「이 계좌를 함께 쓰는 사용자 … — 주문자 IP · MAC 이 함께 바뀌어요」 안내와 저장 뒤 개요 재조회를 배포했다(webapp `34f145b1`). gh-trade 가 261011 을 처리(quick-261011-n26 · `d5a20cfb` · 넓힌 문구 「다른 사용자가 같은 계좌를 다른 지점번호/거래자ID/주문자 IP·MAC 으로 보유하고 있습니다」)해 **KB120 에 배포했고, 2026-10-11 사용자가 KB120 에서 공유 계좌 IP/MAC 저장과 함께 쓰는 사용자 카드 동시 갱신을 확인했다.** KB121 은 gh-trade 배포 여부 확인 필요(261011 처리 결과 기준 KB121 은 현재 미가동). 웹 쪽 추가 변경은 없었다.
2. **② 입력 표기 — 그대로 보낸다.** 웹은 점표기 · 콜론 MAC 을 trim 만 해서 그대로 보내고 서버 정규화에 맡긴다(D-13). 화면은 87 정규화값을 사람이 읽는 표기(IP `10.41.1.124` · MAC `1C:FD:08:7D:97:8E`)로 보이고, 저장 · 비교는 정규화값(12자리 숫자 · 대문자 12 hex)이다(D-17 — 실서버 UAT 사용자 요청). 정규화 형식이 아닌 값은 원문 그대로 보인다.
3. **③ 사용자 PC IP/MAC — 수기 입력으로 충분.** 사용자가 `ipconfig /all` 값을 보내 주면 운영자가 Admin 계좌 카드 「편집」 에 수기 입력하는 절차로 충분하다(D-14).

덧붙여:

- 표시 지연 — relay 밖 도구로 값을 바꾸면 웹 표시는 다음 웹 저장(op 5 재조회) · relay admin 재접속 전까지 옛 값이다. 쓰기는 늘 새 87 로 계획하므로 값은 지워지지 않는다.
- R3-02 도 수정 — 다른 DMA 유저에 같은 계좌를 추가(op 1)하면 relay 가 새로 받은 87 에서 같은 정규화 계좌번호의 IP/MAC 을 찾아 그 요청에 되싣는다(D-16 · 요청에 값이 있으면 그 값 우선). 261011 처리 결과의 「계좌 추가는 같은 IP/MAC 을 실어 보내야 7 이 안 난다」 와 맞는다. 공유 계좌 IP/MAC **변경** 전파는 ① · 261011(gh-trade 서버) 몫 — gh-radar 는 다른 사용자에 op 를 보내지 않는다.
- 261011 답 반영 — 지점번호/거래자ID 비전파(다르면 code 7 · 같은 요청의 IP/MAC 전파도 취소) · 다른 사용자 BUSY 판정 없음: gh-radar 웹은 지점번호/거래자ID 편집 UI 가 없어 영향 없다.
- 실서버 확인(2026-10-11) — 계좌명만 저장 → op 5 재조회 뒤 op 3 code 0 · 같은 값 재저장 「변경 없음」 · IP 만 입력 시 저장 꺼짐 + 짝 오류 문구 · 카드 읽기 줄과 편집 초깃값이 `10.41.1.124` · `1C:FD:08:7D:97:8E` 표기 · 공유 계좌 편집 안내 줄 · (KB120) 공유 계좌 IP/MAC 저장 + 함께 쓰는 사용자 카드 동시 갱신.
- 남은 확인(비차단) — KB 주문 전문(TCHODR1000 orderInfo · macAddr)에 설정한 IP/MAC 이 실제로 실리는지 회선 관측은 아직 없다(gh-trade 로그는 설계상 값을 찍지 않음 · 지금은 gh-trade 단위 테스트 `server/tests/test_kb_endpoint_race.cpp` 만). 후보: KB증권 DMA 담당에 주문번호로 주문자식별정보/MAC 조회 요청 · KB120 주문 회선 패킷 캡처로 평문 필드 확인(gh-trade) · gh-trade 진단 로그로 값 없이 엔드포인트 출처(계좌 설정 vs 서버 캐시)만 남기기.
