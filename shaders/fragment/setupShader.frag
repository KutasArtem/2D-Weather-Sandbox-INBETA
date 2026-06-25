#version 300 es
precision highp float;

uniform vec2 resolution;
uniform vec2 texelSize;

uniform float dryLapse;

uniform float simHeight;

uniform float seed;
uniform float heightMult;

uniform vec4 initial_Tv[126];

float getInitialT(int y) { return initial_Tv[y / 4][y % 4]; }

in vec2 texCoord;
in vec2 fragCoord;

#include "common.glsl"

layout(location = 0) out vec4 base;
layout(location = 1) out vec4 water;
layout(location = 2) out ivec4 wall;

float rand(float n) { return fract(sin(n) * 43758.5453123); }

// Hermite interpolation for smoother noise
float hermiteInterp(float t) {
  return t * t * (3.0 - 2.0 * t);
}

// Improved Perlin-like noise with smoother interpolation
float noise(float p)
{
  float fl = floor(p);
  float fc = fract(p);
  float u = hermiteInterp(fc);
  return mix(rand(fl), rand(fl + 1.), u) - 0.5;
}

void main()
{
  base = vec4(0.0);
  water = vec4(0.0);

  // WALL SETUP

  float height = 0.0;
  float height_m = 0.0;

  if (heightMult < 0.05) { // all sea

    height = 0.0;

  } else if (heightMult < 0.10) { // all land

    height = 0.005;

  } else { // generate hills / mountains
    float var = fragCoord.x * 0.0008;
    
    // Smooth terrain with Perlin-like noise
    float amplitude = 1.0;
    float frequency = 0.5;  // Start with lower frequency for smoother base
    float maxValue = 0.0;
    
    for (float i = 0.0; i < 6.0; i++) { // Fewer octaves for less detail complexity
      height += noise(var * frequency + rand(seed + i * 10.0) * 100.0) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.48; // Lower persistence = smoother transitions
      frequency *= 1.75; // Lower lacunarity = gentler frequency transitions
    }
    
    height /= maxValue; // Normalize
    height *= heightMult * 0.5;  // Reduce height by half for gentler slopes
    height_m = height * simHeight;
  }

  if (texCoord.y < texelSize.y || texCoord.y < height) {                                                      // set to wall
    wall[DISTANCE] = 0;                                                                                       // set to wall
    if (height < texelSize.y) {
      wall[TYPE] = WALLTYPE_WATER;                                                                            // set walltype to water
      base[TEMPERATURE] = CtoK(25.0);                                                                         // set water temperature to 25 C
    } else {
      wall[TYPE] = WALLTYPE_LAND;                                                                             // set walltype to land
      water[SOIL_MOISTURE] = 25.0;                                                                            // soil moisture in mm

      wall[VEGETATION] = int(110.0 - fragCoord.y * 2. + noise(fragCoord.x * 0.01 + rand(seed) * 10.) * 150.); // set vegitation

      water[SNOW] = max(map_rangeC(height_m, 2000.0, 5000.0, 0.0, 100.0), 0.);                                // set snow
    }
  } else {                                                                                                    // air, not wall
    wall[DISTANCE] = 255;                                                                                     // reset distance to wall
    base[TEMPERATURE] = getInitialT(int(texCoord.y * (1.0 / texelSize.y)));                                   // set temperature

    float realTemp = potentialToRealT(base[TEMPERATURE]);

    if (texCoord.y < 0.20) // set dew point
      water[TOTAL] = maxWater(realTemp - 2.0);
    else
      water[TOTAL] = maxWater(realTemp - 20.0);

    water[CLOUD] = max(water[TOTAL] - maxWater(realTemp), 0.0); // calculate cloud water
  }
  wall[VERT_DISTANCE] = 100;                                    // preset height above ground to prevent water being deleted in boundaryshader ln 250*`
}