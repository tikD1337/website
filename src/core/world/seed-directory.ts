import { BRAND } from '../../brand'
import type {
  OrganizationalUnit, DirectoryGroup, OrgUser, FileShare,
} from './types'

/**
 * Каталог организации.
 *
 * Структура по образцу настоящего домена: сотрудники разложены по
 * отделам, рабочие станции и серверы отдельно, привилегированные
 * учётные записи в Admin/Tier0 — туда первая линия никого не добавляет.
 *
 * Вынесено из `seed.ts`: каталог — самостоятельный кусок мира, и вместе
 * с устройствами один файл стал бы неудобным.
 */

export const DOMAIN = 'DC=arcline,DC=corp'

const CORP = 'OU=Corp'
const EMPLOYEES = `OU=Employees,${CORP}`
const GROUPS_OU = `OU=Groups,${CORP}`
const ADMIN = `OU=Admin,${CORP}`

export function seedOus(): OrganizationalUnit[] {
  return [
    { path: CORP, name: 'Corp', parent: null },
    { path: EMPLOYEES, name: 'Employees', parent: CORP },
    { path: `OU=Sales,${EMPLOYEES}`, name: 'Sales', parent: EMPLOYEES },
    { path: `OU=Finance,${EMPLOYEES}`, name: 'Finance', parent: EMPLOYEES },
    { path: `OU=IT,${EMPLOYEES}`, name: 'IT', parent: EMPLOYEES },
    { path: `OU=Operations,${EMPLOYEES}`, name: 'Operations', parent: EMPLOYEES },
    { path: `OU=Workstations,${CORP}`, name: 'Workstations', parent: CORP },
    { path: `OU=Servers,${CORP}`, name: 'Servers', parent: CORP },
    { path: `OU=ServiceAccounts,${CORP}`, name: 'ServiceAccounts', parent: CORP },
    { path: GROUPS_OU, name: 'Groups', parent: CORP },
    { path: `OU=Security-Groups,${GROUPS_OU}`, name: 'Security-Groups', parent: GROUPS_OU },
    { path: `OU=Distribution-Lists,${GROUPS_OU}`, name: 'Distribution-Lists', parent: GROUPS_OU },
    { path: ADMIN, name: 'Admin', parent: CORP },
    { path: `OU=Tier0-Accounts,${ADMIN}`, name: 'Tier0-Accounts', parent: ADMIN },
    { path: `OU=Helpdesk-Accounts,${ADMIN}`, name: 'Helpdesk-Accounts', parent: ADMIN },
  ]
}

const SEC = `OU=Security-Groups,${GROUPS_OU}`

export function seedShares(): FileShare[] {
  return [
    {
      path: `\\\\fileserver.${BRAND.domain}\\Finance-Reports`,
      description: 'Отчётность финансового отдела',
      requiresGroup: 'GRP-Finance-Reports',
    },
    {
      path: `\\\\fileserver.${BRAND.domain}\\Sales-Contracts`,
      description: 'Договоры отдела продаж',
      requiresGroup: 'GRP-Sales-Contracts',
    },
    {
      path: `\\\\fileserver.${BRAND.domain}\\Company-Wide`,
      description: 'Общие документы',
      requiresGroup: 'GRP-All-Staff',
    },
  ]
}

export function seedGroups(): DirectoryGroup[] {
  const fs = `\\\\fileserver.${BRAND.domain}`

  return [
    {
      name: 'GRP-All-Staff',
      displayName: 'Все сотрудники',
      ou: SEC,
      description: 'Доступ к общим документам',
      members: ['p.raman', 's.okafor', 'e.varga', 'd.mbeki'],
      grantsAccessTo: [`${fs}\\Company-Wide`],
      protected: false,
    },
    {
      name: 'GRP-Sales-Contracts',
      displayName: 'Договоры — продажи',
      ou: SEC,
      description: 'Доступ к договорам отдела продаж',
      members: ['p.raman'],
      grantsAccessTo: [`${fs}\\Sales-Contracts`],
      protected: false,
    },
    {
      name: 'GRP-Finance-Reports',
      displayName: 'Отчётность — финансы',
      ou: SEC,
      description: 'Доступ к финансовой отчётности',
      members: ['s.okafor'],
      grantsAccessTo: [`${fs}\\Finance-Reports`],
      protected: false,
    },
    {
      name: 'GRP-Printer-Floor3',
      displayName: 'Принтер, третий этаж',
      ou: SEC,
      description: 'Печать на принтере третьего этажа',
      members: ['p.raman', 's.okafor', 'e.varga'],
      grantsAccessTo: [],
      protected: false,
    },
    {
      name: 'Domain Admins',
      displayName: 'Администраторы домена',
      ou: `OU=Tier0-Accounts,${ADMIN}`,
      description: 'Полные права в домене — не для первой линии',
      members: ['a.tier0'],
      grantsAccessTo: [],
      protected: true,
    },
    {
      name: 'GRP-Helpdesk-T1',
      displayName: 'Служба поддержки, первая линия',
      ou: `OU=Helpdesk-Accounts,${ADMIN}`,
      description: 'Права первой линии: разблокировка и сброс паролей',
      members: [],
      grantsAccessTo: [],
      protected: true,
    },
  ]
}

export function seedUsers(): OrgUser[] {
  const pwdSet = '2026-07-01T09:00:00.000Z'
  // Вчерашний вечер: все, кроме административной учётки, работали накануне.
  const yesterday = '2026-09-09T17:42:11.000Z'

  return [
    {
      samAccountName: 'p.raman',
      displayName: 'Priya Raman',
      dept: 'Продажи',
      title: 'менеджер по работе с клиентами',
      email: `priya.raman@${BRAND.domain}`,
      phone: '+1 (512) 555-0148',
      primaryDevice: 'AL-LPT-0447',
      ou: `OU=Sales,${EMPLOYEES}`,
      manager: 'Elena Varga',
      office: '3-14',
      enabled: true,
      lockedOut: false,
      lockoutSource: null,
      pwdExpired: false,
      pwdLastSet: pwdSet,
      lastLogon: yesterday,
      badPwdCount: 0,
      groups: ['GRP-All-Staff', 'GRP-Sales-Contracts', 'GRP-Printer-Floor3'],
    },
    {
      samAccountName: 's.okafor',
      displayName: 'Sam Okafor',
      dept: 'Финансы',
      title: 'финансовый аналитик',
      email: `sam.okafor@${BRAND.domain}`,
      phone: '+1 (512) 555-0152',
      primaryDevice: 'AL-DSK-0192',
      ou: `OU=Finance,${EMPLOYEES}`,
      manager: 'Dumisani Mbeki',
      office: '2-08',
      enabled: true,
      lockedOut: false,
      lockoutSource: null,
      pwdExpired: false,
      pwdLastSet: pwdSet,
      lastLogon: '2026-09-09T16:05:49.000Z',
      badPwdCount: 0,
      groups: ['GRP-All-Staff', 'GRP-Finance-Reports', 'GRP-Printer-Floor3'],
    },
    {
      samAccountName: 'e.varga',
      displayName: 'Elena Varga',
      dept: 'Продажи',
      title: 'руководитель отдела продаж',
      email: `elena.varga@${BRAND.domain}`,
      phone: '+1 (512) 555-0161',
      primaryDevice: 'AL-LPT-0512',
      ou: `OU=Sales,${EMPLOYEES}`,
      manager: 'Dumisani Mbeki',
      office: '3-20',
      enabled: true,
      lockedOut: false,
      lockoutSource: null,
      pwdExpired: false,
      pwdLastSet: pwdSet,
      lastLogon: '2026-09-09T18:20:03.000Z',
      badPwdCount: 0,
      groups: ['GRP-All-Staff', 'GRP-Printer-Floor3'],
    },
    {
      samAccountName: 'd.mbeki',
      displayName: 'Dumisani Mbeki',
      dept: 'Операции',
      title: 'операционный директор',
      email: `dumisani.mbeki@${BRAND.domain}`,
      phone: '+1 (512) 555-0170',
      primaryDevice: 'AL-LPT-0601',
      ou: `OU=Operations,${EMPLOYEES}`,
      manager: '',
      office: '4-01',
      enabled: true,
      lockedOut: false,
      lockoutSource: null,
      pwdExpired: false,
      pwdLastSet: pwdSet,
      lastLogon: '2026-09-09T14:11:27.000Z',
      badPwdCount: 0,
      groups: ['GRP-All-Staff'],
    },
    {
      samAccountName: 'a.tier0',
      displayName: 'Домен, административная учётная запись',
      dept: 'Информационные технологии',
      title: 'администратор домена',
      email: `admin@${BRAND.domain}`,
      phone: '',
      primaryDevice: 'AL-LPT-0447',
      ou: `OU=Tier0-Accounts,${ADMIN}`,
      manager: '',
      office: '',
      enabled: true,
      lockedOut: false,
      lockoutSource: null,
      pwdExpired: false,
      pwdLastSet: pwdSet,
      // Административной учётной записью давно не пользовались в интерактиве.
      lastLogon: '2026-08-14T07:30:00.000Z',
      badPwdCount: 0,
      groups: ['Domain Admins'],
    },
  ]
}
