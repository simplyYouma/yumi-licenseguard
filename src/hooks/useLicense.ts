import { useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { LicenseState, Notification } from '../types';
import { guardTheme } from '../theme';
import { oublierCapacites } from '../capacites';

// ============================================================
// CONFIGURATION HUB
// ============================================================
const YUMI_HUB_API = import.meta.env.VITE_YUMI_HUB_URL || "http://localhost:4000/api/verify";
const YUMI_PROJECT_ID = (import.meta.env.VITE_YUMI_PROJECT_ID || "").replace(/"/g, "");

// Bornes de sécurité pour les valeurs serveur — un Hub mal configuré ne doit
// jamais pouvoir geler tous les POS (5 min minimum) ni les laisser dériver
// pendant des semaines (24 h max).
const MIN_VERIFY_MS = 5 * 60 * 1000;
const MAX_VERIFY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_VERIFY_MS = 20 * 60 * 1000;
const MIN_GRACE_DAYS = 1;
const MAX_GRACE_DAYS = 365;

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

/**
 * Version courante de l'app (package/tauri.conf), remontée au Hub à chaque
 * verify pour afficher côté admin « quelle version chaque client possède » +
 * un badge à jour/obsolète. Mise en cache (elle ne change pas en cours de run).
 */
let cachedAppVersion: string | null = null;
async function getAppVersion(): Promise<string | null> {
    if (cachedAppVersion) return cachedAppVersion;
    try {
        const { getVersion } = await import('@tauri-apps/api/app');
        cachedAppVersion = await getVersion();
    } catch {
        cachedAppVersion = null;
    }
    return cachedAppVersion;
}

export function useLicense() {
    const [state, setState] = useState<LicenseState>({
        isLicensed: null,
        isRevoked: false,
        isExpired: false,
        isClockFraud: false,
        machineId: '',
        isSyncWarning: false,
        isSyncRequired: false,
        lastSyncDate: null,
        expiresAt: null,
    });

    const [activeNotif, setActiveNotif] = useState<Notification | null>(null);
    const [isValidating, setIsValidating] = useState(false);
    const [syncError, setSyncError] = useState(false);

    // Cadence + grace : seedés depuis le theme.ts (défauts), puis écrasés par
    // les valeurs renvoyées par le Hub à chaque verify. Stockés en ref pour
    // éviter de relancer l'effet d'init à chaque changement de valeur.
    const nextVerifyMsRef = useRef<number>(DEFAULT_VERIFY_MS);
    const graceMinsRef    = useRef<number>(guardTheme.config.syncLockMins);
    const warningMinsRef  = useRef<number>(guardTheme.config.syncWarningMins);

    // --- Actions ---

    /**
     * Centralized verification with Yumi Hub.
     * Source of truth: database via Hub.
     * 'ok'          → licence active confirmée par le Hub.
     * 'refused'     → le Hub a répondu mais la licence n'est pas valide
     *                 (le state reflète déjà la raison : banni, expiré…).
     * 'unreachable' → réseau/Hub injoignable (rien de fiable reçu).
     */
    const verifyWithHub = useCallback(async (hwid: string): Promise<'ok' | 'refused' | 'unreachable'> => {
        if (!YUMI_PROJECT_ID) return 'unreachable';

        try {
            // Timeout explicite : après un retour de connexion, un fetch sans
            // timeout peut rester suspendu indéfiniment dans la webview — seul
            // un reload le débloquait. 15 s puis on tranche "unreachable".
            const abort = new AbortController();
            const timeout = setTimeout(() => abort.abort(), 15000);
            let res: Response;
            try {
                res = await fetch(YUMI_HUB_API, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ hwid, project_id: YUMI_PROJECT_ID, app_version: await getAppVersion() }),
                    cache: 'no-store',
                    signal: abort.signal
                });
            } finally {
                clearTimeout(timeout);
            }

            if (res.ok) {
                const data = await res.json();
                const now = Date.now();
                await invoke('set_secure_storage', { key: 'last_sync', value: now.toString() });
                setState(prev => ({ ...prev, lastSyncDate: now }));

                // --- 1. NEGATIVE CHECKS (FAIL-CLOSED) ---
                // Le Hub a répondu : l'état de sync est frais, on lève le
                // verrou isSyncRequired pour laisser l'écran de la vraie
                // raison (banni/expiré…) prendre le relais.
                if (!data.valid) {
                    if (data.reason === "BANNED") {
                        setState(prev => ({ ...prev, isRevoked: true, isLicensed: false, isSyncRequired: false }));
                    } else if (data.reason === "EXPIRED") {
                        setState(prev => ({ ...prev, isExpired: true, isLicensed: false, isSyncRequired: false }));
                    } else if (data.reason === "NOT_FOUND") {
                        console.warn("[LicenseGuard] License not found on Hub. Performing remote wipe.");
                        await invoke('save_license_key', { key: '' });
                        window.location.reload();
                    } else {
                        setState(prev => ({ ...prev, isLicensed: false, isSyncRequired: false }));
                    }
                    return 'refused';
                }

                // --- 2. POSITIVE CHECKS ---
                setState(prev => ({
                    ...prev,
                    isRevoked: false,
                    isExpired: false,
                    isLicensed: true,
                    isSyncRequired: false,
                    isSyncWarning: false,
                    // Fin d'abonnement — source de vérité Hub (badge Réglages).
                    expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : prev.expiresAt,
                }));

                // --- Cadence pilotée par le Hub (depuis v2.3.0) ---
                // Si le Hub a tourné un patch et renvoie ces champs, on les
                // adopte (avec clamp sécurité). Sinon on garde les défauts.
                if (typeof data.nextVerifyMs === 'number') {
                    nextVerifyMsRef.current = clamp(data.nextVerifyMs, MIN_VERIFY_MS, MAX_VERIFY_MS);
                }
                if (typeof data.graceDays === 'number') {
                    graceMinsRef.current = clamp(data.graceDays, MIN_GRACE_DAYS, MAX_GRACE_DAYS) * 24 * 60;
                }
                if (typeof data.warningDays === 'number') {
                    warningMinsRef.current = clamp(data.warningDays, 0, MAX_GRACE_DAYS) * 24 * 60;
                }

                // --- CAPACITÉS accordées par le Hub (depuis v2.13.0) ---
                //
                // Ce que ce client a le droit d'utiliser : multi-postes,
                // boutique en ligne, pilotage à distance. Rien n'est actif
                // par défaut — on déploie le même POS chez tout le monde, et
                // l'option s'allume quand elle est vendue.
                //
                // Écrites dans le stockage sûr, PAS seulement en mémoire :
                // au prochain démarrage hors ligne, une boutique doit
                // retrouver l'option qu'elle a payée. Une panne de réseau ne
                // reprend jamais ce qui est dû.
                //
                // Un Hub ancien ne renvoie pas ce champ : on ne touche alors
                // à rien plutôt que d'effacer — une mise à jour du Hub ne
                // doit pas couper les options le temps de son déploiement.
                if (Array.isArray(data.capabilities)) {
                    const propres = data.capabilities.filter(
                        (c: unknown): c is string => typeof c === 'string',
                    );
                    await invoke('set_secure_storage', {
                        key: 'capabilities',
                        value: JSON.stringify(propres),
                    }).catch(() => { /* le stockage sûr peut manquer : sans blocage */ });
                    // Le cache mémoire doit oublier : une option accordée dans
                    // le Hub arrive ainsi sans redémarrer l'application.
                    oublierCapacites();
                }

                // --- Notifications Broadcast ---
                if (data.notifications && data.notifications.length > 0) {
                    const latest = data.notifications[0];
                    const dismissed = JSON.parse(localStorage.getItem('yumi_dismissed_notifs') || '[]');
                    if (!dismissed.includes(latest.id)) {
                        setActiveNotif(latest);
                    }
                } else {
                    setActiveNotif(null);
                }

                // --- Key Synchronization ---
                if (data.licenseKey) {
                    const localKey = await invoke<string>('get_license_key');
                    if (data.licenseKey !== localKey) {
                        await invoke('save_license_key', { key: data.licenseKey });
                        window.location.reload();
                    }
                }

                return 'ok';
            }
        } catch (e) {
            console.error("[LicenseGuard] Hub Unreachable:", e);
        }
        return 'unreachable';
    }, []);


    const dismissNotification = useCallback(() => {
        if (!activeNotif) return;
        const dismissed = JSON.parse(localStorage.getItem('yumi_dismissed_notifs') || '[]');
        dismissed.push(activeNotif.id);
        localStorage.setItem('yumi_dismissed_notifs', JSON.stringify(dismissed));
        setActiveNotif(null);
    }, [activeNotif]);

    /**
     * Manual Activation with Signature Verification.
     */
    const activateLicense = useCallback(async (key: string) => {
        setIsValidating(true);
        setSyncError(false);

        try {
            if (!key || key.trim().length < 10) return { success: false, message: "La clé est trop courte ou vide." };
            if (!YUMI_PROJECT_ID) return { success: false, message: "Configuration erronée : ID Projet manquant dans .env" };

            let sigToVerify = key.trim().split(' ').join('');
            let msgToVerify = state.machineId.trim().toUpperCase();

            console.log("[LicenseGuard] Tentative d'activation pour le projet:", YUMI_PROJECT_ID);
            const parts = sigToVerify.includes('.') ? sigToVerify.split('.') : [];
            if (parts.length === 2) {
                const expiry = parseInt(parts[0], 16);
                msgToVerify = `${YUMI_PROJECT_ID}|${msgToVerify}|${expiry}`;
                sigToVerify = parts[1];
            }

            // --- DUAL-PATH VERIFICATION (v2.5 + v1 Legacy) ---
            const hwid = state.machineId.trim().toUpperCase();

            let valid = await invoke('verify_license', { machineId: msgToVerify, licenseKey: sigToVerify });

            if (!valid && parts.length === 2) {
                const legacyMsg = `${hwid}|${parseInt(parts[0], 16)}`;
                valid = await invoke('verify_license', { machineId: legacyMsg, licenseKey: parts[1] });
            }

            if (valid) {
                await invoke('save_license_key', { key: key.trim() });
                window.location.reload();
                return { success: true };
            }
            return { success: false, message: "Signature cryptographique invalide pour ce PC/Projet." };
        } catch (e: any) {
            console.error("[LicenseGuard] Error:", e);
            return { success: false, message: `Erreur système : ${e.toString()}` };
        } finally {
            setIsValidating(false);
        }
    }, [state.machineId]);

    // --- LifeCycle ---

    useEffect(() => {
        const init = async () => {
            // -- 1. Web Preview Check --
            if (!('__TAURI_INTERNALS__' in window)) {
                console.warn("[LicenseGuard] Web Mode: Pass-through activated.");
                setState(prev => ({ ...prev, isLicensed: true }));
                return;
            }

            try {
                // 1. Hardware ID
                const rawHwid: string = await invoke('get_machine_id');
                const hwid = rawHwid.trim().toUpperCase();
                setState(prev => ({ ...prev, machineId: hwid }));

                // 2. Existing License
                const savedLicense = await invoke<string>('get_license_key');
                if (!savedLicense) {
                    setState(prev => ({ ...prev, isLicensed: false }));
                    return;
                }

                // 3. Time Checks (stockage sécurisé Tauri, non modifiable par l'utilisateur)
                const now = Date.now();
                const lastSync = Number(await invoke<string>('get_secure_storage', { key: 'last_sync' }) || '0');
                const lastSeen = Number(await invoke<string>('get_secure_storage', { key: 'last_seen' }) || '0');
                await invoke('set_secure_storage', { key: 'last_seen', value: now.toString() });

                // Clock Fraud Detection
                if (now < lastSeen - 300000) {
                    setState(prev => ({ ...prev, isClockFraud: true, isLicensed: false }));
                    return;
                }

                // Sync Requirement — utilise les valeurs Hub si déjà reçues
                // (verify précédent), sinon les défauts du theme.
                const minsSinceSync = (now - lastSync) / (1000 * 60);
                if (lastSync > 0 && minsSinceSync > graceMinsRef.current) {
                    setState(prev => ({ ...prev, isSyncRequired: true, isLicensed: false }));
                    return;
                }

                if (lastSync > 0 && minsSinceSync > warningMinsRef.current) {
                    setState(prev => ({ ...prev, isSyncWarning: true }));
                }

                // 4. Crypto Verification
                const parts = savedLicense.split('.');
                let msgToVerify = hwid;
                let sigToVerify = savedLicense;

                if (parts.length === 2) {
                    const expiry = parseInt(parts[0], 16);
                    // Fin d'abonnement dérivée de la clé locale — disponible
                    // hors-ligne, écrasée par la valeur Hub au premier verify.
                    if (Number.isFinite(expiry) && expiry > 0) {
                        setState(prev => ({ ...prev, expiresAt: new Date(expiry).toISOString() }));
                    }
                    if (now > expiry) {
                        // La clé LOCALE paraît expirée — mais l'admin a peut-être
                        // renouvelé côté Hub (la BDD est la source de vérité, et la
                        // clé locale garde l'ancienne date tant que le Hub ne renvoie
                        // pas de clé fraîche). On interroge donc le Hub D'ABORD, en
                        // restant sur l'écran de chargement (isLicensed reste null),
                        // et on n'affiche l'écran "Expirée" que si le Hub confirme
                        // l'expiration OU est injoignable. Évite le flash orange à
                        // chaque démarrage après un renouvellement.
                        setIsValidating(true);
                        const ok = (await verifyWithHub(hwid)) === 'ok';
                        setIsValidating(false);
                        if (!ok) {
                            // Hub a confirmé l'expiration / révocation (déjà reflété
                            // dans le state) ou est injoignable → bloquer en mode
                            // expiré, hors-ligne sur une clé périmée.
                            setState(prev => prev.isLicensed === false
                                ? prev
                                : { ...prev, isExpired: true, isLicensed: false });
                        }
                        return; // Le Hub gère le chemin licencié/renouvelé (et le reload éventuel)
                    }
                    msgToVerify = `${YUMI_PROJECT_ID}|${hwid}|${expiry}`;
                    sigToVerify = parts[1];
                }

                // --- DUAL-PATH BOOT CHECK ---
                let valid = await invoke('verify_license', { machineId: msgToVerify, licenseKey: sigToVerify });

                if (!valid && parts.length === 2) {
                    const legacyMsg = `${hwid}|${parseInt(parts[0], 16)}`;
                    valid = await invoke('verify_license', { machineId: legacyMsg, licenseKey: parts[1] });
                }

                if (valid) {
                    // Accès optimiste basé sur la crypto locale
                    setState(prev => ({ ...prev, isLicensed: true }));

                    // Vérification Hub obligatoire — la BDD est la source de vérité
                    await verifyWithHub(hwid);

                    // Cycles de vérification périodique. Cadence pilotée par
                    // le Hub via `nextVerifyMsRef` (renseigné par verifyWithHub).
                    // setTimeout récursif au lieu de setInterval pour que chaque
                    // tick lise la valeur la plus récente — un changement côté
                    // admin prend effet dès le verify suivant.
                    let timer: ReturnType<typeof setTimeout> | null = null;
                    let cancelled = false;
                    const schedule = () => {
                        if (cancelled) return;
                        timer = setTimeout(async () => {
                            await verifyWithHub(hwid);
                            schedule();
                        }, nextVerifyMsRef.current);
                    };
                    schedule();
                    return () => {
                        cancelled = true;
                        if (timer) clearTimeout(timer);
                    };
                } else {
                    setState(prev => ({ ...prev, isLicensed: false }));
                }
            } catch (e) {
                console.error("[LicenseGuard] Critical Init Error:", e);
                setState(prev => ({ ...prev, isLicensed: false }));
            }
        };

        const cleanupPromise = init();
        return () => { cleanupPromise.then(cb => cb && cb()); };
    }, [verifyWithHub]);

    return {
        ...state,
        activeNotif,
        isValidating,
        syncError,
        setSyncError,
        verifyWithHub: () => verifyWithHub(state.machineId),
        activateLicense,
        dismissNotification
    };
}
