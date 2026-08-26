/**
 * OBFU — deliberate concealment.
 *
 * Obfuscation is the *compounding* family (pipeline §S3): on its own it is medium, but
 * paired with EXEC or NET it turns a "maybe" into an F, because hiding a network call is
 * evidence of intent in a way that the call alone is not.
 *
 * Minification is not obfuscation. A minified bundle with a sourcemap is normal
 * engineering; string-array rotation, hex identifiers, and base64 blobs fed to eval are
 * not. This rule tries hard to keep that line, since crying wolf on every `lib/index.js`
 * would make the whole trust layer useless.
 */
import { type Rule } from "./types.js";
/** Shannon entropy in bits/char. ~4.0+ over a long alphanumeric run implies encoded data. */
export declare function shannonEntropy(input: string): number;
export declare const obfuscationRule: Rule;
export default obfuscationRule;
//# sourceMappingURL=obfuscation.d.ts.map