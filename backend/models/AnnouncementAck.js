module.exports = (sequelize, DataTypes) => {
    // M1 (UC-26): one row per user acknowledgement of a mandatory announcement.
    // HR reads a read/ack count per announcement from this table.
    const AnnouncementAck = sequelize.define("AnnouncementAck", {
        // (announcementId, userId) belongsTo below; ackedAt = createdAt
    }, {
        tableName: 'announcement_acks'
    });

    AnnouncementAck.associate = (models) => {
        AnnouncementAck.belongsTo(models.Announcement, { foreignKey: "announcementId", onDelete: "cascade" });
        AnnouncementAck.belongsTo(models.User, { foreignKey: "userId", onDelete: "cascade" });
    };

    return AnnouncementAck;
}
