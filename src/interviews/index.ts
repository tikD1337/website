import type { InterviewTrack } from '../core/interview/types'
import { firstLineInterview } from './first-line'

/** Библиотека треков интервью. Проверяется загрузчиком при создании стора. */
export const INTERVIEWS: InterviewTrack[] = [firstLineInterview]
