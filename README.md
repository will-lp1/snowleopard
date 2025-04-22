# Snow Leopard - AI-Powered Writing Assistant

## What is Snow Leopard?
Snow Leopard is an intelligent writing environment designed to enhance your writing process with AI capabilities. It provides a seamless interface for document creation, editing, and collaboration, augmented by AI suggestions, content generation, and contextual chat.

## Why Snow Leopard?
Modern writing tools often lack deep AI integration or are closed-source. Snow Leopard aims to provide:

✅ **Open-Source & Extensible** – Transparent development and easy integration.
🦾 **AI Driven** - Enhance your writing with AI suggestions, generation, and chat context. Using Vercel's AI SDK. 
🔒 **Data Privacy Focused** – Your documents, your data. Designed with privacy in mind.
⚙️ **Self-Hosting Option** – Flexibility to run your own instance.
📄 **Rich Document Editing** – Supports various content types and formats.
🎨 **Modern UI & UX** – Clean, intuitive interface built with Shadcn UI and TailwindCSS.
🚀 **Developer-Friendly** – Built with Next.js and Drizzle for easy customization.

## Tech Stack
*   **Framework:** Next.js (App Router)
*   **Language:** TypeScript
*   **UI:** React, TailwindCSS, Shadcn UI
*   **Database:** PostgreSQL
*   **ORM:** Drizzle ORM
*   **Authentication:** Better Auth
*   **AI Integration:** [Specify your AI provider/library, e.g., Vercel AI SDK, OpenAI, Anthropic]


## Getting Started

### Prerequisites
*   **Node.js:** v18 or higher
*   **pnpm:** v8 or higher (Recommended package manager)
*   **Docker & Docker Compose:** v20 or higher

### Setup (Monorepo)

This project uses a monorepo structure managed by pnpm workspaces:
*   `apps/snow-leopard`: The Next.js web application.
*   `packages/db`: Shared database schema, client, and migration logic.

1.  **Clone the Repository & Install Dependencies (from Root)**
    ```bash
    git clone <your-repo-url> # Replace with your repository URL
    cd <your-repo-directory>
    pnpm install # Run from the root directory!
    ```
    This installs dependencies for all apps and packages and links them together.

2.  **Set Up Environment Variables (Two Files)**
    *   Copy the example environment files:
        ```bash
        # For the Next.js app
        cp apps/snow-leopard/.env.example apps/snow-leopard/.env
        
        # For Drizzle Kit migrations/generation
        cp packages/db/.env.example packages/db/.env 
        ```
    *   **Crucially, edit BOTH `.env` files** and ensure the `DATABASE_URL` matches the Docker Compose setup:
        ```dotenv
        # In BOTH apps/snow-leopard/.env AND packages/db/.env
        DATABASE_URL="postgresql://user:password@localhost:5432/cursorforwriting_db"
        ```
    *   Configure other necessary variables (like `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, AI provider keys, etc.) **only** in `apps/snow-leopard/.env` as described in the **Environment Variables** section below.

3.  **Start the Database (from Root)**
    *   Ensure Docker is running.
    *   Start the PostgreSQL database service defined in the root `docker-compose.yml`:
        ```bash
        docker compose up -d db
        ```
    *   Wait a few moments for the database container to initialize.

4.  **Apply Database Schema (from Root)**
    *   Push the schema defined in `packages/db/src/schema.ts` to the running database using the root script:
        ```bash
        pnpm db:push
        ```
    *   This command now filters to the `packages/db` package and runs its migration script.

5.  **Start the Development Server (from Root)**
    *   Start the Next.js app using the root script:
        ```bash
        pnpm dev
        ```
    *   This command now filters to the `apps/snow-leopard` package and runs its `dev` script.

6.  **Open in Browser**
    Visit [http://localhost:3000](http://localhost:3000)

### Environment Variables
Configure the following primarily in your **`apps/snow-leopard/.env`** file:

```dotenv
# Database (Required for App - Ensure this matches your docker-compose.yml & packages/db/.env)
DATABASE_URL="postgresql://user:password@localhost:5432/cursorforwriting_db"

# Better Auth (Required)
BETTER_AUTH_SECRET="" # Generate a strong secret (e.g., using `openssl rand -hex 32` or via the Better Auth website: https://www.better-auth.com/docs/installation)
BETTER_AUTH_URL="http://localhost:3000" # Base URL of your app

# Resend API (Required for Feedback - if using feedback feature)
RESEND_API_KEY="" # Your Resend API key

# AI Provider(s) (Required for AI features - add/remove as needed)

# Example for Groq:
# GROQ_API_KEY="" # Get your key at https://console.groq.com/keys


# Add other necessary environment variables for the app
```

**Note:** The `packages/db/.env` file only needs the `DATABASE_URL` for Drizzle Kit commands.

### Database

*   **Location:** Schema (`src/schema.ts`), Client (`src/index.ts`), and Migrations (`migrations/`) are located in the `packages/db` directory.
*   **Start Local DB:** `docker compose up -d db` (from root)
*   **Stop Local DB:** `docker compose down` (from root)
*   **Apply Schema/Migrations (from Root):** `pnpm db:push` (for simple schema sync based on `schema.ts`).
*   **For production or more complex changes, use migrations (run from Root):**
    *   Generate Migration Files: `pnpm db:generate` (Run after changing `packages/db/src/schema.ts`).
    *   Apply Migrations: `pnpm db:migrate` (Runs migration files in `packages/db/migrations`).
*   **DB Studio (Optional - from Root):** `pnpm db:studio` (Opens Drizzle Studio web UI connected via `packages/db/.env`).

### Authentication (Better Auth)

*   **Secret & URL:** Set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in your `apps/snow-leopard/.env` file.
*   **Adapter:** Configured in `apps/snow-leopard/lib/auth.ts` to use the Drizzle adapter, importing the `db` client from `@snow-leopard/db`.
*   **Schema:** Better Auth requires specific tables (`user`, `session`, `account`, `verification`). These should be defined in `packages/db/src/schema.ts`. Running `pnpm db:push` (from the root) uses Drizzle Kit within the `packages/db` context to push the combined schema to the database.

## Contributing

We welcome contributions! Please follow these steps:

1.  **Fork the repository.**
2.  **Create a new branch** for your feature or bug fix (`git checkout -b feature/your-feature-name` or `git checkout -b fix/your-bug-fix`).
3.  **Make your changes.** Ensure you adhere to the project's coding style (consider running linters/formatters if configured, e.g., `pnpm lint:fix`).
4.  **Commit your changes** with clear, descriptive commit messages.
5.  **Push your branch** to your fork (`git push origin feature/your-feature-name`).
6.  **Open a Pull Request** against the main repository branch.

Please provide a detailed description of your changes in the pull request. If you're addressing an existing issue, please link to it.

We also appreciate bug reports and feature requests. Please use the GitHub Issues tab for this.

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.
