import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * SAGE-E in 3D. Built entirely from primitives + procedural canvas textures, so there
 * are no model files to load. World units match the old SVG units (1 unit ≈ 1 SVG px,
 * feet at y = 0, y up), which lets the SageBot pose code drive it unchanged.
 */

export interface Pose3D {
  y: number; sx: number; sy: number; body: number; yaw: number;
  head: number; hx: number; hy: number; gx: number; gy: number;
  armL: number; armR: number; legL: number; legR: number;
  px: number; py: number; eye: number; smile: number;
  browL: number; browR: number; browY: number;
}

export type ScreenFlash = 'yawn' | 'alert' | 'angry' | 'sound';
export type ScreenMood = 'idle' | 'listening' | 'thinking' | 'talking' | 'happy' | 'puppy' | 'sleep';

const D = Math.PI / 180;
const rand = mulberry(7);

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weathered paint: base colour, grime, rust blotches and drips. */
function paintTexture(base: string, rust = 1, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(90,70,50,${0.03 + rand() * 0.05})`;
    g.beginPath();
    g.arc(rand() * size, rand() * size, 2 + rand() * 14, 0, Math.PI * 2);
    g.fill();
  }
  const rustCols = ['#8a4220', '#a4572c', '#6e3418', '#b8703c'];
  for (let i = 0; i < 38 * rust; i++) {
    const x = rand() * size, y = rand() * size, r = 0.6 + rand() * (rand() < 0.12 ? 8 : 2.5);
    g.fillStyle = rustCols[Math.floor(rand() * rustCols.length)];
    g.globalAlpha = 0.18 + rand() * 0.32;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.6 + rand()), rand() * 3, 0, Math.PI * 2);
    g.fill();
    if (rand() < 0.3) { g.globalAlpha *= 0.5; g.fillRect(x - 0.8, y, 1.6, 6 + rand() * 18); }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function hazardTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9cdb4';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#5e564b';
  for (let i = -128; i < 256; i += 32) {
    g.beginPath();
    g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 + 128, 128); g.lineTo(i + 128, 128);
    g.fill();
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(140,70,30,${0.3 + rand() * 0.4})`;
    g.beginPath(); g.arc(rand() * 128, rand() * 128, 1 + rand() * 5, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '800 92px "DM Sans", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const wA = g.measureText('SAGE-').width, wB = g.measureText('E').width;
  const x0 = (512 - wA - wB) / 2;
  g.fillStyle = '#7d3b26';
  g.fillText('SAGE-', x0, 68);
  g.fillStyle = '#c0392b';
  g.fillText('E', x0 + wA, 68);
  // stencil gaps + wear
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) { g.beginPath(); g.arc(rand() * 512, rand() * 128, rand() * 3, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A gear: a disc with box teeth. */
function gear(r: number, depth: number, teeth: number, mat: THREE.Material) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, 20), mat);
  disc.rotation.z = Math.PI / 2;
  g.add(disc);
  const toothGeo = new THREE.BoxGeometry(depth, r * 0.3, r * 0.28);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const tooth = new THREE.Mesh(toothGeo, mat);
    tooth.position.set(0, Math.cos(a) * r, Math.sin(a) * r);
    tooth.rotation.x = -a;
    g.add(tooth);
  }
  return g;
}

export function createSageModel(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  // Canvas spans world x ∈ [-180, 180], y ∈ [-10, 390] (see .sb-gl in sagebot.css).
  const camera = new THREE.PerspectiveCamera(22, 360 / 400, 100, 3000);
  const dist = 200 / Math.tan(11 * D);
  camera.position.set(0, 190, dist);
  camera.lookAt(0, 190, 0);

  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x3a2a1c, 1.5));
  const key = new THREE.DirectionalLight(0xffe2b8, 2.6);
  key.position.set(-300, 500, 600);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9a50, 1.6);
  rim.position.set(400, 200, -300);
  scene.add(rim);

  // ---- materials ----
  const shellMat = new THREE.MeshStandardMaterial({ map: paintTexture('#e8dcc2'), roughness: 0.72, metalness: 0.08 });
  const rustyMat = new THREE.MeshStandardMaterial({ map: paintTexture('#8b6a4c', 2), roughness: 0.6, metalness: 0.45 });
  const darkMetal = new THREE.MeshStandardMaterial({ map: paintTexture('#5b4a3a', 1.5), roughness: 0.5, metalness: 0.6 });
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.65, metalness: 0.15 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x1b1916, roughness: 0.25, metalness: 0.3 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 0.35, metalness: 0.5, emissive: 0x000000 });
  const irisRingMat = new THREE.MeshStandardMaterial({ color: 0xc98b4b, roughness: 0.4, metalness: 0.6, emissive: 0x3a1c00 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050404 });
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.12, clearcoat: 1 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0x6b5a45, emissive: 0x000000, roughness: 0.3 });

  // ---- rig ----
  const root = new THREE.Group();     // position.y, scale, yaw
  scene.add(root);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(58, 30, 1);
  shadow.position.y = 0.2;
  scene.add(shadow);

  // legs: hip pivot at y = 31
  const makeLeg = (x: number) => {
    const hip = new THREE.Group();
    hip.position.set(x, 31, 2);
    const g1 = gear(9, 7, 10, rustyMat);
    hip.add(g1);
    const strut = new THREE.Mesh(new RoundedBoxGeometry(8, 26, 10, 2, 2), darkMetal);
    strut.position.set(x > 0 ? 3 : -3, -10, 0);
    hip.add(strut);
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 22, 8), rustyMat);
    piston.position.set(x > 0 ? -4 : 4, -9, 4);
    piston.rotation.z = x > 0 ? 0.15 : -0.15;
    hip.add(piston);
    const knee = gear(5.5, 9, 8, darkMetal);
    knee.position.set(0, -20, 0);
    hip.add(knee);
    const foot = new THREE.Mesh(new RoundedBoxGeometry(24, 9, 34, 2, 2.5), rustyMat);
    foot.position.set(0, -26.5, 6);
    hip.add(foot);
    const toe = new THREE.Mesh(new RoundedBoxGeometry(22, 5, 10, 2, 2), darkMetal);
    toe.position.set(0, -29, 24);
    toe.rotation.x = 0.25;
    hip.add(toe);
    root.add(hip);
    return hip;
  };
  const legL = makeLeg(-22);
  const legR = makeLeg(22);

  // body pivot near hips so leaning reads naturally
  const body = new THREE.Group();
  body.position.y = 30;
  root.add(body);

  const torso = new THREE.Mesh(new RoundedBoxGeometry(100, 86, 82, 4, 9), shellMat);
  torso.position.y = 41;
  body.add(torso);
  // lower lid / compactor band
  const band = new THREE.Mesh(new RoundedBoxGeometry(102, 16, 84, 3, 4), shellMat);
  band.position.y = 6;
  body.add(band);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(56, 2.4, 2), darkMetal);
  slot.position.set(8, 13.6, 42);
  body.add(slot);

  // chest screen (live canvas)
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 192; screenCanvas.height = 128;
  const screenCtx = screenCanvas.getContext('2d')!;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(66, 46, 4, 2, 2), darkMetal);
  bezel.position.set(2, 52, 40.5);
  body.add(bezel);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 40),
    new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }),
  );
  screen.position.set(2, 52, 42.7);
  body.add(screen);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), glassMat);
  glass.position.set(2, 52, 42.9);
  body.add(glass);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(56, 14),
    new THREE.MeshStandardMaterial({ map: labelTexture(), transparent: true, roughness: 0.8 }),
  );
  label.position.set(6, 22, 41.1);
  body.add(label);

  // neck: two jointed segments
  const neck = new THREE.Group();
  neck.position.y = 84;
  body.add(neck);
  const neckJoint = gear(6, 10, 8, darkMetal);
  neck.add(neckJoint);
  const neck1 = new THREE.Mesh(new RoundedBoxGeometry(9, 22, 9, 2, 2), rustyMat);
  neck1.position.y = 11;
  neck.add(neck1);
  const neck2 = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.5, 14, 10), darkMetal);
  neck2.position.set(0, 26, -2);
  neck.add(neck2);

  // head pivot sits at the top of the neck
  const head = new THREE.Group();
  head.position.y = 118;
  body.add(head);

  const eyes: { ball: THREE.Group; pupil: THREE.Group; smile: THREE.Mesh; brow: THREE.Group }[] = [];
  const makeEye = (side: -1 | 1) => {
    const housing = new THREE.Group();
    housing.position.set(side * 25, 18, 4);
    housing.rotation.y = side * 0.12;
    housing.rotation.z = side * -0.05;
    head.add(housing);

    const shell = new THREE.Mesh(new RoundedBoxGeometry(44, 36, 32, 3, 11), shellMat);
    housing.add(shell);
    // tube that carries the lens
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(17, 18, 10, 28), shellMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.z = 16;
    housing.add(tube);
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(15.5, 2.2, 10, 32), rustyMat);
    rimRing.position.z = 22;
    housing.add(rimRing);

    // eyeball group (scaled on y to blink)
    const ball = new THREE.Group();
    ball.position.z = 21.4;
    housing.add(ball);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(15, 32), lensMat);
    ball.add(lens);
    const pupil = new THREE.Group();
    pupil.position.z = 0.3;
    ball.add(pupil);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(10, 32), irisMat);
    pupil.add(iris);
    const ring = new THREE.Mesh(new THREE.RingGeometry(9, 10.6, 32), irisRingMat);
    ring.position.z = 0.1;
    pupil.add(ring);
    // camera-shutter blades
    for (let i = 0; i < 8; i++) {
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 4), pupilMat);
      const a = (i / 8) * Math.PI * 2;
      blade.position.set(Math.cos(a) * 7, Math.sin(a) * 7, 0.15);
      blade.rotation.z = a + 0.6;
      pupil.add(blade);
    }
    const pup = new THREE.Mesh(new THREE.CircleGeometry(5.5, 24), pupilMat);
    pup.position.z = 0.2;
    pup.name = 'pupil';
    pupil.add(pup);
    const shine = new THREE.Mesh(new THREE.CircleGeometry(2.4, 16), shineMat);
    shine.position.set(3.6, 4, 0.4);
    pupil.add(shine);
    const shine2 = new THREE.Mesh(new THREE.CircleGeometry(1.1, 12), shineMat);
    shine2.position.set(-3.5, -3.2, 0.4);
    pupil.add(shine2);
    const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(15, 32), glassMat);
    lensGlass.position.z = 1;
    ball.add(lensGlass);

    // Smiling lower lid: a crescent whose top edge bulges upward, so the eye reads as ^‿^.
    const r = 15.6;
    const a0 = 200 * D, a1 = 340 * D;
    const s = new THREE.Shape();
    s.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    s.absarc(0, 0, r, a0, a1, false);
    s.quadraticCurveTo(0, r * 0.32, Math.cos(a0) * r, Math.sin(a0) * r);
    const smile = new THREE.Mesh(new THREE.ShapeGeometry(s, 24), shellMat);
    smile.position.z = 23.2;
    housing.add(smile);

    // brow flap on top of the housing
    const brow = new THREE.Group();
    brow.position.set(0, 18, 8);
    housing.add(brow);
    const flap = new THREE.Mesh(new RoundedBoxGeometry(44, 4, 28, 2, 1.5), rustyMat);
    flap.rotation.x = 0.18;
    brow.add(flap);

    eyes.push({ ball, pupil, smile, brow });
  };
  makeEye(-1);
  makeEye(1);
  // bridge between the two eyes
  const bridge = new THREE.Mesh(new RoundedBoxGeometry(12, 14, 14, 2, 3), darkMetal);
  bridge.position.set(0, 16, 2);
  head.add(bridge);

  // antenna
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 22, 6), darkMetal);
  wire.position.set(12, 44, -6);
  wire.rotation.z = -0.3;
  head.add(wire);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(4.2, 16, 12), bulbMat);
  bulb.position.set(15.5, 55, -6);
  head.add(bulb);

  // arms: shoulder pivots on the torso's front-sides
  const makeArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 54, 68, 26);
    body.add(shoulder);
    shoulder.add(gear(7, 8, 9, darkMetal));
    const upper = new THREE.Mesh(new RoundedBoxGeometry(13, 34, 15, 2, 3), hazardMat);
    upper.position.y = -18;
    shoulder.add(upper);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 15, 12), rustyMat);
    wrist.rotation.z = Math.PI / 2;
    wrist.position.y = -36;
    shoulder.add(wrist);
    for (const f of [-1, 1]) {
      const claw = new THREE.Mesh(new RoundedBoxGeometry(6, 14, 11, 2, 2), rustyMat);
      claw.position.set(f * 4, -44, 2);
      claw.rotation.z = f * 0.12;
      shoulder.add(claw);
    }
    return shoulder;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // ---- screen drawing ----
  let screenMood: ScreenMood = 'idle';
  let pulse = 0; // 0 = calm … ~1.4 = panicking (fast mouse)
  let pulsePhase = 0, lastT = 0;
  let flash: { kind: ScreenFlash; until: number } | null = null;
  const drawScreen = (t: number) => {
    const g = screenCtx, W = 192, H = 128;
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    pulsePhase += dt * (1 + pulse * 2.2);
    if (flash && t > flash.until) flash = null;
    if (flash) { drawFlash(g, flash.kind, t); screenTex.needsUpdate = true; return; }
    const bg = screenMood === 'happy' || screenMood === 'puppy' ? '#3b2216'
      : screenMood === 'thinking' || screenMood === 'talking' ? '#3a2913' : '#16150f';
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.lineCap = 'round'; g.lineJoin = 'round';
    switch (screenMood) {
      case 'thinking':
        g.fillStyle = '#ffb347';
        for (let i = 0; i < 3; i++) {
          const b = Math.sin(t * 6 - i * 0.9);
          g.globalAlpha = 0.5 + 0.5 * Math.max(0, b);
          g.beginPath(); g.arc(56 + i * 40, 64 - Math.max(0, b) * 12, 11, 0, 7); g.fill();
        }
        g.globalAlpha = 1;
        break;
      case 'talking':
        g.fillStyle = '#ffb347';
        for (let i = 0; i < 5; i++) {
          const h = 20 + Math.abs(Math.sin(t * 9 + i * 1.7)) * 70;
          g.beginPath(); g.roundRect(36 + i * 28 - 8, 64 - h / 2, 16, h, 8); g.fill();
        }
        break;
      case 'happy':
      case 'puppy': {
        const k = 1 + Math.max(0, Math.sin(pulsePhase * 6.3)) * 0.15;
        g.save(); g.translate(96, 66); g.scale(k * 2.6, k * 2.6);
        g.fillStyle = '#ff7a59';
        g.beginPath();
        g.moveTo(0, 13); g.bezierCurveTo(-18, 1, -16, -15, -6, -14);
        g.bezierCurveTo(-2, -14, 0, -10, 0, -8); g.bezierCurveTo(0, -10, 2, -14, 6, -14);
        g.bezierCurveTo(16, -15, 18, 1, 0, 13); g.fill();
        g.restore();
        break;
      }
      case 'listening':
        g.fillStyle = '#8fd17a';
        for (let i = 0; i < 3; i++) {
          g.globalAlpha = 0.5 + 0.5 * Math.max(0, Math.sin(t * 4.5 - i));
          g.beginPath(); g.arc(60 + i * 36, 64, 9, 0, 7); g.fill();
        }
        g.globalAlpha = 1;
        break;
      case 'sleep':
        g.fillStyle = '#8a8577'; g.font = '600 34px monospace'; g.textAlign = 'center';
        g.fillText('z z z', 96, 76);
        break;
      default: {
        const col = pulse > 0.95 ? '#ff5a4a' : pulse > 0.45 ? '#ffb347' : '#8fd17a';
        g.strokeStyle = col; g.lineWidth = 6; g.shadowColor = col; g.shadowBlur = 10;
        const off = (pulsePhase * 70) % 260;
        g.setLineDash([180, 80]); g.lineDashOffset = -off;
        g.beginPath();
        const a = 1 + Math.min(pulse, 1.4) * 0.45;
        const pts = [[10, 64], [56, 64], [72, 64 - 30 * a], [92, 64 + 34 * a], [112, 64 - 20 * a], [126, 64], [182, 64]];
        pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
        g.setLineDash([]); g.shadowBlur = 0;
        g.fillStyle = col; g.font = '600 15px monospace'; g.textAlign = 'right';
        g.fillText(`♥ ${Math.round(72 + pulse * 95)}`, W - 10, 20);
      }
    }
    // scanlines
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1.5);
    screenTex.needsUpdate = true;
  };

  function drawFlash(g: CanvasRenderingContext2D, kind: ScreenFlash, t: number) {
    g.fillStyle = kind === 'angry' ? '#3a1512' : '#16150f';
    g.fillRect(0, 0, 192, 128);
    g.lineCap = 'round'; g.lineWidth = 7;
    switch (kind) {
      case 'yawn': { // big sleepy O
        const h = 22 + Math.abs(Math.sin(t * 1.6)) * 26;
        g.strokeStyle = '#ffb347';
        g.beginPath(); g.ellipse(96, 66, 22, h, 0, 0, Math.PI * 2); g.stroke();
        break;
      }
      case 'alert':
        g.fillStyle = '#ff5a4a'; g.font = '900 84px "DM Sans", Arial'; g.textAlign = 'center';
        g.fillText(Math.sin(t * 20) > 0 ? '!!' : '!?', 96, 96);
        break;
      case 'angry':
        g.strokeStyle = '#ff5a4a';
        g.beginPath(); g.moveTo(44, 40); g.lineTo(80, 58); g.moveTo(148, 40); g.lineTo(112, 58);
        g.moveTo(60, 98); g.quadraticCurveTo(96, 74, 132, 98); g.stroke();
        break;
      case 'sound': { // speaker with pulsing waves
        g.fillStyle = '#8fd17a'; g.strokeStyle = '#8fd17a';
        g.beginPath(); g.moveTo(46, 52); g.lineTo(64, 52); g.lineTo(86, 34); g.lineTo(86, 94); g.lineTo(64, 76); g.lineTo(46, 76); g.fill();
        for (let i = 0; i < 3; i++) {
          g.globalAlpha = 0.3 + 0.7 * Math.max(0, Math.sin(t * 6 - i));
          g.beginPath(); g.arc(90, 64, 20 + i * 18, -0.8, 0.8); g.stroke();
        }
        g.globalAlpha = 1;
      }
    }
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 192, 1.5);
  }

  const setPulse = (p: number) => { pulse = p; };
  const showFlash = (kind: ScreenFlash, ms: number) => { flash = { kind, until: lastT + ms / 1000 }; };

  const setMood = (m: ScreenMood) => {
    screenMood = m;
    const warm = m === 'happy' || m === 'puppy';
    irisRingMat.color.set(warm ? 0xffb04a : m === 'sleep' ? 0x6a5a48 : 0xc98b4b);
    irisRingMat.emissive.set(warm ? 0x7a3a00 : 0x3a1c00);
    const lit = m === 'happy' || m === 'talking' || m === 'thinking';
    bulbMat.color.set(lit ? 0xffcf7a : 0x6b5a45);
    bulbMat.emissive.set(lit ? 0xff9a2a : 0x000000);
    const big = m === 'puppy' ? 1.35 : 1;
    for (const e of eyes) e.pupil.getObjectByName('pupil')!.scale.setScalar(big);
  };
  setMood('idle');

  // ---- per-frame pose ----
  const apply = (P: Pose3D, t: number) => {
    root.position.y = -P.y; // SVG y grows downward
    root.scale.set(P.sx, P.sy, P.sx);
    root.rotation.y = P.yaw;
    const h = Math.min(0.7, Math.max(0, P.y < 0 ? -P.y / 140 : 0));
    shadow.scale.set(58 * (1 - h), 30 * (1 - h), 1);
    (shadow.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - h);

    body.rotation.z = -P.body * D;
    head.position.set(P.hx, 118 - P.hy, 0);
    head.rotation.set(P.gy * 0.35, P.gx * 0.55, -P.head * D);
    neck.rotation.z = -P.head * 0.3 * D;

    armL.rotation.set(-Math.min(P.armL, 60) * 0.35 * D, 0, -P.armL * D);
    armR.rotation.set(-Math.min(P.armR, 60) * 0.35 * D, 0, P.armR * D);
    legL.rotation.x = P.legL * D;
    legR.rotation.x = P.legR * D;

    const eye = Math.max(0.06, Math.min(1.3, P.eye));
    eyes.forEach((e, i) => {
      e.ball.scale.set(Math.max(1, eye), eye, 1);
      e.pupil.position.x = Math.max(-5, Math.min(5, P.px * 0.7));
      e.pupil.position.y = Math.max(-4, Math.min(4, -P.py * 0.7));
      // smile lid rises with mood; base lift keeps him looking cheerful
      e.smile.position.y = -2 + P.smile * 7;
      e.smile.scale.set(1, 1 + P.smile * 0.6, 1);
      e.brow.position.y = 18 - P.browY;
      e.brow.rotation.z = (i === 0 ? -P.browL : -P.browR) * D;
    });
    drawScreen(t);
  };

  const resize = (w: number, h: number) => {
    renderer.setSize(w, h, false);
  };
  const render = () => renderer.render(scene, camera);

  const dispose = () => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      mats.forEach((mt) => { (mt as THREE.MeshStandardMaterial).map?.dispose(); mt.dispose(); });
    });
    renderer.dispose();
  };

  return { apply, setMood, setPulse, showFlash, resize, render, dispose };
}

export type SageModel = ReturnType<typeof createSageModel>;
