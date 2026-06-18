import React from 'react';

function RecordModal({ editingId, formState, onClose, onChange, onSubmit }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>{editingId ? 'Edit Container' : 'Add Container'}</h2>
          <button type="button" className="close-button" aria-label="Close modal" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="record-form" onSubmit={onSubmit}>
          <div className="form-grid">
            <label>
              <span>Vendor</span>
              <input name="vendor" value={formState.vendor} onChange={onChange} required />
            </label>
            <label>
              <span>Location</span>
              <input name="location" value={formState.location} onChange={onChange} required />
            </label>
            <label>
              <span>Size</span>
              <input name="size" value={formState.size} onChange={onChange} required placeholder="20' / 40'" />
            </label>
            <label>
              <span>Type</span>
              <input name="type" value={formState.type} onChange={onChange} required placeholder="Standard / HC / Side Door" />
            </label>
            <label>
              <span>Condition</span>
              <input name="container_condition" value={formState.container_condition} onChange={onChange} required placeholder="CW / WWT / 1-Trip" />
            </label>
            <label>
              <span>Color</span>
              <input name="color" value={formState.color} onChange={onChange} required placeholder="Beige / Gray / White" />
            </label>
            <label>
              <span>Quantity</span>
              <input name="quantity" type="number" min="1" value={formState.quantity} onChange={onChange} required />
            </label>
            <label>
              <span>Price</span>
              <input name="price" value={formState.price} onChange={onChange} required placeholder="$2,450" />
            </label>
            <label>
              <span>Delivery terms</span>
              <input name="delivery" value={formState.delivery} onChange={onChange} required placeholder="FOB / Delivered / Pickup" />
            </label>
            <label>
              <span>Date received</span>
              <input name="date" type="date" value={formState.date} onChange={onChange} required />
            </label>
            <label>
              <span>Sender</span>
              <input name="sender" value={formState.sender} onChange={onChange} placeholder="Origin / Source" />
            </label>
            <label className="full-width">
              <span>Notes</span>
              <textarea name="notes" rows="3" value={formState.notes} onChange={onChange} placeholder="Optional notes" />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button primary">
              Save Record
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RecordModal;
