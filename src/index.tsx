import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Internal Modules
import { useLicense } from './hooks/useLicense';
import { HubNotification } from './components/HubNotification';
import { SyncWarning } from './components/SyncWarning';

// Public re-exports — host apps can compose these directly (e.g. reuse
// MeshBackground on a custom login screen).
export { MeshBackground } from './components/MeshBackground';
export { HubNotification } from './components/HubNotification';
export { SyncWarning } from './components/SyncWarning';
export { guardTheme } from './theme';
export type { LicenseState, Notification } from './types';

// Screens
import { guardTheme } from './theme';
import { LoadingScreen } from './screens/LoadingScreen';
import { ActivationScreen } from './screens/ActivationScreen';
import { BannedScreen } from './screens/BannedScreen';
import { ExpiredScreen } from './screens/ExpiredScreen';
import { ClockFraudScreen } from './screens/ClockFraudScreen';
import { SyncRequiredScreen } from './screens/SyncRequiredScreen';

interface LicenseGuardProps {
    children: React.ReactNode;
    /** Optional brand logo shown on the activation screen. Pass a Vite-imported asset URL. */
    logoUrl?: string;
}

/**
 * LicenseGuard Orchestrator — Standard Template
 * 
 * Manages the security lifecycle and displays appropriate blocking screens.
 */
export const LicenseGuard: React.FC<LicenseGuardProps> = ({ children, logoUrl }) => {
    const license = useLicense();
    const [isBannerDismissed, setIsBannerDismissed] = useState(false);
    const [showManual, setShowManual] = useState(false);

    // --- Developer Shortcuts ---
    useEffect(() => {
        let buffer = '';
        let timeout: any;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.altKey || e.metaKey) return; // Prevent conflict with other shortcuts
            clearTimeout(timeout);
            buffer += e.key.toLowerCase();
            if (buffer.endsWith('yumi')) {
                setShowManual(true);
                setTimeout(() => setShowManual(false), 10000);
                buffer = '';
            }
            timeout = setTimeout(() => { buffer = ''; }, 2000);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Handling States
    if (license.isLicensed === null) return <LoadingScreen />;
    
    const ThemeWrapper = ({ children }: { children: React.ReactNode }) => (
        <div style={{ 
            '--yumi-primary': guardTheme.colors.primary,
            '--yumi-font-serif': guardTheme.fonts.serif,
            '--yumi-font-sans': guardTheme.fonts.sans,
        } as any} className="font-sans relative isolate">
            {/* Global Dev Reset Button */}
            {showManual && (
                <div className="fixed top-4 right-4 z-[200] animate-bounce">
                     <button 
                        onClick={async () => { await invoke('save_license_key', { key: '' }); window.location.reload(); }}
                        className="bg-slate-900 text-white text-[10px] font-black px-4 py-2 rounded-full shadow-lg border border-white/20 backdrop-blur-md"
                     >
                        RESET LICENCE (DEV)
                     </button>
                </div>
            )}
            {children}
        </div>
    );

    if (license.isClockFraud) return <ThemeWrapper><ClockFraudScreen machineId={license.machineId} onRetry={() => window.location.reload()} /></ThemeWrapper>;
    if (license.isRevoked) return <ThemeWrapper><BannedScreen machineId={license.machineId} /></ThemeWrapper>;
    
    if (license.isSyncRequired) {
        return (
            <ThemeWrapper>
                <SyncRequiredScreen 
                    isValidating={license.isValidating} 
                    syncError={license.syncError}
                    onSync={async () => {
                        license.setSyncError(false);
                        const synced = await license.verifyWithHub();
                        if (synced) {
                            window.location.reload();
                        } else {
                            license.setSyncError(true);
                        }
                    }}
                />
            </ThemeWrapper>
        );
    }

    if (license.isExpired) {
        return <ThemeWrapper><ExpiredScreen machineId={license.machineId} showManual={showManual} isValidating={license.isValidating} onSync={async () => { await license.verifyWithHub(); }} onReset={async () => { await invoke('save_license_key', { key: '' }); window.location.reload(); }} /></ThemeWrapper>;
    }

    if (!license.isLicensed) {
        return <ThemeWrapper><ActivationScreen machineId={license.machineId} isValidating={license.isValidating} onActivate={license.activateLicense} logoUrl={logoUrl} /></ThemeWrapper>;
    }

    return (
        <div className="relative isolate" style={{ '--yumi-primary': guardTheme.colors.primary } as any}>
            {/* Sync Warning */}
            {license.isSyncWarning && !isBannerDismissed && <SyncWarning onDismiss={() => setIsBannerDismissed(true)} />}

            {/* Broadcast Notifications */}
            {license.activeNotif && <HubNotification notification={license.activeNotif} onDismiss={license.dismissNotification} />}

            {/* Dev Mode Button (Fallback) */}
            {showManual && (
                <div className="fixed top-4 right-4 z-[200] animate-bounce">
                     <button 
                        onClick={async () => { await invoke('save_license_key', { key: '' }); window.location.reload(); }}
                        className="bg-slate-900 text-white text-[10px] font-black px-4 py-2 rounded-full shadow-lg"
                     >
                        RESET LICENCE (DEV)
                     </button>
                </div>
            )}

            {children}
        </div>
    );
};
