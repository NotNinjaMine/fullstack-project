module.exports = (sequelize, DataTypes) => {
    // M5 (UC-10): configurable catalogue of leave types shown in the HR admin panel.
    // The core apply/balance flow still uses the fixed annual/sick_mc/sick_nomc enum
    // (LeaveRequest.leaveType); this table lets HR document/toggle types and drives
    // the admin "Leave types" screen without touching the two-tier state machine.
    const LeaveType = sequelize.define("LeaveType", {
        code: {
            // e.g. annual, sick_mc, sick_nomc, unpaid, maternity, childcare, compassionate, other
            type: DataTypes.STRING(20),
            allowNull: false,
            unique: true
        },
        name: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        affectsAnnualBalance: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        affectsSickBalance: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        requiresMc: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        tableName: 'leave_types'
    });

    return LeaveType;
}
