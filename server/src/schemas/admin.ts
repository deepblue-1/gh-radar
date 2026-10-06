import { z } from "zod";
import { SERVER_KEY_RE, brokerOfServerKey, isValidAccountNoInput } from "@gh-radar/shared";

/**
 * Phase 29 (D-01 · D-03 · D-04) — Admin 허용 / 역할 쓰기 입력 검증.
 *
 * 허용 표(`app_users`)의 키는 **이메일(소문자 · 앞뒤 공백 없음)** — 표의 CHECK 와 같은 정규화를 여기서 먼저 한다.
 * 그래야 「Lee@Gmail.com」 과 「lee@gmail.com」 이 다른 행이 되지 않는다(DB CHECK 위반 500 대신 정상 저장).
 * DMA 필드(`dma`)는 29-13 이 `AdminUserUpsertBody` 를 넓혀 싣는다 — 형식 검사는 relay(29-11)와 같은 규칙을 여기서
 * **먼저** 한다(relay 까지 가서 400 을 받기 전에, 그리고 relay 가 없을 때도 같은 문구로).
 *
 * ★ zod 메시지에 입력값을 싣지 않는다 — 비밀번호 · 계좌번호가 400 응답 · 로그에 나가지 않게(문구는 고정 한국어).
 */

/** 역할 3단(D-02) — shared `AppRole` 과 같은 값. */
export const AppRoleSchema = z.enum(["admin", "trader", "viewer"]);

/** 이메일 정규화: trim → 소문자 → ≤ 254(RFC 5321 경로 상한) → 형식. */
const EmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

// ─────────────────────────────────────────────────────────────────────────────
// DMA 입력 (D-16 · D-23 ③) — relay `POST /internal/admin/dma-users` 와 같은 규칙
// ─────────────────────────────────────────────────────────────────────────────

/** 증권사 2종 — shared `DmaBroker`. */
export const DmaBrokerSchema = z.enum(["KB", "KYOBO"]);

/** 서버 키(KB120 · KYOBO119 …) — `dma_servers.key` CHECK 와 같은 정규식(shared `SERVER_KEY_RE`). */
export const ServerKeySchema = z.string().regex(SERVER_KEY_RE, "서버 키 형식이 아니에요(KB120 · KYOBO119 처럼)");

/**
 * DMA id — 1~8바이트(UTF-8 · gh-trade users.toml 키 · 서버 고정폭 필드) · 공백 불가.
 * 다듬지(trim) 않는다 — 공백이 섞인 입력은 다른 id 로 조용히 바꾸지 않고 거부한다(relay 와 같은 판정).
 */
export const DmaUserIdSchema = z
  .string()
  .min(1, "DMA id 를 입력하세요")
  .refine((s) => !/\s/.test(s), "DMA id 에는 공백을 넣을 수 없어요")
  .refine((s) => Buffer.byteLength(s, "utf8") <= 8, "DMA id 는 8바이트 이하예요");

/** DMA 비밀번호 — 1~64자. Express 는 암호화 · 저장하지 않는다(relay 로만 전달 · Phase 15 D-19). */
export const DmaPasswordSchema = z
  .string()
  .min(1, "비밀번호를 입력하세요")
  .max(64, "비밀번호는 64자 이하예요");

/**
 * 계좌 1건(`AdminAccountInput`). 계좌번호는 trim 뒤 1~12자(넘으면 자르지 않고 거부 — shared `isValidAccountNoInput`),
 * 정규화(" 00123" → "123")는 relay 가 한다. KB 는 지점 5자 · 트레이더 6자, **교보는 둘 다 빈 값으로 바꿔** 보낸다(D-23 ③ —
 * 화면이 KB 때만 입력 칸을 보이지만, 남은 값이 실려 와도 서버 users.toml 에 쓰레기가 들어가지 않게).
 */
export const AdminAccountInputSchema = z
  .object({
    broker: DmaBrokerSchema,
    accountNo: z.string().refine(isValidAccountNoInput, "계좌번호는 1~12자예요"),
    name: z.string().trim().max(40, "계좌 이름은 40자 이하예요").default(""),
    branchNo: z.string().default(""),
    traderId: z.string().default(""),
    priority: z.number().int().min(0).max(999).default(0),
  })
  .superRefine((a, ctx) => {
    if (a.broker !== "KB") return;
    if (a.branchNo.length !== 5) {
      ctx.addIssue({ code: "custom", path: ["branchNo"], message: "KB 지점번호는 5자예요" });
    }
    if (a.traderId.length !== 6) {
      ctx.addIssue({ code: "custom", path: ["traderId"], message: "KB 트레이더 id 는 6자예요" });
    }
  })
  .transform((a) => (a.broker === "KYOBO" ? { ...a, branchNo: "", traderId: "" } : a));

/** 등록 서버 — 1~8개 · 서버 키 형식. 계좌 증권사와의 일치는 바깥 스키마가 본다. */
const ServerListSchema = z
  .array(ServerKeySchema)
  .min(1, "등록 서버를 1개 이상 고르세요")
  .max(8, "등록 서버는 8개 이하예요");

/** 등록 서버의 증권사 접두가 계좌 증권사와 같은가 — 다르면 path `servers` 에 이슈. */
function checkServersMatchBroker(
  v: { account: { broker: string }; servers: string[] },
  ctx: z.RefinementCtx,
): void {
  const bad = v.servers.find((k) => brokerOfServerKey(k) !== v.account.broker);
  if (bad !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["servers"],
      message: `${bad} 는 ${v.account.broker} 계좌의 서버가 아니에요`,
    });
  }
}

/** `AdminDmaInput` — DMA id · 비밀번호 · 첫 계좌 · 등록 서버(D-16 「전부 필수」). */
export const AdminDmaInputSchema = z
  .object({
    dmaUserId: DmaUserIdSchema,
    password: DmaPasswordSchema,
    account: AdminAccountInputSchema,
    servers: ServerListSchema,
  })
  .superRefine(checkServersMatchBroker);

/**
 * POST /api/admin/users — 사전 등록 · 승인 대기 승인 · viewer 생성 · (trader/admin 이면) DMA 연결 한 번에(D-16).
 * viewer 는 DMA 를 가질 수 없다 — viewer + dma 는 400. admin/trader 인데 dma 가 없으면 「DMA 연결 없음」 사용자(편집 시트에서 연결).
 */
export const AdminUserUpsertBody = z
  .object({
    email: EmailSchema,
    role: AppRoleSchema,
    dma: AdminDmaInputSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === "viewer" && v.dma !== undefined) {
      ctx.addIssue({ code: "custom", path: ["dma"], message: "viewer 는 DMA 를 연결할 수 없어요" });
    }
  });

/** PATCH /api/admin/users/:email — 역할 변경. */
export const AdminRolePatchBody = z.object({
  role: AppRoleSchema,
});

/**
 * 경로 `:email`. Express 5 라우터가 경로 파라미터의 퍼센트 인코딩을 이미 풀어 준다(`%40` → `@`) —
 * 여기서 다시 decode 하면 이메일에 든 `%` 가 두 번 풀린다. 정규화(trim · 소문자) · 형식만 본다.
 */
export const adminEmailParam = z.object({
  email: EmailSchema,
});

// ─────────────────────────────────────────────────────────────────────────────
// DMA 프록시 (D-15 필드별 즉시 저장 — 각각 한 요청)
// ─────────────────────────────────────────────────────────────────────────────

/** 경로 `:dma` — Express 5 가 이미 디코딩했다(다시 풀지 않는다). */
export const dmaParam = z.object({ dma: DmaUserIdSchema });

/** 경로 `:dma/accounts/:broker/:accountNo` — 계좌번호는 relay 가 정규화한다. */
export const dmaAccountParam = z.object({
  dma: DmaUserIdSchema,
  broker: DmaBrokerSchema,
  accountNo: z.string().refine(isValidAccountNoInput, "계좌번호는 1~12자예요"),
});

/** POST /api/admin/dma-users/:dma/password — `AdminPasswordBody`. */
export const AdminPasswordSchema = z.object({ password: DmaPasswordSchema });

/** PUT /api/admin/dma-users/:dma/accounts — `AdminPutAccountBody { account, servers }`. */
export const AdminPutAccountSchema = z
  .object({
    account: AdminAccountInputSchema,
    servers: ServerListSchema,
  })
  .superRefine(checkServersMatchBroker);

// ─────────────────────────────────────────────────────────────────────────────
// 서버 레지스트리 (D-09 · D-17)
// ─────────────────────────────────────────────────────────────────────────────

const IPV4_OCTET = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4_RE = new RegExp(`^${IPV4_OCTET}(\\.${IPV4_OCTET}){3}$`);
/** RFC 1123 호스트명 — 라벨 1~63자(영숫자 · 가운데 하이픈) · 전체 ≤ 253. */
const HOSTNAME_RE =
  /^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

/**
 * 서버 주소 — IPv4 점 표기 또는 RFC 1123 호스트명. 공백 · 스킴 · 포트 · 경로가 섞이면 거부한다
 * (relay 가 이 값으로 TCP 를 연다 — `http://` 나 `:9100` 이 붙은 값은 조용히 실패한다).
 * 숫자와 점만으로 된 값은 IPv4 로만 판정한다(`999.1.1.1` 이 호스트명으로 통과하지 않게).
 */
export const ServerHostSchema = z
  .string()
  .trim()
  .min(1, "주소를 입력하세요")
  .refine(
    (h) => (/^[\d.]+$/.test(h) ? IPV4_RE.test(h) : HOSTNAME_RE.test(h)),
    "주소는 IPv4(예: 10.41.1.120) 또는 호스트명이어야 해요",
  );

export const ServerPortSchema = z.number().int().min(1, "포트는 1~65535 예요").max(65535, "포트는 1~65535 예요");
export const ServerSortOrderSchema = z.number().int().min(0).max(100000);

/** 경로 `:key`. */
export const serverKeyParam = z.object({ key: ServerKeySchema });

/** POST /api/admin/servers — `AdminServerUpsertBody`. 키 접두와 증권사가 같아야 한다(`dma_servers` CHECK 와 같은 규칙). */
export const AdminServerUpsertSchema = z
  .object({
    key: ServerKeySchema,
    broker: DmaBrokerSchema,
    host: ServerHostSchema,
    port: ServerPortSchema,
    sortOrder: ServerSortOrderSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (brokerOfServerKey(v.key) !== v.broker) {
      ctx.addIssue({ code: "custom", path: ["broker"], message: "서버 키의 증권사 접두와 증권사가 달라요" });
    }
  });

/** PATCH /api/admin/servers/:key — `AdminServerPatchBody`(필드별 즉시 저장 — 보통 한 필드). 최소 1필드. */
export const AdminServerPatchSchema = z
  .object({
    broker: DmaBrokerSchema.optional(),
    host: ServerHostSchema.optional(),
    port: ServerPortSchema.optional(),
    enabled: z.boolean().optional(),
    sortOrder: ServerSortOrderSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "바꿀 값이 없어요");
