import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ArrowLeft, User, Lock, Loader2, CheckCircle, Mail, Key, Copy, RefreshCw, Eye, EyeOff } from 'lucide-react';

/**
 * Account Settings Page
 * Allows users to view profile information and change password
 */
const AccountSettings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // API Key state
  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [apiKeyError, setApiKeyError] = useState('');
  const [apiKeySuccess, setApiKeySuccess] = useState('');

  /**
   * Get user email from Cognito user object
   */
  const getUserEmail = () => {
    if (!user) return 'Not available';
    return user.username || 'Not available';
  };

  /**
   * Load API key from localStorage on mount
   */
  useEffect(() => {
    const storedApiKey = localStorage.getItem('story42_api_key');
    if (storedApiKey) {
      setApiKey(storedApiKey);
      setApiKeyInput(storedApiKey);
    }
  }, []);

  /**
   * Save API key to localStorage
   */
  const handleSaveApiKey = async (e) => {
    e.preventDefault();
    setApiKeyError('');
    setApiKeySuccess('');

    if (!apiKeyInput.trim()) {
      setApiKeyError('API key cannot be empty');
      return;
    }

    setSavingApiKey(true);
    try {
      // Save to localStorage
      localStorage.setItem('story42_api_key', apiKeyInput.trim());
      setApiKey(apiKeyInput.trim());
      setApiKeySuccess('API key saved successfully!');
      setTimeout(() => setApiKeySuccess(''), 3000);
    } catch (err) {
      console.error('Failed to save API key:', err);
      setApiKeyError('Failed to save API key. Please try again.');
    } finally {
      setSavingApiKey(false);
    }
  };

  /**
   * Copy API key to clipboard
   */
  const handleCopyApiKey = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setApiKeyCopied(true);
      setTimeout(() => setApiKeyCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy API key:', err);
    }
  };

  /**
   * Validates password strength
   */
  const validatePassword = (pwd) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(pwd);
    const hasLowerCase = /[a-z]/.test(pwd);
    const hasNumbers = /\d/.test(pwd);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);

    if (pwd.length < minLength) {
      return 'Password must be at least 8 characters long.';
    }
    if (!hasUpperCase) {
      return 'Password must contain at least one uppercase letter.';
    }
    if (!hasLowerCase) {
      return 'Password must contain at least one lowercase letter.';
    }
    if (!hasNumbers) {
      return 'Password must contain at least one number.';
    }
    if (!hasSpecialChar) {
      return 'Password must contain at least one special character.';
    }
    return null;
  };

  /**
   * Handles password change
   */
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Validate passwords match
      if (newPassword !== confirmNewPassword) {
        setError('New passwords do not match.');
        setLoading(false);
        return;
      }

      // Validate new password strength
      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        setError(passwordError);
        setLoading(false);
        return;
      }

      // Cannot use the same password
      if (oldPassword === newPassword) {
        setError('New password must be different from old password.');
        setLoading(false);
        return;
      }

      // Change password using Cognito
      await new Promise((resolve, reject) => {
        if (!user) {
          reject(new Error('No user logged in'));
          return;
        }

        user.changePassword(oldPassword, newPassword, (err, result) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(result);
        });
      });

      setSuccess('Password changed successfully!');
      // Clear form
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      console.error('Password change error:', err);

      // Parse Cognito error messages
      let errorMessage = 'Failed to change password. Please try again.';
      if (err.message) {
        if (err.message.includes('Incorrect username or password')) {
          errorMessage = 'Current password is incorrect.';
        } else if (err.message.includes('InvalidPasswordException')) {
          errorMessage = 'New password does not meet requirements.';
        } else if (err.message.includes('LimitExceededException')) {
          errorMessage = 'Too many attempts. Please try again later.';
        } else {
          errorMessage = err.message;
        }
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-6 gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Account Settings</h1>
          <p className="text-muted-foreground">
            Manage your Story42 account preferences and security
          </p>
        </div>

        <div className="space-y-6">
          {/* Profile Information Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-black dark:bg-white flex items-center justify-center">
                  <User className="w-5 h-5 text-white dark:text-black" />
                </div>
                <div>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>Your account details</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <Mail className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Email Address</p>
                  <p className="text-base font-semibold">{getUserEmail()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <User className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Account Type</p>
                  <p className="text-base font-semibold">Story42 User</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* API Key Management Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-black dark:bg-white flex items-center justify-center">
                  <Key className="w-5 h-5 text-white dark:text-black" />
                </div>
                <div>
                  <CardTitle>API Key Configuration</CardTitle>
                  <CardDescription>Set your API key for Story42 services</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveApiKey} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="apiKey">Your API Key</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="apiKey"
                        type={showApiKey ? "text" : "password"}
                        placeholder="Enter your API key (e.g., tts-key)"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        className="font-mono pr-20"
                        disabled={savingApiKey}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="h-7 w-7 p-0"
                        >
                          {showApiKey ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                        {apiKey && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleCopyApiKey}
                            className="h-7 w-7 p-0"
                          >
                            {apiKeyCopied ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This key will be used for all API requests to Story42 services
                  </p>
                </div>

                {apiKey && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-green-800 dark:text-green-300">
                          API Key Active
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-400 mt-1 font-mono break-all">
                          {showApiKey ? apiKey : `${apiKey.substring(0, 10)}${'•'.repeat(Math.min(apiKey.length - 10, 20))}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {apiKeyError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400">{apiKeyError}</p>
                  </div>
                )}

                {apiKeySuccess && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <p className="text-sm text-green-600 dark:text-green-400">{apiKeySuccess}</p>
                  </div>
                )}

                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    <strong>Usage:</strong> This key will be included in API requests as <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-800 rounded text-xs">Authorization: Bearer YOUR_KEY</code>
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={savingApiKey || !apiKeyInput.trim()}
                >
                  {savingApiKey ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Key className="w-5 h-5 mr-2" />
                      Save API Key
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Password Change Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-black dark:bg-white flex items-center justify-center">
                  <Lock className="w-5 h-5 text-white dark:text-black" />
                </div>
                <div>
                  <CardTitle>Change Password</CardTitle>
                  <CardDescription>Update your account password</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="oldPassword">Current Password</Label>
                  <Input
                    id="oldPassword"
                    type="password"
                    placeholder="Enter current password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="current-password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">
                    Min 8 characters with uppercase, lowercase, number and special character
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
                  <Input
                    id="confirmNewPassword"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="new-password"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Changing Password...
                    </>
                  ) : (
                    'Change Password'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Account Actions */}
          <Card className="border-red-200 dark:border-red-800">
            <CardHeader>
              <CardTitle className="text-red-600 dark:text-red-400">Danger Zone</CardTitle>
              <CardDescription>Irreversible account actions</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Need to delete your account or have security concerns? Please contact your administrator.
              </p>
              <Button
                variant="outline"
                className="border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                disabled
              >
                Delete Account (Contact Admin)
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AccountSettings;

