'use client'

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A0D12',
          color: '#E5E7EB',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '2rem',
        }}>
          <div style={{
            maxWidth: '32rem',
            background: '#161D2B',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          }}>
            <div style={{
              width: '3rem',
              height: '3rem',
              borderRadius: '999px',
              background: '#991B1B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.5rem',
              fontSize: '1.5rem',
            }}>
              ⚠️
            </div>
            
            <h1 style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              marginBottom: '0.75rem',
              color: '#F3F4F6',
            }}>
              Application error
            </h1>
            
            <p style={{
              fontSize: '0.95rem',
              lineHeight: '1.6',
              color: '#9CA3AF',
              marginBottom: '1.5rem',
            }}>
              The application encountered an unexpected error. This may be caused by:
            </p>

            <ul style={{
              fontSize: '0.9rem',
              lineHeight: '1.8',
              color: '#9CA3AF',
              marginBottom: '1.5rem',
              paddingLeft: '1.25rem',
            }}>
              <li>Network connection issues (or Mixed Content on HTTPS tunnels)</li>
              <li>Backend API unreachable or not responding</li>
              <li>An unexpected client runtime error</li>
            </ul>

            {this.state.error && (
              <details style={{
                fontSize: '0.85rem',
                marginBottom: '1.5rem',
                background: '#0F131C',
                padding: '1rem',
                borderRadius: '0.5rem',
                border: '1px solid #1E2636',
              }}>
                <summary style={{
                  cursor: 'pointer',
                  fontWeight: '500',
                  color: '#D1D5DB',
                  marginBottom: '0.5rem',
                }}>
                  Technical details
                </summary>
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: '#EF4444',
                  fontSize: '0.8rem',
                  lineHeight: '1.5',
                  margin: 0,
                }}>
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <button
              onClick={() => window.location.reload()}
              style={{
                width: '100%',
                padding: '0.75rem 1.5rem',
                background: '#3B82F6',
                color: 'white',
                border: 'none',
                borderRadius: '999px',
                fontSize: '0.95rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.background = '#2563EB'}
              onMouseOut={(e) => e.currentTarget.style.background = '#3B82F6'}
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
