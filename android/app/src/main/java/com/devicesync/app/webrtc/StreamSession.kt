package com.devicesync.app.webrtc

import android.content.Context
import android.util.Log
import com.devicesync.app.net.IceCandidateMessage
import com.devicesync.app.net.IceServerInfo
import org.webrtc.Camera2Enumerator
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import org.webrtc.DataChannel as RtcDataChannel

enum class CameraFacing { FRONT, BACK }

fun IceServerInfo.toRtcIceServer(): PeerConnection.IceServer {
    val builder = PeerConnection.IceServer.builder(urls)
    if (username != null) builder.setUsername(username)
    if (credential != null) builder.setPassword(credential)
    return builder.createIceServer()
}

private fun noopSdpObserver(): SdpObserver = object : SdpObserver {
    override fun onCreateSuccess(description: SessionDescription?) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(error: String?) {}
    override fun onSetFailure(error: String?) {}
}

/**
 * One WebRTC broadcast session: this device is always the offerer/sender
 * (it owns the camera), the parent dashboard is always the answerer/viewer.
 * Video-only -- no audio track is ever created, by design (see the plan's
 * scope decision). The server (server/ws/parent.ws.ts, device.ws.ts) only
 * ever relays the SDP offer/answer and ICE candidates passed to the
 * callbacks here; it never sees the video itself.
 */
class StreamSession(
    private val context: Context,
    private val sessionId: String,
    private val cameraFacing: CameraFacing,
    private val iceServers: List<PeerConnection.IceServer>,
    private val onLocalOffer: (sdp: String) -> Unit,
    private val onLocalIceCandidate: (IceCandidateMessage) -> Unit,
    private val onFailure: () -> Unit,
) {
    private val eglBase = EglBase.create()
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var videoCapturer: VideoCapturer? = null
    private var videoSource: VideoSource? = null
    private var videoTrack: VideoTrack? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null

    fun start() {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions(),
        )

        val factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
            .createPeerConnectionFactory()
        peerConnectionFactory = factory

        val capturer = createCapturer()
        if (capturer == null) {
            Log.w(TAG, "no camera available for $cameraFacing")
            onFailure()
            return
        }
        videoCapturer = capturer

        val helper = SurfaceTextureHelper.create("StreamSessionCaptureThread", eglBase.eglBaseContext)
        surfaceTextureHelper = helper

        val source = factory.createVideoSource(capturer.isScreencast)
        videoSource = source
        capturer.initialize(helper, context, source.capturerObserver)
        capturer.startCapture(CAPTURE_WIDTH, CAPTURE_HEIGHT, CAPTURE_FPS)

        val track = factory.createVideoTrack("video-$sessionId", source)
        videoTrack = track

        val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        }

        val connection = factory.createPeerConnection(rtcConfig, peerConnectionObserver())
        if (connection == null) {
            Log.w(TAG, "failed to create PeerConnection")
            onFailure()
            return
        }
        peerConnection = connection
        connection.addTrack(track, listOf("stream-$sessionId"))

        connection.createOffer(
            object : SdpObserver {
                override fun onCreateSuccess(description: SessionDescription?) {
                    if (description == null) {
                        onFailure()
                        return
                    }
                    connection.setLocalDescription(noopSdpObserver(), description)
                    onLocalOffer(description.description)
                }

                override fun onSetSuccess() {}

                override fun onCreateFailure(error: String?) {
                    Log.w(TAG, "createOffer failed: $error")
                    onFailure()
                }

                override fun onSetFailure(error: String?) {}
            },
            MediaConstraints(),
        )
    }

    fun setRemoteAnswer(sdp: String) {
        peerConnection?.setRemoteDescription(
            noopSdpObserver(),
            SessionDescription(SessionDescription.Type.ANSWER, sdp),
        )
    }

    fun addRemoteIceCandidate(candidate: IceCandidateMessage) {
        peerConnection?.addIceCandidate(
            IceCandidate(candidate.sdpMid.orEmpty(), candidate.sdpMLineIndex, candidate.candidate),
        )
    }

    private var stopped = false

    /**
     * Idempotent and crash-proof on purpose: this runs from a foreground
     * service, and an uncaught exception here (e.g. disposing an object
     * WebRTC already tore down internally when the peer connection closed)
     * would kill the whole process, not just the camera feature. Every step
     * is independently guarded so a failure in one doesn't skip the rest.
     */
    fun stop() {
        if (stopped) return
        stopped = true

        runCatching { videoCapturer?.stopCapture() }
        // Close the peer connection before disposing the track/source it
        // references -- WebRTC may already release senders/tracks as part
        // of close(), so disposing them again afterward is what threw.
        runCatching { peerConnection?.close() }
        runCatching { peerConnection?.dispose() }
        runCatching { videoCapturer?.dispose() }
        runCatching { videoTrack?.dispose() }
        runCatching { videoSource?.dispose() }
        runCatching { surfaceTextureHelper?.dispose() }
        runCatching { peerConnectionFactory?.dispose() }
        runCatching { eglBase.release() }
    }

    private fun createCapturer(): VideoCapturer? {
        val enumerator = Camera2Enumerator(context)
        val wantFront = cameraFacing == CameraFacing.FRONT
        val deviceName = enumerator.deviceNames.firstOrNull {
            if (wantFront) enumerator.isFrontFacing(it) else enumerator.isBackFacing(it)
        } ?: enumerator.deviceNames.firstOrNull()
        return deviceName?.let { enumerator.createCapturer(it, null) }
    }

    private fun peerConnectionObserver() = object : PeerConnection.Observer {
        override fun onIceCandidate(candidate: IceCandidate) {
            onLocalIceCandidate(IceCandidateMessage(candidate.sdpMid, candidate.sdpMLineIndex, candidate.sdp))
        }

        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
            if (state == PeerConnection.IceConnectionState.FAILED) onFailure()
        }

        override fun onSignalingChange(state: PeerConnection.SignalingState) {}
        override fun onIceConnectionReceivingChange(receiving: Boolean) {}
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
        override fun onAddStream(stream: MediaStream) {}
        override fun onRemoveStream(stream: MediaStream) {}
        override fun onDataChannel(channel: RtcDataChannel) {}
        override fun onRenegotiationNeeded() {}
        override fun onTrack(transceiver: RtpTransceiver?) {}
    }

    companion object {
        private const val TAG = "StreamSession"
        private const val CAPTURE_WIDTH = 1280
        private const val CAPTURE_HEIGHT = 720
        private const val CAPTURE_FPS = 20
    }
}
