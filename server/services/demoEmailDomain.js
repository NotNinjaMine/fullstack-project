'use strict';

const TARGET_DOMAIN = 'wypledu.online';
const LEGACY_DOMAINS = ['innovare.com', 'innovare.example.test'];

const normalize = (value) => String(value || '').trim().toLowerCase();

const targetEmailFor = (email) => {
    const value = normalize(email);
    for (const domain of LEGACY_DOMAINS) {
        const suffix = `@${domain}`;
        if (value.endsWith(suffix)) {
            const localPart = value.slice(0, -suffix.length);
            return localPart ? `${localPart}@${TARGET_DOMAIN}` : null;
        }
    }
    return null;
};

// Which email domains belong to the seeded DEMO staff, as opposed to a real
// person who signed up with their own (gmail.com, company.com, …).
//
// This is the single source of truth for "is this a demo account?", and it is
// what the 2FA screen uses to decide whether the 6-digit code may be shown on
// screen. Demo accounts have no one actually reading their inbox / holding
// their phone / running an authenticator app, so the code has to be visible or
// the demo is unusable. A real account must NEVER see it — the whole point of
// the second factor is that only the genuine mailbox/handset/app has the code.
//
// Configurable via DEMO_EMAIL_DOMAINS (comma-separated) so a deployment can
// change the demo domain without a code change. The seeded domain and its
// legacy predecessors are always included.
const demoEmailDomains = () => {
    const configured = String(process.env.DEMO_EMAIL_DOMAINS || '')
        .split(',')
        .map((d) => normalize(d).replace(/^@/, ''))
        .filter(Boolean);
    return Array.from(new Set([TARGET_DOMAIN, ...LEGACY_DOMAINS, ...configured]));
};

const isDemoEmail = (email) => {
    const value = normalize(email);
    if (!value.includes('@')) return false;
    return demoEmailDomains().some((domain) => value.endsWith(`@${domain}`));
};

module.exports = {
    TARGET_DOMAIN, LEGACY_DOMAINS, normalize, targetEmailFor,
    demoEmailDomains, isDemoEmail
};
