import { useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Label } from './components/ui/label';
import { ArrowLeft, ArrowRight, Users, Grid3x3, Clock } from 'lucide-react';
import Breadcrumb from './components/Breadcrumb';

const VoiceSelector = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const storyData = location.state?.storyData;
  const sessionId = params.sessionId;

  const [numberOfSpeakers, setNumberOfSpeakers] = useState(2);
  const [numberOfPanels, setNumberOfPanels] = useState(3);
  const [audioLength, setAudioLength] = useState(3);

  const handleContinue = () => {
    navigate(`/manual/${sessionId}/builder`, {
      state: {
        storyData,
        storyConfig: {
          numberOfSpeakers,
          numberOfPanels,
          audioLength,
          storyType: 'visual' // Always visual for now
        }
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Breadcrumb at top */}
      <div className="pt-6">
        <Breadcrumb
          steps={[
            { id: 'describe', label: 'Describe Story' },
            { id: 'voice', label: 'Story Configuration' },
            { id: 'generate', label: 'Review & Generate' },
            { id: 'assign', label: 'Assign Voices' }
          ]}
          currentStep={1}
        />
      </div>

      <div className="max-w-2xl mx-auto px-6 pb-6">
        <div className="mb-8">
          <Button variant="outline" onClick={() => navigate(`/manual/${sessionId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl">Story Configuration</CardTitle>
            <CardDescription>
              Configure your story structure
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-8">
            {/* Number of Speakers */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-black dark:bg-white flex items-center justify-center">
                  <Users className="w-6 h-6 text-white dark:text-black" />
                </div>
                <div>
                  <Label htmlFor="speakers" className="text-lg font-semibold">
                    Number of Speakers
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    How many different speakers/characters in your story?
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((num) => (
                  <button
                    key={num}
                    onClick={() => setNumberOfSpeakers(num)}
                    className={`h-16 rounded-lg border-2 font-semibold text-lg transition-all ${
                      numberOfSpeakers === num
                        ? 'border-black dark:border-white bg-black dark:bg-white text-white dark:text-black'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Number of Panels */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-black dark:bg-white flex items-center justify-center">
                  <Grid3x3 className="w-6 h-6 text-white dark:text-black" />
                </div>
                <div>
                  <Label htmlFor="panels" className="text-lg font-semibold">
                    Number of Panels
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    How many visual panels/sections for your story?
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="font-semibold text-2xl">{numberOfPanels}</span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNumberOfPanels(Math.max(3, numberOfPanels - 1))}
                      disabled={numberOfPanels <= 3}
                    >
                      -
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNumberOfPanels(Math.min(12, numberOfPanels + 1))}
                      disabled={numberOfPanels >= 3}
                    >
                      +
                    </Button>
                  </div>
                </div>
                <input
                  type="range"
                  min="3"
                  max="3"
                  value={numberOfPanels}
                  onChange={(e) => setNumberOfPanels(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
                <p className="text-xs text-muted-foreground text-center">
                  Range: 3
                </p>
              </div>
            </div>

            {/* Audio Length */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-black dark:bg-white flex items-center justify-center">
                  <Clock className="w-6 h-6 text-white dark:text-black" />
                </div>
                <div>
                  <Label htmlFor="audioLength" className="text-lg font-semibold">
                    Audio Length
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    How long should the audio narration be?
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="font-semibold text-2xl">{audioLength} min</span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAudioLength(Math.max(1, audioLength - 1))}
                      disabled={audioLength <= 1}
                    >
                      -
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAudioLength(Math.min(12, audioLength + 1))}
                      disabled={audioLength >= 12}
                    >
                      +
                    </Button>
                  </div>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={audioLength}
                  onChange={(e) => setAudioLength(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
                <p className="text-xs text-muted-foreground text-center">
                  Range: 1-5 minutes
                </p>
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button
                onClick={handleContinue}
                size="lg"
                className="w-full"
              >
                Continue to Story Builder
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VoiceSelector;
