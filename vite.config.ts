import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Dev-only helper, opt-in with `CVC_DEV_PROFILE=1` (see `pnpm dev:cli`):
 * serves the first clever-tools profile of this machine on
 * `/__cvc/dev-profile` so the login page can offer a one-click sign-in with
 * the same credentials the CLI uses. Never part of the build.
 */
function devCliProfile(): Plugin {
  return {
    name: 'cvc-dev-cli-profile',
    apply: 'serve',
    configureServer(server) {
      if (process.env.CVC_DEV_PROFILE !== '1') {
        return;
      }
      server.middlewares.use('/__cvc/dev-profile', async (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/json');
        try {
          const configPath = path.join(homedir(), '.config', 'clever-cloud', 'clever-tools.json');
          const config = JSON.parse(await readFile(configPath, 'utf8'));
          const profile = config.profiles?.[0] ?? config;
          if (typeof profile?.token !== 'string' || typeof profile?.secret !== 'string') {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'no clever-tools profile found' }));
            return;
          }
          res.end(
            JSON.stringify({
              alias: profile.alias ?? 'default',
              email: profile.email,
              credentials: { type: 'oauth-v1', token: profile.token, secret: profile.secret },
            }),
          );
        } catch (error) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: String(error) }));
        }
      });
    },
  };
}

/**
 * Content Security Policy for the production build, as a meta tag because
 * static hosts such as GitHub Pages send no custom headers. Scripts and
 * styles only from the site itself (Lit uses constructable stylesheets, so no
 * inline style is needed), network only to the Clever Cloud APIs, logos from
 * any https origin. The dev server stays unrestricted because Vite's HMR
 * injects inline styles.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' https: data:",
  "font-src 'self'",
  "connect-src 'self' https://api.clever-cloud.com https://api-bridge.clever-cloud.com https://www.clevercloudstatus.com",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function productionCsp(): Plugin {
  return {
    name: 'cvc-production-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the site under /clever-visual-cli/ ; other hosts at the root.
  base: process.env.CVC_BASE ?? '/',
  plugins: [devCliProfile(), productionCsp()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The theme test reads the stylesheet's fallback palette.
    css: { include: [/index\.css/] },
  },
});
