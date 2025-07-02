import React, { useEffect, useState } from "react";
import { BookSwapApiClient } from "../api/client";

/**
 * Offer status/value semantics (must match backend):
 * - "pending": can be accepted/rejected (if received), or cancelled (if sent)
 * - "accepted": can be marked completed by either side
 * - "rejected": final
 * - "completed": final
 * - "cancelled": final
 */

// PUBLIC_INTERFACE
function Offers() {
  /**
   * Offers page: sent & received book swap offers.
   * Allows accepting/rejecting/cancelling offers, displays status, loading, error.
   * Integrates with BookSwapApiClient. Requires authentication via route.
   */
  const [tab, setTab] = useState("received"); // "received" | "sent"
  const [sentOffers, setSentOffers] = useState([]);
  const [receivedOffers, setReceivedOffers] = useState([]);
  const [sentBooks, setSentBooks] = useState({});
  const [receivedBooks, setReceivedBooks] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(""); // offer id or ""
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [refresh, setRefresh] = useState(false);

  // Helper: fetch book details for offers (avoids n+1 on books)
  async function batchFetchBooks(bookIds) {
    /** Fetch all needed books, returns {id: bookObj} map. */
    const bookMap = {};
    // Fetch in parallel as needed (no /books/batch API available)
    await Promise.all(
      Array.from(bookIds).map(async (id) => {
        if (!id) return;
        try {
          const book = await BookSwapApiClient.getBook(id);
          if (book && book.id) bookMap[id] = book;
        } catch {
          // Ignore not found
        }
      })
    );
    return bookMap;
  }

  // Fetch offers + their associated books for each tab
  useEffect(() => {
    setLoading(true);
    setError("");
    setActionError("");
    async function fetchOffers() {
      try {
        // Fetch offers
        const [sent, received] = await Promise.all([
          BookSwapApiClient.listSentOffers(),
          BookSwapApiClient.listReceivedOffers(),
        ]);
        setSentOffers(sent || []);
        setReceivedOffers(received || []);

        // Collect ALL unique book ids to fetch
        const sentBookIds = new Set(
          sent.flatMap((o) => [o.offered_book_id, o.requested_book_id])
        );
        const receivedBookIds = new Set(
          received.flatMap((o) => [o.offered_book_id, o.requested_book_id])
        );
        // Fetch books for both sent and received
        const sentBooksFetched = await batchFetchBooks(sentBookIds);
        const receivedBooksFetched = await batchFetchBooks(receivedBookIds);
        setSentBooks(sentBooksFetched);
        setReceivedBooks(receivedBooksFetched);
      } catch (err) {
        setError(
          err?.message || "Failed to load offers. Please try again later."
        );
      } finally {
        setLoading(false);
      }
    }
    fetchOffers();
  }, [refresh]);

  // HANDLER: Accept, Reject, or Cancel offer
  async function handleOfferAction(offer, action) {
    setActionLoading(offer.id);
    setActionError("");
    try {
      if (action === "accept" || action === "reject") {
        await BookSwapApiClient.updateSwapOffer(offer.id, {
          status: action === "accept" ? "accepted" : "rejected",
        });
      } else if (action === "cancel") {
        await BookSwapApiClient.updateSwapOffer(offer.id, {
          status: "cancelled",
        });
      }
      setRefresh((r) => !r); // trigger refresh
    } catch (err) {
      setActionError(
        err?.message || "Failed to update offer. Please refresh the page."
      );
    } finally {
      setActionLoading("");
    }
  }

  // HANDLER: Delete rejected/cancelled offer (for senders)
  async function handleDeleteOffer(offer) {
    setActionLoading(offer.id);
    setActionError("");
    try {
      await BookSwapApiClient.deleteSwapOffer(offer.id);
      setRefresh((r) => !r);
    } catch (err) {
      setActionError(
        err?.message || "Failed to delete offer. Please refresh."
      );
    } finally {
      setActionLoading("");
    }
  }

  // Offer status chip
  function renderStatus(status) {
    // Visual "chip" for the status.
    const colorMap = {
      pending: "#8e8e8e",
      accepted: "#1b8823",
      rejected: "#e65c34",
      completed: "#4535b7",
      cancelled: "#b8b8ba",
    };
    return (
      <span
        style={{
          background: colorMap[status] + "22",
          color: colorMap[status],
          borderRadius: 6,
          fontWeight: 600,
          fontSize: "0.94em",
          marginLeft: 8,
          padding: "0.17em 0.7em",
          border: `1.7px solid ${colorMap[status]}44`,
        }}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  }

  // RENDERER: Offer row (shared for both sent/received)
  function renderOffer(offer, bookMap, tabType) {
    const offered = bookMap[offer.offered_book_id];
    const requested = bookMap[offer.requested_book_id];

    return (
      <div
        key={offer.id}
        style={{
          border: "1.4px solid var(--border-color)",
          background: "var(--bg-secondary)",
          borderRadius: 8,
          marginBottom: 12,
          padding: "1.2em 1.3em 1em 1.3em",
          position: "relative",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: "1.08em" }}>
          You {tabType === "sent" ? "offered" : "were offered"}{" "}
          <span style={{ color: "#553bab" }}>
            {offered?.title ? `"${offered?.title}"` : "(unknown book)"}
          </span>
          <span style={{ color: "#7b7184", margin: "0 4px" }}>
            {!offered ? "" : "→"}
          </span>
          for{" "}
          <span style={{ color: "#247f40" }}>
            {requested?.title ? `"${requested?.title}"` : "(unknown book)"}
          </span>
          {renderStatus(offer.status)}
        </div>
        <div style={{ color: "#78788a", fontSize: ".98em", margin: "6px 0 0 2px" }}>
          {tabType === "sent"
            ? `You requested "${requested?.title || "(unknown)"}" by offering "${offered?.title || "(unknown)"}".`
            : `User requests your "${requested?.title || "(unknown)"}" in exchange for "${offered?.title || "(unknown)"}".`}
        </div>
        <div style={{ fontSize: "0.86em", color: "#8b8b9a", marginTop: 6 }}>
          Sent: {offer.created_at ? new Date(offer.created_at).toLocaleString() : "N/A"}
        </div>

        {/* ACTIONS */}
        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          {tabType === "received" && offer.status === "pending" && (
            <>
              <button
                className="btn"
                style={{
                  background: "#358a20",
                  color: "#fff",
                  fontWeight: 600,
                  borderRadius: 6,
                  padding: "0.42em 1.2em",
                }}
                disabled={actionLoading === offer.id}
                onClick={() => handleOfferAction(offer, "accept")}
              >
                Accept
              </button>
              <button
                className="btn"
                style={{
                  background: "#f1dbcc",
                  color: "#b83219",
                  fontWeight: 600,
                  borderRadius: 6,
                  padding: "0.42em 1.2em",
                }}
                disabled={actionLoading === offer.id}
                onClick={() => handleOfferAction(offer, "reject")}
              >
                Reject
              </button>
            </>
          )}
          {tabType === "sent" && offer.status === "pending" && (
            <button
              className="btn"
              style={{
                background: "#ecebf3",
                color: "#452971",
                fontWeight: 600,
                borderRadius: 6,
                padding: "0.42em 1.2em",
              }}
              disabled={actionLoading === offer.id}
              onClick={() => handleOfferAction(offer, "cancel")}
            >
              Cancel
            </button>
          )}
          {tabType === "sent" &&
            ["rejected", "cancelled"].includes(offer.status) && (
              <button
                className="btn"
                style={{
                  background: "#f8f3fb",
                  color: "#777",
                  fontWeight: 500,
                  borderRadius: 5,
                  padding: "0.36em 1.1em",
                  border: "1.2px solid #bfbfe9",
                }}
                disabled={actionLoading === offer.id}
                onClick={() => handleDeleteOffer(offer)}
              >
                Delete
              </button>
            )}
        </div>
        {/* Action-level loading/error */}
        {actionLoading === offer.id && (
          <div style={{ fontSize: "0.92em", color: "#3933ad", marginTop: 7 }}>
            Updating...
          </div>
        )}
        {actionError && actionLoading === offer.id && (
          <div style={{ fontSize: "0.9em", color: "#b51a19", marginTop: 2 }}>{actionError}</div>
        )}
      </div>
    );
  }

  function renderTabOffers(tabType) {
    const offers = tabType === "sent" ? sentOffers : receivedOffers;
    const bookMap = tabType === "sent" ? sentBooks : receivedBooks;

    if (loading) {
      return (
        <div style={{ textAlign: "center", margin: "2.6em 0" }}>
          Loading offers...
        </div>
      );
    }
    if (error) {
      return (
        <div
          style={{
            color: "#c23c12",
            background: "#ffefe8",
            padding: "1.2em 1.5em",
            borderRadius: 7,
            textAlign: "center",
            fontWeight: 500,
          }}
        >
          {error}
        </div>
      );
    }
    if (offers.length === 0) {
      return (
        <div style={{ margin: "2.7em 0", textAlign: "center", color: "#999" }}>
          {tabType === "sent"
            ? "You haven't sent any offers yet."
            : "You have no received offers at this time."}
        </div>
      );
    }
    // List offers, most recent first
    return (
      <div style={{ marginTop: 6 }}>
        {offers
          .slice()
          .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
          .map((offer) => renderOffer(offer, bookMap, tabType))}
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: "0.65em" }}>Swap Offers</h2>
      <div
        role="tablist"
        aria-label="Offer tabs"
        style={{
          display: "flex",
          gap: 0,
          marginBottom: "1.2em",
          borderRadius: 10,
          background: "#f8f5fa",
          border: "1.5px solid #ece9f0",
          maxWidth: 400,
        }}
      >
        <button
          role="tab"
          aria-selected={tab === "received"}
          tabIndex={tab === "received" ? 0 : -1}
          className="btn"
          style={{
            flex: 1,
            padding: "0.96em 0",
            borderRadius: "10px 0 0 10px",
            background: tab === "received" ? "#e5dbfa" : "transparent",
            color: tab === "received" ? "#533aac" : "#555",
            border: "none",
            fontWeight: tab === "received" ? 700 : 500,
            fontSize: "1.05em",
            boxShadow: tab === "received" ? "0 2px 7px 0 #e1def4" : "none",
            transition: "background 0.14s",
            cursor: "pointer",
          }}
          onClick={() => setTab("received")}
        >
          Received Offers
        </button>
        <button
          role="tab"
          aria-selected={tab === "sent"}
          tabIndex={tab === "sent" ? 0 : -1}
          className="btn"
          style={{
            flex: 1,
            padding: "0.96em 0",
            borderRadius: "0 10px 10px 0",
            background: tab === "sent" ? "#e5dbfa" : "transparent",
            color: tab === "sent" ? "#533aac" : "#555",
            border: "none",
            fontWeight: tab === "sent" ? 700 : 500,
            fontSize: "1.05em",
            boxShadow: tab === "sent" ? "0 2px 7px 0 #e1def4" : "none",
            transition: "background 0.14s",
            cursor: "pointer",
          }}
          onClick={() => setTab("sent")}
        >
          Sent Offers
        </button>
      </div>
      {tab === "received" ? renderTabOffers("received") : renderTabOffers("sent")}
    </div>
  );
}

export default Offers;
