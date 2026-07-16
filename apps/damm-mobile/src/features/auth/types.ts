export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface UserWithRoles {
  id: string;
  email: string;
  name: string;
  surname: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  roles: string[];
}
