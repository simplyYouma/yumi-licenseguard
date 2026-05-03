import { AlertTriangle, Megaphone, Bell, CheckCircle2, X } from 'lucide-react';
import type { Notification } from '../types';

interface Props {
    notification: Notification;
    onDismiss: () => void;
}

const VARIANT_CLASS: Record<Notification['type'], string> = {
    info:    'lg-notif--info',
    success: 'lg-notif--success',
    warning: 'lg-notif--warning',
    error:   'lg-notif--error',
};

export const HubNotification = ({ notification, onDismiss }: Props) => {
    const Icon =
        notification.type === 'error'   ? AlertTriangle :
        notification.type === 'warning' ? Megaphone     :
        notification.type === 'success' ? CheckCircle2  :
                                          Bell;

    return (
        <div className={`lg-notif ${VARIANT_CLASS[notification.type]}`} role="status">
            <div className="lg-notif-icon">
                <Icon />
            </div>
            <div className="lg-notif-body">
                <p className="lg-notif-title">{notification.title}</p>
                <p className="lg-notif-message">{notification.message}</p>
            </div>
            <button
                className="lg-notif-close"
                onClick={onDismiss}
                aria-label="Fermer"
                title="Fermer"
            >
                <X />
            </button>
        </div>
    );
};
