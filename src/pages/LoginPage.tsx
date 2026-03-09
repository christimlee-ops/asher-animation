import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Rate limiting
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockCountdown, setLockCountdown] = useState(0);

  const isLocked = lockedUntil !== null && Date.now() < lockedUntil;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (isLocked) {
      setError('Too many attempts. Please wait before trying again.');
      return;
    }

    setLoading(true);
    try {
      await login(email, password, rememberMe);
      navigate('/');
    } catch (err: unknown) {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);

      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS;
        setLockedUntil(until);
        setLockCountdown(30);
        setFailedAttempts(0);

        const interval = setInterval(() => {
          setLockCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(interval);
              setLockedUntil(null);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        setError(`Too many failed attempts. Please wait ${30} seconds.`);
      } else {
        setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo / Title */}
        <h1 style={styles.title}>AnimateKids</h1>

        {/* Mascot - a cute star with eyes */}
        <svg width="100" height="100" viewBox="0 0 100 100" style={{ margin: '0 auto 16px', display: 'block' }}>
          <polygon
            points="50,5 61,35 95,35 68,55 79,90 50,68 21,90 32,55 5,35 39,35"
            fill="#FFEAA7"
            stroke="#FF6B6B"
            strokeWidth="2"
          />
          {/* Left eye */}
          <circle cx="40" cy="42" r="5" fill="#333" />
          <circle cx="42" cy="40" r="2" fill="#fff" />
          {/* Right eye */}
          <circle cx="60" cy="42" r="5" fill="#333" />
          <circle cx="62" cy="40" r="2" fill="#fff" />
          {/* Smile */}
          <path d="M42 55 Q50 65 58 55" fill="none" stroke="#FF6B6B" strokeWidth="2.5" strokeLinecap="round" />
        </svg>

        <p style={styles.subtitle}>Welcome back, animator!</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Email / Username</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              style={styles.input}
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Password</label>
            <div style={styles.passwordWrapper}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Super secret password"
                required
                style={{ ...styles.input, paddingRight: 48 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={styles.checkbox}
            />
            Remember Me
          </label>

          <button
            type="submit"
            disabled={loading || isLocked}
            style={{
              ...styles.button,
              opacity: loading || isLocked ? 0.6 : 1,
              cursor: loading || isLocked ? 'not-allowed' : 'pointer',
            }}
          >
            {isLocked
              ? `Wait ${lockCountdown}s`
              : loading
                ? 'Logging in...'
                : 'Let\'s Go!'}
          </button>
        </form>

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
    background: 'linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 50%, #45B7D1 100%)',
    fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
    padding: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 24,
    padding: '40px 36px',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
  },
  title: {
    textAlign: 'center',
    fontSize: '2.4rem',
    margin: 0,
    color: '#FF6B6B',
    letterSpacing: 1,
  },
  subtitle: {
    textAlign: 'center',
    color: '#666',
    fontSize: '1.1rem',
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
    color: '#45B7D1',
  },
  input: {
    padding: '12px 14px',
    borderRadius: 14,
    border: '2px solid #ddd',
    fontSize: '1rem',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.2s',
    width: '100%',
    boxSizing: 'border-box',
  },
  passwordWrapper: {
    position: 'relative',
  },
  eyeButton: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    fontSize: '1.2rem',
    cursor: 'pointer',
    padding: 4,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: '0.95rem',
    color: '#555',
    cursor: 'pointer',
  },
  checkbox: {
    width: 18,
    height: 18,
    accentColor: '#4ECDC4',
    cursor: 'pointer',
  },
  button: {
    padding: '14px 0',
    borderRadius: 16,
    border: 'none',
    background: 'linear-gradient(135deg, #FF6B6B, #DDA0DD)',
    color: '#fff',
    fontSize: '1.3rem',
    fontWeight: 'bold',
    fontFamily: 'inherit',
    cursor: 'pointer',
    marginTop: 4,
    letterSpacing: 0.5,
    boxShadow: '0 4px 14px rgba(255,107,107,0.4)',
    transition: 'transform 0.1s',
  },
};
