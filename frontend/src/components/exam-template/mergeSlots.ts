import type { SlotDraft } from './types'

export function mergeSlots(existing: SlotDraft[], incoming: SlotDraft[]): SlotDraft[] {
    const merged = existing.map(s => ({ ...s, questions: [...s.questions] }))

    for (const inc of incoming) {
        const match = merged.find(s => s.position === inc.position)
        if (match) {
            match.questions.push(...inc.questions)
        } else {
            merged.push({ ...inc, questions: [...inc.questions] })
        }
    }

    return merged.sort((a, b) => a.position - b.position)
}
