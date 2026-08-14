package com.artracestudio.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val ARTraceDarkColorScheme = darkColorScheme(
    primary              = PrimaryDark,
    onPrimary            = OnPrimary,
    primaryContainer     = PrimaryVariant,
    onPrimaryContainer   = OnPrimary,
    secondary            = AccentCyan,
    onSecondary          = BackgroundDark,
    background           = BackgroundDark,
    onBackground         = OnBackground,
    surface              = SurfaceDark,
    onSurface            = OnSurface,
    surfaceVariant       = SurfaceVariantDark,
    onSurfaceVariant     = OnSurfaceVariant,
    error                = AccentRed,
    onError              = Color.White,
    outline              = DividerColor,
    outlineVariant       = DividerColor,
    scrim                = Color(0xCC000000)
)

@Composable
fun ARTraceStudioTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = ARTraceDarkColorScheme,
        typography  = ARTraceTypography,
        content     = content
    )
}
