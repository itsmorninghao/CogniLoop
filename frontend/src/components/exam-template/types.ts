export interface OcrQuestion {
    position?: number
    question_type?: string
    content?: string
    answer?: string
}

export interface QuestionDraft {
    id?: number
    content: string
    answer: string
    analysis: string
    difficulty: string
    knowledge_points: string[]
    source_label: string
}

export interface SlotDraft {
    position: number
    question_type: string
    label: string
    difficulty_hint: string
    questions: QuestionDraft[]
}
