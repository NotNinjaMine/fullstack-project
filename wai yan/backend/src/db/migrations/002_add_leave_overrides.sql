-- ENH-5: snapshot request-specific applicant details without changing HR records.
ALTER TABLE leave_requests ADD COLUMN applicant_name_override VARCHAR(255);
ALTER TABLE leave_requests ADD COLUMN applicant_department_override VARCHAR(100);
