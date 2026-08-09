'use strict';

// Client-generated keys make a retried or double-clicked leave submission
// resolve to the same persisted request. Keys are opaque, bounded and never
// contain leave details or authentication material.
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,79}$/;

const normalizeSubmissionKey = (value) => {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const key = String(value).trim();
    if (!KEY_PATTERN.test(key)) {
        const error = new Error('Idempotency-Key must be 16–80 safe characters.');
        error.code = 'INVALID_IDEMPOTENCY_KEY';
        throw error;
    }
    return key;
};

module.exports = { KEY_PATTERN, normalizeSubmissionKey };
