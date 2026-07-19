onmessage = (event) => {
  const msg = event.data;
  let imgData = generateLightningBolt(msg.width, msg.height);
  postMessage(imgData);
};

function generateLightningBolt(width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  // --- Цвет: бело-голубое ядро + фиолетовое свечение ---
  function genLightningColor(lineWidth, maxLineWidth) {
    const t = Math.min(lineWidth / maxLineWidth, 1.0); // 1 = толстый (яркий), 0 = тонкий
    const brightness = Math.pow(t, 1.5);

    // Ядро: от голубовато-белого (толстое) до синеватого (тонкое)
    const r = Math.round(180 + 75 * brightness);   // 180..255
    const g = Math.round(190 + 65 * brightness);   // 190..255
    const b = 255;                                  // всегда максимум → голубой оттенок
    const a = 0.4 + 0.6 * brightness;              // тонкие ветви полупрозрачны

    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  const STEP = 3;              // шаг в пикселях (было 1 — слишком мелко)
  const MAIN_WIDTH = 7.0;     // начальная толщина основного канала
  const targetAngle = 0.0;    // общее направление — вниз

  // ==================== Основной канал ====================
  let startX = width / 2 + (Math.random() - 0.5) * width * 0.1;
  let startY = 0;
  let angle = (Math.random() - 0.5) * 0.4;
  let lineWidth = MAIN_WIDTH;

  // Свечение (glow) — рисуем толстой полупрозрачной линией ПОД основной
  ctx.save();
  ctx.shadowColor = 'rgba(140, 160, 255, 0.8)';
  ctx.shadowBlur = 25;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineWidth = lineWidth;

  while (startY < height) {
    const nextX = startX + Math.sin(angle) * STEP;
    const nextY = startY + Math.cos(angle) * STEP;

    // Случайное отклонение + возврат к целевому направлению
    angle += (Math.random() - 0.5) * 1.2;
    angle -= (angle - targetAngle) * 0.06;
    angle = Math.max(-1.3, Math.min(1.3, angle));

    ctx.lineTo(nextX, nextY);
    startX = nextX;
    startY = nextY;

    // Сужение основного канала книзу
    lineWidth = MAIN_WIDTH * (1.0 - 0.5 * (nextY / height));
    ctx.lineWidth = lineWidth;

    // Ветвление основного канала
    if (Math.random() < 0.02 * (1.0 - nextY / height)) {
      ctx.strokeStyle = genLightningColor(lineWidth, MAIN_WIDTH);
      ctx.stroke();

      drawBranch(
        nextX, nextY,
        targetAngle + (Math.random() - 0.5) * 2.2,
        lineWidth * (0.3 + Math.random() * 0.3),
        1
      );

      ctx.beginPath();
      ctx.moveTo(nextX, nextY);
      ctx.lineWidth = lineWidth;
    }
  }

  ctx.strokeStyle = genLightningColor(lineWidth, MAIN_WIDTH);
  ctx.stroke();
  ctx.restore();

  // ==================== Ветви ====================
  function drawBranch(bx, by, bTargetAngle, bLineWidth, depth) {
    const MAX_DEPTH = 6;
    if (depth > MAX_DEPTH || bLineWidth < 0.3) return;

    let angle = bTargetAngle;
    let x = bx;
    let y = by;
    let lw = bLineWidth;

    ctx.save();
    ctx.shadowColor = 'rgba(140, 160, 255, 0.5)';
    ctx.shadowBlur = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = lw;

    const branchHeight = height * (0.3 + Math.random() * 0.4); // ветвь короче основного
    const endY = y + branchHeight;

    while (y < endY && y < height) {
      const nx = x + Math.sin(angle) * STEP;
      const ny = y + Math.cos(angle) * STEP;

      angle += (Math.random() - 0.5) * 0.9;
      angle -= (angle - bTargetAngle) * 0.05;
      angle = Math.max(-1.4, Math.min(1.4, angle));

      ctx.lineTo(nx, ny);
      x = nx;
      y = ny;

      // Сужение ветви
      lw -= 0.04;
      if (lw < 0.3) break;
      ctx.lineWidth = lw;

      // Рекурсивное ветвление
      if (Math.random() < 0.025 && depth < MAX_DEPTH) {
        ctx.strokeStyle = genLightningColor(lw, MAIN_WIDTH);
        ctx.stroke();

        drawBranch(
          nx, ny,
          bTargetAngle + (Math.random() - 0.5) * 1.8,
          lw * (0.4 + Math.random() * 0.3),
          depth + 1
        );

        ctx.beginPath();
        ctx.moveTo(nx, ny);
        ctx.lineWidth = lw;
      }
    }

    ctx.strokeStyle = genLightningColor(lw, MAIN_WIDTH);
    ctx.stroke();
    ctx.restore();
  }

  return ctx.getImageData(0, 0, width, height);
}