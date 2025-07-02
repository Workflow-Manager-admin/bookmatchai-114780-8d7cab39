//
// BookSwap+ API Client (uses Axios)
// Handles: Clerk JWT injection, error handling, and methods for books, swap offers, recommendations, and profile.
//

import axios from "axios";

// Dependency: Clerk must be set up and AuthProvider used to wrap the app.
// The client expects Clerk to be available via globalThis.Clerk or via window.Clerk (set by ClerkProvider)
// or use an explicit current session token (see below).

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8000";

// Helper: Get Clerk JWT from session (returns Promise<string|null>)
async function getClerkJwt() {
  // Clerk recommends getting the token from the session object
  // This expects window.Clerk to be initialized, otherwise throws
  if (
    window.Clerk &&
    typeof window.Clerk.session === "object" &&
    typeof window.Clerk.session.getToken === "function"
  ) {
    // Will resolve to null if no token present
    return await window.Clerk.session.getToken();
  }
  // fallback: try CLERK injected global
  if (
    globalThis.Clerk &&
    typeof globalThis.Clerk.session === "object" &&
    typeof globalThis.Clerk.session.getToken === "function"
  ) {
    return await globalThis.Clerk.session.getToken();
  }
  return null;
}

// Axios instance for all API calls
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

// Request interceptor: Attach Clerk JWT to all requests (if available)
api.interceptors.request.use(
  async (config) => {
    // Only attach the Authorization header for requests that require it (almost all except public listing)
    // If already provided by the caller, do not overwrite
    if (!config.headers["Authorization"]) {
      // Try to get token
      const jwt = await getClerkJwt();
      if (jwt) {
        config.headers["Authorization"] = `Bearer ${jwt}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Central (catch-all) error handler — can be expanded for notifications or logging
function handleApiError(error) {
  if (error.response) {
    // Backend responded with an error
    const { status, data } = error.response;
    let message = "An unknown API error occurred.";
    if (status === 401) {
      message = "You are not authenticated. Please sign in.";
    } else if (status === 403) {
      message = "You do not have permission to perform this action.";
    } else if (status === 404) {
      message = "Resource not found.";
    } else if (data && data.detail) {
      message = data.detail;
    }
    // Optionally: Add notification/toast here
    throw Object.assign(new Error(message), { status, data });
  } else if (error.request) {
    throw new Error("No response from server. Please check your network connection.");
  } else {
    throw new Error(error.message || "Unknown client error occurred.");
  }
}

// -------- PUBLIC INTERFACE --------

// PUBLIC_INTERFACE
export const BookSwapApiClient = {
  //
  // ----- BOOKS -----
  //
  // PUBLIC_INTERFACE
  async listBooks({ page = 1, limit = 10, search = "", condition = "" } = {}) {
    /**
     * Lists books with pagination, filtering, and search.
     * Public endpoint.
     */
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (condition) params.condition = condition;
      const resp = await api.get("/books", { params });
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  // PUBLIC_INTERFACE
  async getBook(bookId) {
    /**
     * Get a single book by its ID. Public endpoint.
     */
    try {
      const resp = await api.get(`/books/${bookId}`);
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  // PUBLIC_INTERFACE
  async createBook(book) {
    /**
     * Create a new book listing. Requires auth.
     * @param {object} book - {title, author, description, condition}
     */
    try {
      const resp = await api.post(`/books`, book);
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  // PUBLIC_INTERFACE
  async updateBook(bookId, bookPatch) {
    /**
     * Update a book by ID.
     * @param {number} bookId
     * @param {object} bookPatch - Partial fields to update.
     */
    try {
      const resp = await api.patch(`/books/${bookId}`, bookPatch);
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  // PUBLIC_INTERFACE
  async deleteBook(bookId) {
    /**
     * Delete a book. Requires auth/ownership.
     */
    try {
      await api.delete(`/books/${bookId}`);
      return true;
    } catch (error) {
      handleApiError(error);
    }
  },

  // PUBLIC_INTERFACE
  async myBooks() {
    /**
     * List books owned by the current user.
     * Requires authentication.
     */
    try {
      const resp = await api.get(`/books/my`);
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  //
  // ----- SWAP OFFERS -----
  //

  // PUBLIC_INTERFACE
  async listSentOffers() {
    /**
     * List swap offers sent by the current user.
     */
    try {
      const resp = await api.get(`/swap-offers/sent`);
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  // PUBLIC_INTERFACE
  async listReceivedOffers() {
    /**
     * List swap offers received by the current user.
     */
    try {
      const resp = await api.get(`/swap-offers/received`);
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  // PUBLIC_INTERFACE
  async getSwapOffer(offerId) {
    /**
     * Get details about a swap offer.
     */
    try {
      const resp = await api.get(`/swap-offers/${offerId}`);
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  // PUBLIC_INTERFACE
  async createSwapOffer({ offered_book_id, requested_book_id }) {
    /**
     * Create a swap offer.
     */
    try {
      const resp = await api.post(`/swap-offers`, { offered_book_id, requested_book_id });
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  // PUBLIC_INTERFACE
  async updateSwapOffer(offerId, updateFields) {
    /**
     * Update the status of a swap offer (e.g., accept, reject, complete).
     */
    try {
      const resp = await api.patch(`/swap-offers/${offerId}`, updateFields);
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  // PUBLIC_INTERFACE
  async deleteSwapOffer(offerId) {
    /**
     * Delete a swap offer (only if sender and not accepted).
     */
    try {
      await api.delete(`/swap-offers/${offerId}`);
      return true;
    } catch (error) {
      handleApiError(error);
    }
  },

  //
  // ----- PROFILE -----
  //

  // PUBLIC_INTERFACE
  async getMyProfile() {
    /**
     * Get the authenticated user's profile info.
     */
    try {
      const resp = await api.get(`/profiles/me`);
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  // PUBLIC_INTERFACE
  async updateMyProfile(updateFields) {
    /**
     * Update the authenticated user's profile (username etc).
     */
    try {
      const resp = await api.patch(`/profiles/me`, updateFields);
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  //
  // ----- SEMANTIC / RECOMMENDATIONS -----
  //

  // PUBLIC_INTERFACE
  async getBookSemanticTags(bookId) {
    /**
     * Retrieve semantic tags for a book (LLM generated).
     */
    try {
      const resp = await api.get(`/semantic/book-tags/${bookId}`);
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  // PUBLIC_INTERFACE
  async getRecommendations({ interests, limit = 10, min_score = 0.4 }) {
    /**
     * Get recommendations based on user interests (semantic matching).
     * @param {object} param0
     * @returns List of recommended books
     */
    try {
      const resp = await api.post(
        `/semantic/recommendations`,
        { interests },
        { params: { limit, min_score } }
      );
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  // PUBLIC_INTERFACE
  async analyzeSwapCompatibility({ offered_book_id, requested_book_id }) {
    /**
     * Get semantic compatibility for a swap between two books.
     */
    try {
      const resp = await api.get(
        `/semantic/swap-compatibility/${offered_book_id}/${requested_book_id}`
      );
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  // PUBLIC_INTERFACE
  async batchRecommendationsForBooks(bookIds, limit_per_book = 5, min_score = 0.5) {
    /**
     * Get batch recommendations for multiple books.
     */
    try {
      const resp = await api.post(
        `/semantic/batch-recommendations`,
        null,
        {
          params: {
            book_ids: bookIds,
            limit_per_book,
            min_score,
          },
        }
      );
      return resp.data;
    } catch (error) {
      handleApiError(error);
    }
  },
};

// Helper: for non-react/test use cases
export default BookSwapApiClient;
