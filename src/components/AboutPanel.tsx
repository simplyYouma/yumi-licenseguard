import { useEffect, useState } from 'react';
import { Mail, Phone, Cpu, KeyRound, Cloud, RefreshCw, CalendarClock, BadgeCheck, PenLine, Package } from 'lucide-react';
import { useUpdater } from '../hooks/useUpdater';
import { InstallOverlay } from './InstallOverlay';

/**
 * « À PROPOS » — LA page d'état du poste, partagée par tous les POS.
 *
 * Contenu (zéro répétition avec la page Contrat, qui ne garde que le texte
 * du contrat + la signature) :
 *   1. ÉDITEUR & SUPPORT — carte sombre éditoriale (nom en lettrine serif,
 *      e-mail, ligne directe) ;
 *   2. VERSION & MISE À JOUR — version installée, état, bouton Installer
 *      (→ overlay bloquant avec progression) ;
 *   3. ABONNEMENT — badge statique + prochaine échéance ;
 *   4. CONFORMITÉ — validité contractuelle + signature d'acceptation ;
 *   5. POSTE & LICENCE — identifiant machine, clé masquée (copiables),
 *      dernière synchronisation + bouton « Revérifier » (Hub).
 *
 * Charte : pastilles d'état STATIQUES (jamais d'animation), micro-labels
 * uppercase, hairlines, tokens du POS hôte (fallbacks neutres).
 */

const DAY = 86_400_000;

interface AboutData {
    version: string;
    machineId: string;
    licenseKey: string;
    expiryMs: number | null;
    lastSyncMs: number | null;
    signedName: string | null;
    signedDate: string | null;
}

function readExpiryFromKey(key: string): number | null {
    const parts = key.trim().split('.');
    if (parts.length !== 2) return null;
    const ms = parseInt(parts[0], 16);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
}

const maskKey = (k: string): string =>
    k.length <= 14 ? k : `${k.slice(0, 8)}…${k.slice(-6)}`;

const fmtDate = (ms: number): string =>
    new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const fmtRelative = (ms: number): string => {
    const mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins} min`;
    const h = Math.round(mins / 60);
    if (h < 24) return `il y a ${h} h`;
    return `il y a ${Math.round(h / 24)} j`;
};

interface Props {
    /** Nom commercial de l'app (ex. « BOUTIKII »). */
    appName?: string;
    /** Éditeur — défauts : l'éditeur Yumi. */
    editorName?: string;
    editorEmail?: string;
    editorPhone?: string;
    className?: string;
    /** Toast maison du POS après une copie presse-papier / une resynchro. */
    onNotify?: (message: string, ok: boolean) => void;
}

export function AboutPanel({
    appName,
    editorName = 'Fatoumata Youma Sokona',
    editorEmail = 'fysokona@gmail.com',
    editorPhone = '+223 90 04 13 69',
    className = '',
    onNotify,
}: Props) {
    const [data, setData] = useState<AboutData | null>(null);
    const { update, isChecking, checkNow, error } = useUpdater({ enabled: false });
    const [installing, setInstalling] = useState(false);
    const [checked, setChecked] = useState(false);
    const [resyncing, setResyncing] = useState(false);

    const load = async () => {
        if (!('__TAURI_INTERNALS__' in window)) {
            setData({ version: '', machineId: '—', licenseKey: '', expiryMs: null, lastSyncMs: null, signedName: null, signedDate: null });
            return;
        }
        const { invoke } = await import('@tauri-apps/api/core');
        const { getVersion } = await import('@tauri-apps/api/app');
        const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
            try { return await p; } catch { return fallback; }
        };
        const [version, machineId, licenseKey, lastSyncRaw, signedName, signedDate] = await Promise.all([
            safe(getVersion(), ''),
            safe(invoke<string>('get_machine_id'), '—'),
            safe(invoke<string>('get_license_key'), ''),
            safe(invoke<string>('get_secure_storage', { key: 'last_sync' }), ''),
            safe(invoke<string>('get_secure_storage', { key: 'license_signature_name' }), ''),
            safe(invoke<string>('get_secure_storage', { key: 'license_signature_date' }), ''),
        ]);
        const lastSyncMs = Number(lastSyncRaw);
        setData({
            version,
            machineId: (machineId || '—').trim().toUpperCase(),
            licenseKey: licenseKey ?? '',
            expiryMs: licenseKey ? readExpiryFromKey(licenseKey) : null,
            lastSyncMs: Number.isFinite(lastSyncMs) && lastSyncMs > 0 ? lastSyncMs : null,
            signedName: signedName || null,
            signedDate: signedDate || null,
        });
    };

    useEffect(() => {
        void load();
        // La recherche de mise a jour part APRÈS l'affichage : c'est un appel
        // RÉSEAU, et il n'a aucune raison de retarder des informations déjà
        // disponibles en local. Hors ligne, la carte Version dira simplement
        // qu'elle n'a pas pu vérifier, au lieu de tourner indéfiniment.
        const t = setTimeout(() => {
            void checkNow().then(() => setChecked(true)).catch(() => setChecked(true));
        }, 300);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Revérification licence auprès du Hub (même flux que verifyWithHub). */
    const resync = async () => {
        if (resyncing || !data) return;
        setResyncing(true);
        try {
            const hubUrl: string = import.meta.env.VITE_YUMI_HUB_URL ?? '';
            const projectId: string = (import.meta.env.VITE_YUMI_PROJECT_ID ?? '').replace(/"/g, '');
            if (!hubUrl || !projectId || data.machineId === '—') {
                onNotify?.('Configuration Hub incomplète', false);
                return;
            }
            const res = await fetch(hubUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hwid: data.machineId, project_id: projectId }),
                cache: 'no-store',
                signal: AbortSignal.timeout(15000),
            });
            if (res.ok) {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('set_secure_storage', { key: 'last_sync', value: String(Date.now()) });
                onNotify?.('Licence revérifiée auprès du Hub', true);
                await load();
            } else {
                onNotify?.(`Le Hub a répondu ${res.status}`, false);
            }
        } catch (e) {
            onNotify?.(`Hub injoignable : ${(e as Error).message}`, false);
        } finally {
            setResyncing(false);
        }
    };

    /**
     * Squelette pendant le chargement — et NON `return null`.
     *
     * Six appels au système partent en parallèle au montage (version,
     * identifiant machine, clé de licence, trois valeurs de stockage sûr),
     * plus deux modules chargés à la demande. Tant que le plus lent n'a pas
     * répondu, la page rendait le VIDE : l'en-tête « À propos » s'affichait,
     * puis un trou. L'utilisateur croit que la page est cassée, et il a
     * raison de le croire — rien ne lui dit le contraire.
     */
    if (!data) return <AboutSkeleton className={className} />;

    const daysLeft = data.expiryMs != null ? Math.ceil((data.expiryMs - Date.now()) / DAY) : null;
    const subscription = data.expiryMs == null
        ? { label: 'Actif', tone: '#4ade80', detail: 'Sans échéance enregistrée localement' }
        : daysLeft != null && daysLeft <= 0
            ? { label: 'Expiré', tone: '#f87171', detail: `Échu le ${fmtDate(data.expiryMs)}` }
            : daysLeft != null && daysLeft <= 15
                ? { label: `${daysLeft} j restants`, tone: '#fbbf24', detail: `Prochaine échéance : ${fmtDate(data.expiryMs)}` }
                : { label: 'Actif', tone: '#4ade80', detail: `Prochaine échéance : ${fmtDate(data.expiryMs)}` };

    const conforme = subscription.tone !== '#f87171';

    const copy = (label: string, value: string) => {
        if (!value || value === '—') return;
        void navigator.clipboard?.writeText(value);
        onNotify?.(`${label} copié`, true);
    };

    // ── Primitives visuelles ──
    const Dot = ({ tone }: { tone: string }) => (
        <span style={{ width: 8, height: 8, borderRadius: 9999, background: tone, display: 'inline-block', flexShrink: 0 }} />
    );
    const micro: React.CSSProperties = {
        margin: 0, fontSize: 9.5, fontWeight: 800,
        letterSpacing: '0.24em', textTransform: 'uppercase', opacity: 0.45,
    };
    const card: React.CSSProperties = {
        borderRadius: 20,
        border: '1px solid var(--lg-color-border, rgba(0,0,0,0.08))',
        background: 'var(--lg-color-card, transparent)',
        padding: '20px 22px',
        display: 'flex', flexDirection: 'column', gap: 10,
    };
    const bigValue: React.CSSProperties = {
        margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em',
        fontFamily: 'var(--font-display, inherit)',
        fontVariantNumeric: 'tabular-nums',
    };
    const detail: React.CSSProperties = { margin: 0, fontSize: 12, opacity: 0.55, lineHeight: 1.5 };
    const ghostBtn: React.CSSProperties = {
        height: 32, padding: '0 16px', borderRadius: 9999,
        background: 'transparent', color: 'inherit',
        border: '1px solid var(--lg-color-border, rgba(0,0,0,0.15))',
        fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: 0.75,
        display: 'inline-flex', alignItems: 'center', gap: 6,
    };

    return (
        <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {installing && update && (
                <InstallOverlay update={update} onClose={() => setInstalling(false)} />
            )}

            {/* ═══ 1. ÉDITEUR & SUPPORT — carte sombre éditoriale ═══ */}
            <div style={{
                background: '#0A0A0A', color: '#FFFFFF',
                borderRadius: 24, padding: '28px 30px',
                display: 'flex', flexWrap: 'wrap', gap: 26,
                alignItems: 'flex-end', justifyContent: 'space-between',
                boxShadow: '0 30px 70px -25px rgba(0,0,0,0.45)',
            }}>
                <div style={{ minWidth: 0 }}>
                    <p style={{ ...micro, color: 'rgba(255,255,255,0.35)', opacity: 1 }}>
                        Éditeur & support
                    </p>
                    <p style={{
                        margin: '10px 0 0', fontSize: 30, lineHeight: 1.15,
                        fontFamily: 'var(--font-display, Georgia, serif)', fontStyle: 'italic',
                    }}>
                        {editorName}
                    </p>
                    {appName && (
                        <p style={{ margin: '8px 0 0', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
                            {appName} — Écosystème Yumi
                        </p>
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600 }}>
                        <Mail size={13} strokeWidth={2.2} style={{ opacity: 0.5 }} /> {editorEmail}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        <Phone size={13} strokeWidth={2.2} style={{ opacity: 0.5 }} /> {editorPhone}
                    </span>
                </div>
            </div>

            {/* ═══ 2-4. VERSION · ABONNEMENT · CONFORMITÉ ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 18 }}>
                <div style={card}>
                    <p style={micro}><Package size={10} strokeWidth={2.4} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 6 }} />Version</p>
                    <p style={bigValue}>{data.version ? `v${data.version}` : '—'}</p>
                    {update ? (
                        <button type="button" onClick={() => setInstalling(true)}
                            style={{
                                alignSelf: 'flex-start',
                                height: 36, padding: '0 18px', borderRadius: 9999,
                                background: 'var(--lg-color-bg, #1c1917)', color: 'var(--lg-color-fg, #fafaf9)',
                                border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                            }}>
                            v{update.version} disponible · Installer
                        </button>
                    ) : (
                        <p style={{ ...detail, display: 'flex', alignItems: 'center', gap: 10 }}>
                            {isChecking ? 'Vérification…'
                                : error && checked ? 'Vérification impossible'
                                : checked ? 'Vous êtes à jour'
                                : '…'}
                            <button type="button" style={ghostBtn} disabled={isChecking}
                                onClick={() => { void checkNow().then(() => setChecked(true)); }}>
                                Vérifier
                            </button>
                        </p>
                    )}
                </div>

                <div style={card}>
                    <p style={micro}><CalendarClock size={10} strokeWidth={2.4} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 6 }} />Abonnement</p>
                    <p style={{ ...bigValue, display: 'flex', alignItems: 'center', gap: 10, color: subscription.tone }}>
                        <Dot tone={subscription.tone} /> {subscription.label}
                    </p>
                    <p style={detail}>{subscription.detail}</p>
                </div>

                <div style={card}>
                    <p style={micro}><BadgeCheck size={10} strokeWidth={2.4} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 6 }} />Conformité</p>
                    <p style={{ ...bigValue, display: 'flex', alignItems: 'center', gap: 10, color: conforme ? '#4ade80' : '#f87171' }}>
                        <Dot tone={conforme ? '#4ade80' : '#f87171'} /> {conforme ? 'Conforme' : 'Action requise'}
                    </p>
                    <p style={{ ...detail, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <PenLine size={11} strokeWidth={2.2} style={{ opacity: 0.6, flexShrink: 0 }} />
                        {data.signedName
                            ? `Contrat signé par ${data.signedName}${data.signedDate ? ` le ${fmtDate(new Date(data.signedDate).getTime())}` : ''}`
                            : 'Contrat non signé — signature recommandée (onglet Licence)'}
                    </p>
                </div>
            </div>

            {/* ═══ 5. POSTE & LICENCE ═══ */}
            <div style={{ ...card, gap: 0 }}>
                <p style={{ ...micro, marginBottom: 6 }}>Poste & licence</p>
                {[
                    {
                        icon: Cpu, label: 'Identifiant machine',
                        value: data.machineId, copyable: data.machineId,
                    },
                    {
                        icon: KeyRound, label: 'Clé de licence',
                        value: data.licenseKey ? maskKey(data.licenseKey) : '—', copyable: data.licenseKey,
                    },
                ].map(({ icon: Icon, label, value, copyable }, i) => (
                    <div key={label}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: 16, padding: '13px 0',
                            borderTop: i > 0 ? '1px solid var(--lg-color-border, rgba(0,0,0,0.06))' : 'none',
                        }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, opacity: 0.6 }}>
                            <Icon size={13} strokeWidth={2.2} /> {label}
                        </span>
                        <span title="Copier"
                            onClick={() => copy(label, copyable)}
                            style={{
                                fontFamily: 'ui-monospace, monospace', fontSize: 11.5,
                                fontWeight: 700, opacity: 0.85, cursor: copyable ? 'pointer' : 'default',
                                textAlign: 'right', wordBreak: 'break-all',
                            }}>
                            {value}
                        </span>
                    </div>
                ))}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 16, padding: '13px 0 2px',
                    borderTop: '1px solid var(--lg-color-border, rgba(0,0,0,0.06))',
                }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, opacity: 0.6 }}>
                        <Cloud size={13} strokeWidth={2.2} /> Dernière synchronisation
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700 }}>
                        {data.lastSyncMs ? fmtRelative(data.lastSyncMs) : 'Jamais'}
                        <button type="button" style={ghostBtn} disabled={resyncing}
                            onClick={() => void resync()}>
                            <RefreshCw size={11} strokeWidth={2.4} />
                            {resyncing ? 'Vérification…' : 'Revérifier'}
                        </button>
                    </span>
                </div>
            </div>
        </div>
    );
}

/**
 * Le squelette de la page « À propos » — la MÊME ossature que la page
 * réelle, en gris : trois blocs, puis la grille de cartes. Un squelette qui
 * ne ressemble pas à ce qui va s'afficher produit un saut désagréable au
 * moment du remplacement ; celui-ci occupe exactement la place.
 */
function AboutSkeleton({ className = '' }: { className?: string }) {
    const bloc = (hauteur: number, radius = 20): React.CSSProperties => ({
        height: hauteur,
        borderRadius: radius,
        background: 'var(--lg-color-border, rgba(0,0,0,0.06))',
        animation: 'lg-pulse 1.4s ease-in-out infinite',
    });
    return (
        <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
            aria-busy="true" aria-label="Chargement des informations">
            <style>{'@keyframes lg-pulse{0%,100%{opacity:.55}50%{opacity:.9}}'}</style>
            <div style={bloc(150, 24)} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
                <div style={bloc(120)} />
                <div style={bloc(120)} />
                <div style={bloc(120)} />
            </div>
            <div style={bloc(96)} />
        </div>
    );
}
