/**
 * Tests for the /bridge-mcp command module (docs/specs/commands/mcp.md),
 * MVP slice over the bridge-owned store at $HOME/.dsh-bridge/mcp.json:
 * add/remove write only that store and emit copy-paste yaml for the profile
 * patch; migration detection reads a legacy patch read-only; list rendering,
 * handshake checklist, and import-from claude existence+parse reporting.
 * All io goes through McpIo doubles or scratch dirs; no network, no spawns.
 */
export {};
//# sourceMappingURL=mcp-test.d.ts.map