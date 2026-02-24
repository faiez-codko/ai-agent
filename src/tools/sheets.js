// sheetsService.js (ESM)
import { google } from "googleapis";

export class SheetsService {
    constructor({ keyFile, scopes }) {
        if (!keyFile) throw new Error("keyFile is required");
        this.googleAuth = new google.auth.GoogleAuth({
            keyFile,
            scopes: scopes ?? [
                "https://www.googleapis.com/auth/spreadsheets",
                "https://www.googleapis.com/auth/drive",
            ],
        });


        this._client = null;
        this.sheets = null;
        this.drive = null;
    }
    async init() {
        if (this._client) return;

        this._client = await this.googleAuth.getClient();

        // IMPORTANT: bind googleapis to the resolved client
        this.sheets = google.sheets({ version: "v4", auth: this._client });
        this.drive = google.drive({ version: "v3", auth: this._client });

        // Debug: confirm who you are (service account email)
        const about = await this.drive.about.get({ fields: "user(emailAddress)" });
        console.log("Authenticated as:", about.data.user.emailAddress);
    }

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
        if (props.title) {
            properties.title = props.title;
            fields.push("title");
        }
        if (props.locale) {
            properties.locale = props.locale;
            fields.push("locale");
        }
        if (props.timeZone) {
            properties.timeZone = props.timeZone;
            fields.push("timeZone");
        }
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
            requestBody: {
                requests: [{ addSheet: { properties: { title } } }],
            },
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
            requestBody: {
                requests: [{ deleteSheet: { sheetId } }],
            },
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
