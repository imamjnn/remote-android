package com.devicesync.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * A device's pairing credentials. [deviceToken] is a bearer credential scoped
 * to this device only (see server/routes/pairing.routes.ts), so it's kept in
 * an encrypted preferences file rather than plain SharedPreferences.
 */
data class PairedDevice(
    val serverUrl: String,
    val deviceId: String,
    val deviceToken: String,
)

class DeviceStore(context: Context) {
    private val appContext = context.applicationContext

    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            appContext,
            "device_store",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun save(device: PairedDevice) {
        prefs.edit()
            .putString(KEY_SERVER_URL, device.serverUrl)
            .putString(KEY_DEVICE_ID, device.deviceId)
            .putString(KEY_DEVICE_TOKEN, device.deviceToken)
            .apply()
    }

    fun load(): PairedDevice? {
        val serverUrl = prefs.getString(KEY_SERVER_URL, null) ?: return null
        val deviceId = prefs.getString(KEY_DEVICE_ID, null) ?: return null
        val deviceToken = prefs.getString(KEY_DEVICE_TOKEN, null) ?: return null
        return PairedDevice(serverUrl, deviceId, deviceToken)
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_DEVICE_TOKEN = "device_token"
    }
}
