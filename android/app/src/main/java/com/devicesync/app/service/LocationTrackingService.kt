package com.devicesync.app.service

import android.app.Service
import android.content.Intent
import android.os.IBinder
import com.devicesync.app.data.DeviceStore
import com.devicesync.app.net.ApiClient
import com.devicesync.app.net.DeviceCommand
import com.devicesync.app.net.DeviceSocket
import com.devicesync.app.net.DeviceSocketListener
import com.devicesync.app.net.IceCandidateMessage
import com.devicesync.app.util.NotificationHelper
import com.devicesync.app.webrtc.CameraFacing
import com.devicesync.app.webrtc.StreamSession
import com.devicesync.app.webrtc.toRtcIceServer
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * A foreground service (type "location|camera") that owns the device's
 * realtime connection, GPS updates, and live camera streaming. It is
 * designed to survive the app being swiped away from Recents (START_STICKY
 * + a proper foreground service type keeps Android from tearing it down)
 * and to resume automatically after a reboot via [BootReceiver].
 *
 * It deliberately does not track "should I be tracking" as local state
 * across restarts -- see [DeviceSocket], which always defers to whatever
 * the server says on (re)connect.
 */
class LocationTrackingService : Service(), DeviceSocketListener {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private val apiClient = ApiClient()

    private var deviceSocket: DeviceSocket? = null
    private var locationCallback: LocationCallback? = null
    private var isTracking = false
    private var serverUrl: String? = null

    private var activeStream: StreamSession? = null
    private var activeSessionId: String? = null
    private var streamSafetyJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NotificationHelper.NOTIFICATION_ID, NotificationHelper.buildNotification(this))

        if (deviceSocket == null) {
            val device = DeviceStore(this).load()
            if (device == null) {
                stopSelf()
                return START_NOT_STICKY
            }
            serverUrl = device.serverUrl
            deviceSocket = DeviceSocket(
                serverUrl = device.serverUrl,
                deviceId = device.deviceId,
                deviceToken = device.deviceToken,
                listener = this,
                scope = serviceScope,
            ).also { it.connect() }
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopActiveStream()
        deviceSocket?.disconnect()
        stopLocationUpdates()
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onCommand(command: DeviceCommand) {
        when (command) {
            DeviceCommand.Start -> startLocationUpdates()
            DeviceCommand.Stop -> stopLocationUpdates()
            is DeviceCommand.StartStream -> startStream(command.sessionId, command.camera)
            is DeviceCommand.StopStream -> {
                if (command.sessionId == activeSessionId) stopActiveStream()
            }
        }
    }

    override fun onConnectionChanged(connected: Boolean) {
        // The notification stays static for the MVP; connection state is
        // only surfaced in StatusScreen while the app is open.
        if (!connected) stopActiveStream()
    }

    override fun onRemoteAnswer(sessionId: String, sdp: String) {
        if (sessionId == activeSessionId) activeStream?.setRemoteAnswer(sdp)
    }

    override fun onRemoteIceCandidate(sessionId: String, candidate: IceCandidateMessage) {
        if (sessionId == activeSessionId) activeStream?.addRemoteIceCandidate(candidate)
    }

    private fun startStream(sessionId: String, camera: String) {
        val url = serverUrl ?: return
        // Only one active session per device at a time -- a new request
        // replaces whatever was running.
        stopActiveStream()
        activeSessionId = sessionId

        serviceScope.launch {
            val iceServers = runCatching { apiClient.fetchIceServers(url) }.getOrDefault(emptyList())
                .map { it.toRtcIceServer() }

            if (sessionId != activeSessionId) return@launch // superseded while we were fetching

            val session = StreamSession(
                context = this@LocationTrackingService,
                sessionId = sessionId,
                cameraFacing = if (camera == "front") CameraFacing.FRONT else CameraFacing.BACK,
                iceServers = iceServers,
                onLocalOffer = { sdp -> deviceSocket?.sendOffer(sessionId, sdp) },
                onLocalIceCandidate = { candidate -> deviceSocket?.sendIceCandidate(sessionId, candidate) },
                onFailure = { if (sessionId == activeSessionId) stopActiveStream() },
            )
            activeStream = session
            NotificationHelper.showCameraLiveNotification(this@LocationTrackingService)
            session.start()

            // Safety cap: if a "stop" signal is ever lost (network drop,
            // parent closes the tab without cleanup, etc.) the camera does
            // not stay live indefinitely -- the parent just has to ask again.
            streamSafetyJob?.cancel()
            streamSafetyJob = serviceScope.launch {
                delay(MAX_STREAM_DURATION_MS)
                if (sessionId == activeSessionId) stopActiveStream()
            }
        }
    }

    private fun stopActiveStream() {
        streamSafetyJob?.cancel()
        streamSafetyJob = null
        activeStream?.stop()
        activeStream = null
        if (activeSessionId != null) NotificationHelper.dismissCameraLiveNotification(this)
        activeSessionId = null
    }

    private fun startLocationUpdates() {
        if (isTracking) return
        isTracking = true

        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_INTERVAL_MS)
            .setMinUpdateIntervalMillis(MIN_UPDATE_INTERVAL_MS)
            .build()

        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val location = result.lastLocation ?: return
                deviceSocket?.sendLocation(
                    lat = location.latitude,
                    lng = location.longitude,
                    accuracy = location.accuracy,
                    speed = if (location.hasSpeed()) location.speed else null,
                    recordedAt = location.time,
                )
            }
        }
        locationCallback = callback

        try {
            fusedLocationClient.requestLocationUpdates(request, callback, mainLooper)
        } catch (e: SecurityException) {
            // Location permission was revoked after pairing; the app's
            // PermissionFlow will catch this the next time it's opened.
            isTracking = false
        }
    }

    private fun stopLocationUpdates() {
        isTracking = false
        locationCallback?.let { fusedLocationClient.removeLocationUpdates(it) }
        locationCallback = null
    }

    companion object {
        // Tighter than a typical background tracker on purpose: this app's
        // whole point is the parent seeing where the child is *now*, so we
        // trade some battery life for a snappier map. Revisit if real-device
        // battery testing shows this is too aggressive.
        private const val UPDATE_INTERVAL_MS = 5_000L
        private const val MIN_UPDATE_INTERVAL_MS = 3_000L

        private const val MAX_STREAM_DURATION_MS = 5 * 60 * 1000L
    }
}
