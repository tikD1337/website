export interface NotePart {
  id: 'symptom' | 'checks' | 'change' | 'verification' | 'handoff'
  label: string
  earned: boolean
  explain: string
}

export interface Penalty {
  id: 'plaintext-secret' | 'no-specifics' | 'symptom-as-diagnosis'
  label: string
  points: number
}

export interface NoteScore {
  /** 0–10 */
  score: number
  parts: NotePart[]
  penalties: Penalty[]
}
