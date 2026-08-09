import { useState } from "react";

/**
 * Innovare brand lockup.
 *
 * Drop the official logo in `client/public/` as `innovare-logo.png` (or .svg /
 * .webp / .jpg) and it is picked up on the next refresh — no code change needed.
 * Each candidate is tried in turn; if none exist the component falls back to a
 * typographic wordmark in the corporate typeface and colours, so the header and
 * login card never show a broken image.
 *
 * The logo is purple artwork on a transparent/white ground, so it needs a light
 * surface. Use `plate` on the purple chrome to give it a white panel with proper
 * clear space.
 */
const CANDIDATES = [
  "/innovare.png",
  "/innovare.svg",
  "/innovare-logo.png",
  "/innovare-logo.svg",
  "/innovare-logo.webp",
  "/logo.png",
];

export default function BrandLogo({
  className = "",
  height = 36,
  plate = false,
  showTagline = false,
}) {
  // Index into CANDIDATES; past the end means "no asset found, use the wordmark".
  const [attempt, setAttempt] = useState(0);
  const missing = attempt >= CANDIDATES.length;

  const mark = missing ? (
    <span className="inline-flex flex-col justify-center leading-none">
      <span
        className="font-semibold tracking-tight text-brand-700"
        style={{ fontSize: height * 0.62 }}
      >
        innovare
      </span>
      {showTagline && (
        <span
          className="text-brand-500 tracking-wide"
          style={{ fontSize: Math.max(9, height * 0.2) }}
        >
          it&apos;s about people
        </span>
      )}
    </span>
  ) : (
    <img
      key={CANDIDATES[attempt]}
      src={CANDIDATES[attempt]}
      alt="Innovare"
      style={{ height }}
      className="w-auto block"
      onError={() => setAttempt((i) => i + 1)}
    />
  );

  if (!plate) return <span className={className}>{mark}</span>;

  // No shadow and no border: the logo art has an opaque white background, so the
  // plate must read as one continuous white shape. A drop shadow here shows up
  // as a dark halo against the purple chrome.
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-white px-2.5 py-1.5 ${className}`}
    >
      {mark}
    </span>
  );
}
