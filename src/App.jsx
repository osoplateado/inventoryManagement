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
        <div className="nav-row">
          <h1 className="brand">Robert Graman</h1>
          {page === 'home' ? (
            <>
              <nav className="site-nav">
                <a href="#about">About Me</a>
                <a href="#projects">Projects</a>
              </nav>
              <div className="nav-actions">
                <a className="button secondary icon-button" href="https://www.linkedin.com/in/robert-g-802399106/" target="_blank" rel="noreferrer" aria-label="LinkedIn">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                    <path d="M4.98 3.5C4.98 4.88 3.88 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM.2 8.5h4.6V24H.2V8.5zm7.2 0h4.4v2.1h.1c.6-1.1 2-2.3 4.2-2.3 4.5 0 5.3 3 5.3 6.9V24H17.2v-8.3c0-2 0-4.6-2.8-4.6-2.8 0-3.2 2.2-3.2 4.5V24H7.4V8.5z" />
                  </svg>
                </a>
                <a className="button secondary icon-button" href="https://github.com/osoplateado" target="_blank" rel="noreferrer" aria-label="GitHub">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.05-.01-2.07-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.35-1.76-1.35-1.76-1.1-.75.08-.74.08-.74 1.22.09 1.86 1.26 1.86 1.26 1.08 1.85 2.83 1.32 3.52 1.01.11-.79.42-1.32.76-1.62-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23.96-.27 1.98-.41 3-.41 1.02 0 2.04.14 3 .41 2.28-1.55 3.29-1.23 3.29-1.23.66 1.65.25 2.87.12 3.17.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.29 0 .32.22.7.82.58C20.56 21.8 24 17.3 24 12 24 5.37 18.63 0 12 0z" />
                  </svg>
                </a>
                <a className="button secondary mail-button" href="mailto:robertgraman1246@gmail.com" aria-label="Email robertgraman1246@gmail.com">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                    <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 2v.01L12 13 4 6.01V6h16ZM4 18V8.99l8 5 8-5V18H4Z" />
                  </svg>
                  <span>robertgraman1246@gmail.com</span>
                </a>
              </div>
            </>
          ) : null}
        </div>

        {page === 'home' && (
          <div className="hero-content">
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
            </div>
          </div>
        )}
      </header>

      <main className="container">
        {page === 'home' ? (
          <>
            <section id="about" className="panel about-panel">
              <div className="section-intro">
                <p className="section-label">About Me</p>
                
              </div>
              <h2>Tech Stack</h2>
              <div className="about-grid">
                <article className="about-card">
                  <h3>Front End</h3>
                  <ul>
                    <li>React-driven interfaces and component systems</li>
                    <li>Responsive, accessible layouts</li>
                    <li>Clear user journeys and polished interactions</li>
                  </ul>
                </article>
                <article className="about-card">
                  <h3>Back End</h3>
                  <ul>
                    <li>REST API design with Node.js and Express</li>
                    <li>Data modeling and PostgreSQL integration</li>
                    <li>Business logic, validation, and persistence</li>
                  </ul>
                </article>
                <article className="about-card">
                  <h3>Orchestration</h3>
                  <ul>
                    <li>Frontend-backend integration and deployment</li>
                    <li>Automated workflows and reliable delivery</li>
                    <li>Application health and operational cohesion</li>
                  </ul>
                </article>
              </div>
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
                </article>
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
