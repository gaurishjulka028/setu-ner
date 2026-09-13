// The route/risk/vehicle-sim engine below needs the exact same static
// dataset the frontend already ships (districts, segments, facilities,
// vehicles, town-code lookup) — re-exporting it here (rather than copying
// it) keeps them from drifting apart, matching how Part 1's seed script
// reads from the same file.
export * from '../../../setu-ner/src/data/ner'
