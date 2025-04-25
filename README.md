# ❄️ Snow Leopard - AI-Powered Writing Assistant

## 🎯 What is Snow Leopard?
Snow Leopard is an intelligent writing environment designed to enhance your writing process with AI capabilities. It provides a seamless interface for document creation, editing, and collaboration, augmented by AI suggestions, content generation, and contextual chat.

## ✨ Why Snow Leopard?
Modern writing tools often lack deep AI integration or are closed-source. Snow Leopard aims to provide:

✅ **Open-Source & Extensible** – Transparent development and easy integration.
🦾 **AI Driven** - Enhance your writing with AI suggestions, generation, and chat context using the Vercel AI SDK.
🔒 **Data Privacy Focused** – Your documents, your data. Designed with privacy in mind.
⚙️ **Self-Hosting Option** – Flexibility to run your own instance.
📄 **Rich Document Editing** – Supports various content types and formats.
🎨 **Modern UI & UX** – Clean, intuitive interface built with Shadcn UI and TailwindCSS.
🚀 **Developer-Friendly** – Built with Next.js and Drizzle for easy customization.

---

## 🛠️ Tech Stack
*   **Framework:** Next.js (App Router)
*   **Language:** TypeScript
*   **UI:** React, TailwindCSS, Shadcn UI
*   **Database:** PostgreSQL
*   **ORM:** Drizzle ORM
*   **Authentication:** Better Auth
*   **AI Integration:** Vercel AI SDK (configurable for various providers like Groq, OpenAI, Anthropic, etc.)

---

## 🚀 Getting Started

### Prerequisites
Make sure you have the following installed:
*   **Node.js:** `v18` or higher
*   **pnpm:** `v8` or higher (Recommended package manager)
*   **Docker & Docker Compose:** `v20` or higher

### Setup (Monorepo)

This project uses a monorepo structure managed by pnpm workspaces:
*   `apps/snow-leopard`: The Next.js web application.
*   `packages/db`: Shared database schema, client, and migration logic.

Follow these steps **from the project root directory**:

1.  **Clone & Install Dependencies**
    ```bash
    git clone <your-repo-url> # Replace with your repository URL
    cd <your-repo-directory>
    pnpm install # Installs dependencies for all packages/apps
    ```

2.  **Create Database `.env` File**
    Copy the example environment file for the database package:
    ```bash
    cp packages/db/.env.example packages/db/.env
    ```

3.  **Create Application `.env` File**
    Copy the example environment file for the Next.js application:
    ```bash
    cp apps/snow-leopard/.env.example apps/snow-leopard/.env
    ```

4.  **Configure Environment Variables**
    *   Edit **BOTH** `.env` files:
        *   `packages/db/.env`
        *   `apps/snow-leopard/.env`
    *   Ensure the `DATABASE_URL` in **both files** matches the one used by Docker Compose (default below):
        ```dotenv
        # In BOTH apps/snow-leopard/.env AND packages/db/.env
        DATABASE_URL="postgresql://user:password@localhost:5432/cursorforwriting_db"
        ```
    *   Configure other necessary variables (like `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GROQ_API_KEY`) **only** in `apps/snow-leopard/.env`. See the **Environment Variables** section below for details.

5.  **Start the Database (using Docker)**
    *   Ensure Docker Desktop is running.
    *   Start the PostgreSQL service defined in `docker-compose.yml`:
        ```bash
        docker compose up -d
        ```
    *   *Wait a few moments for the database container to initialize.*

6.  **Apply Database Schema**
    *   Push the schema defined in `packages/db/src/schema.ts` to the running database:
        ```bash
        pnpm db:push
        ```

7.  **Start the Development Server**
    *   Start the Next.js application:
        ```bash
        pnpm dev
        ```

8.  **Open in Browser**
    *   Visit [`http://localhost:3000`](http://localhost:3000)

---

### Environment Variables
Configure the following primarily in your **`apps/snow-leopard/.env`** file:

```dotenv
# === Database ===
# (Required for App - Ensure this matches your docker-compose.yml & packages/db/.env)
DATABASE_URL="postgresql://user:password@localhost:5432/cursorforwriting_db"

# === Better Auth ===
# (Required)
BETTER_AUTH_SECRET="" # Generate a strong secret (e.g., `openssl rand -hex 32` or via https://www.better-auth.com/docs/installation)
BETTER_AUTH_URL="http://localhost:3000" # Base URL of your app

# === Feedback ===
# (Required for Feedback)s
DISCORD_WEBHOOK_URL="" 

# === AI Provider(s) ===
# (Required for AI features)
# Add API keys for the providers you want to use.
# These can be configured in apps/snow-leopard/lib/ai/providers.ts
# See Vercel AI SDK Docs for more providers: https://sdk.vercel.ai/providers/ai-sdk-providers

# Example for Groq:
GROQ_API_KEY="" # Get your key at https://console.groq.com/keys

# Example for OpenAI:
# OPENAI_API_KEY=""

# Example for Anthropic:
# ANTHROPIC_API_KEY=""
```

**Important Note:** The `packages/db/.env` file **only** needs the `DATABASE_URL` for Drizzle Kit commands (like `db:push`, `db:generate`, `db:migrate`, `db:studio`).

---

### 🗄️ Database Management (Drizzle ORM)

*   **Location:** Schema (`packages/db/src/schema.ts`), Client (`src/index.ts`), and Migrations (`migrations/`) are in `packages/db`.
*   **Commands (Run from Root):**
    *   Start Local DB: `docker compose up -d`
    *   Stop Local DB: `docker compose down`
    *   Apply Schema Changes (Simple Sync): `pnpm db:push`
    *   Generate Migration File (after schema changes): `pnpm db:generate`
    *   Apply Migrations: `pnpm db:migrate`
    *   Open DB Studio (Web UI): `pnpm db:studio`

---

### 🔐 Authentication (Better Auth)

*   **Configuration:** Set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in `apps/snow-leopard/.env`.
*   **Adapter:** Uses the Drizzle adapter, configured in `apps/snow-leopard/lib/auth.ts` (imports `db` from `@snow-leopard/db`).
*   **Schema:** Requires `user`, `session`, `account`, `verification` tables (defined in `packages/db/src/schema.ts`). `pnpm db:push` applies these.

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1.  **Fork** the repository.
2.  **Create a new branch** (`git checkout -b feature/your-feature` or `fix/your-bug-fix`).
4.  **Commit** your changes with clear messages.
5.  **Push** your branch to your fork.
6.  **Open a Pull Request** against the `main` branch.

Please provide a detailed description of your changes in the PR. Link to any relevant issues.

For bug reports and feature requests, please use GitHub Issues or the in-app feedback widget.

---

## 📜 License

This project is licensed under the **Apache License 2.0**. See the [LICENSE](LICENSE) file for details.
