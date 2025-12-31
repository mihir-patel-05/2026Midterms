import { useState, useEffect } from 'react';
import { adminAPI } from './lib/api';
import Dashboard from './pages/Dashboard';
import PasswordGate from './components/PasswordGate';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if already authenticated
    const adminKey = adminAPI.getAdminKey();
    if (adminKey) {
      // Verify the stored key is still valid
      adminAPI.getStats()
        .then(() => setIsAuthenticated(true))
        .catch(() => {
          adminAPI.clearAdminKey();
          setIsAuthenticated(false);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const handleLogin = async (username: string, password: string): Promise<boolean> => {
    const success = await adminAPI.verifyPassword(username, password);
    if (success) {
      setIsAuthenticated(true);
    }
    return success;
  };

  const handleLogout = () => {
    adminAPI.clearAdminKey();
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <PasswordGate onLogin={handleLogin} />;
  }

  return <Dashboard onLogout={handleLogout} />;
}

export default App;

