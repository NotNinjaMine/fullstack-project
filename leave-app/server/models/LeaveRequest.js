module.exports = (sequelize, DataTypes) => {
    const LeaveRequest = sequelize.define("LeaveRequest", {
        leaveType: {
            // Cannot be changed after submission - cancel and re-apply instead
            type: DataTypes.ENUM("annual", "sick_mc", "sick_nomc"),
            allowNull: false
        },
        startDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        endDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        days: {
            // 0.5 for half-day; PHs/weekends excluded (never deducted)
            type: DataTypes.DECIMAL(4, 1),
            allowNull: false
        },
        halfDay: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        halfDayPeriod: {
            type: DataTypes.ENUM("AM", "PM"),
            allowNull: true
        },
        reason: {
            type: DataTypes.STRING(200),
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM(
                "PENDING_SUPERVISOR", "PENDING_MANAGER",
                "APPROVED", "REJECTED", "CANCELLED"
            ),
            allowNull: false,
            defaultValue: "PENDING_SUPERVISOR"
        },
        flagged: {
            // true = coverage below threshold, needs Manager special approval
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        tableName: 'leave_requests'
    });

    LeaveRequest.associate = (models) => {
        LeaveRequest.belongsTo(models.User, {
            as: "employee",
            foreignKey: "employeeId"
        });
        LeaveRequest.hasMany(models.AuditLog, {
            foreignKey: "requestId",
            onDelete: "cascade"
        });
    };

    return LeaveRequest;
}
