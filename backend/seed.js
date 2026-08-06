// Demo data seeder: node seed.js  (or: npm run seed)
// Creates the 10 country leave policies, the FULL 2026 public-holiday calendar
// for all 10 countries, the Compliance Team A accounts (password: demo123!),
// balances per country policy, and a few requests so both queues have content.
const bcrypt = require('bcryptjs');
const db = require('./models');
const { User, LeaveBalance, PublicHoliday, LeavePolicy, LeaveRequest, AuditLog,
    LeaveType, CountryWorkingDays, MinStaffing, BlackoutPeriod } = db;
const HOLIDAYS_2026 = require('./data/holidays2026');
const totp = require('./services/totpService');
const QRCode = require('qrcode');

const YEAR = 2026;

// Per-country statutory policies (HLD §5.3). Employees in each country get
// their entitlement within [annualMin, annualMax] and that country's holidays.
const POLICIES = [
    { country: "SG", countryName: "Singapore",   annualMin: 14, annualMax: 24, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
    { country: "TH", countryName: "Thailand",    annualMin: 8,  annualMax: 11, sickMc: 30, sickNoMc: 0, carryForwardMax: 5 },
    { country: "CN", countryName: "China",       annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
    { country: "ID", countryName: "Indonesia",   annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
    { country: "JP", countryName: "Japan",       annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
    { country: "MY", countryName: "Malaysia",    annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
    { country: "MM", countryName: "Myanmar",     annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
    { country: "NZ", countryName: "New Zealand", annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
    { country: "PH", countryName: "Philippines", annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
    { country: "VN", countryName: "Vietnam",     annualMin: 12, annualMax: 14, sickMc: 12, sickNoMc: 2, carryForwardMax: 5 },
];

async function main() {
    await db.sequelize.sync({ alter: true });

    // 1. Country policies
    for (const p of POLICIES) {
        await LeavePolicy.findOrCreate({ where: { country: p.country }, defaults: p });
    }
    console.log(`Seeded ${POLICIES.length} country leave policies.`);

    // 2. Full 2026 public-holiday calendar, all 10 countries (UC-06/UC-07)
    let added = 0;
    for (const h of HOLIDAYS_2026) {
        const [, created] = await PublicHoliday.findOrCreate({
            where: { country: h.country, date: h.date },
            defaults: h
        });
        if (created) added++;
    }
    console.log(`Seeded 2026 holidays: ${added} new (of ${HOLIDAYS_2026.length}).`);

    // 3. Accounts
    const password = await bcrypt.hash("demo123!", 10);
    // Demo phone numbers (E.164) so the "text message" option on the 2-step
    // verification screen is selectable for every demo account. These are
    // placeholder numbers for the demo — with no SMS provider configured the code
    // is shown on screen instead of actually being texted.
    const mk = (name, email, role, initials, country = "SG", team = "Compliance Team A", phone = null) =>
        ({ name, email, password, role, country, team, initials, phone });

    const [weiling] = await User.findOrCreate({ where: { email: "weiling@innovare.com" }, defaults: mk("Tan Wei Ling", "weiling@innovare.com", "EMPLOYEE", "WL", "SG", "Compliance Team A", "+6591230001") });
    const [marcus] = await User.findOrCreate({ where: { email: "marcus@innovare.com" }, defaults: mk("Marcus Lim", "marcus@innovare.com", "SUPERVISOR", "ML", "SG", "Compliance Team A", "+6591230002") });
    const [priya] = await User.findOrCreate({ where: { email: "priya@innovare.com" }, defaults: mk("Priya Nair", "priya@innovare.com", "EMPLOYEE", "PN", "SG", "Compliance Team A", "+6591230003") });
    const [kumar] = await User.findOrCreate({ where: { email: "kumar@innovare.com" }, defaults: mk("Kumar Rajan", "kumar@innovare.com", "EMPLOYEE", "KR", "SG", "Compliance Team A", "+6591230004") });
    const [faridah] = await User.findOrCreate({ where: { email: "faridah@innovare.com" }, defaults: mk("Faridah Osman", "faridah@innovare.com", "EMPLOYEE", "FO", "SG", "Compliance Team A", "+6591230005") });
    const [diana] = await User.findOrCreate({ where: { email: "diana@innovare.com" }, defaults: mk("Diana Koh", "diana@innovare.com", "MANAGER", "DK", "SG", "Compliance Team A", "+6591230006") });
    // Regional staff — log in as these to see a DIFFERENT holiday calendar and
    // a DIFFERENT statutory entitlement, driven purely by users.country.
    const [linh] = await User.findOrCreate({ where: { email: "linh@innovare.com" }, defaults: mk("Nguyen Thi Linh", "linh@innovare.com", "EMPLOYEE", "NL", "VN", "Compliance Team A", "+84901230007") });
    const [somchai] = await User.findOrCreate({ where: { email: "somchai@innovare.com" }, defaults: mk("Somchai Prasert", "somchai@innovare.com", "EMPLOYEE", "SP", "TH", "Compliance Team A", "+66801230008") });
    // M5: HR administrator — the only role that reaches the HR admin console.
    const [hradmin] = await User.findOrCreate({ where: { email: "hr@innovare.com" }, defaults: mk("Aisha Rahman", "hr@innovare.com", "HR_ADMIN", "AR", "SG", "Compliance Team A", "+6591230009") });
    // M1: a SECOND HR Admin. Needed to demonstrate both halves of the
    // leadership-approval rule: an HR Admin's own leave must not appear in
    // their own queue, but must appear in the other HR Admin's. With a single
    // HR Admin the second half is invisible.
    const [hradmin2] = await User.findOrCreate({ where: { email: "hr2@innovare.com" }, defaults: mk("Daniel Ong", "hr2@innovare.com", "HR_ADMIN", "DO", "SG", "Compliance Team A", "+6591230012") });
    // M3: a second Supervisor + Manager on a different team, so there is a
    // valid same-role peer to delegate approvals to (delegation is role-matched:
    // a Supervisor can only delegate to another Supervisor, a Manager to another
    // Manager — see services/delegationService.js). Delegating across teams also
    // makes the "acting for" queue clearly demonstrable.
    const [aiden] = await User.findOrCreate({ where: { email: "aiden@innovare.com" }, defaults: mk("Aiden Goh", "aiden@innovare.com", "SUPERVISOR", "AG", "SG", "Compliance Team B", "+6591230010") });
    const [grace] = await User.findOrCreate({ where: { email: "grace@innovare.com" }, defaults: mk("Grace Tan", "grace@innovare.com", "MANAGER", "GT", "SG", "Compliance Team B", "+6591230011") });

    // Backfill: findOrCreate leaves existing rows untouched, so accounts created by
    // an earlier seed run would have no phone number and the "text message" option
    // on the 2-step screen would be greyed out. Fill it in for the demo accounts.
    const DEMO_PHONES = {
        "weiling@innovare.com": "+6591230001",
        "marcus@innovare.com": "+6591230002",
        "priya@innovare.com": "+6591230003",
        "kumar@innovare.com": "+6591230004",
        "faridah@innovare.com": "+6591230005",
        "diana@innovare.com": "+6591230006",
        "linh@innovare.com": "+84901230007",
        "somchai@innovare.com": "+66801230008",
        "hr@innovare.com": "+6591230009",
        "aiden@innovare.com": "+6591230010",
        "grace@innovare.com": "+6591230011",
        "hr2@innovare.com": "+6591230012"
    };
    let phonesFilled = 0;
    for (const [email, phone] of Object.entries(DEMO_PHONES)) {
        const u = await User.findOne({ where: { email } });
        if (u && !u.phone) { u.phone = phone; await u.save(); phonesFilled++; }
    }
    if (phonesFilled) console.log(`Backfilled demo phone numbers for ${phonesFilled} account(s).`);

    // 3b. Auto-enrol every demo account for the "Authenticator app" 2FA option,
    // so it's demonstrable immediately without anyone manually visiting
    // My account → Authenticator first. Skips accounts already enrolled, so
    // re-running the seed doesn't hand out a fresh secret each time (which
    // would invalidate whatever the demo operator already added to their
    // phone). The secret + QR/manual key are printed to the console ONCE per
    // account, the moment they're first enrolled — that's the only place they
    // are ever shown in plaintext, so copy them down before they scroll away.
    const demoEmails = Object.keys(DEMO_PHONES);
    const newlyEnrolled = [];
    for (const email of demoEmails) {
        const u = await User.findOne({ where: { email } });
        if (!u || u.totpEnabled) continue;
        const secret = totp.generateSecret();
        u.totpSecret = totp.encrypt(secret);
        u.totpEnabled = true;
        u.totpPendingSecret = null;
        await u.save();
        newlyEnrolled.push({ email, name: u.name, secret });
    }
    if (newlyEnrolled.length) {
        console.log(`\nAuto-enrolled ${newlyEnrolled.length} demo account(s) for the Authenticator app 2FA option.`);
        console.log("Add each one to a real authenticator app (Microsoft Authenticator, Google");
        console.log("Authenticator, Authy, ...) by scanning its QR code below, or by choosing");
        console.log("\"enter a setup key\" and typing the manual key shown underneath it.\n");
        for (const { email, name, secret } of newlyEnrolled) {
            const otpauthUrl = totp.keyUri(email, secret);
            console.log(`— ${name} (${email}) —`);
            console.log(await QRCode.toString(otpauthUrl, { type: "terminal", small: true }));
            console.log(`  Manual key: ${secret}\n`);
        }
    }

    // 4. Balances — annual within the country's [min,max]; sick from policy
    const policyOf = (cc) => POLICIES.find(p => p.country === cc);
    const bal = async (user, leaveType, entitled, carried, used) =>
        LeaveBalance.findOrCreate({
            where: { userId: user.id, leaveType, year: YEAR },
            defaults: { entitled, carried, used }
        });
    const seedBalances = async (user, annual, carried, used) => {
        const p = policyOf(user.country);
        await bal(user, "annual", annual, carried, used);
        await bal(user, "sick_mc", p.sickMc, 0, 0);
        await bal(user, "sick_nomc", p.sickNoMc, 0, 0);
    };
    await seedBalances(weiling, 14, 5, 7.5);   // SG: 14–24
    await seedBalances(priya, 14, 2, 6);
    await seedBalances(kumar, 14, 4, 10);
    await seedBalances(faridah, 14, 0, 5);
    await seedBalances(marcus, 18, 3, 4);
    await seedBalances(diana, 21, 5, 6);
    await seedBalances(linh, 12, 1, 3);        // VN: 12–14
    await seedBalances(somchai, 8, 0, 2);      // TH: 8–11, sick 30 w/ MC, 0 w/o
    await seedBalances(aiden, 18, 2, 3);
    await seedBalances(grace, 21, 4, 5);
    // HR_ADMIN is a person too — they can now apply for their own leave from
    // the Employee view (see the "Apply for leave" toggle), so they need a
    // real balance like everyone else, not the "—" a missing row would show.
    await seedBalances(hradmin, 14, 1, 2);
    await seedBalances(hradmin2, 14, 0, 1);

    // 5. Approved leave so AI-2/AI-3 coverage has data
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

    // 6. Pending requests so queues are populated
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

    // 6b. M1: a LEADERSHIP request, so the HR Admin "Leadership approvals" tab
    // has something to act on out of the box. A Manager's own leave has no
    // same-tier peer who could approve it without a conflict of interest, so it
    // is routed to HR Admin instead of the usual team Manager. Diana is a
    // MANAGER, so this lands in HR Admin's queue — and notably NOT in her own.
    const [p3, c3] = await LeaveRequest.findOrCreate({
        where: { employeeId: diana.id, startDate: "2026-09-07", endDate: "2026-09-08" },
        defaults: {
            leaveType: "annual", days: 2, reason: "Family commitment overseas",
            status: "PENDING_MANAGER", halfDay: false, flagged: false
        }
    });
    if (c3) await AuditLog.create({ requestId: p3.id, actorName: diana.name, action: "Submitted (Manager's own leave — routed to HR Admin)" });

    const [p4, c4] = await LeaveRequest.findOrCreate({
        where: { employeeId: hradmin.id, startDate: "2026-09-21", endDate: "2026-09-21" },
        defaults: {
            leaveType: "annual", days: 1, reason: "Medical appointment",
            status: "PENDING_MANAGER", halfDay: false, flagged: false
        }
    });
    if (c4) await AuditLog.create({ requestId: p4.id, actorName: hradmin.name, action: "Submitted (HR Admin's own leave — routed to another HR Admin)" });

    // 6c. M5 (UC-10): configurable leave-type catalogue (documents the fixed core
    //    types plus optional extras HR can toggle; core apply flow is unchanged).
    const LEAVE_TYPES = [
        { code: "annual", name: "Annual Leave", affectsAnnualBalance: true, affectsSickBalance: false, requiresMc: false, active: true },
        { code: "sick_mc", name: "Sick Leave (with MC)", affectsAnnualBalance: false, affectsSickBalance: true, requiresMc: true, active: true },
        { code: "sick_nomc", name: "Sick Leave (without MC)", affectsAnnualBalance: false, affectsSickBalance: true, requiresMc: false, active: true },
        { code: "unpaid", name: "Unpaid Leave", affectsAnnualBalance: false, affectsSickBalance: false, requiresMc: false, active: true },
        { code: "compassionate", name: "Compassionate Leave", affectsAnnualBalance: false, affectsSickBalance: false, requiresMc: false, active: true },
    ];
    for (const t of LEAVE_TYPES) {
        await LeaveType.findOrCreate({ where: { code: t.code }, defaults: t });
    }
    console.log(`Seeded ${LEAVE_TYPES.length} leave types.`);

    // 7. M4 (UC-29): default Mon–Fri weekend config per policy country.
    for (const p of POLICIES) {
        await CountryWorkingDays.findOrCreate({
            where: { country: p.country },
            defaults: { country: p.country, workingDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false } }
        });
    }
    console.log(`Seeded weekend config for ${POLICIES.length} countries.`);

    // 8. M4 (UC-17): a minimum-staffing rule for the demo team.
    await MinStaffing.findOrCreate({
        where: { scopeId: "Compliance Team A" },
        defaults: { scope: "TEAM", scopeId: "Compliance Team A", minHeadcount: 3 }
    });

    // 9. M4 (UC-18): a sample year-end blackout (special-approval) for SG.
    await BlackoutPeriod.findOrCreate({
        where: { scope: "COUNTRY", scopeId: "SG", startDate: "2026-12-24", endDate: "2026-12-31" },
        defaults: {
            scope: "COUNTRY", scopeId: "SG", startDate: "2026-12-24", endDate: "2026-12-31",
            mode: "SPECIAL_APPROVAL", reason: "Year-end financial close", active: true
        }
    });
    console.log("Seeded min-staffing + sample blackout period.");

    console.log("Seed complete. Accounts (password demo123!):");
    console.log("  weiling@innovare.com  (EMPLOYEE, SG)");
    console.log("  priya@innovare.com    (EMPLOYEE, SG)");
    console.log("  kumar@innovare.com    (EMPLOYEE, SG)");
    console.log("  faridah@innovare.com  (EMPLOYEE, SG)");
    console.log("  linh@innovare.com     (EMPLOYEE, VN — Vietnam calendar & policy)");
    console.log("  somchai@innovare.com  (EMPLOYEE, TH — Thailand calendar & policy)");
    console.log("  marcus@innovare.com   (SUPERVISOR, SG)");
    console.log("  diana@innovare.com    (MANAGER, SG)");
    console.log("  aiden@innovare.com    (SUPERVISOR, SG, Team B — for delegation demo)");
    console.log("  grace@innovare.com    (MANAGER, SG, Team B — for delegation demo)");
    console.log("  hr@innovare.com       (HR_ADMIN, SG — HR administration console)");
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
