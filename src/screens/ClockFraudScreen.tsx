import React from 'react';
import { ShieldAlert } from 'lucide-react';

interface Props {
    machineId: string;
    onRetry: () => void;
}

export const ClockFraudScreen: React.FC<Props> = ({ machineId, onRetry }) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900 font-outfit px-4 text-slate-900">
            <div className="bg-white p-12 rounded-[40px] shadow-2xl max-w-md w-full text-center border-b-8 border-rose-600 animate-in zoom-in duration-500">
                <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse text-rose-600 border border-rose-100">
                        <ShieldAlert className="w-10 h-10" />
                </div>
                <h2 className="text-3xl font-black mb-4 tracking-tight uppercase">Fraude Horloge</h2>
                <p className="text-sm text-slate-400 mb-8 leading-relaxed font-medium">
                    Une anomalie d'horloge système a été détectée. 
                    Synchronisez l'heure de Windows sur l'heure réelle pour continuer.
                </p>
                <div className="bg-slate-50 p-4 rounded-2xl mb-8 border border-slate-100/50">
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Terminal ID</p>
                        <p className="text-xs font-mono font-bold text-slate-600">{machineId}</p>
                </div>
                <button onClick={onRetry} className="w-full bg-slate-900 text-white font-black py-5 rounded-3xl hover:bg-slate-800 transition-all uppercase tracking-[0.2em] text-xs shadow-xl active:scale-95">RÉ-INITIATION</button>
            </div>
        </div>
    );
};
