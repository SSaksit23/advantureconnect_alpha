# AdventureConnect Backend Security Improvements

## 1. Introduction

This document outlines the recent and critical security enhancements implemented in the AdventureConnect backend. The primary goal of these changes is to significantly improve the management of sensitive information, such as API keys and JWT secrets, thereby enhancing the overall security posture of our application. All developers must understand and adhere to these new practices.

## 2. Key Security Enhancements

The following core changes have been made to how we handle configuration and secrets:

### A. Centralized Environment Configuration (`backend/config/env.js`)

A new module, `backend/config/env.js`, has been introduced as the single source of truth for all environment-dependent configurations and sensitive variables.

*   It loads environment variables from a `.env` file (located in `backend/`) during development and testing.
*   It provides a structured way to access configuration values throughout the application.
*   It differentiates configurations for `development`, `test`, and `production` environments.

### B. Elimination of Hardcoded Fallbacks for Secrets

Previously, some parts of the code used hardcoded fallback values if an environment variable was not set. This posed a severe security risk, especially if such code was deployed to production.

**Before:**
```javascript
// Example from old backend/middleware/auth.js
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_jwt_secret_change_in_production';

// Example from old backend/services/tripCustomizationService.js
// 'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || 'demo-key',
```

**After:**
All secrets and critical API keys are now accessed exclusively through the `backend/config/env.js` module, which does not define insecure fallbacks for these values.

```javascript
// Example from new backend/middleware/auth.js
const env = require('../config/env');
const JWT_SECRET = env.JWT_SECRET; // No fallback here; value must be set in environment

// Example from new backend/services/tripCustomizationService.js
// 'X-RapidAPI-Key': env.getEnv('RAPIDAPI_KEY'), // Fetched via validated env config
```
This change ensures that the application will not run with insecure default secrets.

### C. Startup Validation for Critical Secrets

The `backend/config/env.js` module includes a `validateRequiredEnvVars()` function. This function is now called at the very beginning of the server startup process (`backend/server.js`).

*   **Action:** The application will **fail to start** if any of the predefined `REQUIRED_ENV_VARS` (e.g., `DATABASE_URL`, `JWT_SECRET`, `RAPIDAPI_KEY`, `FLIGHT_API_KEY`) are not set in the environment.
*   **Benefit:** This prevents accidental deployment or running of the application in an insecure or non-functional state.
*   **Production `JWT_SECRET` Check:** For the `production` environment, `validateRequiredEnvVars()` performs additional checks:
    *   Ensures `JWT_SECRET` is set.
    *   Ensures `JWT_SECRET` is at least 32 characters long.
    *   Ensures `JWT_SECRET` is not one of the known insecure default values.
    If these conditions are not met in production, the application will exit.

**Snippet from `backend/config/env.js` (`validateRequiredEnvVars` function):**
```javascript
function validateRequiredEnvVars() {
  const missingVars = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('ERROR: Missing required environment variables:');
    missingVars.forEach(varName => console.error(`  - ${varName}`));
    console.error('Please set these variables in your .env file or system environment and restart the application.');
    process.exit(1); // Exit with error code
  }

  if (NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      console.error('ERROR: In production, JWT_SECRET must be set and be at least 32 characters long.');
      process.exit(1);
    }
    // ... other production checks ...
  }
  console.log('Environment variables validated successfully.');
}
```

## 3. How Environment Variables Are Now Managed

### A. `.env` File for Local Development

*   For local development and testing, create a file named `.env` in the `backend/` directory.
*   This file will be automatically loaded by `dotenv` (as configured in `backend/config/env.js`) when `NODE_ENV` is not `production`.
*   **CRITICAL: The `.env` file MUST NOT be committed to version control (Git).** It should be listed in your `.gitignore` file.

### B. `.env.example` Template

*   A template file, `backend/.env.example`, is provided in the repository.
*   This file lists all the environment variables that the application might use, along with comments explaining them.
*   Developers should copy `backend/.env.example` to `backend/.env` and populate it with their specific local development or test values.

### C. Production Environment

*   In **production**, environment variables **must be set directly in the hosting environment**.
*   This could be through your deployment platform's interface (e.g., Railway, Heroku, AWS Elastic Beanstalk), Docker environment variables, Kubernetes secrets, or other secure mechanisms provided by your infrastructure.
*   The application in production will **not** load variables from a `.env` file.

## 4. Setting Up Your Local Environment Correctly

To configure your local development environment for the backend:

1.  **Navigate** to the `backend/` directory of the project.
2.  **Locate** the file named `.env.example`.
3.  **Copy** `.env.example` to a new file named `.env` within the same `backend/` directory.
    ```bash
    cp .env.example .env
    ```
4.  **Open** the newly created `.env` file in your text editor.
5.  **Fill in the values** for all required variables. At a minimum, you will need:
    *   `DATABASE_URL`: Your local or development PostgreSQL connection string.
        *   Example: `DATABASE_URL=postgresql://your_db_user:your_db_password@localhost:5432/adventureconnect_dev`
    *   `JWT_SECRET`: A strong, unique secret for signing JWTs.
        *   **Generate a strong secret** using Node.js:
            ```bash
            node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
            ```
        *   Copy the output and use it as your `JWT_SECRET`. Example: `JWT_SECRET=a1b2c3d4e5f6...yourgeneratedsecret...7x8y9z0`
    *   `RAPIDAPI_KEY`: Your key for RapidAPI services.
    *   `FLIGHT_API_KEY`: Your key for FlightAPI.io.
    *   Other keys as listed in `.env.example` if you intend to use those features.
6.  **Save** the `.env` file.
7.  **Ensure `.env` is ignored by Git.** Add `.env` to your project's root `.gitignore` file if it's not already there:
    ```gitignore
    # Local environment variables
    .env
    backend/.env
    frontend/.env
    ```

Your backend application should now be able to start using these local configurations.

## 5. Best Practices for Team Members

*   **NEVER commit your `.env` file or any file containing actual secrets/API keys to version control (Git).**
*   **Always use strong, unique, and randomly generated strings for secrets like `JWT_SECRET`.** Do not use common phrases or easily guessable values.
*   Store any shared API keys or credentials for development/staging environments securely (e.g., using a team password manager). Avoid sharing them insecurely via chat or email.
*   If you suspect a secret or API key has been compromised or accidentally exposed, report it to the team lead immediately so it can be revoked and rotated.
*   Be aware that the application will now **fail to start** if required environment variables are missing. This is a safety measure.
*   When adding a new feature that requires a new environment variable:
    1.  Add it to the `REQUIRED_ENV_VARS` array in `backend/config/env.js` if it's essential for the app to function.
    2.  Update `backend/.env.example` with the new variable and a comment explaining its purpose.
    3.  Communicate this change to the team.

## 6. Impact on Services

Various services and middleware within the backend now fetch their required configurations and secrets from the centralized `backend/config/env.js` module. For example:

*   `backend/middleware/auth.js` uses `env.JWT_SECRET`.
*   `backend/routes/auth.js` uses `env.JWT_SECRET` and `env.jwtExpiresIn`.
*   `backend/services/tripCustomizationService.js` uses `env.getEnv('RAPIDAPI_KEY')` and `env.getEnv('OPENWEATHER_API_KEY')`.

This ensures consistency and relies on the startup validation for the presence and security of these values.

## 7. JWT Token Revocation with Redis

While securing secrets is critical, session-level security is equally important.  
The latest update introduces **server-side JWT revocation** backed by **Redis** to
invalidate tokens decisively when a user logs out or when a credential must be
force-expired.

### 1. Implementation Overview

* A lightweight helper (`backend/services/redisService.js`) now exposes
  `addToBlacklist(token)` and `isBlacklisted(token)` utilities.
* `logout` route → calls `addToBlacklist`, storing the access token under
  `blacklist:jwt:<token>` with a TTL matching `JWT_EXPIRES_IN`.
* `authenticateToken` middleware → calls `isBlacklisted` **before** verifying the
  token signature. If the token is found, the request is rejected with `401`.

### 2. Security Benefits

* **Immediate revocation** – Users who log out (or whose credentials are
  compromised) cannot reuse the old token, even if it is technically unexpired.
* **Fine-grained control** – Admins can add a token to the blacklist at any time
  (e.g. after suspicious activity) without altering the signing secret.

### 3. Failure Modes & Fail-Open Strategy

Redis unavailability **must not** lock every user out:

| Scenario                        | Behaviour                        |
|---------------------------------|----------------------------------|
| Redis operational               | Normal blacklist checks occur    |
| Redis down / network partition  | Middleware logs error, **treats token as valid** (fail-open) so existing sessions continue to work |

The fail-open decision prevents a cache outage from becoming a global service
outage while still logging the anomaly for ops follow-up.

### 4. Comparison to Previous Implementation

| Aspect              | Old Behaviour                          | New Behaviour                           |
|---------------------|----------------------------------------|-----------------------------------------|
| Logout              | Client simply drops token              | Token stored in blacklist + client drop |
| Forced revocation   | Not possible without changing secret   | Add token to Redis blacklist            |
| Risk after leakage  | Token valid until expiry               | Token immediately invalid once flagged  |

### 5. API Response on Revoked Tokens

When a blacklisted token is presented:

```json
HTTP/1.1 401 Unauthorized
{
  "success": false,
  "message": "Token has been revoked. Please log in again."
}
```

The client should treat this identically to an expired token and redirect the
user to the login flow.

## 8. Conclusion

These enhancements significantly improve how AdventureConnect manages sensitive configurations. Adherence to these new practices by all team members is crucial for maintaining the security and integrity of our application. By centralizing configuration, eliminating hardcoded secrets, and enforcing startup validation, we reduce the risk of security vulnerabilities related to improper secret management.
