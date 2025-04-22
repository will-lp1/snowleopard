# Snow Leopard - AI-Powered Writing Assistant

## What is Snow Leopard?
Snow Leopard is an intelligent writing environment designed to enhance your writing process with AI capabilities. It provides a seamless interface for document creation, editing, and collaboration, augmented by AI suggestions, content generation, and contextual chat.

## Why Snow Leopard?
Modern writing tools often lack deep AI integration or are closed-source. Snow Leopard aims to provide:

✅ **Open-Source & Extensible** – Transparent development and easy integration.
🦾 **AI Driven** - Enhance your writing with AI suggestions, generation, and chat context.
🔒 **Data Privacy Focused** – Your documents, your data. Designed with privacy in mind.
⚙️ **Self-Hosting Option** – Flexibility to run your own instance (details TBD).
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

### Setup

1.  **Clone the Repository & Install Dependencies**
    ```bash
    git clone <your-repo-url> # Replace with your repository URL
    cd <your-repo-directory>
    pnpm install
    ```

2.  **Set Up Environment Variables**
    *   Copy `.env.example` to `.env` in the project root:
        ```bash
        cp .env.example .env
        ```
    *   **Crucially, update `DATABASE_URL` in `.env`** to match the Docker Compose setup:
        ```dotenv
        # .env
        DATABASE_URL="postgresql://user:password@localhost:5432/cursorforwriting_db"
        ```
    *   Configure other necessary variables (like `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, AI provider keys, etc.) as described in the **Environment Variables** section below.

3.  **Start the Database**
    *   Ensure Docker is running.
    *   Start the PostgreSQL database service defined in `docker-compose.yml`:
        ```bash
        docker compose up -d db
        ```
    *   Wait a few moments for the database container to initialize.

4.  **Apply Database Schema**
    *   Push the schema defined in `lib/db/schema.ts` to the running database:
        ```bash
        pnpm db:push
        ```
    *   This command uses Drizzle Kit to synchronize your database schema with your code definition.

5.  **Start the Development Server**
    ```bash
    pnpm dev
    ```

6.  **Open in Browser**
    Visit [http://localhost:3000](http://localhost:3000)

### Environment Variables
Configure the following in your `.env` file:

```dotenv
# Database (Required - Ensure this matches your docker-compose.yml)
DATABASE_URL="postgresql://user:password@localhost:5432/cursorforwriting_db"

# Better Auth (Required)
BETTER_AUTH_SECRET="" # Generate a strong secret (e.g., using `openssl rand -hex 32` or via the Better Auth website: https://www.better-auth.com/docs/installation)
BETTER_AUTH_URL="http://localhost:3000" # Base URL of your app

# Resend API (Required for Feedback - if using feedback feature)
RESEND_API_KEY="" # Your Resend API key

# AI Provider(s) (Required for AI features - add/remove as needed)
# Example for OpenAI:
# OPENAI_API_KEY=""
# Example for Groq:
# GROQ_API_KEY="" # Get your key at https://console.groq.com/keys
# Example for Fireworks:
# FIREWORKS_API_KEY=""

# Add other necessary environment variables
```

### Database

*   **Start Local DB:** `docker compose up -d db`
*   **Stop Local DB:** `docker compose down`
*   **Connect String:** Ensure `DATABASE_URL` in `.env` points to your PostgreSQL instance.
*   **Apply Schema/Migrations:** `pnpm db:push` (for simple schema sync based on `schema.ts`).
*   **For production or more complex changes, use migrations:**
    *   Generate Migration Files: `pnpm db:generate` (Run after changing `lib/db/schema.ts`).
    *   Apply Migrations: `pnpm db:migrate` (Runs migration files).
*   **DB Studio (Optional):** `pnpm db:studio` (Opens Drizzle Studio web UI).

### Authentication (Better Auth)

*   **Secret:** Set a strong `BETTER_AUTH_SECRET` in your `.env` file (see Environment Variables section for generation methods).
*   **Adapter:** Configured in `lib/auth.ts` to use the Drizzle adapter with PostgreSQL.
*   **Schema:** Better Auth requires specific tables (`user`, `session`, `account`, `verification`). These are already defined in `lib/db/schema.ts`. Running `pnpm db:push` (as part of the setup steps) uses Drizzle Kit to push this combined schema (your app's tables + Better Auth tables) to the database. You do not need to use the `@better-auth/cli` for schema management when using the Drizzle adapter with a pre-defined schema like this. For more details, see the Better Auth documentation: [https://www.better-auth.com/docs/installation](https://www.better-auth.com/docs/installation)

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
