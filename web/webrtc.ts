/**
 * Thin wrapper around the browser's native RTCPeerConnection for the
 * dashboard's live-camera viewer side. The child device is always the
 * offerer (it owns the camera); the dashboard is always the answerer. All
 * signaling (offer/answer/ICE candidates) is relayed through /ws/parent --
 * see server/ws/parent.ws.ts and device.ws.ts -- the video itself never
 * touches the server.
 */

export interface ViewerSessionCallbacks {
  onTrack: (stream: MediaStream) => void;
  onLocalIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

export interface ViewerSession {
  setRemoteOffer: (sdp: string) => Promise<string>;
  addRemoteIceCandidate: (candidate: RTCIceCandidateInit) => void;
  close: () => void;
}

export function createViewerSession(iceServers: RTCIceServer[], callbacks: ViewerSessionCallbacks): ViewerSession {
  const pc = new RTCPeerConnection({ iceServers });

  pc.ontrack = (event) => {
    const stream = event.streams[0];
    if (stream) callbacks.onTrack(stream);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) callbacks.onLocalIceCandidate(event.candidate.toJSON());
  };

  if (callbacks.onConnectionStateChange) {
    const notify = callbacks.onConnectionStateChange;
    pc.onconnectionstatechange = () => notify(pc.connectionState);
  }

  return {
    async setRemoteOffer(sdp: string) {
      await pc.setRemoteDescription({ type: "offer", sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      return answer.sdp ?? "";
    },

    addRemoteIceCandidate(candidate: RTCIceCandidateInit) {
      pc.addIceCandidate(candidate).catch(() => {
        // Candidates that arrive after close() or a failed negotiation are
        // harmless to drop.
      });
    },

    close() {
      pc.close();
    },
  };
}
