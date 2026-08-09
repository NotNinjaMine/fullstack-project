module.exports = (sequelize, DataTypes) => {
    // M5 (UC-30): a recurring report delivery. A setInterval sweep (no node-cron,
    // matching the M3 reminder pattern) generates the report scoped to the owner's
    // role visibility and emails it (best-effort) to the recipient list.
    const ReportSchedule = sequelize.define("ReportSchedule", {
        reportType: {
            type: DataTypes.ENUM(
                "leave_utilisation", "carry_forward_summary", "sick_leave_trend", "pending_overview"
            ),
            allowNull: false
        },
        frequency: {
            type: DataTypes.ENUM("weekly", "monthly", "quarterly"),
            allowNull: false,
            defaultValue: "monthly"
        },
        format: {
            type: DataTypes.ENUM("CSV", "PDF"),
            allowNull: false,
            defaultValue: "CSV"
        },
        recipients: {
            // JSON array of email strings (may include external addresses, e.g. payroll)
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: []
        },
        active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        lastRunAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        ownerName: {
            type: DataTypes.STRING(50),
            allowNull: false
        }
    }, {
        tableName: 'report_schedules'
    });

    ReportSchedule.associate = (models) => {
        ReportSchedule.belongsTo(models.User, { as: "owner", foreignKey: "ownerUserId" });
    };

    return ReportSchedule;
}
