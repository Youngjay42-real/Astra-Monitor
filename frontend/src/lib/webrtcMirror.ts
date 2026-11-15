/** Phone → desktop WebRTC mirror via REST signaling on the pair session. */

import { api } from '../api/client'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export type MirrorHandle = {
  close: () => void
}

export type MirrorCallbacks = {
  /** Fires once media is flowing (prefer this over “publisher started”). */
  onConnected?: () => void
  onDisconnected?: () => void
}

function pcConfig(): RTCConfiguration {
  return { iceServers: ICE_SERVERS, iceCandidatePoolSize: 8 }
}

function hintMotion(stream: MediaStream) {
  for (const track of stream.getVideoTracks()) {
    try {
      track.contentHint = 'motion'
    } catch {
      /* older browsers */
    }
  }
}

async function preferSmoothSender(pc: RTCPeerConnection) {
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== 'video') continue
    try {
      const params = sender.getParameters()
      if (!params.encodings?.length) params.encodings = [{}]
      params.degradationPreference = 'maintain-framerate'
      const enc = params.encodings[0]
      enc.maxFramerate = 30
      enc.maxBitrate = 2_500_000
      enc.scaleResolutionDownBy = 1
      await sender.setParameters(params)
    } catch {
      /* optional */
    }
  }
}

function watchConnection(
  pc: RTCPeerConnection,
  callbacks: MirrorCallbacks | undefined,
  closed: () => boolean,
) {
  let fired = false
  const bump = () => {
    if (closed() || fired) return
    const ice = pc.iceConnectionState
    const conn = pc.connectionState
    if (ice === 'connected' || ice === 'completed' || conn === 'connected') {
      fired = true
      callbacks?.onConnected?.()
    } else if (ice === 'failed' || ice === 'disconnected' || conn === 'failed' || conn === 'disconnected') {
      callbacks?.onDisconnected?.()
    }
  }
  pc.oniceconnectionstatechange = bump
  pc.onconnectionstatechange = bump
}

/** Phone publishes local camera stream to the paired desktop. */
export async function startPhonePublisher(
  sessionId: string,
  stream: MediaStream,
  callbacks?: MirrorCallbacks,
): Promise<MirrorHandle> {
  const pc = new RTCPeerConnection(pcConfig())
  let closed = false
  const timers: number[] = []

  hintMotion(stream)
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream)
  }
  await preferSmoothSender(pc)
  watchConnection(pc, callbacks, () => closed)

  pc.onicecandidate = (event) => {
    if (!event.candidate || closed) return
    void api.sessionRtcSignal(sessionId, {
      role: 'phone',
      kind: 'ice',
      candidate: event.candidate.toJSON(),
    })
  }

  const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false })
  await pc.setLocalDescription(offer)
  await api.sessionRtcSignal(sessionId, {
    role: 'phone',
    kind: 'offer',
    sdp: offer.sdp ?? '',
  })

  let answered = false
  const poll = window.setInterval(() => {
    if (closed) return
    void (async () => {
      try {
        const state = await api.sessionRtcState(sessionId)
        if (state.answer_sdp && !answered) {
          answered = true
          await pc.setRemoteDescription({ type: 'answer', sdp: state.answer_sdp })
          await preferSmoothSender(pc)
        }
        const iced = await api.sessionRtcTakeIce(sessionId, 'phone')
        for (const c of iced.candidates) {
          try {
            await pc.addIceCandidate(c as RTCIceCandidateInit)
          } catch {
            /* stale */
          }
        }
      } catch {
        /* retry */
      }
    })()
  }, 120)
  timers.push(poll)

  return {
    close: () => {
      closed = true
      for (const t of timers) window.clearInterval(t)
      pc.close()
      void api.sessionRtcSignal(sessionId, { role: 'phone', kind: 'hangup' }).catch(() => undefined)
    },
  }
}

/** Desktop subscribes to the phone's camera stream. */
export async function startDesktopSubscriber(
  sessionId: string,
  onStream: (stream: MediaStream) => void,
  callbacks?: MirrorCallbacks,
): Promise<MirrorHandle> {
  let pc: RTCPeerConnection | null = null
  let closed = false
  let appliedOffer: string | null = null
  let answering = false
  const timers: number[] = []

  const bindPc = (next: RTCPeerConnection) => {
    pc?.close()
    pc = next
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track])
      hintMotion(stream)
      for (const receiver of next.getReceivers()) {
        try {
          const r = receiver as RTCRtpReceiver & { jitterBufferTarget?: number }
          if (typeof r.jitterBufferTarget === 'number') r.jitterBufferTarget = 0
        } catch {
          /* optional low-latency hint */
        }
      }
      onStream(stream)
    }
    watchConnection(pc, callbacks, () => closed)
    pc.onicecandidate = (event) => {
      if (!event.candidate || closed) return
      void api.sessionRtcSignal(sessionId, {
        role: 'desktop',
        kind: 'ice',
        candidate: event.candidate.toJSON(),
      })
    }
  }

  const poll = window.setInterval(() => {
    if (closed || answering) return
    void (async () => {
      answering = true
      try {
        const state = await api.sessionRtcState(sessionId)
        const offer = state.offer_sdp ?? null
        if (offer && offer !== appliedOffer) {
          appliedOffer = offer
          bindPc(new RTCPeerConnection(pcConfig()))
          await pc!.setRemoteDescription({ type: 'offer', sdp: offer })
          const answer = await pc!.createAnswer()
          await pc!.setLocalDescription(answer)
          await api.sessionRtcSignal(sessionId, {
            role: 'desktop',
            kind: 'answer',
            sdp: answer.sdp ?? '',
          })
        }
        if (!state.streaming && appliedOffer) {
          appliedOffer = null
        }
        if (pc) {
          const iced = await api.sessionRtcTakeIce(sessionId, 'desktop')
          for (const c of iced.candidates) {
            try {
              await pc.addIceCandidate(c as RTCIceCandidateInit)
            } catch {
              /* stale */
            }
          }
        }
      } catch {
        /* retry */
      } finally {
        answering = false
      }
    })()
  }, 120)
  timers.push(poll)

  return {
    close: () => {
      closed = true
      for (const t of timers) window.clearInterval(t)
      pc?.close()
      pc = null
      void api.sessionRtcSignal(sessionId, { role: 'desktop', kind: 'hangup' }).catch(() => undefined)
    },
  }
}
