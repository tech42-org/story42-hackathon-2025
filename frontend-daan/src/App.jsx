import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './components/LoginPage';
import SignupPage from './components/SignupPage';
import AccountSettings from './components/AccountSettings';
import LandingPage from './components/LandingPage';
import AIPoweredFlow from './components/AIPoweredFlow';
import StoryGenerator from './StoryGenerator';
import VoiceSelector from './VoiceSelector';
import StoryBuilder from './StoryBuilder';
import VoiceAssignment from './VoiceAssignment';
import AudioGenerator from './AudioGenerator';
import FinalStory from './components/FinalStory';
import ThemeToggle from './components/ThemeToggle';
import StoriesList from './components/StoriesList';
import StoryViewer from './components/StoryViewer';
import storyStorageService from './services/storyStorageService';

function App() {
  const navigate = useNavigate();

  // Clean up cached story data older than 7 days when the app loads
  useEffect(() => {
    try {
      storyStorageService.clearOldCache(7);
    } catch (error) {
      console.error('Failed to cleanup old cache:', error);
    }
  }, []);

  return (
    <AuthProvider>
      <ThemeToggle />
      <Routes>
        {/* Authentication Pages */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Protected Routes */}
        <Route path="/" element={<ProtectedRoute><LandingPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />
        <Route path="/ai-powered" element={<ProtectedRoute><AIPoweredFlow /></ProtectedRoute>} />

        {/* Story Library */}
        <Route
          path="/stories"
          element={(
            <ProtectedRoute>
              <StoriesList onSelectStory={(id) => navigate(`/stories/${id}`)} />
            </ProtectedRoute>
          )}
        />
        <Route path="/stories/:storyId" element={<ProtectedRoute><StoryViewer /></ProtectedRoute>} />

        {/* Manual Story Building Path - with session ID in URL */}
        <Route path="/manual" element={<ProtectedRoute><StoryGenerator /></ProtectedRoute>} />
        <Route path="/manual/:sessionId" element={<ProtectedRoute><StoryGenerator /></ProtectedRoute>} />
        <Route path="/manual/:sessionId/voice" element={<ProtectedRoute><VoiceSelector /></ProtectedRoute>} />
        <Route path="/manual/:sessionId/builder" element={<ProtectedRoute><StoryBuilder /></ProtectedRoute>} />
        <Route path="/manual/:sessionId/assign-voices" element={<ProtectedRoute><VoiceAssignment /></ProtectedRoute>} />
        <Route path="/manual/:sessionId/audio" element={<ProtectedRoute><AudioGenerator /></ProtectedRoute>} />
        <Route path="/manual/:sessionId/final" element={<ProtectedRoute><FinalStory /></ProtectedRoute>} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
