import { defineConfig } from 'vitepress';

/**
 * The user documentation of clever-visual-cli (#15), published beside the
 * interface on GitHub Pages under `/docs/`: built after the interface, with the
 * same `CVC_BASE`, into `dist/docs`.
 */
const appBase = process.env.CVC_BASE ?? '/';
/** The documentation of a snapshot (#27), built from main under /snapshot/docs/. */
const snapshot = process.env.CVC_CHANNEL === 'snapshot';
/** The interface the documentation describes, wherever the documentation is served from. */
const APP_URL = `https://sebprunier.github.io/clever-visual-cli/${snapshot ? 'snapshot/' : ''}`;
const REPOSITORY = 'https://github.com/sebprunier/clever-visual-cli';

export default defineConfig({
  lang: 'en-US',
  title: snapshot ? 'clever-visual-cli snapshot' : 'clever-visual-cli',
  description:
    'User documentation of clever-visual-cli, a visual interface of clever-tools with a few extras. Not a new Console.',
  base: `${appBase}docs/`,
  outDir: '../dist/docs',
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${appBase}docs/logo.svg` }]],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Reference', link: '/reference/filters' },
      { text: snapshot ? 'Open the snapshot' : 'Open clever-visual-cli', link: APP_URL },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Organisation home', link: '/guide/organisation-home' },
          { text: 'Application page', link: '/guide/application' },
          { text: 'Add-ons', link: '/guide/addons' },
          { text: 'Logs of several applications', link: '/guide/logs' },
          { text: 'Command palette and shortcuts', link: '/guide/palette' },
          { text: 'Views sync', link: '/guide/views-sync' },
          { text: 'Security and privacy', link: '/guide/security' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Filter expressions', link: '/reference/filters' },
          { text: 'Grouping expressions', link: '/reference/grouping' },
          { text: 'Troubleshooting', link: '/reference/troubleshooting' },
        ],
      },
    ],
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: REPOSITORY }],
    editLink: { pattern: `${REPOSITORY}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    footer: {
      message: 'Released under the Apache-2.0 licence.',
      copyright: 'Made by Mathieu Ancelin and Sébastien Prunier, Clever Cloud ambassadors.',
    },
  },
});
