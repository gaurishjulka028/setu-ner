// ── SETU-NER sample dataset: North-East India districts, roads, vehicles ──
import type {
  District, Segment, Vehicle, Facility, ColdChainFacility, IncidentReport, StockLevels, Booking, Snapshot, CargoType,
} from '../types'

// Region-wide map view (NER bounding box)
export const NER_CENTER: [number, number] = [25.9, 93.2]
export const NER_ZOOM = 7

// ── District / road-network nodes (HQ towns) ───────────────────────────────
export const NODES: Record<string, { name: string; state: string; lat: number; lng: number }> = {
  GHY: { name: 'Guwahati', state: 'Assam', lat: 26.1445, lng: 91.7362 },
  NGN: { name: 'Nagaon', state: 'Assam', lat: 26.3491, lng: 92.6839 },
  JRH: { name: 'Jorhat', state: 'Assam', lat: 26.7509, lng: 94.2037 },
  DBR: { name: 'Dibrugarh', state: 'Assam', lat: 27.4728, lng: 94.912 },
  TSK: { name: 'Tinsukia', state: 'Assam', lat: 27.4923, lng: 95.3578 },
  TZP: { name: 'Tezpur', state: 'Assam', lat: 26.6338, lng: 92.7971 },
  LKP: { name: 'North Lakhimpur', state: 'Assam', lat: 27.2382, lng: 94.1035 },
  DMJ: { name: 'Dhemaji', state: 'Assam', lat: 27.4776, lng: 94.5469 },
  BNG: { name: 'Bongaigaon', state: 'Assam', lat: 26.4788, lng: 90.552 },
  DBRi: { name: 'Dhubri', state: 'Assam', lat: 26.0235, lng: 89.9745 },
  GLP: { name: 'Goalpara', state: 'Assam', lat: 26.1676, lng: 90.6268 },
  SIL: { name: 'Silchar', state: 'Assam', lat: 24.8333, lng: 92.7789 },
  KMG: { name: 'Karimganj', state: 'Assam', lat: 24.87, lng: 92.36 },
  HFL: { name: 'Haflong (Dima Hasao)', state: 'Assam', lat: 25.1683, lng: 93.0133 },
  DPH: { name: 'Diphu (Karbi Anglong)', state: 'Assam', lat: 25.8379, lng: 93.436 },
  SHL: { name: 'Shillong', state: 'Meghalaya', lat: 25.5788, lng: 91.8933 },
  JWI: { name: 'Jowai', state: 'Meghalaya', lat: 25.45, lng: 92.19 },
  TUR: { name: 'Tura', state: 'Meghalaya', lat: 25.5117, lng: 90.2183 },
  NST: { name: 'Nongstoin', state: 'Meghalaya', lat: 25.5189, lng: 91.2636 },
  AGT: { name: 'Agartala', state: 'Tripura', lat: 23.8315, lng: 91.2868 },
  DHR: { name: 'Dharmanagar', state: 'Tripura', lat: 24.3766, lng: 92.1616 },
  KSH: { name: 'Kailashahar', state: 'Tripura', lat: 24.3273, lng: 92.0001 },
  AZL: { name: 'Aizawl', state: 'Mizoram', lat: 23.7271, lng: 92.7176 },
  LGL: { name: 'Lunglei', state: 'Mizoram', lat: 22.8834, lng: 92.7739 },
  CPH: { name: 'Champhai', state: 'Mizoram', lat: 23.4565, lng: 93.3276 },
  IMP: { name: 'Imphal', state: 'Manipur', lat: 24.817, lng: 93.9368 },
  CCP: { name: 'Churachandpur', state: 'Manipur', lat: 24.3521, lng: 93.7006 },
  UKR: { name: 'Ukhrul', state: 'Manipur', lat: 25.12, lng: 94.36 },
  THB: { name: 'Thoubal', state: 'Manipur', lat: 24.6261, lng: 93.9928 },
  KHM: { name: 'Kohima', state: 'Nagaland', lat: 25.6672, lng: 94.1086 },
  DMP: { name: 'Dimapur', state: 'Nagaland', lat: 25.909, lng: 93.7256 },
  MKG: { name: 'Mokokchung', state: 'Nagaland', lat: 26.3167, lng: 94.5268 },
  MON: { name: 'Mon', state: 'Nagaland', lat: 26.7379, lng: 95.0024 },
  ITN: { name: 'Itanagar', state: 'Arunachal Pradesh', lat: 27.0844, lng: 93.6053 },
  TEZ: { name: 'Tezu', state: 'Arunachal Pradesh', lat: 27.9191, lng: 96.1706 },
  PSG: { name: 'Pasighat', state: 'Arunachal Pradesh', lat: 28.0651, lng: 95.3286 },
  ZRO: { name: 'Ziro', state: 'Arunachal Pradesh', lat: 27.6347, lng: 93.8284 },
  BDL: { name: 'Bomdila', state: 'Arunachal Pradesh', lat: 27.2674, lng: 92.4128 },
}

export const DISTRICTS: District[] = [
  { id: 'GHY', name: 'Kamrup (Guwahati)', state: 'Assam', lat: NODES.GHY.lat, lng: NODES.GHY.lng, hq: 'Guwahati', population: 1540000 },
  { id: 'NGN', name: 'Nagaon', state: 'Assam', lat: NODES.NGN.lat, lng: NODES.NGN.lng, hq: 'Nagaon', population: 1180000 },
  { id: 'JRH', name: 'Jorhat', state: 'Assam', lat: NODES.JRH.lat, lng: NODES.JRH.lng, hq: 'Jorhat', population: 924000 },
  { id: 'DBR', name: 'Dibrugarh', state: 'Assam', lat: NODES.DBR.lat, lng: NODES.DBR.lng, hq: 'Dibrugarh', population: 806000 },
  { id: 'TSK', name: 'Tinsukia', state: 'Assam', lat: NODES.TSK.lat, lng: NODES.TSK.lng, hq: 'Tinsukia', population: 766000 },
  { id: 'TZP', name: 'Sonitpur', state: 'Assam', lat: NODES.TZP.lat, lng: NODES.TZP.lng, hq: 'Tezpur', population: 1050000 },
  { id: 'LKP', name: 'Lakhimpur', state: 'Assam', lat: NODES.LKP.lat, lng: NODES.LKP.lng, hq: 'North Lakhimpur', population: 680000 },
  { id: 'DMJ', name: 'Dhemaji', state: 'Assam', lat: NODES.DMJ.lat, lng: NODES.DMJ.lng, hq: 'Dhemaji', population: 472000 },
  { id: 'BNG', name: 'Bongaigaon', state: 'Assam', lat: NODES.BNG.lat, lng: NODES.BNG.lng, hq: 'Bongaigaon', population: 738000 },
  { id: 'DBRi', name: 'Dhubri', state: 'Assam', lat: NODES.DBRi.lat, lng: NODES.DBRi.lng, hq: 'Dhubri', population: 1390000 },
  { id: 'GLP', name: 'Goalpara', state: 'Assam', lat: NODES.GLP.lat, lng: NODES.GLP.lng, hq: 'Goalpara', population: 1010000 },
  { id: 'SIL', name: 'Cachar', state: 'Assam', lat: NODES.SIL.lat, lng: NODES.SIL.lng, hq: 'Silchar', population: 1736000 },
  { id: 'KMG', name: 'Karimganj', state: 'Assam', lat: NODES.KMG.lat, lng: NODES.KMG.lng, hq: 'Karimganj', population: 1228000 },
  { id: 'HFL', name: 'Dima Hasao', state: 'Assam', lat: NODES.HFL.lat, lng: NODES.HFL.lng, hq: 'Haflong', population: 214000 },
  { id: 'DPH', name: 'Karbi Anglong', state: 'Assam', lat: NODES.DPH.lat, lng: NODES.DPH.lng, hq: 'Diphu', population: 660000 },
  { id: 'SHL', name: 'East Khasi Hills', state: 'Meghalaya', lat: NODES.SHL.lat, lng: NODES.SHL.lng, hq: 'Shillong', population: 825000 },
  { id: 'JWI', name: 'West Jaintia Hills', state: 'Meghalaya', lat: NODES.JWI.lat, lng: NODES.JWI.lng, hq: 'Jowai', population: 272000 },
  { id: 'TUR', name: 'West Garo Hills', state: 'Meghalaya', lat: NODES.TUR.lat, lng: NODES.TUR.lng, hq: 'Tura', population: 510000 },
  { id: 'NST', name: 'West Khasi Hills', state: 'Meghalaya', lat: NODES.NST.lat, lng: NODES.NST.lng, hq: 'Nongstoin', population: 253000 },
  { id: 'AGT', name: 'West Tripura', state: 'Tripura', lat: NODES.AGT.lat, lng: NODES.AGT.lng, hq: 'Agartala', population: 988000 },
  { id: 'DHR', name: 'North Tripura', state: 'Tripura', lat: NODES.DHR.lat, lng: NODES.DHR.lng, hq: 'Dharmanagar', population: 693000 },
  { id: 'KSH', name: 'Unakoti', state: 'Tripura', lat: NODES.KSH.lat, lng: NODES.KSH.lng, hq: 'Kailashahar', population: 298000 },
  { id: 'AZL', name: 'Aizawl', state: 'Mizoram', lat: NODES.AZL.lat, lng: NODES.AZL.lng, hq: 'Aizawl', population: 400000 },
  { id: 'LGL', name: 'Lunglei', state: 'Mizoram', lat: NODES.LGL.lat, lng: NODES.LGL.lng, hq: 'Lunglei', population: 154000 },
  { id: 'CPH', name: 'Champhai', state: 'Mizoram', lat: NODES.CPH.lat, lng: NODES.CPH.lng, hq: 'Champhai', population: 124000 },
  { id: 'IMP', name: 'Imphal West', state: 'Manipur', lat: NODES.IMP.lat, lng: NODES.IMP.lng, hq: 'Imphal', population: 520000 },
  { id: 'CCP', name: 'Churachandpur', state: 'Manipur', lat: NODES.CCP.lat, lng: NODES.CCP.lng, hq: 'Churachandpur', population: 274000 },
  { id: 'UKR', name: 'Ukhrul', state: 'Manipur', lat: NODES.UKR.lat, lng: NODES.UKR.lng, hq: 'Ukhrul', population: 183000 },
  { id: 'THB', name: 'Thoubal', state: 'Manipur', lat: NODES.THB.lat, lng: NODES.THB.lng, hq: 'Thoubal', population: 422000 },
  { id: 'KHM', name: 'Kohima', state: 'Nagaland', lat: NODES.KHM.lat, lng: NODES.KHM.lng, hq: 'Kohima', population: 270000 },
  { id: 'DMP', name: 'Dimapur', state: 'Nagaland', lat: NODES.DMP.lat, lng: NODES.DMP.lng, hq: 'Dimapur', population: 379000 },
  { id: 'MKG', name: 'Mokokchung', state: 'Nagaland', lat: NODES.MKG.lat, lng: NODES.MKG.lng, hq: 'Mokokchung', population: 194000 },
  { id: 'MON', name: 'Mon', state: 'Nagaland', lat: NODES.MON.lat, lng: NODES.MON.lng, hq: 'Mon', population: 250000 },
  { id: 'ITN', name: 'Papum Pare', state: 'Arunachal Pradesh', lat: NODES.ITN.lat, lng: NODES.ITN.lng, hq: 'Itanagar', population: 176000 },
  { id: 'TEZ', name: 'Lohit', state: 'Arunachal Pradesh', lat: NODES.TEZ.lat, lng: NODES.TEZ.lng, hq: 'Tezu', population: 145000 },
  { id: 'PSG', name: 'East Siang', state: 'Arunachal Pradesh', lat: NODES.PSG.lat, lng: NODES.PSG.lng, hq: 'Pasighat', population: 99000 },
  { id: 'ZRO', name: 'Lower Subansiri', state: 'Arunachal Pradesh', lat: NODES.ZRO.lat, lng: NODES.ZRO.lng, hq: 'Ziro', population: 83000 },
  { id: 'BDL', name: 'West Kameng', state: 'Arunachal Pradesh', lat: NODES.BDL.lat, lng: NODES.BDL.lng, hq: 'Bomdila', population: 84000 },
]

// deterministic PRNG so road geometry is stable
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const hav = (a: [number, number], b: [number, number]) => {
  const R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLng = (b[1] - a[1]) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

type EdgeDef = {
  id: string; name: string; road: string; roadType: Segment['roadType']
  a: string; b: string; district: string; terrain: Segment['terrain']
  slope: number; elevation: number; fh: number; cond: Segment['baseCondition']
  bridge?: boolean; singleLane?: boolean
  v: number; w: number; s: number
  rep?: Segment['reportedStatus']; reason?: string
}
const EDGES: EdgeDef[] = [
  { id: 'E01', name: 'NH-27 Guwahati–Nagaon', road: 'NH-27', roadType: 'NH', a: 'GHY', b: 'NGN', district: 'NGN', terrain: 'flat', slope: 1, elevation: 60, fh: 1, cond: 'good', v: 12, w: 8, s: 10 },
  { id: 'E02', name: 'NH-37 Nagaon–Jorhat', road: 'NH-37', roadType: 'NH', a: 'NGN', b: 'JRH', district: 'JRH', terrain: 'flat', slope: 2, elevation: 85, fh: 2, cond: 'fair', v: 22, w: 30, s: 28 },
  { id: 'E03', name: 'NH-37 Jorhat–Dibrugarh', road: 'NH-37', roadType: 'NH', a: 'JRH', b: 'DBR', district: 'DBR', terrain: 'flat', slope: 2, elevation: 95, fh: 2, cond: 'fair', v: 18, w: 25, s: 22 },
  { id: 'E04', name: 'NH-37 Dibrugarh–Tinsukia', road: 'NH-37', roadType: 'NH', a: 'DBR', b: 'TSK', district: 'TSK', terrain: 'flat', slope: 1, elevation: 110, fh: 1, cond: 'good', v: 10, w: 12, s: 14 },
  { id: 'E05', name: 'NH-715 Nagaon–Tezpur', road: 'NH-715', roadType: 'NH', a: 'NGN', b: 'TZP', district: 'TZP', terrain: 'flat', slope: 3, elevation: 75, fh: 1, cond: 'good', v: 15, w: 15, s: 18 },
  { id: 'E06', name: 'NH-15 Tezpur–North Lakhimpur', road: 'NH-15', roadType: 'NH', a: 'TZP', b: 'LKP', district: 'LKP', terrain: 'flat', slope: 2, elevation: 90, fh: 3, cond: 'fair', v: 30, w: 48, s: 34 },
  { id: 'E07', name: 'NH-15 Lakhimpur–Dhemaji', road: 'NH-15', roadType: 'NH', a: 'LKP', b: 'DMJ', district: 'DMJ', terrain: 'flat', slope: 2, elevation: 100, fh: 5, cond: 'poor', v: 40, w: 78, s: 45, rep: 'caution', reason: 'Subansiri floodplain waterlogging — overflow on low causeway' },
  { id: 'E08', name: 'NH-27 Guwahati–Bongaigaon', road: 'NH-27', roadType: 'NH', a: 'GHY', b: 'BNG', district: 'BNG', terrain: 'flat', slope: 2, elevation: 55, fh: 1, cond: 'good', v: 14, w: 18, s: 16 },
  { id: 'E09', name: 'NH-27 Bongaigaon–Dhubri', road: 'NH-27', roadType: 'NH', a: 'BNG', b: 'DBRi', district: 'DBRi', terrain: 'flat', slope: 1, elevation: 35, fh: 4, cond: 'fair', v: 28, w: 62, s: 30, rep: 'caution', reason: 'Brahmaputra tributary in spate — embankment seepage reported' },
  { id: 'E10', name: 'NH-17 Guwahati–Goalpara', road: 'NH-17', roadType: 'NH', a: 'GHY', b: 'GLP', district: 'GLP', terrain: 'flat', slope: 2, elevation: 50, fh: 2, cond: 'fair', v: 20, w: 22, s: 25 },
  { id: 'E11', name: 'NH-6 Guwahati–Shillong', road: 'NH-6', roadType: 'NH', a: 'GHY', b: 'SHL', district: 'SHL', terrain: 'mountain', slope: 9, elevation: 1496, fh: 2, cond: 'fair', v: 45, w: 20, s: 42, singleLane: true },
  { id: 'E12', name: 'SH Shillong–Nongstoin', road: 'SH-4', roadType: 'SH', a: 'SHL', b: 'NST', district: 'NST', terrain: 'hilly', slope: 7, elevation: 1400, fh: 3, cond: 'fair', v: 50, w: 15, s: 48 },
  { id: 'E13', name: 'NH-217 Nongstoin–Tura', road: 'NH-217', roadType: 'NH', a: 'NST', b: 'TUR', district: 'TUR', terrain: 'hilly', slope: 6, elevation: 900, fh: 3, cond: 'fair', v: 42, w: 35, s: 40 },
  { id: 'E14', name: 'NH-6 Shillong–Jowai', road: 'NH-6', roadType: 'NH', a: 'SHL', b: 'JWI', district: 'JWI', terrain: 'mountain', slope: 10, elevation: 1380, fh: 4, cond: 'fair', v: 52, w: 24, s: 48, singleLane: true },
  { id: 'E15', name: 'SH Jowai–Haflong', road: 'SH (Meghalaya–Assam)', roadType: 'SH', a: 'JWI', b: 'HFL', district: 'HFL', terrain: 'mountain', slope: 13, elevation: 1650, fh: 7, cond: 'poor', v: 85, w: 65, s: 75, singleLane: true, rep: 'blocked', reason: 'Major landslide — road breached at Km 18 (Sonapur ghat), debris 4m deep' },
  { id: 'E16', name: 'NH-29 Nagaon–Diphu', road: 'NH-29', roadType: 'NH', a: 'NGN', b: 'DPH', district: 'DPH', terrain: 'hilly', slope: 6, elevation: 850, fh: 2, cond: 'fair', v: 38, w: 18, s: 36 },
  { id: 'E17', name: 'SH Diphu–Haflong (Umrangso valley road)', road: 'SH (Karbi Anglong)', roadType: 'SH', a: 'DPH', b: 'HFL', district: 'HFL', terrain: 'mountain', slope: 9, elevation: 1180, fh: 4, cond: 'fair', v: 48, w: 22, s: 44, singleLane: true },
  { id: 'E18', name: 'NH-54 Haflong–Silchar', road: 'NH-54', roadType: 'NH', a: 'HFL', b: 'SIL', district: 'SIL', terrain: 'mountain', slope: 12, elevation: 1200, fh: 6, cond: 'poor', v: 78, w: 55, s: 70, singleLane: true, rep: 'blocked', reason: 'Landslide + road subsidence near Umrangso approach; retaining wall collapsed' },
  { id: 'E19', name: 'NH-37 Silchar–Karimganj', road: 'NH-37', roadType: 'NH', a: 'SIL', b: 'KMG', district: 'KMG', terrain: 'flat', slope: 1, elevation: 25, fh: 3, cond: 'fair', v: 22, w: 40, s: 26 },
  { id: 'E20', name: 'NH-306 Silchar–Aizawl', road: 'NH-306', roadType: 'NH', a: 'SIL', b: 'AZL', district: 'AZL', terrain: 'hilly', slope: 7, elevation: 950, fh: 3, cond: 'fair', v: 44, w: 30, s: 40 },
  { id: 'E21', name: 'NH-54 Aizawl–Lunglei', road: 'NH-54', roadType: 'NH', a: 'AZL', b: 'LGL', district: 'LGL', terrain: 'hilly', slope: 8, elevation: 1050, fh: 3, cond: 'fair', v: 42, w: 26, s: 38 },
  { id: 'E22', name: 'NH-2 Lunglei–Champhai', road: 'NH-2', roadType: 'NH', a: 'LGL', b: 'CPH', district: 'CPH', terrain: 'hilly', slope: 9, elevation: 1250, fh: 3, cond: 'fair', v: 48, w: 34, s: 44, singleLane: true },
  { id: 'E23', name: 'NH-8 Karimganj–Dharmanagar', road: 'NH-8', roadType: 'NH', a: 'KMG', b: 'DHR', district: 'DHR', terrain: 'flat', slope: 2, elevation: 40, fh: 2, cond: 'good', v: 16, w: 22, s: 18 },
  { id: 'E24', name: 'NH-8 Dharmanagar–Kailashahar', road: 'NH-8', roadType: 'NH', a: 'DHR', b: 'KSH', district: 'KSH', terrain: 'flat', slope: 2, elevation: 45, fh: 1, cond: 'good', v: 14, w: 16, s: 15 },
  { id: 'E25', name: 'NH-8 Kailashahar–Agartala', road: 'NH-8', roadType: 'NH', a: 'KSH', b: 'AGT', district: 'AGT', terrain: 'flat', slope: 3, elevation: 60, fh: 1, cond: 'good', v: 12, w: 14, s: 12 },
  { id: 'E26', name: 'NH-2 Dimapur–Kohima', road: 'NH-29', roadType: 'NH', a: 'DMP', b: 'KHM', district: 'KHM', terrain: 'mountain', slope: 10, elevation: 1450, fh: 4, cond: 'fair', v: 55, w: 20, s: 46, singleLane: true },
  { id: 'E27', name: 'NH-2 Kohima–Imphal', road: 'NH-2', roadType: 'NH', a: 'KHM', b: 'IMP', district: 'IMP', terrain: 'mountain', slope: 9, elevation: 1200, fh: 5, cond: 'fair', v: 52, w: 45, s: 44, singleLane: true },
  { id: 'E28', name: 'NH-2 Imphal–Churachandpur', road: 'NH-2', roadType: 'NH', a: 'IMP', b: 'CCP', district: 'CCP', terrain: 'mountain', slope: 10, elevation: 1100, fh: 6, cond: 'poor', v: 72, w: 52, s: 64, singleLane: true, rep: 'caution', reason: 'Landslide debris partially cleared — single-lane manual traffic, 2h wait' },
  { id: 'E29', name: 'SH Imphal–Ukhrul', road: 'SH-2 (Manipur)', roadType: 'SH', a: 'IMP', b: 'UKR', district: 'UKR', terrain: 'hilly', slope: 8, elevation: 1500, fh: 3, cond: 'fair', v: 46, w: 30, s: 42, singleLane: true },
  { id: 'E30', name: 'SH Imphal–Thoubal', road: 'SH (Manipur valley)', roadType: 'SH', a: 'IMP', b: 'THB', district: 'THB', terrain: 'flat', slope: 1, elevation: 780, fh: 1, cond: 'good', v: 10, w: 12, s: 10 },
  { id: 'E31', name: 'NH-2 Kohima–Mokokchung', road: 'NH-2', roadType: 'NH', a: 'KHM', b: 'MKG', district: 'MKG', terrain: 'mountain', slope: 9, elevation: 1320, fh: 3, cond: 'fair', v: 48, w: 30, s: 42 },
  { id: 'E32', name: 'SH Mokokchung–Mon', road: 'SH (Nagaland)', roadType: 'SH', a: 'MKG', b: 'MON', district: 'MON', terrain: 'mountain', slope: 11, elevation: 1250, fh: 3, cond: 'fair', v: 55, w: 38, s: 50, singleLane: true },
  { id: 'E33', name: 'SH Jorhat–Mokokchung', road: 'SH (Assam–Nagaland)', roadType: 'SH', a: 'JRH', b: 'MKG', district: 'MKG', terrain: 'hilly', slope: 7, elevation: 600, fh: 2, cond: 'fair', v: 35, w: 28, s: 33 },
  { id: 'E34', name: 'NH-29 Diphu–Dimapur', road: 'NH-29', roadType: 'NH', a: 'DPH', b: 'DMP', district: 'DMP', terrain: 'hilly', slope: 6, elevation: 500, fh: 2, cond: 'fair', v: 32, w: 25, s: 30 },
  { id: 'E35', name: 'NH-515 Dhemaji–Pasighat', road: 'NH-515', roadType: 'NH', a: 'DMJ', b: 'PSG', district: 'PSG', terrain: 'hilly', slope: 6, elevation: 300, fh: 3, cond: 'fair', v: 40, w: 55, s: 44 },
  { id: 'E36', name: 'NH-315 Tinsukia–Tezu', road: 'NH-315', roadType: 'NH', a: 'TSK', b: 'TEZ', district: 'TEZ', terrain: 'hilly', slope: 7, elevation: 450, fh: 3, cond: 'fair', v: 44, w: 42, s: 46 },
  { id: 'E37', name: 'NH-13 Tezpur–Itanagar', road: 'NH-13', roadType: 'NH', a: 'TZP', b: 'ITN', district: 'ITN', terrain: 'hilly', slope: 6, elevation: 450, fh: 2, cond: 'fair', v: 34, w: 30, s: 32 },
  { id: 'E38', name: 'NH-? Itanagar–Ziro', road: 'SH (Arunachal)', roadType: 'SH', a: 'ITN', b: 'ZRO', district: 'ZRO', terrain: 'mountain', slope: 10, elevation: 1560, fh: 4, cond: 'fair', v: 56, w: 36, s: 48, singleLane: true },
  { id: 'E39', name: 'SH Ziro–Bomdila', road: 'SH (Arunachal)', roadType: 'SH', a: 'ZRO', b: 'BDL', district: 'BDL', terrain: 'mountain', slope: 12, elevation: 2200, fh: 5, cond: 'poor', v: 70, w: 40, s: 66, singleLane: true },
  { id: 'E40', name: 'NH-217 Tura–Dharmanagar', road: 'NH-217', roadType: 'NH', a: 'TUR', b: 'DHR', district: 'DHR', terrain: 'hilly', slope: 5, elevation: 350, fh: 2, cond: 'good', v: 30, w: 26, s: 30 },
]

function makeSeg(e: EdgeDef): Segment {
  const A = NODES[e.a], B = NODES[e.b]
  const r = rng(hash(e.id))
  const bend = e.terrain === 'flat' ? 0.02 : e.terrain === 'hilly' ? 0.045 : 0.07
  const mid: [number, number] = [(A.lat + B.lat) / 2 + (r() - 0.5) * bend, (A.lng + B.lng) / 2 + (r() - 0.5) * bend]
  const q1: [number, number] = [A.lat * 0.75 + mid[0] * 0.25 + (r() - 0.5) * bend * 0.5, A.lng * 0.75 + mid[1] * 0.25 + (r() - 0.5) * bend * 0.5]
  const q3: [number, number] = [B.lat * 0.75 + mid[0] * 0.25 + (r() - 0.5) * bend * 0.5, B.lng * 0.75 + mid[1] * 0.25 + (r() - 0.5) * bend * 0.5]
  const coords: [number, number][] = [[A.lat, A.lng], q1, mid, q3, [B.lat, B.lng]]
  let km = 0
  for (let i = 1; i < coords.length; i++) km += hav(coords[i - 1], coords[i])
  return {
    id: e.id, name: e.name, road: e.road, roadType: e.roadType,
    from: NODES[e.a].name, to: NODES[e.b].name,
    districtId: e.district, coords, lengthKm: Math.round(km * 10) / 10,
    terrain: e.terrain, slope: e.slope, elevation: e.elevation,
    bridge: e.bridge, singleLane: e.singleLane,
    failureHistory: e.fh, baseCondition: e.cond,
    sensor: { vibration: e.v, waterLevel: e.w, surface: e.s },
    reportedStatus: e.rep, reportReason: e.reason,
  }
}

// ── Waterway segments (NW-2 / Brahmaputra & Barak) ────────────────────────
// Modelled on real NER navigable stretches (NW-2 Dhubri–Sadiya ~891 km and
// the Barak/Kushiara reach). Same Segment shape as the road edges above so
// risk.ts scores them with zero changes (they carry gentle terrain, low
// failureHistory, waterLevel sensors and flat-water speeds).
type WaterwayDef = {
  id: string; name: string; a: string; b: string; district: string
  water: number // typical draft available, metres
  kms?: number // approx stretch length
}
const WAT: WaterwayDef[] = [
  { id: 'W01', name: 'NW-2 Brahmaputra Dhubri–Guwahati', a: 'DBRi', b: 'GHY', district: 'GHY', water: 2.2, kms: 175 },
  { id: 'W02', name: 'NW-2 Brahmaputra Guwahati–Tezpur', a: 'GHY', b: 'TZP', district: 'TZP', water: 2.0, kms: 210 },
  { id: 'W03', name: 'NW-2 Brahmaputra Tezpur–Neamati (Jorhat)', a: 'TZP', b: 'JRH', district: 'JRH', water: 1.8, kms: 205 },
  { id: 'W04', name: 'Barak waterway Silchar–Karimganj', a: 'SIL', b: 'KMG', district: 'KMG', water: 1.5, kms: 70 },
]
function makeWaterway(e: WaterwayDef): Segment {
  const A = NODES[e.a], B = NODES[e.b]
  const r = rng(hash(e.id))
  // A river needs more waypoints than a straight road — trace the channel
  // with a gentle deterministic bend (no sharp cliff profiles).
  const bends = 6
  const pts: [number, number][] = []
  for (let i = 0; i <= bends; i++) {
    const t = i / bends
    const lat = A.lat + (B.lat - A.lat) * t + (r() - 0.5) * 0.09
    const lng = A.lng + (B.lng - A.lng) * t + (r() - 0.5) * 0.09
    pts.push([lat, lng])
  }
  let km = 0
  for (let i = 1; i < pts.length; i++) km += hav(pts[i - 1], pts[i])
  return {
    id: e.id, name: e.name, road: 'Inland Waterways Authority of India', roadType: 'waterway',
    from: NODES[e.a].name, to: NODES[e.b].name,
    districtId: e.district, coords: pts, lengthKm: Math.round(km * 10) / 10,
    terrain: 'flat', slope: 0.2, elevation: 45,
    bridge: false, singleLane: false, failureHistory: 1, baseCondition: 'good',
    sensor: { vibration: 5, waterLevel: 30, surface: 8 }, // high waterLevel = draft signal, low surface roughness
    mode: 'waterway', draftM: e.water,
  }
}

// Waterway-specific accessibility/risk helpers (used by the route engine +
// PlanRoute waterway surface + Home/MapView so the two datasets never drift).
export function isWaterway(seg: Segment) { return seg.roadType === 'waterway' || seg.mode === 'waterway' }
export function waterwayName(seg: Segment) { return seg.name.replace(/^NW-\d+\s*/, '').replace('–', '-') }
export function navigableFor(seg: Segment, cargo: CargoType): boolean {
  if (!isWaterway(seg)) return true
  // Big-tonnage dry bulk and construction stay on roads; light/containerised
  // cargo and time-flexible freight (agri, pharma in reefer boxes) can use NW-2.
  if (cargo === 'construction' || cargo === 'fuel') return false
  return seg.draftM != null && seg.draftM >= 1.4
}
export const waterwaySegments = (): Segment[] => SEGMENTS.filter(isWaterway)

// Road + river network. Waterway edges are defined above the road edges
// (WAT is used by the concat below), so declaration order keeps WAT in scope.
export const SEGMENTS: Segment[] = [...EDGES.map(makeSeg), ...WAT.map(makeWaterway)]

// ── Facilities ─────────────────────────────────────────────────────────────
const F = (id: string, name: string, type: Facility['type'], node: string, note?: string): Facility =>
  ({ id, name, type, lat: NODES[node].lat + 0.015, lng: NODES[node].lng - 0.02, districtId: node, note })

// ── Cold-storage chain (perishables / vaccines) ───────────────────────────
// Each sits next to a district HQ with a real-world-ish refrigeration hub
// label; tempStatus uses the same green/amber/red convention as stock gaps.
const C = (id: string, name: string, node: string, cap: number, util: number, temp: ColdChainFacility['tempStatus']): ColdChainFacility =>
  ({ id, name, districtId: node, lat: NODES[node].lat - 0.03, lng: NODES[node].lng + 0.04, capacityUnits: cap, utilizationPct: util, tempStatus: temp })

export const COLD_CHAIN: ColdChainFacility[] = [
  C('CC01', 'Guwahati Cold Hub (CWC reefer)', 'GHY', 420, 72, 'ok'),
  C('CC02', 'Nagaon Agri Cold Store', 'NGN', 180, 88, 'at-risk'),
  C('CC03', 'Jorhat Milk & Veg Cold Chain', 'JRH', 150, 64, 'ok'),
  C('CC04', 'Dibrugarh Pharma Cold Vault', 'DBR', 120, 91, 'at-risk'),
  C('CC05', 'Silchar Vaccine Depot (ILR)', 'SIL', 140, 58, 'ok'),
  C('CC06', 'Haflong Hill Cold Store', 'HFL', 40, 100, 'critical'),
  C('CC07', 'Diphu Medical Cold Room', 'DPH', 55, 82, 'ok'),
  C('CC08', 'Shillong Fruit & Vaccine Cold Hub', 'SHL', 200, 76, 'ok'),
  C('CC09', 'Dimapur Agri Export Cold Chain', 'DMP', 160, 85, 'at-risk'),
  C('CC10', 'Agartala Fish & Pharma Cold Store', 'AGT', 130, 66, 'ok'),
  C('CC11', 'Aizawl Vaccine Cold Room', 'AZL', 60, 78, 'ok'),
  C('CC12', 'Imphal Milk Chilling Centre', 'IMP', 90, 69, 'ok'),
]

export const FACILITIES: Facility[] = [
  F('F01', 'Central Warehouse (CWC), Guwahati', 'warehouse', 'GHY', 'Nodal stock point for NER'),
  F('F02', 'FCI Godown, Silchar', 'warehouse', 'SIL'),
  F('F03', 'FCI Godown, Dimapur', 'warehouse', 'DMP'),
  F('F04', 'Block Warehouse, Haflong', 'warehouse', 'HFL', 'Serving Dima Hasao hills'),
  F('F05', 'GMC Civil Hospital', 'hospital', 'GHY'),
  F('F06', 'SM Dev Civil Hospital, Silchar', 'hospital', 'SIL'),
  F('F07', 'District Hospital, Diphu', 'hospital', 'DPH'),
  F('F08', 'Civil Hospital, Churachandpur', 'hospital', 'CCP'),
  F('F09', 'District Hospital, Tura', 'hospital', 'TUR'),
  F('F10', 'District Hospital, Tezu', 'hospital', 'TEZ'),
  F('F11', 'Relief Camp (Haflong HS School)', 'relief_camp', 'HFL', '120 families from landslide zone'),
  F('F12', 'Relief Camp (Diphu Stadium)', 'relief_camp', 'DPH', '65 families, flood-affected'),
  F('F13', 'Relief Camp (Jowai Community Hall)', 'relief_camp', 'JWI', '40 families'),
  F('F14', 'NHAI Depot, Jorabat', 'depot', 'GHY', 'Road-clearance equipment & crew'),
  F('F15', 'PWD Depot, Umrangso', 'depot', 'HFL', 'Excavator, 2 tippers'),
  F('F16', 'NHAI Depot, Dimapur', 'depot', 'DMP'),
  F('F17', 'HP Fuel Station, Nagaon Bypass', 'fuel', 'NGN'),
  F('F18', 'IOC Fuel Depot, Jorhat', 'fuel', 'JRH'),
  F('F19', 'Fuel Station, Shillong Bypass', 'fuel', 'SHL'),
  F('F20', 'Fuel Station, Churachandpur Bazar', 'fuel', 'CCP'),
  F('F21', 'Fuel Station, Ukhrul Town', 'fuel', 'UKR'),
  F('F22', 'Fuel Station, Pasighat', 'fuel', 'PSG'),
]

// ── Vehicles (simulated GPS) ───────────────────────────────────────────────
const V = (v: Partial<Vehicle> & { id: string; driver: string; org: string; cargo: Vehicle['cargo']; cargoDetail: string; from: string; to: string; path: string[] }): Vehicle => ({
  weightT: 10, speedKmph: 40, status: 'moving', delayHours: 0, progressKm: 0,
  lat: 0, lng: 0, trail: [], lastMile: false, ...v,
})

export const VEHICLES: Vehicle[] = [
  V({ id: 'AS-01-MED-4471', driver: 'R. Das', org: 'Assam Drugs Distributors', cargo: 'medicine', cargoDetail: 'Emergency medicines + oxygen concentrators', weightT: 6, from: 'Guwahati', to: 'Haflong (Dima Hasao)', path: ['E01', 'E16', 'E17'], progressKm: 62, speedKmph: 0, status: 'halted', delayHours: 9, lastMile: false }),
  V({ id: 'AS-01-FOOD-2210', driver: 'K. Rahim', org: 'FCI / India Posts Convoy', cargo: 'food', cargoDetail: 'Rice, dal, salt for relief camp (180 quintals)', weightT: 18, from: 'Nagaon', to: 'Haflong (Dima Hasao)', path: ['E16', 'E17'], progressKm: 44, speedKmph: 0, status: 'halted', delayHours: 12 }),
  V({ id: 'ML-05-CON-8820', driver: 'T. Lyngdoh', org: 'Meghalaya PWD', cargo: 'construction', cargoDetail: 'Bailey bridge sections & gabion mesh', weightT: 22, from: 'Shillong', to: 'Jowai', path: ['E14'], progressKm: 21, speedKmph: 18, status: 'delayed', delayHours: 2.5 }),
  V({ id: 'MN-01-MED-1190', driver: 'H. Singh', org: 'Manipur Medical Services', cargo: 'medicine', cargoDetail: 'Vaccines + ORS for PHCs', weightT: 4, from: 'Imphal', to: 'Churachandpur', path: ['E28'], progressKm: 18, speedKmph: 8, status: 'delayed', delayHours: 3 }),
  V({ id: 'AS-01-AGRI-7741', driver: 'M. Ali', org: 'APMC Jorhat', cargo: 'agri', cargoDetail: 'Tea & seasonal vegetables, outbound', weightT: 14, from: 'Jorhat', to: 'Guwahati', path: ['E02', 'E01'], progressKm: 90, speedKmph: 38, status: 'moving' }),
  V({ id: 'AS-01-FUEL-3302', driver: 'S. Bordoloi', org: 'IOC Logistics', cargo: 'fuel', cargoDetail: 'Diesel & petrol tanker', weightT: 20, from: 'Guwahati', to: 'Tezpur', path: ['E01', 'E05'], progressKm: 55, speedKmph: 42, status: 'moving' }),
  V({ id: 'NL-07-REL-5563', driver: 'P. Kikon', org: 'Nagaland Relief Cell', cargo: 'relief', cargoDetail: 'Tents, tarpaulin, drinking water', weightT: 12, from: 'Dimapur', to: 'Kohima', path: ['E26'], progressKm: 26, speedKmph: 22, status: 'delayed', delayHours: 1.5 }),
  V({ id: 'MZ-01-FOOD-9918', driver: 'L. Zadeng', org: 'Mizoram Food & Civil Supplies', cargo: 'food', cargoDetail: 'PDS rice for Champhai block', weightT: 16, from: 'Aizawl', to: 'Champhai', path: ['E21', 'E22'], progressKm: 110, speedKmph: 30, status: 'moving' }),
  V({ id: 'TR-01-MED-6640', driver: 'A. Debbarma', org: 'Tripura Health Dept', cargo: 'medicine', cargoDetail: 'Generic medicines for BPHC network', weightT: 5, from: 'Agartala', to: 'Kailashahar', path: ['E25'], progressKm: 48, speedKmph: 45, status: 'moving' }),
  V({ id: 'AR-02-FUEL-2087', driver: 'T. Tega', org: 'APPSCC Logistics', cargo: 'fuel', cargoDetail: 'Diesel for Pasighat depot', weightT: 18, from: 'Tinsukia', to: 'Tezu', path: ['E04', 'E36'], progressKm: 70, speedKmph: 26, status: 'delayed', delayHours: 2 }),
  V({ id: 'AS-01-REL-1290', driver: 'B. Gogoi', org: 'SDRF Assam', cargo: 'relief', cargoDetail: 'Rescue equipment, medical team', weightT: 9, from: 'Dibrugarh', to: 'Dhemaji', path: ['E03', 'E02', 'E06', 'E07'], progressKm: 130, speedKmph: 20, status: 'delayed', delayHours: 2 }),
  V({ id: 'AS-01-CONS-4715', driver: 'D. Boro', org: 'BRO Project Vartak', cargo: 'construction', cargoDetail: 'Cement & steel rods', weightT: 24, from: 'Guwahati', to: 'Shillong', path: ['E11'], progressKm: 40, speedKmph: 24, status: 'moving' }),
  V({ id: 'ML-05-LM-7781', driver: 'W. Suchiang', org: 'Jaintia Hills Transport Co-op', cargo: 'relief', cargoDetail: 'Last-mile: community shared taxi, food & medicines to Umrangso villages', weightT: 1.5, from: 'Jowai', to: 'Haflong (Dima Hasao)', path: ['E15'], progressKm: 4, speedKmph: 0, status: 'halted', delayHours: 14, lastMile: true, community: 'Jaintia Village Transport Co-op' }),
  V({ id: 'MN-01-FOOD-3326', driver: 'M. Meitei', org: 'Imphal Wholesale Market', cargo: 'food', cargoDetail: 'Vegetables & groceries for Ukhrul', weightT: 7, from: 'Imphal', to: 'Ukhrul', path: ['E29'], progressKm: 38, speedKmph: 28, status: 'moving' }),
]

// ── Seeded incident reports ────────────────────────────────────────────────
const now = Date.now()
export const SEED_REPORTS: IncidentReport[] = [
  { id: 'R-1001', type: 'landslide', severity: 'impassable', description: 'Heavy debris flow across road near Sonapur ghat; two trucks stranded before slide point.', lat: NODES.JWI.lat + 0.06, lng: (NODES.JWI.lng + NODES.HFL.lng) / 2, segmentId: 'E15', districtId: 'HFL', reporter: 'Field Officer R. Sangma', reporterRole: 'official', photoName: 'landslide-e15.jpg', photoSeverity: 'impassable', photoConfidence: 0.9, status: 'verified', confidence: 0.95, points: 50, createdAt: now - 1000 * 60 * 60 * 9, synced: true },
  { id: 'R-1002', type: 'landslide', severity: 'impassable', description: 'Retaining wall collapsed; road half-subsided near Umrangso approach. No through movement possible.', lat: NODES.HFL.lat - 0.05, lng: (NODES.HFL.lng + NODES.SIL.lng) / 2 + 0.03, segmentId: 'E18', districtId: 'SIL', reporter: 'Citizen D. Haflongbar', reporterRole: 'citizen', photoName: 'subsidence-e18.jpg', photoSeverity: 'impassable', photoConfidence: 0.85, status: 'verified', confidence: 0.9, points: 50, createdAt: now - 1000 * 60 * 60 * 12, synced: true },
  { id: 'R-1003', type: 'flood', severity: 'partial', description: 'Causeway under 1 ft water; cars waiting, HGVs advised not to cross until level drops.', lat: (NODES.LKP.lat + NODES.DMJ.lat) / 2, lng: (NODES.LKP.lng + NODES.DMJ.lng) / 2 + 0.02, segmentId: 'E07', districtId: 'DMJ', reporter: 'Citizen J. Doley', reporterRole: 'citizen', photoName: 'flood-e07.jpg', photoSeverity: 'partial', photoConfidence: 0.8, status: 'verified', confidence: 0.8, points: 30, createdAt: now - 1000 * 60 * 60 * 6, synced: true },
  { id: 'R-1004', type: 'roadblock', severity: 'partial', description: 'Rockfall debris on single lane; PWD team on site, clearing in progress.', lat: (NODES.IMP.lat + NODES.CCP.lat) / 2 + 0.03, lng: (NODES.IMP.lng + NODES.CCP.lng) / 2, segmentId: 'E28', districtId: 'CCP', reporter: 'Field Officer T. Guite', reporterRole: 'official', photoName: 'rockfall-e28.jpg', photoSeverity: 'partial', photoConfidence: 0.75, status: 'verified', confidence: 0.85, points: 40, createdAt: now - 1000 * 60 * 60 * 4, synced: true },
  { id: 'R-1005', type: 'damage', severity: 'minor', description: 'Multiple deep potholes on bridge approach; two-wheeler skid risk in rain.', lat: NODES.SHL.lat + 0.04, lng: NODES.SHL.lng + 0.06, segmentId: 'E11', districtId: 'SHL', reporter: 'Citizen P. Kharkongor', reporterRole: 'citizen', photoName: 'pothole-e11.jpg', photoSeverity: 'minor', photoConfidence: 0.7, status: 'pending', confidence: 0.45, points: 0, createdAt: now - 1000 * 60 * 90, synced: true },
  { id: 'R-1006', type: 'flood', severity: 'partial', description: 'Embankment seepage; water approaching road edge near Dhubri side. Monitoring.', lat: (NODES.BNG.lat + NODES.DBRi.lat) / 2 - 0.02, lng: (NODES.BNG.lng + NODES.DBRi.lng) / 2, segmentId: 'E09', districtId: 'DBRi', reporter: 'Citizen F. Sheikh', reporterRole: 'citizen', status: 'pending', confidence: 0.4, points: 0, createdAt: now - 1000 * 60 * 50, synced: true },
  { id: 'R-1007', type: 'accessibility', severity: 'minor', description: 'Bus stop ramp damaged at Jowai bazaar; wheelchair users cannot board.', lat: NODES.JWI.lat, lng: NODES.JWI.lng + 0.01, districtId: 'JWI', reporter: 'Citizen L. Dhar', reporterRole: 'citizen', status: 'verified', confidence: 0.75, points: 20, createdAt: now - 1000 * 60 * 60 * 26, synced: true },
  { id: 'R-1008', type: 'accident', severity: 'partial', description: 'Truck breakdown partially blocking single-lane ghat section; traffic alternating.', lat: NODES.SHL.lat - 0.06, lng: (NODES.SHL.lng + NODES.JWI.lng) / 2, segmentId: 'E14', districtId: 'JWI', reporter: 'Operator Mobile Unit', reporterRole: 'operator', status: 'verified', confidence: 0.8, points: 0, createdAt: now - 1000 * 60 * 150, synced: true },
]

// ── Supply / stock levels (days of stock remaining) ────────────────────────
export const STOCKS: StockLevels[] = [
  { districtId: 'HFL', medicine: 2.5, food: 3, fuel: 6, construction: 1 },
  { districtId: 'DPH', medicine: 8, food: 9, fuel: 12, construction: 5 },
  { districtId: 'JWI', medicine: 6, food: 7, fuel: 9, construction: 2 },
  { districtId: 'CCP', medicine: 4, food: 6, fuel: 5, construction: 7 },
  { districtId: 'UKR', medicine: 7, food: 8, fuel: 6, construction: 6 },
  { districtId: 'DMJ', medicine: 5, food: 6, fuel: 8, construction: 9 },
  { districtId: 'SIL', medicine: 14, food: 18, fuel: 15, construction: 20 },
  { districtId: 'GHY', medicine: 30, food: 45, fuel: 28, construction: 40 },
  { districtId: 'NGN', medicine: 22, food: 30, fuel: 20, construction: 25 },
  { districtId: 'JRH', medicine: 18, food: 26, fuel: 18, construction: 22 },
  { districtId: 'DBR', medicine: 16, food: 24, fuel: 17, construction: 18 },
  { districtId: 'TSK', medicine: 12, food: 20, fuel: 14, construction: 16 },
  { districtId: 'SHL', medicine: 15, food: 20, fuel: 12, construction: 14 },
  { districtId: 'TUR', medicine: 9, food: 11, fuel: 10, construction: 12 },
  { districtId: 'AGT', medicine: 17, food: 22, fuel: 16, construction: 19 },
  { districtId: 'AZL', medicine: 11, food: 14, fuel: 10, construction: 12 },
  { districtId: 'IMP', medicine: 9, food: 10, fuel: 8, construction: 11 },
  { districtId: 'KHM', medicine: 8, food: 9, fuel: 7, construction: 10 },
  { districtId: 'DMP', medicine: 13, food: 18, fuel: 15, construction: 17 },
  { districtId: 'MKG', medicine: 7, food: 8, fuel: 7, construction: 9 },
  { districtId: 'MON', medicine: 6, food: 7, fuel: 5, construction: 8 },
  { districtId: 'ITN', medicine: 10, food: 12, fuel: 9, construction: 11 },
  { districtId: 'TEZ', medicine: 6, food: 7, fuel: 8, construction: 7 },
  { districtId: 'PSG', medicine: 5, food: 6, fuel: 7, construction: 6 },
  { districtId: 'ZRO', medicine: 7, food: 8, fuel: 6, construction: 7 },
  { districtId: 'BDL', medicine: 6, food: 7, fuel: 5, construction: 6 },
  { districtId: 'LGL', medicine: 7, food: 9, fuel: 8, construction: 9 },
  { districtId: 'CPH', medicine: 5, food: 6, fuel: 6, construction: 7 },
  { districtId: 'LKP', medicine: 10, food: 12, fuel: 11, construction: 13 },
  { districtId: 'TZP', medicine: 16, food: 22, fuel: 18, construction: 20 },
  { districtId: 'BNG', medicine: 12, food: 16, fuel: 14, construction: 15 },
  { districtId: 'DBRi', medicine: 9, food: 11, fuel: 10, construction: 12 },
  { districtId: 'GLP', medicine: 11, food: 14, fuel: 12, construction: 13 },
  { districtId: 'KMG', medicine: 13, food: 17, fuel: 15, construction: 16 },
  { districtId: 'DHR', medicine: 10, food: 13, fuel: 11, construction: 12 },
  { districtId: 'KSH', medicine: 9, food: 12, fuel: 10, construction: 11 },
  { districtId: 'THB', medicine: 12, food: 14, fuel: 11, construction: 13 },
]

// ── Bookings ───────────────────────────────────────────────────────────────
export const SEED_BOOKINGS: Booking[] = [
  { id: 'B-5001', shipper: 'Dima Hasao CMO Office', fromDistrict: 'GHY', toDistrict: 'HFL', cargo: 'medicine', weightT: 6, vehicleId: 'AS-01-MED-4471', status: 'in_transit', lastMile: false, warehouseOut: true, depotReached: false, villageReceived: false, createdAt: now - 1000 * 60 * 60 * 11 },
  { id: 'B-5002', shipper: 'Relief Commissioner, Haflong', fromDistrict: 'NGN', toDistrict: 'HFL', cargo: 'food', weightT: 18, vehicleId: 'AS-01-FOOD-2210', status: 'in_transit', lastMile: false, warehouseOut: true, depotReached: false, villageReceived: false, createdAt: now - 1000 * 60 * 60 * 14 },
  { id: 'B-5003', shipper: 'Jaintia Hills SHG Federation', fromDistrict: 'JWI', toDistrict: 'HFL', cargo: 'relief', weightT: 1.5, vehicleId: 'ML-05-LM-7781', status: 'in_transit', lastMile: true, communityCarrier: 'Jaintia Village Transport Co-op', warehouseOut: true, depotReached: false, villageReceived: false, createdAt: now - 1000 * 60 * 60 * 16 },
  { id: 'B-5004', shipper: 'Tripura PDS Circle', fromDistrict: 'AGT', toDistrict: 'KSH', cargo: 'food', weightT: 12, vehicleId: 'TR-01-MED-6640', status: 'in_transit', lastMile: false, warehouseOut: true, depotReached: true, villageReceived: false, createdAt: now - 1000 * 60 * 60 * 8 },
  { id: 'B-5005', shipper: 'Churachandpur DRDA', fromDistrict: 'IMP', toDistrict: 'CCP', cargo: 'medicine', weightT: 4, vehicleId: 'MN-01-MED-1190', status: 'in_transit', lastMile: true, communityCarrier: 'CCpur Local Van Union', warehouseOut: true, depotReached: false, villageReceived: false, createdAt: now - 1000 * 60 * 60 * 6 },
  { id: 'B-5006', shipper: 'Tura Civil Hospital', fromDistrict: 'GHY', toDistrict: 'TUR', cargo: 'medicine', weightT: 3, status: 'requested', lastMile: true, createdAt: now - 1000 * 60 * 60 * 2 },
  { id: 'B-5007', shipper: 'Mon Agriculture Office', fromDistrict: 'DMP', toDistrict: 'MON', cargo: 'agri', weightT: 8, status: 'requested', lastMile: true, createdAt: now - 1000 * 60 * 60 * 3 },
]

export const EMPTY_SNAPSHOT: Snapshot = { t: now, vehicles: [] }
