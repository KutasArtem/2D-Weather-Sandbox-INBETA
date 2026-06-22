#version 300 es
precision highp float;

in vec2 dropPosition;
in vec2 mass; //[0] water   [1] ice
in float density;

out vec2 position_out;
out vec2 mass_out;
out float density_out;

uniform vec2 texelSize;
uniform vec2 aspectRatios; // sim   canvas
uniform vec3 view;         // Xpos  Ypos    Zoom
uniform float iterNum;

void main()
{
  vec2 outpos = dropPosition;

  outpos.x += view.x;
  outpos.y += view.y * aspectRatios[0];

  outpos *= view[2]; // zoom

  outpos.y *= aspectRatios[1] / aspectRatios[0];

  gl_Position = vec4(outpos, 0.0, 1.0);

  float depthFactor = clamp((dropPosition.y + 1.0) * 0.5, 0.0, 1.0);
  float size = 3.0 + depthFactor * 5.0;

  if (mass[1] > 0.0 && density < 1.0) {
    size = 2.0 + depthFactor * 3.5;
  } else if (mass[1] > 0.0 && density >= 1.0) {
    size = 4.0 + depthFactor * 3.0;
  }

  float zoomFactor = view[2] / aspectRatios[0];
  gl_PointSize = size * zoomFactor;

  position_out = dropPosition;
  mass_out = mass;
  density_out = density;
}