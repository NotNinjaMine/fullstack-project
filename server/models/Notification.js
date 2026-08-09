module.exports = (sequelize, DataTypes) => {
    const Notification = sequelize.define("Notification", {
        message: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        readAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // M3: e.g. "APPROVAL", "COMMENT", "REMINDER", "DELEGATION"
        type: {
            type: DataTypes.STRING(20),
            allowNull: true
        },
        // M3: link back to the leave_requests row, when relevant
        requestId: {
            type: DataTypes.INTEGER,
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
