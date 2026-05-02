import React from 'react';
import { MeshBackground } from '../components/MeshBackground';

export const LoadingScreen: React.FC = () => {
    return (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center font-sans" style={{ fontFamily: 'var(--yumi-font-sans)' }}>
             <MeshBackground />
             
             <div className="relative z-10 flex flex-col items-center">
                {/* Elegant Minimalist Spinner */}
                <div className="relative w-20 h-20">
                    <div className="absolute inset-0 border-2 border-slate-100 rounded-full" />
                    <div className="absolute inset-0 border-2 border-transparent border-t-slate-900 rounded-full animate-spin" 
                         style={{ borderTopColor: 'var(--yumi-primary)' }} />
                </div>
                
                <p className="mt-10 text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] animate-pulse">
                    Initialisation Sécurité
                </p>
             </div>
        </div>
    );
};
