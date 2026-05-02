import { useState } from 'react';
import { Clock, Lock, Key } from 'lucide-react';
import { MeshBackground } from '../components/MeshBackground';

interface Props {
    machineId: string;
    onReset: () => void;
    onSync?: () => Promise<void>;
    isValidating?: boolean;
    showManual?: boolean;
}

export const ExpiredScreen = ({ machineId, onReset, onSync, isValidating, showManual: showManualProp }: Props) => {
    const [copied, setCopied] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [devClicks, setDevClicks] = useState(0);

    const isManualVisible = showManualProp || devClicks >= 7;

    const handleCopy = () => {
        navigator.clipboard.writeText(machineId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleIconClick = () => {
        setDevClicks(prev => prev + 1);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white font-outfit text-slate-900 overflow-hidden px-4">
            <MeshBackground />
            <div className="relative z-10 max-w-md w-full text-center animate-in fade-in zoom-in duration-700">
                <div 
                    onClick={handleIconClick}
                    className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-10 relative border-2 cursor-pointer active:scale-90 transition-transform" 
                    style={{ backgroundColor: 'color-mix(in srgb, var(--yumi-primary), transparent 90%)', borderColor: 'color-mix(in srgb, var(--yumi-primary), transparent 80%)' }}
                >
                        <Clock className="w-12 h-12" style={{ color: 'var(--yumi-primary)' }} />
                        <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center text-white border-4 border-white shadow-lg" style={{ backgroundColor: 'var(--yumi-primary)' }}>
                            <Lock className="w-4 h-4" />
                        </div>
                </div>
                <h2 className="text-4xl font-black mb-4 tracking-tighter uppercase text-slate-900" style={{ fontFamily: 'var(--yumi-font-serif)' }}>Temps Épuisé</h2>
                <p className="text-slate-400 mb-10 font-medium px-8 leading-relaxed">Votre période d'utilisation est terminée. Veuillez contacter l'administration pour renouveler votre accès.</p>
                <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] mb-12 group cursor-pointer active:scale-95 transition-all shadow-xl shadow-slate-200/50" onClick={handleCopy}>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-2 group-hover:text-[var(--yumi-primary)] transition-colors">ID Terminal pour Renouvellement</p>
                    <p className="text-sm font-mono font-bold tracking-tight text-slate-600">{machineId}</p>
                    {copied && <p className="text-[10px] mt-2 font-bold animate-bounce uppercase" style={{ color: 'var(--yumi-primary)' }}>ID copié !</p>}
                </div>

                {onSync && (
                    <button 
                        onClick={onSync}
                        disabled={isValidating}
                        className="w-full mb-6 bg-[var(--yumi-primary)] text-white py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-[var(--yumi-primary)]/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isValidating ? "Vérification..." : "Vérifier mon abonnement"}
                    </button>
                )}

                {isManualVisible && (
                    <button onClick={() => setShowConfirm(true)}
                        className="mx-auto bg-slate-50 p-4 rounded-2xl font-black text-[10px] text-slate-400 uppercase tracking-widest flex items-center gap-2 hover:bg-slate-100 transition-all animate-in fade-in slide-in-from-bottom-2">
                        <Key size={12} /> Activation Manuelle (Reset)
                    </button>
                )}
            </div>

            {showConfirm && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in px-4">
                    <div className="bg-white rounded-[2.5rem] p-10 max-w-sm w-full shadow-2xl animate-in zoom-in-95">
                        <h3 className="text-2xl font-black mb-3 tracking-tight uppercase text-slate-900">Reset Licence ?</h3>
                        <p className="text-sm text-slate-500 mb-8 leading-relaxed">Supprime la clé actuelle pour forcer une nouvelle activation.</p>
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => setShowConfirm(false)} className="py-4 rounded-2xl bg-slate-50 text-slate-400 font-bold text-[10px] uppercase">Annuler</button>
                            <button onClick={onReset} className="py-4 rounded-2xl text-white font-bold text-[10px] uppercase shadow-lg shadow-[var(--yumi-primary)/20]" style={{ backgroundColor: 'var(--yumi-primary)' }}>Confirmer</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
