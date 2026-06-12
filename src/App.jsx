import { useEffect, useMemo, useState } from 'react';

const initialFormState = {
  vendor: '',
  location: '',
  size: '',
  type: '',
  container_condition: '',
  color: '',
  quantity: 1,
  price: '',
  delivery: '',
  date: '',
  notes: '',
};

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function App() {
  const [page, setPage] = useState(() => (window.location.pathname === '/inventory' ? 'inventory' : 'home'));
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [formState, setFormState] = useState(initialFormState);
  const [editingId, setEditingId] = useState(null);
  const [heroCursor, setHeroCursor] = useState({ x: 0, y: 0, active: false });

  const heroStyles = {
    '--mouse-x': `${heroCursor.x}px`,
    '--mouse-y': `${heroCursor.y}px`,
    '--mouse-active': heroCursor.active ? 1 : 0,
  };

  useEffect(() => {
    document.title = page === 'inventory' ? 'Inventory Dashboard' : 'Developer Portfolio';
  }, [page]);

  useEffect(() => {
    const handlePopState = () => {
      setPage(window.location.pathname === '/inventory' ? 'inventory' : 'home');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (page === 'inventory') {
      loadRecords();
    }
  }, [page]);

  const filteredRecords = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return records;

    return records.filter((record) => {
      const haystack = [
        record.vendor,
        record.location,
        record.size,
        record.type,
        record.container_condition,
        record.color,
        record.delivery,
        record.notes,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [records, search]);

  async function loadRecords() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/containers');
      if (!response.ok) throw new Error('Unable to fetch records');
      const data = await response.json();
      setRecords(data);
    } catch (err) {
      setError('Unable to load inventory. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  function handleHeroMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    setHeroCursor({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      active: true,
    });
  }

  function handleHeroLeave() {
    setHeroCursor((current) => ({ ...current, active: false }));
  }

  function navigateTo(path) {
    window.history.pushState(null, '', path);
    setPage(path === '/inventory' ? 'inventory' : 'home');
  }

  function openAddModal() {
    setEditingId(null);
    setFormState(initialFormState);
    setModalOpen(true);
  }

  function openEditModal(record) {
    setEditingId(record.id);
    setFormState({ ...record });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setFormState(initialFormState);
  }

  function handleFieldChange(event) {
    const { name, type, value } = event.target;
    setFormState((current) => ({
      ...current,
      [name]: type === 'number' ? Number(value) : value,
    }));
  }

  async function saveRecord(event) {
    event.preventDefault();
    setError('');

    const payload = {
      ...formState,
      quantity: Number(formState.quantity),
    };

    try {
      const response = await fetch(editingId ? `/api/containers/${editingId}` : '/api/containers', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Unable to save record');

      const savedRecord = await response.json();
      setRecords((current) => {
        if (editingId) {
          return current.map((record) => (record.id === editingId ? savedRecord : record));
        }
        return [savedRecord, ...current];
      });
      closeModal();
    } catch (err) {
      setError('Unable to save record. Ensure the backend server is available.');
    }
  }

  async function deleteRecord(recordId) {
    setError('');
    const confirmed = window.confirm('Delete this record?');
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/containers/${recordId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Unable to delete record');
      setRecords((current) => current.filter((record) => record.id !== recordId));
    } catch (err) {
      setError('Unable to delete record. Ensure the backend server is available.');
    }
  }

  return (
    <div>
      <header
        className={`site-header ${page === 'home' ? 'hero' : ''}`}
        style={page === 'home' ? heroStyles : undefined}
        onMouseMove={page === 'home' ? handleHeroMove : undefined}
        onMouseLeave={page === 'home' ? handleHeroLeave : undefined}
      >
        <div className="container nav-row">
          <h1 className="brand">Tri State Containers</h1>
          {page === 'home' ? (
            <nav className="site-nav">
              <a href="#about">About</a>
              <a href="#projects">Projects</a>
              <a href="#contact">Contact</a>
            </nav>
          ) : null}
          <button type="button" className="button primary" onClick={() => navigateTo(page === 'inventory' ? '/' : '/inventory')}>
            {page === 'inventory' ? 'Back to Portfolio' : 'View Inventory App'}
          </button>
        </div>

        {page === 'home' && (
          <div className="container hero-content">
            <p className="eyebrow">Full Stack Web Developer</p>
            <h2>Hi, I’m a developer building clean, practical web apps for small businesses.</h2>
            <p className="hero-text">
              I create modern user experiences with React and Node.js, and I ship tools that solve real operations
              problems for inventory, logistics, and business workflows.
            </p>
            <div className="hero-actions">
              <button type="button" className="button primary" onClick={() => navigateTo('/inventory')}>
                Open Inventory Dashboard
              </button>
              <a className="button secondary" href="#contact">
                Get in Touch
              </a>
            </div>
          </div>
        )}
      </header>

      <main className="container">
        {page === 'home' ? (
          <>
            <section id="about" className="panel about-panel">
              <div className="section-intro">
                <p className="section-label">About</p>
                <h2>Developer with an eye for efficient tooling.</h2>
              </div>
              <p>
                Fully committed to life-long learning and practical development. I build intuitive interfaces, scalable
                APIs, and responsive applications that help teams manage inventory, projects, and business processes.
              </p>
              <div className="tech-grid">
                {['React', 'Node.js', 'Express', 'PostgreSQL', 'JavaScript', 'HTML', 'CSS'].map((tech) => (
                  <span key={tech} className="badge">
                    {tech}
                  </span>
                ))}
              </div>
            </section>

            <section id="projects" className="panel projects-panel">
              <div className="section-intro">
                <p className="section-label">Projects</p>
                <h2>Work I’ve shipped.</h2>
              </div>
              <div className="cards-grid">
                <article className="card">
                  <h3>Shipping Container Inventory</h3>
                  <p>A full-stack dashboard for managing container inventory with search, add, edit, and delete workflows.</p>
                  <div className="badge-row">
                    <span className="badge small">React</span>
                    <span className="badge small">Express</span>
                    <span className="badge small">PostgreSQL</span>
                  </div>
                  <div className="project-links">
                    <button className="button secondary small" type="button" onClick={() => navigateTo('/inventory')}>
                      Visit
                    </button>
                  </div>
                </article>
                <article className="card">
                  <h3>Modern Portfolio Website</h3>
                  <p>A responsive portfolio homepage designed to showcase projects, skills, and contact details.</p>
                  <div className="badge-row">
                    <span className="badge small">React</span>
                    <span className="badge small">Vite</span>
                    <span className="badge small">CSS</span>
                  </div>
                  <div className="project-links">
                    <a className="button secondary small" href="#contact">
                      Learn More
                    </a>
                  </div>
                </article>
              </div>
            </section>

            <section id="contact" className="panel contact-panel">
              <div className="section-intro">
                <p className="section-label">Contact</p>
                <h2>Let’s build something together.</h2>
              </div>
              <p>
                Have a question or want to work together? Reach out via email and I’ll get back to you as soon as possible.
              </p>
              <div className="contact-details">
                <a href="mailto:you@example.com">you@example.com</a>
                <a href="https://github.com/" target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </div>
            </section>
          </>
        ) : (
          <section className="panel search-panel">
            <div className="search-row">
              <input
                type="search"
                placeholder="Search by vendor, location, size, type, condition, color, notes"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button type="button" className="button secondary" onClick={() => setSearch('')}>
                Clear
              </button>
            </div>

            <div className="button-row" style={{ marginTop: '1rem' }}>
              <button type="button" className="button primary" onClick={openAddModal}>
                Add Container
              </button>
            </div>

            <div className="table-wrapper" style={{ marginTop: '1.5rem' }}>
              {loading ? (
                <p>Loading inventory...</p>
              ) : error ? (
                <p className="hint">{error}</p>
              ) : (
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th>Location</th>
                      <th>Size</th>
                      <th>Type</th>
                      <th>Condition</th>
                      <th>Color</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Delivery</th>
                      <th>Date</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan="12" className="empty-state">
                          No matching container records found.
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((record) => (
                        <tr key={record.id}>
                          <td>{record.vendor}</td>
                          <td>{record.location}</td>
                          <td>{record.size}</td>
                          <td>{record.type}</td>
                          <td>{record.container_condition}</td>
                          <td>{record.color}</td>
                          <td>{record.quantity}</td>
                          <td>{record.price}</td>
                          <td>{record.delivery}</td>
                          <td>{formatDate(record.date)}</td>
                          <td>{record.notes || ''}</td>
                          <td>
                            <button type="button" className="button secondary small" onClick={() => openEditModal(record)}>
                              Edit
                            </button>
                            <button type="button" className="button secondary small" onClick={() => deleteRecord(record.id)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <p className="hint">Records are stored on the backend. Add, search, and edit container listings with persistent server data.</p>
          </section>
        )}
      </main>

      {modalOpen && (
        <div className="modal" onClick={closeModal}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Edit Container' : 'Add Container'}</h2>
              <button type="button" className="close-button" aria-label="Close modal" onClick={closeModal}>
                ×
              </button>
            </div>
            <form className="record-form" onSubmit={saveRecord}>
              <div className="form-grid">
                <label>
                  <span>Vendor</span>
                  <input name="vendor" value={formState.vendor} onChange={handleFieldChange} required />
                </label>
                <label>
                  <span>Location</span>
                  <input name="location" value={formState.location} onChange={handleFieldChange} required />
                </label>
                <label>
                  <span>Size</span>
                  <input name="size" value={formState.size} onChange={handleFieldChange} required placeholder="20' / 40'" />
                </label>
                <label>
                  <span>Type</span>
                  <input name="type" value={formState.type} onChange={handleFieldChange} required placeholder="Standard / HC / Side Door" />
                </label>
                <label>
                  <span>Condition</span>
                  <input name="container_condition" value={formState.container_condition} onChange={handleFieldChange} required placeholder="CW / WWT / 1-Trip" />
                </label>
                <label>
                  <span>Color</span>
                  <input name="color" value={formState.color} onChange={handleFieldChange} required placeholder="Beige / Gray / White" />
                </label>
                <label>
                  <span>Quantity</span>
                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    value={formState.quantity}
                    onChange={handleFieldChange}
                    required
                  />
                </label>
                <label>
                  <span>Price</span>
                  <input name="price" value={formState.price} onChange={handleFieldChange} required placeholder="$2,450" />
                </label>
                <label>
                  <span>Delivery terms</span>
                  <input name="delivery" value={formState.delivery} onChange={handleFieldChange} required placeholder="FOB / Delivered / Pickup" />
                </label>
                <label>
                  <span>Date received</span>
                  <input name="date" type="date" value={formState.date} onChange={handleFieldChange} required />
                </label>
                <label className="full-width">
                  <span>Notes</span>
                  <textarea name="notes" rows="3" value={formState.notes} onChange={handleFieldChange} placeholder="Optional notes" />
                </label>
              </div>
              <div className="form-actions">
                <button type="button" className="button secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="button primary">
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="site-footer">
        <div className="container">
          <p>Portfolio and inventory dashboard with React, Node, and PostgreSQL.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
