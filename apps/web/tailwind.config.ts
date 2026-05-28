import type { Config } from 'tailwindcss';
import { baseTailwindConfig } from '../../packages/config/tailwind.config.base.js';

const config: Config = {
  ...baseTailwindConfig,
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
