import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Use } from '../types'

const PANE = 'token-ledger'
const DAY = 86_400_000
const MIN_DAYS = 7 // shortcut: a fixed 7-day history before calling a plugin idle, make it an option if people want it
const uses = atom({ plugin: 'token-ledger', key: 'uses' } as const, {}, { shape: 'uses-1' })
const since = atom({ plugin: 'token-ledger', key: 'since' } as const, 0, { shape: 'since-1' })
const snap = atom({ plugin: 'token-ledger', key: 'snap' } as const, null, { shape: 'snap-1' })

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)

async function record($: any, plugin: string) {
  const now = await $.clock.now()
  await update($, uses, (u: Record<string, Use>) => ({
    ...u,
    [plugin]: { n: (u[plugin]?.n ?? 0) + 1, last: now },
  }))
  await $.store.set('uses', await read($, uses))
}

// Per-plugin cost = its skills' listing tokens + its MCP tool schemas, from the free local /context estimate.
async function measure($: any) {
  const usage = await $.session.usage({ breakdown: 'summary' }).catch(() => undefined)
  const b = usage?.context.breakdown
  if (!b) return
  const cost: Record<string, number> = {}
  for (const s of b.skills?.skillFrontmatter ?? []) {
    if (s.pluginName) cost[s.pluginName] = (cost[s.pluginName] ?? 0) + s.tokens
  }
  for (const t of b.mcpTools) {
    const m = /^plugin:([^:]+):/.exec(t.serverName)
    if (m) cost[m[1]] = (cost[m[1]] ?? 0) + t.tokens
  }
  const plugins = Object.entries(cost)
    .map(([name, tokens]) => ({ name, tokens }))
    .sort((a, c) => c.tokens - a.tokens)
  const { tokens, percent } = usage.context
  await update($, snap, () => ({
    plugins,
    ctx: tokens === undefined ? null : { tokens, percent: percent ?? 0 },
  }))
  const total = plugins.reduce((sum, p) => sum + p.tokens, 0)
  $.ui.status(
    tokens === undefined
      ? `plugins ~${k(total)}/request`
      : `ctx ${k(tokens)} (${percent ?? 0}%) · plugins ~${k(total)}/request`,
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'token-ledger',
      description: 'Show what each plugin costs per request and which look idle',
    })
    const saved = (await $.store.get('uses')) as Record<string, Use> | undefined
    const first = (await $.store.get('since')) as number | undefined
    const now = await $.clock.now()
    if (first === undefined) await $.store.set('since', now)
    await update($, uses, () => saved ?? {})
    await update($, since, () => first ?? now)
    return next(e)
  })

  on('command.run', { command: 'token-ledger' }, async $ => {
    await measure($)
    await $.ui.open({ id: PANE, title: 'Token ledger' })
    return { text: 'Token ledger opened.' }
  })

  // A skill "Use" is counted by plugin: "plugin:skill" -> plugin; a skill with no prefix is your own.
  on('skill.prompt', async ($, e, next) => {
    await record($, e.skill.includes(':') ? e.skill.split(':')[0] : '(own)')
    return next(e)
  }).catch(($, e, next) => next(e))

  // shortcut: guesses the plugin from the MCP tool's wire name (mcp__plugin_<plugin>_<server>__tool), fails for plugin names with "_".
  on('tool.call', async ($, e, next) => {
    const m = /^mcp__plugin_([^_]+)_/.exec(e.tool)
    if (m) await record($, m[1])
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await measure($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, snap)
    const u = await read($, uses)
    const start = await read($, since)
    const now = await $.clock.now()
    const days = Math.floor((now - start) / DAY)
    const plugins = s?.plugins ?? []
    const idle = days >= MIN_DAYS ? plugins.filter(p => (u[p.name]?.n ?? 0) === 0) : []
    const idleTokens = idle.reduce((sum, p) => sum + p.tokens, 0)

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Box>
          <Text color="cyan" bold>
            Token ledger
          </Text>
          <Text dimColor>
            {s?.ctx ? ` · context ${k(s.ctx.tokens)} tokens (${s.ctx.percent}%)` : ''}
          </Text>
        </Box>

        <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
          <Text bold>
            {'Plugin'.padEnd(24)}
            {'~tokens/req'.padStart(12)}   Use
          </Text>
          {plugins.length === 0 && <Text dimColor>Nothing measured yet. Finish a turn, then reopen.</Text>}
          {plugins.map(p => {
            const used = u[p.name]
            const use = used
              ? `${used.n} use${used.n === 1 ? '' : 's'} · ${Math.floor((now - used.last) / DAY)}d ago`
              : days >= MIN_DAYS
                ? 'idle'
                : 'none yet'
            return (
              <Text key={p.name} color={used === undefined && days >= MIN_DAYS ? 'yellow' : undefined}>
                {p.name.slice(0, 23).padEnd(24)}
                {k(p.tokens).padStart(12)}   {use}
              </Text>
            )
          })}
        </Box>

        {idle.length > 0 ? (
          <Box borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
            <Text color="yellow" bold>
              Suggestion
            </Text>
            <Text>
              Consider turning off: {idle.map(p => p.name).join(', ')}
            </Text>
            <Text dimColor>
              About {k(idleTokens)} tokens per request (estimated). Nothing has been changed.
            </Text>
          </Box>
        ) : (
          <Text dimColor>
            {days >= MIN_DAYS
              ? 'Nothing to suggest: every measured plugin has been used.'
              : `No suggestions yet: tracking for ${days} of ${MIN_DAYS} days before calling anything idle.`}
          </Text>
        )}

        <Text dimColor>
          Counts skill and MCP-tool use only. Plugins that work through hooks, commands or agents are not
          seen here, so check before turning one off.
        </Text>
      </Box>
    )
  })
}
