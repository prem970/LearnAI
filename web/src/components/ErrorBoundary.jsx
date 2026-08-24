import { Component } from 'react'
import PropTypes from 'prop-types'

export class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="min-h-screen flex items-center justify-center bg-[var(--board-steel-deep)] p-6">
          <div className="text-center max-w-md border border-[var(--board-rule)] bg-[var(--board-steel)] p-6">
            <p className="text-2xl mb-2 text-[var(--flap-ink)] font-[family-name:var(--font-flap)] tracking-[0.08em] uppercase">
              Something went wrong
            </p>
            <p className="text-[var(--flap-mute)] text-sm mb-4">
              We&apos;re sorry. Please refresh the page or try again later.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 font-[family-name:var(--font-flap)] text-[11px] font-semibold tracking-[0.14em] uppercase bg-[var(--flap-amber)] text-[var(--board-steel-deep)] hover:brightness-110 transition-colors border-none cursor-pointer"
            >
              Refresh page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.node,
}
