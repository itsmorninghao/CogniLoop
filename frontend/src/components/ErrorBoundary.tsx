import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false }

    static getDerivedStateFromError(): State {
        return { hasError: true }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary]', error, info.componentStack)
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback ?? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                    <AlertCircle className="size-10 text-destructive" />
                    <p className="text-sm text-muted-foreground">页面出现错误，请刷新重试</p>
                    <button
                        onClick={() => this.setState({ hasError: false })}
                        className="text-sm text-primary hover:underline"
                    >
                        重试
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}
