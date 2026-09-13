// GIS / government-system integration adapter.
//
// The problem statement names "integration capability with transport
// databases and government monitoring systems" as an Expected Solution
// bullet — before this file, nothing in the codebase addressed it at all,
// not even a stub. This defines the CONTRACT (interface below) plus one
// mock implementation reading from a local JSON fixture
// (fixtures/govt-feed.json).
//
// The interface is the contract, not the data source: swap
// `mockGovtFeed` for a real adapter calling a state PWD API or the NIC
// data portal in production. Nothing else in the app needs to change,
// since callers only ever depend on `GovtFeedAdapter`, not on how a given
// implementation gets its data.
import fixture from './fixtures/govt-feed.json'

export interface RoadClosure {
  segmentId: string
  source: string
  reason: string
  reportedAt: string // ISO datetime
  expectedReopen: string | null // ISO datetime, or null if unknown
}

export interface DistrictStockReport {
  districtId: string
  source: string
  asOf: string // ISO datetime
  medicine: number
  food: number
  fuel: number
  construction: number
}

export interface GovtFeedAdapter {
  /** Officially reported road/bridge closures from government systems (as opposed to citizen reports or the risk model's own inference). */
  fetchRoadClosures(): Promise<RoadClosure[]>
  /** Officially reported district stock/supply levels, independent of SETU-NER's own STOCKS seed data. */
  fetchDistrictStock(districtId?: string): Promise<DistrictStockReport[]>
}

// ── Mock implementation ────────────────────────────────────────────────────
// Reads from a static local fixture. Clearly a placeholder: in production,
// replace this whole class with one that calls a real state PWD API or the
// NIC data portal, implementing the same GovtFeedAdapter interface — e.g.
//
//   class NicPortalAdapter implements GovtFeedAdapter {
//     async fetchRoadClosures() { return (await fetch(NIC_URL + '/closures')).json() }
//     async fetchDistrictStock(districtId?) { ... }
//   }
//
// and swap the export at the bottom of this file.
class MockGovtFeedAdapter implements GovtFeedAdapter {
  async fetchRoadClosures(): Promise<RoadClosure[]> {
    // Simulated network latency so callers that show a loading state are
    // exercised the same way they would be against a real API.
    await new Promise(r => setTimeout(r, 30))
    return fixture.roadClosures as RoadClosure[]
  }

  async fetchDistrictStock(districtId?: string): Promise<DistrictStockReport[]> {
    await new Promise(r => setTimeout(r, 30))
    const rows = fixture.districtStock as DistrictStockReport[]
    return districtId ? rows.filter(r => r.districtId === districtId) : rows
  }
}

// Swap this line for a real adapter in production — everything importing
// `govtFeed` from this module keeps working unchanged.
export const govtFeed: GovtFeedAdapter = new MockGovtFeedAdapter()
