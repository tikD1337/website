/**
 * Вымышленные бренды.
 *
 * Тренажёр воспроизводит workflow службы поддержки, а не чужую продукцию:
 * реальные товарные знаки в данных не появляются. Тест `brand.test.ts`
 * проверяет это механически, так что список ниже — не декорация.
 *
 * Исключение одно и оно осознанное: **вывод команд** воспроизводится
 * дословно, включая строку `Windows IP Configuration`. Это не название
 * нашего продукта, а текст, который техник обязан научиться читать —
 * подменить его значит обесценить тренировку.
 */

/** Реальные марки, которых не должно быть ни в коде, ни в данных мира. */
export const FORBIDDEN_TRADEMARKS = [
  'microsoft', 'windows nt', 'dell', 'hewlett', 'lenovo', 'thinkpad',
  'cisco', 'apple', 'ipad', 'macbook', 'canon', 'logitech', 'jabra',
  'zebra', 'panasonic', 'office 365', 'onedrive', 'outlook', 'teams',
] as const

export const BRAND = {
  company: 'Arcline Logistics',
  domain: 'arcline.corp',
  dnsSuffix: 'corp.arcline.local',

  os: 'Vantage Windows',
  osVersion: '10.0.22631.3880',
  browser: 'Larkspur Browser',
  mail: 'ArcMail',
  office: 'WorkGrid 365',
  chat: 'Loopline',
  cloud: 'ArcDrive',

  vendors: {
    laptop: ['Torvald', 'Novatek', 'Kestrel'],
    desktop: ['Novatek', 'Kestrel'],
    tablet: ['Bramble'],
    network: ['Ferrix'],
    printer: ['Kiyomi'],
    peripheral: ['Halyard'],
  },
} as const
