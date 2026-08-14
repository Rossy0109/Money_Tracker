package com.artracestudio.app.data.repository

import com.artracestudio.app.data.local.ProjectDao
import com.artracestudio.app.data.local.ProjectEntity
import com.artracestudio.app.domain.model.Project
import com.artracestudio.app.domain.repository.ProjectRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProjectRepositoryImpl @Inject constructor(
    private val dao: ProjectDao
) : ProjectRepository {

    override fun getAllProjects(): Flow<List<Project>> =
        dao.getAllProjects().map { list -> list.map { it.toDomain() } }

    override suspend fun getProjectById(id: Long): Project? =
        dao.getProjectById(id)?.toDomain()

    override suspend fun saveProject(project: Project): Long =
        dao.insertProject(project.toEntity())

    override suspend fun updateProject(project: Project) =
        dao.updateProject(project.toEntity())

    override suspend fun deleteProject(id: Long) =
        dao.deleteProject(id)

    override suspend fun renameProject(id: Long, name: String) =
        dao.renameProject(id, name)

    override suspend fun duplicateProject(id: Long): Long? {
        val original = dao.getProjectById(id) ?: return null
        val duplicate = original.copy(
            id = 0L,
            name = "${original.name} (Copy)",
            createdAt = System.currentTimeMillis(),
            updatedAt = System.currentTimeMillis()
        )
        return dao.insertProject(duplicate)
    }

    // ── Mappers ───────────────────────────────────────────────────────────

    private fun ProjectEntity.toDomain() = Project(
        id = id, name = name, imageUri = imageUri, thumbnailUri = thumbnailUri,
        createdAt = createdAt, updatedAt = updatedAt, opacity = opacity,
        scale = scale, rotation = rotation, translationX = translationX,
        translationY = translationY, isMirrorH = isMirrorH, isMirrorV = isMirrorV,
        gridEnabled = gridEnabled, gridDivisions = gridDivisions,
        imageMode = imageMode, brightness = brightness, contrast = contrast,
        calibrationPointsJson = calibrationPointsJson, isCalibrated = isCalibrated,
        paperSize = paperSize
    )

    private fun Project.toEntity() = ProjectEntity(
        id = id, name = name, imageUri = imageUri, thumbnailUri = thumbnailUri,
        createdAt = createdAt, updatedAt = updatedAt, opacity = opacity,
        scale = scale, rotation = rotation, translationX = translationX,
        translationY = translationY, isMirrorH = isMirrorH, isMirrorV = isMirrorV,
        gridEnabled = gridEnabled, gridDivisions = gridDivisions,
        imageMode = imageMode, brightness = brightness, contrast = contrast,
        calibrationPointsJson = calibrationPointsJson, isCalibrated = isCalibrated,
        paperSize = paperSize
    )
}
