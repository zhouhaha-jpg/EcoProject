export interface DynamicAxisRangeOptions {
  floor?: number
  paddingRatio?: number
  minPadding?: number
  splitNumber?: number
}

function niceStep(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1

  const exponent = Math.floor(Math.log10(value))
  const fraction = value / 10 ** exponent

  if (fraction <= 1) return 1 * 10 ** exponent
  if (fraction <= 2) return 2 * 10 ** exponent
  if (fraction <= 5) return 5 * 10 ** exponent
  return 10 * 10 ** exponent
}

export function getDynamicAxisRange(
  seriesList: Array<number[] | undefined>,
  options: DynamicAxisRangeOptions = {}
) {
  const values = seriesList
    .flatMap((series) => series ?? [])
    .filter((value): value is number => Number.isFinite(value))

  const splitNumber = options.splitNumber ?? 5
  const paddingRatio = options.paddingRatio ?? 0.12

  if (values.length === 0) {
    return { min: options.floor ?? 0, max: (options.floor ?? 0) + 1 }
  }

  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const span = rawMax - rawMin
  const minPadding = options.minPadding ?? Math.max(Math.abs(rawMax) * 0.05, 1)
  const padding = span > 0 ? Math.max(span * paddingRatio, minPadding) : minPadding

  const tentativeMin = rawMin - padding
  const tentativeMax = rawMax + padding
  const step = niceStep((tentativeMax - tentativeMin) / splitNumber)

  let min = Math.floor(tentativeMin / step) * step
  const max = Math.ceil(tentativeMax / step) * step

  if (options.floor !== undefined) {
    min = Math.max(options.floor, min)
  } else if (rawMin >= 0) {
    min = Math.max(0, min)
  }

  if (min === max) {
    return { min, max: min + step }
  }

  return { min, max }
}
