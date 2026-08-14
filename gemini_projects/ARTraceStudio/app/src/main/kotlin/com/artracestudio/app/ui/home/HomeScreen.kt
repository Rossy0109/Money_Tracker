package com.artracestudio.app.ui.home

import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.artracestudio.app.domain.model.Project
import com.artracestudio.app.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onNewTrace:    () -> Unit,
    onOpenProject: (Long) -> Unit,
    onTutorial:    () -> Unit,
    onSettings:    () -> Unit,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var projectToRename by remember { mutableStateOf<Project?>(null) }
    var renameText      by remember { mutableStateOf("") }

    // Error snackbar
    val snackbarHost = remember { SnackbarHostState() }
    LaunchedEffect(uiState.error) {
        uiState.error?.let {
            snackbarHost.showSnackbar(it)
            viewModel.clearError()
        }
    }

    Scaffold(
        containerColor  = BackgroundDark,
        snackbarHost    = { SnackbarHost(snackbarHost) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            "AR TRACE STUDIO",
                            style = MaterialTheme.typography.titleLarge.copy(
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 2.sp
                            ),
                            color = PrimaryDark
                        )
                        Text(
                            "Draw Anything Through Your Camera",
                            style = MaterialTheme.typography.labelSmall,
                            color = OnSurfaceVariant
                        )
                    }
                },
                actions = {
                    IconButton(onClick = onSettings) {
                        Icon(Icons.Outlined.Settings, "Settings", tint = OnSurfaceVariant)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = SurfaceDark
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(BackgroundDark)
        ) {
            // ── Hero buttons ────────────────────────────────────────────
            HeroSection(
                onNewTrace = onNewTrace,
                onTutorial = onTutorial
            )

            // ── Recent Projects ─────────────────────────────────────────
            if (uiState.projects.isNotEmpty()) {
                Text(
                    "MY PROJECTS",
                    style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 2.sp),
                    color = OnSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp)
                )
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(uiState.projects, key = { it.id }) { project ->
                        ProjectCard(
                            project     = project,
                            onOpen      = { onOpenProject(project.id) },
                            onRename    = {
                                projectToRename = project
                                renameText = project.name
                            },
                            onDuplicate = { viewModel.duplicateProject(project.id) },
                            onDelete    = { viewModel.deleteProject(project.id) }
                        )
                    }
                }
            } else if (!uiState.isLoading) {
                EmptyState(onNewTrace = onNewTrace)
            }
        }
    }

    // ── Rename dialog ─────────────────────────────────────────────────
    projectToRename?.let { project ->
        AlertDialog(
            onDismissRequest = { projectToRename = null },
            containerColor   = SurfaceVariantDark,
            title   = { Text("Rename Project", color = OnSurface) },
            text    = {
                OutlinedTextField(
                    value = renameText,
                    onValueChange = { renameText = it },
                    singleLine = true,
                    label = { Text("Project name") },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor   = PrimaryDark,
                        unfocusedBorderColor = DividerColor,
                        focusedTextColor     = OnSurface,
                        unfocusedTextColor   = OnSurface
                    )
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.renameProject(project.id, renameText)
                    projectToRename = null
                }) { Text("Rename", color = PrimaryDark) }
            },
            dismissButton = {
                TextButton(onClick = { projectToRename = null }) {
                    Text("Cancel", color = OnSurfaceVariant)
                }
            }
        )
    }
}

@Composable
private fun HeroSection(onNewTrace: () -> Unit, onTutorial: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    listOf(SurfaceDark, BackgroundDark)
                )
            )
            .padding(24.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // New Trace button (primary hero)
            Button(
                onClick  = onNewTrace,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = PrimaryDark
                )
            ) {
                Icon(Icons.Filled.Add, null, modifier = Modifier.size(24.dp))
                Spacer(Modifier.width(12.dp))
                Text(
                    "+ NEW TRACE",
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )
                )
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                OutlinedButton(
                    onClick  = onTutorial,
                    modifier = Modifier.weight(1f).height(48.dp),
                    shape    = RoundedCornerShape(12.dp),
                    border   = BorderStroke(1.dp, PrimaryDark.copy(alpha = 0.4f))
                ) {
                    Icon(
                        Icons.Outlined.PlayCircle, null,
                        tint = AccentCyan, modifier = Modifier.size(18.dp)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text("TUTORIAL", color = AccentCyan,
                        style = MaterialTheme.typography.labelLarge.copy(letterSpacing = 1.sp))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProjectCard(
    project:     Project,
    onOpen:      () -> Unit,
    onRename:    () -> Unit,
    onDuplicate: () -> Unit,
    onDelete:    () -> Unit
) {
    var showMenu by remember { mutableStateOf(false) }
    val dateFormat = remember { SimpleDateFormat("MMM dd, yyyy", Locale.getDefault()) }

    Card(
        onClick      = onOpen,
        colors       = CardDefaults.cardColors(containerColor = SurfaceDark),
        shape        = RoundedCornerShape(14.dp),
        modifier     = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Thumbnail
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(SurfaceVariantDark),
                contentAlignment = Alignment.Center
            ) {
                if (project.imageUri.isNotBlank()) {
                    AsyncImage(
                        model            = project.imageUri,
                        contentDescription = "Project thumbnail",
                        contentScale     = ContentScale.Crop,
                        modifier         = Modifier.fillMaxSize()
                    )
                } else {
                    Icon(Icons.Outlined.Image, null, tint = OnSurfaceVariant)
                }
            }

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    project.name,
                    style  = MaterialTheme.typography.titleMedium,
                    color  = OnSurface,
                    maxLines  = 1,
                    overflow  = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    "Last edited: ${dateFormat.format(Date(project.updatedAt))}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = OnSurfaceVariant
                )
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    SurfaceBadge(project.imageMode.replaceFirstChar { it.uppercase() })
                    if (project.gridEnabled) SurfaceBadge("Grid")
                    if (project.isMirrorH || project.isMirrorV) SurfaceBadge("Mirror")
                }
            }

            // 3-dot menu
            Box {
                IconButton(onClick = { showMenu = true }) {
                    Icon(Icons.Filled.MoreVert, "Options", tint = OnSurfaceVariant)
                }
                DropdownMenu(
                    expanded         = showMenu,
                    onDismissRequest = { showMenu = false },
                    containerColor   = SurfaceVariantDark
                ) {
                    DropdownMenuItem(
                        text    = { Text("Open", color = OnSurface) },
                        onClick = { showMenu = false; onOpen() },
                        leadingIcon = { Icon(Icons.Outlined.FolderOpen, null, tint = PrimaryDark) }
                    )
                    DropdownMenuItem(
                        text    = { Text("Rename", color = OnSurface) },
                        onClick = { showMenu = false; onRename() },
                        leadingIcon = { Icon(Icons.Outlined.Edit, null, tint = AccentCyan) }
                    )
                    DropdownMenuItem(
                        text    = { Text("Duplicate", color = OnSurface) },
                        onClick = { showMenu = false; onDuplicate() },
                        leadingIcon = { Icon(Icons.Outlined.ContentCopy, null, tint = AccentCyan) }
                    )
                    HorizontalDivider(color = DividerColor)
                    DropdownMenuItem(
                        text    = { Text("Delete", color = AccentRed) },
                        onClick = { showMenu = false; onDelete() },
                        leadingIcon = { Icon(Icons.Outlined.Delete, null, tint = AccentRed) }
                    )
                }
            }
        }
    }
}

@Composable
private fun SurfaceBadge(text: String) {
    Surface(
        color  = SurfaceVariantDark,
        shape  = RoundedCornerShape(4.dp)
    ) {
        Text(
            text,
            style    = MaterialTheme.typography.labelSmall,
            color    = OnSurfaceVariant,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
        )
    }
}

@Composable
private fun EmptyState(onNewTrace: () -> Unit) {
    Box(
        modifier          = Modifier.fillMaxSize(),
        contentAlignment  = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Outlined.CameraEnhance,
                null,
                modifier = Modifier.size(72.dp),
                tint     = OnSurfaceVariant.copy(alpha = 0.4f)
            )
            Spacer(Modifier.height(16.dp))
            Text("No projects yet", color = OnSurfaceVariant,
                style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(6.dp))
            Text("Start your first AR trace!", color = OnSurfaceVariant.copy(alpha = 0.6f),
                style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(24.dp))
            Button(onClick = onNewTrace, colors = ButtonDefaults.buttonColors(containerColor = PrimaryDark)) {
                Text("Start New Trace")
            }
        }
    }
}
