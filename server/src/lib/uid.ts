// Same id-generation scheme as setu-ner/src/lib/format.ts (uid), so ids
// created here look identical to ones the frontend used to generate.
export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
