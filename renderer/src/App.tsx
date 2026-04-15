import React, { useState, useRef } from 'react';

function App() {
  const [src, setSrc] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleSelectFile = async () => {
    const filePath = await (window as any).electronAPI?.selectFile?.();
    if (filePath) setSrc(`file://${filePath}`);
  };

  return (
    <div style={{ padding: '2rem', backgroundColor: '#121212', color: 'white', textAlign: 'center' }}>
      <h1>🎵 Local Music Player</h1>
      <button onClick={handleSelectFile} style={buttonStyle}>Select Music File</button>
      {src && (
        <div style={{ marginTop: '2rem' }}>
          <audio ref={audioRef} src={src} controls style={{ width: '100%' }} />
        </div>
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: '16px',
  borderRadius: '8px',
  backgroundColor: '#1db954',
  color: 'white',
  border: 'none',
  cursor: 'pointer',
};

export default App;
