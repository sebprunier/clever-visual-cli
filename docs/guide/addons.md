# Add-ons

Add-ons sit in the home list beside the applications, and each one has a page, as an application does. The page reads what clever-tools tells about it (`clever addon env`, `clever logs --addon`, `clever database backups`, `clever config-provider`, `clever keycloak`, `clever otoroshi`), with a few extras where a screen helps: browsing a Cellar bucket, editing a configuration provider as a draft, the restore commands of a backup.

Some families get more than the common page: [databases](#databases), [Elasticsearch](#elasticsearch), [configuration providers](#configuration-providers), [Cellar](#cellar) and the [Keycloak and Otoroshi operators](#operators). Creating or deleting an add-on, or changing its plan, stays with the Console and clever-tools; renaming one is done from its page.

## State in the home list {#state}

The Clever Cloud API gives no state for an add-on. clever-visual-cli reads it from its instances, a few add-ons at a time after the home list shows:

| State     | When                                         |
| --------- | -------------------------------------------- |
| running   | an instance is up                            |
| starting  | an instance boots, starts or deploys         |
| migrating | an instance migrates, after a change of plan |
| stopped   | no instance is up                            |
| shared    | the add-on has no instance of its own        |

A **shared** plan (a shared database plan, Cellar, a configuration provider…) has no dedicated instance, so no state to follow: the cell reads "shared", muted, and the filter `is:shared` lists these add-ons. That only changes with the plan, so the fact is kept a day in this browser and the add-on is not asked again meanwhile. An [operator](#operators) takes the state of the application it runs on.

On the same row, the **Links** column shows the logos of the applications linked to the add-on, each opening its page, or "not linked"; the **Activity** column reads "—", add-ons having no deployments. The "To watch" card of the home page lists the [databases on a version Clever Cloud no longer offers](#databases) and the [operators with an update out](#operators). See the [organisation home](/guide/organisation-home).

## The add-on page {#page}

The header gives the provider logo, the name, and the state icon (or "shared"). The small **?** beside the name opens the section of this documentation about this kind of add-on.

The pencil right after the name opens "Rename the add-on" (also in the palette, under "Actions"): one field, with the equivalent `clever addon rename <addon_id> <new name> --org <owner_id>`. **Rename** stays disabled while the name is empty or unchanged; only the display name changes, the add-on and its variables stay as they are. The add-on of the [views sync](/guide/views-sync) cannot be renamed: the sync finds it by its name.

The tags sit under the name and are edited from the pencil, as on an [application page](/guide/application#tags), through `clever curl` calls since clever-tools has no tag command. For grouping, an add-on also takes the `key:value` tags of its linked applications, for every key it has no tag of its own: they show dashed, and their tooltip names the applications to edit them on.

The tabs depend on the add-on: **Overview**, **Buckets** (Cellar), **Variables**, **Logs** (a dedicated plan), **Backups** (databases and Elasticsearch).

The list you came from stays beside the page, as on an [application page](/guide/application#list), and goes from add-ons to applications and back.

### Overview

The band:

- **State**: the state icon and its word, "shared" for a shared plan.
- **Plan**.
- **Instances**: the dedicated instances by size (`1 × XS`), "—" without any.
- **Cost (excl. tax)**: **Show the cost** loads the costs of the organisation; then yesterday and the last 30 days of this add-on, as the billing computed them. It needs billing rights on the organisation.
- **Linked applications**: how many.

Below:

- **Instances**: each instance with its size (CPUs and memory), its state and its age. A shared plan says "Shared plan: the add-on has no dedicated instance, so no state or logs to follow."
- **Linked applications**: each with its state icon, opening its page. They come from the links the home page knows for this organisation.
- **Details**: provider, plan, zone, creation date.
- **Identifiers**: the add-on id (`addon_…`) and its real id (`postgresql_…`, `cellar_…`…), each copied in one click, and **Open in the Console ↗**.

### Variables

The **Variables** tab lists what the add-on exposes to the applications linked to it (`clever addon env <addon_id>`), values hidden until asked for.

- **Show the values** / **Hide the values** reveals or hides them.
- **Copy**, on each variable, copies its value.
- **Copy as .env** copies the list as a `.env` file.
- **Refresh** reads them again.

This is where the passwords of a database are: the overview never shows them. A [configuration provider](#configuration-providers) is edited in this tab too.

### Logs

A dedicated add-on has a **Logs** tab: its live logs (`clever logs --addon <addon_id> --since 15m`), with the same replay window, **Filter lines…**, **Follow**, pause, stop and clear as the [logs of an application](/guide/application#logs). Its lines are not coloured by severity.

A shared plan has no instance of its own, so no logs either: the tab is not offered. An operator has none either: its logs are those of its entrypoint application.

## Databases {#databases}

![The overview of a PostgreSQL add-on](/screenshots/addon-database.png)

PostgreSQL, MySQL, Redis and MongoDB add-ons get a card of their own on the overview:

- **Version**, flagged "outdated" when Clever Cloud no longer offers it for a new database, with the versions it does offer ("Clever Cloud offers 13 to 18 for a new database."). Versions are compared at the precision of the offered list.
- **Host**, **Port** and **Database**, each copied in one click. Never the password: it stays in the [Variables](#variables) tab. Redis has no host nor database name in these details: the card then says "The host is in the Variables tab."
- **Options chosen at creation**, as greyed checkboxes with their names, as the provider reports them: **Encryption at rest** (`encryption`), **Direct host only** (`direct-host-only`), **Daily backups** (`do-backup`), **Binary log off** (`skip-log-bin`, MySQL). They are set with `clever addon create --option <name>=true`; clever-tools has no command to change them afterwards.

A database on an outdated version also shows in the "To watch" card of the home page, as "outdated" with, for instance, "PostgreSQL 11; Clever Cloud offers 13 to 18". The home page reads the versions after the list; each one is kept a day in this browser, so a reload asks nothing.

### Backups {#backups}

![The Backups tab of a database](/screenshots/addon-backups.png)

The **Backups** tab lists the backups of the database (`clever database backups <addon_id>`): "One backup a day, kept a few days. Download links last two hours: the list reloads before they expire."

| Column      | What it shows                            |
| ----------- | ---------------------------------------- |
| **Taken**   | the date of the backup                   |
| **Deleted** | when Clever Cloud deletes it, or "never" |
| **File**    | its file name                            |

Each backup has **Download**, and **Restore…** (PostgreSQL, MySQL) or **Retrieve…** (Redis, MongoDB), which shows what comes next for that backup. Nothing is restored from the page: restoring writes into the database the applications use, so the commands are yours to run.

For PostgreSQL and MySQL, "Restore the backup of &lt;date&gt;":

1. "Download it":

   ```sh
   clever database backups download <addon_id> <backup_id> --output <file>
   ```

2. "Load it into the database", with the host, port, user and database of the add-on filled in:

   ```sh
   # PostgreSQL
   pg_restore -h <host> -p <port> -U <user> -d <database> --no-owner --no-privileges --no-comments --format=c <file>
   # MySQL
   gunzip -c <file> | mysql -h <host> -P <port> -u <user> -p -D <database>
   ```

   The command asks for the password: `POSTGRESQL_ADDON_PASSWORD` or `MYSQL_ADDON_PASSWORD`, in the Variables tab.

For Redis, "Retrieve the backup of &lt;date&gt;": download it, then `tar -xzf <file>`. "The archive holds the .rdb and .aof files: run redis-server in their folder to read the data. Clever Cloud documents no restore into the add-on."

For MongoDB, the download only: "The mongorestore command to use is in the add-on dashboard, in the Console (Backup panel)."

A shared MySQL or MongoDB plan takes no backup: "No backup: this shared plan takes none." A shared PostgreSQL plan has its backups.

Past 20 backups, the most recent show first, and **Show the … older ones** lists the rest. [Elasticsearch](#elasticsearch) keeps snapshots instead, in the same tab.

## Elasticsearch {#elasticsearch}

An Elasticsearch add-on gets the same card as a database: its version (flagged when outdated, and listed in "To watch" then), its host, and the options chosen at creation, Kibana and APM among them. When Kibana or APM is enabled, the card adds it: **Open Kibana ↗** (or **Open APM ↗**), and the application of the organisation that runs it, with its state icon, opening its page.

Its **Backups** tab lists snapshots: "One snapshot a day, kept a few days unless it has no deletion date; each one restores with the command the API gives."

- The **Snapshot** column gives the name of each snapshot, and **See in Kibana ↗** opens it there when the add-on runs Kibana.
- **Restore…** shows the `curl` command the API gives for that snapshot; it asks for the password, `ES_ADDON_PASSWORD`, in the Variables tab. "Elasticsearch does not restore over an open index that already exists: close or delete it first."
- An add-on can keep hundreds of snapshots, and the API then takes a while: the tab says so while it loads, and shows the 20 most recent first.

## Configuration providers {#configuration-providers}

A configuration provider holds variables for the applications linked to it. Its **Variables** tab shows them (`clever config-provider get <addon_id>`), and **Edit** turns the list into a draft:

- change a name or a value in place, strike a variable out with **Delete** (**Keep** brings it back), add one with **+ Add a variable**;
- **Paste a .env**, then **Merge**: "A name already listed takes the new value.";
- invalid or duplicated names are flagged: letters, digits and `_`, not starting with a digit.

Beside the draft, "What changes" counts what is added, changed and removed, and gives "The same, one variable at a time:", the clever-tools commands that would do it:

```sh
clever config-provider set <addon_id> <NAME> <value>
clever config-provider rm <addon_id> <NAME>
```

It also names the applications that will be redeployed: "Clever Cloud will redeploy the 2 linked applications: …", or "No linked application: nothing is redeployed."

**Apply** writes the whole list in one go, after checking nobody changed it since you started editing. If someone did, nothing is written: "The variables changed since the editing started: nothing was written. Cancel, then start again from the current ones." Once written, the notification offers **Undo**, which writes the previous list back (and redeploys the linked applications again), unless the variables changed since.

::: info Redeployment
"The linked applications receive these variables; one set on an application wins. A change makes Clever Cloud redeploy them." Unlike the variables of an application, which wait for its next deployment, a change here makes Clever Cloud redeploy every linked application by itself.
:::

The favourite views of clever-visual-cli sync through a configuration provider of your personal space named `clever-visual-cli`: see [views sync](/guide/views-sync).

## Cellar {#cellar}

![The Buckets tab of a Cellar add-on](/screenshots/addon-cellar.png)

A Cellar add-on gets a card on its overview with its **Buckets**, **Objects**, total **Size** and **Traffic this period** (in and out), and a **Browse the buckets** link.

The **Buckets** tab lists the buckets with their objects, size and last write; a click on one browses it like a file browser:

- the path at the top, from **Buckets** down to the open folder, each step above it a link;
- the folders first, then the files with their size and last write, 100 entries at a time, **Load more** for the next ones;
- the number of objects and size of the bucket, and its versioning status (versioning on, versioning suspended, no versioning);
- **Download** on a file: the download URL is signed only when you click, then opens in a new tab.

The open bucket and folder live in the URL (`?bucket=…&prefix=…`), so the browser's back button and a shared link work.

Everything goes through the Clever Cloud API: no S3 credentials needed, and nothing is changed. clever-tools has no Cellar command, so the tab shows the `clever curl` call of what you see:

```sh
clever curl https://api.clever-cloud.com/v4/cellar/organisations/<orga_id>/cellar/<cellar_id>/buckets
clever curl 'https://api.clever-cloud.com/v4/cellar/organisations/<orga_id>/cellar/<cellar_id>/buckets/<bucket>/objects?prefix=<folder>'
```

## Operators {#operators}

Keycloak and Otoroshi are operators: Clever Cloud runs them as an application of the organisation, their entrypoint, on top of other add-ons. An operator has no add-on instance of its own, yet nothing shared either:

- its state, in the home list and on its page, is the state of its entrypoint application;
- the **Instances** fact of the band names that application, linking to it: its instances and its logs are on its page. The operator page has no Instances card and no Logs tab.

The operator card, with `clever keycloak get <addon_id>` (or `clever otoroshi get <addon_id>`) under its title:

- **Version**, with its Java version, and "… is out" when an update is out.
- **Access**: links to open it, and for Otoroshi its **Admin API** and **Swagger UI**.
- **Network group**: its id, or "none".
- **Built on**: the entrypoint application, with its state, and the add-ons underneath, each opening its page.
- Two notes: "Experimental clever-tools commands: `clever features enable operators` once.", and "The initial credentials are in the Console, or in the command above with --format json." The page does not show them.

::: warning Experimental commands
In clever-tools 5.2, the `clever keycloak` and `clever otoroshi` commands are experimental: run `clever features enable operators` once before using them.
:::

### Version and updates

An operator with a newer release out shows in the "To watch" card of the home page, as "update" with, for instance, "Keycloak 26.7.2; 26.8.0 is out". The home page reads the version checks after the list; each one is kept a day in this browser.

An operator installed as `latest` (its entrypoint application's `CC_KEYCLOAK_VERSION` or `CC_OTOROSHI_VERSION`) takes the latest release at each build, so it is never called behind, whatever the version check says: the card reads "the latest release at each build (… today)", and "To watch" leaves it out.

### Restart, rebuild, update

The buttons of the card open a dialog that shows the clever-tools equivalent before you confirm:

| Button       | Dialog                                                                                                                                             | clever-tools                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Restart…** | "Restarts the instance without touching its data."                                                                                                 | `clever keycloak restart <addon_id>`                           |
| **Rebuild…** | "Rebuilds the instance from scratch, keeping its data: slower than a restart, but it also picks up the platform’s changes. Unavailable meanwhile." | `clever keycloak rebuild <addon_id>`                           |
| **Update…**  | "The instance is rebuilt on the chosen version, keeping its data. Unavailable meanwhile." A **Version** list, the latest preselected.              | `clever keycloak version update <addon_id> --target <version>` |

For Otoroshi, read `clever otoroshi` for `clever keycloak`. **Update…** shows when the version check lists versions, highlighted when an update is out.

### otoroshictl

An Otoroshi also gets a card for [otoroshictl](https://github.com/cloud-apim/otoroshictl), the Otoroshi CLI by Cloud APIM, which drives the admin API from a terminal. It gives the commands that add this Otoroshi to it, through `clever otoroshi get-config`:

```sh
cargo install otoroshictl
clever features enable operators
clever otoroshi get-config <addon_id> | otoroshictl config import --current --stdin
otoroshictl resources get routes
```
