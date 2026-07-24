module.exports = (sequelize, DataTypes) => {
  // UC-24: single-use, hashed invitation token (48h expiry). The account is
  // created up-front as INVITED (inactive) and activated on registration via
  // the token. tokenHash is a SHA-256 of the raw token; the raw token is
  // emailed (or returned in demo mode when SMTP is unset).
  const UserInvitation = sequelize.define(
    'UserInvitation',
    {
      email: { type: DataTypes.STRING(180), allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      countryCode: { type: DataTypes.STRING(2), allowNull: false, defaultValue: 'SG' },
      team: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'Finance' },
      role: {
        type: DataTypes.ENUM('EMPLOYEE', 'SUPERVISOR', 'MANAGER'),
        allowNull: false,
        defaultValue: 'EMPLOYEE',
      },
      startDate: { type: DataTypes.DATEONLY, allowNull: true }, // pro-ration (UC-20)
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      acceptedAt: { type: DataTypes.DATE, allowNull: true },
      invitedByName: { type: DataTypes.STRING(120), allowNull: false },
    },
    { tableName: 'user_invitations' }
  );

  return UserInvitation;
};
