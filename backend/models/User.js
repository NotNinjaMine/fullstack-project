module.exports = (sequelize, DataTypes) => {
  // M1 owns the shared users table. Columns cover identity + RBAC (role),
  // self-service profile/preferences (UC-23), account lifecycle + lockout
  // (UC-24/UC-25), and the forgot-password flow. Some columns
  // (gender/dateOfBirth/children/completedNS) belong to the employee-leave
  // vertical's eligibility rules but live here because M1 owns the schema.
  const User = sequelize.define(
    'User',
    {
      name: { type: DataTypes.STRING(120), allowNull: false },
      email: { type: DataTypes.STRING(180), allowNull: false, unique: true },
      password: { type: DataTypes.STRING(255), allowNull: false },
      role: {
        type: DataTypes.ENUM('EMPLOYEE', 'SUPERVISOR', 'MANAGER', 'HR_ADMIN'),
        allowNull: false,
        defaultValue: 'EMPLOYEE',
      },
      // Full display name (e.g. "Singapore") + 2-char code (e.g. "SG").
      country: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'Singapore' },
      countryCode: { type: DataTypes.STRING(2), allowNull: false, defaultValue: 'SG' },
      team: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'Finance' },
      initials: { type: DataTypes.STRING(3), allowNull: false, defaultValue: '??' },

      // Employee-leave eligibility inputs (owned logically by that vertical).
      gender: { type: DataTypes.STRING(1), allowNull: true },
      dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true },
      children: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      completedNS: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      // UC-23: self-service profile + preferences.
      phone: { type: DataTypes.STRING(30), allowNull: true },
      locale: { type: DataTypes.STRING(5), allowNull: false, defaultValue: 'en' },
      notifyEmail: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      notifyInApp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

      // UC-24/UC-25: lifecycle + 3-strikes lockout.
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INVITED', 'DEACTIVATED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      failedLoginCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lockedUntil: { type: DataTypes.DATE, allowNull: true },

      // UC-23: forgot-password (single-use, hashed at rest).
      resetTokenHash: { type: DataTypes.STRING(64), allowNull: true },
      resetTokenExpires: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: 'users' }
  );

  User.associate = (models) => {
    User.hasMany(models.LeaveBalance, { foreignKey: 'userId', onDelete: 'cascade' });
    User.hasMany(models.UserSession, { foreignKey: 'userId', onDelete: 'cascade' });
    User.hasMany(models.SecurityEvent, { foreignKey: 'userId', onDelete: 'cascade' });
  };

  return User;
};
