/** FIGMA page id → route path (MERGE_PLAN §6) */
export const PAGE_ROUTES = {
  dashboard: '/',
  apply: '/leave/apply',
  history: '/leave',
  approvals: '/approvals',
  calendar: '/calendar',
  notifications: '/notifications',
  profile: '/profile',
  admin: '/admin',
}

/** Route path → page title */
export const PATH_TITLES = {
  '/': 'Dashboard',
  '/leave/apply': 'Apply for Leave',
  '/leave': 'My Leave History',
  '/approvals': 'Approval Queue',
  '/approvals/delegations': 'Delegations',
  '/calendar': 'Team Calendar',
  '/notifications': 'Notifications',
  '/profile': 'My Profile',
  '/admin': 'Admin Panel',
  '/company': 'Company',
}

export function pathToPageId(pathname) {
  if (pathname === '/' || pathname === '') return 'dashboard'
  if (pathname.startsWith('/leave/apply')) return 'apply'
  if (pathname.startsWith('/leave')) return 'history'
  if (pathname.startsWith('/approvals/delegations')) return 'approvals'
  if (pathname.startsWith('/approvals')) return 'approvals'
  if (pathname.startsWith('/calendar')) return 'calendar'
  if (pathname.startsWith('/notifications')) return 'notifications'
  if (pathname.startsWith('/profile')) return 'profile'
  if (pathname.startsWith('/admin')) return 'admin'
  return 'dashboard'
}

export function isNavActive(pageId, pathname) {
  const route = PAGE_ROUTES[pageId]
  if (!route) return false
  if (route === '/') return pathname === '/' || pathname === ''
  return pathname === route || pathname.startsWith(`${route}/`)
}

/** Avatar initials from full name */
export function nameInitials(name) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/** Stable color from name hash */
export function nameColor(name) {
  // Decorative avatar hues (not status/UI chrome — status uses CSS tokens)
  const colors = ['#16A34A', '#5B5BD6', '#D97706', '#7C7CF0', '#34D399', '#6B7280', '#F87171', '#FBBF24']
  const s = name || ''
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h + s.charCodeAt(i) * (i + 1)) % colors.length
  return colors[h]
}
