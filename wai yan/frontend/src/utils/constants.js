export const ROLES = {
  EMPLOYEE: 'employee',
  SUPERVISOR: 'supervisor',
  MANAGER: 'manager',
  HOD: 'hod',
  HR_ADMIN: 'hr_admin',
};

export const LEAVE_TYPES = [
  { value: 'annual', label: 'Annual Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' },
  { value: 'other', label: 'Other' },
];

export const LEAVE_STATUSES = {
  pending: { label: 'Pending', color: 'yellow' },
  supervisor_approved: { label: 'Supervisor Approved', color: 'blue' },
  approved: { label: 'Approved', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  cancel_pending: { label: 'Cancel Pending', color: 'orange' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};

export const APPROVER_ROLES = [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.HR_ADMIN];

export function canAccessApprovals(role) {
  return APPROVER_ROLES.includes(role);
}

export function formatRole(role) {
  if (!role) return '';
  return role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
