# Meds24 Deployment Guide (Render)

Meds24 is configured for seamless deployment on Render.

## Deploying to Render via Blueprint (`render.yaml`)

1. Push your repository to GitHub.
2. In the Render Dashboard, click **New** -> **Blueprint**.
3. Connect your GitHub repository containing `render.yaml`.
4. Render will automatically provision:
   - A PostgreSQL database instance (`meds24-db`).
   - A Node.js web service (`meds24-app`) running `npm run build` and `npm run start`.
5. Configure environment variables in Render dashboard (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBAPP_URL`).
