package com.artracestudio.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.artracestudio.app.ui.camera.CameraScreen
import com.artracestudio.app.ui.home.HomeScreen
import com.artracestudio.app.ui.settings.SettingsScreen
import com.artracestudio.app.ui.tutorial.TutorialScreen

sealed class Screen(val route: String) {
    object Home       : Screen("home")
    object Camera     : Screen("camera?projectId={projectId}") {
        fun buildRoute(projectId: Long? = null) =
            "camera?projectId=${projectId ?: -1L}"
    }
    object Settings   : Screen("settings")
    object Tutorial   : Screen("tutorial")
}

@Composable
fun ARTraceNavGraph(
    navController: NavHostController = rememberNavController()
) {
    NavHost(
        navController = navController,
        startDestination = Screen.Home.route
    ) {
        composable(Screen.Home.route) {
            HomeScreen(
                onNewTrace    = { navController.navigate(Screen.Camera.buildRoute()) },
                onOpenProject = { id -> navController.navigate(Screen.Camera.buildRoute(id)) },
                onTutorial    = { navController.navigate(Screen.Tutorial.route) },
                onSettings    = { navController.navigate(Screen.Settings.route) }
            )
        }

        composable(
            route = Screen.Camera.route,
            arguments = listOf(navArgument("projectId") {
                type = NavType.LongType
                defaultValue = -1L
            })
        ) {
            CameraScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Settings.route) {
            SettingsScreen(onNavigateBack = { navController.popBackStack() })
        }

        composable(Screen.Tutorial.route) {
            TutorialScreen(onFinish = { navController.popBackStack() })
        }
    }
}
