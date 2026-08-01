import { useState, type ReactNode } from 'react';
import { Copy, Check, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react';

interface Props {
    machineId: string;
    onActivate: (key: string) => Promise<{ success: boolean; message?: string }>;
    isValidating: boolean;
    /**
     * ═══ REJOINDRE UNE CAISSE EXISTANTE ═══
     *
     * Toutes les machines n'ont pas de clé, et c'est voulu : une boutique
     * paie UN abonnement, pas une licence par appareil. La deuxième caisse,
     * la tablette des rayons, le PC du patron chez lui — aucun n'a de clé.
     * Ils rejoignent la caisse principale.
     *
     * Ce chemin est proposé ICI parce que c'est le seul écran qu'on voit
     * après avoir installé l'application. Sans lui, un appareil sans clé
     * serait bloqué à la porte, et tout le modèle tomberait.
     *
     * Mais il reste DISCRET : neuf installations sur dix sont une caisse
     * principale, qui a bien une clé. On ne met pas les deux chemins sur le
     * même plan — on garde l'écran tel quel et on ajoute une sortie en bas.
     *
     * Le contenu vient de l'application, pas d'ici : c'est elle qui sait
     * s'appairer (adresse, code à six chiffres, scanner si l'appareil a une
     * caméra). LicenseGuard ne connaît que les licences.
     */
    rejoindre?: ReactNode;
}

export const ActivationScreen = ({ machineId, onActivate, isValidating, rejoindre }: Props) => {
    const [key, setKey] = useState('');
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(machineId);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch { /* clipboard unavailable */ }
    };

    const handleSubmit = async () => {
        setError('');
        const result = await onActivate(key);
        if (!result.success) setError(result.message || 'Erreur de validation.');
    };

    return (
        <div className="lg-page lg-state-activate">
            <div className="lg-card">
                <div className="lg-hero">
                    <div className="lg-hero-icon">
                        <ShieldCheck />
                    </div>
                </div>

                <div className="lg-body">
                    <p className="lg-eyebrow">Activation requise</p>
                    <h1 className="lg-title">Activer cette instance</h1>
                    <p className="lg-description">
                        Cette installation n'est pas encore associée à une licence valide. Saisissez la clé fournie par votre administrateur.
                    </p>

                    <div className="lg-field">
                        <label className="lg-field-label">Identifiant machine</label>
                        <button className="lg-hwid" type="button" onClick={handleCopy} title="Cliquer pour copier">
                            <span className="lg-hwid-value">{machineId || 'Identification…'}</span>
                            {copied
                                ? <Check className="lg-hwid-icon lg-hwid-icon--copied" />
                                : <Copy className="lg-hwid-icon" />}
                        </button>
                    </div>

                    <div className="lg-field">
                        <label className="lg-field-label">Clé d'activation</label>
                        <input
                            className="lg-input"
                            type="text"
                            value={key}
                            onChange={(e) => { setKey(e.target.value); if (error) setError(''); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' && key.trim() && !isValidating) handleSubmit(); }}
                            placeholder="Collez la clé fournie"
                            disabled={isValidating}
                        />
                    </div>

                    <button className="lg-button" type="button" onClick={handleSubmit} disabled={!key.trim() || isValidating}>
                        {isValidating
                            ? <><Loader2 className="lg-button-spin" /><span>Vérification…</span></>
                            : <><ShieldCheck /><span>Activer</span></>}
                    </button>

                    {error && (
                        <div className="lg-alert">
                            <AlertTriangle />
                            <span>{error}</span>
                        </div>
                    )}

                    {rejoindre}

                    <p className="lg-footer">
                        Sécurisé par <span className="lg-footer-brand">Yumi LicenseGuard</span>
                    </p>
                </div>
            </div>
        </div>
    );
};
