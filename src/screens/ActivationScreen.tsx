import { useState } from 'react';
import { ShieldCheck, Copy, Check, Key, AlertTriangle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { MeshBackground } from '../components/MeshBackground';
import { guardTheme } from '../theme';

interface Props {
    machineId: string;
    onActivate: (key: string) => Promise<{ success: boolean; message?: string }>;
    isValidating: boolean;
}

export const ActivationScreen: React.FC<Props> = ({ machineId, onActivate, isValidating }) => {
    const [key, setKey] = useState('');
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const [devClicks, setDevClicks] = useState(0);

    const handleCopy = () => {
        navigator.clipboard.writeText(machineId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleIconClick = () => {
        setDevClicks(prev => prev + 1);
    };

    const handleSubmit = async () => {
        setError('');
        const result = await onActivate(key);
        if (!result.success) setError(result.message || "Erreur.");
    };

    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-outfit text-slate-900">
            <MeshBackground />
            
            {/* Global Dev Reset Button (Hidden) */}
            {devClicks >= 7 && (
                <div className="fixed top-4 right-4 z-[200] animate-bounce">
                     <button 
                        onClick={async () => { await invoke('save_license_key', { key: '' }); window.location.reload(); }}
                        className="bg-slate-900 text-white text-[10px] font-black px-4 py-2 rounded-full shadow-lg border border-white/20"
                     >
                        RESET LICENCE (DEV)
                     </button>
                </div>
            )}

            <div className="relative z-10 w-full max-w-[500px] animate-in fade-in slide-in-from-bottom-5 duration-1000">
                <div className="bg-white/80 backdrop-blur-2xl border border-gray-100 rounded-[4rem] p-12 md:p-16 shadow-[0_30px_70px_rgba(0,0,0,0.1)]">
                    <div className="text-center mb-14">
                        <div className="relative inline-block mb-10 cursor-pointer active:scale-95 transition-transform" onClick={handleIconClick}>
                            <div className="absolute inset-0 blur-3xl rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--yumi-primary), transparent 80%)' }}></div>
                            <div className="w-24 h-24 bg-white border-4 rounded-[2.5rem] flex items-center justify-center relative transform -rotate-6 shadow-2xl transition-transform hover:rotate-0 duration-500" style={{ borderColor: 'var(--yumi-primary)' }}>
                                <ShieldCheck className="w-12 h-12" style={{ color: 'var(--yumi-primary)' }} strokeWidth={2.5} />
                            </div>
                        </div>
                        <h1 className="text-4xl font-black text-slate-900 tracking-tighter mb-2 uppercase" style={{ fontFamily: 'var(--yumi-font-serif)' }}>SÉCURISATION</h1>
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">{guardTheme.config.projectName} / CORE SECURITY</p>
                    </div>

                    <div className="space-y-4 mb-10">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] pl-2">Machine ID (HWID)</label>
                        <div className="relative group cursor-pointer" onClick={handleCopy}>
                            <input readOnly value={machineId || 'IDENTIFICATION...'} className="w-full bg-slate-50 border-2 border-slate-50 rounded-3xl py-6 px-10 text-xs font-bold text-slate-800 shadow-inner cursor-pointer transition-all hover:bg-white hover:border-slate-200 focus:outline-none" />
                            <button className="absolute right-4 top-1/2 -translate-y-1/2 p-4 text-slate-300 hover:text-slate-900">
                                {copied ? <Check className="w-6 h-6" style={{ color: 'var(--yumi-primary)' }} /> : <Copy className="w-6 h-6" />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4 mb-12">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] pl-2">Clé d'Activation</label>
                        <div className="relative">
                            <input type="text" placeholder="Entrez la clé..." value={key} onChange={(e) => setKey(e.target.value)}
                                className={`w-full bg-white border-2 rounded-[2rem] py-6 px-10 text-sm font-bold text-slate-800 shadow-2xl transition-all focus:outline-none ${error ? 'border-red-500 bg-red-50' : 'border-slate-50 focus:border-slate-900/10'}`} />
                            <Key className="absolute right-8 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-200" />
                        </div>
                        {error && (
                            <div className="flex items-center gap-3 bg-red-50 text-red-600 p-6 rounded-3xl border-2 border-red-100 animate-shake">
                                <AlertTriangle className="w-5 h-5 shrink-0" />
                                <p className="text-[11px] font-black uppercase tracking-widest">{error}</p>
                            </div>
                        )}
                    </div>

                    <button onClick={handleSubmit} disabled={!key.trim() || isValidating}
                        style={{ backgroundColor: (!key.trim() || isValidating) ? undefined : 'var(--yumi-primary)' }}
                        className={`w-full text-white rounded-[2.5rem] py-6 font-black uppercase tracking-[0.2em] text-[11px] transition-all shadow-2xl flex items-center justify-center space-x-4 active:scale-95 ${(!key.trim() || isValidating) ? 'bg-slate-200 opacity-40 grayscale pointer-events-none' : 'hover:brightness-110 shadow-[var(--yumi-primary)/20]'}`}>
                            {isValidating ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <><ShieldCheck size={20} strokeWidth={2.5} /><span>Activer cette Instance</span></>}
                    </button>
                </div>
            </div>
        </div>
    );
};
