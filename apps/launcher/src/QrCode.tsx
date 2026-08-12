/**
 * QR Code component for the launcher — adapted from the project's ItemQRCode
 * design: SVG-based, rounded dots, logo badge in center, high error correction.
 */
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useLauncherI18n } from './i18n';

/* ── Design tokens copied from client/src/utils/itemQrRuntime.js ── */
const QR_DARK   = '#1c2920';
const QR_LIGHT  = '#ffffff';
const QR_FRAME  = '#d8e2dc';
const QR_MARGIN = 5;
const LOGO_RESERVE = 11.4;
const LOGO_RESERVE_R = 2.3;
const LOGO_BADGE = 9.6;
const LOGO_BADGE_R = 2.15;
const LOGO_IMG = 6.8;

/* ── Helpers ── */
function rect(x: number, y: number, w: number, h: number, r: number, fill: string, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
}

function isFinder(row: number, col: number, size: number) {
  return (
    (row < 7 && col < 7) ||
    (row < 7 && col >= size - 7) ||
    (row >= size - 7 && col < 7)
  );
}

function inLogoZone(row: number, col: number, size: number, margin: number) {
  const center = margin + size / 2;
  const cx = col + margin + 0.5;
  const cy = row + margin + 0.5;
  const dx = Math.abs(cx - center) - LOGO_RESERVE / 2 + LOGO_RESERVE_R;
  const dy = Math.abs(cy - center) - LOGO_RESERVE / 2 + LOGO_RESERVE_R;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - LOGO_RESERVE_R <= 0;
}

function finderPattern(x: number, y: number) {
  return [
    rect(x, y, 7, 7, 1.75, QR_DARK),
    rect(x + 1, y + 1, 5, 5, 1.2, QR_LIGHT),
    rect(x + 2, y + 2, 3, 3, 0.9, QR_DARK),
  ].join('');
}

function buildSvg(url: string, width: number, logoDataUrl: string, ariaLabel: string) {
  const qrData = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const size = qrData.modules.size;
  const total = size + QR_MARGIN * 2;
  const hasLogo = Boolean(logoDataUrl);
  const dots: string[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!qrData.modules.get(r, c)) continue;
      if (isFinder(r, c, size)) continue;
      if (hasLogo && inLogoZone(r, c, size, QR_MARGIN)) continue;
      dots.push(rect(c + QR_MARGIN, r + QR_MARGIN, 1, 1, 0.32, QR_DARK));
    }
  }

  const finders = [
    finderPattern(QR_MARGIN, QR_MARGIN),
    finderPattern(QR_MARGIN + size - 7, QR_MARGIN),
    finderPattern(QR_MARGIN, QR_MARGIN + size - 7),
  ].join('');

  const mid = total / 2;
  const badge = hasLogo
    ? [
        rect(mid - LOGO_BADGE / 2, mid - LOGO_BADGE / 2, LOGO_BADGE, LOGO_BADGE, LOGO_BADGE_R, QR_LIGHT, `stroke="${QR_FRAME}" stroke-width="0.34"`),
        `<image href="${logoDataUrl}" x="${mid - LOGO_IMG / 2}" y="${mid - LOGO_IMG / 2}" width="${LOGO_IMG}" height="${LOGO_IMG}" preserveAspectRatio="xMidYMid meet" opacity="0.99"/>`,
      ].join('')
    : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${total} ${total}" role="img" aria-label="${ariaLabel}">`,
    rect(0, 0, total, total, 3.6, QR_LIGHT),
    dots.join(''),
    finders,
    badge,
    '</svg>',
  ].join('');
}

/* ── Load logo SVG as data URL ── */
async function loadLogoDataUrl(src: string): Promise<string> {
  try {
    if (src.startsWith('data:')) {
      return src;
    }

    const res = await fetch(src);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ── Component ── */
interface Props {
  url: string;
  size?: number;
  logoSrc?: string;
  logoSvg?: string;
}

export function QrCodeCard({ url, size = 200, logoSrc, logoSvg }: Props) {
  const { t } = useLauncherI18n();
  const [markup, setMarkup] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const dataUrl = logoSvg ? svgToDataUrl(logoSvg) : logoSrc ? await loadLogoDataUrl(logoSrc) : '';
      if (cancelled) return;
      const svg = buildSvg(url, size, dataUrl, t('qr.code'));
      if (!cancelled) setMarkup(svg);
    })();

    return () => { cancelled = true; };
  }, [url, size, logoSrc, logoSvg, t]);

  if (!markup) return null;

  return (
    <div className="qr-card">
      <div className="qr-frame">
        <div
          className="qr-svg-wrap"
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      </div>
      <div className="qr-meta">
        <span className="qr-label">{t('qr.scan')}</span>
        <code className="qr-url">{url}</code>
      </div>
    </div>
  );
}
