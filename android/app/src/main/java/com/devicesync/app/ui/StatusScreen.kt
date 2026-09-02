package com.devicesync.app.ui

import android.content.Intent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.devicesync.app.data.DeviceStore
import com.devicesync.app.service.LocationTrackingService

@Composable
fun StatusScreen(deviceStore: DeviceStore, onUnpair: () -> Unit) {
    val context = LocalContext.current
    val device = deviceStore.load()

    Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
        Text("Status Layanan", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(16.dp))
        Text("Server: ${device?.serverUrl ?: "-"}")
        Text("ID Perangkat: ${device?.deviceId ?: "-"}")
        Spacer(Modifier.height(8.dp))
        Text(
            "Layanan latar belakang aktif dan tersinkron dengan server. Untuk hasil terbaik, jangan hapus " +
                "aplikasi ini dan pastikan semua izin di atas tetap aktif.",
        )

        Spacer(Modifier.height(32.dp))
        OutlinedButton(
            onClick = {
                context.stopService(Intent(context, LocationTrackingService::class.java))
                deviceStore.clear()
                onUnpair()
            },
        ) {
            Text("Daftar ulang")
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "Ini akan membuat ID perangkat baru di server. ID lama akan tetap tersimpan di server sampai " +
                "dibersihkan.",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
