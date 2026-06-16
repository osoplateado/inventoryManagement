import React from 'react';

function Header({ page, heroStyles, onHeroMove, onHeroLeave, navigateTo }) {
  return (
    <header
      className={`site-header ${page === 'home' ? 'hero' : ''}`}
      style={page === 'home' ? heroStyles : undefined}
      onMouseMove={page === 'home' ? onHeroMove : undefined}
      onMouseLeave={page === 'home' ? onHeroLeave : undefined}
    >
      <div className="nav-row">
        
        {page === 'home' ? (
          <>
          <h1 className="brand">Robert Graman</h1>
            <nav className="site-nav">
              <a href="#about">About Me</a>
              <a href="#projects">Projects</a>
            </nav>
            <div className="nav-actions">
              <a
                className="button secondary icon-button"
                href="https://www.linkedin.com/in/robert-g-802399106/"
                target="_blank"
                rel="noreferrer"
                aria-label="LinkedIn"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M4.98 3.5C4.98 4.88 3.88 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM.2 8.5h4.6V24H.2V8.5zm7.2 0h4.4v2.1h.1c.6-1.1 2-2.3 4.2-2.3 4.5 0 5.3 3 5.3 6.9V24H17.2v-8.3c0-2 0-4.6-2.8-4.6-2.8 0-3.2 2.2-3.2 4.5V24H7.4V8.5z" />
                </svg>
              </a>
              <a
                className="button secondary icon-button"
                href="https://github.com/osoplateado"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.05-.01-2.07-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.35-1.76-1.35-1.76-1.1-.75.08-.74.08-.74 1.22.09 1.86 1.26 1.86 1.26 1.08 1.85 2.83 1.32 3.52 1.01.11-.79.42-1.32.76-1.62-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23.96-.27 1.98-.41 3-.41 1.02 0 2.04.14 3 .41 2.28-1.55 3.29-1.23 3.29-1.23.66 1.65.25 2.87.12 3.17.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.29 0 .32.22.7.82.58C20.56 21.8 24 17.3 24 12 24 5.37 18.63 0 12 0z" />
                </svg>
              </a>
              <a
                className="button secondary mail-button"
                href="mailto:robertgraman1246@gmail.com"
                aria-label="Email robertgraman1246@gmail.com"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 2v.01L12 13 4 6.01V6h16ZM4 18V8.99l8 5 8-5V18H4Z" />
                </svg>
                <span>robertgraman1246@gmail.com</span>
              </a>
            </div>
          </>
        ) : null}

        {page === 'inventory' && (
        <h1 className="brand">Tri State Containers Inventory Dashboard</h1>
      )}
      </div>

      {page === 'home' && (
        <div className="hero-content">
          <p className="eyebrow">Full Stack Web Developer</p>
          <h2>Hi, I’m a developer building clean, practical web apps for small businesses.</h2>
          <p className="hero-text">
            I create modern user experiences with React and Node.js, and I ship tools that solve real operations
            problems for inventory, logistics, and business workflows.
          </p>
          <div className="hero-actions">
            
          </div>
        </div>
      )}
          </header>
  );
}

export default Header;
