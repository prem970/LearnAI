import { useAuth } from '../context/useAuth.js'
import '../components/form.css'

function Dashboard() {
  const { user, role, logout } = useAuth()

  const displayName = user?.name || 'User'

  return (
    <div className="auth-page">
      <div className="auth-card">
        <header className="auth-header">
          <div>
            <p className="auth-title">Welcome to LearnAI</p>
            <p className="auth-subtitle">
              Hi {displayName}, you are logged in as a {role}.
            </p>
          </div>
        </header>

        <p style={{ fontSize: '0.95rem', marginBottom: '1.25rem' }}>
          This is a placeholder dashboard. Once the rest of the platform is ready,
          you will see your classes, schedules, and learning content here.
        </p>

        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={logout}
        >
          Log out
        </button>
      </div>
    </div>
  )
}

export default Dashboard

