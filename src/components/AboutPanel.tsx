import { useEffect, useState } from 'react';
import { useUpdater } from '../hooks/useUpdater';
import { InstallOverlay } from './InstallOverlay';

/**
 * « À PROPOS » — page d'état PRO, partagée par tous les POS.
 *
 * Une lecture calme et structurée de tout ce qui compte : version et mise à
 * jour, abonnement et prochaine expiration, conformité (signature du
 * contrat), identité machine (ID, clé masquée), dernière synchronisation.
 *
 * Règles visuelles : AUCUNE animation d'état — les statuts sont des pastilles
 * STATIQUES colorées avec libellé (charte Yumi : la sobriété est une
 * maturité). Tout hérite des tokens du POS hôte.
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
    /** Nom commercial de l'app (ex. « BOUTIKII ») — affiché en tête. */
    appName?: string;
    className?: string;
    /** Notifie le POS hôte (toast maison) après une copie presse-papier. */
    onCopied?: (label: string) => void;
}

export function AboutPanel({ appName, className = '', onCopied }: Props) {
    const [data, setData] = useState<AboutData | null>(null);
    const { update, isChecking, checkNow, error } = useUpdater({ enabled: false });
    const [installing, setInstalling] = useState(false);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        void (async () => {
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
        })();
        void checkNow().then(() => setChecked(true));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!data) return null;

    const daysLeft = data.expiryMs != null ? Math.ceil((data.expiryMs - Date.now()) / DAY) : null;
    const subscription = data.expiryMs == null
        ? { label: 'Abonnement actif', tone: '#4ade80', detail: 'Sans échéance enregistrée localement' }
        : daysLeft != null && daysLeft <= 0
            ? { label: 'Abonnement expiré', tone: '#f87171', detail: `Échu le ${fmtDate(data.expiryMs)}` }
            : daysLeft != null && daysLeft <= 15
                ? { label: `Expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`, tone: '#fbbf24', detail: `Prochaine échéance : ${fmtDate(data.expiryMs)}` }
                : { label: 'Abonnement actif', tone: '#4ade80', detail: `Prochaine échéance : ${fmtDate(data.expiryMs)}` };

    const conform = data.signedName
        ? { label: 'Contrat accepté', tone: '#4ade80', detail: `Signé par ${data.signedName}${data.signedDate ? ` le ${fmtDate(new Date(data.signedDate).getTime())}` : ''}` }
        : { label: 'Contrat non signé', tone: '#fbbf24', detail: "L'usage vaut acceptation — la signature reste recommandée (page Licence)" };

    const copy = (label: string, value: string) => {
        if (!value || value === '—') return;
        void navigator.clipboard?.writeText(value);
        onCopied?.(label);
    };

    // ── Primitives locales (héritent des tokens du POS hôte). ──
    const Dot = ({ tone }: { tone: string }) => (
        <span style={{ width: 8, height: 8, borderRadius: 9999, background: tone, display: 'inline-block', flexShrink: 0 }} />
    );
    const sectionTitle: React.CSSProperties = {
        margin: 0, fontSize: 10, fontWeight: 800,
        letterSpacing: '0.22em', textTransform: 'uppercase', opacity: 0.45,
    };
    const card: React.CSSProperties = {
        borderRadius: 18,
        border: '1px solid var(--lg-color-border, rgba(0,0,0,0.08))',
        padding: '18px 20px',
        display: 'flex', flexDirection: 'column', gap: 12,
    };
    const rowStyle: React.CSSProperties = {
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 16, fontSize: 13,
    };
    const kLabel: React.CSSProperties = { opacity: 0.55, fontWeight: 600, whiteSpace: 'nowrap' };
    const kValue: React.CSSProperties = { fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right' };
    const mono: React.CSSProperties = { ...kValue, fontFamily: 'ui-monospace, monospace', fontSize: 11.5, opacity: 0.85, cursor: 'pointer' };

    return (
        <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {installing && update && (
                <InstallOverlay update={update} onClose={() => setInstalling(false)} />
            )}

            {/* ── Application & mise à jour ── */}
            <div style={card}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                    <p style={sectionTitle}>Application</p>
                    {appName && (
                        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', opacity: 0.7 }}>{appName}</span>
                    )}
                </div>
                <div style={rowStyle}>
                    <span style={kLabel}>Version installée</span>
                    <span style={{ ...kValue, fontSize: 18 }}>{data.version ? `v${data.version}` : '—'}</span>
                </div>
                <div style={rowStyle}>
                    <span style={kLabel}>Mise à jour</span>
                    {update ? (
                        <button type="button" onClick={() => setInstalling(true)}
                            style={{
                                height: 36, padding: '0 18px', borderRadius: 9999,
                                background: 'var(--lg-color-bg, #1c1917)', color: 'var(--lg-color-fg, #fafaf9)',
                                border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                            }}>
                            v{update.version} disponible · Installer
                        </button>
                    ) : (
                        <span style={{ ...kValue, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                            {isChecking ? 'Vérification…'
                                : error && checked ? 'Vérification impossible'
                                : checked ? 'À jour'
                                : '…'}
                            <button type="button"
                                onClick={() => { void checkNow().then(() => setChecked(true)); }}
                                disabled={isChecking}
                                style={{
                                    height: 30, padding: '0 14px', borderRadius: 9999,
                                    background: 'transparent', color: 'inherit',
                                    border: '1px solid var(--lg-color-border, rgba(0,0,0,0.15))',
                                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                    opacity: isChecking ? 0.4 : 0.75,
                                }}>
                                Vérifier
                            </button>
                        </span>
                    )}
                </div>
            </div>

            {/* ── Abonnement & conformité ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                <div style={card}>
                    <p style={sectionTitle}>Abonnement</p>
                    <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: subscription.tone }}>
                        <Dot tone={subscription.tone} /> {subscription.label}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, opacity: 0.6, lineHeight: 1.5 }}>{subscription.detail}</p>
                </div>
                <div style={card}>
                    <p style={sectionTitle}>Conformité</p>
                    <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: conform.tone }}>
                        <Dot tone={conform.tone} /> {conform.label}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, opacity: 0.6, lineHeight: 1.5 }}>{conform.detail}</p>
                </div>
            </div>

            {/* ── Identité machine & synchronisation ── */}
            <div style={card}>
                <p style={sectionTitle}>Poste & licence</p>
                <div style={rowStyle}>
                    <span style={kLabel}>Identifiant machine</span>
                    <span style={mono} title="Copier"
                        onClick={() => copy('Identifiant machine', data.machineId)}>
                        {data.machineId}
                    </span>
                </div>
                <div style={{ ...rowStyle, borderTop: '1px solid var(--lg-color-border, rgba(0,0,0,0.06))', paddingTop: 12 }}>
                    <span style={kLabel}>Clé de licence</span>
                    <span style={mono} title="Copier la clé complète"
                        onClick={() => copy('Clé de licence', data.licenseKey)}>
                        {data.licenseKey ? maskKey(data.licenseKey) : '—'}
                    </span>
                </div>
                <div style={{ ...rowStyle, borderTop: '1px solid var(--lg-color-border, rgba(0,0,0,0.06))', paddingTop: 12 }}>
                    <span style={kLabel}>Dernière synchronisation</span>
                    <span style={kValue}>{data.lastSyncMs ? fmtRelative(data.lastSyncMs) : 'Jamais'}</span>
                </div>
            </div>
        </div>
    );
}
