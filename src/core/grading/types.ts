export interface NotePart {
  /**
   * `change` и `verification` — у починки; у эскалации вместо них
   * `escalation` (что передано) и `informed` (заявитель предупреждён).
   */
  id: 'symptom' | 'checks' | 'change' | 'verification' | 'escalation' | 'informed' | 'handoff'
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
