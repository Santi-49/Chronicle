import { useCallback, useEffect, useState } from 'react'
import type { UpdateState } from '../../../shared/ipc'
import { chronicle } from './bridge'

export interface UpdatesApi {
  state: UpdateState | undefined
  check: () => Promise<void>
  /** Automatic delivery (packaged Windows). */
  restart: () => Promise<void>
  /** Manual delivery (packaged macOS) — opens the published installer in the browser. */
  openDownload: () => Promise<void>
}

export function useUpdates(): UpdatesApi {
  const [state, setState] = useState<UpdateState>()

  useEffect(() => {
    void chronicle.getUpdateState().then(setState)
    return chronicle.on('updateStateChanged', setState)
  }, [])

  const check = useCallback(async () => {
    setState(await chronicle.checkForUpdates())
  }, [])

  const restart = useCallback(async () => {
    await chronicle.restartToUpdate()
  }, [])

  const openDownload = useCallback(async () => {
    await chronicle.openUpdateDownload()
  }, [])

  return { state, check, restart, openDownload }
}
