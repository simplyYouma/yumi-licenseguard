/**
 * LE SIGNALEMENT D'INSTALLATION — dire au Hub qu'une machine fait tourner
 * l'application sans clé.
 *
 * ═══ LE TROU QUE ÇA BOUCHE ═══
 *
 * Jusqu'ici, `useLicense` lisait le stockage local, n'y trouvait pas de clé,
 * affichait l'écran d'activation, et s'arrêtait là. AUCUN APPEL RÉSEAU. Une
 * machine qui installe l'application et n'active jamais rien était donc
 * parfaitement invisible : le Hub n'apprenait l'existence d'une installation
 * qu'au moment où elle devenait payante.
 *
 * ═══ TROIS RÈGLES QUI PASSENT AVANT TOUT LE RESTE ═══
 *
 * 1. **UN POSTE RATTACHÉ N'EST JAMAIS SIGNALÉ.** Une boutique paie UN
 *    abonnement, pas une licence par appareil : la deuxième caisse, la
 *    tablette des rayons, le PC du patron n'ont pas de clé et n'en auront
 *    jamais. Ce sont des machines parfaitement légitimes, et les faire
 *    apparaître dans une liste d'infractions serait la meilleure façon de
 *    bloquer un jour la caisse d'un client qui a payé.
 *
 * 2. **RIEN NE DOIT RETARDER LE DÉMARRAGE.** Hors ligne, Hub injoignable,
 *    réponse lente : l'écran d'activation s'affiche exactement comme avant.
 *    Aucun `await` sur le chemin de rendu, aucune exception qui remonte. Une
 *    machine sans réseau n'est pas une infraction — au Mali, c'est une
 *    machine ordinaire un jour de coupure.
 *
 * 3. **UNE FOIS PAR 24 H AU PLUS.** Une caisse s'ouvre et se ferme trente
 *    fois par jour. Trente lignes pour une machine rendraient le compteur de
 *    la page d'administration illisible, et la page avec.
 *
 * ═══ CE QU'ON ENVOIE, ET LA LIGNE QU'ON NE FRANCHIT PAS ═══
 *
 * L'identifiant machine, l'identifiant d'application, la version, la
 * plateforme, l'horodatage. RIEN D'AUTRE — ni contenu, ni donnée commerciale,
 * ni contact, ni nom de commerce. Le Hub ne détient pas le commerce de ses
 * clients, et cette règle vaut a fortiori pour des machines dont on ne sait
 * même pas si elles appartiennent à un client.
 *
 * Si vous vous apprêtez à ajouter un champ ici, demandez-vous ce qu'il permet
 * de reconstituer sur la vie de quelqu'un d'autre. La réponse doit être : rien.
 */

/** Ce que le Hub renvoie — un message à afficher, et/ou un écran fermé. */
export interface AvisInstallation {
    /** Texte courtois à montrer sur l'écran d'activation. `null` = rien à dire. */
    message: string | null;
    /** Vrai = le champ de clé disparaît au profit de la mise en garde. */
    bloquee: boolean;
}

/** L'horodatage du dernier signalement, dans le stockage sûr de Tauri. */
const CLE_DERNIER_SIGNAL = 'dernier_signalement';

/** Le pas minimum entre deux signalements de la même machine. */
export const PERIODE_SIGNALEMENT_MS = 24 * 60 * 60 * 1000;

/** Au-delà, ce n'est plus un message d'accueil : on tronque à l'affichage. */
const MAX_MESSAGE = 1200;

/**
 * ═══ CETTE MACHINE EST-ELLE RATTACHÉE À UNE CAISSE ? ═══
 *
 * Fonction PURE, éprouvée sans navigateur : c'est la garde la plus importante
 * de tout ce fichier, et celle dont l'erreur serait la plus coûteuse.
 *
 * Deux sources, et il suffit d'UNE SEULE pour se taire :
 *
 *  · `appaire` — ce que l'application hôte déclare à `<LicenseGuard>`. Elle
 *    seule connaît son serveur de boutique et son état d'appairage réel.
 *
 *  · `yumi.mode === 'client'` — ce que le transport a écrit en dur au moment
 *    de l'appairage (voir l'en-tête de `src/lib/transport.ts` dans chaque POS).
 *
 * Pourquoi les deux ? Parce qu'elles peuvent diverger un instant, et que la
 * divergence n'est jamais du même côté. Une application qui n'a pas encore
 * calculé son `appaire` au premier rendu passerait pour une machine sauvage ;
 * un `yumi.mode` effacé par un nettoyage de stockage aussi. Chacune rattrape
 * l'autre, et on ne signale que si les DEUX disent « machine seule ».
 *
 * ⚠️ EN CAS DE DOUTE, ON SE TAIT. Ne pas signaler une vraie infraction coûte
 * une ligne manquante dans un écran d'administration. Signaler un poste
 * légitime peut finir par fermer la caisse d'un client. Les deux erreurs ne
 * se valent pas, et cette fonction penche délibérément d'un côté.
 */
export function estRattache(
    appaire: boolean,
    lire: (cle: string) => string | null,
): boolean {
    if (appaire) return true;
    try {
        if (lire('yumi.mode') === 'client') return true;
        // Un poste appairé qui aurait perdu son `yumi.mode` garde ses
        // coordonnées de serveur : elles suffisent à le reconnaître.
        if (lire('yumi.serveur') && lire('yumi.jeton')) return true;
        // Et un poste qui ne joint sa caisse que par le relais à distance
        // n'a pas d'adresse locale, mais bien un relais.
        if (lire('yumi.relais.boutique') && lire('yumi.jeton')) return true;
    } catch {
        // `localStorage` refusé (mode privé, stockage plein) : on ne sait pas,
        // donc on ne signale pas.
        return true;
    }
    return false;
}

/**
 * A-t-on le droit de signaler maintenant ?
 *
 * Fonction PURE. Une date future dans le stockage (horloge reculée depuis)
 * NE BLOQUE PAS éternellement : on la traite comme « jamais signalé ». Sinon
 * il suffirait d'avancer l'horloge d'un an une fois pour se taire pour de bon.
 */
export function doitSignaler(dernier: number | null, maintenant: number): boolean {
    if (dernier === null || !Number.isFinite(dernier) || dernier <= 0) return true;
    if (dernier > maintenant) return true;
    return maintenant - dernier >= PERIODE_SIGNALEMENT_MS;
}

/**
 * Lire la réponse du Hub sans jamais lui faire confiance.
 *
 * Fonction PURE. Un Hub ancien, une réponse tronquée, un proxy qui renvoie du
 * HTML : tout cela doit donner « rien à dire », pas une exception ni un écran
 * fermé par accident. **On ne bloque que sur un `bloquee === true` explicite.**
 */
export function lireAvis(donnees: unknown): AvisInstallation | null {
    if (!donnees || typeof donnees !== 'object' || Array.isArray(donnees)) return null;
    const d = donnees as Record<string, unknown>;
    const message = typeof d.message === 'string' && d.message.trim()
        ? d.message.trim().slice(0, MAX_MESSAGE)
        : null;
    const bloquee = d.bloquee === true;
    if (!message && !bloquee) return null;
    return { message, bloquee };
}

/**
 * La plateforme, lue dans l'agent utilisateur de la webview.
 *
 * Fonction PURE. On ne passe PAS par `@tauri-apps/plugin-os` : ce plugin n'est
 * pas installé dans les cinq POS, et en faire une dépendance de la garde
 * partagée obligerait à toucher cinq dépôts pour un détail de diagnostic.
 *
 * Vocabulaire aligné sur celui des releases (`android`, `windows`, `darwin`…)
 * pour qu'on lise la même chose des deux côtés du Hub.
 */
export function plateformeDepuisAgent(agent: string): string | null {
    const a = agent.toLowerCase();
    if (a.includes('android')) return 'android';
    if (/iphone|ipad|ipod/.test(a)) return 'ios';
    if (a.includes('windows')) return 'windows';
    if (a.includes('mac os') || a.includes('macintosh')) return 'darwin';
    if (a.includes('linux')) return 'linux';
    return null;
}

/** Jamais bloquant, jamais fatal : au pire, on ne sait pas. */
function plateforme(agent?: string): string | null {
    try {
        return plateformeDepuisAgent(agent ?? navigator.userAgent ?? '');
    } catch {
        return null;
    }
}

export interface OptionsSignalement {
    hwid: string;
    projectId: string;
    urlSignal: string;
    appVersion: string | null;
    /** L'application déclare que ce poste travaille sur une autre caisse. */
    appaire: boolean;
    /** Injectables pour les tests — par défaut, le vrai stockage sûr de Tauri. */
    lireStockage?: (cle: string) => Promise<string | null>;
    ecrireStockage?: (cle: string, valeur: string) => Promise<void>;
    lireLocal?: (cle: string) => string | null;
    maintenant?: number;
    fetchImpl?: typeof fetch;
    /** Agent utilisateur — injecté par les tests, sinon celui de la webview. */
    agent?: string;
}

/**
 * Signaler cette installation, ou ne rien faire du tout.
 *
 * NE LÈVE JAMAIS. Rend l'avis du Hub, ou `null` — ce qui est le cas de très
 * loin le plus fréquent : machine rattachée, déjà signalée aujourd'hui, hors
 * ligne, ou tout simplement rien à dire.
 *
 * ⚠️ À APPELER SANS `await` sur le chemin de rendu. L'écran d'activation doit
 * s'afficher avant que cette fonction ait fini, pas après.
 */
export async function signalerInstallation(o: OptionsSignalement): Promise<AvisInstallation | null> {
    try {
        // ── 1. La garde qui compte : un poste rattaché ne dit RIEN ──────────
        const lireLocal = o.lireLocal ?? ((c: string) => localStorage.getItem(c));
        if (estRattache(o.appaire, lireLocal)) return null;

        // Sans identifiants, il n'y a rien à signaler d'utile — et surtout rien
        // à mettre en face d'une décision d'administration.
        if (!o.hwid || !o.projectId || !o.urlSignal) return null;

        // ── 2. Une fois par 24 h ────────────────────────────────────────────
        const maintenant = o.maintenant ?? Date.now();
        const lireStockage = o.lireStockage ?? (async (cle: string) => {
            const { invoke } = await import('@tauri-apps/api/core');
            return invoke<string>('get_secure_storage', { key: cle });
        });
        const ecrireStockage = o.ecrireStockage ?? (async (cle: string, valeur: string) => {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('set_secure_storage', { key: cle, value: valeur });
        });

        const brut = await lireStockage(CLE_DERNIER_SIGNAL).catch(() => null);
        const dernier = brut ? Number(brut) : null;
        if (!doitSignaler(dernier, maintenant)) return null;

        // ── 3. L'appel, avec un délai maximum ───────────────────────────────
        //
        // Le même timeout que la vérification de licence, et pour la même
        // raison : après un retour de connexion, un fetch sans limite peut
        // rester suspendu indéfiniment dans la webview.
        const fetchFn = o.fetchImpl ?? fetch;
        const abort = new AbortController();
        const minuterie = setTimeout(() => abort.abort(), 15000);
        let reponse: Response;
        try {
            reponse = await fetchFn(o.urlSignal, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // ⚠️ CES CINQ CHAMPS ET RIEN D'AUTRE.
                body: JSON.stringify({
                    hwid: o.hwid,
                    project_id: o.projectId,
                    version: o.appVersion,
                    plateforme: plateforme(o.agent),
                    horodatage: new Date(maintenant).toISOString(),
                }),
                cache: 'no-store',
                signal: abort.signal,
            });
        } finally {
            clearTimeout(minuterie);
        }

        // ═══ ON N'INSCRIT L'HORODATAGE QUE SI LE HUB A RÉPONDU ═══
        //
        // L'écrire avant l'appel aurait fait taire pendant 24 h une machine
        // dont le signalement a échoué — et une boutique hors ligne trois
        // jours d'affilée ne se serait jamais signalée du tout.
        if (!reponse.ok) return null;
        await ecrireStockage(CLE_DERNIER_SIGNAL, String(maintenant)).catch(() => {
            /* stockage indisponible : on resignalera demain, sans gravité */
        });

        return lireAvis(await reponse.json());
    } catch {
        // Hors ligne, DNS mort, JSON abîmé, commande Tauri absente : RIEN.
        // Ce chemin est le plus fréquent des trois quarts de l'année sur un
        // réseau malien, et il ne doit produire aucun effet visible.
        return null;
    }
}
