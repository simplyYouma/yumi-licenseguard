import { useState } from 'react';
import { Clock, Copy, Check, RefreshCw, Loader2 } from 'lucide-react';

interface Props {
    machineId: string;
    onReset: () => void;
    onSync?: () => Promise<void>;
    isValidating?: boolean;
    /** When true, exposes a manual reset (triggered by Konami "yumi" sequence). */
    showManual?: boolean;
}

export const ExpiredScreen = ({ machineId, onReset, onSync, isValidating, showManual }: Props) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(machineId);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch { /* noop */ }
    };

    return (
        <div className="lg-page lg-state-expired">
            {showManual && (
                <button className="lg-dev-reset" onClick={onReset}>Reset licence</button>
            )}

            <div className="lg-card">
                <div className="lg-hero">
                    <div className="lg-hero-icon">
                        <Clock />
                    </div>
                </div>

                <div className="lg-body">
                    <p className="lg-eyebrow">Licence expirée</p>
                    <h1 className="lg-title">Période d'utilisation terminée</h1>
                    <p className="lg-description">
                        Votre licence a expiré. Contactez l'administration pour renouveler, ou vérifiez si une mise à jour est disponible.
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

                    {onSync && (
                        <button className="lg-button" type="button" onClick={onSync} disabled={isValidating}>
                            {isValidating
                                ? <><Loader2 /><span>Vérification…</span></>
                                : <><RefreshCw /><span>Vérifier mon abonnement</span></>}
                        </button>
                    )}

                    <p className="lg-footer">
                        Sécurisé par <span className="lg-footer-brand">Yumi LicenseGuard</span>
                    </p>
                </div>
            </div>
        </div>
    );
};
