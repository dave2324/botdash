# BotDash Railway Deployment Guide

This guide details how to deploy the BotDash application (Backend + Frontend) to [Railway](https://railway.app/).


---

## Step 1: Set up Supabase Storage (For File Uploads)

1.  Go to [Supabase](https://supabase.com/) and create a new project.
2.  Once created, go to **Project Settings** (gear icon at the bottom left).
3.  In the Project Settings, look for the following sections (usually under **Configuration** or **API**):
4.  Here you will find:
    -   Under **Data API**, copy the `URL`. This is your `SUPABASE_URL`.
    -   Under **API keys**, you will see `anon` and `service_role`.
    -   Copy the `service_role` key. This is your `SUPABASE_SERVICE_ROLE_KEY`. **(Click "Reveal" to see it)**.

---

## Step 2: Create Railway Project & Database

1.  Log in to [Railway](https://railway.app/).
2.  Click **"New Project"** -> **"Provision PostgreSQL"**.
3.  This will create a new project with a PostgreSQL database.
4.  Click on the **PostgreSQL** card -> **Variables** tab.
5.  Copy the `DATABASE_URL` (You will need this for the Backend).

---

## Step 3: Deploy Backend Service

1.  In the same project, click **"New"** -> **"GitHub Repo"** -> Select your repository.
2.  Click the newly created service card -> **Settings** tab.
3.  Scroll down to **Root Directory** and change it to:
    ```
    /backend
    ```
    *(This tells Railway to run the code inside the backend folder)*
4.  Railway should automatically detect it as a Node.js app using [package.json](cci:7://file:///c:/Users/hp/Downloads/upworbot/botdash/package.json:0:0-0:0).
    -   **Start Command**: Validated as `npm start` (runs migrations + server).
5.  Go to the **Variables** tab. Add the following variables:

    | Variable Name | Value | Description |
    | :--- | :--- | :--- |
    | `DATABASE_URL` | *[Paste from Step 2]* | Connection to the DB. |
    | `BOT_TOKEN` | *[Your Telegram Bot Token]* | Get from @BotFather. |
    | `BOT_USERNAME` | *[Your Bot Username]* | No @ symbol. |
    | `DEFAULT_ADMIN_USERNAME`| `your_username` | Login for admin panel. |
    | `DEFAULT_ADMIN_PASSWORD`| `your_password` | Change this! |
    | `ADMIN_JWT_SECRET` | *[Random String]* | Long random string for security. |
    | `SUPABASE_URL` | *[From Step 1]* | For file uploads. |
    | `SUPABASE_SERVICE_ROLE_KEY` | *[From Step 1]* | For file uploads. |
    | `DISABLE_TELEGRAM_AUTH` | `true` | (Optional) Set `true` if you want to bypass Telegram auth for testing. |

6.  Railway will trigger a redeploy. Wait for it to become "Active".
7.  Go to the **Settings** tab -> **Networking** -> **Generate Domain**.
    -   Copy this URL (e.g., `backend-production.up.railway.app`). You need it for the Admin Panel.

---

## Step 4: Deploy Admin Panel (Frontend)

1.  In the same project, click **"New"** -> **"GitHub Repo"** -> Select your repository **AGAIN**. (This creates a second service).
2.  Click this new service card -> **Settings** tab.
3.  Change **Root Directory** to:
    ```
    /admin-panel
    ```
4.  Railway should detect it as a Next.js app.
5.  Go to the **Variables** tab. Add:

    | Variable Name | Value | Description |
    | :--- | :--- | :--- |
    | `NEXT_PUBLIC_API_URL` | `https://[YOUR_BACKEND_URL]` | The Backend URL from Step 2 (Start with `https://`). |

6.  Railway will trigger a deployment.
7.  Go to **Settings** -> **Networking** -> **Generate Domain**.
8.  Open this URL to see your deployed Admin Panel.

---