import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import BookListings from "./pages/BookListings";
import MyBooks from "./pages/MyBooks";
import Offers from "./pages/Offers";
import Recommendations from "./pages/Recommendations";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import { AuthProvider, RequireAuth } from "./auth/AuthProvider";

// PUBLIC_INTERFACE
function App() {
  /**
   * Top-level React app with Routing and theme support + Clerk support.
   */
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <AuthProvider>
      <Router>
        <Layout theme={theme} onToggleTheme={toggleTheme}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/books" element={<BookListings />} />
            {/* Protected routes */}
            <Route
              path="/my-books"
              element={
                <RequireAuth>
                  <MyBooks />
                </RequireAuth>
              }
            />
            <Route
              path="/offers"
              element={
                <RequireAuth>
                  <Offers />
                </RequireAuth>
              }
            />
            <Route
              path="/recommendations"
              element={
                <RequireAuth>
                  <Recommendations />
                </RequireAuth>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
            {/* Public login route */}
            <Route path="/login" element={<Login />} />
            {/* 404 fallback */}
            <Route path="*" element={<h2>Page Not Found</h2>} />
          </Routes>
        </Layout>
      </Router>
    </AuthProvider>
  );
}

export default App;
