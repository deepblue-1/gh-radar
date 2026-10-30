# 35-11 Task 1 결과 (메인 세션 · 2026-10-28 01:33 KST)

Wave B 적용: 매핑 20261028200000 Remote · reproject 원문 0 → projected 0 errors 0 · status q16/n0930 백필 행 그대로(source journal 행 없음) · 전체 백필 35-09 적재(254/51) · push → 35-18(origin/master..master 30커밋, 범위 7 35-12~15 포함)

- 사전 점검: 수 01:33 KST(장 밖) · 미커밋 마이그레이션 없음 · Remote 에 더 늦은 버전 없음
- `supabase db push --linked --yes` → 20261028200000_launch_project_mapping · 20261028200100_launch_plan_changes 적용(35-12 이력 표도 같은 push — 35-18 Task 1 은 「이미 적용」)
- `pnpm --filter @gh-radar/shared build` → `launch-backfill.sh --reproject` 원문 kind 17·18 0건 → `--apply` projected 0 · errors 0
- 원문 0건 = gh-trade 가 kind 17·18 을 싣는 서버를 아직 배포하지 않음. Task 2(라이브 UAT) 전제조건 대기 — 배포 날짜는 gh-trade 가 알린다. 배포 뒤 원문이 쌓이면 라이브 경로가 바로 매핑된다(재해석 불필요).
- git push 안 함(D-30 · D-35).
- (02:34 추가) push 완료 — 35-18 Task 1 step 5 에서 5a81f174..2f26aea4 로 함께 나감(35-18-TASK1-RESULT.md).

# 35-11 Task 2 진행 (메인 세션 · 2026-10-30 09:10 KST)

- 라이브 적재: q16 10-28 · 10-29, n0930 10-28 ~ 10-30 — 당일 조각 · 머리 전부 source journal(--status · REST 조회). 계좌 · 주문번호 · rc 원문 채워짐. 16:00 · 09:00:30 화면 사용자 답 「맞다」(10-30).
- **결함 — 보류 사유:** KYOBO119 A 재확인 재발사(gh-trade 마감선 09:00:29.5 폴링)가 expected_cum 090029000 · entry_round 0 부터 kind 17·18 을 낸다(10-29 Q 1조각 · 10-30 K 1 · Q 2조각). `launch_pieces` PK `(trade_date, gateway, profile, fire_exchange, market, wire)` · `launch_heads` 키에 fire_base 가 없어 같은 wire 의 09:00:27 행과 머리를 덮었다 — 원문 seq 3160182(10-29 Q w0 53200003) · 3160185(머리) · 3372361/3372364(10-30 K) · 3372365~3372367(10-30 Q) 이 투영에서 사라짐. 웹 `isOrderTabRow` 도 A 를 09:00:27 만 받아 09:00:29 행을 숨긴다.
- 사용자 답 「고칠 때까지 노트 보류」 — 키(fire_base 포함 또는 wire 이어 붙이기) 수정 quick → reproject → 확인 뒤 Task 3(두 노트 닫기). 정식 노트에는 보류 회신 추가(10-30).
