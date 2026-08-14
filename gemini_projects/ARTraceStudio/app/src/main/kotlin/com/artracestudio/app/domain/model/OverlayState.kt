package com.artracestudio.app.domain.model

import android.graphics.Matrix

/**
 * Represents the complete state of an image overlay positioned on top of the camera feed.
 * All transformation values are stored separately and combined into a Matrix for rendering.
 */
data class OverlayState(
    val imageUri: String = "",
    val opacity: Float = 0.35f,          // 5% – 100%
    val scale: Float = 1f,
    val rotation: Float = 0f,            // degrees
    val translationX: Float = 0f,        // pixels offset from center
    val translationY: Float = 0f,
    val isLocked: Boolean = false,
    val isVisible: Boolean = true,
    val isMirrorH: Boolean = false,
    val isMirrorV: Boolean = false,
    // Grid
    val gridEnabled: Boolean = false,
    val gridDivisions: Int = 4,
    val gridOpacity: Float = 0.5f,
    // Image mode: "original" | "edge" | "lineart"
    val imageMode: String = "original",
    val edgeStrength: Float = 0.5f,
    val edgeDetail: Float = 0.5f,
    val edgeSmoothness: Float = 0.5f,
    // Brightness/Contrast
    val brightness: Float = 0f,          // -1f to 1f
    val contrast: Float = 1f,            // 0.5f to 2f
    val saturation: Float = 1f,
    // Calibration
    val calibrationPoints: List<Pair<Float, Float>> = emptyList(),
    val isCalibrated: Boolean = false,
    // Tripod mode
    val tripodMode: Boolean = false
) {
    /** Build a Canvas-ready Matrix from current transform state. */
    fun toMatrix(canvasWidth: Float, canvasHeight: Float): Matrix {
        return Matrix().apply {
            val cx = canvasWidth / 2f
            val cy = canvasHeight / 2f
            postTranslate(cx + translationX, cy + translationY)
            postScale(
                scale * (if (isMirrorH) -1f else 1f),
                scale * (if (isMirrorV) -1f else 1f),
                cx + translationX,
                cy + translationY
            )
            postRotate(rotation, cx + translationX, cy + translationY)
        }
    }
}

enum class ImageMode(val label: String) {
    ORIGINAL("Original"),
    EDGE("Edge"),
    LINE_ART("Line Art")
}

enum class GridDivision(val value: Int, val label: String) {
    TWO(2, "2×2"),
    FOUR(4, "4×4"),
    SIX(6, "6×6"),
    EIGHT(8, "8×8"),
    TEN(10, "10×10")
}
