#version 300 es
precision highp float;

in vec2 position_out;
in vec2 mass_out;
in float density_out;

out vec4 fragmentColor;

// Precipitation mass:
#define WATER 0
#define ICE 1

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main()
{

  if (mass_out[WATER] < 0.)
    discard;

  float totalMass = mass_out[WATER] + mass_out[ICE];
  float depthFactor = clamp((position_out.y + 1.0) * 0.5, 0.0, 1.0);

  vec2 localCoord = (gl_PointCoord - 0.5) * 2.0;
  float dist = length(localCoord);
  float coreShape = 1.0 - smoothstep(0.0, 0.85, dist);
  float streakShape = 1.0 - smoothstep(0.0, 0.3, abs(localCoord.x)) * smoothstep(0.0, 1.0, abs(localCoord.y));
  float mixFactor = coreShape * 0.7 + streakShape * 0.3;

  float baseOpacity = totalMass * 0.12;
  float depthOpacity = mix(baseOpacity * 0.4, baseOpacity * 1.1, depthFactor);
  float alpha = mixFactor * depthOpacity;
  alpha = clamp(alpha, 0.0, 0.85);

  if (mass_out[ICE] > 0.) {
    if (mass_out[WATER] == 0.) {
      if (density_out < 1.0) {
        float snowBrightness = 0.85 + depthFactor * 0.15;
        vec3 snowCol = vec3(0.95, 0.97, 1.0) * snowBrightness;
        float sparkle = 0.0;
        if (hash(gl_PointCoord * 100.0) > 0.7) {
          sparkle = coreShape * 0.3;
        }
        fragmentColor = vec4(snowCol + sparkle, alpha);
      } else {
        float hailBrightness = 0.7 + depthFactor * 0.3;
        vec3 hailCol = vec3(0.95, 0.9, 0.75) * hailBrightness;
        float highlight = smoothstep(0.3, 0.0, length(localCoord - vec2(-0.25, 0.25)));
        fragmentColor = vec4(hailCol + highlight * 0.3, alpha);
      }
    } else {
      vec3 mixedCol = mix(vec3(0.6, 0.9, 1.0), vec3(0.9, 0.95, 1.0), depthFactor);
      float highlight = smoothstep(0.35, 0.0, length(localCoord - vec2(-0.2, 0.2))) * 0.2;
      fragmentColor = vec4(mixedCol + highlight, alpha);
    }
  } else {
    float rainBrightness = 0.5 + depthFactor * 0.3;
    vec3 rainCol = vec3(0.25, 0.5, 0.95) * rainBrightness;
    float streakAlpha = streakShape * depthOpacity * 1.2;
    float coreAlpha = coreShape * depthOpacity;
    float finalAlpha = clamp(max(streakAlpha, coreAlpha), 0.0, 0.8);
    fragmentColor = vec4(rainCol, finalAlpha);
  }

  if (alpha < 0.01)
    discard;
}