package com.devicesync.app.ui

import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.devicesync.app.BuildConfig
import com.devicesync.app.data.DeviceStore
import com.devicesync.app.data.PairedDevice
import com.devicesync.app.net.ApiClient
import com.devicesync.app.net.normalizeBaseUrl

/**
 * There's no pairing UI: the server URL is baked in at build time
 * (BuildConfig.SERVER_URL) and this deployment has exactly one parent
 * account (see server/auth/bootstrap.ts), so a freshly installed app just
 * registers itself against that parent with no input from anyone.
 */
@Composable
fun AutoRegisterScreen(deviceStore: DeviceStore, onRegistered: () -> Unit) {
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableStateOf(0) }
    val apiClient = remember { ApiClient() }

    LaunchedEffect(attempt) {
        error = null
        try {
            val result = apiClient.registerDevice(BuildConfig.SERVER_URL, deviceDisplayName())
            deviceStore.save(
                PairedDevice(
                    serverUrl = normalizeBaseUrl(BuildConfig.SERVER_URL),
                    deviceId = result.deviceId,
                    deviceToken = result.deviceToken,
                ),
            )
            onRegistered()
        } catch (e: Exception) {
            error = e.message ?: "Gagal mendaftar ke server"
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (error == null) {
            CircularProgressIndicator()
            Spacer(Modifier.height(16.dp))
            Text("Menghubungkan ke server...", style = MaterialTheme.typography.bodyLarge)
        } else {
            Text("Gagal Terhubung", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(12.dp))
            Text(error ?: "", textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(8.dp))
            Text(
                "Pastikan HP ini terhubung ke jaringan yang sama dengan server (${BuildConfig.SERVER_URL}).",
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(24.dp))
            Button(onClick = { attempt += 1 }) { Text("Coba lagi") }
        }
    }
}

/**
 * A human-readable model/type name for this physical device, e.g. "Samsung
 * SM-G998B" or "Pixel 7" -- shown in the parent's device list instead of a
 * generic "Child device" label. Falls back to that generic label only if
 * the platform ever reports an empty model (shouldn't happen in practice).
 */
private fun deviceDisplayName(): String {
    val manufacturer = Build.MANUFACTURER?.trim().orEmpty()
    val model = Build.MODEL?.trim().orEmpty()

    if (model.isEmpty()) return "Child device"
    if (manufacturer.isEmpty() || model.contains(manufacturer, ignoreCase = true)) return model

    val manufacturerTitleCase = manufacturer.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
    return "$manufacturerTitleCase $model"
}
