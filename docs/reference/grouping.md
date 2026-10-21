# Grouping expressions

The **Group by** field of the [organisation home](/guide/organisation-home#grouping) arranges the list in groups and sub-groups, from the tags of the resources or from what the list knows of them. The list beside an application or add-on page reads the same expressions. The grouping is part of the address of the page (`?g=`) and of a [favourite view](/guide/organisation-home#views), and the organisation remembers the last one in this browser.

Grouping is an extra of the interface: it runs in your browser, on what the filter keeps.

## At a glance {#summary}

| Expression                | Groups                                                      |
| ------------------------- | ----------------------------------------------------------- |
| `project`                 | one group per value of the `project:…` tags                 |
| `project > env`           | one group per project, then one sub-group per environment   |
| `project > env(prod,dev)` | the same, `prod` before `dev`, the other environments after |
| `type`                    | applications on one side, add-ons on the other              |
| `runtime`                 | by application runtime and add-on provider                  |
| `provider`                | by add-on provider                                          |
| `state`                   | by state                                                    |

An empty field shows the whole list in one table.

## Keys {#keys}

### Tag keys {#tag-keys}

Any key that is not built in reads the `key:value` tags. With `project`:

- `project:shop` goes in the group `shop`;
- `project:shop:prod` goes in `shop` too: the value is the first segment after the key;
- a tag without a colon, such as `legacy`, is never read by grouping.

Keys and values ignore case and accents: `Project:Shop` and `project:shop` land in the same group.

The field suggests the tag keys of the organisation, the most used first, then `project > env` and `env > project` when both keys exist (or the two most used keys paired), then the built-in keys.

### Built-in keys {#builtin-keys}

| Key        | Groups by                                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`     | the kind of resource: "Applications" and "Add-ons"                                                                                                       |
| `runtime`  | the runtime of an application, as the Type column shows it (`Node.js`, `Java + Maven`), and the provider of an add-on (`postgresql-addon`)               |
| `provider` | the provider of an add-on; the applications go to "no provider"                                                                                          |
| `state`    | the state as the State column shows it: running, starting, stopped… for an application, and for an add-on its own state once loaded, "add-on" until then |

The groups of `state` use the words of the interface, so they read in French when the interface is in French.

A tag key named like a built-in key (`type`, `runtime`, `provider`, `state`) is read as the built-in key.

## Levels {#levels}

`>` nests the levels, up to three: `project > env > runtime`. Each group of a level holds the sub-groups of the next one, and the resources sit in the groups of the last level.

A `,` outside parentheses separates levels too: `project, env` is `project > env`. A separator at the end is ignored, so the list keeps its shape while you type `project >`.

## Order of the values {#order}

Groups come in alphabetical order. To put some values first, list them in parentheses after the key, separated by commas: `env(prod,staging,dev)`. The values listed come first, in that order; the others follow in alphabetical order.

The order applies to its level, wherever it is: `project > env(prod,dev)` orders the environments inside each project.

With `type`, "Add-ons" comes before "Applications" in alphabetical order; `type(applications)` puts the applications first.

Sorting the list by its Cost column also orders the groups, by their total; see [Sorting](/guide/organisation-home#sorting).

## Resources without a value {#missing}

The resources without a value for a key gather in a last group named after it: "no project" for `project`, "no env" for `env`. It always comes last, after the values listed in parentheses and the others. In nested levels, each group has its own: the projects without an environment show a "no env" sub-group.

## Several values {#several-values}

A resource with two values for a key, such as both `project:shop` and `project:blog`, shows in both groups. It is one resource: selecting it in one group selects it in the other.

## Add-ons inherit from their applications {#inferred}

Add-ons often carry no tags: a database belongs to the project of the application that uses it. So, for each key, an add-on without a tag for that key takes the values of the applications linked to it, and goes in their groups.

In such a group, the add-on carries a dashed "inferred" chip beside its name, whose tooltip says "Placed after its linked applications".

- The inheritance works key by key: with `project > env`, a database tagged `project:shop` but without an `env` tag goes in its own project, then in the environments of its applications.
- An add-on linked to applications of several projects goes in each of their groups; a configuration provider shared by many applications may show in many groups.
- An add-on linked to no application, and without a tag for the key, goes in the "no …" group of the key.
- Applications never inherit.
- The links between applications and add-ons load after the list. Until they are known, an add-on without tags sits in the "no …" group.

On the page of an add-on, the tags it inherits for grouping show dashed beside its own, with the applications they come from. See [Add-ons](/guide/addons).

::: tip
Only grouping inherits. The filter reads the tags of each resource itself: `env:prod` leaves out an add-on that has no `env` tag of its own, even when grouping places it in `prod`.
:::

## In the list {#in-the-list}

Each group and sub-group has a header with:

- a chevron and its name; a click folds or unfolds it, and the folded groups are remembered per organisation in this browser;
- its counts, "3 apps · 2 add-ons";
- a checkbox that selects everything under it, folded sub-groups included;
- its total, when the costs are shown: with `project > env`, the cost of the production of each project.

Inside a group, the applications come first, then the add-ons, in the order of the [sort](/guide/organisation-home#sorting).

## When an expression is wrong {#errors}

A line under the field says what is wrong, and the levels before the mistake still apply:

| Expression          | Message                                                |
| ------------------- | ------------------------------------------------------ |
| `project > > env`   | "Grouping: empty key."                                 |
| `env(prod`          | "Grouping: expected syntax: key or key(value, value)." |
| `project > project` | "Grouping: key “project” twice."                       |
| `a > b > c > d`     | "Grouping: 3 levels at most." (the first three apply)  |

A key holds no space and no parenthesis; spaces around `>`, `,` and before `(` do not matter.

## Examples {#examples}

| Expression                        | Groups                                                        |
| --------------------------------- | ------------------------------------------------------------- |
| `project`                         | one group per project, the untagged resources in "no project" |
| `project > env`                   | per project, then per environment                             |
| `project > env(prod,dev)`         | the same, production first in each project                    |
| `env(prod,staging,dev) > project` | per environment first, then per project                       |
| `team > project > env`            | three levels                                                  |
| `type > runtime`                  | add-ons and applications, then their providers and runtimes   |
| `type(applications) > runtime`    | the same, applications first                                  |
| `provider`                        | the add-ons by provider, with a filter such as `is:addon`     |
| `state`                           | running, starting, stopped…                                   |
| `project > state`                 | what runs and what is stopped, project by project             |

## The examples under the field {#clickable-examples}

Under the Group by field, a row of examples sets the grouping for you. Hover over one to see what it does:

| Example                   | What it does                                   |
| ------------------------- | ---------------------------------------------- |
| `project > env`           | One group per project, then per environment    |
| `project > env(prod,dev)` | The same, prod before dev                      |
| `type`                    | Applications on one side, add-ons on the other |
| `runtime`                 | By runtime or provider                         |
| `state`                   | By state                                       |

A click replaces the expression with the example, which shows highlighted; a click on the one in use clears the grouping.
