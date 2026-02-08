# 3D Framework Research: Temple Run Web Clone

## 1. Comparison Table

| Feature                        | Three.js                              | Babylon.js                            | Phaser                                |
|-------------------------------|---------------------------------------|---------------------------------------|---------------------------------------|
| **Primary Focus**             | 3D rendering library                  | Full 3D game engine                   | 2D game framework                     |
| **3D Rendering**              | Full WebGL/WebGPU                     | Full WebGL/WebGPU                     | Minimal (2D only, can load OBJ mesh)  |
| **Bundle Size (min+gzip)**    | ~168 KB                               | ~1.4 MB (full), modular imports avail | ~300 KB                               |
| **npm Weekly Downloads**      | ~5.5 million                          | ~13,000                               | ~55,000                               |
| **GitHub Stars**              | ~111,000                              | ~24,000                               | ~37,000                               |
| **Collision Detection**       | None built-in; use Rapier or cannon-es| Built-in basic; Physics V2 w/ Havok   | Built-in Arcade/Matter.js (2D only)   |
| **Procedural Geometry**       | Excellent (BufferGeometry API)        | Excellent (MeshBuilder + VertexData)  | N/A for 3D                            |
| **Particle System**           | Via libraries (three.quarks, Nebula)  | Built-in (CPU + GPU particle systems) | Built-in (2D only)                    |
| **Audio**                     | Built-in (AudioListener, PositionalAudio) | Built-in (Sound class, spatial audio) | Built-in (Web Audio)            |
| **Learning Curve**            | Moderate (library, you build the game)| Moderate-High (full engine, more API) | Easy (but wrong tool for 3D)          |
| **Endless Runner Examples**   | 10+ open-source clones on GitHub      | 2-3 examples on GitHub/forums         | Not applicable for 3D runners         |
| **Mobile Performance**        | Excellent (small bundle, lean)        | Good (heavier but optimized)          | Excellent for 2D                      |
| **Documentation Quality**     | Good (docs, Discover Three.js book)   | Excellent (official docs, playground) | Excellent (for 2D)                    |
| **Community & Ecosystem**     | Massive (largest WebGL community)     | Strong (Microsoft-backed)             | Large (but 2D-focused)                |
| **Inspector/DevTools**        | None built-in; use browser devtools   | Built-in Inspector & debugger         | None for 3D                           |

## 2. Pros and Cons

### Three.js

**Pros:**
- Dominant market share: 270x more npm downloads than Babylon.js, ensuring long-term support and abundant resources
- Lightweight bundle (~168 KB gzipped) -- critical for mobile web games where load time matters
- Massive ecosystem: 10+ open-source endless runner clones to reference and learn from (VaporRacer, Boxy-Run, multiple Subway Surfers clones)
- Flexible architecture -- it is a rendering library, not an opinionated engine, so we control the game loop and architecture
- BufferGeometry API is excellent for procedural geometry generation (key for endless path segments)
- Built-in positional audio via Web Audio API integration (AudioListener, PositionalAudio classes)
- WebGPU support landed in 2025, future-proofing the project
- Stack Overflow: thousands of answered questions; Three.js forum is active with daily responses
- Works well with modern tooling (Vite, ESM imports, TypeScript support)

**Cons:**
- No built-in physics/collision detection -- requires a third-party library (Rapier.js or cannon-es)
- No built-in particle system -- requires a library like three.quarks or Three Nebula
- No built-in scene inspector/debugger (rely on browser devtools or third-party tools)
- Being a library rather than an engine means more boilerplate for game-specific features (game loop, state management, UI)
- No built-in character controller or animation state machine

### Babylon.js

**Pros:**
- Full game engine with batteries included: physics (Havok integration via Physics V2), built-in GPU particle system, collision events, animation system
- Built-in Inspector and scene debugger -- very useful for development
- Physics V2 with Havok provides production-grade collision detection and rigid body dynamics
- Built-in GPU particle system is performant and comes with a visual particle editor
- Microsoft-backed with consistent releases and professional documentation
- Built-in character controller (recently added)
- Excellent official documentation with interactive Playground examples
- Sound class with spatial audio built-in

**Cons:**
- Much larger bundle size (~1.4 MB vs ~168 KB), which impacts mobile load times significantly
- Far smaller community: only ~13K weekly npm downloads vs Three.js's 5.5M
- Fewer endless runner examples and tutorials to reference (2-3 vs 10+)
- Steeper learning curve due to larger API surface
- More opinionated architecture may conflict with custom game loop requirements
- Heavier runtime overhead due to engine-level scene management
- Tree-shaking helps but still results in larger bundles than Three.js for equivalent features

### Phaser

**Pros:**
- Excellent 2D game framework with built-in physics, audio, and scene management
- Easy to learn for 2D games
- Active community for 2D game development

**Cons:**
- **Not a 3D framework** -- fundamentally disqualifying for a Temple Run clone
- Can only load basic OBJ meshes; no real 3D rendering pipeline
- No 3D physics or collision detection
- "3D" support is limited to a thin wrapper around Three.js (Phaser 3D plugin), which defeats the purpose
- No procedural 3D geometry generation
- Would require Three.js anyway for any meaningful 3D work

## 3. Recommendation: Three.js

**Three.js is the clear winner for this project.** Here is the rationale:

### Why Three.js Over Babylon.js

1. **Proven for endless runners**: There are 10+ open-source 3D endless runner clones built with Three.js. These serve as reference implementations, accelerating development. Babylon.js has only 2-3 such examples.

2. **Bundle size matters for web games**: At ~168 KB vs ~1.4 MB, Three.js loads 8x faster on mobile connections. For a casual web game, first-load performance directly impacts player retention.

3. **Community scale**: With 270x more npm downloads and 4.5x more GitHub stars, Three.js has a vastly larger pool of tutorials, Stack Overflow answers, and community knowledge. When we hit a problem, answers already exist.

4. **Right level of abstraction**: Three.js gives us a powerful rendering layer without imposing engine-level opinions. For a custom endless runner with procedural generation, we want control over the game loop, update cycle, and memory management. A full engine like Babylon.js adds overhead we do not need.

5. **Procedural geometry**: Three.js's BufferGeometry API is well-documented and battle-tested for procedural mesh generation -- exactly what we need for dynamically generating path segments.

6. **Phaser is eliminated**: It is a 2D framework and cannot render the 3D environment Temple Run requires.

### Why Not Babylon.js

Babylon.js is genuinely excellent and its built-in features (physics, particles, inspector) are compelling. However, the trade-offs do not favor it here:
- The features we would gain (built-in physics, particles) are easily added to Three.js via focused libraries that total far less than Babylon.js's overhead
- The community and example gap is significant for an endless runner specifically
- The bundle size penalty is real for a web game targeting mobile browsers

## 4. Basic Scene Setup (Three.js)

Here is a minimal Three.js scene that sets up the foundation for an endless runner -- a camera following a path with basic geometry:

```javascript
import * as THREE from 'three';

// -- Scene, Camera, Renderer --
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // sky blue
scene.fog = new THREE.Fog(0x87ceeb, 50, 150);  // hide path generation/despawn

const camera = new THREE.PerspectiveCamera(
  60,                                      // FOV
  window.innerWidth / window.innerHeight,  // aspect ratio
  0.1,                                     // near
  200                                      // far
);
camera.position.set(0, 5, -10); // behind and above the player
camera.lookAt(0, 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap for mobile
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// -- Lighting --
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
scene.add(dirLight);

// -- Player (placeholder cube) --
const playerGeometry = new THREE.BoxGeometry(1, 2, 1);
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff4444 });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
player.position.set(0, 1, 0);
player.castShadow = true;
scene.add(player);

// -- Ground / Path Segment (procedurally generated) --
function createPathSegment(zPosition) {
  const geometry = new THREE.BoxGeometry(6, 0.5, 20);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const segment = new THREE.Mesh(geometry, material);
  segment.position.set(0, -0.25, zPosition);
  segment.receiveShadow = true;
  scene.add(segment);
  return segment;
}

// Create initial path segments
const segments = [];
for (let i = 0; i < 10; i++) {
  segments.push(createPathSegment(i * 20));
}

// -- Game Loop --
const clock = new THREE.Clock();
let speed = 15; // units per second

function gameLoop() {
  requestAnimationFrame(gameLoop);
  const delta = clock.getDelta();

  // Move player forward
  player.position.z += speed * delta;

  // Camera follows player
  camera.position.z = player.position.z - 10;
  camera.lookAt(player.position.x, 2, player.position.z + 10);

  // Recycle path segments that fall behind the camera
  for (const seg of segments) {
    if (seg.position.z < player.position.z - 30) {
      // Move segment ahead of the furthest visible segment
      const maxZ = Math.max(...segments.map(s => s.position.z));
      seg.position.z = maxZ + 20;
    }
  }

  renderer.render(scene, camera);
}

// -- Handle Resize --
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

gameLoop();
```

**Key patterns demonstrated:**
- Scene setup with fog (hides segment spawn/despawn at distance)
- Shadow-enabled lighting
- Object pooling for path segments (recycle instead of create/destroy)
- Delta-time-based movement for frame-rate independence
- Camera follow system
- Responsive canvas resizing
- Pixel ratio capping for mobile performance

## 5. Recommended Libraries and Addons

| Library | Purpose | npm Package | Size |
|---------|---------|-------------|------|
| **Rapier** | Physics & collision detection | `@dimforge/rapier3d-compat` | ~250 KB (WASM) |
| **three.quarks** | GPU particle effects (fire, coins, powerups) | `three.quarks` | ~50 KB |
| **tweakpane** | Debug UI during development | `tweakpane` | ~30 KB |
| **howler.js** | Audio (alternative to Three.js built-in) | `howler` | ~10 KB |
| **gsap** | Smooth animations/tweens for UI and transitions | `gsap` | ~25 KB |
| **vite** | Build tool with HMR for fast development | `vite` | dev only |
| **lil-gui** | Lightweight debug GUI (alternative to tweakpane) | `lil-gui` | ~8 KB |

### Notes on key libraries:

**Rapier vs cannon-es**: Rapier is written in Rust and compiled to WASM, making it significantly faster than cannon-es for physics calculations. For an endless runner with continuous collision checks against obstacles, Rapier's performance advantage matters. However, for a Temple Run clone where collision detection is relatively simple (player vs obstacles, player vs collectibles), even basic AABB checks without a physics engine may suffice. Consider starting with simple bounding-box collision and adding Rapier only if needed.

**three.quarks**: A TypeScript-native particle system built specifically for Three.js. Supports GPU-accelerated particles, animation sheets, and has a visual editor. Ideal for effects like coin collection sparkles, power-up auras, and trail effects.

**Audio approach**: Three.js has built-in PositionalAudio via the Web Audio API. For a simple endless runner, this may be sufficient. Howler.js is a solid alternative if you need more control over audio sprites, volume ducking, or cross-browser compatibility.

**Build tooling**: Use Vite for development. It provides instant HMR, ESM-native imports, and excellent Three.js compatibility. The project template can be scaffolded with `npm create vite@latest`.

## 6. References

### Three.js Endless Runner Examples (GitHub)
- [VaporRacer](https://github.com/lr-m/VaporRacer) - Vaporwave Temple Run/Subway Surfers clone
- [Boxy-Run](https://github.com/wanfungchui/Boxy-Run) - Simple Temple Run-inspired game
- [Cave Runner](https://github.com/tope-olajide/cave-runner) - 3D endless runner with Vite
- [DanielLin0516/SUBWAY-SURFERS](https://github.com/DanielLin0516/SUBWAY-SURFERS) - Subway Surfers clone with Three.js
- [ThreeJSEndlessRunner3D](https://github.com/juwalbose/ThreeJSEndlessRunner3D) - Snowball runner prototype

### Tutorials
- [Envato Tuts+: Creating a Simple 3D Endless Runner](https://code.tutsplus.com/creating-a-simple-3d-endless-runner-game-using-three-js--cms-29157t)
- [Building an Endless Runner with Three.js, Mixamo, Vite](https://kingdavvid.hashnode.dev/building-an-endless-runner-game-with-threejs-mixamo-vite-and-planetscale-part-one)
- [Making a 3D Web Runner Game with Three.js](https://minapecheux.three-stones.org/projects/3d-web-runner-tutorial)

### Framework Comparisons
- [LogRocket: Three.js vs Babylon.js](https://blog.logrocket.com/three-js-vs-babylon-js/)
- [DEV.to: 360 Technical Comparison](https://dev.to/devin-rosario/babylonjs-vs-threejs-the-360deg-technical-comparison-for-production-workloads-2fn6)
- [BabylonJS vs ThreeJS: Easiest to Learn in 2026](https://vocal.media/01/babylon-js-vs-three-js-the-easiest-to-learn-in-2026)

### Library Documentation
- [Three.js Docs](https://threejs.org/docs/)
- [Rapier Physics](https://rapier.rs/docs/user_guides/javascript/advanced_collision_detection_js/)
- [three.quarks Particle System](https://github.com/Alchemist0823/three.quarks)
- [Three.js PositionalAudio](https://threejs.org/docs/api/en/audio/PositionalAudio.html)
