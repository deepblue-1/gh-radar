# Phase 30: 인박스 KB 계좌별 주문자 IP/MAC - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning

<domain>
## Phase Boundary

운영자가 웹 Admin 사용자 편집 시트의 계좌 카드에서 **기존 계좌의 계좌명과 KB 계좌의 주문자 IP·MAC 을 고쳐 저장**할 수 있고, relay 밖(gh-trade 도구)에서 설정한 IP/MAC 이 웹 계좌 편집 한 번에 지워지지 않는다(R3-01 해제 → KB 운영 서버 IP/MAC 설정 보류 해제). gh-trade 인박스 `261010-kb-order-ip-mac.md` 의 남은 일(항목 4 웹 입력칸 · R3-01 · 질문 3개 회신)을 끝내고 노트를 닫는다.

요구사항: IPMAC-01 ~ IPMAC-05. **IPMAC-05(계좌명 편집)는 이번 discuss 에서 사용자 요청으로 추가**(REQUIREMENTS · ROADMAP 반영 완료).

범위 밖: DB 스키마 변경(로드맵 배포 순서 「DB 변경 없음」) · 계좌 생성 경로(「+ 계좌 추가」 · 「+ 사용자」)의 IP/MAC 입력 · 공유 계좌(같은 계좌번호를 여러 DMA 사용자가 보유) 일괄 반영 · gh-trade 서버 쪽 code 7 문구 변경(gh-trade 몫).

</domain>

<decisions>
## Implementation Decisions

### 계좌 편집 모양 (목업 채택: `reference/mockup-account-edit.html` 변형 **B**)
- **D-01: 「편집」 → 그 카드가 편집 모드로 펼쳐진다.** 평소 계좌 카드는 지금처럼 읽기 전용(제목줄 = 증권사 · 계좌번호 · 계좌명 + 「편집」 · 「제거」). 「편집」 을 누르면 그 카드 안에 계좌명 입력칸, KB 면 「주문자 IP」·「MAC 주소」 2칸(2열 그리드) + 도움말 한 줄 + 「취소 · 저장」. 한 번에 한 카드만 편집 모드. 편집 중 카드는 강조 테두리.
- **D-02: 계좌명 · IP · MAC 은 「저장」 1회 = PUT 1건(계좌 단위)** — IP/MAC 이 짝(둘 다 적거나 둘 다 비움)이라 칸별 즉시 저장 대신 카드 저장. 서버 체크 토글 · 주문 서버 세그먼트 · 제거의 **즉시 저장(Phase 29 D-15)은 그대로** 둔다. 저장 버튼은 검증 오류가 있거나 바뀐 게 없으면 비활성.
- **D-03: 교보 계좌는 계좌명만 편집** — IP/MAC 칸 대신 「교보 계좌는 주문자 IP · MAC 해당 없음」 한 줄(Phase 29 D-23 ③ 「해당 없음」 동형).
- **D-04: 클라 검증 = 서버 규칙 그대로** — IP 12자리 숫자 또는 a.b.c.d(각 0~255) · MAC 12 hex(`:`·`-` 허용 · 대소문자 무관) · 둘 다 적거나 둘 다 비움. 틀리면 해당 칸 빨간 테두리 + 도움말 자리에 오류 한 줄, 저장 막음. 둘 다 비우고 저장 = 미설정으로 되돌리기(op 3 빈 문자열).
- **D-05: 도움말 한 줄(고정 문구 취지)** — 「같은 서버의 두 계좌가 서로 체결될 수 있으면 계좌마다 서로 다른 사용자 PC 의 IP · MAC 을 적으세요(ipconfig /all).」
- **D-06: 결과 표시** — 성공은 기존 서버 칩(반영됨)으로, 같은 값 재저장은 「변경 없음」, 실패(code 13 BAD_ORDER_ENDPOINT 포함)는 카드 안 오류 줄에 **서버 문구 그대로**(IPMAC-03 · D-23 ④ 동형 · 토스트 없음). 실패 시 편집 모드와 입력값 유지.
- **D-07: 입력 표기는 그대로 보낸다** — 웹은 점표기·콜론 MAC 을 정규화하지 않고 보내고 서버 정규화에 맡긴다. 저장 뒤 표시는 87 의 정규화값(12자리 · 대문자 MAC).

### 계좌 생성 경로
- **D-08: 「+ 계좌 추가」 폼 · 「+ 사용자」 생성 시트에는 IP/MAC 칸을 넣지 않는다.** IP/MAC 은 만든 뒤 카드 「편집」 에서만(입력 자리 1곳 — 검증·도움말·테스트 한 벌). 새 계좌는 미설정(서버 NIC 값)으로 생긴다.

### 계좌 카드의 IP/MAC 표시 (KB 만)
- **D-09: 읽기 전용 카드에 한 줄** — 설정됨: 「주문자 IP `010041001124` · MAC `1CFD087D978E`」 / 미설정: 흐린 「주문자 IP · MAC 미설정(서버 NIC 값)」. 지점·트레이더 줄 아래.
- **D-10: 등록 서버 간 87 값 불일치(예: KB120 ≠ KB121)** — 그 계좌의 (유효) 주문 서버 87 값을 보여주고 아래에 경고색 한 줄 「KB121 은 다른 값(…) — 편집에서 저장하면 두 서버가 같아져요」. 편집 칸 초깃값도 주문 서버 값. 저장은 등록 서버 전부에 같은 값을 op 3 으로 보낸다.

### 공유 계좌 · code 7
- **D-11: 공유 계좌(같은 계좌번호를 다른 DMA 사용자도 보유)는 특별 처리하지 않는다.** 한 사용자 카드에서 IP/MAC 을 바꿔 서버가 code 7 ACCOUNT_CONFLICT 로 거절하면 서버 문구를 그대로 보여주고 끝(일괄 반영 없음).

### gh-trade 질문 회신 (IPMAC-04 — 인박스 노트에 적고 `status: done` · `done_commit`)
- **D-12: ① code 7 문구 — 「넓혀 달라」.** gh-radar 웹·relay 는 code 7 문장을 대조하지 않는다(서버 message 를 칩/오류 줄에 그대로 표시). 「다른 지점번호/거래자ID/주문자 IP·MAC 으로 보유」 로 넓혀도 gh-radar 쪽 변경 없음 — gh-trade 가 다음 quick 에서 바꾼다.
- **D-13: ② 입력 표기** — 웹은 점표기·콜론을 그대로 보내고 서버 정규화에 맡긴다, 표시는 87 정규화값(D-07).
- **D-14: ③ 사용자 PC IP/MAC 수집** — 사용자가 `ipconfig /all` 값을 보내 주면 운영자가 Admin 카드 편집에 수기 입력하는 절차로 충분.

### R3-01 (IPMAC-01)
- **D-15: relay 는 op 1/3 을 보내기 직전 그 서버에 op 5(ListUsers)로 87 을 재조회**해 최신 `order_ip`/`order_mac` 으로 계획한다(이번 웹 편집이 IP/MAC 을 실어 보내는 경우는 그 값이 우선 — 기존 planner `withServerEndpoint` 규칙). 배포 확인 뒤 인박스 노트의 「KB 운영 서버 값 설정 보류 권고」를 해제로 적는다.

### Claude's Discretion
- IP/MAC 을 DB 의도에 저장하지 않고 PUT 요청에서 relay planner 로 넘기는 경로 설계(87 이 정본 · DB 변경 없음 제약 안에서)
- 개요(`AdminAccountView`)에 서버별 `orderIp`/`orderMac` 을 싣는 방식 · 불일치 판정 위치(shared 파생 vs 웹)
- 계좌명 빈 값 저장 허용 여부(추가 폼이 「계좌명(선택)」 이면 같게) · 길이 상한
- 편집 중 다른 카드의 「편집」 을 누를 때 동작(현재 카드 취소 후 전환 등) · 「취소」 시 입력 폐기
- op 5 재조회 실패/타임아웃 시 처리(보내지 않고 실패 칩 vs 캐시로 진행) — 단 「relay 밖 값을 지우지 않는다」 가 우선
- 멱등 비교(`sameValues`)에 IP/MAC 을 넣는 방식 — 이미 의도에 값이 있을 때만 비교하는 GC-02 규칙 유지

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 계약 (gh-trade 인박스)
- `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md` — 와이어 변경(AdminAccount 슬롯 14/16 · code 13 · code 7 범위 확장 · op 3 멱등 7필드 · IP/MAC 만 바뀌면 BUSY 미판정 · 비우기), 확인 방법, 질문 3개, 29-47 진행 줄
- `docs/inbox/from-gh-trade/README.md` — 노트 닫기 형식(`status: done` · `done_commit` · 경로 지정 커밋)
- `relay/src/generated/StockDMA.fbs` — 생성물 사본(이미 동기화됨)

### 화면
- `.planning/phases/30-kb-ip-mac/reference/mockup-account-edit.html` — **채택 목업 B**(카드 펼침 · 입력칸 · 도움말 · 미설정 줄 · 저장 결과 시뮬). A/C 는 기각
- `.planning/milestones/v1.0-phases/29-dma-multi-server-admin/29-CONTEXT.md` — D-14(목록+시트) · D-15(즉시 저장 · 결과 칩) · D-23 ③④⑤(교보 해당 없음 · BUSY 문구 그대로 · 87 전용 계좌)
- `.planning/milestones/v1.0-phases/29-dma-multi-server-admin/reference/mockup-g1-account-order-server.html` — 계좌 카드 토큰·틀 원본

### R3-01 배경
- `.planning/milestones/v1.0-phases/29-dma-multi-server-admin/29-REVIEW-R3.md` · `29-REVIEW-R3-DISPOSITION.md` — R3-01(relay 87 캐시 되싣기로 relay 밖 값 소실) 원문과 처분
- `.planning/milestones/v1.0-phases/29-dma-multi-server-admin/29-53-SUMMARY.md` — 「켜기 전 결정」(두 번째 서버 관련 — 이번 범위 밖, 참고만)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `webapp/src/components/admin/account-editor.tsx` — `AccountRow`(카드 · 서버 토글 · 주문 서버) · `AccountTitle`(제목줄 children 슬롯 → 「편집」 버튼) · `BranchTrader`(아래에 IP/MAC 줄) · `accountInputOf` · `useFieldSave`(한 번에 1건 · 마지막 값 대기 · flash) · `ACCOUNT_EDITOR_TEXT` · `ERROR_LINE`/`WARN_LINE`/`NOTE` 클래스 · `AccountAddForm`(입력 칸·검증 패턴)
- `webapp/src/lib/admin-api.ts` `putDmaAccount` — 계좌 PUT(upsert, `{ account, servers }`) — 이름 변경은 servers 그대로 두고 이 경로
- `packages/shared/src/admin.ts` — `AdminAccountFields`(이미 `orderIp?`/`orderMac?`) · `AdminAccountInput`(IP/MAC 없음 → 확장 대상) · `AdminAccountView`(IP/MAC 없음 → 확장 대상) · `sameValues`/`diffServerAccounts`(GC-02: 의도에 값 있을 때만 IP/MAC 비교) · code 13 칩 판정(이미 failed)
- `relay/src/admin/planner.ts` — `fieldsOf`(의도 행에 orderIp 있으면 옮김) · `withServerEndpoint`(의도 쌍 우선, 아니면 87 값)
- `relay/src/admin/admin-conn.ts` — op 5 ListUsers 송신(접속마다 1건 · `awaiting: "snapshot"`) → 재조회 재사용 지점
- `relay/src/dma/envelope.ts` — AdminAccount 빌더(order_ip/order_mac) · 87 파서(비어 있지 않을 때만 키)
- `relay/src/admin/types.ts` — code 13 BAD_ORDER_ENDPOINT 라벨(이미 있음)

### Established Patterns
- 결과는 서버별 칩 + 카드 안 오류 줄(토스트 없음) · 서버 한국어 message 그대로
- 87 전용 값(IP/MAC)은 DB 의도에 없고 87 이 정본 — 의도에 없으면 보존
- 컴포넌트 테스트 `webapp/src/components/admin/__tests__/account-editor.test.tsx`, shared `packages/shared/src/__tests__/admin.test.ts`, relay `relay/src/dma/__tests__/envelope.test.ts`

### Integration Points
- 웹 PUT → relay admin API(`relay/src/admin/admin-api.ts`) → dispatcher → planner → admin-conn op 3
- 개요 파생(`deriveAdminUsersOverview`)이 87 스냅샷 → `AdminAccountView` 를 만든다 — 서버별 IP/MAC 노출 지점
- 배포 순서: DB 없음 → relay 배포·확인 → webapp push(= 프로덕션). relay 막히면 push 금지

</code_context>

<specifics>
## Specific Ideas

- 목업 B 의 문구·배치를 그대로 따른다: 「편집」 버튼은 「제거」 왼쪽, 편집 모드에서는 제목줄에 계좌명 대신 입력칸이 본문에, IP/MAC 2열.
- 확인 시나리오(인박스 「확인 방법」): `10.41.1.124` · `1c:fd:08:7d:97:8e` 저장 → 86 code 0 → 카드에 `010041001124` · `1CFD087D978E`; 같은 값 재저장 → 「변경 없음」; IP 만 → 클라에서 막힘(서버로 가면 code 13 문구).
- 통정거래 경고 배경(2026-10-07 SAMG엔터 · KB120 두 계좌 상호 체결)이 도움말·미설정 표시의 이유.

</specifics>

<deferred>
## Deferred Ideas

- 공유 계좌(같은 계좌번호 · 여러 DMA 사용자) IP/MAC 일괄 반영 — 필요해지면 별도 quick/phase. 지금은 code 7 문구 표시만(D-11).
- 계좌 생성 시 IP/MAC 입력(D-08 에서 제외).

</deferred>

---

*Phase: 30-kb-ip-mac*
*Context gathered: 2026-10-11*
