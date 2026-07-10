// Shared design system UI components
import { useEffect, useRef, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'

// ── Button ─────────────────────────────────────────────────────────────────
const BUTTON_VARIANTS = {
  primary: {
    background: 'var(--accent-gradient)',
    color: 'var(--on-accent)',
    border: '1px solid transparent',
    boxShadow: 'var(--shadow-accent)',
  },
  secondary: {
    background: 'var(--surface-2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    boxShadow: 'none',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid transparent',
    boxShadow: 'none',
  },
  danger: {
    background: 'transparent',
    color: 'var(--danger)',
    border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
    boxShadow: 'none',
  },
  success: {
    background: 'var(--success)',
    color: 'var(--on-accent)',
    border: '1px solid transparent',
    boxShadow: '0 4px 14px color-mix(in srgb, var(--success) 28%, transparent)',
  },
  warning: {
    background: 'var(--warning-muted)',
    color: 'var(--warning)',
    border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
    boxShadow: 'none',
  },
  info: {
    background: 'var(--info-muted)',
    color: 'var(--info)',
    border: '1px solid color-mix(in srgb, var(--info) 30%, transparent)',
    boxShadow: 'none',
  },
}

const BUTTON_SIZES = {
  xs: { padding: '4px 10px', fontSize: 'var(--font-size-xs)', gap: '4px', height: '28px' },
  sm: { padding: '6px 12px', fontSize: 'var(--font-size-sm)', gap: '5px', height: '32px' },
  md: { padding: '8px 16px', fontSize: 'var(--font-size-sm)', gap: '6px', height: '38px' },
  lg: { padding: '10px 20px', fontSize: 'var(--font-size-base)', gap: '8px', height: '44px' },
}

export function Button({ children, variant = 'primary', size = 'md', onClick = undefined, disabled = false, style = {}, onMouseEnter, onMouseLeave, ...props }) {
  const v = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary
  const s = BUTTON_SIZES[size] || BUTTON_SIZES.md
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...v, ...s,
        borderRadius: 'var(--radius-sm)',
        fontWeight: 'var(--font-weight-semibold)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        transition: 'transform var(--transition), box-shadow var(--transition), filter var(--transition), background var(--transition), border-color var(--transition), color var(--transition)',
        fontFamily: 'inherit',
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = 'translateY(-1px)'
          if (variant === 'primary') {
            e.currentTarget.style.filter = 'brightness(1.06)'
            e.currentTarget.style.boxShadow = 'var(--shadow-accent)'
          } else if (variant === 'success') {
            e.currentTarget.style.filter = 'brightness(1.06)'
          } else if (variant === 'danger') {
            e.currentTarget.style.background = 'var(--danger-muted)'
            e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--danger) 50%, transparent)'
          } else {
            e.currentTarget.style.filter = 'brightness(1.05)'
          }
        }
        onMouseEnter?.(e)
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.filter = 'none'
        if (variant === 'danger') {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--danger) 40%, transparent)'
        }
        onMouseLeave?.(e)
      }}
      {...props}
    >
      {children}
    </button>
  )
}

// ── Badge ──────────────────────────────────────────────────────────────────
const BADGE_CONFIGS = {
  pending: { bg: 'var(--warning-muted)', color: 'var(--warning)', border: 'color-mix(in srgb, var(--warning) 35%, transparent)', dot: true },
  approved: { bg: 'var(--success-muted)', color: 'var(--success)', border: 'color-mix(in srgb, var(--success) 35%, transparent)', dot: true },
  rejected: { bg: 'var(--danger-muted)', color: 'var(--danger)', border: 'color-mix(in srgb, var(--danger) 35%, transparent)', dot: true },
  // In-progress approval tier — neutral brand accent (not a terminal status)
  supervisor_approved: { bg: 'var(--accent-muted)', color: 'var(--accent-hover)', border: 'color-mix(in srgb, var(--accent) 30%, transparent)', dot: true },
  cancelled: { bg: 'color-mix(in srgb, var(--text-dim) 14%, transparent)', color: 'var(--text-dim)', border: 'color-mix(in srgb, var(--text-dim) 30%, transparent)', dot: true },
  cancel_pending: { bg: 'var(--warning-muted)', color: 'var(--warning)', border: 'color-mix(in srgb, var(--warning) 35%, transparent)', dot: true },
  // Leave types = category labels (neutral), not status colors
  annual: { bg: 'var(--surface-2)', color: 'var(--text-muted)', border: 'var(--border)', dot: false },
  sick: { bg: 'var(--surface-2)', color: 'var(--text-muted)', border: 'var(--border)', dot: false },
  unpaid: { bg: 'var(--surface-2)', color: 'var(--text-dim)', border: 'var(--border)', dot: false },
  other: { bg: 'var(--surface-2)', color: 'var(--text-dim)', border: 'var(--border)', dot: false },
}

const BADGE_LABELS = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
  supervisor_approved: 'Sup. Approved', cancelled: 'Cancelled',
  cancel_pending: 'Cancel Pending', annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid', other: 'Other',
}

export function Badge({ status, label = '', dot = true }) {
  const config = BADGE_CONFIGS[status] || { bg: 'var(--accent-muted)', color: 'var(--accent)', border: 'color-mix(in srgb, var(--accent) 35%, transparent)', dot: false }
  const text = label || BADGE_LABELS[status] || status
  return (
    <span style={{
      background: config.bg, color: config.color,
      border: `1px solid ${config.border}`,
      padding: '3px 10px', borderRadius: '100px',
      fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', letterSpacing: '0.02em',
      whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '5px',
    }}>
      {dot && config.dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: config.color, flexShrink: 0 }} />}
      {text}
    </span>
  )
}

// ── Token color helpers (works with CSS vars; avoids broken hex-alpha concat) ─
export function tint(color, pct = 12) {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}

/** Leave-type accent for list bars — neutral hierarchy, not status colors */
export function leaveTypeColor(type) {
  const map = {
    annual: 'var(--border-strong)',
    sick: 'var(--text-dim)',
    unpaid: 'var(--border)',
    other: 'var(--border)',
  }
  return map[type] || 'var(--border-strong)'
}

// ── Card ───────────────────────────────────────────────────────────────────
export function Card({ children, style = {}, padding = 'var(--space-5)', hoverable = false, ...props }) {
  const {
    onMouseEnter: userEnter,
    onMouseLeave: userLeave,
    ...rest
  } = props
  return (
    <div
      style={{
        background: 'var(--surface-gradient)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding,
        boxShadow: 'var(--shadow-sm)',
        transition: 'transform var(--transition-slow), box-shadow var(--transition-slow), border-color var(--transition)',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (hoverable) {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = 'var(--shadow-hover)'
          e.currentTarget.style.borderColor = 'var(--border-strong)'
        }
        userEnter?.(e)
      }}
      onMouseLeave={(e) => {
        if (hoverable) {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = style.boxShadow || 'var(--shadow-sm)'
          e.currentTarget.style.borderColor = style.border?.includes?.('solid')
            ? undefined
            : 'var(--border)'
          if (!style.border) e.currentTarget.style.borderColor = 'var(--border)'
        }
        userLeave?.(e)
      }}
      {...rest}
    >
      {children}
    </div>
  )
}

// ── Avatar ─────────────────────────────────────────────────────────────────
export function Avatar({ initials, color = 'var(--accent)', size = 36, style = {}, online = false }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, ...style }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: tint(color, 16),
        border: `1.5px solid ${tint(color, 38)}`,
        color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.34), fontWeight: 'var(--font-weight-bold)', letterSpacing: '0.02em',
      }}>
        {initials}
      </div>
      {online && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: Math.max(8, Math.round(size * 0.28)),
            height: Math.max(8, Math.round(size * 0.28)),
            borderRadius: '50%',
            background: 'var(--success)',
            border: '2px solid var(--surface)',
            boxShadow: '0 0 0 1px color-mix(in srgb, var(--success) 40%, transparent)',
          }}
        />
      )}
    </div>
  )
}

/**
 * StatCard — size hierarchy:
 *   size="md"   default supporting metric (40px value)
 *   size="hero" north-star metric (56–64px value, larger icon + padding)
 * color: use semantic tokens only when the metric itself is a status (pending/risk);
 * otherwise prefer var(--text-muted) for a calm neutral surface.
 */
export function StatCard({
  icon,
  label,
  value,
  sub,
  color = 'var(--text-muted)',
  trend,
  size = 'md',
  footer = null,
}) {
  const isHero = size === 'hero'
  const showTrend = typeof trend === 'number' && !Number.isNaN(trend)
  const numeric = typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(String(value).trim()))
  const [display, setDisplay] = useState(value)
  const played = useRef(false)

  const iconBox = isHero ? 56 : 44
  const valueSize = isHero ? 'clamp(48px, 5vw, 64px)' : 'var(--font-size-stat)'
  const pad = isHero ? 'var(--space-6) var(--space-6) var(--space-5)' : undefined

  useEffect(() => {
    if (!numeric || played.current) {
      setDisplay(value)
      return
    }
    played.current = true
    const target = Number(value)
    if (!Number.isFinite(target)) {
      setDisplay(value)
      return
    }
    const duration = 520
    const start = performance.now()
    let raf
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      setDisplay(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
      else setDisplay(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // Count-up once on first mount only — do not re-run on value refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (played.current) setDisplay(value)
  }, [value])

  return (
    <Card
      hoverable
      padding={pad}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--surface-gradient)',
        minHeight: isHero ? 168 : undefined,
        height: '100%',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: isHero ? 'var(--space-5)' : 'var(--space-4)',
        position: 'relative',
        zIndex: 1,
      }}
      >
        <div style={{
          width: iconBox,
          height: iconBox,
          borderRadius: isHero ? 'var(--radius)' : 'var(--radius-sm)',
          background: tint(color, 12),
          border: `1px solid ${tint(color, 26)}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
          boxShadow: isHero ? `0 0 28px ${tint(color, 14)}` : `0 0 16px ${tint(color, 10)}`,
          transition: 'transform var(--transition)',
          flexShrink: 0,
        }}
        >
          {icon}
        </div>
        {showTrend && (
          <span style={{
            fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)',
            color: trend >= 0 ? 'var(--success)' : 'var(--danger)',
            background: trend >= 0 ? 'var(--success-muted)' : 'var(--danger-muted)',
            border: `1px solid ${trend >= 0 ? 'color-mix(in srgb, var(--success) 28%, transparent)' : 'color-mix(in srgb, var(--danger) 28%, transparent)'}`,
            padding: '3px 8px', borderRadius: 100,
          }}
          >
            {trend >= 0 ? '↑' : '↓'}{Math.abs(trend)}%
          </span>
        )}
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          fontSize: valueSize,
          fontWeight: 'var(--font-weight-bold)',
          color: 'var(--text)',
          lineHeight: 1,
          marginBottom: 'var(--space-2)',
          letterSpacing: 'var(--letter-tight)',
          fontVariantNumeric: 'tabular-nums',
        }}
        >
          {display}
        </div>
        <div style={{
          fontSize: isHero ? 'var(--font-size-base)' : 'var(--font-size-sm)',
          color: 'var(--text-muted)',
          fontWeight: isHero ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)',
        }}
        >
          {label}
        </div>
        {sub && (
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-dim)',
            marginTop: 'var(--space-1)',
          }}
          >
            {sub}
          </div>
        )}
        {footer && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            {footer}
          </div>
        )}
      </div>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          bottom: isHero ? -40 : -32,
          right: isHero ? -40 : -32,
          width: isHero ? 160 : 120,
          height: isHero ? 160 : 120,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${tint(color, isHero ? 20 : 18)} 0%, transparent 68%)`,
          pointerEvents: 'none',
        }}
      />
    </Card>
  )
}

// ── ListRow — shared list item with optional leave-type accent + hover ─────
export function ListRow({ children, accent, last = false, style = {}, onClick }) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(e)
        }
      } : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: '12px 14px',
        marginLeft: -4,
        marginRight: -4,
        borderRadius: 'var(--radius-sm)',
        borderBottom: last ? 'none' : '1px solid var(--border-light)',
        borderLeft: `3px solid ${accent || 'transparent'}`,
        background: 'transparent',
        transition: 'background var(--transition), transform var(--transition)',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--surface-2)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </div>
  )
}

// ── StatusPill — compact status chip for team/away lists ───────────────────
export function StatusPill({ tone = 'muted', children, style = {} }) {
  // success/warning/danger = real status only; muted/accent for non-status labels
  const tones = {
    success: { bg: 'var(--success-muted)', color: 'var(--success)', border: 'color-mix(in srgb, var(--success) 28%, transparent)' },
    danger: { bg: 'var(--danger-muted)', color: 'var(--danger)', border: 'color-mix(in srgb, var(--danger) 28%, transparent)' },
    warning: { bg: 'var(--warning-muted)', color: 'var(--warning)', border: 'color-mix(in srgb, var(--warning) 28%, transparent)' },
    info: { bg: 'var(--surface-2)', color: 'var(--text-muted)', border: 'var(--border)' },
    accent: { bg: 'var(--accent-muted)', color: 'var(--accent)', border: 'color-mix(in srgb, var(--accent) 28%, transparent)' },
    muted: { bg: 'var(--surface-2)', color: 'var(--text-dim)', border: 'var(--border)' },
  }
  const t = tones[tone] || tones.muted
  return (
    <span style={{
      fontSize: 'var(--font-size-xs)',
      fontWeight: 'var(--font-weight-semibold)',
      borderRadius: 100,
      padding: '3px 9px',
      background: t.bg,
      color: t.color,
      border: `1px solid ${t.border}`,
      whiteSpace: 'nowrap',
      letterSpacing: '0.02em',
      ...style,
    }}>
      {children}
    </span>
  )
}

// ── Input ──────────────────────────────────────────────────────────────────
export function Input({ label, type = 'text', value, onChange, placeholder = '', disabled = false, style = {}, required = false, note = '' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled}
        style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '9px 12px',
          color: 'var(--text)', fontSize: 14, width: '100%',
          transition: 'border-color var(--transition)', outline: 'none',
          opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'text', ...style,
        }}
        onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
        onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
      />
      {note && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{note}</div>}
    </div>
  )
}

// ── Select ─────────────────────────────────────────────────────────────────
export function Select({ label, value, onChange, children, style = {}, required = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <select
        value={value} onChange={onChange}
        style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '9px 12px',
          color: 'var(--text)', fontSize: 14, width: '100%', outline: 'none', cursor: 'pointer', ...style,
        }}
        onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
        onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
      >
        {children}
      </select>
    </div>
  )
}

// ── Textarea ───────────────────────────────────────────────────────────────
export function Textarea({ label, value, onChange, placeholder = '', rows = 3, style = {}, required = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <textarea
        value={value} onChange={onChange} placeholder={placeholder} rows={rows}
        style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '9px 12px',
          color: 'var(--text)', fontSize: 14, width: '100%', resize: 'vertical',
          outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, ...style,
        }}
        onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
        onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
      />
    </div>
  )
}

// ── Toggle ─────────────────────────────────────────────────────────────────
export function Toggle({ checked, onChange, label = '' }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: 11,
          background: checked ? 'var(--accent)' : 'var(--surface-3)',
          border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
          position: 'relative', transition: 'all var(--transition)', cursor: 'pointer', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: checked ? 19 : 2,
          width: 16, height: 16, borderRadius: '50%', background: 'var(--on-accent)',
          transition: 'left var(--transition)', boxShadow: 'var(--shadow-sm)',
        }} />
      </div>
      {label && <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>}
    </label>
  )
}

// ── ProgressBar ────────────────────────────────────────────────────────────
export function ProgressBar({ value, max, color = 'var(--accent)', height = 6, semantic = true }) {
  const safeMax = max > 0 ? max : 1
  const pct = Math.min(100, Math.round((Number(value) / safeMax) * 100))
  // Optional usage thresholds: high usage → real attention signals only
  const barColor = semantic
    ? (pct > 80 ? 'var(--danger)' : pct > 60 ? 'var(--warning)' : color)
    : color
  return (
    <div style={{
      background: 'var(--surface-3)',
      borderRadius: 100,
      height,
      overflow: 'hidden',
      border: '1px solid var(--border-light)',
    }}
    >
      <div style={{
        width: `${pct}%`,
        height: '100%',
        background: barColor,
        borderRadius: 100,
        transition: 'width var(--transition-slow)',
      }}
      />
    </div>
  )
}

// ── SectionHeader ──────────────────────────────────────────────────────────
export function SectionHeader({ title, subtitle = '', action = null }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 'var(--space-3)',
      marginBottom: 'var(--space-4)',
      paddingBottom: 'var(--space-3)',
      borderBottom: '1px solid var(--border-light)',
    }}>
      <div style={{ minWidth: 0 }}>
        <h2 className="section-title" style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>{title}</h2>
        {subtitle && (
          <p style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-muted)',
            marginTop: 'var(--space-1)',
            marginBottom: 0,
          }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}

// ── Divider ────────────────────────────────────────────────────────────────
export function Divider({ style = {} }) {
  return <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 0', ...style }} />
}

// ── Modal — token-styled overlay dialog (reuse Card surface) ───────────────
export function Modal({ open, onClose, title, children, footer = null, width = 440 }) {
  if (!open) return null
  return (
    <div
      role="presentation"
      onClick={() => onClose?.()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'var(--overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: width,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow)',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {title != null && title !== '' && (
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                padding: 4,
              }}
            >
              ×
            </button>
          </div>
        )}
        <div style={{ padding: '18px 20px' }}>{children}</div>
        {footer && (
          <div style={{
            padding: '12px 20px 16px',
            borderTop: '1px solid var(--border-light)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Generic Yes/No confirm dialog for destructive / irreversible actions.
 * Separate from RejectLeaveModal (which collects a required reason).
 *
 * @param {'danger'|'success'|'default'} [variant='default']
 * @param {() => void|Promise<void>} onConfirm — awaited; dialog stays open on throw
 */
export function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
  loading: loadingProp,
}) {
  const [internalBusy, setInternalBusy] = useState(false)
  const loading = Boolean(loadingProp ?? internalBusy)
  const confirmVariant =
    variant === 'danger' ? 'danger' : variant === 'success' ? 'success' : 'primary'

  const handleClose = () => {
    if (loading) return
    onCancel?.()
  }

  const handleConfirm = async () => {
    if (loading) return
    const useInternal = loadingProp === undefined
    if (useInternal) setInternalBusy(true)
    try {
      await onConfirm?.()
    } finally {
      if (useInternal) setInternalBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      width={420}
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={handleClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            size="sm"
            onClick={handleConfirm}
            disabled={loading}
            style={{ minWidth: 110, gap: 6 }}
          >
            {loading && <Loader2 size={13} className="ai-spin" aria-hidden />}
            {loading ? 'Working…' : confirmLabel}
          </Button>
        </>
      )}
    >
      {message && (
        <p style={{
          margin: 0,
          fontSize: 'var(--font-size-sm)',
          color: 'var(--text-muted)',
          lineHeight: 1.55,
        }}
        >
          {message}
        </p>
      )}
    </Modal>
  )
}

/**
 * Reject leave request — required reason modal.
 * @param {object|null} request — leave row (employee, typeLabel, start, end, days, …)
 */
export function RejectLeaveModal({ open, request, onClose, onConfirm, loading = false }) {
  const [reason, setReason] = useState('')
  const canConfirm = Boolean(reason.trim()) && !loading

  useEffect(() => {
    if (open) setReason('')
  }, [open, request?.id])

  if (!open || !request) return null

  const typeLabel = request.typeLabel || request.type || request.leave_type || 'Leave'
  const dates = request.start && request.end
    ? `${request.start} → ${request.end}`
    : (request.start_date && request.end_date
      ? `${String(request.start_date).slice(0, 10)} → ${String(request.end_date).slice(0, 10)}`
      : '—')
  const employee = request.employee || request.applicant?.name || 'Employee'
  const days = request.days ?? request.days_count

  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onClose}
      title="Reject leave request"
      footer={(
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={!canConfirm}
            onClick={() => {
              if (!canConfirm) return
              onConfirm?.(reason.trim())
            }}
          >
            {loading ? 'Rejecting…' : 'Confirm Rejection'}
          </Button>
        </>
      )}
    >
      <div style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '12px 14px',
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{employee}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {typeLabel}
          {days != null ? ` · ${days}d` : ''}
          {' · '}
          {dates}
        </div>
      </div>
      <Textarea
        label="Reason for rejection"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why this request is being declined..."
        rows={3}
        required
      />
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
        Required — the employee will see this reason in their notification.
      </div>
    </Modal>
  )
}

// ── AI Button (on-demand AI actions — accent + sparkle, no layout impact) ───
export function AiButton({
  children,
  loading = false,
  disabled = false,
  onClick,
  size = 'sm',
  style = {},
  type = 'button',
  ...props
}) {
  const busy = Boolean(loading || disabled)
  const s = BUTTON_SIZES[size] || BUTTON_SIZES.sm
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy}
      style={{
        ...s,
        background: 'var(--accent-muted)',
        color: 'var(--accent)',
        border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
        borderRadius: 'var(--radius-sm)',
        fontWeight: 600,
        cursor: busy ? 'not-allowed' : 'pointer',
        opacity: busy ? 0.55 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        transition: 'all var(--transition)',
        fontFamily: 'inherit',
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...props}
    >
      {loading ? (
        <Loader2 size={size === 'xs' ? 11 : 13} className="ai-spin" aria-hidden />
      ) : (
        <Sparkles size={size === 'xs' ? 11 : 13} aria-hidden />
      )}
      {children}
    </button>
  )
}

// Smooth reveal wrapper for AI output (mount only when there is content)
export function AiReveal({ children, style = {} }) {
  return (
    <div className="ai-reveal-in" style={style}>
      {children}
    </div>
  )
}
