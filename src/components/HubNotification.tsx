import { AlertTriangle, Megaphone, Bell, CheckCircle2, Gift, CalendarClock, MonitorDot, X } from 'lucide-react';
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
    /*
     * ═══ UNE IMAGE PAR SUJET, PAS UNE PAR COULEUR ═══
     *
     * Youma : « les notifs pour chaque type doivent avoir des icônes
     * sémantiques ». La catégorie dit le SUJET — une option qui arrive, une
     * licence qui approche de son terme, un poste qui ne travaille plus, un
     * mot de la maison. On la préfère donc toujours au `type`, qui ne dit
     * qu'une couleur et qui vaut « succès » pour presque tout.
     *
     * Le repli par type reste : un Hub plus ancien n'envoie pas de
     * catégorie, et une notification sans image serait pire qu'une image
     * générique.
     */
    const Icon =
        notification.categorie === 'annonce'    ? Gift          :
        notification.categorie === 'expiration' ? CalendarClock :
        notification.categorie === 'poste'      ? MonitorDot    :
        notification.categorie === 'manuelle'   ? Megaphone     :
        notification.type === 'error'           ? AlertTriangle :
        notification.type === 'warning'         ? Megaphone     :
        notification.type === 'success'         ? CheckCircle2  :
                                                  Bell;

    return (
        <div className={`lg-notif ${VARIANT_CLASS[notification.type]}`} role="status">
            <div className="lg-notif-icon">
                <Icon />
            </div>
            <div className="lg-notif-body">
                <p className="lg-notif-title">{notification.title}</p>
                {/* `pre-line` : les messages du Hub sont écrits pour être LUS
                    par un commerçant, et les plus importants — l'arrivée d'une
                    option qu'il vient de payer — tiennent en deux temps : ce
                    qu'il peut faire maintenant, puis où le trouver. Sans cela,
                    les deux se collent en un pavé que personne ne finit. */}
                <p className="lg-notif-message" style={{ whiteSpace: 'pre-line' }}>
                    {notification.message}
                </p>
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
