import React, { useState, useEffect } from "react";
import { BookSwapApiClient } from "../api/client";

// PUBLIC_INTERFACE
function BookListings() {
  /**
   * Paginated, filterable, searchable list of all books in BookSwap+.
   * Integrates with backend API for book data, includes search, filter, and handles loading/error states.
   */
  const [books, setBooks] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [condition, setCondition] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const CONDITION_OPTIONS = [
    { label: "All", value: "" },
    { label: "New", value: "new" },
    { label: "Like New", value: "like new" },
    { label: "Very Good", value: "very good" },
    { label: "Good", value: "good" },
    { label: "Acceptable", value: "acceptable" },
    { label: "Poor", value: "poor" },
  ];

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1); // Reset to first page on new search/filter
      fetchBooks(1, limit, search, condition);
    }, 350);

    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, condition]);

  // Fetch on page/limit change
  useEffect(() => {
    setLoading(true);
    fetchBooks(page, limit, search, condition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit]);

  // PUBLIC_INTERFACE
  async function fetchBooks(page, limit, search, condition) {
    setLoading(true);
    setError("");
    try {
      const result = await BookSwapApiClient.listBooks({ page, limit, search, condition });
      setBooks(result.items || []);
      setTotal(result.total || 0);
      setHasMore(result.has_more === true);
      setPage(result.page || 1);
      setLimit(result.limit || 10);
    } catch (err) {
      setError(err.message || "Failed to load books.");
    } finally {
      setLoading(false);
    }
  }

  // Event handlers
  function handleSearchChange(e) {
    setSearch(e.target.value);
  }

  function handleConditionChange(e) {
    setCondition(e.target.value);
  }

  function handleLimitChange(e) {
    setLimit(Number(e.target.value));
    setPage(1);
  }

  function handlePageChange(newPage) {
    if (newPage < 1 || (total && newPage > Math.ceil(total / limit))) return;
    setPage(newPage);
  }

  // Renderers
  function renderBook(book) {
    return (
      <div
        key={book.id}
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 8,
          padding: "1em",
          marginBottom: 18,
          background: "var(--bg-secondary)",
          textAlign: "left",
          boxShadow: "0 1px 4px rgba(40,44,52,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: "0.4em"
        }}
      >
        <div style={{ fontWeight: 600, fontSize: "1.15em", color: "var(--text-primary)" }}>
          {book.title}
        </div>
        <div style={{ fontSize: "1em", color: "var(--text-secondary)" }}>
          by {book.author}
        </div>
        {book.description && (
          <div style={{ fontSize: ".95em", margin: "0.5em 0" }}>
            {book.description.length > 200
              ? book.description.slice(0, 180) + "..."
              : book.description}
          </div>
        )}
        <div style={{ fontSize: "0.95em", color: "#918d86" }}>
          Condition: <strong>{book.condition || "Unknown"}</strong>
        </div>
        {book.llm_summary && (
          <div style={{
            fontStyle: "italic",
            background: "rgba(238,235,255,0.12)",
            padding: "0.35em 0.8em",
            borderRadius: 6,
            color: "#7662c0"
          }}>
            {book.llm_summary}
          </div>
        )}
        <div style={{ fontSize: "0.85em", color: "#666", marginTop: 6 }}>
          Listed: {book.created_at ? new Date(book.created_at).toLocaleString() : "N/A"}
        </div>
        {Array.isArray(book.semantic_tags) && book.semantic_tags.length > 0 && (
          <div style={{ marginTop: 5, display: "flex", gap: "0.4em", flexWrap: "wrap" }}>
            {book.semantic_tags.map((tag, idx) => (
              <span key={idx} style={{
                background: "#f6f1ff",
                color: "#380091",
                fontSize: "0.8em",
                borderRadius: 5,
                padding: "0.18em 0.65em",
                border: "1px solid #0056b355",
                marginRight: 4
              }}>{tag}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Pagination controls
  function renderPagination() {
    if (total <= limit) return null;
    const totalPages = Math.ceil(total / limit);
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, margin: "1.5em 0" }}>
        <button
          className="btn"
          onClick={() => handlePageChange(page - 1)}
          disabled={page === 1}
        >Prev</button>
        <span>
          Page <strong>{page}</strong> of {totalPages}
        </span>
        <button
          className="btn"
          onClick={() => handlePageChange(page + 1)}
          disabled={page >= totalPages}
        >Next</button>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: "0.4em" }}>Book Listings</h2>
      <form
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 22,
          alignItems: "center",
        }}
        onSubmit={(e) => e.preventDefault()}
        aria-label="Search and filter books"
      >
        <input
          type="search"
          placeholder="Search by title or author"
          value={search}
          onChange={handleSearchChange}
          style={{
            fontSize: "1em",
            borderRadius: 6,
            border: "1px solid var(--border-color)",
            padding: "0.55em 0.9em",
            minWidth: 220,
          }}
          aria-label="Search by title or author"
        />
        <select
          value={condition}
          onChange={handleConditionChange}
          style={{ fontSize: "1em", borderRadius: 6, padding: "0.5em", border: "1px solid var(--border-color)" }}
          aria-label="Filter by condition"
        >
          {CONDITION_OPTIONS.map(opt => (
            <option value={opt.value} key={opt.value || "all"}>
              {opt.label}
            </option>
          ))}
        </select>
        <label style={{ fontSize: ".97em", color: "#4d4d4d" }}>
          Per page:
          <select
            value={limit}
            onChange={handleLimitChange}
            style={{ marginLeft: 6, borderRadius: 5, padding: "0.15em 0.6em" }}
            aria-label="Results per page"
          >
            {[5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </form>

      {loading ? (
        <div style={{ textAlign: "center", margin: "2.9em 0" }}>Loading books...</div>
      ) : error ? (
        <div style={{ color: "#bd1919", padding: "1em", background: "#fff0f0", borderRadius: 6, textAlign: "center" }}>
          {error}
        </div>
      ) : (
        <>
          {books.length === 0 ? (
            <div style={{ margin: "2.5em 0", textAlign: "center", color: "#989899" }}>
              No books found. Try modifying your search/filter.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 18 }}>
                {books.map(renderBook)}
              </div>
              {renderPagination()}
              <div style={{ textAlign: "center", fontSize: "0.95em", color: "#666", marginTop: "1.5em" }}>
                Showing {books.length} of {total} result{total !== 1 ? "s" : ""}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default BookListings;
