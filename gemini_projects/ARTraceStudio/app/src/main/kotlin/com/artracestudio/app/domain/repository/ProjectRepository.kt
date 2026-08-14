package com.artracestudio.app.domain.repository

import com.artracestudio.app.domain.model.Project
import kotlinx.coroutines.flow.Flow

interface ProjectRepository {
    fun getAllProjects(): Flow<List<Project>>
    suspend fun getProjectById(id: Long): Project?
    suspend fun saveProject(project: Project): Long
    suspend fun updateProject(project: Project)
    suspend fun deleteProject(id: Long)
    suspend fun renameProject(id: Long, name: String)
    suspend fun duplicateProject(id: Long): Long?
}
