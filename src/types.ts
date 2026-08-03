import type { AvisInstallation } from './signalement';

export interface Notification {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    created_at: string;
}

export interface LicenseState {
    isLicensed: boolean | null;
    isRevoked: boolean;
    isExpired: boolean;
    isClockFraud: boolean;
    machineId: string;
    isSyncWarning: boolean;
    isSyncRequired: boolean;
    lastSyncDate: number | null;
    /** Fin de l'abonnement (ISO) — Hub `expiresAt`, sinon dérivée de la clé
        locale (partie hex avant le point). null si inconnue. */
    expiresAt: string | null;
    /**
     * Ce que le Hub a répondu au signalement de cette installation sans clé :
     * un message courtois à afficher, et/ou un écran fermé.
     *
     * `null` dans l'écrasante majorité des cas — machine rattachée à une
     * caisse, déjà signalée aujourd'hui, hors ligne, ou simplement rien à
     * dire. Voir `signalement.ts`.
     */
    avisInstallation: AvisInstallation | null;
}

export type { AvisInstallation } from './signalement';
