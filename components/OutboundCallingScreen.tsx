import React from 'react';
import { PartnerProfile } from '../types';

interface OutboundCallingScreenProps {
    profile: PartnerProfile;
    onCancel: () => void;
    status: 'pending' | 'rejected' | 'accepted' | 'no_answer';
}

export const OutboundCallingScreen: React.FC<OutboundCallingScreenProps> = ({ profile, onCancel, status }) => {
    const isDark = profile.theme === 'dark';

    return (
        <div className={`fixed inset-0 z-[200] flex flex-col items-center justify-between p-12 overflow-hidden ${isDark ? 'bg-[#0b0c10] text-white' : 'bg-[#f4f7fa] text-slate-900'}`}>
            {/* Blurred Background */}
            {profile.image && (
                <div
                    className="absolute inset-0 opacity-20 blur-[100px] z-0 scale-125 transition-opacity duration-1000"
                    style={{ backgroundImage: `url(${profile.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                />
            )}

            <div className="z-10 mt-24 flex flex-col items-center animate-pulse">
                <div className={`w-40 h-40 rounded-[3rem] overflow-hidden border-4 shadow-2xl mb-10 ${isDark ? 'border-white/10' : 'border-white shadow-blue-500/10'}`}>
                    {profile.image ? (
                        <img src={profile.image} alt="Target" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-slate-200 flex items-center justify-center text-6xl">👤</div>
                    )}
                </div>
                <h2 className="text-3xl font-black italic tracking-tighter uppercase mb-4">{profile.name}</h2>
                <div className={`px-6 py-2 rounded-full text-xs font-black uppercase tracking-[0.3em] flex items-center gap-3 ${isDark ? 'bg-blue-600/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                    {status === 'pending' ? 'Chamando...' : status === 'rejected' ? 'Chamada Recusada' : status === 'no_answer' ? 'Sem Resposta' : 'Conectando...'}
                </div>
            </div>

            <div className="z-10 mb-24">
                <button
                    onClick={onCancel}
                    className="w-20 h-20 rounded-full bg-red-600 text-white flex items-center justify-center shadow-2xl shadow-red-600/40 hover:scale-110 active:scale-95 transition-all animate-bounce-slow"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-20 mt-6 text-center">Cancelar Chamada</p>
            </div>
        </div>
    );
};
