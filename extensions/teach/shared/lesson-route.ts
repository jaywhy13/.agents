/**
 * Every lesson address carries the token in its path: `/t/<token>/...`.
 *
 * The token used to travel in a cookie, but a cookie set on `127.0.0.1` is sent to
 * every other program listening on `127.0.0.1`, whatever port it uses, because
 * cookies do not separate ports. Putting the token in the path keeps it inside the
 * lesson's own addresses, and the page's own links are relative, so they stay
 * inside the token route without the page ever handling the token itself.
 */
export const LESSON_ROUTE_PREFIX = "/t";

export interface TokenRoute {
  /** The token as it appeared in the path. It still has to be checked. */
  readonly token: string;
  /** The path the lesson page asked for, with the token route taken off. */
  readonly lessonPath: string;
  /** True for `/t/<token>`, which must become `/t/<token>/` before it is served. */
  readonly needsTrailingSlash: boolean;
}

/** Builds a lesson address, for example `/t/<token>/assets/app.js`. */
export function lessonRoutePath(token: string, lessonPath = "/"): string {
  const suffix = lessonPath.startsWith("/") ? lessonPath : `/${lessonPath}`;
  return `${LESSON_ROUTE_PREFIX}/${token}${suffix}`;
}

/** Splits a request address into its token and the path below the token route. */
export function splitTokenRoute(requestUrl: string): TokenRoute | null {
  const requestPath = requestUrl.split("?")[0] ?? "/";
  const routeStart = `${LESSON_ROUTE_PREFIX}/`;
  if (!requestPath.startsWith(routeStart)) {
    return null;
  }

  const afterPrefix = requestPath.slice(routeStart.length);
  const separatorIndex = afterPrefix.indexOf("/");

  if (separatorIndex === -1) {
    return afterPrefix.length === 0
      ? null
      : { token: afterPrefix, lessonPath: "/", needsTrailingSlash: true };
  }

  const token = afterPrefix.slice(0, separatorIndex);
  if (token.length === 0) {
    return null;
  }

  return {
    token,
    lessonPath: afterPrefix.slice(separatorIndex),
    needsTrailingSlash: false,
  };
}

/**
 * The address the lesson page's own requests hang off. The page reads this from the
 * address bar, so the token never has to be written into the built files.
 */
export function lessonBasePath(pathname: string): string {
  const route = splitTokenRoute(pathname);
  return route === null ? "/" : lessonRoutePath(route.token);
}
