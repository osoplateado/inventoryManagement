const inventoryBody = document.getElementById('inventoryBody');
const searchInput = document.getElementById('searchInput');
const clearSearchButton = document.getElementById('clearSearchButton');
const addRecordButton = document.getElementById('addRecordButton');
const modal = document.getElementById('modal');
const closeModalButton = document.getElementById('closeModalButton');
const cancelButton = document.getElementById('cancelButton');
const modalTitle = document.getElementById('modalTitle');
const recordForm = document.getElementById('recordForm');

let currentRecords = [];
let editRecordId = null;

function formatDate(dateValue) {
  return new Date(dateValue).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderInventory(records) {
  if (!records.length) {
    inventoryBody.innerHTML = '<tr><td colspan="12" class="empty-state">No matching container records found.</td></tr>';
    return;
  }

  inventoryBody.innerHTML = records.map((record) => `
      <tr>
        <td>${record.vendor}</td>
        <td>${record.location}</td>
        <td>${record.size}</td>
        <td>${record.type}</td>
        <td>${record.container_condition}</td>
        <td>${record.color}</td>
        <td>${record.quantity}</td>
        <td>${record.price}</td>
        <td>${record.delivery}</td>
        <td>${formatDate(record.date)}</td>
        <td>${record.notes || ''}</td>
        <td>
          <button class="button secondary small" data-action="edit" data-id="${record.id}">Edit</button>
          <button class="button secondary small" data-action="delete" data-id="${record.id}">Delete</button>
        </td>
      </tr>
    `).join('');
}

function getFormData() {
  const formData = new FormData(recordForm);
  return {
    vendor: formData.get('vendor').trim(),
    location: formData.get('location').trim(),
    size: formData.get('size').trim(),
    type: formData.get('type').trim(),
    container_condition: formData.get('container_condition').trim(),
    color: formData.get('color').trim(),
    quantity: Number(formData.get('quantity')),
    price: formData.get('price').trim(),
    delivery: formData.get('delivery').trim(),
    date: formData.get('date'),
    notes: formData.get('notes').trim(),
  };
}

function openModal(mode, record = null) {
  modal.classList.remove('hidden');
  modalTitle.textContent = mode === 'edit' ? 'Edit Container' : 'Add Container';
  editRecordId = record ? record.id : null;

  recordForm.vendor.value = record?.vendor || '';
  recordForm.location.value = record?.location || '';
  recordForm.size.value = record?.size || '';
  recordForm.type.value = record?.type || '';
  recordForm.container_condition.value = record?.container_condition || '';
  recordForm.color.value = record?.color || '';
  recordForm.quantity.value = record?.quantity || 1;
  recordForm.price.value = record?.price || '';
  recordForm.delivery.value = record?.delivery || '';
  recordForm.date.value = record?.date || '';
  recordForm.notes.value = record?.notes || '';
}

function closeModal() {
  modal.classList.add('hidden');
  editRecordId = null;
  recordForm.reset();
}

function filterRecords(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return currentRecords;

  return currentRecords.filter((record) => {
    const haystack = [
      record.vendor,
      record.location,
      record.size,
      record.type,
      record.container_condition,
      record.color,
      record.delivery,
      record.notes,
    ].join(' ').toLowerCase();
    return haystack.includes(normalized);
  });
}

function refresh() {
  renderInventory(filterRecords(searchInput.value));
}

async function loadRecords() {
  try {
    const response = await fetch('/api/containers');
    if (!response.ok) throw new Error('Failed to fetch inventory');
    currentRecords = await response.json();
    refresh();
  } catch (error) {
    console.error(error);
    inventoryBody.innerHTML = '<tr><td colspan="12" class="empty-state">Unable to load inventory from server.</td></tr>';
  }
}

async function createRecord(data) {
  const response = await fetch('/api/containers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Unable to create record');
  return response.json();
}

async function updateRecord(id, data) {
  const response = await fetch(`/api/containers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Unable to update record');
  return response.json();
}

async function deleteRecordById(id) {
  const response = await fetch(`/api/containers/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Unable to delete record');
}

addRecordButton.addEventListener('click', () => openModal('add'));
closeModalButton.addEventListener('click', closeModal);
cancelButton.addEventListener('click', closeModal);
window.addEventListener('click', (event) => {
  if (event.target === modal) closeModal();
});

recordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = getFormData();

  try {
    if (editRecordId) {
      const updatedRecord = await updateRecord(editRecordId, data);
      currentRecords = currentRecords.map((record) =>
        record.id === editRecordId ? updatedRecord : record
      );
    } else {
      const createdRecord = await createRecord(data);
      currentRecords.unshift(createdRecord);
    }
    refresh();
    closeModal();
  } catch (error) {
    console.error(error);
    alert('Unable to save record. Ensure the backend server is running.');
  }
});

inventoryBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;
  const record = currentRecords.find((item) => item.id === id);
  if (!record) return;

  if (action === 'edit') {
    openModal('edit', record);
    return;
  }

  if (action === 'delete') {
    if (!confirm('Delete this record?')) return;

    try {
      await deleteRecordById(id);
      currentRecords = currentRecords.filter((item) => item.id !== id);
      refresh();
    } catch (error) {
      console.error(error);
      alert('Unable to delete record. Ensure the backend server is running.');
    }
  }
});

searchInput.addEventListener('input', refresh);
clearSearchButton.addEventListener('click', () => {
  searchInput.value = '';
  refresh();
});

loadRecords();
