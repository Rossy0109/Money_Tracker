package com.artracestudio.app.image

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Canvas as AndroidCanvas
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.min

/**
 * Handles all bitmap loading, EXIF correction, downsampling,
 * and basic image adjustment (brightness, contrast, saturation).
 */
@Singleton
class ImageProcessor @Inject constructor(
    private val context: Context
) {
    companion object {
        private const val MAX_TEXTURE_SIZE = 2048
        private const val JPEG_QUALITY     = 90
    }

    /**
     * Load a URI into a Bitmap, correcting EXIF rotation and downsampling
     * to a safe maximum texture size. Returns null on failure.
     */
    suspend fun loadBitmapFromUri(uri: Uri): Bitmap? = withContext(Dispatchers.IO) {
        runCatching {
            val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            context.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, options)
            }
            val (w, h) = options.outWidth to options.outHeight
            if (w <= 0 || h <= 0) return@runCatching null

            // Calculate safe sample size
            val sampleSize = calculateSampleSize(w, h, MAX_TEXTURE_SIZE, MAX_TEXTURE_SIZE)
            val decodeOpts = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            val raw = context.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, decodeOpts)
            } ?: return@runCatching null

            // Fix EXIF rotation
            val rotated = fixExifRotation(uri, raw)
            rotated
        }.getOrNull()
    }

    /**
     * Apply brightness, contrast, and saturation adjustments to a bitmap.
     * Returns a new Bitmap (does not mutate the original).
     */
    fun applyAdjustments(
        src: Bitmap,
        brightness: Float = 0f,   // -1f to 1f
        contrast: Float   = 1f,   // 0.5f to 2f
        saturation: Float = 1f    // 0f to 2f
    ): Bitmap {
        val result = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        val canvas = AndroidCanvas(result)

        val cm = ColorMatrix()
        // Saturation
        val sat = ColorMatrix()
        sat.setSaturation(saturation)
        cm.postConcat(sat)

        // Contrast + brightness
        // contrast scale: [0.5, 2], map to matrix scale
        val scale = contrast
        val translate = (-0.5f * scale + 0.5f + brightness) * 255f
        val contrastMatrix = ColorMatrix(floatArrayOf(
            scale, 0f,    0f,    0f, translate,
            0f,    scale, 0f,    0f, translate,
            0f,    0f,    scale, 0f, translate,
            0f,    0f,    0f,    1f, 0f
        ))
        cm.postConcat(contrastMatrix)

        val paint = Paint().apply { colorFilter = ColorMatrixColorFilter(cm) }
        canvas.drawBitmap(src, 0f, 0f, paint)
        return result
    }

    private fun calculateSampleSize(w: Int, h: Int, maxW: Int, maxH: Int): Int {
        var sampleSize = 1
        while ((w / sampleSize) > maxW || (h / sampleSize) > maxH) {
            sampleSize *= 2
        }
        return sampleSize
    }

    private fun fixExifRotation(uri: Uri, bitmap: Bitmap): Bitmap {
        val degrees = try {
            context.contentResolver.openInputStream(uri)?.use { stream ->
                val exif = ExifInterface(stream)
                when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION,
                    ExifInterface.ORIENTATION_NORMAL)) {
                    ExifInterface.ORIENTATION_ROTATE_90  -> 90
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270
                    else -> 0
                }
            } ?: 0
        } catch (e: Exception) { 0 }

        if (degrees == 0) return bitmap
        val matrix = android.graphics.Matrix().apply { postRotate(degrees.toFloat()) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            .also { if (it !== bitmap) bitmap.recycle() }
    }
}
