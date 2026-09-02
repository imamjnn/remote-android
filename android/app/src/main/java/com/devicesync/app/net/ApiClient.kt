package com.devicesync.app.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class RegisterResult(val deviceId: String, val deviceToken: String)

data class IceServerInfo(val urls: List<String>, val username: String?, val credential: String?)

class ApiException(message: String) : Exception(message)

/**
 * Talks to the auto-register REST endpoint (server/routes/devices.routes.ts,
 * POST /api/devices/register) before the app has any credential of its own.
 * There's exactly one parent in this deployment, so registration needs
 * nothing from the user -- no server URL, no pairing code. Everything after
 * that goes over [DeviceSocket] instead.
 */
class ApiClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    suspend fun registerDevice(serverUrl: String, deviceLabel: String): RegisterResult =
        withContext(Dispatchers.IO) {
            val payload = JSONObject().apply {
                put("deviceLabel", deviceLabel)
            }

            val request = Request.Builder()
                .url("${normalizeBaseUrl(serverUrl)}/api/devices/register")
                .post(payload.toString().toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(request).execute().use { response ->
                val bodyText = response.body?.string().orEmpty()

                if (!response.isSuccessful) {
                    val message = runCatching { JSONObject(bodyText).getString("error") }.getOrDefault(
                        "Pendaftaran gagal (HTTP ${response.code})",
                    )
                    throw ApiException(message)
                }

                val json = JSONObject(bodyText)
                RegisterResult(deviceId = json.getString("deviceId"), deviceToken = json.getString("deviceToken"))
            }
        }

    /** STUN/TURN config for WebRTC (see server/lib/ice.ts); no auth needed. */
    suspend fun fetchIceServers(serverUrl: String): List<IceServerInfo> =
        withContext(Dispatchers.IO) {
            val request = Request.Builder().url("${normalizeBaseUrl(serverUrl)}/api/ice-servers").get().build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use emptyList()

                val json = JSONObject(response.body?.string().orEmpty())
                val array = json.optJSONArray("iceServers") ?: return@use emptyList()

                (0 until array.length()).map { i ->
                    val entry = array.getJSONObject(i)
                    val urlsValue = entry.opt("urls")
                    val urls = when (urlsValue) {
                        is JSONArray -> (0 until urlsValue.length()).map { urlsValue.getString(it) }
                        is String -> listOf(urlsValue)
                        else -> emptyList()
                    }
                    IceServerInfo(
                        urls = urls,
                        username = entry.optString("username").takeIf { it.isNotEmpty() },
                        credential = entry.optString("credential").takeIf { it.isNotEmpty() },
                    )
                }
            }
        }
}

fun normalizeBaseUrl(input: String): String {
    val trimmed = input.trim().trimEnd('/')
    return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        trimmed
    } else {
        "http://$trimmed"
    }
}

fun httpToWs(baseUrl: String): String =
    when {
        baseUrl.startsWith("https://") -> "wss://" + baseUrl.removePrefix("https://")
        baseUrl.startsWith("http://") -> "ws://" + baseUrl.removePrefix("http://")
        else -> baseUrl
    }
