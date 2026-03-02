import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

interface AuthModalProps {
    onClose: () => void;
    isDark: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose, isDark }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);

    const cardClasses = isDark ? "bg-[#15181e] border-slate-800" : "bg-white border-slate-100 shadow-2xl";
    const inputClasses = isDark ? "bg-[#0b0c10] border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900";

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { error } = isSignUp
            ? await supabase.auth.signUp({ email, password })
            : await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            alert(error.message);
        } else {
            if (isSignUp) alert("Verifique seu email para confirmar o cadastro!");
            onClose();
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className={`w-full max-w-md p-8 rounded-[2.5rem] border ${cardClasses} transform animate-in zoom-in-95 duration-300`}>
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold tracking-tight mb-2">
                        {isSignUp ? 'Criar Conta' : 'Acessar App'}
                    </h2>
                    <p className="text-sm opacity-50 px-8">
                        Entre para receber seus números de identificação e gerenciar contatos.
                    </p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-4 mb-2 block">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={`w-full p-4 rounded-2xl border outline-none focus:border-blue-500 transition-all ${inputClasses}`}
                            required
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-4 mb-2 block">Senha</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={`w-full p-4 rounded-2xl border outline-none focus:border-blue-500 transition-all ${inputClasses}`}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-blue-600 text-white rounded-[1.5rem] font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-95 transition-all mt-6"
                    >
                        {loading ? 'Carregando...' : isSignUp ? 'Cadastrar' : 'Entrar'}
                    </button>
                </form>

                <div className="mt-8 text-center space-y-4">
                    <button
                        onClick={() => setIsSignUp(!isSignUp)}
                        className="text-xs font-bold text-blue-500 hover:underline"
                    >
                        {isSignUp ? 'Já tem uma conta? Entre' : 'Não tem conta? Cadastre-se'}
                    </button>
                    <div className="pt-4">
                        <button onClick={onClose} className="text-[10px] font-bold uppercase tracking-widest opacity-30 hover:opacity-100 transition-all">
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
