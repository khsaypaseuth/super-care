/**
 * @super-care/shared/order — public barrel
 *
 * Exports the headless Order state machine and its pure transition function.
 * `next(state, event)` throws `IllegalTransition` for illegal transitions (ORD-02).
 */
export { next, orderMachine, IllegalTransition } from "./order.machine.js";
