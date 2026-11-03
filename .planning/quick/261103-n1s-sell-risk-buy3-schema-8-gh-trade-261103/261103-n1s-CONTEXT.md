# Quick Task 261103-n1s: 상따 매도 ☐위험도 [N]% — relay buy3_schema 8 · 웹 반영 (gh-trade quick-261103-l41) - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning

<domain>
## Task Boundary

gh-trade 인박스 노트 `docs/inbox/from-gh-trade/261103-sell-risk.md` 의 gh-radar 할 일 전부(WinForms 동형):

- 생성물 재동기화: gh-trade `server/scripts/sync-relay-schema.sh` 를 `RELAY=/Users/alex/repos/gh-radar/relay` 로 실행(gh-trade 커밋 e96aef6e 의 fbs — `SetLimitChaser.sell_risk_enabled`(vt 180) · `sell_risk_pct`(vt 182) · `UserSettings.sell_risk_pct`(vt 36, optional ushort = null)). `relay/src/generated/**` 손편집 금지. 실행 전 `git diff --stat relay/src/generated` 로 다른 생성 변경이 섞이지 않는지 확인(현재 마커 681fb854).
- relay: lc.set → `buy3_schema` 8 파생 · 두 필드 적재 · 마스크 비트 52 `sell_risk_enabled` · 53 `sell_risk_pct`; 에코(60) 파서가 두 필드를 웹 계약에 싣기; UserSettings 42 송신 `sell_risk_pct`(있을 때만) · 84 수신 `sell_risk_pct`.
- 웹: 상따 매도주문 카드 ☐위험도 [N]% 행 · 매도주문 OFF 동반 끔 · 상한가 특징 표 「위험도(합)」(매도 SOR) · /me 기본설정 「위험도 기준」.
- 54 사유 `SellRisk` · 전략 이벤트 reason_code `SellRisk`(kind 6 group 4 · 취소 kind 7 cancel_reason 2) — 웹 전략 로그 / 사유 문구 표에 SellRisk 가 빠져 「알 수 없음」 류로 보이는지 확인하고 필요하면 추가(서버 문구 그대로).
- 끝나면 노트 `status: done` · `done_commit` 채우기(오케스트레이터가 함).

범위 밖: DB 마이그레이션(없음 — 노트 확인) · 배포(오케스트레이터가 gh-trade 서버 배포 뒤 relay → 웹 순서로 한다. executor 는 커밋까지만).

</domain>

<decisions>
## Implementation Decisions (사용자 확정 — 목업 `reference/mockup-sell-risk.html` 채택)

### ① 상따 매도주문 카드 「☐ 위험도 [N]%」
- `LC_SELL_GROUPS` 매도주문 그룹 rows 맨 끝(☐체결 아래)에 `kind: 'checkValue'` 행 하나: check `sellRiskEnabled` · field `sellRiskPct` · label 「위험도」 · unit `%` · 범위 1~999 · a11yPrefix 「매도」. desc(시트 설명)는 「상한가 거래량이 상한가 매수잔량의 이 비율 이상이면 매수 미체결을 모두 취소하고 매도해요」 수준(짧게).
- 체크는 기존 체크 필드처럼 누르면 즉시 제출(D-04). 매도주문 게이트 흐림 규칙은 ☐체결과 같다.
- **켜짐은 사람 수동만**: 새 창 · 새 종목 · 기본값 채움 때 `sellRiskEnabled` = false, `sellRiskPct` 만 기본설정(84 `sell_risk_pct`, 없으면 80). 매도주문 켬 · 매수 그룹 켤 때 매도 자동 체크 · 후매수 발동 등 어떤 동반 규칙도 위험도를 켜지 않는다.
- **매도주문 OFF 동반 끔(WinForms D-06③)**: 사람이 매도주문 스위치를 끌 때 ☐위험도가 켜져 있으면 같은 제출에서 `sellRiskEnabled=false` 로 싣고 changed 에 `sellRiskEnabled` 포함. 실패 롤백 시 함께 되돌린다(기존 동반 규칙 — SOR 매수→매도 동반(quick-261101-okd) 배선 꼴).
- **에코 = 서버 런타임 값**: 에코의 `sellRiskEnabled` 를 그대로 반영(발동 · 매도 송신 · 상한가 깨짐 · 일괄매도 · 재기동이 OFF 로 내림). `sellRiskPct` 는 에코가 1~999 일 때만 반영(0 = 구 서버 · 필드 없음 → 칸 유지). 편집 중인 칸은 덮지 않는 기존 규칙 그대로.

### ② 상한가 특징 표(85) 「위험도(합)」 — WinForms D-07 동형
- 매도 SOR(`sorSell`) 이 켜져 있으면 누적 행 위험도 칸을 같은 종목 KRX · NXT 85 중 **있는 것만** 더한 Σ`limitVolQty` ÷ Σ`qQty` 로 그린다. 문구 「위험도(합) N%」, Σ`qQty` 0 이면 「위험도(합) —」. 반올림은 단일 칸과 같은 함수(shared 기존 반올림).
- 매도 SOR 꺼짐이면 지금 그대로(단일 칸). 툴팁이 이 칸 문구를 쓰면 그대로 따라간다.
- 웹이 지금 다른 거래소 85 를 캐시하지 않으면 그 종목의 KRX · NXT 85 를 둘 다 보관하도록 최소 변경(키 = isin + 거래소). 표시용 산술뿐 — 판정은 서버.
- 구 relay(`limitVolQty` 키 없음) 갈래 A 에서는 합산하지 않고 기존 문구 유지.

### ③ /me 기본설정 「위험도 기준」
- `USER_SETTINGS_ROWS` 「매도」 묶음, 「매도 잔량추적」 바로 아래 `{ kind: 'value', key: 'sellRiskPct', label: '위험도 기준', unit: '%', group: '매도', id: 'me-lc-sell-risk-pct' }`.
- 범위 1~999 · 기본 80 — shared `USER_SETTINGS_RANGES` 에 추가.
- **burstRatioPct(quick-261102-epl) 규칙 그대로 복제**: 84 가 1~999 일 때만 그 값, 0 · 부재(구 서버)면 표시는 80 · 42 에는 키를 싣지 않는다. 사용자가 저장하면 그 값을 싣는다.

### relay schema 8
- `lcBuy3SchemaOf`: 앞 일곱 조건 전부(schema 7 까지의 조건 + `sorBuy`·`sorSell`) + `sellRiskEnabled`·`sellRiskPct` **둘 다** 있을 때만 8. 빠지면 7 이하 + 두 필드 미적재(기존 단조성 가드 꼴 · 경고).
- `buildSetLimitChaserReq` 는 schema 8 일 때만 `addSellRiskEnabled` · `addSellRiskPct`.
- shared 변경 마스크 비트 표 `LC_CHANGE_MASK_FIELDS` 에 52 `sell_risk_enabled` · 53 `sell_risk_pct` append(gh-trade `LimitChaserChangeMask.h` kMaskFields 대조 테스트 갱신 — 54칸).
- 웹 lc.set 은 이제 늘 두 필드를 싣는다(웹이 schema 8 클라가 됨). relay 테스트에 schema 7 재제출(필드 없음) 경로가 여전히 7 로 나가는지 단조성 테스트.

### Claude's Discretion
- 테스트 배치 · 헬퍼 이름 · 커밋 분할(권장: relay/shared 커밋 1 · 웹 커밋 1~2).

</decisions>

<specifics>
## Specific Ideas

- 선례(그대로 복제): quick `261101-okd`(SOR · schema 7 — relay bce42b6a · 웹 093da9f3), quick `261030-kpg`(change_mask · schema 6), quick `261102-epl`(UserSettings `burst_ratio_pct` optional — 84 부재 규칙).
- WinForms 원문: gh-trade e96aef6e `client/Forms/Trading/LimitChaserForm.cs`(chkSellRisk · MergedRiskText · 매도주문 OFF 동반) · `client/Forms/LimitChaserDefaultsDialog.cs`.
- 정본 규약: gh-trade `server/docs/protocol.md` 「SetLimitChaser ☐위험도 (quick-261103-l41)」 절 · `docs/strategy/limit-chaser.md` §0-3 6행.
- 메모리 주의: 동시 세션이면 vitest `--maxWorkers=2` · playwright `--workers=1`. 커밋은 경로 지정 add(`git add -A` 금지 — 다른 세션 산출물 섞임).

</specifics>

<canonical_refs>
## Canonical References

- `docs/inbox/from-gh-trade/261103-sell-risk.md` — 계약 정본
- `relay/src/generated/StockDMA.fbs` `SetLimitChaser` · `UserSettings` 말미(재동기화 후)
- `.planning/quick/261101-okd-sor-relay-buy3-schema-7-sor-gh-trade-pha/` — 직전 세대 전환 선례
- `reference/mockup-sell-risk.html` — 채택 UI

</canonical_refs>
