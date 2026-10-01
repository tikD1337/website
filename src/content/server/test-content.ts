import { createContentService } from './service'
import { nodeSigner } from './sign'
import { LIBRARY } from './library'
import type { ContentService } from '../port'

/**
 * Сервис контента для тестов — он же синхронный разъём.
 *
 * Своя библиотека подменяет общую по частям; ссылки курсов и треков
 * сверяются с общей библиотекой и своей вместе — тестам со своими
 * сценариями не нужны сценарии курса.
 */
export function testContent(
  over: Partial<typeof LIBRARY> = {},
  now: () => number = () => Date.parse('2026-10-01T09:00:00Z'),
): ContentService {
  const lib = { ...LIBRARY, ...over }
  return createContentService({
    ...lib,
    sign: nodeSigner('test-secret'),
    now,
    knownScenarioIds: [...new Set([...LIBRARY.scenarios, ...lib.scenarios].map(s => s.id))],
  })
}
