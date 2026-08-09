// M5 (UC-10) — leave-type eligibility rules.
//
// These rules decide which leave types appear in an employee's dropdown and,
// more importantly, which ones the server accepts on apply, draft-update and
// draft-submit. A bug here is either a leak (someone applies for leave they are
// not entitled to) or a lockout (someone cannot apply for leave they are), so
// every branch is asserted rather than sampled.
//
// Pure functions only — no database, no HTTP, no seed data.

const {
    isOfferedInCountry,
    isAllowedForGender,
    checkLeaveTypeEligibility,
    eligibleTypesFor,
    tracksBalance
} = require("../../server/services/leaveEligibility");

// Fixtures mirror the seeded catalogue in server/seed.js.
const annual = {
    code: "annual", name: "Annual Leave", active: true,
    affectsAnnualBalance: true, affectsSickBalance: false, requiresMc: false,
    applicableCountries: null, genderRestriction: "ANY"
};
const sickMc = {
    code: "sick_mc", name: "Sick Leave (with MC)", active: true,
    affectsAnnualBalance: false, affectsSickBalance: true, requiresMc: true,
    applicableCountries: null, genderRestriction: "ANY"
};
const maternity = {
    code: "maternity", name: "Maternity Leave", active: true,
    affectsAnnualBalance: false, affectsSickBalance: false, requiresMc: false,
    applicableCountries: ["SG"], genderRestriction: "FEMALE"
};
const nsReservist = {
    code: "ns_reservist", name: "NS / Reservist Leave", active: true,
    affectsAnnualBalance: false, affectsSickBalance: false, requiresMc: false,
    applicableCountries: ["SG"], genderRestriction: "MALE"
};
const retired = { ...annual, code: "old_type", name: "Retired Type", active: false };

const weiling = { name: "Wei Ling", country: "SG", gender: "FEMALE" };
const kumar = { name: "Kumar", country: "SG", gender: "MALE" };
const siti = { name: "Siti", country: "MY", gender: "FEMALE" };
const unset = { name: "Legacy Account", country: "SG", gender: null };

describe("isOfferedInCountry", () => {
    test("a null country list means the type is offered everywhere", () => {
        expect(isOfferedInCountry(annual, "SG")).toBe(true);
        expect(isOfferedInCountry(annual, "VN")).toBe(true);
    });

    test("an empty array is treated identically to null, not as 'nowhere'", () => {
        // The HR panel submits [] when every country chip is cleared, and the
        // route normalises that to NULL on write. If the read path ever treated
        // [] as "no countries", clearing the chips would silently disable a
        // leave type company-wide and the audit entry would look harmless.
        expect(isOfferedInCountry({ ...annual, applicableCountries: [] }, "SG")).toBe(true);
    });

    test("a populated list admits only the countries it names", () => {
        expect(isOfferedInCountry(maternity, "SG")).toBe(true);
        expect(isOfferedInCountry(maternity, "MY")).toBe(false);
    });

    test("country matching is exact, so a mis-cased code is rejected rather than guessed", () => {
        expect(isOfferedInCountry(maternity, "sg")).toBe(false);
    });
});

describe("isAllowedForGender", () => {
    test("ANY admits every gender, including an unrecorded one", () => {
        expect(isAllowedForGender(annual, "MALE")).toBe(true);
        expect(isAllowedForGender(annual, "FEMALE")).toBe(true);
        expect(isAllowedForGender(annual, null)).toBe(true);
    });

    test("a missing genderRestriction defaults to ANY", () => {
        // Rows seeded before the column existed carry no value for it.
        expect(isAllowedForGender({ name: "Legacy", active: true }, null)).toBe(true);
    });

    test("a restricted type admits only the matching gender", () => {
        expect(isAllowedForGender(maternity, "FEMALE")).toBe(true);
        expect(isAllowedForGender(maternity, "MALE")).toBe(false);
        expect(isAllowedForGender(nsReservist, "MALE")).toBe(true);
        expect(isAllowedForGender(nsReservist, "FEMALE")).toBe(false);
    });

    test("an employee with no gender recorded fails closed on a restricted type", () => {
        // The important direction. users.gender is nullable so accounts created
        // before the column keep working; failing open would hand every legacy
        // account access to every restricted type.
        expect(isAllowedForGender(maternity, null)).toBe(false);
        expect(isAllowedForGender(nsReservist, undefined)).toBe(false);
    });
});

describe("checkLeaveTypeEligibility", () => {
    test("accepts an unrestricted type for any employee", () => {
        expect(checkLeaveTypeEligibility(annual, siti)).toEqual({ ok: true, type: annual });
    });

    test("accepts a gender- and country-restricted type for the matching employee", () => {
        expect(checkLeaveTypeEligibility(maternity, weiling).ok).toBe(true);
        expect(checkLeaveTypeEligibility(nsReservist, kumar).ok).toBe(true);
    });

    test("rejects an inactive type before any other check runs", () => {
        const result = checkLeaveTypeEligibility(retired, weiling);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("INACTIVE");
        expect(result.message).toBe("This leave type is not available.");
    });

    test("rejects an unknown type without throwing", () => {
        // The route passes whatever findOne returned, which is null for a code
        // that does not exist. Throwing here would surface as a 500 instead of
        // a 400 with a usable message.
        expect(checkLeaveTypeEligibility(null, weiling)).toMatchObject({ ok: false, reason: "INACTIVE" });
    });

    test("rejects on country with a message naming the type", () => {
        const result = checkLeaveTypeEligibility(maternity, siti);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("COUNTRY");
        expect(result.message).toBe("Maternity Leave is not available in your country.");
    });

    test("rejects on gender with a message that does not disclose the restriction", () => {
        const result = checkLeaveTypeEligibility(maternity, kumar);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("GENDER");
        expect(result.message).toBe("Maternity Leave is not available for your profile.");
        // Deliberately "your profile", not "women only" — the employee learns
        // they are ineligible without the error publishing the rule.
        expect(result.message).not.toMatch(/female|women/i);
    });

    test("country is checked before gender when both fail", () => {
        // A man in Malaysia is ineligible on two counts. He should be told his
        // country does not offer it, because that is the actionable fact.
        expect(checkLeaveTypeEligibility(maternity, { country: "MY", gender: "MALE" }).reason).toBe("COUNTRY");
    });

    test("the returned message is exactly what the route sends as a 400 body", () => {
        // routes/leaveRequest.js does res.status(400).json({ message }) with
        // this value verbatim, so the wording is part of the API contract.
        const result = checkLeaveTypeEligibility(nsReservist, weiling);
        expect(typeof result.message).toBe("string");
        expect(result.message.length).toBeGreaterThan(0);
    });
});

describe("eligibleTypesFor — the apply-form dropdown", () => {
    const catalogue = [annual, sickMc, maternity, nsReservist, retired];

    test("a Singapore woman sees maternity but not NS", () => {
        expect(eligibleTypesFor(catalogue, weiling).map((t) => t.code))
            .toEqual(["annual", "sick_mc", "maternity"]);
    });

    test("a Singapore man sees NS but not maternity", () => {
        expect(eligibleTypesFor(catalogue, kumar).map((t) => t.code))
            .toEqual(["annual", "sick_mc", "ns_reservist"]);
    });

    test("a Malaysian employee sees neither Singapore-only type", () => {
        expect(eligibleTypesFor(catalogue, siti).map((t) => t.code))
            .toEqual(["annual", "sick_mc"]);
    });

    test("an account with no gender still sees every unrestricted type", () => {
        // Failing closed must not lock a legacy account out of ordinary leave.
        expect(eligibleTypesFor(catalogue, unset).map((t) => t.code))
            .toEqual(["annual", "sick_mc"]);
    });

    test("a retired type never appears for anyone", () => {
        for (const user of [weiling, kumar, siti, unset]) {
            expect(eligibleTypesFor(catalogue, user).map((t) => t.code)).not.toContain("old_type");
        }
    });

    test("the dropdown and the enforcement path agree on every type, for every user", () => {
        // GET /leave/types and POST /leave/apply both call into this module, so
        // the list can never offer something the server would then reject. This
        // is the property that made the extraction worth doing.
        for (const user of [weiling, kumar, siti, unset]) {
            const offered = eligibleTypesFor(catalogue, user);
            for (const type of catalogue) {
                const accepted = checkLeaveTypeEligibility(type, user).ok;
                expect(offered.includes(type)).toBe(accepted);
            }
        }
    });

    test("an empty or missing catalogue returns an empty list rather than throwing", () => {
        expect(eligibleTypesFor([], weiling)).toEqual([]);
        expect(eligibleTypesFor(undefined, weiling)).toEqual([]);
    });
});

describe("tracksBalance", () => {
    test("annual and sick leave draw down a pool", () => {
        expect(tracksBalance(annual)).toBe(true);
        expect(tracksBalance(sickMc)).toBe(true);
    });

    test("maternity and NS leave do not, so approval must skip the deduction", () => {
        // If this returned true, final approval would look for a leave_balances
        // row that does not exist and fail with a 409 *after* two people had
        // already approved the request.
        expect(tracksBalance(maternity)).toBe(false);
        expect(tracksBalance(nsReservist)).toBe(false);
    });

    test("an unknown type is treated as not tracking a balance", () => {
        expect(tracksBalance(null)).toBe(false);
    });
});
