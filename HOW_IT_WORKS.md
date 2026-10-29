# How token-ledger works

Everything lives in `hooks/register.tsx`. It is a hooks module: it registers handlers for engine events and holds no other code. It makes no model calls and adds nothing to the system prompt.

## Events

| Event | What the mod does |
| --- | --- |
| `session.start` | Registers `/token-ledger`. Loads the saved usage counts and the date tracking began from the mod's store; sets that date to now on the very first run. |
| `skill.prompt` | Records one use. A skill named `plugin:skill` counts for `plugin`; a skill with no prefix counts under `(own)`. Fires when a skill is typed as `/name`, run by the Skill tool, or preloaded into a subagent. |
| `tool.call` | For an MCP tool whose name starts `mcp__plugin_<plugin>_`, records one use for that plugin. Every call passes through untouched. |
| `turn.complete` | Re-measures plugin cost and updates the status line. |
| `command.run` | `/token-ledger` re-measures and opens the pane. |
| `ui.render` | Draws the pane. |

The `skill.prompt` and `tool.call` hooks have a `.catch` that passes the event through, so a failure here never blocks your work.

## Measuring cost

The mod calls `$.session.usage({ breakdown: 'summary' })`. That reuses the estimate behind `/context`, computed locally from the last response's usage, and sends no token-count request.

For each plugin:

- the tokens of its entries in the skill listing (`skills.skillFrontmatter`, grouped by `pluginName`), plus
- the tokens of its MCP tool schemas (`mcpTools`) whose server name looks like `plugin:<plugin>:<server>`.

The sum is shown as "~tokens/req". It is how big that plugin's part of the context is, not what you were billed.

## Deciding "idle"

A plugin is idle when both are true:

- at least 7 days have passed since the mod first ran, and
- zero uses are recorded for it.

Before 7 days the pane says how many days of tracking there have been. The suggestion card lists the idle plugins and adds up their tokens. It does not change any setting.

## What is stored

The mod's own store keeps two things between sessions: the usage counts (per plugin: how many, and when last) and the date tracking began. The latest measurement lives only in the session.

## Files

| File | Role |
| --- | --- |
| `.claude-plugin/plugin.json` | Manifest. |
| `.claude-plugin/marketplace.json` | Makes the repository installable as the `who-ate-my-tokens` marketplace. |
| `hooks/hooks.json` | Points to the hooks module. |
| `hooks/register.tsx` | All behaviour. |
| `types/index.d.ts` | Type contract for the stored state. |
