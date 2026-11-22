import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://huacnlee.github.io',
  base: process.env.BASE_PATH ?? '/pobt',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  // The site's own tsconfig: Vite would otherwise find the app's one directory up, which extends .nsh/tsconfig.json,
  // a file `nsh check` generates and git ignores.
  vite: { tsconfig: 'tsconfig.json' },
});
