const DEVELOPER_MODE_KEY = 'chronicle-developer-mode'

export function readDeveloperMode(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  return storage.getItem(DEVELOPER_MODE_KEY) === 'true'
}

export function writeDeveloperMode(
  enabled: boolean,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  storage.setItem(DEVELOPER_MODE_KEY, String(enabled))
}

