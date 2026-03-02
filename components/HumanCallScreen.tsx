import React, { useEffect, useRef, useState } from 'react';
import { PartnerProfile } from '../types';
import { supabase } from '../supabaseClient';

interface HumanCallScreenProps {
    callId: string;
    partner: PartnerProfile;         // caller's info shown visually
    isCaller: boolean;               // true = I started the call; false = I received it
    userId: string;
    onEnd: () => void;
    isDark?: boolean;
}

const ICE_SERVERS: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

export const HumanCallScreen: React.FC<HumanCallScreenProps> = ({
    callId, partner, isCaller, userId, onEnd, isDark = false
}) => {
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    const [status, setStatus] = useState<'connecting' | 'connected' | 'ended'>('connecting');
    const [muted, setMuted] = useState(false);
    const [duration, setDuration] = useState(0);

    // Duration timer
    useEffect(() => {
        if (status !== 'connected') return;
        const t = setInterval(() => setDuration(d => d + 1), 1000);
        return () => clearInterval(t);
    }, [status]);

    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    useEffect(() => {
        let destroyed = false;

        const init = async () => {
            // 1. Get microphone
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            } catch {
                alert('Sem permissão de microfone');
                onEnd();
                return;
            }
            localStreamRef.current = stream;

            // 2. Create RTCPeerConnection
            const pc = new RTCPeerConnection(ICE_SERVERS);
            pcRef.current = pc;

            // Add local tracks
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            // Handle remote audio
            pc.ontrack = (e) => {
                if (remoteAudioRef.current) {
                    remoteAudioRef.current.srcObject = e.streams[0];
                    remoteAudioRef.current.play().catch(() => { });
                }
                setStatus('connected');
            };

            // 3. Subscribe to signaling channel via Supabase Realtime
            const sigChannel = supabase.channel(`webrtc_signal_${callId}`, {
                config: { broadcast: { self: false } }
            });
            channelRef.current = sigChannel;

            sigChannel
                .on('broadcast', { event: 'offer' }, async ({ payload }) => {
                    if (destroyed || isCaller) return;
                    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    sigChannel.send({ type: 'broadcast', event: 'answer', payload: { sdp: answer } });
                })
                .on('broadcast', { event: 'answer' }, async ({ payload }) => {
                    if (destroyed || !isCaller) return;
                    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                })
                .on('broadcast', { event: 'ice' }, async ({ payload }) => {
                    if (destroyed) return;
                    try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch { }
                })
                .on('broadcast', { event: 'end' }, () => {
                    if (!destroyed) handleEnd(false);
                })
                .subscribe(async (status) => {
                    if (status !== 'SUBSCRIBED') return;

                    // ICE candidate exchange
                    pc.onicecandidate = (e) => {
                        if (e.candidate) {
                            sigChannel.send({ type: 'broadcast', event: 'ice', payload: { candidate: e.candidate } });
                        }
                    };

                    // Caller creates the offer
                    if (isCaller) {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        sigChannel.send({ type: 'broadcast', event: 'offer', payload: { sdp: offer } });
                    }
                });

            pc.onconnectionstatechange = () => {
                if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
                    if (!destroyed) handleEnd(false);
                }
            };
        };

        init();

        // Also listen via Supabase DB for call status updates (handles cases where broadcast is lost)
        const dbChannel = supabase
            .channel(`call_db_status_${callId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'calls',
                filter: `id=eq.${callId}`
            }, (payload: any) => {
                if (payload.new?.status === 'ended') {
                    handleEnd(false);
                }
            })
            .subscribe();

        return () => {
            destroyed = true;
            pcRef.current?.close();
            localStreamRef.current?.getTracks().forEach(t => t.stop());
            channelRef.current?.unsubscribe();
            dbChannel.unsubscribe();
        };
    }, []);

    const handleEnd = (sendSignal = true) => {
        if (sendSignal && channelRef.current) {
            channelRef.current.send({ type: 'broadcast', event: 'end', payload: {} });
        }
        pcRef.current?.close();
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        channelRef.current?.unsubscribe();
        supabase.from('calls').update({ status: 'ended' }).eq('id', callId);
        setStatus('ended');
        onEnd();
    };

    const toggleMute = () => {
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
        setMuted(m => !m);
    };

    return (
        <div className={`fixed inset-0 z-[200] flex flex-col items-center justify-between p-12 overflow-hidden transition-all ${isDark ? 'bg-[#0b0c10] text-white' : 'bg-[#f4f7fa] text-slate-900'}`}>
            {/* Ambient background from partner photo */}
            {partner.image && (
                <div
                    className="absolute inset-0 opacity-20 blur-[120px] z-0 scale-125"
                    style={{ backgroundImage: `url(${partner.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                />
            )}

            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

            {/* Top info */}
            <div className="z-10 mt-16 flex flex-col items-center gap-2">
                <p className={`text-[10px] font-black uppercase tracking-[0.3em] ${status === 'connected' ? 'text-emerald-500' : 'text-blue-400 animate-pulse'}`}>
                    {status === 'connecting' ? '● Conectando...' : status === 'connected' ? `● Em Chamada — ${formatDuration(duration)}` : '● Encerrada'}
                </p>
            </div>

            {/* Avatar */}
            <div className="z-10 flex flex-col items-center gap-8">
                <div className={`w-44 h-44 rounded-[3rem] overflow-hidden border-4 shadow-2xl ${status === 'connected' ? 'ring-4 ring-emerald-500/40 animate-pulse-slow' : ''} ${isDark ? 'border-white/10' : 'border-white shadow-blue-500/10'}`}>
                    {partner.image ? (
                        <img src={partner.image} alt={partner.name} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-500/20 to-indigo-600/20 flex items-center justify-center text-7xl">👤</div>
                    )}
                </div>
                <div className="flex flex-col items-center gap-2">
                    <h2 className="text-4xl font-black italic tracking-tighter uppercase">{partner.name}</h2>
                    <p className="text-xs opacity-40 font-bold uppercase tracking-widest">Chamada de Voz · Criptografada</p>
                </div>
            </div>

            {/* Controls */}
            <div className="z-10 mb-8 flex items-center gap-8">
                {/* Mute */}
                <button
                    onClick={toggleMute}
                    className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-95 ${muted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : isDark ? 'bg-white/10 text-white/60' : 'bg-black/10 text-slate-600'}`}
                >
                    {muted ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                    )}
                </button>

                {/* End Call */}
                <button
                    onClick={() => handleEnd(true)}
                    className="w-20 h-20 rounded-full bg-red-600 text-white flex items-center justify-center shadow-2xl shadow-red-600/40 hover:scale-110 active:scale-95 transition-all"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6.62 10.79a15.15 15.15 0 006.59 6.59l2.2-2.2a1 1 0 011.11-.27c1.12.44 2.33.68 3.58.68a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.24 2.46.68 3.58a1 1 0 01-.27 1.11z" />
                    </svg>
                </button>

                {/* Speaker (cosmetic placeholder) */}
                <button className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-95 ${isDark ? 'bg-white/10 text-white/60' : 'bg-black/10 text-slate-600'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M12 6a7 7 0 010 12" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                </button>
            </div>
        </div>
    );
};
