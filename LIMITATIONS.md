# Limitations

## What the numbers mean

- **They are estimates.** The figures are Claude Code's own `/context` estimates, computed locally. They are not billing numbers.
- **Tokens in context are not the same as money.** Parts of a request that were already cached are read back at a lower cost. A plugin's tokens-per-request is how much space it takes, not a bill.
- **The saving from turning a plugin off is an estimate too.** It is the plugin's measured listing size, not a measured before-and-after.
- **MCP tools are counted whether or not they are loaded.** If your setup loads MCP tool schemas on demand, a plugin's MCP figure can be higher than what a given request actually carries.
- **Only skills in the listing are counted.** If the skill listing is cut to a token budget, the skills left out do not show up.

## What it cannot see

- **Use is counted for skills and MCP tools only.** A plugin that works through hooks, slash commands or agents can look idle while it is doing real work. The pane says so; check before turning one off.
- **Plugins with no skills and no MCP tools are not listed at all**, because they add nothing it measures.
- **Skills of your own** (not from a plugin) are counted under `(own)` but never listed, since only plugins are suggested.
- **The plugin name for an MCP tool is guessed** from the tool's wire name (`mcp__plugin_<plugin>_<server>__tool`). It fails for plugin names that contain an underscore, and those uses go uncounted or to the wrong plugin.
- **Usage before install is unknown.** Counting starts the first time the mod runs. That is why nothing is suggested for the first 7 days.

## Suggestions

- **It never changes anything.** Turning a plugin off is up to you.
- **The 7-day window is fixed.** There is no setting for it.
- **Idle means "zero recorded uses in the tracked time"**, nothing more. A plugin you use once a month can look idle.

## Not tested

- Behaviour over more than a few days of real use. The idle suggestion has not been seen firing on real data.
- How the pane looks on every surface (terminal, desktop, VS Code).
- Several sessions writing the counts at the same moment. The last write wins.
- Installing from the marketplace. So far it has only run from the folder it was written in, where `/token-ledger` opened the pane.

## Not included

- Automated tests. Validation with `claude plugin validate` passes; there is no `*.test.ts`.
