---
layout: home

hero:
  name: clever-visual-cli
  text: A visual interface of clever-tools, with a few extras
  tagline: Not a new Console. A static page that lays the clever-tools commands out on screen; everything happens between your browser and the Clever Cloud APIs.
  image:
    src: /logo.svg
    alt: ''
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Open clever-visual-cli
      link: https://sebprunier.github.io/clever-visual-cli/

features:
  - title: Organisation home
    details: Every application and add-on of an organisation in one dense list. Filter and group with expressions such as <code>-is:addon</code> or <code>project &gt; env(prod,dev)</code>, sort by any column, and save the result as a favourite view.
    link: /guide/organisation-home
    linkText: The organisation home
  - title: Costs, with export
    details: Yesterday, the last 30 days, the latest invoice or the current configuration, per group and sub-group of the list. Export what you see as CSV or JSON, or copy it as Markdown, all built in the browser.
    link: /guide/organisation-home
    linkText: Costs of a list
  - title: Application and add-on pages
    details: Overview, domains, activity, variables, dependencies and logs of an application; databases and their backups, Cellar buckets, configuration providers, Keycloak and Otoroshi operators.
    link: /guide/application
    linkText: The application page
  - title: Logs, followed live
    details: The logs of an application, of one of its deployments, or of several applications side by side. A restart opens the logs of the deployment it started and follows it until it ends.
    link: /guide/logs
    linkText: Logs of several applications
  - title: Every screen names its command
    details: The <code>clever</code> command a screen stands for is shown with the real identifiers, one click to copy, checked against clever-tools 5.2.0. Using the interface teaches the CLI along the way.
    link: /guide/introduction
    linkText: The principles
  - title: Front-end only
    details: A static page without a backend. Your API token stays in your browser, encrypted under a passphrase or kept for the tab only, and goes nowhere but the Clever Cloud API.
    link: /guide/security
    linkText: Security and privacy
---

## Who made it

clever-visual-cli is made by [Mathieu Ancelin](https://github.com/mathieuancelin) and [Sébastien Prunier](https://github.com/sebprunier), both [Clever Cloud ambassadors](https://www.clever.cloud/blog/company/2025/12/16/clever-cloud-ambassadors-building-the-program-together/) and long-time Clever Cloud users. It stands on [clever-tools](https://github.com/CleverCloud/clever-tools) and on the Clever Cloud APIs, well designed and well documented, through [`@clevercloud/client`](https://github.com/CleverCloud/clever-client.js), the library clever-tools is built on, which runs in a browser as it is. A community project, open source under the Apache-2.0 licence, not affiliated with Clever Cloud.
