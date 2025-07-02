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

// PUBLIC_INTERFACE
function App() {
  /**
   * Top-level React app with Routing and theme support.
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
    <Router>
      <Layout theme={theme} onToggleTheme={toggleTheme}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/books" element={<BookListings />} />
          <Route path="/my-books" element={<MyBooks />} />
          <Route path="/offers" element={<Offers />} />
          <Route path="/recommendations" element={<Recommendations />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/login" element={<Login />} />
          {/* 404 fallback */}
          <Route path="*" element={<h2>Page Not Found</h2>} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
