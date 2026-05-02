import { useState } from 'react';
import { Lock, Copy, Check } from 'lucide-react';

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
        <div className="lg-page lg-state-banned">
            <div className="lg-card">
                <div className="lg-hero">
                    <div className="lg-hero-icon">
                        <Lock />
                    </div>
                </div>

                <div className="lg-body">
                    <p className="lg-eyebrow">Accès suspendu</p>
                    <h1 className="lg-title">Cette licence est suspendue</h1>
                    <p className="lg-description">
                        L'accès à cette instance a été révoqué par l'administration. Veuillez régulariser votre situation pour rétablir le service.
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

                    <p className="lg-footer">
                        Sécurisé par <span className="lg-footer-brand">Yumi LicenseGuard</span>
                    </p>
                </div>
            </div>
        </div>
    );
};
