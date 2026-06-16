import React, { useState, useEffect, useRef } from 'react';

function InventoryAgent() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function sendQuery(text) {
    if (!text) return;
    const userMsg = { role: 'user', text };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);

    try {
      const resp = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
      });
      const data = await resp.json();

      const aiText = data.results && data.results.length
        ? `Found ${data.results.length} matching records.`
        : 'No matching records found.';

      const assistantMsg = { role: 'assistant', text: aiText, results: data.results || [] };
      setMessages((m) => [...m, assistantMsg]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: 'Error querying the database.' }]);
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

  return (
    <section className="panel ai-panel">
      <h3>Ask the Inventory (AI)</h3>

      <div className="ai-chat">
        <div className="messages" ref={messagesRef}>
          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>
              <div className="message-text">{m.text}</div>
              {m.results && m.results.length > 0 && (
                <div className="ai-results">
                  {m.results.slice(0, 10).map((r) => (
                    <div key={r.id} className="ai-row">
                      <strong>{r.vendor}</strong> — {r.location} — {r.size} — Qty: {r.quantity}
                    </div>
                  ))}
                </div>
              )}
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
        </form>
      </div>
    </section>
  );
}

export default InventoryAgent;
