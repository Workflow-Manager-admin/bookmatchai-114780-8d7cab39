import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../auth/AuthProvider";
import api from "../api";

// PUBLIC_INTERFACE
function Profile() {
  /**
   * Profile page for authenticated users to view and update user information.
   * Integrates with backend profile endpoints, handles form state, loading, errors.
   */
  const { user, token } = useContext(AuthContext);

  // Local state for editable fields
  const [profile, setProfile] = useState({
    username: "",
    email: "",
  });
  const [loading, setLoading] = useState(true); // loading state for fetch
  const [saving, setSaving] = useState(false); // loading state for save
  const [error, setError] = useState(null); // error feedback
  const [editMode, setEditMode] = useState(false); // toggles between view and edit

  // Load profile data
  useEffect(() => {
    async function fetchProfile() {
      setLoading(true);
      setError(null);

      try {
        // Example: GET /api/profile/
        const resp = await api.get("/profile/", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setProfile({
          username: resp.data.username || "",
          email: resp.data.email || "",
        });
      } catch (e) {
        setError("Failed to load profile.");
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [token]);

  // Handler for input changes
  const handleChange = (e) => {
    setProfile((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  // Save profile handler
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // PATCH /api/profile/
      await api.patch(
        "/profile/",
        {
          username: profile.username,
          email: profile.email,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setEditMode(false);
    } catch (e) {
      setError(
        e.response && e.response.data && e.response.data.detail
          ? e.response.data.detail
          : "Failed to update profile."
      );
    } finally {
      setSaving(false);
    }
  };

  // Cancel edit handler
  const handleCancel = async () => {
    setEditMode(false);
    setLoading(true);
    setError(null);
    // Reload profile data  
    try {
      const resp = await api.get("/profile/", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setProfile({
        username: resp.data.username || "",
        email: resp.data.email || "",
      });
    } catch (e) {
      setError("Failed to reload profile.");
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="container">
        <h2>Profile</h2>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h2>Profile</h2>
      {error && (
        <div style={{ color: "#E87A41", marginBottom: 12 }}>{error}</div>
      )}
      <form
        className="profile-form"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        style={{ maxWidth: 400 }}
      >
        <label className="label">
          Username
          <input
            className="input"
            type="text"
            name="username"
            value={profile.username}
            onChange={handleChange}
            disabled={!editMode || saving}
            required
            autoComplete="username"
            style={{ marginBottom: 16 }}
          />
        </label>
        <label className="label">
          Email
          <input
            className="input"
            type="email"
            name="email"
            value={profile.email}
            onChange={handleChange}
            disabled={!editMode || saving}
            required
            autoComplete="email"
            style={{ marginBottom: 16 }}
          />
        </label>
        {!editMode ? (
          <button
            type="button"
            className="btn"
            style={{ marginRight: 12 }}
            onClick={() => setEditMode(true)}
          >
            Edit
          </button>
        ) : (
          <>
            <button
              className="btn"
              type="submit"
              disabled={saving}
              style={{ marginRight: 12 }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
          </>
        )}
      </form>
    </div>
  );
}

export default Profile;
