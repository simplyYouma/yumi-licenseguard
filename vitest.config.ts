import { defineConfig } from 'vitest/config';

/**
 * Les tests de la garde vivent dans `src/`, et NULLE PART AILLEURS.
 *
 * Ce paquet n'est pas compilé : les cinq POS en consomment la SOURCE, par tag
 * git. Il n'y a donc rien à « construire » — ce qui se vérifie ici, c'est que
 * les décisions prises par la garde sont les bonnes. Et la plus lourde de
 * conséquences est celle de `signalement.ts` : ne jamais dénoncer au Hub une
 * machine parfaitement légitime.
 */
export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
    },
});
