package com.devicesync.app.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

private enum class PermissionStep {
    ForegroundLocation,
    Camera,
    BackgroundLocation,
    Notifications,
    BatteryOptimization,
    Done,
}

/**
 * Walks a parent through every permission the tracking service needs, one
 * screen at a time, in the order Android requires them (foreground location
 * must already be granted before background location can be requested, per
 * https://developer.android.com/training/location/permissions).
 */
@Composable
fun PermissionFlow(onAllGranted: () -> Unit) {
    val context = LocalContext.current
    var step by remember { mutableStateOf(currentStep(context)) }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) step = currentStep(context)
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(step) {
        if (step == PermissionStep.Done) onAllGranted()
    }

    val foregroundLocationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        step = currentStep(context)
    }

    val notificationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        step = currentStep(context)
    }

    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        step = currentStep(context)
    }

    when (step) {
        PermissionStep.ForegroundLocation -> PermissionStepScreen(
            title = "Izinkan Akses",
            description = "Aplikasi ini memerlukan izin lokasi agar layanan latar belakang dapat berfungsi dengan baik.",
            buttonText = "Lanjutkan",
            onClick = {
                foregroundLocationLauncher.launch(
                    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                )
            },
        )

        PermissionStep.Camera -> PermissionStepScreen(
            title = "Izin Kamera",
            description = "Aplikasi ini memerlukan izin kamera untuk fitur live camera view.",
            buttonText = "Lanjutkan",
            onClick = { cameraLauncher.launch(Manifest.permission.CAMERA) },
        )

        PermissionStep.BackgroundLocation -> PermissionStepScreen(
            title = "Izinkan di Latar Belakang",
            description = "Supaya layanan ini tetap berjalan walau aplikasi tidak sedang dibuka, pilih \"Izinkan sepanjang waktu\" di halaman pengaturan berikutnya.",
            buttonText = "Buka pengaturan",
            onClick = {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.fromParts("package", context.packageName, null)
                }
                context.startActivity(intent)
            },
        )

        PermissionStep.Notifications -> PermissionStepScreen(
            title = "Izin Notifikasi",
            description = "Android mewajibkan notifikasi tetap tampil selagi layanan latar belakang aktif.",
            buttonText = "Lanjutkan",
            onClick = { notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS) },
        )

        PermissionStep.BatteryOptimization -> PermissionStepScreen(
            title = "Nonaktifkan Optimasi Baterai",
            description = "Supaya sistem tidak menghentikan layanan ini di latar belakang, izinkan aplikasi berjalan tanpa optimasi baterai. Beberapa merk HP (Xiaomi, Oppo, Vivo, dll) punya pengaturan baterai tambahan sendiri -- aktifkan juga \"izinkan berjalan di latar belakang\" di sana jika tersedia.",
            buttonText = "Buka pengaturan baterai",
            onClick = {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${context.packageName}")
                }
                runCatching { context.startActivity(intent) }
            },
        )

        PermissionStep.Done -> Unit
    }
}

private fun currentStep(context: Context): PermissionStep {
    fun granted(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    if (!granted(Manifest.permission.ACCESS_FINE_LOCATION)) return PermissionStep.ForegroundLocation
    if (!granted(Manifest.permission.CAMERA)) return PermissionStep.Camera
    if (!granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION)) return PermissionStep.BackgroundLocation
    if (!granted(Manifest.permission.POST_NOTIFICATIONS)) return PermissionStep.Notifications

    val powerManager = context.getSystemService(PowerManager::class.java)
    val ignoringBatteryOptimizations = powerManager?.isIgnoringBatteryOptimizations(context.packageName) ?: true
    if (!ignoringBatteryOptimizations) return PermissionStep.BatteryOptimization

    return PermissionStep.Done
}

@Composable
private fun PermissionStepScreen(title: String, description: String, buttonText: String, onClick: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        Text(description, textAlign = TextAlign.Center)
        Spacer(Modifier.height(24.dp))
        Button(onClick = onClick) { Text(buttonText) }
    }
}
