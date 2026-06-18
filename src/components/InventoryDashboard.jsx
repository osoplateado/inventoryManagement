import { useNavigate } from 'react-router-dom';

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
                <th>Sender</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="13" className="empty-state">
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
                    <td>{record.sender }</td>
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
  );
}

export default InventoryDashboard;
