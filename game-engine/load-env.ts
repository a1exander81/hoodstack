import "dotenv/config";
import dotenv from "dotenv";

// Side-effecting module, imported first (and only) for its effect. A plain
// `dotenv.config({ path: ".env.local" })` call inline in index.ts does NOT
// run early enough: TypeScript's CJS transform hoists every `import` --
// including ones textually written below that call -- above ordinary
// top-level statements, so services/settlement's own module-load-time env
// check (`if (!PRIVY_APP_ID) throw`) ran before the inline call ever fired.
// Putting the load in its own imported module sidesteps the hoisting: this
// module's body (this file) executes in full, including the load below,
// before index.ts's later imports are resolved.
//
// override: true is load-bearing, not cosmetic. `import "dotenv/config"`
// above already loaded plain `.env` first (its default lookup), which for
// this repo means PRIVY_VERIFICATION_KEY got set to the literal placeholder
// string ".env" ships with ("paste-the-key-here") -- dotenv.config() does
// NOT overwrite an already-set process.env value by default, so without
// `override: true` .env.local's real multi-line PEM key was silently
// discarded in favor of that placeholder. Found live: every socket auth
// attempt failed with `"spki" must be SPKI formatted string` from jose's
// importSPKI, the exact "wrong PRIVY_VERIFICATION_KEY" failure mode the
// production 401 incident hit before (progress-tracker.md), except here it
// meant the authenticated socket path could never have been verified at
// all, by anyone, regardless of whether a real Privy token was available --
// not just that nobody had tried yet.
dotenv.config({ path: ".env.local", override: true });
