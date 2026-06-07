/**
 * @super-care/shared/order — public barrel
 *
 * Exports the headless Order state machine and its pure transition function.
 * `next(state, event)` throws `IllegalTransition` for illegal transitions (ORD-02).
 *
 * Also exports ORDER_STATES — the canonical readonly tuple of all 12 Order lifecycle states.
 * Drift is enforced by order-states.spec.ts against both the machine TRANSITIONS and schema.prisma.
 */
export { next, orderMachine, IllegalTransition } from "./order.machine.js";
export { ORDER_STATES, type OrderStateValue } from "./order-states.js";
