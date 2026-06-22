import React, { useState, useEffect, useRef } from 'react';

function InventoryAgent() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [geocodeReady, setGeocodeReady] = useState(false);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, loading]);

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
        body: JSON.stringify({ query: text, history: messages }),
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

  return (
    <section className="panel ai-panel">
      <h3>Ask the Inventory (AI)</h3>

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
