import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="bottom-center"
      toastOptions={{
        className: 'text-sm',
        duration: 4000,
        style: {
          background: '#0f172a',
          color: '#fff',
          borderRadius: '0.75rem',
        },
      }}
    />
  </React.StrictMode>,
)
