const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function generateIcon(size, outputPath) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, size, size);

    // Document page
    const margin = size * 0.2;
    const pageW = size * 0.5;
    const pageH = size * 0.6;
    const x = (size - pageW) / 2;
    const y = (size - pageH) / 2;
    const fold = size * 0.12;

    // Page shadow/glow
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = size * 0.08;

    // Page path with folded corner
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + pageW - fold, y);
    ctx.lineTo(x + pageW, y + fold);
    ctx.lineTo(x + pageW, y + pageH);
    ctx.lineTo(x, y + pageH);
    ctx.closePath();

    // Fill page with warm gradient
    const grad = ctx.createLinearGradient(x, y, x + pageW, y + pageH);
    grad.addColorStop(0, '#fff8e7');
    grad.addColorStop(1, '#ffd700');
    ctx.fillStyle = grad;
    ctx.fill();

    // Fold triangle
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(x + pageW - fold, y);
    ctx.lineTo(x + pageW - fold, y + fold);
    ctx.lineTo(x + pageW, y + fold);
    ctx.closePath();
    ctx.fillStyle = '#e6c200';
    ctx.fill();

    // Light rays from fold
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 5; i++) {
        const angle = (Math.PI / 4) + (i * Math.PI / 12);
        const rayLen = size * 0.35;
        const startX = x + pageW - fold / 2;
        const startY = y + fold / 2;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX - Math.cos(angle) * rayLen, startY + Math.sin(angle) * rayLen);
        ctx.lineWidth = size * 0.02;
        ctx.strokeStyle = '#ffd700';
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Save
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    console.log(`Generated: ${outputPath} (${size}x${size})`);
}

const publicDir = path.join(__dirname, '..', 'public');
generateIcon(192, path.join(publicDir, 'icon-192.png'));
generateIcon(512, path.join(publicDir, 'icon-512.png'));
