import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Big, Dis, Turn, Use } from '../types'

const PANE = 'token-ledger'
const DAY = 86_400_000
const MIN_DAYS = 7 // shortcut: a fixed 7-day history before calling a plugin idle, make it an option if people want it
const MAX_TURNS = 20
const MAX_BIG = 10
const BIG_FROM = 500 // estimated tokens a tool result needs to be listed
const WARN_AT = [80, 95] // plan usage percentages that raise a toast the first time a window crosses them
const NUDGE_SHARE = 60 // messages at this share of the window (and past NUDGE_FROM tokens) earn a /compact hint
const NUDGE_FROM = 80_000
const uses = atom({ plugin: 'token-ledger', key: 'uses' } as const, {}, { shape: 'uses-1' })
const since = atom({ plugin: 'token-ledger', key: 'since' } as const, 0, { shape: 'since-1' })
const snap = atom({ plugin: 'token-ledger', key: 'snap' } as const, null, { shape: 'snap-3' })
const turns = atom({ plugin: 'token-ledger', key: 'turns' } as const, [], { shape: 'turns-2' })
const big = atom({ plugin: 'token-ledger', key: 'big' } as const, [], { shape: 'big-2' })
const note = atom({ plugin: 'token-ledger', key: 'note' } as const, '', { shape: 'note-1' })
const disabled = atom({ plugin: 'token-ledger', key: 'disabled' } as const, {}, { shape: 'disabled-1' })
const tabAtom = atom({ plugin: 'token-ledger', key: 'tab' } as const, 'overview', { shape: 'tab-1' })

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)
const bar = (pct: number, w = 22) => {
  const f = Math.max(0, Math.min(w, Math.round((pct / 100) * w)))
  return '█'.repeat(f) + '░'.repeat(w - f)
}
const tone = (pct: number) => (pct >= 85 ? 'red' : pct >= 60 ? 'yellow' : 'green')
const NAMES: Record<string, string> = { five_hour: '5-hour limit', seven_day: 'Weekly limit' }
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// "Fri 12:20 AM" in the viewer's own time zone.
function when(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const h = d.getHours()
  return `${WEEK[d.getDay()]} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
// A turn's movement of a plan window: "+0.6%", "<0.1%" below the reported resolution, "–" unknown.
const move = (d: number | null) => (d === null ? '–' : d === 0 ? '<0.1%' : `+${d}%`)

async function record($: any, plugin: string) {
  const now = await $.clock.now()
  await update($, uses, (u: Record<string, Use>) => ({
    ...u,
    [plugin]: { n: (u[plugin]?.n ?? 0) + 1, last: now },
  }))
  await $.store.set('uses', await read($, uses))
}

// Notes a tool result that was large. shortcut: characters / 4 is a rough token estimate, not a count.
async function noteBig($: any, e: any, r: any) {
  const tokens = Math.round(String(r?.text ?? '').length / 4)
  if (tokens < BIG_FROM) return
  // A Read of part of a file says which lines, so two reads of one file are told apart.
  const range = e.offset !== undefined ? ` L${e.offset}${e.limit !== undefined ? `+${e.limit}` : ''}` : ''
  const detail = e.file_path
    ? `${String(e.file_path).split(/[\\/]/).pop()}${range}`
    : String(e.command ?? e.pattern ?? e.url ?? '').slice(0, 40)
  const label = `${e.tool} ${detail}`.trim()
  const done = await read($, turns)
  const turn = (done.length > 0 ? done[done.length - 1].n : 0) + 1 // the turn still running
  await update($, big, (l: Big[]) =>
    [...l, { label, tokens, turn }].sort((a, c) => c.tokens - a.tokens).slice(0, MAX_BIG),
  )
}

// Everything here comes from the free local /context estimate and the last response's usage: no model call.
async function measure($: any, isTurn: boolean) {
  const usage = await $.session.usage({ breakdown: 'summary' }).catch(() => undefined)
  const b = usage?.context?.breakdown
  const before = await read($, snap)
  const cost: Record<string, number> = {}
  for (const s of b?.skills?.skillFrontmatter ?? []) {
    if (s.pluginName) cost[s.pluginName] = (cost[s.pluginName] ?? 0) + s.tokens
  }
  for (const t of b?.mcpTools ?? []) {
    const m = /^plugin:([^:]+):/.exec(t.serverName)
    if (m) cost[m[1]] = (cost[m[1]] ?? 0) + t.tokens
  }
  const plugins = Object.entries(cost)
    .map(([name, tokens]) => ({ name, tokens }))
    .sort((a, c) => c.tokens - a.tokens)
  const rows = (b?.categories ?? []) as any[]
  const cats = rows
    .filter(c => c.kind === 'used' && c.tokens > 0)
    .map(c => ({ name: String(c.name), tokens: Number(c.tokens) }))
    .sort((a, c) => c.tokens - a.tokens)
    .slice(0, 8)
  const deferred = rows.filter(c => c.kind === 'deferred').reduce((sum, c) => sum + Number(c.tokens), 0)
  const limits = ((usage?.rateLimits ?? []) as any[]).map(r => ({
    kind: String(r.kind),
    pct: Number(r.percentUsed),
    resetsAt: r.resetsAt as string | undefined,
  }))
  const tokens = usage?.context?.tokens
  const percent = usage?.context?.percent
  await update($, snap, () => ({
    plugins,
    ctx: tokens === undefined ? null : { tokens, percent: percent ?? 0 },
    cats,
    used: cats.reduce((sum, c) => sum + c.tokens, 0),
    deferred,
    limits,
    usd: typeof usage?.cost?.usd === 'number' ? usage.cost.usd : null,
  }))
  if (isTurn) {
    const prev = before?.limits ?? []
    // Percentage points a window moved since the last measurement; null when unknown or the window reset.
    const delta = (kind: string) => {
      const p = prev.find(x => x.kind === kind)
      const n = limits.find(x => x.kind === kind)
      if (!p || !n || n.pct < p.pct) return null
      return Number((n.pct - p.pct).toFixed(1))
    }
    const a = b?.apiUsage
    if (a) {
      await update($, turns, (t: Turn[]) =>
        [
          ...t,
          {
            n: (t.length > 0 ? t[t.length - 1].n : 0) + 1,
            input: a.input_tokens,
            read: a.cache_read_input_tokens,
            write: a.cache_creation_input_tokens,
            out: a.output_tokens,
            d5: delta('five_hour'),
            d7: delta('seven_day'),
          },
        ].slice(-MAX_TURNS),
      )
    }
    for (const l of limits) {
      const p = prev.find(x => x.kind === l.kind)
      for (const at of WARN_AT) {
        if (p && p.pct < at && l.pct >= at) $.ui.toast(`token-ledger: ${NAMES[l.kind] ?? l.kind} is at ${l.pct}%`)
      }
    }
  }
  const total = plugins.reduce((sum, p) => sum + p.tokens, 0)
  const parts = [tokens === undefined ? undefined : `ctx ${k(tokens)} (${percent ?? 0}%)`, `plugins ~${k(total)}/request`]
  for (const l of limits) parts.push(`${l.kind === 'five_hour' ? '5h' : l.kind === 'seven_day' ? 'wk' : l.kind} ${l.pct}%`)
  $.ui.status(parts.filter(Boolean).join(' · '))
}

// Turns a plugin off in ~/.claude/settings.json (reversible: one flag), and remembers what it was costing.
async function disablePlugin($: any, name: string, tokens: number, total: number) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  const file = `${home}/.claude/settings.json`
  const json = JSON.parse(await $.fs.read(file).catch(() => '{}'))
  const ids = Object.keys(json.enabledPlugins ?? {}).filter(id => id.split('@')[0] === name)
  if (ids.length === 0) {
    await update($, note, () => `${name} is not listed in settings.json, so it cannot be turned off from here. It comes from the app or another scope; try /plugin.`)
    return
  }
  json.enabledPlugins = { ...json.enabledPlugins, ...Object.fromEntries(ids.map(id => [id, false])) }
  await $.fs.write(file, JSON.stringify(json, null, 2))
  await update($, disabled, (d: Record<string, Dis>) => ({ ...d, [name]: { tokens, total } }))
  await $.store.set('disabled', await read($, disabled))
  await update($, note, () => `Turned off ${name}. It applies after /reload-plugins.`)
}

// The way back: flips the flag on again and forgets the entry. A plugin that is off no longer loads, so the
// "Turned off from here" card is the only place left to find it from.
async function enablePlugin($: any, name: string) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  const file = `${home}/.claude/settings.json`
  const json = JSON.parse(await $.fs.read(file).catch(() => '{}'))
  const ids = Object.keys(json.enabledPlugins ?? {}).filter(id => id.split('@')[0] === name)
  if (ids.length > 0) {
    json.enabledPlugins = { ...json.enabledPlugins, ...Object.fromEntries(ids.map(id => [id, true])) }
    await $.fs.write(file, JSON.stringify(json, null, 2))
  }
  await update($, disabled, (d: Record<string, Dis>) => Object.fromEntries(Object.entries(d).filter(([n]) => n !== name)))
  await $.store.set('disabled', await read($, disabled))
  await update($, note, () => `Turned ${name} back on. It applies after /reload-plugins.`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'token-ledger',
      description: 'Where your tokens and plan usage go, per turn, per tool and per plugin',
    })
    const saved = (await $.store.get('uses')) as Record<string, Use> | undefined
    const savedOff = (await $.store.get('disabled')) as Record<string, Dis> | undefined
    const first = (await $.store.get('since')) as number | undefined
    const now = await $.clock.now()
    if (first === undefined) await $.store.set('since', now)
    await update($, uses, () => saved ?? {})
    await update($, disabled, () => savedOff ?? {})
    await update($, since, () => first ?? now)
    return next(e)
  })

  on('command.run', { command: 'token-ledger' }, async $ => {
    await measure($, false)
    await $.ui.open({ id: PANE, title: 'Token ledger' })
    return { text: 'Token ledger opened.' }
  })

  // A skill "Use" is counted by plugin: "plugin:skill" -> plugin; a skill with no prefix is your own.
  on('skill.prompt', async ($, e, next) => {
    await record($, e.skill.includes(':') ? e.skill.split(':')[0] : '(own)')
    return next(e)
  }).catch(($, e, next) => next(e))

  // shortcut: guesses the plugin from the MCP tool's wire name (mcp__plugin_<plugin>_<server>__tool), fails for plugin names with "_".
  // Every call passes through untouched; its result is only measured on the way back.
  on('tool.call', async ($, e, next) => {
    const m = /^mcp__plugin_([^_]+)_/.exec(e.tool)
    if (m) await record($, m[1])
    const r = await next(e)
    await noteBig($, e, r)
    return r
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await measure($, true)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, snap)
    const u = await read($, uses)
    const start = await read($, since)
    const ts = await read($, turns)
    const bigs = await read($, big)
    const off = await read($, disabled)
    const tab = await read($, tabAtom)
    const now = await $.clock.now()
    const days = Math.floor((now - start) / DAY)
    const plugins = s?.plugins ?? []
    const total = plugins.reduce((sum, p) => sum + p.tokens, 0)
    const idle = days >= MIN_DAYS ? plugins.filter(p => (u[p.name]?.n ?? 0) === 0) : []
    const idleTokens = idle.reduce((sum, p) => sum + p.tokens, 0)
    const cats = s?.cats ?? []
    const limits = s?.limits ?? []
    const msgs = cats.find(c => /^messages$/i.test(c.name))
    const msgShare = msgs && s && s.used > 0 ? Math.round((msgs.tokens / s.used) * 100) : 0
    const nudge = msgs !== undefined && s !== null && msgShare >= NUDGE_SHARE && s.used >= NUDGE_FROM
    const msg = await read($, note)
    const pickTab = (t: string) => update($, tabAtom, () => t)
    // One table cell: a fixed width in terminal cells, so columns line up in a proportional font.
    const cell = (w: number, text: string, right?: boolean, color?: string, dim?: boolean) => (
      <Box width={w} justifyContent={right ? 'flex-end' : 'flex-start'}>
        <Text color={color} dimColor={dim} wrap="truncate-end">
          {text}
        </Text>
      </Box>
    )
    const tabs: Array<[string, string]> = [
      ['overview', 'Overview'],
      ['activity', 'Activity'],
      ['plugins', 'Plugins'],
    ]

    return (
      <Box flexDirection="column" gap={1} paddingX={2} paddingY={1}>
        <Box flexDirection="column">
          <Text color="cyan" bold>
            Token ledger
          </Text>
          <Text dimColor>
            {s?.ctx ? `context ${k(s.ctx.tokens)} tokens (${s.ctx.percent}%)` : 'No response yet: finish a turn, then reopen.'}
            {s?.usd != null ? ` · session ≈ $${s.usd.toFixed(2)}` : ''}
          </Text>
        </Box>

        <Box gap={2}>
          {tabs.map(([id, name]) => (
            <Button key={id} variant={tab === id ? 'primary' : undefined} onPress={() => pickTab(id)}>
              {name}
            </Button>
          ))}
        </Box>

        {tab === 'overview' && (
          <Box flexDirection="column" gap={1}>
            {nudge && (
              <Box borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1} flexDirection="column">
                <Text color="yellow" bold>
                  Messages are {msgShare}% of your context
                </Text>
                <Text>
                  That is {k(msgs.tokens)} tokens re-read on every turn. /compact now, or /clear between unrelated tasks,
                  would cut the most.
                </Text>
              </Box>
            )}

            <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} gap={1} flexDirection="column">
              <Text bold>Plan usage</Text>
              {limits.length === 0 ? (
                <Text dimColor>Not reported yet. It needs a subscription plan and one finished response.</Text>
              ) : (
                limits.map(l => (
                  <Box key={l.kind} flexDirection="column">
                    <Text>
                      {NAMES[l.kind] ?? l.kind} <Text dimColor>{l.resetsAt ? `resets ${when(l.resetsAt)}` : ''}</Text>
                    </Text>
                    <Text color={tone(l.pct)}>
                      {bar(l.pct)} {l.pct}%
                    </Text>
                  </Box>
                ))
              )}
            </Box>

            <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} gap={1} flexDirection="column">
              <Text bold>Where the context goes</Text>
              {cats.length === 0 && <Text dimColor>Nothing measured yet.</Text>}
              <Box flexDirection="column">
                {cats.map(c => {
                  const pct = s && s.used > 0 ? (c.tokens / s.used) * 100 : 0
                  return (
                    <Text key={c.name}>
                      <Text color="magenta">{bar(pct, 12)}</Text> {k(c.tokens)} {c.name}
                    </Text>
                  )
                })}
              </Box>
              <Text dimColor>
                Bars show each part's share of what is in the window now ({s ? k(s.used) : '0'}).
                {s && s.deferred > 0 ? ` Another ${k(s.deferred)} of tool schemas load only when used.` : ''}
              </Text>
            </Box>
          </Box>
        )}

        {tab === 'activity' && (
          <Box flexDirection="column" gap={1}>
            <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} gap={1} flexDirection="column">
              <Text bold>Last turns</Text>
              {ts.length === 0 && <Text dimColor>No turn finished yet.</Text>}
              {ts.length > 0 && (
                <Box flexDirection="column">
                  <Box>
                    {cell(6, 'turn', false, undefined, true)}
                    {cell(7, 'new', true, undefined, true)}
                    {cell(9, 'cached', true, undefined, true)}
                    {cell(9, 'written', true, undefined, true)}
                    {cell(7, 'out', true, undefined, true)}
                    {cell(8, '5h', true, undefined, true)}
                  </Box>
                  {ts.slice(-8).map(t => {
                    const hue = t.write > t.read ? 'yellow' : undefined
                    return (
                      <Box key={t.n}>
                        {cell(6, String(t.n), false, hue)}
                        {cell(7, k(t.input), true, hue)}
                        {cell(9, k(t.read), true, hue)}
                        {cell(9, k(t.write), true, hue)}
                        {cell(7, k(t.out), true, hue)}
                        {cell(8, move(t.d5), true, hue)}
                      </Box>
                    )
                  })}
                </Box>
              )}
              <Text dimColor>
                cached = served from the prompt cache (cheap). written = stored in it; a cold turn re-sends most of the
                context at full price. 5h = how far the turn moved your 5-hour window; other sessions on the same plan
                can add to it, and it only resolves to 0.1%.
              </Text>
            </Box>

            <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} gap={1} flexDirection="column">
              <Text bold>Biggest tool results</Text>
              {bigs.length === 0 && <Text dimColor>None over ~{BIG_FROM} tokens yet this session.</Text>}
              <Box flexDirection="column">
                {bigs.map((b, i) => (
                  <Box key={`${i}-${b.label}`}>
                    {cell(5, `T${b.turn}`, false, undefined, true)}
                    {cell(7, k(b.tokens), true)}
                    <Box paddingLeft={2} flexGrow={1}>
                      <Text wrap="truncate-end">{b.label}</Text>
                    </Box>
                  </Box>
                ))}
              </Box>
              <Text dimColor>Estimated from result length (about 4 characters a token). This session only.</Text>
            </Box>
          </Box>
        )}

        {tab === 'plugins' && (
          <Box flexDirection="column" gap={1}>
            <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} gap={1} flexDirection="column">
              <Box>
                {cell(19, 'Plugin', false, undefined, true)}
                {cell(8, 'tokens', true, undefined, true)}
                <Box paddingLeft={2}>
                  <Text dimColor>Use</Text>
                </Box>
              </Box>
              {plugins.length === 0 && <Text dimColor>Nothing measured yet. Finish a turn, then reopen.</Text>}
              <Box flexDirection="column" gap={1}>
                {plugins.map(p => {
                  const used = u[p.name]
                  const use = used
                    ? `${used.n} use${used.n === 1 ? '' : 's'} · ${Math.floor((now - used.last) / DAY)}d ago`
                    : days >= MIN_DAYS
                      ? 'idle'
                      : '–'
                  const hue = used === undefined && days >= MIN_DAYS ? 'yellow' : undefined
                  return (
                    <Box key={p.name}>
                      {cell(19, p.name, false, hue)}
                      {cell(8, k(p.tokens), true, hue)}
                      <Box paddingLeft={2} width={20}>
                        <Text color={hue} wrap="truncate-end">
                          {use}
                        </Text>
                      </Box>
                      <Button key="off" onPress={() => disablePlugin($, p.name, p.tokens, total)}>
                        Turn off
                      </Button>
                    </Box>
                  )
                })}
              </Box>
              {msg !== '' && <Text color={msg.startsWith('Turned off') ? 'green' : 'yellow'}>{msg}</Text>}
              <Text dimColor>
                All plugins together: ~{k(total)} per request. Turning one off changes one flag in settings.json and
                applies after /reload-plugins.
              </Text>
            </Box>

            {Object.keys(off).length > 0 && (
              <Box borderStyle="round" borderColor="green" paddingX={2} paddingY={1} gap={1} flexDirection="column">
                <Text color="green" bold>
                  Turned off from here
                </Text>
                {Object.entries(off).map(([name, d]) => {
                  const stillLoaded = plugins.some(p => p.name === name)
                  return (
                    <Box key={name} flexDirection="column">
                      <Text>
                        {name}:{' '}
                        {stillLoaded
                          ? `waiting for /reload-plugins (was ~${k(d.tokens)}/request)`
                          : `plugins went from ~${k(d.total)} to ~${k(total)} per request`}
                      </Text>
                      <Button key="on" onPress={() => enablePlugin($, name)}>
                        Turn {name} back on
                      </Button>
                    </Box>
                  )
                })}
              </Box>
            )}

            {idle.length > 0 ? (
              <Box borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1} flexDirection="column">
                <Text color="yellow" bold>
                  Suggestion
                </Text>
                <Text>Consider turning off: {idle.map(p => p.name).join(', ')}</Text>
                <Text dimColor>About {k(idleTokens)} tokens per request (estimated). Nothing has been changed.</Text>
              </Box>
            ) : (
              <Text dimColor>
                {days >= MIN_DAYS
                  ? 'Nothing to suggest: every measured plugin has been used.'
                  : `No idle suggestions yet: tracking for ${days} of ${MIN_DAYS} days before calling anything idle.`}
              </Text>
            )}

            <Text dimColor>
              Counts skill and MCP-tool use only. Plugins that work through hooks, commands or agents are not seen
              here, so check before turning one off.
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
