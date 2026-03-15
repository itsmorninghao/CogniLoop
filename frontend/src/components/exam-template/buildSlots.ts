import type { OcrQuestion, SlotDraft } from './types'

export function buildSlotsFromQuestions(questions: OcrQuestion[]): SlotDraft[] {
    const slotMap = new Map<number, { position: number; question_type: string; questions: OcrQuestion[] }>()

    for (const q of questions) {
        const pos = q.position || (slotMap.size + 1)
        const existing = slotMap.get(pos)
        if (existing) {
            existing.questions.push(q)
        } else {
            slotMap.set(pos, {
                position: pos,
                question_type: q.question_type || 'short_answer',
                questions: [q],
            })
        }
    }

    return Array.from(slotMap.values())
        .sort((a, b) => a.position - b.position)
        .map(s => ({
            position: s.position,
            question_type: s.question_type,
            label: '',
            difficulty_hint: '',
            questions: s.questions.map(q => ({
                content: q.content || '',
                answer: q.answer || '',
                analysis: '',
                difficulty: 'medium',
                knowledge_points: [] as string[],
                source_label: '',
            })),
        }))
}
