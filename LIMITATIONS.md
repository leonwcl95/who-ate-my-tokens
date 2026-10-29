# Limitations

## What the numbers mean

- **They are estimates.** The context figures are Claude Code's own `/context` estimates, computed locally. They are not billing numbers.
- **Tokens in context are not the same as money or plan usage.** Parts of a request that were already cached are read back at a lower cost. How your plan weighs cached against uncached tokens is not something this mod knows.
- **The session cost** is the engine's own running total and is shown only when the host keeps one.
- **Tool result sizes are rough.** They are the result's length divided by 4, and they cover the current session only. The list resets when the mod reloads.
- **A turn's movement of your 5-hour window** is the difference between two readings. It resolves only to 0.1%, so a small turn shows `<0.1%`. Other sessions using the same plan can add to the movement, so a turn can look more expensive than it was. A window that reset between readings shows a dash.
- **Plan usage is not reported everywhere.** It needs a subscription plan and one finished response. On an API key, or before the first response, the card says it is not reported.
- **The saving from turning a plugin off is an estimate.** Before a reload it is the plugin's measured listing size. After a reload the pane compares the plugins' total before and after, which is closer to measured, but other things can move that total too.
- **MCP tools are counted whether or not they are loaded.** If your setup loads MCP tool schemas on demand, a plugin's MCP figure can be higher than what a given request carries.
- **Only skills in the listing are counted.** If the skill listing is cut to a token budget, the skills left out do not show up.
- **The bars show shares of the window now**, not of a limit. The category rows can add up to a little more or less than the context figure, because each is estimated on its own.

## What it cannot see

- **Use is counted for skills and MCP tools only.** A plugin that works through hooks, slash commands or agents can look idle while it is doing real work. Check before turning one off.
- **Plugins with no skills and no MCP tools are not listed at all**, because they add nothing it measures.
- **Skills of your own** (not from a plugin) are counted under `(own)` but never listed.
- **The plugin name for an MCP tool is guessed** from the tool's wire name (`mcp__plugin_<plugin>_<server>__tool`). It fails for plugin names that contain an underscore, and those uses go uncounted or to the wrong plugin.
- **Usage before install is unknown.** Counting starts the first time the mod runs. That is why nothing is suggested as idle for the first 7 days.

## Turning plugins off and on

- **It edits `~/.claude/settings.json`.** The file is rewritten from its parsed JSON, so comments and original layout in it are lost. Two editors writing it at the same moment can overwrite each other.
- **It only works for plugins that have an entry in that file.** A plugin provided by the app, or enabled in a project or managed settings file, cannot be turned off from here; the pane says so.
- **It takes effect after `/reload-plugins` or a restart.** This has not been confirmed in every setup.
- **A plugin turned off stops loading, so it leaves the plugin table.** The green "Turned off from here" card is where to find it and turn it back on. That card is remembered across sessions, but if you turn the plugin on some other way, the card keeps showing it until you press its button.
- **Idle suggestions never change anything.** The 7-day window is fixed, and "idle" means zero recorded uses in the tracked time, nothing more. A plugin you use once a month can look idle.

## Not tested

- Behaviour over more than a few days of real use. The idle suggestion has not been seen firing on real data.
- The plan toasts at 80% and 95%: the thresholds have not been crossed in a real session.
- The hint to compact has been checked only against one session.
- How the pane looks on every surface (terminal, desktop, VS Code). It has been checked in the desktop app only.
- Several sessions writing the counts at the same moment. The last write wins.
- Installing from the marketplace. So far it has run only from the folder it was written in.

## Not included

- Automated tests. Validation with `claude plugin validate` passes; there is no `*.test.ts`.
- Any trimming or cutting of tool output, any change to prompts, and any action beyond the plugin on/off flag.
