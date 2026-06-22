#version 300 es
precision highp float;

in vec2 vertPosition;
in vec2 vertTexCoord;

uniform vec2 texelSize;

uniform vec2 aspectRatios; // sim   canvas
uniform vec3 view;         // Xpos  Ypos    Zoom
uniform float pitch25D;    // 0 = flat 2D, 0.4-0.7 = 2.5D tilt

out vec2 texCoord;         // normalized
out vec2 fragCoord;        // non normalized fragment coordinate

out vec2 texCoordXmY0;     // left
out vec2 texCoordXpY0;     // right
out vec2 texCoordX0Yp;     // up
out vec2 texCoordX0Ym;     // down

out vec2 onScreenUV;       // Normalized onscreen coordinates where canvas heigth = 1.0 and width is scaled acording to aspect ratio

uniform float Xmult;       // gl.uniform1f(gl.getUniformLocation(skyBackgroundDisplayProgram, 'Xmult'), horizontalDisplayMult);

const float Ymult = 5.;    // 5.0

vec2 apply25DPitch(vec2 pos)
{
  if (pitch25D <= 0.0)
    return pos;

  float p = clamp(pitch25D, 0.0, 1.0);
  float angle = p * 0.9;
  float cosA = cos(angle);
  float sinA = sin(angle);

  float x = pos.x;
  float y = pos.y;
  float z = y * 0.35;

  float newY = y * cosA - z * sinA;
  float newZ = y * sinA + z * cosA;

  return vec2(x, newY);
}

void main()
{
  vec2 texCoordAdjusted = vertTexCoord;
  texCoordAdjusted.x *= Xmult;
  texCoordAdjusted.y *= Ymult;

  texCoordAdjusted.x -= (Xmult - 1.0) / (2. * texelSize.x);
  texCoordAdjusted.y -= (Ymult - 1.0) / (2. * texelSize.y);

  fragCoord = texCoordAdjusted;
  texCoord = texCoordAdjusted * texelSize;

  texCoordXmY0 = texCoord + vec2(-texelSize.x, 0.0);
  texCoordXpY0 = texCoord + vec2(texelSize.x, 0.0);
  texCoordX0Yp = texCoord + vec2(0.0, texelSize.y);
  texCoordX0Ym = texCoord + vec2(0.0, -texelSize.y);

  vec2 outpos = apply25DPitch(vertPosition);

  outpos.x *= Xmult;
  outpos.y *= Ymult;

  outpos.x += view.x;
  outpos.y += view.y * aspectRatios[0];

  outpos *= view[2];

  outpos.y *= aspectRatios[1] / aspectRatios[0];

  onScreenUV = vec2(outpos.x * aspectRatios[1], outpos.y) * 0.5;

  gl_Position = vec4(outpos, 0.0, 1.0);
}