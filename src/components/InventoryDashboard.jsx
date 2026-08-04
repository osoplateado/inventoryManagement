import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  return Number.isNaN(num) ? value : `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function normalize(value) {
  return value === null || value === undefined ? '' : String(value);
}

const COLUMNS = [
  { key: 'vendor', label: 'Depot' },
  { key: 'location', label: 'Location' },
  { key: 'size', label: 'Size' },
  { key: 'type', label: 'Type' },
  { key: 'container_condition', label: 'Condition' },
  { key: 'color', label: 'Color' },
  { key: 'quantity', label: 'Qty', numeric: true },
  { key: 'price', label: 'Price', numeric: true, display: (r) => formatPrice(r.price) },
  { key: 'delivery', label: 'Delivery' },
  { key: 'date', label: 'Date', display: (r, formatDate) => formatDate(r.date) },
  { key: 'notes', label: 'Notes' },
  { key: 'sender', label: 'Vendor' },
];

function ColumnFilterMenu({ column, options, selected, position, onApply, onClear, onClose, onSort, hasFilter }) {
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(selected);
  const menuRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) onClose();
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    function handleScroll(event) {
      // Ignore scrolling inside the menu itself (e.g. the checkbox list) —
      // only close when something outside the menu scrolls, which could
      // move the column header the menu is anchored to.
      if (menuRef.current && menuRef.current.contains(event.target)) return;
      onClose();
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const filteredOptions = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()));
  const allChecked = filteredOptions.length > 0 && filteredOptions.every((o) => draft.has(o));

  function toggleValue(value) {
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function toggleAll() {
    setDraft((current) => {
      const next = new Set(current);
      if (allChecked) filteredOptions.forEach((o) => next.delete(o));
      else filteredOptions.forEach((o) => next.add(o));
      return next;
    });
  }

  return (
    <div className="column-filter-menu" ref={menuRef} style={{ top: position.top, left: position.left }}>
      <button type="button" className="filter-menu-item" onClick={() => onSort('asc')}>
        Sort A to Z
      </button>
      <button type="button" className="filter-menu-item" onClick={() => onSort('desc')}>
        Sort Z to A
      </button>
      {hasFilter && (
        <button type="button" className="filter-menu-item" onClick={onClear}>
          Clear filter from "{column.label}"
        </button>
      )}
      <div className="filter-menu-divider" />
      <input
        type="text"
        className="filter-search"
        placeholder="Search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="filter-options">
        <label className="filter-option filter-option-all">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} />
          <span>(Select All)</span>
        </label>
        {filteredOptions.map((option) => (
          <label key={option || '(blank)'} className="filter-option">
            <input type="checkbox" checked={draft.has(option)} onChange={() => toggleValue(option)} />
            <span>{option === '' ? '(Blanks)' : option}</span>
          </label>
        ))}
        {filteredOptions.length === 0 && <p className="filter-empty">No matches</p>}
      </div>
      <div className="filter-menu-actions">
        <button type="button" className="button secondary small" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button primary small" onClick={() => onApply(draft)}>
          OK
        </button>
      </div>
    </div>
  );
}

function InventoryDashboard({
  search,
  setSearch,
  loading,
  error,
  filteredRecords,
  openAddModal,
  openEditModal,
  deleteRecord,
  formatDate,
}) {
  const navigate = useNavigate();
  const [openMenuKey, setOpenMenuKey] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [columnFilters, setColumnFilters] = useState({});
  const [sortConfig, setSortConfig] = useState(null);
  const toggleRefs = useRef({});

  function getOptionsForColumn(colKey) {
    let rows = filteredRecords;
    for (const col of COLUMNS) {
      if (col.key === colKey) continue;
      const selected = columnFilters[col.key];
      if (selected && selected.size > 0) {
        rows = rows.filter((r) => selected.has(normalize(r[col.key])));
      }
    }
    const values = new Set(rows.map((r) => normalize(r[colKey])));
    return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }

  const displayedRecords = useMemo(() => {
    let rows = filteredRecords;
    for (const col of COLUMNS) {
      const selected = columnFilters[col.key];
      if (selected && selected.size > 0) {
        rows = rows.filter((r) => selected.has(normalize(r[col.key])));
      }
    }
    if (sortConfig) {
      const col = COLUMNS.find((c) => c.key === sortConfig.key);
      rows = [...rows].sort((a, b) => {
        if (col.numeric) {
          const av = Number(a[col.key]) || 0;
          const bv = Number(b[col.key]) || 0;
          return sortConfig.direction === 'asc' ? av - bv : bv - av;
        }
        const av = normalize(a[col.key]).toLowerCase();
        const bv = normalize(b[col.key]).toLowerCase();
        const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [filteredRecords, columnFilters, sortConfig]);

  function openMenu(colKey) {
    const button = toggleRefs.current[colKey];
    if (button) {
      const rect = button.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - 260) });
    }
    setOpenMenuKey((current) => (current === colKey ? null : colKey));
  }

  function applyFilter(colKey, selectedSet) {
    const allOptions = getOptionsForColumn(colKey);
    setColumnFilters((current) => {
      const next = { ...current };
      if (selectedSet.size === allOptions.length) delete next[colKey];
      else next[colKey] = selectedSet;
      return next;
    });
    setOpenMenuKey(null);
  }

  function clearColumnFilter(colKey) {
    setColumnFilters((current) => {
      const next = { ...current };
      delete next[colKey];
      return next;
    });
    setOpenMenuKey(null);
  }

  function clearAllFilters() {
    setColumnFilters({});
    setSortConfig(null);
  }

  function handleSort(colKey, direction) {
    setSortConfig({ key: colKey, direction });
    setOpenMenuKey(null);
  }

  const hasActiveFilters = Object.keys(columnFilters).length > 0 || sortConfig !== null;

  return (
    <section className="panel search-panel">
      <div className="dashboard-header">
        <button type="button" className="button secondary" onClick={() => navigate('/inventory')}>
          ← Back
        </button>
        <button type="button" className="button primary" onClick={openAddModal}>
          Add Container
        </button>
      </div>
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
        {hasActiveFilters && (
          <button type="button" className="button secondary" onClick={clearAllFilters}>
            Clear Filters &amp; Sort
          </button>
        )}
      </div>

      <div className="table-wrapper">
        {loading ? (
          <p>Loading inventory...</p>
        ) : error ? (
          <p className="hint">{error}</p>
        ) : (
          <table className="inventory-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key}>
                    <div className="th-content">
                      <span>{col.label}</span>
                      <button
                        type="button"
                        ref={(el) => {
                          toggleRefs.current[col.key] = el;
                        }}
                        className={`filter-toggle${columnFilters[col.key] ? ' active' : ''}${sortConfig?.key === col.key ? ' active' : ''}`}
                        onClick={() => openMenu(col.key)}
                        aria-label={`Filter ${col.label}`}
                      >
                        ▾
                      </button>
                    </div>
                  </th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedRecords.length === 0 ? (
                <tr>
                  <td colSpan="13" className="empty-state">
                    No matching container records found.
                  </td>
                </tr>
              ) : (
                displayedRecords.map((record) => (
                  <tr key={record.id}>
                    {COLUMNS.map((col) => (
                      <td key={col.key}>{col.display ? col.display(record, formatDate) : record[col.key]}</td>
                    ))}
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

      {openMenuKey &&
        (() => {
          const col = COLUMNS.find((c) => c.key === openMenuKey);
          const options = getOptionsForColumn(openMenuKey);
          const selected = columnFilters[openMenuKey] || new Set(options);
          return (
            <ColumnFilterMenu
              key={openMenuKey}
              column={col}
              options={options}
              selected={selected}
              position={menuPosition}
              hasFilter={!!columnFilters[openMenuKey]}
              onApply={(set) => applyFilter(openMenuKey, set)}
              onClear={() => clearColumnFilter(openMenuKey)}
              onClose={() => setOpenMenuKey(null)}
              onSort={(direction) => handleSort(openMenuKey, direction)}
            />
          );
        })()}
    </section>
  );
}

export default InventoryDashboard;
