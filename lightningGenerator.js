'use strict';

// ============ КОНФИГ ============
const CONFIG = {
  styles: [
    // Zigzag с ветками
    { weight: 0.35, lineWidth: [5, 10],   glowMul: 3.5, brightness: [1.0, 1.5], jaggedness: [0.6, 1.4], subdiv: 5, branches: true,  smooth: 'zigzag' },
    // Плавная молния
    { weight: 0.25, lineWidth: [4, 8],    glowMul: 2.8, brightness: [0.8, 1.3], jaggedness: [0.3, 0.7], subdiv: 6, branches: false, smooth: 'smooth' },
    // Мощная разветвлённая
    { weight: 0.25, lineWidth: [6, 12],   glowMul: 4.0, brightness: [1.3, 2.3], jaggedness: [0.5, 1.2], subdiv: 5, branches: true,  smooth: 'zigzag' },
    // Бисерная (beaded)
    { weight: 0.15, lineWidth: [3, 6],    glowMul: 5.0, brightness: [0.6, 1.4], jaggedness: [0.8, 1.8], subdiv: 0, branches: false, smooth: 'beaded' },
  ],
  palette: {
    core:  { r: 255, g: 255, b: 255 },   // белое горячее ядро
    inner: { r: 200, g: 230, b: 255 },   // голубоватый ореол
    outer: { r: 130, g: 150, b: 255 },   // фиолетовое свечение
    spark: { r: 255, g: 245, b: 220 },   // искры в узлах
  },
};

// ============ ТОЧКА ВХОДА ============
onmessage = (event) => {
  const { width, height, seed } = event.data;
  const rng = seed !== undefined ? mulberry32(seed) : Math.random;
  const result = generateLightningBolt(width, height, rng);
  // ImageBitmap передаётся между воркерами быстрее, чем ImageData
  createImageBitmap(result).then((bmp) => postMessage(bmp, [bmp]));
};

// ============ ГЛАВНЫЙ ГЕНЕРАТОР ============
function generateLightningBolt(width, height, rng) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: false });
  ctx.clearRect(0, 0, width, height);

  const style = pickStyle(CONFIG.styles, rng);
  const lineWidth = lerp(style.lineWidth[0], style.lineWidth[1], rng());
  const glowWidth = lineWidth * style.glowMul;
  const brightness = lerp(style.brightness[0], style.brightness[1], rng());
  const jaggedness = lerp(style.jaggedness[0], style.jaggedness[1], rng());

  // Основной путь
  const trunk = generateBoltPath(width, height, style.smooth, jaggedness, style.subdiv, rng);

  // Рисуем слои свечения (от широкого тусклого к узкому яркому)
  drawGlowPass(ctx, trunk, glowWidth * 1.2, brightness * 0.12, 'outer');
  drawGlowPass(ctx, trunk, glowWidth * 0.6,  brightness * 0.35, 'inner');
  drawCorePass(ctx, trunk, lineWidth,        brightness * 1.0,  'inner');
  drawCorePass(ctx, trunk, lineWidth * 0.35, brightness * 1.6,  'core');

  // Ветки
  if (style.branches) {
    const branchProb = 0.03 + rng() * 0.05;
    for (let i = 3; i < trunk.length - 2; i++) {
      const depthFactor = 1.0 - (trunk[i].y / height) * 0.7;
      if (rng() < branchProb * depthFactor) {
        const baseAngle = Math.atan2(
          trunk[i + 1].y - trunk[i - 1].y,
          trunk[i + 1].x - trunk[i - 1].x
        );
        const bAngle = baseAngle + (rng() - 0.5) * 2.0;
        const branchLen = 25 + rng() * 80;
        drawBranch(ctx, trunk[i].x, trunk[i].y, bAngle, branchLen,
                   lineWidth * 0.3, glowWidth * 0.35, brightness * 0.6, 0, 3, rng, width, height);
      }
    }
  }

  // Искры в узлах для beaded
  if (style.smooth === 'beaded') {
    drawBeadedPass(ctx, trunk, lineWidth, brightness, rng);
  }

  return canvas;
}

// ============ ВЫБОР СТИЛЯ ============
function pickStyle(styles, rng) {
  let r = rng();
  for (const s of styles) {
    if (r < s.weight) return s;
    r -= s.weight;
  }
  return styles[styles.length - 1];
}

// ============ ГЕНЕРАЦИЯ ПУТИ ============
function generateBoltPath(width, height, smoothType, jaggedness, subdiv, rng) {
  const startX = width * (0.3 + rng() * 0.4);
  const coarse = [];
  let angle = (rng() - 0.5) * (smoothType === 'smooth' ? 0.3 : 0.6);
  let x = startX, y = 0;
  coarse.push({ x, y });

  const targetY = height * (smoothType === 'smooth' ? 0.94 : 0.9);
  const step = smoothType === 'smooth' ? (4 + rng() * 3) : (3 + rng() * 5);
  const damping = smoothType === 'smooth' ? 0.8 : 1.0;

  while (y < targetY) {
    angle += (rng() - 0.5) * jaggedness * 2.0;
    angle *= damping;
    const maxAng = smoothType === 'smooth' ? 0.8 : 1.4;
    angle = clamp(angle, -maxAng, maxAng);
    x += Math.sin(angle) * step;
    y += Math.cos(angle) * step * (smoothType === 'smooth' ? 1.0 : (0.8 + rng() * 0.4));
    coarse.push({ x, y });
  }

  // Фрактальное уточнение (midpoint displacement) для более "природной" формы
  if (subdiv > 0) {
    return subdividePath(coarse, subdiv, jaggedness * (width * 0.04), rng);
  }
  return coarse;
}

// Midpoint displacement: рекурсивно вставляем средние точки со смещением
function subdividePath(points, iterations, displacement, rng) {
  let current = points;
  for (let iter = 0; iter < iterations; iter++) {
    const next = [current[0]];
    const disp = displacement / Math.pow(1.7, iter); // затухание
    for (let i = 0; i < current.length - 1; i++) {
      const a = current[i], b = current[i + 1];
      const mx = (a.x + b.x) * 0.5 + (rng() - 0.5) * disp;
      const my = (a.y + b.y) * 0.5 + (rng() - 0.5) * disp * 0.35; // вертикально меньше
      next.push({ x: mx, y: my }, b);
    }
    current = next;
  }
  return current;
}

// ============ РИСОВАНИЕ ============
function tracePath(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
}

function drawGlowPass(ctx, points, width, intensity, colorKey) {
  if (points.length < 2) return;
  tracePath(ctx, points);
  ctx.lineWidth = Math.max(0.5, width);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colorRGBA(CONFIG.palette[colorKey], intensity * 0.9, 1.0);
  ctx.stroke();
}

function drawCorePass(ctx, points, width, intensity, colorKey) {
  if (points.length < 2) return;
  tracePath(ctx, points);
  ctx.lineWidth = Math.max(0.2, width);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colorRGBA(CONFIG.palette[colorKey], Math.min(1, intensity), 1.0);
  ctx.stroke();
}

function drawBranch(ctx, sx, sy, targetAngle, length, lineWidth, glowWidth, brightness, depth, maxDepth, rng, w, h) {
  if (depth >= maxDepth || lineWidth < 0.15 || length < 4) return;

  let angle = targetAngle;
  let x = sx, y = sy;
  const points = [{ x, y }];
  const steps = Math.max(3, Math.floor(length / 3));

  for (let i = 0; i < steps; i++) {
    angle += (rng() - 0.5) * 1.1;
    angle += (targetAngle - angle) * 0.06; // плавно стремится к целевому
    x += Math.sin(angle) * 3.0;
    y += Math.cos(angle) * 3.0;
    if (x < -20 || x > w + 20 || y < -20 || y > h + 20) break;
    points.push({ x, y });
  }

  if (points.length > 1) {
    const fade = Math.pow(0.7, depth);
    drawGlowPass(ctx, points, glowWidth * fade, brightness * 0.3 * fade, 'outer');
    drawCorePass(ctx, points, lineWidth * fade, brightness * 0.9 * fade, 'inner');
    drawCorePass(ctx, points, Math.max(0.1, lineWidth * 0.35 * fade), brightness * 1.3 * fade, 'core');

    // Рекурсивные подветки
    if (depth < maxDepth - 1) {
      for (let i = 2; i < points.length - 1; i++) {
        if (rng() < 0.08) {
          const subAngle = angle + (rng() - 0.5) * 1.8;
          drawBranch(ctx, points[i].x, points[i].y, subAngle, length * 0.45,
                     lineWidth * 0.55, glowWidth * 0.55, brightness * 0.5,
                     depth + 1, maxDepth, rng, w, h);
        }
      }
    }
  }
}

function drawBeadedPass(ctx, points, lineWidth, brightness, rng) {
  const palette = CONFIG.palette;
  for (let i = 0; i < points.length; i += 2) {
    const p = points[i];
    const pulse = 0.6 + rng() * 0.8;
    const beadR = lineWidth * pulse;

    // Внешнее свечение
    ctx.beginPath();
    ctx.arc(p.x, p.y, beadR * 3.2, 0, Math.PI * 2);
    ctx.fillStyle = colorRGBA(palette.outer, brightness * 0.2, 1.0);
    ctx.fill();

    // Средний ореол
    ctx.beginPath();
    ctx.arc(p.x, p.y, beadR * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = colorRGBA(palette.inner, brightness * 0.5, 1.0);
    ctx.fill();

    // Яркое ядро
    ctx.beginPath();
    ctx.arc(p.x, p.y, beadR * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = colorRGBA(palette.core, Math.min(1, brightness * 1.4), 1.0);
    ctx.fill();
  }
}

// ============ ЦВЕТ ============
function colorRGBA(c, intensity, alpha) {
  const r = clamp(Math.floor(c.r * Math.min(1.3, intensity)), 0, 255);
  const g = clamp(Math.floor(c.g * Math.min(1.3, intensity)), 0, 255);
  const b = clamp(Math.floor(c.b * Math.min(1.3, intensity)), 0, 255);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ============ УТИЛИТЫ ============
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

// Детерминированный RNG (mulberry32) — для воспроизводимости результата
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}