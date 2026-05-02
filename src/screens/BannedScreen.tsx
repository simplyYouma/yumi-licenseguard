import { useState } from 'react';
import { Lock } from 'lucide-react';
import { MeshBackground } from '../components/MeshBackground';

interface Props {
    machineId: string;
}

export const BannedScreen = ({ machineId }: Props) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(machineId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white font-outfit text-slate-900 overflow-hidden px-4">
            <MeshBackground />
            <div className="relative z-10 w-full max-w-sm text-center animate-in fade-in zoom-in duration-500">
                <div className="bg-white border-2 rounded-[3.5rem] p-12 shadow-[0_30px_60px_rgba(0,0,0,0.1)]" style={{ borderColor: 'var(--yumi-primary)' }}>
                    <div className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner transform -rotate-12 border-2" style={{ backgroundColor: 'color-mix(in srgb, var(--yumi-primary), transparent 90%)', borderColor: 'color-mix(in srgb, var(--yumi-primary), transparent 80%)' }}>
                        <Lock className="w-12 h-12" style={{ color: 'var(--yumi-primary)' }} strokeWidth={2.5} />
                    </div>
                    <h1 className="text-3xl font-black mb-4 tracking-tighter uppercase text-slate-900" style={{ fontFamily: 'var(--yumi-font-serif)' }}>Accès Suspendu</h1>
                    <p className="text-sm text-slate-400 mb-10 leading-relaxed font-medium">Cette licence a été suspendue. Veuillez contacter l'administration pour régulariser votre situation.</p>
                    <div className="bg-slate-50 p-5 rounded-[2rem] mb-10 cursor-pointer hover:bg-slate-100 transition-all active:scale-95 group border-2 border-transparent" onClick={handleCopy}>
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1 group-hover:text-[var(--yumi-primary)] transition-colors font-bold" style={{ color: copied ? 'var(--yumi-primary)' : undefined }}>{copied ? 'ID Terminal Copié !' : 'ID Terminal (Cliquer pour copier)'}</p>
                            <p className="text-xs font-mono font-bold text-slate-600 tracking-tight">{machineId}</p>
                    </div>
                    <div className="flex flex-col items-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--yumi-primary)' }}>Restriction Administrative</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
