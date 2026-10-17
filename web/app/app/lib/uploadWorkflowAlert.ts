import { ApiError } from '../api/client';

/** Messages after multipart/Git flows split upload vs assess vs plan failures. */
export function uploadWorkflowAlert(stage: string, error: unknown, workspaceId?: string): string {
  const parts = [`${stage} failed.`];
  if (error instanceof ApiError) {
    parts.push(error.message || `HTTP ${error.status}`);
    if (error.status === 403) {
      parts.push(
        'Often a CORS issue after changing the frontend port. Restart the backend (./start_daemon.sh restart) so it allows localhost:3001, or use the UI on port 4000.'
      );
    }
    if (error.status === 413) {
      parts.push(
        'Uploaded ZIP exceeds backend limit (100MB default). Try Git clone or increase multipart limits in application.yml.'
      );
    }
    if ((error.status === 400 || error.status === 500) && stage.includes('Assessment')) {
      parts.push(
        'Large projects can take several minutes. If upload succeeded, open the project from Projects — assessment may already be saved on the server.'
      );
    }
  } else if (error instanceof Error) {
    parts.push(error.message);
  }
  if (workspaceId) {
    parts.push(
      `Note: The workspace ${workspaceId} was already saved — open it under Projects or delete it there if unwanted (upload succeeded before this step failed).`
    );
  }
  return parts.join(' ');
}
