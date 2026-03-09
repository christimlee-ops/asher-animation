import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (!/^[a-zA-Z0-9]+$/.test(username)) {
      return 'Username can only contain letters and numbers.';
    }
    if (password.length < 8) {
      return 'Password must be at least 8 characters.';
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match.';
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await signup(username, email, password);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>AnimateKids</h1>

        {/* Decorative stars */}
        <div style={{ textAlign: 'center', margin: '4px 0 8px' }}>
          <svg width="160" height="48" viewBox="0 0 160 48">
            {[
              { cx: 30, fill: '#FF6B6B' },
              { cx: 60, fill: '#FFEAA7' },
              { cx: 90, fill: '#4ECDC4' },
              { cx: 120, fill: '#DDA0DD' },
            ].map((s, i) => (
              <polygon
                key={i}
                points={`${s.cx},4 ${s.cx + 5},18 ${s.cx + 15},18 ${s.cx + 7},26 ${s.cx + 10},40 ${s.cx},32 ${s.cx - 10},40 ${s.cx - 7},26 ${s.cx - 15},18 ${s.cx - 5},18`}
                fill={s.fill}
                stroke="#fff"
                strokeWidth="1"
              />
            ))}
          </svg>
        </div>

        <p style={styles.subtitle}>Join the fun! Create your account</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="CoolAnimator123"
              required
              style={styles.input}
            />
            <span style={styles.hint}>Letters and numbers only</span>
          </div>

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

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              style={styles.input}
            />
            {password.length > 0 && password.length < 8 && (
              <span style={{ ...styles.hint, color: '#FF6B6B' }}>
                Need {8 - password.length} more character{8 - password.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Type it again"
              required
              style={styles.input}
            />
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <span style={{ ...styles.hint, color: '#FF6B6B' }}>Passwords don't match yet</span>
            )}
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
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>

        <div style={styles.links}>
          <Link to="/login" style={styles.link}>
            Already have an account? Log In
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
    background: 'linear-gradient(135deg, #4ECDC4 0%, #FFEAA7 50%, #DDA0DD 100%)',
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
    color: '#4ECDC4',
    letterSpacing: 1,
  },
  subtitle: {
    textAlign: 'center',
    color: '#666',
    fontSize: '1.05rem',
    margin: '0 0 8px',
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
    color: '#FF6B6B',
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
  hint: {
    fontSize: '0.8rem',
    color: '#999',
    marginTop: 2,
  },
  button: {
    padding: '14px 0',
    borderRadius: 16,
    border: 'none',
    background: 'linear-gradient(135deg, #4ECDC4, #45B7D1)',
    color: '#fff',
    fontSize: '1.3rem',
    fontWeight: 'bold',
    fontFamily: 'inherit',
    cursor: 'pointer',
    marginTop: 4,
    letterSpacing: 0.5,
    boxShadow: '0 4px 14px rgba(78,205,196,0.4)',
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
