package com.ghtrade.app

// 앱 경로 판정 — Android 뒤로가기(MainActivity.navigateBack) 전용 순수 함수.
//
// 순수 Kotlin 이다(android.* · Uri 금지 — 문자열 연산만): JVM 단위 테스트 `AppRoutesTest` 가 표 전체를 단언한다.
// quick-261107-fbj 로 네이티브 하단 크롬과 그 경로표(활성 판정)를 걷어 내고, 뒤로가기 ④(홈으로)가 쓰는
// 정규화 · 로그인/인증 화면 판정만 남겼다.

object AppRoutes {

    /** 쿼리·프래그먼트 제거 · 루트 외 끝 슬래시 제거 · 빈 문자열은 `/`. */
    fun normalize(path: String): String {
        val cut = path.indexOfFirst { it == '?' || it == '#' }
        var p = if (cut >= 0) path.substring(0, cut) else path
        while (p.length > 1 && p.endsWith("/")) {
            p = p.dropLast(1)
        }
        return p.ifEmpty { "/" }
    }

    /** 로그인 · 인증 화면인가 — `/login` · `/auth` 와 그 하위(`/loginx` · `/author` 같은 접두 유사 경로는 제외). 뒤로가기 = 종료. */
    fun isAuthPath(path: String): Boolean {
        val p = normalize(path)
        return p == "/login" || p.startsWith("/login/") || p == "/auth" || p.startsWith("/auth/")
    }
}
