# gh-radar webapp

Next.js 15 (App Router) 프론트엔드. 로컬 기동은 저장소 루트의 `./dev.sh` 가 담당하며
webapp 은 **:3100** 을 쓴다(루트 규약 — 3000 아님).

```bash
./dev.sh --webapp-only        # webapp(:3100) 만
./dev.sh                      # webapp(:3100) + server(:8080)
./dev.sh --with-relay         # + relay(ws :8090 / 내부 :8091) — mock 게이트웨이 필요
```

계정·시크릿 발급, Supabase 프로젝트 설정, E2E 테스트 유저 프로비저닝 등 **셋업 절차 전체**는
[`SETUP.md`](./SETUP.md) 를 본다. 이 문서는 **환경변수 표**만 유지한다.

---

## 환경변수

`.env.local` 은 gitignore 대상이다. 템플릿은 [`.env.local.example`](./.env.local.example) 를 복사해 쓴다.

| 변수 | 로컬 기본값 | 프로덕션(Vercel) | 비고 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8080` | Cloud Run server URL | `.env.development` 에 로컬 기본값이 커밋돼 있다 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 동일 | Auth + 관심종목. `SETUP.md` §3 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key | 동일 | **service_role key 는 절대 넣지 않는다** |
| `NEXT_PUBLIC_RELAY_WS_URL` | `ws://localhost:8090/ws` | `wss://dma.jx1.io/ws` | 실시간 호가창(Phase 15 · D-41). 미설정 시 로컬 기본값으로 폴백한다 |

### ⚠️ `NEXT_PUBLIC_*` 값에 **개행이 섞이면 클라이언트 번들이 깨진다**

`NEXT_PUBLIC_*` 은 빌드 시점에 번들로 **문자열 그대로 인라인**된다. Vercel 대시보드에
값을 붙여넣을 때 끝에 엔터가 함께 들어가면 런타임에 `new WebSocket("wss://…\n")` 이 되어
`SyntaxError` 로 터진다(실제 사고 선례가 있다).

등록 후 반드시 마지막 바이트를 확인한다:

```bash
vercel env pull .env.vercel.check
grep '^NEXT_PUBLIC_RELAY_WS_URL' .env.vercel.check | tr -d '\n' | tail -c1 | xxd -p
# → 0a 가 나오면 개행이 들어간 것. 값의 마지막 문자는 `s` 여야 한다.
rm .env.vercel.check
```

값만 확인하고 끝내지 말 것. **빌드 산출물까지 대조해야** 인라인이 의도한 문자열로 일어났음이
증명된다 — 배포 후 프로덕션이 내려주는 chunk 를 받아 로컬 `.vercel/output` 산출물과 `cmp` 로
비교하면 `\n` 오염과 값 불일치를 한 번에 잡는다(Phase 15 Plan 14 에서 이 방식으로 확인했다).

> **CLI 버전 주의.** Vercel CLI **50.x 에서는 Preview 환경 등록이 막힌다** —
> `vercel env add … preview --value --yes` 를 인식하지 못하고 `git_branch_required` 로 실패한다.
> `npx vercel@latest` 로 우회하거나 CLI 를 59.x 이상으로 올린 뒤 등록한다.

코드 쪽 이중 방어로 `src/lib/relay-url.ts` 의 `resolveRelayWsUrl()` 이 `.trim()` 을 걸고
스킴이 `ws:`/`wss:` 가 아니면 즉시 throw 한다. 그래도 **등록 시점 검증을 건너뛰지 않는다** —
`.trim()` 은 값 안쪽에 섞인 개행까지 지워 주지는 않는다.

### 배포 메모

`scripts/vercel-ignore-build.sh` 가 docs-only push 를 skip 하므로, env 만 바꾼 뒤에는
자동 배포를 기다리지 말고 저장소 루트에서 수동 배포한다.

```bash
vercel pull && vercel build && vercel deploy --prebuilt
```

---

## 테스트

```bash
pnpm --filter webapp test          # vitest (단위/컴포넌트 — src/**/__tests__ co-located)
pnpm --filter webapp test:e2e      # Playwright (e2e/specs)
```

- 단위/컴포넌트 테스트는 **`src/**/__tests__/` co-located** 다. `webapp/tests/` 는 vitest
  include 에 걸리지 않아 조용히 실행되지 않는다.
- E2E 는 `.env.test.local` 의 값을 `playwright.config.ts` 가 **허용 목록만** 읽어 들인다
  (`SUPABASE_SERVICE_ROLE_KEY` 는 의도적으로 제외 — dev 런타임에 주입되면 안 된다).
- 호가창 E2E(`e2e/specs/orderbook.spec.ts`)는 픽스처가 **로컬 relay + 스텁 게이트웨이**를
  직접 띄운다. 실서버·KB 게이트웨이에 접속하지 않으며 relay wss 포트 **8090** 을 점유하므로,
  `./dev.sh --with-relay` 로 relay 를 띄워 둔 상태라면 먼저 내려야 한다.
