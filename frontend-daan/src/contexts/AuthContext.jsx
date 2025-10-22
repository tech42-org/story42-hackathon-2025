/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { CognitoUser, AuthenticationDetails, CognitoUserPool } from 'amazon-cognito-identity-js';

import { COGNITO_CLIENT_ID, COGNITO_USER_POOL_ID } from '../config';

const REFRESH_THRESHOLD_SECONDS = 60;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const poolData = useMemo(() => ({
    UserPoolId: COGNITO_USER_POOL_ID,
    ClientId: COGNITO_CLIENT_ID,
  }), []);
  const userPool = useMemo(() => new CognitoUserPool(poolData), [poolData]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState(null);

  const logout = () => {
    const currentUser = userPool.getCurrentUser();
    if (currentUser) {
      currentUser.signOut();
    }
    setUser(null);
    setIdToken(null);
    localStorage.removeItem('access_token');
  };

  const storeSessionTokens = (session, cognitoUser) => {
    if (cognitoUser) {
      setUser(cognitoUser);
    }

    if (!session) {
      setIdToken(null);
      localStorage.removeItem('access_token');
      return;
    }

    const token = session.getIdToken().getJwtToken();
    setIdToken(token);
    localStorage.setItem('access_token', token);
  };

  const getValidIdToken = () => {
    return new Promise((resolve, reject) => {
      const currentUser = userPool.getCurrentUser();
      if (!currentUser) {
        logout();
        reject(new Error('No authenticated user'));
        return;
      }

      currentUser.getSession((err, session) => {
        if (err || !session) {
          console.error('Failed to get current session:', err);
          logout();
          reject(err || new Error('Session unavailable'));
          return;
        }

        const token = session.getIdToken();
        const expiration = token.getExpiration();
        const now = Math.floor(Date.now() / 1000);

        if (expiration - now > REFRESH_THRESHOLD_SECONDS) {
          storeSessionTokens(session, currentUser);
          resolve(token.getJwtToken());
          return;
        }

        const refreshToken = session.getRefreshToken();
        currentUser.refreshSession(refreshToken, (refreshErr, refreshedSession) => {
          if (refreshErr || !refreshedSession) {
            console.error('Failed to refresh session:', refreshErr);
            logout();
            reject(refreshErr || new Error('Unable to refresh session'));
            return;
          }

          storeSessionTokens(refreshedSession, currentUser);
          resolve(refreshedSession.getIdToken().getJwtToken());
        });
      });
    });
  };

  // Check if user is already authenticated on mount
  useEffect(() => {
    const currentUser = userPool.getCurrentUser();
    if (currentUser) {
      currentUser.getSession((err, session) => {
        if (err) {
          console.error('Session error:', err);
          localStorage.removeItem('access_token');
          setLoading(false);
          return;
        }

        if (session.isValid()) {
          storeSessionTokens(session, currentUser);
        } else {
          localStorage.removeItem('access_token');
        }
        setLoading(false);
      });
    } else {
      localStorage.removeItem('access_token');
      setLoading(false);
    }
  }, [userPool]);

  const login = async (email, password) => {
    return new Promise((resolve, reject) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: email,
        Password: password,
      });

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (session) => {
          storeSessionTokens(session, cognitoUser);
          resolve(session);
        },
        onFailure: (err) => {
          reject(err);
        },
        newPasswordRequired: () => {
          // Handle new password required
          reject(new Error('New password required. Please contact admin.'));
        },
      });
    });
  };

  const signup = async (email, password, name) => {
    return new Promise((resolve, reject) => {
      const attributeList = [
        {
          Name: 'email',
          Value: email,
        },
        {
          Name: 'name',
          Value: name,
        },
      ];

      userPool.signUp(email, password, attributeList, null, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  };

  const confirmSignup = async (email, code) => {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.confirmRegistration(code, true, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  };

  const resendConfirmationCode = async (email) => {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.resendConfirmationCode((err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  };

  const value = {
    user,
    idToken,
    loading,
    login,
    signup,
    confirmSignup,
    resendConfirmationCode,
    logout,
    getValidIdToken,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
