import React from 'react';

const technologyBadges = ['React', 'Node.js', 'Express', 'PostgreSQL', 'JavaScript', 'HTML', 'CSS'];

function HomePage({ navigateTo }) {
  return (
    <>
      <section id="about" className="panel about-panel">
        <div className="section-intro">
          <p className="section-label">About Me</p>
        </div>
        <h2>Tech Stack</h2>
        <div className="about-grid">
          <article className="about-card">
            <h3>Front End</h3>
            <ul>
              <li>React-driven interfaces and component systems</li>
              <li>Responsive, accessible layouts</li>
              <li>Clear user journeys and polished interactions</li>
            </ul>
          </article>
          <article className="about-card">
            <h3>Back End</h3>
            <ul>
              <li>REST API design with Node.js and Express</li>
              <li>Data modeling and PostgreSQL integration</li>
              <li>Business logic, validation, and persistence</li>
            </ul>
          </article>
          <article className="about-card">
            <h3>Orchestration</h3>
            <ul>
              <li>Frontend-backend integration and deployment</li>
              <li>Automated workflows and reliable delivery</li>
              <li>Application health and operational cohesion</li>
            </ul>
          </article>
        </div>
        <div className="tech-grid">
          {technologyBadges.map((tech) => (
            <span key={tech} className="badge">
              {tech}
            </span>
          ))}
        </div>
      </section>

      <section id="projects" className="panel projects-panel">
        <div className="section-intro">
          <p className="section-label">Projects</p>
          <h2>Work I’ve shipped.</h2>
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
