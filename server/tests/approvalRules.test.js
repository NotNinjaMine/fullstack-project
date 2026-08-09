const { matchesTier, effectiveTeam } = require("../services/delegationService");

describe("approval routing invariants", () => {
    test("Supervisor and Manager act only at their own stages", () => {
        expect(matchesTier("SUPERVISOR", "PENDING_SUPERVISOR")).toBe(true);
        expect(matchesTier("SUPERVISOR", "PENDING_MANAGER")).toBe(false);
        expect(matchesTier("MANAGER", "PENDING_MANAGER")).toBe(true);
        expect(matchesTier("MANAGER", "PENDING_SUPERVISOR")).toBe(false);
    });

    test("delegation never replaces the employee's original team", () => {
        const request = {
            routedTeam: "Delegate Team",
            employee: { team: "Employee Team" }
        };
        expect(effectiveTeam(request)).toBe("Employee Team");
    });
});
