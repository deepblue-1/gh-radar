package com.ghtrade.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.LinearGradient
import android.graphics.Shader
import android.graphics.Typeface
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
import android.widget.TextView
import androidx.core.graphics.ColorUtils

/**
 * GH Trade 네이티브 하단 플로팅 탭바 — D-02 · D-15 · D-27a (스케치 004 탭바 A 「알약」). iOS `GHTradeTabBar`(21-10)의 Android 판.
 *
 * 수치 정본 = CONTEXT D-27a: 높이 70 · radius 32 · 1px `--line` 테두리 · 그림자 · 활성 = `--primary` 14% 원 46 +
 * filled/굵은 아이콘 + primary 라벨 10sp · 비활성 `--muted-fg` · 탭바 위 120dp 하단 페이드(`--bg` 92%).
 * Android 에는 뒤 콘텐츠 실시간 블러의 표준 수단이 없다 → 스케치의 `card 82% + 블러 18` 을 **card 약 94% 불투명**으로
 * 근사한다(RESEARCH A10 — 시각은 21-16 UAT 에서 확인).
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

    private val pillBackground = GradientDrawable().apply { cornerRadius = dpF(32f) }
    private val items = mutableListOf<TabItem>()
    private var palette = GhTradePalette.of("light")

    init {
        clipToPadding = false
        clipChildren = false
        background = pillBackground
        // 그림자: CSS `0 2px 16px rgba(0,0,0,.18)` 근사 — 알약 모양 외곽선으로 elevation 그림자를 드리운다.
        elevation = dpF(8f)
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

    /** 활성 탭 표시. null = 5탭 전부 비활성(D-14 — 종목상세 등 하위 경로 · 오프라인 페이지). */
    fun setActive(tab: TabId?) {
        activeTab = tab
        for (item in items) item.configure(item.tab == tab, palette)
    }

    /** 팔레트 교체(테마 전환 — 21-13). 알약 색·테두리·아이콘/라벨/강조 색과 페이드를 함께 갱신한다. */
    fun apply(p: GhTradePalette) {
        palette = p
        // 94% ≈ 240/255 — 블러 없는 Android 에서 뒤 콘텐츠가 비쳐 글자가 겹쳐 보이지 않을 만큼 불투명하게(A10).
        pillBackground.setColor(ColorUtils.setAlphaComponent(p.card, 240))
        pillBackground.setStroke(1, p.line)
        for (item in items) item.configure(item.tab == activeTab, p)
        fadeView.background = fadeDrawable(p.bg)
    }

    /** 위 투명 → 70% 지점부터 `--bg` 92%(스케치 `.fade.va`). 같은 색의 알파만 바꿔 보간한다(중간이 회색으로 탁해지지 않게). */
    private fun fadeDrawable(bg: Int): PaintDrawable = PaintDrawable().apply {
        shape = RectShape()
        val clear = ColorUtils.setAlphaComponent(bg, 0)
        val solid = ColorUtils.setAlphaComponent(bg, 235)
        shaderFactory = object : ShapeDrawable.ShaderFactory() {
            override fun resize(width: Int, height: Int): Shader = LinearGradient(
                0f, 0f, 0f, height.toFloat(),
                intArrayOf(clear, solid, solid),
                floatArrayOf(0f, 0.7f, 1f),
                Shader.TileMode.CLAMP,
            )
        }
    }

    private fun dpF(v: Float): Float = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)

    /** 탭 한 칸 — 강조 원 46(top 7) · 아이콘 26(top 12) · 라벨 10sp(아이콘 아래 4). */
    @SuppressLint("ViewConstructor")
    private class TabItem(context: Context, val tab: TabId) : FrameLayout(context) {

        private val highlight = View(context)
        private val highlightShape = GradientDrawable().apply { shape = GradientDrawable.OVAL }
        private val icon = ImageView(context)
        private val label = TextView(context)

        init {
            isClickable = true
            isFocusable = true
            contentDescription = tab.title

            highlight.background = highlightShape
            highlight.visibility = View.GONE
            addView(highlight, LayoutParams(dp(46f), dp(46f), Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply {
                topMargin = dp(7f)
            })

            icon.scaleType = ImageView.ScaleType.FIT_CENTER
            icon.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            addView(icon, LayoutParams(dp(26f), dp(26f), Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply {
                topMargin = dp(12f)
            })

            label.text = tab.title
            label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
            label.typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            label.gravity = Gravity.CENTER
            label.maxLines = 1
            label.includeFontPadding = false
            label.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            addView(
                label,
                LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply {
                    topMargin = dp(12f + 26f + 4f)
                },
            )
        }

        fun configure(active: Boolean, p: GhTradePalette) {
            val color = if (active) p.primary else p.muted
            highlight.visibility = if (active) View.VISIBLE else View.GONE
            highlightShape.setColor(ColorUtils.setAlphaComponent(p.primary, 36)) // ≈14%
            icon.setImageResource(iconRes(tab, active))
            icon.imageTintList = ColorStateList.valueOf(color)
            label.setTextColor(color)
            isSelected = active
        }

        // iOS 와 같은 눌림 피드백 — 아이콘·라벨을 잠깐 흐리게.
        override fun setPressed(pressed: Boolean) {
            super.setPressed(pressed)
            val a = if (pressed) 0.55f else 1f
            icon.alpha = a
            label.alpha = a
        }

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
