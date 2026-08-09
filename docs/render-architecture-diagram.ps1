# Renders docs/architecture-diagram.png using GDI+ (built into Windows).
# No new project dependency, no network, no mermaid toolchain.
Add-Type -AssemblyName System.Drawing

$W = 1720
$H = 1030
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.Clear([System.Drawing.Color]::White)

# ---- palette ----
$cInk     = [System.Drawing.Color]::FromArgb(30, 33, 44)
$cMuted   = [System.Drawing.Color]::FromArgb(110, 118, 135)
$cLine    = [System.Drawing.Color]::FromArgb(190, 196, 210)
$cTier    = [System.Drawing.Color]::FromArgb(247, 248, 251)
$cTierEdge= [System.Drawing.Color]::FromArgb(214, 220, 232)

$m1 = [System.Drawing.Color]::FromArgb(37, 99, 235)    # blue
$m2 = [System.Drawing.Color]::FromArgb(123, 42, 99)    # brand purple
$m3 = [System.Drawing.Color]::FromArgb(13, 148, 136)   # teal
$m4 = [System.Drawing.Color]::FromArgb(217, 119, 6)    # amber
$m5 = [System.Drawing.Color]::FromArgb(22, 128, 90)    # green
$cData = [System.Drawing.Color]::FromArgb(71, 85, 105)

# ---- fonts ----
$fTitle  = New-Object System.Drawing.Font("Segoe UI Semibold", 20, [System.Drawing.FontStyle]::Bold)
$fSub    = New-Object System.Drawing.Font("Segoe UI", 10.5)
$fTier   = New-Object System.Drawing.Font("Segoe UI Semibold", 12, [System.Drawing.FontStyle]::Bold)
$fBox    = New-Object System.Drawing.Font("Segoe UI Semibold", 10.5, [System.Drawing.FontStyle]::Bold)
$fSmall  = New-Object System.Drawing.Font("Segoe UI", 9)
$fTiny   = New-Object System.Drawing.Font("Segoe UI", 8.25)
$fMono   = New-Object System.Drawing.Font("Consolas", 9)

$brInk   = New-Object System.Drawing.SolidBrush($cInk)
$brMuted = New-Object System.Drawing.SolidBrush($cMuted)
$brWhite = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

function RoundRect($x, $y, $w, $h, $r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function Panel($x, $y, $w, $h, $fill, $edge, $r) {
    $p = RoundRect $x $y $w $h $r
    $b = New-Object System.Drawing.SolidBrush($fill)
    $g.FillPath($b, $p)
    $pen = New-Object System.Drawing.Pen($edge, 1.4)
    $g.DrawPath($pen, $p)
    $p.Dispose(); $b.Dispose(); $pen.Dispose()
}

function CenterText($text, $font, $brush, $x, $y, $w) {
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF($x, $y, $w, 400)
    $g.DrawString($text, $font, $brush, $rect, $sf)
    $sf.Dispose()
}

# A component box tinted with its owning member's colour.
function Comp($x, $y, $w, $h, $title, $sub, $accent) {
    $tint = [System.Drawing.Color]::FromArgb(18, $accent.R, $accent.G, $accent.B)
    Panel $x $y $w $h $tint $accent 8
    $bar = RoundRect $x $y 5 $h 2
    $bb = New-Object System.Drawing.SolidBrush($accent)
    $g.FillPath($bb, $bar); $bar.Dispose(); $bb.Dispose()
    $brA = New-Object System.Drawing.SolidBrush($accent)
    CenterText $title $fBox $brA ($x + 6) ($y + 9) ($w - 12)
    if ($sub) { CenterText $sub $fTiny $brMuted ($x + 6) ($y + 30) ($w - 12) }
    $brA.Dispose()
}

function Arrow($x1, $y1, $x2, $y2, $label) {
    $pen = New-Object System.Drawing.Pen($cMuted, 2.2)
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::ArrowAnchor
    $g.DrawLine($pen, $x1, $y1, $x2, $y2)
    $pen.Dispose()
    if ($label) {
        $sf = New-Object System.Drawing.StringFormat
        $sf.Alignment = [System.Drawing.StringAlignment]::Center
        $g.DrawString($label, $fSmall, $brMuted, (New-Object System.Drawing.RectangleF(($x1 - 260), (($y1 + $y2) / 2 - 9), 520, 40)), $sf)
        $sf.Dispose()
    }
}

# ================= title =================
$g.DrawString("Innovare Leave Management System — Architecture", $fTitle, $brInk, 60, 28)
$g.DrawString("SCCCI AI Challenge 2B, Group 4  ·  three tiers, one Express process, five member-owned verticals  ·  verified against the running build, 9 Aug 2026", $fSub, $brMuted, 62, 62)

# ================= TIER 1 : browser =================
$t1y = 100
Panel 60 $t1y 1600 150 $cTier $cTierEdge 12
$g.DrawString("BROWSER  —  React 18 + Vite SPA  ·  port 3000", $fTier, $brInk, 82, ($t1y + 12))

$bw = 360; $bx = 82; $by = $t1y + 48
Comp $bx           $by $bw 82 "Login + 2-step verification"  "Login.jsx  ·  email / SMS / authenticator"        $m1
Comp ($bx+$bw+28)  $by $bw 82 "Employee dashboard"           "Employee.jsx  ·  apply, forecast, drafts, swaps"  $m2
Comp ($bx+2*($bw+28)) $by $bw 82 "Approver queue"            "Approver.jsx  ·  two-tier decisions"              $m3
Comp ($bx+3*($bw+28)) $by $bw 82 "HR admin console"          "Admin.jsx  ·  policies, reports, corrections"     $m5

Arrow 860 260 860 306 "HTTPS / JSON  ·  Authorization: Bearer <JWT>"

# ================= TIER 2 : API =================
$t2y = 316
Panel 60 $t2y 1600 420 $cTier $cTierEdge 12
$g.DrawString("API  —  Node.js + Express  ·  port 3001", $fTier, $brInk, 82, ($t2y + 12))

# middleware
$mwy = $t2y + 46
Panel 82 $mwy 1556 52 ([System.Drawing.Color]::FromArgb(24, 71, 85, 105)) $cData 8
CenterText "MIDDLEWARE   validateToken  ->  requireRole        (req.user is rebuilt from the LIVE database row, never trusted from the token body)" $fBox (New-Object System.Drawing.SolidBrush($cData)) 82 ($mwy + 15) 1556

# routes
$ry = $mwy + 72
$g.DrawString("ROUTE MODULES  —  12 modules, 127 endpoints", $fSmall, $brMuted, 88, ($ry - 20))
$rw = 246; $rx = 82
Comp $rx            $ry $rw 74 "/user  /invitation"   "auth, sessions, onboarding"    $m1
Comp ($rx+$rw+16)   $ry $rw 74 "/leave  /swap"        "apply, drafts, cancel, swaps"  $m2
Comp ($rx+2*($rw+16)) $ry $rw 74 "/notification"      "/delegation, decisions"         $m3
Comp ($rx+3*($rw+16)) $ry $rw 74 "/coverage  /holiday" "calendar, blackout rules"     $m4
Comp ($rx+4*($rw+16)) $ry $rw 74 "/admin  /report"    "HR, analytics, carry-forward"  $m5
Comp ($rx+5*($rw+16)) $ry $rw 74 "/ai"                "AI-1 .. AI-5, advisory only"   $cData

# services
$sy = $ry + 104
$g.DrawString("SERVICES  —  32 modules holding the business logic (pure functions wherever possible, so they unit-test without a database)", $fSmall, $brMuted, 88, ($sy - 20))
Comp $rx            $sy $rw 86 "leaveRules"       "overlap, backdating, quotas, shorten"  $m2
Comp ($rx+$rw+16)   $sy $rw 86 "calculationService" "chargeable days — SINGLE SOURCE"    $m4
Comp ($rx+2*($rw+16)) $sy $rw 86 "notificationService" "post-commit, best effort"        $m3
Comp ($rx+3*($rw+16)) $sy $rw 86 "delegationService" "canActOn — who may decide"         $m3
Comp ($rx+4*($rw+16)) $sy $rw 86 "twoFactorService" "TOTP, codes, encryption at rest"    $m1
Comp ($rx+5*($rw+16)) $sy $rw 86 "carryForward / report" "year-end, analytics"           $m5

# background jobs
$jy = $sy + 112
Panel 82 $jy 1556 56 ([System.Drawing.Color]::FromArgb(20, 217, 119, 6)) $m4 8
CenterText "BACKGROUND SWEEPS (setInterval on Singapore time — no node-cron)     24h approval reminders  ·  delegation expiry  ·  scheduled reports  ·  year-end carry-forward" $fSmall (New-Object System.Drawing.SolidBrush($cInk)) 82 ($jy + 18) 1556

Arrow 700 746 700 792 "Sequelize ORM  ·  transactions with row locks"

# ================= TIER 3 : data =================
$t3y = 802
Panel 60 $t3y 1000 118 $cTier $cTierEdge 12
Comp 82 ($t3y + 16) 956 86 "MySQL 8  —  22 tables" "users · leave_requests · leave_balances · leave_types · public_holidays · blackout_periods · audit_logs · notifications · delegations · sessions ..." $cData

# external services
Panel 1090 $t3y 570 118 $cTier $cTierEdge 12
Comp 1112 ($t3y + 16) 526 86 "EXTERNAL  (best effort, never blocking)" "SMTP / nodemailer  ·  Twilio SMS  ·  OpenRouter / OpenAI / Anthropic" ([System.Drawing.Color]::FromArgb(120, 113, 108))
$penD = New-Object System.Drawing.Pen($cLine, 2)
$penD.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
$penD.EndCap = [System.Drawing.Drawing2D.LineCap]::ArrowAnchor
$g.DrawLine($penD, 1300, 746, 1300, 792)
$penD.Dispose()

# ================= legend =================
$ly = 946
$g.DrawString("VERTICAL OWNERSHIP", $fSmall, $brMuted, 62, ($ly - 4))
$lx = 232
$members = @(
    @("M1  Auth & accounts", $m1),
    @("M2  Employee leave experience (Jervis)", $m2),
    @("M3  Approval & notification", $m3),
    @("M4  Coverage & calendar", $m4),
    @("M5  HR admin & analytics", $m5)
)
foreach ($m in $members) {
    $sw = New-Object System.Drawing.SolidBrush($m[1])
    $g.FillRectangle($sw, $lx, ($ly - 1), 13, 13)
    $g.DrawString($m[0], $fSmall, $brInk, ($lx + 19), ($ly - 4))
    $adv = [int]$g.MeasureString($m[0], $fSmall).Width
    $lx += $adv + 46
    $sw.Dispose()
}

$g.DrawString("Rendered by docs/render-architecture-diagram.ps1  —  re-run it after changing the architecture.", $fTiny, $brMuted, 62, 986)

$out = Join-Path $PSScriptRoot "architecture-diagram.png"   # writes next to this script, i.e. docs/
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "wrote $out"
