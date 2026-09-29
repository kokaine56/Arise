const API_URL = 'http://localhost:5000/api/auth';

export const signUp = async (email: string, password: string) => {
  const res = await fetch(`${API_URL}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  localStorage.setItem('token', data.token);
  return { data, error: null };
};

export const signIn = async (email: string, password: string) => {
  const res = await fetch(`${API_URL}/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  localStorage.setItem('token', data.token);
  return { data, error: null };
};

export const signOut = async () => {
  localStorage.removeItem('token');
  return { error: null };
};

export const getSession = async () => {
  const token = localStorage.getItem('token');
  if (!token) return { data: { session: null }, error: null };
  return { data: { session: { access_token: token } }, error: null };
};
