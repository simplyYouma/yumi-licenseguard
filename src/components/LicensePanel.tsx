import { useEffect, useState } from 'react';
import { useUpdater } from '../hooks/useUpdater';
import { InstallOverlay } from './InstallOverlay';

/**
 * Panneau LICENCE — à glisser dans la page Réglages de chaque POS.
 *
 * Montre d'un coup d'œil :
 *   - le badge de l'ABONNEMENT (actif jusqu'au …, bientôt expiré, inconnu),
 *   - la VERSION installée de l'application,
 *   - l'état de mise à jour : « À jour » ou « vX disponible » + bouton
 *     Installer (ouvre l'overlay bloquant partagé : %, erreurs, annulation),
 *   - l'identifiant machine (utile au support).
 *
 * Lectures LÉGÈRES uniquement (clé locale + version + un check updater au
 * montage) — le cycle de vérification licence reste porté par LicenseGuard,
 * il n'est jamais dupliqué ici.
 */

interface Props {
    className?: string;
}

function readExpiryFromKey(key: string): number | null {
    const parts = key.trim().split('.');
    if (parts.length !== 2) return null;
    const ms = parseInt(parts[0], 16);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
}

const DAY = 86_400_000;

export function LicensePanel({ className = '' }: Props) {
    const [machineId, setMachineId] = useState('');
    const [expiryMs, setExpiryMs] = useState<number | null>(null);
    const [version, setVersion] = useState('');
    const { update, isChecking, checkNow, error } = useUpdater({ enabled: false });
    const [installing, setInstalling] = useState(false);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        if (!('__TAURI_INTERNALS__' in window)) return;
        void (async () => {
            const { invoke } = await import('@tauri-apps/api/core');
            const { getVersion } = await import('@tauri-apps/api/app');
            try { setVersion(await getVersion()); } catch { /* web preview */ }
            try { setMachineId(((await invoke<string>('get_machine_id')) || '').trim().toUpperCase()); } catch { /* — */ }
            try {
                const key = await invoke<string>('get_license_key');
                if (key) setExpiryMs(readExpiryFromKey(key));
            } catch { /* — */ }
        })();
        // Un check de MAJ au montage du panneau (léger, silencieux).
        void checkNow().then(() => setChecked(true));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const daysLeft = expiryMs != null ? Math.ceil((expiryMs - Date.now()) / DAY) : null;
    const badge = expiryMs == null
        ? { label: 'Abonnement actif', tone: '#4ade80' }
        : daysLeft != null && daysLeft <= 0
            ? { label: 'Abonnement expiré', tone: '#f87171' }
            : daysLeft != null && daysLeft <= 15
                ? { label: `Expire dans ${daysLeft} j`, tone: '#fbbf24' }
                : {
                    label: `Actif jusqu'au ${new Date(expiryMs).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`,
                    tone: '#4ade80',
                };

    const row: React.CSSProperties = {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '10px 0', fontSize: 13,
    };
    const label: React.CSSProperties = { opacity: 0.6, fontWeight: 600 };
    const value: React.CSSProperties = { fontWeight: 700, fontVariantNumeric: 'tabular-nums' };

    return (
        <div className={className}
            style={{
                borderRadius: 16,
                border: '1px solid var(--lg-color-border, rgba(0,0,0,0.1))',
                padding: '16px 18px',
                fontFamily: 'inherit',
                color: 'inherit',
            }}>
            {installing && update && (
                <InstallOverlay update={update} onClose={() => setInstalling(false)} />
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.55 }}>
                    Licence & mises à jour
                </p>
                {/* Badge d'abonnement — l'état que le client doit voir en premier. */}
                <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 12px', borderRadius: 9999,
                    fontSize: 11, fontWeight: 800,
                    background: `color-mix(in srgb, ${badge.tone} 16%, transparent)`,
                    color: badge.tone,
                }}>
                    <span style={{ width: 7, height: 7, borderRadius: 9999, background: badge.tone }} />
                    {badge.label}
                </span>
            </div>

            <div style={row}>
                <span style={label}>Version de l'application</span>
                <span style={value}>{version ? `v${version}` : '—'}</span>
            </div>

            <div style={{ ...row, borderTop: '1px solid var(--lg-color-border, rgba(0,0,0,0.08))' }}>
                <span style={label}>Mise à jour</span>
                {update ? (
                    <button onClick={() => setInstalling(true)}
                        style={{
                            background: 'var(--lg-color-bg, #1c1917)', color: 'var(--lg-color-fg, #fafaf9)',
                            border: 'none', borderRadius: 9999, padding: '8px 16px',
                            fontSize: 12, fontWeight: 800, cursor: 'pointer',
                        }}>
                        v{update.version} disponible · Installer
                    </button>
                ) : (
                    <span style={{ ...value, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {isChecking ? 'Vérification…'
                            : error && checked ? 'Vérification impossible'
                            : checked ? '✓ À jour'
                            : '…'}
                        <button onClick={() => { void checkNow().then(() => setChecked(true)); }}
                            disabled={isChecking}
                            title="Re-vérifier maintenant"
                            style={{
                                background: 'transparent', border: '1px solid var(--lg-color-border, rgba(0,0,0,0.15))',
                                borderRadius: 9999, padding: '5px 12px',
                                fontSize: 11, fontWeight: 700, cursor: 'pointer', color: 'inherit',
                                opacity: isChecking ? 0.5 : 0.8,
                            }}>
                            Vérifier
                        </button>
                    </span>
                )}
            </div>

            {machineId && (
                <div style={{ ...row, borderTop: '1px solid var(--lg-color-border, rgba(0,0,0,0.08))' }}>
                    <span style={label}>Identifiant machine</span>
                    <span style={{ ...value, fontSize: 11, fontFamily: 'ui-monospace, monospace', opacity: 0.8 }}>
                        {machineId}
                    </span>
                </div>
            )}
        </div>
    );
}
