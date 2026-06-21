import React from 'react';

const stackCategories = [
  {
    title: 'Front End',
    bullets: [
      'React-driven interfaces and component systems',
      'Responsive, accessible layouts',
      'Clear user journeys and polished interactions',
    ],
    tools: [
      { name: 'React',      icon: 'https://cdn.simpleicons.org/react/61dafb' },
      { name: 'JavaScript', icon: 'https://cdn.simpleicons.org/javascript/f7df1e' },
      { name: 'HTML',       icon: 'https://cdn.simpleicons.org/html5/e34f26' },
      { name: 'CSS',        icon: 'https://cdn.simpleicons.org/css/663399' },
    ],
  },
  {
    title: 'Back End',
    bullets: [
      'REST API design with Node.js and Express',
      'Data modeling and PostgreSQL integration',
      'Enterprise level satellite mission management software development',
      'AI Data Agent for large database insertion, summarization, and query handling',
    ],
    tools: [
      { name: 'Node.js',    icon: 'https://cdn.simpleicons.org/nodedotjs/339933' },
      { name: 'PostgreSQL', icon: 'https://cdn.simpleicons.org/postgresql/4169e1' },
      { name: 'java',    icon: 'https://cdn.simpleicons.org/openjdk/ffffff' },
      { name: 'Open AI',    icon: 'https://cdn.simpleicons.org/openaigym/0081A5' },
    ],
  },
  {
    title: 'Orchestration',
    bullets: [
      'Frontend-backend integration and deployment',
      'Automated workflows and reliable delivery',
      'Application health and operational cohesion',
    ],
    tools: [
      { name: 'Kubernetes',    icon: 'https://cdn.simpleicons.org/kubernetes/326CE5' },
      { name: 'GitHub', icon: 'https://cdn.simpleicons.org/github/ffffff' },
      { name: 'helm',    icon: 'https://cdn.simpleicons.org/helm/326CE5' },
      { name: 'Jenkins',    icon: 'https://cdn.simpleicons.org/jenkins/D24939' },
    ],
  },
];

function HomePage({ navigateTo }) {
  return (
    <>
      <section id="about" className="panel about-panel">
        <div className="section-intro">
          <p className="section-label">About Me</p>
        </div>
        <h2>Tech Stack</h2>
        <div className="about-grid">
          {stackCategories.map((cat) => (
            <article key={cat.title} className="about-card">
              <h3>{cat.title}</h3>
              <ul>
                {cat.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <div className="tool-bubbles">
                {cat.tools.map((tool) => (
                  <div key={tool.name} className="tool-bubble">
                    <div className="tool-bubble-icon">
                      <img src={tool.icon} alt={tool.name} width="22" height="22" />
                    </div>
                    <span className="tool-bubble-label">{tool.name}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="projects" className="panel projects-panel">
        <div className="section-intro">
          <p className="section-label">Projects</p>
          <h2>Work I've shipped.</h2>
        </div>
        <div className="cards-grid">
          <article className="card">
            <h3>Shipping Container Inventory</h3>
            <p>A full-stack dashboard for managing container inventory with search, add, edit, and delete workflows.</p>
            <div className="badge-row">
              <span className="badge small">React</span>
              <span className="badge small">Express</span>
              <span className="badge small">PostgreSQL</span>
            </div>
            <div className="project-links">
              <button className="button secondary small" type="button" onClick={() => navigateTo('/inventory')}>
                Visit
              </button>
            </div>
          </article>
          <article className="card">
            <h3>Modern Portfolio Website</h3>
            <p>A responsive portfolio homepage designed to showcase projects, skills, and contact details.</p>
            <div className="badge-row">
              <span className="badge small">React</span>
              <span className="badge small">Vite</span>
              <span className="badge small">CSS</span>
            </div>
          </article>
        </div>
      </section>
    </>
  );
}

export default HomePage;
