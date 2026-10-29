# who-ate-my-tokens

A Claude Code mod that shows what each of your plugins costs on every request, counts which ones you actually use, and suggests turning off the idle ones. The plugin itself is called `token-ledger`; `who-ate-my-tokens` is the repository and marketplace name.

It only measures and suggests. It never turns anything off.

## What it does

1. **Cost per plugin.** For every plugin that adds skills or MCP tools, it estimates how many tokens that plugin adds to each request: the size of its skill listing plus the size of its MCP tool schemas. The figures are estimates from Claude Code's own `/context` breakdown, read locally with no model call.
2. **Usage counts.** It counts each time a skill or MCP tool of a plugin runs, and remembers the counts between sessions.
3. **Suggestions.** Once it has watched for 7 days, any measured plugin with zero recorded uses is listed as idle, with the tokens per request you would drop by turning it off.
4. **Status line.** After every turn it shows context size and the total plugin cost, for example `ctx 45k (23%) · plugins ~6.1k/request`.
5. **Pane.** `/token-ledger` opens a pane with the table above and the suggestion card.

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

## Use

- Work as usual. The status line fills in after your first finished turn.
- Run `/token-ledger` to see the table.
- Nothing is suggested for the first 7 days, because it cannot judge "idle" on less history than that.
- To act on a suggestion, turn the plugin off yourself, for example with `/plugin` or with the [skill-gate](https://github.com/leonwcl95/skillz-please) pane.

## Read this before turning anything off

It only sees skill and MCP-tool use. A plugin that works through hooks, commands or agents can look idle while doing real work. The numbers are estimates. See [LIMITATIONS.md](LIMITATIONS.md).

## More

- [HOW_IT_WORKS.md](HOW_IT_WORKS.md): the events used, how cost and idleness are worked out, and what is stored.
- [LIMITATIONS.md](LIMITATIONS.md): what the numbers mean and what is not covered or tested.

## License

[MIT](LICENSE)
