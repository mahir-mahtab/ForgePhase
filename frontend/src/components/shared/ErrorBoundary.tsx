import { AlertTriangle } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Keeps one failing workspace from blanking the whole app.
 *
 * Still a class: `getDerivedStateFromError` has no hook equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Workspace crashed:', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex flex-col items-start gap-4 rounded-lg border border-destructive/40 bg-destructive/5 p-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-5 text-destructive" aria-hidden />
          <h2 className="text-base font-semibold">This workspace crashed</h2>
        </div>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button type="button" variant="outline" onClick={this.handleReset}>
          Try again
        </Button>
      </div>
    )
  }
}
