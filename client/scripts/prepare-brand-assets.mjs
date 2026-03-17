import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const brandDir = path.resolve(__dirname, '..', 'public', 'brand');
const sourcePath = path.join(brandDir, 'logo-source.png');
const fullLightPath = path.join(brandDir, 'logo-full-light.png');
const symbolLightPath = path.join(brandDir, 'logo-symbol-light.png');
const fullDarkPath = path.join(brandDir, 'logo-full-dark.png');
const symbolDarkPath = path.join(brandDir, 'logo-symbol-dark.png');

function assertSourceExists() {
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source logo not found: ${sourcePath}`);
    }
}

function createBlank(width, height) {
    return new PNG({ width, height });
}

function clonePng(png) {
    const out = createBlank(png.width, png.height);
    png.data.copy(out.data);
    return out;
}

function getPixel(png, x, y) {
    const idx = (png.width * y + x) * 4;
    return {
        r: png.data[idx],
        g: png.data[idx + 1],
        b: png.data[idx + 2],
        a: png.data[idx + 3]
    };
}

function setPixel(png, x, y, r, g, b, a) {
    const idx = (png.width * y + x) * 4;
    png.data[idx] = r;
    png.data[idx + 1] = g;
    png.data[idx + 2] = b;
    png.data[idx + 3] = a;
}

function getBorderMeanColor(png, band = 6) {
    let rs = 0;
    let gs = 0;
    let bs = 0;
    let count = 0;

    for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
            const onBorder = x < band || y < band || x >= png.width - band || y >= png.height - band;
            if (!onBorder) continue;
            const { r, g, b, a } = getPixel(png, x, y);
            if (a === 0) continue;
            rs += r;
            gs += g;
            bs += b;
            count += 1;
        }
    }

    if (count === 0) return { r: 245, g: 245, b: 245 };
    return {
        r: rs / count,
        g: gs / count,
        b: bs / count
    };
}

function colorDistance(a, b) {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

function removeWhiteBackground(png) {
    const out = clonePng(png);
    const total = out.width * out.height;
    const candidate = new Uint8Array(total);
    const visited = new Uint8Array(total);
    const queue = new Uint32Array(total);
    const borderMean = getBorderMeanColor(out, 8);
    const baseThreshold = 58;
    const softThreshold = 86;

    const toIndex = (x, y) => y * out.width + x;
    const isCandidate = (r, g, b) => {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const brightness = (r + g + b) / 3;
        const saturation = max === 0 ? 0 : (max - min) / max;
        const dist = colorDistance({ r, g, b }, borderMean);
        if (dist <= baseThreshold) return true;
        return brightness > 200 && saturation < 0.35 && dist <= softThreshold;
    };

    for (let y = 0; y < out.height; y += 1) {
        for (let x = 0; x < out.width; x += 1) {
            const { r, g, b, a } = getPixel(out, x, y);
            if (a === 0) continue;
            const idx = toIndex(x, y);
            candidate[idx] = isCandidate(r, g, b) ? 1 : 0;
        }
    }

    let qStart = 0;
    let qEnd = 0;
    const enqueue = (x, y) => {
        if (x < 0 || y < 0 || x >= out.width || y >= out.height) return;
        const idx = toIndex(x, y);
        if (visited[idx] || !candidate[idx]) return;
        visited[idx] = 1;
        queue[qEnd] = idx;
        qEnd += 1;
    };

    for (let x = 0; x < out.width; x += 1) {
        enqueue(x, 0);
        enqueue(x, out.height - 1);
    }
    for (let y = 1; y < out.height - 1; y += 1) {
        enqueue(0, y);
        enqueue(out.width - 1, y);
    }

    while (qStart < qEnd) {
        const idx = queue[qStart];
        qStart += 1;
        const x = idx % out.width;
        const y = Math.floor(idx / out.width);
        enqueue(x + 1, y);
        enqueue(x - 1, y);
        enqueue(x, y + 1);
        enqueue(x, y - 1);
    }

    for (let y = 0; y < out.height; y += 1) {
        for (let x = 0; x < out.width; x += 1) {
            const floodIdx = toIndex(x, y);
            if (!visited[floodIdx]) continue;

            const { r, g, b, a } = getPixel(out, x, y);
            if (a === 0) continue;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const brightness = (r + g + b) / 3;
            const saturation = max === 0 ? 0 : (max - min) / max;
            const dist = colorDistance({ r, g, b }, borderMean);
            const nearWhite = brightness > 198 && saturation < 0.35 && dist <= softThreshold;

            if (nearWhite) {
                let alphaMultiplier = 1;
                if (dist <= baseThreshold * 0.85) {
                    alphaMultiplier = 0;
                } else {
                    const t = Math.min(1, Math.max(0, (dist - baseThreshold * 0.85) / (softThreshold - baseThreshold * 0.85)));
                    alphaMultiplier = 0.28 * t;
                }
                setPixel(out, x, y, r, g, b, Math.round(a * alphaMultiplier));
            }
        }
    }

    // Minor fringe cleanup around removed background for smoother edges.
    for (let y = 1; y < out.height - 1; y += 1) {
        for (let x = 1; x < out.width - 1; x += 1) {
            const idx = toIndex(x, y);
            if (visited[idx]) continue;
            const { r, g, b, a } = getPixel(out, x, y);
            if (a === 0) continue;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const brightness = (r + g + b) / 3;
            const saturation = max === 0 ? 0 : (max - min) / max;
            if (brightness < 210 || saturation > 0.3) continue;

            let hasRemovedNeighbor = false;
            const neighbors = [
                toIndex(x + 1, y),
                toIndex(x - 1, y),
                toIndex(x, y + 1),
                toIndex(x, y - 1)
            ];
            for (const n of neighbors) {
                if (visited[n]) {
                    hasRemovedNeighbor = true;
                    break;
                }
            }
            if (hasRemovedNeighbor) {
                setPixel(out, x, y, r, g, b, Math.round(a * 0.65));
            }
        }
    }

    // Remove very low-alpha dust to avoid oversized crops.
    for (let y = 0; y < out.height; y += 1) {
        for (let x = 0; x < out.width; x += 1) {
            const idx = (out.width * y + x) * 4;
            if (out.data[idx + 3] < 28) {
                out.data[idx + 3] = 0;
            }
        }
    }

    return out;
}

function cropToAlpha(png, padding = 8, minAlpha = 24) {
    let minX = png.width;
    let minY = png.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
            const idx = (png.width * y + x) * 4;
            if (png.data[idx + 3] > minAlpha) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX < minX || maxY < minY) {
        throw new Error('No visible logo pixels detected after background cleanup.');
    }

    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(png.width - 1, maxX + padding);
    maxY = Math.min(png.height - 1, maxY + padding);

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const out = createBlank(width, height);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const srcX = minX + x;
            const srcY = minY + y;
            const srcIdx = (png.width * srcY + srcX) * 4;
            const dstIdx = (width * y + x) * 4;
            out.data[dstIdx] = png.data[srcIdx];
            out.data[dstIdx + 1] = png.data[srcIdx + 1];
            out.data[dstIdx + 2] = png.data[srcIdx + 2];
            out.data[dstIdx + 3] = png.data[srcIdx + 3];
        }
    }

    return out;
}

function extractSymbolFromFull(fullPng) {
    const alphaThreshold = 26;
    const maxSeedX = Math.floor(fullPng.width * 0.35);
    const total = fullPng.width * fullPng.height;
    const visited = new Uint8Array(total);
    const queue = new Uint32Array(total);

    const toPos = (x, y) => y * fullPng.width + x;
    const toX = (pos) => pos % fullPng.width;
    const toY = (pos) => Math.floor(pos / fullPng.width);
    const isVisible = (x, y) => {
        const idx = (fullPng.width * y + x) * 4;
        return fullPng.data[idx + 3] > alphaThreshold;
    };

    let seed = -1;
    for (let y = 0; y < fullPng.height && seed === -1; y += 1) {
        for (let x = 0; x <= maxSeedX; x += 1) {
            if (isVisible(x, y)) {
                seed = toPos(x, y);
                break;
            }
        }
    }

    if (seed === -1) {
        throw new Error('Unable to detect symbol seed in full logo.');
    }

    let qStart = 0;
    let qEnd = 0;
    visited[seed] = 1;
    queue[qEnd] = seed;
    qEnd += 1;

    let minX = fullPng.width;
    let minY = fullPng.height;
    let maxX = -1;
    let maxY = -1;

    const enqueue = (x, y) => {
        if (x < 0 || y < 0 || x >= fullPng.width || y >= fullPng.height) return;
        if (!isVisible(x, y)) return;
        const pos = toPos(x, y);
        if (visited[pos]) return;
        visited[pos] = 1;
        queue[qEnd] = pos;
        qEnd += 1;
    };

    while (qStart < qEnd) {
        const pos = queue[qStart];
        qStart += 1;
        const x = toX(pos);
        const y = toY(pos);

        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;

        enqueue(x + 1, y);
        enqueue(x - 1, y);
        enqueue(x, y + 1);
        enqueue(x, y - 1);
    }

    if (maxX < minX || maxY < minY) {
        throw new Error('Unable to extract symbol bounds from full logo.');
    }

    const pad = 10;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(fullPng.width - 1, maxX + pad);
    maxY = Math.min(fullPng.height - 1, maxY + pad);

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const symbol = createBlank(width, height);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const srcIdx = (fullPng.width * (minY + y) + (minX + x)) * 4;
            const dstIdx = (width * y + x) * 4;
            symbol.data[dstIdx] = fullPng.data[srcIdx];
            symbol.data[dstIdx + 1] = fullPng.data[srcIdx + 1];
            symbol.data[dstIdx + 2] = fullPng.data[srcIdx + 2];
            symbol.data[dstIdx + 3] = fullPng.data[srcIdx + 3];
        }
    }

    return cropToAlpha(symbol, 10, alphaThreshold);
}

function padToSquare(png, margin = 20) {
    const side = Math.max(png.width, png.height) + margin * 2;
    const out = createBlank(side, side);
    const offsetX = Math.floor((side - png.width) / 2);
    const offsetY = Math.floor((side - png.height) / 2);

    for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
            const srcIdx = (png.width * y + x) * 4;
            const dstX = offsetX + x;
            const dstY = offsetY + y;
            const dstIdx = (out.width * dstY + dstX) * 4;
            out.data[dstIdx] = png.data[srcIdx];
            out.data[dstIdx + 1] = png.data[srcIdx + 1];
            out.data[dstIdx + 2] = png.data[srcIdx + 2];
            out.data[dstIdx + 3] = png.data[srcIdx + 3];
        }
    }

    return out;
}

function resizeNearest(png, targetWidth, targetHeight) {
    if (png.width === targetWidth && png.height === targetHeight) return png;
    const out = createBlank(targetWidth, targetHeight);
    const xRatio = png.width / targetWidth;
    const yRatio = png.height / targetHeight;

    for (let y = 0; y < targetHeight; y += 1) {
        const srcY = Math.min(png.height - 1, Math.floor(y * yRatio));
        for (let x = 0; x < targetWidth; x += 1) {
            const srcX = Math.min(png.width - 1, Math.floor(x * xRatio));
            const srcIdx = (png.width * srcY + srcX) * 4;
            const dstIdx = (targetWidth * y + x) * 4;
            out.data[dstIdx] = png.data[srcIdx];
            out.data[dstIdx + 1] = png.data[srcIdx + 1];
            out.data[dstIdx + 2] = png.data[srcIdx + 2];
            out.data[dstIdx + 3] = png.data[srcIdx + 3];
        }
    }

    return out;
}

function nonTransparentRatio(png, minAlpha = 16) {
    let visible = 0;
    const total = png.width * png.height;
    for (let i = 0; i < total; i += 1) {
        if (png.data[i * 4 + 3] > minAlpha) visible += 1;
    }
    return visible / total;
}

function ensureQuality(fullPng, symbolPng) {
    const fullRatio = nonTransparentRatio(fullPng);
    const symbolRatio = nonTransparentRatio(symbolPng);

    if (fullPng.width < 500 || fullPng.height < 180) {
        throw new Error('Generated full logo is too small. Please provide original transparent PNG/SVG.');
    }
    if (fullRatio < 0.08 || fullRatio > 0.7) {
        throw new Error('Background cleanup quality is not acceptable for full logo. Please provide original transparent PNG/SVG.');
    }
    if (symbolRatio < 0.02 || symbolRatio > 0.9) {
        throw new Error('Background cleanup quality is not acceptable for symbol logo. Please provide original transparent PNG/SVG.');
    }

    console.log(`quality ratios -> full:${fullRatio.toFixed(4)} symbol:${symbolRatio.toFixed(4)}`);
}

function recolorForDarkTheme(png) {
    const out = clonePng(png);
    for (let y = 0; y < out.height; y += 1) {
        for (let x = 0; x < out.width; x += 1) {
            const idx = (out.width * y + x) * 4;
            const r = out.data[idx];
            const g = out.data[idx + 1];
            const b = out.data[idx + 2];
            const a = out.data[idx + 3];
            if (a === 0) continue;

            const isOrange = r > 150 && g > 50 && g < 220 && b < 140 && r > g && g > b;
            if (isOrange) {
                out.data[idx] = Math.min(255, Math.round(r * 1.04));
                out.data[idx + 1] = Math.min(255, Math.round(g * 1.05));
                out.data[idx + 2] = Math.min(255, Math.round(b * 1.02));
            } else {
                out.data[idx] = 255;
                out.data[idx + 1] = 255;
                out.data[idx + 2] = 255;
            }
        }
    }
    return out;
}

function writePng(filePath, png) {
    fs.writeFileSync(filePath, PNG.sync.write(png));
}

function main() {
    assertSourceExists();
    const raw = PNG.sync.read(fs.readFileSync(sourcePath));
    const cleaned = removeWhiteBackground(raw);
    let full = cropToAlpha(cleaned, 8, 30);
    let symbol = extractSymbolFromFull(full);

    if (full.width > 1400) {
        const targetHeight = Math.round((1400 / full.width) * full.height);
        full = resizeNearest(full, 1400, targetHeight);
    }

    symbol = padToSquare(symbol, 24);
    symbol = resizeNearest(symbol, 640, 640);

    ensureQuality(full, symbol);

    const fullDark = recolorForDarkTheme(full);
    const symbolDark = recolorForDarkTheme(symbol);

    writePng(fullLightPath, full);
    writePng(symbolLightPath, symbol);
    writePng(fullDarkPath, fullDark);
    writePng(symbolDarkPath, symbolDark);

    console.log('Brand assets generated successfully.');
    console.log(`full light:   ${full.width}x${full.height} -> ${fullLightPath}`);
    console.log(`symbol light: ${symbol.width}x${symbol.height} -> ${symbolLightPath}`);
    console.log(`full dark:    ${fullDark.width}x${fullDark.height} -> ${fullDarkPath}`);
    console.log(`symbol dark:  ${symbolDark.width}x${symbolDark.height} -> ${symbolDarkPath}`);
}

try {
    main();
} catch (err) {
    console.error(err.message || err);
    process.exit(1);
}
