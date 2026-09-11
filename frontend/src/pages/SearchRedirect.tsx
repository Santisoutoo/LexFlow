import { Navigate, useSearchParams } from 'react-router-dom';

/** Legacy `/search` → Explorer handoff (#50 S17). Preserves `q`, drops `mode`. */
export function SearchRedirect() {
  const [params] = useSearchParams();
  const q = params.get('q');
  if (q) {
    return <Navigate to={`/explorer?${new URLSearchParams({ q }).toString()}`} replace />;
  }
  return <Navigate to="/explorer" replace />;
}
