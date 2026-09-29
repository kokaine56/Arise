import { Navigate } from 'react-router-dom';

export function AuthCallbackPage() {
  return <Navigate to="/" replace />;
}

export default AuthCallbackPage;
