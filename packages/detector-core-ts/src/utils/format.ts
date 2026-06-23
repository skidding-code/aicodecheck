/** Small helpers mirroring the Python f-string number formats used in reasons. */

/** {value:.{digits}f} */
export function fixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

/** {value:.0%} — percentage with no decimals, e.g. 0.35 -> "35%". */
export function percent0(value: number): string {
  return `${Math.round(value * 100)}%`;
}
