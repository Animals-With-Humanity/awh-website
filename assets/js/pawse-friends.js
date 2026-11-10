/*
  Pawse friends — the other two thirds of "Paws · People · Planet".

    Pawsy  (paws)    → assets/js/pawse-pup.js
    Sprout (planet)  → a little potted sapling. Tap or hold him to pour water from a
                       watering can: he grows leaves, buds and blooms. Forget to water him
                       and he droops. His growth is remembered between visits.
    Mitra  (people)  → a Pawse volunteer. Tap for high-fives, namaste, cheers and dance moves.

  Same recipe as Pawsy: Three.js, every shape built from code, no external models.
  Drop-in: <script src="assets/js/pawse-friends.js" defer></script>
  Test hooks: add ?friendsdebug to the URL and use window.friends in the console.
*/

(() => {
const THREE_URL = "https://unpkg.com/three@0.170.0/build/three.module.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const wrapPi = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

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
  /* ================================================================ shared kit */
  const style = document.createElement("style");
  style.textContent = `
    .fr-canvas { position: fixed; left: 0; top: 0; z-index: 69; pointer-events: none; will-change: transform; }
    .fr-canvas[hidden], .fr-hit[hidden] { display: none; }
    .fr-hit {
      position: fixed; z-index: 69; margin: 0; padding: 0; border: 0; background: transparent; border-radius: 28px;
      -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; -webkit-user-select: none;
    }
    .fr-hit:focus-visible { outline: 3px solid #0253d1; outline-offset: 2px; }
    .fr-sprout-hit { cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M6 12h12l-1 12H7z' fill='%232e74df' stroke='%23fff' stroke-width='1.5' stroke-linejoin='round'/%3E%3Cpath d='M18 14l8-4' stroke='%232e74df' stroke-width='3' stroke-linecap='round'/%3E%3Cpath d='M9 12a3 3 0 0 1 6 0' fill='none' stroke='%23fff' stroke-width='1.5'/%3E%3Ccircle cx='27' cy='17' r='1.6' fill='%237fd0ff'/%3E%3Ccircle cx='25' cy='22' r='1.6' fill='%237fd0ff'/%3E%3C/svg%3E") 6 12, pointer; }
    .fr-mitra-hit { cursor: pointer; }
    .fr-bubble {
      position: fixed; left: 0; top: 0; z-index: 71; pointer-events: none; opacity: 0;
      transform-origin: 50% 100%; transition: opacity .16s ease;
      font-weight: 800; font-size: 14px; line-height: 1.2; color: #1f2937; background: #fff;
      border: 2px solid var(--c, #7a27a9); border-radius: 14px; padding: 6px 12px; white-space: nowrap;
      box-shadow: 0 8px 22px rgba(31, 41, 55, .2);
    }
    .fr-bubble::after {
      content: ""; position: absolute; left: 50%; bottom: -7px; width: 10px; height: 10px; background: #fff;
      border-right: 2px solid var(--c, #7a27a9); border-bottom: 2px solid var(--c, #7a27a9);
      transform: translateX(-50%) rotate(45deg);
    }
    .fr-bubble.on { opacity: 1; }
    .fr-pop { position: fixed; left: 0; top: 0; z-index: 73; pointer-events: none; animation: frPop 1.15s ease-out forwards; }
    @keyframes frPop {
      0% { transform: translate(var(--ox, 0px), var(--oy, 0px)) translate(-50%, -50%) scale(.4); opacity: 0; }
      20% { opacity: 1; }
      100% { transform: translate(calc(var(--ox, 0px) + var(--hx, 0px)), calc(var(--oy, 0px) - var(--hy, 70px))) translate(-50%, -50%) scale(1); opacity: 0; }
    }
    .fr-toggle {
      position: fixed; left: var(--l, 66px); bottom: 14px; z-index: 72; width: 44px; height: 44px; border-radius: 999px;
      border: 2px solid #7a27a9; background: #fff; color: #7a27a9; display: grid; place-items: center; cursor: pointer;
      box-shadow: 0 8px 20px rgba(31, 41, 55, .22); transition: transform .15s ease, background .15s ease;
    }
    .fr-toggle:hover { transform: translateY(-2px); }
    .fr-toggle:focus-visible { outline: 3px solid #0253d1; outline-offset: 2px; }
    .fr-toggle[aria-pressed="false"] { background: #7a27a9; color: #bef521; }
    @media print { .fr-canvas, .fr-bubble, .fr-toggle, .fr-hit, .fr-pop { display: none !important; } }
  `;
  document.head.appendChild(style);

  const W = () => window.innerWidth;
  const H = () => window.innerHeight;
  const clock = { now: 0, maxDt: 0.05, freeze: false };
  const cursor = { x: W() * 0.6, y: H() * 0.5, seen: false, moved: 0 };
  window.addEventListener("pointermove", (e) => {
    cursor.x = e.clientX; cursor.y = e.clientY; cursor.seen = true; cursor.moved = performance.now() / 1000;
  }, { passive: true });
  document.documentElement.addEventListener("mouseleave", () => { cursor.seen = false; });

  // tiny event bus so the three friends can notice each other
  const bus = (type, detail = {}) => window.dispatchEvent(new CustomEvent("pawse:" + type, { detail }));

  // geometry + material helpers
  const sph = (r, seg = 24) => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75));
  const mesh = (geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  };
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
    t.repeat.set(4, 4);
    return t;
  })();
  const glossy = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, metalness: 0, ...extra });
  const soft = (color, extra = {}) => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.8, metalness: 0, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffe9cf),
    bumpMap: noiseTex, bumpScale: 0.22, ...extra,
  });
  const eyeMat = () => glossy(0x231a20, { roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03 });
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

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
  const makeShadow = (size) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    s.rotation.x = -Math.PI / 2;
    s.position.y = 0.003;
    return s;
  };

  // A small fixed canvas + orthographic camera with the same lighting rig Pawsy uses.
  function createStage(vw, vh, feet, tilt, cls) {
    const canvas = document.createElement("canvas");
    canvas.className = "fr-canvas " + cls;
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-vw / 2, vw / 2, vh * feet, -vh * (1 - feet), 0.1, 40);
    camera.position.set(0, 10 * Math.sin(tilt), 10 * Math.cos(tilt));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    scene.add(new THREE.HemisphereLight(0xfff4e8, 0x8d78c9, 1.25));
    const key = new THREE.DirectionalLight(0xfff6ec, 2.6);
    key.position.set(-2.5, 4.5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd3ff, 1.1);
    rim.position.set(3, 2.5, -3);
    scene.add(rim);
    const v = new THREE.Vector3();
    const stage = {
      canvas, renderer, scene, camera, vw, vh, feet, S: 100, rect: { left: 0, top: 0, width: 1, height: 1 },
      fit(S) {
        stage.S = S;
        canvas.style.width = Math.round(vw * S) + "px";
        canvas.style.height = Math.round(vh * S) + "px";
        renderer.setPixelRatio(clamp(window.devicePixelRatio || 1, 1.5, 2));
        renderer.setSize(Math.round(vw * S), Math.round(vh * S), false);
      },
      // put the character's feet at viewport pixel (x, y)
      place(x, y) {
        const left = Math.round(x - (vw * stage.S) / 2), top = Math.round(y - vh * feet * stage.S);
        canvas.style.transform = `translate3d(${left}px, ${top}px, 0)`;
        stage.rect = { left, top, width: vw * stage.S, height: vh * stage.S };
      },
      // world point -> viewport pixels
      px(x, y, z = 0) {
        v.set(x, y, z).project(camera);
        return { x: stage.rect.left + (v.x * 0.5 + 0.5) * stage.rect.width, y: stage.rect.top + (1 - (v.y * 0.5 + 0.5)) * stage.rect.height };
      },
    };
    return stage;
  }

  function makeBubble(color) {
    const el = document.createElement("div");
    el.className = "fr-bubble";
    el.style.setProperty("--c", color);
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    const b = {
      el, until: 0, pulse: 0,
      say(text, ms = 2200) { el.textContent = text; el.classList.add("on"); b.until = clock.now + ms / 1000; b.pulse = 1; },
      hide() { el.classList.remove("on"); b.until = 0; },
      place(x, y) {
        if (clock.now > b.until) { el.classList.remove("on"); return; }
        const pulse = 1 + Math.max(0, b.pulse) * 0.16;
        b.pulse = Math.max(0, b.pulse - 0.06);
        const w = el.offsetWidth, h = el.offsetHeight;
        const bx = clamp(x - w / 2, 8, W() - w - 8);
        const by = Math.max(8, y - h - 12);
        el.style.transform = `translate3d(${Math.round(bx)}px, ${Math.round(by)}px, 0) scale(${pulse})`;
      },
    };
    return b;
  }

  function pop(x, y, glyphs, n = 6, spread = 40) {
    for (let i = 0; i < n; i++) {
      const h = document.createElement("span");
      h.className = "fr-pop";
      h.textContent = pick(glyphs);
      h.style.setProperty("--ox", Math.round(x + rand(-spread, spread)) + "px");
      h.style.setProperty("--oy", Math.round(y + rand(-spread * 0.5, spread * 0.4)) + "px");
      h.style.setProperty("--hx", Math.round(rand(-46, 46)) + "px");
      h.style.setProperty("--hy", Math.round(rand(52, 96)) + "px");
      h.style.fontSize = Math.round(rand(14, 22)) + "px";
      document.body.appendChild(h);
      window.setTimeout(() => h.remove(), 1250);
    }
  }

  function makeHit(cls, label) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "fr-hit " + cls;
    b.setAttribute("aria-label", label);
    b.setAttribute("data-friend", "");
    b.hidden = true;
    document.body.appendChild(b);
    return b;
  }
  const setBox = (el, x, y, w, h) => {
    el.style.left = Math.round(x) + "px"; el.style.top = Math.round(y) + "px";
    el.style.width = Math.round(w) + "px"; el.style.height = Math.round(h) + "px";
  };

  const sizeFor = (small, mid, big) => (W() < 640 ? small : W() < 1280 ? mid : big);

  /* ================================================================ awareness: hover, sections, roaming */
  // Same ideas as Pawsy: follow the cursor, visit hovered buttons, and react to each section you scroll into.
  const INTERACTIVE = 'a[href], button, [role="button"], [role="tab"], summary, input[type="submit"]';
  const world = { hover: null, hoverSince: 0, pending: null, lastAct: performance.now() / 1000 };
  ["pointermove", "pointerdown", "keydown", "scroll", "touchstart"].forEach((n) =>
    window.addEventListener(n, () => { world.lastAct = performance.now() / 1000; }, { passive: true }));

  function interactiveAt(el) {
    if (!el || !el.closest) return null;
    const hit = el.closest(INTERACTIVE);
    if (!hit || hit.hasAttribute("data-friend") || hit.classList.contains("fr-toggle") || hit.classList.contains("pup-toggle")) return null;
    const r = hit.getBoundingClientRect();
    if (r.width < 56 || r.height < 28) return null;
    return hit;
  }
  function setHover(el) {
    if (el === world.hover) return;
    world.hover = el;
    world.hoverSince = clock.now;
  }
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") setHover(interactiveAt(document.elementFromPoint(e.clientX, e.clientY)));
  }, { passive: true });

  const SECTIONS = [...document.querySelectorAll("main > header, main > section, footer")];
  const sectionKey = (el) => el.id || (el.tagName === "HEADER" ? "top" : el.tagName === "FOOTER" ? "footer"
    : /for a cause/i.test((el.textContent || "").slice(0, 400)) ? "cause" : "");
  function sectionAtMiddle() {
    const y = H() * 0.5;
    for (const el of SECTIONS) {
      const r = el.getBoundingClientRect();
      if (r.top <= y && r.bottom > y) return el;
    }
    return null;
  }
  let curSection = sectionAtMiddle();
  let scrollT = 0;
  window.addEventListener("scroll", () => {
    window.clearTimeout(scrollT);
    scrollT = window.setTimeout(() => {
      const el = sectionAtMiddle();
      if (el && el !== curSection) { curSection = el; world.pending = el; }
      if (cursor.seen) setHover(interactiveAt(document.elementFromPoint(cursor.x, cursor.y)));
    }, 380);
  }, { passive: true });

  // What each friend says (and how they arrive) in every section of pawse.html.
  const PLANS = {
    sprout: {
      top: ["pop", "Welcome to Pawse! Let's grow something 🌱"],
      experience: ["rise", "Shop sustainable? My kind of stall 🌿"],
      everyone: ["drop", "The Earth column is mine: plants & composting!"],
      glimpses: ["pop", "Look how green it all was 📸"],
      editions: ["rise", "The 1st paw-friendly green festival 🌿"],
      impact: ["drop", "Big names, deep roots 🌳"],
      sponsors: ["pop", "Thank you, partners. You help us grow!"],
      media: ["rise", "Even the news is blooming 🌸"],
      join: ["drop", "Sponsor, stall or voice. Plant yourself in!"],
      desk: ["pop", "Pick a form. I'll water while you wait 💧"],
      cause: ["rise", "Will you Pawse for a cause? 🌱"],
      footer: ["drop", "Stay green. See you at Pawse! 💚"],
    },
    mitra: {
      top: ["run", "Hi! Welcome to Pawse 💜"],
      experience: ["drop", "Pottery, paint with paws, tambola… all of it!"],
      everyone: ["rise", "Under 'You': karaoke & doodle booth. I'm in!"],
      glimpses: ["pop", "Look at those smiles! 📸"],
      editions: ["run", "Two editions down. Come make it three!"],
      impact: ["drop", "Great partners make great gatherings"],
      sponsors: ["pop", "Thank you, sponsors! 🙏"],
      media: ["rise", "Hover a panel to read the story!"],
      join: ["run", "Sponsor, stall or voice. Pick your way in!"],
      desk: ["pop", "Pick the form that fits. I'll wait 😊"],
      cause: ["drop", "Will you Pawse for a cause? 💜"],
      footer: ["rise", "Thanks for visiting. Be kind! 💜"],
    },
  };
  const FALLBACK = { sprout: ["pop", "Onwards, and upwards! 🌱"], mitra: ["run", "Onwards! 💜"] };
  const planFor = (who, el) => PLANS[who][sectionKey(el)] || FALLBACK[who];

  // What they say when they walk over to a button you are hovering.
  const HOVER_LINES = [
    [/sponsor/i, { sprout: "Sponsors help us grow! 🌱", mitra: "Sponsors make Pawse happen 💜" }],
    [/stall/i, { sprout: "A stall? Make it a green one! 🌿", mitra: "Book a stall and join the fun!" }],
    [/explore|experience/i, { sprout: "So much to explore! 🌿", mitra: "Let's explore together!" }],
    [/feedback|voice|share|felt/i, { sprout: "Tell us what you felt 💚", mitra: "I'd love to hear your story!" }],
    [/send|submit|email/i, { sprout: "Send it! I'll cheer you on 🌱", mitra: "Go on, hit send!" }],
    [/register|book|join|donate/i, { sprout: "Yes! Count me in 🌿", mitra: "Yes! Join us 💜" }],
  ];
  function hoverLine(el, who) {
    const txt = ((el && (el.textContent || el.getAttribute("aria-label"))) || "").trim();
    for (const [re, l] of HOVER_LINES) if (re.test(txt)) return l[who];
    return who === "sprout" ? "Ooh, click that! 🌿" : "Go on, tap it! 👆";
  }

  // Roaming: follow the cursor (same offsets as Pawsy), visit hovered buttons, run entrance scripts.
  function makeRoamer(stage) {
    const S = () => stage.S;
    const r = { x: W() * 0.5, y: H() - 10, vx: 0, vy: 0, free: false, script: null, idle: 0, hoverTrickAt: 0, top: 1.5, onEnd: null };
    const home = () => ({ x: W() * 0.5, y: H() - 10 });
    r.home = home;
    r.goal = () => {
      if (!cursor.seen) return home();
      const s = S(), side = cursor.x > s * 1.4 ? -1 : 1;
      return { x: cursor.x + side * s * 0.72, y: cursor.y + s * 0.62 };
    };
    r.clampGoal = (g) => ({ x: clamp(g.x, S() * 0.45, W() - S() * 0.45), y: clamp(g.y, S() * r.top, H() - 8) });
    r.hoverSpot = (el) => {
      const s = S(), b = el.getBoundingClientRect();
      const cx = clamp(b.left + b.width / 2, s * 0.45, W() - s * 0.45);
      return H() - (b.bottom + 6) >= s * (r.top + 0.05) ? { x: cx, y: b.bottom + s * r.top } : { x: cx, y: b.top + 6 };
    };
    r.speed = () => Math.hypot(r.vx, r.vy);
    r.move = (g, dt, mul = 1) => {
      const s = S(), goal = r.free ? g : r.clampGoal(g);
      const dx = goal.x - r.x, dy = goal.y - r.y, dist = Math.hypot(dx, dy);
      let want = Math.min(s * 4.2 * mul, dist * 4.6);
      if (dist < 9) want = 0;
      const k = 1 - Math.exp(-9 * dt);
      r.vx += ((dist > 0 ? dx / dist : 0) * want - r.vx) * k;
      r.vy += ((dist > 0 ? dy / dist : 0) * want - r.vy) * k;
      r.x += r.vx * dt; r.y += r.vy * dt;
      if (!r.free) { r.x = clamp(r.x, s * 0.4, W() - s * 0.4); r.y = clamp(r.y, s * r.top * 0.92, H() - 4); }
      return dist;
    };
    r.begin = (type, line) => {
      const s = S(), goal = r.clampGoal(r.goal());
      r.free = true; r.vx = r.vy = 0;
      if (type === "drop") { r.x = goal.x; r.y = -s * (r.top + 0.5); r.script = { type, t: 0, line, phase: "fall" }; }
      else if (type === "run") { r.x = goal.x < W() * 0.5 ? W() + s : -s; r.y = goal.y; r.script = { type, t: 0, line, phase: "run" }; }
      else if (type === "rise") { r.x = goal.x; r.y = H() + s * (r.top + 0.3); r.script = { type, t: 0, line, phase: "climb", sy: r.y }; }
      else { r.x = goal.x; r.y = goal.y; r.script = { type: "pop", t: 0, line, phase: "pop", u: 0 }; }
    };
    const finish = () => {
      const sc = r.script;
      r.script = null; r.free = false; r.idle = 0.45; r.vx = r.vy = 0;
      if (r.onEnd) r.onEnd(sc);
    };
    const land = (sc) => { sc.phase = "land"; sc.t = 0; sc.landed = true; };
    r.updateScript = (dt) => {
      const sc = r.script, s = S();
      sc.t += dt;
      const goal = r.clampGoal(r.goal());
      const ease = 1 - Math.exp(-6 * dt);
      if (sc.phase === "fall") {
        r.vy += 3200 * dt; r.y += r.vy * dt; r.x += (goal.x - r.x) * ease;
        if (r.y >= goal.y) { r.y = goal.y; r.vy = 0; land(sc); }
      } else if (sc.phase === "run") {
        const d = r.move(goal, dt, 1.9);
        if (d < 16 || sc.t > 3.5) land(sc);
      } else if (sc.phase === "climb") {
        const u = clamp(sc.t / 1.1, 0, 1);
        r.y = lerp(sc.sy, goal.y, easeOut(u)); r.x += (goal.x - r.x) * ease;
        r.vx = 0; r.vy = -s * 1.8 * (1 - u * 0.7);
        if (u >= 1) land(sc);
      } else if (sc.phase === "pop") {
        r.x += (goal.x - r.x) * ease; r.y += (goal.y - r.y) * ease;
        sc.u = clamp(sc.t / 0.6, 0, 1);
        if (sc.t > 0.8) finish();
      } else if (sc.phase === "land") {
        r.vx = r.vy = 0;
        if (sc.t > 0.32) finish();
      }
    };
    // one frame of movement. o: { canPlan, frozen, mul }
    r.step = (dt, now, o) => {
      if (r.script) { r.updateScript(dt); return { script: true, atHover: false }; }
      if (o.canPlan && world.pending) {
        const plan = planFor(o.who, world.pending);
        world.pending = null;
        r.begin(plan[0], plan[1]);
        return { script: true, atHover: false };
      }
      let goal = r.goal();
      const hov = world.hover && document.contains(world.hover) && now - world.hoverSince > 0.18 ? world.hover : null;
      if (world.hover && !document.contains(world.hover)) world.hover = null;
      if (hov) goal = r.hoverSpot(hov);
      if (o.frozen) goal = { x: r.x, y: r.y };
      const dist = r.move(goal, dt, o.mul || 1);
      if (r.speed() > S() * 0.25) r.idle = 0;
      else { r.vx *= 0.8; r.vy *= 0.8; r.idle += dt; }
      return { script: false, dist, hov, atHover: !!hov && !o.frozen && dist < 22 };
    };
    return r;
  }

  /* ================================================================ SPROUT (planet) */
  function makeSprout() {
    const KEY = "pawseSprout";
    const stage = createStage(2.7, 3.5, 0.88, 0.2, "fr-sprout");
    const { scene } = stage;
    const bubble = makeBubble("#4aa11a");
    const hit = makeHit("fr-sprout-hit", "Sprout the little plant. Tap or hold to water him and watch him grow.");

    const M = {
      pot: glossy(0xf2712b, { roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.35, side: THREE.DoubleSide }),
      rim: glossy(0xbef521, { roughness: 0.4, clearcoat: 0.5 }),
      soil: soft(0x6b4630, { roughness: 1, sheen: 0, bumpScale: 0.8 }),
      stem: glossy(0x4ea92f, { roughness: 0.55 }),
      leafA: glossy(0x4fbf3a, { roughness: 0.42, clearcoat: 0.35, side: THREE.DoubleSide }),
      leafB: glossy(0x86d92c, { roughness: 0.42, clearcoat: 0.35, side: THREE.DoubleSide }),
      vein: glossy(0xd6f58a, { roughness: 0.6 }),
      bud: glossy(0x6cc233, { roughness: 0.5 }),
      petal: glossy(0xfd66c4, { roughness: 0.5, clearcoat: 0.3 }),
      petalIn: glossy(0xffb6e3, { roughness: 0.5 }),
      center: glossy(0xeeff66, { roughness: 0.5 }),
      cream: soft(0xfff3e2),
      eye: eyeMat(),
      mouth: glossy(0x4a2530, { roughness: 0.7 }),
      blush: new THREE.MeshBasicMaterial({ color: 0xff7aa5, transparent: true, opacity: 0.45 }),
      can: glossy(0x2e74df, { roughness: 0.35, clearcoat: 0.8 }),
      canTrim: glossy(0xbef521, { roughness: 0.4 }),
      drop: new THREE.MeshBasicMaterial({ color: 0x57b9ff, transparent: true, opacity: 0.95 }),
      sweat: new THREE.MeshBasicMaterial({ color: 0xaee3ff, transparent: true, opacity: 0.9 }),
      wing1: glossy(0xff7d22, { roughness: 0.5, side: THREE.DoubleSide }),
      wing2: glossy(0x0253d1, { roughness: 0.5, side: THREE.DoubleSide }),
    };
    const GREEN = new THREE.Color(0x4fbf3a), GREEN2 = new THREE.Color(0x86d92c), DRY = new THREE.Color(0xa6a83c);
    const SOIL_DRY = new THREE.Color(0x6b4630), SOIL_WET = new THREE.Color(0x2c1a12);

    // hierarchy: bodyG (hop / squash, pivot on the ground) > potG + plant chain
    const bodyG = new THREE.Group();
    scene.add(bodyG);
    const POT_Y = 0.07;
    const potG = new THREE.Group();
    potG.position.y = POT_Y;
    bodyG.add(potG);

    const prof = [[0, 0], [0.25, 0], [0.29, 0.025], [0.335, 0.12], [0.385, 0.32], [0.405, 0.47], [0.395, 0.5], [0.355, 0.5], [0.34, 0.46], [0, 0.46]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    potG.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 56), M.pot));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.395, 0.042, 12, 56), M.rim);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.49;
    potG.add(rim);
    const soil = mesh(sph(0.36, 28), M.soil, 0, 0.47, 0, 1, 0.2, 1);
    potG.add(soil);
    const potR = (y) => lerp(0.335, 0.385, clamp((y - 0.12) / 0.2, 0, 1)) + (y > 0.32 ? lerp(0, 0.02, clamp((y - 0.32) / 0.15, 0, 1)) : 0);
    const zAt = (x, y) => Math.sqrt(Math.max(0.001, potR(y) ** 2 - x * x)) + 0.004;

    // feet
    [-1, 1].forEach((s) => bodyG.add(mesh(sph(0.09, 18), M.cream, s * 0.16, 0.055, 0.07, 1, 0.6, 1.3)));

    // face on the pot
    const face = new THREE.Group();
    potG.add(face);
    const eyes = [], happyEyes = [];
    [-1, 1].forEach((s) => {
      const x = s * 0.118, y = 0.31;
      const g = new THREE.Group();
      g.position.set(x, y, zAt(x, y) - 0.025);
      g.rotation.x = -0.24;
      g.add(mesh(sph(0.062, 22), M.eye, 0, 0, 0, 1, 1.18, 0.62));
      g.add(mesh(sph(0.021, 12), shineMat, s * -0.015, 0.03, 0.036));
      g.add(mesh(sph(0.01, 10), shineMat, s * 0.017, -0.017, 0.038));
      face.add(g);
      eyes.push(g);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.016, 8, 20, Math.PI), M.eye);
      arc.position.set(x, y - 0.03, zAt(x, y) + 0.012);
      arc.rotation.x = -0.24;
      arc.visible = false;
      face.add(arc);
      happyEyes.push(arc);
      const bl = mesh(sph(0.042, 16), M.blush, s * 0.215, 0.215, zAt(s * 0.215, 0.215) - 0.012, 1, 0.7, 0.3);
      bl.rotation.y = s * 0.55;
      face.add(bl);
    });
    const curve = (pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, zAt(x, y) + 0.003))), 20, 0.0075, 8);
    const smile = new THREE.Mesh(curve([[-0.07, 0.215], [-0.035, 0.18], [0, 0.17], [0.035, 0.18], [0.07, 0.215]]), M.mouth);
    const frown = new THREE.Mesh(curve([[-0.06, 0.165], [-0.03, 0.19], [0, 0.198], [0.03, 0.19], [0.06, 0.165]]), M.mouth);
    frown.visible = false;
    const mouthOpen = mesh(sph(0.05, 18), M.mouth, 0, 0.18, zAt(0, 0.18) - 0.012, 1.3, 1, 0.4);
    mouthOpen.scale.y = 0.001;
    face.add(smile, frown, mouthOpen);
    const sweat = mesh(sph(0.04, 12), M.sweat, 0.27, 0.4, 0.2, 0.8, 1.25, 0.6);
    sweat.visible = false;
    potG.add(sweat);

    // ---- the plant: a chain of stem segments so it can sway, droop and grow
    const N = 6, SEG = 0.17;
    const plantRoot = new THREE.Group();
    plantRoot.position.y = POT_Y + 0.5;
    bodyG.add(plantRoot);

    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.bezierCurveTo(0.07, 0.15, 0.26, 0.17, 0.42, 0);
    leafShape.bezierCurveTo(0.26, -0.17, 0.07, -0.15, 0, 0);
    const leafGeo = new THREE.ExtrudeGeometry(leafShape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 2, curveSegments: 14 });
    leafGeo.translate(0, 0, -0.006);
    const veinGeo = new THREE.BoxGeometry(0.34, 0.012, 0.004);
    veinGeo.translate(0.19, 0, 0);

    const segs = [];
    const leafPairs = [];
    const LEAF_SIZE = [1.0, 1.05, 0.98, 0.85, 0.7, 0.55];
    let parent = plantRoot;
    for (let k = 0; k < N; k++) {
      const g = new THREE.Group();
      parent.add(g);
      const r = 0.05 - k * 0.0045;
      const geo = new THREE.CapsuleGeometry(r, SEG, 6, 12);
      geo.translate(0, SEG / 2, 0);
      const m = new THREE.Mesh(geo, M.stem);
      g.add(m);
      const top = new THREE.Group();
      top.position.y = SEG;
      g.add(top);
      segs.push({ g, m, top });
      // a pair of leaves at the top of each segment
      const pair = new THREE.Group();
      pair.rotation.y = (k % 2 === 0 ? 0.4 : -0.4) + k * 0.06;
      top.add(pair);
      const leaves = [0, Math.PI].map((side) => {
        const sideG = new THREE.Group();
        sideG.rotation.y = side;
        const tilt = new THREE.Group();
        const lm = new THREE.Mesh(leafGeo, k % 2 === 0 ? M.leafA : M.leafB);
        tilt.add(lm, new THREE.Mesh(veinGeo, M.vein));
        tilt.children[1].position.z = 0.012;
        sideG.add(tilt);
        pair.add(sideG);
        return tilt;
      });
      leafPairs.push({ pair, leaves, size: LEAF_SIZE[k] * 0.95 });
      parent = top;
    }
    const tip = parent;
    const bud = mesh(sph(0.075, 18), M.bud, 0, 0.05, -0.01);
    tip.add(bud);
    const flower = new THREE.Group();
    flower.position.set(0, 0.07, 0.02);
    flower.scale.setScalar(1.2);
    flower.rotation.x = -0.6;
    tip.add(flower);
    const petals = new THREE.Group();
    flower.add(petals);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const p = mesh(sph(0.1, 14), M.petal, Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0, 1.25, 0.62, 0.34);
      p.rotation.z = a;
      petals.add(p);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4;
      const p = mesh(sph(0.075, 14), M.petalIn, Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.025, 1.2, 0.62, 0.34);
      p.rotation.z = a;
      petals.add(p);
    }
    petals.add(mesh(sph(0.075, 18), M.center, 0, 0, 0.05, 1, 1, 0.7));
    petals.scale.setScalar(0.001);

    // ---- watering can
    const canG = new THREE.Group();
    canG.visible = false;
    scene.add(canG);
    {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.24, 28), M.can);
      canG.add(body);
      canG.add(mesh(new THREE.TorusGeometry(0.16, 0.014, 8, 28), M.canTrim, 0, 0.12, 0, 1, 1, 1)).rotation.x = Math.PI / 2;
      canG.add(mesh(new THREE.TorusGeometry(0.17, 0.014, 8, 28), M.canTrim, 0, -0.11, 0, 1, 1, 1)).rotation.x = Math.PI / 2;
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.045, 0.3, 12), M.can);
      spout.position.set(0.27, 0.07, 0);
      spout.rotation.z = -1.0;
      canG.add(spout);
      const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 0.05, 16), M.canTrim);
      rose.position.set(0.4, 0.16, 0);
      rose.rotation.z = -1.0;
      canG.add(rose);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 10, 24, Math.PI * 1.3), M.can);
      handle.position.set(-0.19, 0.01, 0);
      handle.rotation.z = Math.PI * 0.35;
      canG.add(handle);
    }
    const tipObj = new THREE.Object3D();
    tipObj.position.set(0.43, 0.19, 0);
    canG.add(tipObj);

    // droplets
    const drops = [];
    const dropGeo = sph(0.03, 8);
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(dropGeo, M.drop);
      m.visible = false;
      scene.add(m);
      drops.push({ m, on: false, vx: 0, vy: 0, vz: 0, life: 0 });
    }
    let dropIdx = 0;
    const tmp = new THREE.Vector3();
    function spawnDrop() {
      const d = drops[dropIdx++ % drops.length];
      tipObj.getWorldPosition(tmp);
      d.m.position.set(tmp.x + rand(-0.05, 0.05), tmp.y, tmp.z + rand(-0.04, 0.04));
      d.vx = rand(0.25, 0.75) * -st.canSide; d.vy = rand(-0.1, 0.3); d.vz = rand(-0.1, 0.1);
      d.life = 0; d.on = true; d.m.visible = true;
    }

    // butterfly (appears when fully bloomed)
    const fly = new THREE.Group();
    fly.visible = false;
    scene.add(fly);
    const wings = [];
    fly.add(mesh(new THREE.CapsuleGeometry(0.014, 0.07, 4, 8), M.eye));
    [-1, 1].forEach((s) => {
      const piv = new THREE.Group();
      piv.add(mesh(sph(0.08, 12), M.wing1, s * 0.07, 0.03, 0, 1, 0.85, 0.07));
      piv.add(mesh(sph(0.05, 12), M.wing2, s * 0.055, -0.04, 0, 1, 0.8, 0.07));
      fly.add(piv);
      wings.push({ piv, s });
    });

    const shadow = makeShadow(1.4);
    scene.add(shadow);

    /* ---- state */
    const rm = makeRoamer(stage);
    const O = { hop: 0, spin: 0, flap: 0, tumble: 0 };
    const st = {
      g: 0, moist: 0.8, saved: 0, active: false, hovered: false,
      pourUntil: 0, pour: 0, holding: false, holdSince: 0, lastBus: 0, spawn: 0,
      happy: 0, happyUntil: 0, mouth: 0, wig: 0, wigv: 0, sq: 0, sqv: 0,
      blink: 0, blinkIn: rand(1.5, 3.5), idleLine: rand(25, 40), lastTouch: 0,
      said: {}, bloomAt: 0, hintAt: 0, replanting: false, canSide: -1,
      hopPhase: 0, hopN: 0, yaw: 0, trick: null, microAt: 8, sleeping: false, zzzAt: 0,
    };
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && typeof raw.g === "number") {
        st.g = clamp(raw.g, 0, 1);
        st.moist = clamp((raw.m ?? 0.5) - (Date.now() - (raw.t || Date.now())) / 1000 / 150, 0, 1);
        if (st.g >= 0.88) st.said.bloom = true;
      }
    } catch (_) {}
    function save() {
      try { localStorage.setItem(KEY, JSON.stringify({ g: +st.g.toFixed(3), m: +st.moist.toFixed(3), t: Date.now() })); } catch (_) {}
    }

    const api = { enabled: false, stage, bubble, hit, st, rm };
    const LINES = ["Plants love sunshine ☀️", "Tiny seeds, big dreams 🌱", "Reduce. Reuse. Replant.", "Cool paws, green planet 🌍", "Plant-based picnic, anyone?", "Psst… the planet says thanks"];
    const THIRSTY = ["I'm a little thirsty…", "Water, please? 💧", "My leaves feel droopy…"];
    const MILE = [[0.22, "Ooh, I'm growing!"], [0.45, "New leaves! 🍃"], [0.7, "I can feel a bud!"]];

    const say = (t, ms) => bubble.say(t, ms);
    const growG = () => 0.9 + st.g * 5.5;
    const segScale = (k) => easeOut(clamp(growG() - k, 0, 1));
    function topPoint() {
      let h = 0;
      for (let k = 0; k < N; k++) h += SEG * segScale(k);
      return POT_Y + 0.5 + h + 0.25;
    }

    function startWater(now) {
      if (now >= st.pourUntil) st.canSide = rm.x < W() * 0.28 ? 1 : -1; // pour from the side with more room
      st.pourUntil = Math.max(st.pourUntil, now + 1.4);
      st.lastTouch = now;
      st.wigv += 3;
      st.sleeping = false;
      if (now - st.lastBus > 1.2) { st.lastBus = now; bus("water"); }
    }
    function replant() {
      st.g = 0; st.said = { hello: true }; st.bloomAt = 0; st.sq = -0.25; st.sqv = 0;
      say("Fresh seed planted! 🌱", 2600);
      const p = stage.px(0, 0.9);
      pop(p.x, p.y, ["🌱", "💚", "✨"], 6, 40);
      save();
    }

    hit.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      st.holding = true; st.holdSince = clock.now;
      startWater(clock.now);
    });
    const release = () => { st.holding = false; st.replanting = false; save(); };
    hit.addEventListener("pointerup", release);
    hit.addEventListener("pointercancel", release);
    hit.addEventListener("pointerleave", () => { st.hovered = false; release(); });
    hit.addEventListener("pointerenter", () => { st.hovered = true; });
    hit.addEventListener("click", (e) => { if (e.detail === 0) startWater(clock.now); }); // keyboard
    hit.addEventListener("contextmenu", (e) => e.preventDefault());

    function fit() { stage.fit(sizeFor(80, 104, 118)); }
    function placeHit() {
      const topY = stage.px(0, topPoint()).y;
      const base = stage.px(0, 0);
      const half = stage.S * 0.62;
      setBox(hit, base.x - half, topY - 10, half * 2, base.y - topY + 14);
    }

    // little tricks (used for entrances, hovering a button and idle fidgets)
    const TRICKS = {
      hop: { dur: 0.8, run(u) { const k = Math.sin(u * Math.PI); O.hop += k * 0.3; O.flap += k * 0.8; st.happy = 1; st.happyUntil = clock.now + 0.3; } },
      spin: { dur: 1.1, run(u) { O.spin += easeInOut(u) * TAU; O.hop += Math.sin(u * Math.PI) * 0.2; O.flap += 0.6; st.happy = 1; st.happyUntil = clock.now + 0.3; } },
      shimmy: { dur: 1.4, run(u) { const k = Math.sin(u * Math.PI); O.flap += k * 1.1; st.wigv += Math.sin(u * 40) * 0.6; st.happy = 1; st.happyUntil = clock.now + 0.3; } },
    };
    function startTrick(name, line) {
      st.trick = { name, def: TRICKS[name], t: 0 };
      st.lastTouch = clock.now;
      if (line) say(line, TRICKS[name].dur * 1000 + 1400);
    }
    rm.onEnd = (sc) => startTrick({ drop: "shimmy", run: "hop", rise: "spin", pop: "shimmy" }[sc.type] || "hop", sc.line);

    /* ---- update */
    function update(dt, now) {
      if (!st.active) return;
      O.hop = O.spin = O.flap = O.tumble = 0;
      const sc = rm.script;

      // pouring
      if (st.holding) {
        st.pourUntil = now + 0.25;
        if (st.g >= 0.95 && now - st.holdSince > 1.4 && !st.replanting) { st.replanting = true; replant(); }
      }
      const watering = now < st.pourUntil;
      st.pour = damp(st.pour, watering ? 1 : 0, 7, dt);
      if (watering && st.pour > 0.55) {
        st.moist = Math.min(1, st.moist + dt * 0.32);
        if (st.g < 1) st.g = Math.min(1, st.g + dt * 0.15);
        st.happy = 1; st.happyUntil = now + 0.9;
        st.spawn += dt * 90;
        while (st.spawn >= 1) { st.spawn -= 1; spawnDrop(); }
        if (!st.said.drink && Math.random() < dt * 2) { st.said.drink = true; say(pick(["Aaah, thank you!", "Yum, water!", "That's the spot!"]), 1800); }
      } else {
        st.moist = Math.max(0, st.moist - dt / 150);
        st.said.drink = false;
      }
      if (now > st.happyUntil && !(st.bloomAt && now < st.bloomAt + 3.2)) st.happy = damp(st.happy, 0, 3, dt);

      // milestones
      for (const [at, line] of MILE) if (st.g >= at && !st.said["m" + at]) { st.said["m" + at] = true; if (now > bubble.until) say(line, 2000); }
      if (st.g >= 0.88 && !st.said.bloom) {
        st.said.bloom = true; st.bloomAt = now; st.hintAt = now + 6;
        say("I'm blooming! 🌸", 3200);
        const p = stage.px(0, topPoint());
        pop(p.x, p.y, ["🌸", "💖", "✨", "🦋"], 9, 50);
        st.sq = 0.2; bus("bloom");
      }
      if (st.hintAt && now > st.hintAt) { st.hintAt = 0; say("(Hold me down to plant a new seed)", 3200); }

      const thirst = clamp((0.4 - st.moist) / 0.4, 0, 1);

      // idle chatter
      if (!sc && now - st.lastTouch > st.idleLine && now > bubble.until + 3 && !st.sleeping) {
        st.lastTouch = now; st.idleLine = rand(32, 55);
        say(thirst > 0.5 ? pick(THIRSTY) : st.g >= 0.88 ? "Look, flowers! 🌸" : pick(LINES), 2400);
      }

      // movement: follow the cursor by hopping, visit hovered buttons, arrive at new sections
      rm.top = Math.max(1.3, topPoint() + 0.25);
      const busy = watering || st.holding || st.hovered || !!st.trick || st.sleeping;
      const info = rm.step(dt, now, { who: "sprout", canPlan: !st.trick && !watering && !st.sleeping && !st.hovered, frozen: busy });
      if (!sc && info.atHover && rm.idle > 0.3 && now > rm.hoverTrickAt && !st.trick && !watering) {
        rm.hoverTrickAt = now + 6;
        startTrick(pick(["hop", "spin", "shimmy"]), hoverLine(info.hov, "sprout"));
      }
      if (!rm.script && !st.trick && !st.sleeping && rm.idle > 5 && now > st.microAt && cursor.seen) {
        st.microAt = now + rand(9, 16);
        startTrick(pick(["shimmy", "hop"]));
      }

      // sleep when nobody has touched the page for a while
      const idleReal = performance.now() / 1000 - world.lastAct;
      if (!rm.script && !st.trick && !watering) {
        if (!st.sleeping && idleReal > 30) { st.sleeping = true; st.zzzAt = now + 5.5; say("Zzz…", 2400); }
        else if (st.sleeping && idleReal < 0.6) { st.sleeping = false; startTrick("hop", "Morning! ☀️"); }
      }
      if (st.sleeping && now > st.zzzAt) { st.zzzAt = now + 5.5; say("Zzz…", 2400); }

      // trick timeline
      if (st.trick) {
        st.trick.t += dt;
        const u = clamp(st.trick.t / st.trick.def.dur, 0, 1);
        st.trick.def.run(u);
        if (u >= 1) st.trick = null;
      }

      // script visuals (arriving from above / the side / below / out of nowhere)
      if (sc) {
        if (sc.phase === "fall") { O.tumble = sc.t * 7; O.flap = 1; }
        else if (sc.phase === "run" || sc.phase === "climb") O.flap = 0.5;
        if (sc.type === "pop" && !sc.fx) { sc.fx = true; pop(rm.x, rm.y - stage.S * 0.8, ["✨", "🌱", "💚"], 6, 30); }
        if (sc.landed) { sc.landed = false; st.sq = 0.35; pop(rm.x, rm.y - stage.S * 0.3, ["🍃", "💚", "✨"], 5, 30); }
      }

      // hopping along
      const sp = rm.speed(), S = stage.S;
      const mv = clamp(sp / (S * 2.6), 0, 1);
      let hopY = 0;
      if (mv > 0.06) {
        st.hopPhase += dt * (5 + mv * 6);
        const n = Math.floor(st.hopPhase / Math.PI);
        if (n !== st.hopN) { st.hopN = n; st.sq = Math.max(st.sq, 0.14 * mv); }
        hopY = Math.abs(Math.sin(st.hopPhase)) * 0.13 * mv;
      }
      const yawT = sp > S * 0.35 ? clamp(rm.vx / (S * 3.2), -1, 1) * 0.7
        : cursor.seen ? clamp((cursor.x - rm.x) / (W() * 0.5), -1, 1) * 0.4 : 0;
      st.yaw = damp(st.yaw, yawT, 8, dt);

      // springs, blinking
      st.sqv += (-90 * st.sq - 9 * st.sqv) * dt; st.sq += st.sqv * dt;
      st.wigv += (-40 * st.wig - 3.2 * st.wigv) * dt; st.wig += st.wigv * dt;
      st.blinkIn -= dt;
      if (st.blinkIn <= 0) { st.blink = 0.13; st.blinkIn = rand(2.2, 5); }
      if (st.blink > 0) st.blink -= dt;

      stage.place(rm.x, rm.y);
      applyRig(now, dt, thirst, mv, hopY, sc);
      if (st.saved < now - 3 && st.pour > 0.1) { st.saved = now; save(); }
    }

    function applyRig(now, dt, thirst, mv, hopY, sc) {
      // body
      const pscale = sc && sc.type === "pop" ? Math.max(0.001, easeOutBack(clamp(sc.u, 0, 1))) : 1;
      const lift = hopY + O.hop;
      bodyG.position.y = lift;
      bodyG.scale.set(pscale * (1 + st.sq * 0.5), Math.max(0.001, pscale * (1 - st.sq)), pscale * (1 + st.sq * 0.5));
      bodyG.rotation.set(0, st.yaw + O.spin, O.tumble);
      shadow.material.opacity = clamp(0.9 - lift * 1.6, 0.3, 0.9);
      shadow.scale.setScalar(Math.max(0.4, 1 - lift * 0.8));

      // plant growth
      const droopAmt = Math.max(thirst, st.sleeping ? 0.35 : 0);
      const G = growG();
      for (let k = 0; k < N; k++) {
        const s = segScale(k), sg = segs[k];
        sg.m.scale.y = Math.max(0.001, s);
        sg.m.visible = s > 0.002;
        sg.top.position.y = SEG * s;
        const lp = easeOut(clamp(G - k - 0.35, 0, 1));
        const L = leafPairs[k];
        L.pair.visible = lp > 0.01;
        L.leaves.forEach((lf, i) => {
          const sz = Math.max(0.001, lp * L.size);
          lf.scale.set(sz, sz, sz);
          const flap = st.happy * Math.sin(now * 12 + k * 0.9 + i) * 0.22 + st.pour * Math.sin(now * 20 + k) * 0.1
            + O.flap * Math.sin(now * 16 + k * 0.9 + i) * 0.3 + mv * Math.sin(now * 13 + k + i) * 0.12;
          lf.rotation.z = 0.36 - droopAmt * 1.0 + flap + Math.sin(now * 1.6 + k + i * 2) * 0.04;
        });
      }
      // sway, lean to the cursor and into the hop, droop when thirsty
      const potX = rm.x;
      const lean = cursor.seen ? clamp((cursor.x - potX) / (W() * 0.5), -1, 1) : 0;
      const trail = clamp(rm.vx / (stage.S * 4), -1, 1);
      for (let k = 0; k < N; k++) {
        const sg = segs[k];
        const curveK = k < 3 ? 0.035 : -0.04;
        const sway = Math.sin(now * 1.35 + k * 0.6) * 0.012 * (1 + k * 0.25);
        const droop = -droopAmt * (0.05 + 0.025 * k);
        sg.g.rotation.z = curveK - lean * 0.026 + trail * 0.03 + sway + droop + st.wig * 0.05 * (k + 1) / N;
        sg.g.rotation.x = Math.sin(now * 1.1 + k) * 0.01;
      }

      // bud -> flower
      const bloom = clamp((st.g - 0.86) / 0.14, 0, 1);
      bud.scale.setScalar(lerp(0.5 + 0.5 * clamp(st.g / 0.85, 0, 1), 0.7, bloom));
      petals.scale.setScalar(Math.max(0.001, easeOutBack(bloom)));
      petals.rotation.z = now * 0.15;
      flower.rotation.y = -lean * 0.4;

      // colours
      M.leafA.color.copy(GREEN).lerp(DRY, thirst * 0.75);
      M.leafB.color.copy(GREEN2).lerp(DRY, thirst * 0.75);
      M.soil.color.copy(SOIL_DRY).lerp(SOIL_WET, st.moist);

      // face
      const eyeLook = cursor.seen ? clamp((cursor.x - potX) / W(), -0.5, 0.5) * 0.05 : 0;
      const eyeOpen = st.sleeping ? 0.06 : (1 - thirst * 0.4) * (st.blink > 0 ? 0.08 : 1);
      const happyOn = !st.sleeping && (st.happy > 0.5 || (st.bloomAt && now < st.bloomAt + 3.2));
      eyes.forEach((e, i) => {
        e.visible = !happyOn;
        e.scale.set(1, Math.max(0.06, eyeOpen), 1);
        e.position.x = (i === 0 ? -0.118 : 0.118) + eyeLook;
      });
      happyEyes.forEach((a) => { a.visible = !!happyOn; });
      st.mouth = damp(st.mouth, st.pour > 0.5 || (sc && sc.phase === "fall") ? 0.9 : 0, 14, dt);
      mouthOpen.scale.y = Math.max(0.001, st.mouth);
      smile.visible = st.mouth < 0.3 && thirst < 0.55;
      frown.visible = st.mouth < 0.3 && thirst >= 0.55;
      sweat.visible = thirst > 0.6;
      sweat.position.y = 0.4 + Math.sin(now * 3) * 0.015;

      // watering can (on whichever side has room)
      const pv = clamp(st.pour, 0, 1);
      canG.visible = pv > 0.02;
      const canE = easeInOut(pv);
      canG.position.set(st.canSide * 0.64, 1.62 + 0.5 * (1 - canE) + Math.sin(now * 2.4) * 0.01 + Math.max(0, topPoint() - 1.7) * 0.4, 0.42);
      canG.rotation.y = st.canSide > 0 ? Math.PI : 0;
      canG.rotation.z = -0.9 * canE;
      canG.scale.setScalar(0.45 + 0.7 * canE);
      canG.updateMatrixWorld(true);

      // butterfly
      fly.visible = st.g >= 0.97;
      if (fly.visible) {
        const t = now * 0.7;
        fly.position.set(Math.sin(t) * 0.75, topPoint() + 0.15 + Math.sin(t * 2.1) * 0.22, 0.35 + Math.cos(t) * 0.3);
        fly.rotation.z = Math.cos(t) * 0.35;
        wings.forEach((w) => { w.piv.rotation.y = w.s * (0.15 + Math.abs(Math.sin(now * 16)) * 1.0); });
      }

      placeHit();
      const top = stage.px(-st.canSide * 0.55, topPoint());
      bubble.place(top.x, top.y + 6);
    }

    api.update = update;
    api.fit = fit;
    api.save = save;
    api.set = (g, m = 1) => { st.g = g; st.moist = m; st.said = { hello: true, drink: true }; if (g >= 0.88) st.said.bloom = true; };
    api.enter = () => {
      st.active = true; st.sleeping = false; st.trick = null; st.pour = 0; st.pourUntil = 0; st.holding = false;
      hit.hidden = false; world.pending = null;
      rm.x = rm.home().x; rm.y = rm.home().y;
      rm.begin("drop", st.g < 0.04 ? "Hi! I'm Sprout. Water me? 🌱" : st.moist < 0.4 ? "You're back! I'm thirsty 💧" : "Welcome back! 🌿");
    };
    api.leave = () => { st.active = false; hit.hidden = true; bubble.hide(); rm.script = null; rm.free = false; };
    return api;
  }

  /* ================================================================ MITRA (people) */
  function makeMitra() {
    const stage = createStage(2.3, 2.55, 0.9, 0.18, "fr-mitra");
    const { scene } = stage;
    const bubble = makeBubble("#f00281");
    const hit = makeHit("fr-mitra-hit", "Mitra the Pawse volunteer. Tap for a high five.");

    const M = {
      skin: soft(0xc98b60),
      skinDeep: soft(0xb87750),
      hair: glossy(0x241613, { roughness: 0.45, clearcoat: 0.3 }),
      shirt: soft(0x7a27a9, { bumpScale: 0.1 }),
      pants: soft(0x2c3e82, { bumpScale: 0.1 }),
      shoe: glossy(0xbef521, { roughness: 0.45, clearcoat: 0.5 }),
      sole: glossy(0xffffff, { roughness: 0.6 }),
      collar: glossy(0xbef521, { roughness: 0.45 }),
      eye: eyeMat(),
      mouth: glossy(0x4a2530, { roughness: 0.7 }),
      tongue: glossy(0xff9cb4, { roughness: 0.6 }),
      blush: new THREE.MeshBasicMaterial({ color: 0xff7aa5, transparent: true, opacity: 0.4 }),
    };
    const pawTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const g = c.getContext("2d");
      g.fillStyle = "#bef521";
      const e = (x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fill(); };
      e(64, 84, 26, 21);
      e(30, 56, 11, 15, -0.45); e(50, 36, 11, 16, -0.15); e(78, 36, 11, 16, 0.15); e(98, 56, 11, 15, 0.45);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();

    // hierarchy: bodyG (position, hop, squash) > yawG > legs + torsoG (lean) > arms, head
    const bodyG = new THREE.Group();
    scene.add(bodyG);
    const yawG = new THREE.Group();
    bodyG.add(yawG);
    const HIP = 0.34;

    const legs = [-1, 1].map((s) => {
      const g = new THREE.Group();
      g.position.set(s * 0.105, HIP, 0);
      g.add(mesh(new THREE.CapsuleGeometry(0.07, 0.14, 8, 16), M.pants, 0, -0.13, 0));
      const shoe = new THREE.Group();
      shoe.add(mesh(sph(0.09, 18), M.shoe, 0, 0, 0.0, 1, 0.62, 1.5));
      shoe.add(mesh(sph(0.09, 18), M.sole, 0, -0.03, 0.0, 1.02, 0.28, 1.52));
      shoe.position.set(0, -0.285, 0.05);
      g.add(shoe);
      yawG.add(g);
      return g;
    });

    const torsoG = new THREE.Group();
    torsoG.position.y = HIP;
    yawG.add(torsoG);
    torsoG.add(mesh(new THREE.CapsuleGeometry(0.17, 0.1, 10, 24), M.shirt, 0, 0.2, 0, 1.08, 1, 0.9));
    torsoG.add(mesh(sph(0.175, 24), M.pants, 0, 0.0, 0, 1.05, 0.5, 0.88)); // hips
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15),
      new THREE.MeshBasicMaterial({ map: pawTex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }));
    decal.position.set(0, 0.24, 0.158);
    decal.rotation.x = -0.12;
    torsoG.add(decal);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.022, 10, 32), M.collar);
    collar.rotation.x = Math.PI / 2 - 0.15;
    collar.position.set(0, 0.395, 0.02);
    torsoG.add(collar);

    // arms
    const arms = [-1, 1].map((s) => {
      const sh = new THREE.Group();
      sh.position.set(s * 0.2, 0.34, 0);
      sh.rotation.order = "ZXY";
      sh.add(mesh(sph(0.06, 16), M.shirt));
      sh.add(mesh(new THREE.CapsuleGeometry(0.056, 0.085, 8, 14), M.shirt, 0, -0.075, 0));
      const el = new THREE.Group();
      el.position.y = -0.17;
      el.rotation.order = "ZXY";
      el.add(mesh(new THREE.CapsuleGeometry(0.046, 0.1, 8, 14), M.skin, 0, -0.075, 0));
      el.add(mesh(sph(0.058, 18), M.skin, 0, -0.19, 0));
      sh.add(el);
      torsoG.add(sh);
      return { sh, el, s };
    });
    const [armL, armR] = arms;

    // head
    const head = new THREE.Group();
    head.position.set(0, 0.7, 0.01);
    head.rotation.order = "YXZ";
    torsoG.add(head);
    head.add(mesh(sph(0.33, 40), M.skin, 0, 0, 0, 1.06, 0.98, 1));
    head.add(mesh(sph(0.065, 14), M.skin, 0.345, -0.01, -0.02, 0.6, 1, 0.8));
    head.add(mesh(sph(0.065, 14), M.skin, -0.345, -0.01, -0.02, 0.6, 1, 0.8));
    head.add(mesh(sph(0.03, 14), M.skinDeep, 0, -0.045, 0.325, 1.1, 0.85, 0.9)); // nose
    // hair: cap tilted back, bangs, side pieces and a little bun
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.345, 36, 22, 0, TAU, 0, Math.PI * 0.47), M.hair);
    cap.scale.set(1.09, 1.02, 1.07);
    cap.rotation.x = -0.35;
    head.add(cap);
    head.add(mesh(sph(0.17, 20), M.hair, 0, 0.235, 0.2, 1.55, 0.42, 0.7));
    [-1, 1].forEach((s) => head.add(mesh(sph(0.1, 14), M.hair, s * 0.3, 0.07, -0.02, 0.8, 1.5, 1)));
    head.add(mesh(sph(0.12, 18), M.hair, 0, 0.36, -0.12));
    // face
    const eyes = [], happyEyes = [];
    [-1, 1].forEach((s) => {
      const g = new THREE.Group();
      g.position.set(s * 0.122, 0.0, 0.285);
      g.add(mesh(sph(0.06, 22), M.eye, 0, 0, 0, 1, 1.18, 0.7));
      g.add(mesh(sph(0.021, 12), shineMat, s * -0.015, 0.03, 0.036));
      g.add(mesh(sph(0.01, 10), shineMat, s * 0.017, -0.017, 0.038));
      head.add(g);
      eyes.push(g);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.013, 8, 20, Math.PI), M.eye);
      arc.position.set(s * 0.122, -0.02, 0.292);
      arc.visible = false;
      head.add(arc);
      happyEyes.push(arc);
      const br = mesh(sph(0.032, 12), M.hair, s * 0.122, 0.105, 0.285, 1.9, 0.38, 0.5);
      br.rotation.z = s * -0.18;
      head.add(br);
      const bl = mesh(sph(0.04, 16), M.blush, s * 0.205, -0.065, 0.252, 1, 0.7, 0.3);
      bl.rotation.y = s * 0.6;
      head.add(bl);
    });
    const smile = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.07, -0.105, 0.31), new THREE.Vector3(-0.035, -0.14, 0.318), new THREE.Vector3(0, -0.15, 0.32),
      new THREE.Vector3(0.035, -0.14, 0.318), new THREE.Vector3(0.07, -0.105, 0.31)]), 20, 0.0075, 8), M.mouth);
    const mouthOpen = mesh(sph(0.06, 18), M.mouth, 0, -0.14, 0.305, 1.35, 1, 0.45);
    mouthOpen.scale.y = 0.001;
    const tongue = mesh(sph(0.03, 12), M.tongue, 0, -0.165, 0.318, 1.3, 0.6, 0.5);
    tongue.visible = false;
    head.add(smile, mouthOpen, tongue);

    const shadow = makeShadow(1.15);
    scene.add(shadow);

    /* ---- pose */
    const REST = { rax: 0, raz: 0.2, rel: 0.08, rez: 0, lax: 0, laz: 0.2, lel: 0.08, lez: 0, hp: 0, hy: 0, hr: 0, mouth: 0, happy: 0, eyes: 1, lean: 0, bend: 0 };
    const P = { ...REST }, T = { ...REST }, O = {};
    const resetO = () => Object.assign(O, { hop: 0, legL: 0, legR: 0, armL: 0, armR: 0, spin: 0, lean: 0 });
    resetO();

    const rm = makeRoamer(stage);
    const st = {
      active: false, hovered: false, yaw: 0, yawT: 0, phase: 0, amp: 0,
      trick: null, last: "", order: [], sq: 0, sqv: 0,
      blink: 0, blinkIn: rand(1.5, 3.5), idleLine: rand(26, 40), lastTouch: 0, lookIn: rand(3, 6), look: 0, said: {}, idleWave: rand(14, 22),
      sleeping: false, zzzAt: 0,
    };

    const LEAD = 0.25;
    const env = (u, a = 0.18, b = 0.82) => easeInOut(clamp(u / a, 0, 1)) * (1 - easeInOut(clamp((u - b) / (1 - b), 0, 1)));
    function handPx(arm) {
      scene.updateMatrixWorld(true);
      const v = new THREE.Vector3(0, -0.19, 0);
      arm.el.localToWorld(v);
      return stage.px(v.x, v.y, v.z);
    }
    const TRICKS = {
      wave: {
        dur: 2.2, say: "Hi there! 👋",
        run(u, t) {
          const k = env(u, 0.15, 0.85);
          T.raz = lerp(0.2, 2.25, k); T.rel = 0.3 * k; T.rez = Math.sin(t * 11) * 0.5 * k;
          T.hr = 0.12 * k; T.happy = 0.6 * k;
        },
      },
      highfive: {
        dur: 1.5, say: "Up top! ✋",
        run(u) {
          const k = env(u, 0.22, 0.85);
          T.raz = lerp(0.2, 2.3, k); T.rax = -0.1 * k; T.rel = 0.1 * k; T.happy = 0.5 * k; T.mouth = 0.3 * k;
          O.hop = Math.sin(clamp((u - 0.3) / 0.3, 0, 1) * Math.PI) * 0.05;
          if (u > 0.42 && !this.hit) {
            this.hit = true; st.sq = 0.1;
            const p = handPx(armR);
            pop(p.x, p.y, ["✋", "✨", "💜", "⭐"], 6, 22);
            bus("cheer");
          }
          if (u < 0.1) this.hit = false;
        },
      },
      namaste: {
        dur: 2.1, say: "Namaste 🙏",
        run(u) {
          const k = env(u, 0.22, 0.82);
          [["r", 1], ["l", -1]].forEach(([n, s]) => {
            T[n + "az"] = lerp(0.2, -0.25, k); T[n + "ax"] = -0.7 * k; T[n + "el"] = lerp(0.08, 2.0, k);
            T[n + "ez"] = s * 0.5 * k;
          });
          T.hp = 0.28 * k; T.happy = 1 * k; O.lean = 0;
        },
      },
      cheer: {
        dur: 1.7, say: "Yaaay! 🎉",
        run(u, t) {
          const k = env(u, 0.15, 0.85);
          T.raz = T.laz = lerp(0.2, 2.4, k); T.rel = T.lel = 0.15 * k;
          T.mouth = 0.8 * k; T.happy = 0.5 * k; T.hp = -0.18 * k;
          O.hop = Math.abs(Math.sin(u * Math.PI * 2.5)) * 0.12 * k;
          T.rez = Math.sin(t * 14) * 0.2 * k; T.lez = -T.rez;
          if (u > 0.12 && !this.did) { this.did = true; const p = stage.px(0, 1.45); pop(p.x, p.y, ["🎉", "💜", "✨", "🎊"], 8, 50); bus("cheer"); }
          if (u < 0.05) this.did = false;
        },
      },
      hug: {
        dur: 2.4, say: "Group hug! 🤗",
        run(u, t) {
          const k = env(u, 0.25, 0.8);
          [["r", 1], ["l", -1]].forEach(([n, s]) => {
            T[n + "az"] = lerp(0.2, 1.5, k); T[n + "ax"] = -0.45 * k; T[n + "el"] = 0.7 * k; T[n + "ez"] = -s * 0.25 * k;
          });
          T.bend = 0.12 * k; T.hp = 0.08 * k; T.happy = 1 * k;
          O.lean = Math.sin(t * 4) * 0.05 * k;
          if (u > 0.3 && !this.did) { this.did = true; const p = stage.px(0, 1.5); pop(p.x, p.y, ["💜", "💗", "💖", "💞"], 9, 46); }
          if (u < 0.05) this.did = false;
        },
      },
      dance: {
        dur: 3.1, say: "♪ Pawse party! ♪",
        run(u, t) {
          const k = env(u, 0.1, 0.9);
          const b = Math.sin(t * 7);
          O.lean = b * 0.13 * k; O.hop = Math.abs(b) * 0.07 * k;
          T.raz = lerp(0.2, 1.7 + b * 0.8, k); T.laz = lerp(0.2, 1.7 - b * 0.8, k);
          T.rel = 0.5 * k; T.lel = 0.5 * k;
          T.hr = -b * 0.12 * k; T.happy = 0.8 * k; T.mouth = 0.3 * k;
          O.legL = Math.sin(t * 7) * 0.25 * k; O.legR = -Math.sin(t * 7) * 0.25 * k;
        },
      },
      fistpump: {
        dur: 1.4, say: "Yes! 💪",
        run(u, t) {
          const k = env(u, 0.18, 0.84);
          T.raz = lerp(0.2, 1.0, k); T.rax = -0.5 * k; T.rel = lerp(0.08, 1.9, k) + Math.sin(t * 15) * 0.18 * k;
          T.happy = 0.9 * k; T.mouth = 0.5 * k; O.hop = Math.abs(Math.sin(u * Math.PI * 2)) * 0.07 * k;
        },
      },
    };
    const TAP_ORDER = ["highfive", "namaste", "cheer", "hug", "dance", "wave", "fistpump"];

    function startTrick(name, line) {
      const def = TRICKS[name];
      if (!def) return;
      st.trick = { name, def, t: 0 };
      st.last = name;
      st.yawT = 0;
      st.lastTouch = clock.now;
      bubble.say(line || def.say, def.dur * 1000 + 400);
    }
    function nextTap() {
      if (!st.order.length) {
        st.order = TAP_ORDER.slice();
        // shuffle but always open with the high five
        for (let i = st.order.length - 1; i > 1; i--) { const j = 1 + Math.floor(Math.random() * i); [st.order[i], st.order[j]] = [st.order[j], st.order[i]]; }
        if (st.order[0] === st.last) st.order.push(st.order.shift());
      }
      return st.order.shift();
    }

    hit.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      startTrick(nextTap());
    });
    hit.addEventListener("click", (e) => { if (e.detail === 0) startTrick(nextTap()); });

    function fit() { stage.fit(sizeFor(84, 100, 112)); }
    function placeHit() {
      const base = stage.px(0, 0);
      const top = stage.px(0, 1.42);
      const half = stage.S * 0.5;
      setBox(hit, base.x - half, top.y, half * 2, base.y - top.y + 10);
    }
    hit.addEventListener("pointerenter", () => { st.hovered = true; });
    hit.addEventListener("pointerleave", () => { st.hovered = false; });
    rm.onEnd = (sc) => startTrick({ drop: "cheer", run: "wave", rise: "fistpump", pop: "highfive" }[sc.type] || "wave", sc.line);

    const LINES = ["Tap me for a high five! ✋", "Every volunteer counts 💜", "Be kind. It's free. 🌍", "Friends make everything better!", "Pawse is people, too 😊"];
    function update(dt, now) {
      if (!st.active) return;
      resetO();
      Object.assign(T, REST);
      const sc = rm.script;
      const S = stage.S;
      rm.top = 1.5;

      // movement: follow the cursor, visit hovered buttons, arrive at new sections
      const info = rm.step(dt, now, { who: "mitra", canPlan: !st.trick && !st.sleeping && !st.hovered, frozen: !!st.trick || st.hovered || st.sleeping });
      const sp = rm.speed();
      if (!sc && info.atHover && rm.idle > 0.3 && now > rm.hoverTrickAt && !st.trick) {
        rm.hoverTrickAt = now + 6;
        startTrick(pick(["wave", "highfive", "cheer", "fistpump"]), hoverLine(info.hov, "mitra"));
      }

      // sleep when nobody has touched the page for a while
      const idleReal = performance.now() / 1000 - world.lastAct;
      if (!sc && !st.trick) {
        if (!st.sleeping && idleReal > 30) { st.sleeping = true; st.zzzAt = now + 5.5; bubble.say("Zzz…", 2400); }
        else if (st.sleeping && idleReal < 0.6) { st.sleeping = false; startTrick("cheer", "Oh! Hi again! 👋"); }
      }

      if (st.trick) {
        const tk = st.trick;
        tk.t += dt;
        if (tk.t >= LEAD) {
          const u = clamp((tk.t - LEAD) / tk.def.dur, 0, 1);
          tk.def.run(u, tk.t);
          if (u >= 1) { st.trick = null; st.lastTouch = now; }
        }
      } else if (st.sleeping) {
        T.hp = 0.42; T.bend = 0.07; T.eyes = 0; T.raz = T.laz = 0.12;
        if (now > st.zzzAt) { st.zzzAt = now + 5.5; bubble.say("Zzz…", 2400); }
      } else if (!sc) {
        st.idleWave -= dt;
        if (st.idleWave <= 0 && cursor.seen && rm.idle > 1) { st.idleWave = rand(20, 34); startTrick("wave", ""); bubble.hide(); }
        if (now - st.lastTouch > st.idleLine && now > bubble.until + 3) {
          st.lastTouch = now; st.idleLine = rand(30, 52);
          bubble.say(pick(LINES), 2400);
        }
        st.lookIn -= dt;
        if (st.lookIn <= 0) { st.look = rand(-0.5, 0.5); st.lookIn = rand(3, 6); }
        T.hr = Math.sin(now * 0.8) * 0.04;
        // look at the cursor
        const hp = stage.px(0, 1.0);
        const worldYaw = clamp(Math.atan2(cursor.x - hp.x, 380), -1.1, 1.1);
        const pitch = clamp(Math.atan2(cursor.y - hp.y, 420), -0.4, 0.35);
        T.hy = cursor.seen ? worldYaw * 0.7 : st.look;
        T.hp = cursor.seen ? pitch * 0.6 : 0;
        T.lean = cursor.seen ? worldYaw * 0.05 : 0;
      }

      // script poses: falling in, running in, climbing in, popping in
      if (sc) {
        if (sc.phase === "fall") { T.raz = T.laz = 2.45; T.rel = T.lel = 0.25; T.mouth = 0.8; O.legL += 0.5; O.legR -= 0.4; st.yawT = 0; }
        if (sc.type === "pop" && !sc.fx) { sc.fx = true; pop(rm.x, rm.y - S * 0.8, ["✨", "💜", "⭐"], 6, 30); }
        if (sc.landed) { sc.landed = false; st.sq = 0.3; pop(rm.x, rm.y - S * 0.2, ["💨", "✨"], 4, 28); }
      }

      // gait follows the real speed
      const moving = sp > S * 0.25;
      st.amp = damp(st.amp, moving ? clamp(sp / (S * 1.5), 0.4, 1) : 0, 10, dt);
      if (moving) st.phase += dt * (7 + (sp / S) * 2.4);
      const sw = Math.sin(st.phase) * 0.75 * st.amp;
      O.legL += sw; O.legR -= sw;
      O.armL -= sw * 0.7; O.armR += sw * 0.7;
      O.hop += Math.abs(Math.sin(st.phase)) * 0.05 * st.amp;

      // facing: his direction of travel, otherwise a little towards the cursor
      if (sp > S * 0.35) st.yawT = Math.atan2(rm.vx, rm.vy * 0.9 + 0.001);
      else if (st.trick || (sc && sc.phase === "fall")) st.yawT = 0;
      else st.yawT = cursor.seen ? clamp((cursor.x - rm.x) / (W() * 0.5), -1, 1) * 0.4 : 0;

      // smooth
      const rate = st.trick && st.trick.t > LEAD ? 16 : 9;
      for (const k of Object.keys(P)) P[k] = damp(P[k], T[k], k === "eyes" ? 22 : rate, dt);
      st.blinkIn -= dt;
      if (st.blinkIn <= 0) { st.blink = 0.13; st.blinkIn = rand(2.2, 5); }
      if (st.blink > 0) st.blink -= dt;
      st.sqv += (-90 * st.sq - 9 * st.sqv) * dt; st.sq += st.sqv * dt;
      st.yaw += wrapPi(st.yawT - st.yaw) * (1 - Math.exp(-8 * dt));

      stage.place(rm.x, rm.y);
      applyRig(now, dt);
    }

    function applyRig(now, dt) {
      const breathe = Math.sin(now * (st.sleeping ? 1.2 : 2.1)) * 0.008;
      const sc = rm.script;
      const pscale = sc && sc.type === "pop" ? Math.max(0.001, easeOutBack(clamp(sc.u, 0, 1))) : 1;
      bodyG.position.set(0, O.hop, 0);
      bodyG.scale.set(pscale * (1 + st.sq * 0.5), pscale * (1 - st.sq), pscale * (1 + st.sq * 0.5));
      yawG.rotation.y = st.yaw + O.spin;
      torsoG.rotation.set(P.bend, 0, P.lean + O.lean);
      torsoG.scale.set(1 + breathe * 0.5, 1 + breathe, 1);
      legs[0].rotation.x = O.legL;
      legs[1].rotation.x = O.legR;
      // arms (right = +x)
      armR.sh.rotation.set(P.rax + O.armR, 0, P.raz);
      armR.el.rotation.set(-P.rel, 0, P.rez);
      armL.sh.rotation.set(P.lax + O.armL, 0, -P.laz);
      armL.el.rotation.set(-P.lel, 0, P.lez);
      head.rotation.set(P.hp, P.hy, P.hr);

      const happyOn = P.happy > 0.5;
      const eyeOpen = clamp(P.eyes, 0, 1) * (st.blink > 0 ? 0.08 : 1);
      eyes.forEach((e) => { e.visible = !happyOn; e.scale.set(1, Math.max(0.06, eyeOpen), 1); });
      happyEyes.forEach((a) => { a.visible = happyOn; });
      const mo = clamp(P.mouth, 0, 1);
      mouthOpen.scale.y = Math.max(0.001, mo * 0.9);
      smile.visible = mo < 0.3;
      tongue.visible = mo > 0.5;

      shadow.scale.setScalar(1 / (1 + Math.max(0, O.hop) * 0.9));
      shadow.material.opacity = clamp(1 - Math.max(0, O.hop) * 0.4, 0.35, 1);

      placeHit();
      const hp = stage.px(0, 1.42);
      bubble.place(hp.x, hp.y);
    }

    const api = { enabled: false, stage, bubble, hit, st, rm, update, fit };
    api.enter = () => {
      st.active = true; st.sleeping = false; st.trick = null; st.said = {};
      hit.hidden = false; world.pending = null;
      rm.x = rm.home().x; rm.y = rm.home().y;
      rm.begin("run", "Hi! I'm Mitra, a Pawse volunteer 💜");
    };
    api.leave = () => { st.active = false; hit.hidden = true; bubble.hide(); rm.script = null; rm.free = false; };
    api.trick = startTrick;
    api.TRICKS = TRICKS;
    return api;
  }

  /* ================================================================ wiring */
  const sprout = makeSprout();
  const mitra = makeMitra();
  const members = [
    { key: "pawseSprout", name: sprout, left: 66, label: "Show or hide Sprout the plant", title: "Sprout the plant",
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 22v-8"/><path d="M12 14c0-4 2.6-6.6 7.5-6.8.2 4.9-2.6 7.2-7.5 6.8z"/><path d="M12 16c0-3.2-2-5.4-6-5.6-.2 3.9 2 5.9 6 5.6z"/><rect x="11.1" y="13" width="1.8" height="9" rx=".9"/></svg>` },
    { key: "pawseMitra", name: mitra, left: 118, label: "Show or hide Mitra the volunteer", title: "Mitra the volunteer",
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="6.5" r="3.6"/><path d="M5 21c0-4.6 3-7.6 7-7.6s7 3 7 7.6z"/></svg>` },
  ];

  let running = true, last = performance.now();
  function frame(t) {
    if (!running) return;
    const dt = Math.min(clock.maxDt, (t - last) / 1000);
    last = t;
    if (!clock.freeze) clock.now += dt;
    for (const m of members) {
      const c = m.name;
      if (!c.enabled || !c.st.active) continue;
      try { if (!clock.freeze) c.update(dt, clock.now); } catch (err) { window.__frErr = String(err && err.stack || err); console.error("[friends]", err); }
      c.stage.renderer.render(c.stage.scene, c.stage.camera);
    }
    requestAnimationFrame(frame);
  }

  function applyEnabled(m) {
    const c = m.name;
    c.stage.canvas.hidden = !c.enabled;
    c.hit.hidden = !c.enabled || !c.st.active;
    if (!c.enabled) c.bubble.hide();
  }

  // Only one companion at a time: Pawsy (paws), Sprout (planet) or Mitra (people).
  // Pawsy's own toggle (pawse-pup.js) stays the source of truth for Pawsy.
  const pupToggle = () => document.querySelector(".pup-toggle");
  const pupOn = () => { const t = pupToggle(); return !!t && t.getAttribute("aria-pressed") === "true"; };
  const setFriend = (m, on) => {
    m.name.enabled = on;
    m.btn.setAttribute("aria-pressed", String(on));
    try { localStorage.setItem(m.key + "Show", on ? "on" : "off"); } catch (_) {}
    if (on) m.name.enter(); else m.name.leave();
    applyEnabled(m);
  };
  const hideFriends = (except) => members.forEach((o) => { if (o !== except && o.name.enabled) setFriend(o, false); });
  const hidePawsy = () => { if (pupOn()) pupToggle().click(); };

  members.forEach((m) => {
    let on = false; // Pawsy is the default companion
    try { on = localStorage.getItem(m.key + "Show") === "on"; } catch (_) {}
    m.name.enabled = on;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "fr-toggle";
    b.style.setProperty("--l", m.left + "px");
    b.setAttribute("aria-label", m.label);
    b.title = m.title;
    b.setAttribute("aria-pressed", String(on));
    b.innerHTML = m.icon;
    document.body.appendChild(b);
    m.btn = b;
    b.addEventListener("click", () => {
      const on2 = !m.name.enabled;
      if (on2) { hidePawsy(); hideFriends(m); }
      setFriend(m, on2);
    });
  });
  // choosing Pawsy hides the friends (runs after Pawsy's own click handler)
  let hooked = false;
  const hookPup = window.setInterval(() => {
    const t = pupToggle();
    if (!t) return;
    window.clearInterval(hookPup);
    if (hooked) return;
    hooked = true;
    t.addEventListener("click", () => { if (pupOn()) hideFriends(null); });
    // a saved friend choice wins over Pawsy's default-on
    if (members.some((m) => m.name.enabled)) hidePawsy();
  }, 120);
  window.setTimeout(() => window.clearInterval(hookPup), 15000);

  function fitAll() { members.forEach((m) => m.name.fit()); }
  window.addEventListener("resize", fitAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  });

  fitAll();
  members.forEach(applyEnabled);
  clock.now = 0;
  members.forEach((m) => { if (m.name.enabled) window.setTimeout(() => { m.name.enter(); applyEnabled(m); }, 900); });
  requestAnimationFrame(frame);

  if (/[?&]friendsdebug/.test(location.search)) window.friends = { sprout, mitra, bus, pop, clock, world };
}
})();
