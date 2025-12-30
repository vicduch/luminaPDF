import React from 'react';
import { ViewportPOC } from './components/ViewportPOC';

function App() {
  // On construit une URL absolue pour éviter toute ambiguïté dans le worker
  const testPdfUrl = window.location.origin + '/sample.pdf';

  return (
    <div className="w-full h-screen bg-black overflow-hidden">
      <ViewportPOC pdfUrl={testPdfUrl} />
    </div>
  );
}

export default App;