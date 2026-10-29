# who-ate-my-tokens

A Claude Code mod that shows where your tokens and plan usage go: your 5-hour and weekly limits, what fills the context window, what each turn did to the prompt cache and to your plan, the largest tool results, and what each plugin costs on every request. The plugin itself is called `token-ledger`; `who-ate-my-tokens` is the repository and marketplace name.

It measures. It does not cut anything by itself. Any saving comes from what you do with the numbers, for example `/compact`, a narrower file read, or turning a plugin off.

## What it does

Open `/token-ledger` for a pane with three tabs.

**Overview**
- **Plan usage.** Your 5-hour and weekly windows as bars, with the percentage and when each resets. Green, then yellow from 60%, red from 85%. This needs a subscription plan and one finished response.
- **Where the context goes.** What sits in the window now (system prompt, tools, MCP, memory files, skills, messages), each as a share of the total. Tool schemas that load only on demand are left out of the bars and mentioned in one line.
- **A hint to compact.** When messages are 60% or more of the window and the window holds over 80k tokens, a yellow card says so and suggests `/compact` or `/clear`.

**Activity**
- **Last turns.** Per turn: new tokens, tokens read from the prompt cache, tokens written to it, output, and how far the turn moved your 5-hour window. A yellow row means the cache was cold: more written than read.
- **Biggest tool results.** The largest tool results this session, with the turn they came in (`T3`), an estimated size, and what they were (a file name and line range for reads).

**Plugins**
- **Cost per plugin.** The estimated tokens each plugin adds to every request (its skill listing plus its MCP tool schemas), and how often a skill or MCP tool of it ran.
- **Turn off / back on.** A button on each row flips that plugin's flag in `~/.claude/settings.json`. A green card keeps what you turned off, with the plugins' per-request total before and after (once `/reload-plugins` has run) and a button to turn it back on.
- **Idle suggestion.** After 7 days of tracking, a plugin with zero recorded uses is listed as idle. This only suggests.

Also: the status line shows context size, plugin cost and your plan percentages after every turn, for example `ctx 45k (23%) · plugins ~4.1k/request · 5h 13% · wk 27%`. A toast appears the first time a plan window passes 80% and again at 95%.

## Install

From a terminal session:

```
/plugin install token-ledger --marketplace leonwcl95/who-ate-my-tokens
```

From a shell:

```
claude plugin install token-ledger --marketplace leonwcl95/who-ate-my-tokens
```

When asked, answer `y` to add the marketplace, then pick a scope.

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `leonwcl95/who-ate-my-tokens`, then **Add plugin**.

To try it from a folder without installing, start Claude with `claude --plugin-dir <path to this folder>`.

To update an installed copy, refresh the marketplace and press **Update**, then run `/reload-plugins`. Updates show up only when the `version` in `plugin.json` changes.

## Use

- Work as usual. The pane and status line fill in after your first finished turn.
- Run `/token-ledger` to open the pane.
- Turning a plugin off applies after `/reload-plugins`.
- Nothing is suggested as idle for the first 7 days.

## Read this before trusting it

The numbers are estimates, and the per-turn plan movement can include other sessions on the same plan. Turning a plugin off only sees skill and MCP-tool use; a plugin that works through hooks, commands or agents can look idle while doing real work. See [LIMITATIONS.md](LIMITATIONS.md).

## More

- [HOW_IT_WORKS.md](HOW_IT_WORKS.md): the events used, where each number comes from, and what is stored or changed.
- [LIMITATIONS.md](LIMITATIONS.md): what the numbers mean and what is not covered or tested.

## License

[MIT](LICENSE)
