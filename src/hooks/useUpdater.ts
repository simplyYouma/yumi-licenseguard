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

/** Compare deux versions SemVer numériques. true si `candidate` > `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
    const parse = (v: string) =>
        v.trim().replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
    const a = parse(candidate);
    const b = parse(current);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const diff = (a[i] ?? 0) - (b[i] ?? 0);
        if (diff !== 0) return diff > 0;
    }
    return false;
}

/** Manifeste renvoyé par le Hub (même format que tauri-plugin-updater). */
interface HubUpdateManifest {
    version: string;
    pub_date?: string;
    url: string;
    signature: string;
    notes?: string;
}

/**
 * Chemin Android : tauri-plugin-updater est desktop-only, le flux APK est
 * porté par le crate yumi-licenseguard (commandes get_updater_endpoint +
 * download_and_install_apk — téléchargement, vérif minisign, installeur
 * système). Même manifeste Hub, même bannière, même UX que desktop.
 */
async function checkAndroid(): Promise<AvailableUpdate | null> {
    const { invoke } = await import('@tauri-apps/api/core');
    const info = await invoke<{ endpoint: string; currentVersion: string }>(
        'get_updater_endpoint',
    );
    const res = await fetch(info.endpoint, { cache: 'no-store' });
    if (res.status !== 200) return null; // 204 = à jour, autre = pas de release
    const manifest = (await res.json()) as HubUpdateManifest;
    if (!manifest?.version || !manifest.url || !manifest.signature) return null;
    if (!isNewerVersion(manifest.version, info.currentVersion)) return null;
    return {
        version: manifest.version,
        notes: manifest.notes ?? null,
        date: manifest.pub_date ?? null,
        install: async () => {
            // Rust télécharge, vérifie la signature minisign et ouvre
            // l'installeur système — Android gère la confirmation.
            await invoke('download_and_install_apk', {
                url: manifest.url,
                signature: manifest.signature,
            });
        },
    };
}

export function useUpdater(opts: UseUpdaterOptions = {}): UseUpdaterResult {
    const { intervalMs = DEFAULT_INTERVAL, enabled = true } = opts;
    const [update, setUpdate] = useState<AvailableUpdate | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const checkNow = useCallback(async () => {
        // Hors Tauri (web preview / SSR) : on ne fait rien.
        if (!('__TAURI_INTERNALS__' in window)) return;

        // Android : flux APK natif porté par le crate yumi-licenseguard
        // (tauri-plugin-updater est desktop-only).
        if (/android/i.test(navigator.userAgent)) {
            setIsChecking(true);
            setError(null);
            try {
                setUpdate(await checkAndroid());
            } catch (e) {
                const msg = (e as Error)?.message ?? String(e);
                console.warn('[useUpdater] android check failed:', msg);
                setError(msg);
                setUpdate(null);
            } finally {
                setIsChecking(false);
            }
            return;
        }

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
