import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function formatTimestamp(value) {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ChatHistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/chat');
      if (!resp.ok) throw new Error('Unable to fetch chat history');
      const data = await resp.json();
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch (err) {
      setError('Unable to load chat history. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel search-panel">
      <div className="dashboard-header">
        <button type="button" className="button secondary" onClick={() => navigate('/inventory')}>
          ← Back
        </button>
        <h2 className="chat-history-title">AI Chat History</h2>
      </div>

      {loading && <p>Loading chat history…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && sessions.length === 0 && <p>No chat history yet.</p>}

      <div className="chat-history-list">
        {sessions.map((session) => (
          <div key={session.sessionId} className="panel ai-panel chat-history-session">
            <div className="ai-panel-header">
              <h3>{formatTimestamp(session.startedAt)}</h3>
              <span className="chat-history-session-id" title={session.sessionId}>
                {session.sessionId.slice(0, 8)}
              </span>
            </div>
            <div className="ai-chat">
              <div className="messages chat-history-messages">
                {session.messages.map((m, i) => (
                  <div key={i} className={`message ${m.role}`}>
                    <div className="message-text">{m.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default ChatHistoryPage;
