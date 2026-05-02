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
}
