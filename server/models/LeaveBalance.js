module.exports = (sequelize, DataTypes) => {
  // Per-user, per-year, per-type balance. M1 touches this for bulk entitlement
  // (UC-20) and new-joiner pro-ration on invitation acceptance (UC-24); the
  // employee-leave vertical owns deduction/restoration.
  const LeaveBalance = sequelize.define(
    'LeaveBalance',
    {
      leaveType: { type: DataTypes.STRING(20), allowNull: false },
      year: { type: DataTypes.INTEGER, allowNull: false },
      entitled: { type: DataTypes.DECIMAL(5, 1), allowNull: false, defaultValue: 0 },
      carried: { type: DataTypes.DECIMAL(5, 1), allowNull: false, defaultValue: 0 },
      used: { type: DataTypes.DECIMAL(5, 1), allowNull: false, defaultValue: 0 },
    },
    { tableName: 'leave_balances' }
  );

  LeaveBalance.associate = (models) => {
    LeaveBalance.belongsTo(models.User, { foreignKey: 'userId', onDelete: 'cascade' });
  };

  return LeaveBalance;
};
