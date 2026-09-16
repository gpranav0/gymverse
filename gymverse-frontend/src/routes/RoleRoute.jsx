import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const RoleRoute = ({ allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  return user && allowedRoles.includes(user.role) 
    ? <Outlet /> 
    : <div className="flex h-screen items-center justify-center text-red-500 font-bold text-2xl">403 Forbidden</div>;
};
