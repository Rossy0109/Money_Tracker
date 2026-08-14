package com.artracestudio.app.image

import android.graphics.Bitmap
import android.graphics.Matrix
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Handles 4-point perspective (homography) transformation for paper calibration.
 * Maps the imported image to fit within the user-defined paper corners.
 */
@Singleton
class PerspectiveTransformer @Inject constructor() {

    data class Quad(
        val topLeft:     Pair<Float, Float>,
        val topRight:    Pair<Float, Float>,
        val bottomRight: Pair<Float, Float>,
        val bottomLeft:  Pair<Float, Float>
    )

    /**
     * Returns a Matrix that maps the bitmap's four corners to the given
     * destination quad (paper corners in screen coordinates).
     * Uses Android's Matrix.setPolyToPoly with 4 points.
     */
    fun buildTransformMatrix(
        srcWidth: Float,
        srcHeight: Float,
        destQuad: Quad
    ): Matrix {
        val src = floatArrayOf(
            0f,        0f,
            srcWidth,  0f,
            srcWidth,  srcHeight,
            0f,        srcHeight
        )
        val dst = floatArrayOf(
            destQuad.topLeft.first,     destQuad.topLeft.second,
            destQuad.topRight.first,    destQuad.topRight.second,
            destQuad.bottomRight.first, destQuad.bottomRight.second,
            destQuad.bottomLeft.first,  destQuad.bottomLeft.second
        )
        return Matrix().apply { setPolyToPoly(src, 0, dst, 0, 4) }
    }

    /**
     * Apply perspective transform to a bitmap.
     * destWidth/Height define the output canvas size.
     */
    fun transformBitmap(
        src: Bitmap,
        destQuad: Quad,
        destWidth: Int,
        destHeight: Int
    ): Bitmap {
        val matrix = buildTransformMatrix(
            src.width.toFloat(), src.height.toFloat(), destQuad
        )
        val result = Bitmap.createBitmap(destWidth, destHeight, Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(result)
        val paint  = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG or android.graphics.Paint.FILTER_BITMAP_FLAG)
        canvas.drawBitmap(src, matrix, paint)
        return result
    }
}
