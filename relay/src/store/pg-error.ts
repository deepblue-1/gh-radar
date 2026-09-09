/**
 * Phase 16 Plan 38 — R2-CR-03. PostgREST 오류의 **안전 필드 추출 단일 정본** (T-16-45 / D-19).
 *
 * ## 왜 이 파일이 있는가
 *
 * PostgreSQL 은 제약 위반의 `DETAIL` 에 **위반한 행의 값을 그대로** 넣는다:
 *   - CHECK (`23514`)      → `Failing row contains (<모든 컬럼 값>).`
 *   - NOT NULL (`23502`)   → `Failing row contains (<모든 컬럼 값>).`
 *   - FK (`23503`)         → `Key (user_id)=(<uuid>) is not present in table "…".`
 *   - UNIQUE (`23505`)     → `Key (user_id, order_no, …)=(…) already exists.`
 * PostgREST 는 그것을 응답 본문의 `details` 로, supabase-js 는 `error.details` 로 전달한다.
 *
 * `dma_orders` 의 컬럼에는 `account_no` · `order_no` · `user_id` 가 **전부** 있다. 그래서
 * `qty <= 0` 같은 CHECK 위반 **한 번**이면 계좌번호 원문이 Cloud Logging 에 영구히 남는다.
 * 이 phase 는 화면에는 전체를 보여 주되 로그에는 계좌번호를 마스킹하는 규율을 지켜 왔는데
 * (T-16-09 / T-16-45 — `maskAccountNo`), 오류 객체를 통째로 싣는 로그 한 줄이 그 규율을
 * 우회하고 있었다. 신뢰 경계를 넘는 것은 요청만이 아니다 — **오류 페이로드도 DB 행 내용을
 * 실어 나르는 채널**이다.
 *
 * ## 이 파일의 계약
 *
 * **`details` 와 `hint` 는 어떤 경로에서도 로그에 싣지 않는다.** 이 모듈은 그 두 필드를
 * 읽지조차 않는다 — 없는 값은 샐 수 없다. `dma_orders` 관련 오류를 로그로 내보내는 자리를
 * 새로 만드는 사람은 오류 객체를 직접 펼치지 말고 이 함수를 통과시킨다. 규율을 **경로마다**
 * 적으면 다음에 로그 한 줄이 늘 때 그 줄만 새므로, 규율을 **타입**에 걸어 둔 것이 요점이다.
 *
 * ## 사유를 지우는 것이 아니다 (S-5)
 *
 * 마스킹이 「조용한 실패」가 되면 그것대로 사고다. `code`(SQLSTATE)는 그대로 남으므로
 * `23514`/`23502`/`23503`/`23505` 로 원인 계열을 그대로 추적할 수 있고, `message` 도
 * 남는다 — PostgreSQL 의 `message` 는 제약명까지만 담고 값은 담지 않는다
 * (예: `new row for relation "dma_orders" violates check constraint "dma_orders_qty_check"`).
 *
 * 잔여 위험(알고 받아들이는 것): 타입 캐스팅 실패(`22P02` 등) 계열은 값을 `message` 에 담을
 * 수 있다. 그 경로는 `dma_orders` 쓰기에서 나오지 않고(모든 값이 코드에서 타입 지어져 나간다),
 * 200자 절단이 노출 폭을 묶는다. 필드를 더 좁히는 대신 절단을 둔 이유는, `message` 까지
 * 버리면 「무엇이 실패했는지」가 로그에서 사라져 S-5 를 어기기 때문이다.
 *
 * 하지 않는 것:
 *   - **원본 객체를 그대로 돌려주지 않는다.** 어떤 입력이 와도 새로 만든 평평한 객체다.
 *   - 반환 타입을 넓히지 않는다. `Record<string, unknown>` 이면 다음 사람이 두 필드를
 *     다시 얹을 수 있다 — 좁은 타입 자체가 이 계약의 집행 수단이다.
 *   - 스택을 담지 않는다. 이 함수의 입력은 PostgREST 오류(평범한 객체, 스택 없음)가 정본이다.
 */

/** 로그에 실어도 되는 필드만 남긴 오류 요약. **이 두 필드가 전부다.** */
export type SafePgError = {
  code?: string;
  message?: string;
};

/**
 * `message` 절단 길이. 제약 위반 메시지는 100자 안쪽이라 정상 사유는 잘리지 않고,
 * 예상 밖의 긴 본문(HTML 오류 페이지 등)이 로그를 통째로 밀어내는 것만 막는다.
 */
const MAX_MESSAGE_LEN = 200;

/**
 * PostgREST/supabase-js 오류에서 **로그에 실어도 되는 필드만** 뽑는다.
 *
 * `null`/`undefined` → `{}` — 실을 값이 없다. 빈 문자열을 지어내면 로그 판독자가
 * 「사유가 있었는데 잘렸다」로 오해한다.
 * 객체가 아닌 값(문자열 throw 등) → `{ message }` 로 남긴다. 그 값 자체가 유일한 사유이고,
 * PostgREST 는 비객체를 던지지 않으므로 이 갈래는 애초에 행 내용을 실어 나르지 않는다.
 */
export function safePgError(err: unknown): SafePgError {
  if (err === null || err === undefined) return {};
  if (typeof err !== "object") return { message: String(err).slice(0, MAX_MESSAGE_LEN) };

  const src = err as { code?: unknown; message?: unknown };
  const out: SafePgError = {};
  // SQLSTATE 는 문자열이 정본이지만, 드라이버에 따라 수치 코드가 오는 경우가 있어 좁혀 받는다.
  if (typeof src.code === "string") out.code = src.code;
  else if (typeof src.code === "number") out.code = String(src.code);
  if (typeof src.message === "string") out.message = src.message.slice(0, MAX_MESSAGE_LEN);
  return out;
}
