export interface TavilyResult {
  title?: string;
  content?: string;
  snippet?: string;
  url?: string;
}

export interface TavilyResponse {
  results?: TavilyResult[];
  answer?: string;
}
