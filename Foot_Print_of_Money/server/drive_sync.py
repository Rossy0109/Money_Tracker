import os
import io
import pickle
import base64
import json
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload
from google.oauth2.credentials import Credentials
import logging

SCOPES = ['https://www.googleapis.com/auth/drive.file']
TOKEN_FILE = 'token.pickle'
CREDENTIALS_FILE = 'credentials.json'
APP_FOLDER_NAME = 'MoneyTrackerData' # Specific folder for the app's data

class GoogleDriveSync:
    def __init__(self, db_path, logger):
        self.db_path = db_path
        self.logger = logger
        self.service = self._authenticate()
        self.app_folder_id = self._get_or_create_app_folder()

    def _authenticate(self):
        creds = None
        
        # Priority 1: Environment Variables (for CI/CD like GitHub Actions)
        env_token = os.environ.get('GOOGLE_DRIVE_TOKEN_DATA')
        env_creds = os.environ.get('GOOGLE_DRIVE_CREDENTIALS_DATA')
        
        if env_token:
            try:
                self.logger.info("Authenticating via GOOGLE_DRIVE_TOKEN_DATA env var.")
                token_data = base64.b64decode(env_token)
                creds = pickle.loads(token_data)
            except Exception as e:
                self.logger.error(f"Failed to load credentials from env var: {e}")

        # Priority 2: local token.pickle
        if not creds and os.path.exists(TOKEN_FILE):
            with open(TOKEN_FILE, 'rb') as token:
                creds = pickle.load(token)
        
        # If there are no (valid) credentials available, let the user log in.
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                # In non-interactive environments, we can't run the flow
                if os.environ.get('GITHUB_ACTIONS'):
                    self.logger.error("Non-interactive environment detected. Cannot run interactive auth flow.")
                    return None
                
                if env_creds:
                    try:
                        creds_dict = json.loads(base64.b64decode(env_creds))
                        flow = InstalledAppFlow.from_client_config(creds_dict, SCOPES)
                        creds = flow.run_local_server(port=0)
                    except Exception as e:
                        self.logger.error(f"Failed to load credentials from GOOGLE_DRIVE_CREDENTIALS_DATA: {e}")
                elif os.path.exists(CREDENTIALS_FILE):
                    flow = InstalledAppFlow.from_client_secrets_file(
                        CREDENTIALS_FILE, SCOPES)
                    creds = flow.run_local_server(port=0)
                else:
                    self.logger.error(f"{CREDENTIALS_FILE} not found. Please follow the instructions to create it.")
                    return None
            
            # Save the credentials locally if not in CI
            if not os.environ.get('GITHUB_ACTIONS'):
                with open(TOKEN_FILE, 'wb') as token:
                    pickle.dump(creds, token)
        
        if creds:
            return build('drive', 'v3', credentials=creds)
        return None

    def _get_or_create_app_folder(self):
        if not self.service:
            return None
        
        # Check if folder already exists
        results = self.service.files().list(
            q=f"name='{APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder'",
            spaces='drive',
            fields='files(id, name)'
        ).execute()
        items = results.get('files', [])

        if items:
            self.logger.info(f"Found existing app folder: {items[0]['name']} ({items[0]['id']})")
            return items[0]['id']
        else:
            self.logger.info(f"Creating new app folder: {APP_FOLDER_NAME}")
            file_metadata = {
                'name': APP_FOLDER_NAME,
                'mimeType': 'application/vnd.google-apps.folder'
            }
            file = self.service.files().create(body=file_metadata, fields='id').execute()
            self.logger.info(f"App folder created: {file.get('id')}")
            return file.get('id')

    def upload_file(self):
        if not self.service or not self.app_folder_id:
            self.logger.error("Google Drive service not initialized or app folder not found.")
            return False

        file_name = os.path.basename(self.db_path)
        
        # Check if file already exists in the app folder
        results = self.service.files().list(
            q=f"name='{file_name}' and '{self.app_folder_id}' in parents",
            spaces='drive',
            fields='files(id, name)'
        ).execute()
        items = results.get('files', [])

        mimetype = 'application/json' if file_name.endswith('.json') else 'application/x-sqlite3'
        media = MediaFileUpload(self.db_path, mimetype=mimetype, resumable=True)
        
        if items:
            file_id = items[0]['id']
            self.logger.info(f"Updating existing file: {file_name} ({file_id})")
            updated_file = self.service.files().update(
                fileId=file_id,
                media_body=media,
                fields='id, name'
            ).execute()
            self.logger.info(f"File updated: {updated_file.get('name')} ({updated_file.get('id')})")
        else:
            self.logger.info(f"Uploading new file: {file_name}")
            file_metadata = {
                'name': file_name,
                'parents': [self.app_folder_id]
            }
            uploaded_file = self.service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id, name'
            ).execute()
            self.logger.info(f"File uploaded: {uploaded_file.get('name')} ({uploaded_file.get('id')})")
        return True

    def download_file(self):
        if not self.service or not self.app_folder_id:
            self.logger.error("Google Drive service not initialized or app folder not found.")
            return False

        file_name = os.path.basename(self.db_path)
        
        results = self.service.files().list(
            q=f"name='{file_name}' and '{self.app_folder_id}' in parents",
            spaces='drive',
            fields='files(id, name)'
        ).execute()
        items = results.get('files', [])

        if not items:
            self.logger.warning(f"File '{file_name}' not found in Google Drive app folder.")
            return False
        
        file_id = items[0]['id']
        self.logger.info(f"Downloading file: {file_name} ({file_id})")

        request = self.service.files().get_media(fileId=file_id)
        fh = io.FileIO(self.db_path, 'wb')
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()
            self.logger.debug(f"Download {int(status.progress() * 100)}%.")
        self.logger.info(f"File '{file_name}' downloaded successfully.")
        return True

if __name__ == '__main__':
    # Example usage (for testing purposes)
    logging.basicConfig(level=logging.INFO)
    db_file = 'test_db.db'
    # Create a dummy db file for testing
    with open(db_file, 'w') as f:
        f.write("This is a dummy database file content.")

    drive_sync = GoogleDriveSync(db_file, logging.getLogger(__name__))
    if drive_sync.service:
        print("Google Drive service initialized.")
        if drive_sync.upload_db_file():
            print("DB file uploaded successfully.")
        if drive_sync.download_db_file():
            print("DB file downloaded successfully.")
    else:
        print("Failed to initialize Google Drive service. Check credentials.json.")
    
    os.remove(db_file) # Clean up dummy file
