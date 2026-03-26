export type { ResolvedRequest } from '../../hooks/useCodeGen';
export { generateCurl } from './curl';
export { generatePythonRequests } from './pythonRequests';
export { generateJsFetch } from './jsFetch';
export { generateJsAxios } from './jsAxios';
export { generateTsFetch } from './tsFetch';
export { generateGoNetHttp } from './goNetHttp';
export { generateJavaHttpClient } from './javaHttpClient';

export const LANGUAGES = [
  'cURL',
  'Python (requests)',
  'JS Fetch',
  'JS Axios',
  'Go (net/http)',
  'TypeScript (fetch)',
  'Java (HttpClient)',
] as const;

export type Language = (typeof LANGUAGES)[number];
