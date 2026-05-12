import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * Hook auto-updater — invoque tauri-plugin-updater au démarrage.
 *
 *   - Au mount : check une fois si une nouvelle version est dispo
 *   - Re-check toutes les `intervalMs` (défaut 6 h) pour les sessions longues
 *   - Web preview : pass-through silencieux (pas de Tauri dispo)
 *
 * Le hook ne déclenche PAS le download automatiquement — il expose l'objet
 * `update` (null si à jour, sinon `{ version, notes, install }`). C'est à
 * l'app de décider quand/comment proposer l'install (toast, modal, etc.).
 *
 * Si la version installée et le hub ne renvoie pas une version supérieure,
 * `update` reste `null` — comportement attendu (rien à faire).
 *
 * Erreurs réseau ou de signature : avalées silencieusement (log console)
 * pour ne JAMAIS bloquer le démarrage de l'app. Le check se re-lance au
 * tick suivant.
 */

interface AvailableUpdate {
    version: string;
    notes: string | null;
    date: string | null;
    /** Télécharge + installe l'update + redémarre l'app. */
    install: () => Promise<void>;
}

interface UseUpdaterOptions {
    /** Intervalle de re-check en millisecondes. Défaut : 6 h. */
    intervalMs?: number;
    /** Activer/désactiver. Défaut : true. */
    enabled?: boolean;
}

interface UseUpdaterResult {
    update: AvailableUpdate | null;
    isChecking: boolean;
    /** Force un check manuel (depuis un bouton "Vérifier les mises à jour"). */
    checkNow: () => Promise<void>;
    /** Dernière erreur (null si tout va bien). */
    error: string | null;
}

const DEFAULT_INTERVAL = 6 * 60 * 60 * 1000; // 6 h

export function useUpdater(opts: UseUpdaterOptions = {}): UseUpdaterResult {
    const { intervalMs = DEFAULT_INTERVAL, enabled = true } = opts;
    const [update, setUpdate] = useState<AvailableUpdate | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const checkNow = useCallback(async () => {
        // Hors Tauri (web preview / SSR) : on ne fait rien.
        if (!('__TAURI_INTERNALS__' in window)) return;

        setIsChecking(true);
        setError(null);
        try {
            // Import dynamique pour permettre aux projets qui n'ont pas encore
            // câblé le plugin de bundle sans erreur. Le plugin est requis côté
            // Rust ; côté JS l'import resté lazy permet aux migrations en
            // douceur (LG bumpé avant que tous les POS aient le plugin).
            const mod = await import('@tauri-apps/plugin-updater');
            const checkFn = mod.check;
            const result = await checkFn();
            if (!result) {
                setUpdate(null);
                return;
            }
            setUpdate({
                version: result.version,
                notes: result.body ?? null,
                date: result.date ?? null,
                install: async () => {
                    // Tauri downloadAndInstall télécharge le binaire, vérifie
                    // la signature avec la pubkey embarquée, et redémarre.
                    await result.downloadAndInstall();
                },
            });
        } catch (e) {
            // Updater pas configuré, pas d'internet, signature invalide :
            // on log mais on ne crashe pas l'app.
            const msg = (e as Error)?.message ?? String(e);
            console.warn('[useUpdater] check failed:', msg);
            setError(msg);
            setUpdate(null);
        } finally {
            setIsChecking(false);
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;

        const tick = async () => {
            if (cancelled) return;
            await checkNow();
            if (cancelled) return;
            timerRef.current = setTimeout(tick, intervalMs);
        };
        // Délai initial : 5 secondes après le mount pour laisser l'app
        // finir son boot (licence, splash, etc.) avant le hit réseau.
        timerRef.current = setTimeout(tick, 5000);

        return () => {
            cancelled = true;
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [enabled, intervalMs, checkNow]);

    return { update, isChecking, checkNow, error };
}
