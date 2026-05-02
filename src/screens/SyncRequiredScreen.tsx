import { Cloud, Loader2, AlertTriangle } from 'lucide-react';
import { guardTheme } from '../theme';

interface Props {
    isValidating: boolean;
    syncError: boolean;
    onSync: () => void;
}

export const SyncRequiredScreen = ({ isValidating, syncError, onSync }: Props) => {
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
                    style={{ backgroundColor: '#DBEAFE' }}
                >
                    <Cloud className="w-6 h-6" style={{ color: '#2563EB' }} strokeWidth={2.2} />
                </div>

                <h1 style={{ fontFamily: guardTheme.fonts.serif, fontSize: 22, fontWeight: 600 }} className="leading-tight mb-2">
                    Validation requise
                </h1>
                <p className="text-[13px] text-neutral-500 leading-relaxed mb-5">
                    Une connexion au serveur est nécessaire pour confirmer vos droits d'accès.
                </p>

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
                        <span>S'authentifier maintenant</span>
                    )}
                </button>

                {syncError && (
                    <div className="flex items-start gap-2 text-[11px] text-red-700 bg-red-50 border border-red-100 rounded-md px-2.5 py-2 mt-3 text-left">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        <span>Hub indisponible. Vérifiez votre connexion internet.</span>
                    </div>
                )}
            </div>
        </div>
    );
};
