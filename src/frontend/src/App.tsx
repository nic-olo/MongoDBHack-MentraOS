import { useState, useEffect } from 'react';
import { useMentraAuth } from '@mentra/react';
import WorkSpace from './pages/WorkSpace';

export default function App() {
  const { userId, isLoading, error, isAuthenticated } = useMentraAuth();
  const [isDark, setIsDark] = useState(true);

  // Log authentication state to console
  useEffect(() => {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔐 [Mentra Auth] Authentication State Update');
    console.log('═══════════════════════════════════════════════════');
    console.log('👤 User ID:', userId || 'Not authenticated');
    console.log('🔄 Loading:', isLoading);
    console.log('✅ Authenticated:', isAuthenticated);
    console.log('❌ Error:', error || 'None');
    console.log('🕐 Timestamp:', new Date().toISOString());
    console.log('═══════════════════════════════════════════════════');

    if (isAuthenticated && userId) {
      console.log('✨ User successfully authenticated with ID:', userId);
    }
  }, [userId, isLoading, error, isAuthenticated]);

  // Load theme preference from backend when user authenticates
  useEffect(() => {
    if (isAuthenticated && userId) {
      console.log('🎨 [Theme] Loading theme preference for user:', userId);

      fetch(`/api/theme-preference?userId=${encodeURIComponent(userId)}`)
        .then(res => res.json())
        .then(data => {
          if (data.theme) {
            console.log('🎨 [Theme] Loaded theme preference:', data.theme);
            setIsDark(data.theme === 'dark');
          }
        })
        .catch(error => {
          console.error('🎨 [Theme] Failed to load theme preference:', error);
          // Keep default theme on error
        });
    }
  }, [isAuthenticated, userId]);



  // Handle loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          <p className="text-gray-400">Loading authentication...</p>
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center p-8">
          <h2 className="text-red-500 text-2xl font-semibold mb-4">Authentication Error</h2>
          <p className="text-red-400 font-medium mb-2">{error}</p>
          <p className="text-gray-400 text-sm">
            Please ensure you are opening this page from the MentraOS app.
          </p>
        </div>
      </div>
    );
  }

  // Handle unauthenticated state
  // if (!isAuthenticated || !userId) {
  //   return (
  //     <div className="min-h-screen flex items-center justify-center bg-slate-900">
  //       <div className="text-center p-8">
  //         <h2 className="text-red-500 text-2xl font-semibold mb-4">Not Authenticated</h2>
  //         <p className="text-gray-400">Please open this page from the MentraOS manager app.</p>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className={`min-h-screen bg-white ${isDark ? 'dark' : 'light'}`} >
      <WorkSpace userId={userId || 'anonymous'} />
    </div>
  );
}
