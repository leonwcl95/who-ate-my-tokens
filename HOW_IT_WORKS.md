# How token-ledger works

Everything lives in `hooks/register.tsx`. It is a hooks module: it registers handlers for engine events and holds no other code. It makes no model calls and adds nothing to the system prompt.

## Events

| Event | What the mod does |
| --- | --- |
| `session.start` | Registers `/token-ledger`. Loads the saved usage counts, the plugins you turned off from the pane, and the date tracking began from the mod's store; sets that date to now on the very first run. |
| `skill.prompt` | Records one use. A skill named `plugin:skill` counts for `plugin`; a skill with no prefix counts under `(own)`. Fires when a skill is typed as `/name`, run by the Skill tool, or preloaded into a subagent. |
| `tool.call` | For an MCP tool whose name starts `mcp__plugin_<plugin>_`, records one use for that plugin. Every call passes through untouched; after `next(e)` returns, the length of its result text is measured. A result of about 500 tokens or more is added to the list of biggest results. |
| `turn.complete` | Re-measures everything, records the turn, checks the plan thresholds and updates the status line. |
| `command.run` | `/token-ledger` re-measures and opens the pane. |
| `ui.render` | Draws the pane. |

The `skill.prompt`, `tool.call` and `turn.complete` hooks have a `.catch` that passes the event through, so a failure here never blocks your work.

## Where each number comes from

The mod calls `$.session.usage({ breakdown: 'summary' })`. That reuses the estimate behind `/context`, computed locally from the last response's usage, and sends no token-count request.

- **Plan usage:** `rateLimits` in that answer: the 5-hour and weekly windows with percent used and reset time. Empty off a subscription or before the first response.
- **Where the context goes:** the breakdown's categories of kind `used`. Rows of kind `deferred` (tool schemas loaded on demand) are outside the window and are left out of the bars. Each bar is that row's share of the `used` rows added together.
- **A turn's cache figures:** the token counts the last response reported: uncached input, cache read, cache write and output.
- **A turn's movement of the 5-hour window:** the window's percentage now minus its percentage at the previous measurement. It is blank when there is no previous reading or the window has reset.
- **Session cost:** the engine's own total, when it keeps one.
- **Per-plugin cost:** the tokens of the plugin's entries in the skill listing (grouped by `pluginName`), plus the tokens of its MCP tool schemas whose server name looks like `plugin:<plugin>:<server>`. It is the size of that plugin's part of the context, not a bill.
- **Size of a tool result:** the length of its text divided by 4. A rough token estimate.

## The compact hint

Shown when the `Messages` row is at least 60% of the `used` total and the total is at least 80,000 tokens.

## Plan warnings

At each finished turn, if a plan window was below 80% at the previous measurement and is at or above it now, a toast is shown; the same for 95%. A window that is already above a threshold when the mod starts does not raise one.

## Deciding "idle"

A plugin is idle when both are true:

- at least 7 days have passed since the mod first ran, and
- zero uses are recorded for it.

Before 7 days the pane says how many days of tracking there have been. The suggestion lists the idle plugins and adds up their tokens. It does not change any setting.

## Turning a plugin off and on

The only time the mod changes anything. Pressing **Turn off** reads `~/.claude/settings.json`, sets `enabledPlugins[<id>]` to `false` for the plugin's entry (the key whose part before `@` is the plugin name), and writes the whole file back as JSON with two-space indentation. If the plugin has no such entry (a plugin provided by the app, or enabled in another scope), nothing is written and the pane says so.

It stores the plugin's estimated cost and the plugins' total at that moment. After `/reload-plugins` the plugin no longer loads, so the pane can compare that total with the current one. **Turn back on** sets the flag to `true` again and forgets the entry.

Other settings are kept, but comments and original formatting in that file are not (it is JSON, rewritten from its parsed form). The home folder is read from `USERPROFILE`, falling back to `HOME`.

## What is stored

The mod's own store keeps three things between sessions: the usage counts (per plugin: how many, and when last), the date tracking began, and the plugins turned off from the pane. The latest measurement, the turn list, the biggest results and the selected tab live only in the session.

## Files

| File | Role |
| --- | --- |
| `.claude-plugin/plugin.json` | Manifest. |
| `.claude-plugin/marketplace.json` | Makes the repository installable as the `who-ate-my-tokens` marketplace. |
| `hooks/hooks.json` | Points to the hooks module. |
| `hooks/register.tsx` | All behaviour. |
| `types/index.d.ts` | Type contract for the stored state. |
