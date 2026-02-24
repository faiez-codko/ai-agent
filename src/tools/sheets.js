// sheetsService.js (ESM) — OAuth2 version (creates sheets in YOUR Drive quota)
import fs from "fs";
import path from "path";
import http from "http";
import { google } from "googleapis";
import open from "open"; // optional helper to auto-open consent URL

export class SheetsService {
  constructor({
    oauthClientPath,            // REQUIRED: path to oauth.client.json
    tokenPath,                  // optional: path to oauth.token.json
    scopes,
  }) {
    if (!oauthClientPath) throw new Error("oauthClientPath is required");

    this.oauthClientPath = oauthClientPath;
    this.tokenPath = tokenPath ?? path.join(process.cwd(), "oauth.token.json");

    this.scopes =
      scopes ?? [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
      ];

    this.oauth2Client = null;
    this._ready = false;

    this.sheets = null;
    this.drive = null;
  }

  // -------- OAuth internals --------

  _loadOAuthConfig() {
    const raw = fs.readFileSync(this.oauthClientPath, "utf-8");
    const json = JSON.parse(raw);
    const cfg = json.installed ?? json.web;
    if (!cfg) throw new Error("Invalid OAuth client JSON (missing installed/web)");

    const { client_id, client_secret, redirect_uris } = cfg;
    if (!client_id || !client_secret || !redirect_uris?.length) {
      throw new Error("OAuth client JSON missing client_id/client_secret/redirect_uris");
    }
    return { client_id, client_secret };
  }

  _loadTokenIfExists() {
    if (!fs.existsSync(this.tokenPath)) return null;
    return JSON.parse(fs.readFileSync(this.tokenPath, "utf-8"));
  }

  _saveToken(token) {
    fs.writeFileSync(this.tokenPath, JSON.stringify(token, null, 2), "utf-8");
  }

  async _interactiveLogin() {
    const { client_id, client_secret } = this._loadOAuthConfig();

    // Create OAuth client with a temporary local redirect
    const oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      "http://127.0.0.1:0/oauth2callback"
    );

    // Spin up a local server to capture the OAuth redirect with code
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, "http://127.0.0.1");
        if (reqUrl.pathname !== "/oauth2callback") {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }

        const code = reqUrl.searchParams.get("code");
        if (!code) {
          res.writeHead(400);
          res.end("Missing code");
          return;
        }

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        this._saveToken(tokens);

        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OAuth connected. You can close this tab.");

        this.oauth2Client = oauth2Client;
        this._ready = true;

        server.close();
      } catch (e) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("OAuth error: " + (e?.message || "unknown"));
        server.close();
      }
    });

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    // Set the actual redirect URI with chosen port
    oauth2Client.redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: this.scopes,
      prompt: "consent",
    });

    console.log("\nAuthorize this app by visiting:\n", authUrl, "\n");

    try {
      await open(authUrl);
    } catch {
      // If open isn't installed or fails, user can manually open the URL.
    }

    // Wait until server closes (after callback)
    await new Promise((resolve) => server.on("close", resolve));
  }

  async init() {
    if (this._ready) return;

    // 1) If token exists, use it
    const token = this._loadTokenIfExists();
    const { client_id, client_secret } = this._loadOAuthConfig();

    this.oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      // Redirect not needed if token already exists; still must be set to something valid.
      "http://127.0.0.1"
    );

    if (token) {
      this.oauth2Client.setCredentials(token);
      this._ready = true;
    } else {
      // 2) Otherwise interactive login (first run)
      await this._interactiveLogin();
    }

    // Bind APIs to OAuth client
    this.sheets = google.sheets({ version: "v4", auth: this.oauth2Client });
    this.drive = google.drive({ version: "v3", auth: this.oauth2Client });

    // Debug: confirm who you are (should be your Google email, not service account)
    const about = await this.drive.about.get({ fields: "user(emailAddress)" });
    console.log("Authenticated as:", about.data.user.emailAddress);
  }

  // -------- Your original CRUD (unchanged signatures) --------

  async createSheet({ title, tabs, folderId, shareWithEmails } = {}) {
    await this.init();

    if (!title) throw new Error("title is required");
    const res = await this.sheets.spreadsheets.create({
      requestBody: {
        properties: { title },
        sheets: (tabs?.length ? tabs : ["Sheet1"]).map((t) => ({
          properties: { title: t },
        })),
      },
    });

    const spreadsheetId = res.data.spreadsheetId;
    const spreadsheetUrl = res.data.spreadsheetUrl;

    // Move to folder (your Drive) if folderId provided
    if (folderId) {
      const file = await this.drive.files.get({
        fileId: spreadsheetId,
        fields: "parents",
      });
      const previousParents = (file.data.parents || []).join(",");
      await this.drive.files.update({
        fileId: spreadsheetId,
        addParents: folderId,
        removeParents: previousParents || undefined,
        fields: "id, parents",
      });
    }

    // Share if requested
    if (Array.isArray(shareWithEmails) && shareWithEmails.length) {
      await Promise.all(
        shareWithEmails.map((emailAddress) =>
          this.drive.permissions.create({
            fileId: spreadsheetId,
            requestBody: {
              type: "user",
              role: "writer",
              emailAddress,
            },
            sendNotificationEmail: false,
          })
        )
      );
    }

    return { spreadsheetId, spreadsheetUrl };
  }

  async listSheets({ folderId, pageSize = 20 } = {}) {
    await this.init();

    const qParts = [
      "mimeType='application/vnd.google-apps.spreadsheet'",
      "trashed=false",
    ];
    if (folderId) qParts.push(`'${folderId}' in parents`);

    const res = await this.drive.files.list({
      q: qParts.join(" and "),
      pageSize,
      fields: "files(id,name,webViewLink,modifiedTime)",
      orderBy: "modifiedTime desc",
    });

    return res.data.files || [];
  }

  async getSheetById(spreadsheetId) {
    await this.init();
    if (!spreadsheetId) throw new Error("spreadsheetId is required");

    const res = await this.sheets.spreadsheets.get({ spreadsheetId });
    return res.data;
  }

  async updateSheetById(spreadsheetId, props = {}) {
    await this.init();
    if (!spreadsheetId) throw new Error("spreadsheetId is required");

    const fields = [];
    const properties = {};

    if (props.title) (properties.title = props.title), fields.push("title");
    if (props.locale) (properties.locale = props.locale), fields.push("locale");
    if (props.timeZone) (properties.timeZone = props.timeZone), fields.push("timeZone");

    if (!fields.length) throw new Error("No updatable properties provided");

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSpreadsheetProperties: {
              properties,
              fields: fields.join(","),
            },
          },
        ],
      },
    });
  }

  async deleteSheetById(spreadsheetId) {
    await this.init();
    if (!spreadsheetId) throw new Error("spreadsheetId is required");

    await this.drive.files.delete({ fileId: spreadsheetId });
  }

  async listTabs(spreadsheetId) {
    await this.init();
    const data = await this.getSheetById(spreadsheetId);

    return (data.sheets || []).map((s) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
      index: s.properties.index,
    }));
  }

  async addTab(spreadsheetId, title) {
    await this.init();
    if (!title) throw new Error("title is required");

    const res = await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });

    const reply = res.data.replies?.[0]?.addSheet?.properties;
    return reply?.sheetId;
  }

  async renameTab(spreadsheetId, sheetId, newTitle) {
    await this.init();
    if (typeof sheetId !== "number") throw new Error("sheetId must be a number");
    if (!newTitle) throw new Error("newTitle is required");

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId, title: newTitle },
              fields: "title",
            },
          },
        ],
      },
    });
  }

  async deleteTab(spreadsheetId, sheetId) {
    await this.init();
    if (typeof sheetId !== "number") throw new Error("sheetId must be a number");

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ deleteSheet: { sheetId } }] },
    });
  }

  async getValues(spreadsheetId, range) {
    await this.init();

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    return res.data.values || [];
  }

  async updateValues(spreadsheetId, range, values, valueInputOption = "RAW") {
    await this.init();

    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: { values },
    });
  }

  async appendValues(spreadsheetId, range, values, valueInputOption = "RAW") {
    await this.init();

    await this.sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption,
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });
  }

  async clearValues(spreadsheetId, range) {
    await this.init();

    await this.sheets.spreadsheets.values.clear({
      spreadsheetId,
      range,
      requestBody: {},
    });
  }
}

export default SheetsService;