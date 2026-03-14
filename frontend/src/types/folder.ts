export interface Folder {
  id: string;
  collection_id: string;
  parent_folder_id: string | null;
  name: string;
  created_at: string;
}
