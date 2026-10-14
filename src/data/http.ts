export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, url: string) {
    super(`Request failed (${status}): ${url}`);
    this.name = "HttpError";
    this.status = status;
  }
}

export const getJson = async (url: string, signal?: AbortSignal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new HttpError(response.status, url);
  }
  return (await response.json()) as unknown;
};

export const getText = async (url: string, signal?: AbortSignal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new HttpError(response.status, url);
  }
  return response.text();
};
