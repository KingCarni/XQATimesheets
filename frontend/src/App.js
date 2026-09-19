import React from 'react';
import { LandingPage } from './marketing/landing-page';
import { Brand } from './marketing/marketing-header';
import './App.css';

function App() {
  // This host previews marketing only; original Next.js routes remain intact.
  if (window.location.pathname === '/signup' || window.location.pathname === '/login') {
    return <div className="ho-site ho-preview-route"><Brand /><main><p className="ho-preview-label" data-testid="preview-scope-label">Marketing design preview</p><h1 data-testid="preview-route-title">Your workspace is unchanged.</h1><p data-testid="preview-route-description">Company creation and sign-in remain in your existing HourOps application. This isolated preview contains only the redesigned public marketing page.</p><a href="/" className="ho-button" data-testid="preview-back-home">Back to HourOps</a></main></div>;
  }
  return <LandingPage />;
}

export default App;