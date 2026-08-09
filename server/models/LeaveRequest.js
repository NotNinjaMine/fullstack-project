module.exports = (sequelize, DataTypes) => {
    const LeaveRequest = sequelize.define("LeaveRequest", {
        leaveType: {
            // Cannot be changed after submission - cancel and re-apply instead.
            // A free-form code (not a fixed ENUM) validated against the
            // LeaveType catalogue at request time, so HR can add new types
            // (e.g. maternity, NS leave) without a schema change.
            type: DataTypes.STRING(30),
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
                // PENDING_BOSS is the stage a Manager's own leave sits at -
                // only the Boss can decide it (services/approvalChain.js).
                "PENDING_SUPERVISOR", "PENDING_MANAGER", "PENDING_BOSS",
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
        // M3: age reminders from entry into the CURRENT workflow stage.
        stageEnteredAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // M3: request + stage-entry + recipient-set + 24h window claim.
        lastReminderKey: {
            type: DataTypes.STRING(255),
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
        // M2 (UC-03): set when an ALREADY-APPROVED leave is being withdrawn. The
        // request re-enters PENDING_SUPERVISOR → PENDING_MANAGER carrying this
        // flag; the same two-tier chain then decides the cancellation. On final
        // approval the request becomes CANCELLED and the balance is restored; on
        // rejection it snaps back to APPROVED and the leave stands.
        // M2 (UC-03, partial cancellation): the proposed NEW last day of leave
        // while an employee's "returning early" request waits for approval.
        //   cancellationRequested + pendingEndDate  -> shorten to that date
        //   cancellationRequested alone             -> withdraw the whole thing
        // On final approval endDate moves here, `days` is recomputed, and only
        // the difference is returned to the balance.
        pendingEndDate: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        cancellationRequested: {
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
        // Legacy M3 column retained additively for existing databases. It is no
        // longer read or written: delegation changes the actor but must never
        // replace the employee's original Supervisor -> Manager team chain.
        routedTeam: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        // Opaque client-generated key for retry/double-click safety. The
        // composite unique index below permits many NULL legacy rows while
        // ensuring one submitted request per employee/key pair.
        submissionKey: {
            type: DataTypes.STRING(80),
            allowNull: true
        }
    }, {
        tableName: 'leave_requests',
        indexes: [{
            name: 'uq_leave_request_employee_submission',
            unique: true,
            fields: ['employeeId', 'submissionKey']
        }]
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
