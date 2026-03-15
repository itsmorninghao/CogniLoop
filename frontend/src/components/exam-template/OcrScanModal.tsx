/**
 * OcrScanModal — thin modal shell wrapping OcrScanner.
 * On scan complete, navigates to the new template editor with pre-filled slots.
 */

import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { X } from 'lucide-react'
import OcrScanner from './OcrScanner'
import type { SlotDraft } from './types'

interface OcrScanModalProps {
    open: boolean
    onClose: () => void
}

export default function OcrScanModal({ open, onClose }: OcrScanModalProps) {
    const navigate = useNavigate()

    const handleScanComplete = useCallback((slots: SlotDraft[]) => {
        navigate('/exam-templates/new', { state: { ocrSlots: slots } })
        onClose()
    }, [navigate, onClose])

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
            <div className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h2 className="text-lg font-semibold text-foreground">扫描试卷导入</h2>
                    <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-accent transition-colors">
                        <X className="size-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <OcrScanner onScanComplete={handleScanComplete} onCancel={onClose} />
                </div>
            </div>
        </div>
    )
}
