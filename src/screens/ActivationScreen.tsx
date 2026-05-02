import { useState } from 'react';
import { Copy, Check, Key, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react';
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
            setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard unavailable */ }
    };

    const handleSubmit = async () => {
        setError('');
        const result = await onActivate(key);
        if (!result.success) setError(result.message || 'Erreur de validation.');
    };

    const handleDevBypass = async () => {
        // Debug-only: writes a sentinel license file that the Rust verifier
        // also accepts in cfg(debug_assertions). Production builds never
        // honor this value.
        await invoke('save_license_key', { key: 'DEV-BYPASS' });
        window.location.reload();
    };

    const accent = guardTheme.colors.primary;

    return (
        <div
            className="min-h-screen flex items-center justify-center p-6 font-sans"
            style={{
                color: '#1A1A1A',
                background: 'linear-gradient(180deg, #FAFAF7 0%, #F2F0EA 100%)',
                fontFamily: guardTheme.fonts.sans,
            }}
        >
            <div className="w-full max-w-[440px]">
                {/* Brand header */}
                <div className="flex flex-col items-center text-center mb-10">
                    {logoUrl ? (
                        <img
                            src={logoUrl}
                            alt={guardTheme.config.projectName}
                            className="w-20 h-20 rounded-2xl object-cover shadow-lg mb-5"
                        />
                    ) : (
                        <div
                            className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg mb-5"
                            style={{ backgroundColor: accent }}
                        >
                            <ShieldCheck className="w-10 h-10 text-white" strokeWidth={2} />
                        </div>
                    )}

                    <h1
                        className="text-[28px] leading-tight tracking-tight"
                        style={{ fontFamily: guardTheme.fonts.serif, fontWeight: 600 }}
                    >
                        {guardTheme.config.projectName}
                    </h1>
                    <p className="mt-2 text-sm text-neutral-500">
                        Activation requise pour démarrer cette instance.
                    </p>
                </div>

                {/* Card */}
                <div
                    className="rounded-2xl p-7 bg-white"
                    style={{ border: '1px solid #E8E5DD', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06)' }}
                >
                    {/* HWID */}
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500 mb-2">
                        Identifiant machine
                    </label>
                    <button
                        onClick={handleCopy}
                        className="w-full flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors mb-6 cursor-pointer hover:bg-neutral-50"
                        style={{ border: '1px solid #E8E5DD', backgroundColor: '#FAFAF7' }}
                        title="Cliquer pour copier"
                    >
                        <code className="text-[13px] text-neutral-800 font-mono truncate">
                            {machineId || 'Identification…'}
                        </code>
                        <span className="text-neutral-400 shrink-0">
                            {copied ? <Check size={16} style={{ color: accent }} /> : <Copy size={16} />}
                        </span>
                    </button>

                    {/* License key */}
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500 mb-2">
                        Clé d'activation
                    </label>
                    <div className="relative mb-2">
                        <input
                            type="text"
                            value={key}
                            onChange={(e) => { setKey(e.target.value); if (error) setError(''); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' && key.trim() && !isValidating) handleSubmit(); }}
                            placeholder="Collez la clé fournie par votre fournisseur"
                            disabled={isValidating}
                            className="w-full rounded-xl px-4 py-3 pr-10 text-[13px] font-mono outline-none transition-colors"
                            style={{
                                border: `1px solid ${error ? '#DC2626' : '#E8E5DD'}`,
                                backgroundColor: '#FFFFFF',
                            }}
                        />
                        <Key size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300" />
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-2 mt-1">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        onClick={handleSubmit}
                        disabled={!key.trim() || isValidating}
                        className="w-full mt-5 rounded-xl py-3 text-[13px] font-semibold tracking-wide flex items-center justify-center gap-2 transition-opacity"
                        style={{
                            backgroundColor: accent,
                            color: '#FFFFFF',
                            opacity: !key.trim() || isValidating ? 0.4 : 1,
                            cursor: !key.trim() || isValidating ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {isValidating ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                <span>Vérification…</span>
                            </>
                        ) : (
                            <>
                                <ShieldCheck size={16} />
                                <span>Activer cette instance</span>
                            </>
                        )}
                    </button>

                    {/* Dev bypass — only present in development builds, never in production */}
                    {isDev && (
                        <button
                            onClick={handleDevBypass}
                            className="w-full mt-3 rounded-xl py-2 text-[11px] tracking-wide text-neutral-500 hover:text-neutral-900 transition-colors"
                            style={{ border: '1px dashed #D4D0C4', backgroundColor: 'transparent' }}
                            title="Disponible uniquement en mode développement"
                        >
                            Continuer en mode développement
                        </button>
                    )}
                </div>

                <p className="mt-6 text-center text-[11px] text-neutral-400 tracking-wide">
                    Sécurisé par Yumi LicenseGuard
                </p>
            </div>
        </div>
    );
};
