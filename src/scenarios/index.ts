import { apipaNoLease } from './net-apipa-no-lease'
import { printSpoolerStopped } from './print-spooler-stopped'
import { identityAccountLockout } from './identity-account-lockout'
import { identityShareAccess } from './identity-share-access'
import { wrongVlanPort } from './net-wrong-vlan-port'
import { dhcpRelayMissing } from './net-dhcp-relay-missing'
import { hwDockFailed } from './hw-dock-failed'
import { hwHeadsetWorn } from './hw-headset-worn'
import { dnsStaleStatic } from './net-dns-stale-static'
import type { Scenario } from '../core/scenario/types'

/**
 * Библиотека сценариев.
 *
 * Порядок задаёт порядок в очереди. Сценарии ломают разные машины,
 * поэтому загружаются в один мир без конфликтов.
 */
export const SCENARIOS: Scenario[] = [
  apipaNoLease,
  printSpoolerStopped,
  identityAccountLockout,
  identityShareAccess,
  wrongVlanPort,
  dhcpRelayMissing,
  hwDockFailed,
  hwHeadsetWorn,
  dnsStaleStatic,
]

export function scenarioFor(id: string): Scenario {
  const found = SCENARIOS.find(s => s.id === id)
  if (!found) throw new Error(`сценарий не найден: ${id}`)
  return found
}
