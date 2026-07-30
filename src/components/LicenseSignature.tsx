import { useEffect, useState } from 'react';

/**
 * Signature d'ACCEPTATION du contrat de licence — partagée par tous les POS.
 *
 * Le client signe avec son NOM COMPLET, une seule fois : la signature est
 * enregistrée dans le stockage sécurisé Tauri (le même que la licence —
 * inaltérable depuis l'interface) avec la date. Une fois signée, la section
 * devient une mention sobre « Lu et accepté par … le … ».
 *
 * Valeur pour le développeur : une trace horodatée d'acceptation explicite
 * des conditions, opposable en cas de fraude (partage de licence,
 * rétro-ingénierie, impayés) — en complément du fait que l'usage vaut
 * acceptation.
 */

const SIG_NAME_KEY = 'license_signature_name';
const SIG_DATE_KEY = 'license_signature_date';

interface Props {
    className?: string;
}

export function LicenseSignature({ className = '' }: Props) {
    const [signedName, setSignedName] = useState<string | null>(null);
    const [signedDate, setSignedDate] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!('__TAURI_INTERNALS__' in window)) { setLoaded(true); return; }
        void (async () => {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                const [name, date] = await Promise.all([
                    invoke<string>('get_secure_storage', { key: SIG_NAME_KEY }),
                    invoke<string>('get_secure_storage', { key: SIG_DATE_KEY }),
                ]);
                if (name) { setSignedName(name); setSignedDate(date || null); }
            } catch { /* stockage indisponible : la section reste signable */ }
            setLoaded(true);
        })();
    }, []);

    const sign = async () => {
        const name = draft.trim().replace(/\s+/g, ' ');
        // Un NOM COMPLET : au moins deux mots de 2+ lettres.
        if (name.split(' ').filter((w) => w.length >= 2).length < 2) return;
        setBusy(true);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const date = new Date().toISOString();
            await invoke('set_secure_storage', { key: SIG_NAME_KEY, value: name });
            await invoke('set_secure_storage', { key: SIG_DATE_KEY, value: date });
            setSignedName(name);
            setSignedDate(date);
        } catch { /* réessayable */ } finally { setBusy(false); }
    };

    if (!loaded) return null;

    // ── Déjà signé : mention sobre, non modifiable depuis l'UI. ──
    if (signedName) {
        return (
            <div className={className}
                style={{
                    borderTop: '1px solid var(--lg-color-border, rgba(0,0,0,0.1))',
                    paddingTop: 18, marginTop: 8,
                }}>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.5 }}>
                    Acceptation du contrat
                </p>
                <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, opacity: 0.85 }}>
                    Lu et accepté par{' '}
                    <span style={{
                        fontStyle: 'italic', fontWeight: 700, fontSize: 16,
                        fontFamily: 'var(--font-display, Georgia, serif)',
                    }}>
                        {signedName}
                    </span>
                    {signedDate && (
                        <>
                            {' '}le {new Date(signedDate).toLocaleDateString('fr-FR', {
                                day: 'numeric', month: 'long', year: 'numeric',
                            })}
                        </>
                    )}
                    .
                </p>
            </div>
        );
    }

    // ── Pas encore signé : champ nom complet + phrase d'acceptation. ──
    const valid = draft.trim().split(/\s+/).filter((w) => w.length >= 2).length >= 2;
    return (
        <div className={className}
            style={{
                borderTop: '1px solid var(--lg-color-border, rgba(0,0,0,0.1))',
                paddingTop: 18, marginTop: 8,
            }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.5 }}>
                Acceptation du contrat
            </p>
            <p style={{ margin: '8px 0 12px', fontSize: 12, lineHeight: 1.6, opacity: 0.7 }}>
                En signant de son nom complet, le détenteur de la licence reconnaît
                avoir lu et accepté l'intégralité des conditions ci-dessus.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && valid && !busy) void sign(); }}
                    placeholder="Nom complet (ex. Aïssata Sow)"
                    style={{
                        flex: '1 1 220px', height: 42, padding: '0 16px',
                        borderRadius: 12, fontSize: 14,
                        fontFamily: 'var(--font-display, Georgia, serif)', fontStyle: 'italic',
                        background: 'var(--lg-color-bg-soft, rgba(0,0,0,0.04))',
                        border: '1px solid var(--lg-color-border, rgba(0,0,0,0.12))',
                        color: 'inherit', outline: 'none',
                    }} />
                <button type="button" onClick={() => void sign()} disabled={!valid || busy}
                    style={{
                        height: 42, padding: '0 22px', borderRadius: 9999,
                        background: 'var(--lg-color-bg, #1c1917)', color: 'var(--lg-color-fg, #fafaf9)',
                        border: 'none', fontSize: 12, fontWeight: 800,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        cursor: valid && !busy ? 'pointer' : 'default',
                        opacity: valid && !busy ? 1 : 0.45,
                    }}>
                    {busy ? 'Enregistrement…' : 'Signer et accepter'}
                </button>
            </div>
        </div>
    );
}
