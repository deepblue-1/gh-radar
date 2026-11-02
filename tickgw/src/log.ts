/**
 * tickgw 로그 — JSON 한 줄(`docker logs tickgw` · Cloud Logging relay_docker 와 같은 수집 경로).
 *
 * 위생: 공유 비밀 · 요청 헤더 · 바이트 본문을 넣지 않는다. 남기는 것은 키(isin|ex|date) · 종료코드 ·
 * 레코드 수 · 바이트 수 · 소요 ms · stderr 끝 일부(ssh 오류 문구 — 비밀 없음)뿐이다.
 * `LOG_LEVEL=silent` 이면 아무것도 쓰지 않는다(시험).
 */

export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, string | number | boolean | null | undefined>;

export function log(level: LogLevel, msg: string, fields: LogFields = {}): void {
  if (process.env.LOG_LEVEL === "silent") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (level === "info") process.stdout.write(line + "\n");
  else process.stderr.write(line + "\n");
}
