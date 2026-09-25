/**
 * 네이티브 Google 로그인 공개 식별자 (Phase 21 · D-03).
 *
 * - **공개 식별자다(비밀 아님).** OAuth 클라이언트 ID 는 앱 번들·Info.plist·브라우저 요청에 그대로
 *   노출되는 값이다. Client Secret 은 여기에 두지 않는다(읽지도 옮기지도 않는다).
 * - 세 클라이언트 모두 GCP 프로젝트 `gh-radar`(번호 1023658565518)에 있다. Supabase Dashboard →
 *   Authentication → Sign In / Providers → Google 의 「Client IDs」(Authorized Client IDs)에 **같은 세 값**이
 *   `웹,iOS,Android` 순서(웹 먼저)로 등록돼 있다 — 여기 값을 바꾸면 그쪽도 같이 바꿔야 id_token 의
 *   aud 검증을 통과한다. 「Skip nonce checks」는 꺼져 있다(21-RESEARCH Pitfall 6 — 전역 설정).
 * - 쓰는 곳: 21-15 `native-google-login.ts` 의 SocialLogin `initialize`
 *   `{ webClientId: WEB, iOSClientId: IOS, iOSServerClientId: WEB }` · iOS Info.plist URL scheme.
 * - Android: Credential Manager 가 돌려주는 id_token 의 aud 는 **웹** 클라이언트 ID 다(21-RESEARCH A14).
 *   Android 클라이언트(패키지 `com.ghtrade.app` + debug SHA-1)는 GCP 가 앱 서명을 확인하는 데만 쓰여
 *   코드에서 직접 참조하지 않지만, 콘솔·Supabase 등록값과 대조할 수 있게 기록해 둔다.
 *   release 서명 SHA-1 은 아직 미등록(스토어 서명 — Deferred).
 * - Vercel env(`NEXT_PUBLIC_*`)로 옮기지 않는다: 공개 값이라 env 로 숨길 이유가 없고, env paste 끝 개행이
 *   클라이언트 번들을 깨뜨린 사고 이력이 있다. 문자열 리터럴로 고정하고 단위 테스트가 형식을 잠근다.
 */

export const GOOGLE_WEB_CLIENT_ID =
  '1023658565518-0c4lc5toseshoj6774omahf6ttpasv5g.apps.googleusercontent.com';

export const GOOGLE_IOS_CLIENT_ID =
  '1023658565518-ch3hgiuq8kqk5r33c3e4er92uvkmdgrj.apps.googleusercontent.com';

export const GOOGLE_ANDROID_CLIENT_ID =
  '1023658565518-ntevj6d0cpj737e43qm4nok0ol87t4bn.apps.googleusercontent.com';

/** iOS URL scheme = iOS 클라이언트 ID 의 `.` 토큰 역순. 21-15 가 Info.plist `CFBundleURLSchemes` 에 같은 값을 적는다. */
export const GOOGLE_IOS_URL_SCHEME =
  'com.googleusercontent.apps.1023658565518-ch3hgiuq8kqk5r33c3e4er92uvkmdgrj';
