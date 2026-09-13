// Google Encoded Polyline Algorithm Format decoder.
//
// Valhalla — and therefore Stadia Maps' routing API, which is Valhalla-based —
// returns route shapes as an encoded polyline string rather than a coordinate
// array. Their endpoint only accepts `shape_format` of `polyline6` (the
// default) or `polyline5`; asking for `geojson` is rejected with
// `400 unknown variant "geojson", expected "polyline6" or "polyline5"`.
// So the shape always has to be decoded on our side.
//
// `polyline6` = 1e6 precision (~0.1 m, what Stadia/Valhalla use);
// `polyline5` = 1e5 precision (the classic Google/OSRM-plugins flavour).
//
// Kept in its own module (no Prisma/dataset imports) so it can be unit-tested
// and reused without dragging in the server's data layer.

/**
 * Decode an encoded polyline into `[lat, lng]` pairs.
 *
 * Note the order: the encoded format stores latitude first, and this returns
 * `[lat, lng]` to match the rest of the codebase (Leaflet, SEGMENTS.coords).
 * GeoJSON would be the opposite (`[lng, lat]`) — see `shapeToLatLng()` in
 * engine/geometry.ts, which normalises either input to this order.
 */
export function decodePolyline(encoded: string, precision: 5 | 6 = 6): [number, number][] {
  const factor = precision === 6 ? 1e6 : 1e5
  const out: [number, number][] = []
  if (typeof encoded !== 'string' || !encoded.length) return out

  let index = 0
  let lat = 0
  let lng = 0

  // Each coordinate is a run of base64-ish chunks (5 payload bits + 1
  // continuation bit, offset by 63); the final value is zig-zag encoded.
  const readDelta = (): number => {
    let shift = 0
    let result = 0
    let byte = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
      // `index < encoded.length` guards a truncated string from looping on
      // NaN forever — malformed input yields a short route, not a hang.
    } while (byte >= 0x20 && index < encoded.length)
    return result & 1 ? ~(result >> 1) : result >> 1
  }

  while (index < encoded.length) {
    lat += readDelta()
    lng += readDelta()
    out.push([lat / factor, lng / factor])
  }
  return out
}

/** Encode `[lat, lng]` pairs — the inverse, used by tests/tools. */
export function encodePolyline(points: [number, number][], precision: 5 | 6 = 6): string {
  const factor = precision === 6 ? 1e6 : 1e5
  let out = ''
  let prevLat = 0
  let prevLng = 0

  const write = (value: number) => {
    // Zig-zag so negatives interleave with positives, then base64-ish chunks.
    let v = value < 0 ? ~(value << 1) : value << 1
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
      v >>= 5
    }
    out += String.fromCharCode(v + 63)
  }

  for (const [lat, lng] of points) {
    const rLat = Math.round(lat * factor)
    const rLng = Math.round(lng * factor)
    write(rLat - prevLat)
    write(rLng - prevLng)
    prevLat = rLat
    prevLng = rLng
  }
  return out
}
