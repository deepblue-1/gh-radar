# 35-18 Task 1 결과 (메인 세션 · 2026-10-28 02:27~02:34 KST)

배포 완료: gh-trade 43 **미배포**(사용자 결정 「gh-radar 먼저 배포」 — D-30 순서 예외) · DB 이미 적용 · relay 2f26aea4 smoke ok · server gh-radar-server-00068-5fj · 401×2 · push 5a81f174..2f26aea4(48커밋, Phase 35 전부) · Vercel Ready

- step 0: gh-trade STATE 「Phase 43 UAT 대기 — 미배포(43-DEPLOY.md, 120·119)」 · 인박스 261028-launch-plan-fix 「아직 미배포」. 43-06/43-07 포함 여부는 배포 때 판정. 사용자에게 「기다리기 / gh-radar 먼저 배포 / 멈춤」 물음 → 답 「gh-radar 먼저 배포」. 구 서버는 op 8/9 에 code 1 「알 수 없는 명령입니다」 → 웹 「서버 미지원」(35-19 판정) — 깨지지 않음, 쓸 수 없음.
- step 1: 수 02:27 KST · master · 미커밋 마이그레이션 없음.
- step 2: `supabase migration list --linked` — 20261028200000 · 20261028200100 이미 Remote(35-11 Task 1) → 「이미 적용」.
- step 3: 깨끗한 detached worktree(2f26aea4)에서 `deploy-relay.sh` → 이미지 `relay:2f26aea4` · healthz version 2f26aea4 · adminConns KB120/KYOBO119 ready · 87 적재 정상. `smoke-relay.sh` PASS 11 FAIL 0 SKIP 2(INV-9 · INV-10 — 늘 SKIP). 로그: msgType 89 프레임 드롭 WARNING 은 배포 전 버전(16746004)에도 있던 것 — 회귀 아님. 94 는 구 서버라 아직 오지 않음.
- step 4: 라이브 env(CORS_ALLOWED_ORIGINS · RELAY_INTERNAL_URL=http://10.10.0.5:8091)로 `deploy-server.sh` → 리비전 gh-radar-server-00068-5fj(이전 00067-5cq) · 스모크 15/15. 무인증 GET /api/admin/launch/plan 401 · PUT /api/admin/launch/plan/KB120/q16/Q 401(스모크 INV-8 429 풀린 뒤).
- step 5: `git push origin master` 5a81f174..2f26aea4 (35-10 ~ 35-19 + 35-11 문서) → Vercel production gh-radar-webapp-e4tw5fala Ready(02:32 생성).

남은 것: Task 2 라이브 UAT(A~E)는 gh-trade 43 이 120 · 119 에 배포된 뒤. Task 3 노트 닫기는 UAT 뒤.

# 35-18 Task 2 진행 (02:38~ KST)

- gh-trade 43 배포: 사용자 답 「예, 43 배포함」 — relay 로그 KB120 02:31:58 · KYOBO119 02:32:42 ECONNREFUSED 뒤 재접속(재기동). 43-07 포함 여부 미확인(E 판정 때 확인).
- A: 사용자 답 「보인다」(4패널 서버 계획 표시).
- B·C: 사용자 답 「저장됨」. launch_plan_changes 4행 모두 outcome ok —
  KB120 q16 Q [-347,-337,-317] → [-345,-333,-320] rev 2 (02:41:59) ·
  KB120 q16 K [-285,-275,-255] → [-290,-285,-270] rev 3 (02:44:19) ·
  KYOBO119 q16 Q [-531,-521,-501] → [-530,-520,-495] rev 2 (02:46:23) ·
  KYOBO119 q16 K [-400,-390,-370] → [-400,-390,-380] rev 3 (02:47:37).
- 남음: C②~④(서버 로그 · 마지막 변경 · 새로고침) · D(오늘 16:00) · E(N, 09:00:30).
- C②~④ · 지도 안내 · gh-trade 서버 로그: 사용자 답 「1번 다 확인」(02:51) — ① 1~4 OK.
- N 저장(E 준비) — launch_plan_changes:
  KB120 n0930 K [-245] → [-248] rev 5 (2026-10-27T17:50:06.038625+00:00)
  KB120 n0930 Q [-245] → [-248] rev 4 (2026-10-27T17:49:57.67791+00:00)
- 남음: D(오늘 16:00:01 이후 — 35-11 16:00 과 같이) · E(내일 09:00:31 이후, KB120 N −248 · 43-07 포함 여부 확인).

# 35-18 Task 2 마무리 (메인 세션 · 2026-10-30 09:10 KST)

- D(16:00) — 10-28 · 10-29 두 회차, `launch_pieces` source journal. 네 칸 첫 조각 = 직전 저장 계획 첫 값:
  10-28 KB120 K −290([−290,−286,−273] rev 11) · KB120 Q −348([−348,−345,−334] rev 10) · KYOBO119 K −400 · KYOBO119 Q −530 /
  10-29 KB120 K −290([−290,−286,−270] rev 12) · KB120 Q −350([−350,−347,−334] rev 13 — 10-28 16:05 저장) · KYOBO119 K −400([…,−375]) · KYOBO119 Q −530([…,−490]).
  조각 묶음도 계획 목록 근처(예 10-29 KB120 K −290,−289 | −286,−285 | −270,−270). kind 18 next_offset_us = 계획 첫 조각. 재기동 없음.
- E(09:00:30 N · 43-07 포함 확인) — 10-28 KB120 −248 · KYOBO119 −200 / 10-29 KB120 −249 · KYOBO119 −180 / 10-30 KB120 −249 · KYOBO119 −130 = 각 회차 직전 저장 값. 발사 뒤 저장(예 10-28 09:04 KYOBO −180)은 다음 회차부터.
- fix 노트 ④ — 재전송 조각 rc 원문: KYOBO119 N E127(retry 1~2) · KB120 N Q 10-29 w0 0515(retry 1).
- 사용자 답 원문(10-30): 화면 UAT 「맞다」.
- 발견(범위 6 — 35-11 몫): KYOBO119 A 재확인 재발사 expected_cum 090029000 · wire 0 부터 → launch_pieces/heads 키(fire_base 없음)에서 09:00:27 행 · 머리를 덮음. 웹도 A=09:00:27 만. 사용자 답 「고칠 때까지 노트 보류」 — 35-11 두 노트는 열어 둠.
