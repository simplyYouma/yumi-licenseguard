import { ShieldAlert, RefreshCw } from 'lucide-react';
import { guardTheme } from '../theme';

interface Props {
    machineId: string;
    onRetry: () => void;
}

export const ClockFraudScreen = ({ machineId, onRetry }: Props) => (
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
                <ShieldAlert className="w-6 h-6" style={{ color: '#DC2626' }} strokeWidth={2.2} />
            </div>

            <h1 style={{ fontFamily: guardTheme.fonts.serif, fontSize: 22, fontWeight: 600 }} className="leading-tight mb-2">
                Anomalie d'horloge
            </h1>
            <p className="text-[13px] text-neutral-500 leading-relaxed mb-5">
                Le système a détecté une heure incohérente.<br/>
                Resynchronisez l'horloge Windows pour continuer.
            </p>

            <div
                className="rounded-lg px-3 py-2 mb-4"
                style={{ border: '1px solid #E8E5DD', backgroundColor: '#FAFAF7' }}
            >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-0.5">
                    Identifiant machine
                </div>
                <code className="text-[11px] text-neutral-700 font-mono truncate block">{machineId}</code>
            </div>

            <button
                onClick={onRetry}
                className="w-full rounded-lg py-2.5 text-[13px] font-semibold flex items-center justify-center gap-2"
                style={{ backgroundColor: guardTheme.colors.primary, color: '#FFFFFF' }}
            >
                <RefreshCw size={14} />
                <span>Réessayer</span>
            </button>
        </div>
    </div>
);
