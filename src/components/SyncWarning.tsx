import { AlertTriangle, ShieldCheck } from 'lucide-react';

interface Props {
    onDismiss: () => void;
}

export const SyncWarning = ({ onDismiss }: Props) => {
    return (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[150] w-full max-w-sm px-4 font-outfit">
            <div className="bg-white/80 backdrop-blur-xl border rounded-3xl p-4 shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 duration-700" style={{ borderColor: 'color-mix(in srgb, var(--yumi-primary), transparent 80%)' }}>
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-lg text-white" style={{ backgroundColor: 'var(--yumi-primary)' }}>
                    <AlertTriangle size={18} className="animate-pulse" />
                </div>
                <div className="flex-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Administration</p>
                    <p className="text-[11px] font-bold text-slate-700 leading-tight">Sync requise dans moins de 24h</p>
                </div>
                <button onClick={onDismiss} className="w-8 h-8 flex items-center justify-center text-slate-300 transition-colors" style={{ color: 'var(--yumi-primary)' }}>
                    <ShieldCheck size={16} />
                </button>
            </div>
        </div>
    );
};
