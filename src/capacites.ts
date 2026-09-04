/**
 * LES CAPACITÉS — ce que le Hub accorde à ce client, et que le POS lit.
 *
 * Le principe, valable pour toutes les options vendues : on déploie le MÊME
 * POS chez tout le monde, et **rien n'est actif par défaut**. Le Hub attribue
 * client par client, la vérification de licence transporte la liste, et cette
 * petite API la rend lisible par les écrans.
 *
 * DEUX PROPRIÉTÉS NON NÉGOCIABLES :
 *
 * 1. **La panne ne reprend jamais ce qui est payé.** La liste est écrite dans
 *    le stockage sûr à chaque vérification réussie. Hors ligne, au prochain
 *    démarrage, la dernière liste connue s'applique : une boutique ne perd
 *    pas son multi-postes parce que son internet est tombé.
 *
 * 2. **Un Hub muet ne coupe rien.** Si la réponse ne contient pas le champ
 *    (Hub ancien, réponse tronquée), on garde ce qu'on avait. Une option
 *    disparaît seulement quand le Hub dit explicitement qu'elle n'est plus là.
 */

/** Les options connues de la flotte — mêmes clés que le catalogue du Hub. */
export type Capacite =
    /** Plusieurs postes sur une seule base, par le Wi-Fi de la boutique. */
    | 'multi_poste'
    /** Consulter et piloter la boutique depuis n'importe où. */
    | 'pilotage_distance'
    /** Un site de vente en ligne AU NOM DU COMMERCE, dont le POS est le back-office. */
    | 'boutique_en_ligne'
    /**
     * Une place sur la PLATEFORME YUMI, la vitrine commune. Vendue à part du
     * site privé : deux options, deux prix, jamais fusionnées — un commerce
     * peut avoir l'une, l'autre ou les deux. La caisse publie et relève dès
     * que l'UNE des deux est là.
     */
    | 'plateforme_yumi';

const CLE = 'capabilities';

/** Cache mémoire : les écrans interrogent souvent, le stockage sûr est un IPC. */
let cache: string[] | null = null;

/**
 * Les capacités connues de ce poste. Toujours résolue — jamais d'exception,
 * jamais d'attente bloquante : au pire, une liste vide.
 */
export async function capacites(): Promise<string[]> {
    if (cache) return cache;
    if (!('__TAURI_INTERNALS__' in window)) return [];
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        const brut = await invoke<string>('get_secure_storage', { key: CLE });
        const v: unknown = JSON.parse(brut || '[]');
        cache = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        // Stockage vide, JSON abîmé, commande absente : aucune option, et
        // surtout AUCUNE erreur. Un défaut de lecture ne doit jamais
        // empêcher un commerçant d'ouvrir sa caisse.
        cache = [];
    }
    return cache;
}

/** Ce client a-t-il droit à cette option ? */
export async function aCapacite(c: Capacite): Promise<boolean> {
    return (await capacites()).includes(c);
}

/**
 * Vide le cache — appelé après une vérification de licence, pour que
 * l'attribution faite dans le Hub arrive sans redémarrer l'application.
 */
export function oublierCapacites(): void {
    cache = null;
}
