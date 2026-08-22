const SECRET_OPTION_RE =
  /(--(?:base-token|app-secret|token))(?:\s*=\s*|\s+)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s"'`]+)/gi;
const APP_ID_RE = /\bcli_[0-9a-f]{16,}\b/gi;
const HOME_PATH_RE = /\/(?:home|Users)\/[^/\s"'`]+(?:\/[^\s"'`\])},;]*)?/g;

/** Remove credentials and host-specific paths from user-visible tool details. */
export function redactSensitiveText(value: string): string {
  return value
    .replace(SECRET_OPTION_RE, '$1 ****')
    .replace(APP_ID_RE, 'cli_****')
    .replace(HOME_PATH_RE, (path) => {
      const rest = path.replace(/^\/(?:home|Users)\/[^/]+/, '');
      return `~${rest}`;
    });
}
