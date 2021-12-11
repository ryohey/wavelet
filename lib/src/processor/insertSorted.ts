// https://gist.github.com/fmal/763d9c953c5a5f8b8f9099dbc58da55e
export function insertSorted<T>(arr: T[], item: T, prop: keyof T) {
  let low = 0
  let high = arr.length
  let mid
  while (low < high) {
    mid = (low + high) >>> 1 // like (num / 2) but faster
    if (arr[mid][prop] < item[prop]) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  arr.splice(low, 0, item)
}
