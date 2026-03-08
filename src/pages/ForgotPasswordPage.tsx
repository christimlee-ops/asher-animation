import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      await resetPassword(email);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>AnimateKids</h1>

        {/* Cute lock icon */}
        <svg width="72" height="72" viewBox="0 0 72 72" style={{ display: 'block', margin: '12px auto' }}>
          <rect x="16" y="32" width="40" height="30" rx="6" fill="#FFEAA7" stroke="#FF6B6B" strokeWidth="2.5" />
          <path
            d="M24 32 V24 A12 12 0 0 1 48 24 V32"
            fill="none"
            stroke="#4ECDC4"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="36" cy="46" r="4" fill="#FF6B6B" />
          <rect x="34.5" y="48" width="3" height="6" rx="1.5" fill="#FF6B6B" />
        </svg>

        <p style={styles.subtitle}>
          {success
            ? 'Check your email for a reset link!'
            : "No worries! We'll help you get back in."}
        </p>

        {error && <div style={styles.error}>{error}</div>}

        {success ? (
          <div style={styles.successBox}>
            A password reset link has been sent to <strong>{email}</strong>. Check your inbox (and spam folder).
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                style={styles.input}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.button,
                opacity: loading ? 0.6 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <div style={styles.links}>
          <Link to="/login" style={styles.link}>
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #FFEAA7 0%, #96CEB4 50%, #45B7D1 100%)',
    fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
    padding: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 24,
    padding: '36px 36px',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
  },
  title: {
    textAlign: 'center',
    fontSize: '2.2rem',
    margin: 0,
    color: '#96CEB4',
    letterSpacing: 1,
  },
  subtitle: {
    textAlign: 'center',
    color: '#666',
    fontSize: '1.05rem',
    margin: '0 0 12px',
  },
  error: {
    background: '#ffe0e0',
    color: '#d32f2f',
    padding: '10px 14px',
    borderRadius: 12,
    fontSize: '0.9rem',
    marginBottom: 8,
    textAlign: 'center',
  },
  successBox: {
    background: '#e8f5e9',
    color: '#2e7d32',
    padding: '14px 16px',
    borderRadius: 14,
    fontSize: '0.95rem',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontWeight: 'bold',
    fontSize: '1rem',
    color: '#45B7D1',
  },
  input: {
    padding: '12px 14px',
    borderRadius: 14,
    border: '2px solid #ddd',
    fontSize: '1rem',
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  button: {
    padding: '14px 0',
    borderRadius: 16,
    border: 'none',
    background: 'linear-gradient(135deg, #96CEB4, #45B7D1)',
    color: '#fff',
    fontSize: '1.3rem',
    fontWeight: 'bold',
    fontFamily: 'inherit',
    cursor: 'pointer',
    marginTop: 4,
    letterSpacing: 0.5,
    boxShadow: '0 4px 14px rgba(150,206,180,0.4)',
  },
  links: {
    textAlign: 'center',
    marginTop: 18,
  },
  link: {
    color: '#FF6B6B',
    fontWeight: 'bold',
    textDecoration: 'none',
    fontSize: '0.95rem',
  },
};
