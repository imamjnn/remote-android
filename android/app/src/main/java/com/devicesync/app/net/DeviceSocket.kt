package com.devicesync.app.net

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.min

sealed interface DeviceCommand {
    data object Start : DeviceCommand
    data object Stop : DeviceCommand
    data class StartStream(val sessionId: String, val camera: String) : DeviceCommand
    data class StopStream(val sessionId: String) : DeviceCommand
}

data class IceCandidateMessage(val sdpMid: String?, val sdpMLineIndex: Int, val candidate: String)

interface DeviceSocketListener {
    fun onCommand(command: DeviceCommand)
    fun onConnectionChanged(connected: Boolean)
    fun onRemoteAnswer(sessionId: String, sdp: String)
    fun onRemoteIceCandidate(sessionId: String, candidate: IceCandidateMessage)
}

/**
 * Owns the single long-lived connection to /ws/device (server/ws/device.ws.ts).
 * On every (re)connect the server immediately tells us the current desired
 * tracking state, so this class never needs to remember locally whether it
 * should be tracking across process death / reboot (see server/ws/device.ws.ts
 * open() and the plan's "reliability of start/stop delivery" section).
 *
 * Also carries WebRTC signaling for the live camera view: this socket is
 * just a relay (see server/ws/parent.ws.ts and device.ws.ts) -- the actual
 * video never touches the server.
 */
class DeviceSocket(
    private val serverUrl: String,
    private val deviceId: String,
    private val deviceToken: String,
    private val listener: DeviceSocketListener,
    private val scope: CoroutineScope,
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private var stopped = false
    private var attempt = 0
    private var reconnectJob: Job? = null

    fun connect() {
        stopped = false
        openSocket()
    }

    fun disconnect() {
        stopped = true
        reconnectJob?.cancel()
        webSocket?.close(1000, "client disconnect")
        webSocket = null
    }

    fun sendLocation(lat: Double, lng: Double, accuracy: Float?, speed: Float?, recordedAt: Long) {
        val payload = JSONObject().apply {
            put("type", "location")
            put("lat", lat)
            put("lng", lng)
            if (accuracy != null) put("accuracy", accuracy)
            if (speed != null) put("speed", speed)
            put("recordedAt", recordedAt)
        }
        webSocket?.send(payload.toString())
    }

    fun sendOffer(sessionId: String, sdp: String) {
        val payload = JSONObject().apply {
            put("type", "webrtc_offer")
            put("sessionId", sessionId)
            put("sdp", sdp)
        }
        webSocket?.send(payload.toString())
    }

    fun sendIceCandidate(sessionId: String, candidate: IceCandidateMessage) {
        val payload = JSONObject().apply {
            put("type", "webrtc_ice_candidate")
            put("sessionId", sessionId)
            put(
                "candidate",
                JSONObject().apply {
                    put("candidate", candidate.candidate)
                    put("sdpMid", candidate.sdpMid)
                    put("sdpMLineIndex", candidate.sdpMLineIndex)
                },
            )
        }
        webSocket?.send(payload.toString())
    }

    private fun openSocket() {
        val wsUrl = "${httpToWs(serverUrl)}/ws/device?deviceId=$deviceId&token=$deviceToken"
        val request = Request.Builder().url(wsUrl).build()

        webSocket = client.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    attempt = 0
                    listener.onConnectionChanged(true)
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    val json = runCatching { JSONObject(text) }.getOrNull() ?: return
                    when (json.optString("type")) {
                        "command" -> handleCommand(json)
                        "webrtc_answer" -> handleAnswer(json)
                        "webrtc_ice_candidate" -> handleIceCandidate(json)
                    }
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    listener.onConnectionChanged(false)
                    scheduleReconnect()
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    Log.w(TAG, "device socket failure: ${t.message}")
                    listener.onConnectionChanged(false)
                    scheduleReconnect()
                }
            },
        )
    }

    private fun handleCommand(json: JSONObject) {
        when (json.optString("action")) {
            "start" -> listener.onCommand(DeviceCommand.Start)
            "stop" -> listener.onCommand(DeviceCommand.Stop)
            "start_stream" -> {
                val sessionId = json.optString("sessionId").takeIf { it.isNotEmpty() } ?: return
                val camera = json.optString("camera", "back")
                listener.onCommand(DeviceCommand.StartStream(sessionId, camera))
            }
            "stop_stream" -> {
                val sessionId = json.optString("sessionId").takeIf { it.isNotEmpty() } ?: return
                listener.onCommand(DeviceCommand.StopStream(sessionId))
            }
        }
    }

    private fun handleAnswer(json: JSONObject) {
        val sessionId = json.optString("sessionId").takeIf { it.isNotEmpty() } ?: return
        val sdp = json.optString("sdp").takeIf { it.isNotEmpty() } ?: return
        listener.onRemoteAnswer(sessionId, sdp)
    }

    private fun handleIceCandidate(json: JSONObject) {
        val sessionId = json.optString("sessionId").takeIf { it.isNotEmpty() } ?: return
        val candidateJson = json.optJSONObject("candidate") ?: return
        val candidate = IceCandidateMessage(
            sdpMid = candidateJson.optString("sdpMid").takeIf { it.isNotEmpty() },
            sdpMLineIndex = candidateJson.optInt("sdpMLineIndex", 0),
            candidate = candidateJson.optString("candidate"),
        )
        listener.onRemoteIceCandidate(sessionId, candidate)
    }

    private fun scheduleReconnect() {
        if (stopped) return
        attempt += 1
        val delayMs = min(1000L * (1L shl attempt.coerceAtMost(5)), 30_000L)
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(delayMs)
            if (!stopped) openSocket()
        }
    }

    companion object {
        private const val TAG = "DeviceSocket"
    }
}
