#version 300 es
precision highp float;
precision highp isampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;
uniform sampler2D lightningDataTex;
uniform sampler2D thunderTex; // ring buffer of recent lightning strikes

uniform vec2 resolution; // sim resolution
uniform vec2 texelSize;
uniform vec2 canvasResolution; // canvas pixel size (for screen-space scope)
uniform float dryLapse;
uniform float iterNum;
uniform float Xmult;

uniform vec3 view;   // Xpos  Ypos    Zoom
uniform vec4 cursor; // xpos   Ypos  Size   type

// radar tuning (driven by the GUI)
uniform float radarGain;        // precipitation sensitivity
uniform float radarGamma;       // contrast / brightness curve
uniform float radarCloudMix;    // how much clouds contribute
uniform float radarBackground;  // darkness of terrain (0 = black)
uniform float showThunder;      // 0 or 1
uniform float thunderIntensity; // glow strength
uniform int   radarScheme;      // 0 NEXRAD, 1 Turbo, 2 Monochrome
uniform int   radarProduct;     // 0 Reflectivity, 1 Velocity, 2 Cloud
uniform float radarSweep;       // 0 or 1 rotating sweep
uniform float radarRings;       // 0 or 1 range rings + crosshair
uniform float radarSmooth;      // 0 or 1 light smoothing
uniform int   thunderCount;     // number of valid strikes in the history buffer

out vec4 fragmentColor;

#include "common.glsl"
#include "commonDisplay.glsl"

#define MAX_THUNDER_STRIKES 48
#define THUNDER_HISTORY 250 // iterations a thunder cell stays visible


// 1) NEXRAD-like reflectivity scale with many stops
vec3 radarNEXRAD(float t)
{
  t = clamp(t, 0.0, 1.0);

  vec3 c0  = vec3(0.85, 0.95, 1.00); // trace       (very light)
  vec3 c1  = vec3(0.30, 0.85, 1.00); // light blue
  vec3 c2  = vec3(0.00, 0.60, 1.00); // blue
  vec3 c3  = vec3(0.00, 1.00, 0.65); // teal / green-cyan
  vec3 c4  = vec3(0.00, 1.00, 0.00); // green       (light rain)
  vec3 c5  = vec3(0.55, 1.00, 0.00); // yellow-green
  vec3 c6  = vec3(1.00, 1.00, 0.00); // yellow
  vec3 c7  = vec3(1.00, 0.70, 0.00); // amber
  vec3 c8  = vec3(1.00, 0.45, 0.00); // orange
  vec3 c9  = vec3(1.00, 0.15, 0.00); // red-orange
  vec3 c10 = vec3(1.00, 0.00, 0.00); // red         (heavy)
  vec3 c11 = vec3(1.00, 0.00, 0.55); // magenta
  vec3 c12 = vec3(0.75, 0.00, 1.00); // purple      (extreme / severe)

  float f = t * 12.0;
  int i = int(floor(f));
  float frac = f - float(i);
  i = clamp(i, 0, 11);

  if (i == 0)  return mix(c0,  c1,  frac);
  if (i == 1)  return mix(c1,  c2,  frac);
  if (i == 2)  return mix(c2,  c3,  frac);
  if (i == 3)  return mix(c3,  c4,  frac);
  if (i == 4)  return mix(c4,  c5,  frac);
  if (i == 5)  return mix(c5,  c6,  frac);
  if (i == 6)  return mix(c6,  c7,  frac);
  if (i == 7)  return mix(c7,  c8,  frac);
  if (i == 8)  return mix(c8,  c9,  frac);
  if (i == 9)  return mix(c9,  c10, frac);
  if (i == 10) return mix(c10, c11, frac);
  return mix(c11, c12, frac);
}


// 2) Google "Turbo" colormap (lots of colours, good for contrast)
vec3 radarTurbo(float x)
{
  x = clamp(x, 0.0, 1.0);
  const vec4 kRedVec4   = vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234);
  const vec4 kGreenVec4 = vec4(0.09140261, 2.19418839,   4.84296658, -14.18503333);
  const vec4 kBlueVec4  = vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771);
  const vec2 kRedVec2   = vec2(-152.94239396, 59.28637943);
  const vec2 kGreenVec2 = vec2(   4.27729857,  2.82956604);
  const vec2 kBlueVec2  = vec2( -89.90310912, 27.34824973);

  vec4 v4 = vec4(1.0, x, x * x, x * x * x);
  vec2 v2 = v4.zw * v4.z; // x^4, x^5

  return vec3(
    dot(v4, kRedVec4)   + dot(v2, kRedVec2),
    dot(v4, kGreenVec4) + dot(v2, kGreenVec2),
    dot(v4, kBlueVec4)  + dot(v2, kBlueVec2)
  ) / 255.0;
}


// 3) Monochrome blue (classic single-hue radar)
vec3 radarMono(float t)
{
  t = clamp(t, 0.0, 1.0);
  return mix(vec3(0.0, 0.04, 0.10), vec3(0.55, 0.95, 1.0), pow(t, 0.6));
}


// 4) Doppler velocity (red = toward radar, green = away)
vec3 dopplerColor(float v)
{
  v = clamp(v, -1.0, 1.0);
  if (v >= 0.0)
    return mix(vec3(0.04, 0.10, 0.08), vec3(0.0, 1.0, 0.0), v); // away -> green
  return mix(vec3(0.10, 0.04, 0.04), vec3(1.0, 0.0, 0.0), -v); // toward -> red
}


vec3 radarColor(float t)
{
  if (radarScheme == 1) return radarTurbo(t);
  if (radarScheme == 2) return radarMono(t);
  return radarNEXRAD(t);
}


void main()
{
  ivec2 wall = texture(wallTex, texCoord).xy;
  vec4 water = bilerpWall(waterTex, wallTex, fragCoord);
  vec4 base  = bilerpWall(baseTex, wallTex, fragCoord);

  float simAspect = resolution.x / resolution.y;

  float precip = water[PRECIPITATION];
  float cloud  = water[CLOUD];

  // optional light smoothing of the radar field
  if (radarSmooth > 0.5) {
    vec2 o = vec2(1.0, 0.0);
    float pw = precip, cw = cloud;
    pw += bilerpWall(waterTex, wallTex, fragCoord + o.xy)[PRECIPITATION];
    pw += bilerpWall(waterTex, wallTex, fragCoord - o.xy)[PRECIPITATION];
    pw += bilerpWall(waterTex, wallTex, fragCoord + o.yx)[PRECIPITATION];
    pw += bilerpWall(waterTex, wallTex, fragCoord - o.yx)[PRECIPITATION];
    pw += bilerpWall(waterTex, wallTex, fragCoord + o.xy + o.yx)[PRECIPITATION];
    pw += bilerpWall(waterTex, wallTex, fragCoord + o.xy - o.yx)[PRECIPITATION];
    pw += bilerpWall(waterTex, wallTex, fragCoord - o.xy + o.yx)[PRECIPITATION];
    pw += bilerpWall(waterTex, wallTex, fragCoord - o.xy - o.yx)[PRECIPITATION];
    pw /= 9.0;
    cw += bilerpWall(waterTex, wallTex, fragCoord + o.xy)[CLOUD];
    cw += bilerpWall(waterTex, wallTex, fragCoord - o.xy)[CLOUD];
    cw += bilerpWall(waterTex, wallTex, fragCoord + o.yx)[CLOUD];
    cw += bilerpWall(waterTex, wallTex, fragCoord - o.yx)[CLOUD];
    cw += bilerpWall(waterTex, wallTex, fragCoord + o.xy + o.yx)[CLOUD];
    cw += bilerpWall(waterTex, wallTex, fragCoord + o.xy - o.yx)[CLOUD];
    cw += bilerpWall(waterTex, wallTex, fragCoord - o.xy + o.yx)[CLOUD];
    cw += bilerpWall(waterTex, wallTex, fragCoord - o.xy - o.yx)[CLOUD];
    cw /= 9.0;
    precip = pw; cloud = cw;
  }

  vec3 col;

  if (wall[DISTANCE] == 0) { // is wall / terrain
    switch (wall[TYPE]) {
    case WALLTYPE_LAND:
      col = vec3(radarBackground * 0.7);
      break;
    case WALLTYPE_WATER:
      col = vec3(0.0, radarBackground * 0.8, radarBackground * 1.8);
      break;
    case WALLTYPE_INERT:
      col = vec3(0.0);
      break;
    case WALLTYPE_FIRE:
      col = vec3(radarBackground * 4.0, radarBackground, 0.0);
      break;
    default:
      col = vec3(radarBackground * 0.7);
      break;
    }
  } else { // air
    if (radarProduct == 1) { // Doppler velocity
      vec2 vel = base.xy; // VX, VY (cells / iteration)
      vec2 dom = vec2(fract(texCoord.x / Xmult), texCoord.y);
      vec2 toCenter = dom - vec2(0.5, 0.5);
      vec2 dir = normalize(toCenter + vec2(1e-5));
      float radial = dot(vel, dir);                // + = moving away, - = toward
      float t = clamp(radarGain * 0.8 * radial, -1.0, 1.0);
      col = dopplerColor(t);
    } else if (radarProduct == 2) { // Cloud / storm structure
      float t = clamp(pow(max(cloud * radarGain * 0.5, 0.0), radarGamma), 0.0, 1.0);
      if (cloud > 0.03) col = radarColor(t);
      else col = radarColor(0.02) * 0.2;
    } else { // Reflectivity (precipitation)
      float radarVal = precip * radarGain + cloud * radarCloudMix;
      float t = clamp(pow(max(radarVal, 0.0), radarGamma), 0.0, 1.0);
      if (radarVal > 0.015) col = radarColor(t);
      else col = radarColor(0.02) * clamp(cloud * 0.05, 0.0, 0.25);
    }
  }

  // Thunder / lightning overlay using the persistent strike history.
  if (showThunder > 0.5) {
    for (int i = 0; i < MAX_THUNDER_STRIKES; i++) {
      if (i >= thunderCount) break;            // only iterate valid strikes
      vec4 s = texelFetch(thunderTex, ivec2(i, 0), 0);
      if (s.w <= 1.0) continue;
      float age = iterNum - s.z;               // s.z = start iteration
      if (age < 0.0 || age >= float(THUNDER_HISTORY)) continue;

      vec2 d = vec2((s.x - texCoord.x) * simAspect, s.y - texCoord.y);
      float dist = length(d);
      float fade = 1.0 - age / float(THUNDER_HISTORY);
      // localized Gaussian glow (no more whole-screen white wash)
      float glow = fade * s.w * thunderIntensity * 0.5 * exp(-(dist * dist) / (0.06 * 0.06));
      glow = min(glow, 1.2);
      col += vec3(0.85, 0.80, 1.0) * glow;
    }

    // bright immediate flash for the most recent strike
    vec4 ld = texture(lightningDataTex, vec2(0.5));
    if (ld[INTENSITY] > 1.0) {
      float age = iterNum - ld[START_ITERNUM];
      if (age >= 0.0 && age < 40.0) {
        vec2 d = vec2((ld.x - texCoord.x) * simAspect, ld.y - texCoord.y);
        float dist = length(d);
        float flash = 1.0 - age / 40.0;
        float glow = flash * thunderIntensity * ld[INTENSITY] * 0.8 * exp(-(dist * dist) / (0.03 * 0.03));
        glow = min(glow, 1.5);
        col += vec3(0.95, 0.90, 1.0) * glow;
      }
    }
  }

  // Radar scope decorations: rotating sweep + range rings (screen space)
  if (radarSweep > 0.5 || radarRings > 0.5) {
    vec2 rel = gl_FragCoord.xy - canvasResolution * 0.5;
    float radius = length(rel) / min(canvasResolution.x, canvasResolution.y) * 0.5;
    float ang = atan(rel.y, rel.x);

    if (radarRings > 0.5) {
      float rr = fract(radius * 6.0);
      float ring = smoothstep(0.04, 0.0, min(rr, 1.0 - rr));
      col = mix(col, vec3(0.6, 1.0, 0.7), ring * 0.18);
      float cross = smoothstep(1.5, 0.0, min(abs(rel.x), abs(rel.y)));
      col = mix(col, vec3(0.6, 1.0, 0.7), cross * 0.12);
    }

    if (radarSweep > 0.5) {
      float sweep = mod(iterNum * 0.025, 2.0 * PI);
      float diff = mod(sweep - ang, 2.0 * PI);
      float afterglow = exp(-diff * 2.5);
      col *= mix(0.5, 1.0, afterglow);          // older data is dimmer
      float line = smoothstep(0.06, 0.0, diff);
      col += vec3(0.2, 1.0, 0.4) * line * 0.25; // bright sweep arm
    }
  }

  fragmentColor = vec4(col, 1.0);
  drawCursor(cursor, view);
}
