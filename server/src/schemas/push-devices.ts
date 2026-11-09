import { z } from "zod";

/**
 * Phase 40 D-12 · D-13 — 체결 푸시 기기 API(`/api/push-devices`) 입력 검증.
 *
 * DB(40-01 `dma_push_devices`)의 CHECK 와 같은 모양을 여기서 먼저 막는다 — CHECK 위반이 500 으로
 * 새지 않고 400 으로 끝나게. 정본은 DB CHECK 이고 이 파일은 그 앞의 관문이다.
 *
 * - deviceKey: 웹 localStorage 가 만든 **소문자** UUID(40-10 `getOrCreatePushDeviceKey`). 대문자 · 경로 조각은 400.
 * - token: APNs(hex 64) · FCM(`:` `-` `_` `.` 포함) — 16~4096자, 공백 · 그 밖 문자 없음.
 * - label: 「iPhone · 사파리」 같은 표시 이름 — 제어 문자를 빼고 trim 한 뒤 80자로 자른다(DB CHECK ≤ 80).
 * - quick-261109-dz1 계좌별 끄기 입력 — 계좌번호는 길이 · 빈 값만 본다(가시성 판정 없음: 남의 번호를 꺼도
 *   자기 수신에만 영향이라서 · D-08). DB `dma_push_account_mutes.account_no` CHECK(1~12자)와 같은 상한.
 */

/** 40-01 `dma_push_devices.device_key` CHECK 와 같다. */
const DEVICE_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** APNs hex · FCM 등록 토큰 문자 집합(DB CHECK 는 길이 16~4096). */
const TOKEN_RE = /^[A-Za-z0-9:_\-.]{16,4096}$/;
/** C0 · DEL · C1 제어 문자. */
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/g;
const LABEL_MAX = 80;

export const PushDeviceKeyParam = z.object({
  deviceKey: z.string().regex(DEVICE_KEY_RE, "deviceKey 는 소문자 UUID 여야 합니다."),
});

/** PUT `/:deviceKey` — 「이 기기 체결 알림 켜기」 · 토큰 갱신(shared `PushDeviceRegisterBody`). */
export const PushDeviceRegisterBodySchema = z
  .object({
    platform: z.enum(["ios", "android"]),
    token: z.string().regex(TOKEN_RE, "token 형식이 올바르지 않습니다."),
    label: z
      .string()
      .max(200)
      .transform((s) => s.replace(CONTROL_RE, "").trim().slice(0, LABEL_MAX)),
  })
  .strict();

/**
 * PATCH `/:deviceKey` — 끄기만 받는다(D-13). 켜기는 그 기기 앱의 PUT 로만 한다 — 켜려면 그 기기에서
 * 알림 권한이 있어야 하고 새 토큰이 필요하기 때문이다.
 */
export const PushDevicePatchBody = z.object({ enabled: z.literal(false) }).strict();

/**
 * quick-261109-dz1 D-03 · D-08 — PUT `/accounts/:accountNo` 경로. relay 계좌번호 문자열 그대로가 키라 정규화 변환은
 * 하지 않는다(trim 뒤 1~12자 — pnl.ts 계좌번호 선례 · DB CHECK 와 같은 상한).
 */
export const PushAccountNoParam = z.object({
  accountNo: z.string().trim().min(1, "accountNo 는 1~12자여야 합니다.").max(12, "accountNo 는 1~12자여야 합니다."),
});

/** quick-261109-dz1 D-01 · D-08 — PUT `/accounts/:accountNo` body. false = 끄기 · true = 켜기(멱등). */
export const PushAccountToggleBody = z.object({ enabled: z.boolean() }).strict();
