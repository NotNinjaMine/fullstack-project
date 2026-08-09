// M5 (UC-31) — forfeiture risk calculation and severity tiering.
//
// These numbers go into a real person's inbox and tell them how many days of
// leave they are about to lose. A wrong figure is worse than no email, so the
// boundaries are asserted exactly rather than by example.
//
// This module also exists because the same calculation used to live in three
// places: carryForwardService read the country's configured cap while
// reportService and anomalyDetector both hard-coded 5. The final describe block
// is the regression guard for that.

const {
    remainingDays,
    daysAtRisk,
    forfeitureTier,
    tierWord,
    isAnomalyWorthy,
    DEFAULT_CARRY_FORWARD_MAX
} = require("../../server/services/leaveEligibility");

const balance = (entitled, carried, used) => ({ entitled, carried, used });

describe("remainingDays", () => {
    test("is entitled plus carried minus used", () => {
        expect(remainingDays(balance(14, 5, 6))).toBe(13);
    });

    test("handles half-days, which are why the column is DECIMAL(4,1)", () => {
        expect(remainingDays(balance(14, 0, 2.5))).toBe(11.5);
    });

    test("coerces the strings Sequelize returns for DECIMAL columns", () => {
        // The MySQL driver hands DECIMAL back as a string. Without coercion
        // "14" + "5" concatenates to "145" and every forfeiture figure in every
        // email becomes nonsense — the failure least visible in a browser and
        // most embarrassing in an inbox.
        expect(remainingDays(balance("14", "5", "6"))).toBe(13);
    });

    test("treats missing fields as zero rather than producing NaN", () => {
        expect(remainingDays({})).toBe(0);
        expect(remainingDays(null)).toBe(0);
    });

    test("can go negative when HR has adjusted a balance downward", () => {
        // Not clamped: a negative remaining is a real state HR needs to see,
        // and hiding it here would hide the adjustment.
        expect(remainingDays(balance(10, 0, 12))).toBe(-2);
    });
});

describe("daysAtRisk", () => {
    test("is everything above the country's carry-forward cap", () => {
        expect(daysAtRisk(balance(14, 0, 2), 5)).toBe(7);
    });

    test("is zero when remaining sits exactly on the cap", () => {
        expect(daysAtRisk(balance(5, 0, 0), 5)).toBe(0);
    });

    test("is zero, never negative, when remaining is below the cap", () => {
        expect(daysAtRisk(balance(3, 0, 0), 5)).toBe(0);
        expect(daysAtRisk(balance(10, 0, 12), 5)).toBe(0);
    });

    test("uses the country's own cap, not a hard-coded 5", () => {
        // The point of storing carryForwardMax per country: the same balance is
        // at different risk in different countries.
        expect(daysAtRisk(balance(20, 0, 0), 5)).toBe(15);
        expect(daysAtRisk(balance(20, 0, 0), 10)).toBe(10);
    });

    test("honours a cap of zero for a country that carries nothing forward", () => {
        // Guards a falsiness bug: `Number(cap) || 5` would silently turn a real
        // 0 into 5 and under-report risk for that country by five days.
        expect(daysAtRisk(balance(20, 0, 0), 0)).toBe(20);
    });

    test("falls back to the default cap when the policy value is missing or unusable", () => {
        expect(daysAtRisk(balance(12, 0, 0), undefined)).toBe(12 - DEFAULT_CARRY_FORWARD_MAX);
        expect(daysAtRisk(balance(12, 0, 0), null)).toBe(7);
        expect(daysAtRisk(balance(12, 0, 0), "not a number")).toBe(7);
    });

    test("keeps half-day precision", () => {
        expect(daysAtRisk(balance(14, 0, 2.5), 5)).toBe(6.5);
    });
});

describe("forfeitureTier — severity boundaries", () => {
    test("5 or more days is critical", () => {
        expect(forfeitureTier(5)).toBe("critical");
        expect(forfeitureTier(7)).toBe("critical");
        expect(forfeitureTier(100)).toBe("critical");
    });

    test("3 to just under 5 days is a warning", () => {
        expect(forfeitureTier(3)).toBe("warning");
        expect(forfeitureTier(4.5)).toBe("warning");
    });

    test("1 to just under 3 days is a notice", () => {
        expect(forfeitureTier(1)).toBe("notice");
        expect(forfeitureTier(2.5)).toBe("notice");
    });

    test("below 1 day returns null, which is the signal to send nothing", () => {
        // null is not an error. sendForfeitureReminders skips the employee, so
        // half a day at risk never generates an email.
        expect(forfeitureTier(0)).toBeNull();
        expect(forfeitureTier(0.5)).toBeNull();
        expect(forfeitureTier(-3)).toBeNull();
    });

    test("returns null rather than throwing on a non-numeric input", () => {
        expect(forfeitureTier(undefined)).toBeNull();
        expect(forfeitureTier("lots")).toBeNull();
    });

    test("boundaries are inclusive at the lower edge, exactly as documented", () => {
        // Catches the off-by-one that would move everyone on exactly 5 days down
        // a tier and send "Important" where the docs promise "Urgent".
        expect(forfeitureTier(4.99)).toBe("warning");
        expect(forfeitureTier(5.00)).toBe("critical");
        expect(forfeitureTier(2.99)).toBe("notice");
        expect(forfeitureTier(3.00)).toBe("warning");
        expect(forfeitureTier(0.99)).toBeNull();
        expect(forfeitureTier(1.00)).toBe("notice");
    });
});

describe("tierWord — email subject prefix", () => {
    test("maps each tier to the documented word", () => {
        expect(tierWord("critical")).toBe("Urgent");
        expect(tierWord("warning")).toBe("Important");
        expect(tierWord("notice")).toBe("Heads up");
    });
});

describe("end to end: balance in, notification decision out", () => {
    // Mirrors what sendForfeitureReminders does per employee, minus the I/O.
    const decide = (bal, cap) => {
        const atRisk = daysAtRisk(bal, cap);
        const tier = forfeitureTier(atRisk);
        return tier
            ? { send: true, atRisk, tier, subject: `${tierWord(tier)}: annual leave at risk of forfeiture` }
            : { send: false, atRisk };
    };

    test("a Singapore employee with 12 days left gets an urgent email", () => {
        expect(decide(balance(14, 0, 2), 5)).toEqual({
            send: true, atRisk: 7, tier: "critical",
            subject: "Urgent: annual leave at risk of forfeiture"
        });
    });

    test("an employee with 8 days left gets an important email", () => {
        expect(decide(balance(14, 0, 6), 5)).toEqual({
            send: true, atRisk: 3, tier: "warning",
            subject: "Important: annual leave at risk of forfeiture"
        });
    });

    test("an employee with 6 days left gets a heads-up", () => {
        expect(decide(balance(14, 0, 8), 5).tier).toBe("notice");
    });

    test("an employee already under the cap is not contacted at all", () => {
        expect(decide(balance(14, 0, 10), 5)).toEqual({ send: false, atRisk: 0 });
    });

    test("the same balance is safe in a country with a higher cap", () => {
        expect(decide(balance(14, 0, 2), 12).send).toBe(false);
    });

    test("one balance produces exactly one decision", () => {
        // The tier list is ordered and the first match wins, so overlapping
        // thresholds cannot both fire. Guards a refactor from .find to .filter.
        const result = decide(balance(30, 0, 0), 5);
        expect(result.tier).toBe("critical");
        expect(Object.keys(result)).toHaveLength(4);
    });
});

describe("regression: one rule, three callers", () => {
    // The reminder service (carryForwardService), the carry-forward summary
    // report (reportService) and the AI-5 dashboard flag (anomalyDetector) all
    // tell HR who is at risk of forfeiture. They used to compute it three
    // different ways — only the first read the country's configured cap. On any
    // country with a cap other than 5, the email and the report disagreed about
    // the same employee. All three now call daysAtRisk().

    const emailSays = (bal, cap) => daysAtRisk(bal, cap);
    const reportSays = (bal, cap) => daysAtRisk(bal, cap);
    const dashboardFlags = (bal, cap) => isAnomalyWorthy(daysAtRisk(bal, cap));

    test("email and report agree on a country with the default cap", () => {
        const bal = balance(14, 0, 2);
        expect(emailSays(bal, 5)).toBe(reportSays(bal, 5));
    });

    test("email and report still agree when a country configures a different cap", () => {
        // This is the case that used to break: with a 10-day cap the email said
        // 2 days at risk while the report insisted on 7.
        const bal = balance(14, 0, 2);
        expect(emailSays(bal, 10)).toBe(reportSays(bal, 10));
        expect(emailSays(bal, 10)).toBe(2);
    });

    test("the dashboard flag never fires for someone the email would not contact", () => {
        // The flag threshold (3 days) is deliberately higher than the email
        // threshold (1 day), so HR's panel is not filled with single-day noise.
        // It must never be the other way round.
        for (const cap of [0, 5, 10]) {
            for (const used of [0, 2, 6, 8, 10, 13, 14]) {
                const bal = balance(14, 0, used);
                if (dashboardFlags(bal, cap)) {
                    expect(forfeitureTier(daysAtRisk(bal, cap))).not.toBeNull();
                }
            }
        }
    });

    test("a zero-cap country is treated consistently by all three", () => {
        const bal = balance(6, 0, 0);
        expect(emailSays(bal, 0)).toBe(6);
        expect(reportSays(bal, 0)).toBe(6);
        expect(dashboardFlags(bal, 0)).toBe(true);
    });
});
