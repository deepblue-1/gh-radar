# Quick Task 261101-okd: 상따 SOR 전환 — relay buy3_schema 7 · 웹 SOR 토글 (gh-trade Phase 45) - Context

**Gathered:** 2026-11-01
**Status:** Ready for planning

<domain>
## Task Boundary

gh-trade Phase 45 인박스 노트 `docs/inbox/from-gh-trade/261101-limitchaser-sor.md` 의 gh-radar 할 일 전부:

- relay: `SetLimitChaser.sor_buy`(vt 176) · `sor_sell`(vt 178) 송수신, `buy3_schema` 7 파생.
- 웹: 상따 설정 탭에 ○SOR 매수 · 매도 토글, NXT 비거래 종목 비활성, 서버가 보내는 에코 2건(요청 키 + 다른 거래소 키) 수용.
- 생성물 `relay/src/generated/StockDMA.fbs` · `relay/src/generated/stock-dma/set-limit-chaser.ts` 는 gh-trade 세션이 이미 재동기화해 작업 트리에 놓았다(마커 `21d692a1`) — 이 quick 의 첫 커밋에 경로 지정으로 포함한다. 손으로 고치지 않는다.
- 끝나면 인박스 노트 `status: done` · `done_commit` 채우기.

범위 밖: DB 마이그레이션(웹은 상따 설정을 DB 에 저장하지 않는다 — supabase 에 해당 칸 없음 확인) · 「호가창 합산 한 줄」 · 54 사유 줄 중복 표시(gh-trade D-24 deferred) · 복사(미러) 로직(서버 담당).

</domain>

<decisions>
## Implementation Decisions

### ○SOR 배치 (목업 채택: A)
- 매수주문 카드 제목줄과 매도주문 카드 제목줄에 기존 `GroupHeaderCheck` 그대로 「○ SOR」 체크를 둔다(후매수 「○ 자동」과 같은 부품 · 같은 위치 = 스위치 왼쪽). 새 부품 만들지 않는다.
- 접근성 이름: 「매수 SOR」 · 「매도 SOR」. 툴팁(hint): 켤 수 있을 때 「KRX·NXT 설정 공용」, NXT 비거래 종목이면 「NXT 미거래 종목」.
- 매수주문 · 매도주문 게이트가 꺼져도 흐리지 않는다(GroupHeaderCheck 지위 그대로).
- 채택 목업: `reference/mockup-sor.html` 변형 A.

### D-06 동반 규칙 (WinForms 동형 — gh-trade 질문에 「예」)
- 매수 SOR 을 OFF→ON 하는 조작은 매도 SOR 도 ON 으로 같이 싣고 한 제출에 두 필드(마스크 비트 50 · 51)를 모두 손댄 칸으로 보낸다.
- 매도 SOR 을 끄면 매도만 꺼진다(매수 SOR 유지). 매수 SOR 을 끄면 매수만 꺼진다.
- 기본 OFF. `/me` 기본설정 항목 없음(D-08).

### NXT 비거래 종목
- 기존 `nxtTradable`(relay `nxt.snap` ISIN 집합 · `webapp/src/lib/exchange-choices.ts`) 로 판정한다. 그 종목이면 두 ○SOR 을 비활성(OFF→ON 불가)으로 둔다 — 54 ERROR 를 일부러 유발하지 않는다.
- 이미 서버가 ON 으로 보낸 상태라면(이론상) 끄는 조작은 허용한다(끄기는 언제나 허용 규율).
- `nxtTradable` 가 아직 모름(null/undefined)이면 막지 않는다(exchange-choices 의 「모름 = 전체 허용」 관례와 같게).

### relay schema 7
- `lcBuy3SchemaOf`: 앞 여섯 조건 전부(postBuyAuto · extraBuyBurstRelease · 자동매도 4필드 · extraBuyAuto · changeMask) + `sorBuy`·`sorSell` **둘 다** 있을 때만 7. 하나라도 빠지면 6 이하 + 두 필드 미적재 + 경고(기존 단조성 가드와 같은 꼴).
- `buildSetLimitChaserReq` 는 schema 7 일 때만 `addSorBuy` · `addSorSell`.
- 에코 파서가 `sorBuy()` · `sorSell()` 을 읽어 웹 계약(`RelayLimitChaser`)에 싣는다.
- shared 변경 마스크 비트 표에 50 `sor_buy` · 51 `sor_sell` append(`LC_CHANGE_MASK_FIELDS` 52행 — gh-trade `LimitChaserChangeMask.h` `kMaskFields[52]` 대조 테스트가 이미 있음).

### 에코 2건
- relay hub · sweeper 는 키별 처리라 문제 없음(오케스트레이터 사전 확인). 웹 `lastLimitChaserEcho`(단일 슬롯) 소비처 `strategy-card.tsx` 가 키로 거르므로, 연달아 오는 두 키 에코가 각각 제 카드에서 확정되는지 리듀서/카드 테스트 1건으로 확인만 한다. 문제가 보이면 그때 고친다.

### 상태 문구
- 제목줄 상태 문구(무장 · 대기 등)는 바꾸지 않는다. 목업 A 의 「KRX·NXT 공용」 상태 문구는 넣지 않는다 — 켜진 ○SOR 체크 자체가 표시다(무장 상태 문구를 가리면 안 됨).

### Claude's Discretion
- 테스트 배치 · 헬퍼 이름 · 커밋 분할.

</decisions>

<specifics>
## Specific Ideas

- 선례: quick `261030-kpg`(change_mask · schema 6) 이 같은 경로(shared 비트 표 → relay envelope/protocol/fanout → webapp limit-chaser/use-lc-field-commit)를 탔다. 그 패턴을 복제한다.
- 선례: 후매수 「○ 자동」(quick-260929-vzy) `GroupHeaderCheck` 배선.

</specifics>

<canonical_refs>
## Canonical References

- `docs/inbox/from-gh-trade/261101-limitchaser-sor.md` — 계약 정본(①~⑥ · 배포 순서 · 확인 방법)
- `relay/src/generated/StockDMA.fbs` `SetLimitChaser` 말미 주석
- `.planning/quick/261030-kpg-setlimitchaser-change-mask-relay-buy3-sc/` — 직전 세대 전환 선례
- `reference/mockup-sor.html` 변형 A — 채택 UI

</canonical_refs>
