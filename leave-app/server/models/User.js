module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define("User", {
        name: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        email: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        password: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        role: {
            // Two-tier approval: EMPLOYEE -> SUPERVISOR -> MANAGER (no bypass)
            type: DataTypes.ENUM("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"),
            allowNull: false,
            defaultValue: "EMPLOYEE"
        },
        country: {
            // Drives leave policy + public holiday calendar (10 countries)
            type: DataTypes.STRING(2),
            allowNull: false,
            defaultValue: "SG"
        },
        team: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: "Compliance Team A"
        },
        initials: {
            type: DataTypes.STRING(3),
            allowNull: false,
            defaultValue: "??"
        }
    }, {
        tableName: 'users'
    });

    User.associate = (models) => {
        User.hasMany(models.LeaveRequest, {
            foreignKey: "employeeId",
            onDelete: "cascade"
        });
        User.hasMany(models.LeaveBalance, {
            foreignKey: "userId",
            onDelete: "cascade"
        });
        User.hasMany(models.Notification, {
            foreignKey: "userId",
            onDelete: "cascade"
        });
    };

    return User;
}
