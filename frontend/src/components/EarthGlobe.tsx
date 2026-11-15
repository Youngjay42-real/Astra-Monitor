import { useEffect, useRef, useState } from 'react'
import { Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`
const earthFragment = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(cameraPosition - vPosition);
    float sunlight = dot(normal, sunDirection);
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;
    float nightAmount = 1.0 - smoothstep(-0.15, 0.2, sunlight);
    vec3 color = day * (0.035 + max(sunlight, 0.0) * 1.6);
    color += night * vec3(1.0, 0.7, 0.4) * nightAmount * 1.2;
    float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 4.0);
    color += vec3(0.035, 0.18, 0.42) * rim * smoothstep(-0.3, 0.8, sunlight);
    float ocean = smoothstep(0.005, 0.08, day.b - max(day.r, day.g));
    float specular = pow(max(dot(normal, normalize(sunDirection + viewDirection)), 0.0), 70.0);
    color += vec3(0.4, 0.6, 0.8) * specular * ocean * 0.25;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
const cloudFragment = `
  uniform sampler2D cloudMap;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    float cloud = texture2D(cloudMap, vUv).a;
    float light = 0.045 + max(dot(normalize(vNormal), sunDirection), 0.0) * 1.45;
    gl_FragColor = vec4(vec3(light), cloud * 0.85);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
const atmosphereFragment = `
  uniform vec3 sunDirection;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(cameraPosition - vPosition);
    float rim = pow(1.0 - abs(dot(normal, viewDirection)), 3.2);
    float light = smoothstep(-0.5, 0.8, dot(normal, sunDirection));
    gl_FragColor = vec4(vec3(0.1, 0.42, 0.95), rim * light * 0.55);
    #include <colorspace_fragment>
  }
`
type GlobeActions = { zoom: (factor: number) => void; reset: () => void }

export default function EarthGlobe() {
  const host = useRef<HTMLDivElement>(null)
  const actions = useRef<GlobeActions | null>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])

  useEffect(() => {
    const mount = host.current
    if (!mount) return
    let cancelled = false
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }) }
    catch { queueMicrotask(() => { if (!cancelled) setPhase('fallback') }); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    const canvas = renderer.domElement
    canvas.tabIndex = 0
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', 'Interactive 3D Earth. Drag to rotate, use arrow keys to explore, plus or minus to zoom, and Home to reset.')
    mount.appendChild(canvas)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 30)
    camera.position.set(0, 0, 3.08)
    const controls = new OrbitControls(camera, canvas)
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.rotateSpeed = 0.5
    controls.zoomSpeed = 0.6
    controls.minDistance = 2.35
    controls.maxDistance = 4.8
    controls.saveState()
    canvas.style.touchAction = 'pan-y'
    const geometries: THREE.BufferGeometry[] = []
    const materials: THREE.Material[] = []
    const textures: THREE.Texture[] = []
    const earth = new THREE.Group()
    earth.rotation.set(0.08, -0.3, -0.13)
    scene.add(earth)
    const initialRotation = earth.rotation.clone()
    actions.current = {
      zoom(factor) { camera.position.setLength(THREE.MathUtils.clamp(camera.position.length() * factor, controls.minDistance, controls.maxDistance)); controls.update() },
      reset() { controls.reset(); earth.rotation.copy(initialRotation) },
    }
    function resize() {
      const { width, height } = mount!.getBoundingClientRect()
      if (!width || !height) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(mount)
    resize()
    let visible = true
    let ready = false
    let previous = 0
    let cloudMesh: THREE.Mesh | undefined
    function animate(now: number) {
      if (now - previous < 1000 / 30) return
      const delta = Math.min((now - previous) / 1000, 0.08)
      previous = now
      if (!pausedRef.current) { earth.rotation.y += delta * 0.022; if (cloudMesh) cloudMesh.rotation.y += delta * 0.008 }
      controls.update(delta)
      renderer.render(scene, camera)
    }
    function syncAnimation() { previous = 0; renderer.setAnimationLoop(ready && visible && !document.hidden ? animate : null) }
    const intersectionObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; syncAnimation() })
    intersectionObserver.observe(mount)
    document.addEventListener('visibilitychange', syncAnimation)
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    function onMotionChange(event: MediaQueryListEvent) { if (event.matches) setPaused(true) }
    motion.addEventListener('change', onMotionChange)
    function onKey(event: KeyboardEvent) {
      if (!ready) return
      const key = event.key
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(key)) event.preventDefault()
      if (key === 'ArrowLeft') earth.rotation.y -= 0.12
      if (key === 'ArrowRight') earth.rotation.y += 0.12
      if (key === 'ArrowUp') earth.rotation.x -= 0.08
      if (key === 'ArrowDown') earth.rotation.x += 0.08
      if (key === '+' || key === '=') actions.current?.zoom(0.9)
      if (key === '-') actions.current?.zoom(1.1)
      if (key === 'Home') actions.current?.reset()
    }
    function onContextLost(event: Event) { event.preventDefault(); ready = false; syncAnimation(); setPhase('fallback') }
    canvas.addEventListener('keydown', onKey)
    canvas.addEventListener('webglcontextlost', onContextLost)
    const loader = new THREE.TextureLoader()
    async function initialize() {
      try {
        const loaded = await Promise.allSettled(['/textures/earth-day.png', '/textures/earth-night.png', '/textures/earth-clouds.png'].map((url) => loader.loadAsync(url)))
        loaded.forEach((result) => { if (result.status === 'fulfilled') textures.push(result.value) })
        if (cancelled) { textures.forEach((texture) => texture.dispose()); return }
        if (loaded.some((result) => result.status === 'rejected')) throw new Error('earth_texture_unavailable')
        const [day, night, clouds] = textures
        day.colorSpace = THREE.SRGBColorSpace
        night.colorSpace = THREE.SRGBColorSpace
        textures.forEach((texture) => { texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8) })
        const sun = { value: new THREE.Vector3(4, 2, 3).normalize() }
        const surfaceGeometry = new THREE.SphereGeometry(1, 96, 64)
        const cloudGeometry = new THREE.SphereGeometry(1.008, 96, 64)
        const atmosphereGeometry = new THREE.SphereGeometry(1.027, 80, 64)
        geometries.push(surfaceGeometry, cloudGeometry, atmosphereGeometry)
        const surface = new THREE.ShaderMaterial({ vertexShader, fragmentShader: earthFragment, uniforms: { dayMap: { value: day }, nightMap: { value: night }, sunDirection: sun } })
        const cloud = new THREE.ShaderMaterial({ vertexShader, fragmentShader: cloudFragment, uniforms: { cloudMap: { value: clouds }, sunDirection: sun }, transparent: true, depthWrite: false })
        const atmosphere = new THREE.ShaderMaterial({ vertexShader, fragmentShader: atmosphereFragment, uniforms: { sunDirection: sun }, transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })
        materials.push(surface, cloud, atmosphere)
        cloudMesh = new THREE.Mesh(cloudGeometry, cloud)
        earth.add(new THREE.Mesh(surfaceGeometry, surface), cloudMesh, new THREE.Mesh(atmosphereGeometry, atmosphere))
        renderer.render(scene, camera)
        ready = true
        setPhase('ready')
        syncAnimation()
      } catch { if (!cancelled) setPhase('fallback') }
    }
    void initialize()
    return () => {
      cancelled = true
      ready = false
      renderer.setAnimationLoop(null)
      actions.current = null
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', syncAnimation)
      motion.removeEventListener('change', onMotionChange)
      canvas.removeEventListener('keydown', onKey)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      controls.dispose()
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      textures.forEach((texture) => texture.dispose())
      renderer.dispose()
      canvas.remove()
    }
  }, [])

  return <div className="earth-experience">
    <div className="earth-canvas" ref={host} data-state={phase} />
    {phase !== 'ready' && <div className={`earth-poster ${phase === 'loading' ? 'is-loading' : ''}`} role="status"><img src="/textures/earth-fallback.jpg" alt="" /><span className="visually-hidden">{phase === 'loading' ? 'Loading globe' : 'Globe unavailable on this device'}</span></div>}
    <div className="earth-controls"><span className="planet-caption">EARTH / OUR HOME PLANET</span><div className="control-buttons" aria-label="Earth controls">
      <button type="button" className="icon-button" aria-label={paused ? 'Resume rotation' : 'Pause rotation'} aria-pressed={paused} disabled={phase !== 'ready'} onClick={() => setPaused(!paused)}>{paused ? <Play /> : <Pause />}</button>
      <button type="button" className="icon-button" aria-label="Zoom in" disabled={phase !== 'ready'} onClick={() => actions.current?.zoom(0.88)}><Plus /></button>
      <button type="button" className="icon-button" aria-label="Zoom out" disabled={phase !== 'ready'} onClick={() => actions.current?.zoom(1.12)}><Minus /></button>
      <button type="button" className="icon-button" aria-label="Reset Earth view" disabled={phase !== 'ready'} onClick={() => actions.current?.reset()}><RotateCcw /></button>
    </div></div>
  </div>
}
