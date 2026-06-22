import InventoryAgent from './InventoryAgent';

function InventoryWelcome({ navigateTo }) {
  return (
    <section className="panel welcome-panel">
      <div className="welcome-content">
        <h2>Welcome to Tri State Containers Inventory Dashboard</h2>
        <p>Manage and track your container inventory with ease.</p>
      </div>

      <InventoryAgent />

      <div className="welcome-actions">
        <button
          type="button"
          className="button primary"
          onClick={() => navigateTo('/inventory/list')}
        >
          View Inventory List
        </button>
      </div>
    </section>
  );
}

export default InventoryWelcome;
