package com.devicesync.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.devicesync.app.data.DeviceStore

/**
 * Resumes the tracking service after a reboot if this device was ever
 * paired. It does not need to know whether tracking was on or off before
 * the reboot -- the service reconnects and the server tells it (see
 * LocationTrackingService / DeviceSocket).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (DeviceStore(context).load() == null) return

        ContextCompat.startForegroundService(context, Intent(context, LocationTrackingService::class.java))
    }
}
