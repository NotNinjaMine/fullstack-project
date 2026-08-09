// Demo data seeder: node seed.js  (or: npm run seed)
// Creates the 10 country leave policies, the FULL 2026 public-holiday calendar
// for all 10 countries and the Compliance Team A demo accounts,
// balances per country policy, and a few requests so both queues have content.
const bcrypt = require('bcryptjs');
const db = require('./models');
const { User, LeaveBalance, PublicHoliday, LeavePolicy, LeaveRequest, AuditLog,
    LeaveType, CountryWorkingDays, BlackoutPeriod } = db;
const HOLIDAYS_2026 = require('./data/holidays2026');
const totp = require('./services/totpService');
const QRCode = require('qrcode');
const { migrateActiveLegacyUsers, verifyNoActiveLegacyUsers } = require('./services/demoEmailMigration');

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
    // Repair earlier demo rows before findOrCreate runs. Without this step, a
    // stale `@innovare...` row and a newly seeded `@wypledu.online` row could
    // coexist, leaving old leave requests linked to the bouncing address. The
    // migration preserves each user ID and every existing relationship.
    const migratedDemoEmails = await migrateActiveLegacyUsers({ User, sequelize: db.sequelize });
    await verifyNoActiveLegacyUsers(User);
    if (migratedDemoEmails) {
        console.log(`Migrated ${migratedDemoEmails} legacy demo staff email(s) to @wypledu.online.`);
    }

    const password = await bcrypt.hash("demo123!", 10);
    // Demo profile phone numbers (E.164). They remain ordinary profile data;
    // final-submission 2-step verification is delivered by email only.
    const mk = (name, email, role, initials, country = "SG", team = "Compliance Team A", phone = null, gender = null) =>
        ({ name, email, password, role, country, team, initials, phone, gender });

    // Gender is set on the demo accounts so gender-restricted leave types
    // (maternity FEMALE-only, NS/reservist leave MALE-only) are testable
    // out of the box. It's optional on the model — real accounts default to null
    // until HR sets it via the Employees tab.
    const [weiling] = await User.findOrCreate({ where: { email: "weiling@wypledu.online" }, defaults: mk("Tan Wei Ling", "weiling@wypledu.online", "EMPLOYEE", "WL", "SG", "Compliance Team A", "+6591230001", "FEMALE") });
    const [marcus] = await User.findOrCreate({ where: { email: "marcus@wypledu.online" }, defaults: mk("Marcus Lim", "marcus@wypledu.online", "SUPERVISOR", "ML", "SG", "Compliance Team A", "+6591230002", "MALE") });
    const [priya] = await User.findOrCreate({ where: { email: "priya@wypledu.online" }, defaults: mk("Priya Nair", "priya@wypledu.online", "EMPLOYEE", "PN", "SG", "Compliance Team A", "+6591230003", "FEMALE") });
    const [kumar] = await User.findOrCreate({ where: { email: "kumar@wypledu.online" }, defaults: mk("Kumar Rajan", "kumar@wypledu.online", "EMPLOYEE", "KR", "SG", "Compliance Team A", "+6591230004", "MALE") });
    const [faridah] = await User.findOrCreate({ where: { email: "faridah@wypledu.online" }, defaults: mk("Faridah Osman", "faridah@wypledu.online", "EMPLOYEE", "FO", "SG", "Compliance Team A", "+6591230005", "FEMALE") });
    const [diana] = await User.findOrCreate({ where: { email: "diana@wypledu.online" }, defaults: mk("Diana Koh", "diana@wypledu.online", "MANAGER", "DK", "SG", "Compliance Team A", "+6591230006", "FEMALE") });
    // Regional staff — log in as these to see a DIFFERENT holiday calendar and
    // a DIFFERENT statutory entitlement, driven purely by users.country.
    const [linh] = await User.findOrCreate({ where: { email: "linh@wypledu.online" }, defaults: mk("Nguyen Thi Linh", "linh@wypledu.online", "EMPLOYEE", "NL", "VN", "Compliance Team A", "+84901230007", "FEMALE") });
    const [somchai] = await User.findOrCreate({ where: { email: "somchai@wypledu.online" }, defaults: mk("Somchai Prasert", "somchai@wypledu.online", "EMPLOYEE", "SP", "TH", "Compliance Team A", "+66801230008", "MALE") });
    // M5: HR administrator — the only role that reaches the HR admin console.
    const [hradmin] = await User.findOrCreate({ where: { email: "hr@wypledu.online" }, defaults: mk("Aisha Rahman", "hr@wypledu.online", "HR_ADMIN", "AR", "SG", "Compliance Team A", "+6591230009", "FEMALE") });
    // M3: a second Supervisor + Manager on a different team, so there is a
    // valid same-role peer to delegate approvals to (delegation is role-matched:
    // a Supervisor can only delegate to another Supervisor, a Manager to another
    // Manager — see services/delegationService.js). Delegating across teams also
    // makes the "acting for" queue clearly demonstrable.
    const [aiden] = await User.findOrCreate({ where: { email: "aiden@wypledu.online" }, defaults: mk("Aiden Goh", "aiden@wypledu.online", "SUPERVISOR", "AG", "SG", "Compliance Team B", "+6591230010", "MALE") });
    const [grace] = await User.findOrCreate({ where: { email: "grace@wypledu.online" }, defaults: mk("Grace Tan", "grace@wypledu.online", "MANAGER", "GT", "SG", "Compliance Team B", "+6591230011", "FEMALE") });
    // The Boss sits above every team: a Manager's own leave is decided here,
    // and the Boss's own leave goes back down to the Manager tier (any Manager
    // may decide it). Sign in as this account to see the Manager page with the
    // Boss's company-wide queue. Team is recorded for the directory only - the
    // Boss's approval scope is deliberately NOT limited to it.
    // See services/approvalChain.js for the full routing table.
    const [boss] = await User.findOrCreate({ where: { email: "boss@wypledu.online" }, defaults: mk("Raymond Chua", "boss@wypledu.online", "BOSS", "RC", "SG", "Compliance Team A", "+6591230012", "MALE") });

    // Backfill: findOrCreate leaves existing rows untouched, so accounts created by
    // an earlier seed run would have no phone number and the "text message" option
    // on the 2-step screen would be greyed out. Fill it in for the demo accounts.
    const DEMO_PHONES = {
        "weiling@wypledu.online": "+6591230001",
        "marcus@wypledu.online": "+6591230002",
        "priya@wypledu.online": "+6591230003",
        "kumar@wypledu.online": "+6591230004",
        "faridah@wypledu.online": "+6591230005",
        "diana@wypledu.online": "+6591230006",
        "linh@wypledu.online": "+84901230007",
        "somchai@wypledu.online": "+66801230008",
        "hr@wypledu.online": "+6591230009",
        "aiden@wypledu.online": "+6591230010",
        "grace@wypledu.online": "+6591230011",
        "boss@wypledu.online": "+6591230012"
    };
    let phonesFilled = 0;
    for (const [email, phone] of Object.entries(DEMO_PHONES)) {
        const u = await User.findOne({ where: { email } });
        if (u && !u.phone) { u.phone = phone; await u.save(); phonesFilled++; }
    }
    if (phonesFilled) console.log(`Backfilled demo phone numbers for ${phonesFilled} account(s).`);

    // 3b. Auto-enrol every demo account for the "Authenticator app" 2FA option,
    // so it's demonstrable immediately without anyone manually visiting
    // My account -> Authenticator first. Skips accounts already enrolled, so
    // re-running the seed doesn't hand out a fresh secret each time (which
    // would invalidate whatever the demo operator already added to their
    // phone). The secret + QR/manual key are printed to the console ONCE per
    // account, the moment they're first enrolled - that's the only place they
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
        console.log(`
Auto-enrolled ${newlyEnrolled.length} demo account(s) for the Authenticator app 2FA option.`);
        console.log("Add each one to a real authenticator app (Microsoft Authenticator, Google");
        console.log("Authenticator, Authy, ...) by scanning its QR code below, or by choosing");
        console.log('"enter a setup key" and typing the manual key shown underneath it.\n');
        for (const { email, name, secret } of newlyEnrolled) {
            const otpauthUrl = totp.keyUri(email, secret);
            console.log(`- ${name} (${email}) -`);
            console.log(await QRCode.toString(otpauthUrl, { type: "terminal", small: true }));
            console.log(`  Manual key: ${secret}
`);
        }
    }
    const DEMO_GENDERS = {
        "weiling@wypledu.online": "FEMALE", "marcus@wypledu.online": "MALE",
        "priya@wypledu.online": "FEMALE", "kumar@wypledu.online": "MALE",
        "faridah@wypledu.online": "FEMALE", "diana@wypledu.online": "FEMALE",
        "linh@wypledu.online": "FEMALE", "somchai@wypledu.online": "MALE",
        "hr@wypledu.online": "FEMALE", "aiden@wypledu.online": "MALE",
        "grace@wypledu.online": "FEMALE"
    };
    let gendersFilled = 0;
    for (const [email, gender] of Object.entries(DEMO_GENDERS)) {
        const u = await User.findOne({ where: { email } });
        if (u && !u.gender) { u.gender = gender; await u.save(); gendersFilled++; }
    }
    if (gendersFilled) console.log(`Backfilled demo gender for ${gendersFilled} account(s).`);

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
    await seedBalances(boss, 24, 6, 8);        // SG: 14-24, most senior band
    // HR_ADMIN is a person too - they can now apply for their own leave from
    // the Employee view (see the "Apply for leave" toggle), so they need a
    // real balance like everyone else, not the "-" a missing row would show.
    await seedBalances(hradmin, 14, 1, 2);

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

    // 6. M5 (UC-10): configurable leave-type catalogue — HR can restrict any type
    //    to specific countries (applicableCountries; null/empty = every country)
    //    and/or to a gender (genderRestriction). The apply flow enforces both.
    const LEAVE_TYPES = [
        { code: "annual", name: "Annual Leave", affectsAnnualBalance: true, affectsSickBalance: false, requiresMc: false, active: true, applicableCountries: null, genderRestriction: "ANY" },
        { code: "sick_mc", name: "Sick Leave (with MC)", affectsAnnualBalance: false, affectsSickBalance: true, requiresMc: true, active: true, applicableCountries: null, genderRestriction: "ANY" },
        { code: "sick_nomc", name: "Sick Leave (without MC)", affectsAnnualBalance: false, affectsSickBalance: true, requiresMc: false, active: true, applicableCountries: null, genderRestriction: "ANY" },
        { code: "unpaid", name: "Unpaid Leave", affectsAnnualBalance: false, affectsSickBalance: false, requiresMc: false, active: true, applicableCountries: null, genderRestriction: "ANY" },
        { code: "compassionate", name: "Compassionate Leave", affectsAnnualBalance: false, affectsSickBalance: false, requiresMc: false, active: true, applicableCountries: null, genderRestriction: "ANY" },
        // Singapore-specific, gender-restricted statutory leave. Not tied to the
        // annual/sick balance pools — tracked as its own unlimited-in-app type
        // (real-world day caps for these are handled outside this prototype).
        { code: "maternity", name: "Maternity Leave", affectsAnnualBalance: false, affectsSickBalance: false, requiresMc: false, active: true, applicableCountries: ["SG"], genderRestriction: "FEMALE" },
        { code: "ns_leave", name: "NS / Reservist Leave", affectsAnnualBalance: false, affectsSickBalance: false, requiresMc: false, active: true, applicableCountries: ["SG"], genderRestriction: "MALE" },
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

    // 8. M4 (UC-18): sample blackout periods, one of each mode, so the red
    // calendar markings and both enforcement paths are demonstrable.
    //   SPECIAL_APPROVAL -> employee may still apply; routed for Manager scrutiny
    //   BLOCK            -> employee cannot apply at all
    await BlackoutPeriod.findOrCreate({
        where: { scope: "COUNTRY", scopeId: "SG", startDate: "2026-12-24", endDate: "2026-12-31" },
        defaults: {
            scope: "COUNTRY", scopeId: "SG", startDate: "2026-12-24", endDate: "2026-12-31",
            mode: "SPECIAL_APPROVAL", reason: "Year-end financial close", active: true
        }
    });
    await BlackoutPeriod.findOrCreate({
        where: { scope: "TEAM", scopeId: "Compliance Team A", startDate: "2026-09-14", endDate: "2026-09-18" },
        defaults: {
            scope: "TEAM", scopeId: "Compliance Team A", startDate: "2026-09-14", endDate: "2026-09-18",
            mode: "BLOCK", reason: "Regulatory audit week - no leave", active: true
        }
    });
    console.log("Seeded sample blackout periods (1 special-approval, 1 blocked).");

    console.log("Seed complete. Demo account identifiers:");
    console.log("  weiling@wypledu.online  (EMPLOYEE, SG)");
    console.log("  priya@wypledu.online    (EMPLOYEE, SG)");
    console.log("  kumar@wypledu.online    (EMPLOYEE, SG)");
    console.log("  faridah@wypledu.online  (EMPLOYEE, SG)");
    console.log("  linh@wypledu.online     (EMPLOYEE, VN — Vietnam calendar & policy)");
    console.log("  somchai@wypledu.online  (EMPLOYEE, TH — Thailand calendar & policy)");
    console.log("  marcus@wypledu.online   (SUPERVISOR, SG)");
    console.log("  diana@wypledu.online    (MANAGER, SG)");
    console.log("  aiden@wypledu.online    (SUPERVISOR, SG, Team B — for delegation demo)");
    console.log("  grace@wypledu.online    (MANAGER, SG, Team B — for delegation demo)");
    console.log("  hr@wypledu.online       (HR_ADMIN, SG — HR administration console)");
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
