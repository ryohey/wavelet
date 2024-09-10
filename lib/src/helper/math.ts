/**
 * This is a custom implementation of Math.max to prevent call stack size exceeded error
 *   when using Math.max(...arr).
 */
export function max(arr: number[]): number | undefined {
  if (arr.length === 0) {
    return undefined
  }
  let max = arr[0]
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > max) {
      max = arr[i]
    }
  }
  return max
}
