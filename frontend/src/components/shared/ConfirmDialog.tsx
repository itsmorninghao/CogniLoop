import * as AlertDialog from '@radix-ui/react-alert-dialog'

interface Props {
    open: boolean
    title: string
    description: string
    confirmLabel?: string
    cancelLabel?: string
    destructive?: boolean
    onConfirm: () => void
    onCancel: () => void
}

export function ConfirmDialog({
    open, title, description,
    confirmLabel = '确认', cancelLabel = '取消',
    destructive = false, onConfirm, onCancel,
}: Props) {
    return (
        <AlertDialog.Root open={open}>
            <AlertDialog.Portal>
                <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
                <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl">
                    <AlertDialog.Title className="text-base font-medium text-foreground">{title}</AlertDialog.Title>
                    <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">{description}</AlertDialog.Description>
                    <div className="mt-5 flex justify-end gap-3">
                        <AlertDialog.Cancel asChild>
                            <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-accent">
                                {cancelLabel}
                            </button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <button
                                onClick={onConfirm}
                                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${destructive ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'}`}
                            >
                                {confirmLabel}
                            </button>
                        </AlertDialog.Action>
                    </div>
                </AlertDialog.Content>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    )
}
