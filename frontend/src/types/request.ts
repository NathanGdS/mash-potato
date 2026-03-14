export interface Request {
  id: string;
  collection_id: string;
  folder_id: string | null;
  name: string;
  method: string;
  url: string;
  headers: string;
  params: string;
  body_type: string;
  body: string;
  auth_type: string;
  auth_config: string;
  timeout_seconds: number;
  tests: string;
  created_at: string;
}
