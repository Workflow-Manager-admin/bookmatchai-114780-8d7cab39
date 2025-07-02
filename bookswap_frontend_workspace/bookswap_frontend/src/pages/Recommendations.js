import React, { useEffect, useState } from "react";
import { BookSwapApiClient } from "../api/client";

// PUBLIC_INTERFACE
function Recommendations() {
  /**
   * Recommendations page for semantic book matches.
   * Lets users enter interests and view explainable, LLM-powered book suggestions.
   * Includes batch rec and swap compatibility UI (optional).
   */
  const [interests, setInterests] = useState("");
  const [interestArr, setInterestArr] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(10);
  const [minScore, setMinScore] = useState(0.4);

  // Optional: Batch Recommendations
  const [batchBookIds, setBatchBookIds] = useState("");
  const [batchRecs, setBatchRecs] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState("");

  // Swap Compatibility State
  const [compatIds, setCompatIds] = useState({offered:"",requested:""});
  const [compatResult, setCompatResult] = useState(null);
  const [compatLoading, setCompatLoading] = useState(false);
  const [compatError, setCompatError] = useState("");

  // On mount, focus input
  const inputRef = React.useRef(null);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  // ---- Handlers ----
  // Parse comma/semicolon-separated interests and normalize
  function handleInterestsChange(e) {
    setInterests(e.target.value);
  }
  // On form submit
  async function handleGetRecommendations(e) {
    e.preventDefault();
    setError("");
    setRecommendations([]);
    setFormLoading(true);
    setLoading(true);
    try {
      // Parse interests (limit: 20)
      let arr = interests
        .split(/[,;|\n]/)
        .map((str) => str.trim())
        .filter(Boolean)
        .filter((v, i, self) => i === self.indexOf(v));
      if (arr.length === 0) {
        setError("Please enter at least one interest, genre, or theme.");
        setLoading(false); setFormLoading(false); return;
      }
      if (arr.length > 20) {
        arr = arr.slice(0, 20);
      }
      setInterestArr(arr);

      const result = await BookSwapApiClient.getRecommendations({
        interests: arr,
        limit,
        min_score: minScore,
      });
      setRecommendations(result || []);
      if (!result || result.length === 0)
        setError(
          "No strong matches found for these interests. Try different or broader themes!"
        );
    } catch (err) {
      setError(
        err?.message ||
          "Failed to fetch recommendations. Please try again later."
      );
    } finally {
      setLoading(false);
      setFormLoading(false);
    }
  }

  // --- Batch rec (user pastes multiple book IDs - advanced UX) ---
  async function handleBatchRecommendations(e) {
    e.preventDefault();
    setBatchRecs([]);
    setBatchError("");
    setBatchLoading(true);
    try {
      let ids = batchBookIds
        .split(/[,; \n]+/)
        .map((v) => parseInt(v, 10))
        .filter((n) => !isNaN(n));
      if (ids.length === 0) {
        setBatchError("Please enter at least one book ID.");
        setBatchLoading(false);
        return;
      }
      if (ids.length > 10) ids = ids.slice(0, 10);
      const resp = await BookSwapApiClient.batchRecommendationsForBooks(
        ids,
        5,
        0.5
      );
      setBatchRecs(resp || []);
      if (!resp || resp.length === 0) setBatchError("No matches for input books.");
    } catch (err) {
      setBatchError(err?.message || "Failed to get batch recommendations.");
    } finally {
      setBatchLoading(false);
    }
  }

  // --- Swap Compatibility Analysis (advanced) ---
  async function handleAnalyzeCompatibility(e) {
    e.preventDefault();
    setCompatResult(null);
    setCompatError("");
    setCompatLoading(true);
    try {
      const offeredId = parseInt(compatIds.offered, 10);
      const requestedId = parseInt(compatIds.requested, 10);
      if (!offeredId || !requestedId) {
        setCompatError("Please enter valid book IDs.");
        setCompatLoading(false);
        return;
      }
      const res = await BookSwapApiClient.analyzeSwapCompatibility({
        offered_book_id: offeredId,
        requested_book_id: requestedId,
      });
      setCompatResult(res);
      if (!res)
        setCompatError(
          "Could not analyze compatibility. Try different book IDs."
        );
    } catch (err) {
      setCompatError(
        err?.message ||
          "Failed to analyze compatibility. Try again or contact support."
      );
    } finally {
      setCompatLoading(false);
    }
  }

  // ---- Renderers ----
  function renderRecommendation(book) {
    return (
      <div
        key={book.id}
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 9,
          background: "var(--bg-secondary)",
          boxShadow: "0 1.5px 7px 0 rgba(39,53,191,0.07)",
          padding: "1.25em 1.5em",
          marginBottom: 13,
          textAlign: "left",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: "1.22em", color: "#20013d" }}>
          {book.title}
        </div>
        <div
          style={{ fontSize: "1em", color: "var(--text-secondary)", marginBottom: 1 }}
        >
          by {book.author}
        </div>
        {book.description && (
          <div style={{ fontSize: ".97em", margin: "0.45em 0 0.15em 0" }}>
            {book.description.length > 200
              ? book.description.slice(0, 180) + "..."
              : book.description}
          </div>
        )}
        {Array.isArray(book.semantic_tags) && book.semantic_tags.length > 0 && (
          <div style={{ marginTop: 6, display: "flex", gap: "0.3em", flexWrap: "wrap" }}>
            {book.semantic_tags.map((tag, idx) => (
              <span
                key={idx}
                style={{
                  background: "#f4fcf3",
                  color: "#177d29",
                  fontSize: "0.85em",
                  borderRadius: 6,
                  padding: "0.17em 0.7em",
                  border: "1px solid #59c11533",
                  marginRight: 4,
                  marginTop: 2,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <div style={{ fontSize: "0.96em", color: "#453bb5", marginTop: 9 }}>
          <strong>Match Score:</strong>{" "}
          {(book.match_score * 100).toFixed(1)}
          {"/100"}
        </div>
        {book.match_explanation && (
          <div
            style={{
              fontStyle: "italic",
              padding: "0.36em 1em",
              marginTop: "0.35em",
              background: "#f6f3ff",
              borderRadius: 7,
              color: "#6c4396",
              fontSize: "0.99em",
            }}
          >
            <strong>Why this match?</strong> {book.match_explanation}
          </div>
        )}
      </div>
    );
  }

  function renderRecommendationsSection() {
    return (
      <div>
        <h2 style={{ marginBottom: "0.2em" }}>📚 Book Recommendations</h2>
        <div style={{ color: "#64648f", fontSize: "1.01em", marginBottom: 16 }}>
          Enter your reading interests, genres, or favorite themes (e.g. "magical realism, climate change, fantasy, fast-paced, Japanese culture").
          Get AI-powered book matches with semantic explanations.
        </div>
        <form
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 22,
            alignItems: "flex-end",
          }}
          onSubmit={handleGetRecommendations}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="E.g. Ancient Egypt, coming-of-age, thriller..."
            value={interests}
            onChange={handleInterestsChange}
            style={{
              flex: 2,
              fontSize: "1.07em",
              borderRadius: 7,
              border: "1.5px solid var(--border-color)",
              padding: "0.6em 0.95em",
              minWidth: 210,
            }}
            aria-label="Your interests"
            disabled={formLoading}
          />
          <label style={{ fontSize: "0.99em", color: "#4d4d4d" }}>
            Results:
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              style={{
                marginLeft: 6,
                borderRadius: 5,
                padding: "0.18em 0.65em",
                fontSize: "0.97em",
              }}
            >
              {[5, 10, 15, 20].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn"
            style={{
              fontWeight: 700,
              fontSize: "1em",
              borderRadius: 8,
              padding: "0.57em 1.7em",
              background: "#634c90",
              color: "white",
              minWidth: 110
            }}
            type="submit"
            disabled={formLoading}
          >
            {formLoading ? "Loading..." : "Get Matches"}
          </button>
        </form>
        <div style={{ color: "#6f6d94", fontSize: "0.98em", marginBottom: 19 }}>
          <span>Min. match strength:</span>
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            disabled={formLoading}
            style={{ marginLeft: 8, borderRadius: 5, padding: "0.12em 0.61em" }}
          >
            <option value={0.4}>Moderate (0.4+)</option>
            <option value={0.6}>Strong (0.6+)</option>
            <option value={0.8}>Very High (0.8+)</option>
          </select>
        </div>
        {error && (
          <div
            style={{
              color: "#bc1c33",
              background: "#fff4f4",
              borderRadius: 7,
              padding: "0.65em 1em",
              marginBottom: 18,
              fontWeight: 500,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}
        {loading && (
          <div style={{ margin: "2em 0", textAlign: "center" }}>
            Finding your best book matches...
          </div>
        )}
        {recommendations.length > 0 && (
          <>
            <div>
              {recommendations.map(renderRecommendation)}
            </div>
            <div style={{
              textAlign: "center", fontSize: "0.96em", color: "#654d73",
              marginTop: "1.3em"
            }}>
              Matched on: {interestArr.join(", ")}
            </div>
          </>
        )}
      </div>
    );
  }

  // -- Batch Recommendations UI (optional) --
  function renderBatchRecommendationsSection() {
    return (
      <div style={{ marginTop: 48 }}>
        <h3 style={{ color: "#2a4c71", marginBottom: 0 }}>Batch Recommendations (Advanced)</h3>
        <div style={{ color: "#65687a", fontSize: ".96em", marginBottom: 11 }}>
          Enter up to 10 of your favorite book IDs (comma or space separated) to find books similar to your collection.
        </div>
        <form
          style={{ display: "flex", gap: 17, marginBottom: 10, alignItems: "flex-end" }}
          onSubmit={handleBatchRecommendations}
        >
          <input
            type="text"
            value={batchBookIds}
            onChange={(e) => setBatchBookIds(e.target.value)}
            placeholder="E.g. 3, 22, 37, 44, ..."
            style={{
              flex: 2,
              fontSize: ".995em",
              borderRadius: 6,
              border: "1.4px solid var(--border-color)",
              padding: "0.5em 0.85em",
              minWidth: 160,
            }}
            aria-label="Book IDs for batch recs"
            disabled={batchLoading}
          />
          <button
            className="btn"
            style={{
              fontWeight: 700,
              fontSize: "1em",
              borderRadius: 8,
              padding: "0.55em 1.6em",
              minWidth: 110,
              background: "#2a5834",
              color: "white"
            }}
            disabled={batchLoading}
            type="submit"
          >
            {batchLoading ? "Finding..." : "Find Similar"}
          </button>
        </form>
        {batchError && (
          <div
            style={{
              color: "#bc1c33",
              background: "#fff4f4",
              borderRadius: 7,
              padding: "0.5em 1em",
              marginBottom: 14,
              fontWeight: 500,
              textAlign: "center",
            }}
          >
            {batchError}
          </div>
        )}
        {batchLoading && (
          <div style={{ margin: "1.7em 0", textAlign: "center" }}>
            Finding batch recommendations...
          </div>
        )}
        {batchRecs.length > 0 && (
          <div>
            {batchRecs.map(renderRecommendation)}
          </div>
        )}
      </div>
    );
  }

  // -- Swap Compatibility Section (optional/adv.) --
  function renderSwapCompatibilitySection() {
    return (
      <div style={{ marginTop: 48 }}>
        <h3 style={{ color: "#71384d", marginBottom: 0 }}>Swap Compatibility Analyzer</h3>
        <div style={{ color: "#726877", fontSize: ".98em", marginBottom: 10 }}>
          Compare two book IDs to see their swap match strength and semantic overlap.
        </div>
        <form
          style={{ display: "flex", gap: 11, marginBottom: 7, alignItems: "flex-end" }}
          onSubmit={handleAnalyzeCompatibility}
        >
          <input
            type="text"
            value={compatIds.offered}
            onChange={(e) => setCompatIds((prev) => ({ ...prev, offered: e.target.value }))}
            placeholder="Your Book ID"
            style={{
              width: 86,
              fontSize: ".98em",
              borderRadius: 6,
              border: "1.2px solid var(--border-color)",
              padding: "0.44em 0.7em",
            }}
            aria-label="Offered Book ID"
            disabled={compatLoading}
          />
          <span style={{fontSize: "1.2em", color: "#a181ad"}}>⇄</span>
          <input
            type="text"
            value={compatIds.requested}
            onChange={(e) => setCompatIds((prev) => ({ ...prev, requested: e.target.value }))}
            placeholder="Requested Book ID"
            style={{
              width: 86,
              fontSize: ".98em",
              borderRadius: 6,
              border: "1.2px solid var(--border-color)",
              padding: "0.44em 0.7em",
            }}
            aria-label="Requested Book ID"
            disabled={compatLoading}
          />
          <button
            className="btn"
            style={{
              fontWeight: 700,
              fontSize: ".98em",
              borderRadius: 7,
              padding: "0.43em 1.12em",
              minWidth: 92,
              background: "#844897",
              color: "white"
            }}
            disabled={compatLoading}
            type="submit"
          >
            {compatLoading ? "Analyzing..." : "Analyze"}
          </button>
        </form>
        {compatError && (
          <div
            style={{
              color: "#bc1c33",
              background: "#fff3fa",
              borderRadius: 6,
              padding: "0.48em 1em",
              marginBottom: 12,
              fontWeight: 500,
              textAlign: "center",
            }}
          >
            {compatError}
          </div>
        )}
        {compatLoading && (
          <div style={{ margin: "1em 0", textAlign: "center" }}>
            Analyzing swap compatibility...
          </div>
        )}
        {compatResult && (
          <div
            style={{
              marginTop: 11,
              background: "#f9faff",
              border: "1.1px solid #b4b3dd33",
              borderRadius: 7,
              padding: "1.05em 1.6em",
              fontSize: ".98em",
              color: "#463051"
            }}
          >
            <strong>Compatibility:</strong>{" "}
            <span style={{ color: "#8464ff", fontWeight: "bold" }}>
              {(compatResult.compatibility_score * 100).toFixed(2)}/100
            </span> <br />
            {compatResult.matching_themes && compatResult.matching_themes.length > 0 && (
              <div style={{
                margin: "0.37em 0 0.18em 0", fontSize: ".95em"
              }}>
                <em>Shared themes: </em>
                {compatResult.matching_themes.map((theme, idx) => (
                  <span key={idx} style={{
                    background: "#f2ebfb", color: "#604778", borderRadius: 5,
                    padding: "0.16em 0.57em", fontSize: ".92em", marginRight: 4, border: "1.2px solid #c2b1ef42"
                  }}>{theme}</span>
                ))}
              </div>
            )}
            <div
              style={{
                marginTop: ".5em",
                fontStyle: "italic",
                color: "#715199",
                background: "#efe9ff",
                borderRadius: 6,
                padding: "0.36em 1em"
              }}
            >
              {compatResult.explanation}
            </div>
            {compatResult.cached && (
              <div style={{marginTop: 5, fontSize:".88em", color:"#758d8e"}}>Result from cache</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ----------------------------------------------------------------------------
  // ----------------------- MAIN RENDER ----------------------------------------
  return (
    <div>
      {renderRecommendationsSection()}

      <hr style={{ margin: "3.2em 0 2.3em 0", border: "0px", borderTop: "1.5px dashed #e4e7f4" }} />

      {renderBatchRecommendationsSection()}

      <hr style={{ margin: "3.2em 0 2.3em 0", border: "0px", borderTop: "1.5px dashed #edd5fa" }} />

      {renderSwapCompatibilitySection()}
    </div>
  );
}

export default Recommendations;
