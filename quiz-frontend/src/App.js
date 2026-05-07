import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import ToastProvider from "./components/ui/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import ShortcutModal from "./components/ui/ShortcutModal";

import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";

import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import HomePage from "./pages/HomePage";
import DashboardPage from "./pages/DashboardPage";
import GeneratePage from "./pages/GeneratePage";
import QuizPage from "./pages/QuizPage";
import ResultPage from "./pages/ResultPage";
import HistoryPage from "./pages/HistoryPage";
import StudyPage from "./pages/StudyPage";
import FlashcardPage from "./pages/FlashcardPage";
import TestPage from "./pages/TestPage";
import AboutPage from "./pages/AboutPage";
import SharePage from "./pages/SharePage";
import LeaderboardPage from "./pages/LeaderboardPage";
import NotFoundPage from "./pages/NotFoundPage";

import "./index.css";

const PAGE_TITLES = {
  "/home":       "Home — QuizGenius AI",
  "/generate":   "Generate Quiz — QuizGenius AI",
  "/study":      "Study Mode — QuizGenius AI",
  "/test":       "Test Mode — QuizGenius AI",
  "/dashboard":  "Dashboard — QuizGenius AI",
  "/about":      "About — QuizGenius AI",
  "/quiz":       "Quiz — QuizGenius AI",
  "/result":     "Results — QuizGenius AI",
  "/history":    "History — QuizGenius AI",
  "/flashcard":  "Flashcards — QuizGenius AI",
  "/login":      "Sign In — QuizGenius AI",
  "/register":   "Create Account — QuizGenius AI",
};

// TitleUpdater must live INSIDE BrowserRouter so useLocation works
function TitleUpdater() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    document.title = PAGE_TITLES[pathname] || "QuizGenius AI";
  }, [pathname]);
  return null;
}

// AppShell is INSIDE BrowserRouter so Navbar + Routes share the same router context.
// AuthProvider wraps everything so Navbar always reads from context, not localStorage.
function AppShell() {
  return (
    <AuthProvider>
      <ToastProvider>
        <TitleUpdater />
        <ShortcutModal />

        {/*
          Navbar is rendered OUTSIDE <Routes> — it never unmounts on route changes.
          AuthContext hydrates first (see initializing state) so Navbar only renders
          when auth state is confirmed, eliminating the flash-hide-show issue.
        */}
        <Navbar />

        <Routes>
          {/* Public */}
          <Route path="/login"       element={<LoginPage />} />
          <Route path="/register"    element={<RegisterPage />} />
          <Route path="/share/:data" element={<SharePage />} />

          {/* Protected — ProtectedRoute waits for initializing before redirecting */}
          <Route path="/home"        element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          <Route path="/dashboard"   element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/generate"    element={<ProtectedRoute><GeneratePage /></ProtectedRoute>} />
          <Route path="/quiz"        element={<ProtectedRoute><QuizPage /></ProtectedRoute>} />
          <Route path="/result"      element={<ProtectedRoute><ResultPage /></ProtectedRoute>} />
          <Route path="/history"     element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
          <Route path="/study"       element={<ProtectedRoute><StudyPage /></ProtectedRoute>} />
          <Route path="/flashcard"   element={<ProtectedRoute><FlashcardPage /></ProtectedRoute>} />
          <Route path="/test"        element={<ProtectedRoute><TestPage /></ProtectedRoute>} />
          <Route path="/about"       element={<ProtectedRoute><AboutPage /></ProtectedRoute>} />
          <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
