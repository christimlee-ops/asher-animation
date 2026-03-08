import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { listProjects, deleteProject } from '../lib/projectManager';
import type { ProjectListItem } from '../lib/projectManager';

// ─── Palette ──────────────────────────────────────────────────────
const CARD_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF8C42'];

function cardColor(index: number) {
  return CARD_COLORS[index % CARD_COLORS.length];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const username =
    user?.user_metadata?.username ?? user?.email?.split('@')[0] ?? 'Artist';

  // Fetch projects on mount
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetch() {
      try {
        const items = await listProjects(user!.id);
        if (!cancelled) setProjects(items);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ─── Handlers ───────────────────────────────────────────────────

  function handleNewProject() {
    navigate('/editor');
  }

  function handleOpenProject(id: string) {
    navigate(`/editor/${id}`);
  }

  async function handleDeleteProject(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!window.confirm('Delete this project? This cannot be undone!')) return;
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert('Failed to delete project. Please try again.');
      console.error(err);
    }
  }

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch {
      /* swallow */
    }
  }

  // ─── Derived data ───────────────────────────────────────────────

  const recentProjects = projects.slice(0, 5);

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.greeting}>Hi {username}! Ready to animate? 🎨</h1>
        <button onClick={handleLogout} style={styles.logoutBtn}>
          Log Out
        </button>
      </header>

      {/* New Project button */}
      <button onClick={handleNewProject} style={styles.newProjectBtn}>
        + New Project
      </button>

      {/* Loading / Error states */}
      {loading && <p style={styles.statusText}>Loading your projects...</p>}
      {error && <p style={{ ...styles.statusText, color: '#FF6B6B' }}>Error: {error}</p>}

      {/* Empty state */}
      {!loading && !error && projects.length === 0 && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>No projects yet! Click + New Project to start creating!</p>
        </div>
      )}

      {/* Recent Projects */}
      {!loading && recentProjects.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Recent Projects</h2>
          <div style={styles.grid}>
            {recentProjects.map((project, i) => (
              <div
                key={project.id}
                style={{ ...styles.card, borderColor: cardColor(i) }}
                onClick={() => handleOpenProject(project.id)}
              >
                {/* Thumbnail placeholder */}
                <div style={{ ...styles.thumbnail, background: cardColor(i) }}>
                  <span style={styles.thumbIcon}>🎬</span>
                </div>
                <div style={styles.cardBody}>
                  <h3 style={styles.cardTitle}>{project.name}</h3>
                  <p style={styles.cardDate}>{formatDate(project.updated_at)}</p>
                </div>
                <button
                  onClick={(e) => handleDeleteProject(e, project.id)}
                  style={styles.deleteBtn}
                  title="Delete project"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All Projects */}
      {!loading && projects.length > 5 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>All Projects</h2>
          <div style={styles.grid}>
            {projects.map((project, i) => (
              <div
                key={project.id}
                style={{ ...styles.card, borderColor: cardColor(i) }}
                onClick={() => handleOpenProject(project.id)}
              >
                <div style={{ ...styles.thumbnail, background: cardColor(i) }}>
                  <span style={styles.thumbIcon}>🎬</span>
                </div>
                <div style={styles.cardBody}>
                  <h3 style={styles.cardTitle}>{project.name}</h3>
                  <p style={styles.cardDate}>{formatDate(project.updated_at)}</p>
                </div>
                <button
                  onClick={(e) => handleDeleteProject(e, project.id)}
                  style={styles.deleteBtn}
                  title="Delete project"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #FFEAA7 0%, #96CEB4 50%, #45B7D1 100%)',
    fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
    padding: '2rem',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  greeting: {
    fontSize: '2rem',
    color: '#2D3436',
    margin: 0,
    textShadow: '2px 2px 0 rgba(255,255,255,0.5)',
  },
  logoutBtn: {
    padding: '0.5rem 1.2rem',
    borderRadius: '2rem',
    border: '2px solid #FF6B6B',
    background: '#fff',
    color: '#FF6B6B',
    fontFamily: 'inherit',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: 700,
  },
  newProjectBtn: {
    display: 'block',
    width: '100%',
    maxWidth: '400px',
    margin: '0 auto 2rem',
    padding: '1rem 2rem',
    borderRadius: '1.5rem',
    border: '3px dashed #fff',
    background: 'linear-gradient(135deg, #FF6B6B, #FF8C42)',
    color: '#fff',
    fontFamily: 'inherit',
    fontSize: '1.5rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(255,107,107,0.4)',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  statusText: {
    textAlign: 'center' as const,
    fontSize: '1.2rem',
    color: '#2D3436',
  },
  emptyState: {
    textAlign: 'center' as const,
    marginTop: '3rem',
    padding: '3rem 2rem',
    background: 'rgba(255,255,255,0.6)',
    borderRadius: '1.5rem',
    maxWidth: '500px',
    margin: '3rem auto 0',
  },
  emptyText: {
    fontSize: '1.3rem',
    color: '#2D3436',
    margin: 0,
  },
  section: {
    marginBottom: '2rem',
  },
  sectionTitle: {
    fontSize: '1.5rem',
    color: '#2D3436',
    marginBottom: '1rem',
    textShadow: '1px 1px 0 rgba(255,255,255,0.5)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '1.5rem',
  },
  card: {
    position: 'relative' as const,
    background: '#fff',
    borderRadius: '1rem',
    border: '3px solid',
    overflow: 'hidden',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  thumbnail: {
    height: '120px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbIcon: {
    fontSize: '2.5rem',
  },
  cardBody: {
    padding: '0.75rem 1rem',
  },
  cardTitle: {
    margin: '0 0 0.25rem',
    fontSize: '1.1rem',
    color: '#2D3436',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardDate: {
    margin: 0,
    fontSize: '0.85rem',
    color: '#636e72',
  },
  deleteBtn: {
    position: 'absolute' as const,
    top: '0.5rem',
    right: '0.5rem',
    background: 'rgba(255,255,255,0.85)',
    border: 'none',
    borderRadius: '50%',
    width: '2rem',
    height: '2rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
  },
};
