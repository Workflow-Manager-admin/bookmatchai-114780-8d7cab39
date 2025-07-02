import React from "react";
import Navbar from "./Navbar";

// PUBLIC_INTERFACE
function Layout({ children, theme, onToggleTheme }) {
  /**
   * Page layout: Navbar (with theme toggle), content area.
   */
  return (
    <div>
      <Navbar>
        <button
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          style={{ marginLeft: "1.5rem" }}
        >
          {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
        </button>
      </Navbar>
      <main
        style={{
          maxWidth: 960,
          margin: "2rem auto",
          minHeight: "70vh",
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
          padding: "2rem",
          borderRadius: "10px",
          boxShadow: "0 3px 16px rgba(40,44,52,.05)",
        }}
      >
        {children}
      </main>
    </div>
  );
}

export default Layout;
