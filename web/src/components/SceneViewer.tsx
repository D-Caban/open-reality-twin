import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { PlyCloud } from '../lib/ply'
import type { SegObject } from '../lib/api'

type Props = {
  cloud: PlyCloud | null
  selected: SegObject | null
  heightMin: number
  heightMax: number
  heightFilterOn: boolean
}

function FitCamera({ cloud }: { cloud: PlyCloud }) {
  const { camera, controls } = useThree()
  useEffect(() => {
    const { min, max } = cloud.bbox
    const center = new THREE.Vector3(
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    )
    const size = new THREE.Vector3(max[0] - min[0], max[1] - min[1], max[2] - min[2])
    const radius = Math.max(size.length() * 0.6, 1)
    const cam = camera as THREE.PerspectiveCamera
    cam.near = Math.max(radius / 1000, 0.01)
    cam.far = radius * 50
    cam.position.set(center.x + radius, center.y + radius * 0.55, center.z + radius)
    cam.lookAt(center)
    cam.updateProjectionMatrix()
    const orbit = controls as unknown as { target: THREE.Vector3; update: () => void } | null
    if (orbit?.target) {
      orbit.target.copy(center)
      orbit.update()
    }
  }, [camera, cloud, controls])
  return null
}

function PointCloud({
  cloud,
  selected,
  heightMin,
  heightMax,
  heightFilterOn,
}: Props & { cloud: PlyCloud }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const n = cloud.count
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    let write = 0
    const selMin = selected?.aabb.min
    const selMax = selected?.aabb.max

    for (let i = 0; i < n; i++) {
      const x = cloud.positions[i * 3]
      const y = cloud.positions[i * 3 + 1]
      const z = cloud.positions[i * 3 + 2]
      if (heightFilterOn && (y < heightMin || y > heightMax)) continue

      pos[write * 3] = x
      pos[write * 3 + 1] = y
      pos[write * 3 + 2] = z

      let r = cloud.colors[i * 3]
      let gch = cloud.colors[i * 3 + 1]
      let b = cloud.colors[i * 3 + 2]

      if (selMin && selMax) {
        const inside =
          x >= selMin[0] &&
          x <= selMax[0] &&
          y >= selMin[1] &&
          y <= selMax[1] &&
          z >= selMin[2] &&
          z <= selMax[2]
        if (inside) {
          r = 0.35
          gch = 0.85
          b = 1.0
        } else {
          r *= 0.35
          gch *= 0.35
          b *= 0.35
        }
      }

      col[write * 3] = r
      col[write * 3 + 1] = gch
      col[write * 3 + 2] = b
      write++
    }

    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, write * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, write * 3), 3))
    g.computeBoundingSphere()
    return g
  }, [cloud, selected, heightMin, heightMax, heightFilterOn])

  const matRef = useRef<THREE.PointsMaterial>(null)

  return (
    <points geometry={geom}>
      <pointsMaterial
        ref={matRef}
        vertexColors
        size={0.035}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}

function SelectionBox({ selected }: { selected: SegObject | null }) {
  if (!selected?.aabb) return null
  const { min, max } = selected.aabb
  const center = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ] as [number, number, number]
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]] as [
    number,
    number,
    number,
  ]
  return (
    <mesh position={center}>
      <boxGeometry args={size} />
      <meshBasicMaterial color="#7eb8c9" wireframe transparent opacity={0.85} />
    </mesh>
  )
}

export function SceneViewer(props: Props) {
  return (
    <Canvas
      camera={{ fov: 55, position: [4, 3, 4], near: 0.01, far: 5000 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={['#0a1017']} />
      <ambientLight intensity={0.6} />
      {props.cloud ? (
        <>
          <PointCloud {...props} cloud={props.cloud} />
          <SelectionBox selected={props.selected} />
          <FitCamera cloud={props.cloud} />
        </>
      ) : null}
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  )
}
