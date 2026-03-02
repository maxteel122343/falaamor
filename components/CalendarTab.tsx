import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Reminder, PartnerProfile, CallLog, Mood, UserProfile } from '../types';

interface CalendarTabProps {
    user: any;
    profile: PartnerProfile;
    setProfile: React.Dispatch<React.SetStateAction<PartnerProfile>>;
    currentUserProfile?: UserProfile | null;
    isDark: boolean;
}

export const CalendarTab: React.FC<CalendarTabProps> = ({ user, profile, setProfile, currentUserProfile, isDark }) => {
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [loading, setLoading] = useState(false);
    const [editReminder, setEditReminder] = useState<Partial<Reminder> | null>(null);

    const cardClasses = isDark ? "bg-[#15181e] border-white/5" : "bg-white border-slate-100 shadow-sm";
    const itemClasses = isDark ? "hover:bg-white/5 border-white/5 bg-[#0b0c10]" : "hover:bg-slate-50 border-slate-100 bg-white shadow-sm";
    const inputClasses = isDark ? "bg-white/5 border-white/10 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500";

    useEffect(() => {
        if (user) {
            fetchReminders();
        }
    }, [user]);

    const fetchReminders = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('reminders')
            .select('*')
            .eq('owner_id', user.id)
            .order('trigger_at', { ascending: true });
        if (data) setReminders(data);
        setLoading(false);
    };

    const addLogToHistory = (message: string) => {
        const newLog: CallLog = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            durationSec: 0,
            moodEnd: profile.mood,
            notes: message
        };
        setProfile(prev => {
            const updated = { ...prev, history: [...prev.history, newLog] };
            if (user) {
                supabase.from('profiles').update({ ai_settings: updated }).eq('id', user.id).then();
            }
            return updated;
        });
    };

    const handleUpdateReminder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editReminder || !editReminder.title || !editReminder.trigger_at) return;

        const isNew = !editReminder.id;
        const msg = isNew ? `Adicionou lembrete: ${editReminder.title}` : `Alterou o lembrete "${editReminder.title}" no calendário.`;

        if (isNew) {
            await supabase.from('reminders').insert({
                owner_id: user.id,
                title: editReminder.title,
                trigger_at: editReminder.trigger_at
            });
        } else {
            await supabase.from('reminders').update({
                title: editReminder.title,
                trigger_at: editReminder.trigger_at
            }).eq('id', editReminder.id);
        }

        addLogToHistory(msg);
        setEditReminder(null);
        fetchReminders();
    };

    const deleteReminder = async (id: string) => {
        if (!confirm("Excluir este compromisso?")) return;
        await supabase.from('reminders').delete().eq('id', id);
        addLogToHistory("Excluiu um compromisso do calendário.");
        fetchReminders();
    };

    const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

    const days = getDaysInMonth(selectedDate);
    const firstDay = getFirstDayOfMonth(selectedDate);
    const monthName = selectedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const filteredReminders = reminders.filter(r => {
        const d = new Date(r.trigger_at);
        return d.getDate() === selectedDate.getDate() &&
            d.getMonth() === selectedDate.getMonth() &&
            d.getFullYear() === selectedDate.getFullYear();
    });

    return (
        <div className="w-full flex flex-col items-center gap-8 pt-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
            {/* Header Section */}
            <div className="w-full flex justify-between items-end mb-2">
                <div>
                    <h2 className="text-3xl font-black tracking-tighter italic uppercase">Agenda</h2>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30">Planejamento & Compromissos</p>
                </div>
            </div>

            <div className="w-full flex flex-col lg:flex-row gap-8">
                {/* Calendar View */}
                <div className={`flex-1 p-8 rounded-[3rem] border relative overflow-hidden ${cardClasses}`}>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full" />

                    <div className="flex justify-between items-center mb-8">
                        <h3 className="text-lg font-black tracking-tighter uppercase italic opacity-70">{monthName}</h3>
                        <div className="flex gap-2">
                            <button onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() - 1)))} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'} border ${isDark ? 'border-white/5' : 'border-slate-100'}`}>‹</button>
                            <button onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() + 1)))} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'} border ${isDark ? 'border-white/5' : 'border-slate-100'}`}>›</button>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-4">
                        {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map(d => (
                            <div key={d} className="text-center text-[10px] font-black uppercase tracking-widest opacity-20 py-2">{d}</div>
                        ))}
                        {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                        {Array.from({ length: days }).map((_, i) => {
                            const day = i + 1;
                            const isToday = new Date().toDateString() === new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day).toDateString();
                            const isSelected = selectedDate.getDate() === day;
                            const hasReminder = reminders.some(r => {
                                const rd = new Date(r.trigger_at);
                                return rd.getDate() === day && rd.getMonth() === selectedDate.getMonth() && rd.getFullYear() === selectedDate.getFullYear();
                            });

                            return (
                                <button
                                    key={day}
                                    onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day))}
                                    className={`h-12 sm:h-14 rounded-2xl flex flex-col items-center justify-center relative transition-all duration-300 ${isSelected
                                        ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20 scale-105 z-10'
                                        : 'hover:bg-blue-500/10'
                                        } ${isToday && !isSelected ? 'border-2 border-blue-500/30 font-black' : 'font-bold'}`}
                                >
                                    <span className="text-[14px]">{day}</span>
                                    {hasReminder && <div className={`w-1 h-1 rounded-full absolute bottom-2.5 ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Reminders List */}
                <div className="w-full lg:w-[40%] flex flex-col gap-6">
                    <div className={`p-8 rounded-[3rem] border flex flex-col min-h-[400px] ${cardClasses}`}>
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-1">Eventos do dia</p>
                                <h3 className="text-xl font-black tracking-tight italic">
                                    {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).split(' de ').join(' ')}
                                </h3>
                            </div>
                            <button
                                onClick={() => setEditReminder({ title: '', trigger_at: selectedDate.toISOString() })}
                                className="w-12 h-12 bg-blue-600 text-white rounded-[1.25rem] flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-xl shadow-blue-600/30"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-4 overflow-y-auto max-h-[500px] pr-2 no-scrollbar">
                            {filteredReminders.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 opacity-20 italic">
                                    <span className="text-4xl mb-4">🍃</span>
                                    <p className="text-xs font-bold uppercase tracking-widest">Nada agendado</p>
                                </div>
                            ) : (
                                filteredReminders.map(r => (
                                    <div key={r.id} className={`p-5 rounded-[2rem] border transition-all flex items-center gap-4 group ${itemClasses} hover:border-blue-500/30`}>
                                        <div className="w-12 h-12 rounded-2xl bg-blue-500/5 flex items-center justify-center text-xl">📅</div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-[13px] truncate tracking-tight">{r.title}</h4>

                                            {r.creator_ai_name ? (
                                                <div className="flex flex-wrap items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full bg-pink-500/5 border border-pink-500/10 w-fit">
                                                    <span className="text-[7px] font-black uppercase tracking-tighter text-pink-500/40">Agendado por</span>
                                                    <span className="text-[8px] font-black italic text-pink-600 uppercase tracking-tight truncate max-w-[100px]">{r.creator_ai_name}</span>
                                                    {r.creator_ai_number && (
                                                        <span className="text-[7px] font-bold opacity-30">({r.creator_ai_number})</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full bg-blue-500/5 border border-blue-500/10 w-fit">
                                                    <span className="text-[7px] font-black uppercase tracking-tighter text-blue-500/40">Agendado por</span>
                                                    <span className="text-[8px] font-black italic text-blue-600 uppercase tracking-tight truncate max-w-[100px]">{currentUserProfile?.nickname || currentUserProfile?.display_name || "Você"}</span>
                                                    {currentUserProfile?.personal_number && (
                                                        <span className="text-[7px] font-bold opacity-30">({currentUserProfile.personal_number})</span>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-2">
                                                <p className="text-[10px] font-black opacity-40 uppercase">
                                                    ⏰ {new Date(r.trigger_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                                <p className="text-[8px] font-bold opacity-20 uppercase tracking-widest truncate">
                                                    Criado: {new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} {new Date(r.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 opacity-10 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => setEditReminder(r)} className="p-2 hover:bg-blue-500/10 rounded-xl text-blue-500 transition-colors">✏️</button>
                                            <button onClick={() => deleteReminder(r.id)} className="p-2 hover:bg-red-500/10 rounded-xl text-red-500 transition-colors">🗑️</button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            {editReminder && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className={`w-full max-w-sm p-10 rounded-[3.5rem] border ${cardClasses} shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] transform animate-in slide-in-from-bottom-8 duration-500`}>
                        <div className="mb-8">
                            <h3 className="text-2xl font-black italic tracking-tighter uppercase">{editReminder.id ? 'Editar' : 'Novo'} Lembrete</h3>
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-30">Organize sua rotina</p>
                        </div>

                        <form onSubmit={handleUpdateReminder} className="space-y-6">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-3 ml-4">O que deve ser lembrado?</label>
                                <input
                                    type="text"
                                    autoFocus
                                    placeholder="Ex: Reunião importante"
                                    value={editReminder.title}
                                    onChange={e => setEditReminder({ ...editReminder, title: e.target.value })}
                                    className={`w-full p-5 rounded-[1.8rem] text-sm font-bold border outline-none transition-all ${inputClasses}`}
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-3 ml-4">Quando?</label>
                                <input
                                    type="datetime-local"
                                    value={editReminder.trigger_at?.slice(0, 16)}
                                    onChange={e => setEditReminder({ ...editReminder, trigger_at: new Date(e.target.value).toISOString() })}
                                    className={`w-full p-5 rounded-[1.8rem] text-sm font-bold border outline-none transition-all ${inputClasses}`}
                                    required
                                />
                            </div>
                            <div className="pt-4 flex gap-4">
                                <button type="button" onClick={() => setEditReminder(null)} className="flex-1 py-5 font-black opacity-30 hover:opacity-100 transition-all uppercase tracking-[0.2em] text-[10px]">Cancelar</button>
                                <button type="submit" className="flex-1 py-5 bg-blue-600 text-white rounded-[1.8rem] font-black uppercase tracking-widest shadow-xl shadow-blue-500/30 hover:bg-blue-700 active:scale-95 transition-all text-[11px]">Confirmar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
