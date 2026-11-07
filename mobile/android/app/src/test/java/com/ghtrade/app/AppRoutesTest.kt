package com.ghtrade.app

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 앱 경로 판정 — 정규화 · 로그인/인증 화면 판정(Android 뒤로가기 ④ 전용 · quick-261107-fbj).
 *
 * 실행: `pnpm --filter @gh-radar/mobile run native:test:android`
 */
class AppRoutesTest {

    @Test
    fun normalize() {
        val cases = listOf(
            "" to "/",
            "/" to "/",
            "/trading?focus=X" to "/trading",
            "/scanner/" to "/scanner",
            "/a#b" to "/a",
        )
        for ((input, expected) in cases) {
            assertEquals("normalize \"$input\"", expected, AppRoutes.normalize(input))
        }
    }

    @Test
    fun isAuthPath() {
        val cases = listOf(
            "/login" to true,
            "/login/x" to true,
            "/auth" to true,
            "/auth/callback" to true,
            "/login?next=/me" to true,
            "/" to false,
            "/me" to false,
            "/loginx" to false,
            "/author" to false,
        )
        for ((input, expected) in cases) {
            assertEquals("isAuthPath \"$input\"", expected, AppRoutes.isAuthPath(input))
        }
    }
}
