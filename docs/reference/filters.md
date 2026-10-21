# Filter expressions

The **Filter** field of the [organisation home](/guide/organisation-home#filter) takes an expression, in the spirit of a command line. The list beside an application or add-on page reads the same expressions. The filter is part of the address of the page (`?q=`), so a bookmark or a shared link keeps it, and of a [favourite view](/guide/organisation-home#views).

Filtering is an extra of the interface: it runs in your browser, on the list the page loaded.

## At a glance {#summary}

| Term                 | Keeps                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------- |
| `word`               | resources whose name, runtime, tags or ids hold the word                               |
| `"two words"`        | resources that hold the words together, in this order                                  |
| `is:app`, `is:addon` | the applications, the add-ons                                                          |
| `is:<slug>`          | the applications of a runtime (`is:node`), the add-ons of a provider (`is:postgresql`) |
| `is:watch`           | what the "To watch" card lists                                                         |
| `is:shared`          | the add-ons on a shared plan                                                           |
| `key:value`          | what carries the tag `key:value`, or a tag that continues it, such as `key:value:…`    |
| `has:key`            | what carries a `key:…` tag, whatever its value                                         |
| `tag:text`           | what carries a tag that starts with the text                                           |
| `runtime:text`       | the runtime or provider holds the text                                                 |
| `state:text`         | the state, as the list shows it, holds the text                                        |
| `name:text`          | the name holds the text                                                                |
| `a b`, `a AND b`     | both                                                                                   |
| `a OR b`             | either                                                                                 |
| `NOT a`, `-a`        | everything but `a`                                                                     |
| `( … )`              | groups conditions                                                                      |

Case and accents never matter, in the terms or in the operators: `ENV:Prod`, `env:prod` and `and`, `AND` are the same. An empty field keeps everything.

## Free text {#free-text}

A word without a colon is free text. It keeps the resources where it appears anywhere in:

- the name;
- the runtime of an application (`Node.js`, `Java + Maven`…) or the provider of an add-on (`postgresql-addon`…);
- the tags;
- the id of an application, and the names of the add-ons linked to it;
- the id and the real id of an add-on (`addon_…`, `postgresql_…`).

So pasting an id finds its resource, and `meteo` keeps both the `meteo-api` application and the add-ons named `meteo-…`. A part of a word is enough: `bucket` finds `old-bucket`.

Several words must all match, each on its own: `shop api` keeps what holds `shop` and `api`, in any order.

## Kinds and runtimes: `is:` {#is}

| Term                                      | Keeps                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `is:app`, `is:application`                | the applications                                                                         |
| `is:addon`, `is:add-on`                   | the add-ons                                                                              |
| `is:watch`                                | the applications and add-ons of the ["To watch" card](/guide/organisation-home#to-watch) |
| `is:shared`                               | the add-ons on a shared plan, which have no instance of their own                        |
| `is:node`, `is:python`, `is:docker`…      | the applications of that runtime                                                         |
| `is:postgresql`, `is:redis`, `is:cellar`… | the add-ons of that provider                                                             |

For an application, `is:` reads the slugs Clever Cloud gives its runtime: its variant and its instance type. For an add-on, it reads its provider id, with and without `-addon`: `postgresql-addon` answers both `is:postgresql-addon` and `is:postgresql`. A slug only has to start with what you type: `is:postgres` and even `is:post` find the PostgreSQL add-ons.

`is:shared` knows an add-on is shared once its state has loaded.

To list the applications alone, take the add-ons out: `-is:addon`. That is the same as `is:app`.

## Tags {#tags}

Tags are free-form on Clever Cloud. Three kinds of terms read them.

### `key:value` {#key-value}

Any term with a colon whose key is not one of `is`, `has`, `tag`, `runtime`, `state` or `name` is a tag. `env:prod` keeps what carries the tag `env:prod`.

The value is matched whole, segment by segment: `project:shop` keeps the tags `project:shop` and `project:shop:prod`, but not `project:shopping`. A longer term narrows it: `project:shop:prod`.

A tag whose key is one of the reserved words, such as `name:legacy`, is found with `tag:`: `tag:name:legacy`.

### `has:` {#has}

`has:project` keeps what carries a tag that starts with `project:`, whatever comes after: `project:shop`, `project:blog:prod`… `-has:project` keeps what has none.

### `tag:` {#tag}

`tag:` keeps what carries a tag that starts with the text: `tag:legacy` finds the tag `legacy`, and `tag:env` finds `env:prod` as well as `envoy`. Use it for tags without a colon, or to match the start of a tag.

::: tip
The filter reads the tags of each resource itself. An add-on placed in a group through its linked applications ([inferred](/reference/grouping#inferred)) does not carry their tags: `env:prod` leaves out a database that has no `env` tag of its own.
:::

## Runtime, state and name {#fields}

| Term           | Keeps                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `runtime:text` | the runtime of an application (`Java + Maven`) or the provider of an add-on, or one of its slugs, holds the text |
| `state:text`   | the state shown in the State column holds the text                                                               |
| `name:text`    | the name holds the text                                                                                          |

All three look for the text anywhere: `runtime:java` finds `Java + Maven`, `runtime:postgres` finds `postgresql-addon`, `name:api` finds `shop-api` and `api-gateway`.

`state:` reads the words of the State column, in the language of the interface. In English, an application is running, starting, stopped, moderated or in payment default, and an add-on is running, starting, migrating, stopped or shared: `state:stop` keeps what is stopped. In French, the same terms are in French (`state:arrêtée`). An add-on whose state has not loaded yet does not match.

## Combining terms {#operators}

- **AND** is implicit: `is:app env:prod` is `is:app AND env:prod`.
- **OR** keeps either side: `env:prod OR env:staging`.
- **NOT**, or a `-` stuck to what follows, keeps the opposite: `NOT env:prod`, `-env:prod`, `-"old stuff"`, `-(env:prod OR env:staging)`.
- **Parentheses** group conditions: `(env:prod OR env:staging) is:app`. A parenthesis needs no space around it.

OR binds the weakest, then AND, then NOT, which applies to the term or the parentheses right after it:

| Expression                         | Reads as                               |
| ---------------------------------- | -------------------------------------- |
| `is:app OR is:addon has:project`   | `is:app OR (is:addon AND has:project)` |
| `(is:app OR is:addon) has:project` | either kind, carrying a `project` tag  |
| `NOT is:app OR name:db`            | `(NOT is:app) OR name:db`              |
| `NOT (is:app OR name:db)`          | neither an application nor named `db`  |

A `-` works as NOT on a term, a quoted term or parentheses, as long as nothing separates them: `-(env:prod OR env:staging)` is `NOT (env:prod OR env:staging)`. A `-` on its own, followed by a space, is a word to look for, and so is a dash inside quotes: `"-v2"`.

## Quotes {#quotes}

Double quotes keep spaces in a term:

- `"api prod"` keeps what holds `api prod`, the two words together;
- `project:"my project"` reads the tag `project:my project`.

A quoted word is never an operator: `"or"` is the word "or". A quote left open takes the rest of the field.

## When an expression is incomplete {#errors}

While you type, an expression may not hold together. The filter still applies: it keeps the AND of its terms, word by word, the ones negated with `-` included, and leaves `AND`, `OR`, `NOT`, a `-` before a parenthesis and the parentheses out. A line under the field says why:

- "Incomplete filter (unclosed parenthesis), applied word by word." for `(is:addon AND project:shop`;
- "extra closing parenthesis", for `is:app )`;
- "operator without operand", for `is:app AND`;
- "empty parentheses", for `()`.

An expression made of operators only, such as `AND OR`, keeps everything.

## Examples {#examples}

| Expression                               | Keeps                                        |
| ---------------------------------------- | -------------------------------------------- |
| `-is:addon`                              | the applications alone                       |
| `is:app env:prod`                        | the production applications                  |
| `project:shop -env:dev`                  | the shop, without its development resources  |
| `project:shop (env:prod OR env:staging)` | the shop in production or staging            |
| `is:addon -has:project`                  | the add-ons without a project tag            |
| `is:postgresql state:stopped`            | the stopped PostgreSQL databases             |
| `is:watch env:prod`                      | what deserves a look in production           |
| `is:addon -is:shared`                    | the add-ons with instances of their own      |
| `runtime:java OR runtime:node`           | the Java and Node.js applications            |
| `name:api -is:addon`                     | the applications with `api` in their name    |
| `tag:legacy`                             | what carries a tag that starts with `legacy` |
| `NOT (is:app OR name:db)`                | the add-ons whose name does not hold `db`    |

## The examples under the field {#clickable-examples}

Under the Filter field, a row of examples writes terms for you. Hover over one to see what it does:

| Example       | What it does                                           |
| ------------- | ------------------------------------------------------ |
| `is:app`      | Only the applications                                  |
| `is:addon`    | Only the add-ons                                       |
| `is:watch`    | The applications and add-ons of the "To watch" card    |
| `env:prod`    | What carries the tag env:prod; any key:value tag works |
| `-env:prod`   | Everything but env:prod                                |
| `has:project` | What carries a project:… tag, whatever its value       |
| `AND`         | Both conditions; implicit between two terms            |
| `OR`          | Either condition                                       |
| `( )`         | Group conditions                                       |

A term (`is:app` to `has:project`) is added to the expression, or removed when it is already there; it is highlighted while the expression holds it. An operator (`AND`, `OR`, `( )`) is added at the end of the expression, for you to complete.

A click on a tag in the list works the same way: a `key:value` tag goes in as it is, a tag without a colon goes in as `tag:<tag>`, and a second click takes it out. The `is:watch` button of the "To watch" card toggles `is:watch`.
