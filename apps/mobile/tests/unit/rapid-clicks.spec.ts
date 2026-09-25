import { describe, expect, test, vi } from 'vitest'
import { useRapidClicks } from '@/compsables/common'

describe('useRapidClicks', () => {
  const setup = () => {
    let t = 0
    const onTrigger = vi.fn()
    const { click } = useRapidClicks(10, 60_000, onTrigger, () => t)
    return { click, onTrigger, advance: (ms: number) => { t += ms } }
  }

  test('triggers on 10th click within window', () => {
    const { click, onTrigger, advance } = setup()
    for (let i = 0; i < 9; i++) { click(); advance(5_000) }
    expect(onTrigger).not.toHaveBeenCalled()
    click()
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  test('ignores clicks older than window', () => {
    const { click, onTrigger, advance } = setup()
    for (let i = 0; i < 10; i++) { click(); advance(7_000) }
    expect(onTrigger).not.toHaveBeenCalled()
  })

  test('resets after trigger', () => {
    const { click, onTrigger } = setup()
    for (let i = 0; i < 19; i++) click()
    expect(onTrigger).toHaveBeenCalledTimes(1)
    click()
    expect(onTrigger).toHaveBeenCalledTimes(2)
  })
})
