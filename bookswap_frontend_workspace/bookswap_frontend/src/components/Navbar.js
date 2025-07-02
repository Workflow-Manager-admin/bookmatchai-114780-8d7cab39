import React from "react";
import { NavLink } from "react-router-dom";

// PUBLIC_INTERFACE
function Navbar({ children }) {
  /**
   * Navigation bar component for all top-level routes.
   */
  return (
    <nav className="navbar" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'var(--bg-secondary)',
      padding: '0.5rem 2rem',
      borderBottom: '1px solid var(--border-color)',
      minHeight: '60px'
    }}>
      <div style={{ fontWeight: "bold", fontSize: "1.35rem" }}>
        BookSwap+
      </div>
      <div style={{ display: 'flex', gap: '1.3em', alignItems: 'center' }}>
        <NavLink to="/" end className={({ isActive }) => isActive ? "active" : undefined}>Home</NavLink>
        <NavLink to="/books">Book Listings</NavLink>
        <NavLink to="/my-books">My Books</NavLink>
        <NavLink to="/offers">Offers</NavLink>
        <NavLink to="/recommendations">Recommendations</NavLink>
        <NavLink to="/profile">Profile</NavLink>
        <NavLink to="/login">Login</NavLink>
      </div>
      {children}
    </nav>
  );
}

export default Navbar;
