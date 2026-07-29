import { useEffect, useRef, useState } from 'react';
import type { AvailableUpdate, InstallProgress } from '../hooks/useUpdater';

/**
 * Overlay d'installation BLOQUANT — partagé par tous les POS.
 *
 * Dès que l'utilisateur lance une mise à jour, cet écran couvre TOUTE
 * l'application (aucune activité possible pendant l'install) et montre :
 *   - la phase en cours (téléchargement → vérification → installation),
 *   - une barre de progression en pourcentage (ou indéterminée),
 *   - un bouton « Annuler » tant que le téléchargement est interruptible
 *     (Android — le flux desktop de tauri-plugin-updater ne l'est pas),
 *   - en cas d'erreur : le message exact + « Réessayer » / « Fermer » —
 *     l'app ne reste JAMAIS figée sur un échec.
 *
 * Cycle : monté → install() démarre immédiatement. Sur succès desktop,
 * l'app redémarre d'elle-même ; sur Android, l'installeur système prend
 * le relais (l'overlay reste affiché avec le libellé d'attente).
 */

interface Props {
    update: AvailableUpdate;
    /** Fermer l'overlay (après échec ou annulation — jamais en cours). */
    onClose: () => void;
}

const PHASE_LABEL: Record<InstallProgress['phase'], string> = {
    download: 'Téléchargement de la mise à jour…',
    verify: 'Vérification de la signature…',
    install: "Lancement de l'installation…",
};

const fmtMB = (b: number) => `${(b / 1024 / 1024).toFixed(1)} Mo`;

export function InstallOverlay({ update, onClose }: Props) {
    const [progress, setProgress] = useState<InstallProgress>({
        phase: 'download', percent: null, downloadedBytes: 0, totalBytes: null,
    });
    const [error, setError] = useState<string | null>(null);
    const [cancelling, setCancelling] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const startedRef = useRef(-1);

    useEffect(() => {
        if (startedRef.current === attempt) return;
        startedRef.current = attempt;
        setError(null);
        setCancelling(false);
        setProgress({ phase: 'download', percent: null, downloadedBytes: 0, totalBytes: null });
        void update.install(setProgress).then(() => {
            // Succès : desktop redémarre tout seul ; Android affiche le
            // dialogue système d'installation par-dessus. Dans les deux cas
            // on laisse l'overlay en place — l'app va être remplacée.
            setProgress((p) => ({ ...p, phase: 'install', percent: 100 }));
        }).catch((e) => {
            const msg = (e as Error)?.message ?? String(e);
            setError(msg);
        });
    }, [attempt, update]);

    const cancellable = update.cancel != null && progress.phase === 'download' && !error;

    const cancel = async () => {
        if (!update.cancel) return;
        setCancelling(true);
        try { await update.cancel(); } catch { /* le flux remontera l'erreur */ }
    };

    const isCancelled = error != null && /annul/i.test(error);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 2147483200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(12, 10, 9, 0.86)', backdropFilter: 'blur(6px)',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            padding: 24,
        }}>
            <div style={{
                width: '100%', maxWidth: 420,
                background: '#1C1917', color: '#fff',
                borderRadius: 24, padding: '28px 26px',
                boxShadow: '0 24px 70px -18px rgba(0,0,0,0.7)',
                textAlign: 'center',
            }}>
                {!error ? (
                    <>
                        <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.55 }}>
                            Mise à jour
                        </p>
                        <p style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 800 }}>
                            v{update.version}
                        </p>
                        <p style={{ margin: '18px 0 10px', fontSize: 13, opacity: 0.85 }}>
                            {PHASE_LABEL[progress.phase]}
                        </p>

                        {/* Barre de progression — déterminée si on connaît la taille. */}
                        <div style={{
                            height: 8, borderRadius: 9999, overflow: 'hidden',
                            background: 'rgba(255,255,255,0.14)',
                        }}>
                            <div style={{
                                height: '100%', borderRadius: 9999,
                                background: '#fff',
                                width: progress.phase !== 'download'
                                    ? '100%'
                                    : `${progress.percent ?? 30}%`,
                                transition: 'width 200ms ease',
                                ...(progress.percent == null && progress.phase === 'download'
                                    ? { animation: 'yumi-indeterminate 1.2s ease-in-out infinite' }
                                    : {}),
                            }} />
                        </div>
                        <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.65, fontVariantNumeric: 'tabular-nums' }}>
                            {progress.phase === 'download'
                                ? (progress.percent != null
                                    ? `${progress.percent} % · ${fmtMB(progress.downloadedBytes)}${progress.totalBytes ? ` / ${fmtMB(progress.totalBytes)}` : ''}`
                                    : fmtMB(progress.downloadedBytes))
                                : progress.phase === 'install'
                                    ? "L'application va redémarrer — confirme si le système le demande."
                                    : 'Un instant…'}
                        </p>

                        <p style={{ margin: '18px 0 0', fontSize: 12, opacity: 0.55 }}>
                            Patiente sans fermer l'application — l'activité reprendra
                            automatiquement après la mise à jour.
                        </p>

                        {cancellable && (
                            <button onClick={() => void cancel()} disabled={cancelling}
                                style={{
                                    marginTop: 18,
                                    background: 'transparent', color: 'rgba(255,255,255,0.75)',
                                    border: '1px solid rgba(255,255,255,0.25)',
                                    borderRadius: 9999, padding: '9px 22px',
                                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                    opacity: cancelling ? 0.5 : 1,
                                }}>
                                {cancelling ? 'Annulation…' : 'Annuler'}
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.55 }}>
                            {isCancelled ? 'Installation annulée' : "Échec de l'installation"}
                        </p>
                        <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.5, opacity: 0.85, wordBreak: 'break-word' }}>
                            {isCancelled
                                ? 'Tu pourras relancer la mise à jour à tout moment depuis la bannière ou les Réglages.'
                                : error}
                        </p>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
                            <button onClick={onClose}
                                style={{
                                    background: 'transparent', color: 'rgba(255,255,255,0.75)',
                                    border: '1px solid rgba(255,255,255,0.25)',
                                    borderRadius: 9999, padding: '10px 22px',
                                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                }}>
                                Fermer
                            </button>
                            {!isCancelled && (
                                <button onClick={() => setAttempt((a) => a + 1)}
                                    style={{
                                        background: '#fff', color: '#1C1917',
                                        border: 'none', borderRadius: 9999, padding: '10px 22px',
                                        fontSize: 12, fontWeight: 800, cursor: 'pointer',
                                    }}>
                                    Réessayer
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
            <style>{`@keyframes yumi-indeterminate {
                0% { margin-left: 0; width: 30%; }
                50% { margin-left: 35%; width: 40%; }
                100% { margin-left: 70%; width: 30%; }
            }`}</style>
        </div>
    );
}
