import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './i18n';
import { UpdateProvider } from './context/UpdateContext';
import { AuthProvider } from './context/AuthContext';
import { ModalDockProvider } from './context/ModalDockContext';
import { ErrorBoundary } from './components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <UpdateProvider>
          <ModalDockProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </ModalDockProvider>
        </UpdateProvider>
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
);
