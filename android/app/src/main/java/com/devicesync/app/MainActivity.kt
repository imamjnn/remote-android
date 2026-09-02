package com.devicesync.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.devicesync.app.data.DeviceStore
import com.devicesync.app.service.LocationTrackingService
import com.devicesync.app.ui.AutoRegisterScreen
import com.devicesync.app.ui.PermissionFlow
import com.devicesync.app.ui.StatusScreen
import com.devicesync.app.ui.theme.ChildTrackerTheme

private enum class Screen { Registering, Permissions, Status }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val deviceStore = DeviceStore(this)

        setContent {
            ChildTrackerTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    var screen by remember {
                        mutableStateOf(if (deviceStore.load() == null) Screen.Registering else Screen.Permissions)
                    }

                    when (screen) {
                        Screen.Registering -> AutoRegisterScreen(
                            deviceStore = deviceStore,
                            onRegistered = { screen = Screen.Permissions },
                        )

                        Screen.Permissions -> PermissionFlow(
                            onAllGranted = {
                                startTrackingService()
                                screen = Screen.Status
                            },
                        )

                        Screen.Status -> StatusScreen(
                            deviceStore = deviceStore,
                            onUnpair = { screen = Screen.Registering },
                        )
                    }
                }
            }
        }
    }

    private fun startTrackingService() {
        ContextCompat.startForegroundService(this, Intent(this, LocationTrackingService::class.java))
    }
}
