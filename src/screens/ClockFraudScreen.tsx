import { useState } from 'react';
import { AlertTriangle, Copy, Check, RefreshCw } from 'lucide-react';

interface Props {
    machineId: string;
    onRetry: () => void;
}

export const ClockFraudScreen = ({ machineId, onRetry }: Props) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(machineId);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch { /* noop */ }
    };

    return (
        <div className="lg-page lg-state-clock">
            <div className="lg-card">
                <div className="lg-hero">
                    <div className="lg-hero-icon">
                        <AlertTriangle />
                    </div>
                </div>

                <div className="lg-body">
                    <p className="lg-eyebrow">Anomalie d'horloge</p>
                    <h1 className="lg-title">Heure système incohérente</h1>
                    <p className="lg-description">
                        Une manipulation de l'horloge a été détectée. Resynchronisez l'heure de votre système avec l'heure réelle pour continuer.
                    </p>

                    <div className="lg-field">
                        <label className="lg-field-label">Identifiant machine</label>
                        <button className="lg-hwid" type="button" onClick={handleCopy} title="Cliquer pour copier">
                            <span className="lg-hwid-value">{machineId}</span>
                            {copied
                                ? <Check className="lg-hwid-icon lg-hwid-icon--copied" />
                                : <Copy className="lg-hwid-icon" />}
                        </button>
                    </div>

                    <button className="lg-button" type="button" onClick={onRetry}>
                        <RefreshCw />
                        <span>Réessayer</span>
                    </button>

                    <p className="lg-footer">
                        Sécurisé par <span className="lg-footer-brand">Yumi LicenseGuard</span>
                    </p>
                </div>
            </div>
        </div>
    );
};
