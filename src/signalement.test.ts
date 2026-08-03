import { describe, expect, it } from 'vitest';
import {
    PERIODE_SIGNALEMENT_MS, doitSignaler, estRattache, lireAvis,
    plateformeDepuisAgent, signalerInstallation,
} from './signalement';

/**
 * LE SIGNALEMENT D'INSTALLATION — ce qu'on éprouve, et pourquoi.
 *
 * Ce fichier est le seul endroit du dépôt où une décision peut FERMER l'écran
 * de quelqu'un. Trois propriétés valent tous les autres tests réunis :
 *
 *   1. UN POSTE RATTACHÉ N'EST JAMAIS SIGNALÉ. C'est la promesse faite à
 *      chaque boutique qui paie un abonnement plutôt qu'une licence par
 *      appareil. La trahir, c'est faire apparaître la tablette d'un client
 *      dans une liste d'infractions — et la bloquer un jour de zèle.
 *
 *   2. UN HUB INJOIGNABLE NE CHANGE RIEN. Au Mali, la coupure est la règle
 *      plusieurs jours par mois. Une machine sans réseau n'est pas une
 *      infraction, et son écran doit s'afficher comme il l'a toujours fait.
 *
 *   3. UNE FOIS PAR 24 H. Une caisse s'ouvre trente fois par jour.
 */

const JOUR = PERIODE_SIGNALEMENT_MS;
const MAINTENANT = Date.UTC(2026, 7, 3, 9, 0, 0);

/** Un `localStorage` de papier, alimenté par le scénario. */
const stockageLocal = (valeurs: Record<string, string>) =>
    (cle: string) => valeurs[cle] ?? null;

// ─────────────────────────────────────────────────────────────────────────

describe('estRattache — LA GARDE QUI COMPTE', () => {
    it('un poste déclaré appairé par son application est rattaché', () => {
        expect(estRattache(true, stockageLocal({}))).toBe(true);
    });

    it("yumi.mode === 'client' suffit, même si l'application n'a rien dit", () => {
        // Le cas réel : l'application n'a pas encore calculé son `appaire` au
        // premier rendu. Sans cette seconde source, la tablette d'un client
        // partirait se dénoncer pendant sa fenêtre d'initialisation.
        expect(estRattache(false, stockageLocal({ 'yumi.mode': 'client' }))).toBe(true);
    });

    it('un poste qui a perdu son yumi.mode mais garde ses coordonnées est rattaché', () => {
        expect(estRattache(false, stockageLocal({
            'yumi.serveur': 'http://192.168.1.20:7788',
            'yumi.jeton': 'abcdef',
        }))).toBe(true);
    });

    it('un poste qui ne joint sa caisse que par le relais est rattaché', () => {
        // Il n'a pas d'adresse locale — il travaille depuis chez le patron.
        expect(estRattache(false, stockageLocal({
            'yumi.relais.boutique': 'b0utik',
            'yumi.jeton': 'abcdef',
        }))).toBe(true);
    });

    it('EN CAS DE DOUTE ON SE TAIT : un stockage qui refuse de répondre vaut rattaché', () => {
        // Ne pas signaler une vraie infraction coûte une ligne manquante dans
        // un écran d'administration. Signaler un poste légitime peut fermer la
        // caisse d'un client. Les deux erreurs ne se valent pas.
        const explose = () => { throw new Error('localStorage refusé'); };
        expect(estRattache(false, explose)).toBe(true);
    });

    it("une machine SEULE, elle, n'est pas rattachée", () => {
        expect(estRattache(false, stockageLocal({}))).toBe(false);
        expect(estRattache(false, stockageLocal({ 'yumi.mode': 'solo' }))).toBe(false);
        // Une caisse principale est en mode serveur : elle a SA propre clé,
        // et si elle n'en a pas, c'est bien une installation sans licence.
        expect(estRattache(false, stockageLocal({ 'yumi.mode': 'serveur' }))).toBe(false);
        // Un jeton seul, sans serveur ni relais, ne prouve aucun appairage.
        expect(estRattache(false, stockageLocal({ 'yumi.jeton': 'abcdef' }))).toBe(false);
    });
});

describe('doitSignaler — une fois par 24 h, pas trente fois par jour', () => {
    it('signale si on ne l’a jamais fait', () => {
        expect(doitSignaler(null, MAINTENANT)).toBe(true);
        expect(doitSignaler(0, MAINTENANT)).toBe(true);
        expect(doitSignaler(Number.NaN, MAINTENANT)).toBe(true);
    });

    it('SE TAIT dans les 24 h qui suivent', () => {
        expect(doitSignaler(MAINTENANT - 1000, MAINTENANT)).toBe(false);
        expect(doitSignaler(MAINTENANT - JOUR + 1, MAINTENANT)).toBe(false);
    });

    it('reparle une fois les 24 h écoulées', () => {
        expect(doitSignaler(MAINTENANT - JOUR, MAINTENANT)).toBe(true);
        expect(doitSignaler(MAINTENANT - 30 * JOUR, MAINTENANT)).toBe(true);
    });

    it("UNE HORLOGE AVANCÉE PUIS REMISE NE FAIT PAS TAIRE POUR TOUJOURS", () => {
        // Sinon il suffirait d'avancer la date d'un an une seule fois pour ne
        // plus jamais rien signaler.
        expect(doitSignaler(MAINTENANT + 365 * JOUR, MAINTENANT)).toBe(true);
    });
});

describe('lireAvis — ne jamais faire confiance à la réponse', () => {
    it('rend null sur tout ce qui ne ressemble pas à un avis', () => {
        for (const v of [null, undefined, 42, 'texte', [], {}, { message: '   ' }]) {
            expect(lireAvis(v), JSON.stringify(v)).toBeNull();
        }
    });

    it('ON NE BLOQUE QUE SUR UN `bloquee === true` EXPLICITE', () => {
        // Un Hub ancien, un proxy bavard, une réponse tronquée : rien de tout
        // cela ne doit fermer l'écran de quelqu'un par accident.
        expect(lireAvis({ message: 'Bonjour', bloquee: 'oui' })!.bloquee).toBe(false);
        expect(lireAvis({ message: 'Bonjour', bloquee: 1 })!.bloquee).toBe(false);
        expect(lireAvis({ message: 'Bonjour', bloquee: true })!.bloquee).toBe(true);
    });

    it('un blocage sans texte reste un blocage', () => {
        expect(lireAvis({ bloquee: true })).toEqual({ message: null, bloquee: true });
    });

    it('tronque un message démesuré au lieu de le refuser', () => {
        expect(lireAvis({ message: 'x'.repeat(9000) })!.message!.length).toBe(1200);
    });
});

describe('plateformeDepuisAgent', () => {
    it('reconnaît les plateformes de la flotte', () => {
        expect(plateformeDepuisAgent('Mozilla/5.0 (Linux; Android 13; SM-T500)')).toBe('android');
        expect(plateformeDepuisAgent('Mozilla/5.0 (Windows NT 10.0; Win64)')).toBe('windows');
        expect(plateformeDepuisAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe('darwin');
        expect(plateformeDepuisAgent('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
        expect(plateformeDepuisAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('ios');
        expect(plateformeDepuisAgent('')).toBeNull();
    });

    it("une tablette Android n'est pas prise pour un PC Linux", () => {
        // L'agent Android contient « Linux » : l'ordre des tests compte, et
        // s'y tromper rangerait toutes nos tablettes du côté des PC.
        expect(plateformeDepuisAgent('Mozilla/5.0 (Linux; Android 13)')).toBe('android');
    });
});

// ─────────────────────────────────────────────────────────────────────────
// Le parcours complet, sans Tauri ni réseau.
// ─────────────────────────────────────────────────────────────────────────

function bancDEssai(sur: {
    appaire?: boolean;
    local?: Record<string, string>;
    dernier?: string | null;
    reponse?: () => Promise<Response>;
} = {}) {
    const appels: string[] = [];
    const ecrits: Record<string, string> = {};
    const options = {
        hwid: 'ABC123',
        projectId: 'projet-1',
        urlSignal: 'https://hub.test/api/installations/signal',
        appVersion: '2.17.0',
        appaire: sur.appaire ?? false,
        agent: 'Mozilla/5.0 (Windows NT 10.0; Win64)',
        maintenant: MAINTENANT,
        lireLocal: stockageLocal(sur.local ?? {}),
        lireStockage: async () => sur.dernier ?? null,
        ecrireStockage: async (cle: string, valeur: string) => { ecrits[cle] = valeur; },
        fetchImpl: (async (url: string | URL | Request) => {
            appels.push(String(url));
            return sur.reponse
                ? await sur.reponse()
                : new Response(JSON.stringify({ etat: 'nouvelle', bloquee: false, message: null }), {
                    status: 200, headers: { 'Content-Type': 'application/json' },
                });
        }) as unknown as typeof fetch,
    };
    return { options, appels, ecrits };
}

describe('signalerInstallation — le parcours complet', () => {
    it('UN POSTE RATTACHÉ N’OUVRE MÊME PAS UNE SOCKET', async () => {
        // La garde est posée AVANT le réseau : rien ne part, donc rien ne peut
        // être enregistré par erreur côté Hub. C'est le test le plus important
        // de tout ce dépôt.
        const cas: Record<string, string>[] = [
            { 'yumi.mode': 'client' },
            { 'yumi.serveur': 'http://x', 'yumi.jeton': 'j' },
        ];
        for (const local of cas) {
            const banc = bancDEssai({ local });
            expect(await signalerInstallation(banc.options)).toBeNull();
            expect(banc.appels).toEqual([]);
        }
        const parProp = bancDEssai({ appaire: true });
        expect(await signalerInstallation(parProp.options)).toBeNull();
        expect(parProp.appels).toEqual([]);
    });

    it('une machine seule se signale, et une seule fois par 24 h', async () => {
        const premier = bancDEssai({ dernier: null });
        await signalerInstallation(premier.options);
        expect(premier.appels).toHaveLength(1);
        expect(premier.ecrits.dernier_signalement).toBe(String(MAINTENANT));

        const suivant = bancDEssai({ dernier: String(MAINTENANT - 3600_000) });
        await signalerInstallation(suivant.options);
        expect(suivant.appels).toEqual([]);

        const lendemain = bancDEssai({ dernier: String(MAINTENANT - JOUR) });
        await signalerInstallation(lendemain.options);
        expect(lendemain.appels).toHaveLength(1);
    });

    it('LE HUB INJOIGNABLE NE CASSE RIEN — et ne fait pas taire pour 24 h', async () => {
        // Une boutique hors ligne trois jours d'affilée doit finir par se
        // signaler. Inscrire l'horodatage avant l'appel l'aurait rendue muette.
        const banc = bancDEssai({
            reponse: () => Promise.reject(new Error('Failed to fetch')),
        });
        expect(await signalerInstallation(banc.options)).toBeNull();
        expect(banc.ecrits.dernier_signalement).toBeUndefined();
    });

    it('une réponse en erreur ne bloque personne et ne consomme pas la journée', async () => {
        const banc = bancDEssai({
            reponse: async () => new Response('erreur interne', { status: 500 }),
        });
        expect(await signalerInstallation(banc.options)).toBeNull();
        expect(banc.ecrits.dernier_signalement).toBeUndefined();
    });

    it('une réponse illisible ne lève pas', async () => {
        const banc = bancDEssai({
            reponse: async () => new Response('<html>proxy</html>', { status: 200 }),
        });
        expect(await signalerInstallation(banc.options)).toBeNull();
    });

    it('un avis du Hub remonte tel quel', async () => {
        const banc = bancDEssai({
            reponse: async () => new Response(
                JSON.stringify({ etat: 'bloquee', bloquee: true, message: 'Contactez-nous.' }),
                { status: 200 },
            ),
        });
        expect(await signalerInstallation(banc.options))
            .toEqual({ message: 'Contactez-nous.', bloquee: true });
    });

    it('ON N’ENVOIE QUE CINQ CHAMPS — rien du commerce de personne', async () => {
        let corps: Record<string, unknown> = {};
        const banc = bancDEssai({});
        banc.options.fetchImpl = (async (_url: unknown, init: RequestInit) => {
            corps = JSON.parse(String(init.body));
            return new Response('{}', { status: 200 });
        }) as unknown as typeof fetch;
        await signalerInstallation(banc.options);
        expect(Object.keys(corps).sort())
            .toEqual(['horodatage', 'hwid', 'plateforme', 'project_id', 'version']);
        expect(corps.plateforme).toBe('windows');
    });

    it('sans identifiant machine ou sans projet, on ne dit rien', async () => {
        const sansHwid = bancDEssai({});
        sansHwid.options.hwid = '';
        await signalerInstallation(sansHwid.options);
        expect(sansHwid.appels).toEqual([]);

        const sansProjet = bancDEssai({});
        sansProjet.options.projectId = '';
        await signalerInstallation(sansProjet.options);
        expect(sansProjet.appels).toEqual([]);
    });
});
