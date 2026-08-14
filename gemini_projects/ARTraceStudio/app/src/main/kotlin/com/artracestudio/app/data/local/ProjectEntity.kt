package com.artracestudio.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "projects")
data class ProjectEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    val name: String,
    val imageUri: String,
    val thumbnailUri: String = "",
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val opacity: Float = 0.35f,
    val scale: Float = 1f,
    val rotation: Float = 0f,
    val translationX: Float = 0f,
    val translationY: Float = 0f,
    val isMirrorH: Boolean = false,
    val isMirrorV: Boolean = false,
    val gridEnabled: Boolean = false,
    val gridDivisions: Int = 4,
    val imageMode: String = "original",
    val brightness: Float = 0f,
    val contrast: Float = 1f,
    val calibrationPointsJson: String = "[]",
    val isCalibrated: Boolean = false,
    val paperSize: String = "A4"
)
