import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { createViewerSession, type ViewerSession } from "../webrtc";
import type { ParentWSMessage } from "../types";
import type { ParentSocket } from "../ws";

type Status = "idle" | "connecting" | "live" | "error";

export function LiveCameraPanel({
  deviceId,
  isOnline,
  socket,
  signal,
}: {
  deviceId: string;
  isOnline: boolean;
  socket: ParentSocket;
  signal: { message: ParentWSMessage; seq: number } | null;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const viewerRef = useRef<ViewerSession | null>(null);
  const lastHandledSeq = useRef(0);

  // Reset if the selected device changes while a session is active.
  useEffect(() => {
    return () => stopSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  useEffect(() => {
    if (!signal || signal.seq === lastHandledSeq.current) return;
    lastHandledSeq.current = signal.seq;

    const msg = signal.message;
    if (msg.type !== "webrtc_offer" && msg.type !== "webrtc_ice_candidate") return;
    if (msg.deviceId !== deviceId || msg.sessionId !== sessionIdRef.current) return;

    if (msg.type === "webrtc_offer") {
      viewerRef.current?.setRemoteOffer(msg.sdp).then((answerSdp) => {
        socket.send({ type: "webrtc_answer", deviceId, sessionId: msg.sessionId, sdp: answerSdp });
      });
    } else {
      viewerRef.current?.addRemoteIceCandidate(msg.candidate);
    }
  }, [signal, deviceId, socket]);

  function stopSession() {
    if (sessionIdRef.current) {
      socket.send({ type: "stop_stream", deviceId, sessionId: sessionIdRef.current });
    }
    viewerRef.current?.close();
    viewerRef.current = null;
    sessionIdRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }

  async function startSession(camera: "front" | "back") {
    setStatus("connecting");
    const sessionId = crypto.randomUUID();
    sessionIdRef.current = sessionId;

    const { iceServers } = await api.iceServers();

    viewerRef.current = createViewerSession(iceServers as RTCIceServer[], {
      onTrack: (stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus("live");
      },
      onLocalIceCandidate: (candidate) => {
        socket.send({ type: "webrtc_ice_candidate", deviceId, sessionId, candidate });
      },
      onConnectionStateChange: (state) => {
        if (state === "failed" || state === "closed") {
          if (sessionIdRef.current === sessionId) setStatus("error");
        }
      },
    });

    socket.send({ type: "start_stream", deviceId, sessionId, camera });
  }

  return (
    <div className="live-camera-panel">
      <h3>Kamera Live</h3>
      <video ref={videoRef} autoPlay playsInline muted className="live-camera-video" />
      <p className="live-camera-status">
        {status === "idle" && "Belum aktif"}
        {status === "connecting" && "Menghubungkan..."}
        {status === "live" && "Live"}
        {status === "error" && "Gagal terhubung"}
      </p>
      <div className="live-camera-actions">
        {status === "idle" || status === "error" ? (
          <>
            <button type="button" disabled={!isOnline} onClick={() => startSession("back")}>
              Kamera Belakang
            </button>
            <button type="button" disabled={!isOnline} onClick={() => startSession("front")}>
              Kamera Depan
            </button>
          </>
        ) : (
          <button type="button" onClick={stopSession}>
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
