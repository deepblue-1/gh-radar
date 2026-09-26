package com.ghtrade.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.LinearGradient
import android.graphics.Shader
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.PaintDrawable
import android.graphics.drawable.ShapeDrawable
import android.graphics.drawable.shapes.RectShape
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import androidx.core.graphics.ColorUtils

/**
 * GH Trade 네이티브 하단 플로팅 탭바 — D-02 · D-15 · D-27b (스케치 007 C 「캡슐 인디케이터」 · 라벨 없음).
 * iOS `GHTradeTabBar`(21-10 · 21-20)의 Android 판.
 *
 * 수치 정본 = CONTEXT D-27b: 높이 60 · radius 30 · 라벨 없음(접근 이름 = contentDescription) · 아이콘 26 셀 정중앙 ·
 * 활성 = 아이콘 뒤 캡슐 56×36 radius 18 `--primary` + filled/굵은 아이콘 + primary 색 · 비활성 `--muted-fg` ·
 * 테두리 없음 · 탭바 위 86dp 하단 페이드(`--bg` 80% @75%). 색 토큰(bg · primary · muted · card)은 D-27a 그대로.
 * 유리: 스케치는 `--glass-hi`(다크 rgba(44,44,53,.62) · 라이트 rgba(255,255,255,.72)) + `blur 28 · saturate 1.8` 이지만
 * Android 에는 뒤 콘텐츠 실시간 블러의 표준 수단이 없다 → 같은 glass RGB 를 **알파 240(≈94%) 불투명**으로 근사한다
 * (RESEARCH A10 — 블러 없이 스케치 알파대로 비치면 뒤 글자가 아이콘과 겹쳐 읽힌다).
 * 그림자: 스케치 `0 4px 24px rgba(0,0,0,.14)` 의 넓고 옅은 그림자 → elevation 12dp. Android 그림자 알파는 테마
 * spotShadowAlpha 와 곱해지므로 색 알파로 흉내 내지 않고 높이로만 조절한다.
 * 위치·폭(좌우 16 · 최대 560 · 바닥 max(내비 인셋 − 14, 14))과 표시/숨김은 `MainActivity` 가 정한다.
 */
@SuppressLint("ViewConstructor")
class GhTradeTabBar(context: Context) : FrameLayout(context) {

    /** 탭 탭(tap) 콜백 — 같은 탭 재탭도 호출된다(D-06 재탭 = 최상단 이동은 웹이 처리). */
    var onSelect: ((TabId) -> Unit)? = null

    /** 탭바 위로 깔리는 하단 페이드. `MainActivity` 가 탭바보다 아래 계층에 따로 붙인다. 터치는 통과시킨다. */
    val fadeView: View = View(context).apply {
        isClickable = false
        isFocusable = false
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    var activeTab: TabId? = null
        private set

    private val pillBackground = GradientDrawable().apply { cornerRadius = dpF(30f) }
    private val items = mutableListOf<TabItem>()
    // D-23a: 첫 apply 전 자리값도 저장값 없는 기본(다크)과 같게.
    private var palette = GhTradePalette.of("dark")

    init {
        clipToPadding = false
        clipChildren = false
        background = pillBackground
        // 그림자: 스케치 007 C `0 4px 24px rgba(0,0,0,.14)` 근사 — 알약 모양 외곽선으로 넓고 옅은 elevation 그림자(D-27b).
        elevation = dpF(12f)
        outlineProvider = ViewOutlineProvider.BACKGROUND

        val row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        addView(row, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        for (tab in TabId.values()) {
            val item = TabItem(context, tab)
            item.setOnClickListener { onSelect?.invoke(tab) }
            row.addView(item, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f))
            items.add(item)
        }
        apply(palette)
    }

    // 폭 = min(560dp, 부모 폭 − 좌우 여백 16×2). MainActivity 가 MATCH_PARENT + 좌우 margin 16 + 가운데 정렬로 붙이므로
    // 여기서 최대 560 만 자르면 회전·멀티윈도우에서도 따로 다시 계산할 필요가 없다(D-13 — 폭 기준 숨김 분기는 없다).
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val maxWidth = dpF(560f).toInt()
        val spec = if (MeasureSpec.getSize(widthMeasureSpec) > maxWidth) {
            MeasureSpec.makeMeasureSpec(maxWidth, MeasureSpec.EXACTLY)
        } else {
            widthMeasureSpec
        }
        super.onMeasure(spec, heightMeasureSpec)
    }

    /** 활성 탭 표시. null = 5탭 전부 비활성(D-14 — 종목상세 등 하위 경로 · 오프라인 페이지). */
    fun setActive(tab: TabId?) {
        activeTab = tab
        for (item in items) item.configure(item.tab == tab, palette)
    }

    /** 팔레트 교체(테마 전환 — 21-13). 알약 유리 색 · 아이콘/캡슐 색과 페이드를 함께 갱신한다(테두리 없음 — D-27b). */
    fun apply(p: GhTradePalette) {
        palette = p
        // glass RGB × 94% ≈ 240/255 — 블러 없는 Android 에서 뒤 콘텐츠가 비쳐 글자가 겹쳐 보이지 않을 만큼 불투명하게(A10).
        pillBackground.setColor(ColorUtils.setAlphaComponent(p.glass, 240))
        for (item in items) item.configure(item.tab == activeTab, p)
        fadeView.background = fadeDrawable(p.bg)
    }

    /** 탭바 위 86dp · bg 80% (D-27b) — 위 투명 → 75% 지점부터 `--bg` 80%(스케치 007 `.vc .fade`). 같은 색의 알파만 바꿔 보간한다(중간이 회색으로 탁해지지 않게). */
    private fun fadeDrawable(bg: Int): PaintDrawable = PaintDrawable().apply {
        shape = RectShape()
        val clear = ColorUtils.setAlphaComponent(bg, 0)
        val solid = ColorUtils.setAlphaComponent(bg, 204)
        shaderFactory = object : ShapeDrawable.ShaderFactory() {
            override fun resize(width: Int, height: Int): Shader = LinearGradient(
                0f, 0f, 0f, height.toFloat(),
                intArrayOf(clear, solid, solid),
                floatArrayOf(0f, 0.75f, 1f),
                Shader.TileMode.CLAMP,
            )
        }
    }

    private fun dpF(v: Float): Float = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)

    /**
     * 탭 한 칸 — D-27b(스케치 007 C): 라벨 없음 · 아이콘 26 셀 정중앙 · 활성 = 아이콘 뒤 캡슐 56×36 radius 18.
     * 시각 라벨은 없지만 접근 이름은 `contentDescription = tab.title` 로 남긴다(TalkBack 이 탭 이름을 읽는다).
     */
    @SuppressLint("ViewConstructor")
    private class TabItem(context: Context, val tab: TabId) : FrameLayout(context) {

        private val highlight = View(context)
        private val highlightShape = GradientDrawable().apply { cornerRadius = dpF(18f) }
        private val icon = ImageView(context)

        init {
            isClickable = true
            isFocusable = true
            contentDescription = tab.title

            highlight.background = highlightShape
            highlight.visibility = View.GONE
            addView(highlight, LayoutParams(dp(56f), dp(36f), Gravity.CENTER))

            icon.scaleType = ImageView.ScaleType.FIT_CENTER
            icon.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            addView(icon, LayoutParams(dp(26f), dp(26f), Gravity.CENTER))
        }

        fun configure(active: Boolean, p: GhTradePalette) {
            val color = if (active) p.primary else p.muted
            highlight.visibility = if (active) View.VISIBLE else View.GONE
            highlightShape.setColor(ColorUtils.setAlphaComponent(p.primary, 41)) // ≈16% (D-27b)
            icon.setImageResource(iconRes(tab, active))
            icon.imageTintList = ColorStateList.valueOf(color)
            isSelected = active
        }

        // iOS 와 같은 눌림 피드백 — 아이콘을 잠깐 흐리게.
        override fun setPressed(pressed: Boolean) {
            super.setPressed(pressed)
            icon.alpha = if (pressed) 0.55f else 1f
        }

        private fun dpF(v: Float): Float =
            TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)

        private fun dp(v: Float): Int =
            TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt()

        private companion object {
            /** D-15 아이콘 표 — outlined(비활성) ↔ filled/굵은 획(활성). */
            fun iconRes(tab: TabId, active: Boolean): Int = when (tab) {
                TabId.HOME -> if (active) R.drawable.ic_tab_home_fill else R.drawable.ic_tab_home
                TabId.SEARCH -> if (active) R.drawable.ic_tab_search_fill else R.drawable.ic_tab_search
                TabId.TRADING -> if (active) R.drawable.ic_tab_trading_fill else R.drawable.ic_tab_trading
                TabId.AI -> if (active) R.drawable.ic_tab_ai_fill else R.drawable.ic_tab_ai
                TabId.ME -> if (active) R.drawable.ic_tab_me_fill else R.drawable.ic_tab_me
            }
        }
    }
}
