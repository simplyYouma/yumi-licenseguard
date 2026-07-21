import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Loader2, AlertTriangle, Wifi, WifiOff } from 'lucide-react';

interface Props {
    isValidating: boolean;
    syncError: boolean;
    onSync: () => void;
}

export const SyncRequiredScreen = ({ isValidating, syncError, onSync }: Props) => {
    const [online, setOnline] = useState(navigator.onLine);
    const onSyncRef = useRef(onSync);
    onSyncRef.current = onSync;

    // Connectivité en temps réel + resynchronisation sans intervention :
    // tentative dès le montage si le réseau est là, re-tentative dès que
    // l'événement 'online' arrive, et retry périodique en filet de sécurité
    // (les webviews ratent parfois 'online' après une longue coupure).
    useEffect(() => {
        const goOnline = () => {
            setOnline(true);
            // Petit délai : laisser la pile réseau se stabiliser après reconnexion.
            setTimeout(() => onSyncRef.current(), 1200);
        };
        const goOffline = () => setOnline(false);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);

        if (navigator.onLine) setTimeout(() => onSyncRef.current(), 500);
        const retry = setInterval(() => {
            if (navigator.onLine) onSyncRef.current();
        }, 30000);

        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
            clearInterval(retry);
        };
    }, []);

    return (
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

                    <div className={`lg-connectivity ${online ? 'lg-connectivity--online' : 'lg-connectivity--offline'}`}>
                        {online
                            ? <><Wifi /><span>Connexion internet détectée</span></>
                            : <><WifiOff /><span>Aucune connexion internet</span></>}
                    </div>

                    <button className="lg-button" type="button" onClick={onSync} disabled={isValidating}>
                        {isValidating
                            ? <><Loader2 /><span>Vérification…</span></>
                            : <span>S'authentifier maintenant</span>}
                    </button>

                    {syncError && (
                        <div className="lg-alert">
                            <AlertTriangle />
                            <span>
                                {online
                                    ? "Le serveur Yumi Hub est injoignable pour le moment. Nouvel essai automatique dans 30 secondes."
                                    : "Aucune connexion internet. La vérification reprendra automatiquement dès le retour du réseau."}
                            </span>
                        </div>
                    )}

                    <p className="lg-footer">
                        Sécurisé par <span className="lg-footer-brand">Yumi LicenseGuard</span>
                    </p>
                </div>
            </div>
        </div>
    );
};
