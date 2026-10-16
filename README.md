# clever-visual-cli

Une console Clever Cloud alternative, 100 % front, sans backend.

L'idée : garder le vocabulaire et la logique du CLI officiel ([clever-tools](https://github.com/CleverCloud/clever-tools)), mais dans une interface web pensée pour l'usage quotidien, avec une command palette au centre. Chaque écran affiche la commande `clever` équivalente.

> Projet communautaire, non affilié à Clever Cloud. Statut : **phase 2, lecture et actions, accueil repensé (prototype UX)**.

## Pourquoi pas le CLI lui-même ?

Les commandes de clever-tools sont liées à Node (parsing d'arguments, système de fichiers, git, prompts). En revanche, toute la logique API vit dans [`@clevercloud/client`](https://github.com/CleverCloud/clever-client.js), la bibliothèque sur laquelle le CLI et la Console officielle sont construits. Elle tourne dans le navigateur et expose un client "command pattern" qui gère nativement :

- l'auth par **token API** (Bearer, via `api-bridge.clever-cloud.com`),
- l'auth **OAuth v1** (le couple token/secret que `clever login` stocke),
- les streams de logs en Server-Sent Events avec reconnexion,
- un cache des identifiants de ressources en `localStorage`.

Les API de Clever Cloud renvoient des en-têtes CORS pour n'importe quelle origine, donc une page statique peut leur parler directement.

Piège rencontré : le client envoie ses `fetch` en `mode: 'same-origin'` par défaut, ce qu'un navigateur refuse pour une URL cross-origin. Il faut passer `defaultRequestConfig: { isCorsEnabled: true }` à `CcApiClient` (voir `src/core/clever-client.ts`).

## Décisions

| Sujet   | Choix                                                                           |
| ------- | ------------------------------------------------------------------------------- |
| Stack   | Vite, TypeScript, Lit                                                           |
| UI      | 100 % maison, pas de réutilisation des composants de la Console                 |
| Backend | Aucun. Site statique, routage par `#` pour tourner sur n'importe quel hébergeur |
| Licence | À choisir avant la première publication                                         |

## Ce que fait l'application aujourd'hui

- Connexion par token API, via la Console (le parcours `clever login` dans une popup) ou avec un couple token/secret OAuth.
- Plusieurs comptes, stockés chiffrés dans le navigateur ou seulement pour l'onglet.
- Command palette (`⌘K` / `Ctrl+K`) : applications de toutes les organisations, organisations, onglets de la page courante, actions de session.
- Accueil d’une organisation : liste dense des applications et add-ons, recherche avec filtres (`tag:`, `project:`, `env:`, `runtime:`, `state:`, `is:`), regroupement par stack (liens applications ↔ add-ons), projet, runtime ou état, bandeau « À surveiller » (déploiements échoués ou en cours), applications ouvertes récemment, dernier déploiement de chaque application en distinguant l’activité humaine de la maintenance plateforme.
- Page application : vue d'ensemble, instances, déploiements, variables d'environnement (valeurs masquées, copie, export `.env`), logs en direct avec filtre, pause et fenêtre de rejeu.
- Actions, depuis la palette ou les boutons de la page : redémarrer, arrêter, annuler un déploiement, scaler, définir, supprimer ou importer des variables, ajouter, supprimer ou choisir le domaine principal. Chaque dialogue affiche en direct la commande `clever` équivalente.

## Lancer

```sh
pnpm install
pnpm dev            # http://localhost:5173
pnpm dev:cli        # idem, avec un bouton de connexion qui lit le profil clever-tools de la machine
pnpm test           # tests unitaires (chiffrement, routeur, palette)
pnpm typecheck
pnpm build          # site statique dans dist/
pnpm spike:node     # vérification de @clevercloud/client côté Node, sans navigateur
```

`pnpm dev:cli` active un middleware Vite qui sert le premier profil de `~/.config/clever-cloud/clever-tools.json` sur `/__cvc/dev-profile`. C'est un confort de développement, jamais inclus dans le build, à n'activer que sur une machine de confiance.

## Identifiants et sécurité

- **Coffre chiffré** : les tokens sont chiffrés en AES-256-GCM avec une clé dérivée d'une phrase de passe par PBKDF2-SHA256 (600 000 itérations), et stockés en `localStorage`. Pour ne pas redemander la phrase à chaque rechargement, la clé brute est gardée en `sessionStorage` tant que l'onglet est ouvert ; "Verrouiller" l'efface.
- **Session seulement** : JSON en clair en `sessionStorage`, disparaît avec l'onglet.
- **Données d’accueil, non sensibles** : les liens applications ↔ add-ons (`cvc.links.*`), les préférences d’affichage par organisation (`cvc.home.*`) et les applications ouvertes récemment (`cvc.recents`) restent en `localStorage` ; « Tout effacer de ce navigateur » les supprime aussi.
- Modèle de menace : le fichier de configuration de clever-tools est en clair sur disque. Une SPA statique sans script tiers n'est pas plus exposée. Le risque réel est une XSS via du contenu affiché (logs, noms, variables), d'où Lit (échappement par défaut), jamais d'`innerHTML`, et une CSP stricte en production (à venir avec le déploiement).
- La clé de consumer OAuth embarquée est celle de clever-tools, publique par conception (voir `src/core/constants.ts`).
- Rien ne part ailleurs que vers `api.clever-cloud.com`, `api-bridge.clever-cloud.com` et `console.clever-cloud.com`.

## Déploiement

Le site est publié sur GitHub Pages à chaque push sur `main` par le workflow `.github/workflows/deploy.yml` (typecheck, tests, build, publication) : <https://sebprunier.github.io/clever-visual-cli/>.

- `CVC_BASE=/clever-visual-cli/` au build fixe le chemin de base ; sans cette variable le build vise la racine d'un hébergeur quelconque (Clever Cloud static, par exemple).
- Le build de production injecte une Content Security Policy en balise `meta` : scripts et styles depuis le site uniquement, réseau limité aux API Clever Cloud, images depuis n'importe quelle origine https pour les logos.
- À savoir : toutes les pages d'un même compte GitHub partagent l'origine `sebprunier.github.io`, donc le `localStorage` du coffre est visible par les autres projets publiés sous ce compte. Le coffre y est chiffré, mais un domaine personnalisé donne une origine isolée.

## Ce qui ne marchera pas sans backend

- `clever deploy` (git push), `clever ssh`, accès direct aux bases.
- Contournements : redéployer le dernier commit, apps liées à GitHub, afficher la commande CLI à lancer localement.

## Organisation du code

```
src/core/      vault (chiffrement, profils), session, routeur, modèle de palette, actions, flow Console
src/data/      le seul module qui importe les commandes de @clevercloud/client
src/ui/        composants Lit : shell, login, déverrouillage, palette, pages
scripts/       vérifications hors navigateur
```

## Feuille de route

| Phase | Contenu                                                                                        | État    |
| ----- | ---------------------------------------------------------------------------------------------- | ------- |
| 0     | Spike : auth, orgas, apps, logs en direct                                                      | fait    |
| 1     | MVP lecture : coffre chiffré, multi-comptes, page application, palette                         | fait    |
| 2     | Actions : restart, stop, redeploy, cancel, scale, env, domaines, avec l'équivalent CLI affiché | fait    |
| 3     | Confort : PWA, raccourcis, favoris, fr/en, CSP, déploiement statique sur Clever Cloud          | à venir |
| 4     | Add-ons, backups, drains, network groups, tokens API, k8s                                      | à venir |

## Licence

[Apache-2.0](./LICENSE). Copyright 2026 Sébastien Prunier.
