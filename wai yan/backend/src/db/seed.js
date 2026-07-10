/**
 * Seed demo users, policies, holidays, balances, sample leave.
 * Password for all users: Password123!
 * Usage: npm run seed
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const path = require('path');
const { runSqlFile } = require('./runSqlFile');
const {
  COMPANY_PROFILE,
  DEFAULT_LEAVE_POLICIES,
  OFFICES,
  COUNTRY_FLAGS,
} = require('../config/company');
const { PUBLIC_HOLIDAYS_2026 } = require('../data/publicHolidays2026');
const { PUBLIC_HOLIDAYS_2025_TO_2028 } = require('../data/publicHolidays2025to2028');

async function main() {
  console.log(`Seeding with driver: ${db.driver}`);
  const client = await db.pool.connect();
  try {
    // SQLite uses a dedicated schema file; Postgres/PGlite use schema.sql
    const schemaFile =
      db.driver === 'sqlite'
        ? path.join(__dirname, 'schema.sqlite.sql')
        : path.join(__dirname, 'schema.sql');
    await runSqlFile(client, schemaFile);

    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash('Password123!', 10);
    const year = new Date().getFullYear();

    // Clear is handled by schema DROP/CREATE

    // Realistic multi-branch company (~60 staff, 10 APAC offices)
    const COMPANY = COMPANY_PROFILE.name;
    const HQ = COMPANY_PROFILE.hq_address;
    const insertUser = async (p) => {
      const r = await client.query(
        `INSERT INTO users (
           employee_id, name, email, password_hash, phone, personal_address,
           job_title, department, office_branch, office_city, office_country,
           company_name, company_address, country_code, role,
           supervisor_id, manager_id, hod_id
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
         ) RETURNING id`,
        [
          p.employee_id,
          p.name,
          p.email,
          passwordHash,
          p.phone,
          p.personal_address,
          p.job_title,
          p.department,
          p.office_branch,
          p.office_city,
          p.office_country,
          COMPANY,
          p.company_address || HQ,
          p.country_code,
          p.role,
          p.supervisor_id || null,
          p.manager_id || null,
          p.hod_id || null,
        ]
      );
      return r.rows[0].id;
    };

    const hodId = await insertUser({
      employee_id: 'AGS-HOD-001',
      name: 'Diana HOD',
      email: 'diana.hod@company.com',
      phone: '+6591110001',
      personal_address: '88 Orchard Road, #12-05, Singapore 238841',
      job_title: 'Head of Finance',
      department: 'Finance',
      office_branch: 'Singapore HQ',
      office_city: 'Singapore',
      office_country: 'Singapore',
      country_code: 'SG',
      role: 'hod',
    });

    const managerId = await insertUser({
      employee_id: 'AGS-MGR-010',
      name: 'Carol Manager',
      email: 'carol.manager@company.com',
      phone: '+6591110010',
      personal_address: '21 Tanjong Pagar Road, #08-02, Singapore 088444',
      job_title: 'Finance Manager',
      department: 'Finance',
      office_branch: 'Singapore HQ',
      office_city: 'Singapore',
      office_country: 'Singapore',
      country_code: 'SG',
      role: 'manager',
      hod_id: hodId,
    });

    const supervisorId = await insertUser({
      employee_id: 'AGS-SUP-020',
      name: 'Bob Supervisor',
      email: 'bob.supervisor@company.com',
      phone: '+6591110020',
      personal_address: '5 Jurong East St 32, #04-11, Singapore 609479',
      job_title: 'Finance Team Lead',
      department: 'Finance',
      office_branch: 'Singapore HQ',
      office_city: 'Singapore',
      office_country: 'Singapore',
      country_code: 'SG',
      role: 'supervisor',
      manager_id: managerId,
      hod_id: hodId,
    });

    await client.query(`UPDATE users SET supervisor_id = $1 WHERE id = $2`, [
      managerId,
      supervisorId,
    ]);

    const hrId = await insertUser({
      employee_id: 'AGS-HR-030',
      name: 'HR Admin',
      email: 'hr.admin@company.com',
      phone: '+6591110030',
      personal_address: '10 Anson Road, #15-01, Singapore 079903',
      job_title: 'HR Business Partner',
      department: 'Human Resources',
      office_branch: 'Singapore HQ',
      office_city: 'Singapore',
      office_country: 'Singapore',
      country_code: 'SG',
      role: 'hr_admin',
      supervisor_id: supervisorId,
      manager_id: managerId,
      hod_id: hodId,
    });

    const aliceId = await insertUser({
      employee_id: 'AGS-EMP-101',
      name: 'Alice Tan',
      email: 'alice.tan@company.com',
      phone: '+6598765432',
      personal_address: '42 Bedok North Ave 2, #09-18, Singapore 460042',
      job_title: 'Finance Executive',
      department: 'Finance',
      office_branch: 'Singapore HQ',
      office_city: 'Singapore',
      office_country: 'Singapore',
      country_code: 'SG',
      role: 'employee',
      supervisor_id: supervisorId,
      manager_id: managerId,
      hod_id: hodId,
    });

    const bobLimId = await insertUser({
      employee_id: 'AGS-EMP-102',
      name: 'Bob Lim',
      email: 'bob.lim@company.com',
      phone: '+6591234567',
      personal_address: '17 Clementi Ave 3, #05-22, Singapore 129903',
      job_title: 'Accounts Associate',
      department: 'Finance',
      office_branch: 'Singapore HQ',
      office_city: 'Singapore',
      office_country: 'Singapore',
      country_code: 'SG',
      role: 'employee',
      supervisor_id: supervisorId,
      manager_id: managerId,
      hod_id: hodId,
    });

    const thaiEmp = {
      rows: [
        {
          id: await insertUser({
            employee_id: 'AGS-EMP-201',
            name: 'Somchai Thai',
            email: 'somchai@company.com',
            phone: '+66812345678',
            personal_address: '88 Sukhumvit Soi 11, Khlong Toei Nuea, Bangkok 10110',
            job_title: 'Operations Coordinator',
            department: 'Operations',
            office_branch: 'Bangkok Regional Office',
            office_city: 'Bangkok',
            office_country: 'Thailand',
            company_address:
              'Apex Global Solutions (Thailand) Co., Ltd — 999/9 Rama I Rd, Pathum Wan, Bangkok 10330',
            country_code: 'TH',
            role: 'employee',
            supervisor_id: supervisorId,
            manager_id: managerId,
            hod_id: hodId,
          }),
        },
      ],
    };

    // Myanmar branch — leave country_code MM so PH day-count uses Myanmar calendar
    const myanmarId = await insertUser({
      employee_id: 'AGS-EMP-301',
      name: 'Aung Kyaw',
      email: 'aung.kyaw@company.com',
      phone: '+959450012345',
      personal_address: 'No. 45 Kabar Aye Pagoda Road, Bahan Township, Yangon',
      job_title: 'Regional Operations Officer',
      department: 'Operations',
      office_branch: 'Yangon Branch (Myanmar)',
      office_city: 'Yangon',
      office_country: 'Myanmar',
      company_address:
        'Apex Global Solutions Myanmar — Level 8, Junction City Tower, Bogyoke Aung San Rd, Yangon',
      country_code: 'MM',
      role: 'employee',
      supervisor_id: supervisorId,
      manager_id: managerId,
      hod_id: hodId,
    });

    // One demo staffer per remaining office (CN, ID, JP, MY, NZ, PH, VN)
    // so multi-country holidays & policies are easy to demo
    const regionalStaff = [
      {
        employee_id: 'AGS-EMP-401',
        name: 'Li Wei',
        email: 'li.wei@company.com',
        phone: '+8613810012345',
        personal_address: '88 Century Avenue, Pudong, Shanghai',
        job_title: 'Business Analyst',
        department: 'Operations',
        code: 'CN',
      },
      {
        employee_id: 'AGS-EMP-402',
        name: 'Siti Rahayu',
        email: 'siti.rahayu@company.com',
        phone: '+6281212345678',
        personal_address: 'Jl. Sudirman Kav. 52-53, Jakarta',
        job_title: 'HR Coordinator',
        department: 'Human Resources',
        code: 'ID',
      },
      {
        employee_id: 'AGS-EMP-403',
        name: 'Yuki Tanaka',
        email: 'yuki.tanaka@company.com',
        phone: '+819012345678',
        personal_address: '1-1 Marunouchi, Chiyoda-ku, Tokyo',
        job_title: 'Client Success Associate',
        department: 'Operations',
        code: 'JP',
      },
      {
        employee_id: 'AGS-EMP-404',
        name: 'Amir Hassan',
        email: 'amir.hassan@company.com',
        phone: '+60123456789',
        personal_address: 'Jalan Ampang, Kuala Lumpur',
        job_title: 'Finance Associate',
        department: 'Finance',
        code: 'MY',
      },
      {
        employee_id: 'AGS-EMP-405',
        name: 'Emma Wilson',
        email: 'emma.wilson@company.com',
        phone: '+64211234567',
        personal_address: '12 Quay Street, Auckland',
        job_title: 'Regional Coordinator',
        department: 'Operations',
        code: 'NZ',
      },
      {
        employee_id: 'AGS-EMP-406',
        name: 'Maria Santos',
        email: 'maria.santos@company.com',
        phone: '+639171234567',
        personal_address: 'BGC, Taguig, Metro Manila',
        job_title: 'Operations Associate',
        department: 'Operations',
        code: 'PH',
      },
      {
        employee_id: 'AGS-EMP-407',
        name: 'Nguyen Minh',
        email: 'nguyen.minh@company.com',
        phone: '+84901234567',
        personal_address: 'District 1, Ho Chi Minh City',
        job_title: 'Operations Officer',
        department: 'Operations',
        code: 'VN',
      },
    ];

    const regionalIds = [];
    for (const s of regionalStaff) {
      const office = OFFICES.find((o) => o.code === s.code);
      // eslint-disable-next-line no-await-in-loop
      const id = await insertUser({
        employee_id: s.employee_id,
        name: s.name,
        email: s.email,
        phone: s.phone,
        personal_address: s.personal_address,
        job_title: s.job_title,
        department: s.department,
        office_branch: office.branch,
        office_city: office.city,
        office_country: office.country,
        company_address: office.address,
        country_code: s.code,
        role: 'employee',
        supervisor_id: supervisorId,
        manager_id: managerId,
        hod_id: hodId,
      });
      regionalIds.push(id);
    }

    // Leave policies for all 10 office countries
    for (const p of DEFAULT_LEAVE_POLICIES) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO leave_policies (country_code, annual_min, annual_max, sick_with_mc, sick_no_mc, carry_forward_max)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          p.country_code,
          p.annual_min,
          p.annual_max,
          p.sick_with_mc,
          p.sick_no_mc,
          p.carry_forward_max,
        ]
      );
    }

    // Seed the 2025?2028 static baseline for all offices, then prefer the richer
    // 2026 data set for movable holidays. Future years load and cache on demand.
    const holidayRows = [
      ...PUBLIC_HOLIDAYS_2025_TO_2028.filter(([date]) => !date.startsWith('2026-')),
      ...PUBLIC_HOLIDAYS_2026,
    ];
    for (const [date, cc, name, description] of holidayRows) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO public_holidays (holiday_date, country_code, holiday_name, description)
         VALUES ($1, $2, $3, $4)`,
        [date, cc, name, description]
      );
    }

    // Mark all static baseline years as cached so first calendar open stays offline.
    const seededCountries = [...new Set(holidayRows.map((h) => h[1]))];
    for (const seededYear of [2025, 2026, 2027, 2028]) {
      for (const cc of seededCountries) {
        // eslint-disable-next-line no-await-in-loop
        const cnt = await client.query(
          `SELECT COUNT(*)::int AS c FROM public_holidays
           WHERE country_code = $1
             AND holiday_date >= $2 AND holiday_date <= $3`,
          [cc, `${seededYear}-01-01`, `${seededYear}-12-31`]
        );
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `INSERT INTO holiday_fetch_log (country_code, year, source, holiday_count, fetched_at)
           VALUES ($1, $2, 'seed', $3, $4)`,
          [cc, seededYear, Number(cnt.rows[0]?.c || 0), new Date().toISOString()]
        );
      }
    }

    // Balances (demo accounts + regional office staff)
    const usersForBalance = [
      aliceId,
      bobLimId,
      thaiEmp.rows[0].id,
      myanmarId,
      ...regionalIds,
      supervisorId,
      managerId,
      hrId,
      hodId,
    ];
    for (const uid of usersForBalance) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO leave_balances (user_id, year, annual_entitlement, annual_balance, sick_balance, carried_forward)
         VALUES ($1, $2, 18, 18, 12, 0)`,
        [uid, year]
      );
    }

    // Sample overlapping leave for Bob Lim (approved) so Alice can see overlap
    await client.query(
      `INSERT INTO leave_requests (
         user_id, leave_type, start_date, end_date, half_day_flag, days_count, status,
         supervisor_id, supervisor_status, manager_id, manager_status,
         special_approval_flag, overlap_flag, remarks
       ) VALUES (
         $1, 'annual', '2026-08-10', '2026-08-12', FALSE, 3, 'approved',
         $2, 'approved', $3, 'approved', FALSE, FALSE, 'Pre-seeded approved leave'
       )`,
      [bobLimId, supervisorId, managerId]
    );

    // Deduct Bob's balance for the approved leave
    await client.query(
      `UPDATE leave_balances SET annual_balance = annual_balance - 3
       WHERE user_id = $1 AND year = $2`,
      [bobLimId, year]
    );

    // Pending leave for Alice
    await client.query(
      `INSERT INTO leave_requests (
         user_id, leave_type, start_date, end_date, half_day_flag, days_count, status,
         supervisor_id, supervisor_status, manager_id, manager_status,
         special_approval_flag, overlap_flag, remarks
       ) VALUES (
         $1, 'annual', '2026-09-01', '2026-09-03', FALSE, 3, 'pending',
         $2, 'pending', $3, 'pending', FALSE, FALSE, 'Seeded pending request'
       )`,
      [aliceId, supervisorId, managerId]
    );

    // Notification for supervisor about Alice's request
    await client.query(
      `INSERT INTO notifications (user_id, type, message, leave_request_id)
       SELECT $1, 'leave_submitted',
              'A new annual leave request (2026-09-01 – 2026-09-03) awaits your review.',
              id
       FROM leave_requests WHERE user_id = $2 AND status = 'pending' LIMIT 1`,
      [supervisorId, aliceId]
    );

    // HR-editable company profile + offices
    const p = COMPANY_PROFILE;
    await client.query(
      `INSERT INTO company_profile (
         id, name, short_name, reg_no, hq_country, hq_country_code, hq_address,
         staff_count, industry, timezone_primary, website, description, updated_at
       ) VALUES (1, $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        p.name,
        p.short_name,
        p.reg_no,
        p.hq_country,
        p.hq_country_code,
        p.hq_address,
        p.staff_count,
        p.industry,
        p.timezone_primary,
        p.website,
        p.description,
        new Date().toISOString(),
      ]
    );
    let officeOrder = 0;
    for (const o of OFFICES) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO company_offices (
           code, country, flag, branch, city, address, approx_staff, is_hq, sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          o.code,
          o.country,
          o.flag || COUNTRY_FLAGS[o.code] || '',
          o.branch,
          o.city,
          o.address,
          o.approx_staff || 0,
          o.is_hq ? 1 : 0,
          officeOrder,
        ]
      );
      officeOrder += 1;
    }

    await client.query('COMMIT');

    console.log('Seed complete.');
    console.log(
      `Company: ${COMPANY_PROFILE.name} · ~${COMPANY_PROFILE.staff_count} staff · ${COMPANY_PROFILE.total_countries} countries · ${holidayRows.length} PH entries (2025-2028)`
    );
    console.log('Demo logins (password: Password123!):');
    console.log('  alice.tan@company.com          (employee, SG HQ)');
    console.log('  aung.kyaw@company.com          (employee, Myanmar)');
    console.log('  somchai@company.com            (employee, Thailand)');
    console.log('  li.wei@company.com             (employee, China)');
    console.log('  bob.supervisor@company.com     (supervisor)');
    console.log('  carol.manager@company.com      (manager)');
    console.log('  hr.admin@company.com           (hr_admin)');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* SQLite may already have closed the transaction after DDL/error */
    }
    throw err;
  } finally {
    client.release();
    await db.pool.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
