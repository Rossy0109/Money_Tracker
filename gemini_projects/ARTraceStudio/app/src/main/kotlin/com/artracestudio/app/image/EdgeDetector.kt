package com.artracestudio.app.image

import android.graphics.Bitmap
import android.graphics.Color
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.sqrt

/**
 * Sobel-based edge detection and line art conversion.
 * All heavy processing runs on Dispatchers.Default.
 */
@Singleton
class EdgeDetector @Inject constructor() {

    /**
     * Edge detect mode: returns blue-white glowing edges on black.
     * strength: 0f-1f threshold multiplier
     */
    suspend fun detectEdges(
        src: Bitmap,
        strength: Float = 0.5f,
        smoothness: Float = 0.5f
    ): Bitmap = withContext(Dispatchers.Default) {
        val w = src.width
        val h = src.height
        val pixels = IntArray(w * h)
        src.getPixels(pixels, 0, w, 0, 0, w, h)

        val gray = FloatArray(w * h) { i ->
            val c = pixels[i]
            (Color.red(c) * 0.299f + Color.green(c) * 0.587f + Color.blue(c) * 0.114f) / 255f
        }

        val threshold = 0.05f + (1f - strength) * 0.25f
        val out = IntArray(w * h)

        for (y in 1 until h - 1) {
            for (x in 1 until w - 1) {
                val idx = y * w + x
                val gx = -gray[(y-1)*w+(x-1)] - 2*gray[y*w+(x-1)] - gray[(y+1)*w+(x-1)] +
                          gray[(y-1)*w+(x+1)] + 2*gray[y*w+(x+1)] + gray[(y+1)*w+(x+1)]
                val gy = -gray[(y-1)*w+(x-1)] - 2*gray[(y-1)*w+x] - gray[(y-1)*w+(x+1)] +
                          gray[(y+1)*w+(x-1)] + 2*gray[(y+1)*w+x] + gray[(y+1)*w+(x+1)]
                val mag = sqrt(gx * gx + gy * gy)
                if (mag > threshold) {
                    val intensity = ((mag - threshold) / (1f - threshold)).coerceIn(0f, 1f)
                    val v = (intensity * 255).toInt()
                    // Blue-tinted glowing edges
                    out[idx] = Color.argb(v, (v * 0.4f).toInt(), (v * 0.55f).toInt(), v)
                } else {
                    out[idx] = Color.TRANSPARENT
                }
            }
        }

        Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also {
            it.setPixels(out, 0, w, 0, 0, w, h)
        }
    }

    /**
     * Line Art mode: clean black lines on white (or white on transparent).
     * Returns a bitmap suitable for tracing.
     */
    suspend fun convertToLineArt(
        src: Bitmap,
        strength: Float = 0.5f,
        detail: Float = 0.5f,
        smoothness: Float = 0.5f
    ): Bitmap = withContext(Dispatchers.Default) {
        val w = src.width
        val h = src.height
        val pixels = IntArray(w * h)
        src.getPixels(pixels, 0, w, 0, 0, w, h)

        val gray = FloatArray(w * h) { i ->
            val c = pixels[i]
            (Color.red(c) * 0.299f + Color.green(c) * 0.587f + Color.blue(c) * 0.114f) / 255f
        }

        // Apply simple box blur for smoothness
        val blurred = if (smoothness > 0.1f) boxBlur(gray, w, h, (smoothness * 2).toInt().coerceAtLeast(1))
                      else gray

        val threshold = 0.03f + (1f - strength) * 0.2f + (1f - detail) * 0.05f
        val out = IntArray(w * h)

        for (y in 1 until h - 1) {
            for (x in 1 until w - 1) {
                val idx = y * w + x
                val gx = -blurred[(y-1)*w+(x-1)] - 2*blurred[y*w+(x-1)] - blurred[(y+1)*w+(x-1)] +
                          blurred[(y-1)*w+(x+1)] + 2*blurred[y*w+(x+1)] + blurred[(y+1)*w+(x+1)]
                val gy = -blurred[(y-1)*w+(x-1)] - 2*blurred[(y-1)*w+x] - blurred[(y-1)*w+(x+1)] +
                          blurred[(y+1)*w+(x-1)] + 2*blurred[(y+1)*w+x] + blurred[(y+1)*w+(x+1)]
                val mag = sqrt(gx * gx + gy * gy)
                out[idx] = if (mag > threshold) {
                    Color.argb(255, 0, 0, 0)   // solid black line
                } else {
                    Color.argb(255, 255, 255, 255) // white background
                }
            }
        }
        // Fill border
        for (x in 0 until w) { out[x] = Color.WHITE; out[(h-1)*w+x] = Color.WHITE }
        for (y in 0 until h) { out[y*w] = Color.WHITE; out[y*w+(w-1)] = Color.WHITE }

        Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also {
            it.setPixels(out, 0, w, 0, 0, w, h)
        }
    }

    private fun boxBlur(src: FloatArray, w: Int, h: Int, radius: Int): FloatArray {
        val out = src.copyOf()
        val r = radius.coerceAtLeast(1)
        for (y in 0 until h) {
            for (x in 0 until w) {
                var sum = 0f; var count = 0
                for (dy in -r..r) for (dx in -r..r) {
                    val ny = (y + dy).coerceIn(0, h - 1)
                    val nx = (x + dx).coerceIn(0, w - 1)
                    sum += src[ny * w + nx]; count++
                }
                out[y * w + x] = sum / count
            }
        }
        return out
    }
}
