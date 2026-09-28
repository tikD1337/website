import type { Driver, WorldState } from '../world/types'

/**
 * Периферия машины глазами диспетчера устройств.
 *
 * Строки выводятся из учёта — активов, подключённых к машине, — а не
 * хранятся в списке драйверов: иначе замена дока в CMDB оставила бы в
 * диспетчере старую ошибку. Изношенная гарнитура электрически исправна,
 * и диспетчер честно видит её здоровой: это и есть находка «дело не в
 * драйвере».
 */
export function peripheralsOf(world: WorldState, host: string): Driver[] {
  return world.cmdb.filter(a => a.attachedTo === host).flatMap((a): Driver[] => {
    switch (a.kind) {
      case 'dock':
        return [{
          device: `${a.vendor} ${a.model}`, provider: a.vendor, version: '5.2.14.0',
          ...(a.condition === 'faulty'
            ? {
                status: 'problem', problemCode: 43,
                problemText: 'Windows has stopped this device because it has reported problems. (Code 43)',
              }
            : { status: 'ok', problemCode: null, problemText: null }),
        }]
      case 'headset':
        return [{
          device: `${a.vendor} ${a.model}`, provider: 'Vantage', version: '10.0.22631.1',
          status: 'ok', problemCode: null, problemText: null,
        }]
      case 'monitor':
        return [{
          device: 'Generic PnP Monitor', provider: 'Vantage', version: '10.0.22631.1',
          status: 'ok', problemCode: null, problemText: null,
        }]
      default:
        return []
    }
  })
}
