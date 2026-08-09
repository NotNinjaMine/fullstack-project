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
                // "DRAFT" (M2 UC-14) is a private, un-routed state added additively.
                "DRAFT",
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
        },
        // M3: last 24h pending-reminder timestamp
        reminderSentAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // F3: rejection / decision notes (optional; filled when approver rejects)
        supervisorNote: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        managerNote: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        // M2 (UC-14): a draft is private to the employee and never routed until submitted.
        isDraft: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        // M2 (UC-13): medical-certificate metadata (data URL stored in attachmentData).
        attachmentName: {
            type: DataTypes.STRING(200),
            allowNull: true
        },
        attachmentType: {
            type: DataTypes.STRING(60),
            allowNull: true
        },
        attachmentData: {
            // base64 data URL of the MC (PDF/JPG/PNG). Kept in-row for the prototype's
            // self-contained storage; access is restricted to owner/approvers/HR.
            type: DataTypes.TEXT('long'),
            allowNull: true
        },
        // M3: when a Supervisor decision is made by a cross-team delegate (not
        // the employee's own-team Supervisor), routedTeam records which team's
        // chain now owns this request, so the Manager tier goes to THAT team's
        // Manager rather than snapping back to the employee's original team.
        // Null means "use the employee's own team" (the normal, non-delegated path).
        routedTeam: {
            type: DataTypes.STRING(50),
            allowNull: true
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
