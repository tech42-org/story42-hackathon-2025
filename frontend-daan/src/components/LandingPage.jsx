import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { BookOpen, Sparkles, Wand2, PenTool, ArrowRight, LogOut, User, Settings, ChevronDown } from 'lucide-react';

const LandingPage = () => {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const menuRef = useRef(null);

  // Get user email from Cognito user object
  const getUserEmail = () => {
    if (!user) return 'User';
    return user.username || 'User';
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowSettingsMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Settings Menu */}
        <div className="flex justify-end mb-4">
          <div className="relative" ref={menuRef}>
            <Button
              variant="outline"
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              className="gap-2"
            >
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">{getUserEmail()}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showSettingsMenu ? 'rotate-180' : ''}`} />
            </Button>

            {/* Dropdown Menu */}
            {showSettingsMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
                {/* User Info Section */}
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-black dark:bg-white flex items-center justify-center">
                      <User className="w-5 h-5 text-white dark:text-black" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {getUserEmail()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Story42 Account
                      </p>
                    </div>
                  </div>
                </div>

                {/* Menu Items */}
                <div className="py-2">
                  <button
                    onClick={() => {
                      setShowSettingsMenu(false);
                      navigate('/stories');
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-3 text-sm"
                  >
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">My Stories</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      setShowSettingsMenu(false);
                      navigate('/settings');
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-3 text-sm"
                  >
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">Account Settings</span>
                  </button>
                </div>

                {/* Logout Section */}
                <div className="border-t border-slate-200 dark:border-slate-700 py-2">
                  <button
                    onClick={() => {
                      setShowSettingsMenu(false);
                      handleLogout();
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-3 text-sm"
                  >
                    <LogOut className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <span className="text-red-600 dark:text-red-400 font-medium">Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-3 mb-6">
            <BookOpen className="w-12 h-12 text-black dark:text-white drop-shadow-lg" />
            <h1 className="text-6xl font-bold text-foreground">
              Story42
            </h1>
          </div>
          <p className="text-xl text-foreground max-w-3xl mx-auto mb-4">
            Create captivating stories and audiobooks with AI-powered tools or craft them yourself
          </p>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto italic">
            The answer to life, the universe, and everything is <span className="font-bold text-primary">42</span>.<br />
            While we're here, why not learn and enjoy the journey?
          </p>
        </div>

        {/* Two Path Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* AI-Powered Path */}
          <Card 
            className="relative overflow-hidden cursor-pointer group hover:shadow-2xl transition-all flex flex-col"
            onClick={() => navigate('/ai-powered')}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-black/5 dark:bg-white/5 rounded-bl-full" />
            <CardHeader className="space-y-4 pb-4">
              <div className="w-16 h-16 rounded-2xl bg-black flex items-center justify-center group-hover:scale-110 transition-transform">
                <Wand2 className="w-8 h-8 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl mb-2">AI-Powered Generation</CardTitle>
                <CardDescription className="text-base">
                  Let our AI agents create a complete audiobook for you in minutes
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 flex flex-col flex-grow">
              <ul className="space-y-3 mb-6 flex-grow">
                <li className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-foreground">Full story generation with AWS Bedrock</span>
                </li>
                <li className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-foreground">Automatic voice synthesis & narration</span>
                </li>
                <li className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-foreground">Ready-to-download audiobook in minutes</span>
                </li>
                <li className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-foreground">Perfect for quick content creation</span>
                </li>
              </ul>
              <div className="space-y-4">
                <Button
                  className="w-full"
                  color="primary"
                  size="lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/ai-powered');
                  }}
                >
                  Generate with AI
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <div className="text-center">
                  <span className="inline-block px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs font-medium">
                    Fast & Easy
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Manual Builder Path */}
          <Card 
            className="relative overflow-hidden cursor-pointer group hover:shadow-2xl transition-all flex flex-col"
            onClick={() => navigate('/manual')}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-black/5 dark:bg-white/5 rounded-bl-full" />
            <CardHeader className="space-y-4 pb-4">
              <div className="w-16 h-16 rounded-2xl bg-black flex items-center justify-center group-hover:scale-110 transition-transform">
                <PenTool className="w-8 h-8 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl mb-2">Manual Story Builder</CardTitle>
                <CardDescription className="text-base">
                  Craft your story with full creative control and flexibility
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 flex flex-col flex-grow">
              <ul className="space-y-3 mb-6 flex-grow">
                <li className="flex items-start gap-3">
                  <BookOpen className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-foreground">Build chapters and paragraphs manually</span>
                </li>
                <li className="flex items-start gap-3">
                  <BookOpen className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-foreground">Create branching storylines & alternatives</span>
                </li>
                <li className="flex items-start gap-3">
                  <BookOpen className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-foreground">Choose from multiple narrator voices</span>
                </li>
                <li className="flex items-start gap-3">
                  <BookOpen className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-foreground">Full control over every detail</span>
                </li>
              </ul>
              <div className="space-y-4">
                <Button
                  className="w-full"
                  color="secondary"
                  size="lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/manual');
                  }}
                >
                  Build Manually
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <div className="text-center">
                  <span className="inline-block px-3 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs font-medium">
                    Full Control
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Story Library Link */}
        <div className="mt-12 text-center">
          <Card 
            className="max-w-2xl mx-auto bg-black/5 dark:bg-white/5 border-2 border-black/20 dark:border-white/20 cursor-pointer hover:shadow-xl transition-all"
            onClick={() => navigate('/stories')}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <h3 className="text-lg font-bold text-foreground mb-1">View Your Story Library</h3>
                  <p className="text-sm text-muted-foreground">Browse all your generated stories and read them</p>
                </div>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/stories');
                  }}
                  variant="outline"
                  size="lg"
                  className="shrink-0"
                >
                  View Stories
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Why Create Stories Section */}
        <div className="mt-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why Create Stories?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Stories are humanity's oldest and most powerful tool for learning, connection, and meaning
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-12">
            <Card variant="solid" className="border-2 hover:border-amber-300 transition-all">
              <CardHeader>
                <CardTitle className="text-xl">Learn Anything</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Transform complex topics into engaging narratives. History, science, philosophy - anything becomes memorable when told as a story.
                </p>
              </CardContent>
            </Card>

            <Card variant="solid" className="border-2 hover:border-yellow-300 transition-all">
              <CardHeader>
                <CardTitle className="text-xl">Spark Imagination</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Create adventures, mysteries, and worlds. Whether for yourself, your kids, or your audience - bring imagination to life.
                </p>
              </CardContent>
            </Card>

            <Card variant="solid" className="border-2 hover:border-orange-300 transition-all">
              <CardHeader>
                <CardTitle className="text-xl">Share Your Voice</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Turn your ideas into professional audiobooks. Perfect for content creators, educators, and storytellers of all kinds.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-8 max-w-4xl mx-auto border-2 border-black/20 dark:border-white/20">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-foreground mb-4">Life is the ultimate story</h3>
              <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                Since we know the answer is <span className="font-bold text-black dark:text-white">42</span>, let's focus on asking better questions.
                Stories help us explore ideas, preserve knowledge, and connect with others.
                They're how we make sense of the journey.
              </p>
              <div className="flex flex-wrap gap-4 justify-center text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  <span className="text-foreground">Learn while commuting</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  <span className="text-foreground">Bedtime stories for kids</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  <span className="text-foreground">Educational content</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  <span className="text-foreground">Creative expression</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tech Features Section */}
        <div className="mt-16 text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">Powered by Advanced AI</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Built with AWS Bedrock for professional-grade story generation and voice synthesis
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-amber-700 dark:text-amber-400 mb-2">10+</div>
              <div className="text-sm text-muted-foreground">Voice Options</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold mb-2">∞</div>
              <div className="text-sm text-muted-foreground">Story Genres</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600 dark:text-orange-400 mb-2">&lt;5min</div>
              <div className="text-sm text-muted-foreground">Generation Time</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold mb-2">HD</div>
              <div className="text-sm text-muted-foreground">Audio Quality</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
