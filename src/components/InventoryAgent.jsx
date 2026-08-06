import { useState, useEffect, useRef } from 'react';

const SESSION_ID_KEY = 'inventoryAgentSessionId';

// Chat history is persisted server-side (see /api/chat/:sessionId), keyed by
// a per-browser id kept in localStorage — so a page reload or a Render
// restart doesn't lose the conversation, only clearing the browser's storage
// (or hitting "New chat") does.
function getSessionId() {
  let id = localStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

function InventoryAgent() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [geocodeReady, setGeocodeReady] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const sessionIdRef = useRef(null);
  if (sessionIdRef.current === null) sessionIdRef.current = getSessionId();
  const messagesRef = useRef(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    async function loadHistory() {
      try {
        const resp = await fetch(`/api/chat/${sessionIdRef.current}`);
        const data = await resp.json();
        if (Array.isArray(data.messages)) setMessages(data.messages);
      } catch {
        // No prior history, or the fetch failed — just start with an empty chat.
      } finally {
        setHistoryLoaded(true);
      }
    }
    loadHistory();
  }, []);

  useEffect(() => {
    if (geocodeReady) return;
    const check = async () => {
      try {
        const resp = await fetch('/api/geocode-status');
        const data = await resp.json();
        if (data.ready) setGeocodeReady(true);
      } catch {}
    };
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, [geocodeReady]);

  async function sendQuery(text) {
    if (!text) return;
    const userMsg = { role: 'user', text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      const resp = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, history: messages, sessionId: sessionIdRef.current }),
      });
      const data = await resp.json();
      const aiText = data.answer || data.error || 'No response received.';
      setMessages((m) => [...m, { role: 'assistant', text: aiText }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: 'Error reaching the AI.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    sendQuery(text);
    setInput('');
  }

  function handleNewChat() {
    // Just start a new session locally — the old conversation is left alone
    // in the DB so it stays visible on the /inventory/chats history page
    // instead of being deleted.
    setMessages([]);
    sessionIdRef.current = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_KEY, sessionIdRef.current);
  }

  return (
    <section className="panel ai-panel">
      <div className="ai-panel-header">
        <h3>Ask the Inventory (AI)</h3>
        {messages.length > 0 && (
          <button type="button" className="button" onClick={handleNewChat} disabled={loading}>
            New chat
          </button>
        )}
      </div>

      <div className="ai-chat">
        <div className="messages" ref={messagesRef}>
          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>
              <div className="message-text">{m.text}</div>
            </div>
          ))}
          {loading && (
            <div className="message assistant typing">
              <div className="message-text">
                <div className="dots" aria-hidden>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
        </div>

        <form className="ai-form" onSubmit={handleSubmit}>
          <input
            placeholder="Ask something like: 'show 40\' containers in Memphis'"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="button primary" disabled={loading}>
            {loading ? 'Searching...' : 'Ask'}
          </button>
          {!geocodeReady && (
            <div className="geocode-status" title="Server is loading location data for distance queries. This takes ~30s on startup.">
              <span className="geocode-spinner" aria-label="Loading location data" />
            </div>
          )}
        </form>
      </div>
    </section>
  );
}

export default InventoryAgent;
