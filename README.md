# 🎓 LearnAI

Welcome to **LearnAI**, a state-of-the-art, full-stack, AI-powered education and tutoring platform. LearnAI bridges the gap between students and teachers by leveraging advanced AI models to provide curriculum-aligned tutoring, personalized study paths, homework assistance, and interactive quiz generation.

With a Next.js frontend and an integrated API routing system, LearnAI utilizes top-tier AI services including **Google Gemini**, **Azure OpenAI**, **ElevenLabs**, and **D-ID** to deliver a highly interactive, voice-enabled learning experience.

---

## 🚀 Key Features

### 🧑‍🎓 Student Experience
*   **AI Tutoring Hub**: Engage in a rich conversation with an AI tutor aligned with your school board, grade, and subject curriculum. Includes support for voice-based interactions (text-to-speech & speech-to-text) and animated virtual teacher avatars.
*   **Homework Assistant**: Snap or upload a photo of your homework. LearnAI analyzes the image and offers helpful hints and guided learning paths without just giving away the final answer.
*   **Interactive Quizzes**: Attempt dynamically generated quizzes aligned with specific curriculum units and topics, receive real-time answers, track misconceptions, and get post-quiz tutoring.

### 🧑‍🏫 Teacher Experience
*   **Teacher Dashboard**: Easily view and manage classes, review student performance metrics, and see targeted learning recommendations.
*   **Quiz Creator**: Create, customize, publish, and manage curriculum-aligned quizzes with AI-generated or custom questions.
*   **Tune Lab (AI Personalization)**: Tailor the system's AI persona. Configure the AI's teaching style, tone, and voice (including cloning voices via ElevenLabs).
*   **Insights Dashboard**: Dive deep into student analytics, review quiz attempts, and track class-wide misconceptions.

---

## 🛠️ Technology Stack

| Layer | Technology / Service | Description |
| :--- | :--- | :--- |
| **Framework** | Next.js (v16.3.1, App Router) | React server-side rendering, client-side UI, and API route handlers. |
| **Frontend UI** | React (v19.2.8) & TailwindCSS (v4) | Fluid, responsive layouts, modular component design, and elegant styles. |
| **Database & ORM** | PostgreSQL & Prisma ORM (v6.19.0) | Relational database modeling, query builder, migrations, and seeding. |
| **AI (Vision & Hinting)** | Google Gemini (`gemini-2.0-flash`) | Multimodal processing for analyzing homework photos and generating guided hints. |
| **AI (Chatbot Core)** | Azure OpenAI (Model Router) | Dynamic API routing to Azure models for system-aligned teacher conversational agents. |
| **Voice Services** | Azure Speech Services & ElevenLabs | High-fidelity speech-to-text (STT), multilingual text-to-speech (TTS), and voice cloning. |
| **Video Avatar** | D-ID Video API | Generating interactive talking teacher avatars. |
| **Asset Storage** | Cloudinary | Cloud-based hosting for user avatars and homework photos. |
| **Mail System** | Nodemailer | Transactional emails for email verification and OTP-based authentication. |

---

## 📁 Repository Structure

The codebase is organized into modular components. Here is an overview of the directory tree:

```
LearnAI/
├── .github/                 # CI/CD Workflows
│   └── workflows/           # Deployment configurations for Azure Static Web Apps
├── docs/                    # Architecture diagrams and documentation
│   └── learnai-architecture.png
└── web/                     # Next.js Full-Stack Application
    ├── prisma/              # Database schema and seed configuration
    │   ├── schema.prisma    # PostgreSQL database model definitions
    │   ├── seed.js          # Prepopulates subjects, boards, grades, and curricula
    │   └── sample_syllabus.json # Seeding data source
    ├── public/              # Static assets (images, SVGs, virtual board parts)
    ├── scripts/             # Auxiliary developer tools and speech tests
    └── src/                 # Application codebase
        ├── app/             # App Router layout and pages (Auth, Student, Teacher)
        ├── components/      # Reusable React components (insights, settings, quiz hub)
        ├── constants/       # Global frontend and backend constants
        ├── context/         # React context providers (AuthContext, UI contexts)
        ├── data/            # Static dataset helpers
        ├── legacy-pages/    # Core pages and dashboard layouts
        ├── lib/             # API services, wrappers, and third-party integrations
        │   ├── api.js       # Core API router and controllers
        │   ├── gemini.js    # Gemini vision and hint integration
        │   ├── did.js       # D-ID video generation integrations
        │   └── auth.js      # Password cryptography, JWT, and onboarding logic
        ├── prompts/         # Core system messages and prompting configurations for LLMs
        └── theme/           # Design system CSS rules
```

---

## 💾 Database Schema

The database consists of a rich relational structure managed by Prisma:

*   **`User`**: Manages credentials, roles (`student`/`teacher`), grades, boards, OTP status, and relationships to profiles.
*   **`TeacherProfile` / `StudentProfile`**: Captures role-specific metadata. Teachers configure teaching styles and voices, while students track grades, boards, and school affiliations.
*   **`Board` / `BoardGrade`**: Repositories of regional educational boards (e.g., CBSE, Cambridge, IB) and respective grade mappings.
*   **`Curriculum` / `CurriculumUnit` / `CurriculumUnitTopic`**: Hierarchical content trees storing unit-by-unit and topic-by-topic structures mapped to boards and subjects.
*   **`LearnTurn`**: Logs conversational chat interactions between students, teachers, and AI agents.
*   **`Quiz` / `QuizQuestion` / `QuizAttempt` / `QuizAttemptAnswer`**: Fully models quiz definitions, MCQ configurations, student responses, scores, and tutor explanation threads.
*   **`StudentLearningRec`**: Automatic curriculum-aligned learning recommendations generated based on quiz performance and misconceptions.

---

## ⚙️ Configuration & Environment Variables

To run the application, create a `.env` file inside the `web/` directory. Refer to `web/.env.example` for details:

```ini
# Database configuration
DATABASE_URL="postgresql://postgres:password@127.0.0.1:5432/v2holoroid"
AUTH_SECRET="your-development-secret-key"

# Google Gemini (Homework Vision & Hints)
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.0-flash"

# Azure OpenAI (Teacher System & Chatbot Engine)
AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com/openai/v1"
AZURE_OPENAI_API_KEY="your-azure-openai-key"
AZURE_OPENAI_DEPLOYMENT="your-deployment-name"

# Voice & TTS Settings
AZURE_SPEECH_TO_TEXT_ENDPOINT="your-azure-cognitive-endpoint"
AZURE_SPEECH_TO_TEXT_API_KEY="your-azure-stt-key"
AZURE_TEXT_TO_SPEECH_ENDPOINT="your-azure-cognitive-endpoint"
AZURE_TEXT_TO_SPEECH_API_KEY="your-azure-tts-key"

# Advanced Integrations
ELEVENLABS_API_KEY="your-elevenlabs-api-key"
D_ID_API_KEY="your-d-id-api-key"
CLOUDINARY_URL="cloudinary://api_key:api_secret@cloud_name"

# Optional SMTP Configuration (OTPs log to console if left empty)
MAIL_FROM_ADDRESS="hello@learnai.local"
MAIL_FROM_NAME="LearnAI"
```

---

## 🚀 Running the Project

### 1. Prerequisites
Ensure you have **Node.js (v18+)** and a running **PostgreSQL** database.

### 2. Setup Dependencies
From the repository root, install dependencies:
```bash
cd web
npm install
```

### 3. Database Initialization & Seeding
Deploy database schemas and seed the initial syllabus data (subjects, grades, curricula):
```bash
npm run db:setup
```

> [!NOTE]
> If your environment is configured for a production/remote PostgreSQL instance and needs to import custom datasets, you can run:
> `npm run db:setup:pg`

### 4. Start Development Server
Run the Next.js development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📝 CLI Reference & Package Scripts

All commands should be executed from the `web/` directory:

| Command | Description |
| :--- | :--- |
| `npm run dev` | Runs the Next.js dev server on port 3000 |
| `npm run build` | Compiles the production build (generates Prisma client first) |
| `npm run start` | Runs the compiled Next.js production build |
| `npm run db:push` | Pushes the local Prisma schema changes to the database |
| `npm run db:seed` | Runs the Prisma database seeder (`prisma/seed.js`) |
| `npm run db:setup` | Generates the Prisma client, runs schema push, and seeds the DB |
| `npm run db:import` | Runs custom Node importer to seed core models |
| `npm run lint` | Lints files with ESLint configurations |

---

## 🌐 Deployment
LearnAI is pre-configured with CI/CD pipelines via GitHub actions. Check out [`.github/workflows/`](./.github/workflows) to see automated deployment scripts targeting **Azure Static Web Apps**.

