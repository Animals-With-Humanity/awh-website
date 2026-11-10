/*
  Pawsy v2 — the Pawse pup.
  A chibi 3D puppy (Three.js, built from code, no external model): huge glossy
  eyes, floppy ears, soft sheen fur. Walks through the whole page beside the
  cursor, does tricks on buttons, arrives differently in every section — and
  now loves being petted: click or tap him for hearts and a happy wiggle.

  Drop-in replacement for the previous pawse-pup.js: same include, same
  section ids, same toggle button, same ?pupdebug hooks.
// */

//   The canvas is small and travels with the dog, so the page underneath stays
//   fully clickable (pointer-events: none) and rendering stays cheap.
// */

const THREE_URL = "https://unpkg.com/three@0.170.0/build/three.module.js";
const STORE_KEY = "pawsePup";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const wrapPi = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const rand = (a, b) => a + Math.random() * (b - a);

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const hasWebGL = (() => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (_) { return false; }
})();

if (!reduce && hasWebGL) {
  import(THREE_URL).then(start).catch(() => {});
}

function start(THREE) {
  /* ------------------------------------------------------------------ DOM */
  const style = document.createElement("style");
  style.textContent = `
    .pup-canvas { position: fixed; left: 0; top: 0; z-index: 70; pointer-events: none; will-change: transform; }
    .pup-canvas[hidden] { display: none; }
    .pup-bubble {
      position: fixed; left: 0; top: 0; z-index: 71; pointer-events: none; opacity: 0;
      transform-origin: 50% 100%; transition: opacity .16s ease;
      font-weight: 800; font-size: 14px; line-height: 1.2; color: #1f2937; background: #fff;
      border: 2px solid #7a27a9; border-radius: 14px; padding: 6px 12px; white-space: nowrap;
      box-shadow: 0 8px 22px rgba(31, 41, 55, .2);
    }
    .pup-bubble::after {
      content: ""; position: absolute; left: 50%; bottom: -7px; width: 10px; height: 10px; background: #fff;
      border-right: 2px solid #7a27a9; border-bottom: 2px solid #7a27a9;
      transform: translateX(-50%) rotate(45deg);
    }
    .pup-bubble.on { opacity: 1; }
    .pup-heart {
      position: fixed; left: 0; top: 0; z-index: 73; pointer-events: none;
      animation: pupHeart 1.15s ease-out forwards;
    }
    @keyframes pupHeart {
      0% { transform: translate(var(--ox, 0px), var(--oy, 0px)) translate(-50%, -50%) scale(.4); opacity: 0; }
      20% { opacity: 1; }
      100% { transform: translate(calc(var(--ox, 0px) + var(--hx, 0px)), calc(var(--oy, 0px) - var(--hy, 70px))) translate(-50%, -50%) scale(1); opacity: 0; }
    }
    .pup-toggle {
      position: fixed; left: 14px; bottom: 14px; z-index: 72; width: 44px; height: 44px; border-radius: 999px;
      border: 2px solid #7a27a9; background: #fff; color: #7a27a9; display: grid; place-items: center; cursor: pointer;
      box-shadow: 0 8px 20px rgba(31, 41, 55, .22); transition: transform .15s ease, background .15s ease;
    }
    .pup-toggle:hover { transform: translateY(-2px); }
    .pup-toggle:focus-visible { outline: 3px solid #0253d1; outline-offset: 2px; }
    .pup-toggle[aria-pressed="false"] { background: #7a27a9; color: #bef521; }
    @media print { .pup-canvas, .pup-bubble, .pup-toggle { display: none !important; } }
  `;
  document.head.appendChild(style);

  const canvas = document.createElement("canvas");
  canvas.className = "pup-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const bubble = document.createElement("div");
  bubble.className = "pup-bubble";
  bubble.setAttribute("aria-hidden", "true");
  document.body.appendChild(bubble);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "pup-toggle";
  toggle.setAttribute("aria-label", "Show or hide Pawsy the pup");
  toggle.title = "Pawsy the pup";
  toggle.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><ellipse cx="5.6" cy="10.2" rx="2.1" ry="2.8"/><ellipse cx="9.8" cy="5.9" rx="2.1" ry="2.9"/><ellipse cx="14.2" cy="5.9" rx="2.1" ry="2.9"/><ellipse cx="18.4" cy="10.2" rx="2.1" ry="2.8"/><path d="M12 11.2c-3.1 0-5.9 3.4-5.9 6 0 1.9 1.4 2.9 3 2.9 1 0 1.8-.4 2.9-.4s1.9.4 2.9.4c1.6 0 3-1 3-2.9 0-2.6-2.8-6-5.9-6z"/></svg>`;
  document.body.appendChild(toggle);

  let enabled = true;
  try { enabled = localStorage.getItem(STORE_KEY) !== "off"; } catch (_) {}
  toggle.setAttribute("aria-pressed", String(enabled));

  /* ------------------------------------------------------------- renderer */
  // The canvas is 3.4 x 3.9 "dog units" wide/tall. One unit is about the dog's height.
  const VIEW_W = 3.4;
  const VIEW_H = 3.9;
  const FEET = 0.78; // feet sit 78% down the canvas, leaving room above for flips and the parachute
  const TILT = 0.3; // camera looks slightly down so the head and back read in 3D
  let S = 132; // pixels per unit

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-VIEW_W / 2, VIEW_W / 2, VIEW_H * FEET, -VIEW_H * (1 - FEET), 0.1, 40);
  camera.position.set(0, 10 * Math.sin(TILT), 10 * Math.cos(TILT));
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xfff4e8, 0x8d78c9, 1.25));
  const key = new THREE.DirectionalLight(0xfff6ec, 2.6);
  key.position.set(-2.5, 4.5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd3ff, 1.1);
  rim.position.set(3, 2.5, -3);
  scene.add(rim);

  // Shared clip plane so the pup can dig into the ground during the burrow entrance.
  const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 100);

  function resize() {
    const w = window.innerWidth;
    S = w < 640 ? 104 : w < 1280 ? 124 : 138;
    const cw = Math.round(VIEW_W * S);
    const ch = Math.round(VIEW_H * S);
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    renderer.setPixelRatio(clamp(window.devicePixelRatio || 1, 1.6, 2));
    renderer.setSize(cw, ch, false);
  }
  resize();

  /* ------------------------------------------------------------------ rig */
  const noiseTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 96;
    const g = c.getContext("2d");
    const img = g.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 120 + Math.random() * 135;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(5, 5);
    return t;
  })();

  const fur = (color, extra = {}) =>
    new THREE.MeshPhysicalMaterial({
      color, roughness: 0.8, metalness: 0, sheen: 1, sheenRoughness: 0.45,
      sheenColor: new THREE.Color(0xffe9cf), bumpMap: noiseTex, bumpScale: 0.34,
      clippingPlanes: [clip], ...extra,
    });
  const solid = (color, extra = {}) =>
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, metalness: 0, clippingPlanes: [clip], ...extra });

  const M = {
    caramel: fur(0xf0a35a),
    caramelDeep: fur(0xd08035),
    cream: fur(0xfff3e2),
    pink: solid(0xff9cb4, { roughness: 0.6 }),
    nose: solid(0x33201f, { roughness: 0.3, clearcoat: 1 }),
    eye: solid(0x231a20, { roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03 }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff, clippingPlanes: [clip] }),
    mouth: solid(0x4a2530, { roughness: 0.7 }),
    collar: solid(0xbef521, { roughness: 0.45 }),
    tag: solid(0xffd24a, { roughness: 0.25, metalness: 0.6 }),
    blush: new THREE.MeshBasicMaterial({ color: 0xff7aa5, transparent: true, opacity: 0.4, clippingPlanes: [clip] }),
  };

  const sph = (r, seg = 28) => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75));
  const mesh = (geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  };

  // Hierarchy: posG (screen position) > yawG (turn) > flipG (roll / flip pivot) > bodyG > torso
  const posG = new THREE.Group();
  const yawG = new THREE.Group();
  const flipG = new THREE.Group();
  const bodyG = new THREE.Group();
  posG.add(yawG);
  yawG.add(flipG);
  flipG.position.y = 0.4;
  flipG.add(bodyG);
  bodyG.position.y = -0.4;
  scene.add(posG);

  const TORSO = { y: 0.3, z: -0.18 };
  const torso = new THREE.Group();
  torso.position.set(0, TORSO.y, TORSO.z);
  bodyG.add(torso);
  // Place a mesh by standing-pose coordinates.
  const onTorso = (obj, x, y, z) => {
    obj.position.set(x, y - TORSO.y, z - TORSO.z);
    torso.add(obj);
    return obj;
  };

  // body: chibi pear with a deep-caramel saddle and a cream chest
  const bodyCap = mesh(new THREE.CapsuleGeometry(0.2, 0.14, 12, 28), M.caramel, 0, 0, 0, 1.06, 0.94, 1);
  bodyCap.rotation.x = Math.PI / 2;
  onTorso(bodyCap, 0, 0.36, -0.04);
  onTorso(mesh(sph(0.205), M.caramel), 0, 0.36, 0.1); // chest
  onTorso(mesh(sph(0.2), M.caramel), 0, 0.34, -0.2); // rump
  onTorso(mesh(sph(0.2), M.caramelDeep, 0, 0, 0, 0.98, 0.52, 1.5), 0, 0.46, -0.06); // saddle
  onTorso(mesh(sph(0.16), M.cream, 0, 0, 0, 0.95, 0.5, 1.9), 0, 0.2, 0.0); // belly
  onTorso(mesh(sph(0.15), M.cream, 0, 0, 0, 0.95, 1.05, 0.6), 0, 0.33, 0.22); // bib

  // collar with a gold tag
  const collar = mesh(new THREE.TorusGeometry(0.15, 0.032, 12, 40), M.collar, 0, 0, 0, 1.05, 1, 1);
  collar.rotation.x = -0.6; // ring sits square around the slanted neck
  onTorso(collar, 0, 0.5, 0.2);
  onTorso(mesh(sph(0.045, 18), M.tag, 0, 0, 0, 1, 1, 0.3), 0, 0.36, 0.32);

  // big chibi head
  const head = new THREE.Group();
  head.position.set(0, 0.68 - TORSO.y, 0.3 - TORSO.z);
  head.rotation.order = "YXZ";
  torso.add(head);
  head.add(mesh(sph(0.285, 36), M.caramel, 0, 0, 0, 1.1, 0.98, 1));
  head.add(mesh(sph(0.125), M.caramel, 0.175, -0.07, 0.05, 1, 0.92, 1)); // cheeks
  head.add(mesh(sph(0.125), M.caramel, -0.175, -0.07, 0.05, 1, 0.92, 1));
  head.add(mesh(sph(0.145), M.cream, 0, -0.075, 0.2, 1.3, 0.85, 1.05)); // muzzle
  head.add(mesh(sph(0.048, 20), M.nose, 0, -0.02, 0.325, 1.3, 0.85, 0.9)); // nose
  head.add(mesh(sph(0.045), M.cream, 0, 0.14, 0.21, 0.55, 1.15, 0.7)); // blaze
  // little smile: two arcs under the nose
  const smileCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.075, -0.085, 0.3),
    new THREE.Vector3(-0.038, -0.125, 0.312),
    new THREE.Vector3(0, -0.095, 0.325),
    new THREE.Vector3(0.038, -0.125, 0.312),
    new THREE.Vector3(0.075, -0.085, 0.3),
  ]);
  const smile = new THREE.Mesh(new THREE.TubeGeometry(smileCurve, 24, 0.0068, 8), M.mouth);
  head.add(smile);
  // open mouth (shown for barks and yawns)
  const mouthOpen = mesh(sph(0.058, 20), M.mouth, 0, -0.125, 0.3, 1.5, 0.55, 0.45);
  mouthOpen.scale.y = 0.001;
  head.add(mouthOpen);
  const tongue = new THREE.Group();
  tongue.position.set(0, -0.135, 0.29);
  tongue.add(mesh(sph(0.042, 16), M.pink, 0, -0.012, 0.02, 0.9, 0.38, 1.7));
  tongue.scale.set(1, 0.001, 1);
  head.add(tongue);

  // huge glossy eyes with three shines each
  const eyes = [];
  [-1, 1].forEach((side) => {
    const g = new THREE.Group();
    g.position.set(side * 0.112, 0.055, 0.225);
    g.add(mesh(sph(0.057, 24), M.eye, 0, 0, 0, 1, 1.15, 0.72));
    g.add(mesh(sph(0.02, 12), M.shine, side * -0.014, 0.028, 0.036));
    g.add(mesh(sph(0.009, 10), M.shine, side * 0.016, -0.016, 0.038));
    g.add(mesh(sph(0.006, 10), M.shine, side * 0.012, 0.038, 0.02));
    head.add(g);
    eyes.push(g);
    head.add(mesh(sph(0.032, 16), M.cream, side * 0.105, 0.13, 0.205, 1.35, 0.7, 0.7)); // brow spot
    const blush = mesh(sph(0.038, 16), M.blush, side * 0.19, -0.045, 0.165, 1, 0.7, 0.35);
    blush.rotation.y = side * 0.7;
    head.add(blush);
  });

  // big floppy ears that hang down past the cheeks
  const ears = [];
  [-1, 1].forEach((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.2, 0.22, -0.01);
    pivot.rotation.order = "ZXY";
    const outer = mesh(new THREE.CapsuleGeometry(0.078, 0.16, 8, 20), M.caramelDeep, side * 0.05, -0.09, 0, 1, 1, 0.62);
    outer.rotation.z = side * 0.55;
    const inner = mesh(new THREE.CapsuleGeometry(0.05, 0.1, 8, 16), M.pink, side * 0.06, -0.1, 0.036, 1, 1, 0.5);
    inner.rotation.z = side * 0.55;
    pivot.add(outer, inner);
    head.add(pivot);
    ears.push(pivot);
  });

  // tail: a curl over the back with a cream tip
  const tail = new THREE.Group();
  tail.rotation.order = "YXZ";
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.08, -0.06),
    new THREE.Vector3(0, 0.18, -0.075),
    new THREE.Vector3(0, 0.26, -0.03),
    new THREE.Vector3(0, 0.285, 0.05),
    new THREE.Vector3(0, 0.245, 0.11),
  ]);
  tail.add(new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 28, 0.05, 12), M.caramel));
  tail.add(mesh(sph(0.058, 16), M.cream, 0, 0.245, 0.11));
  onTorso(tail, 0, 0.44, -0.33);

  // stubby legs with big cream paws
  function makeLeg(front, side) {
    const g = new THREE.Group();
    g.rotation.order = "XZY";
    g.add(mesh(new THREE.CapsuleGeometry(front ? 0.058 : 0.064, 0.1, 8, 16), M.caramel, 0, -0.09, 0));
    g.add(mesh(sph(0.078, 20), M.cream, 0, -0.2, 0.03, 1, 0.75, 1.25));
    g.position.set(side * (front ? 0.105 : 0.12), -0.02, (front ? 0.16 : -0.2) - TORSO.z);
    torso.add(g);
    return g;
  }
  const legs = { fl: makeLeg(true, -1), fr: makeLeg(true, 1), bl: makeLeg(false, -1), br: makeLeg(false, 1) };

  // soft contact shadow on the ground (appears as an ellipse because the camera looks down)
  const shadowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, "rgba(20,8,36,0.55)");
    grad.addColorStop(0.6, "rgba(20,8,36,0.22)");
    grad.addColorStop(1, "rgba(20,8,36,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.25, 1.25),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.003;
  posG.add(shadow);

  /* ---- section entrance props: parachute, burrow, dust ---- */
  const chute = new THREE.Group();
  chute.visible = false;
  posG.add(chute);
  {
    const stripe = [0xbef521, 0xf00281, 0x7a27a9, 0xff7d22, 0x0253d1, 0xfd66c4];
    const n = stripe.length;
    for (let i = 0; i < n; i++) {
      const geo = new THREE.SphereGeometry(0.72, 8, 10, (i / n) * TAU, TAU / n, 0, Math.PI * 0.5);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: stripe[i], roughness: 0.6, side: THREE.DoubleSide }));
      m.scale.y = 0.62;
      chute.add(m);
    }
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    [[0.72, 0], [-0.72, 0], [0, 0.72], [0, -0.72]].forEach(([x, z]) => {
      const pts = [new THREE.Vector3(x, 0, z), new THREE.Vector3(x * 0.08, -1.12, z * 0.08)];
      chute.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    });
    chute.position.y = 1.78;
  }

  const hole = new THREE.Group();
  hole.visible = false;
  posG.add(hole);
  {
    const pit = new THREE.Mesh(new THREE.CircleGeometry(0.4, 32), new THREE.MeshBasicMaterial({ color: 0x2a1620 }));
    pit.rotation.x = -Math.PI / 2;
    pit.position.y = 0.004;
    hole.add(pit);
    const dirt = new THREE.MeshStandardMaterial({ color: 0x7a4a2e, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + rand(-0.2, 0.2);
      const r = 0.43 + rand(-0.03, 0.05);
      hole.add(mesh(sph(rand(0.07, 0.11), 10), dirt, Math.cos(a) * r, 0.03, Math.sin(a) * r, 1, 0.6, 1));
    }
  }

  const dustGroup = new THREE.Group();
  scene.add(dustGroup);
  const dust = [];
  const dustMatCream = new THREE.MeshBasicMaterial({ color: 0xf3ecfb, transparent: true, opacity: 0.7, depthWrite: false });
  const dustMatDirt = new THREE.MeshBasicMaterial({ color: 0x8a5a3a, transparent: true, opacity: 0.9, depthWrite: false });
  function puff(x, y, z, kind = "cream", n = 4, power = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(sph(rand(0.03, 0.06), 8), (kind === "dirt" ? dustMatDirt : dustMatCream).clone());
      m.position.set(x + rand(-0.06, 0.06), y, z + rand(-0.06, 0.06));
      dustGroup.add(m);
      dust.push({
        m, life: 0, max: rand(0.45, 0.8),
        vx: rand(-0.7, 0.7) * power, vy: rand(0.6, 1.5) * power, vz: rand(-0.3, 0.5) * power,
        grav: kind === "dirt" ? 3.2 : 0.2,
      });
    }
  }
  function clearDust() {
    while (dust.length) { const d = dust.pop(); dustGroup.remove(d.m); d.m.material.dispose(); d.m.geometry.dispose(); }
  }

  /* --------------------------------------------------------- pose + state */
  // P = smoothed pose, T = pose target, O = per-frame overlays written by gait / tricks.
  const P = { rootY: 0, torso: 0, fl: 0, fr: 0, bl: 0, br: 0, flZ: 0, frZ: 0, headP: 0, headY: 0, headR: 0, earSpread: 0, earBack: 0, tailLift: 0, tailAmp: 0.35, tongue: 0, mouth: 0, eyes: 1 };
  const T = { ...P };
  const O = {};
  const resetO = () => Object.assign(O, { hopY: 0, flipX: 0, rollZ: 0, spinY: 0, torso: 0, fl: 0, fr: 0, bl: 0, br: 0, headP: 0, headY: 0, headR: 0, sink: 0, sqImpulse: 0 });
  resetO();

  const REST = {
    stand: { rootY: 0, torso: 0, fl: 0, fr: 0, bl: 0, br: 0, flZ: 0, frZ: 0, headP: 0, headY: 0, headR: 0, tailLift: 0 },
    sit: { rootY: -0.17, torso: -0.66, fl: 0, fr: 0, bl: -1.45, br: -1.45, flZ: 0, frZ: 0, headP: 0.1, headY: 0, headR: 0, tailLift: -0.15 },
    down: { rootY: -0.2, torso: -0.12, fl: -1.5, fr: -1.5, bl: -1.2, br: -1.2, flZ: 0.22, frZ: -0.22, headP: 0.05, headY: 0, headR: 0, tailLift: -0.3 },
  };

  const W = () => window.innerWidth;
  const H = () => window.innerHeight;

  const st = {
    x: 0, y: 0, vx: 0, vy: 0,
    yaw: 0, yawT: 0,
    rest: "stand",
    free: false, // true while a scripted entrance may leave the screen
    phase: 0, gallop: 0, amp: 0,
    sq: 0, sqv: 0,
    idle: 0, // seconds stationary
    trick: null, script: null,
    lastTrick: "",
    blink: 0, blinkIn: rand(1.5, 3.5), earTwitch: 0, earIn: rand(2, 5), microIn: rand(3.5, 6), micro: null,
    sleeping: false,
    bubbleUntil: 0, bubblePulse: 0,
    now: 0,
    hover: null, hoverSince: 0, hoverReady: false, hoverTrickAt: 0,
    petCount: 0, loveUntil: 0,
  };
  st.x = W() - S * 1.3;
  st.y = H() - 10;

  const cursor = { x: W() * 0.6, y: H() * 0.5, seen: false, moved: 0, down: 0 };

  const homeSpot = () => ({ x: W() - S * 1.3, y: H() - 10 });
  function followGoal() {
    if (!cursor.seen) return homeSpot();
    const side = cursor.x > S * 1.4 ? -1 : 1;
    return { x: cursor.x + side * S * 0.72, y: cursor.y + S * 0.62 };
  }
  function clampGoal(g) {
    return { x: clamp(g.x, S * 0.45, W() - S * 0.45), y: clamp(g.y, S * 1.08, H() - 8) };
  }

  /* ---------------------------------------------------------------- speech */
  function say(text, ms = 1900) {
    bubble.textContent = text;
    bubble.classList.add("on");
    st.bubbleUntil = st.now + ms / 1000;
    st.bubblePulse = 1;
  }

  /* --------------------------------------------------------------- petting */
  const HEARTS = ["💗", "💖", "🐾", "✨"];
  const PET_LINES = ["Hehe, that tickles!", "More pets, please!", "Happy puppy noises!", "You're the best!", "*happy wiggle*"];
  function spawnHearts() {
    for (let i = 0; i < 6; i++) {
      const h = document.createElement("span");
      h.className = "pup-heart";
      h.textContent = HEARTS[Math.floor(Math.random() * HEARTS.length)];
      h.style.setProperty("--ox", Math.round(st.x + rand(-S * 0.4, S * 0.4)) + "px");
      h.style.setProperty("--oy", Math.round(st.y - S * 0.85 + rand(-S * 0.25, S * 0.2)) + "px");
      h.style.setProperty("--hx", Math.round(rand(-46, 46)) + "px");
      h.style.setProperty("--hy", Math.round(rand(52, 96)) + "px");
      h.style.fontSize = Math.round(rand(14, 22)) + "px";
      document.body.appendChild(h);
      window.setTimeout(() => h.remove(), 1250);
    }
  }
  function pet() {
    st.petCount++;
    st.loveUntil = st.now + 6;
    st.sq = 0.16;
    st.sqv = -1.2;
    spawnHearts();
    const bonus = st.petCount % 4 === 0;
    if (bonus) say("Okay okay — bonus trick!", 900);
    else say(PET_LINES[Math.floor(Math.random() * PET_LINES.length)], 1800);
    startTrick(bonus ? pickHoverTrick() : "petwag");
  }

  /* ---------------------------------------------------------------- tricks */
  // Each trick: lead-in settles the rest pose, then run(u, t) writes targets / overlays for u in 0..1.
  const LEAD = 0.42;
  const TRICKS = {
    shake: {
      rest: "sit", face: "front", dur: 2.1, say: "Shake on it!",
      run(u, t) {
        const up = easeInOut(clamp(u / 0.18, 0, 1)) * (1 - easeInOut(clamp((u - 0.86) / 0.14, 0, 1)));
        T.fr = lerp(0, -1.15, up) + Math.sin(t * 15) * 0.2 * up;
        T.frZ = -0.2 * up;
        T.headR = 0.2 * up;
        T.tongue = 0.7;
        T.tailAmp = 1;
        T.earSpread = 0.12;
      },
    },
    spin: {
      rest: "stand", face: "front", dur: 0.95, say: "Wheee!",
      run(u, t) {
        O.spinY = TAU * easeInOut(u);
        O.hopY = Math.sin(u * Math.PI) * 0.16;
        const s = Math.sin(t * 20);
        O.fl = s * 0.5; O.br = s * 0.5; O.fr = -s * 0.5; O.bl = -s * 0.5;
        T.tongue = 0.8; T.tailAmp = 1; T.earBack = 0.3;
      },
    },
    roll: {
      rest: "down", face: "side", dur: 1.7, say: "Rollin'!",
      run(u, t) {
        const a = clamp((u - 0.15) / 0.7, 0, 1);
        O.rollZ = -TAU * easeInOut(a);
        const belly = Math.sin(a * Math.PI);
        T.fl = -1.5 + belly * 1.2 + Math.sin(t * 14) * 0.25 * belly;
        T.fr = -1.5 + belly * 1.2 - Math.sin(t * 14) * 0.25 * belly;
        T.bl = -1.2 + belly * 0.9;
        T.br = -1.2 + belly * 0.9;
        T.tongue = 0.8; T.tailAmp = 1;
      },
    },
    dead: {
      rest: "stand", face: "side", dur: 2.7, say: "x_x",
      run(u) {
        const fall = easeOut(clamp(u / 0.16, 0, 1));
        const rise = easeInOut(clamp((u - 0.82) / 0.18, 0, 1));
        const k = fall * (1 - rise);
        O.rollZ = -1.5 * k;
        T.rootY = -0.2 * k;
        T.fl = -0.55 * k; T.fr = -0.55 * k; T.bl = 0.35 * k; T.br = 0.35 * k;
        T.tongue = 1 * k;
        T.eyes = 1 - k;
        T.tailAmp = 0.05;
        T.earBack = 0.5 * k;
        if (u > 0.82) { O.hopY = Math.sin(clamp((u - 0.82) / 0.18, 0, 1) * Math.PI) * 0.22; T.tongue = 0.4; T.tailAmp = 1; }
      },
    },
    beg: {
      rest: "sit", face: "front", dur: 2.4, say: "Pretty please?",
      run(u, t) {
        const up = easeInOut(clamp(u / 0.2, 0, 1)) * (1 - easeInOut(clamp((u - 0.88) / 0.12, 0, 1)));
        T.torso = lerp(REST.sit.torso, -1.2, up);
        T.fl = -1.2 * up + Math.sin(t * 9) * 0.1 * up;
        T.fr = -1.2 * up - Math.sin(t * 9) * 0.1 * up;
        T.flZ = lerp(0, 0.35, up); T.frZ = lerp(0, -0.35, up);
        T.headP = lerp(0.1, -0.35, up);
        T.headR = Math.sin(t * 3) * 0.14 * up;
        T.tongue = 0.35; T.tailAmp = 0.9; T.earSpread = 0.1;
      },
    },
    flip: {
      rest: "stand", face: "side", dur: 1.15, say: "Ta-da!",
      run(u) {
        const crouch = clamp(u / 0.18, 0, 1);
        const air = clamp((u - 0.18) / 0.72, 0, 1);
        T.rootY = -0.07 * Math.sin(crouch * Math.PI);
        O.hopY = Math.sin(air * Math.PI) * 1.05;
        O.flipX = -TAU * easeInOut(air);
        T.fl = -0.8 * Math.sin(air * Math.PI); T.fr = T.fl; T.bl = -0.9 * Math.sin(air * Math.PI); T.br = T.bl;
        T.tongue = 0.7; T.tailAmp = 1; T.earBack = 0.35;
        if (u >= 0.9 && !this.landed) { this.landed = true; landing(); }
        if (u < 0.1) this.landed = false;
      },
    },
    bow: {
      rest: "stand", face: "side", dur: 1.9, say: "At your service!",
      run(u, t) {
        const k = easeInOut(clamp(u / 0.2, 0, 1)) * (1 - easeInOut(clamp((u - 0.82) / 0.18, 0, 1)));
        T.torso = 0.5 * k;
        T.fl = -0.75 * k; T.fr = -0.75 * k;
        T.headP = 0.25 * k;
        T.tailLift = 0.5 * k; T.tailAmp = 1; T.tongue = 0.5 * k;
        T.earSpread = 0.1 * k;
        O.hopY = 0.01 * Math.sin(t * 20);
      },
    },
    bark: {
      rest: "sit", face: "front", dur: 1.45, say: "WOOF! WOOF!",
      run(u) {
        const b = (c) => Math.max(0, Math.sin(clamp((u - c) / 0.2, 0, 1) * Math.PI));
        const k = Math.max(b(0.05), b(0.45));
        T.mouth = k; T.headP = -0.3 * k; T.earBack = 0.35 * k;
        O.hopY = 0.07 * k;
        T.tailAmp = 1;
        if (k > 0.9 && !this.said) { this.said = true; st.bubblePulse = 1; }
        if (k < 0.1) this.said = false;
      },
    },
    hop: {
      rest: null, face: null, dur: 0.55, say: "", lead: 0,
      run(u) {
        O.hopY = Math.sin(u * Math.PI) * 0.34;
        T.tailAmp = 1; T.tongue = 0.6;
        if (u > 0.92 && !this.landed) { this.landed = true; landing(); }
        if (u < 0.05) this.landed = false;
      },
    },
  };
  const HOVER_TRICKS = ["shake", "spin", "roll", "dead", "beg", "flip", "bow", "bark"];

  // a quick happy wiggle for petting
  TRICKS.petwag = {
    rest: null, face: null, dur: 0.5, lead: 0, say: "",
    run(u) {
      O.hopY = Math.sin(u * Math.PI) * 0.2;
      T.tailAmp = 1;
      O.headY = Math.sin(u * Math.PI * 4) * 0.3;
    },
  };

  function landing(power = 1) {
    st.sq = 0.2 * power;
    st.sqv = 0;
    puff(0, 0.03, 0.05, "cream", 5, 0.8);
  }

  function startTrick(name) {
    const def = TRICKS[name];
    if (!def) return;
    st.trick = { name, def, t: 0 };
    st.lastTrick = name;
    st.micro = null;
    if (def.rest) st.rest = def.rest;
    if (def.face === "front") st.yawT = 0;
    if (def.face === "side") st.yawT = (cursor.x >= st.x ? 1 : -1) * Math.PI / 2;
    if (def.say) say(def.say, def.dur * 1000 + 500);
  }

  function pickHoverTrick() {
    const pool = HOVER_TRICKS.filter((n) => n !== st.lastTrick);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* -------------------------------------------------------------- movement */
  function moveToward(g, dt, mul = 1, clampIt = true) {
    const goal = clampIt ? clampGoal(g) : g;
    const dx = goal.x - st.x;
    const dy = goal.y - st.y;
    const dist = Math.hypot(dx, dy);
    const vmax = S * 4.2 * mul;
    let want = Math.min(vmax, dist * 4.6);
    if (dist < 9) want = 0;
    const ux = dist > 0 ? dx / dist : 0;
    const uy = dist > 0 ? dy / dist : 0;
    const k = 1 - Math.exp(-9 * dt);
    st.vx += (ux * want - st.vx) * k;
    st.vy += (uy * want - st.vy) * k;
    st.x += st.vx * dt;
    st.y += st.vy * dt;
    if (clampIt && !st.free) {
      st.x = clamp(st.x, S * 0.4, W() - S * 0.4);
      st.y = clamp(st.y, S * 1.0, H() - 4);
    }
    return dist;
  }

  const speed = () => Math.hypot(st.vx, st.vy);

  /* ------------------------------------------------------ hover detection */
  const INTERACTIVE = 'a[href], button, [role="button"], [role="tab"], summary, input[type="submit"]';
  function interactiveAt(el) {
    if (!el || !el.closest) return null;
    const hit = el.closest(INTERACTIVE);
    if (!hit || hit === toggle || toggle.contains(hit)) return null;
    if (hit.hasAttribute("data-friend") || hit.classList.contains("fr-toggle")) return null; // Sprout / Mitra controls
    const r = hit.getBoundingClientRect();
    if (r.width < 56 || r.height < 28) return null;
    return hit;
  }

  function setHover(el) {
    if (el === st.hover) return;
    st.hover = el;
    st.hoverSince = st.now;
    st.hoverReady = false;
    if (!el && st.trick && st.trick.name !== "hop" && st.trick.t < LEAD * 0.9) st.trick = null;
  }

  function hoverSpot(el) {
    const r = el.getBoundingClientRect();
    const cx = clamp(r.left + r.width / 2, S * 0.45, W() - S * 0.45);
    const roomBelow = H() - (r.bottom + 6);
    if (roomBelow >= S * 1.08) return { x: cx, y: r.bottom + S * 1.05 };
    return { x: cx, y: r.top + 6 }; // stands on top of the button
  }

  /* ------------------------------------------------------- section changes */
  const SECTIONS = [...document.querySelectorAll("main > header, main > section, footer")];
  const SECTION_PLAN = {
    top: { type: "chute", say: "Woof! I'm Pawsy. Welcome to Pawse!" },
    experience: { type: "zoom", say: "So much to sniff!" },
    everyone: { type: "leap", say: "Room for every paw!" },
    glimpses: { type: "burrow", say: "Say cheese!" },
    editions: { type: "chute", say: "Two editions, one walk!" },
    impact: { type: "zoom", say: "Big names, big hearts" },
    sponsors: { type: "leap", say: "Thank you, partners!" },
    media: { type: "burrow", say: "Barking in the news!" },
    join: { type: "chute", say: "Come on in!" },
    desk: { type: "zoom", say: "Pick a form. I'll wait." },
  };
  const TYPES = ["chute", "zoom", "leap", "burrow"];
  let currentSection = null;
  let pendingSection = null;
  let sectionTimer = 0;

  const sectionId = (el) => el.id || (el.tagName === "HEADER" ? "top" : el.tagName === "FOOTER" ? "footer" : "");
  function sectionAtMiddle() {
    const y = H() * 0.5;
    for (const el of SECTIONS) {
      const r = el.getBoundingClientRect();
      if (r.top <= y && r.bottom > y) return el;
    }
    return null;
  }
  function watchSections() {
    window.clearTimeout(sectionTimer);
    sectionTimer = window.setTimeout(() => {
      const el = sectionAtMiddle();
      if (!el || el === currentSection) return;
      const first = currentSection === null;
      currentSection = el;
      if (first) return;
      pendingSection = el;
    }, 380);
  }
  window.addEventListener("scroll", watchSections, { passive: true });

  function planFor(el) {
    const id = sectionId(el);
    if (SECTION_PLAN[id]) return SECTION_PLAN[id];
    const idx = Math.max(0, SECTIONS.indexOf(el));
    return { type: TYPES[idx % TYPES.length], say: id === "footer" ? "That's a wrap. Woof!" : "Onwards!" };
  }

  /* ------------------------------------------------------------- scripts */
  function beginScript(type, line) {
    st.trick = null;
    st.micro = null;
    st.sleeping = false;
    st.rest = "stand";
    resetOverlayStateForScript();
    const goal = clampGoal(followGoal());
    if (type === "chute") {
      st.free = true;
      st.x = goal.x;
      st.y = -S * 2.4;
      st.vx = st.vy = 0;
      chute.visible = true;
      chute.scale.set(1, 1, 1);
      st.script = { type, t: 0, line, phase: "fall" };
    } else if (type === "leap") {
      st.free = true;
      const sx = clamp(goal.x + (Math.random() < 0.5 ? -1 : 1) * S * 2.6, -S, W() + S);
      st.script = { type, t: 0, line, dur: 1.3, sx, sy: H() + S * 1.3 };
      st.x = sx; st.y = st.script.sy;
      st.vx = st.vy = 0;
    } else if (type === "zoom") {
      st.free = true;
      const w = W(), h = H();
      st.script = {
        type, t: 0, line, i: 0, dustT: 0,
        pts: [
          { x: w * 0.1, y: h - S * 0.2 },
          { x: w * 0.9, y: h * 0.5 },
          { x: w * 0.18, y: h * 0.72 },
          null,
        ],
      };
    } else if (type === "burrow") {
      st.free = false;
      st.script = { type, t: 0, line, stage: 0, dirtT: 0 };
      st.yawT = (cursor.x >= st.x ? 1 : -1) * Math.PI / 2;
      hole.visible = true;
      hole.scale.setScalar(0.001);
      clip.constant = 0;
    }
  }
  function resetOverlayStateForScript() { st.sq = 0; st.sqv = 0; }

  function endScript() {
    const s = st.script;
    st.script = null;
    st.free = false;
    st.rest = "sit";
    chute.visible = false;
    hole.visible = false;
    clip.constant = 100;
    if (s && s.line) say(s.line, 2600);
  }

  function updateScript(dt) {
    const s = st.script;
    s.t += dt;
    const goal = clampGoal(followGoal());

    if (s.type === "chute") {
      if (s.phase === "fall") {
        const dist = goal.y - st.y;
        const vy = clamp(dist * 0.85, 130, 460);
        st.y += vy * dt;
        st.x += (goal.x - st.x) * (1 - Math.exp(-2.6 * dt)) + Math.cos(s.t * 2.1) * 26 * dt;
        st.vx = st.vy = 0;
        const sway = Math.sin(s.t * 2.1);
        chute.rotation.z = sway * 0.12;
        T.fl = 0.35 + Math.sin(s.t * 3) * 0.12; T.fr = 0.35 - Math.sin(s.t * 3) * 0.12;
        T.bl = -0.25 + Math.sin(s.t * 3.4) * 0.1; T.br = -0.25 - Math.sin(s.t * 3.4) * 0.1;
        T.headP = -0.15; T.earSpread = 0.15; T.earBack = -0.2; T.tailAmp = 0.8; T.tongue = 0.5;
        st.yawT = sway * 0.6;
        if (dist < 5) { s.phase = "land"; s.lt = 0; landing(1.1); }
      } else {
        s.lt += dt;
        const k = clamp(s.lt / 0.4, 0, 1);
        chute.scale.set(1 + 0.25 * k, Math.max(0.001, 1 - k), 1 + 0.25 * k);
        chute.position.y = 1.78 - k * 0.8;
        T.tailAmp = 1;
        if (k >= 1) { chute.position.y = 1.78; endScript(); }
      }
    } else if (s.type === "leap") {
      const u = clamp(s.t / s.dur, 0, 1);
      const e = easeInOut(u);
      st.x = lerp(s.sx, goal.x, e);
      st.y = lerp(s.sy, goal.y, e) - Math.sin(u * Math.PI) * S * 2.7;
      st.vx = st.vy = 0;
      st.yawT = (goal.x >= s.sx ? 1 : -1) * Math.PI / 2;
      const air = clamp((u - 0.1) / 0.74, 0, 1);
      O.flipX = -TAU * easeInOut(air);
      T.fl = T.fr = -0.8; T.bl = T.br = -0.9; T.tongue = 0.8; T.earBack = 0.4; T.tailAmp = 1;
      if (u >= 1) { landing(1.2); endScript(); }
    } else if (s.type === "zoom") {
      const target = s.pts[s.i] || goal;
      const free = !!s.pts[s.i];
      const dist = moveToward(target, dt, 1.9, !free);
      T.earBack = 0.5; T.tongue = 0.9; T.tailAmp = 1;
      if (speed() > S * 0.35) st.yawT = Math.atan2(st.vx, st.vy * 0.9 + 0.001);
      s.dustT -= dt;
      if (speed() > S * 3 && s.dustT <= 0) { s.dustT = 0.06; puff(0, 0.03, 0, "cream", 2, 0.6); }
      if (dist < (free ? 46 : 12)) {
        if (!free && speed() < S * 0.6) { puff(0, 0.03, 0.1, "cream", 6, 1); landing(0.7); endScript(); }
        else if (free) s.i += 1;
      }
      if (s.t > 7) endScript();
    } else if (s.type === "burrow") {
      st.vx = st.vy = 0;
      if (s.stage === 0) {
        const u = clamp(s.t / 1.15, 0, 1);
        hole.scale.setScalar(Math.max(0.001, easeOut(clamp(s.t / 0.35, 0, 1))));
        const dig = Math.sin(s.t * 17);
        T.torso = 0.38; T.headP = 0.35;
        T.fl = -0.5 + dig * 0.9; T.fr = -0.5 - dig * 0.9; T.bl = 0; T.br = 0;
        T.tailAmp = 1; T.tailLift = 0.4; T.earBack = 0.25;
        s.dirtT -= dt;
        if (s.dirtT <= 0) { s.dirtT = 0.05; puff((st.yawT > 0 ? 0.25 : -0.25), 0.12, 0.05, "dirt", 2, 1.1); }
        if (u >= 1) { s.stage = 1; s.t = 0; }
      } else if (s.stage === 1) {
        const u = clamp(s.t / 0.55, 0, 1);
        O.sink = -1.12 * easeInOut(u);
        T.torso = 0.1; T.headP = 0.2; T.earBack = 0.4;
        if (u >= 1) { s.stage = 2; s.t = 0; puff(0, 0.03, 0, "dirt", 5, 1); }
      } else if (s.stage === 2) {
        O.sink = -1.12;
        hole.scale.setScalar(Math.max(0.001, 1 - easeInOut(clamp(s.t / 0.2, 0, 1))));
        if (s.t >= 0.28) {
          clearDust();
          st.x = goal.x; st.y = goal.y;
          s.stage = 3; s.t = 0;
          hole.scale.setScalar(0.001);
        }
      } else {
        const u = clamp(s.t / 0.95, 0, 1);
        hole.scale.setScalar(Math.max(0.001, u < 0.12 ? easeOut(u / 0.12) : 1 - easeInOut(clamp((u - 0.5) / 0.5, 0, 1))));
        if (u < 0.5) O.sink = -1.12 + (0.78 + 1.12) * Math.sin((u / 0.5) * Math.PI / 2);
        else O.sink = 0.78 * Math.cos(((u - 0.5) / 0.5) * Math.PI / 2);
        T.fl = T.fr = -0.5; T.bl = T.br = -0.4; T.tongue = 0.8; T.tailAmp = 1;
        st.yawT = 0;
        if (!s.popped && u > 0.02) { s.popped = true; puff(0, 0.03, 0, "dirt", 8, 1.2); }
        if (u >= 1) { landing(1.2); endScript(); }
      }
    }
  }

  /* ----------------------------------------------------------- main update */
  function setRestTargets(rest) {
    const r = REST[rest] || REST.stand;
    Object.assign(T, r);
  }

  function update(dt, now) {
    st.now = now;
    resetO();

    // hover readiness
    if (st.hover && !st.hoverReady && now - st.hoverSince > 0.18) st.hoverReady = true;

    // base targets for this frame
    const base = {
      earSpread: 0, earBack: 0, tailAmp: 0.35, tongue: 0, mouth: 0, eyes: 1,
    };
    setRestTargets(st.rest);
    Object.assign(T, base);
    // freshly petted: wag hard and pant a little while following
    if (now < st.loveUntil) { T.tailAmp = 1; T.tongue = Math.max(T.tongue, 0.45); }

    // wake up
    const cursorIdle = now - cursor.moved;
    if (st.sleeping && cursorIdle < 0.5 && !st.script) {
      st.sleeping = false;
      st.rest = "stand";
      startTrick("hop");
      T.eyes = 1;
    }

    if (st.script) {
      // scripted sections override following
      updateScript(dt);
      if (!st.script) st.free = false;
    } else if (pendingSection && !st.trick) {
      const plan = planFor(pendingSection);
      pendingSection = null;
      beginScript(plan.type, plan.say);
    } else {
      // follow cursor or visit a hovered button
      let goal = followGoal();
      let atHover = false;
      if (st.hover && st.hoverReady && document.contains(st.hover)) goal = hoverSpot(st.hover);
      if (st.hover && !document.contains(st.hover)) st.hover = null;

      if (!st.trick) {
        const dist = moveToward(goal, dt, now < st.loveUntil ? 1.4 : 1);
        atHover = !!(st.hover && st.hoverReady) && dist < 22;
        const sp = speed();
        if (sp > S * 0.25) {
          st.idle = 0;
          st.rest = "stand";
          st.micro = null;
          if (sp > S * 0.35) st.yawT = Math.atan2(st.vx, st.vy * 0.9 + 0.001);
        } else {
          st.vx *= 0.8; st.vy *= 0.8;
          st.idle += dt;
          if (st.idle > 0.4) st.rest = cursorIdle > 16 ? "down" : "sit";
          // face the cursor side a little while resting
          const lean = clamp((cursor.x - st.x) / (W() * 0.5), -1, 1);
          if (st.rest !== "down") st.yawT = lean * 0.55;
          if (cursorIdle > 28 && !st.sleeping && st.rest === "down") { st.sleeping = true; say("Zzz...", 2400); }
        }
        if (atHover && st.idle > 0.3 && now > st.hoverTrickAt) {
          startTrick(pickHoverTrick());
          st.hoverTrickAt = now + 6;
        }
      } else {
        st.vx *= 0.7; st.vy *= 0.7;
      }

      // trick timeline
      if (st.trick) {
        const tk = st.trick;
        const lead = tk.def.lead ?? LEAD;
        tk.t += dt;
        if (tk.t >= lead) {
          const u = clamp((tk.t - lead) / tk.def.dur, 0, 1);
          tk.def.run(u, tk.t);
          if (u >= 1) {
            if (tk.name !== "hop" && tk.def.rest) st.rest = "sit";
            st.trick = null;
            st.idle = 0.45;
          }
        } else if (tk.def.rest) {
          setRestTargets(tk.def.rest);
        }
      }
    }

    // sleeping / resting extras
    if (st.sleeping) { T.eyes = 0; T.headP = 0.28; T.tailAmp = 0.05; }
    else if (st.rest === "sit" && !st.trick && !st.script) {
      st.microIn -= dt;
      if (st.microIn <= 0 && !st.micro) {
        const kinds = ["tilt", "yawn", "look", "pant", "paw"];
        st.micro = { kind: kinds[Math.floor(Math.random() * kinds.length)], t: 0 };
        st.microIn = rand(3.5, 7);
      }
      if (st.micro) {
        const m = st.micro;
        m.t += dt;
        const dur = m.kind === "yawn" ? 2.2 : 1.8;
        const k = Math.sin(clamp(m.t / dur, 0, 1) * Math.PI);
        if (m.kind === "tilt") T.headR = 0.38 * k;
        if (m.kind === "yawn") { T.mouth = 1 * k; T.headP = -0.3 * k; T.eyes = 1 - 0.95 * k; T.tongue = 0.6 * k; }
        if (m.kind === "look") T.headY = Math.sin(m.t * 3.2) * 0.5 * k;
        if (m.kind === "pant") { T.tongue = 0.9 * k; T.mouth = 0.18 * k + Math.sin(m.t * 14) * 0.05 * k; }
        if (m.kind === "paw") { T.fr = -0.95 * k; T.frZ = -0.45 * k; T.headR = -0.14 * k; T.tailAmp = 1; }
        if (m.t >= dur) st.micro = null;
      }
    } else if (!st.trick && !st.script && speed() > S * 0.25) {
      T.tongue = Math.max(T.tongue, clamp(speed() / (S * 3), 0, 0.85));
    }

    // gait
    const sp = speed();
    const moving = sp > S * 0.25 && !st.script?.noGait;
    const targetAmp = moving ? clamp(sp / (S * 3.2), 0.28, 1) : 0;
    st.amp = damp(st.amp, targetAmp, 10, dt);
    st.gallop = damp(st.gallop, sp > S * 2.4 ? 1 : 0, 6, dt);
    if (moving) st.phase += dt * Math.min(sp / (S * 0.5), 6) * Math.PI;
    const ph = st.phase;
    const swing = 0.72 + st.gallop * 0.25;
    const trotA = Math.sin(ph) * swing * st.amp;
    const trotB = Math.sin(ph + Math.PI) * swing * st.amp;
    const galF = Math.sin(ph) * swing * st.amp;
    const galB = Math.sin(ph + 1.6) * swing * st.amp;
    const gl = st.gallop;
    if (st.amp > 0.02 && !st.script?.noGait) {
      O.fl += lerp(trotA, galF, gl);
      O.br += lerp(trotA, galB, gl);
      O.fr += lerp(trotB, galF, gl);
      O.bl += lerp(trotB, galB, gl);
      O.hopY += lerp(Math.abs(Math.cos(ph)) * 0.045, Math.abs(Math.sin(ph)) * 0.09, gl) * st.amp;
      O.torso += Math.sin(ph * (gl > 0.5 ? 1 : 2)) * 0.05 * st.amp * (1 + gl) + 0.04 * gl;
      T.tailAmp = Math.max(T.tailAmp, 0.6);
      T.earBack = Math.max(T.earBack, 0.15 + gl * 0.35);
    }

    // look at the cursor with the head
    if (!st.trick && !st.sleeping && !st.script && st.rest !== "down") {
      const hx = st.x;
      const hy = st.y - S * 0.85;
      const dxc = cursor.x - hx;
      const dyc = cursor.y - hy;
      const worldYaw = clamp(Math.atan2(dxc, 330), -1.2, 1.2);
      const rel = clamp(wrapPi(worldYaw - st.yaw), -0.9, 0.9);
      O.headY += rel * (st.rest === "sit" ? 0.9 : 0.35);
      O.headP += clamp(Math.atan2(dyc, 340), -0.4, 0.3) * (st.rest === "sit" ? 0.8 : 0.4) * (cursor.seen ? 1 : 0);
    }

    // smooth pose toward targets
    const rate = st.trick && st.trick.t > (st.trick.def.lead ?? LEAD) ? 16 : 9;
    for (const key of Object.keys(P)) P[key] = damp(P[key], T[key], key === "eyes" ? 22 : rate, dt);

    // blink + ear twitch
    st.blinkIn -= dt;
    if (st.blinkIn <= 0) { st.blink = 0.14; st.blinkIn = rand(2.2, 5); }
    if (st.blink > 0) st.blink -= dt;
    st.earIn -= dt;
    if (st.earIn <= 0) { st.earTwitch = 0.28; st.earIn = rand(2.5, 6); }
    if (st.earTwitch > 0) st.earTwitch -= dt;

    // squash spring
    st.sqv += (-90 * st.sq - 9 * st.sqv) * dt;
    st.sq += st.sqv * dt;

    // turn
    if (!st.script || st.script.type !== "burrow") {
      st.yaw += wrapPi(st.yawT - st.yaw) * (1 - Math.exp(-(sp > S * 1.5 ? 12 : 7) * dt));
    } else {
      st.yaw += wrapPi(st.yawT - st.yaw) * (1 - Math.exp(-8 * dt));
    }

    applyRig(now, dt);
    updateParticles(dt);
  }

  function applyRig(now) {
    const tor = P.torso + O.torso;
    torso.rotation.x = tor;
    legs.fl.rotation.set(P.fl + O.fl - tor, 0, P.flZ);
    legs.fr.rotation.set(P.fr + O.fr - tor, 0, P.frZ);
    legs.bl.rotation.set(P.bl + O.bl - tor, 0, 0.04);
    legs.br.rotation.set(P.br + O.br - tor, 0, -0.04);

    head.rotation.set(P.headP + O.headP - tor * 0.7, P.headY + O.headY, P.headR + O.headR);

    // breathing + idle sway
    const breathe = Math.sin(now * 2.2) * (st.sleeping ? 0.018 : 0.008);
    torso.scale.set(1 + breathe * 0.5, 1 + breathe, 1);

    // ears
    const twitch = st.earTwitch > 0 ? Math.sin((1 - st.earTwitch / 0.28) * Math.PI * 3) * 0.22 : 0;
    const bounce = Math.sin(st.phase * 2) * 0.12 * st.amp;
    ears[0].rotation.set(-0.15 - P.earBack - bounce, 0, 0.28 + P.earSpread + twitch);
    ears[1].rotation.set(-0.15 - P.earBack - bounce, 0, -0.28 - P.earSpread);

    // tail
    const wag = Math.sin(now * (9 + P.tailAmp * 9)) * P.tailAmp * 0.75;
    tail.rotation.set(-P.tailLift, wag, 0);

    // eyes, mouth, tongue
    const eyeOpen = clamp(P.eyes, 0, 1) * (st.blink > 0 ? 0.08 : 1);
    eyes.forEach((e) => { e.scale.set(1, Math.max(0.06, eyeOpen), 1); });
    const mo = clamp(P.mouth, 0, 1);
    mouthOpen.scale.y = Math.max(0.001, mo * 0.9);
    smile.visible = mo < 0.3;
    const tg = clamp(P.tongue, 0, 1);
    tongue.scale.set(1, Math.max(0.001, tg + mo * 0.3), 1);
    tongue.rotation.x = 0.15 + tg * 0.5;
    tongue.position.y = -0.13 - mo * 0.03;

    // body pose
    flipG.position.y = 0.4 + P.rootY + O.hopY + O.sink;
    bodyG.position.y = -0.4;
    flipG.rotation.set(O.flipX, 0, O.rollZ);
    yawG.rotation.y = st.yaw + O.spinY;
    const sq = st.sq;
    yawG.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);

    shadow.scale.setScalar(1 / (1 + Math.max(0, O.hopY) * 0.9));
    shadow.material.opacity = clamp(1 - Math.max(0, O.hopY) * 0.4, 0.35, 1) * (O.sink < -0.9 ? 0 : 1);
  }

  function updateParticles(dt) {
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.life += dt;
      const k = d.life / d.max;
      if (k >= 1) {
        dustGroup.remove(d.m);
        d.m.material.dispose();
        d.m.geometry.dispose();
        dust.splice(i, 1);
        continue;
      }
      d.vy -= d.grav * dt;
      d.m.position.x += d.vx * dt;
      d.m.position.y = Math.max(0.01, d.m.position.y + d.vy * dt);
      d.m.position.z += d.vz * dt;
      d.m.material.opacity = (1 - k) * 0.8;
      d.m.scale.setScalar(1 + k * 1.2);
    }
  }

  /* ----------------------------------------------------------------- loop */
  let last = performance.now();
  let prevX = st.x;
  let prevY = st.y;
  let running = true;
  let started = false;

  function place() {
    const px = Math.round(st.x - canvas.offsetWidth / 2);
    const py = Math.round(st.y - FEET * canvas.offsetHeight);
    canvas.style.transform = `translate3d(${px}px, ${py}px, 0)`;
  }

  function placeBubble(now) {
    if (now > st.bubbleUntil) { bubble.classList.remove("on"); return; }
    const pulse = 1 + Math.max(0, st.bubblePulse) * 0.16;
    st.bubblePulse = Math.max(0, st.bubblePulse - 0.06);
    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    const lift = S * (0.98 + Math.max(0, O.hopY) * 0.9 + (st.rest === "sit" ? 0.02 : 0));
    const bx = clamp(st.x - w / 2, 8, W() - w - 8);
    const by = Math.max(8, st.y - lift - h - 12);
    bubble.style.transform = `translate3d(${Math.round(bx)}px, ${Math.round(by)}px, 0) scale(${pulse})`;
  }

  function frame(t) {
    if (!running) return;
    const dt = Math.min(0.05, (t - last) / 1000) * (st.timeScale ?? 1);
    last = t;
    const now = t / 1000;
    try { update(dt, now); } catch (err) { window.__pupErr = String(err && err.stack || err); console.error("[pup]", err); }

    // keep dust where it was dropped while the canvas travels with the dog
    const ddx = st.x - prevX;
    const ddy = st.y - prevY;
    if (dust.length && (Math.abs(ddx) > 0.01 || Math.abs(ddy) > 0.01)) {
      for (const d of dust) {
        d.m.position.x -= ddx / S;
        d.m.position.y += ddy / (S * Math.cos(TILT)) ;
      }
    }
    prevX = st.x;
    prevY = st.y;

    place();
    placeBubble(now);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function run() {
    if (running && started) return;
    running = true;
    started = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  /* --------------------------------------------------------------- input */
  window.addEventListener("pointermove", (e) => {
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    cursor.seen = true;
    cursor.moved = performance.now() / 1000;
    if (e.pointerType === "mouse") setHover(interactiveAt(document.elementFromPoint(e.clientX, e.clientY)));
  }, { passive: true });
  window.addEventListener("pointerdown", (e) => {
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    cursor.seen = true;
    cursor.moved = performance.now() / 1000;
    if (!enabled || st.script || st.trick) return;
    // a tap on Pawsy is a pet; anywhere else he hops
    if (Math.hypot(e.clientX - st.x, e.clientY - (st.y - S * 0.85)) < S * 1.05) { pet(); return; }
    startTrick("hop");
  }, { passive: true });
  document.documentElement.addEventListener("mouseleave", () => { cursor.seen = false; setHover(null); });
  window.addEventListener("scroll", () => {
    // the page moves under a still cursor, so re-check what is under it
    window.clearTimeout(scroll.t);
    scroll.t = window.setTimeout(() => {
      if (cursor.seen) setHover(interactiveAt(document.elementFromPoint(cursor.x, cursor.y)));
    }, 140);
  }, { passive: true });
  const scroll = { t: 0 };
  window.addEventListener("resize", () => { resize(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else if (enabled) run(); });

  function applyEnabled() {
    canvas.hidden = !enabled;
    if (!enabled) { bubble.classList.remove("on"); stop(); }
    else run();
  }
  toggle.addEventListener("click", () => {
    enabled = !enabled;
    toggle.setAttribute("aria-pressed", String(enabled));
    try { localStorage.setItem(STORE_KEY, enabled ? "on" : "off"); } catch (_) {}
    applyEnabled();
    if (enabled) { clearDust(); st.script = null; st.trick = null; chute.visible = false; hole.visible = false; clip.constant = 100; beginScript("chute", "I'm back! Woof!"); }
  });

  /* ---------------------------------------------------------------- start */
  currentSection = sectionAtMiddle();
  applyEnabled();
  if (enabled) {
    // Hidden until the first frame so there is no flash at the corner.
    st.x = clampGoal(homeSpot()).x;
    st.y = -S * 3;
    st.script = { type: "wait", t: 0 };
    window.setTimeout(() => { if (enabled && st.script && st.script.type === "wait") beginScript("chute", "Woof! I'm Pawsy. Welcome to Pawse!"); }, 900);
  }

  // Test hooks, only with ?pupdebug in the URL.
  if (/[?&]pupdebug/.test(location.search)) {
    window.pup = {
      st, P, T, cursor, TRICKS, chute, hole, clip,
      clean: () => { st.script = null; st.free = false; chute.visible = false; hole.visible = false; clip.constant = 100; },
      trick: (n) => startTrick(n),
      pet: () => pet(),
      script: (type) => { beginScript(type, "debug"); },
      rest: (r) => { st.rest = r; st.idle = 1; },
      put: (x, y) => { st.x = x; st.y = y; st.vx = st.vy = 0; },
      say,
    };
  }
}
