import type { Course } from '../core/learning/types'
import { firstLine } from './first-line'

/** Библиотека курсов. Проверяется загрузчиком при создании стора. */
export const COURSES: Course[] = [firstLine]
