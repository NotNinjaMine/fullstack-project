// Strips secrets before a user row is returned to the client. Matches the
// shape the React client reads (id, name, role, country, countryCode, initials,
// preferences, status, lockout, …).
module.exports = function publicUser(user) {
  const u = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  delete u.password;
  delete u.resetTokenHash;
  delete u.resetTokenExpires;
  return u;
};
