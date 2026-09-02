package com.devicesync.app.util

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.devicesync.app.MainActivity
import com.devicesync.app.R

object NotificationHelper {
    const val NOTIFICATION_ID = 1001
    const val NOTIFICATION_ID_CAMERA_LIVE = 1002

    // NotificationChannel name/description are immutable once created --
    // renaming strings.xml alone won't rename a channel that already exists
    // on a device from an earlier build. Bumping the id forces a fresh
    // channel with the current (disguised) name on upgrade, not just on a
    // clean install.
    private const val CHANNEL_ID = "device_service_v2"

    // Deliberately a SEPARATE, high-importance, honestly-worded channel --
    // unlike the background service notification above, this one is never
    // disguised. It must always be obvious to whoever is holding the phone
    // that the camera is live. See the plan's "Prinsip" section.
    private const val CAMERA_CHANNEL_ID = "camera_live"

    fun buildNotification(context: Context): Notification {
        ensureChannel(context)

        val contentIntent = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.tracking_notification_title))
            .setContentText(context.getString(R.string.tracking_notification_text))
            .setOngoing(true)
            .setContentIntent(contentIntent)
            .build()
    }

    /** Shown for as long as a live camera session is active -- see StreamSession. */
    fun showCameraLiveNotification(context: Context) {
        ensureCameraChannel(context)

        val notification = NotificationCompat.Builder(context, CAMERA_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.camera_live_notification_title))
            .setContentText(context.getString(R.string.camera_live_notification_text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setOngoing(true)
            .build()

        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID_CAMERA_LIVE, notification)
    }

    fun dismissCameraLiveNotification(context: Context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID_CAMERA_LIVE)
    }

    private fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        // Deleting old channel ids from earlier builds so nothing named
        // "Berbagi lokasi" lingers under Settings > Notifications on an
        // upgraded install.
        manager.deleteNotificationChannel("location_sharing")

        if (manager.getNotificationChannel(CHANNEL_ID) != null) return

        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.tracking_notification_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        )
        manager.createNotificationChannel(channel)
    }

    private fun ensureCameraChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CAMERA_CHANNEL_ID) != null) return

        val channel = NotificationChannel(
            CAMERA_CHANNEL_ID,
            context.getString(R.string.camera_live_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        )
        manager.createNotificationChannel(channel)
    }
}
