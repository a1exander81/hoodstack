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
dotenv.config({ path: ".env.local" });
