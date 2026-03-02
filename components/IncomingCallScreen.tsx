import React from 'react';
import { PartnerProfile, UserProfile } from '../types';

interface IncomingCallScreenProps {
    profile: PartnerProfile;
    activePartner: PartnerProfile;
    callReason: string;
    onAccept: () => void;
    onDecline: () => void;
    onAiPickup?: () => void;
}

export const IncomingCallScreen: React.FC<IncomingCallScreenProps> = ({ profile, activePartner, callReason, onAccept, onDecline, onAiPickup }) => {
    const isDark = profile.theme === 'dark';

    const displayName = activePartner.name;
    const displayImage = activePartner.image;

    // Translate technical reason to UI text
    let displayText = "Chamada de Vídeo";
    if (callReason === 'callback_abrupt') displayText = "Retornando (Desligou na cara)";
    else if (callReason.startsWith('reminder:')) displayText = `Lembrete: ${callReason.split(':')[1]}`;
    else if (callReason === 'random') displayText = "Ligando pra dar um oi...";
    else if (callReason === 'receptionist_incoming') displayText = "Ligação de Usuário (IA atenderá em 5s)";

    const [timer, setTimer] = React.useState(5);

    React.useEffect(() => {
        if (callReason === 'receptionist_incoming' && onAiPickup) {
            const interval = setInterval(() => {
                setTimer((prev) => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        onAiPickup();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [callReason, onAiPickup]);

    return (
        <div className={`fixed inset-0 z-50 flex flex-col items-center justify-between p-6 sm:p-12 overflow-hidden ${isDark ? 'bg-[#0b0c10] text-white' : 'bg-[#f4f7fa] text-slate-900'}`}>
            {/* Blurred Background */}
            {profile.image && (
                <div
                    className="absolute inset-0 opacity-40 blur-[100px] z-0 scale-125"
                    style={{ backgroundImage: `url(${profile.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                />
            )}

            <div className="z-10 mt-20 flex flex-col items-center">
                <div className={`w-48 h-48 rounded-[3rem] overflow-hidden border-8 shadow-2xl mb-8 transition-all hover:scale-105 active:scale-95 ${isDark ? 'border-white/5' : 'border-white shadow-blue-500/10'}`}>
                    {displayImage ? (
                        <img src={displayImage} alt="Caller" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-slate-200 flex items-center justify-center text-7xl">⚡</div>
                    )}
                </div>
                <h2 className="text-4xl font-bold tracking-tight mb-2">{displayName}</h2>
                <div className={`px-5 py-2 rounded-2xl text-xs font-bold uppercase tracking-widest shadow-sm backdrop-blur-md ${isDark ? 'bg-white/10 text-blue-400' : 'bg-white/80 border border-slate-100 text-blue-600'}`}>
                    {displayText}
                </div>
            </div>

            <div className="z-10 w-full max-w-sm flex justify-around mb-20 gap-8">
                <button
                    onClick={onDecline}
                    className="flex-1 flex flex-col items-center gap-3 group"
                >
                    <div className="h-20 w-full rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shadow-sm group-hover:bg-red-500 group-hover:text-white transition-all duration-300 transform active:scale-95">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                    <span className="font-bold text-xs uppercase tracking-widest opacity-40">Decline</span>
                </button>

                {callReason === 'receptionist_incoming' && (
                    <button
                        onClick={onAiPickup}
                        className="flex-1 flex flex-col items-center gap-3 group"
                    >
                        <div className="h-20 w-full rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-sm group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300 transform active:scale-95">
                            <span className="text-xl group-hover:text-white transition-colors">🤖</span>
                        </div>
                        <span className="font-bold text-[10px] uppercase tracking-widest opacity-40 text-center">Deixar IA<br />Atender ({timer}s)</span>
                    </button>
                )}

                <button
                    onClick={onAccept}
                    className="flex-1 flex flex-col items-center gap-3 group"
                >
                    <div className="h-20 w-full rounded-3xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20 group-hover:bg-blue-700 transition-all duration-300 transform active:scale-95 animate-pulse-slow">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                    </div>
                    <span className="font-bold text-xs uppercase tracking-widest opacity-40">Accept</span>
                </button>
            </div>
        </div>
    );
};
