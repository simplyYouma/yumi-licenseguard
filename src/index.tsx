import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Stylesheet — single source of truth, imported once.
import './styles/index.css';

// Internal modules
import { useLicense } from './hooks/useLicense';
import { HubNotification } from './components/HubNotification';
import { SyncWarning } from './components/SyncWarning';

// Screens
import { LoadingScreen } from './screens/LoadingScreen';
import { ActivationScreen } from './screens/ActivationScreen';
import { BannedScreen } from './screens/BannedScreen';
import { ExpiredScreen } from './screens/ExpiredScreen';
import { ClockFraudScreen } from './screens/ClockFraudScreen';
import { SyncRequiredScreen } from './screens/SyncRequiredScreen';

// Public re-exports — host apps can compose these primitives directly.
export { MeshBackground } from './components/MeshBackground';
export { HubNotification } from './components/HubNotification';
export { SyncWarning } from './components/SyncWarning';
export { guardTheme } from './theme';
export type { LicenseState, Notification } from './types';

// Auto-updater hook — host apps wire it once at App.tsx mount.
export { useUpdater } from './hooks/useUpdater';
// Drop-in button for the Settings page : check + install in one widget.
export { UpdateCheckButton } from './components/UpdateCheckButton';

interface LicenseGuardProps {
    children: React.ReactNode;
}

/**
 * LicenseGuard — orchestrator
 *
 * Manages the security lifecycle (activation, expiry, revocation, sync,
 * clock fraud) and renders the appropriate blocking screen until the
 * license is valid, after which it renders `children`.
 *
 * The visual identity is owned by the package and shared across every
 * Yumi POS app. Consumers do not customize colors or branding here —
 * each license state has its own deliberate color so users recognize
 * what is happening at a glance.
 */
export const LicenseGuard: React.FC<LicenseGuardProps> = ({ children }) => {
    const license = useLicense();
    const [isBannerDismissed, setIsBannerDismissed] = useState(false);
    const [showManual, setShowManual] = useState(false);

    // Konami "yumi" sequence — discreet dev reset trigger. Type the four
    // letters in order, anywhere in the app, to surface a reset button
    // for ten seconds. Production users never see it.
    useEffect(() => {
        let buffer = '';
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            clearTimeout(timeout);
            buffer += e.key.toLowerCase();
            if (buffer.endsWith('yumi')) {
                setShowManual(true);
                setTimeout(() => setShowManual(false), 10000);
                buffer = '';
            }
            timeout = setTimeout(() => { buffer = ''; }, 2000);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    if (license.isLicensed === null) return <LoadingScreen />;

    if (license.isClockFraud) {
        return <ClockFraudScreen machineId={license.machineId} onRetry={() => window.location.reload()} />;
    }
    if (license.isRevoked) {
        return <BannedScreen machineId={license.machineId} />;
    }
    if (license.isSyncRequired) {
        return (
            <SyncRequiredScreen
                isValidating={license.isValidating}
                syncError={license.syncError}
                onSync={async () => {
                    license.setSyncError(false);
                    const synced = await license.verifyWithHub();
                    if (synced) window.location.reload();
                    else license.setSyncError(true);
                }}
            />
        );
    }
    if (license.isExpired) {
        return (
            <ExpiredScreen
                machineId={license.machineId}
                showManual={showManual}
                isValidating={license.isValidating}
                onSync={async () => { await license.verifyWithHub(); }}
                onReset={async () => { await invoke('save_license_key', { key: '' }); window.location.reload(); }}
            />
        );
    }
    if (!license.isLicensed) {
        return (
            <ActivationScreen
                machineId={license.machineId}
                isValidating={license.isValidating}
                onActivate={license.activateLicense}
            />
        );
    }

    // Licensed — render children with overlay notifications + Konami reset.
    return (
        <>
            {license.isSyncWarning && !isBannerDismissed && (
                <SyncWarning onDismiss={() => setIsBannerDismissed(true)} />
            )}
            {license.activeNotif && (
                <HubNotification notification={license.activeNotif} onDismiss={license.dismissNotification} />
            )}
            {showManual && (
                <button
                    className="lg-dev-reset"
                    onClick={async () => { await invoke('save_license_key', { key: '' }); window.location.reload(); }}
                >
                    Reset licence
                </button>
            )}
            {children}
        </>
    );
};
