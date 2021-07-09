// Filter a Map object (not to be confused with .filter().map())
export function filterMap<K, V>(
  map: Map<K, V>,
  filterFn: (k: K, v: V) => boolean,
): Map<K, V> {
  const filteredMap = new Map<K, V>();

  for (const [key, value] of map.entries()) {
    if (filterFn(key, value)) {
      filteredMap.set(key, value);
    }
  }
  return filteredMap;
}
