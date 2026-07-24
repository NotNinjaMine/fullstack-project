module.exports = (sequelize, DataTypes) => {
  // Per-country statutory policy. An employee's country decides their annual
  // min/max and sick quotas; feeds provisioning (UC-24) and bulk entitlement
  // + pro-ration (UC-20).
  const LeavePolicy = sequelize.define(
    'LeavePolicy',
    {
      country: { type: DataTypes.STRING(2), allowNull: false, unique: true },
      countryName: { type: DataTypes.STRING(40), allowNull: false },
      annualMin: { type: DataTypes.INTEGER, allowNull: false },
      annualMax: { type: DataTypes.INTEGER, allowNull: false },
      sickMc: { type: DataTypes.INTEGER, allowNull: false },
      sickNoMc: { type: DataTypes.INTEGER, allowNull: false },
      carryForwardMax: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
    },
    { tableName: 'leave_policies' }
  );

  return LeavePolicy;
};
