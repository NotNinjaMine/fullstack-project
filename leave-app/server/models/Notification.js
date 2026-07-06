module.exports = (sequelize, DataTypes) => {
    const Notification = sequelize.define("Notification", {
        message: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        readAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        tableName: 'notifications'
    });

    Notification.associate = (models) => {
        Notification.belongsTo(models.User, {
            foreignKey: "userId"
        });
    };

    return Notification;
}
