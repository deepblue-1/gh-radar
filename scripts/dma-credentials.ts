#!/usr/bin/env tsx
/**
 * DMA 자격증명 관리자 수기 등록 스크립트 (Phase 15 Plan 05, D-18).
 *
 * gh-radar 계정 ↔ DMA 게이트웨이 로그인(user_id + 비밀번호) 매핑을 `dma_credentials`
 * 에 멱등 upsert 한다. 비밀번호는 AES-256-GCM(AAD = gh-radar user_id)으로 암호화해
 * 저장하며, 평문은 이 프로세스 메모리 밖으로 나가지 않는다.
 *
 * 웹앱에는 입력 UI 가 없다 (D-18 — v1 은 관리자 수기 등록). 이 스크립트가 유일한 등록
 * 경로이고, `dma_credentials` 행의 **존재 자체가 allowlist** 다 (D-12) — 행을 지우면
 * 그 사용자는 다음 wss 인증에서 `unauthorized` 상태를 받는다.
 *
 * 실행:
 *   # 등록/갱신 (비밀번호는 화면에 표시되지 않는 프롬프트로 입력)
 *   pnpm --filter @gh-radar/relay exec tsx ../scripts/dma-credentials.ts \
 *     --email <gh-radar 계정 이메일> --dma-user <DMA user_id>
 *
 *   # 등록 현황 (비밀번호 제외)
 *   pnpm --filter @gh-radar/relay exec tsx ../scripts/dma-credentials.ts --list
 *
 *   저장소 루트가 아니라 relay 워크스페이스를 통해 실행한다 — tsx·supabase-js·pino 가
 *   relay/node_modules 에만 있고 루트에는 없다.
 *
 * 필수 환경변수:
 *   SUPABASE_URL               - 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY  - service_role 키. `dma_credentials` 는 RLS 활성 + 정책
 *                                0개라 서비스롤 외에는 어떤 role 도 닿지 못한다 (D-18).
 *
 * 선택 환경변수:
 *   DMA_CRED_KEY   - base64 32B AES-256-GCM 키. 없으면 Secret Manager 의
 *                    `gh-radar-dma-cred-key` 최신 버전을 gcloud 로 읽는다.
 *   GCP_PROJECT_ID - gcloud 조회 시 사용할 프로젝트. 기본 "gh-radar".
 *
 * 동작 / exit code:
 *   - 같은 user_id 행이 있으면 갱신, 없으면 삽입 (onConflict: user_id) — 멱등. exit 0
 *   - 비밀번호는 **인자·환경변수로 받지 않는다.** stdin 프롬프트 전용이라 shell history
 *     에 남지 않는다 (T-15-05). 오타로 KB 계정이 잠기지 않도록 두 번 입력받아 대조한다.
 *   - 평문 비밀번호와 AES 키는 stdout/stderr 어디에도 출력하지 않는다.
 *   - 인자 오류 · 사용자 미존재 · 키 조회 실패 · DB 실패는 사유 출력 후 exit 1
 *
 * D-17 (중요):
 *   gh-radar 용 DMA `user_id` 는 **WinForms 클라이언트가 쓰는 값과 달라야 한다.**
 *   게이트웨이는 user_id + broker 로 세션을 합류시키므로 같은 값을 쓰면 전략 상태와
 *   계좌 범위가 서로 섞인다. 실제 값은 gh-trade 측 users.toml 운영 절차로 발급하며
 *   이 저장소에는 적지 않는다.
 *
 * 선행 조건:
 *   `dma_credentials` 테이블은 15-09 의 마이그레이션이 만든다. 그 전에 실행하면 DB 오류로
 *   끝난다(테이블 없음) — 스키마를 이 스크립트가 만들지 않는 것은 의도다.
 */
import { execFileSync } from "node:child_process";

import { encryptDmaPassword } from "../relay/src/store/credentials.js";
import { createRelaySupabase } from "../relay/src/store/supabase.js";

/**
 * 이 파일은 **relay 모듈을 통해서만** 외부 패키지에 닿는다.
 *
 * 저장소 루트에는 `node_modules` 가 없다(pnpm 워크스페이스라 의존성이 각 패키지에만 산다).
 * 여기서 `@supabase/supabase-js` 를 직접 import 하면 Node 가 이 파일 위치부터 위로
 * 올라가며 찾다가 루트에서 실패한다 — 어떤 cwd 로 실행하든 마찬가지다. 상대 경로로
 * relay 모듈을 부르면 그 안의 bare import 는 `relay/node_modules` 에서 풀린다.
 */
type Admin = ReturnType<typeof createRelaySupabase>;

/** Secret Manager 의 AES 키 시크릿 이름 (D-18 / 15-06 setup-relay-iam.sh 가 만든다). */
const CRED_KEY_SECRET = "gh-radar-dma-cred-key";

// ============================================================
// 인자 파싱
// ============================================================

type Args = { list: boolean; email?: string; dmaUser?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = { list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--list") {
      args.list = true;
    } else if (flag === "--email") {
      args.email = argv[(i += 1)];
    } else if (flag === "--dma-user") {
      args.dmaUser = argv[(i += 1)];
    } else if (flag === "--password" || flag === "--dma-password") {
      // 실수 방지 — 인자로 받는 순간 shell history 에 평문이 남는다 (T-15-05).
      fail("비밀번호는 인자로 받지 않습니다. 인자 없이 실행하면 프롬프트가 뜹니다.");
    } else {
      fail(`알 수 없는 인자: ${flag}`);
    }
  }
  return args;
}

function fail(message: string): never {
  console.error(`오류: ${message}`);
  process.exit(1);
}

function usage(): never {
  console.error(
    [
      "사용법:",
      "  --email <이메일> --dma-user <DMA user_id>   자격증명 등록/갱신",
      "  --list                                      등록 현황 출력",
      "",
      "비밀번호는 인자가 아니라 프롬프트로 입력합니다 (shell history 미기록).",
    ].join("\n"),
  );
  process.exit(1);
}

// ============================================================
// 비밀번호 입력 (화면 미표시)
// ============================================================

/**
 * 입력을 화면에 표시하지 않고 한 줄 읽는다.
 *
 * raw 모드로 직접 읽는 이유는 `readline` 의 출력 억제가 내부 API(`_writeToOutput`)에
 * 의존하기 때문이다. TTY 가 아니면(파이프) 그대로 한 줄 읽되, 그 경로는 호출 측 셸에
 * 평문이 남을 수 있으므로 권장하지 않는다.
 */
/**
 * 파이프 입력을 줄 단위로 담아 두는 큐.
 *
 * stdin 은 한 번 `end` 하면 다시 읽을 수 없다. 확인 입력까지 두 번 부르는 경로가 있으므로
 * 비-TTY 에서는 **한 번에 전부 읽어** 여기서 나눠 준다 — 두 번째 호출이 영원히 대기하는
 * 것을 막는다.
 */
let pipedLines: string[] | null = null;

function readAllStdin(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      buf += chunk;
    });
    process.stdin.on("end", () => resolve(buf.split("\n")));
    process.stdin.on("error", reject);
  });
}

async function readHidden(prompt: string): Promise<string> {
  const stdin = process.stdin;
  process.stderr.write(prompt);

  if (stdin.isTTY !== true) {
    pipedLines ??= await readAllStdin();
    process.stderr.write("\n");
    return pipedLines.shift() ?? "";
  }

  return new Promise((resolve, reject) => {
    let buf = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = (): void => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write("\n");
    };

    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          cleanup();
          resolve(buf);
          return;
        }
        if (ch === "\u0003") {
          // Ctrl-C
          cleanup();
          reject(new Error("입력이 취소되었습니다"));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          buf = buf.slice(0, -1);
          continue;
        }
        buf += ch;
      }
    };

    stdin.on("data", onData);
  });
}

// ============================================================
// AES 키 확보
// ============================================================

/**
 * base64 AES 키를 얻는다. env 우선, 없으면 Secret Manager.
 *
 * gcloud 출력은 **절대 화면에 내보내지 않는다.** 실패 시에도 stderr 원문을 그대로
 * 흘리지 않고 안내 문구로 바꾼다 — 실패 메시지에 키 조각이 섞여 나올 수 있다.
 */
function resolveCredKey(): string {
  const fromEnv = process.env.DMA_CRED_KEY;
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv.trim();

  const project = process.env.GCP_PROJECT_ID ?? "gh-radar";
  try {
    const out = execFileSync(
      "gcloud",
      [
        "secrets",
        "versions",
        "access",
        "latest",
        `--secret=${CRED_KEY_SECRET}`,
        `--project=${project}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const key = out.trim();
    if (key.length === 0) throw new Error("빈 응답");
    return key;
  } catch {
    console.error(
      [
        `Secret Manager 에서 AES 키를 읽지 못했습니다 (project=${project}).`,
        "",
        "확인 순서:",
        `  1) 시크릿이 있는가          gcloud secrets list --project=${project}`,
        "  2) 없다면 생성             scripts/setup-relay-iam.sh 실행",
        "  3) 권한이 있는가            실행 주체에 roles/secretmanager.secretAccessor 부여",
        "     (setup-relay-iam.sh 가 deployer SA 에 시크릿 단위로 바인딩한다)",
        "",
        "임시로 DMA_CRED_KEY 환경변수에 base64 32바이트 값을 직접 넣어 실행할 수도 있습니다.",
      ].join("\n"),
    );
    process.exit(1);
  }
}

// ============================================================
// Supabase
// ============================================================

function createAdmin(): Admin {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url === undefined || serviceKey === undefined) {
    fail("SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  }
  // relay 런타임과 같은 팩토리를 쓴다 — persistSession/autoRefreshToken 을 끈 서버용 설정.
  return createRelaySupabase(url, serviceKey);
}

/** 이메일로 `auth.users` id 를 찾는다. 페이지를 끝까지 훑는다(기본 50건 함정). */
async function findUserIdByEmail(admin: Admin, email: string): Promise<string> {
  const target = email.trim().toLowerCase();
  const perPage = 200;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) fail(`사용자 목록 조회 실패: ${error.message}`);

    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit !== undefined) return hit.id;
    if (users.length < perPage) break;
  }

  fail(`gh-radar 계정을 찾지 못했습니다: ${email} (먼저 웹앱에서 가입해야 합니다)`);
}

// ============================================================
// 명령
// ============================================================

async function runList(admin: Admin): Promise<void> {
  // 암호문 컬럼은 아예 select 하지 않는다 — 화면에도, 메모리에도 올리지 않는다.
  const { data, error } = await admin
    .from("dma_credentials")
    .select("user_id, dma_user_id, updated_at")
    .order("updated_at", { ascending: false });

  if (error) fail(`조회 실패: ${error.message}`);

  const rows = data ?? [];
  if (rows.length === 0) {
    console.log("등록된 매핑이 없습니다.");
    return;
  }

  console.log(`등록된 매핑 ${rows.length}건:`);
  for (const row of rows as Array<Record<string, string>>) {
    console.log(`  user_id=${row.user_id}  dma_user_id=${row.dma_user_id}  updated=${row.updated_at}`);
  }
}

async function runRegister(admin: Admin, email: string, dmaUser: string): Promise<void> {
  const userId = await findUserIdByEmail(admin, email);

  const first = await readHidden(`DMA 비밀번호 (${dmaUser}): `);
  if (first.length === 0) fail("비밀번호가 비어 있습니다.");

  // 확인 입력은 사람이 직접 칠 때만 받는다. 파이프 입력은 이미 확정된 값이라 되물을
  // 대상이 없고, 한 줄만 들어온 경우 빈 문자열과 비교해 항상 실패하게 된다.
  if (process.stdin.isTTY === true) {
    const second = await readHidden("한 번 더 입력: ");
    if (first !== second) {
      // 오타로 잘못 등록하면 relay 가 그 값으로 로그인해 KB 계정이 잠길 수 있다 (T-15-10).
      fail("두 입력이 다릅니다. 등록하지 않았습니다.");
    }
  }

  const credKey = resolveCredKey();
  const encrypted = encryptDmaPassword(first, userId, credKey);

  const { error } = await admin.from("dma_credentials").upsert(
    {
      user_id: userId,
      dma_user_id: dmaUser,
      dma_password_enc: encrypted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) fail(`저장 실패: ${error.message}`);

  console.log(`등록 완료: user_id=${userId} dma_user_id=${dmaUser}`);
  console.error(
    "참고: 이미 열려 있는 relay 세션은 즉시 갱신되지 않습니다 (SessionManager 축출 경로 미구현).",
  );
}

// ============================================================
// main
// ============================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const admin = createAdmin();

  if (args.list) {
    await runList(admin);
    return;
  }

  if (args.email === undefined || args.dmaUser === undefined) usage();
  await runRegister(admin, args.email, args.dmaUser);
}

main().catch((err: unknown) => {
  console.error(`실패: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
