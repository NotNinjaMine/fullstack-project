// Demo data seeder: node seed.js  (or: npm run seed)
// Creates the Compliance Team A accounts (password: demo123!), balances,
// SG 2026 public holidays, and a few requests so both queues have content.
const bcrypt = require('bcrypt');
const db = require('./models');
const { User, LeaveBalance, PublicHoliday, LeaveRequest, AuditLog } = db;

const YEAR = 2026;

async function main() {
    await db.sequelize.sync({ alter: true });

    const password = await bcrypt.hash("demo123!", 10);
    const mk = (name, email, role, initials) =>
        ({ name, email, password, role, country: "SG", team: "Compliance Team A", initials });

    const [weiling] = await User.findOrCreate({ where: { email: "weiling@innovare.com" }, defaults: mk("Tan Wei Ling", "weiling@innovare.com", "EMPLOYEE", "WL") });
    const [marcus] = await User.findOrCreate({ where: { email: "marcus@innovare.com" }, defaults: mk("Marcus Lim", "marcus@innovare.com", "SUPERVISOR", "ML") });
    const [priya] = await User.findOrCreate({ where: { email: "priya@innovare.com" }, defaults: mk("Priya Nair", "priya@innovare.com", "EMPLOYEE", "PN") });
    const [kumar] = await User.findOrCreate({ where: { email: "kumar@innovare.com" }, defaults: mk("Kumar Rajan", "kumar@innovare.com", "EMPLOYEE", "KR") });
    const [faridah] = await User.findOrCreate({ where: { email: "faridah@innovare.com" }, defaults: mk("Faridah Osman", "faridah@innovare.com", "EMPLOYEE", "FO") });
    const [diana] = await User.findOrCreate({ where: { email: "diana@innovare.com" }, defaults: mk("Diana Koh", "diana@innovare.com", "MANAGER", "DK") });

    // Balances (SG: 14 annual min, carry cap 5)
    const bal = async (user, leaveType, entitled, carried, used) =>
        LeaveBalance.findOrCreate({
            where: { userId: user.id, leaveType, year: YEAR },
            defaults: { entitled, carried, used }
        });
    for (const [u, a, c, used] of [[weiling, 14, 5, 7.5], [priya, 14, 2, 6], [kumar, 14, 4, 10], [faridah, 14, 0, 5], [marcus, 18, 3, 4], [diana, 21, 5, 6]]) {
        await bal(u, "annual", a, c, used);
        await bal(u, "sick_mc", 12, 0, 0);
        await bal(u, "sick_nomc", 2, 0, 0);
    }

    // SG public holidays (subset for demo; import the full list via /holiday/import)
    for (const [date, name] of [
        ["2026-08-09", "National Day"],
        ["2026-08-10", "National Day (in lieu)"],
        ["2026-09-24", "Deepavali (est.)"],
        ["2026-12-25", "Christmas Day"]
    ]) {
        await PublicHoliday.findOrCreate({ where: { country: "SG", date }, defaults: { name, country: "SG", date } });
    }

    // Approved leave so AI-2/AI-3 coverage has data
    const approve = async (user, startDate, endDate, days) => {
        const [r, created] = await LeaveRequest.findOrCreate({
            where: { employeeId: user.id, startDate, endDate },
            defaults: { leaveType: "annual", days, reason: "Seeded approved leave", status: "APPROVED", halfDay: false }
        });
        if (created) await AuditLog.create({ requestId: r.id, actorName: "Seeder", action: "Approved (seed)" });
    };
    await approve(marcus, "2026-07-13", "2026-07-15", 3);
    await approve(priya, "2026-07-14", "2026-07-14", 1);
    await approve(kumar, "2026-07-20", "2026-07-24", 5);
    await approve(faridah, "2026-07-22", "2026-07-23", 2);
    await approve(kumar, "2026-08-03", "2026-08-07", 5);

    // Pending requests so queues are populated
    const [p1, c1] = await LeaveRequest.findOrCreate({
        where: { employeeId: priya.id, startDate: "2026-07-27", endDate: "2026-07-27" },
        defaults: { leaveType: "annual", days: 1, reason: "Personal errand", status: "PENDING_SUPERVISOR", halfDay: false, flagged: false }
    });
    if (c1) await AuditLog.create({ requestId: p1.id, actorName: priya.name, action: "Submitted" });

    const [p2, c2] = await LeaveRequest.findOrCreate({
        where: { employeeId: kumar.id, startDate: "2026-08-12", endDate: "2026-08-12" },
        defaults: { leaveType: "sick_mc", days: 1, reason: "Specialist appointment (MC to follow)", status: "PENDING_MANAGER", halfDay: false, flagged: false }
    });
    if (c2) {
        await AuditLog.create({ requestId: p2.id, actorName: kumar.name, action: "Submitted" });
        await AuditLog.create({ requestId: p2.id, actorName: marcus.name, action: "Approved by Supervisor - routed to Manager" });
    }

    console.log("Seed complete. Accounts (password demo123!):");
    console.log("  weiling@innovare.com  (EMPLOYEE)");
    console.log("  priya@innovare.com    (EMPLOYEE)");
    console.log("  kumar@innovare.com    (EMPLOYEE)");
    console.log("  faridah@innovare.com  (EMPLOYEE)");
    console.log("  marcus@innovare.com   (SUPERVISOR)");
    console.log("  diana@innovare.com    (MANAGER)");
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
