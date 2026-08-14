package com.artracestudio.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.artracestudio.app.domain.model.Project
import com.artracestudio.app.domain.repository.ProjectRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val projects: List<Project> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val showFirstRunTutorial: Boolean = false
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val repository: ProjectRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState(isLoading = true))
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        observeProjects()
    }

    private fun observeProjects() {
        viewModelScope.launch {
            repository.getAllProjects()
                .catch { e -> _uiState.update { it.copy(error = e.message, isLoading = false) } }
                .collect { projects ->
                    _uiState.update {
                        it.copy(projects = projects, isLoading = false, error = null)
                    }
                }
        }
    }

    fun deleteProject(id: Long) {
        viewModelScope.launch {
            runCatching { repository.deleteProject(id) }
                .onFailure { e -> _uiState.update { it.copy(error = "Delete failed: ${e.message}") } }
        }
    }

    fun renameProject(id: Long, newName: String) {
        viewModelScope.launch {
            runCatching { repository.renameProject(id, newName.trim().ifBlank { "Untitled" }) }
                .onFailure { e -> _uiState.update { it.copy(error = e.message) } }
        }
    }

    fun duplicateProject(id: Long) {
        viewModelScope.launch {
            runCatching { repository.duplicateProject(id) }
                .onFailure { e -> _uiState.update { it.copy(error = e.message) } }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
