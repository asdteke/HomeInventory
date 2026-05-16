import QRCode from 'qrcode';

const QR_DARK_COLOR = '#1c2920';
const QR_LIGHT_COLOR = '#ffffff';
const QR_MARGIN = 5;
const LOGO_RESERVE_SIZE = 11.4;
const LOGO_RESERVE_RADIUS = 2.3;
const LOGO_BADGE_SIZE = 9.6;
const LOGO_BADGE_RADIUS = 2.15;
const LOGO_IMAGE_SIZE = 6.8;

function rectToSvg(x, y, width, height, radius, fill, extra = '') {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
}

function isFinderCell(row, col, size) {
    return (
        (row < 7 && col < 7) ||
        (row < 7 && col >= size - 7) ||
        (row >= size - 7 && col < 7)
    );
}

function isPointInsideRoundedSquare(px, py, centerX, centerY, side, radius) {
    const dx = Math.abs(px - centerX) - (side / 2) + radius;
    const dy = Math.abs(py - centerY) - (side / 2) + radius;
    const outsideX = Math.max(dx, 0);
    const outsideY = Math.max(dy, 0);
    const signedDistance = Math.min(Math.max(dx, dy), 0) + Math.hypot(outsideX, outsideY) - radius;

    return signedDistance <= 0;
}

function isInsideLogoZone(row, col, size, margin) {
    const center = margin + (size / 2);
    const cellCenterX = col + margin + 0.5;
    const cellCenterY = row + margin + 0.5;

    return isPointInsideRoundedSquare(
        cellCenterX,
        cellCenterY,
        center,
        center,
        LOGO_RESERVE_SIZE,
        LOGO_RESERVE_RADIUS
    );
}

function renderFinderPattern(x, y) {
    return [
        rectToSvg(x, y, 7, 7, 1.75, QR_DARK_COLOR),
        rectToSvg(x + 1, y + 1, 5, 5, 1.2, QR_LIGHT_COLOR),
        rectToSvg(x + 2, y + 2, 3, 3, 0.9, QR_DARK_COLOR)
    ].join('');
}

function renderStyledQrSvg(qrData, { width, logoDataUrl }) {
    const size = qrData.modules.size;
    const margin = QR_MARGIN;
    const totalSize = size + (margin * 2);
    const moduleRects = [];
    const hasLogo = Boolean(logoDataUrl);

    for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
            if (!qrData.modules.get(row, col)) {
                continue;
            }

            if (isFinderCell(row, col, size)) {
                continue;
            }

            if (hasLogo && isInsideLogoZone(row, col, size, margin)) {
                continue;
            }

            moduleRects.push(rectToSvg(col + margin, row + margin, 1, 1, 0.32, QR_DARK_COLOR));
        }
    }

    const finderPatterns = [
        renderFinderPattern(margin, margin),
        renderFinderPattern(margin + size - 7, margin),
        renderFinderPattern(margin, margin + size - 7)
    ].join('');

    const center = totalSize / 2;
    const logoBadge = hasLogo
        ? [
            rectToSvg(
                center - (LOGO_BADGE_SIZE / 2),
                center - (LOGO_BADGE_SIZE / 2),
                LOGO_BADGE_SIZE,
                LOGO_BADGE_SIZE,
                LOGO_BADGE_RADIUS,
                QR_LIGHT_COLOR,
                'stroke="#d7dfd8" stroke-width="0.18"'
            ),
            `<image href="${logoDataUrl}" x="${center - (LOGO_IMAGE_SIZE / 2)}" y="${center - (LOGO_IMAGE_SIZE / 2)}" width="${LOGO_IMAGE_SIZE}" height="${LOGO_IMAGE_SIZE}" preserveAspectRatio="xMidYMid meet" opacity="0.99"/>`
        ].join('')
        : '';

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${totalSize} ${totalSize}" role="img" aria-hidden="true">`,
        rectToSvg(0, 0, totalSize, totalSize, 3.6, QR_LIGHT_COLOR),
        moduleRects.join(''),
        finderPatterns,
        logoBadge,
        '</svg>'
    ].join('');
}

export function generateItemQrMarkup(itemUrl, { width, logoDataUrl }) {
    const qrData = QRCode.create(itemUrl, {
        errorCorrectionLevel: 'H'
    });

    return renderStyledQrSvg(qrData, {
        width,
        logoDataUrl
    });
}
