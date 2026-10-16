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

export default defineConfig({
  plugins: [devCliProfile()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
