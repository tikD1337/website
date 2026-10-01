import { describe, it, expect } from 'vitest'
import { build } from 'esbuild'
import { secrets } from './content/server/secrets'

/**
 * Главный тест среза 8А: в публичном бандле нет контента.
 *
 * Пользователь: «можно зайти на /assets/index-….js и все украсть». Бандл
 * собирается тем же путём, что видит браузер (`src/main.tsx`), и
 * проверяется дважды: ни одного файла контента или сервера среди входов
 * — и ни одной строки решения в тексте сборки, по всей библиотеке.
 */
describe('бандл', () => {
  it('в него не попадает ни файла, ни строки контента', async () => {
    const result = await build({
      entryPoints: ['src/main.tsx'],
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      jsx: 'automatic',
      loader: { '.css': 'empty' },
      logLevel: 'silent',
    })
    const inputs = Object.keys(result.metafile.inputs)
    for (const dir of ['src/scenarios/', 'src/courses/', 'src/interviews/', 'src/content/server/']) {
      expect(inputs.filter(f => f.startsWith(dir)), dir).toEqual([])
    }
    expect(inputs.filter(f => f.startsWith('node:')), 'node:*').toEqual([])

    const text = result.outputFiles.map(f => f.text).join('\n')
    for (const secret of secrets()) expect(text.includes(secret), secret).toBe(false)
  }, 30_000)
})
