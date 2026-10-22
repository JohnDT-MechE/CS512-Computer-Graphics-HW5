const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uModelView;
uniform mat4 uProjection;

out vec3 vPosition;
out vec3 vNormal;

void main() {
  vec4 p = uModelView * vec4(aPosition, 1.0);
  vPosition = p.xyz;
  // Normal Matrix for Correct Lighting
  mat3 normalMatrix = transpose(inverse(mat3(uModelView)));
  vNormal = normalize(normalMatrix * aNormal);
  gl_Position = uProjection * p;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec3 vPosition;
in vec3 vNormal;

uniform vec3 uLightPos;
uniform vec3 uLightPos2;
uniform float uWarmLightIntensity;
uniform vec3 uColor;
uniform float uDiffuse;
uniform float uSpecular;
uniform float uShininess;

out vec4 fragColor;

void main() {
  // Material Properties
  vec3 Ka = 0.08 * uColor;
  vec3 Kd = uDiffuse * uColor;
  vec3 Ks = uSpecular * vec3(1.0);
  float shininess = uShininess;

  // Surface Normal and View Direction
  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vPosition);

  // White Light
  vec3 L1 = normalize(uLightPos - vPosition);
  vec3 R1 = reflect(-L1, N);

  float diff1 = max(dot(N, L1), 0.0);
  float spec1 = 0.0;

  if (diff1 > 0.0) {
    spec1 = pow(max(dot(V, R1), 0.0), shininess);
  }

  // Warm Yellow Light
  vec3 L2 = normalize(uLightPos2 - vPosition);
  vec3 R2 = reflect(-L2, N);

  float diff2 = max(dot(N, L2), 0.0);
  float spec2 = 0.0;

  if (diff2 > 0.0) {
    spec2 = pow(max(dot(V, R2), 0.0), shininess);
  }

  // Combine Both Lights
  vec3 light1 = Kd * diff1 + Ks * spec1;

  vec3 warmYellow = vec3(1.0, 0.7, 0.25);
  vec3 light2 = (Kd * diff2 + Ks * spec2) * warmYellow * uWarmLightIntensity;

  fragColor = vec4(Ka + light1 + light2, 1.0);
}
`;

// WebGL setup
const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2");

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

// Fixed attribute slots, so the meshes stay valid when the shaders are recompiled
const ATTRIBUTES = { aPosition: 0, aNormal: 1 };

function createProgram(vsSource, fsSource) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
  for (const name in ATTRIBUTES) gl.bindAttribLocation(prog, ATTRIBUTES[name], name);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}

// Shader editors
const vertEditor = document.getElementById("vertEditor");
const fragEditor = document.getElementById("fragEditor");
const shaderError = document.getElementById("shaderError");
vertEditor.value = VERTEX_SHADER;
fragEditor.value = FRAGMENT_SHADER;

let program, uModelView, uProjection, uLightPos, uLightPos2, uColor;
let uWarmLightIntensity;
let uDiffuse, uSpecular, uShininess;

function updateProgram() {
  try {
    const prog = createProgram(vertEditor.value, fragEditor.value);
    gl.deleteProgram(program);
    program = prog;
    gl.useProgram(program);
    uModelView = gl.getUniformLocation(program, "uModelView");
    uProjection = gl.getUniformLocation(program, "uProjection");
    uLightPos = gl.getUniformLocation(program, "uLightPos");
    uLightPos2 = gl.getUniformLocation(program, "uLightPos2");
    uWarmLightIntensity = gl.getUniformLocation(program, "uWarmLightIntensity");
    uColor = gl.getUniformLocation(program, "uColor");
    uDiffuse = gl.getUniformLocation(program, "uDiffuse");
    uSpecular = gl.getUniformLocation(program, "uSpecular");
    uShininess = gl.getUniformLocation(program, "uShininess");
    shaderError.textContent = "";
  } catch (e) {
    shaderError.textContent = e.message.replace(/\0/g, "");  // some drivers end the log with \0
  }
}
updateProgram();
vertEditor.addEventListener("input", updateProgram);
fragEditor.addEventListener("input", updateProgram);

function bindAttribute(name, data) {
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.vertexAttribPointer(ATTRIBUTES[name], 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(ATTRIBUTES[name]);
}

function createMesh({ positions, normals, indices }) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  bindAttribute("aPosition", positions);
  bindAttribute("aNormal", normals);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  return { vao, count: indices.length };
}

// Geometric Primitives
const cubeMesh = createMesh(createCube());
const cylinderMesh = createMesh(createCylinder(32));
const sphereMesh = createMesh(createSphere(32, 16));
const coneMesh = createMesh(createCone(32));

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0, 0, 0, 1);
const projection = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
const lightWorld = [3, 4, 5];           // Original White Light
const lightWorld2 = [-4, -1, 3];        // Warm Yellow Light

// nteractive controls
let dragRotX = 0, dragRotY = -0.5;                      // mouse drag
let camX = 0, camY = 0, camZ = -5.5;                    // arrow keys, w, s
let sliderAngle = 0;                                    // degrees
let spinning = false, spinAngle = 0;                    // Start/Stop button
let shoulderAngle = 0, elbowAngle = 0, wristAngle = 0;  // Joint Control Angles

let mouseDown = false, lastX, lastY;
canvas.addEventListener("mousedown", e => { mouseDown = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener("mouseup", () => mouseDown = false);
window.addEventListener("mousemove", e => {
  if (!mouseDown) return;
  dragRotY += (e.clientX - lastX) * 0.01;
  dragRotX += (e.clientY - lastY) * 0.01;
  lastX = e.clientX; lastY = e.clientY;
});

document.addEventListener("keydown", e => {
  if (e.target === vertEditor || e.target === fragEditor) return;  // let the editors use the keys
  const step = 0.2;
  switch (e.key) {
    case "ArrowUp": camY -= step; break;
    case "ArrowDown": camY += step; break;
    case "ArrowLeft": camX += step; break;
    case "ArrowRight": camX -= step; break;
    case "w": camZ += step; break;
    case "s": camZ -= step; break;
    default: return;
  }
  e.preventDefault();  // keep the arrow keys from scrolling the page
});

const axisSelect = document.getElementById("axisSelect");
document.getElementById("slider").addEventListener("input", e => {
  sliderAngle = Number(e.target.value);
  document.getElementById("sliderValue").textContent = sliderAngle;
});
document.getElementById("spinButton").addEventListener("click", () => spinning = !spinning);

// Shoulder Slider
document.getElementById("shoulderSlider").addEventListener("input", e => {
  shoulderAngle = Number(e.target.value);
  document.getElementById("shoulderValue").textContent = shoulderAngle;
});

// Elbow Slider
document.getElementById("elbowSlider").addEventListener("input", e => {
  elbowAngle = Number(e.target.value);
  document.getElementById("elbowValue").textContent = elbowAngle;
});

// Wrist Slider
document.getElementById("wristSlider").addEventListener("input", e => {
  wristAngle = Number(e.target.value);
  document.getElementById("wristValue").textContent = wristAngle;
});

// Lower Arm Specular Slider
document.getElementById("lowerSpecularSlider").addEventListener("input", e => {
  lowerArm.specular = Number(e.target.value);
  document.getElementById("lowerSpecularValue").textContent = lowerArm.specular.toFixed(2);
});

// Upper Arm Specular Slider
document.getElementById("upperSpecularSlider").addEventListener("input", e => {
  upperArm.specular = Number(e.target.value);
  document.getElementById("upperSpecularValue").textContent = upperArm.specular.toFixed(2);
});

// Lower Arm Shininess Slider
document.getElementById("lowerShininessSlider").addEventListener("input", e => {
  lowerArm.shininess = Number(e.target.value);
  document.getElementById("lowerShininessValue").textContent = lowerArm.shininess;
});

// Upper Arm Shininess Slider
document.getElementById("upperShininessSlider").addEventListener("input", e => {
  upperArm.shininess = Number(e.target.value);
  document.getElementById("upperShininessValue").textContent = upperArm.shininess;
});

// Warm Yellow Light Intensity Slider
let warmLightIntensity = 0.5;
document.getElementById("warmLightSlider").addEventListener("input", e => {
  warmLightIntensity = Number(e.target.value);
  document.getElementById("warmLightValue").textContent = warmLightIntensity.toFixed(1);
});

function createNode(mesh, color, shape, diffuse = 0.8, specular = 0.5, shininess = 32) {
  return {
    mesh,
    color,
    shape,
    diffuse,
    specular,
    shininess,
    joint: null,
    children: []
  };
}

// Robotic Arm Hierarchy
// Level 1: Base (Cylinder) - Matte Gray
const base = createNode(cylinderMesh, [0.4, 0.4, 0.45],
  scale(0.55, 0.15, 0.55), 0.8, 0.1, 8);

// Level 2: Shoulder (Sphere) - Semi-Shiny Gold
const shoulder = createNode(sphereMesh, [0.9, 0.65, 0.2],
  scale(0.28, 0.28, 0.28), 0.6, 1.0, 8);

// Level 3: Lower Arm (Cube) - Matte Red
const lowerArm = createNode(cubeMesh, [0.9, 0.2, 0.2],
  multiply(translate(0, 0.55, 0), scale(0.18, 0.55, 0.18)),
  0.9, 0.05, 8);

// Level 4: Elbow (Sphere) - Semi-Shiny Gold
const elbow = createNode(sphereMesh, [0.9, 0.65, 0.2],
  scale(0.23, 0.23, 0.23), 0.6, 1.0, 16);

// Level 5: Upper Arm (Cube) - Matte Blue
const upperArm = createNode(cubeMesh, [0.2, 0.4, 0.95],
  multiply(translate(0, 0.45, 0), scale(0.15, 0.45, 0.15)),
  0.9, 0.05, 8);

// Level 6: Wrist (Sphere) - Shiny Gold
const wrist = createNode(sphereMesh, [0.9, 0.65, 0.2],
  scale(0.18, 0.18, 0.18), 0.6, 1.0, 32);

// Level 7: Tool (Cone) - Semi-Shiny Green
const tool = createNode(coneMesh, [0.2, 0.85, 0.55],
  multiply(translate(0, 0.20, 0), scale(0.16, 0.28, 0.16)),
  0.8, 0.4, 24);

// Parent-Child Connections
base.children.push(shoulder);
shoulder.children.push(lowerArm);
lowerArm.children.push(elbow);
elbow.children.push(upperArm);
upperArm.children.push(wrist);
wrist.children.push(tool);

function drawNode(node, frame) {
  gl.uniformMatrix4fv(uModelView, false, multiply(frame, node.shape));
  gl.uniform3fv(uColor, node.color);

  // Material Properties
  gl.uniform1f(uDiffuse, node.diffuse);
  gl.uniform1f(uSpecular, node.specular);
  gl.uniform1f(uShininess, node.shininess);

  gl.bindVertexArray(node.mesh.vao);
  gl.drawElements(gl.TRIANGLES, node.mesh.count, gl.UNSIGNED_SHORT, 0);
}

// Data structure
function drawTree(root, rootFrame) {
  const stack = [[root, rootFrame]];
  while (stack.length > 0) {
    const [node, parentFrame] = stack.pop();
    const frame = multiply(parentFrame, node.joint);
    drawNode(node, frame);
    for (const child of node.children) stack.push([child, frame]);
  }
}

// Render loop
let lastTime = 0;
function render(time) {
  const t = time / 1000;
  if (spinning) spinAngle += t - lastTime;
  lastTime = t;
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Camera moves with the keys; the light stays fixed in the world.
  const view = translate(camX, camY, camZ);
  gl.uniformMatrix4fv(uProjection, false, projection);

  // Light Positions
  gl.uniform3fv(uLightPos, transformPoint(view, lightWorld));
  gl.uniform3fv(uLightPos2, transformPoint(view, lightWorld2));
  gl.uniform1f(uWarmLightIntensity, warmLightIntensity);

  // Whole-model rotation
  const axisRotation = ROTATE[axisSelect.value](sliderAngle * Math.PI / 180 + spinAngle);
  const rotation = multiply(multiply(rotateY(dragRotY), rotateX(dragRotX)), axisRotation);

  // Base (Root)
  base.joint = multiply(translate(0, -1.15, 0), rotation);

  // Shoulder
  shoulder.joint = multiply(
    translate(0, 0.15, 0),
    rotateZ(shoulderAngle * Math.PI / 180 + 0.25 * Math.sin(t))
  );

  // Lower Arm
  lowerArm.joint = translate(0, 0, 0);

  // Elbow
  elbow.joint = multiply(
    translate(0, 1.1, 0),
    rotateZ(elbowAngle * Math.PI / 180 + 0.45 * Math.sin(1.5 * t))
  );

  // Upper Arm
  upperArm.joint = translate(0, 0, 0);

  // Wrist
  wrist.joint = multiply(
    translate(0, 0.9, 0),
    rotateZ(wristAngle * Math.PI / 180 + 0.2 * Math.sin(2 * t))
  );

  // Tool
  tool.joint = translate(0, 0.12, 0);

  // Draw the Robotic Arm
  drawTree(base, view);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
