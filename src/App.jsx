import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Footer from './components/Footer';
import Header from './components/Header';
import HomePage from './components/HomePage';
import InventoryDashboard from './components/InventoryDashboard';
import InventoryWelcome from './components/InventoryWelcome';
import RecordModal from './components/RecordModal';

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
  sender: '',
};

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const page = location.pathname.startsWith('/inventory') ? 'inventory' : 'home';
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
    if (page === 'inventory') {
      loadRecords();
    }
  }, [page]);

  useEffect(() => {
    if (location.pathname !== '/inventory/list') {
      setModalOpen(false);
      setEditingId(null);
      setFormState(initialFormState);
    }
  }, [location.pathname]);

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
        record.sender,
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
    navigate(path);
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
      <Header page={page} heroStyles={heroStyles} onHeroMove={handleHeroMove} onHeroLeave={handleHeroLeave} navigateTo={navigateTo} />

      <main className={`container${location.pathname === '/inventory/list' ? ' full-width' : ''}`}>
        <Routes>
          <Route path="/" element={<HomePage navigateTo={navigateTo} />} />
          <Route path="/inventory" element={<InventoryWelcome navigateTo={navigateTo} />} />
          <Route
            path="/inventory/list"
            element={
              <InventoryDashboard
                search={search}
                setSearch={setSearch}
                loading={loading}
                error={error}
                filteredRecords={filteredRecords}
                openAddModal={openAddModal}
                openEditModal={openEditModal}
                deleteRecord={deleteRecord}
                formatDate={formatDate}
              />
            }
          />
          <Route path="*" element={<HomePage navigateTo={navigateTo} />} />
        </Routes>
      </main>

      {modalOpen && location.pathname === '/inventory/list' && (
        <RecordModal
          editingId={editingId}
          formState={formState}
          onClose={closeModal}
          onChange={handleFieldChange}
          onSubmit={saveRecord}
        />
      )}

      <Footer />
    </div>
  );
}

export default App;
