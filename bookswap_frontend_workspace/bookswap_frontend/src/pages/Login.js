import React from "react";
import {
  SignedIn,
  SignedOut,
  RedirectToUserProfile
} from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";
import { SignIn, SignUp } from "@clerk/clerk-react";

// PUBLIC_INTERFACE
function Login() {
  /**
   * Clerk authentication page: sign in, sign up, or show "already signed in".
   * Uses Clerk SignIn and SignUp components with toggling.
   */
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "signin";

  return (
    <div style={{ maxWidth: 400, margin: "2rem auto" }}>
      <SignedIn>
        {/* If already signed in, redirect to profile/manage page */}
        <RedirectToUserProfile />
      </SignedIn>
      <SignedOut>
        {mode === "signup" ? (
          <>
            <SignUp routing="hash" />
            <div style={{ marginTop: "1rem", textAlign: "center" }}>
              Already have an account?{" "}
              <a href="/login?mode=signin">Sign in</a>
            </div>
          </>
        ) : (
          <>
            <SignIn routing="hash" />
            <div style={{ marginTop: "1rem", textAlign: "center" }}>
              New here?{" "}
              <a href="/login?mode=signup">Create an account</a>
            </div>
          </>
        )}
      </SignedOut>
    </div>
  );
}

export default Login;
