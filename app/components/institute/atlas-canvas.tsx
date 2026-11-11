import { useEffect, useRef, useState } from 'react'

/* ==========================================================================
   The atlas — 89,800 readings as a point cloud, on the void register.

   The layout is fixed. It comes from `scripts/umap-atlas.py`, is fetched once
   as ~1.6MB of binary, and does not move when a query changes: a query lights
   points, it never rearranges them. That is the whole reason the map is worth
   building. A projection refitted per query would be a different space each
   time, and nothing learned from one search would carry to the next — where a
   stable map becomes a place the reader can come to know, and a query becomes a
   constellation *within* it. Whether a phrase lands in one tight cluster or
   scatters across the corpus is the finding, and only a fixed layout can show
   it.

   Colour follows §3 rather than any chart convention, and the encoding is
   deliberately thin. Level II against level III is *not* a colour channel: two
   near-neutrals fail both the chroma floor and CVD separation as a categorical
   pair, so level is a filter and a size, which are unambiguous. Ultramarine
   means one thing here — matched — and nothing else is ever accented.
   ========================================================================== */

/** §3. The one accent, lifted for the void ground (6.49:1). */
const ULTRA_LIFT = '#8B87FF'
const BONE = '#E8E5DE'
const VOID = '#0D0D0D'

/**
 * A named patch of the map, from `scripts/cluster-atlas.py` and
 * `scripts/name-atlas-clusters.mjs`. `center` is the member nearest the
 * cluster's mean, in the same normalised space as the positions.
 */
export type AtlasCluster = {
	id: number
	name: string
	size: number
	center: [number, number, number]
	terms: string[]
}

export type AtlasManifest = {
	formatVersion: number
	count: number
	works: number
	pairedWorks: number
	spreadFloor: number
	spreadCeiling: number
	fit: {
		nNeighbors: number
		minDist: number
		metric: string
		seed: number | null
	}
	noise: { uint8: number; uint16: number }
	regions: AtlasCluster[]
	neighborhoods: AtlasCluster[]
	layout: Record<string, { offset: number; byteLength: number; dtype: string }>
}

export type AtlasHit = { resourceId: number; level: number; similarity: number }

/** A reading on the map, and the places it sits in. */
export type AtlasPick = {
	resourceId: number
	level: number
	region: AtlasCluster | null
	neighborhood: AtlasCluster | null
}

export type AtlasHover =
	| (AtlasPick & {
			/** Cosine distance to the work's other reading, or null if it has none. */
			spread: number | null
			/** Screen position of the point, for placing the label. */
			x: number
			y: number
	  })
	| null

/**
 * The bytes 1.6MB of positions are read as, and the version `cluster-atlas.py`
 * writes. A file of another version is refused rather than misread.
 */
const FORMAT_VERSION = 2

/**
 * Camera distance below which neighborhood names replace region names. Home
 * is 1.9; the regions read from there, and a reader who has zoomed in by about
 * a third is looking at a patch small enough for its neighborhoods to mean
 * something.
 */
const NEIGHBORHOOD_DISTANCE = 1.3

/** A press that moves further than this is a drag to turn the map, not a pick. */
const CLICK_SLOP = 5

export type ColorMode = 'uniform' | 'spread'
export type LevelFilter = 'both' | 2 | 3

/**
 * Point size and colour are decided on the GPU, per frame, from four static
 * attributes and a handful of uniforms.
 *
 * The alternative — rewriting a colour buffer on the CPU whenever the query or
 * a filter changes — is 89,800 × 3 floats per change and a re-upload. Here a
 * new query writes one attribute (`aMatch`) and a filter writes none.
 */
const VERTEX_SHADER = /* glsl */ `
	attribute float aLevel;
	attribute float aSpread;
	attribute float aMatch;

	uniform float uSize;
	uniform float uMode;        // 0 uniform, 1 spread
	uniform float uHasQuery;
	uniform float uLevelFilter; // 0 both, else the level to keep
	uniform float uPixelRatio;

	varying vec3 vColor;
	varying float vAlpha;

	void main() {
		vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
		gl_Position = projectionMatrix * viewPosition;

		bool filteredOut = uLevelFilter > 0.5 && abs(aLevel - uLevelFilter) > 0.5;
		bool matched = aMatch > 0.001;

		// The sequential ramp for spread: one hue, monotone in lightness, so it
		// stays readable in greyscale and to a colour-blind reader. A rainbow
		// here would invent categories the measure does not have.
		//
		// aSpread is negative for a work with only one reading. Those points get
		// a flat dim neutral rather than the bottom of the ramp: they have no
		// spread to report, and painting them as "spread zero" would assert
		// something the data does not say.
		vec3 spreadLow = vec3(0.31, 0.31, 0.36);
		vec3 spreadHigh = vec3(0.545, 0.529, 1.0); // ULTRA_LIFT
		vec3 unpaired = vec3(0.28, 0.28, 0.27);
		vec3 ramped = aSpread < 0.0
			? unpaired
			: mix(spreadLow, spreadHigh, aSpread);
		vec3 corpusColor = mix(
			vec3(0.91, 0.898, 0.871),                  // BONE
			ramped,
			uMode
		);

		// A query dims the corpus rather than hiding it: the unlit points are
		// what make the lit ones mean something, and a constellation with the
		// sky removed is just a list again.
		float restingAlpha = mix(0.42, 0.07, uHasQuery);
		vColor = mix(corpusColor, vec3(0.545, 0.529, 1.0), matched ? 1.0 : 0.0);
		vAlpha = matched ? 0.6 + 0.4 * aMatch : restingAlpha;

		float size = uSize * (matched ? 2.6 : 1.0);
		// Level III sits a touch smaller than level II, so the two are separable
		// when both are shown without either being given a hue of its own.
		size *= aLevel > 2.5 ? 0.82 : 1.0;

		if (filteredOut) {
			vAlpha = 0.0;
			size = 0.0;
		}

		// Perspective attenuation, so depth reads as depth. uSize is the diameter
		// in CSS pixels at one unit from the camera, and the cloud is normalised
		// into a unit cube. The constant 300 seen in most three.js point shaders
		// belongs to scenes measured in hundreds of units; here it inflated every
		// point to roughly 390px and painted the corpus as one white mass.
		gl_PointSize = size * uPixelRatio / -viewPosition.z;
	}
`

const FRAGMENT_SHADER = /* glsl */ `
	varying vec3 vColor;
	varying float vAlpha;

	void main() {
		// Round points with a soft edge. Square points at this density read as
		// noise, and discarding outside the disc keeps the cloud from turning
		// into a grid of overlapping quads.
		vec2 offset = gl_PointCoord - vec2(0.5);
		float distance = length(offset);
		if (distance > 0.5 || vAlpha < 0.005) discard;
		float edge = smoothstep(0.5, 0.35, distance);
		gl_FragColor = vec4(vColor, vAlpha * edge);
	}
`

type AtlasData = {
	manifest: AtlasManifest
	positions: Float32Array
	resourceIds: Uint32Array
	levels: Uint8Array
	spreads: Uint8Array
	regions: Uint8Array
	neighborhoods: Uint16Array
}

async function loadAtlas(signal: AbortSignal): Promise<AtlasData> {
	const [manifest, buffer] = await Promise.all([
		fetch('/atlas/atlas.json', { signal }).then(
			(response) => response.json() as Promise<AtlasManifest>,
		),
		fetch('/atlas/atlas.bin', { signal }).then((response) =>
			response.arrayBuffer(),
		),
	])

	if (manifest.formatVersion !== FORMAT_VERSION) {
		throw new Error(
			`atlas.bin is format ${manifest.formatVersion}; this build reads ${FORMAT_VERSION}. Re-run scripts/cluster-atlas.py and scripts/name-atlas-clusters.mjs.`,
		)
	}

	const { layout } = manifest
	// Views over the one buffer, not copies — 1.6MB stays 1.6MB.
	return {
		manifest,
		positions: new Float32Array(
			buffer,
			layout.positions!.offset,
			layout.positions!.byteLength / 4,
		),
		resourceIds: new Uint32Array(
			buffer,
			layout.resourceIds!.offset,
			layout.resourceIds!.byteLength / 4,
		),
		levels: new Uint8Array(
			buffer,
			layout.levels!.offset,
			layout.levels!.byteLength,
		),
		spreads: new Uint8Array(
			buffer,
			layout.spreads!.offset,
			layout.spreads!.byteLength,
		),
		regions: new Uint8Array(
			buffer,
			layout.regions!.offset,
			layout.regions!.byteLength,
		),
		neighborhoods: new Uint16Array(
			buffer,
			layout.neighborhoods!.offset,
			layout.neighborhoods!.byteLength / 2,
		),
	}
}

export function AtlasCanvas({
	hits,
	colorMode,
	levelFilter,
	selected = null,
	onHover,
	onSelect,
	onReady,
	ambient = false,
}: {
	hits: Array<AtlasHit>
	colorMode: ColorMode
	levelFilter: LevelFilter
	/** The reading to ring on the map, if any. */
	selected?: { resourceId: number; level: number } | null
	onHover: (hover: AtlasHover) => void
	/** A point, or null for a click on empty space. */
	onSelect: (pick: AtlasPick | null) => void
	onReady: (manifest: AtlasManifest) => void
	/**
	 * The atlas as a backdrop rather than an instrument — the homepage hero.
	 * It turns slowly on its own, takes no pointer input (so it can never
	 * swallow the page's scroll or a phone's swipe), stops drawing while it is
	 * off screen, and holds still for a reader who asked for reduced motion.
	 */
	ambient?: boolean
}) {
	const containerRef = useRef<HTMLDivElement>(null)
	const labelsRef = useRef<HTMLDivElement>(null)
	const ringRef = useRef<HTMLDivElement>(null)
	const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
	const [message, setMessage] = useState<string | null>(null)

	/**
	 * The imperative half of the component, kept in a ref so React re-renders
	 * never touch the render loop. Every prop change below reaches the scene by
	 * writing a uniform or an attribute, not by rebuilding anything.
	 */
	const sceneRef = useRef<{
		data: AtlasData
		/** (resourceId, level) → point index; the join between search and geometry. */
		index: Map<number, number>
		match: Float32Array
		setUniform: (name: string, value: number) => void
		flushMatch: () => void
		/** Point index to ring, or -1. */
		setSelected: (index: number) => void
		dispose: () => void
	} | null>(null)

	useEffect(() => {
		const container = containerRef.current
		if (!container) return

		const abort = new AbortController()
		let disposed = false
		let cleanup: (() => void) | undefined

		// Passed in rather than closed over: TypeScript drops the null-narrowing
		// from the guard above once it crosses into a nested async function.
		async function start(element: HTMLDivElement) {
			// three.js is ~150KB and useless on the server, so it is fetched only
			// once this component actually mounts in a browser. WebGL never exists
			// during SSR, so there is nothing to guard beyond being in an effect.
			const [three, controlsModule, data] = await Promise.all([
				import('three'),
				import('three/examples/jsm/controls/OrbitControls.js'),
				loadAtlas(abort.signal),
			])
			if (disposed) return

			const THREE = three
			const { OrbitControls } = controlsModule
			const {
				positions,
				levels,
				spreads,
				resourceIds,
				regions,
				neighborhoods,
				manifest,
			} = data
			const regionById = new Map(manifest.regions.map((c) => [c.id, c]))
			const hoodById = new Map(manifest.neighborhoods.map((c) => [c.id, c]))
			const pickAt = (index: number): AtlasPick => ({
				resourceId: resourceIds[index]!,
				level: levels[index]!,
				region: regionById.get(regions[index]!) ?? null,
				neighborhood: hoodById.get(neighborhoods[index]!) ?? null,
			})

			const renderer = new THREE.WebGLRenderer({
				antialias: true,
				alpha: false,
				// Without this the drawing buffer is cleared the moment a frame is
				// composited, and both `canvas.toDataURL()` and a screenshot come
				// back blank — so a reader could not save a view they had found,
				// and the render could not be checked in a headless browser.
				preserveDrawingBuffer: true,
			})
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
			renderer.setSize(element.clientWidth, element.clientHeight)
			renderer.setClearColor(new THREE.Color(VOID), 1)
			element.appendChild(renderer.domElement)

			const scene = new THREE.Scene()
			const camera = new THREE.PerspectiveCamera(
				55,
				element.clientWidth / element.clientHeight,
				0.01,
				100,
			)
			camera.position.set(0, 0, ambient ? 1.45 : 1.9)

			const controls = new OrbitControls(camera, renderer.domElement)
			controls.enableDamping = true
			controls.dampingFactor = 0.08
			controls.rotateSpeed = 0.5
			controls.minDistance = 0.15
			controls.maxDistance = 8
			if (ambient) {
				controls.enabled = false
				controls.autoRotate = !window.matchMedia(
					'(prefers-reduced-motion: reduce)',
				).matches
				controls.autoRotateSpeed = 0.55
				renderer.domElement.style.pointerEvents = 'none'
				renderer.domElement.style.touchAction = 'auto'
			}

			const geometry = new THREE.BufferGeometry()
			geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
			geometry.setAttribute(
				'aLevel',
				new THREE.BufferAttribute(Float32Array.from(levels), 1),
			)
			geometry.setAttribute(
				'aSpread',
				// Byte 0 is "single reading", which the shader must not confuse with
				// the bottom of the ramp, so it becomes -1. Bytes 1–255 spread over
				// [0, 1]; the cosine distance they stand for is reconstructed only
				// where it is shown as a number, on hover.
				new THREE.BufferAttribute(
					Float32Array.from(spreads, (byte) =>
						byte === 0 ? -1 : (byte - 1) / 254,
					),
					1,
				),
			)
			const match = new Float32Array(manifest.count)
			const matchAttribute = new THREE.BufferAttribute(match, 1)
			matchAttribute.setUsage(THREE.DynamicDrawUsage)
			geometry.setAttribute('aMatch', matchAttribute)
			// The cloud is normalised into a unit cube, so the bounding sphere is
			// known and computing it over 89,800 points would be wasted work.
			geometry.boundingSphere = new THREE.Sphere(
				new THREE.Vector3(0, 0, 0),
				Math.sqrt(3),
			)

			const uniforms = {
				uSize: { value: 4.0 },
				uMode: { value: 0 },
				uHasQuery: { value: 0 },
				uLevelFilter: { value: 0 },
				uPixelRatio: { value: renderer.getPixelRatio() },
			}

			const material = new THREE.ShaderMaterial({
				uniforms,
				vertexShader: VERTEX_SHADER,
				fragmentShader: FRAGMENT_SHADER,
				transparent: true,
				// Depth writes would let a near dim point punch a hole in a far lit
				// one, which at this density reads as flicker rather than occlusion.
				depthWrite: false,
			})

			const points = new THREE.Points(geometry, material)
			scene.add(points)

			const index = new Map<number, number>()
			for (let i = 0; i < resourceIds.length; i++) {
				index.set(resourceIds[i]! * 4 + levels[i]!, i)
			}

			const raycaster = new THREE.Raycaster()
			// In world units of the normalised cube. Tight enough that hovering
			// picks one reading rather than a neighbourhood.
			raycaster.params.Points!.threshold = 0.012
			const pointer = new THREE.Vector2()
			let pointerInside = false
			let hoverDirty = false
			let lastHovered = -1
			let selectedIndex = -1
			const clientPointer = { x: 0, y: 0 }
			const pressedAt = { x: 0, y: 0 }

			function aim(event: PointerEvent | MouseEvent) {
				const rect = renderer.domElement.getBoundingClientRect()
				pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
				pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
				clientPointer.x = event.clientX - rect.left
				clientPointer.y = event.clientY - rect.top
			}

			/** The nearest showing reading under the pointer, or -1. */
			function hitTest() {
				raycaster.setFromCamera(pointer, camera)
				const filter = uniforms.uLevelFilter.value
				const hit = raycaster
					.intersectObject(points, false)
					.find(
						(intersection) =>
							intersection.index !== undefined &&
							(filter === 0 || levels[intersection.index] === filter),
					)
				return hit?.index ?? -1
			}

			function onPointerMove(event: PointerEvent) {
				aim(event)
				pointerInside = true
				hoverDirty = true
			}

			function onPointerLeave() {
				pointerInside = false
				hoverDirty = false
				lastHovered = -1
				onHover(null)
			}

			function onPointerDown(event: PointerEvent) {
				pressedAt.x = event.clientX
				pressedAt.y = event.clientY
			}

			// Tested at the click itself rather than read from the last hover, so
			// a tap on a touch screen, which has no hover, picks too.
			function onClick(event: MouseEvent) {
				// A drag that turned the map ends in a click as well; that one is
				// the reader letting go, not choosing.
				if (
					Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) >
					CLICK_SLOP
				) {
					return
				}
				aim(event)
				const index = hitTest()
				onSelect(index >= 0 ? pickAt(index) : null)
			}

			renderer.domElement.addEventListener('pointermove', onPointerMove)
			renderer.domElement.addEventListener('pointerleave', onPointerLeave)
			renderer.domElement.addEventListener('pointerdown', onPointerDown)
			renderer.domElement.addEventListener('click', onClick)

			/**
			 * Picking runs at most once per frame, never per pointer event.
			 *
			 * Raycasting Points is a linear scan over all 89,800, so a pointermove
			 * storm would otherwise queue dozens of full scans per frame.
			 */
			function pick() {
				if (!hoverDirty || !pointerInside) return
				hoverDirty = false
				const index = hitTest()

				if (index < 0) {
					if (lastHovered !== -1) {
						lastHovered = -1
						onHover(null)
					}
					return
				}
				if (index === lastHovered) return
				lastHovered = index
				const byte = spreads[index]!
				onHover({
					...pickAt(index),
					// Null rather than 0 for a single-reading work: the caller has to
					// say "no second reading", not "a distance of zero".
					spread:
						byte === 0
							? null
							: manifest.spreadFloor +
								((byte - 1) / 254) *
									(manifest.spreadCeiling - manifest.spreadFloor),
					x: clientPointer.x,
					y: clientPointer.y,
				})
			}

			// ----- names: regions from far out, neighborhoods up close -----------
			//
			// HTML laid over the canvas rather than text drawn in WebGL: it stays
			// crisp at any pixel ratio, takes the site's type, and is readable by
			// the browser's find-in-page. Largest first, so where two collide on
			// screen the bigger place keeps its name.
			type Label = {
				region: boolean
				element: HTMLSpanElement
				width: number
				height: number
				at: InstanceType<typeof THREE.Vector3>
			}
			const labels: Label[] = []
			const labelLayer = labelsRef.current
			if (labelLayer && !ambient) {
				for (const [list, region] of [
					[manifest.regions, true],
					[manifest.neighborhoods, false],
				] as const) {
					for (const cluster of [...list].sort((a, b) => b.size - a.size)) {
						if (!cluster.name) continue
						const label = document.createElement('span')
						label.textContent = cluster.name
						label.className = region
							? 'atlas-label atlas-label-region'
							: 'atlas-label atlas-label-hood'
						label.dataset.visible = 'false'
						labelLayer.appendChild(label)
						labels.push({
							region,
							element: label,
							width: 0,
							height: 0,
							at: new THREE.Vector3(...cluster.center),
						})
					}
				}
			}
			function measureLabels() {
				for (const label of labels) {
					label.width = label.element.offsetWidth
					label.height = label.element.offsetHeight
				}
			}
			measureLabels()
			void document.fonts?.ready.then(measureLabels)

			const projected = new THREE.Vector3()
			function placeLabels() {
				if (!labels.length) return
				const width = element.clientWidth
				const height = element.clientHeight
				const hoodsShown =
					camera.position.distanceTo(controls.target) < NEIGHBORHOOD_DISTANCE
				const taken: Array<[number, number, number, number]> = []
				for (const label of labels) {
					let visible = label.region !== hoodsShown
					if (visible) {
						projected.copy(label.at).project(camera)
						const x = (projected.x * 0.5 + 0.5) * width
						const y = (-projected.y * 0.5 + 0.5) * height
						const box: [number, number, number, number] = [
							x - label.width / 2 - 6,
							y - label.height / 2 - 3,
							x + label.width / 2 + 6,
							y + label.height / 2 + 3,
						]
						visible =
							projected.z < 1 &&
							box[0] > 0 &&
							box[2] < width &&
							box[1] > 0 &&
							box[3] < height &&
							!taken.some(
								(b) =>
									box[0] < b[2] &&
									box[2] > b[0] &&
									box[1] < b[3] &&
									box[3] > b[1],
							)
						if (visible) {
							taken.push(box)
							label.element.style.transform = `translate(${Math.round(box[0] + 6)}px, ${Math.round(box[1] + 3)}px)`
						}
					}
					label.element.dataset.visible = visible ? 'true' : 'false'
				}
			}

			/** Keeps the ring on the selected reading as the map turns. */
			function placeRing() {
				const ring = ringRef.current
				if (!ring) return
				if (selectedIndex < 0) {
					ring.dataset.visible = 'false'
					return
				}
				projected
					.set(
						positions[selectedIndex * 3]!,
						positions[selectedIndex * 3 + 1]!,
						positions[selectedIndex * 3 + 2]!,
					)
					.project(camera)
				const x = (projected.x * 0.5 + 0.5) * element.clientWidth
				const y = (-projected.y * 0.5 + 0.5) * element.clientHeight
				ring.dataset.visible = projected.z < 1 ? 'true' : 'false'
				ring.style.transform = `translate(${x}px, ${y}px)`
			}

			const observer = new ResizeObserver(() => {
				const { clientWidth, clientHeight } = element
				if (!clientWidth || !clientHeight) return
				camera.aspect = clientWidth / clientHeight
				camera.updateProjectionMatrix()
				renderer.setSize(clientWidth, clientHeight)
			})
			observer.observe(element)

			// A backdrop scrolled past is not worth a GPU frame per refresh.
			let onScreen = true
			const visibility = new IntersectionObserver(([entry]) => {
				onScreen = entry?.isIntersecting ?? true
			})
			if (ambient) visibility.observe(element)

			let frame = 0
			function animate() {
				frame = requestAnimationFrame(animate)
				if (!onScreen) return
				controls.update()
				pick()
				renderer.render(scene, camera)
				placeLabels()
				placeRing()
			}
			animate()

			sceneRef.current = {
				data,
				index,
				match,
				setUniform(name, value) {
					const uniform = uniforms[name as keyof typeof uniforms]
					if (uniform) uniform.value = value
				},
				flushMatch() {
					matchAttribute.needsUpdate = true
				},
				setSelected(next) {
					selectedIndex = next
				},
				dispose() {
					cancelAnimationFrame(frame)
					observer.disconnect()
					visibility.disconnect()
					renderer.domElement.removeEventListener('pointermove', onPointerMove)
					renderer.domElement.removeEventListener(
						'pointerleave',
						onPointerLeave,
					)
					renderer.domElement.removeEventListener('pointerdown', onPointerDown)
					renderer.domElement.removeEventListener('click', onClick)
					for (const label of labels) label.element.remove()
					controls.dispose()
					geometry.dispose()
					material.dispose()
					renderer.dispose()
					renderer.domElement.remove()
				},
			}

			cleanup = sceneRef.current.dispose
			setStatus('ready')
			onReady(manifest)
		}

		start(container).catch((error: unknown) => {
			if (abort.signal.aborted) return
			console.error('atlas failed to load', error)
			setMessage(
				error instanceof Error ? error.message : 'The atlas could not load.',
			)
			setStatus('error')
		})

		return () => {
			disposed = true
			abort.abort()
			cleanup?.()
			sceneRef.current = null
		}
		// Mounted once. The callbacks are read through the closure deliberately —
		// re-running this effect would tear down and rebuild the whole scene, and
		// with it the reader's camera position.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Query → lit points. One pass over the hits, not over the corpus.
	useEffect(() => {
		const current = sceneRef.current
		if (!current || status !== 'ready') return
		current.match.fill(0)
		for (const hit of hits) {
			const at = current.index.get(hit.resourceId * 4 + hit.level)
			if (at === undefined) continue
			// Similarity drives brightness, so the nearest readings are visibly
			// nearer rather than every match arriving at the same weight.
			current.match[at] = Math.max(0.15, Math.min(1, hit.similarity))
		}
		current.flushMatch()
		current.setUniform('uHasQuery', hits.length ? 1 : 0)
	}, [hits, status])

	useEffect(() => {
		sceneRef.current?.setUniform('uMode', colorMode === 'spread' ? 1 : 0)
	}, [colorMode, status])

	useEffect(() => {
		sceneRef.current?.setUniform(
			'uLevelFilter',
			levelFilter === 'both' ? 0 : levelFilter,
		)
	}, [levelFilter, status])

	const selectedKey = selected ? selected.resourceId * 4 + selected.level : -1
	useEffect(() => {
		const current = sceneRef.current
		if (!current || status !== 'ready') return
		current.setSelected(
			selectedKey < 0 ? -1 : (current.index.get(selectedKey) ?? -1),
		)
	}, [selectedKey, status])

	return (
		<div
			className="relative h-full w-full overflow-hidden"
			style={{ backgroundColor: VOID }}
		>
			<div ref={containerRef} className="h-full w-full" />
			{/* The map's place names. Decorative to a screen reader, which gets
			    the same names, per point, in the dialog a click opens. */}
			<div
				ref={labelsRef}
				aria-hidden="true"
				className="pointer-events-none absolute inset-0"
			/>
			<div
				ref={ringRef}
				aria-hidden="true"
				data-visible="false"
				className="atlas-ring pointer-events-none absolute top-0 left-0"
			/>
			{/* A backdrop that fails is simply the void ground; it has no reader
			    waiting on it, so it does not announce itself. */}
			{status !== 'ready' && !ambient ? (
				<div
					className="absolute inset-0 grid place-items-center px-6 text-center font-mono text-xs tracking-wide"
					style={{ color: status === 'error' ? '#D97A73' : BONE }}
				>
					{status === 'error'
						? (message ?? 'The atlas could not load.')
						: 'Loading the projection — 89,800 readings, 1.8 MB.'}
				</div>
			) : null}
		</div>
	)
}

export { ULTRA_LIFT, BONE, VOID }
