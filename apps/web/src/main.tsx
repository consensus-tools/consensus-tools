import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { Header } from './components/layout/Header';
import WorkflowsDashboard from './pages/WorkflowsDashboard';
import BoardsPage from './pages/BoardsPage';
import BoardDetailPage from './pages/BoardDetailPage';
import RunDetailPage from './pages/RunDetailPage';
import SettingsPage from './pages/SettingsPage';

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="dark min-h-screen bg-background text-foreground">
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<WorkflowsDashboard />} />
            <Route path="/boards" element={<BoardsPage />} />
            <Route path="/boards/:boardId" element={<BoardDetailPage />} />
            <Route path="/boards/run/:runId" element={<RunDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/workflows" element={<Navigate to="/" replace />} />
            <Route path="/local-board" element={<BoardsPage />} />
            <Route path="/local-board/:boardId" element={<BoardDetailPage />} />
            <Route path="/local-board/run/:runId" element={<RunDetailPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
