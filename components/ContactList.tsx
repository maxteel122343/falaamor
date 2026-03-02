import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, Contact, PartnerProfile, Mood, VoiceName, Accent, CallbackIntensity, PlatformLanguage } from '../types';

interface ContactListProps {
    currentUser: any;
    onCallPartner: (profile: PartnerProfile, isAi: boolean, callId: string) => void;
    isDark: boolean;
}

export const ContactList: React.FC<ContactListProps> = ({ currentUser, onCallPartner, isDark }) => {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
    const [showBlocklistModal, setShowBlocklistModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newContact, setNewContact] = useState({ name: '', number: '', image: '', type: 'user' as 'user' | 'ai' });

    const cardClasses = isDark ? "bg-[#15181e] border-white/5" : "bg-white border-slate-100 shadow-sm";
    const itemClasses = isDark ? "hover:bg-white/5 border-white/5 bg-[#0b0c10]" : "hover:bg-slate-50 border-slate-100 bg-white";
    const inputClasses = isDark ? "bg-white/5 border-white/10 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500";

    useEffect(() => {
        if (currentUser) {
            fetchMyProfile();
            fetchContacts();
        }
    }, [currentUser]);

    // Live البحث (Global Search) with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.trim().length >= 2) {
                searchContact();
            } else {
                setSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchMyProfile = async () => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();
        if (data) setMyProfile(data);
    };

    const fetchContacts = async () => {
        const { data, error } = await supabase
            .from('contacts')
            .select(`
                *,
                profile:target_id (*)
            `)
            .eq('owner_id', currentUser.id);

        if (data) setContacts(data);
    };

    const searchContact = async () => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }
        setLoading(true);
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .or(`personal_number.ilike.%${searchQuery}%,ai_number.ilike.%${searchQuery}%,nickname.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%,ai_settings->>name.ilike.%${searchQuery}%`)
            .eq('is_searchable', true)
            .limit(20);

        if (data) {
            const contactIds = new Set(contacts.map(c => c.target_id));
            const myBlocked = myProfile?.blocked_users || [];

            const filteredResults = data.filter(p =>
                !contactIds.has(p.id) &&
                p.id !== currentUser.id &&
                !(p.blocked_users || []).includes(currentUser.id) &&
                !myBlocked.includes(p.id)
            );
            setSearchResults(filteredResults);
        }
        setLoading(false);
    };

    const toggleBlockUser = async (targetId: string, isBlocked: boolean) => {
        if (!myProfile) return;
        let newBlockedList = [...(myProfile.blocked_users || [])];

        if (isBlocked) {
            newBlockedList = newBlockedList.filter(id => id !== targetId);
        } else {
            if (!newBlockedList.includes(targetId)) newBlockedList.push(targetId);

            // Remove from contacts if blocked
            const existingContact = contacts.find(c => c.target_id === targetId);
            if (existingContact) {
                await supabase.from('contacts').delete().eq('id', existingContact.id);
                setContacts(prev => prev.filter(c => c.id !== existingContact.id));
            }
        }

        setMyProfile({ ...myProfile, blocked_users: newBlockedList });
        await supabase.from('profiles').update({ blocked_users: newBlockedList }).eq('id', currentUser.id);
    };

    const addContact = async (profile: UserProfile, isAi: boolean) => {
        // Create the primary contact
        const { error } = await supabase
            .from('contacts')
            .insert({
                owner_id: currentUser.id,
                target_id: profile.id,
                is_ai_contact: isAi,
                alias: isAi ? (profile.ai_settings?.name || profile.nickname || profile.display_name) : (profile.nickname || profile.display_name)
            });

        if (!error) {
            // Also create a contact back for the target user (Mutual Contact)
            // This ensures exman9002 will see exman9001
            await supabase
                .from('contacts')
                .upsert({
                    owner_id: profile.id,
                    target_id: currentUser.id,
                    is_ai_contact: false, // Adding the human caller back by default
                    alias: myProfile?.nickname || myProfile?.display_name
                }, { onConflict: 'owner_id,target_id,is_ai_contact' });
        }

        if (error) {
            alert("Erro ao adicionar contato ou contato já existe.");
        } else {
            // Send notification to the target user
            await supabase.from('notifications').insert({
                user_id: profile.id,
                type: 'contact_added',
                content: `${myProfile?.display_name || 'Alguém'} adicionou você aos contatos!`
            });

            setSearchResults(prev => prev.filter(p => p.id !== profile.id));
            if (searchResults.length <= 1) setSearchQuery('');
            fetchContacts();
        }
    };

    const handleManualCreate = async () => {
        if (!newContact.name || newContact.number.length !== 9) {
            alert("Preencha o nome e um número de exatamente 9 dígitos.");
            return;
        }

        setLoading(true);
        const { error } = await supabase
            .from('contacts')
            .insert({
                owner_id: currentUser.id,
                contact_name: newContact.name,
                is_ai_contact: newContact.type === 'ai',
                status: 'offline',
                alias: newContact.name,
            });

        if (error) {
            console.error(error);
            alert("Erro ao salvar contato.");
        } else {
            setShowAddModal(false);
            setNewContact({ name: '', number: '', image: '', type: 'user' });
            fetchContacts();
        }
        setLoading(false);
    };

    const formatDisplayNumber = (number: string, isAi: boolean) => {
        if (!number) return isAi ? 'AI-OFFLINE' : 'HUMANO-LATENTE';
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

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setNewContact(prev => ({ ...prev, image: reader.result as string }));
            reader.readAsDataURL(file);
        }
    };

    const filteredContacts = contacts.filter(contact => {
        const query = searchQuery.toLowerCase();
        return (
            contact.alias?.toLowerCase().includes(query) ||
            contact.contact_name?.toLowerCase().includes(query) ||
            contact.profile?.display_name?.toLowerCase().includes(query) ||
            contact.profile?.nickname?.toLowerCase().includes(query) ||
            contact.profile?.ai_settings?.name?.toLowerCase().includes(query) ||
            contact.profile?.personal_number?.includes(query) ||
            contact.profile?.ai_number?.includes(query)
        );
    });

    const handleCallDirect = async (targetProfile: UserProfile, isAi: boolean) => {
        const partnerProfile: PartnerProfile = {
            name: isAi ? (targetProfile.ai_settings?.name || `AI ${targetProfile.display_name}`) : targetProfile.display_name,
            image: isAi ? (targetProfile.ai_settings?.image || targetProfile.avatar_url || null) : (targetProfile.avatar_url || null),
            personality: targetProfile.ai_settings?.personality || "Personalidade misteriosa...",
            dailyContext: "",
            mood: targetProfile.ai_settings?.mood || Mood.LOVE,
            voice: targetProfile.ai_settings?.voice || VoiceName.Kore,
            accent: targetProfile.ai_settings?.accent || Accent.PAULISTA,
            intensity: targetProfile.ai_settings?.intensity || CallbackIntensity.MEDIUM,
            theme: isDark ? 'dark' : 'light',
            relationshipScore: currentUser.id === targetProfile.id ? 100 : 80,
            history: [],
            language: targetProfile.ai_settings?.language || PlatformLanguage.PT,
            gender: targetProfile.ai_settings?.gender || 'Feminino',
            sexuality: targetProfile.ai_settings?.sexuality || 'Heterosexual',
            bestFriend: targetProfile.ai_settings?.bestFriend || (targetProfile.nickname || targetProfile.display_name),
            originalPartnerId: targetProfile.ai_settings?.originalPartnerId || targetProfile.id,
            originalPartnerNumber: targetProfile.ai_settings?.originalPartnerNumber || targetProfile.personal_number,
            originalPartnerNickname: targetProfile.ai_settings?.originalPartnerNickname || (targetProfile.nickname || targetProfile.display_name),
            currentPartnerId: targetProfile.ai_settings?.currentPartnerId || targetProfile.id,
            currentPartnerNumber: targetProfile.ai_settings?.currentPartnerNumber || targetProfile.personal_number,
            currentPartnerNickname: targetProfile.ai_settings?.currentPartnerNickname || (targetProfile.nickname || targetProfile.display_name),
            ai_number: targetProfile.ai_number,
            gemini_api_key: targetProfile.ai_settings?.gemini_api_key,
            callerInfo: {
                id: currentUser.id,
                name: myProfile?.display_name || 'Alguém',
                isPartner: currentUser.id === targetProfile.id
            }
        };

        const { data: callData, error } = await supabase
            .from('calls')
            .insert({
                caller_id: currentUser.id,
                target_id: targetProfile.id,
                is_ai_call: isAi,
                status: 'pending'
            })
            .select()
            .single();

        if (error || !callData) {
            alert("Erro ao sinalizar chamada.");
            return;
        }

        onCallPartner(partnerProfile, isAi, callData.id);
    };

    const handleCallContact = async (contact: Contact) => {
        if (!contact.profile || !currentUser) return;

        const partnerProfile: PartnerProfile = {
            name: contact.is_ai_contact
                ? (contact.alias || contact.profile.ai_settings?.name || `AI ${contact.profile.display_name}`)
                : (contact.alias || contact.profile.display_name),
            image: contact.is_ai_contact
                ? (contact.profile.ai_settings?.image || contact.profile.avatar_url || null)
                : (contact.profile.avatar_url || null),
            personality: contact.profile.ai_settings?.personality || "Personalidade misteriosa...",
            dailyContext: "",
            mood: contact.profile.ai_settings?.mood || Mood.LOVE,
            voice: contact.profile.ai_settings?.voice || VoiceName.Kore,
            accent: contact.profile.ai_settings?.accent || Accent.PAULISTA,
            intensity: contact.profile.ai_settings?.intensity || CallbackIntensity.MEDIUM,
            theme: isDark ? 'dark' : 'light',
            relationshipScore: 100,
            history: [],
            language: contact.profile.ai_settings?.language || PlatformLanguage.PT,
            gender: contact.profile.ai_settings?.gender || 'Feminino',
            sexuality: contact.profile.ai_settings?.sexuality || 'Heterosexual',
            bestFriend: contact.profile.ai_settings?.bestFriend || (contact.profile.nickname || contact.profile.display_name),
            originalPartnerId: contact.profile.ai_settings?.originalPartnerId || contact.profile.id,
            originalPartnerNumber: contact.profile.ai_settings?.originalPartnerNumber || contact.profile.personal_number,
            originalPartnerNickname: contact.profile.ai_settings?.originalPartnerNickname || (contact.profile.nickname || contact.profile.display_name),
            currentPartnerId: contact.profile.ai_settings?.currentPartnerId || contact.profile.id,
            currentPartnerNumber: contact.profile.ai_settings?.currentPartnerNumber || contact.profile.personal_number,
            currentPartnerNickname: contact.profile.ai_settings?.currentPartnerNickname || (contact.profile.nickname || contact.profile.display_name),
            ai_number: contact.profile.ai_number,
            gemini_api_key: contact.profile.ai_settings?.gemini_api_key
        };

        // Create call record for signaling
        const { data: callData, error } = await supabase
            .from('calls')
            .insert({
                caller_id: currentUser.id,
                target_id: contact.profile.id,
                is_ai_call: contact.is_ai_contact,
                status: 'pending'
            })
            .select()
            .single();

        if (error || !callData) {
            alert("Erro ao sinalizar chamada. Verifique sua conexão.");
            console.error(error);
            return;
        }

        onCallPartner(partnerProfile, contact.is_ai_contact, callData.id);
    };

    return (
        <div className="w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-black tracking-tighter italic uppercase">Contatos</h2>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30">Diretório de Conexões</p>
            </div>

            {/* My ID Card */}
            {myProfile && (
                <div className={`p-8 rounded-[3rem] border relative overflow-hidden ${cardClasses}`}>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full" />
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                            <h3 className="text-[10px] font-black uppercase tracking-widest opacity-30 italic">Minha Identidade Digital</h3>
                            {myProfile?.blocked_users && myProfile.blocked_users.length > 0 && (
                                <button
                                    onClick={() => setShowBlocklistModal(true)}
                                    className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all"
                                    title="Usuários Bloqueados"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                                </button>
                            )}
                        </div>
                    </div>
                    <div>
                        <div className="flex flex-col sm:flex-row gap-8">
                            <div className="flex-1">
                                <p className="text-[9px] font-black opacity-20 uppercase tracking-widest mb-1">Linha Pessoal</p>
                                <div className="flex items-center gap-2">
                                    <p className="text-2xl font-black italic tracking-tighter text-blue-600">
                                        {formatDisplayNumber(myProfile.personal_number, false)}
                                    </p>
                                    <button onClick={() => copyToClipboard(myProfile.personal_number)} className="opacity-30 hover:opacity-100 transition-opacity">📋</button>
                                </div>
                            </div>
                            <div className="hidden sm:block w-[1px] bg-inherit opacity-20" />
                            <div className="flex-1">
                                <p className="text-[9px] font-black opacity-20 uppercase tracking-widest mb-1">Cortex AI (Público)</p>
                                <div className="flex items-center gap-2">
                                    <p className="text-2xl font-black italic tracking-tighter text-pink-600">
                                        {formatDisplayNumber(myProfile.ai_number, true)}
                                    </p>
                                    <button onClick={() => copyToClipboard(myProfile.ai_number)} className="opacity-30 hover:opacity-100 transition-opacity">📋</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Search Bar */}
            <div className="flex gap-4">
                <div className="relative flex-1 group">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchContact()}
                        placeholder="BUSCAR POR NOME OU NÚMERO..."
                        className={`w-full p-6 pr-14 rounded-[2rem] border text-xs font-black tracking-[0.2em] transition-all duration-300 shadow-sm outline-none ${inputClasses}`}
                    />
                    <button
                        onClick={searchContact}
                        className="absolute right-5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all"
                    >
                        {loading ? <div className="w-4 h-4 border-2 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" /> : <span className="text-lg">🔍</span>}
                    </button>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="w-16 h-16 bg-blue-600 text-white rounded-[1.8rem] shadow-xl shadow-blue-600/30 hover:scale-110 active:scale-95 transition-all text-2xl flex items-center justify-center font-black group"
                >
                    <span className="group-hover:rotate-90 transition-transform duration-500">+</span>
                </button>
            </div>

            {/* Combined Results Container */}
            <div className="flex flex-col gap-10">
                {/* Search Results List (Discovery) */}
                {searchResults.length > 0 && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-6 duration-500">
                        <div className="flex items-center gap-3 ml-4">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30 italic">Novas Descobertas (Global)</p>
                        </div>
                        <div className="flex flex-col gap-3">
                            {searchResults.map((result) => (
                                <div key={result.id} className={`p-6 rounded-[2.5rem] border-2 border-blue-600/20 ${cardClasses} shadow-xl hover:border-blue-600/40 transition-all group`}>
                                    <div className="flex flex-col sm:flex-row items-center gap-5">
                                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-600/10 flex items-center justify-center text-2xl overflow-hidden border border-blue-500/10 group-hover:scale-105 transition-transform">
                                            {result.ai_settings?.image ? (
                                                <img src={result.ai_settings.image} className="w-full h-full object-cover" />
                                            ) : result.avatar_url ? (
                                                <img src={result.avatar_url} className="w-full h-full object-cover" />
                                            ) : '👤'}
                                        </div>
                                        <div className="flex-1 text-center sm:text-left">
                                            <h4 className="text-lg font-black italic tracking-tighter uppercase">
                                                {result.nickname || result.display_name}
                                                {result.ai_settings?.name && (
                                                    <span className="text-[10px] font-black opacity-30 ml-2"> (AI: {result.ai_settings.name})</span>
                                                )}
                                            </h4>
                                            <div className="flex flex-wrap justify-center sm:justify-start gap-4 mt-1">
                                                <div className="flex items-center gap-1.5 opacity-40">
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-blue-500">Hu</span>
                                                    <p className="text-[10px] font-bold">{formatDisplayNumber(result.personal_number, false)}</p>
                                                </div>
                                                <div className="flex items-center gap-1.5 opacity-40">
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-pink-500">Ai</span>
                                                    <p className="text-[10px] font-bold">{formatDisplayNumber(result.ai_number, true)}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 w-full sm:w-auto">
                                            <div className="flex flex-col gap-1">
                                                <button
                                                    onClick={() => addContact(result, false)}
                                                    className="px-4 py-2 bg-blue-600/10 text-blue-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all whitespace-nowrap"
                                                >
                                                    + Humano
                                                </button>
                                                <button
                                                    onClick={() => handleCallDirect(result, false)}
                                                    className="px-4 py-1.5 text-[8px] font-black uppercase opacity-30 hover:opacity-100 italic"
                                                >
                                                    Ligar Direto
                                                </button>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <button
                                                    onClick={() => addContact(result, true)}
                                                    className="px-4 py-2 bg-pink-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-pink-700 shadow-lg shadow-pink-600/20 transition-all whitespace-nowrap"
                                                >
                                                    + AI
                                                </button>
                                                <button
                                                    onClick={() => handleCallDirect(result, true)}
                                                    className="px-4 py-1.5 text-[8px] font-black uppercase opacity-30 hover:opacity-100 italic"
                                                >
                                                    Ligar AI Direto
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Contacts List */}
                <div className={`rounded-[3rem] border overflow-hidden ${cardClasses}`}>
                    <div className="p-8 border-b border-inherit bg-black/5 dark:bg-white/5 flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-widest opacity-30 italic">Agenda de Conexões</h3>
                        {searchQuery && (
                            <span className="text-[9px] font-black uppercase opacity-20 bg-black/5 dark:bg-white/5 px-3 py-1 rounded-full">Filtrado</span>
                        )}
                    </div>

                    <div className="max-h-[500px] overflow-y-auto no-scrollbar">
                        {filteredContacts.length === 0 && !loading && (
                            <div className="flex flex-col items-center justify-center py-20 opacity-20 italic">
                                <span className="text-4xl mb-4">🌪️</span>
                                <p className="text-[10px] font-black uppercase tracking-widest">Nenhum contato salvo encontrado</p>
                            </div>
                        )}
                        {filteredContacts.map((contact) => (
                            <div
                                key={contact.id}
                                className={`flex items-center gap-5 p-6 border-b transition-all duration-300 ${itemClasses} last:border-0 hover:bg-blue-600/5 group`}
                            >
                                <div className={`w-14 h-14 rounded-[1.5rem] flex items-center justify-center text-2xl shadow-sm transition-transform group-hover:scale-110 ${contact.is_ai_contact ? 'bg-pink-600/10 text-pink-600' : 'bg-blue-600/10 text-blue-600'}`}>
                                    {contact.is_ai_contact ? (
                                        contact.profile?.ai_settings?.image ? (
                                            <img src={contact.profile.ai_settings.image} className="w-full h-full object-cover rounded-[1.5rem]" />
                                        ) : '⚡'
                                    ) : (
                                        contact.profile?.avatar_url ? (
                                            <img src={contact.profile.avatar_url} className="w-full h-full object-cover rounded-[1.5rem]" />
                                        ) : '👤'
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-black text-base tracking-tight truncate italic">
                                        {contact.is_ai_contact
                                            ? (contact.alias === (contact.profile?.nickname || contact.profile?.display_name) || !contact.alias ? (contact.profile?.ai_settings?.name || contact.alias || contact.profile?.nickname || contact.profile?.display_name) : contact.alias)
                                            : (contact.alias || contact.profile?.nickname || contact.profile?.display_name)
                                        }
                                    </h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <p className="text-[10px] font-black opacity-30 uppercase tracking-[0.2em] truncate">
                                            {contact.is_ai_contact
                                                ? formatDisplayNumber(contact.profile?.ai_number || '', true)
                                                : formatDisplayNumber(contact.profile?.personal_number || '', false)}
                                        </p>
                                        <button
                                            onClick={() => copyToClipboard(contact.is_ai_contact ? contact.profile?.ai_number || '' : contact.profile?.personal_number || '')}
                                            className="opacity-0 group-hover:opacity-30 hover:!opacity-100 transition-opacity"
                                        >
                                            📋
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleBlockUser(contact.profile?.id || '', false)}
                                        className="w-10 h-10 bg-red-600/10 text-red-500 rounded-xl hover:bg-red-600 hover:text-white transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                                        title="Bloquear usuário"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                                    </button>
                                    <button
                                        onClick={() => handleCallDirect(contact.profile as any, contact.is_ai_contact)}
                                        className="w-12 h-12 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-600/20 hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Manual Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl animate-in fade-in duration-500">
                    <div className={`w-full max-w-md p-10 rounded-[4rem] border shadow-[0_48px_80px_-20px_rgba(0,0,0,0.6)] transform animate-in slide-in-from-bottom-12 duration-700 ${cardClasses}`}>
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h3 className="text-2xl font-black italic tracking-tighter uppercase">Novo Contato</h3>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-20">Expanda sua rede</p>
                            </div>
                            <button onClick={() => setShowAddModal(false)} className="w-10 h-10 flex items-center justify-center opacity-30 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all text-xl">✕</button>
                        </div>

                        <div className="space-y-10">
                            {/* Photo Upload */}
                            <div className="flex flex-col items-center gap-6">
                                <div className={`w-32 h-32 rounded-[2.5rem] overflow-hidden border-4 shadow-2xl transition-all hover:scale-105 cursor-pointer ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-white'}`}>
                                    {newContact.image ? (
                                        <img src={newContact.image} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-4xl opacity-10">📸</div>
                                    )}
                                </div>
                                <input id="contact-photo" type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                <label htmlFor="contact-photo" className="px-6 py-2 bg-blue-600/10 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-blue-600 hover:text-white transition-all">
                                    Upload Avatar
                                </label>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-3 ml-4">Identificação</label>
                                    <input
                                        type="text"
                                        placeholder="Nome ou Alias"
                                        value={newContact.name}
                                        onChange={e => setNewContact(prev => ({ ...prev, name: e.target.value }))}
                                        className={`w-full p-6 rounded-[2rem] border text-sm font-bold outline-none transition-all ${inputClasses}`}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-3 ml-4">Frequência Digital (9 Dígitos)</label>
                                    <input
                                        type="text"
                                        maxLength={9}
                                        placeholder="000 000 000"
                                        value={newContact.number}
                                        onChange={e => setNewContact(prev => ({ ...prev, number: e.target.value.replace(/\D/g, '') }))}
                                        className={`w-full p-6 rounded-[2rem] border text-sm font-black tracking-[0.5em] outline-none text-center transition-all ${inputClasses}`}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setNewContact(prev => ({ ...prev, type: 'user' }))}
                                        className={`py-5 rounded-[2rem] text-[10px] font-black uppercase tracking-widest border transition-all ${newContact.type === 'user' ? 'bg-black dark:bg-white text-white dark:text-black shadow-2xl' : 'border-inherit opacity-40 hover:opacity-100'}`}
                                    >
                                        Humano
                                    </button>
                                    <button
                                        onClick={() => setNewContact(prev => ({ ...prev, type: 'ai' }))}
                                        className={`py-5 rounded-[2rem] text-[10px] font-black uppercase tracking-widest border transition-all ${newContact.type === 'ai' ? 'bg-pink-600 border-pink-600 text-white shadow-2xl shadow-pink-600/30' : 'border-inherit opacity-40 hover:opacity-100'}`}
                                    >
                                        Artificial
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={handleManualCreate}
                                disabled={loading}
                                className="w-full py-6 bg-blue-600 text-white rounded-[2.5rem] font-black uppercase tracking-[0.3em] shadow-2xl shadow-blue-500/40 hover:scale-[1.02] active:scale-95 transition-all text-[11px] disabled:opacity-50"
                            >
                                {loading ? "Sincronizando..." : "Estabelecer Conexão"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Blocklist Modal */}
            {showBlocklistModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className={`w-full max-w-sm p-8 rounded-[3rem] border shadow-[0_48px_80px_-20px_rgba(0,0,0,0.6)] animate-in slide-in-from-bottom-8 duration-500 ${cardClasses}`}>
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-xl font-black italic tracking-tighter uppercase text-red-500">Lista Negra</h3>
                                <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mt-1">Gerenciar Bloqueios</p>
                            </div>
                            <button onClick={() => setShowBlocklistModal(false)} className="w-8 h-8 flex items-center justify-center opacity-30 hover:opacity-100 bg-black/5 dark:bg-white/5 rounded-full transition-all text-sm">✕</button>
                        </div>

                        <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 no-scrollbar">
                            {!myProfile?.blocked_users?.length && (
                                <p className="text-center py-6 text-[10px] uppercase font-black tracking-widest opacity-30">Nenhum usuário bloqueado.</p>
                            )}
                            {myProfile?.blocked_users?.map(bid => (
                                <div key={bid} className="flex items-center justify-between p-4 bg-black/5 dark:bg-white/5 rounded-2xl border border-red-500/10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-red-500/60 font-mono">ID: {bid.substring(0, 6)}...</span>
                                    </div>
                                    <button onClick={() => {
                                        toggleBlockUser(bid, true);
                                        if (myProfile.blocked_users?.length === 1) setShowBlocklistModal(false);
                                    }} className="text-[9px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded-lg transition-all">Desbloquear</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
