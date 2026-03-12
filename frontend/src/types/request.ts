export interface Request {
  id: string;
  collection_id: string;
  name: string;
  method: string;
  url: string;
  headers: string;
  params: string;
  body_type: string;
  body: string;
  created_at: string;
}
