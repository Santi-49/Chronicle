/**
 * Serializes versioning work per source path. A restore and a watcher capture
 * for the same asset must not race into two versions, while unrelated assets
 * remain fully concurrent.
 */
const pathQueues = new Map<string, Promise<unknown>>()

export function serializedByPath<T>(key: string, task: () => Promise<T>): Promise<T> {
  const tail = pathQueues.get(key) ?? Promise.resolve()
  const run = tail.then(task, task)
  const settled = run.catch(() => {})
  pathQueues.set(key, settled)
  void settled.then(() => {
    if (pathQueues.get(key) === settled) pathQueues.delete(key)
  })
  return run
}
