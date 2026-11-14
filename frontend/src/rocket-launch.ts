/**
 * Fullscreen Three.js SLS/Artemis-style 3D launch into space, then reveal homepage.
 */
import * as THREE from 'three'

const DURATION_MS = 8500

function matOrange() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xc84e1a,
    metalness: 0.18,
    roughness: 0.52,
    clearcoat: 0.4,
    clearcoatRoughness: 0.5,
  })
}
function matWhite() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xf4f7fb,
    metalness: 0.55,
    roughness: 0.28,
    clearcoat: 0.65,
    clearcoatRoughness: 0.25,
  })
}
function matDark() {
  return new THREE.MeshStandardMaterial({
    color: 0x2a323b,
    metalness: 0.85,
    roughness: 0.28,
  })
}
function matNavy() {
  return new THREE.MeshStandardMaterial({
    color: 0x0b3d91,
    metalness: 0.4,
    roughness: 0.38,
  })
}
function matFoam() {
  return new THREE.MeshStandardMaterial({
    color: 0xe8ebe8,
    metalness: 0.05,
    roughness: 0.92,
  })
}
function matGold() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xc9a227,
    metalness: 0.9,
    roughness: 0.35,
    clearcoat: 0.4,
  })
}

function addCylinder(
  parent: THREE.Object3D,
  rTop: number,
  rBot: number,
  h: number,
  y: number,
  material: THREE.Material,
  segments = 48,
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segments), material)
  mesh.position.y = y
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

/** NASA SLS Block 1 + Orion / LAS — procedural, readable at launch-camera distance. */
function buildRocket(): THREE.Group {
  const rocket = new THREE.Group()
  const orange = matOrange()
  const white = matWhite()
  const dark = matDark()
  const navy = matNavy()
  const foam = matFoam()
  const gold = matGold()

  // —— Core Stage (LOX/LH2 orange tank) ——
  addCylinder(rocket, 0.64, 0.66, 5.4, -0.15, orange, 64)

  // Intertank / weld rings
  for (const y of [-2.1, -0.9, 0.35, 1.55, 2.35]) {
    addCylinder(rocket, 0.668, 0.668, 0.045, y, dark, 48)
  }
  // LOX forward skirt band
  addCylinder(rocket, 0.67, 0.67, 0.28, 2.05, white, 48)
  addCylinder(rocket, 0.672, 0.672, 0.08, 2.05, navy, 48)

  // Systems tunnel (external cable tray)
  const tunnel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 5.0, 0.12), dark)
  tunnel.position.set(0.58, -0.1, 0.28)
  tunnel.castShadow = true
  rocket.add(tunnel)

  // Engine section / thrust structure
  addCylinder(rocket, 0.66, 0.7, 0.55, -2.95, dark, 48)
  // Four RS-25 nozzles
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.26, 0.72, 24),
      dark,
    )
    bell.position.set(Math.cos(a) * 0.32, -3.45, Math.sin(a) * 0.32)
    bell.castShadow = true
    rocket.add(bell)
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.02, 8, 24), gold)
    lip.rotation.x = Math.PI / 2
    lip.position.copy(bell.position)
    lip.position.y -= 0.36
    rocket.add(lip)
  }

  // —— Launch Vehicle Stage Adapter / ICPS ——
  addCylinder(rocket, 0.5, 0.64, 0.55, 2.85, white, 40)
  addCylinder(rocket, 0.48, 0.5, 0.85, 3.45, white, 40)
  addCylinder(rocket, 0.485, 0.485, 0.06, 3.45, navy, 40)

  // —— Orion crew module + European Service Module ——
  const service = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.48, 0.55, 36), dark)
  service.position.y = 4.05
  service.castShadow = true
  rocket.add(service)
  // Solar-wing stubs
  for (const side of [-1, 1] as const) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.35), navy)
    panel.position.set(side * 0.7, 4.05, 0)
    rocket.add(panel)
  }

  const heatShield = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.42, 0.12, 36), dark)
  heatShield.position.y = 4.38
  rocket.add(heatShield)

  const capsule = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.55),
    white,
  )
  capsule.position.y = 4.62
  capsule.castShadow = true
  rocket.add(capsule)

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x1a6a9a,
    metalness: 0.95,
    roughness: 0.05,
    transmission: 0.2,
    transparent: true,
    opacity: 0.92,
    emissive: 0x082033,
    emissiveIntensity: 0.25,
  })
  for (const [x, z] of [
    [0.28, 0.28],
    [-0.1, 0.38],
  ] as const) {
    const win = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), glass)
    win.position.set(x, 4.55, z)
    rocket.add(win)
  }

  // Launch Abort System tower
  addCylinder(rocket, 0.12, 0.22, 0.55, 5.2, white, 20)
  addCylinder(rocket, 0.06, 0.12, 1.05, 5.95, white, 16)
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 12), white)
  tip.position.y = 6.6
  rocket.add(tip)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.35, 10), dark)
    motor.position.set(Math.cos(a) * 0.16, 5.35, Math.sin(a) * 0.16)
    motor.rotation.z = Math.cos(a) * 0.35
    motor.rotation.x = Math.sin(a) * 0.35
    rocket.add(motor)
  }

  // —— Twin solid rocket boosters ——
  for (const side of [-1, 1] as const) {
    const booster = new THREE.Group()
    addCylinder(booster, 0.3, 0.32, 4.55, 0.05, white, 40)
    // Segment rings
    for (const y of [-1.6, -0.55, 0.5, 1.55]) {
      addCylinder(booster, 0.325, 0.325, 0.05, y, dark, 28)
    }
    // Forward frustum + nose
    addCylinder(booster, 0.22, 0.3, 0.45, 2.45, white, 28)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 28), white)
    nose.position.y = 2.95
    nose.castShadow = true
    booster.add(nose)
    // Foam tip
    addCylinder(booster, 0.08, 0.14, 0.2, 3.35, foam, 16)

    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.36, 0.65, 28), dark)
    nozzle.position.y = -2.55
    nozzle.castShadow = true
    booster.add(nozzle)
    const nozzleLip = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.025, 8, 28), gold)
    nozzleLip.rotation.x = Math.PI / 2
    nozzleLip.position.y = -2.88
    booster.add(nozzleLip)

    // Attach hardware / aft skirt
    const aft = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.22), dark)
    aft.position.set(side * -0.22, -1.4, 0)
    booster.add(aft)
    const fwd = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.18), dark)
    fwd.position.set(side * -0.2, 1.2, 0)
    booster.add(fwd)

    // Thrust vector actuator hint
    const actuator = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), dark)
    actuator.position.set(0.12, -2.1, 0.2)
    actuator.rotation.z = 0.4
    booster.add(actuator)

    booster.position.set(side * 1.05, -0.25, 0)
    rocket.add(booster)
  }

  // NASA worm / flag plate (simple navy rectangle on core)
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.02), navy)
  plate.position.set(0, 0.9, 0.66)
  rocket.add(plate)
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.015), white)
  mark.position.set(0, 0.9, 0.675)
  rocket.add(mark)

  rocket.scale.setScalar(1.02)
  return rocket
}

function buildExhaust(rocket: THREE.Group) {
  const group = new THREE.Group()
  const light = new THREE.PointLight(0xffa040, 0, 32, 2)
  light.position.y = -3.8
  group.add(light)

  const flameGeo = new THREE.ConeGeometry(0.45, 2.8, 24, 1, true)
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xffe8b0,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const flame = new THREE.Mesh(flameGeo, flameMat)
  flame.rotation.x = Math.PI
  flame.position.y = -4.4
  group.add(flame)

  const outerGeo = new THREE.ConeGeometry(0.95, 4.6, 24, 1, true)
  const outerMat = new THREE.MeshBasicMaterial({
    color: 0xff4e12,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const outer = new THREE.Mesh(outerGeo, outerMat)
  outer.rotation.x = Math.PI
  outer.position.y = -5.3
  group.add(outer)

  // Booster side plumes
  const sideFlames: THREE.Mesh[] = []
  for (const x of [-1.05, 1.05]) {
    const sideMat = flameMat.clone()
    const side = new THREE.Mesh(new THREE.ConeGeometry(0.32, 2.2, 16, 1, true), sideMat)
    side.rotation.x = Math.PI
    side.position.set(x, -3.5, 0)
    group.add(side)
    sideFlames.push(side)
  }

  const count = 280
  const positions = new Float32Array(count * 3)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xffb060,
      size: 0.16,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  )
  group.add(points)

  rocket.add(group)

  return {
    update(time: number, thrust: number) {
      flameMat.opacity = thrust * (0.82 + Math.sin(time * 42) * 0.12)
      outerMat.opacity = thrust * (0.52 + Math.sin(time * 27) * 0.1)
      flame.scale.set(1, 0.9 + thrust * (0.55 + Math.sin(time * 38) * 0.12), 1)
      outer.scale.set(1, 0.95 + thrust * (0.75 + Math.sin(time * 24) * 0.15), 1)
      for (const side of sideFlames) {
        const m = side.material as THREE.MeshBasicMaterial
        m.opacity = thrust * (0.7 + Math.sin(time * 35 + side.position.x) * 0.1)
        side.scale.set(1, 0.85 + thrust * (0.5 + Math.sin(time * 40) * 0.1), 1)
      }
      light.intensity = thrust * (18 + Math.sin(time * 33) * 4)
      ;(points.material as THREE.PointsMaterial).opacity = thrust * 0.85
      const arr = geo.attributes.position.array as Float32Array
      for (let i = 0; i < count; i++) {
        const seed = i * 12.9898
        const fall = (time * 2.8 + seed) % 1
        const spread = fall * fall * 1.9
        const lane = i % 3
        const ox = lane === 1 ? -1.05 : lane === 2 ? 1.05 : 0
        arr[i * 3] = ox + Math.sin(seed) * spread * (lane === 0 ? 1 : 0.55)
        arr[i * 3 + 1] = -3.5 - fall * (3.5 + thrust * 4.2)
        arr[i * 3 + 2] = Math.cos(seed * 1.7) * spread * (lane === 0 ? 1 : 0.55)
      }
      geo.attributes.position.needsUpdate = true
    },
  }
}

function createStars() {
  const count = 2200
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 160
    positions[i * 3 + 1] = Math.random() * 180 - 20
    positions[i * 3 + 2] = (Math.random() - 0.5) * 160
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xe8f1ff,
      size: 0.1,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
    }),
  )
}

function main() {
  const bootEl = document.getElementById('rocket-boot')
  const host = document.getElementById('rocket-canvas')
  if (!(bootEl instanceof HTMLElement) || !(host instanceof HTMLCanvasElement)) return
  const root = bootEl

  let finished = false
  let endTimer = 0
  const launchedAt = performance.now()
  let renderer: THREE.WebGLRenderer | undefined
  // Hoisted so finish() can unregister before onResize is assigned.
  let onResize: () => void = () => {}

  const finish = (reason: string) => {
    if (finished) return
    finished = true
    console.info('[rocket-launch] finish', reason, Math.round(performance.now() - launchedAt), 'ms')
    window.clearTimeout(endTimer)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('keydown', onKey)
    renderer?.dispose()
    root.remove()
  }

  const skip = document.getElementById('rocket-skip')
  skip?.addEventListener('click', (event) => {
    event.preventDefault()
    finish('skip')
  })
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      finish('escape')
    }
  }
  window.addEventListener('keydown', onKey)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x02060f)
  scene.fog = new THREE.FogExp2(0x02060f, 0.011)

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 400)
  // Close 3/4 pad view so the SLS stack reads clearly before ascent.
  camera.position.set(5.2, 1.6, 9.4)

  renderer = new THREE.WebGLRenderer({
    canvas: host,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.25
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  scene.add(new THREE.HemisphereLight(0x9eb6ff, 0x1a120c, 0.55))
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.7)
  sun.position.set(10, 14, 8)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0x6ea8ff, 0.7)
  fill.position.set(-8, 3, -6)
  scene.add(fill)

  scene.add(createStars())

  const earthMat = new THREE.MeshStandardMaterial({
    color: 0x1a4d7a,
    roughness: 0.9,
    metalness: 0.05,
  })
  const earth = new THREE.Mesh(new THREE.SphereGeometry(20, 64, 64), earthMat)
  earth.position.set(0, -22.5, -6)
  earth.receiveShadow = true
  scene.add(earth)

  void new THREE.TextureLoader()
    .loadAsync('/textures/earth-day.png')
    .then((day) => {
      day.colorSpace = THREE.SRGBColorSpace
      earthMat.map = day
      earthMat.color.set(0xffffff)
      earthMat.needsUpdate = true
    })
    .catch(() => {
      /* keep solid earth */
    })

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(20.45, 48, 48),
    new THREE.MeshBasicMaterial({
      color: 0x4da3ff,
      transparent: true,
      opacity: 0.14,
      side: THREE.BackSide,
    }),
  )
  atmosphere.position.copy(earth.position)
  scene.add(atmosphere)

  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(2.8, 3.2, 0.4, 48),
    new THREE.MeshStandardMaterial({ color: 0x333c46, metalness: 0.7, roughness: 0.4 }),
  )
  pad.position.y = -3.7
  pad.receiveShadow = true
  scene.add(pad)

  // Flame trench hint
  const trench = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.15, 6),
    new THREE.MeshStandardMaterial({ color: 0x1a1e24, metalness: 0.6, roughness: 0.5 }),
  )
  trench.position.set(0, -3.85, -1.5)
  scene.add(trench)

  const rocket = buildRocket()
  const exhaust = buildExhaust(rocket)
  rocket.position.set(0, -0.35, 0)
  scene.add(rocket)

  const clock = new THREE.Clock()
  const start = performance.now()

  onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer!.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onResize)
  endTimer = window.setTimeout(() => finish('timer'), DURATION_MS)
  console.info('[rocket-launch] start', DURATION_MS)

  const tmpCam = new THREE.Vector3()
  let framed = false
  function frame() {
    if (finished || !document.body.contains(root)) return
    requestAnimationFrame(frame)

    if (!framed) {
      framed = true
      ;(window as Window & { __ROCKET_READY__?: boolean }).__ROCKET_READY__ = true
    }

    const elapsed = (performance.now() - start) / 1000
    const t = clock.getElapsedTime()

    let thrust = 0
    let altitude = 0
    if (elapsed < 0.85) {
      thrust = 0
    } else if (elapsed < 1.35) {
      thrust = (elapsed - 0.85) / 0.5
      altitude = thrust * 0.55
    } else if (elapsed < 6.8) {
      const u = (elapsed - 1.35) / 5.45
      thrust = 1
      altitude = 0.55 + Math.pow(u, 1.35) * 48
    } else {
      const u = Math.min(1, (elapsed - 6.8) / 1.5)
      thrust = Math.max(0.4, 1 - u * 0.4)
      altitude = 48.55 + u * 22
    }

    rocket.position.y = -0.35 + altitude
    rocket.rotation.z = Math.sin(elapsed * 1.5) * 0.01 * thrust
    rocket.rotation.x = Math.sin(elapsed * 1.05) * 0.007 * thrust
    exhaust.update(t, thrust)

    tmpCam.set(5.2 - altitude * 0.02, 1.6 + altitude * 0.82, 9.4 + altitude * 0.08)
    camera.position.lerp(tmpCam, 0.08)
    camera.lookAt(0, rocket.position.y + 1.6, 0)

    earth.rotation.y = elapsed * 0.035
    const fogDensity = Math.max(0.0015, 0.012 - altitude * 0.00022)
    scene.fog = new THREE.FogExp2(0x02060f, fogDensity)

    const fade = elapsed > 7.2 ? Math.min(1, (elapsed - 7.2) / 1.2) : 0
    root.style.opacity = String(1 - fade)

    renderer!.render(scene, camera)
  }

  requestAnimationFrame(frame)
}

main()
