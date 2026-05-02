import { RefreshCw, Loader2, AlertTriangle } from 'lucide-react';

interface Props {
    isValidating: boolean;
    syncError: boolean;
    onSync: () => void;
}

export const SyncRequiredScreen = ({ isValidating, syncError, onSync }: Props) => (
    <div className="lg-page lg-state-sync">
        <div className="lg-card">
            <div className="lg-hero">
                <div className="lg-hero-icon">
                    <RefreshCw />
                </div>
            </div>

            <div className="lg-body">
                <p className="lg-eyebrow">Validation requise</p>
                <h1 className="lg-title">Reconnexion au serveur nécessaire</h1>
                <p className="lg-description">
                    Votre licence n'a pas été vérifiée depuis trop longtemps. Connectez-vous à internet pour confirmer vos droits d'accès.
                </p>

                <button className="lg-button" type="button" onClick={onSync} disabled={isValidating}>
                    {isValidating
                        ? <><Loader2 /><span>Vérification…</span></>
                        : <span>S'authentifier maintenant</span>}
                </button>

                {syncError && (
                    <div className="lg-alert">
                        <AlertTriangle />
                        <span>Hub indisponible. Vérifiez votre connexion internet.</span>
                    </div>
                )}

                <p className="lg-footer">
                    Sécurisé par <span className="lg-footer-brand">Yumi LicenseGuard</span>
                </p>
            </div>
        </div>
    </div>
);
