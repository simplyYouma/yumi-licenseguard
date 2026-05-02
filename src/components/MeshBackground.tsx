import React from 'react';

export const MeshBackground: React.FC = () => {
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0 bg-white">
            {/* Soft Ambient Mesh — Tinted with var(--yumi-primary) */}
            <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] blur-[120px] rounded-full opacity-10 animate-pulse" 
                 style={{ backgroundColor: 'var(--yumi-primary)' }} />
            <div className="absolute bottom-[-5%] right-[-5%] w-[50%] h-[50%] blur-[150px] rounded-full opacity-5 animate-pulse [animation-delay:2s]" 
                 style={{ backgroundColor: 'var(--yumi-primary)' }} />
            <div className="absolute top-[20%] right-[10%] w-[40%] h-[40%] blur-[100px] rounded-full opacity-5 animate-pulse [animation-delay:4s]" 
                 style={{ backgroundColor: 'var(--yumi-primary)' }} />
            
            {/* Grain Texture Overlay */}
            <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none" 
                 style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}>
            </div>
            
            {/* Subtle Grid — Stronger Visibility */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,%23e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,%23e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_100%_100%_at_50%_50%,%23000_30%,transparent_100%)] opacity-[0.15]" />
        </div>
    );
};
