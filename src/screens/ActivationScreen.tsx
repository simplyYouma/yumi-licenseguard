import { useState } from 'react';
import { Copy, Check, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { guardTheme } from '../theme';

interface Props {
    machineId: string;
    onActivate: (key: string) => Promise<{ success: boolean; message?: string }>;
    isValidating: boolean;
    /** Optional consumer-provided logo. Supports any URL Vite/Tauri can resolve. */
    logoUrl?: string;
}

const isDev = import.meta.env.DEV;

export const ActivationScreen = ({ machineId, onActivate, isValidating, logoUrl }: Props) => {
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

    const handleDevBypass = async () => {
        await invoke('save_license_key', { key: 'DEV-BYPASS' });
        window.location.reload();
    };

    const accent = guardTheme.colors.primary;

    return (
        <div
            className="fixed inset-0 flex items-center justify-center p-4 font-sans"
            style={{ backgroundColor: '#F4F1EA', color: '#1A1A1A', fontFamily: guardTheme.fonts.sans }}
        >
            <div
                className="w-full max-w-[360px] rounded-2xl bg-white"
                style={{ border: '1px solid #E8E5DD', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.05)', padding: '28px' }}
            >
                {/* Brand */}
                <div className="flex items-center gap-3 mb-6">
                    {logoUrl ? (
                        <img src={logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: accent }}>
                            <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.2} />
                        </div>
                    )}
                    <div className="leading-tight">
                        <div style={{ fontFamily: guardTheme.fonts.serif, fontSize: 17, fontWeight: 600 }}>
                            {guardTheme.config.projectName}
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">Activation requise</div>
                    </div>
                </div>

                {/* HWID */}
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                    Identifiant machine
                </label>
                <button
                    onClick={handleCopy}
                    className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left mb-4 cursor-pointer hover:bg-neutral-50 transition-colors"
                    style={{ border: '1px solid #E8E5DD', backgroundColor: '#FAFAF7' }}
                    title="Cliquer pour copier"
                >
                    <code className="text-[11px] text-neutral-700 font-mono truncate">
                        {machineId || 'Identification…'}
                    </code>
                    <span className="shrink-0 text-neutral-400">
                        {copied ? <Check size={13} style={{ color: accent }} /> : <Copy size={13} />}
                    </span>
                </button>

                {/* License key */}
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                    Clé d'activation
                </label>
                <input
                    type="text"
                    value={key}
                    onChange={(e) => { setKey(e.target.value); if (error) setError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && key.trim() && !isValidating) handleSubmit(); }}
                    placeholder="Collez la clé fournie"
                    disabled={isValidating}
                    className="w-full rounded-lg px-3 py-2 text-[12px] font-mono outline-none transition-colors"
                    style={{
                        border: `1px solid ${error ? '#DC2626' : '#E8E5DD'}`,
                        backgroundColor: '#FFFFFF',
                    }}
                />

                {error && (
                    <div className="flex items-start gap-2 text-[11px] text-red-700 bg-red-50 border border-red-100 rounded-md px-2.5 py-2 mt-2">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Submit */}
                <button
                    onClick={handleSubmit}
                    disabled={!key.trim() || isValidating}
                    className="w-full mt-4 rounded-lg py-2.5 text-[13px] font-semibold flex items-center justify-center gap-2 transition-opacity"
                    style={{
                        backgroundColor: accent,
                        color: '#FFFFFF',
                        opacity: !key.trim() || isValidating ? 0.4 : 1,
                        cursor: !key.trim() || isValidating ? 'not-allowed' : 'pointer',
                    }}
                >
                    {isValidating ? (
                        <><Loader2 size={14} className="animate-spin" /><span>Vérification…</span></>
                    ) : (
                        <><ShieldCheck size={14} /><span>Activer</span></>
                    )}
                </button>

                {/* Dev bypass */}
                {isDev && (
                    <button
                        onClick={handleDevBypass}
                        className="w-full mt-2 rounded-lg py-1.5 text-[10px] text-neutral-500 hover:text-neutral-900 transition-colors"
                        style={{ border: '1px dashed #D4D0C4' }}
                        title="Disponible uniquement en développement"
                    >
                        Continuer en mode développement
                    </button>
                )}

                <p className="mt-5 text-center text-[10px] text-neutral-400">
                    Sécurisé par Yumi LicenseGuard
                </p>
            </div>
        </div>
    );
};
