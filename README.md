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
*   **Docker:** v20 or higher (For local PostgreSQL)

### Setup

1.  **Clone and Install**
    ```bash
    git clone <your-repo-url> # Replace with your repository URL
    cd <your-repo-directory>
    pnpm install
    ```

2.  **Set Up Environment Variables**
    *   Copy `.env.example` to `.env` in the project root: `cp .env.example .env`
    *   Configure the variables in `.env` (see **Environment Variables** section below).

3.  **Database Setup**
    *   Ensure Docker is running.
    *   Start the local PostgreSQL container:
    bash
        docker compose up -d
        ```
    *   Push the database schema (this applies migrations defined by Drizzle Kit based on `lib/db/schema.ts`):
        ```bash
        pnpm db:push # Assumes a script "db:push": "drizzle-kit push:pg"
        ```
        *Note: This might create the initial Better Auth tables defined in `lib/db/schema.ts` if they don't exist.* 
        *You may need to generate migrations (`pnpm db:generate`) and apply them (`pnpm db:migrate`) for more complex changes.* 

4.  **Start the Development Server**
    ```bash
    pnpm dev
    ```

5.  **Open in Browser**
    Visit [http://localhost:3000](http://localhost:3000)

### Environment Variables
Configure the following in your `.env` file:

```dotenv
# Database (Required)
# Example for local Docker setup
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/snow_leopard_db" # Replace with your DB name

# Better Auth (Required)
BETTER_AUTH_SECRET="" # Generate a strong secret (e.g., openssl rand -hex 32)
BETTER_AUTH_URL="http://localhost:3000" # Base URL of your app

# Resend API (Required for Feedback)
RESEND_API_KEY="" # Your Resend API key

# AI Provider (Example for OpenAI - replace/add as needed)
# OPENAI_API_KEY=""

# Add other necessary environment variables (e.g., specific AI model IDs)
```

### Database

*   **Start Local DB:** `docker compose up -d` (Requires `docker-compose.yml`)
*   **Connect String:** Ensure `DATABASE_URL` in `.env` points to your PostgreSQL instance.
*   **Apply Schema/Migrations:** `pnpm db:push` (for simple schema sync) or `pnpm db:migrate` (to apply generated migration files).
*   **Generate Migrations:** `pnpm db:generate` (Run after changing `lib/db/schema.ts`).
*   **DB Studio (Optional):** `pnpm db:studio` (Requires Drizzle Studio). 

*(Make sure you have corresponding scripts in your `package.json` for `db:push`, `db:generate`, `db:migrate`, `db:studio`)*

### Authentication (Better Auth)

*   **Secret:** Set a strong `BETTER_AUTH_SECRET` in your `.env` file.
*   **Adapter:** Configured in `lib/auth.ts` to use Drizzle with PostgreSQL.
*   **Schema:** Better Auth requires specific tables (`user`, `session`, `account`, `verification`). These are defined in `lib/db/schema.ts` and should be created by `pnpm db:push` or via migrations (like `0001_add_better_auth_tables.sql` if you use manual migrations). Check Better Auth documentation for details.

## Contributing

(Add contribution guidelines here if applicable)

## License

(Specify your project's license, e.g., MIT License)
