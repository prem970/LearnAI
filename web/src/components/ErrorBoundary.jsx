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
        <div className="min-h-screen flex items-center justify-center bg-[#f0f9ff] p-6">
          <div className="text-center max-w-md">
            <p className="text-2xl mb-2">Something went wrong</p>
            <p className="text-slate-600 text-sm mb-4">
              We&apos;re sorry. Please refresh the page or try again later.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-[#2563eb] text-white font-medium hover:bg-[#1d4ed8] transition-colors"
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
