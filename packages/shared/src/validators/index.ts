/**
 * @super-care/shared validators barrel (VEH-02, CUST-05, CUST-06)
 *
 * Re-exports all five pure identifier validators. Consumed via the
 * `@super-care/shared/validators` subpath export in package.json.
 *
 * All validators are pure deterministic functions:
 *   - No LLM, no I/O, no side effects (§A3 structural guarantee)
 *   - No `any` (PLAT-01 strict TypeScript)
 */
export { isValidThaiNationalId } from "./thai-national-id.js";
export { isValidPassport } from "./passport.js";
export { isValidPlate } from "./plate.js";
export { isValidChassis } from "./chassis.js";
export { isValidEngine } from "./engine.js";
