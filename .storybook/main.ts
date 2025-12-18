import type { StorybookConfig } from '@storybook/react-vite';

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
        '@base-ui/react/input',
        '@base-ui/react/toast',
      ]),
    );
    return config;
  },
};
export default config;
