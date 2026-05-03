import { AlertTriangle, X } from 'lucide-react';

interface Props {
    onDismiss: () => void;
}

export const SyncWarning = ({ onDismiss }: Props) => (
    <div className="lg-sync-warning" role="status">
        <div className="lg-sync-warning-icon">
            <AlertTriangle />
        </div>
        <p className="lg-sync-warning-text">
            <strong>Synchronisation</strong> requise dans moins de 24 h
        </p>
        <button
            className="lg-sync-warning-close"
            onClick={onDismiss}
            aria-label="Fermer"
            title="Fermer"
        >
            <X />
        </button>
    </div>
);
