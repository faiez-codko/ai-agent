# 📄 Google Sheets + Drive OAuth Setup Guide

This guide explains how to configure Google Cloud Platform (GCP) and OAuth2 credentials to allow a Node.js application to:

* Create Google Sheets
* List Sheets
* Read / update Sheets
* Use your personal Drive storage quota (not service account)

This setup uses **OAuth2 (User Authentication)**.

---

# 1️⃣ Create a Google Cloud Project

1. Go to:
   [https://console.cloud.google.com/](https://console.cloud.google.com/)

2. Click **Select Project → New Project**

3. Name your project (e.g. `ai-agent`)

4. Click **Create**

---

# 2️⃣ Enable Required APIs

Inside your project:

1. Go to:
   **APIs & Services → Library**

2. Enable:

   * ✅ **Google Sheets API**
   * ✅ **Google Drive API**

Both must be enabled.

---

# 3️⃣ Configure OAuth Consent Screen

Go to:

**APIs & Services → OAuth consent screen**

### Choose User Type

* Select **External** (for personal Gmail use)
* Click **Create**

### Fill Required Fields

* App name: `ai-agent`
* User support email: your Gmail
* Developer contact email: your Gmail

Click **Save and Continue**

### Scopes

You do NOT need to manually add scopes here.
The app will request:

* `https://www.googleapis.com/auth/spreadsheets`
* `https://www.googleapis.com/auth/drive`

Click **Save and Continue**

### Test Users (Important)

If the app is in **Testing** mode:

* Scroll to **Test users**
* Click **Add users**
* Add your Gmail (e.g. `your@email.com`)
* Click **Save**

⚠ If you skip this, you will get:
`Error 403: access_denied`

---

# 4️⃣ Create OAuth Credentials

Go to:

**APIs & Services → Credentials**

Click:

**Create Credentials → OAuth client ID**

### Application type:

Choose:

> ✅ Desktop app

Click **Create**

Download the JSON file.

You’ll get something like:

```
client_secret_1234567890-abc123.apps.googleusercontent.com.json
```

---

# 5️⃣ Add Credentials to Your Project

Rename the file to:

```
oauth.client.json
```

run now:

```bash
ai-agent setup sheets --file ./oauth.client.json
```

---
# 6️⃣ First-Time Authentication

You will see:

```
Authorize this app by visiting:
https://accounts.google.com/...
```

A browser will open.

1. Select your Google account
2. Approve permissions

After approval:

* A file will be created:

  ```
  oauth.token.json
  ```

This stores:

* access token
* refresh token

Future runs will NOT require login.

---


---

# 9️⃣ Security Notes

Add to `.gitignore`:

```
oauth.client.json
oauth.token.json
```

Never commit these files.

---

# 🔄 How OAuth Works (Conceptually)

Unlike service accounts:

* Sheets are created under YOUR Drive
* Uses your storage quota
* Requires one-time browser approval
* Automatically refreshes tokens
* No storage quota errors

---
