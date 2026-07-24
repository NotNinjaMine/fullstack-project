module.exports = (sequelize, DataTypes) => {
  // UC-25: one row per active login session so the owner (and HR) can list and
  // revoke sessions. The JWT itself stays stateless; a revoked session is
  // reflected in the UI immediately (full token invalidation would additionally
  // check this table in authMiddleware). tokenHash is a SHA-256 of the JWT.
  const UserSession = sequelize.define(
    'UserSession',
    {
      tokenHash: { type: DataTypes.STRING(64), allowNull: false },
      deviceInfo: { type: DataTypes.STRING(255), allowNull: true },
      ipAddress: { type: DataTypes.STRING(64), allowNull: true },
      lastActive: { type: DataTypes.DATE, allowNull: true },
      revokedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: 'user_sessions' }
  );

  UserSession.associate = (models) => {
    UserSession.belongsTo(models.User, { foreignKey: 'userId', onDelete: 'cascade' });
  };

  return UserSession;
};
