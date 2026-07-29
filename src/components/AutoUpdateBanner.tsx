import { useState } from 'react';
import { useUpdater } from '../hooks/useUpdater';
import { InstallOverlay } from './InstallOverlay';

/**
 * Bannière d'auto-mise à jour — rendue par LicenseGuard pour TOUS les POS.
 *
 * Au démarrage, toutes les ~3 min et à chaque retour au premier plan,
 * `useUpdater` vérifie le Hub. Si une
 * version supérieure est publiée, cette bannière apparaît en bas de l'écran
 * avec un bouton « Installer » qui télécharge, vérifie la signature et
 * redémarre l'app (desktop) / lance l'installeur APK (Android).
 *
 * Hors Tauri (preview web) ou sans mise à jour : ne rend rien.
 */
export function AutoUpdateBanner() {
    const { update } = useUpdater();
    const [installing, setInstalling] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    if (!update || dismissed) return null;

    // L'installation vit dans l'OVERLAY BLOQUANT partagé : progression en %,
    // activité gelée le temps de l'install, erreurs affichées (jamais figé),
    // annulation possible pendant le téléchargement (Android).
    if (installing) {
        return <InstallOverlay update={update} onClose={() => setInstalling(false)} />;
    }

    return (
        <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0,
            zIndex: 2147483000, display: 'flex', justifyContent: 'center',
            // Respecte la barre de navigation gestuelle Android / l'encoche iOS :
            // sans ce dégagement, la bannière passe SOUS la barre système et le
            // bouton « Installer » devient intouchable (vérifié sur tablette).
            // `max()` garantit un minimum de 56px même quand le WebView ne
            // renseigne pas env() (pas de viewport-fit=cover → env() vaut 0,
            // donc le fallback d'env() ne suffit pas — il faut un plancher).
            padding: 14,
            paddingBottom: 'max(56px, calc(14px + env(safe-area-inset-bottom)))',
            pointerEvents: 'none',
        }}>
            <div style={{
                pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 12,
                background: '#1C1917', color: '#fff',
                borderRadius: 20, padding: '12px 14px 12px 18px',
                boxShadow: '0 16px 40px -10px rgba(0,0,0,0.55)',
                maxWidth: 540, width: '100%',
                fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>
                        Mise à jour disponible — v{update.version}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>
                        Installe la dernière version (corrections & nouveautés).
                    </p>
                </div>
                <button onClick={() => setDismissed(true)}
                    style={{
                        background: 'transparent', color: 'rgba(255,255,255,0.7)',
                        border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        padding: '8px 10px', borderRadius: 9999,
                    }}>
                    Plus tard
                </button>
                <button onClick={() => setInstalling(true)}
                    style={{
                        background: '#fff', color: '#1C1917',
                        border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 800, padding: '9px 16px', borderRadius: 9999,
                        whiteSpace: 'nowrap',
                    }}>
                    Installer
                </button>
            </div>
        </div>
    );
}
