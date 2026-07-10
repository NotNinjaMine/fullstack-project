export const ROLES = {
  EMPLOYEE: 'employee',
  SUPERVISOR: 'supervisor',
  MANAGER: 'manager',
  HOD: 'hod',
  HR_ADMIN: 'hr_admin',
};

/** FIGMA nav labels + icons by role (page ids map via utils/nav PAGE_ROUTES) */
export const PAGES_BY_ROLE = {
  employee: [
    { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
    { id: 'apply', label: 'Apply for Leave', icon: 'PlusCircle' },
    { id: 'history', label: 'My Leave History', icon: 'Clock' },
    { id: 'calendar', label: 'Team Calendar', icon: 'CalendarDays' },
    { id: 'notifications', label: 'Notifications', icon: 'Bell' },
    { id: 'profile', label: 'My Profile', icon: 'User' },
  ],
  supervisor: [
    { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
    { id: 'approvals', label: 'Approval Queue', icon: 'CheckSquare' },
    { id: 'calendar', label: 'Team Calendar', icon: 'CalendarDays' },
    { id: 'notifications', label: 'Notifications', icon: 'Bell' },
    { id: 'profile', label: 'My Profile', icon: 'User' },
  ],
  manager: [
    { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
    { id: 'approvals', label: 'Approval Queue', icon: 'CheckSquare' },
    { id: 'calendar', label: 'Team Calendar', icon: 'CalendarDays' },
    { id: 'notifications', label: 'Notifications', icon: 'Bell' },
    { id: 'profile', label: 'My Profile', icon: 'User' },
  ],
  hr_admin: [
    { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
    { id: 'approvals', label: 'Approval Queue', icon: 'CheckSquare' },
    { id: 'calendar', label: 'Team Calendar', icon: 'CalendarDays' },
    { id: 'notifications', label: 'Notifications', icon: 'Bell' },
    { id: 'profile', label: 'My Profile', icon: 'User' },
    { id: 'admin', label: 'Admin Panel', icon: 'Shield' },
  ],
  hod: [
    { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
    { id: 'approvals', label: 'Approval Queue', icon: 'CheckSquare' },
    { id: 'calendar', label: 'Team Calendar', icon: 'CalendarDays' },
    { id: 'notifications', label: 'Notifications', icon: 'Bell' },
    { id: 'profile', label: 'My Profile', icon: 'User' },
  ],
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
