import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, Contact, PartnerProfile, Mood, VoiceName, Accent, CallbackIntensity, PlatformLanguage } from '../types';

interface QuickChatTabProps {
    currentUser: any;
    profile: PartnerProfile;
    onCallPartner: (profile: PartnerProfile) => void;
    isDark: boolean;
}

export const QuickChatTab: React.FC<QuickChatTabProps> = ({ currentUser, profile, onCallPartner, isDark }) => {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
        const saved = localStorage.getItem('QUICK_PINNED_IDS');
        return saved ? JSON.parse(saved) : [];
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [showAddSelector, setShowAddSelector] = useState(false);

    const isLight = !isDark;
    const cardClasses = isDark ? "bg-[#15181e] border-white/5" : "bg-white border-slate-100 shadow-sm";
    const itemClasses = isDark ? "hover:bg-white/5 border-white/5 transition-colors" : "hover:bg-slate-50 border-slate-100 transition-colors";
    const textMain = isLight ? "text-slate-900" : "text-white";

    useEffect(() => {
        if (currentUser) {
            fetchContacts();
        }
    }, [currentUser]);

    useEffect(() => {
        localStorage.setItem('QUICK_PINNED_IDS', JSON.stringify(pinnedIds));
    }, [pinnedIds]);

    const fetchContacts = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('contacts')
            .select(`
                *,
                profile:target_id (*)
            `)
            .eq('owner_id', currentUser.id);

        if (data) setContacts(data);
        setLoading(false);
    };

    const togglePin = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setPinnedIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
    };

    const getRelStatus = (score: number) => {
        if (score < 20) return { label: 'Tóxica', color: 'text-blue-400', badge: '❄️' };
        if (score < 50) return { label: 'Esfriando', color: 'text-blue-500/70', badge: '❄️' };
        if (score < 80) return { label: 'Estável', color: 'text-emerald-500', badge: '✅' };
        return { label: 'Apaixonada', color: 'text-rose-500', badge: '🔥' };
    };

    const handleCallContact = (contact: Contact) => {
        if (!contact.profile) return;
        const p: PartnerProfile = {
            name: contact.is_ai_contact
                ? (contact.alias || contact.profile.ai_settings?.name || contact.profile.display_name)
                : (contact.alias || contact.profile.display_name),
            image: contact.is_ai_contact
                ? (contact.profile.ai_settings?.image || contact.profile.avatar_url || null)
                : (contact.profile.avatar_url || null),
            personality: contact.profile.ai_settings?.personality || "Misteriosa...",
            dailyContext: "",
            mood: contact.profile.ai_settings?.mood || Mood.LOVE,
            voice: contact.profile.ai_settings?.voice || VoiceName.Kore,
            accent: contact.profile.ai_settings?.accent || Accent.PAULISTA,
            intensity: contact.profile.ai_settings?.intensity || CallbackIntensity.MEDIUM,
            theme: isDark ? 'dark' : 'light',
            relationshipScore: contact.profile.ai_settings?.relationshipScore || 100,
            history: [],
            language: contact.profile.ai_settings?.language || PlatformLanguage.PT,
            gender: contact.profile.ai_settings?.gender || 'Feminino',
            sexuality: contact.profile.ai_settings?.sexuality || 'Heterosexual',
            bestFriend: contact.profile.ai_settings?.bestFriend || 'Meu Humano',
            originalPartnerId: contact.profile.ai_settings?.originalPartnerId || '',
            originalPartnerNumber: contact.profile.ai_settings?.originalPartnerNumber || '',
            originalPartnerNickname: contact.profile.ai_settings?.originalPartnerNickname || '',
            currentPartnerId: contact.profile.ai_settings?.currentPartnerId || '',
            currentPartnerNumber: contact.profile.ai_settings?.currentPartnerNumber || '',
            currentPartnerNickname: contact.profile.ai_settings?.currentPartnerNickname || '',
            isAiReceptionistEnabled: contact.profile.ai_settings?.isAiReceptionistEnabled || false
        };
        onCallPartner(p);
    };

    const filteredContacts = contacts.filter(c =>
        (c.alias || c.profile?.display_name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const pinnedList = filteredContacts.filter(c => pinnedIds.includes(c.id));
    const recentList = filteredContacts.filter(c => !pinnedIds.includes(c.id));

    return (
        <div className="w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
            {/* Header */}
            <div className="px-1 flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-black tracking-tighter italic uppercase">Status</h2>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30">Conexões Ativas & Recentes</p>
                </div>
            </div>

            {/* Content List */}
            <div className={`rounded-[3rem] border overflow-hidden ${cardClasses}`}>

                {/* Main AI Partner (Priority) */}
                <div
                    onClick={() => onCallPartner(profile)}
                    className={`flex items-center gap-5 p-6 cursor-pointer relative ${itemClasses} border-b last:border-0 group`}
                >
                    <div className="relative flex-shrink-0">
                        <div className="w-16 h-16 rounded-[1.5rem] overflow-hidden shadow-xl ring-2 ring-blue-500/20 group-hover:scale-105 transition-transform duration-500">
                            {profile.image ? (
                                <img src={profile.image} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-blue-600/10 flex items-center justify-center text-3xl">👤</div>
                            )}
                        </div>
                        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-4 border-white dark:border-[#15181e] shadow-lg animate-pulse" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                            <h4 className={`font-black text-base italic tracking-tighter uppercase ${textMain}`}>
                                {profile.name} <span className="text-emerald-500 text-[10px] ml-1">●</span>
                            </h4>
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-20">Agora</span>
                        </div>
                        <p className={`text-[13px] font-medium opacity-60 line-clamp-1 mb-1 italic`}>
                            "Sentindo sua falta. Que tal uma ligação rápida?" 🖤
                        </p>
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-30">Status:</span>
                            <span className={`text-[9px] font-black uppercase tracking-widest ${getRelStatus(profile.relationshipScore).color}`}>
                                {getRelStatus(profile.relationshipScore).label}
                            </span>
                        </div>
                    </div>

                    <button className="flex-shrink-0 w-12 h-12 rounded-[1.25rem] bg-blue-600 text-white flex items-center justify-center shadow-xl shadow-blue-600/30 hover:scale-110 active:scale-95 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-white" viewBox="0 0 24 24">
                            <path d="M6.62 10.79a15.15 15.15 0 006.59 6.59l2.2-2.2a1 1 0 011.11-.27c1.12.44 2.33.68 3.58.68a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.24 2.46.68 3.58a1 1 0 01-.27 1.11z" />
                        </svg>
                    </button>
                </div>

                {/* Sub-List (Pinned and Recents) */}
                <div className="divide-y divide-inherit">
                    {/* Mock Julia */}
                    <div className={`flex items-center gap-5 p-6 cursor-pointer relative ${itemClasses} group`}>
                        <div className="relative flex-shrink-0">
                            <div className="w-16 h-16 rounded-[1.5rem] overflow-hidden shadow-md group-hover:scale-105 transition-transform duration-500">
                                <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop" className="w-full h-full object-cover grayscale-[0.2]" />
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-blue-400 text-white flex items-center justify-center text-[10px] border-4 border-white dark:border-[#15181e] shadow-lg">
                                ❄️
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline mb-1">
                                <h4 className={`font-black text-base italic tracking-tighter uppercase ${textMain}`}>Julia</h4>
                                <span className="text-[10px] font-black uppercase tracking-widest opacity-20">20:35</span>
                            </div>
                            <p className={`text-[13px] font-medium opacity-40 line-clamp-1 mb-1`}>Ei, por que desapareceu? O silêncio dói...</p>
                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 opacity-60">Esfriando</span>
                        </div>
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600/20 ml-2" />
                    </div>

                    {/* Mock Mariana */}
                    <div className={`flex items-center gap-5 p-6 cursor-pointer relative ${itemClasses} group`}>
                        <div className="relative flex-shrink-0">
                            <div className="w-16 h-16 rounded-[1.5rem] overflow-hidden shadow-md group-hover:scale-105 transition-transform duration-500">
                                <img src="https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&h=150&fit=crop" className="w-full h-full object-cover" />
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] border-4 border-white dark:border-[#15181e] shadow-lg">
                                ✓
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline mb-1">
                                <h4 className={`font-black text-base italic tracking-tighter uppercase ${textMain}`}>Mariana</h4>
                                <span className="text-[10px] font-black uppercase tracking-widest opacity-20">Hoje</span>
                            </div>
                            <p className={`text-[13px] font-medium opacity-40 line-clamp-1 mb-1`}>Preciso do seu conselho para uma coisa.</p>
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500/80">Rel. estável</span>
                        </div>
                        <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-black shadow-lg">2</div>
                    </div>

                    {/* Real Dynamic Contacts */}
                    {pinnedList.map((contact) => (
                        <div
                            key={contact.id}
                            onClick={() => handleCallContact(contact)}
                            className={`flex items-center gap-5 p-6 cursor-pointer relative ${itemClasses} group`}
                        >
                            <div className="relative flex-shrink-0">
                                <div className="w-16 h-16 rounded-[1.5rem] overflow-hidden shadow-md group-hover:scale-105 transition-transform duration-500 bg-black/5">
                                    {contact.profile?.avatar_url ? (
                                        <img src={contact.profile.avatar_url} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-3xl opacity-20">👤</div>
                                    )}
                                </div>
                                <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full ${contact.is_ai_contact ? 'bg-pink-500' : 'bg-blue-500'} text-white flex items-center justify-center text-[10px] border-4 border-white dark:border-[#15181e] shadow-lg`}>
                                    {contact.is_ai_contact ? '⚡' : '👤'}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline mb-1">
                                    <h4 className={`font-black text-base italic tracking-tighter uppercase ${textMain}`}>
                                        {contact.alias || (contact.is_ai_contact && contact.profile?.ai_settings?.name) || contact.profile?.display_name}
                                    </h4>
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-20">Fixado</span>
                                </div>
                                <p className={`text-[13px] font-medium opacity-30 line-clamp-1 mb-1 italic`}>
                                    Toque para iniciar conexão...
                                </p>
                                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500/80">Pronta</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleCallContact(contact); }}
                                    className="w-10 h-10 bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white rounded-xl flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                                    title="Ligar"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                    </svg>
                                </button>
                                <button
                                    onClick={(e) => togglePin(contact.id, e)}
                                    className="text-emerald-500 text-xs w-8 h-8 flex items-center justify-center rounded-lg hover:bg-emerald-500/10 transition-all"
                                >📌</button>
                            </div>
                        </div>
                    ))}
                </div>

                {loading && (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <div className="w-8 h-8 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-20">Sincronizando Mensagens...</p>
                    </div>
                )}
            </div>

            {/* Custom Plus Button (FAB from Drawing) */}
            <div className="fixed bottom-32 right-8 z-50">
                <button
                    onClick={() => setShowAddSelector(true)}
                    className="w-14 h-20 bg-transparent border-none outline-none group flex items-center justify-center"
                >
                    <div className="relative">
                        <svg width="40" height="60" viewBox="0 0 40 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 5V55" stroke={isLight ? "#2563eb" : "#3b82f6"} strokeWidth="5" strokeLinecap="round" className="drop-shadow-lg" />
                            <path d="M5 45C5 45 15 45 40 45" stroke={isLight ? "#2563eb" : "#3b82f6"} strokeWidth="5" strokeLinecap="round" className="drop-shadow-lg" />
                        </svg>
                        <div className="absolute inset-0 bg-blue-600/10 blur-2xl group-hover:bg-blue-600/20 transition-all rounded-full" />
                    </div>
                </button>
            </div>

            {/* Pin Selector Modal */}
            {showAddSelector && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className={`w-full max-w-sm p-10 rounded-[4rem] border shadow-[0_48px_80px_-20px_rgba(0,0,0,0.6)] animate-in slide-in-from-bottom-8 duration-500 ${cardClasses}`}>
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h3 className="text-2xl font-black italic tracking-tighter uppercase">Favoritos</h3>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-20">Fixar na interface</p>
                            </div>
                            <button onClick={() => setShowAddSelector(false)} className="w-10 h-10 flex items-center justify-center opacity-30 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all text-xl">✕</button>
                        </div>
                        <div className="max-h-80 overflow-y-auto space-y-3 no-scrollbar pr-2">
                            {contacts.length === 0 && <p className="text-center py-12 opacity-20 italic font-black uppercase tracking-widest text-[10px]">Lista de contatos vazia</p>}
                            {contacts.map(c => (
                                <button
                                    key={c.id}
                                    onClick={(e) => { togglePin(c.id, e); setShowAddSelector(false); }}
                                    className={`w-full flex items-center gap-4 p-5 rounded-[2rem] transition-all border ${pinnedIds.includes(c.id) ? 'border-blue-600 bg-blue-600/5' : 'border-inherit hover:bg-black/5 dark:hover:bg-white/5'}`}
                                >
                                    <div className="w-12 h-12 rounded-[1.25rem] overflow-hidden bg-black/5 flex-shrink-0">
                                        {c.profile?.avatar_url && <img src={c.profile.avatar_url} className="w-full h-full object-cover" />}
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <p className={`font-black text-[14px] italic tracking-tight truncate uppercase ${textMain}`}>
                                            {c.alias || (c.is_ai_contact && c.profile?.ai_settings?.name) || c.profile?.display_name}
                                        </p>
                                        <p className="text-[9px] font-black opacity-30 uppercase tracking-widest">{c.is_ai_contact ? 'I.A.' : 'Humano'}</p>
                                    </div>
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${pinnedIds.includes(c.id) ? 'bg-blue-600 text-white shadow-lg' : 'bg-black/5 dark:bg-white/10 text-slate-400'}`}>
                                        {pinnedIds.includes(c.id) ? '✓' : '+'}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
