# Guide: Options for Syncing Leaderboard Standings from Google Sheets

This guide outlines the three main approaches for syncing Google Sheets player rankings to the Next.js database. All three methods connect to the backend through the unified endpoint `/api/ranking/update` or work directly on the database.

---

## The Core API Gateway: `/api/ranking/update`

To enable n8n, Google Apps Script, or external scripts to update the database, we created a POST endpoint at `/api/ranking/update`. It requires an API header key `x-api-key` which must match the server's `N8N_API_KEY` environment variable.

### Endpoint Details
* **Method**: `POST`
* **URL**: `https://<your-domain>/api/ranking/update`
* **Headers**:
  * `Content-Type`: `application/json`
  * `x-api-key`: `YOUR_SECRET_API_KEY`
* **Body**: Array of ranking objects:
  ```json
  [
    {
      "rank": 1,
      "username": "PlayerOne",
      "email": "player1@example.com",
      "balance": 15000.50
    }
  ]
  ```

---

## Option 1: n8n Workflow (Recommended for Orchestration)

This is the standard n8n method. It is triggered by the UI button on the website and retrieves spreadsheet data.

```mermaid
graph LR
    A[UI Button / Next.js Action] --> B[n8n Webhook Node]
    B --> C[Google Sheets Node: Get row(s)]
    C --> C1[n8n Code Node: Format payload]
    C1 --> D[HTTP Request Node: Next.js API]
```

### 1. Webhook Node (Trigger)
* **Method**: `POST`
* **Path**: `sync-leaderboard`
* **Response Mode**: `When Last Node Finishes` (returns success status to the site button loader)

### 2. Google Sheets Node
* **Action**: `Get row(s) in sheet`
* **Spreadsheet/Document**: Select your leaderboard sheet.
* **Sheet**: e.g., `Sheet1`

### 3. HTTP Request Node
* **Method**: `POST`
* **URL**: `https://YOUR_DOMAIN/api/ranking/update`
* **Headers**: Add `x-api-key: {{ YOUR_SECRET_API_KEY }}`
* **Body Expression**:
  ```json
  {{
    $input.all().map(item => ({
      email: item.json.email,
      username: item.json.username,
      balance: parseFloat(item.json.balance),
      rank: parseInt(item.json.rank)
    }))
  }}
  ```

---

## Option 2: Google Apps Script (AppScript Direct Push)

Instead of running an external n8n server, you can write a script directly inside the Google Sheet. This allows admins to click a button inside the spreadsheet to push updates to the website.

### Setup Instructions
1. Open your Google Sheet.
2. Go to **Extensions** -> **Apps Script**.
3. Clear the default code and paste the following:

```javascript
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Xnite Standings')
      .addItem('Sync to Website', 'syncToWebsite')
      .addToUi();
}

function syncToWebsite() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    SpreadsheetApp.getUi().alert('No data found in the active sheet.');
    return;
  }
  
  var headers = data[0];
  var payload = [];
  
  var rankIdx = headers.indexOf('rank');
  var usernameIdx = headers.indexOf('username');
  var emailIdx = headers.indexOf('email');
  var balanceIdx = headers.indexOf('balance');
  
  if (rankIdx === -1 || usernameIdx === -1 || emailIdx === -1 || balanceIdx === -1) {
    SpreadsheetApp.getUi().alert('Error: Required headers (rank, username, email, balance) not found.');
    return;
  }
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[emailIdx]) continue;
    payload.push({
      rank: parseInt(row[rankIdx]),
      username: String(row[usernameIdx]),
      email: String(row[emailIdx]).trim().toLowerCase(),
      balance: parseFloat(row[balanceIdx]) || 0
    });
  }
  
  // Update with your production server details
  var NEXTJS_API_URL = "https://YOUR_NEXTJS_APP_DOMAIN/api/ranking/update";
  var API_KEY = "your-super-secret-shared-api-key"; 
  
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': API_KEY
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(NEXTJS_API_URL, options);
    var responseCode = response.getResponseCode();
    var responseBody = response.getContentText();
    
    if (responseCode === 200) {
      SpreadsheetApp.getUi().alert('Success! Leaderboard updated with ' + payload.length + ' players.');
    } else {
      SpreadsheetApp.getUi().alert('Error (' + responseCode + '): ' + responseBody);
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert('Network Error: ' + e.toString());
  }
}
```
4. Save the project and refresh your Google Sheet. You will see a new top-level menu item **Xnite Standings** -> **Sync to Website**.

---

## Option 3: TypeScript Node Script (Cron/CLI Sync)

If your tech lead wanted a CLI script inside the Next.js repository that pulls the Google Sheet data directly via Node.js, you can use the official `googleapis` NPM module.

### 1. Install Dependencies
Run in your frontend terminal:
```bash
npm install googleapis dotenv
```

### 2. Script Implementation (`scripts/sync-rankings.ts`)
Create a typescript file in a scripts folder:

```typescript
import { google } from "googleapis";
import { prisma } from "../src/lib/db";
import dotenv from "dotenv";

dotenv.config();

async function syncGoogleSheets() {
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const range = "Sheet1!A2:D"; // Range excluding the headers
    
    if (!spreadsheetId) {
      throw new Error("GOOGLE_SPREADSHEET_ID is not configured in .env");
    }

    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }
    });

    const sheets = google.sheets({ version: "v4", auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log("No data found in Google Sheet.");
      return;
    }

    const rankings = rows.map((row) => ({
      rank: parseInt(row[0]),
      username: row[1],
      email: row[2].trim().toLowerCase(),
      balance: parseFloat(row[3]),
    }));

    // Perform atomic transaction replacement in PostgreSQL
    await prisma.$transaction([
      prisma.ranking.deleteMany({}),
      prisma.ranking.createMany({
        data: rankings,
      }),
    ]);

    console.log(`Success! Synchronized ${rankings.length} rankings from Google Sheets.`);
  } catch (error) {
    console.error("Error synchronizing Google Sheets rankings:", error);
  }
}

syncGoogleSheets();
```

### 3. Running the Script
Add a script runner command or compile/execute it using:
```bash
npx tsx scripts/sync-rankings.ts
```
