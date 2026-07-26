import { useCallback, useEffect, useState } from 'react'
import type { UpdateState } from '../../../shared/ipc'
import { chronicle } from './bridge'

export interface UpdatesApi {
  state: UpdateState | undefined
  check: () => Promise<void>
  restart: () => Promise<void>
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

  return { state, check, restart }
}
