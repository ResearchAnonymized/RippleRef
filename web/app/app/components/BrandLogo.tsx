'use client';

import React, { useId, useState, useEffect } from 'react';

type BrandLogoProps = {
  size?: number;
  className?: string;
  title?: string;
};

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || 'REFINE';
const ENV_LOGO = (process.env.NEXT_PUBLIC_BRAND_LOGO || '').trim();

/** Visible default mark — avoids `next/image` + data-URI quirks (often reads as an empty black tile). */
function DefaultBrandMark({
  size,
  letter,
  alt,
  className,
}: {
  size: number;
  letter: string;
  alt: string;
  className?: string;
}) {
  const raw = useId().replace(/:/g, '');
  const gid = `brand-grad-${raw}`;

  return (
    <svg
      role="img"
      aria-label={alt}
      width={size}
      height={size}
      viewBox="0 0 128 128"
      className={['shrink-0 rounded-xl shadow-inner ring-1 ring-white/15', className].filter(Boolean).join(' ')}
    >
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="45%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="22" fill={`url(#${gid})`} />
      <rect x="4" y="4" width="120" height="120" rx="18" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
      <text
        x="64"
        y="72"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="58"
        fontWeight="800"
        fill="white"
        letterSpacing="-2"
      >
        {letter}
      </text>
    </svg>
  );
}

export default function BrandLogo({ size = 48, className, title }: BrandLogoProps) {
  const alt = title || BRAND_NAME;
  const letter = BRAND_NAME.slice(0, 1).toUpperCase();

  const [fileSrc, setFileSrc] = useState<string | null>(() => (ENV_LOGO ? ENV_LOGO : null));
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (ENV_LOGO) return;
    const img = new window.Image();
    img.onload = () => setFileSrc('/logo.png');
    img.onerror = () => setFileSrc(null);
    img.src = '/logo.png';
  }, []);

  useEffect(() => {
    setImgFailed(false);
  }, [fileSrc]);

  const showFile = fileSrc && !imgFailed;

  return (
    <div className={className} style={{ lineHeight: 0 }}>
      {showFile ? (
        <img
          src={fileSrc}
          alt={alt}
          width={size}
          height={size}
          loading="eager"
          decoding="async"
          onError={() => setImgFailed(true)}
          className="rounded-xl object-contain shadow-sm ring-1 ring-white/10"
        />
      ) : (
        <DefaultBrandMark size={size} letter={letter} alt={alt} />
      )}
    </div>
  );
}

export const BrandName = BRAND_NAME;
