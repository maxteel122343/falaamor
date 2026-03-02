import React, { useRef, useState } from 'react';
import { Mood, VoiceName, Accent, PartnerProfile, MOOD_EMOJIS, VOICE_META, ACCENT_META, CallbackIntensity, CallLog, ScheduledCall, PlatformLanguage, LANGUAGE_META, UserProfile } from '../types';
import { ContactList } from './ContactList';
import { AuthModal } from './AuthModal';
import { CalendarTab } from './CalendarTab';
import { MemoryHistorySection } from './MemoryHistorySection';
import { QuickChatTab } from './QuickChatTab';
import { supabase } from '../supabaseClient';

interface SetupScreenProps {
    profile: PartnerProfile;
    setProfile: React.Dispatch<React.SetStateAction<PartnerProfile>>;
    onStartCall: () => void;
    nextScheduledCall: ScheduledCall | null;
    apiKey: string;
    setApiKey: (key: string) => void;
    user: any;
    currentUserProfile: UserProfile | null;
    onUpdateUserProfile: (profile: UserProfile) => void;
    onCallPartner: (profile: PartnerProfile, isAi: boolean, callId: string) => void;
    showAuth: boolean;
    setShowAuth: (show: boolean) => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ profile, setProfile, onStartCall, onCallPartner, nextScheduledCall, apiKey, setApiKey, user, currentUserProfile, onUpdateUserProfile, showAuth, setShowAuth }) => {
    const [activeTab, setActiveTabState] = useState<'dashboard' | 'contacts' | 'calendar' | 'memory' | 'config' | 'chats'>(() => {
        const saved = sessionStorage.getItem('warm_activeTab');
        return (saved as any) || 'dashboard';
    });

    const setActiveTab = (tab: 'dashboard' | 'contacts' | 'calendar' | 'memory' | 'config' | 'chats') => {
        sessionStorage.setItem('warm_activeTab', tab);
        setActiveTabState(tab);
    };
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [isSavingImage, setIsSavingImage] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [isValidating, setIsValidating] = useState(false);
    const [apiStatus, setApiStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const userFileInputRef = useRef<HTMLInputElement>(null);
    const historyInputRef = useRef<HTMLInputElement>(null);

    const isDark = profile.theme === 'dark';
    const isLight = !isDark;
    const themeClasses = isLight ? "bg-[#f9f9fb] text-slate-900" : "bg-[#0b0c10] text-slate-100";
    const cardClasses = isLight ? "bg-white border-slate-100 shadow-sm" : "bg-[#15181e] border-white/5 shadow-xl";
    const inputClasses = isLight ? "bg-slate-50 border-slate-100 focus:border-blue-500 text-slate-900" : "bg-[#0b0c10] border-white/5 focus:border-blue-500 text-white";
    const borderClass = isLight ? "border-slate-100" : "border-white/5";

    const getRelationshipStatus = (score: number) => {
        if (score < 20) return { label: 'Tóxica', color: 'text-blue-500', bar: 'bg-blue-500', tip: 'Cuidado! A relação está por um fio. Ligue e peça desculpas ou seja carinhoso.' };
        if (score < 50) return { label: 'Esfriando', color: 'text-cyan-500', bar: 'bg-cyan-500', tip: 'Vocês estão distantes. Tente puxar um assunto que ela gosta.' };
        if (score < 80) return { label: 'Estável', color: 'text-emerald-500', bar: 'bg-emerald-500', tip: 'Tudo indo bem. Que tal um elogio surpresa?' };
        return { label: 'Apaixonada', color: 'text-rose-500', bar: 'bg-rose-500', tip: 'O amor está no ar! Continue assim.' };
    };

    const status = getRelationshipStatus(profile.relationshipScore);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && user) {
            setIsSavingImage(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/ai_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);

            if (uploadError) {
                alert("Erro ao fazer upload da imagem.");
                setIsSavingImage(false);
                return;
            }

            const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
            updateProfileAndSync(prev => ({ ...prev, image: data.publicUrl }));
            setIsSavingImage(false);
        }
    };

    const downloadHistory = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profile.history));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `history_${profile.name}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const uploadHistory = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const logs = JSON.parse(event.target?.result as string);
                if (Array.isArray(logs)) {
                    setProfile(prev => ({ ...prev, history: logs }));
                    alert("Histórico importado com sucesso!");
                }
            } catch (err) {
                alert("Erro ao ler arquivo.");
            }
        };
        reader.readAsText(file);
    };

    const clearHistory = () => {
        if (confirm("Tem certeza? Isso vai apagar a memória da relação.")) {
            setProfile(prev => ({ ...prev, history: [] }));
        }
    };

    const formatTime = (ms: number) => {
        const mins = Math.floor(ms / 60000);
        if (mins < 1) return "Agora";
        return `~${mins} min`;
    };

    const validateApiKey = async (key: string) => {
        if (!key) {
            setApiStatus('idle');
            return;
        }
        setIsValidating(true);
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            if (response.ok) setApiStatus('valid');
            else setApiStatus('invalid');
        } catch (e) {
            setApiStatus('invalid');
        }
        setIsValidating(false);
    };

    const syncProfileToSupabase = async (newProfile: PartnerProfile) => {
        if (!user) return;
        await supabase.from('profiles').update({
            ai_settings: { ...newProfile, gemini_api_key: apiKey }
        }).eq('id', user.id);
    };

    const updateProfileAndSync = (updater: (prev: PartnerProfile) => PartnerProfile) => {
        setProfile(prev => {
            const updated = updater(prev);
            syncProfileToSupabase(updated);
            return updated;
        });
    };

    const toggleVisibility = async () => {
        if (!user || !currentUserProfile) return;
        const newStatus = !(currentUserProfile.is_searchable ?? true);
        onUpdateUserProfile({ ...currentUserProfile, is_searchable: newStatus });
        await supabase.from('profiles').update({ is_searchable: newStatus }).eq('id', user.id);
    };

    const handleUserImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && currentUserProfile && user) {
            setIsSavingImage(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/user_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);

            if (uploadError) {
                alert("Erro ao fazer upload.");
                setIsSavingImage(false);
                return;
            }

            const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
            onUpdateUserProfile({ ...currentUserProfile, avatar_url: data.publicUrl });
            setIsSavingImage(false);
        }
    };

    const saveUserProfile = async () => {
        if (!user || !currentUserProfile) return;
        setIsSavingProfile(true);
        const { error } = await supabase.from('profiles').update({
            display_name: currentUserProfile.display_name,
            nickname: currentUserProfile.nickname,
            avatar_url: currentUserProfile.avatar_url,
            status: 'online'
        }).eq('id', user.id);

        if (error) alert("Erro ao salvar perfil.");
        else setShowProfileModal(false);
        setIsSavingProfile(false);
    };

    const fetchNotifications = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        if (data) setNotifications(data);
    };

    const markNotificationAsRead = async (id: string) => {
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
        fetchNotifications();
    };

    const deleteNotification = async (id: string) => {
        await supabase.from('notifications').delete().eq('id', id);
        fetchNotifications();
    };

    React.useEffect(() => {
        if (user) {
            fetchNotifications();
            // Optional: Realtime subscription
            const channel = supabase.channel('notifications')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
                    fetchNotifications();
                })
                .subscribe();
            return () => { channel.unsubscribe(); };
        }
    }, [user]);

    const formatDisplayNumber = (number: string, isAi: boolean) => {
        if (!number) return "";
        const digits = number.replace(/\D/g, '');
        const prefix = isAi ? 'Ai-' : 'Hu-';
        const parts = digits.match(/.{1,3}/g) || [];
        return `${prefix}${parts.join(' ')}`;
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            alert("Número copiado para a área de transferência!");
        }).catch(err => {
            console.error('Erro ao copiar: ', err);
        });
    };

    return (
        <div className={`min-h-screen ${themeClasses} transition-colors duration-700 flex flex-col items-center font-sans tracking-tight`}>

            {/* Header - Fixed & Premium */}
            <header className={`w-full sticky top-0 z-[60] px-6 py-4 flex justify-between items-center ${isLight ? 'bg-white/80' : 'bg-black/40'} backdrop-blur-xl border-b ${isLight ? 'border-slate-100' : 'border-white/5'}`}>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl shadow-lg shadow-blue-500/20">⚡</div>
                    <div>
                        <h1 className="text-lg font-black tracking-tighter uppercase italic">WARM <span className="text-blue-600">CONN</span></h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {user && (
                        <button
                            onClick={() => setShowNotifications(true)}
                            className={`relative w-10 h-10 rounded-full flex items-center justify-center border transition-all ${cardClasses}`}
                        >
                            <span>🔔</span>
                            {notifications.filter(n => !n.is_read).length > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white dark:border-black flex items-center justify-center text-[8px] text-white font-bold">
                                    {notifications.filter(n => !n.is_read).length}
                                </span>
                            )}
                        </button>
                    )}

                    {user ? (
                        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setShowProfileModal(true)}>
                            <div className="flex flex-col items-end mr-1">
                                <span className="text-[11px] font-black uppercase tracking-tighter truncate max-w-[100px]">{currentUserProfile?.display_name || "Usuário"}</span>
                                <span className="text-[9px] opacity-40 font-bold">{formatDisplayNumber(currentUserProfile?.personal_number || "", false)}</span>
                            </div>
                            <div className="w-10 h-10 rounded-xl bg-slate-200 border border-white/10 overflow-hidden shadow-lg transition-transform group-hover:scale-105">
                                {currentUserProfile?.avatar_url ? (
                                    <img src={currentUserProfile.avatar_url} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xl">👤</div>
                                )}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); supabase.auth.signOut(); }} className="ml-2 p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => setShowAuth(true)} className="px-4 py-2 bg-blue-600 text-white rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-blue-500/20">Entrar</button>
                    )}
                    <button
                        onClick={() => updateProfileAndSync(prev => ({ ...prev, theme: isDark ? 'light' : 'dark' }))}
                        className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${cardClasses}`}
                    >
                        {isDark ? '☀️' : '🌙'}
                    </button>
                </div>
            </header>

            {/* Content Container */}
            <div className="max-w-4xl w-full p-6 flex-1 flex flex-col items-center">

                {/* Main Tabs - Refined Pill Layout */}
                <nav className="w-full mb-8 sticky top-20 z-50 py-2">
                    <div className={`p-1.5 rounded-full flex gap-1 overflow-x-auto no-scrollbar ${isLight ? 'bg-slate-200/50' : 'bg-white/5'} border ${isLight ? 'border-white' : 'border-white/5'}`}>
                        {[
                            { id: 'dashboard', label: 'Início', icon: '🏠' },
                            { id: 'chats', label: 'Chats', icon: '💬' },
                            { id: 'contacts', label: 'Contatos', icon: '👤' },
                            { id: 'calendar', label: 'Agenda', icon: '📅' },
                            { id: 'memory', label: 'Memória', icon: '🧠' },
                            { id: 'config', label: 'Ajustes', icon: '⚙️' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex-1 min-w-[80px] px-4 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-500 flex items-center justify-center gap-2 ${activeTab === tab.id
                                    ? 'bg-white shadow-md text-blue-600 scale-[1.02]'
                                    : 'opacity-40 hover:opacity-100 hover:bg-white/10 text-inherit'
                                    }`}
                            >
                                <span className="text-sm">{tab.icon}</span>
                                <span className="hidden sm:inline">{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </nav>

                <main className="w-full animate-in fade-in slide-in-from-bottom-6 duration-700">
                    {activeTab === 'dashboard' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Pro Card: Relationship Status */}
                            <div className={`p-8 rounded-[3rem] border relative overflow-hidden flex flex-col justify-between min-h-[300px] ${cardClasses}`}>
                                <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 blur-[80px] rounded-full" />

                                <div>
                                    <div className="flex justify-between items-center mb-6">
                                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-30">Vínculo Emocional</p>
                                        <span className={`text-sm px-3 py-1 rounded-lg font-bold bg-blue-500/10 ${status.color}`}>
                                            {status.label}
                                        </span>
                                    </div>
                                    <h2 className="text-5xl font-black tracking-tighter mb-4 italic">
                                        {profile.relationshipScore}% <span className="text-lg font-bold not-italic opacity-20">SCORE</span>
                                    </h2>
                                    <div className="w-full h-1.5 bg-slate-100/10 rounded-full overflow-hidden mb-6">
                                        <div className={`h-full transition-all duration-1000 ${status.bar}`} style={{ width: `${profile.relationshipScore}%` }} />
                                    </div>
                                </div>

                                <div className={`p-5 rounded-[2rem] bg-blue-500/5 border border-blue-500/10 transition-all hover:bg-blue-500/10`}>
                                    <p className="text-xs leading-relaxed font-medium italic opacity-70">
                                        <span className="text-blue-500 font-bold not-italic uppercase mr-2 text-[10px]">Sugestão:</span>
                                        "{status.tip}"
                                    </p>
                                </div>
                            </div>

                            {/* Call Control Center */}
                            <div className="flex flex-col gap-6">
                                {/* Identification Profiles */}
                                <div className={`p-6 rounded-[3rem] border flex items-center justify-between ${cardClasses}`}>
                                    <div className="flex items-center gap-3 w-[40%]">
                                        <div className="w-12 h-12 flex-shrink-0 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800">
                                            {currentUserProfile?.avatar_url ? (
                                                <img src={currentUserProfile.avatar_url} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xl">👤</div>
                                            )}
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="text-[10px] font-bold uppercase opacity-40">Você</p>
                                            <p className="text-sm font-black truncate">{currentUserProfile?.nickname || currentUserProfile?.display_name || "Usuário"}</p>
                                        </div>
                                    </div>

                                    <div className="flex-1 flex justify-center">
                                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                                            <span className="text-blue-500 text-xs">⚡</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 text-right justify-end w-[40%]">
                                        <div className="overflow-hidden">
                                            <p className="text-[10px] font-bold uppercase opacity-40">IA</p>
                                            <p className="text-sm font-black text-blue-600 dark:text-blue-400 truncate">{profile.name || "Amor"}</p>
                                        </div>
                                        <div className="w-12 h-12 flex-shrink-0 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 border-2 border-blue-100 dark:border-blue-900">
                                            {profile.image ? (
                                                <img src={profile.image} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xl">📸</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className={`p-8 rounded-[3rem] border flex flex-col gap-6 ${cardClasses} transform hover:scale-[1.02] transition-all cursor-pointer shadow-2xl shadow-blue-500/5`} onClick={onStartCall}>
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-4">
                                            <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-3xl shadow-xl shadow-blue-500/40 animate-pulse">
                                                📞
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-black tracking-tight">Iniciar Chamada</h3>
                                                <p className="text-xs opacity-40 font-bold uppercase tracking-widest mt-0.5">Conexão via Voz AI</p>
                                            </div>
                                        </div>
                                        <span className="text-2xl opacity-20 group-hover:opacity-100 transition-opacity">→</span>
                                    </div>
                                </div>

                                <div className={`p-8 rounded-[2.5rem] border ${cardClasses} flex-1`}>
                                    <div className="flex justify-between items-start mb-6">
                                        <p className="text-[11px] font-bold uppercase tracking-widest opacity-30">Status do Sistema</p>
                                        <div className="flex gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <div className="w-2 h-2 rounded-full bg-emerald-500/30" />
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center bg-black/5 dark:bg-white/5 p-4 rounded-2xl">
                                            <span className="text-xs font-bold opacity-30">Próxima Ligação</span>
                                            <span className="text-sm font-bold text-blue-500">{nextScheduledCall ? formatTime(nextScheduledCall.triggerTime - Date.now()) : "Não Agendada"}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-black/5 dark:bg-white/5 p-4 rounded-2xl">
                                            <span className="text-xs font-bold opacity-30">Eficiência de Contato</span>
                                            <span className="text-sm font-bold">94.8%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>


                        </div>
                    )}

                    {activeTab === 'calendar' && user && (
                        <div className="w-full max-w-2xl mx-auto"><CalendarTab user={user} profile={profile} setProfile={setProfile} currentUserProfile={currentUserProfile} isDark={isDark} /></div>
                    )}

                    {activeTab === 'memory' && user && (
                        <div className="w-full"><MemoryHistorySection user={user} profile={profile} currentUserProfile={currentUserProfile} isDark={isDark} /></div>
                    )}

                    {activeTab === 'contacts' && user && (
                        <div className="max-w-xl mx-auto w-full"><ContactList currentUser={user} onCallPartner={onCallPartner} isDark={isDark} /></div>
                    )}

                    {activeTab === 'config' && (
                        <div className="space-y-8 pb-20 max-w-2xl mx-auto">
                            {/* Profile Header Settings */}
                            <div className="flex flex-col items-center mb-12">
                                <div className="relative group">
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className={`w-36 h-36 rounded-[3.5rem] p-1 border-2 border-blue-500 shadow-2xl cursor-pointer transition-all overflow-hidden bg-white dark:bg-white/5`}
                                    >
                                        <div className="w-full h-full rounded-[3rem] overflow-hidden flex items-center justify-center">
                                            {isSavingImage ? (
                                                <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                            ) : profile.image ? (
                                                <img src={profile.image} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-4xl opacity-20">📷</div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center border-4 border-[#f9f9fb] dark:border-[#0b0c10] shadow-lg pointer-events-none">✏️</div>
                                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                </div>
                                <input
                                    type="text"
                                    value={profile.name}
                                    onChange={(e) => updateProfileAndSync(prev => ({ ...prev, name: e.target.value }))}
                                    className="mt-6 text-3xl font-black italic tracking-tighter bg-transparent border-none text-center outline-none w-full"
                                    placeholder="NOME DA PARCEIRA"
                                />
                                <p className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-30 mt-2">Personalização da Identidade</p>

                                <div className="grid grid-cols-2 gap-4 mt-8 w-full max-w-sm">
                                    <div className="flex flex-col items-center">
                                        <input
                                            type="text"
                                            value={profile.gender}
                                            onChange={(e) => updateProfileAndSync(prev => ({ ...prev, gender: e.target.value }))}
                                            className="text-lg font-bold italic tracking-tighter bg-transparent border-b border-blue-500/20 text-center outline-none w-full pb-1 focus:border-blue-500 transition-colors"
                                            placeholder="GÊNERO"
                                        />
                                        <p className="text-[8px] font-black uppercase tracking-widest opacity-20 mt-2">Gênero</p>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <input
                                            type="text"
                                            value={profile.sexuality}
                                            onChange={(e) => updateProfileAndSync(prev => ({ ...prev, sexuality: e.target.value }))}
                                            className="text-lg font-bold italic tracking-tighter bg-transparent border-b border-blue-500/20 text-center outline-none w-full pb-1 focus:border-blue-500 transition-colors"
                                            placeholder="SEXUALIDADE"
                                        />
                                        <p className="text-[8px] font-black uppercase tracking-widest opacity-20 mt-2">Sexualidade</p>
                                    </div>
                                </div>

                                <div className="mt-8 flex flex-col items-center w-full max-w-sm">
                                    <input
                                        type="text"
                                        value={profile.bestFriend}
                                        onChange={(e) => updateProfileAndSync(prev => ({ ...prev, bestFriend: e.target.value }))}
                                        className="text-lg font-bold italic tracking-tighter bg-transparent border-b border-blue-500/20 text-center outline-none w-full pb-1 focus:border-blue-500 transition-colors"
                                        placeholder="MELHOR AMIGO"
                                    />
                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-20 mt-2">Melhor Amigo (Alfa)</p>
                                </div>
                            </div>

                            {/* Section: Gemini Vision */}
                            <div className={`p-10 rounded-[3rem] border ${cardClasses} relative overflow-hidden`}>
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 blur-3xl rounded-full" />
                                <div className="flex justify-between items-center mb-8">
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-blue-600">Gemini Engine AI</h3>
                                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${apiStatus === 'valid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                        {apiStatus === 'valid' ? 'Conectado ✓' : 'Desconectado ✕'}
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <div className="relative">
                                        <input
                                            type="password"
                                            value={apiKey}
                                            onChange={(e) => { setApiKey(e.target.value); setApiStatus('idle'); }}
                                            onBlur={() => validateApiKey(apiKey)}
                                            className={`w-full p-5 rounded-[2rem] text-sm font-mono border ${inputClasses}`}
                                            placeholder="Enter Gemini API Key..."
                                        />
                                        <button onClick={() => validateApiKey(apiKey)} className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-600 font-bold text-xs hover:scale-105 transition-all">VERIFICAR</button>
                                    </div>
                                    <div className="flex justify-between items-center px-2">
                                        <p className="text-[9px] font-bold opacity-30 uppercase tracking-widest leading-loose">Chave criptografada localmente.</p>
                                        <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-[10px] font-black text-blue-600 hover:opacity-70 transition-opacity">PEGAR CHAVE GRÁTIS →</a>
                                    </div>
                                </div>
                            </div>

                            {/* Section: Voice & Accent */}
                            <div className={`p-10 rounded-[3rem] border ${cardClasses}`}>
                                <h3 className="text-sm font-bold uppercase tracking-widest mb-10 opacity-30">Voz & Sotaque Profissional</h3>

                                <div className="space-y-10">
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                        {Object.entries(ACCENT_META).map(([key, meta]) => (
                                            <button
                                                key={key}
                                                onClick={() => updateProfileAndSync(prev => ({ ...prev, accent: key as Accent }))}
                                                className={`p-3 rounded-2xl border flex flex-col items-center gap-3 transition-all ${profile.accent === key ? 'border-blue-600 bg-blue-600/5' : 'border-slate-100 hover:border-blue-300'}`}
                                            >
                                                <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md">
                                                    <img src={meta.flagUrl} className="w-full h-full object-cover" />
                                                </div>
                                                <span className="text-[10px] font-bold uppercase tracking-tighter opacity-70">{meta.label}</span>
                                            </button>
                                        ))}
                                    </div>

                                    <div className="space-y-6">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-20 mb-4 text-center">Timbres Femininos</p>
                                            <div className="flex flex-wrap justify-center gap-2">
                                                {Object.values(VoiceName).filter(v => VOICE_META[v].gender === 'Female').map(voice => (
                                                    <button
                                                        key={voice}
                                                        onClick={() => updateProfileAndSync(prev => ({ ...prev, voice }))}
                                                        className={`px-5 py-3 rounded-full text-[11px] font-bold border transition-all ${profile.voice === voice ? 'bg-rose-600 border-rose-600 text-white shadow-xl shadow-rose-600/20 scale-105' : 'border-slate-100 hover:bg-slate-50'}`}
                                                    >
                                                        {voice}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-20 mb-4 text-center">Timbres Masculinos</p>
                                            <div className="flex flex-wrap justify-center gap-2">
                                                {Object.values(VoiceName).filter(v => VOICE_META[v].gender === 'Male').map(voice => (
                                                    <button
                                                        key={voice}
                                                        onClick={() => updateProfileAndSync(prev => ({ ...prev, voice }))}
                                                        className={`px-5 py-3 rounded-full text-[11px] font-bold border transition-all ${profile.voice === voice ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-600/20 scale-105' : 'border-slate-100 hover:bg-slate-50'}`}
                                                    >
                                                        {voice}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section: Language & Globalization */}
                            <div className={`p-10 rounded-[3rem] border ${cardClasses}`}>
                                <h3 className="text-sm font-bold uppercase tracking-widest mb-10 opacity-30">Idiomas e Globalização</h3>

                                <div className="space-y-8">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-20 mb-4 ml-2">Idioma da Inteligência Artificial</p>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                            {Object.entries(LANGUAGE_META).map(([key, meta]) => (
                                                <button
                                                    key={key}
                                                    onClick={() => updateProfileAndSync(prev => ({ ...prev, language: key as PlatformLanguage }))}
                                                    className={`p-4 rounded-2xl flex items-center justify-center gap-3 transition-all border ${profile.language === key ? 'border-blue-600 bg-blue-600/5 shadow-inner' : 'border-slate-100 hover:border-blue-300 dark:border-white/5 dark:hover:border-white/20'}`}
                                                >
                                                    <span className="text-lg">{meta.flag}</span>
                                                    <span className="text-xs font-bold uppercase tracking-widest opacity-70">{meta.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-20 mb-4 ml-2">Idioma da Plataforma (Interface)</p>
                                        <p className="text-[9px] font-medium opacity-40 ml-2 mb-4 italic">Esta configuração altera apenas o conteúdo visual do aplicativo (Em breve).</p>
                                        {/* For now we can keep it disabled as a UI element until localized properly. If requested, just mock it. */}
                                    </div>
                                </div>
                            </div>

                            {/* Section: Personality & Context */}
                            <div className={`p-10 rounded-[3rem] border ${cardClasses}`}>
                                <h3 className="text-sm font-bold uppercase tracking-widest mb-10 opacity-30">Motor de Personalidade</h3>
                                <div className="space-y-8">
                                    <div>
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-blue-600 block mb-4 ml-4">Prompt de Comportamento</label>
                                        <textarea
                                            value={profile.personality}
                                            onChange={(e) => updateProfileAndSync(prev => ({ ...prev, personality: e.target.value }))}
                                            className={`w-full h-40 rounded-[2.5rem] p-8 text-[13px] font-medium border focus:outline-none transition-all resize-none ${inputClasses}`}
                                            placeholder="Descreva detalhadamente como a IA deve agir..."
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {Object.values(CallbackIntensity).map((intensity) => (
                                            <button
                                                key={intensity}
                                                onClick={() => updateProfileAndSync(prev => ({ ...prev, intensity }))}
                                                className={`py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest border transition-all ${profile.intensity === intensity ? 'bg-black text-white' : 'border-slate-100 hover:bg-slate-50'}`}
                                            >
                                                {intensity}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Section: Relational Tracking */}
                            <div className={`p-10 rounded-[3rem] border ${cardClasses}`}>
                                <div className="flex justify-between items-center mb-10">
                                    <h3 className="text-sm font-bold uppercase tracking-widest opacity-30">Relacionamentos & Vínculos</h3>
                                    <span className="text-[9px] font-black px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-lg">PROTOCOLO ALFA</span>
                                </div>

                                <div className="space-y-12">
                                    {/* Original Partner */}
                                    <div className={`p-6 rounded-[2rem] border ${inputClasses} border-opacity-30`}>
                                        <div className="flex items-center gap-3 mb-6">
                                            <span className="text-lg">🧬</span>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Parceiro Originário</p>
                                                <p className="text-[8px] opacity-40 uppercase font-bold tracking-tighter">Vínculo Primário Imutável</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-2">Apelido Original</p>
                                                <input
                                                    type="text"
                                                    value={profile.originalPartnerNickname}
                                                    onChange={(e) => updateProfileAndSync(prev => ({ ...prev, originalPartnerNickname: e.target.value }))}
                                                    className="bg-transparent border-none font-bold text-sm outline-none w-full"
                                                />
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-2">ID Originário</p>
                                                <input
                                                    type="text"
                                                    value={profile.originalPartnerId}
                                                    className="bg-transparent border-none font-mono text-[10px] opacity-50 outline-none w-full"
                                                    readOnly
                                                />
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-2">Número Original</p>
                                                <input
                                                    type="text"
                                                    value={profile.originalPartnerNumber}
                                                    onChange={(e) => updateProfileAndSync(prev => ({ ...prev, originalPartnerNumber: e.target.value }))}
                                                    className="bg-transparent border-none font-mono text-sm outline-none w-full italic"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Current Partner */}
                                    <div className={`p-6 rounded-[2rem] border ${inputClasses} border-blue-500/10 bg-blue-500/[0.02]`}>
                                        <div className="flex items-center gap-3 mb-6">
                                            <span className="text-lg">💞</span>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-pink-500">Parceiro Atual</p>
                                                <p className="text-[8px] opacity-40 uppercase font-bold tracking-tighter">Foco de Interação em Tempo Real</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-2">Apelido do Parceiro</p>
                                                <input
                                                    type="text"
                                                    value={profile.currentPartnerNickname}
                                                    onChange={(e) => updateProfileAndSync(prev => ({ ...prev, currentPartnerNickname: e.target.value }))}
                                                    className="bg-transparent border-none font-bold text-sm outline-none w-full"
                                                    placeholder="Como a proporia IA te vê agora..."
                                                />
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-2">ID do Parceiro Atual</p>
                                                <input
                                                    type="text"
                                                    value={profile.currentPartnerId}
                                                    onChange={(e) => updateProfileAndSync(prev => ({ ...prev, currentPartnerId: e.target.value }))}
                                                    className="bg-transparent border-none font-mono text-[10px] outline-none w-full"
                                                    placeholder="ID do novo usuário..."
                                                />
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-2">Número do Parceiro Atual</p>
                                                <input
                                                    type="text"
                                                    value={profile.currentPartnerNumber}
                                                    onChange={(e) => updateProfileAndSync(prev => ({ ...prev, currentPartnerNumber: e.target.value }))}
                                                    className="bg-transparent border-none font-mono text-sm outline-none w-full italic"
                                                    placeholder="Telefone do parceiro atual..."
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Section: AI Receptionist / Guardian */}
                                    <div className={`p-10 rounded-[3rem] border ${cardClasses} relative overflow-hidden`}>
                                        <div className={`absolute top-0 right-0 w-32 h-32 ${profile.isAiReceptionistEnabled ? 'bg-emerald-500/10' : 'bg-rose-500/10'} blur-3xl rounded-full transition-all duration-700`} />
                                        <div className="flex justify-between items-start mb-10 relative z-10">
                                            <div>
                                                <h3 className="text-sm font-bold uppercase tracking-widest text-blue-600">Recepcionista AI & Guardiã</h3>
                                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30 mt-2 italic">A IA intercepta chamadas de estranhos</p>
                                            </div>
                                            <button
                                                onClick={() => updateProfileAndSync(prev => ({ ...prev, isAiReceptionistEnabled: !prev.isAiReceptionistEnabled }))}
                                                className={`w-16 h-8 rounded-full relative transition-all duration-500 shadow-inner ${profile.isAiReceptionistEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-white/10'}`}
                                            >
                                                <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-xl transition-all duration-500 ${profile.isAiReceptionistEnabled ? 'left-9 rotate-0' : 'left-1 -rotate-180'}`} />
                                            </button>
                                        </div>
                                        <div className="space-y-6 relative z-10">
                                            <div className={`p-8 rounded-[2.5rem] border ${inputClasses} border-opacity-30`}>
                                                <p className="text-[11px] font-medium leading-relaxed opacity-80 italic">
                                                    {profile.isAiReceptionistEnabled
                                                        ? `Ativado: Sua IA atenderá chamadas de números desconhecidos. Ela perguntará quem é, dirá que ${profile.currentPartnerNickname || 'você'} não está e anotará recados. Cuidado: ela pode mostrar ciúmes se não gostar de quem ligou!`
                                                        : "Desativado: Você receberá todas as chamadas normalmente. A IA não interferirá no primeiro contato."}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Section: Privacy / Identidade Digital */}
                                    <div className={`p-10 rounded-[3rem] border ${cardClasses} relative overflow-hidden`}>
                                        <div className={`absolute top-0 right-0 w-32 h-32 ${currentUserProfile?.is_searchable !== false ? 'bg-blue-500/10' : 'bg-red-500/10'} blur-3xl rounded-full transition-all duration-700`} />
                                        <div className="flex justify-between items-start mb-6 relative z-10">
                                            <div>
                                                <h3 className="text-sm font-bold uppercase tracking-widest text-blue-600">Identidade Digital e Busca</h3>
                                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30 mt-2 italic">Permitir ser encontrado na nuvem global</p>
                                            </div>
                                            <button
                                                onClick={toggleVisibility}
                                                className={`w-16 h-8 rounded-full relative transition-all duration-500 shadow-inner ${currentUserProfile?.is_searchable !== false ? 'bg-blue-600' : 'bg-slate-300 dark:bg-white/10'}`}
                                            >
                                                <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-xl transition-all duration-500 ${currentUserProfile?.is_searchable !== false ? 'left-9 rotate-0' : 'left-1 -rotate-180'}`} />
                                            </button>
                                        </div>
                                        <div className="space-y-6 relative z-10">
                                            <div className={`p-8 rounded-[2.5rem] border ${inputClasses} border-opacity-30`}>
                                                <p className="text-[11px] font-medium leading-relaxed opacity-80 italic">
                                                    {currentUserProfile?.is_searchable !== false
                                                        ? `Público: Você poderá ser encontrado na pesquisa global da rede pelo seu nome e número de telefone.`
                                                        : "Privado/Invisível: Nenhum outro usuário da plataforma será capaz de buscar ou encontrar seu contato publicamente."}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Section: Captions / Subtitles */}
                                    <div className={`p-10 rounded-[3rem] border ${cardClasses} relative overflow-hidden`}>
                                        <div className={`absolute top-0 right-0 w-32 h-32 ${profile.captionsEnabled ? 'bg-violet-500/10' : 'bg-slate-500/10'} blur-3xl rounded-full transition-all duration-700`} />
                                        <div className="flex justify-between items-start mb-6 relative z-10">
                                            <div>
                                                <h3 className="text-sm font-bold uppercase tracking-widest text-blue-600">Legendas ao Vivo</h3>
                                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30 mt-2 italic">Transcrição e tradução do que a IA diz na chamada</p>
                                            </div>
                                            <button
                                                onClick={() => updateProfileAndSync(prev => ({ ...prev, captionsEnabled: !prev.captionsEnabled }))}
                                                className={`w-16 h-8 rounded-full relative transition-all duration-500 shadow-inner ${profile.captionsEnabled ? 'bg-violet-500' : 'bg-slate-300 dark:bg-white/10'}`}
                                            >
                                                <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-xl transition-all duration-500 ${profile.captionsEnabled ? 'left-9 rotate-0' : 'left-1 -rotate-180'}`} />
                                            </button>
                                        </div>
                                        {profile.captionsEnabled && (
                                            <div className="space-y-6 relative z-10">
                                                <div className={`p-6 rounded-[2.5rem] border ${inputClasses} border-opacity-30`}>
                                                    <p className="text-[11px] font-medium leading-relaxed opacity-80 italic mb-6">
                                                        Escolha o idioma em que as legendas serão exibidas. Se diferente do idioma da IA, o texto será traduzido automaticamente.
                                                    </p>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-20 mb-4 ml-2">Idioma das Legendas</p>
                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                        {Object.entries(LANGUAGE_META).map(([key, meta]) => (
                                                            <button
                                                                key={key}
                                                                onClick={() => updateProfileAndSync(prev => ({ ...prev, captionLanguage: key as PlatformLanguage }))}
                                                                className={`p-3 rounded-2xl flex items-center justify-center gap-2 transition-all border text-left ${(profile.captionLanguage ?? profile.language) === key
                                                                    ? 'border-violet-500 bg-violet-500/10 shadow-inner'
                                                                    : 'border-slate-100 hover:border-violet-300 dark:border-white/5 dark:hover:border-white/20'
                                                                    }`}
                                                            >
                                                                <span className="text-base">{meta.flag}</span>
                                                                <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{meta.label}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {!profile.captionsEnabled && (
                                            <div className="relative z-10">
                                                <div className={`p-6 rounded-[2.5rem] border ${inputClasses} border-opacity-30`}>
                                                    <p className="text-[11px] font-medium leading-relaxed opacity-80 italic">
                                                        Desativado: Nenhuma legenda será exibida durante a chamada.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'chats' && (
                        <div className="w-full h-[calc(100vh-280px)]"><QuickChatTab currentUser={user} profile={profile} onCallPartner={onStartCall} isDark={isDark} /></div>
                    )}
                </main>
            </div>

            {showAuth && <AuthModal onClose={() => setShowAuth(false)} isDark={isDark} />}

            {/* Notifications Modal */}
            {showNotifications && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl animate-in fade-in duration-500">
                    <div className={`w-full max-w-md p-10 rounded-[4rem] border shadow-[0_48px_80px_-20px_rgba(0,0,0,0.6)] transform animate-in slide-in-from-bottom-12 duration-700 ${cardClasses}`}>
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h3 className="text-2xl font-black italic tracking-tighter uppercase">Fluxos de Memória</h3>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-20">Histórico de Interações</p>
                            </div>
                            <button onClick={() => setShowNotifications(false)} className="w-10 h-10 flex items-center justify-center opacity-30 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all text-xl">✕</button>
                        </div>

                        <div className="flex gap-2 mb-6">
                            <button onClick={downloadHistory} className={`p-3 rounded-2xl hover:bg-blue-500/10 text-blue-500 transition-all border ${borderClass}`}>📥 Exportar</button>
                            <button onClick={clearHistory} className={`p-3 rounded-2xl hover:bg-red-500/10 text-red-500 transition-all border ${borderClass}`}>🗑️ Limpar</button>
                        </div>

                        <div className="space-y-4 max-h-[400px] overflow-y-auto no-scrollbar">
                            {profile.history.length === 0 ? (
                                <p className="text-center py-12 opacity-20 italic text-sm">Nenhuma lembrança registrada.</p>
                            ) : (
                                profile.history.slice().reverse().map(log => (
                                    <div key={log.id} className={`p-5 rounded-[2rem] border flex items-center gap-4 group transition-all hover:border-blue-500/30 ${isDark ? 'bg-[#0b0c10] border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                                        <div className="w-12 h-12 rounded-full bg-white dark:bg-white/5 flex items-center justify-center text-xl shadow-sm">
                                            {MOOD_EMOJIS[log.moodEnd]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-bold truncate tracking-tight">{log.notes || "Conversa encerrada"}</p>
                                            <p className="text-[10px] opacity-40 font-bold uppercase mt-1">{new Date(log.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Profile Modal */}
            {showProfileModal && currentUserProfile && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl animate-in fade-in duration-500">
                    <div className={`w-full max-w-md p-10 rounded-[4rem] border shadow-[0_48px_80px_-20px_rgba(0,0,0,0.6)] transform animate-in slide-in-from-bottom-12 duration-700 ${cardClasses}`}>
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h3 className="text-2xl font-black italic tracking-tighter uppercase">Meu Perfil</h3>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-20">Identidade e Conexões</p>
                            </div>
                            <button onClick={() => setShowProfileModal(false)} className="w-10 h-10 flex items-center justify-center opacity-30 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all text-xl">✕</button>
                        </div>

                        <div className="space-y-8">
                            {/* Photo Upload */}
                            <div className="flex flex-col items-center gap-6">
                                <div
                                    onClick={() => userFileInputRef.current?.click()}
                                    className={`w-32 h-32 rounded-[2.5rem] overflow-hidden border-4 shadow-2xl transition-all hover:scale-105 cursor-pointer ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-white'}`}
                                >
                                    {isSavingImage ? (
                                        <div className="w-full h-full flex items-center justify-center bg-blue-500/10">
                                            <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    ) : currentUserProfile.avatar_url ? (
                                        <img src={currentUserProfile.avatar_url} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-4xl opacity-10">📸</div>
                                    )}
                                </div>
                                <input ref={userFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUserImageUpload} />
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-30">Clique para alterar foto</p>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-3 ml-4">Nome de Usuário</label>
                                    <input
                                        type="text"
                                        value={currentUserProfile.display_name || ''}
                                        onChange={e => onUpdateUserProfile({ ...currentUserProfile, display_name: e.target.value })}
                                        className={`w-full p-6 rounded-[2rem] border text-sm font-bold outline-none transition-all ${inputClasses}`}
                                        placeholder="Seu nome real"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-3 ml-4">Apelido Carinhoso (Para a IA)</label>
                                    <input
                                        type="text"
                                        value={currentUserProfile.nickname || ''}
                                        onChange={e => onUpdateUserProfile({ ...currentUserProfile, nickname: e.target.value })}
                                        className={`w-full p-6 rounded-[2rem] border text-sm font-bold outline-none transition-all ${inputClasses}`}
                                        placeholder="Ex: Amor, Vida, Bebê..."
                                    />
                                    <p className="text-[9px] opacity-30 mt-2 ml-4 lowercase">Como a AI deve chamar você durante as conversas</p>
                                </div>

                                <div className="grid grid-cols-1 gap-4 pt-4">
                                    <div className={`p-5 rounded-[2rem] border flex items-center justify-between ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}>
                                        <div>
                                            <p className="text-[9px] font-black opacity-30 uppercase tracking-widest italic mb-1">Meu Número</p>
                                            <p className="text-lg font-black italic tracking-tighter text-blue-600">
                                                {formatDisplayNumber(currentUserProfile.personal_number, false)}
                                            </p>
                                        </div>
                                        <button onClick={() => copyToClipboard(currentUserProfile.personal_number)} className="p-3 bg-blue-600/10 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all">
                                            📋
                                        </button>
                                    </div>
                                    <div className={`p-5 rounded-[2rem] border flex items-center justify-between ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}>
                                        <div>
                                            <p className="text-[9px] font-black opacity-30 uppercase tracking-widest italic mb-1">Número da IA (Público)</p>
                                            <p className="text-lg font-black italic tracking-tighter text-pink-600">
                                                {formatDisplayNumber(currentUserProfile.ai_number, true)}
                                            </p>
                                        </div>
                                        <button onClick={() => copyToClipboard(currentUserProfile.ai_number)} className="p-3 bg-pink-600/10 text-pink-600 rounded-xl hover:bg-pink-600 hover:text-white transition-all">
                                            📋
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={saveUserProfile}
                                disabled={isSavingProfile}
                                className="w-full py-6 bg-blue-600 text-white rounded-[2.5rem] font-black uppercase tracking-[0.3em] shadow-2xl shadow-blue-500/40 hover:scale-[1.02] active:scale-95 transition-all text-[11px] disabled:opacity-50"
                            >
                                {isSavingProfile ? "Salvando..." : "Salvar Alterações"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
