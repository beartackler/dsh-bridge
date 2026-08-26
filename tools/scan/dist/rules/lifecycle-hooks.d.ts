/**
 * HOOK — lifecycle hooks that run before the user consents to anything.
 *
 * The pipeline never executes install scripts; it inspects them as evidence (§S1).
 * A postinstall that spawns a shell is capped at D by the report-card spec, because
 * it runs at install time with the user's full privileges and before any review of
 * the plugin's actual behavior.
 *
 * Two shapes are handled: npm lifecycle scripts in package.json, and Cordis
 * registrations/top-level side effects that fire at module load rather than on activate.
 */
import { type Rule } from "./types.js";
export declare const lifecycleHooksRule: Rule;
export default lifecycleHooksRule;
//# sourceMappingURL=lifecycle-hooks.d.ts.map