import React, { createContext, useContext } from "react";
import {
  ClerkProvider,
  useUser,
  useSession,
  useClerk,
  SignedIn,
  SignedOut,
  RedirectToSignIn,
  RedirectToSignUp,
  RedirectToUserProfile
} from "@clerk/clerk-react";

// PUBLIC_INTERFACE
const AuthContext = createContext(null);

/**
 * AuthProvider wraps the app with ClerkProvider, provides the Clerk publishable key,
 * and gives access to session, user, and token. Handles token retrieval for API usage.
 */
export function AuthProvider({ children }) {
  // Wrap children in ClerkProvider with frontend key
  const publishableKey = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error("Missing REACT_APP_CLERK_PUBLISHABLE_KEY in environment");
  }

  return (
    <ClerkProvider publishableKey={publishableKey} navigate={to => window.history.pushState(null, "", to)}>
      <SessionAuthProvider>{children}</SessionAuthProvider>
    </ClerkProvider>
  );
}

/**
 * SessionAuthProvider: Extracts user/session/token info from Clerk and provides it via AuthContext.
 */
function SessionAuthProvider({ children }) {
  const { user, isSignedIn, isLoaded } = useUser();
  const { session } = useSession();
  const clerk = useClerk();

  const [token, setToken] = React.useState(null);

  React.useEffect(() => {
    let ignore = false;
    async function fetchToken() {
      if (session && isSignedIn) {
        const newToken = await session.getToken();
        if (!ignore) setToken(newToken);
      } else {
        setToken(null);
      }
    }
    fetchToken();
    return () => { ignore = true; };
  }, [session, isSignedIn]);

  const value = {
    user,
    isSignedIn,
    isLoaded,
    token,
    clerk,
    signOut: clerk.signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// PUBLIC_INTERFACE
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// PUBLIC_INTERFACE
export function RequireAuth({ children, redirectTo = "/login" }) {
  /**
   * Gate for protected routes: renders children if signed in, else redirects.
   */
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return <div>Loading...</div>;
  return isSignedIn ? children : <RedirectToSignIn redirectUrl={redirectTo} />;
}

export {
  SignedIn,
  SignedOut,
  RedirectToSignIn,
  RedirectToSignUp,
  RedirectToUserProfile
};
