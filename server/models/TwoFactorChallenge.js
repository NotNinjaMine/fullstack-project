module.exports = (sequelize, DataTypes) => {
    // M1 (2FA): one row per second-step login challenge.
    //
    // Security notes:
    //  - The 6-digit code is stored ONLY as a SHA-256 hash, never in plain text
    //    (same approach as the password-reset and invitation tokens).
    //  - challengeTokenHash is the hash of an opaque random token handed to the
    //    browser after the password step. It is NOT an access token: it only
    //    identifies this challenge, carries no role, and grants no API access.
    //  - attempts is incremented on every wrong code so a challenge can be burned
    //    after MAX_ATTEMPTS, preventing brute-forcing a 6-digit code.
    //  - consumedAt makes the challenge strictly single-use.
    const TwoFactorChallenge = sequelize.define("TwoFactorChallenge", {
        challengeTokenHash: {
            type: DataTypes.STRING(64),
            allowNull: false
        },
        codeHash: {
            // Null until the user chooses a delivery method and a code is sent.
            type: DataTypes.STRING(64),
            allowNull: true
        },
        method: {
            // Null until chosen on the "how do you want to verify?" step.
            // SMS remains as a legacy database value; EMAIL and AUTHENTICATOR
            // are the methods new challenges actually use (M1 UC-25).
            type: DataTypes.ENUM("EMAIL", "SMS", "AUTHENTICATOR"),
            allowNull: true
        },
        destination: {
            // Masked destination shown back to the user (e.g. "t••••g@wypledu.online",
            // "+65 ••••1234"). Deliberately masked so the challenge response never
            // discloses a full address or phone number.
            type: DataTypes.STRING(120),
            allowNull: true
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: false
        },
        attempts: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        resendCount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        lastSentAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        consumedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        ipAddress: {
            type: DataTypes.STRING(64),
            allowNull: true
        }
    }, {
        tableName: 'two_factor_challenges'
    });

    TwoFactorChallenge.associate = (models) => {
        TwoFactorChallenge.belongsTo(models.User, { foreignKey: "userId", onDelete: "cascade" });
    };

    return TwoFactorChallenge;
}
