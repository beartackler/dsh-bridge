/**
 * Tests for lib/host.ts: the three host seams behind defects F5 and F6
 * (docs/research/e2e-onboarding-journey.md 3.2, 3.3).
 *
 * The doubles below are shaped from the installed harness typings, not
 * invented. Each is annotated with the interface it stands in for so a
 * reviewer can check the shape against the runtime without reading host.ts:
 *
 *  - `AgentDefaultModelConfig.currentSelection(): ModelSelection`
 *    (@deepseek-ai/dsh-agent-default-model/lib/types/index.d.ts:44-48; the
 *    returned `{ provider, model }` at :30-33).
 *  - `SessionProjections.snapshot(session): ProjectionSnapshot`
 *    (@deepseek-ai/dsh-session-projection/lib/types/index.d.ts:167-176;
 *    `{ asOfSeq, values }` at :86-91), whose `values.tokenUsage` and
 *    `values.contextPressure` are the token-meter's registered projections
 *    (@deepseek-ai/dsh-token-meter/lib/types/projection.d.ts:12-17, 28-45,
 *    64-71). `TokenUsageProjection`'s four buckets are all required there, so
 *    the happy-path double carries all four.
 *  - `Agent` with `options: AgentOptions` and `session: Session`
 *    (@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:12-19, 58-66).
 *  - `ctx.baseUrl` as the Loader-set directory URL
 *    (@deepseek-ai/cordis/lib/types/context.d.ts:23), anchored at the profile's
 *    cordis.yml directory by cordis-plugin-include (lib/index.js:133-138), whose
 *    basename is the profile name
 *    (@deepseek-ai/dsh-app-boot/lib/types/profile.d.ts:70-72).
 *
 * Service lookup goes through `ctx.get(name)`, which returns `undefined` for an
 * unmounted service; the doubles reproduce that exactly.
 */
export {};
//# sourceMappingURL=host-test.d.ts.map