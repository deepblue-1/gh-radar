import { z } from "zod";

/**
 * Phase 29 (D-01 · D-03 · D-04) — Admin 허용 / 역할 쓰기 입력 검증.
 *
 * 허용 표(`app_users`)의 키는 **이메일(소문자 · 앞뒤 공백 없음)** — 표의 CHECK 와 같은 정규화를 여기서 먼저 한다.
 * 그래야 「Lee@Gmail.com」 과 「lee@gmail.com」 이 다른 행이 되지 않는다(DB CHECK 위반 500 대신 정상 저장).
 * DMA 필드(`dma`)는 29-13 이 `AdminUserUpsertBody` 를 넓혀 싣는다.
 */

/** 역할 3단(D-02) — shared `AppRole` 과 같은 값. */
export const AppRoleSchema = z.enum(["admin", "trader", "viewer"]);

/** 이메일 정규화: trim → 소문자 → ≤ 254(RFC 5321 경로 상한) → 형식. */
const EmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** POST /api/admin/users — 사전 등록 · 승인 대기 승인 · viewer 생성. */
export const AdminUserUpsertBody = z.object({
  email: EmailSchema,
  role: AppRoleSchema,
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
