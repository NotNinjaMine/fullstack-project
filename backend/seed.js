// Minimal seed: country leave policies + the demo accounts Login.jsx offers
// one-click. Idempotent — safe to run against a DB that already has data.
require('dotenv').config();
const db = require('./models');
const { LeavePolicy, User } = db;
const { createUserWithBalances } = require('./services/provisioning');

const POLICIES = [
    { country: "SG", countryName: "Singapore", annualMin: 7, annualMax: 21, sickMc: 14, sickNoMc: 60 },
    { country: "VN", countryName: "Vietnam", annualMin: 12, annualMax: 16, sickMc: 30, sickNoMc: 30 },
    { country: "TH", countryName: "Thailand", annualMin: 6, annualMax: 15, sickMc: 30, sickNoMc: 30 },
    { country: "MY", countryName: "Malaysia", annualMin: 8, annualMax: 16, sickMc: 14, sickNoMc: 60 },
    { country: "ID", countryName: "Indonesia", annualMin: 12, annualMax: 15, sickMc: 14, sickNoMc: 30 },
    { country: "PH", countryName: "Philippines", annualMin: 5, annualMax: 15, sickMc: 15, sickNoMc: 15 },
    { country: "CN", countryName: "China", annualMin: 5, annualMax: 15, sickMc: 14, sickNoMc: 30 },
    { country: "IN", countryName: "India", annualMin: 12, annualMax: 21, sickMc: 12, sickNoMc: 12 },
    { country: "JP", countryName: "Japan", annualMin: 10, annualMax: 20, sickMc: 14, sickNoMc: 30 },
    { country: "US", countryName: "United States", annualMin: 10, annualMax: 20, sickMc: 10, sickNoMc: 10 }
];

const DEMO_USERS = [
    { name: "Wei Ling", email: "weiling@innovare.com", role: "EMPLOYEE", country: "SG", team: "Compliance Team A" },
    { name: "Linh", email: "linh@innovare.com", role: "EMPLOYEE", country: "VN", team: "Compliance Team A" },
    { name: "Somchai", email: "somchai@innovare.com", role: "EMPLOYEE", country: "TH", team: "Compliance Team B" },
    { name: "Priya", email: "priya@innovare.com", role: "EMPLOYEE", country: "SG", team: "Compliance Team B" },
    { name: "Marcus", email: "marcus@innovare.com", role: "SUPERVISOR", country: "SG", team: "Compliance Team A" },
    { name: "Diana", email: "diana@innovare.com", role: "MANAGER", country: "SG", team: "Compliance Team A" },
    { name: "Aiden", email: "aiden@innovare.com", role: "SUPERVISOR", country: "SG", team: "Compliance Team B" },
    { name: "Grace", email: "grace@innovare.com", role: "MANAGER", country: "SG", team: "Compliance Team B" },
    { name: "Aisha", email: "hr@innovare.com", role: "HR_ADMIN", country: "SG", team: "HR" }
];

const DEMO_PASSWORD = "demo123!";

const run = async () => {
    await db.sequelize.sync({ alter: true });

    for (const p of POLICIES) {
        await LeavePolicy.findOrCreate({ where: { country: p.country }, defaults: p });
    }
    console.log(`Seeded ${POLICIES.length} leave polic${POLICIES.length === 1 ? "y" : "ies"}.`);

    let created = 0;
    for (const u of DEMO_USERS) {
        const existing = await User.findOne({ where: { email: u.email } });
        if (existing) continue;
        await createUserWithBalances({ ...u, password: DEMO_PASSWORD });
        created++;
    }
    console.log(`Seeded ${created} new demo user(s) (password: ${DEMO_PASSWORD}).`);

    await db.sequelize.close();
};

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
