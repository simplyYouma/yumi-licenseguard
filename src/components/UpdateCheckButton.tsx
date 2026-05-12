import { useState, useEffect } from 'react';
import { useUpdater } from '../hooks/useUpdater';

/**
 * Bouton autonome pour vérifier/installer les mises à jour. À glisser dans
 * une page Réglages — la dernière section, en bas, est l'emplacement idéal.
 *
 * États visuels (un seul bouton, le label change) :
 *   1. Idle                  → "Vérifier les mises à jour"
 *   2. Checking              → "Vérification…"
 *   3. À jour                → "✓ Vous êtes à jour" (auto-reset après 3s)
 *   4. Mise à jour dispo     → "v1.2.0 disponible · Installer"
 *   5. En cours d'install    → "Installation… (l'app va redémarrer)"
 *   6. Erreur                → "Erreur — Réessayer" (avec error tooltip)
 *
 * L'apparence respecte le design system Yumi (text uppercase tracking,
 * border radius standard). Override possible via className.
 */

interface Props {
    /** className additional pour customiser l'apparence sans casser la base. */
    className?: string;
    /** Si fournis, ces callbacks remplacent l'auto-state interne du bouton. */
    onUpdateAvailable?: (version: string) => void;
    onUpToDate?: () => void;
    onError?: (message: string) => void;
}

export function UpdateCheckButton({ className = '', onUpdateAvailable, onUpToDate, onError }: Props) {
    // enabled: false → désactive le check auto au mount ; on veut un check
    // explicite déclenché par le clic utilisateur.
    const { update, isChecking, checkNow, error } = useUpdater({ enabled: false });
    const [installState, setInstallState] = useState<'idle' | 'installing'>('idle');
    const [showUpToDate, setShowUpToDate] = useState(false);
    const [hasChecked, setHasChecked] = useState(false);

    // Surface l'état "à jour" 3 secondes après un check sans mise à jour.
    useEffect(() => {
        if (!hasChecked || isChecking || update) return;
        setShowUpToDate(true);
        const t = setTimeout(() => setShowUpToDate(false), 3000);
        return () => clearTimeout(t);
    }, [hasChecked, isChecking, update]);

    async function handleCheck() {
        await checkNow();
        setHasChecked(true);
        // Si callbacks externes fournis, les invoquer ; sinon laisser l'UI
        // interne réagir.
        if (onUpdateAvailable || onUpToDate || onError) {
            if (error)         onError?.(error);
            else if (update)   onUpdateAvailable?.(update.version);
            else               onUpToDate?.();
        }
    }

    async function handleInstall() {
        if (!update) return;
        setInstallState('installing');
        try {
            await update.install();
            // downloadAndInstall trigger un restart natif — si on revient ici
            // c'est que ça a échoué (ou que Tauri a abandonné silencieusement).
        } catch (e) {
            console.error('[UpdateCheckButton] install failed:', e);
            setInstallState('idle');
        }
    }

    const baseStyle: React.CSSProperties = {
        padding: '10px 18px',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        borderRadius: 10,
        border: '1px solid var(--lg-color-border, rgba(0,0,0,0.1))',
        background: 'var(--lg-color-bg, #1c1917)',
        color: 'var(--lg-color-fg, #fafaf9)',
        cursor: 'pointer',
        transition: 'opacity 150ms, transform 100ms',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
    };

    if (installState === 'installing') {
        return (
            <button type="button" disabled className={className} style={{ ...baseStyle, opacity: 0.6, cursor: 'wait' }}>
                Installation… L'app va redémarrer
            </button>
        );
    }

    if (update) {
        return (
            <button type="button" onClick={handleInstall} className={className} style={baseStyle}>
                v{update.version} disponible · Installer
            </button>
        );
    }

    if (isChecking) {
        return (
            <button type="button" disabled className={className} style={{ ...baseStyle, opacity: 0.6, cursor: 'wait' }}>
                Vérification…
            </button>
        );
    }

    if (showUpToDate) {
        return (
            <button type="button" disabled className={className} style={{ ...baseStyle, opacity: 0.8, cursor: 'default' }}>
                ✓ Vous êtes à jour
            </button>
        );
    }

    if (error && hasChecked) {
        return (
            <button type="button" onClick={handleCheck} className={className} style={baseStyle} title={error}>
                Erreur · Réessayer
            </button>
        );
    }

    return (
        <button type="button" onClick={handleCheck} className={className} style={baseStyle}>
            Vérifier les mises à jour
        </button>
    );
}
