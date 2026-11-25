/** Minimal PLY loader for ASCII / binary little-endian XYZ(+RGB) and Graphdeco Gaussian SH DC. */

export type PlyCloud = {
  positions: Float32Array
  colors: Float32Array
  count: number
  isGaussian: boolean
  bbox: { min: [number, number, number]; max: [number, number, number] }
}

type Prop = { name: string; type: string }

function parseHeader(text: string): {
  format: 'ascii' | 'binary_little_endian' | 'binary_big_endian'
  vertexCount: number
  props: Prop[]
  headerBytes: number
} {
  const lines = text.split(/\r?\n/)
  let format: 'ascii' | 'binary_little_endian' | 'binary_big_endian' = 'ascii'
  let vertexCount = 0
  const props: Prop[] = []
  let inVertex = false
  let headerBytes = 0

  for (const line of lines) {
    headerBytes += line.length + 1
    const trimmed = line.trim()
    if (trimmed.startsWith('format ')) {
      const f = trimmed.split(/\s+/)[1]
      if (f === 'ascii' || f === 'binary_little_endian' || f === 'binary_big_endian') {
        format = f
      }
    } else if (trimmed.startsWith('element vertex ')) {
      vertexCount = Number(trimmed.split(/\s+/)[2])
      inVertex = true
    } else if (trimmed.startsWith('element ')) {
      inVertex = false
    } else if (inVertex && trimmed.startsWith('property ')) {
      const parts = trimmed.split(/\s+/)
      props.push({ type: parts[1], name: parts[parts.length - 1] })
    } else if (trimmed === 'end_header') {
      break
    }
  }
  return { format, vertexCount, props, headerBytes }
}

function typeSize(t: string): number {
  switch (t) {
    case 'char':
    case 'uchar':
    case 'int8':
    case 'uint8':
      return 1
    case 'short':
    case 'ushort':
    case 'int16':
    case 'uint16':
      return 2
    case 'int':
    case 'uint':
    case 'float':
    case 'int32':
    case 'uint32':
    case 'float32':
      return 4
    case 'double':
    case 'float64':
      return 8
    default:
      return 4
  }
}

function readNumber(
  view: DataView,
  offset: number,
  type: string,
  le: boolean,
): { value: number; size: number } {
  const size = typeSize(type)
  switch (type) {
    case 'char':
    case 'int8':
      return { value: view.getInt8(offset), size }
    case 'uchar':
    case 'uint8':
      return { value: view.getUint8(offset), size }
    case 'short':
    case 'int16':
      return { value: view.getInt16(offset, le), size }
    case 'ushort':
    case 'uint16':
      return { value: view.getUint16(offset, le), size }
    case 'int':
    case 'int32':
      return { value: view.getInt32(offset, le), size }
    case 'uint':
    case 'uint32':
      return { value: view.getUint32(offset, le), size }
    case 'float':
    case 'float32':
      return { value: view.getFloat32(offset, le), size }
    case 'double':
    case 'float64':
      return { value: view.getFloat64(offset, le), size }
    default:
      return { value: view.getFloat32(offset, le), size }
  }
}

function shDcToRgb(dc: number): number {
  const c = 0.5 + 0.28209479177387814 * dc
  return Math.min(1, Math.max(0, c))
}

export async function loadPly(buffer: ArrayBuffer): Promise<PlyCloud> {
  const headText = new TextDecoder('latin1').decode(buffer.slice(0, Math.min(buffer.byteLength, 65536)))
  if (!headText.startsWith('ply')) {
    throw new Error('Not a PLY file')
  }
  const { format, vertexCount, props, headerBytes } = parseHeader(headText)
  if (!vertexCount) throw new Error('PLY has no vertices')

  const idx = Object.fromEntries(props.map((p, i) => [p.name, i]))
  const need = ['x', 'y', 'z']
  for (const n of need) {
    if (!(n in idx)) throw new Error(`PLY missing property ${n}`)
  }

  const isGaussian =
    'f_dc_0' in idx && 'opacity' in idx && ('scale_0' in idx || 'rot_0' in idx)

  const positions = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]

  const hasRgb = 'red' in idx || 'r' in idx
  const rName = 'red' in idx ? 'red' : 'r'
  const gName = 'green' in idx ? 'green' : 'g'
  const bName = 'blue' in idx ? 'blue' : 'b'

  if (format === 'ascii') {
    const text = new TextDecoder().decode(buffer)
    const after = text.indexOf('end_header')
    const body = text.slice(after).split(/\r?\n/).slice(1)
    for (let i = 0; i < vertexCount; i++) {
      const parts = body[i]?.trim().split(/\s+/) ?? []
      const x = Number(parts[idx.x])
      const y = Number(parts[idx.y])
      const z = Number(parts[idx.z])
      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z
      min[0] = Math.min(min[0], x)
      min[1] = Math.min(min[1], y)
      min[2] = Math.min(min[2], z)
      max[0] = Math.max(max[0], x)
      max[1] = Math.max(max[1], y)
      max[2] = Math.max(max[2], z)

      if (hasRgb) {
        const scale = props[idx[rName]].type.includes('float') ? 1 : 1 / 255
        colors[i * 3] = Number(parts[idx[rName]]) * scale
        colors[i * 3 + 1] = Number(parts[idx[gName]]) * scale
        colors[i * 3 + 2] = Number(parts[idx[bName]]) * scale
      } else if (isGaussian) {
        colors[i * 3] = shDcToRgb(Number(parts[idx.f_dc_0]))
        colors[i * 3 + 1] = shDcToRgb(Number(parts[idx.f_dc_1]))
        colors[i * 3 + 2] = shDcToRgb(Number(parts[idx.f_dc_2]))
      } else {
        colors[i * 3] = 0.75
        colors[i * 3 + 1] = 0.78
        colors[i * 3 + 2] = 0.82
      }
    }
  } else {
    const le = format === 'binary_little_endian'
    const view = new DataView(buffer, headerBytes)
    const stride = props.reduce((s, p) => s + typeSize(p.type), 0)
    for (let i = 0; i < vertexCount; i++) {
      let off = i * stride
      const values: number[] = []
      for (const p of props) {
        const { value, size } = readNumber(view, off, p.type, le)
        values.push(value)
        off += size
      }
      const x = values[idx.x]
      const y = values[idx.y]
      const z = values[idx.z]
      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z
      min[0] = Math.min(min[0], x)
      min[1] = Math.min(min[1], y)
      min[2] = Math.min(min[2], z)
      max[0] = Math.max(max[0], x)
      max[1] = Math.max(max[1], y)
      max[2] = Math.max(max[2], z)

      if (hasRgb) {
        const scale = props[idx[rName]].type.includes('float') ? 1 : 1 / 255
        colors[i * 3] = values[idx[rName]] * scale
        colors[i * 3 + 1] = values[idx[gName]] * scale
        colors[i * 3 + 2] = values[idx[bName]] * scale
      } else if (isGaussian) {
        colors[i * 3] = shDcToRgb(values[idx.f_dc_0])
        colors[i * 3 + 1] = shDcToRgb(values[idx.f_dc_1])
        colors[i * 3 + 2] = shDcToRgb(values[idx.f_dc_2])
      } else {
        colors[i * 3] = 0.75
        colors[i * 3 + 1] = 0.78
        colors[i * 3 + 2] = 0.82
      }
    }
  }

  return { positions, colors, count: vertexCount, isGaussian, bbox: { min, max } }
}
