const { todayISO } = require("../services/businessTime");

describe("Singapore business dates", () => {
    test("00:30 SGT is already the next calendar date even while UTC is yesterday", () => {
        const instant = new Date("2026-08-03T16:30:00.000Z");
        expect(todayISO(instant)).toBe("2026-08-04");
    });
});
