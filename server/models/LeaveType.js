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
            unique: 'leave_types_code_unique'
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
        },
        // Per-country configurability: which country codes may offer this type.
        // null/empty = every country (the default for the original 5 types).
        applicableCountries: {
            type: DataTypes.JSON,
            allowNull: true
        },
        // ANY (default) | MALE | FEMALE — restricts who may select this type,
        // e.g. maternity leave (FEMALE) or NS/reservist leave (MALE) in Singapore.
        genderRestriction: {
            type: DataTypes.ENUM("ANY", "MALE", "FEMALE"),
            allowNull: false,
            defaultValue: "ANY"
        }
    }, {
        tableName: 'leave_types'
    });

    return LeaveType;
}
