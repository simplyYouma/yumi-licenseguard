import { useState, type ReactNode } from 'react';
import { Copy, Check, AlertTriangle, ShieldCheck, Loader2, Info } from 'lucide-react';
import type { AvisInstallation } from '../signalement';

interface Props {
    machineId: string;
    onActivate: (key: string) => Promise<{ success: boolean; message?: string }>;
    isValidating: boolean;
    /**
     * ═══ REJOINDRE UNE CAISSE EXISTANTE ═══
     *
     * Toutes les machines n'ont pas de clé, et c'est voulu : une boutique
     * paie UN abonnement, pas une licence par appareil. La deuxième caisse,
     * la tablette des rayons, le PC du patron chez lui — aucun n'a de clé.
     * Ils rejoignent la caisse principale.
     *
     * Ce chemin est proposé ICI parce que c'est le seul écran qu'on voit
     * après avoir installé l'application. Sans lui, un appareil sans clé
     * serait bloqué à la porte, et tout le modèle tomberait.
     *
     * Mais il reste DISCRET : neuf installations sur dix sont une caisse
     * principale, qui a bien une clé. On ne met pas les deux chemins sur le
     * même plan — on garde l'écran tel quel et on ajoute une sortie en bas.
     *
     * Le contenu vient de l'application, pas d'ici : c'est elle qui sait
     * s'appairer (adresse, code à six chiffres, scanner si l'appareil a une
     * caméra). LicenseGuard ne connaît que les licences.
     */
    rejoindre?: ReactNode;
    /**
     * ═══ CE QUE L'ÉDITEUR A ÉCRIT À CETTE MACHINE ═══
     *
     * Une installation sans licence se signale au Hub (voir `signalement.ts`).
     * Si Youma a répondu quelque chose, c'est ici que ça s'affiche — au-dessus
     * du champ de clé quand c'est un simple message, à la PLACE du champ quand
     * l'installation est bloquée.
     *
     * `null` dans l'écrasante majorité des cas, et l'écran est alors
     * rigoureusement identique à ce qu'il a toujours été.
     */
    avis?: AvisInstallation | null;
}

export const ActivationScreen = ({ machineId, onActivate, isValidating, rejoindre, avis }: Props) => {
    const [key, setKey] = useState('');
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(machineId);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch { /* clipboard unavailable */ }
    };

    const handleSubmit = async () => {
        setError('');
        const result = await onActivate(key);
        if (!result.success) setError(result.message || 'Erreur de validation.');
    };

    // Une installation bloquée ne saisit plus de clé : le champ n'aurait servi
    // qu'à faire essayer des clés au hasard. La mise en garde prend sa place.
    const bloquee = avis?.bloquee === true;

    return (
        <div className="lg-page lg-state-activate">
            <div className="lg-card">
                <div className="lg-hero">
                    <div className="lg-hero-icon">
                        <ShieldCheck />
                    </div>
                </div>

                <div className="lg-body">
                    <p className="lg-eyebrow">{bloquee ? 'Licence requise' : 'Activation requise'}</p>
                    <h1 className="lg-title">{bloquee ? 'Installation non autorisée' : 'Activer cette instance'}</h1>
                    <p className="lg-description">
                        {bloquee
                            ? "Cette installation n'est rattachée à aucune licence. Prenez contact avec l'éditeur pour la régulariser."
                            : "Cette installation n'est pas encore associée à une licence valide. Saisissez la clé fournie par votre administrateur."}
                    </p>

                    {/* LE MESSAGE DE L'ÉDITEUR, tel qu'il l'a écrit. Les retours
                        à la ligne sont conservés : le texte est composé en
                        paragraphes, et les aplatir en ferait un pavé. */}
                    {avis?.message && (
                        <div className={bloquee ? 'lg-alert lg-avis' : 'lg-notice'}>
                            {bloquee ? <AlertTriangle /> : <Info />}
                            <span>{avis.message}</span>
                        </div>
                    )}

                    <div className="lg-field">
                        <label className="lg-field-label">Identifiant machine</label>
                        <button className="lg-hwid" type="button" onClick={handleCopy} title="Cliquer pour copier">
                            <span className="lg-hwid-value">{machineId || 'Identification…'}</span>
                            {copied
                                ? <Check className="lg-hwid-icon lg-hwid-icon--copied" />
                                : <Copy className="lg-hwid-icon" />}
                        </button>
                    </div>

                    {!bloquee && (
                        <>
                            <div className="lg-field">
                                <label className="lg-field-label">Clé d'activation</label>
                                <input
                                    className="lg-input"
                                    type="text"
                                    value={key}
                                    onChange={(e) => { setKey(e.target.value); if (error) setError(''); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && key.trim() && !isValidating) handleSubmit(); }}
                                    placeholder="Collez la clé fournie"
                                    disabled={isValidating}
                                />
                            </div>

                            <button className="lg-button" type="button" onClick={handleSubmit} disabled={!key.trim() || isValidating}>
                                {isValidating
                                    ? <><Loader2 className="lg-button-spin" /><span>Vérification…</span></>
                                    : <><ShieldCheck /><span>Activer</span></>}
                            </button>
                        </>
                    )}

                    {error && (
                        <div className="lg-alert">
                            <AlertTriangle />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* ═══ « REJOINDRE UNE CAISSE » RESTE OUVERT, MÊME BLOQUÉ ═══
                        C'est la sortie de secours d'un poste légitime que le
                        Hub n'aurait pas su reconnaître. Elle ne coûte rien :
                        s'appairer exige une caisse qui porte, elle, une vraie
                        licence. La refermer, en revanche, laisserait un
                        commerçant en règle devant une porte close. */}
                    {rejoindre}

                    <p className="lg-footer">
                        Sécurisé par <span className="lg-footer-brand">Yumi LicenseGuard</span>
                    </p>
                </div>
            </div>
        </div>
    );
};
