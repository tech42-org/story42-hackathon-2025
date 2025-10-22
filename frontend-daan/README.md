# 📖 Story42 - AI-Powered Audiobook Generator

> *The answer to life, the universe, and everything is 42. While we're here, why not learn and enjoy the journey?*

A sophisticated web application that enables users to create professional audiobooks through two distinct paths:
1. **AI-Powered Generation** - Automated story creation with AWS Bedrock
2. **Manual Story Builder** - Full creative control with branching narratives

Built for Tech42 Hackathon with AWS Bedrock, shadcn/ui, and React.

## ✨ Features

### AI-Powered Path
- 🤖 Complete story generation using AWS Bedrock (Claude v2)
- 🎙️ Automatic voice narration with AWS Polly
- 📊 Real-time progress tracking
- ⚡ Fast generation (under 5 minutes)
- 📥 Ready-to-download MP3 audiobook

### Manual Builder Path
- ✍️ Full creative control over story structure
- 🌳 Branching storylines and alternative paths
- 📚 Chapter and paragraph management
- 🎤 Multiple narrator voice options
- 🎨 Professional story builder interface

### UI/UX Highlights
- 🎨 Modern, polished interface with shadcn/ui
- 🔄 Smooth transitions and interactions
- 📱 Responsive design
- ♿ Accessible components
- 🎯 Clean, professional aesthetics

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## 🏗️ Tech Stack

- **Frontend**: React 19, Vite
- **UI Library**: shadcn/ui, Tailwind CSS
- **Icons**: Lucide React
- **AI**: AWS Bedrock (Claude v2)
- **Audio**: AWS Polly
- **State Management**: React Hooks

## 📁 Project Structure

```
story-generator/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   ├── LandingPage.jsx  # Path selection screen
│   │   └── AIPoweredFlow.jsx # AI generation flow
│   ├── services/
│   │   └── bedrockService.js # AWS Bedrock integration
│   ├── StoryGenerator.jsx   # Manual story params
│   ├── VoiceSelector.jsx    # Voice selection
│   ├── StoryBuilder.jsx     # Story editor
│   ├── App.jsx              # Main app component
│   └── index.css            # Global styles
├── AWS_INTEGRATION.md       # AWS setup guide
└── README.md
```

## 🎯 User Flows

### AI-Powered Generation Flow
1. User selects "AI-Powered Generation"
2. Enters story parameters (topic, genre, tone, audience)
3. System generates story with AWS Bedrock
4. Audio is synthesized with AWS Polly
5. User previews and downloads audiobook

### Manual Builder Flow
1. User selects "Manual Story Builder"
2. Defines story parameters
3. Selects narrator voice
4. Builds story structure with chapters/paragraphs
5. Creates branching storylines
6. Exports story for narration

## 🔧 Configuration

### Environment Variables

Create a `.env` file:

```env
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCESS_KEY_ID=your_access_key
VITE_AWS_SECRET_ACCESS_KEY=your_secret_key
```

### AWS Services Required
- AWS Bedrock (Claude v2 model access)
- AWS Polly (Neural voices)
- IAM permissions configured

See `AWS_INTEGRATION.md` for detailed setup instructions.

## 🎨 UI Components

Built with shadcn/ui for a polished, professional look:

- **Button** - Multiple variants (default, outline, ghost)
- **Card** - Content containers with headers
- **Input/Textarea** - Form inputs with validation
- **Badge** - Status indicators and labels
- **Label** - Form labels with accessibility

## 📊 Features in Detail

### Story Generation
- Supports multiple genres (fiction, non-fiction, children's, documentary)
- Adjustable length (short, medium, long)
- Customizable tone and style
- Target audience specification

### Voice Options
- 10+ professional AI voices
- Custom voice recording/upload
- Multiple accents and styles
- Neural voice synthesis

### Story Builder
- Hierarchical chapter structure
- Paragraph branching for interactive stories
- Real-time editing
- Export to multiple formats

## 🚀 Deployment

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

### Deploy to AWS Amplify
```bash
amplify init
amplify add hosting
amplify publish
```

## 📈 Performance

- ⚡ Fast load times with Vite
- 🎯 Code splitting and lazy loading
- 📦 Optimized bundle size
- 🔄 Efficient re-renders with React 19

## 🎬 Demo Mode

The app currently runs in demo mode with mock data. To enable full AWS integration:

1. Install AWS SDKs:
```bash
npm install @aws-sdk/client-bedrock-runtime @aws-sdk/client-polly
```

2. Configure environment variables
3. Update `bedrockService.js` with real AWS calls
4. Deploy backend API for credential security

## 🔐 Security Notes

⚠️ **Important**: Never expose AWS credentials in frontend code!

For production:
- Use backend API to handle AWS credentials
- Implement proper authentication
- Use AWS Cognito for user management
- Enable CORS appropriately

## 📝 TODO for Hackathon

- [x] Create landing page with path selection
- [x] Build AI-powered generation flow
- [x] Design manual story builder
- [x] Integrate shadcn/ui components
- [x] Add progress indicators
- [x] Create service layer for AWS
- [ ] Implement real AWS Bedrock integration
- [ ] Add audio generation with Polly
- [ ] Implement download functionality
- [ ] Deploy to production

## 🤝 Contributing

This is a hackathon project. Feedback and suggestions welcome!

## 📄 License

MIT License - feel free to use for your own projects!

## 🎉 Acknowledgments

- shadcn/ui for beautiful components
- AWS Bedrock team for amazing AI models
- Lucide for clean, modern icons
- Tailwind CSS for rapid styling

---

Built with ❤️ for the Tech42 Hackathon
