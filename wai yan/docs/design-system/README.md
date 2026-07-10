# Leave Manager — Design System (Figma-ready)

This folder is a **browser-based design system** organized like a Figma file.

> **Note:** A native `.fig` binary cannot be generated from this environment without Figma API access.  
> Open `index.html` in a browser for the full interactive prototype, or rebuild the same structure in Figma using the tokens below.

## Open the design system

```powershell
# From project root
start docs\design-system\index.html
```

Or double-click: `docs/design-system/index.html`

## Figma file structure (recommended)

Create a Figma file with these **pages**:

| Figma page | Contents |
|------------|----------|
| `00 · Design System` | Colors, type, spacing, components, states |
| `01 · Employee` | Dashboard, Apply Leave, Leave History, Team Calendar, Profile, Notifications |
| `02 · Supervisor` | Dashboard, Approval Queue (L1), Team Calendar, Profile, Notifications |
| `03 · Manager` | Dashboard, Approval Queue (L2 final), Team Calendar, Profile, Notifications |
| `04 · HR Admin` | Dashboard, Company, Calendar, Profile, Notifications, Audit/exports |

Frame size: **1440 × 900** (desktop). Optional: **375 × 812** mobile variants.

Use **Auto Layout** (vertical/horizontal) on every frame and component, matching the HTML layout.

## Tokens

| Token | Value | Use |
|-------|-------|-----|
| `bg/canvas` | `#0F172A` | App background |
| `bg/surface` | `#1E293B` | Cards, modals, sidebars |
| `bg/surface-2` | `#243044` | Inset wells, bulk bar |
| `border/default` | `#334155` | Card borders |
| `accent/primary` | `#6366F1` | Primary buttons, links, focus |
| `accent/success` | `#22C55E` | Approve |
| `accent/danger` | `#EF4444` | Reject |
| `text/primary` | `#F8FAFC` | Headings |
| `text/muted` | `#94A3B8` | Secondary |
| `text/subtle` | `#64748B` | Labels |
| Radius | `12–16px` | Buttons / cards |
| Font | Inter | All UI |

## Component set (shared across roles)

- Buttons: Primary, Success, Danger, Ghost, Secondary  
- Inputs, Textarea, Select  
- Cards (stat, leave, approval)  
- Status badges (Pending, Supervisor Approved, Approved, Rejected, …)  
- Navbar + Sidebar + Bottom nav (mobile)  
- Modal / Review Request  
- Notification row  
- Calendar day cell  
- Avatar + role chip  

## Role-specific behaviour

| Role | Approval Queue | Calendar scope | Extra |
|------|----------------|----------------|--------|
| Employee | — (or own pending view) | Team (department) | Apply Leave, Leave History |
| Supervisor | L1 · direct reports | Direct reports | Quick Approve/Reject |
| Manager | L2 · after supervisor | Multi-team | Final Approve/Reject |
| HR Admin | View / export (no final bypass) | Company-wide | Company & offices |

## Screenshots / reference

Rebuild in Figma by screenshotting frames from `index.html` (browser zoom 100%) or using plugins like **html.to.design** if available.
