import { useState } from 'react';
import { Clock, Copy, Check, RefreshCw, Key, Loader2 } from 'lucide-react';
import { guardTheme } from '../theme';

interface Props {
    machineId: string;
    onReset: () => void;
    onSync?: () => Promise<void>;
    isValidating?: boolean;
    /** When true, shows the manual reset action (triggered by the Konami "yumi" sequence). */
    showManual?: boolean;
}

export const ExpiredScreen = ({ machineId, onReset, onSync, isValidating, showManual }: Props) => {
    const [copied, setCopied] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(machineId);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch { /* noop */ }
    };

    const accent = guardTheme.colors.primary;

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
                    style={{ backgroundColor: '#FEF3C7' }}
                >
                    <Clock className="w-6 h-6" style={{ color: '#D97706' }} strokeWidth={2.2} />
                </div>

                <h1 style={{ fontFamily: guardTheme.fonts.serif, fontSize: 22, fontWeight: 600 }} className="leading-tight mb-2">
                    Licence expirée
                </h1>
                <p className="text-[13px] text-neutral-500 leading-relaxed mb-5">
                    Votre période d'utilisation est terminée.<br/>
                    Contactez l'administration pour renouveler.
                </p>

                <button
                    onClick={handleCopy}
                    className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left cursor-pointer hover:bg-neutral-50 transition-colors mb-4"
                    style={{ border: '1px solid #E8E5DD', backgroundColor: '#FAFAF7' }}
                    title="Cliquer pour copier"
                >
                    <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-0.5">
                            Identifiant machine
                        </div>
                        <code className="text-[11px] text-neutral-700 font-mono truncate block">{machineId}</code>
                    </div>
                    <span className="shrink-0 text-neutral-400">
                        {copied ? <Check size={13} style={{ color: accent }} /> : <Copy size={13} />}
                    </span>
                </button>

                {onSync && (
                    <button
                        onClick={onSync}
                        disabled={isValidating}
                        className="w-full rounded-lg py-2.5 text-[13px] font-semibold flex items-center justify-center gap-2 transition-opacity"
                        style={{
                            backgroundColor: accent,
                            color: '#FFFFFF',
                            opacity: isValidating ? 0.5 : 1,
                            cursor: isValidating ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {isValidating ? (
                            <><Loader2 size={14} className="animate-spin" /><span>Vérification…</span></>
                        ) : (
                            <><RefreshCw size={14} /><span>Vérifier mon abonnement</span></>
                        )}
                    </button>
                )}

                {showManual && (
                    <button
                        onClick={() => setShowConfirm(true)}
                        className="mt-3 w-full rounded-lg py-2 text-[11px] text-neutral-500 hover:text-neutral-900 transition-colors flex items-center justify-center gap-1.5"
                        style={{ border: '1px dashed #D4D0C4' }}
                    >
                        <Key size={11} /> Activation manuelle (reset)
                    </button>
                )}
            </div>

            {showConfirm && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div
                        className="w-full max-w-[320px] rounded-2xl bg-white"
                        style={{ border: '1px solid #E8E5DD', padding: '24px' }}
                    >
                        <h3 style={{ fontFamily: guardTheme.fonts.serif, fontSize: 18, fontWeight: 600 }} className="mb-2">
                            Réinitialiser la licence ?
                        </h3>
                        <p className="text-[12px] text-neutral-500 mb-5">
                            Supprime la clé actuelle pour forcer une nouvelle activation.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setShowConfirm(false)}
                                className="rounded-lg py-2 text-[12px] font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
                                style={{ border: '1px solid #E8E5DD' }}
                            >
                                Annuler
                            </button>
                            <button
                                onClick={onReset}
                                className="rounded-lg py-2 text-[12px] font-semibold text-white"
                                style={{ backgroundColor: accent }}
                            >
                                Confirmer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
