export type Use = { n: number; last: number }
export type PluginCost = { name: string; tokens: number }
// One row of the /context breakdown that sits in the window: system prompt, tools, memory files, messages, ...
export type Cat = { name: string; tokens: number }
// A plan usage window (five_hour, seven_day, ...) as the last response reported it.
export type Limit = { kind: string; pct: number; resetsAt?: string }
// What one finished turn read from and wrote to the prompt cache, and how far it moved the plan windows
// (percentage points; null when unknown). Other sessions on the same plan can add to the movement.
export type Turn = { n: number; input: number; read: number; write: number; out: number; d5: number | null; d7: number | null }
// A tool result that was large, by estimated tokens, and the turn it came in (1 = first this session).
export type Big = { label: string; tokens: number; turn: number }
// A plugin the person turned off from the pane: its estimated cost and the plugins' total at that moment.
export type Dis = { tokens: number; total: number }
export type Snap = {
  plugins: PluginCost[]
  ctx: { tokens: number; percent: number } | null
  cats: Cat[]
  // Tokens of the `cats` rows together: what actually sits in the window.
  used: number
  // Tool schemas loaded on demand: outside the window until used.
  deferred: number
  limits: Limit[]
  usd: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'token-ledger': {
      // Plugin name -> how many times a skill or MCP tool of it ran, and when last. Also kept in $.store.
      uses: Shaped<Record<string, Use>>
      // When tracking began (ms), so "idle" is never judged on too little history.
      since: Shaped<number>
      snap: Shaped<Snap | null>
      // The last turns of this session, oldest first.
      turns: Shaped<Turn[]>
      // The largest tool results of this session, biggest first.
      big: Shaped<Big[]>
      // Plugins turned off from the pane. Also kept in $.store.
      disabled: Shaped<Record<string, Dis>>
      // What the last "Turn off" press did, for the Plugins tab.
      note: Shaped<string>
      tab: Shaped<string>
    }
  }
}
