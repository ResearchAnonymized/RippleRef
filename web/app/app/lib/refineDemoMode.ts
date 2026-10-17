/** True for REFINE product demo — hides internal research UI in the web app. */
export function isRefineDemo(): boolean {
  return process.env.NEXT_PUBLIC_REFINE_DEMO === '1';
}
