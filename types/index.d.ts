export type Use = { n: number; last: number }
export type PluginCost = { name: string; tokens: number }
export type Snap = {
  plugins: PluginCost[]
  ctx: { tokens: number; percent: number } | null
}

declare module 'claude-code' {
  interface PluginState {
    'token-ledger': {
      // Plugin name -> how many times a skill or MCP tool of it ran, and when last. Also kept in $.store.
      uses: Shaped<Record<string, Use>>
      // When tracking began (ms), so "idle" is never judged on too little history.
      since: Shaped<number>
      snap: Shaped<Snap | null>
    }
  }
}
