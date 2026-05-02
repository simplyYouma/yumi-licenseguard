import { useState } from 'react';
import { Lock, Copy, Check } from 'lucide-react';
import { guardTheme } from '../theme';

interface Props {
    machineId: string;
}

export const BannedScreen = ({ machineId }: Props) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(machineId);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch { /* noop */ }
    };

    return (
        <div
            className="fixed inset-0 flex items-center justify-center p-4 font-sans"
            style={{ backgroundColor: '#F4F1EA', color: '#1A1A1A', fontFamily: guardTheme.fonts.sans }}
        >
            <div
                className="w-full max-w-[360px] rounded-2xl bg-white text-center"
                style={{ border: '1px solid #E8E5DD', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.05)', padding: '32px 28px' }}
            >
                <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-5"
                    style={{ backgroundColor: '#FEE2E2' }}
                >
                    <Lock className="w-6 h-6" style={{ color: '#DC2626' }} strokeWidth={2.2} />
                </div>

                <h1 style={{ fontFamily: guardTheme.fonts.serif, fontSize: 22, fontWeight: 600 }} className="leading-tight mb-2">
                    Accès suspendu
                </h1>
                <p className="text-[13px] text-neutral-500 leading-relaxed mb-6">
                    Cette licence a été suspendue.<br/>
                    Veuillez contacter l'administration pour régulariser votre situation.
                </p>

                <button
                    onClick={handleCopy}
                    className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left cursor-pointer hover:bg-neutral-50 transition-colors"
                    style={{ border: '1px solid #E8E5DD', backgroundColor: '#FAFAF7' }}
                    title="Cliquer pour copier"
                >
                    <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-0.5">Identifiant machine</div>
                        <code className="text-[11px] text-neutral-700 font-mono truncate block">{machineId}</code>
                    </div>
                    <span className="shrink-0 text-neutral-400">
                        {copied ? <Check size={13} style={{ color: guardTheme.colors.primary }} /> : <Copy size={13} />}
                    </span>
                </button>
            </div>
        </div>
    );
};
