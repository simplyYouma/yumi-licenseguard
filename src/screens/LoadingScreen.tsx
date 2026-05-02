import { Loader2 } from 'lucide-react';
import { guardTheme } from '../theme';

export const LoadingScreen = () => (
    <div
        className="fixed inset-0 z-[200] flex items-center justify-center"
        style={{ backgroundColor: '#F4F1EA', fontFamily: guardTheme.fonts.sans }}
    >
        <div className="flex items-center gap-3 text-neutral-500">
            <Loader2 size={16} className="animate-spin" style={{ color: guardTheme.colors.primary }} />
            <span className="text-[12px]">Initialisation…</span>
        </div>
    </div>
);
