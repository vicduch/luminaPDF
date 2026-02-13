const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID;

// Scopes for Drive API
// drive.file is cleaner, but drive.readonly is often needed for Picker to see all files
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

// Dynamic Script Loader
const loadScript = (src: string, onLoad: () => void) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = onLoad;
    document.body.appendChild(script);
};

export const initGoogleDrive = () => {
    return new Promise<void>((resolve, reject) => {
        if (gapiInited && gisInited) {
            resolve();
            return;
        }

        console.log("Initialisation des scripts Google...");

        const handleGapiLoad = () => {
            console.log("GAPI chargé, initialisation du client...");
            window.gapi.load('client:picker', {
                callback: async () => {
                    try {
                        await window.gapi.client.init({
                            apiKey: API_KEY,
                            discoveryDocs: DISCOVERY_DOCS,
                        });
                        gapiInited = true;
                        console.log("GAPI Client prêt.");
                        if (gisInited) resolve();
                    } catch (err) {
                        console.error("Erreur GAPI init:", err);
                        reject(err);
                    }
                },
                onerror: (err: any) => {
                    console.error("Erreur chargement Picker:", err);
                    reject(new Error("Échec du chargement de l'API Picker"));
                }
            });
        };

        const handleGisLoad = () => {
            console.log("GIS (Identity) chargé.");
            try {
                tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: '', // défini plus tard
                });
                gisInited = true;
                if (gapiInited) resolve();
            } catch (err) {
                console.error("Erreur GIS init:", err);
                reject(err);
            }
        };

        loadScript('https://apis.google.com/js/api.js', handleGapiLoad);
        loadScript('https://accounts.google.com/gsi/client', handleGisLoad);
    });
};

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    url: string; // Web Content Link or specific download link
    accessToken: string; // Needed to fetch the content
}

export const openDrivePicker = (): Promise<DriveFile | null> => {
    return new Promise(async (resolve, reject) => {
        if (!gapiInited || !gisInited) {
            await initGoogleDrive();
        }

        tokenClient.callback = async (response: any) => {
            if (response.error !== undefined) {
                reject(response);
                return;
            }
            createPicker(response.access_token);
        };

        // Trigger OAuth flow
        if (window.gapi.client.getToken() === null) {
            // Prompt the user to select a Google Account and ask for consent to share their data
            // when establishing a new session.
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            // Skip display of account chooser and consent dialog for an existing session.
            tokenClient.requestAccessToken({ prompt: '' });
        }

        function createPicker(accessToken: string) {
            const view = new window.google.picker.DocsView(window.google.picker.ViewId.PDFS);
            view.setMimeTypes('application/pdf');

            const picker = new window.google.picker.PickerBuilder()
                .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
                .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
                .setAppId(APP_ID)
                .setOAuthToken(accessToken)
                .addView(view)
                .addView(new window.google.picker.DocsUploadView())
                .setDeveloperKey(API_KEY)
                .setCallback((data: any) => {
                    if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
                        const doc = data[window.google.picker.Response.DOCUMENTS][0];
                        resolve({
                            id: doc[window.google.picker.Document.ID],
                            name: doc[window.google.picker.Document.NAME],
                            mimeType: doc[window.google.picker.Document.MIME_TYPE],
                            url: doc[window.google.picker.Document.URL],
                            accessToken: accessToken
                        });
                    } else if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.CANCEL) {
                        resolve(null);
                    }
                })
                .build();
            picker.setVisible(true);
        }
    });
};

export const downloadDriveFile = async (file: DriveFile): Promise<Blob> => {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
        headers: {
            'Authorization': `Bearer ${file.accessToken}`
        }
    });
    if (!response.ok) throw new Error("Failed to download file from Drive");
    return await response.blob();
};
