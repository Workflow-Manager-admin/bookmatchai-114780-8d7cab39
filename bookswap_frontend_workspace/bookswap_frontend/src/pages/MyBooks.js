import React, { useEffect, useState } from "react";
import { BookSwapApiClient } from "../api/client";
import { useAuth } from "../auth/AuthProvider";

// PUBLIC_INTERFACE
function MyBooks() {
  /**
   * "My Books" user page.
   * - Displays all books owned by the authenticated user.
   * - Allows creating, editing, and deleting books via modals/forms.
   * - Integrates with BookSwap+ API client.
   * - Authentication is required (handled by route).
   */

  // User and auth status (can show user info later)
  const { user, isSignedIn, isLoaded } = useAuth();

  // State management
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // For CRUD modals/forms
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editBook, setEditBook] = useState(null);
  const [deletePending, setDeletePending] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  // CRUD form state
  const emptyBookForm = {
    title: "",
    author: "",
    description: "",
    condition: "",
  };
  const [form, setForm] = useState(emptyBookForm);

  // BOOK CONDITION OPTIONS
  const CONDITION_OPTIONS = [
    { label: "Select...", value: "" },
    { label: "New", value: "new" },
    { label: "Like New", value: "like new" },
    { label: "Very Good", value: "very good" },
    { label: "Good", value: "good" },
    { label: "Acceptable", value: "acceptable" },
    { label: "Poor", value: "poor" },
  ];

  // ===== LOAD BOOKS =====
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetchMyBooks();
    // eslint-disable-next-line
  }, [isLoaded, isSignedIn]);

  // PUBLIC_INTERFACE
  async function fetchMyBooks() {
    setLoading(true);
    setError("");
    try {
      const bookList = await BookSwapApiClient.myBooks();
      setBooks(bookList || []);
    } catch (err) {
      setError(err.message || "Failed to load your books.");
    } finally {
      setLoading(false);
    }
  }

  // ===== HANDLERS FOR CREATE / EDIT / DELETE =====

  function openCreateModal() {
    setForm(emptyBookForm);
    setShowCreate(true);
    setActionError("");
  }

  function openEditModal(book) {
    setEditBook(book);
    setForm({
      title: book.title || "",
      author: book.author || "",
      description: book.description || "",
      condition: book.condition || "",
    });
    setShowEdit(true);
    setActionError("");
  }

  function closeModals() {
    setShowCreate(false);
    setShowEdit(false);
    setEditBook(null);
    setDeletePending(null);
    setForm(emptyBookForm);
    setActionError("");
    setActionLoading(false);
  }

  // Handle input changes for forms
  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  // CREATE book
  async function handleCreateBook(e) {
    e.preventDefault();
    setActionLoading(true);
    setActionError("");
    try {
      if (!form.title.trim() || !form.author.trim()) {
        setActionError("Title and author are required.");
        setActionLoading(false);
        return;
      }
      await BookSwapApiClient.createBook(form);
      // Reload books
      await fetchMyBooks();
      closeModals();
    } catch (err) {
      setActionError(err.message || "Failed to create book.");
    } finally {
      setActionLoading(false);
    }
  }

  // EDIT book
  async function handleEditBook(e) {
    e.preventDefault();
    setActionLoading(true);
    setActionError("");
    try {
      if (!form.title.trim() || !form.author.trim()) {
        setActionError("Title and author are required.");
        setActionLoading(false);
        return;
      }
      await BookSwapApiClient.updateBook(editBook.id, form);
      await fetchMyBooks();
      closeModals();
    } catch (err) {
      setActionError(err.message || "Failed to save changes.");
    } finally {
      setActionLoading(false);
    }
  }

  // INITIATE DELETE
  function handleDeleteRequest(book) {
    setDeletePending(book);
    setActionError("");
  }

  // CONFIRM DELETE
  async function handleDeleteConfirm() {
    if (!deletePending) return;
    setActionLoading(true);
    setActionError("");
    try {
      await BookSwapApiClient.deleteBook(deletePending.id);
      await fetchMyBooks();
      closeModals();
    } catch (err) {
      setActionError(err.message || "Failed to delete book.");
      setActionLoading(false);
    }
  }

  // Cancel delete
  function handleDeleteCancel() {
    setDeletePending(null);
    setActionError("");
  }

  // --- UI RENDER HELPERS ---

  function renderBooks() {
    if (books.length === 0) {
      return <div style={{ margin: "2em 0", textAlign: "center", color: "#999" }}>
        You have not listed any books yet.<br />
        <button
          className="btn"
          style={{
            marginTop: "1.5em",
            padding: "0.8em 2.1em",
            fontWeight: 600,
            fontSize: "1.15em",
            borderRadius: 8
          }}
          onClick={openCreateModal}
        >
          + List a Book
        </button>
      </div>;
    }

    return (
      <div style={{ margin: "1.2em 0", display: "flex", flexDirection: "column", gap: 18 }}>
        {books.map((book) => (
          <div
            key={book.id}
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 7,
              padding: "1.1em 1.5em",
              background: "var(--bg-secondary)",
              boxShadow: "0 1.5px 7px 0 rgba(39,53,191,0.08)",
              position: "relative",
              minHeight: 90
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "1.14em" }}>
              {book.title}
            </div>
            <div style={{ fontSize: ".99em", color: "var(--text-secondary)" }}>
              by {book.author}
            </div>
            {book.description && (
              <div style={{ color: "#444", fontSize: ".97em", margin: "0.3em 0 0.2em 0" }}>
                {book.description.length > 180 ? (book.description.slice(0, 180) + "...") : book.description}
              </div>
            )}
            <div style={{ fontSize: "0.95em", color: "#918d86" }}>
              Condition: <strong>{book.condition || "Unknown"}</strong>
              {" · "}Listed: {book.created_at ? new Date(book.created_at).toLocaleString() : "N/A"}
            </div>
            {Array.isArray(book.semantic_tags) && book.semantic_tags.length > 0 && (
              <div style={{ marginTop: 6, display: "flex", gap: "0.4em", flexWrap: "wrap" }}>
                {book.semantic_tags.map((tag, idx) => (
                  <span key={idx} style={{
                    background: "#f3f1ff",
                    color: "#450099",
                    fontSize: "0.82em",
                    borderRadius: 5,
                    padding: "0.19em 0.7em",
                    border: "1px solid #0056b341",
                    marginRight: 3
                  }}>{tag}</span>
                ))}
              </div>
            )}
            {/* Actions */}
            <div style={{
              position: "absolute",
              top: 10, right: 10, display: "flex", gap: 10
            }}>
              <button
                className="btn"
                style={{
                  fontSize: ".92em",
                  fontWeight: 600,
                  borderRadius: 6,
                  padding: "0.45em 1.1em"
                }}
                onClick={() => openEditModal(book)}
              >
                Edit
              </button>
              <button
                className="btn"
                style={{
                  background: "#e14d3d",
                  color: "white",
                  fontWeight: 700,
                  fontSize: ".91em",
                  borderRadius: 6,
                  padding: "0.45em 1.1em"
                }}
                onClick={() => handleDeleteRequest(book)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderCreateModal() {
    if (!showCreate) return null;
    return (
      <Modal title="List a New Book" onClose={closeModals}>
        <BookForm
          form={form}
          loading={actionLoading}
          error={actionError}
          onChange={handleFormChange}
          onSubmit={handleCreateBook}
          conditionOptions={CONDITION_OPTIONS}
          submitLabel="List Book"
        />
      </Modal>
    );
  }

  function renderEditModal() {
    if (!showEdit) return null;
    return (
      <Modal title="Edit Book Details" onClose={closeModals}>
        <BookForm
          form={form}
          loading={actionLoading}
          error={actionError}
          onChange={handleFormChange}
          onSubmit={handleEditBook}
          conditionOptions={CONDITION_OPTIONS}
          submitLabel="Save Changes"
        />
      </Modal>
    );
  }

  function renderDeleteModal() {
    if (!deletePending) return null;
    return (
      <Modal title="Confirm Delete" onClose={closeModals}>
        <div style={{ margin: "1.2em 0 1.5em" }}>
          <b>Delete "{deletePending.title}"?</b>
          <div style={{ color: "#a10014", marginTop: "0.6em" }}>
            This action cannot be undone.
          </div>
        </div>
        {actionError && <div style={{ color: "#c60012", marginBottom: 10 }}>{actionError}</div>}
        <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
          <button
            className="btn"
            disabled={actionLoading}
            style={{
              background: "#e14d3d",
              color: "white",
              borderRadius: 6,
              fontWeight: 600,
              padding: "8px 26px"
            }}
            onClick={handleDeleteConfirm}
          >Delete</button>
          <button
            className="btn"
            style={{
              borderRadius: 6,
              padding: "8px 22px",
              background: "#ebeefc",
              color: "#23114d",
              fontWeight: 500,
              border: "1.75px solid #bbbcee"
            }}
            disabled={actionLoading}
            onClick={handleDeleteCancel}
          >Cancel</button>
        </div>
      </Modal>
    );
  }

  // =================== MAIN RENDER ===================
  return (
    <div>
      <h2 style={{ marginBottom: "0.4em" }}>
        My Books
        <button
          className="btn"
          style={{
            float: "right",
            marginTop: "0.1em",
            marginLeft: 12,
            padding: "7.5px 18px",
            borderRadius: 7,
            fontWeight: 600,
            fontSize: "1.09em"
          }}
          onClick={openCreateModal}
        >
          + Add Book
        </button>
      </h2>
      <div style={{ clear: "both", height: 2 }} />
      {loading ? (
        <div style={{ textAlign: "center", margin: "2.7em 0" }}>Loading your books...</div>
      ) : error ? (
        <div style={{
          color: "#c0472e",
          background: "#fff3f1",
          padding: "1em 1.2em",
          borderRadius: 7,
          textAlign: "center"
        }}>
          {error}
        </div>
      ) : (
        renderBooks()
      )}
      {renderCreateModal()}
      {renderEditModal()}
      {renderDeleteModal()}
    </div>
  );
}

// Modal helper component
function Modal({ title, onClose, children }) {
  // Simple accessible modal with backdrop
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.28)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1111,
      }}
      onClick={onClose}
    >
      <div
        style={{
          minWidth: 340,
          maxWidth: 430,
          background: "var(--bg-primary)",
          borderRadius: 11,
          padding: "2.1em 2em 1.7em 2em",
          boxShadow: "0 7px 35px 0 rgba(78,90,147,0.16)",
          position: "relative"
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          aria-label="Close"
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 14,
            background: "none", border: "none", fontSize: "1.45em", color: "#555", cursor: "pointer"
          }}
        >&times;</button>
        <div style={{ fontWeight: 700, fontSize: "1.33em", marginBottom: "0.7em" }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

// Book create/edit form component
function BookForm({ form, loading, error, onChange, onSubmit, conditionOptions, submitLabel }) {
  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 16, margin: "1.4em 0 0" }}
      onSubmit={onSubmit}
      aria-label="Book details form"
    >
      <label>
        Title <span style={{ color: "#b00" }}>*</span><br />
        <input
          type="text"
          name="title"
          required
          maxLength={140}
          value={form.title}
          onChange={onChange}
          style={inputStyle}
        />
      </label>
      <label>
        Author <span style={{ color: "#b00" }}>*</span><br />
        <input
          type="text"
          name="author"
          required
          maxLength={80}
          value={form.author}
          onChange={onChange}
          style={inputStyle}
        />
      </label>
      <label>
        Description<br />
        <textarea
          name="description"
          rows={3}
          maxLength={850}
          value={form.description}
          onChange={onChange}
          style={{ ...inputStyle, resize: "vertical", minHeight: 66 }}
          placeholder="Add a brief description…"
        ></textarea>
      </label>
      <label>
        Condition<br />
        <select
          name="condition"
          value={form.condition}
          onChange={onChange}
          style={inputStyle}
        >
          {conditionOptions.map(opt => (
            <option value={opt.value} key={opt.value || "-"}>{opt.label}</option>
          ))}
        </select>
      </label>
      {error && <div style={{ color: "#c60012", marginBottom: 2 }}>{error}</div>}
      <button
        className="btn"
        type="submit"
        style={{
          marginTop: 16,
          padding: "9px 38px",
          fontWeight: 700,
          borderRadius: 6,
          fontSize: "1.09em"
        }}
        disabled={loading}
      >
        {submitLabel || "Save"}
      </button>
    </form>
  );
}

const inputStyle = {
  width: "100%",
  marginTop: "0.19em",
  marginBottom: "0.06em",
  borderRadius: 6,
  border: "1.6px solid var(--border-color)",
  padding: "0.42em 0.85em",
  fontSize: "1.06em",
  fontFamily: "inherit",
};

export default MyBooks;
