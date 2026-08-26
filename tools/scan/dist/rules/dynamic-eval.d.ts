/**
 * EXEC — dynamic code execution.
 *
 * Pipeline spec: "Any dynamic code execution at all => at most C" and, in a *shipped
 * bundle*, dynamic eval is critical. dsh-ponytail proves the achievable bar: it
 * externalizes schemastery precisely so its bundle contains zero dynamic execution.
 * So a hit here is not a style nit, it is a grade cap with a known-good counterexample.
 */
import { type Rule } from "./types.js";
export declare const dynamicEvalRule: Rule;
export default dynamicEvalRule;
//# sourceMappingURL=dynamic-eval.d.ts.map