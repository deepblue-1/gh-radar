#!/usr/bin/env tsx
/**
 * Phase 29 Plan 24 — D-19 재암호화 이관: `dma_credentials`(AAD = 웹 user_id) → `dma_users`(AAD = dma_user_id).
 *
 * 29-25 배포 창 런북에서 **메인 세션이** 실행한다(옛 relay 정지 · 키 개명 push 뒤, 새 relay `--registry-cutover` 전).
 * 판정은 순수 함수 `planDmaUserMigration`(relay/src/store/dma-users-migrate.ts)이 하고, 이 스크립트는 읽기 · 출력 · 쓰기만 한다.
 *
 * 실행 (relay 워크스페이스로 — tsx · supabase-js 가 relay/node_modules 에만 있다. scripts/dma-credentials.ts 와 같다):
 *   pnpm --filter @gh-radar/relay exec tsx ../scripts/migrate-dma-users.ts           # dry-run (기본 · 쓰지 않음)
 *   pnpm --filter @gh-radar/relay exec tsx ../scripts/migrate-dma-users.ts --apply   # 실제 이관
 *   pnpm --filter @gh-radar/relay exec tsx ../scripts/migrate-dma-users.ts --help
 *
 * 필수 env: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY (모든 대상 표가 서비스롤 전용이다)
 * 선택 env: DMA_CRED_KEY(base64 32B — 없으면 Secret Manager `gh-radar-dma-cred-key` 를 gcloud 로 읽는다) · GCP_PROJECT_ID(기본 gh-radar)
 *
 * --apply 순서:
 *   ① `dma_users` upsert — ON CONFLICT DO NOTHING(이미 있는 행은 덮지 않는다)
 *   ② `app_users` 연결 — 기존 행은 `dma_user_id IS NULL` 일 때만 채우고(동시 Admin 저장을 덮지 않는다),
 *      없는 이메일은 trader 로 만든다(ON CONFLICT DO NOTHING)
 *   ③ 재조회 라운드트립 — 계획한 DMA id 의 저장 암호문을 AAD = dma_user_id 로 복호해 계획 암호문의 평문과 같은지,
 *      연결한 이메일의 `dma_user_id` 가 계획과 같은지 본다. 하나라도 어긋나면 exit 1.
 *
 * 출력 위생 (prohibition — test 로 검증): 비밀번호 · 암호문 · 키 · DMA id 원문 · 이메일 원문을 출력하지 않는다.
 * 계수 · 마스킹 id(`dm***(5)`) · 마스킹 이메일(`al***`) · 충돌 사유만 낸다. Supabase 오류도 원문 대신 code 만 낸다
 * (PostgREST details 에 행 값이 실릴 수 있다 — relay store/pg-error.ts 규율).
 *
 * exit: dry-run 은 충돌이 있어도 0(보고가 목적) · 인자 · env · 키 · 조회 · 쓰기 · 검증 실패는 1.
 */
import { execFileSync } from "node:child_process";

import { decryptDmaPassword } from "../relay/src/store/credentials.js";
import {
  maskDmaUserId,
  maskEmail,
  planDmaUserMigration,
  type DmaUserMigrationPlan,
  type MigrationAppUserRow,
  type MigrationCredentialRow,
  type MigrationIdentityRow,
} from "../relay/src/store/dma-users-migrate.js";
import { createRelaySupabase } from "../relay/src/store/supabase.js";

type Admin = ReturnType<typeof createRelaySupabase>;

const CRED_KEY_SECRET = "gh-radar-dma-cred-key";

const USAGE = [
  "사용법: pnpm --filter @gh-radar/relay exec tsx ../scripts/migrate-dma-users.ts [--apply | --help]",
  "  (인자 없음)  dry-run — 이관 계획의 계수 · 마스킹 id · 충돌 사유만 출력, 쓰지 않음",
  "  --apply      dma_users upsert(ON CONFLICT DO NOTHING) → app_users 연결/trader 생성 → 재조회 라운드트립 검증",
  "  --help       이 도움말",
  "env: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY (필수) · DMA_CRED_KEY(없으면 Secret Manager) · GCP_PROJECT_ID",
].join("\n");

function fail(message: string): never {
  console.error(`오류: ${message}`);
  process.exit(1);
}

/** Supabase 오류는 code 만 — message/details 에 행 값이 실릴 수 있다. */
function pgCode(err: unknown): string {
  if (err !== null && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code !== "") return code;
  }
  return "unknown";
}

function parseArgs(argv: string[]): { apply: boolean; help: boolean } {
  const out = { apply: false, help: false };
  for (const a of argv) {
    if (a === "--apply") out.apply = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else fail(`알 수 없는 인자: ${a}\n${USAGE}`);
  }
  return out;
}

/** base64 AES 키 — env 우선, 없으면 Secret Manager. gcloud 출력 · 오류 원문은 화면에 내지 않는다(dma-credentials.ts 와 같다). */
function resolveCredKey(): string {
  const fromEnv = process.env.DMA_CRED_KEY;
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv.trim();
  const project = process.env.GCP_PROJECT_ID ?? "gh-radar";
  try {
    const out = execFileSync(
      "gcloud",
      ["secrets", "versions", "access", "latest", `--secret=${CRED_KEY_SECRET}`, `--project=${project}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const key = out.trim();
    if (key.length === 0) throw new Error("빈 응답");
    return key;
  } catch {
    fail(
      `Secret Manager 에서 AES 키를 읽지 못했습니다 (project=${project}, secret=${CRED_KEY_SECRET}). ` +
        "실행 주체의 secretAccessor 권한을 확인하거나 DMA_CRED_KEY 에 base64 32바이트 값을 넣어 실행하세요.",
    );
  }
}

function createAdmin(): Admin {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url === undefined || url === "" || serviceKey === undefined || serviceKey === "") {
    fail("SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  }
  return createRelaySupabase(url, serviceKey);
}

// ============================================================
// 읽기
// ============================================================

async function loadCredentials(admin: Admin): Promise<MigrationCredentialRow[]> {
  const { data, error } = await admin
    .from("dma_credentials")
    .select("user_id, dma_user_id, dma_password_enc, gateway");
  if (error) fail(`dma_credentials 조회 실패 (code=${pgCode(error)})`);
  return ((data ?? []) as Array<{ user_id: string; dma_user_id: string; dma_password_enc: string; gateway: string | null }>).map(
    (r) => ({
      userId: r.user_id,
      dmaUserId: r.dma_user_id,
      passwordEnc: r.dma_password_enc,
      ...(r.gateway ? { gateway: r.gateway } : {}),
    }),
  );
}

async function loadIdentities(admin: Admin): Promise<MigrationIdentityRow[]> {
  const { data, error } = await admin.from("dma_gateway_identities").select("user_id, gateway, dma_user_id");
  if (error) fail(`dma_gateway_identities 조회 실패 (code=${pgCode(error)})`);
  return ((data ?? []) as Array<{ user_id: string; gateway: string; dma_user_id: string }>).map((r) => ({
    userId: r.user_id,
    gateway: r.gateway,
    dmaUserId: r.dma_user_id,
  }));
}

async function loadAppUsers(admin: Admin): Promise<MigrationAppUserRow[]> {
  const { data, error } = await admin.from("app_users").select("email, role, dma_user_id");
  if (error) fail(`app_users 조회 실패 (code=${pgCode(error)})`);
  return ((data ?? []) as Array<{ email: string; role: string; dma_user_id: string | null }>).map((r) => ({
    email: r.email,
    role: r.role,
    dmaUserId: r.dma_user_id,
  }));
}

async function loadExistingDmaUsers(admin: Admin): Promise<Set<string>> {
  const { data, error } = await admin.from("dma_users").select("dma_user_id");
  if (error) fail(`dma_users 조회 실패 (code=${pgCode(error)})`);
  return new Set(((data ?? []) as Array<{ dma_user_id: string }>).map((r) => r.dma_user_id));
}

/** 자격증명 주인들의 이메일(소문자 · trim). 페이지를 끝까지 훑는다(기본 50건 함정). */
async function loadEmails(admin: Admin, userIds: ReadonlySet<string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const perPage = 200;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) fail(`사용자 목록 조회 실패 (status=${String((error as { status?: unknown }).status ?? "unknown")})`);
    const users = data?.users ?? [];
    for (const u of users) {
      if (userIds.has(u.id) && typeof u.email === "string" && u.email.trim() !== "") {
        out.set(u.id, u.email.trim().toLowerCase());
      }
    }
    if (users.length < perPage) break;
  }
  return out;
}

// ============================================================
// 출력 (계수 · 마스킹만)
// ============================================================

function printPlan(plan: DmaUserMigrationPlan, creds: ReadonlyArray<MigrationCredentialRow>, apply: boolean): void {
  const dmaIds = new Set(creds.map((c) => c.dmaUserId));
  const creates = plan.links.filter((l) => l.create === "trader").length;
  const skippedConflicts = plan.conflicts.filter((c) => c.severity === "skipped");
  const warnings = plan.conflicts.filter((c) => c.severity === "warning");
  console.log(`DMA 자격증명 이관 계획 (${apply ? "--apply" : "dry-run — 쓰지 않음"})`);
  console.log(`  옛 자격증명 행:          ${creds.length} (DMA id ${dmaIds.size})`);
  console.log(`  dma_users 새 행:         ${plan.upserts.length}`);
  console.log(`  dma_users 이미 있음:     ${plan.skipped.filter((s) => s.reason === "ALREADY_EXISTS").length} (덮지 않음)`);
  console.log(`  app_users 연결:          ${plan.links.length} (새 trader 생성 ${creates})`);
  console.log(`  app_users 이미 연결:     ${plan.skipped.filter((s) => s.reason === "ALREADY_LINKED").length}`);
  console.log(`  충돌 — 이관 안 함:       ${skippedConflicts.length}`);
  console.log(`  충돌 — 경고(이관함):     ${warnings.length}`);
  for (const u of plan.upserts) console.log(`    + dma_users ${maskDmaUserId(u.dmaUserId)}`);
  for (const l of plan.links) {
    console.log(`    → ${maskEmail(l.email)} ⇢ ${maskDmaUserId(l.dmaUserId)}${l.create ? " (새 trader)" : ""}`);
  }
  for (const c of plan.conflicts) {
    console.log(`    ! ${c.dmaUserIdMasked} ${c.reason} (${c.severity === "skipped" ? "이관 안 함" : "경고 — 이관함"})`);
  }
  if (skippedConflicts.length > 0) {
    console.log("  ※ 이관 안 한 DMA id 의 사용자는 새 relay 에서 unauthorized 로 남는다 — Admin(/admin/users)에서 다시 연결한다.");
  }
}

// ============================================================
// 쓰기 + 재조회 검증
// ============================================================

/** 저장 암호문과 계획 암호문이 같은 평문인지(AAD = dmaUserId). 평문은 이 함수 밖으로 나가지 않는다. */
function samePlain(storedEnc: string, plannedEnc: string, dmaUserId: string, key: string): boolean {
  try {
    return decryptDmaPassword(storedEnc, dmaUserId, key) === decryptDmaPassword(plannedEnc, dmaUserId, key);
  } catch {
    return false;
  }
}

async function apply(admin: Admin, plan: DmaUserMigrationPlan, key: string): Promise<void> {
  // ① dma_users — 이미 있으면 그대로(ON CONFLICT DO NOTHING).
  if (plan.upserts.length > 0) {
    const { error } = await admin.from("dma_users").upsert(
      plan.upserts.map((u) => ({ dma_user_id: u.dmaUserId, password_enc: u.passwordEnc })),
      { onConflict: "dma_user_id", ignoreDuplicates: true },
    );
    if (error) fail(`dma_users 쓰기 실패 (code=${pgCode(error)}) — app_users 연결 전에 멈췄다`);
  }

  // ② app_users — 생성은 ON CONFLICT DO NOTHING · 기존 행은 dma_user_id 가 비어 있을 때만.
  let linkFailures = 0;
  for (const link of plan.links) {
    if (link.create === "trader") {
      const { error } = await admin
        .from("app_users")
        .upsert({ email: link.email, role: "trader", dma_user_id: link.dmaUserId }, { onConflict: "email", ignoreDuplicates: true });
      if (error) {
        linkFailures += 1;
        console.error(`  ✗ app_users 생성 실패 ${maskEmail(link.email)} (code=${pgCode(error)})`);
      }
    } else {
      const { error } = await admin
        .from("app_users")
        .update({ dma_user_id: link.dmaUserId, updated_at: new Date().toISOString() })
        .eq("email", link.email)
        .is("dma_user_id", null);
      if (error) {
        linkFailures += 1;
        console.error(`  ✗ app_users 연결 실패 ${maskEmail(link.email)} (code=${pgCode(error)})`);
      }
    }
  }

  // ③ 재조회 라운드트립.
  let verifyFailures = 0;
  if (plan.upserts.length > 0) {
    const ids = plan.upserts.map((u) => u.dmaUserId);
    const { data, error } = await admin.from("dma_users").select("dma_user_id, password_enc").in("dma_user_id", ids);
    if (error) fail(`dma_users 재조회 실패 (code=${pgCode(error)})`);
    const stored = new Map(((data ?? []) as Array<{ dma_user_id: string; password_enc: string }>).map((r) => [r.dma_user_id, r.password_enc]));
    for (const u of plan.upserts) {
      const enc = stored.get(u.dmaUserId);
      if (enc === undefined || !samePlain(enc, u.passwordEnc, u.dmaUserId, key)) {
        verifyFailures += 1;
        console.error(`  ✗ 라운드트립 불일치 ${maskDmaUserId(u.dmaUserId)} — 저장 행이 없거나 다른 비밀번호(동시 Admin 저장?)`);
      }
    }
  }
  if (plan.links.length > 0) {
    const emails = plan.links.map((l) => l.email);
    const { data, error } = await admin.from("app_users").select("email, dma_user_id").in("email", emails);
    if (error) fail(`app_users 재조회 실패 (code=${pgCode(error)})`);
    const got = new Map(((data ?? []) as Array<{ email: string; dma_user_id: string | null }>).map((r) => [r.email, r.dma_user_id]));
    for (const l of plan.links) {
      if (got.get(l.email) !== l.dmaUserId) {
        verifyFailures += 1;
        console.error(`  ✗ 연결 불일치 ${maskEmail(l.email)} ⇢ ${maskDmaUserId(l.dmaUserId)}`);
      }
    }
  }

  console.log(
    `결과: dma_users ${plan.upserts.length}행 · app_users ${plan.links.length}건 · ` +
      `쓰기 실패 ${linkFailures} · 검증 실패 ${verifyFailures}`,
  );
  if (linkFailures > 0 || verifyFailures > 0) {
    fail("이관 검증 실패 — 위 마스킹 항목을 확인하세요(재실행은 멱등이다).");
  }
  console.log("✓ 이관 완료 — 라운드트립 · 연결 재조회 일치");
}

// ============================================================
// main
// ============================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const admin = createAdmin();
  const key = resolveCredKey();

  const credentials = await loadCredentials(admin);
  const [identities, appUsers, existingDmaUsers, emails] = await Promise.all([
    loadIdentities(admin),
    loadAppUsers(admin),
    loadExistingDmaUsers(admin),
    loadEmails(admin, new Set(credentials.map((c) => c.userId))),
  ]);

  let plan: DmaUserMigrationPlan;
  try {
    plan = planDmaUserMigration({ credentials, identities, emails, appUsers, existingDmaUsers, keyB64: key });
  } catch (err) {
    // 키 길이 오류 메시지는 길이만 담는다(credentials.ts 규율) — 그래도 원문 대신 고정 문구.
    fail(err instanceof Error && err.message.startsWith("DMA_CRED_KEY") ? err.message : "이관 계획 실패");
  }

  printPlan(plan, credentials, args.apply);
  if (!args.apply) {
    console.log("dry-run 끝 — 쓰지 않았다. 충돌이 0 이면(또는 판단 뒤) --apply 로 다시 실행한다.");
    return;
  }
  await apply(admin, plan, key);
}

main().catch(() => {
  // 예외 원문을 싣지 않는다 — 스택 · 메시지에 행 값이나 키 조각이 섞일 수 있다.
  console.error("실패: 예기치 않은 오류 — 위 단계 출력에서 멈춘 지점을 확인하세요.");
  process.exit(1);
});
