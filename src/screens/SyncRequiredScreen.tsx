
import { AlertTriangle, Loader2 } from 'lucide-react';
import { MeshBackground } from '../components/MeshBackground';

interface Props {
    isValidating: boolean;
    syncError: boolean;
    onSync: () => void;
}

export const SyncRequiredScreen = ({ isValidating, syncError, onSync }: Props) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white font-outfit text-slate-900 overflow-hidden px-4">
            <MeshBackground />
            <div className="relative z-10 w-full max-w-sm text-center animate-in fade-in zoom-in duration-500 px-4">
                <div className="bg-white border-2 border-slate-900/5 rounded-[3.5rem] p-12 shadow-[0_30px_60px_rgba(0,0,0,0.08)]">
                        <div className="w-24 h-24 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner transform rotate-6 border border-slate-100/50">
                        <AlertTriangle className="w-12 h-12 text-slate-900" strokeWidth={2.5} />
                    </div>
                    <h1 className="text-3xl font-black mb-4 tracking-tighter uppercase" style={{ fontFamily: 'var(--yumi-font-serif)' }}>Validation Requise</h1>
                    <p className="text-sm text-slate-400 mb-10 leading-relaxed font-medium">Une connexion au serveur d'administration est nécessaire pour valider vos droits d'accès.</p>
                    <button onClick={onSync} disabled={isValidating}
                        style={{ backgroundColor: isValidating ? undefined : 'var(--yumi-primary)' }}
                        className={`w-full text-white font-black py-5 rounded-3xl transition-all active:scale-95 shadow-xl uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 ${isValidating ? 'bg-slate-200 opacity-40 grayscale pointer-events-none' : 'hover:brightness-110 shadow-[var(--yumi-primary)/10]'}`}
                    >
                        {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'S\'AUTHENTIFIER MAINTENANT'}
                    </button>
                    {syncError && (
                        <div className="mt-6 p-4 bg-red-50 rounded-2xl border border-red-100 animate-in slide-in-from-top-2">
                            <p className="text-[11px] font-black leading-tight uppercase tracking-widest" style={{ color: 'var(--yumi-primary)' }}>Connexion ou Hub indisponible. Vérifiez Internet.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
