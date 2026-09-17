/* A no, with the status it should be said in. Services return one of these
   beside their ordinary result so that the reason and the code are decided
   where the rule is, rather than being rebuilt from a thrown error or a null at
   each route that calls it. */

export interface Refusal {
  readonly error: string
  readonly status: number
}

/* Nothing a service returns successfully carries a numeric `status`, which is
   what makes this safe to ask of a union. */
export function isRefusal(value: unknown): value is Refusal {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    typeof (value as Refusal).status === 'number'
  )
}
