import React from 'react';
import { AlertTriangle, Megaphone, Bell, X } from 'lucide-react';
import type { Notification } from '../types';

interface Props {
    notification: Notification;
    onDismiss: () => void;
}

export const HubNotification: React.FC<Props> = ({ notification, onDismiss }) => {
    return (
        <div className="fixed bottom-10 left-10 z-[200] w-full max-w-sm px-4 animate-in slide-in-from-left-10 duration-700 font-outfit">
            <div className={`bg-white/90 backdrop-blur-2xl border-2 rounded-[2.5rem] p-8 shadow-2xl flex items-start gap-5 relative overflow-hidden ${
                notification.type === 'error' ? 'border-red-500/20' : 
                notification.type === 'warning' ? 'border-amber-500/20' : 'border-slate-200'
            }`}>
                <div className={`absolute -top-10 -right-10 w-32 h-32 blur-[50px] opacity-20 rounded-full ${
                        notification.type === 'error' ? 'bg-red-500' : 
                        notification.type === 'warning' ? 'bg-amber-500' : 'bg-slate-500'
                }`} />

                <div className={`w-14 h-14 rounded-3xl flex items-center justify-center shrink-0 shadow-xl ${
                        notification.type === 'error' ? 'bg-red-500 text-white' : 
                        notification.type === 'warning' ? 'bg-amber-500 text-white' : 'text-white'
                }`} style={{ backgroundColor: (notification.type !== 'error' && notification.type !== 'warning') ? 'var(--yumi-primary)' : undefined }}>
                        {notification.type === 'error' ? <AlertTriangle size={24} /> : 
                        notification.type === 'warning' ? <Megaphone size={24} /> : <Bell size={24} />}
                </div>

                <div className="flex-1 min-w-0">
                    <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-1 pr-8 leading-tight">{notification.title}</h2>
                    <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                        {notification.message}
                    </p>
                </div>

                <button onClick={onDismiss} className="absolute top-6 right-6 p-2 text-slate-300 hover:text-slate-900 transition-colors">
                    <X size={16} />
                </button>
            </div>
        </div>
    );
};
