package com.artracestudio.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class ARTraceApplication : Application() {
    override fun onCreate() {
        super.onCreate()
    }
}
