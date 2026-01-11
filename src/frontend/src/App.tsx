import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useMentraAuth } from '@mentra/react';
import WorkSpace from './pages/WorkSpace';

export default function App() {
  const { userId, isLoading, error, isAuthenticated } = useMentraAuth();
  const [isDark] = useState(false); // Light mode by default

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

  // Handle loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--surface-base)' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center"
            style={{ boxShadow: 'var(--shadow-glow)' }}
          >
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-base"
            style={{ color: 'var(--color-gray-600)' }}
          >
            Loading authentication...
          </motion.p>
        </motion.div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--surface-base)' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center p-8 max-w-md"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
            style={{
              backgroundColor: 'var(--color-destructive-500)',
              boxShadow: '0 0 30px rgba(239, 68, 68, 0.3)'
            }}
          >
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </motion.div>
          <h2 className="text-2xl font-semibold mb-3" style={{ color: 'var(--color-destructive-500)' }}>Authentication Error</h2>
          <p className="font-medium mb-2" style={{ color: 'var(--color-destructive-600)' }}>{error}</p>
          <p className="text-sm" style={{ color: 'var(--color-gray-500)' }}>
            Please ensure you are opening this page from the MentraOS app.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={`min-h-screen ${isDark ? 'dark' : 'light'}`}
      style={{ backgroundColor: 'var(--surface-base)' }}
    >
      <WorkSpace userId={userId || 'anonymous'} />
    </motion.div>
  );
}
