import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';

const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@chromatic-com/storybook', '@storybook/addon-vitest', '@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: '@storybook/react-vite',
  staticDirs: [
    { from: '../icons', to: '/icons' },
    { from: '../images', to: '/images' },
  ],
  async viteFinal(config) {
    config.optimizeDeps ??= {};
    const include = Array.isArray(config.optimizeDeps.include) ? config.optimizeDeps.include : [];
    config.optimizeDeps.include = Array.from(
      new Set([
        ...include,
        'date-fns',
        'react-dom',
        'react-dom/client',
        '@base-ui/react/button',
        '@base-ui/react/field',
        '@base-ui/react/form',
        '@base-ui/react/fieldset',
        '@base-ui/react/input',
        '@base-ui/react/radio',
        '@base-ui/react/radio-group',
        '@base-ui/react/toast',
      ]),
    );

    config.resolve ??= {};
    const alias = config.resolve.alias;
    const replacement = path.join(dirname, '..', 'src');
    if (Array.isArray(alias)) {
      alias.push({ find: '@', replacement });
    } else {
      config.resolve.alias = { ...(alias ?? {}), '@': replacement };
    }
    return config;
  },
};
export default config;
