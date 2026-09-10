import { BRAND } from '../../brand'
import type { WorldState } from './types'

/**
 * Стартовый, ещё не сломанный мир.
 *
 * Сценарий не описывает мир целиком — он патчит этот. Поэтому здесь
 * всё исправно: адреса выданы, шлюз есть, DNS отвечает. Задача seed —
 * дать связную организацию, в которой поломка выглядит правдоподобно.
 */
export function seedWorld(): WorldState {
  return {
    org: {
      users: [
        {
   samAccountName: 'p.raman',
          displayName: 'Priya Raman',
   dept: 'Продажи',
   title: 'менеджер по работе с клиентами',
          email: `priya.raman@${BRAND.domain}`,
          phone: '+1 (512) 555-0148',
   primaryDevice: 'AL-LPT-0447',
        },
        {
   samAccountName: 's.okafor',
          displayName: 'Sam Okafor',
   dept: 'Финансы',
   title: 'финансовый аналитик',
          email: `sam.okafor@${BRAND.domain}`,
          phone: '+1 (512) 555-0152',
   primaryDevice: 'AL-DSK-0192',
        },
      ],
    },

    devices: {
      'AL-LPT-0447': {
 hostname: 'AL-LPT-0447',
 assetTag: 'AL-L0447',
        vendor: 'Torvald',
        model: 'WorkLine T14 Gen 4',
        assignedTo: 'p.raman',
        adapters: [
          {
            name: 'Ethernet',
     description: 'Ethernet Adapter',
            mac: 'A4-83-E7-2C-91-44',
     dhcpEnabled: true,
     autoconfigEnabled: true,
     autoconfigured: false,
     ip: '10.20.14.88',
     mask: '255.255.255.0',
     gateway: '10.20.14.1',
     dns: ['10.20.14.10', '10.20.14.11'],
     leaseObtained: '2026-09-09T09:00:00.000Z',
     leaseExpires: '2026-09-10T09:00:00.000Z',
     linkUp: true,
     segment: 'vlan20',
          },
        ],
      },

      'AL-DSK-0192': {
 hostname: 'AL-DSK-0192',
 assetTag: 'AL-D0192',
        vendor: 'Novatek',
        model: 'OptiLine 7010',
 assignedTo: 's.okafor',
        adapters: [
   {
     name: 'Ethernet',
     description: 'Ethernet Adapter',
     mac: 'B2-1E-4C-77-03-A9',
            dhcpEnabled: true,
     autoconfigEnabled: true,
            autoconfigured: false,
     ip: '10.20.14.91',
     mask: '255.255.255.0',
     gateway: '10.20.14.1',
            dns: ['10.20.14.10', '10.20.14.11'],
     leaseObtained: '2026-09-09T08:30:00.000Z',
     leaseExpires: '2026-09-10T08:30:00.000Z',
            linkUp: true,
     segment: 'vlan20',
   },
        ],
      },
    },

    network: {
      segments: [
        {
   vlan: 'vlan20',
   subnet: '10.20.14.0/24',
   gateway: '10.20.14.1',
   dhcpServer: '10.20.14.5',
   dhcpHealthy: true,
          leasePool: ['10.20.14.88', '10.20.14.89', '10.20.14.90'],
   dns: ['10.20.14.10', '10.20.14.11'],
 },
      ],

      dnsServers: [
        {
   ip: '10.20.14.10',
          reachable: true,
          zones: {
     [`internal-portal.${BRAND.domain}`]: '10.20.14.50',
     [`fileserver.${BRAND.domain}`]: '10.20.14.15',
     [`mail.${BRAND.domain}`]: '10.20.14.25',
   },
        },
        {
   ip: '10.20.14.11',
          reachable: true,
          zones: {},
        },
      ],

      publicHosts: ['8.8.8.8', '1.1.1.1'],
    },
  }
}
