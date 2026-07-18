import { describe, it, expect, vi } from 'vitest'

const rpc = vi.hoisted(() => ({ bt: null as any, audio: null as any }))
vi.mock('../../runtime/host/decky', () => ({
  call: async (method: string) => (method === 'get_bluetooth_state' ? rpc.bt : rpc.audio),
}))

import {
  evalPeripheralRule, isPeripheralRuleKind, requestPeripheralsRefresh, getBluetoothPaired,
} from '../../runtime/peripheralsState'

describe('evalPeripheralRule', () => {
  it('bluetoothConnected matches the selected device; headphones reads audio state', async () => {
    rpc.bt = { paired: [{ mac: 'AA:BB', name: 'WH-1000XM4' }], connected: ['AA:BB'], supported: true }
    rpc.audio = { headphones: true, supported: true }
    requestPeripheralsRefresh()
    await new Promise((r) => setTimeout(r, 0)) // let the on-demand refresh resolve

    expect(isPeripheralRuleKind('bluetoothConnected')).toBe(true)
    expect(isPeripheralRuleKind('headphonesConnected')).toBe(true)
    expect(isPeripheralRuleKind('battery')).toBe(false)

    expect(evalPeripheralRule({ kind: 'bluetoothConnected', mac: 'aa:bb' })).toBe(true)  // case-insensitive
    expect(evalPeripheralRule({ kind: 'bluetoothConnected', mac: 'CC:DD' })).toBe(false)
    expect(evalPeripheralRule({ kind: 'bluetoothConnected' })).toBe(true)               // unconfigured → fail open
    expect(evalPeripheralRule({ kind: 'headphonesConnected' })).toBe(true)

    expect(getBluetoothPaired().map((d) => d.mac)).toEqual(['AA:BB'])
  })
})
