module.exports = (sequelize, DataTypes) => {
    // M1 (UC-24): single-use, hashed invitation token (48h expiry). The account
    // is created up-front as INVITED (inactive) and activated on registration via
    // the token. tokenHash is a SHA-256 of the raw token; the raw token is emailed
    // (or returned in demo mode when SMTP is unset, mirroring the reset flow).
    const UserInvitation = sequelize.define("UserInvitation", {
        email: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        name: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        country: {
            type: DataTypes.STRING(2),
            allowNull: false,
            defaultValue: "SG"
        },
        team: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: "Compliance Team A"
        },
        role: {
            type: DataTypes.ENUM("EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"),
            allowNull: false,
            defaultValue: "EMPLOYEE"
        },
        startDate: {
            // used for pro-ration (UC-20) when the account activates
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        tokenHash: {
            type: DataTypes.STRING(64),
            allowNull: false
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: false
        },
        acceptedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        invitedByName: {
            type: DataTypes.STRING(50),
            allowNull: false
        }
    }, {
        tableName: 'user_invitations'
    });

    return UserInvitation;
}
