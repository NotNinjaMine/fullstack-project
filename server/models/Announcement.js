module.exports = (sequelize, DataTypes) => {
  // UC-26: HR broadcasts shown as a banner/modal to targeted users.
  // Targeting: ALL | COUNTRY | ROLE. Optional requiresAck blocks navigation
  // until acknowledged. Auto-expires at endDate.
  const Announcement = sequelize.define(
    'Announcement',
    {
      title: { type: DataTypes.STRING(200), allowNull: false },
      body: { type: DataTypes.STRING(1000), allowNull: false },
      targetType: {
        type: DataTypes.ENUM('ALL', 'COUNTRY', 'ROLE'),
        allowNull: false,
        defaultValue: 'ALL',
      },
      targetValue: { type: DataTypes.STRING(20), allowNull: true }, // country code or role
      startDate: { type: DataTypes.DATEONLY, allowNull: false },
      endDate: { type: DataTypes.DATEONLY, allowNull: false },
      requiresAck: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdByName: { type: DataTypes.STRING(120), allowNull: false },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'announcements' }
  );

  Announcement.associate = (models) => {
    Announcement.hasMany(models.AnnouncementAck, {
      foreignKey: 'announcementId',
      onDelete: 'cascade',
    });
  };

  return Announcement;
};
