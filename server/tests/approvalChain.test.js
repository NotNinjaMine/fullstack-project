// The approval chain is the highest-consequence rule in the app: get it wrong
// and someone approves their own leave, or a request lands in a queue nobody
// can see. These are pure functions, so the whole matrix is covered without a
// database - the same style as tests/approvalRules.test.js.
const chain = require("../services/approvalChain");
const { canActOn, matchesTier } = require("../services/delegationService");

const A = "Compliance Team A";
const B = "Compliance Team B";

const employee = { id: 1, role: "EMPLOYEE", team: A };
const supervisorA = { id: 2, role: "SUPERVISOR", team: A };
const supervisorB = { id: 3, role: "SUPERVISOR", team: B };
const managerA = { id: 4, role: "MANAGER", team: A };
const managerB = { id: 5, role: "MANAGER", team: B };
const hrAdmin = { id: 6, role: "HR_ADMIN", team: A };
const boss = { id: 7, role: "BOSS", team: A };

// A request as canActOn sees it: the applicant is on `employee`.
const requestFrom = (applicant, status) => ({
    employeeId: applicant.id,
    status,
    employee: applicant
});

describe("where each role's leave enters the chain", () => {
    test("an Employee and an HR Admin both start at the Supervisor tier", () => {
        expect(chain.initialStatusFor("EMPLOYEE")).toBe("PENDING_SUPERVISOR");
        expect(chain.initialStatusFor("HR_ADMIN")).toBe("PENDING_SUPERVISOR");
    });

    test("a Supervisor starts at the Manager tier", () => {
        expect(chain.initialStatusFor("SUPERVISOR")).toBe("PENDING_MANAGER");
    });

    test("a Manager goes up to the Boss, and the Boss back down to the Managers", () => {
        expect(chain.initialStatusFor("MANAGER")).toBe("PENDING_BOSS");
        expect(chain.initialStatusFor("BOSS")).toBe("PENDING_MANAGER");
    });
});

describe("stage progression", () => {
    test("only the Supervisor stage hands the request on; every other is final", () => {
        expect(chain.nextStatusAfterApproval("PENDING_SUPERVISOR")).toBe("PENDING_MANAGER");
        expect(chain.nextStatusAfterApproval("PENDING_MANAGER")).toBe("APPROVED");
        expect(chain.nextStatusAfterApproval("PENDING_BOSS")).toBe("APPROVED");
        expect(chain.isFinalStage("PENDING_SUPERVISOR")).toBe(false);
        expect(chain.isFinalStage("PENDING_MANAGER")).toBe(true);
        expect(chain.isFinalStage("PENDING_BOSS")).toBe(true);
    });

    test("each approving role owns exactly one stage", () => {
        expect(matchesTier("SUPERVISOR", "PENDING_SUPERVISOR")).toBe(true);
        expect(matchesTier("MANAGER", "PENDING_MANAGER")).toBe(true);
        expect(matchesTier("BOSS", "PENDING_BOSS")).toBe(true);
        expect(matchesTier("BOSS", "PENDING_MANAGER")).toBe(false);
        expect(matchesTier("MANAGER", "PENDING_BOSS")).toBe(false);
        // HR Admin approves nobody any more.
        expect(matchesTier("HR_ADMIN", "PENDING_MANAGER")).toBe(false);
        expect(matchesTier("HR_ADMIN", "PENDING_SUPERVISOR")).toBe(false);
    });
});

describe("who may decide an ordinary request", () => {
    test("an Employee is decided by their own team, Supervisor then Manager", () => {
        expect(canActOn(supervisorA, requestFrom(employee, "PENDING_SUPERVISOR"))).toBe(true);
        expect(canActOn(supervisorB, requestFrom(employee, "PENDING_SUPERVISOR"))).toBe(false);
        expect(canActOn(managerA, requestFrom(employee, "PENDING_SUPERVISOR"))).toBe(false);
        expect(canActOn(managerA, requestFrom(employee, "PENDING_MANAGER"))).toBe(true);
    });

    test("an HR Admin's own leave runs the ordinary chain, not a special one", () => {
        expect(canActOn(supervisorA, requestFrom(hrAdmin, "PENDING_SUPERVISOR"))).toBe(true);
        expect(canActOn(managerA, requestFrom(hrAdmin, "PENDING_MANAGER"))).toBe(true);
        // ... and another HR Admin has no say in it.
        const otherHr = { id: 8, role: "HR_ADMIN", team: A };
        expect(canActOn(otherHr, requestFrom(hrAdmin, "PENDING_MANAGER"))).toBe(false);
    });

    test("a Supervisor's own leave is a Manager's call only", () => {
        expect(canActOn(managerA, requestFrom(supervisorA, "PENDING_MANAGER"))).toBe(true);
        expect(canActOn(managerB, requestFrom(supervisorA, "PENDING_MANAGER"))).toBe(false);
        expect(canActOn(supervisorB, requestFrom(supervisorA, "PENDING_MANAGER"))).toBe(false);
        expect(canActOn(boss, requestFrom(supervisorA, "PENDING_MANAGER"))).toBe(false);
    });

    test("HR Admin can no longer decide anyone's leave", () => {
        expect(canActOn(hrAdmin, requestFrom(employee, "PENDING_MANAGER"))).toBe(false);
        expect(canActOn(hrAdmin, requestFrom(managerA, "PENDING_BOSS"))).toBe(false);
        expect(canActOn(hrAdmin, requestFrom(boss, "PENDING_MANAGER"))).toBe(false);
    });
});

describe("executive leave is decided by role, company-wide", () => {
    test("a Manager's leave is the Boss's call, whatever team they are on", () => {
        expect(canActOn(boss, requestFrom(managerA, "PENDING_BOSS"))).toBe(true);
        expect(canActOn(boss, requestFrom(managerB, "PENDING_BOSS"))).toBe(true);
        expect(canActOn(managerB, requestFrom(managerA, "PENDING_BOSS"))).toBe(false);
        expect(canActOn(supervisorA, requestFrom(managerA, "PENDING_BOSS"))).toBe(false);
    });

    test("the Boss's leave is decided by any Manager", () => {
        expect(canActOn(managerA, requestFrom(boss, "PENDING_MANAGER"))).toBe(true);
        expect(canActOn(managerB, requestFrom(boss, "PENDING_MANAGER"))).toBe(true);
        expect(canActOn(supervisorA, requestFrom(boss, "PENDING_MANAGER"))).toBe(false);
    });
});

describe("nobody decides their own leave, at any level", () => {
    test.each([
        ["Supervisor", supervisorA, "PENDING_MANAGER"],
        ["Manager", managerA, "PENDING_BOSS"],
        ["Boss", boss, "PENDING_MANAGER"],
        ["HR Admin", hrAdmin, "PENDING_SUPERVISOR"]
    ])("%s cannot act on their own request", (_label, person, status) => {
        expect(canActOn(person, requestFrom(person, status))).toBe(false);
    });
});
